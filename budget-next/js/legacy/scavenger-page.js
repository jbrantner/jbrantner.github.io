'use strict';
function renderScavenger() {
  if ($('view-scavenger').classList.contains('hidden')) return;   // v311: never shown
  const bal = potBalances(month).find(p => p.id === 'scavenger').bal;
  $('scavTotal').textContent = moneyExact(bal);
  $('scavLine').textContent = bal >= 0.005 ? `${moneyExact(bal)} ready to collect, split evenly across the places that get money each day` : 'Nothing to collect yet';
  $('scavCollectBtn').disabled = !(bal >= 0.005);
  const finds = state.transactions.filter(t => scavCut(t) && t.date <= monthEnd(month)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  $('scavFinds').innerHTML = finds.map(t => `<div class="row spread" style="padding:3px 0"><span class="grow muted">${shortDate(t.date)} · ${esc(t.description || 'Purchase')}</span>
    <span class="num ok">+${Math.round(scavCut(t) * 100)}¢</span></div>`).join('') || '<p class="muted" style="margin:0">Nothing yet. Add or import a purchase with cents.</p>';
}
