'use client';

import React from 'react';
import { NFTImage } from '../media/NFTImage';
import type { NFT } from '../../types/user';

// Hardcoded featured NFTs
const FEATURED_NFTS: NFT[] = [
  {
    name: 'Seasoning with Sazón - COD Zombies Terminus EP1',
    image: 'https://arweave.net/RvFQ8lrX3vRnnbbeA7eBoOvVsW5zOeqPXGOtZY_FXbw',
    contract: '0x27430c3ef4b04f7d223df7f280ae8fc0b3a407b7',
    tokenId: '50dc9fb449e0',
    audio: 'https://arweave.net/noYvGupxQyo2P7C2GMNNUseml29HEN6HLyvXOBD7jYQ',
    metadata: {
      animation_url: 'https://arweave.net/noYvGupxQyo2P7C2GMNNUseml29HEN6HLyvXOBD7jYQ'
    }
  },
  {
    name: 'NEON NIGHTS ft Jadyn Violet #5',
    image: 'https://arweave.net/EGQzuCvDtPVzuKVOJpu4gt2eh642PyOdrk5m2S1iAYw',
    contract: '0x260944f3c90c982801dd0caca58314bf0007ebda',
    tokenId: '2ecfda1dbf54',
    audio: 'https://arweave.net/kTdSRwNVqTcFBGJ3uqhApAiZMhBOu71UNnoOax-C6YM',
    metadata: {
      animation_url: 'https://arweave.net/kTdSRwNVqTcFBGJ3uqhApAiZMhBOu71UNnoOax-C6YM'
    }
  },
  {
    name: 'Isolation(2020)',
    image: 'https://nftstorage.link/ipfs/bafybeibjen3vz5bbw7e3u5sj3x65dyg3k5bqznrmq4ctylvxadkazgnkli',
    contract: '0x79428737e60a8a8db494229638eaa5e52874b6fb',
    tokenId: '0x79428737e6',
    audio: 'https://nftstorage.link/ipfs/bafybeibops7cqqf5ssqvueexmsyyrf6q4x6jbeaicymrnnzbg7dx34k2jq',
    metadata: {
      animation_url: 'https://nftstorage.link/ipfs/bafybeibops7cqqf5ssqvueexmsyyrf6q4x6jbeaicymrnnzbg7dx34k2jq'
    }
  }
];

interface FeaturedSectionProps {
  onPlayNFT: (nft: NFT) => void;
  handlePlayPause: () => void;
  currentlyPlaying: string | null;
  isPlaying: boolean;
  onLikeToggle: (nft: NFT) => Promise<void>;
  isNFTLiked: (nft: NFT) => boolean;
}

const FeaturedSection: React.FC<FeaturedSectionProps> = ({
  onPlayNFT,
  handlePlayPause,
  currentlyPlaying,
  isPlaying,
  onLikeToggle,
  isNFTLiked
}) => {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-mono text-green-400 mb-2 px-2">Featured</h2>
      <div className="relative">
        <div className="overflow-x-auto pb-4 hide-scrollbar">
          <div className="flex gap-4 px-2">
            {FEATURED_NFTS.map((nft) => (
              <div key={`${nft.contract}-${nft.tokenId}`} className="flex-shrink-0 w-[160px] group">
                <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800/20">
                  <NFTImage
                    src={nft.image}
                    alt={nft.name}
                    className="w-full h-full object-cover"
                    width={160}
                    height={160}
                    priority={true}
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  <button 
                    onClick={() => onPlayNFT(nft)}
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
                  src={nft.metadata?.animation_url}
                  className="hidden"
                  preload="none"
                />
                <audio
                  id={`audio-${nft.contract}-${nft.tokenId}`}
                  src={nft.audio}
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
