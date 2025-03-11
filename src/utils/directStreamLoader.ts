/**
 * Direct Stream Loader
 * 
 * Bypasses all network contention by directly loading video streams
 * at maximum priority on cellular networks.
 */

// Cache for Mux playback URLs to avoid repeated fetches
const MUX_URL_CACHE: Record<string, string> = {};

/**
 * Get the direct HLS M3U8 stream URL from a Mux playback ID
 */
export const getMuxDirectStreamUrl = async (playbackId: string): Promise<string> => {
  if (MUX_URL_CACHE[playbackId]) {
    console.log('🎯 Using cached Mux stream URL');
    return MUX_URL_CACHE[playbackId];
  }

  // This is the standard Mux HLS URL format
  const directUrl = `https://stream.mux.com/${playbackId}.m3u8`;
  MUX_URL_CACHE[playbackId] = directUrl;
  return directUrl;
};

/**
 * Preload the HLS stream into browser cache before playing
 * This makes a huge difference on cellular networks
 */
export const preloadHlsStream = async (
  streamUrl: string,
  options = { chunkCount: 3, maxRetries: 2 }
): Promise<boolean> => {
  const { chunkCount, maxRetries } = options;
  
  try {
    console.log(`🚀 Preloading HLS stream: ${streamUrl}`);
    
    // Fetch the master playlist
    const masterResponse = await fetchWithPriority(streamUrl);
    if (!masterResponse.ok) throw new Error('Failed to fetch master playlist');
    
    const masterPlaylist = await masterResponse.text();
    
    // Extract the first rendition URL (typically lowest quality)
    const renditionUrls = extractRenditionUrls(masterPlaylist, streamUrl);
    if (renditionUrls.length === 0) throw new Error('No renditions found in master playlist');
    
    // On cellular, start with the lowest quality
    const isCellular = 'connection' in navigator && 
      (navigator as any).connection?.type === 'cellular';
      
    const targetRendition = isCellular 
      ? renditionUrls[0] // Lowest quality
      : renditionUrls[Math.floor(renditionUrls.length / 2)]; // Medium quality
      
    // Fetch the target rendition
    const renditionResponse = await fetchWithPriority(targetRendition);
    if (!renditionResponse.ok) throw new Error('Failed to fetch rendition playlist');
    
    const renditionPlaylist = await renditionResponse.text();
    
    // Extract and preload the first few chunks
    const chunkUrls = extractChunkUrls(renditionPlaylist, targetRendition);
    const preloadChunks = chunkUrls.slice(0, chunkCount);
    
    // Preload chunks in parallel
    await Promise.all(preloadChunks.map(async (chunkUrl) => {
      let retries = 0;
      while (retries < maxRetries) {
        try {
          const chunkResponse = await fetchWithPriority(chunkUrl);
          if (!chunkResponse.ok) throw new Error(`Failed to fetch chunk: ${chunkUrl}`);
          
          // Force browser to cache the chunk
          await chunkResponse.arrayBuffer();
          return;
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            console.error(`Failed to preload chunk after ${maxRetries} attempts: ${chunkUrl}`);
          }
        }
      }
    }));
    
    console.log(`✅ Successfully preloaded ${preloadChunks.length} chunks`);
    return true;
  } catch (error) {
    console.error('Error preloading HLS stream:', error);
    return false;
  }
};

/**
 * High-priority fetch that bypasses other network requests
 */
const fetchWithPriority = (url: string): Promise<Response> => {
  return fetch(url, { 
    priority: 'high', 
    cache: 'force-cache',
    headers: {
      'Pragma': 'no-cache'
    }
  });
};

/**
 * Extract rendition URLs from a master playlist
 */
const extractRenditionUrls = (masterPlaylist: string, baseUrl: string): string[] => {
  const urls: string[] = [];
  const lines = masterPlaylist.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith('#')) {
        const url = resolveUrl(nextLine, baseUrl);
        urls.push(url);
      }
    }
  }
  
  // Sort by bandwidth (assumes BANDWIDTH is in the EXT-X-STREAM-INF)
  urls.sort((a, b) => {
    const aIndex = lines.findIndex(line => line.includes(a));
    const bIndex = lines.findIndex(line => line.includes(b));
    
    const aBandwidth = extractBandwidth(lines[aIndex - 1]);
    const bBandwidth = extractBandwidth(lines[bIndex - 1]);
    
    return aBandwidth - bBandwidth;
  });
  
  return urls;
};

/**
 * Extract chunk URLs from a rendition playlist
 */
const extractChunkUrls = (renditionPlaylist: string, baseUrl: string): string[] => {
  const urls: string[] = [];
  const lines = renditionPlaylist.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#') && lines[i].trim() !== '') {
      const url = resolveUrl(lines[i], baseUrl);
      urls.push(url);
    }
  }
  
  return urls;
};

/**
 * Extract bandwidth from a EXT-X-STREAM-INF line
 */
const extractBandwidth = (line: string): number => {
  const match = line.match(/BANDWIDTH=(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

/**
 * Resolve a relative URL against a base URL
 */
const resolveUrl = (url: string, baseUrl: string): string => {
  if (url.startsWith('http')) return url;
  
  // Handle absolute paths
  if (url.startsWith('/')) {
    const baseUrlObj = new URL(baseUrl);
    return `${baseUrlObj.origin}${url}`;
  }
  
  // Handle relative paths
  const lastSlashIndex = baseUrl.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    return `${baseUrl.substring(0, lastSlashIndex + 1)}${url}`;
  }
  
  return url;
}; 