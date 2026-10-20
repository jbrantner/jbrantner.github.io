'use strict';
/* ---------- the books (2026-10-09) ----------
   The plan comes from a normal month: pay every week counts 4 paychecks, every 2 weeks counts 2, twice a
   month 2, once a month 1. A month's extra paycheck (a 5th weekly one, or a 3rd every-2-weeks one) is a
   bonus: it isn't part of the plan, and it lands whole on its payday. That way the app never plans with
   money that only shows up twice a year.
   Savings is what's left over: what you had, plus pay after bills as it comes in, minus what you've
   spent, minus what sits in the party purse, the projects and the spare change. So every dollar is
   counted once, and moving money between pots never makes or loses any. */
const normalChecks = inc => inc.every === 'twice' ? 2 : Number(inc.every) === 7 ? 4 : Number(inc.every) === 14 ? 2 : 1;
// A month's paychecks for one income, oldest first; the ones past a normal month's count are bonuses.
const checksOf = (inc, m) => paydaysOf(inc, m).map((date, i) => ({ date, amount: Number(inc.amount || 0), bonus: i >= normalChecks(inc), inc: inc.id }));
const billsTotal = () => sum(state.categories, c => Number(c.budget || 0));   // bills and set-asides
const normalPay = () => sum(state.incomes, i => Number(i.amount || 0) * normalChecks(i));
// A normal month's pay after bills: what the party, the projects and Savings share.
const planFree = () => normalPay() - billsTotal();
const startDay = () => state.startAt ? ymd(new Date(state.startAt)) : '';
const isStartMonth = m => m === state.startMonth && state.startAt > monthStartMs(m) && state.startAt < monthEndMs(m);
// Pay after bills that comes in evenly across month m. In the month you started, only paychecks after
// the day you started count, against the bills still to come (and every bill with no due day, in case
// it hasn't been paid yet). Anything paid before you started is part of what you had.
function monthFree(m) {
  if (!isStartMonth(m)) return planFree();
  const d0 = startDay();
  const pay = sum(state.incomes, i => sum(checksOf(i, m).filter(c => !c.bonus && c.date > d0), c => c.amount));
  const bills = sum(state.categories.filter(c => c.kind === 'bill'), c => { const d = dueDate(c, m); return !d || d >= d0 ? Number(c.budget || 0) : 0; });
  const sets = sum(state.categories.filter(c => c.kind !== 'bill'), c => Number(c.budget || 0)) * monthLeftFrac(m);
  return pay - bills - sets;
}
// Money moved into a pot by hand, by postage or as treasure, up to a day.
var trIx = null;
const movesOf = pot => {   // v311: the transfers touching each pot, rebuilt when the transfers change
  const T = state.transfers; let g = -1; try { g = booksGen; } catch (e) {}
  if (!trIx || trIx.tr !== T || trIx.n !== T.length || trIx.g !== g || g < 0) {
    const by = new Map(), add = (id, t) => { let a = by.get(id); if (!a) by.set(id, a = []); if (a[a.length - 1] !== t) a.push(t); };
    for (const t of T) { add(t.to, t); add(t.from, t); }
    trIx = { tr: T, n: T.length, g, by };
  }
  return trIx.by.get(pot) || [];
};
const moved = (pot, until = today(), at = Infinity) => sum(movesOf(pot).filter(t => t.date <= until && !(t.at > at)), t => (t.to === pot ? t.amount : 0) - (t.from === pot ? t.amount : 0));
const OUTSIDE = id => id === 'start' || id === 'bills';
// Good habits speed gathering up: each one done gives 2 hours at 3x speed. The month's total never
// changes, so habits only bring your own money to you sooner.
// Habits are off (Jordan, 2026-10-08): real pay must never arrive faster because of a game mechanic.
const HABITS_ON = false;
const BOOST_MS = 2 * 3600e3, BOOST_X = 2;
function habitBonus(m, now) {
  if (!HABITS_ON) return 0;
  const t0 = monthStartMs(m), t1 = monthEndMs(m);
  return sum(state.habitLog, h => { const a = Math.max(t0, h.t), b = Math.min(now, t1, h.t + BOOST_MS); return b > a ? (b - a) * BOOST_X : 0; });
}
const speedNow = (now = Date.now()) => !HABITS_ON ? 1 : 1 + BOOST_X * state.habitLog.filter(h => now >= h.t && now < h.t + BOOST_MS).length;
function gatherF(m, now = Date.now()) {
  const t0 = gatherStart(m), t1 = monthEndMs(m);
  if (now >= t1) return 1; if (now < t0) return 0;
  return Math.min(1, (now - t0 + habitBonus(m, now)) / (t1 - t0));
}
// Real money is never held back behind a tap (Jordan, 2026-10-08): pay is collected the moment it's
// gathered, so it lands in Savings and the rest right away. Tap-to-collect may return for game tokens.
const AUTO_COLLECT = true;
const collF = (m, id) => m < today().slice(0, 7) ? 1 : AUTO_COLLECT ? gatherF(m) : Math.min(gatherF(m), Number(((state.coll || {})[m] || {})[id] || 0));
const farmReady = (inc, now = Date.now()) => incomeOf(inc, month) * Math.max(0, gatherF(month, now) - collF(month, inc.id));
// The share of this month's pay you've collected so far.
const collectedFrac = m => { const I = incomeFor(m); return I > 0 ? sum(state.incomes, i => incomeOf(i, m) * collF(m, i.id)) / I : 0; };
// Farms hand over pay in whole dollars only; the part of the next dollar keeps filling its bar.
const farmWhole = (inc, now) => Math.floor(farmReady(inc, now) + 1e-9);
