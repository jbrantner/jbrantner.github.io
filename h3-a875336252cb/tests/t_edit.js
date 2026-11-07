// 🎞 Films editing: 🙈 hide a track, ⛓ combine clips / join a carry-on to the clip before, ⬆ nudge a stretch (fake ComfyUI, nothing renders)
// Run: CLIP=<a ~5 s video with sound> NODE_PATH=$(npm root -g) node tests/t_edit.js
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
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'Video Slice','ImageFromBatch','TrimAudioDuration','ImageBlur'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t), node = (g, t) => nodes(g, t)[0];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8019);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], views = [], QP = [], DEL = [];
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
    if(p.startsWith('/history/')) return J({});
    if(p==='/history') return J({pz:{prompt:[0, 'pz', {'5':{class_type:'MiniMaxH3ReferenceToVideo', inputs:{prompt:'This continues straight on. she waves goodbye at the door'}}}], status:{completed:true, messages:[]},
      outputs:{'9':{images:[{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_202611060001_zz9q', type:'output'}]}, '12':{images:[{filename:'h3_202611060001_zz9q_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_202611060001_zz9q', type:'output'}]}}}});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route(M + '/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:'http://main.test', on:true, speed:1.26}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8019/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  // a finished 5 s take (one piece, 120 frames)
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => { H3.S.takes.unshift({id:'tA', t:Date.now(), pc:R, model:m, turbo:true, loras:[], w:640, h:352, seed:1, name:'h3_a', dir:'H3Deck/h3_a', prompt:'she walks to the window', seconds:5, imgs:[], vids:[], auds:[], follow:[],
    pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'she walks to the window', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}], state:'done', final:{filename:'h3_a_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  // the plan for a redo: pins on the 4-frame grid, both sides
  const P = await page.evaluate(() => H3.redoPlan(120, 48, 96, 12));
  ok(P.a===48 && P.b===96 && P.s0===36 && P.L % 17===5 && P.pins.every(([o, s]) => s===P.s0 + o && (o % 4===0 || o===P.L - 1)) && P.pins.some(p => p[1]===48) && P.pins.some(p => p[1]===96) && P.pins.every(p => p[1] <= 48 || p[1] >= 96), 'a redo of 2–4 s pins the frames up to 2 s and from 4 s, every 4th, half a second each side (' + JSON.stringify(P) + ')');
  const PE = await page.evaluate(() => H3.redoPlan(120, 72, 200, 12));
  ok(PE.toEnd && PE.pins.every(p => p[1] <= 72) && PE.Fout >= 120 && PE.Fout - PE.s0===PE.L, 'a redo to the end pins only the frames before it (' + JSON.stringify(PE) + ')');
  // 🎞 Films: a film with that take on it
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}, {id:'tr2', clips:[]}], pps:24}; FILM.S.films.unshift(f); const c = FILM.addClip(f, FILM.takeOf('tA'), 0); const c2 = FILM.addClip(f, FILM.takeOf('tA'), 0); window.C1 = c.id; window.C2 = c2.id; FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  const sent0 = sent.length;
  // 🙈 hide track 1: it doesn't play or export, its clips stay
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks[1].clips.push({id:'cLow', take:'tA', in:0, out:5, dur:5, at:0}); FILM.draw(); });
  await fr.click('.trk[data-k="0"] [data-act="hideTrack"]');
  const H = await fr.evaluate(() => { const f = FILM.S.films[0]; const a = FILM.activeAt(f, 1); return {hide:f.tracks[0].hide, at:a && a.id, exp:FILM.expClips(f).out.map(c => c.track), clips:f.tracks[0].clips.length, cls:document.querySelector('.trk[data-k="0"]').classList.contains('hid')}; });
  ok(H.hide && H.at==='cLow' && H.exp.every(k => k===1) && H.clips===2 && H.cls, '🙈 a hidden track doesn\'t play or export, and keeps its clips: ' + JSON.stringify(H));
  await fr.click('.trk[data-k="0"] [data-act="hideTrack"]');
  ok(await fr.evaluate(() => { const f = FILM.S.films[0]; return !f.tracks[0].hide && FILM.activeAt(f, 1).id===C1; }), '👁 tapping it again shows it');
  await fr.evaluate(() => { FILM.S.films[0].tracks[1].clips = []; FILM.draw(); });
  // ⛓ Combine: the sheet ticks the selected clip and the next one; one join job; the clips become one when it's done
  await fr.evaluate(() => { const f = FILM.S.films[0], c1 = FILM.clipOf(f, C1).c; c1.out = 3; FILM.clipOf(f, C2).c.at = 3; FILM.clipOf(f, C2).c.in = 1; FILM.SEL = C1; FILM.draw(); });
  await fr.click('[data-act="combine"]');
  ok(await fr.evaluate(() => document.querySelectorAll('#cbL input:checked').length===2 && !document.querySelector('#cbGo').disabled), '⛓ the sheet has the clip and the next one ticked');
  await fr.click('#cbGo'); await page.waitForTimeout(500);
  const J = sent.slice(sent0).map(s => s.g)[0] || {};
  const sl = nodes(J, 'Video Slice').map(n => [n.inputs.start_time, n.inputs.duration]), cc = node(J, 'ConcatenateVideo');
  ok(sent.length===sent0 + 1 && JSON.stringify(sl)==='[[0,3],[1,4]]' && cc && cc.inputs['videos.video1'] && node(J, 'SaveVideo'), '⛓ one join job: each clip\'s stretch of its take, end to end: ' + JSON.stringify(sl));
  const ct = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo); t.state = 'done'; t.pieces[0].state = 'done'; t.final = {filename:'j_00001_.mp4', subfolder:'Output_Render/H3Deck/j', type:'output'}; H3.saveNow(); return t.id; });
  // the fake PC can fail the join before the line above marks it done, and a failed join is placed (as a toast) once: undo that
  await fr.evaluate(() => { const t = FILM.takes().find(x => x.combo); if(t && !FILM.S.films[0].tracks[0].clips.some(c => c.take===t.id)) delete FILM.S.placed[t.combo.key]; FILM.placeNew(); FILM.draw(); });
  const CB = await fr.evaluate(ct => { const f = FILM.S.films[0], cs = f.tracks[0].clips; return {n:cs.length, take:cs[0] && cs[0].take, len:cs[0] && cs[0].out - cs[0].in, at:cs[0] && cs[0].at, w:FILM.wordsAt(FILM.takeOf(ct), 4)}; }, ct);
  ok(CB.n===1 && CB.take===ct && Math.abs(CB.len - 7) < 0.05 && CB.at===0 && CB.w==='she walks to the window', '⛓ once joined, the two clips are one 7 s clip: ' + JSON.stringify(CB));
  await fr.evaluate(() => FILM.undo());
  ok(await fr.evaluate(() => FILM.S.films[0].tracks[0].clips.length===2), '↶ Undo splits them again');
  // ⛓ a carry-on's takes: "Use this one: join it to the clip before"
  await page.evaluate(R => { H3.S.takes.unshift({id:'tK', t:Date.now(), pc:R, model:H3.S.takes[0].model, turbo:true, loras:[], w:640, h:352, name:'h3_k', dir:'H3Deck/h3_k', prompt:'she opens it', seconds:3, imgs:[], vids:[], auds:[], follow:[], cont:'m1', carry:{src:'tA', at:3, own:true, key:'kk', film:'fA'},
    pieces:[{start:0, gen:73, deliv:72, ctx:0, prompt:'she opens it', state:'done', file:{filename:'k.mp4', subfolder:'Output_Render/H3Deck/h3_k', type:'output'}}], state:'done', final:{filename:'k.mp4', subfolder:'Output_Render/H3Deck/h3_k', type:'output'}}); H3.saveNow(); }, R);
  await fr.evaluate(() => { const f = FILM.S.films[0]; FILM.S.placed.kk = true; f.tracks[0].clips = [{id:'cP', take:'tA', in:0, out:3, dur:5, at:0}, {id:'cK', take:'tK', in:0, out:3, dur:3, at:3}]; FILM.SEL = 'cK'; FILM.draw(); });
  await page.waitForTimeout(300);
  const s1 = sent.length; ok(await fr.evaluate(() => !!document.querySelector('[data-act="joinPrev"]')), '⛓ a carry-on clip offers "Use this one: join it to the clip before"');
  await fr.click('[data-act="joinPrev"]'); await page.waitForTimeout(500);
  const J2 = (sent[s1] || {}).g || {};
  ok(sent.length===s1 + 1 && JSON.stringify(nodes(J2, 'Video Slice').map(n => [n.inputs.start_time, n.inputs.duration]))==='[[0,3],[0,3]]', '⛓ it joins the clip before and this take');
  // ⬆ Nudge a stretch: the ↻ sheet in nudge mode makes a regenerate of only that stretch, at the same size, spliced back
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks[0].clips = [{id:'cN', take:'tA', in:0, out:5, dur:5, at:0}]; FILM.SEL = 'cN'; FILM.PH = 1.5; FILM.draw(); });
  await fr.click('[data-act="redo"]');
  ok(await fr.evaluate(() => document.querySelector('#rdM').hidden && /Redo it/.test(document.querySelector('#rdGo').textContent)), '⬆ Nudge is taken out of the ↻ sheet (Jordan: it changed her too much)');
  await fr.evaluate(() => { document.querySelector('[data-close]').click(); FILM.S.nudgeOn = true; });
  await fr.click('[data-act="redo"]');
  await fr.click('#rdM [data-v="nudge"]');
  ok(await fr.evaluate(() => !document.querySelector('#rdRepW').hidden && !!document.querySelector('#rdDen') && /Nudge/.test(document.querySelector('#rdGo').textContent)), '⬆ the sheet has a Nudge mode with how much it changes');
  await fr.evaluate(() => { const r = document.querySelector('#rdDen'); r.value = '0.93'; r.dispatchEvent(new Event('input')); });
  await fr.evaluate(() => { const ta = document.querySelector('#rdP'); ta.value = 'she smiles and waves'; ta.dataset.typed = '1'; });
  await fr.click('#rdGo'); await page.waitForTimeout(400);
  const NT = await page.evaluate(() => { const t = H3.S.takes.find(x => x.redo && x.redo.nudge); return t && {up:t.up, stage:t.upStage, src:t.smoothed && t.smoothed.filename, pc:t.pc}; });
  ok(NT && NT.up.part && NT.up.den===0.93 && NT.up.prompt==='she smiles and waves' && NT.up.scale===1 && NT.src==='h3_a_00001_.mp4', '⬆ a nudge take of that stretch: ' + JSON.stringify(NT && NT.up));
  const G = await page.evaluate(R => { const t = H3.S.takes.find(x => x.redo && x.redo.nudge); return Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g); }, R);
  const fb = G.filter(n => n.class_type==='ImageFromBatch').map(n => [n.inputs.batch_index, n.inputs.length]), i2v = G.find(n => n.class_type==='MiniMaxH3ImageToVideo');
  const P2 = NT.up.part;
  ok(!G.some(n => n.class_type==='MinimaxH3LatentUpscaler3D') && i2v && i2v.inputs.width===640 && i2v.inputs.height===352 && i2v.inputs.length===P2.L && P2.L % 17===5 && /smiles and waves/.test(i2v.inputs.prompt) && /^0\.9300, 0\.7905/.test(G.find(n => n.class_type==='ManualSigmas').inputs.sigmas), '⬆ same size, the window on the frame grid, the new words: ' + JSON.stringify(P2));
  ok(fb[0][0]===P2.s0 && fb[0][1]===P2.L && JSON.stringify(fb.slice(1))===JSON.stringify([[0, P2.a], [P2.a - P2.s0, P2.b - P2.a], [P2.b, P2.F - P2.b]]) && P2.a <= 36 && P2.b >= 84, '⬆ spliced: the take up to a, the nudged frames, the take from b: ' + JSON.stringify(fb));
  // when it's done, it goes in the clip like a redo (a new version)
  await page.evaluate(() => { const t = H3.S.takes.find(x => x.redo && x.redo.nudge); t.upStage = 'done'; t.state = 'done'; t.final = {filename:'n_up.mp4', subfolder:'Output_Render/H3Deck/n', type:'output'}; H3.saveNow(); });
  await fr.evaluate(() => { FILM.placeNew(); FILM.draw(); });
  const NW = await fr.evaluate(() => { const c = FILM.S.films[0].tracks[0].clips[0], t = FILM.takeOf(c.take); return {nudge:!!(t.redo && t.redo.nudge), w:FILM.wordsAt(t, 2.5), w0:FILM.wordsAt(t, 0.2), lab:document.querySelector('.clip .nm').textContent}; });
  ok(NW.nudge && NW.w==='she smiles and waves' && NW.w0==='she walks to the window' && /^⬆/.test(NW.lab), '⬆ the nudge goes in the clip, with its words on that stretch: ' + JSON.stringify(NW));
  // ✨ Quality pass (Jordan 2026-11-06): all or nothing. The track stays; every clip is redone (one seed, its own words); only when all
  // are done do they go on a new top track, joined into one clip. A failure changes nothing.
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks = [f.tracks[0]]; f.tracks[0].clips = [{id:'q1', take:'tA', in:0.5, out:2.5, dur:5, at:0}, {id:'q2', take:'tA', in:3, out:5, dur:5, at:2}]; FILM.S.passes = []; FILM.SEL = null; FILM.draw(); });
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => !(x.redo && x.redo.nudge)); H3.saveNow(); });
  await fr.click('[data-act="qualitySheet"][data-k="0"]'); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => /2 clips/.test(document.querySelector('#sheetCard').textContent) && /all or nothing/.test(document.querySelector('#sheetCard').textContent) && document.querySelector('#qpLv .pri').dataset.v==='0'), '✨ the sheet counts the clips, says all or nothing, Regenerate strength by default');
  const s5 = sent.length; await fr.click('#qpGo'); await page.waitForTimeout(600);
  const QPS = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).map(t => ({clip:t.redo.clip, key:t.redo.key, wi:t.redo.wi, seed:t.seed, den:t.up.den, a:t.redo.a, b:t.redo.b, prompt:t.up.prompt})));
  ok(QPS.length===2 && QPS[0].seed===QPS[1].seed && QPS[0].key===QPS[1].key && QPS.map(x => x.wi).sort().join()==='0,1' && QPS.every(x => !x.clip && x.den===0 && /^she walks to the window/.test(x.prompt)) && QPS.find(x => x.wi===0).a <= 12 && QPS.find(x => x.wi===0).b >= 60, '✨ one regenerate per clip, one pass, same seed, the clips\' words: ' + JSON.stringify(QPS));
  const GC = await page.evaluate(R => { const t = H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0), g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g), bl = g.find(n => n.class_type==='ImageBlur'), enc = g.find(n => n.class_type==='VAEEncode');
    return {clean:t.up.clean, blur:bl && bl.inputs.sigma, into:enc && JSON.stringify(enc.inputs.pixels), bid:bl && Object.keys(H3.upGraph(t, H3.PC[R].oi, {}).g).find(k => H3.upGraph(t, H3.PC[R].oi, {}).g[k].class_type==='ImageBlur'), sig:g.find(n => n.class_type==='ManualSigmas').inputs.sigmas}; }, R);
  ok(GC.clean===0.8 && GC.blur===0.8 && GC.into===JSON.stringify([GC.bid, 0]) && /0\.125/.test(GC.sig) && / 0\.0$/.test(GC.sig), '🧽 grain clean-up on by default: frames softened before the encode, one more small step at the end: ' + JSON.stringify(GC));
  await page.waitForTimeout(1500); await fr.evaluate(() => FILM.liveFilm());
  const QF = await fr.evaluate(() => ({n:FILM.S.films[0].tracks.length, takes:FILM.S.films[0].tracks[0].clips.map(c => c.take).join(), p:FILM.S.passes.map(x => x.state).join()}));
  ok(QF.n===1 && QF.takes==='tA,tA' && QF.p==='failed', '✨ the fake PC can\'t run it (no Open-H3 LoRA): the pass fails and nothing changes: ' + JSON.stringify(QF));
  // ↻ a failed pass shows on the track; retry sends only the failed parts again, same key and seed, keeping the good ones
  await fr.evaluate(() => FILM.draw());
  const RF = await fr.evaluate(() => ({lab:document.querySelector('.trk[data-k="0"]') ? document.querySelector('.trk[data-k="0"]').textContent : document.body.textContent, err:FILM.S.passes[0].err, failed:FILM.S.passes[0].failed}));
  await page.evaluate(() => { const t = H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0); t.upStage = 'done'; t.state = 'done'; t.upErr = ''; t.final = {filename:'q0.mp4', subfolder:'Output_Render/H3Deck/q', type:'output'}; H3.saveNow(); });
  const nq0 = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).length);
  const RN = await fr.evaluate(async () => { const f = FILM.S.films[0]; return await FILM.qpRetry(f, f.tracks[0]); }); await page.waitForTimeout(300);
  const RT = await page.evaluate(() => { const q = H3.S.takes.filter(x => x.redo && x.redo.qp); return {n:q.length, wis:q.map(x => x.redo.wi), seeds:[...new Set(q.map(x => x.seed))].length, keys:[...new Set(q.map(x => x.redo.key))].length, tf:q.every(x => !x.toFilm)}; });
  ok(/✨ failed/.test(RF.lab) && RF.err && RF.failed.length===2 && RN===1 && RT.n===nq0 + 1 && RT.wis[0]===1 && RT.seeds===1 && RT.keys===1 && RT.tf && await fr.evaluate(() => FILM.S.passes[0].state)==='working',
    '↻ failed pass: "✨ failed" on the track, Retry resends only the failed part with the same seed: ' + JSON.stringify({RF, RN, RT}));
  // the same pass when every part finishes
  await page.evaluate(() => { H3.S.takes.filter(x => x.redo && x.redo.qp).forEach(t => { t.upStage = 'done'; t.state = 'done'; t.upErr = ''; t.final = {filename:'q' + t.redo.wi + '.mp4', subfolder:'Output_Render/H3Deck/q', type:'output'}; }); H3.saveNow(); });
  const s6 = sent.length; await fr.evaluate(() => { FILM.S.passes[0].state = 'working'; FILM.liveFilm(); }); await page.waitForTimeout(500);
  const QW = await fr.evaluate(() => { const f = FILM.S.films[0]; return {n:f.tracks.length, top:f.tracks[0].clips.map(c => { const t = FILM.takeOf(c.take); return {qp:!!(t && t.redo && t.redo.qp), in:c.in, out:c.out, at:c.at}; }), under:f.tracks[1].clips.map(c => c.take).join()}; });
  const J3 = (sent[s6] || {}).g || {};
  ok(QW.n===2 && QW.top.length===2 && QW.top.every(x => x.qp) && QW.top[0].in===0.5 && QW.top[1].at===2 && QW.under==='tA,tA' && nodes(J3, 'ConcatenateVideo').length===1, '✨ all done: a new top track with the passes, joining into one clip, the track under it as it was: ' + JSON.stringify(QW));
  await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo); t.state = 'done'; t.pieces[0].state = 'done'; t.final = {filename:'qj.mp4', subfolder:'Output_Render/H3Deck/qj', type:'output'}; H3.saveNow(); });
  await fr.evaluate(() => { const t = FILM.takes().find(x => x.combo); if(t && !FILM.S.films[0].tracks[0].clips.some(c => c.take===t.id)) delete FILM.S.placed[t.combo.key]; FILM.liveFilm(); });
  const QJ = await fr.evaluate(() => { const tr = FILM.S.films[0].tracks[0]; return {n:tr.clips.length, len:tr.clips[0] && tr.clips[0].out - tr.clips[0].in, cuts:tr.clips[0] && tr.clips[0].qcuts, wins:FILM.qpWins(tr).map(w => [w.in, w.out])}; });
  ok(QJ.n===1 && Math.abs(QJ.len - 4) < 0.05 && JSON.stringify(QJ.cuts)==='[2]' && JSON.stringify(QJ.wins)==='[[0,2],[2,4]]', '✨ one clip on the top track that remembers its join, so a later pass works part by part: ' + JSON.stringify(QJ));
  // ↩ clips that got a pass the old way go back to their originals in one tap
  const QB = await fr.evaluate(() => { const qa = FILM.takes().find(x => x.redo && x.redo.qp && x.redo.wi===0), tr = {id:'tq', clips:[{id:'x1', take:qa.id, in:0.5, out:2.5, dur:5, at:0}]}; const n = FILM.qpBack(tr); return {n, take:tr.clips[0].take, in:tr.clips[0].in}; });
  ok(QB.n===1 && QB.take==='tA' && QB.in===0.5, '↩ Put the originals back: a ✨ clip plays its original take again: ' + JSON.stringify(QB));
  // picking another ➕ take of the clip keeps the ✨ pass of the first one in the list (Jordan 2026-11-06)
  await page.evaluate(() => { const b = {t:Date.now(), state:'done', pieces:[], prompt:'p', imgs:[], vids:[], auds:[]};
    H3.S.takes.unshift(Object.assign({id:'cc1', carry:{key:'ck', film:'', clip:''}}, b), Object.assign({id:'cc2', carry:{key:'ck', film:'', clip:''}}, b), Object.assign({id:'ccq', carry:null, redo:{src:'cc1', root:'cc1', qp:true, nudge:true}}, b)); H3.saveNow(); });
  ok(await fr.evaluate(() => { const T = FILM.takes(), v = id => FILM.versionsOf(T.find(x => x.id===id)).map(x => x.id).sort().join(); return v('cc2')==='cc1,cc2,ccq' && v('ccq')==='cc1,cc2,ccq'; }), '✨ a pass of one ➕ take stays in the list after picking the other ➕ take');
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => !/^cc/.test(x.id)); H3.saveNow(); });
  // 🔍 bigger, the last step: on the ✨ track, part by part, ×1.5, all or nothing onto another new top track
  await fr.evaluate(() => FILM.draw());
  await fr.click('[data-act="qualitySheet"][data-k="0"]'); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => /640×352 → 960×512/.test(document.querySelector('#sheetCard').textContent)), '🔍 the sheet offers the bigger last step with its size');
  await fr.click('#qpBig'); await page.waitForTimeout(600);
  const BG = await page.evaluate(R => { const T = H3.S.takes.filter(x => x.redo && x.redo.big), t = T.find(x => x.redo.wi===0); if(!t) return null; const g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g);
    return {n:T.length, crop:t.up.crop, scale:t.up.scale, ib:g.filter(n => n.class_type==='ImageFromBatch').map(n => [n.inputs.batch_index, n.inputs.length]), up:!!g.find(n => n.class_type==='MinimaxH3LatentUpscaler3D'), vs:(g.find(n => n.class_type==='Video Slice') || {}).inputs, iv:(g.find(n => /MiniMaxH3(Image|Reference)ToVideo/.test(n.class_type)) || {}).inputs}; }, R);
  ok(BG && BG.n===2 && BG.scale===1.5 && BG.crop.L % 17===5 && BG.ib.length===1 && BG.ib[0][0]===BG.crop.s0 && BG.ib[0][1]===BG.crop.L && BG.up && BG.vs && BG.iv.width===960 && BG.iv.height===512 && BG.iv.length===BG.crop.L, '🔍 one part per join, each only its stretch, upscaled, sound cut to it: ' + JSON.stringify(BG && {n:BG.n, crop:BG.crop, ib:BG.ib, vs:BG.vs, w:BG.iv.width, h:BG.iv.height}));
  await page.evaluate(() => { H3.S.takes.filter(x => x.redo && x.redo.big).forEach(t => { t.upStage = 'done'; t.state = 'done'; t.upErr = ''; t.final = {filename:'big' + t.redo.wi + '.mp4', subfolder:'Output_Render/H3Deck/b', type:'output'}; }); H3.saveNow(); });
  await fr.evaluate(() => { FILM.S.passes.forEach(p => { if(p.big) p.state = 'working'; }); FILM.liveFilm(); }); await page.waitForTimeout(300);
  const BW = await fr.evaluate(() => { FILM.draw(); const f = FILM.S.films[0], cs = f.tracks[0].clips; return {n:f.tracks.length, big:cs.every(c => { const t = FILM.takeOf(c.take); return t && t.redo && t.redo.big; }), lens:cs.map(c => +(c.out - c.in).toFixed(2)), ats:cs.map(c => c.at), lab:document.querySelector('.trk[data-k="0"] .clip .nm').textContent}; });
  ok(BW.n===3 && BW.big && JSON.stringify(BW.lens)==='[2,2]' && JSON.stringify(BW.ats)==='[0,2]' && /^🔍/.test(BW.lab), '🔍 the bigger parts are on a new top track, same timing: ' + JSON.stringify(BW));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
