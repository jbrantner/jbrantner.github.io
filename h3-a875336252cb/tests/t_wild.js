// 🎲 Wildcards: options kept apart from the Library, a fresh mix rolled per take, carried on, kept.
// Run: NODE_PATH=$(npm root -g) node tests/t_wild.js
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
  page.on('dialog', d => d.accept());
  const prom = (t) => page.evaluate(([R, t]) => { t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', h1:'h1.png', h2:'h2.png', p2:'p2.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, t]);
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> walks to the window.', descOff:{}});
    for(const id of ['p1', 'h1', 'h2', 'p2']) H3.S.media[id] = {id, kind:'img', name:id + '.png', w:640, h:352, thumb:''};
    H3.S.lib = [{id:'Lmia', kind:'char', name:'Mia', stand:'a woman', desc:'', pics:['p2'], keep:'exact', what:''}];
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact', attrs:[]}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  // the tab
  await page.click('#tabs [data-tab="wild"]');
  ok(await page.evaluate(() => !document.querySelector('#wildTab').hidden && /Outfit/.test(document.querySelector('#wildTab').textContent)), '🎲 Wildcards tab shows its categories');
  await page.click('[data-wt="new:wear"]'); await page.fill('[data-wof="desc"]', 'a red silk slip dress'); await page.click('#sheetCard [data-close]');
  await page.click('[data-wt="new:wear"]'); await page.fill('[data-wof="desc"]', 'a grey knit sweater and jeans'); await page.click('#sheetCard [data-close]');
  await page.click('[data-wt="new:hair"]'); await page.fill('[data-wof="name"]', 'Silver bob');
  await page.fill('[data-wof="desc"]', 'large breasts'); ok(await page.evaluate(() => document.querySelector('#woBust').style.display!=='none'), 'breast words get the warning');
  await page.fill('[data-wof="desc"]', ''); await page.evaluate(() => { const A = H3.S.wlib.find(x => x.name==='Silver bob'); A.pics = ['h1']; }); await page.click('#sheetCard [data-close]');
  const W = await page.evaluate(() => ({n:H3.S.wlib.length, lib:H3.S.lib.length}));
  ok(W.n===3 && W.lib===1, 'options live apart from the 📚 Library: ' + JSON.stringify(W));
  // give Laura the wildcard
  await page.click('#tabs [data-tab="films"]');
  await page.click('#castList [data-cn="1"] [data-cast="wild"]');
  await page.click('[data-ws="cat:wear"]'); await page.click('[data-ws="cat:hair"]'); await page.click('[data-ws="try"]');
  ok(await page.evaluate(() => /Outfit: .*Hair: Silver bob/.test(document.querySelector('#wsTry').textContent)), 'Try a roll shows a mix: ' + await page.evaluate(() => document.querySelector('#wsTry').textContent));
  await page.click('#sheetCard [data-close]');
  // rolls
  const rolls = await page.evaluate(() => { const o = new Set(); for(let i = 0; i < 40; i++){ const t = H3.wildMark(H3.snapshot()); o.add(t.wild[1].picks.map(p => p.label).join('|')); } return [...o]; });
  ok(rolls.length===2, 'takes roll different outfits: ' + rolls.join(' / '));
  const t1 = await page.evaluate(() => { let t; do { t = H3.wildMark(H3.snapshot()); } while(!/sweater/.test(t.wild[1].picks[0].label)); t.id = 'tA'; return t; });
  let P = await prom(t1);
  ok(/grey knit sweater and jeans/.test(P.p) && !/slip dress/.test(P.p), 'the rolled outfit is in the words');
  ok(!/is nude/.test(P.p), 'a rolled outfit dresses her');
  ok(P.imgs.includes('h1.png') && P.imgs.includes('p1.png'), 'the hair picture goes as an attribute picture: ' + P.imgs);
  ok(/hairstyle/.test(P.p), 'the hair is named as a hairstyle: ' + (P.p.match(/[^.]*hairstyle[^.]*\./) || [''])[0]);
  // no wildcard roll: base Laura only
  P = await prom(await page.evaluate(() => H3.snapshot()));
  ok(!/sweater|slip dress/.test(P.p) && !P.imgs.includes('h1.png'), 'a take with no roll is unchanged');
  // carry-on keeps the mix
  const same = await page.evaluate(t1 => { H3.S.takes.unshift(t1); const t = H3.snapshot(); t.carry = {src:t1.id}; H3.wildMark(t); H3.S.takes.shift(); return JSON.stringify(t.wild)===JSON.stringify(t1.wild) && t.wildFrom==='carry'; }, t1);
  ok(same, 'a carry-on keeps the clip before\'s mix');
  // who
  await page.evaluate(() => { H3.S.cast[0].wild.who = ['Lmia']; });
  const tw = await page.evaluate(() => H3.wildMark(H3.snapshot())); P = await prom(tw);
  ok(/<Subject 1> is Mia/.test(P.p) && P.imgs.includes('p2.png') && !P.imgs.includes('p1.png'), '🧑 Who: rolled Library character is sent instead: ' + P.imgs);
  ok(await page.evaluate(() => H3.S.cast[0].who==='Laura'), 'the film\'s cast itself is untouched');
  // keep
  await page.evaluate(t => { H3.S.takes.unshift(Object.assign(t, {id:'tK', state:'done', pieces:t.pieces.map(p => Object.assign(p, {state:'done'}))})); H3.drawAll(); }, tw);
  const kept = await page.evaluate(() => { const t = H3.S.takes[0], b = document.querySelector('[data-take="tK"] [data-act="wildKeep"]'); if(!b) return 'no button'; b.click(); const n = H3.wildMark(H3.snapshot()); return n.wildFrom==='keep' && JSON.stringify(n.wild)===JSON.stringify(t.wild) ? 'ok' : 'differs'; });
  ok(kept==='ok', '🔒 Keep this mix: new takes use it (' + kept + ')');
  { const tx = await page.evaluate(() => (document.querySelector('[data-take="tK"] .wdRoll') || {}).textContent || 'none'); ok(/🎲 .*Laura: Mia/.test(tx), 'take card says what it rolled: ' + tx); }
  await page.evaluate(() => { document.querySelector('#castList [data-cast="wildfree"]').click(); });
  ok(await page.evaluate(() => H3.wildMark(H3.snapshot()).wildFrom!=='keep'), 'Roll again lets the kept mix go');
  // grown-ups only
  await page.evaluate(() => { H3.S.wlib.forEach(A => { if(A.cat==='wear') A.desc = 'a school uniform for a 15 year old'; }); H3.S.cast[0].wild.who = []; });
  ok(await page.evaluate(() => { const t = H3.wildMark(H3.snapshot()); return !t.wild[1].picks.some(p => /school/.test(p.label)); }), 'an option that reads under 18 is never rolled');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
