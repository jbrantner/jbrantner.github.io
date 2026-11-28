// 🔗 Reel Re-link (Jordan 2026-11-25): a picked clip made again between the clip before and the clip after, kept as one clip with its own words;
// plus the 🔗 keep-things-the-same line on clips made to line up (➕ Next, ⇿ Insert, 🔗 Re-link). Fake PCs.
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_relink.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'glow.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MinimaxH3LatentUpscaler3D:{input:{required:{model_name:[['minimax_h3_latent_upscaler_3d_bf16.safetensors']]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
};
const OTHER = ['RepeatImageBatch','ColorMatch','ConditioningSetTimestepRange','ConditioningCombine','MiniMaxH3ReferenceToVideo','NAGGuiderMiniMaxH3','CLIPTextEncode','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'BboxDetectorSEGS','UltralyticsDetectorProvider','SplitSigmas','DisableNoise','SegsToCombinedMask','MaskToImage','PreviewImage','Video Slice','ImageFromBatch','TrimAudioDuration','VAEEncode','LTXVSeparateAVLatent','LTXVConcatAVLatent','ManualSigmas'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
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
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route('http://main.test/**', fake);
  // H3 Deck's own save: a Library character and its picture, one take of its own, the PCs
  const PNG = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true, qtext:'Soft film grain and gentle handheld sway.', negOn:true, neg:'blurry hands', h3Style:'A quiet indie film.'}, takes:[{id:'tDeck', t:1, state:'done', prompt:'H3 Deck take', pieces:[], imgs:[], vids:[], auds:[], follow:[]}],
    lib:[{id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}, {id:'Lpip', kind:'char', name:'Pip', stand:'cat girl', desc:'an anthro cat with orange fur', pics:['mPic'], keep:'exact', what:'', art:'3d'}, {id:'Lfrk', kind:'attr', name:'Freckles', stand:'', desc:'light freckles', pics:[], keep:'exact', what:''}, {id:'Lglow', kind:'lora', name:'Glow', stand:'', desc:'', pics:[], keep:'exact', what:'soft glow light', loras:[{name:'glow.safetensors', str:0.8}]}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png', w:180, h:180, thumb:'data:image/png;base64,' + PNG}, mOld:{id:'mOld', kind:'img', name:'old.png', type:'image/png'}}, up:{['mPic|' + R]:'h3deck/h3deck_mPic.png'}};
  await page.addInitScript(([deck, r]) => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(deck)); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, [DECK, R]);
  // the picture in IndexedDB (shared by both apps)
  await page.goto('http://127.0.0.1:8047/reel-5b1e7c94d2a0/');
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:30000});
  await page.waitForTimeout(800);
  const eng = page.frames().find(f => /engine=1/.test(f.url()));
  const finish = async () => { await eng.evaluate(() => { H3.S.takes.forEach(t => { if(t.state!=='working') return; t.state = 'done'; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:t.name + '_p.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); t.final = {filename:t.name + '.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); H3.saveNow(); });
    await page.evaluate(() => REEL.refresh()); await page.waitForTimeout(1500); };
  const graphs = () => sent.filter(x => x.g);
  // three clips: 3 s, 5 s, 4 s (Jordan's drawing)
  await page.evaluate(() => { REEL.R().cast = ['Lmia']; });
  for(const [k, secs] of [[0, 3], [1, 5], [2, 4]]){
    await page.evaluate(async ([k, secs]) => { const E = REEL.E(), r = await E.make({words:'Mia walks with a red umbrella, part ' + (k + 1), who:['Lmia'], secs, n:1}); const c = REEL.addClip(k, {kind:k ? 'next' : 'new', words:'Mia walks with a red umbrella, part ' + (k + 1), who:['Lmia']}); REEL.addTakes(c, r.ids, {}, c.words); }, [k, secs]);
    await finish(); }
  const cs0 = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, secs:REEL.info(c.pick).secs, n:c.takes.length})));
  ok(cs0.length===3 && cs0.every(c => c.pick && c.secs > 0), 'three finished clips (' + JSON.stringify(cs0) + ')');
  // 🔗 the button under the options of the middle clip
  await page.evaluate(() => REEL.go(1)); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!document.querySelector('#linkOne')), '🔗 Re-link shows under the options of a clip with finished clips around it');
  await page.click('#linkOne'); await page.waitForTimeout(300);
  const sh = await page.evaluate(() => ({h:document.querySelector('#card h3').textContent, w:document.querySelector('#lkW').value, on:document.querySelector('#lkS .on').textContent, note:document.querySelector('#card .note').textContent}));
  ok(/Re-link clip 2/.test(sh.h) && sh.w==='Mia walks with a red umbrella, part 2' && sh.on==='Medium' && /clip 1 and clip 3 are pinned/i.test(sh.note), 'the sheet has the clip\'s own words, Medium strength, and says clips 1 and 3 stay (' + JSON.stringify(sh) + ')');
  if(process.env.SHOT) await page.screenshot({path:process.env.SHOT});
  let n0 = graphs().length; await page.click('#lkGo'); await page.waitForTimeout(2500);
  const g = graphs().slice(n0); ok(g.length===1, 'one re-link sent (' + g.length + ')');
  const G = g[0] && g[0].g, t = await eng.evaluate(() => { const t = H3.S.takes[0]; return {prompt:t.prompt, lead:t.lead, seconds:t.seconds, model:t.model, src:H3.S.takes.find(x => x.id===t.lead.src).model}; });
  const L = t.lead, A = G ? nodes(G, 'MiniMaxH3AddGuide') : [];
  ok(L && L.base && L.k0===22 && L.clipA && L.clipA.o===0 && L.clipB && L.clipB.o % 17===0 && L.clipB.o===L.k0 + L.B && Math.abs(L.B - Math.round(cs0[1].secs * 24)) <= 9 && L.L===L.clipB.o + 22,
    'the window opens on clip 1\'s last 22 frames, keeps clip 2\'s frames (rounded by under ⅓ s), and pins clip 3\'s first 22 on a 17-frame block (' + JSON.stringify(L && {k0:L.k0, B:L.B, L:L.L, a:L.clipA, b:L.clipB}) + ')');
  ok(A.filter(n => n.inputs.image).map(n => n.inputs.frame_idx).sort((a, b) => a - b).join()===[0, L.clipB.o].join() && A.some(n => n.inputs.audio && n.inputs.frame_idx===22), 'guides: clip 1 at frame 0, clip 3 at the block, clip 2\'s own sound at 22 (' + JSON.stringify(A.map(n => n.inputs.frame_idx)) + ')');
  { const enc = nodes(G, 'VAEEncode'), sch = nodes(G, 'BasicScheduler').map(n => n.inputs.denoise), spl = nodes(G, 'SplitSigmas').map(n => n.inputs.step);
    ok(enc.length===1 && L.base.str===0.5 && L.base.runs.length >= 1, 'it starts from the real frames (VAE-encoded) at Medium 0.5 (' + JSON.stringify({sch, spl}) + ')'); }
  { const cm = nodes(G, 'ColorMatch'); ok(cm.length===12 && cm[0].inputs.strength===1 && cm[11].inputs.strength===1 && cm[5].inputs.strength < 0.2 && cm[6].inputs.strength < 0.2, '🎨 its first and last 1.5 s ease into the colour of the clips on each side (' + JSON.stringify(cm.map(n => n.inputs.strength)) + ')'); }
  { const keep = Object.values(G).filter(n => n.class_type==='ImageFromBatch' && n.inputs.batch_index===22 && n.inputs.length===L.B); ok(keep.length >= 1, 'only clip 2\'s frames are kept'); }
  ok(/The room, the objects and the light stay exactly as they were in the clips around it/.test(t.prompt) && !/same people/.test(t.prompt) && /<Subject 1> walks with a red umbrella, part 2/.test(t.prompt) && t.model===t.src, '🔗 its words are the clip\'s own, with the keep-things-the-same line, and its own model (' + JSON.stringify(t.prompt) + ')');
  const cs1 = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, n:c.takes.length, m:c.meta[c.pick], w:c.tw[c.pick]})));
  ok(cs1.length===3 && cs1[1].n===2 && cs1[1].pick!==cs0[1].pick && cs1[1].m.relink===cs0[1].pick && cs1[1].m.after===cs0[0].pick && cs1[1].m.before===cs0[2].pick && cs1[1].w==='Mia walks with a red umbrella, part 2' && cs1[0].pick===cs0[0].pick && cs1[2].pick===cs0[2].pick,
    'still 3 clips: clip 2 gets the re-link as a new option, picked, with the same words; clips 1 and 3 untouched (' + JSON.stringify(cs1) + ')');
  await finish();
  ok(await page.evaluate(() => !/may jump/.test(document.querySelector('#warnBox').textContent)), 'no "may jump" warning on the re-linked clip');
  // the first clip: only the clip after is pinned
  await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(400); await page.click('#linkOne'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => /clip 2 is pinned/i.test(document.querySelector('#card .note').textContent)), 'on the first clip only the clip after is pinned');
  n0 = graphs().length; await page.click('#lkS [data-v="0.35"]'); await page.click('#lkGo'); await page.waitForTimeout(2500);
  { const L1 = await eng.evaluate(() => H3.S.takes[0].lead), G1 = graphs().slice(n0)[0].g, cm = nodes(G1, 'ColorMatch');
    ok(L1.k0===0 && !L1.clipA && L1.clipB && L1.clipB.o % 17===0 && L1.base.str===0.35 && cm.length >= 3 && cm[cm.length - 1].inputs.strength===1 && cm[0].inputs.strength < 0.5, 'first clip: no clip before, the clip after pinned on a block, Light 0.35, colour eased only at its end (' + JSON.stringify({k0:L1.k0, B:L1.B, b:L1.clipB, cm:cm.map(n => n.inputs.strength)}) + ')'); }
  await finish();
  // 🎛 the sheet's own model pick (Jordan 2026-11-28): starts on ⚙ Settings' model, is used for this send only
  await page.evaluate(() => REEL.go(1)); await page.waitForTimeout(400); await page.click('#linkOne'); await page.waitForTimeout(300);
  { const m0 = await page.evaluate(() => REEL.E().look().model), op = await page.evaluate(() => [...document.querySelectorAll('#lkM option')].map(o => ({v:o.value, on:o.selected, t:o.textContent})));
    ok(op.length >= 2 && op.find(o => o.on).v===m0 && /\(Settings\)/.test(op.find(o => o.on).t), '🎛 Re-link has a Model pick, starting on the Settings model (' + JSON.stringify({m0, op}) + ')');
    const alt = op.find(o => !o.on && !/#/.test(o.v)).v; await page.selectOption('#lkM', alt);
    n0 = graphs().length; await page.click('#lkGo'); await page.waitForTimeout(2500);
    const t2 = await eng.evaluate(() => ({model:H3.S.takes[0].model, relink:!!(H3.S.takes[0].lead && H3.S.takes[0].lead.base)})), m1 = await page.evaluate(() => REEL.E().look().model);
    ok(t2.relink && t2.model===alt && m1===m0, '🎛 the re-link runs on the picked model and Settings keeps its own (' + JSON.stringify({t2, alt, m0, m1}) + ')');
    await finish();
    const r = await page.evaluate(async alt => { const E = REEL.E(), cs = REEL.clips(); return E.fill({takeA:cs[0].pick, outA:1, takeB:cs[1].pick, inB:0, secs:1, words:'Mia waves', who:['Lmia'], n:1, model:alt}); }, alt);
    const t3 = await eng.evaluate(() => H3.S.takes[0].model), m2 = await page.evaluate(() => REEL.E().look().model);
    ok(r && r.ids && t3===alt && m2===m0, '🎛 🪄 blend / ⇿ fill take a model too, Settings untouched (' + JSON.stringify({t3, alt, m2}) + ')');
    await finish(); }
  // 🧵 Blend one seam (Jordan 2026-11-28): clip 2 and clip 3 joined, the join repainted, each gets its stretch back
  await page.evaluate(() => REEL.go(1)); await page.waitForTimeout(400);
  ok(await page.evaluate(() => /Blend the seam into clip 3/.test((document.querySelector('#pairOne') || {}).textContent || '')), '🧵 a Blend the seam button under the options of a clip with a clip after it');
  for(const own of [0, 1]){
    const b0 = await page.evaluate(() => REEL.clips().map(c => ({id:c.id, pick:c.pick, n:c.takes.length, len:(c.out != null ? c.out : REEL.info(c.pick).secs) - (c.in || 0)})));
    await page.click('#pairOne'); await page.waitForTimeout(300);
    if(own) await page.selectOption('#prM', 'own');
    n0 = graphs().length; await page.click('#prGo'); await page.waitForTimeout(2500);
    const card = await page.evaluate(() => { REEL.refresh(); const a = document.querySelector('#opts [data-sj]'); return a ? a.textContent : ''; });
    await page.evaluate(() => REEL.go(2)); await page.waitForTimeout(400); const card2 = await page.evaluate(() => { const a = document.querySelector('#opts [data-sj]'); return a ? a.textContent : ''; }); await page.evaluate(() => REEL.go(1)); await page.waitForTimeout(300);
    ok(/Blending the seam/.test(card) && /%/.test(card) && /Blending the seam/.test(card2), '🧵 a rendering card with its % shows under both clips while the seam blends (' + JSON.stringify([card, card2]) + ')');
    const sg = graphs().slice(n0); const tk = await eng.evaluate(() => { const t = H3.S.takes[0], src = H3.S.takes.find(x => x.id===t.combo.parts[0].take); return {seam:t.combo && t.combo.seam, parts:t.combo.parts.length, model:t.model, srcModel:src ? src.model : ''}; });
    ok(sg.length===1 && tk.seam && tk.seam.one && tk.parts===2 && (own ? tk.model===tk.srcModel && !tk.seam.unet : /prism/i.test(tk.seam.unet)),
      '🧵 one job: the two clips joined, the join repainted on ' + (own ? "the clips' own model" : 'PRISM PIKA') + ' (' + JSON.stringify(Object.assign({}, tk, {n:sg.length})) + ')');
    await finish(); await page.evaluate(() => REEL.pairTick()); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => { REEL.refresh(); return !document.querySelector('#opts [data-sj]'); }), '🧵 the card goes once the blended stretch is back as an option');
    const b1 = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, n:c.takes.length, seam:!!(c.meta[c.pick] || {}).seam, len:(c.out != null ? c.out : REEL.info(c.pick).secs) - (c.in || 0)})));
    ok(b1[0].pick===b0[0].pick && b1[1].seam && b1[2].seam && b1[1].pick===b1[2].pick && b1[1].pick!==b0[1].pick && b1[1].n===b0[1].n + 1 && Math.abs(b1[1].len - b0[1].len) < 0.05 && Math.abs(b1[2].len - b0[2].len) < 0.05,
      '🧵 clips 2 and 3 pick their own stretch of it, same lengths; clip 1 untouched (' + JSON.stringify({b0, b1}) + ')'); }
  // 🧵 any ⚙ model pick in the seam sheet, finish included (Jordan 2026-11-28: "I want access to all of them")
  { const op = await page.evaluate(() => { document.querySelector('#pairOne').click(); return [...document.querySelectorAll('#prM option')].map(o => o.value); }); await page.waitForTimeout(300);
    const ref = op.find(v => /ref2va/.test(v) && !/#/.test(v));
    ok(op.length >= 4 && ref && op.includes('own') && op.some(v => /#v$/.test(v)), '🧵 the seam Model list has every ⚙ pick plus the clips\' own (' + JSON.stringify(op) + ')');
    await page.selectOption('#prM', ref); n0 = graphs().length; await page.click('#prGo'); await page.waitForTimeout(2500);
    const tk = await eng.evaluate(() => { const t = H3.S.takes[0]; return {model:t.model, fin:t.fin, seam:!!(t.combo && t.combo.seam)}; }), G = graphs().slice(n0)[0];
    const un = G ? Object.values(G.g).filter(n => n.class_type==='UNETLoader').map(n => n.inputs.unet_name) : [];
    ok(tk.seam && /ref2va/.test(tk.model) && tk.fin && un.some(u => /ref2va/.test(u)) && un.some(u => /prismPIKA/.test(u)), '🧵 H3 Reference → PIKA finish repaints the seam on both models (' + JSON.stringify({tk, un}) + ')');
    await finish(); await page.evaluate(() => REEL.pairTick()); await page.waitForTimeout(1000); }
  // ⬆ Upscale this option with changed words; ✂ Edit › 🎨 Change it with a Model pick on the upscaled option comes back upscaled (Jordan 2026-11-28)
  { await page.evaluate(() => REEL.go(1)); await page.waitForTimeout(400); await page.click('#upOne'); await page.waitForTimeout(300);
    const w0 = await page.evaluate(() => document.querySelector('#upW').value);
    ok(/part 2/.test(w0), '⬆ the upscale sheet shows the words (' + JSON.stringify(w0) + ')');
    await page.fill('#upW', 'Mia twirls her red umbrella in the rain'); await page.click('#upN [data-v="1"]').catch(() => {});
    n0 = graphs().length; const nT = await eng.evaluate(() => H3.S.takes.length); await page.click('#upGo');
    for(let k = 0; k < 20 && await eng.evaluate(n => H3.S.takes.length===n, nT); k++) await page.waitForTimeout(300);
    const u = await eng.evaluate(() => { const t = H3.S.takes[0]; return {prompt:t.prompt, scale:t.up && t.up.scale, id:t.id}; });
    ok(u.scale > 1 && /<Subject 1> twirls her red umbrella in the rain/.test(u.prompt), '⬆ the ✨ pass gets the changed words (' + JSON.stringify(u) + ')');
    await finish(); await page.evaluate(() => { REEL.upAfterTick(); }); await page.waitForTimeout(300);
    const upId = await page.evaluate(() => { const c = REEL.cur(), id = c.takes.find(x => (c.meta[x] || {}).fin); c.pick = id; REEL.refresh(); return id; }); await page.waitForTimeout(400);
    ok(!!upId && await page.evaluate(() => REEL.cur().tw[REEL.cur().pick]==='Mia twirls her red umbrella in the rain'), '⬆ the upscaled option keeps the changed words');
    await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edM [data-m="change"]'); await page.waitForTimeout(300);
    const cm = await page.evaluate(() => ({op:[...document.querySelectorAll('#edCM option')].map(o => o.value), note:/upscaled too/.test(document.querySelector('#edCh').textContent)}));
    ok(cm.op.length >= 3 && cm.note, '🎨 Change it has a Model pick and says the change comes back upscaled (' + JSON.stringify(cm) + ')');
    const pk = cm.op.find(v => /prismpika/.test(v)); await page.selectOption('#edCM', pk); await page.fill('#edW', 'Mia closes her umbrella');
    const nT2 = await eng.evaluate(() => H3.S.takes.length); await page.click('#edCGo');
    for(let k = 0; k < 40 && await page.evaluate(() => !!document.querySelector('#edCGo')); k++) await page.waitForTimeout(300);
    const ch = await eng.evaluate(() => { const t = H3.S.takes[0]; return {id:t.id, model:t.model, redo:!!t.redo, up:!!t.up}; }), m0 = await page.evaluate(() => REEL.S().reelModel || REEL.E().look().model);
    const meta = await page.evaluate(id => (REEL.cur().meta[id] || {}), ch.id);
    ok(ch.redo && !ch.up && ch.model===pk && meta.upAfter && !meta.fin && !/prismpika/.test(m0), '🎨 the change runs on the picked model (Settings untouched) and is marked to be upscaled (' + JSON.stringify({ch, upAfter:meta.upAfter, m0}) + ')');
    await page.evaluate(id => { REEL.cur().pick = id; }, ch.id);
    await finish(); const nT3 = await eng.evaluate(() => H3.S.takes.length); await page.evaluate(() => REEL.upAfterTick()); await page.waitForTimeout(1500);
    const au = await eng.evaluate(src => { const t = H3.S.takes.find(x => x.up && x.redo && x.redo.src===src); return t ? {scale:t.up.scale, id:t.id, src:t.redo.src} : null; }, ch.id);
    // (the fake PCs fail the ✨ pass itself, so the clip falls back off it: the pick is checked on the metadata and the pick made at send time)
    const pc = await page.evaluate(id => { const c = REEL.cur(); return {m:c.meta[id], src:c.meta[(c.meta[id] || {}).src] || {}}; }, au && au.id);
    ok(au && au.scale > 1 && au.src===ch.id && pc.m && pc.m.fin && pc.m.src===ch.id && pc.src.upAfter && pc.src.upAfter.sent===au.id, '⬆ once done, the change gets the ✨ upscale and that version is picked (' + JSON.stringify({au, pc}) + ')');
    { const r = await page.evaluate(async () => { const c = REEL.cur(), id = c.takes[0], p0 = c.pick; (c.meta[id] = c.meta[id] || {}).upAfter = {den:0.9, hm:'pika', sl:[]}; c.pick = id;
        const E = REEL.E(), f0 = E.final, other = REEL.clips()[0].pick; E.final = async () => ({ids:[other]}); try{ await REEL.upAfterTick(); }finally{ E.final = f0; } const res = {picked:c.pick===other, id, meta:c.meta[other] && c.meta[other].src===id};
        c.takes = c.takes.filter(x => x!==other); delete c.meta[other]; delete c.meta[id].upAfter; c.pick = p0; REEL.refresh(); return res; });
      ok(r && r.picked && r.meta, '⬆ when the change is the picked option, its upscale is picked (' + JSON.stringify(r) + ')'); }
    await page.evaluate(() => REEL.upAfterTick()); await page.waitForTimeout(800);
    ok(await eng.evaluate(n => H3.S.takes.filter(t => t.redo && t.redo.src===n).length, ch.id)===1, '⬆ only one upscale per change');
    for(let k = 0; k < 3; k++){ await finish(); await page.evaluate(() => REEL.upAfterTick()); await page.waitForTimeout(800); } await finish();
    ok(await page.evaluate(() => REEL.clips().every(c => c.takes.every(id => !(c.meta[id] || {}).upAfter || (c.meta[id].upAfter || {}).sent))), '⬆ every change option of the upscaled clip got its upscale'); }
  // ➕ Next gets the keep line after the [0s-1s] anchor (never inside it)
  { const r = await page.evaluate(async () => { const cs = REEL.clips(), x = await REEL.E().carry({take:cs[2].pick, at:REEL.info(cs[2].pick).secs, words:'Mia sits down', who:['Lmia'], n:1}); return x; });
    const p = await eng.evaluate(() => H3.S.takes[0].prompt);
    ok(/^\[0s-1s\] The scene keeps carrying on from the moment before\.\n\[1s-\] The room, the objects and the light stay exactly as they were a moment ago\. <Subject 1> sits down$/.test(p) && !/same people/.test(p), '➕ Next: the anchor stays first, the room-only keep line opens the [1s-] part (' + JSON.stringify(p) + ')'); }
  { const p = await page.evaluate(async () => { const E = REEL.E(), cs = REEL.clips(); return await E.fill({takeA:cs[0].pick, outA:1, takeB:cs[1].takes[0], inB:0, secs:1, words:'Mia waves', who:['Lmia'], n:1, keep:false}); });
    const q = await eng.evaluate(() => H3.S.takes[0].prompt); ok(!/room, the objects/.test(q), 'keep:false leaves the line out (' + JSON.stringify(q) + ')'); }
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
