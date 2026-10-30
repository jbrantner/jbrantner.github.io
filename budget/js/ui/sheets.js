'use strict';
/* ---------- the Town sheets ----------
   The details behind the cards (a pot or project, Savings, the Bills list, a bill, the add form, the farm's income
   panel). The island map they once opened from is gone (v299); the sheets stay. Nothing here changes money by
   itself: every button hands over to the app's own code (the income panel, the bill handlers, the Move money box,
   setCrew, addPot, addProject, goalChange, deletePot). */
const Town = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const el = id => document.getElementById(id);
  let D = null;
  function readData(now = Date.now()) {
    const N = monthNumbers(month), pots = potBalances(month), FP = farmPay(now), td = today();
    const incomes = state.incomes.map(i => ({ id: i.id, name: i.name || 'Paycheck', amount: Number(i.amount || 0), ...(FP[i.id] || { inMonth: 0, pending: 0, pool: 0, g: 0, waiting: false }) }));
    const preOf = c => { const f = catFirstDay(c), d = dueDate(c, month); return !N.isPaid(c) && (month < f.slice(0, 7) || (month === f.slice(0, 7) && !!d && d < f)); };
    const bills = N.bills.map(c => ({ id: c.id, name: c.name, amount: Number(c.budget || 0), paid: N.isPaid(c) || preOf(c), pre: preOf(c), due: dueDate(c, month), cat: c, bldg: bldgOf(c), crew: crewOf(c) }))
      .sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || b.amount - a.amount);   // the Bills page's order
    const find = id => pots.find(p => p.id === id);
    const stock = [find('savings'), ...pots.filter(p => p.custom && !isMini(p))].filter(Boolean)
      .map(p => ({ id: p.id, name: p.name, bal: p.bal, exact: !!p.exact, goal: goalOf(p.id), kind: p.id === 'savings' ? 'savings' : 'stock', custom: !!p.custom,
        crew: p.id === 'savings' ? savers() : workersAt(p.id) }));
    // the scavenger lives in the woods by the lane, not on the stockhold street (Jordan, v86)
    const sv = find('scavenger'), scavP = { id: 'scavenger', name: 'Spare change', bal: sv ? sv.bal : 0, exact: true, goal: 0, kind: 'scavenger', crew: 0 };
    const projects = pots.filter(p => isMini(p)).map(p => ({ id: p.id, name: p.name, bal: p.bal, goal: goalOf(p.id), crew: workersAt(p.id), kind: 'project', custom: true }));
    return { incomes, waiting: paydaysWaiting(td), bills, billsDue: N.billsDue, stock, projects, scav: scavP, party: partyNow(), now };
  }
  const itemOf = id => [...D.stock, ...D.projects, D.scav].find(p => p.id === id);
  const billOf = id => D.bills.find(b => 'bill:' + b.id === id);
  const billsInfo = () => { const due = D.bills.filter(b => !b.paid); return { n: D.bills.length, paid: D.bills.length - due.length, left: sum(due, b => b.amount) }; };
  const lotIds = () => ['farm', ...(D.bills.length ? ['home'] : []), ...D.stock.map(p => p.id), ...D.projects.map(p => p.id), 'scavenger'];
  let selected = null, form = null;
  // the body moves into an open card and back; if it's ever lost, a new one is made so the sheets keep working
  const sheet = () => el('townSheet'), shBody = () => el('townShBody') || newBody();
  function newBody() { const b = document.createElement('div'); b.id = 'townShBody'; sheet().appendChild(b); if (wired) hook(b); return b; }
  // What a sheet can be: a place (the farm, the bills, a pot or project, spare change), the Bills list (from the Bills sign), or the add-a-lot form.
  const sheetOk = id => (!!D && lotIds().includes(id)) || id === 'home' || id === 'pots' || id === 'projs' || id === 'newpot' || id === 'newproj' || (id === 'cushion' && billsMonthWhole() > 0) || (id.startsWith('bill:') && !!billOf(id));
  function openSheet(id) {
    const fresh = selected !== id; selected = id; if (fresh) form = null;
    renderSheet();
    sheet().classList.add('open'); sheet().setAttribute('aria-hidden', 'false'); el('townScrim').classList.add('on'); document.documentElement.classList.add('town-sheet');
    requestAnimationFrame(() => { el('view-town').style.paddingBottom = (sheet().getBoundingClientRect().height + 24) + 'px'; });
    setTimeout(() => sheet().focus({ preventScroll: true }), 30);
  }
  // v225: a card's details open inside the card: the sheet's body moves into the card's slot; no pop-up, no scrim
  let inline = false;
  function openInline(id, slot) {
    if (!sheetOk(id) || !slot) return false;
    if (selected && !inline) closeSheet();
    const fresh = selected !== id; selected = id; inline = true; if (fresh) { form = null; editFor = null; }
    renderSheet(true); slot.appendChild(shBody()); return true;
  }
  function closeInline() {
    if (!inline) return; inline = false;
    selected = null; form = null; editFor = null; renderSheet.id = null;
    undock(shBody()); shBody().innerHTML = ''; sheet().appendChild(shBody());
    if (window.pxSync) window.pxSync();   // the card closes too
  }
  function closeSheet() {
    if (inline) { closeInline(); return; }
    if (!selected) return;
    selected = null; form = null; renderSheet.id = null; billsDetail = false;
    if (typeof ib !== 'undefined' && ib.id) { ib.id = null; el('incomeBox').classList.add('hidden'); }   // the income panel closes with the farm's sheet
    if (editingDue) editingDue = null;
    undock(shBody());
    sheet().classList.remove('open'); sheet().setAttribute('aria-hidden', 'true'); el('townScrim').classList.remove('on'); document.documentElement.classList.remove('town-sheet');
    el('view-town').style.paddingBottom = '';
  }
  function tap(id) {
    if (inline) { const c = document.querySelector('#townList .pp-card.xo'); if (c && window.pxClose) window.pxClose(true); closeInline(); }
    const adding = id === 'newpot' || id === 'newproj';
    if (!sheetOk(id)) return;
    if (adding) form = 'add';
    openSheet(id);
    if (adding) setTimeout(() => { const i = el('townAddName'); if (i) i.focus({ preventScroll: true }); }, 320);
  }

  /* ---- docking: the app's own panels and lists (the income panel, the bill list, the scavenger's collect
     button and finds) move into the sheet that needs them and back to a hidden shelf when it closes, so
     every one keeps its own code and handlers ---- */
  const DOCKABLE = ['incomeBox', 'newPlotBtn', 'openSplitBtn', 'billList', 'scavCollectBtn', 'scavFinds'];
  const shelf = () => el('townDock');
  function undock(root) { root.querySelectorAll('[data-dock]').forEach(slot => { const n = el(slot.dataset.dock); if (n && slot.contains(n)) shelf().appendChild(n); }); }
  function dock(root) { root.querySelectorAll('[data-dock]').forEach(slot => { const n = el(slot.dataset.dock); if (n) slot.appendChild(n); }); }

  /* ---- the sheets ---- */
  // Workers: how many work here, their rate and goal date, and one-tap moves from and to every other place
  // with movable workers (Savings is the default pool). Each move is moveWorker: − there and + here.
  let wStep = 1, billsDetail = false, bxOpen = null; const BX_MODE = 'dates';
  // v106: a bill's bar: how near it is to due, from its last due date to its next (full and green once paid this month);
  // with no due date, how far through the month. f is 0..1; when: the words for it.
  function billBar(b, now = Date.now()) {
    const td = today(), d = b.due, mDays = daysIn(month), dom = Number(td.slice(8, 10));
    if (b.paid) return { f: 1, when: d ? `was due ${shortDate(d)}` : 'paid this month' };
    if (!d) return { f: clamp((dom - 1 + (now - dayMs(td)) / DAY_MS) / mDays, 0, 1), when: 'no due date' };
    if (d < td) return { f: 1, due: true, when: `was due ${shortDate(d)}` };
    if (d === td) return { f: 1, due: true, when: 'due today' };
    const prev = dueDate(b.cat, prevMonth(month)), t0 = prev ? dayMs(prev) : dayMs(d) - 30 * DAY_MS, t1 = dayMs(d);
    return { f: clamp((now - t0) / (t1 - t0), 0, 1), when: `due ${shortDate(d)}` };
  }
  let vPick = false, vPickFor = null;   // v134: the sheet's picker
  let cPick = '';   // v301: the cushion's picker: 'take' (from a pot or project) or 'give'
  const cDrain = new Set();   // v302: pots and projects picked to empty into the cushion
  let editFor = null;   // v269: the pot or project whose Edit is open
  function workersHTML(p) {
    if (vPickFor !== p.id) { vPick = false; vPickFor = p.id; }
    const here = p.id, w = here === 'savings' ? savers() : workersAt(here), goal = goalOf(here), need = goal - p.bal;
    const when = goal && need > 0 && w > 0 ? `goal around ${new Date(Date.now() + need / (w * WORKER_DAY) * DAY_MS).toLocaleDateString(undefined, need / w > 300 ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' })}` : goal && need <= 0 ? 'goal reached' : goal ? 'paused until someone works here' : '';
    const others = farmPots().filter(id => id !== here && canFarm(id) && !isLocked(id)).map(id => ({ id, name: id === 'savings' ? 'Savings' : potName(id), n: id === 'savings' ? savers() : workersAt(id), full: goalOf(id) > 0 && projectBal(id) >= goalOf(id) - 0.005 }));
    const built = goal > 0 && p.bal >= goal - 0.005 && here !== 'savings';
    const from = built ? [] : others.filter(o => o.n > 0), to = w > 0 ? others.filter(o => !o.full) : [];
    const chip = (o, dir) => `<button class="chip tn-wchip" data-w${dir}="${esc(o.id)}" aria-label="${dir === 'from' ? `Take ${money(wStep * WORKER_DAY)} a day from ${esc(o.name)} (${money(o.n * WORKER_DAY)} a day there)` : `Move ${money(wStep * WORKER_DAY)} a day to ${esc(o.name)}`}"><span>${esc(o.name)}</span> <b>${money(o.n * WORKER_DAY)}</b></button>`;
    return `<div class="tn-workers"><div class="row spread"><h3 class="tn-h3" style="margin:0">Grows by</h3><button class="chip tn-step5" data-act="wstep" aria-pressed="${wStep === 5}">×5</button></div>
      <p class="sh-line st"><strong>${money(w * WORKER_DAY)} a day</strong> · ${money(w * WORKER_DAY * 365 / 12)} a month${when ? ` · ${when}` : ''}</p>
      ${here === 'savings' ? '<p class="sh-line" style="font-size:13px">Whatever isn\'t going to spending, bills, pots or projects is saved here.</p>' : ''}
      ${built ? '<p class="sh-line" style="font-size:13px">Goal reached! Raise its goal to keep saving, or move its money a day somewhere else.</p>' : ''}
      ${here !== 'savings' ? `<div class="tn-even"><button class="vl-lk${isLocked(here) ? ' on' : ''}" data-act="lock" aria-pressed="${isLocked(here)}">${isLocked(here) ? 'Locked' : 'Lock'}</button><button data-act="vminus"${isLocked(here) || !w || state.roundOff ? ' disabled' : ''}>− 1</button><button class="primary" data-act="vplus" aria-expanded="${vPick && canAdd(here)}"${canAdd(here) ? '' : ' disabled'}>+ Add a villager</button></div>
        ${vPick && canAdd(here) ? pickHTML(here, wStep) : `<p class="sh-line" style="font-size:12.5px">${isLocked(here) ? 'Locked: its money a day stays put, and nothing is taken from it.' : '+ lets you pick where the $1 a day comes from.'}</p>`}` : ''}
      ${isLocked(here) || here !== 'savings' ? '' : here !== 'savings' && !built ? `<div class="tn-wrow"><span class="tn-wlbl">Take ${wStep === 5 ? 'five' : 'one'} from</span>${from.length ? from.map(o => chip(o, 'from')).join('') : '<span class="muted" style="font-size:13px">Nobody is free: everyone is on bills or weekly spending.</span>'}</div>` : ''}
      ${here === 'savings' && from.length ? `<div class="tn-wrow"><span class="tn-wlbl">Take ${money(wStep * WORKER_DAY)} a day back from</span>${from.map(o => chip(o, 'from')).join('')}</div>` : ''}
      ${to.length && !isLocked(here) ? `<div class="tn-wrow"><span class="tn-wlbl">Move ${money(wStep * WORKER_DAY)} a day to</span>${to.map(o => chip(o, 'to')).join('')}</div>` : ''}</div>`;
  }
  const bar = f => `<div class="bar goal"><span style="width:${(clamp(f, 0, 1) * 100).toFixed(1)}%"></span></div>`;
  // the live bar's slot: static markup, so the sheet's redraws never restart its stripes (tnCrop fills it)
  const crop = id => `<div class="tn-crop" data-tn-crop="${esc(id)}"><div class="crop-bar"><span></span></div><div class="muted tn-crop-eta" style="font-size:12px; margin-top:3px"></div></div>`;
  // how far the pot is toward its next whole $1, and when that lands. Its workers bring $1 a day each;
  // Savings (whatever's left of the pay) is measured as it fills.
  function tnCrop(body) {
    const c = body.querySelector('[data-tn-crop]'); if (!c) return;
    const id = c.dataset.tnCrop, pb = potBalances(month).find(x => x.id === id), now = Date.now();
    if (!pb) { c.classList.add('hidden'); return; }
    const S = tnCrop.s && tnCrop.s.id === id ? tnCrop.s : (tnCrop.s = { id, t: now, b: pb.bal });
    let rate = id === 'savings' ? 0 : workersAt(id) * WORKER_DAY / DAY_MS;
    if (!rate && now - S.t > 3000 && pb.bal > S.b) rate = (pb.bal - S.b) / (now - S.t);
    const goal = goalOf(id), done = goal && pb.bal >= goal;
    c.classList.toggle('hidden', !rate || !!done); if (!rate || done) return;
    const f = pb.bal - Math.floor(pb.bal), mins = Math.max(1, Math.ceil((1 - f) / rate / 60000)), h = Math.floor(mins / 60);
    c.querySelector('.crop-bar span').style.width = (f * 100).toFixed(2) + '%';
    const t = `Next ${money(1)} in ${h ? h + 'h ' + (mins % 60) + 'm' : mins + 'm'}`, eta = c.querySelector('.tn-crop-eta');
    if (eta.textContent !== t) eta.textContent = t;
    const gb = c.parentNode && c.parentNode.querySelector('.bar.goal span');
    if (gb && goal) gb.style.width = Math.min(100, pb.bal / goal * 100).toFixed(2) + '%';
  }
  // what the Pots page's Manage pots had for each pot: its name, its goal (dollars or months of bills),
  // covering overspending, and delete (each through the app's own code)
  function manageHTML(p) {
    const gm = goalMonthsOf(p.id), gv = gm || state.goals[p.id] || '';
    return `<div class="tn-manage"><h3 class="tn-h3">Manage</h3>
      ${p.custom ? `<label class="field">Name<input data-rename="${esc(p.id)}" value="${esc(p.name)}" maxlength="40" aria-label="Name of ${esc(p.name)}"></label>` : ''}
      <label class="field">${p.kind === 'project' ? 'Goal' : 'Goal (optional)'}<span class="goalcell"><input type="number" inputmode="numeric" min="0" placeholder="${gm ? 'Months' : 'Goal'}" data-goal="${esc(p.id)}" value="${gv}" aria-label="Goal for ${esc(p.name)}${gm ? ', in months of bills' : ''}"><select data-goal-unit="${esc(p.id)}" aria-label="Goal for ${esc(p.name)} in dollars or months of bills"><option value="$">dollars</option><option value="months"${gm ? ' selected' : ''}>months of bills</option></select></span></label>
      ${p.kind === 'stock' ? '<p class="sh-line" style="font-size:13px">Give it a goal and it becomes a project.</p>' : p.kind === 'project' ? '<p class="sh-line" style="font-size:13px">Clear the goal and it goes back to being a pot.</p>' : ''}
      ${p.kind !== 'project' ? `<label class="cover"><input type="checkbox" data-cover="${esc(p.id)}"${coverPots().includes(p.id) ? ' checked' : ''}> Covers overspending after your projects</label>` : ''}
      ${p.custom ? `<div class="tn-acts"><button class="danger" data-pot-del="${esc(p.id)}">Delete ${p.kind === 'project' ? 'project' : 'pot'}</button></div>` : ''}</div>`;
  }
  /* v269 (Jordan's concept, 12:56): an open pot or project's villagers are one row: − 1, + Add a villager and ×5
     (×5 makes both take five). Lock, the lines about them and the Send/Take rows are gone. */
  function slimWorkersHTML(p) {
    if (vPickFor !== p.id) { vPick = false; vPickFor = p.id; }
    const here = p.id, w = Math.max(0, workersAt(here)), L = isLocked(here), add = canAdd(here), five = wStep === 5;
    return `<div class="tn-workers tn-slim"><p class="sh-line tn-rate"><b>${money(Math.round(w * WORKER_DAY * 365 / 12))} a month</b> · ${money(w * WORKER_DAY)} a day</p><div class="tn-even"><button data-act="vminus"${L || !w || state.roundOff ? ' disabled' : ''} aria-label="${money((five ? 5 : 1) * WORKER_DAY)} a day less for ${esc(p.name)}, back to Savings">− ${money((five ? 5 : 1) * WORKER_DAY)}</button>`
      + `<button class="primary" data-act="vplus" aria-expanded="${vPick && add}"${add ? '' : ' disabled'}>+ ${money((five ? 5 : 1) * WORKER_DAY)} a day</button>`
      + `<button class="chip tn-step5" data-act="wstep" aria-pressed="${five}" aria-label="Five at a time">×5</button></div>`
      + (vPick && add ? pickHTML(here, wStep) : '') + (L ? '<p class="sh-line tn-lkn">Locked: what it gets each day stays put. Unlock it in Edit.</p>' : '') + `</div>`;
  }
  /* v269: Edit (Jordan): its name, and a goal or none. With a goal it's a project, without one a pot: the same thing
     underneath (isMini). Nothing changes until Save. Payments made from it, a lock or covering overspending show here
     only when there are any, so none of them gets stuck. */
  /* v272 (Jordan 14:27): Convert to project / Convert to pot in place of Has a goal. A project always has a goal, so its
     amount box comes with it. A project turned into a pot remembers its goal (state.goalWas) for turning it back. */
  function editHTML(p) {
    const id = p.id, g = goalOf(id), gm = goalMonthsOf(id), po = !(g > 0) && paidOff(id), has = g > 0 || po, pays = debtPays(id), nm = esc(p.name);
    const back = !has && Number((state.goalWas || {})[id]) > 0 ? Number(state.goalWas[id]) : '';   // v272: the goal it had as a project
    return `<div class="tn-edit${has ? ' is-proj' : ''}" role="group" aria-label="Edit ${nm}" data-was="${has ? 'proj' : 'pot'}">`
      + `<label class="field">Name<input data-ed="name" value="${nm}" maxlength="40" autocomplete="off" aria-label="Name"></label>`
      + `<label class="field tn-goal${has ? '' : ' hidden'}">Goal amount<input data-ed="goal" type="number" inputmode="decimal" min="0" step="any" placeholder="$" value="${g > 0 ? g : back}" aria-label="Goal amount"></label>`
      + (gm ? `<p class="sh-line tn-ednote tn-pj">Now ${gm} month${gm === 1 ? '' : 's'} of bills. A new amount makes it a set dollar goal.</p>` : '')
      + (po ? '<p class="sh-line tn-ednote tn-pj">Paid off. A new amount starts it again.</p>' : '')
      + `<div class="tn-acts tn-conv"><button type="button" data-act="ed-conv">${has ? 'Convert to pot' : 'Convert to project'}</button></div>`
      + `<p class="sh-line tn-ednote tn-convnote" hidden></p>`
      + (isLocked(id) ? '<label class="tn-ck"><input type="checkbox" data-ed="lock" checked> Lock it</label>' : '')
      + (coverPots().includes(id) ? '<label class="tn-ck"><input type="checkbox" data-ed="cover" checked> Covers overspending after your projects</label>' : '')
      + (pays.length ? `<div class="pp-pays"><h4>Payments</h4>${pays.map(t => `<div class="pp-payr"><span>Paid ${esc(moneyExact(t.amount))} · ${esc(shortDate(t.date))}${t.note ? ` · ${esc(t.note)}` : ''}</span><button class="link" data-debt-undo="${esc(t.id)}" aria-label="Undo the ${esc(moneyExact(t.amount))} payment of ${esc(shortDate(t.date))}">Undo</button></div>`).join('')}</div>` : '')
      + `<div class="tn-acts"><button class="primary" data-act="ed-save">Save</button><button data-act="ed-cancel">Cancel</button></div>`
      + `<div class="tn-acts"><button class="danger" data-act="ed-del">Delete ${nm}</button></div></div>`;
  }
  function saveEdit(id) {
    const box = shBody().querySelector('.tn-edit'), p = state.pots.find(x => x.id === id); if (!box || !p) return;
    const q = k => box.querySelector(`[data-ed="${k}"]`), gIn = q('goal'), raw = gIn.value.trim(), name = q('name').value.trim().slice(0, 40), has = box.classList.contains('is-proj');   // v272: Convert, not a checkbox
    const was = goalOf(id), gm = goalMonthsOf(id), po = !(was > 0) && paidOff(id), amt = Math.round((Number(raw) || 0) * 100) / 100;
    if (!name) { toast('Give it a name'); q('name').focus(); return; }
    if (has && !(amt > 0) && !po) { toast(box.dataset.was === 'pot' ? 'Type its goal: a project saves up to one' : 'Type the goal amount'); gIn.focus(); return; }
    const said = [], $$ = n => n % 1 ? moneyExact(n) : money(n);
    if (name !== p.name) { p.name = name; said.push(`Renamed to ${name}`); }
    if (!has) { if (was > 0 || gm || po) { if (was > 0) (state.goalWas = state.goalWas || {})[id] = was; delete state.goals[id]; delete state.goalMonths[id]; if (state.paidOff) delete state.paidOff[id]; said.push(`${name} is a pot now`); } }
    else if (amt > 0 && (raw !== gIn.defaultValue || !(was > 0))) { const conv = !(was > 0) && !po; delete state.goalMonths[id]; state.goals[id] = amt; if (state.paidOff) delete state.paidOff[id]; if (state.goalWas) delete state.goalWas[id];
      said.push(conv ? `${name} is a project now, saving up to ${$$(amt)}` : `${name}'s goal is ${$$(amt)}`); }
    editFor = null; save();
    const lk = q('lock'), cv = q('cover');
    if (lk && !lk.checked && isLocked(id)) setLock(id, false);
    if (cv && !cv.checked && coverPots().includes(id)) setCover(id, false);
    window.render(); renderSheet(true);   // the app's render (this module's own only redraws the map)
    if (said.length) toast(said.join(' · '));
  }
  function edit(id) {   // the card's Edit button opens and closes it, under the card's details
    editFor = editFor === id ? null : id;
    if (selected === id) renderSheet(true);
    if (editFor) requestAnimationFrame(() => { const e = shBody().querySelector('.tn-edit'); if (e) e.scrollIntoView({ block: 'nearest', behavior: lessMotion() ? 'auto' : 'smooth' }); });
  }
  // Each sheet has a top (numbers that change as money moves; redrawn freely) and a tail (forms, docked
  // panels and lists; redrawn only when it changes and nothing in it has focus, so typing is never interrupted).
  const drainable = () => potBalances(month).filter(p => p.custom && !debtOf(p.id) && p.bal >= 0.01).map(p => ({ id: p.id, name: p.name, amt: Math.floor(p.bal * 100 + 1e-6) / 100 }));
  function drainHTML() {   // v302: empty pots and projects into the cushion, cents and all
      const L = drainable(); for (const x of [...cDrain]) if (!L.some(p => p.id === x)) cDrain.delete(x);
      if (!L.length) return '';
      const tot = c2(sum(L.filter(p => cDrain.has(p.id)), p => p.amt)), all = L.every(p => cDrain.has(p.id));
      return `<div class="tn-drain"><div class="row spread"><h3 class="tn-h3" style="margin:0">Empty into the cushion</h3><button class="chip" data-act="cdr-all" aria-pressed="${all}">${all ? 'None' : 'All'}</button></div>`
        + `<div class="vl-pick" role="group" aria-label="Pots and projects to empty">${L.map(p => `<button class="chip vl-pk${cDrain.has(p.id) ? ' on' : ''}" data-cdr="${esc(p.id)}" aria-pressed="${cDrain.has(p.id)}">${cDrain.has(p.id) ? '✓ ' : ''}${esc(p.name)} · <b>${moneyExact(p.amt)}</b></button>`).join('')}</div>`
        + `<div class="tn-acts"><button class="primary" data-act="cdr-go"${tot > 0 ? '' : ' disabled'}>${tot > 0 ? `Move ${moneyExact(tot)} into the cushion` : 'Pick what to empty'}</button></div></div>`;
  }
  // Spend from it: Savings, the cushion, pots and projects (not debts), and what was spent from each lately
  const spendBtn = id => `<button data-act="spend"${spendRoom(id) >= 0.01 ? '' : ' disabled'}>Spend from it</button>`;
  function spentHTML(id) {
    const L = spendsOf(id).slice(0, 3); if (!L.length) return '';
    return `<div class="pp-pays tn-spent"><h4>Spent from ${id === 'cushion' ? 'Savings' : esc(potName(id))}</h4>${L.map(t => `<div class="pp-payr"><span>${esc(moneyExact(t.amount))} · ${esc(shortDate(t.date))}${t.note ? ` · ${esc(t.note)}` : ''}</span><button class="link" data-spend-undo="${esc(t.id)}" aria-label="Undo spending ${esc(moneyExact(t.amount))} on ${esc(shortDate(t.date))}">Undo</button></div>`).join('')}</div>`;
  }
  function sheetHTML(id) {
    const head = (t, n) => `<div class="tn-head"><h2 id="townShTitle">${esc(t)}</h2><span class="num">${n}</span></div>`;
    if (id === 'cushion') {   // v301: it is Savings' first month of bills, so its money a day is Savings' (what isn't on spending, pots or projects)
      if (vPickFor !== 'cushion') { cPick = ''; vPickFor = 'cushion'; }
      const T = billsMonthWhole(), C = Math.min(T, cushionNow().H), w = savers(), n = wStep === 5 ? 5 : 1;   // v311: below $0 counts (the card shows it since p_15's E3)
      const take = donorList('savings').filter(x => x.id !== 'savings' && x.n > 0), give = farmPots().filter(x => x !== 'savings' && canFarm(x) && !crewBuilt(x)).map(x => ({ id: x, name: potName(x), n: Math.max(0, workersAt(x)), lock: isLocked(x) }));
      const chip = (x, k) => `<button class="chip vl-pk" data-w${k}="${esc(x.id)}"${x.lock ? ' disabled' : ''} aria-label="${k === 'from' ? `Take ${money(n * WORKER_DAY)} a day from` : `Give ${money(n * WORKER_DAY)} a day to`} ${esc(x.name)} (${money(x.n * WORKER_DAY)} a day there)">${esc(x.name)} · <b>${x.n}</b></button>`;
      const pick = cPick === 'take' ? `<div class="vl-pick" role="group" aria-label="Take money a day from"><span class="vl-pkl">Take ${n === 5 ? 'five' : 'one'} from</span>${take.length ? take.map(x => chip(x, 'from')).join('') : '<span class="muted" style="font-size:13px">Nobody to take: pots and projects have no money a day.</span>'}</div>`
        : cPick === 'give' ? `<div class="vl-pick" role="group" aria-label="Give money a day to"><span class="vl-pkl">Give ${n === 5 ? 'five' : 'one'} to</span>${give.length ? give.map(x => chip(x, 'to')).join('') : '<span class="muted" style="font-size:13px">No pot or project to give it to.</span>'}</div>` : '';
      const r = w * WORKER_DAY, left = Math.max(0, T - C), N = daysIn(nextMonth(today().slice(0, 7))), nx = [7, 14, 21, 28].filter(d => d < N).map((d, i) => [i + 1, Math.ceil(T * d / N - 1e-9)]).find(m => C < m[1] - 0.005);
      const span = days => { const d = Math.ceil(days - 1e-9); if (d <= 1) return 'a day'; if (d < 60) return `${d} days`; const mo = Math.round(d / 30.44); if (mo < 24) return `${mo} months`; const y = Math.floor(mo / 12), m = mo % 12; return `${y} years${m ? ` ${m} month${m === 1 ? '' : 's'}` : ''}`; };
      const at = days => new Date(Date.now() + days * DAY_MS).toLocaleDateString(undefined, days > 300 ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' });
      const eta = left < 0.005 ? '<p class="sh-line tn-eta"><b>Full.</b> A whole month of bills is saved ahead.</p>'
        : r > 0 ? `<p class="sh-line tn-eta">At ${money(r)} a day it's full in <b>${span(left / r)}</b>, around ${at(left / r)}.${nx ? ` The ${nx[0] === 1 ? '1 week' : nx[0] + ' weeks'} mark in ${span((nx[1] - C) / r)}.` : ''}</p>`
        : '<p class="sh-line tn-eta">Nothing is going in right now, so it won\'t fill. Tap + to give it money a day.</p>';
      return { top: head('Month cushion', `${C < 0 ? `<span class="bad">${money(C)}</span>` : money(C)} <small>of ${money(T)}</small>`) + eta
        + `<p class="sh-line tn-rate"><b>${money(Math.round(w * WORKER_DAY * 365 / 12))} a month</b> · ${money(w * WORKER_DAY)} a day</p><p class="sh-line st">${w > 0 ? `${money(w * WORKER_DAY)} a day goes in` : 'Nothing goes in right now'}: whatever isn't on spending, pots or projects. Past a month it shows in Savings.</p>`
        + `<div class="tn-workers tn-slim"><div class="tn-even"><button data-act="cminus" aria-expanded="${cPick === 'give'}"${w < 1 || state.roundOff ? ' disabled' : ''} aria-label="${money(n * WORKER_DAY)} a day less, to a pot or project">− ${money(n * WORKER_DAY)}</button>`
        + `<button class="primary" data-act="cplus" aria-expanded="${cPick === 'take'}"${take.length && !state.roundOff ? '' : ' disabled'}>+ ${money(n * WORKER_DAY)} a day</button>`
        + `<button class="chip tn-step5" data-act="wstep" aria-pressed="${n === 5}" aria-label="Five at a time">×5</button></div>${pick}</div>`
        + `<div class="tn-acts"><button data-act="cmove">Move money</button>${spendBtn('cushion')}</div>` + spentHTML('cushion') + drainHTML(), tail: '' };
    }
    if (id === 'farm') {
      const incs = `<div class="tn-dock" data-dock="incomeBox"></div><div class="tn-acts"><span class="tn-dock" data-dock="newPlotBtn"></span><span class="tn-dock" data-dock="openSplitBtn"></span></div>`;
      if (!D.incomes.length) return { top: head('Farm', '') + `<p class="sh-line">No pay is set up yet. Add an income source and it shows up here as a field.</p>`, tail: incs };
      // v117: the paycheck summary (Jordan 21:26): the bank, what bills hold, what's left, what this pay period has
      // earned so far and what's still to come, its villagers, the next payday
      const pp = hoardParts(), pn = periodNow(), r2 = (a, b, cls = '') => `<div class="row spread${cls}"><span>${a}</span><span class="num">${b}</span></div>`;
      const left = pp.bank - pp.held - pp.L.movedBills, nw = state.payNews, news = nw && pn.list.some(c => c.key === nw.key) ? payNewsText(nw) : '';
      let top = head(D.incomes.length === 1 ? D.incomes[0].name : 'Paychecks', `${money(pp.bank)} <small>in the bank</small>`)
        + `<div class="hoard-math tn-paysum">` + r2('In the bank', money(pp.bank)) + r2("Held for bills", '−' + money(pp.held + pp.L.movedBills)) + r2('Left', money(left), ' sum') + `</div>`
        + `<p class="sh-line st">${money(Math.max(0, pp.total + pp.pending))} of it is yours now${pp.pending >= 1 ? ` · ${money(pp.pending)} of that goes out a day at a time this pay period` : ''}</p>`   // v322
        + (pp.wait >= 0.005 ? `<p class="sh-line st">${moneyExact(pp.wait)} of your pay isn't in your bank yet.</p>` : '')
        + (pp.total + pp.pending < -0.5 ? `<p class="sh-line bad">Your bills need ${money(-(pp.total + pp.pending))} more than you have, so Savings is below zero until more pay comes in.</p>` : '');
      for (const c of pn.list) {
        const yours = c.F, earned = c.start ? Math.max(0, c.F - c.pending) : c.got, nm = D.incomes.length > 1 ? esc(c.inc.name) + ' · ' : '';
        top += `<div class="tn-inc tn-period"><h3 class="tn-h3" style="margin:0 0 2px">${nm}This pay period · ${shortDate(c.date)} – ${c.next ? shortDate(c.next) : '?'}</h3>
          <p class="sh-line st">Paycheck ${money(c.D)}${c.start ? ' (before you started: it\'s in your starting balance)' : ''} · ${c.bonus ? 'an extra one, nothing for bills' : c.share ? `${money(Math.min(Math.floor(c.D), c.share))} held for bills` : 'no bills to hold'} · ${money(yours)} yours</p>
          ${yours > 0 ? bar(earned / yours) + `<p class="sh-line st">Earned so far: <strong>${money(earned)}</strong> of ${money(yours)}${c.pending >= 1 ? ` · ${money(c.pending)} still to come` : ''}</p>` : `<p class="sh-line st">All of it went to bills, so nothing is yours this pay period.</p>`}
          <p class="sh-line">${c.V ? `<strong>${money((c.V) * WORKER_DAY)} a day</strong> until ${c.next ? shortDate(c.next) : 'the next payday'} · about ${money(c.V * 365 / 12)} a month at this pace` : 'Nothing coming in a day this pay period.'}${!c.start && c.extra >= 1 ? ` · ${money(c.extra)} more lands in Savings on ${shortDate(c.next)}` : ''}</p>
          ${c.capped ? `<p class="sh-line">Your starting balance, after the bills' hold, covers ${money((c.V) * WORKER_DAY)} a day until then.</p>` : ''}</div>`;
      }
      if (news) top += `<p class="sh-line tn-news">${esc(news)}</p>`;
      for (const w of pn.waiting) top += `<div class="tn-inc"><p class="sh-line st"><strong>Payday ${shortDate(w.date)}.</strong> Enter your paycheck to start its money coming in.</p><div class="tn-acts"><button class="primary" data-pay-open="${esc(w.key)}">Enter paycheck</button></div></div>`;
      const assigned = partyNow() + crewWorkers();
      top += `<p class="sh-line" style="margin-top:10px">${pn.V ? `Your ${money((pn.V) * WORKER_DAY)} a day: ${money(partyNow() * WORKER_DAY)} on weekly spending, ${money(crewWorkers() * WORKER_DAY)} on pots and projects, ${money(savers() * WORKER_DAY)} into Savings.` : ''}${assigned > pn.V && !pn.waiting.length ? ` <span class="bad">${money((assigned - pn.V) * WORKER_DAY)} a day more is going out than this paycheck covers${crewWorkers() === 0 && Number(state.partyPlan || 0) <= pn.V ? ": this week's spending runs until Sunday night, so Savings pays for them until then" : ''}.</span>` : ''}</p>`;
      const nxs = D.incomes.map(i => { const inc = state.incomes.find(x => x.id === i.id); return inc && i.amount > 0 ? nextPayday(inc, today()) : null; }).filter(Boolean).sort();
      top += `<p class="sh-line">${nxs.length ? `Next payday ${shortDate(nxs[0])}.` : 'No paydays coming up.'} Each paycheck holds its share of the bills; the rest comes in a day at a time until the payday after it.</p>`
        + `<div class="tn-acts">${D.incomes.map(i => `<button data-act="income" data-inc="${esc(i.id)}" aria-pressed="${ib.id === i.id}">Edit ${D.incomes.length > 1 ? esc(i.name) : 'income'}</button>`).join('')}</div>`;
      return { top, tail: incs };
    }
    // the pie: of all your villagers (a normal month's pay / $31), how many keep the bills running
    // v220: one box per bill, in the order they hit, holding the villagers it takes; then the villagers left over
    function billBoxes(heldIds, np) {
      const pn = periodNow(), free = pn.V;
      const list = D.bills.slice().sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0);
      const pip = k => `<i class="${k}"></i>`;
      const box = x => {
        const n = Math.max(1, x.crew || 0), done = x.pre || x.paid, now = !done && heldIds.has(x.id), k = done ? 'paid' : now ? 'now' : 'later';
        const cols = n <= 3 ? n : n <= 9 ? 3 : n <= 16 ? 4 : 5, open = BX_MODE === 'tap' && bxOpen === x.id;
        const when = x.due ? shortDate(x.due) : 'any day', st = done ? 'paid' : now ? 'saved' : 'still to save';
        return `<button class="bx-bill ${k}${open ? ' sel' : ''}" data-bx="${esc(x.id)}" aria-label="${esc(x.name)}, ${money(x.amount)}, ${x.crew ? money(x.crew * WORKER_DAY) + ' a day' : 'under $1 a day'}, ${x.due ? 'due ' + when : 'no due date'}, ${st}">`
          + `<span class="bx-nm">${esc(x.name)}</span><span class="bx-box" style="--cols:${cols}">${(x.crew ? '' : pip('part')) + pip('v').repeat(x.crew || 0)}${done ? '<b class="bx-ck">PAID</b>' : ''}</span>`
          + (BX_MODE === 'dates' ? `<span class="bx-dt">${esc(when)}</span>` : '') + `</button>`;
      };
      const sel = BX_MODE === 'tap' && list.find(x => x.id === bxOpen);
      const info = sel ? (() => { const x = sel, done = x.pre || x.paid, now = !done && heldIds.has(x.id);
        return `<div class="bx-info"><div class="bx-info-top"><b>${esc(x.name)}</b><span class="num">${money(x.amount)}</span></div>`
          + `<p>${x.due ? (done ? 'was due ' : 'due ') + shortDate(x.due) : 'no due date'} · ${x.crew ? `${money((x.crew) * WORKER_DAY)} a day` : 'under $1 a day'}</p>`
          + `<p class="${done ? 'ok' : now ? 'tn-held' : 'muted'}">${x.pre ? 'paid before you started' : x.paid ? 'paid this month' : now ? 'saved ✓ The money for it is set aside.' : `${money(billToSave()[x.id] || x.amount)} still to save from your next paychecks`}</p>`
          + `<div class="bx-info-btns"><button data-bill-row="${esc(x.id)}">More</button>${done || x.pre ? '' : `<button class="tn-bpay" data-paid="${esc(x.id)}">Paid early</button>`}</div></div>`; })() : '';
      return `<div class="bx-wrap"><div class="bx-key"><span><i class="now"></i>this paycheck</span><span><i class="later"></i>later this month</span><span><i class="paid"></i>paid</span><span><i class="free"></i>yours</span></div>`
        + `<div class="bx-row">${list.map(box).join('')}<div class="bx-free" role="img" aria-label="${money(free * WORKER_DAY)} a day left over for you"><span class="bx-nm">${free} yours</span><span class="bx-loose">${pip('f').repeat(free)}</span></div></div>${info}`
        + (BX_MODE === 'tap' && !sel ? `<p class="bx-hint">Tap a bill for its date and details.</p>` : '') + `</div>`;
    }
    if (id === 'projs') {
      const rows = D.projects.map(p => {
        const f = p.goal > 0 ? clamp(p.bal / p.goal, 0, 1) : 0, done = p.goal > 0 && p.bal >= p.goal;
        return `<button class="tn-brow${done ? ' paid' : ''}" data-pot-row="${esc(p.id)}" aria-label="${esc(p.name)}, ${money(p.bal)} of ${money(p.goal)}, ${money(p.crew * WORKER_DAY)} a day">
          <span class="tn-brow-top"><b>${esc(p.name)}</b><span class="num">${money(p.bal)} <small class="muted">of ${money(p.goal)}</small></span></span>
          <span class="tn-brow-sub"><span>${done ? 'Built' : `${p.crew > 0 ? `+${money(p.crew * WORKER_DAY)} a day` : 'paused'}`}</span><span>${done ? '<span class="ok">done ✓</span>' : Math.floor(f * 100) + '%'}</span></span>
          <span class="tn-bbar${done ? ' done' : ''}"><span style="width:${(f * 100).toFixed(1)}%"></span>${done ? '<i>✓</i>' : ''}</span></button>`;
      }).join('');
      const saved = sum(D.projects, p => p.bal), goals = sum(D.projects, p => p.goal);
      return { top: head('Projects', D.projects.length ? `${money(saved)} <small>of ${money(goals)}</small>` : '') +
        `<p class="sh-line st">${D.projects.length ? `${D.projects.length} project${D.projects.length === 1 ? '' : 's'} · ${money(sum(D.projects, p => p.crew) * WORKER_DAY)} a day going in` : 'No projects yet. A project is something you save up for, with a goal.'}</p>` +
        (D.projects.length ? `<div class="tn-blist">${rows}</div>` : ''),
        tail: `<div class="tn-acts"><button class="primary" data-act="addproj">+ Add project</button></div>` };
    }
    if (id === 'pots') {
      const total = sum(D.stock, p => p.bal);
      const rows = D.stock.map(p => {
        const target = p.goal > 0 ? p.goal : Math.max(500, billsMonthly()), f = clamp(p.bal / target, 0, 1);
        return `<button class="tn-brow" data-pot-row="${esc(p.id)}" aria-label="${esc(p.name)}, ${money(p.bal)}${p.goal > 0 ? ' of ' + money(p.goal) : ''}, ${money(p.crew * WORKER_DAY)} a day">
          <span class="tn-brow-top"><b>${esc(p.name)}</b><span class="num">${money(p.bal)}${p.goal > 0 ? ` <small class="muted">of ${money(p.goal)}</small>` : ''}</span></span>
          <span class="tn-brow-sub"><span>${p.crew > 0 ? `+${money(p.crew * WORKER_DAY)} a day` : 'nothing going in'}</span><span>${p.goal > 0 ? Math.floor(f * 100) + '%' : ''}</span></span>
          <span class="tn-bbar${f >= 1 ? ' done' : ''}"><span style="width:${(f * 100).toFixed(1)}%"></span></span></button>`;
      }).join('');
      return { top: head('Your gold', money(total)) +
        `<p class="sh-line st">${D.stock.length} pot${D.stock.length === 1 ? '' : 's'} · ${money(sum(D.stock, p => p.crew) * WORKER_DAY)} a day filling ${D.stock.length === 1 ? 'it' : 'them'}</p>` +
        `<div class="tn-blist">${rows}</div>`,
        tail: `<div class="tn-acts"><button class="primary" data-act="addpot">+ Add pot</button></div>` };
    }
    if (id === 'home') {
      // v106: one row per bill (due date order, no due date last): name, amount, when it's due, paid ✓ / money held / not
      // yet held, and a bar for how near it is to due (from its last due date to its next; by the month if it has no
      // due date); a bill paid this month is a full green bar with ✓. A row opens the bill's own sheet. "All bills"
      // shows the detailed rows (the Bills page's own, with Mark paid and the rest) under the list.
      const b = billsInfo(), L = ledgerAt(today()), heldAmt = hoardParts().held, heldIds = new Set(L.heldList.filter(x => x.m <= month).map(x => x.c && x.c.id));
      const nps = state.incomes.filter(i => Number(i.amount) > 0).map(i => nextPayday(i, today())).filter(Boolean).sort(), np = nps[0], TS = billToSave();
      const rows = D.bills.map(x => {
        const r = billBar(x), st = x.pre ? '<span class="ok">before you started ✓</span>' : x.paid ? '<span class="ok">paid ✓</span>' : !(TS[x.id] >= 0.5) ? '<span class="tn-held">saved ✓</span>' : `<span class="muted">${money(TS[x.id])} to save</span>`;
        return `<div class="tn-bwrap"><button class="tn-brow${x.paid ? ' paid' : ''}" data-bill-row="${esc(x.id)}" aria-label="${esc(x.name)}, ${money(x.amount)}, ${esc(r.when)}, ${x.paid ? 'paid' : savedWord(TS, x.id)}">
          <span class="tn-brow-top"><b>${esc(x.name)}</b><span class="num">${money(x.amount)}</span></span>
          <span class="tn-brow-sub"><span>${esc(r.when)} · ${x.crew ? `${money((x.crew) * WORKER_DAY)} a day` : 'under $1 a day'}</span>${st}</span>
          <span class="tn-bbar${x.paid ? ' done' : r.due ? ' due' : ''}"><span style="width:${(r.f * 100).toFixed(1)}%"></span>${x.paid ? '<i>✓</i>' : ''}</span></button>${x.pre ? '' : x.paid ? billByBank(x.id) ? '' : `<button class="tn-bpay undo" data-unslay="${esc(x.id)}" aria-label="Undo paid for ${esc(x.name)}">Undo</button>` : `<button class="tn-bpay" data-paid="${esc(x.id)}" aria-label="Mark ${esc(x.name)} paid">Paid</button>`}</div>`;
      }).join('');
      return { top: head('Bills', b.n ? b.left ? `${money(b.left)} <small>to go</small>` : '<span class="ok">All paid ✓</span>' : '') +
        `<p class="sh-line st">${!b.n ? 'No bills yet.' : `${b.paid} of ${b.n} paid · ${money(heldAmt)} held for bills not paid yet`}</p>` + (b.n ? `<div class="bx-pips bx-paid" aria-hidden="true">${'<i class="on"></i>'.repeat(b.paid)}${'<i></i>'.repeat(b.n - b.paid)}</div>` : '') +
        (b.n ? billBoxes(heldIds, np) + `<div class="tn-blist">${rows}</div>` + (np ? `<p class="sh-line muted" style="font-size:13px">Bills marked saved ✓ have their money set aside. The rest get saved from the bill share of your next paychecks, starting ${shortDate(np)}.</p>` : '') : '<p class="sh-line">Add your bills with Edit bills and they show up here.</p>'),
        tail: (billsDetail && b.n ? `<h3 class="tn-h3">All bills</h3><div class="tn-dock tn-bills" data-dock="billList"></div>` : '') +
          `<div class="tn-acts">${b.n ? `<button data-act="billsdetail" aria-pressed="${billsDetail}">${billsDetail ? 'Hide details' : 'All bills'}</button>` : ''}<button data-act="editbills">Edit bills</button></div>` +
          `<div class="tn-acts"><button class="tn-find" data-act="findbills">Find bills from bank statements</button></div>` };
    }
    if (id.startsWith('bill:')) {
      const b = billOf(id); if (!b) return { top: '', tail: '' };
      const c = b.cat;
      const held = billsHeldLine();
      return { top: head(b.name, `${money(b.amount)}`) + `<p class="sh-line st">${money((b.crew) * WORKER_DAY)} a day set aside for it${b.paid ? ' · paid this month ✓' : ''}</p>` + (held ? `<p class="sh-line">${esc(held)}</p>` : ''),
        tail: `<div class="tn-bill">${billRow(c, monthNumbers(month), ledgerAt(today()), false)}</div><div class="tn-acts"><button data-act="home">All bills</button><button data-act="editbills">Edit bills</button></div>` };
    }
    if (id === 'newpot' || id === 'newproj') {
      const proj = id === 'newproj';
      return { top: head('Add a pot or project', ''), tail:
        `<div class="tn-kind" role="group" aria-label="Pot or project"><button data-act="kind-pot" aria-pressed="${!proj}" class="${proj ? '' : 'on'}">Pot</button><button data-act="kind-proj" aria-pressed="${proj}" class="${proj ? 'on' : ''}">Project</button></div>
        <p class="sh-line">${proj ? 'A project is something you save up for, with a goal. Give it some money a day and it fills as the money comes in.' : 'A pot keeps money month to month, with no goal.'}</p>
        <div class="tn-form"><label class="field">Name<input id="townAddName" maxlength="40" placeholder="${proj ? 'e.g. Laptop' : 'e.g. Car repairs'}"></label>
        ${proj ? '<label class="field">Goal<span class="goalcell"><input id="townAddGoal" type="number" inputmode="decimal" min="1" placeholder="$"><select id="townAddUnit" aria-label="Goal in dollars or months of bills"><option value="$">dollars</option><option value="months">months of bills</option></select></span></label>' : ''}
        <div class="tn-acts" style="margin-top:2px"><button class="primary" data-act="${proj ? 'add-proj' : 'add-pot'}">${proj ? 'Start it' : 'Add it'}</button></div></div>` };
    }
    const p = itemOf(id); if (!p) return { top: '', tail: '' };
    if (inline && p.custom && (p.kind === 'project' || p.kind === 'stock'))   // v269 (Jordan's concept): its villagers and Move money; Edit below
      return { top: head(p.name, `${money(p.bal)}${p.goal ? ` <small>of ${money(p.goal)}</small>` : ''}`) + slimWorkersHTML(p) + `<div class="tn-acts"><button data-act="move">Move money</button>${debtOf(p.id) ? '' : spendBtn(p.id)}</div>` + spentHTML(p.id),
        tail: editFor === p.id ? editHTML(p) : '' };
    if (p.kind === 'project') {
      const done = p.bal >= p.goal;
      return { top: head(p.name, `${money(p.bal)} <small>of ${money(p.goal)}</small>`) + bar(p.bal / p.goal) +
        `<p class="sh-line st">${done ? 'Goal reached! The money is ready when you are.' : `${Math.floor(p.bal / p.goal * 100 + 1e-9)}% of the way · ${money(Math.max(0, p.goal - p.bal))} to go`}</p>
        ${done ? '' : crop(p.id) + `<p class="sh-line">${p.crew > 0 ? `Growing ${money(p.crew * WORKER_DAY)} a day.` : 'Paused. The money stays; give it some money a day to keep it growing.'}</p>`}${workersHTML(p)}
        <div class="tn-acts"><button data-act="move">Move money</button></div>`, tail: manageHTML(p) };
    }
    if (p.kind === 'scavenger') return { top: head('Spare change', moneyExact(p.bal)) +
      `<p class="sh-line st">The leftover cents from rounding purchases up.</p><p class="sh-line">Collect it any time, cents and all: it's split evenly across Savings, your pots and your projects.</p>`,
      tail: `<div class="tn-acts"><span class="tn-dock" data-dock="scavCollectBtn"></span></div><h3 class="tn-h3">Where it came from</h3><div class="tn-dock tn-finds" data-dock="scavFinds"></div>` };
    return { top: head(p.name, `${money(p.bal)}${p.goal ? ` <small>of ${money(p.goal)}</small>` : ''}`) + (p.goal ? bar(p.bal / p.goal) : '') +
      crop(p.id) + workersHTML(p) + `<div class="tn-acts"><button class="primary" data-act="move">Move money</button>${p.id === 'savings' ? spendBtn('savings') : ''}</div>` + (p.id === 'savings' ? spentHTML('savings') : ''), tail: manageHTML(p) };
  }
  function renderSheet(force) {
    if (!selected) return;
    const same = renderSheet.id === selected; renderSheet.id = selected;
    const { top, tail } = sheetHTML(selected), body = shBody();
    if (!same || !body.querySelector('.tn-shtop')) { undock(body); body.innerHTML = '<div class="tn-shtop"></div><div class="tn-shtail"></div>'; renderSheet.top = renderSheet.tail = null; }
    const T = body.querySelector('.tn-shtop'), L = body.querySelector('.tn-shtail');
    if (renderSheet.top !== top) { T.innerHTML = top; renderSheet.top = top; }
    const ae = document.activeElement, typing = ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && L.contains(ae);
    if (renderSheet.tail !== tail && (force || !typing)) { undock(L); L.innerHTML = tail; dock(L); renderSheet.tail = tail; }
    const pic = selected !== 'newpot' && selected !== 'newproj' && selected !== 'home' && selected !== 'pots' && selected !== 'projs' && !selected.startsWith('bill:');   // v106: the bill sheets keep it clean too
    sheet().classList.toggle('nopic', !pic);
    tnCrop(body);
  }
  async function onSheetClick(e) {
    const b = e.target.closest('button'); if (!b || !selected) return;
    const act = b.dataset.act, id = selected;
    // a bill's own buttons (Mark paid, Undo, Paid before I started, Due date, Done) run the Bills page's handler
    if (b.classList.contains('tn-bpay')) { await billClick(e); renderSheet(true); return; }
    if (b.closest('.tn-bill') && (b.dataset.paid || b.dataset.unslay || b.dataset.before || b.dataset.editDue || b.dataset.dueDone)) { await billClick(e); renderSheet(true); return; }
    if (b.dataset.bx) { if (BX_MODE === 'tap') { bxOpen = bxOpen === b.dataset.bx ? null : b.dataset.bx; renderSheet(true); } else openSheet('bill:' + b.dataset.bx); return; }
    if (b.dataset.potDel) { await deletePot(b.dataset.potDel); return; }
    if (act === 'ed-save') { saveEdit(id); return; }   // v269
    if (act === 'ed-cancel') { editFor = null; renderSheet(true); window.render(); return; }
    if (act === 'ed-conv') {   // v272: switches the form; nothing is saved until Save
      const box = b.closest('.tn-edit'), pj = box.classList.toggle('is-proj'), gi = box.querySelector('[data-ed="goal"]'), nt = box.querySelector('.tn-convnote');
      box.querySelector('.tn-goal').classList.toggle('hidden', !pj); box.querySelectorAll('.tn-pj').forEach(n => n.classList.toggle('hidden', !pj));
      b.textContent = pj ? 'Convert to pot' : 'Convert to project';
      const moved = (box.dataset.was === 'proj') !== pj; nt.hidden = !moved;
      nt.textContent = !moved ? '' : pj ? 'It becomes a project when you tap Save.' : 'It becomes a pot when you tap Save. It keeps its money.';
      if (pj && !gi.value) gi.focus({ preventScroll: true });
      return;
    }
    if (act === 'ed-del') { if (await deletePot(id, 'savings')) editFor = null; return; }
    if (act === 'spend') { openSpend(id); return; }
    if (b.dataset.spendUndo) { const t = state.transfers.find(x => x.id === b.dataset.spendUndo); if (t && await ask(`Take back spending ${moneyExact(t.amount)}${t.note ? ` on ${t.note}` : ''}? ${t.from === 'savings' ? 'Savings' : potName(t.from)} and your bank go back up by it.`)) { undoSpendFrom(t.id); toast('Spending taken back'); renderSheet(true); } return; }
    if (act === 'wstep') { wStep = wStep === 5 ? 1 : 5; renderSheet(true); return; }
    if (id === 'cushion') {   // v301: money a day in and out of the cushion is Savings'
      if (b.dataset.cdr) { const k = b.dataset.cdr; if (cDrain.has(k)) cDrain.delete(k); else cDrain.add(k); renderSheet(true); return; }
      if (act === 'cdr-all') { const L = drainable(), all = L.every(p => cDrain.has(p.id)); cDrain.clear(); if (!all) L.forEach(p => cDrain.add(p.id)); renderSheet(true); return; }
      if (act === 'cdr-go') {   // the exact cents in each, as transfers into Savings (the cushion is Savings' first month)
        const L = drainable().filter(p => cDrain.has(p.id)); if (!L.length) return;
        const date = today(); for (const p of L) state.transfers.push({ id: uid(), date, from: p.id, to: 'savings', amount: p.amt });
        const tot = c2(sum(L, p => p.amt)); cDrain.clear(); save(); window.render(); renderSheet(true);
        toast(`Moved ${moneyExact(tot)} into the cushion from ${L.length === 1 ? L[0].name : L.length + ' places'}`); return;
      }
      if (act === 'cplus' || act === 'cminus') { const k = act === 'cplus' ? 'take' : 'give'; cPick = cPick === k ? '' : k; renderSheet(true); return; }
      if (b.dataset.wfrom) { moveWorker(b.dataset.wfrom, 'savings', wStep); renderSheet(true); return; }
      if (b.dataset.wto) { moveWorker('savings', b.dataset.wto, wStep); renderSheet(true); return; }
      if (act === 'cmove') { const src = potBalances(month).find(p => p.id !== 'savings' && p.id !== 'spend' && p.id !== 'bills' && p.bal >= 1); closeSheet(); openMover(src ? src.id : 'spend', 'savings'); return; }
    }
    if (act === 'lock') { setLock(id, !isLocked(id)); renderSheet(true); return; }
    if (act === 'vplus') { vPick = !vPick; renderSheet(true); return; }
    if (b.dataset.pickFrom) { e.stopPropagation(); if (wStep === 5) moveWorker(b.dataset.pickFrom, b.dataset.pickTo, 5); else addVillager(b.dataset.pickTo, b.dataset.pickFrom); renderSheet(true); return; }   // v269: ×5 takes five; the card list's handler took a second one (v268)
    if (act === 'vminus') { if (wStep === 5) moveWorker(id, 'savings', 5); else removeVillager(id); renderSheet(true); return; }
    if (b.dataset.wfrom) { moveWorker(b.dataset.wfrom, id, wStep); return; }
    if (b.dataset.wto) { moveWorker(id, b.dataset.wto, wStep); return; }
    if (act === 'kind-pot' || act === 'kind-proj') { const nm = el('townAddName') ? el('townAddName').value : ''; selected = act === 'kind-pot' ? 'newpot' : 'newproj'; renderSheet(); if (el('townAddName')) el('townAddName').value = nm; return; }
    if (act === 'move') { closeSheet(); openMover(id, id === 'savings' ? (D.projects[0] || {}).id || 'spend' : 'savings'); return; }
    if (act === 'home') { openSheet('home'); return; }
    if (b.dataset.billRow) { openSheet('bill:' + b.dataset.billRow); return; }
    if (b.dataset.potRow) { openSheet(b.dataset.potRow); return; }
    if (act === 'addpot') { tap('newpot'); return; }
    if (act === 'addproj') { tap('newproj'); return; }
    if (act === 'billsdetail') { billsDetail = !billsDetail; renderSheet(true); return; }
    if (act === 'editbills') { closeSheet(); openBillEdit(); return; }
    if (act === 'findbills') { Recur.open('town'); return; }
    if (act === 'income') {
      if (ib.id === b.dataset.inc) closeIncome(); else openIncome(b.dataset.inc);
      renderSheet(true);
      setTimeout(() => { const box = el('incomeBox'); if (box && !box.classList.contains('hidden')) box.scrollIntoView({ block: 'nearest', behavior: lessMotion() ? 'auto' : 'smooth' }); }, 60);
      return;
    }
    if (act === 'add-pot' || act === 'add-proj') {
      const name = (el('townAddName').value || '').trim();
      const ok = act === 'add-pot' ? addPot(name) : addProject(name, Number(el('townAddGoal').value) || 0, el('townAddUnit').value === 'months');
      if (ok) closeSheet();
    }
  }
  function onSheetChange(e) {
    const t = e.target; if (!selected) return;
    if (t.closest('.tn-bill') && (t.dataset.dueKind || t.dataset.dueDay || t.dataset.dueNth || t.dataset.dueWd)) { billChange(e); renderSheet(true); return; }
    if (t.dataset.ed) return;
    if (t.dataset.goal || t.dataset.goalUnit) { goalChange(t); return; }
    if (t.dataset.rename) { renamePot(t.dataset.rename, t.value); return; }
    if (t.dataset.cover) { setCover(t.dataset.cover, t.checked); return; }
  }

  /* ---- render, tick ---- */
  let wired = false, lastData = 0, lastTick = 0;
  function wire() {
    if (wired) return; wired = true;
    el('townAddLot').addEventListener('click', () => tap('newpot'));
    el('townHud').addEventListener('click', () => { const m = el('townMoney'), open = m.classList.toggle('hidden'); el('townHud').setAttribute('aria-expanded', String(!open)); });
    el('townScrim').addEventListener('click', closeSheet);
    el('townShClose').addEventListener('click', closeSheet);
    DOCKABLE.forEach(id => { const n = el(id); if (n) shelf().appendChild(n); });
    hook(shBody());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && selected && ['moveBox', 'splitBox', 'askBox'].every(k => !el(k) || el(k).classList.contains('hidden')) && !payKey) closeSheet(); });
  }
  function hook(b) {
    b.addEventListener('click', onSheetClick);
    b.addEventListener('change', onSheetChange);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'townAddName' || e.target.id === 'townAddGoal')) { const x = b.querySelector('[data-act^="add-"]'); if (x) x.click(); } });
  }
  // Called from the app's render(): read the numbers and refresh any open sheet.
  function render() {
    if (!el('view-town') || typeof state === 'undefined') return;
    wire();
    D = readData(); lastData = Date.now();
    if (selected && !sheetOk(selected)) closeSheet();
    if (selected) renderSheet();
  }
  // While a sheet is open: its numbers once a second and its live bar.
  function tick() {
    const v = el('view-town'); if (!v || (v.classList.contains('hidden') && !selected) || document.hidden || !D) return;
    const now = Date.now(); if (now - lastTick < 80) return; lastTick = now;
    if (now - lastData > 1000) { D = readData(now); lastData = now; }
    if (selected && now - (tick.crop || 0) > 900) { tick.crop = now; tnCrop(shBody()); }   // the live bar, once a second
  }
  setInterval(tick, 100);   // v311: was a frame loop
  return { render, shown: render, close: closeSheet, open: tap, openInline, closeInline, edit, get editing() { return editFor; }, get inline() { return inline; }, get selected() { return selected; },
    get lots() { return D ? lotIds().map(id => ({ id })) : []; }, get data() { return D; }, billBar };
})();
