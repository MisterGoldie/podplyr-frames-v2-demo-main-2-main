import type { NFT } from '../types/user';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const processMediaUrl = (url: string | undefined): string => {
  if (!url) return '';

  // Handle IPFS URLs
  if (url.startsWith('ipfs://')) {
    return `https://nftstorage.link/ipfs/${url.slice(7)}`;
  }

  // Handle Arweave URLs
  if (url.startsWith('ar://')) {
    return `https://arweave.net/${url.slice(5)}`;
  }

  // Handle direct Arweave hashes
  if (url.match(/^[a-zA-Z0-9_-]{43}$/)) {
    return `https://arweave.net/${url}`;
  }

  return url;
};

export const fetchUserNFTsFromAlchemy = async (address: string): Promise<NFT[]> => {
  try {
    console.log('Fetching NFTs for address:', address);
    const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    if (!alchemyKey) throw new Error('Alchemy API key not found');

    const response = await fetch(
      `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}/getNFTs?owner=${address}&withMetadata=true`,
      { headers: { accept: 'application/json' } }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Alchemy API error: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Found ${data.ownedNfts?.length || 0} NFTs for address ${address}`);

    interface AlchemyNFT {
      contract: {
        address: string;
        name?: string;
        openSea?: {
          imageUrl?: string;
        };
      };
      tokenId: string;
      title?: string;
      description?: string;
      metadata?: {
        name?: string;
        description?: string;
        image?: string;
        image_url?: string;
        animation_url?: string;
        audio?: string;
        audio_url?: string;
        mimeType?: string;
        mime_type?: string;
        properties?: {
          audio?: string;
          audio_url?: string;
          audio_file?: string;
          image?: string;
          visual?: { url?: string };
          soundContent?: { url?: string };
          mimeType?: string;
        };
        content?: {
          mime?: string;
        };
      };
    }

    // Process NFTs to identify audio content
    const processedNFTs = (data.ownedNfts || []).map((nft: AlchemyNFT) => {
      const audioUrl = processMediaUrl(
        nft.metadata?.animation_url ||
        nft.metadata?.audio ||
        nft.metadata?.audio_url ||
        nft.metadata?.properties?.audio ||
        nft.metadata?.properties?.audio_url ||
        nft.metadata?.properties?.audio_file ||
        nft.metadata?.properties?.soundContent?.url
      );

      const imageUrl = processMediaUrl(
        nft.metadata?.image ||
        nft.metadata?.image_url ||
        nft.metadata?.properties?.image ||
        nft.metadata?.properties?.visual?.url
      );

      // Check if it's a video/animation based on MIME type or file extension
      const mimeType = nft.metadata?.mimeType || 
                      nft.metadata?.mime_type || 
                      nft.metadata?.properties?.mimeType ||
                      nft.metadata?.content?.mime;

      const isVideo = audioUrl && (
        mimeType?.startsWith('video/') ||
        /\.(mp4|webm|mov|m4v)$/i.test(audioUrl)
      );

      const isAnimation = audioUrl && (
        mimeType?.startsWith('model/') ||
        /\.(glb|gltf)$/i.test(audioUrl)
      );

      return {
        contract: nft.contract.address,
        tokenId: nft.tokenId,
        name: nft.metadata?.name || nft.title || `#${nft.tokenId}`,
        description: nft.description || nft.metadata?.description,
        image: imageUrl || '',
        animationUrl: audioUrl || '',
        audio: audioUrl || '',
        hasValidAudio: !!audioUrl,
        isVideo,
        isAnimation,
        collection: {
          image: nft.contract.openSea?.imageUrl,
          name: nft.contract.name || ''
        },
        metadata: nft.metadata
      } as NFT;
    });

    return processedNFTs.filter((nft: NFT) => nft.hasValidAudio);
  } catch (error) {
    console.error(`Error fetching NFTs for address ${address}:`, error);
    return [];
  }
};

export const fetchUserNFTs = async (fid: number): Promise<NFT[]> => {
  try {
    console.log('=== START NFT FETCH ===');

    // Get user profile from Neynar for verified addresses
    const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
    if (!neynarKey) throw new Error('Neynar API key not found');

    console.log('Fetching user profile from Neynar...');
    const profileResponse = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': neynarKey
        }
      }
    );

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      throw new Error(`Failed to fetch user profile: ${errorText}`);
    }

    const profileData = await profileResponse.json();
    let allAddresses: string[] = [];

    // Get verified addresses
    if (profileData.users?.[0]?.verifications) {
      allAddresses = [...profileData.users[0].verifications];
    }

    // Get custody address
    if (profileData.users?.[0]?.custody_address) {
      allAddresses.push(profileData.users[0].custody_address);
    }

    // Filter addresses
    allAddresses = [...new Set(allAddresses)].filter(addr => 
      addr && addr.startsWith('0x') && addr.length === 42
    );

    if (allAddresses.length === 0) {
      throw new Error('No valid addresses found for this user');
    }

    console.log('Found addresses:', allAddresses);

    // Process addresses sequentially instead of in parallel
    const allNFTs: NFT[] = [];
    
    for (let i = 0; i < allAddresses.length; i++) {
      const address = allAddresses[i];
      console.log(`Processing address ${i + 1}/${allAddresses.length}:`, address);
      
      try {
        const nfts = await fetchUserNFTsFromAlchemy(address);
        allNFTs.push(...nfts);
        
        // Add delay between addresses if not the last one
        if (i < allAddresses.length - 1) {
          await delay(2000); // Wait 2 seconds between addresses
        }
      } catch (error) {
        console.error(`Error processing address ${address}:`, error);
      }
    }

    console.log('Total NFTs found:', allNFTs.length);
    return allNFTs;

  } catch (error) {
    console.error('NFT fetch error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      error
    });
    throw error;
  } finally {
    console.log('=== END NFT FETCH ===');
  }
};
