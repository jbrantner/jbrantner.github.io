// 🔁 Wildcards: Loop each clip makes a looping copy of a finished clip by itself, without touching the form.
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_wildloop.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8051);
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
  await page.goto('http://127.0.0.1:8051/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.click('[data-tab="wild"]'); await page.waitForTimeout(500);
  await page.click('[data-wt="loop"]');
  ok(await page.evaluate(() => H3.S.f.wildLoop===true && /looping copy of it by itself/.test(document.querySelector('#wildTab').textContent)), 'the 🔁 Loop switch is on');
  await page.evaluate(() => { H3.S.f.prompt = 'My wildcard words.'; document.querySelector('#prompt').value = H3.S.f.prompt; });
  await page.evaluate(([R, m]) => { const t = {id:'tW', t:Date.now(), pc:R, model:m, turbo:false, loras:[], w:640, h:352, seed:1, name:'h3_tW', dir:'H3Deck/h3_tW', film:'~wild', wildLoop:1, wild:{1:{a:[], drop:[], picks:[{cat:'💇 Hair', label:'Blue bob'}]}}, prompt:'The woman dances.', seconds:5, imgs:[], vids:[], auds:[], follow:[], lines:{},
      pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'The woman dances.', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_tW', type:'output'}}], state:'done', final:{filename:'h3_tW_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_tW', type:'output'}};
    H3.S.takes.unshift(t); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  const n0 = sent.length;
  await page.evaluate(() => H3.wildLoopTick());
  const r = await page.evaluate(() => { const t = H3.S.takes.find(x => x.loopOf==='tW'), s = H3.S.takes.find(x => x.id==='tW'); return t && {sm:t.sm && {loop:t.sm.loop, spc:t.sm.spc}, up:!!t.up, film:t.film, wild:!!t.wild, src:s.loopTake===t.id, form:H3.S.f.prompt, box:document.querySelector('#prompt').value, wl:H3.S.f.wildLoop, smForm:!!H3.S.f.sm}; });
  ok(r && r.sm && r.sm.loop > 0 && !r.up && r.film==='~wild' && r.src, 'a looping copy was made by itself (Smooth, loop on, no regenerate): ' + JSON.stringify(r));
  ok(r && r.sm && r.sm.spc, '📐 spacing is used for it');
  ok(r && r.form==='My wildcard words.' && r.box==='My wildcard words.' && r.wl && !r.smForm, 'your form is untouched');
  ok(sent.length > n0, 'it was sent to the PC (' + (sent.length - n0) + ' job)');
  { const g = sent[sent.length - 1].g, lv = Object.values(g).find(n => n.class_type==='LoadVideo'); ok(lv && /h3_tW_00001_\.mp4 \[output\]$/.test(lv.inputs.file), 'the PC reads its own finished file, no upload from the phone: ' + (lv && lv.inputs.file)); }
  await page.evaluate(() => H3.wildLoopTick());
  ok(await page.evaluate(() => H3.S.takes.filter(x => x.loopOf==='tW').length===1), 'only one loop per clip');
  ok(await page.evaluate(() => /looping copy of a wildcard clip/.test(document.body.textContent)), 'the loop take says what it is');
  // ⬆ Upscale too: the same pass also upscales
  await page.click('[data-wt="up"]');
  await page.evaluate(([R, m]) => { const s = H3.S.takes.find(x => x.id==='tW'), t = JSON.parse(JSON.stringify(s)); t.id = 'tU'; t.name = 'h3_tU'; delete t.loopTake; delete t.loopTried; t.wildUp = 1; H3.S.takes.unshift(t); }, [R, '']);
  await page.evaluate(() => H3.wildLoopTick());
  const u = await page.evaluate(() => { const t = H3.S.takes.find(x => x.loopOf==='tU'); return t && {loop:t.sm && t.sm.loop, up:t.up && t.up.scale, rep:t.up && t.up.rep, str:t.up && t.up.str}; });
  ok(u && u.rep==='medium' && u.str===0 && u.loop > 0 && u.up >= 1.5, 'loop + upscale in one pass: ' + JSON.stringify(u));
  // ⬆ only
  await page.evaluate(() => { const s = H3.S.takes.find(x => x.id==='tW'), t = JSON.parse(JSON.stringify(s)); t.id = 'tV'; t.name = 'h3_tV'; delete t.loopTake; delete t.loopTried; delete t.wildLoop; t.wildUp = 1; H3.S.takes.unshift(t); });
  await page.evaluate(() => H3.wildLoopTick());
  const v = await page.evaluate(() => { const t = H3.S.takes.find(x => x.loopOf==='tV'); return t && {loop:t.sm && t.sm.loop, up:t.up && t.up.scale}; });
  ok(v && !v.loop && v.up >= 1.5, 'upscale only: ' + JSON.stringify(v));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
