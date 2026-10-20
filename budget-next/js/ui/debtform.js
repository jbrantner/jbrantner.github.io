'use strict';
/* v295: add or edit a debt */
let dbtFor = null, dbtKind = 'amount';
function openDebtForm(id) {
  dbtFor = id; const d = id ? debtOf(id) : null, c = id ? debtCat(id) : null;
  $('dbtTitle').textContent = d ? `Edit ${potName(id)}` : 'Add a debt';
  $('dbtName').value = d ? potName(id) : ''; $('dbtOwed').value = d ? String(goalOf(id)) : ''; $('dbtApr').value = d ? String(d.apr) : '';
  $('dbtDue').value = c ? String(c.dueDay || '') : ''; $('dbtMin').value = d && d.minKind !== 'interest' ? String(d.min) : ''; $('dbtLim').value = d && d.limit > 0 ? String(d.limit) : '';
  dbtSetKind(d ? d.minKind : 'amount'); $('dbtDel').hidden = !d;
  $('dbtBox').classList.remove('hidden'); dbtSay(); setTimeout(() => (d ? $('dbtOwed') : $('dbtName')).focus(), 60);
}
function dbtSetKind(k) { dbtKind = k === 'interest' ? 'interest' : 'amount'; document.querySelectorAll('#dbtBox [data-dk]').forEach(b => { b.classList.toggle('on', b.dataset.dk === dbtKind); b.setAttribute('aria-pressed', b.dataset.dk === dbtKind); }); $('dbtMinF').hidden = dbtKind === 'interest'; dbtSay(); }
function dbtRead() {
  return { name: $('dbtName').value.trim(), owed: c2(Number($('dbtOwed').value) || 0), apr: Math.max(0, Number($('dbtApr').value) || 0),
    due: Math.min(31, Math.max(1, Math.round(Number($('dbtDue').value) || 0))), dueSet: Number($('dbtDue').value) >= 1, minKind: dbtKind, min: c2(Number($('dbtMin').value) || 0), limit: Math.max(0, c2(Number($('dbtLim').value) || 0)) };
}
function dbtSay() {
  const f = dbtRead(), el = $('dbtSay');
  if (!(f.owed > 0) || !f.dueSet || (f.minKind === 'amount' && !(f.min > 0))) { el.textContent = ''; return; }
  const d = { apr: f.apr, minKind: f.minKind, min: f.min }, i = debtInt(d, f.owed), mn = debtMinFor(d, f.owed);
  if (mn <= i + 0.004) { el.textContent = f.minKind === 'interest' ? `Interest only: about ${money(mn)} a month in Bills, and what you owe stays put until you add money a day.` : `About ${moneyExact(i)} a month in interest is more than the ${money(mn)} minimum, so it grows. Add money a day to pay it down.`; return; }
  let owed = f.owed, n = 0, tot = 0; while (owed > 0.004 && n < 700) { const x = debtInt(d, owed); tot += x; owed = c2(owed + x - Math.min(mn, owed + x)); n++; }
  el.textContent = n >= 700 ? '' : `With just the ${money(mn)} minimum: paid off in ${n} month${n === 1 ? '' : 's'}, about ${money(tot)} in interest. Money a day on it makes that sooner.`;
}
function dbtSave() {
  const f = dbtRead();
  if (!f.name) { toast('Give it a name'); $('dbtName').focus(); return; }
  if (!(f.owed > 0)) { toast('Type what you owe now'); $('dbtOwed').focus(); return; }
  if (!f.dueSet) { toast('Type the day it\'s due'); $('dbtDue').focus(); return; }
  if (f.minKind === 'amount' && !(f.min > 0)) { toast('Type the minimum payment'); $('dbtMin').focus(); return; }
  const d0 = { apr: f.apr, minKind: f.minKind, min: f.min }, mn = debtMinFor(d0, f.owed);
  if (dbtFor) {
    const id = dbtFor, d = debtOf(id), p = state.pots.find(x => x.id === id);
    if (d.done) {   // v311: paid off, now owed again: it starts over, as if just added
      const o = debtCat(id), n = { id: uid(), name: '', budget: 0, kind: 'bill', dueDay: f.due, account: (o && o.account) || (state.accounts || [])[0], at: Date.now(), debtId: id };
      for (const e of d.log || []) if (e.int != null && !e.cat) e.cat = d.cat;   // the months charged so far were the old bill's
      state.categories.push(n); Object.assign(d, { cat: n.id, start: 0, at: Date.now() }); delete d.done; delete d.doneCat; if (state.paidOff) delete state.paidOff[id]; }
    const c = debtCat(id);
    if (p) p.name = f.name;
    Object.assign(d, { apr: f.apr, minKind: f.minKind, min: f.minKind === 'amount' ? f.min : 0, limit: f.limit || 0 });
    const set = Math.abs(goalOf(id) - f.owed) >= 0.005;
    if (set) { state.goals[id] = f.owed; if (f.owed > Number(d.start || 0)) d.start = f.owed; (d.log = d.log || []).push({ date: today(), set: f.owed }); }   // Update balance
    if (c) { c.name = `${f.name} ${f.minKind === 'interest' ? 'interest' : 'minimum'}`; c.dueDay = f.due; c.budget = mn; }
    if (set && c) { const td = today(); d.last = dueDate(c, td.slice(0, 7)) === td ? ymd(new Date(dayMs(td) - DAY_MS / 2)) : td; d.at = Date.now(); }   // v311: the new balance is today's (as when added)
    save(); closeDebtForm(); render(); toast(`${f.name} saved`); return;
  }
  const id = uid(), now = Date.now(), td = today();
  state.pots.push({ id, name: f.name }); state.goals[id] = f.owed;
  const c = { id: uid(), name: `${f.name} ${f.minKind === 'interest' ? 'interest' : 'minimum'}`, budget: mn, kind: 'bill', dueDay: f.due, account: (state.accounts || [])[0], at: now, debtId: id };
  state.categories.push(c);
  // the owed amount is from today: a due day before today was paid already; one due today is still to come (the bill says so too)
  const last = dueDate(c, td.slice(0, 7)) === td ? ymd(new Date(dayMs(td) - DAY_MS / 2)) : td;
  (state.debts = state.debts || {})[id] = { apr: f.apr, minKind: f.minKind, min: f.minKind === 'amount' ? f.min : 0, limit: f.limit || 0, start: f.owed, cat: c.id, last, at: now, log: [] };
  save(); closeDebtForm(); render(); toast(`Added ${f.name}. Its ${money(mn)} ${f.minKind === 'interest' ? 'interest' : 'minimum'} is in Bills now.`);
}
async function dbtDelete() {
  const id = dbtFor; if (!id) return;
  if (!await ask(`Delete ${potName(id)}? Its minimum stops coming up in Bills (what it already cost stays counted).`)) return;
  closeDebtForm(); if (!await deletePot(id, 'savings')) return;   // v311: No there keeps the debt as it was
  const d = debtOf(id), c = d && state.categories.find(x => x.id === d.cat);
  if (c) { state.categories = state.categories.filter(x => x !== c); (state.goneCats = state.goneCats || []).push({ ...c, gone: Date.now() }); }
  delete state.debts[id]; save(); render();
}
function closeDebtForm() { dbtFor = null; $('dbtBox').classList.add('hidden'); }
$('dbtCancel').onclick = closeDebtForm; $('dbtGo').onclick = dbtSave; $('dbtDel').onclick = dbtDelete;
document.querySelectorAll('#dbtBox [data-dk]').forEach(b => b.onclick = () => dbtSetKind(b.dataset.dk));
['dbtName', 'dbtOwed', 'dbtApr', 'dbtDue', 'dbtMin'].forEach(k => $(k).addEventListener('input', dbtSay));
$('debtAmt').onkeydown = $('debtNote').onkeydown = e => { if (e.key === 'Enter' && !$('debtGo').disabled) saveDebt(); };
$('debtBox').addEventListener('click', e => { if (e.target.id === 'debtBox') closeDebt(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && debtFor) closeDebt(); });
