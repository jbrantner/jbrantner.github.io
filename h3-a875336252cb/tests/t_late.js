// H3 Deck 🛟 a take marked stopped whose clip was made after all comes back as finished (overnight QA 2026-11-16, take …tn07).
// One fake ComfyUI answered in the browser. Run: NODE_PATH=$(npm root -g) node tests/t_late.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8063);
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
  await page.goto('http://127.0.0.1:8063/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'She walks down the street.', seconds:5, takes:1, seed:''}); H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(2500);
  const T = i => page.evaluate(i => { const t = H3.S.takes[i]; return {id:t.id, state:t.state, ps:t.pieces.map(p => p.state).join(), err:t.pieces[0].err, final:t.final ? t.final.filename : '', late:!!t.late}; }, i);
  const tick = () => page.evaluate(() => H3.tick());
  // ⏱ the time a take will run shows above Render
  await page.waitForTimeout(1200); const eta = await page.evaluate(() => { const e = document.getElementById('goEta'); return e && !e.hidden ? e.textContent : ''; });
  if(process.env.SHOT) await page.screenshot({path:process.env.SHOT}); ok(/^⏱ About \d+ (s|min) a take/.test(eta), 'the bottom bar says how long a take will run: ' + eta);
  const ests = await page.evaluate(() => { const job = n => ({w:864, h:480, steps:8, imgs:Array(n).fill({}), vids:[], pieces:[{gen:124}]}); return [H3.estSecs(job(4), 'x'), H3.estSecs(job(9), 'x')]; });
  ok(ests[0] > 240 && ests[0] < 300 && ests[1] > 340 && ests[1] < 400, 'the guess matches Render\'s real takes (4 pictures ~266 s, 9 ~365 s): ' + ests.map(Math.round));
  let a = await T(0); ok(a.state==='working', 'the first take is on Main');
  // 1. she cancels it, but the clip gets made anyway (the job was sent again, or the cancel came after sampling)
  await page.evaluate(() => H3.cancelTake(H3.S.takes[0])); PCS[M].line = []; a = await T(0);
  ok(a.state==='failed' && a.err==='Cancelled', 'it reads Cancelled');
  FILES.add('piece_01_00001_.mp4'); await tick(); a = await T(0); console.log(JSON.stringify(a));
  ok(a.state==='done' && a.final==='piece_01_00001_.mp4' && a.late, 'its clip was there after all, so the take is finished with it');
  // 2. a cancelled take with no clip stays cancelled
  FILES.clear(); await page.click('#goBtn'); await page.waitForTimeout(2500);
  let b = await T(0); ok(b.id!==a.id && b.state==='working', 'a second take is on Main');
  await page.evaluate(() => H3.cancelTake(H3.S.takes[0])); PCS[M].line = []; await tick(); b = await T(0);
  ok(b.state==='failed' && b.err==='Cancelled', 'with no clip it stays cancelled');
  // 3. an old stopped take (long ago) is not looked at
  await page.evaluate(() => { const t = H3.S.takes[0]; t.pieces.forEach(p => p.tq = Date.now() - 7 * 3600e3); }); FILES.add('piece_01_00001_.mp4');
  await tick(); b = await T(0); ok(b.state==='failed', 'a take stopped hours ago is left alone');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
