'use strict';
/* v275 (Jordan 19:11): daily and weekly categories. All in cents.
   cats: [{ id, daily, amt }] (amt = the week's money; Anything is daily with id ''), spends: [{ day, pack, c }] in order, d = today's index, days = 7.
   Each day a daily category gets its money left / days left, in whole dollars (v278, Jordan: keep the rest in the days). Overspending pulls, each step split equally among the places that still have money:
   A category in debt keeps it all on today.
   daily: other dailies today, then its own days ahead, then the other dailies' days ahead, then the weekly ones, then it goes negative.
   weekly: the dailies today, then the dailies' days ahead, then the other weekly ones, then it goes negative. */
function catLedger(cats, spends, d, days = 7) {
  const D = cats.filter(c => c.daily), W = cats.filter(c => !c.daily);
  const pool = {}, wk = {}, start = {}, today = {}, fut = {}; let took = 0;
  D.forEach(c => { pool[c.id] = c.amt; }); W.forEach(c => { wk[c.id] = c.amt; });
  // take `need` cents from the slots, split equally; a slot that runs dry passes its part to the rest
  const pull = (need, slots) => {
    while (need > 0) {
      const live = slots.filter(([o, k]) => o[k] > 0); if (!live.length) break;
      const each = Math.floor(need / live.length); let extra = need - each * live.length;
      for (const [o, k] of live) { const want = each + (extra > 0 ? 1 : 0); if (extra > 0) extra--; const got = Math.min(want, o[k]); o[k] -= got; need -= got; }
    }
    return need;
  };
  for (let i = 0; i <= d; i++) {
    const left = days - i;
    D.forEach(c => { today[c.id] = left > 1 && pool[c.id] > 0 ? Math.floor(pool[c.id] / left / 100) * 100 : pool[c.id]; fut[c.id] = pool[c.id] - today[c.id]; start[c.id] = today[c.id]; });
    const f0 = sum(D, c => fut[c.id]);
    for (const s of spends.filter(x => x.day === i)) {
      const k = D.some(c => c.id === s.pack) || W.some(c => c.id === s.pack) ? s.pack : '';
      let need = s.c;
      if (D.some(c => c.id === k)) {
        const own = Math.min(need, Math.max(0, today[k])); today[k] -= own; need -= own;
        need = pull(need, D.filter(c => c.id !== k).map(c => [today, c.id]));
        need = pull(need, [[fut, k]]);
        need = pull(need, D.filter(c => c.id !== k).map(c => [fut, c.id]));
        need = pull(need, W.map(c => [wk, c.id]));
        today[k] -= need;
      } else {
        const own = Math.min(need, Math.max(0, wk[k])); wk[k] -= own; need -= own;
        need = pull(need, D.map(c => [today, c.id]));
        need = pull(need, D.map(c => [fut, c.id]));
        need = pull(need, W.filter(c => c.id !== k).map(c => [wk, c.id]));
        wk[k] -= need;
      }
    }
    if (i === d) took = f0 - sum(D, c => fut[c.id]);   // v316: what today's spending took from the days ahead
    D.forEach(c => { pool[c.id] = today[c.id] + fut[c.id]; });
  }
  const ahead = days - d - 1;
  // the days ahead if nothing more is spent: each gets whole dollars of what's left, the last one gets the rest
  const plan = id => { const out = []; let r = fut[id]; for (let k = ahead; k > 0; k--) { const x = k > 1 && r > 0 ? Math.floor(r / k / 100) * 100 : r; out.push(x); r -= x; } return out; };
  return { daily: D.map(c => ({ id: c.id, start: start[c.id], today: today[c.id], fut: fut[c.id], perDay: ahead > 0 ? Math.floor(fut[c.id] / ahead) : 0, ahead: plan(c.id) })),
    weekly: W.map(c => ({ id: c.id, amt: c.amt, left: wk[c.id] })), took };
}
// the week's categories through catLedger, in cents; Anything is daily and gets the rest of the week's money
function catWeekNow(now = Date.now(), plus, upto) {
  const pu = purseNow(now), ps = packsNow(), w0 = weekStart(new Date(now)), d = Math.max(0, Math.min(6, Math.floor((now - w0) / DAY_MS)));
  const isD = p => p.any || !!((state.packs || []).find(x => x.id === p.id) || {}).daily;
  const cats = ps.filter(p => !p.any).map(p => ({ id: p.id, daily: isD(p), amt: Math.round(p.amt * 100) }));
  const Pc = Math.max(0, Math.round(pu.P * 100)); let extra = sum(cats, c => c.amt) - Pc;   // scaled amounts can round a cent past the week
  for (let i = cats.length - 1; extra > 0 && i >= 0; i--) { const t = Math.min(extra, cats[i].amt); cats[i].amt -= t; extra -= t; }
  cats.push({ id: '', daily: true, amt: Math.max(0, Pc - sum(cats, c => c.amt)) });
  const day = ds => Math.max(0, Math.min(6, Math.round((new Date(ds + 'T12:00:00') - w0) / DAY_MS - 0.5)));
  const spends = weekSpends().map(t => ({ day: day(t.date), pack: t.pack || '', c: Math.round(charged(t) * 100) }));
  if (plus && plus.c > 0) spends.push({ day: d, pack: plus.pack || '', c: plus.c });   // v285: what the keypad would leave
  if (upto != null && upto < d) return { d: upto, ps, ...catLedger(cats, spends.filter(x => x.day <= upto), upto) };   // v286: an earlier day's end
  return { d, ps, ...catLedger(cats, spends, d) };
}
/* Packs: weekly amounts inside the purse (Food $25, Gas $40...). What's left of the purse is the
   Anything pack. If the purse is smaller than the packs (a small party), they shrink to fit. A pack
   that runs over borrows from Anything; the purse as a whole is still the real limit. */
function packsNow() {
  const pu = purseNow(), packs = state.packs || [], want = sum(packs, p => Number(p.amount || 0)), scale = want > pu.P && want > 0 ? Math.max(0, pu.P) / want : 1;
  const ws = weekSpends(), used = id => sum(ws.filter(t => (t.pack || '') === id), t => charged(t));
  const wk = ymd(weekStart()), done = id => state.packDone && state.packDone.wk === wk && state.packDone.ids.includes(id);
  // a type marked done for the week keeps only what was spent; the rest goes to Anything
  const out = packs.map(p => { const u = used(p.id), amt = done(p.id) ? Math.min(Number(p.amount || 0) * scale, u) : Number(p.amount || 0) * scale; return { id: p.id, name: p.name, amt, used: u, left: amt - u }; });
  const over = sum(out, p => Math.max(0, -p.left)), anyAmt = Math.max(0, pu.P - sum(out, p => p.amt));
  out.forEach(p => { p.left = Math.max(0, p.left); });
  out.push({ id: '', name: 'Anything', amt: anyAmt, used: used(''), left: anyAmt - used('') - over, any: true });
  return out;
}
