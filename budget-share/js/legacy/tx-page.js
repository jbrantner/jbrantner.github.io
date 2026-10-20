'use strict';
function renderTx() {
  if ($('view-tx').classList.contains('hidden')) return;   // v311: drawn when it's shown (showView('tx') renders)
  const q = $('txSearch').value.trim().toLowerCase();
  const tx = monthTx().filter(t => !q || t.description.toLowerCase().includes(q) || catName(t.categoryId).toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('txCount').textContent = tx.length + ' transaction' + (tx.length === 1 ? '' : 's');
  $('txList').innerHTML = tx.map(t => `
    <div class="tx">
      <div class="row spread"><span class="grow">${esc(t.description || '(no description)')}</span>
        <span style="text-align:right"><strong class="num ${t.amount > 0 ? 'ok' : ''}">${t.amount > 0 ? '+' + money(t.categoryId ? -charged(t) : t.amount) : money(-charged(t))}</strong>
        ${scavCut(t) ? `<div class="muted num" style="font-size:12px">${moneyExact(-Math.abs(t.amount))} · ${Math.round(scavCut(t) * 100)}¢ to spare change</div>` : ''}</span></div>
      <div class="row spread" style="margin-top:4px">
        <span class="muted">${new Date(t.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${t.account ? `<span class="pill">${esc(t.account)}</span>` : ''} ${t.source !== 'manual' ? `<span class="pill">${esc(t.source)}</span>` : ''}</span>
        <span class="row"><select data-tx-cat="${t.id}">${catOptions(t.categoryId)}</select>
        <button class="link danger" data-tx-del="${t.id}" aria-label="Delete">✕</button></span>
      </div>
    </div>`).join('') || '<p class="muted">Nothing here yet. Add one above or import a CSV.</p>';
}

function renderRules() {
  $('ruleList').innerHTML = state.rules.map(r => `
    <div class="row spread" style="padding:4px 0"><span>“${esc(r.match)}” → ${esc(catName(r.categoryId))}</span>
    <button class="link danger" data-rule-del="${r.id}" aria-label="Delete">✕</button></div>`).join('') ||
    '<p class="muted" style="margin:0">No rules yet.</p>';
}

$('txDate').value = $('txDate').dataset.day = today();   // v311: render() moves it to the new day until you pick another
$('addTxBtn').onclick = () => {
  const amt = Math.abs(Number($('txAmt').value));
  if (!amt) { toast('Enter an amount'); return; }
  addTransactions([{ date: $('txDate').value || today(), amount: $('txType').value === 'in' ? amt : -amt,
    description: $('txDesc').value.trim(), categoryId: $('txCat').value || null }], 'manual', $('txAcct').value);
  $('txAmt').value = ''; $('txDesc').value = '';
  render(); toast('Added');
};
$('txSearch').oninput = renderTx;
$('presetRow').addEventListener('click', e => {
  const del = e.target.closest('[data-preset-del]');
  if (del) { state.presets = state.presets.filter(x => x.id !== del.dataset.presetDel); if (pendingPreset === del.dataset.presetDel) pendingPreset = null; save(); renderPresets(); return; }
  const b = e.target.closest('[data-preset]'); if (!b || editingPresets) return;
  pendingPreset = pendingPreset === b.dataset.preset ? null : b.dataset.preset; renderPresets();
});
$('presetCancel').onclick = () => { pendingPreset = null; renderPresets(); };
$('presetGo').onclick = () => {
  const pre = state.presets.find(x => x.id === pendingPreset); if (!pre) return;
  addTransactions([{ date: today(), amount: -Math.abs(Number(pre.amount)), description: pre.name, categoryId: null }], 'manual', state.accounts[1] || state.accounts[0]);
  pendingPreset = null; render(); toast(`${pre.name} spent`);
};
$('presetEdit').onclick = () => { editingPresets = !editingPresets; pendingPreset = null; renderPresets(); };
$('presetSave').onclick = () => {
  const name = $('presetName').value.trim(), amount = Math.abs(Number($('presetAmt').value));
  if (!name || !amount) { toast('Give it a name and an amount'); return; }
  state.presets.push({ id: uid(), name, amount }); $('presetName').value = ''; $('presetAmt').value = '';
  save(); renderPresets();
};
$('txList').addEventListener('change', e => {
  const id = e.target.dataset.txCat; if (!id) return;
  const t = state.transactions.find(t => t.id === id); if (!t) return; fileTx(t, e.target.value || null);   // v311: a bill payment replaces its month's "marked paid"
  // Learn a rule from imported transactions so the next import sorts itself.
  if (t.source !== 'manual' && t.categoryId && t.description) {
    const key = merchantKey(t.description);
    if (key && !state.rules.some(r => r.match.toLowerCase() === key.toLowerCase())) {
      state.rules.push({ id: uid(), match: key, categoryId: t.categoryId });
      const n = ruleSort(key, t.categoryId);
      toast(`Rule added for “${key}”` + (n ? `, sorted ${n} more` : ''));
    }
  }
  save(); render();
});
$('txList').addEventListener('click', e => {
  const id = e.target.dataset.txDel; if (!id) return;
  state.transactions = state.transactions.filter(t => t.id !== id); save(); render();
});
