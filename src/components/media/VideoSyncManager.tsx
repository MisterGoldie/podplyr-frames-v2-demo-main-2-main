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
  
  // Update VideoSyncManager to ensure immediate playback and sync
  useEffect(() => {
    if (!currentPlayingNFT?.isVideo) return;
    
    // Find the video element directly by a unique ID based on the NFT
    const videoId = `video-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`;
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    
    if (!videoElement) {
      console.error(`VideoSyncManager: Could not find video element with ID ${videoId}`);
      return;
    }
    
    console.log("VideoSyncManager sync state:", isPlaying);
    
    // Immediately sync play state
    if (isPlaying) {
      videoElement.play().catch(e => {
        console.error("Failed to play video in sync manager:", e);
        videoElement.muted = true;
        videoElement.play().catch(e2 => console.error("Failed even with muted:", e2));
      });
    } else {
      videoElement.pause();
    }
    
    // Also sync time
    if (Math.abs(videoElement.currentTime - audioProgress) > 0.3) {
      videoElement.currentTime = audioProgress;
    }
    
    // Try to use HLS when possible for Farcaster Frame compatibility
    const rawVideoUrl = processMediaUrl(currentPlayingNFT.metadata?.animation_url || '');
    const hlsUrl = getHlsUrl(rawVideoUrl);
    const shouldUseHls = isHlsUrl(hlsUrl);
    
    // Set up HLS for better Farcaster Frame compatibility if available
    if (shouldUseHls && !hlsInitializedRef.current) {
      setupHls(videoId, videoElement, hlsUrl)
        .then(() => {
          hlsInitializedRef.current = true;
          console.log('HLS initialized for synced video');
          
          // Critical: After HLS init, force sync with audio state
          syncVideoWithAudio(videoElement);
        })
        .catch((error) => {
          console.error('Error setting up HLS for synced video:', error);
          // Fall back to direct URL
          videoElement.src = rawVideoUrl;
          videoElement.load();
          
          // Add loadeddata event to ensure sync after manual load
          videoElement.addEventListener('loadeddata', () => syncVideoWithAudio(videoElement), { once: true });
        });
    } else if (!shouldUseHls && videoElement.src !== rawVideoUrl) {
      videoElement.src = rawVideoUrl;
      videoElement.load();
      
      // Add loadeddata event to ensure sync after manual load
      videoElement.addEventListener('loadeddata', () => syncVideoWithAudio(videoElement), { once: true });
    } else {
      // If no loading needed, sync immediately
      syncVideoWithAudio(videoElement);
    }
    
    // Helper function to sync video with audio state
    function syncVideoWithAudio(video: HTMLVideoElement) {
      // Always force time sync first
      if (Math.abs(video.currentTime - audioProgress) > 0.2) {
        console.log("Syncing video time to:", audioProgress);
        video.currentTime = audioProgress;
      }
      
      // Then sync play state
      if (isPlaying) {
        console.log("Starting video playback");
        video.play().catch((e) => {
          console.error("Failed to play video:", e);
          // If play fails, try muted (for mobile)
          video.muted = true;
          video.play().catch((e2) => {
            console.error("Failed to play muted video:", e2);
          });
        });
      } else {
        console.log("Pausing video");
        video.pause();
      }
    }
    
    // Add continuous sync for time
    const handleTimeUpdate = () => {
      if (Math.abs(videoElement.currentTime - audioProgress) > 0.3) {
        videoElement.currentTime = audioProgress;
      }
    };
    
    // Use a dedicated timeupdate listener for continuous sync
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    
    // Clean up
    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      
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