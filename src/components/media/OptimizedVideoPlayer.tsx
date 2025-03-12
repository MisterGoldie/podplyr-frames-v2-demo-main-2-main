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
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

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
          setIsVisible(false);
          
          if (videoRef.current) {
            const videoId = getVideoId();
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
    if (isHlsUrl(videoUrl) && typeof window !== 'undefined') {
      if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari has native HLS support
        setUseHls(true);
      } else {
        // For other browsers, we'll let the setupHls function handle it
        setUseHls(true);
      }
    }
  }, [videoUrl]);
  
  // Generate a consistent videoId for this component instance
  const getVideoId = () => `video-${nft.contract}-${nft.tokenId}`;
  
  // Load the video when it becomes visible
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
    
    // Set up HLS if needed and not already initialized
    if (useHls && !hlsInitialized) {
      setHlsInitialized(true);
      
      setupHls(getVideoId(), video, videoUrl)
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
    
    return () => {
      // Cleanup event listeners
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      
      // Clean up HLS if needed
      if (useHls) {
        destroyHls(getVideoId());
      }
    };
  }, [isVisible, nft, rawVideoUrl, videoUrl, useHls, hlsInitialized, onLoadStart, onLoadComplete, onError]);
  
  // Basic buffering detection
  useEffect(() => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    
    const handleWaiting = () => {
      setIsBuffering(true);
    };
    
    const handlePlaying = () => {
      setIsBuffering(false);
    };
    
    const handleError = () => {
      const errorMessage = video.error?.message || 'Unknown error';
      setPlaybackError(errorMessage);
      if (onError) onError(new Error(errorMessage));
    };
    
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
    };
  }, [onError]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {isVisible ? (
        <>
          <video
            ref={videoRef}
            id={getVideoId()}
            className="w-full h-full object-cover rounded-md"
            poster={posterUrl}
            muted={muted}
            loop={loop}
            playsInline
            autoPlay={autoPlay}
            preload={isMobile ? "metadata" : "auto"}
            controls
          >
            {!useHls && <source src={rawVideoUrl} type="video/mp4" />}
            Your browser does not support the video tag.
          </video>
          
          {/* Simple buffering indicator */}
          {isBuffering && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: '50%',
              width: '50px',
              height: '50px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <div style={{
                border: '4px solid rgba(255,255,255,0.3)',
                borderTop: '4px solid white',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                animation: 'spin 1s linear infinite'
              }}></div>
            </div>
          )}
          
          {/* Show playback error */}
          {playbackError && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '4px',
              maxWidth: '80%',
              textAlign: 'center',
            }}>
              Error: {playbackError}
            </div>
          )}
        </>
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
