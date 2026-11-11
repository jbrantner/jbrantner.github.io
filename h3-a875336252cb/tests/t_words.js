// ✍ words-only clothing and attributes (no picture): sent in the person's description, per shot.
// Run: NODE_PATH=$(npm root -g) node tests/t_words.js
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
  let P;
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> walks to the window.', descOff:{}});
    H3.S.media.p1 = {id:'p1', kind:'img', name:'p1.png', w:640, h:352, thumb:''};
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact', attrs:[]}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  P = await prom(R, REF); ok(/is nude/.test(P.p), 'start: no outfit = nude');
  // ✍ type it in from the character's ＋ Clothing sheet
  await page.click('#castList [data-cn="1"] [data-cast="wear"]');
  ok(await page.evaluate(() => !!document.querySelector('#apWords')), 'the 👗 Clothing sheet has a ✍ type-it box');
  await page.fill('#apWords', 'a grey knit sweater'); await page.click('[data-ap="words"]');
  const L = await page.evaluate(() => { const c = H3.S.cast[0], L = H3.S.lib.find(x => x.kind==='wear' && x.desc==='a grey knit sweater'); return L && {id:L.id, name:L.name, pics:L.pics.length, on:c.attrs.includes(L.id)}; });
  ok(L && L.name==='a grey knit sweater' && !L.pics && L.on, 'it becomes a words-only 👗 Library entry put on her: ' + JSON.stringify(L));
  P = await prom(R, REF);
  ok(!/nude/.test(P.p), 'dressed now: not nude');
  ok(/<Subject 1> is Laura, as shown in <Picture 1>\. Wearing a grey knit sweater\./.test(P.p), 'H3 way: her definition carries the words: ' + (P.p.match(/<Subject 1> is Laura[^\n]*/) || [''])[0]);
  ok(/clothing from that picture is NOT kept: <Subject 1> wears the clothes described in the words instead/.test(P.p), 'her picture\'s clothes are not kept');
  ok(P.imgs.join()==='p1.png', 'no extra picture sent: ' + P.imgs);
  // per shot: its chip
  const chip = await page.evaluate(id => H3.descChips(H3.S.cast[0]).find(x => x.key==='attr:' + id), L.id);
  ok(chip && /grey knit sweater/.test(chip.label), 'it has a chip for the shot: ' + (chip && chip.label));
  await page.evaluate(id => { H3.S.f.descOff = {1:['attr:' + id]}; H3.drawAll(); }, L.id); P = await prom(R, REF);
  ok(!/sweater/.test(P.p) && /is nude/.test(P.p), 'chip off in this shot: no sweater (nude again)');
  // ✨ attribute in words
  await page.evaluate(() => { H3.S.f.descOff = {}; H3.drawAll(); });
  await page.click('#castList [data-cn="1"] [data-cast="attr"]');
  await page.fill('#apWords', 'freckles across her nose'); await page.press('#apWords', 'Enter');
  P = await prom(R, REF);
  ok(/Wearing a grey knit sweater, freckles across her nose\./.test(P.p), '✨ words attribute too: ' + (P.p.match(/<Subject 1> is Laura[^\n]*/) || [''])[0]);
  // plain prompt
  await page.evaluate(() => { H3.S.f.h3 = false; H3.drawAll(); }); P = await prom(R, REF);
  ok(/<Subject 1> is Laura, as shown in <Picture 1>\. Wearing a grey knit sweater, freckles across her nose\./.test(P.p), 'plain prompt too: ' + P.p.slice(0, 160));
  // no picture: in the stand-in description
  await page.evaluate(() => { H3.S.cast[0].pics = []; H3.S.cast[0].stand = 'a woman'; H3.drawAll(); }); P = await prom(R, REF);
  ok(/The woman: wearing a grey knit sweater, freckles across her nose\./.test(P.p) && !/nude/.test(P.p), 'no picture: in her description: ' + P.p.slice(0, 160));
  // the same words again reuse the entry; a Library entry with a picture is unchanged
  await page.evaluate(() => { H3.S.cast[0].pics = ['p1']; H3.S.f.h3 = true; H3.drawAll(); });
  await page.click('#castList [data-cn="1"] [data-cast="wear"]'); await page.fill('#apWords', 'A grey knit sweater.'); await page.click('[data-ap="words"]');
  ok(await page.evaluate(() => H3.S.lib.filter(x => x.kind==='wear').length===1), 'typing the same words again reuses the entry');
  // Library editor note
  await page.evaluate(id => H3.openLib(id), L.id);
  ok(await page.evaluate(() => /No picture: these words/.test(document.querySelector('#lbBox').textContent)), 'the Library entry says its words are sent');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
