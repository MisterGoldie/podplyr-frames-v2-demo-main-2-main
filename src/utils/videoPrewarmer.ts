/**
 * Video Prewarmer - Drastically reduces initial load time on cellular networks
 * by pre-fetching critical initial segments
 */

// Track which videos we've already prewarmed
const prewarmedVideos = new Set<string>();

// First, define an interface for your stream variant
interface StreamVariant {
  url: string;
  bandwidth: number;
}

/**
 * Prewarm a video by preloading its initial segments
 */
export const prewarmVideo = async (playbackId: string): Promise<boolean> => {
  // Skip if already prewarmed
  if (prewarmedVideos.has(playbackId)) {
    return true;
  }

  const isCellular = 
    'connection' in navigator && 
    (navigator as any).connection?.type === 'cellular';
    
  if (!isCellular) {
    // No need to prewarm on WiFi
    return false;
  }

  try {
    console.log(`🔥 Prewarming video: ${playbackId}`);
    
    // Step 1: Get the master playlist URL from Mux
    const masterUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    
    // Step 2: Fetch the master playlist with high priority
    const masterResponse = await fetch(masterUrl, { 
      priority: 'high',
      cache: 'force-cache'
    });
    
    if (!masterResponse.ok) {
      throw new Error('Failed to fetch master playlist');
    }
    
    const masterContent = await masterResponse.text();
    
    // Step 3: Parse the master playlist to find the lowest quality stream
    const streamUrls = extractStreamUrls(masterContent, masterUrl);
    
    if (streamUrls.length === 0) {
      throw new Error('No streams found in master playlist');
    }
    
    // On cellular, we always want the lowest quality to start
    const lowestQualityUrl = streamUrls[0];
    
    // Step 4: Fetch the lowest quality playlist
    const playlistResponse = await fetch(lowestQualityUrl, {
      priority: 'high',
      cache: 'force-cache'
    });
    
    if (!playlistResponse.ok) {
      throw new Error('Failed to fetch quality playlist');
    }
    
    const playlistContent = await playlistResponse.text();
    
    // Step 5: Extract the first few segments
    const segmentUrls = extractSegmentUrls(playlistContent, lowestQualityUrl);
    
    // Only need the first 2 segments to get video playing quickly
    const initialSegments = segmentUrls.slice(0, 2);
    
    // Step 6: Prefetch the first few segments in parallel
    console.log(`🔄 Prefetching ${initialSegments.length} initial segments`);
    
    await Promise.all(initialSegments.map(async (url) => {
      const response = await fetch(url, {
        priority: 'high',
        cache: 'force-cache'
      });
      
      if (!response.ok) {
        console.warn(`Failed to prefetch segment: ${url}`);
        return;
      }
      
      // Force the segment into browser cache by reading it
      await response.arrayBuffer();
    }));
    
    // Mark as prewarmed
    prewarmedVideos.add(playbackId);
    console.log(`✅ Successfully prewarmed video: ${playbackId}`);
    
    return true;
  } catch (error) {
    console.error('Error prewarming video:', error);
    return false;
  }
};

/**
 * Extract stream URLs from master playlist
 */
function extractStreamUrls(content: string, baseUrl: string): string[] {
  const lines = content.split('\n');
  const urls: StreamVariant[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Find quality playlists
    if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
      // Get bandwidth for quality sorting
      const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
      const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
      
      // Next line should be the URL
      if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
        const urlLine = lines[i + 1].trim();
        const fullUrl = resolveUrl(urlLine, baseUrl);
        
        urls.push({
          url: fullUrl,
          bandwidth
        } as StreamVariant);
      }
    }
  }
  
  // Sort by bandwidth (lowest first)
  const sortedVariants: StreamVariant[] = urls
    .sort((a: StreamVariant, b: StreamVariant) => a.bandwidth - b.bandwidth);
  
  return sortedVariants.map(item => item.url);
}

/**
 * Extract segment URLs from a quality playlist
 */
function extractSegmentUrls(content: string, baseUrl: string): string[] {
  const lines = content.split('\n');
  const urls: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Find segment URLs (non-comment lines)
    if (!lines[i].startsWith('#') && lines[i].trim().length > 0) {
      const urlLine = lines[i].trim();
      if (urlLine.endsWith('.ts') || urlLine.endsWith('.m4s')) {
        const fullUrl = resolveUrl(urlLine, baseUrl);
        urls.push(fullUrl);
      }
    }
  }
  
  return urls;
}

/**
 * Resolve relative URLs
 */
function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http')) {
    return url;
  }
  
  try {
    return new URL(url, baseUrl).href;
  } catch (e) {
    // Simple fallback if URL parsing fails
    if (url.startsWith('/')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.origin}${url}`;
    } else {
      const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
      return `${basePath}${url}`;
    }
  }
} 