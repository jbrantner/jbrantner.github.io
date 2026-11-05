'use strict';
/* Budget (simple): a test version of the budget app with the same look and nothing that adds money over time.
   You add money by hand, set some aside for bills, and sort the rest into pots and projects. Every amount is in
   cents (whole numbers), so nothing drifts, and no balance can go below $0. */
const APP_VERSION = 1;
const KEY = 'budget-simple';                 // apart from the main app's data (same site, different key)
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const POT_C = '#ffd27a', PROJ_C = '#7ee8d0', BILL_C = '#8e8ee6';

/* ---------- money ---------- */
const toC = v => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const dollars = c => (Math.max(0, c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m = c => '$' + dollars(c);                                        // $1,234.56 (cents kept)
const mWhole = c => '$' + Math.floor(Math.max(0, c) / 100).toLocaleString();
const mSplit = c => { const s = dollars(c), i = s.lastIndexOf('.'); return `$${s.slice(0, i)}<span class="c">${s.slice(i)}</span>`; };

/* ---------- saved data ---------- */
const blank = () => ({ v: 1, free: 0, bills: 0, pots: [], billList: [], paid: {}, log: [] });
let state = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return fix(s); } catch (e) {}
  return blank();
}
function fix(s) {   // a backup can carry anything: keep only sane, non-negative whole cents
  const b = blank(), c = n => Math.max(0, Math.round(Number(n) || 0));
  b.free = c(s.free); b.bills = c(s.bills);
  b.pots = (Array.isArray(s.pots) ? s.pots : []).filter(p => p && p.id).map(p => ({ id: String(p.id), name: String(p.name || 'Pot').slice(0, 40), kind: p.kind === 'project' ? 'project' : 'pot', goal: c(p.goal), bal: c(p.bal) }));
  b.billList = (Array.isArray(s.billList) ? s.billList : []).filter(x => x && x.id).map(x => ({ id: String(x.id), name: String(x.name || 'Bill').slice(0, 40), amt: c(x.amt), due: x.due >= 1 && x.due <= 31 ? Math.round(x.due) : null }));
  b.paid = s.paid && typeof s.paid === 'object' ? s.paid : {};
  b.log = Array.isArray(s.log) ? s.log.slice(-500) : [];
  return b;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Couldn't save on this phone"); } }
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
function logIt(type, amt, from, to, note) { state.log.push({ t: Date.now(), type, amt, from: from || null, to: to || null, note: note || '' }); if (state.log.length > 500) state.log.splice(0, state.log.length - 500); }

/* ---------- places money can sit ---------- */
// 'free' (not sorted yet), 'bills' (set aside for bills), or a pot's id
const potOf = id => state.pots.find(p => p.id === id);
const nameOf = id => id === 'free' ? 'Free money' : id === 'bills' ? 'Bills' : (potOf(id) || { name: 'A pot' }).name;
const balOf = id => id === 'free' ? state.free : id === 'bills' ? state.bills : (potOf(id) || { bal: 0 }).bal;
function setBal(id, c) { c = Math.max(0, Math.round(c)); if (id === 'free') state.free = c; else if (id === 'bills') state.bills = c; else { const p = potOf(id); if (p) p.bal = c; } }
const places = () => ['free', 'bills', ...state.pots.map(p => p.id)];
const total = () => state.free + state.bills + state.pots.reduce((a, p) => a + p.bal, 0);

/* ---------- bills this month ---------- */
const ym = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const paidNow = () => state.paid[ym()] || {};
const unpaid = () => state.billList.filter(b => !paidNow()[b.id]);
const billsLeft = () => unpaid().reduce((a, b) => a + b.amt, 0);
const billsMonth = () => state.billList.reduce((a, b) => a + b.amt, 0);
function dueText(b) {
  if (!b.due) return 'no due date';
  const d = new Date(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), day = Math.min(b.due, last);
  const when = new Date(d.getFullYear(), d.getMonth(), day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (day < d.getDate() ? 'was due ' : 'due ') + when;
}
const byDue = (a, b) => (a.due || 99) - (b.due || 99) || a.name.localeCompare(b.name);

/* ---------- screen ---------- */
let tab = 'budget';
const opened = new Set();
function render() {
  $('monthLabel').textContent = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (tab === 'bills') { $('homeList').innerHTML = billsTop(); $('townList').innerHTML = `<div class="bs-billtab">${billsList()}</div>`; }
  else { $('homeList').innerHTML = freeCard() + billsCard(); $('townList').innerHTML = potsHTML(); }
}
function freeCard() {
  const T = total(), f = T > 0 ? state.free / T : 0;
  return `<div class="vl-hero pp-panel mh-have"><button class="mh-cu" data-act="add" aria-label="Free money: ${m(state.free)}. Add money"><span class="vl-k">Free money <small>of ${m(T)}</small> ›</span>`
    + `<span class="vl-total num">${m(state.free)}</span><span class="mh-bar" aria-hidden="true"><i style="width:${(f * 100).toFixed(1)}%"></i></span>`
    + `<span class="vl-sub">${T === 0 ? 'Tap to add the money you have now' : state.free > 0 ? 'Not in a pot, a project or bills yet. Tap to add money' : 'Every dollar has a place. Tap to add money'}</span></button></div>`;
}
function billsCard() {
  const need = billsLeft(), H = state.bills, f = need > 0 ? Math.min(1, H / need) : (H > 0 ? 1 : 0), short = Math.max(0, need - H);
  const say = !state.billList.length ? 'Add your bills to see what to set aside'
    : need === 0 ? (H > 0 ? `All paid this month. ${m(H)} is ready for next month` : 'All paid this month')
    : short > 0 ? `${m(short)} more to set aside for the ${unpaid().length === 1 ? 'bill' : unpaid().length + ' bills'} left this month`
    : `Set ✓ for the ${unpaid().length === 1 ? 'bill' : unpaid().length + ' bills'} left this month${H > need ? `, plus ${m(H - need)} toward next month` : ''}`;
  return `<div class="vl-hero pp-panel mh-have bs-bills"><button class="mh-cu" data-go="bills" aria-label="Bills: ${m(H)} set aside. Open bills"><span class="vl-k">Bills <small>${need > 0 ? 'of ' + m(need) + ' left' : 'set aside'}</small> ›</span>`
    + `<span class="vl-total num">${m(H)}</span><span class="mh-bar" aria-hidden="true"><i style="width:${(f * 100).toFixed(1)}%"></i></span>`
    + `<span class="vl-sub">${say}</span></button>`
    + `<div class="bs-row"><button class="pp-plan" data-act="setaside">Set aside</button>${short > 0 && state.free > 0 ? `<button class="pp-plan" data-act="fillbills">Fill it up</button>` : ''}</div></div>`;
}
function pips(p) {
  if (!p.goal) return '';
  const f = Math.min(1, p.bal / p.goal), n = f * 10;
  let h = ''; for (let i = 0; i < 10; i++) h += i + 1 <= n ? '<i class="on"></i>' : i < n ? `<i class="part" style="--p:${((n - i) * 100).toFixed(0)}%"></i>` : '<i></i>';
  return `<div class="pp-pips" aria-hidden="true">${h}</div>`;
}
function potCard(p) {
  const o = opened.has(p.id), proj = p.kind === 'project', done = p.goal && p.bal >= p.goal;
  return `<div class="pp-card ${proj ? 'proj' : 'pot'} ${p.bal > 0 ? 'live' : 'idle'}${o ? ' open xo' : ''}" style="--cc:${proj ? PROJ_C : POT_C}" data-vl-row="${p.id}">`
    + `<button class="pp-head" data-pp-open="${p.id}" aria-expanded="${o}"><span class="pp-nm"><em class="pp-kind">${proj ? 'Project' : 'Pot'}</em><span class="pp-nmr"><b>${esc(p.name)}</b>${done ? ' <span class="ok">✓</span>' : ''}</span></span>`
    + `<span class="pp-amt"><span class="num pp-roll">${mSplit(p.bal)}</span>${p.goal ? `<small>of ${mWhole(p.goal)}</small>` : ''}</span></button>`
    + pips(p)
    + `<div class="pp-acts"><button class="pp-chip pp-pay" data-act="putin" data-id="${p.id}">Put money in</button>${p.goal && p.bal < p.goal && state.free > 0 ? `<button class="pp-chip" data-act="fillto" data-id="${p.id}">Fill to ${mWhole(p.goal)}</button>` : ''}<button class="pp-chip pp-edit" data-act="edit" data-id="${p.id}" aria-label="Edit ${esc(p.name)}">Edit</button></div>`
    + `<div class="pp-xv"><div id="townShBody"><div class="tn-shtop"><div class="tn-acts"><button data-act="move" data-id="${p.id}">Move money</button><button data-act="spendfrom" data-id="${p.id}">Spend from it</button></div></div></div></div></div>`;
}
function potsHTML() {
  const ps = state.pots.filter(p => p.kind === 'pot'), pj = state.pots.filter(p => p.kind === 'project');
  let h = `<div class="pp-sec pp-sec-home"><h3 class="pp-h2">Pots and Projects</h3><button class="pp-plan" data-act="sort">Sort money</button></div><div class="pp-list pp-one">`;
  h += [...ps, ...pj].map(potCard).join('') + '</div>';
  h += `<button class="pp-big alt pp-add" data-act="newpot">＋ Add a pot or project</button>`;
  if (!state.pots.length) h += `<p class="muted bs-empty">Pots hold money you keep (Savings, Emergency). Projects hold money toward a goal (Vacation, Laptop). Money only goes in when you put it there.</p>`;
  return h;
}
function billsTop() {
  const need = billsLeft(), H = state.bills, f = need > 0 ? Math.min(1, H / need) : (H > 0 ? 1 : 0), short = Math.max(0, need - H);
  return `<div class="vl-hero pp-panel mh-have bs-bills"><div class="mh-cu"><span class="vl-k">Set aside for bills</span>`
    + `<span class="vl-total num">${m(H)}</span><span class="mh-bar" aria-hidden="true"><i style="width:${(f * 100).toFixed(1)}%"></i></span>`
    + `<span class="vl-sub">${need === 0 ? (state.billList.length ? 'Every bill is paid this month' : 'No bills yet') : short > 0 ? `${m(need)} left to pay this month · ${m(short)} more to set aside` : `${m(need)} left to pay this month · all set ✓`}</span></div>`
    + `<div class="bs-row"><button class="pp-plan" data-act="setaside">Set aside</button>${short > 0 && state.free > 0 ? `<button class="pp-plan" data-act="fillbills">Fill it up</button>` : ''}${H > 0 ? `<button class="pp-plan" data-act="billsout">Take out</button>` : ''}</div></div>`;
}
function billsList() {
  const P = paidNow(), un = state.billList.filter(b => !P[b.id]).sort(byDue), done = state.billList.filter(b => P[b.id]).sort(byDue);
  let h = `<div class="pp-sec pp-sec-bills"><h3 class="pp-h2">Bills</h3><span><b class="bh-tot">${m(billsMonth())}</b> a month</span></div>`;
  if (!state.billList.length) return h + `<button class="pp-big alt pp-add" data-act="newbill">＋ Add a bill</button><p class="muted bs-empty">Add each bill once. The app shows what's left to pay this month and how much you've set aside for it. Tap Paid when one goes out.</p>`;
  h += `<div class="pp-panel pp-bills">`;
  h += un.map(b => `<div class="pp-bill"><button class="pp-bl" data-act="editbill" data-id="${b.id}" aria-label="${esc(b.name)}, ${m(b.amt)}, ${dueText(b)}"><b>${esc(b.name)}</b><small>${dueText(b)}</small></button><span class="pp-br"><span class="num">${m(b.amt)}</span></span><button class="vl-pay" data-act="paid" data-id="${b.id}" aria-label="Mark ${esc(b.name)} paid">Paid</button></div>`).join('');
  if (done.length) h += `<div class="pp-bills-h bs-paidh">Paid this month</div>` + done.map(b => `<div class="pp-bill done"><button class="pp-bl" data-act="editbill" data-id="${b.id}"><b>${esc(b.name)}</b><small>${dueText(b)}</small></button><span class="pp-br"><span class="num">${m(P[b.id] === true ? b.amt : P[b.id])}</span><small><span class="ok">paid ✓</span></small></span><button class="vl-pay undo" data-act="unpaid" data-id="${b.id}" aria-label="Undo paid for ${esc(b.name)}">Undo</button></div>`).join('');
  h += `</div><button class="pp-big alt pp-add" data-act="newbill">＋ Add a bill</button>`;
  return h;
}

/* ---------- toast ---------- */
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- the money dialog ---------- */
// mode: 'add' (money in), 'move', 'spend', 'bank' (bank check). Amounts can never pass what's there.
let mv = null;
function openMoney(mode, opt = {}) {
  mv = { mode, ...opt };
  const all = places(), opts = (ids, sel) => ids.map(id => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(nameOf(id))} (${mWhole(balOf(id))})</option>`).join('');
  const T = { add: 'Add money', move: 'Move money', spend: 'Spend', bank: 'Bank check' }[mode];
  $('mvTitle').textContent = T; $('mvGo').textContent = { add: 'Add', move: 'Move', spend: 'Spend', bank: 'Check' }[mode];
  $('mvSays').textContent = mode === 'add' ? 'Money that just landed in your bank: a paycheck, a gift, money back. It goes where you pick.'
    : mode === 'bank' ? 'What does your bank app say right now? The difference lands in (or comes out of) Free money.'
    : mode === 'spend' ? 'Money that left your bank. It comes out of the place you pick.' : '';
  $('mvFromF').classList.toggle('hidden', mode === 'add' || mode === 'bank');
  $('mvToF').classList.toggle('hidden', mode === 'spend' || mode === 'bank');
  $('mvPick').style.gridTemplateColumns = mode === 'move' ? '' : '1fr';
  $('mvFrom').innerHTML = opts(all, opt.from || (mode === 'spend' ? (state.free > 0 ? 'free' : all.find(id => id !== 'bills' && balOf(id) > 0) || (state.bills > 0 ? 'bills' : 'free')) : 'free'));
  $('mvTo').innerHTML = opts(all, opt.to || (mode === 'add' ? 'free' : all.find(id => id !== $('mvFrom').value) || 'bills'));
  $('mvNoteF').classList.toggle('hidden', mode !== 'spend' && mode !== 'add');
  $('mvNote').value = ''; $('mvNote').placeholder = mode === 'add' ? 'Paycheck' : 'What it was for';
  $('mvSlideRow').classList.toggle('hidden', mode === 'add' || mode === 'bank'); $('mvRange').classList.toggle('hidden', mode === 'add' || mode === 'bank');
  $('mvAmt').value = opt.amt ? (opt.amt / 100).toFixed(2) : mode === 'bank' ? (total() / 100).toFixed(2) : '';
  $('mvAmt').placeholder = mode === 'bank' ? 'Bank balance' : '0.00';
  showAsk('moveBox'); mvSync();
  setTimeout(() => { try { $('mvAmt').focus(); $('mvAmt').select(); } catch (e) {} }, 60);
}
const mvMax = () => mv.mode === 'add' || mv.mode === 'bank' ? Infinity : balOf($('mvFrom').value);
function mvSync(fromSlider) {
  const max = mvMax(), from = $('mvFrom').value, to = $('mvTo').value;
  if (fromSlider) $('mvAmt').value = Math.min(max, +$('mvSlider').value * 100) ? (Math.min(max, +$('mvSlider').value * 100) / 100).toFixed(2) : '';
  let a = toC($('mvAmt').value);
  if (isFinite(max) && a > max) { a = max; $('mvAmt').value = (a / 100).toFixed(2); }
  if (isFinite(max)) { $('mvSlider').max = Math.ceil(max / 100); $('mvSlider').value = Math.round(a / 100); $('mvMax').textContent = m(max); }
  const row = (id, was, now) => `<div class="row spread"><span>${esc(nameOf(id))}</span><span class="num">${m(was)} → <b>${m(now)}</b></span></div>`;
  let pv = '', ok = a > 0;
  if (mv.mode === 'move') { ok = ok && from !== to; pv = from === to ? '<div class="muted">Pick two different places</div>' : row(from, balOf(from), balOf(from) - a) + row(to, balOf(to), balOf(to) + a); }
  else if (mv.mode === 'add') pv = row(to, balOf(to), balOf(to) + a) + `<div class="row spread muted"><span>Everything</span><span class="num">${m(total())} → ${m(total() + a)}</span></div>`;
  else if (mv.mode === 'spend') pv = max === 0 ? `<div class="muted">${esc(nameOf(from))} is empty. Pick another place.</div>` : row(from, balOf(from), balOf(from) - a);
  else if (mv.mode === 'bank') {
    const raw = $('mvAmt').value.trim(), b = raw === '' ? null : Math.round(Math.max(0, parseFloat(raw) || 0) * 100), T = total(), d = b == null ? 0 : b - T;
    ok = b != null && d !== 0;
    pv = b == null ? '' : d === 0 ? '<div class="ok">Matches ✓ Nothing to change</div>'
      : d > 0 ? `<div>Your bank has <b>${m(d)}</b> more than the app. It goes into Free money.</div>`
      : -d <= state.free ? `<div>Your bank has <b>${m(-d)}</b> less than the app. It comes out of Free money.</div>`
      : state.free === 0 ? `<div>Your bank has <b>${m(-d)}</b> less than the app, and Free money is empty. Use Spend from it on the pot (or Bills) it came out of.</div>`
      : `<div>Your bank has <b>${m(-d)}</b> less than the app. ${m(state.free)} comes out of Free money; the other ${m(-d - state.free)} needs Spend from it on the pot (or Bills) it came out of.</div>`;
    if (b != null && d < 0 && -d > state.free && state.free === 0) ok = false;
  }
  $('mvPreview').innerHTML = pv; $('mvGo').disabled = !ok;
}
function mvGo() {
  const a = toC($('mvAmt').value), from = $('mvFrom').value, to = $('mvTo').value, note = $('mvNote').value.trim();
  if (mv.mode === 'add') { if (!a) return; setBal(to, balOf(to) + a); logIt('in', a, null, to, note); toast(`${m(a)} added to ${nameOf(to)}`); }
  else if (mv.mode === 'move') { const x = Math.min(a, balOf(from)); if (!x || from === to) return; setBal(from, balOf(from) - x); setBal(to, balOf(to) + x); logIt('move', x, from, to); toast(`${m(x)} moved to ${nameOf(to)}`); }
  else if (mv.mode === 'spend') { const x = Math.min(a, balOf(from)); if (!x) return; setBal(from, balOf(from) - x); logIt('spend', x, from, null, note); toast(`${m(x)} spent from ${nameOf(from)}`); }
  else if (mv.mode === 'bank') {
    const raw = $('mvAmt').value.trim(); if (raw === '') return;
    const d = Math.round(Math.max(0, parseFloat(raw) || 0) * 100) - total();
    if (d > 0) { state.free += d; logIt('fix', d, null, 'free', 'Bank check'); toast(`${m(d)} added to Free money`); }
    else if (d < 0) { const x = Math.min(-d, state.free); state.free -= x; logIt('fix', x, 'free', null, 'Bank check'); toast(x < -d ? `${m(x)} taken from Free money. ${m(-d - x)} still to take from a pot` : `${m(x)} taken from Free money`); }
  }
  save(); hideAsk(); render();
}

/* ---------- pots and projects ---------- */
let potEdit = null, potKind = 'pot';
function setKind(k) {
  potKind = k; document.querySelectorAll('#potBox [data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === k));
  $('potKindSay').textContent = k === 'pot' ? 'A pot holds money you keep, like Savings or Emergency.' : 'A project holds money toward a goal, like Vacation or a laptop.';
  $('potGoalF').classList.toggle('hidden', k === 'pot'); $('potName').placeholder = k === 'pot' ? 'Savings' : 'Vacation';
}
function openPot(id) {
  const p = id ? potOf(id) : null; potEdit = p ? p.id : null;
  $('potTitle').textContent = p ? 'Edit ' + p.name : 'Add a pot or project';
  $('potName').value = p ? p.name : ''; $('potGoal').value = p && p.goal ? (p.goal / 100).toFixed(2) : ''; $('potErr').textContent = '';
  $('potDel').hidden = !p; setKind(p ? p.kind : 'pot'); showAsk('potBox');
  setTimeout(() => { try { $('potName').focus(); } catch (e) {} }, 60);
}
function potGo() {
  const name = $('potName').value.trim(), goal = potKind === 'project' ? toC($('potGoal').value) : 0;
  if (!name) { $('potErr').textContent = 'Give it a name'; return; }
  if (potKind === 'project' && !goal) { $('potErr').textContent = 'A project needs a goal'; return; }
  if (potEdit) { const p = potOf(potEdit); p.name = name; p.goal = goal; p.kind = potKind; }
  else { const id = uid(); state.pots.push({ id, name, kind: potKind, goal, bal: 0 }); opened.clear(); opened.add(id); }
  save(); hideAsk(); render();
}
function potDel() {
  const p = potOf(potEdit); if (!p) return;
  confirmAsk(`Delete ${p.name}?`, p.bal > 0 ? `The ${m(p.bal)} in it goes back to Free money, so nothing is lost.` : 'It is empty, so no money moves.', 'Delete', () => {
    if (p.bal > 0) { state.free += p.bal; logIt('move', p.bal, p.id, 'free', 'Deleted ' + p.name); }
    state.pots = state.pots.filter(x => x.id !== p.id); opened.delete(p.id); save(); render(); toast(`${p.name} deleted`);
  });
}

/* ---------- bills ---------- */
let billEdit = null;
function openBill(id) {
  const b = id ? state.billList.find(x => x.id === id) : null; billEdit = b ? b.id : null;
  $('billTitle').textContent = b ? 'Edit ' + b.name : 'Add a bill';
  $('billName').value = b ? b.name : ''; $('billAmt').value = b ? (b.amt / 100).toFixed(2) : ''; $('billDue').value = b && b.due ? b.due : '';
  $('billErr').textContent = ''; $('billDel').hidden = !b; showAsk('billBox');
  setTimeout(() => { try { $('billName').focus(); } catch (e) {} }, 60);
}
function billGo() {
  const name = $('billName').value.trim(), amt = toC($('billAmt').value), dd = parseInt($('billDue').value, 10), due = dd >= 1 && dd <= 31 ? dd : null;
  if (!name) { $('billErr').textContent = 'Give it a name'; return; }
  if (!amt) { $('billErr').textContent = 'How much is it each month?'; return; }
  if (billEdit) Object.assign(state.billList.find(x => x.id === billEdit), { name, amt, due });
  else state.billList.push({ id: uid(), name, amt, due });
  save(); hideAsk(); render();
}
function billDel() {
  const b = state.billList.find(x => x.id === billEdit); if (!b) return;
  confirmAsk(`Delete ${b.name}?`, 'Money set aside for bills stays where it is.', 'Delete', () => { state.billList = state.billList.filter(x => x.id !== b.id); save(); render(); });
}
// Paid: the bill comes out of the money set aside for bills; if that's short, the rest comes out of Free money.
function markPaid(id) {
  const b = state.billList.find(x => x.id === id); if (!b) return;
  const fromBills = Math.min(b.amt, state.bills), fromFree = Math.min(b.amt - fromBills, state.free), short = b.amt - fromBills - fromFree;
  const go = () => {
    state.bills -= fromBills; state.free -= fromFree;
    (state.paid[ym()] = state.paid[ym()] || {})[id] = fromBills + fromFree;
    logIt('bill', fromBills + fromFree, fromBills ? 'bills' : 'free', null, b.name + (fromFree && fromBills ? ` (${m(fromFree)} from Free money)` : ''));
    save(); render(); toast(`${b.name} paid ✓`);
  };
  if (fromFree || short) confirmAsk(`Pay ${b.name}?`, `Bills has ${m(fromBills)} set aside. ${fromFree ? `${m(fromFree)} comes out of Free money. ` : ''}${short ? `That still leaves ${m(short)} the app doesn't have: if it came from your bank, do a Bank check after.` : ''}`, 'Mark paid', go);
  else go();
}
function markUnpaid(id) {
  const P = paidNow(), amt = P[id]; if (amt == null) return;
  const back = amt === true ? 0 : Math.max(0, Math.round(amt) || 0);
  state.bills += back; delete P[id]; if (back) logIt('move', back, null, 'bills', 'Undo paid');
  save(); render(); toast(back ? `${m(back)} back in Bills` : 'Marked not paid');
}

/* ---------- ask dialogs ---------- */
let lastFocus = null;
function showAsk(id) { lastFocus = document.activeElement; document.querySelectorAll('.ask').forEach(a => a.classList.add('hidden')); $(id).classList.remove('hidden'); }
function hideAsk() { document.querySelectorAll('.ask').forEach(a => a.classList.add('hidden')); try { lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); } catch (e) {} }
let askYes = null;
function confirmAsk(title, says, yes, fn) { $('askTitle').textContent = title; $('askSays').textContent = says; $('askYes').textContent = yes; askYes = fn; showAsk('askBox'); }

/* ---------- history ---------- */
function openHistory() {
  const L = state.log.slice().reverse().slice(0, 200);
  const line = x => {
    const d = new Date(x.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const what = x.type === 'in' ? `Added to ${esc(nameOf(x.to))}` : x.type === 'move' ? `${x.from ? esc(nameOf(x.from)) : '—'} → ${x.to ? esc(nameOf(x.to)) : '—'}` : x.type === 'spend' ? `Spent from ${esc(nameOf(x.from))}` : x.type === 'bill' ? 'Bill paid' : 'Bank check';
    const sign = x.type === 'in' || (x.type === 'fix' && x.to) ? '+' : x.type === 'move' ? '' : '−';
    return `<div class="row spread bs-hist"><span><b>${what}</b><small class="muted">${d}${x.note ? ' · ' + esc(x.note) : ''}</small></span><span class="num">${sign}${m(x.amt)}</span></div>`;
  };
  $('histList').innerHTML = L.length ? L.map(line).join('') : '<p class="muted">Nothing yet.</p>';
  showAsk('histBox');
}

/* ---------- backup, sample data, start over ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'budget-simple', ...state }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `budget-simple-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => { try { const s = JSON.parse(r.result); if (!s || s.v !== 1 || !Array.isArray(s.pots)) throw 0; state = fix(s); save(); render(); toast('Backup restored'); } catch (e) { toast("That file isn't a backup from this app"); } };
  r.readAsText(file);
}
function sample() {
  const id = () => uid();
  return fix({ v: 1, free: 18450, bills: 95000,
    pots: [{ id: id(), name: 'Savings', kind: 'pot', goal: 0, bal: 32012 }, { id: id(), name: 'Emergency', kind: 'pot', goal: 0, bal: 41000 },
      { id: id(), name: 'Vacation', kind: 'project', goal: 80000, bal: 4612 }, { id: id(), name: 'Car repairs', kind: 'project', goal: 50000, bal: 6000 }],
    billList: [{ id: id(), name: 'Rent', amt: 90000, due: 1 }, { id: id(), name: 'Phone', amt: 6000, due: 15 }, { id: id(), name: 'Internet', amt: 5000, due: 20 }, { id: id(), name: 'Streaming', amt: 1500, due: null }],
    paid: {}, log: [] });
}

/* ---------- look ---------- */
function palApply() {   // the Coral reef card colors (the main app's palApply, look B), in the chosen look's colors
  const r = document.documentElement.style, set = (k, v) => r.setProperty(k, palMap(v));
  if (!document.documentElement.classList.contains('look-b')) {
    set('--pal-sky', '#1d1240'); set('--pal-a', '#6ed0ff'); set('--pal-b', '#b89eff'); set('--pal-pk', '#2b7e50'); set('--c-bill', '#4c4c8c');
    for (const k of ['--pp-moss', '--pp-gold', '--accent', '--ok']) set(k, '#6ed0ff');
    set('--pp-ember', '#f594c3'); set('--pp-proj', '#73dee9'); set('--warn', '#fdc495');
    set('--pp-mint-dim', 'color-mix(in srgb, #6ed0ff 62%, #0b0a18)'); set('--pp-hollow', 'color-mix(in srgb, #6ed0ff 35%, #0b0a18)');
    set('--pp-moss-soft', 'color-mix(in srgb, #6ed0ff 18%, #0b0a18)'); set('--pp-gold-soft', 'color-mix(in srgb, #6ed0ff 18%, #0b0a18)');
    return;
  }
  set('--pal-sky', '#145466'); set('--pal-a', '#ff8a80'); set('--pal-b', '#ffd27a'); set('--pal-pk', '#ff8a80'); set('--c-bill', '#8e8ee6');
  for (const k of ['--pp-moss', '--accent', '--ok']) set(k, '#ff8a80');
  set('--pp-gold', '#ffaba4'); set('--pp-ember', '#ffd27a'); set('--pp-proj', '#ff9a92'); set('--warn', '#ffd27a');
  set('--pp-mint-dim', '#3f7686'); set('--pp-hollow', 'rgba(255, 138, 128, .5)');
  set('--pp-moss-soft', 'color-mix(in srgb, #ff8a80 18%, #0b3d4c)'); set('--pp-gold-soft', 'color-mix(in srgb, #ff8a80 18%, #0b3d4c)');
}
function lookSync() { const k = document.documentElement.classList.contains('look-b') ? (palKey || 'b') : 'f'; document.querySelectorAll('[data-look]').forEach(x => x.classList.toggle('on', x.dataset.look === k)); }
document.querySelectorAll('[data-look]').forEach(x => x.onclick = () => {
  const k = x.dataset.look, b = k !== 'f'; document.documentElement.classList.toggle('look-b', b); palKey = PAL_LOOKS[k] ? k : '';
  try { localStorage.setItem('bsimple-look', b ? 'b' : 'f'); localStorage.setItem('bsimple-pal', palKey); } catch (e) {}
  lookSync(); palRemap(document); palApply(); render();
});

/* ---------- tabs ---------- */
function showView(v) {
  tab = v === 'settings' ? tab : v;
  const st = v === 'settings';
  document.documentElement.classList.toggle('full', !st); document.documentElement.classList.toggle('st', st);
  $('view-budget').classList.toggle('hidden', st); $('view-settings').classList.toggle('hidden', !st);
  $('settingsBtn').textContent = st ? '✕' : '⚙';
  document.querySelectorAll('nav button').forEach(x => { const on = x.dataset.view === v; x.classList.toggle('active', on); if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  if (!st) { render(); const s = $('mainScroll'); if (s) s.scrollTop = 0; }
  window.scrollTo(0, 0);
}

/* ---------- taps ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act], [data-pp-open], [data-go], nav button[data-view]'); if (!t) return;
  if (t.dataset.view) return showView(t.dataset.view);
  if (t.dataset.go) return showView(t.dataset.go);
  if (t.dataset.ppOpen) { const id = t.dataset.ppOpen; if (opened.has(id)) opened.delete(id); else { opened.clear(); opened.add(id); } return render(); }
  const a = t.dataset.act, id = t.dataset.id;
  if (a === 'add') openMoney('add');
  else if (a === 'sort') openMoney('move', { from: 'free', to: state.pots[0] ? state.pots[0].id : 'bills' });
  else if (a === 'setaside') openMoney('move', { from: 'free', to: 'bills' });
  else if (a === 'billsout') openMoney('move', { from: 'bills', to: 'free' });
  else if (a === 'fillbills') { const x = Math.min(Math.max(0, billsLeft() - state.bills), state.free); openMoney('move', { from: 'free', to: 'bills', amt: x }); }
  else if (a === 'putin') openMoney('move', { from: 'free', to: id });
  else if (a === 'fillto') { const p = potOf(id); openMoney('move', { from: 'free', to: id, amt: Math.min(p.goal - p.bal, state.free) }); }
  else if (a === 'move') openMoney('move', { from: id, to: 'free' });
  else if (a === 'spendfrom') openMoney('spend', { from: id });
  else if (a === 'edit') openPot(id);
  else if (a === 'newpot') openPot(null);
  else if (a === 'newbill') openBill(null);
  else if (a === 'editbill') openBill(id);
  else if (a === 'paid') markPaid(id);
  else if (a === 'unpaid') markUnpaid(id);
});
$('spendFab').onclick = () => openMoney('spend');
$('settingsBtn').onclick = () => showView(document.documentElement.classList.contains('st') ? tab : 'settings');
$('settingsBack').onclick = () => showView(tab);
['mvFrom', 'mvTo'].forEach(i => $(i).onchange = () => mvSync());
$('mvAmt').oninput = () => mvSync(); $('mvSlider').oninput = () => mvSync(true);
$('mvMinus').onclick = () => { $('mvAmt').value = Math.max(0, toC($('mvAmt').value) - 100) ? (Math.max(0, toC($('mvAmt').value) - 100) / 100).toFixed(2) : ''; mvSync(); };
$('mvPlus').onclick = () => { $('mvAmt').value = ((toC($('mvAmt').value) + 100) / 100).toFixed(2); mvSync(); };
$('mvCancel').onclick = hideAsk; $('mvGo').onclick = mvGo;
$('mvAmt').onkeydown = e => { if (e.key === 'Enter' && !$('mvGo').disabled) mvGo(); };
document.querySelectorAll('#potBox [data-kind]').forEach(b => b.onclick = () => setKind(b.dataset.kind));
$('potCancel').onclick = hideAsk; $('potGo').onclick = potGo; $('potDel').onclick = potDel;
$('billCancel').onclick = hideAsk; $('billGo').onclick = billGo; $('billDel').onclick = billDel;
$('askNo').onclick = hideAsk; $('askYes').onclick = () => { const f = askYes; askYes = null; hideAsk(); if (f) f(); };
$('histClose').onclick = hideAsk;
document.querySelectorAll('.ask').forEach(a => a.addEventListener('click', e => { if (e.target === a) hideAsk(); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideAsk(); });
$('setAdd').onclick = () => openMoney('add'); $('setBank').onclick = () => openMoney('bank'); $('setHistory').onclick = openHistory;
$('exportBtn').onclick = exportBackup; $('importBtn').onclick = () => $('backupFile').click();
$('backupFile').onchange = e => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ''; };
$('demoBtn').onclick = () => confirmAsk('Load sample data?', 'This replaces what is in this test app (your main budget app is not touched).', 'Load', () => { state = sample(); save(); showView('budget'); toast('Sample data loaded'); });
$('resetBtn').onclick = () => confirmAsk('Start over?', 'Clears everything in this test app. Your main budget app is not touched.', 'Start over', () => { state = blank(); save(); opened.clear(); showView('budget'); toast('Cleared'); });
$('verLine').textContent = `Budget (simple) · test version ${APP_VERSION}`;

/* ---------- iPhone height and start ---------- */
const setH = () => document.documentElement.style.setProperty('--appH', window.innerHeight + 'px');
window.addEventListener('resize', setH); setH();
palApply(); lookSync(); showView('budget');
window.addEventListener('pageshow', () => render());
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });   // a new month shows its bills unpaid
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
