// Ultima NSFW Hybrid (Civitai 3047487) as a third bare-bones model beside PRISM PIKA (Jordan 2026-11-22: "have it swap out for pika as an
// option so I can test it myself"): the creator's 6 steps, er_sde / beta, no boost LoRAs, no 🔀 Finish on PIKA. PIKA unchanged.
// Run: NODE_PATH=$(npm root -g) node tests/t_ultima.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const ULTF = 'Ultima NSFW Lv120 Hybrid pruned Turbo int8-convrot_.safetensors';
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors', ULTF]], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['MMH3-Realism-V2-HyperFlow-ref2va.safetensors','DetailSlider-V1.safetensors','MMH3-RealismSlider-V1.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors']], strength_model:['FLOAT', {default:1}]}}},
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
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R); // bare bones (no H3_FULL)
  await page.goto('http://127.0.0.1:8049/index.html');
  await page.waitForFunction(() => H3.families().length > 2, null, {timeout:20000});
  const r = await page.evaluate(() => { const o = {}, f = H3.S.f, R = Object.keys(H3.PC)[0], oi = H3.PC[R].oi;
    o.u = H3.FAM_ULT(); o.list = H3.modelList().map(x => x.label);
    const btn = document.querySelector('[data-mpk="ultima"]'); o.btnShown = btn && !btn.hidden; o.btnText = btn && btn.textContent;
    const graph = () => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
      const g = H3.pieceGraph(t, 0, oi, {}).g, n = Object.values(g), ref = v => v && g[v[0]], sas = n.filter(x => x.class_type==='SamplerCustomAdvanced');
      const s = sas[sas.length - 1], bs = ref(s.inputs.sigmas);
      return {n:sas.length, smp:ref(s.inputs.sampler).inputs.sampler_name, sch:bs.inputs.scheduler, steps:bs.inputs.steps, unets:n.filter(x => x.class_type==='UNETLoader').map(x => x.inputs.unet_name), loras:n.filter(x => x.class_type==='LoraLoaderModelOnly').length}; };
    f.steps = 20; btn.click(); o.model = f.model; o.steps = f.steps; o.finOn = f.finOn; o.sum = document.querySelector('#modelSum').textContent; o.ug = graph();
    document.querySelector('[data-mpk="pika"]').click(); o.pg = graph();
    document.querySelector('[data-mpk="ultima"]').click(); H3.drawAll(); o.kept = f.model===o.u;
    return o; });
  ok(/ultima_nsfw_lv120/.test(r.u), 'Ultima Lv120 is found on the PC: ' + r.u);
  ok(r.list.some(l => /Ultima Hybrid Lv120/.test(l)) && r.list.length===3, 'bare bones lists three models (Reel gets the same list): ' + r.list.join(' | '));
  ok(r.btnShown && /Ultima Hybrid Lv120/.test(r.btnText), 'the Ultima button shows in Model when the PC has it');
  ok(r.model===r.u && r.steps==='' && !r.finOn, 'picking it: Ultima, its own steps, no 🔀 Finish on PIKA');
  ok(/Ultima/.test(r.sum), 'the Model summary names it: ' + r.sum);
  ok(r.ug.n===1 && r.ug.smp==='er_sde' && r.ug.sch==='beta' && r.ug.steps===6 && r.ug.unets.length===1 && r.ug.unets[0]===ULTF && r.ug.loras===0, 'Ultima graph: one sampler, er_sde / beta, 6 steps, no LoRAs ' + JSON.stringify(r.ug));
  ok(r.pg.smp==='res_multistep' && r.pg.sch==='simple' && r.pg.steps===8 && /PIKA/.test(r.pg.unets[0]) && r.pg.loras > 0, 'PRISM PIKA unchanged: res_multistep / simple, 8 steps, boost LoRAs ' + JSON.stringify(r.pg));
  ok(r.kept, 'bare bones keeps Ultima picked');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
