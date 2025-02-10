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
  audioProgress,
  onPlayPause
}) => {
  // Handle video play/pause sync with audio
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlayingNFT?.isVideo) return;

    let isVideoSwitching = false;
    let playAttemptTimeout: NodeJS.Timeout;

    const syncVideo = async () => {
      if (isVideoSwitching) return;

      try {
        if (isPlaying) {
          isVideoSwitching = true;
          // Clear any pending play attempts
          clearTimeout(playAttemptTimeout);
          
          // Add a small delay before playing to allow for quick switches
          playAttemptTimeout = setTimeout(async () => {
            try {
              await video.play();
            } catch (err) {
              // Ignore AbortError as it's expected during quick switches
              if (err instanceof Error && err.name !== 'AbortError') {
                console.warn('Non-critical video sync warning:', err);
              }
            } finally {
              isVideoSwitching = false;
            }
          }, 100);
        } else {
          video.pause();
        }
      } catch (err) {
        // Ignore errors during video switching
        isVideoSwitching = false;
      }
    };

    syncVideo();

    // Add event listeners to handle video state
    const handlePlay = () => {
      if (!isPlaying && !isVideoSwitching) onPlayPause();
    };
    const handlePause = () => {
      if (isPlaying && !isVideoSwitching) onPlayPause();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      clearTimeout(playAttemptTimeout);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [isPlaying, currentPlayingNFT, onPlayPause, videoRef]);

  // Keep video in sync with audio progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlayingNFT?.isVideo) return;

    let isSyncing = false;

    const syncVideo = async () => {
      if (isSyncing) return;
      
      try {
        isSyncing = true;
        if (isPlaying) {
          try {
            await video.play();
          } catch (err) {
            // Ignore AbortError as it's expected during quick switches
            if (err instanceof Error && err.name !== 'AbortError') {
              console.warn('Non-critical video sync warning:', err);
            }
          }
        } else {
          video.pause();
        }
      } finally {
        isSyncing = false;
      }
    };

    syncVideo();

    // Keep video in sync with audio progress
    const syncInterval = setInterval(() => {
      if (!isSyncing && video && Math.abs(video.currentTime - audioProgress) > 0.5) {
        video.currentTime = audioProgress;
      }
    }, 1000);

    return () => {
      clearInterval(syncInterval);
    };
  }, [isPlaying, currentPlayingNFT, audioProgress, videoRef]);

  return null;
};

export default VideoSyncManager;
//