// 🎞 Reel (2026-11-20): the simple clip app on H3 Deck's engine. Fake PCs; checks the engine keeps its own takes, the Library is
// shared, and New clip / ➕ Next / ⇿ Insert / ↻ Redo / ✂ trim with 🪄 blend / 🎨 change / the wheel all work.
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_reel.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', 'Ultima NSFW Lv120 Hybrid pruned Turbo int8-convrot_.safetensors', 'Sulphur3_10ErosMax_SingularityV2_TriPRISM_TurboFusion_realism_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  MinimaxH3LatentUpscaler3D:{input:{required:{model_name:[['minimax_h3_latent_upscaler_3d_bf16.safetensors']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'glow.safetensors', 'minimax_h3_anime_style.safetensors', 'open_regenerate_h3_ref2va.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
};
const OTHER = ['RepeatImageBatch','MiniMaxH3ImageToVideo','MiniMaxH3MotionContext','ColorMatch','ConditioningSetTimestepRange','ConditioningCombine','MiniMaxH3ReferenceToVideo','NAGGuiderMiniMaxH3','CLIPTextEncode','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'BboxDetectorSEGS','UltralyticsDetectorProvider','SplitSigmas','DisableNoise','SegsToCombinedMask','MaskToImage','PreviewImage','Video Slice','ImageFromBatch','TrimAudioDuration','VAEEncode','LTXVSeparateAVLatent','LTXVConcatAVLatent','ManualSigmas'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8041);
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
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, host:u.host, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route('http://main.test/**', fake);
  // H3 Deck's own save: a Library character and its picture, one take of its own, the PCs
  const PNG = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true, qtext:'Soft film grain and gentle handheld sway.', negOn:true, neg:'blurry hands', h3Style:'A quiet indie film.'}, takes:[{id:'tDeck', t:1, state:'done', prompt:'H3 Deck take', pieces:[], imgs:[], vids:[], auds:[], follow:[]}],
    lib:[{id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}, {id:'Lpip', kind:'char', name:'Pip', stand:'cat girl', desc:'an anthro cat with orange fur', pics:['mPic'], keep:'exact', what:'', art:'3d'}, {id:'Lfrk', kind:'attr', name:'Freckles', stand:'', desc:'light freckles', pics:[], keep:'exact', what:''}, {id:'Lglow', kind:'lora', name:'Glow', stand:'', desc:'', pics:[], keep:'exact', what:'soft glow light', loras:[{name:'glow.safetensors', str:0.8}]}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png', w:180, h:180, thumb:'data:image/png;base64,' + PNG}, mOld:{id:'mOld', kind:'img', name:'old.png', type:'image/png'}}, up:{['mPic|' + R]:'h3deck/h3deck_mPic.png'}};
  await page.addInitScript(([deck, r]) => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(deck)); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, [DECK, R]);
  // the picture in IndexedDB (shared by both apps)
  await page.goto('http://127.0.0.1:8041/reel-5b1e7c94d2a0/');
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
  const v1 = await page.evaluate(() => ({src:document.querySelector('#vA').src, pick:REEL.cur().pick, opts:document.querySelectorAll('#opts .opt').length, next:document.querySelector('#nextBtn').textContent, dis:document.querySelector('#nextBtn').disabled}));
  ok(/render\.test\/view/.test(v1.src) && v1.opts===2 && v1.next==='➕ Next' && !v1.dis, 'a finished option plays in the viewport, two options show, ➕ Next is on (' + JSON.stringify(v1) + ')');
  // tap the other option: it becomes the clip's pick
  const other = await page.evaluate(() => REEL.cur().takes.find(id => id!==REEL.cur().pick)); await page.click(`#opts [data-o="${other}"]`); await page.waitForTimeout(300);
  ok(await page.evaluate(o => REEL.cur().pick===o && document.querySelector('#vA').src.includes(REEL.info(o).url.split('filename=')[1].split('&')[0]), other), 'tapping an option uses it');
  // ➕ Next: carries on from the end
  await page.click('#nextBtn'); await page.waitForTimeout(200); await page.fill('#nxW', 'Mia sits down'); await page.click('#nSeg [data-n="1"]');
  n0 = sent.filter(x => x.g).length; await page.click('#nxGo'); await page.waitForTimeout(2500);
  const g2 = sent.filter(x => x.g).slice(n0), t2 = await eng.evaluate(() => { const t = H3.S.takes[0]; return {prompt:t.prompt, carry:t.carry, cont:!!t.cont}; });
  ok(g2.length===1 && t2.carry && t2.carry.own && t2.carry.src===other && /^\[0s-1s\] The scene keeps carrying on from the moment before\.\n\[1s-\] The room, the objects and the light stay exactly as they were a moment ago\. <Subject 1> sits down$/.test(t2.prompt), '➕ Next carries on from the picked option with the anchor line (' + JSON.stringify(t2) + ')');
  ok(nodes(g2[0].g, 'MiniMaxH3MotionContext').length || nodes(g2[0].g, 'LoadVideo').length, 'its graph loads the clip before as context');
  { const G = g2[0].g, cm = nodes(G, 'ColorMatch'), ref = cm[0] && G[cm[0].inputs.image_ref[0]], src = ref && G[ref.inputs.image[0]];
    ok(cm.length===6 && cm[0].inputs.strength===1 && cm[5].inputs.strength < 0.2 && cm.every(n => n.inputs.method==='mkl') && ref && ref.class_type==='ImageFromBatch' && ref.inputs.batch_index===4095 && src && src.class_type==='GetVideoComponents',
      '🎨 ➕ Next eases its first 1.5 s into the colour of the clip before\'s last frame (' + JSON.stringify([cm.map(n => n.inputs.strength), Object.values(G).map(n => n.class_type).join(',')]) + ')'); }
  // (Jordan 2026-11-22, Tifa: carry-ons opened on a new shot / a reference picture) the pictures only come in after the first 30% of the steps
  { const G = g2[0].g, tr = nodes(G, 'ConditioningSetTimestepRange').map(n => ({a:n.inputs.start, b:n.inputs.end, src:G[n.inputs.conditioning[0]]})), refsOf = n => n ? Object.keys(n.inputs).filter(k => /ref_image_\d/.test(k)).length : -1;
    const early = tr.find(x => x.a===0 && Math.abs(x.b - 0.3) < 1e-6), late = tr.find(x => Math.abs(x.a - 0.3) < 1e-6 && x.b===1);
    ok(early && late && refsOf(early.src)===1 && refsOf(late.src) > 0, '➕ Next brings her pictures in only after the first 30% of the steps (before that only the clip before\'s last frame), so the layout follows the clip before (' + JSON.stringify(tr.map(x => [x.a, x.b, x.src && x.src.class_type, refsOf(x.src)])) + ')'); }
  ok(await page.evaluate(() => REEL.clips().length===2 && REEL.R().cur===1 && REEL.cur().kind==='next'), 'the new clip goes after it and is the current one');
  await finish();
  // back to clip 1 by dragging the wheel to the right
  const wb = await page.evaluate(() => { const r = document.querySelector('#wheel').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; });
  await page.mouse.move(wb.x, wb.y); await page.mouse.down(); for(let k = 1; k <= 8; k++){ await page.mouse.move(wb.x + k * 20, wb.y); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => REEL.R().cur===0), 'dragging the wheel snaps the clip before into the middle');
  ok(await page.evaluate(() => document.querySelector('#nextBtn').textContent==='⇿ Insert'), 'with a clip after it, Next becomes ⇿ Insert');
  // ⇿ Insert
  const ids = await page.evaluate(() => REEL.clips().map(c => [c.kind, c.pick]));
  await page.click('#nextBtn'); await page.waitForTimeout(200); await page.fill('#nxW', 'she pulls out a chair');
  n0 = sent.filter(x => x.g).length; await page.click('#nxGo'); await page.waitForTimeout(2500);
  const g3 = sent.filter(x => x.g).slice(n0), t3 = await eng.evaluate(() => { const t = H3.S.takes[0]; return {gap:t.lead && t.lead.gap && t.lead.gap.src, src:t.lead && t.lead.src, prompt:t.prompt}; });
  ok(g3.length===1 && nodes(g3[0].g, 'LoadVideo').length===2 && t3.gap===ids[0][1] && t3.src===ids[1][1], '⇿ Insert pins the end of clip 1 and the start of clip 2 (' + JSON.stringify([t3, ids]) + ')');
  ok(await page.evaluate(() => REEL.clips().map(c => c.kind).join()==='new,insert,next' && REEL.R().cur===1), 'the inserted clip sits between them');
  await finish();
  // ↻ Redo on the middle clip: lines up with both
  n0 = sent.filter(x => x.g).length; await page.click('#redoBtn'); await page.waitForTimeout(200);
  ok(/Lands between/.test(await page.textContent('#card')), '↻ Redo on a middle clip says it lands between both');
  const w0 = await page.evaluate(() => REEL.cur().words); await page.fill('#rdW', 'She spins around twice'); await page.click('#rdGo'); await page.waitForTimeout(2500);
  const t4 = await eng.evaluate(() => { const t = H3.S.takes[0]; return t.lead && t.lead.gap ? 'gap' : 'other'; });
  ok(t4==='gap' && await page.evaluate(() => REEL.cur().takes.length===2), '↻ Redo makes another fill as a new option of the same clip');
  await finish();
  // ✍ each option shows the words it was made with
  { const tk = await page.evaluate(() => REEL.cur().takes.slice());
    await page.click(`#opts [data-o="${tk[1]}"]`); await page.waitForTimeout(300); const a = await page.textContent('#words');
    await page.click(`#opts [data-o="${tk[0]}"]`); await page.waitForTimeout(300); const b = await page.textContent('#words');
    await page.click('#redoBtn'); await page.waitForTimeout(200); const c = await page.inputValue('#rdW'); await page.click('[data-close]');
    ok(/spins around twice/.test(a) && !/spins/.test(b) && b.length > 0 && c===w0.trim(), '✍ the redo option shows its new words, the first option its own (' + JSON.stringify([a, b, c]) + ')'); }
  // 🎞 a finished option picked again after a rendering one shows in the viewport (it stayed black)
  { const tk = await page.evaluate(() => REEL.cur().takes.slice());
    await page.evaluate(() => { const E = REEL.E(), o = E.info; window._oi = o; E.info = id => id==='tw1' ? {state:'working', pct:5, step:'1/10'} : o(id); const c = REEL.cur(); c.takes.push('tw1'); c.pick = 'tw1'; REEL.refresh(); }); await page.waitForTimeout(400); // (a rendering option picked: the viewport is emptied)
    const xb = await page.evaluate(() => { const b = document.querySelector('#opts [data-o="tw1"] .x'), r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit===b || b.contains(hit); });
    ok(xb, "✕ on a rendering option is on top (the progress text doesn't cover it)");
    ok(await page.evaluate(() => !document.querySelector('#vA').getAttribute('src')), '(an unfinished option empties the viewport)');
    await page.click(`#opts [data-o="${tk[0]}"]`); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !!document.querySelector('#vA').getAttribute('src')), '🎞 picking a finished option again loads it in the viewport');
    await page.evaluate(() => { const E = REEL.E(); E.info = window._oi; const c = REEL.cur(); c.takes = c.takes.filter(x => x!=='tw1'); REEL.refresh(); }); }
  // ↻ Redo on the first clip (nothing before, a clip after): a lead-in that lands on clip 2
  await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300); await page.click('#redoBtn'); await page.waitForTimeout(200);
  ok(/Leads into the clip after/.test(await page.textContent('#card')), '↻ Redo on the first clip leads into the next one');
  await page.click('[data-close]');
  // ✂ Edit: trim the end of clip 1 with the 🪄 blend on
  await page.click('#editBtn'); await page.waitForTimeout(500);
  await page.evaluate(() => { const T = document.querySelector('#edT'), r = T.getBoundingClientRect(); window.__T = r; });
  const tr = await page.evaluate(() => window.__T);
  await page.mouse.move(tr.x + tr.width - 2, tr.y + tr.height / 2); await page.mouse.down(); await page.mouse.move(tr.x + tr.width * 0.8, tr.y + tr.height / 2, {steps:5}); await page.mouse.up(); await page.waitForTimeout(200);
  n0 = sent.filter(x => x.g).length; await page.click('#edGo'); await page.waitForTimeout(2500);
  const kinds0 = await page.evaluate(() => REEL.clips().map(c => c.kind).join());
  const ed = await page.evaluate(() => { const c = REEL.clips()[0]; return {kinds:REEL.clips().map(c => c.kind).join(), n:c.takes.length, pick:c.pick, joined:(c.meta[c.pick] || {}).joined, in:c.in, out:c.out, before:(c.meta[c.pick] || {}).before}; });
  const tk5 = await eng.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return t && t.lead && t.lead.gap && {join:t.lead.gap.join, B:t.lead.B, secs:t.seconds}; }, ed.pick);
  const g5 = sent.filter(x => x.g).slice(n0), gg = g5[0] && g5[0].g, cat = gg && Object.values(gg).some(n => n.class_type==='AudioConcat' || n.class_type==='ImageBatch');
  // (Jordan 2026-11-24: "keep some of these editing tools from making new clips and instead just edit the clips we have") the blend is a new,
  // longer option of clip 1 (its kept frames, then the new part that lands on clip 2), picked, not a 🪄 clip of its own
  ok(g5.length===1 && ed.kinds===kinds0 && !/blend/.test(ed.kinds) && ed.joined==='a' && ed.in===0 && ed.out==null && tk5 && tk5.join && tk5.join.side==='a' && tk5.join.n > 24 && Math.abs(tk5.secs - (tk5.B + tk5.join.n) / 24) < 0.01 && cat,
    '✂ trimming the end blends it into the next clip as a new, longer option of clip 1 (no 🪄 clip between them) (' + JSON.stringify({ed, tk5}) + ')');
  // (the checks below were written for a reel with the 🪄 clip in it: move the blend into a clip of its own again, clip 1 back on its old option)
  await page.evaluate(id => { const cs = REEL.clips(), c = cs[0]; c.takes = c.takes.filter(x => x!==id); const old = c.takes[c.takes.length - 1]; c.pick = old; c.in = 0; c.out = 3; delete c.meta[id];
    REEL.addClip(1, {kind:'blend', words:'blend', takes:[id], pick:id}); REEL.go(0); REEL.refresh(); }, ed.pick); await page.waitForTimeout(300);
  // (Jordan 2026-11-21: "it didn't do anything other than shorten it") the blend runs on an untrimmed clip too
  { await page.evaluate(() => REEL.go(2)); await page.waitForTimeout(400); await page.click('#editBtn'); await page.waitForTimeout(500);
    const chk = await page.evaluate(() => { const b = document.querySelector('#edBl'); if(!b) return false; if(!b.checked) b.click(); return b.checked; });
    const m0 = sent.filter(x => x.g).length; await page.click('#edGo'); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const b = REEL.clips()[2]; return {kinds:REEL.clips().map(c => c.kind).join(), joined:(b.meta[b.pick] || {}).joined, look:!!(b.meta[b.pick] || {}).look, pick:b.pick}; }), gn = sent.filter(x => x.g).length - m0;
    ok(chk && gn===1 && r.kinds==='new,blend,insert,next' && r.joined==='a' && r.look, '🪄 Blend the end on a clip whose end wasn\'t moved still blends (as a new, longer option of that clip) (' + JSON.stringify({chk, gn, r}) + ')');
    // (Jordan 2026-11-21: a blend lit "like a flashlight") a ⇿ / 🪄 part next to a clip made without the ✨ boost LoRAs leaves them out
    { await finish(); const r2 = await page.evaluate(() => { const ids = REEL.clips().map(c => c.pick).filter(id => REEL.info(id).file); return {A:ids[0], B:ids[1]}; });
      const n0 = await eng.evaluate(o => { const T = H3.S.takes; T.find(x => x.id===o.A).boost = false; T.find(x => x.id===o.B).boost = true; return T.length; }, r2);
      const x = await page.evaluate(async o => { const ts = []; const old = window.ReelToast; window.ReelToast = t => ts.push(t); const r = await REEL.E().fill({takeA:o.A, outA:1, takeB:o.B, inB:0, secs:1, words:'x', n:1}); window.ReelToast = old; return {r, ts}; }, r2); await page.waitForTimeout(1500);
      const nb = await eng.evaluate(n0 => ({n:H3.S.takes.length - n0, gap:!!(H3.S.takes[0].lead && H3.S.takes[0].lead.gap), boost:H3.S.takes[0].boost}), n0);
      await eng.evaluate(o => { const T = H3.S.takes; T.find(x => x.id===o.A).boost = true; }, r2);
      ok(nb.n===1 && nb.gap && nb.boost===false, '⇿ a part next to a clip made without the ✨ boost is made without it too (' + JSON.stringify({x, nb}) + ')'); }
    await page.evaluate(id => { const c = REEL.clips()[2]; c.takes = c.takes.filter(x => x!==id); delete c.meta[id]; c.pick = c.takes[c.takes.length - 1]; c.in = 0; c.out = null; REEL.refresh(); }, r.pick); await page.waitForTimeout(300); }
  await finish();
  // 🎨 Change it on clip 2
  await page.evaluate(() => REEL.go(2)); await page.waitForTimeout(300); await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edM [data-m="change"]');
  await page.fill('#edW', 'she pulls out a red chair'); await page.evaluate(() => { const s = document.querySelector('#edS'); s.value = 0.5; s.oninput({target:s}); });
  n0 = sent.filter(x => x.g).length; await page.click('#edCGo'); await page.waitForTimeout(2500);
  const t6 = await eng.evaluate(() => { const t = H3.S.takes[0]; return t.redo && {str:t.redo.str, prompt:t.prompt}; });
  ok(t6 && t6.str===0.5 && /red chair/.test(t6.prompt) && await page.evaluate(() => REEL.cur().takes.length===3), '🎨 Change it is a redo of the stretch at that strength, as a new option (' + JSON.stringify(t6) + ')');
  await finish();
  // 🪄 Smooth on clip 2: H3 Deck's Smooth with 📐 spacing, first and last frames kept, as a new option
  await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edM [data-m="smooth"]');
  ok(await page.evaluate(() => !document.querySelector('#edSm').hidden && document.querySelector('#edT').hidden), '🪄 Edit has a Smooth tab');
  const nT7 = await page.evaluate(() => REEL.cur().takes.length); n0 = sent.filter(x => x.g).length;
  await page.click('#edSGo'); await page.waitForFunction(n => REEL.cur().takes.length > n, nT7, {timeout:40000}).catch(() => {}); await page.waitForTimeout(1500);
  const t7 = await eng.evaluate(() => { const t = H3.S.takes[0]; return t.sm && {every:t.sm.every, spc:t.sm.spc, keys:(t.sm.keys || []).length, first:t.sm.keys && t.sm.keys[0], last:t.sm.keys && t.sm.keys[t.sm.keys.length - 1], up:!!t.up, loop:t.sm.loop}; });
  const g7 = sent.filter(x => x.g).slice(n0);
  ok(t7 && !t7.up && !t7.loop && g7.length >= 1 && await page.evaluate(n => REEL.cur().takes.length===n + 1, nT7), '🪄 Smooth sends a smoothing take (no regenerate, no loop) as a new option (' + JSON.stringify(t7) + ')');
  { const fin = await eng.evaluate(() => { const t = H3.S.takes[0]; return !!t.fin; }), G = JSON.stringify(g7.map(x => x.g)), sp = /SplitSigmas/.test(G), pk = /prism_?pika/i.test(G);
    ok(fin && sp && pk, '🪄 Smooth keeps the 🔀 finish on PIKA like the clip it smooths (' + JSON.stringify({fin, sp, pk}) + ')'); }
  // 🪄 the clip after a smoothed clip doesn't say it may jump (Smooth keeps the first and last frames)
  { const w = await page.evaluate(async () => { const i = REEL.S().reels.find(r => r.id===REEL.S().open).cur, cs = REEL.clips(), c = cs[i], N = cs[i + 1]; if(!N || !N.pick) return {skip:1};
      const old = c.pick, sm = c.takes[c.takes.length - 1], keep = Object.assign({}, (N.meta || {})[N.pick] || {}); N.meta = N.meta || {}; N.meta[N.pick] = Object.assign({}, keep, {after:old});
      c.pick = sm; REEL.go(i + 1); REEL.refresh(); await new Promise(r => setTimeout(r, 300)); const t = document.querySelector('#warnBox').textContent;
      N.meta[N.pick] = keep; c.pick = old; REEL.go(i); REEL.refresh(); return {same:(c.meta[sm] || {}).same===old, t}; });
    ok(w.skip || (w.same && !/may jump/.test(w.t)), '🪄 the clip after a smoothed option doesn\'t say it may jump (' + JSON.stringify(w) + ')'); }
  await finish();
  // ⇿ / ➕ next to a 🪄 smoothed clip still get the PIKA finish (Jordan 2026-11-21: Insert ran 20 vanilla steps)
  { const r = await page.evaluate(async () => { const c = REEL.cur(), sm = c.takes[c.takes.length - 1], E = REEL.E(), a = REEL.clips()[0].pick;
      const f = await E.fill({takeA:a, outA:1, takeB:sm, inB:0, secs:1, words:'Mia waves', n:1}), k = await E.carry({take:sm, at:1, words:'Mia waves', n:1}); return {sm, f:(f.ids || [])[0], k:(k.ids || [])[0]}; });
    const t = await eng.evaluate(x => { const T = id => H3.S.takes.find(t => t.id===id) || {}; const o = {smSrc:!!T(x.sm).sm, f:!!T(x.f).fin, k:!!T(x.k).fin, fsm:!!T(x.f).sm, ksm:!!T(x.k).sm}; H3.S.takes = H3.S.takes.filter(t => t.id!==x.f && t.id!==x.k); return o; }, r);
    ok(t.smSrc && t.f && t.k && !t.fsm && !t.ksm, '⇿ Insert / ➕ Next from a 🪄 smoothed option keep the PIKA finish and aren\'t smoothed again (' + JSON.stringify(t) + ')'); }
  // 🎬 Final pass: ✨ High quality on every clip's picked option with Prism Pika, chained clip to clip, picked as a new option
  { await page.evaluate(() => { const cs = REEL.clips(), c = cs[cs.length - 1]; c.out = Math.round((REEL.info(c.pick).secs - 0.5) * 24) / 24; REEL.refresh(); });
    const before = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, n:c.takes.length, in:c.in || 0, out:c.out == null ? null : c.out})));
    const w0 = await page.evaluate((async () => { const out = []; for(let i = 1; i < REEL.clips().length; i++){ REEL.go(i); await new Promise(r => setTimeout(r, 250)); out.push(/may jump/.test(document.querySelector('#warnBox').textContent)); } REEL.go(0); await new Promise(r => setTimeout(r, 250)); return out; }));
    await page.click('#finBtn'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => /Final pass on \d+ clip/.test(document.querySelector('#fnGo').textContent)), '🎬 Final pass sheet opens');
    ok(await page.evaluate(() => !/Upscale LoRA/.test(document.querySelector('#sheet').textContent) && !!document.querySelector('.lsl[data-up] [data-sa]') && !document.querySelector('.lsl [data-sd]')), '🎨 the Final pass sheet has no Upscale LoRA row and has an optional Style LoRA (no halves: one model)');
    await page.click('.lsl [data-sa]'); await page.waitForTimeout(150); await page.selectOption('.lsl [data-si="0"] [data-sn]', 'minimax_h3_anime_style.safetensors'); await page.waitForTimeout(150); await page.fill('.lsl [data-si="0"] [data-sw]', 'up_style_words');
    await page.click('#fnGo'); await page.waitForTimeout(4000);
    { const u = await eng.evaluate(() => H3.S.takes.filter(t => t.up && t.up.scale===1.5).map(t => ({str:t.up.str, loras:(t.loras || []).filter(l => /anime_style/.test(l.name)).map(l => l.str + ':' + l.words)})));
      ok(u.length >= 1 && u.every(x => x.str===0 && x.loras.length===1 && x.loras[0]==='0.8:up_style_words'), '🎬 the ✨ pass has the Upscale LoRA off and the style LoRA with its words (' + JSON.stringify(u) + ')');
      ok(await page.evaluate(() => (REEL.S().upSl || [])[0] && REEL.S().upSl[0].name==='minimax_h3_anime_style.safetensors'), 'the pass\'s style LoRA is remembered for next time'); }
    const after = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, n:c.takes.length, fin:!!((c.meta || {})[c.pick] || {}).fin, in:c.in, out:c.out})));
    const ups = await eng.evaluate(ids => ids.map(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {src:t.redo && t.redo.src, scale:t.up && t.up.scale, unet:t.up && t.up.unet, den:t.up && t.up.den, chain:t.up && t.up.chain && {idx:t.up.chain.idx, prev:t.up.chain.prev, dir:t.up.chain.dir}, off:t.descOff}; }), after.map(x => x.pick));
    const chained = ups.slice(1).every((u, i) => u.chain && u.chain.idx===i + 1 && u.chain.prev===after[i].pick && u.chain.dir===ups[0].chain.dir) && ups[0].chain && ups[0].chain.idx===0;
    ok(after.every((x, i) => x.n===before[i].n + 1 && x.fin && x.in===0 && x.out===null) && ups.every((u, i) => u.src===before[i].pick && u.scale===1.5 && /prismPIKA/.test(u.unet || '') && u.den===0.9) && chained,
      '🎬 every clip gets a ✨ Prism Pika option made from its picked one, picked, each carrying on from the one before (' + JSON.stringify({before, after, ups}) + ')');
    await finish();
    // ⬆ upscaled options and clips show a badge
    const bd = await page.evaluate(() => ({wi:document.querySelectorAll('#wheel .upb').length, opt:document.querySelectorAll('#opts .opt.on .upb').length, all:REEL.clips().every(c => c.up && REEL.isUp(c, c.pick))}));
    ok(bd.wi >= 1 && bd.opt===1 && bd.all, '⬆ an upscaled clip shows "⬆ Upscaled" in the wheel and ⬆ on its option (' + JSON.stringify(bd) + ')');
    { const w = await page.evaluate((async () => { const out = []; for(let i = 1; i < REEL.clips().length; i++){ REEL.go(i); await new Promise(r => setTimeout(r, 250)); out.push(/may jump/.test(document.querySelector('#warnBox').textContent)); } REEL.go(0); await new Promise(r => setTimeout(r, 250)); return out; }));
      ok(JSON.stringify(w)===JSON.stringify(w0), '⬆ the final pass doesn\'t add "made for another option of the clip before" warnings (' + JSON.stringify({w0, w}) + ')'); }
    // ⇿ / ➕ next to a ✨ clip copy the settings of the take the ✨ was made from, not the pass's own vanilla model (Jordan 2026-11-21)
    { const ids = await page.evaluate(async () => { const cs = REEL.clips(), E = REEL.E(); const f = await E.fill({takeA:cs[0].pick, outA:1, takeB:cs[1].pick, inB:0, secs:1, words:'Mia waves', n:1});
        const k = await E.carry({take:cs[1].pick, at:1.5, words:'Mia waves', n:1}); return {f:(f.ids || [])[0], k:(k.ids || [])[0], src:cs[1].pick}; });
      const r = await eng.evaluate(x => { const T = id => H3.S.takes.find(t => t.id===id) || {}, up = T(x.src), root = T(up.redo && up.redo.src); return {root:{m:root.model, w:root.w, fin:!!root.fin}, up:{m:up.model, w:up.w}, f:{m:T(x.f).model, w:T(x.f).w, fin:!!T(x.f).fin}, k:{m:T(x.k).model, fin:!!T(x.k).fin}}; }, ids);
      ok(r.root.m && r.f.m===r.root.m && r.f.w===r.root.w && r.f.fin===r.root.fin && r.k.m===r.root.m && r.k.fin===r.root.fin, '⇿ Insert / ➕ Next beside a ✨ clip use the original take\'s model and size, not the ✨ pass\'s (' + JSON.stringify(r) + ')');
      await eng.evaluate(x => { H3.S.takes = H3.S.takes.filter(t => t.id!==x.f && t.id!==x.k); }, ids); }
    // 🪄 Smooth on a ✨ pick uses the original take's model, size and PIKA finish, and its option isn't marked ⬆ upscaled
    { const c0 = await page.evaluate(() => { const c = REEL.cur(); return {pick:c.pick, n:c.takes.length}; }); const n1 = await eng.evaluate(() => H3.S.takes.length);
      await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edM [data-m="smooth"]'); await page.click('#edSGo');
      await page.waitForFunction(n => REEL.cur().takes.length > n, c0.n, {timeout:40000}).catch(() => {}); await page.waitForTimeout(1500);
      const r = await page.evaluate(() => { const c = REEL.cur(), id = c.takes[c.takes.length - 1], m = c.meta[id] || {}; return {id, fin:!!m.fin, src:m.src || null, reup:m.reup}; });
      const t = await eng.evaluate(x => { const T = id => H3.S.takes.find(t => t.id===id) || {}, up = T(x.pick), root = T(up.redo && up.redo.src), s = H3.S.takes[0]; return {root:{m:root.model, w:root.w, fin:!!root.fin}, up:{m:up.model, w:up.w}, s:{m:s.model, w:s.w, fin:!!s.fin, sm:!!s.sm}}; }, c0);
      ok(t.s.sm && t.s.m===t.root.m && t.s.w===t.root.w && t.s.fin===t.root.fin && !r.fin && !r.src && !r.reup, '🪄 Smooth on a ✨ pick uses the original take\'s model, size and finish, and isn\'t upscaled by itself (' + JSON.stringify({r, t}) + ')');
      await page.evaluate(x => { const c = REEL.cur(); c.takes = c.takes.filter(id => id!==x.id); delete c.meta[x.id]; c.pick = x.pick; REEL.refresh(); }, Object.assign({}, c0, {id:r.id}));
      await eng.evaluate(n => { H3.S.takes = H3.S.takes.slice(H3.S.takes.length - n); }, n1); await page.keyboard.press('Escape').catch(() => {}); await page.click('[data-close]').catch(() => {}); }
    // ⬆ (Jordan 2026-11-24: upscaling by hand only) a new option of an upscaled clip is NOT upscaled by itself; ⬆ Upscale this option makes
    // N upscales of it (different seeds), each a new ⬆ option, and the pick stays
    { const r = await page.evaluate(async () => { const c = REEL.cur(), src = c.meta[c.pick].src; const x = await REEL.E().again({take:src, words:'Mia waves', n:1}); const id = (x.ids || [])[0];
        REEL.addTakes(c, [id], {}, 'Mia waves'); c.pick = id; REEL.refresh(); return {id, reup:c.meta[id].reup, n:c.takes.length}; });
      await finish(); await page.evaluate(() => REEL.reup()); await page.waitForTimeout(2500);
      const r2 = await page.evaluate(() => { const c = REEL.cur(); return {pick:c.pick, n:c.takes.length}; });
      ok(!r.reup && r2.pick===r.id && r2.n===r.n, '⬆ a new option of an upscaled clip is not upscaled by itself (' + JSON.stringify({r, r2}) + ')');
      await page.evaluate(() => REEL.refresh()); await page.waitForTimeout(300); const n1 = await eng.evaluate(() => H3.S.takes.length);
      const pv = await page.evaluate(() => { const cs = REEL.clips(), i = cs.indexOf(REEL.cur()), P = cs[i - 1], d = P && REEL.info(P.pick).secs; return {i, kind:REEL.cur().kind, pick:P && P.pick, at:P && (P.out != null ? Math.min(P.out, d) : d)}; });
      const g0 = sent.filter(x => x.g).length;
      await page.click('#upOne'); await page.waitForTimeout(300); await page.click('#upN [data-v="3"]'); await page.click('#upGo');
      for(let k = 0; k < 40 && sent.filter(x => x.g).length < g0 + 3; k++) await page.waitForTimeout(500); await page.waitForTimeout(500);
      const r3 = await page.evaluate(() => { const c = REEL.cur(), nw = c.takes.slice(-3); return {pick:c.pick, n:c.takes.length, nw, m:nw.map(id => c.meta[id] || {}).map(m => ({fin:!!m.fin, src:m.src}))}; });
      const t3 = await eng.evaluate(ids => ids.map(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {src:t.redo && t.redo.src, scale:t.up && t.up.scale, seed:t.seed}; }), r3.nw);
      ok(r3.pick===r.id && r3.n===r.n + 3 && r3.m.every(m => m.fin && m.src===r.id) && t3.every(t => t.src===r.id && t.scale===1.5) && new Set(t3.map(t => t.seed)).size===3 && await eng.evaluate(() => H3.S.takes.length) === n1 + 3,
        '⬆ Upscale this option ×3 makes three ⬆ options of it with different seeds; the pick stays (' + JSON.stringify({r3, t3}) + ')');
      await page.evaluate(x => { const c = REEL.cur(); c.takes = c.takes.filter(id => !x.includes(id)); x.forEach(id => delete c.meta[id]); REEL.refresh(); }, r3.nw);
      await finish(); }
    // ⬆ (Jordan 2026-11-24: "it needs to use context nodes and the first frame of the previous video so it still lines up properly. Same with
    // color correction") on a clip with one before it: Motion Context from the clip before's frames up to its end + colour match
    { const pv = await page.evaluate(() => { const cs = REEL.clips(), i = cs.findIndex((c, k) => k > 0 && c.kind!=='new' && c.kind!=='upload' && c.pick && REEL.info(c.pick).state==='done' && cs[k - 1].pick && REEL.info(cs[k - 1].pick).state==='done');
        const P = cs[i - 1], d = P && REEL.info(P.pick).secs, was = cs.indexOf(REEL.cur()); REEL.go(i); return {was, i, pick:P && P.pick, at:P && (P.out != null ? Math.min(P.out, d) : d), n:cs[i].takes.length, cin:cs[i].in || 0}; }); await page.waitForTimeout(400);
      await page.click('#upOne'); await page.waitForTimeout(300); await page.click('#upN [data-v="1"]'); await page.click('#upGo'); await page.waitForTimeout(2500);
      const nid = await page.evaluate(() => { const c = REEL.cur(); return c.takes[c.takes.length - 1]; });
      const G = await eng.evaluate(([id, pick]) => { const t = H3.S.takes.find(x => x.id===id), P = H3.S.takes.find(x => x.id===pick), pf = P && (P.final || (P.pieces[0] || {}).file);
        const g = Object.values(H3.upGraph(t, H3.PC[t.pc].oi, {}).g), C = c => g.filter(n => n.class_type===c), mc = C('MiniMaxH3MotionContext')[0];
        return {chain:t.up.chain, mc:!!(mc && mc.inputs.context_frames), cm:C('ColorMatch').length, at:C('Video Slice').map(n => n.inputs.duration), prev:C('LoadVideo').filter(n => pf && n.inputs.file.includes(pf.filename)).length}; }, [nid, pv.pick]);
      const m = await page.evaluate(id => REEL.cur().meta[id], nid);
      ok(pv.i > 0 && G.mc && G.cm >= 6 && G.at.filter(a => Math.abs(a - pv.at) < 0.01).length >= 2 && G.prev >= 2 && G.chain.prev===pv.pick && m.fin && m.trim && m.trim.in===0,
        '⬆ Upscale this option carries on from the clip before (Motion Context from its frames up to its end + colour match toward its last frame) (' + JSON.stringify({pv, G, m}) + ')');
      await page.evaluate(id => { const c = REEL.cur(); c.takes = c.takes.filter(x => x!==id); delete c.meta[id]; REEL.refresh(); }, nid); await page.evaluate(w => REEL.go(w), pv.was); await page.waitForTimeout(400); await finish(); }
    // ✨ (Jordan 2026-11-27: "generate with one but then hires with minimax") ⬆ Upscale with MiniMax = vanilla H3 Reference does the ✨ pass,
    // on its own 20-step curve from the strength; the pick is remembered and PRISM PIKA stays the default
    for(const hm of ['minimax', 'triprism', 'pika']){ await page.click('#upOne'); await page.waitForTimeout(300); await page.click('#upHm [data-hm="' + hm + '"]'); await page.click('#upN [data-v="1"]');
      const txt = await page.evaluate(() => document.querySelector('.hmN').textContent); await page.click('#upGo'); await page.waitForTimeout(2500);
      const nid = await page.evaluate(() => { const c = REEL.cur(); return c.takes[c.takes.length - 1]; });
      const G = await eng.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); const g = Object.values(H3.upGraph(t, H3.PC[t.pc].oi, {}).g);
        return {un:g.filter(n => n.class_type==='UNETLoader').map(n => n.inputs.unet_name), sg:g.filter(n => n.class_type==='ManualSigmas').map(n => String(n.inputs.sigmas).split(',').length - 1)}; }, nid);
      ok(txt===({minimax:'MiniMax', triprism:'TriPRISM'}[hm] || 'Prism Pika') && G.un.length && G.un.every(u => (hm==='minimax' ? /minimax_h3_ref2va/ : hm==='triprism' ? /TriPRISM/ : /prismPIKA/).test(u)) && G.sg.length && (hm==='minimax' ? G.sg.every(n => n > 4) : G.sg.every(n => n <= 8)),
        '✨ ⬆ Upscale with ' + hm + ' runs the pass on that model ' + JSON.stringify({txt, G}));
      await page.evaluate(id => { const c = REEL.cur(); c.takes = c.takes.filter(x => x!==id); delete c.meta[id]; REEL.refresh(); }, nid); await finish(); }
    ok(await page.evaluate(() => { REEL.S().upHm = 'pika'; return true; }), '✨ back to PRISM PIKA for the rest');
    // ↩ Back to the originals
    await page.click('#finBtn'); await page.waitForTimeout(300); await page.click('#fnBack'); await page.waitForTimeout(400);
    const back = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, up:!!c.up, cur:c===REEL.cur(), in:c.in || 0, out:c.out == null ? null : c.out})));
    ok(back.every((x, i) => !x.up && (x.cur || (x.pick===before[i].pick && x.in===before[i].in && x.out===before[i].out))) && before.some((x, i) => !back[i].cur && (x.in || x.out!=null)), '↩ Back to the originals picks each clip\'s option from before the final pass, with the trim it had (' + JSON.stringify({back, before}) + ')');
    // ⬆ …and once the clips around it are back on their originals, a new option stays as it is (Jordan 2026-11-20)
    { const r = await page.evaluate(async () => { const c = REEL.cur(), base = c.pick; const x = await REEL.E().again({take:base, words:'Mia waves', n:1}); const id = (x.ids || [])[0];
        REEL.addTakes(c, [id], {}, 'Mia waves'); return {id, reup:c.meta[id].reup, n:c.takes.length}; });
      await finish(); await page.evaluate(() => REEL.reup()); await page.waitForTimeout(2500);
      const r2 = await page.evaluate(id => ({was:REEL.cur().meta[id].reup, n:REEL.cur().takes.length}), r.id);
      ok(!r.reup && r2.n===r.n, '⬆ a new option next to clips picked on their originals is not upscaled (' + JSON.stringify({r, r2}) + ')'); }
    await page.evaluate(b => { REEL.clips().forEach((c, i) => { c.pick = b[i].pick; c.up = false; }); REEL.refresh(); }, before); await page.waitForTimeout(300); }
  // 🧵 Blend the seams (Jordan 2026-11-24: "The shadows change fairly hard on the seam"): H3 Deck's ⬆ Upscale track seams. Runs of clips
  // without a new-shot cut go to the PC joined, with each join repainted (1 s of both clips pinned each side); ≤3 clips a job, the joins
  // between jobs in a second round; each clip then picks its own stretch of the result
  { await finish(); const b0 = await page.evaluate(() => { const cs = REEL.clips(); return {kinds:cs.map(c => c.kind).join(), g:REEL.seamGroups().map(g => g.length), cs:cs.map(c => ({id:c.id, pick:c.pick, in:c.in || 0, out:c.out, n:c.takes.length, d:REEL.info(c.pick).secs}))}; });
    const g0 = sent.filter(x => x.g).length;
    await page.click('#finBtn'); await page.waitForTimeout(300); await page.click('#smLen [data-v="8"]'); await page.click('#smGo'); await page.waitForTimeout(3000);
    const gA = sent.filter(x => x.g).slice(g0).map(x => x.g), zA = await page.evaluate(() => JSON.parse(JSON.stringify(REEL.R().seam)));
    const shape = G => { const N = Object.values(G); return {cat:N.filter(n => n.class_type==='ConcatenateVideo').length, vids:N.filter(n => n.class_type==='Video Slice').length, guides:N.filter(n => n.class_type==='MiniMaxH3AddGuide').length, unet:(N.find(n => n.class_type==='UNETLoader') || {inputs:{}}).inputs.unet_name}; };
    const want = b0.g.reduce((a, n) => { let k = 0; for(let i = 0; i < n; i += 3) if(Math.min(3, n - i) > 1) k++; return a + k; }, 0);
    ok(zA.state==='A' && zA.half===8 && zA.jobs.length===want && gA.length===want && gA.map(shape).every(x => x.cat===1 && x.guides >= 8) && (b0.g.some(n => n > 3) ? zA.B && zA.B.length : !zA.B),
      '🧵 Blend the seams sends each run of clips (≤3 a job) joined, with its joins repainted between pinned frames (' + JSON.stringify({b0:{kinds:b0.kinds, g:b0.g}, zA:{state:zA.state, jobs:zA.jobs.length, B:zA.B}, gA:gA.map(shape)}) + ')');
    await finish(); await page.evaluate(() => REEL.seamTick()); await page.waitForTimeout(2500);
    const zB = await page.evaluate(() => JSON.parse(JSON.stringify(REEL.R().seam)));
    await finish(); await page.evaluate(() => REEL.seamTick()); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const z = REEL.R().seam; return {state:z.state, jobs:z.jobs.map(j => ({id:j.id, round:j.round, n:j.bounds.length})), cs:REEL.clips().map(c => ({pick:c.pick, in:c.in || 0, out:c.out, n:c.takes.length, seam:!!(c.meta[c.pick] || {}).seam}))}; });
    const inG = new Set(b0.g.length ? [].concat(...(await page.evaluate(() => REEL.seamGroups().map(g => g.map(c => c.id))))) : []);
    const last = {}; r.jobs.forEach(j => last[j.round] = j);
    ok(r.state==='done' && r.cs.every((c, i) => !inG.has(b0.cs[i].id) || (c.seam && r.jobs.some(j => j.id===c.pick) && Math.abs((c.out - c.in) - ((b0.cs[i].out != null ? Math.min(b0.cs[i].out, b0.cs[i].d) : b0.cs[i].d) - b0.cs[i].in)) < 0.05)) && (!zB.B || zB.state==='B'),
      '🧵 when the jobs are done each clip picks its own stretch of the blended video, same length as before (round 2 for the joins between jobs) (' + JSON.stringify({zB:{state:zB.state}, r}) + ')');
    await page.click('[data-close]').catch(() => {});
    await page.evaluate(b => { REEL.clips().forEach((c, i) => { c.pick = b[i].pick; c.in = b[i].in; c.out = b[i].out; }); REEL.R().seam = null; REEL.refresh(); }, b0.cs); await page.waitForTimeout(300); }
  // 🔁 Loop the whole reel (Jordan 2026-11-25): H3 Deck's 🔁 Loop the whole track: the LAST clip then the FIRST joined on a PC with the
  // 🧵 seam repainted at that turn; only those two clips get their stretch back as a new option; ▶ Play all on repeat goes back to clip 1
  { await finish(); const b0 = await page.evaluate(() => REEL.clips().map(c => ({id:c.id, pick:c.pick, in:c.in || 0, out:c.out, n:c.takes.length, d:REEL.info(c.pick).secs})));
    const g0 = sent.filter(x => x.g).length;
    await page.click('#finBtn'); await page.waitForTimeout(300); await page.click('#lpRep'); await page.click('#lpGo'); await page.waitForTimeout(3000);
    const gs = sent.filter(x => x.g).slice(g0).map(x => x.g), z = await page.evaluate(() => JSON.parse(JSON.stringify(REEL.R().loopR || null)));
    const G = gs[0] || {}, N = Object.values(G), files = N.filter(n => n.class_type==='LoadVideo').map(n => n.inputs.file || n.inputs.video);
    const f = await page.evaluate(ids => ids.map(id => (REEL.info(id).file || {}).filename), [b0[b0.length - 1].pick, b0[0].pick]);
    ok(z && z.state==='run' && gs.length===1 && N.filter(n => n.class_type==='ConcatenateVideo').length===1 && N.filter(n => n.class_type==='MiniMaxH3AddGuide').length >= 8
      && z.bounds.length===2 && z.bounds[0].clip===b0[b0.length - 1].id && z.bounds[1].clip===b0[0].id && files.length >= 2 && String(files[0]).includes(f[0]) && String(files[1]).includes(f[1]),
      '🔁 Loop the whole reel sends one job: the last clip then the first, joined, the turn repainted between pinned frames (' + JSON.stringify({z, n:gs.length, files, f}) + ')');
    await finish(); await page.evaluate(() => REEL.loopTick()); await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const z = REEL.R().loopR; return {state:z.state, id:z.id, S:REEL.S().allRep, cs:REEL.clips().map(c => ({pick:c.pick, in:c.in || 0, out:c.out, n:c.takes.length}))}; });
    const L = b0.length - 1, len = b => (b.out != null ? Math.min(b.out, b.d) : b.d) - b.in;
    ok(r.state==='done' && r.S===true && r.cs[0].pick===r.id && r.cs[L].pick===r.id && Math.abs((r.cs[L].out - r.cs[L].in) - len(b0[L])) < 0.05 && Math.abs((r.cs[0].out - r.cs[0].in) - len(b0[0])) < 0.05
      && Math.abs(r.cs[0].in - len(b0[L])) < 0.05 && r.cs.slice(1, L).every((c, i) => c.pick===b0[i + 1].pick && c.n===b0[i + 1].n),
      '🔁 when it is done the last and first clips pick their own stretch of the loop (same lengths), the clips between are untouched, ▶ repeat is on (' + JSON.stringify({r, b0}) + ')');
    await page.click('[data-close]').catch(() => {});
    await page.evaluate(b => { REEL.clips().forEach((c, i) => { c.pick = b[i].pick; c.in = b[i].in; c.out = b[i].out; }); REEL.R().loopR = null; REEL.S().allRep = false; REEL.refresh(); }, b0); await page.waitForTimeout(300); }
  // ⬇ Export the reel: the picked option of every clip, trimmed, in order, joined on the PC; 📲 Save when done
  { await page.click('#finBtn'); await page.waitForTimeout(300); await page.click('#fnExp'); await page.waitForTimeout(2500);
    const cs = await page.evaluate(() => REEL.clips().map(c => { const I = REEL.info(c.pick); return {f:I.file && I.file.filename, a:c.in || 0}; }));
    const b = exps[exps.length - 1] || {clips:[]}; let at = 0;
    const good = b.clips.length===cs.length && b.clips.every((x, i) => { const r = x.filename===cs[i].f && x.in===cs[i].a && Math.abs(x.at - at) < 1e-6 && x.track===0; at += x.out - x.in; return r; }) && b.canvas && b.canvas[0] > b.canvas[1];
    ok(good && await page.evaluate(() => !!document.querySelector('#fnSave')), '⬇ Export sends every clip\'s picked option in order and offers 📲 Save when done (' + JSON.stringify({b, cs}) + ')');
    // the first clip's PC is off: the other (reachable) PC joins them, since both share the Dropbox output folder
    { const x = await page.evaluate(async () => { const E = REEL.E(), p0 = REEL.info(REEL.clips()[0].pick).pcUrl, old = E.pcs;
        E.pcs = () => [{name:'Render', url:p0, online:false}, {name:'Main', url:'http://main.test', online:true}]; const n = document.querySelector('#fnExp'); REEL.R().exp = null; n.click(); await new Promise(r => setTimeout(r, 1500)); E.pcs = old; return {p0}; });
      const b2 = exps[exps.length - 1] || {}; ok((b2._host && x.p0.indexOf(b2._host)!==0 && b2.clips.length===b.clips.length), '⬇ Export goes to a reachable PC when the first clip\'s PC is off (' + JSON.stringify({x, host:b2._host}) + ')'); }
    await page.click('[data-close]'); await page.waitForTimeout(300); }
  // ▶ Play all
  await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300); await page.click('#allBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#allBtn').textContent==='■ Stop'), '▶ Play all starts'); await page.click('#allBtn');
  ok(await page.evaluate(() => { const r = REEL.R(), keep = r.clips, cur = r.cur; r.clips = [{id:'cx', kind:'new', words:'Mia waves', takes:[], pick:null}]; const p = REEL.redoPlan(0); r.clips = keep; r.cur = cur; return !p.err && /fresh/.test(p.how); }), '↻ Redo on a clip with no options left makes it fresh from its words');
  { const p = await page.evaluate(() => { const r = REEL.R(), keep = r.clips, cur = r.cur; r.clips = [{id:'ca', kind:'new', words:'Mia waves', takes:[], pick:null}, {id:'cb', kind:'new', words:'Mia sits', takes:[], pick:null}]; const p = REEL.redoPlan(1); r.clips = keep; r.cur = cur; return p; });
    ok(!p.err && !/Carries on/.test(p.how) && /fresh/.test(p.how), '✍ ↻ Redo on a ✍ New clip after another clip makes a new clip, not a carry-on (' + (p.err || p.how) + ')'); }
  // ⏯ the viewport: a tap pauses / plays, a drag scrubs; the wheel no longer plays (the fake PC can't serve byte ranges, so the
  // scrub's target time is read from its label rather than the video)
  { await page.evaluate(() => { const v = document.querySelector('#vA'); v.muted = true; return v.play().catch(() => {}); }); await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const el = document.querySelector(`#wheel .wi[data-i="${REEL.R().cur}"]`).getBoundingClientRect(); return {x:el.x + el.width / 2, y:el.y + el.height / 2}; });
    await page.mouse.click(box.x, box.y); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.querySelector('#vA').paused), '⏯ tapping the current clip on the wheel no longer pauses it');
    const vb = await page.evaluate(() => { const r = document.querySelector('#view').getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; });
    await page.mouse.click(vb.x + vb.w / 2, vb.y + vb.h / 2); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelector('#vA').paused), '⏯ tapping the viewport pauses the clip');
    await page.mouse.click(vb.x + vb.w / 2, vb.y + vb.h / 2); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.querySelector('#vA').paused), '⏯ tapping it again plays');
    await page.evaluate(() => { const v = document.querySelector('#vA'); v.pause(); v.currentTime = 0; }); await page.waitForTimeout(200);
    const dur = await page.evaluate(() => { const v = document.querySelector('#vA'); return Math.min(+v.dataset.b || v.duration, v.duration) - (+v.dataset.a || 0); });
    await page.mouse.move(vb.x + 20, vb.y + vb.h / 2); await page.mouse.down(); for(let k = 1; k <= 6; k++){ await page.mouse.move(vb.x + 20 + k * vb.w * 0.08, vb.y + vb.h / 2); await page.waitForTimeout(40); }
    const mid = await page.evaluate(() => ({t:parseFloat(document.querySelector('#scrubT').textContent), lab:!document.querySelector('#scrubT').hidden})); await page.mouse.up(); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({paused:document.querySelector('#vA').paused, lab:document.querySelector('#scrubT').hidden}));
    ok(mid.lab && Math.abs(mid.t - 0.48 * dur) < 0.25 * dur && after.paused && after.lab, '👆 dragging across the viewport scrubs it (' + JSON.stringify({dur, mid, after}) + ')');
    // …and dragging on past the end stays on the last frame, stopped (Jordan 2026-11-20: it jumped back to the start)
    await page.mouse.move(vb.x + 10, vb.y + vb.h / 2); await page.mouse.down(); for(let k = 1; k <= 8; k++){ await page.mouse.move(vb.x + 10 + k * vb.w * 0.2, vb.y + vb.h / 2); await page.waitForTimeout(60); }
    await page.waitForTimeout(500); const endT = await page.evaluate(() => ({t:parseFloat(document.querySelector('#scrubT').textContent), paused:document.querySelector('#vA').paused})); await page.mouse.up(); await page.waitForTimeout(500);
    const endA = await page.evaluate(() => ({paused:document.querySelector('#vA').paused}));
    ok(Math.abs(endT.t - (dur - 0.05)) < 0.1 && endT.paused && endA.paused, '👆 dragging past the end stays at the end, stopped (' + JSON.stringify({dur, endT, endA}) + ')'); }
  // 📚 Library tab: make a character here, put her in the reel
  await page.click('#tabs [data-tab="lib"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.querySelector('#libTab').hidden && document.querySelector('#reelTab').hidden && /Mia/.test(document.querySelector('#libAll').textContent)), '📚 the Library tab lists the characters');
  await page.click('#libAll [data-ch="new"]'); await page.waitForTimeout(200); await page.fill('#chN', 'Zoe'); await page.fill('#chD', 'short black hair');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#chAdd')]); await fc.setFiles(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-192.png')); await page.waitForTimeout(300);
  await page.click('#chGo'); await page.waitForTimeout(1200);
  const zo = await page.evaluate(() => { const z = REEL.E().lib().find(x => x.name==='Zoe'); return z && {reel:z.reel, pics:z.pics.length, inReel:REEL.R().cast.includes(z.id), card:/Zoe/.test(document.querySelector('#libIn').textContent)}; });
  ok(zo && zo.reel && zo.pics===1 && zo.inReel && zo.card, '＋ New makes a character with her picture and puts her in this reel (' + JSON.stringify(zo) + ')');
  await page.evaluate(() => { REEL.R().cast = REEL.R().cast.filter(x => x!=='Lmia'); });
  await page.click('#libAll [data-ch="Lmia"]'); await page.waitForTimeout(200); await page.click('#chIn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => REEL.R().cast.includes('Lmia')), "tapping H3 Deck's Mia puts her in this reel too");
  if(process.env.SHOT3) await page.screenshot({path:process.env.SHOT3});
  await page.click('#tabs [data-tab="reel"]'); await page.waitForTimeout(300); if(process.env.SHOT3) await page.screenshot({path:process.env.SHOT3.replace('.png', 'b.png'), fullPage:true});
  ok(await page.evaluate(() => /Zoe/.test(document.querySelector('#castRow').textContent) && /Mia/.test(document.querySelector('#castRow').textContent)), '👥 In this reel under the options shows both');
  await page.click('#nextBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelectorAll('#who [data-w]').length===2 && !document.querySelectorAll('#who button.on').length), 'Next lists both of the reel\'s characters, none named yet'); await page.click('[data-close]');
  // Zoe stays after the engine reloads (Reel's own, kept apart from H3 Deck's Library)
  await eng.evaluate(() => location.reload()); await page.waitForTimeout(3000);
  const eng2 = page.frames().find(f => /engine=1/.test(f.url()));
  ok(await eng2.evaluate(() => H3.S.lib.some(L => L.name==='Zoe' && L.reel) && H3.S.lib.some(L => L.name==='Mia')), "Zoe is still there after the engine reopens, next to H3 Deck's Library");
  // H3 Deck's own save is untouched, nothing was sent over its copies on the PCs
  const deck = await page.evaluate(() => JSON.parse(localStorage.getItem('h3deck')));
  ok(deck.takes.length===1 && deck.takes[0].id==='tDeck' && deck.media.mOld && deck.lib.length===4, "H3 Deck's own save is untouched (its take and pictures are still there)");
  ok(!sent.some(x => x.userdata && /h3deck_(takes|films|run)/.test(x.userdata)) && !sent.some(x => x.run), "the engine never writes H3 Deck's copies on the PCs or wakes the 🌙 hidden copy");
  // H3 Deck itself still opens normally on its own save
  const p2 = await ctx.newPage(); p2.on('pageerror', e => { console.log('DECK PAGE ERROR', e.message); fails++; });
  await p2.route(R + '/**', fake); await p2.addInitScript(r => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await p2.goto('http://127.0.0.1:8041/h3-a875336252cb/'); await p2.waitForTimeout(2500);
  ok(await p2.evaluate(() => H3.S.takes.some(t => t.id==='tDeck') && !H3.S.takes.some(t => /<Subject 1> sits/.test(t.prompt || ''))), "H3 Deck opens with its own takes, not Reel's");
  // ⚖ side by side (Jordan 2026-11-20: "make sure what the new app does is what H3 deck does prompt wise"): the same shot from Reel and from
  // H3 Deck itself must send the same job to the PC, apart from seeds and file names
  const engF = () => page.frames().find(f => /engine=1/.test(f.url()));
  await page.evaluate(() => { REEL.R().attrs = {}; REEL.R().fit = {}; });
  const s0 = sent.length;
  const rid = await engF().evaluate(async () => { const r = await H3Engine.make({words:'Mia waves at the camera', who:[], n:1}); return r.ids ? r.ids[0] : JSON.stringify(r); });
  await page.waitForTimeout(2500);
  const rg = sent.slice(s0).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
  const rt = await engF().evaluate(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {seconds:t.seconds, w:t.w, h:t.h, h3:t.h3, neg:t.neg}; }, rid);
  const s1 = sent.length;
  await p2.evaluate(sec => { const S = H3.S, L = S.lib.find(x => x.id==='Lmia'); const c = H3.libToCast(L); S.f.prompt = '<Subject ' + c.n + '> waves at the camera'; S.f.seconds = sec; S.f.takes = 1; }, rt.seconds || 5);
  await p2.click('#goBtn'); await p2.waitForTimeout(3000);
  const dg = sent.slice(s1).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
  const norm = g => { const o = {}; for(const [id, n] of Object.entries(g || {})){ const i = {}; for(const [k, v] of Object.entries(n.inputs || {})) if(!/seed|filename_prefix|^image$|^file$|^video$|^audio$/.test(k)) i[k] = v; o[id] = n.class_type + ' ' + JSON.stringify(i); } return o; };
  const A = norm(rg && rg.g), B = norm(dg && dg.g), diff = [...new Set(Object.keys(A).concat(Object.keys(B)))].filter(k => A[k]!==B[k]);
  if(diff.length) diff.slice(0, 12).forEach(k => console.log('  DIFF node ' + k + '\n    Reel:    ' + (A[k] || '(none)').slice(0, 900) + '\n    H3 Deck: ' + (B[k] || '(none)').slice(0, 900)));
  ok(rg && dg && !diff.length, '⚖ Reel and H3 Deck send the same job for the same shot (' + (rg ? Object.keys(A).length : 0) + ' vs ' + (dg ? Object.keys(B).length : 0) + ' nodes, ' + diff.length + ' differ)');
  // 🧪 0.9 MP test (Jordan 2026-11-26): PRISM PIKA alone, 1280×704, sent only to Main; off again = back to normal
  { await engF().evaluate(() => { const S = H3.S; if(!S.pcs.some(p => p.name==='Main')) S.pcs.push({name:'Main', url:'http://main.test', on:true, speed:1}); });
    for(let i = 0; i < 30; i++){ if(await engF().evaluate(() => H3Engine.pcs().every(p => p.online))) break; await page.waitForTimeout(500); }
    await engF().evaluate(() => H3Engine.setLook({test:true}));
    const both = await engF().evaluate(() => H3Engine.look()); ok(both.test && !both.testPc && both.testUrl==='both', '🧪 on = both PCs by default');
    await engF().evaluate(() => H3Engine.setLook({testPc:'http://main.test'}));
    const lk = await engF().evaluate(() => H3Engine.look());
    const sA = sent.length, tid = await engF().evaluate(async () => { const r = await H3Engine.make({words:'Mia waves at the camera', who:[], n:1, aspect:'16:9'}); return r.ids ? r.ids[0] : JSON.stringify(r); });
    await page.waitForTimeout(2500);
    const gs = sent.slice(sA).filter(x => x.g), tt = await engF().evaluate(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {w:t.w, h:t.h, pc:t.pc, fin:t.fin}; }, tid);
    const unets = gs.flatMap(x => nodes(x.g, 'UNETLoader').map(n => n.inputs.unet_name));
    ok(lk.test && lk.testPc==='Main', '🧪 test switch on, Main named (' + JSON.stringify(lk) + ')');
    ok(gs.length && gs.every(x => x.host==='main.test'), '🧪 test job goes only to Main (' + gs.map(x => x.host).join(',') + ')');
    ok(tt.w===1280 && tt.h===704 && !tt.fin, '🧪 1280×704, no vanilla stage (' + JSON.stringify(tt) + ')');
    ok(unets.length && unets.every(u => /prismPIKA/.test(u)), '🧪 PRISM PIKA only (' + unets.join(',') + ')');
    await engF().evaluate(() => H3Engine.setLook({test:false}));
    const sB = sent.length, tid2 = await engF().evaluate(async () => { const r = await H3Engine.make({words:'Mia waves at the camera', who:[], n:1, aspect:'16:9'}); return r.ids ? r.ids[0] : JSON.stringify(r); });
    await page.waitForTimeout(2500);
    const t2 = await engF().evaluate(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {w:t.w, h:t.h, fin:!!t.fin}; }, tid2);
    ok(t2.w < 1000 && t2.fin, '🧪 off: back to the normal size and vanilla → PIKA (' + JSON.stringify(t2) + ')');
    { await page.evaluate(() => setSheet()); await page.click('#stT'); const on = await engF().evaluate(() => H3Engine.look().test), txt = await page.evaluate(() => document.querySelector('#stT').textContent);
      await page.click('#stT'); const off = await engF().evaluate(() => H3Engine.look().test); await page.evaluate(() => closeSheet());
      ok(on && !off && /On/.test(txt), '🧪 ⚙ switch turns the test on and off');
      await engF().evaluate(() => H3Engine.setLook({test:true, testPc:'both'})); const sC = sent.length;
      await engF().evaluate(async () => { await H3Engine.make({words:'Mia waves', who:[], n:2, aspect:'16:9'}); }); await page.waitForTimeout(2500);
      const hs = [...new Set(sent.slice(sC).filter(x => x.g).map(x => x.host))], wh = await engF().evaluate(() => H3.S.f.where);
      ok(wh==='both' && hs.length >= 1, '🧪 both PCs: not pinned (sent to ' + hs.join(',') + ', where ' + wh + ')');
      await engF().evaluate(() => H3Engine.setLook({test:false})); }
    // 🎛 (Jordan 2026-11-27) PRISM PIKA picked in ⚙ with the test off: ↻ Redo of a MiniMax → PIKA clip stays on PIKA alone, at the usual size
    { const r = await engF().evaluate(async id => { const P = H3Engine.models().find(x => /PIKA$/.test(x.label)); H3Engine.setLook({model:P.key}); const lk = H3Engine.look().model;
        const x = await H3Engine.again({take:id, words:'Mia waves', n:1}), y = await H3Engine.make({words:'Mia waves', who:[], n:1, aspect:'16:9'});
        const t = H3.S.takes.find(z => z.id===(x.ids || [])[0]) || {}, u = H3.S.takes.find(z => z.id===(y.ids || [])[0]) || {};
        H3Engine.setLook({model:H3Engine.models().find(m => /Reference → PIKA/.test(m.label)).key}); delete H3.S.reelModel;
        return {pk:P.key, lk, a:{model:t.model, fin:!!t.fin, w:t.w}, m:{model:u.model, fin:!!u.fin, w:u.w}}; }, tid2);
      ok(r.lk===r.pk && /prismPIKA/i.test(r.a.model) && !r.a.fin && r.a.w < 1000 && /prismPIKA/i.test(r.m.model) && !r.m.fin && r.m.w < 1000, '🎛 PIKA pick wins over the clip\'s own MiniMax → PIKA (usual size, no vanilla stage) ' + JSON.stringify(r)); }
    // 🎛 (Jordan 2026-11-27) MiniMax only (vanilla H3 Reference, no finish, its own 20 steps) and Ultima only (6 steps), for new clips and ↻ Redo
    for(const [re, mod, st, nm] of [[/^MiniMax only/, /minimax_h3_ref2va/, 20, 'MiniMax only'], [/^TriPRISM/, /triprism/i, 6, 'TriPRISM']]){
      const sM = sent.length, r = await engF().evaluate(async ([re, nm]) => { const P = H3Engine.models().find(x => x.label.startsWith(nm)); if(!P) return {none:H3Engine.models().map(x => x.label)}; H3Engine.setLook({model:P.key});
        const y = await H3Engine.make({words:'Mia waves', who:[], n:1, aspect:'16:9'}), u = H3.S.takes.find(z => z.id===(y.ids || [])[0]) || {};
        return {key:P.key, lk:H3Engine.look().model, m:{id:u.id, model:u.model, fin:!!u.fin, steps:u.steps, turbo:!!u.turbo}}; }, [String(re), nm]);
      await page.waitForTimeout(2500);
      const gs = sent.slice(sM).filter(x => x.g), un = gs.flatMap(x => nodes(x.g, 'UNETLoader').map(n => n.inputs.unet_name)), stp = gs.flatMap(x => nodes(x.g, 'BasicScheduler').map(n => +n.inputs.steps).concat(nodes(x.g, 'ManualSigmas').map(n => String(n.inputs.sigmas).split(',').length - 1)));
      ok(r.m && r.lk===r.key && mod.test(r.m.model) && !r.m.fin && (nm!=='MiniMax only' || !r.m.turbo) && un.length && un.every(u => mod.test(u)) && stp.includes(st), '🎛 ' + nm + ': one model, no finish, ' + st + ' steps ' + JSON.stringify({r, un, stp}));
      if(nm==='TriPRISM'){ const sm = gs.flatMap(x => nodes(x.g, 'KSamplerSelect').map(n => n.inputs.sampler_name)), lo = gs.flatMap(x => nodes(x.g, 'LoraLoaderModelOnly').map(n => n.inputs.lora_name)), ml = await engF().evaluate(() => H3Engine.models().map(x => x.label));
        ok(sm.length && sm.every(x => x==='lcm') && !lo.some(n => /realism|detail/i.test(n)) && !ml.some(x => /ultima/i.test(x)), '🎛 TriPRISM: lcm, no ✨ boost LoRAs; Ultima gone from the list ' + JSON.stringify({sm, lo, ml})); }
      if(nm==='TriPRISM'){ const sF = sent.length, f = await engF().evaluate(async () => { const P = H3Engine.models().find(x => x.label==='H3 Reference → TriPRISM finish'); if(!P) return {none:H3Engine.models().map(x => x.label)}; H3Engine.setLook({model:P.key});
          const y = await H3Engine.make({words:'Mia waves', who:[], n:1, aspect:'16:9'}), u = H3.S.takes.find(z => z.id===(y.ids || [])[0]) || {}; const lk = H3Engine.look().model; H3Engine.setLook({model:H3Engine.models().find(m => /Reference → PIKA/.test(m.label)).key}); delete H3.S.reelModel; return {key:P.key, lk, fin:u.fin, model:u.model}; });
        await page.waitForTimeout(2500); const g2 = sent.slice(sF).filter(x => x.g), un2 = g2.flatMap(x => nodes(x.g, 'UNETLoader').map(n => n.inputs.unet_name)), sa2 = g2.flatMap(x => nodes(x.g, 'SamplerCustomAdvanced'));
        ok(f.fin && f.fin.t && !f.fin.u && f.lk===f.key && /minimax_h3_ref2va/.test(f.model) && un2.some(u => /TriPRISM/.test(u)) && un2.some(u => /minimax_h3_ref2va/.test(u)) && !un2.some(u => /prismPIKA/.test(u)) && sa2.length >= 2, '🎛 H3 Reference → TriPRISM finish: vanilla first, TriPRISM finishes ' + JSON.stringify({f, un2, n:sa2.length})); }
      if(nm==='MiniMax only'){ const x = await engF().evaluate(async id => { const a = await H3Engine.again({take:id, words:'Mia waves', n:1}); const t = H3.S.takes.find(z => z.id===(a.ids || [])[0]) || {}; return {model:t.model, fin:!!t.fin}; }, r.m.id);
        ok(/minimax_h3_ref2va/.test(x.model) && !x.fin, '🎛 MiniMax only: ↻ again stays vanilla with no finish ' + JSON.stringify(x)); } }
    await engF().evaluate(() => { H3Engine.setLook({model:H3Engine.models().find(m => /Reference → PIKA/.test(m.label)).key}); delete H3.S.reelModel; });
    await engF().evaluate(() => { const S = H3.S; S.pcs = S.pcs.filter(p => p.name!=='Main'); S.f.where = 'both'; }); }
  await page.evaluate(() => { REEL.R().attrs = {Lmia:['Lfrk']}; REEL.R().fit = {Lmia:true}; });
  await page.evaluate(() => { const R = REEL.R(); REEL.E().setAttrs(JSON.parse(JSON.stringify(R.attrs)), JSON.parse(JSON.stringify(R.fit)), {}, 'auto'); });
  const s2 = sent.length;
  const rid2 = await engF().evaluate(async () => { const r = await H3Engine.make({words:'Pip hugs Mia', who:[], n:1}); return r.ids ? r.ids[0] : JSON.stringify(r); });
  await page.waitForTimeout(2500);
  const rg2 = sent.slice(s2).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
  const rt2 = await engF().evaluate(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {seconds:t.seconds, styled:t.styled, look:t.look, scene:t.h3 && t.h3.scene}; }, rid2);
  const s3 = sent.length;
  await p2.evaluate(sec => { const S = H3.S, P = H3.libToCast(S.lib.find(x => x.id==='Lpip')), M = H3.libToCast(S.lib.find(x => x.id==='Lmia'));
    P.art = '3d'; M.attrs = ['Lfrk']; M.fitHere = true; S.f.look = {src:'c', n:P.n, pics:[], redo:{}, use:true};
    S.f.prompt = '<Subject ' + P.n + '> hugs <Subject ' + M.n + '>'; S.f.seconds = sec; S.f.takes = 1; }, rt2.seconds || 5);
  await p2.click('#goBtn'); await p2.waitForTimeout(3000);
  const dg2 = sent.slice(s3).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
  const A2 = norm(rg2 && rg2.g), B2 = norm(dg2 && dg2.g), diff2 = [...new Set(Object.keys(A2).concat(Object.keys(B2)))].filter(k => A2[k]!==B2[k]);
  if(diff2.length) diff2.slice(0, 12).forEach(k => console.log('  DIFF node ' + k + '\n    Reel:    ' + (A2[k] || '(none)').slice(0, 1500) + '\n    H3 Deck: ' + (B2[k] || '(none)').slice(0, 1500)));
  ok(rg2 && dg2 && !diff2.length, '⚖ the same for a stylized character with Mia in ✨ Freckles and her own clothes (' + diff2.length + ' nodes differ)');
  ok(rt2.styled && rt2.look && rt2.look.src==='c' && /art style is kept/.test(JSON.stringify(rg2 && rg2.g)), '🎨 Pip (🧊 3D in H3 Deck\'s Library) keeps her own art style and the scene follows her by default (' + JSON.stringify(rt2) + ')');
  await page.evaluate(() => { REEL.R().attrs = {}; REEL.R().fit = {}; });
  // 💬 dialogue (Jordan 2026-11-24: "add in the dialog option in Reels. Like how Render Deck H3 does it"): a line in Reel's words goes to
  // the PC as H3 Deck's own <Dialogue k> line does; a name said inside the line (Pip) doesn't bring her into the shot
  { await page.evaluate(() => { REEL.E().setAttrs({}, {}, {}, 'auto'); });
    const s4 = sent.length;
    const rid4 = await engF().evaluate(async () => { const r = await H3Engine.make({words:'Mia waves at the camera. 💬 Mia (softly): "Hi Pip, did you bring it?"', who:[], n:1}); return r.ids ? r.ids[0] : JSON.stringify(r); });
    await page.waitForTimeout(2500);
    const rg4 = sent.slice(s4).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
    const rt4 = await engF().evaluate(id => { const t = H3.S.takes.find(x => x.id===id) || {}; const pip = H3.S.cast.find(c => c.lib==='Lpip'); return {seconds:t.seconds, prompt:t.prompt, lines:t.lines, pip:pip ? pip.n : 0}; }, rid4);
    const s5 = sent.length;
    await p2.evaluate(sec => { const S = H3.S; S.cast = []; S.f.look = {src:'', n:0, pics:[], redo:{}, use:true}; S.f.descOff = {}; const c = H3.libToCast(S.lib.find(x => x.id==='Lmia')); S.lines = S.lines || {}; const k = Math.max(0, +S.lineNo || 0, ...Object.keys(S.lines).map(Number)) + 1; S.lineNo = k;
      S.lines[k] = {n:c.n, text:'Hi Pip, did you bring it?', how:'softly', vo:false}; S.f.prompt = '<Subject ' + c.n + '> waves at the camera. <Dialogue ' + k + '>'; S.f.seconds = sec; S.f.takes = 1; }, rt4.seconds || 5);
    await p2.click('#goBtn'); await p2.waitForTimeout(3000);
    const dg4 = sent.slice(s5).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
    const A4 = norm(rg4 && rg4.g), B4 = norm(dg4 && dg4.g), diff4 = [...new Set(Object.keys(A4).concat(Object.keys(B4)))].filter(k => A4[k]!==B4[k]);
    if(diff4.length) diff4.slice(0, 12).forEach(k => console.log('  DIFF node ' + k + '\n    Reel:    ' + (A4[k] || '(none)').slice(0, 1500) + '\n    H3 Deck: ' + (B4[k] || '(none)').slice(0, 1500)));
    const said = JSON.stringify(rg4 && rg4.g) || '';
    ok(rg4 && dg4 && !diff4.length && /<Subject 1> \(S1\) says softly, <d>\[English\] Hi Pip, did you bring it\?<\/d>/.test(said) && /<Dialogue 1>/.test(rt4.prompt || '') && !/<Subject 2>/.test(said),
      '💬 a Reel line goes out exactly as H3 Deck sends it: "<Subject 1> (S1) says softly, <d>[English] …</d>", and Pip (named inside the line) isn\'t brought in (' + diff4.length + ' nodes differ, ' + JSON.stringify(rt4) + ')');
    // speaker named only as who says it, plus a 🎙 off-screen line from a voice
    const s6 = sent.length;
    await engF().evaluate(async () => H3Engine.make({words:'A quiet kitchen at night. 🎙 Mia: "Nobody is home." 💬 : "Hello?"', who:[], n:1}));
    await page.waitForTimeout(2500);
    const rg6 = JSON.stringify((sent.slice(s6).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type))) || {}).g) || '';
    ok(/<Subject 1> \(S1\) says in an off-screen voiceover: <d>\[English\] Nobody is home\.<\/d> while their lips remain completely closed\./.test(rg6) && /A voice \(S2\) says, <d>\[English\] Hello\?<\/d>/.test(rg6) && /LoadImage/.test(rg6),
      '💬 🎙 a speaker named only by her line is in the shot (her pictures go), a voiceover and an unnamed voice are written the H3 way'); }
  // 💬 the ＋ Line form in Reel's words box
  { await page.click('#nextBtn'); await page.waitForTimeout(300);
    const tw = await page.evaluate(() => { const ta = document.querySelector('#card textarea'); return ta && ta.id; });
    await page.fill('#' + tw, 'Mia smiles.'); await page.click('#who [data-dl]'); await page.waitForTimeout(150);
    const who0 = await page.evaluate(() => (document.querySelector('#dlWho .on') || {}).textContent);
    await page.fill('#dlT', 'We made it... finally'); await page.fill('#dlH', 'with a grin');
    const pv = await page.evaluate(() => document.querySelector('#dlPv').textContent);
    await page.click('#dlGo'); await page.waitForTimeout(150);
    const v = await page.inputValue('#' + tw), chip = await page.evaluate(() => (document.querySelector('.hl mark.dl') || {}).textContent);
    ok(who0==='Mia' && v==='Mia smiles. 💬 Mia (with a grin): "We made it... finally"' && chip==='💬 Mia (with a grin): "We made it... finally"' && /Sent as: Mia \(S1\) says with a grin, <d>\[English\] We made it, finally\.<\/d>/.test(pv),
      '💬 ＋ Line: pick who, type the line, it goes in the words as one chip, with a preview of what is sent (' + JSON.stringify({who0, v, chip, pv}) + ')');
    // tap inside the line to change it, then take it out
    await page.evaluate(id => { const ta = document.getElementById(id); ta.focus(); ta.setSelectionRange(20, 20); ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }, tw); await page.waitForTimeout(150);
    const ed = await page.evaluate(() => ({t:(document.querySelector('#dlT') || {}).value, rm:!!document.querySelector('#dlRm')}));
    await page.click('#dlVo'); await page.click('#dlGo'); await page.waitForTimeout(100); const v2 = await page.inputValue('#' + tw);
    await page.evaluate(id => { const ta = document.getElementById(id); ta.setSelectionRange(20, 20); ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }, tw); await page.waitForTimeout(150);
    await page.click('#dlRm'); await page.waitForTimeout(100); const v3 = await page.inputValue('#' + tw);
    ok(ed.t==='We made it... finally' && ed.rm && v2==='Mia smiles. 🎙 Mia (with a grin): "We made it... finally"' && v3==='Mia smiles.', '💬 tapping the line opens it to change (🎙 off-screen) or 🗑 take out (' + JSON.stringify({ed, v2, v3}) + ')');
    await page.click('#card [data-close]'); await page.waitForTimeout(150); }
  ok(rg && /Soft film grain/.test(JSON.stringify(rg.g)) && /blurry hands/.test(JSON.stringify(rt)), "⚖ Reel uses H3 Deck's ✍ Custom quality words and 🚫 Keep out (" + JSON.stringify(rt) + ')');
  // ✨ 🧩 attributes and LoRA chips, as H3 Deck's Library has them
  await page.click('#tabs [data-tab="lib"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => [...document.querySelectorAll('#sceneSeg button')].map(b => (b.classList.contains('on') ? '*' : '') + b.textContent).join('|')).then(x => /^\*✨ Auto\|Off\|🧊.*\|🎥 Realistic$/.test(x)), '🎨 the Library tab has the Scene style row, ✨ Auto by default');
  ok(await page.evaluate(() => /Freckles/.test(document.querySelector('#libAttr').textContent) && /Glow/.test(document.querySelector('#libLora').textContent) && !!document.querySelector('#libWear [data-ex="new:wear"]')), '📚 the Library tab has ✨ Attributes, 👗 Clothing and 🧩 LoRAs');
  await page.click('#libIn [data-ch="Lmia"]'); await page.waitForTimeout(200); await page.click('#chA [data-at="Lfrk"]'); await page.click('#chA [data-fit]'); const artRow = await page.evaluate(() => [...document.querySelectorAll('#chArt button')].map(b => (b.classList.contains('on') ? '*' : '') + b.textContent).join('|'));
  ok(/^\*🎥 Realistic\|🧊 3D animated\|✏ 2D anime\|🖍 Cartoon$/.test(artRow), "🎨 Mia's card has Keep her own art style, off for her (" + artRow + ')'); await page.click('[data-close]');
  ok(await page.evaluate(() => (REEL.R().attrs.Lmia || []).includes('Lfrk')), '✨ Freckles put on Mia for this reel from her card');
  await page.click('#libWear [data-ex="new:wear"]'); await page.waitForTimeout(200); await page.fill('#exN', 'Raincoat'); await page.fill('#exD', 'a long red raincoat'); await page.click('#exGo'); await page.waitForFunction(() => document.querySelector('#sheet').hidden, null, {timeout:8000}).catch(() => {});
  ok(await page.evaluate(() => REEL.E().extras().some(x => x.kind==='wear' && x.name==='Raincoat' && x.reel)), '👗 new clothing made in Reel');
  await page.click('#tabs [data-tab="reel"]'); await page.waitForTimeout(200); await page.click('#nextBtn'); await page.waitForTimeout(300);
  const tw = await page.evaluate(() => { const ta = document.querySelector('.sheet textarea, #card textarea'); return ta && ta.id; });
  await page.fill('#' + tw, 'Mia waves'); await page.click('#who [data-lw="Lglow"]');
  ok((await page.inputValue('#' + tw))==='Mia waves {Glow} ' && await page.evaluate(() => !!document.querySelector('.hl mark.lo')), '🧩 tapping Glow puts the {Glow} chip in the words (' + JSON.stringify(await page.inputValue('#' + tw)) + ')');
  const nT = await page.frames().find(f => /engine=1/.test(f.url())).evaluate(() => H3.S.takes.map(t => t.id));
  await page.click('#card .big.pri, #card button.pri'); await page.waitForTimeout(2500);
  const lt = await page.frames().find(f => /engine=1/.test(f.url())).evaluate(n => { const t = H3.S.takes.find(x => !n.includes(x.id)) || {}; const c = H3.S.cast.find(x => x.lib==='Lmia'); return {prompt:t.prompt, loras:(t.loras || []).map(l => l.name + ':' + l.str), off:c && t.descOff && t.descOff[c.n], fit:c && c.fitHere, lines:t.lines, SL:H3.S.lines, pr:t.pieces && t.pieces[0] && t.pieces[0].prompt}; }, nT);
  ok(/<Lora 1>|soft glow light/.test(lt.prompt || '') && !/\{Glow\}/.test(lt.prompt || '') && lt.loras.includes('glow.safetensors:0.8') && (lt.off || []).includes('add:Lfrk') && !(lt.off || []).includes('fit') && lt.fit===true, "🧩 the take gets Glow's LoRA and words, and ✨ Freckles is on Mia in this take itself (its own 🏷 chips) (" + JSON.stringify(lt) + ')');
  // ✨ per clip: ↻ Redo has its own "On them in this clip" row, starting from the picked option's look; turning Freckles off there
  // only changes the new options of this clip (Jordan 2026-11-20: "How do I turn them off and on per shot?")
  { await page.waitForTimeout(500); const nT2 = await eng.evaluate(() => H3.S.takes.map(t => t.id));
    await page.click('#redoBtn'); await page.waitForTimeout(300);
    const row = await page.evaluate(() => ({on:!!document.querySelector('.lk[data-c="Lmia"] [data-at="Lfrk"].on'), lab:/On them in this clip/.test(document.querySelector('#card').textContent)}));
    await page.click('.lk[data-c="Lmia"] [data-at="Lfrk"]'); await page.click('#rdGo'); await page.waitForTimeout(2500);
    const r = await eng.evaluate(n => { const c = H3.S.cast.find(x => x.lib==='Lmia'); const t = H3.S.takes.find(x => !n.includes(x.id)) || {}; return {off:c && t.descOff && t.descOff[c.n]}; }, nT2);
    const m = await page.evaluate(() => { const c = REEL.cur(), ids = c.takes; return ids.map(id => ((c.meta[id] || {}).look || {attrs:{}}).attrs.Lmia || null); });
    ok(row.on && row.lab && !(r.off || []).includes('add:Lfrk') && m.some(a => a && a.includes('Lfrk')) && m.some(a => a && !a.includes('Lfrk')), '✨ ↻ Redo has its own per-clip row: Freckles off there leaves it off only on the new options (' + JSON.stringify({row, r, m}) + ')');
    await finish(); }
  // 🙂 character thumbnails centred on the face
  await page.click('#tabs [data-tab="lib"]'); await page.waitForTimeout(1500);
  const fb = await eng.evaluate(() => H3.S.faceBox && H3.S.faceBox.mPic).catch(() => null) || await page.frames().find(f => /engine=1/.test(f.url())).evaluate(() => H3.S.faceBox && H3.S.faceBox.mPic);
  ok(fb && Math.abs(fb.x - 20 / 64) < 0.02 && Math.abs(fb.w - 16 / 64) < 0.02 && Math.abs(fb.y - 4 / 64) < 0.02, '🙂 the face box is read from the face finder\'s mask (' + JSON.stringify(fb) + ')');
  ok(faces.length >= 1 && /face_yolov8m/.test(JSON.stringify(faces[0])) && faces.every(g => Object.values(g).some(n => n.class_type==='SegsToCombinedMask')), '🙂 it uses face_yolov8m from the PC\'s own list');
  ok(await page.evaluate(() => { const im = document.querySelector('#libAll [data-ch="Lmia"] img'); return !!im && /^data:image\/jpeg/.test(im.src); }), "🙂 Mia's card shows the square cut around her face");
  await page.click('#tabs [data-tab="reel"]'); await page.waitForTimeout(200);
  // Reel as its own home-screen app (its own storage, no H3 Deck save there): the Library comes from H3 Deck's copy on the PCs
  const ctx3 = await br.newContext({viewport:{width:390, height:844}}), p3 = await ctx3.newPage(); p3.on('pageerror', e => { console.log('REEL3 PAGE ERROR', e.message); fails++; });
  const fake3 = async rt => { const u = new URL(rt.request().url()), pa = u.pathname;
    if(pa==='/userdata/h3deck_films.json' && rt.request().method()==='GET') return rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify({v:1, t:Date.now(), films:[],
      lib:[{id:'Lkai', kind:'char', name:'Kai', stand:'man', desc:'blue jacket', pics:['mKai'], keep:'exact', what:''}, {id:'Lnoa', kind:'char', name:'Noa', stand:'woman', desc:'', pics:['mNoa'], keep:'exact', what:''}], media:{mKai:{id:'mKai', kind:'img', name:'kai.png', type:'image/png', thumb:'blob:gone'}, mNoa:{id:'mNoa', kind:'img', name:'noa.png', type:'image/png', thumb:''}}, up:{['mKai|' + R]:'h3deck/h3deck_mKai.png'}})});
    if(pa==='/view' && u.searchParams.get('type')==='input' && /mNoa/.test(u.searchParams.get('filename') || '')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    if(pa==='/view' && u.searchParams.get('type')==='input') return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:Buffer.from(PNG, 'base64')});
    return fake(rt); };
  await p3.route(R + '/**', fake3); await p3.addInitScript(r => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await p3.goto('http://127.0.0.1:8041/reel-5b1e7c94d2a0/'); await p3.waitForTimeout(5000);
  await p3.click('#tabs [data-tab="lib"]'); await p3.waitForTimeout(7000);
  const k3 = await p3.evaluate(() => { const b = [...document.querySelectorAll('#libAll [data-ch]')].find(x => /Kai/.test(x.textContent)), im = b && b.querySelector('img'); return {card:!!b, src:im ? im.src.slice(0, 5) : ''}; });
  ok(k3.card && (k3.src==='blob:' || k3.src==='data:'), "on its own storage, Reel's Library shows H3 Deck's characters from the PCs' copy, picture and all (" + JSON.stringify(k3) + ')');
  // a character whose pictures never reached a PC stops the clip with a clear message, instead of a stranger
  await p3.evaluate(() => { REEL.R().cast = ['Lnoa']; }); await p3.click('#tabs [data-tab="reel"]'); await p3.waitForTimeout(200);
  await p3.click('[data-act="make"]'); await p3.waitForTimeout(200); await p3.fill('#mkW', 'Noa waves'); await p3.click('#mkGo'); await p3.waitForTimeout(1500);
  ok(await p3.evaluate(() => /haven't reached the PCs/.test(document.body.innerText) && !document.querySelector('#sheet').hidden), "Noa (pictures never sent to a PC) isn't rendered as a stranger: it says to open H3 Deck once");
  await ctx3.close();
  // ⬆ a newer Reel on the site: a banner offers to load it
  { const p4 = await ctx.newPage(); await p4.route(R + '/**', fake);
    await p4.route(/reel-5b1e7c94d2a0\/\?u=/, rt => rt.fulfill({status:200, contentType:'text/html', body:'<meta name="reel-build" content="9999-new">'}));
    await p4.goto('http://127.0.0.1:8041/reel-5b1e7c94d2a0/'); await p4.waitForTimeout(4500);
    ok(await p4.evaluate(() => /new version of Reel/.test((document.querySelector('.upd') || {}).textContent || '')), '⬆ a newer Reel on the site shows "A new version of Reel is ready"'); await p4.close(); }
  // ⇿ Across the cut: one new clip over the end of clip 3 and the start of clip 4, both cut back to make room
  { await page.evaluate(() => REEL.go(2)); await page.waitForTimeout(300);
    const b0 = await page.evaluate(() => { const cs = REEL.clips(), e = c => { const d = REEL.info(c.pick).secs; return c.out != null ? Math.min(c.out, d) : d; }; return {n:cs.length, endA:e(cs[2]), inA:cs[2].in || 0, inB:cs[3].in || 0, a:cs[2].pick, b:cs[3].pick}; });
    await page.click('#editBtn'); await page.waitForTimeout(400); await page.click('#edM [data-m="across"]');
    await page.evaluate(() => { for(const [id, v] of [['#edXA', 1], ['#edXB', 1.5]]){ const s = document.querySelector(id); s.value = v; s.oninput({target:s}); } });
    { await page.waitForTimeout(800); const pv = await page.evaluate(() => { const v = document.querySelector('#edV'), cs = REEL.clips(); return {src:v.src, t:+v.dataset.xt, b:REEL.info(cs[3].pick).url, a:REEL.info(cs[2].pick).url, note:document.querySelector('#edXN').textContent}; });
      ok(pv.src===pv.b && Math.abs(pv.t - (b0.inB + 1.5)) < 0.15 && /lands/.test(pv.note), '⇿ the preview follows the sliders: the last one moved shows where it lands in the next clip (' + JSON.stringify(pv) + ')'); }
    await page.fill('#edXW', 'she turns and looks straight at the camera'); n0 = sent.filter(x => x.g).length; await page.click('#edXGo'); await page.waitForTimeout(2500);
    // (Jordan 2026-11-24: edits keep ~5 s clips instead of making 1-2 s ones) it comes back as a longer option of clip 3, not a clip of its own
    const r = await page.evaluate(() => { const cs = REEL.clips(), c = cs[2], m = c.meta[c.pick] || {}; return {n:cs.length, kinds:cs.map(c => c.kind).join(), out:c.out, in:c.in || 0, inB:cs[3].in, joined:m.joined, before:m.before, cur:REEL.S().reels.find(x => x.id===REEL.S().open).cur}; });
    const g = await eng.evaluate(() => { const t = H3.S.takes[0]; return t.lead && t.lead.gap && {aOut:t.lead.gap.aOut, bIn:t.lead.gap.bIn, join:t.lead.gap.join, prompt:t.prompt}; });
    ok(r.n===b0.n && r.joined==='a' && r.before===b0.b && r.out==null && r.inB > b0.inB + 1.3 && r.inB < b0.inB + 1.55 && r.cur===2
       && g && g.join && g.join.side==='a' && Math.abs(g.bIn - r.inB) < 0.01 && /looks straight at the camera/.test(g.prompt) && sent.filter(x => x.g).length > n0,
      '⇿ Across the cut remakes from 1 s before the cut to ~1.5 s into the next clip as a longer option of this clip (no new clip), the next clip trimmed to make room (' + JSON.stringify({b0, r, g}) + ')');
    await finish(); await page.evaluate(() => REEL.go(3)); await page.waitForTimeout(400);
    ok(await page.evaluate(() => !/may jump/.test(document.querySelector('#warnBox').textContent)), '⇿ the clip after the remade cut doesn\'t say it may jump (the new option was made to land on it)');
    await finish(); }
  // 🗑 a clip with no options can still be removed from ✂ Edit (Jordan 2026-11-21)
  { const n = await page.evaluate(() => { REEL.addClip(1, {kind:'insert', words:'empty'}); REEL.go(1); return REEL.clips().length; }); await page.waitForTimeout(400);
    const dis = await page.evaluate(() => document.querySelector('#editBtn').disabled); await page.click('#editBtn'); await page.waitForTimeout(300);
    await page.click('#edDel'); await page.click('#edDel'); await page.waitForTimeout(400);
    ok(!dis && await page.evaluate(n => REEL.clips().length===n - 1 && !REEL.clips().some(c => c.words==='empty'), n), '🗑 an empty clip can be removed from ✂ Edit'); }
  // 🧹 Keep only this option (tap twice)
  { await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300); const n = await page.evaluate(() => REEL.cur().takes.length);
    await page.click('#keepOne'); await page.waitForTimeout(200); const mid = await page.evaluate(() => ({n:REEL.cur().takes.length, t:document.querySelector('#keepOne').textContent}));
    await page.click('#keepOne'); await page.waitForTimeout(500); const r = await page.evaluate(() => ({n:REEL.cur().takes.length, opts:document.querySelectorAll('#opts .opt').length, btn:!!document.querySelector('#keepOne')}));
    ok(n > 1 && mid.n===n && /Tap again/.test(mid.t) && r.n===1 && r.opts===1 && !r.btn, '🧹 Keep only this option asks for a second tap, then leaves only the picked option (' + JSON.stringify({n, mid, r}) + ')'); }
  // 🗑 removing a clip or a whole reel stops its options that are still rendering (the PC doesn't keep making clips nobody sees)
  { await page.evaluate(() => { const E = REEL.E(); window.__stops = []; window.__oi = E.info; window.__os = E.stop; E.info = id => /^tw/.test(id) ? {state:'working', pct:5} : window.__oi(id); E.stop = async id => { window.__stops.push(id); };
      REEL.addClip(1, {kind:'insert', words:'busy', takes:['tw1']}); REEL.go(1); REEL.refresh(); }); await page.waitForTimeout(400);
    await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edDel'); await page.click('#edDel'); await page.waitForTimeout(400); await page.evaluate(() => REEL.flushUndo());
    const a = await page.evaluate(() => ({stops:window.__stops.slice(), left:REEL.clips().some(c => c.words==='busy')}));
    await page.click('#reelBtn'); await page.waitForTimeout(300); await page.click('#rlNew'); await page.waitForTimeout(300);
    await page.evaluate(() => { REEL.addClip(0, {kind:'new', words:'busy2', takes:['tw2']}); REEL.refresh(); }); await page.waitForTimeout(300);
    await page.click('#reelBtn'); await page.waitForTimeout(300); const del = await page.evaluate(() => { const b = document.querySelector('#card [data-del="' + REEL.R().id + '"]'); return !!b; });
    if(del){ await page.click('#card [data-del="' + await page.evaluate(() => REEL.R().id) + '"]'); await page.click('#card [data-del="' + await page.evaluate(() => REEL.R().id) + '"]'); await page.waitForTimeout(400); await page.evaluate(() => REEL.flushUndo()); }
    const b = await page.evaluate(() => ({stops:window.__stops.slice(), reels:REEL.S().reels.length, open:REEL.clips().length}));
    await page.evaluate(() => { const E = REEL.E(); E.info = window.__oi; E.stop = window.__os; REEL.refresh(); }); await page.click('[data-close]').catch(() => {});
    ok(a.stops.includes('tw1') && !a.left && del && b.stops.includes('tw2') && b.open > 0, '🗑 removing a clip or a reel stops its options that are still rendering (' + JSON.stringify({a, b, del}) + ')'); }
  // ↩ Undo after removing a clip / an option; ⧉ copy a reel (shared options are never forgotten); ‹ › move a clip; total length on top
  { await page.evaluate(() => { REEL.go(1); REEL.refresh(); }); await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ids:REEL.clips().map(c => c.id), n:REEL.cur().takes.length, pick:REEL.cur().pick}));
    await page.evaluate(() => { const E = REEL.E(); window.__fg = []; window.__of = E.forget; E.forget = ids => { window.__fg.push(...ids); return window.__of(ids); }; });
    await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edDel'); await page.click('#edDel'); await page.waitForTimeout(300);
    const mid = await page.evaluate(() => ({n:REEL.clips().length, toast:!!document.querySelector('.toast.und button')}));
    await page.click('.toast.und button'); await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ids:REEL.clips().map(c => c.id), fg:window.__fg.length}));
    ok(mid.toast && mid.n===before.ids.length - 1 && JSON.stringify(back.ids)===JSON.stringify(before.ids) && back.fg===0, '↩ Undo puts a removed clip back where it was, and nothing was forgotten (' + JSON.stringify({mid, back}) + ')');
    // an option
    const oid = await page.evaluate(() => { const c = REEL.cur(); return c.takes.find(id => id!==c.pick && REEL.info(id).state==='done') || null; });
    if(oid){ await page.click(`#opts [data-x="${oid}"]`); await page.click(`#opts [data-x="${oid}"]`); await page.waitForTimeout(300);
      const m2 = await page.evaluate(id => !REEL.cur().takes.includes(id), oid); await page.click('.toast.und button'); await page.waitForTimeout(300);
      const b2 = await page.evaluate(id => ({has:REEL.cur().takes.includes(id), fg:window.__fg.includes(id)}), oid);
      ok(m2 && b2.has && !b2.fg, '↩ Undo puts a removed option back (' + JSON.stringify({m2, b2}) + ')'); }
    // ⧉ copy, then remove the copy: the original keeps its options
    await page.click('#reelBtn'); await page.waitForTimeout(300); const r0 = await page.evaluate(() => REEL.R().id); await page.click(`#card [data-dup="${r0}"]`); await page.waitForTimeout(300);
    const cp = await page.evaluate(r0 => ({open:REEL.R().id, name:REEL.R().name, same:JSON.stringify(REEL.clips().map(c => c.takes))===JSON.stringify(REEL.S().reels.find(r => r.id===r0).clips.map(c => c.takes))}), r0);
    await page.click('#reelBtn'); await page.waitForTimeout(300); await page.click(`#card [data-del="${cp.open}"]`); await page.click(`#card [data-del="${cp.open}"]`); await page.waitForTimeout(300); await page.evaluate(() => REEL.flushUndo()); await page.click('[data-close]').catch(() => {});
    const after = await page.evaluate(r0 => { const r = REEL.S().reels.find(x => x.id===r0); return {fg:window.__fg.length, gone:r.clips.flatMap(c => c.takes).filter(id => REEL.info(id).state==='gone').length, open:REEL.R().id}; }, r0);
    ok(cp.open!==r0 && /copy$/.test(cp.name) && cp.same && after.fg===0 && after.gone===0 && after.open===r0, '⧉ a copied reel shares the options, and removing the copy forgets none of them (' + JSON.stringify({cp, after}) + ')');
    // ‹ › move
    await page.evaluate(() => { REEL.go(1); REEL.refresh(); }); await page.waitForTimeout(300); const ids0 = await page.evaluate(() => REEL.clips().map(c => c.id));
    await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edMvR'); await page.waitForTimeout(300);
    const mv = await page.evaluate(() => ({ids:REEL.clips().map(c => c.id), cur:REEL.R().cur}));
    ok(mv.ids[2]===ids0[1] && mv.ids[1]===ids0[2] && mv.cur===2, '‹ › Move later swaps the clip with the next one and stays on it (' + JSON.stringify({ids0, mv}) + ')');
    await page.evaluate(ids0 => { const cs = REEL.clips(); cs.sort((a, b) => ids0.indexOf(a.id) - ids0.indexOf(b.id)); REEL.go(0); REEL.refresh(); }, ids0);
    const top = await page.evaluate(() => document.querySelector('#reelName').textContent);
    ok(/\d+ clips · [\d.]+ s$/.test(top), '🎞 the top shows the reel\'s total length (' + top + ')');
    await page.evaluate(() => { REEL.E().forget = window.__of; }); }
  // 🔁 Make it loop in ✂ Edit: H3 Deck's loop as a new option of the clip
  { await page.evaluate(() => { REEL.go(0); REEL.refresh(); }); await page.waitForTimeout(300); const n0 = await page.evaluate(() => REEL.cur().takes.length);
    await page.click('#editBtn'); await page.waitForTimeout(300); await page.click('#edM [data-m="loop"]'); const vis = await page.evaluate(() => !document.querySelector('#edLp').hidden && document.querySelector('#edT').hidden);
    await page.click('#edLGo'); await page.waitForFunction(n => REEL.cur().takes.length > n, n0, {timeout:60000}).catch(() => {}); await page.waitForTimeout(800);
    const r = await page.evaluate(() => { const c = REEL.cur(), id = c.takes[c.takes.length - 1]; return {n:c.takes.length, loop:!!(c.meta[id] || {}).loop}; });
    const t = await eng.evaluate(() => { const t = H3.S.takes[0]; return {loop:!!(t.sm && t.sm.loop), up:!!t.up, fin:!!t.fin}; });
    ok(vis && r.n===n0 + 1 && r.loop && t.loop && !t.up, '🔁 Make it loop in ✂ Edit sends H3 Deck\'s loop (no regenerate) as a new option (' + JSON.stringify({vis, r, t, n0}) + ')');
    await page.click('[data-close]').catch(() => {}); await finish(); }
  // 🕘 words used before in this reel, one tap away in ➕ Next
  { await page.click('#nextBtn'); await page.waitForTimeout(300); const r = await page.evaluate(() => { const b = document.querySelector('.recent [data-rw]'); if(!b) return {n:0}; b.click(); return {n:document.querySelectorAll('.recent [data-rw]').length, v:document.querySelector('#nxW').value, t:b.textContent}; });
    ok(r.n > 0 && r.v && r.t.replace('…', '').length > 0 && r.v.indexOf(r.t.replace('…', ''))===0, '🕘 ➕ Next shows words used before in this reel; a tap puts them in the box (' + JSON.stringify(r) + ')'); await page.click('[data-close]').catch(() => {}); }
  // ✍ a new shot (a cut) right after the current clip, from ➕ Next's sheet
  { await page.evaluate(() => { REEL.go(0); REEL.refresh(); }); await page.waitForTimeout(300); const ids0 = await page.evaluate(() => REEL.clips().map(c => c.id));
    await page.click('#nextBtn'); await page.waitForTimeout(300); await page.click('#card [data-act="make"]'); await page.waitForTimeout(300);
    const title = await page.evaluate(() => document.querySelector('#card h3').textContent); await page.fill('#mkW', 'Mia stands at the window'); await page.click('#mkGo'); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({ids:REEL.clips().map(c => c.id), kind:REEL.clips()[1].kind, cur:REEL.R().cur, n:REEL.clips()[1].takes.length}));
    ok(/New shot after clip 1/.test(title) && r.ids.length===ids0.length + 1 && r.ids[0]===ids0[0] && r.ids[2]===ids0[1] && r.kind==='new' && r.cur===1 && r.n > 0, '✍ New shot from ➕ Next goes right after the current clip (' + JSON.stringify({title, r}) + ')');
    await page.evaluate(() => { REEL.clips().splice(1, 1); REEL.go(0); REEL.refresh(); }); await finish(); }
  // 🔗 Then keep going: lines under ➕ Next each carry on from the clip before once it's done
  { await page.evaluate(() => { REEL.go(REEL.clips().length - 1); REEL.refresh(); }); await page.waitForTimeout(300); const n0 = await page.evaluate(() => REEL.clips().length);
    await page.click('#nextBtn'); await page.waitForTimeout(300); await page.evaluate(() => { document.querySelector('#nxThen').open = true; }); await page.fill('#nxW', 'Mia sits down'); await page.fill('#nxT', 'Mia waves\n\nMia smiles at the camera');
    await page.click('#nxGo'); await page.waitForTimeout(2500); const a = await page.evaluate(() => ({n:REEL.clips().length, ch:REEL.R().chain && REEL.R().chain.lines.length, box:document.querySelector('#chainBox').textContent}));
    await finish(); await page.evaluate(() => REEL.chainTick()); await page.waitForTimeout(2500); const b = await page.evaluate(() => ({n:REEL.clips().length, w:REEL.clips()[REEL.clips().length - 1].words, ch:REEL.R().chain && REEL.R().chain.lines.length, kind:REEL.clips()[REEL.clips().length - 1].kind}));
    const t = await eng.evaluate(() => { const t = H3.S.takes[0]; return {cont:!!t.cont || !!(t.carry), p:t.prompt}; });
    await finish(); await page.evaluate(() => REEL.chainTick()); await page.waitForTimeout(2500); const c = await page.evaluate(() => ({n:REEL.clips().length, w:REEL.clips()[REEL.clips().length - 1].words, ch:REEL.R().chain}));
    ok(a.n===n0 + 1 && a.ch===2 && /2 more clips/.test(a.box) && b.n===n0 + 2 && /waves/.test(b.w) && b.kind==='next' && b.ch===1 && t.cont && /waves/.test(t.p) && c.n===n0 + 3 && /smiles/.test(c.w) && !c.ch,
      '🔗 Then keep going makes each line as a ➕ Next of the clip before, one after another, then stops (' + JSON.stringify({a, b, t, c}) + ')');
    await page.evaluate(n0 => { REEL.clips().splice(n0); REEL.go(0); REEL.refresh(); }, n0); await finish(); }
  // ⚠ on the wheel where a join may jump; ↻ Try all failed again
  { const r = await page.evaluate(async () => { const cs = REEL.clips(), c = cs[1], m = c.meta[c.pick] = c.meta[c.pick] || {}, keep = m.after; m.after = 'tnotthepick'; REEL.refresh(); await new Promise(r => setTimeout(r, 300));
      const on = !!document.querySelectorAll('#wheel .wi')[1].querySelector('.jmp'); if(keep===undefined) delete m.after; else m.after = keep; REEL.refresh(); await new Promise(r => setTimeout(r, 300));
      const off = !!document.querySelectorAll('#wheel .wi')[1].querySelector('.jmp'); return {on, off}; });
    ok(r.on && !r.off, '⚠ the wheel marks a clip whose join from the clip before may jump (' + JSON.stringify(r) + ')');
    const x = await page.evaluate(async () => { const E = REEL.E(), oi = E.info, orr = E.retry, got = []; const id = REEL.clips()[0].takes[0], base = REEL.clips().flatMap(c => c.takes).filter(q => q!==id && REEL.info(q).state==='failed').length;
      E.info = q => q===id ? {state:'failed', err:'x'} : oi(q); E.retry = async q => { got.push(q); return true; }; REEL.refresh(); await new Promise(r => setTimeout(r, 200));
      const b = document.querySelector('#retryAll'), vis = !b.hidden, t = b.textContent; b.click(); await new Promise(r => setTimeout(r, 300)); E.info = oi; E.retry = orr; REEL.refresh(); return {vis, t, got, id, base}; });
    ok(x.vis && new RegExp('Try ' + (x.base + 1) + ' failed again').test(x.t) && x.got.length===x.base + 1 && x.got.includes(x.id), '↻ Try all failed again sends every failed option of the reel again (' + JSON.stringify(x) + ')'); }
  // 📡 the clip's PC goes off while it's showing: the player switches to the same file on the other PC
  { const r = await page.evaluate(async () => { const E = REEL.E(), old = E.pcs; E.pcs = () => [{name:'Gone', url:'http://gone.test', online:false}, {name:'Main', url:'http://main.test', online:true}];
      const v = document.querySelector('#vA'); v.dataset.tried = ''; v.src = 'http://gone.test/view?filename=x.mp4&subfolder=Output_Render%2FH3Deck&type=output';
      for(let i = 0; i < 40 && !/main\.test/.test(v.getAttribute('src')); i++) await new Promise(r => setTimeout(r, 100)); E.pcs = old; return v.getAttribute('src'); });
    ok(/^http:\/\/main\.test\/view\?filename=x\.mp4/.test(r), '📡 a clip whose PC went off plays from the other PC (' + r + ')'); await page.evaluate(() => { REEL.go(0); REEL.refresh(); }); }
  // 🎞 switching reels while a ➕ Next is sending: the new clip still goes into the reel it was made in
  { await page.evaluate(() => { REEL.go(REEL.clips().length - 1); REEL.refresh(); }); await page.waitForTimeout(300);
    const a = await page.evaluate(() => ({id:REEL.R().id, n:REEL.clips().length}));
    await page.evaluate(() => { const E = REEL.E(); window.__oc = E.carry; E.carry = async () => { await new Promise(r => setTimeout(r, 900)); return {ids:['tswitch']}; }; });
    await page.click('#nextBtn'); await page.waitForTimeout(300); await page.fill('#nxW', 'she waves'); await page.click('#nxGo'); await page.waitForTimeout(150);
    const bId = await page.evaluate(() => { const S = REEL.S(), r = {id:'rB' + Date.now(), name:'Other', clips:[], cur:0, t:Date.now()}; S.reels.push(r); S.open = r.id; REEL.refresh(); return r.id; });
    await page.waitForTimeout(1500);
    const x = await page.evaluate(o => { const S = REEL.S(), A = S.reels.find(r => r.id===o.a), B = S.reels.find(r => r.id===o.b); return {open:S.open, nA:A.clips.length, inA:A.clips.some(c => c.takes.includes('tswitch')), nB:B.clips.length}; }, {a:a.id, b:bId});
    await page.evaluate(o => { const E = REEL.E(), S = REEL.S(); E.carry = window.__oc; S.reels = S.reels.filter(r => r.id!==o.b); S.open = o.a; const A = S.reels.find(r => r.id===o.a); A.clips = A.clips.filter(c => !c.takes.includes('tswitch')); REEL.refresh(); }, {a:a.id, b:bId});
    ok(x.inA && x.nA===a.n + 1 && x.nB===0 && x.open===bId, '🎞 a ➕ Next sent just before opening another reel lands in its own reel, and the other reel stays open (' + JSON.stringify(x) + ')'); }
  // 🕳 a clip with no options left says what to do
  { const t = await page.evaluate(async () => { REEL.addClip(0, {kind:'new', words:'none'}); REEL.go(0); REEL.refresh(); await new Promise(r => setTimeout(r, 300)); const m = document.querySelector('#vmsg').textContent; REEL.clips().splice(0, 1); REEL.refresh(); return m; });
    ok(/No options left/.test(t), '🕳 a clip with no options left says to ↻ Redo or remove it (' + t + ')'); }
  // 💾 preview pictures are capped at about 1.5 MB, so the reels always have room to save
  { const r = await page.evaluate(() => { const TH = REEL.TH(), big = 'data:image/jpeg;base64,' + 'A'.repeat(30000); for(let i = 0; i < 300; i++) TH['zz' + i] = big; REEL.saveTh();
      const n = (localStorage.getItem('h3reel_th') || '').length; Object.keys(TH).filter(k => /^zz/.test(k)).forEach(k => delete TH[k]); REEL.saveTh(); return n; });
    ok(r > 0 && r <= 1.5e6, '💾 preview pictures are capped at about 1.5 MB so the reels can always save (' + r + ')'); }
  // 2026-11-23 overnight: tapping the option already in use keeps its trim (it used to reset it); ➕ Next on a clip still rendering says why
  { await page.evaluate(() => { const cs = REEL.clips(); let i = cs.findIndex(c => c.pick && REEL.info(c.pick).state==='done'); REEL.go(i); const c = REEL.cur(); c.in = 0.5; REEL.refresh(); });
    await page.waitForTimeout(300); const id = await page.evaluate(() => REEL.cur().pick); await page.click(`#opts [data-o="${id}"]`); await page.waitForTimeout(200);
    ok(await page.evaluate(() => REEL.cur().in===0.5), 'tapping the option already in use keeps its ✂ trim');
    await page.evaluate(() => { REEL.cur().in = 0; REEL.refresh(); }); }
  { const w = await page.evaluate(async () => { document.querySelector('#sheet').hidden = true; const c = REEL.cur(), keep = c.pick, kt = c.takes; c.takes = []; c.pick = null; REEL.refresh(); document.querySelector('#nextBtn').click(); await new Promise(r => setTimeout(r, 200));
      const t = [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | '), sheet = !document.querySelector('#sheet').hidden; document.querySelector('#sheet').hidden = true; c.takes = kt; c.pick = keep; REEL.refresh(); return {t, sheet}; });
    ok(!w.sheet && /Redo|rendering/.test(w.t), '➕ Next with nothing finished says why instead of doing nothing (' + JSON.stringify(w) + ')'); }
  // a send that finishes after its sheet was closed and another opened leaves the new sheet alone
  { const r = await page.evaluate(async () => { const E = REEL.E(), mk = E.make; let go; E.make = o => new Promise(res => { go = () => res({ids:['tFakeSend']}); });
      document.querySelector('[data-act="make"]') || null; REEL.go(0); document.querySelector('#nextBtn').click(); await new Promise(z => setTimeout(z, 200));
      const card = document.querySelector('#card'); card.querySelector('[data-act="make"]').click(); await new Promise(z => setTimeout(z, 200));
      document.querySelector('#mkW').value = 'first'; document.querySelector('#mkGo').click(); await new Promise(z => setTimeout(z, 100));
      document.querySelector('[data-close]').click(); document.querySelector('#nextBtn').click(); await new Promise(z => setTimeout(z, 200)); document.querySelector('#nxW').value = 'typing here';
      go(); await new Promise(z => setTimeout(z, 300)); E.make = mk; REEL.clips().splice(REEL.clips().findIndex(c => c.takes.includes('tFakeSend')), 1); REEL.refresh(); const o = {open:!document.querySelector('#sheet').hidden, v:(document.querySelector('#nxW') || {}).value}; document.querySelector('#sheet').hidden = true; return o; });
    ok(r.open && r.v==='typing here', 'a send finishing after its sheet was closed leaves the next sheet open (' + JSON.stringify(r) + ')'); }
  // 🎨 Style LoRA per clip (Jordan 2026-11-26): picked in the sheet, not a chip in the words; activation words go in out of sight; 🏁 finish only
  { const unetOf = (g, id) => { let n = g[id]; while(n && n.class_type!=='UNETLoader') n = g[(n.inputs.model || [])[0]]; return n ? n.inputs.unet_name : ''; };
    const styleOn = g => Object.entries(g).filter(([k, n]) => n.class_type==='LoraLoaderModelOnly' && /anime_style/.test(n.inputs.lora_name)).map(([k, n]) => ({unet:unetOf(g, k), str:n.inputs.strength_model}));
    await page.evaluate(() => { const cs = REEL.clips(), i = cs.length - 1 - [...cs].reverse().findIndex(c => c.pick && REEL.info(c.pick).state==='done'); REEL.go(i); REEL.refresh(); }); await page.waitForTimeout(400);
    await page.click('#nextBtn'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !!document.querySelector('.lsl [data-sa]') && !document.querySelector('.lsl [data-si]')), '🎨 the Next sheet has a ＋ Style LoRA button and no style LoRA yet');
    await page.click('.lsl [data-sa]'); await page.waitForTimeout(150);
    await page.selectOption('.lsl [data-si="0"] [data-sn]', 'minimax_h3_anime_style.safetensors'); await page.waitForTimeout(150);
    await page.fill('.lsl [data-si="0"] [data-sw]', 'anime_style_trigger'); await page.click('.lsl [data-si="0"] [data-sd="fin"]');
    await page.fill('#nxW', 'Mia stretches'); await page.click('#nSeg [data-n="1"]');
    const words = await page.inputValue('#nxW'); ok(!/anime_style/.test(words), 'the style LoRA stays out of the words box');
    let n0 = sent.filter(x => x.g).length; await page.click('#nxGo'); await page.waitForTimeout(2500);
    const g = sent.filter(x => x.g).slice(n0), t = await eng.evaluate(() => { const t = H3.S.takes[0]; return {loras:t.loras, styleL:t.styleL}; });
    const on = g.length ? styleOn(g[0].g) : [], txt = g.length ? JSON.stringify(nodes(g[0].g, 'MiniMaxH3ReferenceToVideo').map(n => n.inputs.prompt)) : '';
    ok(g.length===1 && on.length===1 && /PIKA/.test(on[0].unet) && on[0].str===0.8, '🏁 finish only: the style LoRA goes on the PIKA model only, at 0.8 (' + JSON.stringify(on) + ')');
    ok(/anime_style_trigger/.test(txt), 'its activation words are sent with the clip (' + txt.slice(0, 200) + ')');
    ok((t.loras || []).some(l => l.style && l.fin2 && /anime_style/.test(l.name)), 'the take keeps it as a style LoRA (' + JSON.stringify(t) + ')');
    ok(await page.evaluate(() => (REEL.cur().look.sl || []).length===1 && REEL.R().shotSl[0].side==='fin'), 'the new clip keeps it in its look');
    // ↻ Redo on that clip starts with it; take it off and the new option has none
    await page.click('#redoBtn'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelectorAll('.lsl [data-si]').length===1 && document.querySelector('.lsl [data-sn]').value==='minimax_h3_anime_style.safetensors'), '↻ Redo starts with the clip\'s style LoRA');
    await page.click('.lsl [data-sx]'); await page.waitForTimeout(150); await page.fill('#rdW', 'Mia sits'); await page.click('#nSeg [data-n="1"]');
    n0 = sent.filter(x => x.g).length; await page.click('#rdGo'); await page.waitForTimeout(2500);
    const g2 = sent.filter(x => x.g).slice(n0), t2 = await eng.evaluate(() => H3.S.takes[0].loras || []);
    ok(g2.length===1 && !styleOn(g2[0].g).length && !t2.some(l => /anime_style/.test(l.name)), 'with it taken off, the new option has no style LoRA (' + JSON.stringify(t2) + ')');
  }
  // ⏱ (Jordan 2026-11-27: "have Lora's start and stop at certain points"): a style LoRA on 25-75% of the run, cut into both models' steps
  { const unetOf = (g, id) => { let n = g[id]; while(n && n.class_type!=='UNETLoader') n = g[(n.inputs.model || [])[0]]; return n ? n.inputs.unet_name : ''; };
    await finish(); await page.click('#redoBtn'); await page.waitForTimeout(300);
    await page.click('.lsl [data-sa]'); await page.waitForTimeout(150);
    await page.selectOption('.lsl [data-si="0"] [data-sn]', 'minimax_h3_anime_style.safetensors'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => !!document.querySelector('.lsl [data-si="0"] .ltw [data-tp="all"].on')), '⏱ a new style LoRA is on for the whole run');
    await page.click('.lsl [data-si="0"] [data-tp="c"]'); await page.waitForTimeout(150);
    await page.$eval('.lsl [data-si="0"] [data-t0]', el => { el.value = 0.25; el.dispatchEvent(new Event('input', {bubbles:true})); });
    await page.$eval('.lsl [data-si="0"] [data-t1]', el => { el.value = 0.75; el.dispatchEvent(new Event('input', {bubbles:true})); });
    const note = await page.textContent('.lsl [data-si="0"] .twN'); ok(/On from 25% to 75%/.test(note) && /runs on both/.test(note), '⏱ the note says where it is on (' + note + ')');
    await page.fill('#rdW', 'Mia turns'); await page.click('#nSeg [data-n="1"]');
    const n0 = sent.filter(x => x.g).length; await page.click('#rdGo'); await page.waitForTimeout(2500);
    const g = (sent.filter(x => x.g).slice(n0)[0] || {}).g || {}, sas = Object.keys(g).filter(k => g[k].class_type==='SamplerCustomAdvanced');
    const withL = sas.filter(k => { let n = g[g[k].inputs.guider[0]]; n = g[(n.inputs.model || [])[0]]; while(n && n.class_type!=='UNETLoader'){ if(/anime_style/.test(n.inputs.lora_name || '')) return true; n = g[(n.inputs.model || [])[0]]; } return false; });
    ok(sas.length===4 && withL.length===2 && new Set(withL.map(k => /PIKA/.test(unetOf(g, g[g[k].inputs.guider[0]].inputs.model[0])))).size===2, '⏱ 4 stretches, the LoRA on in the middle two (one on vanilla, one on PIKA) (' + sas.length + '/' + withL.length + ')');
    ok(await page.evaluate(() => JSON.stringify(REEL.R().shotSl[0].tw)==='[0.25,0.75]'), '⏱ the clip keeps the window in its look');
  }
  // ⇿ (Jordan 2026-11-26: a Redo cut to a new shot halfway through) ↻ Redo on a middle clip can have a free ending instead of landing on the clip after
  { await finish(); await page.evaluate(() => { REEL.go(1); REEL.refresh(); }); await page.waitForTimeout(400); await page.click('#redoBtn'); await page.waitForTimeout(300);
    const a = await page.evaluate(() => ({seg:!!document.querySelector('#rdLand'), on:(document.querySelector('#rdLand .on') || {}).dataset, how:(document.querySelector('#rdHow') || {}).textContent}));
    ok(a.seg && a.on && a.on.l==='1' && /Lands between/.test(a.how), '⇿ ↻ Redo on a middle clip has Land on its first frame (on) / Free ending (' + JSON.stringify(a) + ')');
    await page.click('#rdLand [data-l="0"]'); await page.waitForTimeout(150);
    ok(/Carries on/.test(await page.textContent('#rdHow')), 'Free ending: it only carries on from the clip before');
    await page.fill('#rdW', 'Mia looks around'); const n0 = sent.filter(x => x.g).length; await page.click('#rdGo'); await page.waitForTimeout(2500);
    const t = await eng.evaluate(() => { const t = H3.S.takes[0]; return {carry:!!t.carry, gap:!!(t.lead && t.lead.gap)}; });
    ok(sent.filter(x => x.g).length > n0 && t.carry && !t.gap, 'the free-ending option is a carry-on, not pinned to the clip after (' + JSON.stringify(t) + ')');
    ok(await page.evaluate(() => { const N = REEL.clips()[2]; return REEL.R().rdLand && REEL.R().rdLand[N.id]===false; }), 'the choice is remembered for that pair of clips'); }
  // an untrimmed clip loops in the viewport (the browser pauses at the very end before the last timeupdate)
  { const r = await page.evaluate(async () => { const cs = REEL.clips(), i = cs.findIndex(c => c.pick && REEL.info(c.pick).state==='done'); REEL.go(i); const c = REEL.cur(); c.in = 0; c.out = null; REEL.refresh();
      await new Promise(z => setTimeout(z, 400)); const v = document.querySelector('#vA'); v.play().catch(() => {}); try{ v.currentTime = Math.max(0, (v.duration || 5) - 0.6); }catch(e){}
      await new Promise(z => setTimeout(z, 2200)); return {paused:v.paused, t:v.currentTime, d:v.duration}; });
    ok(!r.paused && r.t < 3.5, 'an untrimmed clip loops back to its start in the viewport (' + JSON.stringify(r) + ')'); }
  await page.screenshot({path:process.env.SHOT || '/tmp/reel.png'});
  if(process.env.SHOT3){ await page.evaluate(() => { document.querySelector('#sheet').hidden = true; REEL.setTab('lib'); }); await page.waitForTimeout(600); await page.screenshot({path:process.env.SHOT3, fullPage:true}); await page.evaluate(() => REEL.setTab('reel')); }
  if(process.env.SHOT2){ await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300); await page.click('#editBtn'); await page.waitForTimeout(800); await page.screenshot({path:process.env.SHOT2}); await page.click('[data-close]'); await page.click('#nextBtn'); await page.waitForTimeout(300); await page.screenshot({path:process.env.SHOT2.replace('.png', 'b.png')}); }
  ok(await page.evaluate(() => document.querySelector('#p2Btn').hidden && !document.querySelector('[data-p2]')), '🔑 Phase 2 is hidden for now');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
