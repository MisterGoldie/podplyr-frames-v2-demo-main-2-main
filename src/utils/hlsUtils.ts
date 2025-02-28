import Hls from 'hls.js';

// Store HLS instances to prevent memory leaks
const hlsInstances: Record<string, Hls> = {};

/**
 * Check if a URL is an HLS stream URL
 */
export function isHlsUrl(url: string): boolean {
  return url.includes('.m3u8');
}

/**
 * Get the HLS URL from a source URL
 */
export function getHlsUrl(url: string): string {
  // If it's already an HLS URL, return it
  if (isHlsUrl(url)) {
    return url;
  }
  
  // Otherwise, try to convert it to an HLS URL
  // This is just an example - adjust based on your actual URL patterns
  if (url.includes('ipfs.io')) {
    // For IPFS URLs, you might have a different HLS endpoint
    return url.replace('/ipfs/', '/ipfs-hls/');
  }
  
  return url;
}

/**
 * Set up HLS.js for a video element
 */
export function setupHls(videoId: string, videoElement: HTMLVideoElement, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!Hls.isSupported()) {
      reject(new Error('HLS is not supported in this browser'));
      return;
    }
    
    // Clean up any existing instance
    destroyHls(videoId);
    
    // Create a new HLS instance
    const hls = new Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      enableWorker: true,
      lowLatencyMode: false,
      startLevel: -1, // Auto level selection
      // Optimize for mobile
      maxBufferSize: 10 * 1000 * 1000, // 10MB max buffer size
      maxBufferHole: 0.5, // Reduce buffer holes
      backBufferLength: 30, // 30 seconds of back buffer
    });
    
    // Store the instance
    hlsInstances[videoId] = hls;
    
    // Bind events
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('HLS media attached');
      hls.loadSource(src);
    });
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('HLS manifest parsed');
      resolve();
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Try to recover network error
            console.log('Fatal network error, trying to recover');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('Fatal media error, trying to recover');
            hls.recoverMediaError();
            break;
          default:
            // Cannot recover
            destroyHls(videoId);
            reject(new Error(`Fatal HLS error: ${data.details}`));
            break;
        }
      }
    });
    
    // Attach to video element
    hls.attachMedia(videoElement);
  });
}

/**
 * Destroy an HLS instance
 */
export function destroyHls(videoId: string): void {
  const hls = hlsInstances[videoId];
  if (hls) {
    hls.destroy();
    delete hlsInstances[videoId];
    console.log(`HLS instance for ${videoId} destroyed`);
  }
} 