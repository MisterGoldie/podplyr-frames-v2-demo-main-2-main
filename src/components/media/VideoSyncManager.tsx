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
  
  // Ultra-simplified sync approach
  useEffect(() => {
    if (!currentPlayingNFT?.isVideo) return;
    
    // Find the video element directly by a unique ID based on the NFT
    const videoId = `video-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`;
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    
    if (!videoElement) {
      console.error(`VideoSyncManager: Could not find video element with ID ${videoId}`);
      return;
    }
    
    console.log("VideoSyncManager found video element:", videoElement);
    
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
        })
        .catch((error) => {
          console.error('Error setting up HLS for synced video:', error);
          // Fall back to direct URL
          videoElement.src = rawVideoUrl;
          videoElement.load();
        });
    } else if (!shouldUseHls && videoElement.src !== rawVideoUrl) {
      videoElement.src = rawVideoUrl;
      videoElement.load();
    }
    
    // Direct approach: just set state and let browser handle it
    if (isPlaying) {
      videoElement.play().catch(() => {
        // If play fails, try muted (for mobile)
        videoElement.muted = true;
        videoElement.play().catch(() => {
          console.log('Cannot play video even when muted');
        });
      });
    } else {
      videoElement.pause();
    }
    
    // Very basic time sync
    if (Math.abs(videoElement.currentTime - audioProgress) > 0.5) {
      videoElement.currentTime = audioProgress;
    }
    
    // Clean up HLS when component unmounts or NFT changes
    return () => {
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