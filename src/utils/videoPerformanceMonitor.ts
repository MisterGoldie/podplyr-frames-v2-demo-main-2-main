// Track global video performance and adjust quality as needed

let isLowPerformanceMode = false;
let frameDropDetected = false;
let totalVideosPlaying = 0;
let networkType: string | null = null;

// Helper functions for monitoring performance
export const videoPerformanceMonitor = {
  init() {
    // Check device capabilities once at init
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLowPowerDevice = isMobile && typeof window.navigator.hardwareConcurrency === 'number' && 
      window.navigator.hardwareConcurrency <= 4;
    
    // Check network conditions
    this.checkNetworkConditions();
    
    // Listen for network changes
    window.addEventListener('online', () => this.checkNetworkConditions());
    window.addEventListener('offline', () => this.checkNetworkConditions());
    
    // Always enable optimizations on mobile
    if (isMobile) {
      this.enableLowPerformanceMode();
    }
    
    // Monitor frame rate to detect dropped frames
    if ('requestAnimationFrame' in window) {
      let lastTime = performance.now();
      let frameCount = 0;
      let slowFrames = 0;
      
      const checkFrameRate = () => {
        const now = performance.now();
        const delta = now - lastTime;
        
        frameCount++;
        
        // Check if this frame took too long (dropped frames)
        if (delta > 50) { // More than 50ms = less than 20fps
          slowFrames++;
        }
        
        // Every 60 frames, check the ratio of slow frames
        if (frameCount >= 60) {
          const slowFrameRatio = slowFrames / frameCount;
          
          // If more than 20% of frames are slow, enable low performance mode
          if (slowFrameRatio > 0.2) {
            frameDropDetected = true;
            this.enableLowPerformanceMode();
          }
          
          // Reset counters
          frameCount = 0;
          slowFrames = 0;
        }
        
        lastTime = now;
        requestAnimationFrame(checkFrameRate);
      };
      
      // Start monitoring
      requestAnimationFrame(checkFrameRate);
    }
  },
  
  enableLowPerformanceMode() {
    if (!isLowPerformanceMode) {
      isLowPerformanceMode = true;
      console.log("Enabling low performance mode for videos");
      
      // Apply low performance settings to all videos
      document.querySelectorAll('video').forEach(video => {
        this.optimizeVideoElement(video);
      });
      
      // Add a listener for future video elements
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'VIDEO') {
              this.optimizeVideoElement(node as HTMLVideoElement);
            }
            
            // Check if node is an Element (which has querySelectorAll method)
            if (node instanceof Element) {
              node.querySelectorAll('video').forEach((video: HTMLVideoElement) => {
                this.optimizeVideoElement(video);
              });
            }
          });
        });
      });
      
      observer.observe(document.body, { 
        childList: true,
        subtree: true
      });
    }
  },
  
  checkNetworkConditions() {
    // Check if we're on a cellular connection
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        networkType = connection.type || connection.effectiveType;
        console.log('Network type detected:', networkType);
        
        // Listen for network type changes
        if (connection.addEventListener) {
          connection.addEventListener('change', () => {
            networkType = connection.type || connection.effectiveType;
            console.log('Network type changed:', networkType);
          });
        }
      }
    }
  },
  
  optimizeVideoElement(video: HTMLVideoElement) {
    // Apply essential optimizations to the video element
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    
    // Set crossorigin to anonymous to avoid CORS issues on some networks
    video.setAttribute('crossorigin', 'anonymous');
    
    // Check if we're on a cellular connection (2g, 3g, 4g, etc.)
    const isCellular = networkType && ['2g', '3g', '4g', 'cellular', 'slow-2g'].includes(networkType);
    
    // Adjust preload strategy based on network
    video.preload = isCellular ? 'metadata' : 'auto';
    
    // Add error handling for network issues
    video.onerror = (e) => {
      console.error('Video error:', video.error);
      this.handleVideoError(video);
    };
    
    // Reduce quality for performance
    if (video.videoHeight > 480) {
      // Lower resolution videos perform better
      video.style.objectFit = 'contain';
    }
    
    // Set timeout to detect stalled loading
    setTimeout(() => {
      if (video.readyState < 2 && !video.paused) { // HAVE_CURRENT_DATA
        console.log('Video loading stalled, attempting recovery');
        this.handleVideoError(video);
      }
    }, 10000);
    
    // Monitor this video's performance
    video.addEventListener('playing', () => {
      totalVideosPlaying++;
      
      // If too many videos are playing, pause non-visible ones
      if (totalVideosPlaying > 1) {
        this.pruneBackgroundVideos();
      }
    });
    
    video.addEventListener('pause', () => {
      if (totalVideosPlaying > 0) {
        totalVideosPlaying--;
      }
    });
  },
  
  pruneBackgroundVideos() {
    // Find videos that are not in viewport and pause them
    const videos = Array.from(document.querySelectorAll('video'));
    
    videos.forEach(video => {
      if (!video.paused) {
        const rect = video.getBoundingClientRect();
        const isVisible = 
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;
        
        if (!isVisible) {
          console.log('Pausing background video for performance');
          video.pause();
        }
      }
    });
  },
  
  isInLowPerformanceMode() {
    return isLowPerformanceMode;
  },
  
  hasDetectedFrameDrops() {
    return frameDropDetected;
  },
  
  // Handle video errors and recovery
  handleVideoError(video: HTMLVideoElement) {
    if (!video.src) return;
    
    console.log('Attempting to recover video playback');
    
    // Save current position and playing state
    const currentTime = video.currentTime;
    const wasPlaying = !video.paused;
    
    // Force reload with cache-busting
    const currentSrc = video.src;
    const cacheBuster = `${currentSrc.includes('?') ? '&' : '?'}cb=${Date.now()}`;
    
    // Pause and reset
    video.pause();
    
    // Apply new source with cache buster
    setTimeout(() => {
      video.src = currentSrc + cacheBuster;
      video.load();
      
      // Restore position
      video.currentTime = currentTime;
      
      // Resume if it was playing
      if (wasPlaying) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('Auto-play prevented after recovery:', error);
          });
        }
      }
    }, 100);
  }
}; 