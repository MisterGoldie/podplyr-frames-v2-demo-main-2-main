/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

// This enables TypeScript to recognize the service worker global scope
declare const self: ServiceWorkerGlobalScope;

// Cache names for different types of content
const STATIC_CACHE_NAME = 'podplayr-static-v1';
const MEDIA_CACHE_NAME = 'podplayr-media-v1';
const API_CACHE_NAME = 'podplayr-api-v1';

// Maximum size for media cache (roughly 500MB)
const MAX_MEDIA_CACHE_SIZE = 500 * 1024 * 1024;

// List of static resources to pre-cache
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/static/js/bundle.js',
  '/manifest.json',
  '/favicon.ico',
  // Add other important assets here
];

// Check if a URL is for a media file
const isMediaFile = (url: string): boolean => {
  return /\.(mp3|wav|mp4|webm|m4a|ogg)$/i.test(url);
};

// Check if a URL is for an API request
const isApiRequest = (url: string): boolean => {
  return url.includes('/api/') || url.includes('/graphql');
};

// Check if a URL is for an image
const isImageFile = (url: string): boolean => {
  return /\.(jpe?g|png|gif|svg|webp)$/i.test(url);
};

// Handle fetch events (network requests)
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  
  // Don't intercept requests to other domains
  if (url.origin !== self.location.origin && !url.hostname.includes('ipfs.io')) {
    return;
  }
  
  // Special handling for media files
  if (isMediaFile(url.pathname)) {
    event.respondWith(handleMediaFetch(event.request));
    return;
  }
  
  // API requests - network first with short-lived cache
  if (isApiRequest(url.pathname)) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Image files - cache first with network fallback
  if (isImageFile(url.pathname)) {
    event.respondWith(handleImageRequest(event.request));
    return;
  }
  
  // Static resources - cache first strategy
  if (STATIC_RESOURCES.some(resource => event.request.url.endsWith(resource))) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(response => {
          // Cache the fetched response
          const responseToCache = response.clone();
          caches.open(STATIC_CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }
  
  // Default - network first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If the response is valid, clone it and store it in the cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(STATIC_CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // If fetch fails, try to get from cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If not in cache either, return a basic fallback
            if (isApiRequest(event.request.url)) {
              return new Response(JSON.stringify({ error: 'Network error' }), {
                headers: { 'Content-Type': 'application/json' },
              });
            }
            // Return default fallback for other resources
            return new Response('Network error occurred', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' },
            });
          });
      })
  );
});

// Handle media file requests (mp3, wav, mp4, etc.)
async function handleMediaFetch(request: Request): Promise<Response> {
  // Check cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // If in cache, return it and fetch an update in the background
    // This ensures the user gets the media file quickly while also keeping the cache fresh
    fetchAndUpdateCache(request, MEDIA_CACHE_NAME).catch(console.error);
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  try {
    const response = await fetch(request);
    
    // Only cache successful responses
    if (response.status === 200) {
      const clonedResponse = response.clone();
      
      // Cache the media file in the background
      caches.open(MEDIA_CACHE_NAME).then(cache => {
        cache.put(request, clonedResponse);
        
        // After caching, check and manage cache size
        setTimeout(() => manageCacheSize(MEDIA_CACHE_NAME, MAX_MEDIA_CACHE_SIZE), 1000);
      });
    }
    
    return response;
  } catch (error) {
    console.error('Error fetching media:', error);
    
    // If offline, return a specific offline media message
    return new Response('Media not available offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Handle API requests
async function handleApiRequest(request: Request): Promise<Response> {
  try {
    // Try network first
    const response = await fetch(request);
    
    // Cache successful responses for a limited time
    if (response.status === 200) {
      const clonedResponse = response.clone();
      caches.open(API_CACHE_NAME).then(cache => {
        cache.put(request, clonedResponse);
      });
    }
    
    return response;
  } catch (error) {
    // If network fails, use cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If nothing in cache, return error response
    return new Response(JSON.stringify({ 
      error: 'Network error',
      offline: true 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503
    });
  }
}

// Handle image requests - cache first strategy
async function handleImageRequest(request: Request): Promise<Response> {
  // Check cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.status === 200) {
      const clonedResponse = response.clone();
      caches.open(STATIC_CACHE_NAME).then(cache => {
        cache.put(request, clonedResponse);
      });
    }
    
    return response;
  } catch (error) {
    // Return a placeholder image if available
    // Or a default error response
    return new Response('Image not available offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Fetch and update cache in the background
async function fetchAndUpdateCache(request: Request, cacheName: string): Promise<void> {
  const response = await fetch(request);
  
  if (response.status === 200) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  }
}

// Manage cache size to prevent it from growing too large
async function manageCacheSize(cacheName: string, maxSize: number): Promise<void> {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length <= 5) {
    // No need to check size if we have very few items
    return;
  }
  
  let cacheSize = 0;
  const cacheEntries: { request: Request, size: number, timestamp?: number }[] = [];
  
  // Calculate total size and gather information about each entry
  for (const request of keys) {
    const response = await cache.match(request);
    if (!response) continue;
    
    // Get response size
    const blob = await response.blob();
    const size = blob.size;
    cacheSize += size;
    
    // Get last access time if available (might be in headers)
    let timestamp = Date.now(); // Default to now
    const lastAccessed = response.headers.get('X-Last-Accessed');
    if (lastAccessed) {
      timestamp = parseInt(lastAccessed, 10);
    }
    
    cacheEntries.push({ request, size, timestamp });
  }
  
  // If cache is too large, remove oldest entries first
  if (cacheSize > maxSize) {
    console.log(`Cache ${cacheName} size (${(cacheSize / 1024 / 1024).toFixed(2)}MB) exceeds limit (${(maxSize / 1024 / 1024).toFixed(2)}MB)`);
    
    // Sort by timestamp (oldest first)
    cacheEntries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Remove entries until we're under the limit
    let removedSize = 0;
    while (cacheSize - removedSize > maxSize && cacheEntries.length > 0) {
      const entry = cacheEntries.shift();
      if (!entry) break;
      
      await cache.delete(entry.request);
      removedSize += entry.size;
      console.log(`Removed ${entry.request.url} from cache (${(entry.size / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    console.log(`Removed ${(removedSize / 1024 / 1024).toFixed(2)}MB from cache ${cacheName}`);
  }
}

// Service worker installation
self.addEventListener('install', (event: ExtendableEvent) => {
  // Pre-cache important resources
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('Caching app shell and static resources');
      return cache.addAll(STATIC_RESOURCES);
    })
  );
  
  // Force activation without waiting for current instances to be closed
  self.skipWaiting();
});

// Service worker activation
self.addEventListener('activate', (event: ExtendableEvent) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => {
            // Keep current version of each cache type, remove old versions
            return !cacheName.startsWith('podplayr-static-v') &&
                   !cacheName.startsWith('podplayr-media-v') &&
                   !cacheName.startsWith('podplayr-api-v');
          })
          .map(cacheName => {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log('Service Worker activated and took control');
    })
  );
  
  // Take control of all clients
  self.clients.claim();
});

// Listen for messages from the main thread
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  // Handle skip waiting request
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle cache management requests
  if (event.data && event.data.type === 'CLEAR_MEDIA_CACHE') {
    event.waitUntil(
      caches.delete(MEDIA_CACHE_NAME).then(() => {
        console.log('Media cache cleared');
        // Send confirmation back to the client
        if (event.source && 'postMessage' in event.source) {
          event.source.postMessage({ type: 'CACHE_CLEARED', cache: 'media' });
        }
      })
    );
  }
  
  // Handle prefetch request - can be used to preload media files
  if (event.data && event.data.type === 'PREFETCH' && event.data.urls) {
    const urls = event.data.urls as string[];
    event.waitUntil(
      Promise.all(
        urls.map(url => {
          return fetch(url)
            .then(response => {
              if (response.status === 200) {
                const cacheName = isMediaFile(url) ? MEDIA_CACHE_NAME : STATIC_CACHE_NAME;
                return caches.open(cacheName).then(cache => {
                  return cache.put(url, response);
                });
              }
              return Promise.resolve();
            })
            .catch(error => {
              console.warn(`Failed to prefetch ${url}:`, error);
              return Promise.resolve(); // Don't fail the entire operation
            });
        })
      ).then(() => {
        console.log(`Prefetched ${urls.length} resources`);
        // Send confirmation
        if (event.source && 'postMessage' in event.source) {
          event.source.postMessage({ type: 'PREFETCH_COMPLETE', count: urls.length });
        }
      })
    );
  }
});

// Export empty object as this is a service worker
export {}; 