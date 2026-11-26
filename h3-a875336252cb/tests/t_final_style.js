// 🎬 Reel's final pass keeps the 2D look (Jordan 2026-11-22: "Does it keep the 2d settings and everything?"). Built from t_ultima's set-up.
// Ultima NSFW Hybrid (Civitai 3047487) in place of PIKA in the vanilla → finish flow (Jordan 2026-11-22: "I want the level 120 to replace
// Pika in its flow of starting with vanilla Minimax"): H3 Reference → Ultima finish button, toggles back to PIKA.
// Run: NODE_PATH=$(npm root -g) node tests/t_ultima.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const ULTF = 'Ultima NSFW Lv120 Hybrid pruned Turbo int8-convrot_.safetensors';
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', ULTF]], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors','MMH3-Realism-V2-HyperFlow-ref2va.safetensors','DetailSlider-V1.safetensors','MMH3-RealismSlider-V1.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'SplitSigmas','DisableNoise','LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8049);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const handle = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', handle);
  await page.addInitScript(r => { localStorage.clear(); window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R); // bare bones (no H3_FULL)
  await page.goto('http://127.0.0.1:8049/index.html');
  await page.waitForFunction(() => H3.families().length > 2, null, {timeout:20000});
  const r = await page.evaluate(() => { const o = {}, f = H3.S.f, R = Object.keys(H3.PC)[0], oi = H3.PC[R].oi;
    o.u = H3.FAM_ULT(true); o.list = H3.modelList().map(x => x.label);
    const btn = document.querySelector('[data-mpk="combou"]'); o.btnShown = btn && !btn.hidden;
    const graph = () => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
      const g = H3.pieceGraph(t, 0, oi, {}).g, n = Object.values(g), ref = v => v && g[v[0]], sas = n.filter(x => x.class_type==='SamplerCustomAdvanced');
      const tail = sas.find(s => ref(s.inputs.noise).class_type==='DisableNoise'); let m = tail && ref(ref(tail.inputs.guider).inputs.model), los = 0;
      while(m && m.class_type!=='UNETLoader'){ if(m.class_type==='LoraLoaderModelOnly') los++; m = ref(m.inputs.model); }
      return {fin:t.fin, n:sas.length, tailUnet:m && m.inputs.unet_name, tailLoras:los, smp:tail && ref(tail.inputs.sampler).inputs.sampler_name, stg:Object.values(H3.stagesOf(g))}; };
    btn.click(); o.model = f.model; o.finOn = f.finOn; o.finU = f.finU; o.sum = document.querySelector('#modelSum').textContent; o.ug = graph();
    o.why = H3.canRun ? null : null;
    document.querySelector('[data-mpk="combo"]').click(); o.back = f.finU; o.pg = graph();
    document.querySelector('[data-mpk="combou"]').click(); H3.drawAll(); o.kept = f.finU===true && f.finOn===true;
    // 🎯 a LoRA on the vanilla half only
    f.loras = [{name:'AFK_Claude_minimaxh3.safetensors', str:0.8, words:''}]; H3.drawAll();
    const on = () => (document.querySelector('#loraList [data-lf].on') || {}).textContent || '';
    o.lfShown = !!document.querySelector('#loraList [data-lf="1"]'); o.lfBoth = /Both halves/.test(on()); document.querySelector('#loraList [data-lf="1"]').click(); o.lfOn = f.loras[0].first===true && /Vanilla only/.test(on());
    document.querySelector('#loraList [data-lf="1"]').click(); o.lfStay = f.loras[0].first===true; document.querySelector('#loraList [data-lf="0"]').click(); o.lfOff = !f.loras[0].first; document.querySelector('#loraList [data-lf="1"]').click();
    o.mpCol = getComputedStyle(document.querySelector('#modelPick')).flexDirection;
    const chains = () => { const t = H3.snapshot(); t.id = 'l' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/l'; t.name = 'l'; const g = H3.pieceGraph(t, 0, oi, {}).g, ref = v => v && g[v[0]];
      return Object.values(g).filter(x => x.class_type==='SamplerCustomAdvanced').map(s => { let m = ref(ref(s.inputs.guider).inputs.model), los = []; while(m && m.class_type!=='UNETLoader'){ if(m.class_type==='LoraLoaderModelOnly') los.push(m.inputs.lora_name); m = ref(m.inputs.model); } return los.includes('AFK_Claude_minimaxh3.safetensors'); }); };
    o.first = chains(); f.loras[0].first = false; o.both = chains();
    document.querySelector('#loraList [data-lf="2"]').click(); o.f2On = f.loras[0].fin2===true && !f.loras[0].first && /Finish only/.test(on()); o.f2 = chains(); o.f2Snap = H3.snapshot().loras[0].fin2;
    document.querySelector('#loraList [data-lf="1"]').click(); o.f2Off = !f.loras[0].fin2 && f.loras[0].first===true;
    // 🎚 vanilla ↔ finish slider
    const mi = document.querySelector('#finMixIn'); o.mixShown = !document.querySelector('#finMix').hidden;
    mi.value = 0.25; mi.dispatchEvent(new Event('input', {bubbles:true})); o.mixAt = f.finAt; o.mixTxt = document.querySelector('#finMixV').textContent;
    { const t = H3.snapshot(); t.id = 'm1'; t.pc = R; t.seed = 3; t.dir = 'H3Deck/m'; t.name = 'm'; const g = H3.pieceGraph(t, 0, oi, {}).g; o.mixSplit = Object.values(g).filter(x => x.class_type==='SplitSigmas').map(x => x.inputs.step); }
    H3.drawAll(); o.mixKept = f.finAt; mi.value = 0.5; mi.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('[data-mpk="pika"]').click(); o.lfPika = !document.querySelector('#loraList [data-lf]'); o.pikaSnap = H3.snapshot().loras[0].first;
    return o; });
  ok(/ultima_nsfw_lv120/.test(r.u), 'Ultima Lv120 is found on the PC: ' + r.u);
  ok(r.list.length===2 && !r.list.some(l => /Ultima/.test(l)), 'bare bones: Ultima is not its own model, only the finisher: ' + r.list.join(' | '));
  ok(r.btnShown, 'the H3 Reference → Ultima finish button shows when a PC has Ultima');
  ok(/ref2va/.test(r.model) && r.finOn && r.finU, 'picking it: vanilla H3 Reference with Finish on, Ultima as the finisher');
  ok(/Ultima/.test(r.sum), 'the Model summary names it: ' + r.sum);
  ok(r.ug.fin && r.ug.fin.u && r.ug.n===2 && r.ug.tailUnet===ULTF && r.ug.tailLoras===0 && r.ug.smp==='res_multistep' && r.ug.stg.includes('Ultima'), 'vanilla first, Ultima samples the tail, no boost LoRAs ' + JSON.stringify(r.ug));
  ok(!r.back && r.pg.n===2 && /PIKA/.test(r.pg.tailUnet) && r.pg.tailLoras > 0 && !r.pg.fin.u && r.pg.stg.includes('PIKA'), 'switching back: PIKA finishes again with its boost LoRAs ' + JSON.stringify(r.pg));
  ok(r.kept, 'bare bones keeps the Ultima finish picked');
  ok(r.lfShown && r.lfBoth && r.lfOn && r.lfStay && r.lfOff, 'two lit buttons on each LoRA in the finish flow: Both halves / 🎯 Vanilla only (tapping the lit one keeps it)');
  ok(r.mpCol==='column', 'the three model choices stack instead of overlapping');
  ok(r.first[0]===true && r.first[1]===false, 'vanilla half only: the LoRA is on vanilla, not on the finisher ' + JSON.stringify(r.first));
  ok(r.both[0]===true && r.both[1]===true, 'both halves: the LoRA is on both ' + JSON.stringify(r.both));
  ok(r.f2On && r.f2Snap===true && r.f2[0]===false && r.f2[1]===true && r.f2Off, '🏁 finish only: the LoRA is on the finisher, not the first model; 🎯 switches back ' + JSON.stringify([r.f2On, r.f2Snap, r.f2, r.f2Off]));
  ok(r.mixShown && r.mixAt===0.25 && /vanilla 2 · Ultima 6 of 8/.test(r.mixTxt) && r.mixKept===0.25, '🎚 slider: filled part = vanilla, left = more Ultima (vanilla 2, Ultima 6 of 8), kept by bare bones: ' + JSON.stringify([r.mixShown, r.mixAt, r.mixTxt, r.mixKept]));
  ok(r.mixSplit.includes(2), 'the render hands over at 2 of 8 ' + JSON.stringify(r.mixSplit));
  ok(r.lfPika && r.pikaSnap===undefined, 'PRISM PIKA alone: no switch, the LoRA works as before');
  // 🎞 Reel's engine (Jordan 2026-11-22: "Could we add that one to reel?"): Ultima finish as its own pick, kept over H3 Deck's form
  const pe = await br.newPage({viewport:{width:390, height:844}}); pe.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pe.route(R + '/**', handle);
  await pe.addInitScript(r => { localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify({f:{finU:false}, tsav:Date.now()})); window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await pe.goto('http://127.0.0.1:8049/index.html?engine=1');
  await pe.waitForFunction(() => window.H3Engine && H3Engine.models().length > 2, null, {timeout:20000});
  const e = await pe.evaluate(async () => { const E = H3Engine, o = {}; E.setAttrs({}, {}, {}, '2d');
    try{ await E.make({words:'she waves in the kitchen', n:1}); }catch(err){} const t = H3.S.takes.find(x => /waves in the kitchen/.test(x.prompt || ''));
    t.state = 'done'; t.pieces = [{start:0, gen:121, deliv:121, ctx:0, prompt:t.prompt, state:'done', file:{filename:'a.mp4', subfolder:'Output_Render/H3Deck/x', type:'output'}}];
    const r = await E.final({clips:[{take:t.id, a:0, b:5}]}); const u = H3.S.takes.find(x => x.id===(r.ids || [])[0]); o.look = u.up.look;
    const oi = await (await fetch(u.pc + '/object_info')).json(); const g = upGraph(u, oi, {}); const g2 = g.g || g; o.texts = Object.values(g2).map(n => n.inputs && n.inputs.prompt).filter(x => typeof x==='string').map(x => x.slice(0, 1200));
    return o; });
  ok(e.look==='anime', "Reel's 🎬 final pass on a 2D clip uses the anime pixel upscaler");
  ok(e.texts.some(x => /soft painterly 2D illustration/.test(x) && /waves in the kitchen/i.test(x)), 'and keeps the 2D style line in its words (no pictures in the clip) ' + JSON.stringify(e.texts));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
