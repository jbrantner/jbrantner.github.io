'use strict';
/* ---------- payday ----------
   On payday the app asks what landed (once a session; "Later" waits until you open the app again). Until
   you say, that paycheck counts as nothing. A paycheck can be fixed or taken out from its farm. */
function openPay(key) {
  if (!key || planBlock()) return;
  const [id, date] = splitKey(key), inc = state.incomes.find(i => i.id === id), ck = (state.checks || {})[key];
  payKey = key;
  const early = date > today();
  $('payTitle').textContent = ck ? (early ? 'Your next paycheck' : 'This paycheck') : early ? 'Your next paycheck' : 'Payday! What landed?';   // v192
  $('payWhen').textContent = `${early ? 'For your paycheck of ' : ''}${new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${inc ? inc.name : 'Paycheck'}`;
  $('payAmt').value = ck ? Number(ck.amt) : ''; $('payAmt').placeholder = inc && Number(inc.amount) ? `Usually ${money(Number(inc.amount))}` : '$';
  $('payDel').classList.toggle('hidden', !ck); $('payLater').textContent = ck ? 'Cancel' : 'Later';
  $('payBox').classList.remove('hidden'); payPlan();
  setTimeout(() => { if (payKey === key) $('payAmt').focus(); }, 60);
}
function closePay() { payKey = null; $('payBox').classList.add('hidden'); }
// What happens to it, as you type: the bills' share, what's yours a day until the next payday (its villagers), the cents.
function payPlan() {
  if (!payKey) return;
  const v = $('payAmt').value.trim(), D = Number(v), ok = v !== '' && isFinite(D) && D >= 0 && D < 1e7;
  $('paySave').disabled = !ok;
  if (!ok) { $('payPlan').textContent = splitKey(payKey)[1] > today() ? 'Type what your pay summary says, cents and all.' : 'Type what landed in your bank, cents and all.'; return; }   // v192
  const [id, date] = splitKey(payKey), inc = state.incomes.find(i => i.id === id), P = periodOf(inc, date);
  const whole = Math.floor(D + 1e-9), cut = cents(D - whole), share = shareOf(inc, date), F = Math.max(0, whole - share), V = Math.floor(F / P.days / WORKER_DAY + 1e-9), extra = F - V * P.days;
  const until = P.next ? shortDate(P.next) : 'two weeks from now', was = villagersBefore(date), out = [];
  const nC = normalChecks(inc || {}), part = state.incomes.filter(i => Number(i.amount) > 0).length > 1 ? 'its part' : nC === 1 ? 'all' : nC === 2 ? 'half' : nC === 4 ? 'a quarter' : `1/${nC}`;
  if (share) out.push(`${money(Math.min(whole, share))} is held for bills (your ${money(billsMonthWhole())} a month, spread over every paycheck of the year).` + (whole < share ? ` It's ${money(share - whole)} short, so that comes from Savings.` : ''));
  else if (inc && isExtraCheck(inc, date)) out.push(`An extra paycheck this month: none of it goes to bills.`);
  const early = date > today();
  if (early) out.unshift(`It lands ${new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}. Nothing counts until then.`);   // v192
  if (F) out.push(`${money(F)} is yours: ${early ? `from ${shortDate(date)}, ` : ''}${money((V) * WORKER_DAY)} a day until ${until}` + (extra >= 1 ? `, and ${money(extra)} lands in Savings then.` : '.'));
  else out.push('Nothing coming in a day this pay period.');
  if (V < was) out.push(`That's ${money((was - V) * WORKER_DAY)} a day less than your last normal paycheck${partyNow() + crewWorkers() > V ? ': it comes off projects first, then pots' : ''}.`);
  if (cut >= 0.005) out.push(`${Math.round(cut * 100)}¢ goes to spare change.`);
  if (!D) out.push('Nothing landed? Saving $0 counts this payday as nothing.');
  $('payPlan').textContent = out.join(' ');
}
function paySave() {
  const v = $('payAmt').value.trim(), D = Number(v); if (!payKey || v === '' || !(D >= 0)) return;
  const k = payKey, old = (state.checks || {})[k];
  const date = splitKey(k)[1], early = date > today();
  (state.checks = state.checks || {})[k] = { amt: cents(D), at: old ? old.at : early ? dayMs(date) : Date.now(), ...(early ? { early: true, expected: true } : old && old.early ? { early: true, fit: old.fit, ...(old.expected ? { expected: true } : {}) } : {}) };   // v192: an early one starts on payday
  booksGen++; needMemo.clear();
  const pd = old || early ? null : paradeParts(k, D);   // v192: no parade before it lands   // v136: before afterCheck can move the party plan
  const n = early ? null : afterCheck(k), say = payNewsText(n);
  closePay(); save(); render();
  if (pd) showParade(pd);
  if (early) { const n = nextPayNow(); toast(`Saved: ${moneyExact(D)} lands ${shortDate(date)}${n ? ` · ${money((n.V) * WORKER_DAY)} a day from then` : ''}`); }   // v192
  else toast(say ? say : `Paycheck saved: ${moneyExact(D)}`);
}
$('payAmt').addEventListener('input', payPlan);
$('payAmt').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('paySave').disabled) paySave(); });
$('paySave').onclick = paySave;
$('payLater').onclick = () => { if (payKey && !(state.checks || {})[payKey]) sess('pay-later-' + payKey, '1'); closePay(); };
$('payDel').onclick = () => {
  const k = payKey, old = state.checks[k]; delete state.checks[k]; sess('pay-later-' + k, '1'); closePay(); save(); render();
  toastUndo('Paycheck taken out', () => { state.checks[k] = old; save(); render(); });
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && payKey) $('payLater').click(); });
// v131: "I got paid"
document.addEventListener('click', e => { const b = e.target.closest('[data-got]'); if (b) openGot(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && got) closeGot(); });
$('gotClose').onclick = closeGot;
$('gotBody').addEventListener('input', gotPlan); $('gotBody').addEventListener('change', gotPlan);
$('gotBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !got) return;
  if (b.dataset.gotK === 'ask' || b.dataset.gotK === 'extra') { got.step = b.dataset.gotK; renderGot(); if (got.step === 'extra') setTimeout(() => $('gotAmt') && $('gotAmt').focus(), 60); return; }
  if (b.dataset.gotK === 'pay') { const incs = state.incomes.filter(i => Number(i.amount) > 0);
    if (!incs.length) { closeGot(); toast('Set up your pay first (Paychecks)'); return; }
    if (incs.length > 1) { got.step = 'inc'; renderGot(); return; }
    const k = payKeyFor(incs[0]); closeGot(); if (k) openPay(k); else toast('Nothing to enter yet'); return; }
  if (b.dataset.gotInc) { const inc = state.incomes.find(i => i.id === b.dataset.gotInc), k = inc && payKeyFor(inc); closeGot(); if (k) openPay(k); return; }
  if (b.dataset.gotDel) { takeExtra(b.dataset.gotDel); renderGot(); return; }
  if (b.id === 'gotSave') { const e2 = addExtra($('gotAmt').value, $('gotNote').value, got.mode, got.to); if (e2) closeGot(); }
});
document.addEventListener('click', e => { const b = e.target.closest('[data-pay-open]'); if (b) openPay(b.dataset.payOpen); });
// Ask on payday, unless something else is open or you're partway through entering a spend.
function maybeAskPay() {
  if (payKey || plan || state.needsSetup || !$('askBox').classList.contains('hidden') || !$('setup').classList.contains('hidden') || pickCents() > 0) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) return;
  const w = paydaysWaiting().find(p => !sess('pay-later-' + p.key)); if (w) openPay(w.key);
}
function payNewsText(n) {
  if (!n) return '';
  const until = n.next ? ` until ${shortDate(n.next)}` : '', diff = n.to - n.from, parts = [];
  for (const c of n.cuts) parts.push(`${c.name} went from ${money(c.from * WORKER_DAY)} to ${money(c.to * WORKER_DAY)} a day`);
  for (const c of n.back) parts.push(`${c.name} is back to ${money(c.to * WORKER_DAY)} a day`);
  if (n.party) parts.push(n.party.to < n.party.from ? `from Monday weekly spending is ${money(wkOf(n.party.to))} (${n.party.to}) instead of ${money(wkOf(n.party.from))} (${n.party.from})` : `from Monday weekly spending is back to ${money(wkOf(n.party.to))} (${n.party.to})`);   // v311: the card's amount
  const head = n.extra ? `Extra paycheck: none of it goes to bills, so ${money((n.to) * WORKER_DAY)} a day${until}${diff > 0 ? ` (${diff} more than usual)` : ''}` : diff < 0 ? `Smaller paycheck: ${money(-diff * WORKER_DAY)} a day less${until}` : diff > 0 ? `${n.cuts.length ? 'Paycheck' : 'Bigger paycheck'}: ${money(diff * WORKER_DAY)} a day more${until}` : '';
  if (!head && !parts.length) return '';
  return (head || `${money(n.to * WORKER_DAY)} a day${until}`) + (parts.length ? '; ' + parts.join('; ') : '') + '.';
}
