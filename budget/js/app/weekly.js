'use strict';
// days left in this week, today included (a party sent today spends today too)
function sendNowDays(now = new Date()) { return 7 - Math.max(0, Math.min(6, Math.floor((now - weekStart(now)) / DAY_MS))); }
// A party leaves mid-week with the days that are left; it can't change until it's back, like any other.
// v178: on the week's first day, a party that didn't set out (nobody was free at midnight) leaves as soon as there's room
function mondayCatchUp() {   // v268: any day, not only Mondays (see autoStartOk)
  if (!autoStartOk()) return;
  const wk = ymd(weekStart()), k = Math.min(Number(state.partyPlan || 0), partyRoom()), d = sendNowDays(); if (!k) return;
  if (!state.purse || state.purse.wk !== wk) state.purse = { wk, P: 0, extra: 0 };
  state.purse.late = Number(state.purse.late || 0) + k * (wkDays(wk) - d) * WORKER_DAY;   // 0 on the first day: a full week
  state.workerLog.push({ t: stampNow(), pot: 'party', delta: k }); save();
  setTimeout(() => toast(`This week's spending started: ${money(c2(k * d * WORKER_DAY * wkR()))}${d < wkDays(wk) ? ' for the days left' : ''}`), 0);
}
// v268 (Jordan, 2026-10-13: "Any day"): a week that isn't running starts on its own the moment there's room, any day,
// with the days left (it used to wait for Monday). Not if it already went out this week and came back (Start now in
// Settings still can), and not while the clock reads earlier than it has before. The week's own Monday 00:00 change
// (villagers home when nothing is planned) doesn't count as going out.
function autoStartOk() {
  const wk = ymd(weekStart()), t0 = weekStart().getTime();
  if (state.manualWeek || state.lastWeek !== wk || partyNow() > 0 || clockBack()) return false;   // v322: loaded by hand
  if (state.workerLog.some(w => w.pot === 'party' && w.t >= t0 && !(w.t === t0 && w.delta < 0))) return false;
  return !(state.purse && state.purse.wk === wk && Number(state.purse.late || 0));
}
function sendPartyNow() {
  if (partyNow() > 0) return;
  if (clockHold()) return;   // v137
  const k = Math.min(Number(state.partyPlan || 0), partyRoom()); if (!k) return;
  const wk = ymd(weekStart()), d = sendNowDays();
  if (!state.purse || state.purse.wk !== wk) state.purse = { wk, P: 0, extra: 0 };
  state.purse.late = Number(state.purse.late || 0) + k * (wkDays(wk) - d) * WORKER_DAY;
  state.lastWeek = state.lastWeek || wk;
  state.workerLog.push({ t: stampNow(), pot: 'party', delta: k });
  save(); render(); toast(`This week's spending started: ${money(c2(k * d * WORKER_DAY * wkR()))} for the days left`);
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#partyNow')) sendPartyNow(); });
// v144: − / + step the weekly spending (state.partyPlan) $1 a day, $7 a week; since v293 Confirm changes the running week too
/* v177: the weekly budget's draft, and what confirming it takes off pots and projects (most villagers first) */
var wkDraft = null;   // var: render can run before this line
function wkTakes(to) {
  let need = to - (planCap()); const out = [];
  if (need <= 0) return out;
  const left = {}; for (const id of farmPots()) if (id !== 'savings' && !isLocked(id)) left[id] = workersAt(id);
  while (need > 0) { const id = Object.keys(left).sort((a, b) => left[b] - left[a])[0]; if (!id || left[id] < 1) break; left[id]--; need--; const o = out.find(x => x[0] === id); if (o) o[1]++; else out.push([id, 1]); }
  return out;
}
function wkShown() { return wkDraft == null ? weeklyAmt() : wkDraft; }   // v311: the weekly amount on screen, the draft while there is one
function wkStep(d) {   // v294: the draft is dollars a week; − / + move it $7
  const cur = wkDraft == null ? weeklyAmt() : wkDraft;
  wkSetDraft(cur + d * 7 * WORKER_DAY);
}
const wkTop = () => Math.max(maxWorkers() * 7 * WORKER_DAY, weeklyAmt());   // lowering is always fine, even above what pay covers
function wkSetDraft(v) {
  const top = wkTop(), to = c2(Math.max(0, Math.min(top, Number(v) || 0)));
  if ((Number(v) || 0) > top + 0.005) toast(`Right now your pay covers up to ${money(top)} a week`);
  wkDraft = Math.abs(to - weeklyAmt()) < 0.005 ? null : to; render();
}
function wkConfirm() {
  if (wkDraft == null) return; const amt = wkDraft, to = Math.ceil(amt / 7 / WORKER_DAY - 1e-9); wkDraft = null;
  const wk0 = ymd(weekStart()), n0 = partyNow(), P0 = purseNow().P, day0 = n0 * WORKER_DAY * wkRof(wk0);
  for (const [id, c] of wkTakes(to)) for (let i = 0; i < c; i++) setCrew(id, -1);
  state.partyPlan = Math.min(to, Math.max(planCap(), Number(state.partyPlan || 0))); state.wkAmt = c2(Math.min(amt, state.partyPlan * 7 * WORKER_DAY));
  // v293 (Jordan, 2026-10-15: "I need it to be flexible"): a running week changes now, not on Monday. The days already
  // gone keep the old amount a day; today and the days left get the new one.
  const wk = ymd(weekStart()), n = partyNow(), k = Math.min(state.partyPlan, Math.max(partyRoom(), n)); let tail = '';   // v294: lowering never cuts more than asked
  if (n > 0 && !fundRec(wk) && !clockBack()) {
    if (!state.purse || state.purse.wk !== wk) state.purse = { wk, P: 0, extra: 0 };
    const nr = k === state.partyPlan ? wkR() : 1;
    if (k === n) state.purse.r = nr;   // v294: same dollars a day, only the cents changed ($301 to $300): the whole week takes it
    else {
      state.purse.late = Number(state.purse.late || 0) + (k - n) * (wkDays(wk) - sendNowDays()) * WORKER_DAY;
      state.workerLog.push({ t: stampNow(), pot: 'party', delta: k - n });
      state.purse.r = nr; state.purse.adj = 0;
      state.purse.adj = c2(P0 + (k * WORKER_DAY * nr - day0) * sendNowDays() - purseNow().P);   // the days gone keep what they had
    }
    tail = ` · this week is now ${money(purseNow().P)}`;
  }
  save(); render();
  toast(`Weekly budget: ${money(weeklyAmt())} a week${tail}`);
}
async function planStep(d) {
  if (d > 0 && Number(state.partyPlan || 0) >= planCap()) {   // v176: nobody free: free one from a pot or project
    if (Number(state.partyPlan || 0) >= maxWorkers()) return;
    const ids = farmPots().filter(id => id !== 'savings' && workersAt(id) > 0 && !isLocked(id)).sort((a, b) => workersAt(b) - workersAt(a));
    if (!ids.length) { toast('All your money a day is on a locked pot or project. Unlock one first.'); return; }
    if (!await ask(`All your money a day is going to Savings right now. Take $1 a day off ${potName(ids[0])} for $7 a week more to spend?`)) return;
    setCrew(ids[0], -1); if (Number(state.partyPlan || 0) >= planCap()) return;
  }
  state.partyPlan = d < 0 ? Math.max(0, Math.min(Number(state.partyPlan || 0), planCap()) - 1) : Math.min(planCap(), Number(state.partyPlan || 0) + 1);
  save(); render();
}
