// H3 Deck ↻ a ✨/⬆ regenerate that left the PC's line (restart) goes again by itself, twice; her Cancel and real errors don't (Jordan 2026-11-16).
// One fake ComfyUI answered in the browser. Run: NODE_PATH=$(npm root -g) node tests/t_upretry.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8064);
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
    if(p.startsWith('/view')){ const fn = u.searchParams.get('filename'); if(FILES.has(fn)) return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Expose-Headers':'Last-Modified', 'Last-Modified':new Date().toUTCString(), 'Content-Type':'video/mp4'}, body:''});
      return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); }
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(m => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Main', url:m, on:true, speed:1}]; }, M);
  await page.goto('http://127.0.0.1:8064/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'She walks down the street.', seconds:5, takes:1, seed:''}); H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(2500);
  const tick = () => page.evaluate(() => H3.tick());
  // a finished take with a regenerate waiting in Main's line
  await page.waitForFunction(() => H3.S.takes[0] && H3.S.takes[0].pieces[0].pid, null, {timeout:10000});
  const setUp = () => page.evaluate(() => { const t = H3.S.takes[0]; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:'piece_01_00001_.mp4', subfolder:'x', type:'output'}; });
    Object.assign(t, {state:'working', final:{filename:'piece_01_00001_.mp4', subfolder:'x', type:'output'}, up:{scale:1.5, rep:'medium', str:0.8}, upStage:'queued', upPid:'GONE', tu:Date.now() - 120000, upErr:''}); });
  const U = () => page.evaluate(() => { const t = H3.S.takes[0]; return {stage:t.upStage, err:t.upErr || '', tries:t.upTries || 0, state:t.state, card:(document.querySelector('.take') || {}).textContent || ''}; });
  PCS[M].line = []; await setUp(); await tick(); let u = await U(); console.log(JSON.stringify(u).slice(0, 200));
  ok(u.tries===1 && u.stage!=='done' && u.state==='working' && !u.err, 'a regenerate that left the line (restart) goes again by itself (try 1)');
  await setUp(); await tick(); u = await U(); ok(u.tries===2 && u.stage!=='done', 'try 2');
  await setUp(); await tick(); u = await U(); ok(u.stage==='done' && /left the queue/.test(u.err), 'after 2 tries it keeps the original and says why');
  await page.evaluate(() => H3.drawTakes && H3.drawTakes()); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('[data-act="upretry"]')), 'the card has ↻ Regenerate again');
  // an interrupt from somewhere else (a stop, not an error) also goes again; a real error doesn't
  await page.evaluate(() => { H3.S.takes[0].upTries = 0; }); await setUp(); PCS[M].hist.GONE = {status:{status_str:'error', completed:false, messages:[['execution_interrupted', {}]]}, outputs:{}};
  await tick(); u = await U(); ok(u.tries===1 && u.stage!=='done', 'a stop from elsewhere goes again');
  await setUp(); PCS[M].hist.GONE = {status:{status_str:'error', completed:false, messages:[['execution_error', {exception_message:'Allocation on device'}]]}, outputs:{}};
  await tick(); u = await U(); ok(u.stage==='done' && /Allocation/.test(u.err) && u.tries===1, 'a real error is not retried');
  // her own Cancel stays cancelled
  await page.evaluate(() => { H3.S.takes[0].upTries = 0; }); await setUp(); delete PCS[M].hist.GONE; await page.evaluate(() => H3.cancelTake(H3.S.takes[0])); await tick(); u = await U();
  ok(u.stage==='done' && u.err==='Cancelled' && u.tries===0, 'her own Cancel is never sent again');
  await page.waitForTimeout(500); console.log(await page.evaluate(() => [...document.querySelectorAll('[data-act="upretry"]')].map(b => b.dataset.t + ' ' + b.closest('.take').textContent.replace(/\s+/g, ' ').slice(0, 300))));
  ok(await page.evaluate(() => !document.querySelector('[data-act="upretry"]')), 'and shows no ↻ Regenerate again');
  // ⛓ a ✨ that carries on from the one before waits for it after being sent again (it needs that full-quality ending)
  const ch = await page.evaluate(() => { const a = H3.S.takes[0], b = JSON.parse(JSON.stringify(a)); b.id = 'tB'; H3.S.takes.unshift(b);
    Object.assign(a, {state:'working', upStage:'queued', upPid:'A1', tu:Date.now(), upErr:''}); Object.assign(b, {state:'working', upStage:'queued', upPid:'GONE2', tu:Date.now() - 120000, upErr:'', upTries:0, up:Object.assign({}, a.up, {chain:{prev:a.id}})}); return a.id; });
  PCS[M].line = ['A1']; await tick();
  let c = await page.evaluate(() => { const b = H3.S.takes.find(x => x.id==='tB'); return {stage:b.upStage, wait:!!b.waitPrev, tries:b.upTries}; });
  ok(c.tries===1 && c.stage==='start' && c.wait, 'the carry-on ✨ is sent again and waits (' + JSON.stringify(c) + ')');
  await tick(); c = await page.evaluate(() => { const b = H3.S.takes.find(x => x.id==='tB'); return {stage:b.upStage, wait:!!b.waitPrev}; });
  ok(c.stage==='start' && c.wait, 'it stays waiting while the ✨ before it is still rendering');
  await page.evaluate(id => { const a = H3.S.takes.find(x => x.id===id); Object.assign(a, {upStage:'done', state:'done'}); }, ch); await tick(); await page.waitForTimeout(500);
  c = await page.evaluate(() => { const b = H3.S.takes.find(x => x.id==='tB'); return {stage:b.upStage, wait:!!b.waitPrev}; });
  ok(c.stage!=='start' && !c.wait, 'once that ✨ is done it goes (' + JSON.stringify(c) + ')');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
