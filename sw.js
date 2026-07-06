/* FitCheck service worker — caches the app shell for offline / home-screen use.
   Never touches /api/* (the generation proxy) or cross-origin requests (fonts, CDN). */
const CACHE = 'fitcheck-v1';
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
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // let POST /api/generate through untouched
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // fonts / CDN scripts go straight to network
  if (url.pathname.startsWith('/api/')) return;           // never cache the proxy
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch {
      return (await caches.match('/index.html')) || Response.error();
    }
  })());
});
