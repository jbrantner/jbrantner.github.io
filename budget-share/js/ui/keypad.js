'use strict';
// Take a logged spend back out.
function undoSpend(id) { state.transactions = state.transactions.filter(t => t.id !== id); save(); spareBack(); render(); toast('Taken back out'); }
let packEditing = false, sortOpen = null;
/* The keypad sheet: closed it's a tab above the page dots, open it's the whole keypad. sheetY is how far it has
   slid down (0 is open); the road is redrawn as it moves, so the party keeps walking just above it. */
const KEYPAD_ALWAYS = true;   // v109: the keypad stays open (Jordan 20:36)
let sheetOpen = KEYPAD_ALWAYS, sheetY = null, sheetAnim = 0, sheetHeld = false;
// How far the sheet slides down to close: all of it but the handle and the title row.
const sheetClosedY = () => Math.max(0, $('sheetIn').offsetHeight - $('sheetBody').offsetTop - 12);
function sheetPut(y) {
  sheetY = y; $('packSpend').style.setProperty('--sh', ($('sheetIn').offsetHeight + 2 - y).toFixed(1) + 'px');   // + its border
}
// Back in place after something changed its size (a new screen size, Keypad or Count), unless it's moving.
// (Not while its page is hidden: nothing has a size then, so it waits for the next render on screen.)
function sheetFit() { if (!sheetHeld && !sheetAnim && $('sheetIn').offsetHeight) sheetPut(sheetOpen ? 0 : sheetClosedY()); }
// Open or close it, sliding there (at once with reduced motion).
function setSheet(open, animate = true) {
  if (KEYPAD_ALWAYS) open = true;
  sheetOpen = open; cancelAnimationFrame(sheetAnim); sheetAnim = 0;
  const s = $('packSpend');
  s.classList.toggle('closed', !open); $('sheetBody').inert = !open;
  $('sheetGrab').setAttribute('aria-expanded', String(open)); $('sheetGrab').setAttribute('aria-label', open ? 'Close the keypad' : 'Open the keypad');
  if (!$('sheetIn').offsetHeight) return;
  const to = open ? 0 : sheetClosedY(), from = sheetY == null ? to : sheetY;
  if (!animate || lessMotion() || Math.abs(to - from) < 1) { sheetPut(to); return; }
  const t0 = performance.now(), ms = 280;
  const step = now => { const f = Math.min(1, (now - t0) / ms); sheetPut(from + (to - from) * (1 - Math.pow(1 - f, 3))); sheetAnim = f < 1 ? requestAnimationFrame(step) : 0; };
  sheetAnim = requestAnimationFrame(step);
}
// The home screen is the keypad, over the party on the road. A spend comes off this week's whole purse,
// and you can sort it into a type later from the Party page. This also draws the type editor there.
function renderPacks() {
  pickShow(); pickChanged(); tickRoad();
  $('packEditBox').classList.toggle('hidden', !packEditing);
  if (packEditing) $('packEditRows').innerHTML = (state.packs || []).map(p => `<div class="pack-edit"><input data-pack-name="${p.id}" value="${esc(p.name)}" aria-label="Type name"><input data-pack-amt="${p.id}" type="number" inputmode="decimal" value="${p.amount || ''}" placeholder="$ a week" aria-label="Weekly amount (optional)"><button class="link bad" data-pack-del="${p.id}">Remove</button></div>`).join('') || '<div class="muted" style="font-size:13px">No types yet, so everything is Anything.</div>';
}
/* The amount picker in the spend panel. Keypad: type the amount like a calculator (2, 0, ., 1, 3 is $20.13)
   and the combination lock of five digit wheels above it turns to match, |0|2|0|.|1|3|. The wheels can be
   turned by hand too: each turns on its own (no carrying), flicks with momentum and clicks one notch when
   you tap above or below the window, and the next key you press carries on from what they show.
   Count: lay bills and coins on a counter. Either way the books count whole dollars (charged() rounds up)
   and the change goes to the scavenger. */
const PK_ROW = 50, PK_R = PK_ROW / 2 / Math.tan(Math.PI / 10);   // ten faces around a drum, 50px apart
let wheels = [], pickTray = [], pickVal = 0, pickBuf = '';   // the keypad's amount in cents, and what was typed (null: carry on from the wheels)
const pickMode = () => 'keys';   // v168: the keypad and wheels are the only way in
const lessMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const showCents = c => c % 100 ? moneyExact(c / 100) : money(c / 100);   // $20.13, or $20 when it's whole dollars
function pickCents() { return pickMode() === 'count' ? sum(pickTray, c => c) : pickVal; }
// What the wheels add up to. A wheel still turning to a typed digit counts as that digit.
const wheelsVal = () => wheels.reduce((s, w) => s * 10 + (w.goal != null ? w.goal : w.digit), 0);
// A wheel's digit changed. When a hand turned it, the amount follows the wheels.
function wheelTurned(w) { if (w.goal == null && pickMode() === 'keys') { pickVal = wheelsVal(); pickBuf = null; } pickChanged(); }
// A keypad press: a digit, '00' or 'del'. Like a cash register there's no point: digits come in from the
// right, so 1, 2, 3 is $1.23 and 4, 5, 00 is $45.00 (Jordan, v82). Up to $999.99, like the wheels.
function pickKey(k) {
  let v = pickVal;
  if (k === 'del') v = Math.floor(v / 10);
  else for (const ch of k) { if (!v && ch === '0') continue; if (v >= 10000) return pickBump(`The wheels go up to ${state.currency}999.99`); v = v * 10 + Number(ch); }
  pickBuf = ''; pickVal = v; wheelsTo(v, true, 0); pickChanged();
}
// A key that can't go in: the lock gives a little shake.
function pickBump(msg) {
  const l = $('pickWheel'); l.classList.remove('bump'); void l.offsetWidth; l.classList.add('bump');
  if (msg) toast(msg);
}
function pickShow() {
  const m = pickMode();
  $('pickWheel').classList.toggle('hidden', m !== 'keys'); $('pickKeys').classList.toggle('hidden', m !== 'keys'); $('pickCount').classList.toggle('hidden', m !== 'count');
  $('pmKeys').setAttribute('aria-selected', m === 'keys'); $('pmCount').setAttribute('aria-selected', m === 'count');
  $('pickWheel').querySelector('.sign').textContent = state.currency;
  document.querySelectorAll('#pickCount .pk-bill').forEach(b => { b.textContent = state.currency + b.dataset.c / 100; });
  sheetFit();
}
// v109: what you can spend, at a glance: left today (this morning's purse shared over the days left, less today's
// spends), left this week, days until Monday's new purse, and how the week is going against an even pace.
function homeStats() {
  const pu = purseNow(), now = new Date(), d = Math.max(0, Math.min(6, Math.floor((now - weekStart(now)) / DAY_MS))), days = 7 - d;
  const t = todayLeft(pu, now), wk = pu.purseLeft, ahead = pu.spent - pu.pace;
  const tile = (k, v, sub, bad) => `<div class="hs-tile${bad ? ' bad' : ''}"><div class="hs-k">${k}</div><div class="hs-v num">${v}</div><div class="hs-s">${sub}</div></div>`;
  const html = !pu.P && !pu.spent ? `<div class="hs-none">No purse this week yet. Send the party out to get one.</div>` :
    `<div class="hs-row">${tile('Left today', t >= 0 ? money(t) : '−' + money(Math.ceil(-t - 1e-9)), t >= 0 ? 'to spend today' : 'over today', t < 0)}${tile('Left this week', wk >= 0 ? money(wk) : '−' + money(Math.ceil(-wk - 1e-9)), wk >= 0 ? `of ${money(pu.P)}` : 'overdrawn', wk < 0)}${tile(days === 1 ? 'Last day' : 'Days left', days === 1 ? 'Today' : String(days), days === 1 ? 'new purse Monday' : `${money(Math.floor(Math.max(0, wk) / days + 1e-9))} a day`, false)}</div>` +
    `<div class="hs-line">Spent ${money(pu.spent)} this week · ${ahead > 0.5 ? `<b class="bad">${money(Math.ceil(ahead - 1e-9))} ahead of an even pace</b>` : `<b class="ok">on pace</b>`}</div>`;
  if (homeStats.h !== html) { homeStats.h = html; $('homeStats').innerHTML = html; }
}
// What the amount comes to: the Spend button, the rounding line, and a warning past what's left.
function pickChanged() {
  const c = pickCents(), t = { amount: -c / 100 }, ch = c ? charged(t) : 0, cut = c ? Math.round(scavCut(t) * 100) : 0;
  $('pickCountAmt').innerHTML = c % 100 ? `${money(c / 100)}<span class="c">.${String(c % 100).padStart(2, '0')}</span>` : money(c / 100);
  if (wheels.length) { wheels[0].el.classList.toggle('lead', c < 10000); wheels[1].el.classList.toggle('lead', c < 1000); }
  // after the point the brass dot lights up and the next cents wheel glows, so you can see where you're typing
  const f = pickMode() === 'keys' && pickBuf != null && pickBuf.includes('.') ? pickBuf.split('.')[1].length : -1;
  $('pickWheel').querySelector('.point').classList.toggle('on', f >= 0);
  wheels.forEach((w, i) => w.el.classList.toggle('next', f >= 0 && i === 3 + f));
  $('pickRound').innerHTML = !c ? (pickMode() === 'count' ? 'Lay down what you paid' : '')
    : cut ? `Counts as ${money(ch)} · <b>${cut}¢ to spare change</b>` : 'Whole dollars, nothing to spare change';
  $('packGo').disabled = !c; $('packGo').textContent = c ? `Spend ${showCents(c)}` : 'Spend';
  // under the title: what's left of this week's purse, or what will be after this, and how many spends wait to be sorted
  const left = purseNow().purseLeft, after = left - ch, over = c ? after < -0.005 : left < -0.005;
  const n = (state.packs || []).length ? weekSpends().filter(x => x.unsorted).length : 0;
  const line = [c ? (over ? `${money(Math.ceil(-after - 1e-9))} over after this` : `${money(after)} left after this`) : over ? `Overdrawn ${money(Math.ceil(-left - 1e-9))}` : (KEYPAD_ALWAYS ? '' : `${money(left)} left this week · ${(t => t >= 0 ? money(t) + ' today' : money(Math.ceil(-t - 1e-9)) + ' over today')(todayLeft())}`),
    n ? `<button class="link" data-sort>${n} to sort</button>` : ''].filter(Boolean).join(' · ');
  const line2 = String(spendCat).startsWith('debt:') ? `Goes on ${esc(potName(spendCat.slice(5)))}, not this week's money` : line;   // v297
  if (pickChanged.line !== line2) { pickChanged.line = line2; $('packLeft').innerHTML = line2; }
  { const pk = (state.packs || []).length && purseNow().P > 0, L2 = pk ? catWeekNow(Date.now(), c ? { pack: spendCat, c: Math.round(ch * 100) } : null) : null, wk = L2 && L2.weekly.find(x => x.id === spendCat) || null;
    const wn = wk ? ((state.packs || []).find(x => x.id === spendCat) || {}).name || '' : '';
    const a = wk ? wk.left / 100 : L2 ? sum(L2.daily, d => d.today) / 100 : todayLeft() - (c ? ch : 0), x = moneyExact(Math.floor(a * 100 + 1e-6) / 100), m = Math.abs(a - Math.round(a)) < 0.005 ? null : x.match(/^(.*?)([.,]\d\d)$/);   // v256 (Jordan): what's left today, right where you pay
    const h = `<div class="kp-tl">${wk ? `${esc(wn)} left this week${c ? ' after this' : ''}` : c ? 'Left today after this' : 'Left today'}</div><div class="kp-tn num${a < 0 ? ' bad' : ''}">${m ? `${esc(m[1])}<span class="c">${esc(m[2])}</span>` : esc(a < 0 ? '−' + money(Math.round(-a)) : money(Math.round(a)))}</div>`;
    let h2 = h; if (String(spendCat).startsWith('debt:')) { const id = spendCat.slice(5), r = debtRoom(id), aft = r == null ? goalOf(id) + (c ? c / 100 : 0) : r - (c ? c / 100 : 0);   // v297: on a card
      h2 = `<div class="kp-tl">${esc(potName(id))} ${r == null ? 'owed' : 'left to spend'}${c ? ' after this' : ''}</div><div class="kp-tn num${r != null && aft < 0 ? ' bad' : ''}">${esc(aft < 0 ? '−' + moneyExact(-aft) : moneyExact(aft))}</div>`; }
    if (pickChanged.today !== h2) { pickChanged.today = h2; $('kpToday').innerHTML = h2; } }
  homeStats(); renderFav();
  const onCard = String(spendCat).startsWith('debt:');   // v297
  $('packLeft').classList.toggle('over', over && !onCard);
  $('packNote').textContent = c && over && !onCard ? `That's more than the purse has left, so you'll need to send postage.` : '';
  $('pickSaid').textContent = c ? showCents(c) : '';
  if (!sheetOpen) sheetFit();
}
// Turn the wheels to an amount in cents, the short way round each one.
// Typing turns them all at once; Clear turns them one after another, left to right.
function wheelsTo(c, animate, stagger = 70) {
  const ds = String(Math.min(99999, Math.max(0, Math.round(c)))).padStart(5, '0').split('').map(Number);
  wheels.forEach((w, i) => {
    let d = (((ds[i] - w.digit) % 10) + 10) % 10; if (d > 5) d -= 10;
    w.stop(); w.goal = ds[i];
    if (!d && w.pos === Math.round(w.pos)) return;
    if (!animate || lessMotion()) w.set(ds[i]);
    else if (stagger) w.timer = setTimeout(() => w.spinTo(Math.round(w.pos) + d), i * stagger);
    else w.spinTo(Math.round(w.pos) + d);
  });
}
// After Spend: the band flashes gold, the amount floats up off the lock, and each wheel spins forward a full
// turn or two to land on 0, left to right, like a slot machine settling. The sheet closes once they've stopped.
const SPIN_MS = 1350; let spendClose = 0;
function spendSpin(c) {
  const lock = $('pickWheel');
  lock.classList.remove('cash'); void lock.offsetWidth; lock.classList.add('cash');
  setTimeout(() => lock.classList.remove('cash'), 950);
  const tag = document.createElement('div'); tag.className = 'paid'; tag.textContent = '−' + showCents(c);
  lock.appendChild(tag); setTimeout(() => tag.remove(), 1050);
  wheels.forEach((w, i) => { w.goal = 0; w.spinFor((Math.floor(w.pos / 10) + 2) * 10, 620 + i * 60, 60 + i * 85); });
}
// The fewest bills and coins that make an amount, for when you switch from the wheels to Count.
const trayOf = c => [2000, 1000, 500, 100, 25, 10, 5, 1].flatMap(v => { const n = Math.floor(c / v); c -= n * v; return Array(n).fill(v); });
function renderTray() { $('pickTray').innerHTML = pickTray.map(c => c >= 100 ? `<i class="b">${esc(state.currency)}${c / 100}</i>` : `<i class="k${c === 1 ? ' p' : ''}">${c}¢</i>`).join(''); }
// Sort a spend into a type (or Anything). A label the keypad wrote follows the type; a bank's description stays.
// Sorting one that was waiting opens the next one that's waiting.
function sortTx(id, to) {
  const t = state.transactions.find(x => x.id === id), types = state.packs || [], p = types.find(x => x.id === to);
  if (!t || (to && !p)) return;
  if (!t.description || t.description === 'Anything' || types.some(x => x.name === t.description)) t.description = p ? p.name : 'Anything';
  const was = t.unsorted; t.pack = to || ''; delete t.unsorted;
  const next = was && weekSpends().slice().reverse().find(x => x.unsorted);
  sortOpen = next ? next.id : null;
  save(); render();
}
// The wheels. A touch anywhere on the lock grabs the nearest wheel, and while a finger is on the lock the
// page can't scroll, bounce or flip to the next screen (touch-action: none, the touch handlers below,
// and no-swipe for the page flip).
wheels = [...document.querySelectorAll('#pickWheel .wheel')].map(el => {
  el.innerHTML = '<div class="drum">' + Array.from({ length: 10 }, (_, d) => `<div class="face" style="transform: rotateX(${-d * 36}deg) translateZ(${PK_R}px)">${d}</div>`).join('') + '</div><div class="shade"></div>';
  const drum = el.firstChild, w = { el, pos: 0, vel: 0, digit: 0, raf: 0, timer: 0, goal: null };
  const turn = p => { drum.style.transform = `translateZ(${-PK_R}px) rotateX(${p * 36}deg)`; };
  w.set = p => {
    w.pos = p; turn(p);
    const d = ((Math.round(p) % 10) + 10) % 10;
    if (d !== w.digit) { w.digit = d; el.setAttribute('aria-valuenow', d); wheelTurned(w); }
  };
  const settle = () => { w.pos = ((Math.round(w.pos) % 10) + 10) % 10; turn(w.pos); };
  w.stop = () => { clearTimeout(w.timer); cancelAnimationFrame(w.raf); };
  // a hand on the wheel: a typed digit it was still turning to lands at once, then the wheel is the hand's
  w.grab = () => { w.stop(); w.vel = 0; if (w.goal != null) { if (w.pos !== w.goal) w.set(w.goal); w.goal = null; } };
  w.spinTo = target => {
    w.stop();
    if (lessMotion()) { w.set(target); settle(); return; }
    const step = () => { const d = target - w.pos; if (Math.abs(d) < .003) { w.set(target); settle(); return; } w.set(w.pos + d * .28); w.raf = requestAnimationFrame(step); };
    w.raf = requestAnimationFrame(step);
  };
  // a long spin forward over ms (after a wait), easing out with a little kick back past the stop, for Spend
  w.spinFor = (target, ms, wait) => {
    w.stop(); const from = w.pos;
    const ease = f => { const c = 1.4; return 1 + (c + 1) * Math.pow(f - 1, 3) + c * Math.pow(f - 1, 2); };
    w.timer = setTimeout(() => { const t0 = performance.now();
      const step = now => { const f = Math.min(1, (now - t0) / ms); if (f >= 1) { w.set(target); settle(); w.goal = null; return; } w.set(from + (target - from) * ease(f)); w.raf = requestAnimationFrame(step); };
      w.raf = requestAnimationFrame(step); }, wait);
  };
  w.fling = () => {
    w.stop();
    const step = () => { if (Math.abs(w.vel) > .0016 && !lessMotion()) { w.set(w.pos + w.vel * 16); w.vel *= .935; w.raf = requestAnimationFrame(step); return; } w.spinTo(Math.round(w.pos)); };
    w.raf = requestAnimationFrame(step);
  };
  el.addEventListener('keydown', e => {
    const k = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (k) { e.preventDefault(); w.grab(); w.spinTo(Math.round(w.pos) + k); return; }
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); w.grab(); w.spinTo(Math.round(w.pos) + (((Number(e.key) - w.digit) % 10) + 10) % 10); }
  });
  turn(0);
  return w;
});
{ const lock = $('pickWheel'), drags = new Map();
  const nearest = x => wheels.reduce((b, w) => { const r = w.el.getBoundingClientRect(), d = Math.abs(x - r.left - r.width / 2); return d < b.d ? { w, d } : b; }, { w: wheels[0], d: Infinity }).w;
  lock.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const w = nearest(e.clientX); w.grab();
    try { lock.setPointerCapture(e.pointerId); } catch (err) {}
    drags.set(e.pointerId, { w, x: e.clientX, y: e.clientY, p: w.pos, t: performance.now(), ly: e.clientY, moved: 0 });
  });
  lock.addEventListener('pointermove', e => {
    const g = drags.get(e.pointerId); if (!g) return;
    const now = performance.now(), dt = Math.max(1, now - g.t);
    g.w.vel = .75 * g.w.vel + .25 * ((g.ly - e.clientY) / PK_ROW / dt);
    g.t = now; g.ly = e.clientY; g.moved = Math.max(g.moved, Math.abs(e.clientY - g.y) + Math.abs(e.clientX - g.x));   // sideways counts too, so a sideways swipe isn't a tap
    g.w.set(g.p + (g.y - e.clientY) / PK_ROW);
  });
  lock.addEventListener('pointerup', e => {
    const g = drags.get(e.pointerId); if (!g) return; drags.delete(e.pointerId);
    const w = g.w;
    if (g.moved < 6) {   // a tap: the number above or below the window comes to the middle
      const r = w.el.getBoundingClientRect(), y = e.clientY - r.top;
      w.spinTo(Math.round(w.pos) + (y < r.height / 2 - PK_ROW / 2 ? -1 : y > r.height / 2 + PK_ROW / 2 ? 1 : 0));
      return;
    }
    if (performance.now() - g.t > 80) w.vel = 0;   // held still before letting go: no fling
    w.fling();
  });
  lock.addEventListener('pointercancel', e => { const g = drags.get(e.pointerId); if (!g) return; drags.delete(e.pointerId); g.w.spinTo(Math.round(g.w.pos)); });
  const hold = e => { if (e.cancelable) e.preventDefault(); };
  lock.addEventListener('touchstart', hold, { passive: false });
  lock.addEventListener('touchmove', hold, { passive: false });
  lock.addEventListener('wheel', e => { e.preventDefault(); const w = nearest(e.clientX); w.grab(); w.spinTo(Math.round(w.pos) + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
}
// Count: tap bills and coins onto the counter; tap the counter to take the last one back.
$('pickCount').addEventListener('click', e => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  const c = Number(b.dataset.c);
  if (pickCents() + c > 99999) { toast('That\'s as much as the counter holds'); return; }
  pickTray.push(c);
  if (!lessMotion()) {   // the bill or coin slides onto the counter
    const box = $('packSpend').getBoundingClientRect(), r = b.getBoundingClientRect(), t = $('pickTray').getBoundingClientRect(), f = b.cloneNode(true);
    f.classList.add('pk-fly'); f.removeAttribute('data-c'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    Object.assign(f.style, { left: r.left - box.left + 'px', top: r.top - box.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    $('packSpend').appendChild(f);
    requestAnimationFrame(() => { f.style.transform = `translate(${t.left + 20 + Math.min(pickTray.length, 30) * 6 - r.left}px, ${t.top - r.top}px) scale(.4)`; f.style.opacity = '.2'; });
    setTimeout(() => f.remove(), 340);
  }
  renderTray(); pickChanged();
});
{ const untray = () => { if (!pickTray.length) return; pickTray.pop(); renderTray(); pickChanged(); };
  $('pickTray').onclick = untray;
  $('pickTray').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); untray(); } }; }
// Keypad or Count: whichever you pick stays picked, and the amount comes along.
$('pmKeys').parentElement.addEventListener('click', e => {
  const b = e.target.closest('[data-pick-mode]'); if (!b || b.dataset.pickMode === pickMode()) return;
  const c = pickCents();
  state.amountMode = b.dataset.pickMode; save();
  if (state.amountMode === 'count') { pickTray = trayOf(c); renderTray(); } else { pickVal = c; pickBuf = null; wheelsTo(c, false); }
  pickShow(); pickChanged();
});
// The keypad, and a computer's number keys while it's showing.
$('pickKeys').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) pickKey(b.dataset.k); });
document.addEventListener('keydown', e => {
  if (pickMode() !== 'keys' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('pickKeys').offsetParent === null || !$('askBox').classList.contains('hidden') || !$('setup').classList.contains('hidden') || (e.target.closest && e.target.closest('input, select, textarea, .wheel'))) return;
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === 'Backspace' || e.key === 'Delete' ? 'del' : '';
  if (!k || (!sheetOpen && k === 'del')) return;
  e.preventDefault(); if (!sheetOpen) setSheet(true); pickKey(k);
  const b = $('pickKeys').querySelector(`[data-k="${k}"]`); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 110);
});
$('pickZero').onclick = () => { if (pickMode() === 'count') { pickTray = []; renderTray(); } else { pickVal = 0; pickBuf = ''; wheelsTo(0, true); } pickChanged(); };
// Spend: it comes off this week's whole purse, marked to sort into a type later. The sheet slides back down to its tab.
$('packGo').onclick = () => { const c = pickCents(); if (!(c > 0)) return;
  if (String(spendCat).startsWith('debt:')) {   // v297: on the card: what you owe goes up, this week's money doesn't
    if (planBlock()) return;
    const id = spendCat.slice(5), n = potName(id), u = debtCharge(id, c / 100); spendCat = ''; renderFav();
    if (u) { pickVal = 0; pickBuf = ''; pickTray = []; renderTray(); wheelsTo(0, false); clearTimeout(spendClose); setSheet(false); VL.kp(false); const r = debtRoom(id); toastUndo(`${moneyExact(c / 100)} on ${n} · owe ${moneyExact(goalOf(id))}${r != null ? ` · ${money(Math.max(0, Math.floor(r + 1e-9)))} left` : ''}`, u); }
    return; }
  const p = (state.packs || []).find(x => x.id === spendCat);   // v285: the category picked above the keys (Anything when none)
  logSpend(c, (state.packs || []).length ? { description: p ? p.name : 'Anything', pack: p ? p.id : '' } : undefined); spendCat = ''; renderFav(); };
// v270 (Jordan 13:57): Favorites, in Spend again's place. Spends you name yourself, as keys above the keypad (up to three,
// one row). One tap logs it today with Undo, the same as Spend: under its name, to sort later like any spend.
// + Add favorite names one (an amount already on the wheels comes along); Edit takes one off, with Undo.
const FAV_MAX = 3;
let favAdd = null, favEdit = false, favAt = 0;   // the add form (and the amount it opened with), or taking favorites off; favAt: when one was last spent
const favs = () => state.favorites || [];
/* v285 (Jordan 03:37: "instead of favorites ... the categories for spending"): one button per category and Anything,
   each with what it has left; the one picked is where Spend puts the money. It goes back to Anything after each spend.
   Favorites (state.favorites) are kept, just not shown. */
var spendCat = '';   // var: the keypad's render can run before this line
function renderFav() {
  const ps = state.packs || [];
  if (ps.length) {
    const dbs = liveDebts();   // v297: a debt to spend on (it goes on the card)
    if (spendCat && !ps.some(p => p.id === spendCat) && !dbs.some(p => 'debt:' + p.id === spendCat)) spendCat = '';
    let L = null; try { L = catWeekNow(); } catch (e) {}
    const leftOf = id => { if (!L) return ''; const d = L.daily.find(x => x.id === id), w = L.weekly.find(x => x.id === id);
      return d ? `${d.today < 0 ? '−' : ''}${money(Math.floor(Math.abs(d.today) / 100))} today` : w ? `${w.left < 0 ? '−' : ''}${money(Math.floor(Math.abs(w.left) / 100))} this week` : ''; };
    const all = ps.map(p => ({ id: p.id, p })).concat(dbs.map(p => ({ id: 'debt:' + p.id, p: { name: p.name, debt: p.id } })), [{ id: '', p: { any: true, name: 'Anything' } }]);
    const dLeft = x => { const r = debtRoom(x.p.debt); return r == null ? `owe ${money(goalOf(x.p.debt))}` : r >= 0 ? `${money(Math.floor(r + 1e-9))} left` : `${money(Math.ceil(-r - 1e-9))} over`; };
    const h = `<div class="kp-fav-cap"><span>Spend on</span></div><div class="kp-cat-row" style="--n:${Math.min(all.length, 4)}">`
      + all.map(x => `<button type="button" class="kp-fav-b kp-cat${x.id === spendCat ? ' on' : ''}" data-sp-cat="${esc(x.id)}" aria-pressed="${x.id === spendCat}"><b>${catSvg(x.p.debt ? 'card' : catSymOf(x.p))}<span>${esc(x.p.name)}</span></b><small>${x.p.debt ? dLeft(x) : leftOf(x.id)}</small></button>`).join('') + '</div>';
    if (renderFav.h !== h) { renderFav.h = h; $('kpFav').innerHTML = h; $('kpFav').setAttribute('aria-label', 'Spend on'); }
    return;
  }
  const l = favs(); if (!l.length) favEdit = false;
  const h = `<div class="kp-fav-cap"><span>Favorites</span>${l.length && !favAdd ? `<button type="button" class="kp-fav-ed" data-fav-edit aria-pressed="${favEdit}">${favEdit ? 'Done' : 'Edit'}</button>` : ''}</div>`
    + (favAdd ? '<div class="kp-fav-form"><div class="kp-fav-in"><input id="favName" maxlength="24" placeholder="Name, e.g. Coffee" aria-label="Favorite name" autocomplete="off" enterkeyhint="next">'
        + `<input id="favAmt" type="number" inputmode="decimal" min="0" step="any" placeholder="$" aria-label="Favorite amount" enterkeyhint="done" value="${favAdd.c ? (favAdd.c / 100).toFixed(2) : ''}"></div>`
        + '<div class="kp-fav-go"><button type="button" class="kp-fav-no" data-fav-cancel>Cancel</button><button type="button" class="kp-fav-ok" data-fav-save>Save favorite</button></div></div>'
      : '<div class="kp-fav-row">' + l.map(f => favEdit
          ? `<button type="button" class="kp-fav-b del" data-fav="${esc(f.id)}" aria-label="Take ${esc(f.name)} off your favorites"><b>Remove</b><small>${esc(f.name)}</small></button>`
          : `<button type="button" class="kp-fav-b" data-fav="${esc(f.id)}" aria-label="Spend ${showCents(f.cents)} on ${esc(f.name)}"><b>${showCents(f.cents)}</b><small>${esc(f.name)}</small></button>`).join('')
        + (l.length < FAV_MAX && !favEdit ? '<button type="button" class="kp-fav-b kp-fav-add" data-fav-add aria-label="Add a favorite"><b>+</b><small>Add favorite</small></button>' : '') + '</div>');
  if (renderFav.h !== h) { renderFav.h = h; $('kpFav').innerHTML = h; }
}
function favSave() {
  const name = $('favName').value.trim(), c = Math.round(Math.abs(Number($('favAmt').value)) * 100);
  if (!name) { toast('Give it a name'); $('favName').focus(); return; }
  if (!(c > 0)) { toast('Type the amount'); $('favAmt').focus(); return; }
  state.favorites = favs().concat([{ id: uid(), name, cents: c }]).slice(-FAV_MAX); save();
  favAdd = null; renderFav(); toast(`${name}, ${showCents(c)}, is a favorite now`);
}
$('kpFav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.spCat !== undefined) { spendCat = b.dataset.spCat; renderFav(); pickChanged(); return; }   // v285
  if (b.dataset.fav) {
    const l = favs(), i = l.findIndex(f => f.id === b.dataset.fav), f = l[i]; if (!f) return;
    if (!favEdit) { if (Math.abs(Date.now() - favAt) < 700) return; favAt = Date.now(); logSpend(f.cents, { description: f.name, unsorted: true }); return; }   // v311: a double tap spends once
    state.favorites = l.filter(x => x !== f); save(); renderFav();
    toastUndo(`Took ${f.name} off your favorites`, () => { const n = favs().slice(); n.splice(Math.min(i, n.length), 0, f); state.favorites = n.slice(0, FAV_MAX); save(); renderFav(); });
    return;
  }
  if (b.hasAttribute('data-fav-save')) return favSave();
  if (b.hasAttribute('data-fav-edit')) favEdit = !favEdit;
  else if (b.hasAttribute('data-fav-add')) { favAdd = { c: pickCents() }; favEdit = false; }
  else if (b.hasAttribute('data-fav-cancel')) favAdd = null;
  renderFav(); if (favAdd && $('favName')) $('favName').focus();
});
$('kpFav').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.matches('#favName, #favAmt')) return;
  e.preventDefault(); if (e.target.id === 'favName' && !$('favAmt').value) $('favAmt').focus(); else favSave();
});
$('kpX').addEventListener('click', () => { if (favAdd || favEdit) { favAdd = null; favEdit = false; renderFav(); } });   // closing the keypad drops a half-made favorite
function logSpend(c, like) {
  const kept = like && !like.unsorted && (!like.pack || (state.packs || []).some(p => p.id === like.pack));   // sorted into a type that's still there
  addTransactions([{ date: today(), amount: -c / 100, description: like ? like.description || 'Anything' : 'Anything', categoryId: null, pack: kept ? like.pack || '' : '', unsorted: !kept }],
    'manual', like && state.accounts.includes(like.account) ? like.account : state.accounts[1] || state.accounts[0]);
  const t = state.transactions[state.transactions.length - 1], cut = Math.round(scavCut(t) * 100);
  const show = pickMode() === 'keys' && !lessMotion();
  pickVal = 0; pickBuf = ''; pickTray = []; renderTray();
  if (show) spendSpin(c); else wheelsTo(0, false);
  render(); clearTimeout(spendClose);
  if (!show) { setSheet(false); VL.kp(false); }
  else spendClose = setTimeout(() => { spendClose = 0; if (!pickCents()) VL.kp(false); if (sheetOpen && !pickCents()) setSheet(false); }, SPIN_MS);
  toastUndo(`Spent ${showCents(c)}` + (cut ? ` · ${cut}¢ to spare change` : ''), () => undoSpend(t.id));
};
/* Swiping the sheet. A touch that starts on the wheels, the keys or the bills and coins belongs to them, and one
   that goes sideways flips the page (the same test the page flip uses, so the two never both move). Anything
   else that goes up or down moves the sheet, from the tab or from anywhere on the road; let go and it settles
   open or closed, by a flick or by how far it went. A tap on the tab opens it; a tap on the handle closes it. */
{ const card = $('campCard'); let g = null, eat = 0;
  card.addEventListener('pointerdown', e => {
    if (KEYPAD_ALWAYS || e.button > 0 || g || e.target.closest('#pickWheel, #pickKeys, #kpFav, #pickCount, input, select, textarea')) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, y0: sheetY == null ? 0 : sheetY, dir: null, t: performance.now(), ly: e.clientY, v: 0, was: sheetOpen };
  });
  card.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.1) { g = null; return; }   // sideways: a page flip
      g.dir = 'v'; sheetHeld = true; cancelAnimationFrame(sheetAnim); sheetAnim = 0;
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    }
    const now = performance.now(); g.v = .6 * g.v + .4 * (e.clientY - g.ly) / Math.max(1, now - g.t); g.t = now; g.ly = e.clientY;
    const C = sheetClosedY(), y = g.y0 + dy;
    sheetPut(y < 0 ? y / 4 : y > C ? C + Math.min(12, (y - C) / 4) : y);   // a little give past either end
  });
  const end = e => {
    if (!g || e.pointerId !== g.id) return; const d = g; g = null;
    if (d.dir !== 'v') return;
    sheetHeld = false; eat = performance.now() + 450;   // the finger lifting off a button isn't a tap on it
    const C = sheetClosedY(), v = performance.now() - d.t > 100 ? 0 : d.v;
    setSheet(v < -0.35 ? true : v > 0.35 ? false : d.was ? sheetY < C / 3 : sheetY < C * 2 / 3);
  };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  card.addEventListener('click', e => { if (performance.now() < eat) { e.stopPropagation(); e.preventDefault(); } }, true);
  $('packSpend').addEventListener('click', e => {
    if (e.target.closest('#sheetGrab')) setSheet(!sheetOpen);
    else if (!sheetOpen && !e.target.closest('[data-sort], #sheetBody')) setSheet(true);   // (Spend closes it, and its click comes on up here)
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen && !$('view-budget').classList.contains('hidden') && $('askBox').classList.contains('hidden')) setSheet(false); });
  addEventListener('resize', sheetFit);
}
// "3 to sort": over to the Party page, with the newest one waiting already open
$('packLeft').addEventListener('click', e => {
  if (!e.target.closest('[data-sort]')) return;
  const first = weekSpends().slice().reverse().find(t => t.unsorted);
  sortOpen = first ? first.id : null; showView('party', 1); render();
  setTimeout(() => { const el = document.querySelector('#trailLog .tx-types') || $('trailLog'); el.scrollIntoView({ block: 'center' }); }, 60);
});
$('packEdit').onclick = () => { packEditing = false; renderPacks(); };
$('scenePurse').onclick = () => {
  if (postageNeed() >= 0.01) { $('runnerBtn').click(); return; }
  if (!partyNow()) { if (Math.min(Number(state.partyPlan || 0), partyRoom()) > 0) sendPartyNow(); else { showView('party'); toast('Set your weekly spending with +'); } return; }
  showView('party', 1); $('postBox').classList.remove('hidden');
};
$('packAddBtn').onclick = () => {
  const name = $('packNewName').value.trim(), amount = Math.max(0, Number($('packNewAmt').value) || 0); if (!name) { toast('Give the type a name'); return; }
  (state.packs = state.packs || []).push({ id: uid(), name, amount }); $('packNewName').value = ''; $('packNewAmt').value = ''; save(); render();
};
$('packEditRows').addEventListener('change', e => {
  const t = e.target, p = (state.packs || []).find(x => x.id === (t.dataset.packName || t.dataset.packAmt)); if (!p) return;
  if (t.dataset.packName) p.name = t.value.trim() || p.name; else p.amount = Math.max(0, Number(t.value) || 0);
  save(); render();
});
$('packEditRows').addEventListener('click', e => { const id = e.target.dataset.packDel; if (!id) return; state.packs = state.packs.filter(p => p.id !== id); state.transactions.forEach(t => { if (t.pack === id) t.pack = ''; }); save(); render(); });
