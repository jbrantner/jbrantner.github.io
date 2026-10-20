// Which code ever runs: random tapping on one build with Chromium's coverage on, merged over runs into a JSON of
// function ranges and their call counts, and the CSS rules that were ever used. Finds leftovers no screen reaches.
// Usage: node cov.js <A|B> <out.json> <data.json|demo|setup>... (env STEPS, SEEDS)
const { launch, openApp, rng, fs } = require('./lib');
const which = process.argv[2] || 'A', OUT = process.argv[3], SRCS = process.argv.slice(4);
const STEPS = Number(process.env.STEPS || 150), SEEDS = (process.env.SEEDS || '1,2').split(',').map(Number);
const NAMES = ['Rent', 'Gas', 'Food', 'Trip 2027', 'Café & "Tea"', '', '0'], NUMS = ['0', '1', '5', '12.34', '40', '409.99', '1300', '-5', '', '0.01'];
const DATES = ['2026-10-01', '2026-10-31', '2026-11-15', '2027-01-01', ''];
const CANDS = () => {
  document.querySelectorAll('[data-fz]').forEach(e => e.removeAttribute('data-fz'));
  const sel = 'button, [role=button], a[href], input, select, textarea, summary, [data-vl-open], [data-act], [data-pp-open], [data-tview], [data-hl], [data-news], [data-pay-open], .pp-card, .hl-cats, [data-cat-pace], [data-spent], [data-sp-tx]';
  const bad = e => e.closest('#wipeBtn, #backupFile, #exportBtn, [data-update], #updGo, #suRestore, #importBackupBtn, #suFind, [data-act="findbills"], #csvFile, #rcFile, #sprFile') || e.type === 'file';
  const out = []; let n = 0;
  for (const e of document.querySelectorAll(sel)) {
    if (bad(e) || e.disabled || !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    e.setAttribute('data-fz', ++n); out.push({ n, tag: e.tagName, type: e.type || '' });
  }
  return out;
};
(async () => {
  const b = await launch(), merged = { js: {}, css: {} };
  const add = (cov, css) => {
    for (const e of cov) {
      if (!/index\.html|\.js$/.test(e.url) && e.url) continue;
      const key = e.url.replace(/^https?:\/\/[^/]+\/[^/]+\//, '') + '#' + (e.source || '').length;
      const m = merged.js[key] || (merged.js[key] = { url: e.url, len: (e.source || '').length, fns: {} });
      for (const f of e.functions) for (const r of f.ranges) { const k = r.startOffset + ':' + r.endOffset; m.fns[k] = Math.max(m.fns[k] || 0, 0) + r.count; }
    }
    for (const e of css) { const key = e.url + '#' + e.text.length; const m = merged.css[key] || (merged.css[key] = { url: e.url, len: e.text.length, used: {} }); for (const r of e.ranges) m.used[r.start + ':' + r.end] = 1; }
  };
  for (const src of SRCS) for (const seed of SEEDS) {
    const R = rng(seed * 31 + 7), st = src.endsWith('.json') ? (j => j.state || j)(JSON.parse(fs.readFileSync(src, 'utf8'))) : null;
    const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, hasTouch: true, serviceWorkers: 'block', timezoneId: 'America/New_York', locale: 'en-US', reducedMotion: seed % 2 ? 'no-preference' : 'reduce' });
    const page = await ctx.newPage();
    await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    await page.clock.install({ time: new Date('2026-10-19T09:30:00-04:00') });
    if (st) await page.addInitScript(s => { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('budget-app-v2', s); sessionStorage.setItem('__seeded', '1'); } }, JSON.stringify(st));
    await page.goto(require('./lib').BASE + require('./lib').BUILDS[which] + 'index.html', { waitUntil: 'load' }); await page.clock.runFor(1500);
    if (src === 'demo') { await page.evaluate(() => loadDemo()); await page.clock.runFor(1500); }
    for (let step = 0; step < STEPS; step++) {
      const roll = R();
      try {
        if (roll < 0.07) { await page.clock.fastForward(R.pick([60e3, 3 * 3600e3, 26 * 3600e3, 3 * 86400e3])); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.clock.runFor(1200); }
        else if (roll < 0.09) { await page.keyboard.press('Escape'); }
        else {
          const cs = await page.evaluate(CANDS); if (!cs.length) continue;
          const c = R.pick(cs), loc = page.locator(`[data-fz="${c.n}"]`);
          if (c.tag === 'INPUT' && /^(number|text|search|tel|)$/.test(c.type) || c.tag === 'TEXTAREA') { await loc.fill(c.type === 'number' ? R.pick(NUMS) : R.pick(NAMES), { timeout: 600 }).catch(() => {}); await loc.press('Enter', { timeout: 400 }).catch(() => {}); }
          else if (c.tag === 'INPUT' && c.type === 'date') { await loc.fill(R.pick(DATES), { timeout: 600 }).catch(() => {}); await loc.dispatchEvent('change').catch(() => {}); }
          else if (c.tag === 'SELECT') { const o = await loc.evaluate(s => [...s.options].map(x => x.value)).catch(() => []); if (o.length) await loc.selectOption(R.pick(o), { timeout: 600 }).catch(() => {}); }
          else await loc.click({ timeout: 600 }).catch(() => {});
          await page.clock.runFor(R() < 0.3 ? 2000 : 300);
        }
      } catch (e) {}
    }
    add(await page.coverage.stopJSCoverage(), await page.coverage.stopCSSCoverage());
    await ctx.close(); process.stdout.write(`${src.split('/').pop()}#${seed} `);
  }
  let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  if (prev) {   // merge with an earlier run into the same file
    for (const [k, m] of Object.entries(prev.js)) { const n = merged.js[k] || (merged.js[k] = m); if (n !== m) for (const [r, c] of Object.entries(m.fns)) n.fns[r] = (n.fns[r] || 0) + c; }
    for (const [k, m] of Object.entries(prev.css)) { const n = merged.css[k] || (merged.css[k] = m); if (n !== m) Object.assign(n.used, m.used); }
  }
  fs.writeFileSync(OUT, JSON.stringify(merged)); console.log('\nsaved', OUT);
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
