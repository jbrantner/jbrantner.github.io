// The books, day by day: the same saved data in both builds, the clock moved forward a step at a time, each day's
// paycheck entered when it asks, some spending logged, and every number and the saved data compared at each stop.
// Usage: node sim.js <data.json|demo|setup> [days=60] [seed=1] [start ISO]
const { launch, openApp, probe, screensDiffer, diffKeys, where, rng, both, fs } = require('./lib');
const src = process.argv[2] || 'demo', DAYS = Number(process.argv[3] || 60), seed = Number(process.argv[4] || 1);
const START = process.argv[5] || '2026-10-19T09:30:00-04:00';
(async () => {
  const b = await launch(), R = rng(seed);
  const st = src.endsWith('.json') ? (() => { const j = JSON.parse(fs.readFileSync(src, 'utf8')); return j.state || j; })() : null;
  const o = { state: st, time: START, demo: src === 'demo', seed, reduced: !!process.env.REDUCED };
  const pair = [await openApp(b, 'A', o), await openApp(b, 'B', o)];
  let bad = 0, stops = 0, loose = 0;
  const cmp = async tag => {
    stops++;
    const [pa, pb] = await both(pair, probe), d = diffKeys(pa, pb);
    const v = await screensDiffer(pair, true);   // the screen: exact with reduced motion (with motion, frames run on the real clock)
    if (o.reduced) d.push(...v); else if (v.length) loose++;
    for (const p of pair) if (p.errors.length) d.push(`${p.which} errors: ${p.errors.splice(0).join(' | ').slice(0, 400)}`);
    if (d.length) { bad++; console.log(`[${tag}] ${d.length} differences:\n  ` + d.slice(0, 6).join('\n  ')); }
    return d.length;
  };
  await cmp('open');
  for (let day = 0; day < DAYS && bad < 5; day++) {
    // a few hours to a day later (the app comes back to the screen)
    const ms = R.pick([3, 6, 9, 14, 24, 24, 24, 30, 48]) * 3600e3 + Math.floor(R() * 3600e3);
    await both(pair, async p => { await p.page.clock.fastForward(ms); await p.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.page.clock.runFor(1500); });
    await cmp(`+${day} wait`);
    // a paycheck that asks is entered (sometimes a little off what's usual)
    const cents = R.pick([0, 0, 0.37, -27.9, 12.05, -400]);
    await both(pair, async p => p.page.evaluate(c => { if (!$('payBox').classList.contains('hidden') && payKey) { const inc = state.incomes.find(i => i.id === splitKey(payKey)[0]); $('payAmt').value = String(Math.max(0, Math.round((Number(inc && inc.amount || 1000) + c) * 100) / 100)); payPlan(); paySave(); } }, cents));
    await both(pair, p => p.page.clock.runFor(800));
    // some spending, through the keypad's own code path
    const n = R.pick([0, 1, 1, 2, 3]);
    for (let k = 0; k < n; k++) {
      const amt = R.pick([4.5, 12.99, 3, 27.41, 60, 8.75, 115]), desc = R.pick(['Coffee', 'Gas', 'Groceries', 'Lunch', '']);
      await both(pair, async p => p.page.evaluate(([a, d]) => { if (!$('payBox').classList.contains('hidden')) return; addTransactions([{ date: today(), amount: -a, description: d }], 'manual'); render(); }, [amt, desc]));
      await both(pair, p => p.page.clock.runFor(300));
    }
    await cmp(`+${day} after`);
  }
  console.log(`${src} seed ${seed}${o.reduced ? ' (reduced motion)' : ''}: ${stops} stops, ${bad ? bad + ' with differences' : 'all identical'}${o.reduced ? '' : ` (screens compared loosely: ${loose} differ in moving parts)`}; ${require('./lib').settledCount()} caught mid-way and settled`);
  await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
