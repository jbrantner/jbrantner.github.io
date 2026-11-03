// 🌀 Auto Clip page against a pretend Render (tests/auto_fake_render.py: the helper's real Auto Clip loop on a fake
// ComfyUI that checks every graph like ComfyUI does, with the node inputs of 0.41.3 + H3 Motion Context + the helper).
// Checks: model found (Prism pika first), a roll fills every wildcard and keeps the adult line, a child word blocks Start,
// a hypnosis picture goes up to Render, Start sends the recipe and the helper makes the still then every part with valid
// graphs, another app's job pauses it, the finished clip shows with Again with her / Star / Delete.
// Run: NODE_PATH=$(npm root -g) node tests/t_auto.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs'), { spawn } = require('child_process');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const PORT = 18388, RU = 'http://127.0.0.1:' + PORT, ROOT = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const py = spawn('python3', [path.join(__dirname, 'auto_fake_render.py'), String(PORT)], {stdio:['ignore', 'pipe', 'inherit']});
  await new Promise(res => py.stdout.on('data', d => { if(/ready/.test(String(d))) res(); }));
  const site = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ s.writeHead(404); s.end(); return; } s.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : 'application/octet-stream'}); s.end(b); }); }).listen(18389);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => d.accept());
  await page.addInitScript(u => { window.AC_URL = u; }, RU);
  await page.goto('http://127.0.0.1:18389/auto/');
  await page.waitForFunction(() => document.querySelectorAll('#model option').length >= 1 && /PRISM|Singularity/.test(document.querySelector('#model').textContent), null, {timeout:15000});
  ok(/PRISM PIKA/.test(await page.$eval('#model option:checked', o => o.textContent)), 'Prism pika is the default model');
  ok(await page.$eval('#runBtn', b => !b.disabled), 'Start is ready: ' + await page.$eval('#goWhy', e => e.textContent));
  ok((await page.$$('#planBar i')).length === 6, '30 s = 6 parts');

  // a roll
  await page.click('#bParts h3'); await page.click('#tryRoll');
  const roll = await page.$eval('#roll', e => e.textContent);
  ok(!/__|\{/.test(roll) && /Part 6/.test(roll), 'a roll fills every wildcard');
  ok(/adult line/.test(roll), 'the roll says the adult line is added');

  // a child word blocks Start
  await page.click('#bWild h3');
  const ages = await page.$('textarea[data-lt="1"]'); const was = await ages.inputValue();
  await ages.fill(was + '\n16-year-old'); await wait(200);
  ok(await page.$eval('#runBtn', b => b.disabled) && /adults/.test(await page.$eval('#goWhy', e => e.textContent)), 'a child age in a list blocks Start');
  await ages.fill(was); await wait(200);
  ok(await page.$eval('#runBtn', b => !b.disabled), 'taking it out lets Start go again');

  // a hypnosis picture
  await page.click('#bHyp h3');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-hpa="0"]')]);
  await fc.setFiles({name:'spiral.png', mimeType:'image/png', buffer:png});
  await page.waitForFunction(() => document.querySelectorAll('.hy .pic img').length >= 1, null, {timeout:5000});
  ok((await page.$$('.hy:first-child .pic img')).length === 1, 'the spiral picture is added to Spiral eyes');
  // only spiral on, so its picture is used
  for(const i of [1, 2, 3]) await page.click('[data-ho="' + i + '"]');

  // start: 1 clip
  await page.evaluate(() => { S.run.forever = false; S.run.left = 1; drawGo(); });
  await page.click('#runBtn');
  await page.waitForFunction(() => P.ac && P.ac.cur && P.ac.cur.stage >= 2, null, {timeout:15000});
  ok(true, 'it started: still made, parts going');
  await page.evaluate(u => fetch(u + '/test/other', {method:'POST'}), RU);
  await page.waitForFunction(() => { poll(); return P.ac && P.ac.status==='paused'; }, null, {timeout:8000, polling:300}).catch(() => {});
  ok(/Paused/.test(await page.$eval('#now', e => e.textContent)), 'another app\'s job pauses it: ' + await page.$eval('#now .why', e => e.textContent).catch(() => ''));
  await page.waitForFunction(() => Object.values(P.clips).length >= 1, null, {timeout:40000}).catch(() => {});
  const sent = JSON.parse(fs.readFileSync('/tmp/ac_sent.json', 'utf8')).filter(x => x.client_id === 'autoclip');
  const bad = sent.filter(x => x.errors.length);
  ok(!bad.length, 'every graph passes the checks' + (bad.length ? ': ' + bad[0].errors.slice(0, 3).join('; ') : ''));
  ok(sent[0] && Object.values(sent[0].prompt).some(n => n.class_type==='SaveImage') && Object.values(sent[0].prompt).some(n => /z_image/.test(n.inputs.unet_name || '')), 'the still is Z-Image');
  const parts = sent.filter(x => Object.values(x.prompt).some(n => n.class_type==='MiniMaxH3ReferenceToVideo'));
  const prom = p => Object.values(p.prompt).find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt;
  ok(parts.length >= 6 && parts.every(p => /clearly over 21/.test(prom(p))), 'every part prompt has the adult line (' + parts.length + ' part jobs, one redone)');
  const hyp = parts.filter(p => Object.values(p.prompt).some(n => n.class_type==='LoadImage' && /autoclip\//.test(n.inputs.image)));
  ok(hyp.length >= 4 && hyp.every(p => /<Picture 2>/.test(prom(p))), 'the spiral picture goes in from part 3 (' + hyp.length + ' jobs)');
  ok(!/<Picture 2>/.test(prom(parts[0])) && /spiral/i.test(prom(parts[2]) + prom(parts[3])), 'parts before the change have no picture 2; the change names spirals');
  ok(Object.values(parts[parts.length - 1].prompt).some(n => n.class_type==='RenderDeckH3Join'), 'the last part joins the clip');
  const c = await page.evaluate(() => Object.values(P.clips)[0]);
  ok(c && c.state==='done' && /AutoClip/.test(c.final.subfolder), 'the clip is done and in AutoClip');
  ok(c && c.redo >= 1, 'the stopped part was made again (' + (c && c.redo) + ')');
  await page.screenshot({path:path.join(__dirname, 'auto-done.png'), fullPage:true});
  await page.waitForSelector('[data-clip] video');
  ok(!!(await page.$('[data-clip] [data-again]')) && !!(await page.$('[data-clip] [data-star]')), 'the clip card has Again with her and Star');
  await page.click('[data-clip] [data-star]'); await page.waitForFunction(() => Object.values(P.clips)[0].star, null, {timeout:4000}).catch(() => {});
  ok(await page.evaluate(() => Object.values(P.clips)[0].star), 'Star sticks');
  await page.click('[data-clip] [data-again]'); await wait(400);
  ok(await page.evaluate(() => P.ac.lock), 'Again with her is set for the next clip');
  await page.click('[data-clip] [data-del]'); await wait(500);
  ok(!(await page.$('[data-clip]')), 'Delete takes the clip away');
  await page.screenshot({path:path.join(__dirname, 'auto.png'), fullPage:true});
  await br.close(); site.close(); py.kill();
  console.log(fails ? fails + ' failed' : 'all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
