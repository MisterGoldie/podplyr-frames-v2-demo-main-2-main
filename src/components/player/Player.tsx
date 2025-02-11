'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useNFTPlayCount } from '../../hooks/useNFTPlayCount';
import { PlayerControls } from './PlayerControls';
import type { NFT } from '../../types/user';
import { processMediaUrl } from '../../utils/media';
import { NFTImage } from '../media/NFTImage';
import Image from 'next/image';

// Augment the Document interface with Picture-in-Picture properties
interface PictureInPictureWindow {}

interface Document {
  pictureInPictureEnabled: boolean;
  pictureInPictureElement: Element | null;
  exitPictureInPicture(): Promise<void>;
}

interface HTMLVideoElement {
  requestPictureInPicture(): Promise<PictureInPictureWindow>;
}

interface PlayerProps {
  nft?: NFT | null;
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

export const Player: React.FC<PlayerProps> = ({
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
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // Sync video playback with isPlaying state and progress
  useEffect(() => {
    if (!(videoElement instanceof HTMLVideoElement)) return;

    let isVideoSwitching = false;
    let playAttemptTimeout: NodeJS.Timeout;

    const syncVideoPlayback = async () => {
      if (isVideoSwitching) return;

      try {
        // Sync time if needed
        if (Math.abs(videoElement.currentTime - progress) > 0.1) {
          videoElement.currentTime = progress;
        }

        // Handle play/pause state
        if (isPlaying) {
          isVideoSwitching = true;
          clearTimeout(playAttemptTimeout);

          // Add a small delay to handle rapid switches
          playAttemptTimeout = setTimeout(async () => {
            try {
              await videoElement.play();
            } catch (err) {
              // Ignore AbortError during quick switches
              if (err instanceof Error && err.name !== 'AbortError') {
                console.warn('Non-critical video playback warning:', err);
              }
            } finally {
              isVideoSwitching = false;
            }
          }, 100);
        } else {
          videoElement.pause();
        }
      } catch (err) {
        // Ignore errors during switching
        isVideoSwitching = false;
      }
    };

    syncVideoPlayback();

    return () => {
      clearTimeout(playAttemptTimeout);
    };
  }, [isPlaying, videoElement, progress]);
  
  // Minimum distance for swipe (100px)
  const minSwipeDistance = 100;
  
  // Maximum allowed swipe distance for visual feedback
  const maxSwipeDistance = 250;

  // Spring animation configuration
  const springTransition = `transform 400ms cubic-bezier(0.17, 0.89, 0.24, 1.11)`;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const currentY = e.targetTouches[0].clientY;
    setTouchEnd(currentY);
    
    if (touchStart) {
      const distance = touchStart - currentY;
      setSwipeDistance(distance);
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    // Calculate distance
    const distance = touchStart - touchEnd;
    const isUpSwipe = distance > minSwipeDistance;

    // Only handle swipe up to maximize
    if (isMinimized && isUpSwipe) {
      onMinimizeToggle(); // Maximize
    }

    // Reset values
    setTouchStart(null);
    setTouchEnd(null);
    setSwipeDistance(0);
  };

  // Handle Picture-in-Picture mode
  const handlePictureInPicture = async () => {
    if (!videoElement) return;
    
    try {
      if (document.pictureInPictureElement) {
        if (document.exitPictureInPicture) {
          await document.exitPictureInPicture();
        }
      } else if (videoElement.requestPictureInPicture) {
        await videoElement.requestPictureInPicture();
      }
    } catch (error) {
      console.error('Error toggling Picture-in-Picture mode:', error);
    }
  };



  if (!nft) return null;

  const handleMinimizeToggle = () => {
    console.log('Minimize toggle clicked. Current state:', isMinimized);
    onMinimizeToggle();
    console.log('After toggle called. New state will be:', !isMinimized);
  };

  const renderVideo = () => {
    // Get the video URL from metadata.animation_url or audio
    const videoUrl = nft.metadata?.animation_url || nft.audio;
    const imageUrl = nft.image || nft.metadata?.image || '/placeholder-image.jpg';
    
    // Process both URLs through our IPFS gateway system
    const processedImageUrl = processMediaUrl(imageUrl, '/placeholder-image.jpg');
    const processedVideoUrl = videoUrl ? processMediaUrl(videoUrl) : null;
    
    return (
      <div className="relative w-full h-auto aspect-square">
        {processedVideoUrl ? (
          // Show video if available
          <div className="relative w-full h-full">
            <video
              ref={setVideoElement}
              src={processedVideoUrl}
              className={`w-full h-full object-contain rounded-lg transition-transform duration-500 ${
                isMinimized ? '' : 'transform transition-all duration-500 ease-in-out ' + (isPlaying ? 'scale-100' : 'scale-90')
              }`}
              playsInline
              autoPlay={isPlaying}
              loop
              muted={true}
              controls={false}
            />
          </div>
        ) : (
          // Fallback to image
          <Image
            src={processedImageUrl}
            alt={nft.name || 'NFT Image'}
            className={`w-full h-auto object-contain rounded-lg transition-transform duration-500 ${
              isMinimized ? '' : 'transform transition-all duration-500 ease-in-out ' + (isPlaying ? 'scale-100' : 'scale-90')
            }`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority={true}
          />
        )}
      </div>
    );
  };

  const [showInfo, setShowInfo] = useState(false);
  const { playCount, loading } = useNFTPlayCount(nft);

  const InfoPanel = () => {
    if (!showInfo) return null;
    
    return (
      <div className="fixed bottom-40 left-4 z-[101] max-w-sm">
        <div className="bg-gray-900/95 backdrop-blur-lg rounded-xl p-5 shadow-2xl border border-purple-400/30 animate-fadeIn">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h2 className="text-purple-300 font-mono text-base font-semibold">{nft.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="text-purple-400">
                    <path d="M380-300q-12 0-21-9t-9-21q0-12 9-21t21-9q12 0 21 9t9 21q0 12-9 21t-21 9Zm0-160q-12 0-21-9t-9-21q0-12 9-21t21-9q12 0 21 9t9 21q0 12-9 21t-21 9Zm0-160q-12 0-21-9t-9-21q0-12 9-21t21-9q12 0 21 9t9 21q0 12-9 21t-21 9Zm200 320q-12 0-21-9t-9-21q0-12 9-21t21-9q12 0 21 9t9 21q0 12-9 21t-21 9Zm0-160q-12 0-21-9t-9-21q0-12 9-21t21-9q12 0 21 9t9 21q0 12-9 21t-21 9Zm0-160q-12 0-21-9t-9-21q0-12 9-21t21-9q12 0 21 9t9 21q0 12-9 21t-21 9Z"/>
                  </svg>
                  <span className="text-purple-300 text-xs font-mono">
                    {loading ? '...' : `${playCount} plays`}
                  </span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setShowInfo(false)}
              className="text-gray-400 hover:text-purple-300 transition-colors p-1 -mr-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
              </svg>
            </button>
          </div>

          {/* Content */}
          <div 
            className="space-y-4 max-h-[40vh] overflow-y-auto pr-2"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(168, 85, 247, 0.4) rgba(0, 0, 0, 0.2)'
            }}
          >
            {/* Description */}
            {(nft.description || nft.metadata?.description) && (
              <div className="bg-black/30 rounded-lg p-3 border border-purple-400/10">
                <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Description</h3>
                <p className="text-gray-300 text-sm leading-relaxed break-words">{nft.description || nft.metadata?.description}</p>
              </div>
            )}

            {/* Contract */}
            <div className="bg-black/30 rounded-lg p-3 border border-purple-400/10 overflow-hidden">
              <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Contract</h3>
              <div className="flex items-center gap-2">
                <p className="text-gray-300 text-sm font-mono break-all">{nft.contract}</p>
                <button 
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                  onClick={() => navigator.clipboard.writeText(nft.contract)}
                  title="Copy to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                    <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (isMinimized) {
    return (
      <>
        {showInfo && <InfoPanel />}
        <div 
        className="fixed bottom-20 left-0 right-0 bg-black border-t border-purple-400/20 h-20 z-[100] will-change-transform overflow-hidden"
        style={{
          transform: `translateY(${Math.min(0, Math.max(swipeDistance, -maxSwipeDistance))}px)`,
          transition: swipeDistance === 0 ? springTransition : 'none',
          touchAction: 'none'
        }}

        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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
            className="absolute top-0 left-0 h-0.5 bg-red-500 transition-all duration-100 group-hover:h-1"
            style={{ width: `${(progress / duration) * 100}%` }}
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
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">{formatTime(progress)}</span>
                  <span className="text-gray-600 text-xs">/</span>
                  <span className="text-gray-400 text-xs">{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="text-purple-400 hover:text-purple-300"
                aria-label="Show NFT Information"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                  <path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
                </svg>
              </button>
              <button 
                onClick={onNext}
                className="text-purple-400 hover:text-purple-300"
                disabled={!onNext}
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
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>
                )}
              </button>

              <button 
                onClick={onPrevious}
                className="text-purple-400 hover:text-purple-300"
                disabled={!onPrevious}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                  <path d="M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z"/>
                </svg>
              </button>

              {onLikeToggle && (
                <button 
                  onClick={() => onLikeToggle(nft)}
                  className={`${isLiked ? 'text-red-500' : 'text-purple-400'} hover:text-purple-300`}
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

              <button
                onClick={handleMinimizeToggle}
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
  }

  return (
    <>
      {showInfo && <InfoPanel />}
      <div 
        className="fixed inset-0 bg-black backdrop-blur-md z-[100] flex flex-col will-change-transform overflow-hidden"
      >
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center max-h-[70vh] px-4 py-4">
          {/* Title Bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm border-t border-purple-400/20">
            <div className="container mx-auto flex items-center justify-between px-4 py-3">
              <h3 className="font-mono text-purple-400 text-sm truncate flex-1 min-w-0">{nft.name}</h3>
              <button 
                onClick={handleMinimizeToggle}
                className="text-purple-400 hover:text-purple-300 p-1 transition-colors ml-4"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                  <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
                </svg>
              </button>
            </div>
          </div>
          {/* NFT Image/Video Container */}
          <div 
            className="relative w-full max-w-2xl mx-auto group"
            onMouseEnter={() => {
              // Reset the timer on mouse enter
              if (hideControlsTimer.current) {
                clearTimeout(hideControlsTimer.current);
              }
              setShowControls(true);
            }}
            onMouseLeave={() => {
              // Start the timer to hide controls
              hideControlsTimer.current = setTimeout(() => {
                setShowControls(false);
              }, 3000); // Hide after 3 seconds
            }}
          >
            {/* Action Icons Overlay */}
            <div className={`absolute top-4 left-4 right-4 flex justify-between z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
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
              {(nft.isVideo || nft.metadata?.animation_url) && (
                <button
                  onClick={handlePictureInPicture}
                  className="text-white hover:text-white/80 p-2 bg-black/40 rounded-full backdrop-blur-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                    <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Zm280-200h320v-240H440v240Zm80-80v-80h160v80H520Z"/>
                  </svg>
                </button>
              )}
            </div>
            <div className={`transition-all duration-500 ease-in-out transform ${isPlaying ? 'scale-100' : 'scale-90'}`}>
              {nft.isVideo || nft.metadata?.animation_url ? (
                renderVideo()
              ) : (
                <NFTImage
                  src={nft.metadata?.image || ''}
                  alt={nft.name}
                  className="w-full h-auto object-contain rounded-lg transition-transform duration-500"
                  width={500}
                  height={500}
                  priority={true}
                  nft={nft}
                />
              )}
            </div>

            {/* Play/Pause Overlay */}
            <div 
              className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-300 ${
                isPlaying ? 'opacity-0' : 'opacity-100'
              }`}
              onClick={onPlayPause}
            >
              <div className="transform transition-transform duration-300 hover:scale-110">
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" height="64px" viewBox="0 -960 960 960" width="64px" fill="currentColor" className="text-white">
                    <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" height="64px" viewBox="0 -960 960 960" width="64px" fill="currentColor" className="text-white">
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>
                )}
              </div>
            </div>
          </div>



        </div>
        {/* Controls Section */}
        <div className="px-4 py-6 bg-black/40">
          {/* Progress Bar */}
          <div className="mb-6">
            <div 
              className="h-1.5 bg-gray-800 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                onSeek(duration * percent);
              }}
            >
              <div 
                className="h-full bg-purple-500 rounded-full"
                style={{ width: `${(progress / duration) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-3 font-mono text-gray-400 text-sm">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-8">
            {/* Main Controls */}
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

            {/* Secondary Controls */}
            <div className="flex justify-center items-center gap-8">
              {/* Like Button */}
              {onLikeToggle && (
                <button 
                  onClick={() => onLikeToggle(nft)}
                  className="text-white hover:scale-110 transition-transform"
                >
                  {isLiked ? (
                    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" className="text-red-500">
                      <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                      <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                    </svg>
                  )}
                </button>
              )}

              {/* PiP Mode Button */}
              {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                <button
                  onClick={handlePictureInPicture}
                  className="text-white hover:scale-110 transition-transform"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fffff">
                    <path d="M280-400v-160l-80 80 80 80Zm200 120 80-80H400l80 80Zm-80-320h160l-80-80-80 80Zm280 200 80-80-80-80v160ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Z"/>
                  </svg>
                </button>
              )}
            </div>


          </div>
        </div>
      </div>
      {/* Now Playing Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm border-t border-purple-400/20">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <span className="text-sm font-mono text-purple-400 truncate">{nft.name}</span>
          <button 
            onClick={handleMinimizeToggle}
            className="text-purple-400 hover:text-purple-300 p-1 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
            </svg>
          </button>
        </div>
      </div>
      </div>
    </>
  );
};