/**
 * Specialized utilities for optimizing video playback on cellular networks
 */

// Check if user is on a cellular connection
export const isCellularConnection = (): boolean => {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) {
    return false;
  }
  
  const connection = (navigator as any).connection;
  const type = connection?.type || 'unknown';
  
  // Consider types 'cellular', '4g', '3g', '2g', etc. as cellular connections
  return type === 'cellular' ||
         type === '4g' ||
         type === '3g' ||
         type === '2g' ||
         // For browsers that don't specify cellular but do report effectiveType
         (type !== 'wifi' && 
          type !== 'ethernet' && 
          connection?.effectiveType !== 'unknown');
};

// Get cellular network generation based on effectiveType and downlink
export const getCellularGeneration = (): '2G' | '3G' | '4G' | '5G' => {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) {
    return '4G'; // Default assumption
  }
  
  const connection = (navigator as any).connection;
  const effectiveType = connection?.effectiveType;
  const downlink = connection?.downlink || 0;
  
  // Determine generation based on effectiveType and downlink speed
  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return '2G';
  } else if (effectiveType === '3g' || downlink < 2) {
    return '3G';
  } else if (downlink >= 10) {
    return '5G'; // Likely 5G if downlink is very fast
  } else {
    return '4G'; // Default to 4G for most modern connections
  }
};

// Get optimal video settings based on cellular network generation
export const getCellularVideoSettings = (): {
  maxHeight: number;
  targetBitrate: number;
  bufferTarget: number;
  preloadStrategy: 'none' | 'metadata' | 'auto';
  useHls: boolean;
  initialSegmentOnly: boolean;
} => {
  const generation = getCellularGeneration();
  
  switch (generation) {
    case '2G':
      return {
        maxHeight: 240,
        targetBitrate: 150000, // 150kbps
        bufferTarget: 15,      // Buffer 15 seconds ahead
        preloadStrategy: 'none',
        useHls: true,
        initialSegmentOnly: true
      };
    case '3G':
      return {
        maxHeight: 360,
        targetBitrate: 500000, // 500kbps
        bufferTarget: 10,      // Buffer 10 seconds ahead
        preloadStrategy: 'metadata',
        useHls: true,
        initialSegmentOnly: false
      };
    case '4G':
      return {
        maxHeight: 720,
        targetBitrate: 1500000, // 1.5Mbps
        bufferTarget: 5,        // Buffer 5 seconds ahead
        preloadStrategy: 'metadata',
        useHls: true,
        initialSegmentOnly: false
      };
    case '5G':
      return {
        maxHeight: 1080,
        targetBitrate: 4000000, // 4Mbps
        bufferTarget: 3,        // Buffer 3 seconds ahead
        preloadStrategy: 'auto',
        useHls: true,
        initialSegmentOnly: false
      };
  }
};

// Get optimized video URL for cellular connections
export const getOptimizedCellularVideoUrl = (originalUrl: string): string => {
  const generation = getCellularGeneration();
  const settings = getCellularVideoSettings();
  
  // For demo - just append quality parameter based on network generation
  // In a real implementation, you'd have server-side support for these parameters
  
  // If URL appears to be from a CDN or streaming service
  if (originalUrl.includes('cloudfront.net') || 
      originalUrl.includes('cdn') || 
      originalUrl.includes('stream')) {
    // Add quality parameters to the URL
    const separator = originalUrl.includes('?') ? '&' : '?';
    return `${originalUrl}${separator}quality=${settings.maxHeight}p&bitrate=${settings.targetBitrate}`;
  }
  
  return originalUrl;
};

// Create very low bitrate preview URL
export const getPreviewVideoUrl = (originalUrl: string): string => {
  // This would be implemented based on your backend capabilities
  // For example, appending a parameter like ?preview=true
  
  // For demo purposes:
  if (originalUrl.includes('?')) {
    return `${originalUrl}&preview=true`;
  } else {
    return `${originalUrl}?preview=true`;
  }
};

/**
 * Apply cellular-specific optimizations to video element
 */
export const optimizeVideoForCellular = (
  video: HTMLVideoElement, 
  generation: '2G' | '3G' | '4G' | '5G'
): void => {
  // Get cellular settings
  const settings = getCellularVideoSettings();
  
  // Base optimizations for all cellular connections
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  
  // Modify actual video rendering quality
  if (generation === '2G' || generation === '3G') {
    // Low-end optimizations
    video.style.maxHeight = `${settings.maxHeight}px`;
    video.style.objectFit = 'contain';
    video.style.backgroundColor = '#000';
    video.style.imageRendering = 'optimizeSpeed';
    
    // iOS-specific hints
    video.setAttribute('x-webkit-airplay', 'allow');
    video.preload = 'none';
    
    // Disable picture-in-picture to save resources
    if ('disablePictureInPicture' in video) {
      (video as any).disablePictureInPicture = true;
    }
  } else if (generation === '4G') {
    // Medium optimizations
    video.style.maxHeight = `${settings.maxHeight}px`;
    video.preload = 'metadata';
  }
  
  // Add data attributes for debugging
  video.setAttribute('data-cellular', generation);
  
  // Pause other videos when this one plays
  video.addEventListener('play', function pauseOthers() {
    document.querySelectorAll('video').forEach(otherVideo => {
      if (otherVideo !== video && !otherVideo.paused) {
        otherVideo.pause();
      }
    });
  });
  
  // Monitor playback quality
  let lowPerformanceDetected = false;
  let lastTime = 0;
  let checkInterval: any = null;
  
  // Watch for stuttering playback
  const startPerformanceMonitoring = () => {
    if (checkInterval) clearInterval(checkInterval);
    
    lastTime = video.currentTime;
    let stallCount = 0;
    
    checkInterval = setInterval(() => {
      if (!video.paused) {
        const currentTime = video.currentTime;
        const expectedDelta = (Date.now() - lastTime) / 1000;
        const actualDelta = currentTime - lastTime;
        
        // If actual progress is significantly less than expected
        if (actualDelta < expectedDelta * 0.5 && actualDelta < 0.1) {
          stallCount++;
          
          if (stallCount >= 3 && !lowPerformanceDetected) {
            lowPerformanceDetected = true;
            console.log('Cellular performance issues detected - enabling further optimizations');
            
            // Additional optimizations for low performance
            video.style.imageRendering = 'optimizeSpeed';
            video.style.filter = 'brightness(1.05)'; // Slight brightness boost for perceptual quality
            
            if (generation === '2G' || generation === '3G') {
              // Extreme measures for very low performance
              video.playbackRate = 0.9; // Slightly slower playback
            }
          }
        } else {
          stallCount = 0;
        }
        
        lastTime = currentTime;
      }
    }, 2000);
  };
  
  video.addEventListener('playing', startPerformanceMonitoring);
  
  video.addEventListener('pause', () => {
    if (checkInterval) clearInterval(checkInterval);
  });
  
  video.addEventListener('emptied', () => {
    if (checkInterval) clearInterval(checkInterval);
    lowPerformanceDetected = false;
  });
}; 