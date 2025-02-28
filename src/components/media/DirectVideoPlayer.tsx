'use client';

import React, { useEffect, useRef } from 'react';
import { NFT } from '../../types/user';

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
  
  // Enhanced URL handling for a wide range of NFT storage providers
  let videoUrl = directUrl;
  
  // Handle IPFS URLs in various formats
  if (directUrl.includes('ipfs://')) {
    videoUrl = directUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
  } else if (directUrl.includes('ar://')) {
    videoUrl = directUrl.replace('ar://', 'https://arweave.net/');
  } else if (directUrl.includes('nftstorage.link')) {
    // NFT.Storage URLs - already direct URLs, but can be optimized
    videoUrl = directUrl;
  } else if (directUrl.includes('ipfs.infura.io')) {
    // Handle Infura IPFS URLs
    const cid = directUrl.split('/ipfs/')[1];
    if (cid) {
      videoUrl = `https://ipfs.io/ipfs/${cid}`;
    }
  } else if (directUrl.includes('cloudflare-ipfs.com')) {
    // Already using Cloudflare gateway, keep as is
    videoUrl = directUrl;
  } else if (directUrl.includes('ipfs.dweb.link')) {
    // Already using dweb.link gateway, keep as is
    videoUrl = directUrl;
  } else if (directUrl.includes('gateway.pinata.cloud')) {
    // Already using Pinata gateway, keep as is
    videoUrl = directUrl;
  }
  
  // Check if this is a hosted video player URL rather than a direct video file
  const isHostedPlayer = 
    directUrl.includes('player.vimeo.com') || 
    directUrl.includes('youtube.com/embed') || 
    directUrl.includes('opensea.io/assets');
  
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
      
      // Simple fallback mechanism - try ipfs.io if any other gateway fails
      if (directUrl.includes('ipfs://') && !videoUrl.includes('ipfs.io')) {
        console.log('Trying fallback IPFS gateway...');
        video.src = directUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
        video.load();
        return;
      }
      
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
  }, [isHostedPlayer, onLoadComplete, onError, videoUrl, directUrl]);
  
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
      style={{ transform: 'translateZ(0)' }} // Basic hardware acceleration
      {...(isIOS ? { 'webkit-playsinline': 'true' } : {})}
    />
  );
}; 