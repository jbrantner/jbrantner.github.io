'use strict';
// The bills still to pay, each on the day the books expect it: its due day, or for a bill with no due day the last
// day of its month (when the app marks it paid if you haven't). A set-aside needs its month's money from the 1st.
function billsAhead(L, td, ignorePaid) {
  const out = [], cur = td.slice(0, 7);
  for (const b of L.inst) {
    if (b.gone || !L.have.has(b.key)) continue;
    const e = ignorePaid ? NO_PAY : L.paid[b.key] || NO_PAY;
    if (b.set) { if (b.m < cur) continue; const left = b.A - e.P; if (left > 0) out.push({ b, A: left, day: b.m + '-01' }); continue; }
    if (e.P > 0) continue;
    out.push({ b, A: b.A, day: b.due || monthLast(b.m) });
  }
  return out;
}
// The bill share of every paycheck after you started that isn't in hand yet (still to come, or waiting to be entered).
function sharesAhead(td, now, endM, incs = state.incomes) {   // v311: incs: the incomes as counted (startNeed: on their schedule then)
  const d0 = d0Of(), out = []; if (!state.startMonth) return out;
  for (const inc of incs.filter(i => Number(i.amount) > 0))
    for (let m = state.startMonth; m <= endM; m = nextMonth(m))
      for (const date of paydaysOf(inc, m)) {
        if (date <= d0) continue;
        const ck = (state.checks || {})[checkKey(inc, date)];
        if (ck && Number(ck.at) <= now) continue;   // v131: in hand, early or not
        const s = shareOf(inc, date); if (s > 0) out.push({ inc, date, s });
      }
  return out;
}
// What the bills need held right now: walk forward a year through the unpaid bills and the bill shares still to
// come (on the same day the paycheck first); the most the bills ever get ahead of the shares has to be in hand.
function needWalk(bills, shares, td, endM) {
  const ev = [...shares.map(x => ({ day: x.date > td ? x.date : td, v: -x.s })), ...bills.filter(x => x.b.m <= endM).map(x => ({ day: x.day > td ? x.day : td, v: x.A }))]
    .sort((a, b) => a.day.localeCompare(b.day) || a.v - b.v);
  let run = 0, need = 0, at = null;
  for (const e of ev) { run += e.v; if (run > need + 1e-9) { need = run; at = e.day; } }
  return { need: Math.max(0, need), at };
}
const needMemo = new Map();
function needAt(td, now = Date.now()) {
  const inHand = Object.entries(state.checks || {}).filter(([k, c]) => Number(c.at) <= now).map(([k]) => k).sort().join(',');
  const key = booksGen + '|' + td + '|' + inHand; let N = needMemo.get(key); if (N) return N;
  const L = ledgerAt(td), endM = (() => { let m = td.slice(0, 7); for (let k = 0; k < 12; k++) m = nextMonth(m); return m; })();
  const bills = billsAhead(L, td), w = needWalk(bills, sharesAhead(td, now, endM), td, endM);
  // the held money covers the earliest unpaid bills first
  const heldList = []; let acc = 0;
  for (const x of bills.filter(x => !x.b.set).sort((a, b) => a.day.localeCompare(b.day) || b.A - a.A)) { if (acc >= w.need - 1e-9) break; heldList.push({ ...x.b, A: x.A }); acc += x.A; }
  N = { need: w.need, at: w.at, heldList };
  if (needMemo.size > 80) needMemo.clear();
  needMemo.set(key, N); return N;
}
// The same hold at the moment you started, before anything was paid: what your starting balance has to keep for bills.
function startNeed() {
  const key = booksGen; if (startNeed.k === key) return startNeed.v;
  const d0 = startDay(); let v = 0;
  if (d0) { const L = ledgerAt(today() > d0 ? today() : d0); let endM = d0.slice(0, 7); for (let k = 0; k < 12; k++) endM = nextMonth(endM);
    const was = state.incomes.map(i => i.was && i.was.length ? { ...i, ...schedAt(i, d0), was: null } : i);   // v311: the pay schedule you had then
    v = needWalk(billsAhead(L, d0, true), sharesAhead(d0, Number(state.startAt || 0), endM, was), d0, endM).need; }
  startNeed.k = key; startNeed.v = v; return v;
}
