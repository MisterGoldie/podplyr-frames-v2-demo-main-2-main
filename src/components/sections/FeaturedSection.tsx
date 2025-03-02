'use client';

import React, { useState, useEffect } from 'react';
import { NFTImage } from '../media/NFTImage';
import type { NFT } from '../../types/user';
import { getMediaKey, extractIPFSHash, IPFS_GATEWAYS, processMediaUrl } from '../../utils/media';
import { preloadAudio } from '../../utils/audioPreloader';

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
      description: 'Seasoning with Sazón, Call of Duty Black Ops 6 - Zombies - Terminus Episode 1 of 5 | @themrsazon',
      attributes: [
        {"trait_type":"Game","value":"Call of Duty Black Ops 6"},
        {"trait_type":"Map","value":"Terminus"}
      ]
    }
  },
  {
    name: 'I Found It',
    image: 'https://arweave.net/Wvad7CgtidFMH3mOBjRHOeV5_bKvvAR9zZH2BhQSl7M',
    contract: '0x27430c3ef4b04f7d223df7f280ae8fc0b3a407b7',
    tokenId: '50dc9fb449e1',
    audio: 'https://arweave.net/qsVEbTD0FUZ8VebK4yxOrKWDQtW8BpNWj7o46HzKsV8',
    metadata: {
      animation_url: 'https://arweave.net/qsVEbTD0FUZ8VebK4yxOrKWDQtW8BpNWj7o46HzKsV8',
      description: 'A Charles Fox Film (ACYL)',
      attributes: [
        {"trait_type":"Director","value":"Charles Fox"}
      ]
    }
  },
  {
    name: 'ACYL RADIO - WILL01',
    image: 'https://arweave.net/Ajm6DFaUe6HCLF_RtAmj3Ot1sfT2KVO-fk1PVn1Bk2A', 
    contract: '0x79428737e60a8a8db494229638eaa5e52874b6fb',
    tokenId: '79428737e6',
    audio: 'https://arweave.net/FXMkBkgV79p3QIL8589uh68-sKuXbmuBzQwvWH10v74',
    metadata: {
      animation_url: 'https://arweave.net/FXMkBkgV79p3QIL8589uh68-sKuXbmuBzQwvWH10v74',
      description: 'Episode 1 from the founder of ACYL | @willcreatesart',
      attributes: [
        {"trait_type":"Host","value":"WiLL"}
      ]
    }
  },
  {
    name: 'ACYL RADIO - Hidden Tales',
    image: 'https://arweave.net/D_nK5rGNB3XOBkouOIaZWyDHXL4TJ6ptkbtjAUatY2E', 
    contract: '0x79428737e60a8a8db494229638eaa5e52874b6fb',
    tokenId: '79428737e7',
    audio: 'https://arweave.net/Hr4GVDpKhq_dgZZA5SBAEapx9IJ1qDnDZ-Y40lExBHk',
    metadata: {
      animation_url: 'https://agoxezbhxilfttm6q4ojfdgiokuictgjt6vng5f4pxutjqg7sgza.arweave.net/AZ1yZCe6FlnNnocckozIcqiBTMmfqtN0vH3pNMDfkbI',
      description: 'Ann Marie Alanes | @annmariealanes',
      attributes: [
        {"trait_type":"Host","value":"Ann Marie Alanes"}
      ]
    }
  },
  {
    name: 'ACYL RADIO - Chili Sounds 🌶️',
    image: 'https://arweave.net/dQT3NOU6RFa_F0SXD0ajejif4ysPOUeQjKmFHINnUis',
    contract: '0x79428737e60a8a8db494229638eaa5e52874b6fb', // Using same contract as other ACYL RADIO NFTs
    tokenId: '79428737e8', // Incremented from previous ACYL RADIO NFT
    audio: 'https://arweave.net/GujXDFCEk4FmJl9b_TlofLEmx_YnY_LRSB2aSY8AcRg',
    metadata: {
      animation_url: 'https://arweave.net/GujXDFCEk4FmJl9b_TlofLEmx_YnY_LRSB2aSY8AcRg',
      description: 'ACYL RADIO - Chili Sounds | @themrsazon',
      attributes: [
        {"trait_type":"Host","value":"Mr. Sazon"}
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
  userFid?: string;
}

const FeaturedSection: React.FC<FeaturedSectionProps> = ({
  onPlayNFT,
  handlePlayPause,
  currentlyPlaying,
  isPlaying,
  onLikeToggle,
  isNFTLiked,
  userFid
}) => {
  // Preloading state
  const [preloaded, setPreloaded] = useState(false); // Set to false to enable preloading

  // Disable preloading for now to fix the error
  useEffect(() => {
    if (preloaded) return;

    const preloadFeaturedContent = async () => {
      console.log('🎵 Starting to preload featured NFTs...');
      
      try {
        // Load featured NFTs one by one to avoid overwhelming the browser
        // This is more reliable than trying to load them all in parallel
        for (const nft of FEATURED_NFTS) {
          try {
            await preloadAudio(nft, 'high');
          } catch (error) {
            // Log but continue with next NFT
            console.warn(`Failed to preload NFT ${nft.name || nft.tokenId}:`, error);
          }
        }
        console.log('✨ All featured NFTs preloaded!');
        setPreloaded(true);
      } catch (error) {
        console.warn('Failed to preload some featured NFTs:', error);
        // Still mark as preloaded to avoid repeated attempts
        setPreloaded(true);
      }
    };

    preloadFeaturedContent();
  }, [preloaded]); // Only run if not yet preloaded

  return (
    <div className="mb-8">
      <h2 className="text-xl font-mono text-green-400 mb-6">Featured</h2>
      <div className="relative">
        <div className="overflow-x-auto pb-4 hide-scrollbar">
          <div className="flex gap-6">
            {FEATURED_NFTS.map((nft, index) => {
              // Generate a guaranteed unique key that doesn't rely on media content
              const uniqueKey = nft.contract && nft.tokenId 
                ? `featured-${nft.contract}-${nft.tokenId}-${index}` 
                : `featured-${index}-${Math.random().toString(36).substr(2, 9)}`;
              
              return (
                <div key={uniqueKey} className="flex-shrink-0 w-[200px] group">
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800/20 shadow-purple-500/20 shadow-lg transition-all">
                    {/* Special handling for GIF images */}
                    {(nft.name === 'ACYL RADIO - Hidden Tales' || nft.name === 'ACYL RADIO - WILL01' || nft.name === 'ACYL RADIO - Chili Sounds 🌶️') ? (
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="w-full h-full object-cover"
                        width={200}
                        height={200}
                        style={{ maxWidth: '200px', maxHeight: '200px' }}
                      />
                    ) : (
                      <NFTImage
                        src={nft.image}
                        alt={nft.name}
                        className="w-full h-full object-cover"
                        width={200}
                        height={200}
                        priority={true}
                      />
                    )}
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
                    {/* Only show like button if userFid exists AND is a valid number greater than 0 */}
                    {userFid && parseInt(String(userFid)) > 0 && onLikeToggle && (
                      <button 
                        onClick={() => onLikeToggle(nft)}
                        className="absolute top-2 right-2 text-red-500 transition-all duration-200 hover:scale-125 z-10"
                      >
                        {isNFTLiked(nft) ? (
                          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                            <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" className="text-white hover:text-red-500">
                            <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                          </svg>
                        )}
                      </button>
                    )}
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturedSection;
