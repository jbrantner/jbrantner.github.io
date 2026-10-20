'use strict';
const canFarm = id => id !== 'spend' && id !== 'bills' && id !== 'scavenger';
const farmPots = () => ['savings', ...state.pots.map(p => p.id)];
// Pots are storage (Savings and mini projects like a laptop). Each worker you put on one sends it $1 a day
// of Fun's share, but only as that pay gets collected from the income farms.
// v311: each pot's entries in time order with running totals, rebuilt when the log changes (render and save count as a change)
var logIx = null;
function logBy(pot) {
  const L = state.workerLog; let g = -1; try { g = booksGen; } catch (e) {}
  if (!logIx || logIx.log !== L || logIx.n !== L.length || logIx.g !== g || g < 0) {
    const by = new Map();
    for (const w of L) { let e = by.get(w.pot); if (!e) by.set(w.pot, e = { o: [] }); e.o.push(w); }
    for (const e of by.values()) {
      e.a = e.o.slice().sort((x, y) => x.t - y.t); e.int = e.o.every(w => Number.isInteger(w.delta) && typeof w.t === 'number' && w.t === w.t);
      e.ts = e.a.map(w => w.t); let c = 0; e.cs = e.a.map(w => (c += w.delta));
    }
    logIx = { log: L, n: L.length, g, by };
  }
  return logIx.by.get(pot);
}
const workersAt = (pot, t = Date.now()) => {
  const e = logBy(pot); if (!e) return 0;
  if (!e.int) return sum(e.o.filter(w => w.t <= t), w => w.delta);   // anything odd in the log: the plain way
  let lo = 0, hi = e.ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (e.ts[m] <= t) lo = m + 1; else hi = m; }
  return lo ? e.cs[lo - 1] : 0;
};
// Dollars of crops a farm grew between two moments (never past now).
function grown(pot, a, b) {
  b = Math.min(b, Date.now()); if (b <= a) return 0;
  let n = 0, t = a, total = 0;
  for (const w of (logBy(pot) || { a: [] }).a) {
    if (w.t <= a) { n += w.delta; continue; }
    if (w.t >= b) break;
    total += n * (w.t - t); t = w.t; n += w.delta;
  }
  return (total + n * (b - t)) / DAY_MS * WORKER_DAY;
}
// Workers only send what's been collected, so their clock runs to the share of the month you've collected.
// When you start using the app partway through a month, that month counts from the moment you started:
// you get the share of the month's pay-after-bills that's left (half the month left, half of it), and it
// gathers across the days that are left. Money from before you started is what you enter as savings.
const gatherStart = m => m === state.startMonth && state.startAt > monthStartMs(m) && state.startAt < monthEndMs(m) ? state.startAt : monthStartMs(m);
const monthLeftFrac = m => (monthEndMs(m) - gatherStart(m)) / (monthEndMs(m) - monthStartMs(m));
/* Villagers this pay period and the crews. When a smaller paycheck brings fewer villagers than are working, crews
   come off projects first (evenly, by size), then pots; the party is locked until Monday, so next week's party
   shrinks only if that still isn't enough. What was cut comes back when a later paycheck has room. */
/* v131: every crew change goes through reassign(t, deltas) (deltas: { potId: +n / -n }; Savings takes the difference).
   With carryCents on (the default), the villagers who leave a place take their share of its unfinished cent with them. */
const carryOn = () => state.carryCents !== false;
const subCent = b => { const c = b * 100, f = c - Math.floor(c + 1e-6); return f > 0 ? f / 100 : 0; };   // dollars below a whole cent
const placeBal = (id, t) => id === 'savings' ? (potBalances(today().slice(0, 7), t).find(p => p.id === 'savings') || { bal: 0 }).bal : projectBal(id, t);
const crewsAt = t => sum(state.pots, p => Math.max(0, workersAt(p.id, t)));
const placeCrew = (id, t) => id === 'savings' ? Math.max(0, maxWorkers(t) - crewsAt(t)) : Math.max(0, workersAt(id, t));   // whoever earns into it
function reassign(t, deltas, hand) {
  const d = {}; for (const [k, v] of Object.entries(deltas || {})) if (v && k !== 'savings' && k !== 'party' && k !== 'spend') d[k] = v;
  const ids = Object.keys(d); if (!ids.length) return [];
  const out = [];
  if (carryOn()) {
    const ds = -sum(ids, k => d[k]), all = ds ? { ...d, savings: ds } : { ...d };
    const gain = Object.entries(all).filter(([, v]) => v > 0), G = sum(gain, ([, v]) => v);
    if (G > 0) for (const [k, v] of Object.entries(all)) {
      if (v >= 0) continue; const n = placeCrew(k, t); if (!(n > 0)) continue;
      const amt = subCent(placeBal(k, t)) * Math.min(-v, n) / n; if (!(amt > 1e-12)) continue;
      for (const [g, gv] of gain) { const x = { date: ymd(new Date(t)), at: t, from: k, to: g, amount: amt * gv / G, carry: true }; state.transfers.push(x); out.push(x); }   // v311: no id (nothing looks a carry up by it)
    }
  }
  for (const k of ids) state.workerLog.push({ t, pot: k, delta: d[k] });
  return out;
}
const roBuilt = id => { const g = goalOf(id); return g > 0 && projectBal(id) >= g - 0.005; };   // a project at its goal
/* v131: locks, and + that evens villagers out */
const isLocked = id => id !== 'savings' && !!(state.locked || {})[id];
// v134: you pick where each villager comes from. The places that could give one to `to`, with how many are there.
function donorList(to) {
  return farmPots().filter(id => id !== to && canFarm(id)).map(id => ({ id, name: id === 'savings' ? 'Savings' : potName(id), n: id === 'savings' ? savers() : Math.max(0, workersAt(id)), lock: isLocked(id) }));
}
const crewBuilt = id => { const g = goalOf(id); return g > 0 && projectBal(id) >= g - 0.005; };
function canAdd(id) { return !(debtOf(id) || {}).done && !state.roundOff && !clockBack() && !isLocked(id) && !crewBuilt(id) && donorList(id).some(x => !x.lock && x.n > 0); }
let carts = [];                    // { from, to, amt, workers, t0 (ms since 1970), ms, side }  side = where it's headed
// Villagers your pay keeps busy: this pay period's paycheck after its bill share, $1 a day each until the next payday
// (v117). A payday waiting for its paycheck has none until you enter it.
const maxWorkers = (now = Date.now()) => periodNow(now).V;
const payWaiting = () => periodNow().waiting.length > 0;
const partyNow = (t = Date.now()) => Math.max(0, workersAt('party', t));
const crewWorkers = () => sum(farmPots().filter(id => id !== 'savings'), id => workersAt(id));
// villagers on Savings: everyone not out with the party or on a project crew
const savers = () => Math.max(0, maxWorkers() - partyNow() - crewWorkers());
// Villagers working beyond what your pay supports: Savings pays for them, a dollar a day each.
const overAssigned = () => payWaiting() ? 0 : Math.max(0, partyNow() + crewWorkers() - maxWorkers());
const funWorkers = () => partyNow();
const funPerDay = () => partyNow() * WORKER_DAY;
