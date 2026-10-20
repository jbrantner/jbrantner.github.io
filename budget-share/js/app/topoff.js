'use strict';
/* v147: Top off. Cents only, from the other pots and projects, evenly, until the target reaches its next whole dollar
   or the cents run out. cs: { id: floored cents } for the places that can give or take (Savings and the pots). */
function topOffPlan(to, cs) {
  const order = farmPots(), CT = cs[to]; if (CT == null) return null;
  const need = 100 - (CT % 100 + 100) % 100;   // v162: on a whole dollar, the next one
  const src = order.filter(id => id !== to && !isLocked(id) && cs[id] != null && cs[id] > 0 && cs[id] % 100 > 0).map((id, i) => ({ id, i, avail: cs[id] % 100, take: 0 }));
  let R = need;
  while (R > 0) {
    const act = src.filter(x => x.take < x.avail); if (!act.length) break;
    const each = Math.floor(R / act.length);
    if (each === 0) {   // fewer cents to go than places: one each to the ones with the most left, then card order
      act.sort((a, b) => (b.avail - b.take) - (a.avail - a.take) || a.i - b.i);
      for (const x of act.slice(0, R)) { x.take++; R--; }
      break;
    }
    for (const x of act) { const t = Math.min(each, x.avail - x.take); x.take += t; R -= t; }
  }
  return { need, got: need - R, parts: src.filter(x => x.take > 0).map(x => ({ id: x.id, cents: x.take })), full: R === 0, to: Math.floor(CT / 100) + 1 };
}
const placeCents = (pots = potBalances(today().slice(0, 7))) => { const out = {}; for (const id of farmPots()) { const x = pots.find(p => p.id === id); if (x) out[id] = Math.floor(x.bal * 100 + 1e-6); } return out; };
function topOff(to) {
  if (clockHold()) return null;
  const P = topOffPlan(to, placeCents()); if (!P || !P.got) { toast(P && !P.need ? 'Already a whole dollar' : 'No cents to move right now'); return null; }
  const gid = uid(), date = today(), at = Date.now();
  for (const x of P.parts) state.transfers.push({ id: uid(), date, at, from: x.id, to, amount: x.cents / 100, topoff: gid });
  save(); render();
  const ct = n => n < 100 ? n + '¢' : moneyExact(n / 100);
  toastUndo(`${P.full ? `Filled ${potName(to)} to ${money(P.to)}` : `Topped off ${potName(to)}`}: ${ct(P.got)} from ${P.parts.length === 1 ? potName(P.parts[0].id) : `${P.parts.length} places`}`,
    () => { state.transfers = state.transfers.filter(t => t.topoff !== gid); save(); render(); toast('Top off taken back'); });
  if (typeof VL !== 'undefined') VL.toppedOff(to, P.got, P.parts.map(x => [x.id, x.cents]));
  return { id: gid, to, cents: P.got, full: P.full, parts: P.parts };
}
