// 🎲 Long-take parts: each part its own seed, and a part with no new line of its own is told to move on (Jordan 2026-11-14)
// Run: NODE_PATH=$(npm root -g) node tests/t_partseed.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const r = await page.evaluate(([R, REF]) => {
    const t0 = '[1s-2s] She sits down, carrying on from the moment before.\n[2s-5.9s] Her hands move slowly. She sways.';
    const pl = H3.plan(15, 5, H3.parseBeats(t0).beats), P = pl.map((p, i) => H3.piecePrompt(t0, pl, i));
    const t2 = '[0s-4s] She walks in.\n[4s-7s] She sits down.\n[7s-10s] She opens a book.', pl2 = H3.plan(10, 5, H3.parseBeats(t2).beats), P2 = pl2.map((p, i) => H3.piecePrompt(t2, pl2, i));
    Object.assign(H3.S.f, {model:REF, prompt:t0, seconds:15, shuffle:0});
    const t = H3.snapshot(); t.id = 'tps'; t.pc = R; t.seed = 12345; t.dir = 'H3Deck/x'; t.name = 'x';
    t.pieces = pl.map((p, i) => Object.assign({}, p, {prompt:P[i]}));
    const seeds = t.pieces.map((p, i) => Object.values(H3.pieceGraph(t, i, H3.PC[R].oi, {}).g).filter(n => n.class_type==='RandomNoise').map(n => n.inputs.noise_seed));
    const again = Object.values(H3.pieceGraph(t, 1, H3.PC[R].oi, {}).g).find(n => n.class_type==='RandomNoise').inputs.noise_seed;
    return {P, P2, seeds, again, n:pl.length, big:H3.pieceSeed({seed:2147483000}, 2)}; }, [R, REF]);
  ok(r.n===3, '15 s take → 3 parts');
  ok(r.seeds.every(s => s.length===1) && r.seeds[0][0]===12345, 'part 1 keeps the take\'s seed: ' + JSON.stringify(r.seeds));
  ok(new Set(r.seeds.map(s => s[0])).size===3, 'every part its own seed');
  ok(r.again===r.seeds[1][0], 'the same part always gets the same seed');
  ok(r.big >= 0 && r.big < 2147483647, 'seed stays in range: ' + r.big);
  ok(!/keeps moving forward/.test(r.P[0]) && r.P.slice(1).every(x => /\(carrying on\) Her hands move slowly\. She sways\. The action keeps moving forward/.test(x)), 'parts 2-3 (only the carried line) are told to move on: ' + JSON.stringify(r.P));
  ok(r.P2.every(x => !/keeps moving forward/.test(x)), 'parts with a new line of their own are left as they are: ' + JSON.stringify(r.P2));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
