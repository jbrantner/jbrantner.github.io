'use strict';
// A "marked paid" transaction, made when a bill is checked off by hand. A real bank
// transaction for the same bill that month replaces it.
// When a bill hits in month m: a day of the month (c.dueDay), or a rule like "first Friday"
// (c.due = { nth: 1-4 or -1 for last, wd: 0 Sunday … 6 Saturday }). Null when it has no due date.
function dueDate(c, m) {
  const [y, mo] = m.split('-').map(Number), dim = new Date(y, mo, 0).getDate();
  let d = null;
  if (c.due && c.due.wd != null) {
    if (c.due.nth === -1) { d = dim; while (new Date(y, mo - 1, d).getDay() !== c.due.wd) d--; }
    else { d = 1; while (new Date(y, mo - 1, d).getDay() !== c.due.wd) d++; d += 7 * ((c.due.nth || 1) - 1); if (d > dim) d -= 7; }
  } else if (c.dueDay) d = Math.min(c.dueDay, dim);
  return d ? `${m}-${String(d).padStart(2, '0')}` : null;
}
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NTH = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', '-1': 'Last' };
const dueText = c => c.due && c.due.wd != null ? `${NTH[c.due.nth]} ${WD[c.due.wd]}` : c.dueDay ? `The ${ordinal(c.dueDay)}` : 'No due date';
function paidMarker(c, m) {
  const day = (dueDate(c, m) || `${m}-01`).slice(8);
  return { id: uid(), date: `${m}-${day}`, amount: -Number(c.budget), description: c.name + ' (marked paid)',
    categoryId: c.id, account: c.account, source: 'manual', markedPaid: true, billMonth: m };
}
// When a category starts counting: when you started, or when you added it if that was later.
const catStart = c => Math.max(Number(state.startAt || 0), Number(c.at || 0));
const catFirstDay = c => c.at && c.at > Number(state.startAt || 0) ? ymd(new Date(c.at)) : d0Of();
// Every bill and set-aside, month by month from its first month to two months ahead (further if one was
// paid that far ahead): what it needs (A, whole dollars), its due day, the main payday that pays it (pd,
// only a payday after it started counting) and the day its money is held from. In its first month a bill
// due before that day was paid already (it's in your starting balance), and so is one you said came out
// before you started.
function billInstances(td, ahead = 2) {
  const out = [], main = mainIncome(), cats = [...state.categories, ...(state.goneCats || [])];
  const before = new Set(state.transactions.filter(t => t.before).map(t => t.categoryId + '|' + billMonthOf(t)));
  let last = td.slice(0, 7); for (let k = 0; k < ahead; k++) last = nextMonth(last);
  for (const t of state.transactions) if (t.categoryId && billMonthOf(t) > last) last = billMonthOf(t);
  for (const c of cats) {
    const t0 = catStart(c), first = catFirstDay(c), m0 = first.slice(0, 7), bill = c.kind === 'bill';
    const goneM = c.gone ? ymd(new Date(c.gone)).slice(0, 7) : null, amt = cents(Number(c.budget || 0));
    for (let m = m0; m <= last; m = nextMonth(m)) {
      const key = c.id + '|' + m, due = bill ? dueDate(c, m) : null;
      if (before.has(key) || (m === m0 && due && due < first)) continue;
      // a set-aside's first month counts only the part of the month that's left
      const A = Math.ceil((!bill && m === m0 && t0 ? cents(amt * Math.max(0, Math.min(1, (monthEndMs(m) - t0) / (monthEndMs(m) - monthStartMs(m))))) : amt) - 1e-9);
      const raw = bill ? prevPayday(main, due || m + '-01') : null, r = raw || m + '-01';
      out.push({ c, m, key, A, due, pd: raw && raw > first ? raw : null, holdDay: r > first ? r : first, set: !bill, gone: !!goneM && m >= goneM });
    }
  }
  return out;
}
// What's been paid toward each bill and set-aside, per 'categoryId|month', up to a day: P whole dollars
// (spending rounds up; cut is the cents that went to the scavenger). Real money that left before you
// started is kept apart (preP): your starting balance has it already.
function paidMap(td) {
  const d0 = d0Of(), out = {};
  for (const t of state.transactions) {
    if (!t.categoryId || t.before || t.date > td) continue;
    const k = t.categoryId + '|' + billMonthOf(t), e = out[k] || (out[k] = { P: 0, cut: 0, realP: 0, realCut: 0, preP: 0 });
    if (!t.markedPaid && t.date < d0) { e.preP += charged(t); continue; }
    const ch = charged(t), cu = scavCut(t); e.P += ch; e.cut += cu;
    if (!t.markedPaid) { e.realP += ch; e.realCut += cu; }
  }
  return out;
}
// What's been paid toward the bills since you started, up to a day: every payment for a bill or set-aside month the
// books count (whole dollars, the cents to the scavenger), plus real money that left for one they don't count (a bill
// due before you started, say). Months run 13 ahead, so the hold below can look a year out.
const NO_PAY = { P: 0, cut: 0, realP: 0, realCut: 0, preP: 0 };
function billBooks(td) {
  const inst = billInstances(td, 13), paid = paidMap(td), have = new Set();
  let out = 0, cut = 0;
  for (const b of inst) {
    const e = paid[b.key] || NO_PAY;
    if (!b.set && e.preP > 0 && !(e.P > 0)) continue;   // your bank says it came out before you started
    have.add(b.key); out += e.P; cut += e.cut;
  }
  for (const [k, e] of Object.entries(paid)) if (!have.has(k)) { out += e.realP; cut += e.realCut; }
  return { inst, paid, have, out, cut };
}
// A month of bills and set-asides in whole dollars (each rounded up).
const billsMonthWhole = () => sum(state.categories, c => Math.max(0, Math.ceil(cents(Number(c.budget || 0)) - 1e-9)));
// v300: what each bill up to this month still needs saved (0: saved). The money held for bills covers the earliest
// unpaid ones first, as the hold always has; the rest gets saved from the bill share of the paychecks to come.
function billToSave(td = today()) {
  const N = needAt(td), L = ledgerAt(td), m = td.slice(0, 7), out = {}; let left = N.need;
  for (const x of billsAhead(L, td).filter(x => !x.b.set).sort((a, b) => a.day.localeCompare(b.day) || b.A - a.A)) {
    const cov = Math.max(0, Math.min(x.A, left)); left -= cov;
    const id = x.b.c && x.b.c.id; if (id && x.b.m <= m && out[id] == null) out[id] = x.A - cov;
  }
  return out;
}
const savedWord = (T, id) => !(T[id] >= 0.5) ? 'saved ✓' : `${money(T[id])} to save`;
// Each income's part of that month: in proportion to its normal month of pay (one income: all of it).
function billParts() {
  const key = state.categories.map(c => c.budget).join(',') + '|' + state.incomes.map(i => i.id + ':' + i.amount + ':' + i.every).join(','); if (billParts.k === key) return billParts.m;
  const B = billsMonthWhole(), incs = state.incomes.filter(i => Number(i.amount) > 0), np = sum(incs, i => Number(i.amount) * normalChecks(i)), out = {};
  if (incs.length && np > 0) {
    const e = incs.map(i => B * Number(i.amount) * normalChecks(i) / np);
    incs.forEach((i, k) => { out[i.id] = Math.ceil(e[k] - 1e-9); });   // v118: each part rounded up
  }
  billParts.k = key; billParts.m = out; return out;
}
// The bills' share of one paycheck: a year of bills spread over a year of paychecks, rounded up ($2,059 a month,
// every 2 weeks: $951 on every check, extra ones too).
function shareOf(inc, date) {
  if (!inc) return 0;
  if (paydaysOf(inc, date.slice(0, 7)).indexOf(date) < 0) return 0;
  return yearShare(inc, schedAt(inc, date));   // v311: on the schedule it came on
}
function yearShare(inc, s = inc) {
  return Math.ceil((billParts()[inc.id] || 0) * 12 / perYearOf(s) - 1e-9);
}
// A month of bills: every bill on the Upkeep page added up.
function billsMonthly() { return sum(state.categories.filter(c => c.kind === 'bill'), c => Number(c.budget || 0)); }
