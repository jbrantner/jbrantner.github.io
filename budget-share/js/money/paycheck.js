'use strict';
function fitCrews(V) {
  const now = stampNow(), cut = state.cutCrews = state.cutCrews || {}, cuts = [];
  let over = partyNow() + crewWorkers() - V;
  for (const mini of [true, false]) {
    if (over <= 0) break;
    const cs = state.pots.filter(p => (goalOf(p.id) > 0) === mini).map(p => ({ id: p.id, name: p.name, w: workersAt(p.id) })).filter(c => c.w > 0), tot = sum(cs, c => c.w), take = Math.min(over, tot);
    if (!take) continue;
    const keepAll = tot - take, keep = cs.map(c => ({ ...c, k: Math.floor(c.w * keepAll / tot + 1e-9), f: c.w * keepAll / tot % 1 }));
    let spare = keepAll - sum(keep, c => c.k);
    for (const c of [...keep].sort((a, b) => b.f - a.f)) { if (spare <= 0) break; c.k++; spare--; }
    for (const c of keep) if (c.k < c.w) { reassign(now, { [c.id]: c.k - c.w }); cut[c.id] = (cut[c.id] || 0) + c.w - c.k; cuts.push({ id: c.id, name: c.name, from: c.w, to: c.k }); }
    over -= take;
  }
  let party = null; const plan = Number(state.partyPlan || 0), room = Math.max(0, V - crewWorkers());
  if (plan > room) { party = { from: plan, to: room, now: partyNow() }; cut.party = (cut.party || 0) + plan - room; state.partyPlan = room; }
  return { cuts, party };
}
function restoreCrews(V) {
  const cut = state.cutCrews || {}, now = stampNow(), back = []; let party = null;
  let room = V - Math.max(partyNow(), Number(state.partyPlan || 0)) - crewWorkers();
  if (cut.party > 0 && V - crewWorkers() > Number(state.partyPlan || 0)) {   // the party first, from next Monday
    const plan = Number(state.partyPlan || 0), to = Math.min(plan + cut.party, V - crewWorkers()), give = to - plan;
    if (give > 0) { party = { from: plan, to }; state.partyPlan = to; cut.party -= give; room = V - Math.max(partyNow(), to) - crewWorkers(); }
  }
  for (const mini of [false, true]) for (const p of state.pots.filter(p => (goalOf(p.id) > 0) === mini && cut[p.id] > 0)) {
    const done = goalOf(p.id) > 0 && projectBal(p.id) >= goalOf(p.id) - 0.005, give = done ? 0 : Math.min(cut[p.id], Math.max(0, room));
    if (done) { delete cut[p.id]; continue; }
    if (give > 0) { const w = workersAt(p.id); reassign(now, { [p.id]: give }); cut[p.id] -= give; room -= give; back.push({ id: p.id, name: p.name, from: w, to: w + give }); }
  }
  for (const k of Object.keys(cut)) if (!(cut[k] > 0) || (k !== 'party' && !state.pots.some(p => p.id === k))) delete cut[k];
  return { back, party };
}
// The villagers of the last normal paycheck before a payday (an extra paycheck in between doesn't count).
function villagersBefore(date) {
  let t = dayMs(date) - 1, prev = periodNow(t);
  for (let k = 0; k < 4 && prev.list.length && prev.list.every(x => x.bonus && !x.start); k++) { t = Math.min(...prev.list.map(x => x.t0)) - 1; prev = periodNow(t); }
  return prev.V;
}
// After a paycheck is entered: fit the crews to its villagers (or bring back what a smaller one cut) and say so.
function afterCheck(key) {
  const [id, date] = splitKey(key), inc = state.incomes.find(i => i.id === id); if (!inc) return null;
  const pn = periodNow(), c = pn.list.find(x => x.key === key); if (!c) return null;   // an older paycheck: nothing to fit
  const before = villagersBefore(date), V = pn.V;
  if (state.roundOff) { roundOffTick(); state.payNews = { key, date, next: c.next, from: before, to: V, extra: !!c.bonus, cuts: [], back: [], party: null, at: Date.now(), seen: false }; return state.payNews; }   // v131: Round off places everyone; crews come back at its end
  const fit = partyNow() + crewWorkers() > V || Number(state.partyPlan || 0) > Math.max(0, V - crewWorkers()) ? fitCrews(V) : { cuts: [], party: null };
  const rest = fit.cuts.length || fit.party ? { back: [], party: null } : restoreCrews(V);
  state.payNews = { key, date, next: c.next, from: before, to: V, extra: !!c.bonus, cuts: fit.cuts, party: fit.party || rest.party, back: rest.back, at: Date.now(), seen: false };
  return state.payNews;
}
/* v192: the next paycheck: one entered ahead (expected) or the next payday not entered yet, and its villagers */
function nextPayNow(now = Date.now()) {
  const td = ymd(new Date(now)); let best = null;
  for (const inc of state.incomes.filter(i => Number(i.amount) > 0)) {
    const d = nextPayday(inc, td); if (!d) continue; const key = checkKey(inc, d), ck = (state.checks || {})[key];
    if (ck && Number(ck.at) <= now) continue;
    const P = periodOf(inc, d), D = ck ? Math.max(0, Number(ck.amt) || 0) : 0, F = Math.max(0, Math.floor(D + 1e-9) - shareOf(inc, d));
    const o = { key, inc, date: d, entered: !!ck, D, F, V: ck ? Math.floor(F / P.days / WORKER_DAY + 1e-9) : 0, days: P.days };
    if (!best || d < best.date) best = o;
  }
  return best;
}
// v131: the check "I got paid" means for an income: the payday waiting for it, or the next one not entered yet
function payKeyFor(inc, td = today()) {
  const w = paydaysWaiting(td).find(x => x.inc.id === inc.id); if (w) return w.key;
  let d = td;
  for (let k = 0; k < 8; k++) { d = nextPayday(inc, d); if (!d) return null; const key = checkKey(inc, d); if (!(state.checks || {})[key]) return key; }
  return null;
}
// v132: extra money. mode 'place' (to: an id), 'even' or 'villagers'. What would happen, without doing it.
function extraPlan(amt, mode, to, now = Date.now()) {
  amt = cents(Number(amt) || 0); const out = { amt, mode, moves: [], V: 0, t1: 0, next: null, rest: amt };
  const room = id => { const g = goalOf(id); return g > 0 ? Math.max(0, Math.floor((g - projectBal(id, now)) * 100 + 1e-6) / 100) : Infinity; };
  const nm = id => (state.pots.find(p => p.id === id) || { name: 'Savings' }).name;
  if (mode === 'place' && to && to !== 'savings' && state.pots.some(p => p.id === to)) { const a = Math.min(amt, room(to)); if (a > 0) out.moves.push({ id: to, name: nm(to), a }); }
  if (mode === 'even') for (const x of changeSplit(Math.round(amt * 100))) if (x.id !== 'savings' && state.pots.some(p => p.id === x.id)) out.moves.push({ id: x.id, name: x.name, a: x.got / 100 });   // as Collect splits
  out.rest = cents(amt - sum(out.moves, m => m.a));
  if (mode === 'villagers') {
    const inc = mainIncome(); let nx = inc && Number(inc.amount) > 0 ? nextPayday(inc, ymd(new Date(now))) : null;
    if (nx && dayMs(nx) - now < DAY_MS) nx = nextPayday(inc, nx) || nx;   // v311: under a day to payday: until the one after
    out.next = nx; out.t1 = nx ? dayMs(nx) : now + 14 * DAY_MS;
    const days = (out.t1 - now) / DAY_MS; out.V = days > 0 ? Math.floor(amt / days / WORKER_DAY + 1e-9) : 0;
    out.rest = cents(amt - out.V * days * WORKER_DAY); out.days = days;
  }
  const mx = n => moneyExact(n).replace(/\.00$/, '');
  out.text = mode === 'villagers' ? (out.V ? `${money(out.V * WORKER_DAY)} a day extra until ${out.next ? shortDate(out.next) : 'two weeks from now'} (${out.days.toFixed(1)} days)${out.rest >= 0.005 ? `, and ${mx(out.rest)} to Savings now` : ''}.` : `Not enough for $1 a day until ${out.next ? shortDate(out.next) : 'payday'}: all ${mx(amt)} goes to Savings now.`)
    : out.moves.length ? out.moves.map(m => `${mx(m.a)} to ${m.name}`).join(', ') + (out.rest >= 0.005 ? `, ${mx(out.rest)} to Savings` : '') + '.'
    : `${mx(amt)} to Savings.`;
  return out;
}
