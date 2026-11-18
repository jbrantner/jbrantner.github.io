// 🔁 loop without smoothing (Jordan 2026-11-17: "the option to not smooth it when I want to loop it"): your own frames, halves swapped
// with ⛓ Join and one 🧵 seam bridge that paints only the turn. Make it loop (switch off) and the 🎲 wildcard loop. (fake ComfyUI)
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_rawloop.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8049);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], views = [], QP = [], DEL = [], FIN = [];
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/renderdeck/h3finish' && rt.request().method()==='POST'){ FIN.push(JSON.parse(rt.request().postData() || '{}')); return J({id:'f1'}); }
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
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8049/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => {
    ['p1', 'p2', 'q1', 'q2', 'q3', 'k1', 'a1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lk', kind:'pose', name:'Kneel', pics:['k1'], desc:'Kneeling on one knee', ppl:[]}, {id:'La', kind:'attr', name:'spiral eyes', what:'eyes', pics:['a1']}]);
    const cast = [{n:1, kind:'char', who:'Laura', stand:'a woman', desc:'red hair, green eyes', attrs:['La'], pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', stand:'a girl', pics:['q1', 'q2', 'q3'], keep:'exact'}];
    H3.S.cast = cast; H3.S.casts = H3.S.casts || {}; H3.S.casts[H3.castK('fA')] = cast;
    H3.S.lines = H3.S.lines || {}; H3.S.lines[1] = {pose:1, n:1, lib:'Lk', p:-1, name:'Kneel', text:''};
    const t = {id:'tA', t:Date.now(), pc:R, model:m, turbo:false, loras:[], w:640, h:352, seed:1, name:'h3_tA', dir:'H3Deck/h3_tA', film:'fA', prompt:'<Subject 1> walks to the window. <Pose 1>', seconds:5, imgs:[], vids:[], auds:[], follow:[], lines:{1:H3.S.lines[1]},
      pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'<Subject 1> walks to the window. <Pose 1>', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_tA', type:'output'}}], state:'done', final:{filename:'h3_tA_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_tA', type:'output'}};
    H3.S.takes.unshift(t); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));

  // 1) 🔁 Make it loop from the take, the 🪄 switch turned off, ✂ 1 s to 4 s
  await page.evaluate(async () => { await window.H3LoopTake('tA'); });
  await page.waitForTimeout(800);
  const sw = await page.evaluate(() => ({on:document.querySelector('#smLoopSmSw').classList.contains('on'), src:H3.S.f.smSrc}));
  ok(sw.on && sw.src==='tA', 'Make it loop has 🪄 Smooth the whole loop too, on by default, and knows the take: ' + JSON.stringify(sw));
  const off = await page.evaluate(() => ({fin:H3.S.f.smFin, sw:document.querySelector('#smFinSw').classList.contains('on')}));
  ok(off.fin===false && !off.sw, '📺 4K 60 is off unless switched on (Jordan 2026-11-18): ' + JSON.stringify(off));
  await page.$eval('#smLoopSmSw', b => b.click());
  await page.evaluate(() => { const f = H3.S.f; f.smFin = true; f.smStart = 1; f.seconds = 3; f.smSeam = 12; H3.saveNow(); });
  const n0 = sent.length;
  await page.$eval('#goBtn', b => b.click()); await page.waitForTimeout(1500);
  if(0) console.log('toasts', await page.evaluate(() => [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | ')), await page.evaluate(() => ({dis:document.querySelector('#goBtn').disabled, txt:document.querySelector('#goBtn').textContent, on:H3.S.f.smLoopSm, sm:H3.S.f.sm, loop:H3.S.f.smLoop, n:H3.S.takes.length})));
  const T = await page.evaluate(() => { const t = H3.S.takes[0]; return t && {combo:!!t.combo, parts:t.combo && t.combo.parts.map(q => [q.take, +q.in.toFixed(3), +q.out.toFixed(3)]), seam:t.combo && t.combo.seam && {loop:t.combo.seam.loop, half:t.combo.seam.half, frames:t.combo.seam.frames, one:t.combo.seam.one, rk:!!t.combo.seam.rk},
    raw:t.rawLoop, k4:t.k4want, loopOf:t.loopOf, film:t.film, prompt:t.prompt, sm:t.sm}; });
  ok(T && T.combo && JSON.stringify(T.parts)===JSON.stringify([['tA', 2.5, 4], ['tA', 1, 2.5]]) && T.seam.loop && T.seam.half===6 && T.seam.one && T.seam.rk && JSON.stringify(T.seam.frames)==='[36]' && !T.sm,
    'switch off: the stretch\'s halves are joined second half first and the turn is bridged (6 free frames each side), no smoothing: ' + JSON.stringify(T));
  ok(T.raw && T.raw.src==='tA' && T.k4 && T.k4.fps===60 && T.loopOf==='tA' && T.film==='fA' && !/\[/.test(T.prompt), 'it remembers the take it loops, 4K 60 still finishes it, and the words lose their timings: ' + JSON.stringify(T));
  const G = sent.slice(n0).map(s => s.g).find(g => node(g, 'ConcatenateVideo'));
  const sl = G && nodes(G, 'Video Slice').map(n => [n.inputs.start_time, n.inputs.duration]);
  const guides = G ? nodes(G, 'MiniMaxH3AddGuide').filter(n => n.inputs.image).length : 0;
  ok(G && JSON.stringify(sl.slice(0, 2))==='[[2.5,1.5],[1,1.5]]' && guides >= 6 && nodes(G, 'SamplerCustomAdvanced').length===1, 'one job: the two halves cut from the take, then one MiniMax pass over the turn only: ' + JSON.stringify({sl, guides}));
  // done → the 4K finish is told it loops
  await page.evaluate(async () => { const t = H3.S.takes[0]; t.state = 'done'; t.final = {filename:'x_00001_.mp4', subfolder:'Output_Render/H3Deck/x', type:'output'}; H3.finStart(t); await H3.tickFin(t); });
  ok(FIN.length===1 && FIN[0].loop===true && FIN[0].fps===60, 'the 4K 60 finish of a loop paints its last frames into its first: ' + JSON.stringify(FIN));
  // 2) the switch on again: Render makes the usual 🪄 looping smoothing
  const T2 = await page.evaluate(() => { H3.S.f.smLoopSm = true; H3.drawAll(); return {raw:H3.rawLoopOn(), sw:document.querySelector('#smLoopSmSw').classList.contains('on'), snapLoop:!!(H3.snapshot().sm || {}).loop}; });
  ok(!T2.raw && T2.sw && T2.snapLoop, 'switch on: the usual 🪄 looping smoothing: ' + JSON.stringify(T2));
  // 3) 🎲 wildcard loop with 🪄 off
  const W = await page.evaluate(async () => { H3.S.f.wildLoop = true; H3.S.f.wildLoopSm = false; H3.drawAll(); const btn = !!document.querySelector('[data-wt="loopsm"]');
    const t = H3.S.takes.find(x => x.id==='tA'); Object.assign(t, {wildLoop:1, wildRaw:1, loopTake:null, loopTried:0}); const r = await H3.wildLoopGo(t); const n = H3.S.takes.find(x => x.id===t.loopTake);
    return {r, btn, n:n && {combo:!!n.combo, loopOf:n.loopOf, raw:!!n.rawLoop, up:n.up, k4:n.k4want}}; });
  const W0 = await page.evaluate(async () => { H3.S.f.smFin = false; const t = H3.S.takes.find(x => x.id==='tA'); Object.assign(t, {loopTake:null, loopTried:0}); await H3.wildLoopGo(t); const n = H3.S.takes.find(x => x.id===t.loopTake); return n && {k4:n.k4want || null, fin:H3.finOf(n)}; });
  ok(W0 && !W0.k4 && !W0.fin, '📺 with 4K off, a wildcard loop gets no 4K 60 finish: ' + JSON.stringify(W0));
  ok(W.r && W.n && W.n.combo && W.n.raw && W.n.loopOf==='tA' && !W.n.up, '🎲 a wildcard loop with 🪄 Smooth the loop off is made the same way, from the stretch that loops best: ' + JSON.stringify(W));
  const W2 = await page.evaluate(async () => { const t = H3.S.takes.find(x => x.id==='tA'); Object.assign(t, {wildUp:1, loopTake:null, loopTried:0}); await H3.wildLoopGo(t); const n = H3.S.takes.find(x => x.id===t.loopTake); return n && n.up; });
  ok(W2 && W2.str===0 && W2.rep==='medium', '⬆ Upscale on too: the joined loop is ⬆ regenerated after (medium, no LoRA): ' + JSON.stringify(W2));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
