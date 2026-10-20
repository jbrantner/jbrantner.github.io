'use strict';
/* Round everything off. state.roundOff = { saved: { potId: crew }, started, cur, goal, t0 }. */
let roTimer = null, roNext = Infinity;
const roFree = t => Math.max(0, maxWorkers(t) - partyNow(t));
const roWhole = b => Math.abs(b - Math.round(b)) < 1e-7;
const roName = id => id === 'savings' ? 'Savings' : ((state.pots.find(p => p.id === id) || {}).name || 'a pot');
const roRate = (id, t) => placeCrew(id, t) * WORKER_DAY / DAY_MS;
// the next place to round: the pot or project closest to its next whole dollar, then Savings, then none
function roPick(t) {
  const ps = state.pots.filter(p => !roBuilt(p.id) && !isLocked(p.id)).map(p => ({ id: p.id, b: projectBal(p.id, t) })).filter(x => !roWhole(x.b))
    .sort((a, b) => (Math.ceil(a.b) - a.b) - (Math.ceil(b.b) - b.b));
  if (ps.length) return ps[0].id;
  return roWhole(placeBal('savings', t)) ? null : 'savings';
}
function roAssign(id, t) {   // everyone free on one place (on Savings: every crew off)
  const F = Math.max(0, roFree(t) - sum(state.pots.filter(p => isLocked(p.id)), p => Math.max(0, workersAt(p.id, t)))), d = {};   // locked crews stay
  for (const p of state.pots) { if (isLocked(p.id)) continue; const want = p.id === id ? F : 0, have = workersAt(p.id, t); if (want !== have) d[p.id] = want - have; }
  return reassign(t, d);
}
// the first moment in [t0, now] the place's balance reached the goal, or null (balances only rise while it's filling)
function roHit(id, goal, t0, now) {
  const ok = t => placeBal(id, t) >= goal;
  if (!ok(now)) return null; if (ok(t0)) return t0;
  let lo = t0, hi = now;
  for (let k = 0; k < 90; k++) { const m = (lo + hi) / 2; if (!(m > lo && m < hi)) break; if (ok(m)) hi = m; else lo = m; }
  return hi;
}
function roRestore(t) {
  const R = state.roundOff || { saved: {} }, F = roFree(t), want = {}, d = {};
  for (const p of state.pots) want[p.id] = isLocked(p.id) ? Math.max(0, workersAt(p.id, t)) : roBuilt(p.id) ? 0 : Math.max(0, Number((R.saved || {})[p.id] || 0));
  let over = sum(Object.values(want), x => x) - F;   // only if a smaller paycheck came in meanwhile
  while (over > 0) { const k = Object.keys(want).sort((a, b) => want[b] - want[a])[0]; if (!want[k]) break; want[k]--; over--; }
  for (const p of state.pots) { const have = workersAt(p.id, t); if (want[p.id] !== have) d[p.id] = want[p.id] - have; }
  reassign(t, d);
}
// Bring the mode up to now: each place that reached its dollar hands the crew on at that exact moment (even while the
// app was closed); a paycheck or the party changing how many are free keeps everyone free on the current place.
function roundOffTick(now = Date.now()) {
  const R = state.roundOff; if (!R) return false;
  if (clockBack(now)) return false;   // v137: Round off waits for the clock too
  let changed = false, t = now;
  for (let k = 0; k < 60 && state.roundOff; k++) {
    if (R.cur && R.cur !== 'savings' && (!state.pots.some(p => p.id === R.cur) || isLocked(R.cur))) R.cur = null;
    if (R.cur) {
      const h = roHit(R.cur, R.goal, R.t0, now);
      if (h == null) { if (!payWaiting()) { const n = state.workerLog.length; roAssign(R.cur, now); if (state.workerLog.length !== n) changed = true; } break; }   // a payday waiting leaves crews as they are, as always
      t = h;
      (R.log = R.log || []).push({ id: R.cur, t: h, goal: R.goal });
      if (R.cur !== 'savings') { const g = goalOf(R.cur); if (g > 0 && projectBal(R.cur, h) >= g - 1e-7) (state.built = state.built || {})[R.cur] = { t: Math.round(h), seen: false }; }
      R.cur = null; changed = true;
    }
    const id = roPick(t);
    if (!id) { roRestore(t); state.roundNews = { at: t, log: R.log || [], seen: false }; state.roundOff = null; changed = true; toast('All rounded off ✓ everything is back to normal'); break; }
    roAssign(id, t); changed = true;
    const b = placeBal(id, t); if (roWhole(b)) continue;   // the cents carried in made it whole already
    const g = id === 'savings' ? 0 : goalOf(id);
    R.cur = id; R.t0 = t; R.goal = Math.floor(b + 1e-9) + 1; if (g > 0 && g < R.goal) R.goal = g;
  }
  if (changed) save();
  clearTimeout(roTimer); roNext = Infinity;
  const Q = state.roundOff;
  if (Q && Q.cur) { const r = roRate(Q.cur, now); if (r > 0) { roNext = Math.max(now + 200, now + Math.max(0, Q.goal - placeBal(Q.cur, now)) / r);
    roTimer = setTimeout(() => { if (state.roundOff) render(); }, roNext - now + 5); } }
  return changed;
}
function roundOffStart() {
  if (state.roundOff) return false;
  if (clockHold()) return false;   // v137
  const now = Date.now();
  if (payWaiting()) { toast('Enter your paycheck first, so its money is coming in'); return false; }
  if (!(roFree(now) > 0)) { toast('Nobody is free to round off right now'); return false; }
  if (!roPick(now)) { toast('Everything is on a whole dollar already'); return false; }
  state.roundOff = { saved: Object.fromEntries(state.pots.map(p => [p.id, Math.max(0, workersAt(p.id, now))])), started: now, cur: null, log: [] };
  roundOffTick(now); save(); render();
  if (state.roundOff) toast('Rounding off: everyone helps one place at a time to its next whole dollar');
  return true;
}
function roundOffStop() {
  if (!state.roundOff) return false;
  const now = Date.now(); roundOffTick(now);
  if (state.roundOff) { roRestore(now); state.roundOff = null; toast('Stopped rounding off. Everything is back to normal'); }
  clearTimeout(roTimer); roNext = Infinity; save(); render(); return true;
}
function roundOffLine(now = Date.now()) {
  const R = state.roundOff; if (!R) return '';
  if (!R.cur) return 'Rounding off';
  const b = placeBal(R.cur, now), r = roRate(R.cur, now), c = Math.floor(subDollar(b) * 100 + 1e-6);
  if (!(r > 0)) return `Rounding off · ${esc(roName(R.cur))} ${c}¢ → ${money(R.goal)} · waiting for room in your pay`;
  const mins = Math.max(1, Math.ceil(Math.max(0, R.goal - b) / r / 60000));
  return `Rounding off · ${esc(roName(R.cur))} ${c}¢ → ${money(R.goal)} in ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}`;
}
const subDollar = b => { const f = b - Math.floor(b + 1e-9); return f > 0 ? f : 0; };
