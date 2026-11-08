// 👥 Subjects: one cast for every clip; <Subject n> in a prompt is its stand-in words until it has a picture, then the picture.
// Run: NODE_PATH=$(npm root -g) node tests/t_cast.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8019);
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
  await page.goto('http://127.0.0.1:8019/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> walks to the window. [2s-5s] <Subject 1> waves at <Subject 2>.'}); H3.drawAll(); }, REF);
  await page.click('#castAdd');
  const A = await page.evaluate(() => ({cast:JSON.parse(JSON.stringify(H3.S.cast)), chip:document.querySelector('#tagBar').textContent, rows:document.querySelectorAll('#castList .cast').length}));
  ok(A.cast.length===1 && A.cast[0].n===1 && A.cast[0].stand==='a woman' && A.rows===1 && /Subject 1/.test(A.chip), '＋ Add a subject: <Subject 1>, stand-in "a woman", a chip above the prompt');
  let P = await prom(R, REF); console.log(P.p.split('\n\n')[0], '|', P.p.slice(P.p.indexOf('detailed_description')));
  ok(/\. A woman walks to the window\.\s+\[2s-5s\] A woman waves at <Subject 2>\./.test(P.p) && !/<Subject 1>/.test(P.p) && !P.imgs.length, 'no picture: sent as its stand-in words (capitalised), a token with no subject left as it is');
  // a picture: it goes along, and the prompt says who it is
  await page.evaluate(() => { H3.S.media.p1 = {id:'p1', kind:'img', name:'p1.png', w:640, h:352, thumb:''}; Object.assign(H3.S.cast[0], {pic:'p1', who:'the lady in the red coat'}); H3.drawAll(); });
  P = await prom(R, REF); console.log(P.p.split('summary:')[0]);
  ok(/<Subject 1> is the lady in the red coat, as shown in <Picture 1>\./.test(P.p) && /\[Shot 1\] <Subject 1> walks to the window/.test(P.p) && P.imgs.join()==='p1.png', 'with a picture: the picture is sent and <Subject 1> is defined by it');
  ok(await page.evaluate(() => /lady in the red coat, as shown in <Picture 1>/.test(document.querySelector('#h3Pre').textContent)), 'the 👁 look shows it too');
  // several pictures of one subject (Jordan 2026-11-06): all go along, one subject seen in all of them
  await page.evaluate(() => { H3.S.media.p2 = {id:'p2', kind:'img', name:'p2.png', w:640, h:352, thumb:''}; H3.S.cast[0].pics.push('p2'); H3.drawAll(); });
  P = await prom(R, REF);
  ok(/<Subject 1> is the lady in the red coat, as shown in <Picture 1> and <Picture 2>\./.test(P.p) && P.imgs.join()==='p1.png,p2.png' && await page.evaluate(() => document.querySelectorAll('.castpics .cpw').length)===2, 'two pictures: one subject shown in both, two thumbnails (' + P.imgs + ')');
  await page.click('[data-cast="first:1"]'); ok(await page.evaluate(() => H3.S.cast[0].pics.join())==='p2,p1', '★ makes a picture the first');
  await page.click('[data-cast="unpic:0"]'); ok(await page.evaluate(() => H3.S.cast[0].pics.join())==='p1', '✕ takes a picture out');
  // with a picture of its own in the form: the form's stays <Picture 1>, the subject's comes after but is still <Subject 1>
  await page.evaluate(() => { H3.S.media.a = {id:'a', kind:'img', name:'a.png', w:640, h:352, thumb:''}; H3.S.f.imgs = [{id:'a', on:true, desc:'the cafe, warm wood'}]; H3.drawAll(); });
  P = await prom(R, REF);
  ok(/<Subject 1> is the lady in the red coat, as shown in <Picture 2>\./.test(P.p) && /<Subject 2> is the cafe, warm wood, as shown in <Picture 1>\./.test(P.p) && P.imgs.join()==='a.png,p1.png', 'cast subjects come first, the pictures keep their numbers');
  await page.evaluate(() => { H3.S.cast[0].kind = 'place'; H3.drawAll(); }); P = await prom(R, REF);
  ok(/<Subject 1> \(appears in \[Shot 1\]\): fully_preserved - the setting/.test(P.p), 'a 🏞 Place keeps its setting, not a face');
  await page.evaluate(() => { H3.S.cast[0].kind = 'char'; H3.S.f.imgs = []; H3.S.f.h3 = false; H3.drawAll(); }); P = await prom(R, REF);
  ok(/^<Subject 1> is the lady in the red coat, as shown in <Picture 1>\. <Subject 1> walks/.test(P.p), 'plain prompt (🧾 off): who it is goes up front');
  // 🔁 swap: the stand-in words in the form and every take become the token
  await page.evaluate(() => { H3.S.f.h3 = true; H3.S.cast[0].pics = []; H3.S.f.prompt = 'A woman walks in. The dog follows a woman.';
    H3.S.takes.unshift({id:'tk1', t:Date.now(), pc:'x', model:H3.S.f.model, turbo:false, w:640, h:352, seconds:5, prompt:'a woman sits down', imgs:[], vids:[], auds:[], follow:[], pieces:[{prompt:'a woman sits down'}], state:'done'}); H3.drawAll(); });
  const hits = await page.evaluate(() => H3.castHits('a woman'));
  ok(hits===4 && await page.evaluate(() => /4 found/.test(document.querySelector('[data-cast="swap"]').textContent)), '🔁 counts "a woman" in the form and the takes (' + hits + ')');
  await page.click('[data-cast="swap"]');
  const W = await page.evaluate(() => ({f:H3.S.f.prompt, ta:document.querySelector('#prompt').value, t:H3.S.takes[0].prompt, p:H3.S.takes[0].pieces[0].prompt}));
  ok(W.f==='<Subject 1> walks in. The dog follows <Subject 1>.' && W.ta===W.f && W.t==='<Subject 1> sits down' && W.p===W.t, '🔁 swaps them everywhere: ' + JSON.stringify(W));
  // a take made earlier picks up the subject's new picture when it's re-rendered
  await page.evaluate(() => { H3.S.cast[0].pics = ['p1']; });
  const T = await page.evaluate(R => { const t = JSON.parse(JSON.stringify(H3.S.takes[0])); Object.assign(t, {model:H3.S.f.model, turbo:false, w:640, h:352, h3:{}, loras:[], lastOn:false, fl:false, pieces:[{start:0, gen:121, deliv:121, ctx:0, prompt:t.prompt}]});
    const n = Object.values(H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png'}).g); return {p:n.find(x => x.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, im:n.filter(x => x.class_type==='LoadImage').length}; }, R);
  ok(/<Subject 1> is the lady in the red coat/.test(T.p) && T.im===1, 'an older take re-rendered now uses the picture');
  ok(await page.evaluate(() => H3.castWords('<Subject 1> smiles')==='the lady in the red coat smiles'), '⬆ Regenerate gets plain words');
  // ⬆ Regenerate's Words box nudges the take with new words (Jordan 2026-11-06)
  const RW = await page.evaluate(R => { const t = JSON.parse(JSON.stringify(H3.S.takes[0])); Object.assign(t, {final:{filename:'a.mp4', subfolder:''}, w:640, h:352, seconds:5, up:{scale:1, rep:'medium', str:0.8, refs:false, prompt:'a woman stands up and waves'}});
    const g = Object.values(H3.upGraph(t, H3.PC[R].oi, {})); const txt = JSON.stringify(g); return {nudge:/stands up and waves/.test(txt), old:/sits down/.test(txt)}; }, R);
  ok(RW.nudge && !RW.old, '⬆ Regenerate uses the edited words: ' + JSON.stringify(RW));
  const SH = await page.evaluate(() => { const t = H3.S.takes[0]; t.final = {filename:'a.mp4', subfolder:''}; H3.regenSheet(t); const w = document.querySelector('#rgW'); const r = {has:!!w, v:w && w.value, one:!!document.querySelector('#rgSize [data-v="1"]')}; const x = document.querySelector('[data-close]'); if(x) x.click(); return r; });
  ok(SH.has && SH.v==='<Subject 1> sits down' && SH.one, '⬆ Regenerate sheet shows the Words box with the take\'s words, and a 1× size: ' + JSON.stringify(SH));
  // ✕ remove: its words go back
  await page.click('[data-cast="rm"]');
  const X = await page.evaluate(() => ({n:H3.S.cast.length, f:H3.S.f.prompt, t:H3.S.takes[0].prompt}));
  ok(X.n===0 && X.f==='a woman walks in. The dog follows a woman.' && X.t==='a woman sits down', '✕ remove puts the stand-in words back: ' + JSON.stringify(X));
  // ⬆ Regenerate / ✨ pass use the subjects' pictures the take's words name (Jordan 2026-11-06: the pass looked nothing like her)
  const RR = await page.evaluate(() => { const keep = H3.S.cast; H3.S.media.pR = H3.S.media.pR || {thumb:'x', name:'r.png'}; H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'the lady', pics:['pR'], keep:'exact'}];
    const t = {prompt:'<Subject 1> waves', pieces:[{prompt:'<Subject 1> waves'}], imgs:[{id:'own1'}]}; const ids = H3.upRefs(t).map(r => r.id); H3.S.cast = keep; return ids; });
  ok(JSON.stringify(RR)==='["pR","own1"]', '⬆ a regenerate takes the subject\'s picture first, then the take\'s own: ' + JSON.stringify(RR));
  // ✨ two characters: each gets a picture in the pass (Jordan 2026-11-08: the second one lost her likeness)
  const R2 = await page.evaluate(() => { const keep = H3.S.cast; ['a1','a2','a3','b1','b2'].forEach(k => H3.S.media[k] = {thumb:'x', name:k + '.png'});
    H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Laura', pics:['a1','a2','a3'], keep:'exact'}, {n:2, kind:'char', stand:'a man', who:'Ben', pics:['b1','b2'], keep:'exact'}];
    const t = {prompt:'<Subject 1> hugs <Subject 2>', pieces:[{prompt:'<Subject 1> hugs <Subject 2>'}], imgs:[]}; const ids = H3.upPick(t).map(r => r.id); H3.S.cast = keep; return ids; });
  ok(JSON.stringify(R2)==='["a1","a2","b1"]', '✨ a pass on two characters sends both: ' + JSON.stringify(R2));
  // 👥 four characters share the 9 slots (Jordan 2026-11-08: only 2 of 4 came out)
  const R4 = await page.evaluate(() => { const keep = H3.S.cast, pics = (k, n) => [...Array(n)].map((_, i) => { const id = k + i; H3.S.media[id] = {thumb:'x', name:id + '.png'}; return id; });
    H3.S.cast = [{n:1, kind:'char', who:'A', pics:pics('pA', 6), keep:'exact'}, {n:2, kind:'char', who:'B', pics:pics('pB', 4), keep:'exact'}, {n:3, kind:'char', who:'C', pics:pics('pC', 3), keep:'exact'}, {n:4, kind:'char', who:'D', pics:pics('pD', 3), keep:'exact'}];
    const T = H3.castTake({prompt:'<Subject 1>, <Subject 2>, <Subject 3> and <Subject 4> dance.', imgs:[]}, true), by = {}; T.imgs.forEach(r => by[r.cast] = (by[r.cast] || 0) + 1); H3.S.cast = keep; return {n:T.imgs.length, by}; });
  ok(R4.n===9 && R4.by[1]===3 && R4.by[2]===2 && R4.by[3]===2 && R4.by[4]===2, '👥 four characters each get pictures (3, 2, 2, 2 of the 9): ' + JSON.stringify(R4));
  // ✍ More detail (Jordan 2026-11-06): sent without a picture (up front, once) and with one (in its definition)
  const CD = await page.evaluate(() => { const keep = H3.S.cast; H3.S.cast = [{n:1, kind:'char', stand:'a woman', desc:'long black hair,\ngreen eyes, freckles', keep:'exact'}]; H3.drawAll();
    const box = !!document.querySelector('[data-castf="desc"]'), noPic = H3.castText('[Shot 1] <Subject 1> walks in. <Subject 1> sits.', {imgs:[]}, false);
    const T = {imgs:[{id:'p1', desc:'the lady', more:'long black hair, green eyes, freckles', cast:1, keep:'exact', kind:'char'}]}, P = H3.h3Prompt({text:'<Subject 1> walks in', imgs:T.imgs, secs:5});
    H3.S.cast = keep; H3.drawAll(); return {box, noPic, def:(P.match(/<Subject 1> is [^\n]*/) || [''])[0]}; });
  ok(CD.box && CD.noPic==='[Shot 1] The woman: long black hair, green eyes, freckles. A woman walks in. A woman sits.' && /as shown in <Picture 1>\. Long black hair, green eyes, freckles\./.test(CD.def), '✍ a subject\'s More detail box goes in with or without a picture: ' + JSON.stringify(CD));
  await page.evaluate(() => { H3.S.cast.push({n:1, kind:'char', stand:'a woman', who:'the lady in the red coat', pic:'p1', keep:'exact'}); H3.drawAll(); document.querySelector('#bCast').scrollIntoView(); });
  await page.screenshot({path:path.join(__dirname, 'cast.png')}).catch(() => {});
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
