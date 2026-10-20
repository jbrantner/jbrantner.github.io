'use strict';
/* ---------- split across pots ---------- */
// Whole-dollar even shares: $10 over 3 pots is 4 + 3 + 3.
const evenShares = (total, n) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
let split = { from: [], to: [] };
function openSplit(combo) {
  const ok = id => id !== 'spend' && id !== 'bills';
  split = combo ? { from: combo.from.filter(ok), to: combo.to.filter(ok) } : { from: [state.duel.a].filter(ok), to: [] };
  $('spAmt').value = ''; $('spSave').checked = false; $('splitBox').classList.remove('hidden'); renderSplit();
}
function splitPlan() {
  const pots = potBalances(month), total = Math.floor(Math.max(0, Number($('spAmt').value) || 0));
  const from = split.from.map(id => pots.find(p => p.id === id)).filter(Boolean), to = split.to.map(id => pots.find(p => p.id === id)).filter(Boolean);
  const give = evenShares(total, from.length || 1), get = evenShares(total, to.length || 1);
  return { pots, total, from, to, give, get, short: from.filter((p, i) => give[i] > Math.floor(p.bal)) };
}
function renderSplit() {
  const pots = potBalances(month).filter(p => p.id !== 'spend' && p.id !== 'bills');
  const chip = (p, list, kind) => `<button class="chip${list.includes(p.id) ? ' on' : ''}" data-${kind}="${p.id}">${esc(p.name)}</button>`;
  $('spFrom').innerHTML = pots.filter(p => !split.to.includes(p.id)).map(p => chip(p, split.from, 'spf')).join('');
  $('spTo').innerHTML = pots.filter(p => !split.from.includes(p.id)).map(p => chip(p, split.to, 'spt')).join('');
  const name = id => (pots.find(p => p.id === id) || { name: '?' }).name;
  $('spCombos').innerHTML = state.combos.map(c => `<button class="chip combo" data-combo="${c.id}">${esc(c.from.map(name).join(' + '))} → ${esc(c.to.map(name).join(' + '))}</button>`).join('');
  const { total, from, to, give, get, short } = splitPlan();
  $('spPreview').innerHTML = !from.length || !to.length ? '<span class="muted">Pick at least one pot on each side.</span>' : [
    ...from.map((p, i) => `<div class="row spread"><span>${esc(p.name)}</span><span class="num">${money(p.bal)} → <strong class="${give[i] > Math.floor(p.bal) ? 'bad' : ''}">${money(p.bal - give[i])}</strong></span></div>`),
    ...to.map((p, i) => `<div class="row spread"><span>${esc(p.name)}</span><span class="num">${money(p.bal)} → <strong>${money(p.bal + get[i])}</strong></span></div>`),
    short.length ? `<div class="warn">${esc(short.map(p => p.name).join(' and '))} doesn't have enough for an even share.</div>` : '',
  ].join('');
  $('spGo').disabled = !total || !from.length || !to.length || short.length > 0;
}
function doSplit() {
  const { from, to, give, get } = splitPlan();
  // Pair givers with receivers in order so every transfer is whole dollars.
  const date = month === today().slice(0, 7) ? today() : month + '-01';
  const g = [...give], r = [...get];
  let i = 0, j = 0;
  while (i < from.length && j < to.length) {
    const a = Math.min(g[i], r[j]);
    if (a > 0) state.transfers.push({ id: uid(), date, ...(date === today() ? { at: Date.now() } : {}), from: from[i].id, to: to[j].id, amount: a });
    g[i] -= a; r[j] -= a; if (!g[i]) i++; if (!r[j]) j++;
  }
  if ($('spSave').checked && !state.combos.some(c => c.from.join() === split.from.join() && c.to.join() === split.to.join()))
    state.combos.push({ id: uid(), from: [...split.from], to: [...split.to] });
  duelMoveId = null; save(); $('splitBox').classList.add('hidden'); render(); toast('Split done');
}
$('openSplitBtn').onclick = () => openSplit();
$('spCancel').onclick = () => $('splitBox').classList.add('hidden');
$('spGo').onclick = doSplit;
$('spAmt').oninput = renderSplit;
holdRepeat($('spMinus'), () => { $('spAmt').value = Math.max(0, (Math.floor(Number($('spAmt').value) || 0)) - 5); renderSplit(); });
holdRepeat($('spPlus'), () => { $('spAmt').value = (Math.floor(Number($('spAmt').value) || 0)) + 5; renderSplit(); });
$('splitBox').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const toggle = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  if (t.dataset.spf) split.from = toggle(split.from, t.dataset.spf);
  else if (t.dataset.spt) split.to = toggle(split.to, t.dataset.spt);
  else if (t.dataset.combo) { const c = state.combos.find(c => c.id === t.dataset.combo); split = { from: [...c.from], to: [...c.to] }; }
  else return;
  renderSplit();
});
