// ⇄ a free PC takes a waiting ✨ pass too (Jordan 2026-11-14: "Shouldn't main be taking this extra Render project?"): a ✨ queued behind
// another job on Render moves to an empty Main; one that carries on from a finished ✨ reads that ✨'s saved ending from Render's folder;
// one that carries on from a ✨ still rendering stays. Two fake ComfyUIs (nothing renders). Run: NODE_PATH=$(npm root -g) node tests/t_moveup.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8041);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], views = [], QP = [], DEL = [];
  const PCS = {[R]:{name:'Render', line:[], run:false, dels:[], n:0}, [M]:{name:'Main', line:[], run:false, dels:[], n:0}};
  for(const base of [R, M]) await page.route(base + '/**', async rt => { const P = PCS[base], u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(rt.request().method()==='OPTIONS') return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*'}, body:''});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST'){ const b = JSON.parse(rt.request().postData() || '{}'); if(b.delete){ P.dels.push(...b.delete); P.line = P.line.filter(id => !b.delete.includes(id) || (P.run && id===P.line[0])); } return J({}); }
    if(p==='/queue'){ const run = P.run && P.line.length ? [[0, P.line[0]]] : []; return J({queue_running:run, queue_pending:P.line.slice(run.length).map((id, i) => [i + 1, id])}); }
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_' + P.name, images:[]});
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/mp4', headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    if(p==='/prompt'){ const pid = P.name[0] + (++P.n); P.line.push(pid); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(([r, m]) => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1.26}]; }, [R, M]);
  await page.goto('http://127.0.0.1:8041/index.html');
  await page.waitForFunction(() => H3.families().length > 0 && H3.PC['http://main.test'] && H3.PC['http://main.test'].oi && H3.PC['http://main.test'].oi.CLIPLoader && H3.PC['http://render.test'].oi && H3.PC['http://render.test'].oi.CLIPLoader, null, {timeout:20000});
  // Render: running one job (X1), with a ✨ pass (R-queued) behind it; the ✨ before it in the chain is done on Render; Main is empty
  PCS[R].line = ['X1', 'U1']; PCS[R].run = true;
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, mdl]) => { H3.S.f.where = 'both';
    const base = (id, extra) => Object.assign({id, t:Date.now(), pc:R, model:mdl, turbo:false, loras:[], w:864, h:480, seed:1, name:'h3_' + id, dir:'H3Deck/h3_' + id, prompt:'her eyes pulse', seconds:4.9, imgs:[], vids:[], auds:[], follow:[],
      pieces:[{start:0, gen:118, deliv:118, ctx:0, prompt:'her eyes pulse', state:'done', file:null}], state:'done', final:{filename:'h3_' + id + '_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}}, extra || {});
    const up = (chain, s0) => ({scale:1.5, rep:'light', den:0.9, clean:0.8, look:'live', str:0.8, unet:'', qw:'', refs:false, prompt:'her eyes pulse', crop:{s0:0, L:118, pad:0, F:118}, chain});
    H3.S.takes.unshift(base('src5'), base('src6'));
    H3.S.takes.unshift(base('hq5', {redo:{src:'src5', qp:true, big:true, a:0, b:118, s0:0, L:118, F:118}, up:up({dir:'H3Deck/hqctx_a', idx:0, prev:'', pc:R}), upStage:'done', w:1280, h:704}));
    H3.S.takes.unshift(base('hq6', {state:'working', redo:{src:'src6', qp:true, big:true, a:0, b:118, s0:0, L:118, F:118}, up:up({dir:'H3Deck/hqctx_a', idx:1, prev:'hq5', pc:R, pre:35, L2:153}), upStage:'queued', upPid:'U1', smoothed:null, final:{filename:'h3_src6_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_src6', type:'output'}}));
    // and the next clip's ✨, waiting for hq6 before it queues: it follows hq6
    H3.S.takes.unshift(base('hq7', {state:'working', redo:{src:'src6', qp:true, big:true, a:0, b:118, s0:0, L:118, F:118}, up:up({dir:'H3Deck/hqctx_a', idx:2, prev:'hq6', pc:R, pre:35, L2:153}), upStage:'start'}));
    H3.saveNow(); }, [R, fam.find(k => /ref2va|official/i.test(k)) || fam[0]]);
  await page.evaluate(() => H3.rebalance()); await page.waitForTimeout(1500); // (the app's own tick may be moving it at the same time)
  const n = PCS[M].line.length;
  const T = await page.evaluate(() => ['hq6', 'hq7'].map(id => { const t = H3.S.takes.find(x => x.id===id); return {id, pc:t.pc, st:t.upStage, pid:t.upPid, ch:t.up.chain}; }));

  ok(n >= 1 && T[0].pc===M && PCS[R].dels.includes('U1') && !PCS[R].line.includes('U1'), 'the waiting ✨ pass moved from Render\'s line to the free Main: ' + JSON.stringify(T[0]));
  ok(T[0].ch.from===R && T[0].ch.pc===M, 'it remembers its ✨ before was made on Render');
  ok(T[1].pc===M && T[1].ch.pc===M && !T[1].ch.from, 'the next clip\'s ✨ (waiting for it) follows it to Main: ' + JSON.stringify(T[1]));
  // the graphs: hq6 on Main reads hq5's ending from Render's folder; hq7 reads hq6's from Main's
  const G = await page.evaluate(M => ['hq6', 'hq7'].map(id => Object.values(H3.upGraph(H3.S.takes.find(x => x.id===id), H3.PC[M].oi, {}).g).filter(n => n.class_type==='MiniMaxH3MotionContextLoadLatent').map(n => n.inputs.latent_path)[0]), M);
  ok(/^Output_Render\/H3Deck\/hqctx_a$/.test(G[0]) && /^Output_Main\/H3Deck\/hqctx_a$/.test(G[1]), 'hq6 loads hq5\'s ending from Render\'s folder, hq7 loads hq6\'s from Main\'s: ' + JSON.stringify(G));
  // a ✨ that carries on from one still rendering stays put
  PCS[M].line = []; PCS[R].line = ['X1', 'U3'];
  await page.evaluate(R => { const t = H3.S.takes.find(x => x.id==='hq7'); Object.assign(t, {pc:R, upStage:'queued', upPid:'U3'}); t.up.chain.pc = R; const h6 = H3.S.takes.find(x => x.id==='hq6'); h6.state = 'working'; h6.upStage = 'running'; }, R);
  const n2 = await page.evaluate(() => H3.rebalance());
  ok(n2===0 && PCS[R].line.includes('U3'), 'a ✨ carrying on from one still rendering stays where its ending will be');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0); })();
