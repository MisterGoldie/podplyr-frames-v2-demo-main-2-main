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

  useEffect(() => {
    let mounted = true;
    const initializePlayer = async () => {
      if (!mounted) return;
      if (!nft.metadata?.animation_url) {
        console.warn('No animation URL found for NFT:', nft.name);
        setIsLoading(false);
        return;
      }

      try {
        if (!nft.metadata?.animation_url) {
          throw new Error('No animation URL found');
        }

        // Get Mux asset (should already be preloaded by FeaturedSection)
        const muxAsset = getMuxAsset(nft);
        if (!muxAsset) {
          console.warn('No Mux asset found for NFT:', nft.name);
          setIsLoading(false);
          return;
        }
        
        if (mounted) {
          setPlaybackId(muxAsset.playbackId);
          setAssetStatus(muxAsset.status);
        }

        // If the asset is still preparing, poll for status updates
        if (muxAsset.status === 'preparing') {
          const pollStatus = async () => {
            try {
              const statusResponse = await fetch(`/api/mux/asset-status?playbackId=${muxAsset.playbackId}`);
              if (!statusResponse.ok || !mounted) return;
              
              const statusData = await statusResponse.json();
              setAssetStatus(statusData.status);
              
              if (statusData.status === 'preparing' && mounted) {
                setTimeout(pollStatus, pollInterval);
              }
            } catch (error) {
              console.error('Error polling asset status:', error);
            }
          };
          
          setTimeout(pollStatus, pollInterval);
        }

        console.log('Mux asset initialized successfully:', { playbackId: muxAsset.playbackId, status: muxAsset.status });
      } catch (error) {
        console.error('Error initializing Mux player:', error);
        
        // Implement retry logic
        if (retryCount < maxRetries) {
          console.log(`Retrying Mux initialization (${retryCount + 1}/${maxRetries})...`);
          setRetryCount(prev => prev + 1);
          setTimeout(initializePlayer, 2000 * (retryCount + 1)); // Exponential backoff
          return;
        }
        
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    };

    initializePlayer();
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
