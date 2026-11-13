// 💬 Dialogue lines: <Dialogue k> chips shown as "Laura line 1", sent as MiniMax H3 dialogue (<Subject n> (S1) says …, <d>[English] …</d>).
// Run: NODE_PATH=$(npm root -g) node tests/t_dialogue.js
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

  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, prompt:'<Subject 1> leans on the counter. '});
    ['p1', 'p2', 'q1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  let bar = await page.evaluate(() => [...document.querySelectorAll('#tagBar button')].map(b => b.textContent));
  ok(bar.includes('💬 ＋ Line'), 'the tag bar has 💬 ＋ Line: ' + bar);
  // add Mia's line through the sheet (cursor at the end)
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-dlg]'); await page.waitForTimeout(200);
  await page.click('#dlWho [data-dw="2"]'); await page.fill('#dlText', 'Did you bring it...'); await page.fill('#dlHow', 'softly');
  let prev = await page.textContent('#dlPrev');
  ok(prev==='Sent to MiniMax as: Mia (S1) says softly, <d>[English] Did you bring it.</d>', 'the sheet shows how it is sent (ellipsis made a full stop): ' + prev);
  await page.fill('#dlText', 'Did you bring it?'); await page.click('#dlGo'); await page.waitForTimeout(200);
  let U = await page.evaluate(() => ({p:H3.S.f.prompt, ta:document.querySelector('#prompt').value, hl:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n)}));
  ok(U.p==='<Subject 1> leans on the counter. <Dialogue 1>' && U.ta===U.p, 'the words get a <Dialogue 1> tag: ' + U.p);
  ok(U.hl.join()==='Laura,Mia line 1', 'it shows as a "Mia line 1" chip: ' + U.hl);
  // Laura answers, then Mia again
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-dlg]'); await page.waitForTimeout(150); await page.click('#dlWho [data-dw="1"]'); await page.fill('#dlText', 'Of course I did'); await page.click('#dlGo'); await page.waitForTimeout(150);
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-dlg]'); await page.waitForTimeout(150); await page.click('#dlWho [data-dw="2"]'); await page.fill('#dlText', 'Show me.'); await page.click('#dlVo'); await page.click('#dlGo'); await page.waitForTimeout(150);
  U = await page.evaluate(() => ({p:H3.S.f.prompt, hl:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n)}));
  ok(U.p==='<Subject 1> leans on the counter. <Dialogue 1> <Dialogue 2> <Dialogue 3>' && U.hl.join()==='Laura,Mia line 1,Laura line 1,Mia line 2', 'three lines, each named per speaker: ' + JSON.stringify(U));
  let P = await prom(R, REF);
  const det = P.p.split('detailed_description:')[1] || '';
  ok(/<Subject 2> \(S1\) says softly, <d>\[English\] Did you bring it\?<\/d>/.test(det), 'Mia speaks first = (S1), even though she is Subject 2: ' + det.slice(0, 400));
  ok(/<Subject 1> \(S2\) says, <d>\[English\] Of course I did\.<\/d>/.test(det), 'Laura = (S2), full stop added');
  ok(/<Subject 2> \(S1\) says in an off-screen voiceover: <d>\[English\] Show me\.<\/d> while their lips remain completely closed\./.test(det), 'voiceover form + lips closed');
  ok(!/Dialogue/.test(P.p) && /<Subject 2> is Mia, as shown in <Picture 3>/.test(P.p) && P.imgs.length===3, 'no raw tag sent; Mia gets her picture because she speaks: ' + P.imgs.length);
  const sum = (P.p.split('summary:')[1] || '').split('retention_analysis')[0]; ok(!/<d>|\(S\d\)/.test(sum), 'the summary has no dialogue tags: ' + sum.trim().slice(0, 200));
  // the [0s-5s] auto start tag stays in front of the words
  ok(/\[Shot 1\] .*\[0s-[\d.]+s\] <Subject 1> leans/.test(det), "the auto start tag still leads: " + (det.match(/\[Shot 1\][^<]*/) || [""])[0]);
  // shuffle: talk stays in order
  await page.evaluate(() => { H3.S.f.prompt = 'Laura wipes the bar. Mia sits down. <Dialogue 1> Laura looks up. <Dialogue 2> Mia smiles. <Dialogue 3> The lights flicker.'; });
  for(let sd = 1; sd < 30; sd++){ const o = await page.evaluate(sd => H3.shuffleWords(H3.S.f.prompt, sd, 1), sd); const ix = [1, 2, 3].map(k => o.indexOf('<Dialogue ' + k + '>'));
    if(!(ix[0] >= 0 && ix[0] < ix[1] && ix[1] < ix[2])){ ok(false, '🔀 kept the lines in order: ' + o); break; } if(sd===29) ok(true, '🔀 never reorders the lines (29 seeds)'); }
  // the checker is told the lines and must keep the tags
  const ck = await page.evaluate(() => H3.ckLines('<Subject 1> waits. <Dialogue 1>', [{n:2, tag:'<Subject 2>', name:'Mia'}]));
  ok(/<Dialogue 1> = Mia says softly: "Did you bring it\?"/.test(ck) && /keep every <Dialogue n> tag/.test(ck), 'the checker gets the line as context: ' + ck);
  // tapping the chip opens it; edit; take it out
  await page.evaluate(() => { H3.S.f.prompt = 'Laura waits. <Dialogue 2>'; const ta = document.querySelector('#prompt'); ta.value = H3.S.f.prompt; H3.drawAll(); });
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); ta.selectionStart = ta.selectionEnd = 16; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(200);
  ok(await page.inputValue('#dlText')==='Of course I did', 'tapping the chip opens that line');
  await page.fill('#dlText', 'Of course.'); await page.click('#dlGo'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => H3.lineOf(2).text==='Of course.' && H3.S.f.prompt==='Laura waits. <Dialogue 2>'), 'Save changes the line, the tag stays');
  // the take keeps its own copy; changing the line later doesn't change that take, ↺ using it again brings its words back
  const snap = await page.evaluate(() => { const t = H3.snapshot(); return t.lines; }); ok(snap && snap[2] && snap[2].text==='Of course.' && !snap[1], 'the take keeps the lines it uses: ' + JSON.stringify(snap));
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); ta.selectionStart = ta.selectionEnd = 16; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(150);
  await page.click('#dlRm'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => H3.S.f.prompt==='Laura waits.'), '🗑 takes the tag out of the words: ' + await page.evaluate(() => H3.S.f.prompt));
  // 👥 swapping Laura for Mia everywhere moves her lines too
  await page.evaluate(() => { H3.S.f.prompt = '<Subject 1> waits. <Dialogue 2>'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  ok(await page.evaluate(() => H3.lineOut('<Dialogue 2>')==='<Subject 1> (S1) says, <d>[English] Of course.</d>'), 'lineOut alone');
  // plain (not the H3 way): still the dialogue form, with the stand-in or picture for the speaker
  await page.evaluate(() => { H3.S.f.h3 = false; H3.S.f.prompt = '<Subject 1> waits. <Dialogue 1>'; }); P = await prom(R, REF);
  ok(/\(S1\) says softly, <d>\[English\] Did you bring it\?<\/d>/.test(P.p) && !/Dialogue/.test(P.p), 'plain prompt sends the dialogue form too: ' + P.p.slice(-200));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
