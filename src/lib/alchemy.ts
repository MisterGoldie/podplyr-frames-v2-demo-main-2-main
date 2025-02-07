import { Alchemy, Network, Nft, NftTokenType } from 'alchemy-sdk';
import type { NFT, NFTFile, NFTMetadata } from '../types/user';

const config = {
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  network: Network.BASE_MAINNET,
};

export const alchemy = new Alchemy(config);

// Batch size for NFT fetching to avoid rate limits
const BATCH_SIZE = 100;

const processMediaUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${url.slice(7)}`;
  }
  return url;
};

const isMediaNFT = (metadata: NFTMetadata): { hasAudio: boolean; isVideo: boolean; isAnimation: boolean } => {
  // Common media extensions and content types
  const audioPatterns = [
    /\.(mp3|wav|m4a|aac|ogg)$/i,
    /audio\//i,
    /soundcloud\.com/i,
    /spotify\.com/i,
    /^ar:\/\//i,  // Arweave protocol
    /arweave\.net/i,
    /ipfs/i  // Many audio NFTs are stored on IPFS
  ];
  
  const videoPatterns = [
    /\.(mp4|webm|mov|m4v)$/i,
    /video\//i,
    /youtube\.com/i,
    /vimeo\.com/i
  ];
  
  const animationPatterns = [
    /\.(glb|gltf)$/i,
    /model\//i,
    /animation/i
  ];

  // Function to check if a URL matches any pattern
  const matchesPatterns = (url: string, patterns: RegExp[]) => 
    patterns.some(pattern => pattern.test(url));

  // Function to check if metadata indicates this is a media NFT
  const hasMediaIndicators = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    
    // Check common media-related property names
    const mediaProps = [
      'audio', 'music', 'sound', 'media', 'track', 'song',
      'video', 'animation', 'movie', 'clip'
    ];
    
    return Object.keys(obj).some(key => 
      mediaProps.some(prop => key.toLowerCase().includes(prop))
    );
  };

  // Collect all possible media URLs and sources
  const allUrls = [
    metadata.animation_url,
    metadata.audio,
    metadata.audio_url,
    metadata.uri,
    metadata.properties?.audio,
    metadata.properties?.audio_url,
    metadata.properties?.audio_file,
    metadata.properties?.soundContent?.url,
    metadata.properties?.animation_url,
    metadata.properties?.video,
    metadata.properties?.uri,
    ...(metadata.properties?.files?.map(f => f.uri || f.url) || [])
  ].filter(Boolean) as string[];

  // Check mimeTypes and content types
  const mimeTypes = [
    metadata.mimeType,
    metadata.mime_type,
    metadata.properties?.mimeType,
    metadata.content?.mime,
    ...(metadata.properties?.files?.map(f => f.type || f.mimeType) || [])
  ].filter(Boolean) as string[];

  // Check for media in attributes
  const hasMediaAttributes = metadata.attributes?.some(attr => 
    attr.trait_type?.toLowerCase().includes('audio') ||
    attr.trait_type?.toLowerCase().includes('video') ||
    attr.trait_type?.toLowerCase().includes('media') ||
    (typeof attr.value === 'string' && (
      attr.value.toLowerCase().includes('audio') ||
      attr.value.toLowerCase().includes('video') ||
      attr.value.toLowerCase().includes('media')
    ))
  );

  // Check for media indicators in any metadata properties
  const hasMetadataIndicators = hasMediaIndicators(metadata) || 
                               hasMediaIndicators(metadata.properties);

  const hasAudio = allUrls.some(url => matchesPatterns(url, audioPatterns)) ||
                  mimeTypes.some(type => type?.includes('audio')) ||
                  hasMediaAttributes ||
                  hasMetadataIndicators;

  const isVideo = allUrls.some(url => matchesPatterns(url, videoPatterns)) ||
                 mimeTypes.some(type => type?.includes('video'));

  const isAnimation = allUrls.some(url => matchesPatterns(url, animationPatterns)) ||
                     mimeTypes.some(type => type?.includes('model')) ||
                     metadata.animation_details?.format === 'gltf' ||
                     metadata.animation_details?.format === 'glb';

  // Log detection results for debugging
  if (hasAudio || isVideo || isAnimation) {
    console.log('Media NFT detected:', {
      name: metadata.name,
      urls: allUrls,
      mimeTypes,
      hasMediaAttributes,
      hasMetadataIndicators,
      hasAudio,
      isVideo,
      isAnimation
    });
  }

  return { hasAudio, isVideo, isAnimation };
};

export const fetchUserNFTsFromAlchemy = async (address: string): Promise<NFT[]> => {
  try {
    console.log('=== START NFT FETCH ===');
    console.log('Fetching NFTs for address:', address);
    
    // First get the list of NFTs
    const response = await alchemy.nft.getNftsForOwner(address);
    console.log('Found NFTs:', response.totalCount);

    // Then fetch full metadata for each NFT
    const nftPromises = response.ownedNfts.map(async (nft: Nft) => {
      try {
        const metadata = await alchemy.nft.getNftMetadata(
          nft.contract.address,
          nft.tokenId
        );

        // Check for audio/video in animation_url
        const animationUrl = metadata.raw.metadata?.animation_url || '';
        
        // Check if it's audio by extension
        const isAudio = /\.(mp3|wav|m4a)$/i.test(animationUrl);
        
        // Check if it's video by extension
        const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(animationUrl);
        
        // Check if it's 3D model
        const isAnimation = /\.(glb|gltf)$/i.test(animationUrl);

        // Only include if it has media
        if (!isAudio && !isVideo && !isAnimation) {
          return null;
        }

        console.log('Found media NFT:', {
          contract: metadata.contract.address,
          tokenId: metadata.tokenId,
          name: metadata.name || metadata.tokenId,
          animationUrl,
          isAudio,
          isVideo,
          isAnimation
        });

        return {
          contract: metadata.contract.address,
          tokenId: metadata.tokenId,
          name: metadata.name || `#${metadata.tokenId}`,
          description: metadata.description || '',
          image: metadata.raw.metadata?.image || '',
          audio: isAudio ? animationUrl : '',
          animationUrl: isVideo ? animationUrl : undefined,
          hasValidAudio: isAudio,
          isVideo,
          isAnimation,
          metadata: metadata.raw.metadata,
          network: 'base' as const
        } as NFT;

      } catch (error) {
        console.error('Error fetching NFT metadata:', error);
        return null;
      }
    });

    const nfts = (await Promise.all(nftPromises)).filter(Boolean) as NFT[];

    console.log('Final NFT count:', {
      total: nfts.length,
      withAudio: nfts.filter(nft => nft.hasValidAudio).length,
      withVideo: nfts.filter(nft => nft.isVideo).length,
      withAnimation: nfts.filter(nft => nft.isAnimation).length
    });

    return nfts;

  } catch (error) {
    console.error('Error fetching NFTs from Alchemy:', error);
    return [];
  }
};