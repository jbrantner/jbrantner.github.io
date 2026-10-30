'use strict';
function renderMath() {
  const box = $('mathBox'); if (!box) return;
  const cur = today().slice(0, 7), td = today(), line = (a, b, cls = '') => `<div class="row spread ${cls}"><span>${a}</span><span class="num">${b}</span></div>`;
  const pp = hoardParts(), pn = periodNow(), sg = v => (v < 0 ? '−' : '+') + moneyExact(Math.abs(v)), n = k => `${money((k) * WORKER_DAY)} a day`;
  const incs = state.incomes.filter(i => Number(i.amount) > 0), B = billsMonthWhole();
  // the bank
  const billsOut = cents(pp.out - pp.L.cut), spentOut = cents(pp.spent - pp.L.spendCut), fixes = cents(pp.fix + pp.L.adjCut), moves = cents(pp.head + pp.bills + pp.L.movedBills);
  const outOf = sum(state.transfers.filter(t => t.spend && t.to === 'debt' && t.date <= td), t => t.amount);
  let h = `<div class="math-h">Your bank</div><div class="math-tbl">`
    + line('What you had when you started', moneyExact(pp.had))
    + line('Paychecks you entered', sg(pp.paid))
    + (Math.abs(pp.extra.bank) >= 0.005 ? line('Extra money', sg(pp.extra.bank)) : '')   // v311: it's in the bank too
    + line('Bills paid', sg(-billsOut))
    + line('Spent', sg(-spentOut))
    + (pp.debt - outOf >= 0.005 ? line('Debt payments', sg(-cents(pp.debt - outOf))) : '')
    + (outOf >= 0.005 ? line('Spent from Savings and pots', sg(-cents(outOf))) : '')
    + (Math.abs(fixes) >= 0.01 ? line('Bank balance fixes', sg(fixes)) : '')
    + (Math.abs(moves) >= 0.01 ? line('Other moves', sg(moves)) : '')
    + line('In the bank', moneyExact(pp.bank), 'sum') + `</div>`;
  // the bills' share
  h += `<div class="math-h">Held for bills</div><div class="muted" style="font-size:12.5px; margin:4px 0">Your bills${state.categories.some(c => c.kind !== 'bill') ? ' and set-asides' : ''} are ${money(B)} a month. `
    + incs.map(i => `Every paycheck${incs.length > 1 ? ` from ${esc(i.name)}` : ''} (${perYearOf(i)} a year, ${freqText(i)}) holds ${money(yearShare(i))}: a year of bills spread over a year of paychecks, rounded up. Extra paychecks hold their share too, which covers next month's early bills.`).join(' ')
    + `</div><div class="math-tbl">`
    + line('Saved for bills', money(pp.held), 'sum') + `</div><div class="muted" style="font-size:12.5px">That's what your unpaid bills need until the bill shares of the paychecks still to come can cover them${pp.heldList.length ? ` (${esc(nameList(pp.heldList.map(b => b.c.name)))} first)` : ''}. Bills with no due day are counted on the last day of their month.</div>`;
  // this pay period
  h += `<div class="math-h">This pay period</div>`;
  for (const c of pn.list) {
    const earned = c.start ? Math.max(0, c.F - c.pending) : c.got;
    h += `<div class="math-tbl">`
      + line(`${esc(c.inc.name || 'Paycheck')} ${shortDate(c.date)}${c.start ? ' (in your starting balance)' : ''}`, moneyExact(c.D))
      + line(c.bonus ? 'Extra paycheck: held for bills' : 'Held for bills', '−' + money(Math.min(Math.floor(c.D), c.share)))
      + line('Yours', money(c.F))
      + line(`÷ ${c.days} days to ${c.next ? shortDate(c.next) : 'the next payday'}`, n(c.V))
      + (c.start ? line(`From the day you started (${c.left} days)`, money(c.total)) : (c.extra >= 1 ? line(`Odd dollars, to Savings on ${shortDate(ymd(new Date(c.t1)))}`, money(c.extra)) : ''))
      + line('Earned so far', money(earned), 'sum') + line('Still coming in', money(c.pending)) + `</div>`
      + (c.capped ? `<div class="muted" style="font-size:12.5px">Your starting balance, after the bills' hold, covers ${n(c.V)} until ${shortDate(c.next)}.</div>` : '');
  }
  for (const w of pn.waiting) h += `<div class="math-tbl">${line(`Payday ${shortDate(w.date)} · <button class="link" data-pay-open="${esc(w.key)}" style="padding:0; color:var(--accent)">enter your paycheck</button> to start its money coming in`, '')}</div>`;
  if (!pn.list.length && !pn.waiting.length) h += `<div class="muted" style="font-size:12.5px; margin:4px 0">Add your pay and payday and each paycheck shows up here.</div>`;
  // where the villagers go
  const max = pn.V, party = partyNow(), crews = crewWorkers(), sav = savers(), over = overAssigned();
  h += `<div class="math-h">Where your ${n(max)} go, a day</div><div class="math-tbl">`
    + line(`Weekly spending: ${n(party)}`, `${money(party)} · ${money(c2(party * 7 * WORKER_DAY * wkRof(ymd(weekStart()))))} a week`)
    + line(`Projects and pots: ${n(crews)}`, money(crews))
    + line(`Savings: ${n(sav)}`, money(sav))
    + (over ? line('<span class="bad">More than this paycheck covers</span>', `<span class="bad">${money(over)}</span>`) : '')
    + `</div><div class="muted" style="font-size:12.5px">Anyone you don't assign saves into Savings. Weeks run Monday to Sunday: weekly spending starts each Monday morning, and whatever's left of it on Sunday night goes to ${esc(potName(treasurePot()))}.</div>`;
  // paydays
  const recent = pp.checks.list.filter(c => c.date >= `${cur}-01` || c.pending > 0.005), waiting = paydaysWaiting(), inc0 = mainIncome(), nx = inc0 && Number(inc0.amount) > 0 ? nextPayday(inc0, td) : null;
  h += `<div class="math-h">Paydays</div><div class="math-tbl">`
    + recent.map(c => line(`${shortDate(c.date)} · ${esc(c.inc ? c.inc.name : 'Paycheck')}${c.bonus ? ' · extra' : ''} · ${n(c.V)}`, moneyExact(c.D))).join('')
    + waiting.map(w => line(`${shortDate(w.date)} · <button class="link" data-pay-open="${esc(w.key)}" style="padding:0; color:var(--accent)">enter your paycheck</button>`, '')).join('')
    + (nx ? line('Next payday', shortDate(nx)) : '') + `</div>`;
  // everything added up
  const bals = potBalances(cur), g = id => (bals.find(p => p.id === id) || { bal: 0 }).bal, proj = sum(state.pots, p => g(p.id));
  h += `<div class="math-h">What's yours</div><div class="math-tbl">`
    + line('Savings', money(g('savings'))) + line("This week's money", money(g('spend'))) + (state.pots.length ? line('Pots and projects', money(proj)) : '')
    + line('Spare change', moneyExact(g('scavenger'))) + line('Yours', money((pp.total + pp.pending)), 'sum' + ((pp.total + pp.pending) < 0 ? ' bad' : ''))
    + `</div><div class="muted" style="font-size:12.5px">In the bank ${moneyExact(pp.bank)} = held for bills ${money(pp.held)}${Math.abs(pp.L.movedBills) >= 0.01 ? ` + moved to Bills ${money(pp.L.movedBills)}` : ''} + yours ${money((pp.total + pp.pending))}.${pp.wait >= 0.005 ? ` ${moneyExact(pp.wait)} of your pay isn't in the bank yet.` : ''}</div>`   // v322
    + ((pp.total + pp.pending) < -0.5 ? `<div class="bad" style="font-size:12.5px; margin-top:4px">Your bills need ${money(-(pp.total + pp.pending))} more than you have, so Savings is below zero until more pay comes in.</div>` : '');
  if (box.innerHTML !== h) box.innerHTML = h;
}
// When more villagers work than this pay period's paycheck covers, say so where the plan is made, with a fix.
function renderOver() {
  const over = overAssigned(), pn = periodNow(), max = pn.V, party = partyNow(), crews = crewWorkers(), c = pn.list[0];
  const locked = over > 0 && crews === 0 && Number(state.partyPlan || 0) <= max;   // only the party, and it's already fitted from Monday
  document.querySelectorAll('[data-over]').forEach(el => {
    el.classList.toggle('hidden', !over);
    if (over) el.innerHTML = `<strong class="bad">${money(over)} a day more than this paycheck covers</strong>
      <p>This pay period's paycheck leaves ${money(c ? c.F : 0)} after bills, enough for ${money((max) * WORKER_DAY)} a day${c && c.next ? ` until ${shortDate(c.next)}` : ''}. ${money((party + crews) * WORKER_DAY)} a day is going out (${money(party * WORKER_DAY)} on weekly spending, ${money(crews * WORKER_DAY)} on projects and pots), so Savings pays ${money(over)} a day for the rest${locked ? " until this week's spending ends on Sunday night" : ''}.</p>`
      + (locked ? '' : `<button class="primary" data-fit>Fit my plan to my pay</button>`);
  });
}
// Take villagers off projects (evenly, by size) until the plan fits; the party is locked until Monday, so
// next week's party shrinks too if it alone is more than the pay covers.
function fitToPay() {
  const max = maxWorkers(), party = partyNow(), r = fitCrews(max);
  save(); render();
  toast(party > max ? `Pots and projects paused. From Monday weekly spending is ${money(state.partyPlan * 7)} (${money(state.partyPlan * WORKER_DAY)} a day), which this paycheck covers.` : r.cuts.length ? r.cuts.map(c => `${c.name}: ${c.from} → ${c.to}`).join(' · ') : 'Your plan fits your pay now');
}
document.addEventListener('click', e => { if (e.target.closest('[data-fit]')) fitToPay(); });
