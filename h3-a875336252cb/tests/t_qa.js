// H3 Deck fixes from the real-PC test of 2026-11-14 (two fake ComfyUIs answered in the browser, nothing renders):
// 🧷 the same job already in a PC's line is used, not sent twice (Render rendered two takes twice after phone ↔ hidden copy hand-offs);
// ⇄ a ⛓/🧵 join waiting on one PC moves to a free PC that can see its clips (Main sat idle while a 🧵 seams job waited on Render);
// the takes copy on the PCs is never overwritten with an empty list by a fresh copy of the app.
// Run: NODE_PATH=$(npm root -g) node tests/t_qa.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','Video Slice'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8041);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  // each fake PC: its line of [prompt id, graph]; the first is running when .run is set; .sees = the clips it can read (Dropbox)
  const PCS = {[R]:{name:'Render', line:[], run:false, dels:[], n:0, posts:0, takesPosts:[], sees:null}, [M]:{name:'Main', line:[], run:false, dels:[], n:0, posts:0, takesPosts:[], sees:null}};
  for(const base of [R, M]) await page.route(base + '/**', async rt => { const P = PCS[base], u = new URL(rt.request().url()), p = u.pathname, m = rt.request().method(), J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(m==='OPTIONS') return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*'}, body:''});
    if(p==='/system_stats') return J({devices:[]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && m==='POST'){ const b = JSON.parse(rt.request().postData() || '{}'); if(b.delete){ P.dels.push(...b.delete); P.line = P.line.filter(x => !b.delete.includes(x[0]) || (P.run && x===P.line[0])); } return J({}); }
    if(p==='/queue'){ const run = P.run && P.line.length ? [[0, P.line[0][0], P.line[0][1]]] : []; return J({queue_running:run, queue_pending:P.line.slice(run.length).map((x, i) => [i + 1, x[0], x[1]])}); }
    if(p==='/prompt'){ P.posts++; const pid = P.name[0] + (++P.n); P.line.push([pid, JSON.parse(rt.request().postData()).prompt]); return J({prompt_id:pid}); }
    if(p==='/view'){ const f = u.searchParams.get('filename'); return rt.fulfill({status:P.sees && P.sees.includes(f) ? 200 : 404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); }
    if(p==='/userdata/h3deck_takes.json' && m==='POST'){ P.takesPosts.push(JSON.parse(rt.request().postData() || '{}')); return J({}); }
    if(p.startsWith('/history/')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(([r, m]) => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1.26}]; }, [R, M]);
  await page.goto('http://127.0.0.1:8041/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});

  // a fresh copy of the app with no takes never sends an empty takes list over the PCs' copy
  await page.evaluate(() => { H3.saveNow(); }); await page.waitForTimeout(5500);
  ok(PCS[R].takesPosts.length===0 && PCS[M].takesPosts.length===0, 'an empty app leaves the PCs\' takes copy alone (' + PCS[R].takesPosts.length + '/' + PCS[M].takesPosts.length + ' sent)');

  // 🧷 the very same graph sent twice to one PC: one job, and the second send hands back the first one's id
  const g = {'1':{class_type:'LoadVideo', inputs:{file:'a.mp4 [output]'}, _meta:{title:'LoadVideo'}}, '2':{class_type:'SaveVideo', inputs:{video:['1', 0], filename_prefix:'H3Deck/x/piece_01'}, _meta:{title:'SaveVideo'}}};
  PCS[R].run = true; PCS[R].line.push(['other', {}]);
  const ids = await page.evaluate(async ([R, g]) => [await H3.queueGraph(R, {g:JSON.parse(JSON.stringify(g))}), await H3.queueGraph(R, {g:JSON.parse(JSON.stringify(g))})], [R, g]);
  ok(ids[0] && ids[0]===ids[1] && PCS[R].posts===1, 'the same job already waiting is used, not sent again (' + ids.join(' ') + ', ' + PCS[R].posts + ' sent)');
  const g2 = JSON.parse(JSON.stringify(g)); g2['2'].inputs.filename_prefix = 'H3Deck/y/piece_01';
  const id3 = await page.evaluate(async ([R, g]) => H3.queueGraph(R, {g}), [R, g2]);
  ok(id3 && id3!==ids[0] && PCS[R].posts===2, 'a different job is still sent (' + id3 + ')');
  PCS[R].line = []; PCS[R].run = false; PCS[R].posts = 0; PCS[R].n = 0;

  // ⇄ a ⛓ join waiting behind other jobs on Render moves to Main, which is free and sees both clips
  await page.evaluate(([R]) => { const mk = (id, n) => ({id, t:Date.now() - n, name:'h3_' + id, dir:'H3Deck/h3_' + id, pc:R, state:'done', model:'', turbo:true, w:512, h:512, seconds:3, prompt:'clip ' + id,
      pieces:[{start:0, gen:73, deliv:73, ctx:0, prompt:'', state:'done', file:{filename:id + '.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}}], final:{filename:id + '.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'},
      imgs:[], vids:[], auds:[], follow:[], pins:[], loras:[] });
    H3.S.takes.unshift(mk('ca', 2), mk('cb', 1)); H3.saveNow(); }, [R]);
  PCS[R].run = true; PCS[R].line.push(['busy1', {}], ['busy2', {}]);
  const sent = await page.evaluate(() => window.H3Combine({parts:[{take:'ca', in:0, out:2}, {take:'cb', in:0, out:2}]}));
  const cid = await page.evaluate(() => H3.S.takes.find(t => t.combo) && H3.S.takes.find(t => t.combo).id);
  const at = () => page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); return {pc:t.pc, pids:t.pieces.map(p => p.pid), st:t.pieces.map(p => p.state)}; }, cid);
  let C = await at(); ok(sent && C.pc===R && C.st[0]==='queued', 'the join waits on Render behind 2 other jobs (' + JSON.stringify(C) + ')');
  // Main can't see the clips yet (Dropbox still syncing): it stays
  PCS[M].sees = ['ca.mp4'];
  let n = await page.evaluate(() => H3.rebalance()); C = await at();
  ok(n===0 && C.pc===R && PCS[R].line.some(x => x[0]===C.pids[0]), 'Main can\'t see one of the clips yet: the join stays on Render');
  PCS[M].sees = ['ca.mp4', 'cb.mp4'];
  const before = C.pids[0]; n = await page.evaluate(() => H3.rebalance()); C = await at();
  ok(n===1 && C.pc===M && /^M/.test(C.pids[0]) && C.st[0]==='queued', 'Main sees both clips: the join moved to Main (' + JSON.stringify(C) + ')');
  ok(PCS[R].dels.includes(before) && !PCS[R].line.some(x => x[0]===before), 'and it left Render\'s line');
  const mg = PCS[M].line.find(x => x[0]===C.pids[0])[1], lv = Object.values(mg).filter(x => x.class_type==='LoadVideo').map(x => x.inputs.file);
  ok(lv.length===2 && lv[0]==='Output_Render/H3Deck/h3_ca/ca.mp4 [output]', 'Main\'s job reads the clips from Render\'s folder (' + lv.join(', ') + ')');
  // with a take now, the takes copy is kept on the PCs
  await page.evaluate(() => H3.saveNow()); for(let i = 0; i < 24 && !PCS[R].takesPosts.length; i++) await page.waitForTimeout(500);
  ok(PCS[R].takesPosts.length >= 1 && PCS[R].takesPosts.slice(-1)[0].takes.length >= 3, 'with takes, the copy is sent as before');
  // 🌙 back from the background: a hidden copy that changed nothing isn't taken over (no reload); one that did something is
  const SR = await page.evaluate(() => { const E = JSON.parse(localStorage.getItem('h3edit') || '{}'), j = {by:'worker', deck:JSON.parse(JSON.stringify(H3.S)), edit:JSON.parse(JSON.stringify(E))};
    j.deck.tsav = 1; j.deck.tab = 'x'; const same = H3.sameRun(j); j.deck.takes[0].state = 'failed'; return {same, changed:H3.sameRun(j)}; });
  ok(SR.same===true && SR.changed===false, 'a hidden copy that changed nothing is not taken over; one that did is (' + JSON.stringify(SR) + ')');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
