'use client';
import React, { useContext, useRef, useEffect, useState } from 'react';
import { MinimizedPlayer } from './MinimizedPlayer';
import { MaximizedPlayer } from './MaximizedPlayer';
import type { NFT } from '../../types/user';
import { FarcasterContext } from '../../app/providers';
import { useNFTLikeState } from '../../hooks/useNFTLikeState';
import { setPlaybackActive } from '../../utils/media';
import { useVideoPlay } from '../../contexts/VideoPlayContext';
import { logger } from '../../utils/logger';

// Keep all the existing interfaces exactly as they are
interface PlayerProps {
  nft?: NFT | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  isMinimized: boolean;
  onMinimizeToggle: () => void;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  onLikeToggle?: (nft: NFT) => void;
  isLiked?: boolean;
  onPictureInPicture?: () => void;
}

export const Player: React.FC<PlayerProps> = (props) => {
  const {
  nft,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  isMinimized,
  onMinimizeToggle,
  progress,
  duration,
  onSeek,
  onLikeToggle,
  onPictureInPicture
  } = props;

  // Video reference for syncing video playback
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const prevPlayingRef = useRef(isPlaying);
  const isFirstMountRef = useRef(true);
  const initialPlayAttemptsRef = useRef(0);

  // Get user's FID from context
  const { fid: userFid = 0 } = useContext(FarcasterContext);
  
  // Use the hook to get real-time like state
  const { isLiked } = useNFTLikeState(nft || null, userFid);
  
  // Get progress tracking functions
  const { trackNFTProgress } = useVideoPlay();

  // Add a ref to track the current video position
  const lastPositionRef = useRef<number>(0);
  
  // Track progress for 25% threshold calculation
  useEffect(() => {
    if (nft && isPlaying && progress > 0 && duration > 0) {
      // Track playback progress for the 25% threshold
      trackNFTProgress(nft, progress, duration);
    }
  }, [nft, isPlaying, progress, duration, trackNFTProgress]);

  // Handle video synchronization
  useEffect(() => {
    // Detect if we're resuming playback (changing from paused to playing)
    const isResuming = isPlaying && !prevPlayingRef.current;
    
    // Update the ref for next render
    prevPlayingRef.current = isPlaying;
    
    // Set the global playback active state to reduce logging during playback
    setPlaybackActive(isPlaying);
    
    // If no NFT, don't do anything
    if (!nft) return;
    
    // Log video sync status - helps debug first NFT issues
    const hasVideoRef = !!videoRef.current;
    logger.debug(`🎥 Player video sync - NFT: ${nft.name}, isPlaying: ${isPlaying}, has videoRef: ${hasVideoRef}`);
    
    // First try using our ref
    if (videoRef.current) {
      try {
        if (isPlaying) {
          // Only sync time when resuming playback to avoid choppy video
          if (isResuming) {
            videoRef.current.currentTime = progress;
          }
          videoRef.current.play().catch(e => console.error("Video play error with ref:", e));
        } else {
          videoRef.current.pause();
        }
      } catch (e) {
        console.error("Error controlling video with ref:", e);
      }
    }
    
    // As a backup, try direct DOM access for both minimized and maximized states
    if (nft?.isVideo || nft?.metadata?.animation_url) {
      const videoId = `video-${nft.contract}-${nft.tokenId}`;
      const videoElement = document.getElementById(videoId) as HTMLVideoElement;
      
      if (videoElement && videoElement !== videoRef.current) {
        try {
          if (isPlaying) {
            // Only sync time when resuming playback to avoid choppy video
            if (isResuming) {
              videoElement.currentTime = progress;
            }
            videoElement.play().catch(e => console.error("Video play error with DOM:", e));
          } else {
            videoElement.pause();
          }
        } catch (e) {
          console.error("Error controlling video with DOM:", e);
        }
      }
    }
  }, [isPlaying, nft, progress]);

  // First mount detection with retry mechanism for initial video playback
  useEffect(() => {
    // Skip if no NFT
    if (!nft) return;
    
    // Only run on first mount
    if (isFirstMountRef.current && (nft?.isVideo || nft?.metadata?.animation_url)) {
      logger.debug(`💡 First NFT detected in Player: ${nft.name}`);
      
      // Setup retry mechanism for first NFT video playback
      const attemptVideoPlay = () => {
        const videoId = `video-${nft.contract}-${nft.tokenId}`;
        const videoElement = document.getElementById(videoId) as HTMLVideoElement;
        
        if (videoElement) {
          logger.debug(`📼 Executing play for first NFT video: ${nft.name}`);
          // Ensure video element is connected to DOM and ready
          if (document.body.contains(videoElement) && videoElement.readyState >= 2) {
            // Update our ref if it's not already set
            if (!videoRef.current) {
              videoRef.current = videoElement;
            }
            // Try to play the video
            videoElement.play().catch(e => {
              logger.error(`⚠️ Error playing first NFT video: ${e.message}`);
            });
            return true; // Success
          }
        }
        return false; // Video element not ready yet
      };
      
      // Try immediately
      if (!attemptVideoPlay()) {
        // If failed, retry with increasing delays
        const retryTimes = [100, 300, 600, 1000]; // Increasing delay pattern
        
        retryTimes.forEach((delay, index) => {
          setTimeout(() => {
            if (initialPlayAttemptsRef.current <= index) {
              initialPlayAttemptsRef.current = index + 1;
              logger.debug(`⏱️ Retry #${index + 1} for first NFT video: ${nft.name}`);
              attemptVideoPlay();
            }
          }, delay);
        });
      }
      
      // Mark first mount as complete
      isFirstMountRef.current = false;
    }
  }, [nft]);
  
  // Add this effect to save the current video position before state changes
  useEffect(() => {
    if (nft?.isVideo || nft?.metadata?.animation_url) {
      const videoId = `video-${nft.contract}-${nft.tokenId}`;
      const videoElement = document.getElementById(videoId) as HTMLVideoElement;
      
      if (videoElement) {
        // Save current position when player state changes or component unmounts
        const savePosition = () => {
          lastPositionRef.current = videoElement.currentTime;
          console.log("Saved position:", lastPositionRef.current);
        };
        
        videoElement.addEventListener('timeupdate', () => {
          lastPositionRef.current = videoElement.currentTime;
        });
        
        return () => {
          savePosition();
        };
      }
    }
  }, [nft, isMinimized]);

  // Guard clause for null NFT
  if (!nft) return null;

  // Proper function to handle minimize toggle with synchronization
  const handleMinimizeToggle = () => {
    console.log("Current minimized state:", isMinimized);
    
    // Store current video state before toggling
    const currentNftId = `${nft.contract}-${nft.tokenId}`;
    const videoPlaybackInfo = {
      isPlaying,
      progress,
      nftId: currentNftId
    };
    
    // Call the toggle function from props
    onMinimizeToggle();
    
    console.log("New minimized state:", !isMinimized);
    
    // After toggling, sync the video element with the stored state
    // Use requestAnimationFrame to ensure this happens after the DOM updates
    requestAnimationFrame(() => {
      // We add a tiny delay to ensure the DOM has been updated with the new state
      setTimeout(() => {
        try {
          const videoId = `video-${currentNftId}`;
          const videoElement = document.getElementById(videoId) as HTMLVideoElement;
          
          if (videoElement) {
            // Set the current time to match the progress
            videoElement.currentTime = videoPlaybackInfo.progress;
            
            // If it was playing, ensure it continues playing
            if (videoPlaybackInfo.isPlaying) {
              videoElement.play().catch(e => {
                console.error("Failed to play video after minimize toggle:", e);
              });
            }
          }
        } catch (error) {
          console.error("Error during minimize toggle video sync:", error);
        }
      }, 16); // ~1 frame at 60fps
    });
  };

  // Animation state management
  const [isAnimating, setIsAnimating] = useState(false);
  const [showMinimized, setShowMinimized] = useState(isMinimized);
  const [showMaximized, setShowMaximized] = useState(!isMinimized);
  
  // Handle animation state changes when minimized state changes
  useEffect(() => {
    if (isAnimating) return; // Don't interrupt ongoing animations
    
    setShowMinimized(isMinimized);
    setShowMaximized(!isMinimized);
  }, [isMinimized, isAnimating]);
  
  // Enhanced minimize toggle with animation and video sync
  const handleAnimatedMinimizeToggle = () => {
    // Save current video position before starting animation
    if (nft?.isVideo || nft?.metadata?.animation_url) {
      const videoId = `video-${nft.contract}-${nft.tokenId}`;
      const videoElement = document.getElementById(videoId) as HTMLVideoElement;
      
      if (videoElement) {
        lastPositionRef.current = videoElement.currentTime;
        console.log("Saved video position before transition:", lastPositionRef.current);
      }
    }
    
    setIsAnimating(true);
    
    if (isMinimized) {
      // Going from minimized to maximized
      setShowMaximized(true);
      // Short delay before hiding minimized view (after animation completes)
      setTimeout(() => {
        onMinimizeToggle();
        
        // After state changes, give a moment for the DOM to update
        setTimeout(() => {
          // After state has changed, ensure video position is maintained
          syncVideoPositionAfterTransition();
          
          setShowMinimized(false);
          setIsAnimating(false);
        }, 50);
      }, 300); // Match transition duration in the components
    } else {
      // Going from maximized to minimized
      setShowMinimized(true);
      // Short delay before hiding maximized view (after animation completes)
      setTimeout(() => {
        onMinimizeToggle();
        
        // After state changes, give a moment for the DOM to update
        setTimeout(() => {
          // After state has changed, ensure video position is maintained
          syncVideoPositionAfterTransition();
          
          setShowMaximized(false);
          setIsAnimating(false);
        }, 50);
      }, 300); // Match transition duration in the components
    }
  };
  
  // Helper function to sync video position after state transitions
  const syncVideoPositionAfterTransition = () => {
    if (!nft?.isVideo && !nft?.metadata?.animation_url) return;
    
    // Find the video element after the transition
    const videoId = `video-${nft.contract}-${nft.tokenId}`;
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    
    if (videoElement && lastPositionRef.current > 0) {
      // Set the same position as before the transition
      videoElement.currentTime = lastPositionRef.current;
      console.log("Restored video position after transition:", lastPositionRef.current);
      
      // If the video was playing, ensure it continues playing
      if (isPlaying) {
        videoElement.play().catch(e => {
          console.error("Failed to resume video after transition:", e);
        });
      }
    }
  };
  
  // Render either minimized or maximized player with all props forwarded
  return (
    <>
      {showMinimized && (
        <MinimizedPlayer
          nft={nft}
          isPlaying={isPlaying}
          onPlayPause={onPlayPause}
          onNext={onNext}
          onPrevious={onPrevious}
          onMinimizeToggle={handleAnimatedMinimizeToggle}
          progress={progress}
          duration={duration}
          onSeek={onSeek}
          onLikeToggle={onLikeToggle ? (nft) => onLikeToggle(nft) : undefined}
          isLiked={isLiked}
          onPictureInPicture={onPictureInPicture}
          lastPosition={lastPositionRef.current}
          isMinimized={isMinimized}
          isAnimating={isAnimating}
          userFid={userFid}          
        />
      )}
      {showMaximized && (
        <MaximizedPlayer
            nft={nft}
            isMinimized={isMinimized}
            isAnimating={isAnimating}
            isPlaying={isPlaying}
            onPlayPause={onPlayPause}
            onNext={onNext}
            onPrevious={onPrevious}
            onMinimizeToggle={onMinimizeToggle}
            progress={progress}
            duration={duration}
            onSeek={onSeek}
            onLikeToggle={onLikeToggle ? (nft) => onLikeToggle(nft) : undefined}
            isLiked={isLiked}
            onPictureInPicture={onPictureInPicture}
            lastPosition={lastPositionRef.current}
        />
      )}
    </>
  );
};