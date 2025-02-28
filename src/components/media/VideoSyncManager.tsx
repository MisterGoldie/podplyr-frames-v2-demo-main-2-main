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
    if (!videoRef.current || !currentPlayingNFT?.isVideo) return;
    
    const video = videoRef.current;
    const videoId = `video-sync-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`;
    
    // Try to use HLS when possible for Farcaster Frame compatibility
    const rawVideoUrl = processMediaUrl(currentPlayingNFT.metadata?.animation_url || '');
    const hlsUrl = getHlsUrl(rawVideoUrl);
    const shouldUseHls = isHlsUrl(hlsUrl);
    
    // Set up HLS for better Farcaster Frame compatibility if available
    if (shouldUseHls && !hlsInitializedRef.current) {
      setupHls(videoId, video, hlsUrl)
        .then(() => {
          hlsInitializedRef.current = true;
          console.log('HLS initialized for synced video');
        })
        .catch((error) => {
          console.error('Error setting up HLS for synced video:', error);
          // Fall back to direct URL
          video.src = rawVideoUrl;
          video.load();
        });
    } else if (!shouldUseHls && video.src !== rawVideoUrl) {
      video.src = rawVideoUrl;
      video.load();
    }
    
    // Direct approach: just set state and let browser handle it
    if (isPlaying) {
      video.play().catch(() => {
        // If play fails, try muted (for mobile)
        video.muted = true;
        video.play().catch(() => {
          console.log('Cannot play video even when muted');
        });
      });
    } else {
      video.pause();
    }
    
    // Very basic time sync
    if (Math.abs(video.currentTime - audioProgress) > 0.5) {
      video.currentTime = audioProgress;
    }
    
    // Clean up HLS when component unmounts or NFT changes
    return () => {
      if (hlsInitializedRef.current) {
        destroyHls(videoId);
        hlsInitializedRef.current = false;
      }
    };
  }, [isPlaying, audioProgress, currentPlayingNFT, videoRef]);

  return null;
};

export default VideoSyncManager;
//