'use strict';
/* ---------- updates ----------
   An app on the home screen can sit open in the background for days and never reload, so each time
   it comes back to the screen it asks the site for the latest version number (version.json, a tiny
   file next to the app). The main link then loads the new copy by itself, once: if the site still
   hands back the old one, a shows instead. A shared copy keeps the version it has until its owner
   taps and says yes, and its version.json only moves when you send it an update. */
const WEB_APP = isSecureContext && /^https?:$/.test(location.protocol);
let updateChecked = 0, updateTo = 0;
async function checkUpdate() {
  if (!WEB_APP || Date.now() - updateChecked < 60e3) return;
  updateChecked = Date.now();
  try {
    const v = Number((await (await fetch('version.json', { cache: 'no-store' })).json()).v || 0);
    updateTo = v > APP_VERSION ? v : 0;
    document.querySelectorAll('[data-update]').forEach(el => el.classList.toggle('hidden', !updateTo));
    $('updMsg').textContent = `Update app? Version ${updateTo} is ready.`;
    $('updBar').classList.toggle('hidden', !updateTo || sess('budget-update-later') === String(updateTo));
  } catch (e) {}
}
// v137: when the clock catches up (or goes back), show it
function clockCheck() { const b = clockBack(), shown = !!document.querySelector('.clock-bar'); if (b !== shown) { if (!b) save(); render(); } }
setInterval(clockCheck, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) clockCheck(); });   // back from changing the time in Settings
// Updating: the service worker keeps the old files until it's told to fetch the new ones, then the page reloads.
// v311: one update at a time. One listener hears the worker; the Update buttons wait while it runs, and the page waits for its
// answer (a slow link takes a while). An answer that comes after the page gave up still counts: "updated" means the next tap reloads.
let updWho = null, updAt = 0, updDone = false;
const updBtns = on => document.querySelectorAll('#updGo, [data-update]').forEach(b => { b.disabled = on; });
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => { const t = e.data && e.data.type; if (!/^update/.test(t || '')) return;
  updAt = 0; if (t === 'updated') updDone = true; const w = updWho; updWho = null; if (w) w(t); });
async function doUpdate() {
  if (updWho) return;
  $('updBar').classList.add('hidden');
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (sw) {
    toast('Updating…');
    const got = updDone ? 'updated' : await new Promise(res => { updBtns(true); const t = setTimeout(() => { if (updWho === w) { updWho = null; res('timeout'); } }, 120e3), w = x => { clearTimeout(t); res(x); }; updWho = w;
      if (!updAt || Date.now() - updAt > 120e3) { updAt = Date.now(); sw.postMessage({ type: 'update' }); } });   // one still running isn't asked for again
    updBtns(false);
    if (got !== 'updated') { toast("Couldn't get the update. Try again with a connection."); $('updBar').classList.remove('hidden'); return; }
  }
  location.reload();
}
$('updGo').onclick = doUpdate;
$('updLater').onclick = () => { sess('budget-update-later', updateTo); $('updBar').classList.add('hidden'); };   // asks again next time the app opens
document.querySelectorAll('[data-update]').forEach(el => el.onclick = async () => { if (await ask(`Version ${updateTo} of the app is ready. Update now?`)) doUpdate(); });
// Say so after a new version loads.
try { const seen = Number(localStorage.getItem(KEY + '-version') || 0); if (seen && seen < APP_VERSION) setTimeout(() => toast(`Updated to version ${APP_VERSION}`), 800); localStorage.setItem(KEY + '-version', APP_VERSION); } catch (e) {}
if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});   // ask the phone not to clear the data when space runs low
checkUpdate();

// v263: Home look. F (lit panels) or B (Coral reef); kept on this phone only, like the tab you were on.
function lookSync() { const k = document.documentElement.classList.contains('look-b') ? (palKey || 'b') : 'f'; document.querySelectorAll('[data-look]').forEach(x => x.classList.toggle('on', x.dataset.look === k)); }
document.querySelectorAll('[data-look]').forEach(x => x.onclick = () => { const k = x.dataset.look, b = k !== 'f'; document.documentElement.classList.toggle('look-b', b); palKey = PAL_LOOKS[k] ? k : '';   // v292: the reef's color swaps
  try { localStorage.setItem('budget-look', b ? 'b' : 'f'); localStorage.setItem('budget-pal', palKey); } catch (e) {} lookSync(); palRemap(document);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = b ? palMap('#145466') : '#15181d'; palApply(); render(); upkeepTheme(); });   // v264: the whole app changes at once
lookSync();

carts = state.carts || [];
for (const c of carts) if (c.amt) (incoming[c.to] = incoming[c.to] || { total: 0, arrived: 0 }).total += c.amt;
render();
if (carts.length) tickScene();
document.addEventListener('visibilitychange', () => { if (document.hidden) return; refreshDay(true); if (carts.length) tickScene(); checkUpdate(); });
if ('serviceWorker' in navigator && WEB_APP) navigator.serviceWorker.register('sw.js').catch(() => {});


setTimeout(() => { if (typeof petFeed === 'function') petFeed(); }, 1500);   // v286: the pet's budget feed on load
