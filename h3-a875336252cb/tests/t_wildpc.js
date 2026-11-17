// H3 Deck 🎲 Wildcards only PC (Jordan 2026-11-17: "a switch ... moves all wildcard jobs onto the current computer that is switched on and that
// computer only accepts wildcard jobs"). Two fake ComfyUIs answered in the browser. Run: NODE_PATH=$(npm root -g) node tests/t_wildpc.js
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
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8037);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  // each fake PC: its line of prompt ids; the first is running when .run is set
  const PCS = {[R]:{name:'Render', line:[], run:false, dels:[], n:0}, [M]:{name:'Main', line:[], run:false, dels:[], n:0}};
  for(const base of [R, M]) await page.route(base + '/**', async rt => { const P = PCS[base], u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(rt.request().method()==='OPTIONS') return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*'}, body:''});
    if(p==='/system_stats') return J({devices:[]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST'){ const b = JSON.parse(rt.request().postData() || '{}'); if(b.delete){ P.dels.push(...b.delete); P.line = P.line.filter(id => !b.delete.includes(id) || (P.run && id===P.line[0])); } return J({}); }
    if(p==='/queue'){ const run = P.run && P.line.length ? [[0, P.line[0]]] : []; return J({queue_running:run, queue_pending:P.line.slice(run.length).map((id, i) => [i + 1, id])}); }
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_' + P.name, images:[]});
    if(p==='/prompt'){ const pid = P.name[0] + (++P.n); P.line.push(pid); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(([r, m]) => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1.26}]; }, [R, M]);
  await page.goto('http://127.0.0.1:8037/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});

  const pcsOf = () => page.evaluate(() => H3.S.takes.map(t => ({id:t.id, pc:t.pc, film:t.film, pids:t.pieces.map(p => p.pid), st:t.pieces.map(p => p.state), state:t.state})));
  // 6 plain 5 s takes, both PCs
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'She walks down the street.', seconds:5, maxPiece:5, takes:6, seed:'', where:'both'}); H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(3000);
  let T = await pcsOf(); console.log(JSON.stringify(T));
  ok(T.length===6 && T.some(t => t.pc===R) && T.some(t => t.pc===M), 'the batch is split over both PCs');
  // Render is running its first one; two of Main's waiting takes (and one of Render's waiting) are 🎲 Wildcard clips
  PCS[R].run = true;
  const onM = T.filter(t => t.pc===M), onR = T.filter(t => t.pc===R), runId = T.find(t => t.pids.includes(PCS[R].line[0])).id;
  const wildIds = onM.slice(0, 2).map(t => t.id).concat(onR.filter(t => t.id!==runId).slice(0, 1).map(t => t.id));
  await page.evaluate(ids => { H3.S.takes.forEach(t => { if(ids.includes(t.id)) t.film = '~wild'; }); }, wildIds);
  ok(await page.evaluate(id => H3.wildJob(H3.S.takes.find(t => t.id===id)), wildIds[0]), 'a take in 🎲 Wildcard clips counts as a wildcard job');
  ok(await page.evaluate(() => H3.wildJob({redo:{src:H3.S.takes.find(t => t.film==='~wild').id}})), 'a pass made from a wildcard clip counts too');
  ok(!(await page.evaluate(() => H3.wildJob({film:''}))), 'a one-off take does not');
  ok(!(await page.evaluate(() => H3.wildJob({film:'f1', wild:{1:{a:['x'], picks:[]}}}))), 'a film take with a 🎲 rolled character does not (only the 🎲 Wildcards tab counts)');
  // nothing moves before the switch
  ok(await page.evaluate(() => H3.wildSweep(true))===0, 'with no 🎲 PC nothing moves');
  // 🎲 Render takes Wildcard clips only
  await page.evaluate(() => { H3.S.pcs[0].wild = true; });
  const why = await page.evaluate(() => H3.wildBlock('http://render.test', {film:'', pieces:[{gen:121}], imgs:[], vids:[], auds:[], follow:[], model:H3.S.f.model}));
  ok(/Wildcard/.test(why), 'Render refuses a plain take: ' + why);
  ok(/Render/.test(await page.evaluate(() => H3.wildBlock('http://main.test', {film:'~wild', pieces:[{gen:121}], imgs:[], vids:[], auds:[], follow:[], model:H3.S.f.model}))), 'Main leaves Wildcard clips to Render');
  let moved = 0; for(let i = 0; i < 4; i++) moved += await page.evaluate(() => H3.wildSweep(true));
  T = await pcsOf(); console.log(moved + ' moved', JSON.stringify(T));
  ok(T.filter(t => t.film==='~wild').every(t => t.pc===R), 'every waiting Wildcard clip is on Render now');
  ok(T.filter(t => t.film!=='~wild' && t.id!==runId).every(t => t.pc===M), 'every waiting plain take is on Main now');
  ok(T.find(t => t.id===runId).pc===R, 'the take Render is already running stays');
  ok(T.filter(t => t.film==='~wild' && wildIds.slice(0, 2).includes(t.id)).every(t => t.pids.every(p => /^R/.test(p))), 'the moved ones were sent to Render\'s line');
  // new takes follow the switch, even with "Main only" picked for the wildcards
  const pick = await page.evaluate(() => { H3.S.f.where = 'http://main.test'; const a = H3.pickPc({film:'~wild', pieces:[{gen:121}], imgs:[], vids:[], auds:[], follow:[], model:H3.S.f.model}); H3.S.f.where = 'both'; const b = H3.pickPc({film:'', pieces:[{gen:121}], imgs:[], vids:[], auds:[], follow:[], model:H3.S.f.model}); return [a, b]; });
  ok(pick[0]===R && pick[1]===M, 'a new Wildcard clip goes to Render, a new plain take to Main (' + pick.join(', ') + ')');
  // Main free: ⇄ doesn't take Wildcard clips back off Render
  PCS[M].line = []; await page.evaluate(M => { H3.S.takes.filter(t => t.pc===M).forEach(t => { t.pieces.forEach(p => { p.state = 'done'; }); t.state = 'done'; }); }, M);
  ok(await page.evaluate(() => H3.rebalance())===0, 'a free Main does not take Wildcard clips from Render');
  // Main switched off: plain takes don't get stuck, Render takes them
  await page.evaluate(() => { H3.S.pcs[1].on = false; });
  ok(!(await page.evaluate(() => H3.wildBlock('http://render.test', {film:'', pieces:[{gen:121}], imgs:[], vids:[], auds:[], follow:[], model:H3.S.f.model}))), 'with Main off, Render still takes a plain take');
  await page.evaluate(() => { H3.S.pcs[1].on = true; });
  // Render switched off or unreachable: Main takes Wildcard clips again
  await page.evaluate(() => { H3.S.pcs[0].on = false; });
  ok(!(await page.evaluate(() => H3.wildBlock('http://main.test', {film:'~wild'}))), 'with Render off, Main can take Wildcard clips');
  // the switch is one PC at a time
  await page.evaluate(() => { H3.S.pcs[0].on = true; H3.setWild(H3.S.pcs[1]); });
  ok(await page.evaluate(() => !H3.S.pcs[0].wild && H3.S.pcs[1].wild && H3.S.pcs[1].on), 'turning it on for Main turns it off for Render');
  // the 🖥 PCs sheet shows the switch
  await page.evaluate(() => document.querySelector('#pcDots').click()); await page.waitForTimeout(500);
  ok(await page.$$eval('[data-pcwild]', e => e.length)===2, 'the PCs sheet has a 🎲 Wildcards only switch per PC');
  await page.click('[data-pcwild="0"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => H3.S.pcs[0].wild && !H3.S.pcs[1].wild), 'tapping it on Render makes Render the 🎲 PC');
  await page.screenshot({path:path.join(__dirname, 'wildpc.png')});
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
