// 🔁 Loop the whole track (Films, Jordan 2026-11-16): the last clip is joined to the first one and the 🧵 seam bridge repaints the turn,
// then the video goes back into those two clips; 🔁 next to ▶ Play repeats the film (fake ComfyUI, nothing renders).
// Run: CLIP=<a ~5 s video with sound> NODE_PATH=$(npm root -g) node tests/t_looptrack.js
// (make one: ffmpeg -f lavfi -i testsrc=size=640x352:rate=24 -f lavfi -i sine -t 5 -c:v libx264 -pix_fmt yuv420p -c:a aac clip.mp4)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'h3_open_regenerate_2k_r128.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'Video Slice','ImageFromBatch','TrimAudioDuration','ImageBlur','RepeatImageBatch','ManualSigmas','LTXVSeparateAVLatent','LTXVConcatAVLatent','VAEEncode','MiniMaxH3ImageToVideo'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [];
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST') return J({});
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p==='/queue') return J({queue_running:[], queue_pending:sent.map(s => [0, s.pid])});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({});
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)});
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.webm', subfolder:'', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, host:u.origin, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  // three finished 5 s takes (an upscaled stretch in 5 s parts)
  await page.evaluate(([R, m]) => { ['tA', 'tB', 'tC'].forEach((id, i) => H3.S.takes.unshift({id, t:Date.now() + i, pc:R, model:m, turbo:true, loras:[], w:640, h:352, seed:1, name:'h3_' + id, dir:'H3Deck/h3_' + id, prompt:'she spins slowly in the rain', seconds:5, imgs:[], vids:[], auds:[], follow:[],
    pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'she spins slowly in the rain', state:'done', file:{filename:'p_' + id + '.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}}], state:'done', final:{filename:'h3_' + id + '_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}})); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  await fr.waitForFunction(() => window.FILM && FILM.S && FILM.takeOf('tC')).catch(() => {});
  await fr.evaluate(() => { const f = {id:'fL', name:'Loop', tracks:[{id:'tr1', clips:[]}], pps:24}; FILM.S.films.unshift(f); ['tA', 'tB', 'tC'].forEach(id => FILM.addClip(f, FILM.takeOf(id), 0)); FILM.go({v:'film', film:'fL'}); });
  await page.waitForTimeout(400);
  // the button is in the bare tools and in the track's ⋯ menu; the sheet explains, has free frames and Prism Pika
  const S1 = await fr.evaluate(async () => { const q = s => document.querySelector(s), r = {btn:(() => { q('.trk [data-act="trackMenu"]').click(); return !!q('#sheetCard [data-act="loopTrack"]'); })(), rep:!!q('#repBtn')};
    FILM.loopTrackSheet(FILM.S.films[0], 0); await new Promise(z => setTimeout(z, 100));
    r.title = q('#sheetCard h3').textContent; r.fr = [...document.querySelectorAll('#ltFr button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(','); r.pika = q('#ltPk').checked; r.mid = /The 1 clip in between stays/.test(q('#sheetCard').textContent);
    q('#ltFr [data-v="24"]').click(); r.saved = FILM.S.loopFree; return r; });
  ok(S1.btn && S1.rep && /Loop track 1/.test(S1.title) && S1.fr==='8,16*,24,32' && S1.pika && S1.mid && S1.saved===24, '🔁 Loop track button + sheet (free frames 16 by default, Prism Pika ticked, the clip in between is left alone): ' + JSON.stringify(S1));
  const g0 = sent.length;
  await fr.evaluate(async () => { document.querySelector('[data-act="loopTrackGo"]').click(); await new Promise(z => setTimeout(z, 2500)); });
  const CB = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.seam && x.combo.seam.loop); return t && {id:t.id, frames:t.combo.seam.frames, half:t.combo.seam.half, parts:t.combo.parts.map(p => p.take), model:t.model, bounds:t.combo.seam.bounds.map(b => [b.take, b.off, b.len])}; });
  ok(CB && JSON.stringify(CB.parts)==='["tC","tA"]' && JSON.stringify(CB.frames)==='[120]' && CB.half===12 && /pika/.test(CB.model) && JSON.stringify(CB.bounds)==='[["tC",0,5],["tA",5,5]]', 'the LAST clip then the FIRST are joined (end → start), one seam at the turn, 24 free frames, on Prism Pika: ' + JSON.stringify(CB));
  const J = (sent.slice(g0).pop() || {}).g || {}, Nd = c => Object.values(J).filter(n => n.class_type===c);
  const pins = Nd('MiniMaxH3AddGuide').filter(n => n.inputs.frame_idx != null).map(n => n.inputs.frame_idx).sort((a, b) => a - b);
  const free = (() => { let best = 0; for(let i = 1; i < pins.length; i++) best = Math.max(best, pins[i] - pins[i - 1] - 1); return best; })();
  const links = Object.values(J).every(n => Object.values(n.inputs).every(v => !Array.isArray(v) || typeof v[0]!=='string' || J[v[0]]));
  ok(Nd('SamplerCustomAdvanced').length===1 && Nd('ConcatenateVideo').length===1 && Nd('SaveVideo').length===1 && free >= 20 && free <= 27 && links, 'one job on the PC: the two clips joined, one bridge, the turn has ~24 frames with nothing pinned, every link valid: ' + JSON.stringify({samp:Nd('SamplerCustomAdvanced').length, pins, free, links}));
  // done: the video goes back into the last and the first clip; the middle one is untouched
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); Object.assign(t, {state:'done', final:{filename:'loop_00001.mp4', subfolder:'Output_Render/H3Deck/' + t.name, type:'output'}}); t.pieces.forEach(p => { p.state = 'done'; p.file = t.final; p.deliv = 240; }); H3.saveNow(); }, CB.id);
  const S2 = await fr.evaluate(id => { FILM.placeNew(); const cs = FILM.S.films[0].tracks[0].clips.slice().sort((a, b) => a.at - b.at); return cs.map(c => [c.take===id ? 'L' : c.take, c.at, +c.in.toFixed(2), +c.out.toFixed(2)]); }, CB.id);
  ok(JSON.stringify(S2)==='[["L",0,5,10],["tB",5,0,5],["L",10,0,5]]', 'back in place: the first clip shows the bridged video\'s second half, the last clip its first half, the middle clip as it was, nothing moved: ' + JSON.stringify(S2));
  // too short, and one clip → 🔁 Make it loop
  const S3 = await fr.evaluate(async () => { const f = FILM.S.films[0], tr = f.tracks[0], c0 = tr.clips.find(c => c.at===0), keep = c0.out; c0.out = c0.in + 1; const n = await FILM.loopTrackGo(f, tr, 32, '', ''); c0.out = keep; return n; });
  ok(S3===false, 'a first or last clip shorter than the turn needs is refused');
  const S4 = await fr.evaluate(async () => { let got = null; window.parent.H3LoopTake = id => { got = id; }; const f = {id:'f1', name:'One', tracks:[{id:'t1', clips:[]}], pps:24}; FILM.S.films.push(f); FILM.addClip(f, FILM.takeOf('tB'), 0); FILM.loopTrackSheet(f, 0); return got; });
  ok(S4==='tB', 'a track with one clip goes to 🔁 Make it loop');
  // 🔁 repeat: the end of the film starts it again
  const S5 = await fr.evaluate(async () => { const f = FILM.S.films[0]; FILM.go({v:'film', film:'fL'}); await new Promise(z => setTimeout(z, 200)); document.querySelector('#repBtn').click(); const on = FILM.S.rep; let again = 0; const o = FILM.go; FILM.PH = 15; FILM.playEnd(f); again = FILM.PH; const playing = document.querySelector('#playBtn').textContent; FILM.S.rep = false; return {on, again, playing}; });
  ok(S5.on===true && S5.again < 0.5 && /Pause/.test(S5.playing), '🔁 next to ▶ Play: at the end the film plays again from the start: ' + JSON.stringify(S5));
  // ---------- 🪄 Smooth the whole track / 🔁 loop with 🪄 smoothing (Jordan 2026-11-16) ----------
  // three 1.5 s clips: the joined track is 4.5 s (108 frames), clip edges at 36 and 72
  await fr.evaluate(() => { const f = {id:'fS', name:'Smooth', tracks:[{id:'trS', clips:[]}], pps:24}; FILM.S.films.unshift(f); ['tA', 'tB', 'tC'].forEach(id => { const c = FILM.addClip(f, FILM.takeOf(id), 0); c.out = 1.5; }); f.tracks[0].clips.forEach((c, i) => { c.at = i * 1.5; }); FILM.go({v:'film', film:'fS'}); });
  await page.waitForTimeout(300);
  const M0 = await fr.evaluate(async () => { const q = s => document.querySelector(s); q('.trk [data-act="trackMenu"]').click(); await new Promise(z => setTimeout(z, 100)); const r = {smBtn:!!q('#sheetCard [data-act="smoothTrack"]')};
    FILM.loopTrackSheet(FILM.S.films[0], 0); await new Promise(z => setTimeout(z, 100)); r.tog = !!q('#ltSm'); q('#ltSm').click(); r.on = FILM.S.loopSm; q('#ltFr [data-v="16"]').click(); q('[data-act="loopTrackGo"]').click(); await new Promise(z => setTimeout(z, 2500)); return r; });
  const LC = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.blend && x.combo.blend.loop); return t && {id:t.id, back:t.combo.blend.back, seam:t.combo.blend.seam, clips:t.combo.blend.bounds.map(b => [b.take, b.off, b.out - b.in, !!b.clip])}; });
  ok(M0.smBtn && M0.tog && M0.on && LC && LC.back && LC.seam===16 && JSON.stringify(LC.clips)==='[["tA",0,1.5,true],["tB",1.5,1.5,true],["tC",3,1.5,true]]', 'track ⋯ has 🪄 Smooth the whole track; the 🔁 sheet has 🪄 Smooth the whole loop too, which joins the whole track in order for a looping smoothing: ' + JSON.stringify({M0, LC}));
  // the join is done → it loads into 🪄 Smooth as a loop turned at a clip edge, the words moved with it
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); Object.assign(t, {state:'done', final:{filename:'joined.mp4', subfolder:'Output_Render/H3Deck/' + t.name, type:'output'}}); t.pieces.forEach(p => { p.state = 'done'; p.file = t.final; }); H3.saveNow(); }, LC.id);
  await fr.evaluate(() => FILM.placeNew()); await page.waitForTimeout(3000);
  const SF = await page.evaluate(() => { const f = H3.S.f; f.seconds = 4.5; return {sm:f.sm, loop:f.smLoop, h:f.smLoopH, seam:f.smSeam, spc:f.smSpc, back:f.smBack && {loop:f.smBack.loop, n:f.smBack.bounds.length}, blend:!!f.smBlend, prompt:f.prompt}; });
  ok(SF.sm && SF.loop && (SF.h===36 || SF.h===72) && SF.seam===16 && SF.spc && SF.back && SF.back.loop && SF.back.n===3 && !SF.blend && /\[0s-1\.5s\] she spins/.test(SF.prompt), 'loaded into 🪄 Smooth: loop on at a clip edge, 📐 spacing on, 16 free frames, the result marked to go back into the 3 clips, timed words turned with the loop: ' + JSON.stringify(SF));
  // a big size splits the loop into parts, none of them cut near the turn; each part's graph pins only real frames
  const PG = await page.evaluate(([R]) => { const f = H3.S.f; f.smSpc = false; f.mp = 0.9; f.aspect = '16:9'; const P = H3.smoothPlan(), L = H3.smoothTotal(), H = f.smLoopH, turn = L - H;
    const snap = H3.snapshot(), t = Object.assign({id:'tLP', pc:R, name:'lp', dir:'H3Deck/lp', seed:1}, snap), oi = H3.PC[R].oi, names = {[f.smVid]:'joined.mp4'}, out = [];
    t.pieces.forEach((p, i) => { const g = H3.pieceGraph(t, i, oi, names).g, N = c => Object.values(g).filter(n => n.class_type===c), links = Object.values(g).every(n => Object.values(n.inputs).every(v => !Array.isArray(v) || typeof v[0]!=='string' || g[v[0]]));
      out.push({gen:p.gen, start:p.start, guides:N('MiniMaxH3AddGuide').length, slices:N('Video Slice').length, links, idx:N('ImageFromBatch').every(n => n.inputs.batch_index >= 0)}); });
    const seams = P.slice(1).map(p => Math.round(p.start * 24 + (p.skip || 0)));
    return {L, H, turn, parts:P.length, far:Math.min(...seams.map(s => Math.abs(s - turn))), lh:snap.sm.lh, lt:snap.sm.lt, back:!!snap.back, out}; }, [R]);
  ok(PG.parts > 1 && PG.far >= 14 && PG.lh===PG.H && PG.lt===PG.L && PG.back && PG.out.every(o => o.links && o.idx && o.guides > 4) && PG.out.some(o => o.slices===2), 'a looped smoothing too big for one window renders in parts, no part seam near the turn; the part across the turn takes frames from both ends of the video (2 slices); every link valid: ' + JSON.stringify(PG));
  // done → back into the same clips: each clip gets its own stretch of the turned video, end running into start
  const BP = await fr.evaluate(([H, L]) => { const f = FILM.S.films[0], tr = f.tracks[0], bk = {film:f.id, track:tr.id, loop:true, lh:H, lt:L, bounds:tr.clips.slice().sort((a, b) => a.at - b.at).map((c, i) => ({clip:c.id, take:c.take, off:i * 1.5, len:1.5}))};
    const t = {id:'tSm', pieces:[{deliv:L}]}; FILM.S.extraTake = t; const n = FILM.backPlace(Object.assign(FILM.takeOf('tA') ? {} : {}, t), bk); return {n, cs:tr.clips.slice().sort((a, b) => a.at - b.at).map(c => [c.take, c.at, +c.in.toFixed(3), +c.out.toFixed(3)])}; }, [PG.H, PG.L]);
  const exp = [0, 1, 2].map(i => { const s0 = i * 36, s1 = Math.min(PG.L, s0 + 36), o0 = ((s0 - PG.H) % PG.L + PG.L) % PG.L; return ['tSm', i * 1.5, +(o0 / 24).toFixed(3), +((o0 + s1 - s0) / 24).toFixed(3)]; });
  ok(BP.n===3 && JSON.stringify(BP.cs)===JSON.stringify(exp), 'back in place: every clip shows its own stretch of the turned video, the clips stay where they are: ' + JSON.stringify({BP, exp}));
  // 🪄 Smooth the whole track (no loop): blend-style smoothing that goes back into the same clips
  const ST = await fr.evaluate(async () => { const f = FILM.S.films.find(x => x.id==='fL'); return FILM.smoothTrackGo(f, f.tracks[0]); });
  const SC = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.blend && x.combo.blend.back && !x.combo.blend.loop); return t && {n:t.combo.blend.bounds.length}; });
  ok(ST && SC && SC.n===3, '🪄 Smooth the whole track joins all its clips for a smoothing that comes back into them: ' + JSON.stringify(SC));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
