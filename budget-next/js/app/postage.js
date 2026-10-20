'use strict';
/* Covering postage: when the party spends more than its purse you stay overdrawn until you tap Send postage.
   Then the gap is chosen for you, split
   evenly across mini projects still being built; with none in progress, across the storage pots
   ticked "Covers overspending" (Savings by default). A pot never gives more than it has. */
const coverPots = () => (state.coverPots || ['savings']).filter(id => farmPots().includes(id));
function splitFrom(ids, need) {
  const bals = potBalances(month), out = {}; let left = need, open = ids.filter(id => (bals.find(p => p.id === id) || { bal: 0 }).bal >= 0.01);
  while (left >= 0.01 && open.length) {
    const share = left / open.length;
    for (const id of open) { const room = (bals.find(p => p.id === id).bal) - (out[id] || 0), take = Math.min(room, share); out[id] = (out[id] || 0) + take; left -= take; }
    open = open.filter(id => bals.find(p => p.id === id).bal - (out[id] || 0) >= 0.01);
  }
  return out;
}
let postaging = false;
// What postage needs to cover: a gap carried from last week, plus anything spent past the purse this week.
const postageNeed = (pu = purseNow()) => Math.round((pu.carried + Math.max(0, -(pu.purseLeft + pu.carried))) * 100) / 100;
function autoPostage() {
  if (postaging) return;
  const pu = purseNow(), need = postageNeed(pu); if (need < 0.01) return;
  postaging = true;
  const bals = potBalances(month), minis = bals.filter(p => isMini(p) && p.bal < goalOf(p.id) && p.bal >= 0.01).map(p => p.id);
  let got = splitFrom(minis, need), sent = sum(Object.values(got), x => x);
  const cp = coverPots().length ? coverPots() : ['savings'];   // v311: none ticked: Savings, the default
  if (need - sent >= 0.01) { const more = splitFrom(cp.filter(id => !(id in got)), need - sent); Object.assign(got, more); sent = sum(Object.values(got), x => x); }
  const parts = [];
  for (const [id, amt] of Object.entries(got)) { const a = Math.round(amt * 100) / 100; if (a < 0.01) continue;
    state.transfers.push({ id: uid(), from: id, to: 'spend', amount: a, date: today(), postage: true, auto: true }); parts.push(`${money(a)} from ${(bals.find(p => p.id === id) || { name: 'a pot' }).name}`); }
  if (parts.length) {
    if (!state.purse || state.purse.wk !== ymd(weekStart())) state.purse = { wk: ymd(weekStart()), P: 0, extra: 0 };
    state.purse.extra = Number(state.purse.extra || 0) + sum(Object.values(got), x => Math.round(x * 100) / 100);
    save(); setTimeout(() => { postaging = false; render(); toast(`Covered: ${parts.join(', ')}`); }, 0);
  } else { postaging = false; toast(`Nothing to cover it with yet: ${nameList(cp.map(potName))} ${cp.length > 1 ? 'are' : 'is'} empty`); }
}
