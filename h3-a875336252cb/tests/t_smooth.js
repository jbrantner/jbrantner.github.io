// 🪄 Smooth a video: the app against a fake ComfyUI (requests answered in the browser, nothing renders).
// Checks the MP4 reader (frame rate, sound), the form, and the graph sent to /prompt: the window is cut on the PC
// (LoadVideo → Video Slice → GetVideoComponents), every Nth frame goes through ImageFromBatch into its own
// MiniMaxH3AddGuide at the right frame, plus the last frame, and the sound when the clip has it.
// Input names are the ones in ComfyUI 0.41.3 (Render): comfy_extras/nodes_video.py, nodes_images.py, nodes_minimax_h3.py.
// Run: NODE_PATH=$(npm root -g) MEDIA=<folder with v24.mp4 (24 fps + sound), v30.mp4 (30 fps, no sound), v2997.mov> node tests/t_smooth.js
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
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContext','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MMH3FitReferences',
  'LoadImage','LoadVideo','LoadAudio','TrimAudioDuration','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo'];
const ALLOWED = {'Video Slice':['video','start_time','duration','strict_duration'], GetVideoComponents:['video'], ImageFromBatch:['image','batch_index','length'],
  MiniMaxH3AddGuide:['positive','vae','audio_vae','latent','image','audio','frame_idx'], LoadVideo:['file']};

(async () => {
  // the app, served locally
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8011);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], uploads = [];
  await page.route(PC + '/**', async (rt) => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[{vram_free:7e9, vram_total:8.5e9}]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/upload/image'){ uploads.push(1); return J({name:'h3deck_x.mp4', subfolder:'h3deck', type:'input'}); }
    if(p==='/prompt'){ sent.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'p' + sent.length}); }
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

  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
