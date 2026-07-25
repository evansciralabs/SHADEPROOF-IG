/* ============================================================================
   SHADEPROOF service worker — EVANSCIRA LABS // SRC-D2

   The previous version was cache-first for EVERY GET, which meant index.html
   was frozen at whatever was cached first and no deploy could ever be seen.
   This one is:

     - network-first for the page and the app shell (you always get the
       newest build; cache is only a fallback when offline)
     - cache-first for immutable assets (ffmpeg-core, fonts, pinned CDN libs)
     - never caches opaque error responses, which used to poison the cache
   ============================================================================ */

const VERSION    = 'shadeproof-v3';
const ASSETS     = 'shadeproof-assets-v3';

// same-origin things that must always be fresh
const ALWAYS_FRESH = [/\/$/, /index\.html$/, /sw\.js$/, /manifest\.json$/];

// safe to cache hard: version-pinned or immutable
const IMMUTABLE = [
  /\/ffmpeg-core\//,
  /fonts\.gstatic\.com/,
  /fonts\.googleapis\.com/,
  /cdn\.jsdelivr\.net\/npm\/@ffmpeg/,
  /cdn\.jsdelivr\.net\/npm\/@tensorflow/,
  /cdn\.jsdelivr\.net\/npm\/nsfwjs/,
  /unpkg\.com\/@ffmpeg/,
  /s3\.amazonaws\.com/
];

const match = (url, list) => list.some(re => re.test(url));

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION && k !== ASSETS).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = req.url;

  // ---- app shell: network first, cache only as an offline fallback ----
  if(req.mode === 'navigate' || match(url, ALWAYS_FRESH)){
    event.respondWith(
      fetch(req)
        .then(res => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // ---- immutable assets: cache first, refresh quietly in the background ----
  if(match(url, IMMUTABLE)){
    event.respondWith(
      caches.match(req).then(hit => {
        if(hit) return hit;
        return fetch(req).then(res => {
          // never store an error or an opaque failure
          if(res && (res.status === 200 || (res.type === 'opaque' && res.status === 0))){
            const copy = res.clone();
            caches.open(ASSETS).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        });
      })
    );
    return;
  }

  // ---- everything else: straight to the network ----
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
