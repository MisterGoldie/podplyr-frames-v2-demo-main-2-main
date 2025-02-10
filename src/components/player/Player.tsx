'use client';

import React, { useRef, useState, useEffect } from 'react';
import { PlayerControls } from './PlayerControls';
import type { NFT } from '../../types/user';
import { processMediaUrl } from '../../utils/media';
import { NFTImage } from '../media/NFTImage';
import Image from 'next/image';

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
    if (!videoRef.current) return;
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
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
    // For video NFTs, use the static image instead of loading video content
    const imageUrl = nft.image || nft.metadata?.image || '/placeholder-image.jpg';
    
    // Process the URL through our IPFS gateway system
    const processedUrl = processMediaUrl(imageUrl, '/placeholder-image.jpg');
    
    return (
      <div className="relative w-full h-auto aspect-square">
        <Image
          src={processedUrl}
          alt={nft.name || 'NFT Image'}
          className={`w-full h-auto object-contain rounded-lg transition-transform duration-500 ${
            isMinimized ? '' : 'transform transition-all duration-500 ease-in-out ' + (isPlaying ? 'scale-100' : 'scale-90')
          }`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority={true}
        />
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
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black backdrop-blur-md z-[100] flex flex-col will-change-transform overflow-hidden"
    >
      {/* Header */}
      <div className="p-2 flex items-center justify-between border-b border-black">
        <div className="w-8"></div>
        <h3 className="font-mono text-purple-400">Now Playing</h3>
        <button
          onClick={handleMinimizeToggle}
          className="text-purple-400 hover:text-purple-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
            <path d="M480-360 240-600l56-56 184 184 184-184 56 56-240 240Z"/>
          </svg>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-safe">
        <div className="max-w-screen-sm mx-auto px-4 py-4 mt-8 pb-24">
          {/* NFT Image/Video Container */}
          <div className="relative w-full mb-8">
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

          {/* Track Info */}
          <div className="text-center mb-12">
            <h2 className="font-mono text-purple-400 text-xl">{nft.name}</h2>
          </div>

          {/* Progress Bar */}
          <div className="mb-12">
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
            <div className="flex justify-center items-center gap-12">
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
              {document.pictureInPictureEnabled && (
                <button
                  onClick={handlePictureInPicture}
                  className="text-white hover:scale-110 transition-transform"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                    <path d="M280-400v-160l-80 80 80 80Zm200 120 80-80H400l80 80Zm-80-320h160l-80-80-80 80Zm280 200 80-80-80-80v160ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};