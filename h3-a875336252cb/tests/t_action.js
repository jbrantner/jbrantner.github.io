// 🥋 Action chips: <Action k> shown as "Mia · Twirl", sent as "<Subject 2> spins slowly on the spot."
// Run: NODE_PATH=$(npm root -g) node tests/t_action.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8033);
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
  await page.goto('http://127.0.0.1:8033/index.html');
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
  ok(bar.includes('🥋 ＋ Action') && bar.indexOf('🥋 ＋ Action')===bar.indexOf('💬 ＋ Line') + 1, 'the tag bar has 🥋 ＋ Action next to ＋ Line: ' + bar);
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-acn]'); await page.waitForTimeout(200);
  await page.click('#acWho [data-aw="2"]'); await page.fill('#acName', 'Twirl'); await page.fill('#acText', 'Spins slowly on the spot, her skirt flaring out.');
  let prev = await page.textContent('#acPrev');
  ok(prev==='Sent to MiniMax as: Mia spins slowly on the spot, her skirt flaring out.', 'the sheet shows how it is sent: ' + prev);
  await page.click('#acGo'); await page.waitForTimeout(200);
  let U = await page.evaluate(() => ({p:H3.S.f.prompt, ta:document.querySelector('#prompt').value, hl:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n), det:[...document.querySelectorAll('#descBar *')].map(x => x.textContent).join('|')}));
  ok(U.p==='<Subject 1> leans on the counter. <Action 1>' && U.ta===U.p, 'the words get an <Action 1> tag: ' + U.p);
  ok(U.hl.join()==='Laura,🥋 Mia · Twirl', 'it shows as a "🥋 Mia · Twirl" chip: ' + U.hl);
  // a dialogue line after it: numbering of lines ignores actions
  await page.evaluate(() => { H3.S.lines[5] = {n:2, text:'Ta-da!'}; H3.S.f.prompt += ' <Dialogue 5>'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  U = await page.evaluate(() => [...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n));
  ok(U.join()==='Laura,🥋 Mia · Twirl,Mia line 1', 'a line after the action is still "Mia line 1": ' + U);
  let P = await prom(R, REF); const det = P.p.split('detailed_description:')[1] || '';
  ok(/<Subject 1> leans on the counter\. <Subject 2> spins slowly on the spot, her skirt flaring out\. <Subject 2> \(S1\) says, <d>\[English\] Ta-da!<\/d>/.test(det), 'sent with Mia as the doer: ' + det.slice(0, 400));
  ok(!/Action \d/.test(P.p) && P.imgs.length===3, 'no raw tag sent; Mia gets her picture because she acts: ' + P.imgs.length);
  // mid-sentence: no stray full stop; a following full stop is not doubled
  ok(await page.evaluate(() => H3.lineOut('<Action 1> while Laura watches.'))==='<Subject 2> spins slowly on the spot, her skirt flaring out while Laura watches.', 'mid-sentence it drops its own full stop');
  ok(await page.evaluate(() => H3.lineOut('<Action 1>. Then she bows.'))==='<Subject 2> spins slowly on the spot, her skirt flaring out. Then she bows.', 'no double full stop');
  // carry-on lead-in untouched
  ok(await page.evaluate(() => H3.lineOut('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] <Action 1>'))==='[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] <Subject 2> spins slowly on the spot, her skirt flaring out.', 'the [0s-1s] lead-in is untouched');
  // checker context + tag kept
  const ck = await page.evaluate(() => H3.ckLines('<Subject 1> waits. <Action 1>', [{n:2, tag:'<Subject 2>', name:'Mia'}]));
  ok(/<Action 1> = Mia spins slowly/.test(ck) && /keep every <Action n> tag/.test(ck) && !/DIALOGUE/.test(ck), 'the checker gets the action as context: ' + ck);
  // tap the chip → edit; quick pick list has it
  await page.evaluate(() => { H3.S.f.prompt = 'Laura waits. <Action 1>'; const ta = document.querySelector('#prompt'); ta.value = H3.S.f.prompt; H3.drawAll(); });
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); ta.selectionStart = ta.selectionEnd = 16; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(200);
  ok(await page.inputValue('#acName')==='Twirl', 'tapping the chip opens that action');
  await page.fill('#acText', 'twirls twice'); await page.click('#acGo'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => H3.lineOf(1).text==='twirls twice' && H3.S.f.prompt==='Laura waits. <Action 1>'), 'Save changes the words, the tag stays');
  const snap = await page.evaluate(() => H3.snapshot().lines); ok(snap && snap[1] && snap[1].act && snap[1].text==='twirls twice', 'the take keeps its actions: ' + JSON.stringify(snap));
  // new action sheet offers earlier ones as quick picks; nobody in particular
  await page.click('#tagBar [data-acn]'); await page.waitForTimeout(150);
  const book = await page.evaluate(() => [...document.querySelectorAll('#acBook [data-ab]')].map(b => b.textContent)); ok(book.includes('Twirl'), 'Your actions lists Twirl: ' + book);
  await page.click('#acBook [data-ab="0"]'); await page.click('#acWho [data-aw="0"]'); await page.click('#acGo'); await page.waitForTimeout(150);
  U = await page.evaluate(() => ({p:H3.S.f.prompt, o:H3.lineOut(H3.S.f.prompt)}));
  ok(U.p==='Laura waits. <Action 1> <Action 6>' && U.o==='Laura waits. <Subject 2> twirls twice twirls twice', 'a chip tapped earlier never splits the new one; nobody in particular sends just the words: ' + JSON.stringify(U));
  // 🗑
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); ta.selectionStart = ta.selectionEnd = 16; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(150);
  await page.click('#acRm'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !/<Action 1>/.test(H3.S.f.prompt)), '🗑 takes the tag out: ' + await page.evaluate(() => H3.S.f.prompt));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
