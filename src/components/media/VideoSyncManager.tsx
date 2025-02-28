'use client';

import { useEffect, useRef } from 'react';
import type { NFT } from '../../types/user';
import { setupHls, destroyHls, isHlsUrl, getHlsUrl } from '../../utils/hlsUtils';
import { processMediaUrl } from '../../utils/media';

interface VideoSyncManagerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentPlayingNFT: NFT | null;
  isPlaying: boolean;
  audioProgress: number;
  onPlayPause: () => void;
}

export const VideoSyncManager: React.FC<VideoSyncManagerProps> = ({
  videoRef,
  currentPlayingNFT,
  isPlaying,
  audioProgress
}) => {
  const hlsInitializedRef = useRef(false);
  
  // Optimize the video sync manager for better performance
  useEffect(() => {
    if (!currentPlayingNFT?.isVideo) return;
    
    // Find the video element directly by a unique ID based on the NFT
    const videoId = `video-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`;
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    
    if (!videoElement) {
      console.error(`VideoSyncManager: Could not find video element with ID ${videoId}`);
      return;
    }
    
    // Use requestAnimationFrame for smoother sync
    let animationFrameId: number;
    let lastSyncTime = 0;
    
    const syncVideoState = (timestamp: number) => {
      // Only sync every 100ms for efficiency
      if (timestamp - lastSyncTime > 100) {
        // Sync play state immediately
        if (isPlaying && videoElement.paused) {
          videoElement.play().catch(e => {
            if (e.name !== 'AbortError') {
              console.error("Failed to play video in sync manager:", e);
              videoElement.muted = true;
              videoElement.play().catch(e2 => console.error("Failed even with muted:", e2));
            }
          });
        } else if (!isPlaying && !videoElement.paused) {
          videoElement.pause();
        }
        
        // Sync time only if difference is significant
        if (Math.abs(videoElement.currentTime - audioProgress) > 0.3) {
          videoElement.currentTime = audioProgress;
        }
        
        lastSyncTime = timestamp;
      }
      
      animationFrameId = requestAnimationFrame(syncVideoState);
    };
    
    // Start the sync loop
    animationFrameId = requestAnimationFrame(syncVideoState);
    
    // Clean up
    return () => {
      cancelAnimationFrame(animationFrameId);
      
      if (hlsInitializedRef.current) {
        destroyHls(videoId);
        hlsInitializedRef.current = false;
      }
    };
  }, [isPlaying, audioProgress, currentPlayingNFT]);

  return null;
};

export default VideoSyncManager;
//