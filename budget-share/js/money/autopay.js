'use strict';
const billSkips = () => (state.billSkips = state.billSkips || {});   // bills unmarked by hand after they hit
// A bill whose day has come is marked paid on its own, dated its due day; one with no due day is marked on
// the last day of its month once the month is over. A real bank payment replaces the mark later, and Undo
// keeps a bill unpaid (its money stays held) until you mark it.
// v218: has this month's bill come due yet (its due date, or the month's end when it has none)?
const billHit = (c, m, td = today()) => { const d = dueDate(c, m); return d ? d <= td : m < td.slice(0, 7); };
function autoSlay() {
  if (!state.startMonth || plan) return;   // v311: bills mark themselves paid by the real settings, not a plan's
  const now = Date.now(), td = today(), cur = td.slice(0, 7); let changed = false;
  // v218: an Undo from before the due date doesn't stop the bill marking itself paid when it hits
  for (const k of Object.keys(billSkips())) { const [id, m] = splitKey(k), c = state.categories.find(x => x.id === id); if (c && !billHit(c, m, td)) { delete billSkips()[k]; changed = true; } }
  const L = ledgerAt(td);
  for (const b of L.inst) {
    if (b.set || b.gone || b.m > cur || !L.have.has(b.key) || (L.paid[b.key] || NO_PAY).P > 0 || billSkips()[b.key] || !(b.A > 0)) continue;   // v311: a $0 bill can't be paid
    const day = b.due ? (b.due <= td ? b.due : null) : b.m < cur ? `${b.m}-${String(daysIn(b.m)).padStart(2, '0')}` : null;
    if (!day) continue;
    state.transactions.push({ ...paidMarker(b.c, b.m), date: day, billMonth: b.m, auto: true, gameSlain: true, at: now }); changed = true;
  }
  if (changed) save();
}
