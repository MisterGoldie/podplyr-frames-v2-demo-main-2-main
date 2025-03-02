'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  onLikeToggle?: (nft: NFT) => Promise<void>;
  isNFTLiked?: (nft: NFT, ignoreCurrentPage?: boolean) => boolean;
  userFid?: number;
  userNFTs: NFT[];
  searchType: string;
  searchParam: string;
}

const ExploreView: React.FC<ExploreViewProps> = (props) => {
  // Get FID from context, but prioritize the one passed in props if available
  const contextFid = useContext(FarcasterContext);
  
  // Use the FID from props if available, otherwise use the one from context
  const effectiveUserFid = props.userFid || contextFid.fid || 0;

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
    onLikeToggle,
    isNFTLiked,
    userNFTs,
    searchType,
    searchParam,
  } = props;

  // Add state variable for shared NFTs count
  const [sharedNFTsCount, setSharedNFTsCount] = useState(0);
  const checkCompleted = useRef(false);

  // Add this state variable
  const [hasLikedNFTs, setHasLikedNFTs] = useState(false);

  // Add this code at the top of your ExploreView component, near other state variables
  const [hasSharedNFTs, setHasSharedNFTs] = useState(false);
  const [username, setUsername] = useState('');

  // Add this inside the component before the return statement
  // This effect runs when selectedUser changes
  useEffect(() => {
    if (selectedUser && selectedUser.username && nfts && nfts.length > 0) {
      console.log(`📊 Checking ${nfts.length} NFTs from ${selectedUser.username} for matches...`);
      setUsername(selectedUser.username);
      
      // Check if any NFT is liked - at least one
      const hasLiked = nfts.some(nft => {
        if (isNFTLiked && nft.contract && nft.tokenId) {
          return isNFTLiked(nft, true);
        }
        return false;
      });
      
      console.log(`📊 Has liked NFTs from ${selectedUser.username}: ${hasLiked}`);
      setHasSharedNFTs(hasLiked);
    } else {
      setHasSharedNFTs(false);
    }
  }, [selectedUser, nfts, isNFTLiked]);

  // Add effect to check for shared NFTs when viewing a profile
  useEffect(() => {
    console.log("BANNER DEBUG - searchType:", searchType);
    console.log("BANNER DEBUG - searchParam:", searchParam);
    console.log("BANNER DEBUG - nfts count:", nfts?.length);
    console.log("BANNER DEBUG - userNFTs count:", userNFTs?.length);
    
    // Only proceed if we have the data we need
    if (!nfts || !userNFTs || nfts.length === 0 || userNFTs.length === 0) {
      console.log("BANNER DEBUG - Missing data, not showing banner");
      return;
    }
    
    // Count shared NFTs with explicit logging
    let matches = 0;
    const userNFTKeys = userNFTs
      .filter(nft => nft?.contract && nft?.tokenId)
      .map(nft => `${nft.contract.toLowerCase()}-${nft.tokenId}`);
    
    console.log("BANNER DEBUG - User has", userNFTKeys.length, "valid NFT keys");
    
    for (const nft of nfts) {
      if (nft?.contract && nft?.tokenId) {
        const key = `${nft.contract.toLowerCase()}-${nft.tokenId}`;
        if (userNFTKeys.includes(key)) {
          matches++;
          console.log("BANNER DEBUG - Match found:", nft.name);
        }
      }
    }
    
    console.log("BANNER DEBUG - Total matches found:", matches);
    setSharedNFTsCount(matches);
  }, [nfts, userNFTs, searchType, searchParam]);

  // Add this effect to check if ANY NFT is liked
  useEffect(() => {
    if (searchType === 'user' && nfts.length > 0 && isNFTLiked) {
      // Check each NFT to see if ANY of them are liked
      let foundLiked = false;
      
      for (const nft of nfts) {
        if (isNFTLiked(nft)) {
          console.log(`FOUND LIKED NFT: ${nft.name}`);
          foundLiked = true;
          break; // Stop checking once we find at least one
        }
      }
      
      console.log(`Has liked NFTs from this creator: ${foundLiked}`);
      setHasLikedNFTs(foundLiked);
    }
  }, [nfts, isNFTLiked, searchType]);

  // Add this useEffect that runs ONLY when NFTs load or username changes
  useEffect(() => {
    // Reset the check flag when user changes
    if (searchParam) {
      checkCompleted.current = false;
      setSharedNFTsCount(0);
    }
    
    // Only run this if we have NFTs and haven't checked yet
    if (searchType === 'user' && nfts.length > 0 && !checkCompleted.current) {
      console.log(`🔍 CHECKING ${nfts.length} NFTs FOR LIKED STATUS...`);
      
      // Delay the check slightly to ensure everything is loaded
      setTimeout(() => {
        let likedCount = 0;
        
        // Check each NFT
        for (const nft of nfts) {
          // Make sure isNFTLiked is available and the NFT is valid
          if (isNFTLiked && nft && nft.contract && nft.tokenId) {
            const isLiked = isNFTLiked(nft);
            if (isLiked) {
              console.log(`✅ FOUND LIKED NFT: ${nft.name}`);
              likedCount++;
            }
          }
        }
        
        console.log(`📊 FINAL COUNT: ${likedCount} liked NFTs from ${searchParam}`);
        setSharedNFTsCount(likedCount);
        
        // Mark that we've completed this check
        checkCompleted.current = true;
      }, 1000); // 1 second delay
    }
  }, [nfts, searchParam, searchType, isNFTLiked]);

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
      {/* Fixed header - exactly as in previous working version */}
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
      
      {/* Banner - fixed position underneath the header */}
      {selectedUser && hasSharedNFTs && (
        <div className="fixed top-16 left-0 right-0 bg-purple-600 text-white p-3 z-40 text-center">
          Connection found! You have NFTs from {username} in your library
        </div>
      )}
      
      {/* Main content area - with adjusted padding based on banner presence */}
      <div className={`space-y-8 ${hasSharedNFTs && selectedUser ? 'pt-28' : 'pt-20'} pb-48 overflow-y-auto h-screen`}>
        {selectedUser && (
          <div className="px-4 mb-8">
            {/* Back button - now inside the scrollable content but with proper spacing */}
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
                    Total Media NFTs: {nfts.length}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!selectedUser ? (
          <>
            {/* Search interface */}
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
                        if (effectiveUserFid) {
                          trackUserSearch(user.username, effectiveUserFid);
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

            {/* Recently Searched Users Section - with fixed alignment */}
            {!searchResults.length && !selectedUser && recentSearches.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-4">
                  {effectiveUserFid ? "Recently Searched" : "Popular Users"}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {recentSearches.map((user) => (
                    <button
                      key={`recent-search-${user.fid}-${user.username}`}
                      onClick={async () => {
                        // Get the full user data from searchedusers collection
                        console.log('=== EXPLORE: User selected from recent searches ===');
                        console.log('Getting full user data for FID:', user.fid);
                        console.log('Current userFid:', effectiveUserFid);
                        
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
                        await trackUserSearch(user.username, effectiveUserFid);
                        console.log('Search tracked successfully');
                        
                        // No need to manually refresh recent searches here
                        // The subscription in Demo.tsx will handle it
                        handleUserSelect(farcasterUser);
                      }}
                      className="group relative bg-gray-800/20 backdrop-blur-sm rounded-xl p-4 hover:bg-gray-800/40 transition-all cursor-pointer border border-gray-800/40 hover:border-green-400/40"
                    >
                      <div className="flex items-start gap-4">
                        {/* Avatar - fixed size */}
                        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative">
                          <Image
                            src={user.pfp_url || '/default-nft.png'}
                            alt={user.display_name || user.username}
                            className="object-cover"
                            fill
                            sizes="48px"
                          />
                        </div>
                        
                        {/* Text content container with fixed width */}
                        <div className="flex flex-col min-w-0 flex-1">
                          {/* Display name - with truncation */}
                          <h3 className="font-mono text-green-400 truncate w-full">
                            {user.display_name || user.username}
                          </h3>
                          
                          {/* Username - with truncation */}
                          <p className="font-mono text-gray-400 text-sm truncate w-full">
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
                    onLikeToggle={onLikeToggle}
                    isNFTLiked={isNFTLiked}
                    userFid={effectiveUserFid}
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