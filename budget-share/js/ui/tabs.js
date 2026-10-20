'use strict';
// Sizes for chasing the iPhone jump: the phone's screen, the page's window, the visible part, and the top inset.
// v140: the Upkeep tab. Its page is fetched and shown with srcdoc (see tabs.py); it keeps its own storage (upkeep.v1).
const themeOf = () => state.theme === 'device' ? '' : (state.theme || 'dark');   // v149: '' (the default) is Dark
function upkeepTheme() { try { const d = $('upkeepFrame').contentDocument; if (d && d.documentElement) { const th = themeOf(); if (th) d.documentElement.dataset.theme = th; else delete d.documentElement.dataset.theme;
  d.documentElement.classList.toggle('look-b', document.documentElement.classList.contains('look-b')); palRemap(d); } } catch (e) {} }   // v264: Upkeep follows the look
function openUpkeep() {
  const f = $('upkeepFrame'); if (!f) return; upkeepTheme(); if (f.dataset.on) return; f.dataset.on = '1';
  f.addEventListener('load', upkeepTheme);
  fetch('upkeep.html', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(t => { f.srcdoc = document.documentElement.classList.contains('look-b') ? t.replace('<html lang="en">', '<html lang="en" class="look-b">') : t; }).catch(() => {
      // a file:// copy can't fetch, so it loads by address. Online, a failed fetch means no connection before the
      // new service worker kept the page: loading it by address then would get the budget back, so say so instead
      if (location.protocol === 'file:') { f.src = 'upkeep.html'; return; }
      delete f.dataset.on; f.srcdoc = '<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;padding:32px 20px;color:#6b6b5e;background:transparent">Upkeep needs a connection the first time it opens. Try again when you’re online.</body>';
    });
}
