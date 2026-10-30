'use strict';
const wkFrom = w => state.weekFrom && state.weekFrom.wk === w ? state.weekFrom.from : w;           // first day whose spends count
const wkDays = w => state.weekFrom && state.weekFrom.wk === w ? Number(state.weekFrom.days) || 7 : 7;   // days of purse per villager
const wkOf = k => { const a = Number(state.wkAmt), top = k * 7 * WORKER_DAY; return a >= 0 && a <= top && a > top - 7 * WORKER_DAY ? a : top; };   // v311: what k villagers make a week (the amount typed, when it fits)
const weeklyAmt = () => wkOf(Number(state.partyPlan || 0));
const wkR = () => { const top = Number(state.partyPlan || 0) * 7 * WORKER_DAY; return top > 0 ? weeklyAmt() / top : 1; };
const wkRof = w => state.purse && state.purse.wk === w && state.purse.r != null ? Number(state.purse.r) : wkR();
const checkWeek = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; };   // the bank check's week: from Sunday
function weekMigrate() {
  { const wf = state.weekFrom; if (wf && Number(wf.days) === 8 && !wf.fix294 && Number(state.startAt || 0) >= dayMs(wf.from)) { wf.days = 7; wf.fix294 = 1; save(); } }   // v294: started after that Sunday: a plain 7-day week (was 8: $344 for $301)
  if (state.weekMon) return;
  const isSun = k => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k) && new Date(dayMs(k)).getDay() === 0;
  const S = state.lastWeek, td = today();
  if (isSun(S)) {
    const to = td <= S ? ymdPlus(S, -6) : ymdPlus(S, 1);
    state.weekFrom = { wk: to, from: S, days: td <= S || Number(state.startAt || 0) >= dayMs(S) ? 7 : 8, was: S };
    if (state.purse && state.purse.wk === S) state.purse.wk = to;
    if (state.packDone && state.packDone.wk === S) state.packDone.wk = to;
    state.lastWeek = to;
  }
  state.weekMon = 1; save();
}
// v181: the weekly budget comes out of Savings. state.funds[week] = { amt, n, from, want }: what moved from Savings to the
// purse that week, the plan it was for ($7 steps), and the first day it ran.
// v185: off again (Jordan 2026-10-12 05:53), and the switch went in idea 7; fundRec stays for the weeks it already ran.
const fundRec = wk => (state.funds || {})[wk] || null;
// v322 (Jordan 16:49): the weekly money loaded by hand from the cushion instead of set aside from pay. It goes in the
// purse as extra (like postage); what's left on Sunday goes back to Savings as ever.
function loadWeek(amt) {
  const a = cents(Number(amt)); if (!(a >= 0.01)) return false; const wk = ymd(weekStart());
  if (!state.purse || state.purse.wk !== wk) state.purse = { wk, P: 0, extra: 0 };
  state.purse.extra = cents(Number(state.purse.extra || 0) + a);
  const t = { id: uid(), from: 'savings', to: 'spend', amount: a, date: today(), at: Date.now(), postage: true, load: true };
  state.transfers.push(t); save(); return t;
}
function unloadWeek(t) {   // v324: Undo a load
  if (!state.transfers.includes(t)) return;
  state.transfers = state.transfers.filter(x => x !== t);
  if (state.purse && state.purse.wk === ymd(weekStart(new Date(t.at)))) state.purse.extra = Math.max(0, cents(Number(state.purse.extra || 0) - t.amount));
  save();
}
const weekRunning = (now = Date.now()) => { const f = fundRec(ymd(weekStart(new Date(now)))); return f ? f.amt > 0 : partyNow(now) > 0; };
const partySize = () => partyNow();
const partyRoom = () => Math.max(0, maxWorkers() - crewWorkers());   // most the weekly budget can be ($7 steps)
const planCap = () => payWaiting() ? partyRoom() + partySize() : partyRoom();   // v311: partyRoom already counts the running week's money a day (while a payday waits to be entered there's none yet, so the running week is what there is)
const treasurePot = () => farmPots().includes(state.treasureTo) ? state.treasureTo : 'savings';
// When a week has ended since the app last looked, settle it: what the party didn't spend comes home as
// treasure, and a week that ran over carries the gap into the next one (it stays there, in red, until
// you send postage). Weeks are settled one at a time, so a few days away never mixes them up.
const spentBetween = (a, b) => sum(state.transactions.filter(t => t.date >= a && t.date < b && !t.categoryId && t.amount < 0), t => charged(t));
function partyReturns() {
  const wk = ymd(weekStart()), last = state.lastWeek;
  if (!last) { state.lastWeek = wk; state.purse = { wk, P: 0, extra: 0 }; save(); return; }   // the first party leaves next Monday
  if (last === wk && partyNow() === 0) {   // v185: a week funded from Savings switches back: villagers out, the purse as it was
    const fw = fundRec(wk);
    if (fw && fw.amt > 0 && !clockBack()) {
      const k = Math.min(Number(fw.n) || 0, partyRoom()), t0 = Math.max(weekStart().getTime(), dayMs(fw.from || wk));
      if (!state.purse || state.purse.wk !== wk) state.purse = { wk, P: 0, extra: 0 };
      delete state.funds[wk];
      if (k > 0) { state.purse.late = Math.max(0, Math.round((k * wkDays(wk) * WORKER_DAY - fw.amt) * 100) / 100); state.workerLog.push({ t: t0, pot: 'party', delta: k }); }
      save();
    }
  }
  if (last >= wk) return;
  let w = last, extra = state.purse && state.purse.wk === last ? Number(state.purse.extra || 0) : 0, got = 0, short = 0, sunday = '', weeks = 0;
  const late = state.purse && state.purse.wk === last ? Number(state.purse.late || 0) : 0, adj = state.purse && state.purse.wk === last ? Number(state.purse.adj || 0) : 0;
  while (w < wk) {
    const w0 = new Date(dayMs(w)), next = ymd(new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + 7)), sat = ymd(new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + 6));   // sat: the week's last day (Sunday since v144)
    const fw = fundRec(w), P = (fw ? fw.amt : c2((workersAt('party', dayMs(next) - 1) * wkDays(w) * WORKER_DAY - (w === last ? late : 0)) * wkRof(w)) + (w === last ? adj : 0)) + extra, r = Math.round((P - spentBetween(wkFrom(w), next)) * 100) / 100;
    if (r >= 0.01) { state.transfers.push({ id: uid(), from: 'spend', to: treasurePot(), amount: r, date: sat, at: dayMs(next) - 1, treasure: true }); got += r; extra = 0; }   // v311: at the end of Sunday
    else extra = Math.min(0, r);   // overspent: the gap follows the party into the next week
    sunday = sat; w = next; weeks++;
  }
  short = -extra;
  state.purse = { wk, P: 0, extra };
  // the new party sets out (Monday 00:00): as planned, locked until next Monday
  const t0 = weekStart().getTime(), plan = state.manualWeek ? 0 : Number(state.partyPlan || 0); let room = planCap();   // v322: loaded by hand, nobody sets out
  if (plan > room) {   // v178: the weekly budget comes first: villagers come home from pots and projects to make it, most-staffed first
    const left = {}; for (const id of farmPots()) if (id !== 'savings' && !isLocked(id)) left[id] = Math.min(workersAt(id), workersAt(id, t0));
    while (room < plan) { const id = Object.keys(left).sort((a, b) => left[b] - left[a])[0]; if (!id || left[id] < 1) break; left[id]--; room++; state.workerLog.push({ t: t0, pot: id, delta: -1 }); }
  }
  const go = Math.min(plan, room), was = workersAt('party', Infinity);
  if (go !== was) state.workerLog.push({ t: weekStart().getTime(), pot: 'party', delta: go - was });
  state.lastWeek = wk; state.lastTrip = { amount: got, short, to: treasurePot(), date: sunday, seen: false, gold: 0, weeks };
  save();
}
// Where a purchase happened, as a stop on the trail.
const STOPS = [[/coffee|cafe|starbucks|dunkin|tea/i, '', 'Tavern'], [/food|grocer|market|safeway|kroger|walmart|target|costco|trader|aldi/i, '', 'Market'],
  [/gas|fuel|shell|chevron|exxon|arco/i, '', 'Stable'], [/restaurant|pizza|burger|taco|lunch|dinner|doordash|uber eats|grubhub|mcdonald|chipotle/i, '', 'Inn'],
  [/game|steam|nintendo|playstation|xbox|movie|cinema|book/i, '', 'Fair'], [/amazon|shop|store/i, '', 'Trading post']];
const stopOf = t => { const s = STOPS.find(([re]) => re.test(t.description || '')); return s ? { icon: s[1], name: s[2] } : { icon: '', name: 'Roadside' }; };
/* The purse: every Monday the party leaves with a full week's money, $7 per villager, packed from
   Savings (which the week's pay after bills fills back up). Postage you send adds to it; a gap carried
   from a week that ran over takes away from it. What's left on Sunday night comes home as treasure. */
function purseNow(now = Date.now()) {
  const wk = ymd(weekStart(new Date(now)));
  // a new week's purse is only started by partyReturns, after last week's has been settled
  const st = state.purse && state.purse.wk === wk ? state.purse : null;
  const fw = fundRec(wk), P = (fw ? fw.amt : c2((partyNow(now) * wkDays(wk) * WORKER_DAY - Number(st ? st.late || 0 : 0)) * wkRof(wk)) + Number(st ? st.adj || 0 : 0)) + Number(st ? st.extra || 0 : 0);   // v181, v294
  if (st) st.P = P;
  const spent = sum(weekSpends(), t => charged(t)), frac = Math.max(0, Math.min(1, (now - weekStart(new Date(now)).getTime()) / (7 * DAY_MS)));
  return { P, spent, left: P - spent, packed: P, purseLeft: P - spent, wagon: 0, camp: 0, carried: st ? Math.max(0, -Number(st.extra || 0)) : 0, pace: P * frac, frac };
}
// What's left today: what the purse had this morning, shared evenly over the days left in the week (today
// too), less what's been spent today. Whole dollars, rounded down (Jordan, v83).
function todayLeft(pu = purseNow(), now = new Date()) {
  const td = ymd(now), d = Math.max(0, Math.min(6, Math.floor((now - weekStart(now)) / DAY_MS)));
  const spentToday = sum(weekSpends().filter(t => t.date === td), t => charged(t));
  const share = Math.floor(Math.max(0, pu.purseLeft + spentToday) / (7 - d) + 1e-9);
  return share - spentToday;
}
const weekSpends = () => { const w0 = wkFrom(ymd(weekStart())); return state.transactions.filter(t => t.date >= w0 && !t.categoryId && t.amount < 0).sort((a, b) => a.date.localeCompare(b.date)); };
