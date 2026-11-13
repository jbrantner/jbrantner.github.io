// ✍ Custom quality word chips (Jordan 2026-11-13): tap to add/take out motion, lens, light, colour and picture sentences.
// Run: NODE_PATH=$(npm root -g) node tests/t_qwords.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8037);
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
  await page.goto('http://127.0.0.1:8037/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', p4:'p4.png', dr:'dr.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);

  const r = await page.evaluate(REF => { const q = s => document.querySelector(s), f = H3.S.f; Object.assign(f, {model:REF, h3:true, sm:false, quality:true, qstyle:'', qtext:'', h3Style:''}); H3.drawH3();
    const o = {}; const chip = k => q('#qWords [data-qw="' + k + '"]'), tap = k => chip(k).click(), P = () => H3.h3Prompt({h3:H3.snapshot().h3, text:'she waves', secs:5});
    o.shown = !q('#qWords').hidden && !!chip('golden'); o.defOn = chip('smooth').classList.contains('on') && chip('image').classList.contains('on') && !chip('golden').classList.contains('on');
    tap('golden'); o.gold = /golden-hour sunlight/.test(f.qtext) && f.qtext.startsWith(H3.QUALITY.split('.')[0]) && /golden-hour sunlight/.test(P()) && chip('golden').classList.contains('on');
    o.order = f.qtext.indexOf('golden-hour') < f.qtext.indexOf('The image is stable');
    tap('studio'); o.one = !/golden-hour/.test(f.qtext) && /three-point studio/.test(f.qtext);
    tap('teal'); tap('cine'); tap('pace'); o.many = /teal-and-orange/.test(f.qtext) && /35 mm lens/.test(f.qtext) && /real-time speed/.test(f.qtext);
    f.qtext += ' My own extra words.'; q('#h3Qual').value = f.qtext; H3.drawQWords(); tap('clothes'); o.extra = /My own extra words\.$/.test(f.qtext) && !/Clothing stays/.test(f.qtext);
    o.ta = q('#h3Qual').value===f.qtext; o.sends = /Sends: /.test(q('#qwNow').textContent);
    tap('_def'); o.def = f.qtext==='' && chip('clothes').classList.contains('on') && !chip('teal').classList.contains('on');
    for(const k of ['smooth', 'faces', 'clothes', 'image']) tap(k); o.allOff = f.quality===false && q('#qWords').hidden;
    o.noBody = !H3.QWORDS.flatMap(g => g.items).filter(i => !H3.QUALITY.includes(i[2])).some(i => /breast|nipple|skin|body|bodies|chest|curv|sexy|beautiful|flatter|masterpiece|best quality|hair/i.test(i[2]));
    f.quality = true; f.qstyle = 'real'; H3.drawH3(); o.preset = q('#qWords').hidden; f.qstyle = ''; f.quality = false; return o; }, REF);
  for(const [k, v] of Object.entries(r)) ok(v, k);
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
