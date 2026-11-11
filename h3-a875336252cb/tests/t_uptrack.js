// ⬆ Upscale track (Films): ✨ High quality with Prism Pika on every clip → stops for 🎭 Faces → 🧵 seams bridged and put back into the clips
// (fake ComfyUI, nothing renders). Run: CLIP=<a ~5 s video with sound> NODE_PATH=$(npm root -g) node tests/t_uptrack.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'h3_open_regenerate_2k_r128.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
  MinimaxH3LatentUpscaler3D:{input:{required:{model_name:[['minimax_h3_latent_upscaler_3d_bf16.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'Video Slice','ImageFromBatch','TrimAudioDuration','ImageBlur','RepeatImageBatch','ManualSigmas','LTXVSeparateAVLatent','LTXVConcatAVLatent','VAEEncode','MiniMaxH3ImageToVideo'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t), node = (g, t) => nodes(g, t)[0];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8031);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], views = [], QP = [], DEL = [];
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST'){ QP.push({host:u.origin, body:JSON.parse(rt.request().postData() || '{}')}); return J({}); }
    if(p==='/renderdeck/delete'){ DEL.push(JSON.parse(rt.request().postData() || '{}')); return J({moved:1}); }
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p==='/queue') return J({queue_running:[], queue_pending:sent.map(s => [0, s.pid])});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({});
    if(p==='/view'){ views.push(u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)}); }
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.webm', subfolder:'', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, host:u.origin, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')) return J({});
    if(p==='/history') return J({pz:{prompt:[0, 'pz', {'5':{class_type:'MiniMaxH3ReferenceToVideo', inputs:{prompt:'This continues straight on. she waves goodbye at the door'}}}], status:{completed:true, messages:[]},
      outputs:{'9':{images:[{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_202611060001_zz9q', type:'output'}]}, '12':{images:[{filename:'h3_202611060001_zz9q_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_202611060001_zz9q', type:'output'}]}}}});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route(M + '/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:'http://main.test', on:true, speed:1.26}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8031/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  // a finished 5 s take (one piece, 120 frames)
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => { H3.S.takes.unshift({id:'tA', t:Date.now(), pc:R, model:m, turbo:true, loras:[], w:640, h:352, seed:1, name:'h3_a', dir:'H3Deck/h3_a', prompt:'she walks to the window', seconds:5, imgs:[], vids:[], auds:[], follow:[],
    pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'she walks to the window', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}], state:'done', final:{filename:'h3_a_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  // 🎞 Films: a film with that take on it
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  await fr.waitForFunction(() => window.FILM && FILM.S).catch(() => {}); await fr.evaluate(() => { FILM.S.moreTools = true; FILM.draw && FILM.draw(); }); // 🧰 the tucked-away tools too
  const done = (id, fn) => page.evaluate(([id, fn]) => { const t = H3.S.takes.find(x => x.id===id); Object.assign(t, {state:'done', upStage:t.up ? 'done' : t.upStage, final:{filename:fn, subfolder:'Output_Render/H3Deck/' + t.name, type:'output'}}); t.pieces.forEach(p => { p.state = 'done'; p.file = p.file || t.final; }); H3.saveNow(); }, [id, fn]);
  // a film: two 5 s clips that touch on track 1, and a clip on its own further along
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}], pps:24}; FILM.S.films.unshift(f); const a = FILM.addClip(f, FILM.takeOf('tA'), 0), b = FILM.addClip(f, FILM.takeOf('tA'), 0); b.in = 1; b.out = 4; window.CA = a.id; window.CB = b.id; FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  const T0 = await fr.evaluate(() => { const f = FILM.S.films[0], cs = f.tracks[0].clips; return {btn:!!document.querySelector('[data-act="upTrack"]'), at:cs.map(c => [c.at, c.in, c.out])}; });
  ok(T0.btn && T0.at[1][0]===5, '⬆ Upscale track button is in the (bare) tools; the two clips touch: ' + JSON.stringify(T0));
  const S1 = await fr.evaluate(async () => { document.querySelector('[data-act="upTrack"]').click(); await new Promise(z => setTimeout(z, 200)); const q = s => document.querySelector(s);
    const r = {title:q('#sheetCard h3') && q('#sheetCard h3').textContent, pika:/Prism Pika/.test(q('#sheetCard').textContent), go:q('#utGo') && q('#utGo').textContent};
    q('#utGo').click(); await new Promise(z => setTimeout(z, 1500)); const f = FILM.S.films[0]; r.run = f.upRun && {state:f.upRun.state, hq:f.upRun.hq.length, unet:f.upRun.unet}; r.banner = (document.body.textContent.match(/⬆ Upscale track 1[^⏹]*/) || [''])[0]; return r; });
  const HQ = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).map(t => ({id:t.id, clip:t.redo.clip, unet:t.up.unet, scale:t.up.scale, den:t.up.den})));
  ok(/Upscale track 1/.test(S1.title) && S1.pika && /2 clips/.test(S1.go) && S1.run && S1.run.state==='hq' && S1.run.hq===2 && HQ.length===2 && HQ.every(h => /prismPIKA/.test(h.unet) && h.scale===1.5) && /0 of 2/.test(S1.banner), '1 ✨: the sheet offers Prism Pika; both clips get ✨ High quality ×1.5 on Prism Pika, the box says 0 of 2: ' + JSON.stringify({S1, HQ}));
  await done(HQ[0].id, 'hq1_00001.mp4');
  const W1 = await fr.evaluate(() => { FILM.placeNew(); const f = FILM.S.films[0]; return f.upRun.state; });
  await done(HQ[1].id, 'hq2_00001.mp4');
  const S2 = await fr.evaluate(async () => { FILM.placeNew(); FILM.draw(); await new Promise(z => setTimeout(z, 100)); const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at);
    return {state:f.upRun.state, takes:cs.map(c => FILM.takeOf(c.take).redo && FILM.takeOf(c.take).redo.qp), seamBtn:!!document.querySelector('[data-act="upSeams"]'), skip:!!document.querySelector('[data-act="upSkip"]'), cs:cs.map(c => [c.at, +c.in.toFixed(2), +c.out.toFixed(2)])}; });
  ok(W1==='hq' && S2.state==='faces' && S2.takes.every(Boolean) && S2.seamBtn && S2.skip, '2 🎭: it waits while a clip is still going, then stops with 🧵 Blend the seams / Done, no seams once both ✨ clips are in place: ' + JSON.stringify({W1, S2}));
  const S3 = await fr.evaluate(async () => { document.querySelector('[data-act="upSeams"]').click(); await new Promise(z => setTimeout(z, 1500)); const f = FILM.S.films[0]; return {state:f.upRun.state, seams:(f.upRun.seams || []).length}; });
  const CB = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.seam); return t && {id:t.id, frames:t.combo.seam.frames, model:t.model, w:t.w, h:t.h, parts:t.combo.parts.length, bounds:t.combo.seam.bounds.map(b => [b.off, b.len])}; });
  const S3b = await fr.evaluate(() => { FILM.placeNew(); const f = FILM.S.films[0]; return f.tracks[0].clips.length; });
  ok(S3.state==='seams' && S3.seams===1 && CB && JSON.stringify(CB.frames)==='[120]' && /pika/.test(CB.model) && CB.w===960 && CB.h===512 && CB.parts===2 && S3b===2, '3 🧵: the two touching clips are joined only for bridging (the track keeps its 2 clips), the seam at frame 120, on Prism Pika, at the ✨ size: ' + JSON.stringify({S3, CB, S3b}));
  await done(CB.id, 'seam_00001.mp4');
  const n0 = await page.evaluate(() => H3.S.takes.length);
  const BR = await page.evaluate(async id => { const t = H3.S.takes.find(x => x.id===id); const n = await H3.bridgeNext(t); const b = H3.S.takes.find(x => x.redo && x.redo.bridge && x.redo.bridge.sj);
    return {n, id:b && b.id, rest:b && b.redo.bridge.rest.length, a:b && b.redo.a, bb:b && b.redo.b, s0:b && b.redo.s0, model:b && b.model, w:b && b.w}; }, CB.id);
  ok(BR.n===1 && BR.rest===0 && BR.a <= 120 && BR.bb >= 120 && BR.s0 <= 120 - 24 && /pika/.test(BR.model) && BR.w===960, '🧵 the seam gets a bridge redo around frame 120 with about 1 s pinned before it: ' + JSON.stringify(BR));
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); t.redo.Fout = 216; }, BR.id); await done(BR.id, 'bridge_00001.mp4');
  const S4 = await fr.evaluate(id => { FILM.placeNew(); FILM.draw(); const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at);
    return {state:f.upRun.state, cs:cs.map(c => [c.take===id, +c.at.toFixed(2), +c.in.toFixed(2), +c.out.toFixed(2), (c.alts || []).length]), box:!!document.body.textContent.match(/⬆ Upscale track 1 ·/)}; }, BR.id);
  ok(S4.state==='done' && S4.cs[0][0] && S4.cs[1][0] && S4.cs[0][2]===0 && S4.cs[0][3]===5 && S4.cs[1][2]===5 && S4.cs[1][3]===8 && S4.cs[1][1]===5 && S4.cs[0][4]===2 && !S4.box, 'the bridged video goes back into both clips at their own stretches (the ✨ takes stay in their versions) and the box goes away: ' + JSON.stringify(S4));
  // retry: a seam that fails shows the error and 🧵 Blend the seams again
  const RT = await fr.evaluate(() => { const f = FILM.S.films[0]; f.upRun = {id:'u2', track:'tr1', state:'seams', seams:['kX'], hq:[]}; return true; });
  await page.evaluate(() => { H3.S.takes.unshift({id:'tX', t:Date.now(), pc:'http://render.test', state:'failed', pieces:[{state:'failed', err:'boom'}], combo:{seam:{rk:'kX', run:'u2'}, parts:[]}, prompt:''}); H3.saveNow(); });
  const S5 = await fr.evaluate(async () => { await new Promise(z => setTimeout(z, 300)); FILM.placeNew(); FILM.draw(); const f = FILM.S.films[0]; return {err:f.upRun.err, again:(document.querySelector('[data-act="upSeams"]') || {}).textContent}; });
  ok(/boom/.test(S5.err) && /again/.test(S5.again || ''), 'a failed seam shows its error and offers 🧵 Blend the seams again: ' + JSON.stringify(S5));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
