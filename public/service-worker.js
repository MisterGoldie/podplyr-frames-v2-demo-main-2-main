const CACHE_NAME = 'podplayr-cache-v1';
const RUNTIME_CACHE = 'podplayr-runtime';

// Resources to pre-cache
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.ico'
];

// Helper function to safely cache resources
const safeCacheAdd = async (cache, url) => {
  try {
    await cache.add(url);
  } catch (error) {
    console.warn(`Failed to cache ${url}:`, error);
  }
};

// Helper function to safely cache multiple resources
const safeCacheAddAll = async (cache, urls) => {
  const cachePromises = urls.map(url => safeCacheAdd(cache, url));
  await Promise.allSettled(cachePromises);
};

// Install event - pre-cache critical resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => safeCacheAddAll(cache, PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(error => {
        console.warn('Service worker installation failed:', error);
        // Continue with installation even if caching fails
        return self.skipWaiting();
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
      })
      .then(cachesToDelete => {
        return Promise.allSettled(cachesToDelete.map(cacheToDelete => {
          return caches.delete(cacheToDelete);
        }));
      })
      .then(() => self.clients.claim())
      .catch(error => {
        console.warn('Service worker activation failed:', error);
        // Continue with activation even if cleanup fails
        return self.clients.claim();
      })
  );
});

// IPFS gateway list in order of preference
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/'
];

// Helper to extract IPFS hash from URL
const extractIPFSHash = (url) => {
  if (!url) return null;
  
  // Remove any duplicate 'ipfs' in the path
  url = url.replace(/\/ipfs\/ipfs\//, '/ipfs/');
  
  // Match IPFS hash patterns
  const ipfsMatch = url.match(/(?:ipfs\/|ipfs:)([a-zA-Z0-9]{46,}|Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{55})/i);
  return ipfsMatch ? ipfsMatch[1] : null;
};

// Try to fetch from multiple IPFS gateways
const tryIPFSGateways = async (ipfsHash) => {
  let lastError;
  
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const response = await fetch(gateway + ipfsHash);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      console.warn(`Failed to fetch from ${gateway}:`, error);
      lastError = error;
    }
  }
  
  throw lastError || new Error('All IPFS gateways failed');
};

// Fetch event - network-first strategy with fallback to cache
self.addEventListener('fetch', event => {
  // Handle IPFS requests
  if (event.request.url.includes('/ipfs/')) {
    const ipfsHash = extractIPFSHash(event.request.url);
    if (ipfsHash) {
      event.respondWith(
        caches.match(event.request)
          .then(cached => {
            if (cached) {
              // Try network in background and update cache
              tryIPFSGateways(ipfsHash)
                .then(response => {
                  caches.open(RUNTIME_CACHE)
                    .then(cache => cache.put(event.request, response.clone()))
                    .catch(error => console.warn('Failed to update IPFS cache:', error));
                })
                .catch(error => console.warn('Background IPFS update failed:', error));
              return cached;
            }
            
            // No cache, try network with gateway fallback
            return tryIPFSGateways(ipfsHash)
              .then(response => {
                // Cache the successful response
                const responseToCache = response.clone();
                caches.open(RUNTIME_CACHE)
                  .then(cache => cache.put(event.request, responseToCache))
                  .catch(error => console.warn('Failed to cache IPFS response:', error));
                return response;
              })
              .catch(error => {
                console.error('IPFS fetch failed:', error);
                return new Response('Failed to load IPFS content', {
                  status: 503,
                  statusText: 'Service Unavailable'
                });
              });
          })
      );
      return;
    }
  }
  
  // Skip other cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Skip Mux requests (we don't want to cache video streams)
  if (event.request.url.includes('mux.com')) {
    return;
  }

  // For API requests, use network-first strategy
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(error => {
          console.warn('API fetch failed:', error);
          return caches.match(event.request);
        })
        .then(response => {
          if (!response) {
            console.warn('No response from network or cache');
            return new Response('Service temporarily unavailable', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          }
          // Clone the response before caching
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE)
            .then(cache => cache.put(event.request, responseToCache))
            .catch(error => console.warn('Failed to cache response:', error));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For other requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return caches.open(RUNTIME_CACHE)
          .then(cache => {
            return fetch(event.request)
              .then(response => {
                // Cache successful responses
                if (response.status === 200) {
                  cache.put(event.request, response.clone());
                }
                return response;
              });
          });
      })
  );
});
