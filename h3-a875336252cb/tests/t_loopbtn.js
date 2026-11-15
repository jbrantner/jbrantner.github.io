// 🔁 Make it loop as its own button (Jordan 2026-11-15): on a take card's ⋯ and in Films' clip tools, in bare bones too.
// It loads the take into 🪄 Smooth with loop on, regenerate off, 📐 spacing on. (fake ComfyUI, nothing renders)
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_loopbtn.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
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
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8047/index.html');
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
  await fr.waitForFunction(() => window.FILM && FILM.S && FILM.takeOf('tA')).catch(() => {});
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}], pps:24}; FILM.S.films.unshift(f); FILM.addClip(f, FILM.takeOf('tA'), 0); FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  // 1) Films clip tools: the button is there and visible in bare bones
  const vis = await fr.evaluate(() => { FILM.selectClip ? 0 : 0; const b = document.querySelector('.tools [data-act="loopClip"]'); return b ? {shown:getComputedStyle(b).display!=='none', bare:document.body.classList.contains('bare')} : null; });
  ok(vis && vis.shown, 'Films shows 🔁 Make it loop in the clip tools: ' + JSON.stringify(vis));
  const smVis = await fr.evaluate(() => { const b = document.querySelector('.tools [data-act="smoothClip"]'); return b && getComputedStyle(b).display!=='none'; });
  // 2) the take card's ⋯ has it, outside the hidden extras
  const card = await page.evaluate(() => { const b = document.querySelector('.take[data-take="tA"] [data-act="loop"]'); return b ? {xf:b.classList.contains('xf'), bare:document.body.classList.contains('bare')} : null; });
  ok(card && !card.xf, 'the take card has 🔁 Make it loop (not one of the hidden tools): ' + JSON.stringify(card));
  // 3) pressing it loads Smooth with loop on
  await page.evaluate(() => { H3.S.f.smUp = true; H3.S.f.smLoop = false; });
  await page.evaluate(() => window.H3LoopTake('tA')); await page.waitForTimeout(800);
  const F = await page.evaluate(() => { const f = H3.S.f; return {sm:f.sm, loop:f.smLoop, up:f.smUp, spc:f.smSpc, vid:!!f.smVid, sw:document.querySelector('#smLoopSw').classList.contains('on'), boxShown:getComputedStyle(document.querySelector('#bInputs')).display!=='none', more:document.querySelector('#smMore').open}; });
  ok(F.sm && F.loop && !F.up && F.spc && F.vid && F.sw && F.boxShown && F.more, 'Smooth is loaded with 🔁 loop on, regenerate off, the switch on screen: ' + JSON.stringify(F));
  // 3b) the Films button itself does the same
  await page.evaluate(() => { H3.S.f.smLoop = false; H3.S.f.smUp = true; });
  await fr.click('.clip').catch(() => {}); await page.waitForTimeout(300);
  const clicked = await fr.evaluate(async () => { const b = document.querySelector('.tools [data-act="loopClip"]'); if(!b || b.disabled) return false; b.click(); return true; });
  await page.waitForTimeout(800);
  const F2 = await page.evaluate(() => ({loop:H3.S.f.smLoop, up:H3.S.f.smUp}));
  ok(clicked && (F2.loop && !F2.up), 'tapping it in Films loads the loop (button ' + (clicked ? 'enabled' : 'needs a selected clip') + '): ' + JSON.stringify(F2));
  // 4) plain 🪄 Smooth & regenerate on a take that isn't a loop turns loop back off
  await page.evaluate(async () => { const t = H3.S.takes.find(x => x.id==='tA'); await window.H3SmoothTake('tA'); }); await page.waitForTimeout(600);
  const G2 = await page.evaluate(() => ({loop:H3.S.f.smLoop, up:H3.S.f.smUp}));
  ok(!G2.loop && G2.up, 'plain Smooth afterwards has loop off again: ' + JSON.stringify(G2));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
