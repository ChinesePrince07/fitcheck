/* FitCheck service worker — network-first so new deploys always show up; the cache
   is only an offline fallback. Never touches /api/* or cross-origin (fonts, CDN). */
const CACHE = 'fitcheck-v2';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(u => c.add(u)));   // allSettled: a missing file won't abort install
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));   // wipe old caches (e.g. v1)
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // let POST /api/* through untouched
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // fonts / CDN scripts go straight to network
  if (url.pathname.startsWith('/api/')) return;           // never cache the proxies
  // Network-first: always try fresh (so deploys land immediately), fall back to cache only offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch {
      const cached = await caches.match(req);
      return cached || (await caches.match('/index.html')) || Response.error();
    }
  })());
});
