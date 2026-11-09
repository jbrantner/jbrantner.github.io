// 👥 name chips over <Subject n> tags (tap to swap who it is) and 👗 their own outfit as the clothing reference.
// Run: NODE_PATH=$(npm root -g) node tests/t_chips.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8027);
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
  await page.goto('http://127.0.0.1:8027/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (R, REF) => page.evaluate(([R, REF]) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', p3:'p3.png', p4:'p4.png', dr:'dr.png', a:'a.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, REF]);
  let P;
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> walks to the window. <Subject 1> waves at <Subject 2>.'});
    ['p1', 'p2', 'p3', 'p4'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['p2'], keep:'exact'}, {n:4, kind:'char', who:'Zoe', pics:['p3'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lkat', kind:'char', name:'Kat', stand:'a woman', desc:'', pics:['p4'], keep:'exact'}]);
    H3.S.takes.unshift({id:'tk1', t:Date.now(), pc:'x', model:REF, turbo:false, w:640, h:352, seconds:5, prompt:'<Subject 1> sits down.', imgs:[], vids:[], auds:[], follow:[], pieces:[{prompt:'<Subject 1> sits down.'}], state:'done'});
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  const HL = await page.evaluate(() => [...document.querySelectorAll('#promptHl mark')].map(m => [m.dataset.n, m.textContent, m.style.getPropertyValue('--cc')]));
  ok(HL.length===3 && HL.map(x => x[0]).join()==='Laura,Laura,Mia' && HL[0][1]==='<Subject 1>' && HL[0][2]!==HL[2][2] && await page.evaluate(() => document.querySelector('#prompt').value.includes('<Subject 1>')), '👥 each tag is a coloured chip with the name over the box, the words keep <Subject n>: ' + JSON.stringify(HL));
  const geo = await page.evaluate(() => { const a = document.querySelector('#prompt').getBoundingClientRect(), b = document.querySelector('#promptHl').getBoundingClientRect(); return [Math.round(a.width - b.width), Math.round(b.left - a.left), Math.round(b.top - a.top)]; });
  ok(geo[0] >= 0 && geo[0] <= 4 && geo[1]===1 && geo[2]===1, 'the chip layer sits exactly over the words: ' + geo);
  // tap a tag → 👥 Who is it?
  const tap = async pos => { await page.evaluate(p => { const ta = document.querySelector('#prompt'); ta.focus(); ta.setSelectionRange(p, p); ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }, pos); };
  await tap(20); ok(await page.evaluate(() => !document.querySelector('#spBox')), 'tapping plain words opens nothing');
  await tap(4);
  const SH = await page.evaluate(() => ({box:!!document.querySelector('#spBox'), opts:[...document.querySelectorAll('#spBox [data-sp]')].map(b => b.dataset.sp)}));
  ok(SH.box && SH.opts.join()==='c:2,c:4,l:Lkat', 'tapping a tag opens 👥 Who is it?: the other subjects and Library characters: ' + SH.opts);
  await page.click('[data-sp="c:4"]');
  let W = await page.evaluate(() => ({f:H3.S.f.prompt, ta:document.querySelector('#prompt').value, t:H3.S.takes[0].prompt, p:H3.S.takes[0].pieces[0].prompt, names:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n).join()}));
  ok(W.f==='<Subject 4> walks to the window. <Subject 4> waves at <Subject 2>.' && W.ta===W.f && W.t==='<Subject 4> sits down.' && W.p===W.t && W.names==='Zoe,Zoe,Mia', 'Everywhere: <Subject 1> → <Subject 4> in the prompt and the takes, chips say Zoe: ' + JSON.stringify(W));
  // only this prompt
  await tap(W.f.indexOf('<Subject 2>') + 3); await page.click('[data-sps="one"]'); await page.click('[data-sp="c:4"]');
  W = await page.evaluate(() => ({f:H3.S.f.prompt, t:H3.S.takes[0].prompt}));
  ok(W.f==='<Subject 4> walks to the window. <Subject 4> waves at <Subject 4>.' && W.t==='<Subject 4> sits down.', 'Only this prompt: the takes keep theirs');
  // just the one tag tapped (Jordan: "I accidentally made all of the tags the same character… switch only 1 back")
  await tap(W.f.lastIndexOf('<Subject 4>') + 2); ok(await page.evaluate(() => !!document.querySelector('[data-sps="tag"]')), 'a Just this tag choice');
  await page.click('[data-sps="tag"]'); await page.click('[data-sp="c:2"]');
  W = await page.evaluate(() => ({f:H3.S.f.prompt, t:H3.S.takes[0].prompt}));
  ok(W.f==='<Subject 4> walks to the window. <Subject 4> waves at <Subject 2>.' && W.t==='<Subject 4> sits down.', 'Just this tag: only the tapped one changes: ' + W.f);
  await tap(2); await page.click('[data-sps="all"]'); await page.click('[data-close]');
  // from the Library
  await tap(2); await page.click('[data-sp="l:Lkat"]');
  W = await page.evaluate(() => ({f:H3.S.f.prompt, c:H3.S.cast.find(c => c.lib==='Lkat')}));
  ok(W.c && W.f.includes('<Subject ' + W.c.n + '>') && !W.f.includes('<Subject 4>'), '📚 a Library character is added to the film and takes the tag: ' + W.f);
  // 👗 their own outfit
  await page.evaluate(() => { H3.S.f.prompt = '<Subject 1> walks to the window.'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  P = await prom(R, REF);
  ok(!/outfit/.test(P.p), 'off: no outfit lines');
  await page.click('#castList [data-cn="1"] [data-cast="fit"]');
  P = await prom(R, REF); console.log(P.p.split('detailed_description')[0]);
  ok(await page.evaluate(() => H3.S.cast[0].fit===true) && /<Subject 2> is the outfit <Subject 1> wears in <Picture 1>/.test(P.p) && /<Subject 2> \(appears in \[Shot 1\]\): attribute_transfer - the outfit from <Picture 1>/.test(P.p) && /<Subject 1> is wearing <Subject 2> \(their own outfit\)/.test(P.p) && P.imgs.join()==='p1.png', '👗 on: her pictures are also the outfit subject, no extra picture sent (' + P.imgs + ')');
  ok(await page.evaluate(() => [...document.querySelectorAll('#descBar button')].some(b => /Own outfit/.test(b.textContent))), 'a 👗 Own outfit chip shows in the shot\'s details');
  await page.evaluate(() => { H3.S.f.descOff = {1:['fit']}; H3.drawAll(); }); P = await prom(R, REF);
  ok(!/outfit/.test(P.p), 'its 👗 chip off: not in this shot');
  await page.evaluate(() => { H3.S.f.descOff = {}; H3.S.media.dr = {id:'dr', kind:'img', name:'dr.png', w:640, h:352, thumb:''}; H3.S.lib.push({id:'Ldr', kind:'wear', name:'Red dress', what:'dress', pics:['dr'], keep:'exact'}); H3.S.cast[0].attrs = ['Ldr']; H3.drawAll(); });
  P = await prom(R, REF);
  ok(!/own outfit/.test(P.p) && /attribute_transfer - only the dress/.test(P.p) && /clothing from that picture is NOT kept/.test(P.p), 'a ✨ clothing attribute on her: the dress wins, her own outfit is off');
  await page.evaluate(() => { H3.S.cast[0].attrs = []; H3.S.f.h3 = false; H3.drawAll(); }); P = await prom(R, REF);
  ok(/<Subject 1> wears exactly the outfit shown in <Picture 1>/.test(P.p), 'plain prompt: one outfit line: ' + P.p.slice(0, 200));
  // 🫥 no outfit chosen = no clothes (Jordan 2026-11-09), 👗 Clothing its own Library kind
  await page.evaluate(() => { H3.S.f.h3 = true; H3.S.cast[0].fit = false; H3.S.cast[0].attrs = []; H3.S.f.descOff = {}; H3.drawAll(); }); P = await prom(R, REF);
  ok(/<Subject 1> is nude\. <Subject 1> walks/.test(P.p) && /the clothing in that picture is NOT kept: <Subject 1> is nude/.test(P.p), 'no outfit chosen: sent nude, the picture\'s clothes not kept');
  await page.evaluate(() => { H3.S.cast[0].attrs = ['Ldr']; H3.drawAll(); }); P = await prom(R, REF);
  ok(!/nude/.test(P.p) && /<Subject 1> is wearing <Subject 2> \(the dress\)/.test(P.p), '👗 a clothing item on her: dressed in it');
  await page.evaluate(() => { H3.S.cast[0].attrs = []; H3.S.cast[0].fit = true; H3.drawAll(); }); P = await prom(R, REF);
  ok(!/nude/.test(P.p) && /their own outfit/.test(P.p), '👗 their own outfit: dressed');
  await page.evaluate(() => { H3.S.cast[0].fit = false; H3.S.f.descOff = {1:['nude']}; H3.drawAll(); }); P = await prom(R, REF);
  ok(!/nude/.test(P.p) && /clothing and colours from <Picture 1> are kept/.test(P.p), 'its 🫥 chip off: the clothes in the pictures as before');
  await page.evaluate(() => { H3.S.f.descOff = {}; H3.S.cast[0].desc = 'a 16 year old student'; H3.drawAll(); }); P = await prom(R, REF);
  const minorChip = await page.evaluate(() => H3.descChips(H3.S.cast[0]).some(x => x.key==='nude'));
  ok(!/nude/.test(P.p) && !minorChip, 'never for anyone whose words read as under 18');
  await page.evaluate(() => { H3.S.cast[0].desc = ''; H3.S.cast[0].stand = 'a woman'; const p = H3.S.cast[0].pics; H3.S.cast[0].pics = []; H3.S.cast[0]._p = p; H3.drawAll(); }); P = await prom(R, REF);
  ok(/A nude woman walks/.test(P.p), 'no picture: "a nude woman": ' + P.p.slice(0, 160));
  const HQ = await page.evaluate(() => { H3.S.cast[0].pics = H3.S.cast[0]._p; const r = H3.upRefs({prompt:'<Subject 1> walks.', imgs:[]}); return r.some(x => x.nude); });
  ok(!HQ, '✨ High quality / 🎭 Faces passes over a finished video leave its clothes alone');
  const LK = await page.evaluate(() => { H3.setTab('lib'); const k = [...document.querySelectorAll('[data-lib^="f:"]')].map(b => b.textContent); H3.setTab('films'); return k; });
  ok(LK.includes('👗 Clothing') && LK.includes('✨ Attributes'), '📚 Clothing is its own Library kind: ' + LK);
  // Library entry: the switch lives on the entry, every film follows
  const LB = await page.evaluate(() => { const c = H3.S.cast.find(c => c.lib==='Lkat'); H3.openLib('Lkat'); document.querySelector('[data-lb="fit"]').click(); const r = {L:H3.S.lib.find(x => x.id==='Lkat').fit, c:c.fit}; document.querySelector('[data-close]').click(); return r; });
  ok(LB.L===true, '📚 the Library sheet has the 👗 switch: ' + JSON.stringify(LB));
  await page.evaluate(() => { H3.S.f.h3 = true; H3.drawAll(); document.querySelector('#bShot').scrollIntoView(); H3.S.f.prompt = '<Subject 1> takes the hand of <Subject 2> and they walk to <Subject 9>.'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  await page.waitForTimeout(800);
  const WR = await page.evaluate(() => { H3.S.cast.push({n:7, kind:'char', stand:'a tall man', pics:[]}); H3.S.f.prompt = 'Then <Subject 7> and <Subject 1> and <Subject 2> and <Subject 1> and <Subject 2> walk away together down the long road.'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll();
    const M = [...document.querySelectorAll('#promptHl mark')]; return {names:M.map(m => m.dataset.n), wr:M.filter(m => m.classList.contains('wr')).map(m => m.querySelector('i').dataset.n), unwr:M.filter(m => !m.classList.contains('wr')).length}; });
  ok(WR.names[0]==='a tall man' && WR.names.every(x => !/^Subject/.test(x)) && WR.wr.every(x => x && !/^Subject/.test(x)), 'no name yet → its stand-in words; a tag broken over two lines still shows the name: ' + JSON.stringify(WR));
  await page.locator('#prompt').screenshot({path:path.join(__dirname, 'chips.png')}).catch(() => {});
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
