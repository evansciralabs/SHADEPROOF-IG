const CACHE_NAME = 'shadeproof-vault-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return the cached version immediately if it exists
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise, fetch from the network
      return fetch(event.request).then(response => {
        // Ensure the response is valid before caching
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response stream so the browser and cache can both consume it
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(err => {
        console.warn('[SHADEPROOF SW] Fetch failed, offline mode active:', err);
      });
    })
  );
});
