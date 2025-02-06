import { useState, useEffect, useRef, useCallback } from 'react';
import { NFT } from '../types/user';
import { trackNFTPlay } from '../lib/firebase';
import { processMediaUrl } from '../utils/media';

interface UseAudioPlayerProps {
  fid?: number;
}

type UseAudioPlayerReturn = {
  isPlaying: boolean;
  currentPlayingNFT: NFT | null;
  currentlyPlaying: string | null;
  audioProgress: number;
  audioDuration: number;
  handlePlayAudio: (nft: NFT) => Promise<void>;
  handlePlayPause: () => void;
  handlePlayNext: () => void;
  handlePlayPrevious: () => void;
  handleSeek: (time: number) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

type AudioPlayerHandles = {
  play: () => void;
  pause: () => void;
  ended: () => void;
  loadedmetadata: () => void;
  timeupdate: () => void;
}

export const useAudioPlayer = ({ fid = 1 }: UseAudioPlayerProps = {}): UseAudioPlayerReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingNFT, setCurrentPlayingNFT] = useState<NFT | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setAudioProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    const handles: AudioPlayerHandles = {
      play: handlePlay,
      pause: handlePause,
      ended: handleEnded,
      loadedmetadata: handleLoadedMetadata,
      timeupdate: updateProgress,
    };

    Object.keys(handles).forEach((key) => {
      audio.addEventListener(key, handles[key as keyof AudioPlayerHandles]);
    });

    return () => {
      Object.keys(handles).forEach((key) => {
        audio.removeEventListener(key, handles[key as keyof AudioPlayerHandles]);
      });
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  const handlePlayNext = useCallback(() => {
    // Implementation for playing next track
    // This would need to be connected to your NFT list
  }, []);

  const handlePlayPrevious = useCallback(() => {
    // Implementation for playing previous track
    // This would need to be connected to your NFT list
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setAudioProgress(time);
  }, []);

  const handlePlayAudio = useCallback(async (nft: NFT) => {
    if (!nft.audio && !nft.metadata?.animation_url) return;

    // If same NFT is clicked, toggle play/pause
    if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
      handlePlayPause();
      return;
    }

    // Stop current audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setCurrentPlayingNFT(nft);
    setCurrentlyPlaying(`${nft.contract}-${nft.tokenId}`);
    setIsPlaying(true);

    // Track play in Firebase
    if (!nft.playTracked) {
      try {
        await trackNFTPlay(nft, fid);
      } catch (error) {
        console.error('Error tracking NFT play:', error);
      }
    }
  }, [currentlyPlaying, handlePlayPause, fid]);

  return {
    isPlaying,
    currentPlayingNFT,
    currentlyPlaying,
    audioProgress,
    audioDuration,
    handlePlayAudio,
    handlePlayPause,
    handlePlayNext,
    handlePlayPrevious,
    handleSeek,
    audioRef
  };
}