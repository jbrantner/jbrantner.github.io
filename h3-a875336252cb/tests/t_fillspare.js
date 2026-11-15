// 🔁 Fill spare slots: a pose picture once, the characters' pictures again round robin until the 9 slots are full (within the budget)
// Run: NODE_PATH=$(npm root -g) node tests/t_fillspare.js
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
  const prom = (R) => page.evaluate((R) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', q1:'q1.png', k1:'k1.png'}).g, nodes = Object.values(g), rv = nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    const T = H3.castTake(t, true);
    return {p:rv.inputs.prompt, slots:Object.keys(rv.inputs).filter(k => /^ref_images\./.test(k)).length, ids:T.imgs.map(r => r.id), dup:T.imgs.filter(r => r.dup).length}; }, R);
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, fillRefs:false, prompt:'[0s-5s] <Subject 1> waits by the window. <Pose 1>'});
    ['p1', 'p2', 'p3', 'q1', 'k1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2', 'p3'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lk', kind:'pose', name:'Kneel', pics:['k1'], desc:'', ppl:[]}]);
    H3.S.lines = H3.S.lines || {}; H3.S.lines[1] = {pose:1, n:1, lib:'Lk', p:-1, name:'Kneel', text:''};
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  ok(await page.textContent('#fillBtn')==='🔁 Fill spare slots: off', 'the button starts off: ' + await page.textContent('#fillBtn'));
  let P = await prom(R);
  ok(P.ids.join()==='p1,p2,p3,k1' && P.slots===4 && !P.dup, 'off: each picture once: ' + P.ids);
  await page.click('#fillBtn'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => H3.S.f.fillRefs===true) && await page.textContent('#fillBtn')==='🔁 Fill spare slots: on', 'tapping turns it on');
  ok(await page.evaluate(() => H3.snapshot().fill===1), 'the take keeps the setting');
  P = await prom(R);
  ok(P.ids.join()==='p1,p2,p3,p1,p2,p3,p1,p2,k1' && P.slots===9 && P.dup===5, 'on: her 3 pictures round robin, pose once and last, 9 slots: ' + P.ids);
  ok(/<Picture 1>, <Picture 2>, <Picture 3>, <Picture 4>, <Picture 5>, <Picture 6>, <Picture 7> and <Picture 8>/.test(P.p) && /<Picture 9>/.test(P.p), 'the words tie all 8 pictures to her, the pose is Picture 9: ' + P.p.split('summary:')[0].slice(0, 400));
  // two characters take turns
  await page.evaluate(() => { H3.S.f.prompt = '[0s-5s] <Subject 1> and <Subject 2> wait by the window. <Pose 1>'; document.querySelector('#prompt').value = H3.S.f.prompt; });
  P = await prom(R);
  ok(P.ids.join()==='p1,p2,p3,q1,p1,q1,p2,q1,k1', 'two characters take turns: ' + P.ids);
  // big canvas: no copies that would shrink the real pictures
  await page.evaluate(() => { H3.S.f.prompt = '[0s-5s] <Subject 1> waits by the window. <Pose 1>'; document.querySelector('#prompt').value = H3.S.f.prompt; });
  const big = await page.evaluate(() => { const t = Object.assign(H3.snapshot(), {w:1344, h:768}); return H3.castTake(t, true).imgs.map(r => r.id).join(); });
  ok(big==='p1,p2,p3,k1', 'at 1344×768 the budget has no room for copies: ' + big);
  const mid = await page.evaluate(() => { const t = Object.assign(H3.snapshot(), {w:1280, h:720}); return H3.castTake(t, true).imgs.filter(r => r.dup).length; });
  ok(mid > 0 && mid < 5, 'at 1280×720 only some copies fit: ' + mid);
  // faces never get copies
  const fr = await page.evaluate(() => H3.faceRefs ? H3.faceRefs(H3.snapshot(), 1).map(r => r.id).join() : 'n/a');
  ok(fr==='n/a' || fr==='p1,p2,p3', 'Faces gets her pictures once: ' + fr);
  // using a take again brings its setting back
  await page.evaluate(() => { const t = H3.snapshot(); t.fill = 0; H3.S.f.fillRefs = true; H3.useAgain(t, true); });
  ok(await page.evaluate(() => H3.S.f.fillRefs===false), 'Use again restores the take\'s setting');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
