'use strict';
/* ---------- render ---------- */
function render() {
  // money only counts from the month the savings-by-default model started (fresh setups too)
  if (!state.startMonth) { state.startMonth = today().slice(0, 7); if (state.partyPlan == null) state.partyPlan = 0; save(); }
  const th = themeOf(); if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;   // v149: dark unless chosen otherwise
  const [y, m] = month.split('-').map(Number);
  $('monthLabel').textContent = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  try { draftBar(); } catch (e) {}   // v306
  booksGen++; needMemo.clear(); dayMsC.clear(); if (payOfC) payOfC.clear(); autoSlay(); debtTick(); earlyArrive(); roundOffTick(); finishGoals(); weekMigrate(); partyReturns(); mondayCatchUp(); renderOver(); renderMath();
  renderBudget(); renderTx(); renderRules(); renderPotsTab(); renderScavenger(); Town.render(); VL.render();
  $('txCat').innerHTML = catOptions($('txCat').value);
  $('ruleCat').innerHTML = catOptions($('ruleCat').value, false);
  $('txAcct').innerHTML = acctOptions($('txAcct').value || state.accounts[0]);
  $('csvAcct').innerHTML = acctOptions($('csvAcct').value || state.accounts[0]);
  $('newCatAcct').innerHTML = acctOptions($('newCatAcct').value || state.accounts[0]);
  const i0 = state.incomes[0] || {}, tw = i0.every === 'twice', dd = i0.days || [15, 31];
  const setV = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };   // v311: a field you're in is left alone
  setV('setPay', state.incomes[0] ? i0.amount : ''); setV('setPayday', i0.anchor || ''); setV('setEvery', tw ? 'twice' : String(Number(i0.every || 0)));
  $('setPaydayF').classList.toggle('hidden', tw); $('setDaysF').classList.toggle('hidden', !tw);
  setV('setDay1', dd[0]); setV('setDay2', dd[1]); setV('setAccounts', state.accounts.join(', '));
  setV('setCurrency', state.currency); setV('setTheme', state.theme === 'dark' ? '' : (state.theme || ''));
  { const x = $('txDate'); if (x.dataset.day && x.dataset.day !== today() && x.value === x.dataset.day && document.activeElement !== x) x.value = x.dataset.day = today(); }   // v311: the date follows the day
  $('setCarry').checked = state.carryCents !== false; $('setRound').textContent = state.roundOff ? 'Stop rounding off' : 'Round everything off'; { const rl = $('setRoundLine'); if (rl.dataset.def == null) rl.dataset.def = rl.innerHTML; const h = state.roundOff ? roundOffLine() : rl.dataset.def; if (rl.innerHTML !== h) rl.innerHTML = h; }   // v311: the usual line again after
  $('backupLast').textContent = state.lastBackup ? `Last backup: ${shortDate(ymd(new Date(state.lastBackup)))}` : 'No backup saved yet';
  $('appVer').textContent = `App version ${APP_VERSION}`;
  maybeAskPay();
}
