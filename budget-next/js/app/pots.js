'use strict';
// A pot with no goal: a stockhold. Returns its id (or null if it has no name). The Town page uses it too.
function addPot(name) {
  name = String(name || '').trim(); if (!name) { toast('Give the pot a name'); return null; }
  const id = uid(); state.pots.push({ id, name }); save(); render(); toast(`Added ${name}`); return id;
}
// Delete a pot (its money goes back to Fun, after asking). The town's Manage section uses it too.
async function deletePot(id, home = 'spend') {   // v167: the town's pot cards send it home to Savings
  const p = potBalances(today().slice(0, 7)).find(p => p.id === id); if (!p) return false;
  if (home === 'savings') { if (!await ask(Math.abs(p.bal) >= 0.005 ? `Delete ${p.name}? Its ${moneyExact(Math.floor(p.bal * 100 + 1e-6) / 100)} goes into Savings, and so does its money a day.` : `Delete ${p.name}?`)) return false; }
  else if (Math.abs(p.bal) >= 0.005 && !await ask(`Delete ${p.name}? Its ${money(p.bal)} goes back to Fun.`)) return false;
  const sv0 = home === 'savings' ? Math.round(potBalances(today().slice(0, 7)).find(x => x.id === 'savings').bal * 100) : 0;
  // Pointing its moves at Spending hands the balance back there and keeps the history readable.
  state.transfers.forEach(t => { if (t.from === id) t.from = home; if (t.to === id) t.to = home; });
  state.transfers = state.transfers.filter(t => t.from !== t.to);
  // Crops grown in earlier months go back to Spending as a move; this month's come back on their own.
  const earlier = cents(grown(id, 0, monthStartMs(today().slice(0, 7))));
  if (earlier > 0) state.transfers.push({ id: uid(), date: today(), from: id, to: home, amount: earlier });
  state.workerLog = state.workerLog.filter(w => w.pot !== id);
  state.pots = state.pots.filter(x => x.id !== id); delete state.goals[id]; delete state.goalMonths[id];
  state.combos = state.combos.filter(c => !c.from.includes(id) && !c.to.includes(id));
  if (state.colors) delete state.colors[id];
  if (home === 'savings') {   // whatever didn't land in Savings by itself (this month's crops) moves there from the purse
    const gap = Math.round(p.bal * 100) - (Math.round(potBalances(today().slice(0, 7)).find(x => x.id === 'savings').bal * 100) - sv0);
    if (gap > 0) state.transfers.push({ id: uid(), date: today(), from: 'spend', to: 'savings', amount: gap / 100 });
    toast(`Deleted ${p.name}${p.bal >= 0.005 ? ` · ${moneyExact(Math.floor(p.bal * 100 + 1e-6) / 100)} into Savings` : ''}`);
  }
  save(); render(); return true;
}
// A new name for one of your pots (stockholds and projects), from its town sheet.
function renamePot(id, name) {
  const p = state.pots.find(x => x.id === id); name = String(name || '').trim(); if (!p || !name || name === p.name) { render(); return; }
  p.name = name; save(); render(); toast(`Renamed to ${name}`);
}
// Whether a pot covers overspending when no mini project is being built (Storage, and the town's sheets).
function setCover(id, on) { const set = new Set(coverPots()); on ? set.add(id) : set.delete(id); state.coverPots = [...set]; save(); }
// One worker on (d = 1) or off (d = -1) a pot. The Town page's crew buttons use it too.
function setCrew(id, d) {
  if (clockHold()) return;   // v137
  if (id === 'savings' || !canFarm(id)) return;
  if (state.roundOff) { toast('Rounding off right now. Tap Stop first.'); return; }
  if (isLocked(id)) { toast(`${potName(id)} is locked. Unlock it first.`); return; }
  const goal = goalOf(id);
  if (d > 0 && goal > 0 && projectBal(id) >= goal - 0.005) { toast("That one's full. Raise its goal to keep saving."); return; }
  if (d > 0 && savers() < 1) { toast(`Nothing is free. Your pay covers ${money(maxWorkers() * WORKER_DAY)} a day, and it's all on weekly spending or a project.`); return; }
  if (d < 0 && workersAt(id) < 1) return;
  reassign(stampNow(), { [id]: d }, true); save(); render();
}
// Move n workers from one place to another (Savings, a stockhold or a project), one at a time, stopping at the
// first one that can't go: from Savings it's setCrew(to, +1); back to Savings it's setCrew(from, −1); between two
// pots it's both at once (− there, + here), with +'s checks (a built project takes no more). The town's
// Workers chips use it. No money moves.
function moveWorker(from, to, n = 1) {
  const ok = id => id === 'savings' || (canFarm(id) && state.pots.some(p => p.id === id));
  if (from === to || !ok(from) || !ok(to)) return 0;
  if (clockHold()) return 0;   // v137
  if (state.roundOff) { toast('Rounding off right now. Tap Stop first.'); return 0; }
  if (isLocked(from) || isLocked(to)) { toast(`${potName(isLocked(from) ? from : to)} is locked. Unlock it first.`); return 0; }
  let moved = 0;
  for (let k = 0; k < n; k++) {
    if (from === 'savings') { const w = workersAt(to); setCrew(to, 1); if (workersAt(to) === w) break; }
    else if (to === 'savings') { const w = workersAt(from); setCrew(from, -1); if (workersAt(from) === w) break; }
    else {
      if (workersAt(from) < 1) break;
      const goal = goalOf(to); if (goal > 0 && projectBal(to) >= goal - 0.005) { toast("That one's full. Raise its goal to keep saving."); break; }
      reassign(stampNow(), { [from]: -1, [to]: 1 }, true); save(); render();
    }
    moved++;
  }
  if (moved) toast(`Moved ${money(moved * WORKER_DAY)} a day from ${potName(from)} to ${potName(to)}`);
  return moved;
}
// A goal in months of bills shows what it comes to while you type.
function goalHint() {
  const inMonths = $('newGoalUnit').value === 'months', b = billsMonthly(), n = Math.round(Number($('newGoalAmt').value) || 0);
  $('newGoalHint').classList.toggle('hidden', !inMonths);
  $('newGoalName').placeholder = inMonths ? 'Name, e.g. Bills buffer' : 'Mini project, e.g. Laptop';
  $('newGoalAmt').placeholder = inMonths ? 'Months' : 'Goal';
  if (inMonths) $('newGoalHint').textContent = !(b > 0) ? 'Add your bills on the Upkeep page first, so the app knows what a month costs.'
    : `${n > 0 ? `${n} month${n === 1 ? '' : 's'} of bills = ${money(Math.ceil(n * b - 1e-9))}.` : 'How many months of bills?'} Your bills are ${money(b)} a month. If they change, the goal changes with them.`;
}
// A mini project: a pot with a goal in dollars or months of bills. Returns its id, or null. The Town page uses it too.
function addProject(name, amt, inMonths) {
  name = String(name || '').trim(); amt = Number(amt) || 0; const n = Math.round(amt);
  if (!name) { toast('Name your mini project'); return null; }
  if (inMonths && !(billsMonthly() > 0)) { toast('Add your bills first, so the app knows what a month costs'); return null; }
  if (inMonths && !(n > 0)) { toast('How many months of bills?'); return null; }
  const id = uid(); state.pots.push({ id, name });
  if (inMonths) state.goalMonths[id] = n; else if (amt > 0) state.goals[id] = amt;
  save(); render();
  toast(inMonths ? `Started ${name}: ${n} month${n === 1 ? '' : 's'} of bills, ${money(goalOf(id))}. Give it some money a day.` : `Started ${name}. Give it some money a day.`);
  return id;
}
// A pot's goal box or its unit (dollars or months of bills) changed: on Manage pots, or in a town sheet.
function goalChange(t) {
  const gm = state.goalMonths, unit = t.dataset.goalUnit;
  if (unit) {   // switching units keeps the goal about the same size
    const b = billsMonthly(), g = goalOf(unit);
    if (t.value === 'months') {
      if (!(b > 0)) { toast('Add your bills first, so the app knows what a month costs'); render(); return; }
      gm[unit] = g > 0 ? Math.max(1, Math.round(g / b)) : 3; delete state.goals[unit];   // v311: 3 only for a goal of 0
    } else { delete gm[unit]; if (g > 0) state.goals[unit] = g; }
    save(); render(); return;
  }
  const id = t.dataset.goal; if (!id) return;
  if (gm[id]) { const n = Math.round(Number(t.value) || 0); if (n > 0) gm[id] = n; else delete gm[id]; }
  else { const v = Math.floor(Number(t.value) || 0); if (v > 0) state.goals[id] = v; else delete state.goals[id]; }
  save(); render();
}
