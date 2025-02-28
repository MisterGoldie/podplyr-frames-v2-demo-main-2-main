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
  
  // Detect both iOS and Android
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;
  const posterUrl = nft.image || nft.metadata?.image || '';
  
  // Enhanced URL handling for a wide range of NFT storage providers
  let videoUrl = directUrl;
  
  // Handle IPFS URLs in various formats
  if (directUrl.includes('ipfs://')) {
    // Choose the best gateway for each platform
    if (isAndroid) {
      // Android often performs better with dweb.link gateway
      videoUrl = directUrl.replace('ipfs://', 'https://dweb.link/ipfs/');
    } else if (isIOS) {
      // iOS often performs better with Cloudflare gateway
      videoUrl = directUrl.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');
    } else {
      // Default for desktop
      videoUrl = directUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
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
    
    // Mobile-specific optimizations
    if (isMobile) {
      // Both Android and iOS need these optimizations
      video.style.transform = 'translateZ(0)'; // Hardware acceleration
      
      // Android-specific handling
      if (isAndroid) {
        video.preload = 'metadata'; // Save bandwidth on Android
        // Android often performs better with explicit controls
        video.controls = true;
      }
      
      // iOS-specific handling
      if (isIOS) {
        video.setAttribute('webkit-playsinline', 'true');
        video.preload = 'metadata';
        video.controls = true;
      }
    } else {
      // Desktop can handle higher quality and autoloading
      video.preload = 'auto';
    }
    
    const handleCanPlay = () => {
      if (onLoadComplete) onLoadComplete();
    };
    
    const handleError = (e: Event) => {
      console.error('Video playback error:', e);
      
      // Simple fallback mechanism - try platform-specific fallbacks
      if (directUrl.includes('ipfs://')) {
        console.log('Trying fallback IPFS gateway...');
        
        // Different fallbacks based on platform
        if (isAndroid) {
          video.src = directUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
        } else if (isIOS) {
          video.src = directUrl.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
        } else {
          video.src = directUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
        }
        
        video.load();
        return;
      }
      
      if (onError) onError(new Error('Video failed to load'));
    };
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    // Simple one-time play attempt when video element is ready
    if (video.readyState >= 2) { // HAVE_CURRENT_DATA
      // For mobile, delay playback slightly to ensure buffer
      if (isMobile) {
        setTimeout(() => {
          video.play().catch(err => {
            console.log('Initial play failed (expected on mobile):', err.name);
          });
        }, 100);
      } else {
        video.play().catch(err => {
          console.log('Initial play failed:', err.name);
        });
      }
    }
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, [isHostedPlayer, onLoadComplete, onError, videoUrl, directUrl, isMobile, isIOS, isAndroid]);
  
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
      controls={isMobile} // Add controls for all mobile devices
      className="w-full h-full object-cover rounded-md"
      style={{ 
        transform: 'translateZ(0)', // Hardware acceleration for all platforms
        // Add Android-specific height limitations to improve performance
        ...(isAndroid ? { maxHeight: '480px' } : {})
      }} 
      {...(isIOS ? { 'webkit-playsinline': 'true' } : {})}
      {...(isAndroid ? { 'playsinline': 'true' } : {})}
    />
  );
}; 