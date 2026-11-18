// ✨ Quality boost (Jordan 2026-11-18): five quality LoRAs + trigger word added out of sight, switch on by default.
// Run: NODE_PATH=$(npm root -g) node tests/t_boost.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors','MMH3-Realism-V2-HyperFlow-ref2va.safetensors','DetailSlider-V1.safetensors','MMH3-RealismSlider-V1.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors','minimax_h3_cinematic_v2_tutu.safetensors','MysticXXX_MMH3-V5-ref2va.safetensors','h3_Better_NSFW_Motion_V1.safetensors','MiniMax3_Boob Physics_v1.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8041);
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
  await page.goto('http://127.0.0.1:8041/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', p4:'p4.png', dr:'dr.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);

  const r = await page.evaluate(REF => { const q = s => document.querySelector(s), f = H3.S.f; Object.assign(f, {model:REF, h3:false, sm:false, prompt:'she waves', loras:[{name:'AFK_Claude_minimaxh3.safetensors', str:1, words:'AFKJ Style'}]}); H3.drawAll();
    const R = Object.keys(H3.PC)[0], oi = H3.PC[R].oi, o = {};
    const graph = () => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
      const g = H3.pieceGraph(t, 0, oi, {}).g, n = Object.values(g); return {t, los:n.filter(x => x.class_type==='LoraLoaderModelOnly').map(x => [x.inputs.lora_name, x.inputs.strength_model]), p:(n.find(x => x.class_type==='MiniMaxH3ReferenceToVideo') || {inputs:{}}).inputs.prompt}; };
    o.defOn = f.boost===true && q('#boostSw').classList.contains('on');
    o.listHides = [...q('#loraList select').options].every(x => !/realism|detailslider|cinematic_v2/i.test(x.value));
    const a = graph(); o.on = a; o.formWords = f.prompt;
    q('#boostSw').click(); o.offState = f.boost===false && !q('#boostSw').classList.contains('on');
    o.off = graph();
    o.nsfwDef = f.nsfw===false && !q('#nsfwSw').classList.contains('on');
    q('#nsfwSw').click(); o.nsfw = graph(); q('#boostSw').click(); o.both = graph(); q('#nsfwSw').click(); q('#boostSw').click();
    const old = H3.snapshot(); delete old.boost; o.oldNone = H3.boostLoras(oi, old).length;
    return o; }, REF);
  ok(r.defOn, 'switch is on by default');
  ok(r.listHides, 'boost LoRAs are not offered in the LoRA picker');
  ok(r.on.t.boost===true, 'take remembers boost on');
  ok(r.on.los.length===6, 'own LoRA + 5 boost LoRAs loaded (' + r.on.los.length + ')');
  const st = Object.fromEntries(r.on.los);
  ok(st['MMH3-Realism-V2-HyperFlow-ref2va.safetensors']===0.5 && st['DetailSlider-V1.safetensors']===0.75 && st['MMH3-RealismSlider-V1.safetensors']===0.5 && st['h3-realism-people-t2v-i2v-r2v.safetensors']===0.5 && st['minimax_h3_cinematic_v2_tutu.safetensors']===0.5, 'boost strengths');
  ok(/^AFKJ Style, r34l1sm\. she waves/.test(r.on.p || ''), 'trigger word sent: ' + r.on.p);
  ok(r.formWords==='she waves', 'Shot box words unchanged');
  ok(r.offState && r.off.los.length===1 && !/r34l1sm/.test(r.off.p), 'switch off = no boost');
  ok(r.nsfwDef, '🔥 Body & motion off by default');
  { const st = Object.fromEntries(r.nsfw.los); ok(r.nsfw.los.length===4 && st['MysticXXX_MMH3-V5-ref2va.safetensors']===0.6 && st['h3_Better_NSFW_Motion_V1.safetensors']===0.7 && st['MiniMax3_Boob Physics_v1.safetensors']===0.6, '🔥 alone = own + 3 (' + r.nsfw.los.length + ')'); }
  ok(r.both.los.length===8 && /r34l1sm/.test(r.both.p), 'both switches = own + 7 (Cinematic steps out)');
  ok(r.oldNone===0, 'takes from before the switch get no boost');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
