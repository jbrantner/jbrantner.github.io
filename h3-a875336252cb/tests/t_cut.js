// 🎬 ＋ Shot = cut on the action (Jordan 2026-11-13): the sheet writes a [Shot n] cut line; on a fresh ➕ carry-on it takes the open [1s-] line;
// the piece with the cut is not told "same shot, no cut"; the lead-in anchor stays out of the checker and 🔀. Run: NODE_PATH=$(npm root -g) node tests/t_cut.js
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
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', p4:'p4.png', dr:'dr.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);

  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, prompt:'<Subject 1> leans on the counter. '});
    ['p1', 'p2', 'q1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  const LEAD = '[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] ';
  const setup = (txt, secs) => page.evaluate(([REF, txt, secs]) => { const S = H3.S, f = S.f;
    Object.assign(f, {model:REF, turbo:false, ref:true, imgs:[], seconds:secs, maxPiece:5, h3:true, shuffle:0, prompt:txt});
    ['p1', 'q1'].forEach(k => S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    S.media.mC = {id:'mC', kind:'vid', name:'➕', dur:5, w:832, h:480, fps:24, carry:{src:'tA', at:5, own:true}}; Object.assign(f, {fl:true, first:'mC'});
    S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    const ta = document.querySelector('#prompt'); ta.value = txt; ta.selectionStart = ta.selectionEnd = txt.length; H3.drawAll(); }, [REF, txt, secs]);
  const peek = () => page.evaluate(() => { H3.h3Peek(); return document.querySelector('#h3Pre').textContent; });
  const pieces = () => page.evaluate(() => H3.snapshot().pieces.map(p => p.prompt));

  // a fresh carry-on, Mia named in the words → she is picked; pick an angle, type the action
  await setup(LEAD.replace('[1s-] ', '') + '', 5); await setup('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] ', 5);
  await page.waitForTimeout(200);
  let bar = await page.evaluate(() => [...document.querySelectorAll('#tagBar button')].map(b => b.textContent));
  ok(bar.includes('🎬 ＋ Shot'), 'the tag bar still has 🎬 ＋ Shot');
  await page.click('#tagBar [data-shot]'); await page.waitForTimeout(200);
  ok(await page.isVisible('#cutBox'), 'pressing it opens the cut-on-the-action sheet');
  await page.click('#cutAng [data-ca="low side angle"]'); await page.click('#cutWho [data-cw="2"]'); await page.fill('#cutAct', 'finishes swinging the door open.');
  const prev = await page.textContent('#cutPrev');
  ok(prev==='Goes in as: [Shot 2] [1s-] The camera cuts on the action to a low side angle as Mia finishes swinging the door open, same place, same lighting, same outfit.', 'preview: ' + prev);
  await page.click('#cutGo'); await page.waitForTimeout(200);
  let P = await page.evaluate(() => ({p:H3.S.f.prompt, ta:document.querySelector('#prompt').value, open:!document.querySelector('#sheet').hidden, ang:H3.S.cutAngle}));
  ok(P.p==='[0s-1s] The scene keeps carrying on from the moment before.\n[Shot 2] [1s-] The camera cuts on the action to a low side angle as <Subject 2> finishes swinging the door open, same place, same lighting, same outfit.' && P.ta===P.p && !P.open,
    'the cut takes over the open [1s-] line, the lead-in stays word for word: ' + JSON.stringify(P.p));
  ok(P.ang==='low side angle', 'the angle is remembered for next time');
  let pk = await peek(), det = pk.split('detailed_description:')[1] || '';
  ok(!/no cut/.test(pk) && /This continues straight on from the moment before\./.test(det), 'the carry-on piece is not told "same shot, no cut": ' + det.slice(0, 260));
  ok(/\[Shot 1\][^\n]*\[1s-2s\] The scene keeps carrying on from the moment before\.\n\[Shot 2\] \[2s-[\d.]+s\] The camera cuts on the action to a low side angle as <Subject \d>/.test(det) && (det.match(/\[Shot 1\]/g) || []).length===1,
    'MiniMax gets [Shot 1] with the lead-in, then [Shot 2] with the cut: ' + det.slice(0, 700));

  // no action typed: the cursor lands where the action goes; default angle is the remembered one
  await setup('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] ', 5);
  await page.click('#tagBar [data-shot]'); await page.waitForTimeout(200);
  const sel = await page.evaluate(() => [...document.querySelectorAll('#cutAng .pri')].map(b => b.dataset.ca).join());
  ok(sel==='low side angle', 'the remembered angle is picked: ' + sel);
  await page.fill('#cutOwn', 'extreme close-up on her hands'); await page.click('#cutGo'); await page.waitForTimeout(200);
  P = await page.evaluate(() => { const ta = document.querySelector('#prompt'); return {p:H3.S.f.prompt, at:ta.value.slice(0, ta.selectionStart)}; });
  ok(/\[Shot 2\] \[1s-\] The camera cuts on the action to an extreme close-up on her hands as <Subject 1> , same place/.test(P.p) || /as <Subject 1> , same/.test(P.p), 'own angle, a/an fixed, nobody named so the first person: ' + P.p);
  ok(/as <Subject 1> $/.test(P.at), 'the cursor waits where the action goes: …' + P.at.slice(-30));

  // typed words after [1s-]: the cut is a new line; the 🔎 checker still never gets the lead-in
  await setup('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] <Subject 1> reaches for the door.', 5);
  await page.click('#tagBar [data-shot]'); await page.waitForTimeout(200); await page.fill('#cutAct', 'pulls it open'); await page.click('#cutGo'); await page.waitForTimeout(200);
  P = await page.evaluate(() => H3.S.f.prompt);
  ok(P==='[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] <Subject 1> reaches for the door.\n[Shot 2] The camera cuts on the action to a low side angle as <Subject 1> pulls it open, same place, same lighting, same outfit.', 'after typed words the cut goes on its own line: ' + JSON.stringify(P));
  // a second cut is [Shot 3]
  await page.click('#tagBar [data-shot]'); await page.waitForTimeout(200); await page.click('#cutAng [data-ca="close-up"]'); await page.fill('#cutAct', 'steps through'); await page.click('#cutGo'); await page.waitForTimeout(200);
  P = await page.evaluate(() => H3.S.f.prompt); ok(/\n\[Shot 3\] The camera cuts on the action to a close-up as <Subject 1> steps through/.test(P), 'the next cut is [Shot 3]');
  // plain cut
  await setup('<Subject 1> walks in.', 5); await page.click('#tagBar [data-shot]'); await page.waitForTimeout(200); await page.click('#cutPlain'); await page.waitForTimeout(150);
  P = await page.evaluate(() => H3.S.f.prompt); ok(P==='<Subject 1> walks in.\n[Shot 2] ', 'Plain cut just adds [Shot 2]: ' + JSON.stringify(P));

  // old prompts written with [Shot 1] in front: no doubled [Shot 1], lead-in still the anchor for the checker
  await setup('[Shot 1] [0s-1s] The scene keeps carrying on from the moment before.\n[Shot 2] [1s-] The camera cuts on the action to a close-up as <Subject 1> sits.', 5);
  pk = await peek(); det = pk.split('detailed_description:')[1] || '';
  ok((det.match(/\[Shot 1\]/g) || []).length===1 && /\n\[Shot 2\] \[2s-/.test(det) && !/no cut/.test(pk), 'a typed [Shot 1] is not doubled: ' + det.slice(0, 500));
  // 🔀 Randomize leaves the lead-in and markers alone
  const sh = await page.evaluate(() => H3.shuffleWords('[0s-1s] The scene keeps carrying on from the moment before.\n[Shot 2] [1s-] The camera cuts on the action to a close-up as Laura sits. She smiles. She waves.', 7, 1));
  ok(sh.startsWith('[0s-1s] The scene keeps carrying on from the moment before.\n[Shot 2] [1s-] ') && /^\[0s-1s\] The scene keeps carrying on from the moment before\.\n\[Shot 2\] \[1s-\] The camera cuts on the action to a close-up as Laura sits\. (She waves\. She smiles\.|She smiles\. She waves\.)$/.test(sh), '🔀 keeps the lead-in, the [Shot 2] marker and the cut line first: ' + JSON.stringify(sh));

  // a long take: the cut beat lands in piece 2 with its [Shot 2]; piece 1 keeps "same shot, no cut"
  await setup('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-6s] <Subject 1> walks slowly to the door.\n[Shot 2] [6s-] The camera cuts on the action to a close-up as <Subject 1> opens it.', 10);
  const ps = await pieces();
  ok(ps.length >= 2 && !/\[Shot 2\]/.test(ps[0]) && /no cut/.test(ps[0]) && /\[Shot 2\] \[[\d.]+s-[\d.]+s\] The camera cuts/.test(ps[1]) && !/no cut/.test(ps[1]), 'long take: [Shot 2] goes with its beat into piece 2: ' + JSON.stringify(ps));

  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
