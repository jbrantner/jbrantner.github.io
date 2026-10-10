// The app's offline cache. It keeps the version it has: the app asks "Update app?" when a newer one is out, and the new files are only
// fetched when Update is tapped. A new copy of this script never swaps the app by itself.
const CACHE = 'budget-main';
const FILES = ['art.png', 'town-art.png', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'tavern-180.png', 'tavern-192.png', 'tavern-512.png', 'index.html'];   // the page last, so a cut-off update never pairs a new page with old art

async function fetchInto(name) {
  const c = await caches.open(name);
  for (const f of FILES) {
    const r = await fetch(f, { cache: 'no-store' });
    if (!r.ok) throw new Error(f + ' ' + r.status);
    await c.put(f, r);
  }
}

self.addEventListener('install', e => e.waitUntil((async () => {
  if (!(await caches.has(CACHE))) await fetchInto(CACHE);   // first visit: keep the version that's there today
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^budget-v\d+$/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));   // the old version-numbered caches

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/version.json')) return;   // version.json always asks the site
  if (/\/(icon|tavern)[^/]*$/.test(url.pathname)) return;   // the home-screen icons always come from the site
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    return (await c.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })) || fetch(req);
  })());
});

// "Update now": fetch every file into a spare cache first, so a failed download leaves the old version whole.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'update') return;
  e.waitUntil((async () => {
    let type = 'updated';
    try {
      await caches.delete(CACHE + '-next');
      await fetchInto(CACHE + '-next');
      const next = await caches.open(CACHE + '-next'), cur = await caches.open(CACHE);
      for (const f of FILES) await cur.put(f, await next.match(f));
      await caches.delete(CACHE + '-next');
    } catch (err) { type = 'update-failed'; }
    for (const c of await self.clients.matchAll()) c.postMessage({ type });
  })());
});
