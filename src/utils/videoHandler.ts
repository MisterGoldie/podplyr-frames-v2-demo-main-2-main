import { getMediaKey } from './media';
import type { NFT } from '../types/user';

interface MuxAssetMetadata {
  playbackId: string;
  lastUpdated: number;
}

// Cache Mux playback IDs using mediaKey
const getMuxPlaybackId = async (nft: NFT): Promise<string | null> => {
  if (!nft.metadata?.animation_url) return null;
  
  const mediaKey = getMediaKey(nft);
  try {
    // Check cache first
    const cached = localStorage.getItem(`mux-cache-${mediaKey}`);
    if (cached) {
      const metadata: MuxAssetMetadata = JSON.parse(cached);
      // Cache for 24 hours
      if (Date.now() - metadata.lastUpdated < 24 * 60 * 60 * 1000) {
        return metadata.playbackId;
      }
    }

    // Create new Mux asset if not cached
    const response = await fetch('/api/mux/create-asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: nft.metadata.animation_url })
    });

    if (!response.ok) throw new Error('Failed to create Mux asset');
    
    const { playbackId } = await response.json();
    
    // Cache the playback ID
    const metadata: MuxAssetMetadata = {
      playbackId,
      lastUpdated: Date.now()
    };
    localStorage.setItem(`mux-cache-${mediaKey}`, JSON.stringify(metadata));
    
    return playbackId;
  } catch (error) {
    console.warn('Error getting Mux playback ID:', error);
    return null;
  }
};

// Get optimized video URL
export const getOptimizedVideoUrl = async (nft: NFT): Promise<string> => {
  const playbackId = await getMuxPlaybackId(nft);
  if (playbackId) {
    // Use Mux's optimized playback URL
    return `https://stream.mux.com/${playbackId}.m3u8`;
  }
  // Fallback to original URL
  return nft.metadata?.animation_url || '';
};

// Preload video metadata
export const preloadVideo = async (nft: NFT): Promise<void> => {
  try {
    const url = await getOptimizedVideoUrl(nft);
    if (!url) return;

    // Create a temporary video element to preload metadata
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;

    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
      // Timeout after 10 seconds
      setTimeout(reject, 10000);
    });
  } catch (error) {
    console.warn('Error preloading video:', error);
  }
};
