// Pixel Pen offline helper: always try the newest version first, fall back to the saved copy with no signal.
const CACHE = 'pixel-pen';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try { const r = await fetch(e.request, { cache: 'no-cache' }); if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }
    catch (err) { const hit = await c.match(e.request, { ignoreSearch: true }); if (hit) return hit; throw err; }
  })());
});
