'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NFTCard } from '../nft/NFTCard';
import { NFTImage } from '../media/NFTImage';
import { getMediaKey } from '~/utils/media';
import type { NFT, UserContext } from '../../types/user';
import Image from 'next/image';
import { getLikedNFTs, addLikedNFT, removeLikedNFT } from '../../lib/firebase';

interface LibraryViewProps {
  likedNFTs: NFT[];
  isPlaying: boolean;
  currentlyPlaying: string | null;
  currentPlayingNFT: NFT | null;
  handlePlayAudio: (nft: NFT) => Promise<void>;
  handlePlayPause: () => void;
  onReset: () => void;
  userContext: UserContext;
  setIsLiked: (isLiked: boolean) => void;
  setIsPlayerVisible: (visible: boolean) => void;
  setIsPlayerMinimized: (minimized: boolean) => void;
  onLikeToggle: (nft: NFT) => Promise<void>;
}

const LibraryView: React.FC<LibraryViewProps> = ({
  likedNFTs: initialLikedNFTs,
  handlePlayAudio,
  currentlyPlaying,
  currentPlayingNFT,
  isPlaying,
  handlePlayPause,
  onReset,
  userContext,
  setIsLiked,
  setIsPlayerVisible,
  setIsPlayerMinimized,
  onLikeToggle
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [filterSort, setFilterSort] = useState<'recent' | 'name'>('recent');
  const [searchFilter, setSearchFilter] = useState('');
  const [likedNFTs, setLikedNFTs] = useState<NFT[]>(initialLikedNFTs);


  // Load liked NFTs when user changes
  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (userContext?.user?.fid) {
        try {
          console.log('Loading liked NFTs for user:', userContext.user.fid);
          const liked = await getLikedNFTs(userContext.user.fid);
          console.log('Loaded liked NFTs:', liked);
          setLikedNFTs(liked);
        } catch (error) {
          console.error('Error loading liked NFTs:', error);
        }
      }
    };

    loadLikedNFTs();
  }, [userContext?.user?.fid]);

  // Helper function to check if NFT is liked
  const isNFTLiked = useCallback((nft: NFT) => {
    const nftMediaKey = getMediaKey(nft);
    return likedNFTs.some(likedNFT => getMediaKey(likedNFT) === nftMediaKey);
  }, [likedNFTs]);

  // Handle like/unlike NFT
  const handleLikeToggle = async (nft: NFT) => {
    if (!userContext?.user?.fid) {
      console.log('No user logged in');
      return;
    }

    try {
      const isCurrentlyLiked = isNFTLiked(nft);
      console.log('Toggling like for NFT:', {
        contract: nft.contract,
        tokenId: nft.tokenId,
        currentlyLiked: isCurrentlyLiked
      });

      if (isCurrentlyLiked) {
        // Remove from likes
        await removeLikedNFT(userContext.user.fid, nft);
        setLikedNFTs(prev => prev.filter(
          likedNFT => 
            !(likedNFT.contract.toLowerCase() === nft.contract.toLowerCase() && 
              likedNFT.tokenId === nft.tokenId)
        ));
        console.log('NFT removed from likes');
      } else {
        // Add to likes
        await addLikedNFT(userContext.user.fid, nft);
        // Let the useEffect handle updating the state
        console.log('NFT added to likes');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  // Update liked status for currently playing NFT
  useEffect(() => {
    if (currentPlayingNFT && userContext?.user?.fid) {
      const currentMediaKey = getMediaKey(currentPlayingNFT);
      const isNFTLiked = likedNFTs.some(nft => getMediaKey(nft) === currentMediaKey);
      setIsLiked(isNFTLiked);
    }
  }, [currentPlayingNFT, likedNFTs, userContext?.user?.fid, setIsLiked]);

  // Deduplicate NFTs based on mediaKey
  const uniqueNFTs = likedNFTs.reduce((acc: NFT[], current) => {
    const currentMediaKey = getMediaKey(current);
    const isDuplicate = acc.some(nft => getMediaKey(nft) === currentMediaKey);
    if (!isDuplicate) {
      acc.push(current);
    }
    return acc;
  }, []);

  const filteredNFTs = uniqueNFTs
    .filter(nft => 
      nft.name.toLowerCase().includes(searchFilter.toLowerCase())
    )
    .sort((a, b) => {
      switch (filterSort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
          return -1; // Keep most recent first
        default:
          return 0;
      }
    });

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-black flex items-center justify-center z-50">
        <button onClick={onReset} className="cursor-pointer">
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

      <div 
        className="space-y-8 pt-20 pb-12 min-h-screen overflow-y-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
          height: 'calc(100vh - 4rem)', // Subtract header height
          overscrollBehavior: 'none',
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0'
        }}
      >
        {/* Header and Filters */}
        <div className="flex justify-between items-center px-4">
          <div>
            <h2 className="text-base font-semibold text-purple-400">Your Library</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{uniqueNFTs.length} NFTs</p>
          </div>
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${
                  viewMode === 'grid' ? 'bg-purple-400 text-black' : 'text-gray-400'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                  <path d="M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520ZM200-600h160v-160H200v160Zm400 0h160v-160H600v160Zm0 400h160v-160H600v160Zm-400 0h160v-160H200v160Z"/>
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${
                  viewMode === 'list' ? 'bg-purple-400 text-black' : 'text-gray-400'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                  <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z"/>
                </svg>
              </button>
            </div>

            {/* Sort Options */}
            <select
              value={filterSort}
              onChange={(e) => setFilterSort(e.target.value as typeof filterSort)}
              className="bg-gray-800/50 text-purple-400 rounded-lg px-3 py-2 font-mono text-sm border border-purple-400/20 focus:outline-none focus:border-purple-400"
            >
              <option value="recent">Recently Added</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* Search Filter */}
        <div className="relative px-4">
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter NFTs..."
            className="w-full px-4 py-3 bg-gray-800/50 border border-purple-400/20 rounded-lg text-purple-400 placeholder-purple-400/50 focus:outline-none focus:border-purple-400 font-mono text-sm"
          />
          <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" 
            className="absolute right-8 top-1/2 transform -translate-y-1/2 text-purple-400/50">
            <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
          </svg>
        </div>

        {/* Content */}
        {likedNFTs.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-xl text-purple-400 mb-2">Your Library is Empty</h3>
            <p className="text-gray-400">
              {!userContext?.user?.fid
                ? 'Must be on Farcaster to add to your library'
                : 'Like some media NFTs to add them to your library.'
              }
            </p>
          </div>
        ) : (
          <div 
            className={`px-4 pb-48 ${viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-4'}`}
          >
            {filteredNFTs.map((nft) => (
              viewMode === 'grid' ? (
                <NFTCard
                  key={getMediaKey(nft)}
                  nft={nft}
                  onPlay={async (nft) => {
                    await handlePlayAudio(nft);
                  }}
                  isPlaying={isPlaying && currentlyPlaying === `${nft.contract}-${nft.tokenId}`}
                  currentlyPlaying={currentlyPlaying}
                  handlePlayPause={handlePlayPause}
                  onLikeToggle={() => handleLikeToggle(nft)}
                  showTitleOverlay={true}
                  useCenteredPlay={true}
                  isLibraryView={true}
                />
              ) : (
                <div 
                  key={getMediaKey(nft)}
                  className="bg-gray-800/30 rounded-lg p-3 flex items-center gap-4 group hover:bg-gray-800/50 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
                    <NFTImage 
                      src={nft.metadata?.image || ''}
                      alt={nft.name}
                      className="w-full h-full object-cover"
                      width={48}
                      height={48}
                      priority={true}
                      nft={nft}
                    />
                  </div>

                  {/* Track Info */}
                  <div className="flex-grow min-w-0">
                    <h3 className="font-mono text-purple-400 truncate">{nft.name}</h3>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    {/* Like Button */}
                    <button 
                      onClick={() => handleLikeToggle(nft)}
                      className="text-red-500 hover:scale-110 transition-transform"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                        <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                      </svg>
                    </button>

                    {/* Play Button */}
                    <button 
                      onClick={() => handlePlayAudio(nft)}
                      className="text-purple-400 hover:scale-110 transition-transform"
                    >
                    {currentlyPlaying === `${nft.contract}-${nft.tokenId}` && isPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                        <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                        <path d="M320-200v-560l440 280-440 280Z"/>
                      </svg>
                    )}
                  </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default LibraryView;