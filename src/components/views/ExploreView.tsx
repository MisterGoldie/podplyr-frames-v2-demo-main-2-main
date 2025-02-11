'use client';

import React, { useState } from 'react';
import { SearchBar } from '../search/SearchBar';
import { NFTCard } from '../nft/NFTCard';
import Image from 'next/image';
import { NFT, FarcasterUser, SearchedUser } from '../../types/user';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

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
  // Props

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
              <SearchBar onSearch={onSearch} isSearching={isSearching} />
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="px-4">
                <button 
                  onClick={clearSearch}
                  className="mb-6 flex items-center gap-3 text-green-400 hover:text-green-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                    <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
                  </svg>
                  <span className="font-mono text-sm">Back to Search</span>
                </button>
                <h2 className="text-xl font-mono text-green-400 mb-6 flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-240v-32q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v32q0 33-23.5 56.5T720-160H240q-33 0-56.5-23.5T160-240Zm80 0h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z"/>
                  </svg>
                  Search Results
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {searchResults.map((user) => (
                    <div
                      key={user.fid}
                      onClick={() => {
                        console.log('=== EXPLORE: User selected from search results ===');
                        console.log('Selected user:', user);
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
            )}

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
                        
                        const userDoc = await getDoc(doc(db, 'searchedusers', user.fid.toString()));
                        const userData = userDoc.data();
                        
                        const farcasterUser: FarcasterUser = {
                          fid: user.fid,
                          username: user.username,
                          display_name: user.display_name || user.username,
                          pfp_url: user.pfp_url || `https://avatar.vercel.sh/${user.username}`,
                          follower_count: 0,
                          following_count: 0,
                          custody_address: userData?.custody_address,
                          verified_addresses: userData?.verified_addresses
                        };
                        
                        console.log('Selected user with addresses:', farcasterUser);
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
            <button 
              onClick={onBack}
              className="mb-6 flex items-center gap-3 text-green-400 hover:text-green-300 transition-all px-4 py-2 rounded-lg bg-gray-800/20 hover:bg-gray-800/40 active:bg-gray-800/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
              </svg>
              <span className="font-mono text-sm tracking-wide">Back to Search</span>
            </button>

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
                nfts.map((nft, index) => (
                  <NFTCard
                    key={generateUniqueNFTKey(nft, index)}
                    nft={nft}
                    onPlay={async (nft) => {
                      await onPlayNFT(nft);
                    }}
                    isPlaying={isPlaying}
                    currentlyPlaying={currentlyPlaying}
                    handlePlayPause={handlePlayPause}
                    publicCollections={publicCollections}
                    onAddToCollection={addToPublicCollection}
                    onRemoveFromCollection={removeFromPublicCollection}
                    showTitleOverlay={true}
                    useCenteredPlay={true}
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