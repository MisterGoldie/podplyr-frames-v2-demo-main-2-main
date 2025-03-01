import * as HlsModule from 'hls.js';

// Use the default export from the module
const Hls = HlsModule.default;

import { getNetworkInfo, isMobileDevice } from './deviceDetection';
import { isCellularConnection, getCellularGeneration, getCellularVideoSettings } from './cellularOptimizer';

// You already have the types from the module import
type HlsType = typeof Hls;

// Store HLS instances to prevent memory leaks
const hlsInstances: Record<string, HlsModule.default> = {};

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
 * Set up HLS.js for a video element with cellular-specific optimizations
 */
export function setupHls(videoId: string, videoElement: HTMLVideoElement, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!Hls.isSupported()) {
      reject(new Error('HLS is not supported in this browser'));
      return;
    }
    
    // Clean up any existing instance
    destroyHls(videoId);
    
    // Check if we're on a cellular connection
    const isCellular = isCellularConnection();
    const cellularGeneration = isCellular ? getCellularGeneration() : null;
    const cellularSettings = isCellular ? getCellularVideoSettings() : null;
    
    // Also check general network info
    const { effectiveType, downlink } = getNetworkInfo();
    const isMobile = isMobileDevice();
    
    console.log(`Network: ${isCellular ? `Cellular (${cellularGeneration})` : 'WiFi/Ethernet'}, ` +
                `Effective type: ${effectiveType}, Downlink: ${downlink}Mbps`);
    
    // Base config - will be customized based on network
    const hlsConfig: Partial<HlsModule.HlsConfig> = {
      enableWorker: true,
      lowLatencyMode: false,
      
      // Adaptive bitrate tuning
      abrEwmaDefaultEstimate: 1000000, // 1Mbps default
      abrBandWidthFactor: 0.9,
      abrBandWidthUpFactor: 0.7,
      
      // Default buffer settings
      liveSyncDuration: 3,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000 * 1000, // 60MB
      
      // Error recovery
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 1000,
      manifestLoadingMaxRetryTimeout: 64000,
      levelLoadingMaxRetry: 4,
      levelLoadingRetryDelay: 1000,
      levelLoadingMaxRetryTimeout: 64000,
    };
    
    // Cellular-specific aggressive optimizations
    if (isCellular && cellularSettings) {
      console.log(`Applying cellular (${cellularGeneration}) optimizations`);
      
      // Start with a lower level for cellular
      hlsConfig.startLevel = cellularGeneration === '5G' ? -1 : 0; // Auto for 5G, lowest for others
      
      // Adjust buffer sizes based on cellular generation
      hlsConfig.maxBufferLength = cellularSettings.bufferTarget;
      hlsConfig.maxMaxBufferLength = cellularSettings.bufferTarget * 2;
      
      // Very aggressive ABR for cellular
      hlsConfig.abrEwmaDefaultEstimate = cellularSettings.targetBitrate;
      
      // More aggressive switching for poor connections
      if (cellularGeneration === '2G' || cellularGeneration === '3G') {
        hlsConfig.abrBandWidthFactor = 0.7; // Be more conservative
        hlsConfig.fragLoadingMaxRetry = 8;  // More retries for fragments
        hlsConfig.fragLoadingRetryDelay = 500;
        
        // Reduce memory footprint
        hlsConfig.maxBufferSize = 10 * 1000 * 1000; // Only 10MB buffer on slow connections
      } else {
        // 4G/5G
        hlsConfig.maxBufferSize = 30 * 1000 * 1000; // 30MB for 4G/5G
      }
    }
    // Non-cellular mobile optimizations (like WiFi)
    else if (isMobile) {
      console.log('Applying WiFi mobile optimizations');
      hlsConfig.maxBufferLength = 15;
      hlsConfig.maxMaxBufferLength = 30;
      hlsConfig.maxBufferSize = 20 * 1000 * 1000; // 20MB for mobile WiFi
    }
    
    // Create HLS instance with our optimized config
    const hls = new Hls(hlsConfig);
    
    // Store the instance
    hlsInstances[videoId] = hls;
    
    // Advanced recovery mechanism
    let recoveryAttempts = 0;
    
    // Bind events
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('HLS media attached');
      hls.loadSource(src);
    });
    
    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log(`HLS manifest parsed, ${data.levels.length} quality levels found`);
      
      // If on cellular, force initial quality
      if (isCellular && cellularGeneration && cellularGeneration !== '5G') {
        const targetHeight = cellularSettings?.maxHeight || 360;
        
        // Find the closest level that doesn't exceed our target height
        let bestLevel = 0;
        let bestMatchHeight = 0;
        
        data.levels.forEach((level, index) => {
          if (level.height <= targetHeight && level.height > bestMatchHeight) {
            bestMatchHeight = level.height;
            bestLevel = index;
          }
        });
        
        console.log(`Cellular optimization: Setting initial level to ${bestLevel} (${bestMatchHeight}p)`);
        hls.currentLevel = bestLevel;
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
              // Try to recover with increasing delays
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
    
    // For cellular connections, add additional error handling
    if (isCellular) {
      // Monitor for stalls
      let lastTime = 0;
      let stallCount = 0;
      const stallMonitoringInterval = setInterval(() => {
        if (!videoElement.paused && videoElement.currentTime === lastTime) {
          stallCount++;
          console.log(`Potential stall detected (${stallCount})`);
          
          // If we detect multiple stalls, try recovery actions
          if (stallCount >= 3) {
            console.log('Multiple stalls detected, taking recovery action');
            stallCount = 0;
            
            // Force a quality level change if possible
            if (hls.currentLevel > 0) {
              console.log(`Reducing quality to level ${hls.currentLevel-1} due to stalls`);
              hls.currentLevel = hls.currentLevel - 1;
            }
          }
        } else {
          // Reset stall count if we're advancing
          stallCount = 0;
        }
        lastTime = videoElement.currentTime;
      }, 2000);
      
      // Clean up interval on destroy
      hls.on(Hls.Events.DESTROYING, () => {
        clearInterval(stallMonitoringInterval);
      });
    }
    
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
export function getHlsInstance(videoId: string): HlsModule.default | null {
  return hlsInstances[videoId] || null;
} 