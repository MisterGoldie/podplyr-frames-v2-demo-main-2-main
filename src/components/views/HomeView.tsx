'use client';

import React from 'react';
import { NFTCard } from '../nft/NFTCard';
import type { NFT } from '../../types/user';
import Image from 'next/image';

interface HomeViewProps {
  recentlyPlayedNFTs: NFT[];
  topPlayedNFTs: { nft: NFT; count: number }[];
  onPlayNFT: (nft: NFT) => void;
  currentlyPlaying: string | null;
  isPlaying: boolean;
  handlePlayPause: () => void;
  isLoading?: boolean;
  onReset: () => void;
}

const HomeView: React.FC<HomeViewProps> = ({
  recentlyPlayedNFTs,
  topPlayedNFTs,
  onPlayNFT,
  currentlyPlaying,
  isPlaying,
  handlePlayPause,
  isLoading = false,
  onReset
}) => {
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
      <div className="space-y-8 pt-20">
        {/* Recently Played Section */}
        <section>
          <h2 className="text-2xl font-bold text-green-400 mb-4">Recently Played</h2>
          {recentlyPlayedNFTs.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {recentlyPlayedNFTs.map((nft) => (
                <NFTCard
                  key={`${nft.contract}-${nft.tokenId}`}
                  nft={nft}
                  onPlay={() => onPlayNFT(nft)}
                  isPlaying={isPlaying && currentlyPlaying === `${nft.contract}-${nft.tokenId}`}
                  currentlyPlaying={currentlyPlaying}
                  handlePlayPause={handlePlayPause}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">No recently played tracks</p>
          )}
        </section>

        {/* Top Played Section */}
        <section>
          <h2 className="text-2xl font-bold text-green-400 mb-4">Top Played</h2>
          {topPlayedNFTs.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {topPlayedNFTs.map(({ nft, count }) => (
                <NFTCard
                  key={`${nft.contract}-${nft.tokenId}`}
                  nft={nft}
                  onPlay={() => onPlayNFT(nft)}
                  isPlaying={isPlaying && currentlyPlaying === `${nft.contract}-${nft.tokenId}`}
                  currentlyPlaying={currentlyPlaying}
                  handlePlayPause={handlePlayPause}
                  badge={`${count} plays`}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">No top played tracks yet</p>
          )}
        </section>
      </div>
    </>
  );
};

export default HomeView;