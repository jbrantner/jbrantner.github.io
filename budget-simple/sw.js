// Budget (simple): its own offline cache, apart from the main app's (budget-main). Online it always gets the newest files
// from the site, so a new test version shows up on the next open; offline it uses the last copy it saw.
const CACHE = 'budget-simple';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.includes('/budget-simple/')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE), key = req.mode === 'navigate' ? 'index.html' : req;
    try { const r = await fetch(req, { cache: 'no-cache' }); if (r.ok) c.put(key, r.clone()); return r; }
    catch (err) { return (await c.match(key, { ignoreSearch: true })) || Response.error(); }
  })());
});
