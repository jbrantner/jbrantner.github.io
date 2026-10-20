'use strict';
/* The bank box: what the app counts in your bank (everything you have, bill money held and pay still coming
   in), and "Adjust" to set it to what your bank really shows. Bills held or marked paid in the last few days
   come first, since whether they've come out changes what the bank shows. The difference goes into or out of
   Savings, dated today. */
const acctNames = () => state.accounts.length > 1 ? state.accounts.slice(0, -1).join(', ') + ' and ' + state.accounts[state.accounts.length - 1] : '';
function bankRows() {
  const td = today(), pp = hoardParts(), lim = ymd(new Date(Date.now() - 3 * DAY_MS)), mon = m => new Date(m + '-15T12:00').toLocaleDateString(undefined, { month: 'long' });
  const auto = state.transactions.filter(t => t.auto && t.markedPaid && t.date >= lim && t.date <= td && state.categories.some(c => c.id === t.categoryId))
    .map(t => { const key = t.categoryId + '|' + billMonthOf(t); return { key, kind: 'auto', name: catName(t.categoryId), amt: Math.abs(t.amount), when: `marked paid ${shortDate(t.date)}`, paid: bankPick[key] !== 'no' }; });
  const held = pp.heldList.map(b => ({ key: b.key, b, kind: 'held', name: b.c.name, amt: cents(Number(b.c.budget || 0)), when: b.due ? `due ${shortDate(b.due)}` : `${mon(b.m)}, no due day`, paid: bankPick[b.key] === 'paid' }));
  return { pp, rows: [...auto, ...held] };
}
const bankExpect = (rows, pp) => pp.bank - sum(rows.filter(r => r.kind === 'held' && r.paid), r => r.amt) + sum(rows.filter(r => r.kind === 'auto' && !r.paid), r => r.amt);
function bankDiff(rows, pp) {
  const v = $('bankAmt').value.trim(), B = Number(v), ok = v !== '' && isFinite(B);
  $('bankGo').disabled = !ok;
  if (!ok) { $('bankDiff').textContent = ''; return; }
  const d = cents(B - bankExpect(rows, pp));
  $('bankDiff').textContent = Math.abs(d) < 0.005 ? "That's exactly what the app counts." : d > 0 ? `That's ${moneyExact(d)} more than the app counts. It goes into Savings.` : `That's ${moneyExact(-d)} less than the app counts. It comes out of Savings.`;
}
function renderBank() {
  const { pp, rows } = bankRows(), two = acctNames();
  $('bankSays').innerHTML = `The app counts <strong class="num">${moneyExact(pp.bank)}</strong> in ${two ? esc(two) + ' together' : 'your bank'} right now.`;
  $('bankForm').classList.toggle('hidden', !bankOpen); $('bankOpen').classList.toggle('hidden', bankOpen);
  if (bankOpen) {
    $('bankBills').innerHTML = rows.length ? `<div class="muted" style="font-size:13px; margin-top:8px">First: have these come out of your bank yet?</div>` + rows.map(r => `<div class="row spread bank-bill"><span style="min-width:0">${esc(r.name)} <span class="muted" style="font-size:12px">· ${esc(r.when)}</span></span><span class="row" style="gap:4px; flex:none"><button class="chip${r.paid ? ' on' : ''}" data-bank-bill="${esc(r.key)}" data-v="paid">Paid</button><button class="chip${r.paid ? '' : ' on'}" data-bank-bill="${esc(r.key)}" data-v="no">Not yet</button></span></div>`).join('') : '';
    $('bankAsk').textContent = two ? `What ${two} hold now, added up` : 'What your bank shows now';
    bankDiff(rows, pp);
  }
  const fx = (state.adjusts || []).slice(-3).reverse();
  $('bankFixes').innerHTML = fx.map(a => `<div class="row spread muted" style="font-size:12.5px; padding:2px 0"><span>${shortDate(a.date)} · set to ${moneyExact(a.bank)} (${a.amount < 0 ? '−' : '+'}${moneyExact(Math.abs(a.amount))} Savings)</span><button class="link danger" data-bank-undo="${esc(a.id)}">Undo</button></div>`).join('');
}
function bankGo() {
  const v = $('bankAmt').value.trim(), B = Number(v); if (v === '' || !isFinite(B)) return;
  const { rows } = bankRows(), now = Date.now(), td = today();
  for (const r of rows) {
    if (r.kind === 'held' && r.paid) { state.transactions.push({ ...paidMarker(r.b.c, r.b.m), date: td, billMonth: r.b.m, gameSlain: true, at: now }); delete billSkips()[r.key]; }
    if (r.kind === 'auto' && !r.paid) { const [id, m] = splitKey(r.key); dropMarker(id, m); billSkips()[r.key] = true; }
  }
  save();   // the books start afresh with those bills, then the fix is whatever's still different
  const d = cents(B - hoardParts(now).bank), id = uid();
  if (Math.abs(d) >= 0.005) state.adjusts.push({ id, at: now, date: td, amount: d, bank: cents(B) });
  bankOpen = false; bankPick = {}; $('bankAmt').value = ''; save(); render();
  if (Math.abs(d) < 0.005) { toast('Your bank matches what the app counts ✓'); return; }
  toastUndo(`Balance set: ${d > 0 ? '+' : '−'}${moneyExact(Math.abs(d))} ${d > 0 ? 'into' : 'out of'} Savings`, () => { state.adjusts = state.adjusts.filter(a => a.id !== id); save(); render(); });
}
$('bankCheckBtn').onclick = () => openBankCheck(false);   // v136
$('bcAmt').addEventListener('input', () => { const v = $('bcAmt').value.trim(); $('bcGo').disabled = !(v !== '' && isFinite(Number(v))); });
$('bcAmt').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('bcGo').disabled) bankCheckGo(); });
$('bcGo').onclick = bankCheckGo;
$('bcLater').onclick = () => { if (bc && bc.done) { closeBankCheck(); return; } bankCheckLater(); };
$('bcClose').onclick = () => $('bcLater').click();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && bc) $('bcLater').click(); });
$('bankOpen').onclick = () => { bankOpen = true; bankPick = {}; renderBank(); $('bankAmt').focus(); };
$('bankCancel').onclick = () => { bankOpen = false; bankPick = {}; $('bankAmt').value = ''; renderBank(); };
$('bankAmt').addEventListener('input', () => { const { rows, pp } = bankRows(); bankDiff(rows, pp); });
$('bankAmt').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('bankGo').disabled) bankGo(); });
$('bankGo').onclick = bankGo;
$('bankBox').addEventListener('click', e => {
  const b = e.target.closest('[data-bank-bill]'); if (b) { bankPick[b.dataset.bankBill] = b.dataset.v; renderBank(); return; }
  const u = e.target.closest('[data-bank-undo]'); if (u) { state.adjusts = state.adjusts.filter(a => a.id !== u.dataset.bankUndo); save(); render(); toast('Balance fix taken back'); }
});
