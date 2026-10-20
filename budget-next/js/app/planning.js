'use strict';
/* v314 (Jordan, 2026-10-17: "an optimize button that will suggest where to allocate things that is only applied when you
   hit apply"): Optimize tries a split of your money a day in Planning mode, so nothing sticks until Apply. In order:
   1. a debt whose interest is more than goes in gets the least money a day that makes it shrink;
   2. that comes from what's free first, then from pots and projects, then from weekly spending;
   3. once the month cushion is full, free money a day goes to the debt with the highest APR.
   Projects already at their goal give theirs back. Everything else stays as you have it. */
let optNote = null;   // the lines Optimize shows in the Planning bar, or null
function debtGrow(id) { const P = debtPlan(id); return !!(P && P.never && !P.flat); }
function debtNeed(id) { if (!debtGrow(id)) return 0; for (let p = 1; p <= 400; p++) { const P = debtPlan(id, p); if (P && !P.never) return p; } return 0; }
function optimizePlan() {
  if (plan) { toast('Apply or Undo the plan you have open first'); return; }
  if (payWaiting()) { toast('Enter your paycheck first, so Optimize knows what you have'); return; }
  if (clockHold()) return;
  if (state.roundOff) { toast('Rounding off right now. Tap Stop first.'); return; }
  const was = {}, at = id => Math.max(0, workersAt(id)), ids = farmPots().filter(id => id !== 'savings');
  for (const id of ids) was[id] = at(id); const wk0 = weeklyAmt(), lines = [];
  plan = JSON.stringify(state);   // Planning mode, quietly
  try {
    for (const id of ids) if (!debtOf(id) && !isLocked(id) && roBuilt(id)) while (at(id) > 0) { const n = at(id); setCrew(id, -1); if (at(id) === n) break; }
    const need = {}; for (const p of liveDebts()) if (!isLocked(p.id)) { const k = debtNeed(p.id); if (k) need[p.id] = k; }
    let want = Object.values(need).reduce((a, b) => a + b, 0) + overAssigned(), short = want - savers();
    const from = ids.filter(id => !debtOf(id) && !isLocked(id) && at(id) > 0).sort((a, b) => at(b) - at(a));
    for (const id of from) while (short > 0 && at(id) > 0) { const n = at(id); setCrew(id, -1); if (at(id) === n) break; short--; }
    if (short > 0) {   // the rest comes off weekly spending, $7 a week for each $1 a day
      const k = Math.max(0, Number(state.partyPlan || 0) - short);
      if (k < Number(state.partyPlan || 0)) { wkDraft = k * 7 * WORKER_DAY; wkConfirm(); }
    }
    for (const [id, k] of Object.entries(need)) for (let i = 0; i < k && savers() > 0; i++) setCrew(id, 1);
    const CT = billsMonthWhole(), sv = (potBalances(today().slice(0, 7)).find(p => p.id === 'savings') || { bal: 0 }).bal;
    if (!(CT > 0) || sv > CT + 0.005) {   // the cushion is full: free money a day pays down the costliest debt
      const top = liveDebts().filter(p => !isLocked(p.id)).sort((a, b) => Number(debtOf(b.id).apr || 0) - Number(debtOf(a.id).apr || 0))[0];
      if (top) for (let i = 0; i < 400 && savers() > 0; i++) { const n = at(top.id); setCrew(top.id, 1); if (at(top.id) === n) break; }
    }
  } catch (e) { console.error(e); }
  const day = k => `${k > 0 ? '+' : '−'}${money(Math.abs(k) * WORKER_DAY)} a day`;
  const wk1 = weeklyAmt(); if (Math.abs(wk1 - wk0) > 0.005) lines.push(`Weekly spending ${money(wk0)} → ${money(wk1)} a week`);
  for (const id of ids) { const k = at(id) - was[id]; if (!k) continue;
    const P = debtOf(id) ? debtPlan(id) : null;
    lines.push(`${potName(id)} ${day(k)}${P && !P.never ? ` · paid off ${monthYear(P.end)}` : ''}${!debtOf(id) && roBuilt(id) ? ' · at its goal' : ''}`); }
  if (!lines.length) { const keep = state.transactions, lb = state.lastBackup; state = tidy(JSON.parse(plan)); state.transactions = keep; if (lb) state.lastBackup = lb; plan = null; carts = state.carts || []; render(); toast('Nothing to change. Your money a day already goes where it helps most.'); return; }
  const fr = savers(); lines.push(fr > 0 ? `${money(fr * WORKER_DAY)} a day stays free for ${billsMonthWhole() > 0 && !(((potBalances(today().slice(0, 7)).find(p => p.id === 'savings') || { bal: 0 }).bal) > billsMonthWhole() + 0.005) ? 'your month cushion' : 'Savings'}` : 'Nothing left free for the cushion');
  optNote = lines; render(); toast('Here is a suggestion. Nothing changes until you tap Apply.');
}
let plan = null;   // v309: the books as they were when Planning mode started (JSON), or null
const planReal = () => { const b = JSON.parse(plan); b.transactions = state.transactions; b.seenAt = state.seenAt; b.lastBackup = state.lastBackup; return b; };
// v311: real money isn't something to try out: a paycheck, extra money, a bank fix, a payment or a card charge waits until planning ends
const planBlock = () => { if (!plan) return false; toast('Planning mode is on. Tap Apply or Undo first.'); return true; };
function planStart() { if (plan) return; plan = JSON.stringify(state); render(); toast('Planning mode: try anything. Nothing sticks until you tap Apply.'); }
function planApply() { if (!plan) return; plan = null; optNote = null; save(); render(); toast('Applied ✓'); }
function planUndo() { if (!plan) return; optNote = null; const keep = state.transactions, lb = state.lastBackup; state = tidy(JSON.parse(plan)); state.transactions = keep; if (lb) state.lastBackup = lb; plan = null; carts = state.carts || []; save(); render(); toast('Put back the way it was'); }
function draftBar() {
  const el = document.getElementById('crewDraft'); if (!el) return; const on = !!plan; if (!on) document.documentElement.classList.remove('opt-on'); el.hidden = !on; document.documentElement.classList.toggle('planning', on); if (!on) return; el.querySelector('.cd-p').textContent = optNote ? 'Optimize suggests' : 'Planning mode'; el.classList.toggle('has-opt', !!optNote); document.documentElement.classList.toggle('opt-on', !!optNote); el.querySelector('.cd-t').innerHTML = optNote ? optNote.map(t => `<span class="cd-o">${esc(t)}</span>`).join('') + '<span class="cd-o cd-h">Nothing changes until you tap Apply.</span>' : '';
}
