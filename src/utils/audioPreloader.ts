import { getMediaKey, extractIPFSHash, IPFS_GATEWAYS } from './media';
import type { NFT } from '../types/user';

interface AudioMetadata {
  duration: number;
  lastPlayed: number;
  url: string;
  gateway?: string;
}

interface GatewayTest {
  url: string;
  speed: number;
  valid: boolean;
}

// Cache audio metadata using mediaKey as the identifier
export const cacheAudioMetadata = async (nft: NFT, audioElement: HTMLAudioElement | null) => {
  if (!audioElement || !nft) return;
  
  const mediaKey = getMediaKey(nft);
  try {
    const metadata: AudioMetadata = {
      duration: audioElement.duration,
      lastPlayed: Date.now(),
      url: nft.audio || nft.metadata?.animation_url || ''
    };
    
    localStorage.setItem(`audio-cache-${mediaKey}`, JSON.stringify(metadata));
  } catch (error) {
    console.warn('Failed to cache audio metadata:', error);
  }
};

// Get cached metadata for an NFT
export const getCachedAudioMetadata = (nft: NFT): AudioMetadata | null => {
  if (!nft) return null;
  
  try {
    const mediaKey = getMediaKey(nft);
    const cached = localStorage.getItem(`audio-cache-${mediaKey}`);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Failed to get cached audio metadata:', error);
    return null;
  }
};

// Test gateway speeds and cache results
export const testGatewaySpeeds = async (urls: string[]): Promise<GatewayTest[]> => {
  const tests = urls.map(async (url) => {
    const start = performance.now();
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const end = performance.now();
      return { url, speed: end - start, valid: response.ok };
    } catch {
      return { url, speed: Infinity, valid: false };
    }
  });

  return Promise.all(tests);
};

// Get the fastest gateway for a given NFT
export const getFastestGateway = async (nft: NFT): Promise<string | null> => {
  const mediaKey = getMediaKey(nft);
  const url = nft.audio || nft.metadata?.animation_url;
  if (!url) return null;

  try {
    // Check cached gateway first
    const gatewayCacheStr = localStorage.getItem('gateway-speeds');
    const gatewayCache = gatewayCacheStr ? JSON.parse(gatewayCacheStr) : {};
    if (gatewayCache[mediaKey]) {
      return gatewayCache[mediaKey];
    }

    // If no cached gateway, test speeds
    const ipfsHash = extractIPFSHash(url);
    const urlsToTry = ipfsHash 
      ? IPFS_GATEWAYS.map((gateway: string) => `${gateway}${ipfsHash}`)
      : [url];

    const results = await testGatewaySpeeds(urlsToTry);
    const fastestGateway = results
      .filter(r => r.valid)
      .sort((a, b) => a.speed - b.speed)[0];

    if (fastestGateway) {
      // Cache the result
      gatewayCache[mediaKey] = fastestGateway.url;
      localStorage.setItem('gateway-speeds', JSON.stringify(gatewayCache));
      return fastestGateway.url;
    }
  } catch (error) {
    console.warn('Error finding fastest gateway:', error);
  }
  
  return null;
};

// Interface for Mux asset response
interface MuxAssetResponse {
  playbackId: string;
  status: string;
  assetId?: string;
}

// Cache for Mux assets to prevent duplicate creation
const muxAssetCache: { [key: string]: MuxAssetResponse } = {};

// Maximum retries for Mux asset creation
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Helper to delay execution
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Create Mux asset with retries and caching
const createMuxAsset = async (url: string, nftName: string, mediaKey: string, retryCount = 0): Promise<MuxAssetResponse> => {
  // Check cache first
  if (muxAssetCache[mediaKey]) {
    console.log(`Using cached Mux asset for ${nftName}:`, muxAssetCache[mediaKey]);
    return muxAssetCache[mediaKey];
  }
  try {
    console.log(`Attempt ${retryCount + 1}/${MAX_RETRIES}: Creating Mux asset for ${nftName}`);
    const response = await fetch('/api/mux/create-asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mediaKey })
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.details?.message || errorData.error || 'Unknown error';
      throw new Error(`Server error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    // Cache the successful result
    muxAssetCache[mediaKey] = {
      playbackId: data.playbackId,
      status: data.status
    };
    return muxAssetCache[mediaKey];
  } catch (error) {
    console.error(`Error creating Mux asset for ${nftName}:`, error);
    
    if (retryCount < MAX_RETRIES - 1) {
      console.log(`Retrying in ${RETRY_DELAY}ms...`);
      await delay(RETRY_DELAY);
      return createMuxAsset(url, nftName, mediaKey, retryCount + 1);
    }
    throw error;
  }
};

// Get Mux asset for NFT
export const getMuxAsset = (nft: NFT): MuxAssetResponse | null => {
  const mediaKey = getMediaKey(nft);
  return muxAssetCache[mediaKey] || null;
};

import { mediaLoadManager } from './mediaLoadManager';

// Preload audio and create Mux assets
export const preloadAudio = async (nft: NFT, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<void> => {
  if (!nft) return;
  
  // Get MediaKey for consistent identification
  const mediaKey = getMediaKey(nft);
  if (!mediaKey) return;
  
  try {
    // Check if we should preload based on device type and network
    const isMobile = typeof window !== 'undefined' && 
                    (navigator.userAgent.match(/Android/i) ||
                     navigator.userAgent.match(/iPhone/i) ||
                     navigator.userAgent.match(/iPad/i));
    
    // Check connection type for mobile optimization
    // @ts-ignore - Some browsers may not support navigator.connection
    const connectionType = typeof navigator !== 'undefined' && navigator.connection?.type;
    // @ts-ignore
    const effectiveType = typeof navigator !== 'undefined' && navigator.connection?.effectiveType;
    // @ts-ignore
    const saveData = typeof navigator !== 'undefined' && navigator.connection?.saveData;
    
    // For mobile on limited connections, reduce preloading
    if (isMobile) {
      // Helper function to check if priority is low without type errors
      const isPriorityLow = priority === 'low';
      
      // On very slow connections or with data saver enabled, 
      // only preload high priority items
      if (
        saveData || 
        effectiveType === 'slow-2g' || 
        effectiveType === '2g' ||
        isPriorityLow
      ) {
        console.log(`[Mobile] Skipping preload for ${mediaKey} due to limited connection`);
        return;
      }
      
      // On 3G, only preload high and medium priority
      if (effectiveType === '3g' && isPriorityLow) {
        console.log(`[Mobile] Skipping low priority preload for ${mediaKey} on 3G`);
        return;
      }
    }
    
    // Get cached metadata if available
    const cached = getCachedAudioMetadata(nft);
    
    // If this is mobile, consider the cached version sufficient
    // to prevent unnecessary network usage
    if (cached && isMobile) {
      console.log(`[Mobile] Using cached audio metadata for ${mediaKey}`);
      return;
    }
    
    // Use mediaLoadManager to preload the audio
    mediaLoadManager.preloadMedia(nft, priority);
  } catch (error) {
    console.error(`Error in preloadAudio for ${mediaKey}:`, error);
  }
};
