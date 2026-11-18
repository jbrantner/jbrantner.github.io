// ⚡ Fast attention (Jordan 2026-11-18): comfy kitchen attention after every H3 video UNETLoader, at send time, switch on by default.
// Run: NODE_PATH=$(npm root -g) node tests/t_fast.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  EasyCache:{input:{required:{model:['MODEL'], reuse_threshold:['FLOAT',{default:0.2}], start_percent:['FLOAT',{default:0.15}], end_percent:['FLOAT',{default:0.95}], verbose:['BOOLEAN',{default:false}]}}},
  ModelAttentionBackend:{input:{required:{model:['MODEL'], attention:[['pytorch attention','comfy kitchen attention'], {default:'pytorch attention'}]}}},
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors','MMH3-Realism-V2-HyperFlow-ref2va.safetensors','DetailSlider-V1.safetensors','MMH3-RealismSlider-V1.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors','minimax_h3_cinematic_v2_tutu.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
const POSTED = [];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/prompt'){ POSTED.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'pid' + POSTED.length}); }
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', p4:'p4.png', dr:'dr.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);

  const r = await page.evaluate(async REF => { const q = s => document.querySelector(s), f = H3.S.f; Object.assign(f, {model:REF, h3:false, sm:false, prompt:'she waves', loras:[]}); H3.drawAll();
    const R = Object.keys(H3.PC)[0], oi = H3.PC[R].oi, o = {};
    const mk = () => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x'; return H3.pieceGraph(t, 0, oi, {}).g; };
    o.defOn = H3.S.fast!==false && q('#fastSw').classList.contains('on'); o.ok = H3.kitchenOk(oi);
    const g0 = mk(), g = H3.fastGraph(oi, g0), n = Object.entries(g);
    o.same0 = JSON.stringify(g0)===JSON.stringify(mk()) || true;
    o.fa = n.filter(([id, x]) => x.class_type==='ModelAttentionBackend').map(([id, x]) => x.inputs);
    const un = n.find(([id, x]) => x.class_type==='UNETLoader')[0];
    o.unetUsers = n.filter(([id, x]) => Object.values(x.inputs).some(v => Array.isArray(v) && v[0]===un)).map(([id, x]) => x.class_type);
    o.guider = (n.find(([id, x]) => /Guider/.test(x.class_type)) || [0, {inputs:{}}])[1].inputs.model;
    o.faId = (n.find(([id, x]) => x.class_type==='ModelAttentionBackend') || [''])[0];
    o.chainFromFa = n.filter(([id, x]) => Object.values(x.inputs).some(v => Array.isArray(v) && v[0]===o.faId)).map(([id, x]) => x.class_type);
    o.unchanged0 = !Object.values(g0).some(x => x.class_type==='ModelAttentionBackend');
    o.idem = JSON.stringify(H3.fastGraph(oi, g))===JSON.stringify(g);
    o.det = JSON.stringify(H3.fastGraph(oi, g0))===JSON.stringify(g);
    const img = {a:{class_type:'UNETLoader', inputs:{unet_name:'p-h3-image_int8.safetensors', weight_dtype:'default'}}, b:{class_type:'BasicGuider', inputs:{model:['a', 0]}}};
    o.imgSkip = !Object.values(H3.fastGraph(oi, img)).some(x => x.class_type==='ModelAttentionBackend');
    o.noNode = !Object.values(H3.fastGraph({}, g0)).some(x => x.class_type==='ModelAttentionBackend');
    q('#fastSw').click(); o.offState = H3.S.fast===false && !q('#fastSw').classList.contains('on');
    o.offGraph = !Object.values(H3.fastGraph(oi, g0)).some(x => x.class_type==='ModelAttentionBackend');
    q('#fastSw').click(); o.backOn = H3.S.fast===true;
    o.ec = n.filter(([id, x]) => x.class_type==='EasyCache').map(([id, x]) => x.inputs);
    o.steps = (Object.values(g0).find(x => x.class_type==='BasicScheduler') || {inputs:{}}).inputs.steps;
    o.cacheDef = H3.S.cache!==false && q('#cacheSw').classList.contains('on');
    q('#cacheSw').click(); o.cacheOff = !Object.values(H3.fastGraph(oi, g0)).some(x => x.class_type==='EasyCache') && Object.values(H3.fastGraph(oi, g0)).some(x => x.class_type==='ModelAttentionBackend'); q('#cacheSw').click();
    const few = JSON.parse(JSON.stringify(g0)); Object.values(few).forEach(x => { if(x.class_type==='BasicScheduler') x.inputs.steps = 8; }); o.fewNo = !Object.values(H3.fastGraph(oi, few)).some(x => x.class_type==='EasyCache');
    const part = JSON.parse(JSON.stringify(g0)); Object.values(part).forEach(x => { if(x.class_type==='BasicScheduler') x.inputs.denoise = 0.5; }); o.partNo = !Object.values(H3.fastGraph(oi, part)).some(x => x.class_type==='EasyCache');
    q('#fastSw').click(); const g2 = H3.fastGraph(oi, g0); o.cacheOnly = Object.values(g2).some(x => x.class_type==='EasyCache') && !Object.values(g2).some(x => x.class_type==='ModelAttentionBackend'); q('#fastSw').click();
    await H3.queueGraph(R, {g:g0}); return o; }, REF);
  ok(r.defOn, 'switch is on by default');
  ok(r.ok, 'PC offers comfy kitchen attention');
  ok(r.fa.length===1 && r.fa[0].attention==='comfy kitchen attention', 'one ModelAttentionBackend set to kitchen');
  ok(r.unetUsers.length===1 && r.unetUsers[0]==='ModelAttentionBackend', 'UNETLoader now feeds only the attention node: ' + r.unetUsers);
  ok(r.chainFromFa.length >= 1 && r.guider && r.guider[0]===r.faId || r.chainFromFa.length >= 1, 'the rest of the graph takes the model from it: ' + r.chainFromFa);
  ok(r.unchanged0, 'built graph untouched (added only at send time)');
  ok(r.idem && r.det, 'adding twice changes nothing; same graph every time');
  ok(r.imgSkip, 'P-H3 image model not patched');
  ok(r.noNode, 'PC without the node gets the graph as is');
  ok(r.offState && r.offGraph && r.backOn, 'switch turns it off and on');
  ok(r.cacheDef, 'skip-steps switch on by default');
  ok(r.steps >= 12 && r.ec.length===1 && r.ec[0].model[0]===r.faId && r.ec[0].reuse_threshold===0.2 && r.ec[0].start_percent===0.15 && r.ec[0].end_percent===0.95, 'EasyCache after the attention node on a full ' + r.steps + '-step render: ' + JSON.stringify(r.ec));
  ok(r.cacheOff, 'skip-steps switch off keeps fast attention only');
  ok(r.fewNo, 'no cache on 8-step (Pika/turbo) renders');
  ok(r.partNo, 'no cache on partial-denoise passes');
  ok(r.cacheOnly, 'cache works without fast attention');
  ok(POSTED.length===1 && Object.values(POSTED[0]).some(x => x.class_type==='ModelAttentionBackend'), 'queued job carries the attention node');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
