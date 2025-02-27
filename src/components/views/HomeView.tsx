'use client';

import React, { useMemo, useContext } from 'react';
import { NFTCard } from '../nft/NFTCard';
import type { NFT } from '../../types/user';
import Image from 'next/image';
import { useNFTPreloader } from '../../hooks/useNFTPreloader';
import FeaturedSection from '../sections/FeaturedSection';
import { getMediaKey } from '../../utils/media';
import { FarcasterContext } from '../../app/providers';

interface HomeViewProps {
  recentlyPlayedNFTs: NFT[];
  topPlayedNFTs: { nft: NFT; count: number }[];
  onPlayNFT: (nft: NFT, context?: { queue?: NFT[], queueType?: string }) => void;
  currentlyPlaying: string | null;
  isPlaying: boolean;
  handlePlayPause: () => void;
  isLoading?: boolean;
  onReset: () => void;
  onLikeToggle: (nft: NFT) => Promise<void>;
  likedNFTs: NFT[];
}

const HomeView: React.FC<HomeViewProps> = ({
  recentlyPlayedNFTs,
  topPlayedNFTs,
  onPlayNFT,
  currentlyPlaying,
  isPlaying,
  handlePlayPause,
  isLoading = false,
  onReset,
  onLikeToggle,
  likedNFTs
}) => {

  // Initialize featured NFTs once on mount
  React.useEffect(() => {
    const initializeFeaturedNFTs = async () => {
      const { ensureFeaturedNFTsExist } = await import('../../lib/firebase');
      const { FEATURED_NFTS } = await import('../sections/FeaturedSection');
      await ensureFeaturedNFTsExist(FEATURED_NFTS);
    };

    initializeFeaturedNFTs();
  }, []);

  // Combine all NFTs that need preloading
  const allNFTs = useMemo(() => {
    const nfts = [...recentlyPlayedNFTs];
    topPlayedNFTs.forEach(({ nft }) => {
      if (!nfts.some(existing => 
        existing.contract === nft.contract && 
        existing.tokenId === nft.tokenId
      )) {
        nfts.push(nft);
      }
    });
    return nfts;
  }, [recentlyPlayedNFTs, topPlayedNFTs]);

  // Preload all NFT images
  useNFTPreloader(allNFTs);

  // Get user's FID from context
  const { fid: userFid = 0 } = useContext(FarcasterContext);

  const isNFTLiked = (nft: NFT): boolean => {
    const nftMediaKey = getMediaKey(nft);
    return likedNFTs.some(item => getMediaKey(item) === nftMediaKey);
  };
  if (isLoading) {
    return (
      <>
        <header className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-black flex items-center justify-center z-50">
          <button 
            onClick={onReset}
            className="cursor-pointer"
          >
            <Image
              src="/fontlogo.png"
              alt="PODPlayr Logo"
              width={120}
              height={30}
              className="w-[120px] h-[30px]"
              priority={true}
            />
          </button>
        </header>
        <div className="space-y-8 animate-pulse pt-20">
          <section>
            <div className="h-8 w-48 bg-gray-800 rounded mb-4"></div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square bg-gray-800 rounded-lg"></div>
              ))}
            </div>
          </section>
          <section>
            <div className="h-8 w-48 bg-gray-800 rounded mb-4"></div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square bg-gray-800 rounded-lg"></div>
              ))}
            </div>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-black flex items-center justify-center z-50">
        <button 
          onClick={onReset}
          className="cursor-pointer"
        >
            <Image
              src="/fontlogo.png"
              alt="PODPlayr Logo"
              width={120}
              height={30}
              className="logo-image"
              priority={true}
            />
        </button>
      </header>
      <div className="space-y-8 pt-20 pb-32 overflow-y-auto h-screen overscroll-y-contain">
        {/* Recently Played Section */}
        <section>
          {recentlyPlayedNFTs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-mono text-green-400 mb-6">Recently Played</h2>
              <div className="relative">
                <div className="overflow-x-auto pb-4 hide-scrollbar">
                  <div className="flex gap-4">
                    {recentlyPlayedNFTs.map((nft, index) => (
                      <div key={`recently-played-${getMediaKey(nft)}`} className="flex-shrink-0 w-[140px]">
                        <NFTCard
                          nft={nft}
                          onPlay={async (nft) => {
                            await onPlayNFT(nft);
                          }}
                          isPlaying={isPlaying && currentlyPlaying === getMediaKey(nft)}
                          currentlyPlaying={currentlyPlaying}
                          handlePlayPause={handlePlayPause}
                          onLikeToggle={() => onLikeToggle(nft)}
                          userFid={userFid}
                        />
                        <h3 className="font-mono text-white text-sm truncate mt-3">{nft.name}</h3>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Top Played Section */}
        <section>
          {topPlayedNFTs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-mono text-green-400 mb-6">Top Played</h2>
              <div className="relative">
                <div className="overflow-x-auto pb-4 hide-scrollbar">
                  <div className="flex gap-6">
                    {topPlayedNFTs.map(({ nft, count }, index) => (
                      <div key={`top-played-${getMediaKey(nft)}`} className="flex-shrink-0 w-[200px]">
                        <NFTCard
                          nft={nft}
                          onPlay={async (nft) => {
                            await onPlayNFT(nft);
                          }}
                          isPlaying={isPlaying && currentlyPlaying === getMediaKey(nft)}
                          currentlyPlaying={currentlyPlaying}
                          handlePlayPause={handlePlayPause}
                          onLikeToggle={() => onLikeToggle(nft)}
                          userFid={userFid}
                          playCountBadge={`${count} plays`}
                        />
                        <h3 className="font-mono text-white text-sm truncate mt-3">{nft.name}</h3>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Featured Section */}
        <section>
          <FeaturedSection
            onPlayNFT={onPlayNFT}
            handlePlayPause={handlePlayPause}
            currentlyPlaying={currentlyPlaying}
            isPlaying={isPlaying}
            onLikeToggle={onLikeToggle}
            isNFTLiked={isNFTLiked}
          />
        </section>
      </div>
    </>
  );
};

export default HomeView;