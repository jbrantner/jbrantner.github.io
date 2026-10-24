'use strict';
/* ---------- pots & moving money ---------- */
function openMover(from, to) {
  const pots = potBalances(month);
  const opts = (sel, L = pots) => L.map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)} (${p.exact ? moneyExact(p.bal) : money(p.bal)})</option>`).join('');
  $('mvFrom').innerHTML = opts(from && from !== 'bills' && from !== 'spend' ? from : 'savings', pots.filter(p => p.id !== 'bills' && p.id !== 'spend')); $('mvTo').innerHTML = opts(to || 'savings');   // v302 (Jordan): bill money is held, it isn't moved
  if ($('mvFrom').value === $('mvTo').value) $('mvTo').value = pots.find(p => p.id !== $('mvFrom').value).id;
  $('mvAmt').value = ''; $('moveBox').classList.remove('hidden');
  updateMover(true);
}
// Keeps the slider's range and the before/after numbers in step with the chosen pots.
function updateMover(resetSlider) {
  const pots = potBalances(month), f = pots.find(p => p.id === $('mvFrom').value), t = pots.find(p => p.id === $('mvTo').value);
  const max = Math.max(0, Math.floor(f.bal));
  $('mvSlider').max = max; $('mvMax').textContent = money(max);
  if (resetSlider) $('mvSlider').value = Math.min(Number($('mvAmt').value) || 0, max);
  const amt = Math.floor(Math.max(0, Number($('mvAmt').value) || 0));
  const same = f.id === t.id;
  $('mvPreview').innerHTML = same ? '<span class="warn">Pick two different pots</span>' : `
    <div class="row spread"><span>${esc(f.name)}</span><span class="num">${(f.exact ? moneyExact : money)(f.bal)} → <strong class="${f.bal - amt < 0 ? 'bad' : ''}">${(f.exact ? moneyExact : money)(f.bal - amt)}</strong></span></div>
    <div class="row spread"><span>${esc(t.name)}</span><span class="num">${(t.exact ? moneyExact : money)(t.bal)} → <strong>${(t.exact ? moneyExact : money)(t.bal + amt)}</strong></span></div>
    ${f.id === 'bills' && f.bal - amt < monthNumbers(month).billsDue - 0.005 ? '<div class="warn">That leaves less than you still owe on bills this month.</div>' : ''}`;
  $('mvGo').disabled = same || !amt || amt > max;
}
function closeMover() { $('moveBox').classList.add('hidden'); }
function doMove() {
  const amt = Math.floor(Math.max(0, Number($('mvAmt').value) || 0)), from = $('mvFrom').value, to = $('mvTo').value;
  if (!amt || from === to || from === 'bills' || from === 'spend') return;
  const src = potBalances(month).find(p => p.id === from); if (!src || amt > Math.floor(src.bal + 1e-9)) return;
  const date = month === today().slice(0, 7) ? today() : month + '-01';
  if (to === 'spend') {   // into this week's money, like Cover it
    state.transfers.push({ id: uid(), date: today(), at: Date.now(), from, to, amount: amt, postage: true });
    if (!state.purse || state.purse.wk !== ymd(weekStart())) state.purse = { wk: ymd(weekStart()), P: 0, extra: 0 };
    state.purse.extra = Number(state.purse.extra || 0) + amt;
  } else state.transfers.push({ id: uid(), date, ...(date === today() ? { at: Date.now() } : {}), from, to, amount: amt });
  save(); closeMover(); render(); toast(`Moved ${money(amt)} to ${potName(to)}`);
}

/* ---------- settings & backup ---------- */
$('scavCollectBtn').onclick = () => collectChange();
$('mvFrom').onchange = $('mvTo').onchange = () => updateMover(true);
$('mvSlider').oninput = () => { $('mvAmt').value = $('mvSlider').value; updateMover(false); };
$('mvAmt').oninput = () => { $('mvSlider').value = Math.min(Number($('mvAmt').value) || 0, Number($('mvSlider').max)); updateMover(false); };
// − / + nudge by $1, and keep going while held down.
function nudge(d) {
  const max = Number($('mvSlider').max), v = Math.min(max, Math.max(0, Math.floor(Number($('mvAmt').value) || 0) + d));
  $('mvAmt').value = v; $('mvSlider').value = v; updateMover(false);
}
holdRepeat($('mvMinus'), () => nudge(-1));
holdRepeat($('mvPlus'), () => nudge(1));
$('mvCancel').onclick = closeMover;
$('mvGo').onclick = doMove;
