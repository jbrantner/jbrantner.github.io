// 🥋 Library action references: the clip itself, worded as movement/expressions only; 🦴 Skeleton only sends DWPose copies (with face dots) instead.
// Run: NODE_PATH=$(npm root -g) node tests/t_actskel.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8034);
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
  await page.goto('http://127.0.0.1:8034/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', q1:'q1.png', av:'av.mp4', sk:'sk.mp4', ap:'ap.png', aps:'aps.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image), vids:nodes.filter(n => n.class_type==='LoadVideo').map(n => n.inputs.file)}; }, [R, REF]);

  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, prompt:'<Subject 1> leans on the counter. '});
    ['p1', 'p2', 'q1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, prompt:'<Subject 1> leans on the counter. '});
    ['p1', 'p2', 'q1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  // Laura does the Library action "Twirl" whose clip shows another woman
  await page.evaluate(() => { H3.S.media.av = {id:'av', kind:'vid', name:'av.mp4', w:640, h:352, dur:3, thumb:''}; H3.S.media.sk = {id:'sk', kind:'vid', name:'sk.mp4', w:640, h:352, dur:3, thumb:''};
    const A = H3.libNew('act'); Object.assign(A, {name:'Twirl', what:'twirl', vid:'av'}); H3.S.lib.push(A); window.__A = A; H3.S.cast[0].acts = [{id:A.id, to:0}]; });
  let P = await prom(R, REF);
  ok(P.vids.join()==='av.mp4' && /is a stand-in: their face, hair, skin, body shape, clothes and the place never appear; <Subject 1> keeps their own face, hair and body from their own pictures/.test(P.p) && /movement, pose and facial expressions/.test(P.p), 'by default the clip itself goes, worded as movement and expressions only: ' + P.p.split('\n').filter(l => /twirl/.test(l)).join(' // '));
  ok(await page.evaluate(() => H3.actNeeds(window.__A).length===0), 'by default no skeleton copy is needed');
  await page.evaluate(() => { window.__A.skelOn = true; });
  P = await prom(R, REF);
  ok(!P.vids.includes('av.mp4') && !P.vids.length, 'with no skeleton copy yet, the raw clip is never sent: ' + P.vids);
  ok(await page.evaluate(() => H3.actNeeds(window.__A).join()==='av'), 'the clip needs a motion-only copy');
  await page.evaluate(() => { window.__A.skel = {av:'sk'}; });
  P = await prom(R, REF);
  ok(P.vids.join()==='sk.mp4', 'only the skeleton copy goes as the reference video: ' + P.vids);
  ok(/stick-figure skeleton in <Video 1>/.test(P.p) && /motion, pose and facial expression guide only/.test(P.p) && /keeps their own face, hair and body from their own pictures/.test(P.p) && !/the people, clothes and place in/.test(P.p), 'the words say it is a skeleton, motion only: ' + (P.p.match(/<Subject \d> is the twirl[^\n]*/) || [''])[0]);
  ok(await page.evaluate(() => H3.actNeeds(window.__A).length===0), 'nothing left to make');
  // pictures instead of a clip
  await page.evaluate(() => { H3.S.media.ap = {id:'ap', kind:'img', name:'ap.png', w:640, h:352, thumb:''}; H3.S.media.aps = {id:'aps', kind:'img', name:'aps.png', w:640, h:352, thumb:''}; Object.assign(window.__A, {vid:'', pics:['ap'], skel:{}}); });
  P = await prom(R, REF); ok(!P.imgs.includes('ap.png'), 'a raw action picture is never sent: ' + P.imgs);
  await page.evaluate(() => { window.__A.skel = {ap:'aps'}; }); P = await prom(R, REF);
  ok(P.imgs.includes('aps.png') && !P.imgs.includes('ap.png') && /coloured stick-figure skeleton in <Picture \d>/.test(P.p), 'its skeleton picture goes instead: ' + P.imgs);
  // the skeleton graph: DWPose with body + hands, no face, image and video
  const G = await page.evaluate(() => { const k = {oi:{}}; const a = H3.actSkelGraph(k, 'x.png', false), b = H3.actSkelGraph(k, 'x.mp4', true, {w:640, h:352}); const cls = g => Object.values(g.g).map(n => n.class_type);
    const dw = Object.values(b.g).find(n => n.class_type==='DWPreprocessor').inputs; return {a:cls(a), b:cls(b), dw}; });
  ok(G.a.join()==='LoadImage,DWPreprocessor,SaveImage' && G.b.includes('SaveVideo') && G.dw.detect_face==='enable' && G.dw.detect_body==='enable' && G.dw.detect_hand==='enable', 'skeleton graphs: ' + JSON.stringify(G));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
