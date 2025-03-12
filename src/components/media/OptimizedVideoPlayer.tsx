'use client';

import React, { useState, useEffect, useRef } from 'react';
import { NFT } from '../../types/user';
import { processMediaUrl } from '../../utils/media';
import { NFTImage } from './NFTImage';
import { setupHls, destroyHls, isHlsUrl, getHlsUrl } from '../../utils/hlsUtils';
import { getNetworkInfo, isMobileDevice } from '../../utils/deviceDetection';
import { isCellularConnection, getCellularVideoSettings, getOptimizedCellularVideoUrl, getPreviewVideoUrl } from '../../utils/cellularOptimizer';

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
  
  const [networkQuality, setNetworkQuality] = useState<'poor'|'medium'|'good'>('medium');
  const [isBuffering, setIsBuffering] = useState(false);
  const bufferingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add cellular detection
  const [isCellular, setIsCellular] = useState(false);
  const [cellularGeneration, setCellularGeneration] = useState<'2G'|'3G'|'4G'|'5G'>('4G');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [hasLoadedFullVideo, setHasLoadedFullVideo] = useState(false);
  
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
  
  // Generate a consistent videoId for this component instance
  const getVideoId = () => `video-${nft.contract}-${nft.tokenId}`;
  
  // Update the video loading logic with progressive enhancement
  useEffect(() => {
    if (!videoRef.current || !isVisible) return;
    
    const video = videoRef.current;
    
    // For mobile with poor connection - use progressive enhancement
    if (isMobile) {
      // Get network quality
      const { effectiveType, downlink } = getNetworkInfo();
      const isPoorConnection = 
        effectiveType === 'slow-2g' || 
        effectiveType === '2g' || 
        effectiveType === '3g' || 
        downlink < 1;
      
      if (isPoorConnection && !useHls) {
        console.log('Using progressive enhancement for poor connection');
        
        // 1. Start with lowest quality poster image
        video.poster = getLowQualityPoster(nft);
        
        // 2. Use progressive quality enhancement
        setProgressiveVideoSource(video, rawVideoUrl, isPoorConnection);
      }
    }

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
                  destroyHls(getVideoId());
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
        destroyHls(getVideoId());
      }
    };
  }, [isVisible, nft, rawVideoUrl, videoUrl, useHls, hlsInitialized, isMobile, onLoadStart, onLoadComplete, onError]);
  
  // Helper function to set up progressive video loading
  const setProgressiveVideoSource = (
    video: HTMLVideoElement, 
    originalUrl: string,
    isPoorConnection: boolean
  ) => {
    // Try to get low quality version first
    const lowQualityUrl = getLowQualityVideoUrl(originalUrl);
    
    // Start with low quality video
    video.src = lowQualityUrl;
    video.preload = isPoorConnection ? 'metadata' : 'auto';
    
    // If we're on a poor connection, don't auto-upgrade
    if (isPoorConnection) return;
    
    // Otherwise, after low quality version starts playing, load higher quality version
    video.addEventListener('playing', function upgradeQuality() {
      // Wait a bit before upgrading to ensure smooth initial playback
      setTimeout(() => {
        // Save current time and playing state
        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;
        
        // Switch to higher quality
        video.src = originalUrl;
        video.load();
        
        // Restore position and play state
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = currentTime;
          if (wasPlaying) video.play();
        }, { once: true });
      }, 5000); // Wait 5 seconds before upgrading
      
      // Remove this listener after it runs once
      video.removeEventListener('playing', upgradeQuality);
    }, { once: true });
  };

  // Helper function to get low quality video URL (implement based on your URL structure)
  const getLowQualityVideoUrl = (url: string): string => {
    // Example implementation - modify based on your backend capabilities
    if (url.includes('cloudfront.net') || url.includes('cdn.com')) {
      // For CDNs that support quality parameters
      return url.replace(/(\.\w+)$/, '-low$1');
    }
    
    // Return original if no low quality version available
    return url;
  };
  
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
  
  // Network quality detection
  useEffect(() => {
    const updateNetworkQuality = () => {
      const { effectiveType, downlink } = getNetworkInfo();
      
      if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.5) {
        setNetworkQuality('poor');
      } else if (effectiveType === '3g' || downlink < 2) {
        setNetworkQuality('medium');
      } else {
        setNetworkQuality('good');
      }
    };
    
    updateNetworkQuality();
    
    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', updateNetworkQuality);
      return () => {
        (navigator as any).connection.removeEventListener('change', updateNetworkQuality);
      };
    }
  }, []);

  // Add smart buffering strategy to the video element's event handlers
  useEffect(() => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    
    // Buffer management variables
    let lastPlayPos = 0;
    let bufferCheckInterval: NodeJS.Timeout | null = null;
    const bufferCheckFrequency = networkQuality === 'poor' ? 1000 : 2000; // Check more often on poor networks
    
    // Handle buffering state
    const checkBuffering = () => {
      const currentPlayPos = video.currentTime;
      
      // If it's playing and the position has not changed in our interval
      const isNotAdvancing = currentPlayPos === lastPlayPos && !video.paused;
      
      if (isNotAdvancing && !isBuffering) {
        setIsBuffering(true);
        console.log('Buffering detected');
        
        // On very poor networks, after 5 seconds of buffering, try to recover
        if (networkQuality === 'poor') {
          if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current);
          
          bufferingTimeoutRef.current = setTimeout(() => {
            console.log('Long buffering detected, attempting recovery...');
            
            // Try to jump forward slightly
            if (video.readyState >= 1 && video.duration > currentPlayPos + 2) {
              video.currentTime = currentPlayPos + 2;
            }
            
            // Note: We're not trying to control HLS levels directly anymore
            // This avoids the need for the getCurrentHlsLevel and setHlsQualityLevel functions
          }, 5000);
        }
      } else if (!isNotAdvancing && isBuffering) {
        setIsBuffering(false);
        console.log('Buffering ended');
        
        if (bufferingTimeoutRef.current) {
          clearTimeout(bufferingTimeoutRef.current);
          bufferingTimeoutRef.current = null;
        }
      }
      
      lastPlayPos = currentPlayPos;
    };
    
    // Start buffer checking when playing
    const handlePlaying = () => {
      if (bufferCheckInterval) clearInterval(bufferCheckInterval);
      bufferCheckInterval = setInterval(checkBuffering, bufferCheckFrequency);
    };
    
    // Clear interval when paused, ended, etc.
    const handlePauseEnd = () => {
      if (bufferCheckInterval) clearInterval(bufferCheckInterval);
    };
    
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePauseEnd);
    video.addEventListener('ended', handlePauseEnd);
    video.addEventListener('emptied', handlePauseEnd);
    
    return () => {
      if (bufferCheckInterval) clearInterval(bufferCheckInterval);
      if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current);
      
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePauseEnd);
      video.removeEventListener('ended', handlePauseEnd);
      video.removeEventListener('emptied', handlePauseEnd);
    };
  }, [videoRef.current, networkQuality, isBuffering]);
  
  // Helper function to get low quality poster
  const getLowQualityPoster = (nft: NFT): string => {
    const originalPoster = processMediaUrl(nft.image || nft.metadata?.image || '');
    
    // If it's an IPFS URL, try to get a smaller version if available
    if (originalPoster.includes('ipfs.io')) {
      // This is just a simple example - adjust based on your actual URL patterns
      return originalPoster;
    }
    
    // If it's a regular HTTP URL, you could append query params for smaller image
    // if your backend supports it
    if (originalPoster.includes('http')) {
      // Example: append width parameter if your server handles this
      // return `${originalPoster}?width=480`;
    }
    
    return originalPoster;
  };
  
  // Detect cellular connection
  useEffect(() => {
    const checkCellular = () => {
      const cellular = isCellularConnection();
      setIsCellular(cellular.isCellular);
      
      if (cellular.isCellular) {
        // Extract cellular generation from the result or call getCellularGeneration
        const generation = cellular.generation;
        // Convert to the expected type, defaulting to '4G' if not matching
        const typedGeneration = (generation === '2G' || generation === '3G' || 
                               generation === '4G' || generation === '5G') 
                               ? generation : '4G';
        setCellularGeneration(typedGeneration);
      }
    };
    
    checkCellular();
    
    // Listen for connection changes
    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', checkCellular);
      return () => {
        (navigator as any).connection.removeEventListener('change', checkCellular);
      };
    }
  }, []);
  
  // Use preview video for very slow connections like 3G
  useEffect(() => {
    if (!videoRef.current || !isVisible) return;
    
    const video = videoRef.current;
    
    // Only for cellular connections slower than 4G
    if (isCellular && (cellularGeneration === '2G' || cellularGeneration === '3G')) {
      setIsLoadingPreview(true);
      
      // Get preview URL (low quality version)
      const previewUrl = getPreviewVideoUrl(rawVideoUrl);
      
      // Enhanced loading sequence:
      // 1. First show poster image
      video.src = ''; 
      video.preload = 'none';
      video.poster = getLowQualityPoster(nft);
      
      // 2. Then show preview low-quality video when user interacts
      video.addEventListener('click', function startPreview() {
        if (hasLoadedFullVideo) return;
        
        console.log('Loading preview video on user interaction');
        video.src = previewUrl;
        video.load();
        
        // When preview is loaded, play it
        video.addEventListener('loadeddata', function playPreview() {
          video.play().catch(e => console.error('Could not play preview', e));
          video.removeEventListener('loadeddata', playPreview);
        }, { once: true });
        
        // Wait 5 seconds of preview playback, then load full quality
        setTimeout(() => {
          // Don't interrupt if user has paused the preview
          if (!video.paused) {
            loadFullQualityVideo();
          }
        }, 5000);
        
        video.removeEventListener('click', startPreview);
      }, { once: true });
      
      // Show a "Tap to load preview" message on the poster
      // (In a real implementation, you would add a UI element here)
    }
  }, [videoRef.current, isVisible, isCellular, cellularGeneration, rawVideoUrl]);
  
  // Function to load the full quality video
  const loadFullQualityVideo = () => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const currentTime = video.currentTime;
    const wasPlaying = !video.paused;
    
    console.log('Loading full quality video');
    setIsLoadingPreview(false);
    setHasLoadedFullVideo(true);
    
    // Get appropriate URL based on network conditions
    const optimizedUrl = useHls 
      ? getHlsUrl(rawVideoUrl) 
      : isCellular 
        ? getOptimizedCellularVideoUrl(rawVideoUrl) 
        : rawVideoUrl;
    
    // For HLS videos, set up with optimized settings
    if (useHls) {
      setupHls(getVideoId(), video, optimizedUrl)
        .then(() => {
          // Restore playback position and state
          video.currentTime = currentTime;
          if (wasPlaying) video.play();
        })
        .catch(err => {
          console.error('Error setting up HLS', err);
          // Fallback to direct video
          video.src = rawVideoUrl;
          video.load();
          video.currentTime = currentTime;
          if (wasPlaying) video.play();
        });
    } else {
      // For direct MP4 playback
      video.src = optimizedUrl;
      video.load();
      
      // Restore playback position
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = currentTime;
        if (wasPlaying) video.play();
      }, { once: true });
    }
  };
  
  // Update the existing video loading useEffect as well:
  useEffect(() => {
    if (!videoRef.current || !isVisible) return;
    
    const video = videoRef.current;
    const videoId = getVideoId();
    
    // Skip the automatic loading for very slow cellular connections
    // We'll load on demand via user interaction
    if (isCellular && (cellularGeneration === '2G' || cellularGeneration === '3G')) {
      return;
    }
    
    // For regular connections, apply normal loading with network optimizations
    const cellularSettings = isCellular ? getCellularVideoSettings() : null;
    
    // Apply cellular-specific settings if available
    if (isCellular && cellularSettings) {
      // Use cellular optimized URL
      const optimizedUrl = useHls 
        ? getHlsUrl(rawVideoUrl) 
        : getOptimizedCellularVideoUrl(rawVideoUrl);
      
      // Adjust video preload based on cellular generation
      if (cellularGeneration === '2G' || cellularGeneration === '3G') {
        video.preload = 'none';
      } else if (cellularGeneration === '4G') {
        video.preload = 'metadata';
      } else {
        video.preload = 'auto';
      }
      
      // For HLS, use cellular-optimized setup
      if (useHls) {
        setHlsInitialized(true);
        
        setupHls(videoId, video, optimizedUrl)
          .then(() => {
            console.log('HLS initialized with cellular optimizations');
          })
          .catch((error: Error) => {
            console.error('Error setting up HLS:', error);
            // Fall back to regular video
            if (!isHlsUrl(optimizedUrl)) {
              video.src = optimizedUrl;
              video.load();
            }
          });
      } else {
        // For non-HLS, use optimized URL
        video.src = optimizedUrl;
        
        // 4G can load automatically, for 5G
        if (cellularGeneration === '4G' || cellularGeneration === '5G') {
          video.load();
        }
      }
      
      // Reduce video quality via CSS for 3G/4G to reduce GPU load
      // Extract height from resolution string (e.g., "720p" -> 720)
      const resolutionMatch = cellularSettings.preferredResolution.match(/(\d+)p/);
      const maxHeight = resolutionMatch ? parseInt(resolutionMatch[1]) : 480; // Default to 480
      video.style.maxHeight = `${maxHeight}px`;
    } else {
      // Regular loading for non-cellular connections (existing code)
      // ...
    }

    // Event listeners for all cases
    // ...
  }, [videoUrl, isMobile, isVisible, isCellular, cellularGeneration]);
  
  return (
    <div ref={containerRef} className="w-full h-full relative">
      {isVisible ? (
        <>
          <video
            ref={videoRef}
            id={getVideoId()}
            className="w-full h-full object-cover rounded-md"
            poster={getLowQualityPoster(nft)}
            muted={muted}
            loop={loop}
            playsInline
            autoPlay={false}
            preload={isCellular ? "none" : (isMobile ? "metadata" : "auto")}
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
          
          {/* Network quality indicator */}
          {isMobile && (
            <div className={`network-indicator ${isCellular ? `network-cellular network-${cellularGeneration.toLowerCase()}` : `network-${networkQuality}`}`}>
              {isCellular 
                ? `${cellularGeneration} ${isLoadingPreview ? '(Preview)' : ''}` 
                : (networkQuality === 'poor' ? 'Low Quality' : 
                   networkQuality === 'medium' ? 'Standard' : 'HD')}
            </div>
          )}
          
          {/* For 2G/3G connections, show tap to play button when not started */}
          {isCellular && (cellularGeneration === '2G' || cellularGeneration === '3G') && 
           !hasLoadedFullVideo && !isLoadingPreview && (
            <div className="cellular-preview-overlay">
              <button 
                className="cellular-preview-button"
                onClick={() => videoRef.current?.click()}
              >
                Tap to load preview
              </button>
              <div className="cellular-preview-info">
                You're on a {cellularGeneration} connection. 
                We'll load a low-quality preview first to save data.
              </div>
            </div>
          )}
          
          {/* Buffering indicator */}
          {isBuffering && (
            <div className="buffering-overlay">
              <div className="loading-spinner"></div>
              {isCellular && (
                <div className="buffering-message">
                  {cellularGeneration} connection detected. Optimizing...
                  {isLoadingPreview && <span>Playing preview quality</span>}
                  {cellularGeneration === '2G' || cellularGeneration === '3G' 
                    ? <button onClick={loadFullQualityVideo}>Load full quality</button>
                    : null}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        // Show image placeholder until video is visible
        <NFTImage
          nft={nft}
          src={getLowQualityPoster(nft)}
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
