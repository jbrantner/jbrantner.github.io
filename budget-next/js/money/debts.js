'use strict';
/* v295 (Jordan, 2026-10-15: "the minimum ... counts as a bill. but anything extra ... acts sort of like a project"): debts.
   A debt is a project whose goal is what you owe (state.goals), plus state.debts[id] = { apr, minKind, min, start, cat, last }.
   Its minimum is a bill (state.categories, debtId), held from pay and marked paid on the due day like any other. Money a
   day on it is the extra: it fills like a project. Each due day (debtTick): interest (owed x APR / 12) goes on, the
   minimum comes off, and what the extra saved is paid out (a 'debt' move that leaves the bank), so the goal comes down. */
const debtOf = id => (state.debts || {})[id] || null;
const debtCat = id => { const d = debtOf(id); return d ? state.categories.find(c => c.id === d.cat) || (state.goneCats || []).find(c => c.id === d.cat) || null : null; };
const debtInt = (d, owed) => c2(Math.max(0, owed) * Number(d.apr || 0) / 1200);
const debtMinFor = (d, owed) => d.minKind === 'interest' ? Math.max(1, Math.ceil(debtInt(d, owed) - 1e-9)) : Math.max(1, Math.ceil(Number(d.min || 0) - 1e-9));
function debtDone(id) {
  const d = debtOf(id); if (!d || d.done) return;
  d.done = Date.now(); delete state.goals[id]; (state.paidOff = state.paidOff || {})[id] = Date.now();
  const c = state.categories.find(x => x.id === d.cat);   // its minimum stops coming up (what it cost stays counted)
  if (c) { state.categories = state.categories.filter(x => x !== c); (state.goneCats = state.goneCats || []).push({ ...c, gone: Date.now() }); d.doneCat = 1; }   // v311: noted, for an Undo
  const w = workersAt(id); if (w > 0) reassign(stampNow(), { [id]: -w });   // its money a day goes back to Savings
}
// v311: Undo on the payment that paid a debt off: it's a debt again, its minimum back in Bills (its money a day stays
// in Savings: the crew was done anyway, as much is saved as is owed)
function debtRevive(id) {
  const d = debtOf(id); if (!d || !d.done) return;
  const g = d.doneCat && !state.categories.some(c => c.id === d.cat) && (state.goneCats || []).find(c => c.id === d.cat);
  if (g) { state.goneCats = state.goneCats.filter(c => c !== g); const { gone, ...c } = g; state.categories.push(c); }
  delete d.done; delete d.doneCat;
}
// v311: the bill months a debt was already charged for (a due day moved later in one of them waits for next month)
const debtSeen = d => new Set((d.log || []).filter(e => e.int != null && (!e.cat || e.cat === d.cat)).map(e => e.date.slice(0, 7)));
// v311: what really left the bank for a debt's minimum in a bill month (nothing when the bill was deleted or unmarked)
const debtPaid = (cid, m, td) => Math.max(0, c2(sum(state.transactions.filter(t => t.categoryId === cid && !t.before && billMonthOf(t) === m && t.date <= td), t => -t.amount)));
// v311: the last month: the minimum marked paid takes only what's left on the debt (the rest stays in the bank)
function debtTrim(cid, m, x) {
  for (const t of state.transactions.filter(t => t.markedPaid && t.categoryId === cid && billMonthOf(t) === m).reverse()) {
    const k = Math.min(x, c2(-t.amount - 0.01)); if (!(k > 0.004)) continue; t.amount = c2(t.amount + k); x = c2(x - k); if (x <= 0.004) break; }
}
// v311: what "I paid" pays: the whole dollars saved, never more than is owed (all of it, cents too, once that much is saved)
const debtPayAmt = (id, g = goalOf(id), bal = projectBal(id)) => { const sv = Math.floor(bal * 100 + 1e-6) / 100; return g > 0 && sv >= g - 1e-9 ? c2(g) : Math.max(0, Math.floor(sv + 1e-6)); };
const debtPayText = (...a) => { const x = debtPayAmt(...a); return x % 1 ? moneyExact(x) : money(x); };
function debtTick() {
  const D = state.debts || {}, td = today(); let ch = false;
  if (clockBack()) return;
  for (const [id, d] of Object.entries(D)) {
    if (d.done || !state.pots.some(p => p.id === id)) continue;
    if (!(goalOf(id) > 0.004)) { debtDone(id); ch = true; continue; }   // paid off with Make a payment
    const c = debtCat(id); if (!c || !d.last) continue;
    const seen = debtSeen(d);   // v311: a month is charged once
    for (let m = d.last.slice(0, 7); m <= td.slice(0, 7); m = nextMonth(m)) {
      const due = dueDate(c, m); if (!due || due <= d.last || due > td || seen.has(m)) continue;
      let owed = goalOf(id);
      const i = debtInt(d, owed); owed = c2(owed + i);
      const pd = debtPaid(c.id, m, td), mn = Math.min(pd, owed); owed = c2(owed - mn);   // the bill paid it (v311: what it really paid)
      if (pd > mn + 0.004) debtTrim(c.id, m, c2(pd - mn));   // v311: the last month's bill takes only what was left
      const ex = 0;   // v298: the extra stays saved until you tap "I paid" (it isn't paid for you)
      (d.log = d.log || []).push({ date: due, int: i, min: mn, extra: ex > 0 ? ex : 0, owed });
      d.last = due; ch = true;
      if (owed <= 0.004) { debtDone(id); break; }
      state.goals[id] = owed;
      if (owed > Number(d.start || 0)) d.start = owed;
    }
  }
  if (ch) save();
}
// The months ahead: each due day the interest goes on, the minimum and the month's extra come off.
function debtPlan(id, plus = 0) {
  const d = debtOf(id), c = debtCat(id); if (!d || !c || d.done) return null;
  let owed = goalOf(id), interest = 0, months = 0, end = null, prev = Date.now(), saved = projectBal(id), S = debtSeen(d);
  const per = (Math.max(0, workersAt(id)) + plus) * WORKER_DAY, mn0 = Number(c.budget || 0);
  for (let m = today().slice(0, 7), k = 0; k < 700 && owed > 0.004; m = nextMonth(m), k++) {
    const due = dueDate(c, m); if (!due || due <= d.last || S.has(m)) continue;
    const t = dayMs(due) + 12 * 3600e3, ex0 = saved + per * Math.max(0, t - prev) / DAY_MS; saved = 0; prev = t;
    const i = debtInt(d, owed); if (mn0 + per * 28 <= i + 0.004 && ex0 + mn0 <= i + 0.004) return { never: true, flat: !per && d.minKind === 'interest', i };
    owed = c2(owed + i); interest += i;
    owed = c2(owed - Math.min(mn0, owed)); owed = c2(owed - Math.min(ex0, owed)); months++; end = due;
  }
  return owed > 0.004 ? { never: true, flat: false, i: debtInt(d, goalOf(id)) } : { months, end, interest: c2(interest) };
}
/* v296 (Jordan, 2026-10-15: "should we have it ticking up if the interest is adding to the total?"): what you owe, live.
   The month's interest builds up evenly from the last due day to the next, so on the due day it's all there (debtTick
   adds exactly that); the extra saved so far counts against it. */
function debtWin(id) {
  const d = debtOf(id), c = debtCat(id); if (!d || !c || d.done || !d.last) return null;
  let nx = null; const S = debtSeen(d); for (let m = d.last.slice(0, 7), k = 0; k < 3 && !nx; m = nextMonth(m), k++) { const due = dueDate(c, m); if (due && due > d.last && !S.has(m)) nx = due; }
  if (!nx) return null;
  const t0 = Math.max(dayMs(d.last), Math.min(Number(d.at || 0), dayMs(nx) - 1));   // a new debt: from when it was added
  return { t0, t1: dayMs(nx), i: debtInt(d, goalOf(id)), g: goalOf(id) };
}
const debtOweAt = (W, saved, now) => Math.max(0, W.g + W.i * Math.max(0, Math.min(1, (now - W.t0) / Math.max(1, W.t1 - W.t0))));   // v298: the balance as the card has it (the extra counts once you pay it)
// v297: a credit limit (optional) and what's left to spend on it, from the balance as the card has it
const debtRoom = id => { const d = debtOf(id); return d && d.limit > 0 ? c2(d.limit - goalOf(id)) : null; };
const liveDebts = () => state.pots.filter(p => { const d = debtOf(p.id); return d && !d.done; });
// v314: a debt that grows even when its minimum is paid gets a warning on Home, with the money a day that would turn it around
function debtWarnHTML() {
  const L = liveDebts().filter(p => debtGrow(p.id)); if (!L.length) return '';
  return '<div class="pp-dwarn" role="note">' + L.map(p => { const d = debtOf(p.id), c = debtCat(p.id), k = debtNeed(p.id), P = debtPlan(p.id);
    return `<p><b>${esc(p.name)} is growing.</b> About ${money(P.i)} interest a month is more than ${d.minKind === 'interest' ? 'goes in' : `the ${money(Number(c && c.budget || 0))} minimum`}${k ? `. ${money(k * WORKER_DAY)} a day more would shrink it` : ''}.</p>`; }).join('')
    + (plan ? '' : '<button class="pp-plan pp-opt" data-opt-go="1">Optimize</button>') + '</div>';
}
function debtLine(id) {
  const d = debtOf(id), c = debtCat(id); if (!d || !c) return '';
  if (d.done) return 'Paid off. Nothing left to pay.';
  const P = debtPlan(id), mn = `${d.minKind === 'interest' ? `Interest only (${money(Number(c.budget || 0))})` : `${money(Number(c.budget || 0))} minimum`} in Bills on the ${ordinal(Number(c.dueDay || 1))}`;
  const how = !P ? '' : P.never ? (P.flat ? 'it stays the same until you add money a day' : `growing: about ${money(P.i)} interest a month is more than goes in`) : `paid off ${monthYear(P.end)}, about ${money(P.interest)} more interest`;
  const W = debtWin(id);
  const rm = debtRoom(id), lim = rm == null ? '' : ` · ${rm >= 0 ? `${money(Math.floor(rm + 1e-9))} left to spend of ${money(d.limit)}` : `${money(Math.ceil(-rm - 1e-9))} over the ${money(d.limit)} limit`}`;
  const sv = Math.floor(projectBal(id) * 100 + 1e-6) / 100;   // v298
  return `${sv >= 0.01 ? `<b class="dl-sv">${moneyExact(sv)} saved to pay</b> · ` : ''}Owe ${W ? `<span class="dl-owe" data-owe="${esc(id)}">${moneyExact(Math.round(debtOweAt(W, projectBal(id), Date.now()) * 100) / 100)}</span>` : money(goalOf(id))} · ${d.apr}% APR · ${mn}${lim}${how ? ` · ${how}` : ''}`;
}
