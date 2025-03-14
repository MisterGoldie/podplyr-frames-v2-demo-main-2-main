'use client';

import React, { useEffect, useState, useRef } from 'react';
import MuxPlayerReact from '@mux/mux-player-react';
import type { NFT } from '../../types/user';
import { getMediaKey } from '../../utils/media';
import { getMuxAsset, preloadAudio } from '../../utils/audioPreloader';
import { isCellularConnection } from '../../utils/cellularOptimizer';
import { setVideoPlaybackState } from '../../utils/networkPrioritizer';
import { enterVideoFirstMode, exitVideoFirstMode } from '../../utils/videoFirstMode';
import { 
  getMuxDirectStreamUrl, 
  preloadHlsStream 
} from '../../utils/directStreamLoader';
import { prewarmVideo } from '../../utils/videoPrewarmer';

interface MuxPlayerProps {
  nft: NFT;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export const MuxPlayer: React.FC<MuxPlayerProps> = ({
  nft,
  autoPlay = false,
  muted = true,
  loop = true,
  onError,
  onReady
}) => {
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [assetStatus, setAssetStatus] = useState<string>('unknown');
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const pollInterval = 5000; // 5 seconds
  const [useFallbackMux, setUseFallbackMux] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const { isCellular, generation } = isCellularConnection();
  
  // For MSE implementation
  const [videoChunks, setVideoChunks] = useState<string[]>([]);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  // Detect if we're on a mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Add these states to your component
  const [isDirectStreamLoaded, setIsDirectStreamLoaded] = useState(false);
  const [directStreamUrl, setDirectStreamUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let pollTimeout: NodeJS.Timeout;
    
    const initializePlayer = async () => {
      if (!mounted) return;
      if (!nft.metadata?.animation_url) {
        console.warn('No animation URL found for NFT:', nft.name);
        setIsLoading(false);
        return;
      }

      try {
        // Get Mux asset (should already be preloaded by FeaturedSection)
        let currentMuxAsset = getMuxAsset(nft);
        
        // If no asset exists, create one with mobile-optimized settings
        if (!currentMuxAsset) {
          // Temporarily disable preloadAudio to avoid errors
          // await preloadAudio(nft);
          console.log('Skipping preload for Mux asset');
          
          // Retry getting the asset
          currentMuxAsset = getMuxAsset(nft);
          if (!currentMuxAsset) {
            console.warn('Failed to create Mux asset for NFT:', nft.name);
            setIsLoading(false);
            return;
          }
        }

        // At this point currentMuxAsset is guaranteed to be non-null
        setPlaybackId(currentMuxAsset.playbackId);
        setAssetStatus(currentMuxAsset.status);
        
        // If the asset is still preparing, poll for status updates
        if (currentMuxAsset.status === 'preparing') {
          const pollStatus = async () => {
            try {
              const statusResponse = await fetch(`/api/mux/asset-status?playbackId=${currentMuxAsset.playbackId}`);
              if (!statusResponse.ok || !mounted) return;
              
              const statusData = await statusResponse.json();
              if (!mounted) return;
              
              setAssetStatus(statusData.status);
              
              if (statusData.status === 'preparing' && mounted && retryCount < maxRetries) {
                pollTimeout = setTimeout(pollStatus, pollInterval);
                setRetryCount(prev => prev + 1);
              } else if (statusData.status === 'ready') {
                setIsLoading(false);
              } else if (statusData.status === 'errored' || retryCount >= maxRetries) {
                setIsLoading(false);
                onError?.(new Error(`Asset creation failed: ${statusData.status}`));
              }
            } catch (error) {
              console.error('Error polling asset status:', error);
              if (mounted) {
                setIsLoading(false);
                onError?.(error instanceof Error ? error : new Error('Unknown error'));
              }
            }
          };
          
          pollTimeout = setTimeout(pollStatus, pollInterval);
        }

        console.log('Mux asset initialized successfully:', { 
          playbackId: currentMuxAsset.playbackId, 
          status: currentMuxAsset.status 
        });
      } catch (error) {
        console.error('Error initializing Mux player:', error);
        
        // Implement retry logic with cleanup
        if (retryCount < maxRetries && mounted) {
          console.log(`Retrying Mux initialization (${retryCount + 1}/${maxRetries})...`);
          setRetryCount(prev => prev + 1);
          pollTimeout = setTimeout(initializePlayer, 2000 * (retryCount + 1)); // Exponential backoff
          return;
        }
        
        if (mounted) {
          setIsLoading(false);
          onError?.(error instanceof Error ? error : new Error('Failed to initialize Mux player'));
        }
      }
    };

    initializePlayer();

    return () => {
      mounted = false;
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
    };
  }, [nft, onError, retryCount]);

  // Initialize MSE for cellular connections
  useEffect(() => {
    if (!isCellular || useFallbackMux || !nft.metadata?.animation_url) return;
    
    const setupMSE = async () => {
      try {
        if (!videoRef.current) return;
        
        // Create MediaSource instance
        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;
        
        // Set video source to MediaSource object URL - only use for MediaSource objects
        // which are explicitly created in our code and not from external sources
        const objectUrl = URL.createObjectURL(mediaSource);
        videoRef.current.src = objectUrl;
        
        // Store the URL for later cleanup
        const previousUrl = mediaUrlRef.current;
        mediaUrlRef.current = objectUrl;
        
        // Clean up previous URL if it exists
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        
        // When MediaSource is ready
        mediaSource.addEventListener('sourceopen', async () => {
          try {
            // Create SourceBuffer for MP4 content
            const mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
            if (!MediaSource.isTypeSupported(mimeType)) {
              throw new Error('Unsupported MIME type');
            }
            
            const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            sourceBufferRef.current = sourceBuffer;
            
            // Determine optimal chunk size based on network generation
            const chunkSize = generation === '5G' ? 5000000 : // 5MB for 5G
                             generation === '4G' ? 2000000 : // 2MB for 4G
                             1000000; // 1MB for 3G/2G
            
            // Start loading initial chunks - add null check for animation_url
            if (nft.metadata?.animation_url) {
              await loadInitialChunks(nft.metadata.animation_url, chunkSize);
            } else {
              console.error('No animation URL available');
              fallbackToDirectVideo();
            }
            
          } catch (error) {
            console.error('MSE setup error:', error);
            fallbackToDirectVideo();
          }
        });
        
      } catch (error) {
        console.error('MSE initialization error:', error);
        fallbackToDirectVideo();
      }
    };
    
    setupMSE();
    
    return () => {
      // Clean up MSE resources
      if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
        mediaSourceRef.current.endOfStream();
      }
    };
  }, [nft, isCellular, useFallbackMux, generation]);
  
  // Function to load initial video chunks
  const loadInitialChunks = async (videoUrl: string | undefined, chunkSize: number) => {
    // Early return if videoUrl is undefined
    if (!videoUrl) {
      console.error('Video URL is undefined');
      fallbackToDirectVideo();
      return;
    }
    
    try {
      // Fetch video file headers to get content length
      const headResponse = await fetch(videoUrl, { method: 'HEAD' });
      const contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
      
      if (contentLength === 0) {
        throw new Error('Could not determine video size');
      }
      
      // Calculate number of chunks
      const numChunks = Math.ceil(contentLength / chunkSize);
      console.log(`Video size: ${contentLength} bytes, splitting into ${numChunks} chunks`);
      
      // Load first chunk immediately
      await loadChunk(videoUrl, 0, Math.min(chunkSize, contentLength));
      
      // Set up chunk loading for the rest
      if (numChunks > 1) {
        // Preload next chunk
        loadChunk(videoUrl, chunkSize, Math.min(chunkSize * 2, contentLength));
      }
      
      setIsLoading(false);
      onReady?.();
      
    } catch (error) {
      console.error('Chunk loading error:', error);
      fallbackToDirectVideo();
    }
  };
  
  // Function to load a specific chunk
  const loadChunk = async (videoUrl: string, start: number, end: number) => {
    if (!sourceBufferRef.current || !mediaSourceRef.current) return;
    
    try {
      // Wait if the source buffer is updating
      if (sourceBufferRef.current.updating) {
        return new Promise<void>(resolve => {
          sourceBufferRef.current!.addEventListener('updateend', () => {
            loadChunk(videoUrl, start, end).then(resolve);
          }, { once: true });
        });
      }
      
      // Fetch the chunk with range headers
      const response = await fetch(videoUrl, {
        headers: { Range: `bytes=${start}-${end-1}` }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch chunk: ${response.status}`);
      }
      
      // Convert to ArrayBuffer and append to source buffer
      const chunk = await response.arrayBuffer();
      sourceBufferRef.current.appendBuffer(chunk);
      
      // Wait for the chunk to be processed
      return new Promise<void>(resolve => {
        sourceBufferRef.current!.addEventListener('updateend', () => {
          console.log(`Loaded chunk: bytes ${start}-${end-1}`);
          resolve();
        }, { once: true });
      });
      
    } catch (error) {
      console.error(`Error loading chunk ${start}-${end}:`, error);
      throw error;
    }
  };
  
  // Fallback to direct video if MSE fails
  const fallbackToDirectVideo = () => {
    console.log('Falling back to direct video playback');
    if (videoRef.current && nft.metadata?.animation_url) {
      // Clean up MSE if needed
      if (mediaSourceRef.current) {
        URL.revokeObjectURL(videoRef.current.src);
      }
      
      // Set up direct video playback
      videoRef.current.src = nft.metadata.animation_url;
      videoRef.current.load();
    } else {
      console.error('Cannot fall back: video element or animation URL not available');
      setIsLoading(false);
      onError?.(new Error('Video source not available'));
    }
  };

  // Monitor buffering and load more chunks as needed
  useEffect(() => {
    if (!isCellular || useFallbackMux || !videoRef.current) return;
    
    const video = videoRef.current;
    
    const handleProgress = () => {
      if (!video || !nft.metadata?.animation_url) return;
      
      try {
        // Check if we need to load more data
        if (video.buffered.length > 0) {
          const bufferedEnd = video.buffered.end(video.buffered.length - 1);
          const timeRemaining = video.duration - video.currentTime;
          const bufferedTimeAhead = bufferedEnd - video.currentTime;
          
          // If less than 10 seconds buffered ahead, load more
          if (bufferedTimeAhead < 10 && timeRemaining > bufferedTimeAhead && !isBuffering) {
            setIsBuffering(true);
            console.log('Buffer running low, loading more data...');
            
            // Load more data using MSE if available, otherwise just let the browser handle it
            if (sourceBufferRef.current && mediaSourceRef.current) {
              // Implementation would depend on how you're tracking chunks
              // This is a simplified example
              setCurrentChunk(prev => prev + 1);
            }
            
            setIsBuffering(false);
          }
        }
      } catch (e) {
        console.error('Error monitoring buffer:', e);
      }
    };
    
    video.addEventListener('progress', handleProgress);
    video.addEventListener('timeupdate', handleProgress);
    
    return () => {
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('timeupdate', handleProgress);
    };
  }, [isCellular, useFallbackMux, nft, isBuffering]);

  useEffect(() => {
    // Notify when video starts/stops playing
    setVideoPlaybackState(autoPlay);
    
    return () => {
      // Ensure we reset state when component unmounts
      setVideoPlaybackState(false);
    };
  }, [autoPlay]);

  useEffect(() => {
    // Enter Video-First mode when starting to load
    if (isLoading) {
      enterVideoFirstMode();
    }
    
    // Exit Video-First mode when video is ready
    if (!isLoading && playbackId && assetStatus === 'ready') {
      // Give the video a head start before resuming other operations
      setTimeout(() => {
        exitVideoFirstMode();
      }, 5000);
    }
  }, [isLoading, playbackId, assetStatus]);

  // Add this effect for cellular networks
  useEffect(() => {
    if (isCellular && playbackId && !isDirectStreamLoaded) {
      // On cellular, load the stream directly instead of using Mux's player
      const loadDirectStream = async () => {
        try {
          // Get direct stream URL
          const streamUrl = await getMuxDirectStreamUrl(playbackId);
          
          // Preload first few chunks
          console.log('🌐 Cellular network detected - preloading HLS stream directly');
          await preloadHlsStream(streamUrl);
          
          // Set the stream URL for the video element
          setDirectStreamUrl(streamUrl);
          setIsDirectStreamLoaded(true);
          
          // Notify that we're ready
          if (onReady) onReady();
        } catch (error) {
          console.error('Error loading direct stream:', error);
        }
      };
      
      loadDirectStream();
    }
  }, [playbackId, isDirectStreamLoaded, onReady]);

  // Add this effect to attach HLS.js if using direct stream
  useEffect(() => {
    if (videoRef.current && directStreamUrl && isDirectStreamLoaded) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferSize: 10 * 1000 * 1000, // 10MB
            maxBufferHole: 0.5,
            lowLatencyMode: false,
            highBufferWatchdogPeriod: 2,
            nudgeMaxRetry: 5
          });
          
          hls.loadSource(directStreamUrl);
          hls.attachMedia(videoRef.current!);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (videoRef.current) {
              videoRef.current.play().catch(err => {
                console.warn('Autoplay prevented:', err);
              });
            }
          });
          
          return () => {
            hls.destroy();
          };
        } else if (videoRef.current!.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support
          videoRef.current!.src = directStreamUrl;
        }
      });
    }
  }, [directStreamUrl, isDirectStreamLoaded]);

  useEffect(() => {
    if (playbackId) {
      // Prewarm the video as soon as we have a playback ID
      prewarmVideo(playbackId).catch(err => {
        console.warn('Error prewarming video:', err);
      });
    }
  }, [playbackId]);

  if (isLoading || assetStatus === 'preparing') {
    return (
      <div className="w-full h-full bg-gray-800 animate-pulse rounded-lg flex items-center justify-center">
        <div className="text-white text-sm text-center">
          {isLoading ? (
            retryCount > 0 ? `Retrying... (${retryCount}/${maxRetries})` : 'Loading...'
          ) : (
            <>
              <div>Processing video...</div>
              <div className="text-xs text-gray-400 mt-1">This may take a few minutes</div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!playbackId) {
    // Fallback to native video player if Mux fails
    return (
      <video
        ref={videoRef}
        src={nft.metadata?.animation_url}
        className="w-full h-full object-cover rounded-lg"
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
      />
    );
  }

  // For cellular, use optimized video element
  if (isCellular && !useFallbackMux) {
    return (
      <div className="cellular-optimized-player">
        <video
          ref={videoRef}
          className="direct-video-player"
          playsInline
          muted={muted}
          loop={loop}
          controls
          autoPlay={autoPlay}
          poster={nft.metadata?.image || ''}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '0.5rem',
            backgroundColor: '#000',
          }}
        />
        
        {isBuffering && (
          <div className="buffering-indicator" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px'
          }}>
            Buffering...
          </div>
        )}
      </div>
    );
  }

  // For WiFi or fallback, use Mux player
  const muxAsset = getMuxAsset(nft);
  return (
    <div className="w-full h-full bg-gray-800 animate-pulse rounded-lg flex items-center justify-center">
      <div className="text-white text-sm text-center">
        {isLoading ? (
          retryCount > 0 ? `Retrying... (${retryCount}/${maxRetries})` : 'Loading...'
        ) : (
          <>
            <div>Processing video...</div>
            <div className="text-xs text-gray-400 mt-1">This may take a few minutes</div>
          </>
        )}
      </div>
    </div>
  );
};
