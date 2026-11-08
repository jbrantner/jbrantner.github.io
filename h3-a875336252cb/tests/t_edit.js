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
  'Video Slice','ImageFromBatch','TrimAudioDuration','ImageBlur','RepeatImageBatch'];
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
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:'http://main.test', on:true, speed:1.26}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
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
  await fr.waitForFunction(() => window.FILM && FILM.S).catch(() => {}); await fr.evaluate(() => { FILM.S.moreTools = true; FILM.draw && FILM.draw(); }); // 🧰 the tucked-away tools too
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}, {id:'tr2', clips:[]}], pps:24}; FILM.S.films.unshift(f); const c = FILM.addClip(f, FILM.takeOf('tA'), 0); const c2 = FILM.addClip(f, FILM.takeOf('tA'), 0); window.C1 = c.id; window.C2 = c2.id; FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  const sent0 = sent.length;
  // 🙈 hide track 1: it doesn't play or export, its clips stay
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks[1].clips.push({id:'cLow', take:'tA', in:0, out:5, dur:5, at:0}); FILM.draw(); });
  await fr.click('.trk[data-k="0"] [data-act="trackMenu"]'); await fr.click('#sheetCard [data-act="hideTrack"]');
  const H = await fr.evaluate(() => { const f = FILM.S.films[0]; const a = FILM.activeAt(f, 1); return {hide:f.tracks[0].hide, at:a && a.id, exp:FILM.expClips(f).out.map(c => c.track), clips:f.tracks[0].clips.length, cls:document.querySelector('.trk[data-k="0"]').classList.contains('hid')}; });
  ok(H.hide && H.at==='cLow' && H.exp.every(k => k===1) && H.clips===2 && H.cls, '🙈 a hidden track doesn\'t play or export, and keeps its clips: ' + JSON.stringify(H));
  await fr.click('.trk[data-k="0"] [data-act="trackMenu"]'); await fr.click('#sheetCard [data-act="hideTrack"]');
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
  const ct = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo); t.state = 'done'; t.pieces[0].state = 'done'; t.pieces[0].file = {filename:'j_00001_.mp4', subfolder:'Output_Render/H3Deck/j', type:'output'}; t.final = {filename:'j_00001_.mp4', subfolder:'Output_Render/H3Deck/j', type:'output'}; H3.saveNow(); return t.id; });
  // the fake PC can fail the join before the line above marks it done, and a failed join is placed (as a toast) once: undo that
  await fr.evaluate(() => { const t = FILM.takes().find(x => x.combo); if(t && !FILM.S.films[0].tracks[0].clips.some(c => c.take===t.id)) delete FILM.S.placed[t.combo.key]; FILM.placeNew(); FILM.draw(); });
  const CB = await fr.evaluate(ct => { const f = FILM.S.films[0], cs = f.tracks[0].clips; return {n:cs.length, take:cs[0] && cs[0].take, len:cs[0] && cs[0].out - cs[0].in, at:cs[0] && cs[0].at, w:FILM.wordsAt(FILM.takeOf(ct), 4)}; }, ct);
  ok(CB.n===1 && CB.take===ct && Math.abs(CB.len - 7) < 0.05 && CB.at===0 && CB.w==='she walks to the window', '⛓ once joined, the two clips are one 7 s clip: ' + JSON.stringify(CB));
  await fr.evaluate(() => FILM.undo());
  ok(await fr.evaluate(() => FILM.S.films[0].tracks[0].clips.length===2), '↶ Undo splits them again');
  // 🪄 Blend: the ticked clips are joined in a hidden take, loaded into 🪄 Smooth, and the smoothed take comes back split into the clips
  { await fr.evaluate(() => { FILM.SEL = C1; FILM.draw(); }); await fr.click('[data-act="combine"]'); await page.waitForTimeout(200);
    const TP = '[0s-2s] she walks to the window\n[2s-] she sits down'; await page.evaluate(TP => { const t = H3.S.takes.find(x => x.id==='tA'); t.prompt = t.pieces[0].prompt = TP; }, TP);
    const sb = sent.length; await fr.click('#cbBlend'); await page.waitForTimeout(500);
    await page.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tA'); t.prompt = t.pieces[0].prompt = 'she walks to the window'; });
    const BT = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.blend); if(!t) return null; t.state = 'done'; t.pieces[0].state = 'done'; t.pieces[0].file = {filename:'b_00001_.mp4', subfolder:'Output_Render/H3Deck/b', type:'output'}; t.final = {filename:'b_00001_.mp4', subfolder:'Output_Render/H3Deck/b', type:'output'}; H3.saveNow(); return {id:t.id, b:t.combo.blend.bounds.map(q => [q.off, q.in, q.out, q.at])}; });
    ok(BT && JSON.stringify(BT.b)==='[[0,0,5,0],[5,0,5,5]]' && sent.length===sb + 1, '🪄 Blend joins the ticked clips in one hidden job and remembers where each clip sits: ' + JSON.stringify(BT));
    await fr.waitForFunction(() => { const t = FILM.takes().find(x => x.combo && x.combo.blend); return t && FILM.doneOf(t); }, null, {timeout:8000}).catch(() => {});
    await fr.evaluate(() => { const t = FILM.takes().find(x => x.combo && x.combo.blend); if(t) delete FILM.S.placed[t.combo.key]; FILM.placeNew(); FILM.draw(); }); await page.waitForFunction(() => H3.S.f.sm && H3.S.f.smBlend, null, {timeout:10000}).catch(() => {});
    const BS = await page.evaluate(() => ({sm:H3.S.f.sm, up:H3.S.f.smUp, spc:H3.S.f.smSpc, bl:H3.S.f.smBlend && H3.S.f.smBlend.bounds.length, vid:!!H3.S.f.smVid && H3.S.f.smBlend && H3.S.f.smBlend.vid===H3.S.f.smVid, pr:H3.S.f.prompt}));
    const BTL = await fr.evaluate(() => FILM.S.films[0].tracks.length + ':' + FILM.S.films[0].tracks[0].clips.length);
    ok(BS.sm && !BS.up && BS.spc && BS.bl===2 && BS.vid && /\[0s-2s\] she walks to the window\n\[2s-5s\] she sits down\n\[5s-7s\] she walks to the window\n\[7s-10s\] she sits down/.test(BS.pr) && !/\] \[/.test(BS.pr) && BTL==='2:2', '🪄 the joined take loads into Smooth (📐 spacing on, same size), the timeline stays as it was: ' + JSON.stringify({BS, BTL}));
    // the jump between the clips is painted across: no frame is pinned near the join, and no window seam lands on it
    { const G = await page.evaluate(() => { const f = H3.S.f; f.smSpc = false; f.seconds = 10; const L = H3.smoothTotal(), k = H3.smKeysFor(L) || [], J = H3.blendJoins(), P = H3.smoothPlan();
        return {J, near:k.filter(([o]) => Math.abs(o - J[0]) < 8).length, n:k.length, P:P.map(p => Math.round(p.start * 24 + (p.skip || 0)))}; });
      ok(G.J.join()==='120' && G.near===0 && G.n > 15 && G.P.slice(1).every(x => Math.abs(x - 120) >= 14), '🪄 no pinned frames within 8 of the join (MiniMax paints across the jump), and the parts split away from it: ' + JSON.stringify(G)); }
    const n0 = await fr.evaluate(() => FILM.S.films[0].tracks.length);
    await page.evaluate(R => { const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.id==='tA'))); Object.assign(t, {id:'tBl', pc:R, sm:{vid:H3.S.f.smVid, start:0, every:4}, blend:Object.assign({}, H3.S.f.smBlend, {key:'kb'}), combo:null, carry:null, redo:null, toFilm:null, prompt:'The same shot carries on with smooth, steady, natural motion.', seconds:10, state:'done',
      pieces:[{start:0, gen:241, deliv:240, ctx:0, prompt:'x', state:'done', file:{filename:'bl.mp4', subfolder:'Output_Render/H3Deck/bl', type:'output'}}], final:{filename:'bl.mp4', subfolder:'Output_Render/H3Deck/bl', type:'output'}}); H3.S.takes.unshift(t); H3.saveNow(); }, R);
    await fr.evaluate(() => { FILM.placeNew(); FILM.draw(); });
    const BP = await fr.evaluate(n0 => { const f = FILM.S.films[0], tr = f.tracks[0]; return {more:f.tracks.length - n0, blend:!!tr.blend, cs:tr.clips.map(c => [c.take, c.in, c.out, c.at]), w:FILM.wordsAt(FILM.takeOf('tBl'), 1)}; }, n0);
    ok(BP.more===1 && BP.blend && JSON.stringify(BP.cs)==='[["tBl",0,5,0],["tBl",5,10,5]]' && BP.w==='she walks to the window', '🪄 the smoothed blend comes back as the same clips on a new top track, with their own words: ' + JSON.stringify(BP));
    // 🎬 one take over the clips: one new take, a part per clip, in order, the second part starting with the first clip's action
    { await page.evaluate(() => { const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.id==='tA'))); Object.assign(t, {id:'tB', prompt:'she sits down'}); t.pieces[0].prompt = 'she sits down'; H3.S.takes.push(t); H3.saveNow(); });
      await fr.evaluate(() => { const c = FILM.S.films[0].tracks.flatMap(x => x.clips).find(x => x.id===C2); c.take = 'tB'; FILM.SEL = C1; FILM.draw(); }); await fr.click('[data-act="combine"]'); await page.waitForTimeout(200);
      const k0 = await page.evaluate(() => H3.S.takes.length); await fr.evaluate(() => document.getElementById('cbOne').click()); await page.waitForTimeout(600);
      const O = await page.evaluate(k0 => { const ts = H3.S.takes.slice(0, H3.S.takes.length - k0); return ts.map(t => ({secs:t.seconds, n:t.pieces.length, p:t.pieces.map(p => p.prompt), film:!!t.toFilm})); }, k0);
      ok(O.length===1 && Math.abs(O[0].secs - 10) < 0.05 && O[0].n===2 && O[0].film && /^she walks to the window/.test(O[0].p[0]) && /\[0s-1s\] she walks to the window, carrying on from the moment before\.\n\[1s-\] she sits down/.test(O[0].p[1]), '🎬 one new take over the ticked clips: a part per clip, the second leading in from the first: ' + JSON.stringify(O));
      await page.evaluate(k0 => { H3.S.takes.splice(0, H3.S.takes.length - k0); H3.S.takes = H3.S.takes.filter(x => x.id!=='tB'); H3.saveNow(); }, k0);
      await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks.flatMap(x => x.clips).find(x => x.id===C2).take = 'tA'; if(!f.tracks[0].clips.length) f.tracks.shift(); FILM.save && FILM.save(); FILM.draw(); }); }
    // 🪄 Smooth on the timeline: the selected clip's take loads straight into Smooth
    { await page.evaluate(() => { H3.S.f.sm = false; H3.S.f.smVid = null; }); await fr.evaluate(() => { FILM.SEL = C1; FILM.draw(); document.querySelector('[data-act="smoothClip"]').click(); });
      await page.waitForFunction(() => H3.S.f.sm && H3.S.f.smVid, null, {timeout:10000}).catch(() => {});
      const SM = await page.evaluate(() => ({sm:H3.S.f.sm, vid:!!H3.S.f.smVid, pr:H3.S.f.prompt})); ok(SM.sm && SM.vid && /she walks to the window/.test(SM.pr), '🪄 Smooth on the timeline loads the clip\'s take into Smooth with its words: ' + JSON.stringify(SM));
      await page.evaluate(() => { H3.S.f.sm = false; }); }
    // 🧪 Test: tick clips → one joined clip (not on the timeline) → it opens in Smooth with each clip's words timed; the playhead leaves it alone
    { await page.evaluate(() => { H3.S.f.sm = false; H3.S.f.smVid = null; }); const sb = sent.length;
      await fr.evaluate(() => { FILM.SEL = C1; FILM.draw(); document.querySelector('[data-act="test"]').click(); });
      await fr.evaluate(() => { document.querySelectorAll('#tsL input').forEach(x => { if(!x.checked){ x.checked = true; x.onchange(); } }); });
      const TN = await fr.evaluate(() => document.getElementById('tsN').textContent); await fr.evaluate(() => document.getElementById('tsGo').click()); await page.waitForTimeout(500);
      const TT = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.test); if(!t) return null; t.state = 'done'; t.pieces[0].state = 'done'; t.pieces[0].file = {filename:'tt_00001_.mp4', subfolder:'Output_Render/H3Deck/tt', type:'output'}; t.final = t.pieces[0].file; H3.saveNow(); return {id:t.id, pr:t.prompt}; });
      await fr.waitForFunction(() => { const t = FILM.takes().find(x => x.combo && x.combo.test); return t && FILM.doneOf(t); }, null, {timeout:8000}).catch(() => {});
      const n0 = await fr.evaluate(() => FILM.S.films[0].tracks.reduce((a, x) => a + x.clips.length, 0));
      await fr.evaluate(() => { const t = FILM.takes().find(x => x.combo && x.combo.test); if(t) delete FILM.S.placed[t.combo.key]; FILM.placeNew(); FILM.draw(); });
      await page.waitForFunction(() => H3.S.f.sm && H3.S.f.smVid, null, {timeout:10000}).catch(() => {});
      const TS = await page.evaluate(() => ({sm:H3.S.f.sm, up:H3.S.f.smUp, pr:H3.S.f.prompt, bar:!document.getElementById('beatBar').hidden, follow:H3.FILMWORDS ? 1 : window.H3FilmWords('other words', 1, 'tA')}));
      const n1 = await fr.evaluate(() => FILM.S.films[0].tracks.reduce((a, x) => a + x.clips.length, 0));
      ok(TT && sent.length===sb + 1 && /\[0s-5s\] she walks to the window\.?\n\[5s-10s\] she walks to the window/.test(TT.pr) && TS.sm && /\[5s-10s\]/.test(TS.pr) && TS.bar && TS.follow===false && n1===n0,
        '🧪 Test joins the ticked clips into one and opens it in Smooth with each clip\'s words timed on the ⏱ bar; the playhead doesn\'t replace them: ' + JSON.stringify({TN, TT, TS, n0, n1}));
      await page.evaluate(() => { H3.S.f.sm = false; H3.S.f.prompt = 'she walks to the window'; }); }
    // ↻ a stretch of a 🪄 smoothed take can be redone (to bridge the seam between its parts)
    { const RS = await page.evaluate(async () => { const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.id==='tA'))); Object.assign(t, {id:'tSm', sm:{vid:'v', start:0, every:4}}); H3.S.takes.push(t);
        const k0 = H3.S.takes.length, n = await window.H3Redo({take:'tSm', a:2, b:3}); const nt = H3.S.takes.slice(0, H3.S.takes.length - k0);
        const out = {n, redo:nt.length && !!nt[0].redo, sm:nt.length ? nt[0].sm : 'none'}; H3.S.takes = H3.S.takes.filter(x => x.id!=='tSm' && !nt.includes(x)); H3.saveNow(); return out; });
      ok(RS.n===1 && RS.redo && RS.sm===null, '↻ a stretch of a smoothed take can be redone: ' + JSON.stringify(RS)); }
    { const q0 = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).length), p0 = await fr.evaluate(() => (FILM.S.passes || []).length);
      await page.evaluate(R => { const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.id==='tBl'))); t.id = 'tBl2'; t.blend = Object.assign({}, t.blend, {key:'kb2', chain:{den:0, clean:0.8}}); H3.S.takes.unshift(t); H3.saveNow(); }, R);
      await fr.evaluate(() => { FILM.placeNew(); FILM.draw(); }); await page.waitForTimeout(800);
      const CH = await fr.evaluate(p0 => { const p = (FILM.S.passes || []).slice(p0); return {n:p.length, chain:p[0] && p[0].o.chain, sep:p[0] && p[0].o.sep, top:FILM.S.films[0].tracks[0].clips.map(c => c.take).join()}; }, p0);
      const q1 = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).length);
      ok(CH.n===1 && CH.chain==='big' && CH.sep && CH.top==='tBl2,tBl2' && q1===q0 + 2, '🪄✨🔍 one go: the finished blend goes on a track and its ✨ pass starts by itself (then 🔍): ' + JSON.stringify({CH, q0, q1}));
      await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks = f.tracks.filter(tr => !tr.clips.some(c => c.take==='tBl2' || (FILM.takeOf(c.take) || {redo:null}).redo)); FILM.S.passes = (FILM.S.passes || []).filter(p => p.o.chain!=="big"); }); await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => x.id!=='tBl2' && !(x.redo && x.redo.qp && !x.redo.wi && x.redo.src==='tBl2')); H3.saveNow(); }); }
    await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks = f.tracks.filter(tr => !tr.clips.some(c => c.take==='tBl')); FILM.draw(); }); await page.evaluate(() => { H3.S.f.sm = false; H3.S.f.smBlend = null; H3.S.takes = H3.S.takes.filter(x => x.id!=='tBl' && !(x.combo && x.combo.blend)); H3.saveNow(); H3.drawAll(); }); }
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
  await fr.click('.trk[data-k="0"] [data-act="trackMenu"]'); await fr.click('#sheetCard [data-act="qualitySheet"]'); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => /2 clips/.test(document.querySelector('#sheetCard').textContent) && /all or nothing/.test(document.querySelector('#sheetCard').textContent) && document.querySelector('#qpLv .pri').dataset.v==='0'), '✨ the sheet counts the clips, says all or nothing, Regenerate strength by default');
  ok(await fr.evaluate(() => document.querySelector('#qpSep .pri').dataset.v==='1'), '▦ blend track (separate clips) is the default result');
  await fr.click('#qpSep [data-v="0"]');
  const s5 = sent.length; await fr.click('#qpGo'); await page.waitForTimeout(600);
  const QPS = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).map(t => ({clip:t.redo.clip, key:t.redo.key, wi:t.redo.wi, seed:t.seed, den:t.up.den, a:t.redo.a, b:t.redo.b, prompt:t.up.prompt})));
  ok(QPS.length===2 && QPS[0].seed===QPS[1].seed && QPS[0].key===QPS[1].key && QPS.map(x => x.wi).sort().join()==='0,1' && QPS.every(x => !x.clip && x.den===0 && /^she walks to the window/.test(x.prompt)) && QPS.find(x => x.wi===0).a <= 12 && QPS.find(x => x.wi===0).b >= 60, '✨ one regenerate per clip, one pass, same seed, the clips\' words: ' + JSON.stringify(QPS));
  const ML = await page.evaluate(R => { const t = H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0), g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g); return {model:t.model, turbo:t.turbo, loras:t.loras.length, unet:(g.find(n => n.class_type==='UNETLoader') || {inputs:{}}).inputs.unet_name}; }, R);
  ok(/official|minimax_h3_(ref2va|fl2va)/i.test(ML.model) && !ML.turbo && !ML.loras, '✨ the pass take says (and runs) the official MiniMax model, not the source take\'s: ' + JSON.stringify(ML));
  const UL = await page.evaluate(R => { const t0 = H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0), t = Object.assign(JSON.parse(JSON.stringify(t0)), {loras:[{name:'myStyle.safetensors', str:0.9, words:'mystyle look'}, {name:'notOnThisPc.safetensors', str:1, words:'zzz'}]});
    const oi = Object.assign({}, H3.PC[R].oi, {LoraLoaderModelOnly:{input:{required:{model:['MODEL'], lora_name:[['minimax_h3_open_regenerate_2k_r128_comfyui_bf16.safetensors', 'myStyle.safetensors']], strength_model:['FLOAT', {default:1}]}}}});
    const g = Object.values(H3.upGraph(t, oi, {}).g), ls = g.filter(n => n.class_type==='LoraLoaderModelOnly').map(n => [n.inputs.lora_name, n.inputs.strength_model]), pr = JSON.stringify(g.filter(n => /Minimax|MiniMax/.test(n.class_type)).map(n => n.inputs.prompt).filter(Boolean));
    return {ls, my:/mystyle look/.test(pr), zz:/zzz/.test(pr)}; }, R);
  ok(UL.ls.length===2 && UL.ls[1][0]==='myStyle.safetensors' && UL.ls[1][1]===0.9 && UL.my && !UL.zz, '✨/🔍 the take\'s own LoRAs (that the PC has) and their words go into the pass: ' + JSON.stringify(UL));
  { const CV = await page.evaluate(R => { const oi = Object.assign({}, H3.PC[R].oi, {RepeatImageBatch:{input:{required:{image:['IMAGE'], amount:['INT', {default:1}]}}}});
      const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0))); t.up.part = {a:0, b:118, s0:0, L:124, F:118, pad:6};
      const g = H3.upGraph(t, oi, {}).g, ns = Object.values(g), rp = ns.find(n => n.class_type==='RepeatImageBatch'), fr = ns.filter(n => n.class_type==='ImageFromBatch').map(n => [n.inputs.batch_index, n.inputs.length]);
      return {rp:rp && rp.inputs.amount, fr}; }, R);
    ok(CV.rp===6 && CV.fr.some(x => x[0]===0 && x[1]===118) && CV.fr.some(x => x[0]===117 && x[1]===1), '✨ a 118-frame clip is passed whole: its last frame is repeated to fill MiniMax\'s 124, and all 118 come back redone: ' + JSON.stringify(CV)); }
  const OF = await page.evaluate(() => { const oi = {UNETLoader:{input:{required:{unet_name:[['dasiwa_minimax_h3_ref2va_v4_pruned_int8.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'dasiwa_minimax_h3_fl2va_v4.safetensors', 'minimaxH3INT8INT4_fl2vaINT8Pruned.safetensors']]}}}};
    const only = {UNETLoader:{input:{required:{unet_name:[['dasiwa_minimax_h3_ref2va_v4_pruned_int8.safetensors']]}}}};
    return {ref:H3.regenRefUnet(oi), fl:H3.regenUnet(oi), none:H3.regenRefUnet(only) || null}; });
  { const ML = await page.evaluate(() => { const u = H3.S.pcs[0].url, P = H3.PC[u], was = P.oi; P.oi = Object.assign({}, was, {UNETLoader:{input:{required:{unet_name:[['singularityV2X10eros_prism.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']]}}}});
      const bw = H3.S.bare; H3.S.bare = true; const L = H3.modelList().map(x => x.key + '=' + x.label); H3.S.bare = bw; P.oi = was; return L; });
    ok(ML.length===2 && ML.some(x => /prismpika=Singularity V2 \(PRISM PIKA\)/.test(x)) && !ML.some(x => /prism=/.test(x)), '🦴 two models: PRISM PIKA (not plain PRISM, a different file) and MiniMax H3 Reference: ' + JSON.stringify(ML)); }
  ok(OF.ref==='minimax_h3_ref2va_pruned_int8_convrot.safetensors' && OF.fl==='minimaxH3INT8INT4_fl2vaINT8Pruned.safetensors' && OF.none===null, '✨/🔍 always the official MiniMax files, never DaSiWa or Pika named like them: ' + JSON.stringify(OF));
  const GC = await page.evaluate(R => { const t = H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0), g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g), bl = g.find(n => n.class_type==='ImageBlur'), enc = g.find(n => n.class_type==='VAEEncode');
    return {clean:t.up.clean, blur:bl && bl.inputs.sigma, into:enc && JSON.stringify(enc.inputs.pixels), bid:bl && Object.keys(H3.upGraph(t, H3.PC[R].oi, {}).g).find(k => H3.upGraph(t, H3.PC[R].oi, {}).g[k].class_type==='ImageBlur'), sig:g.find(n => n.class_type==='ManualSigmas').inputs.sigmas}; }, R);
  ok(GC.clean===0.8 && GC.blur===0.8 && GC.into===JSON.stringify([GC.bid, 0]) && /0\.125/.test(GC.sig) && / 0\.0$/.test(GC.sig), '🧽 grain clean-up on by default: frames softened before the encode, one more small step at the end: ' + JSON.stringify(GC));
  await page.waitForTimeout(1500); await fr.evaluate(() => FILM.liveFilm());
  const QF = await fr.evaluate(() => ({n:FILM.S.films[0].tracks.length, takes:FILM.S.films[0].tracks[0].clips.map(c => c.take).join(), p:FILM.S.passes.map(x => x.state).join()}));
  { const HQ = await fr.evaluate(() => { const f = FILM.S.films[0], tr = f.tracks[0], c = tr.clips[0]; FILM.hqSheet(f, tr, c); const q = s => document.querySelector(s);
      const r = {n:document.querySelectorAll('#hqLv button').length, on:q('#hqLv button.on') && q('#hqLv button.on').textContent, go:!!q('#hqGo')};
      q('#hqLv [data-v="0.75"]').click(); r.on2 = q('#hqLv button.on').textContent; r.d = q('#hqD').textContent; q('[data-close]').click(); return r; });
    ok(HQ.n===3 && HQ.on==='Strong' && HQ.go && HQ.on2==='Medium' && /close to the clip/.test(HQ.d), '✨ High quality asks how strong: Light / Medium / Strong (Strong first time): ' + JSON.stringify(HQ)); }
  // ✨ model pick: vanilla MiniMax by default, or another model on the PCs (Prism Pika); the pass uses it and a PC without it says so
  { const HM = await fr.evaluate(() => { const H = window.parent.H3, f = FILM.S.films[0], tr = f.tracks[0], c = tr.clips[0], keep = H.hqUnets;
      H.hqUnets = () => ['singularityV2X10eros_prismPIKA.safetensors']; FILM.hqSheet(f, tr, c); const q = s => document.querySelector(s), o = [...document.querySelectorAll('#hqM option')];
      const r = {n:o.length, v0:q('#hqM').value, lab:o[1] && o[1].textContent}; q('[data-close]').click(); H.hqUnets = keep; return r; });
    const HG = await page.evaluate(R => { const P = H3.PC[R].oi, oi = Object.assign({}, P), un = ((((P.UNETLoader || {}).input || {}).required || {}).unet_name || [[]])[0];
      oi.UNETLoader = {input:{required:{unet_name:[un.concat(['singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'])]}}};
      oi.LoraLoaderModelOnly = {input:{required:{lora_name:[['open_regenerate.safetensors']]}}};
      const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0))); t.up.unet = 'singularityV2X10eros_prismPIKA.safetensors'; delete t.up.faces;
      const un1 = Object.values(H3.upGraph(t, oi, {}).g).filter(n => n.class_type==='UNETLoader').map(n => n.inputs.unet_name);
      const miss = H3.regenMissing(Object.assign({}, oi, {UNETLoader:{input:{required:{unet_name:[un]}}}}), t); t.up.unet = '';
      const un0 = Object.values(H3.upGraph(t, oi, {}).g).filter(n => n.class_type==='UNETLoader').map(n => n.inputs.unet_name); return {un1, un0, miss}; }, R);
    ok(HM.n===2 && HM.v0==='' && HM.lab==='Prism Pika' && HG.un1.join()==='singularityV2X10eros_prismPIKA.safetensors' && /fl2va/.test(HG.un0.join()) && /no singularityV2X10eros_prismPIKA/.test(HG.miss),
      '✨ High quality can use another model (Prism Pika); vanilla stays the default, a PC without it is skipped: ' + JSON.stringify({HM, HG})); }
  // 🎭 Faces: one MiniMax redraw per face with only her pictures; SAM 3 follows her face from the tap; only the face is laid back
  { const FG = await page.evaluate(R => { const keep = H3.S.cast; ['fa1','fa2','fb1'].forEach(k => H3.S.media[k] = {kind:'img', thumb:'x', name:k + '.png'});
      H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Laura', pics:['fa1','fa2'], keep:'exact'}, {n:2, kind:'char', stand:'a man', who:'Ben', pics:['fb1'], keep:'exact'}];
      const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0))); t.prompt = t.up.prompt = '<Subject 1> hugs <Subject 2>.'; t.film = H3.S.fkey; t.up.faces = [{n:1, x:0.3, y:0.25}, {n:2, x:0.7, y:0.3}];
      const P = H3.PC[R].oi, oi = Object.assign({}, P); ['SAM3_Detect','SAM3_VideoTrack','SAM3_TrackToMask','GrowMask','MaskToImage','ImageToMask','ImageBlur','ImageCompositeMasked','MiniMaxH3ReferenceToVideo'].forEach(c => { if(!oi[c]) oi[c] = {input:{required:{}}}; });
      oi.CheckpointLoaderSimple = {input:{required:{ckpt_name:[['sam3.1_multiplex_fp16.safetensors']]}}};
      const un = ((((P.UNETLoader || {}).input || {}).required || {}).unet_name || [[]])[0]; oi.UNETLoader = {input:{required:{unet_name:[un.concat(['minimax_h3_ref2va_pruned_int8_convrot.safetensors'])]}}};
      const names = {fa1:'fa1.png', fa2:'fa2.png', fb1:'fb1.png'}, g = Object.values(H3.upGraph(t, oi, names).g), C = c => g.filter(n => n.class_type===c);
      const refsOf = C('MiniMaxH3ReferenceToVideo').map(n => Object.keys(n.inputs).filter(k => /^ref_images/.test(k)).length), dets = C('SAM3_Detect').map(n => n.inputs.positive_coords);
      const r = {on:H3.facesOn(t), why:H3.regenMissing ? H3.regenMissing(oi, t) : '', samp:C('SamplerCustomAdvanced').length, refs:refsOf, comp:C('ImageCompositeMasked').length, dets, pr:C('MiniMaxH3ReferenceToVideo').map(n => /<Picture 1>/.test(n.inputs.prompt)), track:C('SAM3_VideoTrack').length, fr:H3.faceRefs(t, 2).map(x => x.id)};
      H3.S.cast = keep; return r; }, R);
    ok(FG.on && FG.samp===2 && JSON.stringify(FG.refs)==='[2,1]' && FG.comp===2 && FG.track===2 && FG.dets.length===2 && /"x":/.test(FG.dets[0]) && JSON.stringify(FG.fr)==='["fb1"]', '🎭 two faces: two MiniMax redraws (2 and 1 pictures, her own only), each face followed by SAM 3 and laid back: ' + JSON.stringify(FG)); }
  { const FS = await fr.evaluate(async () => { const H = window.parent.H3, keep = H.S.cast; H.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Laura', pics:[], keep:'exact'}, {n:2, kind:'char', stand:'a man', who:'Ben', pics:[], keep:'exact'}];
      const ws = window.parent.H3FaceScan, wg = window.parent.H3FaceScanGet; let asked = null, sent = null; window.parent.H3FaceScan = async o => { asked = o; return {pc:'u', pid:'p1', node:'9', a:0, b:48}; }; window.parent.H3FaceScanGet = async q => ({url:'about:blank#scan'});
      const f = FILM.S.films[0], tr = f.tracks[0], c = tr.clips[0]; delete c.faceScan; FILM.facesSheet(f, tr, c); const q = s => document.querySelector(s), w = ms => new Promise(z => setTimeout(z, ms));
      const r = {find:!!q('#fcFind'), go0:q('#fcGo').disabled}; q('#fcFind').click(); await w(2600);
      r.asked = asked && asked.take===c.take && asked.a===c.in; r.vid = !!q('#fcV'); r.rows = document.querySelectorAll('#fcWho .chips').length;
      q('#fcWho [data-fp="1:1"]').click(); q('#fcWho [data-fp="2:0"]').click(); q('#fcWho [data-fp="2:1"]').click(); r.go = q('#fcGo').textContent; r.pick = JSON.stringify(c.faceScan.pick);
      const qg = FILM.qualityGo; q('[data-close]').click(); window.parent.H3FaceScan = ws; window.parent.H3FaceScanGet = wg; delete c.faceScan; H.S.cast = keep; return r; });
    ok(FS.find && FS.go0 && FS.asked && FS.vid && FS.rows===2 && FS.pick==='{"2":1}' && /1 face/.test(FS.go), '🎭 Faces: 🔎 finds the faces, the numbered video shows, a number goes to one person only (Ben took 1 from Laura): ' + JSON.stringify(FS)); }
  { const FN = await page.evaluate(R => { const keep = H3.S.cast; H3.S.media.fa1 = {kind:'img', thumb:'x', name:'fa1.png'}; H3.S.media.fb1 = {kind:'img', thumb:'x', name:'fb1.png'};
      H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Laura', pics:['fa1'], keep:'exact'}, {n:2, kind:'char', stand:'a man', who:'Ben', pics:['fb1'], keep:'exact'}];
      const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.redo && x.redo.qp && x.redo.wi===0))); t.prompt = t.up.prompt = '<Subject 1> hugs <Subject 2>.'; t.film = H3.S.fkey; t.up.faces = [{n:1, obj:1}, {n:2, obj:0}];
      const P = H3.PC[R].oi, oi = Object.assign({}, P); ['SAM3_Detect','SAM3_VideoTrack','SAM3_TrackToMask','SAM3_TrackPreview','GrowMask','MaskToImage','ImageToMask','ImageBlur','ImageCompositeMasked','MiniMaxH3ReferenceToVideo'].forEach(c => { if(!oi[c]) oi[c] = {input:{required:{}}}; });
      oi.CheckpointLoaderSimple = {input:{required:{ckpt_name:[['sam3.1_multiplex_fp16.safetensors']]}}};
      const un = ((((P.UNETLoader || {}).input || {}).required || {}).unet_name || [[]])[0]; oi.UNETLoader = {input:{required:{unet_name:[un.concat(['minimax_h3_ref2va_pruned_int8_convrot.safetensors'])]}}};
      const g = Object.values(H3.upGraph(t, oi, {fa1:'fa1.png', fb1:'fb1.png'}).g), C = c => g.filter(n => n.class_type===c);
      const sg = Object.values(H3.faceScanGraph(t, {filename:'x.mp4', subfolder:''}, oi, {a:t.up.part.a, b:t.up.part.b}).g), tk = x => x.filter(n => n.class_type==='SAM3_VideoTrack').map(n => [n.inputs.detection_threshold, n.inputs.max_objects]);
      const fb = x => x.filter(n => n.class_type==='ImageFromBatch').map(n => [n.inputs.batch_index, n.inputs.length]);
      const r = {trk:C('SAM3_VideoTrack').length, det:C('SAM3_Detect').length, idx:C('SAM3_TrackToMask').map(n => n.inputs.object_indices), same:JSON.stringify(tk(g))===JSON.stringify(tk(sg).slice(0, 1)), win:JSON.stringify(fb(sg)[0]), pv:sg.some(n => n.class_type==='SAM3_TrackPreview'), txt:sg.find(n => n.class_type==='CLIPTextEncode').inputs.text};
      r.inPass = fb(g).some(x => JSON.stringify(x)===r.win); H3.S.cast = keep; return r; }, R);
    ok(FN.trk===1 && FN.det===0 && FN.idx.join()==='1,0' && FN.same && FN.pv && FN.inPass && FN.txt==='face:4', '🎭 numbered faces: one tracker on the same frames as the scan, each person takes her number: ' + JSON.stringify(FN)); }
  { const RR = await page.evaluate(async () => { const t = H3.S.takes.find(x => x.state==='done' && !x.redo && x.pieces && x.pieces.length); if(!t) return {none:true};
      const n0 = H3.S.takes.length; document.body.insertAdjacentHTML('beforeend', `<button id="rrT" data-act="reroll" data-t="${t.id}">x</button>`); document.getElementById('rrT').click(); document.getElementById('rrT').remove();
      const box = document.querySelector('#rrP'), was = box && box.value; if(!box) return {sheet:false}; let sent = null; const spy = e => { const x = e.target.closest && e.target.closest('[data-act="rerollGo"]'); if(x) sent = x.dataset.words; }; document.addEventListener('click', spy, true); box.value = 'she dances in the rain'; document.querySelector('#rrGo').click(); document.removeEventListener('click', spy, true); await new Promise(r => setTimeout(r, 300));
      const nt = H3.S.takes[0], toastT = [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' ~ '); return {sent, toastT, sheet:true, was:was===t.prompt, more:H3.S.takes.length===n0 + 1, pr:nt.prompt, pp:nt.pieces.map(p => p.prompt).join(' | '), old:t.prompt}; });
    ok(RR.sheet && RR.was && RR.sent==='she dances in the rain' && (RR.more ? RR.pr==='she dances in the rain' && /she dances in the rain/.test(RR.pp) : /No PC/.test(RR.toastT)), '🎲 New take lets you change the words first: ' + JSON.stringify(RR)); }
  // 📝 bare bones: no prompt lane; a selected clip shows its words as prompt windows (+ switch sliders) and its LoRAs; ⛓ Combine keeps the windows
  { const PW = await fr.evaluate(async () => { const H = window.parent.H3, bw = H.S.bare; H.S.bare = true; const f = FILM.S.films[0], tr = f.tracks[0], cs = tr.clips.slice().sort((x, y) => x.at - y.at), c = cs[0], t = FILM.takeOf ? FILM.takeOf(c.take) : H.S.takes.find(x => x.id===c.take);
      const q = s => document.querySelector(s), box = q('#pbBox'); box.dataset.cp = ''; box.innerHTML = ''; FILM.clipPanel(f, {c, tr, k:0});
      const r = {lane:FILM.laneHtml ? FILM.laneHtml(f) : 'n/a', boxes0:document.querySelectorAll('#cpW textarea').length, lo:!!q('#cpLo'), vid:!!q('#cpV')};
      q('#cpW [data-wadd]').click(); r.boxes1 = document.querySelectorAll('#cpW textarea').length; const sl = q('#cpW [data-sw="0"]'); r.sl = !!sl;
      if(sl){ sl.value = '1.5'; sl.dispatchEvent(new Event('input')); } const ta = q('#cpW [data-w="1"]'); ta.value = 'she sits down'; ta.dispatchEvent(new Event('input'));
      r.wins = (t.wins || []).map(x => [x.a, x.b, x.text.slice(0, 14)]); r.cin = c.in; r.segs = FILM.segsOf(t).length;
      delete t.wins; box.dataset.cp = ''; box.innerHTML = '';
      const on = new Set(cs.slice(0, 2).map(x => x.id)); let got = null; const was = window.parent.H3Combine; window.parent.H3Combine = async o => { got = o; return 1; };
      FILM.combineBare(f, {c, tr, k:0}, cs, on); r.cb = document.querySelectorAll('#cbW textarea').length; const s2 = q('#cbW [data-sw="0"]'); r.cbs = !!s2;
      if(s2){ s2.value = String(Math.min(+s2.max - 0.5, (cs[0].out - cs[0].in) + 0.6)); s2.dispatchEvent(new Event('input')); r.vc = q('#cbV').dataset.c===cs[1].id; }
      q('#cbGo').click(); await new Promise(z => setTimeout(z, 200)); window.parent.H3Combine = was; r.go = got && {w:(got.wins || []).length, p:/\[0s-/.test(got.prompt || '')};
      const sh = document.getElementById('sheet'); if(sh) sh.hidden = true; H.S.bare = bw; return r; });
    ok(PW.lane==='' && PW.boxes0===1 && PW.vid && PW.boxes1===2 && PW.sl && PW.wins.some(w => w[2]==='she sits down' && Math.abs(w[0] - (PW.cin + 1.5)) < 0.01) && PW.segs===PW.wins.length && PW.cb===2 && PW.cbs && PW.vc && PW.go && PW.go.w===2 && PW.go.p,
      '📝 a clip\'s words are prompt windows with switch sliders, and ⛓ Combine keeps them (no prompt lane in bare bones): ' + JSON.stringify(PW)); }
  // 🗂 Renders tab: every take from every film, rendering ones first, with filters
  { await page.click('#tabs [data-tab="renders"]'); await page.waitForTimeout(300);
    const RT = await page.evaluate(() => { const q = s => document.querySelector(s), cards = () => [...document.querySelectorAll('#rtList .take')];
      const r = {shown:!q('#rendersTab').hidden, films:q('#renderTab').hidden, n:cards().length, all:H3.S.takes.length, fl:!!q('#rtList .rtFilm')};
      const w = H3.S.takes.filter(t => t.state==='working').length; q('#rtSeg [data-rt="done"]').click(); r.done = cards().length; r.doneN = H3.S.takes.filter(t => t.state!=='working' && t.state!=='failed').length;
      q('#rtSeg [data-rt="all"]').click(); const ids = cards().map(e => e.dataset.take), st = ids.map(id => H3.S.takes.find(t => t.id===id).state), fw = st.indexOf('working');
      r.order = fw < 0 || st.slice(0, w).every(x => x==='working'); const gb = q('#rtList [data-gofilm]'); r.go = !!gb; if(gb){ r.want = gb.dataset.gofilm; gb.click(); } return r; });
    await page.waitForTimeout(700); const GF = await page.evaluate(() => { const fr = document.querySelector('#filmTab iframe'), F = fr && fr.contentWindow.FILM; return {tab:H3.S.tab, film:F && F.N ? F.N().film : (fr && fr.contentWindow.FILM && fr.contentWindow.FILM.S && fr.contentWindow.FILM.S.nav && fr.contentWindow.FILM.S.nav.film)}; }); RT.gf = GF;
    ok(RT.shown && RT.films && RT.n===RT.all && RT.fl && RT.done===RT.doneN && RT.order && RT.go && GF.tab==='films', '🗂 Renders tab lists every take (rendering first), filters to Done: ' + JSON.stringify(RT)); }
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
  { const BC0 = await page.evaluate(() => H3.S.takes.filter(x => x.combo).length); const BL = await fr.evaluate(() => { const f = FILM.S.films[0], p0 = FILM.S.passes[0], n0 = f.tracks.length; FILM.S.passes.push(Object.assign({}, p0, {state:'working', o:Object.assign({}, p0.o, {sep:true})})); FILM.liveFilm();
      const tr = f.tracks[0]; return {more:f.tracks.length - n0, blend:!!tr.blend, clips:tr.clips.map(c => [c.in, c.at, !!FILM.takeOf(c.take).redo.qp])}; }); await page.waitForTimeout(300);
    const BC = await page.evaluate(() => H3.S.takes.filter(x => x.combo).length);
    ok(BL.more===1 && BL.blend && BL.clips.length===2 && BL.clips[0][0]===0.5 && BL.clips[1][1]===2 && BL.clips.every(x => x[2]) && BC===BC0, '▦ blend track: the passes go on a new top track as separate clips, not joined: ' + JSON.stringify({BL, BC, BC0}));
    await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks.shift(); }); }
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
  await fr.click('.trk[data-k="0"] [data-act="trackMenu"]'); await fr.click('#sheetCard [data-act="qualitySheet"]'); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => /640×352 → 960×512/.test(document.querySelector('#sheetCard').textContent)), '🔍 the sheet offers the bigger last step with its size');
  await fr.click('#qpBig'); await page.waitForTimeout(600);
  const BG = await page.evaluate(R => { const T = H3.S.takes.filter(x => x.redo && x.redo.big), t = T.find(x => x.redo.wi===0); if(!t) return null; const g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g);
    return {n:T.length, crop:t.up.crop, scale:t.up.scale, ib:g.filter(n => n.class_type==='ImageFromBatch').map(n => [n.inputs.batch_index, n.inputs.length]), up:!!g.find(n => n.class_type==='MinimaxH3LatentUpscaler3D'), vs:(g.find(n => n.class_type==='Video Slice') || {}).inputs, iv:(g.find(n => /MiniMaxH3(Image|Reference)ToVideo/.test(n.class_type)) || {}).inputs}; }, R);
  ok(BG && BG.n===2 && BG.scale===1.5 && BG.crop.L % 17===5 && BG.ib.length===1 && BG.ib[0][0]===BG.crop.s0 && BG.ib[0][1]===BG.crop.L && BG.up && BG.vs && BG.iv.width===960 && BG.iv.height===512 && BG.iv.length===BG.crop.L, '🔍 one part per join, each only its stretch, upscaled, sound cut to it: ' + JSON.stringify(BG && {n:BG.n, crop:BG.crop, ib:BG.ib, vs:BG.vs, w:BG.iv.width, h:BG.iv.height}));
  const PX = await page.evaluate(R => { const t = H3.S.takes.find(x => x.redo && x.redo.big && x.redo.wi===0), oi = Object.assign({}, H3.PC[R].oi, {RenderDeckUpscaleFit:{input:{required:{image:['IMAGE'], model_name:[['RealESRGAN_x4plus.safetensors', 'realesr-animevideov3.pth', 'realesr-general-x4v3.pth']], width:['INT', {}], height:['INT', {}]}}}});
    const g = Object.values(H3.upGraph(t, oi, {}).g), u = g.find(n => n.class_type==='RenderDeckUpscaleFit');
    return {u:u && u.inputs, lat:!!g.find(n => n.class_type==='MinimaxH3LatentUpscaler3D'), enc:JSON.stringify(g.find(n => n.class_type==='VAEEncode').inputs.pixels), look:t.up.look}; }, R);
  ok(PX.u && PX.u.model_name==='realesr-general-x4v3.pth' && PX.u.width===960 && PX.u.height===512 && !PX.lat && PX.look==='live', '🔍 with the helper node: frames go 4x Real-ESRGAN (live action) → fitted to 960×512 → encode, no latent upscaler: ' + JSON.stringify(PX));
  await page.evaluate(() => { H3.S.takes.filter(x => x.redo && x.redo.big).forEach(t => { t.upStage = 'done'; t.state = 'done'; t.upErr = ''; t.final = {filename:'big' + t.redo.wi + '.mp4', subfolder:'Output_Render/H3Deck/b', type:'output'}; }); H3.saveNow(); });
  await fr.evaluate(() => { FILM.S.passes.forEach(p => { if(p.big) p.state = 'working'; }); FILM.liveFilm(); }); await page.waitForTimeout(300);
  const BW = await fr.evaluate(() => { FILM.draw(); const f = FILM.S.films[0], cs = f.tracks[0].clips; return {n:f.tracks.length, big:cs.every(c => { const t = FILM.takeOf(c.take); return t && t.redo && t.redo.big; }), lens:cs.map(c => +(c.out - c.in).toFixed(2)), ats:cs.map(c => c.at), lab:document.querySelector('.trk[data-k="0"] .clip .nm').textContent}; });
  ok(BW.n===3 && BW.big && JSON.stringify(BW.lens)==='[2,2]' && JSON.stringify(BW.ats)==='[0,2]' && /^🔍/.test(BW.lab), '🔍 the bigger parts are on a new top track, same timing: ' + JSON.stringify(BW));
  // ↻ redo strength + LoRAs (Jordan 2026-11-08): below 1 the window starts from the take's own frames with only the last steps run
  { const RS = await page.evaluate(R => { const oi = Object.assign({}, H3.PC[R].oi, {VAEEncode:{input:{required:{pixels:['IMAGE'], vae:['VAE']}}}, LTXVSeparateAVLatent:{input:{required:{av_latent:['LATENT']}}}, LTXVConcatAVLatent:{input:{required:{video_latent:['LATENT'], audio_latent:['LATENT']}}}, ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
        LoraLoaderModelOnly:{input:{required:{model:['MODEL'], lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'myStyle.safetensors']], strength_model:['FLOAT', {default:1}]}}}});
      const src = H3.S.takes.find(x => x.id==='tA'), P = H3.H3RedoPlan ? window.H3RedoPlan(120, 30, 60, 12) : window.H3RedoPlan(120, 30, 60, 12);
      const mk = str => Object.assign(JSON.parse(JSON.stringify(src)), {id:'tRS', loras:[{name:'myStyle.safetensors', str:0.7, words:''}], redo:Object.assign({src:'tA', root:'tA', file:'x.mp4 [output]', sound:false, str}, P), pieces:[{start:P.s0 / 24, gen:P.L, deliv:P.L, ctx:0, prompt:'she waves', state:'new'}], sm:null, cont:null, ctl:null, ctl2:null, carry:null, lead:null, fl:false});
      const g1 = Object.values(H3.pieceGraph(mk(0.6), 0, oi, {}).g), g2 = Object.values(H3.pieceGraph(mk(1), 0, oi, {}).g);
      const den = g => (g.find(n => n.class_type==='BasicScheduler') || {inputs:{}}).inputs.denoise;
      return {d1:den(g1), enc1:g1.some(n => n.class_type==='VAEEncode'), d2:den(g2), enc2:g2.some(n => n.class_type==='VAEEncode'), lora:g1.filter(n => n.class_type==='LoraLoaderModelOnly').map(n => [n.inputs.lora_name, n.inputs.strength_model])}; }, R);
    ok(RS.d1===0.6 && RS.enc1 && RS.d2===1 && !RS.enc2 && RS.lora.some(([n, s]) => n==='myStyle.safetensors' && s===0.7), '↻ redo strength starts from the take\'s frames at that denoise, and its LoRAs go along: ' + JSON.stringify(RS)); }
  // 🦴 bare bones + 📤 upload a clip (Jordan 2026-11-08)
  { await page.click('#setBtn'); await page.click('#bareSw'); await page.waitForTimeout(300);
    const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
    const B = await page.evaluate(() => ({bare:document.body.classList.contains('bare'), sm:getComputedStyle(document.querySelector('#smSw')).display, ref:getComputedStyle(document.querySelector('#refSw')).display, more:getComputedStyle(document.querySelector('#bMore')).display, inp:getComputedStyle(document.querySelector('#bInputs')).display, rf:H3.S.f.ref, h3:H3.S.f.h3, h3sw:getComputedStyle(document.querySelector('#h3Sw')).display, notes:[...document.querySelectorAll('#renderTab .note:not(#filmFormNote)')].filter(e => getComputedStyle(e).display!=='none').length, fl:!!(H3.S.f.fl && H3.S.f.first), asp:[...document.querySelectorAll('#aspects [data-asp]')].map(b => b.textContent).join('|'), res:getComputedStyle(document.querySelector('#resRow')).display, S:H3.S.bare}));
    const FB = await fr.evaluate(() => { const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display!=='none'; }; return {bare:document.body.classList.contains('bare'), redo:vis('.tools [data-act="redo"]'), carry:vis('.tools [data-act="carry"]'), lead:vis('.tools [data-act="lead"]'), up:(() => { document.querySelector('.tools [data-act="addClip"]').click(); const o = ['clipNew', 'upload', 'clipPick'].every(k => !!document.querySelector('#sheetCard [data-act="' + k + '"]')); document.querySelector('#sheetCard [data-close]').click(); return o; })(), more:vis('.tools [data-act="moreTools"]'), ed:vis('.tools [data-act="editDeck"]')}; });
    await page.click('#bareSw'); await page.click('#sheet', {position:{x:5, y:5}});
    const B2 = await page.evaluate(() => ({bare:document.body.classList.contains('bare'), S:H3.S.bare}));
    ok(B.bare && B.S===true && B.sm==='none' && B.more==='none' && (B.inp==='none')===!B.fl && B.rf===true && B.h3===true && B.h3sw==='none' && B.notes===0 && /^▭ Wide\|◻ Square\|▯ Tall/.test(B.asp) && B.res==='none' && B.ref!=='none' && FB.bare && FB.redo && FB.carry && FB.lead && FB.up && !FB.more && !FB.ed && !B2.bare && B2.S===false, '🦴 ⚙ Show all the tools off = bare bones (no smoothing, redo, guides), on = everything back: ' + JSON.stringify({B, FB, B2}));
    const n0 = await page.evaluate(() => 0);
    const U = await page.evaluate(async R => { Object.assign(H3.PC[R].oi, {ImageScale:{input:{required:{image:['IMAGE'], upscale_method:[['lanczos']], width:['INT', {default:512}], height:['INT', {default:512}], crop:[['center']]}}},
        VHS_LoadVideo:{input:{required:{video:[['a.mp4']], force_rate:['FLOAT', {default:0}], custom_width:['INT', {default:0}], custom_height:['INT', {default:0}], frame_load_cap:['INT', {default:0}], skip_first_frames:['INT', {default:0}], select_every_nth:['INT', {default:1}]}, optional:{}}}});
      const b = await (await fetch(R + '/view?filename=phone.webm')).blob(), file = new File([b], 'phone clip.webm', {type:'video/webm'});
      const id = await window.H3Upload({file, film:'fU'}), t = H3.S.takes.find(x => x.id===id); return {id, film:t && t.film, w:t && t.w, h:t && t.h, F:t && t.pieces[0].deliv, up:t && t.upName, st:t && t.pieces[0].state}; }, R);
    const G = sent[sent.length - 1].g, nodes = Object.values(G), vl = nodes.find(n => n.class_type==='VHS_LoadVideo'), sc = nodes.find(n => n.class_type==='ImageScale'), cv = nodes.find(n => n.class_type==='CreateVideo');
    ok(U.id && U.film==='fU' && U.w % 32===0 && U.h % 32===0 && U.F > 20 && U.up==='phone clip.webm' && U.st==='queued' && vl && vl.inputs.force_rate===24 && (vl.inputs.custom_width===U.w) !== (vl.inputs.custom_height===U.h) && vl.inputs.frame_load_cap >= U.F && /^up_/.test(vl.inputs.video) && sc && sc.inputs.width===U.w && cv && cv.inputs.fps===24 && nodes.some(n => n.class_type==='SaveVideo'),
      '📤 an uploaded clip goes to a PC and comes back as a 24 fps take at a MiniMax size, in its film: ' + JSON.stringify({U, vl:vl && vl.inputs})); }
  // 📝 prompt track (Jordan 2026-11-08): blocks under the video, each its own render with its own words and LoRAs
  { const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
    await page.evaluate(() => { for(const u of Object.keys(H3.PC)){ const oi = H3.PC[u].oi; if(!oi) continue; oi.ImageBatch = {input:{required:{image1:['IMAGE'], image2:['IMAGE']}}}; oi.LoraLoaderModelOnly = {input:{required:{model:['MODEL'], lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'myStyle.safetensors']], strength_model:['FLOAT', {default:1}]}}}; } });
    const src = await fr.evaluate(() => { const L = window.parent.H3.S.takes.filter(x => FILM.fileOf(x) && x.state!=='working' && !x.redo && !x.upName && x.pieces.length===1), t = L.find(x => x.id==='tA') || L[0]; return t && t.id; });
    const P1 = await fr.evaluate(src => { const f = {id:'fPT', name:'Prompt test', tracks:[{id:'tP1', clips:[{id:'cP1', take:src, in:0, out:5, dur:5, at:0}]}, {id:'tP2', clips:[]}], pps:24}; FILM.S.films.push(f); FILM.go({v:'film', film:'fPT'});
      const auto = (f.prompts || []).map(b => [b.at, b.len, !!b.prompt, b.from]); f.prompts = []; f.pmade = {cP1:1};
      const b1 = FILM.addBlock(f, 1), b2 = FILM.addBlock(f, 4), b3 = FILM.addBlock(f, 5), b4 = FILM.addBlock(f, 12), b5 = FILM.addBlock(f, 2);
      FILM.draw && FILM.draw(); return {auto, b1:b1 && [b1.at, b1.len], b2:b2 && [b2.at, b2.len], b3:b3 && [b3.at, b3.len], b4:b4 && [b4.at, b4.len], b5:!!b5, k:[b1, b2, b3, b4].map(b => FILM.blockPlan(f, b).kind), lane:!!document.querySelector('#ptrk'), n:document.querySelectorAll('#ptrk .pblk').length}; }, src);
    await page.waitForTimeout(300);
    const n0 = await page.evaluate(() => H3.S.takes.length);
    const R1 = await fr.evaluate(async () => { const f = FILM.S.films.find(x => x.id==='fPT'), b = FILM.blocks(f)[0]; Object.assign(b, {prompt:'she turns to the window', str:0.7, loras:[{name:'myStyle.safetensors', str:0.6, words:''}]});
      const ok = await FILM.renderBlock(f, b); return {ok, clips:f.tracks[0].clips.map(c => [c.at, c.in, c.out]).sort((x, y) => x[0] - y[0])}; });
    const T1 = await page.evaluate(() => { const t = H3.S.takes[0]; return {redo:!!t.redo, str:t.redo && t.redo.str, lo:(t.loras || []).map(l => l.name + ':' + l.str), pr:t.prompt, film:t.film}; });
    const R4 = await fr.evaluate(async () => { const f = FILM.S.films.find(x => x.id==='fPT'), b = FILM.blocks(f).find(x => x.at===12); b.prompt = 'a bird lands on the sill'; return await FILM.renderBlock(f, b); });
    await page.waitForTimeout(1200);
    const T4 = await page.evaluate(() => { const t = H3.S.takes.find(x => /bird lands/.test(x.prompt || '')); return t && {at:t.toFilm && t.toFilm.at, tr:t.toFilm && t.toFilm.track, clip:t.toFilm && t.toFilm.clip, secs:t.seconds}; });
    const REDO = await page.evaluate(() => (document.querySelector('.toast:last-child') || {}).textContent || '');
    await fr.evaluate(() => FILM.go({v:'film', film:FILM.S.films[0].id})); await page.waitForTimeout(400);
    ok(src && JSON.stringify(P1.auto)==='[[0,5,true,"cP1"]]' && P1.lane && JSON.stringify(P1.b1)==='[1,3]' && JSON.stringify(P1.b2)==='[4,1]' && P1.b3 && P1.b3[0]===5 && P1.b4 && P1.b4[0]===12 && !P1.b5 && P1.k.join()==='over,over,carry,new'
      && R1.ok && JSON.stringify(R1.clips)==='[[0,0,1],[1,1,4],[4,4,5]]' && T1.redo && T1.str===0.7 && T1.lo.join()==='myStyle.safetensors:0.6' && /turns to the window/.test(T1.pr)
      && R4 && T4 && T4.at===12 && T4.tr==='tP1' && !T4.clip,
      '📝 prompt blocks: over video = that stretch remade as its own clip with the block\'s words, LoRAs and strength; after a clip = carry on; empty = a new clip right there: ' + JSON.stringify({src, P1, R1, T1, R4, T4, REDO})); }
  // ⏱ a rendering clip shows its step and a bar
  { const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
    const ST = await page.evaluate(() => { const t = H3.S.takes.find(x => x.state==='working' && x.pieces.some(p => p.pid)); if(!t) return null; const p = t.pieces.find(x => x.pid); p.state = 'running'; return {id:t.id, s:H3.stepOf(t)}; });
    const G = await fr.evaluate(id => { const f = FILM.S.films.find(x => x.tracks.some(tr => tr.clips.some(c => c.take===id))); if(f) FILM.go({v:'film', film:f.id}); return !!f; }, ST && ST.id); await page.waitForTimeout(1500);
    const D = await fr.evaluate(() => { const el = document.querySelector('.clip.rend .st'), pg = document.querySelector('.clip.rend .pg i'); return {st:el && el.textContent, pg:!!pg}; });
    ok(ST && /loading|\d+\/\d+/.test(ST.s) && (!G || (D.pg && /loading|\d+\/\d+/.test(D.st))), '⏱ a rendering clip shows its step and a progress bar: ' + JSON.stringify({ST, G, D}));
    await fr.evaluate(() => FILM.go({v:'film', film:FILM.S.films[0].id})); await page.waitForTimeout(300); }
  // 📐 the canvas follows the clip under the playhead
  { const SH = await page.evaluate(() => { window.H3FilmFollow(); const was = {a:H3.S.f.aspect, mp:H3.S.f.mp, tab:H3.S.tab, sm:H3.S.f.sm, fl:H3.S.f.fl}; const ch = window.H3FilmShape({w:480, h:864}); const now = {a:H3.S.f.aspect, mp:H3.S.f.mp}; H3.S.f.aspect = was.a; H3.S.f.mp = was.mp; return {ch, now, was}; });
    ok(SH.ch===true && SH.now.a==='9:16' && Math.abs(SH.now.mp - 0.41) < 0.01, '📐 the canvas follows the clip: a tall 480×864 clip makes it Tall at its size: ' + JSON.stringify(SH)); }
  // 🎞 each film keeps its own form, cast and takes (Jordan 2026-11-07: prompts bled from one film to the next)
  { const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url())); const A = await fr.evaluate(() => FILM.S.films[0].id);
    await page.evaluate(() => { H3.S.f.prompt = 'film A words'; document.querySelector('#prompt').value = 'film A words'; H3.S.f.loras = [{name:'aStyle.safetensors', str:1, words:''}]; H3.S.f.model = H3.S.f.model || 'mA'; H3.S.cast.push({n:7, kind:'char', stand:'a tall woman', who:'', keep:'exact'}); H3.saveNow(); });
    const mA = await page.evaluate(() => H3.S.f.model);
    const B = await fr.evaluate(() => { const f = {id:'fB', name:'Film B', tracks:[{id:'trB', clips:[]}, {id:'trB2', clips:[]}], pps:24}; FILM.S.films.push(f); FILM.go({v:'film', film:'fB'}); return f.id; });
    await page.waitForTimeout(400);
    const inB = await page.evaluate(() => ({fkey:H3.S.fkey, pr:H3.S.f.prompt, box:document.querySelector('#prompt').value, loras:H3.S.f.loras.length, model:H3.S.f.model, c7:H3.S.cast.some(c => c.n===7)}));
    await page.evaluate(() => { H3.S.f.prompt = 'film B words'; const t = JSON.parse(JSON.stringify(H3.S.takes.find(x => x.pieces && x.pieces.length))); Object.assign(t, {id:'tFB', film:undefined}); delete t.film; H3.S.takes.unshift(t); H3.save(); H3.drawTakes(); });
    const bList = await page.evaluate(() => ({film:H3.S.takes.find(x => x.id==='tFB').film, shown:!!document.querySelector('.take[data-take="tFB"]')}));
    await fr.evaluate(A => FILM.go({v:'film', film:A}), A); await page.waitForTimeout(400);
    const inA = await page.evaluate(() => ({fkey:H3.S.fkey, pr:H3.S.f.prompt, c7:H3.S.cast.some(c => c.n===7), shown:!!document.querySelector('.take[data-take="tFB"]')}));
    await fr.evaluate(() => FILM.go({v:'film', film:'fB'})); await page.waitForTimeout(400);
    const back = await page.evaluate(() => H3.S.f.prompt);
    ok(inB.fkey==='fB' && inB.pr==='' && inB.box==='' && inB.loras===0 && inB.model===mA && !inB.c7 && bList.film==='fB' && bList.shown
      && inA.fkey===A && inA.pr==='film A words' && inA.c7 && !inA.shown && back==='film B words',
      '🎞 each film keeps its own prompt, cast and takes: ' + JSON.stringify({inB, bList, inA, back})); }
  // 📚 Library: an entry added to a film's cast is a link; an attribute put on a character goes along as its own picture (attribute_transfer)
  { const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
    await page.click('#tabs [data-tab="lib"]'); await page.waitForTimeout(200);
    const tab = await page.evaluate(() => ({lib:!document.getElementById('libTab').hidden, render:document.getElementById('renderTab').hidden}));
    await page.click('#libTab [data-lib="new"]'); await page.waitForTimeout(200);
    const L1 = await page.evaluate(() => { const L = H3.S.lib[0]; H3.S.media.mL1 = {kind:'img', name:'laura.png', thumb:''}; H3.S.media.mH1 = {kind:'img', name:'hair.png', thumb:''}; L.pics = ['mL1']; L.name = 'Laura'; H3.libSync(L); H3.openLib(L.id); return L.id; });
    await page.click('#lbBox [data-lb="add"]'); await page.waitForTimeout(200);
    const A = await page.evaluate(id => { const c = H3.S.cast.find(x => x.lib===id); const at = H3.libNew('attr'); Object.assign(at, {name:'Silver bob', what:'haircut', pics:['mH1']}); c.attrs = [at.id];
      const L = H3.S.lib.find(x => x.id===id); L.name = 'Laura Vale'; H3.libSync(L);
      const T = H3.castTake({prompt:'<Subject ' + c.n + '> walks to the window.', imgs:[], film:H3.S.fkey}, true);
      const pr = H3.h3Prompt({h3:{}, text:H3.castText('<Subject ' + c.n + '> walks to the window.', T, false), imgs:T.imgs, vids:[], auds:[], secs:5});
      return {n:c.n, who:c.who, imgs:T.imgs.map(r => r.id + (r.attrOf ? '@' + r.attrOf : '')), at:/attribute_transfer - only the haircut from <Picture 2> /.test(pr) && /only the haircut from <Picture 2> \(exactly as shown: the same design, cut, colours, materials and details\) is transferred to <Subject 1>/.test(pr), def:/is the haircut shown in <Picture 2>/.test(pr)}; }, L1);
    const A9 = await page.evaluate(id => { const c = H3.S.cast.find(x => x.lib===id), L = H3.S.lib.find(x => x.id===id), was = L.pics.slice();
      for(let i = 0; i < 9; i++) H3.S.media['mL9' + i] = {kind:'img', name:'l' + i + '.png', thumb:''}; L.pics = [...Array(9)].map((_, i) => 'mL9' + i); H3.libSync(L);
      const T = H3.castTake({prompt:'<Subject ' + c.n + '> walks.', imgs:[], film:H3.S.fkey}, true), pr = H3.h3Prompt({h3:{}, text:H3.castText('<Subject ' + c.n + '> walks.', T, false), imgs:T.imgs, vids:[], auds:[], secs:5});
      const T2 = Object.assign({}, T, {imgs:T.imgs.map(r => r.attrOf ? Object.assign({}, r, {what:'Red butler outfit'}) : r)}), p2 = H3.h3Prompt({h3:{}, text:H3.castText('<Subject ' + c.n + '> walks.', T2, false), imgs:T2.imgs, vids:[], auds:[], secs:5});
      window.__OUT = /identity, face, hair and build from .* are kept; their clothing from those pictures is NOT kept/.test(p2) && (p2.match(/<Subject 1> is wearing <Subject 2> \(the Red butler outfit\)/g) || []).length===2;
      L.pics = was; H3.libSync(L); return {out:window.__OUT, n:T.imgs.length, at:T.imgs.filter(r => r.attrOf).length, exc:/identity, face, build and clothing and colours from .* are kept, because the haircut comes from its own subject/.test(pr) && /<Subject 1> has <Subject 2> \(the haircut\)/.test(pr), rep:/replacing their own/.test(pr)}; }, L1);
    const AC = await page.evaluate(id => { const c = H3.S.cast.find(x => x.lib===id); const L2 = H3.libNew('char'); Object.assign(L2, {name:'Ben', pics:['mL1']}); const c2 = H3.libToCast(L2);
      H3.S.media.mK1 = {kind:'vid', name:'kick.mp4', thumb:'', dur:3}; const K = H3.libNew('act'); Object.assign(K, {name:'Her kick', what:'spinning kick', vid:'mK1'}); c.acts = [{id:K.id, to:c2.n}];
      const P = '<Subject ' + c.n + '> fights <Subject ' + c2.n + '>.', T = H3.castTake({prompt:P, imgs:[], vids:[], film:H3.S.fkey}, true), pr = H3.h3Prompt({h3:{}, text:H3.castText(P, T, false), imgs:T.imgs, vids:T.vids, auds:[], secs:5});
      delete K.vid; H3.openLib(K.id); const ui = {clip:!!document.querySelector('#lbBox [data-lb="vid"]'), doer:!!document.querySelector('#lbBox [data-lb="do:' + c.n + '"].pri'), to:!!document.querySelector('#lbBox [data-lb="to:' + c.n + '>' + c2.n + '"].pri')}; H3.closeSheet && H3.closeSheet(); document.getElementById('sheet').hidden = true; K.vid = 'mK1';
      c.acts = []; H3.S.cast = H3.S.cast.filter(x => x!==c2); H3.S.lib = H3.S.lib.filter(x => x!==K && x!==L2);
      return {ui, v:T.vids.map(r => r.id + '@' + r.actOf + '>' + r.to), tr:/attribute_transfer - only the spinning kick \(the body movement and its timing of the one performing it\) from <Video 1> is transferred to <Subject 1>, who performs it on <Subject 2>/.test(pr), sh:/<Subject 1> performs <Subject \d> \(the spinning kick\) on <Subject 2>\./.test(pr), novid:!/<Video 1> is a reference video/.test(pr)}; }, L1);
    ok(AC.ui.clip && AC.ui.doer && AC.ui.to && AC.v.length===1 && AC.tr && AC.sh && AC.novid, '🥋 an action clip goes in as Video 1, moved onto the doer with attribute_transfer and done to the target: ' + JSON.stringify(AC));
    const AK = await page.evaluate(id => { const c = H3.S.cast.find(x => x.lib===id); const L2 = H3.libNew('char'); Object.assign(L2, {name:'Ben', pics:['mL1']}); const c2 = H3.libToCast(L2);
      const K = H3.libNew('act'); Object.assign(K, {name:'Her kick', what:'spinning kick'}); H3.drawCast();
      const q = s => document.querySelector(s), card = q('#castList [data-cn="' + c2.n + '"]'), btn = card && card.querySelector('[data-cast="act"]'); if(!btn) return {btn:false}; btn.click();
      q('#akBox [data-ak="id:' + K.id + '"]').click(); q('#akBox [data-ak="side:to"]').click(); const dis = q('#akBox [data-ak="ok"]').disabled;
      q('#akBox [data-ak="o:' + c.n + '"]').click(); q('#akBox [data-ak="ok"]').click();
      const got = JSON.stringify(c.acts || []), chip = !!q('#castList [data-cn="' + c2.n + '"] [data-cast="unactto:' + c.n + '>' + K.id + '"]');
      q('#castList [data-cn="' + c2.n + '"] [data-cast="unactto:' + c.n + '>' + K.id + '"]').click(); const gone = !(c.acts || []).length;
      H3.S.cast = H3.S.cast.filter(x => x!==c2); H3.S.lib = H3.S.lib.filter(x => x!==K && x!==L2); c.acts = []; H3.drawCast();
      return {btn:true, dis, ok:got===JSON.stringify([{id:K.id, to:c2.n}]), chip, gone}; }, L1);
    ok(AK.btn && AK.dis && AK.ok && AK.chip && AK.gone, "🥋 ＋ Action on Ben's card: pick the kick, It's done to Ben, by Laura → Laura does it to Ben: " + JSON.stringify(AK));
    const AO = await page.evaluate(id => { const c = H3.S.cast.find(x => x.lib===id); H3.S.media.mP1 = {kind:'vid', name:'pie.mp4', thumb:'', dur:2};
      const K = H3.libNew('act'); Object.assign(K, {name:'Pie', what:'pie in the face', vid:'mP1'}); H3.drawCast();
      const q = s => document.querySelector(s); q('#castList [data-cn="' + c.n + '"] [data-cast="act"]').click();
      q('#akBox [data-ak="id:' + K.id + '"]').click(); q('#akBox [data-ak="side:to"]').click(); const offBtn = !!q('#akBox [data-ak="o:-1"]'); q('#akBox [data-ak="o:-1"]').click(); q('#akBox [data-ak="ok"]').click();
      const got = JSON.stringify(c.acts), chip = /from off screen/.test(q('#castList [data-cn="' + c.n + '"]').textContent);
      const P = '<Subject ' + c.n + '> stands by the door.', T = H3.castTake({prompt:P, imgs:[], vids:[], film:H3.S.fkey}, true), pr = H3.h3Prompt({h3:{}, text:H3.castText(P, T, false), imgs:T.imgs, vids:T.vids, auds:[], secs:5});
      c.acts = []; H3.S.lib = H3.S.lib.filter(x => x!==K); H3.drawCast();
      return {offBtn, ok:got===JSON.stringify([{id:K.id, to:0, off:true}]), chip, v:T.vids.length, tr:/who receives it; it comes from someone off screen who is never seen/.test(pr), sh:/\(the pie in the face\) is done to <Subject 1> by someone off screen/.test(pr), noPerf:!/performs/.test(pr)}; }, L1);
    ok(AO.offBtn && AO.ok && AO.chip && AO.v===1 && AO.tr && AO.sh && AO.noPerf, '🥋 a pie from off screen: done to Laura by someone off screen, nobody in the cast does it: ' + JSON.stringify(AO));
    ok(A9.n===9 && A9.at===1 && A9.exc && A9.rep && A9.out, '✨ a character with 9 pictures still leaves room for her attribute, and her own look gives way to it: ' + JSON.stringify(A9));
    await page.evaluate(() => { H3.closeSheet && H3.closeSheet(); document.getElementById('sheet').hidden = true; }); await page.click('#tabs [data-tab="films"]'); await page.waitForTimeout(200);
    const F0 = await page.evaluate(() => H3.S.fkey); await fr.evaluate(() => FILM.go({v:'film', film:FILM.S.films[0].id})); await page.waitForTimeout(400);
    const B = await page.evaluate(id => ({has:H3.S.cast.some(c => c.lib===id), fkey:H3.S.fkey}), L1);
    ok(tab.lib && tab.render && A.who==='Laura Vale' && JSON.stringify(A.imgs)===JSON.stringify(['mL1', 'mH1@' + A.n]) && A.at && A.def && B.fkey!==F0 && !B.has,
      '📚 a Library entry joins one film\'s cast as a link, follows edits, and an attribute is sent with attribute_transfer: ' + JSON.stringify({tab, A, B})); }
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
