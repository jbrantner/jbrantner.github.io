// ⇿ Fill a gap (2026-11-13): new seconds between two clips, the end of the clip before pinned at the start and the start of the clip after at the end.
// Run: CLIP=<a ~5 s video with sound> NODE_PATH=$(npm root -g) node tests/t_fill.js
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
  // the official model under its other name (Render's hardlink) is the same family as the HF name (Main has only that one)
  const AL = await page.evaluate(() => { const oi = {UNETLoader:{input:{required:{unet_name:[['minimax_h3_ref2va_pruned_int8_convrot.safetensors']]}}}};
    return {k1:H3.famKey('minimaxH3INT8INT4_ref2vaINT8Pruned.safetensors'), k2:H3.famKey('minimax_h3_ref2va_pruned_int8_convrot.safetensors'), r:!!H3.resolveModel(oi, 'minimaxh3int4_ref2vapruned', false)}; });
  ok(AL.k1===AL.k2 && AL.r, 'both names of the official Reference model are one family, so Main (HF name only) can take it: ' + JSON.stringify(AL));
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
  // the plan: clip A's last half second at the start (ending on its last frame), clip B's first frames from a grid frame on
  const GP = await page.evaluate(() => H3.gapPlan(120, 120, 120, 0, 2, 12));
  ok(GP.C===12 && GP.k0===13 && (GP.k0 + GP.B) % 4===0 && Math.abs(GP.B - 48) < 4 && GP.L % 17===5 && GP.pinsA.map(p => p.join(':')).join()==='0:107,4:111,8:115,12:119'
    && GP.pins.every(([o, s]) => o >= GP.k0 + GP.B && s===o - GP.k0 - GP.B && (o % 4===0 || o===GP.L - 1)) && GP.pins.some(p => p[0]===GP.k0 + GP.B && p[1]===0), '⇿ the fill plan pins A\'s end at the start and B\'s start at the end (' + JSON.stringify(GP) + ')');
  const GS = await page.evaluate(() => H3.gapPlan(120, 30, 120, 24, 1, 12));
  ok(GS.pinsA[GS.pinsA.length - 1][1]===29 && GS.pins[0][1]===24, 'it starts from where clip A is trimmed to and lands on where clip B is trimmed from (' + JSON.stringify([GS.pinsA, GS.pins.slice(0, 2)]) + ')');
  // two clips with 2 s of empty space between them
  await fr.evaluate(() => { const f = FILM.S.films[0], tr = f.tracks.find(t => t.clips.some(c => c.id===window.C2)), c2 = tr.clips.find(c => c.id===window.C2), c1 = tr.clips.find(c => c.id===window.C1);
    c2.at = c1.at + 5 + 2; FILM.SEL = null; FILM.GAP = {k:f.tracks.indexOf(tr), a:c1.at + 5, b:c2.at}; FILM.draw(); });
  await page.waitForTimeout(300);
  ok(await fr.evaluate(() => !!document.querySelector('.gapsel [data-act="fill"]') && !document.querySelector('.tools [data-act="fill"]').disabled), 'the selected empty space has ⇿ Fill (and ⇿ Fill a gap in the tools is on)');
  await fr.click('.gapsel [data-act="fill"]'); await page.waitForTimeout(300);
  const sh = await fr.evaluate(() => ({open:!document.querySelector('#sheet').hidden, txt:document.querySelector('#sheetCard').textContent, secs:document.querySelector('#flS').value, words:document.querySelector('#flP').value}));
  const sp = await fr.evaluate(() => ({a:+document.querySelector('#flSA').value, b:+document.querySelector('#flEB').value, sum:document.querySelector('#flSum').textContent}));
  ok(Math.abs(sp.a - 4.5) < 0.01 && Math.abs(sp.b - 0.5) < 0.01 && /New part: 3\.0 s/.test(sp.sum), '⇿ the blend starts half a second before clip 1 ends and lands half a second into clip 2, plus the 2 s gap (' + JSON.stringify(sp) + ')');
  const GQ = await page.evaluate(() => H3.gapPlan(120, 4.5 * 24, 120, 12, 3, 24));
  ok(GQ.C===24 && GQ.pinsA[GQ.pinsA.length - 1][1]===107 && GQ.pinsA[0][1]===83 && GQ.pins[0][1]===12 && GQ.pins.some(p => p[1] >= 12 + 20), '⇿ a second of each clip beyond the blend points is the context (' + JSON.stringify([GQ.pinsA, GQ.pins]) + ')');
  ok(sh.open && /Fill a gap/.test(sh.txt) && sh.secs==='2' && /^\[0s-1s\] The scene keeps carrying on from the moment before\.\n\[1s-\] $/.test(sh.words), '⇿ opens a sheet with the gap\'s length and the carry-on anchor line (' + JSON.stringify(sh) + ')');
  await fr.evaluate(() => { const p = document.querySelector('#flP'); p.value += 'she turns from the window'; const c = document.querySelector('#flCut'); c.checked = true; c.onchange({target:c});
    const a = document.querySelector('#flA'); a.value = 'close-up'; a.oninput({target:a}); const w = document.querySelector('#flW'); w.value = 'she reaches for the handle'; w.oninput({target:w}); });
  const MD = await fr.evaluate(() => { const m = document.querySelector('#flMod'); if(!m) return {box:false}; const k = m.options[m.options.length - 1].value; m.value = k; m.onchange({target:m}); document.querySelector('#flSp [data-v="0"]').click(); return {box:true, k, n:m.options.length}; });
  const n0 = sent.length; await fr.click('#flGo'); await page.waitForTimeout(1500);
  const g = sent[n0] && sent[n0].g, ags = g ? Object.values(g).filter(n => n.class_type==='MiniMaxH3AddGuide' && n.inputs.image) : [], lvs = g ? nodes(g, 'LoadVideo') : [];
  const keep = g && Object.values(g).find(n => n.class_type==='ImageFromBatch' && n.inputs.batch_index===GQ.k0 && n.inputs.length===GQ.B);
  ok(sent.length===n0 + 1 && lvs.length===2 && ags.length===GQ.pinsA.length + GQ.pins.length && ags.some(n => n.inputs.frame_idx===0) && ags.some(n => n.inputs.frame_idx===GQ.L - 1) && keep, '⇿ its graph loads both clips, pins A\'s end from frame 0 and B\'s start at the end, and keeps only the new frames (' + ags.map(n => n.inputs.frame_idx).join(',') + ')');
  const tk = await page.evaluate(() => { const t = H3.S.takes.find(x => x.lead && x.lead.gap); return t && {prompt:t.prompt, gap:t.lead.gap.clip, clip:t.lead.clip}; });
  { const tm = await page.evaluate(() => { const t = H3.S.takes.find(x => x.lead && x.lead.gap); return {model:t.model, turbo:t.turbo}; }); ok(MD.box && tm.model===MD.k && tm.turbo===false, '⇿ the sheet picks the model and Turbo/Regular for the fill (' + JSON.stringify([MD, tm]) + ')'); }
  ok(tk && /^\[0s-1s\] The scene keeps carrying on from the moment before\.\n\[1s-\] she turns from the window\n\[2\.5s-\] \[Shot 2\] The camera cuts on the action to a close-up as she reaches for the handle, same place, same lighting, same outfit\.$/.test(tk.prompt), '🎬 cut on the action adds the cut line at its moment (anchor line untouched): ' + JSON.stringify(tk && tk.prompt));
  await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(400);
  const pl = await fr.evaluate(() => { const f = FILM.S.films[0], all = f.tracks.flatMap(tr => tr.clips), c1 = all.find(x => x.id===window.C1), c2 = all.find(x => x.id===window.C2), fc = all.find(x => FILM.takeOf(x.take) && FILM.takeOf(x.take).lead && FILM.takeOf(x.take).lead.gap);
    return {c1:[c1.at, c1.out - c1.in], c2:c2.at, c2in:c2.in, fill:fc && [fc.at, fc.out - fc.in], label:document.querySelector('.clip.sel .nm') && document.querySelector('.clip.sel .nm').textContent}; });
  ok(pl.fill && Math.abs(pl.c1[1] - 4.5) < 0.01 && Math.abs(pl.c2in - 0.5) < 0.01 && Math.abs(pl.fill[0] - (pl.c1[0] + pl.c1[1])) < 1e-3 && Math.abs(pl.fill[1] - GQ.B / 24) < 1e-3 && Math.abs(pl.c2 - (pl.fill[0] + pl.fill[1])) < 1e-3 && /^⇿/.test(pl.label || ''), '⇿ the fill sits right after clip A and clip B moves to where it ends (' + JSON.stringify(pl) + ')');
  // touching clips: select the first one, ⇿ Fill a gap adds time between it and the next
  const tp = await fr.evaluate(() => { FILM.GAP = null; FILM.SEL = window.C1; FILM.draw(); const P = FILM.fillPair(FILM.S.films[0]); return {b:P && P.B && P.B.id, gap:P && P.gap, on:!document.querySelector('.tools [data-act="fill"]').disabled}; });
  ok(tp.on && tp.b && tp.gap < 1e-3, 'with a clip selected, ⇿ Fill a gap goes between it and the next clip, even when they touch (' + JSON.stringify(tp) + ')');
  // trimmed clips (Jordan 2026-11-13: "the frame that's showing"): the fill starts on the last frame on screen and lands on the first one
  { await fr.evaluate(() => { const f = FILM.S.films[0], all = f.tracks.flatMap(tr => tr.clips), c1 = all.find(x => x.id===window.C1), c2 = all.find(x => x.id===window.C2);
      const tr = f.tracks.find(t => t.clips.includes(c1)); tr.clips = tr.clips.filter(x => x===c1 || x===c2); c1.out = 3.5; c2.in = 1.25; c2.at = c1.at + 3.5 + 1; FILM.GAP = null; FILM.SEL = c1.id; FILM.draw(); });
    await fr.click('.tools [data-act="fill"]'); await page.waitForTimeout(300);
    // the two blend points never take more than 5 s of the clips together
    const cl = await fr.evaluate(() => { const A = document.querySelector('#flSA'), B = document.querySelector('#flEB'); A.value = A.min; A.oninput({target:A}); B.value = B.max; B.oninput({target:B});
      return {a:+A.value, b:+B.value, ov:(3.5 - +A.value) + (+B.value - 1.25)}; });
    ok(cl.ov <= 5 + 1e-3 && cl.ov > 4.9, '⇿ moving one blend point past 5 s of overlap pulls the other back (' + JSON.stringify(cl) + ')');
    await fr.evaluate(() => { const A = document.querySelector('#flSA'), B = document.querySelector('#flEB'); A.value = A.max; A.oninput({target:A}); B.value = B.min; B.oninput({target:B}); });
    const n1 = sent.length; await fr.click('#flGo'); await page.waitForTimeout(1500);
    const g2 = sent[n1] && sent[n1].g, lv = g2 ? Object.entries(g2).filter(([k, n]) => n.class_type==='LoadVideo') : [], src = id => Object.entries(g2).find(([k, n]) => n.class_type==='GetVideoComponents' && n.inputs.video[0]===id);
    const fromVid = (gcId) => Object.values(g2).filter(n => n.class_type==='ImageFromBatch' && n.inputs.image[0]===gcId).map(n => n.inputs.batch_index);
    const per = lv.map(([id]) => { const gc = src(id); return gc ? fromVid(gc[0]) : []; });
    const pinsA = per.find(a => a.includes(83)), pinsB = per.find(a => a.includes(30));
    ok(pinsA && Math.max(...pinsA)===83 && pinsB && Math.min(...pinsB)===30, '⇿ with trimmed clips the fill starts on clip A\'s last frame showing (3.5 s → frame 83) and lands on clip B\'s first frame showing (1.25 s → frame 30): ' + JSON.stringify(per)); }
  // a 🎬 nested shot (no H3 Deck take): its export file is used, sized to the fill, with a take of the shot for the settings
  { const n2 = sent.length; await page.evaluate(() => window.H3GapFill({a:{file:{filename:'shot1.mp4', subfolder:'Output_Render/H3Film', type:'output'}, frames:120, w:1600, h:900}, outA:4, takeB:'tA', inB:0.5, secs:2, prompt:'x', n:1, film:'fA', clipA:'', clipB:''}));
    await page.waitForTimeout(1200); const g3 = sent[n2] && sent[n2].g;
    ok(g3 && nodes(g3, 'LoadVideo').some(n => n.inputs.file==='Output_Render/H3Film/shot1.mp4 [output]') && nodes(g3, 'ImageScale').length > 0, '⇿ a nested shot\'s export can be the clip before (loaded from its file, scaled to the fill)'); }
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
