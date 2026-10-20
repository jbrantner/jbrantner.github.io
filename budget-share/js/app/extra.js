'use strict';
function addExtra(amt, note, mode, to) {
  const now = Date.now(), P = extraPlan(amt, mode, to, now); if (!(P.amt > 0)) return null;
  const id = uid(), e = { id, date: ymd(new Date(now)), at: now, amt: P.amt, note: String(note || '').trim().slice(0, 60), mode, ...(mode === 'place' ? { to: to || 'savings' } : {}), ...(mode === 'villagers' ? { V: P.V, t1: P.t1, next: P.next } : {}) };
  (state.extras = state.extras || []).push(e);
  for (const m of P.moves) state.transfers.push({ id: uid(), date: e.date, at: now, from: 'savings', to: m.id, amount: m.a, extra: id });
  booksGen++; needMemo.clear(); save(); render();
  toastUndo(`Extra ${moneyExact(P.amt)}: ${P.text}`, () => takeExtra(id, true));
  return e;
}
function takeExtra(id, quiet) {
  state.extras = (state.extras || []).filter(e => e.id !== id); state.transfers = state.transfers.filter(t => t.extra !== id);
  booksGen++; needMemo.clear(); save(); render(); toast(quiet ? 'Extra money taken back out' : 'Taken out');
}
