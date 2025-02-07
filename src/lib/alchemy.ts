import { Alchemy, Network } from 'alchemy-sdk';
import type { NFT } from '../types/user';

const config = {
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  network: Network.BASE_MAINNET,
};

export const alchemy = new Alchemy(config);

export const fetchUserNFTsFromAlchemy = async (address: string): Promise<NFT[]> => {
  try {
    const response = await alchemy.nft.getNftsForOwner(address);
    return response.ownedNfts.map(nft => {
      // Check for audio in metadata
      const metadata = nft.raw?.metadata || {};
      const hasAudio = typeof metadata.animation_url === 'string' && 
        (metadata.animation_url.endsWith('.mp3') || 
         metadata.animation_url.endsWith('.wav') ||
         metadata.animation_url.endsWith('.m4a'));

      return {
        contract: nft.contract.address,
        tokenId: nft.tokenId,
        name: nft.raw?.metadata?.name || 'Untitled',
        description: nft.raw?.metadata?.description || '',
        image: (nft.raw?.metadata?.image as string) || '',
        audio: hasAudio ? (metadata.animation_url as string) : '',
        metadata: metadata,
        collection: {
          name: nft.contract.name || '',
          image: nft.raw?.metadata?.image || ''
        },
        network: 'base' as const,
        hasValidAudio: hasAudio
      };
    });
  } catch (error) {
    console.error('Error fetching NFTs from Alchemy:', error);
    return [];
  }
};