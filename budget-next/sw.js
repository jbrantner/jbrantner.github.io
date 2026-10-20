// The app's offline cache. It keeps the version it has: the app asks "Update app?" when a newer one is out, and the new files are only
// fetched when Update is tapped. A new copy of this script never swaps the app by itself.
const CACHE = /\/budget-next\//.test(location.pathname) ? 'budget-next' : 'budget-main';   // the test copy keeps its own cache (one site, one set of caches)
const FILES = ['manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'tavern-180.png', 'tavern-192.png', 'tavern-512.png', 'upkeep.html',
  'css/fonts.css', 'css/looks.css', 'css/app.css', 'js/sandbox.js', 'js/head.js', 'js/looks.js', 'js/core/app.js', 'js/core/util.js', 'js/core/dates.js', 'js/core/format.js', 'js/core/dom.js', 'js/data/clock.js', 'js/data/transactions.js', 'js/data/pack.js', 'js/money/paydays.js', 'js/money/plan.js', 'js/money/bills.js', 'js/money/hold.js', 'js/money/books.js', 'js/money/villagers.js', 'js/money/goals.js', 'js/money/week.js', 'js/money/categories.js', 'js/money/debts.js', 'js/money/paycheck.js', 'js/money/autopay.js', 'js/app/planning.js', 'js/app/crews.js', 'js/app/roundoff.js', 'js/app/extra.js', 'js/app/spare.js', 'js/app/topoff.js', 'js/app/postage.js', 'js/app/payments.js', 'js/app/pots.js', 'js/app/schedule.js', 'js/ui/looks.js', 'js/ui/render.js', 'js/ui/categories.js', 'js/ui/week.js', 'js/ui/bills.js', 'js/ui/sheets-kit.js', 'js/ui/income.js', 'js/ui/split.js', 'js/ui/move.js', 'js/ui/debt.js', 'js/ui/got.js', 'js/ui/parade.js', 'js/ui/bankcheck.js', 'js/ui/news.js', 'js/ui/tabs.js', 'js/ui/import.js', 'js/ui/pots-wire.js', 'js/legacy/budget-page.js', 'js/legacy/party-page.js', 'js/data/backup.js', 'js/data/state.js', 'js/ui/payday.js', 'js/legacy/scene.js', 'js/ui/math.js', 'js/app/day.js', 'js/ui/kit.js', 'js/ui/sheets.js', 'js/ui/home.js', 'js/ui/nav.js', 'js/ui/layout.js', 'js/ui/pages.js', 'js/legacy/tx-page.js', 'js/ui/billfinder.js', 'js/ui/debtform.js', 'js/app/weekly.js', 'js/ui/settings.js', 'js/ui/keypad.js', 'js/legacy/pots-page.js', 'js/ui/bank.js', 'js/ui/setup.js', 'js/app/update.js', 'js/ui/tour.js',
  'index.html'];   // v140: upkeep.html, the Upkeep tab   // the page last, so a cut-off update never pairs a new page with old files; v299: the old art (art.png, town-art*.png) is no longer used (the files stay on the site for older copies' Update)

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
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^budget-v\d+$/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()).then(fillMissing)));   // the old version-numbered caches, and any file the cache lacks
// v104: a file added to FILES since this cache was filled (the forest town's second atlas page, town-art-1.png) is
// fetched into it now, so it works offline whichever script ran the update. Only what's missing; nothing is replaced.
async function fillMissing() {
  try {
    if (!(await caches.has(CACHE))) return;
    const c = await caches.open(CACHE);
    for (const f of FILES) if (!(await c.match(f))) { const r = await fetch(f, { cache: 'no-store' }); if (r.ok) await c.put(f, r); }
  } catch (err) {}
}

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
