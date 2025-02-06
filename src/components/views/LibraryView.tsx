'use client';

import React, { useState } from 'react';
import { NFTCard } from '../nft/NFTCard';
import type { NFT } from '../../types/user';
import Image from 'next/image';

interface LibraryViewProps {
  likedNFTs: NFT[];
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayAudio: (nft: NFT) => Promise<void>;
  handlePlayPause: () => void;
  onReset: () => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({
  likedNFTs,
  handlePlayAudio,
  currentlyPlaying,
  isPlaying,
  handlePlayPause,
  onReset,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-black flex items-center justify-center z-50">
        <button onClick={onReset} className="cursor-pointer">
          <Image
            src="/fontlogo.png"
            alt="PODPlayr Logo"
            width={120}
            height={30}
            priority={true}
          />
        </button>
      </header>
      <div className="space-y-8 pt-20">
        {likedNFTs.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-xl text-green-400 mb-2">Your Library is Empty</h3>
            <p className="text-gray-400">
              Like some music NFTs to add them to your library.
            </p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-green-400">Your Library</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${
                    viewMode === 'grid' ? 'bg-green-400 text-black' : 'text-gray-400'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520ZM200-600h160v-160H200v160Zm400 0h160v-160H600v160Zm0 400h160v-160H600v160Zm-400 0h160v-160H200v160Z"/>
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${
                    viewMode === 'list' ? 'bg-green-400 text-black' : 'text-gray-400'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-4'}>
              {likedNFTs.map((nft) => (
                <NFTCard
                  key={`${nft.contract}-${nft.tokenId}`}
                  nft={nft}
                  onPlay={() => handlePlayAudio(nft)}
                  isPlaying={isPlaying && currentlyPlaying === `${nft.contract}-${nft.tokenId}`}
                  currentlyPlaying={currentlyPlaying}
                  handlePlayPause={handlePlayPause}
                  viewMode={viewMode}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default LibraryView;