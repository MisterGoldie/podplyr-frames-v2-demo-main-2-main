import { useState } from 'react';
import { NFT } from '../types/user';
import { getCdnUrl, CDN_CONFIG } from './cdn';

// List of reliable IPFS gateways in order of preference
// Helper function to clean IPFS URLs
export const getCleanIPFSUrl = (url: string): string => {
  if (!url) return url;
  if (typeof url !== 'string') return '';
  // Remove any duplicate 'ipfs' in the path
  return url.replace(/\/ipfs\/ipfs\//g, '/ipfs/');
};

export const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',         // Primary gateway
  'https://nftstorage.link/ipfs/', // Secondary
  'https://cloudflare-ipfs.com/ipfs/', // Tertiary
  'https://gateway.pinata.cloud/ipfs/' // Final fallback
];

// Helper function to extract CID from various IPFS URL formats
export const extractIPFSHash = (url: string): string | null => {
  if (!url) return null;
  if (typeof url !== 'string') return null;

  // Remove any duplicate 'ipfs' in the path
  url = url.replace(/\/ipfs\/ipfs\//, '/ipfs/');

  // Handle ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', '');
  }

  // Match IPFS hash patterns - support both v0 and v1 CIDs
  const ipfsMatch = url.match(/(?:ipfs\/|\/ipfs\/|ipfs:)([a-zA-Z0-9]{46,}|Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{55})/i);
  if (ipfsMatch) {
    return ipfsMatch[1];
  }

  // Handle nftstorage.link URLs
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'nftstorage.link' && parsedUrl.pathname.includes('/ipfs/')) {
      // Keep using the nftstorage.link gateway for these URLs
      return url;
    }
  } catch (e) {
    // If URL parsing fails, continue with other checks
  }

  // Handle direct CID - support both v0 and v1 CIDs
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{55}|[a-zA-Z0-9]{46})$/.test(url)) {
    return url;
  }

  return null;
};

// Check if an NFT is using the same URL for both image and audio
export const isAudioUrlUsedAsImage = (nft: NFT, imageUrl: string): boolean => {
  if (!imageUrl) return false;
  
  // Get all possible audio URLs
  const audioUrls = [
    nft?.audio,
    nft?.metadata?.audio,
    nft?.metadata?.animation_url
  ].filter(Boolean);
  
  // Return true if imageUrl matches any audio URL
  return audioUrls.includes(imageUrl);
};

// Function to process Arweave URLs into valid HTTP URLs
export const processArweaveUrl = (url: string): string => {
  if (!url) return url;
  if (typeof url !== 'string') return '';
  
  try {
    // If it's already an https://arweave.net URL, return it as is
    if (url.startsWith('https://arweave.net/')) {
      return url;
    }
    
    // Simple ar:// format
    if (url.startsWith('ar://') && !url.includes('/')) {
      return url.replace('ar://', 'https://arweave.net/');
    }
    
    // Complex ar:// format with path segments
    if (url.startsWith('ar://')) {
      // Extract the path after ar://
      const parts = url.split('ar://');
      if (parts.length > 1) {
        const arPath = parts[1];
        if (arPath) {
          // For complex paths with multiple segments, use the last segment as the transaction ID
          const segments = arPath.split('/');
          
          // If there's only one segment, use it directly
          if (segments.length === 1) {
            const cleanId = segments[0].split('?')[0].split('#')[0].split('.')[0];
            return `https://arweave.net/${cleanId}`;
          }
          
          // For the specific format ar://0xcuaDtgYmzvypeji38byrjvgdWpylfJYQd4pjd5GAk/FawYfxmBQBEMWj-0iB-ttUlJgXS3JmYSGxU0WQGrSvU.png
          // We want to extract just the transaction ID (the last part)
          const transactionId = segments[segments.length - 1];
          
          // Remove any query parameters, hash fragments, or file extensions
          // But keep the extension for image files
          const cleanId = transactionId.split('?')[0].split('#')[0];
          // Check if it's an image or other media file with extension
          if (/\.(jpg|jpeg|png|gif|webp|mp4|mp3|wav)$/i.test(cleanId)) {
            // For media files, keep the extension
            return `https://arweave.net/${cleanId}`;
          } else {
            // For other files, strip the extension
            const baseId = cleanId.split('.')[0];
            return `https://arweave.net/${baseId}`;
          }
        }
      }
    }
    
    // If we couldn't process it as an Arweave URL, return the original
    return url;
  } catch (error) {
    // If there was an error processing the URL, return the original
    console.error('Error processing Arweave URL:', error);
    return url;
  }
};

// Function to process media URLs to ensure they're properly formatted
export const processMediaUrl = (url: string, fallbackUrl: string = '/default-nft.png', mediaType: 'image' | 'audio' | 'metadata' = 'image'): string => {
  if (!url) return fallbackUrl;

  // First, try to use our CDN if enabled
  if (CDN_CONFIG.baseUrl) {
    // Don't double-process URLs that are already using our CDN
    if (url.includes(CDN_CONFIG.baseUrl)) {
      return url;
    }
    
    // Use CDN for HTTP(S) URLs that aren't already using a CDN
    if ((url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        
        // Check if URL is not already using a CDN based on hostname
        if (hostname !== 'cloudflare-ipfs.com' && 
            !hostname.startsWith('cdn.') && 
            !hostname.includes('.cdn.')) {
          return getCdnUrl(url, mediaType);
        }
      } catch (error) {
        console.error('Failed to parse URL:', url, error);
      }
    }
  }

  // Remove any duplicate 'ipfs' in the path
  url = url.replace(/\/ipfs\/ipfs\//, '/ipfs/');

  // Check for supported media types that might need special handling
  const fileExt = url.split('.').pop()?.toLowerCase();
  
  // Handle IPFS URLs
  if (url.startsWith('ipfs://')) {
    // Remove ipfs:// prefix and any trailing slashes
    const hash = url.replace('ipfs://', '').replace(/\/*$/, '');
    
    // Process through our CDN if available
    if (CDN_CONFIG.baseUrl) {
      const ipfsUrl = `${IPFS_GATEWAYS[0]}${hash}`;
      return getCdnUrl(ipfsUrl, mediaType);
    }
    
    // For mobile devices, prioritize more reliable gateways
    // Use cloudflare gateway for better global CDN coverage
    const isMobile = typeof window !== 'undefined' && 
                    (navigator.userAgent.match(/Android/i) ||
                     navigator.userAgent.match(/iPhone/i) ||
                     navigator.userAgent.match(/iPad/i));
    
    if (isMobile) {
      return `https://cloudflare-ipfs.com/ipfs/${hash}`;
    }
    
    return `${IPFS_GATEWAYS[0]}${hash}`;
  }

  // Try to extract IPFS hash from other formats
  const ipfsHash = extractIPFSHash(url);
  if (ipfsHash) {
    // Remove any trailing slashes from the hash
    const cleanHash = ipfsHash.replace(/\/*$/, '');
    
    // Process through our CDN if available
    if (CDN_CONFIG.baseUrl) {
      const ipfsUrl = `${IPFS_GATEWAYS[0]}${cleanHash}`;
      return getCdnUrl(ipfsUrl, mediaType);
    }
    
    // For mobile devices, prioritize more reliable gateways
    const isMobile = typeof window !== 'undefined' && 
                    (navigator.userAgent.match(/Android/i) ||
                     navigator.userAgent.match(/iPhone/i) ||
                     navigator.userAgent.match(/iPad/i));
    
    if (isMobile) {
      return `https://cloudflare-ipfs.com/ipfs/${cleanHash}`;
    }
    
    return `${IPFS_GATEWAYS[0]}${cleanHash}`;
  }

  // Handle Arweave URLs using the dedicated function
  if (url.includes('ar://')) {
    const arweaveUrl = processArweaveUrl(url);
    // Process through our CDN if available
    if (CDN_CONFIG.baseUrl) {
      return getCdnUrl(arweaveUrl, mediaType);
    }
    return arweaveUrl;
  }

  // For any other URLs, try to use CDN if available
  if (CDN_CONFIG.baseUrl && (url.startsWith('http://') || url.startsWith('https://'))) {
    return getCdnUrl(url, mediaType);
  }

  return url || fallbackUrl;
};

// Export the list of gateways so components can try alternatives if needed
export const getAlternativeIPFSUrl = (url: string): string | null => {
  const ipfsHash = extractIPFSHash(url);
  if (!ipfsHash) return null;

  // Find current gateway index
  const currentGatewayIndex = IPFS_GATEWAYS.findIndex(gateway => url.includes(gateway));
  
  // If we're not using any known gateway or we're at the last one, return null
  if (currentGatewayIndex === -1 || currentGatewayIndex === IPFS_GATEWAYS.length - 1) {
    return null;
  }

  // Return URL with next gateway
  return `${IPFS_GATEWAYS[currentGatewayIndex + 1]}${ipfsHash}`;
};

// Function to check if a URL is a video file
export const isVideoUrl = (url: string): boolean => {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
  return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

// Function to check if a URL is an audio file
export const isAudioUrl = (url: string): boolean => {
  if (!url) return false;
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];
  return audioExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

// Function to format time in MM:SS format
export const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Create a safe document ID from a URL by removing invalid characters
const createSafeId = (url: string): string => {
  if (!url) return '';
  
  // Try to extract IPFS hash first
  const ipfsHash = extractIPFSHash(url);
  if (ipfsHash) {
    return `ipfs_${ipfsHash}`;
  }

  // For non-IPFS URLs, create a safe ID by removing all special characters and slashes
  return url
    .replace(/^https?:\/\//, '') // Remove protocol
    .replace(/\/ipfs\//g, '_') // Replace /ipfs/ with underscore
    .replace(/\/+/g, '_') // Replace all slashes with underscore
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace ALL special chars with underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .toLowerCase() // Convert to lowercase for consistency
    .slice(0, 100); // Limit length
};

/**
 * In-memory cache to avoid redundant mediaKey calculations
 * Maps NFT contract+tokenId to its calculated mediaKey
 */
const mediaKeyCache: Record<string, string> = {};

/**
 * Secondary cache that maps content URLs to mediaKeys
 * This helps identify identical content across different NFTs
 */
const contentUrlToMediaKeyCache: Record<string, string> = {};

/**
 * Debug mode toggle for mediaKey generation
 * Set to false in production for better performance
 */
const DEBUG_MEDIA_KEYS = false;

/**
 * Maximum cache size to prevent memory leaks
 */
const MAX_CACHE_SIZE = 1000;

// Track if playback is active to reduce logging
let _isPlaybackActive = false;

/**
 * Check if playback is currently active
 * Used to reduce logging during playback
 */
export const isPlaybackActive = (): boolean => _isPlaybackActive;

/**
 * Set the playback active state
 * @param active Whether playback is active
 */
export const setPlaybackActive = (active: boolean): void => {
  _isPlaybackActive = active;
};

/**
 * Normalize a URL to ensure consistent matching
 * Removes protocol, query params, and normalizes IPFS/Arweave URLs
 * @param url The URL to normalize
 * @returns Normalized URL string
 */
export const normalizeUrl = (url: string): string => {
  if (!url) return '';
  
  try {
    // Handle IPFS URLs
    if (url.startsWith('ipfs://')) {
      const cid = url.replace('ipfs://', '');
      return `ipfs-${cid}`;
    }
    
    // Handle Arweave URLs
    if (url.startsWith('ar://')) {
      const txId = url.replace('ar://', '');
      return `arweave-${txId}`;
    }
    
    // For HTTP URLs, remove protocol and query params
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const urlObj = new URL(url);
        return `${urlObj.hostname}${urlObj.pathname}`;
      } catch (e) {
        // If URL parsing fails, return the original
        return url;
      }
    }
    
    return url;
  } catch (e) {
    // If any error occurs, return the original URL
    return url;
  }
};

/**
 * Generates a consistent mediaKey for NFTs with identical content.
 * 
 * IMPORTANT: This function intentionally returns the same key for NFTs that share identical content
 * (same audio/image/animation URLs). This is a core part of PODPLAYR's content-first architecture:
 * 
 * - Same content = same mediaKey = shared play count and like status
 * - Different NFT instances with same content are treated as the same media
 * - This will cause React "duplicate key" warnings which can be safely ignored
 * - The warnings indicate the system is correctly identifying duplicate content
 * 
 * DO NOT modify this to generate unique keys - duplicate keys are intentional!
 * 
 * PERFORMANCE: This function is optimized with caching to avoid redundant calculations.
 */
export const getMediaKey = (nft: NFT): string => {
  if (!nft) return '';
  
  // Generate a cache key for this specific NFT instance
  const cacheKey = `${nft.contract}_${nft.tokenId}`;
  
  // Check if we already have the mediaKey cached
  if (mediaKeyCache[cacheKey]) {
    return mediaKeyCache[cacheKey];
  }

  // Check if the NFT already has a mediaKey property (from migration)
  if (nft.mediaKey) {
    // Cache the result for future calls
    mediaKeyCache[cacheKey] = nft.mediaKey;
    return nft.mediaKey;
  }
  
  // Get media URLs that uniquely identify the content
  // Normalize URLs to ensure consistent matching
  const videoUrl = normalizeUrl(nft.metadata?.animation_url || '');
  const imageUrl = normalizeUrl(nft.image || nft.metadata?.image || '');
  const audioUrl = normalizeUrl(nft.audio || '');
  
  // Create a content signature based on the URLs - this is the CORE of our content-first architecture
  // NFTs with identical content (same audio/image/animation) MUST have the same mediaKey
  const contentSignature = [videoUrl, imageUrl, audioUrl].filter(Boolean).sort().join('|');
  
  // Check if we've already calculated a mediaKey for this content
  if (contentUrlToMediaKeyCache[contentSignature]) {
    const cachedMediaKey = contentUrlToMediaKeyCache[contentSignature];
    mediaKeyCache[cacheKey] = cachedMediaKey;
    return cachedMediaKey;
  }

  // Create safe IDs for each URL - using the normalized URLs
  // This is a critical step to ensure identical content gets the same mediaKey
  const safeUrls = Array.from(new Set([
    videoUrl,
    imageUrl,
    audioUrl
  ]))
    .filter(Boolean) // Remove empty strings
    .map(createSafeId)
    .filter(Boolean) // Remove any empty strings after processing
    .sort(); // Sort for consistency to ensure same content = same key regardless of URL order

  if (safeUrls.length === 0) {
    // Last resort fallback
    return `unknown_nft_${Date.now()}`;
  }

  // Join with a delimiter and ensure it's Firestore-safe
  const urlBasedKey = safeUrls.join('_')
    .toLowerCase() // Ensure consistent case
    .replace(/[^a-z0-9_]/g, '_') // Final safety check for Firestore-safe chars
    .replace(/_+/g, '_') // Clean up any remaining multiple underscores
    .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
  
  // Create a unique identifier for this specific NFT
  const contractTokenId = `${nft.contract}_${nft.tokenId}`.toLowerCase();
  
  // Create a unique hash for the content URLs to identify variants
  const contentHash = createSafeId(safeUrls.join('|'));
  const variantKey = `${contractTokenId}_variant_${contentHash.slice(0, 8)}`;
  
  try {
    // CRITICAL OPTIMIZATION: For content-first architecture, we prioritize the urlBasedKey
    // This ensures identical content gets the same mediaKey regardless of contract/tokenId
    
    // Cache the urlBasedKey for this content signature
    contentUrlToMediaKeyCache[contentSignature] = urlBasedKey;
    
    // Cache the result for future calls with this specific NFT
    mediaKeyCache[cacheKey] = urlBasedKey;
    
    // We're now using a simplified approach that focuses on content identity
    // rather than tracking variants, which aligns with our core architectural decision
    
    // Only log in debug mode to reduce noise during playback
    if (DEBUG_MEDIA_KEYS && !isPlaybackActive()) {
      console.log('🔑 Using content-based mediaKey:', urlBasedKey.slice(0, 16));
    }
    
    return urlBasedKey;
  } catch (e) {
    // If any error occurs, fall back to the urlBasedKey which is our content-first approach
    mediaKeyCache[cacheKey] = urlBasedKey;
    contentUrlToMediaKeyCache[contentSignature] = urlBasedKey;
    
    if (DEBUG_MEDIA_KEYS && !isPlaybackActive()) {
      console.log('🔑 Error occurred, using content-based mediaKey:', urlBasedKey.slice(0, 16));
    }
    return urlBasedKey;
  }
};

export function getDirectMediaUrl(url: string): string {
  if (!url) return '';
  
  // Handle IPFS URLs - try multiple gateways for better performance
  if (url.includes('ipfs://')) {
    const ipfsHash = url.replace('ipfs://', '');
    
    // For video content, use a CDN-backed gateway
    return `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`;
    
    // Fallbacks if needed:
    // return `https://ipfs.io/ipfs/${ipfsHash}`;
    // return `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
  }
  
  // Handle Arweave URLs using our dedicated function
  if (url.includes('ar://')) {
    return processArweaveUrl(url);
  }
  
  // Return the URL directly without any processing
  return url;
}