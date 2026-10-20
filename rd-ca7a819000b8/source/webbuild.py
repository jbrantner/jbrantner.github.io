"""Build the home-screen (GitHub Pages) copy of Render Deck from comfy-app.html.
Usage: python3 webbuild.py OUT_DIR   -> writes OUT_DIR/index.html, manifest.webmanifest, sw.js and icons."""
import sys, os, json
from PIL import Image
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'comfy-app.html'), encoding='utf-8').read()
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
head = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="theme-color" content="#120d2e">
<meta name="apple-mobile-web-app-title" content="Render Deck"><meta name="robots" content="noindex, nofollow">
<link rel="apple-touch-icon" href="icon-tape-180.png"><link rel="icon" href="icon-tape-192.png"><link rel="manifest" href="manifest.webmanifest">
<!-- Render Deck. Copyright (c) 2026 Jordan Brantner. All rights reserved. -->
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{}); // keeps a copy for offline use; in the head so a slow font never holds it up</script>
'''
# the artifact source starts with <title> and <style>: they go in the head, the rest is the body
i = src.index('</style>') + len('</style>')
html = head + src[:i] + '\n</head><body>\n' + src[i:] + '''
</body></html>
'''
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(html)
json.dump({"name": "Render Deck", "short_name": "Render Deck", "start_url": "./", "scope": "./", "display": "standalone",
           "background_color": "#120d2e", "theme_color": "#120d2e",
           "icons": [{"src": "icon-tape-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-tape-512.png", "sizes": "512x512", "type": "image/png"}]},
          open(os.path.join(out, 'manifest.webmanifest'), 'w'), indent=1)
open(os.path.join(out, 'sw.js'), 'w', encoding='utf-8').write('''// Render Deck offline helper: always try the newest version first, fall back to the saved copy with no signal.
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
  if (u.pathname === '/view' && (u.searchParams.get('type') || 'output') === 'output' && /\\.(png|jpe?g|webp)$/i.test(f)) return 'https://rd-pic/full/' + encodeURIComponent(sub) + '/' + encodeURIComponent(f);
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
''')
# icon: a worn cassette tape (source/icon.png, 1024px), inspired by the Arc Raiders tape; resized for each size
im = Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon.png')).convert('RGB')
for s in (180, 192, 512): im.resize((s, s), Image.LANCZOS).save(os.path.join(out, f'icon-tape-{s}.png'))
print('built', out)
