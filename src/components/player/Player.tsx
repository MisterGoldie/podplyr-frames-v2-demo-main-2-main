'use client';
import React, { useContext, useRef, useEffect } from 'react';
import { MinimizedPlayer } from './MinimizedPlayer';
import { MaximizedPlayer } from './MaximizedPlayer';
import type { NFT } from '../../types/user';
import { FarcasterContext } from '../../app/providers';
import { useNFTLikeState } from '../../hooks/useNFTLikeState';

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

  // Get user's FID from context
  const { fid: userFid = 0 } = useContext(FarcasterContext);
  
  // Use the hook to get real-time like state
  const { isLiked } = useNFTLikeState(nft || null, userFid);

  // Handle video synchronization
  useEffect(() => {
    // Detect if we're resuming playback (changing from paused to playing)
    const isResuming = isPlaying && !prevPlayingRef.current;
    
    // Update the ref for next render
    prevPlayingRef.current = isPlaying;
    
    // If no NFT, don't do anything
    if (!nft) return;
    
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

  // Render either minimized or maximized player with all props forwarded
  return (
    <>
      {isMinimized ? (
        <MinimizedPlayer
          nft={nft}
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
          onPictureInPicture={onPictureInPicture} isMinimized={false}        />
      ) : (
        <MaximizedPlayer
            nft={nft}
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
            onPictureInPicture={onPictureInPicture} isMinimized={false}        />
      )}
    </>
  );
};