'use client';

import { useEffect } from 'react';
import type { NFT } from '../../types/user';

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
  // Ultra-simplified sync approach
  useEffect(() => {
    if (!videoRef.current || !currentPlayingNFT?.isVideo) return;
    
    const video = videoRef.current;
    
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
  }, [isPlaying, audioProgress, currentPlayingNFT, videoRef]);

  return null;
};

export default VideoSyncManager;
//