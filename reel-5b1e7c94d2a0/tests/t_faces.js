// 🎭 Reel's ✂ Edit › Fix faces (2026-11-26): 🔎 find the faces (SAM 3 scan on the option's PC), pick whose face is whose, and the face
// pass graph: zoomed crop, colour match, feathered inside the face, gap-filled crop mask, Prism Pika, only her pictures. Fake PCs.
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_faces.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'glow.safetensors', 'minimax_h3_anime_style.safetensors', 'open_regenerate_h3_ref2va.safetensors']], strength_model:['FLOAT', {default:1}]}}},
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8043);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}, deviceScaleFactor:2}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], faces = [];
  const MASK = (() => { const zlib = require('zlib'), W = 64, rows = []; for(let y = 0; y < W; y++){ const r = Buffer.alloc(W + 1); for(let x = 0; x < W; x++) r[x + 1] = (x >= 20 && x <= 35 && y >= 4 && y <= 19) ? 255 : 0; rows.push(r); }
    const crc = b => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for(const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const h = Buffer.alloc(13); h.writeUInt32BE(W, 0); h.writeUInt32BE(W, 4); h[8] = 8; h[9] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', h), ch('IDAT', zlib.deflateSync(Buffer.concat(rows))), ch('IEND', Buffer.alloc(0))]); })();
  const exps = [];
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
    if(p.startsWith('/history/')){ const id = p.slice(9), s = sent.find(x => x.pid===id); if(s && s.g && Object.values(s.g).some(n => n.class_type==='SAM3_TrackPreview')){ const pv = Object.keys(s.g).find(k => s.g[k].class_type==='SAM3_TrackPreview'); return J({[id]:{status:{completed:true, status_str:'success'}, outputs:{[pv]:{images:[{filename:'scan.webm', subfolder:'', type:'temp'}]}}}}); } return J({}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route('http://main.test/**', fake);
  // H3 Deck's own save: a Library character and its picture, one take of its own, the PCs
  const PNG = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true, qtext:'Soft film grain and gentle handheld sway.', negOn:true, neg:'blurry hands', h3Style:'A quiet indie film.'}, takes:[{id:'tDeck', t:1, state:'done', prompt:'H3 Deck take', pieces:[], imgs:[], vids:[], auds:[], follow:[]}],
    lib:[{id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}, {id:'Lpip', kind:'char', name:'Pip', stand:'cat girl', desc:'an anthro cat with orange fur', pics:['mPic'], keep:'exact', what:'', art:'3d'}, {id:'Lfrk', kind:'attr', name:'Freckles', stand:'', desc:'light freckles', pics:[], keep:'exact', what:''}, {id:'Lglow', kind:'lora', name:'Glow', stand:'', desc:'', pics:[], keep:'exact', what:'soft glow light', loras:[{name:'glow.safetensors', str:0.8}]}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png', w:180, h:180, thumb:'data:image/png;base64,' + PNG}, mOld:{id:'mOld', kind:'img', name:'old.png', type:'image/png'}}, up:{['mPic|' + R]:'h3deck/h3deck_mPic.png'}};
  await page.addInitScript(([deck, r]) => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(deck)); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, [DECK, R]);
  // the picture in IndexedDB (shared by both apps)
  await page.goto('http://127.0.0.1:8043/reel-5b1e7c94d2a0/');
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:30000});
  await page.waitForTimeout(800);
  const eng = page.frames().find(f => /engine=1/.test(f.url()));
  ok(!!eng, 'H3 Deck runs hidden as the engine');
  const iso = await eng.evaluate(() => ({key:Object.keys(localStorage), deckTakes:H3.S.takes.length, lib:H3.S.lib.map(L => L.name), media:Object.keys(H3.S.media), tab:H3.S.tab, films:!!document.querySelector('#filmTab iframe')}));
  ok(iso.deckTakes===0 && iso.lib.join()==='Mia,Pip,Freckles,Glow' && iso.media.join()==='mPic' && iso.tab==='lib' && !iso.films, 'the engine has its own takes (none of H3 Deck\'s), H3 Deck\'s Library and only its pictures, and no Films frame (' + JSON.stringify(iso) + ')');
  ok(await page.evaluate(() => /Make your first clip/.test(document.querySelector('#vmsg').textContent)), 'an empty reel asks for the first clip');
  // ✍ New clip with Mia
  await page.click('[data-act="make"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.querySelector('#who [data-w]') && !!document.querySelector('[data-golib]')), '👥 with nobody in the reel, the sheet points to the 📚 Library instead of listing everyone');
  await page.click('[data-close]'); await page.evaluate(() => { REEL.R().cast = ['Lmia']; }); await page.click('[data-act="make"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!document.querySelector('#who [data-w="Lmia"]') && document.querySelectorAll('#who [data-w]').length===1), "👥 only the reel's characters are listed");
  await page.fill('#mkW', 'waves at the camera'); await page.click('#who [data-w="Lmia"]');
  ok((await page.inputValue('#mkW'))==='waves at the camera Mia ', 'tapping Mia puts her in the words (' + JSON.stringify(await page.inputValue('#mkW')) + ')');
  await page.click('#who [data-w="Lmia"]');
  ok((await page.inputValue('#mkW'))==='waves at the camera Mia Mia ', 'every tap puts her in again, like a button');
  ok(await page.evaluate(() => document.querySelectorAll('.hlw .hl mark').length===2 && document.querySelector('#who [data-w="Lmia"]').classList.contains('on')), 'her name shows as a chip in the words');
  if(process.env.SHOTC) await page.screenshot({path:process.env.SHOTC});
  await page.fill('#mkW', 'Mia waves at the camera');
  await page.click('#nSeg [data-n="2"]');
  let n0 = sent.filter(x => x.g).length; await page.click('#mkGo'); await page.waitForTimeout(2500);
  const g1 = sent.filter(x => x.g).slice(n0);
  const tk1 = await eng.evaluate(() => H3.S.takes.map(t => ({id:t.id, prompt:t.prompt})));
  ok(g1.length===2 && tk1.length===2 && tk1.every(t => /<Subject 1>/.test(t.prompt) && !/\bMia\b/.test(t.prompt)), 'New clip sends 2 options, Mia named as <Subject 1> (' + JSON.stringify(tk1) + ')');
  ok(g1.every(x => nodes(x.g, 'LoadImage').length >= 1), "her Library picture goes with it");
  ok(await eng.evaluate(() => { const t = H3.S.takes[0]; return !!t.h3 && t.h3.quality===true && t.boost===true && /ref2va/.test(t.model) && t.fin && t.fin.at===0.5; }), 'a Reel take gets H3 Deck\'s bare-bones settings (references, the H3 way, ✨ quality on)');
  { const w = await page.evaluate(() => { const ids = REEL.clips()[REEL.R().cur].takes, st = ids.map(id => REEL.info(id).state); const other = ids.find(id => id!==REEL.clips()[REEL.R().cur].pick);
      return {st, other, html:document.querySelector('#wheel').innerHTML}; });
    ok(!/\$\{/.test(w.html), 'the wheel shows no stray code while a clip renders');
    if(w.other && /working|done/.test((await page.evaluate(id => REEL.info(id).state, w.other)))){ await page.click(`#opts [data-o="${w.other}"]`).catch(() => {}); await page.waitForTimeout(200);
      ok(await page.evaluate(id => REEL.clips()[REEL.R().cur].pick===id && !!document.querySelector(`[data-o="${id}"].on`), w.other), 'tapping an option, even one still rendering, makes it the one on the main screen (' + JSON.stringify(w.st) + ')'); } }
  const st = await page.evaluate(() => ({clips:REEL.clips().length, takes:REEL.cur().takes.length, words:REEL.cur().words}));
  ok(st.clips===1 && st.takes===2, 'the reel has one clip with two options (' + JSON.stringify(st) + ')');
  // finish them (the PC is fake)
  const finish = async () => { await eng.evaluate(() => { H3.S.takes.forEach((t, k) => { if(t.up && t.upErr && !t.final){ t.upErr = ''; t.final = t.smoothed; } /* (the fake PC has no latent upscaler: count a ✨ pass as done) */ if(t.state!=='working') return; t.state = 'done'; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:t.name + '_p.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); if(t.up) t.upStage = 'done'; t.upPid = null; t.final = {filename:t.name + '.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); H3.saveNow(); });
    await page.evaluate(() => REEL.refresh()); await page.waitForTimeout(1500); };
  await finish();
  // ✂ Edit › 🎭 Fix faces
  await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300);
  await page.click('#editBtn'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!document.querySelector('#edM [data-m="faces"]')), '✂ Edit has a 🎭 Fix faces tab');
  await page.click('#edM [data-m="faces"]'); await page.waitForTimeout(200);
  const s0 = await page.evaluate(() => ({fx:!document.querySelector('#edFx').hidden, trim:document.querySelector('#edT').hidden, go:document.querySelector('#edFxGo').disabled, gl:document.querySelector('#edFxGo').textContent, chips:document.querySelectorAll('#edFxWho [data-fx]').length}));
  ok(s0.fx && s0.trim && s0.go && /find the faces first/.test(s0.gl) && !s0.chips, 'before the scan: no number chips and Fix faces waits for 🔎 (' + JSON.stringify(s0) + ')');
  n0 = sent.filter(x => x.g).length; await page.click("#edFxScan"); await page.waitForTimeout(4000);
  const sg = sent.filter(x => x.g).slice(n0).map(x => x.g);
  ok(sg.length===1 && nodes(sg[0], 'SAM3_TrackPreview').length===1 && nodes(sg[0], 'CLIPTextEncode')[0].inputs.text==='face:6', '🔎 one SAM 3 face scan is sent (' + sg.length + ')');
  const pick = await page.evaluate(() => REEL.cur().pick);
  const F = await eng.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return {F:H3.takeFrames ? H3.takeFrames(t) : null}; }, pick);
  const s1 = await page.evaluate(() => ({v:!document.querySelector('#edFxV').hidden && /scan\.webm/.test(document.querySelector('#edFxV').src), main:document.querySelector('#edV').hidden, chips:[...document.querySelectorAll('#edFxWho [data-fx]')].map(b => b.dataset.k + (b.classList.contains('on') ? '*' : '')).join(' '), gl:document.querySelector('#edFxGo').textContent, go:document.querySelector('#edFxGo').disabled}));
  ok(s1.v && s1.main && s1.chips==='0* 1 2 3 4 5 -' && s1.gl==="🎭 Fix Mia's face" && !s1.go, 'the numbered scan plays in place of the clip; Mia (the only one in it) starts on number 0 (' + JSON.stringify(s1) + ')');
  await page.click('#edFxWho [data-k="2"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => REEL.cur().fpick.Lmia===2), 'tapping 2 gives Mia face number 2');
  await page.click('#edFxS [data-v="0.6"]'); await page.waitForTimeout(100);
  n0 = sent.filter(x => x.g).length; const tk0 = await page.evaluate(() => REEL.cur().takes.length);
  await page.click('#edFxGo');
  let g = {}; for(let k = 0; k < 40 && !Object.keys(g).length; k++){ await page.waitForTimeout(500); g = sent.filter(x => x.g).slice(n0).map(x => x.g).find(x => Object.values(x).some(n => n.class_type==='SAM3_TrackToMask')) || {}; }
  const why = await eng.evaluate(() => { const t = H3.S.takes[0]; return {st:t.upStage, err:t.upErr}; }); if(!Object.keys(g).length) console.log('not sent', JSON.stringify(why));
  const C = t => nodes(g, t);
  const info = await eng.evaluate(() => { const t = H3.S.takes[0]; return {faces:t.up && t.up.faces, zoom:t.up && t.up.zoom, den:t.up && t.up.den, unet:t.up && t.up.unet, str:t.up && t.up.str, trk:t.up && t.up.trk, part:t.up && t.up.part}; });
  ok(info.faces && info.faces.length===1 && info.faces[0].obj===2 && info.zoom===true && info.den===0.6 && /prismPIKA/.test(info.unet) && info.str===0.4, 'the pass: face number 2 for her, 🔍 zoom on, Medium 0.6, Prism Pika, regenerate LoRA 0.4 (' + JSON.stringify(info) + ')');
  ok(C('SAM3_TrackToMask').length===1 && C('SAM3_TrackToMask')[0].inputs.object_indices==='2' && C('SAM3_VideoTrack').length===1, 'SAM 3 tracks the whole clip and takes number 2 as her mask');
  const crops = C('BatchCropFromMask'), mm = C('MiniMaxH3ReferenceToVideo');
  ok(crops.length===2 && C('BatchUncrop').length===1 && mm.length===1 && mm[0].inputs.width===mm[0].inputs.height && mm[0].inputs.width >= 384, '🔍 her face is cropped (picture + same crop of its mask), drawn big and square by MiniMax (' + (mm[0] ? mm[0].inputs.width + 'x' + mm[0].inputs.height : '-') + ') and put back');
  ok(crops[0].inputs.masks[0]===crops[1].inputs.masks[0], 'both crops use the same mask, so they get the same boxes');
  const cmk = C('ColorMatch'); ok(cmk.length===1 && cmk[0].inputs.method==='mkl', '🎨 the redrawn face is colour-matched to the original crop');
  const gm = C('GrowMaskWithBlur'), gmIn = gm.filter(n => n.inputs.expand < 0), gmFill = gm.filter(n => n.inputs.lerp_alpha===0.1);
  ok(gm.length===3 && gmIn.length===1 && gmIn[0].inputs.blur_radius > 0 && gmIn[0].inputs.fill_holes===true && gmFill.length===1 && C('ReverseImageBatch').length===1, '🫧 feathered inside the face (shrunk then blurred, holes filled), and the crop mask keeps her last place over frames with no face (' + JSON.stringify(gm.map(n => [n.inputs.expand, n.inputs.blur_radius, n.inputs.lerp_alpha])) + ')');
  const comp = C('ImageCompositeMasked'); ok(comp.length===2, 'two composites: the face inside the zoomed crop, then the crop area back into the frame');
  const lu = C('LoraLoaderModelOnly').map(n => n.inputs.lora_name + '@' + n.inputs.strength_model); ok(lu.some(x => /open_regenerate.*@0\.4/.test(x)), 'the regenerate LoRA at 0.4 (' + lu.join(', ') + ')');
  const imgs = C('LoadImage').length; ok(imgs >= 1, "her Library picture goes with it (" + imgs + ')');
  const sf = await page.evaluate(([k0]) => { const c = REEL.cur(), nid = c.takes[c.takes.length - 1]; return {more:c.takes.length===k0 + 1, meta:c.meta[nid], closed:document.querySelector('#sheet').hidden}; }, [tk0]);
  ok(sf.more && sf.meta && sf.meta.faces===true && sf.meta.same===pick && sf.closed, 'the fixed version is a new option of the clip, marked as the same shot as its source (' + JSON.stringify(sf) + ')');
  // 🎛 the face pass's own model and 🎨 style LoRA (Jordan 2026-11-28)
  { await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edM [data-m="faces"]'); await page.waitForTimeout(400);
    const m0 = await page.evaluate(() => ({hm:[...document.querySelectorAll('#edFxHm button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(), sl:!!document.querySelector('#edFxSl [data-sa]'), sub:(document.querySelector('#edFxSl .note') || {}).textContent}));
    ok(m0.hm==='PRISM PIKA*,MiniMax only,TriPRISM' && m0.sl && /face pass/.test(m0.sub), '🎛 Fix faces has a Model pick (PRISM PIKA first) and a 🎨 Style LoRA row (' + JSON.stringify(m0) + ')');
    await page.click('#edFxHm [data-hm="minimax"]'); await page.click('#edFxSl [data-sa]'); await page.waitForTimeout(100);
    const lo = await page.evaluate(() => [...document.querySelectorAll('#edFxSl [data-sn] option')].map(o => o.value).filter(v => v && !/turbo|regenerate|step/i.test(v))[0]); console.log('style LoRA', lo); await page.selectOption('#edFxSl [data-sn]', lo); await page.waitForTimeout(100);
    const nT = await eng.evaluate(() => H3.S.takes.length); await page.evaluate(() => { document.querySelector('#edFxGo').disabled = false; }); await page.click('#edFxGo');
    for(let k = 0; k < 20 && await eng.evaluate(n => H3.S.takes.length===n, nT); k++) await page.waitForTimeout(300);
    const t2 = await eng.evaluate(() => { const t = H3.S.takes[0]; return {unet:t.up && t.up.unet, van:!!(t.up && t.up.van), loras:(t.loras || []).map(l => l.name + '@' + l.str)}; });
    ok(/ref2va/.test(t2.unet) && t2.van && t2.loras.some(x => x===lo + '@0.8'), '🎛 the face pass runs on MiniMax with the style LoRA on top (' + JSON.stringify(t2) + ')');
    ok(await page.evaluate(lo => REEL.S().fxHm==='minimax' && (REEL.S().fxSl || [])[0].name===lo, lo), 'the face model and style LoRA are remembered'); }
  if(process.env.SHOT){ await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edM [data-m="faces"]'); await page.waitForTimeout(300); await page.screenshot({path:process.env.SHOT, fullPage:true}); }
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
