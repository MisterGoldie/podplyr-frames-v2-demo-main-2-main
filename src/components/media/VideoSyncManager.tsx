'use client';

import { useEffect, useState, useRef } from 'react';
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
  const [isMobile, setIsMobile] = useState(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVideoSwitchingRef = useRef(false);
  const playAttemptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  
  // Detect mobile devices once on mount
  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  }, []);

  // Handle video play/pause sync with audio
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlayingNFT?.isVideo) return;

    // Clear any existing timeouts/intervals when dependencies change
    return () => {
      if (playAttemptTimeoutRef.current) {
        clearTimeout(playAttemptTimeoutRef.current);
        playAttemptTimeoutRef.current = null;
      }
    };
  }, [currentPlayingNFT]);

  // Effect for play/pause state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlayingNFT?.isVideo) return;

    const syncVideo = async () => {
      if (isVideoSwitchingRef.current) return;

      try {
        if (isPlaying) {
          isVideoSwitchingRef.current = true;
          
          // Clear any pending play attempts
          if (playAttemptTimeoutRef.current) {
            clearTimeout(playAttemptTimeoutRef.current);
          }
          
          // Add a delay before playing - longer delay on mobile
          const syncDelay = isMobile ? 300 : 100;
          
          playAttemptTimeoutRef.current = setTimeout(async () => {
            try {
              // On mobile, ensure video is muted first (to work around autoplay restrictions)
              if (isMobile) {
                video.muted = true;
                // Use lower quality playback on mobile 
                video.playsInline = true;
                video.preload = "metadata";
                
                // For iOS specific optimizations
                if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                  // iOS sometimes needs this extra hint
                  video.setAttribute('webkit-playsinline', 'true');
                  video.setAttribute('playsinline', 'true');
                  
                  // Lower resolution for iOS to improve performance
                  if (video.videoHeight > 720) {
                    console.log('Large video detected on iOS, reducing quality');
                    video.style.objectFit = 'contain'; // Helps with performance
                  }
                }
                
                // For Android specific optimizations
                if (/Android/i.test(navigator.userAgent)) {
                  // Some Android browsers need this
                  video.setAttribute('x5-playsinline', 'true');
                  
                  // Reduce CPU usage on Android
                  if (video.style) {
                    video.style.willChange = 'auto';
                  }
                }
              }
              
              // Better error handling with retry logic
              const maxRetries = isMobile ? 2 : 1;
              let retries = 0;
              let playSuccess = false;
              
              while (retries <= maxRetries && !playSuccess) {
                try {
                  // Use a Promise based approach to handle play attempts
                  const playPromise = video.play();
                  if (playPromise !== undefined) {
                    await playPromise;
                    playSuccess = true;
                    console.log('Video play successful on attempt', retries + 1);
                  }
                } catch (error: any) {
                  retries++;
                  if (retries > maxRetries) {
                    // Autoplay was prevented - this is common on mobile
                    if (error.name === 'NotAllowedError') {
                      console.log('Autoplay prevented by browser after retries - this is normal on mobile');
                      // Don't change the audio state in this case
                    } else if (error.name !== 'AbortError') {
                      console.warn('Video playback error after retries:', error.name);
                    }
                  } else {
                    // Short delay before retrying
                    await new Promise(r => setTimeout(r, 100));
                    console.log(`Retrying video play, attempt ${retries + 1}`);
                  }
                }
              }
            } catch (err) {
              // Handle errors silently
              console.log('General video sync error:', err);
            } finally {
              isVideoSwitchingRef.current = false;
            }
          }, syncDelay);
        } else {
          video.pause();
        }
      } catch (err) {
        // Reset state on error
        isVideoSwitchingRef.current = false;
        console.error('Error in syncVideo:', err);
      }
    };

    syncVideo();

    // Add event listeners to handle video state - but only when not on mobile
    // Mobile browsers often have different event handling for media
    if (!isMobile) {
      const handlePlay = () => {
        if (!isPlaying && !isVideoSwitchingRef.current) onPlayPause();
      };
      const handlePause = () => {
        if (isPlaying && !isVideoSwitchingRef.current) onPlayPause();
      };

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      return () => {
        if (playAttemptTimeoutRef.current) {
          clearTimeout(playAttemptTimeoutRef.current);
        }
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }
    
    return () => {
      if (playAttemptTimeoutRef.current) {
        clearTimeout(playAttemptTimeoutRef.current);
      }
    };
  }, [isPlaying, currentPlayingNFT, onPlayPause, videoRef, isMobile]);

  // Keep video in sync with audio progress - with optimizations for mobile
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlayingNFT?.isVideo) return;

    // Ensure any existing interval is cleared
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    // Sync less frequently on mobile to reduce CPU usage
    const syncFrequency = isMobile ? 2000 : 1000;
    // Allow more drift on mobile before correcting
    const allowedDrift = isMobile ? 1.0 : 0.5;

    // Create a new sync interval
    syncIntervalRef.current = setInterval(() => {
      if (!isSyncingRef.current && video) {
        const currentDrift = Math.abs(video.currentTime - audioProgress);
        if (currentDrift > allowedDrift) {
          isSyncingRef.current = true;
          // Set the video time to match audio progress
          video.currentTime = audioProgress;
          isSyncingRef.current = false;
        }
      }
    }, syncFrequency);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [isPlaying, currentPlayingNFT, audioProgress, videoRef, isMobile]);

  return null;
};

export default VideoSyncManager;
//