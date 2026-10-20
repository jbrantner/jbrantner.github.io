'use strict';
/* ---------- first run: a blank slate filled in with your real numbers ---------- */
const suRow = (cls, a = '', b = '', c = '', ph = ['Name', '$', 'Due']) => `<div class="su-row ${cls}"><input placeholder="${ph[0]}" value="${esc(a)}" aria-label="${ph[0]}"><input type="number" inputmode="decimal" placeholder="${ph[1]}" value="${b}" aria-label="Amount">${ph[2] ? `<input type="number" inputmode="numeric" min="1" max="31" placeholder="${ph[2]}" value="${c}" aria-label="Due day">` : '<span></span>'}<button class="link x" aria-label="Remove">✕</button></div>`;
function openSetup() {
  $('suPayday').value = today(); $('suBills').innerHTML = suRow('bill') + suRow('bill') + suRow('bill');
  $('suTypes').innerHTML = suRow('type', 'Food', '', '', ['Type', '$ a week', '']) + suRow('type', 'Gas', '', '', ['Type', '$ a week', '']);
  $('setup').classList.remove('hidden'); suRoom();
}
const suNum = el => Math.max(0, Number(el.value) || 0);
function suPlan() {
  const pay = suNum($('suPay')), every = everyVal($('suEvery').value), bills = sum([...document.querySelectorAll('#suBills .su-row')], r => suNum(r.children[1]));
  const monthly = pay * normalChecks({ every });                    // a normal month: no bonus paychecks
  return { pay, every, bills, monthly, perWeek: Math.max(0, Math.floor((monthly - bills) / 31) * 7) };
}
function suRoom() {
  const { pay, every, perWeek, monthly, bills } = suPlan(), tw = every === 'twice';
  $('suPaydayF').classList.toggle('hidden', tw); $('suDaysF').classList.toggle('hidden', !tw);
  $('suRoom').textContent = !pay ? '' : monthly <= bills ? `A normal month's pay (${money(monthly)}) doesn't cover your bills (${money(bills)}), so there's nothing left to spend each week.`
    : `A normal month's pay leaves ${money(monthly - bills)} after bills: up to about ${money(perWeek)} a week.` + (every === 14 ? ' Two months a year bring a 3rd paycheck; that goes to Savings.' : every === 7 ? ' Some months bring a 5th paycheck; that goes to Savings.' : '') + " Whatever you don't spend goes to Savings.";
}
$('setup').addEventListener('input', suRoom);
$('setup').addEventListener('click', e => { if (e.target.classList.contains('x')) { e.target.closest('.su-row').remove(); suRoom(); } });
$('suAddBill').onclick = () => $('suBills').insertAdjacentHTML('beforeend', suRow('bill'));
$('suAddType').onclick = () => $('suTypes').insertAdjacentHTML('beforeend', suRow('type', '', '', '', ['Type', '$ a week', '']));
$('suDemo').onclick = loadDemo;
$('suGo').onclick = () => {
  const { pay, every } = suPlan(), payday = $('suPayday').value, weekly = suNum($('suWeekly'));
  if (!pay || (!payday && every !== 'twice')) { $('suErr').textContent = 'Add your paycheck amount and a payday.'; return; }
  if ($('suSaved').value.trim() === '') { $('suErr').textContent = "Type what's in your bank right now (0 is fine if it's empty)."; $('suSaved').focus(); return; }
  if (every === 'twice' && !twiceDays($('suDay1'), $('suDay2'))) { $('suErr').textContent = 'Pick two paydays at least a week apart.'; $('suDay2').focus(); return; }   // v311 (G6)
  const s = freshState(), now = Date.now(), m = today().slice(0, 7);
  s.needsSetup = false; s.startMonth = m; s.startAt = now;
  s.incomes = [{ id: 'job', name: 'Paycheck', amount: pay, every, anchor: payday || today() }]; s.pay = { amount: pay, anchor: payday || today() };
  if (every === 'twice') s.incomes[0].days = twiceDays($('suDay1'), $('suDay2'));
  for (const r of document.querySelectorAll('#suBills .su-row')) {
    const name = r.children[0].value.trim(), amt = suNum(r.children[1]), day = Math.min(31, Math.round(suNum(r.children[2]))) || null;
    if (name && amt) s.categories.push({ id: uid(), name, budget: amt, kind: 'bill', dueDay: day, account: s.accounts[0] });
  }
  s.packs = [...document.querySelectorAll('#suTypes .su-row')].map(r => ({ id: uid(), name: r.children[0].value.trim(), amount: suNum(r.children[1]) })).filter(p => p.name);
  s.savings.start = suNum($('suSaved'));
  state = s; carts = []; booksGen++; needMemo.clear();   // v311 (G3): the books start afresh, so the cap below is real
  // the party sets out right away with a full week's purse
  const want = Math.ceil(weekly / 7 / WORKER_DAY), size = Math.min(want, maxWorkers()), wk = ymd(weekStart());
  state.partyPlan = size; state.wkAmt = c2(weekly); state.lastWeek = wk; state.purse = { wk, P: 0, extra: 0 };
  if (size < want) state.cutCrews = { party: want - size };   // v311: what the cap took comes back when a paycheck has room (restoreCrews)
  const byBank = size < want && startFlows(now).list.some(x => x.capped);   // the money in the bank after bills is what limits it, not pay
  if (size) state.workerLog.push({ t: now, pot: 'party', delta: size });
  headStart();
  save(); $('setup').classList.add('hidden'); render(); Tour.soon();   // v287
  toast(size >= want ? 'All set' : byBank ? `Until payday, your bank after bills covers ${money(size * 7)} a week, so that's the plan for now` : `Your pay after bills covers ${money(size * 7)} a week, so that's the plan`);
  askPaidAlready();
};
if (state.needsSetup) openSetup();
// After setup: which of the bills being held came out of the bank already this month?
function askPaidAlready() {
  const m = today().slice(0, 7), L = ledgerAt(today()), list = L.inst.filter(b => !b.set && !b.gone && b.m === m && L.have.has(b.key) && !((L.paid[b.key] || NO_PAY).P > 0));
  if (!list.length) return;
  $('paidAskList').innerHTML = list.map(b => `<label class="paid-row"><input type="checkbox" data-paid-already="${esc(b.c.id)}"><span class="grow">${esc(b.c.name)}<br><small class="muted">${b.due ? 'due ' + shortDate(b.due) : 'no due day set'}</small></span><span class="num">${money(Number(b.c.budget || 0))}</span></label>`).join('');
  $('paidAsk').classList.remove('hidden');
}
$('paidAskGo').onclick = () => {
  const m = today().slice(0, 7), ids = [...document.querySelectorAll('[data-paid-already]:checked')].map(x => x.dataset.paidAlready);
  for (const id of ids) {
    const c = state.categories.find(c => c.id === id); if (!c) continue;
    state.transactions.push({ ...paidMarker(c, m), date: startDay() || today(), before: true, at: Date.now(), description: c.name + ' (came out before you started)' });
    delete billSkips()[c.id + '|' + m];
  }
  $('paidAsk').classList.add('hidden'); save(); render();
  if (ids.length) toast(`${ids.length} bill${ids.length === 1 ? '' : 's'} marked as already paid ✓`);
};
/* A head start: the first week's purse is there in full from the moment you set up, whatever day it
   is. It comes out of what you had when you started, like every purse after it, so Savings starts
   that much lower. */
function headStart() {
  if (state.headStart || !state.startAt) return;
  const wk = ymd(weekStart());
  if (ymd(weekStart(new Date(state.startAt))) !== wk) { state.headStart = true; return; }   // that first week is already over
  if (!state.purse || state.purse.wk !== wk) state.purse = { wk, P: 0, extra: 0 };
  state.purse.extra = Math.max(0, Number(state.purse.extra || 0));                      // undo the old part-week purse
  state.headStart = true; save();
}
headStart(); render();
