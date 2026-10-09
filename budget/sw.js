// Offline cache so the installed app opens without a connection. It tries the network first so
// updates show up, and falls back to the saved copy when you're offline. Pages always check with
// the server (the site lets browsers keep a copy for 10 minutes otherwise), so a new version shows
// up the next time the app opens.
const CACHE = 'budget-v11';
const FILES = ['./', 'index.html', 'art.png', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const net = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }).then(r => r.redirected ? fetch(e.request) : r) : fetch(e.request);
  e.respondWith(net.then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
