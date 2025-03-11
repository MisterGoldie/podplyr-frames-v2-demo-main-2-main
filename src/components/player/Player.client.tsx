'use client';

import { Player as BasePlayer } from './Player';
import { NFT } from '../../types/user';
import { FC, useEffect, useRef } from 'react';
import { 
  isCellularConnection, 
  getOptimizedCellularVideoUrl,
  getCellularVideoSettings
} from '../../utils/cellularOptimizer';
import { getHlsInstance, isHlsUrl } from '../../utils/hlsUtils';
import Hls from 'hls.js';

interface PlayerClientProps {
  nft: NFT;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  isMinimized: boolean;
  onMinimizeToggle: () => void;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
}

export const PlayerClient: FC<PlayerClientProps> = (props) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!props.nft?.isVideo && !props.nft?.metadata?.animation_url) return;
    
    const video = videoRef.current;
    if (!video) return;
    
    // Set video properties
    video.playsInline = true;
    video.muted = true;
    video.loop = true;
    
    // Play/pause based on isPlaying prop
    if (props.isPlaying) {
      video.play().catch(e => {
        console.error("Player: Failed to play video:", e);
      });
    } else {
      video.pause();
    }
  }, [props.nft, props.isPlaying]);

  useEffect(() => {
    if (!props.nft?.isVideo && !props.nft?.metadata?.animation_url) return;
    
    const video = videoRef.current;
    if (!video) return;
    
    // Set essential properties
    video.playsInline = true;
    video.muted = true;
    video.loop = true;
    
    // Get the video URL
    const rawVideoUrl = props.nft.metadata?.animation_url || '';
    
    // Apply cellular optimizations
    const isCellular = isCellularConnection();
    const cellularSettings = getCellularVideoSettings();
    
    // Get optimized URL based on network conditions
    const videoUrl = isCellular 
      ? getOptimizedCellularVideoUrl(rawVideoUrl)
      : rawVideoUrl;
    
    // Set appropriate preload strategy
    video.preload = isCellular 
      ? (cellularSettings.preloadStrategy as any) 
      : 'auto';
    
    // Flag to prevent operations on unmounted component
    let isActive = true;
    let hlsInstance: Hls | null = null;
    
    const setupVideo = async () => {
      try {
        // Use HLS.js for streaming if applicable
        if (isHlsUrl(videoUrl) && Hls.isSupported()) {
          // Get HLS instance with the URL as parameter
          hlsInstance = getHlsInstance(videoUrl);
          
          // Then attach the media element
          if (hlsInstance) {
            hlsInstance.attachMedia(video);
            
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
              if (!isActive) return;
              if (props.isPlaying) video.play().catch(e => console.error("HLS play error:", e));
            });
          }
        } else {
          // Regular video source handling
          if (videoUrl !== video.src) {
            console.log("Setting optimized video source:", 
              isCellular ? "Cellular optimized" : "Normal",
              videoUrl
            );
            video.src = videoUrl;
            video.load();
          }
          
          // Handle playback with delay for buffering
          setTimeout(() => {
            if (!isActive) return;
            if (props.isPlaying) {
              video.play().catch(err => {
                console.error("Video play error:", err);
                // One retry
                setTimeout(() => {
                  if (!isActive) return;
                  video.play().catch(e => console.error("Retry failed:", e));
                }, 500);
              });
            } else {
              video.pause();
            }
          }, 300); // Longer delay for buffering
        }
      } catch (err) {
        console.error("Video setup error:", err);
      }
    };
    
    setupVideo();
    
    // CRITICAL: Proper cleanup
    return () => {
      isActive = false;
      
      // Clean up HLS if needed
      if (hlsInstance) {
        hlsInstance.destroy();
      }
      
      // Clean up video element
      if (video) {
        video.pause();
        video.src = '';
        video.load();
      }
    };
  }, [props.nft, props.isPlaying]);

  // Add this effect to keep the video synchronized with the player controls
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !props.nft?.isVideo && !props.nft?.metadata?.animation_url) return;
    
    // CRITICAL FIX: Force the video position to match the player progress
    // This ensures the video and controls stay in sync
    if (Math.abs(video.currentTime - props.progress) > 0.5) {
      video.currentTime = props.progress;
    }
    
    // Listen for video time updates and report back accurate positions
    const handleTimeUpdate = () => {
      // This ensures the parent component knows the actual video position
      if (Math.abs(video.currentTime - props.progress) > 0.5 && props.onSeek) {
        props.onSeek(video.currentTime);
      }
    };
    
    // Add the listener to keep things in sync
    video.addEventListener('timeupdate', handleTimeUpdate);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [props.progress, props.nft, props.onSeek]);

  return <BasePlayer {...props} />;
}; 