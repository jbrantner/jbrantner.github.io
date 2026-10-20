'use strict';
/* ---------- an income farm, opened ---------- */
const ib = { id: null };
const ibInc = () => state.incomes.find(i => i.id === ib.id);
function openIncome(id) { ib.id = id; $('incomeBox').classList.remove('hidden'); $('villageHint').classList.add('hidden'); renderIncome(); }
function closeIncome() { ib.id = null; $('incomeBox').classList.add('hidden'); $('villageHint').classList.remove('hidden'); render(); }
function renderIncome() {
  const i = ibInc(); if (!i) { if (ib.id) closeIncome(); return; }
  if (document.activeElement !== $('ibName')) $('ibName').value = i.name;
  if (document.activeElement !== $('ibAmt')) $('ibAmt').value = i.amount || '';
  const tw = i.every === 'twice'; $('ibEvery').value = tw ? 'twice' : String(Number(i.every || 0)); $('ibAnchor').value = i.anchor || '';
  $('ibAnchorF').classList.toggle('hidden', tw); $('ibDaysF').classList.toggle('hidden', !tw);
  if (tw) { if (document.activeElement !== $('ibDay1')) $('ibDay1').value = (i.days || [15, 31])[0]; if (document.activeElement !== $('ibDay2')) $('ibDay2').value = (i.days || [15, 31])[1]; }
  // this month's paydays: what landed (tap to fix it), the ones waiting for you, and the ones still to come
  const d0 = d0Of(), rows = paydaysOf(i, month).map(date => {
    const k = checkKey(i, date), ck = (state.checks || {})[k];
    const right = date <= d0 ? '<span class="muted">before you started</span>'
      : ck ? `<span class="num">${moneyExact(Number(ck.amt))}</span> <button class="link" data-pay-open="${esc(k)}">Edit</button>`
      : (date <= today() || (nextPayNow() || {}).key === k) && Number(i.amount) > 0 ? `<button class="link" data-pay-open="${esc(k)}" style="color:var(--accent); font-weight:600">Enter paycheck</button>` : '<span class="muted">coming</span>';
    return `<div class="row spread" style="font-size:13.5px"><span>${shortDate(date)}</span><span>${right}</span></div>`;
  });
  $('ibInfo').innerHTML = rows.length ? `<div style="font-size:13px">Paydays this month</div>${rows.join('')}` : 'No paydays this month.';
  $('ibDel').classList.toggle('hidden', state.incomes.length < 2);
}
