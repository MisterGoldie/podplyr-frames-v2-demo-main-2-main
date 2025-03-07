'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useVirtualizedNFTs } from '../../hooks/useVirtualizedNFTs';
import { SearchBar } from '../search/SearchBar';
import { VirtualizedNFTGrid } from '../nft/VirtualizedNFTGrid';
import Image from 'next/image';
import { NFT, FarcasterUser, SearchedUser } from '../../types/user';
import { getDoc, doc } from 'firebase/firestore';
import { db, trackUserSearch, isUserFollowed, toggleFollowUser, getFollowersCount, getFollowingCount } from '../../lib/firebase';
import { useContext } from 'react';
import { FarcasterContext } from '../../app/providers';
import NotificationHeader from '../NotificationHeader';

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
  likedNFTs?: NFT[]; // Add likedNFTs to allow component to track like changes
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
    likedNFTs,
  } = props;

  // Add state variable for shared NFTs count
  const [sharedNFTsCount, setSharedNFTsCount] = useState(0);
  const checkCompleted = useRef(false);

  // Add this state variable
  const [hasLikedNFTs, setHasLikedNFTs] = useState(false);

  // Add this code at the top of your ExploreView component, near other state variables
  const [hasSharedNFTs, setHasSharedNFTs] = useState(false);
  const [username, setUsername] = useState('');

  // 1. Keep the showBanner state
  const [showBanner, setShowBanner] = useState(false);
  
  // Add state to force refresh of grid when like status changes
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Add state to track followed users
  const [followedUsers, setFollowedUsers] = useState<Record<number, boolean>>({});
  
  // Add state for app-specific follower and following counts
  const [appFollowerCount, setAppFollowerCount] = useState<number>(0);
  const [appFollowingCount, setAppFollowingCount] = useState<number>(0);

  // 2. Completely revise the useEffect that handles banner visibility
  useEffect(() => {
    // Always immediately hide the banner on any change to these dependencies
    setShowBanner(false);
    
    // Only proceed with checks when we have the data we need and loading is complete
    if (!selectedUser || !nfts || nfts.length === 0 || isLoadingNFTs || !isNFTLiked) {
      return; // Exit early if conditions aren't met
    }
    
    console.log(`📊 Checking ${nfts.length} NFTs from ${selectedUser.username} for connections...`);
    setUsername(selectedUser.username);
    
    // Delay the check to ensure all data is loaded
    const checkTimer = setTimeout(() => {
      // Track if we found any liked NFTs
      let foundLiked = false;
      
      // Check each NFT individually
      for (const nft of nfts) {
        if (!nft.contract || !nft.tokenId) continue; // Skip invalid NFTs
        
        // Use ignoreCurrentPage=true to check the real liked status
        const isLiked = isNFTLiked(nft, true);
        
        if (isLiked) {
          console.log(`✅ FOUND LIKED NFT: ${nft.name || 'Unnamed NFT'}`);
          foundLiked = true;
          break; // Exit loop once we find at least one
        }
      }
      
      console.log(`📊 Connection found with ${selectedUser.username}: ${foundLiked}`);
      
      // Only show banner if liked NFTs were actually found
      if (foundLiked) {
        setShowBanner(true);
      }
    }, 500); // Wait 500ms after data is loaded
    
    // Clean up timer if component unmounts or dependencies change
    return () => clearTimeout(checkTimer);
  }, [selectedUser, nfts, isLoadingNFTs, isNFTLiked]);

  // 3. Add a separate useEffect to ensure banner is hidden when loading starts
  useEffect(() => {
    if (isLoadingNFTs) {
      setShowBanner(false);
    }
  }, [isLoadingNFTs]);
  
  // Fetch app-specific follower and following counts when a user is selected
  useEffect(() => {
    const fetchFollowCounts = async () => {
      if (selectedUser && selectedUser.fid) {
        try {
          // Get the counts from our app's database
          const followerCount = await getFollowersCount(selectedUser.fid);
          const followingCount = await getFollowingCount(selectedUser.fid);
          
          // Update state with the counts
          setAppFollowerCount(followerCount);
          setAppFollowingCount(followingCount);
          
          console.log(`App follow counts for ${selectedUser.username}: ${followerCount} followers, ${followingCount} following`);
        } catch (error) {
          console.error('Error fetching follow counts:', error);
          // Reset counts on error
          setAppFollowerCount(0);
          setAppFollowingCount(0);
        }
      } else {
        // Reset counts when no user is selected
        setAppFollowerCount(0);
        setAppFollowingCount(0);
      }
    };
    
    fetchFollowCounts();
  }, [selectedUser]);

  // 4. Add a separate useEffect to clear the banner when user changes
  useEffect(() => {
    setShowBanner(false);
  }, [selectedUser]);

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

  // Add this useEffect to reset hasSharedNFTs when loading starts
  useEffect(() => {
    // Reset hasSharedNFTs whenever loading starts
    if (isLoadingNFTs) {
      setHasSharedNFTs(false);
    }
  }, [isLoadingNFTs]);

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

  // Wrapper for like toggle that updates UI state
  const handleLikeToggle = async (nft: NFT) => {
    console.log('ExploreView: handleLikeToggle called for:', nft.name);
    if (onLikeToggle) {
      try {
        await onLikeToggle(nft);
        // Force refresh to update like state in UI
        setRefreshTrigger(prev => prev + 1);
        console.log('ExploreView: Like toggled, triggering refresh');
      } catch (error) {
        console.error('Error toggling like in ExploreView:', error);
      }
    } else {
      console.warn('onLikeToggle not available in ExploreView');
    }
  };

  // Add effect to force re-render when liked NFTs change
  useEffect(() => {
    if (likedNFTs) {
      console.log('ExploreView: likedNFTs changed, triggering refresh');
      setRefreshTrigger(prev => prev + 1);
    }
  }, [likedNFTs]);
  
  // Check if users are followed when search results or selected user changes
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!effectiveUserFid) return;
      
      const newFollowedUsers: Record<number, boolean> = {};
      
      // Check follow status for search results
      if (searchResults && searchResults.length > 0) {
        for (const user of searchResults) {
          if (user.fid) {
            const isFollowed = await isUserFollowed(effectiveUserFid, user.fid);
            newFollowedUsers[user.fid] = isFollowed;
          }
        }
      }
      
      // Check follow status for selected user
      if (selectedUser && selectedUser.fid) {
        const isFollowed = await isUserFollowed(effectiveUserFid, selectedUser.fid);
        newFollowedUsers[selectedUser.fid] = isFollowed;
      }
      
      // Check follow status for recent searches
      if (recentSearches && recentSearches.length > 0) {
        for (const user of recentSearches) {
          if (user.fid) {
            const isFollowed = await isUserFollowed(effectiveUserFid, user.fid);
            newFollowedUsers[user.fid] = isFollowed;
          }
        }
      }
      
      setFollowedUsers(newFollowedUsers);
    };
    
    checkFollowStatus();
  }, [searchResults, selectedUser, recentSearches, effectiveUserFid]);
  
  // Handle follow/unfollow button click
  const handleFollowToggle = async (user: FarcasterUser, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!effectiveUserFid || !user.fid) return;
    
    try {
      const isNowFollowed = await toggleFollowUser(effectiveUserFid, user);
      
      // Update local state for follow button
      setFollowedUsers(prev => ({
        ...prev,
        [user.fid]: isNowFollowed
      }));
      
      // Immediately update follower/following counts in the UI
      if (selectedUser && selectedUser.fid === user.fid) {
        // If this is the selected user, update their follower count
        setAppFollowerCount(prev => isNowFollowed ? prev + 1 : Math.max(0, prev - 1));
      }
      
      // If the current user is selected, update their following count
      if (selectedUser && selectedUser.fid === effectiveUserFid) {
        setAppFollowingCount(prev => isNowFollowed ? prev + 1 : Math.max(0, prev - 1));
      }
      
      console.log(`User ${isNowFollowed ? 'followed' : 'unfollowed'}: ${user.username}`);
      console.log('Updated follower/following counts in UI');
    } catch (error) {
      console.error('Error toggling follow status:', error);
    }
  };
  
  return (
    <>
      {/* Header that transforms between normal and connection states */}
      <header 
        className={`fixed top-0 left-0 right-0 h-16 flex items-center justify-center z-50 transition-all duration-500 ease-in-out ${
          showBanner 
            ? 'bg-purple-600 border-b border-purple-700' 
            : 'bg-black border-b border-black'
        }`}
      >
        {/* Logo with smooth fade out when connection appears */}
        <div className={`transition-all duration-500 ease-in-out absolute ${
          showBanner ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}>
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
        </div>
        
        {/* Connection message with smooth fade in */}
        <div className={`flex items-center justify-center transition-all duration-500 ease-in-out ${
          showBanner ? 'opacity-100 scale-100' : 'opacity-0 scale-95 absolute'
        }`}>
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="text-white ml-3 text-lg">
            Connection with <span className="font-semibold">{username}</span>
          </div>
        </div>
      </header>
      
      {/* Main content with adjusted padding */}
      <div className="space-y-8 pt-20 pb-48 overflow-y-auto h-screen">
        {selectedUser && (
          <div className="px-4 mb-8">
            {/* Back button - redesigned for better visibility */}
            <button 
              onClick={onBack}
              className="mb-6 flex items-center gap-3 text-green-400 hover:text-green-300 transition-all px-5 py-3 rounded-lg
                       bg-gray-900/90 hover:bg-gray-800/90 active:bg-gray-800/100
                       shadow-lg shadow-black/40 border border-green-500/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
              </svg>
              <span className="font-mono text-sm tracking-wide font-medium">Back to Search</span>
            </button>

            {/* User Profile Header - Redesigned with app theme colors */}
            <div className="flex flex-col rounded-2xl bg-gradient-to-b from-gray-900 to-black border-t border-l border-r border-green-500/30 shadow-lg shadow-black/50 overflow-hidden">
              {/* Top section with gradient accent */}
              <div className="h-3 w-full bg-gradient-to-r from-green-500/80 via-green-400/60 to-green-500/80"></div>
              
              {/* Content section */}
              <div className="flex items-center gap-6 p-6">
                <div className="relative">
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
                    <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 relative ring-2 ring-green-500/40 shadow-md shadow-black/50">
                      <Image
                        src={selectedUser.pfp_url || `https://avatar.vercel.sh/${selectedUser.username}`}
                        alt={selectedUser.display_name || selectedUser.username}
                        className="object-cover"
                        fill
                        sizes="80px"
                      />
                    </div>
                  </a>
                  <div 
                    onClick={(e) => handleFollowToggle(selectedUser, e)}
                    className={`absolute -bottom-1 -right-1 w-6 h-6 ${followedUsers[selectedUser.fid] ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500'} rounded-full flex items-center justify-center shadow-md border ${followedUsers[selectedUser.fid] ? 'border-green-400/30' : 'border-purple-400/30'} transition-colors cursor-pointer`}
                  >
                    {followedUsers[selectedUser.fid] ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  <h2 className="text-2xl font-mono text-green-400 truncate">@{selectedUser.username}</h2>
                  
                  {/* App-specific follower and following counts */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-purple-500/20 rounded-full px-3 py-1 inline-flex items-center">
                      <span className="font-mono text-xs text-purple-300 font-medium">
                        {appFollowerCount} Followers
                      </span>
                    </div>
                    <div className="bg-purple-500/20 rounded-full px-3 py-1 inline-flex items-center">
                      <span className="font-mono text-xs text-purple-300 font-medium">
                        {appFollowingCount} Following
                      </span>
                    </div>
                  </div>
                  
                  {/* NFT count */}
                  {!isLoadingNFTs && (
                    <div className="flex items-center">
                      <div className="bg-green-500/20 rounded-full px-3 py-1 inline-flex items-center">
                        <span className="font-mono text-sm text-green-300 font-medium">
                          {nfts.length} Media NFTs
                        </span>
                      </div>
                    </div>
                  )}
                </div>
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
                        <div className="relative">
                          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 relative ring-2 ring-gray-800/60 group-hover:ring-green-400/40 transition-all">
                            <Image
                              src={user.pfp_url || `https://avatar.vercel.sh/${user.username}`}
                              alt={user.display_name || user.username}
                              className="object-cover"
                              fill
                              sizes="56px"
                            />
                          </div>
                          <div 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFollowToggle(user, e);
                            }}
                            className={`absolute -bottom-1 -right-1 w-6 h-6 ${followedUsers[user.fid] ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500'} rounded-full flex items-center justify-center shadow-md border ${followedUsers[user.fid] ? 'border-green-400/30' : 'border-purple-400/30'} transition-colors cursor-pointer`}
                          >
                            {followedUsers[user.fid] ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 flex-1 min-w-0">
                          <h3 className="font-mono text-green-400 truncate group-hover:text-green-300 transition-colors">{user.display_name || user.username}</h3>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-gray-400 text-sm truncate">@{user.username}</p>
                            {followedUsers[user.fid] && (
                              <span className="text-xs font-mono px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">Following</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Recently Searched Users Section - with cleaner, more distinct styling */}
            {!searchResults.length && !selectedUser && recentSearches.length > 0 && (
              <div className="mb-8 px-4">
                <h2 className="text-xl font-mono text-green-400 mb-4">
                  {effectiveUserFid ? "Recently Searched" : "Popular Users"}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
                      className="relative bg-gray-900/90 rounded-xl p-4 
                                hover:bg-gray-800/90 
                                transition-colors duration-200 cursor-pointer 
                                border border-purple-900/60 hover:border-green-500/60
                                shadow-lg shadow-black/30"
                    >
                      <div className="flex items-center gap-4">
                        {/* Avatar - clean styling */}
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative">
                            <Image
                              src={user.pfp_url || '/default-nft.png'}
                              alt={user.display_name || user.username}
                              className="object-cover"
                              fill
                              sizes="48px"
                            />
                          </div>
                          <div 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFollowToggle(user, e);
                            }}
                            className={`absolute -bottom-1 -right-1 w-6 h-6 ${followedUsers[user.fid] ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500'} rounded-full flex items-center justify-center shadow-md border ${followedUsers[user.fid] ? 'border-green-400/30' : 'border-purple-400/30'} transition-colors cursor-pointer`}
                          >
                            {followedUsers[user.fid] ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>
                        
                        {/* Text content container */}
                        <div className="flex flex-col min-w-0 flex-1">
                          {/* Display name */}
                          <h3 className="font-mono text-green-400 truncate w-full">
                            {user.display_name || user.username}
                          </h3>
                          
                          {/* Username */}
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
                  <p className="font-mono text-gray-400">No media NFTs found</p>
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
      <NotificationHeader
        show={showBanner}
        onHide={() => setShowBanner(false)}
        type="connection"
        message="Connection with"
        highlightText={username}
        autoHideDuration={0}
        onReset={onReset}
      />
    </>
  );
};

export default ExploreView;