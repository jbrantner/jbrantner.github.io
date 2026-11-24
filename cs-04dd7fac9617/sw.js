// Corner Sketch offline helper: newest version first, the saved copy when there's no signal (never waits over 3 s if a copy is saved).
const CACHE = 'corner-sketch';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const net = fetch(e.request, { cache: 'no-cache' });
  e.waitUntil(net.then(r => { if (!(r.ok || r.type === 'opaque')) return; const copy = r.clone(); return caches.open(CACHE).then(c => c.put(e.request, copy)); }).catch(() => {}));
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit => {
    if (!hit) return net;
    const fresh = net.then(r => (r.ok || r.type === 'opaque') ? r : hit).catch(() => hit);
    return Promise.race([fresh, new Promise(res => setTimeout(() => res(hit), 3000))]);
  }));
});
