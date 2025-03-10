import React, { useRef, useState, useEffect } from 'react';
import { usePlayerState } from './hooks/usePlayerState';
import { NFTImage } from '../media/NFTImage';
import { processMediaUrl } from '../../utils/media';
import type { NFT } from '../../types/user';
import sdk from '@farcaster/frame-sdk';

// Keep the exact same props as the original Player component
interface MaximizedPlayerProps {
  nft: NFT;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  isMinimized: boolean;
  onMinimizeToggle: () => void;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  onLikeToggle?: (nft: NFT) => void;
  isLiked?: boolean;
  onPictureInPicture?: () => void;
  lastPosition?: number;
}

export const MaximizedPlayer: React.FC<MaximizedPlayerProps> = ({
  nft,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  isMinimized,
  onMinimizeToggle,
  progress,
  duration,
  onSeek,
  onLikeToggle,
  isLiked,
  onPictureInPicture,
  lastPosition
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const hideControlsTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [isForcePressed, setIsForcePressed] = useState(false);
  const [isActivelyScrubbingBar, setIsActivelyScrubbingBar] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  // Auto-hide controls after inactivity
  useEffect(() => {
    const handleUserActivity = () => {
      setShowControls(true);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    handleUserActivity(); // Initial setup

    document.addEventListener('mousemove', handleUserActivity);
    document.addEventListener('touchstart', handleUserActivity);

    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      document.removeEventListener('mousemove', handleUserActivity);
      document.removeEventListener('touchstart', handleUserActivity);
    };
  }, []);
  
  const handlePictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      
      if (!nft?.isVideo && !nft?.metadata?.animation_url) return;
      
      const videoId = `video-${nft.contract}-${nft.tokenId}`;
      
      // Try with ref first
      if (videoRef.current) {
        try {
          await videoRef.current.requestPictureInPicture();
          return;
        } catch (e) {
          console.error("Error requesting PIP with ref:", e);
        }
      }
      
      // Then try with direct DOM access
      const videoElement = document.getElementById(videoId) as HTMLVideoElement;
      if (videoElement) {
        try {
          await videoElement.requestPictureInPicture();
          return;
        } catch (e) {
          console.error("Error requesting PIP with DOM:", e);
        }
      }
      
      // Final check
      if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (error) {
      console.error('Error toggling Picture-in-Picture mode:', error);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  // Enhanced renderVideo function with specific Mux video optimizations
  const renderVideo = () => {
    // Import the video performance monitor
    const { videoPerformanceMonitor } = require('../../utils/videoPerformanceMonitor');
    
    // Process the video URL with special handling for Mux
    const videoUrl = processMediaUrl(nft.metadata?.animation_url || '');
    const isMuxVideo = videoUrl.includes('mux.com') || videoUrl.includes('stream.mux.com');
    
    // Initialize loading state
    useEffect(() => {
      setVideoLoading(true);
    }, [nft.metadata?.animation_url]);
    
    // Handle video errors with special Mux handling
    const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      console.error('Video error occurred:', e);
      if (videoRef.current && videoRef.current.error) {
        console.error('Error code:', videoRef.current.error.code, 'Message:', videoRef.current.error.message);
        
        // For Mux videos, try a more aggressive recovery approach
        if (isMuxVideo) {
          // Force reload with lower quality settings
          const currentSrc = videoRef.current.src;
          const separator = currentSrc.includes('?') ? '&' : '?';
          const newSrc = `${currentSrc}${separator}redundant_streams=true&min_height=240&max_bitrate=800&t=${Date.now()}`;
          
          console.log('Attempting Mux-specific recovery with:', newSrc);
          videoRef.current.src = newSrc;
          videoRef.current.load();
          
          if (isPlaying) {
            videoRef.current.play().catch(e => {
              console.error('Failed to restart Mux video after recovery:', e);
            });
          }
        } else {
          // For non-Mux videos, use the standard error handler
          videoPerformanceMonitor.handleVideoError(videoRef.current);
        }
      }
    };
    
    // Add Mux-specific attributes for better mobile playback
    const muxAttributes = isMuxVideo ? {
      playsInline: true,
      preload: "metadata",
      'x-mux-disable-seeking': "false",
      'x-mux-min-rebuffer-duration': "500",
      'x-mux-rebuffer-size': "2"
    } : {};
    
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          id={`video-${nft.contract}-${nft.tokenId}`}
          src={videoUrl}
          playsInline
          loop
          muted={!nft.metadata?.animation_url?.match(/\.(mp4|webm|mov)$/i)}
          autoPlay={isPlaying}
          preload={isMuxVideo ? "metadata" : "auto"}
          className="w-auto h-auto object-contain rounded-lg max-h-[60vh] min-h-[40vh] min-w-[60%] max-w-full"
          style={{ 
            opacity: 1, 
            willChange: 'transform',
            objectFit: 'contain'
          }}
          onError={handleVideoError}
          onLoadStart={() => setVideoLoading(true)}
          onStalled={() => {
            console.log('Video playback stalled, attempting recovery');
            handleVideoError({ currentTarget: videoRef.current } as any);
          }}
          onLoadedData={() => {
            setVideoLoading(false);
            console.log('Video loaded successfully');
            
            // Set the video time to the saved position when loaded
            if (videoRef.current && lastPosition && lastPosition > 0) {
              videoRef.current.currentTime = lastPosition;
              console.log("Restored position to:", lastPosition);
            }
            
            // Apply video optimizations
            if (videoRef.current) {
              videoPerformanceMonitor.optimizeVideoElement(videoRef.current);
              
              // For Mux videos, set additional attributes
              if (isMuxVideo) {
                videoRef.current.setAttribute('x-mux-disable-seeking', 'false');
                videoRef.current.setAttribute('x-mux-min-rebuffer-duration', '500');
                videoRef.current.setAttribute('x-mux-rebuffer-size', '2');
              }
            }
          }}
          crossOrigin="anonymous"
          {...muxAttributes}
        />

        {videoLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg">
            <div className="loader mb-2"></div>
            <div className="text-white text-sm font-medium">Loading video...</div>
          </div>
        )}
      </div>
    );
  };

  // Keep the essential minimize toggle function but remove the alert
  const handleMinimizeToggle = () => {
    console.log('Minimize toggle clicked. Current state: maximized');
    onMinimizeToggle();
    console.log('After toggle called. New state will be: minimized');
  };

  // For the minimize button at the bottom of the page, make it extremely visible for testing
  const minimizeButtonStyle = {
    backgroundColor: '#6366F1', // Indigo color
    color: 'white',
    padding: '10px 15px',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
    zIndex: 9999, // Ensure it's on top of everything
    position: 'relative' as 'relative'
  };

  // Enhanced effect to handle play/pause with better error recovery
  useEffect(() => {
    // Only run this if we have a video element
    if (!videoRef.current) return;
    
    // Import the video performance monitor
    const { videoPerformanceMonitor } = require('../../utils/videoPerformanceMonitor');
    
    // Play/pause logic with error handling
    if (isPlaying) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.error("Video play error:", e);
          
          // Try to recover from the error
          setTimeout(() => {
            if (videoRef.current) {
              videoPerformanceMonitor.handleVideoError(videoRef.current);
              videoRef.current.play().catch(e2 => {
                console.error("Second play attempt failed:", e2);
              });
            }
          }, 1000);
        });
      }
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Optional: Add a simple effect to handle time sync for big jumps
  useEffect(() => {
    if (!videoRef.current) return;
    
    // Only sync time if the difference is significant (>1 second)
    if (Math.abs(videoRef.current.currentTime - progress) > 1) {
      videoRef.current.currentTime = progress;
    }
  }, [progress]);

  // Add these helper functions below your existing functions
  const handleProgressBarMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateScrubPosition(e.clientX);
    
    // Add event listeners for mouse movement and release
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      updateScrubPosition(e.clientX);
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (isDragging) {
      updateScrubPosition(e.clientX);
      
      // Perform the actual seek
      if (scrubPosition !== null) {
        onSeek(scrubPosition);
      }
      
      // Reset state
      setIsDragging(false);
      setScrubPosition(null);
      
      // Remove event listeners
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
  };

  const updateScrubPosition = (clientX: number) => {
    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setScrubPosition(duration * percent);
    }
  };

  // Add this to your useEffect cleanup
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // No force touch - use simple touch and hold instead
  const handleTouchStart = (e: React.TouchEvent) => {
    // Prevent default behavior to avoid iOS force touch menu
    e.preventDefault();
    
    // Immediately start scrubbing - no need to wait for force press
    setIsActivelyScrubbingBar(true);
    updateScrubPosition(e.touches[0].clientX);
    
    // Cancel any existing timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isActivelyScrubbingBar) {
      e.preventDefault(); // Prevent scrolling
      updateScrubPosition(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    // If we were scrubbing and have a position, seek to it
    if (isActivelyScrubbingBar && scrubPosition !== null) {
      onSeek(scrubPosition);
    }
    
    // Reset states
    setIsActivelyScrubbingBar(false);
    setScrubPosition(null);
    
    // Clear any existing timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Add this to clean up any timers when component unmounts
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  // Keep the exact same JSX as the original Player component for the maximized state
  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center max-h-[70vh] px-4 py-4 overflow-hidden">
            {/* Title Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm border-t border-purple-400/20">
              <div className="container mx-auto flex items-center justify-between px-4 py-3">
                <h3 className="font-mono text-purple-400 text-sm truncate flex-1 min-w-0">{nft.name}</h3>
                <button 
                  onClick={handleMinimizeToggle} // Use our working function
                  className="text-purple-400 hover:text-purple-300 p-1 transition-colors touch-manipulation"
                  style={{position: 'relative', zIndex: 1000}} // Add z-index to ensure clickability
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                    <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
                  </svg>
                </button>
              </div>
            </div>
            {/* NFT Image/Video Container */}
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Action Icons Overlay */}
              <div className={`absolute top-4 left-4 right-4 flex justify-between z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex gap-2">
                  {onLikeToggle && (
                    <button 
                      onClick={() => onLikeToggle(nft)}
                      className={`${isLiked ? 'text-red-500' : 'text-purple-400'} hover:text-purple-300 transition-all duration-300 hover:scale-125`}
                    >
                      {isLiked ? (
                        <svg xmlns="http://www.w3.org/2000/svg" height="26" viewBox="0 -960 960 960" width="26" fill="currentColor">
                          <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" height="26" viewBox="0 -960 960 960" width="26" fill="currentColor">
                          <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                        </svg>
                      )}
                    </button>
                  )}
                  {nft && (
                    <button
                      onClick={() => {
                        // Personalize the share message with the NFT name
                        const shareText = `Check out "${nft.name}" on PODPlayr! 📺`;
                        const shareUrl = 'podplayr.vercel.app';
                        
                        // Use the imported SDK directly
                        sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`);
                      }}
                      className="text-purple-400 hover:text-purple-300 p-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                        <path d="M680-80q-50 0-85-35t-35-85q0-6 3-28L282-392q-16 15-37 23.5t-45 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q24 0 45 8.5t37 23.5l281-164q-2-7-2.5-13.5T560-760q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-24 0-45-8.5T598-672L317-508q2 7 2.5 13.5t.5 14.5q0 8-.5 14.5T317-452l281 164q16-15 37-23.5t45-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Z"/>
                      </svg>
                    </button>
                  )}
                </div>
                {(nft.isVideo || nft.metadata?.animation_url) && (
                  <button
                    onClick={handlePictureInPicture}
                    className="text-white hover:text-white/80 p-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                      <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Zm280-200h320v-240H440v240Zm80-80v-80h160l-80-80-80 80Z"/>
                    </svg>
                  </button>
                )}
              </div>

              <div className={`transition-all duration-500 ease-in-out transform ${isPlaying ? 'scale-100' : 'scale-90'} max-h-[60vh] flex items-center justify-center`}>
                {nft.isVideo || nft.metadata?.animation_url ? (
                  renderVideo()
                ) : (
                  <div className="relative rounded-lg overflow-hidden max-h-[60vh]">
                    {/* Special handling for GIF images */}
                    {(nft.name === 'ACYL RADIO - Hidden Tales' || nft.name === 'ACYL RADIO - WILL01' || nft.name === 'ACYL RADIO - Chili Sounds 🌶️') ? (
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="w-auto h-auto object-contain rounded-lg max-h-[60vh]"
                        width={400}
                        height={400}
                        style={{ 
                          maxWidth: '90vw', 
                          maxHeight: '60vh',
                          willChange: 'transform', 
                          transform: 'translateZ(0)'
                        }}
                      />
                    ) : (
                      <NFTImage
                        src={nft.image || nft.metadata?.image || ''}
                        alt={nft.name}
                        className="w-auto h-auto object-contain rounded-lg max-h-[60vh]"
                        width={400}
                        height={400}
                        priority={true}
                        nft={nft}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="relative flex-none">
            <div className="container mx-auto px-4 pt-4 pb-16">
              {/* Progress Bar - slimmer version */}
              <div 
                ref={progressBarRef}
                className={`relative ${isActivelyScrubbingBar ? 'h-4 -mt-1 mb-3' : 'h-2'} bg-gray-800 rounded-full mb-4 transition-all duration-150 touch-none`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onClick={(e) => {
                  // For standard click handling (non-mobile)
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  onSeek(duration * percent);
                }}
              >
                {/* Background progress */}
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
                  style={{ width: `${((scrubPosition !== null ? scrubPosition : progress) / duration) * 100}%` }}
                />
                
                {/* Scrubber handle - only shows during active scrubbing */}
                {isActivelyScrubbingBar && (
                  <div 
                    className="absolute top-1/2 h-8 w-8 rounded-full bg-white shadow-lg transform -translate-y-1/2 opacity-100 scale-100"
                    style={{ 
                      left: `calc(${((scrubPosition !== null ? scrubPosition : progress) / duration) * 100}% - 16px)`,
                    }}
                  />
                )}

                {/* Time Preview bubble - only shows during active scrubbing - KEEP THIS */}
                {isActivelyScrubbingBar && scrubPosition !== null && (
                  <div 
                    className="absolute -top-10 py-1 px-3 bg-black/90 text-white text-sm font-medium rounded-md transform -translate-x-1/2 shadow-lg"
                    style={{ 
                      left: `${(scrubPosition / duration) * 100}%`,
                    }}
                  >
                    {formatTime(Math.floor(scrubPosition))}
                  </div>
                )}
              </div>

              {/* Time Display - KEEP THIS */}
              <div className="flex justify-between text-gray-400 text-xs font-mono mb-4">
                <span>{formatTime(Math.floor(isActivelyScrubbingBar && scrubPosition !== null ? scrubPosition : progress))}</span>
                <span>{formatTime(Math.floor(duration))}</span>
              </div>

              {/* Playback Controls */}
              <div className="flex justify-center items-center gap-12 mb-8">
                {/* Previous Track */}
                <button
                  onClick={onPrevious}
                  className="text-white hover:scale-110 transition-transform"
                  disabled={!onPrevious}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
                    <path d="M220-240v-480h80v480h-80Zm440 0v-480l-360 240 360 240Z"/>
                  </svg>
                </button>

                {/* Play/Pause Button */}
                <button
                  onClick={onPlayPause}
                  className="w-20 h-20 rounded-full bg-purple-500 text-black flex items-center justify-center hover:scale-105 transition-transform"
                >
                  {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor">
                      <path d="M560-200v-560h80v560H560Zm-320 0v-560h80v560H240Z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor">
                      <path d="M320-200v-560l440 280-440 280Z"/>
                    </svg>
                  )}
                </button>

                {/* Next Track */}
                <button
                  onClick={onNext}
                  className="text-white hover:scale-110 transition-transform"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
                    <path d="M660-240v-480h80v480h-80ZM220-240v-480l360 240-360 240Z"/>
                  </svg>
                </button>
              </div>

              {/* Secondary Controls - REMOVED THE PIP BUTTON FROM HERE */}
              <div className="flex justify-center items-center gap-8">
                {/* No buttons here - removed the redundant PIP button */}
              </div>
            </div>
          </div>
        </div>

        {/* Now Playing Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm border-t border-purple-400/20">
          <div className="container mx-auto flex items-center justify-between px-4 py-5">
            <div className="flex-1 min-w-0 mr-4">
              <div className="text-sm font-mono text-purple-400 truncate">{nft.name}</div>
            </div>
            <div className="flex-shrink-0">
              <button 
                onClick={handleMinimizeToggle} // Use our working function
                className="text-purple-400 hover:text-purple-300 p-1 transition-colors"
                style={{position: 'relative', zIndex: 1000}} // Add z-index to ensure clickability
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                  <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}; 