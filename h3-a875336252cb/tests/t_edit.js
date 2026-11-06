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
  'Video Slice','ImageFromBatch','TrimAudioDuration'];
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
  await fr.evaluate(() => { FILM.placeNew(); FILM.draw(); });
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
  // ✨ Quality pass (Jordan 2026-11-06): Regenerate over every clip on a track, one seed, each swaps in when done
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks[0].clips = [{id:'q1', take:'tA', in:0.5, out:2.5, dur:5, at:0}, {id:'q2', take:'tA', in:3, out:5, dur:5, at:2}]; FILM.SEL = null; FILM.draw(); });
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => !(x.redo && x.redo.nudge)); H3.saveNow(); });
  await fr.click('[data-act="qualitySheet"][data-k="0"]'); await page.waitForTimeout(200);
  ok(await fr.evaluate(() => /2 clips/.test(document.querySelector('#sheetCard').textContent) && document.querySelector('#qpLv .pri').dataset.v==='0'), '✨ the quality pass sheet counts the clips, Regenerate strength by default');
  await fr.click('#qpGo'); await page.waitForTimeout(600);
  const QPS = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).map(t => ({clip:t.redo.clip, seed:t.seed, den:t.up.den, a:t.redo.a, b:t.redo.b, prompt:t.up.prompt, refs:t.up.refs})));
  ok(QPS.length===2 && QPS[0].seed===QPS[1].seed && QPS.every(x => x.den===0 && /^she walks to the window/.test(x.prompt)) && QPS.map(x => x.clip).sort().join()==="q1,q2" && QPS.find(x => x.clip==="q1").a <= 12 && QPS.find(x => x.clip==="q1").b >= 60, '✨ one regenerate per clip over its stretch, same seed, the take\'s words: ' + JSON.stringify(QPS));
  await fr.evaluate(() => FILM.draw()); ok(await fr.evaluate(() => [...document.querySelectorAll('.clip .du')].filter(e => /✨ failed/.test(e.textContent)).length===2), '✨ a pass that fails says ✨ failed on its clip (the fake PC has no Open-H3 LoRA)');
  ok(await fr.evaluate(() => { FILM.takes().filter(x => x.redo && x.redo.qp).forEach(t => { t.state = 'working'; t.upStage = 'run'; t.upErr = ''; }); FILM.draw(); return [...document.querySelectorAll('.clip .du')].filter(e => /✨ working/.test(e.textContent)).length===2; }), '✨ each clip says ✨ working while its pass renders');
  await page.evaluate(() => { H3.S.takes.filter(x => x.redo && x.redo.qp).forEach((t, i) => { t.upStage = 'done'; t.state = 'done'; t.final = {filename:'q' + i + '.mp4', subfolder:'Output_Render/H3Deck/q', type:'output'}; }); H3.saveNow(); });
  await fr.evaluate(() => { FILM.placeNew(); FILM.draw(); });
  const QW = await fr.evaluate(() => FILM.S.films[0].tracks[0].clips.map(c => { const t = FILM.takeOf(c.take); return {qp:!!(t && t.redo && t.redo.qp), in:c.in, out:c.out, w:FILM.wordsAt(t, 1)}; }));
  ok(QW.every(x => x.qp && x.w==='she walks to the window') && QW[0].in===0.5 && QW[1].out===5, '✨ both clips now play their quality-pass take, same timing: ' + JSON.stringify(QW));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
