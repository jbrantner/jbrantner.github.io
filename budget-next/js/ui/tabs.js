'use strict';
// Sizes for chasing the iPhone jump: the phone's screen, the page's window, the visible part, and the top inset.
// v140: the Upkeep tab. Its page is fetched and shown with srcdoc (see tabs.py); it keeps its own storage (upkeep.v1).
const themeOf = () => state.theme === 'device' ? '' : (state.theme || 'dark');   // v149: '' (the default) is Dark
function upkeepTheme() { try { const d = $('upkeepFrame').contentDocument; if (d && d.documentElement) { const th = themeOf(); if (th) d.documentElement.dataset.theme = th; else delete d.documentElement.dataset.theme;
  d.documentElement.classList.toggle('look-b', document.documentElement.classList.contains('look-b')); palRemap(d); } } catch (e) {} }   // v264: Upkeep follows the look
/* v286: the Pet tab. pet.html is fetched and shown with srcdoc like Upkeep (the service worker answers every page load
   with index.html), so it shares this page's storage; its scripts (pet-engine.js, pet-sprites.js, friends/) load from
   here. v288: the simple pet (Ember line, level + hunger + coins + food); demo controls only off the live site. Each time the tab shows, the pet catches up. */
function openPet() {
  const f = $('petFrame'); if (!f) return; petFeed();
  if (f.dataset.on) { try { f.contentDocument.dispatchEvent(new Event('visibilitychange')); } catch (e) {} return; }
  f.dataset.on = '1';
  fetch('pet.html', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(t => { f.srcdoc = /jbrantner\.github\.io$/.test(location.hostname) ? t.replace(/const DEMO=[^;]*;/, 'const DEMO=false;') : t; }).catch(() => {   // v289: no demo controls on the live site
      delete f.dataset.on; f.srcdoc = '<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;padding:32px 20px;color:#ffd3cd;background:transparent">The pet needs a connection the first time it opens. Try again when you\'re online.</body>';
    });
}
/* v286: the budget feed for the pet (localStorage budget-pet.v1, pet-game/HOOKS.md). Read-only for the money: it only
   writes this one key. Days of this week (today too: the pet only pays a day once it's over), this week's purse, paydays,
   bills marked paid and spare change collected, goals, and Savings in days of pay. Written on load and after saves. */
const PET_KEY = 'budget-pet.v1';
function petFeed() {
  if (CHANNEL !== 'main' || plan) return;   // v311
  try {
    let old = {}; try { old = JSON.parse(localStorage.getItem(PET_KEY) || '{}') || {}; } catch (e) {}
    const now = Date.now(), cut = ymd(new Date(now - 60 * DAY_MS)), w0 = weekStart(new Date(now)), wk = ymd(w0);
    const days = {}; for (const [k, v] of Object.entries(old.days || {})) if (k >= cut) days[k] = v;
    const L = catWeekNow(now), ps = state.packs || [];
    for (let dd = 0; dd <= L.d; dd++) {
      const X = dd === L.d ? L : catWeekNow(now, null, dd), date = ymd(new Date(w0.getTime() + dd * DAY_MS + 12 * 3600e3));
      const e = { left: sum(X.daily, x => Math.max(0, x.today)), start: sum(X.daily, x => x.start) };
      if (ps.length) { const used = new Set(weekSpends().filter(t => t.date === date).map(t => t.pack || ''));
        e.untouched = [...new Set(ps.filter(p => !used.has(p.id)).map(p => catSymOf(p)).concat(used.has('') ? [] : ['any']))]; }
      if (e.start > 0) days[date] = e;
    }
    const weeks = {}; for (const [k, v] of Object.entries(old.weeks || {})) if (k >= cut) weeks[k] = v;
    const pu = purseNow(now); if (pu.P > 0) weeks[wk] = { left: Math.round(pu.purseLeft * 100), start: Math.round(pu.P * 100) };
    const at9 = d => dayMs(d) + 9 * 3600e3, events = [];
    for (const [k, c] of Object.entries(state.checks || {})) { const [, d] = splitKey(k); if (d) events.push({ id: 'pay-' + k, t: Number(c && c.at) || at9(d), type: 'payday' }); }
    for (const t of state.transactions) if ((t.markedPaid || t.gameSlain) && !t.before && t.at) {
      const c = state.categories.find(x => x.id === t.categoryId); events.push({ id: 'bill-' + t.id, t: t.at, type: 'bill', name: c ? c.name : '' }); }
    const got = {}; for (const t of state.transfers) if (t.collect && !got[t.collect]) got[t.collect] = t.at || at9(t.date) + 3 * 3600e3;
    for (const [g, t] of Object.entries(got)) events.push({ id: 'cents-' + g, t, type: 'cents' });
    events.sort((a, b) => a.t - b.t);
    const ids = [...new Set([...(state.pots || []).map(x => x.id), ...Object.keys(state.goals || {})])].filter(id => !['savings', 'bills', 'scavenger', 'spend'].includes(id));
    const projects = ids.map(id => ({ id, g: goalOf(id) })).filter(x => x.g > 0).map(x => ({ id: x.id, name: potName(x.id), pct: Math.max(0, Math.min(1, projectBal(x.id) / x.g)) }));
    const inc = mainIncome(), every = inc ? (inc.every === 'twice' ? 365 / 24 : Number(inc.every) > 0 ? Number(inc.every) : 365 / 12) : 0;
    const perDay = inc && Number(inc.amount) > 0 ? Number(inc.amount) / every : 0, sv = (potBalances(month).find(x => x.id === 'savings') || { bal: 0 }).bal;
    const feed = { days, weeks, events: events.slice(-50), projects };
    if (perDay > 0) feed.savingsDays = Math.round(sv / perDay * 10) / 10;
    localStorage.setItem(PET_KEY, JSON.stringify(feed));
  } catch (e) {}
}
let petFeedT = 0;
const petFeedSoon = () => { clearTimeout(petFeedT); petFeedT = setTimeout(petFeed, 400); };
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
