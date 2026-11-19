// 🎬 Render with a clip selected adds a take to that clip (Jordan 2026-11-19: "when I have a clip selected hitting render adds to its
// choices rather than being something independent. If I want an independent clip I can hit the +clip button").
// Run: NODE_PATH=$(npm root -g) node tests/t_seltake.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['a.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'Video Slice','ImageFromBatch','TrimAudioDuration','SplitSigmas','DisableNoise','SamplerCustom','CFGGuider','ManualSigmas','NAGuidance','ModelSamplingSD3'];
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8113);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}, hasTouch:true});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let n = 0;
  for(const U of [R, M]) await page.route(U + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p.startsWith('/history')) return J({}); if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/prompt') return J({prompt_id:'p' + (++n)});
    if(p.startsWith('/upload')) return J({name:'x.png', subfolder:'', type:'input'});
    return rt.fulfill({status:404, headers:H, body:''}); });
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const base = {model:'singularityV2X10eros_prismPIKA', turbo:false, loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x', pc:R, w:864, h:480, state:'done', film:'s2', pieces:[{deliv:120, gen:124, ctx:0, state:'done', pid:'p', file:F('p.mp4')}]};
  const tk = (id, x) => Object.assign({}, base, {id, name:'h3_' + id, prompt:'<Subject 1> walks in.', final:F(id + '.mp4'), t:1000}, x || {});
  // tB is a ➕ carry-on of tA (the usual kind of clip in Jordan's films)
  const deck = {bare:true, pcs:[{name:'Render', url:R, on:true}, {name:'Main', url:M, on:true}], tab:'films', takes:[tk('tA'), tk('tB', {t:1500, prompt:'[0s-1s] The scene keeps carrying on from the moment before. [1s-] She sits down.', cont:{take:'tA'}, contCut:4.5, contSecs:4.5, carry:{src:'tA', at:4.5, film:'s2', clip:'a', key:'k0', own:true}})], forms:{}, casts:{}, up:{}, lib:[], media:{}};
  const ed = {films:[{id:'s2', name:'Shot', movie:'mv', pps:24, canvas:'wide', tracks:[{id:'t1', clips:[{id:'a', take:'tA', in:0, out:4.5, dur:5, at:0}, {id:'b', take:'tB', in:0, out:5, dur:5, at:4.5}]}]}],
    movies:[{id:'mv', name:'Film', shots:['s2']}], nav:{v:'film', film:'s2'}, placed:{k0:true}};
  await page.addInitScript(([r, m, d, e]) => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1.26}]; window.FILM_PCS = window.H3_PCS; if(sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear();
    localStorage.setItem('h3deck', JSON.stringify(d)); localStorage.setItem('h3edit', JSON.stringify(e)); }, [R, M, deck, ed]);
  await page.goto('http://127.0.0.1:8113/index.html'); await page.waitForFunction(() => window.H3 && H3.S && document.querySelector('#filmTab iframe'), null, {timeout:20000});
  await page.waitForFunction(() => H3.families().length >= 2, null, {timeout:20000}); await page.waitForTimeout(1500);
  const fr = () => page.frames().find(f => /\/film\//.test(f.url()));
  const clips = () => fr().evaluate(() => FILM.S.films[0].tracks[0].clips.map(c => ({id:c.id, take:c.take, alts:c.alts || []})));
  const newest = () => page.evaluate(() => H3.S.takes.slice().sort((a, b) => b.t - a.t)[0]);
  const tapClip = async id => { await fr().click('#tl .clip[data-c="' + id + '"]', {position:{x:60, y:10}, force:true}); await page.waitForTimeout(700); };
  const label = () => page.$eval('#goBtn', b => b.textContent);
  const render = async () => { console.log('  button:', await label()); await page.evaluate(() => { const b = document.getElementById('goBtn'); b.disabled = false; b.click(); }); await page.waitForTimeout(2500); console.log('  info:', await page.evaluate(() => [H3.S.takes.length, document.getElementById('goBtn').textContent, (document.querySelector('.toast') || {}).textContent, H3.S.f.prompt].join(' / '))); };
  // 1) the plain first clip selected → Render → a take of clip a
  await tapClip('a'); ok(await fr().evaluate(() => FILM.SEL)==='a', 'clip a is selected');
  ok(await label()==='Render another take of this clip', 'the Render button says it makes another take of the clip');
  const n0 = (await clips()).length; await render(); let t = await newest();
  ok(t && t.toFilm && t.toFilm.clip==='a', 'the new take is for clip a (' + JSON.stringify(t && t.toFilm) + ', carry ' + JSON.stringify(t && t.carry) + ')');
  await fr().evaluate(() => { FILM.placeNew(); FILM.draw(); }); await page.waitForTimeout(300); let cs = await clips();
  ok(cs.length===n0 && cs[0].alts.includes(t.id), 'no new clip; it is one of clip a\'s takes (' + JSON.stringify(cs) + ')');
  // 2) the carry-on clip selected → Render → a take of clip b, not another carry-on after it
  await tapClip('b'); ok(await fr().evaluate(() => FILM.SEL)==='b', 'clip b is selected');
  await render(); t = await newest();
  ok(t && t.toFilm && t.toFilm.clip==='b', 'the new take is for clip b (' + JSON.stringify(t && t.toFilm) + ', carry ' + JSON.stringify(t && t.carry) + ')');
  await fr().evaluate(() => { FILM.placeNew(); FILM.draw(); }); await page.waitForTimeout(300); cs = await clips();
  ok(cs.length===n0 && (cs.find(c => c.id==='b') || {alts:[]}).alts.includes(t.id), 'no new clip; it is one of clip b\'s takes (' + JSON.stringify(cs) + ')');
  // 2b) after a ➕ Carry on (the form stays set up to carry on), tapping a clip and Render still adds a take to THAT clip
  await tapClip('a'); await page.evaluate(() => H3Carry({take:'tA', at:3, film:'s2', clip:'a'})); await page.waitForTimeout(500);
  await page.evaluate(() => { H3.S.f.prompt = '[0s-1s] The scene keeps carrying on from the moment before. [1s-] She waves.'; document.getElementById('prompt').value = H3.S.f.prompt; });
  ok(await label()==='Render', 'after ➕ Carry on the button is plain Render (its new part)');
  await render(); t = await newest(); ok(t && t.carry && t.carry.clip==='a', 'the ➕ carry-on is sent');
  await fr().evaluate(() => { FILM.placeNew(); FILM.draw(); }); await page.waitForTimeout(300); cs = await clips(); const nc = cs.find(c => c.take===t.id);
  ok(cs.length===n0 + 1 && nc, 'the carry-on is its own new clip after clip a (' + JSON.stringify(cs) + ')');
  for(const id of ['b', nc && nc.id, 'a']){ if(!id) continue; await tapClip(id); const was = (await clips()).length;
    await render(); t = await newest(); await fr().evaluate(() => { FILM.placeNew(); FILM.draw(); }); await page.waitForTimeout(300); cs = await clips();
    const c = cs.find(x => x.id===id) || {alts:[]};
    ok(cs.length===was && (c.alts.includes(t.id) || c.take===t.id), 'after carrying on, tap clip ' + id + ' + Render = one of its takes (toFilm ' + JSON.stringify(t.toFilm) + ', carry ' + JSON.stringify(t.carry) + ', ' + JSON.stringify(cs) + ')'); }
  const n1 = (await clips()).length;
  // 3) ＋ Clip › Make a new one → Render → a new clip on the end
  await fr().evaluate(() => { document.querySelector('[data-act="addClip"]').click(); }); await page.waitForTimeout(200);
  await fr().evaluate(() => document.querySelector('#sheetCard [data-act="clipNew"]').click()); await page.waitForTimeout(400);
  ok(await fr().evaluate(() => FILM.SEL)===null, '＋ Clip › Make a new one lets go of the clip');
  await render(); t = await newest();
  ok(t && t.toFilm && !t.toFilm.clip, 'the take is a new clip (' + JSON.stringify(t && t.toFilm) + ')');
  await fr().evaluate(() => { FILM.placeNew(); FILM.draw(); }); await page.waitForTimeout(300); cs = await clips();
  ok(cs.length===n1 + 1 && cs.some(c => c.take===t.id), 'it is on the end of the timeline');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
