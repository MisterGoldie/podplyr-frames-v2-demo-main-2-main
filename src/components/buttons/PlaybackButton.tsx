import React from 'react';

interface PlaybackButtonProps {
  isPlaying: boolean;
  onClick: () => void;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const PlaybackButton: React.FC<PlaybackButtonProps> = ({
  isPlaying,
  onClick,
  size = 'medium',
  className = '',
}) => {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16',
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-full bg-purple-400 hover:bg-purple-500 active:bg-purple-600 transition-colors flex items-center justify-center ${sizeClasses[size]} ${className}`}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? (
        // Pause icon
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-1/2 h-1/2 text-white">
          <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
        </svg>
      ) : (
        // Play icon
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-1/2 h-1/2 text-white ml-1">
          <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
};
