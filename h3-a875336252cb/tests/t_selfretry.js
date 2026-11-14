// H3 Deck ↻ a piece that left a PC's line or was stopped there is sent again by itself (Jordan 2026-11-14: "Main keeps failing").
// One fake ComfyUI answered in the browser. Run: NODE_PATH=$(npm root -g) node tests/t_selfretry.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const PCS = {[M]:{name:'Main', line:[], run:false, dels:[], n:0, hist:{}}}; let ints = [];
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
    if(p.startsWith('/view')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(m => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Main', url:m, on:true, speed:1}]; }, M);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'She walks down the street.', seconds:5, takes:1, seed:''}); H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(2500);
  const T = () => page.evaluate(() => { const t = H3.S.takes[0]; return {state:t.state, pid:t.pieces[0].pid, ps:t.pieces[0].state, err:t.pieces[0].err, selfAt:t.selfAt || 0, tries:t.selfTries || 0, line:document.querySelector('.take') ? document.querySelector('.take').textContent : ''}; });
  const old = () => page.evaluate(() => { H3.S.takes[0].pieces.forEach(p => p.tq = Date.now() - 30000); });
  const tick = () => page.evaluate(() => H3.tick());
  let t = await T(); ok(t.state==='working' && t.pid==='M1', 'the take is on Main (' + t.pid + ')');
  // 1. it vanishes from Main's line with no history (another copy moved it, or ComfyUI restarted)
  PCS[M].line = []; await old(); await tick(); t = await T(); console.log(JSON.stringify(t).slice(0, 300));
  ok(t.state==='failed' && /left Main/.test(t.err) && t.selfAt > 0, 'it stops with "left Main\'s queue" and waits to go again by itself');
  ok(/sending it again by itself in \d+ s/.test(t.line), 'the card says it will be sent again by itself');
  await page.evaluate(() => { H3.S.takes[0].selfAt = Date.now() - 1; }); await tick(); t = await T();
  ok(t.state==='working' && t.pid==='M2' && t.tries===1 && PCS[M].line.includes('M2'), 'it is sent again to Main (try 1, ' + t.pid + ')');
  // 2. something on Main stops it (an interrupt from somewhere else): ComfyUI keeps an interrupted history entry
  PCS[M].line = []; PCS[M].hist.M2 = {status:{status_str:'error', completed:false, messages:[['execution_start', {}], ['execution_interrupted', {}]]}, outputs:{}};
  await tick(); t = await T();
  ok(t.state==='failed' && /something stopped it on Main/.test(t.err) && t.selfAt > 0, 'an interrupt says so and also goes again by itself (' + t.err + ')');
  await page.evaluate(() => { H3.S.takes[0].selfAt = Date.now() - 1; }); await tick(); t = await T();
  ok(t.state==='working' && t.pid==='M3' && t.tries===2, 'try 2 sent (' + t.pid + ')');
  // 3. after two tries it waits for her
  PCS[M].line = []; await old(); await tick(); t = await T();
  ok(t.state==='failed' && !t.selfAt, 'after 2 tries it stops and waits for ↻ Try again');
  // 4. a real error is never sent again by itself
  await page.evaluate(() => { const t = H3.S.takes[0]; t.selfTries = 0; }); await page.evaluate(() => H3.retryTake(H3.S.takes[0])); t = await T();
  PCS[M].line = []; PCS[M].hist[t.pid] = {status:{status_str:'error', completed:false, messages:[['execution_error', {exception_message:'Allocation on device'}]]}, outputs:{}};
  await tick(); t = await T(); ok(t.state==='failed' && /Allocation/.test(t.err) && !t.selfAt, 'a real ComfyUI error is not retried by itself');
  // 5. her own cancel is never sent again
  await page.evaluate(() => H3.retryTake(H3.S.takes[0])); t = await T(); ok(t.state==='working', 'sent again by hand');
  await page.evaluate(() => H3.cancelTake(H3.S.takes[0])); PCS[M].line = []; await tick(); t = await T();
  ok(t.state==='failed' && t.err==='Cancelled' && !t.selfAt, 'a cancel stays cancelled');
  // 6. a second tab of H3 Deck on the same phone doesn't follow the takes while the first one does
  const p2 = await page.context().newPage(); await p2.route(M + '/**', rt => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:'{}'}));
  const lead1 = await page.evaluate(() => JSON.parse(localStorage.getItem('h3lead')).id);
  await p2.goto('http://127.0.0.1:8047/index.html?x=2'); await p2.waitForTimeout(3000);
  const lead2 = await page.evaluate(() => JSON.parse(localStorage.getItem('h3lead')).id);
  ok(lead1===lead2, 'the first tab stays the one following takes');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
