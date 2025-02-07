import { useState, useEffect, useRef, useCallback } from 'react';
import { NFT } from '../types/user';
import { trackNFTPlay } from '../lib/firebase';
import { processMediaUrl } from '../utils/media';

interface UseAudioPlayerProps {
  fid?: number;
  setRecentlyPlayedNFTs?: React.Dispatch<React.SetStateAction<NFT[]>>;
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

export const useAudioPlayer = ({ fid = 1, setRecentlyPlayedNFTs }: UseAudioPlayerProps = {}): UseAudioPlayerReturn => {
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
      if (!audio.duration) return;
      setAudioProgress(audio.currentTime);
      setAudioDuration(audio.duration);
    };

    const handleLoadedMetadata = () => {
      console.log('Audio metadata loaded:', {
        duration: audio.duration,
        currentTime: audio.currentTime
      });
      setAudioDuration(audio.duration);
      setAudioProgress(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    // Add timeupdate event to track progress
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
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
    } else {
      audioRef.current.play().catch(error => {
        console.error("Error in handlePlayPause:", error);
        setIsPlaying(false);
      }).then(() => {
        // Play video if it exists
        const video = document.querySelector('video');
        if (video) {
          video.play().catch(error => {
            console.error("Error playing video:", error);
          });
        }
      });
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
      setAudioProgress(0);
      setAudioDuration(0);
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
        if (setRecentlyPlayedNFTs) {
          setRecentlyPlayedNFTs((prevNFTs: NFT[]) => {
            const newNFT: NFT = { ...nft, playTracked: true };
            const filteredNFTs = prevNFTs.filter(
              (item: NFT) => !(item.contract === nft.contract && item.tokenId === nft.tokenId)
            );
            return [newNFT, ...filteredNFTs].slice(0, 8);
          });
        }
      } catch (error) {
        console.error('Error tracking NFT play:', error);
      }
    }

    // Start playing both audio and video after they're loaded
    if (audioRef.current) {
      // Create a new audio element for this NFT
      const audio = new Audio(processMediaUrl(audioUrl));
      
      // Set up event listeners before loading
      audio.addEventListener('loadedmetadata', () => {
        console.log('Audio metadata loaded:', {
          duration: audio.duration,
          currentTime: audio.currentTime
        });
        setAudioDuration(audio.duration);
      });

      audio.addEventListener('timeupdate', () => {
        setAudioProgress(audio.currentTime);
      });

      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setAudioProgress(0);
      });

      // Replace the current audio reference
      audioRef.current = audio;

      try {
        await audio.play();
        setIsPlaying(true);
        const video = document.querySelector('video');
        if (video) {
          video.play();
        }
      } catch (error) {
        console.error("Error playing audio:", error);
        setIsPlaying(false);
      }
    }
  }, [currentlyPlaying, handlePlayPause, fid, setRecentlyPlayedNFTs]);

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