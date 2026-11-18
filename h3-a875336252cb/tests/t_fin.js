// 🔀 Finish on PIKA (Jordan 2026-11-18: "does it do anything weird if pika is using 20 steps"): each model on its own schedule, same handover point,
// PIKA gets PIKA's boost mix. Run: NODE_PATH=$(npm root -g) node tests/t_fin.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors','MMH3-Realism-V2-HyperFlow-ref2va.safetensors','DetailSlider-V1.safetensors','MMH3-RealismSlider-V1.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors','minimax_h3_cinematic_v2_tutu.safetensors','MysticXXX_MMH3-V5-ref2va.safetensors','H3_Better_NSFW_Motion_V1.safetensors','Minimax3_Boob Physics_v1.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'SplitSigmas','DisableNoise','LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /ref2va/.test(k));
  page.on('dialog', d => d.accept());

  const r = await page.evaluate(REF => { const f = H3.S.f, R = Object.keys(H3.PC)[0], oi = H3.PC[R].oi, o = {};
    Object.assign(f, {model:REF, h3:false, sm:false, prompt:'she waves', loras:[], boost:true, finOn:true, finAt:0.5, steps:20}); H3.drawAll();
    const graph = () => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
      const g = H3.pieceGraph(t, 0, oi, {}).g, ref = v => v && g[v[0]]; const n = Object.values(g), sas = n.filter(x => x.class_type==='SamplerCustomAdvanced');
      const sig = s => { const sp = ref(s.inputs.sigmas), bs = ref(sp.inputs.sigmas); return {half:s.inputs.sigmas[1], step:sp.inputs.step, steps:bs.inputs.steps, unet:(() => { let m = ref(bs.inputs.model); while(m && m.class_type!=='UNETLoader') m = ref(m.inputs.model); return m && m.inputs.unet_name; })()}; };
      const lorasOn = s => { const gd = ref(s.inputs.guider); let m = ref(gd.inputs.model), out = []; while(m && m.class_type!=='UNETLoader'){ if(m.class_type==='LoraLoaderModelOnly') out.push([m.inputs.lora_name, m.inputs.strength_model]); m = ref(m.inputs.model); } return {unet:m && m.inputs.unet_name, los:out}; };
      return {t, n:sas.length, a:sig(sas[0]), b:sig(sas[1]), la:lorasOn(sas[0]), lb:lorasOn(sas[1])}; };
    o.half = graph(); f.finAt = 0.375; o.three = graph(); f.finAt = 0.75; o.q3 = graph(); f.finAt = 0.6; o.old = graph();
    f.finAt = 0.5; H3.drawAll(); o.note = document.querySelector('#finAtNote').textContent;
    o.plans = [[0.5, 4], [0.375, 20], [0.5, 8]].map(([at, st]) => H3.finPlan({fin:{at}}, st));
    return o; }, REF);
  const H = r.half;
  ok(H.n===2, 'two samplers');
  ok(/ref2va/.test(H.a.unet) && H.a.steps===20 && H.a.step===10 && H.a.half===0, 'vanilla: first 10 of its own 20 steps ' + JSON.stringify(H.a));
  ok(/prismPIKA/.test(H.b.unet) && H.b.steps===8 && H.b.step===4 && H.b.half===1, 'PIKA: its own last 4 of 8 steps (was 10 of 20) ' + JSON.stringify(H.b));
  { const a = Object.fromEntries(r.half.la.los), b = Object.fromEntries(r.half.lb.los);
    ok(a['DetailSlider-V1.safetensors']===0.75 && b['DetailSlider-V1.safetensors']===0.5 && b['MMH3-Realism-V2-HyperFlow-ref2va.safetensors']===0.35 && b['minimax_h3_cinematic_v2_tutu.safetensors']===0.35, 'vanilla keeps its boost mix, PIKA gets the lighter PIKA mix ' + JSON.stringify(r.half.lb.los)); }
  ok(r.three.a.steps===24 && r.three.a.step===9 && r.three.b.step===3 && r.three.b.steps===8, '3/8 handover: vanilla 9 of 24, PIKA last 5 of 8 ' + JSON.stringify([r.three.a, r.three.b]));
  ok(r.q3.a.steps===20 && r.q3.a.step===15 && r.q3.b.step===6, '3/4 handover: vanilla 15 of 20, PIKA last 2 of 8');
  ok(r.old.b.step===5 && r.old.a.step * 8 === r.old.a.steps * 5, 'an old 0.6 setting snaps to 5/8, both models meet at the same point ' + JSON.stringify([r.old.a, r.old.b]));
  ok(JSON.stringify(r.plans.map(p => [p.k, p.s1, p.p]))==='[[2,4,4],[9,24,5],[4,8,4]]', 'turbo 4 steps and 8-step plans ' + JSON.stringify(r.plans));
  ok(r.note==='10 of 20 steps on this model, then PIKA does its own last 4 of 8', 'note: ' + r.note);
  // 📺 a take with 🔀 Finish on PIKA ({at}) is NOT sent to the 4K finish (Jordan 2026-11-18 got a 4K 48 fps copy of a plain take)
  const K = await page.evaluate(() => { const R = Object.keys(H3.PC)[0], t = H3.snapshot(); Object.assign(t, {id:'tK', t:Date.now(), pc:R, state:'done', fin:{at:0.5}, final:{filename:'k_00001_.mp4', subfolder:'Output_Render/H3Deck/k', type:'output'}, pieces:[{state:'done'}]});
    H3.S.takes.unshift(t); H3.finStart(t); const before = t.k4 || null; H3.drawAll();
    const btn = !!document.querySelector('[data-act="k4"][data-t="tK"]'); H3.k4Go(t);
    const after = t.k4 && {state:t.k4.state, fps:t.k4.fps}; const btn2 = !!document.querySelector('[data-act="k4"][data-t="tK"]');
    H3.S.takes.shift(); H3.drawAll(); return {before, fin:H3.finOf({fin:{at:0.5}}), btn, after, btn2}; });
  ok(!K.before && !K.fin, 'Finish on PIKA alone makes no 4K copy: ' + JSON.stringify(K));
  ok(K.btn && K.after && K.after.state==='wait' && K.after.fps===60 && !K.btn2, '📺 Make a 4K 60 copy in the take ⋯ starts it as a last pass, then the button goes: ' + JSON.stringify(K));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
