// 🎨 a reference clip with people painted red / blue: each colour replaced by a character (Jordan 2026-11-15)
// Run: NODE_PATH=$(npm root -g) node tests/t_clipcols.js
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
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','ConditioningSetTimestepRange','ConditioningCombine'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
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
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8049/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  const NAMES = {p1:'p1.png', p2:'p2.png', q1:'q1.png', v1:'v1.mp4'};
  const graph = () => page.evaluate(([R, NAMES]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, NAMES).g, N = Object.values(g), rv = N.find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    return {p:rv.inputs.prompt, pics:Object.keys(rv.inputs).filter(k => /^ref_images\./.test(k)).length, loads:N.filter(n => n.class_type==='LoadVideo').map(n => n.inputs.file)}; }, [R, NAMES]);
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], vids:[], fl:false, seconds:5, h3:true, shuffle:0, fillRefs:false, rstr:{}, prompt:''});
    ['p1', 'p2', 'q1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''}); H3.S.media.v1 = {id:'v1', kind:'vid', name:'v1.mp4', w:640, h:352, dur:4, thumb:''};
    H3.S.cast = [{n:2, kind:'char', who:'Val', pics:['q1'], keep:'exact'}, {n:3, kind:'char', who:'Laur', pics:['p1', 'p2'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'La', kind:'act', name:'Dance', what:'Dancing together', pics:[], vid:'v1'}]);
    H3.S.dlWho = 3; H3.S.lines = {}; H3.S.lineNo = 0; document.querySelector('#prompt').value = ''; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  // 📚 Library: tick the colours painted in the clip
  await page.evaluate(() => H3.openLib('La')); await page.waitForTimeout(200);
  await page.click('[data-lb="acol:blue"]'); await page.waitForTimeout(150); await page.click('[data-lb="acol:red"]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => JSON.stringify(H3.libOf('La').cols))==='["red","blue"]', 'the Library action keeps its colours, in the usual order: ' + await page.evaluate(() => JSON.stringify(H3.libOf('La').cols)));
  await page.evaluate(() => document.querySelector('[data-close]').click());
  // 🥋 chip: pick the action, then who replaces each colour
  await page.click('#tagBar [data-acn]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !document.querySelector('#acCols').innerHTML), 'no colour rows until the Library action is picked');
  await page.click('#acBook [data-ab="0"]');
  ok(await page.evaluate(() => [...document.querySelectorAll('#acCols [data-ac]')].length)===6, 'red and blue rows, each with Val, Laur and Nobody');
  await page.click('#acCols [data-ac="red:3"]'); await page.click('#acCols [data-ac="blue:2"]'); await page.click('#acGo'); await page.waitForTimeout(200);
  let L = await page.evaluate(() => H3.lineOf(1)); ok(L.lib==='La' && JSON.stringify(L.as)==='{"red":3,"blue":2}', 'the chip keeps colour → character: ' + JSON.stringify(L));
  let G = await graph(), det = G.p.split('detailed_description:')[1] || '';
  ok(G.loads.join()==='v1.mp4' && G.pics===3, 'the clip goes, with both characters\' pictures (Val is only named by her colour): ' + G.pics);
  ok(/<Subject 3> is the scene performed in <Video 1> \(Dancing together\): its camera angle, framing and shot size, where each person is in the frame, how each one moves and the timing\. The people in it are placeholders to be replaced: the red person and blue person have been recoloured \(skin and hair in one flat colour\) only to tell them apart, and no red or blue skin or hair ever appears/.test(G.p), 'the clip is defined as the scene, its painted people placeholders: ' + G.p.split('summary:')[0]);
  ok(/only the people are swapped: the red person is replaced by <Subject 2>, the blue person is replaced by <Subject 1>, each in exactly that person's place, size in the frame and movement; each keeps their own face, hair, natural skin colour/.test(G.p), 'retention: each colour swapped for its character: ' + (G.p.split('retention_analysis:')[1] || '').split('detailed_description')[0]);
  ok(/<Subject 2> takes the place and movement of the red person and <Subject 1> takes the place and movement of the blue person in <Subject 3>\./.test(det) && !/stand-in/.test(G.p), 'the shot says who is who: ' + det.slice(0, 500));
  // one colour only, and the chip's who left as nobody
  await page.evaluate(() => { const L = H3.S.lines[1]; L.n = 0; delete L.auto; L.as = {blue:2}; H3.drawAll(); }); G = await graph();
  ok(G.loads.length===1 && /the blue person is replaced by <Subject 1>/.test(G.p) && !/red person is replaced/.test(G.p), 'one colour given: the clip still goes for her');
  // no colours given: the old stand-in wording
  await page.evaluate(() => { const L = H3.S.lines[1]; L.n = 3; delete L.as; H3.drawAll(); }); G = await graph();
  ok(/stand-in/.test(G.p) && !/placeholders/.test(G.p), 'no colours given: the usual motion-only wording');
  // the same action on her card too: colours still apply, one clip
  await page.evaluate(() => { H3.S.lines[1].as = {red:3, blue:2}; H3.S.cast[1].acts = [{id:'La', to:0}]; H3.drawAll(); }); G = await graph();
  ok(G.loads.length===1 && /red person is replaced by <Subject 2>/.test(G.p), 'card + chip: one clip, colours kept');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
