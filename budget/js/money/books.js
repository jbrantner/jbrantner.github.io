'use strict';
// What a transaction counts as in the pots: always whole dollars. Spending rounds up (the cents go to spare change);
// refunds round down. Paychecks aren't rounded (income comes from the monthly plan).
function charged(t) {
  if (t.amount < 0) return Math.ceil(cents(-t.amount));   // v311: always up (rounding down was never offered)
  return t.categoryId ? -Math.floor(cents(t.amount)) : 0;
}
const scavCut = t => (t.amount > 0 && !t.categoryId) ? 0 : cents(Math.abs(Math.abs(charged(t)) - Math.abs(t.amount)));
// The books up to a day, kept until something changes (every save and every render starts them afresh).
let booksGen = 0, payKey = null, bankOpen = false, bankPick = {};
const booksMemo = new Map();
function ledgerAt(td) {
  const k = booksGen + '|' + td; let L = booksMemo.get(k); if (L) return L;
  const d0 = d0Of(), tr = state.transfers.filter(t => t.date <= td), adj = (state.adjusts || []).filter(a => a.date <= td);
  const sp = state.transactions.filter(t => t.date >= d0 && t.date <= td && !t.categoryId && t.amount < 0);
  L = { ...billBooks(td),
    head: sum(tr.filter(t => t.from === 'start' && !OUTSIDE(t.to)), t => t.amount),
    bills: sum(tr, t => (t.from === 'bills' && !OUTSIDE(t.to) ? t.amount : 0) - (!OUTSIDE(t.from) && OUTSIDE(t.to) ? t.amount : 0)),
    movedBills: moved('bills', td), spent: sum(sp, t => charged(t)), spendCut: sum(sp, scavCut),
    debt: sum(tr.filter(t => t.to === 'debt'), t => t.amount),   // v147: payments out of projects
    fix: sum(adj, a => Math.floor(a.amount + 1e-9)), adjCut: sum(adj, a => cents(a.amount - Math.floor(a.amount + 1e-9))) };
  // the bills the held money covers right now (the earliest unpaid ones)
  Object.defineProperty(L, 'heldList', { get: () => needAt(td, td === today() ? Date.now() : dayMs(td) + DAY_MS - 1).heldList });
  if (booksMemo.size > 80) booksMemo.clear();
  booksMemo.set(k, L); return L;
}
// Paychecks you've entered, up to a moment: the bill share is held at once, and the rest (F) comes in at V dollars a
// day from the payday to the next one, plus the odd dollars on that next payday. A paycheck smaller than its bill
// share holds all of it, and Savings makes up the difference (top) so the bills stay covered.
function checkFlows(now) {
  const out = { list: [], whole: 0, cut: 0, got: 0, pending: 0, top: 0, D: 0, wait: 0 };
  for (const [key, ck] of Object.entries(state.checks || {})) {
    const [id, date] = splitKey(key), at = Number(ck.at); if (!(at <= now)) continue;   // v131: entered early, it counts from when it landed
    const inc = state.incomes.find(i => i.id === id), D = Math.max(0, Number(ck.amt) || 0), whole = Math.floor(D + 1e-9), cut = cents(D - whole);
    const share = shareOf(inc, date), F = Math.max(0, whole - share), top = Math.max(0, share - whole), P = periodOf(inc, date);
    const V = Math.floor(F / P.days / WORKER_DAY + 1e-9), extra = F - V * P.days * WORKER_DAY;
    const got = V * P.days * WORKER_DAY * clamp01((now - P.t0) / (P.t1 - P.t0)) + (now >= P.t1 ? extra : 0);
    const wait = Math.min(D, Math.max(0, cents(Number(ck.wait) || 0)));   // v322: part of it not in the bank yet (an advance, a split deposit)
    out.whole += whole; out.cut += cut; out.got += got; out.pending += F - got; out.top += top; out.D += D; out.wait += wait;
    out.list.push({ key, inc, date, D, whole, cut, share, F, top, V, extra, got, pending: F - got, ...P, at, wait, bonus: isExtraCheck(inc, date) });
  }
  out.list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
// The paycheck before you started (its normal amount) is in your starting balance. Its free part works from the day
// you started to the next payday, V a day as usual: never more than your balance has after the bills' hold.
function startFlows(now) {
  const out = { list: [], got: 0, pending: 0 }, d0 = startDay(); if (!d0 || !state.startAt) return out;
  const fixes = sum((state.adjusts || []).filter(a => a.date <= ymd(new Date(now))), a => Math.floor(Number(a.amount) + 1e-9));   // v121: a bank fix counts as starting money too
  const main = mainIncome(); let avail = Math.max(0, Number(state.savings.start || 0) + fixes - startNeed());
  for (const inc of state.incomes.filter(i => Number(i.amount) > 0).sort((a, b) => (b === main) - (a === main))) {
    const p = prevPayday(inc, d0); if (!p) continue;
    const P = periodOf(inc, p), ds = dayMs(d0); if (P.t1 <= ds) continue;
    const share = shareOf(inc, p), F = Math.max(0, Math.floor(Number(inc.amount) + 1e-9) - share), left = Math.max(1, Math.round((P.t1 - ds) / DAY_MS));
    const full = Math.floor(F / P.days / WORKER_DAY + 1e-9), V = Math.max(0, Math.min(full, Math.floor(avail / left / WORKER_DAY + 1e-9)));
    avail -= V * left * WORKER_DAY;
    const total = V * left * WORKER_DAY, got = now < Number(state.startAt) ? 0 : total * clamp01((now - ds) / (P.t1 - ds));
    out.list.push({ key: checkKey(inc, p), inc, date: p, D: Number(inc.amount), share, F, V, full, left, total, got, pending: total - got, ...P, start: true, capped: V < full, bonus: isExtraCheck(inc, p) });
    out.got += got; out.pending += total - got;
  }
  return out;
}
// The pay period you're in, for each income: the paycheck working now (with its villagers), or a payday waiting for
// you to enter what landed (no villagers until you do).
function periodNow(now = Date.now()) {
  const td = ymd(new Date(now)), d0 = d0Of(), ck = checkFlows(now), st = startFlows(now), out = { V: 0, list: [], waiting: [] };
  for (const inc of state.incomes.filter(i => Number(i.amount) > 0)) {
    const p = prevPayday(inc, td); if (!p) continue;
    const c = p <= d0 ? st.list.find(x => x.inc.id === inc.id && x.date === p) : ck.list.find(x => x.inc && x.inc.id === inc.id && x.date === p);
    if (c) { out.list.push(c); out.V += c.V; } else if (p > d0) out.waiting.push({ inc, date: p, key: checkKey(inc, p) });
  }
  out.extraV = extraFlows(now).V; out.V += out.extraV;   // v131: extra money as villagers until the next payday
  return out;
}
// Everything at a moment: the bank (what you started with, plus paychecks, less bills and spending), the money held
// for bills, pay still coming in this pay period, and what's yours (total: Savings, the purse, pots, projects and
// spare change together). bank = held + Bills pot moves + still coming in + yours.
// v131: extra money: in the bank when it lands; as extra villagers it is still coming until the next payday.
function extraFlows(now = Date.now()) {
  const out = { bank: 0, pending: 0, V: 0, list: [] };
  for (const e of state.extras || []) {
    if (!(Number(e.at) <= now)) continue;
    out.bank += Number(e.amt) || 0; out.list.push(e);
    if (e.mode === 'villagers' && e.V > 0) {
      const day = WORKER_DAY / DAY_MS, total = e.V * Math.max(0, e.t1 - e.at) * day, got = e.V * Math.max(0, Math.min(now, e.t1) - e.at) * day;
      out.pending += total - got; if (now < e.t1) out.V += e.V;
    }
  }
  return out;
}
function hoardParts(now = Date.now()) {
  const ex = extraFlows(now), td = ymd(new Date(now)), L = ledgerAt(td), ck = checkFlows(now), st = startFlows(now), N = needAt(td, now), had = Number(state.savings.start || 0);
  const scav = cents(L.spendCut + L.cut + ck.cut + L.adjCut);
  const bank = had + L.head + L.bills + L.movedBills + L.fix + ck.whole - L.out - L.spent - L.debt + scav + ex.bank - ck.wait;   // v147: − debt payments; v322: − pay not landed yet
  const pending = ck.pending + st.pending + ex.pending, held = N.need, total = bank - held - L.movedBills - pending;
  return { had, head: L.head, bills: L.bills, fix: L.fix, pay: ck.whole, paid: ck.D, pending, wait: ck.wait, checks: ck, start: st, out: L.out, held, heldUntil: N.at, heldList: N.heldList,
    spent: L.spent, debt: L.debt, scav, total, bank, L, extra: ex };
}
// The pay line on the Party page: a payday waiting for its paycheck, the paycheck coming in, or the next payday.
function payNow(now = Date.now()) {
  const w = paydaysWaiting(ymd(new Date(now)))[0];
  if (w) return { frac: 0, text: `Payday ${shortDate(w.date)}: <button class="link" data-pay-open="${esc(w.key)}" style="padding:0; color:var(--accent); font-weight:600">enter your paycheck</button> to start its money coming in` };
  const pn = periodNow(now), live = pn.list.filter(c => c.V > 0 && now < c.t1);
  if (live.length) {
    const rate = sum(live, c => c.V * WORKER_DAY / DAY_MS), got = sum(live, c => c.got), frac = got - Math.floor(got), mins = Math.ceil((rate > 0 ? (1 - frac) / rate : 0) / 60000);
    return { frac, text: `${money((pn.V) * WORKER_DAY)} a day coming in · next ${money(1)} in ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`} · ${money(sum(live, c => c.pending))} more by ${shortDate(ymd(new Date(Math.max(...live.map(c => c.t1)))))}` };
  }
  const inc = mainIncome(), nx = inc && Number(inc.amount) > 0 ? nextPayday(inc, ymd(new Date(now))) : null;
  return { frac: 0, text: nx ? `Next payday ${shortDate(nx)}` : '' };
}
// Each income's paychecks right now, for its farm: what landed this month, the pay period's free part and what's
// still coming of it, its villagers, and whether a payday is waiting for its paycheck.
function farmPay(now = Date.now()) {
  const pp = hoardParts(now), td = ymd(new Date(now)), pn = periodNow(now), out = {};
  for (const i of state.incomes) out[i.id] = { inMonth: 0, pending: 0, pool: 0, g: 0, V: 0, waiting: false };
  for (const c of pp.checks.list) { const o = c.inc && out[c.inc.id]; if (!o) continue; if (c.date.startsWith(td.slice(0, 7))) o.inMonth += c.D; o.g += c.D; }
  for (const c of pn.list) { const o = out[c.inc.id]; if (o) { o.pending += c.pending; o.pool += c.start ? c.total : c.F; o.V += c.V; } }
  for (const w of paydaysWaiting(td)) if (out[w.inc.id]) out[w.inc.id].waiting = true;
  return out;
}
function monthNumbers(m) {
  const spentBy = {};
  let income = 0;
  for (const t of state.transactions.filter(t => (t.categoryId ? billMonthOf(t) : t.date.slice(0, 7)) === m)) {   // bill payments by the month they're for
    if (t.amount > 0 && !t.categoryId) income += t.amount;
    else spentBy[t.categoryId || ''] = (spentBy[t.categoryId || ''] || 0) + charged(t); // refunds into a category reduce it
  }
  const bills = state.categories.filter(c => c.kind === 'bill').sort((a, b) => (dueDate(a, m) || '9').localeCompare(dueDate(b, m) || '9'));
  const spends = state.categories.filter(c => c.kind !== 'bill');
  const billTotal = sum(bills, c => Number(c.budget || 0));
  const spendTotal = sum(spends, c => Number(c.budget || 0));
  const isPaid = c => (spentBy[c.id] || 0) > 0;
  const billsDue = sum(bills, c => isPaid(c) ? 0 : Number(c.budget || 0));
  const free = monthFree(m);   // a normal month's pay after bills (in the month you started, what's left of it)
  // Everything-else pot shrinks with everyday spending and any set-aside that ran over.
  const over = sum(spends, c => Math.max(0, (spentBy[c.id] || 0) - Number(c.budget || 0)));
  const potSpent = (spentBy[''] || 0) + over;
  // pay after bills comes in evenly across the month; the purse is this week's
  const earnedF = gatherF(m), Fc = earnedF, gathered = free * earnedF, loot = 0;
  const left = m === today().slice(0, 7) ? purseNow().purseLeft : 0;
  return { gathered, loot, Fc, spentBy, income, bills, spends, billTotal, spendTotal, isPaid, billsDue, free, potSpent, left, earnedF };
}
// Every pot's balance, now (or at the end of month m, for a month that's over). Bills is the money held for
// bills not paid yet; Savings is what's left over.
// v187: the party's pay still to come this week: k villagers, $1 a day each, from now to the week's end, but only
// while an entered paycheck is paying them. The purse shows it; Savings doesn't front it.
function partyToCome(now = Date.now()) {
  const wk = ymd(weekStart(new Date(now))); if (fundRec(wk)) return 0;
  const k = partyNow(now); if (k <= 0) return 0;
  const w0 = weekStart(new Date(now)), end = new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + 7).getTime();   // v311: by the calendar (a clock-change week isn't 7 × 24 hours)
  const pays = periodNow(now).list.filter(c => c.V > 0 && now < c.t1).reduce((a, c) => Math.max(a, c.t1), 0);
  const ms = Math.max(0, Math.min(end, pays) - now), st = state.purse && state.purse.wk === wk ? state.purse : null;
  const rr = wkRof(wk), base = Math.max(0, c2((k * wkDays(wk) * WORKER_DAY - Number(st ? st.late || 0 : 0)) * rr) + Number(st ? st.adj || 0 : 0));
  return Math.max(0, Math.min(base, k * WORKER_DAY * rr * ms / DAY_MS));
}
function potBalances(m, at) {
  const cur = today().slice(0, 7), now = at != null ? at : m >= cur ? Date.now() : monthEndMs(m) - 1, td = ymd(new Date(now)), pp = hoardParts(now);
  const purse = m === cur ? purseNow(now).purseLeft : 0;   // v322: this week's money not spent yet
  const scav = cents(pp.scav + moved('scavenger', td));
  const customs = state.pots.map(p => ({ id: p.id, name: p.name, bal: projectBal(p.id, now), get note() { return farmNote(p.id); }, custom: true }));   // v311: notes when read
  // v322 (Jordan): Savings is what's really in the bank right now that nothing else has: a paycheck lands in it whole,
  // and its money a day moves out of it into spending, pots, projects and debts as it goes
  // v322b (Jordan): and less the weekly money still to come through the next payday, so Savings is what's free to use
  const savings = pp.total + pp.pending - purse - scav - sum(customs, p => p.bal) - (m === cur ? savingsPlanned(now).week : 0), short = () => overAssigned(), nh = () => pp.heldList.length;
  return [
    { id: 'spend', name: "This week's money", get note() { return `${funWorkers()} on weekly spending · ${money(funPerDay() * 7)} a week`; }, bal: purse },
    { id: 'bills', name: 'Bills', get note() { const n = nh(); return n ? `held for ${n} bill${n === 1 ? '' : 's'} not paid yet` : 'nothing held right now'; }, bal: cents(pp.held + moved('bills', td)) },
    { id: 'savings', name: 'Savings', get note() { const s = short(); return s > 0 ? `Paying ${money(s)} a day more than your pay` : farmNote('savings'); }, bal: savings, get warn() { return short() > 0; } },
    { id: 'scavenger', name: 'Spare change', note: 'spare change', bal: scav, exact: true },
    ...customs,
  ];
}
// v322: the money a day still to come through the next payday, split: the weekly money (already out of Savings) and
// what goes to pots, projects and debts (still in Savings, moving out a day at a time). Less this week's money already
// set aside, and less what Savings' own money a day keeps.
function savingsPlanned(now = Date.now()) {
  const pn = periodNow(now), live = pn.list.filter(c => c.V > 0 && now < c.t1); if (!live.length) return { amt: 0, week: 0, until: null };
  const V = pn.V || sum(live, c => c.V), P = sum(live, c => c.pending), share = k => V > 0 ? clamp01(Math.max(0, k) / V) : 0;
  const week = Math.max(0, P * share(partyNow(now)) - partyToCome(now)), amt = Math.max(0, P * share(V - Math.max(0, savers()) - Math.max(0, partyNow(now))));
  return { amt, week, until: ymd(new Date(Math.max(...live.map(c => c.t1)))) };
}
// v322 (Jordan 16:46): the Month cushion, paycheck to paycheck: Savings plus what's held now for bills after the next
// payday. Each pay period's bills come from its own paycheck; a period that comes up short takes it from the cushion then.
function cushionNow(now = Date.now()) {
  const S = (potBalances(ymd(new Date(now)).slice(0, 7), now).find(p => p.id === 'savings') || { bal: 0 }).bal, pp = hoardParts(now), inc = mainIncome();
  const until = savingsPlanned(now).until || (inc && Number(inc.amount) > 0 ? nextPayday(inc, ymd(new Date(now))) : null);
  const keep = until ? Math.max(0, cents(pp.held - sum(pp.heldList.filter(b => b.due && b.due < until), b => b.A))) : 0;
  return { H: S + keep, S, keep, until, later: until ? pp.heldList.filter(b => !b.due || b.due >= until) : [], pp };
}
function farmNote(id) { const w = id === 'savings' ? savers() : workersAt(id); return w > 0 ? `${money(w * WORKER_DAY)} a day · ${rateText(w)}` : 'kept month to month'; }
const POT_NAMES = { start: 'Money you had', spend: "This week's money", bills: 'Bills', savings: 'Savings', scavenger: 'Spare change' };
const potName = id => POT_NAMES[id] || (state.pots.find(p => p.id === id) || { name: 'Deleted pot' }).name;   // v311: no need to count every balance for a name
const isMini = p => p.custom && (goalOf(p.id) > 0 || paidOff(p.id));   // v147: paid off stays a project
