// H3 Deck ⇄ a free PC takes waiting takes (Jordan 2026-11-13: Main did one take and sat idle while Render still had a line).
// Two fake ComfyUIs answered in the browser (nothing renders). Run: NODE_PATH=$(npm root -g) node tests/t_move.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8031);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  // each fake PC: its line of prompt ids; the first is running when .run is set
  const PCS = {[R]:{name:'Render', line:[], run:false, dels:[], n:0}, [M]:{name:'Main', line:[], run:false, dels:[], n:0}};
  for(const base of [R, M]) await page.route(base + '/**', async rt => { const P = PCS[base], u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(rt.request().method()==='OPTIONS') return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*'}, body:''});
    if(p==='/system_stats') return J({devices:[]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST'){ const b = JSON.parse(rt.request().postData() || '{}'); if(b.delete){ P.dels.push(...b.delete); P.line = P.line.filter(id => !b.delete.includes(id) || (P.run && id===P.line[0])); } return J({}); }
    if(p==='/queue'){ const run = P.run && P.line.length ? [[0, P.line[0]]] : []; return J({queue_running:run, queue_pending:P.line.slice(run.length).map((id, i) => [i + 1, id])}); }
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_' + P.name, images:[]});
    if(p==='/prompt'){ const pid = P.name[0] + (++P.n); P.line.push(pid); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(([r, m]) => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1.26}]; }, [R, M]);
  await page.goto('http://127.0.0.1:8031/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  // a batch of 3 on a 10 s clip (2 parts each), both PCs
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'She walks down the street.', seconds:10, maxPiece:5, takes:3, seed:'', where:'both'}); H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(2500);
  const pcsOf = () => page.evaluate(() => H3.S.takes.map(t => ({id:t.id, pc:t.pc, pids:t.pieces.map(p => p.pid), st:t.pieces.map(p => p.state)})));
  let T = await pcsOf(); console.log(JSON.stringify(T));
  const on = u => T.filter(t => t.pc===u).length;
  ok(T.length===3 && on(R) >= 1 && on(M) >= 1, 'the batch is split when sent (Render ' + on(R) + ', Main ' + on(M) + ')');
  // Main finished its take and is empty; Render is running one and has the rest waiting
  await page.evaluate(M => { H3.S.takes.filter(t => t.pc===M).forEach(t => { t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:'x.mp4', subfolder:'', type:'output'}; }); t.state = 'done'; t.final = t.pieces[0].file; }); }, M);
  PCS[M].line = []; PCS[R].run = true;
  // a second batch of 2 on Render only, so Render has a real line behind its running take
  await page.evaluate(R => { Object.assign(H3.S.f, {takes:2, where:R}); }, R);
  await page.click('#goBtn'); await page.waitForTimeout(2500);
  await page.evaluate(() => { H3.S.f.where = 'both'; });
  T = await pcsOf(); const rLine = PCS[R].line.slice(); console.log('Render line', rLine.join(' '));
  const last = T.filter(t => t.pc===R && t.st.every(s => s==='queued')).sort((a, b) => Math.max(...b.pids.map(p => rLine.indexOf(p))) - Math.max(...a.pids.map(p => rLine.indexOf(p))))[0];
  const runningTake = T.find(t => t.pids.includes(rLine[0]));
  const n = await page.evaluate(() => H3.rebalance()); T = await pcsOf(); console.log(JSON.stringify(T));
  ok(n===1, 'one take moved (' + n + ')');
  const mv = T.find(t => t.id===last.id);
  ok(mv && mv.pc===M && mv.pids.every(p => /^M/.test(p)) && mv.st.every(s => s==='queued'), 'the take furthest back on Render went to Main, both parts queued there');
  ok(last.pids.every(p => PCS[R].dels.includes(p) && !PCS[R].line.includes(p)), 'it was taken out of Render\'s line');
  ok(PCS[M].line.length===2, 'Main got its 2 parts (' + PCS[M].line.join(' ') + ')');
  ok(T.find(t => t.id===runningTake.id).pc===R, 'the take Render is running stays on Render');
  // Main busy now: nothing more moves
  const n2 = await page.evaluate(() => H3.rebalance()); ok(n2===0, 'nothing moves while Main is busy');
  // Main switched off (gaming): it takes nothing
  PCS[M].line = []; await page.evaluate(M => { H3.S.takes.filter(t => t.pc===M).forEach(t => { t.pieces.forEach(p => p.state = 'done'); t.state = 'done'; }); H3.S.pcs[1].on = false; }, M);
  const n3 = await page.evaluate(() => H3.rebalance()); ok(n3===0, 'a PC switched off takes nothing');
  await page.evaluate(() => { H3.S.pcs[1].on = true; H3.S.f.where = 'http://render.test'; });
  const n4 = await page.evaluate(() => H3.rebalance()); ok(n4===0, 'with "Render only" picked nothing moves');
  await page.evaluate(() => { H3.S.f.where = 'both'; });
  // the running take never moves, even when it's the only one left
  PCS[R].line = PCS[R].line.slice(0, 2); await page.evaluate(ids => { H3.S.takes.forEach(t => { if(!t.pieces.some(p => ids.includes(p.pid)) && t.state==='working'){ t.state = 'done'; } }); }, PCS[R].line);
  const n5 = await page.evaluate(() => H3.rebalance()); ok(n5===0, 'a take already running stays put');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
