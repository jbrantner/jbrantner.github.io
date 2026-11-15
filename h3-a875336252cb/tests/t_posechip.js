// 🧍 Pose chips: <Pose k> shown as "Mia · Kneel", sent with the pose picture as a stand-in (pose + expression only)
// Run: NODE_PATH=$(npm root -g) node tests/t_posechip.js
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
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', q1:'q1.png', k1:'k1.png', g1:'g1.png', g1c:'g1c.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);

  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, prompt:'[0s-2s] <Subject 1> leans on the counter. [2s-5s] '});
    ['p1', 'p2', 'q1', 'k1', 'g1', 'g1c'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lk', kind:'pose', name:'Kneel', pics:['k1'], desc:'', ppl:[]}, {id:'Lg', kind:'pose', name:'Hug', desc:'Hugging, cheek to cheek.', pics:['g1'], coded:'g1c', ppl:[{x:0.3, y:0.5, a:0.1}, {x:0.7, y:0.5, a:0.1}]}]);
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  let bar = await page.evaluate(() => [...document.querySelectorAll('#tagBar button')].map(b => b.textContent));
  ok(bar.indexOf('🧍 ＋ Pose')===bar.indexOf('🥋 ＋ Action') + 1, 'the tag bar has 🧍 ＋ Pose next to ＋ Action: ' + bar);
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-psn]'); await page.waitForTimeout(200);
  await page.click('#pcWho [data-pw="2"]'); await page.click('#pcLib [data-pl="Lk"]');
  let prev = await page.textContent('#pcPrev');
  ok(prev==='Sent to MiniMax as: Mia moves into the pose and facial expression of the person from the pose picture.', 'the sheet shows how it is sent: ' + prev);
  await page.click('#pcGo'); await page.waitForTimeout(200);
  let U = await page.evaluate(() => ({p:H3.S.f.prompt, L:H3.lineOf(1), hl:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n)}));
  ok(U.p==='[0s-2s] <Subject 1> leans on the counter. [2s-5s] <Pose 1>' && U.L.pose && U.L.lib==='Lk' && U.L.p===-1 && U.L.name==='Kneel', 'the words get a <Pose 1> tag: ' + JSON.stringify(U));
  ok(U.hl.join()==='Laura,🧍 Mia · Kneel', 'it shows as a "🧍 Mia · Kneel" chip: ' + U.hl);
  let P = await prom(R, REF);
  ok(P.imgs.includes('k1.png') && P.imgs.includes('q1.png') && P.imgs.length===4, 'the pose picture goes, and Mia gets her picture because she takes the pose: ' + P.imgs);
  ok(/<Subject 3> is the body pose and facial expression shown in <Picture 4>\. <Picture 4> is a pose reference only: the person in it is a stand-in whose face, hair, skin, body shape, clothes and place never appear/.test(P.p), 'defined as a stand-in: ' + P.p.split('summary:')[0]);
  ok(/<Subject 3> \(at the moment the words name\): attribute_transfer - only the body pose and facial expression from <Picture 4> are transferred: the person's pose and expression go to <Subject 2>; each keeps their own face, hair, body and clothes/.test(P.p), 'retention: attribute_transfer to Mia only: ' + (P.p.split('retention_analysis:')[1] || '').split('detailed_description')[0]);
  const det = P.p.split('detailed_description:')[1] || '';
  ok(/\[2s-5[^\]]*\] <Subject 2> moves into the pose and facial expression of the person from <Subject 3>\./.test(det) && !/[\u0002\u0003\u0005]|Pose \d/.test(P.p), 'at its moment: ' + det.slice(0, 300));
  // words + holds; two-person picture, blue person
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length - 3; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!document.querySelector('#pcLib .in[data-pl="Lk"]')), 'tapping the chip opens that pose');
  await page.click('#pcLib [data-pl="Lg"]'); await page.waitForTimeout(100);
  const pp = await page.evaluate(() => [...document.querySelectorAll('#pcPpl [data-pp]')].map(b => b.textContent)); ok(pp.join()==='red,blue', 'a two-person pose asks which person: ' + pp);
  ok(await page.inputValue('#pcText')==='Hugging, cheek to cheek', 'picking a pose fills in its Library description: ' + await page.inputValue('#pcText'));
  await page.click('#pcPpl [data-pp="1"]'); await page.click('#pcHow [data-ph="1"]'); await page.fill('#pcName', 'Hold her'); await page.fill('#pcText', 'Wraps her arms around Laura.');
  await page.click('#pcGo'); await page.waitForTimeout(150);
  U = await page.evaluate(() => ({p:H3.S.f.prompt, L:H3.lineOf(1), hl:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n)}));
  ok(U.L.lib==='Lg' && U.L.p===1 && U.L.hold && U.hl.join()==='Laura,🧍 Mia · Hold her', 'saved: ' + JSON.stringify(U));
  P = await prom(R, REF);
  ok(P.imgs.includes('g1c.png') && !P.imgs.includes('g1.png'), 'the coloured copy goes: ' + P.imgs);
  ok(/<Subject 2> wraps her arms around Laura, holding the pose of the blue person from <Subject 3>\./.test(P.p) && /the blue person's pose goes to <Subject 2>/.test(P.p) && /each person in it is painted one flat colour/.test(P.p), 'words, holding, blue person: ' + (P.p.split('detailed_description:')[1] || '').slice(0, 300));
  ok(!/Hugging, cheek to cheek/i.test(P.p.split('detailed_description:')[1]), 'her own words replace the Library description in the shot');
  await page.evaluate(() => { H3.S.lines[9] = {pose:1, n:2, lib:'Lg', p:0, name:'Hug', text:''}; });
  ok(await page.evaluate(() => H3.pmarkOut(H3.lineOut('<Pose 9>')))==='<Subject 2> hugging, cheek to cheek.', 'a chip left blank says the Library description: ' + await page.evaluate(() => H3.pmarkOut(H3.lineOut('<Pose 9>'))));
  // no pictures (⬆ / fallback) → its words; plain prompt → <Picture k>
  ok(await page.evaluate(() => H3.pmarkOut(H3.lineOut('<Pose 1>'))==='<Subject 2> wraps her arms around Laura.'), 'no picture: just the words');
  await page.evaluate(() => { H3.S.lines[1].text = ''; delete H3.S.lines[1].hold; H3.S.lib.find(x => x.id==='Lg').desc = ''; });
  ok(await page.evaluate(() => H3.pmarkOut(H3.lineOut('Then <Pose 1>'))==='Then <Subject 2> moves into a hold her pose.'), 'no picture, no words: the pose name');
  // checker context + tag kept
  const ck = await page.evaluate(() => H3.ckLines('<Subject 1> waits. <Pose 1>', [{n:2, tag:'<Subject 2>', name:'Mia'}]));
  ok(/<Pose 1> = Mia moving into the pose "Hold her"/.test(ck) && /keep every <Pose n> tag/.test(ck), 'the checker gets the pose as context: ' + ck);
  const snap = await page.evaluate(() => H3.snapshot().lines); ok(snap && snap[1] && snap[1].pose, 'the take keeps its poses');
  // a later part that doesn't have the chip: weak reference
  P = await page.evaluate(() => { const t = H3.castTake(Object.assign(H3.snapshot(), {pieces:[{prompt:'<Pose 1>'}, {prompt:'Laura smiles.'}]}), true); return H3.h3Prompt({h3:t.h3, text:H3.castText('<Subject 1> smiles.', t, false), imgs:t.imgs, vids:[], auds:[], secs:5}); });
  ok(/\(not in this part\): weak_reference - this pose belongs to another part/.test(P), 'a part without the chip: weak reference');
  // 🗑
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length - 3; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(150);
  await page.click('#pcRm'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !/<Pose 1>/.test(H3.S.f.prompt)), '🗑 takes the tag out: ' + await page.evaluate(() => H3.S.f.prompt));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
