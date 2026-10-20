'use strict';
function campaign(m, now = Date.now()) {
  const bills = state.categories.filter(c => c.kind === 'bill');
  const amt = c => Number(c.budget || 0);
  const order = [...bills].sort((a, b) => (dueDate(a, m) || '9').localeCompare(dueDate(b, m) || '9') || amt(a) - amt(b));
  // Bills the bank already paid sit out of the fight entirely. Ones you slew early stay in the
  // month's total but take no damage, so the sword gets ahead.
  const tx = state.transactions.filter(t => t.date.startsWith(m)), pays = c => tx.filter(t => t.categoryId === c.id);
  const outside = c => pays(c).length && !pays(c).every(t => t.gameSlain), early = c => pays(c).some(t => t.early);
  const t0 = monthStartMs(m), t1 = monthEndMs(m), rate = Math.max(1e-9, sum(bills.filter(c => !outside(c)), amt) / (t1 - t0));
  // The bills' share of each paycheck builds the projects as it's gathered; fun money you send rushes them.
  const rush = Number((state.rush || {})[m] || 0), gathered = rate * (t1 - t0) * collectedFrac(m);
  let D = gathered + rush;
  // Once every project is built, the bills' share keeps coming in with nothing to build, so the
  // fun money you rushed with flows back to Fun. By the month's end it's all back.
  const refund = Math.max(0, Math.min(rush, D - rate * (t1 - t0)));
  const out = {};
  for (const c of order) {
    if (outside(c)) { out[c.id] = { paid: true }; continue; }
    // slain early: it keeps the damage it had taken by then, and the rest flows on
    if (early(c)) { const took = Math.min(D, sum(pays(c), t => t.dealt || 0)); D -= took; out[c.id] = { paid: true }; continue; }
    const hit = Math.min(D, amt(c)); D -= hit;
    out[c.id] = { dealt: hit, left: amt(c) - hit };
  }
  return { order, out, rate, rush, refund, gathered };
}

/* ---------- the farms ----------
   Every pot is a farm. Two farms sit side by side (they start empty each time the app opens).
   You can send crops (money) and workers between them: workers carry crops in sacks and change
   how fast each farm grows; crops sent without workers go by caravan as a one-time move.
   Trips are saved with the clock time they set off, so one that "arrives" while the app is
   closed is delivered the next time it opens. */
const ROBES = ['#5b4a7a', '#2f6f4f', '#8a3b2e', '#2c5d8a', '#7a6a2c', '#6b2f5e'];
const HATS = ['Hood', 'Wizard', 'Cap', 'Crown', 'None'];
const TRADER_NAMES = ['Bram', 'Nell', 'Oswin', 'Tilda', 'Garrick', 'Mags', 'Pip', 'Rook', 'Hester', 'Wendel'];
const posts = { a: [], b: [] };   // the pot id in each outpost (not saved: outposts open empty)
const saveCarts = () => { state.carts = carts; save(); };
const incoming = {};               // potId -> { total, arrived, clearAt }
const LW = 160, LH = 95, CART_MS = 1700;
const off = document.createElement('canvas'); off.width = LW; off.height = LH;
const pileCv = document.createElement('canvas');
const spr = document.createElement('canvas'); spr.width = LW; spr.height = LH;   // carts and walkers, drawn over the farms
let sceneRaf = null;

// Every pot gets its own trader; a pot without a saved look gets one picked from its id.
function traderFor(id) {
  if (!state.potTraders) state.potTraders = {};
  if (!state.potTraders[id]) {
    const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const used = Object.values(state.potTraders).map(t => t.name);
    const free = TRADER_NAMES.filter(n => !used.includes(n)), name = free.length ? free[h % free.length] : 'Trader';
    state.potTraders[id] = { name, robe: h % ROBES.length, hat: (h >> 3) % HATS.length };
  }
  return state.potTraders[id];
}
const sideOf = id => posts.a.includes(id) ? 'a' : posts.b.includes(id) ? 'b' : null;
const tripMs = c => c.ms || CART_MS;
const send = { from: 'a', amt: 0, workers: 0 };   // what's set up to go next
const holdsWorkers = id => id === 'spend' || canFarm(id);
function route() {
  const toSide = send.from === 'a' ? 'b' : 'a', from = posts[send.from][0], to = posts[toSide][0];
  if (!from || !to) return null;
  const p = potBalances(month).find(x => x.id === from);
  return { from, to, toSide, cropsMax: Math.max(0, Math.floor(p.bal - inFlightOut(from))),
    workersMax: holdsWorkers(to) ? workersFree(from) : 0 };
}
function nudgeSend(key, dir) {
  const rt = route(); if (!rt) { toast('Put a pot on each farm first'); return false; }
  const max = key === 'amt' ? rt.cropsMax : rt.workersMax, step = key === 'amt' ? state.inc : 1;
  const next = Math.max(0, Math.min(max, send[key] + dir * step));
  if (next === send[key]) {
    if (dir > 0) toast(key === 'amt' ? `${potName(rt.from)} has no more crops to send`
      : !holdsWorkers(rt.to) ? `${potName(rt.to)} can't take money a day` : rt.from === 'spend' ? 'Fun has no more money a day to send' : `${potName(rt.from)} has no more money a day`);
    return false;
  }
  send[key] = next; renderPosts(); return true;
}
function doSend() {
  const rt = route(); if (!rt) return;
  const amt = Math.min(send.amt, rt.cropsMax), workers = Math.min(send.workers, rt.workersMax);
  if (!amt && !workers) return;
  const now = Date.now(), last = Math.max(0, ...carts.filter(c => c.side === rt.toSide).map(c => c.t0));
  carts.push({ from: rt.from, to: rt.to, amt, workers, side: rt.toSide, t0: Math.max(now, last + 400), ms: workers ? 2600 : CART_MS });
  if (amt) {
    const inc = incoming[rt.to] && incoming[rt.to].total > incoming[rt.to].arrived ? incoming[rt.to] : (incoming[rt.to] = { total: 0, arrived: 0 });
    inc.total += amt; inc.clearAt = 0;
  }
  send.amt = 0; send.workers = 0;
  saveCarts(); renderPosts(); startScene();
}
// Workers change farms the moment they arrive, which may have been while the app was closed.
function moveWorkers(from, to, n, t) {
  const d = {}; if (from !== 'spend') d[from] = -n; if (to !== 'spend') d[to] = (d[to] || 0) + n;
  reassign(t, d);
}
function removeFromPost(id) {
  const side = sideOf(id); if (!side) return;
  posts[side] = []; send.amt = 0; send.workers = 0;
  if (navigator.vibrate) navigator.vibrate(20);
  renderPosts(); toast(`Took ${potName(id)} out`);
}
function renderPosts() {
  const pots = potBalances(month);
  for (const side of ['a', 'b']) {
    const id = posts[side][0], el = document.querySelector(`.scene .slot[data-slot="${side}"]`);
    el.innerHTML = id ? `<button class="post-pot" data-pot="${id}" style="left:0; width:100%" aria-label="${esc(potName(id))}. Tap to send from here, long press to remove"></button>`
      : `<div class="post-empty">Empty</div>`;
  }
  const rt = route();
  if (rt) { send.amt = Math.min(send.amt, rt.cropsMax); send.workers = Math.min(send.workers, rt.workersMax); }
  $('dirBtn').classList.toggle('hidden', !rt);
  $('dirBtn').textContent = send.from === 'a' ? '→' : '←';
  $('cropAmt').textContent = money(send.amt);
  $('wkAmt').textContent = send.workers;
  $('wkHint').textContent = `(${money(WORKER_DAY)} a day each)`;
  for (const b of ['cropMinus', 'cropPlus', 'wkMinus', 'wkPlus', 'sendBtn']) $(b).disabled = !rt;
  if (rt) { $('wkPlus').disabled = send.workers >= rt.workersMax; $('cropPlus').disabled = send.amt >= rt.cropsMax; $('cropMinus').disabled = !send.amt; $('wkMinus').disabled = !send.workers; }
  const w = send.workers, a = send.amt;
  $('sendBtn').disabled = !rt || (!w && !a);
  $('sendBtn').textContent = w && a ? `Send ${money(w * WORKER_DAY)} a day carrying ${money(a)}` : w ? `Send ${money(w * WORKER_DAY)} a day` : a ? `Send a caravan of ${money(a)}` : 'Send';
  $('tradeHelp').textContent = !rt ? 'Use + Pot to put a pot on each farm.'
    : w ? `${potName(rt.to)} will grow ${money(w * WORKER_DAY)} more a day` + (rt.from === 'spend' ? ', earned instead of Fun.' : `, and ${potName(rt.from)} ${money(w * WORKER_DAY)} less.`)
    : 'Tap a farm or the arrow to switch direction. Long press a farm to take it out.';
}

function startScene() { if (!sceneRaf) sceneRaf = requestAnimationFrame(tickScene); }
function tickScene() {
  sceneRaf = null;
  const now = Date.now();
  const landed = carts.filter(c => now - c.t0 >= tripMs(c));
  if (landed.length) {
    carts = carts.filter(c => now - c.t0 < tripMs(c)); state.carts = carts;
    for (const c of landed) {
      if (c.workers) moveWorkers(c.from, c.to, c.workers, c.t0 + tripMs(c));
      if (c.amt) commitMove(c.from, c.to, c.amt); else { save(); render(); }
      const inc = incoming[c.to]; if (inc && c.amt) { inc.arrived += c.amt; if (inc.arrived >= inc.total) inc.clearAt = now + 1200; }
    }
  }
  for (const [id, inc] of Object.entries(incoming)) if (inc.clearAt && now > inc.clearAt) delete incoming[id];
  if (landed.length) renderFarm();
  if (carts.length || Object.keys(incoming).length) startScene();
}
// A bill's building with its crew around it (up to four shown, then a count); they cheer once it's paid.
const BLDG = { 'Homestead': 'homestead', 'Signal tower': 'signal', 'Message post': 'message', 'Generator': 'generator', 'Water wheel': 'waterwheel', 'Wagon works': 'wagon',
  'Music box': 'musicbox', 'Cloud lantern': 'cloud', 'Thinking engine': 'thinking', 'Picture box': 'picture', 'Training yard': 'training', 'Counting house': 'counting' };
const bldgOf = c => 'bldg-' + (BLDG[machineName(c)] || buildOf(c).name.toLowerCase());
/* ---------- the village ----------
   Every pot is a plot of land; plots sit edge to edge like a little farming town. Tapping one
   opens it to assign workers and move crops in or out. */
const K = 1.3, RW = K - 1;                  // plot spacing (1 = touching); the gap is road
let villageOrigin = { x: 0, y: 0 };
// Plots sit on a grid; (a, b) are ground coordinates in plot widths along the two diagonal axes.
function villageGrid() {
  const ids = state.incomes.map(i => i.id), cols = Math.max(1, Math.ceil(Math.sqrt(ids.length))), rows = Math.max(1, Math.ceil(ids.length / cols));
  return { ids, cols, rows, cell: id => { const k = ids.indexOf(id); return k < 0 ? null : { i: k % cols, j: Math.floor(k / cols) }; } };
}
const gpt = (a, b) => ({ x: villageOrigin.x + 56 * (a - b) + 56, y: villageOrigin.y + 40 * (a + b) + 36 });
const roadA = i => i * K - RW / 2, roadB = j => j * K + 1 + RW / 2;
// Town is off the front-left corner, where Fun, Bills and the rest live.
const townAt = gr => ({ a: -1.25, b: roadB(gr.rows - 1) });
// A trip follows the roads: out the farm's front door, along to the target's column, up to its row, in.
function tripPath(from, to, gr = villageGrid()) {
  const door = id => { const c = gr.cell(id); return c && { a: c.i * K + 0.5, b: roadB(c.j), c }; };
  const f = door(from), t = door(to), town = townAt(gr);
  const S = f || town, pts = [{ a: S.a, b: S.b }];
  const tgt = t || town, aR = t ? roadA(t.c.i) : roadA(0), bT = t ? roadB(t.c.j) : town.b;
  pts.push({ a: aR, b: S.b }, { a: aR, b: bT }, { a: tgt.a, b: tgt.b });
  return pts.filter((p, i) => !i || Math.hypot(p.a - pts[i - 1].a, p.b - pts[i - 1].b) > 1e-6);
}
function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) { const p = gpt(pts[i - 1].a, pts[i - 1].b), q = gpt(pts[i].a, pts[i].b); L += Math.hypot(q.x - p.x, q.y - p.y); } return L; }
// Sends workers and/or crops on foot (or crops alone by cart). They count once they arrive.
function launchTrip(from, to, amt, workers) {
  villageOrigin = villageOrigin || { x: 0, y: 0 };
  const ms = Math.max(2500, pathLen(tripPath(from, to)) / 26 * 1000);
  carts.push({ from, to, amt, workers, t0: Date.now(), ms, v: 1 });
  if (amt) { const inc = incoming[to] && incoming[to].total > incoming[to].arrived ? incoming[to] : (incoming[to] = { total: 0, arrived: 0 }); inc.total += amt; inc.clearAt = 0; }
  saveCarts(); startScene(); renderFarm();
}
