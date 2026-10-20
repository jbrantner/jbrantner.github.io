'use strict';
let debtFor = null, spendFor = false;   // spendFor: the same box spends out of Savings, the cushion or a pot
function openDebt(id) {
  if (planBlock()) return;
  if (debtOf(id)) {   // v298: a debt's extra: you paid the whole dollars saved; what you owe comes down by that
    const amt = debtPayAmt(id), say = amt % 1 ? moneyExact(amt) : money(amt); if (!(amt >= 0.01)) return;   // v311: never more than is owed
    const t = makePayment(id, amt, 'extra'); if (!t) return;
    toastUndo(t.paidOff ? `Paid ${say} · ${potName(id)} is paid off!` : `Paid ${say} on ${potName(id)} · owe ${moneyExact(goalOf(id))}`, () => { undoPayment(t.id); toast('Payment taken back'); });
    return; }
  debtFor = id; spendFor = false; const bal = Math.floor(projectBal(id) * 100 + 1e-6) / 100;
  $('debtTitle').textContent = `Make a payment from ${potName(id)}`;
  $('debtSays').textContent = debtOf(id) ? `Pay extra now, out of what ${potName(id)} has saved (up to ${moneyExact(bal)}). It leaves your bank and what you owe comes down by the same.` : `Money you pay out of ${potName(id)}, up to ${moneyExact(bal)}. It leaves your bank and the goal comes down by the same amount.`;
  $('debtAmt').value = ''; $('debtAmt').max = String(bal); $('debtNote').value = ''; debtPreview();
  $('debtGo').textContent = 'Pay'; $('debtBox').classList.remove('hidden'); setTimeout(() => $('debtAmt').focus(), 60);
}
const spendName = id => id === 'cushion' ? 'Month cushion' : potName(id);
function openSpend(id) {
  if (planBlock()) return;
  debtFor = id; spendFor = true; const bal = spendRoom(id), nm = spendName(id);
  $('debtTitle').textContent = `Spend from ${nm}`;
  const T = billsMonthWhole(), more = id === 'savings' && T > 0 && bal > T + 0.005 ? ', the Month cushion included' : '', g = id !== 'savings' && id !== 'cushion' && goalOf(id) > 0 ? ' Its goal stays the same.' : '';
  $('debtSays').textContent = `Money you spent out of ${nm}, up to ${moneyExact(bal)}${more}. It leaves your bank and ${nm} goes down by the same.${g} This week's money isn't touched.`;
  $('debtAmt').value = ''; $('debtAmt').max = String(bal); $('debtNote').value = ''; debtPreview();
  $('debtGo').textContent = 'Spend'; $('debtBox').classList.remove('hidden'); setTimeout(() => $('debtAmt').focus(), 60);
}
function spendPreview(id, amt) {   // what Savings and the cushion (Savings' first month of bills) go to
  const bal = spendRoom(id), nm = spendName(id);
  if (amt > bal + 1e-9) return `${nm} has ${moneyExact(bal)}.`;
  if (spendSrc(id) !== 'savings') return `${nm} goes to ${moneyExact(bal - amt)} · your bank −${moneyExact(amt)}`;
  const T = billsMonthWhole(), S = bal, after = c2(S - amt);
  if (!(T > 0)) return `Savings goes to ${moneyExact(after)} · your bank −${moneyExact(amt)}`;
  const cu = `Month cushion ${S >= T - 0.005 && after >= T - 0.005 ? 'stays full' : `goes to ${moneyExact(Math.min(T, after))} of ${money(T)}`}`;
  return `${S > T + 0.005 ? `Savings goes to ${moneyExact(Math.max(0, after - T))} · ` : ''}${cu} · your bank −${moneyExact(amt)}`;
}
function closeDebt() { debtFor = null; spendFor = false; $('debtBox').classList.add('hidden'); }
function debtPreview() {
  const id = debtFor; if (!id) return;
  if (spendFor) { const amt = Math.round(Number($('debtAmt').value || 0) * 100) / 100, ok = amt >= 0.01 && amt <= spendRoom(id) + 1e-9;
    $('debtGo').disabled = !ok; $('debtAfter').textContent = !$('debtAmt').value ? '' : !ok && amt <= spendRoom(id) ? '' : spendPreview(id, amt); return; }
  const bal = Math.floor(projectBal(id) * 100 + 1e-6) / 100, amt = Math.round(Number($('debtAmt').value || 0) * 100) / 100, g = goalOf(id);
  const ok = amt >= 0.01 && amt <= bal + 1e-9;
  $('debtGo').disabled = !ok;
  $('debtAfter').textContent = !$('debtAmt').value ? '' : amt > bal + 1e-9 ? `${potName(id)} has ${moneyExact(bal)}.` : !ok ? '' :
    `${potName(id)} goes to ${moneyExact(bal - amt)}${g > 0 ? ` of ${moneyExact(Math.max(0, g - amt))}` : ''} · your bank −${moneyExact(amt)}${g > 0 && g - amt <= 0 ? ' · paid off!' : ''}`;
}
function saveDebt() {
  const id = debtFor; if (!id) return;
  if (spendFor) { const t = spendFrom(id, $('debtAmt').value, $('debtNote').value.trim()); if (!t) { debtPreview(); return; }
    closeDebt(); toastUndo(`Spent ${moneyExact(t.amount)} from ${spendName(id)}${t.note ? ` · ${t.note}` : ''}`, () => { undoSpendFrom(t.id); toast('Spending taken back'); }); return; }
  const t = makePayment(id, $('debtAmt').value, $('debtNote').value.trim()); if (!t) { debtPreview(); return; }
  closeDebt();
  toastUndo(t.paidOff ? `Paid ${moneyExact(t.amount)} · ${potName(id)} is paid off!` : `Paid ${moneyExact(t.amount)} from ${potName(id)}`, () => { undoPayment(t.id); toast('Payment taken back'); });
}
$('debtCancel').onclick = closeDebt; $('debtGo').onclick = saveDebt; $('debtAmt').oninput = debtPreview;   // v147
