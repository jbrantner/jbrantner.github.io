// Random tapping in lockstep: both builds get the same taps, typing and jumps in time, and after every step their books,
// saved data and screens must match. The buttons on offer must match too (that's the screen's shape).
// Usage: node fuzz.js <data.json|demo|setup> [steps=200] [seed=1] [start ISO]
const { launch, openApp, probe, screensDiffer, diffKeys, where, rng, both, fs } = require('./lib');
const src = process.argv[2] || 'demo', STEPS = Number(process.argv[3] || 200), seed = Number(process.argv[4] || 1);
const START = process.argv[5] || '2026-10-19T09:30:00-04:00';
const NAMES = ['Rent', 'Gas', 'Food', 'Car', 'Trip 2027', '<img src=x onerror=window.__xss=1>', 'A very long name for a pot that keeps going', 'Café & "Tea"', "Mom's", '  ', '0', 'Phone'];
const NUMS = ['0', '1', '5', '12.34', '40', '100', '409.99', '1300', '2500.5', '99999', '-5', '', '0.01', '7'];
const DATES = ['2026-10-01', '2026-10-31', '2026-11-01', '2026-11-15', '2026-12-31', '2027-01-01', '2026-09-30', ''];

// what can be tapped, typed into or picked right now, numbered the same way in both builds
const CANDS = () => {
  document.querySelectorAll('[data-fz]').forEach(e => e.removeAttribute('data-fz'));
  const sel = 'button, [role=button], a[href], input, select, textarea, [data-vl-open], [data-act], [data-pp-open], [data-tview], [data-hl], [data-news], [data-pay-open], .pp-card, .hl-cats, [data-cat-pace], [data-spent], [data-sp-tx]';
  const bad = e => e.closest('#wipeBtn, #resetBtn, #backupFile, #exportBtn, [data-update], #updGo, #suRestore, #importBackupBtn, #suFind, [data-act="findbills"], #demoBtn, [data-news="backup-now"], #csvFile, #rcFile, #sprFile') || e.type === 'file';
  // on screen, with each fade counted by where it's going (fades run on the real clock)
  const op = e => { const t = e.getAnimations().find(a => a.transitionProperty === 'opacity' && a.playState === 'running');
    if (t) { const k = t.effect.getKeyframes(); return Number(k[k.length - 1].opacity); } return Number(getComputedStyle(e).opacity); };
  const shown = e => { if (!e.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false; for (let x = e; x; x = x.parentElement) if (!(op(x) > 0)) return false; return true; };
  const out = []; let n = 0;
  for (const e of document.querySelectorAll(sel)) {
    if (bad(e) || e.disabled || !shown(e)) continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    e.setAttribute('data-fz', ++n);
    out.push({ n, tag: e.tagName, type: e.type || '', id: e.id, cls: String(e.className || '').slice(0, 40), text: (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 30) });
  }
  return out;
};

(async () => {
  const b = await launch(), R = rng(seed * 7919 + 1);
  const st = src.endsWith('.json') ? (() => { const j = JSON.parse(fs.readFileSync(src, 'utf8')); return j.state || j; })() : null;
  const o = { state: st, time: START, demo: src === 'demo', seed, reduced: !process.env.MOTION };
  const pair = [await openApp(b, 'A', o), await openApp(b, 'B', o)];
  if (src === 'setup') for (const p of pair) await setup(p.page, rng(seed));
  const trail = []; let bad = 0, steps = 0;
  const cmp = async tag => {
    const [pa, pb] = await both(pair, probe), d = diffKeys(pa, pb);
    d.push(...await screensDiffer(pair, o.reduced));
    const ea = pair[0].errors.splice(0), eb = pair[1].errors.splice(0);
    if (JSON.stringify(ea) !== JSON.stringify(eb)) d.push(`errors differ: A ${ea.join(' | ').slice(0, 300)} B ${eb.join(' | ').slice(0, 300)}`);
    if (d.length) { bad++; console.log(`[step ${tag}] ${d.length} differences after: ${trail.slice(-5).join(' | ')}\n  ` + d.slice(0, 5).join('\n  ')); }
  };
  await cmp('open');
  for (let step = 0; step < STEPS && bad < 3; step++, steps++) {
    const roll = R();
    if (roll < 0.08) {
      const ms = R.pick([60e3, 15 * 60e3, 3 * 3600e3, 9 * 3600e3, 26 * 3600e3, 3 * 86400e3]);
      trail.push(`wait ${Math.round(ms / 60e3)} min`);
      await both(pair, async p => { await p.page.clock.fastForward(ms); await p.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.page.clock.runFor(1200); });
    } else if (roll < 0.10) {
      trail.push('reload');
      await both(pair, async p => { await p.page.reload({ waitUntil: 'load' }); await p.page.clock.runFor(1500); });
    } else if (roll < 0.13) {
      trail.push('Escape'); await both(pair, async p => { await p.page.keyboard.press('Escape'); await p.page.clock.runFor(300); });
    } else {
      let [ca, cb] = await both(pair, p => p.page.evaluate(CANDS));
      if (JSON.stringify(ca) !== JSON.stringify(cb)) {   // caught mid-way (a sheet still sliding on the real clock)? 4 more seconds on both
        await both(pair, p => p.page.clock.runFor(4000)); [ca, cb] = await both(pair, p => p.page.evaluate(CANDS)); require('./lib').settledMore();
      }
      if (JSON.stringify(ca) !== JSON.stringify(cb)) { bad++; console.log(`[step ${step}] what can be tapped differs after: ${trail.slice(-5).join(' | ')}\n  ${where(JSON.stringify(ca), JSON.stringify(cb))}`); break; }
      if (!ca.length) { trail.push('nothing to tap'); continue; }
      const c = R.pick(ca), desc = `${c.tag}${c.id ? '#' + c.id : ''}${c.cls ? '.' + c.cls.split(' ')[0] : ''} "${c.text}"`;
      const kind = c.tag === 'INPUT' && /^(number|text|search|tel|)$/.test(c.type) || c.tag === 'TEXTAREA' ? 'type' : c.tag === 'INPUT' && c.type === 'date' ? 'date' : c.tag === 'SELECT' ? 'select' : 'tap';
      const v = kind === 'type' ? (c.type === 'number' ? R.pick(NUMS) : R.pick(NAMES)) : kind === 'date' ? R.pick(DATES) : null, enter = R() < 0.5, idx = R(), wait = R() < 0.3 ? 2000 : 350;
      trail.push(`${kind} ${v != null ? JSON.stringify(v) + ' ' : ''}${desc}`);
      await both(pair, async p => {
        const loc = p.page.locator(`[data-fz="${c.n}"]`);
        if (kind === 'type') {
          await loc.fill(v, { timeout: 800 }).catch(() => {}); await p.page.clock.runFor(100);
          if (enter) await loc.press('Enter', { timeout: 500 }).catch(() => {}); else await p.page.evaluate(n => { const e = document.querySelector(`[data-fz="${n}"]`); if (e) { e.dispatchEvent(new Event('change', { bubbles: true })); e.blur(); } }, c.n);
        } else if (kind === 'date') {
          await loc.fill(v, { timeout: 800 }).catch(() => {});
          await p.page.evaluate(n => { const e = document.querySelector(`[data-fz="${n}"]`); if (e) e.dispatchEvent(new Event('change', { bubbles: true })); }, c.n);
        } else if (kind === 'select') {
          const opts = await loc.evaluate(s => [...s.options].map(o => o.value)).catch(() => []);
          if (opts.length) await loc.selectOption(opts[Math.floor(idx * opts.length)], { timeout: 800 }).catch(() => {});
        } else await loc.click({ timeout: 800 }).catch(() => {});
        await p.page.clock.runFor(wait);
      });
    }
    await cmp(step);
  }
  console.log(`fuzz ${src} seed ${seed}${o.reduced ? '' : ' (motion)'}: ${steps} steps, ${bad ? bad + ' with differences' : 'identical at every step'}; ${require('./lib').settledCount()} caught mid-way and settled`);
  await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

// A fresh start through the setup screen
async function setup(page, R) {
  await page.fill('#suPay', R.pick(['1300', '1200.37', '950', '2100']));
  await page.selectOption('#suEvery', R.pick(['14', '7', 'twice', '0']));
  const pd = await page.$('#suPayday'); if (pd && await pd.isVisible()) await page.fill('#suPayday', R.pick(['2026-10-09', '2026-10-16', '2026-10-02', '2026-10-15']));
  const rows = await page.$$('#suBills .su-row'), bills = [['Rent', '900', '1'], ['Phone', '60', '15'], ['Insurance', '120', '31']];
  for (let i = 0; i < rows.length && i < bills.length; i++) { const ins = await rows[i].$$('input'); await ins[0].fill(bills[i][0]); await ins[1].fill(bills[i][1]); await ins[2].fill(bills[i][2]); }
  await page.fill('#suWeekly', R.pick(['150', '300', '70', '0']));
  await page.fill('#suSaved', R.pick(['1430.89', '0', '250', '3000']));
  await page.click('#suGo'); await page.clock.runFor(300);
  const pa = await page.$('#paidAskGo'); if (pa && await pa.isVisible()) await pa.click();
  await page.clock.runFor(1500);
}
