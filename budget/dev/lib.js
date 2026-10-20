// The parity kit: opens the live build (A) and the rebuilt one (B) side by side under the same frozen clock, the same
// random numbers and the same saved data, and compares what each one has and shows. Playwright + Chromium, iPhone-sized.
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const BASE = process.env.PARITY_URL || 'http://localhost:8801';
const BUILDS = { A: process.env.A_PATH || '/A/', B: process.env.B_PATH || '/B/' };

async function launch() {
  return chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-gpu'] });
}

// Open one build. opts: { state (object or JSON string), ls (other localStorage pairs), time (ISO or ms), seed, demo, tz }
async function openApp(browser, which, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false,
    serviceWorkers: 'block', timezoneId: opts.tz || 'America/New_York', reducedMotion: opts.reduced ? 'reduce' : 'no-preference', locale: 'en-US' });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const t0 = typeof opts.time === 'number' ? opts.time : new Date(opts.time || '2026-10-19T09:30:00-04:00').getTime();
  await page.clock.install({ time: t0 }); await page.clock.pauseAt(t0 + 1000);
  const ls = Object.assign({}, opts.ls || {});
  if (opts.state) ls['budget-app-v2'] = typeof opts.state === 'string' ? opts.state : JSON.stringify(opts.state);
  await page.addInitScript(([pairs, seed]) => {
    let s = seed >>> 0 || 12345; Math.random = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); }
  }, [ls, opts.seed || 12345]);
  await page.goto(BASE + BUILDS[which] + 'index.html', { waitUntil: 'load' });
  await page.clock.runFor(1500);
  if (opts.demo) { await page.evaluate(() => loadDemo()); await page.clock.runFor(1500); }
  return { ctx, page, errors, which };
}

// Everything the books say right now (the money math), plus the saved data. Each probe that throws records its error.
const PROBE = () => {
  const out = {}, T = (k, f) => { try { const v = f(); out[k] = v === undefined ? '(undefined)' : JSON.parse(JSON.stringify(v, (key, x) => typeof x === 'number' && !isFinite(x) ? String(x) : x)); } catch (e) { out[k] = 'THROWS ' + e.message; } };
  const td = today(), m = td.slice(0, 7);
  T('today', () => td); T('month', () => month);
  T('hoard', () => { const p = hoardParts(); delete p.L; return p; });
  T('pots', () => potBalances(m)); T('potsViewed', () => potBalances(month));
  T('purse', () => purseNow()); T('weekly', () => weeklyAmt()); T('V', () => maxWorkers()); T('party', () => partyNow()); T('savers', () => savers());
  T('crews', () => farmPots().map(id => [id, workersAt(id)]));
  T('period', () => periodNow()); T('farmPay', () => farmPay()); T('payNow', () => payNow());
  T('need', () => needAt(td)); T('startNeed', () => startNeed()); T('billToSave', () => billToSave());
  T('billsMonthWhole', () => billsMonthWhole()); T('billParts', () => billParts());
  T('waiting', () => paydaysWaiting().map(p => p.key));
  T('debts', () => (state.pots || []).filter(p => debtOf(p.id)).map(p => [p.id, debtPlan(p.id), debtRoom(p.id), debtGrow(p.id), debtNeed(p.id)]));
  T('goals', () => (state.pots || []).map(p => [p.id, goalOf(p.id), projectBal(p.id), goalHit(p.id)]));
  T('todayLeft', () => todayLeft()); T('monthNumbers', () => monthNumbers(m)); T('weekRunning', () => weekRunning()); T('cats', () => catWeekNow());
  T('state', () => state);
  return out;
};

async function probe(p) { return p.page.evaluate(PROBE); }

// The page as a person sees it: every element on screen (tag, id, classes, attributes, its own text, a field's value),
// nothing that's hidden, and the text as a whole. Inline sizes of live bars are left out (frames draw them on the real
// clock); the books are compared exactly instead.
async function view(p) {
  return p.page.evaluate(() => {
    const loose = !matchMedia('(prefers-reduced-motion: reduce)').matches, out = [];
    const skip = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
    // opacity as it will settle: a fade (a CSS transition) runs on the real clock, so a toast mid-fade counts by where it's going
    const op = e => { const t = e.getAnimations().find(a => a.transitionProperty === 'opacity' && a.playState === 'running');
      if (t) { const k = t.effect.getKeyframes(); return Number(k[k.length - 1].opacity); } return Number(getComputedStyle(e).opacity); };
    const vis = e => e.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) && op(e) > 0;
    (function walk(e, d) {
      if (skip.has(e.tagName) || !vis(e)) return;
      if (loose && (e.matches('i.vl-tkm, span.vl-coin, b.pp-flash, b.pp-pour, b.pp-shine'))) return;
      let a = ''; for (const x of e.attributes) { if (x.name === 'style' || x.name === 'data-fz') continue; let v = x.value; if (x.name === 'class') { v = v.split(/\s+/).filter(c => c && !(loose && /^(tk|vl-hit)$/.test(c))).join(' '); } a += ` ${x.name}="${v}"`; }
      if ('value' in e && /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) a += ` ·value="${e.value}"` + (e.type === 'checkbox' || e.type === 'radio' ? ` ·checked=${e.checked}` : '');
      let t = ''; for (const n of e.childNodes) if (n.nodeType === 3) t += n.nodeValue; t = t.replace(/\s+/g, ' ').trim();
      if (e.tagName === 'IFRAME') a += ' ·iframe';
      out.push(`${' '.repeat(Math.min(d, 40))}<${e.tagName.toLowerCase()}${a}>${t}`);
      for (const c of e.children) walk(c, d + 1);
    })(document.body, 0);
    return { html: out.join('\n'), text: document.body.innerText, cls: document.documentElement.className, theme: document.documentElement.dataset.theme || '' };
  });
}

// The first place two strings part, with some context
function where(a, b) {
  a = String(a); b = String(b); let j = 0; while (j < a.length && a[j] === b[j]) j++;
  return `at ${j}:\n    A: …${a.slice(Math.max(0, j - 100), j + 140)}…\n    B: …${b.slice(Math.max(0, j - 100), j + 140)}…`;
}
// Deep compare of two probe results: each key that differs
function diffKeys(a, b) { const out = []; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = JSON.stringify(a[k]), y = JSON.stringify(b[k]); if (x !== y) out.push(`${k} ${where(x, y)}`); } return out; }

function rng(seed) { let r = seed >>> 0 || 1; const f = () => { r ^= r << 13; r >>>= 0; r ^= r >> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; }; f.pick = a => a[Math.floor(f() * a.length)]; return f; }

// Both pages: the same step
async function both(pair, f) { return Promise.all(pair.map(f)); }

// The two screens, compared. A difference that's gone once both have had 4 more seconds (on the same fake clock) was a
// moment caught mid-way (a Pour or a fade started by the real clock): only one that stays counts.
async function screensDiffer(pair, markup) {
  const cmp = ([va, vb]) => { const d = [];
    if (va.text !== vb.text) d.push('screen text ' + where(va.text, vb.text));
    else if (markup && va.html !== vb.html) d.push('screen markup ' + where(va.html, vb.html));
    if (va.cls !== vb.cls) d.push('html class ' + where(va.cls, vb.cls));
    return d; };
  let d = cmp(await both(pair, view)); if (!d.length) return d;
  await both(pair, p => p.page.clock.runFor(4000)); settled++;
  d = cmp(await both(pair, view)); return d;
}
let settled = 0;
module.exports = { settledCount: () => settled, settledMore: () => settled++, screensDiffer, launch, openApp, probe, view, where, diffKeys, rng, both, PROBE, BUILDS, BASE, fs };
