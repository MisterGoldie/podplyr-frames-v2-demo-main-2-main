// Track global video performance and adjust quality as needed

let isLowPerformanceMode = false;
let frameDropDetected = false;
let totalVideosPlaying = 0;

// Helper functions for monitoring performance
export const videoPerformanceMonitor = {
  init() {
    // Check device capabilities once at init
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLowPowerDevice = isMobile && typeof window.navigator.hardwareConcurrency === 'number' && 
      window.navigator.hardwareConcurrency <= 4;
    
    if (isLowPowerDevice) {
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
            
            if (node.querySelectorAll) {
              node.querySelectorAll('video').forEach(video => {
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
  
  optimizeVideoElement(video: HTMLVideoElement) {
    // Apply optimizations to the video element
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.preload = 'metadata';
    
    // Reduce quality for performance
    if (video.videoHeight > 480) {
      // Lower resolution videos perform better
      video.style.objectFit = 'contain';
    }
    
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
  }
}; 