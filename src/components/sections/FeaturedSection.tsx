'use client';

import React from 'react';
import { NFTImage } from '../media/NFTImage';
import type { NFT } from '../../types/user';
import { IPFS_GATEWAYS, extractIPFSHash, processMediaUrl } from '../../utils/media';

// Hardcoded featured NFTs
export const FEATURED_NFTS: NFT[] = [
  {
    name: 'Seasoning with Sazón - COD Zombies Terminus EP1',
    image: 'https://arweave.net/HvZ4oE2mDf6G1o1rX9Y_lkqegYA_0ZsRyY1JxQpL2v0',
    contract: '0x27430c3ef4b04f7d223df7f280ae8fc0b3a407b7',
    tokenId: '50dc9fb449e0', // Already in correct format
    audio: 'https://arweave.net/noYvGupxQyo2P7C2GMNNUseml29HEN6HLyvXOBD7jYQ',
    metadata: {
      animation_url: 'https://arweave.net/noYvGupxQyo2P7C2GMNNUseml29HEN6HLyvXOBD7jYQ',
      description: 'Seasoning with Sazón, Call of Duty Black Ops 6 - Zombies - Terminus Episode 1 of 5',
      attributes: [
        {"trait_type":"Game","value":"Call of Duty Black Ops 6"},
        {"trait_type":"Map","value":"Terminus"}
      ]
    }
  },
  {
    name: 'I Found It (Artist Token)',
    image: 'https://arweave.net/Wvad7CgtidFMH3mOBjRHOeV5_bKvvAR9zZH2BhQSl7M',
    contract: '0x27430c3ef4b04f7d223df7f280ae8fc0b3a407b7',
    tokenId: '50dc9fb449e1',
    audio: 'https://arweave.net/qsVEbTD0FUZ8VebK4yxOrKWDQtW8BpNWj7o46HzKsV8',
    metadata: {
      animation_url: 'https://arweave.net/qsVEbTD0FUZ8VebK4yxOrKWDQtW8BpNWj7o46HzKsV8',
      description: '',
      attributes: [
        {"trait_type":"Director","value":"Charles Fox"}
      ]
    }
  },
  {
    name: 'Isolation(2020)',
    image: 'https://nftstorage.link/ipfs/bafybeibjen3vz5bbw7e3u5sj3x65dyg3k5bqznrmq4ctylvxadkazgnkli',
    contract: '0x79428737e60a8a8db494229638eaa5e52874b6fb',
    tokenId: '79428737e6', // Removed 0x prefix
    audio: 'https://nftstorage.link/ipfs/bafybeibops7cqqf5ssqvueexmsyyrf6q4x6jbeaicymrnnzbg7dx34k2jq',
    metadata: {
      animation_url: 'https://nftstorage.link/ipfs/bafybeibops7cqqf5ssqvueexmsyyrf6q4x6jbeaicymrnnzbg7dx34k2jq',
      description: 'A musical journey through isolation in 2020',
      attributes: [
        {"trait_type":"Genre","value":"Electronic"},
        {"trait_type":"Year","value":"2020"}
      ]
    }
  }
];

interface FeaturedSectionProps {
  onPlayNFT: (nft: NFT, context?: { queue?: NFT[], queueType?: string }) => void;
  handlePlayPause: () => void;
  currentlyPlaying: string | null;
  isPlaying: boolean;
  onLikeToggle: (nft: NFT) => Promise<void>;
  isNFTLiked: (nft: NFT) => boolean;
}

const preloadAudio = async (url: string, nftName: string): Promise<void> => {
  const ipfsHash = extractIPFSHash(url);
  const urlsToTry = ipfsHash 
    ? IPFS_GATEWAYS.map(gateway => `${gateway}${ipfsHash}`) // Try all IPFS gateways if it's an IPFS URL
    : [url]; // Otherwise just try the original URL

  let lastError: Error | null = null;

  // Try each URL until one works
  for (const currentUrl of urlsToTry) {
    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      
      const loadPromise = new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', () => resolve(true), { once: true });
        audio.addEventListener('error', (e) => {
          const error = e as ErrorEvent;
          if (error.target instanceof HTMLAudioElement) {
            switch (error.target.error?.code) {
              case MediaError.MEDIA_ERR_ABORTED:
                reject(new Error('Audio loading aborted'));
                break;
              case MediaError.MEDIA_ERR_NETWORK:
                reject(new Error('Network error while loading audio'));
                break;
              case MediaError.MEDIA_ERR_DECODE:
                reject(new Error('Audio decode error'));
                break;
              case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                reject(new Error('Audio format not supported'));
                break;
              default:
                reject(new Error('Unknown audio loading error'));
            }
          } else {
            reject(error);
          }
        }, { once: true });
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Audio preload timeout')), 15000); // 15 second timeout per gateway
      });

      audio.src = currentUrl;
      audio.load();
      
      await Promise.race([loadPromise, timeoutPromise]);
      console.log(`✅ Featured NFT preloaded successfully: ${nftName} using ${currentUrl}`);
      return; // Success! Exit the function
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`⚠️ Failed to preload "${nftName}" using ${currentUrl}: ${lastError.message}. Trying next gateway...`);
    }
  }

  // If we get here, all attempts failed
  console.warn(`⚠️ Could not preload "${nftName}" using any gateway: ${lastError?.message}. Playback will still be attempted when needed.`);
};

const FeaturedSection: React.FC<FeaturedSectionProps> = ({
  onPlayNFT,
  handlePlayPause,
  currentlyPlaying,
  isPlaying,
  onLikeToggle,
  isNFTLiked
}) => {
  // Preload featured NFTs audio
  React.useEffect(() => {
    const preloadFeaturedContent = async () => {
      console.log('🎵 Starting to preload featured NFTs...');
      // Load all featured NFTs in parallel
      await Promise.all(
        FEATURED_NFTS.map(nft => {
          const audioUrl = nft.audio || nft.metadata?.animation_url;
          if (audioUrl) {
            return preloadAudio(audioUrl, nft.name);
          }
          return Promise.resolve();
        })
      );
      console.log('✨ All featured NFTs preloaded!');
    };

    preloadFeaturedContent();
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div className="mb-8">
      <h2 className="text-xl font-mono text-green-400 mb-6">Featured</h2>
      <div className="relative">
        <div className="overflow-x-auto pb-4 hide-scrollbar">
          <div className="flex gap-6">
            {FEATURED_NFTS.map((nft) => (
              <div key={`${nft.contract}-${nft.tokenId}`} className="flex-shrink-0 w-[200px] group">
                <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800/20">
                  <NFTImage
                    src={nft.image}
                    alt={nft.name}
                    className="w-full h-full object-cover"
                    width={200}
                    height={200}
                    priority={true}
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  <button 
                    onClick={() => onPlayNFT(nft, { 
                      queue: FEATURED_NFTS,
                      queueType: 'featured'
                    })}
                    className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-purple-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-105 transform"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                      <path d="M320-200v-560l440 280-440 280Z"/>
                    </svg>
                  </button>
                  <button 
                    onClick={() => onLikeToggle(nft)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center transition-all duration-200 hover:scale-110 z-10"
                  >
                    {isNFTLiked(nft) ? (
                      <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-red-500">
                        <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-white hover:text-red-500">
                        <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                      </svg>
                    )}
                  </button>
                </div>
                <h3 className="font-mono text-white text-sm truncate mb-1">{nft.name}</h3>
                <video
                  id={`video-${nft.contract}-${nft.tokenId}`}
                  src={nft.metadata?.animation_url ? processMediaUrl(nft.metadata.animation_url) : undefined}
                  className="hidden"
                  preload="none"
                  playsInline
                  muted
                  loop
                />
                <audio
                  id={`audio-${nft.contract}-${nft.tokenId}`}
                  src={nft.audio ? processMediaUrl(nft.audio) : undefined}
                  preload="none"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturedSection;
