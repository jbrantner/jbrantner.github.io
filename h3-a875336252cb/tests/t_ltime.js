// ⏱ LoRA start/stop (Jordan 2026-11-27: "a Lora at the first part of minimax to help with movement and the last half to help with style"):
// the steps are cut where a timed LoRA comes on or goes off, on both models' own schedules. Run: NODE_PATH=$(npm root -g) node tests/t_ltime.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8053);
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
  await page.goto('http://127.0.0.1:8053/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /ref2va/.test(k));
  page.on('dialog', d => d.accept());

  const r = await page.evaluate(REF => { const f = H3.S.f, R = Object.keys(H3.PC)[0], oi = H3.PC[R].oi, o = {};
    const A = 'AFK_Claude_minimaxh3.safetensors', B = 'MysticXXX_MMH3-V5-ref2va.safetensors';
    Object.assign(f, {model:REF, h3:false, sm:false, prompt:'she waves', loras:[], boost:false, finOn:true, finAt:0.5, steps:20}); H3.drawAll();
    const graph = (loras, fin) => { f.finOn = fin; const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x'; t.loras = loras;
      const g = H3.pieceGraph(t, 0, oi, {}).g, ref = v => v && g[v[0]];
      const sas = Object.keys(g).filter(k => g[k].class_type==='SamplerCustomAdvanced'), ord = []; // in run order: follow latent_image
      let cur = sas.find(k => !sas.includes((g[k].inputs.latent_image || [])[0])); while(cur){ ord.push(cur); const c = cur; cur = sas.find(k => (g[k].inputs.latent_image || [])[0]===c); }
      return {g, st:H3.stagesOf(g), fr:H3.stageFracs(g), runs:ord.map(k => { const s = g[k]; let v = s.inputs.sigmas, ch = [], n;
        while((n = ref(v)) && n.class_type==='SplitSigmas'){ ch.unshift(v[1] + '@' + n.inputs.step); v = n.inputs.sigmas; }
        let m = ref(ref(s.inputs.guider).inputs.model), los = []; while(m && m.class_type!=='UNETLoader'){ if(m.class_type==='LoraLoaderModelOnly') los.push(m.inputs.lora_name.split('_')[0]); m = ref(m.inputs.model); }
        return {k, noise:ref(s.inputs.noise).class_type, ch:ch.join(' '), steps:n.inputs.steps, sch:n.inputs.scheduler, pika:/PIKA/i.test(m.inputs.unet_name), los:los.reverse().join('+')}; })}; };
    const sm = x => x.runs.map(r => (r.pika ? 'P' : 'V') + r.steps + '[' + r.ch + ']' + (r.los || '-') + (r.noise==='DisableNoise' ? '' : '*'));
    o.halves = sm(graph([{name:A, str:1, tw:[0, 0.5]}, {name:B, str:0.8, tw:[0.5, 1]}], true));
    o.mid = graph([{name:A, str:1, tw:[0.25, 0.75]}, {name:B, str:0.8}], true); o.midS = sm(o.mid);
    o.one = sm(graph([{name:A, str:1, tw:[0.25, 0.75]}], false));
    o.van = sm(graph([{name:A, str:1, tw:[0.1, 0.4], first:true}, {name:B, str:1, tw:[0.6, 0.9], fin2:true}], true));
    const plain = graph([{name:A, str:1}, {name:B, str:0.8}], true), full = graph([{name:A, str:1, tw:[0, 1]}, {name:B, str:0.8}], true);
    const strip = g => JSON.stringify(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, {c:v.class_type, i:v.inputs}])));
    o.same = strip(plain.g)===strip(full.g); o.plainN = plain.runs.length;
    o.stg = o.mid.runs.map(r => o.mid.st[r.k]); o.fr = o.mid.runs.map(r => o.mid.fr[r.k]);
    o.line = H3.stepLine({stg:o.mid.st}, {pn:o.mid.runs[3].k, v:1, max:2}, true);
    o.frac = H3.stageFrac ? null : null;
    // 🧩 chips: Reel's setLoraFirst(…, times) puts the window on the chip's LoRAs
    o.tw = [H3.twOf([0, 1]), H3.twOf([0.5, 1]), H3.twOf([0.6, 0.2]), H3.loraTimed({tw:[0, 0.5]}), H3.loraTimed({tw:[0, 1]}), H3.loraTimed({})];
    return {halves:o.halves, midS:o.midS, one:o.one, van:o.van, same:o.same, plainN:o.plainN, stg:o.stg, fr:o.fr, line:o.line, tw:o.tw}; }, REF);
  ok(JSON.stringify(r.halves)==='["V20[0@10]AFK*","P8[1@4]MysticXXX"]', 'first half / last half: vanilla runs with A, PIKA finishes with B, no extra cuts ' + JSON.stringify(r.halves));
  ok(JSON.stringify(r.midS)==='["V20[0@5]MysticXXX*","V20[1@5 0@5]MysticXXX+AFK","P8[1@4 0@2]MysticXXX+AFK","P8[1@6]MysticXXX"]', '25-75%: vanilla 0-5 off, 5-10 on, PIKA 4-6 on, 6-8 off; an untimed LoRA stays on throughout ' + JSON.stringify(r.midS));
  ok(JSON.stringify(r.one)==='["V20[0@5]-*","V20[1@5 0@10]AFK","V20[1@15]-"]', 'one model: steps 0-5, 5-15 with the LoRA, 15-20 ' + JSON.stringify(r.one));
  ok(JSON.stringify(r.van)==='["V20[0@2]-*","V20[1@2 0@6]AFK","V20[1@8 0@2]-","P8[1@4 0@1]-","P8[1@5 0@2]MysticXXX","P8[1@7]-"]', 'vanilla-only and finish-only LoRAs keep to their model inside their window ' + JSON.stringify(r.van));
  ok(r.same && r.plainN===2, 'no window (or the whole run) = the same job as before');
  ok(JSON.stringify(r.stg)==='["first model · part 1 of 2","first model · part 2 of 2","PIKA · part 1 of 2","PIKA · part 2 of 2"]', 'stages named ' + JSON.stringify(r.stg));
  ok(JSON.stringify(r.fr)==='[[0,0.25],[0.25,0.5],[0.5,0.75],[0.75,1]]', 'progress share per stretch ' + JSON.stringify(r.fr));
  ok(r.line==='PIKA 1/2', 'short step line ' + r.line);
  ok(JSON.stringify(r.tw)==='[null,[0.5,1],null,true,false,false]', 'window helpers ' + JSON.stringify(r.tw));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
