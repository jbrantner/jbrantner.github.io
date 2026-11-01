// H3 Deck offline helper: the newest version first, the saved copy when there's no signal (never waits more than 3 s
// when a saved copy is ready). ComfyUI's answers and videos are never kept.
const CACHE = 'h3-deck';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const net = fetch(e.request, { cache: 'no-cache' });
  e.waitUntil(net.then(r => { if (!r.ok) return; const copy = r.clone(); return caches.open(CACHE).then(c => c.put(e.request, copy)); }).catch(() => {}));
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit => {
    if (!hit) return net;
    const fresh = net.then(r => r.ok ? r : hit).catch(() => hit);
    return Promise.race([fresh, new Promise(res => setTimeout(() => res(hit), 3000))]);
  }));
});
