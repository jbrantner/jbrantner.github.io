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
    const r = {title:q('#sheetCard h3') && q('#sheetCard h3').textContent, pika:/Prism Pika/.test(q('#sheetCard').textContent), go:q('#utGo') && q('#utGo').textContent, qOff:q('#utQ .on') && q('#utQ .on').dataset.q, qHidden:q('#utQt').hidden};
    q('#utQ [data-q="real"]').click(); r.qText = q('#utQt').value; q('#utGo').click(); await new Promise(z => setTimeout(z, 2000)); const f = FILM.S.films[0]; r.run = f.upRun && {state:f.upRun.state, hq:f.upRun.hq.length, unet:f.upRun.unet}; r.banner = (document.body.textContent.match(/⬆ Upscale track 1[^⏹]*/) || [''])[0]; return r; });
  const HQ = await page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).reverse().map(t => ({id:t.id, src:t.redo.src, unet:t.up.unet, scale:t.up.scale, den:t.up.den, ch:t.up.chain, cin:t.redo.cin, cout:t.redo.cout, L:t.redo.L, pc:t.pc})));
  // 🔗 context: clip 2 (a carry-on) carries on from clip 1's ✨ latent; clip 3 (a cut) starts fresh; each window is exactly its clip
  const CX = await page.evaluate(([R, H]) => { const oi = H3.PC[R].oi, G = id => Object.values(H3.upGraph(H3.S.takes.find(x => x.id===id), oi, {}).g), C = (g, c) => g.filter(n => n.class_type===c);
    return H.map(h => { const g = G(h.id), mc = C(g, 'MiniMaxH3MotionContext'), ld = C(g, 'MiniMaxH3MotionContextLoadLatent'), sv = C(g, 'MiniMaxH3MotionContextSaveLatent'), rp = C(g, 'RepeatImageBatch'), iv = C(g, 'MiniMaxH3ReferenceToVideo').concat(C(g, 'MiniMaxH3ImageToVideo'));
      const ifb = C(g, 'ImageFromBatch').filter(n => g.some(m => m.class_type==='CreateVideo') && n.inputs.length===h.L && n.inputs.batch_index===(h.ch ? h.ch.pre : -1));
      return {mc:mc.length, ld:ld.map(n => [n.inputs.clip_index, n.inputs.latent_path]), sv:sv.map(n => [n.inputs.clip_index, n.inputs.filename_prefix]), rep:rp.map(n => n.inputs.amount), len:iv.map(n => n.inputs.length), cut:ifb.length, pre:h.ch && h.ch.pre}; }); }, [R, HQ]);
  const chainOk = HQ.length===3 && HQ[0].ch && !HQ[0].ch.prev && HQ[1].ch && HQ[1].ch.prev===HQ[0].id && HQ[1].ch.dir===HQ[0].ch.dir && HQ[1].ch.idx===1 && HQ[2].ch && HQ[2].ch.prev===HQ[1].id && HQ[2].ch.dir===HQ[0].ch.dir && HQ[2].ch.idx===2 && HQ[2].pc===HQ[0].pc && HQ.every(h => h.cin===0 && h.L===Math.round(h.cout * 24)) && HQ[1].pc===HQ[0].pc;
  ok(chainOk && CX[0].mc===0 && CX[0].sv.length===1 && CX[0].sv[0][0]===1 && /hqctx_/.test(CX[0].sv[0][1]) && CX[1].mc===1 && CX[1].ld.length===1 && CX[1].ld[0][0]===1 && CX[1].ld[0][1].endsWith(HQ[0].ch.dir) && CX[1].pre >= 23 && (CX[1].pre + 72 - 5) % 17===0 && CX[1].len.every(x => x===CX[1].pre + 72) && CX[1].rep.includes(CX[1].pre) && CX[1].cut===1 && CX[2].mc===1 && CX[2].ld[0][0]===2,
    '🔗 ✨ with context: the carry-on clip carries on from the clip before\'s ✨ latent (H3 Motion Context, same PC, its window is the clip itself with room in front, cut off after); the cut starts fresh: ' + JSON.stringify({HQ:HQ.map(h => ({ch:h.ch, cin:h.cin, cout:h.cout, L:h.L})), CX}));
  ok(/Upscale track 1/.test(S1.title) && S1.pika && /3 clips/.test(S1.go) && S1.run && S1.run.state==='hq' && S1.run.hq===3 && HQ.length===3 && HQ.every(h => /prismPIKA/.test(h.unet) && h.scale===1.5) && /0 of 3/.test(S1.banner), '1 ✨: the sheet offers Prism Pika; every clip gets ✨ High quality ×1.5 on Prism Pika, the box says 0 of 3: ' + JSON.stringify({S1, HQ}));
  // ✨ same quality words for the whole track: 🎥 Realistic picked in the sheet goes on every ✨ pass (and into its prompt once)
  const QW = await page.evaluate(([R, H]) => { const oi = H3.PC[R].oi; return H.map(h => { const t = H3.S.takes.find(x => x.id===h.id), g = H3.upGraph(t, oi, {}).g, txt = JSON.stringify(g);
    return {qw:t.up.qw, inPrompt:(txt.match(/photorealistic live-action/g) || []).length}; }); }, [R, HQ]);
  ok(S1.qOff==='' && S1.qHidden && /photorealistic/.test(S1.qText) && QW.every(x => /photorealistic/.test(x.qw) && x.inPrompt >= 1), '✨ same quality words for the whole track: off by default; 🎥 Realistic fills its words and every ✨ pass sends them: ' + JSON.stringify({S1q:[S1.qOff, S1.qHidden], QW}));
  await done(HQ[0].id, 'hq1_00001.mp4');
  const W1 = await fr.evaluate(() => { FILM.placeNew(); const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at); return f.upRun.state + (cs.some(c => FILM.takeOf(c.take).redo && FILM.takeOf(c.take).redo.qp) ? ' swapped early' : ''); });
  await done(HQ[1].id, 'hq2_00001.mp4'); await done(HQ[2].id, 'hq3_00001.mp4');
  // ✏ an edit (↻ redo a stretch) of a ✨ clip is drawn at the ✨ size, not the take's old smaller size
  const ED = await page.evaluate(async id => { const src = H3.S.takes.find(x => x.id===id), k0 = H3.S.takes.length; const n = await window.H3Redo({take:id, a:1, b:2}); const t = H3.S.takes[0];
    const ok = n && t.redo && t.redo.src===id; const out = {n, ok, w:t.w, h:t.h, sw:src.w, sh:src.h}; if(ok) H3.S.takes.shift(); return out; }, HQ[0].id);
  ok(ED.ok && ED.w===960 && ED.h===512 && ED.sw < 960, '✏ editing a stretch of a ✨ clip draws it at the ✨ size (' + ED.w + '×' + ED.h + '), not the old ' + ED.sw + '×' + ED.sh + ': ' + JSON.stringify(ED));
  const S2 = await fr.evaluate(async () => { FILM.placeNew(); FILM.draw(); await new Promise(z => setTimeout(z, 100)); const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at);
    return {state:f.upRun.state, takes:cs.map(c => FILM.takeOf(c.take).redo && FILM.takeOf(c.take).redo.qp), seamBtn:!!document.querySelector('[data-act="upSeams"]'), skip:!!document.querySelector('[data-act="upSkip"]'), cs:cs.map(c => [c.at, +c.in.toFixed(2), +c.out.toFixed(2)])}; });
  ok(W1==='hq' && S2.state==='faces' && S2.takes.every(Boolean) && S2.seamBtn && S2.skip, '2 🎭: it waits while a clip is still going, then stops with 🧵 Blend the seams / Done, no seams once every ✨ clip is in place: ' + JSON.stringify({W1, S2}));
  // 🎬 shots: every join shows ⛓; tapping one makes it ✂ (a new colour under the clips after it), tapping again puts it back
  const SM = await fr.evaluate(async () => { const q = () => [...document.querySelectorAll('.trk[data-k="0"] .seam')], col = () => [...document.querySelectorAll('.trk[data-k="0"] .clip .sg')].map(x => x.style.background);
    const r = {n:q().length, marks:q().map(b => b.textContent).join(''), c0:col()}; q()[1].click(); await new Promise(z => setTimeout(z, 150)); const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at);
    r.after = q().map(b => b.textContent).join(''); r.cut = !!cs[2].cut; r.c1 = col(); r.box = (document.body.textContent.match(/\(\d ⛓, \d ✂\)/) || [''])[0];
    q()[1].click(); await new Promise(z => setTimeout(z, 150)); r.back = q().map(b => b.textContent).join('') + (cs[2].cut ? 'cut' : ''); return r; });
  ok(SM.n===2 && SM.marks==='⛓⛓' && SM.c0[0]===SM.c0[2] && SM.after==='⛓✂' && SM.cut && SM.c1[2]!==SM.c1[1] && SM.box==='(1 ⛓, 1 ✂)' && SM.back==='⛓⛓', '🎬 ⛓/✂ marks on the joins: tap one to make it a cut (the clips after it get a new shot colour, the box counts them), tap again to undo: ' + JSON.stringify(SM));
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
  const seamQ = /photorealistic live-action/.test(JSON.stringify(J));
  const links = Object.values(J).every(n => Object.values(n.inputs).every(v => !Array.isArray(v) || typeof v[0]!=='string' || J[v[0]]));
  ok(GJ.jobs===1 && GJ.samp===2 && GJ.unet===1 && GJ.save===1 && GJ.cat===1 && GJ.slices===3 && GJ.srcs===2 && GJ.fromJoin===1 && /prismPIKA/.test(GJ.unetName) && GJ.wh.every(x => x[0]===960 && x[1]===512) && links && seamQ, 'one job on the PC: the 3 clips joined, 2 bridges (the second pins frames from the first one\'s result), Prism Pika loaded once, one save, every link valid, the track\'s quality words in the bridges: ' + JSON.stringify(Object.assign({seamQ}, GJ)));
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
  // a ✂ cut: 🧵 only blends the ⛓ joins (clips 1+2 joined and bridged; clip 3 left alone)
  const CT = await fr.evaluate(async () => { const f = FILM.S.films[0], cs = f.tracks[0].clips.slice().sort((a, b) => a.at - b.at); cs[2].cut = true; f.upRun = {id:'u3', track:'tr1', state:'faces', hq:[]};
    await FILM.upSeamsGo(f, f.upRun); return {state:f.upRun.state, n:(f.upRun.seams || []).length}; });
  const CT2 = await page.evaluate(() => { const t = H3.S.takes.find(x => x.combo && x.combo.seam && x.combo.seam.run==='u3'); return t && {parts:t.combo.parts.length, frames:t.combo.seam.frames}; });
  ok(CT.state==='seams' && CT.n===1 && CT2 && CT2.parts===2 && JSON.stringify(CT2.frames)==='[120]', '✂ a cut join is left as a hard cut: only the ⛓ joins are blended: ' + JSON.stringify({CT, CT2}));
  // retry: a seam that fails shows the error and 🧵 Blend the seams again
  const RT = await fr.evaluate(() => { const f = FILM.S.films[0]; f.upRun = {id:'u2', track:'tr1', state:'seams', seams:['kX'], hq:[], tries:{tX:2}}; return true; });
  await page.evaluate(() => { H3.S.takes.unshift({id:'tX', t:Date.now(), pc:'http://render.test', state:'failed', pieces:[{state:'failed', err:'boom'}], combo:{seam:{rk:'kX', run:'u2'}, parts:[]}, prompt:''}); H3.saveNow(); });
  const S5 = await fr.evaluate(async () => { await new Promise(z => setTimeout(z, 300)); FILM.placeNew(); FILM.draw(); const f = FILM.S.films[0]; return {err:f.upRun.err, again:(document.querySelector('[data-act="upSeams"]') || {}).textContent}; });
  ok(/boom/.test(S5.err) && /again/.test(S5.again || ''), 'a failed seam shows its error and offers 🧵 Blend the seams again: ' + JSON.stringify(S5));
  // all or nothing: a run where one ✨ clip fails puts NO ✨ result in (the done ones are let go), and the run stops
  const AN = await fr.evaluate(async () => { const f = FILM.S.films[0], tr = f.tracks[0]; tr.clips.forEach(c => { c.cut = false; }); f.upRun = null; const before = tr.clips.map(c => c.take);
    const n = await FILM.upTrackGo(f, tr, 0.9, ''); return {n, before, keys:f.upRun.hq.map(h => h.key)}; });
  const AT = await page.evaluate(keys => keys.map(k => (H3.S.takes.find(x => x.redo && x.redo.key===k) || {}).id), AN.keys);
  await done(AT[0], 'an1_00001.mp4'); await done(AT[2], 'an3_00001.mp4');
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); Object.assign(t, {state:'failed', upErr:'boom'}); H3.saveNow(); }, AT[1]);
  const AF = await fr.evaluate(async before => { await new Promise(z => setTimeout(z, 300)); const R0 = FILM.S.films[0].upRun; R0.tries = {}; R0.hq.forEach(h => R0.tries[h.key] = 2); FILM.placeNew(); const f = FILM.S.films[0], tr = f.tracks[0];
    return {state:f.upRun.state, err:f.upRun.err, same:tr.clips.every((c, i) => c.take===before[i]), dropped:(FILM.S.passes || []).filter(p => p.dropped).length}; }, AN.before);
  ok(AN.n===3 && AT.every(Boolean) && AF.state==='stopped' && /1 of 3/.test(AF.err) && AF.same && AF.dropped===2, '⬆ all or nothing: with 1 of 3 ✨ clips failed, no clip gets ✨ (the 2 done ones are let go) and the run stops: ' + JSON.stringify({AN:AN.n, AF}));
  // ↻ a failed ✨ clip of the run is sent again by itself (after a short wait), the run keeps going; the parts that worked are kept
  const RY = await fr.evaluate(async () => { const f = FILM.S.films[0], tr = f.tracks[0]; f.upRun = null; const n = await FILM.upTrackGo(f, tr, 0.9, ''); return {n, keys:f.upRun.hq.map(h => h.key)}; });
  const RYT = await page.evaluate(keys => keys.map(k => (H3.S.takes.find(x => x.redo && x.redo.key===k) || {}).id), RY.keys);
  await done(RYT[0], 'ry1_00001.mp4'); await done(RYT[2], 'ry3_00001.mp4');
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); Object.assign(t, {state:'failed', upErr:'out of memory'}); H3.saveNow(); }, RYT[1]);
  const RY1 = await fr.evaluate(async k => { await new Promise(z => setTimeout(z, 300)); FILM.placeNew(); const R = FILM.S.films[0].upRun, r = {state0:R.state, wait:!!(R.failAt || {})[k]};
    R.failAt[k] = Date.now() - 60000; FILM.placeNew(); await new Promise(z => setTimeout(z, 2500)); FILM.placeNew();
    const p = FILM.S.passes.find(x => x.key===k); return Object.assign(r, {state:R.state, tries:(R.tries || {})[k], pass:p.state, takes:FILM.takes().filter(x => x.redo && x.redo.key===k).length}); }, RY.keys[1]);
  ok(RY.n===3 && RY1.state0==='hq' && RY1.wait && RY1.state==='hq' && RY1.tries===1 && RY1.pass==='working' && RY1.takes===2, '↻ a failed ✨ clip is sent again by itself after a short wait (try 1 of 2) and the run keeps going: ' + JSON.stringify(RY1));
  await fr.evaluate(() => { FILM.S.films[0].upRun = null; FILM.S.passes.forEach(p => { if(p.state==='working' || p.state==='ready'){ p.state = 'done'; p.dropped = true; } }); });
  // ↻ a failed 🧵 seam is sent again by itself (H3 Deck's retry), and only after its tries are used up does the run show the error
  const RS = await fr.evaluate(async () => { const f = FILM.S.films[0], calls = []; const old = window.parent.H3Retry; window.parent.H3Retry = async id => { calls.push(id); return true; };
    f.upRun = {id:'u8', track:'tr1', state:'seams', seams:['kZ'], hq:[], failAt:{tZ:Date.now() - 60000}}; await new Promise(z => setTimeout(z, 50));
    window.parent.H3.S.takes.unshift({id:'tZ', t:Date.now(), pc:'http://render.test', state:'failed', pieces:[{state:'failed', err:'HostBuffer.read_file_slice failed'}], combo:{seam:{rk:'kZ', run:'u8', one:true}, parts:[]}, prompt:''});
    FILM.upTick(); await new Promise(z => setTimeout(z, 300)); const R = f.upRun, r = {calls:calls.slice(), tries:R.tries && R.tries.tZ, err:R.err || ''};
    R.tries.tZ = 2; FILM.upTick(); r.err2 = R.err; window.parent.H3Retry = old; window.parent.H3.S.takes = window.parent.H3.S.takes.filter(x => x.id!=='tZ'); f.upRun = null; return r; });
  ok(RS.calls.join()==='tZ' && RS.tries===1 && !RS.err && /HostBuffer/.test(RS.err2 || ''), '↻ a failed 🧵 seam is sent again by itself; after 2 tries the run shows the error: ' + JSON.stringify(RS));
  // ↻ H3 Deck's retry of a failed take: the PC's memory is freed, then the failed piece goes again
  const RK = await page.evaluate(async () => { const a = H3.S.takes.find(x => x.id==='tA'), t = JSON.parse(JSON.stringify(a)); Object.assign(t, {id:'tK', state:'failed', final:null}); t.pieces[0].state = 'failed'; t.pieces[0].err = 'boom';
    H3.S.takes.unshift(t); const ok1 = await H3.retryTake(t); const r = {ok:ok1, state:t.state, piece:t.pieces[0].state, err:t.pieces[0].err, tries:t.retries}; H3.S.takes = H3.S.takes.filter(x => x.id!=='tK'); return r; });
  ok(RK.ok && RK.state==='working' && RK.piece==='queued' && !RK.err && RK.tries===1, '↻ retryTake sends the failed piece again: ' + JSON.stringify(RK));
  // ↩ Revert upscale: the track goes back to the clips it had when ⬆ Upscale track was tapped, the run's passes are let go
  const RV = await fr.evaluate(async () => { const f = FILM.S.films[0], tr = f.tracks[0]; f.upRun = null; const before = JSON.stringify(tr.clips.map(c => [c.take, c.in, c.out, c.at]));
    await FILM.upTrackGo(f, tr, 0.9, ''); const keys = f.upRun.hq.map(h => h.key); tr.clips[0].take = 'tB'; FILM.draw(); const btn = !!document.querySelector('[data-act="upRevert"]');
    const n = FILM.upRevert(f); const after = JSON.stringify(tr.clips.map(c => [c.take, c.in, c.out, c.at]));
    return {btn, n, same:after===before, state:f.upRun.state, dropped:keys.every(k => (FILM.S.passes.find(p => p.key===k) || {}).dropped)}; });
  ok(RV.btn && RV.n===3 && RV.same && RV.state==='reverted' && RV.dropped, '↩ Revert upscale puts the track back as it was and lets the run go: ' + JSON.stringify(RV));
  // ↩ a run from before the copy: each clip is followed back from its 🧵 seam and ✨ takes to its original take and stretch
  await page.evaluate(() => { const a = H3.S.takes.find(x => x.id==='tA'); const q = JSON.parse(JSON.stringify(a)); Object.assign(q, {id:'tQ', redo:{qp:true, src:'tA', a:24, b:72}});
    const sm = JSON.parse(JSON.stringify(a)); Object.assign(sm, {id:'tS', redo:null, combo:{seam:{one:true, rk:'kS', bounds:[{clip:'cRV', take:'tQ', off:0, len:2}]}, parts:[]}}); H3.S.takes.unshift(q, sm); H3.saveNow(); });
  await fr.waitForFunction(() => !!FILM.takeOf('tS'), null, {timeout:5000}).catch(() => {});
  const RO = await fr.evaluate(() => { const f = {id:'fRV', name:'RV', tracks:[{id:'trRV', clips:[{id:'cRV', take:'tS', in:0, out:2, dur:2, at:3}]}], pps:24}; FILM.S.films.push(f);
    f.upRun = {id:'uRV', track:'trRV', state:'done', hq:[], seams:['kS']}; const n = FILM.upRevert(f), c = f.tracks[0].clips[0]; FILM.S.films = FILM.S.films.filter(x => x!==f); return {n, c:[c.take, c.in, c.out, c.at]}; });
  ok(RO.n===1 && JSON.stringify(RO.c)==='["tA",1,3,3]', '↩ an older run is followed back through its seam and ✨ takes to the original take and stretch: ' + JSON.stringify(RO));
  await fr.evaluate(() => { FILM.S.films[0].upRun = null; FILM.S.passes.forEach(p => { if(p.state==='working' || p.state==='ready'){ p.state = 'done'; p.dropped = true; } }); });
  // 🪄 Smooth first: every clip is smoothed (keyframes pinned from its own stretch, read straight from the PC's output), then ✨ runs on the smoothed takes
  const gS = sent.length;
  const SA = await fr.evaluate(async () => { const f = FILM.S.films[0], tr = f.tracks[0]; f.upRun = null; const before = tr.clips.map(c => c.take);
    const n = await FILM.upTrackGo(f, tr, 0.9, '', '', true); return {n, before, state:f.upRun.state, sm:f.upRun.sm.map(h => h.take), clips:tr.clips.map(c => [c.in, c.out])}; });
  const SF = await page.evaluate(ids => ids.map(id => (H3.S.takes.find(x => x.id===id) || {}).sm), SA.sm);
  const SB = sent.slice(gS, gS + 3).map(x => Object.values(x.g)).map((g, i) => ({file:SF[i] && SF[i].file, keys:g.filter(n => n.class_type==='MiniMaxH3AddGuide' && n.inputs.image).length, lv:g.filter(n => n.class_type==='LoadVideo').map(n => n.inputs.file)}));
  for(const id of SA.sm) await done(id, 'sm_' + id + '.mp4');
  const SC = await fr.evaluate(async () => { FILM.placeNew(); await new Promise(z => setTimeout(z, 2500)); FILM.placeNew(); const f = FILM.S.films[0]; return {state:f.upRun.state, hq:f.upRun.hq.length, keys:f.upRun.hq.map(h => h.key)}; });
  const SD = await page.evaluate(([keys, sm]) => keys.map(k => { const t = H3.S.takes.find(x => x.redo && x.redo.key===k); return t && {src:t.redo.src, fromSm:sm.includes(t.redo.src), cin:t.redo.cin}; }), [SC.keys, SA.sm]);
  ok(SA.n===3 && SA.state==='smooth' && SB.length===3 && SB.every(x => / \[output\]$/.test(x.file) && x.lv.includes(x.file) && x.keys >= 10) && SC.state==='hq' && SC.hq===3 && SD.every(x => x && x.fromSm && x.cin===0),
    '🪄 Smooth first: each clip is smoothed from the PC\'s own file (keyframes pinned), and when all 3 are done ✨ runs on the smoothed takes: ' + JSON.stringify({SA, SB, SC, SD}));
  // ✂ a clip longer than 5 s is split into near-even parts of at most 5 s before ✨ (12 s → 3 × 4 s, touching, same take, ⛓ joins)
  const SPL = await fr.evaluate(() => { const f = {id:'fS', name:'S', tracks:[{id:'trS', clips:[{id:'cS', take:'tA', in:0, out:12, dur:12, at:2}, {id:'cT', take:'tA', in:0, out:5, dur:5, at:14}]}], pps:24}; const tr = f.tracks[0];
    const n = FILM.splitLong(f, tr, tr.clips.slice()); const cs = tr.clips.slice().sort((a, b) => a.at - b.at); return {n, cs:cs.map(c => [+c.at.toFixed(2), +c.in.toFixed(2), +c.out.toFixed(2), c.take, !!c.cut])}; });
  ok(SPL.n===2 && SPL.cs.length===4 && JSON.stringify(SPL.cs.map(c => c.slice(0, 3)))==='[[2,0,4],[6,4,8],[10,8,12],[14,0,5]]' && SPL.cs.every(c => c[3]==='tA' && !c[4]), '✂ a 12 s clip goes to ✨ as 3 touching 4 s parts (a 5 s clip stays whole): ' + JSON.stringify(SPL));
  // 📤 an uploaded clip (no pictures, no words): ✨ on Prism Pika still goes through the reference node (the Pika model can't take the first/last-frame one)
  await page.evaluate(([R]) => { H3.S.takes.unshift({id:'tU', t:Date.now(), name:'h3_u', dir:'H3Deck/h3_u', pc:R, w:832, h:480, seed:3, model:H3.S.f.model, turbo:H3.S.f.turbo, loras:[], steps:'', h3:null, film:'', upName:'my.mp4', prompt:'', seconds:5, fl:false, first:null, lastOn:false, lastImg:null, cont:null, carry:null, redo:null, lead:null, combo:null, toFilm:null, from:null, pins:[], follow:[], imgs:[], vids:[], auds:[], sm:null, up:null, upImgs:[], ctl:null, ctl2:null, smoothed:null, state:'done', reviewed:false,
    pieces:[{start:0, gen:120, deliv:120, ctx:0, prompt:'', state:'done', upl:{file:'up.mp4', sound:true, fps:30, w:1080, h:1920}, file:{filename:'h3_u_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_u', type:'output'}}], final:{filename:'h3_u_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_u', type:'output'}}); H3.saveNow(); }, [R]);
  await fr.waitForFunction(() => !!FILM.takeOf('tU'), null, {timeout:5000}).catch(() => {});
  const UPn = await fr.evaluate(async () => { const f = {id:'fU', name:'U', tracks:[{id:'trU', clips:[]}], pps:24}; FILM.S.films.unshift(f); FILM.addClip(f, FILM.takeOf('tU'), 0); return FILM.upTrackGo(f, f.tracks[0], 0.9, 'singularityV2X10eros_prismPIKA.safetensors'); });
  const UG = await page.evaluate(R => { const t = H3.S.takes.find(x => x.redo && x.redo.src==='tU'); if(!t) return null; const g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g);
    return {ref:g.filter(n => n.class_type==='MiniMaxH3ReferenceToVideo').length, i2v:g.filter(n => n.class_type==='MiniMaxH3ImageToVideo').length, prompt:(g.find(n => n.inputs && n.inputs.prompt) || {inputs:{}}).inputs.prompt}; }, R);
  ok(UPn===1 && UG && UG.ref===1 && UG.i2v===0 && UG.prompt, '📤 an uploaded clip with no pictures or words: ✨ on Prism Pika uses the reference node (not first/last frame) and still has words: ' + JSON.stringify({UPn, UG}));
  // 📝 Who and words on an imported clip: the words go on its take, and ✨ then sends her pictures and her words
  await page.evaluate(() => { H3.S.media.mW1 = {kind:'img', thumb:'x', name:'mW1.png'}; H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Laura', pics:['mW1'], keep:'exact'}]; H3.S.casts = H3.S.casts || {}; H3.S.casts.fU = H3.S.cast; H3.saveNow(); });
  const UW = await fr.evaluate(() => { const f = FILM.S.films.find(x => x.id==='fU'), c = f.tracks[0].clips[0]; FILM.selTake && 0; const btn = document.querySelector('.tools [data-act="upWords"]');
    FILM.upWordsSheet(f, c); const q = s => document.querySelector(s); const chip = q('#uwWho [data-n="1"]'); q('#uwText').value = ''; chip.click(); q('#uwText').value += 'sits in a gaming chair.'; q('#uwGo').click();
    const t = FILM.takeOf(c.take); return {chip:!!chip, prompt:t.prompt, film:t.film, label:FILM.takeOf(c.take).upName}; });
  const UWG = await page.evaluate(R => { const t = H3.S.takes.find(x => x.id==='tU'), u = JSON.parse(JSON.stringify(t)); u.id = 'tUw'; u.up = {scale:1, den:0.6, clean:0.8, look:'live', str:0, refs:true, prompt:u.prompt, unet:'singularityV2X10eros_prismPIKA.safetensors', crop:{s0:0, L:120, pad:0, F:120}}; u.smoothed = u.final;
    const refs = H3.upRefs(u).map(r => r.id), g = Object.values(H3.upGraph(u, H3.PC[R].oi, {mW1:'mW1.png'}).g), rv = g.find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    return {refs, p:(rv && rv.inputs.prompt || '').slice(0, 160)}; }, R);
  ok(UW.chip && UW.prompt==='<Subject 1> sits in a gaming chair.' && UW.film==='fU' && UWG.refs.includes('mW1') && /gaming chair/.test(UWG.p), '📝 Who and words: an imported clip gets her and its words, and ✨ then sends her picture and those words: ' + JSON.stringify({UW, UWG}));
  // ✨ on Prism Pika keeps every picture the render had (6 here), fitted by MMH3FitReferences like the render; vanilla still takes the first few
  const PK = await page.evaluate(R => { const src = H3.S.takes.find(x => x.id==='tA'), t = JSON.parse(JSON.stringify(src)); t.id = 'tPk'; t.imgs = [1, 2, 3, 4, 5, 6].map(i => ({id:'mP' + i, desc:'', keep:'exact'}));
    t.up = {scale:1.5, den:0.9, clean:0.8, look:'live', str:0.8, refs:true, prompt:'she waves', unet:'singularityV2X10eros_prismPIKA.safetensors', crop:{s0:0, L:120, pad:0, F:120}}; t.smoothed = t.final;
    const g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g), rv = g.find(n => n.class_type==='MiniMaxH3ReferenceToVideo'), fit = g.find(n => n.class_type==='MMH3FitReferences');
    t.up.unet = ''; const g2 = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g), rv2 = g2.find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    return {pika:Object.keys(rv.inputs).filter(k => /ref_image_/.test(k)).length, fit:!!fit && Object.keys(fit.inputs).filter(k => /^image_/.test(k)).length, vanilla:rv2 ? Object.keys(rv2.inputs).filter(k => /ref_image_/.test(k)).length : 0, vfit:g2.some(n => n.class_type==='MMH3FitReferences')}; }, R);
  ok(PK.pika >= 6 && PK.fit===PK.pika && PK.vanilla <= 4 && !PK.vfit, '✨ on Prism Pika sends all 6 of the take\'s pictures through MMH3FitReferences (vanilla keeps its first few): ' + JSON.stringify(PK));
  // Upscale LoRA Off: the ✨ sheet's choice reaches the pass, and the graph has no regenerate LoRA (0.8 still has it)
  const LO = await fr.evaluate(async () => { const f = FILM.S.films.find(x => x.id==='fA'), tr = f.tracks[0], c = tr.clips[0]; (FILM.S.passes || []).forEach(p => { if(p.o && p.o.swap===c.id) p.state = 'done'; });
    FILM.hqSheet(f, tr, c); await new Promise(z => setTimeout(z, 100)); const b = document.querySelector('#hqLo [data-v="0"]'); const seg = !!b; b && b.click(); document.querySelector('#hqGo').click(); await new Promise(z => setTimeout(z, 1500)); return {seg, saved:FILM.S.hqLora}; });
  const LG = await page.evaluate(R => { const t = H3.S.takes.find(x => x.redo && x.redo.qp && x.up && x.up.str===0); if(!t) return null; const lor = g => Object.values(g).filter(n => n.class_type==='LoraLoaderModelOnly' && /regenerate/.test(n.inputs.lora_name)).length;
    const off = lor(H3.upGraph(t, H3.PC[R].oi, {}).g); t.up.str = 0.8; const on = lor(H3.upGraph(t, H3.PC[R].oi, {}).g); t.up.str = 0; return {off, on}; }, R);
  ok(LO.seg && LO.saved===0 && LG && LG.off===0 && LG.on===1, 'Upscale LoRA Off in the ✨ sheet: the pass runs without the regenerate LoRA (and it is remembered): ' + JSON.stringify({LO, LG}));
  // ✨ on Pika samples like the render (res_multistep, simple, 8 steps, the strength as denoise) and writes the H3-way prompt when the take had it
  const PS = await page.evaluate(R => { const src = H3.S.takes.find(x => x.id==='tA'), t = JSON.parse(JSON.stringify(src)); t.id = 'tPs'; t.imgs = [{id:'mQ1', desc:'a woman with a red bob', keep:'exact'}]; t.h3 = {quality:false, qstyle:'', qtext:'', style:'', sound:'', music:''};
    t.up = {scale:1.5, den:0.9, clean:0.8, look:'live', str:0, refs:true, prompt:'she waves', unet:'singularityV2X10eros_prismPIKA.safetensors', crop:{s0:0, L:120, pad:0, F:120}}; t.smoothed = t.final;
    const g = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g), ms = g.find(n => n.class_type==='ManualSigmas'), ks = g.find(n => n.class_type==='KSamplerSelect'), rv = g.find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    t.up.unet = ''; const g2 = Object.values(H3.upGraph(t, H3.PC[R].oi, {}).g);
    return {bs:ms && ms.inputs.sigmas.split(',').map(x => +x), noBS:!g.some(n => n.class_type==='BasicScheduler'), ks:ks && ks.inputs.sampler_name, h3:/integrated_multimodal_description|\[Shot 1\]/.test(rv.inputs.prompt), p:rv.inputs.prompt.slice(0, 200), vanillaManual:g2.some(n => n.class_type==='ManualSigmas') && !g2.some(n => n.class_type==='BasicScheduler')}; }, R);
  ok(PS.bs && PS.bs.length===9 && PS.bs[0]===0.9 && PS.bs[8]===0 && PS.noBS && PS.ks==='res_multistep' && PS.h3 && PS.vanillaManual, '✨ on Pika samples like the render (8 steps res_multistep, strength = denoise) with the H3-way prompt; vanilla keeps its own: ' + JSON.stringify(PS));
  // 🌙 Do it all: when ✨ is done, every one-person clip gets 🎭 by itself (first face SAM 3 finds, her pictures), then the seams start
  await page.evaluate(() => { H3.S.media.mF1 = {kind:'img', thumb:'x', name:'mF1.png'}; H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Laura', pics:['mF1'], keep:'exact'}]; H3.S.takes.forEach(t => { if(!t.film) t.film = H3.S.fkey; }); H3.saveNow(); });
  const AL = await fr.evaluate(async () => { const f = FILM.S.films.find(x => x.tracks.some(t => t.id==='tr1')), tr = f.tracks.find(t => t.id==='tr1'); tr.clips.forEach(c => delete c.cut); FILM.S.passes = []; FILM.S.faceDen = 0.6; FILM.S.faceLora = 0;
    const who = tr.clips.map(c => FILM.autoFaceOf(c)); f.upRun = {id:'u4', track:tr.id, state:'faces', all:true, hq:[], qw:''};
    FILM.upTick(); await new Promise(z => setTimeout(z, 2500)); const R = f.upRun, ps = (FILM.S.passes || []).filter(p => (R.fk || []).includes(p.key));
    const r = {who, fk:(R.fk || []).length, skip:R.fskip, faces:ps.map(p => JSON.stringify(p.o.faces) + p.o.find + p.o.den + ':' + p.o.str), state0:R.state, box:FILM.upRunHtml(f).includes('🌙 🎭 Faces')};
    R.tries = {}; ps.forEach(p => { p.state = 'failed'; R.tries[p.key] = 2; }); FILM.upTick(); await new Promise(z => setTimeout(z, 2500)); r.state1 = f.upRun.state; r.seams = (f.upRun.seams || []).length; return r; });
  ok(AL.who.every(n => n===1) && AL.fk===3 && AL.skip===0 && AL.faces.every(x => x==='[{"n":1,"obj":0}]face0.6:0') && AL.state0==='faces' && AL.box && AL.state1==='seams' && AL.seams===1, '🌙 Do it all: ✨ done → 🎭 on every one-person clip by itself (her first face, the last 🎭 strength and LoRA), and when they\'re done (failed ones keep their clip) the 🧵 seams start: ' + JSON.stringify(AL));
  const NF = await fr.evaluate(async () => { const f = FILM.S.films.find(x => x.tracks.some(t => t.id==='tr1')), tr = f.tracks.find(t => t.id==='tr1'); const p0 = (FILM.S.passes || []).length;
    f.upRun = {id:'u5', track:tr.id, state:'faces', all:true, noFaces:true, hq:[], qw:''}; FILM.upTick(); await new Promise(z => setTimeout(z, 2500));
    return {state:f.upRun.state, seams:(f.upRun.seams || []).length, faces:(FILM.S.passes || []).slice(p0).filter(p => p.o && p.o.faces).length}; });
  ok(NF.state==='seams' && NF.seams===1 && NF.faces===0, '🌙 without 🎭: ✨ done → straight to the 🧵 seams, no face pass sent: ' + JSON.stringify(NF));
  const AL2 = await fr.evaluate(() => { const f = FILM.S.films.find(x => x.tracks.some(t => t.id==='tr1')), c = f.tracks.find(t => t.id==='tr1').clips[0], H = window.parent.H3; H.S.cast.push({n:2, kind:'char', stand:'a man', who:'Ben', pics:['mF1'], keep:'exact'}); const two = FILM.autoFaceOf(c); H.S.cast.pop(); return {two}; });
  ok(AL2.two===null, '🌙 a clip that could be two people is left for the morning: ' + JSON.stringify(AL2));
  // 🧵 at most 3 clips per seams job (Main ran out of RAM on 12 at 1280×704): 5 ⛓ clips = [1,2,3] + [4,5] first, then the 3|4 join
  const SR = await fr.evaluate(async () => { const f = FILM.S.films.find(x => x.tracks.some(t => t.id==='tr1')), tr = f.tracks.find(t => t.id==='tr1'), t0 = tr.clips[0];
    const keep = tr.clips; tr.clips = [0, 1, 2, 3, 4].map(i => Object.assign({}, t0, {id:'cs' + i, at:i * 2, in:i * 2, out:i * 2 + 2, cut:false}));
    f.upRun = {id:'u6', track:tr.id, state:'faces', hq:[], qw:''}; const R = f.upRun; await FILM.upSeamsGo(f, R);
    const r = {a:R.seams.length, b:JSON.stringify(R.seamB)}; R.seams.forEach(k => FILM.S.placed[k] = true); FILM.upTick(); await new Promise(z => setTimeout(z, 2500));
    r.after = R.seams.length; r.state = R.state; r.bLeft = R.seamB; R.seams.forEach(k => FILM.S.placed[k] = true); FILM.upTick(); r.end = R.state; tr.clips = keep; return r; });
  const SRp = await page.evaluate(() => H3.S.takes.filter(x => x.combo && x.combo.seam && x.combo.seam.run==='u6').map(t => t.combo.parts.length).sort().join(','));
  ok(SR.a===2 && SR.b==='[["cs2","cs3"]]' && SR.after===3 && SR.state==='seams' && SR.bLeft===null && SR.end==='done' && SRp==='2,2,3', '🧵 seams in jobs of at most 3 clips: [1,2,3] and [4,5] first, then the join between them; done when all are back: ' + JSON.stringify({SR, SRp}));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
