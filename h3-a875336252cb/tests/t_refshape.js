// 🖼 a reference picture shaped exactly like a video frame is cut narrower, so MiniMax never copies it into frame 0.
// Run: NODE_PATH=$(npm root -g) node tests/t_refshape.js
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
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale']; SCHEMA.ImageCrop = {input:{required:{image:['IMAGE'], width:['INT', {default:512}], height:['INT', {default:512}], x:['INT', {default:0}], y:['INT', {default:0}]}}};
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
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const run = (W, H, dims, first) => page.evaluate(([REF, W, H, dims, first]) => {
    Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, fl:!!first, first:first ? 'fr' : '', seconds:5, h3:true, prompt:'<Subject 1> waves.'});
    H3.S.media.fr = {id:'fr', kind:'img', name:'fr.png', w:W, h:H, thumb:''};
    dims.forEach((d, k) => { H3.S.media['p' + (k + 1)] = {id:'p' + (k + 1), kind:'img', name:'p' + (k + 1) + '.png', w:d[0], h:d[1], thumb:''}; });
    H3.S.cast = [{n:1, kind:'char', who:'Aphmau', pics:dims.map((d, k) => 'p' + (k + 1)), keep:'exact'}]; H3.S.f.imgs = [];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll();
    const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = 'http://render.test'; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x'; t.w = W; t.h = H;
    const names = {fr:'fr.png'}; dims.forEach((d, k) => names['p' + (k + 1)] = 'p' + (k + 1) + '.png');
    const g = H3.pieceGraph(t, 0, H3.PC['http://render.test'].oi, names).g, N = Object.values(g), id = Object.keys(g);
    const fit = N.find(n => n.class_type==='MMH3FitReferences') || N.find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    const src = Object.entries(fit.inputs).filter(([k, v]) => /^image_\d+$|ref_image_\d+$/.test(k) && Array.isArray(v)).map(([k, v]) => { const n = g[v[0]]; return n.class_type==='ImageCrop' ? {crop:[n.inputs.width, n.inputs.height, n.inputs.x], from:g[n.inputs.image[0]].inputs.image} : {from:n.inputs.image}; });
    return src; }, [REF, W, H, dims, first]);
  // Jordan's qbwf/onkn: 640x640 take, two near-square photos (1319x1304, 1320x1305) and three portrait ones
  let A = await run(640, 640, [[1319, 1304], [1320, 1305], [1286, 1801], [1320, 1987], [1320, 1630]]);
  ok(A.length===5 && A[0].crop && A[1].crop && !A[2].crop && !A[3].crop && !A[4].crop, 'square photos on a square take are cut, portrait ones go as they are: ' + JSON.stringify(A));
  ok(A[1].crop[0]===Math.round(1320 * 0.84) && A[1].crop[1]===1305 && A[1].crop[2]===Math.floor((1320 - 1109) / 2) && A[1].from==='p2.png', 'cut to 84% of the width, centred, full height: ' + JSON.stringify(A[1]));
  A = await run(1280, 704, [[1920, 1080], [832, 1216]]);
  ok(A[0].crop && !A[1].crop, 'a 16:9 still on a wide take is cut; a portrait one is not: ' + JSON.stringify(A));
  A = await run(480, 864, [[1080, 1920], [1024, 1024]]);
  ok(A[0].crop && !A[1].crop, 'a 9:16 still on a tall take is cut; a square one is not: ' + JSON.stringify(A));
  const sh = await page.evaluate(() => [H3.refShape('p1', 480, 864), H3.refShape('nope', 640, 640)]);
  ok(sh[0] && sh[1]===null, 'a picture with no size noted goes as it is');
  A = await run(1280, 704, [[1920, 1080]], true);
  ok(A.length===2 && !A[0].crop && !A[1].crop && A[1].from==='fr.png', 'a take with a first frame cuts nothing (Jordan: turn it off when there is a first frame): ' + JSON.stringify(A));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
