// 🎭 Fix faces too, inside ⬆ Upscale this option and the 🎬 Final pass (2026-11-28): the face pass follows each ✨ result, and in the Final pass
// the next clip's ✨ pass waits for it and carries on from the face-fixed video, so the joins line up. Fake PCs.
// Run: CLIP=<a ~5 s video> FAPI_DIR=<npm pack @vladmandic/face-api@1.7.15, unpacked> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_upfaces.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'glow.safetensors', 'open_regenerate_h3_ref2va.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
  CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sam3.1_multiplex_fp16.safetensors']]}}},
};
const OTHER = ['ColorMatch','ConditioningSetTimestepRange','ConditioningCombine','MiniMaxH3ReferenceToVideo','NAGGuiderMiniMaxH3','CLIPTextEncode','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'BboxDetectorSEGS','UltralyticsDetectorProvider','SplitSigmas','DisableNoise','SegsToCombinedMask','MaskToImage','PreviewImage','Video Slice','ImageFromBatch','TrimAudioDuration','VAEEncode','LTXVSeparateAVLatent','LTXVConcatAVLatent','ManualSigmas','SAM3_Detect','SAM3_VideoTrack','SAM3_TrackToMask','SAM3_TrackPreview','GrowMask','GrowMaskWithBlur','ReverseImageBatch','BatchCropFromMask','BatchUncrop','RepeatImageBatch','ImageToMask','ImageBlur','ImageCompositeMasked','MiniMaxH3ImageToVideo'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8049);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}, deviceScaleFactor:2}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], faces = [];
  const MASK = (() => { const zlib = require('zlib'), W = 64, rows = []; for(let y = 0; y < W; y++){ const r = Buffer.alloc(W + 1); for(let x = 0; x < W; x++) r[x + 1] = (x >= 20 && x <= 35 && y >= 4 && y <= 19) ? 255 : 0; rows.push(r); }
    const crc = b => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for(const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const h = Buffer.alloc(13); h.writeUInt32BE(W, 0); h.writeUInt32BE(W, 4); h[8] = 8; h[9] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', h), ch('IDAT', zlib.deflateSync(Buffer.concat(rows))), ch('IEND', Buffer.alloc(0))]); })();
  const exps = [], fid = [], FAPI = path.join(process.env.FAPI_DIR || '', 'package');
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    // 🙂 the face finder: a 64x64 mask with the face box at x 20-35, y 4-19
    if(p==='/object_info/UltralyticsDetectorProvider') return J({UltralyticsDetectorProvider:{input:{required:{model_name:[['bbox/hand_yolov8s.pt', 'bbox/face_yolov8m.pt']]}}}});
    if(p==='/prompt' && /BboxDetectorSEGS/.test(rt.request().postData() || '')){ const g = JSON.parse(rt.request().postData()).prompt; faces.push(g); return J({prompt_id:'face' + faces.length}); }
    if(p.startsWith('/history/face')){ const id = p.slice(9); return J({[id]:{status:{completed:true, status_str:'success'}, outputs:{6:{images:[{filename:'m.png', subfolder:'', type:'temp'}]}}}}); }
    if(p==='/view' && u.searchParams.get('type')==='temp') return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:MASK});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')){ if(rt.request().method()!=='GET') sent.push({userdata:p}); return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({}); }
    if(p.startsWith('/renderdeck/h3run')){ sent.push({run:p}); return J({}); }
    if(p==='/renderdeck/h3export'){ if(rt.request().method()==='POST'){ exps.push(Object.assign(JSON.parse(rt.request().postData()), {_host:u.origin})); return J({id:'ex1', state:'working'}); } return J({id:'ex1', state:'done', done:10, total:10, file:{filename:'reel_ex1.mp4', subfolder:'H3Film/reel', type:'output'}}); }
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)});
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.png', subfolder:'h3deck', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')){ const id = p.slice(9), s = sent.find(x => x.pid===id);
      if(s && s.g && Object.values(s.g).some(n => n.class_type==='SAM3_TrackToMask') && !Object.values(s.g).some(n => /MiniMax/.test(n.class_type))){ const out = {}; Object.keys(s.g).filter(k => s.g[k].class_type==='PreviewImage').forEach(k => out[k] = {images:[{filename:'fid' + k + '.png', subfolder:'', type:'temp'}]}); fid.push(s.g); return J({[id]:{status:{completed:true, status_str:'success'}, outputs:out}}); } if(s && s.g && Object.values(s.g).some(n => n.class_type==='SAM3_TrackPreview')){ const pv = Object.keys(s.g).find(k => s.g[k].class_type==='SAM3_TrackPreview'); return J({[id]:{status:{completed:true, status_str:'success'}, outputs:{[pv]:{images:[{filename:'scan.webm', subfolder:'', type:'temp'}]}}}}); } return J({}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route('http://main.test/**', fake);
  // H3 Deck's own save: a Library character and its picture, one take of its own, the PCs
  const PNG = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true, qtext:'Soft film grain and gentle handheld sway.', negOn:true, neg:'blurry hands', h3Style:'A quiet indie film.'}, takes:[{id:'tDeck', t:1, state:'done', prompt:'H3 Deck take', pieces:[], imgs:[], vids:[], auds:[], follow:[]}],
    lib:[{id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}, {id:'Lpip', kind:'char', name:'Pip', stand:'cat girl', desc:'an anthro cat with orange fur', pics:['mPic'], keep:'exact', what:'', art:'3d'}, {id:'Lfrk', kind:'attr', name:'Freckles', stand:'', desc:'light freckles', pics:[], keep:'exact', what:''}, {id:'Lglow', kind:'lora', name:'Glow', stand:'', desc:'', pics:[], keep:'exact', what:'soft glow light', loras:[{name:'glow.safetensors', str:0.8}]}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png', w:180, h:180, thumb:'data:image/png;base64,' + PNG}, mOld:{id:'mOld', kind:'img', name:'old.png', type:'image/png'}}, up:{['mPic|' + R]:'h3deck/h3deck_mPic.png'}};
  await page.addInitScript(() => { if(/realfapi/.test(location.search)) return; const P = []; window.FAPI_CALLS = P; window.REEL_FAPI = {TinyFaceDetectorOptions:function(){}, detectSingleFace:src => ({withFaceLandmarks:() => ({withFaceDescriptor:async () => { P.push(src.tagName); return {descriptor:new Float32Array(128).fill(src.tagName==='CANVAS' ? 0.5 : 0.51)}; }})})}; });
  await page.addInitScript(([deck, r]) => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(deck)); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, [DECK, R]);
  // the picture in IndexedDB (shared by both apps)
  await page.goto('http://127.0.0.1:8049/reel-5b1e7c94d2a0/');
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:30000});
  await page.waitForTimeout(800);
  const eng = page.frames().find(f => /engine=1/.test(f.url()));
  ok(!!eng, 'H3 Deck runs hidden as the engine');
  const iso = await eng.evaluate(() => ({key:Object.keys(localStorage), deckTakes:H3.S.takes.length, lib:H3.S.lib.map(L => L.name), media:Object.keys(H3.S.media), tab:H3.S.tab, films:!!document.querySelector('#filmTab iframe')}));
  ok(iso.deckTakes===0 && iso.lib.join()==='Mia,Pip,Freckles,Glow' && iso.media.join()==='mPic' && iso.tab==='lib' && !iso.films, 'the engine has its own takes (none of H3 Deck\'s), H3 Deck\'s Library and only its pictures, and no Films frame (' + JSON.stringify(iso) + ')');
  ok(await page.evaluate(() => /Make your first clip/.test(document.querySelector('#vmsg').textContent)), 'an empty reel asks for the first clip');
  const finish = async () => { await eng.evaluate(() => { H3.S.takes.forEach(t => { if(t.state!=='working' && !(t.up && !t.final)) return; /* (the fake PC has no latent upscaler: a ✨ pass counts as done) */ t.state = 'done'; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:t.name + '_p.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); if(t.up){ t.upStage = 'done'; t.upErr = ''; } t.upPid = null; t.final = {filename:t.name + '.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); H3.saveNow(); });
    await page.evaluate(() => REEL.refresh()); await page.waitForTimeout(1200); };
  const tick = async () => { for(let k = 0; k < 2; k++){ await page.evaluate(() => REEL.ufxTick()); await page.waitForTimeout(1500); } }; // (find the faces, then match them and send the face pass)
  const T = () => eng.evaluate(() => H3.S.takes.map(t => ({id:t.id, state:t.state, scale:t.up ? t.up.scale : 0, faces:t.up && t.up.faces || null, zoom:t.up && t.up.zoom, den:t.up ? t.up.den : 0, src:t.redo ? t.redo.src : '', vid:t.up && t.up.chain && t.up.chain.vid ? t.up.chain.vid.f.filename : '', fin:t.final ? t.final.filename : ''})));
  await page.evaluate(() => { REEL.R().cast = ['Lmia']; });
  await page.click('[data-act="make"]'); await page.waitForTimeout(200); await page.fill('#mkW', 'Mia waves at the camera'); await page.click('#nSeg [data-n="1"]'); await page.click('#mkGo'); await page.waitForTimeout(2000); await finish();
  await page.evaluate(async () => { const c = REEL.clips()[0], x = await REEL.E().carry({take:c.pick, at:REEL.info(c.pick).secs, words:'Mia sits down', who:['Lmia'], secs:5, n:1}); const nc = REEL.addClip(1, {kind:'next', words:'Mia sits down', who:['Lmia']}); REEL.addTakes(nc, x.ids, {after:c.pick}, 'Mia sits down'); });
  await page.waitForTimeout(1500); await finish();
  ok(await page.evaluate(() => REEL.clips().length===2 && REEL.clips().every(c => REEL.info(c.pick).state==='done')), 'two finished clips, the second carrying on (not a new shot)');
  const p0 = await page.evaluate(() => REEL.clips().map(c => c.pick));
  // 🎬 Final pass with 🎭 Fix faces too
  await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(200);
  await page.click('#finBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('#fnFx') && document.querySelector('#fnFxB').hidden), '🎬 the Final pass sheet has a 🎭 Fix faces too switch (off)');
  await page.check('#fnFx'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => !document.querySelector('#fnFxB').hidden && /joins line up/.test(document.querySelector('#fnFxN').textContent) && document.querySelectorAll('#fnFxS button').length===3), 'turned on: strength chips and a note that it goes clip by clip');
  await page.click('#fnGo'); await page.waitForTimeout(2500);
  let t = await T(); let ups = t.filter(x => x.scale > 1);
  ok(ups.length===1 && ups[0].src===p0[0] && !ups[0].vid, 'only clip 1 is upscaled first (' + JSON.stringify(ups) + ')');
  await finish(); await tick(); t = await T();
  let fx = t.filter(x => x.faces);
  ok(fid.length===1 && fx.length===1 && fx[0].src===ups[0].id && fx[0].faces[0].obj===0 && fx[0].zoom===true && fx[0].den===0.45 && t.filter(x => x.scale > 1).length===1, "then the faces are found on clip 1's ✨ result, matched (Mia = face 0), and its face pass sent (zoomed, Light), and clip 2 still waits (" + JSON.stringify(fx) + ')');
  ok(await page.evaluate(id => REEL.clips()[0].pick===id && REEL.clips()[0].meta[id].faces && REEL.clips()[0].meta[id].fin, fx[0].id), "clip 1 picks the face-fixed upscale (marked ⬆ upscaled)");
  await finish(); await tick(); t = await T(); ups = t.filter(x => x.scale > 1);
  const u2 = ups.find(x => x.src===p0[1]), f1 = t.find(x => x.id===fx[0].id);
  ok(ups.length===2 && u2 && u2.vid===f1.fin, "clip 2's ✨ pass carries on from clip 1's face-fixed video (" + JSON.stringify({u2, f1:f1.fin}) + ')');
  await finish(); await tick(); t = await T(); fx = t.filter(x => x.faces);
  ok(fx.length===2 && fx.some(x => x.src===u2.id), "clip 2's ✨ result gets its face pass too");
  await finish(); await tick();
  const end = await page.evaluate(() => ({busy:REEL.R().ufx.items.map(x => x.st), seam:REEL.R().seam && REEL.R().seam.state, picks:REEL.clips().map(c => !!c.meta[c.pick].faces)}));
  ok(end.busy.join()==='done,done' && end.picks.join()==='true,true' && !!end.seam, 'all done: both clips on their face-fixed upscale, then 🧵 the seams start (' + JSON.stringify(end) + ')');
  // ⬆ Upscale this option with 🎭 Fix faces too
  await page.evaluate(() => { const c = REEL.clips()[1]; c.pick = c.takes[0]; REEL.refresh(); REEL.go(1); }); await page.waitForTimeout(500);
  await page.click('#upOne'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#upFx').checked && /more options/.test(document.querySelector('#upFxN').textContent)), '⬆ Upscale this option has the switch too (remembered on)');
  await page.click('#upN [data-v="1"]'); const k0 = await page.evaluate(() => REEL.clips()[1].takes.length), pk = await page.evaluate(() => REEL.clips()[1].pick);
  await page.click('#upGo'); await page.waitForTimeout(2500); t = await T();
  const u3 = t.filter(x => x.scale > 1 && x.src===pk); ok(u3.length===2 && u3.some(x => x.vid===f1.fin), "⬆ the single upscale carries on from clip 1's picked (face-fixed) option");
  await finish(); await tick(); t = await T();
  const nu = u3.find(x => x.state==='done' && !t.some(y => y.faces && y.src===x.id && false)), f3 = t.filter(x => x.faces);
  ok(f3.length===3, 'then its face pass is sent (' + f3.length + ')');
  await finish(); await tick();
  const s3 = await page.evaluate(([k0, pk]) => { const c = REEL.clips()[1]; return {n:c.takes.length - k0, pick:c.pick===pk, fx:c.takes.slice(k0).map(id => !!c.meta[id].faces)}; }, [k0, pk]);
  ok(s3.n===2 && s3.pick && s3.fx.join()==='false,true', 'the upscale and its face-fixed version are both new options; the pick stays (' + JSON.stringify(s3) + ')');
ok(await page.evaluate(() => { const c = window.FAPI_CALLS; return c.includes('CANVAS') && c.includes('IMG'); }), '🙂 face prints come from the cut-out faces and from her Library pictures');
  // 🙂 matching: the closest pairs, one face each, only when close enough
  const as = await page.evaluate(() => { const A = new Array(128).fill(0.1), B = new Array(128).fill(0.3), near = v => v.map(x => x + 0.01);
    return {two:REEL.faceAssign([A, B, null], [{lib:'Lmia', p:near(B)}, {lib:'Lpip', p:near(A)}]), far:REEL.faceAssign([A], [{lib:'Lmia', p:new Array(128).fill(0.9)}]), one:REEL.faceAssign([A, near(A)], [{lib:'Lmia', p:A}])}; });
  ok(JSON.stringify(as.two)==='[{"lib":"Lpip","obj":0},{"lib":"Lmia","obj":1}]' && !as.far.length && as.one.length===1 && as.one[0].obj===0, 'each character gets the face closest to her pictures; a face too far from anyone is left alone (' + JSON.stringify(as) + ')');
  // two people: no picking needed any more
  const why = await page.evaluate(() => { const c = REEL.clips()[0]; c.who = ['Lmia', 'Lpip']; delete c.fscan; return REEL.ufxFaces(c); });
  ok(why.ppl && why.ppl.length===2 && !why.fb, 'with two people it still goes ahead and works out who is who (' + JSON.stringify(why) + ')');
  // 🎬 After the whole upscale: the usual Final pass, then every clip's face pass at once, then seams
  await page.evaluate(() => { const c = REEL.clips()[0]; c.who = ['Lmia']; REEL.R().seam = null; REEL.go(0); }); await page.waitForTimeout(300);
  await page.click('#finBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#fnFx').checked && !!document.querySelector('#fnFxW [data-w="after"]')), '🎬 the sheet offers Clip by clip / After the whole upscale');
  await page.click('#fnFxW [data-w="after"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => /upscaled first/.test(document.querySelector('#fnFxN').textContent)), 'the note says it upscales first, then the faces');
  let fx0 = (await T()).filter(x => x.faces).length, up0 = (await T()).filter(x => x.scale > 1).length;
  await page.click('#fnGo'); await page.waitForTimeout(2500); t = await T();
  const ups2 = t.filter(x => x.scale > 1).length - up0;
  ok(ups2===2 && t.filter(x => x.faces).length===fx0 && await page.evaluate(() => REEL.R().ufx.kind==='after' && !REEL.R().seam), 'both clips are upscaled at once (chained as usual), no face pass or seams yet (' + ups2 + ')');
  await finish(); await tick(); await tick(); t = await T();
  ok(t.filter(x => x.faces).length===fx0 + 2, 'once they are done, both clips get their face pass at the same time (' + (t.filter(x => x.faces).length - fx0) + ')');
  await finish(); await tick();
  const e2 = await page.evaluate(() => ({st:REEL.R().ufx.items.map(x => x.st), picks:REEL.clips().map(c => !!(c.meta[c.pick] || {}).faces), seam:REEL.R().seam && REEL.R().seam.state}));
  ok(e2.st.join()==='done,done' && e2.picks.join()==='true,true' && !!e2.seam, 'then both are on their face-fixed option and 🧵 the seams start (' + JSON.stringify(e2) + ')');
  // the real face recognition loads (from the local package copy)
  if(process.env.FAPI_DIR){ await page.route('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/**', rt => { const f = path.join(FAPI, new URL(rt.request().url()).pathname.split('@1.7.15/')[1]); fs.readFile(f, (e, b) => e ? rt.fulfill({status:404, body:''}) : rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*'}, contentType:/\.js$/.test(f) ? 'text/javascript' : /\.json$/.test(f) ? 'application/json' : 'application/octet-stream', body:b})); });
    const rf = await page.evaluate(async () => { delete window.REEL_FAPI; try{ const m = await REEL.fapi(); const im = new Image(); im.src = 'icon-violet-512.png'; await im.decode(); const d = await m.detectSingleFace(im, new m.TinyFaceDetectorOptions({inputSize:320, scoreThreshold:0.3})).withFaceLandmarks().withFaceDescriptor(); return {ok:true, nets:m.nets.faceRecognitionNet.isLoaded, d:!!d}; }catch(e){ return {err:e.message}; } });
    ok(rf.ok && rf.nets, 'the real face recognition loads and runs on a picture (' + JSON.stringify(rf) + ')'); }
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
