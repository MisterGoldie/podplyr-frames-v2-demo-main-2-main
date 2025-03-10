'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  const [hasError, setHasError] = useState(false);
  const [currentGateway, setCurrentGateway] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2; // Maximum number of times to cycle through all gateways
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  
  // Get direct video URL without any processing
  const directUrl = nft.metadata?.animation_url || '';
  
  // Detect both iOS and Android
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;
  const posterUrl = nft.image || nft.metadata?.image || '';
  
  // Define multiple IPFS gateways to try
  const IPFS_GATEWAYS = [
    'https://cloudflare-ipfs.com/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://dweb.link/ipfs/',
    'https://ipfs.4everland.io/ipfs/',
    'https://gateway.ipfs.io/ipfs/'
  ];
  
  // Enhanced URL handling for a wide range of NFT storage providers
  let videoUrl = directUrl;
  
  // Handle IPFS URLs in various formats
  if (directUrl.includes('ipfs://')) {
    // Choose the best gateway for each platform, but also respect fallback state
    const gateway = IPFS_GATEWAYS[currentGateway];
    videoUrl = directUrl.replace('ipfs://', gateway);
  } else if (directUrl.includes('ar://')) {
    videoUrl = directUrl.replace('ar://', 'https://arweave.net/');
  } else if (directUrl.includes('nftstorage.link')) {
    // NFT.Storage URLs - already direct URLs, but can be optimized
    videoUrl = directUrl;
  } else if (directUrl.includes('ipfs.infura.io')) {
    // Handle Infura IPFS URLs
    const cid = directUrl.split('/ipfs/')[1];
    if (cid) {
      const gateway = IPFS_GATEWAYS[currentGateway];
      videoUrl = `${gateway}${cid}`;
    }
  } else if (directUrl.includes('cloudflare-ipfs.com') || 
             directUrl.includes('ipfs.dweb.link') ||
             directUrl.includes('gateway.pinata.cloud')) {
    // If already using a gateway but it failed, try the next one
    if (hasError) {
      const cid = extractIPFSCID(directUrl);
      if (cid) {
        const gateway = IPFS_GATEWAYS[currentGateway];
        videoUrl = `${gateway}${cid}`;
      } else {
        videoUrl = directUrl; // Keep original if CID extraction fails
      }
    } else {
      videoUrl = directUrl; // Keep original for first attempt
    }
  }
  
  // Extract IPFS CID from various gateway URLs
  function extractIPFSCID(url: string): string | null {
    // Common patterns for IPFS URLs
    const patterns = [
      /ipfs\/([a-zA-Z0-9]+)/,
      /ipfs\.io\/ipfs\/([a-zA-Z0-9]+)/,
      /gateway\.pinata\.cloud\/ipfs\/([a-zA-Z0-9]+)/,
      /cloudflare-ipfs\.com\/ipfs\/([a-zA-Z0-9]+)/,
      /dweb\.link\/ipfs\/([a-zA-Z0-9]+)/,
      /ipfs\.4everland\.io\/ipfs\/([a-zA-Z0-9]+)/,
      /gateway\.ipfs\.io\/ipfs\/([a-zA-Z0-9]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }
  
  // Check if this is a hosted video player URL rather than a direct video file
  const isHostedPlayer = 
    directUrl.includes('player.vimeo.com') || 
    directUrl.includes('youtube.com/embed') || 
    directUrl.includes('opensea.io/assets');
  
  // Use Intersection Observer for visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Only load video when visible and hovered
  const shouldLoadVideo = isVisible && isHovered;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isHostedPlayer) return;
    
    // Reset video element to prevent previous error states from persisting
    video.removeAttribute('src');
    video.load();
    
    // Check if we've exceeded max retries
    if (currentGateway === 0 && retryCount >= MAX_RETRIES) {
      setHasError(true);
      if (onError) onError(new Error('Maximum retry attempts reached'));
      return; // Stop trying after reaching max retries
    }
    
    // Set video URL after cleaning
    video.src = videoUrl;
    
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
      setHasError(false); // Reset error state on successful load
      if (onLoadComplete) onLoadComplete();
    };
    
    const handleError = (e: Event) => {
      // Only log the first error for each video
      if (!hasError) {
        console.error('Video playback error:', e);
      }
      
      // Try the next gateway if this is an IPFS URL
      if (directUrl.includes('ipfs://') || 
          directUrl.includes('ipfs.') || 
          directUrl.includes('/ipfs/')) {
        
        const nextGateway = (currentGateway + 1) % IPFS_GATEWAYS.length;
        
        // If we're cycling back to the first gateway, increment retry count
        if (nextGateway === 0) {
          // If we've already hit max retries, give up
          if (retryCount >= MAX_RETRIES) {
            setHasError(true);
            if (onError) onError(new Error('Failed to load video after maximum retries'));
            return;
          }
          
          // Otherwise increment retry count and continue
          setRetryCount(retryCount + 1);
        }
        
        // Only try the next gateway if we haven't exceeded max retries
        if (retryCount < MAX_RETRIES) {
          if (!hasError) {
            console.log(`Trying gateway ${nextGateway + 1}/${IPFS_GATEWAYS.length} (retry ${retryCount + 1}/${MAX_RETRIES + 1})...`);
          }
          setHasError(true);
          setCurrentGateway(nextGateway);
        }
        return;
      }
      
      // For non-IPFS URLs, fail gracefully after first attempt
      if (!hasError) {
        setHasError(true);
        if (onError) onError(new Error('Video failed to load'));
      }
    };
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    // Simple one-time play attempt when video element is ready
    if (retryCount < MAX_RETRIES) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // Don't log autoplay errors, they're expected
          if (err.name !== 'NotAllowedError') {
            console.log('Play failed:', err.name);
          }
        });
      }
    }
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      
      // Cancel any pending play operation when unmounting
      if (video.src) {
        video.pause();
        video.src = '';
        video.load();
      }
    };
  }, [isHostedPlayer, onLoadComplete, onError, videoUrl, directUrl, isMobile, isIOS, isAndroid, hasError, currentGateway, retryCount]);
  
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
  
  // If we've tried all gateways and still have errors, show a static image fallback
  if (hasError && (currentGateway === 0 && retryCount >= MAX_RETRIES)) {
    return (
      <div className="relative w-full h-full">
        <img
          src={posterUrl || "/default-nft.png"}
          alt={nft.name || "NFT Media"}
          className="w-full h-full object-cover rounded-md"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-1 px-2 text-center">
          Video unavailable
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={elementRef}
      className="relative w-full h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Static thumbnail */}
      <img
        src={nft.image || nft.metadata?.image}
        alt={nft.name || 'NFT'}
        className={`w-full h-full object-cover ${shouldLoadVideo ? 'opacity-0' : 'opacity-100'}`}
        style={{
          position: shouldLoadVideo ? 'absolute' : 'relative',
          transition: 'opacity 0.3s ease-in-out'
        }}
      />
      
      {/* Video - only loaded when needed */}
      {shouldLoadVideo && (
        <video
          ref={videoRef}
          id={`video-${nft.contract}-${nft.tokenId}`}
          poster={nft.image || nft.metadata?.image}
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
      )}
    </div>
  );
}; 