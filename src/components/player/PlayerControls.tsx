'use client';

import React from 'react';

interface PlayerControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  disabled?: boolean;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-4">
      {/* Previous Track */}
      <button
        onClick={onPrevious}
        disabled={disabled}
        className={`text-green-400 hover:text-green-300 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 -960 960 960" width="32" fill="currentColor">
          <path d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Z" />
        </svg>
      </button>

      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        disabled={disabled}
        className={`w-12 h-12 rounded-full bg-green-400 text-black flex items-center justify-center hover:bg-green-300 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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

      {/* Next Track */}
      <button
        onClick={onNext}
        disabled={disabled}
        className={`text-green-400 hover:text-green-300 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 -960 960 960" width="32" fill="currentColor">
          <path d="M660-240v-480h80v480h-80ZM140-240v-480l360 240-360 240Z" />
        </svg>
      </button>
    </div>
  );
};