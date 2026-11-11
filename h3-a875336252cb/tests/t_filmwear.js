// 🎞 clothing just for this film: kept with one film, the Library character untouched.
// Run: NODE_PATH=$(npm root -g) node tests/t_filmwear.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8032);
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
  await page.goto('http://127.0.0.1:8032/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', p4:'p4.png', dr:'dr.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);
  let P;
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> walks to the window.', descOff:{}});
    H3.S.media.p1 = {id:'p1', kind:'img', name:'p1.png', w:640, h:352, thumb:''};
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact', attrs:[]}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.evaluate(() => { H3.S.fkey = 'fA'; H3.drawAll(); });
  // ✍ typed clothing goes to this film by default
  await page.click('#castList [data-cn="1"] [data-cast="wear"]');
  ok(await page.evaluate(() => /Just for this film/.test(document.querySelector('#apBox').textContent)), 'the 👗 sheet offers 🎞 Just for this film');
  await page.fill('#apWords', 'a grey knit sweater'); await page.click('[data-ap="words"]');
  const A = await page.evaluate(() => { const L = H3.S.lib.find(x => x.desc==='a grey knit sweater'); return L && {id:L.id, film:L.film, on:H3.S.cast[0].attrs.includes(L.id)}; });
  ok(A && A.film==='fA' && A.on, 'it is kept with this film and put on her: ' + JSON.stringify(A));
  P = await prom(R, REF); ok(/Wearing a grey knit sweater/.test(P.p) && !/nude/.test(P.p), 'sent as her clothing');
  ok(await page.evaluate(() => { H3.setTab('lib'); return /🎞 just for this film/.test(document.querySelector('#libTab').textContent); }), 'the Library shows it marked 🎞 while this film is open');
  // another film: not seen
  await page.evaluate(() => { H3.S.fkey = 'fB'; H3.S.cast = [{n:1, kind:'char', who:'Mia', pics:['p1'], keep:'exact', attrs:[]}]; H3.drawAll(); });
  const B = await page.evaluate(id => ({chips:H3.descChips(H3.S.cast[0]).some(x => x.key==='add:' + id), lib:(H3.setTab('lib'), document.querySelector('#libTab').innerHTML.includes(id))}), A.id);
  ok(!B.chips && !B.lib, 'another film doesn\'t see it (no shot chip, not in the Library): ' + JSON.stringify(B));
  // 📚 In the Library: shared
  await page.evaluate(() => H3.setTab('render')).catch(() => {});
  await page.evaluate(() => { document.querySelector('#castList [data-cn="1"] [data-cast="wear"]').click(); });
  ok(await page.evaluate(id => !document.querySelector('#apBox [data-ap="' + id + '"]'), A.id), 'film A\'s clothing isn\'t in film B\'s picker');
  await page.evaluate(() => document.querySelector('[data-ap="where:lib"]').click());
  await page.evaluate(() => { document.querySelector('#apWords').value = 'a red coat'; document.querySelector('[data-ap="words"]').click(); });
  const C = await page.evaluate(() => { const L = H3.S.lib.find(x => x.desc==='a red coat'); return L && {film:L.film || '', on:H3.S.cast[0].attrs.includes(L.id)}; });
  ok(C && !C.film && C.on, 'with 📚 In the Library it is kept for every film: ' + JSON.stringify(C));
  // move a film-only one to the Library
  await page.evaluate(() => { H3.S.fkey = 'fA'; H3.drawAll(); });
  await page.evaluate(id => { H3.openLib(id); document.querySelector('#lbBox [data-lb="tolib"]').click(); }, A.id);
  ok(await page.evaluate(id => !H3.S.lib.find(x => x.id===id).film, A.id), '📚 Keep it in the Library makes it for every film');
  // 👗 Wear the outfit in their pictures: just this film for a Library character
  await page.evaluate(() => { const L = H3.libNew('char'); L.name = 'Laura'; L.pics = ['p1']; L.fit = false; H3.S.cast = []; const c = H3.libToCast(L); H3.drawAll(); });
  await page.evaluate(() => { H3.setTab('render'); }).catch(() => {});
  await page.evaluate(() => document.querySelector('#castList [data-cast="fit"]').click());
  const F = await page.evaluate(() => { const c = H3.S.cast[0], L = H3.S.lib.find(x => x.id===c.lib); return {here:c.fitHere, lib:!!L.fit, note:/Just for this film/.test(document.querySelector('#castList').textContent)}; });
  ok(F.here===true && !F.lib && F.note, '👗 own-outfit switch changes only this film: ' + JSON.stringify(F));
  P = await prom(R, REF); ok(/wears exactly the outfit|their own outfit/.test(P.p), 'and it is used in this film');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
