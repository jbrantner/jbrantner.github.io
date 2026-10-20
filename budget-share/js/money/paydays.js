'use strict';
/* ---------- paydays and bills as they really happen (version 78) ----------
   A paycheck counts once you enter it: on payday the app asks what landed, and its cents go to the
   scavenger. The part that bills due before the next payday need goes to them at once; the rest comes in
   bit by bit until the next payday. Each bill's money is held from the payday before it's due (or from
   when you started) until it's paid, so Savings never counts money a bill is about to take. From all of
   that the app knows what your bank should show, and you can set it to what the bank really says. */
const d0Of = () => startDay() || (state.startMonth || '0000-00') + '-00';   // the first day the books count
const billMonthOf = t => t.billMonth || t.date.slice(0, 7);                 // the month a bill payment is for
const checkKey = (inc, date) => inc.id + '|' + date;
const splitKey = k => { const i = k.lastIndexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; };
// The paycheck the bills are timed by: the income with the biggest normal month.
const mainIncome = () => state.incomes.reduce((b, i) => !b || Number(i.amount || 0) * normalChecks(i) > Number(b.amount || 0) * normalChecks(b) ? i : b, null);
// One income's paydays from the month before d's to two months after it.
function paydaysNear(inc, d) {
  const out = []; let m = prevMonth(d.slice(0, 7));
  for (let k = 0; k < 4; k++, m = nextMonth(m)) out.push(...paydaysOf(inc, m));
  return out;
}
const prevPayday = (inc, d) => inc ? paydaysNear(inc, d).filter(p => p <= d).pop() || null : null;   // on or before d
const nextPayday = (inc, d) => inc ? paydaysNear(inc, d).find(p => p > d) || null : null;            // after d
// Every payday since you started, up to a day, of incomes with a paycheck set, oldest first. (A payday on
// the day you started is in your starting balance.)
function paydaysUpTo(td) {
  const d0 = d0Of(), out = []; if (!state.startMonth) return out;
  for (const inc of state.incomes.filter(i => Number(i.amount) > 0))
    for (let m = state.startMonth; m <= td.slice(0, 7); m = nextMonth(m))
      for (const date of paydaysOf(inc, m)) if (date > d0 && date <= td) out.push({ inc, date, key: checkKey(inc, date) });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const paydaysWaiting = (td = today()) => paydaysUpTo(td).filter(p => !(state.checks || {})[p.key]);
// v120: every paycheck, extra ones too, holds its share of a year of bills, rounded up (Jordan: round up for bills)
const perYearOf = inc => Number(inc.every) === 7 ? 52 : Number(inc.every) === 14 ? 26 : inc.every === 'twice' ? 24 : 12;
const isExtraCheck = (inc, date) => { if (!inc) return false; const s = schedAt(inc, date); return schedDays(s, date.slice(0, 7)).indexOf(date) >= normalChecks(s); };   // v311: counted on its own schedule
// A pay period: from a payday to the next one (days counted whole, so daylight saving never shifts them).
function periodOf(inc, date) {
  const nx = inc ? nextPayday(inc, date) : null, t0 = dayMs(date), t1 = nx ? dayMs(nx) : t0 + 14 * DAY_MS;
  return { date, next: nx, t0, t1, days: Math.max(1, Math.round((t1 - t0) / DAY_MS)) };
}
/* ---------- income farms ----------
   Every income source is a farm: the day job, freelance, a second job. Each pays `amount` every
   `every` days (7 or 14) counting from the payday `anchor`, or once a month on the anchor's date
   (every = 0). A month's pay is gathered a little at a time across the month, and you tap a farm
   to collect what it has gathered. Only collected money can be spent or build projects. */
// v311: paydays up to a schedule change keep the schedule they had: inc.was = [{ every, anchor, days, to }], oldest
// first, each one in force up to its day `to` (one with no schedule, just `to`: no payday in those days); the schedule
// now runs after the last one
function paydaysOf(inc, m) {
  const was = inc && inc.was, a = m + '-01'; if (!(was && was.length) || was[was.length - 1].to < a) return schedDays(inc, m);   // after the last change: the schedule now
  const W = paydaysOf.w || (paydaysOf.w = new WeakMap());   // per history (a change makes a new one): each month's paydays, worked out once
  let c = W.get(was); if (!c || c.size > 400) W.set(was, c = new Map());
  const k = `${inc.anchor}|${inc.every}|${inc.days}|${m}`; let out = c.get(k);
  if (!out) { const z = m + '-31'; let from = ''; out = [];   // only the schedules in force in this month are worked out
    for (const w of was) { if (w.to >= a && from < z) for (const d of schedDays(w, m)) if (d > from && d <= w.to) out.push(d); from = w.to; }
    if (from < z) for (const d of schedDays(inc, m)) if (d > from) out.push(d);
    c.set(k, out); }
  return out.slice();
}
const schedAt = (inc, d) => (inc.was || []).find(w => d <= w.to && w.anchor) || inc;   // the schedule a payday was on
var payOfC = null;   // v311: cleared on each render
function schedDays(inc, m) {
  if (!inc || !inc.anchor) return [];
  if (!payOfC || payOfC.size > 2000) payOfC = new Map();
  const k = `${inc.anchor}|${inc.every}|${inc.every === 'twice' ? (inc.days || []).join(',') : ''}|${m}`, hit = payOfC.get(k); if (hit) return hit.slice();
  const out = schedDays1(inc, m); payOfC.set(k, out); return out.slice();
}
function schedDays1(inc, m) {
  if (!inc || !inc.anchor) return [];
  const dim = daysIn(m);
  // twice a month on two set days, like the 15th and the last day (31 means the last day)
  // v311: two days on the same date (15 and 15, or 30 and 31 in a short month) stay two paydays: the earlier one moves a day back
  if (inc.every === 'twice') { const ds = (inc.days || [15, 31]).map(d => Math.min(dim, Math.max(1, Number(d) || 1))).sort((a, b) => a - b), a = ds[0], b = ds[ds.length - 1];
    return (a < b ? [a, b] : b > 1 ? [b - 1, b] : [1, 2]).map(d => `${m}-${String(d).padStart(2, '0')}`); }
  if (!Number(inc.every)) return [`${m}-${String(Math.min(dim, Number(inc.anchor.slice(8)))).padStart(2, '0')}`];
  // Count in whole days (noon to noon) so daylight saving never shifts a payday.
  const day = d => Math.round(dayMs(d) / DAY_MS), a = day(inc.anchor), first = day(m + '-01'), step = Number(inc.every);
  let k = first + (((a - first) % step) + step) % step;
  const out = [];
  for (; k < first + dim; k += step) out.push(`${m}-${String(k - first + 1).padStart(2, '0')}`);
  return out;
}
const paydaysIn = m => [...new Set(state.incomes.flatMap(i => paydaysOf(i, m)))].sort();
const incomeOf = (inc, m) => paydaysOf(inc, m).length * Number(inc.amount || 0);
const incomeFor = m => sum(state.incomes, i => incomeOf(i, m));
// One income's pay the way the books count it: a normal month's checks come in evenly over the month
// (only the ones after you started, in the month you started), and a bonus check lands whole on its day.
const normalOf = (inc, m) => { const d0 = isStartMonth(m) ? startDay() : ''; return sum(checksOf(inc, m).filter(c => !c.bonus && (!d0 || c.date > d0)), c => c.amount); };
function payIn(inc, m, now = Date.now()) {
  const td = ymd(new Date(now)), d0 = isStartMonth(m) ? startDay() : '';
  return normalOf(inc, m) * (m < td.slice(0, 7) ? 1 : gatherF(m, now)) + sum(checksOf(inc, m).filter(c => c.bonus && c.date <= td && (!d0 || c.date > d0)), c => c.amount);
}
