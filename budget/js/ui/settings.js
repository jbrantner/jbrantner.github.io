'use strict';
/* v154: Settings > Money: what came off the main screen */
document.addEventListener('change', e => { if (e.target && e.target.classList && e.target.classList.contains('wk-amt')) { const v = e.target.value; setTimeout(() => wkSetDraft(v), 0); } });   // v294: type the weekly amount
$('setWk').addEventListener('click', e => { const b = e.target.closest('[data-hl]'); if (b && (b.dataset.hl === 'wm' || b.dataset.hl === 'wp')) wkStep(b.dataset.hl === 'wm' ? -1 : 1); else if (b && b.dataset.hl === 'wkok') wkConfirm(); else if (b && b.dataset.hl === 'wkno') { wkDraft = null; render(); } else if (b && b.dataset.hl === 'now') sendPartyNow(); });
$('smPay').onclick = () => { showView('town'); render(); Town.open('farm'); };
$('smBank').onclick = () => openBankCheck(false);
$('smHoard').onclick = () => { showView('town'); render(); const m = $('townMoney'); m.classList.remove('hidden'); setTimeout(() => m.scrollIntoView({ block: 'start' }), 60); };
$('smRound').onclick = () => { if (state.roundOff) roundOffStop(); else roundOffStart(); render(); };
$('setPay').onchange = e => { if (state.incomes[0]) { const a = Math.max(0, Number(e.target.value) || 0); state.incomes[0].amount = a; e.target.value = a; } save(); render(); };   // v311: never below 0
$('lootBtn').onclick = () => collectFarms(state.incomes.map(i => i.id));
$('setPayday').onchange = e => { if (e.target.value && state.incomes[0]) { reSchedule(state.incomes[0], i => { i.anchor = e.target.value; }); save(); render(); } };
$('setEvery').onchange = e => { const i = state.incomes[0]; if (!i) return; reSchedule(i, i => { i.every = everyVal(e.target.value); if (i.every === 'twice' && !twiceDays({ value: (i.days || [])[0] }, { value: (i.days || [])[1] })) i.days = [15, 31]; }); save(); render(); };
['setDay1', 'setDay2'].forEach(k => $(k).onchange = () => setDays(state.incomes[0], 'setDay1', 'setDay2'));
$('setAccounts').onchange = e => { const a = e.target.value.split(',').map(x => x.trim()).filter(Boolean); if (a.length) state.accounts = a; save(); render(); };
$('setCurrency').onchange = e => { state.currency = e.target.value || '$'; save(); render(); };
$('setTheme').onchange = e => { state.theme = e.target.value; save(); render(); };
$('setCarry').onchange = e => { state.carryCents = e.target.checked; save(); render(); };
$('setRound').onclick = () => state.roundOff ? roundOffStop() : roundOffStart();
