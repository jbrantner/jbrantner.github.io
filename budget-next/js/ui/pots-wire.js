'use strict';
$('addPotBtn').onclick = () => { if (addPot($('newPotName').value)) $('newPotName').value = ''; };
$('potList').addEventListener('click', e => { const id = e.target.dataset.potDel; if (id) deletePot(id); });
$('newPlotBtn').onclick = () => {
  const inc = { id: uid(), name: 'Side gig', amount: 0, every: 0, anchor: today() };
  state.incomes.push(inc);
  save(); render(); openIncome(inc.id); $('ibAmt').focus();
};
$('ibClose').onclick = closeIncome;
$('ibName').onchange = e => { const i = ibInc(); if (i) { i.name = e.target.value.trim() || 'Farm'; save(); render(); } };
$('ibAmt').onchange = e => { const i = ibInc(); if (i) { i.amount = Math.max(0, Number(e.target.value) || 0); save(); render(); } };
$('ibEvery').onchange = e => { const i = ibInc(); if (i) { reSchedule(i, i => { i.every = everyVal(e.target.value); if (i.every === 'twice' && !twiceDays({ value: (i.days || [])[0] }, { value: (i.days || [])[1] })) i.days = [15, 31]; }); save(); render(); } };   // v311: paychecks entered stay
['ibDay1', 'ibDay2'].forEach(k => $(k).onchange = () => setDays(ibInc(), 'ibDay1', 'ibDay2'));
$('ibAnchor').onchange = e => { const i = ibInc(); if (i && e.target.value) { reSchedule(i, i => { i.anchor = e.target.value; }); save(); render(); } };
$('ibDel').onclick = async () => {
  const i = ibInc(); if (!i || state.incomes.length < 2) return;
  if (!await ask(`Remove ${i.name}? Its pay stops counting.`, 'Remove')) return;
  state.incomes = state.incomes.filter(x => x !== i); closeIncome(); save(); render();
};
$('storeList').addEventListener('change', e => { const id = e.target.dataset.cover; if (id) setCover(id, e.target.checked); });
$('storeList').addEventListener('click', e => { const b = e.target.closest('[data-wk]'); if (b) setCrew(b.dataset.wk, Number(b.dataset.d)); });
$('newGoalUnit').onchange = () => { if ($('newGoalUnit').value === 'months' && !$('newGoalAmt').value) $('newGoalAmt').value = 3; goalHint(); };
$('newGoalAmt').oninput = goalHint;
$('addGoalBtn').onclick = () => {
  if (!addProject($('newGoalName').value, $('newGoalAmt').value, $('newGoalUnit').value === 'months')) return;
  $('newGoalName').value = ''; $('newGoalAmt').value = ''; $('newGoalUnit').value = '$'; goalHint();
};
$('habitList').addEventListener('click', e => {
  const del = e.target.closest('[data-habit-del]');
  if (del) { state.habits = state.habits.filter(h => h.id !== del.dataset.habitDel); save(); renderHabits(); return; }
  const b = e.target.closest('[data-habit]'); if (!b || habitEditing) return;
  const id = b.dataset.habit; if (habitDone(id)) { toast('Already done today. Nice.'); return; }
  state.habitLog.push({ t: Date.now(), habit: id });
  save(); render();
  toast(`Farms gather ${speedNow()}× faster for 2 hours`);
});
