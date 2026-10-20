'use strict';
// A goal can be set in months of bills ("3 months of bills saved up"). It follows the bills, so
// changing a bill changes the goal.
const goalMonthsOf = id => Number((state.goalMonths || {})[id] || 0);
function goalOf(id) {
  const n = goalMonthsOf(id);
  return n > 0 ? Math.ceil(n * billsMonthly() - 1e-9) : Number(state.goals[id] || 0);
}
// A project's money: what was moved in or out, plus what its crew has built.
const projectBal = (id, now = Date.now()) => moved(id, ymd(new Date(now)), now) + grown(id, 0, now);
// When a project's crew finished its goal: the first moment its money reached the goal while the crew
// was working, or null if it hasn't yet.
function goalHit(id, now = Date.now()) {
  const goal = goalOf(id); if (!(goal > 0)) return null;
  const ev = [...state.workerLog.filter(w => w.pot === id).map(w => ({ t: w.t, w: w.delta })),
    ...state.transfers.filter(t => t.to === id || t.from === id).map(t => ({ t: t.at != null ? t.at : dayMs(t.date), d: (t.to === id ? t.amount : 0) - (t.from === id ? t.amount : 0) }))]
    .filter(e => e.t <= now).sort((a, b) => a.t - b.t);
  let from = Number((state.goalAt || {})[id]) || 0, c = 0;   // v311: since the goal was set or lowered, and since the crew last started
  for (const e of ev) if (e.w) { if (c <= 0 && c + e.w > 0) from = Math.max(from, e.t); c += e.w; }
  let bal = 0, n = 0, t = ev.length ? ev[0].t : now; const all = [...ev, { t: now, end: true }];
  for (let i = 0; i < all.length; i++) { const e = all[i];
    if (n > 0 && e.t > t) {
      const rate = n * WORKER_DAY / DAY_MS, s = Math.max(t, from);
      if (s < e.t) { const reach = s + Math.max(0, goal - bal - rate * (s - t)) / rate; if (reach <= e.t) return reach; }
      bal += rate * (e.t - t);
    }
    t = Math.max(t, e.t);
    if (e.end) return n > 0 && t >= from && bal >= goal - 1e-9 ? t : null;
    if (e.w) n += e.w; if (e.d) bal += e.d;
    if (n > 0 && t >= from && bal >= goal - 1e-9 && (all[i + 1].end || all[i + 1].t > t)) return t;   // after everything at that moment
  }
  return null;
}
// A crew that finishes its project goes home the moment it's done; the money it would have built stays
// in Savings, and the villagers are free for other work.
function finishGoals(now = Date.now()) {
  let changed = false;
  { const seen = state.goalSeen, gs = {};   // v311: a goal set or lowered counts from now (see goalHit)
    for (const p of state.pots) { const g = goalOf(p.id); gs[p.id] = g; if (seen && g > 0 && (!(seen[p.id] > 0) || g < seen[p.id] - 0.004)) (state.goalAt = state.goalAt || {})[p.id] = now; }
    if (state.goalAt) for (const id of Object.keys(state.goalAt)) if (!(id in gs)) delete state.goalAt[id];
    if (JSON.stringify(gs) !== JSON.stringify(seen)) { state.goalSeen = gs; changed = true; } }
  for (const p of state.pots) {
    const w = workersAt(p.id, now); if (w <= 0) continue;
    const t0 = goalHit(p.id, now); if (t0 == null) continue;
    const t = state.workerLog.reduce((m, x) => x.pot === p.id && x.t <= now ? Math.max(m, x.t) : m, t0);   // never before its last move
    const there = workersAt(p.id, t); if (there <= 0) continue;
    reassign(t, { [p.id]: -there });   // v129: at the moment it hit (exact), carrying any part of a cent
    if (!debtOf(p.id)) (state.built = state.built || {})[p.id] = { t: Math.round(t), seen: false };   // v295: a debt isn't built
    changed = true;
  }
  if (changed) save();
}
const paidOff = id => !!(state.paidOff || {})[id];
