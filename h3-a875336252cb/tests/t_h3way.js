// 🧾 Write it the H3 way: the prompt builder and the graphs, against a fake ComfyUI answered in the browser (nothing renders).
// The format is MiniMax's own (MiniMaxAI/MiniMax-H3 docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md and _base_en.md).
// Run: NODE_PATH=$(npm root -g) node tests/t_h3way.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8014);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8014/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k)), FL = fams.find(k => /fl2v/.test(k));
  ok(REF && FL, 'a reference family and the first/last frame family: ' + fams.join(', '));

  // ---- the builder on its own ----
  const P = await page.evaluate(() => H3.h3Prompt({h3:{style:'Live-action, cinematic', sound:'Rain on the window', music:''}, text:'Ellen walks to the window. She turns and smiles at the camera. The camera pushes in slowly.', words:'AFKJ Style',
    imgs:[{desc:'Ellen, a woman in her 20s with long red hair', keep:'exact'}, {desc:'Ellen, a woman in her 20s with long red hair.'}, {desc:'the cafe, warm wood and big windows', keep:'loose'}, {}], vids:[], auds:[{desc:'the voice of Ellen (S1)'}], secs:5}));
  console.log(P);
  const sec = ['subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:'], at = sec.map(x => P.indexOf(x));
  ok(at.every(i => i >= 0) && at.every((i, k) => !k || i > at[k - 1]), 'six sections in the official order');
  ok(P.startsWith('AFKJ Style.\n\nsubject_definitions:'), 'LoRA words come first, as they were trained');
  ok(/<Subject 1> is Ellen, a woman in her 20s with long red hair, as shown in <Picture 1> and <Picture 2>\./.test(P), 'two pictures with the same words = one subject');
  ok(/<Subject 2> is the cafe.*<Picture 3>/.test(P) && /<Subject 3> is the subject shown in <Picture 4>\./.test(P), 'other pictures get their own subjects, a bare one a plain line');
  ok(/<Subject 1> \(appears in \[Shot 1\]\): fully_preserved/.test(P) && /<Subject 2> \(appears in \[Shot 1\]\): weak_reference/.test(P), 'keep levels map to the official markers');
  ok(/<Audio 1> is the voice of Ellen \(S1\)\./.test(P) && /<Audio 1>: reference - /.test(P), 'a sound is a voice reference by default');
  ok(/summary:\n\[reference generation \+ audio reference\] It features <Subject 1>, <Subject 2> and <Subject 3>\. Ellen walks to the window\. She turns/.test(P), 'summary: task tags, subjects, the gist');
  ok(/detailed_description:\nThe target video is in a live-action, cinematic style\.\n\[Shot 1\] Ellen walks/.test(P), 'style sentence before [Shot 1]');
  ok(/overall_soundscape:\nRain on the window\./.test(P) && /non_diegetic_music:\nN\/A$/.test(P), 'sound line, and N/A with no music');

  const B = await page.evaluate(() => [H3.h3Prompt({h3:{}, text:'a fox runs through snow', fl2v:true, first:true, last:true, secs:5.1667}), H3.h3Prompt({h3:{}, text:'a fox runs', fl2v:true, first:true}), H3.h3Prompt({h3:{}, text:'a fox', fl2v:false})]);
  console.log(B[0]);
  ok(B[0].startsWith('How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 5.17-second mark of the target video.\n\nintegrated_multimodal_description: [Shot 1] Live-action, cinematic. A fox runs'), 'FL2VA: the official alignment line, then the description');
  ok(B[1].startsWith('For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.'), 'first frame only: the I2VA line');
  ok(B[2].startsWith('integrated_multimodal_description: [Shot 1]') && /overall_soundscape: Natural ambient/.test(B[2]), 'no references at all: the T2VA format, with a natural default sound');

  // ---- the form and the graphs ----
  const G = await page.evaluate(([R, REF]) => { const f = H3.S.f; ['a', 'b', 'ff'].forEach(id => H3.S.media[id] = {id, kind:'img', name:id + '.png', w:640, h:352, thumb:''});
    Object.assign(f, {model:REF, turbo:false, ref:true, imgs:[{id:'a', on:true, desc:'Ellen, red hair'}, {id:'b', on:true, desc:'Ellen, red hair'}], fl:true, first:'ff', last:false, seconds:9, maxPiece:5, prompt:'Ellen walks to the window and looks out at the rain.', h3Style:'2D anime'});
    H3.drawAll(); const t = H3.snapshot(); t.id = 't1'; t.pc = R; t.seed = 3; t.dir = 'H3Deck/h3_t1'; t.name = 'h3_t1';
    const oi = H3.PC[R].oi, names = {a:'a.png', b:'b.png', ff:'ff.png'}, g = i => H3.pieceGraph(t, i, oi, names).g;
    return {n:t.pieces.length, h3:t.h3, p0:Object.values(g(0)).find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, p1:Object.values(g(1)).find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt,
      peek:document.querySelector('#h3Pre').textContent, shown:!document.querySelector('#h3Body').hidden, rows:document.querySelectorAll('#h3Refs [data-h3d]').length, note:document.querySelector('#h3Note').textContent}; }, [R, REF]);
  console.log(G.p1);
  ok(G.shown && G.rows===2, 'on by default, one row per reference picture');
  ok(G.n===2 && G.h3 && G.h3.style==='2D anime', 'a 9 s clip in two pieces keeps the H3 settings');
  ok(/<Subject 1> is Ellen, red hair, as shown in <Picture 1> and <Picture 2>\./.test(G.p0) && /<Picture 3> is the first frame of \[Shot 1\]\./.test(G.p0) && /\[keyframe completion \+ reference generation\]/.test(G.p0) && /\[Shot 1\] The shot begins from <Picture 3>\./.test(G.p0), 'piece 1: the first frame is <Picture 3> with keyframe completion');
  ok(/^subject_definitions:/.test(G.p1) && /\[video continuation \+ reference generation\] The target video carries straight on/.test(G.p1) && !/first frame/.test(G.p1), 'piece 2: video continuation, no first frame');
  ok(/The target video is in a 2D anime style\./.test(G.p0), 'the style box is used');
  ok(G.peek===G.p0, 'the 👁 look matches what piece 1 sends');
  ok(/words in the shot/.test(G.note), 'word count note: ' + G.note);

  const F = await page.evaluate(([R, FL]) => { const f = H3.S.f; Object.assign(f, {model:FL, ref:false, fl:true, first:'ff', last:true, lastImg:'b', seconds:5}); H3.drawAll();
    const t = H3.snapshot(); t.id = 't2'; t.pc = R; t.seed = 3; t.dir = 'H3Deck/h3_t2'; t.name = 'h3_t2'; const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {b:'b.png', ff:'ff.png'}).g;
    return Object.values(g).find(n => n.class_type==='MiniMaxH3ImageToVideo').inputs.prompt; }, [R, FL]);
  ok(/^How the reference pictures align/.test(F) && /5\.17-second/.test(F), 'FL2V model graph gets the alignment line for 124 frames');

  const O = await page.evaluate(([R, REF]) => { const f = H3.S.f; Object.assign(f, {model:REF, ref:false, fl:false, h3:false, seconds:5, prompt:'plain prompt'}); H3.drawAll();
    const t = H3.snapshot(); t.id = 't3'; t.pc = R; t.seed = 3; t.dir = 'H3Deck/h3_t3'; t.name = 'h3_t3';
    return {h3:t.h3, p:Object.values(H3.pieceGraph(t, 0, H3.PC[R].oi, {}).g).find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, hid:document.querySelector('#h3Body').hidden}; }, [R, REF]);
  ok(O.h3===null && O.p==='plain prompt' && O.hid, 'switched off (and old takes): the prompt goes as typed');

  await page.evaluate(() => { H3.S.f.h3 = true; H3.S.f.ref = true; H3.S.f.fl = false; H3.drawAll(); });
  await page.fill('[data-h3d="img:0"]', 'Mara, short black hair'); await page.click('[data-h3k="img:0:mostly"]');
  const U = await page.evaluate(() => ({d:H3.S.f.imgs[0].desc, k:H3.S.f.imgs[0].keep, pre:document.querySelector('#h3Pre').textContent}));
  ok(U.d==='Mara, short black hair' && U.k==='mostly' && /<Subject 1> is Mara, short black hair, as shown in <Picture 1>\./.test(U.pre) && /partially_preserved/.test(U.pre), 'typing and the keep buttons update the prompt');
  // ---- the save space: old previews are cleared instead of the save failing (Jordan 2026-11-04) ----
  const Q = await page.evaluate(async () => { const big = 'data:image/jpeg;base64,' + 'A'.repeat(60000); const toasts = [];
    new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(n => n.className==='toast' && toasts.push(n.textContent)))).observe(document.body, {childList:true});
    for(let i = 0; i < 250; i++) H3.S.media['old' + i] = {id:'old' + i, kind:'img', name:'x', thumb:big};
    H3.S.takes.unshift({id:'tk', t:Date.now(), pc:'x', imgs:[{id:'old1'}], vids:[], auds:[], follow:[], pieces:[], state:'done'});
    const keep = H3.S.f.imgs[0].id; H3.S.media[keep].thumb = big; H3.saveNow(); await new Promise(r => setTimeout(r, 300));
    const saved = JSON.parse(localStorage.getItem('h3deck') || '{}').media || {};
    return {toasts, n:Object.keys(H3.S.media).length, kept1:!!H3.S.media.old1, thumb1:H3.S.media.old1 && H3.S.media.old1.thumb, formThumb:!!H3.S.media[keep].thumb, savedKeep:!!saved[keep], len:(localStorage.getItem('h3deck') || '').length}; });
  console.log(JSON.stringify(Object.assign({}, Q, {thumb1:(Q.thumb1 || '').length})));
  ok(!Q.toasts.some(t => /full/.test(t)) && Q.savedKeep && Q.len > 0, 'a full save space clears old previews and saves, no "full" message');
  ok(Q.kept1 && !Q.thumb1 && !Q.n.toString().startsWith('25') && Q.formThumb, 'unused media gone, a take\'s picture kept without its preview, the form keeps its previews');
  await page.click('#h3Peek summary'); await page.screenshot({path:path.join(__dirname, 'h3way.png'), fullPage:false, clip:{x:0, y:0, width:390, height:1400}}).catch(() => {});
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
