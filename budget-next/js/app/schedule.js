'use strict';
const everyVal = v => v === 'twice' ? 'twice' : Number(v);
const dayVal = el => Math.max(1, Math.min(31, Math.round(Number(el.value) || 1)));
// v311 (G6): twice a month means two different days at least a week apart (null when they aren't)
const twiceDays = (a, b) => { const d = [dayVal(a), dayVal(b)].sort((x, y) => x - y); return d[1] - d[0] >= 7 ? d : null; };
function setDays(i, a, b) {   // the twice-a-month days typed in Settings or the Paychecks sheet
  if (!i) return; const d = twiceDays($(a), $(b));
  if (!d) { const was = i.days || [15, 31]; $(a).value = was[0]; $(b).value = was[1]; toast('Pick two paydays at least a week apart'); return; }
  reSchedule(i, i => { i.days = d; }); save(); render();
}
/* v311 (G2): changing the pay schedule keeps the paychecks already entered. Every payday up to the later of your last
   paycheck and yesterday stays on the schedule it had (inc.was), so the books so far don't change and no payday is
   asked for again; the new schedule takes over from its next payday. A new payday less than half a pay period after the
   last one kept is that payday moved (the paycheck you entered), not another. On the day you started, before any
   paycheck is in, setup isn't over: the new schedule simply replaces the old one. A paycheck entered ahead moves to
   the new paydays. */
function reSchedule(inc, set) {
  if (!inc) return;
  const plain = i => ({ every: i.every, anchor: i.anchor, ...(i.every === 'twice' ? { days: (i.days || [15, 31]).slice() } : {}) });
  const td = today(), t = Date.now(), was = inc.was || [], last = was.length ? was[was.length - 1].to : '', old = plain(inc);
  const keys = Object.keys(state.checks || {}).filter(k => splitKey(k)[0] === inc.id);
  const L = keys.filter(k => Number(state.checks[k].at) <= t).map(k => splitKey(k)[1]).sort().pop() || '';
  const K0 = [last, L, ymdPlus(td, -1)].sort().pop(), q = prevPayday(inc, K0), qn = q && nextPayday(plain(schedAt(inc, q)), q);   // q: the last payday kept, qn: the next on its schedule
  set(inc); const now = plain(inc);
  if (JSON.stringify(paydaysNear(old, td)) === JSON.stringify(paydaysNear(now, td))) return;   // the same paydays
  if (L || was.length || td !== startDay()) {
    const p = nextPayday(now, K0), days = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY_MS);
    const K = p && q && qn && 2 * days(q, p) < days(q, qn) ? p : K0;
    if (K > last) inc.was = [...was, ...(K0 > last ? [{ ...old, to: K0 }] : []), ...(K > K0 ? [{ to: K }] : [])];   // a payday moved: none up to it
    else if (JSON.stringify(paydaysNear(was[was.length - 1], td)) === JSON.stringify(paydaysNear(now, td))) { inc.was = was.slice(0, -1); if (!inc.was.length) delete inc.was; }   // changed back: one schedule again
  }
  let from = td;   // paychecks entered ahead go to the next paydays, in order
  for (const k of keys.filter(k => !(Number(state.checks[k].at) <= t)).sort()) {
    const d = splitKey(k)[1]; if (paydaysOf(inc, d.slice(0, 7)).includes(d)) { if (d > from) from = d; continue; }
    let n = nextPayday(inc, from); while (n && state.checks[checkKey(inc, n)]) n = nextPayday(inc, n);
    if (!n) continue;
    state.checks[checkKey(inc, n)] = { ...state.checks[k], at: dayMs(n) }; delete state.checks[k]; from = n;
  }
  const nx = nextPayday(inc, td); if (nx) toast(`Next payday ${shortDate(nx)}`);
}
