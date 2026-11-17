// H3 Deck 🧹 Clear failed (Jordan 2026-11-17): failed/cancelled takes leave the list; one whose clip turned up after all comes back instead.
// One fake ComfyUI answered in the browser. Run: NODE_PATH=$(npm root -g) node tests/t_clearfail.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8071);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const PCS = {[M]:{name:'Main', line:[], run:false, dels:[], n:0, hist:{}}}; let ints = []; const FILES = new Set();
  await page.route(M + '/**', async rt => { const P = PCS[M], u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(rt.request().method()==='OPTIONS') return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*'}, body:''});
    if(p==='/system_stats') return J({devices:[]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST'){ const b = JSON.parse(rt.request().postData() || '{}'); if(b.delete){ P.dels.push(...b.delete); P.line = P.line.filter(id => !b.delete.includes(id)); } return J({}); }
    if(p==='/queue'){ const run = P.run && P.line.length ? [[0, P.line[0]]] : []; return J({queue_running:run, queue_pending:P.line.slice(run.length).map((id, i) => [i + 1, id])}); }
    if(p==='/interrupt'){ ints.push(JSON.parse(rt.request().postData() || '{}').prompt_id); return J({}); }
    if(p==='/free') return J({});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Main', images:[]});
    if(p==='/prompt'){ const pid = 'M' + (++P.n); P.line.push(pid); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')){ const id = p.slice(9); return J(P.hist[id] ? {[id]:P.hist[id]} : {}); }
    if(p.startsWith('/view')){ const fn = u.searchParams.get('subfolder') + '|' + u.searchParams.get('filename'); if(FILES.has(fn)) return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Expose-Headers':'Last-Modified', 'Last-Modified':new Date().toUTCString(), 'Content-Type':'video/mp4'}, body:''});
      return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); }
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(m => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Main', url:m, on:true, speed:1}]; }, M);
  await page.goto('http://127.0.0.1:8071/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'She walks down the street.', seconds:5, takes:1, seed:''}); H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(2500);

  const T = id => page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return t ? {state:t.state, final:t.final ? t.final.filename : '', late:!!t.late} : null; }, id);
  const tick = () => page.evaluate(() => H3.tick());
  const ids = () => page.evaluate(() => H3.S.takes.map(t => t.id));
  const cancelOld = () => page.evaluate(() => { const t = H3.S.takes[0]; return H3.cancelTake(t).then(() => { t.pieces.forEach(p => p.tq = Date.now() - 7 * 3600e3); return t.id; }); });
  // A: a take that finishes properly
  // three takes: A cancelled, its clip turns up later (lateFinish too old to look); B cancelled, no clip; C rendered
  const A = await cancelOld(); PCS[M].line = [];
  await page.click('#goBtn'); await page.waitForTimeout(2500); const B = await cancelOld(); PCS[M].line = [];
  await page.click('#goBtn'); await page.waitForTimeout(2500);
  const C = await page.evaluate(() => { const t = H3.S.takes[0]; t.state = 'done'; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:'piece_01_00009_.mp4', subfolder:'x', type:'output'}; }); t.final = t.pieces[0].file; H3.save && H3.save(); return t.id; });
  PCS[M].line = []; await tick();
  ok((await T(A)).state==='failed' && (await T(B)).state==='failed' && (await T(C)).state==='done', 'two read stopped, one finished');
  ok(await page.evaluate(() => !document.getElementById('clearFail').hidden), 'the 🧹 Clear failed button shows under Renders');
  const aDir = await page.evaluate(id => H3.outDir(H3.S.takes.find(x => x.id===id)), A); FILES.add(aDir + '|piece_01_00001_.mp4'); // A's clip is on the PC after all
  await page.click('#clearFail'); await page.waitForFunction(() => document.getElementById('clearFail').textContent.includes('Clear failed'), null, {timeout:15000}); await page.waitForTimeout(300);
  const left = await ids(); console.log(JSON.stringify(left), A, B, C);
  ok(left.includes(C), 'the rendered take stays');
  ok(!left.includes(B), 'the cancelled take with no clip is gone');
  let a = await T(A); ok(a && a.late && (a.state==='working' || a.state==='done'), 'the cancelled take whose clip turned up stays and comes back: ' + JSON.stringify(a));
  await tick(); a = await T(A); ok(a.state==='done' && a.final==='piece_01_00001_.mp4', 'it finishes with its clip');
  ok(await page.evaluate(() => document.getElementById('clearFail').hidden), 'nothing failed left, so the button hides');
  // the 🗂 Renders tab has the button too, and the 🎲 Wildcards screen shows the one under its clip list
  await page.click('#goBtn'); await page.waitForTimeout(2500); const D = await cancelOld(); PCS[M].line = []; await tick();
  await page.click('#tabs [data-tab="renders"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const b = document.getElementById('rtClearFail'); return b && !b.hidden && /\(1\)/.test(b.textContent); }), 'Renders tab: 🧹 Clear failed (1)');
  await page.click('#rtClearFail'); await page.waitForFunction(() => { const b = document.getElementById('rtClearFail'); return !b || b.hidden; }, null, {timeout:15000});
  ok(!(await ids()).includes(D) && (await ids()).includes(C), 'cleared from the Renders tab, the rendered take kept');
  await page.click('#tabs [data-tab="wild"]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !!document.querySelector('#renderTab:not([hidden]) #clearFail')), 'the Wildcards screen has the button with its clip list');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
