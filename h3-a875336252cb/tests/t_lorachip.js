// 🧩 LoRA chips: a 📚 Library entry with LoRAs + words; <Lora k> sends its words where it sits and its LoRAs with the take
// Run: NODE_PATH=$(npm root -g) node tests/t_lorachip.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors','HairFlip_h3.safetensors','Jiggle_minimax.safetensors','MMH3-Realism-V2-HyperFlow-ref2va.safetensors']], strength_model:['FLOAT', {default:1}]}}},
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
  const graph = () => page.evaluate(() => { const R = Object.keys(H3.PC)[0]; const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const n = Object.values(H3.pieceGraph(t, 0, H3.PC[R].oi, {}).g); return {t, los:n.filter(x => x.class_type==='LoraLoaderModelOnly').map(x => [x.inputs.lora_name, x.inputs.strength_model]), p:(n.find(x => x.class_type==='MiniMaxH3ReferenceToVideo') || {inputs:{}}).inputs.prompt}; });
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:false, sm:false, shuffle:0, boost:true, prompt:'<Subject 1> walks in. ', loras:[{name:'AFK_Claude_minimaxh3.safetensors', str:1, words:''}, {name:'Jiggle_minimax.safetensors', str:0.3, words:''}]});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:[], stand:'a woman', keep:'exact'}]; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  // 📚 Library: a 🧩 LoRA kind
  await page.evaluate(() => H3.setTab('lib')); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!document.querySelector('[data-lib="f:lora"]')), 'the Library has a 🧩 LoRAs filter');
  await page.click('[data-lib="f:lora"]'); await page.waitForTimeout(100);
  ok((await page.textContent('[data-lib="new"]')).includes('New LoRA chip'), 'new button says LoRA chip');
  await page.click('[data-lib="new"]'); await page.waitForTimeout(200);
  await page.fill('#lbBox [data-lbf="name"]', 'Hair flip'); await page.fill('#lbBox [data-lbf="what"]', 'she flips her hair over her shoulder.');
  await page.click('#lbBox [data-wla]'); await page.waitForTimeout(100);
  await page.selectOption('#lbBox [data-wln]', 'HairFlip_h3.safetensors'); await page.waitForTimeout(100);
  await page.evaluate(() => { const r = document.querySelector('#lbBox [data-wls]'); r.value = '0.8'; r.dispatchEvent(new Event('input', {bubbles:true})); });
  await page.click('#lbBox [data-wla]'); await page.waitForTimeout(100);
  await page.selectOption('#lbBox [data-wli="1"] [data-wln]', 'Jiggle_minimax.safetensors'); await page.waitForTimeout(100);
  await page.fill('#lbBox [data-wli="1"] [data-wlw]', 'jgl');
  let E = await page.evaluate(() => H3.S.lib.find(x => x.kind==='lora'));
  ok(E && E.name==='Hair flip' && E.what==='she flips her hair over her shoulder.' && E.loras.length===2 && E.loras[0].name==='HairFlip_h3.safetensors' && E.loras[0].str===0.8 && E.loras[1].words==='jgl', 'the entry keeps name, words and two LoRAs: ' + JSON.stringify(E));
  await page.click('[data-close]'); await page.evaluate(() => H3.setTab('render')); await page.waitForTimeout(200);
  // the chip
  const bar = await page.evaluate(() => [...document.querySelectorAll('#tagBar button')].map(b => b.textContent));
  ok(bar.includes('🧩 ＋ LoRA'), 'the tag bar has 🧩 ＋ LoRA: ' + bar);
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-lrn]'); await page.waitForTimeout(200);
  ok(await page.inputValue('#lrText')==='she flips her hair over her shoulder.', 'the only Library entry is picked and its words fill in');
  ok(/HairFlip_h3 0\.80, Jiggle_minimax 1\.00/.test(await page.textContent('#lrSet')), 'sheet lists its LoRAs: ' + await page.textContent('#lrSet'));
  await page.click('#lrGo'); await page.waitForTimeout(200);
  let U = await page.evaluate(() => ({p:H3.S.f.prompt, hl:[...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n), L:H3.S.lines[1]}));
  ok(U.p==='<Subject 1> walks in. <Lora 1>' && U.hl.join()==='Laura,🧩 Hair flip' && U.L && U.L.text===undefined, 'chip in the words, shows "🧩 Hair flip", words follow the Library: ' + JSON.stringify(U));
  let G = await graph(); const st = Object.fromEntries(G.los);
  ok(/walks in\. she flips her hair over her shoulder\./.test(G.p) && !/Lora \d/.test(G.p), 'its words are sent where the chip is: ' + G.p);
  ok(st['HairFlip_h3.safetensors']===0.8 && st['Jiggle_minimax.safetensors']===0.3 && st['AFK_Claude_minimaxh3.safetensors']===1 && G.los.filter(x => x[0]==='Jiggle_minimax.safetensors').length===1, 'LoRAs merged without duplicates, own list keeps its strength: ' + JSON.stringify(G.los));
  ok(st['MMH3-Realism-V2-HyperFlow-ref2va.safetensors']===0.5, 'Quality boost still rides along');
  ok(JSON.stringify(G.t.chipLoras)==='["HairFlip_h3.safetensors"]' && G.t.lines[1].snap && G.t.lines[1].ltext==='she flips her hair over her shoulder.', 'take keeps a frozen copy: ' + JSON.stringify(G.t.lines[1]));
  // mid-sentence + trigger words with a comma
  ok(await page.evaluate(() => H3.lineOut('<Lora 1> while Laura watches.'))==='she flips her hair over her shoulder while Laura watches.', 'mid-sentence drops its own full stop');
  // Library edit follows into the form; the take keeps its own
  await page.evaluate(() => { H3.S.lib.find(x => x.kind==='lora').what = 'hairflip_v2, '; });
  ok(await page.evaluate(() => H3.lineOut('<Lora 1> she smiles.'))==='hairflip_v2, she smiles.', 'trigger words keep their comma: ' + await page.evaluate(() => H3.lineOut('<Lora 1> she smiles.')));
  ok(await page.evaluate(t => H3.lineOut('<Lora 1>', t), G.t)==='she flips her hair over her shoulder.', 'a take sends its own frozen words');
  // useAgain does not copy chip LoRAs into the form list
  await page.evaluate(t => { H3.S.takes.unshift(t); H3.useAgain(t, true); }, G.t); await page.waitForTimeout(100);
  ok(await page.evaluate(() => H3.S.f.loras.map(l => l.name).join())==='AFK_Claude_minimaxh3.safetensors,Jiggle_minimax.safetensors', '↩ Use again leaves chip LoRAs out of your list: ' + await page.evaluate(() => H3.S.f.loras.map(l => l.name).join()));
  // ✨ pass keeps them
  { const r = await page.evaluate(t => { const R = Object.keys(H3.PC)[0], oi = H3.PC[R].oi; t = JSON.parse(JSON.stringify(t)); t.id = 'u1'; t.up = {scale:1, rep:'light', den:0, str:0.8, look:'live'};
      t.redo = {src:'x', file:'x.mp4', F:73, L:73, Fout:73, a:0, b:73, s0:0, cin:0, cout:3}; t.pieces = [{start:0, gen:73, deliv:73, ctx:0, prompt:t.prompt, state:'done'}]; t.final = {filename:'u.mp4', subfolder:'H3Deck/u'};
      const G = H3.upGraph(t, oi, {}), n = Object.values(G.g || G); return n.filter(x => x.class_type==='LoraLoaderModelOnly').map(x => x.inputs.lora_name); }, G.t);
    ok(r.includes('HairFlip_h3.safetensors'), '✨ High quality pass keeps the chip LoRA: ' + r); }
  // checker
  const ck = await page.evaluate(() => H3.ckLines('<Subject 1> waits. <Lora 1>', [{n:1, tag:'<Subject 1>', name:'Laura'}]));
  ok(/<Lora 1> = "hairflip_v2,"/.test(ck) && /keep every <Lora n> tag/.test(ck), 'checker told about the chip: ' + ck);
  // tap → edit words for this shot only
  await page.evaluate(() => { H3.S.f.prompt = 'Laura waits. <Lora 1>'; const ta = document.querySelector('#prompt'); ta.value = H3.S.f.prompt; H3.drawAll(); });
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); ta.selectionStart = ta.selectionEnd = 16; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(200);
  ok(await page.inputValue('#lrText')==='hairflip_v2,', 'tapping the chip opens it with the Library words');
  await page.fill('#lrText', 'hairflip_v2, she tosses her hair'); await page.click('#lrGo'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => H3.lineOf(1).text==='hairflip_v2, she tosses her hair' && H3.lineOut(H3.S.f.prompt)==='Laura waits. hairflip_v2, she tosses her hair'), 'changed words stay on the chip: ' + await page.evaluate(() => H3.lineOut(H3.S.f.prompt)));
  // 🎲 Wildcards tab has it too
  await page.evaluate(() => H3.setTab('wild')); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('#tagBar [data-lrn]')), 'the 🎲 Wildcards Shot box has 🧩 ＋ LoRA');
  await page.evaluate(() => H3.setTab('render')); await page.waitForTimeout(200);
  // deleting the Library entry: the chip keeps a copy
  await page.evaluate(() => { H3.setTab('lib'); }); await page.waitForTimeout(150);
  await page.evaluate(() => H3.openLib(H3.S.lib.find(x => x.kind==='lora').id)); await page.waitForTimeout(150);
  await page.click('#lbBox [data-lb="del"]'); await page.waitForTimeout(150);
  await page.evaluate(() => { H3.setTab('render'); H3.S.f.prompt = 'Laura waits. <Lora 1>'; H3.S.f.sm = false; });
  G = await graph();
  ok(!(await page.evaluate(() => H3.S.lib.some(x => x.kind==='lora'))) && G.los.some(x => x[0]==='HairFlip_h3.safetensors') && /tosses her hair/.test(G.p), 'after deleting the entry the chip still sends its copy');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
