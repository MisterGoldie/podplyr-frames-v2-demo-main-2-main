'use client';

import React, { useEffect, useState } from 'react';
import MuxPlayerReact from '@mux/mux-player-react';
import type { NFT } from '../../types/user';
import { getMediaKey } from '../../utils/media';
import { getMuxAsset, preloadAudio } from '../../utils/audioPreloader';

interface MuxPlayerProps {
  nft: NFT;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  onError?: (error: Error) => void;
}

export const MuxPlayer: React.FC<MuxPlayerProps> = ({
  nft,
  autoPlay = false,
  muted = true,
  loop = true,
  onError
}) => {
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [assetStatus, setAssetStatus] = useState<string>('unknown');
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const pollInterval = 5000; // 5 seconds

  // Detect if we're on a mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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
          await preloadAudio(nft);
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
        src={nft.metadata?.animation_url}
        className="w-full h-full object-cover rounded-lg"
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
      />
    );
  }

  return (
    <MuxPlayerReact
      playbackId={playbackId}
      metadata={{
        video_title: nft.name,
        player_name: 'PODPlayr',
      }}
      streamType="on-demand"
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      preferPlayback="mse"
      preload="auto"
      defaultHiddenCaptions
      defaultShowRemainingTime
      thumbnailTime={0}
      style={{
        aspectRatio: '1/1',
        width: '100%',
        height: '100%',
        borderRadius: '0.5rem',
        '--controls': 'none',
        '--media-object-fit': 'cover',
      } as React.CSSProperties}
    />
  );
};
