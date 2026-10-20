'use strict';
/* ---------- scavenger ---------- */
// v125 (Jordan 02:06): collect spare change any time, cents and all. It's split evenly to the cent across Savings, every
// stockhold and every project not at its goal yet (list order: Savings, stockholds, projects). A project never goes past
// its goal; what it can't take is shared by the others. Odd cents go one each to the first places. c is in cents.
function changeSplit(c, pots = potBalances(month)) {
  const all = [pots.find(p => p.id === 'savings'), ...pots.filter(p => p.custom && !isMini(p)), ...pots.filter(p => isMini(p))].filter(Boolean);
  // v129: only where villagers are working now (Savings: when anyone is unassigned); nobody anywhere: all to Savings
  const busy = all.filter(p => p.id === 'savings' ? savers() > 0 : workersAt(p.id) > 0);
  const mk = list => list.map(p => { const g = isMini(p) ? goalOf(p.id) : 0; return { id: p.id, name: p.name, room: g > 0 ? Math.max(0, Math.floor((g - p.bal) * 100 + 1e-6)) : Infinity, got: 0 }; }).filter(r => r.room > 0);
  let R = mk(busy); if (!R.length) R = mk(all.filter(p => p.id === 'savings'));
  let left = Math.round(c);
  while (left > 0) {
    const open = R.filter(r => r.got < r.room); if (!open.length) break;
    const each = Math.floor(left / open.length);
    if (!each) { for (const r of open) { if (!left) break; r.got++; left--; } continue; }
    for (const r of open) { const g = Math.min(each, r.room - r.got); r.got += g; left -= g; }
  }
  return R.filter(r => r.got > 0);
}
// Each share is an ordinary money move out of Spare change (tagged with the collect's id, so Undo takes them all back).
// Moving money between your own places never changes what you have: only where it sits.
// v276 (Jordan): spare change collects itself, with the pour on the bars and no toast
let autoColl = false;
function autoCollect() { autoColl = false; collectChange(true); }
// v311: a spend taken back after its cents were collected leaves spare change below zero: the cents come back out of
// the places they went, newest first, never more than a pot or project has
function spareBack() {
  if (month !== today().slice(0, 7)) return;
  const bals = potBalances(month), sc = bals.find(p => p.id === 'scavenger'); let need = Math.round(-(sc ? sc.bal : 0) * 100); if (need < 1) return;
  const have = {}, at = Date.now(), date = today(); for (const p of bals) have[p.id] = Math.floor(p.bal * 100 + 1e-6);
  for (const t of state.transfers.filter(t => t.collect && t.from === 'scavenger').reverse()) {
    const c = Math.min(need, Math.round(t.amount * 100), t.to === 'savings' ? Infinity : have[t.to] || 0); if (c < 1) continue;   // Savings is what's left over, so it can
    state.transfers.push({ id: uid(), date, at, from: t.to, to: 'scavenger', amount: c / 100, uncollect: true }); have[t.to] -= c; need -= c; if (need < 1) break;
  }
  save();
}
function collectChange(quiet) {
  if (clockHold()) return null;   // v137
  const pots = potBalances(month), sc = pots.find(p => p.id === 'scavenger'), c = Math.round((sc ? sc.bal : 0) * 100);
  if (c < 1) return null;
  const parts = changeSplit(c, pots), gid = uid(), date = month === today().slice(0, 7) ? today() : month + '-01';
  if (!parts.length) return null;
  const at = date === today() ? Date.now() : undefined;
  for (const r of parts) state.transfers.push({ id: uid(), date, ...(at ? { at } : {}), from: 'scavenger', to: r.id, amount: r.got / 100, collect: gid });
  save(); render();
  const ct = n => n < 100 ? n + '¢' : moneyExact(n / 100), lo = Math.min(...parts.map(r => r.got)), hi = Math.max(...parts.map(r => r.got));
  const msg = parts.length === 1 ? `Collected ${moneyExact(c / 100)} into ${parts[0].name}` : `Collected ${moneyExact(c / 100)} · ${lo === hi ? ct(lo) : (hi < 100 ? `${lo}–${hi}¢` : `${ct(lo)}–${ct(hi)}`)} to each of ${parts.length}`;
  if (!quiet) toastUndo(msg, () => { state.transfers = state.transfers.filter(t => t.collect !== gid); save(); render(); if (typeof VL !== 'undefined') VL.collected([]); toast('Spare change put back'); });
  if (typeof VL !== 'undefined') VL.collected(parts.map(r => [r.id, '+' + ct(r.got), r.got]));   // v148: the cents, for the pour
  return { id: gid, cents: c, parts: parts.map(r => ({ id: r.id, cents: r.got })) };
}
