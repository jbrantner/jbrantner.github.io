'use strict';
let debtFor = null;
function openDebt(id) {
  if (planBlock()) return;
  if (debtOf(id)) {   // v298: a debt's extra: you paid the whole dollars saved; what you owe comes down by that
    const amt = debtPayAmt(id), say = amt % 1 ? moneyExact(amt) : money(amt); if (!(amt >= 0.01)) return;   // v311: never more than is owed
    const t = makePayment(id, amt, 'extra'); if (!t) return;
    toastUndo(t.paidOff ? `Paid ${say} · ${potName(id)} is paid off!` : `Paid ${say} on ${potName(id)} · owe ${moneyExact(goalOf(id))}`, () => { undoPayment(t.id); toast('Payment taken back'); });
    return; }
  debtFor = id; const bal = Math.floor(projectBal(id) * 100 + 1e-6) / 100;
  $('debtTitle').textContent = `Make a payment from ${potName(id)}`;
  $('debtSays').textContent = debtOf(id) ? `Pay extra now, out of what ${potName(id)} has saved (up to ${moneyExact(bal)}). It leaves your bank and what you owe comes down by the same.` : `Money you pay out of ${potName(id)}, up to ${moneyExact(bal)}. It leaves your bank and the goal comes down by the same amount.`;
  $('debtAmt').value = ''; $('debtAmt').max = String(bal); $('debtNote').value = ''; debtPreview();
  $('debtBox').classList.remove('hidden'); setTimeout(() => $('debtAmt').focus(), 60);
}
function closeDebt() { debtFor = null; $('debtBox').classList.add('hidden'); }
function debtPreview() {
  const id = debtFor; if (!id) return;
  const bal = Math.floor(projectBal(id) * 100 + 1e-6) / 100, amt = Math.round(Number($('debtAmt').value || 0) * 100) / 100, g = goalOf(id);
  const ok = amt >= 0.01 && amt <= bal + 1e-9;
  $('debtGo').disabled = !ok;
  $('debtAfter').textContent = !$('debtAmt').value ? '' : amt > bal + 1e-9 ? `${potName(id)} has ${moneyExact(bal)}.` : !ok ? '' :
    `${potName(id)} goes to ${moneyExact(bal - amt)}${g > 0 ? ` of ${moneyExact(Math.max(0, g - amt))}` : ''} · your bank −${moneyExact(amt)}${g > 0 && g - amt <= 0 ? ' · paid off!' : ''}`;
}
function saveDebt() {
  const id = debtFor; if (!id) return;
  const t = makePayment(id, $('debtAmt').value, $('debtNote').value.trim()); if (!t) { debtPreview(); return; }
  closeDebt();
  toastUndo(t.paidOff ? `Paid ${moneyExact(t.amount)} · ${potName(id)} is paid off!` : `Paid ${moneyExact(t.amount)} from ${potName(id)}`, () => { undoPayment(t.id); toast('Payment taken back'); });
}
$('debtCancel').onclick = closeDebt; $('debtGo').onclick = saveDebt; $('debtAmt').oninput = debtPreview;   // v147
