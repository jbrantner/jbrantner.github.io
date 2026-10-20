'use strict';
// the "I got paid" sheet
let got = null;
function openGot(step = 'ask') { if (planBlock()) return; got = { step, mode: 'place', to: 'savings' }; $('gotBox').classList.remove('hidden'); renderGot(); }
function closeGot() { got = null; $('gotBox').classList.add('hidden'); }
function renderGot() {
  if (!got) return; const b = $('gotBody'), incs = state.incomes.filter(i => Number(i.amount) > 0);
  if (got.step === 'ask') b.innerHTML = `<p style="margin:6px 0 12px">Is this your paycheck, or extra money?</p>
    <div class="got-pick"><button class="primary" data-got-k="pay">My paycheck</button><button data-got-k="extra">Extra money</button></div>`;
  else if (got.step === 'inc') b.innerHTML = `<p style="margin:6px 0 12px">Which paycheck?</p><div class="got-pick">${incs.map(i => { const k = payKeyFor(i), d = k && splitKey(k)[1];
      return `<button data-got-inc="${esc(i.id)}"${k ? '' : ' disabled'}>${esc(i.name || 'Paycheck')}<small>${d ? (d > today() ? `next payday ${shortDate(d)} · early` : `payday ${shortDate(d)}`) : 'nothing to enter'}</small></button>`; }).join('')}</div>
    <div class="row" style="margin-top:12px"><button data-got-k="ask">Back</button></div>`;
  else {
    const opts = ['<option value="savings">Savings</option>', ...state.pots.filter(p => !crewBuilt(p.id)).map(p => `<option value="${esc(p.id)}"${got.to === p.id ? ' selected' : ''}>${esc(p.name)}${goalOf(p.id) > 0 ? ` (to its ${money(goalOf(p.id))} goal)` : ''}</option>`)].join('');
    const busy = farmPots().filter(id => id === 'savings' ? savers() > 0 : workersAt(id) > 0).map(id => id === 'savings' ? 'Savings' : potName(id)), ex = (state.extras || []).slice(-3).reverse();
    b.innerHTML = `<label class="field">How much<input id="gotAmt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="$"></label>
      <label class="field">Note (optional)<input id="gotNote" maxlength="60" placeholder="Birthday money, a refund…"></label>
      <p class="muted" style="font-size:13px; margin:8px 0 4px">Nothing is held for bills. Where should it go?</p>
      <div class="got-modes">
        <label><input type="radio" name="gotMode" value="place"${got.mode === 'place' ? ' checked' : ''}> <span>Into one place <select id="gotTo" aria-label="Which place">${opts}</select></span></label>
        <label><input type="radio" name="gotMode" value="even"${got.mode === 'even' ? ' checked' : ''}> <span>Split evenly across places that get money each day <small>(${busy.length ? esc(busy.join(', ')) : 'nobody working: Savings'})</small></span></label>
        <label><input type="radio" name="gotMode" value="villagers"${got.mode === 'villagers' ? ' checked' : ''}> <span>Extra money a day until your next payday</span></label>
      </div>
      <p class="muted" id="gotPlan" style="font-size:13px; margin:8px 0 0"></p>
      <div class="row" style="margin-top:12px; gap:8px"><button data-got-k="ask">Back</button><span class="grow"></span><button class="primary" id="gotSave" disabled>Save</button></div>
      ${ex.length ? `<div class="got-ex"><div class="muted" style="font-size:12px; margin-top:12px">Extra money</div>${ex.map(e => `<div class="row spread" style="font-size:13px; padding:3px 0"><span>${e.date.slice(5)} · ${moneyExact(e.amt)}${e.note ? ' · ' + esc(e.note) : ''}</span><button class="link danger" data-got-del="${esc(e.id)}">Take out</button></div>`).join('')}</div>` : ''}`;
    gotPlan();
  }
}
function gotPlan() {
  const a = $('gotAmt'); if (!a || !got) return;
  const v = a.value.trim(), D = Number(v), ok = v !== '' && isFinite(D) && D > 0 && D < 1e7;
  got.mode = (document.querySelector('input[name="gotMode"]:checked') || { value: 'place' }).value; got.to = $('gotTo').value;
  $('gotSave').disabled = !ok; $('gotPlan').textContent = ok ? extraPlan(D, got.mode, got.to).text : 'Type the amount, cents and all.';
}
