import Hls from 'hls.js';
import { getNetworkInfo, isMobileDevice } from './deviceDetection';

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
    
    // Get network info to determine optimal settings
    const { effectiveType, downlink } = getNetworkInfo();
    const isMobile = isMobileDevice();
    
    // Determine the appropriate startLevel based on network conditions
    let optimalStartLevel = -1; // Default to auto level selection
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.5) {
      optimalStartLevel = 0; // Lowest quality for very poor connections
    } else if (effectiveType === '3g' || downlink < 1.5) {
      optimalStartLevel = 1; // Low quality for moderate connections
    }
    
    // Create a new HLS instance with optimized settings
    const hls = new Hls({
      maxBufferLength: isMobile ? 15 : 30, // Shorter buffer for mobile to save memory
      maxMaxBufferLength: isMobile ? 30 : 60,
      enableWorker: true,
      lowLatencyMode: false,
      startLevel: optimalStartLevel, // Set the optimal level based on network conditions
      // Mobile-specific optimizations
      maxBufferSize: isMobile ? 8 * 1000 * 1000 : 30 * 1000 * 1000, // 8MB for mobile, 30MB for desktop
      maxBufferHole: 0.5,
      backBufferLength: isMobile ? 10 : 30, // 10 seconds back buffer on mobile
      
      // More aggressive switching for weak connections
      abrEwmaDefaultEstimate: isMobile ? 500000 : 1000000, // Start with lower bandwidth estimate on mobile
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,
      
      // Reduce stalling
      fragLoadingTimeOut: 20000, // Longer timeout for weak connections
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 500,
    });
    
    // Store the instance
    hlsInstances[videoId] = hls;
    
    // Advanced network recovery
    let recoveryAttempts = 0;
    
    // Bind events
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('HLS media attached');
      hls.loadSource(src);
    });
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('HLS manifest parsed');
      
      // For very weak connections, force lowest quality to start
      if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.5) {
        hls.currentLevel = 0; // Force lowest quality initially
        console.log('Forcing lowest quality due to poor connection');
      }
      
      resolve();
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Progressive recovery strategy for network errors
            recoveryAttempts++;
            console.log(`Network error recovery attempt ${recoveryAttempts}`);
            
            if (recoveryAttempts <= 3) {
              // Try to recover network error with increasing delays
              setTimeout(() => {
                hls.startLoad();
              }, recoveryAttempts * 1000); // Exponential backoff
            } else if (recoveryAttempts <= 5) {
              // After 3 attempts, try dropping to lowest quality
              setTimeout(() => {
                hls.currentLevel = 0; // Force lowest quality
                hls.startLoad();
              }, recoveryAttempts * 1000);
            } else {
              // After 5 attempts, try fallback to direct MP4 if available
              const mp4Url = src.replace('.m3u8', '.mp4');
              videoElement.src = mp4Url;
              videoElement.load();
            }
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

/**
 * Get the current quality level of an HLS instance
 */
export function getCurrentHlsLevel(videoId: string): number {
  const hls = hlsInstances[videoId];
  if (!hls) return -1;
  return hls.currentLevel;
}

/**
 * Set the quality level of an HLS instance
 */
export function setHlsQualityLevel(videoId: string, level: number): void {
  const hls = hlsInstances[videoId];
  if (!hls) return;
  hls.currentLevel = level;
}

// Make hlsInstances accessible via this function
export function getHlsInstance(videoId: string): Hls | null {
  return hlsInstances[videoId] || null;
} 