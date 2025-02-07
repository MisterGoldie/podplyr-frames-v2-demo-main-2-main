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
      // Pause video if it exists
      const video = document.querySelector('video');
      if (video) {
        video.pause();
      }
      setIsPlaying(false);  // Ensure state is updated immediately
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);  // Only set playing after successful play
          // Play video if it exists
          const video = document.querySelector('video');
          if (video) {
            video.play();
          }
        }).catch(error => {
          console.error("Error playing audio:", error);
          setIsPlaying(false);
        });
      }
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
    console.log('handlePlayAudio called with NFT:', nft);

    const audioUrl = nft.metadata?.animation_url || nft.audio;
    if (!audioUrl) {
      console.error('No audio URL found for NFT');
      return;
    }

    // If same NFT is clicked, toggle play/pause
    if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
      console.log('Same NFT clicked, toggling play/pause');
      handlePlayPause();
      return;
    }

    // Stop current audio and video if playing
    if (audioRef.current) {
      console.log('Stopping current audio');
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const video = document.querySelector('video');
    if (video) {
      video.pause();
      video.currentTime = 0;
    }

    setCurrentPlayingNFT(nft);
    setCurrentlyPlaying(`${nft.contract}-${nft.tokenId}`);

    // Track play in Firebase
    if (!nft.playTracked) {
      try {
        await trackNFTPlay(nft, fid);
      } catch (error) {
        console.error('Error tracking NFT play:', error);
      }
    }

    // Start playing both audio and video after they're loaded
    if (audioRef.current) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
          const video = document.querySelector('video');
          if (video) {
            video.play();
          }
        }).catch(error => {
          console.error("Error playing audio:", error);
          setIsPlaying(false);
        });
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