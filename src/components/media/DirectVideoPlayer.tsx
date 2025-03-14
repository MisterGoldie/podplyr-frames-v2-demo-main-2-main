'use client';

import React, { useEffect, useRef, useState } from 'react';
import { NFT } from '../../types/user';
import { preloadNftMedia } from '../../utils/cdn';
import { getMediaKey, processMediaUrl } from '../../utils/media';
import { logger } from '../../utils/logger';
import { optimizeVideoForConnection } from '../../utils/adaptiveStreaming';

interface DirectVideoPlayerProps {
  nft: NFT;
  onLoadComplete?: () => void;
  onError?: (error: Error) => void;
}

// Create a dedicated logger for video player
const videoLogger = logger.getModuleLogger('videoPlayer');

// Define the component with explicit return type to fix TypeScript error
export const DirectVideoPlayer: React.FC<DirectVideoPlayerProps> = ({ 
  nft, 
  onLoadComplete,
  onError 
}): React.ReactElement => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [hasError, setHasError] = useState(false);
  const [currentGateway, setCurrentGateway] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2; // Maximum number of times to cycle through all gateways
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  
  // Get the mediaKey for consistent tracking
  const mediaKey = getMediaKey(nft);
  
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
  
  // We'll use processVideoUrl function to get the URL when needed
  // This ensures we always get the most up-to-date URL based on current gateway
  
  // Log that we're initializing the video player
  videoLogger.info('Initializing video player for NFT:', { 
    nft: nft.name || 'Unknown NFT',
    mediaKey
  });
  
  // Preload the media (safe even with CDN disabled)
  useEffect(() => {
    preloadNftMedia(nft);
  }, [nft]);
  
  // Handle URL processing for different protocols
  const processVideoUrl = (): string => {
    if (typeof directUrl === 'string') {
      if (directUrl.startsWith('ipfs://')) {
        // Choose the best gateway for each platform, but also respect fallback state
        const gateway = IPFS_GATEWAYS[currentGateway];
        return directUrl.replace('ipfs://', gateway);
      } else if (directUrl.startsWith('ar://')) {
        return directUrl.replace('ar://', 'https://arweave.net/');
      } else if (directUrl.includes('nftstorage.link')) {
        // Use URL parsing to properly check the hostname
        try {
          const url = new URL(directUrl);
          if (url.hostname === 'nftstorage.link') {
            // NFT.Storage URLs - already direct URLs
            return directUrl;
          }
        } catch (e) {
          videoLogger.warn('URL parsing failed for nftstorage.link check', { directUrl });
        }
      } else if (directUrl.startsWith('http')) {
        try {
          // Properly parse the URL to check hostname
          const url = new URL(directUrl);
          if (url.hostname === 'ipfs.infura.io' || url.hostname.endsWith('.ipfs.infura.io')) {
            // Handle Infura IPFS URLs
            const parts = directUrl.split('/ipfs/');
            if (parts.length > 1) {
              const cid = parts[1];
              const gateway = IPFS_GATEWAYS[currentGateway];
              return `${gateway}${cid}`;
            }
          }
          
          const knownGateways = [
            'cloudflare-ipfs.com',
            'ipfs.dweb.link',
            'gateway.pinata.cloud',
            'ipfs.io',
            'dweb.link',
            'ipfs.4everland.io',
            'gateway.ipfs.io'
          ];
          
          // Check if hostname is a known IPFS gateway
          const isKnownGateway = knownGateways.some(gateway => 
            url.hostname === gateway || url.hostname.endsWith(`.${gateway}`)
          );
          
          if (isKnownGateway && hasError) {
            // If already using a gateway but it failed, try the next one
            const cid = extractIPFSCID(directUrl);
            if (cid) {
              const gateway = IPFS_GATEWAYS[currentGateway];
              return `${gateway}${cid}`;
            }
          }
        } catch (e) {
          // If URL parsing fails, continue with other checks
          videoLogger.warn('URL parsing failed for gateway check', { directUrl });
        }
      }
    }
    
    // For all other cases, return the original URL or processed URL
    return processMediaUrl(directUrl, '', 'audio');
  }
  
  // Extract IPFS CID from various gateway URLs
  function extractIPFSCID(urlString: string): string | null {
    if (typeof urlString !== 'string') return null;
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
      const match = urlString.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }
  
  // Check if this is a hosted video player URL rather than a direct video file
  // SECURITY: Properly parse URL to prevent URL substring bypass attacks
  const isHostedPlayer = typeof directUrl === 'string' && (() => {
    try {
      // Safely parse the URL
      const parsedUrl = new URL(directUrl);
      
      // Define allowed hosted player domains
      const allowedHostedPlayerDomains = [
        // Video platforms
        { domain: 'player.vimeo.com', exact: true },
        { domain: 'youtube.com', path: '/embed' },
        
        // NFT/Web3 platforms
        { domain: 'opensea.io', path: '/assets' },
        { domain: 'sound.xyz', path: '/embed' },
        { domain: 'zora.co', path: '/collect' },
        { domain: 'embed.zora.co', exact: true },
        { domain: 'foundation.app', path: '/embed' },
        { domain: 'audius.co', path: '/embed' },
        { domain: 'catalog.works', path: '/embed' },
        { domain: 'nina.market', path: '/embed' },
        { domain: 'glass.xyz', path: '/embed' },
        { domain: 'app.manifold.xyz', path: '/embed' },
        { domain: 'embed.manifold.xyz', exact: true }
      ];
      
      // Check if the hostname and path match our allowed hosted player domains
      return allowedHostedPlayerDomains.some(({ domain, exact, path }) => {
        const isHostMatch = exact 
          ? parsedUrl.hostname === domain
          : parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`);
          
        const isPathMatch = !path || parsedUrl.pathname.startsWith(path);
        
        return isHostMatch && isPathMatch;
      });
    } catch (error) {
      // If URL parsing fails, log error and return false
      videoLogger.warn('Invalid video URL:', directUrl);
      return false;
    }
  })();
  
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
    
    // Get the processed URL based on current gateway
    const processedUrl = processVideoUrl();
    
    // Set video URL after processing
    video.src = processedUrl;
    
    // Log the URL being used for debugging
    videoLogger.info('Setting video source:', {
      nft: nft.name || 'Unknown NFT',
      mediaKey,
      url: processedUrl,
      retryCount,
      gateway: currentGateway
    });
    
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
    
    const handleCanPlay = (): void => {
      setHasError(false); // Reset error state on successful load
      if (onLoadComplete) onLoadComplete();
    };
    
    const handleError = (e: Event): void => {
      // Only log the first error for each video
      if (!hasError) {
        console.error('Video playback error:', e);
      }
      
      // Try the next gateway if this is an IPFS URL
      if (typeof directUrl === 'string' && (
          directUrl.includes('ipfs://') || 
          directUrl.includes('ipfs.') || 
          directUrl.includes('/ipfs/'))) {
        
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
      if (!hasError && typeof directUrl === 'string') {
        setHasError(true);
        if (onError) onError(new Error('Video failed to load'));
      }
    };
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    // Apply adaptive streaming optimizations based on connection quality
    optimizeVideoForConnection(video, mediaKey, isMobile);
    
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
  }, [isHostedPlayer, onLoadComplete, onError, directUrl, isMobile, isIOS, isAndroid, hasError, currentGateway, retryCount, mediaKey, nft, MAX_RETRIES]);
  
  // Render an iframe for hosted players, or video for direct media
  if (isHostedPlayer) {
    // Get the processed URL for the iframe
    const iframeUrl = processVideoUrl();
    
    return (
      <iframe
        ref={iframeRef}
        src={iframeUrl}
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
        src={nft.image || nft.metadata?.image || '/default-nft.png'}
        alt={nft.name || 'NFT'}
        className={`w-full h-full object-cover ${shouldLoadVideo ? 'opacity-0' : 'opacity-100'}`}
        style={{
          position: shouldLoadVideo ? 'absolute' : 'relative',
          transition: 'opacity 0.3s ease-in-out'
        }}
      />
      
      {/* Video - only loaded when needed */}
      {shouldLoadVideo && !hasError && (
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