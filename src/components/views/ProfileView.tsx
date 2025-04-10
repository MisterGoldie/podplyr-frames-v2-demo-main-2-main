'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useToast } from '../../hooks/useToast';
import Image from 'next/image';
import { VirtualizedNFTGrid } from '../nft/VirtualizedNFTGrid';
import type { NFT, UserContext, FarcasterUser } from '../../types/user';
import { getLikedNFTs, getFollowersCount, getFollowingCount, updatePodplayrFollowerCount } from '../../lib/firebase';
import { uploadProfileBackground } from '../../firebase';
import { optimizeImage } from '../../utils/imageOptimizer';
import { useUserImages } from '../../contexts/UserImageContext';
import NotificationHeader from '../NotificationHeader';
import FollowsModal from '../FollowsModal';
import { useNFTNotification } from '../../context/NFTNotificationContext';
import NFTNotification from '../NFTNotification';
import { useNFTCache } from '../../contexts/NFTCacheContext';

interface ProfileViewProps {
  userContext: UserContext;
  nfts: NFT[];
  handlePlayAudio: (nft: NFT) => Promise<void>;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
  onReset: () => void;
  onNFTsLoaded: (nfts: NFT[]) => void;
  onLikeToggle: (nft: NFT) => Promise<void>;
  onUserProfileClick?: (user: FarcasterUser) => void; // New prop for navigating to user profiles
}

const ProfileView: React.FC<ProfileViewProps> = ({
  userContext,
  nfts,
  handlePlayAudio,
  isPlaying,
  currentlyPlaying,
  handlePlayPause,
  onReset,
  onNFTsLoaded,
  onLikeToggle,
  onUserProfileClick
}) => {
  const [likedNFTs, setLikedNFTs] = useState<NFT[]>([]);
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { backgroundImage, profileImage, setBackgroundImage } = useUserImages();
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  
  // Add state for app-specific follower and following counts
  const [appFollowerCount, setAppFollowerCount] = useState<number>(0);
  const [appFollowingCount, setAppFollowingCount] = useState<number>(0);
  
  // State for follow modal
  const [showFollowsModal, setShowFollowsModal] = useState(false);
  const [followsModalType, setFollowsModalType] = useState<'followers' | 'following'>('followers');

  // Use the NFT cache context
  const { userNFTs: cachedNFTs, isLoading: isCacheLoading, error: cacheError, refreshUserNFTs, lastUpdated } = useNFTCache();
  
  // Combined error state that shows either local error or cache error
  const combinedError = error || cacheError;

  useEffect(() => {
    const loadNFTs = async () => {
      if (!userContext.user?.fid) {
        console.log('🚫 No FID found in userContext:', userContext);
        return;
      }
      
      console.log('🔄 Checking NFT cache for FID:', userContext.user.fid);
      
      // Check if we need to refresh the cache
      const needsRefresh = !lastUpdated || Date.now() - lastUpdated > 30 * 60 * 1000; // 30 minutes
      
      try {
        setIsLoading(true);
        setError(null);
        
        if (needsRefresh || cachedNFTs.length === 0) {
          console.log('📡 Cache expired or empty, refreshing NFTs...');
          await refreshUserNFTs(userContext.user.fid);
        } else {
          console.log('✨ Using cached NFTs:', {
            count: cachedNFTs.length,
            lastUpdated: new Date(lastUpdated).toLocaleTimeString()
          });
        }
        
        // Use the cached NFTs from context
        onNFTsLoaded(cachedNFTs);
      } catch (err) {
        console.error('❌ Error loading NFTs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load NFTs');
      } finally {
        setIsLoading(false);
      }
    };

    console.log('🎯 ProfileView useEffect triggered with FID:', userContext.user?.fid);
    loadNFTs();
  }, [userContext.user?.fid, onNFTsLoaded, cachedNFTs, lastUpdated, refreshUserNFTs]);

  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (userContext?.user?.fid) {
        try {
          const liked = await getLikedNFTs(userContext.user.fid);
          console.log('Loaded liked NFTs for profile view:', liked.length);
          setLikedNFTs(liked);
        } catch (error) {
          console.error('Error loading liked NFTs:', error);
        }
      }
    };

    loadLikedNFTs();
  }, [userContext?.user?.fid]);
  
  // Handle follow status changes to update counts immediately
  const handleFollowStatusChange = (newFollowStatus: boolean, targetFid: number) => {
    // If viewing your own profile, update the following count
    if (userContext?.user?.fid === targetFid) return; // Don't update if the user followed themselves (shouldn't happen)
    
    if (newFollowStatus) {
      // Increment following count when a user follows someone
      setAppFollowingCount(prev => prev + 1);
    } else {
      // Decrement following count when a user unfollows someone
      setAppFollowingCount(prev => Math.max(0, prev - 1));
    }
  };
  
  // Fetch app-specific follower and following counts
  useEffect(() => {
    const fetchFollowCounts = async () => {
      if (userContext?.user?.fid) {
        try {
          // Special case for PODPLAYR account (FID: 1014485)
          // Update the follower count to reflect all users in the system
          if (userContext.user.fid === 1014485) {
            console.log('PODPlayr account detected - updating follower count');
            // Update PODPLAYR follower count based on all users in the system
            const totalUsers = await updatePodplayrFollowerCount();
            setAppFollowerCount(totalUsers);
            setAppFollowingCount(0); // PODPlayr doesn't follow anyone
            console.log(`Updated PODPlayr follower count: ${totalUsers} followers`);
          } else {
            // Regular user - get counts from our app's database
            const followerCount = await getFollowersCount(userContext.user.fid);
            const followingCount = await getFollowingCount(userContext.user.fid);
            
            // Update state with the counts
            setAppFollowerCount(followerCount);
            setAppFollowingCount(followingCount);
            
            console.log(`App follow counts for profile: ${followerCount} followers, ${followingCount} following`);
          }
        } catch (error) {
          console.error('Error fetching follow counts for profile:', error);
          // Reset counts on error
          setAppFollowerCount(0);
          setAppFollowingCount(0);
        }
      }
    };
    
    fetchFollowCounts();
    
    // Set up a refresh interval to keep counts updated
    const intervalId = setInterval(fetchFollowCounts, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(intervalId); // Clean up on unmount
  }, [userContext?.user?.fid]);

  // This function checks if an NFT is liked using the mediaKey approach
  const isNFTLiked = (nft: NFT, ignoreCurrentPage?: boolean): boolean => {
    if (likedNFTs.length === 0) return false;
    
    // Import getMediaKey function if not already imported
    const { getMediaKey } = require('../../utils/media');
    
    // Get the mediaKey for the current NFT
    const nftMediaKey = getMediaKey(nft);
    
    if (!nftMediaKey) {
      console.warn('Could not generate mediaKey for NFT:', nft);
      // Fallback to contract/tokenId comparison if mediaKey can't be generated
      return nft.contract && nft.tokenId ? likedNFTs.some(
        likedNFT => 
          likedNFT.contract === nft.contract && 
          likedNFT.tokenId === nft.tokenId
      ) : false;
    }
    
    // Primary check: Compare mediaKeys for content-based tracking
    const mediaKeyMatch = likedNFTs.some(likedNFT => {
      const likedMediaKey = likedNFT.mediaKey || getMediaKey(likedNFT);
      return likedMediaKey === nftMediaKey;
    });
    
    // Secondary check: Use contract/tokenId as fallback
    const contractTokenMatch = nft.contract && nft.tokenId ? likedNFTs.some(
      likedNFT => 
        likedNFT.contract === nft.contract && 
        likedNFT.tokenId === nft.tokenId
    ) : false;
    
    // Log for debugging
    if (mediaKeyMatch || contractTokenMatch) {
      console.log(`NFT liked state: mediaKeyMatch=${mediaKeyMatch}, contractTokenMatch=${contractTokenMatch}`, {
        mediaKey: nftMediaKey,
        name: nft.name
      });
    }
    
    // Return true if either match method succeeds
    return mediaKeyMatch || contractTokenMatch;
  };
  
  // State for like notification
  const [showLikeNotification, setShowLikeNotification] = useState(false);
  const [likedNFTName, setLikedNFTName] = useState('');
  const [isLikeAction, setIsLikeAction] = useState(true); // true = like, false = unlike
  
  // Handle like toggle with notification
  const handleNFTLikeToggle = async (nft: NFT) => {
    try {
      // Import getMediaKey function
      const { getMediaKey } = require('../../utils/media');
      
      // Determine if this is a like or unlike action before making the change
      const currentlyLiked = isNFTLiked(nft, true);
      const willBeLiked = !currentlyLiked;
      
      // Get the mediaKey for the current NFT for content-based tracking
      const nftMediaKey = getMediaKey(nft);
      
      console.log(`Toggling like for NFT: ${nft.name}, mediaKey: ${nftMediaKey}, new state: ${willBeLiked ? 'liked' : 'unliked'}`);
      
      // Immediately update the UI state for instant feedback
      if (willBeLiked) {
        // Add to liked NFTs for immediate UI update
        // Add mediaKey to the NFT for easier reference later
        setLikedNFTs(prev => [...prev, {...nft, mediaKey: nftMediaKey}]);
      } else {
        // Remove from liked NFTs for immediate UI update using both methods:
        // 1. First try to filter by mediaKey (primary method, content-based)
        // 2. Then fall back to contract/tokenId if mediaKey matching fails
        setLikedNFTs(prev => {
          // If we have a valid mediaKey, use that first (preferred method)
          if (nftMediaKey) {
            return prev.filter(item => {
              const itemMediaKey = item.mediaKey || getMediaKey(item);
              return itemMediaKey !== nftMediaKey;
            });
          } else {
            // Fall back to contract/tokenId filtering if no mediaKey
            return prev.filter(item => 
              !(item.contract === nft.contract && item.tokenId === nft.tokenId)
            );
          }
        });
      }
      
      // Set notification properties
      setIsLikeAction(willBeLiked);
      setLikedNFTName(nft.name);
      setShowLikeNotification(true);
      
      // Auto-hide notification after 3 seconds
      setTimeout(() => {
        setShowLikeNotification(false);
      }, 3000);
      
      // Call the parent's onLikeToggle function (can happen in background)
      await onLikeToggle(nft);
    } catch (error) {
      console.error('Error toggling like for NFT:', error);
      
      // If there was an error, revert the optimistic UI update
      // by refreshing the liked NFTs
      if (userContext?.user?.fid) {
        try {
          const liked = await getLikedNFTs(userContext.user.fid);
          setLikedNFTs(liked);
        } catch (e) {
          console.error('Error refreshing liked NFTs after error:', e);
        }
      }
    }
  };

  const handleBackgroundUploadSuccess = () => {
    setShowSuccessBanner(true);
    
    // Ensure banner is hidden after the duration
    setTimeout(() => {
      setShowSuccessBanner(false);
    }, 3000);
  };

  return (
    <>
      {/* Add NFTNotification component to ensure notifications work in ProfileView */}
      <NFTNotification onReset={onReset} />
      
      <NotificationHeader
        show={showSuccessBanner}
        onHide={() => setShowSuccessBanner(false)}
        type="success"
        message="Background updated successfully"
        autoHideDuration={3000}
        onReset={onReset}
        onLogoClick={onReset}
      />
      
      {/* Notifications are now handled by the global NFTNotification component */}
      
      {/* Follows Modal */}
      {userContext?.user?.fid && showFollowsModal && (
        <FollowsModal
          isOpen={showFollowsModal}
          onClose={() => setShowFollowsModal(false)}
          userFid={userContext.user.fid}
          type={followsModalType}
          currentUserFid={userContext.user.fid}
          onFollowStatusChange={handleFollowStatusChange}
          onUserProfileClick={onUserProfileClick}
        />
      )}
      <div className="space-y-8 pt-20 pb-48 overflow-y-auto h-screen overscroll-y-contain">
        {/* Profile Header */}
        <div className="relative flex flex-col items-center justify-between text-center p-8 pt-6 pb-4 rounded-3xl mx-4 w-[340px] h-[280px] mx-auto border border-purple-400/20 shadow-xl shadow-purple-900/30 overflow-hidden hover:border-indigo-400/30 transition-all duration-300"
          style={{
            background: backgroundImage 
              ? `url(${backgroundImage}) center/cover no-repeat`
              : 'linear-gradient(to bottom right, rgba(37, 99, 235, 0.4), rgba(147, 51, 234, 0.3), rgba(219, 39, 119, 0.4))'
          }}
        >
          {/* Glow effect */}
          <div className="absolute inset-0 bg-black/30"></div>
          {error && (
            <div className="absolute top-4 left-4 right-4 p-2 bg-red-500/80 text-white text-sm rounded-lg z-20">
              {error}
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={async (e) => {
              const input = e.target as HTMLInputElement;
              const files = input.files;
              
              if (!files || files.length === 0) {
                setError('No file selected');
                return;
              }

              const file = files[0];
              if (!userContext?.user?.fid) {
                setError('User not authenticated');
                return;
              }

              if (file.size > 5 * 1024 * 1024) { // 5MB limit
                setError('Image size must be less than 5MB');
                return;
              }

              if (!file.type.startsWith('image/')) {
                setError('Please select an image file');
                return;
              }

              try {
                setError(null);
                setIsUploading(true);
                console.log('Starting upload with file:', {
                  name: file.name,
                  type: file.type,
                  size: file.size
                });

                // Optimize image before upload
                const optimized = await optimizeImage(file);
                console.log('Optimized image:', {
                  width: optimized.width,
                  height: optimized.height,
                  size: optimized.size,
                  reduction: `${Math.round((1 - optimized.size / file.size) * 100)}%`
                });

                // Upload optimized background
                const url = await uploadProfileBackground(userContext.user.fid, optimized.file);
                setBackgroundImage(url);

                // Clear the input and show success state
                input.value = '';
                handleBackgroundUploadSuccess();
              } catch (err) {
                console.error('Error uploading background:', err);
                const errorMessage = err instanceof Error ? err.message : 'Failed to upload background image';
                setError(errorMessage);
                toast?.error(errorMessage);
              } finally {
                setIsUploading(false);
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`absolute top-4 right-4 p-2 rounded-full transition-colors duration-200 z-10 ${isUploading ? 'bg-purple-500/40 cursor-not-allowed' : 'bg-purple-500/20 hover:bg-purple-500/30 cursor-pointer'}`}
            disabled={isUploading}
            title="Change background"
          >
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            )}
          </button>
          {/* Floating music notes */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute text-2xl text-purple-400/30 animate-float-slow top-12 left-8">
              ♪
            </div>
            <div className="absolute text-3xl text-purple-400/25 animate-float-slower top-32 right-12">
              ♫
            </div>
            <div className="absolute text-2xl text-purple-400/20 animate-float-medium top-48 left-16">
              ♩
            </div>
            <div className="absolute text-2xl text-purple-400/35 animate-float-fast right-8 top-24">
              ♪
            </div>
            <div className="absolute text-3xl text-purple-400/15 animate-float-slowest left-24 top-6">
              ♫
            </div>
          </div>
          <div className="relative z-10 mb-auto">
            <div className="rounded-full ring-4 ring-purple-400/20 overflow-hidden w-[120px] h-[120px]">
              {userContext?.user?.username ? (
                <a 
                  href={`https://warpcast.com/${userContext.user.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full h-full transition-transform hover:scale-105 active:scale-95"
                >
                  <Image
                    src={userContext.user?.pfpUrl || '/default-avatar.png'}
                    alt={userContext.user?.username}
                    width={120}
                    height={120}
                    className="w-full h-full"
                    style={{ objectFit: 'cover' }}
                    priority={true}
                  />
                </a>
              ) : (
                <Image
                  src='/default-avatar.png'
                  alt='User'
                  width={120}
                  height={120}
                  className="w-full h-full"
                  style={{ objectFit: 'cover' }}
                  priority={true}
                />
              )}
            </div>
          </div>
          <div className="space-y-2 relative z-10">
            <div className="bg-black/70 px-3 py-2 rounded-lg inline-block">
              <h2 className="text-2xl font-mono text-purple-400 text-shadow">
                {userContext?.user?.username ? `@${userContext.user.username}` : 'Welcome to PODPlayr'}
              </h2>
              
              {/* Follower and following counts */}
              {userContext?.user?.fid && (
                <div className="flex items-center gap-2 mt-2 mb-1">
                  <button 
                    onClick={() => {
                      setFollowsModalType('followers');
                      setShowFollowsModal(true);
                    }}
                    className="bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 transition-colors rounded-full px-3 py-1 inline-flex items-center"
                  >
                    <span className="font-mono text-xs text-purple-300 font-medium">
                      {appFollowerCount} Followers
                    </span>
                  </button>
                  <button 
                    onClick={() => {
                      setFollowsModalType('following');
                      setShowFollowsModal(true);
                    }}
                    className="bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 transition-colors rounded-full px-3 py-1 inline-flex items-center"
                  >
                    <span className="font-mono text-xs text-purple-300 font-medium">
                      {appFollowingCount} Following
                    </span>
                  </button>
                </div>
              )}
              
              {!isLoading && userContext?.user?.fid && (
                <p className="font-mono text-sm text-purple-300/60 text-shadow mt-1">
                  {nfts.length} {nfts.length === 1 ? 'NFT' : 'NFTs'} found
                </p>
              )}
            </div>
          </div>
        </div>

        {/* User's NFTs - Replace with virtualized grid */}
        <div>
          <h2 className="text-2xl font-bold text-green-400 mb-4">Your NFTs</h2>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-6 -mt-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-gray-800/30 rounded-full"></div>
                <div className="absolute top-0 w-16 h-16 border-4 border-t-green-400 border-r-green-400 rounded-full animate-spin"></div>
              </div>
              <div className="text-xl font-mono text-green-400 animate-pulse">Loading your NFTs...</div>
            </div>
          ) : !userContext?.user?.fid ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">Currently you can only create a profile through Warpcast</p>
            </div>
          ) : combinedError ? (
            <div className="text-center py-12">
              <h3 className="text-xl text-red-400 mb-2">Error Loading NFTs</h3>
              <p className="text-gray-400">{combinedError}</p>
            </div>
          ) : nfts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Custom styling to hide the "All X NFTs loaded" message */}
              <style jsx global>{`
                .grid > .col-span-full:last-child {
                  display: none;
                }
              `}</style>
              
              <VirtualizedNFTGrid 
                nfts={nfts}
                currentlyPlaying={currentlyPlaying}
                isPlaying={isPlaying}
                handlePlayPause={handlePlayPause}
                onPlayNFT={handlePlayAudio}
                publicCollections={[]}
                onLikeToggle={handleNFTLikeToggle}
                isNFTLiked={isNFTLiked}
                userFid={userContext.user?.fid}
              />
            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-xl text-red-500 mb-2">No Media NFTs Found</h3>
              <p className="text-gray-400">
                {!userContext?.user?.fid
                  ? 'Currently you can only create a profile through Warpcast'
                  : 'No media NFTs found in your connected wallets'
                }
              </p>
            </div>
          )}
        </div>
        {/* Copyright text */}
        <div className="text-center py-8 text-white/60 text-sm">
          © THEPOD 2025 ALL RIGHTS RESERVED
        </div>
      </div>
    </>
  );
};

export default ProfileView;