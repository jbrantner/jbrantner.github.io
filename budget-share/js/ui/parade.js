'use strict';
/* v136 #6 and #7: the payday parade. The paycheck's whole dollars split three ways: held for bills, the party's
   purse until the next payday, and the rest saving (Savings, pots and projects). Counts and dollars only. When the
   check is not its usual amount, a plain line says what that does to the villagers. */
function paradeParts(key, D) {
  const [id, date] = splitKey(key), inc = state.incomes.find(i => i.id === id); if (!inc || !(D > 0)) return null;
  const P = periodOf(inc, date), whole = Math.floor(D + 1e-9), share = shareOf(inc, date), bills = Math.min(whole, share), F = Math.max(0, whole - share);
  const V = Math.floor(F / P.days / WORKER_DAY + 1e-9), pv = Math.min(V, Math.max(partyNow(), Number(state.partyPlan || 0))), party = Math.min(F, pv * P.days * WORKER_DAY);
  const out = { D, bills, party, saving: F - party, news: '' }, usual = Number(inc.amount) || 0, gap = D - usual;
  if (usual > 0 && Math.abs(gap) >= 1) {
    const Vu = Math.floor(Math.max(0, Math.floor(usual + 1e-9) - share) / P.days / WORKER_DAY + 1e-9), dv = Vu - V;
    if (dv) out.news = `${money(Math.round(Math.abs(gap)))} ${gap < 0 ? 'less' : 'more'} than usual means ${money(Math.abs(dv) * WORKER_DAY)} a day ${gap < 0 ? 'less' : 'more'} until ${P.next ? shortDate(P.next) : 'your next payday'}.`;
    out.less = gap < 0;
  }
  return out;
}
function showParade(pd) {
  const tot = pd.bills + pd.party + pd.saving; if (!(tot > 0)) return;
  const unit = Math.max(10, Math.ceil(tot / 30 / 10) * 10), still = lessMotion(), cnt = x => x > 0 ? Math.max(1, Math.round(x / unit)) : 0;
  let k = 0; const blocks = (x, c) => Array.from({ length: cnt(x) }, () => `<i class="pd-v ${c}" style="animation-delay:${still ? 0 : (k++) * 35}ms"></i>`).join('');
  const g = (x, c, label) => `<div class="pd-g"><div class="pd-blocks">${blocks(x, c)}</div><b class="num">${money(x)}</b><small>${label}</small></div>`;
  $('pdCard').innerHTML = `<h3>${moneyExact(pd.D)} landed</h3><div class="pd-groups">${g(pd.bills, 'b', 'held for bills')}${g(pd.party, 'p', 'party')}${g(pd.saving, 's', 'saving')}</div>`
    + (pd.news ? `<p class="pd-note${pd.less ? ' warn' : ''}">${esc(pd.news)}</p>` : `<p class="pd-note">Each block is ${money(unit)}.</p>`);
  $('pdCard').classList.remove('hidden'); clearTimeout(showParade.t);
  showParade.t = setTimeout(() => $('pdCard').classList.add('hidden'), pd.news ? 7000 : 5000);
}
/* v136 #11: a round burst on the Savings row each time Savings passes a new $100, once each (the highest shown is kept,
   so dipping under and climbing back doesn't repeat it). The first look only notes where Savings is. */
function saveMilestone(b) {
  const mk = Math.floor(b / 100 + 1e-9) * 100;
  if (state.saveMile == null) { state.saveMile = Math.max(0, mk); save(); return; }
  if (!(mk >= 100 && mk > state.saveMile)) return;
  state.saveMile = mk; save();
  setTimeout(() => {
    const row = document.querySelector('#townList [data-vl-row="savings"]'); if (!row) return;
    const x = document.createElement('span'); x.className = 'ms-burst'; x.setAttribute('aria-hidden', 'true');
    x.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join(''); row.appendChild(x); setTimeout(() => x.remove(), 1100);
  }, 0);
  toast(`Savings passed ${money(mk)}`);
}
