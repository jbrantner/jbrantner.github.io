// 🔗 ✨ High quality on one clip carries on from the ✨ of the clip before when the two are joined ⛓ (not ✂), on the same PC, from that
// ✨'s saved ending (H3 Motion Context); a ✂ cut or a clip before with no ✨ starts fresh. (fake ComfyUI, nothing renders)
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_hqchain.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8039);
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
  await page.goto('http://127.0.0.1:8039/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => { const mk = (id, extra) => Object.assign({id, t:Date.now(), pc:R, model:m, turbo:true, loras:[], w:640, h:352, seed:1, name:'h3_' + id, dir:'H3Deck/h3_' + id, prompt:'she walks to the window', seconds:5, imgs:[], vids:[], auds:[], follow:[],
      pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'she walks to the window', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}}], state:'done', final:{filename:'h3_' + id + '_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}}, extra || {});
    H3.S.takes.unshift(mk('tA')); H3.S.takes.unshift(mk('tB', {carry:{src:'tA', at:5, own:true}})); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /hybrid/.test(k)) || fam[0]]);
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  await fr.waitForFunction(() => window.FILM && FILM.S && FILM.takeOf('tB')).catch(() => {});
  const done = id => page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); Object.assign(t, {state:'done', upStage:'done', final:{filename:t.name + '_00001_.mp4', subfolder:'Output_Render/H3Deck/' + t.name, type:'output'}}); t.pieces.forEach(p => { p.state = 'done'; p.file = p.file || t.final; }); H3.saveNow(); }, id);
  const hqs = () => page.evaluate(() => H3.S.takes.filter(x => x.redo && x.redo.qp).reverse().map(t => ({id:t.id, src:t.redo.src, ch:t.up.chain, pc:t.pc, state:t.state})));
  // two clips joined ⛓ (A 0-5 s, B 5-8 s) and a third after a ✂ cut
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}], pps:24}; FILM.S.films.unshift(f); FILM.addClip(f, FILM.takeOf('tA'), 0); const b = FILM.addClip(f, FILM.takeOf('tB'), 0); b.in = 0; b.out = 3;
    const c = FILM.addClip(f, FILM.takeOf('tA'), 0); c.at = 8; c.cut = true; FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  const sheet = i => fr.evaluate(async i => { const f = FILM.S.films[0], tr = f.tracks[0], c = tr.clips.slice().sort((a, b) => a.at - b.at)[i]; FILM.hqSheet(f, tr, c); await new Promise(z => setTimeout(z, 150)); return document.querySelector('#sheetCard').textContent; }, i);
  const go = () => fr.evaluate(async () => { document.querySelector('#hqGo').click(); await new Promise(z => setTimeout(z, 2500)); });
  // B before A has a ✨: a tip, and nothing to carry on from
  const s0 = await sheet(1);
  ok(/Tip: ✨ the clip before first/.test(s0) && !/Carries on from the ✨/.test(s0), 'clip B (joined ⛓) with no ✨ before it: the sheet says to ✨ the clip before first');
  // ✨ on A: it keeps its ending (a chain of its own, index 0, saved at 1)
  await sheet(0); await go(); let H = await hqs();
  const A = H[0];
  ok(H.length===1 && A.ch && /hqctx_/.test(A.ch.dir) && A.ch.idx===0 && !A.ch.prev, '✨ on clip A keeps its ending for the clip after: ' + JSON.stringify(A && A.ch));
  // while A's ✨ still renders, B's sheet says it carries on from it (and waits)
  const s1 = await sheet(1);
  ok(/Carries on from the ✨ version of the clip before/.test(s1) && /starts once that one is done/.test(s1), 'B\'s sheet: carries on from A\'s ✨ (waits while it renders)');
  await done(A.id); await page.waitForTimeout(300);
  // A's ✨ takes A's place on the timeline; then ✨ on B carries on from it: same folder, index 1, same PC
  const sw = await fr.evaluate(() => FILM.S.films[0].tracks[0].clips.slice().sort((a, b) => a.at - b.at).map(c => c.take));
  await sheet(1); await go(); H = await hqs(); const B = H[1];
  ok(B && B.ch && B.ch.prev===A.id && B.ch.dir===A.ch.dir && B.ch.idx===1 && B.pc===A.pc, '✨ on B carries on from A\'s ✨ (same folder, next index, same PC): ' + JSON.stringify({sw, B}));
  // its graph: Motion Context from A's saved ending (index 1), and it saves its own (index 2) for the clip after
  const G = await page.evaluate(([R, id]) => { const g = Object.values(H3.upGraph(H3.S.takes.find(x => x.id===id), H3.PC[R].oi, {}).g), C = c => g.filter(n => n.class_type===c);
    return {mc:C('MiniMaxH3MotionContext').length, ld:C('MiniMaxH3MotionContextLoadLatent').map(n => [n.inputs.clip_index, n.inputs.latent_path]), sv:C('MiniMaxH3MotionContextSaveLatent').map(n => n.inputs.clip_index)}; }, [R, B.id]);
  ok(G.mc===1 && G.ld.length===1 && G.ld[0][0]===1 && G.ld[0][1].endsWith(A.ch.dir) && G.sv[0]===2, 'B\'s graph loads A\'s ending and saves its own: ' + JSON.stringify(G));
  // once A's ✨ has taken A's place on the timeline, B still carries on from it
  const PS = await fr.evaluate(id => { const f = FILM.S.films[0], tr = f.tracks[0], cs = tr.clips.slice().sort((a, b) => a.at - b.at), t = FILM.takeOf(id);
    Object.assign(cs[0], {take:id, in:t.redo.cin, out:t.redo.cout}); return FILM.hqPrevCtx(tr, cs[1]); }, A.id);
  ok(PS && PS.prev===A.id && PS.idx===1 && PS.dir===A.ch.dir, 'with A\'s ✨ in A\'s place, B still carries on from it: ' + JSON.stringify(PS));
  // the clip after the ✂ cut starts fresh
  await done(B.id); await page.waitForTimeout(300);
  const s2 = await sheet(2); await go(); H = await hqs(); const C3 = H[2];
  ok(!/Carries on from the ✨/.test(s2) && C3 && C3.ch && !C3.ch.prev && C3.ch.dir!==A.ch.dir && C3.ch.idx===0, 'after a ✂ cut the ✨ starts fresh: ' + JSON.stringify(C3 && C3.ch));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
