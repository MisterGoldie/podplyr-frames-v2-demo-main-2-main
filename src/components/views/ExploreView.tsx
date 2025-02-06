'use client';

import React, { useState } from 'react';
import { SearchBar } from '../search/SearchBar';
import { NFTCard } from '../nft/NFTCard';
import Image from 'next/image';
import { NFT, FarcasterUser, SearchedUser } from '../../types/user';

interface ExploreViewProps {
  onSearch: (query: string) => void;
  selectedUser: FarcasterUser | null;
  onPlayNFT: (nft: NFT) => void;
  currentlyPlaying: string | null;
  isPlaying: boolean;
  searchResults: FarcasterUser[];
  nfts: NFT[];
  isSearching: boolean;
  handlePlayPause: () => void;
  isLoadingNFTs: boolean;
  onBack: () => void;
  publicCollections: string[];
  addToPublicCollection?: (nft: NFT, collectionId: string) => void;
  removeFromPublicCollection?: (nft: NFT, collectionId: string) => void;
  recentSearches: SearchedUser[];
  handleUserSelect: (user: FarcasterUser) => void;
  onReset: () => void;
}

const ExploreView: React.FC<ExploreViewProps> = ({
  onSearch,
  selectedUser,
  onPlayNFT,
  currentlyPlaying,
  isPlaying,
  searchResults,
  nfts,
  isSearching,
  handlePlayPause,
  isLoadingNFTs,
  onBack,
  publicCollections,
  addToPublicCollection,
  removeFromPublicCollection,
  recentSearches,
  handleUserSelect,
  onReset,
}) => {
  const generateUniqueNFTKey = (nft: NFT, index: number) => {
    return `${nft.contract}-${nft.tokenId}-${index}`;
  };

  if (isSearching) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400"></div>
      </div>
    );
  }

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
        {!selectedUser ? (
          <>
            <div>
              <SearchBar onSearch={onSearch} isSearching={isSearching} />
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-green-400 mb-4">Search Results</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {searchResults.map((user) => (
                    <div
                      key={user.fid}
                      className="bg-gray-800/20 p-4 rounded-lg hover:bg-gray-800/40 transition-colors cursor-pointer"
                      onClick={() => handleUserSelect(user)}
                    >
                      <div className="flex items-center gap-3">
                        {user.pfp_url && (
                          <Image
                            src={user.pfp_url}
                            alt={user.display_name || user.username}
                            width={48}
                            height={48}
                            className="rounded-full"
                          />
                        )}
                        <div>
                          <h3 className="font-medium text-green-400">{user.display_name || user.username}</h3>
                          <p className="text-sm text-gray-400">@{user.username}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recently Searched Users Section */}
            {!searchResults.length && !selectedUser && recentSearches.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-4">Recently Searched</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {recentSearches.map((user) => (
                    <button
                      key={`recent-search-${user.fid}-${user.username}`}
                      onClick={() => {
                        const farcasterUser: FarcasterUser = {
                          fid: user.fid,
                          username: user.username,
                          display_name: user.display_name || user.username,
                          pfp_url: user.pfp_url || `https://avatar.vercel.sh/${user.username}`,
                          follower_count: 0,
                          following_count: 0
                        };
                        handleUserSelect(farcasterUser);
                      }}
                      className="bg-gray-800/30 backdrop-blur-sm p-4 rounded-lg text-left hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative">
                          <Image
                            src={user.pfp_url || `https://avatar.vercel.sh/${user.username}`}
                            alt={user.display_name || user.username}
                            className="object-cover"
                            fill
                            sizes="48px"
                          />
                        </div>
                        <div>
                          <h3 className="font-mono text-green-400 truncate max-w-[200px]">
                            {user.display_name || user.username}
                          </h3>
                          <p className="font-mono text-gray-400 truncate max-w-[200px]">
                            @{user.username}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <button 
              onClick={onBack}
              className="mb-6 flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
              </svg>
              <span className="font-mono">Back to Search</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {isLoadingNFTs ? (
                <div className="col-span-full text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400"></div>
                  <p className="mt-4 font-mono text-green-400">Loading NFTs...</p>
                </div>
              ) : nfts.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <p className="font-mono text-gray-400">No audio NFTs found</p>
                </div>
              ) : (
                nfts.map((nft, index) => (
                  <NFTCard
                    key={generateUniqueNFTKey(nft, index)}
                    nft={nft}
                    onPlay={onPlayNFT}
                    isPlaying={isPlaying}
                    currentlyPlaying={currentlyPlaying}
                    handlePlayPause={handlePlayPause}
                    publicCollections={publicCollections}
                    onAddToCollection={addToPublicCollection}
                    onRemoveFromCollection={removeFromPublicCollection}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ExploreView;