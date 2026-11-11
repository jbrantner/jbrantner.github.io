// 🔀 Shuffle: each take sends its sentences (and comma parts) in its own order; timed tags, shots and the carry-on lead stay put.
// Run: NODE_PATH=$(npm root -g) node tests/t_shuffle.js
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

  // 🔀 the shuffle itself
  const r = await page.evaluate(() => {
    const W = H3.shuffleWords, txt = 'She walks to the window, slowly, looking out. The rain falls. A car passes below. She sighs';
    const a = W(txt, 1, 1), b = W(txt, 2, 1), a2 = W(txt, 1, 1), c = W(txt, 5, 2), off = W(txt, 5, 0);
    const timed = '[0s-2s] She stands up. She stretches. [2s-5s] She walks out, waving, smiling. The door shuts.';
    const tm = [1, 2, 3, 4, 5, 6].map(s => W(timed, s, 2));
    const lead = 'This continues straight on from the moment before, in the same shot with the same camera and no cut. She runs. She jumps. She lands.';
    const ld = [1, 2, 3, 4].map(s => W(lead, s, 2));
    const shots = '[Shot 1] A wide view. Birds fly.\n[Shot 2] A close-up. She smiles.';
    return {txt, a, b, a2, c, off, tm, ld, sh:W(shots, 9, 1)}; });
  const sents = s => s.match(/[^.!?]+[.!?]/g).map(x => x.trim()).sort().join('|');
  // a long take past its last timed line (Jordan 2026-11-11: lines ending at 5.9 s on a 15 s take left parts 2 and 3 with no action): the last line carries on
  const pk = await page.evaluate(() => { const t = '[1s-2s] She sits down, carrying on from the moment before.\n[2s-5.9s] Her hands move slowly. She sways. She breathes softly.'; const pl = H3.plan(15, 5, H3.parseBeats(t).beats);
    const P = pl.map((p, i) => H3.piecePrompt(t, pl, i)), T = {seed:7, id:'tX', shuffle:1, bk:0, pieces:pl.map((p, i) => Object.assign({}, p, {prompt:P[i]}))}; return {P, n:pl.length, sent:H3.sentWords(T)}; });
  ok(pk.n===3 && pk.P.slice(1).every(x => /\(carrying on\) Her hands move slowly\. She sways\. She breathes softly\./.test(x) && /^This continues straight on/.test(x)) && /Part 2 🔀/.test(pk.sent) && /Part 3 🔀/.test(pk.sent) && /She sways/.test(pk.sent.split('Part 3')[1] || '') && pk.sent.split('\n').filter(x => /^Part [23]/.test(x)).every(x => /no cut\. \[1s-[\d.]+s\] \(carrying on\) /.test(x))
    && pk.P.slice(1).every(x => +(x.match(/\[1s-([\d.]+)s\]/) || [0, 0])[1] > 4),
    'parts past the last timed line keep its words, each part shuffled: ' + JSON.stringify(pk));
  ok(r.off===r.txt, 'off leaves the words alone');
  ok(r.a===r.a2, 'same seed, same order: ' + r.a);
  ok(r.a!==r.txt && r.b!==r.txt, 'sentences change order');
  ok(sents(r.a)===sents(r.txt.replace(/sighs$/, 'sighs.')), 'same sentences, nothing lost');
  ok(r.c!==r.txt && /,/.test(r.c), 'with commas: ' + r.c);
  ok(r.tm.every(x => /^\[0s-2s\] /.test(x) && x.indexOf('[2s-5s]') > 0 && /^\[0s-2s\] [^[]*(stands up|stretches)[^[]*(stands up|stretches)[^[]*\[2s-5s\]/i.test(x)), 'timed tags stay put, sentences stay inside their beat: ' + r.tm[0]);
  ok(new Set(r.tm).size > 2, 'different seeds give different orders');
  ok(r.ld.every(x => x.startsWith('This continues straight on from the moment before, in the same shot with the same camera and no cut. ')), 'carry-on lead stays first and whole');
  ok(/^\[Shot 1\] .*\n\[Shot 2\] /.test(r.sh) && /\[Shot 1\][^\n]*(wide view|Birds)[^\n]*(wide view|Birds)/.test(r.sh), 'shots stay in place: ' + JSON.stringify(r.sh));
  // 🔀 sent with the take, per take seed; button cycles
  await page.evaluate(() => { Object.assign(H3.S.f, {model:'', h3:false, imgs:[], seconds:5, prompt:'One is red. Two is blue. Three is green. Four is pink.'}); H3.S.cast = []; });
  const lbl = () => page.$eval('#shufBtn', b => b.textContent);
  ok((await lbl())==='🔀 Randomize: off', 'button starts off (Jordan 2026-11-11: off by default)');
  await page.click('#shufBtn'); ok((await lbl())==='🔀 Randomize batch', 'tap → Randomize batch');
  ok(await page.evaluate(() => H3.S.f.quality===true && H3.S.f.qstyle===''), '✨ quality words start on, ✍ Custom');
  await page.click('#shufBtn'); ok((await lbl())==='🔀 Randomize', 'tap → Randomize (always)');
  await page.click('#shufBtn'); ok((await lbl())==='🔀 Randomize: off', 'tap → off');
  await page.click('#shufBtn'); ok((await lbl())==='🔀 Randomize batch', 'tap → batch again');
  const W = 'One is red, bright. Two is blue. Three is green. Four is pink.';
  const run = mode => page.evaluate(([R, REF, W, mode]) => { Object.assign(H3.S.f, {model:REF, prompt:W, shuffle:mode, seed:'7'}); const out = [];
    for(const k of [0, 1, 2]){ const t = H3.snapshot(); t.id = 'tk' + mode + k; t.pc = R; t.seed = 7; t.bk = k; t.dir = 'H3Deck/x'; t.name = 'x';
      const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {}).g; const n = Object.values(g).find(n => n.inputs && typeof n.inputs.prompt==='string'); out.push({sh:t.shuffle, p:n && n.inputs.prompt, saved:t.prompt}); } return out; }, [R, REF, W, mode]);
  const B = await run(1), A = await run(2), O = await run(0);
  ok(B.every(x => x.sh===1 && x.saved===W), 'batch: takes keep her words');
  ok(B[0].p.includes(W) && !B[1].p.includes(W) && !B[2].p.includes(W) && B[1].p!==B[2].p, 'batch: first take as typed, the rest shuffled, each its own: ' + B.map(x => x.p).join(' / '));
  ok(A.every(x => !x.p.includes(W) && /One is red, bright\./.test(x.p)) && new Set(A.map(x => x.p)).size===3, 'always: every take shuffled, even the first, with the same typed seed: ' + A.map(x => x.p).join(' / '));
  ok(O.every(x => x.p.includes(W)), 'off: as typed');
  // 📏 real size: two people (or an attribute close-up) get the life-size line; the attribute picture is called a close-up detail
  const Z = await page.evaluate(() => { H3.S.cast = [{n:1, kind:'char', who:'Ellen', pics:['p1']}, {n:2, kind:'char', who:'Mia', pics:['p2']}];
    const two = H3.h3Prompt({h3:{}, text:'<Subject 1> hugs <Subject 2>.', imgs:[{id:'p1', desc:'Ellen', cast:1}, {id:'p2', desc:'Mia', cast:2}, {id:'p3', attrOf:1, what:'spiral eyes', lib:'L1'}], secs:5});
    const one = H3.h3Prompt({h3:{}, text:'<Subject 1> waves.', imgs:[{id:'p1', desc:'Ellen', cast:1}], secs:5});
    return {two, one}; });
  ok(!/human size|life size|miniature|tiny|close-up|how big/i.test(Z.two + Z.one), 'no size words at all (they made her smaller)');
  // ➕ carry-on lead-in stays the anchor; a prompt put in by the 🔎 checker (ckSet) is shuffled per take like any other
  const LEAD = '[0s-1s] She sits down. She smiles, carrying on from the moment before.\n';
  const CW = LEAD + '[1s-] Mei turns to the window. Rain runs down the glass. The camera pushes in slowly. Soft grey light falls across her face.';
  const C = await page.evaluate(([R, REF, CW]) => { H3.S.f.model = REF; H3.S.f.shuffle = 1; H3.ckSet(CW); const out = [];
    for(const k of [0, 1, 2, 3]){ const t = H3.snapshot(); t.id = 'ck' + k; t.pc = R; t.seed = 100 + k; t.bk = k; t.dir = 'H3Deck/x'; t.name = 'x';
      const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {}).g; const n = Object.values(g).find(n => n.inputs && typeof n.inputs.prompt==='string'); out.push({p:n.inputs.prompt, card:H3.sentWords(t), form:H3.S.f.prompt}); } return out; }, [R, REF, CW]);
  ok(C.every(x => x.form===CW), 'checker words are in the form, unchanged');
  ok(C.every(x => x.p.includes(LEAD)), 'lead-in sent word for word, first, on every take');
  const REST = 'Mei turns to the window. Rain runs down the glass. The camera pushes in slowly. Soft grey light falls across her face.';
  ok(C[0].p.includes(REST) && C.slice(1).every(x => !x.p.includes(REST)) && new Set(C.slice(1).map(x => x.p)).size===3, 'checker prompt: take 1 as typed, takes 2-4 each shuffled after the lead-in: ' + C.map(x => x.card.replace(/\n/g, ' / ')).join(' || '));
  ok(C.slice(1).every(x => x.p.includes(x.card.split('\n').pop().trim())), 'card shows exactly what was sent');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
