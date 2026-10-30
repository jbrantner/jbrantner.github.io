'use strict';
/* ---------- v123: the village list (Jordan, 2026-10-11 01:01-01:07) ----------
   The Town page as a list: what this pay period has earned so far, ticking to the cent, with a bar to the next whole
   dollar, then each place your villagers work (the party, Savings and pots, projects, bills) as rows with live bars.
   Each time the total passes a whole dollar it pings. The Budget page shows the party the same way, with a Spend
   button that brings up the keypad. Every number is the engine's own (periodNow's got, potBalances, purseNow and
   payNow at this moment), just read again four times a second; nothing here moves money. The island map and the
   walking scene are one tap away (remembered on this device). A list is drawn as a structure (titles, rows) and
   values put into it by key, so a moving bar never rebuilds its row and its CSS transition carries it smoothly. */
const VL = (() => {
  const H = document.documentElement, KS = KEY + '-ping-sound';
  const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let town = 'list', home = 'list', sound = get(KS, '0') === '1';   // v140: no islands, no scene
  let rows = [], lastWhole = null, seen = {}, pings = 0, coins = 0, ac = null;
  const townOn = () => town === 'list' && !$('view-budget').classList.contains('hidden');   // v140: on the main screen
  const c01 = x => Math.max(0, Math.min(1, x));
  // $16.75 with the cents a little smaller
  const cents2 = n => { const t = moneyExact(Math.floor(n * 100 + 1e-6) / 100), m = t.match(/^(.*?)([.,]\d\d)$/); return m ? `${esc(m[1])}<span class="c">${esc(m[2])}</span>` : esc(t); };
  const eta = ms => { const mins = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(mins / 60); return h ? `${h}h ${mins % 60}m` : `${mins}m`; };
  // a bar's width; when it wraps round to a new dollar it jumps back instead of sliding backwards
  function setW(el, f) {
    const pct = c01(f) * 100, old = parseFloat(el.style.width);
    if (old - pct > 25) { el.style.transition = 'none'; el.style.width = pct.toFixed(2) + '%'; void el.offsetWidth; el.style.transition = ''; }
    else el.style.width = pct.toFixed(2) + '%';
  }
  function paint(box, html) { if (box.vlHtml !== html) { box.vlHtml = html; swap(box, html); } }
  // v311 (E8): a redraw keeps keyboard focus: the focused control is found again by its id, data-* keys and classes, else
  // its stand-in (Paid and Undo, the place's other − / +, the card's head, the picker's first choice, the weekly card's button)
  function swap(box, html) {
    const a = document.activeElement, K = a && a !== box && box.contains(a) ? fKeys(a) : null;
    box.innerHTML = html; if (!K) return;
    for (const k of K) { const n = box.querySelector(k); if (n && !n.disabled && n.getClientRects().length) { n.focus({ preventScroll: true }); return; } }
  }
  function fKeys(a) {
    const q = v => CSS.escape(v), tg = a.tagName.toLowerCase(), D = a.dataset, d = [...a.attributes].filter(x => x.name.startsWith('data-')).map(x => `[${x.name}="${q(x.value)}"]`).join('');
    const K = a.id ? ['#' + q(a.id)] : [tg + d + [...a.classList].map(c => '.' + q(c)).join('')]; if (d) K.push(tg + d);
    if (D.paid || D.unslay) K.push(`[data-${D.paid ? 'unslay' : 'paid'}="${q(D.paid || D.unslay)}"]`, `[data-vl-open="bill:${q(D.paid || D.unslay)}"]`);
    if (D.crew) K.push(`[data-crew="${q(D.crew)}"]:not(:disabled)`);
    if (D.pickTo) K.push('#vlPick .vl-pk:not(:disabled)', '#vlPick [data-pp-close]', `[data-crew="${q(D.pickTo)}"][data-d="1"]`, `[data-pp-open="${q(D.pickTo)}"]`);
    const r = a.closest('[data-vl-row]'); if (r) K.push(`[data-pp-open="${q(r.dataset.vlRow)}"]`);
    if (a.closest('.vl-hero')) K.push('.vl-hero .hl-wkb:not(:disabled)', '.vl-hero [role="button"]');
    if (a.closest('.hl-wk')) K.push('.hl-wk .hl-wkb:not(:disabled)', '.hl-wk .wk-amt');
    return K;
  }
  function fill(box, v) {
    box.querySelectorAll('[data-t]').forEach(el => { const x = v['t:' + el.dataset.t]; if (x != null && el.vlT !== x) { el.vlT = x; el.innerHTML = x; } });
    box.querySelectorAll('[data-w]').forEach(el => { const x = v['w:' + el.dataset.w]; if (x != null) setW(el, x); });
  }
  function apply() {
    H.classList.toggle('tl-on', town === 'list'); H.classList.toggle('hl-on', home === 'list');
    if (home !== 'list') H.classList.remove('kp-on');
    document.querySelectorAll('[data-tview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tview === town)));
    document.querySelectorAll('[data-hview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hview === home)));
    const b = $('vlBell'); if (b) { b.setAttribute('aria-pressed', String(sound)); b.textContent = sound ? 'Sound on' : 'Sound off'; b.setAttribute('aria-label', sound ? 'Ping sound on' : 'Ping sound off'); }
  }
  apply();

  // the pay period now: what it has earned so far and how fast (the paychecks still coming in)
  function earning(now) {
    const pn = periodNow(now), live = pn.list.filter(c => c.V > 0 && now < c.t1), V = sum(live, c => c.V);
    return { pn, live, V, E: sum(pn.list, c => c.got), rate: V * WORKER_DAY / DAY_MS };
  }
  // a soft ping, only when you turned the sound on ()
  window.dcChime = () => { if (sound) chime(); };   // v193: a perfect day chimes, when the bell is on
  function chime() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(1318.5, t); o.frequency.exponentialRampToValueAtTime(1760, t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.6);
    } catch (e) {}
  }
  function ping(n) {
    pings++;
    const t = $('vlTotal'), hero = $('vlHero'); if (!t || !hero) return;
    t.classList.remove('ping'); void t.offsetWidth; t.classList.add('ping');
    const f = document.createElement('span'); f.className = 'vl-plus'; f.textContent = '+' + money(n); hero.appendChild(f); setTimeout(() => f.remove(), 1300);
    if (sound) chime();
  }
  function coin(id, n) {
    coins++;
    const r = $('townList').querySelector(`[data-vl-row="${id}"]`); if (!r) return;
    const c = document.createElement('span'); c.className = 'vl-coin'; c.textContent = '+' + money(n); r.appendChild(c); setTimeout(() => c.remove(), 1200);
    const v = r.querySelector('.pp-amt .num, .vl-r1 .num'); if (v) { v.classList.remove('vl-hit'); void v.offsetWidth; v.classList.add('vl-hit'); }
  }

  /* ---- v124: step bars. A bar fills toward the smallest of these steps that takes at least 20 seconds at the row's
     own rate, so it is always visibly moving; its width is the real balance within the step. ---- */
  const STEPS = [0.01, 0.05, 0.10, 0.25, 1], STEP_MS = 20000;
  const stepFor = r => { if (!(r > 0)) return 0; for (const st of STEPS) if (st / r >= STEP_MS - 1e-6) return st; return 1; };   // r: dollars a millisecond
  const stepName = st => st >= 1 ? money(1) : Math.round(st * 100) + '¢';
  const every = ms => { const sec = Math.round(ms / 1000); return sec < 60 ? `${sec}s` : sec < 600 ? `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ''}` : sec < 5400 ? `${Math.round(sec / 60)}m` : `${Math.round(sec / 3600)}h`; };
  const stepLine = r => { const st = stepFor(r); return `next ${stepName(st)} · every ${every(st / r)}`; };
  let live = {}, ticks = 0;
  // the engine's balance and rate at a moment (read 4x a second); frames move the bar on from there
  function snap(id, b, r, now) {
    const st = stepFor(r), L = live[id];
    if (L && L.step === st) {
      const was = L.b + L.r * Math.max(0, now - L.t);
      if (b - was > st * 0.5 && L.el) { const n = (b - was) / st; L.anim = { from: barAt(L, now), start: now, dur: Math.min(4500, Math.max(700, Math.min(n, 40) * 220)) }; }
      L.b = b; L.r = r; L.t = now;
    }
    else live[id] = { b, r, t: now, step: st, k: st ? Math.floor(b / st + 1e-9) : 0, el: null };
  }
  function tick(el, st) {
    ticks++;
    const w = el.closest('.vl-stepw'); if (!w) return;
    w.classList.remove('tk'); void w.offsetWidth; w.classList.add('tk');
    const t = Date.now(); if (t - (w.vlLast || 0) < 180) return; w.vlLast = t;
    const m = document.createElement('i'); m.className = 'vl-tkm'; m.textContent = '+' + stepName(st); w.appendChild(m); setTimeout(() => m.remove(), 950);
  }
  // every frame (and with each 4x-a-second read too, in case frames are held back)
  // v311 (E17): frames only while Home's cards are on screen (kick() starts them again); (E13) a page back from a pause
  // reads the books again before it draws, so no frame shows money from before it slept
  let rafOn = false, lastSnap = 0;
  const framesOn = () => !document.hidden && townOn() && H.classList.contains('home2') && !manageOn;
  function kick() { if (!rafOn && framesOn()) { rafOn = true; requestAnimationFrame(frame); } }
  function frame() { if (!framesOn()) { rafOn = false; return; } requestAnimationFrame(frame); const now = Date.now(); if (now - lastSnap > 5000) wake(now); moveBars(now); }
  // where the bar is, in steps: the real balance, or on its way there after a lump arrived
  function barAt(L, now) {
    const q = (L.b + L.r * Math.max(0, Math.min(now - L.t, 1000))) / (L.step || 1), A = L.anim; if (!A) return q;   // v311 (E13): a second past the last read at most
    const p = (now - A.start) / A.dur; if (p >= 1 || lessMotion()) { L.anim = null; return q; }
    return A.from + (q - A.from) * (1 - Math.pow(1 - p, 2));
  }
  function moveBars(now) {
    const box = $('townList');
    for (const [id, L] of Object.entries(live)) {
      if (!L.el || !L.el.isConnected) L.el = box.querySelector(`[data-s="${CSS.escape(id)}"]`);
      const el = L.el; if (!el) continue;
      const card = !!pipInfo[id], val = L.step ? barAt(L, now) * L.step : L.anim ? Math.min(L.b, barAt(L, now)) : L.b;   // v147: no crew: barAt is in dollars
      const vv = card && L.pour ? pourAt(id, L, now) : val;   // v148: Pour
      const DB = card && pipInfo[id].debt && pipInfo[id].debt.W ? pipInfo[id].debt : null;   // v297 (Jordan): a debt's big number is what you owe
      if (DB) { DB.owx = debtOweAt(DB.W, vv, now); DB.ow = Math.round(DB.owx * 100) / 100; }
      if (card) pipsAt(id, pipInfo[id], L, vv);   // v140; v196: rollAt after the unit bar
      if (DB) oweAt(id, DB.W, L, vv, now);   // v296
      const w = el.parentNode.parentNode, hide = !L.step && !card; if (w.hidden !== hide) w.hidden = hide;
      if (card) { if (L.pour) pourBar(w, L, vv, now); else if (DB && !(pipInfo[id].rate > 0)) debtBar(w, pipInfo[id], DB); else if (DB) { w.classList.remove('dbt-up'); w.classList.add('dbt-sv'); if (w.ubU === 'debt') w.ubU = null; unitBar(w, pipInfo[id], vv, id, L); } else unitBar(w, pipInfo[id], vv, id, L); rollAt(id, L, DB ? DB.ow : vv, now, !!DB); }   // v196   // v146: one bar toward the next cent (or 10c, $1, $10); v148: or the pour
      if (!L.step) continue;
      const q = barAt(L, now), k = Math.floor(q + 1e-9);
      el.style.width = (c01(q - k) * 100).toFixed(2) + '%';
      if (!card) dimes(w, q * L.step);   // v138
      if (k > L.k && L.step < 1 && !card) tick(el, L.step);   // a whole dollar has its own coin (and the total its ping)
      L.k = k;
    }
  }
  rafOn = true; requestAnimationFrame(frame);
  /* v140: livelier pips. The step: the smallest round amount that takes at least a day at the card's own rate. */
  const ROUND_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500], pipInfo = {};   // v144: from $1
  let bursts = 0, tops = 0, drains = 0;
  // how long to the next step: "40m", "3h 10m", past a day "2d 5h"
  const stepIn = ms => { const h = Math.floor(Math.max(1, Math.ceil(ms / 60000)) / 60); return h >= 24 ? `${Math.floor(h / 24)}d${h % 24 ? ' ' + (h % 24) + 'h' : ''}` : eta(ms); };
  const roundStep = perDay => { if (!(perDay > 0)) return ROUND_STEPS[0]; for (const S of ROUND_STEPS) if (S >= perDay / 24 - 1e-9) return S;   /* v144: at least an hour, not a day */ return ROUND_STEPS[ROUND_STEPS.length - 1]; };
  // the 10 pips toward the next step, from a live balance (to the cent, rounded down); a step filling bursts
  const c10 = x => Math.max(0, Math.min(10, x));
  function pipsAt(id, info, L, val) {
    let el = L.pipEl; if (!el || !el.isConnected) el = L.pipEl = $('townList').querySelector(`[data-pip="${CSS.escape(id)}"]`);
    if (!el) return;
    // v146: toward the whole goal (no goal: the next round $100), from the floored cents
    const c = Math.max(0, Math.floor(val * 100 + 1e-6)), Gc = info.g > 0 ? Math.round(info.g * 100) : 10000;
    const dq = info.debt && info.debt.ow != null && info.debt.lim > 0 ? Math.max(0, Math.min(10, info.debt.ow / info.debt.lim * 10))   // v298 (Jordan): of the limit
      : info.debt && info.debt.ow != null && info.debt.start > 0 ? Math.max(0, Math.min(10, info.debt.ow / info.debt.start * 10))   // v297: what's still owed, running down
      : info.debt && info.debt.start > 0 ? Math.max(0, Math.min(10, (info.debt.start - info.debt.owed + c / 100) / info.debt.start * 10)) : null;   // v295: paid off so far, the extra saved too
    if (info.debt && info.debt.ow != null && !info.done) {   // v301 (Jordan's drawing): blue = owed, orange = saved to pay it, empty = room to the limit
      const D = info.debt.lim > 0 ? info.debt.lim : info.debt.start, P = c10(info.debt.ow / D * 10), Sv = Math.min(P, c10(Math.max(0, val) / D * 10)), k = Math.floor(P + 1e-9);
      const P2 = el.children, sig = [];
      for (let i = 0; i < Math.min(10, P2.length); i++) { const o = Math.round(c01(Sv - i) * 1000) / 10, b = Math.round(c01(P - i) * 1000) / 10; sig.push(o, b);
        if (P2[i].className !== 'dq') P2[i].className = 'dq'; if (P2[i].dqO !== o) { P2[i].dqO = o; P2[i].style.setProperty('--o', o + '%'); } if (P2[i].dqB !== b) { P2[i].dqB = b; P2[i].style.setProperty('--b', b + '%'); } }
      el.ppKey = sig.join(',');
      if (L.pk != null && L.pkS === 'dq' && k === L.pk - 1 && !L.pour) stepBurst(el);   // a pip of what you owe goes out
      L.pk = k; L.pkS = 'dq'; return;
    }
    const f = info.done ? 10 : dq != null ? dq : info.g > 0 ? Math.min(10, c / Gc * 10) : (c % Gc) / Gc * 10, on = Math.min(10, Math.floor(f + 1e-9)), part = info.done || on >= 10 ? 0 : Math.floor((f - on) * 100);
    const k = info.g > 0 ? on : Math.floor(c / Gc) * 10 + on, S = Gc;
    const key = on + ':' + part;
    if (el.ppKey !== key) {
      el.ppKey = key; const P = el.children;
      for (let i = 0; i < Math.min(10, P.length); i++) { const cls = i < on ? 'on' : i === on && part > 0 ? 'part' : ''; if (P[i].className !== cls) P[i].className = cls; if (cls === 'part') P[i].style.setProperty('--p', part + '%'); }
    }
    if (!info.done && info.rate > 0 && L.pk != null && L.pkS === S && (dq != null && info.debt.ow != null ? k === L.pk - 1 : k === L.pk + 1) && !L.pour) stepBurst(el);   // v297: a debt's pip going out
    L.pk = k; L.pkS = S;
  }
  // v296: the debt's "Owe", to the cent: interest building up, the extra coming off
  function oweAt(id, W, L, val, now) {
    let el = L.oweEl; if (!el || !el.isConnected) el = L.oweEl = $('townList').querySelector(`[data-owe="${CSS.escape(id)}"]`);
    if (!el) return;
    const t = moneyExact(Math.round(debtOweAt(W, val, now) * 100) / 100); if (el.textContent !== t) el.textContent = t;
  }
  function stepBurst(el) {
    bursts++; if (lessMotion()) return;
    const x = document.createElement('span'); x.className = 'pp-burst'; x.setAttribute('aria-hidden', 'true');
    x.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join(''); el.appendChild(x); setTimeout(() => x.remove(), 1000);
  }
  /* v146: the unit bar. One bar toward the next cent; a place earning a cent in under 10 seconds counts in 10c, then $1,
     then $10. Its whole units come from the floored cents (as the amount above it), its part from the money in. */
  const UNITS = [0.01, 0.1, 1, 10], UNIT_MS = 10000;
  const unitFor = r => { if (!(r > 0)) return UNITS[0]; for (const u of UNITS) if (u / r >= UNIT_MS - 1e-6) return u; return UNITS[UNITS.length - 1]; };   // r: dollars a millisecond
  const unitWord = u => u >= 1 ? money(u) : u >= 0.1 ? '10¢' : 'cent';
  const unitTag = u => u >= 1 ? money(u) : Math.round(u * 100) + '¢';
  const shortIn = ms => { const sec = Math.max(1, Math.ceil(ms / 1000)); return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m${sec % 60 && sec < 600 ? ` ${sec % 60}s` : ''}` : stepIn(ms); };
  let fills = 0, sweeps = 0, cglows = 0; const SWEEP_MS = 520;   // v200: the fill animation's length; v205 the pour into the goal
  // v298 (Jordan: "ticking up to when a cent is added to how much you owe")
  function debtBar(w, info, DB) {
    const bar = w.querySelector('.pp-ubar i'); if (!bar) return;
    const c = Math.max(0, DB.owx) * 100, k = Math.floor(c + 1e-6), fr = c - k;
    let pct = Math.floor(fr * 1000) / 10;   // growing it fills, paying down it drains
    if (w.ubU !== 'debt') { w.ubU = 'debt'; w.querySelector('.pp-ul').textContent = '1¢'; w.dbK = null; }
    if (w.dbK != null && k !== w.dbK && Math.abs(k - w.dbK) < 100 && !lessMotion()) {
      const t = Date.now(); if (t - (w.ubLast || 0) > 180) { w.ubLast = t; const m = document.createElement('i'); m.className = 'vl-tkm' + (k < w.dbK ? ' dn' : ' upc'); m.textContent = (k < w.dbK ? '−' : '+') + (Math.abs(k - w.dbK) === 1 ? '1¢' : Math.abs(k - w.dbK) + '¢'); w.appendChild(m); setTimeout(() => m.remove(), 950); }
    }
    w.dbK = k; w.classList.toggle('dbt-up', true); w.classList.remove('dbt-sv');
    if (w.ubP !== pct) { w.ubP = pct; bar.style.width = pct + '%'; pipOn(w, bar.parentNode, pct); }
  }
  function unitBar(w, info, val, id, L) {
    const bar = w.querySelector('.pp-ubar i'); if (!bar || !info) return;
    const U = info.U, Uc = Math.round(U * 100), v = Math.max(0, val) * 100, k = Math.floor((v + 1e-6) / Uc), part = Math.max(0, Math.min(1, (v - k * Uc) / Uc));
    let pct = Math.floor(part * 1000) / 10;   // a tenth of a percent, rounded down
    if (w.ubU !== U) { w.ubU = U; w.querySelector('.pp-ul').textContent = unitTag(U); w.ubK = null; }
    if (w.ubK != null && k > w.ubK && k - w.ubK < 1000) {   // a unit (or a few, as a lump rolls in) filled the bar
      fills++; ticks++;   // ticks: the bar's ping, as the hidden step bar's tick counted before
      if (!lessMotion() && L && w.ubU === U && k - w.ubK === 1) {   // v196: the light runs down the pips, then the amount ticks up and lights
        const t = Date.now(), ub = bar.parentNode; w.ubHold = t + SWEEP_MS; L.cHold = t + SWEEP_MS; L.cFrom = L.rlEl && L.rlEl.isConnected ? L.rlEl.pc : null; L.cU = U; sweeps++;
        for (const r of [0, 1]) { const b = document.createElement('b'); b.className = 'pp-pour' + (r ? ' r2' : ''); ub.appendChild(b); setTimeout(() => b.remove(), SWEEP_MS + 100); }   // v205: both rows pour out
        setTimeout(() => { const pe = L.pipEl && L.pipEl.isConnected ? L.pipEl : null, g = pe && (pe.querySelector('i.part') || [...pe.querySelectorAll('i.on')].pop() || pe.firstElementChild);
          if (g) { g.classList.remove('pp-gfeed'); void g.offsetWidth; g.classList.add('pp-gfeed'); setTimeout(() => g.classList.remove('pp-gfeed'), 1000); } }, SWEEP_MS - 80);   // into the goal

      }
      if (!lessMotion()) {
        const t = Date.now(); if (t - (w.ubLast || 0) > 180) { w.ubLast = t; const m = document.createElement('i'); m.className = 'vl-tkm' + (info.debt ? ' svc' : ''); m.textContent = '+' + unitTag(U); w.appendChild(m); setTimeout(() => m.remove(), 950); }
      }
    }
    w.ubK = k; if (w.ubHold && Date.now() < w.ubHold) pct = 0; else w.ubHold = 0;   // v199: the ripple paints the bar while it runs
    if (w.ubP !== pct) { w.ubP = pct; bar.style.width = pct + '%'; pipOn(w, bar.parentNode, pct); }
  }
  /* v166: whole pips only; a pip that comes on flashes, then settles */
  function pipOn(w, ub, pct) {
    const k = Math.floor(pct + 1e-6), was = w.ubPip; if (was === k) return; w.ubPip = k; ub.style.setProperty('--p', k);
    if (was == null || k <= was || k - was > 3 || lessMotion()) return;
    const t = Date.now(); if (t - (w.ubFl || 0) < 70) return; w.ubFl = t;
    const i = k - 1, f = document.createElement('b'), cw = ub.clientWidth / 50; f.className = 'pp-flash';
    f.style.left = (ub.offsetLeft + (i % 50) * cw) + 'px'; f.style.width = Math.max(2, cw - 2) + 'px'; f.style.top = (ub.offsetTop + (i < 50 ? 0 : 8)) + 'px';
    ub.parentNode.appendChild(f); setTimeout(() => f.remove(), 1000);   // v191: above the pixel mask, so the glow shows
  }
  /* v148: Pour (the "pour" concept). A card's new money pours into its unit bar, which counts in $1 while it pours (in
     $10 or $100 when the lump would fill it more than 4 times). The fill eases out over POUR_MS with a glowing front;
     each unit completed holds the bar full (the first three), shines it, pops the amount gold and nudges the goal pip.
     When it is in, one last shine, then the bar goes back to its own unit. It never shows more than the money: it
     eases up from where the card was to the live balance. */
  const POUR_GAP = 260, POUR_MS = 750, POUR_HOLD = 480, POUR_SHINE = 700, POUR_GLOW = 420, POUR_HOLDS = 3;
  let pours = 0, shines = 0, nudges = 0;
  const liveVal = (L, now) => L.b + (L.r || 0) * Math.max(0, Math.min(now - L.t, 1000));   // v311 (E13): a second past the last read at most
  function pourOne(id, cents, delay, up) {
    const L = live[id]; if (!L || !pipInfo[id] || !(cents > 0)) return false;
    const now = Date.now(), real = liveVal(L, now), from = real + (up ? -cents : cents) / 100;   // v311 (E3): from where it was, below zero too
    let U = Math.max(1, pipInfo[id].U || 0); while (cents / 100 / U > 4 && U < 100) U *= 10;
    L.anim = null; L.pour = { t0: now + delay, from, U, up, u: Math.floor((from * 100 + 1e-6) / (U * 100)), held: 0, hold: 0, holds: 0, at: from, end: 0, hist: [] };
    pours++; return true;
  }
  function clearPours() { for (const L of Object.values(live)) if (L.pour) { L.pour = null; const w = L.el && L.el.isConnected && L.el.parentNode.parentNode; if (w) { w.ubU = null; w.ubP = null; const g = w.querySelector('.pp-glow'); if (g) g.style.opacity = 0; } } }
  // the pour's value now (and its unit's moment: hold, shine, pop, nudge)
  function pourAt(id, L, now) {
    const P = L.pour, real = liveVal(L, now);
    if (now < P.t0) return P.from;
    if (P.end) { if (now - P.end >= POUR_SHINE) { L.pour = null; const w = L.el && L.el.parentNode.parentNode; if (w) { w.ubU = null; w.ubP = null; } } return real; }
    if (P.hold) { if (now < P.hold) return P.at; P.hold = 0; P.hist = []; }
    const k = Math.min(1, (now - P.t0 - P.held) / POUR_MS), v = P.from + (real - P.from) * (1 - Math.pow(1 - k, 3));
    if (P.up) {
      const u = Math.floor((v * 100 + 1e-6) / (P.U * 100));
      if (u > P.u) {   // a unit filled
        P.u = u; fills++; pourFx(id, L, true);
        if (P.holds < POUR_HOLDS) { P.holds++; P.at = u * P.U; P.hold = now + POUR_HOLD; P.held += POUR_HOLD; P.full = true; return P.at; }
      }
    }
    if (k >= 1) { P.end = now; pourFx(id, L, false); return real; }
    return v;
  }
  function pourFx(id, L, unit) {
    const w = L.el && L.el.isConnected && L.el.parentNode.parentNode, ub = w && w.querySelector('.pp-ubar');
    if (ub) { shines++; const sh = document.createElement('b'); sh.className = 'pp-shine'; ub.appendChild(sh);
      sh.animate([{ backgroundPosition: '100% 0', opacity: 1 }, { backgroundPosition: '-60% 0', opacity: 0 }], { duration: 700, easing: 'ease' }).onfinish = () => sh.remove(); }
    if (!unit) return;
    const a = L.rlEl && L.rlEl.isConnected ? L.rlEl : null;
    if (a) a.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', color: 'var(--pp-gold)', offset: .35 }, { transform: 'scale(1)' }], { duration: 500, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    const pe = L.pipEl && L.pipEl.isConnected ? L.pipEl : null, pip = pe && (pe.querySelector('i.part') || [...pe.querySelectorAll('i.on')].pop() || pe.firstElementChild);
    if (pip) { nudges++; pip.animate([{ transform: 'none' }, { transform: 'scaleY(1.5)', filter: 'brightness(1.25)', offset: .4 }, { transform: 'none' }], { duration: 600, easing: 'ease' }); }
  }
  // the unit bar while it pours: its unit labelled, full while it holds, a glowing front over the last POUR_GLOW ms
  function pourBar(w, L, v, now) {
    const P = L.pour, bar = w.querySelector('.pp-ubar i'); if (!bar || !P) return;
    const ub = bar.parentNode; let g = ub.querySelector('.pp-glow'); if (!g) { g = document.createElement('b'); g.className = 'pp-glow'; ub.appendChild(g); }
    if (w.ubU !== 'pour' + P.U) { w.ubU = 'pour' + P.U; w.ubK = null; w.querySelector('.pp-ul').textContent = unitTag(P.U); }
    const Uc = P.U * 100, c = Math.max(0, v) * 100, k = Math.floor((c + 1e-6) / Uc);
    const pct = P.hold && now < P.hold ? 100 : Math.floor(Math.max(0, Math.min(1, (c - k * Uc) / Uc)) * 1000) / 10;
    if (w.ubP !== pct) { w.ubP = pct; bar.style.width = pct + '%'; pipOn(w, ub, pct); }
    // the glow: from where the front was POUR_GLOW ms ago to where it is (pale at the front, the card color behind)
    const H = P.hist; if (!P.end && P.up && now >= P.t0) { if (!H.length || H[H.length - 1][1] <= pct) H.push([now, pct]); else H.length = 0; }
    while (H.length > 1 && H[0][0] < now - POUR_GLOW) H.shift();
    const g0 = H.length ? H[0][1] : pct, gw = P.up && !P.end ? pct - g0 : 0;
    { const top = pct <= 50, a0 = top ? g0 * 2 : Math.max(0, (g0 - 50) * 2), a1 = top ? pct * 2 : (pct - 50) * 2;   // v161: the row the front is on
      g.style.left = a0 + '%'; g.style.width = Math.max(0, gw > 0 ? a1 - a0 : 0) + '%'; g.style.top = top ? '0' : '8px'; g.style.height = '6px'; g.style.bottom = 'auto'; } g.style.opacity = gw > 0.2 || (P.hold && now < P.hold) ? 1 : 0;
  }
  /* v142: the penny strip. 10 segments of 1 cent toward the next 10 cents: the whole cents filled (floored, never ahead
     of the money), the next one filling with the sub-cent part. A segment filling pops; a 10-cent wrap glints. */
  let pops = 0, glints = 0;
  /* v142: rolling digits on the card amount. Each digit is a wheel (0-9, then 0 again for the roll past 9). It shows
     the floored cents; a digit that changes rolls there over RL_MS; the last one creeps up by up to RL_SUB of a digit
     with the sub-cent part. The real amount is in a hidden text for screen readers and copying. */
  /* v144: plain cents with a ping each time one lands (the wheels below are kept but no longer called) */
  function rollAt(id, L, val, now, debt) {
    let el = L.rlEl; if (!el || !el.isConnected) { el = L.rlEl = $('townList').querySelector(`[data-rl="${CSS.escape(id)}"]`); if (el) el.pc = null; }
    if (!el) return;
    let C = Math.floor(val * 100 + 1e-6), lit = false;   // v311 (E3): below zero too, so a shortfall shows
    if (L.cHold && !debt) { if (Date.now() < L.cHold && L.cFrom != null) C = Math.min(C, L.cFrom); else { lit = true; L.cHold = 0; } }   // v196: wait for the light
    if (debt) C = Math.round(Math.max(0, val) * 100);   // v297: what you owe, to the nearest cent
    if (el.pc === C) return;
    if (debt && el.pv == null) el.pv = el.pc;
    const first = el.pc == null; el.pc = C; el.innerHTML = C < 0 ? '−' + cents2(-C / 100) : cents2(C / 100); el.classList.toggle('bad', C < 0);   // v311 (E3): −$12.34
    if (lit && !first) { cglows++; const c = L.cU < 1 && el.querySelector('.c') || el; c.classList.add('pp-cglow'); return; }   // v196: the cents light up like a pip
    if (debt) { const dn = el.pv != null && C < el.pv; el.pv = C; if (!first && !lessMotion()) { el.classList.remove('pp-ping', 'pp-dn', 'pp-up'); void el.offsetWidth; el.classList.add(dn ? 'pp-dn' : 'pp-up'); } return; }   // v297
    if (!first && !lessMotion() && !L.pour) { el.classList.remove('pp-ping'); void el.offsetWidth; el.classList.add('pp-ping'); }
  }
  /* v138: the gold strip under a card's pips, from the same live balance as the bar above: a segment for each 10 cents
     of the dollar it is on, and the next one filling. */
  function dimes(w, b) {
    const S = w.querySelectorAll('.pp-segs i'); if (!S.length) return;
    const c = Math.max(0, b - Math.floor(b + 1e-9)) * 10, on = Math.min(9, Math.floor(c + 1e-9)), part = Math.round((c - on) * 100);
    if (w.ppOn !== on) { w.ppOn = on; S.forEach((x, i) => { x.className = i < on ? 'on' : i === on ? 'cur' : ''; }); }
    if (w.ppPart !== part) { w.ppPart = part; w.style.setProperty('--p', part + '%'); }
  }

  // v131: a pot's or project's crew controls beside its row: the lock, then - n +
  let pickFor = null;   // v134: the row whose picker is open
  /* ---- v138: the Town list as cards (ideas/pots-projects-concept.html) ----
     The villagers card on top (them in fives per place, the total, a verdict), Collect and Round off, then a card per
     pot (Savings first) and project: 10 pips toward the goal, the gold 10¢ strip, the crew. Tap a card for more. */
  const opened = new Set();   // the cards tapped open
  let pickIn = false;         // the picker sheet slides up only as it opens, not on each redraw
  // the "Take one from" picker as a bottom sheet: each place that has villagers and its count (locked ones can't be tapped)
  /* v190: Manage workers: every place on one screen, its villagers, what it gets a month, and − / + */
  let manageOn = false, cuSav = null;   // v311 (E11): cuSav, whether the last drawing had the Savings card
  const payLen = () => { const c = periodNow().list[0]; return c && c.days ? c.days : 14; };   // v195: this pay period's days
  const perMo = w => Math.floor(w * WORKER_DAY * payLen());   // v195: a paycheck, not a month
  function manageHTML(D, PC, CK) {
    const V = maxWorkers(), np = partyNow(), sv = savers(), sq = (w, c) => `<span class="mw-sq" style="--cc:${c}" aria-hidden="true">${'<i></i>'.repeat(Math.min(w, 40))}${w > 40 ? `<em>+${w - 40}</em>` : ''}</span>`;
    const places = [['party', 'Weekly spending', np, 'var(--pal-pk, #f594c3)'] /* v245 (Jordan): pink like the weekly card */, ['savings', 'Savings', sv, PC[CK.savings] || '#ff6fae'],
      ...D.stock.filter(x => x.id !== 'savings').map(x => [x.id, x.name, Math.max(0, workersAt(x.id)), PC[CK[x.id]] || '#ff6fae']),
      ...D.projects.map(x => [x.id, x.name, Math.max(0, workersAt(x.id)), PC[CK[x.id]] || '#6fc0ff'])];
    const shown = places.filter(x => x[2] > 0), tot = sum(shown, x => x[2]);
    let h = `<div class="mw-top"><button class="pp-chip" data-mw="0">‹ Back</button><h3 class="pp-h2">Split your pay</h3></div>`
      + `<section class="pp-panel mw-sum" aria-label="All your money a day"><div class="mw-row1"><span><b class="num">${money(V * WORKER_DAY)}</b> a day</span><span class="num">${money(perMo(V))} a paycheck</span></div>`
      + (tot ? (() => {   // v247 (Jordan): the villagers as Tetris pieces, one per place, in its color
          const H = 4, cells = []; shown.forEach(([id, nm, w, c]) => { for (let k = 0; k < w; k++) cells.push({ o: id, c, nm }); });
          const C = Math.ceil(cells.length / H), at = (r, c) => r < 0 || r >= H || c < 0 || c >= C ? null : cells[c * H + r] || null; let g = '';
          for (let r = H - 1; r >= 0; r--) for (let c = 0; c < C; c++) { const q = at(r, c); if (!q) { g += '<i class="e"></i>'; continue; }
            const same = (rr, cc) => { const n = at(rr, cc); return n && n.o === q.o; };
            g += `<i class="own pk-own${same(r + 1, c) ? ' t' : ''}${same(r - 1, c) ? ' b' : ''}${same(r, c - 1) ? ' l' : ''}${same(r, c + 1) ? ' r' : ''}" style="--pc:${q.c}"></i>`; }
          return `<span class="bg3-grid mw-grid" role="img" aria-label="${esc(shown.map(x => `${x[1]} ${money(x[2] * WORKER_DAY)} a day`).join(', '))}" style="--C:${C}">${g}</span>`; })() : '')
      + (() => { const n = nextPayNow(); if (!n || !n.entered) return ''; const need = np + crewWorkers(), short = n.V < need;   // v192
          return `<p class="mw-next${short ? ' short' : ''}">From ${shortDate(n.date)}: ${money((n.V) * WORKER_DAY)} a day${short ? `, ${n.V < V ? `${money((V - n.V) * WORKER_DAY)} a day less` : 'less than you use'}. ${money((need - n.V) * WORKER_DAY)} a day comes off projects first, then pots, on payday.` : n.V > V ? `, ${money((n.V - V) * WORKER_DAY)} a day more to place.` : ', same as now.'}</p>`; })()
      + `<p class="mw-note">${sv ? `${money((sv) * WORKER_DAY)} a day free in Savings. Tap + on a place to move $1 a day there.` : 'Nothing free in Savings. Tap − on a place to bring $1 a day back first.'}</p></section><div class="mw-list">`;
    for (const [id, nm, w, c] of places) {
      const party = id === 'party', home = id === 'savings', L = !party && !home && isLocked(id), add = !party && !home && canAdd(id);
      const ctl = party ? `<button class="pp-chip mw-go" data-mw="budget">Change</button>`
        : home ? ''
        : `<span class="pp-step"><button class="vl-sb" data-crew="${esc(id)}" data-d="-1" aria-label="$1 a day from ${esc(nm)} back to Savings"${L || !w || state.roundOff ? ' disabled' : ''}>−</button><b class="num">${money(w * WORKER_DAY)}</b>`
          + `<button class="vl-sb" data-crew="${esc(id)}" data-d="1" aria-label="Add $1 a day to ${esc(nm)}"${add ? '' : ' disabled'}>+</button></span>`;
      const sub = party ? `${money(perMo(w))} a paycheck · changes start Monday` : home ? `${money(perMo(w))} a paycheck · money nobody's using lands here${billsMonthWhole() > 0 ? ', and fills your month cushion first' : ''}` : `${money(perMo(w))} a paycheck${L ? ' · locked' : ''}`;
      h += `<div class="pp-card mw-card${w > 0 ? ' live' : ' idle'}" style="--cc:${c}"><div class="mw-l"><span class="mw-nm"><b>${esc(nm)}</b>${party || home ? ` <small class="num">${money(w * WORKER_DAY)} a day</small>` : ''}</span>${sq(w, c)}<small class="mw-mo">${sub}</small></div>${ctl}</div>`;
    }
    return h + `</div><button class="pp-big alt pp-add" data-mw="0">Done</button>`;
  }
  function setManage(on) {
    manageOn = !!on; pickFor = null; H.classList.toggle('mw-on', manageOn); if (manageOn) live = {};   // v311 (E17): no cards to draw here
    renderTown(); const sc = $('mainScroll'); if (sc) sc.scrollTo(0, 0);
  }
  function pickSheet(to) {
    const L = donorList(to).filter(x => x.n > 0), nm = esc(potName(to)), anim = pickIn; pickIn = false;
    return `<div class="pp-sheet${anim ? ' in' : ''}" id="vlPick"><div class="pp-box" role="dialog" aria-modal="true" aria-labelledby="vlPickT">`
      + `<h3 class="pp-h2" id="vlPickT">Take one for ${nm} from…</h3><p>Tap a place to move $1 a day from it. Tap again for another.</p>`
      + `<div class="vl-pick" role="group" aria-label="Move money a day from">`
      + (L.length ? L.map(x => `<button class="vl-pk pp-from" data-pick-from="${esc(x.id)}" data-pick-to="${esc(to)}"${x.lock ? ' disabled' : ''} aria-label="$1 a day from ${esc(x.name)} ($${x.n} a day there)${x.lock ? ', locked' : ''}"><span class="pp-fn">${x.lock ? '' : ''}${esc(x.name)}</span><span class="pp-x"> · </span><b class="pp-fc">${x.n}</b></button>`).join('')
        : '<p>Nobody to take: everyone is on weekly spending.</p>')
      + `</div><button class="pp-big alt" data-pp-close="1">Done</button></div></div>`;
  }
  /* ---- the Town list ---- */
  const planChip = () => plan ? '<span class="pp-plan on">Planning</span>' : '<button class="pp-plan" data-plan-go="1">Plan</button>';
  function townHTML(now) {
    const D = Town.data; if (!D) return '';
    const e = earning(now), R = [];
    // a pot's or project's card. kind: 'save' (Savings), 'pot' or 'proj'
    const PC = palColors(), PCN = Object.keys(PC).filter(k => k !== 'pink');   // v232: pink is the weekly budget's   // v153; v214 from the palette
    const PDEF = { pot: ['amber', 'coral', 'purple', 'mint', 'blue', 'pink'], proj: ['blue', 'purple', 'mint', 'amber', 'coral', 'pink'] }, CK = {};
    { let ip = 0, ij = 0; for (const x of D.stock) CK[x.id] = x.id === 'savings' ? 'mint' : PDEF.pot[ip++ % 6]; for (const x of D.projects) CK[x.id] = PDEF.proj[ij++ % 6];
      for (const id of Object.keys(CK)) { const c = (state.colors || {})[id]; if (PC[c]) CK[id] = c; }
      // v232: every card its own color: your picks first, then the rest take what's left; pink stays the weekly budget's
      const own = ['amber', 'purple', 'coral', 'blue', 'mint'], fam = k => k === 'mint' ? 'blue' : k, seen = new Set(), picked = id => id === 'savings' ? -1 : PC[(state.colors || {})[id]] ? 0 : 1;   // mint and blue read alike: one at a time
      const kept = id => state.colorsV >= 234 && PC[(state.colors || {})[id]] && (state.colors || {})[id] !== 'pink';   // v234: once saved, your pick always wins
      for (const id of Object.keys(CK)) if (kept(id)) seen.add(fam(CK[id]));
      for (const id of Object.keys(CK).sort((a, b) => picked(a) - picked(b))) { if (kept(id)) continue; let c = CK[id];
        if (c === 'pink' || seen.has(fam(c))) c = own.find(k => !seen.has(fam(k))) || own[seen.size % own.length]; CK[id] = c; seen.add(fam(c)); }
      if (!(state.colorsV >= 234)) { state.colors = Object.assign({}, CK); state.colorsV = 234; save(); }
      for (const x of D.stock) CK[x.id] = 'mag'; for (const x of D.projects) CK[x.id] = 'teal'; }   /* v260 (look F): pots magenta, projects teal */   /* v258 (Jordan): pots and Savings purple, projects blue */   // v240 (mint is the palette's true sky blue; 'blue' reads teal) (Jordan): color by kind, pots orange, projects blue; old picks kept in state but unused
    if (manageOn) { const pick = pickFor && canAdd(pickFor) ? pickSheet(pickFor) : ''; H.classList.toggle('pp-pick', !!pick); rows = []; return manageHTML(D, PC, CK) + pick; }   // v190   // v184: colors per card again (Jordan), v163 defaults   // v163: one map for the cards and the villagers bar
    // v300: the month cushion: the first month of bills in Savings. While it fills, it stands in for the Savings card.
    const CU = (() => { const T = billsMonthWhole(), raw = (potBalances(today().slice(0, 7), now).find(p => p.id === 'savings') || { bal: 0 }).bal;
      return { T, on: T > 0, sav: !(T > 0) || raw > T + 0.005 }; })(); cuSav = CU.sav;   // v311 (E11)
    const cushCard = () => {
      if (!CU.on) return '';
      R.push({ id: 'cushion', name: 'Month cushion', goal: CU.T, cush: true });
      const col = document.documentElement.classList.contains('look-b') ? 'var(--rf-coral, #ff8a80)' : PC[CK.savings] || PC.coral;
      return `<div class="pp-card pot sv cush ${!CU.sav && savers() > 0 ? 'live' : 'idle'}${opened.has('cushion') ? ' open' : ''}" style="--cc:${col}" data-vl-row="cushion">`
        + `<button class="pp-head" data-pp-open="cushion" aria-expanded="${opened.has('cushion')}"><span class="pp-nm"><em class="pp-kind" data-t="cu-kind"></em><span class="pp-nmr"><b>Month cushion</b>${(() => { const w = CU.sav ? 0 : Math.max(0, savers()); return w > 0 ? `<span class="pp-vsq" role="img" aria-label="${money(w * WORKER_DAY)} a day">${'<i></i>'.repeat(Math.min(w, 40))}${w > 40 ? `<em>+${w - 40}</em>` : ''}</span>` : ''; })()}</span></span>`
        + `<span class="pp-amt"><span class="num pp-roll" data-rl="cushion"></span><small data-t="of-cushion"></small></span></button>`
        + `<p class="cu-plan" data-t="sv-plan"></p>`   // v322
        + `<div class="pp-pips ember" data-t="p-cushion" data-pip="cushion" aria-hidden="true"></div>`
        + `<span class="vl-stepw pp-dime" aria-hidden="true"><span class="pp-unit"><span class="pp-ubar"><i></i></span><b class="pp-ul"></b></span><span class="vl-step"><span data-s="cushion"></span></span></span>`
        + `<div class="cu-marks" data-t="cu-marks"></div><p class="cu-cap">Next month's bills, locked in as it fills</p><div class="cu-locks" data-t="cu-locks"></div><p class="cu-say" data-t="cu-say"></p><div class="pp-xv" data-x="cushion"></div></div>`;
    };
    const card = (o, kind) => {
      const col = CK[o.id] || (kind === 'proj' ? 'blue' : 'pink');
      R.push(o); const id = esc(o.id), nm = esc(o.name), sv = kind === 'save', L = !sv && isLocked(o.id), done = kind === 'proj' && o.bal >= o.goal - 0.005;
      const po = kind === 'proj' && !(o.goal > 0) && paidOff(o.id), pays = kind === 'proj' ? debtPays(o.id) : [];   // v147
      const w = sv ? savers() : Math.max(0, workersAt(o.id)), open = opened.has(o.id), add = !sv && canAdd(o.id);
      const who = `${money(w * WORKER_DAY)} a day${L ? '<span class="pp-lk">locked</span>' : ''}`;
      const step = sv ? ''
        : `<span class="pp-step"><button class="vl-sb" data-crew="${id}" data-d="-1" aria-label="$1 a day from ${nm} back to Savings"${L || !w || state.roundOff ? ' disabled' : ''}>−</button><b class="num">${w}</b>`
          + `<button class="vl-sb${pickFor === o.id && add ? ' on' : ''}" data-crew="${id}" data-d="1" aria-haspopup="dialog" aria-expanded="${pickFor === o.id && add}" aria-label="Add $1 a day to ${nm}: pick where from"${add ? '' : ' disabled'}>+</button></span>`;
      const ed = !sv && Town.editing === o.id;   // v269: its Edit is open
      const db = !sv && debtOf(o.id);   // v295
      const note = sv ? 'Money you take off a pot or project comes back here.' : po ? 'Paid off. Nothing left to pay.' : done ? 'Goal reached. The money is ready when you are.' : kind === 'pot' ? 'A pot keeps what it saves. Nothing here gets spent.' : 'Saving up for it, then spending it.';
      return `<div class="pp-card ${kind === 'proj' ? 'proj' : 'pot'}${db ? ' debt' : ''}${sv ? ' sv' : ''} ${w > 0 || (db && !db.done) ? 'live' : 'idle'}${done ? ' done' : ''}${open ? ' open' : ''}${L ? ' locked' : ''}" style="--cc:${PC[col]}" data-vl-row="${id}">`
        + `<button class="pp-head" data-pp-open="${id}" aria-expanded="${open}" aria-controls="ppm-${id}">`   // v148: name left, amount right
        + `<span class="pp-nm"><em class="pp-kind">${db ? (po ? 'Debt · paid off' : done ? 'Debt · enough saved to pay it off' : 'Debt') : kind === 'proj' ? (po ? 'Project · paid off' : done ? 'Project · goal reached' : 'Project') : 'Pot'}</em><span class="pp-nmr"><b>${nm}</b>${w > 0 ? `<span class="pp-vsq" role="img" aria-label="${money((w) * WORKER_DAY)} a day">${'<i></i>'.repeat(Math.min(w, 40))}${w > 40 ? `<em>+${w - 40}</em>` : ''}</span>` : ''}</span></span>`   // v183: a square per villager   // v174
        + `<span class="pp-amt"><span class="num pp-roll" data-rl="${id}"></span><small data-t="of-${id}"></small></span></button>`
        + `<div class="pp-pips${kind === 'proj' ? '' : ' ember'}" data-t="p-${id}" data-pip="${id}" aria-hidden="true"></div>`
        + (db ? `<p class="pp-dl" data-t="dl-${id}"></p>` : '')   // v295: the debt's line
        + `<span class="vl-stepw pp-dime" aria-hidden="true"><span class="pp-unit"><span class="pp-ubar"><i></i></span><b class="pp-ul"></b></span><span class="vl-step"><span data-s="${id}"></span></span></span>`
        + (!sv || !CU.sav ? '' : `<p class="cu-plan" data-t="sv-plan"></p>`)   // v322
        + (!sv ? '' : `<div class="pp-meta pp-tidy"><span class="pp-m1"><span data-t="m1-${id}"></span><span class="pp-dot" aria-hidden="true"> · </span><span class="pp-nx" data-t="nx-${id}"></span></span><button class="pp-fill" data-fill="${id}" data-t="fl-${id}"></button></div>`)   // v148: one line; v269: Savings only
        + `<div class="pp-crew"><span class="pp-who vl-r2">${who}<small class="pp-mo" data-t="m2-${id}"></small></span>${step}</div>`   // v148: the month figure with the crew
        + (!sv ? `<div class="pp-acts" id="ppm-${id}">${kind === 'proj' && o.goal > 0 && o.bal >= 0.01 ? (db ? (o.bal >= 1 - 1e-6 ? `<button class="pp-chip pp-pay" data-debt="${id}">I paid ${debtPayText(o.id, o.goal, o.bal)}</button>` : '') : `<button class="pp-chip pp-pay" data-debt="${id}">Make a payment</button>`) : ''}`
          + `<button class="pp-fill" data-fill="${id}" data-t="fl-${id}"></button><button class="pp-chip pp-edit${ed ? ' on' : ''}" data-edit="${id}" aria-expanded="${ed}" aria-label="Edit ${nm}">Edit</button></div>`   // v269 (Jordan's concept): its other details are gone
        : `<div class="pp-more" id="ppm-${id}"${open ? '' : ' hidden'}><p data-t="go-${id}"></p><p data-t="eta-${id}"></p><p class="pp-with" data-t="eta1-${id}"></p>`
        + `<p class="pp-small" hidden><span data-t="sl-${id}"></span> <span data-t="n1-${id}"></span></p><p class="pp-small">${note}</p>`
        + `<div class="pp-chips">${sv ? '' : `<button class="pp-chip${L ? ' on' : ''}" data-lock="${id}" aria-pressed="${L}" aria-label="${L ? 'Unlock' : 'Lock'} ${nm}">${L ? 'Locked · tap to unlock' : 'Lock it'}</button>`}`
        + `<button class="pp-chip" data-vl-open="${id}">${o.custom ? 'Rename &amp; goal' : 'Goal'}</button>`
        + `<span class="pp-cols" role="group" aria-label="${nm}'s color">${PCN.map(k => `<button class="pp-col${k === col ? ' on' : ''}" style="--sw:${PC[k]}" data-color="${id}" data-ck="${k}" aria-label="${k}" aria-pressed="${k === col}"></button>`).join('')}</span>`   // v184
        + (kind === 'proj' && o.goal > 0 && o.bal >= 0.01 ? `<button class="pp-chip pp-pay" data-debt="${id}">Make a payment</button>` : '')
        + (kind === 'pot' && o.custom ? `<button class="pp-chip pp-del" data-del-pot="${id}">Delete pot</button>` : '') + `</div>`
        + (pays.length && sv ? `<div class="pp-pays"><h4>Payments</h4>${pays.map(t => `<div class="pp-payr"><span>Paid ${esc(moneyExact(t.amount))} · ${esc(shortDate(t.date))}${t.note ? ` · ${esc(t.note)}` : ''}</span><button class="link" data-debt-undo="${esc(t.id)}" aria-label="Undo the ${esc(moneyExact(t.amount))} payment of ${esc(shortDate(t.date))}">Undo</button></div>`).join('')}</div>` : '')
        + `</div>`) + `<div class="pp-xv" data-x="${id}"></div></div>`;   // v225: the details open here
    };
    let h = ``;   // v186: no villagers card (Jordan's image); the lines below stand on their own when there are any
    h += `<div class="pp-paylines">`;   // v186
    if (!e.pn.list.length && !D.incomes.length) h += `<div class="vl-early">No pay set up yet.</div>`;
    for (const w of e.pn.waiting) h += `<button class="pp-big vl-payin" data-pay-open="${esc(w.key)}">Enter your ${shortDate(w.date)} paycheck</button>`;
    for (const c of checkFlows(now).list.filter(c => c.date > ymd(new Date(now)))) h += `<div class="vl-early">${money(c.F)} pay waiting · starts ${shortDate(c.date)}</div>`;   // v131: entered early
    // v148: Collect spare change as a gold row in this card (its words open where it came from), Round off under it
    R.push({ id: 'scavenger', name: 'Spare change', exact: true });
    h += `</div>`;
    // pots: Savings first
    // v174: pots and projects in one list (color and the label tell them apart), one add button under it
    // v200: no Spare change card; Collect is the button at the bottom left (#spareFab)
    const mwb = `<button class="pp-big alt pp-add pp-mwb" data-mw="1">Split your pay<small>${money(maxWorkers() * WORKER_DAY)} a day · ${money(perMo(maxWorkers()))} a paycheck</small></button>`;   // v190; v195 a paycheck
    h += `<div class="pp-sec pp-sec-home"><h3 class="pp-h2">Pots and Projects</h3>${plan ? '' : '<button class="pp-plan pp-opt" data-opt-go="1">Optimize</button>'}${planChip()}</div><div class="pp-list pp-one">` + '';   // v298; v322 (Jordan): the cushion is in the top card now
    const dbIts = [];
    { const its = [...D.stock.map(p => [{ id: p.id, name: p.name, goal: p.goal, custom: p.custom }, p.id === 'savings' ? 'save' : 'pot']),
        ...D.projects.map(p => [{ id: p.id, name: p.name, goal: p.goal, bal: p.bal, custom: true, proj: true }, 'proj'])];
      const ord = state.cardOrder || [], oi = id => { const i = ord.indexOf(id); return i < 0 ? 1e6 : i; };
      const act = id => id === 'savings' ? 2 : workersAt(id) > 0 ? 1 : 0;   // v186: Savings first
      its.map((x, n) => ({ x, n })).sort((a, b) => (act(b.x[0].id) - act(a.x[0].id)) || (oi(a.x[0].id) - oi(b.x[0].id)) || a.n - b.n)
        .forEach(({ x }) => { if (debtOf(x[0].id)) dbIts.push(x); else if (x[0].id === 'savings' && !CU.sav) return; else h += card(x[0], x[1]); }); }   // v300: Savings shows once the cushion is full   // v184: active first, then the order you dragged; v298: debts in their own section
    h += `</div><button class="pp-big alt pp-add" data-vl-open="newpot">＋ Add a pot or project</button>`;
    h += `<div class="pp-sec pp-sec-home"><h3 class="pp-h2">Debts</h3></div>` + debtWarnHTML() + (dbIts.length ? `<div class="pp-list pp-one pp-debts">${dbIts.map(x => card(x[0], x[1])).join('')}</div>` : '')
      + `<button class="pp-big alt pp-add pp-adddebt" data-debt-new="1">＋ Add a debt</button>`;   // v295; v298: its own section
    // v156: no Party purse section (the top card shows it)
    // bills: plain rows (no bars): name, when it's due, amount (rounded up), saved ✓ / $X to save / paid (v300), and Paid / Undo
    let billsTop = '';
    if (D.bills.length) {
      const L = ledgerAt(today()), held = new Set(L.heldList.filter(x => x.m <= month).map(x => x.c && x.c.id));
      const reef = document.documentElement.classList.contains('look-b');   // v268 (Jordan's drawing): in Coral reef spending is light coral and Savings coral
      const places = [['party', 'Spending', partyNow(), reef ? 'var(--rf-title, #ffaba4)' : 'var(--pal-pk, #f594c3)'],   // v232: the weekly budget is pink   // v223: where your villagers work
        ...D.projects.map(x => [x.id, x.name, Math.max(0, workersAt(x.id)), PC[CK[x.id]]]),   // v255: projects, then pots, in the key's order
        ...D.stock.filter(x => x.id !== 'savings').map(x => [x.id, x.name, Math.max(0, workersAt(x.id)), PC[CK[x.id]]]), ['savings', 'Savings', savers(), reef ? 'var(--rf-coral, #ff8a80)' : PC[CK.savings]]].filter(x => x[2] > 0);
      billsTop = billGrid(D.bills, held, 'pieces', places);   // v228: one box per pay period   // v221: in place of the v157 ring
      const TS = billToSave();
      h += `<div class="pp-sec pp-sec-home pp-sec-ov"><h3 class="pp-h2">Overview</h3></div>` + billsTop + `<div class="pp-sec pp-sec-bills"><h3 class="pp-h2">Bills</h3>${planChip()}<span data-t="bills-h"></span></div><div class="pp-panel pp-bills">`;
      for (const x of D.bills.map((b, i) => [b, i]).sort((a, b) => (!!(a[0].pre || a[0].paid) - !!(b[0].pre || b[0].paid)) || a[1] - b[1]).map(z => z[0])) {   // v188: paid ones last
        const r = Town.billBar(x, now), amt = money(Math.ceil(Number(x.amount) - 1e-9)), st = x.pre ? '<span class="ok">before you started ✓</span>' : x.paid ? '<span class="ok">paid ✓</span>' : !(TS[x.id] >= 0.5) ? '<span class="vl-held">saved ✓</span>' : `${money(TS[x.id])} to save`;
        h += `<div class="pp-bill${x.pre || x.paid ? ' done' : ''}"><button class="pp-bl" data-vl-open="bill:${esc(x.id)}" aria-label="${esc(x.name)}, ${amt}, ${esc(r.when)}"><b>${esc(x.name)}</b><small>${esc(r.when)}</small></button>`
          + `<span class="pp-br"><span class="num">${amt}</span><small>${st}</small></span>`
          + (x.pre || (x.paid && billByBank(x.id)) ? '<span></span>' : x.paid ? `<button class="vl-pay undo" data-unslay="${esc(x.id)}" aria-label="Undo paid for ${esc(x.name)}">Undo</button>` : `<button class="vl-pay" data-paid="${esc(x.id)}" aria-label="Mark ${esc(x.name)} paid">Paid</button>`) + `</div>`;
      }
      h += `</div><div class="pp-chips"><button class="pp-chip" data-vl-open="home">Bills overview</button><button class="pp-chip" data-vl-open="editbills">Edit bills</button></div>`;
    } else h += `<div class="pp-sec pp-sec-bills"><h3 class="pp-h2">Bills</h3><span data-t="bills-h"></span></div><p class="pp-empty">No bills yet.</p><div class="pp-chips"><button class="pp-chip" data-vl-open="editbills">+ Add bills</button></div>`;
    h += mwb;   // v196: where Spare change was
    // the picker sheet, when one is open
    const pick = pickFor && canAdd(pickFor) ? pickSheet(pickFor) : ''; H.classList.toggle('pp-pick', !!pick);
    rows = R;
    return h + pick;
  }
  // v311 (E1): a debt's line (its payoff plan runs month by month) is worked out again once a minute, when the books
  // change or when its saved cents move; in between the tick reuses it (its "Owe" is redrawn every frame anyway)
  const dlMemo = {};
  function dlLine(id, b, now) { const k = booksGen + '|' + Math.floor(now / 60000) + '|' + Math.floor(b * 100 + 1e-6), m = dlMemo[id]; if (m && m.k === k) return m.v; const v = debtLine(id); dlMemo[id] = { k, v }; return v; }
  function townVals(now, quiet) {
    const v = {}, e = earning(now), cm = today().slice(0, 7), pots = potBalances(cm), pu = purseNow(now), D = Town.data, sv = Math.max(0, e.pn.V - partyNow(now) - crewWorkers());   // v311 (E1): savers() once, on this tick's periodNow
    lastSnap = now;
    const CT = billsMonthWhole(), sRaw = (pots.find(p => p.id === 'savings') || { bal: 0 }).bal, cuC = CT > 0 ? Math.max(0, Math.min(CT, sRaw)) : 0, cuFull = CT > 0 && cuC >= CT - 0.005;   // v300; v311 (E3): below zero too
    if (!quiet && !manageOn && cuSav != null && (!(CT > 0) || sRaw > CT + 0.005) !== cuSav) { cuSav = null; setTimeout(renderTown, 0); }   // v311 (E11): the cushion just filled (or dipped): the Savings card comes (or goes)
    const bal = id => id === 'cushion' ? cuC : id === 'savings' ? sRaw - cuC : (pots.find(p => p.id === id) || { bal: 0 }).bal, cs = placeCents(pots);   // v147: cs, for the Top off chips; v300: Savings less the cushion
    // the total, its rate and its bar to the next whole dollar
    const whole = Math.floor(e.E + 1e-9);
    v['t:total'] = cents2(e.E);   // v311 (E17): no live 'total' (nothing draws it; every frame looked for it)
    v['t:sl-total'] = e.rate > 0 ? stepLine(e.rate) : '';
    v['t:rate'] = e.V ? `${money(Math.max(0, e.V - partyNow()) * WORKER_DAY)} a day` : e.pn.waiting.length ? 'Enter your paycheck to start its money coming in' : 'No money coming in right now';   // v148: "47 · $47 a day"
    v['t:more'] = `${money(Math.max(0, sum(e.pn.list, c => c.pending)))} more`;
    if (!quiet && lastWhole != null && whole > lastWhole) ping(whole - lastWhole);
    lastWhole = whole;
    // the section heads
    v['t:purse-h'] = `${money(pu.purseLeft)} left this week`; v['t:spent'] = `${money(pu.spent)} spent`;
    if (D) { v['t:stock-h'] = `money you keep · ${money(sum(D.stock, p => bal(p.id)))}`; v['t:proj-h'] = D.projects.length ? `${money(sum(D.projects, p => bal(p.id)))} of ${money(sum(D.projects, p => p.goal))}` : 'saving up, then spending'; }
    v['t:bills-h'] = `${billsMonthWhole() > 0 ? `<b class="bh-tot">${money(billsMonthWhole())}</b> a month · ` : ''}${money(bal('bills'))} saved`;   // v301 (Jordan): the month's bill total
    if (townOn() && (CT <= 0 || (cuFull && state.cush && state.cush.full))) saveMilestone(sRaw);   // v300: while the cushion fills, its own moments   // v136: only while the Town list is on screen, so the burst is seen
    if (state.roundOff) v['t:ro'] = roundOffLine(now);
    const cb = $('vlCollect'); if (cb) cb.disabled = !(bal('scavenger') >= 0.005);
    { const f = $('spareFab'), a = bal('scavenger'); if (a >= 0.005 && !autoColl && !clockBack()) { autoColl = true; setTimeout(autoCollect, 600); } if (f) { f.disabled = !(a >= 0.005); $('spareAmt').textContent = a >= 0.005 ? moneyExact(a) + ' spare' : 'none yet'; } }   // v200; v311 (E4): not while the phone's clock is behind
    let soon = null, built = null;
    for (const o of rows) {
      if (o.id === 'spend') { v['t:v-spend'] = money(pu.purseLeft); v['w:spend'] = pu.P > 0 ? pu.purseLeft / pu.P : 0; v['t:e-spend'] = pu.carried > 0.005 ? `purse ${money(pu.P + pu.carried)} · −${money(Math.ceil(pu.carried - 1e-9))} carried` : pu.P ? `of ${money(pu.P)} this week` : ''; continue; }
      const b = bal(o.id);
      if (o.exact) { v['t:v-' + o.id] = b >= 0.005 ? `${esc(moneyExact(b))} waiting` : 'none yet'; continue; }
      const B = Math.floor(b + 1e-9);
      v['t:v-' + o.id] = cents2(b);   // v141: dollars and cents again (Jordan: "a pot that's $13.93"), floored
      // the row's own crew and rate: Savings gets everyone's pay less what crews send elsewhere; a pot or project, its crew
      const w = o.id === 'savings' ? (CT > 0 && !cuFull ? 0 : sv) : o.cush ? (cuFull ? 0 : sv) : Math.max(0, workersAt(o.id)), rate = w * WORKER_DAY / DAY_MS, fr = b - Math.floor(b);   // v300: Savings' pay fills the cushion first; v311 (E5): no bills (no cushion), it all goes to Savings
      snap(o.id, b, rate, now);
      v['t:sl-' + o.id] = rate > 0 ? stepLine(rate) : 'nothing coming in here';
      v['t:n1-' + o.id] = rate > 0 ? `· ${money(1)} in ${eta((1 - fr) / rate)}` : '';
      const po = !(o.goal > 0) && o.proj && paidOff(o.id);   // v147
      const g = o.goal > 0 ? o.goal : 0, done = (g > 0 && b >= g - 0.005) || po, mo = w ? `${money(Math.floor(w * WORKER_DAY * 365 / 12))} a month` : '';   // v148: beside the crew, which already says 0
      v['t:of-' + o.id] = g ? `of ${money(g)}` : po ? 'paid off' : 'no goal set';
      // v146: the pips show the whole goal (no goal: the next round $100); the bar under them, the next unit (drawn every
      // frame in moveBars; this is just their slots and the line under them)
      const U = unitFor(rate), Uc = Math.round(U * 100), cb = Math.max(0, b) * 100, nxU = (Math.floor((cb + 1e-6) / Uc) + 1) * Uc;
      pipInfo[o.id] = { g, done, rate, U };
      { const db = debtOf(o.id); if (db) { pipInfo[o.id].debt = { start: Math.max(Number(db.start || 0), g), owed: g, W: debtWin(o.id), lim: Number(db.limit || 0) }; v['t:of-' + o.id] = po ? 'paid off' : (debtRoom(o.id) != null ? `owed · ${money(Math.max(0, Math.floor(debtRoom(o.id) + 1e-9)))} left to spend` : `owed · ${money(Math.max(0, Math.max(Number(db.start || 0), g) - g))} paid off`); v['t:dl-' + o.id] = dlLine(o.id, b, now); } }   // v295; v311 (E1)
      if (!o.cush) { const P = topOffPlan(o.id, cs); v['t:fl-' + o.id] = !P || !P.need || !P.got ? '' : P.full ? `Fill to ${money(P.to)}` : 'Top off'; }   // v147
      v['t:p-' + o.id] = '<i></i>'.repeat(10);
      v['t:nx-' + o.id] = rate > 0 ? `next ${unitWord(U)} in ${shortIn((nxU - cb) / 100 / rate)}` : `next ${unitWord(U)} · paused, nothing goes here each day`;
      v['t:m2-' + o.id] = done && o.proj ? `${money(b)} saved` : mo;
      v['t:go-' + o.id] = g && !done ? `${money(Math.ceil(g - b - 1e-9))} to go.` : '';
      v['t:eta-' + o.id] = ''; v['t:eta1-' + o.id] = '';
      const pct = g ? `${Math.floor(c01(B / g) * 100)}% of ${money(g)}` : B < 0 ? `${moneyExact(Math.ceil(-b * 100 - 1e-6) / 100)} short` : `${B % 100}% of the way to ${money((Math.floor(B / 100) + 1) * 100)}`;   // v146: the pips show this again; v311 (E3): below zero, how far short
      if (po) v['t:m1-' + o.id] = '<span class="pp-ready">Paid off!</span>';
      else if (!g) v['t:m1-' + o.id] = pct;
      else if (done) { v['t:m1-' + o.id] = o.proj ? '<span class="pp-ready">Ready to spend ✓</span>' : '<span class="ok">goal reached ✓</span>'; if (o.proj && !built) built = o.name; }
      else {
        // v127: when it would be done with today's crew, and with one more villager (each brings $1 a day)
        const left = g - b;
        const fin = n => { const d = left / (n * WORKER_DAY); return { d, when: new Date(now + d * DAY_MS).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d > 300 ? { year: 'numeric' } : {}) }), len: d < 14 ? plural(Math.ceil(d), 'day') : d < 120 ? plural(Math.round(d / 7), 'week') : plural(Math.round(d / 30.4), 'month') }; };
        if (w > 0) {
          const a = fin(w), c = fin(w + 1);
          v['t:m1-' + o.id] = o.proj ? `Done ~${a.when}` : pct;
          v['t:eta-' + o.id] = `${o.proj ? '' : `${pct} · `}done ~${a.when} · ${a.len}`;
          if (c.when !== a.when) v['t:eta1-' + o.id] = `With ${w + 1}: done ${c.when}`;
          if (o.proj && (!soon || a.d < soon.d)) soon = { d: a.d, name: o.name, when: a.when };
        } else {
          const c = fin(1); v['t:m1-' + o.id] = pct;   // v148: the line goes on "· next cent · paused, no villagers"
          v['t:eta-' + o.id] = `at $1 a day: done ~${c.when} · ${c.len}`;
        }
      }
      // a coin pops on the card each time it lands another whole dollar (a move of money doesn't count)
      if (!quiet && rate > 0 && seen[o.id] != null && B > seen[o.id] && B - seen[o.id] <= 2) coin(o.id, B - seen[o.id]);
      seen[o.id] = B;
    }
    if (CT > 0) cushVals(v, CT, cuC, sv, now, quiet, sRaw);   // v300
    v['t:sv-plan'] = savingsLine(sRaw, now);   // v322
    // the verdict: the thing to know first
    v['t:vd'] = e.pn.waiting.length ? 'Enter your paycheck to start its money coming in.' : !e.V ? 'No money coming in right now.'
      : soon ? `${esc(soon.name)} is done ~${soon.when}.` : built ? `${esc(built)} is ready to spend ✓` : `Everyone is at work: ${money(e.V * WORKER_DAY)} a day.`;
    return v;
  }
  // v322 (Jordan): under Savings (or the cushion), how much of it is already planned by the next payday, what's free,
  // and any pay that hasn't landed in the bank yet
  function savingsLine(S, now) {
    const pl = savingsPlanned(now), out = [];

    if (pl.week >= 1) out.push(`Spending money through ${shortDate(pl.until)} is already taken out.`);
    if (pl.amt >= 1) out.push(`<b>${money(pl.amt)}</b> more goes to pots and projects by ${shortDate(pl.until)}, a day at a time.`);
    return out.join('<br>');
  }
  // v300: the cushion card's marks (a week of bills at a time), next month's bills locking in smallest first, the
  // line under them (or, once full, what happens now) and its moments: a toast as a bill locks in or a week fills,
  // and a glow on the card when it's full. Seen moments are kept in state.cush so they show once.
  function cushVals(v, T, C, w, now, quiet, S) {   // v311: S, Savings now (the tick's own)
    const full = C >= T - 0.005, N = daysIn(nextMonth(today().slice(0, 7))), WD = [7, 14, 21, 28].filter(d => d < N), at = d => Math.ceil(T * d / N - 1e-9), wk = WD.filter(d => C >= at(d) - 0.005).length, lk = state.categories.map(c => ({ n: c.name, a: Math.max(0, Math.ceil(cents(Number(c.budget || 0)) - 1e-9)) })).filter(x => x.a > 0).sort((p, q) => p.a - q.a);
    let acc = 0, nl = 0; for (const x of lk) { if (acc + x.a <= C + 1e-6) { acc += x.a; nl++; } else break; }
    const was = state.cush || null, P = cushVals.pop = cushVals.pop || {}; if (was && !quiet) for (let i = was.n; i < nl; i++) P[i] = now + 900;   // a chip that just locked in pops (for its whole animation)
    const pop = new Set(Object.keys(P).filter(i => P[i] > now).map(Number));
    v['t:cu-kind'] = full ? "Next month: paid for ✓" : "Next month's bills, saved ahead";
    v['t:cu-marks'] = [...WD.map((d, i) => [plural(i + 1, 'week'), at(d), wk > i]), ['A month', Math.ceil(T - 1e-9), full]].map(([t, a, h]) => `<span class="${h ? 'hit' : ''}">${h ? '★ ' : ''}${t}<small>${money(a)}</small></span>`).join('');
    v['t:cu-locks'] = lk.map((x, i) => `<span class="cu-lk${i < nl ? ' on' : i === nl ? ' next' : ''}${pop.has(i) ? ' pop' : ''}"><b>${esc(x.n)}</b>${i < nl ? '✓' : money(x.a)}</span>`).join('');
    if (full) v['t:cu-say'] = `<b>Full.</b> A whole month of bills is saved ahead. If it ever dips, Savings fills it back up first, and anything over a month shows in Savings.`;
    else {
      const r = Math.max(0, w) * WORKER_DAY, d = r > 0 ? (T - C) / r : 0, when = t => new Date(now + t * DAY_MS).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      const nx = lk[nl], more = nx ? `<b>${money(Math.ceil(acc + nx.a - C - 1e-9))}</b> more locks in ${esc(nx.n)}. ` : '';
      const sooner = r > 0 ? Math.round((d - (T - C) / (r + 10 / 7)) / 7) : 0;
      v['t:cu-say'] = more + (r > 0 ? `At ${money(r)} a day it's full by <b>${when(d)}</b>.${sooner > 0 ? ` Spending $10 less a week gets there ${plural(sooner, 'week')} sooner.` : ''}`
        : 'Nothing is going into it right now. The money a day that isn\'t on spending, pots or projects fills it.');
    }
    let a1 = 0, n1 = 0; for (const x of lk) { if (a1 + x.a <= C + 1 + 1e-6) { a1 += x.a; n1++; } else break; }   // v311: what's in with $1 more
    const sn = was && nl < was.n ? Math.min(was.n, n1) : nl, sw = was && wk < was.w ? Math.min(was.w, WD.filter(d => C + 1 >= at(d) - 0.005).length) : wk,
      sf = full || (!!(was && was.full) && C + 1 >= T - 0.005);   // v311: a dip of under $1 keeps a moment, so it isn't toasted twice
    if (!was || (!quiet && (was.n !== sn || was.w !== sw || !!was.full !== sf))) {   // a redraw (quiet) leaves the moment for the next tick
      if (was) {
        if (full && !was.full) { toast("Month cushion full ✓ Next month's bills are saved ahead"); const c = $('townList').querySelector('.pp-card.cush'); if (c) { c.classList.remove('cu-win'); void c.offsetWidth; c.classList.add('cu-win'); } }
        else if (nl > was.n) toast(nl - was.n === 1 ? `${lk[nl - 1].n} is saved for next month ✓` : `${nl - was.n} bills saved for next month ✓`);
        else if (wk > was.w) toast(`★ ${['', 'A week', 'Two weeks', 'Three weeks', 'Four weeks'][wk]} of bills saved ahead`);
      }
      state.cush = { n: sn, w: sw, full: sf, at: sf ? (was && was.full ? was.at : now) : null };
      if (full && !(was && was.full)) state.saveMile = Math.max(Number(state.saveMile) || 0, Math.floor((C + Math.max(0, S - C)) / 100 + 1e-9) * 100);   // Savings' own milestones start from here
      save();
    }
  }
  /* v221: the bills grid, in place of the ring. Bills in the order they hit; glowing = held from this paycheck,
     outlined = later this month, dim = paid; then your free villagers. */
  function billGrid(bills, held, mode, places = []) {
    const free = periodNow().V;
    const list = bills.slice().sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0);
    const kind = x => x.pre || x.paid ? 'paid' : held.has(x.id) ? 'now' : 'later';
    const onBills = list.reduce((t, x) => t + (x.crew || 0), 0), left = list.filter(x => !(x.pre || x.paid)).length;
    const head = `<div class="bg-head"><span><b class="num">${onBills}</b> on bills</span><span>${left ? `${left} bill${left === 1 ? '' : 's'} left` : 'all bills paid'}</span><span class="bg-you"><b class="num">${free}</b> yours</span></div>`;
    if (mode === 'pieces') {   // v230: one closed piece per pay period, packed column by column from the bottom left
      const inc = mainIncome(), m0 = month + '-01', st = inc ? prevPayday(inc, m0) : null;
      const starts = [st || m0, ...(inc ? paydaysOf(inc, month) : []).filter(d => d > (st || m0))], secs = starts.map(d => ({ d, b: [] }));
      for (const x of list) { let k = secs.length - 1; if (x.due) { k = 0; for (let i = secs.length - 1; i >= 0; i--) if (secs[i].d <= x.due) { k = i; break; } } secs[k].b.push(x); }
      const H = 5, cells = [];
      const used = secs.map((z, i) => Object.assign(z, { i })).filter(z => z.b.length);
      // v235: the pay periods already gone are hollow; this one and the ones to come are solid and glowing
      const live = used.findIndex(z => z.b.some(x => !(x.pre || x.paid))), from = live < 0 ? used.length : live;
      used.forEach((z, j) => { const pk = j < from ? 'later' : 'now'; z.pk = pk;
        for (const x of z.b) for (let k = 0; k < Math.max(1, x.crew || 0); k++) cells.push({ o: 's' + z.i, k: pk, pk, nm: shortDate(z.d) + ' pay' }); });
      const yours = places.length ? places : [['free', 'yours', free, 'var(--pal-a, #6ed0ff)']];   // v250: colors back (Jordan: white looked weird)
      yours.forEach(([id, nm, w, c]) => { for (let k = 0; k < w; k++) cells.push({ o: 'p' + id, k: 'own', pk: 'own', c, nm }); });
      const C = Math.max(1, Math.ceil(cells.length / H)), at = (r, c) => { if (r < 0 || r >= H || c < 0 || c >= C) return null; return cells[c * H + r] || null; };
      let h = '';
      for (let r = H - 1; r >= 0; r--) {
        for (let c = 0; c < C; c++) {
          const q = at(r, c); if (!q) { h += '<i class="e"></i>'; continue; }
          const same = (rr, cc) => { const n = at(rr, cc); return n && n.o === q.o; }, grp = n => n.pk === 'own' ? n.o : 'bills', sg = (rr, cc) => { const n = at(rr, cc); return n && grp(n) === grp(q); };   // v255: sg = same group (all bills together)
          h += `<i class="${q.k} pk-${q.pk}${same(r + 1, c) ? ' t' : ''}${same(r - 1, c) ? ' b' : ''}${same(r, c - 1) ? ' l' : ''}${same(r, c + 1) ? ' r' : ''}${sg(r + 1, c) ? ' jt' : ''}${sg(r - 1, c) ? ' jb' : ''}${sg(r, c - 1) ? ' jl' : ''}${sg(r, c + 1) ? ' jr' : ''}"${q.c ? ` style="--pc:${q.c}"` : ''} title="${esc(q.nm)}"></i>`;
        }
      }
      const hd = `<div class="bg-head"><span><b class="num">${money(onBills * WORKER_DAY)}</b> a day to bills</span><span class="bg-you"><b class="num">${money(free * WORKER_DAY)}</b> a day yours</span></div><div class="bg-sub">${left ? `${left} bill${left === 1 ? '' : 's'} left to pay this month` : 'All bills paid this month'}</div>`;
      const key = used.map(z => `<span><i class="pk-${z.pk}"></i>${shortDate(z.d)} pay</span>`).join('') + (places.length ? places.map(([id, nm, w, c]) => `<span><i class="pk-own" style="--pc:${c}"></i>${esc(nm)} <b class="num">${money(w * WORKER_DAY)}</b>/day</span>`).join('') : '');
      return `<button class="pp-panel bg3 bg-still" tabindex="-1" aria-label="Bills by pay period: ${used.map(z => `${shortDate(z.d)} pay, ${z.b.length} bills, ${z.pk === 'paid' ? 'paid' : z.pk === 'now' ? 'held now' : 'later'}`).join('; ')}. ${money(free * WORKER_DAY)} a day yours.">${hd}`
        + `<span class="bg3-grid" style="--C:${C}">${h}</span><span class="bg3-key">${key}${places.length ? '' : '<span><i class="pk-own" style="--pc:var(--pal-a, #6ed0ff)"></i>yours</span>'}</span>`
        + (() => { const P = palColors();   // v253 (Jordan): a simple key for the Overview on Home
            return `<span class="bg3-sk"><span><i style="--pc:var(--c-bill, #7fdc9c)"></i>Bills</span><span><i style="--pc:var(--pal-pk)"></i>Spending</span><span><i style="--pc:${P.teal}"></i>Projects</span><span><i style="--pc:${P.mag}"></i>Pots</span></span>`; })() + `</button>`;
    }
    if (mode === 'periods') {   // v228: the bills in one box per pay period, each pip lit by its bill
      const inc = mainIncome(), m0 = month + '-01', st = inc ? prevPayday(inc, m0) : null;
      const starts = [st || m0, ...(inc ? paydaysOf(inc, month) : []).filter(d => d > (st || m0))], secs = starts.map(d => ({ d, b: [] }));
      for (const x of list) { let k = secs.length - 1; if (x.due) { k = 0; for (let i = secs.length - 1; i >= 0; i--) if (secs[i].d <= x.due) { k = i; break; } } secs[k].b.push(x); }
      const box = (z, i) => {
        const n = z.b.reduce((t, x) => t + Math.max(1, x.crew || 0), 0), ks = z.b.map(kind);
        const k = ks.every(q => q === 'paid') ? 'paid' : ks.includes('now') ? 'now' : 'later', cols = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(n * 1.6))));
        const pips = z.b.map(x => x.crew ? `<i class="${kind(x)}"></i>`.repeat(x.crew) : `<i class="${kind(x)} part"></i>`).join('');
        const lbl = `${shortDate(z.d)} pay`;
        return `<span class="bx-bill bpd ${k}"><span class="bx-nm">${esc(lbl)}</span><span class="bx-box" style="--cols:${cols}">${pips}${k === 'paid' ? '<b class="bx-ck">PAID</b>' : ''}</span>`
          + `<span class="bx-dt">${z.b.length} bill${z.b.length === 1 ? '' : 's'}</span></span>`; };
      const hd = `<div class="bg-head"><span><b class="num">${onBills}</b> on bills</span><span>${left ? `${left} bill${left === 1 ? '' : 's'} left` : 'all bills paid'}</span></div>`;
      return `<button class="pp-panel bg-pd bg-still" tabindex="-1" aria-label="Bills by pay period: ${secs.filter(z => z.b.length).map((z, i) => `${shortDate(z.d)} pay, ${z.b.length} bills`).join('; ')}. ${money(free * WORKER_DAY)} a day yours.">${hd}<span class="bx-row">${secs.map((z, i) => z.b.length ? box(z, i) : '').join('')}`
        + `<span class="bx-free"><span class="bx-nm"><b class="num">${free}</b> yours</span><span class="bx-loose">${'<i></i>'.repeat(free)}</span></span></span></button>`;
    }
    if (mode === 'boxes') {
      const box = x => { const n = Math.max(1, x.crew || 0), k = kind(x), cols = n <= 3 ? n : n <= 9 ? 3 : n <= 16 ? 4 : 5;
        return `<button class="bx-bill ${k}" data-vl-open="bill:${esc(x.id)}" aria-label="${esc(x.name)}, ${x.crew ? money(x.crew * WORKER_DAY) : 'under $1'} a day, ${x.due ? 'due ' + shortDate(x.due) : 'no due date'}, ${k === 'paid' ? 'paid' : k === 'now' ? 'held now' : 'later'}">`
          + `<span class="bx-nm">${esc(x.name)}</span><span class="bx-box" style="--cols:${cols}">${x.crew ? '<i></i>'.repeat(x.crew) : '<i class="part"></i>'}${k === 'paid' ? '<b class="bx-ck">PAID</b>' : ''}</span>`
          + `<span class="bx-dt">${x.due ? esc(shortDate(x.due)) : 'any day'}</span></button>`; };
      return `<div class="bg bg-boxes">${head}<div class="bx-row">${list.map(box).join('')}<div class="bx-free" role="img" aria-label="${money(free * WORKER_DAY)} a day yours"><span class="bx-nm">yours</span><span class="bx-loose">${'<i></i>'.repeat(free)}</span></div></div></div>`;
    }
    // tetris: 6 rows, filled column by column from the bottom left, so each bill stacks into one chunky piece;
    // a piece has no lines inside it, a bevel on its outside edges, and a gap to its neighbours. Free villagers are single pips.
    const H = 6, cells = [];
    list.forEach((x, bi) => { for (let k = 0; k < Math.max(1, x.crew || 0); k++) cells.push({ o: 'b' + bi, k: kind(x), x, alt: bi % 2 }); });
    if (places.length) places.forEach(([id, nm, w, c]) => { for (let k = 0; k < w; k++) cells.push({ o: 'p' + id, k: 'own', c, nm }); });
    else for (let k = 0; k < free; k++) cells.push({ o: 'f' + k, k: 'free' });
    const C = Math.max(1, Math.ceil(cells.length / H)), at = (r, c) => { if (r < 0 || r >= H || c < 0 || c >= C) return null; const col = c, i = col * H + r; return cells[i] || null; };
    let h = '';
    for (let r = H - 1; r >= 0; r--) for (let c = 0; c < C; c++) {   // row 0 is the bottom row
      const q = at(r, c); if (!q) { h += '<i class="e"></i>'; continue; }
      const same = (rr, cc) => { const n = at(rr, cc); return n && n.o === q.o; };
      const T = same(r + 1, c), B = same(r - 1, c), Lf = same(r, c - 1), Rt = same(r, c + 1);
      h += `<i class="${q.k}${T ? ' t' : ''}${B ? ' b' : ''}${Lf ? ' l' : ''}${Rt ? ' r' : ''}"${q.c ? ` style="--pc:${q.c}"` : ''}${q.x || q.nm ? ` title="${esc(q.x ? q.x.name : q.nm)}"` : ''}></i>`;
    }
    return `<button class="pp-panel bg2 bg-still" tabindex="-1" aria-label="Bills: ${money(onBills * WORKER_DAY)} a day on ${list.length} bills, ${left} left to pay, ${money(free * WORKER_DAY)} a day yours.">${head}<span class="bg2-grid" style="--C:${C}">${h}</span><span class="bg2-key"><span><i class="now"></i>bill held now</span><span><i class="later"></i>bill later</span><span><i class="paid"></i>bill paid</span>${places.length ? places.map(([id, nm, w, c]) => `<span><i class="own" style="--pc:${c}"></i>${esc(nm)} <b class="num">${w}</b></span>`).join('') : '<span><i class="free"></i>yours</span>'}</span></button>`;
  }
  /* v157: the bills ring */
  function renderTown() {
    const box = $('townList'); if (!box || town !== 'list' || dragC) return;   // v184: not while a card is held
    const now = Date.now(), html0 = townHTML(now); if (!html0) return; const html = clockBanner() + html0;   // v137
    pxSync();
    const sb = $('townShBody'), fe = sb && sb.contains(document.activeElement) ? document.activeElement : null;   // v311: what had focus in the open card
    let fsel = null; try { if (fe && fe.selectionStart != null) fsel = [fe.selectionStart, fe.selectionEnd]; } catch (e) {}
    if (sb && box.contains(sb) && box.vlHtml !== html) $('townSheet').appendChild(sb);   // kept out of the repaint
    paint(box, html); fill(box, townVals(now, true));
    if (xId) { const c = box.querySelector(`[data-vl-row="${CSS.escape(xId)}"]`), sl = c && c.querySelector('.pp-xv');
      if (c) c.classList.add('xo', 'open'); if (sl && sb && !sl.contains(sb)) sl.appendChild(sb); if (!c) { xId = null; Town.closeInline(); } }
    if (fe && fe.isConnected && document.activeElement !== fe) { fe.focus({ preventScroll: true }); if (fsel) try { fe.setSelectionRange(fsel[0], fsel[1]); } catch (e) {} }   // v311: moving the card's body out and back dropped it
    for (const k in pxCls) { const c = box.querySelector(`[data-vl-row="${CSS.escape(pxCls[k])}"]`); if (c) c.classList.add(k); }
    box.querySelectorAll('.pp-list.pp-one').forEach(l => { if (!l.vlTm) { l.vlTm = true; l.addEventListener('touchmove', holdMove, { passive: false }); } });   // v311 (E16)
    kick(); if (!woke) { woke = true; catchUp(1200); }   // v311 (E17, E6)
  }
  /* ---- the Budget page as a list: the purse, each villager's pouch, the week's spends ---- */
  function nextPayHTML(now) {   // v193: in the opened weekly card only
    const n = nextPayNow(now); if (!n || dayMs(n.date) - now >= 7 * DAY_MS) return '';
    return `<div class="hl-np">` + (n.entered
      ? `<button class="pp-tip pp-next" data-pay-open="${esc(n.key)}"><span><b>Next paycheck · ${shortDate(n.date)}</b><small>${moneyExact(n.D)} · ${money((n.V) * WORKER_DAY)} a day from then · tap to fix</small></span></button>`
      : `<button class="pp-big alt pp-add pp-next" data-pay-open="${esc(n.key)}">Enter your ${shortDate(n.date)} paycheck<small>Got your pay summary? It starts on payday.</small></button>`) + `</div>`;
  }
  // v311 (E9): the weekly card opens its weekly budget by keyboard too, and its buttons say so
  const hcKeys = s => s.replace(/<div class="hl-today([^"]*)" aria-label="([^"]*)"/, '<div class="hl-today$1" role="button" tabindex="0" aria-label="$2. Tap to change your weekly budget"')
    .replace(/ role="button" tabindex="0"/g, `$& aria-expanded="${wkEd}"`).replace('. Tap to edit your categories"', '. Tap to change your weekly budget"');
  // v322 (Jordan): one number first, how much money you have: what's free after bills held, the spending money through
  // the next payday and pots and projects (Savings and the Month cushion together)
  function haveHTML(now) {   // v322 (Jordan): one top card, the cushion: what's yours until the next payday, from $0 up to a month of bills
    const { H, S, keep, until, later, pp } = cushionNow(now), T = billsMonthWhole(), f = T > 0 ? clamp01(H / T) : 0;
    const wait = pp.checks.list.filter(c => c.wait >= 0.005).map(c => `<div class="vl-sub">${moneyExact(c.wait)} of your ${shortDate(c.date)} pay isn't in your bank yet <button class="link" data-pay-here="${esc(c.key)}">It's here</button></div>`).join('');
    const nm = later.length ? ` (${esc(later[later.length - 1].c.name)}${later.length > 1 ? ' and more' : ''})` : '';
    const heads = keep >= 1 && S < -0.005 ? `<div class="vl-sub">Heads-up: bills after ${shortDate(until)}${nm} need ${money(Math.ceil(-S - 1e-9))} more than your next paycheck holds for them. ${pp.wait >= -S - 0.005 ? `The ${moneyExact(pp.wait)} still coming covers it.` : `If it's still short then, it comes out of here.`}</div>` : '';
    return `<div class="vl-hero pp-panel mh-have"><button class="mh-cu" data-cu-open="1" aria-label="Month cushion: ${money(H)}${T > 0 ? ` of ${money(T)}` : ''}. Open it">`
      + `<span class="vl-k">Cushion${T > 0 ? ` <small>of ${money(T)}</small>` : ''} ›</span><span class="vl-total num${H < 0 ? ' bad' : ''}">${H < 0 ? '−' + moneyExact(-H) : moneyExact(H)}</span>`
      + (T > 0 ? `<span class="mh-bar" aria-hidden="true"><i style="width:${(f * 100).toFixed(1)}%"></i></span>` : '')
      + `<span class="vl-sub">Yours until payday${until ? `, ${shortDate(until)}` : ''}, after the bills due by then and your spending money</span></button>${heads}${wait}</div>`;
  }
  function homeHTML(now) {
    const pu = purseNow(now), n = partySize(), d = Math.max(0, Math.min(6, Math.floor((now - weekStart(new Date(now))) / DAY_MS))), days = 7 - d, t = todayLeft(pu, new Date(now)), L = pu.purseLeft;
    const over = Math.ceil(-L - 1e-9), go = over > 0 ? `Overdrawn ${money(over)} · Cover it` : '';   // v144: no set-out button; the week starts on its own (any day there's room since v268)
    const plan = Math.min(Number(state.partyPlan || 0), planCap()), k = Math.min(Number(state.partyPlan || 0), partyRoom()), dl = sendNowDays(new Date(now));
    let h = clockBanner();
    const on = n || pu.P || pu.spent;   // v150: Left today over the day stacks; the week's line under them
    if (on && !heroOpen) {   // v186: the day stacks on their own, as Jordan drew it; a tap opens the card for more
      const cg = (state.packs || []).length && pu.P > 0;   // v275: categories get their own card (daily and weekly)
      const pd = aheadDay(now, cg, t, L, days);
      h += haveHTML(now);   // v322
      h += `<div class="vl-hero pp-panel hc${cg ? ' dw' : ''}" role="group" aria-label="This week, day by day">` + `<div class="mh-wk"><span>This week</span><b class="num${L < 0 ? ' bad' : ''}">${L < 0 ? '−' + moneyExact(-L) : moneyExact(L)}</b></div>` + hcKeys(cg ? dwHTML(now) : todayNumHTML(t)) + (cg ? '' : stacksHTML(now))
        + (pu.carried > 0.005 || t < 0 || pd ? `<div class="vl-sub hl-line">${tidyLine(pu, n, t, days, L, over, plan, now, on, pd)}</div>` : '')
        + (go ? `<button class="hl-go${over > 0 ? ' over' : ''}" data-hl="go">${esc(go)}</button>` : '') + (wkEd ? `<!--hc-ed${cg ? '' : '+'}-->` : '') + `</div>`;
    } else
    h += `<div class="vl-hero pp-panel${on ? ' hx' : ''}"${on ? ' aria-expanded="true"' : ''}><div class="vl-k">${on ? 'Left today' : 'Left this week'}</div><div class="vl-total num${on ? '' : L < 0 ? ' bad' : ''}">${on ? money(Math.max(0, t)) : L >= 0 ? money(L) : '−' + money(over)}</div>`
      + (on ? stacksHTML(now) : '')
      + (!on || pu.carried > 0.005 || t < 0 ? `<div class="vl-sub hl-line">${tidyLine(pu, n, t, days, L, over, plan, now, on, on ? aheadDay(now, false, t, L, days) : null)}</div>` : '')   // v151: only a warning, or before spending is set
      + (on ? '' : ''
      + `<div class="hl-wk" role="group" aria-label="Weekly spending"><button class="hl-wkb" data-hl="wm" aria-label="$7 a week less"${wkShown() <= 0 ? ' disabled' : ''}>−</button>`
      + `<span>Weekly spending: <b class="num">${money(wkShown())}</b> (${moneyExact(wkShown() / 7)} a day)<small>${wkDraft != null ? `was ${money(weeklyAmt())}` : n ? "this week's spending is running · a change counts from today" : plan ? `${money(plan * 7 * WORKER_DAY)} a week · starts Monday` : 'Set your weekly spending with + to start'}</small></span>`
      + `<button class="hl-wkb" data-hl="wp" aria-label="$7 a week more"${wkShown() >= wkTop() ? ' disabled' : ''}>+</button></div>`
      + (wkDraft != null ? `<div class="hl-wkc"><button class="pp-chip" data-hl="wkno">Cancel</button><button class="primary" data-hl="wkok">Confirm ${money(wkShown())} a week</button></div>` : ''))   // v311: − / + here showed nothing (the draft lived only in Settings)
      + (go ? `<button class="hl-go${over > 0 ? ' over' : ''}" data-hl="go">${esc(go)}</button>` : '')
      + (on ? nextPayHTML(now) : '')   // v193
      + (on ? '' : (bankCheckDue() ? `<div class="bc-nudge"><span>Weekly bank check</span><button class="link" data-bc="go">Check</button><button class="link muted" data-bc="later">Later</button></div>` : '')) + `</div>`;
    { const it = newsNow(now)[0]; if (it) h += `<div class="hl-news" role="status"><span>${it.html}</span> <span class="hl-news-act">${it.acts}</span></div>`; }   // v267: one at a time
    // v151: the weekly spending −/+ and the bank check, in their own plain panel at the foot
    const dv = wkDraft == null ? weeklyAmt() : wkDraft, dirty = wkDraft != null, dk = Math.ceil(dv / 7 / WORKER_DAY - 1e-9), wkTake = dirty ? wkTakes(dk) : [];   // v177: a draft until Confirm; v294: dollars
    // v320 (Jordan: set $140 a week, Home showed ~$15 a day): name what the categories take, then what's left for Anything a day
    const wkSplit = dv => { const ps = (state.packs || []).filter(p => Number(p.amount || 0) > 0), want = sum(ps, p => Number(p.amount || 0)), sc = want > dv && want > 0 ? dv / want : 1, cash = x => Math.abs(x - Math.round(x)) < 0.005 ? money(Math.round(x)) : moneyExact(x);
      if (!ps.length) return `${moneyExact(dv / 7)} a day`;
      return ps.map(p => `${esc(p.name)} ${p.daily ? `${moneyExact(Number(p.amount) * sc / 7)} a day` : cash(Number(p.amount) * sc)}`).concat(`Anything ${moneyExact(Math.max(0, dv - want * sc) / 7)} a day`).join(' · '); };
    const wkSet = ''
      + `<div class="hl-wk" role="group" aria-label="Weekly spending"><button class="hl-wkb" data-hl="wm" aria-label="$7 a week less"${dv <= 0 ? ' disabled' : ''}>−</button>`
      + `<span><label class="hl-wkin"><span>$</span><input class="wk-amt" type="number" inputmode="decimal" min="0" step="1" value="${dv}" aria-label="Weekly spending in dollars"></label> a week<small>${dv ? `${wkSplit(dv)} · ` : ''}${dirty ? `was ${money(weeklyAmt())}` : n ? 'a change counts from today' : plan ? 'starts Monday' : 'Set it with + to start'}</small></span>`   // v175: dollars, no villagers
      + `<button class="hl-wkb" data-hl="wp" aria-label="$7 a week more"${dv >= wkTop() ? ' disabled' : ''}>+</button></div>`   // v154: in Settings > Money
      + (dirty ? `<p class="hl-wkn">${wkTake.length ? `Confirm takes ${wkTake.map(([id, c]) => `${money((c) * WORKER_DAY)} a day off ${esc(potName(id))}`).join(', ')}.` : dk < plan || dv < weeklyAmt() ? 'The rest stays in Savings.' : 'Money nobody\'s using covers it.'}${n ? ' This week changes from today, for the days left.' : dk > plan && autoStartOk() ? ' It starts today, for the days left.' : ''}</p>`
        + `<div class="hl-wkc"><button class="pp-chip" data-hl="wkno">Cancel</button><button class="primary" data-hl="wkok">Confirm ${money(dv)} a week</button></div>` : '')
      + (!n && k > 0 && over <= 0 ? `<button class="primary" data-hl="now" style="width:100%; margin-top:10px">Start now with ${money(c2(k * dl * WORKER_DAY * wkR()))} for the days left</button>` : '');   // v173: moved from the top card
    { const pg = document.getElementById('palGrid'), ph = palHTML(); if (pg && pg.innerHTML !== ph) pg.innerHTML = ph; palApply(); }   // v214
    { const sn = document.getElementById('smNext'), nx = nextPayNow(now);   // v208: the next paycheck, any time before payday
      const nh = !nx ? '' : nx.entered
        ? `<button class="pp-tip pp-next" data-pay-open="${esc(nx.key)}" style="width:100%"><span><b>Next paycheck · ${shortDate(nx.date)}</b><small>${moneyExact(nx.D)} · starts on payday · tap to fix</small></span></button>`
        : `<button class="primary" data-pay-open="${esc(nx.key)}" style="width:100%; min-height:48px">Enter your ${shortDate(nx.date)} paycheck</button>`;
      if (sn && sn.innerHTML !== nh) sn.innerHTML = nh; }
    { const sw = document.getElementById('setWk'); if (sw && sw.vlSrc !== wkSet) { sw.vlSrc = wkSet; swap(sw, wkSet); } const rb = document.getElementById('smRound'); if (rb) rb.textContent = state.roundOff ? 'Stop rounding off' : 'Round off'; const bk = document.getElementById('smBank'); if (bk) bk.classList.toggle('due', bankCheckDue()); }   // v311 (E8): by what was drawn, not innerHTML
    // v140: the foot of the main screen: the packs, then this week's spends, then the Party page and All spending
    const packs = (state.packs || []).length && pu.P > 0 ? packsNow() : [], ws = weekSpends().slice().reverse();
    let foot = `<section class="pp-panel hl-week" aria-label="This week"><div class="pp-top"><h3 class="pp-h2">This week</h3><span class="pp-tot">${ws.length ? `<b class="num">${money(sum(ws, x => charged(x)))}</b> spent` : ''}</span></div>`;
    if (packs.length) foot += `<div class="hl-packs">${packs.map(p => `<div class="hl-pk"><b>${esc(p.name)}</b><span class="num">${money(p.left)} <small>of ${money(p.amt)}</small></span><span class="vl-fill${p.left <= 0 ? ' due' : ''}"><span style="width:${(c01(p.amt > 0 ? p.left / p.amt : 0) * 100).toFixed(1)}%"></span></span></div>`).join('')}</div>`;
    foot += '<div>';
    for (const x of ws.slice(0, 8)) foot += `<div class="vl-row"><span class="vl-r1"><b>${esc(x.description || 'Anything')}</b><span class="num">−${showCents(Math.round(-x.amount * 100))}</span></span><span class="vl-r2"><span>${new Date(x.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${x.unsorted && (state.packs || []).length ? ' · to sort' : ''}</span><span>${charged(x) !== -x.amount ? `counts as ${money(charged(x))}` : ''}</span></span></div>`;
    if (ws.length > 8) foot += `<p class="vl-empty">and ${ws.length - 8} more in All spending.</p>`;
    if (!ws.length) foot += `<p class="vl-empty">Nothing spent yet this week. Tap Spend to add one.</p>`;
    foot += `</div><div class="pp-chips"><button class="pp-chip" data-hl="tx">All spending</button></div></section>`;
    foot += `<section class="pp-panel hl-budget" aria-label="Weekly budget"><div class="pp-top"><h3 class="pp-h2">Weekly budget</h3></div>${wkSet}</section>`;   // v175
    tailHtml = foot;
    h = h.replace(/<!--hc-ed(\+?)-->/, (m, w) => `<div class="hc-ed"><div class="hc-edh"><b>Weekly budget</b><button class="pp-chip" data-hl="edx">Done</button></div>${wkSet}${w ? '<button class="pp-chip hc-wk" data-hl="week">This week in detail ›</button>' : ''}</div>`);   // v310
    return h;
  }
  let tailHtml = '';
  /* v148 (Tidy): the line under the big number. What's spent of the purse, then the days left and the even share of
     what's left (the last day: its name); "over today" only when today's share is spent past. */
  // v267 (Jordan): when the week isn't running and it could, a link to Start now (it lives in Settings > Money since v173)
  const startLink = over => !partyNow() && over <= 0 && Math.min(Number(state.partyPlan || 0), partyRoom()) > 0 ? '<br><button class="link hl-start" data-hl="start">Start it in Settings ›</button>' : '';
  function tidyLine(pu, n, t, days, L, over, plan, now, st, pd) {
    const day = st ? '' : days === 1 ? `${new Date(now).toLocaleDateString(undefined, { weekday: 'long' })}, last day` : `${days} days left, ${money(Math.floor(Math.max(0, L) / days + 1e-9))} a day from here`;
    const per = pd && st ? `<br>Now <b>${money(pd.a)} a day</b> ${days === 2 ? 'for tomorrow' : `for the ${days - 1} days left`}` : '';   // v316
    if (pu.carried > 0.005) return carriedLine(pu, over > 0 ? '' : ' · <button class="link" data-hl="go">Cover it</button>') + (day && (pu.P || pu.spent) ? `<br>${day}` : '') + per;
    if (!pu.P && !pu.spent) return plan ? "This week's spending isn't running yet" + startLink(over) : 'No weekly spending set yet';
    return `<b>${money(pu.spent)}</b> spent of ${money(pu.P)}${n ? (day ? ' · ' + day : '') : " · this week's spending isn't running" + startLink(over)}`
      + (t < 0 && days > 1 ? ` · <b class="bad">${money(Math.ceil(-t - 1e-9))} over today</b>${st ? ', taken from the days ahead' : ''}` : pd && st ? ` · <b class="bad">${money(Math.ceil(pd.took - 1e-9))} taken from the days ahead</b>` : '')
      + per;
  }
  // v316 (Jordan: overspent today, "how much I now have per day"): the even share of what the days ahead have (daily categories only, whole dollars)
  //   null unless today's spending took from the days ahead; took = dollars taken
  function aheadDay(now, cg, t, L, days) {
    if (days < 2) return null;
    if (cg) { const W = catWeekNow(now); return W.took > 0 ? { a: Math.floor(sum(W.daily, x => x.fut) / 100 / (days - 1) + 1e-9), took: W.took / 100 } : null; }
    return t < 0 ? { a: Math.floor(Math.max(0, L) / (days - 1) + 1e-9), took: -t } : null;
  }
  let heroOpen = false;   // v184: the weekly card starts condensed
  let wkEd = false;   // v310: the weekly budget open inside the Left today card
  function renderHome() {
    const box = $('homeList'); if (!box || home !== 'list') return;
    const now = Date.now(); paint(box, homeHTML(now));
    const tail = $('mainTail'); if (tail) paint(tail, tailHtml);   // v140
  }

  /* ---- the keypad, summoned by the Spend button ---- */
  function kp(on) {
    on = !!on && home === 'list';
    if (H.classList.contains('kp-on') === on) return;
    H.classList.toggle('kp-on', on);
    if (on) { setSheet(true, false); requestAnimationFrame(() => { sheetFit(); pickChanged(); }); }
    else if (home === 'list') setTimeout(() => { if (!H.classList.contains('kp-on')) $('spendFab').focus({ preventScroll: true }); }, 0);
  }
  $('spendFab').onclick = () => kp(true);
  $('cdApply').onclick = () => planApply(); $('cdUndo').onclick = () => planUndo();   // v306; v309 Planning mode
  $('spareFab').onclick = () => collectChange();   // v200
  $('kpScrim').onclick = () => kp(false);
  $('kpX').onclick = () => kp(false);   // v171
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && H.classList.contains('kp-on') && $('askBox').classList.contains('hidden')) kp(false); });

  /* ---- the toggles ---- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tview], [data-hview], #vlBell'); if (!b) return;
    if (b.id === 'vlBell') { sound = !sound; put(KS, sound ? '1' : '0'); apply(); if (sound) chime(); return; }
    return;   // v140: the island and scene toggles are gone
  });
  // v138: tap a card to open it (in place, so the page doesn't jump)
  var xId = null;   // v225: the card open in place
  /* v226: the pip swirl. Pips spiral out of the tap point and settle on a grid over the new view, the view's lines
     step in, then the pips pop out one by one. Closing runs it backwards into the card's head. */
  const pxCard = id => $('townList').querySelector(`[data-vl-row="${CSS.escape(id)}"]`);
  var pxCls = {};   // classes the animation holds on a card, put back after a repaint
  const pxSet = (id, k, on) => { if (on) pxCls[k] = id; else delete pxCls[k]; const c = pxCard(id); if (c) c.classList.toggle(k, on); };
  /* v229: a ring of pixel dust forms where you tapped, then bursts outward as the view appears and fades as it goes */
  function pxClose(now) {
    const id = xId, c = id && $('townList').querySelector(`[data-vl-row="${CSS.escape(id)}"]`);
    const fin = () => { xId = null; Town.closeInline(); xShut(id, c); };
    if (!c || now || lessMotion() || !tbCache[id]) { fin(); return; }
    slRun(id, false, tbCache[id], fin);   // v236: the tide break, backwards
  }
  window.pxClose = pxClose;
  function xShut(id, c) {   // the card's open look goes
    opened.delete(id); pxSet(id, 'px-out', false); const c2 = pxCard(id) || c;
    if (c2) { c2.classList.remove('xo', 'open'); const m = c2.querySelector('.pp-more'); if (m) m.hidden = true; const h = c2.querySelector('.pp-head'); if (h) h.setAttribute('aria-expanded', 'false'); }
  }
  // Town can close a card's view by itself (another tab, Escape, Move money): the card closes with it
  function pxSync() { if (xId && !(Town.inline && Town.selected === xId)) { const id = xId; xId = null; xShut(id); } }
  window.pxSync = pxSync;
  /* v236: Tide break. Jordan's settings (01:32): Total 1050ms, Ripple speed .1, Pixel flight .15, Burst 1.8, Sharpen 0, Glow 0, Card grow .2 */
  const tbCache = {}; let tbBusy = false;
  function tbPrep(c) {   // before the card opens: a copy of it as it looks closed, and its pixels
    const r = c.getBoundingClientRect();
    return { lay: slMeasure(c), H1: r.height, W: r.width, left: r.left, top: r.top };   // v311 (E12): the layout only (the canvas copy was never read)
  }
  /* v241 (Jordan 02:14): no ripple. The border grows and the words slide into place in layers:
     what was already on the card glides to its new spot, the new rows slide down from under it, deeper ones farther and slower */
  function slMeasure(c) {
    const R = c.getBoundingClientRect(), out = {}, n = {}, h = c.querySelector('.pp-head');
    if (h) for (const e of h.querySelectorAll('*')) { if (e.children.length && e.tagName !== 'B') continue; const r = e.getBoundingClientRect(); if (!r.width) continue;
      const key = e.tagName + '.' + e.className; n[key] = (n[key] || 0) + 1; out[key + ':' + n[key]] = [r.left - R.left, r.top - R.top]; }
    return out; }
  function slLayers(c) {   // the rows that are new when the card opens, top to bottom
    const L = [], R = c.getBoundingClientRect();
    for (const k of c.children) { if (k.classList.contains('pp-head') || k.classList.contains('tb-copy')) continue;
      const kids = k.classList.contains('pp-xv') ? [...k.children] : [k];
      for (const e of kids) { const r = e.getBoundingClientRect(); if (r.height || r.width) L.push([e, r.top - R.top]); } }
    return L; }
  function slRun(id, open, k, done) {
    const c = pxCard(id); if (!c || !k) { if (done) done(); return; }
    tbBusy = true;
    const H1 = k.H1, H2 = Math.max(H1, c.offsetHeight), adj = c.offsetHeight - parseFloat(getComputedStyle(c).height) || 0;
    const ez = 'cubic-bezier(.4,0,.2,1)', A = [], f = open ? 1 : .6;
    const now = slMeasure(c);
    c.style.overflow = 'hidden';
    A.push(c.animate([{ height: H1 - adj + 'px' }, { height: H2 - adj + 'px' }], { duration: 560 * f, easing: ez, direction: open ? 'normal' : 'reverse', fill: 'both' }));   // the border
    const h = c.querySelector('.pp-head'), n = {};
    if (h) for (const e of h.querySelectorAll('*')) { if (e.children.length && e.tagName !== 'B') continue; const r = e.getBoundingClientRect(); if (!r.width) continue;
      const key = e.tagName + '.' + e.className; n[key] = (n[key] || 0) + 1; const a = k.lay[key + ':' + n[key]], b = now[key + ':' + n[key]];
      const fr = a && b ? [{ transform: `translate(${(a[0] - b[0]).toFixed(1)}px, ${(a[1] - b[1]).toFixed(1)}px)` }, { transform: 'none' }]
        : [{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'none', opacity: 1 }];   // the name and amount glide; a new label fades in
      A.push(e.animate(fr, { duration: 420 * f, easing: ez, direction: open ? 'normal' : 'reverse', fill: 'both' })); }
    for (const [e, y] of slLayers(c)) { const dy = Math.max(0, y - H1 + 24) * .5, ms = Math.min(760, 440 + y * .25) * f;   // deeper rows travel farther and slower
      A.push(e.animate([{ transform: `translateY(${(-dy).toFixed(1)}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: ez, direction: open ? 'normal' : 'reverse', fill: 'both' })); }
    let left = A.length; const end = () => { if (--left > 0) return;
      if (!open && done) done();
      for (const a of A) a.cancel(); const c2 = pxCard(id); if (c2) c2.style.overflow = ''; c.style.overflow = ''; tbBusy = false; if (open && done) done(); };
    for (const a of A) a.finished.then(end, end);
    if (!A.length) { tbBusy = false; if (done) done(); }
  }
  function tbOpen(id, pt, k) {
    if (!k || lessMotion()) return;
    k.cx = pt ? pt.clientX - k.left : k.W / 2; k.cy = pt ? pt.clientY - k.top : 30; tbCache[id] = k;
    const c = pxCard(id); if (c) { const top = c.getBoundingClientRect().top; if (top + Math.min(c.offsetHeight, innerHeight * .7) > innerHeight - 90 || top < 0) scrollBy({ top: top - 70, behavior: 'smooth' }); }
    slRun(id, true, k, null);   // v241: layered slide (Jordan); the tide is tbTide
  }
  function toggleCard(id, ev) {
    const c = $('townList').querySelector(`[data-vl-row="${CSS.escape(id)}"]`); if (!c) return;
    if (tbBusy) return;   // v236: let the pixels land first
    if (xId === id) { pxClose(); return; }
    if (xId) pxClose(true);
    const sl = c.querySelector('.pp-xv'), prep = sl && !lessMotion() ? tbPrep(c) : null;   // v236: the card as it looks closed
    if (sl) { opened.add(id); c.classList.add('open'); const m = c.querySelector('.pp-more'); if (m) m.hidden = false; const h = c.querySelector('.pp-head'); if (h) h.setAttribute('aria-expanded', 'true');
      if (Town.openInline(id, sl)) { xId = id; c.classList.add('xo'); const pt = ev && ev.clientX ? { clientX: ev.clientX, clientY: ev.clientY } : null; renderTown(); tbOpen(id, pt, prep); return; } }
    const on = !opened.has(id); if (on) opened.add(id); else opened.delete(id);
    c.classList.toggle('open', on); const m = c.querySelector('.pp-more'); if (m) m.hidden = !on;
    const h = c.querySelector('.pp-head'); if (h) h.setAttribute('aria-expanded', String(on));
  }
  /* v184: hold a card (0.4 s) to pick it up, drag it, let go to drop. The order is saved in state.cardOrder. */
  let dragC = null; const holdMove = e => { if (dragC) e.preventDefault(); };   // v311 (E16): a held card's touch, on the card lists only (renderTown)
  { let tm = null, st = null, moved = false, eat = false;
    const list = () => dragC && dragC.parentNode;   // v311 (E7): the list the held card is in (pots or debts)
    const cancel = () => { clearTimeout(tm); tm = null; st = null; };
    const place = y => {
      const c = dragC, L = list(); if (!c || !L) return;
      c.style.transform = ''; const sibs = [...L.querySelectorAll(':scope > .pp-card')].filter(x => x !== c);
      for (const x of sibs) { const r = x.getBoundingClientRect(), mid = r.top + r.height / 2;
        if (y - st.off + c.offsetHeight / 2 < mid) { if (x.previousElementSibling !== c) L.insertBefore(c, x); break; }
        if (x === sibs[sibs.length - 1] && x.nextElementSibling !== c) L.appendChild(c); }
      const nat = c.getBoundingClientRect().top; c.style.transform = `translateY(${(y - st.off - nat).toFixed(1)}px)`;
    };
    $('townList').addEventListener('pointerdown', e => {
      const c = e.target.closest('.pp-list.pp-one > .pp-card[data-vl-row]'); if (!c || e.button > 0 || e.target.closest('.pp-more, .pp-crew, .pp-meta, .pp-acts, .pp-xv')) return;
      cancel(); st = { x: e.clientX, y: e.clientY, id: e.pointerId, c }; moved = false;
      tm = setTimeout(() => { if (!st) return; tm = null; dragC = c; st.off = st.y - c.getBoundingClientRect().top; c.classList.add('drag'); H.classList.add('pp-dragging'); }, 400);
    });
    window.addEventListener('pointermove', e => {
      if (!st || e.pointerId !== st.id) return;
      if (!dragC) { if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) cancel(); return; }
      moved = true; e.preventDefault(); place(e.clientY);
    }, { passive: false });
    const end = e => {
      if (!st || (e && e.pointerId !== st.id)) return; const c = dragC; cancel();
      if (!c) return; dragC = null; eat = true; setTimeout(() => { eat = false; }, 400);
      c.classList.remove('drag'); c.style.transform = ''; H.classList.remove('pp-dragging');
      if (moved) { state.cardOrder = [...$('townList').querySelectorAll('.pp-list.pp-one > .pp-card[data-vl-row]')].map(x => x.dataset.vlRow); save(); }   // v311 (E7): pots, then debts, each in its own order
      $('townList').vlHtml = ''; renderTown();   // v186: always repaint, so a card dropped in the other group settles back
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    $('townList').addEventListener('click', e => { if (eat) { eat = false; e.stopPropagation(); e.preventDefault(); } }, true);
    $('townList').addEventListener('contextmenu', e => { if (e.target.closest('.pp-list.pp-one > .pp-card')) e.preventDefault(); });
  }
  function closePick() { const id = pickFor; pickFor = null; renderTown(); const p = id && $('townList').querySelector(`[data-crew="${CSS.escape(id)}"][data-d="1"]`); if (p && !p.disabled) p.focus({ preventScroll: true }); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pickFor && townOn() && $('askBox').classList.contains('hidden')) closePick(); });
  $('townList').addEventListener('click', async e => {
    if (e.target.id === 'vlPick') { closePick(); return; }   // the shade around the picker
    const b = e.target.closest('button');
    if (!b) { const c = e.target.closest('.pp-card[data-vl-row]:not(.open)'); if (c) toggleCard(c.dataset.vlRow, e); return; }   // v182: a tap anywhere on a closed card opens it
    if (b.dataset.planGo) { planStart(); return; }   // v309
    if (b.dataset.optGo) { optimizePlan(); return; }   // v314
    if (b.dataset.ppOpen) { toggleCard(b.dataset.ppOpen, e); return; }
    if (b.dataset.ppClose) { closePick(); return; }
    if (b.dataset.mw) { if (b.dataset.mw === 'budget') { setManage(false); wkEd = true; showView('budget'); const hc = document.querySelector('#homeList .vl-hero.hc'); if (!hc) { wkEd = false; showView('settings'); }
      const f = hc ? hc.querySelector('[aria-expanded="true"], .hl-wkb:not(:disabled)') : document.querySelector('#setWk .hl-wkb:not(:disabled)'); if (f) f.focus({ preventScroll: true }); } else setManage(b.dataset.mw === '1'); return; }   // v190; v311 (E10): Change opens the weekly budget (in the Left today card, or in Settings before weekly spending is set)
    if (b.dataset.collect) { collectChange(); return; }
    if (b.dataset.fill) { topOff(b.dataset.fill); return; }   // v147
    if (b.dataset.debt) { openDebt(b.dataset.debt); return; }
    if (b.dataset.debtNew) { openDebtForm(null); return; }   // v295
    if (b.dataset.edit && debtOf(b.dataset.edit)) { openDebtForm(b.dataset.edit); return; }
    if (b.dataset.edit) { Town.edit(b.dataset.edit); renderTown(); return; }   // v269
    if (b.dataset.debtUndo) { const t = state.transfers.find(x => x.id === b.dataset.debtUndo); if (t && await ask(`Take back the ${moneyExact(t.amount)} payment? ${potName(t.from)}, its goal and your bank go back up by it.`)) { undoPayment(t.id); toast('Payment taken back'); } return; }
    if (b.dataset.lock) { setLock(b.dataset.lock, !isLocked(b.dataset.lock)); return; }
    if (b.dataset.delPot) { await deletePot(b.dataset.delPot, 'savings'); return; }   // v167
    if (b.dataset.color) { state.colors = state.colors || {}; state.colors[b.dataset.color] = b.dataset.ck; save(); renderTown(); return; }   // v153
    if (b.dataset.pickFrom) { addVillager(b.dataset.pickTo, b.dataset.pickFrom); return; }
    if (b.dataset.crew) {
      if (Number(b.dataset.d) > 0 && manageOn && savers() > 0) { addVillager(b.dataset.crew, 'savings'); return; }   // v190: straight from Savings
      if (Number(b.dataset.d) > 0) { pickFor = pickFor === b.dataset.crew ? null : b.dataset.crew; pickIn = !!pickFor; renderTown();
        const f = pickFor && $('townList').querySelector('#vlPick .vl-pk:not(:disabled), #vlPick [data-pp-close]'); if (f) f.focus({ preventScroll: true }); }
      else removeVillager(b.dataset.crew);
      return;
    }
    if (b.dataset.ro) { if (b.dataset.ro === 'stop') roundOffStop(); else roundOffStart(); return; }
    if (b.classList.contains('vl-pay')) { await billClick(e); return; }
    const o = b.dataset.vlOpen; if (!o) return;
    if (o === 'party') { showView('party'); render(); return; }
    if (o === 'editbills') { openBillEdit(); return; }
    Town.open(o);
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-cu-open]')) Town.open('cushion'); });   // v322
  $('mainScroll').addEventListener('click', e => {   // v140: the whole main screen
    if (e.target.closest('#homeList .vl-hero.hc') && !e.target.closest('button, input, label, .hc-ed')) { wkEd = !wkEd; if (!wkEd) wkDraft = null; renderHome(); return; }   // v310 (Jordan): a tap opens the weekly budget in the card   // v279 (Jordan): anywhere on the weekly card opens the week in detail
    { const hh = e.target.closest('#homeList .vl-hero.hx'); if (hh && !e.target.closest('button, [data-dot]')) { heroOpen = !heroOpen; renderHome(); return; } }   // v184
    const dt = e.target.closest('[data-dot]'); if (dt) { cycleDot(dt.dataset.dot); return; }   // v136
    const nw = e.target.closest('[data-news]'); if (nw) { newsAct(nw.dataset.news); return; }   // v267
    const bc = e.target.closest('[data-bc]'); if (bc) { if (bc.dataset.bc === 'go') openBankCheck(false); else bankCheckLater(); return; }
    const b = e.target.closest('[data-hl]'); if (!b) return;
    if (b.dataset.hl === 'go') $('scenePurse').click();
    else if (b.dataset.hl === 'wm' || b.dataset.hl === 'wp') wkStep(b.dataset.hl === 'wm' ? -1 : 1);   // v144; v177: a draft
    else if (b.dataset.hl === 'wkok') { if (b.closest('.hc-ed')) wkEd = false; wkConfirm(); }
    else if (b.dataset.hl === 'wkno') { if (b.closest('.hc-ed')) wkEd = false; wkDraft = null; render(); }
    else if (b.dataset.hl === 'edx') { wkEd = false; wkDraft = null; render(); }
    else if (b.dataset.hl === 'week') { wkEd = false; wkDraft = null; showView('week', 1); }
    else if (b.dataset.hl === 'now') sendPartyNow();
    else if (b.dataset.hl === 'tx') { showView('tx'); render(); }
    else if (b.dataset.hl === 'start') {   // v267: straight to Start now in Settings > Money
      showView('settings', 1); render();
      setTimeout(() => { const x = document.querySelector('#setWk [data-hl="now"]'); if (x) { x.scrollIntoView({ block: 'center', behavior: lessMotion() ? 'auto' : 'smooth' }); x.focus({ preventScroll: true }); } }, 60);
    }
    else { showView('party'); render(); }
  });
  $('mainScroll').addEventListener('keydown', e => {   // v311 (E9): Enter or Space on the weekly card's buttons, as a tap
    const t = e.target; if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute('role') === 'button' && t.closest('#homeList .vl-hero')) { e.preventDefault(); t.click(); }
  });
  // four times a second while a list is on screen: the numbers move, the bars fill, and the total pings on each $1
  setInterval(() => {
    if (document.hidden) { lastWhole = null; seen = {}; return; }
    if (state.roundOff && Date.now() >= roNext) { window.render(); return; }   // v129: a place reached its dollar
    const now = Date.now();
    if (townOn() && $('townList').vlHtml) { if (now - lastSnap > 5000) wake(now); else fill($('townList'), townVals(now)); moveBars(now); lastSnap = Date.now(); kick(); } else { lastWhole = null; seen = {}; live = {}; }   // v311: back from a pause, wake first (E6, E13); frames on (E17); no homeVals, it filled nothing (E1)
  }, 250);
  function shown(v) {
    if (v !== 'budget') kp(false);
    if (v !== 'budget') { lastWhole = null; seen = {}; live = {}; if (pickFor) { pickFor = null; H.classList.remove('pp-pick'); } }   // v138: and the picker closes
    if (v === 'budget') { renderHome(); renderTown(); }   // v140: one screen
  }
  function render() { renderTown(); renderHome(); }
  /* v196: since you last looked. Each card's amount is saved now and then; opening the app (or coming back after a
     minute) pours in what it earned since, one card after another, as Collect does. Display only. */
  const SEEN_KEY = CHANNEL === 'main' ? 'budget-seen-v1' : 'budget-seen-v1-' + CHANNEL; let caught = 0;   // v311: one per copy
  const seenRead = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch (e) { return null; } };
  function seenSave() { if (window.__wiping) return;
    const now = Date.now(), old = seenRead(), v = old && old.v || {}; let n = 0;
    for (const [id, L] of Object.entries(live)) if (pipInfo[id] && L.el && L.el.isConnected) { v[id] = liveVal(L, now); n++; }   // the real amount, pouring or not
    if (n) try { localStorage.setItem(SEEN_KEY, JSON.stringify({ t: now, v })); } catch (e) {}
  }
  let woke = false;   // v311: the first drawing has caught up
  function catchUp(extra = 0) {   // v311: extra, how long the pours wait (open 1200 ms, back 400 ms, as before)
    const S = seenRead(), now = Date.now(); if (!S || !S.v || now - S.t < 60000 || lessMotion() || manageOn) return;
    if ($('view-budget') && $('view-budget').classList.contains('hidden')) return;
    for (const [id, L] of Object.entries(live)) if (!L.el || !L.el.isConnected) L.el = $('townList').querySelector(`[data-s="${CSS.escape(id)}"]`);   // v311: before any frame found them
    const at = id => { const i = rows.findIndex(o => o.id === id); return i < 0 ? 1e9 : i; };
    Object.entries(live).filter(([id, L]) => pipInfo[id] && S.v[id] != null && L.el && L.el.isConnected && !L.pour)
      .map(([id, L]) => [id, Math.floor((liveVal(L, now) - S.v[id]) * 100 + 1e-6)]).filter(x => x[1] >= 1)
      .sort((a, b) => at(a[0]) - at(b[0])).forEach(([id, c], i) => { if (pourOne(id, c, extra + 300 + i * POUR_GAP, true)) caught++; });
    seenSave();
  }
  // a heartbeat: amounts are only saved while the page is awake, so a phone waking up late never saves "now" over "then"
  let hb = Date.now(), hbN = 0; const awake = () => Date.now() - hb < 5000;
  setInterval(() => { const now = Date.now(), gap = now - hb; hb = now; if (gap > 5000) { setTimeout(catchUp, 400); return; } if (!document.hidden && ++hbN % 5 === 0) seenSave(); }, 2000);
  // v311 (E6, E13): back on screen (or awake after a pause), the cards read the books now and pour in what came since you
  // last looked before any frame draws, so an amount never runs ahead of the money or drops back to pour up again
  function wake(now = Date.now()) { lastSnap = now; if (townOn() && $('townList').vlHtml) { fill($('townList'), townVals(now, true)); catchUp(400); kick(); } lastSnap = Date.now(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (awake()) seenSave(); } else { hb = Date.now(); wake(); } });
  window.addEventListener('pagehide', () => { if (awake()) seenSave(); });
  return { render, shown, kp, get caught() { return caught; }, catchUp, seenDbg: () => ({ n: Object.keys(live).length, pi: Object.keys(pipInfo).length, con: Object.values(live).filter(L => L.el && L.el.isConnected).length }), get town() { return town; }, get home() { return home; }, collected(list) {
    seen = {}; clearPours();   // v148: Pour, instead of the coins and the roll
    if (lessMotion()) return;
    const at = id => { const i = rows.findIndex(o => o.id === id); return i < 0 ? 1e9 : i; };
    list.filter(x => x[2] > 0).sort((a, b) => at(a[0]) - at(b[0])).forEach(([id, , c], i) => pourOne(id, c, i * POUR_GAP, true));
  }, toppedOff(to, plus, minus) {   // v147: as Collect: the target's bar rolls the cents in and pings each one (snap's
    // catch-up, the same as Collect's); each giver's bar pings once per cent it gave (it already shows what it has left)
    tops++;   // v148: the same pour as Collect: the target pours, then each giver drains smoothly, 260 ms apart
    if (lessMotion()) return;
    for (const [id] of minus) if (live[id] && live[id].pour) live[id].pour = null;
    if (live[to]) live[to].pour = null;
    pourOne(to, plus, 0, true);
    minus.forEach(([id, n], i) => { if (pourOne(id, n, (i + 1) * POUR_GAP, false)) drains++; });
  }, get tops() { return tops; }, get drains() { return drains; }, get pings() { return pings; }, get pours() { return pours; }, get shines() { return shines; }, get nudges() { return nudges; }, pouring: () => Object.keys(live).filter(id => live[id].pour), get ticks() { return ticks; }, get bursts() { return bursts; }, get pops() { return pops; }, get glints() { return glints; }, get fills() { return fills; }, get sweeps() { return sweeps; }, get cglows() { return cglows; }, unitFor: perDay => unitFor(perDay / DAY_MS),
    roll: id => { const L = live[id], el = L && L.rlEl, R = el && el.rl; return R ? { txt: R.txt, C: R.C, at: R.ds.map(D => D.at), ds: R.ds.map(D => D.d) } : null; }, roundStep, pips: id => pipInfo[id] || null, stepFor: perDay => stepFor(perDay / DAY_MS), stepOf: id => live[id] ? live[id].step : null, get coins() { return coins; }, get sound() { return sound; } };
})();
