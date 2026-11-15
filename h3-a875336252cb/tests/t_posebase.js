// 🖼 Use the picture as the base: a pose picture as the composition of the shot, its people swapped for the characters
// Run: NODE_PATH=$(npm root -g) node tests/t_posebase.js
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
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', q1:'q1.png', k1:'k1.png', g1:'g1.png', g1c:'g1c.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);

  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, prompt:'[0s-2s] <Subject 1> leans on the counter. [2s-5s] '});
    ['p1', 'p2', 'q1', 'k1', 'g1', 'g1c'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lk', kind:'pose', name:'Kneel', pics:['k1'], desc:'', ppl:[]}, {id:'Lg', kind:'pose', name:'Hug', desc:'Hugging, cheek to cheek.', pics:['g1'], coded:'g1c', ppl:[{x:0.3, y:0.5, a:0.1}, {x:0.7, y:0.5, a:0.1}]}]);
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  await page.waitForTimeout(300);
  const setP = p => page.evaluate(p => { H3.S.f.prompt = p; document.querySelector('#prompt').value = p; H3.drawAll(); }, p);
  // one person, raw photo
  await page.evaluate(() => { H3.S.lines = {1:{pose:1, n:2, lib:'Lk', p:-1, name:'Kneel', text:''}}; H3.libOf('Lk').base = true; }); await setP('<Pose 1>.');
  let P = await prom(R, REF), det = P.p.split('detailed_description:')[1] || '';
  ok(/<Subject 2> is the composition shown in <Picture 2>: its camera angle, framing and shot size, where each person is in the frame, how large they are in it and each person's body pose, and its setting\. The person in <Picture 2> is a placeholder to be replaced: their face, hair, skin, body shape and clothes never appear/.test(P.p), 'the picture is defined as the composition, its person a placeholder: ' + P.p.split('summary:')[0]);
  ok(/attribute_transfer - the camera angle, framing, layout and body poses of <Picture 2>, and its setting, are kept as the base of the shot, and only the people are swapped: the person is replaced by <Subject 1>, each in exactly that person's place, size in the frame and pose/.test(P.p), 'retention: kept as the base, the person swapped for Mia: ' + (P.p.split('retention_analysis:')[1] || '').split('detailed_description')[0]);
  ok(/<Subject 1> moves into the place and pose of the person in <Subject 2>, framed from the same camera angle\./.test(det) && !/pose reference only|[\u0002\u0003\u0005]/.test(P.p), 'the words: ' + det.slice(-200));
  // two people, colour-coded copy, the other one given too
  await page.evaluate(() => { H3.S.lines = {1:{pose:1, n:1, lib:'Lg', p:0, name:'Hug', text:'', hold:true, also:[{p:1, n:2}]}}; H3.libOf('Lg').base = true; }); await setP('<Pose 1>.');
  P = await prom(R, REF); det = P.p.split('detailed_description:')[1] || '';
  ok(/The people in <Picture \d> are placeholders to be replaced, each painted one flat colour/.test(P.p) && !/and its setting/.test(P.p), 'coded copy: placeholders in flat colours, no setting: ' + P.p.split('summary:')[0].slice(-400));
  ok(/the red person is replaced by <Subject 1>, the blue person is replaced by <Subject 2>/.test(P.p), 'each colour swapped for a character');
  ok(/holding the place and pose of the red person in <Subject 3>, framed from the same camera angle, while <Subject 2> takes the place and pose of the blue person/.test(det), 'the words name both: ' + det.slice(-420, -150));
  // plain prompt
  await page.evaluate(() => { H3.S.f.h3 = false; }); P = await prom(R, REF);
  ok(/is the composition of the shot: its camera angle, framing, where each person is and their body poses are kept, and only the people are swapped \(the red person is replaced by <Subject 1>, the blue person is replaced by <Subject 2>\)/.test(P.p) && /holding the place and pose of the red person in <Picture \d>/.test(P.p), 'plain prompt says the same: ' + P.p.slice(-420));
  await page.evaluate(() => { H3.S.f.h3 = true; H3.libOf('Lg').base = false; }); P = await prom(R, REF);
  ok(/pose reference only/.test(P.p) && !/composition shown/.test(P.p), 'off: the old pose-only wording');
  // the Library switch
  await page.evaluate(() => { H3.setTab && H3.setTab('lib'); H3.openLib('Lk'); }); await page.waitForTimeout(200);
  ok(/Use the picture as the base: on/.test(await page.textContent('[data-lb="base"]')), 'the 📚 pose sheet has the switch');
  await page.click('[data-lb="base"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => H3.libOf('Lk').base===false), 'tapping it turns it off');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
