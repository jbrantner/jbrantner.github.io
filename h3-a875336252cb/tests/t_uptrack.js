// ⬆ Upscale track (Films): ✨ High quality with Prism Pika on every clip → stops for 🎭 Faces → 🧵 seams bridged and put back into the clips
// (fake ComfyUI, nothing renders). Run: CLIP=<a ~5 s video with sound> NODE_PATH=$(npm root -g) node tests/t_uptrack.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'h3_open_regenerate_2k_r128.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
  MinimaxH3LatentUpscaler3D:{input:{required:{model_name:[['minimax_h3_latent_upscaler_3d_bf16.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'Video Slice','ImageFromBatch','TrimAudioDuration','ImageBlur','RepeatImageBatch','ManualSigmas','LTXVSeparateAVLatent','LTXVConcatAVLatent','VAEEncode','MiniMaxH3ImageToVideo'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t), node = (g, t) => nodes(g, t)[0];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8031);
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
  await page.goto('http://127.0.0.1:8031/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  // a finished 5 s take (one piece, 120 frames)
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => { H3.S.takes.unshift({id:'tA', t:Date.now(), pc:R, model:m, turbo:true, loras:[], w:640, h:352, seed:1, name:'h3_a', dir:'H3Deck/h3_a', prompt:'she walks to the window', seconds:5, imgs:[], vids:[], auds:[], follow:[],
    pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'she walks to the window', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}], state:'done', final:{filename:'h3_a_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  // 🎞 Films: a film with that take on it
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  await fr.waitForFunction(() => window.FILM && FILM.S).catch(() => {}); await fr.evaluate(() => { FILM.S.moreTools = true; FILM.draw && FILM.draw(); }); // 🧰 the tucked-away tools too
  const done = (id, fn) => page.evaluate(([id, fn]) => { const t = H3.S.takes.find(x => x.id===id); Object.assign(t, {state:'done', upStage:t.up ? 'done' : t.upStage, final:{filename:fn, subfolder:'Output_Render/H3Deck/' + t.name, type:'output'}}); t.pieces.forEach(p => { p.state = 'done'; p.file = p.file || t.final; }); H3.saveNow(); }, [id, fn]);
  // a film: three clips that touch on track 1 (5 s, 3 s, 5 s)
  // (the middle one is a ➕ carry-on of the first, so its ✨ pass carries on from the first one's; the third is a cut)
  await page.evaluate(() => { const a = H3.S.takes.find(x => x.id==='tA'), b = JSON.parse(JSON.stringify(a)); Object.assign(b, {id:'tB', name:'h3_b', dir:'H3Deck/h3_b', carry:{src:'tA', at:5, own:true}, final:{filename:'h3_b_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_b', type:'output'}}); H3.S.takes.unshift(b); H3.saveNow(); });
  await fr.waitForFunction(() => !!FILM.takeOf('tB'), null, {timeout:5000}).catch(() => {});
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}], pps:24}; FILM.S.films.unshift(f); const a = FILM.addClip(f, FILM.takeOf('tA'), 0), b = FILM.addClip(f, FILM.takeOf('tB'), 0); b.in = 0; b.out = 3; const c = FILM.addClip(f, FILM.takeOf('tA'), 0); c.at = 8; FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  const T0 = await fr.evaluate(() => { const f = FILM.S.films[0], cs = f.tracks[0].clips; return {btn:!!document.querySelector('[data-act="upTrack"]'), at:cs.map(c => [c.at, c.in, c.out])}; });
  ok(T0.btn && T0.at[1][0]===5 && T0.at[2][0]===8, '⬆ Upscale track button is in the (bare) tools; the three clips touch: ' + JSON.stringify(T0));
  const S1 = await fr.evaluate(async () => { document.querySelector('[data-act="upTrack"]').click(); await new Promise(z => setTimeout(z, 200)); const q = s => document.querySelector(s);
    const r = {title:q('#sheetCard h3') && q('#sheetCard h3').textContent, pika:/Prism Pika/.test(q('#sheetCard').textContent), go:q('#utGo') && q('#utGo').textContent};
    q('#utGo').click(); await new Promise(z => setTimeout(z, 2000)); const f = FILM.S.films[0]; r.run = f.upRun && {state:f.upRun.state, hq:f.upRun.hq.length, unet:f.upRun.unet}; r.banner = (document.body.textContent.match(/⬆ Upscale track 1[^⏹]*/) || [''])[0]; return r; });
  const HQ = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).reverse().map(t => ({id:t.id, src:t.redo.src, unet:t.up.unet, scale:t.up.scale, den:t.up.den, ch:t.up.chain, cin:t.redo.cin, cout:t.redo.cout, L:t.redo.L, pc:t.pc})));
  // 🔗 context: clip 2 (a carry-on) carries on from clip 1's ✨ latent; clip 3 (a cut) starts fresh; each window is exactly its clip
  const CX = await page.evaluate(([R, H]) => { const oi = H3.PC[R].oi, G = id => Object.values(H3.upGraph(H3.S.takes.find(x => x.id===id), oi, {}).g), C = (g, c) => g.filter(n => n.class_type===c);
    return H.map(h => { const g = G(h.id), mc = C(g, 'MiniMaxH3MotionContext'), ld = C(g, 'MiniMaxH3MotionContextLoadLatent'), sv = C(g, 'MiniMaxH3MotionContextSaveLatent'), rp = C(g, 'RepeatImageBatch'), iv = C(g, 'MiniMaxH3ReferenceToVideo').concat(C(g, 'MiniMaxH3ImageToVideo'));
      const ifb = C(g, 'ImageFromBatch').filter(n => g.some(m => m.class_type==='CreateVideo') && n.inputs.length===h.L && n.inputs.batch_index===(h.ch ? h.ch.pre : -1));
      return {mc:mc.length, ld:ld.map(n => [n.inputs.clip_index, n.inputs.latent_path]), sv:sv.map(n => [n.inputs.clip_index, n.inputs.filename_prefix]), rep:rp.map(n => n.inputs.amount), len:iv.map(n => n.inputs.length), cut:ifb.length, pre:h.ch && h.ch.pre}; }); }, [R, HQ]);
  const chainOk = HQ.length===3 && HQ[0].ch && !HQ[0].ch.prev && HQ[1].ch && HQ[1].ch.prev===HQ[0].id && HQ[1].ch.dir===HQ[0].ch.dir && HQ[1].ch.idx===1 && HQ[2].ch && !HQ[2].ch.prev && HQ[2].ch.dir!==HQ[0].ch.dir && HQ.every(h => h.cin===0 && h.L===Math.round(h.cout * 24)) && HQ[1].pc===HQ[0].pc;
  ok(chainOk && CX[0].mc===0 && CX[0].sv.length===1 && CX[0].sv[0][0]===1 && /hqctx_/.test(CX[0].sv[0][1]) && CX[1].mc===1 && CX[1].ld.length===1 && CX[1].ld[0][0]===1 && CX[1].ld[0][1].endsWith(HQ[0].ch.dir) && CX[1].pre >= 23 && (CX[1].pre + 72 - 5) % 17===0 && CX[1].len.every(x => x===CX[1].pre + 72) && CX[1].rep.includes(CX[1].pre) && CX[1].cut===1 && CX[2].mc===0,
    '🔗 ✨ with context: the carry-on clip carries on from the clip before\'s ✨ latent (H3 Motion Context, same PC, its window is the clip itself with room in front, cut off after); the cut starts fresh: ' + JSON.stringify({HQ:HQ.map(h => ({ch:h.ch, cin:h.cin, cout:h.cout, L:h.L})), CX}));
  ok(/Upscale track 1/.test(S1.title) && S1.pika && /3 clips/.test(S1.go) && S1.run && S1.run.state==='hq' && S1.run.hq===3 && HQ.length===3 && HQ.every(h => /prismPIKA/.test(h.unet) && h.scale===1.5) && /0 of 3/.test(S1.banner), '1 ✨: the sheet offers Prism Pika; every clip gets ✨ High quality ×1.5 on Prism Pika, the box says 0 of 3: ' + JSON.stringify({S1, HQ}));
  await done(HQ[0].id, 'hq1_00001.mp4');
  const W1 = await fr.evaluate(() => { FILM.placeNew(); const f = FILM.S.films[0]; return f.upRun.state; });
  await done(HQ[1].id, 'hq2_00001.mp4'); await done(HQ[2].id, 'hq3_00001.mp4');
  const S2 = await fr.evaluate(async () => { FILM.placeNew(); FILM.draw(); await new Promise(z => setTimeout(z, 100)); const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at);
    return {state:f.upRun.state, takes:cs.map(c => FILM.takeOf(c.take).redo && FILM.takeOf(c.take).redo.qp), seamBtn:!!document.querySelector('[data-act="upSeams"]'), skip:!!document.querySelector('[data-act="upSkip"]'), cs:cs.map(c => [c.at, +c.in.toFixed(2), +c.out.toFixed(2)])}; });
  ok(W1==='hq' && S2.state==='faces' && S2.takes.every(Boolean) && S2.seamBtn && S2.skip, '2 🎭: it waits while a clip is still going, then stops with 🧵 Blend the seams / Done, no seams once every ✨ clip is in place: ' + JSON.stringify({W1, S2}));
  const g0 = sent.length;
  const S3 = await fr.evaluate(async () => { document.querySelector('[data-act="upSeams"]').click(); await new Promise(z => setTimeout(z, 2000)); const f = FILM.S.films[0]; return {state:f.upRun.state, seams:(f.upRun.seams || []).length}; });
  const CB = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.seam); return t && {id:t.id, frames:t.combo.seam.frames, one:t.combo.seam.one, model:t.model, w:t.w, h:t.h, parts:t.combo.parts.length}; });
  const S3b = await fr.evaluate(() => { FILM.placeNew(); const f = FILM.S.films[0]; return f.tracks[0].clips.length; });
  ok(S3.state==='seams' && S3.seams===1 && CB && CB.one && JSON.stringify(CB.frames)==='[120,192]' && /pika/.test(CB.model) && CB.w===960 && CB.h===512 && CB.parts===3 && S3b===3, '3 🧵: the three clips are joined only for bridging (the track keeps its 3 clips), seams at frames 120 and 192, on Prism Pika, at the ✨ size: ' + JSON.stringify({S3, CB, S3b}));
  // the whole seam step is ONE job: join, both bridges chained in the graph, one save; the model loads once
  const G = sent.slice(g0).map(x => x.g), J = G[G.length - 1] || {}, Nd = c => Object.entries(J).filter(([, n]) => n.class_type===c);
  const ifb = id => J[id] && J[id].class_type==='ImageFromBatch' ? J[id].inputs.image[0] : null, guides = Nd('MiniMaxH3AddGuide').filter(([, n]) => n.inputs.image).map(([, n]) => ifb(n.inputs.image[0]));
  const comp = Nd('GetVideoComponents').map(([id]) => id), srcs = [...new Set(guides)];
  const GJ = {jobs:G.length, samp:Nd('SamplerCustomAdvanced').length, unet:Nd('UNETLoader').length, save:Nd('SaveVideo').length, cat:Nd('ConcatenateVideo').length, slices:Nd('Video Slice').length, srcs:srcs.length, fromJoin:srcs.filter(s => comp.includes(s)).length,
    unetName:(Nd('UNETLoader')[0] || [0, {inputs:{}}])[1].inputs.unet_name, wh:Nd('MiniMaxH3ReferenceToVideo').concat(Nd('MiniMaxH3ImageToVideo')).map(([, n]) => [n.inputs.width, n.inputs.height])};
  const links = Object.values(J).every(n => Object.values(n.inputs).every(v => !Array.isArray(v) || typeof v[0]!=='string' || J[v[0]]));
  ok(GJ.jobs===1 && GJ.samp===2 && GJ.unet===1 && GJ.save===1 && GJ.cat===1 && GJ.slices===3 && GJ.srcs===2 && GJ.fromJoin===1 && /prismPIKA/.test(GJ.unetName) && GJ.wh.every(x => x[0]===960 && x[1]===512) && links, 'one job on the PC: the 3 clips joined, 2 bridges (the second pins frames from the first one\'s result), Prism Pika loaded once, one save, every link valid: ' + JSON.stringify(GJ));
  const SG = await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return {seams:H3.bridgeSeams(t).length}; }, CB.id);
  await done(CB.id, 'seam_00001.mp4');
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); t.pieces[0].deliv = 312; }, CB.id);
  const S4 = await fr.evaluate(id => { FILM.placeNew(); FILM.draw(); const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at);
    return {state:f.upRun.state, cs:cs.map(c => [c.take===id, +c.at.toFixed(2), +c.in.toFixed(2), +c.out.toFixed(2), (c.alts || []).length]), box:!!document.body.textContent.match(/⬆ Upscale track 1 ·/)}; }, CB.id);
  ok(SG.seams===0 && S4.state==='done' && S4.cs.every(c => c[0]) && S4.cs[0][2]===0 && S4.cs[0][3]===5 && S4.cs[1][2]===5 && S4.cs[1][3]===8 && S4.cs[2][2]===8 && S4.cs[2][3]===13 && S4.cs[0][4]===2 && !S4.box, 'when the job is done (no bridges sent from the phone) its video goes back into all 3 clips at their own stretches (the ✨ takes stay in their versions) and the box goes away: ' + JSON.stringify({SG, S4}));
  // a ✨ pass sent to a PC with no Open-H3 regenerate LoRA (Main, 2026-11-11) moves to one that has it, instead of keeping the original
  const MV = await page.evaluate(async ([R, M]) => { const oi = JSON.parse(JSON.stringify(H3.PC[M].oi)); oi.LoraLoaderModelOnly.input.required.lora_name[0] = oi.LoraLoaderModelOnly.input.required.lora_name[0].filter(x => !/regenerate/i.test(x)); H3.PC[M].oi = oi;
    const src = H3.S.takes.find(x => x.id==='tA'); src.pc = M; const n = await window.H3Nudge({take:'tA', a:0, b:5, den:0.9, scale:1.5, qp:true, quiet:true, key:'kMv'}); const t = H3.S.takes.find(x => x.redo && x.redo.key==='kMv');
    const first = t.pc; t.pc = M; await H3.tick(); await new Promise(z => setTimeout(z, 300)); src.pc = R; return {n, first, now:t.pc, err:t.upErr || ''}; }, [R, M]);
  ok(MV.n===1 && MV.first===R && MV.now===R && !MV.err, '✨ goes to a PC that has the regenerate LoRA, and one sent to a PC without it moves over instead of keeping the original: ' + JSON.stringify(MV));
  // retry: a seam that fails shows the error and 🧵 Blend the seams again
  const RT = await fr.evaluate(() => { const f = FILM.S.films[0]; f.upRun = {id:'u2', track:'tr1', state:'seams', seams:['kX'], hq:[]}; return true; });
  await page.evaluate(() => { H3.S.takes.unshift({id:'tX', t:Date.now(), pc:'http://render.test', state:'failed', pieces:[{state:'failed', err:'boom'}], combo:{seam:{rk:'kX', run:'u2'}, parts:[]}, prompt:''}); H3.saveNow(); });
  const S5 = await fr.evaluate(async () => { await new Promise(z => setTimeout(z, 300)); FILM.placeNew(); FILM.draw(); const f = FILM.S.films[0]; return {err:f.upRun.err, again:(document.querySelector('[data-act="upSeams"]') || {}).textContent}; });
  ok(/boom/.test(S5.err) && /again/.test(S5.again || ''), 'a failed seam shows its error and offers 🧵 Blend the seams again: ' + JSON.stringify(S5));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
