// 🎯 Nudge toward a character: a same-size pass (no upscaler) with only the picked people's pictures and their chips, no pose picture
// (the pose's words stay), at the strength picked. (fake ComfyUI, nothing renders)
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_nudge.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8041);
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
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8041/index.html');
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
  const open = () => fr.evaluate(async () => { const f = FILM.S.films[0], tr = f.tracks[0]; FILM.nudgeSheet(f, tr, tr.clips[0]); await new Promise(z => setTimeout(z, 150));
    return {txt:document.querySelector('#sheetCard').textContent, on:[...document.querySelectorAll('#nuWho .pri')].map(b => b.textContent), tags:[...document.querySelectorAll('#nuTags [data-tag]')].map(b => b.textContent)}; });
  let O = await open(); if(process.env.SHOT) await page.screenshot({path:process.env.SHOT});
  ok(O.on.join()==='Laura' && /Nudge toward a character/.test(O.txt), 'the sheet opens with the person the clip names picked: ' + O.on);
  ok(O.tags.includes('red hair') && O.tags.includes('green eyes') && O.tags.includes('✨ spiral eyes') && !O.tags.some(x => /Kneel/.test(x)), 'her details and attribute are chips (no pose chip): ' + O.tags);
  const nudges = () => page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp && x.up && x.up.only).map(t => ({id:t.id, up:t.up, prompt:t.prompt, descOff:t.descOff, model:t.model})));
  const graph = id => page.evaluate(([R, id]) => { const t = H3.S.takes.find(x => x.id===id), names = {}; ['p1', 'p2', 'q1', 'q2', 'q3', 'k1', 'a1'].forEach(k => names[k] = k + '.png');
    const g = Object.values(H3.upGraph(t, H3.PC[R].oi, names).g), C = c => g.filter(n => n.class_type===c), rv = C('MiniMaxH3ReferenceToVideo')[0];
    return {up:C('MinimaxH3LatentUpscaler3D').length, imgs:C('LoadImage').map(n => n.inputs.image).sort(), w:rv && rv.inputs.width, h:rv && rv.inputs.height, p:rv ? rv.inputs.prompt : '', sig:C('ManualSigmas').map(n => n.inputs.sigmas), fit:C('MMH3FitReferences').length, ks:C('SamplerCustomAdvanced').length, seeds:C('RandomNoise').map(n => n.inputs.noise_seed), dec:C('VAEDecodeTiled').length, unet:C('UNETLoader').map(n => n.inputs.unet_name), lora:C('LoraLoaderModelOnly').length}; }, [R, id]);
  // 1) toward Mia instead: Laura off, Mia on, strength 0.5, vanilla
  await fr.evaluate(async () => { document.querySelector('#nuWho [data-n="1"]').click(); document.querySelector('#nuWho [data-n="2"]').click(); const r = document.querySelector('#nuDen'); r.value = '0.5'; r.dispatchEvent(new Event('input'));
    document.querySelector('#nuM').value = ''; document.querySelector('#nuGo').click(); await new Promise(z => setTimeout(z, 2500)); });
  let N = await nudges(); const A = N[0];
  ok(N.length===1 && A.up.only.join()==='2' && A.up.part && A.up.scale===1 && +A.up.den===0.5 && A.up.refs===true && +A.up.str===0, 'one same-size pass toward Mia at 0.5, regenerate LoRA off: ' + JSON.stringify(A && {only:A.up.only, part:!!A.up.part, scale:A.up.scale, den:A.up.den, str:A.up.str}));
  ok(/^<Subject 2> is in this shot\. <Subject 1> walks to the window/.test(A.up.prompt), 'Mia is put at the front of the words: ' + A.up.prompt);
  let G = await graph(A.id);
  ok(G.up===0 && G.w===640 && G.h===352, 'no latent upscaler, same size: ' + JSON.stringify({up:G.up, w:G.w, h:G.h}));
  ok(G.imgs.join()==='q1.png,q2.png,q3.png', 'only Mia\'s pictures go (no pose, no Laura): ' + G.imgs);
  ok(/kneel/i.test(G.p) && !/pose reference/i.test(G.p), 'the pose\'s words stay, its picture doesn\'t: ' + G.p);
  ok(G.sig.length===1 && /^0\.5/.test(G.sig[0]), 'sampling starts at the strength: ' + G.sig);
  ok(A.up.passes===3 && G.ks===3 && new Set(G.seeds).size===3 && G.dec===1, '3 passes by default: 3 samplers, 3 seeds, one decode: ' + JSON.stringify({p:A.up.passes, ks:G.ks, seeds:G.seeds, dec:G.dec}));
  // 2) toward Laura with "green eyes" off, on Pika (the first pass is set aside: one pass per track at a time)
  await fr.evaluate(() => { FILM.S.passes = []; });
  O = await open();
  await fr.evaluate(async () => { [...document.querySelectorAll('#nuTags [data-tag]')].find(b => b.textContent==='green eyes').click(); document.querySelector('#nuPs [data-v="1"]').click(); const o = [...document.querySelectorAll('#nuM option')].find(x => /pika/i.test(x.value)); if(o) document.querySelector('#nuM').value = o.value;
    document.querySelector('#nuGo').click(); await new Promise(z => setTimeout(z, 2500)); });
  N = await nudges(); const B = N.find(x => x.id!==A.id);
  ok(B && B.up.only.join()==='1' && JSON.stringify(B.descOff)==='{"1":["green eyes"]}' && /pika/i.test(B.up.unet), 'toward Laura on Pika, green eyes off for this pass: ' + JSON.stringify(B && {only:B.up.only, off:B.descOff, unet:B.up.unet}));
  G = await graph(B.id);
  ok(B.up.passes===1 && G.ks===1, 'one pass picked: one sampler: ' + G.ks);
  ok(G.imgs.join()==='a1.png,p1.png,p2.png' && G.up===0, 'Laura\'s pictures and her spiral-eyes picture, no pose picture: ' + G.imgs);
  ok(/red hair/i.test(G.p) && !/green eyes/.test(G.p) && /kneel/i.test(G.p), 'her words without green eyes, the pose\'s words kept: ' + G.p.slice(0, 600));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
