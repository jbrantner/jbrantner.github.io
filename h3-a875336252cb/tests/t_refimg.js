// 🖼 Ref images for one shot: <Ref Image k> chips, sent as that picture's subject, kept within MiniMax's 9 pictures, never in the Library.
// Run: NODE_PATH=$(npm root -g) node tests/t_refimg.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8031);
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
  await page.goto('http://127.0.0.1:8031/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', p4:'p4.png', dr:'dr.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);

  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> picks up <Ref Image 1> and shows it to the camera.'});
    ['p1', 'p2', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}];
    H3.S.f.imgs = [{id:'r1', on:true, desc:'a red umbrella', keep:''}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  let U = await page.evaluate(() => ({rows:document.querySelectorAll('#srefBox .srow').length, chip:(document.querySelector('#srefBox .rchip') || {}).textContent, bar:[...document.querySelectorAll('#tagBar button')].map(b => b.textContent),
    hl:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n), note:(document.querySelector('#srefNote') || {}).textContent, vis:!!document.querySelector('#srefBox').offsetParent}));
  ok(U.rows===1 && U.chip==='🖼 Ref Image 1' && U.vis, '🖼 the shot shows its ref image with a "Ref Image 1" chip (visible in bare bones): ' + JSON.stringify(U));
  ok(U.bar.includes('🖼 Ref Image 1') && !U.bar.some(x => /Picture/.test(x)), 'the tag bar has the 🖼 Ref Image 1 chip next to the characters: ' + U.bar);
  ok(U.hl.join()==='Laura,🖼 Ref Image 1', 'the words show <Ref Image 1> as a chip: ' + U.hl);
  ok(/Sends 3 of MiniMax's 9 pictures: 1 ref image and 2 of the characters' 2\./.test(U.note), 'note counts the 9 pictures: ' + U.note);
  let P = await prom(R, REF);
  ok(!/Ref Image/.test(P.p) && /<Subject 2> is a red umbrella, as shown in <Picture 1>/.test(P.p) && /picks up <Subject 2>/.test(P.p) && /<Subject 1> is Laura, as shown in <Picture 2> and <Picture 3>/.test(P.p), 'sent: <Ref Image 1> becomes the umbrella\'s <Subject 2>, Laura stays <Subject 1>');
  ok(/<Subject 2> \([^)]*\): fully_preserved - what is shown in <Picture 1>/.test(P.p), 'a ref image keeps what it shows (not a person\'s face/hair wording)');
  ok(P.imgs.length===3, 'three pictures loaded: ' + P.imgs);
  const snap = await page.evaluate(() => H3.snapshot().imgs); ok(snap.length===1 && snap[0].rk===1, 'the take keeps which ref image it is: ' + JSON.stringify(snap));
  // plain (not the H3 way): <Picture n>
  await page.evaluate(() => { H3.S.f.h3 = false; }); P = await prom(R, REF);
  ok(/picks up <Picture 1>/.test(P.p) && !/Ref Image/.test(P.p), 'plain prompt: <Ref Image 1> → <Picture 1>: ' + P.p.slice(0, 160));
  await page.evaluate(() => { H3.S.f.h3 = true; H3.S.f.imgs[0].on = false; }); P = await prom(R, REF);
  ok(/picks up the red umbrella/.test(P.p) && !/Ref Image/.test(P.p), 'a ref image switched off: its words stand in: ' + (P.p.match(/picks up [^.]*/) || [''])[0]);
  await page.evaluate(() => { H3.S.f.imgs[0].on = true; });
  // the limit: 1 character in the words → room for 8 ref images, she still sends 1 picture
  await page.evaluate(() => { for(let k = 2; k <= 9; k++) H3.S.f.imgs.push({id:'r' + k, on:true, desc:'', keep:''}); H3.S.f.prompt += ' <Ref Image 3> is on the table.'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  await page.waitForTimeout(200);
  U = await page.evaluate(() => ({add:document.querySelector('#srefBox [data-add="sref"]').disabled, rows:document.querySelectorAll('#srefBox .srow').length, note:document.querySelector('#srefNote').textContent}));
  ok(U.rows===9 && U.add, 'nine ref images fill the shot, ＋ is off: ' + JSON.stringify(U));
  P = await prom(R, REF);
  ok(P.imgs.length===9 && /<Subject 1> is Laura, as shown in <Picture 9>\./.test(P.p) && /<Ref Image 3>|Ref Image/.test(P.p)===false, 'never more than 9 pictures, Laura still gets one: ' + P.imgs.length);
  ok(/Sends 9 of MiniMax's 9 pictures: 8 ref images and 1 of the characters' 2/.test(U.note) && /fewer of their pictures/.test(U.note) && /1 ref image doesn't fit/.test(U.note), 'the note says the characters send fewer: ' + U.note);
  // ✕ the first one: its tag goes, the others move up a number
  await page.evaluate(() => { H3.S.f.imgs = H3.S.f.imgs.slice(0, 3); H3.S.f.prompt = 'Laura holds <Ref Image 1> next to <Ref Image 3>.'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  await page.waitForTimeout(200);
  await page.click('#srefBox [data-rm="sref"][data-i="0"]'); await page.waitForTimeout(200);
  U = await page.evaluate(() => ({p:H3.S.f.prompt, ta:document.querySelector('#prompt').value, ids:H3.shotRefs(H3.S.f).map(r => r.id)}));
  ok(U.p==='Laura holds next to <Ref Image 2>.' && U.ta===U.p && U.ids.join()==='r2,r3', '✕ takes Ref Image 1 out of the words and renumbers the rest: ' + JSON.stringify(U));
  // pick a real file through ＋ Ref image
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#srefBox [data-add="sref"]')]);
  await fc.setFiles({name:'lamp.png', mimeType:'image/png', buffer:png}); await page.waitForTimeout(600);
  U = await page.evaluate(() => ({n:H3.shotRefs(H3.S.f).length, lib:(H3.S.lib || []).length, chip:[...document.querySelectorAll('#srefBox .rchip')].map(b => b.textContent).pop()}));
  ok(U.n===3 && U.chip==='🖼 Ref Image 3' && U.lib===0, '＋ Ref image adds a picture to the shot only, not the Library: ' + JSON.stringify(U));
  await page.click('#srefBox .rchip >> nth=2'); U = await page.evaluate(() => H3.S.f.prompt); ok(/<Ref Image 3>/.test(U), 'tapping its chip puts <Ref Image 3> in the words: ' + U);
  // what it is
  await page.fill('#srefBox input[data-srd="1"]', 'a brass lamp'); ok(await page.evaluate(() => H3.S.f.imgs[1].desc==='a brass lamp'), 'its "what it is" box sets the description');
  // another clip with no ref images: they don't come along; a take whose refs were 2 (1 was off) renumbers to 1
  await page.evaluate(REF => { H3.useAgain({id:'tq', model:REF, turbo:false, w:640, h:352, seconds:5, prompt:'She sits.', imgs:[], vids:[], auds:[], follow:[], pieces:[{prompt:'She sits.'}]}, true); }, REF);
  ok(await page.evaluate(() => H3.shotRefs(H3.S.f).length===0), 'loading a clip without ref images clears the shot\'s');
  await page.evaluate(REF => { H3.useAgain({id:'tr', model:REF, turbo:false, w:640, h:352, seconds:5, prompt:'She waves <Ref Image 2>.', imgs:[{id:'r2', desc:'', keep:'', rk:2}], vids:[], auds:[], follow:[], pieces:[{prompt:'She waves <Ref Image 2>.'}]}, true); }, REF);
  U = await page.evaluate(() => ({p:H3.S.f.prompt, ids:H3.shotRefs(H3.S.f).map(r => r.id)})); ok(U.p==='She waves <Ref Image 1>.' && U.ids.join()==='r2', 'a take\'s ref images come back with matching numbers: ' + JSON.stringify(U));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
