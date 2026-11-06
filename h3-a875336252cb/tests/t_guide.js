// 🦴 Guidance track: one track's skeleton + depth guides the renders on the tracks above it (fake ComfyUI, nothing renders).
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_guide.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
  ModelPatchLoader:{input:{required:{name:[['minimax_h3_fun_controlnet_union.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'Video Slice','ImageFromBatch','TrimAudioDuration','DWPreprocessor','DepthAnythingV2Preprocessor','MiniMaxH3FunControlNetApply'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t), node = (g, t) => nodes(g, t)[0];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8021);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], views = [], QP = [], DEL = [], EXP = [];
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
    if(p==='/renderdeck/h3export'){ if(rt.request().method()==='POST'){ EXP.push(JSON.parse(rt.request().postData())); return J({id:'gx' + EXP.length}); } return J({state:'done', done:10, total:10, file:{filename:'Film guide_gx1abc.mp4', subfolder:'H3Film/_preview', type:'output'}}); }
    if(p.startsWith('/history/')){ const pid = p.slice(9), s = sent.find(x => x.pid===pid); if(s && Object.values(s.g).some(n => n.class_type==='DWPreprocessor')){ const outs = {}; Object.entries(s.g).filter(([, n]) => n.class_type==='SaveVideo').forEach(([id, n]) => outs[id] = {images:[{filename:n.inputs.filename_prefix.split('/').pop() + '_00001_.mp4', subfolder:'H3Deck/guides', type:'output'}]}); return J({[pid]:{status:{completed:true, status_str:'success', messages:[]}, outputs:outs}}); } return J({}); }
    if(p==='/history') return J({pz:{prompt:[0, 'pz', {'5':{class_type:'MiniMaxH3ReferenceToVideo', inputs:{prompt:'This continues straight on. she waves goodbye at the door'}}}], status:{completed:true, messages:[]},
      outputs:{'9':{images:[{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_202611060001_zz9q', type:'output'}]}, '12':{images:[{filename:'h3_202611060001_zz9q_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_202611060001_zz9q', type:'output'}]}}}});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route(M + '/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:'http://main.test', on:true, speed:1.26}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8021/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  // a finished 5 s take (one piece, 120 frames)
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => { H3.S.takes.unshift({id:'tA', t:Date.now(), pc:R, model:m, turbo:true, loras:[], w:640, h:352, seed:1, name:'h3_a', dir:'H3Deck/h3_a', prompt:'she walks to the window', seconds:5, imgs:[], vids:[], auds:[], follow:[],
    pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'she walks to the window', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}], state:'done', final:{filename:'h3_a_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  await page.evaluate(m => { H3.S.f.model = m; H3.S.f.turbo = true; H3.S.cast.push({n:1, kind:'char', stand:'a woman', who:'', pic:null, keep:'exact'}); H3.S.takes[0].prompt = '<Subject 1> walks to the window'; H3.S.takes[0].pieces[0].prompt = '<Subject 1> walks to the window'; H3.saveNow(); }, fam.find(k => /hybrid/.test(k)) || fam[0]);
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  // track 2 = the rough version: two clips (at 0 and at 5 s); track 1 is empty
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}, {id:'tr2', clips:[]}], pps:24}; FILM.S.films.unshift(f); FILM.addClip(f, FILM.takeOf('tA'), 1); FILM.addClip(f, FILM.takeOf('tA'), 1); FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  ok(await fr.evaluate(() => !!document.querySelector('[data-act="guideSheet"]')), 'the guidance track is back on (Jordan 2026-11-06 07:12)');
  await fr.click('[data-act="guideToggle"]'); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => !document.querySelector('[data-act="guideSheet"]') && FILM.guideOpt(FILM.S.films[0], 0, 0)===null && /off/.test(document.querySelector('[data-act="guideToggle"]').textContent)), '🦴 Guide off switches it off');
  await fr.click('[data-act="guideToggle"]'); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => !!document.querySelector('[data-act="guideSheet"]')), 'the timeline has 🦴 Guidance track');
  await fr.click('[data-act="guideSheet"]'); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => /No guidance track yet/.test(document.querySelector('#gdStat').textContent) && document.querySelectorAll('#gdRows [data-gd^="make"]').length===2), 'the sheet: no guide yet, 🦴 Make it the guide on each track');
  const n0 = sent.length; await fr.click('[data-gd="make:1"]');
  ok(EXP.length===1 && EXP[0].preview && EXP[0].clips.length===2 && EXP[0].clips.every(c => c.track===0) && EXP[0].clips.map(c => c.at).join()==='0,5', '🦴 the PC writes only that track as one video on film time (' + JSON.stringify(EXP[0] && EXP[0].clips.map(c => c.at)) + ')');
  await fr.waitForFunction(() => FILM.S.films[0].guide && FILM.S.films[0].guide.state==='done', null, {timeout:20000}).catch(() => {});
  const gr = sent.slice(n0).find(s => Object.values(s.g).some(n => n.class_type==='DWPreprocessor'));
  const G = await page.evaluate(() => JSON.parse(JSON.stringify(H3.S.guides.fA || null)));
  ok(gr && G && G.sk && G.dp && await fr.evaluate(() => FILM.S.films[0].guide.state==='done'), '🦴 its skeleton and depth are read (DWPose + depth) and kept for the film (' + JSON.stringify(G) + ')');
  ok(await fr.evaluate(() => { const f = FILM.S.films[0]; return f.tracks[1].guide && f.tracks[0].follow===true && JSON.stringify(FILM.guideOpt(f, 0, 2))===JSON.stringify({film:'fA', off:2}) && FILM.guideOpt(f, 1, 0)===null; }), 'tracks above follow it, the guide track itself does not');
  ok(await fr.evaluate(() => /🦴 guide/.test(document.querySelector('.trk[data-k="1"] .tn').textContent) && /🦴/.test(document.querySelector('.trk[data-k="0"] .tn').textContent)), 'the track labels say which is the guide and which follow it');
  // 🔒 the guide track is locked: its clips don't drag, split, delete; 🔓 Unlock lets them
  const lk = await fr.evaluate(async () => { const f = FILM.S.films[0], c = f.tracks[1].clips[0], at0 = c.at, n0 = f.tracks[1].clips.length;
    const el = document.querySelector('.clip[data-c="' + c.id + '"]'), r = el.getBoundingClientRect(), o = {bubbles:true, pointerType:'mouse', pointerId:1, clientY:r.top + r.height / 2};
    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({clientX:r.left + 20}, o))); el.dispatchEvent(new PointerEvent('pointermove', Object.assign({clientX:r.left + 120}, o))); el.dispatchEvent(new PointerEvent('pointerup', Object.assign({clientX:r.left + 120}, o)));
    const moved = FILM.S.films[0].tracks[1].clips[0].at!==at0; const del = document.querySelector('[data-act="delClip"]'); if(del){ del.disabled = false; del.click(); } await new Promise(r => setTimeout(r, 100));
    const left = FILM.S.films[0].tracks[1].clips.length; return {moved, kept:left===n0, locked:FILM.lockedK(FILM.S.films[0], 1), lbl:/🔒/.test(document.querySelector('.trk[data-k="1"] .tn').textContent)}; });
  ok(!lk.moved && lk.kept && lk.locked && lk.lbl, '🔒 the guide track is locked: a drag doesn\'t move its clip and 🗑 doesn\'t delete it (' + JSON.stringify(lk) + ')');
  await fr.evaluate(() => FILM.guideSheet(FILM.S.films[0])); await page.waitForTimeout(150); await fr.click('[data-gd="lock:1"]'); await page.waitForTimeout(150);
  ok(await fr.evaluate(() => !FILM.lockedK(FILM.S.films[0], 1)), '🔓 Unlock in the 🦴 sheet lets it be changed');
  await fr.click('[data-gd="lock:1"]'); await fr.evaluate(() => { document.querySelector('#sheet').hidden = true; FILM.draw(); });
  // ▶ one clip at a time over the guide (Jordan 2026-11-06): clip 1 = the form's Takes (2 here, split across the PCs), its words and length
  await fr.evaluate(() => FILM.guideSheet(FILM.S.films[0])); await page.waitForTimeout(200);
  await fr.click('#gdN [data-v="2"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => H3.S.f.takes===2), 'the 🦴 sheet\'s Takes picker sets how many takes (the form\'s Takes)');
  page.on('dialog', d => d.accept()); fr.page().on('dialog', () => {});
  ok(await fr.evaluate(() => /Clip 1 of 2 over the guide/.test(document.querySelector('[data-gd="fill:0"]').textContent) ), 'the sheet offers ▶ Clip 1 of 2 over the guide');
  const n1 = sent.length; await fr.click('[data-gd="fill:0"]'); await page.waitForTimeout(2500);
  const fills = sent.slice(n1);
  const sl = fills.map(s => nodes(s.g, 'Video Slice').map(n => n.inputs.start_time)), cn = fills.map(s => nodes(s.g, 'MiniMaxH3FunControlNetApply').length), pr = fills.map(s => node(s.g, 'MiniMaxH3ReferenceToVideo') && node(s.g, 'MiniMaxH3ReferenceToVideo').inputs.prompt);
  const ft = await page.evaluate(() => H3.S.takes.filter(t => t.toFilm && t.toFilm.track).map(t => ({id:t.id, s:t.seconds, at:t.toFilm.at, len:t.toFilm.len, pc:t.pc, g:!!t.guided})));
  console.log(JSON.stringify({sl, cn, ft}));
  ok(ft.length===2 && ft.every(x => Math.abs(x.s - 5) < 0.01 && x.at===0 && x.len===5 && x.g) && fills.length===2 && cn.every(x => x===2) && sl.every(x => x.every(y => y===0)), '▶ clip 1: two 5 s takes from 0 s, each following the guide (' + JSON.stringify(ft) + ')');
  ok(pr.every(p => /A woman walks to the window/.test(p || '') && !/\[\d/.test(p || '')), 'with that clip\'s own words, no time codes (👥 <Subject 1> sent as "a woman")');
  // the first take finishes (as a PC would), lands in the clip; the sheet then offers clip 2, which carries on from it
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); t.state = 'done'; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:'piece_01_00001_.mp4', subfolder:'Output_Render/' + t.dir, type:'output'}; }); t.final = {filename:t.name + '_00001_.mp4', subfolder:'Output_Render/' + t.dir, type:'output'}; H3.saveNow(); }, await fr.evaluate(() => { FILM.placeNew(); FILM.draw(); return FILM.S.films[0].tracks[0].clips[0].take; }));
  await fr.evaluate(() => { FILM.placeNew(); FILM.draw(); }); await page.waitForTimeout(300);
  const pl = await fr.evaluate(() => FILM.S.films[0].tracks[0].clips.map(c => [c.at, c.in, c.out, !!FILM.takeOf(c.take) && !!FILM.takeOf(c.take).guided]));
  ok(pl.length===1 && pl[0][0]===0 && Math.abs(pl[0][2] - 5) < 0.01 && pl[0][3], '▶ clip 1 lands on track 1 at 0 s, 5 s long (' + JSON.stringify(pl) + ')');
  await fr.evaluate(() => FILM.guideSheet(FILM.S.films[0])); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => /Clip 2 of 2 over the guide/.test(document.querySelector('[data-gd="fill:0"]').textContent)), 'then the sheet offers ▶ Clip 2 of 2');
  // the track shows the guide clip still to make in grey; tap it, pick takes, ▶ Render this clip (Jordan 2026-11-06)
  await fr.evaluate(() => { document.querySelector('#sheet').hidden = true; FILM.draw(); }); await page.waitForTimeout(200);
  const gh = await fr.evaluate(() => ({n:FILM.ghostsOf(FILM.S.films[0], 0).length, el:document.querySelectorAll('.trk[data-k="0"] .ghost').length, lbl:(document.querySelector('.trk[data-k="0"] .ghost') || {}).textContent}));
  ok(gh.n===1 && gh.el===1 && /2 · tap to render/.test(gh.lbl), 'the guide clip still to make shows on the track in grey (' + JSON.stringify(gh) + ')');
  await fr.evaluate(() => document.querySelector('.trk[data-k="0"] .ghost').click()); await page.waitForTimeout(200);
  const gn = await fr.evaluate(() => document.querySelector('#selNote').textContent);
  ok(/Guide clip 2 of 2/.test(gn) && /carries on from the clip before it/.test(gn) && /Render this clip/.test(gn), 'tapping it shows its words, takes and ▶ Render this clip (' + gn.slice(0, 160) + ')');
  await fr.evaluate(() => document.querySelector('[data-act="ghostN"][data-v="2"]').click());
  const n3 = sent.length; await fr.evaluate(() => document.querySelector('[data-act="ghostGo"]').click()); await page.waitForTimeout(3000);
  const c2 = sent.slice(n3), cs2 = c2.map(s => nodes(s.g, 'Video Slice').map(n => n.inputs.start_time)), mc = c2.map(s => Object.values(s.g).some(n => /MotionContext|LoadVideo|VHS_LoadVideo/i.test(n.class_type)));
  const ct2 = await page.evaluate(() => H3.S.takes.filter(t => t.carry && t.carry.len).map(t => ({s:t.seconds, len:t.carry.len, g:!!t.guided || !!(t.ctl && t.ctl.off), off:t.ctl && t.ctl.off})));
  console.log(JSON.stringify({cs2, mc, ct2, toastF:await fr.evaluate(() => (document.querySelector('#toast') || {}).textContent), toastD:await page.evaluate(() => (document.querySelector('#toast') || {}).textContent), why:await page.evaluate(() => { const b = document.querySelector('#goBtn'); return [b.disabled, b.textContent, (document.querySelector('#goWhy') || {}).textContent, H3.S.f.fl, H3.S.tab]; })}));
  ok(c2.length===2 && ct2.length===2 && ct2.every(x => x.len===5 && Math.abs(x.s - 5) < 0.01) && mc.every(Boolean), '▶ clip 2: two takes carrying on from clip 1\'s take, 5 s each (' + JSON.stringify(ct2) + ')');
  // 💬 words only: a track set to not follow renders the guide clip's words with no skeleton/depth ControlNet
  const n4 = sent.length; await fr.evaluate(async () => { const f = FILM.S.films[0]; f.tracks.unshift({id:'trW', clips:[], over:true, follow:false}); FILM.save(); FILM.draw(); const gc = f.tracks.find(t => t.guide).clips.slice().sort((a, b) => a.at - b.at)[0]; await FILM.guideGo(f, 0, gc); }); await page.waitForTimeout(2000);
  const wo = sent.slice(n4), wcn = wo.map(s => nodes(s.g, 'MiniMaxH3FunControlNetApply').length), wpr = wo.map(s => node(s.g, 'MiniMaxH3ReferenceToVideo') && node(s.g, 'MiniMaxH3ReferenceToVideo').inputs.prompt);
  ok(wo.length >= 1 && wcn.every(x => x===0) && wpr.every(p => /walks to the window/.test(p || '')), '💬 words only: the guide clip\'s words, no skeleton or depth (' + JSON.stringify(wcn) + ')');
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks = f.tracks.filter(t => t.id!=='trW'); FILM.save(); FILM.draw(); });
  await page.evaluate(() => window.scrollTo(0, 0)); await fr.evaluate(() => FILM.guideSheet(FILM.S.films[0])); await page.waitForTimeout(200); await fr.click('[data-gd="fill:words"]'); await page.waitForTimeout(300);
  const wb = await fr.evaluate(() => { const f = FILM.S.films[0], t = f.tracks[0]; return {follow:t.follow, over:t.over, gh:FILM.ghostsOf(f, 0).length, n:f.tracks.length}; });
  ok(wb.follow===false && wb.over && wb.gh===2, '＋ New track on top: 💬 words only makes a no-bones track with the guide\'s clips in grey (' + JSON.stringify(wb) + ')');
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks.shift(); FILM.save(); FILM.draw(); });
  // ↻ Redo on a following track gets the guide at the right film time
  const n2 = sent.length; await page.evaluate(() => window.H3Redo({take:'tA', a:1, b:3, prompt:'she turns', n:1, film:'fA', clip:'x', guide:{film:'fA', off:5}})); await page.waitForTimeout(1200);
  const rd = sent.slice(n2)[0], rs = rd ? nodes(rd.g, 'Video Slice').map(n => n.inputs.start_time) : [];
  const s0 = await page.evaluate(() => H3.S.takes.find(t => t.redo && t.guided).redo.s0);
  ok(rd && rs.length===2 && rs.every(x => Math.abs(x - (5 + s0 / 24)) < 0.01), '↻ a redo on a following track uses the guide from where its window sits on the film (' + rs.join(',') + ')');
  // ✕ Not the guide
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await fr.evaluate(() => FILM.guideSheet(FILM.S.films[0])); await page.waitForTimeout(200); await fr.click('[data-gd="off:1"]');
  ok(await fr.evaluate(() => FILM.guideOpt(FILM.S.films[0], 0, 1)===null), '✕ Not the guide: nothing follows it any more');
  // 🗑 any track can be deleted, clips and all (asks first); ↶ Undo brings it back
  const dt = await fr.evaluate(async () => { const f = FILM.S.films[0], n0 = f.tracks.length, c0 = f.tracks[0].clips.length; FILM.draw(); await new Promise(r => setTimeout(r, 100)); const b = document.querySelector('[data-act="delTrack"][data-k="0"]'); if(b) b.click(); await new Promise(r => setTimeout(r, 150));
    const n1 = FILM.S.films[0].tracks.length; FILM.undo(); await new Promise(r => setTimeout(r, 150)); return {btn:!!b, c0, n0, n1, n2:FILM.S.films[0].tracks.length}; });
  ok(dt.btn && dt.c0 > 0 && dt.n1===dt.n0 - 1 && dt.n2===dt.n0, '🗑 a track with clips can be deleted, and ↶ Undo brings it back (' + JSON.stringify(dt) + ')');
  // 🦴 progress while the skeleton is read: step, frame n of N, %, time left (from ComfyUI's per-frame progress)
  const gp = await page.evaluate(() => { const G = {g:{'5':{class_type:'DWPreprocessor'}, '6':{class_type:'DepthAnythingV2Preprocessor'}}}; H3.setGuideProg({pc:'Render', stage:'line', p:0, t0:Date.now() - 20000});
    H3.LIVE.px = {t0:Date.now() - 20000, pn:'5', ps:Date.now() - 10000, v:120, max:240}; H3.guideProg(G, 'px'); const a = Object.assign({}, H3GuideProgress());
    H3.LIVE.px = Object.assign(H3.LIVE.px, {pn:'6', ps:Date.now() - 1000, v:60, max:240}); H3.guideProg(G, 'px'); const b = Object.assign({}, H3GuideProgress()); return {a, b}; });
  const gt = await fr.evaluate(() => { const f = FILM.S.films[0]; return FILM.guideProgText(true); });
  await page.evaluate(() => H3.setGuideProg(null));
  console.log(JSON.stringify({gp, gt}));
  ok(gp.a.stage==='skeleton' && gp.a.frame===120 && Math.abs(gp.a.p - 0.39) < 0.01 && gp.a.eta > 5000 && gp.b.stage==='depth' && gp.b.p > 0.8 && /depth<\/b> frame 60 of 240 · \d+%/.test(gt) && /left/.test(gt), '🦴 the guide shows its step, frame n of N, a % bar and about how long is left');
  // clip by clip: a guide of 3, 1, 2 and 4 s clips with different words → each part of the take gets ONE clip's words, no time codes
  const cw = await page.evaluate(async () => { const fn = window.H3Fill, n0 = H3.S.takes.length;
    await fn({film:'fA', name:'Film', track:'tr1', n:1, items:[{at:0, secs:10, prompt:'x', cuts:[3, 4, 6], beats:[{a:0, b:3, w:'she looks up.'}, {a:3, b:4, w:'the camera drops low.'}, {a:4, b:6, w:'she sets the cup down.'}, {a:6, b:10, w:'she walks off.'}]}]});
    const t = H3.S.takes[0]; return t.pieces.map(p => [+p.start.toFixed(2), p.prompt]); });
  console.log(JSON.stringify(cw));
  const cww = cw.map(x => (x[1] || '').replace(/This continues straight on[^.]*\.\s*|\s*The action carries on[^.]*\./g, '').trim());
  ok(cw.length===4 && cww.join(' / ')==='she looks up. / the camera drops low. / she sets the cup down. / she walks off.' && cw.every(x => !/\[\d/.test(x[1])), 'clip by clip: each part gets only its own clip\'s words, no time codes (' + JSON.stringify(cw) + ')');
  await fr.evaluate(() => FILM.guideSheet(FILM.S.films[0])).catch(() => {});
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
