'use strict';
function billsHeldLine() {
  const pp = hoardParts(), n = pp.heldList.length; if (!(pp.held >= 1)) return '';
  return `${money(pp.held)} is held for bills${n ? ` (${nameList(pp.heldList.map(b => b.c.name))})` : ''}, so Savings doesn't count it. `;
}

/* ---------- bill monsters ----------
   Every bill is a monster with health equal to the bill. From one due date to the next it takes
   damage every second, reaching zero the moment the bill hits; then it's slain (marked paid).
   You can slay one early if the Bills pot can cover it. */
let editingDue = null;
function renderMonsters() {
  const N = monthNumbers(month), { bills } = N;
  const amt = c => Number(c.budget || 0);
  const order = [...bills].sort((a, b) => (dueDate(a, month) || '9').localeCompare(dueDate(b, month) || '9') || amt(b) - amt(a));
  const L = ledgerAt(today());
  $('billList').innerHTML = order.length ? `<div class="machines">${order.map(c => billRow(c, N, L)).join('')}</div>` : '<p class="muted">No bills yet. Add them with Edit bills.</p>';
}
// One bill's row, as on the old Bills page: status, Mark paid / Undo / Paid before I started, the due date.
// The bills list in the town's Bills sheet and each bill's own sheet both draw it.
function billRow(c, N = monthNumbers(month), L = ledgerAt(today()), pic = true) {
  const { isPaid, spentBy } = N, amt = c => Number(c.budget || 0);
  const dueStr = c => { const d = dueDate(c, month); return d ? new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; };
    const k = c.id + '|' + month, tx = state.transactions.filter(t => t.categoryId === c.id && billMonthOf(t) === month), first = catFirstDay(c), due = dueDate(c, month);
    // a bill due before you started (or before you added it) came out of the money you started with
    const pre = !isPaid(c) && (month < first.slice(0, 7) || (month === first.slice(0, 7) && due && due < first)), bf = tx.some(t => t.before);
    const paid = isPaid(c) || pre, byBank = paid && !tx.every(t => t.markedPaid), n = crewOf(c), held = L.heldList.some(b => b.key === k);
    const status = bf || pre ? '<span class="ok">✓ Came out before you started</span>' : paid ? `<span class="ok">✓ Paid${byBank ? ' by your bank' : ''}</span>`
      : (due ? `Due ${dueStr(c)}` : 'No due date yet') + (held ? ' · <span class="warn">money held</span>' : '');
    return `<div class="machine${paid ? ' paid' : ''}${pic ? '' : ' nopic'}" data-monster="${c.id}">
      <span class="chk" ${paid ? '' : 'hidden'} aria-hidden="true">✓</span>
      ${pic ? `<canvas width="96" height="64" data-mach-cv="${c.id}" aria-hidden="true"></canvas>` : ''}
      <div style="min-width:0">
        <div class="row spread"><strong style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(c.name)}</strong><span class="num">${money(paid ? spentBy[c.id] || amt(c) : amt(c))}</span></div>
        <div class="muted" style="font-size:12px">${machineName(c)} · ${money((n) * WORKER_DAY)} a day, locked</div>
        <div style="font-size:12px">${status}</div>
        <div class="acts">${pre ? '' : paid ? (byBank ? '' : `<button class="link" data-unslay="${c.id}">Undo</button>`) : `<button class="link" data-paid="${c.id}">Mark paid</button>` + (month === state.startMonth && L.have.has(k) ? `<button class="link" data-before="${c.id}">Paid before I started</button>` : '')}<button class="link" data-edit-due="${c.id}" aria-label="Change when ${esc(c.name)} is due">Due date</button></div>
      </div>
      ${editingDue === c.id ? `<div style="grid-column:1/-1">${dueEditor(c)}</div>` : ''}
    </div>`;
}
function dueEditor(c) {
  const kind = c.due && c.due.wd != null ? 'wd' : 'day';
  return `<div class="due-edit">
    <select data-due-kind="${c.id}"><option value="day"${kind === 'day' ? ' selected' : ''}>Same date each month</option><option value="wd"${kind === 'wd' ? ' selected' : ''}>A weekday each month</option></select>
    ${kind === 'day' ? `<select data-due-day="${c.id}">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${c.dueDay === i + 1 ? ' selected' : ''}>The ${ordinal(i + 1)}</option>`).join('')}</select>`
      : `<div class="row" style="gap:6px"><select data-due-nth="${c.id}">${Object.entries(NTH).map(([k, v]) => `<option value="${k}"${String(c.due.nth) === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
         <select data-due-wd="${c.id}">${WD.map((w, i) => `<option value="${i}"${c.due.wd === i ? ' selected' : ''}>${w}</option>`).join('')}</select></div>`}
    <button data-due-done="${c.id}">Done</button></div>`;
}
/* ---------- the battle scene ----------
   Side view of the current fight: three warriors take turns hitting the mob once a second. When it
   falls, coins burst out, the party marches on and the next one walks in. Each bill is its own area. */
/* ---------- building projects ----------
   Each bill is a building in town. Workers haul loads of materials to the site, one hammer blow a
   second, and the building goes up from foundation to roof as the bill's money comes together. */
const BUILDS = [
  { name: 'Cottage', wall: '#d6b98c', dark: '#a8875c', roof: '#b4532a', w: 34, h: 22, extra: 'chimney' },
  { name: 'Mill', wall: '#e7dcc8', dark: '#b9a888', roof: '#7c4a2b', w: 26, h: 34, extra: 'blades' },
  { name: 'Watchtower', wall: '#9ca3af', dark: '#6b7280', roof: '#1e3a8a', w: 20, h: 44, extra: 'flag' },
  { name: 'Barn', wall: '#b91c1c', dark: '#7f1d1d', roof: '#57534e', w: 42, h: 24, extra: 'doors' },
  { name: 'Bakery', wall: '#fde7c7', dark: '#d9b98a', roof: '#be185d', w: 32, h: 24, extra: 'awning' },
  { name: 'Workshop', wall: '#a16207', dark: '#713f12', roof: '#365314', w: 36, h: 22, extra: 'chimney' },
];
// Bills are machines your villagers keep running. A few names fit common bills; the rest get a building.
const MACHINES = [
  [/rent|mortgage|house|home|apartment/i, 'Homestead'], [/internet|wifi|wi-fi|broadband/i, 'Signal tower'], [/phone|mobile|cell/i, 'Message post'],
  [/electric|power|energy|gas bill|utilit/i, 'Generator'], [/water/i, 'Water wheel'], [/car|auto|insurance|geico|progressive|allstate|parking/i, 'Wagon works'],
  [/spotify|music|apple music/i, 'Music box'], [/icloud|cloud|storage|dropbox/i, 'Cloud lantern'], [/claude|ai|chatgpt|openai/i, 'Thinking engine'],
  [/netflix|hulu|disney|stream|tv/i, 'Picture box'], [/gym|fitness/i, 'Training yard'], [/loan|credit|debt|affirm|klarna|afterpay/i, 'Counting house'],
];
const machineName = c => (MACHINES.find(([re]) => re.test(c.name)) || [0, buildOf(c).name])[1];
// One villager is $1 a day of pay. The bills keep as many busy as a normal paycheck's bill share spread over its pay
// period (v117: $1,030 over 14 days is 74), shared out by each bill's size.
const crewOf = c => crewMap()[c.id] || 0;
const periodDaysOf = i => i.every === 'twice' ? 365.25 / 24 : Number(i.every) === 7 ? 7 : Number(i.every) === 14 ? 14 : 365.25 / 12;
const billCrew = () => Math.round(sum(state.incomes.filter(i => Number(i.amount) > 0), i => yearShare(i) / periodDaysOf(i)) / WORKER_DAY);
function crewMap() {
  const cs = state.categories.filter(c => Number(c.budget || 0) > 0), tot = sum(cs, c => Number(c.budget)), B = billCrew();
  const key = cs.map(c => c.id + ':' + c.budget).join(',') + '|' + B;
  if (crewMap.k === key) return crewMap.m;
  const m = {}, e = cs.map(c => tot > 0 ? Number(c.budget) / tot * B : 0); let left = B;
  cs.forEach((c, i) => { m[c.id] = Math.floor(e[i] + 1e-9); left -= m[c.id]; });
  cs.map((c, i) => [e[i] - m[c.id], i]).sort((a, b) => b[0] - a[0]).slice(0, Math.max(0, left)).forEach(([, i]) => m[cs[i].id]++);
  crewMap.k = key; crewMap.m = m; return m;
}
const buildOf = c => BUILDS[[...c.name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 11) % BUILDS.length];
// The bill buttons (here and in the town's bill sheets): Mark paid, Undo, Paid before I started, the due date.
async function billClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.editDue) { editingDue = editingDue === b.dataset.editDue ? null : b.dataset.editDue; renderMonsters(); return; }
  if (b.dataset.dueDone) { editingDue = null; save(); render(); return; }
  if (b.dataset.rush) {
    const amt = Number(b.dataset.rush), ready = monthNumbers(month).left;
    if (amt > ready + 0.001) { toast(`You only have ${money(ready)} of fun money ready`); return; }
    state.rush[month] = Number(state.rush[month] || 0) + amt;
    save(); render(); toast(`Sent ${moneyExact(amt)} of fun money. It comes back once every project is built.`);
    return;
  }
  if (b.dataset.paid) {
    const c = state.categories.find(c => c.id === b.dataset.paid); if (!c) return;
    const mk = { ...paidMarker(c, month), gameSlain: true, at: Date.now() }; if (month >= today().slice(0, 7)) mk.date = today();
    state.transactions.push(mk); delete billSkips()[c.id + '|' + month];
    save(); render(); toast(`${c.name} is paid for ${new Date(month + '-15').toLocaleDateString(undefined, { month: 'long' })} ✓`); return;
  }
  if (b.dataset.before) {
    const c = state.categories.find(c => c.id === b.dataset.before); if (!c) return;
    state.transactions.push({ ...paidMarker(c, month), date: startDay() || today(), before: true, at: Date.now(), description: c.name + ' (came out before you started)' });
    delete billSkips()[c.id + '|' + month];
    save(); render(); toast(`${c.name} came out before you started, so the money you started with already left it out ✓`); return;
  }
  if (b.dataset.slay) {
    const c = state.categories.find(c => c.id === b.dataset.slay); if (!c) return;
    const billsPot = (potBalances(month).find(p => p.id === 'bills') || { bal: 0 }).bal;
    if (billsPot + 0.005 < Number(c.budget)) { toast(`The Bills pot only has ${money(billsPot)}`); return; }
    if (!await ask(`Finish ${c.name} now? This marks ${money(Number(c.budget))} as paid for this month.`)) return;
    const st = campaign(month).out[c.id];
    state.transactions.push({ ...paidMarker(c, month), gameSlain: true, early: true, dealt: st && !st.paid ? st.dealt : 0 }); delete billSkips()[c.id + '|' + month];
    save(); render(); toast(`${c.name} is built`);
  }
  if (b.dataset.unslay) {
    const c = state.categories.find(c => c.id === b.dataset.unslay); if (!c) return;
    if (billByBank(c.id)) { toast(`${c.name} is paid by your bank`); return; }   // v311: Undo takes back a mark, not a bank payment
    dropMarker(c.id, month); const hit = billHit(c, month); if (hit) billSkips()[c.id + '|' + month] = true;
    save(); render(); toast(hit ? `${c.name} is unpaid again` : `${c.name} is unpaid again. It marks itself paid when it's due.`);
  }
}
$('billList').addEventListener('click', billClick);
function billChange(e) {
  const t = e.target, id = t.dataset.dueKind || t.dataset.dueDay || t.dataset.dueNth || t.dataset.dueWd; if (!id) return;
  const c = state.categories.find(c => c.id === id); if (!c) return;
  if (t.dataset.dueKind) { c.due = t.value === 'wd' ? { nth: 1, wd: 5 } : null; if (!c.due && !c.dueDay) c.dueDay = 1; }
  if (t.dataset.dueDay) { c.dueDay = Number(t.value); c.due = null; }
  if (t.dataset.dueNth) c.due.nth = Number(t.value);
  if (t.dataset.dueWd) c.due.wd = Number(t.value);
  save(); renderMonsters();
}
$('billList').addEventListener('change', billChange);
$('catEditRows').addEventListener('change', e => {
  const t = e.target, c = state.categories.find(c => c.id === t.dataset.id); if (!c) return;
  const f = t.dataset.f;
  if (f === 'name') c.name = t.value.trim() || c.name;
  else if (f === 'budget') { c.budget = Math.max(0, cents(Number(t.value) || 0)); if (Number(t.value) !== c.budget) t.value = c.budget; }   // v311: never below $0
  else if (f === 'dueDay') { c.dueDay = Math.min(31, Math.max(1, parseInt(t.value))) || null; c.due = null; }
  else c[f] = t.value;
  save();
});
$('catEditRows').addEventListener('click', async e => {
  const id = e.target.dataset.catDel; if (!id) return;
  if (!await ask("Delete this bill? It stops coming up, and any money held for it that isn't paid yet goes back to you. Payments you already made stay in your history.")) return;
  const gone = state.categories.find(c => c.id === id);
  state.categories = state.categories.filter(c => c.id !== id);
  if (gone) (state.goneCats = state.goneCats || []).push({ ...gone, gone: Date.now() });
  state.rules = state.rules.filter(r => r.categoryId !== id);
  save(); render();
});
$('addCatBtn').onclick = () => {
  const name = $('newCatName').value.trim(); if (!name) { toast('Give it a name'); return; }
  state.categories.push({ id: uid(), name, budget: Math.max(0, cents(Number($('newCatAmt').value) || 0)), kind: $('newCatKind').value,
    dueDay: Math.min(31, Math.max(1, parseInt($('newCatDue').value))) || null, account: $('newCatAcct').value, at: Date.now() });
  $('newCatName').value = ''; $('newCatAmt').value = ''; $('newCatDue').value = '';
  save(); render(); toast(`Added ${name}`);
};
