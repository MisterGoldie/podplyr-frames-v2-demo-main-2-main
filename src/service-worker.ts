// Add this to your service worker file

// Cache name for video content
const VIDEO_CACHE = 'video-cache-v1';

// Listen for fetch events
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Check if this is a video request (you can customize this check)
  if (url.pathname.endsWith('.mp4') || 
      url.pathname.includes('/video/') || 
      url.pathname.includes('/animation/')) {
    
    // Use a cache-first strategy for videos
    event.respondWith(
      caches.open(VIDEO_CACHE).then((cache) => {
        return cache.match(event.request).then((response) => {
          // Return cached response if available
          if (response) {
            console.log('Serving video from cache:', url.pathname);
            return response;
          }
          
          // Otherwise fetch from network and cache
          return fetch(event.request).then((networkResponse) => {
            // Clone the response before caching it
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
  }
});

// Clean up old caches periodically
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old video caches if needed
          if (cacheName.startsWith('video-cache-') && cacheName !== VIDEO_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 