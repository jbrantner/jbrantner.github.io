'use strict';
function renderParty() {
  const n = partySize(), wk = weekStart(), sat = new Date(wk.getTime() + 6.5 * DAY_MS), nextSun = new Date(wk.getTime() + 7.5 * DAY_MS);   // v144: sat is Sunday, nextSun Monday
  const dstr = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  $('partyWeek').textContent = n ? `Runs until ${dstr(sat)}` : 'Not running';
  const pu = purseNow();
  $('partySize').innerHTML = n ? `This week's spending is running: <strong>${money(pu.P)}</strong> for ${state.purse && state.purse.late ? 'the rest of ' : ''}the week (${money((n) * WORKER_DAY)} a day). It can't change until Monday.` + (pu.carried >= 1 ? `<div class="money-note bad">${money(pu.carried)} less than usual: last week ran over, and the gap carries until you send postage</div>` : '')
    : (() => { const k = Math.min(Number(state.partyPlan || 0), partyRoom()), d = sendNowDays();
        return k ? `This week's spending isn't running yet.<button class="primary" id="partyNow" style="width:100%; margin-top:8px">Start now with ${money(c2(k * d * WORKER_DAY * wkR()))} for the days left</button><div class="money-note">That's ${money(k * WORKER_DAY)} a day for the ${d === 1 ? 'one day' : d + ' days'} left this week, today included. From Monday it's a full week.</div>`
          : Number(state.partyPlan || 0) > 0 ? `This week's spending isn't running. This pay period has no room for more yet.` : `Set your weekly spending with + to start. Each step is $7 a week, and it starts on its own as soon as there's room.`; })();
  const plan = Math.min(Number(state.partyPlan || 0), planCap());
  const wa = plan === Number(state.partyPlan || 0) ? weeklyAmt() : plan * 7 * WORKER_DAY;   // v311: the typed weekly amount, as Home shows it
  $('partyPlan').innerHTML = `Weekly spending: <strong>${money(wa)}</strong> (${moneyExact(wa / 7)} a day)<div class="muted" style="font-size:12px">next week starts ${dstr(nextSun)}</div>`;
  $('partyMinus').disabled = plan < 1;
  $('partyPlus').disabled = plan >= planCap();
  const potN = id => (potBalances(month).find(p => p.id === id) || { name: 'storage' }).name;
  const bn = state.bonusNews && !state.bonusNews.seen ? state.bonusNews : null, news = newsNow(), pn = state.payNews && !state.payNews.seen && payNewsText(state.payNews);   // v267: the same news as Home
  $('partyHome').classList.toggle('hidden', !news.length && !bn && !pn);
  $('partyHome').innerHTML = news.map(it => `<div>${it.html} ${it.acts}</div>`).join('')
    + (pn ? `<div>${esc(pn)} <button class="link" id="payNewsOk">OK</button></div>` : '')
    + (bn ? `<div>A bonus paycheck landed ${shortDate(bn.date)}: <strong>${money(bn.amount)}</strong> extra this month, now in ${esc(potName(bn.to))}. <button class="link" id="bonusOk">Nice</button></div>` : '');
  const need = Math.ceil(postageNeed(pu) - 1e-9), over = pu.purseLeft < 0;
  $('runnerBtn').classList.toggle('hidden', month !== today().slice(0, 7));
  $('runnerBtn').innerHTML = need > 0 ? `${over ? 'Overdrawn' : 'Short'} ${money(need)} · Cover it` : `${money(Math.max(0, pu.purseLeft))} left this week <small class="muted" style="font-weight:500">· add money</small>`;
  $('runnerBtn').classList.toggle('over', need > 0);
  $('runnerBtn').classList.toggle('primary', need > 0);
  const bals = potBalances(month);
  $('postFrom').innerHTML = [...farmPots(), 'scavenger'].map(id => { const p = bals.find(x => x.id === id); return p ? `<option value="${id}">${esc(p.name)} (${money(p.bal)})</option>` : ''; }).join('');
  if (need > 0 && !$('postAmt').value) $('postAmt').placeholder = String(need);
  // This week's spending. Once there are types, each spend has a tag: tap it to sort the spend into one.
  const sp = weekSpends(), types = state.packs || [], typeName = id => id ? (types.find(p => p.id === id) || { name: 'Anything' }).name : 'Anything';
  const auto = new Set(['Anything', ...types.map(p => p.name)]);   // labels the keypad wrote, not a bank's description
  if (sortOpen && !sp.some(t => t.id === sortOpen)) sortOpen = null;
  const typeLine = types.length ? packsNow().map(p => `${esc(p.name)} ` + (!p.any && p.amt < 0.5 ? `${money(p.used)} spent` : p.left < -0.005 ? `${money(Math.ceil(-p.left - 1e-9))} over` : `${money(p.left)} left`)).join(' · ') : '';
  const row = t => {
    const st = stopOf(t), day = new Date(t.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' }), open = sortOpen === t.id;
    const what = !types.length ? `${st.icon} <span class="stop">${day} · ${st.name}</span> · ${esc(t.description || 'Something')}`
      : `${st.icon} <span class="stop">${day}</span>` + (auto.has(t.description) ? '' : ` · ${esc(t.description || 'Something')}`);
    const tag = types.length ? `<button class="chip tx-type${t.unsorted ? ' unsorted' : ''}" data-tx-type="${t.id}" aria-expanded="${open}">${t.unsorted ? 'To sort' : esc(typeName(t.pack || ''))}</button>` : '';
    return `<div class="row spread"><span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${what}</span><span class="row" style="gap:10px; flex:none">${tag}<span class="num">−${money(charged(t))}</span><button class="link bad" data-undo-tx="${t.id}" aria-label="Take back ${esc(t.description || 'this')}" style="font-size:12px">Undo</button></span></div>`
      + (open ? `<div class="chips tx-types" role="group" aria-label="Sort into">${[{ id: '', name: 'Anything' }, ...types].map(p => `<button class="chip${!t.unsorted && (t.pack || '') === p.id ? ' on' : ''}" data-tx-set="${t.id}" data-to="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : '');
  };
  $('trailLog').innerHTML = `<div class="row spread"><span class="muted" style="font-size:12px">This week's spending</span><button class="link" data-types style="font-size:12px; padding:8px 0; margin:-6px 0">${types.length ? 'Edit types' : 'Add types'}</button></div>`
    + (typeLine ? `<div class="types-left">${typeLine}</div>` : '')
    + (sp.length ? sp.slice().reverse().map(row).join('') : '<div class="muted">Nothing spent yet this week.</div>');
  $('treasureTo').innerHTML = farmPots().map(id => `<option value="${id}"${id === treasurePot() ? ' selected' : ''}>${esc(potN(id))}</option>`).join('');
}

/* ---------- the camp screen: where the party is now, and the stops where money gets spent ---------- */
function tickRoad() {
  const n = partySize();
  const pu = purseNow(), left = pu.purseLeft, over = Math.ceil(-left), short = Math.ceil(pu.carried - 1e-9);
  const tl = todayLeft(pu), day = tl >= 0 ? `${money(tl)} today` : `${money(Math.ceil(-tl - 1e-9))} over today`;
  const k0 = Math.min(Number(state.partyPlan || 0), partyRoom());
  const txt = !n && over <= 0 ? (k0 ? `Start now with ${money(c2(k0 * sendNowDays() * WORKER_DAY * wkR()))} for the days left` : 'Set your weekly spending with + to start') : over > 0 ? `Overdrawn ${money(over)} · Cover it` : `${money(left)} left this week · ${day}` + (short > 0 ? ` · ${money(short)} short` : '');
  if ($('scenePurse').textContent !== txt) $('scenePurse').textContent = txt;
  $('scenePurse').classList.toggle('over', over > 0);
  $('scenePurse').classList.toggle('setout', !n && over <= 0);
}
$('partyMinus').onclick = () => planStep(-1);
$('partyPlus').onclick = () => planStep(1);
$('treasureTo').onchange = e => { state.treasureTo = e.target.value; save(); render(); };
$('trailLog').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.types != null) {
    packEditing = !packEditing; renderPacks();
    if (packEditing) { $('packEditBox').scrollIntoView({ block: 'center' }); if (!(state.packs || []).length) $('packNewName').focus({ preventScroll: true }); }
    return;
  }
  if (b.dataset.txType) { sortOpen = sortOpen === b.dataset.txType ? null : b.dataset.txType; renderParty(); return; }
  if (b.dataset.txSet) { sortTx(b.dataset.txSet, b.dataset.to); return; }
  const id = b.dataset.undoTx; if (!id) return;
  const t = state.transactions.find(x => x.id === id); if (!t) return;
  if (await ask(`Take back ${money(charged(t))} on ${t.description || 'this'}? It goes back into this week's money.`)) undoSpend(id);
});
$('partyHome').addEventListener('click', e => {
  if (e.target.dataset.news) { newsAct(e.target.dataset.news); return; }   // v267
  if (e.target.id === 'partyHomeOk' && state.lastTrip) state.lastTrip.seen = true;
  else if (e.target.id === 'bonusOk' && state.bonusNews) state.bonusNews.seen = true;
  else if (e.target.id === 'payNewsOk' && state.payNews) state.payNews.seen = true;
  else if (e.target.dataset.builtOk && state.built && state.built[e.target.dataset.builtOk]) state.built[e.target.dataset.builtOk].seen = true;
  else if (e.target.id === 'backupNow') { exportBackup(); return; }
  else if (e.target.id === 'backupLater') state.backupSnooze = Date.now() - 7 * DAY_MS;   // ask again in a week
  else return;
  save(); render();
});
$('runnerBtn').onclick = () => { if (postageNeed() >= 0.01) { $('postBox').classList.add('hidden'); autoPostage(); return; } $('postBox').classList.toggle('hidden'); if (!$('postBox').classList.contains('hidden')) $('postAmt').focus(); };
// Postage: money sent to the party mid-week. It has to come out of a pot, and it adds to this week's purse.
$('postGo').onclick = () => {
  const from = $('postFrom').value, amt = Math.ceil(Number($('postAmt').value || $('postAmt').placeholder) || 0);
  const p = potBalances(month).find(x => x.id === from);
  if (!p || amt <= 0) { toast('Pick a pot and an amount'); return; }
  if (amt > p.bal + 0.005) { toast(`${p.name} only has ${money(p.bal)}`); return; }
  state.transfers.push({ id: uid(), from, to: 'spend', amount: amt, date: today(), postage: true });
  if (!state.purse || state.purse.wk !== ymd(weekStart())) state.purse = { wk: ymd(weekStart()), P: 0, extra: 0 };
  state.purse.extra = Number(state.purse.extra || 0) + amt;
  $('postAmt').value = ''; $('postBox').classList.add('hidden');
  save(); render(); toast(`Sent ${money(amt)} from ${p.name} to the party`);
};
