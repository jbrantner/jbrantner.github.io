// Render Deck offline helper: always try the newest version first, fall back to the saved copy with no signal.
// On a slow connection it never waits more than 3 seconds when a saved copy is ready; the newer one is saved for next time.
const CACHE = 'render-deck';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) { const k = picKey(u); if (k) e.respondWith(picture(e.request, u, k)); return; } // ComfyUI's answers are never kept, its finished pictures are
  const net = fetch(e.request, { cache: 'no-cache' });
  e.waitUntil(net.then(r => { if (!(r.ok || r.type === 'opaque')) return; const copy = r.clone(); return caches.open(CACHE).then(c => c.put(e.request, copy)); }).catch(() => {}));
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit => {
    if (!hit) return net;
    const fresh = net.then(r => (r.ok || r.type === 'opaque') ? r : hit).catch(() => hit);
    return Promise.race([fresh, new Promise(res => setTimeout(() => res(hit), 3000))]);
  }));
});
// finished pictures are kept on the phone, so the strip and the library show them straight away, even with the
// computer off. A picture is known by its folder and name, whichever computer it comes from (both PCs save into
// Dropbox, so Render can hand over Main's), and a finished file never changes; the app forgets the ones it deletes.
const PICS = 'render-deck-pictures', KEEP = { full: 300, thumb: 3000 };
function picKey(u) {
  const f = u.searchParams.get('filename') || '', sub = u.searchParams.get('subfolder') || '';
  if (u.pathname === '/renderdeck/thumb' && f) return 'https://rd-pic/thumb/' + encodeURIComponent(sub) + '/' + encodeURIComponent(f);
  if (u.pathname === '/view' && (u.searchParams.get('type') || 'output') === 'output' && /\.(png|jpe?g|webp)$/i.test(f)) return 'https://rd-pic/full/' + encodeURIComponent(sub) + '/' + encodeURIComponent(f);
  return '';
}
let puts = 0;
async function picture(req, u, key) {
  const c = await caches.open(PICS), hit = await c.match(key);
  if (hit) return hit;
  try {
    const r = await fetch(u.href, { mode: 'cors', credentials: 'omit' });
    if (r.ok) { await c.put(key, r.clone()); if (++puts % 25 === 0) trim(c); }
    return r;
  } catch (err) {
    const small = key.includes('/full/') && await c.match(key.replace('/full/', '/thumb/'));
    if (small) return small; // computer off: the small one is better than nothing
    return fetch(req); // a ComfyUI without the CORS header: show it, just don't keep it
  }
}
async function trim(c) {
  const keys = await c.keys();
  for (const kind of ['full', 'thumb']) { const mine = keys.filter(k => k.url.includes('/' + kind + '/')); for (const k of mine.slice(0, Math.max(0, mine.length - KEEP[kind]))) await c.delete(k); }
}
