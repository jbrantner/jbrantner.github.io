// Render Deck offline helper: always try the newest version first, fall back to the saved copy with no signal.
// On a slow connection it never waits more than 3 seconds when a saved copy is ready; the newer one is saved for next time.
const CACHE = 'render-deck';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return; // never cache ComfyUI's answers or pictures
  const net = fetch(e.request, { cache: 'no-cache' });
  e.waitUntil(net.then(r => { if (!(r.ok || r.type === 'opaque')) return; const copy = r.clone(); return caches.open(CACHE).then(c => c.put(e.request, copy)); }).catch(() => {}));
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit => {
    if (!hit) return net;
    const fresh = net.then(r => (r.ok || r.type === 'opaque') ? r : hit).catch(() => hit);
    return Promise.race([fresh, new Promise(res => setTimeout(() => res(hit), 3000))]);
  }));
});
