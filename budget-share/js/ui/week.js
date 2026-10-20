'use strict';
/* v136 #8: a week carrying an overdraft, said plainly: the purse, what came with it from last week */
function carriedLine(pu, tail = '') { return `This week ${money(Math.max(0, pu.P + pu.carried))} · ${money(Math.ceil(pu.carried - 1e-9))} over from last week${tail}`; }
/* v136 #3: no-spend dots. One per day of the purse's week (Monday to Sunday since v144). A day's share is the week's purse
   spread evenly over the days the party is out (the "a day" number). Filled: that day's spending (whole dollars, as the
   purse counts it) was within the share; gold: nothing spent; empty: over, or a day still to come; dashed: the party
   wasn't out yet. Tap a day to correct it: green, gold, empty, then back to automatic. Display only. */
function weekDots(now = Date.now()) {
  const w0 = weekStart(new Date(now)), td = ymd(new Date(now)), pu = purseNow(now), fix = state.dotFix || {}, ws = weekSpends(), outNow = weekRunning(now), fr = fundRec(ymd(w0));
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const a = new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + i), b = new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + i + 1), date = ymd(a), future = date > td;
    return { i, date, future, out: future ? outNow : fr ? fr.amt > 0 && date >= fr.from : workersAt('party', Math.min(b.getTime() - 1, now)) > 0, spent: sum(ws.filter(t => t.date === date), t => charged(t)) };
  });
  const nOut = days.filter(d => d.out).length, share = nOut ? Math.max(0, pu.P) / nOut : 0;
  for (const d of days) {
    d.auto = d.future ? 'future' : !d.out ? 'off' : d.spent <= 0 ? 'zero' : d.spent <= share + 1e-6 ? 'in' : 'over';
    d.fix = d.future ? null : fix[d.date] || null;
    d.state = d.fix ? (d.fix === 'none' ? 'over' : d.fix) : d.auto;
  }
  return { days, share, perfect: days.every(d => d.state === 'in' || d.state === 'zero'), wk: ymd(w0), td };
}
/* v150: day stacks. The same arithmetic as todayLeft: a day's share is what's left of the purse that morning,
   spread evenly over the days left (whole dollars, rounded down). So a day that ends with money left hands it to
   the days ahead, and spending past today's share comes out of them. Display only; a past day still taps to fix. */
// v206: what's left today, as a big pixel number over the day stacks (cents small, like the cards)
function todayNumHTML(t) {
  const x = moneyExact(Math.floor(t * 100 + 1e-6) / 100), m = x.match(/^(.*?)([.,]\d\d)$/);
  return `<div class="hl-today num${t < 0 ? ' bad' : ''}" aria-label="${esc(x)} left today">${m ? `${esc(m[1])}<span class="c">${esc(m[2])}</span>` : esc(x)}</div>`;
}
