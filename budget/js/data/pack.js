'use strict';
/* v311: the saved data stops growing. Once a day, on load, history from before a cutoff (the start of the day 60 days ago,
   and never inside this or last week, this or the last pay period, a week not settled yet or Round off) is folded:
   - each pot's and project's crew changes before then become a few that grow exactly the same money by then: a crew of
     m for a while, one villager for a moment, nobody for the last millisecond, then the crew it had after its last
     change, from that change on; the party's become one change;
   - its carried cents before then become one carried move to or from Savings, at the time of its last change.
   Moves you made, payments, treasure, postage, top-offs and the rest are kept as they are. From the cutoff on, every
   count and balance comes out the same: what money a day grew is the same number to the last bit (a place where it
   wouldn't be is left as it is), and the carried cents add up to the same sum. This needs goalHit to count only from
   a crew's last start (v311, A4/D2 in p_20): the folded stretch ends with nobody working, so it can't count as a goal
   reached. */
function packOld(now = Date.now()) {
  try {
    const td = ymd(new Date(now)); if (plan || state.needsSetup || !state.startMonth || state.packedOn === td || clockBack(now)) return false;
    const d = new Date(now), w0 = weekStart(d);
    let C = Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 60).getTime(), new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() - 7).getTime());
    for (const inc of state.incomes.filter(i => Number(i.amount) > 0)) {   // this pay period and the one before
      const p = prevPayday(inc, td), q = p && prevPayday(inc, ymdPlus(p, -1)); if (p) C = Math.min(C, q ? dayMs(q) : dayMs(p) - 62 * DAY_MS); }
    if (state.lastWeek) C = Math.min(C, dayMs(String(state.lastWeek)));   // a week partyReturns hasn't settled
    const R = state.roundOff; if (R) C = Math.min(C, Number(R.started), R.t0 != null ? Number(R.t0) : Infinity);
    if (!(C < now) || state.pots.some(p => workersAt(p.id, now) > 0 && goalHit(p.id, now) != null)) return false;   // and only once the first render has sent finished crews home
    // crew changes before the cutoff, per place (a place with anything unusual in its log is left as it is)
    const pots = new Set(state.pots.map(p => p.id)), wk = new Set(['t', 'pot', 'delta']), old = new Map(), bad = new Set();
    for (const w of state.workerLog) {
      if (!w || !Number.isFinite(w.t)) { bad.add(w && w.pot); continue; }
      if (!(w.t < C)) continue;
      if (!(w.pot === 'party' || pots.has(w.pot)) || !(w.t > 0) || !Number.isInteger(w.delta) || Object.keys(w).some(k => !wk.has(k))) { bad.add(w.pot); continue; }
      const o = old.get(w.pot) || { L: [], F: -Infinity, S: 0 }; o.L.push(w); o.F = Math.max(o.F, w.t); o.S += w.delta; old.set(w.pot, o);
    }
    for (const id of bad) old.delete(id);
    // grown()'s sum over a log, step by step as grown() adds it: villager-milliseconds, and the crew and time it ends on
    const run = E => { let n = 0, t = 0, ms = 0; for (const w of E) { ms += n * (w.t - t); t = w.t; n += w.delta; } return { n, t, ms }; };
    for (const [id, o] of [...old]) {
      o.E = [{ t: o.F, pot: id, delta: o.S }];
      if (id === 'party') continue;
      const M = run(o.L.slice().sort((x, y) => x.t - y.t)).ms, b = o.F - 1, t0 = Math.min(...o.L.map(w => w.t));
      if (M > 0) {   // m villagers for a, then one for r, so that m * a + r is the same number
        const m = Math.max(1, Math.ceil(M / Math.max(1, b - t0)));
        for (let g = 1 / 4096; g <= 1; g *= 2) {
          let a = Math.floor(M / m / g) * g, r = M - m * a; if (r < 0) { a -= g; r = M - m * a; }
          const t1 = b - r, E = [{ t: t1 - a, pot: id, delta: m }, ...(m > 1 ? [{ t: t1, pot: id, delta: 1 - m }] : []), { t: b, pot: id, delta: -1 }, o.E[0]], x = run(E);
          if (x.ms === M && x.n === o.S && x.t === o.F && E[0].t > 0 && a >= 0 && r >= 0 && E.every((w, i) => !i || w.t >= E[i - 1].t)) { o.E = E; break; }
        }
        if (o.E.length === 1) old.delete(id);   // it wouldn't come out the same to the last bit: left as it is
      } else if (M !== 0) old.delete(id);
    }
    // carried cents before then, between Savings and places folded here, no later than each place's last change
    const ck = new Set(['id', 'date', 'at', 'from', 'to', 'amount', 'carry', 'fold']), net = new Map();
    const isPot = x => x !== 'party' && old.has(x), end = (x, at) => x === 'savings' || (isPot(x) && at <= old.get(x).F);
    const folds = c => !!c && c.carry === true && Number.isFinite(c.at) && c.at < C && Number.isFinite(c.amount) && typeof c.date === 'string' && c.date === ymd(new Date(c.at))
      && c.from !== c.to && end(c.from, c.at) && end(c.to, c.at) && (isPot(c.from) || isPot(c.to)) && Object.keys(c).every(k => ck.has(k));
    let nc = 0;
    for (const c of state.transfers) if (folds(c)) { nc++; if (isPot(c.to)) net.set(c.to, (net.get(c.to) || 0) + c.amount); if (isPot(c.from)) net.set(c.from, (net.get(c.from) || 0) - c.amount); }
    if (![...net.values()].every(Number.isFinite)) return false;
    const recs = [];
    for (const [id, v] of net) if (v) { const F = old.get(id).F;
      recs.push({ date: ymd(new Date(F)), at: F, ...(v > 0 ? { from: 'savings', to: id, amount: v } : { from: id, to: 'savings', amount: -v }), carry: true, fold: true }); }
    const log = []; for (const o of old.values()) log.push(...o.E);
    if (sum([...old.values()], o => o.L.length) + nc - log.length - recs.length < 100) return false;   // not worth a rewrite yet
    log.push(...state.workerLog.filter(w => !(w && Number.isFinite(w.t) && w.t < C && old.has(w.pot))));
    state.workerLog = log; state.transfers = [...recs, ...state.transfers.filter(c => !folds(c))]; state.packedOn = td; save();
    return true;
  } catch (e) { return false; }
}
