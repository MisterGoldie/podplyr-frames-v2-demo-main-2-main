'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useToast } from '../../hooks/useToast';
import Image from 'next/image';
import type { NFT, UserContext, FarcasterUser, NFTFile } from '../../types/user';
import { getFollowersCount, getFollowingCount, isUserFollowed, toggleFollowUser, updatePodplayrFollowerCount, PODPLAYR_ACCOUNT } from '../../lib/firebase';
import { optimizeImage } from '../../utils/imageOptimizer';
import NotificationHeader from '../NotificationHeader';
import FollowsModal from '../FollowsModal';
import { useNFTNotification } from '../../context/NFTNotificationContext';
import NFTNotification from '../NFTNotification';
import { getMediaKey } from '../../utils/media';
import { UserProfileNFTGrid } from '../nft/UserProfileNFTGrid';
import { logger } from '../../utils/logger';
import { useUserProfileBackground } from '../../hooks/useUserProfileBackground';

interface UserProfileViewProps {
  user: FarcasterUser;
  nfts: NFT[];
  handlePlayAudio: (nft: NFT, context?: { queue?: NFT[], queueType?: string }) => Promise<void>;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
  onReset: () => void;
  onUserProfileClick?: (user: FarcasterUser) => void;
  onBack: () => void;
  currentUserFid: number;
  onLikeToggle: (nft: NFT) => Promise<void>;
  isNFTLiked?: (nft: NFT) => boolean;
}

// Create logger for NFT filtering in profile view
const nftLogger = logger.getModuleLogger('ProfileNFTs');

const UserProfileView: React.FC<UserProfileViewProps> = ({
  user,
  nfts,
  handlePlayAudio,
  isPlaying,
  currentlyPlaying,
  handlePlayPause,
  onReset,
  onUserProfileClick,
  onBack,
  currentUserFid,
  onLikeToggle,
  isNFTLiked
}) => {
  const [appFollowerCount, setAppFollowerCount] = useState<number>(0);
  const [appFollowingCount, setAppFollowingCount] = useState<number>(0);
  const [isFollowed, setIsFollowed] = useState<boolean>(false);
  const [isFollowingLoading, setIsFollowingLoading] = useState<boolean>(false);
  const toast = useToast();
  const nftNotification = useNFTNotification();
  
  // Fetch the viewed user's background image directly
  const { backgroundImage } = useUserProfileBackground(user?.fid);

  // Extend user with background image if available
  const extendedUser = useMemo(() => {
    return {
      ...user,
      backgroundImage: backgroundImage
    };
  }, [user, backgroundImage]);

  // State for follows modal
  const [showFollowsModal, setShowFollowsModal] = useState(false);
  const [followsModalType, setFollowsModalType] = useState<'followers' | 'following'>('followers');

  // Load follower and following counts
  useEffect(() => {
    const loadFollowCounts = async () => {
      if (user?.fid) {
        try {
          let followerCount;
          
          // Special handling for PODPlayr account
          if (user.fid === PODPLAYR_ACCOUNT.fid) {
            // Update and get the accurate follower count for PODPlayr
            followerCount = await updatePodplayrFollowerCount();
          } else {
            // Regular follower count for other users
            followerCount = await getFollowersCount(user.fid);
          }
          
          const followingCount = await getFollowingCount(user.fid);
          
          setAppFollowerCount(followerCount);
          setAppFollowingCount(followingCount);
          
          console.log(`App follow counts for ${user.username}: ${followerCount} followers, ${followingCount} following`);
        } catch (error) {
          console.error('Error loading follow counts:', error);
        }
      }
    };

    // Check if current user follows this user
    const checkFollowStatus = async () => {
      if (currentUserFid && user?.fid && currentUserFid !== user.fid) {
        try {
          const followed = await isUserFollowed(currentUserFid, user.fid);
          setIsFollowed(followed);
        } catch (error) {
          console.error('Error checking follow status:', error);
        }
      }
    };

    loadFollowCounts();
    checkFollowStatus();
  }, [user?.fid, currentUserFid, user?.username]);

  // Handle follow/unfollow
  const handleFollowToggle = async () => {
    if (!currentUserFid || !user || currentUserFid === user.fid) return;
    
    setIsFollowingLoading(true);
    try {
      const newStatus = await toggleFollowUser(currentUserFid, user);
      setIsFollowed(newStatus);
      
      // Update follower count immediately in UI
      setAppFollowerCount(prev => newStatus ? prev + 1 : Math.max(0, prev - 1));
      
      // Use showConnectionNotification for user-related notifications
      nftNotification.showConnectionNotification(
        newStatus ? `You are now following @${user.username}` : `You unfollowed @${user.username}`
      );
    } catch (error) {
      console.error('Error toggling follow:', error);
      // Use showConnectionNotification for user-related notifications
      nftNotification.showConnectionNotification('Failed to update follow status');
    } finally {
      setIsFollowingLoading(false);
    }
  };

  // Handle follow status changes from follows modal
  const handleFollowStatusChange = (newStatus: boolean, targetFid: number) => {
    // Update follower count if this is the viewed user
    if (user?.fid === targetFid) {
      setAppFollowerCount(prev => newStatus ? prev + 1 : Math.max(0, prev - 1));
    }
    
    // If the current user is viewed, update their following count
    if (currentUserFid === user?.fid) {
      setAppFollowingCount(prev => newStatus ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  return (
    <>
      <NotificationHeader 
        show={true}
        type="profile"
        message={user?.username ? `@${user.username}` : 'User profile'}
        autoHideDuration={3000}
        onReset={onReset}
        onLogoClick={onReset}
      />
      
      {/* Follows Modal */}
      {user?.fid && showFollowsModal && (
        <FollowsModal
          isOpen={showFollowsModal}
          onClose={() => setShowFollowsModal(false)}
          userFid={user.fid}
          type={followsModalType}
          currentUserFid={currentUserFid}
          onFollowStatusChange={handleFollowStatusChange}
          onUserProfileClick={onUserProfileClick}
        />
      )}
      <div className="space-y-4 pt-16 pb-24 overflow-y-auto h-screen overscroll-y-contain">
        {/* Profile Header with Back Button */}
        <div 
          className="border-b border-purple-500/20 shadow-md relative" 
          style={{
            background: extendedUser?.backgroundImage 
              ? `url(${extendedUser.backgroundImage}) center/cover no-repeat` 
              : 'linear-gradient(to bottom, rgba(126, 34, 206, 0.5), #000)'
          }}
        >
          {/* No overlay for better background image visibility */}
          <div className="container mx-auto px-4 py-6 relative z-10">
            {/* Back button */}
            <button 
              onClick={onBack}
              className="mb-4 flex items-center text-purple-300 hover:text-purple-100 transition-colors bg-black/60 px-3 py-1 rounded-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L4.414 9H17a1 1 0 110 2H4.414l5.293 5.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Back
            </button>

            <div className="flex items-start md:items-center flex-col md:flex-row gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0 relative ring-3 ring-purple-500/40 shadow-lg shadow-black/50">
                  <Image
                    src={user?.pfp_url || `/default-avatar.png`}
                    alt={user?.display_name || user?.username || 'User'}
                    className="object-cover"
                    fill
                    sizes="80px"
                  />
                </div>
                {currentUserFid !== user?.fid && (
                  <div 
                    onClick={handleFollowToggle}
                    className={`absolute -bottom-1 -right-1 w-7 h-7 ${isFollowed ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500'} rounded-full flex items-center justify-center shadow-lg border-2 ${isFollowed ? 'border-green-400/30' : 'border-purple-400/30'} transition-all duration-200 cursor-pointer transform hover:scale-110 active:scale-95`}
                  >
                    {isFollowingLoading ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : isFollowed ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <div className="bg-black/70 px-3 py-2 rounded-lg inline-block">
                  <h2 className="text-2xl font-mono text-green-400 truncate">@{user?.username}</h2>
                  {user?.display_name && (
                    <p className="text-lg text-white font-semibold">{user.display_name}</p>
                  )}
                </div>
                
                {/* App-specific follower and following counts */}
                <div className="flex items-center gap-2 mb-2">
                  <button 
                    onClick={() => {
                      setFollowsModalType('followers');
                      setShowFollowsModal(true);
                    }}
                    className="bg-black/60 hover:bg-black/70 active:bg-black/80 transition-colors rounded-full px-3 py-1 inline-flex items-center"
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
                    className="bg-black/60 hover:bg-black/70 active:bg-black/80 transition-colors rounded-full px-3 py-1 inline-flex items-center"
                  >
                    <span className="font-mono text-xs text-purple-300 font-medium">
                      {appFollowingCount} Following
                    </span>
                  </button>
                </div>
                
                {/* NFT count - Only show media NFT count */}
                {nfts && (
                  <div className="flex items-center">
                    <div className="bg-green-500/20 rounded-full px-3 py-1 inline-flex items-center">
                      <span className="font-mono text-sm text-green-300 font-medium">
                        {nfts.filter(nft => {
                          // Apply the same media filter to the count
                          let hasMedia = false;
                          try {
                            const hasAudio = Boolean(nft.hasValidAudio || 
                              nft.audio || 
                              (nft.metadata?.animation_url && (
                                nft.metadata.animation_url.toLowerCase().endsWith('.mp3') ||
                                nft.metadata.animation_url.toLowerCase().endsWith('.wav') ||
                                nft.metadata.animation_url.toLowerCase().endsWith('.m4a') ||
                                nft.metadata.animation_url.toLowerCase().includes('audio/') ||
                                nft.metadata.animation_url.toLowerCase().includes('ipfs')
                              )));
                            const hasVideo = Boolean(nft.isVideo || 
                              (nft.metadata?.animation_url && (
                                nft.metadata.animation_url.toLowerCase().endsWith('.mp4') ||
                                nft.metadata.animation_url.toLowerCase().endsWith('.webm') ||
                                nft.metadata.animation_url.toLowerCase().endsWith('.mov') ||
                                nft.metadata.animation_url.toLowerCase().includes('video/')
                              )));
                            const hasMediaInProperties = nft.metadata?.properties?.files?.some((file: any) => {
                              if (!file) return false;
                              const fileUrl = (file.uri || file.url || '').toLowerCase();
                              const fileType = (file.type || file.mimeType || '').toLowerCase();
                              return fileUrl.endsWith('.mp3') || fileUrl.endsWith('.wav') || fileUrl.endsWith('.m4a') ||
                                    fileUrl.endsWith('.mp4') || fileUrl.endsWith('.webm') || fileUrl.endsWith('.mov') ||
                                    fileType.includes('audio/') || fileType.includes('video/');
                            }) ?? false;
                            hasMedia = hasAudio || hasVideo || hasMediaInProperties;
                          } catch (error) {
                            console.error('Error checking media types in count:', error);
                          }
                          return hasMedia;
                        }).length} Media NFTs
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* NFT Gallery */}
        <div className="container mx-auto px-4">
          <h3 className="text-xl font-semibold mb-3 font-mono text-green-400">
            Media NFTs
          </h3>
          
          {nfts && nfts.length > 0 ? (
            <>
              {(() => {
                // Filter NFTs to only show media (audio/video) NFTs
                const filteredNFTs = useMemo(() => {
                  const filtered = nfts.filter((nft) => {
                    let hasMedia = false;
                    
                    try {
                      // Check for audio in metadata - Same filtering logic as in ExploreView
                      const hasAudio = Boolean(nft.hasValidAudio || 
                        nft.audio || 
                        (nft.metadata?.animation_url && (
                          nft.metadata.animation_url.toLowerCase().endsWith('.mp3') ||
                          nft.metadata.animation_url.toLowerCase().endsWith('.wav') ||
                          nft.metadata.animation_url.toLowerCase().endsWith('.m4a') ||
                          // Check for common audio content types
                          nft.metadata.animation_url.toLowerCase().includes('audio/') ||
                          // Some NFTs store audio in IPFS
                          nft.metadata.animation_url.toLowerCase().includes('ipfs')
                        )));

                      // Check for video in metadata
                      const hasVideo = Boolean(nft.isVideo || 
                        (nft.metadata?.animation_url && (
                          nft.metadata.animation_url.toLowerCase().endsWith('.mp4') ||
                          nft.metadata.animation_url.toLowerCase().endsWith('.webm') ||
                          nft.metadata.animation_url.toLowerCase().endsWith('.mov') ||
                          // Check for common video content types
                          nft.metadata.animation_url.toLowerCase().includes('video/')
                        )));

                      // Also check properties.files if they exist
                      const hasMediaInProperties = nft.metadata?.properties?.files?.some((file: any) => {
                        if (!file) return false;
                        const fileUrl = (file.uri || file.url || '').toLowerCase();
                        const fileType = (file.type || file.mimeType || '').toLowerCase();
                        
                        return fileUrl.endsWith('.mp3') || 
                              fileUrl.endsWith('.wav') || 
                              fileUrl.endsWith('.m4a') ||
                              fileUrl.endsWith('.mp4') || 
                              fileUrl.endsWith('.webm') || 
                              fileUrl.endsWith('.mov') ||
                              fileType.includes('audio/') ||
                              fileType.includes('video/');
                      }) ?? false;

                      hasMedia = hasAudio || hasVideo || hasMediaInProperties;
                    } catch (error) {
                      console.error('Error checking media types:', error);
                    }

                    return hasMedia;
                  });

                  nftLogger.info(`Showing ${filtered.length} media NFTs out of ${nfts.length} total NFTs on profile`);
                  return filtered;
                }, [nfts]);

                return (
                  <UserProfileNFTGrid 
                    nfts={filteredNFTs}
                    onPlayNFT={(nft: NFT) => handlePlayAudio(nft, { queue: filteredNFTs, queueType: 'user' })}
                    currentlyPlaying={currentlyPlaying}
                    isPlaying={isPlaying}
                    handlePlayPause={handlePlayPause}
                    isNFTLiked={isNFTLiked}
                    onLikeToggle={onLikeToggle}
                    userFid={currentUserFid}
                  />
                );
              })()}
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">
              No media NFTs found
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UserProfileView;
