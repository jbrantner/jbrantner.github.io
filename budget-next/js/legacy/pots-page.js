'use strict';
function collectFarms(ids) {
  const incs = state.incomes.filter(i => ids.includes(i.id)), got = sum(incs, i => farmWhole(i)); if (got < 1) return 0;
  const c = state.coll[month] || (state.coll[month] = {});
  for (const i of incs) { const w = farmWhole(i), I = incomeOf(i, month); if (w >= 1 && I > 0) c[i.id] = collF(month, i.id) + w / I; }
  save(); render(); toast(`${money(got)} collected into your hoard`);
  const h = $('hoardCanvas'); if (h) { h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); }
  const b = $('lootBtn'); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  return got;
}

/* ---------- savings ---------- */
function renderPotsTab() {
  const pots = potBalances(month), find = id => pots.find(p => p.id === id) || pots[0];
  const fmt = p => (p.exact ? moneyExact : money)(p.bal);
  // total hoard: every pot together
  // The hoard is money you've collected and hold: the party's money, storage and spare change. Bill money
  // is spoken for (the machine crews run on it), so it isn't counted here.
  const hoardPots = pots.filter(p => p.id !== 'bills');
  const total = sum(hoardPots, p => p.bal), goalSum = sum(hoardPots, p => goalOf(p.id));
  $('featBal').textContent = money(total);
  $('featGoal').textContent = goalSum ? money(goalSum) : '';
  $('featGoalRow').classList.toggle('hidden', !goalSum);
  if (goalSum) $('featBar').firstElementChild.style.width = Math.max(0, Math.min(100, total / goalSum * 100)) + '%';
  // how the hoard comes out of the bank balance: the bank, less the bills' money (spoken for) and pay still
  // being worked in bit by bit, is what's ready (Jordan, v81)
  const pp = hoardParts(), field = pp.pending, held = find('bills').id === 'bills' ? find('bills').bal : 0;
  const hl = (a, b, cls = '') => `<div class="row spread${cls}"><span>${a}</span><span class="num">${b}</span></div>`;
  const math = `<div class="hoard-math">` + hl('In the bank', money(pp.bank))
    + (held >= 0.005 ? hl('Spoken for by bills', '−' + money(held)) : '')
    + (field >= 0.005 ? hl('Pay still coming in', '−' + money(field)) : '')
    + hl('Yours', money(total), ' sum') + `</div>`;
  if ($('townMath').innerHTML !== math) $('townMath').innerHTML = math;   // the town's top shows the same math (v86)
  if ($('view-pots').classList.contains('hidden')) { renderIncome(); renderBank(); return; }   // v311: the rest is the old Pots page, which is never shown
  $('featLine').innerHTML = math
    + `Across ${hoardPots.length} pots` + (goalSum ? ` · goals add up to ${money(goalSum)}` : '');
  // trading station
  for (const side of ['a', 'b']) posts[side] = posts[side].filter(id => pots.some(p => p.id === id));
  document.querySelectorAll('.chip.inc').forEach(c => c.classList.toggle('on', Number(c.dataset.inc) === state.inc));
  renderPosts();
  // pot cards
  $('potCards').innerHTML = pots.map(p => {
    const goal = goalOf(p.id), inStation = posts.a.includes(p.id) || posts.b.includes(p.id);
    return `<div class="potcard${inStation ? ' in-station' : ''}" data-pot="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}, ${fmt(p)}. Tap or drag to put it in the trading station.">
      <canvas width="112" height="118" data-hoard="${p.id}" aria-hidden="true"></canvas>
      <div class="row spread"><strong style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(p.name)}</strong><span class="num ${p.bal < 0 ? 'bad' : ''}" data-card-bal="${p.id}">${fmt(p)}</span></div>
      ${canFarm(p.id) && workersAt(p.id) > 0 ? `<div class="crop-bar" data-crop="${p.id}"><span></span></div><div class="muted" style="font-size:11px" data-crop-eta="${p.id}"></div>` : ''}
      ${goal ? `<div class="bar goal"><span style="width:${Math.max(0, Math.min(100, p.bal / goal * 100))}%"></span></div><div class="muted num" style="font-size:12px">goal ${money(goal)}</div>`
        : `<div class="muted ${p.warn ? 'warn' : ''}" style="font-size:12px">${p.note}</div>`}
    </div>`;
  }).join('');
  renderIncome(); renderStore();
  // manage list
  $('potList').innerHTML = pots.map(p => { const gm = goalMonthsOf(p.id); return `<div class="potrow">
    <div style="min-width:0"><strong>${esc(p.name)}</strong><div class="muted ${p.warn ? 'warn' : ''}" style="font-size:12px">${p.note}${gm ? ` · goal ${money(goalOf(p.id))}` : ''}</div></div>
    <span class="num ${p.bal < 0 ? 'bad' : ''}">${fmt(p)}</span>
    <span class="goalcell"><input type="number" inputmode="numeric" min="0" placeholder="${gm ? 'Months' : 'Goal'}" data-goal="${p.id}" value="${gm || state.goals[p.id] || ''}" aria-label="Goal for ${esc(p.name)}${gm ? ', in months of bills' : ''}">${canFarm(p.id) ? `<select data-goal-unit="${p.id}" aria-label="Goal for ${esc(p.name)} in dollars or months of bills"><option value="$">$</option><option value="months"${gm ? ' selected' : ''}>mo</option></select>` : ''}</span>
    ${p.custom ? `<button class="link danger" data-pot-del="${p.id}" aria-label="Delete ${esc(p.name)}">✕</button>` : '<span></span>'}</div>`; }).join('');
  renderBank();
  const recent = state.transfers.filter(t => t.date.startsWith(month) && !t.carry && !t.debt).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $('moveList').innerHTML = recent.length ? '<div class="muted" style="margin-top:10px">Moves this month</div>' + recent.map(t => `
    <div class="row spread muted" style="padding:2px 0"><span>${t.date.slice(5)} · ${esc(potName(t.from))} → ${esc(potName(t.to))}</span>
    <span class="row"><span class="num">${money(t.amount)}</span><button class="link danger" data-move-del="${t.id}" aria-label="Undo">Undo</button></span></div>`).join('') : '';
  const sp = state.savings.sprite;
  $('sprInfo').textContent = sp ? `Using your sprite sheet (${sp.cols} × ${sp.rows} frames)` : 'Using the built-in hoard';
  if (sp) { $('sprCols').value = sp.cols; $('sprRows').value = sp.rows; }
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
// Storage: the savings stockpile and mini projects, each with its own workers.
// Materials a project's crew has gathered but not delivered yet: they arrive when you collect pay.
const materialsWaiting = (id, now = Date.now()) => month === today().slice(0, 7) ? Math.max(0, grown(id, workClock(month), now)) : 0;
// Savings has no worker log (it's everyone left over), so its waiting money comes from how many save.
const waitingFor = (id, now = Date.now()) => id === 'savings' ? (month === today().slice(0, 7) ? savers() * WORKER_DAY * Math.max(0, now - workClock(month)) / DAY_MS : 0) : materialsWaiting(id, now);
function tickStore(now = Date.now()) {
  const pots = potBalances(month);
  // stockpiles: a bar filling toward the next whole dollar, and how long until it's there
  for (const el of document.querySelectorAll('[data-pile]')) {
    const id = el.dataset.pile, w = id === 'savings' ? savers() : workersAt(id), bal = (pots.find(x => x.id === id) || { bal: 0 }).bal;
    const got = AUTO_COLLECT ? 0 : waitingFor(id, now), whole = Math.floor(got + 1e-9), f = AUTO_COLLECT ? bal - Math.floor(bal) : got - whole;
    el.querySelector('.crop-bar span').style.width = (w > 0 ? f * 100 : 0).toFixed(2) + '%';
    const mins = w > 0 ? Math.ceil((1 - f) / (w * WORKER_DAY) * 1440) : 0, eta = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    const txt = w < 1 ? 'Nobody is stockpiling here right now.' : `Next ${money(1)} saved in ${eta}` + (whole >= 1 ? ` · ${money(whole)} waiting, collect pay to store it` : '');
    const t = el.querySelector('.muted'); if (t.textContent !== txt) t.textContent = txt;
  }
  for (const el of document.querySelectorAll('[data-mini-note]')) {
    const id = el.dataset.miniNote, w = workersAt(id), mat = Math.floor(materialsWaiting(id, now) + 1e-9);
    const txt = w < 1 ? 'Paused. The money stays; add some money a day to keep it growing.' : AUTO_COLLECT ? 'Growing.' : mat >= 1 ? `${money(mat)} of materials waiting. Collect pay to deliver ${mat === 1 ? 'it' : 'them'}.` : 'The next $1 is on its way.';
    if (el.textContent !== txt) el.textContent = txt;
  }
}
function renderStore() {
  const pots = potBalances(month).filter(p => canFarm(p.id));
  $('storeHands').textContent = `${savers()} saving by default`;
  $('storeList').innerHTML = pots.map(p => {
    const goal = goalOf(p.id), gm = goalMonthsOf(p.id), w = p.id === 'savings' ? savers() : workersAt(p.id), need = goal - p.bal;
    const when = goal && need > 0 && w > 0 ? ` · goal around ${new Date(Date.now() + need / (w * WORKER_DAY) * DAY_MS).toLocaleDateString(undefined, need / w > 300 ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' })}` : goal && need <= 0 ? ' · goal reached' : '';
    if (isMini(p)) return `<div class="mini">
      <canvas data-mini-cv="${p.id}" role="img" aria-label="${esc(p.name)} being built, ${Math.floor(Math.min(1, p.bal / goal) * 100)}% done"></canvas>
      <div class="row spread"><strong style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(p.name)}</strong><span class="num">${money(p.bal)}<span class="muted"> of ${money(goal)}</span></span></div>
      <div class="bar goal" style="margin:2px 0 0"><span style="width:${Math.max(0, Math.min(100, p.bal / goal * 100))}%"></span></div>
      ${need <= 0 ? `<div class="ok" style="font-size:13px">${gm ? `Full! ${gm} month${gm === 1 ? '' : 's'} of bills set aside.` : 'Built! The money is ready when you are.'}</div>` : monthsLine(p) + `<div class="muted" style="font-size:12px" data-mini-note="${p.id}"></div>`}
      <div class="wk"><button data-wk="${p.id}" data-d="-1" aria-label="$1 a day less for ${esc(p.name)}">−</button><span class="muted" style="font-size:13px">${w} worker${w === 1 ? '' : 's'} · ${rateText(w)}${when}</span><button data-wk="${p.id}" data-d="1" aria-label="$1 a day more for ${esc(p.name)}" style="margin-left:auto">+</button></div>
    </div>`;
    if (p.id === 'savings' || !isMini(p)) return `<div class="mini">
      <canvas data-mini-cv="${p.id}" role="img" aria-label="${esc(p.name)} stockpile, ${money(p.bal)} stored"></canvas>
      <div class="row spread"><strong>${esc(p.name)}</strong><span class="num">${money(p.bal)}${goal ? `<span class="muted"> of ${money(goal)}</span>` : ''}</span></div>
      ${monthsLine(p)}
      <div data-pile="${p.id}"><div class="crop-bar"><span></span></div><div class="muted" style="font-size:12px; margin-top:2px"></div></div>
      <label class="cover"><input type="checkbox" data-cover="${p.id}"${coverPots().includes(p.id) ? ' checked' : ''}> Covers overspending after your projects</label>
      ${p.id === 'savings' ? `<div class="muted" style="font-size:13px">${money((w) * WORKER_DAY)} a day going in by default · ${rateText(w)}</div>`
        : `<div class="wk"><button data-wk="${p.id}" data-d="-1" aria-label="$1 a day less for ${esc(p.name)}">−</button><span class="muted" style="font-size:13px">${w} worker${w === 1 ? '' : 's'} · ${rateText(w)}</span><button data-wk="${p.id}" data-d="1" aria-label="$1 a day more for ${esc(p.name)}" style="margin-left:auto">+</button></div>`}
    </div>`;
    return `<div class="store-row">
      <canvas width="112" height="118" data-store="${p.id}" aria-hidden="true"></canvas>
      <div style="min-width:0">
        <div class="row spread"><strong style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(p.name)}</strong><span class="num">${money(p.bal)}${goal ? `<span class="muted"> of ${money(goal)}</span>` : ''}</span></div>
        ${goal ? `<div class="bar goal" style="margin:4px 0 0"><span style="width:${Math.max(0, Math.min(100, p.bal / goal * 100))}%"></span></div>` : ''}
        <div class="wk"><button data-wk="${p.id}" data-d="-1" aria-label="$1 a day less for ${esc(p.name)}">−</button><span class="muted" style="font-size:13px">${w} worker${w === 1 ? '' : 's'} · ${rateText(w)}${when}</span><button data-wk="${p.id}" data-d="1" aria-label="$1 a day more for ${esc(p.name)}" style="margin-left:auto">+</button></div>
      </div>
    </div>`;
  }).join('');
  tickStore();
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

/* ---------- a farm, opened ---------- */
const fb = { id: null, dir: 'in', other: null, amt: 0 };
function closeFarm() { fb.id = null; $('farmBox').classList.add('hidden'); $('villageHint').classList.remove('hidden'); render(); }
function fbRoute() {
  if (!fb.other) return null;
  const from = fb.dir === 'in' ? fb.other : fb.id, to = fb.dir === 'in' ? fb.id : fb.other;
  const src = potBalances(month).find(p => p.id === from);
  return { from, to, max: src ? Math.max(0, Math.floor(src.bal - inFlightOut(from))) : 0 };
}
function renderFarm() {
  if (!fb.id) return;
  const pots = potBalances(month), p = pots.find(x => x.id === fb.id); if (!p) { closeFarm(); return; }
  const goal = goalOf(p.id), w = workersAt(p.id), here = Math.max(0, w - inFlightWorkers(p.id));
  const coming = sum(carts.filter(c => c.to === p.id), c => c.workers || 0), leaving = inFlightWorkers(p.id);
  $('fbTitle').textContent = p.name;
  $('fbGoal').textContent = goal ? `of ${money(goal)}` : '';
  $('fbGoalBar').classList.toggle('hidden', !goal);
  if (goal) $('fbGoalBar').firstElementChild.style.width = Math.max(0, Math.min(100, p.bal / goal * 100)) + '%';
  // workers
  const free = workersFree('spend'), elsewhere = farmPots().filter(id => id !== p.id && workersFree(id) > 0);
  $('fbWorkers').innerHTML = `<div class="wk-row"><span>On this farm<br><small class="muted">${money(w * WORKER_DAY)} a day</small></span>
      <button id="fbWkMinus" aria-label="Send $1 a day back to Savings"${here ? '' : ' disabled'}>−</button><span class="num send-val">${w}</span>
      <button id="fbWkPlus" aria-label="Move $1 a day here from Fun"${free ? '' : ' disabled'}>+</button></div>
    ${coming || leaving ? `<p class="muted" style="font-size:13px; margin:6px 0 0">${coming ? `${coming} on the way here` : ''}${coming && leaving ? ', ' : ''}${leaving ? `${leaving} heading out` : ''}.</p>` : ''}
    <p class="muted" style="font-size:13px; margin:6px 0 0">${free} worker${free === 1 ? '' : 's'} earning for Fun. Each one you send here earns ${money(WORKER_DAY)} a day for this farm instead, and what it earned stays here if it leaves.</p>
    ${elsewhere.length ? `<div class="muted" style="font-size:13px; margin-top:8px">Or call one over from another farm:</div><div class="chips">${elsewhere.map(id => `<button class="chip" data-fb-borrow="${id}">${esc(potName(id))} (${workersFree(id)})</button>`).join('')}</div>` : ''}`;
  // crops
  document.querySelectorAll('[data-fb-dir]').forEach(b => b.classList.toggle('on', b.dataset.fbDir === fb.dir));
  document.querySelectorAll('[data-fb-inc]').forEach(b => b.classList.toggle('on', Number(b.dataset.fbInc) === state.inc));
  $('fbOtherLabel').textContent = fb.dir === 'in' ? 'Take crops from:' : 'Send crops to:';
  $('fbOthers').innerHTML = pots.filter(x => x.id !== p.id).map(x => `<button class="chip${fb.other === x.id ? ' on' : ''}" data-fb-other="${x.id}">${esc(x.name)} <span class="num">${(x.exact ? moneyExact : money)(x.bal)}</span></button>`).join('');
  const rt = fbRoute(); if (rt) fb.amt = Math.min(fb.amt, rt.max);
  $('fbAmt').textContent = money(fb.amt);
  $('fbMinus').disabled = !fb.amt; $('fbPlus').disabled = !rt || fb.amt >= rt.max;
  $('fbMove').disabled = !rt || !fb.amt;
  $('fbMove').textContent = !rt ? 'Pick a pot' : fb.amt ? (fb.dir === 'in' ? `Bring ${money(fb.amt)} from ${potName(rt.from)}` : `Send ${money(fb.amt)} to ${potName(rt.to)}`) : 'Move';
  tickFarm();
}
// The live parts of an open farm: art, balance and the crop bar.
function tickFarm(now = Date.now()) {
  if (!fb.id) return;
  const pots = potBalances(month), p = pots.find(x => x.id === fb.id); if (!p) return;
  const w = workersAt(p.id);
  $('fbBal').textContent = (w || p.exact ? moneyExact : money)(p.bal);
  const nc = nextCrop(p.id, p.bal);
  $('fbCrop').classList.toggle('hidden', !nc);
  if (nc) { $('fbCrop').firstElementChild.firstElementChild.style.width = (nc.f * 100).toFixed(2) + '%'; $('fbEta').textContent = `Next ${money(1)} crop in ${nc.eta}`; }
}


// Outpost pot picker
let pickSide = 'a';
function openPicker(side) { pickSide = side; renderPicker(); $('pickBox').classList.remove('hidden'); }
function renderPicker() {
  const pots = potBalances(month), other = posts[pickSide === 'a' ? 'b' : 'a'];
  $('pickGrid').innerHTML = pots.map(p => `<button class="pick${posts[pickSide].includes(p.id) ? ' on' : ''}" data-pick-pot="${p.id}"${other.includes(p.id) ? ' disabled' : ''}>
      <canvas width="112" height="118" data-pick-hoard="${p.id}" aria-hidden="true"></canvas>
      <strong>${esc(p.name)}</strong><span class="num muted">${(p.exact ? moneyExact : money)(p.bal)}</span>
      <span class="muted" style="font-size:11px">${esc(traderFor(p.id).name)}${other.includes(p.id) ? ' · other outpost' : ''}</span>
      <span class="edit" data-edit-trader="${p.id}" role="button" aria-label="Change ${esc(p.name)}'s trader"></span>
    </button>`).join('');
}
$('moveList').addEventListener('click', e => {
  const id = e.target.dataset.moveDel; if (!id) return;
  state.transfers = state.transfers.filter(t => t.id !== id); save(); render(); toast('Move undone');
});
document.querySelectorAll('.chip.inc').forEach(c => c.onclick = () => { state.inc = Number(c.dataset.inc); save(); render(); });
holdRepeat($('cropMinus'), () => nudgeSend('amt', -1)); holdRepeat($('cropPlus'), () => nudgeSend('amt', 1));
holdRepeat($('wkMinus'), () => nudgeSend('workers', -1)); holdRepeat($('wkPlus'), () => nudgeSend('workers', 1));
$('dirBtn').onclick = () => { send.from = send.from === 'a' ? 'b' : 'a'; renderPosts(); };
$('sendBtn').onclick = doSend;
$('harvestAll').onclick = () => { if (!collectFarms(state.incomes.map(i => i.id))) toast('Nothing gathered yet'); };
$('habitEdit').onclick = () => { habitEditing = !habitEditing; renderHabits(); };
$('habitSave').onclick = () => {
  const name = $('habitName').value.trim(); if (!name) return;
  state.habits.push({ id: uid(), name }); $('habitName').value = ''; save(); renderHabits();
};
$('fbClose').onclick = closeFarm;
$('farmBox').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.id === 'fbWkPlus') { if (workersFree('spend') > 0) launchTrip('spend', fb.id, 0, 1); }
  else if (b.id === 'fbWkMinus') { if (workersFree(fb.id) > 0) launchTrip(fb.id, 'spend', 0, 1); }
  else if (b.dataset.fbBorrow) { if (workersFree(b.dataset.fbBorrow) > 0) launchTrip(b.dataset.fbBorrow, fb.id, 0, 1); }
  else if (b.dataset.fbDir) { fb.dir = b.dataset.fbDir; fb.amt = 0; renderFarm(); }
  else if (b.dataset.fbOther) { fb.other = b.dataset.fbOther; renderFarm(); }
  else if (b.dataset.fbInc) { state.inc = Number(b.dataset.fbInc); save(); renderFarm(); }
  else if (b.id === 'fbMove') {
    const rt = fbRoute(); if (!rt || !fb.amt) return;
    launchTrip(rt.from, rt.to, Math.min(fb.amt, rt.max), 0);
    toast(`A cart of ${money(fb.amt)} is on its way`); fb.amt = 0; renderFarm();
  }
});
holdRepeat($('fbPlus'), () => { const rt = fbRoute(); if (!rt) { toast('Pick a pot first'); return false; } if (fb.amt >= rt.max) return false; fb.amt = Math.min(rt.max, fb.amt + state.inc); renderFarm(); });
holdRepeat($('fbMinus'), () => { if (!fb.amt) return false; fb.amt = Math.max(0, fb.amt - state.inc); renderFarm(); });
$('pickA').onclick = () => openPicker('a');
$('pickB').onclick = () => openPicker('b');
$('pkDone').onclick = () => { $('pickBox').classList.add('hidden'); render(); };
$('pickGrid').addEventListener('click', e => {
  const ed = e.target.closest('[data-edit-trader]');
  if (ed) { e.stopPropagation(); trPot = ed.dataset.editTrader; renderTraderBox(); $('traderBox').classList.remove('hidden'); return; }
  const b = e.target.closest('[data-pick-pot]'); if (!b || b.disabled) return;
  posts[pickSide] = [b.dataset.pickPot];
  $('pickBox').classList.add('hidden'); render();
});
// Outpost pots: tap sends the chosen amount, long press takes the pot out. A finger that moves first is scrolling.
(function postPots() {
  let timer = null, held = false, moved = false, sx = 0, sy = 0, id = null;
  const stop = () => { clearTimeout(timer); timer = null; held = false; };
  const scene = $('duelBox');
  scene.addEventListener('pointerdown', e => {
    const b = e.target.closest('.post-pot'); if (!b) return;
    id = b.dataset.pot; sx = e.clientX; sy = e.clientY; moved = false; held = false;
    timer = setTimeout(() => { held = true; removeFromPost(id); }, 550);
  });
  scene.addEventListener('pointermove', e => { if (timer && !held && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { moved = true; stop(); } });
  scene.addEventListener('pointerup', () => { const tap = timer && !held && !moved; stop(); if (tap && id) { send.from = sideOf(id) || send.from; renderPosts(); } });
  ['pointercancel', 'pointerleave'].forEach(ev => scene.addEventListener(ev, stop));
  scene.addEventListener('contextmenu', e => e.preventDefault());
  scene.addEventListener('keydown', e => { const b = e.target.closest('.post-pot'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); send.from = sideOf(b.dataset.pot) || send.from; renderPosts(); } });
})();
// Trader look (one per pot)
let trPot = null;
function renderTraderBox() {
  const t = traderFor(trPot);
  $('trTitle').textContent = `${potName(trPot)}'s trader`;
  $('trName').value = t.name;
  $('trRobes').innerHTML = ROBES.map((c, i) => `<button class="robe-swatch${t.robe === i ? ' on' : ''}" style="background:${c}" data-robe="${i}" aria-label="Robe color ${i + 1}"></button>`).join('');
  $('trHats').innerHTML = HATS.map((h, i) => `<button class="chip${t.hat === i ? ' on' : ''}" data-hat="${i}">${h}</button>`).join('');
}
$('traderBox').addEventListener('click', e => {
  const t = traderFor(trPot);
  if (e.target.dataset.robe) t.robe = Number(e.target.dataset.robe);
  else if (e.target.dataset.hat) t.hat = Number(e.target.dataset.hat);
  else return;
  save(); renderTraderBox();
});
$('trName').oninput = e => { traderFor(trPot).name = e.target.value.trim() || 'Trader'; save(); };
$('trDone').onclick = () => { $('traderBox').classList.add('hidden'); if (!$('pickBox').classList.contains('hidden')) renderPicker(); };

// Pot cards: drag one onto a station side to trade with it, or tap to drop it into the side
// that was filled longest ago. On touch, a short hold picks the card up so normal swipes still scroll.
function placeInSlot(id, slot) {
  const other = slot === 'a' ? 'b' : 'a';
  posts[other] = posts[other].filter(x => x !== id);
  posts[slot] = [id];
  duelMoveId = null; render();
}
(function potDrag() {
  let drag = null; // { id, ghost, timer, startX, startY, active, pointerId }
  const slotAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.slot'); };
  const highlight = slot => document.querySelectorAll('.slot').forEach(s => s.classList.toggle('over', s === slot));
  const begin = () => {
    const card = document.querySelector(`.potcard[data-pot="${drag.id}"]`); if (!card) return;
    drag.active = true;
    drag.ghost = card.cloneNode(true); drag.ghost.classList.add('drag-ghost');
    drag.ghost.querySelectorAll('canvas').forEach((c, i) => c.getContext('2d').drawImage(card.querySelectorAll('canvas')[i], 0, 0));
    document.body.appendChild(drag.ghost); moveGhost(drag.startX, drag.startY);
    if (navigator.vibrate) try { navigator.vibrate(10); } catch (err) {}
  };
  // Dragging near the top or bottom edge scrolls the page so the station can be reached.
  let edge = null;
  const autoScroll = () => {
    if (!drag || !drag.active) { edge = null; return; }
    const y = drag.y, h = window.innerHeight, dy = y < 90 ? -12 : y > h - 110 ? 12 : 0;
    if (dy) { window.scrollBy(0, dy); highlight(slotAt(drag.x, drag.y)); }
    edge = requestAnimationFrame(autoScroll);
  };
  const moveGhost = (x, y) => {
    drag.x = x; drag.y = y; drag.ghost.style.left = x + 'px'; drag.ghost.style.top = y + 'px'; highlight(slotAt(x, y));
    if (!edge) edge = requestAnimationFrame(autoScroll);
  };
  const finish = (x, y, ok) => {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.active) {
      const slot = ok && slotAt(x, y);
      drag.ghost.remove(); highlight(null);
      if (slot) { placeInSlot(drag.id, slot.dataset.slot); toast(`${potName(drag.id)} joined the outpost`); }
    } else if (ok && !drag.moved) {
      if (!sideOf(drag.id)) placeInSlot(drag.id, !posts.a.length || posts.b.length ? 'a' : 'b');
      window.scrollTo({ top: $('duelBox').getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    }
    drag = null;
  };
  const box = $('potCards');
  box.addEventListener('pointerdown', e => {
    const card = e.target.closest('.potcard'); if (!card) return;
    drag = { id: card.dataset.pot, startX: e.clientX, startY: e.clientY, active: false, moved: false, pointerId: e.pointerId, touch: e.pointerType === 'touch' };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.moved) begin(); }, 250);
  });
  window.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const far = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8;
    if (!drag.active) {
      if (far && !drag.touch) begin();      // mouse: drag starts as soon as it moves
      else if (far) { drag.moved = true; clearTimeout(drag.timer); } // touch: moving before the hold means scrolling
    }
    if (drag && drag.active) moveGhost(e.clientX, e.clientY);
  });
  // While a card is held on touch, stop the page from scrolling under the finger.
  box.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
  window.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pointerId) finish(e.clientX, e.clientY, true); });
  window.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pointerId && !drag.active) { clearTimeout(drag.timer); drag = null; } });
  box.addEventListener('contextmenu', e => e.preventDefault());
  box.addEventListener('keydown', e => {
    const card = e.target.closest('.potcard'); if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); placeInSlot(card.dataset.pot, !posts.a.length || posts.b.length ? 'a' : 'b');
  });
})();
$('potList').addEventListener('change', e => goalChange(e.target));
$('sprLoadBtn').onclick = () => $('sprFile').click();
$('sprFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    state.savings.sprite = { src: r.result, cols: Math.max(1, parseInt($('sprCols').value) || 1), rows: Math.max(1, parseInt($('sprRows').value) || 1) };
    save(); render(); toast('Sprite sheet loaded');
  };
  r.readAsDataURL(f); e.target.value = '';
};
['sprCols', 'sprRows'].forEach(id => $(id).onchange = () => {
  const sp = state.savings.sprite; if (!sp) return;
  sp.cols = Math.max(1, parseInt($('sprCols').value) || 1); sp.rows = Math.max(1, parseInt($('sprRows').value) || 1); save(); render();
});
$('sprClearBtn').onclick = () => { state.savings.sprite = null; save(); render(); };
