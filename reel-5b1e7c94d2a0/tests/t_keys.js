// 🔑 Reel Phase 2 (2026-11-25): the reel as one video with keyframes. Fake PCs. Makes a 2-clip reel in Reel, opens 🔑 Phase 2, and checks
// the join, the first keyframes, hold-and-drag retiming, the sliding strip, mask painting, 🎯 Character focus, the keyframe img2img graph
// (Jordan's Render Deck recipe, zoomed to the mask), and 🎬 Redo the in-betweens (H3KeyPass: retimed reel + keyframes pinned) → a new reel.
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_keys.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs'), zlib = require('zlib');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
  CheckpointLoaderSimple:{input:{required:{ckpt_name:[['oneObsession_v24.safetensors', 'Illustrious\\BismuthIlMix_v8.safetensors']]}}},
  LoraLoader:{input:{required:{lora_name:[['afkj.safetensors', 'afk_style_condensed_v2_lora_f16.safetensors']]}}},
  UltralyticsDetectorProvider:{input:{required:{model_name:[['bbox/hand_yolov8s.pt', 'bbox/face_yolov8m.pt']]}}},
  SAMLoader:{input:{required:{model_name:[['sam_vit_b_01ec64.pth']]}}},
  LoadBackgroundRemovalModel:{input:{required:{bg_removal_name:[['birefnet.safetensors']]}}},
};
const OTHER = ['ColorMatch','ConditioningSetTimestepRange','ConditioningCombine','MiniMaxH3ReferenceToVideo','NAGGuiderMiniMaxH3','CLIPTextEncode','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'BboxDetectorSEGS','SplitSigmas','DisableNoise','SegsToCombinedMask','MaskToImage','PreviewImage','Video Slice','ImageFromBatch','TrimAudioDuration','VAEEncode','LTXVSeparateAVLatent','LTXVConcatAVLatent','ManualSigmas','RepeatImageBatch',
  'FaceDetailer','KSamplerAdvanced','VAEDecode','SaveImage','SetLatentNoiseMask','ImageToMask','RemoveBackground'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t);
// PNGs: a W×H grey picture, and a mask with a white box (x 40-60%, y 20-80%)
function png(W, H, f){ const rows = []; for(let y = 0; y < H; y++){ const r = Buffer.alloc(W * 3 + 1); for(let x = 0; x < W; x++){ const v = f(x, y); r[1 + x * 3] = r[2 + x * 3] = r[3 + x * 3] = v; } rows.push(r); }
  const crc = b => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for(const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const h = Buffer.alloc(13); h.writeUInt32BE(W, 0); h.writeUInt32BE(H, 4); h[8] = 8; h[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', h), ch('IDAT', zlib.deflateSync(Buffer.concat(rows))), ch('IEND', Buffer.alloc(0))]); }
const MASK = png(100, 60, (x, y) => x >= 40 && x < 60 && y >= 12 && y < 48 ? 255 : 0), OUT = png(1344, 768, () => 200);
const pngWH = b => { const i = b.indexOf('IHDR'); return i < 0 ? null : [b.readUInt32BE(i + 4), b.readUInt32BE(i + 8)]; };
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8043);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}, deviceScaleFactor:2}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], exps = [], ups = [], VID = fs.readFileSync(CLIP), done = {};
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = all[o] || {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:H, body:''}) : J({});
    if(p.startsWith('/renderdeck/h3run')) return J({});
    if(p==='/renderdeck/h3export'){ if(rt.request().method()==='POST'){ exps.push(JSON.parse(rt.request().postData())); return J({id:'ex1', state:'working'}); } return J({id:'ex1', state:'done', done:10, total:10, file:{filename:'reel_keys.webm', subfolder:'H3Film/reel', type:'output'}}); }
    if(p==='/view'){ const f = u.searchParams.get('filename') || ''; if(/mask/.test(f)) return rt.fulfill({status:200, contentType:'image/png', headers:H, body:MASK}); if(/\.png$/.test(f)) return rt.fulfill({status:200, contentType:'image/png', headers:H, body:OUT});
      return rt.fulfill({status:200, contentType:'video/webm', headers:H, body:VID}); }
    if(p==='/upload/image'){ const b = rt.request().postDataBuffer(); ups.push({wh:pngWH(b), name:(String(b).match(/filename="([^"]+)"/) || [])[1]}); return J({name:'up_' + ups.length + '.png', subfolder:'reelkeys', type:'input'}); }
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1), g = JSON.parse(rt.request().postData()).prompt; sent.push({pid, g}); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')){ const pid = p.slice(9), s = sent.find(x => x.pid===pid); if(!s || !done[pid]) return J({});
      const outs = {}; for(const [id, n] of Object.entries(s.g)) if(/SaveImage|PreviewImage/.test(n.class_type)) outs[id] = {images:[{filename:n.class_type==='PreviewImage' ? 'mask_' + pid + '.png' : 'key_' + pid + '.png', subfolder:'', type:n.class_type==='PreviewImage' ? 'temp' : 'output'}]};
      return J({[pid]:{status:{completed:true, status_str:'success'}, outputs:outs}}); }
    return rt.fulfill({status:404, headers:H, body:''}); };
  await page.route(R + '/**', fake);
  const PNGB = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true}, takes:[], lib:[{id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png'}}};
  await page.addInitScript(([deck, r]) => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(deck)); localStorage.setItem('render-deck-v1', JSON.stringify({styleText:{illustrious:{pos:'masterpiece, best quality, MYPOS'}}})); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, [DECK, R]);
  await page.goto('http://127.0.0.1:8043/reel-5b1e7c94d2a0/');
  await page.evaluate(async b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); await new Promise(res => { const q = indexedDB.open('h3deck', 1); q.onupgradeneeded = () => q.result.createObjectStore('media'); q.onsuccess = () => { const tx = q.result.transaction('media', 'readwrite'); tx.objectStore('media').put(new Blob([bin], {type:'image/png'}), 'mPic'); tx.oncomplete = res; }; q.onerror = res; }); }, PNGB).catch(() => {});
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:30000});
  await page.waitForTimeout(800);
  let eng = page.frames().find(f => /engine=1/.test(f.url()));
  const finish = async () => { await eng.evaluate(() => { H3.S.takes.forEach(t => { if(t.state!=='working') return; t.state = 'done'; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:t.name + '_p.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); t.final = {filename:t.name + '.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); H3.saveNow(); });
    await page.evaluate(() => REEL.refresh()); await page.waitForTimeout(1200); };
  // a 2-clip reel: New clip, then ➕ Next
  await page.evaluate(() => { REEL.R().cast = ['Lmia']; }); await page.click('[data-act="make"]'); await page.waitForTimeout(200);
  await page.fill('#mkW', 'Mia waves at the camera'); await page.click('#nSeg [data-n="1"]'); await page.click('#mkGo'); await page.waitForTimeout(2000); await finish();
  await page.click('#nextBtn'); await page.waitForTimeout(200); await page.fill('#nxW', 'Mia sits down'); await page.click('#nSeg [data-n="1"]'); await page.click('#nxGo'); await page.waitForTimeout(2000); await finish();
  ok(await page.evaluate(() => REEL.clips().length===2 && REEL.clips().every(c => REEL.info(c.pick).state==='done')), 'a 2-clip reel, both done');
  ok(await page.evaluate(() => !!document.querySelector('#p2Btn') && document.querySelector('#p2Btn').offsetParent !== null), '🔑 Phase 2 shows on the viewport');
  const reelId = await page.evaluate(() => REEL.R().id);
  // 🔑 Phase 2
  await Promise.all([page.waitForNavigation(), page.click('#p2Btn')]);
  ok(/keys\/\?reel=/.test(page.url()), 'Phase 2 opens on its own page for this reel (' + page.url() + ')');
  await page.waitForFunction(() => window.KEYS && KEYS.ready(), null, {timeout:40000}).catch(() => {});
  ok(await page.evaluate(() => KEYS.ready()), 'Phase 2 is ready (' + await page.evaluate(() => document.querySelector('#vmsg').textContent) + ')');
  eng = page.frames().find(f => /engine=1/.test(f.url()));
  ok(exps.length===1 && exps[0].clips.length===2 && exps[0].clips[1].at > 0, 'the two clips are joined into one video on the PC (' + JSON.stringify(exps.map(x => x.clips.length)) + ')');
  ok(await page.evaluate(() => KEYS.K().length===0 && document.querySelector('#finBtn').disabled), 'Phase 2 starts blank: no keyframes, nothing to redo yet');
  const dotAt = i => page.evaluate(i => { const r = document.querySelectorAll('#kds .kd')[i].getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; }, i);
  const sc = await page.evaluate(() => { const r = document.querySelector('#scrub').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + 20}; });
  // 🎡 the timeline turns under the needle: dragging it 64 px to the left = 1 s later
  await page.mouse.move(sc.x, sc.y); await page.mouse.down(); for(let k = 1; k <= 8; k++){ await page.mouse.move(sc.x - k * 8, sc.y); await page.waitForTimeout(120); } await page.mouse.up(); await page.waitForTimeout(150);
  const n1 = await page.evaluate(() => ({now:KEYS.P() && +document.querySelector('#tNow').textContent.replace(' s', ''), x0:KEYS.xOf(0)}));
  ok(Math.abs(n1.now - 1) < 0.15 && n1.x0 < 195 - 50, 'dragging the timeline turns it like a wheel under the needle (' + JSON.stringify(n1) + ')');
  // four keyframes with ＋
  for(const t of [0.5, 1.5, 2.5, 3.5]){ await page.evaluate(t => KEYS.setNow(t, true), t); await page.click('#addKey'); await page.waitForTimeout(80); }
  ok(await page.evaluate(() => KEYS.K().map(k => k.s).join()==='0.5,1.5,2.5,3.5'), '＋ Keyframe adds one at the needle');
  if(process.env.SHOT) await page.screenshot({path:process.env.SHOT, fullPage:true});
  // 🔗 hold the first dot and drag a line past the fourth: one chunk, two breakdowns
  await page.evaluate(() => KEYS.setNow(2)); await page.waitForTimeout(100);
  { const a = await dotAt(0), b = await dotAt(3); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(450);
    for(let k = 1; k <= 10; k++){ await page.mouse.move(a.x + (b.x + 6 - a.x) * k / 10, a.y); await page.waitForTimeout(20); } await page.mouse.up(); await page.waitForTimeout(150); }
  const ch = await page.evaluate(() => ({c:KEYS.chunks().map(c => [c[0], c[1]]), roles:KEYS.K().map((k, i) => KEYS.roleOf(i)), fin:document.querySelector('#finBtn').textContent, bar:!!document.querySelector('#segs .ln')}));
  ok(JSON.stringify(ch.c)==='[[0,3]]' && ch.roles.join()==='start,mid,mid,end' && ch.bar && /1 chunk/.test(ch.fin), 'hold a keyframe and drag a line: keyframes 1–4 become one chunk with 2 breakdowns (' + JSON.stringify(ch) + ')');
  // ⏱ the needle on a breakdown: drag its dot to retime it (no hold)
  await page.evaluate(() => KEYS.setNow(KEYS.K()[1].t)); await page.waitForTimeout(100);
  { const d = await dotAt(1); await page.mouse.move(d.x, d.y); await page.mouse.down(); for(let k = 1; k <= 4; k++){ await page.mouse.move(d.x + k * 8, d.y); await page.waitForTimeout(20); } await page.mouse.up(); await page.waitForTimeout(150); }
  const k1 = await page.evaluate(() => { const k = KEYS.K(); return {s:k[1].s, t:k[1].t, after:k.map(x => x.t), end:KEYS.endT(), slow:!!document.querySelector('#segs .seg.slow'), fast:!!document.querySelector('#segs .seg.fast')}; });
  ok(Math.abs(k1.t - k1.s - 0.5) < 0.05 && k1.slow && k1.fast && Math.abs(k1.end - 4.9583) < 0.01, 'dragging the breakdown under the needle retimes it: same frame, later; before it plays slower, after faster; the reel\'s length stays (' + JSON.stringify(k1) + ')');
  // the chunk's end takes the rest of the reel along
  await page.evaluate(() => KEYS.setNow(KEYS.K()[3].t)); await page.waitForTimeout(100);
  { const d = await dotAt(3); await page.mouse.move(d.x, d.y); await page.mouse.down(); for(let k = 1; k <= 4; k++){ await page.mouse.move(d.x + k * 8, d.y); await page.waitForTimeout(20); } await page.mouse.up(); await page.waitForTimeout(150); }
  const k3 = await page.evaluate(() => { const k = KEYS.K(); return {t:k[3].t, s:k[3].s, end:KEYS.endT(), tail:KEYS.srcAt(k[3].t + 1) - k[3].s}; });
  ok(Math.abs(k3.t - k3.s - 0.5) < 0.05 && Math.abs(k3.end - 4.9583 - 0.5) < 0.05 && Math.abs(k3.tail - 1) < 0.01, 'moving the chunk\'s end makes it longer and the rest of the reel moves along at its own pace (' + JSON.stringify(k3) + ')');
  // a dot that isn't under the needle: dragging it turns the timeline instead
  { const t0 = await page.evaluate(() => KEYS.K()[0].t), d = await dotAt(0); await page.mouse.move(d.x, d.y); await page.mouse.down(); for(let k = 1; k <= 4; k++){ await page.mouse.move(d.x + k * 10, d.y); await page.waitForTimeout(16); } await page.mouse.up();
    ok(await page.evaluate(t => KEYS.K()[0].t===t, t0), 'dragging a dot away from the needle turns the timeline, it doesn\'t move the dot'); }
  // 🔗 a line longer than 5 s doesn't take in keyframes past 5 s
  ok(await page.evaluate(() => { const ks = KEYS.K(); return ks[3].t - ks[0].t <= 5; }), 'a chunk stays within 5 s');
  // the strip: halfway between keyframe 1 and 2, both show side by side
  await page.evaluate(() => { const k = KEYS.K(); KEYS.setNow((k[0].t + k[1].t) / 2); }); await page.waitForTimeout(100);
  const sp = await page.evaluate(() => ({pos:KEYS.stripPos(), tr:[...document.querySelectorAll('#strip .kc')].slice(0, 2).map(e => e.style.transform)}));
  ok(Math.abs(sp.pos - 0.5) < 0.01, 'halfway between two keyframes the strip is halfway through sliding the next one in (' + JSON.stringify(sp) + ')');
  await page.evaluate(() => { const k = KEYS.K(); KEYS.setNow(k[0].t + (k[1].t - k[0].t) * 0.1); }); await page.waitForTimeout(100);
  ok(await page.evaluate(() => KEYS.stripPos() < 0.05 && KEYS.near()===0), 'near a keyframe it settles on that one (eased)');
  // go to keyframe 2 and paint
  await page.evaluate(() => { KEYS.setNow(KEYS.K()[1].t, true); }); await page.waitForTimeout(300);
  ok(await page.evaluate(() => KEYS.near()===1 && /Keyframe 2/.test(document.querySelector('#ed').textContent)), 'the editor below is for the nearest keyframe');
  await page.waitForFunction(() => { const k = KEYS.K()[1]; return k.fm || k.fmErr; }, null, {timeout:15000}).catch(() => {});
  // the BiRefNet job is the fake's: let it finish
  const bgs = sent.filter(x => nodes(x.g, 'RemoveBackground').length); bgs.forEach(b => done[b.pid] = 1);
  ok(bgs.length===1, 'scrubbing past keyframes sends no cut-out jobs; only the keyframe the editor settles on gets one (' + bgs.length + ')');
  await page.waitForFunction(() => KEYS.K()[1].fm, null, {timeout:15000}).catch(() => {});
  const foc = await page.evaluate(() => ({fm:!!KEYS.K()[1].fm, err:KEYS.K()[1].fmErr, focus:KEYS.K()[1].focus}));
  const bg = sent.find(x => nodes(x.g, 'RemoveBackground').length);
  ok(foc.focus && foc.fm && bg && nodes(bg.g, 'LoadBackgroundRemovalModel')[0].inputs.bg_removal_name==='birefnet.safetensors', '🎯 Character focus is on by default and BiRefNet cuts the characters out on the PC (' + JSON.stringify(foc) + ')');
  await page.click('#toolSeg [data-v="paint"]');
  const st = await page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; });
  await page.mouse.move(st.x + st.w * 0.1, st.y + st.h * 0.2); await page.mouse.down(); await page.mouse.move(st.x + st.w * 0.2, st.y + st.h * 0.3, {steps:5}); await page.mouse.up(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => /^data:image\/png/.test(KEYS.K()[1].paint)), '🖌 painting adds to the mask (kept with the keyframe)');
  // 👤 save the words as a character, then bring them back on an empty keyframe
  await page.fill('#kw', '1girl, goth, pale skin, pink ring eyes'); await page.click('#chSave'); await page.fill('#chN', 'Mia'); await page.click('#chOk'); await page.waitForTimeout(100);
  const sv = await page.evaluate(() => ({c:KEYS.chars(), saved:JSON.parse(localStorage.getItem('illus_chars') || '[]').length, on:!!document.querySelector('#chRow [data-ch].on')}));
  ok(sv.c.length===1 && sv.c[0].name==='Mia' && sv.c[0].text==='1girl, goth, pale skin, pink ring eyes' && sv.saved===1 && sv.on, '💾 Save as a character keeps the words under a name, on the phone (' + JSON.stringify(sv) + ')');
  await page.fill('#kw', 'smile'); await page.click('#chRow [data-ch]'); await page.waitForTimeout(100);
  const w1 = await page.evaluate(() => KEYS.K()[1].words);
  await page.click('#chRow [data-ch]'); await page.waitForTimeout(100);
  const w2 = await page.evaluate(() => KEYS.K()[1].words);
  ok(w1==='1girl, goth, pale skin, pink ring eyes, smile' && w2==='smile', 'tapping 👤 Mia puts her description in front of the words, tapping again takes it out (' + JSON.stringify([w1, w2]) + ')');
  await page.click('#chEdit'); await page.click('#card [data-ce]'); await page.fill('#chT', '1girl, goth'); await page.click('#chOk'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => KEYS.chars()[0].text==='1girl, goth' && KEYS.chars()[0].name==='Mia'), '✎ edits a saved character');
  await page.fill('#kw', '');
  // ✨ Redraw: the recipe, zoomed to the mask
  const n0 = sent.length, u0 = ups.length; await page.click('#nSeg [data-v="1"]'); await page.click('#drawBtn'); await page.waitForTimeout(2500);
  const gi = sent.slice(n0).find(x => nodes(x.g, 'KSamplerAdvanced').length);
  ok(!!gi, 'a redraw is sent');
  if(gi){ const G = gi.g, ck = nodes(G, 'CheckpointLoaderSimple')[0], lo = nodes(G, 'LoraLoader')[0], ks = nodes(G, 'KSamplerAdvanced'), fd = nodes(G, 'FaceDetailer')[0], te = nodes(G, 'CLIPTextEncode');
    ok(ck && /BismuthIlMix_v8/.test(ck.inputs.ckpt_name) && lo && lo.inputs.lora_name==='afk_style_condensed_v2_lora_f16.safetensors' && lo.inputs.strength_model===1, 'BismuthIllMix v8 with afk_style_condensed_v2 at 1.0');
    ok(ks.length===2 && ks.every(k => k.inputs.cfg===5.5 && k.inputs.sampler_name==='euler_ancestral' && k.inputs.scheduler==='normal') && ks[0].inputs.steps===47 && ks[0].inputs.start_at_step===19 && ks[0].inputs.end_at_step===41 && ks[1].inputs.add_noise==='disable' && ks[1].inputs.start_at_step===41,
      '28 steps at 0.6 change, CFG 5.5, euler_ancestral normal, the last 6 steps as the finishing pass (' + JSON.stringify(ks.map(k => [k.inputs.steps, k.inputs.start_at_step, k.inputs.end_at_step])) + ')');
    ok(fd && fd.inputs.denoise===0.35 && fd.inputs.feather===32, 'Fix faces at 0.35 redraw, 32 blend');
    ok(nodes(G, 'SetLatentNoiseMask').length===1 && te.some(t => /MYPOS/.test(t.inputs.text)), 'only the mask is redrawn (latent noise mask), and her Render Deck Illustrious words are used');
    const up = ups.slice(u0); ok(up.length===2 && up.every(x => x.wh && x.wh[0]===1344 && x.wh[1]===768), 'the masked box is zoomed to fill her 1344×768 canvas (' + JSON.stringify(up) + ')');
    const box = await page.evaluate(() => KEYS.K()[1].tries[0].box); ok(box && box[2] < 832 * 0.9 && Math.abs(box[2] / box[3] - 832 / 480) < 0.03, 'the box is the mask\'s area plus a margin, in the reel\'s shape (' + JSON.stringify(box) + ')');
    done[gi.pid] = 1; }
  await page.evaluate(() => KEYS.follow()); await page.waitForFunction(() => KEYS.K()[1].pic, null, {timeout:15000}).catch(() => {});
  const kp = await page.evaluate(() => ({pic:KEYS.K()[1].pic, st:KEYS.K()[1].tries.map(y => y.state + (y.err || '')), dot:document.querySelectorAll('#kds .kd')[1].classList.contains('ed')}));
  ok(kp.pic && kp.dot, 'the redraw is put back into the keyframe and picked (' + JSON.stringify(kp) + ')');
  if(process.env.SHOT2) await page.screenshot({path:process.env.SHOT2, fullPage:true});
  // 🎬 Redo the in-betweens
  const plan = await page.evaluate(() => KEYS.stretches());
  const g0 = sent.length; await page.click('#finBtn'); await page.waitForTimeout(200); await page.click('#fGo');
  await page.waitForFunction(() => /\/reel-5b1e7c94d2a0\/$/.test(location.pathname), null, {timeout:30000}).catch(() => {});
  const hs = sent.slice(g0).filter(x => nodes(x.g, 'MiniMaxH3AddGuide').length);
  ok(plan.length===1 && hs.length===2, plan.length + ' chunk(s) × 2 options sent to MiniMax (' + hs.length + ')');
  if(hs[0]){ const G = hs[0].g, lv = nodes(G, 'LoadVideo'), gd = nodes(G, 'MiniMaxH3AddGuide').filter(n => n.inputs.image), last = nodes(G, 'ImageFromBatch').pop();
    const pins = plan[0][1] - plan[0][0] + 1;
    ok(lv.some(n => n.inputs.file==='H3Film/reel/reel_keys.webm [output]'), 'it starts from the joined reel');
    ok(gd.length===pins && gd[0].inputs.frame_idx===0, 'every keyframe in the stretch is pinned, the first at frame 0 (' + JSON.stringify(gd.map(n => n.inputs.frame_idx)) + ')');
    ok(nodes(G, 'VAEEncode').length===1 && nodes(G, 'BasicScheduler').some(n => Math.abs(n.inputs.denoise - 0.6) < 1e-6), 'the in-betweens change by 0.6 (Edit-style strength)');
    ok(nodes(G, 'RepeatImageBatch').length > 0 || nodes(G, 'ImageFromBatch').length > 3, 'the reel is retimed frame by frame for the slowed stretch');
    ok(last && last.inputs.batch_index===0 && last.inputs.length===Math.max(...gd.map(n => n.inputs.frame_idx)) + 1, 'only the frames up to the last keyframe are kept (' + JSON.stringify(last && last.inputs) + ')'); }
  const nr = await page.evaluate(id => { const S = JSON.parse(localStorage.getItem('h3reel')); const r = S.reels.find(x => x.keysOf===id); return r && {open:S.open===r.id, clips:r.clips.map(c => [c.takes.length, Math.round((c.in || 0) * 1000) / 1000, c.out == null ? null : Math.round(c.out * 1000) / 1000])}; }, reelId);
  ok(nr && nr.open && nr.clips.length===3 && nr.clips[0][0]===1 && nr.clips[0][2]===0.5 && nr.clips[1][0]===2 && nr.clips[1][1]===0 && nr.clips[2][0]===1 && Math.abs(nr.clips[2][1] - 3.542) < 0.002,
    'the result opens as a new reel in Phase 1: the reel before the chunk as it was, the chunk (2 options), the rest as it was (' + JSON.stringify(nr) + ')');
  // 🔁 Phase 2 of the keyframed reel opens with the last Phase 2's keyframes, at their shown times, chunk kept
  { const old = await page.evaluate(id => { const A = JSON.parse(localStorage.getItem('h3reel_keys'))[id]; return {t:A.keys.map(k => k.t), pics:A.keys.filter(k => k.pic).length, links:A.links.length}; }, reelId);
    const nid = await page.evaluate(id => JSON.parse(localStorage.getItem('h3reel')).reels.find(x => x.keysOf===id).id, reelId);
    await page.goto('http://127.0.0.1:8043/reel-5b1e7c94d2a0/keys/?reel=' + nid); await page.waitForFunction(() => window.KEYS, null, {timeout:15000}); await page.waitForTimeout(500);
    const nw = await page.evaluate(() => ({s:KEYS.K().map(k => k.s), t:KEYS.K().map(k => k.t), pics:KEYS.K().filter(k => k.pic).length, c:KEYS.chunks().map(c => [c[0], c[1]])}));
    ok(old.t.length===4 && JSON.stringify(nw.s)===JSON.stringify(old.t) && JSON.stringify(nw.t)===JSON.stringify(old.t) && nw.pics===old.pics && JSON.stringify(nw.c)==='[[0,3]]',
      '🔁 the keyframed reel\'s Phase 2 starts with the keyframes from before, redraws and chunk kept (' + JSON.stringify({old, nw}) + ')'); }
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
