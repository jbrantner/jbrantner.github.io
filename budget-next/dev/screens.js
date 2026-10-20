// Every screen, sheet and pop-up, in both builds: the computed style of every element on screen (and its ::before and
// ::after) must match exactly, and so must the screenshot, pixel for pixel. For changes meant to look the same.
// Usage: node screens.js <data.json|demo> [outDir] [--looks]   (env ONLY=name to run one state)
const { launch, openApp, fs } = require('./lib');
const src = process.argv[2] || 'demo', OUT = process.argv[3] || '/tmp/screens', LOOKS = process.argv.includes('--looks');
fs.mkdirSync(OUT, { recursive: true });

// The states to visit: [name, what to do from a fresh home screen]
const ev = f => async p => { await p.evaluate(f); await p.clock.runFor(700); };
const click = sel => async p => { await p.locator(sel).first().click({ timeout: 1500 }).catch(() => {}); await p.clock.runFor(700); };
const STATES = [
  ['home', async () => {}],
  ['home-bottom', ev(() => { const m = document.getElementById('mainScroll') || document.scrollingElement; m.scrollTop = 99999; window.scrollTo(0, 99999); })],
  ['bills-tab', ev(() => showView('old'))],
  ['settings', ev(() => showView('settings'))],
  ['settings-open', ev(() => { showView('settings'); document.querySelectorAll('#view-settings details').forEach(d => d.open = true); })],
  ['cats', ev(() => showView('cats'))],
  ['spent', ev(() => showView('spent'))],
  ['week', ev(() => showView('week'))],
  ['sheet-bills', ev(() => Town.open('home'))],
  ['sheet-farm', ev(() => Town.open('farm'))],
  ['sheet-spare', ev(() => Town.open('scavenger'))],
  ['sheet-pots', ev(() => Town.open('pots'))],
  ['sheet-projs', ev(() => Town.open('projs'))],
  ['sheet-newpot', ev(() => Town.open('newpot'))],
  ['sheet-newproj', ev(() => Town.open('newproj'))],
  ['sheet-cushion', ev(() => Town.open('cushion'))],
  ['sheet-savings', ev(() => Town.open('savings'))],
  ['sheet-bill', ev(() => { const c = state.categories.find(c => c.kind === 'bill'); if (c) Town.open('bill:' + c.id); })],
  ['got', ev(() => openGot())],
  ['got-extra', ev(() => { openGot(); document.querySelector('[data-got-k="extra"]').click(); })],
  ['pay', ev(() => { const i = state.incomes.find(i => Number(i.amount) > 0); const k = i && payKeyFor(i); if (k) openPay(k); })],
  ['move', ev(() => openMover())],
  ['bankcheck', ev(() => openBankCheck(false))],
  ['debtform', ev(() => openDebtForm())],
  ['planning', ev(() => planStart())],
  ['optimize', ev(() => optimizePlan())],
  ['keypad-typed', ev(() => { pickKey('1'); pickKey('2'); pickKey('.'); pickKey('5'); })],
  ['ask', ev(() => { ask('Delete this?'); })],
  ['toast', ev(() => toast('Saved ✓'))],
  ['upkeep', ev(() => showView('upkeep'))],
  ['pet', ev(() => showView('pet'))],
];
// every card on Home, opened one at a time
const CARDS = p => p.evaluate(() => [...document.querySelectorAll('#townList .pp-card')].map(c => c.dataset.vlRow).filter(Boolean));

const STYLE = () => {   // each element on screen: its tag and every computed property, and its pseudo-elements' (not the Looks' own color variables, css/looks.css)
  const out = [], vis = e => e.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  const props = s => { const a = []; for (let i = 0; i < s.length; i++) { const k = s[i]; if (/^--(pc-|pr-|p-hue$)/.test(k)) continue; a.push(k + ':' + s.getPropertyValue(k)); } return a.sort().join(';'); };
  (function walk(e, path) {
    if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(e.tagName) || !vis(e)) return;
    const s = getComputedStyle(e), b = getComputedStyle(e, '::before'), a = getComputedStyle(e, '::after');
    out.push([path + ' ' + e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''), props(s), b.content !== 'none' ? props(b) : '', a.content !== 'none' ? props(a) : '']);
    let k = 0; for (const c of e.children) if (!/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(c.tagName) && vis(c)) walk(c, path + '/' + (k++));   // counted among what's on screen, so a hidden leftover taken out moves nothing
  })(document.documentElement, '');
  return out;
};
(async () => {
  const b = await launch();
  const st = src.endsWith('.json') ? (j => j.state || j)(JSON.parse(fs.readFileSync(src, 'utf8'))) : null;
  const looks = LOOKS ? [['reef', 'dark'], ['reef', 'light'], ['twilight', 'dark'], ['nightswim', 'dark'], ['moss', 'dark'], ['arcade', 'dark'], ['burgundy', 'dark'], ['lit', 'dark'], ['lit', 'light']] : [['', '']];
  let bad = 0, n = 0;
  const cmpImg = await (await b.newContext()).newPage();
  for (const [look, theme] of looks) {
    const ls = {}; if (look === 'lit') ls['budget-look'] = 'f'; else if (look) { ls['budget-look'] = 'b'; if (look !== 'reef') ls['budget-pal'] = look; }
    let stLook = st; if (theme && stLook) stLook = { ...stLook, theme: theme === 'light' ? 'light' : '' };
    const pair = [await openApp(b, 'A', { state: stLook, ls, demo: src === 'demo', reduced: true }), await openApp(b, 'B', { state: stLook, ls, demo: src === 'demo', reduced: true })];
    if (theme && !stLook) for (const p of pair) await p.page.evaluate(t => { state.theme = t === 'light' ? 'light' : ''; save(); render(); }, theme);
    const cards = await CARDS(pair[0].page);
    const states = LOOKS ? STATES.filter(([n]) => ['home', 'settings-open', 'sheet-bills', 'got-extra', 'cats', 'upkeep'].includes(n)) : [...STATES, ...cards.map(id => ['card-' + id, ev(new Function(`const c = document.querySelector('#townList .pp-card[data-vl-row="${id}"]'); if (c) c.click();`))])];
    for (const [name, act] of states) {
      if (process.env.ONLY && process.env.ONLY !== name) continue;
      const tag = (look ? look + '-' + theme + '-' : '') + name;
      const shots = [];
      for (const p of pair) {
        // back to a fresh start for each state: reload with the same saved data and clock
        await p.page.reload({ waitUntil: 'load' }); await p.page.clock.runFor(1500);
        await act(p.page); await p.page.clock.runFor(400);
        const style = await p.page.evaluate(STYLE);
        const png = await p.page.screenshot({ animations: 'disabled', caret: 'hide' });
        shots.push({ style, png, err: p.errors.splice(0) });
      }
      n++;
      const [x, y] = shots, d = [];
      if (x.style.length !== y.style.length) d.push(`${x.style.length} vs ${y.style.length} elements on screen`);
      for (let i = 0; i < Math.min(x.style.length, y.style.length) && d.length < 6; i++) {
        const [pa, sa, ba, aa] = x.style[i], [pb, sb, bb, ab] = y.style[i];
        if (pa !== pb) { d.push(`element ${i}: ${pa} vs ${pb}`); continue; }
        for (const [w, u, v] of [['', sa, sb], ['::before', ba, bb], ['::after', aa, ab]]) if (u !== v) {
          const U = u.split(';'), V = v.split(';'), diff = U.filter((q, k) => q !== V[k]).slice(0, 4).map(q => { const k = q.split(':')[0]; return `${k}: ${q.slice(k.length + 1)} vs ${(V.find(z => z.startsWith(k + ':')) || '').slice(k.length + 1)}`; });
          d.push(`${pa}${w}: ${diff.join('; ')}`);
        }
      }
      if (!x.png.equals(y.png)) {
        const px = await cmpImg.evaluate(async ([a, c]) => {
          const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
          const [i1, i2] = await Promise.all([load(a), load(c)]); if (i1.width !== i2.width || i1.height !== i2.height) return -1;
          const cv = document.createElement('canvas'); cv.width = i1.width; cv.height = i1.height; const g = cv.getContext('2d');
          g.drawImage(i1, 0, 0); const A = g.getImageData(0, 0, cv.width, cv.height).data; g.drawImage(i2, 0, 0); const B = g.getImageData(0, 0, cv.width, cv.height).data;
          let k = 0; for (let j = 0; j < A.length; j += 4) if (A[j] !== B[j] || A[j + 1] !== B[j + 1] || A[j + 2] !== B[j + 2]) k++; return k;
        }, [x.png.toString('base64'), y.png.toString('base64')]);
        if (px) { d.push(`screenshot: ${px < 0 ? 'size differs' : px + ' pixels differ'}`); fs.writeFileSync(`${OUT}/${tag}-A.png`, x.png); fs.writeFileSync(`${OUT}/${tag}-B.png`, y.png); }
      }
      if (JSON.stringify(x.err) !== JSON.stringify(y.err)) d.push(`errors: A ${x.err.join(' | ').slice(0, 200)} B ${y.err.join(' | ').slice(0, 200)}`);
      if (d.length) { bad++; console.log(`[${tag}] ${d.length} differences:\n  ${d.join('\n  ').slice(0, 1500)}`); }
    }
    for (const p of pair) await p.ctx.close();
  }
  console.log(`screens ${src.split('/').pop()}${LOOKS ? ' (looks)' : ''}: ${n} states, ${bad ? bad + ' differ' : 'all identical (styles and pixels)'}`);
  await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
