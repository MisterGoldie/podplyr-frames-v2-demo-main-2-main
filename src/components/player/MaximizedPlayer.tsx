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
  onPictureInPicture
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const hideControlsTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  
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

  // Keep the renderVideo function exactly as in the original
  const renderVideo = () => {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          id={`video-${nft.contract}-${nft.tokenId}`}
          src={processMediaUrl(nft.metadata?.animation_url || '')}
          playsInline
          loop
          muted={!nft.metadata?.animation_url?.match(/\.(mp4|webm|mov)$/i)}
          autoPlay={isPlaying}
          preload="auto"
          className="w-auto h-auto object-contain rounded-lg max-h-[60vh] min-h-[40vh] min-w-[60%] max-w-full"
          style={{ 
            opacity: 1, 
            willChange: 'transform',
            objectFit: 'contain'
          }}
          onLoadedData={() => {
            setVideoLoading(false);
            
            // Simple time sync and play when the video is loaded
            if (videoRef.current) {
              if (Math.abs(videoRef.current.currentTime - progress) > 0.5) {
                videoRef.current.currentTime = progress;
              }
              
              if (isPlaying) {
                videoRef.current.play().catch(e => {
                  // Just log the error, don't try to recover
                  console.error("Video play error:", e);
                });
              }
            }
          }}
        />

        {videoLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg">
            <div className="loader"></div>
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

  // Add one simple effect to handle play/pause
  useEffect(() => {
    // Only run this if we have a video element
    if (!videoRef.current) return;
    
    // Simple play/pause logic
    if (isPlaying) {
      videoRef.current.play().catch(e => {
        console.error("Video play error:", e);
      });
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
                      className={`${isLiked ? 'text-red-500' : 'text-purple-400'} hover:text-purple-300 p-2 bg-black/40 rounded-full backdrop-blur-sm`}
                    >
                      {isLiked ? (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                          <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
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
                      className="text-purple-400 hover:text-purple-300 p-2 bg-black/40 rounded-full backdrop-blur-sm"
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
                    className="text-white hover:text-white/80 p-2 bg-black/40 rounded-full backdrop-blur-sm"
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
                    <NFTImage
                      src={nft.image || nft.metadata?.image || ''}
                      alt={nft.name}
                      className="w-auto h-auto object-contain rounded-lg max-h-[60vh]"
                      width={400}
                      height={400}
                      priority={true}
                      nft={nft}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="relative flex-none">
            <div className="container mx-auto px-4 pt-4 pb-16">
              {/* Progress Bar */}
              <div className="h-1 bg-gray-800 rounded-full mb-4 cursor-pointer relative"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  onSeek(duration * percent);
                }}
              >
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
                  style={{ width: `${(progress / duration) * 100}%` }}
                />
              </div>

              {/* Time Display */}
              <div className="flex justify-between text-gray-400 text-xs font-mono mb-4">
                <span>{formatTime(Math.floor(progress))}</span>
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