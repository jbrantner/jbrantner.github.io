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
  ok(ct.carry.own && !jvs && (!cc || ct.jg[cc.inputs['videos.video0'][0]].class_type==='LoadVideo'), 'the finished take is only the new part: its own clip, not stitched onto the one before (Jordan 2026-11-06)');
  // Films puts it right after the cut on the same track: the clip ends at 2.5 s, the new part follows, the next clip moves along
  await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(200);
  const pl = await fr.evaluate(() => FILM.S.films[0].tracks.map(tr => tr.clips.map(c => ({take:c.take, at:+c.at.toFixed(2), in:+c.in.toFixed(2), out:+c.out.toFixed(2)}))));
  const nc = pl[0].find(c => c.take===ct.id), nx = pl[0].find(c => c.take==='tA' && c.at > 2.5);
  ok(pl.length===2 && pl[0].length===3 && pl[0][0].out===2.5 && nc && nc.at===2.5 && nc.in===0 && nc.out > 4.5 && nc.out < 5.5 && nx && Math.abs(nx.at - (2.5 + nc.out)) < 0.02, '➕ the new part replaces the rest of the clip from 2.5 s on the same track, and the next clip moves along (' + JSON.stringify(pl) + ')');
  ok(await fr.evaluate(() => /Carry on|➕/.test(document.querySelector('#tl').textContent)), 'the new clip is labelled ➕');
  // while it renders the new clip is striped; select it and its takes (the versions of that Carry on) show under it
  const cid = await fr.evaluate(id => FILM.S.films[0].tracks[0].clips.find(x => x.take===id).id, ct.id);
  ok(await fr.evaluate(c => !!document.querySelector('.clip.rend[data-c="' + c + '"]'), cid), 'the new part is striped on the timeline while it renders');
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id), v = JSON.parse(JSON.stringify(t)); v.id = 'tV2'; v.t = t.t + 1; v.state = 'done'; v.final = {filename:'v2_00001_.mp4', subfolder:'Output_Main/H3Deck/v2', type:'output'}; v.pieces.forEach(p => p.deliv = 96); H3.S.takes.unshift(v); H3.saveNow(); }, ct.id);
  await fr.evaluate(c => { FILM.SEL = c; FILM.draw(); }, cid); await page.waitForTimeout(300);
  const vstr = await fr.evaluate(() => [...document.querySelectorAll('#vstrip [data-act="useTake"]')].map(b => [b.dataset.t, b.classList.contains('on'), b.textContent]));
  ok(vstr.length===2 && vstr[0][1] && /Rendering on/.test(vstr[0][2]) && vstr[1][0]==='tV2', 'the selected clip shows its takes under it, the rendering one striped (' + JSON.stringify(vstr) + ')');
  await fr.click('#vstrip [data-t="tV2"]'); await page.waitForTimeout(300);
  const swc = await fr.evaluate(c => { const r = FILM.clipOf(FILM.S.films[0], c); return {take:r.c.take, len:+(r.c.out - r.c.in).toFixed(2)}; }, cid);
  ok(swc.take==='tV2' && swc.len===4, 'tapping a take puts it in the clip, at its own length (' + JSON.stringify(swc) + ')');
  // playing across the cut onto the clip above: always a picture on screen (no black flash), and the upper clip takes over at 2.5 s
  const pf = await fr.evaluate(() => new Promise(res => { const f = FILM.S.films[0]; FILM.PH = 1.8; FILM.draw(); let gaps = 0, n = 0, after = null; FILM.play(f);
    const tick = () => { n++; const on = document.querySelectorAll('.stage video.on'), t = FILM.PH; if(t > 1.9 && FILM.activeAt(f, t) && !on.length) gaps++; if(t > 2.3 && t < 2.8 && on[0] && on[0].paused) window.FROZE = (window.FROZE || 0) + 1;
      if(t > 2.9 && !after){ after = on[0] && on[0].dataset.c; } if(t < 3.2) requestAnimationFrame(tick); else { FILM.stopPlay && FILM.stopPlay(); res({gaps, n, after, want:FILM.activeAt(f, 3).id}); } }; requestAnimationFrame(tick); }));
  ok(pf.gaps===0 && pf.after===pf.want, 'playing across the cut never shows black, and the clip above takes over (' + JSON.stringify(pf) + ')');
  ok(!(await fr.evaluate(() => window.FROZE || 0)), 'the playing clip keeps playing (the sound unlock no longer pauses it)');
  // scrubbing across the cut and back: there is always a picture (the last one stays until the next clip's frame is ready)
  const sf = await fr.evaluate(() => new Promise(res => { const f = FILM.S.films[0], w = document.querySelector('#tlw'); let gaps = 0, k = 0;
    const pos = [2.0, 2.3, 2.6, 3.0, 2.4, 1.5, 2.8, 4.0, 6.0, 2.2];
    const step = () => { const on = [...document.querySelectorAll('.stage video.on')].some(v => v.readyState >= 2); if(k > 0 && !on) gaps++; if(k >= pos.length * 6){ res({gaps}); return; }
      if(k % 6===0) w.scrollLeft = Math.round(pos[k / 6] * f.pps); k++; requestAnimationFrame(step); };
    FILM.PH = 1.8; FILM.draw(); setTimeout(() => requestAnimationFrame(step), 600); }));
  ok(sf.gaps===0, 'scrubbing across clips never shows black (' + JSON.stringify(sf) + ')');
  // ＋ More takes: carry on again from the same moment, with the clip's words; the new takes join its takes, no new clip
  await page.evaluate(() => { H3.S.f.fl = false; H3.S.f.first = null; H3.drawAll(); });
  await fr.click('#vstrip [data-act="moreTakes"]'); await page.waitForTimeout(600);
  const mt = await page.evaluate(() => { const m = H3.S.media[H3.S.f.first]; return {carry:m && m.carry, cut:m && m.cut, prompt:H3.S.f.prompt}; });
  ok(mt.carry && mt.carry.key===ct.carry.key && Math.abs(mt.cut - 2.5) < 0.01 && /opens the window/.test(mt.prompt), '＋ More takes sets up the same Carry on (same moment, same group, the clip\'s words) (' + JSON.stringify(mt) + ')');
  const n9 = sent.length, nClips = await fr.evaluate(() => FILM.S.films[0].tracks.reduce((a, tr) => a + tr.clips.length, 0));
  await page.click('#goBtn'); await page.waitForTimeout(1500); await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(200);
  const mt2 = await fr.evaluate(c => ({n:FILM.S.films[0].tracks.reduce((a, tr) => a + tr.clips.length, 0), strip:document.querySelectorAll('#vstrip [data-act="useTake"]').length}), cid);
  ok(sent.length > n9 && mt2.n===nClips && mt2.strip===3, 'its renders join the clip\'s takes (no extra clip) (' + JSON.stringify(mt2) + ')');
  // ✓ Keep only this: the clip's other finished takes are deleted (list + their videos on the PC); rendering ones stay
  await page.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tV2'), v = JSON.parse(JSON.stringify(t)); v.id = 'tV3'; v.t = t.t + 2; v.final = {filename:'v3_00001_.mp4', subfolder:'Output_Main/H3Deck/v3', type:'output'}; H3.S.takes.unshift(v); H3.saveNow(); });
  await fr.evaluate(c => { FILM.SEL = c; FILM.draw(); }, cid); await page.waitForTimeout(300);
  await page.evaluate(() => { window.confirm = () => true; }); await fr.evaluate(() => { window.confirm = () => true; });
  await fr.click('#vstrip [data-act="keepOnly"]'); await page.waitForTimeout(600);
  const ko = await page.evaluate(() => ({v3:!!H3.S.takes.find(x => x.id==='tV3'), v2:!!H3.S.takes.find(x => x.id==='tV2')}));
  ok(!ko.v3 && ko.v2 && DEL.some(d => d.items.some(i => i.filename==='v3_00001_.mp4')), '✓ Keep only this deletes the other finished takes (and their videos on the PC), keeping the one in use (' + JSON.stringify([ko, DEL.length]) + ')');
  await fr.click('#vstrip [data-t="' + ct.id + '"]'); await page.waitForTimeout(200);
  // ↻ redo 1–2 s of the second clip (the original take)
  await page.click('[data-tab="films"]'); await page.waitForTimeout(500);
  await fr.evaluate(() => { FILM.SEL = window.C2; const r = FILM.clipOf(FILM.S.films[0], window.C2); FILM.PH = r.c.at + 1; FILM.draw(); }); await fr.click('[data-act="redo"]'); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => !document.querySelector('#sheet').hidden && /Redo or/.test(document.querySelector("#sheetCard").textContent) && /walks to the window/.test(document.querySelector('#rdP').value)), "↻ opens a sheet with the stretch and the take's words there");
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
  const tr0 = await fr.evaluate(id => { const f = FILM.S.films[0]; return f.tracks.find(tr => tr.clips.some(c => c.take===id)).clips.map(c => ({take:c.take, at:c.at})); }, await page.evaluate(() => H3.S.takes[0].id));
  ok(sent.length===n2 + 1 && nt.toFilm && nt.toFilm.film==='fA' && tr0[tr0.length - 1].take===nt.id && tr0[tr0.length - 1].at >= Math.max(...tr0.slice(0, -1).map(c => c.at)), 'a Render from the Films tab lands on the end of the open film (' + JSON.stringify(nt.toFilm) + ')');
  // the words behind every moment: the carry-on starts with its source take's words, then its own; a redo's middle has the redo words
  const sg = await fr.evaluate(([c, r]) => ({c:FILM.segsOf(FILM.takeOf(c)).map(x => [+x.a.toFixed(2), +x.b.toFixed(2), x.text]), r:FILM.segsOf(FILM.takeOf(r)).map(x => [+x.a.toFixed(2), +x.b.toFixed(2), x.text]), mix:FILM.wordsBetween(FILM.takeOf(r), 0.5, 1.5)}), [ct.id, rd[1].id]);
  ok(sg.c.length===1 && sg.c[0][0]===0 && /opens the window/.test(sg.c[0][2]), 'a carry-on clip has its own words from its start (' + JSON.stringify(sg.c) + ')');
  ok(sg.r.length===3 && /trips/.test(sg.r[1][2]) && /walks/.test(sg.r[0][2]) && /walks/.test(sg.r[2][2]), 'a redone take: its words, the redo words in the stretch, then its words (' + JSON.stringify(sg.r) + ')');
  ok(/walks to the window\..*trips/.test(sg.mix), 'a stretch across both joins the two prompts in order (' + sg.mix + ')');
  // scrubbing fills the Shot box with the words under the playhead
  await page.evaluate(() => { H3.S.f.fl = false; H3.S.f.first = null; H3.S.f.model = 'something else'; H3.S.f.loras = [{name:'other.safetensors', str:1, words:''}]; H3.drawAll(); H3FilmFollow(); document.activeElement && document.activeElement.blur(); });
  await fr.evaluate(id => { const f = FILM.S.films[0], c = f.tracks[0].clips.find(x => x.take===id), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1) * f.pps); }, ct.id); await page.waitForTimeout(400);
  const pv = await page.evaluate(() => [H3.S.f.prompt, document.querySelector('#prompt').value]);
  ok(/opens the window/.test(pv[0]) && pv[0]===pv[1], 'scrubbing onto the carry-on clip puts its prompt in the Shot box (' + pv[0] + ')');
  const st = await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return {m:H3.S.f.model===t.model, l:H3.S.f.loras.length, fl:H3.S.f.fl}; }, ct.id);
  ok(st.m && st.l===0 && !st.fl, 'and everything else that take used: its model and LoRAs (not the video it carried on) (' + JSON.stringify(st) + ')');
  // change something (a new reference) and scrubbing leaves it alone; ↺ Follow the clip again lets it load clips again
  await page.evaluate(() => { H3.S.f.loras = [{name:'swap.safetensors', str:1, words:''}]; H3.drawAll(); });
  await fr.evaluate(() => { const f = FILM.S.films[0], c = f.tracks.flatMap(tr => tr.clips).find(x => x.take==='tA' && x.at===0), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1) * f.pps); }); await page.waitForTimeout(400);
  const kept = await page.evaluate(() => ({l:H3.S.f.loras.map(x => x.name), p:H3.S.f.prompt, note:document.querySelector('#filmFormNote').textContent}));
  ok(kept.l[0]==='swap.safetensors' && /walks to the window/.test(kept.p) && /stay while you scrub/.test(kept.note), 'after you change a setting, scrubbing to another clip keeps your settings but still brings that clip\'s words (' + JSON.stringify(kept) + ')');
  // words you type yourself stay put while you scrub
  await page.evaluate(() => { H3.S.f.prompt = 'my own words'; document.querySelector('#prompt').value = 'my own words'; });
  await fr.evaluate(() => { const f = FILM.S.films[0], c = f.tracks.flatMap(tr => tr.clips).find(x => x.take==='tA' && x.at===0), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1.8) * f.pps); }); await page.waitForTimeout(500);
  const typed = await page.evaluate(() => ({p:H3.S.f.prompt, note:document.querySelector('#filmFormNote').textContent}));
  ok(typed.p==='my own words' && /You wrote in the Shot box/.test(typed.note), 'words you typed stay while the playhead is on that clip (' + JSON.stringify(typed) + ')');
  // another clip brings its own words, even after you typed (Jordan 2026-11-06: the box must follow the clip)
  await fr.evaluate(id => { const f = FILM.S.films[0], c = f.tracks[0].clips.find(x => x.take===id), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1) * f.pps); }, ct.id); await page.waitForTimeout(500);
  ok(/opens the window/.test(await page.evaluate(() => H3.S.f.prompt)), 'scrubbing to another clip brings that clip\'s words');
  await fr.evaluate(() => { const f = FILM.S.films[0], c = f.tracks.flatMap(tr => tr.clips).find(x => x.take==='tA' && x.at===0), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1) * f.pps); }); await page.waitForTimeout(500);
  ok(/walks to the window/.test(await page.evaluate(() => H3.S.f.prompt)), 'and back on the first clip, its own words again');
  // fixing a typo in the Shot box sticks to that clip (Jordan 2026-11-06: "when I go to another clip and back … the change has been reverted")
  await page.evaluate(() => { const pb = document.querySelector('#prompt'); pb.focus(); pb.value = H3.S.f.prompt.replace('window', 'big window'); pb.dispatchEvent(new Event('input', {bubbles:true})); pb.blur(); }); await page.waitForTimeout(300);
  await fr.evaluate(id => { const f = FILM.S.films[0], c = f.tracks[0].clips.find(x => x.take===id), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1) * f.pps); }, ct.id); await page.waitForTimeout(500);
  const away = await page.evaluate(() => H3.S.f.prompt);
  await fr.evaluate(() => { const f = FILM.S.films[0], c = f.tracks.flatMap(tr => tr.clips).find(x => x.take==='tA' && x.at===0), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1.4) * f.pps); }); await page.waitForTimeout(500);
  const back = await page.evaluate(() => ({p:H3.S.f.prompt, e:H3.S.takes.find(t => t.id==='tA').wEdit}));
  ok(/opens the window/.test(away) && /big window/.test(back.p) && back.e && Object.values(back.e).some(v => /big window/.test(v)), 'a fix typed in the Shot box stays on that clip after going to another clip and back (' + JSON.stringify(back) + ')');
  await page.evaluate(() => { delete H3.S.takes.find(t => t.id==='tA').wEdit; });
  // tapping a clip brings its words even when the playhead is somewhere else (Jordan 2026-11-06: "the current take that's selected")
  await fr.evaluate(id => { const f = FILM.S.films[0], c = f.tracks.flatMap(tr => tr.clips).find(x => x.take===id); const el = document.querySelector('.clip[data-c="' + c.id + '"]'); const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerType:'mouse', clientX:r.left + 3, clientY:r.top + r.height / 2, pointerId:1})); document.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerType:'mouse', pointerId:1})); }, ct.id); await page.waitForTimeout(400);
  ok(/opens the window/.test(await page.evaluate(() => H3.S.f.prompt)), 'tapping a clip (playhead elsewhere) puts that clip\'s words in the Shot box');
  await fr.evaluate(() => { const f = FILM.S.films[0], c = f.tracks.flatMap(tr => tr.clips).find(x => x.take==='tA' && x.at===0), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((c.at + 1.2) * f.pps); }); await page.waitForTimeout(500);
  ok(/walks to the window/.test(await page.evaluate(() => H3.S.f.prompt)), 'scrubbing off the selected clip follows the playhead again');
  await page.evaluate(() => H3FilmFollow()); await page.waitForTimeout(300);
  const fol = await page.evaluate(() => ({l:H3.S.f.loras.length, p:H3.S.f.prompt}));
  ok(fol.l===0 && /walks to the window/.test(fol.p), '↺ Follow the clip again loads the clip under the playhead (' + JSON.stringify(fol) + ')');
  // the Render tab is gone: Films is the main screen; 🎭 Use as guide is on the timeline
  ok(await page.evaluate(() => [...document.querySelectorAll('#tabs [data-tab]')].map(b => b.dataset.tab).join())==='films,poses', 'the tabs are 🎞 Films and 🧍 Poses (no 🎬 Render tab)');
  await page.evaluate(() => { window.GUIDED = null; window.H3GuideReal = window.H3Guide; window.H3Guide = id => { window.GUIDED = id; }; });
  await fr.evaluate(() => { FILM.SEL = window.C1; FILM.draw(); }); await fr.click('[data-act="guide"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.GUIDED)==='tA', '🎭 Use as guide on the timeline makes the selected clip\'s take the Motion guide');
  await page.evaluate(() => { window.H3Guide = window.H3GuideReal; });
  // a carry-on needs at least a second before it
  await fr.evaluate(() => { FILM.SEL = window.C1; const r = FILM.clipOf(FILM.S.films[0], window.C1); FILM.PH = r.c.at + 0.4; FILM.draw(); });
  const before = await page.evaluate(() => H3.S.f.first); await fr.click('[data-act="carry"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => H3.S.f.first)===before, 'carrying on from under 1 s in is refused (Motion Context needs the frames before)');
  // 🎞 Use this take on a take card in H3 Deck puts it in its clip on the timeline
  await page.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tV2'), v = JSON.parse(JSON.stringify(t)); v.id = 'tV4'; v.t = t.t + 3; v.final = {filename:'v4_00001_.mp4', subfolder:'Output_Main/H3Deck/v4', type:'output'}; H3.S.takes.unshift(v); H3.saveNow(); H3.drawAll(); });
  await fr.evaluate(c => { FILM.SEL = c; FILM.draw(); }, cid); await page.evaluate(() => H3.drawAll()); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('[data-act="useFilm"][data-t="tV4"]').click()); await page.waitForTimeout(300);
  ok(await fr.evaluate(c => FILM.clipOf(FILM.S.films[0], c).c.take, cid)==='tV4', '🎞 Use this take on a take card puts it in its clip on the timeline');
  // Clear finished keeps every take a Films timeline uses (a clip only points at its take)
  await fr.evaluate(() => FILM.save && FILM.save()); await page.waitForTimeout(300);
  const cl = await page.evaluate(() => { const used = new Set();     const F = JSON.parse(localStorage.getItem('h3edit')); F.films.forEach(f => f.tracks.forEach(tr => tr.clips.forEach(c => used.add(c.take))));
    const j = Object.assign({}, H3.S.takes.find(t => used.has(t.id)), {id:'tJunk', carry:null, redo:null, toFilm:null, state:'done'}); H3.S.takes.push(j); H3.drawTakes && H3.drawTakes();
    window.confirm = () => true; document.querySelector('#clearDone').hidden = false; document.querySelector('#clearDone').click();
    const ids = H3.S.takes.map(t => t.id); return {junk:ids.includes('tJunk'), lost:[...used].filter(id => !ids.includes(id))}; });
  ok(!cl.junk && !cl.lost.length, 'Clear finished takes old renders off the list but keeps every take on a Films timeline (' + JSON.stringify(cl) + ')');
  // Films keeps its own copy of each clip's take: a take that leaves H3 Deck's list still plays on the timeline
  const kp = await page.evaluate(() => { const F = JSON.parse(localStorage.getItem('h3edit')), id = 'tA';
    const t = H3.S.takes.find(x => x.id===id); H3.S.takes = H3.S.takes.filter(x => x.id!==id); H3.saveNow(); return {id, had:!!(F.keep || {})[id], t:!!t}; });
  await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(300);
  const kp2 = await fr.evaluate(id => { const t = FILM.takeOf(id); return {t:!!t, f:!!FILM.fileOf(t)}; }, kp.id);
  ok(kp.had && kp2.t && kp2.f, 'a timeline clip keeps its video even after its take leaves H3 Deck (' + JSON.stringify([kp, kp2]) + ')');
  await page.evaluate(id => { window.H3Guide(id); }, kp.id); await page.waitForTimeout(200);
  ok(await page.evaluate(id => !!H3.S.takes.find(x => x.id===id), kp.id), 'and using that clip again (🎭 guide, ➕, ↻) puts its take back on H3 Deck\'s list');
  // a clip whose take was cleared before Films kept copies: its video is found again on the PCs (by the take's folder name)
  await fr.evaluate(() => { const f = FILM.S.films[0], id = 't' + Date.now().toString(36) + 'zz9q'; window.LID = id; f.tracks[1].clips.push({id:'cL', take:id, in:0, out:4, dur:4, at:0}); FILM.draw(); });
  await page.waitForTimeout(1500);
  const lost = await fr.evaluate(() => { const t = FILM.takeOf(window.LID), fl = FILM.fileOf(t); return {t:!!t, fl:fl && fl.filename, p:t && t.prompt}; });
  ok(lost.fl==='h3_202611060001_zz9q_00001_.mp4' && /waves goodbye/.test(lost.p) && !/continues straight/.test(lost.p), 'a clip whose take was cleared finds its whole video (and words) on the PC again (' + JSON.stringify(lost) + ')');
  // ⏪ Lead in: new seconds before a clip, whose last frames are the clip's first frames (pinned on the 4-frame grid); only the new part is kept
  const LP = await page.evaluate(() => H3.leadPlan(120, 0, 3, 12));
  ok(LP.B===72 && LP.L % 17===5 && LP.L >= LP.B + 12 && LP.pins.every(([o, sf]) => o >= LP.B && sf===o - LP.B && (o % 4===0 || o===LP.L - 1)) && LP.pins.some(p => p[0]===LP.B && p[1]===0), '⏪ the lead-in plan pins the clip\'s first frames at the end of the window (' + JSON.stringify(LP) + ')');
  const ld0 = await fr.evaluate(() => { const f = FILM.S.films[0], c = f.tracks.flatMap(tr => tr.clips).find(x => x.take==='tA' && x.in===0); FILM.SEL = c.id; FILM.draw(); return {id:c.id, at:c.at, after:f.tracks.flatMap(tr => tr.clips).filter(x => x.at > c.at && f.tracks.find(tr => tr.clips.includes(x))===f.tracks.find(tr => tr.clips.includes(c))).map(x => [x.id, x.at])}; });
  await fr.click('[data-act="lead"]'); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => !document.querySelector('#sheet').hidden && /Lead in/.test(document.querySelector('#sheetCard').textContent)), '⏪ Lead in opens a sheet: how long before, the words, how many takes');
  await fr.evaluate(() => { document.querySelector('#ldP').value = 'she walks up the path to the window'; });
  const n7 = sent.length; await fr.click('#ldGo'); await page.waitForTimeout(1500);
  const lg = sent[n7] && sent[n7].g, ags = lg ? Object.values(lg).filter(n => n.class_type==='MiniMaxH3AddGuide' && n.inputs.image) : [], cut = lg && Object.values(lg).find(n => n.class_type==='ImageFromBatch' && n.inputs.batch_index===0 && n.inputs.length===72);
  ok(sent.length===n7 + 1 && ags.length===LP.pins.length && ags.every(n => n.inputs.frame_idx >= 72) && cut, '⏪ its graph pins the clip\'s first frames at the end and keeps only the 3 s before (' + ags.map(n => n.inputs.frame_idx).join(',') + ')');
  await fr.evaluate(() => FILM.draw()); await page.waitForTimeout(300);
  const ld1 = await fr.evaluate(o => { const f = FILM.S.films[0], all = f.tracks.flatMap(tr => tr.clips), c = all.find(x => x.id===o.id), lc = all.find(x => FILM.takeOf(x.take) && FILM.takeOf(x.take).lead); return {lead:lc && [lc.at, +(lc.out - lc.in).toFixed(2)], clip:+c.at.toFixed(2), after:o.after.map(([id]) => +all.find(x => x.id===id).at.toFixed(2))}; }, ld0);
  ok(ld1.lead && ld1.lead[0]===ld0.at && ld1.lead[1]===3 && ld1.clip===+(ld0.at + 3).toFixed(2) && ld1.after.every((x, i) => Math.abs(x - (ld0.after[i][1] + 3)) < 0.02), '⏪ the lead-in goes right before the clip, which (and what follows) moves along 3 s (' + JSON.stringify([ld0, ld1]) + ')');
  // tap the PC dots: status, queue and controls for each PC
  await page.evaluate(() => { window.scrollTo(0, 0); window.confirm = () => true; }); await page.click('#pcDots'); await page.waitForTimeout(800);
  const pcs = await page.evaluate(() => ({boxes:document.querySelectorAll('#pcSheet .pcbox').length, rows:document.querySelectorAll('#pcSheet .qj').length, txt:document.querySelector('#pcSheet').textContent, mine:[...document.querySelectorAll('#pcSheet .qj b')].map(b => b.textContent)}));
  ok(pcs.boxes===2 && pcs.rows > 0 && /Restart ComfyUI/.test(pcs.txt) && /Close ComfyUI/.test(pcs.txt) && /from H3 Deck/.test(pcs.txt), 'tapping the PC dots shows each PC with its status, its queue (H3 takes named) and Restart / Close (' + JSON.stringify({b:pcs.boxes, r:pcs.rows, m:pcs.mine.slice(0, 2)}) + ')');
  await page.click('#pcSheet [data-pcon2="1"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => H3.S.pcs[1].on===false), 'its switch stops a PC getting new takes');
  await page.click('#pcSheet [data-pcon2="1"]'); await page.waitForTimeout(200);
  const q0 = QP.length; await page.click('#pcSheet [data-qx]'); await page.waitForTimeout(500);
  ok(QP.length===q0 + 1 && (QP[q0].body.delete || QP[q0].body.prompt_id), '✕ on a job takes it out of that PC\'s line (' + JSON.stringify(QP[q0] && QP[q0].body) + ')');
  await page.screenshot({path:path.join(__dirname, 'pcs.png')}); await page.evaluate(() => document.querySelector('#sheet [data-close]').click());
  await page.screenshot({path:path.join(__dirname, 'carry.png')});
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
