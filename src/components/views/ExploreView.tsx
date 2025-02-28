'use client';

import React, { useState, useEffect } from 'react';
import { useVirtualizedNFTs } from '../../hooks/useVirtualizedNFTs';
import { SearchBar } from '../search/SearchBar';
import { VirtualizedNFTGrid } from '../nft/VirtualizedNFTGrid';
import Image from 'next/image';
import { NFT, FarcasterUser, SearchedUser } from '../../types/user';
import { getDoc, doc } from 'firebase/firestore';
import { db, trackUserSearch } from '../../lib/firebase';
import { useContext } from 'react';
import { FarcasterContext } from '../../app/providers';

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
  handleDirectUserSelect: (user: FarcasterUser) => void;
  onReset: () => void;
}

const ExploreView: React.FC<ExploreViewProps> = (props) => {
  const { fid: userFid = 0 } = useContext(FarcasterContext);
  const {
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
  handleDirectUserSelect,
  onReset,
} = props;
  const generateUniqueNFTKey = (nft: NFT, index: number) => {
    return `${nft.contract}-${nft.tokenId}-${index}`;
  };

  const clearSearch = () => {
    onSearch(""); // Clear the search query
  };

  if (isSearching) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-800/30 rounded-full"></div>
          <div className="absolute top-0 w-16 h-16 border-4 border-t-green-400 border-r-green-400 rounded-full animate-spin"></div>
        </div>
        <div className="text-xl font-mono text-green-400 animate-pulse">Searching...</div>
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
            className="logo-image"
            priority={true}
          />
        </button>
      </header>
      <div className="space-y-8 pt-20 pb-48 overflow-y-auto h-screen">
        {!selectedUser ? (
          <>
            <div>
              <SearchBar 
                onSearch={onSearch} 
                isSearching={isSearching} 
                handleUserSelect={handleDirectUserSelect} 
              />
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && !selectedUser ? (
              <div className="mt-8">
                <h2 className="text-2xl font-semibold mb-4 font-mono text-green-400">Search Results</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {searchResults.map((user) => (
                    <div
                      key={user.fid}
                      onClick={() => {
                        console.log('=== EXPLORE: Direct wallet search from search results ===');
                        console.log('Selected user:', user);
                        
                        // Track the search before selecting the user
                        if (userFid) {
                          trackUserSearch(user.username, userFid);
                        }
                        
                        // Directly initiate wallet search without showing intermediate profile view
                        handleUserSelect(user);
                      }}
                      className="group relative bg-gray-800/20 backdrop-blur-sm rounded-xl p-4 hover:bg-gray-800/40 transition-all cursor-pointer border border-gray-800/40 hover:border-green-400/40"
                    >
                      <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 relative ring-2 ring-gray-800/60 group-hover:ring-green-400/40 transition-all">
                            <Image
                              src={user.pfp_url || `https://avatar.vercel.sh/${user.username}`}
                              alt={user.display_name || user.username}
                              className="object-cover"
                              fill
                              sizes="56px"
                            />
                          </div>
                        <div className="space-y-1 flex-1 min-w-0">
                          <h3 className="font-mono text-green-400 truncate group-hover:text-green-300 transition-colors">{user.display_name || user.username}</h3>
                          <p className="font-mono text-gray-400 text-sm truncate">@{user.username}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Recently Searched Users Section */}
            {!searchResults.length && !selectedUser && recentSearches.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-4">Recently Searched</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {recentSearches.map((user) => (
                    <button
                      key={`recent-search-${user.fid}-${user.username}`}
                      onClick={async () => {
                        // Get the full user data from searchedusers collection
                        console.log('=== EXPLORE: User selected from recent searches ===');
                        console.log('Getting full user data for FID:', user.fid);
                        console.log('Current userFid:', userFid);
                        
                        const userDoc = await getDoc(doc(db, 'searchedusers', user.fid.toString()));
                        const userData = userDoc.data();
                        console.log('User data from searchedusers:', userData);
                        
                        const farcasterUser: FarcasterUser = {
                          fid: user.fid,
                          username: user.username,
                          display_name: user.display_name || user.username,
                          pfp_url: user.pfp_url || `https://avatar.vercel.sh/${user.username}`,
                          follower_count: user.follower_count || 0,
                          following_count: user.following_count || 0,
                          custody_address: userData?.custody_address,
                          verified_addresses: userData?.verified_addresses
                        };
                        
                        console.log('Selected user with addresses:', farcasterUser);
                        
                        // Track the search before selecting the user
                        console.log('=== EXPLORE: Tracking search ===');
                        await trackUserSearch(user.username, userFid);
                        console.log('Search tracked successfully');
                        
                        // No need to manually refresh recent searches here
                        // The subscription in Demo.tsx will handle it
                        handleUserSelect(farcasterUser);
                      }}
                      className="bg-gray-800/30 backdrop-blur-sm p-4 rounded-lg text-left hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative">
                          <Image
                            src={user.pfp_url || '/default-nft.png'}
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
            <div className="px-4 mb-8">
              <button 
                onClick={onBack}
                className="mb-6 flex items-center gap-3 text-green-400 hover:text-green-300 transition-all px-4 py-2 rounded-lg bg-gray-800/20 hover:bg-gray-800/40 active:bg-gray-800/60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                  <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
                </svg>
                <span className="font-mono text-sm tracking-wide">Back to Search</span>
              </button>

              {/* User Profile Header */}
              <div className="flex items-center gap-6 p-6 rounded-2xl bg-gray-800/20 backdrop-blur-sm border border-gray-800/40">
                <a 
                  href={`https://warpcast.com/${selectedUser.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(`https://warpcast.com/${selectedUser.username}`, '_blank');
                  }}
                  className="block transition-transform hover:scale-105 active:scale-95"
                >
                  <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 relative ring-2 ring-gray-800/60">
                    <Image
                      src={selectedUser.pfp_url || `https://avatar.vercel.sh/${selectedUser.username}`}
                      alt={selectedUser.display_name || selectedUser.username}
                      className="object-cover"
                      fill
                      sizes="80px"
                    />
                  </div>
                </a>
                <div className="space-y-2">
                  <h2 className="text-2xl font-mono text-green-400">@{selectedUser.username}</h2>
                  {!isLoadingNFTs && (
                    <p className="font-mono text-sm text-gray-500">
                      {nfts.length} {nfts.length === 1 ? 'NFT' : 'NFTs'} found
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {isLoadingNFTs ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 space-y-6">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-gray-800/30 rounded-full"></div>
                    <div className="absolute top-0 w-16 h-16 border-4 border-t-green-400 border-r-green-400 rounded-full animate-spin"></div>
                  </div>
                  <div className="space-y-2 text-center">
                    <p className="text-xl font-mono text-green-400">Searching wallet</p>
                    <p className="font-mono text-gray-400 text-sm">Looking for media NFTs...</p>
                  </div>
                </div>
              ) : nfts.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <p className="font-mono text-gray-400">No audio NFTs found</p>
                </div>
              ) : (
                <>
                  {/* Use virtualized loading for NFTs */}
                  <VirtualizedNFTGrid 
                    nfts={nfts}
                    currentlyPlaying={currentlyPlaying}
                    isPlaying={isPlaying}
                    handlePlayPause={handlePlayPause}
                    onPlayNFT={onPlayNFT}
                    publicCollections={publicCollections}
                    addToPublicCollection={addToPublicCollection}
                    removeFromPublicCollection={removeFromPublicCollection}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ExploreView;