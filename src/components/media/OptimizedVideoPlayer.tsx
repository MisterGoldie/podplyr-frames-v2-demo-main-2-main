'use client';

import React, { useState, useEffect, useRef } from 'react';
import { NFT } from '../../types/user';
import { processMediaUrl } from '../../utils/media';
import { NFTImage } from './NFTImage';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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
  }, [isLoaded]);
  
  // Handle video loading
  useEffect(() => {
    if (!videoRef.current || !isVisible) return;
    
    const video = videoRef.current;
    
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
    
    return () => {
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [isVisible, onLoadStart, onLoadComplete, onError]);
  
  // Enhance video loading to be more efficient on mobile
  useEffect(() => {
    if (!videoRef.current || !isVisible) return;
    
    const video = videoRef.current;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Implement staged loading for better performance on mobile
    if (isMobile) {
      // Stage 1: Just load metadata
      video.preload = 'metadata';
      
      // Stage 2: Use intersection observer to improve when we start loading
      const loadObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            // Only start loading when video is visible for a moment
            if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
              // We're definitely visible, start loading
              if (!video.paused && !video.ended) {
                // If already playing, don't interrupt
                return;
              }
              
              // Determine if we're on a fast connection
              let isFastConnection = false;
              if ('connection' in navigator) {
                const conn = (navigator as any).connection;
                isFastConnection = conn?.effectiveType === '4g' || conn?.downlink > 1.5;
              }
              
              // For fast connections, allow auto loading
              // For slow connections, keep it at metadata
              video.preload = isFastConnection ? 'auto' : 'metadata';
              
              // Disconnect after deciding
              loadObserver.disconnect();
            }
          });
        },
        { threshold: [0.5] }
      );
      
      loadObserver.observe(video);
      
      return () => {
        loadObserver.disconnect();
      };
    }
    
    // Regular handling for non-mobile
    return undefined;
  }, [isVisible]);
  
  // Generate poster image URL
  const posterUrl = processMediaUrl(nft.image || nft.metadata?.image || '');
  
  // Get video source with correct processing
  const videoUrl = processMediaUrl(nft.metadata?.animation_url || '');
  
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
          autoPlay={autoPlay && !isMobile} // Don't autoplay on mobile
          preload={isMobile ? "metadata" : "auto"} // Only preload metadata on mobile
          {...(isMobile ? {
            'data-mobile': 'true',
            'playsinline': true,
            'webkit-playsinline': 'true',
          } : {})}
        >
          <source src={videoUrl} type="video/mp4" />
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