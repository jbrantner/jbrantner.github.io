// 🎞 Films ➕ Carry on from here and ↻ Redo a stretch, against a fake ComfyUI answered in the browser (nothing renders).
// Run: CLIP=<a ~5 s video with sound> NODE_PATH=$(npm root -g) node tests/t_carry.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8017);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], views = [];
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:sent.map(s => [0, s.pid])});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({});
    if(p==='/view'){ views.push(u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)}); }
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.webm', subfolder:'', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, host:u.origin, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route(M + '/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:'http://main.test', on:true, speed:1.26}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8017/index.html');
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
  ok(await fr.evaluate(() => !!document.querySelector('[data-act="carry"]') && !!document.querySelector('[data-act="redo"]')), 'the timeline has ➕ Carry on from here and ↻ Redo a stretch');
  // ➕ at 2.5 s into the first clip
  await fr.evaluate(() => { FILM.SEL = window.C1; FILM.PH = 2.5; FILM.draw(); }); await fr.click('[data-act="carry"]');
  await page.waitForFunction(() => { const m = H3.S.media[H3.S.f.first]; return m && m.carry; }, null, {timeout:10000});
  const cf = await page.evaluate(() => { const f = H3.S.f, m = H3.S.media[f.first]; return {fl:f.fl, cut:m.cut, carry:m.carry, prompt:f.prompt, render:!document.querySelector('#renderTab').hidden, note:document.querySelector('#contNote').textContent, secs:f.seconds}; });
  ok(cf.fl && Math.abs(cf.cut - 2.5) < 0.01 && cf.carry.src==='tA' && cf.carry.film==='fA' && /walks to the window/.test(cf.prompt) && cf.render && cf.secs===5, '➕ opens Render with the take carried on from 2.5 s, its settings, and the prompt from that moment to edit (' + JSON.stringify(cf) + ')');
  ok(await page.evaluate(() => H3.S.tab==='films' && !document.querySelector('#filmTab').hidden && /Carrying on/.test(document.querySelector('#filmFormNote').textContent)), 'it stays on 🎞 Films: the Render form is right under the timeline, saying it carries on the clip');
  ok(/Carried on from 2.5 s/.test(cf.note), 'the slot says where it carries on from (' + cf.note + ')');
  const n0 = sent.length; await page.evaluate(() => { H3.S.f.prompt = 'she opens the window'; H3.S.f.takes = 1; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(1500);
  const ct = await page.evaluate(() => { const t = JSON.parse(JSON.stringify(H3.S.takes[0])); t.pieces.forEach((p, i) => { p.file = {filename:'piece_0' + (i + 1) + '_00001_.mp4', subfolder:'Output_Render/' + t.dir}; }); return {id:t.id, cont:t.cont, contCut:t.contCut, contSecs:t.contSecs, carry:t.carry, jg:H3.joinGraph(t).g}; });
  const g1 = sent[n0] && sent[n0].g, vs = g1 && node(g1, 'Video Slice'), gc = g1 && Object.values(g1).find(n => n.class_type==='GetVideoComponents' && n.inputs.video[0]===Object.keys(g1).find(k => g1[k]===vs));
  const lv0 = g1 && node(g1, 'LoadVideo');
  ok(lv0 && lv0.inputs.file==='Output_Render/H3Deck/h3_a/h3_a_00001_.mp4 [output]', 'the PC loads the take straight from its output folder (nothing downloaded to the phone and sent back): ' + (lv0 && lv0.inputs.file));
  ok(sent.length===n0 + 1 && vs && vs.inputs.start_time===0 && Math.abs(vs.inputs.duration - 2.5) < 0.01 && gc && node(g1, 'MiniMaxH3MotionContext').inputs.context_frames, 'the new part carries on from the video cut at 2.5 s (Video Slice → Motion Context frames)');
  ok(ct.cont && Math.abs(ct.contCut - 2.5) < 0.01 && Math.abs(ct.contSecs - 2.5) < 0.01 && ct.carry && ct.carry.clip, 'the take remembers the cut and the clip it carries on');
  const jvs = node(ct.jg, 'Video Slice'), cc = node(ct.jg, 'ConcatenateVideo');
  ok(jvs && Math.abs(jvs.inputs.duration - 2.5) < 0.01 && cc && ct.jg[cc.inputs['videos.video0'][0]].class_type==='Video Slice', 'the finished take = the video up to 2.5 s, then the new part');
  // Films puts it right after the clip: the clip ends at 2.5 s, the next clip moves along
  await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(200);
  const pl = await fr.evaluate(id => { const f = FILM.S.films[0], cs = f.tracks[0].clips.map(c => ({take:c.take, at:+c.at.toFixed(2), in:+c.in.toFixed(2), out:+c.out.toFixed(2)})); return cs; }, ct.id);
  const nc = pl.find(c => c.take===ct.id);
  ok(pl.length===3 && pl[0].out===2.5 && nc && nc.at===2.5 && nc.in===2.5 && nc.out > 7 && pl[1].at===+(nc.at + nc.out - nc.in).toFixed(2), '➕ the new part sits right after the clip (now ending at 2.5 s) and the clip after it moves along (' + JSON.stringify(pl) + ')');
  ok(await fr.evaluate(() => /Carry on|➕/.test(document.querySelector('#tl').textContent)), 'the new clip is labelled ➕');
  // ↻ redo 1–2 s of the second clip (the original take)
  await page.click('[data-tab="films"]'); await page.waitForTimeout(500);
  await fr.evaluate(() => { FILM.SEL = window.C2; const r = FILM.clipOf(FILM.S.films[0], window.C2); FILM.PH = r.c.at + 1; FILM.draw(); }); await fr.click('[data-act="redo"]'); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => !document.querySelector('#sheet').hidden && /Redo a stretch/.test(document.querySelector('#sheetCard').textContent) && /walks to the window/.test(document.querySelector('#rdP').value)), "↻ opens a sheet with the stretch and the take's words there");
  await fr.evaluate(() => { const b = document.querySelector('#rdB'); b.value = 2; b.dispatchEvent(new Event('input')); document.querySelector('#rdP').value = 'she trips and catches herself'; document.querySelector('#rdN [data-v="2"]').click(); });
  const n1 = sent.length; await fr.click('#rdGo'); await page.waitForTimeout(1500);
  const rd = await page.evaluate(() => H3.S.takes.filter(t => t.redo).map(t => ({id:t.id, pc:t.pc, redo:t.redo, p:t.pieces.map(p => [p.start, p.gen, p.prompt]), fl:t.fl, cont:t.cont})));
  ok(rd.length===2 && sent.length===n1 + 2 && rd.every(t => t.redo.src==='tA' && t.redo.key===rd[0].redo.key && t.p.length===1 && t.p[0][2]==='she trips and catches herself' && t.redo.file==='Output_Render/H3Deck/h3_a/h3_a_00001_.mp4 [output]'), '↻ 2 versions sent, each one window on the take\'s PC with the new words (' + JSON.stringify(rd[0] && rd[0].redo) + ')');
  const hosts = sent.slice(n1).map(x => x.host), pcs2 = rd.map(t => t.pc);
  ok(new Set(hosts).size===2 && new Set(pcs2).size===2, '↻ the 2 versions are split between Render and Main (' + JSON.stringify(hosts) + ')');
  const g2 = sent.slice(n1).find(x => x.host===R).g, R0 = rd[rd.length - 1].redo, ag = nodes(g2, 'MiniMaxH3AddGuide'), ib = nodes(g2, 'ImageFromBatch');
  ok(ag.filter(n => n.inputs.image).length===R0.pins.length && ag.some(n => n.inputs.audio) && ag.filter(n => n.inputs.image).every(n => n.inputs.frame_idx % 4===0 || n.inputs.frame_idx===R0.L - 1), 'every pinned frame is a MiniMax guide on the grid, plus the take\'s sound (' + R0.pins.length + ' frames)');
  ok(Math.abs(R0.a - 24) <= 3 && Math.abs(R0.b - 48) <= 3 && node(g2, 'MiniMaxH3ReferenceToVideo').inputs.length===R0.L, 'the window is the stretch plus half a second each side (' + JSON.stringify({a:R0.a, b:R0.b, s0:R0.s0, L:R0.L}) + ')');
  const bt = nodes(g2, 'ImageBatch'), cv = node(g2, 'CreateVideo');
  const lens = ib.filter(n => n.inputs.length > 1).map(n => n.inputs.length);
  ok(bt.length===2 && cv && lens.includes(R0.a + 1) && lens.includes(R0.b - R0.a - 1) && lens.includes(R0.F - R0.b) && R0.a + 1 + (R0.b - R0.a - 1) + (R0.F - R0.b)===120, 'the splice keeps the take before and after, with the new frames between (' + JSON.stringify(lens) + ')');
  // the first redo to finish goes into the clip; the original and the other one are in ⇄ Versions
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); t.pieces[0].state = 'done'; t.pieces[0].file = {filename:'piece_01_00001_.mp4', subfolder:'Output_Render/' + t.dir, type:'output'}; t.final = t.pieces[0].file; t.state = 'done'; H3.saveNow(); }, rd[1].id);
  await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(200);
  const sw = await fr.evaluate(([id, a]) => { const r = FILM.clipOf(FILM.S.films[0], window.C2); return {take:r.c.take, out:r.c.out, vs:FILM.versionsOf(FILM.takeOf(id)).map(t => t.id)}; }, [rd[1].id]);
  ok(sw.take===rd[1].id && Math.abs(sw.out - 5) < 0.05 && sw.vs.includes('tA') && sw.vs.includes(rd[0].id), '↻ the finished redo replaces the clip\'s take; ⇄ Versions has the original and the other redo (' + JSON.stringify(sw) + ')');
  // scrub like Resolve: the needle stays in the middle and swiping the timeline moves the time under it
  const sc = await fr.evaluate(async () => { const w = document.querySelector('#tlw'), pps = FILM.S.films[0].pps, nb = document.querySelector('#needle').getBoundingClientRect(), wb = w.getBoundingClientRect();
    w.scrollLeft = 3 * pps; await new Promise(r => setTimeout(r, 150)); const a = FILM.PH; w.scrollLeft = 6 * pps; await new Promise(r => setTimeout(r, 150));
    const ru = document.querySelector('#ruler').getBoundingClientRect();
    return {a, b:FILM.PH, mid:Math.abs((nb.left + nb.width / 2) - (wb.left + wb.width / 2)) < 2, zero:Math.round(ru.left + 0 - wb.left)}; });
  ok(Math.abs(sc.a - 3) < 0.05 && Math.abs(sc.b - 6) < 0.05 && sc.mid, 'swiping the timeline scrubs: the needle stays in the middle and the time under it is the playhead (' + JSON.stringify(sc) + ')');
  await fr.evaluate(() => { FILM.SEL = null; FILM.PH = 1; FILM.draw(); }); await page.waitForTimeout(200);
  const sl = await fr.evaluate(() => { const w = document.querySelector('#tlw'); return [w.scrollLeft, FILM.S.films[0].pps]; });
  ok(Math.abs(sl[0] - sl[1]) < 2, 'setting the playhead slides the timeline so that moment is under the needle (' + sl + ')');
  // a plain Render from the Films tab goes onto the open film's timeline (end of track 1)
  await page.click('[data-tab="films"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { const f = H3.S.f; Object.assign(f, {fl:false, first:null, prompt:'she waves at the camera', takes:1, seconds:3}); document.querySelector('#prompt').value = f.prompt; H3.drawAll(); });
  ok(/New takes go into/.test(await page.textContent('#filmFormNote')), 'the form says new takes go into the open film');
  const n2 = sent.length; await page.click('#goBtn'); await page.waitForTimeout(1500);
  const nt = await page.evaluate(() => { const t = H3.S.takes[0]; return {id:t.id, toFilm:t.toFilm}; });
  await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(200);
  const tr0 = await fr.evaluate(() => FILM.S.films[0].tracks[0].clips.map(c => ({take:c.take, at:c.at})));
  ok(sent.length===n2 + 1 && nt.toFilm && nt.toFilm.film==='fA' && tr0[tr0.length - 1].take===nt.id && tr0[tr0.length - 1].at >= Math.max(...tr0.slice(0, -1).map(c => c.at)), 'a Render from the Films tab lands on the end of track 1 of the open film (' + JSON.stringify(nt.toFilm) + ')');
  // the words behind every moment: the carry-on starts with its source take's words, then its own; a redo's middle has the redo words
  const sg = await fr.evaluate(([c, r]) => ({c:FILM.segsOf(FILM.takeOf(c)).map(x => [+x.a.toFixed(2), +x.b.toFixed(2), x.text]), r:FILM.segsOf(FILM.takeOf(r)).map(x => [+x.a.toFixed(2), +x.b.toFixed(2), x.text]), mix:FILM.wordsBetween(FILM.takeOf(c), 2, 3)}), [ct.id, rd[1].id]);
  ok(sg.c.length===2 && sg.c[0][1]===2.5 && /walks to the window/.test(sg.c[0][2]) && /opens the window/.test(sg.c[1][2]) && sg.c[1][0]===2.5, 'a carry-on take remembers both prompts by time (' + JSON.stringify(sg.c) + ')');
  ok(sg.r.length===3 && /trips/.test(sg.r[1][2]) && /walks/.test(sg.r[0][2]) && /walks/.test(sg.r[2][2]), 'a redone take: its words, the redo words in the stretch, then its words (' + JSON.stringify(sg.r) + ')');
  ok(/walks to the window\..*opens the window/.test(sg.mix), 'a stretch across both joins the two prompts in order (' + sg.mix + ')');
  // scrubbing fills the Shot box with the words under the playhead
  await page.evaluate(() => { H3.S.f.fl = false; H3.S.f.first = null; H3.S.f.model = 'something else'; H3.S.f.loras = [{name:'other.safetensors', str:1, words:''}]; H3.drawAll(); document.activeElement && document.activeElement.blur(); });
  await fr.evaluate(id => { const f = FILM.S.films[0], c = f.tracks[0].clips.find(x => x.take===id), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1) * f.pps); }, ct.id); await page.waitForTimeout(400);
  const pv = await page.evaluate(() => [H3.S.f.prompt, document.querySelector('#prompt').value]);
  ok(/opens the window/.test(pv[0]) && pv[0]===pv[1], 'scrubbing onto the carry-on clip puts its prompt in the Shot box (' + pv[0] + ')');
  const st = await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return {m:H3.S.f.model===t.model, l:H3.S.f.loras.length, fl:H3.S.f.fl}; }, ct.id);
  ok(st.m && st.l===0 && !st.fl, 'and everything else that take used: its model and LoRAs (not the video it carried on) (' + JSON.stringify(st) + ')');
  // change something (a new reference) and scrubbing leaves it alone; ↺ Follow the clip again lets it load clips again
  await page.evaluate(() => { H3.S.f.loras = [{name:'swap.safetensors', str:1, words:''}]; H3.drawAll(); });
  await fr.evaluate(() => { const f = FILM.S.films[0], c = f.tracks[0].clips[0], w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1) * f.pps); }); await page.waitForTimeout(400);
  const kept = await page.evaluate(() => ({l:H3.S.f.loras.map(x => x.name), p:H3.S.f.prompt, note:document.querySelector('#filmFormNote').textContent}));
  ok(kept.l[0]==='swap.safetensors' && /opens the window/.test(kept.p) && /stay while you scrub/.test(kept.note), 'after you change something, scrubbing to another clip keeps your settings (' + JSON.stringify(kept.l) + ')');
  await page.evaluate(() => H3FilmFollow()); await page.waitForTimeout(300);
  const fol = await page.evaluate(() => ({l:H3.S.f.loras.length, p:H3.S.f.prompt}));
  ok(fol.l===0 && /walks to the window/.test(fol.p), '↺ Follow the clip again loads the clip under the playhead (' + JSON.stringify(fol) + ')');
  // a carry-on needs at least a second before it
  await fr.evaluate(() => { FILM.SEL = window.C1; const r = FILM.clipOf(FILM.S.films[0], window.C1); FILM.PH = r.c.at + 0.4; FILM.draw(); });
  const before = await page.evaluate(() => H3.S.f.first); await fr.click('[data-act="carry"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => H3.S.f.first)===before, 'carrying on from under 1 s in is refused (Motion Context needs the frames before)');
  await page.screenshot({path:path.join(__dirname, 'carry.png')});
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
