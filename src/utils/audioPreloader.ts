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

// Cache to prevent duplicate network info logs
const networkLogCache = new Set<string>();

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

// Preload audio and create Mux assets
export const preloadAudio = async (nft: NFT, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<void> => {
  if (!nft) return;
  
  // Get MediaKey for consistent identification
  const mediaKey = getMediaKey(nft);
  if (!mediaKey) return;
  
  try {
    // IMPORTANT: This function now uses direct preloading without mediaLoadManager
    // to avoid circular dependency issues. DO NOT add references to mediaLoadManager here.
    
    // Enhanced mobile and network detection
    const isMobile = typeof window !== 'undefined' && 
                    (navigator.userAgent.match(/Android/i) ||
                     navigator.userAgent.match(/iPhone/i) ||
                     navigator.userAgent.match(/iPad/i));
    
    // Get comprehensive network information 
    const connection = typeof navigator !== 'undefined' && 'connection' in navigator ? 
                      (navigator as any).connection : null;
    
    const networkInfo = {
      type: connection?.type || 'unknown',
      effectiveType: connection?.effectiveType || 'unknown',
      saveData: connection?.saveData || false,
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      isCellular: connection?.type === 'cellular' || 
                 (connection?.effectiveType && 
                  ['slow-2g', '2g', '3g'].includes(connection.effectiveType))
    };
    
    // Enhanced logging of network conditions for debugging
    if (process.env.NODE_ENV !== 'production') {
      // Only log once per NFT name
      const cacheKey = `network-info-${nft.name}`;
      if (!networkLogCache.has(cacheKey)) {
        console.log(`[AudioPreloader] Network info for ${nft.name}:`, networkInfo);
        networkLogCache.add(cacheKey);
      }
    }
    
    // Enhanced decision logic for preloading on cellular connections
    if (isMobile) {
      // Helper function to check if priority is low without type errors
      const isPriorityLow = priority === 'low';
      
      // Don't preload at all in these critical scenarios to save user data
      if (networkInfo.saveData || 
          (networkInfo.effectiveType === 'slow-2g' && isPriorityLow)) {
        console.log(`[AudioPreloader] Skipping preload for ${nft.name} - data saving mode or extremely slow connection`);
        return;
      }
      
      // On very slow connections, only preload high priority items
      if (
        networkInfo.saveData || 
        networkInfo.effectiveType === 'slow-2g' || 
        networkInfo.effectiveType === '2g' ||
        isPriorityLow
      ) {
        console.log(`[Mobile] Skipping preload for ${mediaKey} due to limited connection`);
        return;
      }
      
      // On 3G, only preload high and medium priority
      if (networkInfo.effectiveType === '3g' && isPriorityLow) {
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
    
    // Simple direct preloading without mediaLoadManager
    const audioUrl = nft.audio || nft.metadata?.animation_url;
    if (audioUrl) {
      // Simple preloading with a timeout to avoid hanging
      const preloadPromise = new Promise<void>((resolve) => {
        try {
          const audio = new Audio();
          
          // Set up event handlers
          const onLoaded = () => {
            audio.oncanplaythrough = null;
            audio.onerror = null;
            resolve();
          };
          
          audio.oncanplaythrough = onLoaded;
          audio.onerror = () => {
            console.warn(`Failed to preload audio: ${audioUrl}`);
            onLoaded(); // Resolve anyway to prevent hanging
          };
          
          // Set timeout to avoid hanging
          setTimeout(() => {
            audio.oncanplaythrough = null;
            audio.onerror = null;
            resolve();
          }, 10000);
          
          // Start loading
          audio.src = audioUrl;
          audio.load();
          
          // If it's already loaded, resolve immediately
          if (audio.readyState >= 3) {
            onLoaded();
          }
        } catch (err) {
          console.warn(`Error setting up audio preload: ${err}`);
          resolve(); // Resolve anyway to prevent hanging
        }
      });
      
      // Wait with timeout
      await Promise.race([
        preloadPromise,
        new Promise(resolve => setTimeout(resolve, 15000))
      ]);
    }
    
    // Preload image if it exists
    if (nft.image) {
      const imgPreloadPromise = new Promise<void>((resolve) => {
        try {
          const img = new Image();
          
          img.onload = () => {
            img.onload = null;
            img.onerror = null;
            resolve();
          };
          
          img.onerror = () => {
            console.warn(`Failed to preload image: ${nft.image}`);
            img.onload = null;
            img.onerror = null;
            resolve(); // Resolve anyway to prevent hanging
          };
          
          // Set timeout
          setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            resolve();
          }, 10000);
          
          // Start loading
          img.src = nft.image;
          
          // If already complete, resolve immediately
          if (img.complete) {
            img.onload = null;
            img.onerror = null;
            resolve();
          }
        } catch (err) {
          console.warn(`Error setting up image preload: ${err}`);
          resolve(); // Resolve anyway to prevent hanging
        }
      });
      
      // Wait with timeout
      await Promise.race([
        imgPreloadPromise,
        new Promise(resolve => setTimeout(resolve, 15000))
      ]);
    }
    
  } catch (error) {
    console.warn(`Error in preloadAudio for ${mediaKey}:`, error);
    // Don't rethrow - just log and continue
  }
};
