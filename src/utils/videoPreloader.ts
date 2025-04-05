import { NFT } from '../types/user';
import { isCellularConnection } from './cellularOptimizer';
import { logger } from './logger';

// LRU Cache for video chunks
class VideoCache {
  private cache: Map<string, ArrayBuffer>;
  private maxSize: number;
  private currentSize: number;
  
  constructor(maxSizeMB: number = 50) {
    this.cache = new Map();
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
    this.currentSize = 0;
  }
  
  async getChunk(url: string, start: number, end: number): Promise<ArrayBuffer | null> {
    const key = `${url}:${start}-${end}`;
    if (this.cache.has(key)) {
      // Move to end of LRU (most recently used)
      const chunk = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, chunk);
      return chunk;
    }
    return null;
  }
  
  setChunk(url: string, start: number, end: number, chunk: ArrayBuffer): void {
    const key = `${url}:${start}-${end}`;
    const chunkSize = chunk.byteLength;
    
    // Check if adding this would exceed cache size
    if (this.currentSize + chunkSize > this.maxSize) {
      // Remove oldest entries until we have space
      const entries = Array.from(this.cache.entries());
      let i = 0;
      
      while (this.currentSize + chunkSize > this.maxSize && i < entries.length) {
        const [oldKey, oldChunk] = entries[i];
        this.cache.delete(oldKey);
        this.currentSize -= oldChunk.byteLength;
        i++;
      }
    }
    
    // Add new chunk
    this.cache.set(key, chunk);
    this.currentSize += chunkSize;
  }
  
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }
}

// Singleton cache instance
const videoCache = new VideoCache();

// Function to preload video metadata
export const preloadVideoMetadata = async (nft: NFT): Promise<void> => {
  if (!nft.metadata?.animation_url) return;
  
  try {
    const { isCellular } = isCellularConnection();
    
    // For cellular connections, just load headers to get content length
    if (isCellular) {
      const response = await fetch(nft.metadata.animation_url, { 
        method: 'HEAD',
        headers: {
          'Range': 'bytes=0-0' // Just request the first byte to get headers
        }
      });
      
      console.log(`Preloaded metadata for ${nft.name}, size: ${response.headers.get('content-length')} bytes`);
    } else {
      // For WiFi, we can be more aggressive with preloading
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = nft.metadata.animation_url;
      
      // Remove after loading metadata
      video.onloadedmetadata = () => {
        console.log(`Preloaded metadata for ${nft.name}, duration: ${video.duration}s`);
        video.src = '';
      };
      
      // Handle errors
      video.onerror = () => {
        console.error(`Failed to preload metadata for ${nft.name}`);
        video.src = '';
      };
    }
  } catch (error) {
    console.error(`Error preloading video metadata for ${nft.name}:`, error);
  }
};

// Function to preload initial video chunk
export const preloadVideoInitialChunk = async (nft: NFT): Promise<void> => {
  if (!nft.metadata?.animation_url) return;
  
  try {
    const { isCellular, generation } = isCellularConnection();
    
    // Determine chunk size based on network
    const chunkSize = isCellular 
      ? (generation === '5G' ? 500000 : // 500KB for 5G
         generation === '4G' ? 200000 : // 200KB for 4G
         100000) // 100KB for 3G/2G
      : 1000000; // 1MB for WiFi
    
    // Fetch just the initial chunk
    const response = await fetch(nft.metadata.animation_url, {
      headers: {
        'Range': `bytes=0-${chunkSize - 1}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to preload chunk: ${response.status}`);
    }
    
    // Store in cache
    const chunk = await response.arrayBuffer();
    videoCache.setChunk(nft.metadata.animation_url, 0, chunkSize - 1, chunk);
    
    console.log(`Preloaded initial ${chunkSize} bytes for ${nft.name}`);
  } catch (error) {
    console.error(`Error preloading video chunk for ${nft.name}:`, error);
  }
};

/**
 * Predictively preload the next few NFTs that a user is likely to interact with
 * This dramatically improves perceived performance by having content ready
 * before the user clicks on it
 */
export const predictivePreload = (nfts: NFT[], currentIndex: number): void => {
  // Create a dedicated logger for predictive preloading
  const preloadLogger = logger.getModuleLogger('predictivePreload');
  
  // Check if cellular - if so, we'll be more conservative
  const { isCellular } = isCellularConnection();
  
  // Determine how many NFTs to preload based on connection
  const preloadCount = isCellular ? 2 : 3;
  
  // Find the starting and ending indices for preloading
  const startIdx = Math.min(currentIndex + 1, nfts.length - 1);
  const endIdx = Math.min(currentIndex + preloadCount, nfts.length - 1);
  
  preloadLogger.info('Starting predictive preload', {
    currentIndex,
    startIdx,
    endIdx,
    isCellular,
    totalNfts: nfts.length
  });
  
  // Don't do anything if we're already at the end
  if (startIdx > endIdx) {
    preloadLogger.info('No items to preload (end of list)');
    return;
  }
  
  // Preload each NFT with staggered timing
  for (let i = startIdx; i <= endIdx; i++) {
    // Skip NFTs without animation URLs
    if (!nfts[i]?.metadata?.animation_url) continue;
    
    const nft = nfts[i];
    const delayMs = (i - startIdx) * 500; // Stagger by 500ms
    
    // Use setTimeout to stagger and deprioritize these requests
    setTimeout(() => {
      preloadLogger.debug(`Preloading NFT at index ${i}`, {
        name: nft.name || 'Unknown',
        position: `${i - currentIndex} ahead of current`
      });
      
      // Only load metadata on cellular to save data
      if (isCellular) {
        preloadVideoMetadata(nft);
      } else {
        // On Wi-Fi, we can be more aggressive and preload initial chunks too
        preloadVideoMetadata(nft)
          .then(() => preloadVideoInitialChunk(nft))
          .catch(err => {
            preloadLogger.warn(`Failed to preload NFT at index ${i}`, { error: err.message });
          });
      }
    }, delayMs);
  }
};

// Export the cache for use in the player
export { videoCache }; 