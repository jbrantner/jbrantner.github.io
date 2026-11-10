// 🎨 Same look for everyone: one character's look (or 1-2 style pictures) sets the style of the whole video, and 🪄 Redraw has
// Qwen-Image-Edit redraw the other subjects' pictures in that look. Checks the structured and plain prompts, the extra style pictures,
// the Qwen graph against the real node inputs, the redrawn copies replacing the others' pictures (and only while they fit the look),
// and that ✨ / 🎭 passes leave the style pictures out. Fake ComfyUI in the browser.
// Run: NODE_PATH=$(npm root -g) node tests/t_look.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'qwen_image_edit_2511_fp8_e4m3fn.safetensors']], weight_dtype:[['default']]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors']], type:[['minimax', 'qwen_image']]}, optional:{device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors', 'qwen_image_vae.safetensors']]}}},
  LoraLoaderModelOnly:{input:{required:{model:['MODEL'], lora_name:[['Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  // the real inputs (ComfyUI comfy_extras/nodes_qwen.py, nodes_model_advanced.py, nodes_cfg.py, nodes_post_processing / nodes_upscale, nodes.py)
  TextEncodeQwenImageEditPlus:{input:{required:{clip:['CLIP'], prompt:['STRING']}, optional:{vae:['VAE'], image1:['IMAGE'], image2:['IMAGE'], image3:['IMAGE']}}},
  ModelSamplingAuraFlow:{input:{required:{model:['MODEL'], shift:['FLOAT', {default:1.73}]}}}, CFGNorm:{input:{required:{model:['MODEL'], strength:['FLOAT', {default:1}]}}},
  ImageScaleToTotalPixels:{input:{required:{image:['IMAGE'], upscale_method:[['nearest-exact', 'lanczos']], megapixels:['FLOAT', {default:1}], resolution_steps:['INT', {default:1}]}}},
  KSampler:{input:{required:{model:['MODEL'], seed:['INT'], steps:['INT'], cfg:['FLOAT'], sampler_name:[['euler']], scheduler:[['simple']], positive:['CONDITIONING'], negative:['CONDITIONING'], latent_image:['LATENT'], denoise:['FLOAT', {default:1}]}}},
  VAEEncode:{input:{required:{pixels:['IMAGE'], vae:['VAE']}}}, VAEDecode:{input:{required:{samples:['LATENT'], vae:['VAE']}}},
  PreviewImage:{input:{required:{images:['IMAGE']}}}, LoadImage:{input:{required:{image:[['x.png']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join','MiniMaxH3MotionContext',
  'LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','CLIPTextEncode'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8024);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let SENT = [], OUT = '', UP = 0;
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/upload/image') return J({name:'up' + (++UP) + '.png', subfolder:'h3deck', type:'input'});
    if(p==='/prompt'){ SENT.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'pid' + SENT.length}); }
    if(p.startsWith('/history/')){ const i = +p.replace(/\D/g, '') - 1, G = SENT[i], save = Object.keys(G).find(k => G[k].class_type==='PreviewImage'); return J({['pid' + (i + 1)]:{status:{status_str:'success', completed:true, messages:[]}, outputs:{[save]:{images:[{filename:'q' + i + '.png', subfolder:'', type:'temp'}]}}}}); }
    if(p==='/view') return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:Buffer.from(OUT, 'base64')});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8024/index.html');
  await page.waitForFunction(() => H3.families().length > 0 && H3.PC['http://render.test'] && H3.PC['http://render.test'].oi && H3.PC['http://render.test'].oi.TextEncodeQwenImageEditPlus, null, {timeout:20000});
  const REF = await page.evaluate(() => H3.families().map(f => f.key).find(k => /hybrid/.test(k)));
  OUT = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#e6a'; x.fillRect(0, 0, 64, 96); return c.toDataURL('image/png').split(',')[1]; });
  await page.evaluate(async REF => { const pic = async (col, nm) => { const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 64, 96);
      const b = await new Promise(ok => c.toBlob(ok, 'image/png')); return H3.addMedia(new File([b], nm + '.png', {type:'image/png'}), 'img'); };
    window.P = {a:await pic('#c33', 'anna'), b:await pic('#33c', 'ben'), b2:await pic('#33a', 'ben2'), c:await pic('#3c3', 'cat'), s1:await pic('#999', 'style1'), s2:await pic('#666', 'style2')};
    Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, quality:false, prompt:'<Subject 1> and <Subject 2> laugh together.'});
    H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Anna', pics:[P.a], keep:'exact'}, {n:2, kind:'char', stand:'a man', who:'Ben', pics:[P.b, P.b2], keep:'exact'}, {n:3, kind:'char', stand:'a cat girl', who:'Cat', pics:[P.c], keep:'exact'}];
    H3.drawAll(); }, REF);
  const prom = () => page.evaluate(R => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const T = H3.castTake(t, true), names = {}; T.imgs.forEach(r => names[r.id] = r.id + '.png');
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, names).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:T.imgs.map(r => r.id)}; }, R);
  // off: nothing changes
  let X = await prom(); ok(!/visual style/.test(X.p) && X.imgs.length===3, 'off: no style words, the three pictures');
  ok(await page.evaluate(() => [...document.querySelectorAll('#lookBox [data-lk]')].map(b => b.textContent).join('|')).then(s => /Off\|Anna's look\|Ben's look\|Cat's look\|🖼 Style picture/.test(s)), 'the 🎨 row: Off, each character\'s look, a style picture');
  // Anna's look
  await page.click('[data-lk="c:1"]'); X = await prom();
  console.log(X.p.slice(X.p.indexOf('retention_analysis'), X.p.indexOf('overall_soundscape')));
  ok(/<Subject 1> \(appears in \[Shot 1\]\): fully_preserved - .*\. Its visual style is the look of the whole video\./.test(X.p) && /<Subject 2> \(appears in \[Shot 1\]\): fully_preserved - .*\. <Subject 2> is shown in the same visual style as <Subject 1>\./.test(X.p), "Anna's look: her retention sets it, Ben is shown in her style");
  ok(/detailed_description:\nThe whole target video is in one single visual style, the look of <Subject 1>: every person, object and place/.test(X.p) && /Everything is shown in the visual style of <Subject 1>\./.test(X.p) && !/\u0001/.test(X.p), 'the style line and the summary name <Subject 1>');
  ok(X.imgs.length===3, 'she is in the shot: no extra picture');
  // Cat's look, Cat not in the shot: her first picture goes as a style picture
  await page.click('[data-lk="c:3"]'); X = await prom();
  ok(X.imgs.length===4 && X.imgs[3]===await page.evaluate(() => P.c) && /<Subject 3> is the visual style shown in <Picture 4>\. That picture is a style reference only\./.test(X.p)
    && /<Subject 3> \(appears in \[Shot 1\]\): attribute_transfer - only the visual style of <Picture 4>/.test(X.p) && /<Subject 1> is shown in the same visual style as <Subject 3>/.test(X.p) && /<Subject 2> is shown in the same visual style as <Subject 3>/.test(X.p), "Cat's look with Cat off screen: her picture goes as a style-only reference");
  // style pictures
  await page.evaluate(() => { const L = H3.lookOf(); L.src = 'p'; L.pics = [P.s1, P.s2]; H3.drawLook(); }); X = await prom();
  ok(X.imgs.slice(-2).join()===await page.evaluate(() => [P.s1, P.s2].join()) && /<Subject 3> is the visual style shown in <Picture 4> and <Picture 5>\. Those pictures are a style reference only\./.test(X.p), 'two style pictures: one style subject');
  ok(await page.evaluate(() => document.querySelectorAll('#lookBox .cpw').length===2 && !document.querySelector('#lookBox [data-lk="pic"]')), 'the style pictures show, no ＋ after two');
  ok(await page.evaluate(() => !H3.upRefs({prompt:'<Subject 1> and <Subject 2> laugh together.', imgs:[], look:H3.lookSnap()}).some(r => r.style)), '✨ / 🎭 passes leave the style pictures out');
  // plain prompt
  await page.evaluate(() => { H3.S.f.h3 = false; }); X = await prom(); await page.evaluate(() => { H3.S.f.h3 = true; });
  ok(/<Picture 4> and <Picture 5> are style references only: the whole video, every person, object and place, is shown in their visual style/.test(X.p), 'plain prompt says it too');
  // 🪄 Redraw Ben and Cat in Anna's look
  await page.click('[data-lk="c:1"]');
  const btn = await page.evaluate(() => (document.querySelector('[data-lk="redo"]') || {}).textContent || '');
  ok(/Redraw Ben and Cat in this look \(3 pictures, Qwen on Render\)/.test(btn), 'the redraw button names the others and counts their pictures: ' + btn);
  await page.click('[data-lk="redo"]');
  await page.waitForFunction(() => /Done|Couldn't/.test((document.querySelector('#lookNote') || {}).textContent || ''), null, {timeout:30000});
  console.log(await page.evaluate(() => document.querySelector('#lookNote').textContent));
  ok(SENT.length===3, 'three Qwen jobs');
  ok(/redrawn with Qwen \(P-H3 not ready/.test(await page.evaluate(() => document.querySelector('#lookNote').textContent)), 'no P-H3 yet: Qwen did it, and says why');
  const G = SENT[0], bad = Object.values(G).flatMap(n => Object.keys(n.inputs).filter(k => { const s = SCHEMA[n.class_type]; return !s || !((s.input.required || {})[k] || (s.input.optional || {})[k]); }).map(k => n.class_type + '.' + k));
  const enc = Object.values(G).filter(n => n.class_type==='TextEncodeQwenImageEditPlus'), ld = Object.values(G).filter(n => n.class_type==='LoadImage').map(n => n.inputs.image);
  ok(!bad.length && enc.length===2 && enc[0].inputs.image1 && enc[0].inputs.image2 && !enc[0].inputs.image3 && /^Redraw the person in picture 1 in the visual style of picture 2\./.test(enc[0].inputs.prompt), 'Qwen graph: real inputs only, picture 1 = him, picture 2 = her look ' + JSON.stringify(bad));
  ok(Object.values(G).some(n => n.class_type==='LoraLoaderModelOnly' && /Lightning-4steps/.test(n.inputs.lora_name)) && Object.values(G).find(n => n.class_type==='KSampler').inputs.steps===4 && Object.values(G).find(n => n.class_type==='UNETLoader').inputs.unet_name.includes('2511'), '2511 model with its 4-step Lightning LoRA');
  ok(ld.length===2, 'two pictures loaded');
  const st = await page.evaluate(() => { const L = H3.lookOf(); return {n:Object.keys(L.redo).length, has:[P.b, P.b2, P.c].every(id => L.redo[id] && H3.S.media[L.redo[id].id]), a:!!L.redo[P.a], tiles:document.querySelectorAll('#lookBox .cpw').length}; });
  ok(st.n===3 && st.has && !st.a && st.tiles===3, 'three redrawn copies kept (Anna\'s untouched), shown as tiles');
  X = await prom(); const R2 = await page.evaluate(() => { const L = H3.lookOf(); return {a:P.a, b:L.redo[P.b].id, b0:P.b}; });
  ok(X.imgs[0]===R2.a && X.imgs.includes(R2.b) && !X.imgs.includes(R2.b0), 'takes send Ben\'s redrawn picture and Anna\'s own');
  await page.click('[data-lk="use"]'); X = await prom();
  ok(X.imgs.includes(R2.b0) && !X.imgs.includes(R2.b), 'Use the redrawn pictures off: the originals go');
  await page.click('[data-lk="use"]');
  await page.click('[data-lk="c:2"]'); X = await prom();
  ok(X.imgs.includes(R2.b0) && !X.imgs.includes(R2.b), "another look: copies made for Anna's look aren't used");
  ok(await page.evaluate(() => /Redraw Anna and Cat in this look \(2 pictures/.test(document.querySelector('[data-lk="redo"]').textContent)), 'and the button offers to redraw for the new look');
  await page.click('[data-lk="off"]'); X = await prom();
  ok(!/visual style/.test(X.p) && X.imgs.includes(R2.b0), 'off again: as before');
  // ✨ P-H3 Image on the PC: it does the redraw (Qwen stays the fallback)
  await page.evaluate(() => { const oi = H3.PC['http://render.test'].oi; ['PH3ImageConditioning', 'MiniMaxH3SigmaShift', 'ManualSigmas', 'SamplerCustomAdvanced', 'KSamplerSelect', 'RandomNoise', 'BasicGuider'].forEach(c => oi[c] = oi[c] || {input:{required:{}}});
    oi.UNETLoader.input.required.unet_name[0].push('minimax_h3_fl2va_pruned_int8_convrot.safetensors'); oi.LoraLoaderModelOnly.input.required.lora_name[0].push('p-h3-image_lora_bf16.safetensors');
    oi.TextGenerateV2 = {input:{required:{}}}; oi.CLIPLoader.input.required.clip_name[0].push('p-h3-image_text_encoder_int8.safetensors', 'p-h3-image_prompt_upsampler_w4a8.safetensors'); oi.VAELoader.input.required.vae_name[0].push('p-h3-image_vae_int8.safetensors');
    H3.lookOf().src = 'c'; H3.lookOf().n = 1; H3.lookOf().redo = {}; H3.drawLook(); });
  ok(await page.evaluate(() => /\(3 pictures, P-H3 on Render\)/.test(document.querySelector('[data-lk="redo"]').textContent) && !!document.querySelector('[data-lk="eng:qwen"]')), 'P-H3 there: the button says P-H3, with a Qwen choice');
  SENT = []; await page.click('[data-lk="redo"]');
  await page.waitForFunction(() => /Done|Couldn't/.test((document.querySelector('#lookNote') || {}).textContent || ''), null, {timeout:30000});
  console.log(await page.evaluate(() => document.querySelector('#lookNote').textContent));
  const PG = SENT[0], by = c => Object.values(PG).filter(n => n.class_type===c), ci = (by('PH3ImageConditioning')[0] || {}).inputs || {};
  ok(SENT.length===3 && by('MiniMaxH3SigmaShift')[0].inputs.shift_video===1 && /fl2va_pruned_int8/.test(by('UNETLoader')[0].inputs.unet_name) && /p-h3-image_lora/.test(by('LoraLoaderModelOnly')[0].inputs.lora_name)
    && by('CLIPLoader')[0].inputs.type==='minimax' && Array.isArray(ci['images.image_1']) && Array.isArray(ci['images.image_2']) && !ci['images.image_3']
    && by('ManualSigmas')[0].inputs.sigmas.split(',').length===9 && by('KSamplerSelect')[0].inputs.sampler_name==='er_sde' && !by('TextEncodeQwenImageEditPlus').length, 'P-H3 graph: FL2VA + LoRA, shift 1, two pictures on the conditioning, 8 sigmas er_sde');
  const tg = (by('TextGenerateV2')[0] || {}).inputs || {}, tgId = Object.keys(PG).find(k => PG[k].class_type==='TextGenerateV2');
  ok(tg.thinking===false && tg.sampling_mode==='off' && tg.max_length===1536 && /upsampler_w4a8/.test(PG[tg.clip[0]].inputs.clip_name) && Array.isArray(tg['images.image1']) && Array.isArray(tg['images.image2']) && ci.prompt[0]===tgId, 'P-H3 prompt writer on, thinking off (Render: thinking flipped the picture), its words go to the conditioning');
  ok(/^Aspect ratio: 2:3\nRequest: Redraw the person in <Picture 1> in the visual style of <Picture 2>\./.test(tg.prompt) && ci.width % 32===0 && ci.height % 32===0 && Math.abs(ci.width * ci.height - 2 * 1048576) < 2 * 1048576 * 0.08 && ci.height > ci.width, 'P-H3 prompt names <Picture n>, canvas 2 MP in her shape ' + ci.width + 'x' + ci.height);
  ok(await page.evaluate(() => Object.values(H3.lookOf().redo).every(r => r.eng==='ph3')), 'copies marked as P-H3 ones');
  await page.click('[data-lk="eng:qwen"]');
  ok(await page.evaluate(() => /Qwen on Render/.test(document.querySelector('[data-lk="redo"]').textContent) && H3.lookKit(H3.lookOf()).eng==='qwen'), 'Qwen picked: Qwen does it');
  await page.click('[data-lk="eng:"]');
  // no Qwen on the PC
  await page.evaluate(() => { const oi = H3.PC['http://render.test'].oi; window.SAVE = oi.TextEncodeQwenImageEditPlus; delete oi.TextEncodeQwenImageEditPlus; });
  ok(await page.evaluate(() => /TextEncodeQwenImageEditPlus/.test(H3.qwenKit().why || '')), 'missing node: says which');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
