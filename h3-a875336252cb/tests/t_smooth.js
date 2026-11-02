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
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'minimax_h3_open_regenerate_2k_r128_comfyui_bf16.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  'Video Slice':{input:{required:{video:['VIDEO'], start_time:['FLOAT', {default:0}], duration:['FLOAT', {default:0}], strict_duration:['BOOLEAN', {default:false}]}}},
  GetVideoComponents:{input:{required:{video:['VIDEO']}}},
  ImageFromBatch:{input:{required:{image:['IMAGE'], batch_index:['INT', {default:0}], length:['INT', {default:1}]}}},
  MiniMaxH3AddGuide:{input:{required:{positive:['CONDITIONING'], latent:['LATENT'], frame_idx:['INT', {default:0}]}, optional:{vae:['VAE'], audio_vae:['VAE'], image:['IMAGE'], audio:['AUDIO']}}},
};
// Open-H3 regenerate (object_info read from Render 2026-11-01)
Object.assign(SCHEMA, {
  MinimaxH3LatentUpscaler3D:{input:{required:{latent:['*'], model_name:['COMBO', {options:['minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors', 'minimax_h3_latent_upscaler_3d_fp32.pth']}], mode:['COMFY_DYNAMICCOMBO_V3', {options:[]}],
    align:['INT', {default:32}], enable_temporal_chunking:['BOOLEAN', {default:true}], force_unload:['BOOLEAN', {default:true}], device:['COMBO', {default:'cuda', options:['cuda','rocm','cpu']}], precision:['COMBO', {default:'fp16', options:['fp32','fp16','bf16']}]}}},
  ManualSigmas:{input:{required:{sigmas:['STRING', {default:'1, 0.5'}]}}},
  LTXVSeparateAVLatent:{input:{required:{av_latent:['LATENT']}}}, LTXVConcatAVLatent:{input:{required:{video_latent:['LATENT'], audio_latent:['LATENT']}}}, VAEEncode:{input:{required:{pixels:['IMAGE'], vae:['VAE']}}},
});
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContext','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MMH3FitReferences',
  'LoadImage','LoadVideo','LoadAudio','TrimAudioDuration','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo'];
const ALLOWED = {MinimaxH3LatentUpscaler3D:['latent','model_name','mode','mode.width','mode.height','align','enable_temporal_chunking','force_unload','device','precision'], ManualSigmas:['sigmas'],
  LTXVSeparateAVLatent:['av_latent'], LTXVConcatAVLatent:['video_latent','audio_latent'], VAEEncode:['pixels','vae'], MiniMaxH3ImageToVideo:['clip','vae','prompt','width','height','length','first_frame','last_frame'],
  GetVideoComponents2:[], 'Video Slice':['video','start_time','duration','strict_duration'], GetVideoComponents:['video'], ImageFromBatch:['image','batch_index','length'],
  MiniMaxH3AddGuide:['positive','vae','audio_vae','latent','image','audio','frame_idx'], LoadVideo:['file']};

(async () => {
  // the app, served locally
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8011);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], uploads = [], frees = [], HIST = {}, views = [];
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
    if(p==='/view'){ views.push(u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/mp4', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(path.join(MEDIA, 'v24.mp4'))}); }
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
  // ---- 🎬 Punch ----
  {
    const P = await page.evaluate(() => {
      const d = []; for(let i = 0; i < 60; i++){ const u = (i - 10) / 30; d.push(u > 0 && u < 1 ? 10 * Math.sin(Math.PI * u) : 0); }
      const sum = a => a.reduce((x, y) => x + y, 0), pk = a => a.indexOf(Math.max(...a));
      const r = {}; for(const p of [0, 0.5, 1]){ const t = H3.punchSpeeds(d, p); r[p] = {sum:sum(t), peak:pk(t), max:Math.max(...t), first5:sum(t.slice(11, 16)), last5:sum(t.slice(35, 40)), hold:sum(t.slice(0, 10))}; }
      // an on-4s clip of that move: every step lands on every 4th frame
      const d4 = []; let acc = 0; for(let i = 0; i < 123; i++){ acc += i < 120 ? d[Math.floor(i / 2)] / 2 : 0; if(i % 4===3){ d4.push(acc); acc = 0; } else d4.push(0); }
      const a = H3.spacingPlan(d4, 124, 4, 0.5, 0), b = H3.spacingPlan(d4, 124, 4, 0.5, 1);
      return {r, plain:a.keys.length, punchy:b.keys.length, diff:JSON.stringify(a.keys)!==JSON.stringify(b.keys), skipped:b.skipped.length};
    });
    console.log('punch', JSON.stringify(P));
    ok(Math.abs(P.r[1].sum - P.r[0].sum) < 0.01 && Math.abs(P.r[0.5].sum - P.r[0].sum) < 0.01, 'punch keeps the total distance');
    ok(P.r[1].peak > P.r[0].peak + 2 && P.r[1].max > P.r[0].max * 1.4, 'punch: the fastest frame comes later and faster (' + P.r[0].peak + '→' + P.r[1].peak + ')');
    ok(P.r[1].first5 < P.r[0].first5 * 0.4 && P.r[1].last5 < P.r[0].last5, 'punch: slower ease in, quicker stop');
    ok(P.diff && P.punchy >= 20, 'on-4s clip: punch re-times the pins (' + P.plain + ' vs ' + P.punchy + ' pinned, ' + P.skipped + ' left to paint)');
    ok(await page.isVisible('#smPunch') && (await page.textContent('#smPunchOut'))==='off', 'Punch slider shows, off by default');
    await page.$eval('#smPunch', e => { e.value = '0.6'; e.dispatchEvent(new Event('input')); });
    ok((await page.textContent('#smPunchOut'))==='0.60' && /punchy spacing/.test(await page.textContent('#smSpcNote')), 'slider → 0.60, chart says punchy');
    const k1 = await page.evaluate(() => H3.snapshot().sm); ok(k1.punch===0.6 && k1.keys, 'the take carries punch 0.6 and its re-timed pins');
    await page.screenshot({path:path.join(MEDIA, 'punch.png'), clip:await (await page.$('#smBody')).boundingBox()});
    await page.$eval('#smPunch', e => { e.value = '0'; e.dispatchEvent(new Event('input')); });
  }
  await page.screenshot({path:path.join(MEDIA, 'spacing.png'), clip:await (await page.$('#smBody')).boundingBox()});
  ok(await page.evaluate(() => H3.S.f.smUp===false && H3.S.f.smUpX===1.5 && H3.S.f.smUpRep==='medium' && H3.S.f.smUpStr===0.8), '⬆ Regenerate is off by default (1.5×, Medium, 0.8)');
  await page.click('#smUpSw'); await page.click('#smUpRep [data-v="light"]'); await page.$eval('#smUpStr', e => { e.value = '0.7'; e.dispatchEvent(new Event('input')); });
  console.log('up note:', await page.textContent('#smUpNote'));
  ok(/864×480 → 1344×736/.test(await page.textContent('#smUpNote')) || /864×480 → 1280×704/.test(await page.textContent('#smUpNote')) || /→ 1280×/.test(await page.textContent('#smUpNote')), 'note shows the regenerate size');
  await page.screenshot({path:path.join(MEDIA, 'regen-ui.png'), clip:await (await page.$('#smBody')).boundingBox()});
  await page.click('#goBtn'); await page.waitForTimeout(1500);
  const g3 = sent[sent.length - 1], gd3 = Object.values(g3).filter(n => n.class_type==='MiniMaxH3AddGuide' && n.inputs.image);
  const pairs = gd3.map(n => [n.inputs.frame_idx, g3[n.inputs.image[0]].inputs.batch_index]);
  console.log('sent pairs', JSON.stringify(pairs));
  ok(pairs.length < 32 && pairs.some(([o, s]) => o!==s) && pairs[0][0]===0 && pairs[pairs.length - 1][0]===123, 'the graph pins the eased frames (some re-timed, some left out), first and last kept');

  // ---- ⬆ regenerate after the smoothing ----
  const t0 = await page.evaluate(() => { const t = H3.S.takes[0]; return {id:t.id, up:t.up, pid:t.pieces[0].pid, save:t.pieces[0].save, dir:t.dir, size:H3.upSize(t), L:t.pieces[0].gen}; });
  ok(t0.up && t0.up.scale===1.5 && t0.up.rep==='light' && t0.up.str===0.7, 'the take carries ⬆ 1.5×, Light, 0.7 ' + JSON.stringify(t0.up));
  HIST[t0.pid] = {status:{completed:true, status_str:'success'}, outputs:{[t0.save]:{images:[{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/' + t0.dir, type:'output'}]}}};
  const nSent = sent.length;
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(800); await page.evaluate(() => H3.tick()); await page.waitForTimeout(1200);
  ok(frees.length===1 && frees[0].unload_models===true, 'MiniMax is unloaded (/free) before the regenerate');
  ok(sent.length===nSent + 1, 'one regenerate job queued');
  const gu = sent[sent.length - 1], nu = Object.values(gu), byC = c => nu.find(n => n.class_type===c);
  const lu = byC('MinimaxH3LatentUpscaler3D'), iv = byC('MiniMaxH3ImageToVideo'), lv = byC('LoadVideo'), ms = byC('ManualSigmas'), sca = byC('SamplerCustomAdvanced');
  const [W, Hh] = t0.size.split('×').map(Number);
  ok(lu && lu.inputs.mode==='target dimensions' && lu.inputs['mode.width']===W && lu.inputs['mode.height']===Hh && lu.inputs.precision==='bf16' && /3d_conv_v1_bf16/.test(lu.inputs.model_name), 'latent upscaler: target ' + t0.size + ' ' + JSON.stringify(lu && lu.inputs));
  ok(Math.min(W, Hh) <= 768 && W % 32===0 && Hh % 32===0, 'size stays inside 768p on a 32 grid: ' + t0.size);
  ok(gu[lu.inputs.latent[0]].class_type==='VAEEncode' && gu[gu[lu.inputs.latent[0]].inputs.pixels[0]].class_type==='GetVideoComponents', 'it encodes the smoothed clip');
  const lora = nu.find(n => n.class_type==='LoraLoaderModelOnly'), unet = gu[lora.inputs.model[0]];
  ok(/open_regenerate/.test(lora.inputs.lora_name) && lora.inputs.strength_model===0.7 && unet.inputs.unet_name==='minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'FL2VA int8 + regenerate LoRA at 0.7');
  ok(nu.filter(n => n.class_type==='LoraLoaderModelOnly').length===1, 'no turbo LoRA stacked on it');
  ok(iv.inputs.width===W && iv.inputs.height===Hh && iv.inputs.length===t0.L, 'conditioning at the new size, same length (' + iv.inputs.length + ')');
  ok(ms.inputs.sigmas==='0.7, 0.5, 0.25, 0.0' && byC('KSamplerSelect').inputs.sampler_name==='euler', 'Light = sigmas 0.7, 0.5, 0.25, 0, euler');
  const cat = gu[sca.inputs.latent_image[0]]; ok(cat.class_type==='LTXVConcatAVLatent' && gu[cat.inputs.video_latent[0]].class_type==='MinimaxH3LatentUpscaler3D' && gu[cat.inputs.audio_latent[0]].class_type==='LTXVSeparateAVLatent' && cat.inputs.audio_latent[1]===1, 'samples the enlarged video latent + an empty audio latent');
  ok(gu[gu[sca.inputs.guider[0]].inputs.conditioning[0]].class_type==='MiniMaxH3ImageToVideo', 'BasicGuider on the prompt (CFG 1)');
  ok(lv.inputs.file==='Output_Render/' + t0.dir + '/piece_01_00001_.mp4 [output]', 'it reads the smoothed clip from the output folder: ' + lv.inputs.file);
  const cvn = byC('CreateVideo'); ok(gu[cvn.inputs.images[0]].class_type==='VAEDecodeTiled' && gu[cvn.inputs.audio[0]].class_type==='GetVideoComponents', 'tiled decode, sound from the smoothed clip');
  const bad2 = nu.filter(n => ALLOWED[n.class_type]).flatMap(n => Object.keys(n.inputs).filter(k => !ALLOWED[n.class_type].includes(k)).map(k => n.class_type + '.' + k));
  ok(!bad2.length, 'input names match Render ' + bad2.join(','));
  ok(/Regenerating at /.test(await page.textContent('#takes')), 'the card says it is regenerating');
  const upPid = await page.evaluate(() => H3.S.takes[0].upPid), upSave = await page.evaluate(() => H3.S.takes[0].upSave);
  HIST[upPid] = {status:{completed:true, status_str:'success'}, outputs:{[upSave]:{images:[{filename:'x_up_00001_.mp4', subfolder:'Output_Render/' + t0.dir, type:'output'}]}}};
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(1200);
  const fin = await page.evaluate(() => { const t = H3.S.takes[0]; return {state:t.state, final:t.final.filename, smoothed:t.smoothed.filename}; });
  ok(fin.state==='done' && fin.final==='x_up_00001_.mp4' && fin.smoothed==='piece_01_00001_.mp4', 'done: the regenerated clip is the final one, the smoothed one is kept');
  ok(/regenerated at /.test(await page.textContent('#takes')), 'card: Done · regenerated');

  {
  // ---- ⬆ Regenerate on any finished take, with its reference pictures (a joined 2-piece take) ----
  const tid = await page.evaluate(() => { const o = H3.S.takes[0], t = JSON.parse(JSON.stringify(o)); t.id = 'tregen'; delete t.sm; t.up = null; t.upStage = null; t.upPid = null; t.smoothed = null;
    t.imgs = [{id:o.sm ? o.sm.vid : Object.keys(H3.S.media)[0]}]; t.prompt = '<Picture 1> walks to the door.';
    t.pieces = [{gen:73, deliv:73, state:'done', file:{filename:'p1.mp4', subfolder:'x', type:'output'}}, {gen:73, deliv:51, state:'done', file:{filename:'p2.mp4', subfolder:'x', type:'output'}}];
    t.final = {filename:'joined_00001_.mp4', subfolder:'Output_Render/H3Deck/j', type:'output'}; t.state = 'done'; H3.S.takes.unshift(t); return t.id; });
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(600);
  ok(await page.$('[data-act="regen"][data-t="tregen"]'), 'finished take has 🪄⬆ Smooth & regenerate');
  await page.evaluate(() => H3.regenSheet(H3.S.takes.find(x => x.id==='tregen'))); await page.waitForTimeout(300);
  ok(await page.isVisible('#rgGo') && await page.$('#rgRefs.on'), 'sheet opens with "Use its reference pictures" on');
  await page.screenshot({path:path.join(MEDIA, 'regen-sheet.png')});
  const nR = sent.length; await page.click('#rgGo'); await page.waitForTimeout(300);
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(1500);
  ok(sent.length===nR + 1, 'one regenerate job queued');
  const gr = sent[sent.length - 1], nr = Object.values(gr), byR = c => nr.find(n => n.class_type===c);
  const rv = byR('MiniMaxH3ReferenceToVideo'), un = byR('UNETLoader'), ifb = byR('ImageFromBatch');
  ok(rv && rv.inputs.prompt==='<Picture 1> walks to the door.' && rv.inputs['ref_images.ref_image_0'] && gr[rv.inputs['ref_images.ref_image_0'][0]].class_type==='LoadImage', 'Reference model conditioning with the take\'s picture and prompt');
  ok(un.inputs.unet_name==='minimax_h3_ref2va_pruned_int8_convrot.safetensors' && !byR('MiniMaxH3ImageToVideo'), 'Ref2VA model, not FL2VA');
  ok(ifb && ifb.inputs.length===107 && rv.inputs.length===107 && gr[byR('VAEEncode').inputs.pixels[0]].class_type==='ImageFromBatch', 'joined 124 frames cut to the 107 grid before encoding');
  ok(byR('LoadVideo').inputs.file==='Output_Render/H3Deck/j/joined_00001_.mp4 [output]', 'regenerates the joined clip');
  const tr = await page.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tregen'); return {sm:t.smoothed.filename, pid:t.upPid, save:t.upSave}; });
  HIST[tr.pid] = {status:{completed:true, status_str:'success'}, outputs:{[tr.save]:{images:[{filename:'j_up_00001_.mp4', subfolder:'Output_Render/H3Deck/j', type:'output'}]}}};
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(1000);
  const tf = await page.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tregen'); return {state:t.state, final:t.final.filename, src:t.smoothed.filename}; });
  ok(tf.state==='done' && tf.final==='j_up_00001_.mp4' && tf.src==='joined_00001_.mp4', 'done; the original is kept as the source for another go');

  }
  {
  // ---- 🪄⬆ Smooth & regenerate: the take goes into Smooth with its prompt, LoRAs, size and pictures ----
  const tid = await page.evaluate(() => { const o = H3.S.takes.find(x => x.id==='tregen'), t = JSON.parse(JSON.stringify(o)); t.id = 'tsend'; t.up = null; t.upStage = null; t.smoothed = null;
    t.final = {filename:'send_00001_.mp4', subfolder:'Output_Render/H3Deck/s', type:'output'}; t.loras = [{name:'minimax_h3_ref2v_turbo_4step.safetensors', str:0.6, words:'jdx'}];
    t.prompt = '<Picture 1> walks to the door.\n\n＋ She opens it.'; t.w = 512; t.h = 768; H3.S.takes.unshift(t);
    H3.S.f.sm = false; H3.S.f.smUp = false; H3.S.f.prompt = 'something else'; return t.id; });
  await page.evaluate(() => H3.tick()); await page.waitForTimeout(500);
  await page.click('[data-act="regen"][data-t="tsend"]'); await page.waitForTimeout(2000);
  ok(views.includes('send_00001_.mp4'), 'the take\'s video is fetched from the PC');
  const F = await page.evaluate(() => { const f = H3.S.f; return {sm:f.sm, vid:f.smVid, media:!!H3.S.media[f.smVid], up:f.smUp, refs:f.smRefs, upRefs:f.smUpRefs, prompt:f.prompt, loras:f.loras, mp:f.mp, ref0:H3.S.takes.find(x => x.id==='tsend').imgs[0].id}; });
  ok(F.sm && F.media && F.up && F.upRefs && F.refs.length===1 && F.refs[0]===F.ref0, 'Smooth is on with the video, ⬆ regenerate on, its picture carried ' + JSON.stringify(F.refs));
  ok(F.prompt==='<Picture 1> walks to the door. She opens it.' && F.loras.length===1 && F.loras[0].str===0.6 && Math.abs(F.mp - 0.39) < 0.01, 'prompt, LoRA and size carried over');
  ok(await page.isVisible('#smUpRefsBox') && await page.$('#smUpRefsSw.on'), 'the pictures show under ⬆ Then regenerate bigger');
  await page.screenshot({path:path.join(MEDIA, 'send-to-smooth.png'), clip:await (await page.$('#smBody')).boundingBox()});
  await page.evaluate(() => { const m = H3.S.media[H3.S.f.smVid]; m.dur = 3; m.w = 512; m.h = 768; H3.S.f.seconds = 3; H3.S.f.smSpc = false; });
  const snap = await page.evaluate(() => H3.snapshot());
  ok(snap.up && snap.up.refs && snap.upImgs.length===1 && snap.imgs.length===0 && snap.w===512 && snap.h===768, 'the take keeps the pictures for the regenerate only (smoothing unchanged), 512x768');
  const nS = sent.length; await page.evaluate(() => H3.drawAll && H3.drawAll()); await page.click('#goBtn'); await page.waitForTimeout(1500);
  ok(sent.length===nS + 1, 'smoothing job sent');
  const g1 = Object.values(sent[sent.length - 1]); ok(!g1.some(n => n.class_type==='LoadImage'), 'smoothing graph has no reference pictures');
  const s1 = await page.evaluate(() => { const t = H3.S.takes[0]; return {pid:t.pieces[0].pid, save:t.pieces[0].save, dir:t.dir}; });
  HIST[s1.pid] = {status:{completed:true, status_str:'success'}, outputs:{[s1.save]:{images:[{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/' + s1.dir, type:'output'}]}}};
  const nU = uploads.length; await page.evaluate(() => H3.tick()); await page.waitForTimeout(800); await page.evaluate(() => H3.tick()); await page.waitForTimeout(1500);
  ok(sent.length===nS + 2, 'then the regenerate is queued');
  const g2 = sent[sent.length - 1], n2b = Object.values(g2), rv2 = n2b.find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
  ok(rv2 && rv2.inputs['ref_images.ref_image_0'] && n2b.find(n => n.class_type==='UNETLoader').inputs.unet_name==='minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'regenerate uses Ref2VA with the carried picture');
  }
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
