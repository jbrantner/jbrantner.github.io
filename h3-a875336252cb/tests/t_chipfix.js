// 🧍🥋 pose / action chips end to end (2026-11-15 audit): ↩ with nobody named, a 📚 Library action chip bringing its clip, action clips in 🎚 Reference strength, a chip whose Library pose is gone
// Run: NODE_PATH=$(npm root -g) node tests/t_chipfix.js
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
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','ConditioningSetTimestepRange','ConditioningCombine'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
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
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  const NAMES = {p1:'p1.png', p2:'p2.png', q1:'q1.png', k1:'k1.png', v1:'v1.mp4'};
  // every ReferenceToVideo node: its picture and video inputs (as fit outputs), its prompt; the timestep stages
  const graph = () => page.evaluate(([R, NAMES]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, NAMES).g, N = Object.values(g), rvs = N.filter(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    const ins = (rv, re) => Object.keys(rv.inputs).filter(k => re.test(k)).sort().map(k => rv.inputs[k][1]).join(',');
    return {n:rvs.length, pics:rvs.map(r => ins(r, /^ref_images\./)), vids:rvs.map(r => ins(r, /^ref_videos\./)), prompts:rvs.map(r => r.inputs.prompt),
      tr:N.filter(n => n.class_type==='ConditioningSetTimestepRange').map(n => [rvs.indexOf(g[n.inputs.conditioning[0]]), n.inputs.start, n.inputs.end]), loads:N.filter(n => n.class_type==='LoadVideo').map(n => n.inputs.file)}; }, [R, NAMES]);
  const rows = () => page.evaluate(() => { H3.h3Peek(); return [...document.querySelectorAll('#rstrList .lab > span')].map(s => s.textContent); });
  const label = () => page.evaluate(() => [...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n));
  const setP = p => page.evaluate(p => { H3.S.f.prompt = p; document.querySelector('#prompt').value = p; H3.drawAll(); }, p);
  // Jordan's set-up: a film cast, a 📚 Library pose and a 📚 Library action with a clip, and prompts that are only a chip ("<Pose 7>.")
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], vids:[], fl:false, seconds:5, h3:true, shuffle:0, fillRefs:false, rstr:{}, prompt:''});
    ['p1', 'p2', 'q1', 'k1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''}); H3.S.media.v1 = {id:'v1', kind:'vid', name:'v1.mp4', w:640, h:352, dur:4, thumb:''};
    H3.S.cast = [{n:2, kind:'char', who:'Aphmau', pics:['q1'], keep:'exact'}, {n:3, kind:'char', who:'Laur', pics:['p1', 'p2'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lk', kind:'pose', name:'Kneel', pics:['k1'], desc:'Kneeling on the bed.', ppl:[]}, {id:'La', kind:'act', name:'Twirl', what:'Spins on the spot', pics:[], vid:'v1'}]);
    H3.S.dlWho = 3; H3.S.lines = {}; H3.S.lineNo = 0; document.querySelector('#prompt').value = ''; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);

  // 1. 🧍 pose chip with ↩ (the default) and nobody named in the words: it used to go to nobody (no picture, nothing in 🎚)
  await page.click('#tagBar [data-psn]'); await page.waitForTimeout(150); await page.click('#pcLib [data-pl="Lk"]');
  let prev = await page.textContent('#pcPrev');
  ok(/Laur kneeling on the bed, in the pose/.test(prev) && /nobody is named before it, so Laur takes it/.test(prev), 'the sheet says who takes it when nobody is named: ' + prev);
  await page.click('#pcGo'); await page.waitForTimeout(200);
  let L = await page.evaluate(() => H3.lineOf(1));
  ok(L.n===3 && L.auto===1, 'the chip goes to Laur (the last one picked) and stays ↩: ' + JSON.stringify(L));
  ok((await label()).join()==='🧍 Laur · Kneel', 'chip label: ' + await label());
  ok((await rows()).join('|')==='👥 Laur (2 pictures)|🧍 Pose / action references', 'the pose shows in 🎚 Reference strength: ' + (await rows()).join('|'));
  let G = await graph(); ok(G.pics[0].split(',').length===3 && /kneeling on the bed, in the pose/.test(G.prompts[0]), 'her 2 pictures and the pose picture go: ' + G.pics[0]);
  // naming someone before it moves it; taking the name out again keeps the last one
  await setP('<Subject 2> smiles. <Pose 1>.'); await page.evaluate(() => H3.autoSync(H3.S.f)); ok(await page.evaluate(() => H3.lineOf(1).n)===2, '↩ follows Aphmau once she is named before it');
  await setP('<Pose 1>.'); await page.evaluate(() => H3.autoSync(H3.S.f)); ok(await page.evaluate(() => H3.lineOf(1).n)===2, 'with nobody named it stays with Aphmau instead of going to nobody');
  // an older chip saved with nobody: labelled so it's seen
  await page.evaluate(() => { H3.S.lines[1].n = 0; delete H3.S.lines[1].auto; H3.drawAll(); }); ok((await label()).join()==='🧍 ❓ who? · Kneel', 'a chip with nobody says so: ' + await label());

  // 2. a chip whose 📚 Library pose was deleted, or has no picture: marked ⚠ and the sheet says why
  await page.evaluate(() => { Object.assign(H3.S.lines[1], {n:3, lib:'Lgone'}); H3.drawAll(); });
  ok((await label()).join()==='🧍 Laur · Kneel ⚠', 'a chip whose Library pose is gone is marked: ' + await label());
  await page.evaluate(() => H3.poseChSheet(1)); await page.waitForTimeout(150);
  ok(/no longer in the 📚 Library/.test(await page.textContent('#pcPrev')), 'its sheet says the pose is gone: ' + await page.textContent('#pcPrev'));
  await page.evaluate(() => document.querySelector('[data-close]').click());

  // 3. 🥋 action chip picked from the 📚 Library: its clip goes along for Laur, worded as motion only, and shows in 🎚
  await setP(''); await page.evaluate(() => { H3.S.lines = {}; H3.S.lineNo = 0; H3.drawAll(); });
  await page.click('#tagBar [data-acn]'); await page.waitForTimeout(150);
  ok((await page.textContent('#acBook')).includes('🎞 Twirl'), 'Library actions with a clip are marked 🎞 in the picks');
  await page.click('#acBook [data-ab="0"]'); prev = await page.textContent('#acPrev');
  ok(/Laur spins on the spot/.test(prev) && /Library clip goes along/.test(prev), 'the sheet says the clip goes along: ' + prev);
  await page.click('#acGo'); await page.waitForTimeout(200);
  L = await page.evaluate(() => H3.lineOf(1)); ok(L.act && L.n===3 && L.lib==='La', 'the chip remembers its Library action: ' + JSON.stringify(L));
  ok((await rows()).join('|')==='👥 Laur (2 pictures)|🧍 Pose / action references', 'the action clip shows in 🎚 Reference strength: ' + (await rows()).join('|'));
  G = await graph(); const det = G.prompts[0].split('detailed_description:')[1] || '';
  ok(G.n===1 && G.vids[0]!=='' && G.loads.includes('v1.mp4'), 'the clip is sent as a reference video: ' + JSON.stringify(G.vids) + ' ' + G.loads);
  ok(/is the Spins on the spot, the movement performed in <Video 1>/.test(G.prompts[0]) && /stand-in/.test(G.prompts[0]) && /<Subject 1> spins on the spot/.test(det), 'worded as motion only, for Laur: ' + det.slice(0, 300));
  // an older chip (no lib) whose name matches a Library action brings the clip too; a made-up action stays words only
  await page.evaluate(() => { delete H3.S.lines[1].lib; }); G = await graph(); ok(G.loads.includes('v1.mp4'), 'an older chip finds its Library action by name');
  await page.evaluate(() => { H3.S.lines[1].name = 'Wave'; H3.S.lines[1].text = 'waves'; }); G = await graph(); ok(!G.loads.length && (await rows()).join('|')==='👥 Laur (2 pictures)', 'an action not in the Library: words only, no slider');
  await page.evaluate(() => { Object.assign(H3.S.lines[1], {name:'Twirl', text:'spins on the spot', lib:'La'}); });

  // 4. 🎚 the action clip's Stops: it drops out of the later steps (the second reference node has no video, its words stand in)
  await page.evaluate(() => { H3.S.f.rstr = {p:{s:0, e:40}}; H3.drawAll(); });
  G = await graph();
  ok(G.n===2 && G.vids[0]!=='' && G.vids[1]==='' && JSON.stringify(G.tr)==='[[0,0,0.4],[1,0.4,1]]', 'clip for 0-40%, none after: ' + JSON.stringify({v:G.vids, tr:G.tr}));
  ok(!/<Video 1>/.test(G.prompts[1]) && /spins on the spot/.test(G.prompts[1]), 'the later node has no <Video 1>, the chip words stay');
  // the same action on her card (not a chip) gets the slider too, and is never sent twice
  await page.evaluate(() => { H3.S.cast[1].acts = [{id:'La', to:0}]; H3.S.f.rstr = {}; H3.drawAll(); });
  G = await graph(); ok(G.loads.filter(x => x==='v1.mp4').length===1 && (await rows()).join('|')==='👥 Laur (2 pictures)|🧍 Pose / action references', 'card + chip: one clip, one slider');
  await page.evaluate(() => { H3.S.f.prompt = '<Subject 3> stretches.'; H3.drawAll(); });
  ok((await rows()).join('|')==='👥 Laur (2 pictures)|🧍 Pose / action references', 'a card action alone shows in 🎚 too: ' + (await rows()).join('|'));

  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
