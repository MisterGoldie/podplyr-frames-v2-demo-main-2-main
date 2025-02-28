'use client';

import React, { useState, useEffect, useRef } from 'react';
import { NFT } from '../../types/user';
import { processMediaUrl } from '../../utils/media';
import { NFTImage } from './NFTImage';
import { setupHls, destroyHls, isHlsUrl, getHlsUrl } from '../../utils/hlsUtils';

interface OptimizedVideoPlayerProps {
  nft: NFT;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  onError?: (error: Error) => void;
}

export const OptimizedVideoPlayer: React.FC<OptimizedVideoPlayerProps> = ({
  nft,
  autoPlay = false,
  muted = true,
  loop = true,
  onLoadStart,
  onLoadComplete,
  onError
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [useHls, setUseHls] = useState(false);
  const [hlsInitialized, setHlsInitialized] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const MAX_MOBILE_RESOLUTION = 480; // Maximum height for mobile videos
  const MAXIMUM_VIDEO_SIZE_MB = 5; // Target max size for videos on mobile
  
  // Detect if we're on mobile
  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  }, []);
  
  // Use Intersection Observer to only load when visible
  useEffect(() => {
    if (!containerRef.current) return;
    
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };
    
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else if (!isLoaded) {
          // If video hasn't loaded yet, we can unload it when it scrolls out of view
          setIsVisible(false);
          
          // Also destroy any HLS instance to free up resources
          if (videoRef.current) {
            const videoId = `video-${nft.contract}-${nft.tokenId}`;
            destroyHls(videoId);
            setHlsInitialized(false);
          }
        }
      });
    };
    
    const observer = new IntersectionObserver(handleIntersection, options);
    observer.observe(containerRef.current);
    
    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [isLoaded, nft.contract, nft.tokenId]);
  
  // Process video URL and determine if we should use HLS
  const posterUrl = processMediaUrl(nft.image || nft.metadata?.image || '');
  const rawVideoUrl = processMediaUrl(nft.metadata?.animation_url || '');
  const videoUrl = getHlsUrl(rawVideoUrl);
  
  // Decide if we should use HLS
  useEffect(() => {
    // Check if this is an HLS URL or if HLS.js is supported
    if ((isHlsUrl(videoUrl) || isMobile) && typeof window !== 'undefined') {
      // Try to use HLS
      if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari has native HLS support
        setUseHls(true);
      } else {
        // For other browsers, we'll let the setupHls function handle it
        setUseHls(true);
      }
    }
  }, [videoUrl, isMobile]);
  
  // Handle video loading - now with HLS support
  useEffect(() => {
    if (!videoRef.current || !isVisible) return;
    
    const video = videoRef.current;
    const videoId = `video-${nft.contract}-${nft.tokenId}`;
    
    // Event listeners for all cases
    const handleLoadStart = () => {
      onLoadStart?.();
    };
    
    const handleLoadedData = () => {
      setIsLoaded(true);
      onLoadComplete?.();
    };
    
    const handleError = (e: Event) => {
      console.error('Video loading error:', e);
      onError?.(new Error('Failed to load video'));
    };
    
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    
    // Set up HLS if needed and not already initialized
    if (useHls && !hlsInitialized) {
      setHlsInitialized(true);
      
      setupHls(videoId, video, videoUrl)
        .then(() => {
          console.log('HLS initialized successfully');
        })
        .catch((error: Error) => {
          console.error('Error setting up HLS:', error);
          // Fall back to regular video
          if (!isHlsUrl(videoUrl)) {
            video.src = rawVideoUrl;
            video.load();
          }
        });
    } else if (!useHls && !video.src) {
      // For non-HLS, set the source directly if not already set
      video.src = rawVideoUrl;
      video.load();
    }
    
    // If on mobile, implement additional optimization
    if (isMobile) {
      // Stage 1: Just load metadata
      video.preload = 'metadata';
      
      // Stage 2: Use secondary intersection observer for more precise loading
      const loadObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            // Only fully load when video is properly visible
            if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
              // We're definitely visible, decide on loading strategy
              if (!video.paused && !video.ended) {
                // If already playing, don't interrupt
                return;
              }
              
              // Check connection quality
              let isFastConnection = false;
              if ('connection' in navigator) {
                const conn = (navigator as any).connection;
                isFastConnection = conn?.effectiveType === '4g' || conn?.downlink > 1.5;
              }
              
              // Adjust loading behavior based on connection
              if (!useHls) {
                // For direct MP4, manage preload
                video.preload = isFastConnection ? 'auto' : 'metadata';
              }
              
              // Disconnect observer once we've made our decision
              loadObserver.disconnect();
            }
          });
        },
        { threshold: [0.5] }
      );
      
      loadObserver.observe(video);
      
      // Force aggressively unload videos when not in main view for Frame apps
      const frameObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting || entry.intersectionRatio < 0.8) {
              // When mostly or fully hidden, aggressively release resources
              if (video.src) {
                // Completely unload the video - don't just pause
                video.removeAttribute('src');
                video.load(); // Forces unloading from memory
                
                // Also destroy any HLS resources
                if (useHls) {
                  destroyHls(videoId);
                  setHlsInitialized(false);
                }
              }
            }
          });
        },
        { threshold: [0.8] }
      );
      
      if (containerRef.current) {
        frameObserver.observe(containerRef.current);
      }
      
      return () => {
        loadObserver.disconnect();
        frameObserver.disconnect();
      };
    }
    
    return () => {
      // Cleanup event listeners
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      
      // Clean up HLS if needed
      if (useHls) {
        destroyHls(videoId);
      }
    };
  }, [isVisible, nft, rawVideoUrl, videoUrl, useHls, hlsInitialized, isMobile, onLoadStart, onLoadComplete, onError]);
  
  const restrictVideoQuality = (video: HTMLVideoElement) => {
    if (!video) return;
    
    // Force lower resolution for mobile devices by applying CSS constraints
    if (isMobile) {
      // Apply hard cap on video height - this will force downscaling
      video.style.maxHeight = `${MAX_MOBILE_RESOLUTION}px`;
      
      // Explicitly override the source if possible to get smaller files
      // (For cases where we can identify a lower quality source)
      if (rawVideoUrl.includes('ipfs.io')) {
        // Try to get a smaller thumbnail/preview instead of full video for IPFS
        // (This depends on your specific data structure)
      }
    }
    
    // Reduce rendering quality on mobile by applying CSS
    video.style.imageRendering = isMobile ? 'optimizeSpeed' : 'auto';
  };
  
  return (
    <div ref={containerRef} className="w-full h-full relative">
      {isVisible ? (
        <video
          ref={videoRef}
          id={`video-${nft.contract}-${nft.tokenId}`}
          className="w-full h-full object-cover rounded-md"
          poster={posterUrl}
          muted={muted}
          loop={loop}
          playsInline
          autoPlay={false}
          preload={isMobile ? "none" : "metadata"}
          {...(isMobile ? {
            'data-mobile': 'true',
            'playsinline': true,
            'webkit-playsinline': 'true',
            'controls': true,
          } : {})}
        >
          {!useHls && <source src={rawVideoUrl} type="video/mp4" />}
          Your browser does not support the video tag.
        </video>
      ) : (
        // Show image placeholder until video is visible
        <NFTImage
          nft={nft}
          src={posterUrl}
          alt={nft.name || 'NFT Media'}
          className="w-full h-full object-cover rounded-md"
          width={320}
          height={320}
          priority={false}
        />
      )}
    </div>
  );
}; 