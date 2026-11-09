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
  ok((await lbl())==='🔀 Shuffle: sentences', 'button starts on (sentences)');
  ok(await page.evaluate(() => H3.S.f.quality===true && H3.S.f.qstyle===''), '✨ quality words start on, ✍ Custom');
  await page.click('#shufBtn'); ok((await lbl())==='🔀 Shuffle: off', 'tap → off');
  await page.click('#shufBtn'); ok((await lbl())==='🔀 Shuffle: sentences', 'tap → sentences again (no comma setting)');
  const sent = await page.evaluate(([R, REF]) => { H3.S.f.model = REF; H3.S.f.prompt = 'One is red, bright. Two is blue. Three is green. Four is pink.'; const out = []; for(const seed of [11, 12, 13]){ const t = H3.snapshot(); t.id = 't' + seed; t.pc = R; t.seed = seed; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {}).g; const n = Object.values(g).find(n => n.inputs && typeof n.inputs.prompt==='string'); out.push({sh:t.shuffle, p:n && n.inputs.prompt, saved:t.prompt}); } return out; }, [R, REF]);
  ok(sent.every(x => x.sh===1 && x.saved==='One is red, bright. Two is blue. Three is green. Four is pink.'), 'take keeps her words and the shuffle setting');
  ok(sent.every(x => x.p && /One is red, bright\./.test(x.p) && /Four is pink\./.test(x.p)) && new Set(sent.map(x => x.p)).size===3, 'each take sends its own order: ' + sent.map(x => x.p).join(' / '));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
