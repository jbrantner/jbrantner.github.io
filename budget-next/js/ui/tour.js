'use strict';
/* v287: the first-launch tour, like an idle game's "tap here" walkthrough. It runs once after setup (or the sample data),
   and again from Settings > Show the tour. Hands-on steps let the real buttons through; the practice spend is caught
   before it's logged, so the tour never changes money. */
const Tour = (() => {
  const q = s => document.querySelector(s), vis = e => e && e.checkVisibility && e.checkVisibility() ? e : null;
  const kpOpen = () => document.documentElement.classList.contains('kp-on');
  let inner = false;   // the tour's own clicks get past its guard
  const press = el => { if (!el) return; inner = true; try { el.click(); } finally { inner = false; } };
  const closeKp = () => { if (kpOpen()) press($('kpX')); };
  const go = v => { closeKp(); showView(v); };
  const resetKp = () => { press($('pickZero')); spendCat = ''; try { renderFav(); } catch (e) {} };
  let picked = '';
  const STEPS = [
    { t: 'Welcome!', b: "Let's take a quick hands-on tour. You'll try things as you go, and nothing you do here counts.", next: "Let's go", pre: () => go('budget') },
    { el: () => vis(q('#homeList .dw-nums')) || vis(q('#homeList .vl-hero')), t: 'Left today', pre: () => go('budget'),
      b: "This is what you can spend today. It's money you already have, after your bills are covered." },
    { el: () => vis(q('#homeList .dw-days')), t: 'Your week',
      b: "Each bar is a day this week. Spend less today and the rest spreads over the days ahead. Spend more and it comes out of them." },
    { el: () => vis(q('#homeList .dw-wk')), t: 'Weekly money',
      b: 'Some things, like gas, get one amount for the whole week instead of a little each day.' },
    { el: () => vis($('spendFab')), tap: 'Tap + Spend', t: "Let's practice",
      b: "Say you just bought something. Here's how you'd log it." },
    { el: () => vis(q('#kpFav .kp-cat-row')), live: () => q('#kpFav'), t: 'What was it for?', need: () => kpOpen() && q('#kpFav .kp-cat'), top: true,
      tap: 'Tap one', b: 'Pick a category, like Food or Gas. "Anything" is everything else.',
      done: () => picked, onDone: () => `${picked}, got it!` },
    { el: () => vis($('pickKeys')), live: () => $('pickKeys'), t: 'How much?', need: kpOpen, top: true, span: () => [$('kpToday'), $('pickKeys')],
      tap: 'Type a number', b: 'Type any amount on the keypad. Try 5.', done: () => pickCents() > 0, keep: true },
    { el: () => vis($('packGo')), live: () => $('packGo'), t: 'Now tap Spend', need: kpOpen, practice: true, top: true,
      tap: 'Tap Spend', b: "That's the last step. Go ahead, it's only practice." },
    { el: () => vis(q('#homeList .dw-nums')) || vis(q('#homeList .vl-hero')), t: 'Nice, you did it!', burst: true,
      b: "That's all a spend takes: what, how much, Spend. That one was practice, so nothing was saved. A real one updates Left today right away." },
    { el: () => vis(q('#homeList .vl-hero')), tap: 'Tap the card', t: 'See your week', act: () => showView('week', 1),
      b: 'Want to see where your money went?' },
    { el: () => vis($('weekBody')), t: 'Everything this week', pre: () => { if ($('view-week').classList.contains('hidden')) showView('week', 1); },
      b: 'Every spend this week lands here. Tap one any time to fix the amount or what it was for.', after: () => go('budget') },
    { el: () => vis(q('#townList > .pp-list')), t: 'Savings, pots and projects', pre: () => go('budget'),
      b: "Savings is real money you've saved. It grows a little each day from your pay, and what's left at the end of a week goes here too. Pots and projects hold money for something, like a trip." },
    { el: () => vis(q('#townList > .pp-add.pp-mwb')) || vis(q('#townList > .pp-add')), t: 'Save for something',
      b: 'Make a pot for something you want. Give it a goal and it fills a bit each day.' },
    { el: () => vis(q('#townList > .bg3')) || vis(q('#townList .bg3')), t: 'Bills come first',
      b: 'Each paycheck holds back enough for your bills before anything else. This shows how much of each day goes to bills and how much is yours.' },
    { el: () => vis(q('nav button[data-view="old"]')), tap: 'Tap Bills', t: 'Your bills',
      b: 'Bills have their own page.', act: () => go('old') },
    { el: () => vis(q('#townList > .pp-bills')), t: 'Mark them paid', pre: () => go('old'),
      b: 'When a bill comes out of your bank, tap Paid. Edit bills is where you add or change them.' },
    { el: () => vis(q('nav button[data-view="settings"]')), t: 'Keep a backup', pre: () => go('budget'),
      b: 'Everything stays on this phone. In Settings, tap Export backup now and then so you never lose it. This tour lives there too.' },
    { t: 'Tour complete!', burst: true, b: 'Log what you spend and keep an eye on Left today. The app does the rest.', next: 'Start using it', pre: () => go('budget') },
  ];
  let i = 0, box, raf = 0, poll = 0, lastBurst = -1;
  const hand = '<svg class="tr-hand" viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 0h2v5h1V4h2v1h1v1h1v4h-1v2H4v-1H3v-1H2V8H1V6h2v1h1z"/></svg>';
  function build() {
    box = document.createElement('div'); box.id = 'tour'; box.className = 'hidden'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'trT');
    box.innerHTML = '<div class="tr-spot"></div><button type="button" class="tr-hit" aria-label="" hidden></button>' + hand + '<div class="tr-fx" aria-hidden="true"></div>'
      + '<div class="tr-card"><div class="tr-top"><h2 class="tr-t" id="trT"></h2><span class="tr-n"></span></div><p class="tr-b"></p><div class="tr-pips" aria-hidden="true"></div>'
      + '<div class="tr-go"><button type="button" class="tr-skip">Skip tour</button><span class="tr-tapsay" hidden></span><button type="button" class="tr-next">Next</button></div></div>';
    document.body.appendChild(box);
    box.querySelector('.tr-skip').onclick = () => end();
    box.querySelector('.tr-next').onclick = () => { const s = STEPS[i]; if (s.after) s.after(); step(i + 1); };
    box.querySelector('.tr-hit').onclick = () => { const s = STEPS[i]; if (!s.tap || s.live) return; const e = s.el && s.el(); burst(e); if (s.act) s.act(); else if (e) e.click(); step(i + 1, 380); };
    addEventListener('keydown', e => { if (e.key === 'Escape' && box && !box.classList.contains('hidden')) end(); });
    addEventListener('resize', () => place());
    // hands-on steps: only the lit part of the app (and the tour card) takes taps
    const guard = e => {
      if (inner || !box || box.classList.contains('hidden')) return; const s = STEPS[i]; if (!s || !s.live) return;
      if (e.target.closest && e.target.closest('#tour .tr-card')) return;
      const ok = s.live(); if (ok && ok.contains(e.target)) {
        if (e.type === 'click' && s.practice && e.target.closest('#packGo')) { e.preventDefault(); e.stopImmediatePropagation(); practiceDone(); }
        else if (e.type === 'click' && !s.practice && e.target.closest('.kp-cat')) { const b = e.target.closest('.kp-cat'); picked = (b.querySelector('b') || b).textContent.trim(); }
        return;
      }
      e.preventDefault(); e.stopImmediatePropagation();
    };
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click']) document.addEventListener(t, guard, { capture: true, passive: false });
  }
  function practiceDone() { const e = $('packGo'); burst(e); setTimeout(() => { resetKp(); closeKp(); step(i + 1, 300); }, 250); }
  // a little pixel burst from the middle of an element: the reward ping
  function burst(e, big) {
    if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fx = box.querySelector('.tr-fx'), r = e ? e.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight * .35, width: 0, height: 0 };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, n = big ? 26 : 12;
    for (let k = 0; k < n; k++) {
      const p = document.createElement('i'), a = Math.PI * 2 * k / n + Math.random() * .4, d = (big ? 90 : 50) + Math.random() * (big ? 110 : 40);
      p.style.left = cx + 'px'; p.style.top = cy + 'px'; p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', Math.sin(a) * d + 'px');
      p.className = ['', 'g', 't'][k % 3]; fx.appendChild(p); setTimeout(() => p.remove(), 900);
    }
  }
  function rectOf(e, s) {
    if (s && s.span) { const rs = s.span().filter(vis).map(x => x.getBoundingClientRect()); if (rs.length) { const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), R = Math.max(...rs.map(r => r.right)), B = Math.max(...rs.map(r => r.bottom)); return { l: l - 4, t: t - 4, w: R - l + 8, h: B - t + 8 }; } }
    const r = e.getBoundingClientRect(); return { l: r.left - 4, t: r.top - 4, w: r.width + 8, h: r.height + 8 }; }
  function place() {
    if (!box || box.classList.contains('hidden')) return;
    const s = STEPS[i], e = s.el && s.el(), spot = box.querySelector('.tr-spot'), card = box.querySelector('.tr-card'), hit = box.querySelector('.tr-hit'), hd = box.querySelector('.tr-hand');
    hd.style.display = 'none'; hit.hidden = true;
    if (!e) { spot.className = 'tr-spot none'; card.style.bottom = 'auto'; card.style.top = '30%'; return; }
    const r = rectOf(e, s), H = innerHeight;
    Object.assign(spot.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' });
    spot.className = 'tr-spot' + (s.tap ? ' tap' : '');
    if (s.tap && !s.live) { Object.assign(hit.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' }); hit.hidden = false; hit.setAttribute('aria-label', s.tap); }
    if (s.tap && !(s.live && s.done && s.done())) { hd.style.display = ''; hd.style.left = Math.min(innerWidth - 44, r.l + r.w * .55) + 'px'; hd.style.top = Math.min(H - 40, s.span ? e.getBoundingClientRect().top + 40 : r.t + r.h * .55) + 'px'; }
    // the card goes on whichever side of the lit spot has more room
    if (s.top) { card.style.top = 'calc(env(safe-area-inset-top, 0px) + 12px)'; card.style.bottom = 'auto'; }
    else if (r.t + r.h / 2 > H / 2) { card.style.bottom = Math.max(12, H - r.t + 14) + 'px'; card.style.top = 'auto'; }
    else { card.style.top = Math.min(H - 230, r.t + r.h + 14) + 'px'; card.style.bottom = 'auto'; }
  }
  function show(s) {
    box.querySelector('.tr-t').textContent = s.t; box.querySelector('.tr-b').textContent = s.b;
    box.querySelector('.tr-n').textContent = (i + 1) + ' of ' + STEPS.length;
    box.querySelector('.tr-pips').innerHTML = STEPS.map((_, k) => `<i class="${k < i ? 'on' : k === i ? 'on now' : ''}"></i>`).join('');
    const nx = box.querySelector('.tr-next'), ts = box.querySelector('.tr-tapsay');
    nx.hidden = !!s.tap; nx.textContent = s.next || 'Next'; ts.hidden = !s.tap; ts.textContent = s.tap || '';
    box.querySelector('.tr-skip').hidden = i === STEPS.length - 1;
    box.classList.toggle('live', !!s.live);
  }
  function step(n, wait = 0) {
    clearInterval(poll);
    if (n >= STEPS.length) return end(true);
    i = n; const s = STEPS[i];
    if (s.need && !s.need()) return step(n + 1, wait);
    if (s.pre) s.pre();
    if (s.live && !s.practice) picked = '';
    const card = box.querySelector('.tr-card'); card.style.visibility = 'hidden';
    setTimeout(() => {
      const e = s.el && s.el();
      if (s.el && !e) return step(n + 1);   // nothing to point at on this screen (no weekly categories, say): skip it
      if (e && !kpOpen()) e.scrollIntoView({ block: 'center', behavior: 'instant' });
      show(s);
      requestAnimationFrame(() => { place(); card.style.visibility = ''; if (s.burst && lastBurst !== i) { lastBurst = i; burst(e, true); } const f = s.tap && !s.live ? box.querySelector('.tr-hit') : box.querySelector('.tr-next'); if (f && !f.hidden) f.focus({ preventScroll: true }); });
      cancelAnimationFrame(raf); const follow = () => { place(); if (!box.classList.contains('hidden')) raf = requestAnimationFrame(follow); };
      setTimeout(() => { raf = requestAnimationFrame(follow); }, 320);
      // a hands-on step: when it's done, ping and either move on, or offer Next (keep: so you can keep typing)
      if (s.done) poll = setInterval(() => {
        if (i !== n || !s.done()) return; clearInterval(poll);
        burst(s.el && s.el());
        if (s.keep) { const nx = box.querySelector('.tr-next'), ts = box.querySelector('.tr-tapsay'); nx.hidden = false; nx.textContent = 'Looks good'; ts.hidden = true; }
        else { if (s.onDone) { box.querySelector('.tr-t').textContent = s.onDone(); } setTimeout(() => step(n + 1), 650); }
      }, 150);
    }, wait + 120);
  }
  function start() { if (!box) build(); lastBurst = -1; box.classList.remove('hidden'); step(0); }
  function end(done) {
    clearInterval(poll); cancelAnimationFrame(raf); if (box) { box.classList.add('hidden'); box.classList.remove('live'); }
    if (kpOpen()) resetKp(); go('budget');
    state.tourSeen = Date.now(); save();
    scrollTo({ top: 0, behavior: 'instant' });
    if (!done) toast('You can take the tour again in Settings');
  }
  // after setup: wait for its follow-up questions to close first
  function soon() {
    if (state.tourSeen || state.needsSetup) return;
    try { if (navigator.webdriver && !localStorage.getItem('tour-test')) return; } catch (e) {}   // the older browser tests load the sample data and don't expect a tour
    let n = 0; const t = setInterval(() => {
      const busy = !$('setup').classList.contains('hidden') || [...document.querySelectorAll('.ask')].some(e => !e.classList.contains('hidden'));
      if (!busy || ++n > 600) { clearInterval(t); if (!busy && !state.tourSeen) start(); }
    }, 500);
  }
  return { start, end, soon, STEPS };
})();

$('tourBtn').onclick = () => { showView('budget'); setTimeout(() => Tour.start(), 250); };
{ const ld = loadDemo; loadDemo = function () { const r = ld.apply(this, arguments); Tour.soon(); return r; }; $('suDemo').onclick = loadDemo; }
