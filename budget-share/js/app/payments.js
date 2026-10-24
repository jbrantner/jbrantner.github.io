'use strict';
// spending on a card: what you owe goes up now; it isn't this week's money (you pay it back through the minimum and extra)
function debtCharge(id, amt, note) {
  const d = debtOf(id); if (!d || d.done || !(amt > 0)) return null;
  const was = goalOf(id), st = Number(d.start || 0), x = { date: today(), at: Date.now(), charge: c2(amt), ...(note ? { note } : {}) };
  state.goals[id] = c2(was + amt); if (state.goals[id] > Number(d.start || 0)) d.start = state.goals[id];
  (d.log = d.log || []).push(x); save(); render();
  return () => { const i = d.log.indexOf(x); if (i >= 0) d.log.splice(i, 1); state.goals[id] = c2(goalOf(id) - x.charge); if (Number(d.start || 0) > st) d.start = Math.max(st, goalOf(id)); save(); render(); };   // v311: and its start
}
/* v147: payments out of a project. A move to 'debt' that leaves the bank; the project's goal comes down by the same. */
const debtPays = id => state.transfers.filter(t => t.debt && !t.spend && t.from === id).sort((a, b) => (b.at || 0) - (a.at || 0) || b.date.localeCompare(a.date));
function makePayment(id, amount, note = '') {
  const p = state.pots.find(x => x.id === id); if (!p) return null;
  const amt = Math.round(Number(amount) * 100) / 100, bal = Math.floor(projectBal(id) * 100 + 1e-6) / 100;
  if (!(amt >= 0.01) || amt > bal + 1e-9) return null;
  const was = goalOf(id), months = goalMonthsOf(id) || undefined;
  if (months) { delete state.goalMonths[id]; }
  const now = Math.max(0, Math.round((was - amt) * 100) / 100), cut = Math.round((was - now) * 100) / 100, off = was > 0 && now <= 0;
  if (now > 0) state.goals[id] = now; else delete state.goals[id];
  if (off) (state.paidOff = state.paidOff || {})[id] = Date.now();
  const t = { id: uid(), date: today(), at: Date.now(), from: id, to: 'debt', amount: amt, debt: true, goalCut: cut, ...(months ? { months } : {}), ...(off ? { paidOff: true } : {}), ...(note ? { note: String(note).slice(0, 80) } : {}) };
  state.transfers.push(t); save(); render();
  return t;
}
function undoPayment(tid) {
  const t = state.transfers.find(x => x.id === tid && x.debt); if (!t) return false;
  state.transfers = state.transfers.filter(x => x !== t);
  const id = t.from, g = Math.round((goalOf(id) + Number(t.goalCut || 0)) * 100) / 100;
  if (t.months && Math.abs(g - Math.ceil(t.months * billsMonthly() - 1e-9)) < 0.005) { (state.goalMonths = state.goalMonths || {})[id] = t.months; delete state.goals[id]; }
  else if (g > 0) state.goals[id] = g;
  if (g > 0 && state.paidOff) delete state.paidOff[id];
  if (g > 0.004) debtRevive(id);   // v311: it was the payment that paid it off
  save(); render(); return true;
}
/* Spending out of Savings (the Month cushion is Savings' first month of bills) or a pot, like a car repair: it leaves
   the bank the same way a payment does, with no goal to bring down, and this week's money isn't touched. */
const spendSrc = id => id === 'cushion' ? 'savings' : id;
const spendRoom = id => Math.max(0, Math.floor(placeBal(spendSrc(id)) * 100 + 1e-6) / 100);
const spendsOf = id => state.transfers.filter(t => t.spend && t.from === spendSrc(id)).sort((a, b) => (b.at || 0) - (a.at || 0) || b.date.localeCompare(a.date));
function spendFrom(id, amount, note = '') {
  const from = spendSrc(id); if (from !== 'savings' && !state.pots.some(x => x.id === from)) return null;
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt >= 0.01) || amt > spendRoom(id) + 1e-9) return null;
  const t = { id: uid(), date: today(), at: Date.now(), from, to: 'debt', amount: amt, debt: true, spend: true, ...(note ? { note: String(note).slice(0, 80) } : {}) };
  state.transfers.push(t); save(); render();
  return t;
}
function undoSpendFrom(tid) {
  const t = state.transfers.find(x => x.id === tid && x.spend); if (!t) return false;
  state.transfers = state.transfers.filter(x => x !== t); save(); render(); return true;
}
