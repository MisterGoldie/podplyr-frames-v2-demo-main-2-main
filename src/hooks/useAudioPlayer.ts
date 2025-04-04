import { useState, useEffect, useRef, useCallback } from 'react';
import { NFT } from '../types/user';
import { trackNFTPlay } from '../lib/firebase';
import { processMediaUrl, getMediaKey } from '../utils/media';
import { logger } from '../utils/logger';
import { useVideoPlay } from '../contexts/VideoPlayContext';

// Create a dedicated logger for this module
const audioLogger = logger.getModuleLogger('audioPlayer');

// Extend Window interface to include our custom property
declare global {
  interface Window {
    nftList: NFT[];
  }
}

export interface UseAudioPlayerProps {
  fid?: number;
  setRecentlyPlayedNFTs?: React.Dispatch<React.SetStateAction<NFT[]>>;
  recentlyAddedNFT?: React.MutableRefObject<string | null>;
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
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

type AudioPlayerHandles = {
  play: () => void;
  pause: () => void;
  ended: () => void;
  loadedmetadata: () => void;
  timeupdate: () => void;
}

// Create a global audio context for the entire app
let globalAudioContext: AudioContext | null = null;

// Helper function to unlock audio context
const unlockAudioContext = () => {
  // Skip if already created
  if (globalAudioContext) return globalAudioContext;
  
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  
  // Create new audio context
  globalAudioContext = new AudioContextClass();
  
  // Unlock the audio context (needed for iOS/Safari)
  if (globalAudioContext && globalAudioContext.state === 'suspended') {
    const resumeAudio = () => {
      if (globalAudioContext && globalAudioContext.state === 'suspended') {
        globalAudioContext.resume();
      }
      
      // Create and play a silent buffer to unlock audio
      if (globalAudioContext) {
        const buffer = globalAudioContext.createBuffer(1, 1, 22050);
        const source = globalAudioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(globalAudioContext.destination);
        source.start(0);
      }
      
      // Remove listeners once played
      document.removeEventListener('touchstart', resumeAudio);
      document.removeEventListener('touchend', resumeAudio);
      document.removeEventListener('click', resumeAudio);
    };
    
    // Add event listeners to unlock audio on user interaction
    document.addEventListener('touchstart', resumeAudio, true);
    document.addEventListener('touchend', resumeAudio, true);
    document.addEventListener('click', resumeAudio, true);
  }
  
  return globalAudioContext;
};

// Ensure audio context is unlocked on page load
document.addEventListener('DOMContentLoaded', unlockAudioContext);

export const useAudioPlayer = ({ fid = 1, setRecentlyPlayedNFTs, recentlyAddedNFT }: UseAudioPlayerProps = {}): UseAudioPlayerReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingNFT, setCurrentPlayingNFT] = useState<NFT | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentQueue, setCurrentQueue] = useState<NFT[]>([]);
  const [queueType, setQueueType] = useState<string>('default');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [hasReachedThreshold, setHasReachedThreshold] = useState<boolean>(false);
  
  // CRITICAL FIX: Add state to track which mediaKeys we've already counted plays for
  // This helps prevent duplicate play counts across component re-renders
  const [trackedMediaKeys, setTrackedMediaKeys] = useState<Record<string, boolean>>({});
  
  // Get access to the VideoPlayContext
  const { trackNFTProgress, hasReachedPlayThreshold, resetNFTTrackingState } = useVideoPlay();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (!audio.duration) return;
      setAudioProgress(audio.currentTime);
      setAudioDuration(audio.duration);
      
      // Track progress for the 25% threshold if we have a current NFT
      if (currentPlayingNFT && audio.duration > 0) {
        trackNFTProgress(currentPlayingNFT, audio.currentTime, audio.duration);
        
        // Check if we've reached the threshold and haven't tracked it yet
        if (!hasReachedThreshold && hasReachedPlayThreshold(currentPlayingNFT)) {
          setHasReachedThreshold(true);
          
          // Now we can track the play in Firebase since we've reached the threshold
          trackNFTPlay(currentPlayingNFT, fid).catch(error => {
            audioLogger.error('Error tracking NFT play after threshold:', error);
          });
        }
      }
    };

    const handleLoadedMetadata = () => {
      audioLogger.info('Audio metadata loaded:', {
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
    // CRITICAL FIX: First check if we have a valid audio element before changing state
    if (!audioRef.current) {
      audioLogger.error('⚠️ No audio element available for play/pause!');
      setIsPlaying(false);
      return;
    }
    
    // CRITICAL FIX: Get current state and log detailed information
    const currentAudioElement = audioRef.current;
    const currentId = currentAudioElement.id || 'unnamed-audio';
    const currentState = isPlaying;
    const newPlayingState = !currentState;
    
    audioLogger.info(`handlePlayPause called, current state: ${currentState ? 'playing' : 'paused'}`);
    audioLogger.info(`Current audio element: ${currentId}`);
    
    // CRITICAL FIX: Update UI state immediately to provide instant feedback
    // This ensures the play/pause button visually responds right away
    setIsPlaying(newPlayingState);
    
    // PAUSING
    if (!newPlayingState) {
      audioLogger.info('Pausing audio and associated media');
      
      // CRITICAL FIX: Apply immediate pause to the current audio element
      // This direct approach ensures the audio stops immediately
      if (audioRef.current) {
        const audioElement = audioRef.current;
        audioLogger.info(`DIRECT PAUSE: Immediately pausing audio element ${audioElement.id}`);
        
        try {
          // Store current time before pausing
          const currentTime = audioElement.currentTime;
          
          // Direct pause call - most important fix
          audioElement.pause();
          audioLogger.info(`DIRECT PAUSE: Called pause() on audio element at ${currentTime.toFixed(2)}s`);
          
          // Force pause state
          audioElement.muted = true;
          audioElement.volume = 0;
          audioElement.dataset.playing = 'false';
          audioElement.dataset.paused = 'true';
          audioElement.dataset.pausedAt = Date.now().toString();
          
          // Verify pause state
          if (!audioElement.paused) {
            audioLogger.error(`CRITICAL: Audio element still not paused after direct pause call!`);
          } else {
            audioLogger.info(`DIRECT PAUSE: Successfully paused audio element ${audioElement.id}`);
          }
        } catch (directPauseError) {
          audioLogger.error(`DIRECT PAUSE: Error during direct pause:`, directPauseError);
        }
      }
      
      // CRITICAL FIX: Use a more robust pause approach with multiple fallbacks
      const pauseAllMedia = () => {
        try {
          // 1. Pause the main audio element with multiple approaches
          if (audioRef.current) {
            const audioElement = audioRef.current;
            const audioId = audioElement.id || 'unnamed-audio';
            audioLogger.info('Pausing audio element with fallback methods:', audioId);
            
            // Try standard pause method again as fallback
            try { 
              audioElement.pause(); 
              audioLogger.info(`Fallback pause attempt on ${audioId}`);
            } catch (e) { 
              audioLogger.warn('Fallback pause failed:', e); 
            }
            
            // Force audio to stop playing through multiple techniques
            try { audioElement.muted = true; } catch (e) {}
            try { audioElement.volume = 0; } catch (e) {}
            try { audioElement.currentTime = 0; } catch (e) {}
            
            // Manually trigger the pause event since it might not fire automatically
            try {
              const pauseEvent = new Event('pause');
              audioElement.dispatchEvent(pauseEvent);
              audioLogger.info('Manually dispatched pause event');
            } catch (e) {
              audioLogger.warn('Failed to dispatch pause event:', e);
            }
            
            // Set data attributes to indicate paused state
            audioElement.dataset.playing = 'false';
            audioElement.dataset.paused = 'true';
            audioElement.dataset.pausedAt = Date.now().toString();
          }
          
          // 2. Find and pause associated video using multiple selectors for reliability
          let foundVideo = false;
          if (currentlyPlaying) {
            // CRITICAL FIX: Try multiple selector patterns to find the video
            // Extract contract and token ID from the currently playing NFT
            const [currentContract, currentTokenId] = currentlyPlaying.split('-');
            
            // CRITICAL FIX: Get mediaKey if available for more reliable video matching
            const mediaKey = currentPlayingNFT ? getMediaKey(currentPlayingNFT) : '';
            
            // CRITICAL FIX: Enhanced selectors for better video element detection
            const selectors = [
              `#video-${currentlyPlaying}`,
              `video[data-nft-id="${currentlyPlaying}"]`,
              `video[data-contract="${currentContract}"][data-token-id="${currentTokenId}"]`,
              `video[data-nft-id*="${currentTokenId}"]`,
              mediaKey ? `video[data-media-key="${mediaKey}"]` : '',
              `video[src*="${currentTokenId}"]`,
              `video[id*="${currentTokenId}"]`,
              `video` // Last resort: check all videos
            ].filter(Boolean); // Remove empty selectors
            
            // For NFT videos with audio tracks, we need to find all possible matches
            for (const selector of selectors) {
              const videoElements = document.querySelectorAll(selector);
              if (videoElements.length > 0) {
                audioLogger.info(`Found ${videoElements.length} videos with selector: ${selector}`);
                Array.from(videoElements).forEach(v => {
                  if (v instanceof HTMLVideoElement) {
                    audioLogger.info(`Pausing video: ${v.id || 'unnamed'}`);
                    try { v.pause(); } catch (e) { audioLogger.warn('Video pause failed:', e); }
                    try { v.muted = true; } catch (e) {}
                    try { v.volume = 0; } catch (e) {}
                    v.dataset.playing = 'false';
                    foundVideo = true;
                  }
                });
                if (foundVideo) break;
              }
            }
          }
          
          // 3. If no specific video found, pause all videos as a fallback
          if (!foundVideo) {
            const allVideos = document.querySelectorAll('video');
            if (allVideos.length > 0) {
              audioLogger.info(`No specific video found, pausing all ${allVideos.length} videos`);
              Array.from(allVideos).forEach(v => {
                try {
                  if (v instanceof HTMLVideoElement) {
                    v.pause();
                    v.dataset.playing = 'false';
                  }
                } catch (e) {
                  audioLogger.error('Error pausing video:', e);
                }
              });
            }
          }
          
          if (currentPlayingNFT) {
            audioLogger.info(`Audio playback paused for NFT: ${currentPlayingNFT.name}`);
          }
          
          return true; // Successfully paused
        } catch (e) {
          audioLogger.error('Critical error during pause operation:', e);
          return false; // Failed to pause
        }
      };
      
      // Execute pause operation with retry mechanism
      let pauseSuccess = pauseAllMedia();
      
      // CRITICAL FIX: Always retry pause after a short delay to ensure it takes effect
      // This helps catch any race conditions or async issues
      audioLogger.info('Scheduling additional pause attempt for reliability');
      setTimeout(() => {
        if (audioRef.current) {
          audioLogger.info(`RETRY PAUSE: Additional pause attempt for ${audioRef.current.id}`);
          try {
            audioRef.current.pause();
            audioRef.current.muted = true;
            audioRef.current.volume = 0;
            audioRef.current.dataset.playing = 'false';
            audioRef.current.dataset.paused = 'true';
            
            // Verify the pause worked
            if (audioRef.current.paused) {
              audioLogger.info(`RETRY PAUSE: Successfully paused on retry`);
            } else {
              audioLogger.error(`RETRY PAUSE: Audio still not paused after retry!`);
            }
          } catch (retryError) {
            audioLogger.error('RETRY PAUSE: Error during retry:', retryError);
          }
        }
        
        // Also run the full pauseAllMedia function again
        pauseAllMedia();
      }, 50); // Shorter delay for faster response
    } 
    // PLAYING/RESUMING
    else {
      audioLogger.info('Resuming audio playback');
      
      try {
        // Ensure audio element is ready to play
        if (audioRef.current && audioRef.current.readyState === 0) {
          audioLogger.info('Audio not ready yet, loading first');
          audioRef.current.load();
        }
        
        // Attempt to play the audio
        if (audioRef.current) {
          audioLogger.info('Playing audio element:', audioRef.current.id || 'unnamed-audio');
          
          // Make sure we update the duration if it wasn't set properly
          if (audioDuration === 0 && audioRef.current.duration > 0 && !isNaN(audioRef.current.duration)) {
            audioLogger.info('Updating audio duration from audio element:', audioRef.current.duration);
            setAudioDuration(audioRef.current.duration);
            
            // Update the NFT duration if it's not set
            if (currentPlayingNFT && (!currentPlayingNFT.duration || currentPlayingNFT.duration === 0)) {
              currentPlayingNFT.duration = audioRef.current.duration;
              audioLogger.info(`Updated NFT duration from audio: ${audioRef.current.duration}`);
            }
          }
          
          // Check for associated video and get duration from it if available
          if (currentlyPlaying) {
            const [currentContract, currentTokenId] = currentlyPlaying.split('-');
            const selectors = [
              `#video-${currentlyPlaying}`,
              `video[data-nft-id="${currentlyPlaying}"]`,
              `video[data-contract="${currentContract}"][data-token-id="${currentTokenId}"]`,
              `video[data-nft-id*="${currentTokenId}"]`,
              `video[data-media-key]` // Find videos with any media key
            ];
            
            let videoElement: HTMLVideoElement | null = null;
            for (const selector of selectors) {
              const videos = document.querySelectorAll(selector);
              if (videos.length > 0) {
                for (let i = 0; i < videos.length; i++) {
                  const v = videos[i];
                  if (v instanceof HTMLVideoElement) {
                    videoElement = v;
                    break;
                  }
                }
                if (videoElement) break;
              }
            }
            
            // If we found a video, check its duration
            if (videoElement) {
              audioLogger.info(`Found video element, checking duration: ${videoElement.duration}`);
              
              // If video has a valid duration and audio doesn't, use the video duration
              if (videoElement.duration && !isNaN(videoElement.duration) && 
                  (audioDuration === 0 || isNaN(audioDuration))) {
                audioLogger.info(`Setting duration from video: ${videoElement.duration}`);
                setAudioDuration(videoElement.duration);
                
                // Update the NFT duration if it's not set
                if (currentPlayingNFT && (!currentPlayingNFT.duration || currentPlayingNFT.duration === 0)) {
                  currentPlayingNFT.duration = videoElement.duration;
                  audioLogger.info(`Updated NFT duration from video: ${videoElement.duration}`);
                }
              }
              
              // CRITICAL FIX: Ensure video is playing
              try {
                // Unmute and restore volume before playing
                videoElement.muted = false;
                videoElement.volume = 1.0;
                
                videoElement.play().catch(e => {
                  // Only log serious errors
                  if (!(e instanceof DOMException && e.name === 'AbortError')) {
                    audioLogger.error('Error playing video directly:', e);
                  }
                });
                videoElement.dataset.playing = 'true';
              } catch (videoError) {
                audioLogger.error('Error playing video element directly:', videoError);
              }
            }
          }
          
          // CRITICAL FIX: Use a more reliable play method with multiple retries
          const playWithRetries = async (maxRetries = 5) => {  // Increased retries for first NFT
            let attempts = 0;
            let success = false;
            
            // CRITICAL FIX: Ensure we still have a valid audio element
            if (!audioRef.current) {
              audioLogger.error('Audio element no longer available during play retry');
              setIsPlaying(false);
              return false;
            }
            
            const audioElement = audioRef.current;
            
            // CRITICAL FIX: Unmute and restore volume before playing
            audioElement.muted = false;
            audioElement.volume = 1.0;
            
            // CRITICAL FIX: Set proper data attributes
            audioElement.dataset.playing = 'true';
            audioElement.dataset.paused = 'false';
            audioElement.dataset.playAttempt = Date.now().toString();
            
            while (attempts < maxRetries && !success) {
              try {
                audioLogger.info(`Play attempt ${attempts + 1}/${maxRetries} for ${audioElement.id}`);
                
                // CRITICAL FIX: Use Promise.resolve to handle both Promise and non-Promise returns
                await Promise.resolve(audioElement.play());
                
                audioLogger.info(`Audio play successful for ${audioElement.id}`);
                success = true;
                
                // Now try to play any associated videos
                if (currentlyPlaying && success) {
                  const [currentContract, currentTokenId] = currentlyPlaying.split('-');
                  const selectors = [
                    `#video-${currentlyPlaying}`,
                    `video[data-nft-id="${currentlyPlaying}"]`,
                    `video[data-contract="${currentContract}"][data-token-id="${currentTokenId}"]`,
                    `video[data-nft-id*="${currentTokenId}"]`,
                    `video[data-media-key]` // Find videos with any media key
                  ];
                  
                  let foundVideo = false;
                  for (const selector of selectors) {
                    const videoElements = document.querySelectorAll(selector);
                    if (videoElements.length > 0) {
                      audioLogger.info(`Found ${videoElements.length} videos with selector: ${selector}`);
                      Array.from(videoElements).forEach(v => {
                        if (v instanceof HTMLVideoElement) {
                          audioLogger.info(`Resuming video: ${v.id || 'unnamed'}`);
                          v.play().catch(e => {
                            // Only log serious errors
                            if (!(e instanceof DOMException && e.name === 'AbortError')) {
                              audioLogger.error('Error resuming video:', e);
                            }
                          });
                          v.dataset.playing = 'true';
                          foundVideo = true;
                        }
                      });
                      if (foundVideo) break;
                    }
                  }
                }
                
                if (currentPlayingNFT) {
                  audioLogger.info(`Audio playback resumed for NFT: ${currentPlayingNFT.name}`);
                }
              } catch (error) {
                attempts++;
                audioLogger.warn(`Play attempt ${attempts} failed:`, error);
                
                if (attempts >= maxRetries) {
                  // All attempts failed
                  audioLogger.error('All play attempts failed');
                  setIsPlaying(false);
                  
                  // Try to recover based on error type
                  if (error instanceof Error && error.name === 'NotAllowedError') {
                    audioLogger.warn('Auto-play prevented by browser, user interaction required');
                  } else if (audioRef.current) {
                    // For other errors, try reloading
                    try {
                      audioRef.current.load();
                      audioLogger.info('Reloaded audio after play error');
                    } catch (reloadError) {
                      audioLogger.error('Failed to reload audio after error:', reloadError);
                    }
                  }
                } else {
                  // Wait before next attempt
                  const delay = 200 * Math.pow(2, attempts);
                  audioLogger.info(`Waiting ${delay}ms before retry ${attempts + 1}`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            }
            
            return success;
          };
          
          // Start the play process
          playWithRetries().catch(error => {
            audioLogger.error('Error in play retry process:', error);
            setIsPlaying(false);
          });
        } else {
          // No audio reference available
          audioLogger.error('Cannot play - audio reference is null');
          setIsPlaying(false);
        }
      } catch (e) {
        // Handle unexpected errors outside the promise chain
        audioLogger.error('Critical error during resume operation:', e);
        setIsPlaying(false);
      }
    }
  }, [isPlaying, currentlyPlaying, currentPlayingNFT, audioDuration]);

  // Define handlePlayAudio first, before it's used in other functions
  // Force audio context unlocking at the beginning of the component
  useEffect(() => {
    // This ensures that audio context is unlocked even if the DOMContentLoaded event has already fired
    unlockAudioContext();
    
    // Initialize an empty audio element for immediate reference
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      // Set default properties
      audioRef.current.preload = "metadata";
      audioRef.current.volume = 1.0;
      
      audioLogger.info('Audio player initialized with empty audio element');
    }
    
    // Clean up function
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, []);
  
  // Force stop all media elements - independent function that doesn't rely on component state
  const forceStopAllMedia = useCallback(() => {
    audioLogger.warn('⚠️ FORCE STOPPING ALL MEDIA ELEMENTS');
    
    try {
      // Track everything we stop for debugging
      const stoppedElements: string[] = [];
      
      // 1. First, aggressively stop all audio elements on the page
      const allAudios = document.querySelectorAll('audio');
      audioLogger.info(`Force stopping ${allAudios.length} audio elements on page`);
      
      // Create a list of all audio elements to avoid modification during iteration
      const audioList = Array.from(allAudios);
      
      // Use a for loop instead of forEach for better error handling
      for (let i = 0; i < audioList.length; i++) {
        const audio = audioList[i];
        try {
          const id = audio.id || audio.dataset?.currentNftId || `unnamed-audio-${i}`;
          stoppedElements.push(id);
          
          // Multiple techniques to ensure it stops
          audio.pause();
          audio.currentTime = 0;
          audio.muted = true;
          audio.volume = 0;
          
          if ('removeAttribute' in audio) {
            audio.removeAttribute('src');
            try { audio.load(); } catch (e) {}
          }
          
          // DO NOT try to remove from DOM - this causes errors
          // Instead, just make sure it's completely disabled
          audio.muted = true;
          audio.volume = 0;
          audio.currentTime = 0;
          audio.loop = false;
          audio.autoplay = false;
          
          // Set a data attribute to mark it as stopped
          audio.dataset.stopped = 'true';
        } catch (e) {
          audioLogger.error(`Error stopping audio ${i}:`, e);
        }
      }
      
      // 2. Force stop all video elements too
      const allVideos = document.querySelectorAll('video');
      audioLogger.info(`Force stopping ${allVideos.length} video elements on page`);
      
      // Create a list of all video elements to avoid modification during iteration
      const videoList = Array.from(allVideos);
      
      // Process each video element
      for (let i = 0; i < videoList.length; i++) {
        const video = videoList[i];
        try {
          const id = video.id || `unnamed-video-${i}`;
          stoppedElements.push(id);
          
          // Multiple techniques to ensure it stops
          video.pause();
          video.currentTime = 0;
          video.muted = true;
          video.volume = 0;
          
          // Remove source to ensure it really stops
          if ('removeAttribute' in video) {
            video.removeAttribute('src');
            try { video.load(); } catch (e) {}
          }
          
          // Mark as stopped
          video.dataset.playing = 'false';
          video.dataset.stopped = 'true';
        } catch (e) {
          audioLogger.error(`Error stopping video ${i}:`, e);
        }
      }
      
      audioLogger.info(`CLEANUP COMPLETE - Stopped ${stoppedElements.length} media elements`);
      return true;
    } catch (e) {
      audioLogger.error('Critical error in forceStopAllMedia:', e);
      return false;
    }
  }, []);

  const handlePlayAudio = useCallback(async (nft: NFT, context?: { queue?: NFT[], queueType?: string }) => {
    // Add mobile optimization
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Always update queue context
    if (context?.queue) {
      setCurrentQueue(context.queue);
      setQueueType(context.queueType || 'default');
    } else if (!currentQueue.length) {
      // If no queue exists, create a single-item queue
      setCurrentQueue([nft]);
      setQueueType('single');
    }
    audioLogger.info('handlePlayAudio called with NFT:', {
      name: nft.name,
      id: `${nft.contract}-${nft.tokenId}`,
      imageUrl: nft.image || nft.metadata?.image,
      audioUrl: nft.audio || nft.metadata?.animation_url
    });

    const audioUrl = nft.metadata?.animation_url || nft.audio;
    if (!audioUrl) {
      audioLogger.error('No audio URL found for NFT');
      return;
    }

    // If same NFT is clicked, toggle play/pause
    if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
      audioLogger.info('Same NFT clicked, toggling play/pause');
      handlePlayPause();
      return;
    }
    
    // IMPORTANT: If we're currently playing something, pause it first
    if (isPlaying && audioRef.current) {
      audioLogger.info('Stopping current playback before switching to new NFT');
      try {
        audioRef.current.pause();
        setIsPlaying(false);
      } catch (e) {
        audioLogger.error('Error stopping current playback:', e);
      }
    }
    
    // CRITICAL: Force stop all media before proceeding with new NFT
    audioLogger.warn('⚠️ CRITICAL: Force stopping all media before switching to new NFT');
    forceStopAllMedia();
    
    // Double-check audio element is stopped
    if (audioRef.current) {
      try {
        audioLogger.info('Ensuring main audio element is completely stopped');
        audioRef.current.pause();
        audioRef.current.muted = true;
        audioRef.current.volume = 0;
        audioRef.current.currentTime = 0;
        
        if ('removeAttribute' in audioRef.current) {
          audioRef.current.removeAttribute('src');
          try { audioRef.current.load(); } catch (e) {}
        }
        
        // Set to null to ensure we create a completely new element
        audioRef.current = null;
      } catch (e) {
        audioLogger.error('Error stopping main audio element:', e);
        // Set to null anyway to force a fresh start
        audioRef.current = null;
      }
    }
    
    audioLogger.info('====== SWITCHING NFT PLAYBACK ======');
    audioLogger.info('From:', currentPlayingNFT?.name || 'No previous NFT');
    audioLogger.info('To:', nft.name);
    
    // CRITICAL: Perform a complete reset of all playback state
    // ---------------------------------------------------------
    
    // CRITICAL SECTION: Ensure proper cleanup of previous media
    audioLogger.info('🧹 CLEANUP - Starting complete cleanup of previous media');
    
    // We already called forceStopAllMedia above, so this is just additional logging
    audioLogger.info('CLEANUP - Previous media stopping completed');
    
    // Wait a short time to ensure all stop operations have fully completed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 4. Fully reset the state variables before setting new ones
    audioLogger.info('CLEANUP - Resetting playback state');
    setAudioProgress(0);
    setAudioDuration(0);
    setIsPlaying(false);
    
    // 5. Important: Wait until everything is cleared before setting new state
    audioLogger.info('STATE - Setting new NFT as current');
    setCurrentPlayingNFT(null); // First clear the current NFT
    setCurrentlyPlaying(null);  // Clear current ID
    
    // Create a new Audio element from scratch each time for the cleanest state
    try {
      // First, find any existing audio element with this ID to prevent duplicates
      const existingAudio = document.getElementById(`audio-player-${nft.contract}-${nft.tokenId}`);
      if (existingAudio) {
        audioLogger.info(`Found existing audio element for NFT: ${nft.name}`);
        try {
          // Instead of removing it, just stop it and detach event listeners
          if (existingAudio instanceof HTMLAudioElement) {
            // Remove all event listeners by cloning and replacing the node
            const parent = existingAudio.parentNode;
            if (parent) {
              // Create a clean clone without event listeners
              const cleanElement = existingAudio.cloneNode(false) as HTMLAudioElement;
              cleanElement.pause();
              cleanElement.src = '';
              cleanElement.load();
              cleanElement.style.display = 'none';
              cleanElement.dataset.active = 'false';
              cleanElement.dataset.stopped = 'true';
              
              // Replace the old element with the clean one
              parent.replaceChild(cleanElement, existingAudio);
            } else {
              // If no parent, just clean up the existing element
              existingAudio.pause();
              existingAudio.src = '';
              existingAudio.load();
              existingAudio.style.display = 'none';
              existingAudio.dataset.active = 'false';
              existingAudio.dataset.stopped = 'true';
              
              // Remove all event listeners
              existingAudio.onplay = null;
              existingAudio.onpause = null;
              existingAudio.onended = null;
              existingAudio.ontimeupdate = null;
              existingAudio.onloadedmetadata = null;
              existingAudio.onerror = null;
            }
          }
        } catch (stopError) {
          audioLogger.error(`Error handling existing audio element: ${stopError}`);
        }
      }
      
      // Create a new audio element using document.createElement
      const newAudio = document.createElement('audio');
      
      // CRITICAL FIX: Set the ID first before any other operations
      // This ensures the ID is available for all subsequent operations
      const audioId = `audio-player-${nft.contract}-${nft.tokenId}`;
      newAudio.id = audioId;
      
      // Configure audio properties for reliable playback
      newAudio.preload = "auto";
      newAudio.volume = 1.0;
      newAudio.autoplay = false;
      newAudio.loop = false;
      newAudio.crossOrigin = "anonymous";
      
      // Add data attributes to track this element
      newAudio.dataset.isMainPlayer = 'true'; 
      newAudio.dataset.currentNftId = `${nft.contract}-${nft.tokenId}`;
      newAudio.dataset.active = 'true';
      
      // CRITICAL FIX: Ensure mediaKey is properly set for tracking
      const mediaKey = getMediaKey(nft);
      newAudio.dataset.mediaKey = mediaKey; 
      
      // CRITICAL FIX: Add a timestamp to prevent caching issues
      newAudio.dataset.timestamp = Date.now().toString();
      
      // Make it invisible but keep it in the DOM for reliable playback
      newAudio.style.display = 'none';
      newAudio.style.position = 'absolute';
      newAudio.style.width = '0';
      newAudio.style.height = '0';
      
      // CRITICAL FIX: Add comprehensive event listeners for all critical events
      // Use addEventListener instead of on* properties for better reliability
      
      // Metadata loaded event with enhanced handling
      newAudio.addEventListener('loadedmetadata', () => {
        audioLogger.info(`Direct metadata loaded for NFT: ${nft.name}, duration: ${newAudio.duration}`);
        if (newAudio.duration && !isNaN(newAudio.duration)) {
          // CRITICAL FIX: Force update audio duration in state
          setAudioDuration(newAudio.duration);
          audioLogger.info(`Setting audio duration to ${newAudio.duration} seconds`);
          
          // Update NFT with duration if it's not already set
          if (nft && (!nft.duration || nft.duration === 0)) {
            nft.duration = newAudio.duration;
            audioLogger.info(`Updated NFT duration from audio: ${newAudio.duration}`);
          }
          
          // CRITICAL FIX: Log the audio element's complete state
          audioLogger.info(`Audio metadata loaded: {duration: ${newAudio.duration}, currentTime: ${newAudio.currentTime}, nftName: '${nft.name}', readyState: ${newAudio.readyState}}`);
        } else {
          audioLogger.warn(`Invalid duration received in loadedmetadata: ${newAudio.duration}`);
        }
      }, { once: false });
      
      // Duration change event with enhanced handling
      newAudio.addEventListener('durationchange', () => {
        audioLogger.info(`Duration changed for NFT: ${nft.name}, new duration: ${newAudio.duration}`);
        if (newAudio.duration && !isNaN(newAudio.duration)) {
          // CRITICAL FIX: Force update audio duration in state
          setAudioDuration(newAudio.duration);
          audioLogger.info(`Setting audio duration to ${newAudio.duration} seconds`);
          
          // Update NFT with duration if it's not already set
          if (nft && (!nft.duration || nft.duration === 0)) {
            nft.duration = newAudio.duration;
            audioLogger.info(`Updated NFT duration from audio change: ${newAudio.duration}`);
          }
          
          // CRITICAL FIX: Ensure we update the UI with the new duration
          // This helps ensure the progress bar and time display are accurate
          setTimeout(() => {
            if (newAudio && newAudio.duration && !isNaN(newAudio.duration)) {
              setAudioDuration(newAudio.duration);
              audioLogger.info(`Verified duration update: ${newAudio.duration}s`);
            }
          }, 50);
        } else {
          audioLogger.warn(`Invalid duration received in durationchange: ${newAudio.duration}`);
        }
      }, { once: false });
      
      // Initialize the audio element's play tracking state
      // CRITICAL FIX: Complete overhaul of play tracking system with multiple safeguards
      
      // Set initial tracking flag on element
      newAudio.dataset.playTracked = 'false';
      
      // Attach a timestamp to identify this specific audio element instance
      newAudio.dataset.trackingTimestamp = Date.now().toString();
      
      // Get or generate a unique mediaKey for proper tracking - accessible in the event handler
      const nftMediaKey = getMediaKey(nft);
      if (nftMediaKey) {
        newAudio.dataset.mediaKey = nftMediaKey;
      }
      
      // Check if this NFT has already been tracked in this session
      // This provides an extra layer of protection against duplicate play counts
      if (typeof window !== 'undefined' && nftMediaKey) {
        // @ts-ignore - Using a dynamic property on window for tracking
        const globalTracking = window.__nftPlaysTracked || {};
        
        if (globalTracking[nftMediaKey]) {
          audioLogger.info(`🔄 NFT ${nft.name} was already tracked in this session - preventing duplicate play count`);
          newAudio.dataset.playTracked = 'true'; // Mark as tracked immediately
          setHasReachedThreshold(true); // Update state
        }
      }
      
      // Add timeupdate event with comprehensive play tracking prevention
      newAudio.addEventListener('timeupdate', () => {
        // Only update if the element is still the active one
        if (newAudio.dataset.active === 'true') {
          const currentTime = newAudio.currentTime;
          const duration = newAudio.duration || 0;
          
          // Basic progress update (no play tracking here, just UI updates)
          setAudioProgress(currentTime);
          
          // Minimal progress logging to avoid console spam
          if (Math.floor(currentTime) % 5 === 0 && currentTime > 0) {
            audioLogger.info(`Playback progress: ${currentTime.toFixed(2)}/${duration.toFixed(2)} seconds`);
          }
          
          // CRITICAL FIX: Multi-layered protection against multiple play counts
          // We check MULTIPLE flags to ensure we NEVER count a play more than once
          if (duration > 0 && currentTime >= (duration * 0.25)) {
            // PROTECTION LAYER 1: Check element's dataset flag
            if (newAudio.dataset.playTracked === 'false') {
              // PROTECTION LAYER 2: Check React state to see if we've tracked this mediaKey before
              if (!hasReachedThreshold && (!nftMediaKey || !trackedMediaKeys[nftMediaKey])) {
                // IMMEDIATELY set ALL protective flags to prevent race conditions
                newAudio.dataset.playTracked = 'true';
                setHasReachedThreshold(true);
                
                // Update our tracking record for this media key
                if (nftMediaKey) {
                  setTrackedMediaKeys(prev => ({
                    ...prev,
                    [nftMediaKey]: true
                  }));
                }
                
                // Log the single successful play count
                audioLogger.info(
                  `✅ 25% THRESHOLD REACHED - Recording EXACTLY ONE play: ${nft.name} ` +
                  `(${currentTime.toFixed(1)}s of ${duration.toFixed(1)}s)`
                );
                
                // PROTECTION LAYER 3: Add a global window flag for this specific NFT playback session
                // This ensures that even if the component remounts, we don't track twice
                if (typeof window !== 'undefined' && nftMediaKey) {
                  // @ts-ignore - Using a dynamic property on window for tracking
                  window.__nftPlaysTracked = window.__nftPlaysTracked || {};
                  // @ts-ignore
                  window.__nftPlaysTracked[nftMediaKey] = true;
                }
                
                // CRITICAL: Track the play exactly once
                // Record the play (this function internally handles mediaKey-based tracking)
                trackNFTPlay(nft, fid);
                
                // Return early to guarantee no further execution
                return;
              } else {
                // Already tracked this media item previously, just update the flag on this element
                newAudio.dataset.playTracked = 'true';
                audioLogger.info(`🛑 Prevented duplicate play count - NFT was already tracked: ${nft.name}`);
              }
            }
          }
        }
      }, { once: false });
      
      // Error handling for the audio element
      newAudio.addEventListener('error', (e) => {
        audioLogger.error(`Audio playback error for NFT ${nft.name}:`, e);
        // Reset state on error
        setIsPlaying(false);
      });
      
      // CRITICAL FIX: Add play and pause events to ensure state stays in sync
      newAudio.addEventListener('play', () => {
        audioLogger.info(`Audio play event fired for NFT: ${nft.name}`);
        setIsPlaying(true);
      }, { once: false });
      
      // CRITICAL FIX: Enhanced pause event handler with verification
      newAudio.addEventListener('pause', () => {
        audioLogger.info(`Audio pause event fired for NFT: ${nft.name}`);
        setIsPlaying(false);
        
        // Verify pause state and log it
        if (newAudio.paused) {
          audioLogger.info(`Verified audio is actually paused for NFT: ${nft.name}`);
        } else {
          audioLogger.error(`CRITICAL: Audio reports paused event but paused=false for NFT: ${nft.name}`);
          // Force pause again
          try {
            newAudio.pause();
            newAudio.muted = true;
            newAudio.volume = 0;
          } catch (e) {}
        }
      }, { once: false });
      
      newAudio.addEventListener('ended', () => {
        audioLogger.info(`Audio playback ended for NFT: ${nft.name}`);
        setIsPlaying(false);
      }, { once: false });
      
      // Append to document body to ensure it remains available
      document.body.appendChild(newAudio);
      
      // Set the audio reference to this new element
      audioRef.current = newAudio;
      
      audioLogger.info(`Created new audio element for NFT: ${nft.name}`);
    } catch (e) {
      audioLogger.error('Error creating new audio element:', e);
      return; // Exit if we can't create the audio element
    }
    
    // Set the new NFT immediately to prevent race conditions
    audioLogger.info('STATE - Now setting new NFT:', nft.name);
    setCurrentPlayingNFT(nft);
    setCurrentlyPlaying(`${nft.contract}-${nft.tokenId}`);
    
    // Reset audio duration state and update from NFT if available
    if (nft.duration && nft.duration > 0) {
      audioLogger.info(`Setting audio duration from NFT metadata: ${nft.duration}`);
      setAudioDuration(nft.duration);
    } else {
      // Reset duration to 0 for now, will be updated when metadata loads
      setAudioDuration(0);
      audioLogger.info('Reset audio duration to 0, waiting for metadata');
    }
    
    // Reset threshold flag for the new NFT
    setHasReachedThreshold(false);
    
    // Reset tracking in VideoPlayContext for this NFT to allow multiple plays
    // of the same NFT to be tracked correctly without affecting ad counters
    resetNFTTrackingState(nft);
    
    // We'll only track the play after reaching the 25% threshold
    // This happens in the timeupdate event listener
    
    // Still update recently played NFTs immediately for UI purposes
    try {
      if (setRecentlyPlayedNFTs) {
        setRecentlyPlayedNFTs((prevNFTs: NFT[]) => {
          const newNFT: NFT = { ...nft };
          // Get mediaKey for the new NFT
          const newMediaKey = getMediaKey(nft);
          if (!newMediaKey) {
            audioLogger.error('Could not generate mediaKey for NFT:', nft);
            return prevNFTs;
          }
          
          // Filter out NFTs with the same contract+tokenId (case insensitive) to avoid duplicates
          const nftKey = `${nft.contract}-${nft.tokenId}`.toLowerCase();
          const filteredNFTs = prevNFTs.filter(item => {
            const itemKey = `${item.contract}-${item.tokenId}`.toLowerCase();
            return itemKey !== nftKey;
          });
          
          audioLogger.info('Adding NFT to Recently Played:', nft.name);
          audioLogger.info('NFT Key for deduplication:', nftKey);
          audioLogger.info('Filtered out duplicates, previous count:', prevNFTs.length, 'new count:', filteredNFTs.length);
          
          // Track this NFT as recently added to prevent duplicates from subscription
          if (recentlyAddedNFT) {
            recentlyAddedNFT.current = nftKey;
            
            // Clear the ref after a delay
            setTimeout(() => {
              if (recentlyAddedNFT.current === nftKey) {
                recentlyAddedNFT.current = null;
              }
            }, 2000);
          }
          
          // Add the new NFT to the beginning and limit to 8 items
          return [newNFT, ...filteredNFTs].slice(0, 8);
        });
      }
    } catch (error) {
      audioLogger.error('Error tracking NFT play:', error);
    }
    
    // Log detailed information about the NFT being played
    audioLogger.info('NFT playback details:', {
      name: nft.name,
      contract: nft.contract,
      tokenId: nft.tokenId,
      isVideo: nft.isVideo,
      audioUrl: audioUrl,
      hasAnimationUrl: !!nft.metadata?.animation_url,
      mediaKey: getMediaKey(nft)
    });

    // NEW CODE: Check if this is a video with embedded audio
    const isVideoWithEmbeddedAudio = nft.isVideo && 
      (nft.metadata?.animation_url?.match(/\.(mp4|webm|mov)$/i));

    if (isVideoWithEmbeddedAudio) {
      audioLogger.info('Playing video with embedded audio');
      
      // Find the video element
      const videoElement = document.querySelector(`#video-${nft.contract}-${nft.tokenId}`) as HTMLVideoElement;
      
      if (videoElement) {
        // Unmute the video to hear its audio
        videoElement.muted = false;
        
        // Set up listeners to track playback state and progress
        videoElement.addEventListener('timeupdate', () => {
          setAudioProgress(videoElement.currentTime);
        });
        
        videoElement.addEventListener('loadedmetadata', () => {
          setAudioDuration(videoElement.duration);
        });
        
        videoElement.addEventListener('play', () => setIsPlaying(true));
        videoElement.addEventListener('pause', () => setIsPlaying(false));
        videoElement.addEventListener('ended', () => {
          setIsPlaying(false);
          setAudioProgress(0);
        });
        
        // Try to play the video
        try {
          await videoElement.play();
          setIsPlaying(true);
        } catch (error) {
          audioLogger.error("Error playing video with audio:", error);
          setIsPlaying(false);
        }
        
        // We're using the video element directly, so don't need the audio element
        return;
      }
    }
    
    // EXISTING CODE for audio-only or separate audio+image NFTs
    if (audioRef.current) {
      // Use the audio element we already created and appended to the DOM
      const audio = audioRef.current;
      
      // For diagnostic purposes, add attributes to track the NFT
      audio.dataset.nftName = nft.name;
      audio.dataset.nftId = `${nft.contract}-${nft.tokenId}`;
      
      // Clean up any previous listeners to avoid memory leaks
      const setupAudioListeners = () => {
        // This is a clean function to track all event handlers
        const handlers: {[key: string]: EventListener} = {};
        
        handlers.loadedmetadata = () => {
          audioLogger.info('Audio metadata loaded:', {
            duration: audio.duration,
            currentTime: audio.currentTime,
            nftName: nft.name,
            readyState: audio.readyState
          });
          // Only update state if this is still the current audio element
          if (audioRef.current === audio) {
            // Ensure we set a valid duration
            if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
              audioLogger.info(`Setting audio duration to ${audio.duration} seconds`);
              setAudioDuration(audio.duration);
            } else {
              audioLogger.warn(`Invalid audio duration: ${audio.duration}, attempting to get it another way`);
              // Try to get duration another way
              setTimeout(() => {
                if (audioRef.current === audio && audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
                  audioLogger.info(`Setting delayed audio duration to ${audio.duration} seconds`);
                  setAudioDuration(audio.duration);
                }
              }, 500);
            }
          }
        };
        
        handlers.timeupdate = () => {
          // Only update progress if this is still the current audio element
          if (audioRef.current === audio) {
            setAudioProgress(audio.currentTime);
            
            // Check if we've reached the threshold for tracking play count
            if (!hasReachedThreshold && audio.duration > 0 && 
                (audio.currentTime / audio.duration) >= 0.25) {
              setHasReachedThreshold(true);
              // Track the play count since we've reached the threshold
              if (currentPlayingNFT) {
                audioLogger.info(`Tracking play count for NFT: ${currentPlayingNFT.name} (reached 25% threshold)`);
                trackNFTPlay(currentPlayingNFT, fid);
              }
            }
          }
        };
        
        handlers.play = () => {
          audioLogger.info(`Audio playback started for NFT: ${nft.name}`);
          // Only update state if this is still the current audio element
          if (audioRef.current === audio) {
            setIsPlaying(true);
          }
        };
        
        handlers.pause = () => {
          audioLogger.info(`Audio playback paused for NFT: ${nft.name}`);
          // Only update state if this is still the current audio element
          if (audioRef.current === audio) {
            setIsPlaying(false);
          }
        };
        
        handlers.ended = () => {
          audioLogger.info(`Audio playback ended for NFT: ${nft.name}`);
          // Only update state if this is still the current audio element
          if (audioRef.current === audio) {
            setIsPlaying(false);
            setAudioProgress(0);
            
            // Auto-play next track if in a queue
            if (currentQueue.length > 1) {
              handlePlayNext();
            }
          }
        };
        
        handlers.error = (e: Event) => {
          audioLogger.error(`Audio error for NFT: ${nft.name}`, {
            error: (e as ErrorEvent).error,
            errorCode: audio.error?.code,
            errorMessage: audio.error?.message,
            src: audio.src,
            readyState: audio.readyState
          });
          
          // Only update state if this is still the current audio element
          if (audioRef.current === audio) {
            setIsPlaying(false);
            
            // Try to recover by creating a new audio element if possible
            try {
              // Mark this audio element as having an error
              audio.dataset.hasError = 'true';
              
              // Try fallback URL if available
              if (nft.fallbackAudioUrl && nft.fallbackAudioUrl !== audio.src) {
                audioLogger.info(`Trying fallback URL for NFT: ${nft.name}`);
                audio.src = processMediaUrl(nft.fallbackAudioUrl);
                audio.load();
                audio.play().catch(e => {
                  audioLogger.error(`Failed to play fallback URL: ${e}`);
                });
              }
            } catch (recoveryError) {
              audioLogger.error(`Error during playback recovery: ${recoveryError}`);
            }
          }
        };
        
        handlers.loadstart = () => {
          audioLogger.info(`Audio loading started for NFT: ${nft.name}`);
        };
        
        handlers.waiting = () => {
          audioLogger.info(`Audio is waiting for data for NFT: ${nft.name}`);
        };
        
        handlers.canplay = () => {
          audioLogger.info(`Audio can start playing for NFT: ${nft.name}`);
        };
        
        handlers.canplaythrough = () => {
          audioLogger.info(`Audio can play through without buffering for NFT: ${nft.name}`);
        };
        
        // Attach all handlers
        Object.entries(handlers).forEach(([event, handler]) => {
          audio.addEventListener(event, handler);
        });
        
        // Return cleanup function
        return () => {
          Object.entries(handlers).forEach(([event, handler]) => {
            audio.removeEventListener(event, handler);
          });
        };
      };
      
      // Setup the listeners
      const cleanupListeners = setupAudioListeners();
      
      // Replace the current audio reference
      audioRef.current = audio;
      
      // When we replace the audio element, make sure we unlock audio context
      unlockAudioContext();

      // When setting up the audio element
      if (isMobile) {
        // Optimize for mobile
        audio.preload = "metadata"; // Only preload metadata first
        
        // Set a lower volume initially to avoid popping on mobile
        audio.volume = 0.7;
        
        // Use a smaller buffer size on mobile to reduce memory usage
        if ('mozFragmentSize' in audio) {
          (audio as any).mozFragmentSize = 1024; // Firefox-specific
        }
        
        // Use low latency mode on Android Chrome if available
        if ('webkitAudioContext' in window) {
          audio.dataset.lowLatency = 'true';
        }
      }
      
      // Set the source AFTER adding all event listeners
      const processedUrl = processMediaUrl(audioUrl);
      audioLogger.info(`Setting audio source for NFT: ${nft.name}`, { url: processedUrl });
      
      // Set critical audio properties for consistent playback
      audio.crossOrigin = "anonymous"; // Allow CORS audio where supported
      audio.preload = "auto"; // Force preload of entire audio file
      audio.src = processedUrl;
      
      // Force the browser to start loading the audio
      audioLogger.info(`Explicitly loading audio for NFT: ${nft.name}`);
      try {
        audio.load();
      } catch (loadError) {
        audioLogger.error(`Error loading audio for NFT: ${nft.name}`, loadError);
      }

      try {
        // CRITICAL FIX: For all NFTs, we need a consistent approach
        // with multiple fallbacks to ensure reliable playback
        const playWithAdvancedRetry = async () => {
          // Make the retry process more aggressive for all NFTs (not just the first one)
          const maxRetries = 5; // Increase from 3 to 5
          let retryCount = 0;
          let success = false;
          
          // Different strategies to try
          const strategies = [
            // Strategy 1: Standard play
            async () => {
              audioLogger.info(`Strategy 1: Standard play for NFT: ${nft.name}`);
              return audio.play();
            },
            // Strategy 2: Delayed play (wait for canplay event)
            async () => {
              audioLogger.info(`Strategy 2: Delayed play with canplay event for NFT: ${nft.name}`);
              return new Promise<void>((resolve, reject) => {
                const canPlayHandler = () => {
                  audio.removeEventListener('canplay', canPlayHandler);
                  audio.play().then(resolve).catch(reject);
                };
                
                // Set a timeout in case canplay never fires
                const timeout = setTimeout(() => {
                  audio.removeEventListener('canplay', canPlayHandler);
                  reject(new Error('Timeout waiting for canplay event'));
                }, 2000);
                
                // If we already have enough data, play immediately
                if (audio.readyState >= 3) {
                  clearTimeout(timeout);
                  audio.play().then(resolve).catch(reject);
                } else {
                  audio.addEventListener('canplay', canPlayHandler);
                }
              });
            },
            // Strategy 3: Muted play then unmute (for autoplay restrictions)
            async () => {
              audioLogger.info(`Strategy 3: Muted play for NFT: ${nft.name}`);
              audio.muted = true;
              await audio.play();
              // Unmute after a short delay
              setTimeout(() => {
                audio.muted = false;
              }, 500);
            },
            // Strategy 4: Force audio context unlock then play
            async () => {
              audioLogger.info(`Strategy 4: Force audio context unlock for NFT: ${nft.name}`);
              // Unlock audio context
              const ctx = unlockAudioContext();
              if (ctx && ctx.state === 'suspended') {
                await ctx.resume();
              }
              
              // Create a silent buffer to force unlock
              if (ctx) {
                try {
                  const buffer = ctx.createBuffer(1, 1, 22050);
                  const source = ctx.createBufferSource();
                  source.buffer = buffer;
                  source.connect(ctx.destination);
                  source.start(0);
                } catch (ctxError) {
                  audioLogger.warn('Error creating audio context buffer:', ctxError);
                }
              }
              
              // Try to play after a short delay
              await new Promise(resolve => setTimeout(resolve, 100));
              return audio.play();
            },
            // Strategy 5: Reload and play
            async () => {
              audioLogger.info(`Strategy 5: Reload and play for NFT: ${nft.name}`);
              const currentSrc = audio.src;
              audio.src = '';
              await new Promise(resolve => setTimeout(resolve, 50));
              audio.src = currentSrc;
              audio.load();
              await new Promise(resolve => setTimeout(resolve, 100));
              return audio.play();
            }
          ];
          
          // Customize strategies for mobile vs desktop
          const orderedStrategies = isMobile ? 
            [strategies[0], strategies[2], strategies[3], strategies[1], strategies[4]] : // Mobile order
            [strategies[0], strategies[1], strategies[3], strategies[4], strategies[2]]; // Desktop order
          
          // Try each strategy with increasing delays between attempts
          while (retryCount < maxRetries && !success) {
            // Select strategy (cycle through them)
            const strategyIndex = retryCount % orderedStrategies.length;
            const currentStrategy = orderedStrategies[strategyIndex];
            
            try {
              audioLogger.info(`Attempt ${retryCount + 1}/${maxRetries} for NFT: ${nft.name} using strategy ${strategyIndex + 1}`);
              await currentStrategy();
              
              // Check if audio is actually playing
              if (!audio.paused) {
                audioLogger.info(`Successfully played NFT: ${nft.name} on attempt ${retryCount + 1} using strategy ${strategyIndex + 1}`);
                success = true;
                setIsPlaying(true);
                break;
              } else {
                throw new Error(`Audio still paused after strategy ${strategyIndex + 1}`);
              }
            } catch (error) {
              audioLogger.warn(`Strategy ${strategyIndex + 1} failed for NFT: ${nft.name}:`, error);
              retryCount++;
              
              // Progressive backoff delay between retries
              if (retryCount < maxRetries) {
                const delay = 200 * Math.pow(1.5, retryCount);
                audioLogger.info(`Waiting ${delay}ms before next attempt`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          
          if (!success) {
            audioLogger.error(`All ${maxRetries} play attempts failed for NFT: ${nft.name}`);
            setIsPlaying(false);
            throw new Error(`Failed to play NFT: ${nft.name} after exhausting all strategies`);
          }
        };
        
        // Start the enhanced play process
        await playWithAdvancedRetry();
        
        // Only start the new video after we're sure all previous media has stopped
        audioLogger.info('Attempting to start video for new NFT if it exists');
        
        // Use a more immediate approach for video playback to avoid timing issues
        const startVideo = () => {
          // Find by multiple selector patterns to ensure we get the right video
          const selectors = [
            `#video-${nft.contract}-${nft.tokenId}`,
            `video[data-nft-id="${nft.contract}-${nft.tokenId}"]`,
            `video[data-contract="${nft.contract}"][data-token-id="${nft.tokenId}"]`,
            // Add more flexible selectors to catch videos that might have different attribute formats
            `video[data-nft-id*="${nft.tokenId}"]`,
            `video[id*="${nft.tokenId}"]`,
            // If the NFT has animation_url, try to find video elements with that source
            ...(nft.metadata?.animation_url ? [`video[src*="${nft.metadata.animation_url.split('/').pop()}"]`] : [])
          ];
          
          audioLogger.info(`Looking for video with selectors: ${selectors.join(', ')}`);
          
          let videoFound = false;
          let videoElement: HTMLVideoElement | null = null;
          
          // Try each selector until we find a match
          for (const selector of selectors) {
            const foundVideos = document.querySelectorAll(selector);
            audioLogger.info(`Selector ${selector} found ${foundVideos.length} videos`);
            
            // Convert NodeListOf to Array to make it iterable
            Array.from(foundVideos).forEach(video => {
              if (video instanceof HTMLVideoElement) {
                videoElement = video;
                audioLogger.info(`Found video element with selector: ${selector}`);
                videoFound = true;
              }
            });
            
            if (videoFound) break;
          }
          
          // If no video found by selectors, try to find any video elements in the NFT card
          if (!videoFound) {
            const nftCards = document.querySelectorAll(`[data-nft-id="${nft.contract}-${nft.tokenId}"], [data-contract="${nft.contract}"][data-token-id="${nft.tokenId}"]`);
            // Convert NodeListOf to Array to make it iterable
            Array.from(nftCards).forEach(card => {
              const videos = card.querySelectorAll('video');
              if (videos.length > 0 && !videoFound) {
                videoElement = videos[0] as HTMLVideoElement;
                audioLogger.info(`Found video element inside NFT card`);
                videoFound = true;
              }
            });
          }
          
          if (videoElement) {
              // Explicitly cast to HTMLVideoElement to fix TypeScript errors
              const typedVideoElement = videoElement as HTMLVideoElement;
              
              // Set attributes to ensure it's properly associated with the current NFT
              typedVideoElement.dataset.nftId = `${nft.contract}-${nft.tokenId}`;
              typedVideoElement.dataset.contract = nft.contract;
              typedVideoElement.dataset.tokenId = nft.tokenId;
              typedVideoElement.dataset.mediaKey = getMediaKey(nft); // Add mediaKey for tracking
              typedVideoElement.dataset.playing = 'true';
              
              // Force video to be visible
              typedVideoElement.style.display = 'block';
              typedVideoElement.style.visibility = 'visible';
              typedVideoElement.style.opacity = '1';
              
              // Add event listeners to update duration from video if needed
              typedVideoElement.onloadedmetadata = () => {
                const duration = typedVideoElement ? typedVideoElement.duration : 0;
                audioLogger.info(`Video metadata loaded for NFT: ${nft.name}, duration: ${duration}`);
                // If audio duration is not set or is zero, use video duration
                if ((!audioDuration || audioDuration === 0) && duration && !isNaN(duration)) {
                  audioLogger.info(`Setting duration from video: ${duration}`);
                  setAudioDuration(duration);
                  
                  // Update NFT with duration if it's not already set
                  if (nft && (!nft.duration || nft.duration === 0)) {
                    nft.duration = duration;
                    audioLogger.info(`Updated NFT duration from video: ${duration}`);
                  }
                }
              };
              
              // Only play if this is still the current NFT (avoid race conditions)
              if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
                // Ensure video is unmuted and has correct volume
                typedVideoElement.muted = false;
                typedVideoElement.volume = 1.0;
                
                // Try to play the video with multiple attempts if needed
                const playVideo = async () => {
                  // Use the typed reference to prevent null issues
                  const videoEl = typedVideoElement;
                  if (!videoEl) {
                    audioLogger.warn('Video element no longer available');
                    return;
                  }
                  
                  try {
                    await videoEl.play();
                    audioLogger.info(`Video playback started for NFT: ${nft.name}`);
                  } catch (error) {
                    // Only log video errors if they're not abort errors
                    if (!(error instanceof DOMException && error.name === 'AbortError')) {
                      audioLogger.error("Error playing video:", error);
                      
                      // Try again after a short delay
                      setTimeout(async () => {
                        try {
                          if (!videoEl) return;
                          // Try to reload the video
                          videoEl.load();
                          await videoEl.play();
                          audioLogger.info(`Video playback started after retry for NFT: ${nft.name}`);
                        } catch (retryError) {
                          audioLogger.error("Error playing video after retry:", retryError);
                        }
                      }, 500);
                    }
                  }
                };
                
                playVideo();
              } else {
                audioLogger.warn('NFT changed during video setup, not playing video');
              }
            } else {
              audioLogger.info('No video element found for this NFT');
            }
          };
          
          // Start video immediately and also try again after a short delay
          startVideo();
          setTimeout(startVideo, 300); // Try again after a short delay in case the video element wasn't ready
      } catch (error) {
        // Don't treat AbortError as an error - it's normal when ads trigger
        if (error instanceof DOMException && error.name === 'AbortError') {
          audioLogger.debug('Audio playback interrupted by ad system', {
            nftId: `${nft.contract}-${nft.tokenId}`,
            audioUrl: audioUrl,
            timestamp: new Date().toISOString()
          });
          // Don't set isPlaying to false for AbortError as the ad system will handle playback state
        } else {
          audioLogger.error("Error playing audio:", {
            error,
            nftId: `${nft.contract}-${nft.tokenId}`,
            audioUrl: audioUrl
          });
          setIsPlaying(false);
        }
      }
    }

    // iOS-specific audio-video sync fix
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS && nft.isVideo) {
      // iOS often needs a user interaction to properly sync audio and video
      // Create a silent audio context to unlock audio
      const unlockAudio = () => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const audioCtx = new AudioContext();
          // Create buffer for short sound
          const buffer = audioCtx.createBuffer(1, 1, 22050);
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(audioCtx.destination);
          source.start(0);
          
          // Resume audio context
          if (audioCtx.state === 'suspended') {
            audioCtx.resume();
          }
        }
      };
      
      unlockAudio();
      
      // For iOS, we need to ensure the video element is properly reset
      const videoElement = document.querySelector(`#video-${nft.contract}-${nft.tokenId}`);
      if (videoElement instanceof HTMLVideoElement) {
        // Reset video element for iOS
        videoElement.currentTime = 0;
        videoElement.load();
      }
    }
  }, [currentlyPlaying, handlePlayPause, fid, setRecentlyPlayedNFTs, hasReachedThreshold, trackNFTProgress, hasReachedPlayThreshold, resetNFTTrackingState]);
  
  // Precision function to fully stop media for a specific NFT
  const clearMediaForNFT = useCallback((nft: NFT | null) => {
    if (!nft) {
      audioLogger.info('No NFT provided to clearMediaForNFT');
      return;
    }
    
    audioLogger.info('Clearing all media for NFT:', nft.name);
    
    // Build the identifier
    const nftId = `${nft.contract}-${nft.tokenId}`;
    
    // Find and stop video elements
    const videoSelectors = [
      `#video-${nftId}`,               // Primary selector
      `video[data-nft-id="${nftId}"]`, // Data attribute selector
      `video[data-contract="${nft.contract}"][data-token-id="${nft.tokenId}"]` // Multiple attributes
    ];
    
    // Try each selector to find the video
    let videoElement: HTMLVideoElement | null = null;
    for (const selector of videoSelectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLVideoElement) {
        videoElement = element;
        break;
      }
    }
    
    // If found, stop the video
    if (videoElement) {
      audioLogger.info('Stopping video for NFT:', nftId);
      videoElement.pause();
      videoElement.currentTime = 0;
      videoElement.muted = true;
      try {
        // For some browsers, this helps release resources
        videoElement.src = '';
        videoElement.load();
      } catch (e) {
        // Ignore errors from this operation
      }
    } else {
      audioLogger.debug('No video element found for NFT:', nftId);
    }
  }, []);
  
  // Function to stop current media
  const stopCurrentMedia = useCallback(() => {
    audioLogger.info('Stopping current NFT media');
    
    // First, stop the audio reference element
    if (audioRef.current) {
      audioLogger.info('Stopping current audio reference');
      audioRef.current.pause();
      audioRef.current.src = ''; 
      audioRef.current.load();
    }
    
    // Then clear media for the current NFT
    if (currentPlayingNFT) {
      clearMediaForNFT(currentPlayingNFT);
    }
  }, [currentPlayingNFT, clearMediaForNFT]);
  
  // Helper function to pause (not stop) current media
  const safelyPauseMedia = useCallback(() => {
    if (!currentPlayingNFT) return;
    
    audioLogger.info('Pausing media for:', currentPlayingNFT.name || 'unknown NFT');
    
    // Pause audio player
    if (audioRef.current) {
      audioLogger.info('Pausing audio');
      audioRef.current.pause();
    }
    
    // Get NFT ID
    const nftId = `${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`;
    
    // Try multiple selector formats to find the video
    const videoSelectors = [
      `#video-${nftId}`,
      `video[data-nft-id="${nftId}"]`,
      `video[data-contract="${currentPlayingNFT.contract}"][data-token-id="${currentPlayingNFT.tokenId}"]`
    ];
    
    // Try each selector
    for (const selector of videoSelectors) {
      const video = document.querySelector(selector);
      if (video instanceof HTMLVideoElement) {
        audioLogger.info('Pausing video element with selector:', selector);
        video.pause();
        break; // Found and paused a video, no need to continue
      }
    }
  }, [currentPlayingNFT]);

  // Now define handlePlayNext and handlePlayPrevious which use handlePlayAudio
  const handlePlayNext = useCallback(async () => {
    if (!currentPlayingNFT) return;
    
    // Use the current queue that was set when the NFT was played
    // instead of relying on window.nftList
    if (currentQueue.length === 0) {
      audioLogger.debug('No queue available for next track');
      return;
    }

    audioLogger.info('Next button pressed. Current queue length:', currentQueue.length);
    audioLogger.info('Current queue type:', queueType);
    
    // Find current index in the queue
    const currentIndex = currentQueue.findIndex(
      (nft: NFT) => nft.contract === currentPlayingNFT.contract && nft.tokenId === currentPlayingNFT.tokenId
    );

    audioLogger.info('Current index in queue:', currentIndex);

    if (currentIndex === -1) {
      audioLogger.debug('Current NFT not found in queue');
      return;
    }

    // Get next NFT in queue with wraparound
    const nextIndex = (currentIndex + 1) % currentQueue.length;
    const nextNFT = currentQueue[nextIndex];

    audioLogger.info('Playing next NFT:', nextNFT.name, 'at index:', nextIndex);
    
    if (nextNFT) {
      // Pass the same queue context to maintain consistency
      await handlePlayAudio(nextNFT, { queue: currentQueue, queueType });
    }
  }, [currentPlayingNFT, handlePlayAudio, currentQueue, queueType]);

  const handlePlayPrevious = useCallback(async () => {
    if (!currentPlayingNFT) return;
    
    // Get the current queue from window.nftList which is set by the Demo component
    // based on the current page/category
    const currentPageQueue = window.nftList || [];
    
    if (!currentPageQueue.length) {
      audioLogger.debug('No queue available for previous track');
      return;
    }

    audioLogger.info('Previous button pressed. Current queue length:', currentPageQueue.length);
    
    // Find current index in the current page queue
    const currentIndex = currentPageQueue.findIndex(
      (nft: NFT) => nft.contract === currentPlayingNFT.contract && nft.tokenId === currentPlayingNFT.tokenId
    );

    audioLogger.info('Current index in queue:', currentIndex);

    if (currentIndex === -1) {
      audioLogger.debug('Current NFT not found in queue');
      return;
    }

    // Get previous NFT in queue with wraparound
    const prevIndex = (currentIndex - 1 + currentPageQueue.length) % currentPageQueue.length;
    const prevNFT = currentPageQueue[prevIndex];

    audioLogger.info('Playing previous NFT:', prevNFT.name, 'at index:', prevIndex);
    
    if (prevNFT) {
      // Update our internal queue to match the page queue
      setCurrentQueue(currentPageQueue);
      await handlePlayAudio(prevNFT);
    }
  }, [currentPlayingNFT, handlePlayAudio]);

  const handleSeek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setAudioProgress(time);
  }, []);

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