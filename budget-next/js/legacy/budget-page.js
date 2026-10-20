'use strict';
let hero = null, pendingPreset = null, editingPresets = false;
function renderPresets() {
  $('presetRow').innerHTML = state.presets.map(x => `<button class="chip preset${pendingPreset === x.id ? ' on' : ''}" data-preset="${x.id}">${esc(x.name)} ${money(Math.ceil(cents(x.amount)))}${editingPresets ? `<span class="x" data-preset-del="${x.id}" aria-label="Delete ${esc(x.name)}">✕</span>` : ''}</button>`).join('')
    + (state.presets.length || editingPresets ? '' : '<span class="muted" style="font-size:13px">Tap Edit to add things you buy often.</span>');
  const pre = state.presets.find(x => x.id === pendingPreset);
  $('presetConfirm').classList.toggle('hidden', !pre);
  if (pre) $('presetGo').textContent = `Spend ${money(Math.ceil(cents(pre.amount)))} on ${pre.name}`;
  $('presetAdd').classList.toggle('hidden', !editingPresets);
  $('presetEdit').textContent = editingPresets ? 'Done' : 'Edit';
  tickHero();
}
// Live parts of the Fun number: what the workers have earned and not spent yet, and today's share.
function tickHero(now = Date.now()) {
  if (!hero) return;
  const { base, free, Fc } = hero, F = gatherF(month, now), sp = speedNow(now), perMs = free / (monthEndMs(month) - gatherStart(month)) * sp;
  const ready = base, loot = Math.max(0, sum(state.incomes, i => farmReady(i, now)));
  const whole = sum(state.incomes, i => farmWhole(i, now));
  $('lootBtn').innerHTML = `<span class="chest"></span><span><strong>${money(whole)}</strong> waiting on your farms</span><span class="go">Collect</span>`;
  $('lootBtn').disabled = whole < 1; $('lootBtn').classList.toggle('full', whole >= 1); $('lootBtn').classList.toggle('hidden', AUTO_COLLECT);
  $('leftTotal').textContent = money(ready);
  $('leftTotal').className = 'big num ' + (ready < 0 ? 'bad' : '');
  const boostEnd = Math.max(0, ...state.habitLog.map(h => h.t + BOOST_MS)), bm = Math.ceil((boostEnd - now) / 60000);
  const pu = purseNow(now), diff = pu.pace - pu.spent;
  $('heroSub').textContent = (pu.carried > 0.005 ? carriedLine(pu, ` · ${money(pu.spent)} spent`) : `${money(pu.spent)} of ${money(pu.P)} spent · ${money(Math.abs(diff))} ${diff >= 0 ? 'under' : 'over'} pace`) + (sp > 1 ? ` · ${sp}× for ${bm >= 60 ? Math.floor(bm / 60) + 'h ' : ''}${bm % 60}m` : '');
  // a day: the purse spread over the week, and what's left spread over the days still to go (today included)
  const daysLeft = Math.max(1, 7 - Math.floor(pu.frac * 7)), perLeft = Math.max(0, pu.purseLeft) / daysLeft;
  $('heroSide').innerHTML = `<div>A day</div><div class="num" style="font-size:18px; font-weight:700; color:var(--text)">${money(pu.P / 7)}</div><div>${money(perLeft)} a day left</div>`;
  // the bar is how much of what's been earned this month is still unspent; a chosen quick item shows as a striped chunk
  const pre = state.presets.find(x => x.id === pendingPreset), take = pre ? Math.ceil(cents(pre.amount)) : 0;
  const fill = $('totalBar').firstElementChild, readyPct = Math.max(0, ready) / Math.max(1, pu.P) * 100;
  fill.style.width = Math.min(100, readyPct).toFixed(3) + '%';
  fill.innerHTML = take ? `<i class="preview" style="width:${Math.min(100, take / Math.max(ready, take) * 100)}%"></i>` : '';
  $('totalBar').className = 'bar';
  if (pre) { $('leftTotal').textContent = money(ready - take); $('leftTotal').className = 'big num ' + (ready - take < 0 ? 'bad' : ''); $('heroLabel').textContent = `After ${pre.name}`; }
  else $('heroLabel').textContent = ready < 0 ? 'Overdrawn this week' : 'Left to spend this week';
  // the paycheck coming in: the bar fills toward the next whole dollar
  const pn = payNow(now);
  $('collectBar').style.width = (pn.frac * 100).toFixed(2) + '%';
  if ($('collectEta').innerHTML !== pn.text) $('collectEta').innerHTML = pn.text;
}
function renderBudget() {
  const { spentBy, income, bills, spends, billTotal, spendTotal, isPaid, billsDue, free, potSpent, left } = monthNumbers(month);
  renderHabits(); renderParty(); renderPacks();
  $('monthLeft').textContent = money(left);
  $('monthLeft').className = 'num ' + (left < 0 ? 'bad' : '');

  const [yy, mm] = month.split('-').map(Number), dim = new Date(yy, mm, 0).getDate(), now = today();
  const isNow = month === now.slice(0, 7);
  if (isNow) {
    hero = { base: month === today().slice(0, 7) ? purseNow().purseLeft : left, free: Math.max(0, free), Fc: monthNumbers(month).Fc };
    $('collectRow').classList.remove('hidden'); $('presetBox').classList.remove('hidden'); $('lootBtn').classList.remove('hidden');
    renderPresets();
  } else {
    hero = null; $('collectRow').classList.add('hidden'); $('presetBox').classList.add('hidden'); $('lootBtn').classList.add('hidden');
    $('heroLabel').textContent = month > now ? 'Purse planned' : 'Purse left';
    const shown = month > now ? free : left;
    $('leftTotal').textContent = money(shown);
    $('leftTotal').className = 'big num ' + (shown < 0 ? 'bad' : '');
    $('heroSub').textContent = `of ${money(free)}`;
    $('heroSide').innerHTML = month > now ? `<div>About</div><div class="num" style="font-size:18px; font-weight:700; color:var(--text)">${money(Math.max(0, free) / dim * 7)}</div><div>a week</div>` : '';
    setBar($('totalBar'), potSpent, free);
  }
  $('billsDue').textContent = money(billsDue);
  const days = paydaysIn(month);
  // Only what's been collected so far, never the month's full pay (Jordan doesn't want to feel richer than they are).
  const Fc = collectedFrac(month);
  $('planIncomeLabel').textContent = 'Collected so far';
  $('planIncome').textContent = money(sum(state.incomes, i => payIn(i, month)));
  $('planPaydays').textContent = days.length ? 'Paydays: ' + days.map(d => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })).join(', ') + (days.length > 2 ? ' · a 3-paycheck month' : '') : '';
  $('planBills').textContent = money(-billTotal * Fc);
  $('planSpend').textContent = money(-spendTotal * Fc);
  $('planSpendRow').classList.toggle('hidden', !spends.length);
  $('planFree').textContent = money(free * Fc);
  $('planFree').className = 'num ' + (free < 0 ? 'bad' : '');
  $('incomeGot').textContent = '';
  $('catCard').classList.toggle('hidden', !spends.length);

  renderMonsters();

  const rows = spends.map(c => catRow(c.name, Number(c.budget || 0), spentBy[c.id] || 0, c.account));
  $('catList').innerHTML = rows.join('');
  $('catList').querySelectorAll('.bar').forEach(b => setBar(b, +b.dataset.spent, +b.dataset.budget));

  $('catEditRows').innerHTML = state.categories.map(c => `
    <div class="editrow">
      <input data-f="name" data-id="${c.id}" value="${esc(c.name)}" aria-label="Name">
      <input data-f="budget" data-id="${c.id}" type="number" inputmode="decimal" min="0" value="${c.budget}" aria-label="Amount">
      <select data-f="kind" data-id="${c.id}" aria-label="Type"><option value="bill"${c.kind === 'bill' ? ' selected' : ''}>Bill</option><option value="spend"${c.kind !== 'bill' ? ' selected' : ''}>Set aside</option></select>
      <input data-f="dueDay" data-id="${c.id}" type="number" inputmode="numeric" min="1" max="31" value="${c.dueDay || ''}" placeholder="Due day" aria-label="Due day">
      <select data-f="account" data-id="${c.id}" aria-label="Account">${acctOptions(c.account)}</select>
      <button class="link danger" data-cat-del="${c.id}">Delete</button>
    </div>`).join('');
}
function catRow(name, budget, spent, account) {
  const left = budget - spent;
  const cls = left < 0 ? 'bad' : (budget && left < budget * 0.15 ? 'warn' : 'ok');
  return `<div class="cat">
    <div class="row spread"><strong class="grow">${esc(name)}${account ? ` <span class="pill">${esc(account)}</span>` : ''}</strong><span class="num ${cls}">${money(left)} left</span></div>
    <div class="muted num">${budget ? `${money(spent)} of ${money(budget)}` : `${money(spent)} spent · no budget set yet`}</div>
    <div class="bar" data-spent="${spent}" data-budget="${budget}"><span></span></div></div>`;
}
// Bars start full and drain as money is spent.
function setBar(el, spent, budget) {
  const pct = budget > 0 ? Math.max(0, Math.min(100, (1 - spent / budget) * 100)) : 0;
  el.firstElementChild.style.width = pct + '%';
  el.classList.toggle('over', spent > budget);
}
