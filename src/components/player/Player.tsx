'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PlayerControls } from './PlayerControls';
import { processMediaUrl } from '../../utils/media';
import type { NFT } from '../../types/user';

interface PlayerProps {
  nft?: NFT | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

export const Player: React.FC<PlayerProps> = ({
  nft,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
}) => {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!nft || !nft.audio) {
      setError('No audio available for this NFT');
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    setIsLoading(true);
    setError(null);

    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };

    const handleLoadedData = () => {
      setIsLoading(false);
      setError(null);
    };

    const handleError = () => {
      setIsLoading(false);
      setError('Failed to load audio');
      onPlayPause(); // Stop playing on error
    };

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    audio.src = processMediaUrl(nft.audio);
    
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('error', handleError);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [nft, onPlayPause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isLoading || error) return;

    const playAudio = async () => {
      try {
        if (isPlaying) {
          // Check if the audio is actually ready to play
          if (audio.readyState >= 2) {
            await audio.play();
          } else {
            // If not ready, wait for canplay event
            const canPlayHandler = async () => {
              await audio.play();
              audio.removeEventListener('canplay', canPlayHandler);
            };
            audio.addEventListener('canplay', canPlayHandler);
          }
        } else {
          audio.pause();
        }
      } catch (err) {
        console.error('Playback error:', err);
        setError('Failed to play audio');
        onPlayPause(); // Reset play state
      }
    };

    playAudio();
  }, [isPlaying, isLoading, error, onPlayPause]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || isLoading || error) return;

    const newTime = (parseInt(e.target.value) / 100) * audio.duration;
    audio.currentTime = newTime;
    setProgress((newTime / audio.duration) * 100);
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  if (!nft) return null;

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-black border-t border-green-400/30 transition-all duration-300 ${
      isMinimized ? 'h-16' : 'h-96 sm:h-80'
    }`}>
      <button
        onClick={toggleMinimize}
        className="absolute right-4 top-2 text-gray-400 hover:text-green-400"
      >
        {isMinimized ? (
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
            <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
            <path d="M480-615 240-375l56 56 184-184 184 184 56-56-240-240Z"/>
          </svg>
        )}
      </button>

      <div className="flex items-center p-4 gap-4">
        <div className="relative w-12 h-12 flex-shrink-0">
          <Image
            src={nft.image || '/placeholder.png'}
            alt={nft.name}
            fill
            className="object-cover rounded"
          />
        </div>
        <div className="flex-grow min-w-0">
          <h3 className="text-green-400 font-medium truncate">{nft.name}</h3>
          <p className="text-gray-400 text-sm truncate">{nft.collection?.name}</p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {isLoading && <p className="text-gray-400 text-xs">Loading...</p>}
        </div>
        <PlayerControls
          isPlaying={isPlaying && !isLoading && !error}
          onPlayPause={onPlayPause}
          onNext={onNext || (() => {})}
          onPrevious={onPrevious || (() => {})}
          disabled={isLoading || !!error}
        />
      </div>

      {!isMinimized && (
        <div className="p-4">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleSeek}
            disabled={isLoading || !!error}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-gray-400 text-sm mt-1">
            <span>{formatTime(duration * (progress / 100))}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      <audio ref={audioRef} />
    </div>
  );
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};