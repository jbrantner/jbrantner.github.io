// 🪄 Smooth a video: the app against a fake ComfyUI (requests answered in the browser, nothing renders).
// Checks the MP4 reader (frame rate, sound), the form, and the graph sent to /prompt: the window is cut on the PC
// (LoadVideo → Video Slice → GetVideoComponents), every Nth frame goes through ImageFromBatch into its own
// MiniMaxH3AddGuide at the right frame, plus the last frame, and the sound when the clip has it.
// Input names are the ones in ComfyUI 0.41.3 (Render): comfy_extras/nodes_video.py, nodes_images.py, nodes_minimax_h3.py.
// Run: NODE_PATH=$(npm root -g) MEDIA=<folder with v24.mp4 (24 fps + sound), v30.mp4 (30 fps, no sound), v2997.mov, jump.webm> node tests/t_smooth.js
// jump.webm (a 6 px/frame pan with a 40 px jump at frame 60; VP9 so headless Chromium can decode it):
//   ffmpeg -f lavfi -i testsrc2=size=1920x480:rate=1 -frames:v 1 big.png
//   ffmpeg -loop 1 -framerate 24 -i big.png -vf "crop=864:480:x='if(lt(n\,60)\,n*6\,n*6+40)':y=0,format=yuv420p" -frames:v 150 -c:v libvpx-vp9 -b:v 2M jump.webm
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const MEDIA = process.env.MEDIA, PC = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = { // just what the app reads
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  'Video Slice':{input:{required:{video:['VIDEO'], start_time:['FLOAT', {default:0}], duration:['FLOAT', {default:0}], strict_duration:['BOOLEAN', {default:false}]}}},
  GetVideoComponents:{input:{required:{video:['VIDEO']}}},
  ImageFromBatch:{input:{required:{image:['IMAGE'], batch_index:['INT', {default:0}], length:['INT', {default:1}]}}},
  MiniMaxH3AddGuide:{input:{required:{positive:['CONDITIONING'], latent:['LATENT'], frame_idx:['INT', {default:0}]}, optional:{vae:['VAE'], audio_vae:['VAE'], image:['IMAGE'], audio:['AUDIO']}}},
};
// SeedVR2 (numz seedvr2_videoupscaler on Render): src/interfaces/*.py
Object.assign(SCHEMA, {
  SeedVR2LoadDiTModel:{input:{required:{model:[['seedvr2_ema_3b-Q4_K_M.gguf', 'seedvr2_ema_3b_fp8_e4m3fn.safetensors', 'seedvr2_ema_7b_fp16.safetensors']], device:[['cuda:0', 'cpu']]}, optional:{blocks_to_swap:['INT'], swap_io_components:['BOOLEAN'], offload_device:[['none', 'cpu', 'cuda:0']], cache_model:['BOOLEAN'], attention_mode:[['sdpa']], torch_compile_args:['TORCH_COMPILE_ARGS']}}},
  SeedVR2LoadVAEModel:{input:{required:{model:[['ema_vae_fp16.safetensors']], device:[['cuda:0', 'cpu']]}, optional:{encode_tiled:['BOOLEAN'], encode_tile_size:['INT'], encode_tile_overlap:['INT'], decode_tiled:['BOOLEAN'], decode_tile_size:['INT'], decode_tile_overlap:['INT'], tile_debug:[['false', 'encode', 'decode']], offload_device:[['none', 'cpu']], cache_model:['BOOLEAN']}}},
  SeedVR2VideoUpscaler:{input:{required:{image:['IMAGE'], dit:['SEEDVR2_DIT'], vae:['SEEDVR2_VAE'], seed:['INT', {default:42}], resolution:['INT', {default:1080}], max_resolution:['INT', {default:0}], batch_size:['INT', {default:5}], uniform_batch_size:['BOOLEAN', {default:false}], color_correction:[['lab', 'wavelet', 'none']], input_noise_scale:['FLOAT', {default:0}], latent_noise_scale:['FLOAT', {default:0}], offload_device:[['none', 'cpu']], enable_debug:['BOOLEAN', {default:false}]}, optional:{temporal_overlap:['INT'], prepend_frames:['INT']}}},
});
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContext','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MMH3FitReferences',
  'LoadImage','LoadVideo','LoadAudio','TrimAudioDuration','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo'];
const ALLOWED = {SeedVR2LoadDiTModel:['model','device','blocks_to_swap','swap_io_components','offload_device','cache_model','attention_mode','torch_compile_args'],
  SeedVR2LoadVAEModel:['model','device','encode_tiled','encode_tile_size','encode_tile_overlap','decode_tiled','decode_tile_size','decode_tile_overlap','tile_debug','offload_device','cache_model','torch_compile_args'],
  SeedVR2VideoUpscaler:['image','dit','vae','seed','resolution','max_resolution','batch_size','uniform_batch_size','temporal_overlap','prepend_frames','color_correction','input_noise_scale','latent_noise_scale','offload_device','enable_debug'],
  GetVideoComponents2:[], 'Video Slice':['video','start_time','duration','strict_duration'], GetVideoComponents:['video'], ImageFromBatch:['image','batch_index','length'],
  MiniMaxH3AddGuide:['positive','vae','audio_vae','latent','image','audio','frame_idx'], LoadVideo:['file']};

(async () => {
  // the app, served locally
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8011);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], uploads = [], frees = [], HIST = {};
  await page.route(PC + '/**', async (rt) => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[{vram_free:7e9, vram_total:8.5e9}]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/upload/image'){ uploads.push(1); return J({name:'h3deck_x.mp4', subfolder:'h3deck', type:'input'}); }
    if(p==='/prompt'){ sent.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'p' + sent.length}); }
    if(p==='/free'){ frees.push(JSON.parse(rt.request().postData())); return J({}); }
    if(p.startsWith('/history/')){ const id = p.slice(9); return J(HIST[id] ? {[id]:HIST[id]} : {}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(pc => { localStorage.clear(); window.H3_PCS = [{name:'Render', url:pc, on:true, speed:1}]; }, PC);
  await page.goto('http://127.0.0.1:8011/index.html');
  await page.waitForFunction(() => document.querySelectorAll('#model option').length >= 1 && /DaSiWa/.test(document.querySelector('#model').textContent), null, {timeout:20000});

  // ---- the MP4 reader ----
  for(const [f, fps, snd] of [['v24.mp4', 24, true], ['v30.mp4', 30, false], ['v2997.mov', 29.97, false]]){
    const info = await page.evaluate(async b64 => { const b = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))]); return H3.mp4Info(b); }, fs.readFileSync(path.join(MEDIA, f)).toString('base64'));
    ok(info.fps===fps && info.sound===snd, f + ' reads as ' + JSON.stringify(info));
  }
  ok(JSON.stringify(await page.evaluate(() => H3.smoothKeys(124, 4).slice(-3))) === '[116,120,123]' && await page.evaluate(() => H3.smoothKeys(124, 4).length)===32, '124 frames: 0,4,…,120 and the last (123) = 32 keyframes');

  // ---- the form ----
  await page.click('#smSw');
  await page.evaluate(() => { H3.S.f.smSpc = false; }); // the plain grid first; 📐 spacing is checked at the end
  ok(await page.isHidden('#flSw') && await page.isHidden('#refSw'), 'smoothing hides first/last frame and references');
  ok(/Pick the video/.test(await page.textContent('#goWhy')), 'asks for the video first: ' + await page.textContent('#goWhy'));
  const pick = async file => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-add="smv"]')]); await fc.setFiles(path.join(MEDIA, file)); await page.waitForTimeout(1500); };
  await pick('v24.mp4');
  // headless Chromium can't play H.264, so the length the phone would read is set here
  await page.evaluate(() => { const m = H3.S.media[H3.S.f.smVid]; m.dur = 8; m.w = 864; m.h = 480; });
  await page.evaluate(() => { H3.S.f.smStart = 1.5; });
  await page.click('#smEverySeg [data-v="4"]');
  const note = await page.textContent('#smNote'); console.log('note:', note);
  ok(/32 of them are your own frames/.test(note) && /other 92/.test(note), 'note counts pinned and painted frames');
  ok(!(await page.isDisabled('#goBtn')), 'Render is ready without a prompt');
  await page.click('#goBtn'); await page.waitForTimeout(1500);
  ok(sent.length===1 && uploads.length===1, 'one upload, one graph');
  const g = sent[0], nodes = Object.values(g), by = c => nodes.filter(n => n.class_type===c);
  const guides = by('MiniMaxH3AddGuide'), img = guides.filter(n => n.inputs.image), aud = guides.filter(n => n.inputs.audio);
  ok(img.length===32 && JSON.stringify(img.map(n => n.inputs.frame_idx).slice(0, 4))==='[0,4,8,12]' && img[31].inputs.frame_idx===123, '32 picture keyframes at 0,4,8…,123');
  ok(img.every(n => { const fb = g[n.inputs.image[0]]; return fb.class_type==='ImageFromBatch' && fb.inputs.batch_index===n.inputs.frame_idx && fb.inputs.length===1; }), 'each keyframe is that frame of the window (24 fps: same index)');
  ok(aud.length===1 && aud[0].inputs.frame_idx===0 && g[aud[0].inputs.audio[0]].class_type==='GetVideoComponents' && aud[0].inputs.audio[1]===1, 'the clip\'s sound is pinned from frame 0');
  const sl = by('Video Slice')[0]; ok(sl && sl.inputs.start_time===1.5 && Math.abs(sl.inputs.duration - (124 / 24 + 2 / 24)) < 0.002 && sl.inputs.strict_duration===false, 'Video Slice cuts 1.5 s + 124 frames: ' + JSON.stringify(sl && sl.inputs));
  ok(by('MiniMaxH3ReferenceToVideo')[0].inputs.length===124, 'renders 124 frames');
  ok(!by('MMH3FitReferences').length && !by('LoadImage').length, 'no references or first/last frame');
  const bad = nodes.filter(n => ALLOWED[n.class_type]).flatMap(n => Object.keys(n.inputs).filter(k => !ALLOWED[n.class_type].includes(k)).map(k => n.class_type + '.' + k));
  ok(!bad.length, 'every input name is one the real nodes have ' + bad.join(','));
  // the chain is one line: guide → guide → … → sampler
  const guider = by('BasicGuider')[0], last = g[guider.inputs.conditioning[0]]; ok(last.class_type==='MiniMaxH3AddGuide', 'the sampler sees every guide');
  ok(/smooth, steady/.test(by('MiniMaxH3ReferenceToVideo')[0].inputs.prompt), 'empty prompt → the default smoothing prompt');
  const card = await page.textContent('#takes'); ok(/🪄/.test(card) && !/Add more/.test(card), 'take card is marked 🪄, no ➕ Add more');

  // ---- a 30 fps clip without sound, every 2nd frame ----
  await page.click('[data-rm="smVid"]'); await pick('v30.mp4');
  await page.evaluate(() => { const m = H3.S.media[H3.S.f.smVid]; m.dur = 6; m.w = 480; m.h = 864; H3.S.f.smStart = 0; });
  await page.click('#smEverySeg [data-v="2"]');
  ok(await page.isHidden('#smSoundSw'), 'no sound switch for a silent clip');
  await page.click('#goBtn'); await page.waitForTimeout(1500);
  const g2 = sent[1], n2 = Object.values(g2), gd2 = n2.filter(n => n.class_type==='MiniMaxH3AddGuide');
  ok(gd2.length===63 && !gd2.some(n => n.inputs.audio), '63 keyframes (every 2nd of 124 + the last), no sound guide');
  const k10 = gd2.find(n => n.inputs.frame_idx===10); ok(g2[k10.inputs.image[0]].inputs.batch_index===13, '30 fps source: output frame 10 takes source frame 13 (nearest in time)');
  const rv = n2.find(n => n.class_type==='MiniMaxH3ReferenceToVideo'); ok(rv.inputs.height > rv.inputs.width, 'portrait clip → portrait canvas ' + rv.inputs.width + 'x' + rv.inputs.height);

  // ---- 📐 spacing: a pan of 6 px a frame with a 40 px jump between frames 59 and 60 (VP9, so headless Chromium can decode it) ----
  const plan = await page.evaluate(() => { const d = Array(123).fill(7); d[59] = 53; return H3.spacingPlan(d, 124, 4, 0.5); });
  console.log('plan keys', JSON.stringify(plan.keys), 'skipped', plan.skipped, 'jumps', plan.jumps);
  ok(plan.jumps.length===1 && plan.jumps[0]===59, 'the jump is found at frame 59→60');
  ok(plan.skipped.length >= 1 && plan.skipped.every(o => o >= 48 && o <= 72), 'slots inside the eased jump are left for MiniMax: ' + plan.skipped);
  ok(plan.keys.every(([o, s], i) => i===0 || (o > plan.keys[i - 1][0] && s >= plan.keys[i - 1][1])), 'pinned frames stay in order');
  ok(plan.keys.filter(([o, s]) => o < 36 || o > 84).every(([o, s]) => Math.abs(o - s) <= 1), 'far from the jump, frames stay (nearly) where they were');
  const still = await page.evaluate(() => H3.spacingPlan(Array(123).fill(0), 124, 4, 0.5));
  ok(still.skipped.length===0 && still.keys.every(([o, s]) => o===s), 'a still clip keeps the plain grid');
  const zero = await page.evaluate(() => { const d = Array(123).fill(7); d[59] = 53; return H3.spacingPlan(d, 124, 4, 0); });
  ok(zero.keys.every(([o, s]) => o===s) && zero.skipped.length===0, 'easing 0 = the plain grid');

  await page.click('[data-rm="smVid"]'); await page.evaluate(() => { H3.S.f.smSpc = true; H3.S.f.smEase = 0.5; H3.S.f.seconds = 5; });
  await page.click('#smEverySeg [data-v="4"]');
  await pick('jump.webm');
  await page.evaluate(() => { const m = H3.S.media[H3.S.f.smVid]; m.dur = m.dur || 6.25; m.fps = 24; m.w = 864; m.h = 480; H3.S.f.smStart = 0; });
  await page.evaluate(() => H3.S.f.smVid && document.querySelector('#smSpcSw') && window.dispatchEvent(new Event('resize')));
  await page.click('#smEverySeg [data-v="4"]');
  ok(/Measuring/.test(await page.textContent('#goWhy')) || await page.isDisabled('#goBtn'), 'Render waits while it measures');
  await page.waitForFunction(() => { const r = H3.SPC[H3.spcKey()]; return r && !r.busy; }, null, {timeout:60000});
  const R = await page.evaluate(() => H3.SPC[H3.spcKey()]);
  console.log('measured', R.err || '', JSON.stringify((R.d || []).slice(55, 64).map(x => Math.round(x))), 'points', R.pts, 'note:', await page.textContent('#smSpcNote'));
  ok(R.d && Math.abs(R.d[30] - 6.9) < 2.5 && R.d[59] > 4 * R.d[30], 'measured: ~7/1000 of the width a frame, and the jump at 59 (' + (R.d ? R.d[30].toFixed(1) + ' vs ' + R.d[59].toFixed(1) : R.err) + ')');
  ok(/1 jump/.test(await page.textContent('#smSpcNote')), 'note reports the jump');
  await page.screenshot({path:path.join(MEDIA, 'spacing.png'), clip:await (await page.$('#smBody')).boundingBox()});
  await page.click('#goBtn'); await page.waitForTimeout(1500);
  const g3 = sent[sent.length - 1], gd3 = Object.values(g3).filter(n => n.class_type==='MiniMaxH3AddGuide' && n.inputs.image);
  const pairs = gd3.map(n => [n.inputs.frame_idx, g3[n.inputs.image[0]].inputs.batch_index]);
  console.log('sent pairs', JSON.stringify(pairs));
  ok(pairs.length < 32 && pairs.some(([o, s]) => o!==s) && pairs[0][0]===0 && pairs[pairs.length - 1][0]===123, 'the graph pins the eased frames (some re-timed, some left out), first and last kept');

  // ---- ⬆ SeedVR2 upscale after the smoothing ----
  ok(await page.evaluate(() => H3.S.f.smUp===true && H3.S.f.smUpX===2), '⬆ Then upscale is on by default at 2×');
  console.log('up note:', await page.textContent('#smUpNote'));
  ok(/864×480 → 1728×960/.test(await page.textContent('#smUpNote')), 'note shows the size after upscaling');
  const t0 = await page.evaluate(() => { const t = H3.S.takes[0]; return {id:t.id, up:t.up, pid:t.pieces[0].pid, save:t.pieces[0].save, dir:t.dir}; });
  ok(t0.up && t0.up.scale===2, 'the take carries ⬆ 2×');
  // the smoothing finishes on the PC
  HIST[t0.pid] = {status:{completed:true, status_str:'success'}, outputs:{[t0.save]:{images:[{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/' + t0.dir, type:'output'}]}}};
  const nSent = sent.length;
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(800); await page.evaluate(() => H3.tick()); await page.waitForTimeout(1200);
  ok(frees.length===1 && frees[0].unload_models===true, 'MiniMax is unloaded (/free) before the upscale');
  ok(sent.length===nSent + 1, 'one upscale job queued');
  const gu = sent[sent.length - 1], nu = Object.values(gu), up = nu.find(n => n.class_type==='SeedVR2VideoUpscaler');
  const dit = gu[up.inputs.dit[0]].inputs, vae = gu[up.inputs.vae[0]].inputs, lv = nu.find(n => n.class_type==='LoadVideo');
  ok(dit.model==='seedvr2_ema_3b_fp8_e4m3fn.safetensors' && dit.blocks_to_swap===16 && dit.offload_device==='cpu' && dit.device==='cuda:0', 'DiT: 3B fp8, 16 blocks swapped to the CPU ' + JSON.stringify(dit));
  ok(vae.encode_tiled && vae.decode_tiled && vae.encode_tile_size===512, 'VAE tiled at 512');
  ok(up.inputs.resolution===960 && up.inputs.batch_size===5 && up.inputs.color_correction==='lab', '2× of 480 = 960 short edge, batches of 5, LAB colours');
  ok(lv.inputs.file==='Output_Render/' + t0.dir + '/piece_01_00001_.mp4 [output]', 'it reads the smoothed clip from the output folder: ' + lv.inputs.file);
  const cvn = nu.find(n => n.class_type==='CreateVideo'); ok(gu[cvn.inputs.images[0]].class_type==='SeedVR2VideoUpscaler' && gu[cvn.inputs.audio[0]].class_type==='GetVideoComponents', 'video from SeedVR2, sound from the smoothed clip');
  const bad2 = nu.filter(n => ALLOWED[n.class_type]).flatMap(n => Object.keys(n.inputs).filter(k => !ALLOWED[n.class_type].includes(k)).map(k => n.class_type + '.' + k));
  ok(!bad2.length, 'SeedVR2 input names match the node source ' + bad2.join(','));
  ok(/Upscaling to 1728×960/.test(await page.textContent('#takes')), 'the card says it is upscaling');
  const upPid = await page.evaluate(() => H3.S.takes[0].upPid), upSave = await page.evaluate(() => H3.S.takes[0].upSave);
  HIST[upPid] = {status:{completed:true, status_str:'success'}, outputs:{[upSave]:{images:[{filename:'x_up_00001_.mp4', subfolder:'Output_Render/' + t0.dir, type:'output'}]}}};
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(1200);
  const fin = await page.evaluate(() => { const t = H3.S.takes[0]; return {state:t.state, final:t.final.filename, smoothed:t.smoothed.filename}; });
  ok(fin.state==='done' && fin.final==='x_up_00001_.mp4' && fin.smoothed==='piece_01_00001_.mp4', 'done: the upscaled clip is the final one, the smoothed one is kept');
  ok(/upscaled to 1728×960/.test(await page.textContent('#takes')), 'card: Done · upscaled');

  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
