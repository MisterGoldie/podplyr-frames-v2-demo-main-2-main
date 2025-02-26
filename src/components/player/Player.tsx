'use client';

import React, { useRef, useState, useEffect, useContext, useMemo } from 'react';
import { useNFTPlayCount } from '../../hooks/useNFTPlayCount';
import { useNFTLikes } from '../../hooks/useNFTLikes';
import { useNFTTopPlayed } from '../../hooks/useNFTTopPlayed';
import { PlayerControls } from './PlayerControls';
import type { NFT } from '../../types/user';
import { processMediaUrl } from '../../utils/media';
import { NFTImage } from '../media/NFTImage';
import Image from 'next/image';
import { trackNFTPlay } from '../../lib/firebase';
import { useNFTLikeState } from '../../hooks/useNFTLikeState';
import { FarcasterContext } from '../../app/providers';
import { isMobileDevice, getOptimalPreloadStrategy, getOptimalVideoResolution } from '../../utils/deviceDetection';

// Augment the Document interface with Picture-in-Picture properties
interface PictureInPictureWindow {}

interface Document {
  pictureInPictureEnabled: boolean;
  pictureInPictureElement: Element | null;
  exitPictureInPicture(): Promise<void>;
}

interface HTMLVideoElement extends HTMLMediaElement {
  requestPictureInPicture(): Promise<PictureInPictureWindow>;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
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
  onPictureInPicture
}) => {
  // Get user's FID from context
  const { fid: userFid = 0 } = useContext(FarcasterContext);
  
  // Use the hook to get real-time like state
  const { isLiked } = useNFTLikeState(nft || null, userFid);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<NodeJS.Timeout | undefined>(undefined);

  // Auto-hide controls after 3 seconds of inactivity (only in maximized state)
  useEffect(() => {
    // Don't run auto-hide in minimized state
    if (isMinimized) {
      setShowControls(true);
      return;
    }

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
  }, [isMinimized]);
  
  // Handle video time updates and PIP sync
  useEffect(() => {
    if (!videoElement) return;

    const syncTime = () => {
      try {
        // Always sync time in PIP mode, otherwise only if difference is significant
        if (document.pictureInPictureElement === videoElement || Math.abs(videoElement.currentTime - progress) > 0.1) {
          videoElement.currentTime = progress;
        }
      } catch (error) {
        console.error('Error updating video time:', error);
      }
    };

    // Sync immediately
    syncTime();

    // Add listeners for PIP events
    const handlePIPChange = () => {
      syncTime();
      // Ensure video state matches player state
      if (isPlaying) {
        videoElement.play();
      } else {
        videoElement.pause();
      }
    };

    // Handle play/pause events from PIP video
    const handlePIPPlayPause = () => {
      if (document.pictureInPictureElement === videoElement) {
        // Sync the player state with the video state
        if (videoElement.paused && isPlaying) {
          onPlayPause(); // Update main player state
        } else if (!videoElement.paused && !isPlaying) {
          onPlayPause(); // Update main player state
        }
      }
    };

    videoElement.addEventListener('enterpictureinpicture', handlePIPChange);
    videoElement.addEventListener('leavepictureinpicture', handlePIPChange);
    videoElement.addEventListener('play', handlePIPPlayPause);
    videoElement.addEventListener('pause', handlePIPPlayPause);
    // Add timeupdate listener for more frequent sync in PIP mode
    videoElement.addEventListener('timeupdate', syncTime);

    return () => {
      videoElement.removeEventListener('enterpictureinpicture', handlePIPChange);
      videoElement.removeEventListener('leavepictureinpicture', handlePIPChange);
      videoElement.removeEventListener('play', handlePIPPlayPause);
      videoElement.removeEventListener('pause', handlePIPPlayPause);
      videoElement.removeEventListener('timeupdate', syncTime);
    };
  }, [videoElement, progress, isPlaying]);

  // Handle play/pause state
  useEffect(() => {
    if (!videoElement || !nft) return;

    let playbackTimeout: NodeJS.Timeout;
    
    const handlePlayback = async () => {
      try {
        if (isPlaying) {
          // Clear any existing timeout
          clearTimeout(playbackTimeout);
          
          // Add small delay to handle rapid state changes
          playbackTimeout = setTimeout(async () => {
            try {
              await videoElement.play();
            } catch (err) {
              if (err instanceof Error && err.name !== 'AbortError') {
                console.error('Video playback error:', err);
              }
            }
          }, 100);
        } else {
          videoElement.pause();
        }
      } catch (error) {
        console.error('Playback state error:', error);
      }
    };

    handlePlayback();

    return () => {
      clearTimeout(playbackTimeout);
      if (videoElement) {
        videoElement.pause();
      }
    };
  }, [videoElement, isPlaying, nft]);
  
  // Minimum distance for swipe (100px)
  const minSwipeDistance = 100;
  
  // Maximum allowed swipe distance for visual feedback
  const maxSwipeDistance = 250;

  // Spring animation configuration
  const springTransition = `transform 400ms cubic-bezier(0.17, 0.89, 0.24, 1.11)`;

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const currentY = e.targetTouches[0].clientY;
    setTouchEnd(currentY);
    
    if (touchStart) {
      const distance = touchStart - currentY;
      setSwipeDistance(distance);
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
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
    if (!videoElement || !nft) return;
    
    // Check if this NFT has video content
    const hasVideo = nft.metadata?.animation_url || nft.isVideo;
    if (!hasVideo) {
      console.log('Picture-in-Picture mode is not available for audio-only content');
      return;
    }
    
    try {
      if (document.pictureInPictureElement) {
        if (document.exitPictureInPicture) {
          await document.exitPictureInPicture();
        }
      } else if (videoElement.requestPictureInPicture) {
        // Ensure video is loaded
        if (videoElement.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise((resolve) => {
            videoElement.addEventListener('loadedmetadata', resolve, { once: true });
          });
        }
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
    
    const isMobile = isMobileDevice();
    const preloadStrategy = getOptimalPreloadStrategy();
    const videoResolution = getOptimalVideoResolution();

    return (
      <div className="relative w-full h-auto aspect-square">
        {processedVideoUrl ? (
          // Show video if available
          <div className="relative w-full h-full">
            <video
              ref={(el) => {
                videoRef.current = el;
                setVideoElement(el);
              }}
              src={processedVideoUrl}
              className={`w-full h-full object-contain rounded-lg transition-transform duration-500 ${
                isMinimized ? '' : 'transform transition-all duration-500 ease-in-out ' + (isPlaying ? 'scale-100' : 'scale-90')
              }`}
              playsInline
              webkit-playsinline="true"
              x5-playsinline="true"
              preload={preloadStrategy}
              loop={false}
              muted={true}
              controls={false}
              poster={processedImageUrl}
              onLoadedMetadata={(e) => {
                const video = e.target as HTMLVideoElement;
                if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                  video.currentTime = progress;
                }
              }}
              onError={(e) => {
                const target = e.target as HTMLVideoElement;
                console.error('Video error:', {
                  error: target.error,
                  networkState: target.networkState,
                  readyState: target.readyState,
                  src: target.src
                });
                // Try to recover by using a different source format if available
                if (nft.metadata?.animation_url_alternative) {
                  const fallbackUrl = nft.metadata?.animation_url_alternative || 
                                     nft?.audio ||
                                     nft?.image; // Last resort: try showing image
                  if (fallbackUrl && fallbackUrl !== target.src) {
                    target.src = fallbackUrl;
                    target.load();
                  } else {
                    console.log('No fallback source available');
                  }
                }
              }}
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
  const { likesCount, isLoading: likesLoading } = useNFTLikes(nft);
  const { hasBeenInTopPlayed, loading: topPlayedLoading } = useNFTTopPlayed(nft);

  // Separate InfoPanel data into its own state to prevent re-renders
  const infoPanelData = useMemo(() => ({
    nftName: nft?.name,
    nftDescription: nft?.description || nft?.metadata?.description,
    playCount: playCount,
    playCountLoading: loading,
    likesCount: likesCount,
    likesLoading: likesLoading,
    hasBeenInTopPlayed: hasBeenInTopPlayed,
    topPlayedLoading: topPlayedLoading,
    contract: nft?.contract,
    tokenId: nft?.tokenId
  }), [nft?.name, nft?.description, nft?.metadata?.description, nft?.contract, nft?.tokenId,
      playCount, loading, likesCount, likesLoading, hasBeenInTopPlayed, topPlayedLoading]);

  // Memoized InfoPanel component to prevent re-rendering during playback
  const InfoPanel = useMemo(() => {
    if (!showInfo) return null;
    
    const handleInfoClick = (e: React.MouseEvent) => {
      // Prevent event bubbling to player component
      e.stopPropagation();
    };
    
    const handleInfoClose = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowInfo(false);
    };
    
    return (
      <div 
        className="fixed bottom-40 left-0 right-0 mx-auto z-[101] max-w-sm px-4" 
        onClick={handleInfoClick}
      >
        <div className="bg-gray-900/95 backdrop-blur-lg rounded-xl p-5 shadow-2xl border border-purple-400/30 animate-fadeIn w-full">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h2 className="text-purple-300 font-mono text-base font-semibold">{infoPanelData.nftName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="text-purple-400">
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>
                  <span className="text-purple-300 text-xs font-mono">
                    {infoPanelData.playCountLoading ? '...' : `${infoPanelData.playCount} plays`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="text-purple-400">
                      <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                    </svg>
                    <span className="text-purple-300 text-xs font-mono">
                      {infoPanelData.likesLoading ? '...' : `${infoPanelData.likesCount} likes`}
                    </span>
                  </div>
                  {!infoPanelData.topPlayedLoading && infoPanelData.hasBeenInTopPlayed && (
                    <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="text-purple-400">
                        <path d="m233-80 65-281L80-550l288-25 112-265 112 265 288 25-218 189 65 281-247-149L233-80Z"/>
                      </svg>
                      <span className="text-purple-300 text-xs font-mono">Top Played</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button 
              onClick={handleInfoClose}
              className="text-gray-400 hover:text-purple-300 active:scale-95 transition-all p-3 -mr-3 touch-manipulation rounded-full bg-black/20 backdrop-blur-sm"
              style={{ touchAction: 'manipulation' }}
              aria-label="Close info panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                <path d="M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z"/>
              </svg>
            </button>
          </div>

          {/* Content */}
          <div 
            className="space-y-4 max-h-[40vh] overflow-y-auto overscroll-contain will-change-scroll pr-2"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#7e22ce #111827',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              WebkitOverflowScrolling: 'touch',
              userSelect: 'text'
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
          >
            {/* Description */}
            {(infoPanelData.nftDescription) && (
              <div className="bg-black/30 rounded-lg p-3 border border-purple-400/10">
                <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Description</h3>
                <p className="text-gray-300 text-sm leading-relaxed break-words">{infoPanelData.nftDescription}</p>
              </div>
            )}

            {/* Contract and Token ID */}
            <div className="bg-black/30 rounded-lg p-3 border border-purple-400/10 overflow-hidden space-y-3">
              {/* Contract */}
              <div>
                <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Contract</h3>
                <div className="flex items-center gap-2">
                  <p className="text-gray-300 text-sm font-mono break-all">{infoPanelData.contract}</p>
                  <button 
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                    onClick={() => navigator.clipboard.writeText(infoPanelData.contract)}
                    title="Copy to clipboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                      <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/>
                    </svg>
                  </button>
                </div>
              </div>
              {/* Token ID */}
              <div>
                <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Token ID</h3>
                <div className="flex items-center gap-2">
                  <p className="text-gray-300 text-sm font-mono break-all">{infoPanelData.tokenId}</p>
                  <button 
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                    onClick={() => navigator.clipboard.writeText(infoPanelData.tokenId || '')}
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
      </div>
    );
  }, [showInfo]);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (isMinimized) {
    return (
      <>
        {InfoPanel}
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
                onClick={onPrevious}
                className="text-purple-400 hover:text-purple-300"
                disabled={!onPrevious}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                  <path d="M660-240v-480h80v480h-80ZM220-240v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z"/>
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

              {nft?.isVideo && document.pictureInPictureEnabled && (
                <button
                  onClick={handlePictureInPicture}
                  className="text-purple-400 hover:text-purple-300"
                  aria-label="Toggle Picture-in-Picture"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M320-240h320v-240H320v240Zm-80 80v-400h480v400H240Zm80-480v-80h480v80H320Zm-160 0v-80h560v80H160Zm160 480v-240 240Z"/>
                  </svg>
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
      {InfoPanel}
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
                className="text-purple-400 hover:text-purple-300 p-1 transition-colors touch-manipulation"
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
                      try {
                        const appUrl = process.env.NEXT_PUBLIC_URL || window.location.origin;
                        const shareText = `Check out this NFT on PODPlayr 🎵`;
                        // Share base domain but Frame endpoint will show NFT image
                        window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(appUrl)}`, '_blank', 'noopener,noreferrer');
                      } catch (error) {
                        console.error('Error sharing NFT:', error);
                      }
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
                  <path d="M660-240v-480h80v480h-80ZM220-240v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z"/>
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
                  <path d="M220-240v-480h80v480h-80Zm440 0v-480l-360 240 360 240Zm80-240Zm0 90 136-90-136-90v180Z"/>
                </svg>
              </button>
            </div>

            {/* Secondary Controls */}
            <div className="flex justify-center items-center gap-8">

              {/* PiP Mode Button */}
              {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                <button
                  onClick={handlePictureInPicture}
                  className="text-white hover:scale-110 transition-transform"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
                    <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Z"/>
                  </svg>
                </button>
              )}
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
      </div>
    </>
  );
};