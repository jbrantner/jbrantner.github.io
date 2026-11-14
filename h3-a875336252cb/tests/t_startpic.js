// 🎬 Start on a picture: one of the take's ref pictures is also its first frame (it stays a reference).
// Run: NODE_PATH=$(npm root -g) node tests/t_startpic.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8048);
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
  await page.goto('http://127.0.0.1:8048/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, fl:false, first:null, seconds:5, h3:true, aspect:'1:1', prompt:'<Subject 1> waves.'});
    [['p1', 1320, 1305], ['p2', 1286, 1801], ['r1', 1000, 1000]].forEach(([k, w, h]) => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w, h, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Aphmau', pics:['p1', 'p2'], keep:'exact'}]; H3.S.f.imgs = [];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  let U = await page.evaluate(() => ({vis:!!document.querySelector('#startBox').offsetParent, n:document.querySelectorAll('#startBox [data-startpic]').length, on:(document.querySelector('#startBox .chip.on') || {}).textContent}));
  ok(U.vis && U.n===3 && U.on==='Off', '🎬 Start on a picture shows Off + her two pictures, Off by default: ' + JSON.stringify(U));
  const graph = () => page.evaluate(() => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = 'http://render.test'; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC['http://render.test'].oi, {p1:'p1.png', p2:'p2.png', r1:'r1.png'}).g, N = Object.values(g);
    const rv = N.find(n => n.class_type==='MiniMaxH3ReferenceToVideo'), fit = N.find(n => n.class_type==='MMH3FitReferences');
    const src = v => { const n = g[v[0]]; return n.class_type==='ImageCrop' ? 'cut:' + g[n.inputs.image[0]].inputs.image : n.inputs.image; };
    return {t:{fl:t.fl, first:t.first, startPic:t.startPic}, pics:Object.keys(fit.inputs).filter(k => /^image_\d+$/.test(k)).map(k => src(fit.inputs[k])),
      guides:N.filter(n => n.class_type==='MiniMaxH3AddGuide' && n.inputs.image).map(n => [g[n.inputs.image[0]].inputs.image, n.inputs.frame_idx]), p:rv.inputs.prompt}; });
  let G = await graph();
  ok(!G.t.fl && !G.t.startPic && !G.guides.length && !/first frame/.test(G.p), 'Off: no first frame, nothing pinned: ' + JSON.stringify(G.t));
  await page.click('#startBox [data-startpic="p1"]'); await page.waitForTimeout(200);
  U = await page.evaluate(() => ({on:document.querySelector('#startBox .chip.on').dataset.startpic, pic:!!document.querySelector('#aspects [data-asp="pic"]')}));
  ok(U.on==='p1' && U.pic, 'tapping her picture picks it, and 🖼 Like the first frame is offered: ' + JSON.stringify(U));
  G = await graph();
  ok(G.t.fl && G.t.first==='p1' && G.t.startPic==='p1', 'the take has it as its first frame: ' + JSON.stringify(G.t));
  ok(G.pics.length===3 && G.pics[0]==='p1.png' && G.pics[1]==='p2.png' && G.pics[2]==='p1.png', 'it stays her reference (not cut: a take with a first frame sends every picture whole) and goes again as the first frame picture: ' + G.pics);
  ok(G.guides.length===1 && G.guides[0][0]==='p1.png' && G.guides[0][1]===0, 'pinned at frame 0: ' + JSON.stringify(G.guides));
  ok(/<Subject 1> is Aphmau, as shown in <Picture 1> and <Picture 2>/.test(G.p) && /<Picture 3> is the first frame of \[Shot 1\]/.test(G.p) && /begins from <Picture 3>/.test(G.p), 'prompt: she is Pictures 1-2, Picture 3 is the first frame');
  await page.evaluate(() => { H3.S.f.aspect = 'pic'; H3.drawAll(); }); G = await page.evaluate(() => { const t = H3.snapshot(); return [t.w, t.h]; });
  ok(Math.abs(G[0] / G[1] - 1320 / 1305) < 0.05, '🖼 Like the first frame takes the picture\'s shape: ' + G);
  // use again restores the option, not First / last frame
  await page.evaluate(() => { const t = H3.snapshot(); H3.S.f.startPic = ''; H3.S.f.fl = false; H3.useAgain(t, true); });
  U = await page.evaluate(() => ({sp:H3.S.f.startPic, fl:!!H3.S.f.fl}));
  ok(U.sp==='p1' && !U.fl, 'Use again brings back 🎬 Start on a picture: ' + JSON.stringify(U));
  // a picture no longer in the shot (character out of the words) is ignored
  await page.evaluate(() => { H3.S.f.prompt = 'A quiet street.'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  U = await page.evaluate(() => ({sp:H3.startPic(), hid:document.querySelector('#startBox').hidden, t:H3.snapshot().fl}));
  ok(U.sp===null && U.hid && !U.t, 'with her out of the words, nothing to start on and no first frame: ' + JSON.stringify(U));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
