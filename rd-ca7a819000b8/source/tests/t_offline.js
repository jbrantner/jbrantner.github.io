// with the computer off: finished pictures still show (kept on the phone by sw.js), the app opens with the saved model
// lists, and a render waits on the phone until the computer is back, then goes to it by itself
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), { execSync } = require('child_process');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rdsite-'));
execSync('python3 webbuild.py ' + out, { cwd:path.join(__dirname, '..'), stdio:'ignore' });
let up = true; const prompts = [], asked = [];
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}}, LoraLoader:{input:{required:{lora_name:[[]]}}},
  KSampler:{input:{required:{sampler_name:[['euler','euler_ancestral']], scheduler:[['normal','karras']]}}},
  CLIPTextEncode:{input:{required:{}}}, EmptyLatentImage:{input:{required:{}}}, VAEDecode:{input:{required:{}}}, SaveImage:{input:{required:{}}}, KSamplerAdvanced:{input:{required:{}}}};
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:'allow' });
  const page = await ctx.newPage(); const logs = []; page.on('pageerror', e => logs.push(e.message + ' @ ' + (e.stack||'').split('\n').slice(1,3).join(' ')));
  const srv = require('http').createServer((q, res) => { const f = q.url.split('?')[0]==='/' ? 'index.html' : q.url.split('?')[0].slice(1);
    if(/\.txt$/.test(f)){ res.writeHead(200, {'Content-Type':'text/plain'}); return res.end(''); }
    try{ const b = fs.readFileSync(path.join(out, f)); res.writeHead(200, {'Content-Type':f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'}); res.end(b); }catch(e){ res.writeHead(404); res.end(); } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const APP = 'http://localhost:' + srv.address().port + '/';
  const H = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*'};
  const pcSrv = require('http').createServer((q, res) => { if(!up){ res.socket.destroy(); return; }
    const u = new URL(q.url, 'http://x'), send = (j, type) => { res.writeHead(200, Object.assign({'Content-Type':type || 'application/json'}, H)); res.end(type ? j : JSON.stringify(j)); };
    if(q.method==='OPTIONS') return send({}); asked.push(u.pathname + u.search);
    if(u.pathname==='/object_info') return send(OI);
    if(u.pathname==='/prompt' && q.method==='POST'){ prompts.push(1); return send({prompt_id:'p' + prompts.length, number:1, node_errors:{}}); }
    if(u.pathname==='/queue') return send({queue_running:[], queue_pending:[]});
    if(u.pathname==='/view' || u.pathname==='/renderdeck/thumb') return send(PNG, 'image/png');
    if(u.pathname.startsWith('/history')) return send({});
    res.writeHead(404, H); res.end(); }); // no helper, no socket
  await new Promise(r => pcSrv.listen(0, '127.0.0.1', r)); const PC = 'http://127.0.0.1:' + pcSrv.address().port;
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.goto(APP);
  await page.evaluate(PC => { S.servers = [{name:'Render', url:PC}]; S.server = PC;
    S.gallery = [{url:PC + '/view?filename=fox_00001_.png&subfolder=RenderDeck&type=output', seed:1, prompt:'', t:Date.now()}]; save(); }, PC);
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => 0), null, {timeout:10000}).catch(() => {});
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout:10000});
  await page.waitForFunction(() => info && !offline, null, {timeout:10000});
  await page.waitForFunction(() => { const i = document.querySelector('#strip img[data-i="0"]'); return i && i.complete && i.naturalWidth > 0; }, null, {timeout:10000});
  await page.waitForTimeout(500);
  ok(await page.evaluate(async () => !!(await (await caches.open('render-deck-pictures')).match('https://rd-pic/thumb/RenderDeck/fox_00001_.png'))), 'the thumbnail is kept on the phone');
  // the computer goes off; the app is opened again
  up = false; asked.length = 0;
  await page.reload();
  await page.waitForFunction(() => info && offline, null, {timeout:15000});
  ok(true, 'with the computer off the app opens with its saved model lists');
  await page.waitForFunction(() => { const i = document.querySelector('#strip img[data-i="0"]'); return i && i.complete && i.naturalWidth > 0; }, null, {timeout:10000}).catch(() => {});
  ok(await page.evaluate(() => { const i = document.querySelector('#strip img[data-i="0"]'); return i && i.naturalWidth > 0; }), 'the thumbnail still shows, from the phone');
  await page.evaluate(() => { const s = document.querySelector('#prompt'); s.value = 'a red fox'; S.prompt = 'a red fox'; save(); });
  await page.click('#goBtn');
  await page.waitForFunction(() => S.queue.some(e => e.outbox), null, {timeout:8000}).catch(() => {});
  ok(await page.evaluate(() => S.queue.length===1 && S.queue[0].outbox && S.queue[0].graph), 'Render with the computer off keeps the render on the phone: ' + await page.evaluate(() => JSON.stringify(S.queue.map(e => [e.state, e.outbox])) + ' ' + document.querySelector('#err') ?.textContent));
  await page.click('#queueBtn');
  ok(/On the phone: goes as soon as a computer is on/.test(await page.textContent('body')), 'the queue says it waits on the phone');
  await page.reload(); await page.waitForFunction(() => info && offline, null, {timeout:15000});
  ok(await page.evaluate(() => S.queue.length===1 && S.queue[0].outbox), 'it stays waiting when the app is closed and opened again');
  up = true;
  await page.waitForFunction(() => !S.queue.some(e => e.outbox), null, {timeout:45000}).catch(() => {});
  ok(prompts.length===1 && await page.evaluate(() => !offline), 'when the computer is back the render goes to it by itself: ' + prompts.length);
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); srv.close(); pcSrv.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
