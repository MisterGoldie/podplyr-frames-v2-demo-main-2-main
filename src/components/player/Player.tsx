'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { PlayerControls } from './PlayerControls';
import type { NFT } from '../../types/user';

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
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!nft) return null;

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-[64px] left-0 right-0 bg-black border-t border-purple-400/20 h-20 z-30">
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
            {/* Thumbnail and title */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-12 h-12 flex-shrink-0 relative rounded overflow-hidden">
                {nft.isVideo ? (
                  <video 
                    ref={videoRef}
                    src={nft.metadata?.animation_url || '/placeholder-video.mp4'}
                    className="w-full h-auto object-contain rounded-lg transition-transform duration-500"
                    playsInline
                    loop={nft.isAnimation}
                    muted={true}
                    controls={false}
                    autoPlay={isPlaying}
                  />
                ) : nft.isAnimation ? (
                  <Image
                    src={nft.metadata?.animation_url || nft.metadata?.image || ''}
                    alt={nft.name}
                    className="w-full h-full object-cover"
                    width={48}
                    height={48}
                    priority={true}
                    unoptimized={true}
                  />
                ) : (
                  <Image
                    src={nft.metadata?.image || ''}
                    alt={nft.name}
                    className="w-full h-full object-cover"
                    width={48}
                    height={48}
                    priority={true}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-mono text-purple-400 truncate text-sm">
                  {nft.name}
                </h4>
                <p className="font-mono text-gray-400 truncate text-xs">
                  {nft.collection?.name}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={onPlayPause}
                className="text-purple-400 hover:text-purple-300"
              >
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                    <path d="M560-200v-560h80v560H560Zm-320 0v-560h80v560H240Z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>
                )}
              </button>

              <button
                onClick={onMinimizeToggle}
                className="text-purple-400 hover:text-purple-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                  <path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black backdrop-blur-md z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-black">
        <button
          onClick={onMinimizeToggle}
          className="text-purple-400 hover:text-purple-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
            <path d="m336-280-56-56 184-184-184-184 56-56 240 240-240 240Z"/>
          </svg>
        </button>
        <h3 className="font-mono text-purple-400">Now Playing</h3>
        <div className="w-8"></div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-screen-sm mx-auto px-4 py-8">
          {/* NFT Image/Video Container */}
          <div className="relative w-full mb-8">
            <div className={`transition-all duration-500 ease-in-out transform ${isPlaying ? 'scale-100' : 'scale-90'}`}>
              {nft.isVideo || nft.metadata?.animation_url ? (
                <video 
                  ref={videoRef}
                  src={nft.metadata?.animation_url || '/placeholder-video.mp4'}
                  className="w-full h-auto object-contain rounded-lg transition-transform duration-500"
                  playsInline
                  loop={nft.isAnimation}
                  muted={true}
                  controls={false}
                  autoPlay={isPlaying}
                />
              ) : (
                <Image
                  src={nft.metadata?.image || ''}
                  alt={nft.name}
                  className="w-full h-auto object-contain rounded-lg transition-transform duration-500"
                  width={500}
                  height={500}
                  priority={true}
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
            <h2 className="font-mono text-purple-400 text-xl mb-3">{nft.name}</h2>
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
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
                  <path d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Z"/>
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

              {/* PiP Button */}
              {onPictureInPicture && (
                <button 
                  onClick={onPictureInPicture}
                  className="text-white hover:scale-110 transition-transform"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M560-120v-80h280v-280h80v360H560Zm-520 0v-360h80v280h280v80H40Zm520-520v-280h280v80H640v200h-80ZM120-640v-200h280v-80H40v280h80Z"/>
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