'use strict';
function collectFarms(ids) {
  const incs = state.incomes.filter(i => ids.includes(i.id)), got = sum(incs, i => farmWhole(i)); if (got < 1) return 0;
  const c = state.coll[month] || (state.coll[month] = {});
  for (const i of incs) { const w = farmWhole(i), I = incomeOf(i, month); if (w >= 1 && I > 0) c[i.id] = collF(month, i.id) + w / I; }
  save(); render(); toast(`${money(got)} collected into your hoard`);
  const b = $('lootBtn'); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  return got;
}

/* ---------- savings ---------- */
// The town's money math (v86): how the hoard comes out of the bank balance. The bank, less the bills' money (spoken
// for) and pay still being worked in bit by bit, is what's yours (Jordan, v81). The old Pots page it came from is gone.
function renderPotsTab() {
  const pots = potBalances(month), find = id => pots.find(p => p.id === id) || pots[0];
  // The hoard is money you've collected and hold: the party's money, storage and spare change. Bill money
  // is spoken for (the machine crews run on it), so it isn't counted here.
  const hoardPots = pots.filter(p => p.id !== 'bills');
  const total = sum(hoardPots, p => p.bal);
  const pp = hoardParts(), field = pp.pending, held = find('bills').id === 'bills' ? find('bills').bal : 0;
  const hl = (a, b, cls = '') => `<div class="row spread${cls}"><span>${a}</span><span class="num">${b}</span></div>`;
  const math = `<div class="hoard-math">` + hl('In the bank', money(pp.bank))
    + (held >= 0.005 ? hl('Spoken for by bills', '−' + money(held)) : '')
    + (field >= 0.005 ? hl('Pay still coming in', '−' + money(field)) : '')
    + hl('Yours', money(total), ' sum') + `</div>`;
  if ($('townMath').innerHTML !== math) $('townMath').innerHTML = math;
  renderIncome(); renderBank();
}
// One tap of + moves $1 from the other pot. Taps in a row add to the same move so the
// history shows one line, and tapping the other side shrinks it back.
let duelMoveId = null;
// Records a move, folding it into the previous one when it's the same pair on the same day.
function commitMove(from, to, step) {
  const date = month === today().slice(0, 7) ? today() : month + '-01';
  const last = state.transfers.find(t => t.id === duelMoveId);
  if (last && last.date === date && last.from === from && last.to === to) last.amount += step;
  else if (last && last.date === date && last.from === to && last.to === from) {
    last.amount -= step;
    if (last.amount < 0) { [last.from, last.to] = [last.to, last.from]; last.amount = -last.amount; }
    if (last.amount === 0) { state.transfers = state.transfers.filter(t => t !== last); duelMoveId = null; }
  } else { const t = { id: uid(), date, from, to, amount: step }; state.transfers.push(t); duelMoveId = t.id; }
  save(); render();
}
let habitEditing = false;
const habitDone = (id, now = Date.now()) => state.habitLog.some(h => h.habit === id && new Date(h.t).toDateString() === new Date(now).toDateString());
function renderHabits() {
  $('habitCard').classList.toggle('hidden', !HABITS_ON); if (!HABITS_ON) return;
  const now = Date.now(), sp = speedNow(now);
  $('habitHint').textContent = sp > 1 ? `Your farms are gathering ${sp}× faster right now.` : 'Each habit you do makes your farms gather 3× faster for 2 hours. Your monthly total stays the same; you just get to it sooner.';
  $('habitEdit').textContent = habitEditing ? 'Done' : 'Edit';
  $('habitAdd').classList.toggle('hidden', !habitEditing);
  $('habitList').innerHTML = state.habits.map(h => {
    const done = habitDone(h.id, now), last = state.habitLog.filter(x => x.habit === h.id).sort((a, b) => b.t - a.t)[0];
    const left = last ? last.t + BOOST_MS - now : 0, m = Math.ceil(left / 60000);
    const sub = habitEditing ? '' : left > 0 ? `${m >= 60 ? Math.floor(m / 60) + 'h ' : ''}${m % 60}m left` : done ? 'Done today ✓' : 'Tap when done';
    return `<button class="habit${done ? ' done' : ''}" data-habit="${h.id}"><strong>${esc(h.name)}</strong>${habitEditing ? `<span class="link bad" data-habit-del="${h.id}" role="button">Remove</span>` : `<small>${sub}</small>`}</button>`;
  }).join('');
}

$('habitEdit').onclick = () => { habitEditing = !habitEditing; renderHabits(); };
$('habitSave').onclick = () => {
  const name = $('habitName').value.trim(); if (!name) return;
  state.habits.push({ id: uid(), name }); $('habitName').value = ''; save(); renderHabits();
};

