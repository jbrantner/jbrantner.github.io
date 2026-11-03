// H3 Deck 🎲 takes from a piece, against a fake ComfyUI answered in the browser (nothing renders).
// Run: NODE_PATH=$(npm root -g) node tests/t_branch.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContext','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t), types = g => Object.values(g).map(n => n.class_type);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8013);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [];
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:sent.map(s => [0, s.pid])});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8013/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  // a finished 3-piece take
  await page.evaluate(R => { const pieces = [0, 1, 2].map(i => ({start:i * 4, gen:i ? 124 : 107, deliv:i ? 101 : 107, ctx:i ? 22 : 0, prompt:'piece ' + (i + 1), state:'done', file:{filename:'piece_0' + (i + 1) + '_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}));
    H3.S.takes.unshift({id:'tA', t:Date.now(), pc:R, model:'dasiwaminimaxh3_hybrid_v2', turbo:true, loras:[], w:640, h:360, seed:1, name:'h3_a', dir:'H3Deck/h3_a', prompt:'three pieces', seconds:12, imgs:[], vids:[], auds:[], follow:[], pieces, state:'done', final:{filename:'h3_a_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_a', type:'output'}}); H3.drawAll(); }, R);
  const fam = await page.evaluate(() => H3.families().map(f => f.key)); await page.evaluate(k => { H3.S.takes[0].model = k; }, fam.find(k => /hybrid/.test(k)) || fam[0]);
  await page.click('[data-piece="tA|1"]'); await page.waitForTimeout(200);
  ok(/Takes from here/.test(await page.textContent('#sheetCard')), 'piece 2 offers 🎲 Takes from here');
  await page.fill('#pcPrompt', 'piece 2, another way');
  await page.click('#brMinus'); await page.click('#brGo'); await page.waitForTimeout(1500);
  const T = await page.evaluate(() => H3.S.takes.map(t => ({id:t.id, from:t.from, st:t.pieces.map(p => p.state), files:t.pieces.map(p => p.file && p.file.filename), ctx:t.ctxDirs, p2:t.pieces[1].prompt})));
  console.log(JSON.stringify(T, null, 0));
  ok(T.length===3 && T[0].id==='tA' && T[1].from && T[1].from.at===1 && T[2].from.at===1, '2 new takes, listed under the one they came from');
  ok(T[1].st[0]==='done' && T[1].files[0]==='piece_01_00001_.mp4' && T[1].st[1]!=='done' && T[1].p2==='piece 2, another way', 'they keep piece 1 and make piece 2 again with the new prompt');
  ok(sent.length===4, '2 pieces each queued (' + sent.length + ')');
  const g = sent[0].g, ld = node(g, 'MiniMaxH3MotionContextLoadLatent');
  ok(ld && ld.inputs.latent_path==='Output_Render/H3Deck/h3_a' && ld.inputs.clip_index===1, "piece 2 carries on from piece 1's saved ending in the first take's folder");
  const g3 = sent[1].g, ld3 = node(g3, 'MiniMaxH3MotionContextLoadLatent');
  ok(ld3 && /H3Deck\/h3_\d+_/.test(ld3.inputs.latent_path) && ld3.inputs.latent_path!=='Output_Render/H3Deck/h3_a' && !types(g3).includes('RenderDeckH3Join'), "piece 3 carries on from the new piece 2 (its own folder); joined by Concatenate later, not the folder-only join");
  const ag = await page.evaluate(() => H3.S.takes[0].tA);
  await page.screenshot({path:path.join(__dirname, 'branch.png'), fullPage:false});
  // a take of a take, from piece 3: piece 2's ending is in the branch's folder, piece 1's still in the first
  const nb = await page.evaluate(async () => { const b = H3.S.takes[1]; b.pieces.forEach((p, j) => { p.state = 'done'; p.file = p.file || {filename:'piece_0' + (j + 1) + '_00001_.mp4', subfolder:'Output_Render/' + b.dir, type:'output'}; }); b.state = 'done';
    await H3.branchFrom(b, 2, 1, null); const c = H3.S.takes[2]; return {d1:H3.ctxDir(c, 1), d2:H3.ctxDir(c, 2), bdir:'Output_Render/' + b.dir}; });
  ok(nb.d1==='Output_Render/H3Deck/h3_a' && nb.d2===nb.bdir, 'a take of a take finds each saved ending where it was made');
  // Render with 3 takes on a 10 s clip: piece 1 once, 3 versions of piece 2 that all start from it
  const n0 = sent.length, k0 = await page.evaluate(() => H3.S.takes.length);
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'she walks to the window, then turns around', seconds:10, maxPiece:5, takes:3, seed:''}); H3.drawAll(); });
  ok(/same|beginning once/.test(await page.textContent('#takesHow')), 'the Takes row says a long clip keeps one beginning (' + await page.textContent('#takesHow') + ')');
  await page.click('#goBtn'); await page.waitForTimeout(2000);
  const R3 = await page.evaluate(k0 => H3.S.takes.slice(0, H3.S.takes.length - k0).map(t => ({id:t.id, from:t.from, pids:t.pieces.map(p => p.pid), ctx:t.ctxDirs, dir:t.dir})), k0);
  console.log(JSON.stringify(R3));
  const first = R3.find(t => !t.from), br3 = R3.filter(t => t.from);
  ok(R3.length===3 && first && br3.length===2 && br3.every(b => b.from.id===first.id && b.from.at===1 && b.pids[0]===first.pids[0] && b.pids[1]!==first.pids[1]), '3 takes: one beginning (piece 1 queued once), 3 different piece 2s');
  ok(sent.length - n0===4, 'ComfyUI got 4 renders: piece 1, then 3 piece 2s (' + (sent.length - n0) + ')');
  const ld2 = node(sent[sent.length - 1].g, 'MiniMaxH3MotionContextLoadLatent');
  ok(ld2 && ld2.inputs.latent_path==='Output_Render/' + first.dir && ld2.inputs.clip_index===1, "the extra piece 2s carry on from the shared piece 1's ending");
  // cancelling one version keeps the shared piece 1 rendering for the others
  const del = []; await page.route(R + '/queue', rt => { if(rt.request().method()==='POST') del.push(JSON.parse(rt.request().postData()).delete); return rt.fallback(); });
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return H3.cancelTake ? H3.cancelTake(t) : null; }, br3[0].id);
  ok(del.length && !del.flat().includes(first.pids[0]) && del.flat().includes(br3[0].pids[1]), 'cancelling one version leaves the shared piece 1 in line (' + JSON.stringify(del) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
