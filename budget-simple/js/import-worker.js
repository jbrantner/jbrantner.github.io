'use strict';
/* Reads a backup exported from the main budget app (budget/) and works out where its money is today, with the main
   app's own math: its files are loaded from /budget/js/ (always the live version). It runs in a worker, which has no
   page and no saved data, so nothing here can touch either app's storage: the main app's scripts get an empty,
   in-memory stand-in for localStorage and a page that has nothing on it. */
const mem = {};
self.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, clear: () => {} };
const none = () => null, cl = { contains: () => false, add() {}, remove() {}, toggle() {} };
self.document = { querySelector: none, querySelectorAll: () => [], getElementById: none, addEventListener() {}, body: null, documentElement: { classList: cl, style: { setProperty() {} }, dataset: {} } };
self.window = self; self.matchMedia = () => ({ matches: false, addEventListener() {} });
const FILES = ['core/app', 'core/util', 'core/dates', 'core/format', 'core/dom', 'data/clock', 'data/transactions', 'data/pack',
  'money/paydays', 'money/plan', 'money/bills', 'money/hold', 'money/books', 'money/villagers', 'money/goals', 'money/week', 'money/categories', 'money/debts', 'money/paycheck', 'money/autopay',
  'app/planning', 'app/crews', 'app/roundoff', 'app/extra', 'app/spare', 'app/topoff', 'app/postage', 'app/payments', 'app/pots', 'app/schedule', 'data/state'];
let ready = null;
function boot() {
  if (ready) return ready;
  const v = Date.now();
  ready = Promise.all(FILES.map(f => fetch(`../../budget/js/${f}.js?v=${v}`, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.text(); })))
    .then(srcs => { (0, eval)(srcs.join('\n;\n') + '\n;self.__main = { load: s => { state = tidy(s); try { debtTick(); } catch (e) {} }, goal: id => goalOf(id), minFor: (d, o) => debtMinFor(d, o), pots: () => potBalances(today().slice(0, 7)), paid: () => paidMap(today()), month: () => today().slice(0, 7), st: () => state };'); });
  return ready;
}
self.onmessage = async e => {
  try {
    await boot();
    const M = self.__main, src = e.data;
    if (!src || src.version !== 2 || !Array.isArray(src.transactions)) throw new Error('not a main-app backup');
    M.load(JSON.parse(JSON.stringify(src)));
    const st = M.st(), cur = M.month(), P = M.paid(), pots = M.pots(), byId = Object.fromEntries(pots.map(p => [p.id, p]));
    const c = n => Math.max(0, Math.round((Number(n) || 0) * 100)), neg = [];
    const bal = id => { const b = byId[id] ? Number(byId[id].bal) || 0 : 0; if (b < -0.004) neg.push(byId[id].name); return c(b); };
    const week = bal('spend'), free = bal('savings') + bal('scavenger');
    const goals = st.goals || {}, debts = st.debts || {};
    const out = { v: 1, free, bills: bal('bills'), pots: [], billList: [], paid: {}, log: [], adv: null };
    if (week > 0) out.pots.push({ id: 'week', name: "This week's money", kind: 'pot', goal: 0, bal: week, debt: null });   // the main app's weekly spending money, still to spend
    for (const p of st.pots || []) {
      if (['spend', 'bills', 'savings', 'scavenger'].includes(p.id)) continue;
      const d = debts[p.id], g = c(d ? M.goal(p.id) : goals[p.id]);
      if (d && d.done) continue;   // paid off there
      const debt = d ? { owed: g, start: Math.max(g, c(d.start)), apr: Number(d.apr) || 0, min: c(M.minFor(d, g / 100)), extra: 0 } : null;
      out.pots.push({ id: p.id, name: String(p.name || 'Pot'), kind: g > 0 && !d ? 'project' : 'pot', goal: d ? 0 : g, bal: bal(p.id), debt });
    }
    const paidNow = {};
    for (const b of (st.categories || []).filter(x => x.kind === 'bill')) {
      const amt = c(b.budget), due = b.dueDay >= 1 && b.dueDay <= 31 ? Math.round(b.dueDay) : null;
      out.billList.push({ id: b.id, name: String(b.name || 'Bill'), amt, due, debt: b.debtId && debts[b.debtId] ? b.debtId : null });
      const e = P[b.id + '|' + cur]; if (e && amt && c(e.P) >= amt - 50) paidNow[b.id] = c(e.P);
    }
    out.paid[cur] = paidNow;
    const inc = (st.incomes || []).filter(i => Number(i.amount) > 0 && [7, 14].includes(Number(i.every)) && /^\d{4}-\d\d-\d\d$/.test(i.anchor)).sort((a, b) => b.amount - a.amount)[0];
    if (inc) out.payday = { anchor: inc.anchor, every: Number(inc.every) };
    out.log.push({ t: Date.now(), type: 'in', amt: out.free + out.bills + out.pots.reduce((a, p) => a + p.bal, 0), from: null, to: null, note: 'Brought in from the main app' });
    self.postMessage({ ok: true, state: out, neg, month: cur });
  } catch (err) { self.postMessage({ ok: false, error: String(err && err.message || err) }); }
};
