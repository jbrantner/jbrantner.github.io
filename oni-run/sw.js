// Offline copy of Oni Run. The page is network-first, so a new version shows up on the next open when online.
const CACHE = 'oni-run-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const same = new URL(req.url).origin === location.origin;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (same) {
      try { const r = await fetch(req, { cache: 'no-store' }); if (r.ok) c.put(req, r.clone()); return r; }
      catch (err) { const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit; throw err; }
    }
    const hit = await c.match(req);
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') c.put(req, r.clone());
    return r;
  })());
});
