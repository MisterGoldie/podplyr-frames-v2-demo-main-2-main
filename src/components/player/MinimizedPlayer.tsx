import React, { useState, useRef, useEffect } from 'react';
import { NFTImage } from '../media/NFTImage';
import type { NFT } from '../../types/user';
import InfoPanel from './InfoPanel';

// Props interface
interface MinimizedPlayerProps {
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

export const MinimizedPlayer: React.FC<MinimizedPlayerProps> = ({
  nft,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  onMinimizeToggle,
  progress,
  duration,
  onSeek,
}) => {
  // State for swipe and info panel
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [infoButtonClicked, setInfoButtonClicked] = useState(false);

  // Add this at the top with other state
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Add a simple effect to find and control the video element
  useEffect(() => {
    if (!nft?.isVideo && !nft?.metadata?.animation_url) return;
    
    // Find the video element in the document
    const videoId = `video-${nft.contract}-${nft.tokenId}`;
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    
    if (videoElement) {
      // Store reference
      videoRef.current = videoElement;
      
      // Simple play/pause control
      if (isPlaying) {
        videoElement.play().catch(e => {
          console.error("Minimized player video error:", e);
        });
      } else {
        videoElement.pause();
      }
    }
  }, [isPlaying, nft]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientY);
    setTouchEnd(e.targetTouches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    setTouchEnd(e.targetTouches[0].clientY);
    
    // Calculate the distance from start to current touch position
    const distance = touchStart - e.targetTouches[0].clientY;
    
    // Limit the distance to maxSwipeDistance
    const maxSwipeDistance = 100; // Max distance to swipe up
    const limitedDistance = Math.min(Math.max(distance, 0), maxSwipeDistance);
    
    setSwipeDistance(limitedDistance);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const maxSwipeDistance = 100;
    
    // If we've swiped more than 50% of the max distance, consider it a full swipe
    if (swipeDistance > maxSwipeDistance * 0.5) {
      // Handle swipe action
    }
    
    // Reset touch points
    setTouchStart(null);
    setTouchEnd(null);
    
    // Reset swipe distance over time (spring animation in CSS)
    setTimeout(() => {
      setSwipeDistance(0);
    }, 300);
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  // Handle info button click with animation
  const handleInfoButtonClick = () => {
    // Set the button as clicked to trigger animation
    setInfoButtonClicked(true);
    
    // Show the info panel
    setShowInfo(true);
    
    // Reset the button animation after it completes
    setTimeout(() => {
      setInfoButtonClicked(false);
    }, 400); // Match this to the animation duration
  };

  const springTransition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
  const maxSwipeDistance = 100;

  // Fixed styling with black background
  return (
    <>
      {showInfo && <InfoPanel nft={nft} onClose={() => setShowInfo(false)} />}
      <div 
        className="fixed bottom-20 left-0 right-0 bg-black border-t border-purple-400/20 h-20 z-[100] will-change-transform overflow-hidden"
        style={{backgroundColor: '#000'}}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress bar */}
        <div 
          className="absolute top-0 left-0 right-0 h-1 bg-gray-800 cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            onSeek(duration * percent);
          }}
        >
          <div 
            className="absolute top-0 left-0 h-0.5 bg-indigo-500 transition-all duration-100 group-hover:h-1"
            style={{ 
              width: `${(progress / duration) * 100}%`,
              backgroundColor: '#6366F1' 
            }}
          />
        </div>
        
        {/* Player content */}
        <div className="container mx-auto h-full pt-2">
          <div className="flex items-center justify-between h-[calc(100%-8px)] px-4 gap-4">
            {/* NFT Image and Info */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden">
                <NFTImage
                  src={nft.metadata?.image || ''}
                  alt={nft.name}
                  className="w-full h-full object-cover"
                  width={48}
                  height={48}
                  priority={true}
                  nft={nft}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-purple-400 font-mono text-sm truncate">{nft.name}</h3>
                <div className="inline-flex items-center space-x-0.5">
                  <span className="text-gray-400 text-xs font-mono">{formatTime(Math.floor(progress))}</span>
                  <span className="text-gray-600 text-xs font-mono">/</span>
                  <span className="text-gray-400 text-xs font-mono">{formatTime(Math.floor(duration))}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleInfoButtonClick}
                className={`text-purple-400 hover:text-purple-300 transition-all ${
                  infoButtonClicked ? 'scale-90 rotate-[360deg]' : ''
                }`}
                style={{
                  transition: infoButtonClicked 
                    ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s ease' 
                    : 'color 0.2s ease'
                }}
                aria-label="Show NFT Information"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                  <path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
                </svg>
              </button>
              <button 
                onClick={onPrevious}
                className="text-purple-400 hover:text-purple-300"
                disabled={!onPrevious}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                  <path d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Zm-80-240Zm0 90v-180l-136 90 136 90Z"/>
                </svg>
              </button>

              <button 
                onClick={onPlayPause}
                className="text-purple-400 hover:text-purple-300"
              >
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 -960 960 960" width="32" fill="currentColor">
                    <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 -960 960 960" width="32" fill="currentColor">
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>
                )}
              </button>

              <button 
                onClick={onNext}
                className="text-purple-400 hover:text-purple-300"
                disabled={!onNext}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                  <path d="M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z"/>
                </svg>
              </button>

              <button
                onClick={onMinimizeToggle}
                className="text-purple-400 hover:text-purple-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                  <path d="M480-600 240-360l56 56 184-184 184 184 56-56-240-240Z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}; 