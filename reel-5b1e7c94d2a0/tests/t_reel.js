// 🎞 Reel (2026-11-20): the simple clip app on H3 Deck's engine. Fake PCs; checks the engine keeps its own takes, the Library is
// shared, and New clip / ➕ Next / ⇿ Insert / ↻ Redo / ✂ trim with 🪄 blend / 🎨 change / the wheel all work.
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_reel.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'glow.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','NAGGuiderMiniMaxH3','CLIPTextEncode','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
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
    if(p==='/renderdeck/h3export'){ if(rt.request().method()==='POST'){ exps.push(JSON.parse(rt.request().postData())); return J({id:'ex1', state:'working'}); } return J({id:'ex1', state:'done', done:10, total:10, file:{filename:'reel_ex1.mp4', subfolder:'H3Film/reel', type:'output'}}); }
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)});
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.png', subfolder:'h3deck', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route('http://main.test/**', fake);
  // H3 Deck's own save: a Library character and its picture, one take of its own, the PCs
  const PNG = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-vhs-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true, qtext:'Soft film grain and gentle handheld sway.', negOn:true, neg:'blurry hands', h3Style:'A quiet indie film.'}, takes:[{id:'tDeck', t:1, state:'done', prompt:'H3 Deck take', pieces:[], imgs:[], vids:[], auds:[], follow:[]}],
    lib:[{id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}, {id:'Lpip', kind:'char', name:'Pip', stand:'cat girl', desc:'an anthro cat with orange fur', pics:['mPic'], keep:'exact', what:''}, {id:'Lfrk', kind:'attr', name:'Freckles', stand:'', desc:'light freckles', pics:[], keep:'exact', what:''}, {id:'Lglow', kind:'lora', name:'Glow', stand:'', desc:'', pics:[], keep:'exact', what:'soft glow light', loras:[{name:'glow.safetensors', str:0.8}]}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png', w:180, h:180, thumb:'data:image/png;base64,' + PNG}, mOld:{id:'mOld', kind:'img', name:'old.png', type:'image/png'}}, up:{['mPic|' + R]:'h3deck/h3deck_mPic.png'}};
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
  ok(g2.length===1 && t2.carry && t2.carry.own && t2.carry.src===other && /^\[0s-1s\] The scene keeps carrying on from the moment before\.\n\[1s-\] <Subject 1> sits down$/.test(t2.prompt), '➕ Next carries on from the picked option with the anchor line (' + JSON.stringify(t2) + ')');
  ok(nodes(g2[0].g, 'MiniMaxH3MotionContext').length || nodes(g2[0].g, 'LoadVideo').length, 'its graph loads the clip before as context');
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
  const ed = await page.evaluate(() => ({kinds:REEL.clips().map(c => c.kind).join(), out:REEL.clips()[0].out, d:REEL.info(REEL.clips()[0].pick).secs}));
  const g5 = sent.filter(x => x.g).slice(n0);
  ok(g5.length===1 && ed.kinds==='new,blend,insert,next' && ed.out > 2.5 && ed.out < 3.6, '✂ trimming the end blends it into the next clip: a 🪄 clip between them, clip 1 ends where the blend starts (' + JSON.stringify(ed) + ')');
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
  await finish();
  // 🎬 Final pass: ✨ High quality on every clip's picked option with Prism Pika, chained clip to clip, picked as a new option
  { const before = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, n:c.takes.length})));
    const w0 = await page.evaluate((async () => { const out = []; for(let i = 1; i < REEL.clips().length; i++){ REEL.go(i); await new Promise(r => setTimeout(r, 250)); out.push(/may jump/.test(document.querySelector('#warnBox').textContent)); } REEL.go(0); await new Promise(r => setTimeout(r, 250)); return out; }));
    await page.click('#finBtn'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => /Final pass on \d+ clip/.test(document.querySelector('#fnGo').textContent)), '🎬 Final pass sheet opens');
    await page.click('#fnGo'); await page.waitForTimeout(4000);
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
    // ⬆ a new option of an upscaled clip gets the same ✨ pass once it's done, and replaces it as the pick
    { const r = await page.evaluate(async () => { const c = REEL.cur(), src = c.meta[c.pick].src; const x = await REEL.E().again({take:src, words:'Mia waves', n:1}); const id = (x.ids || [])[0];
        REEL.addTakes(c, [id], {}, 'Mia waves'); c.pick = id; return {id, reup:c.meta[id].reup, n:c.takes.length}; });
      await finish(); await page.evaluate(() => REEL.reup()); await page.waitForTimeout(2500);
      const r2 = await page.evaluate(id => { const c = REEL.cur(), m = c.meta[c.pick] || {}; return {pick:c.pick, src:m.src, fin:m.fin, was:c.meta[id].reup, n:c.takes.length}; }, r.id);
      const t2 = await eng.evaluate(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {src:t.redo && t.redo.src, scale:t.up && t.up.scale}; }, r2.pick);
      ok(r.reup===1 && r2.src===r.id && r2.fin && r2.was===2 && r2.n===r.n + 1 && t2.src===r.id && t2.scale===1.5, '⬆ an edit of an upscaled clip is upscaled by itself when done and picked (' + JSON.stringify({r, r2, t2}) + ')');
      await finish(); }
    // ↩ Back to the originals
    await page.click('#finBtn'); await page.waitForTimeout(300); await page.click('#fnBack'); await page.waitForTimeout(400);
    const back = await page.evaluate(() => REEL.clips().map(c => ({pick:c.pick, up:!!c.up, cur:c===REEL.cur()})));
    ok(back.every((x, i) => !x.up && (x.cur || x.pick===before[i].pick)), '↩ Back to the originals picks each clip\'s option from before the final pass (' + JSON.stringify({back, before}) + ')');
    // ⬆ …and once the clips around it are back on their originals, a new option stays as it is (Jordan 2026-11-20)
    { const r = await page.evaluate(async () => { const c = REEL.cur(), base = c.pick; const x = await REEL.E().again({take:base, words:'Mia waves', n:1}); const id = (x.ids || [])[0];
        REEL.addTakes(c, [id], {}, 'Mia waves'); return {id, reup:c.meta[id].reup, n:c.takes.length}; });
      await finish(); await page.evaluate(() => REEL.reup()); await page.waitForTimeout(2500);
      const r2 = await page.evaluate(id => ({was:REEL.cur().meta[id].reup, n:REEL.cur().takes.length}), r.id);
      ok(r.reup===1 && r2.was===0 && r2.n===r.n, '⬆ a new option next to clips picked on their originals is not upscaled (' + JSON.stringify({r, r2}) + ')'); }
    await page.evaluate(b => { REEL.clips().forEach((c, i) => { c.pick = b[i].pick; c.up = false; }); REEL.refresh(); }, before); await page.waitForTimeout(300); }
  // ⬇ Export the reel: the picked option of every clip, trimmed, in order, joined on the PC; 📲 Save when done
  { await page.click('#finBtn'); await page.waitForTimeout(300); await page.click('#fnExp'); await page.waitForTimeout(2500);
    const cs = await page.evaluate(() => REEL.clips().map(c => { const I = REEL.info(c.pick); return {f:I.file && I.file.filename, a:c.in || 0}; }));
    const b = exps[exps.length - 1] || {clips:[]}; let at = 0;
    const good = b.clips.length===cs.length && b.clips.every((x, i) => { const r = x.filename===cs[i].f && x.in===cs[i].a && Math.abs(x.at - at) < 1e-6 && x.track===0; at += x.out - x.in; return r; }) && b.canvas && b.canvas[0] > b.canvas[1];
    ok(good && await page.evaluate(() => !!document.querySelector('#fnSave')), '⬇ Export sends every clip\'s picked option in order and offers 📲 Save when done (' + JSON.stringify({b, cs}) + ')');
    await page.click('[data-close]'); await page.waitForTimeout(300); }
  // ▶ Play all
  await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300); await page.click('#allBtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#allBtn').textContent==='■ Stop'), '▶ Play all starts'); await page.click('#allBtn');
  ok(await page.evaluate(() => { const r = REEL.R(), keep = r.clips, cur = r.cur; r.clips = [{id:'cx', kind:'new', words:'Mia waves', takes:[], pick:null}]; const p = REEL.redoPlan(0); r.clips = keep; r.cur = cur; return !p.err && /fresh/.test(p.how); }), '↻ Redo on a clip with no options left makes it fresh from its words');
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
    const dur = await page.evaluate(() => document.querySelector('#vA').duration);
    await page.mouse.move(vb.x + 20, vb.y + vb.h / 2); await page.mouse.down(); for(let k = 1; k <= 6; k++){ await page.mouse.move(vb.x + 20 + k * vb.w * 0.08, vb.y + vb.h / 2); await page.waitForTimeout(40); }
    const mid = await page.evaluate(() => ({t:parseFloat(document.querySelector('#scrubT').textContent), lab:!document.querySelector('#scrubT').hidden})); await page.mouse.up(); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({paused:document.querySelector('#vA').paused, lab:document.querySelector('#scrubT').hidden}));
    ok(mid.lab && Math.abs(mid.t - 0.48 * dur) < 0.25 * dur && after.paused && after.lab, '👆 dragging across the viewport scrubs it (' + JSON.stringify({dur, mid, after}) + ')'); }
  // 📚 Library tab: make a character here, put her in the reel
  await page.click('#tabs [data-tab="lib"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.querySelector('#libTab').hidden && document.querySelector('#reelTab').hidden && /Mia/.test(document.querySelector('#libAll').textContent)), '📚 the Library tab lists the characters');
  await page.click('#libAll [data-ch="new"]'); await page.waitForTimeout(200); await page.fill('#chN', 'Zoe'); await page.fill('#chD', 'short black hair');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#chAdd')]); await fc.setFiles(path.join(root, 'reel-5b1e7c94d2a0', 'icon-vhs-192.png')); await page.waitForTimeout(300);
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
  // a stylized character (🎨 kept from her pictures by default, scene follows her) with Mia in ✨ Freckles and her own clothes
  await page.evaluate(() => { REEL.R().attrs = {Lmia:['Lfrk']}; REEL.R().fit = {Lmia:true}; });
  await page.evaluate(() => { const R = REEL.R(); REEL.E().setAttrs(JSON.parse(JSON.stringify(R.attrs)), JSON.parse(JSON.stringify(R.fit)), {}, 'auto'); });
  const s2 = sent.length;
  const rid2 = await engF().evaluate(async () => { const r = await H3Engine.make({words:'Pip hugs Mia', who:[], n:1}); return r.ids ? r.ids[0] : JSON.stringify(r); });
  await page.waitForTimeout(2500);
  const rg2 = sent.slice(s2).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
  const rt2 = await engF().evaluate(id => { const t = H3.S.takes.find(x => x.id===id) || {}; return {seconds:t.seconds, styled:t.styled, look:t.look, scene:t.h3 && t.h3.scene}; }, rid2);
  const s3 = sent.length;
  await p2.evaluate(sec => { const S = H3.S, P = H3.libToCast(S.lib.find(x => x.id==='Lpip')), M = H3.libToCast(S.lib.find(x => x.id==='Lmia'));
    P.art = 'pic'; M.attrs = ['Lfrk']; M.fitHere = true; S.f.look = {src:'c', n:P.n, pics:[], redo:{}, use:true};
    S.f.prompt = '<Subject ' + P.n + '> hugs <Subject ' + M.n + '>'; S.f.seconds = sec; S.f.takes = 1; }, rt2.seconds || 5);
  await p2.click('#goBtn'); await p2.waitForTimeout(3000);
  const dg2 = sent.slice(s3).find(x => x.g && Object.values(x.g).some(n => /Sampler/.test(n.class_type)));
  const A2 = norm(rg2 && rg2.g), B2 = norm(dg2 && dg2.g), diff2 = [...new Set(Object.keys(A2).concat(Object.keys(B2)))].filter(k => A2[k]!==B2[k]);
  if(diff2.length) diff2.slice(0, 12).forEach(k => console.log('  DIFF node ' + k + '\n    Reel:    ' + (A2[k] || '(none)').slice(0, 1500) + '\n    H3 Deck: ' + (B2[k] || '(none)').slice(0, 1500)));
  ok(rg2 && dg2 && !diff2.length, '⚖ the same for a stylized character with Mia in ✨ Freckles and her own clothes (' + diff2.length + ' nodes differ)');
  ok(rt2.styled && rt2.look && rt2.look.src==='c' && /art style is kept/.test(JSON.stringify(rg2 && rg2.g)), '🎨 Pip (anthro, no H3 Deck setting) keeps her own art style and the scene follows her by default (' + JSON.stringify(rt2) + ')');
  await page.evaluate(() => { REEL.R().attrs = {}; REEL.R().fit = {}; });
  ok(rg && /Soft film grain/.test(JSON.stringify(rg.g)) && /blurry hands/.test(JSON.stringify(rt)), "⚖ Reel uses H3 Deck's ✍ Custom quality words and 🚫 Keep out (" + JSON.stringify(rt) + ')');
  // ✨ 🧩 attributes and LoRA chips, as H3 Deck's Library has them
  await page.click('#tabs [data-tab="lib"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => [...document.querySelectorAll('#sceneSeg button')].map(b => (b.classList.contains('on') ? '*' : '') + b.textContent).join('|')).then(x => /^\*✨ Auto\|Off\|🧊.*\|🎥 Realistic$/.test(x)), '🎨 the Library tab has the Scene style row, ✨ Auto by default');
  ok(await page.evaluate(() => /Freckles/.test(document.querySelector('#libAttr').textContent) && /Glow/.test(document.querySelector('#libLora').textContent) && !!document.querySelector('#libWear [data-ex="new:wear"]')), '📚 the Library tab has ✨ Attributes, 👗 Clothing and 🧩 LoRAs');
  await page.click('#libIn [data-ch="Lmia"]'); await page.waitForTimeout(200); await page.click('#chA [data-at="Lfrk"]'); await page.click('#chA [data-fit]'); const artRow = await page.evaluate(() => [...document.querySelectorAll('#chArt button')].map(b => (b.classList.contains('on') ? '*' : '') + b.textContent).join('|'));
  ok(/^\*Off\|🖼 As in the pictures\|🧊 3D animated\|✏ 2D anime\|🖍 Cartoon$/.test(artRow), "🎨 Mia's card has Keep her own art style, off for her (" + artRow + ')'); await page.click('[data-close]');
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
  // 🧹 Keep only this option (tap twice)
  { await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300); const n = await page.evaluate(() => REEL.cur().takes.length);
    await page.click('#keepOne'); await page.waitForTimeout(200); const mid = await page.evaluate(() => ({n:REEL.cur().takes.length, t:document.querySelector('#keepOne').textContent}));
    await page.click('#keepOne'); await page.waitForTimeout(500); const r = await page.evaluate(() => ({n:REEL.cur().takes.length, opts:document.querySelectorAll('#opts .opt').length, btn:!!document.querySelector('#keepOne')}));
    ok(n > 1 && mid.n===n && /Tap again/.test(mid.t) && r.n===1 && r.opts===1 && !r.btn, '🧹 Keep only this option asks for a second tap, then leaves only the picked option (' + JSON.stringify({n, mid, r}) + ')'); }
  await page.screenshot({path:process.env.SHOT || '/tmp/reel.png'});
  if(process.env.SHOT2){ await page.evaluate(() => REEL.go(0)); await page.waitForTimeout(300); await page.click('#editBtn'); await page.waitForTimeout(800); await page.screenshot({path:process.env.SHOT2}); await page.click('[data-close]'); await page.click('#nextBtn'); await page.waitForTimeout(300); await page.screenshot({path:process.env.SHOT2.replace('.png', 'b.png')}); }
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
