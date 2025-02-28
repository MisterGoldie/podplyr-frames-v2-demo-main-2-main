'use client';

import React, { useEffect, useRef } from 'react';
import { NFT } from '../../types/user';
import { setupHls, destroyHls, getHlsUrl, isHlsUrl } from '../../utils/hlsUtils';
import { processMediaUrl } from '../../utils/media';

interface DirectVideoPlayerProps {
  nft: NFT;
  onLoadComplete?: () => void;
  onError?: (error: Error) => void;
}

export const DirectVideoPlayer: React.FC<DirectVideoPlayerProps> = ({ 
  nft, 
  onLoadComplete,
  onError 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Get direct video URL without any processing
  const directUrl = nft.metadata?.animation_url || '';
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const posterUrl = nft.image || nft.metadata?.image || '';
  
  // Special handling for different URL types
  let videoUrl = directUrl;
  if (directUrl.includes('ipfs://')) {
    videoUrl = directUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
  } else if (directUrl.includes('ar://')) {
    videoUrl = directUrl.replace('ar://', 'https://arweave.net/');
  }
  
  // Check if this is a hosted video player URL rather than a direct video file
  const isHostedPlayer = 
    directUrl.includes('player.vimeo.com') || 
    directUrl.includes('youtube.com/embed') || 
    directUrl.includes('opensea.io/assets');
  
  // Check if we can use HLS for better Farcaster Frame compatibility
  const shouldTryHls = !isHostedPlayer && videoRef.current && typeof window !== 'undefined';
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isHostedPlayer) return;
    
    // Absolute minimal setup - just the essential attributes
    video.muted = true;
    video.playsInline = true;
    
    // Load metadata first to prevent unnecessary bandwidth usage
    video.preload = 'metadata';
    
    const handleCanPlay = () => {
      if (onLoadComplete) onLoadComplete();
    };
    
    const handleError = (e: Event) => {
      console.error('Video playback error:', e);
      if (onError) onError(new Error('Video failed to load'));
    };
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    // Simple one-time play attempt when video element is ready
    if (video.readyState >= 2) { // HAVE_CURRENT_DATA
      video.play().catch(err => {
        console.log('Initial play failed (expected on mobile):', err.name);
      });
    }
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, [isHostedPlayer, onLoadComplete, onError]);
  
  useEffect(() => {
    // Add HLS support
    if (shouldTryHls && videoRef.current) {
      const videoId = `direct-${nft.contract}-${nft.tokenId}`;
      const processedUrl = processMediaUrl(directUrl);
      
      // Try to use HLS if possible
      setupHls(videoId, videoRef.current, getHlsUrl(processedUrl))
        .then(() => {
          console.log('HLS initialized for direct player');
        })
        .catch((error) => {
          console.error('HLS failed, falling back to direct URL:', error);
          if (videoRef.current) {
            videoRef.current.src = videoUrl;
            videoRef.current.load();
          }
        });
      
      return () => {
        destroyHls(videoId);
      };
    }
  }, [directUrl, shouldTryHls, nft.contract, nft.tokenId, videoUrl]);
  
  // Render an iframe for hosted players, or video for direct media
  if (isHostedPlayer) {
    return (
      <iframe
        ref={iframeRef}
        src={videoUrl}
        className="w-full h-full border-0 rounded-md"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={nft.name || "NFT Media"}
      />
    );
  }
  
  return (
    <video
      ref={videoRef}
      id={`video-${nft.contract}-${nft.tokenId}`}
      src={videoUrl}
      poster={posterUrl}
      muted
      loop
      playsInline
      controls={isIOS} // Add controls for iOS which has special playback requirements
      className="w-full h-full object-cover rounded-md"
      {...(isIOS ? { 'webkit-playsinline': 'true' } : {})}
    />
  );
}; 