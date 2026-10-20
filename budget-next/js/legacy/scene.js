'use strict';
function campaign(m, now = Date.now()) {
  const bills = state.categories.filter(c => c.kind === 'bill');
  const amt = c => Number(c.budget || 0);
  const order = [...bills].sort((a, b) => (dueDate(a, m) || '9').localeCompare(dueDate(b, m) || '9') || amt(a) - amt(b));
  // Bills the bank already paid sit out of the fight entirely. Ones you slew early stay in the
  // month's total but take no damage, so the sword gets ahead.
  const tx = state.transactions.filter(t => t.date.startsWith(m)), pays = c => tx.filter(t => t.categoryId === c.id);
  const outside = c => pays(c).length && !pays(c).every(t => t.gameSlain), early = c => pays(c).some(t => t.early);
  const t0 = monthStartMs(m), t1 = monthEndMs(m), rate = Math.max(1e-9, sum(bills.filter(c => !outside(c)), amt) / (t1 - t0));
  // The bills' share of each paycheck builds the projects as it's gathered; fun money you send rushes them.
  const rush = Number((state.rush || {})[m] || 0), gathered = rate * (t1 - t0) * collectedFrac(m);
  let D = gathered + rush;
  // Once every project is built, the bills' share keeps coming in with nothing to build, so the
  // fun money you rushed with flows back to Fun. By the month's end it's all back.
  const refund = Math.max(0, Math.min(rush, D - rate * (t1 - t0)));
  const out = {};
  for (const c of order) {
    if (outside(c)) { out[c.id] = { paid: true }; continue; }
    // slain early: it keeps the damage it had taken by then, and the rest flows on
    if (early(c)) { const took = Math.min(D, sum(pays(c), t => t.dealt || 0)); D -= took; out[c.id] = { paid: true }; continue; }
    const hit = Math.min(D, amt(c)); D -= hit;
    out[c.id] = { dealt: hit, left: amt(c) - hit };
  }
  return { order, out, rate, rush, refund, gathered };
}

/* ---------- carts ----------
   The old farms sent money and workers between pots by cart. Trips are saved with the clock time they set off, so
   one that "arrives" while the app is closed is delivered the next time it opens. Nothing starts a trip any more;
   this delivers any an older copy left on the road. */
const incoming = {};               // potId -> { total, arrived, clearAt }
const CART_MS = 1700;
let sceneRaf = null;

const tripMs = c => c.ms || CART_MS;
// Workers change farms the moment they arrive, which may have been while the app was closed.
function moveWorkers(from, to, n, t) {
  const d = {}; if (from !== 'spend') d[from] = -n; if (to !== 'spend') d[to] = (d[to] || 0) + n;
  reassign(t, d);
}

function startScene() { if (!sceneRaf) sceneRaf = requestAnimationFrame(tickScene); }
function tickScene() {
  sceneRaf = null;
  const now = Date.now();
  const landed = carts.filter(c => now - c.t0 >= tripMs(c));
  if (landed.length) {
    carts = carts.filter(c => now - c.t0 < tripMs(c)); state.carts = carts;
    for (const c of landed) {
      if (c.workers) moveWorkers(c.from, c.to, c.workers, c.t0 + tripMs(c));
      if (c.amt) commitMove(c.from, c.to, c.amt); else { save(); render(); }
      const inc = incoming[c.to]; if (inc && c.amt) { inc.arrived += c.amt; if (inc.arrived >= inc.total) inc.clearAt = now + 1200; }
    }
  }
  for (const [id, inc] of Object.entries(incoming)) if (inc.clearAt && now > inc.clearAt) delete incoming[id];
  if (carts.length || Object.keys(incoming).length) startScene();
}
// A bill's building with its crew around it (up to four shown, then a count); they cheer once it's paid.
const BLDG = { 'Homestead': 'homestead', 'Signal tower': 'signal', 'Message post': 'message', 'Generator': 'generator', 'Water wheel': 'waterwheel', 'Wagon works': 'wagon',
  'Music box': 'musicbox', 'Cloud lantern': 'cloud', 'Thinking engine': 'thinking', 'Picture box': 'picture', 'Training yard': 'training', 'Counting house': 'counting' };
const bldgOf = c => 'bldg-' + (BLDG[machineName(c)] || buildOf(c).name.toLowerCase());
