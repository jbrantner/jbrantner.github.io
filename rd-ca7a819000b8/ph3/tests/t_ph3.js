// ✨ P-H3 Image (ph3/index.html): a stand-in ComfyUI checks the job it sends (Comfy-Org's P-H3 templates), the edit flow, the result and the downloads.
// Run: NODE_PATH=$(npm root -g) node ph3/tests/t_ph3.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PC = 'https://jordo-desktop.tailadee9a.ts.net';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAoBAMBtNNuJgAAAABJRU5ErkJggg==', 'base64');
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if(!c) fail++; };
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const browser = await chromium.launch(); const page = await browser.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGEERROR', e.message); fail++; });
  let have = {lora:false, te:true, up:true, vae:true}, prompts = [], uploads = 0, downloads = [], hist = {};
  const info = () => ({PH3ImageConditioning:{input:{}}, TextGenerateV2:{input:{}}, MiniMaxH3SigmaShift:{input:{}}, ManualSigmas:{input:{}}, ImageScaleToTotalPixels:{input:{}},
    UNETLoader:{input:{required:{unet_name:[['minimaxH3INT8INT4_fl2vaINT8Pruned.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors']]}}},
    LoraLoaderModelOnly:{input:{required:{lora_name:[['afkj.safetensors'].concat(have.lora ? ['p-h3-image_lora_bf16.safetensors'] : [])]}}},
    CLIPLoader:{input:{required:{clip_name:[['qwen3vl.safetensors', 'p-h3-image_text_encoder_int8_convrot.safetensors', 'p-h3-image_prompt_upsampler_w4a8.safetensors']]}}},
    VAELoader:{input:{required:{vae_name:[['p-h3-image_vae_int8_convrot.safetensors']]}}}});
  await page.route('https://app.test/**', r => r.fulfill({contentType:'text/html', body:html}));
  await page.route(/fonts\.googleapis|rdh3-fresh|icon-tape/, r => r.fulfill({status:200, body:''}));
  await page.route(/jordo-main/, r => r.abort());
  await page.route(PC + '/**', async r => { const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({contentType:'application/json', body:JSON.stringify(info())});
    if(u.pathname==='/upload/image'){ uploads++; return r.fulfill({contentType:'application/json', body:JSON.stringify({name:'ph3_up' + uploads + '.jpg', subfolder:'', type:'input'})}); }
    if(u.pathname==='/prompt'){ const b = JSON.parse(r.request().postData()); prompts.push(b.prompt); const pid = 'pid' + prompts.length;
      const g = b.prompt, sv = Object.keys(g).find(k => g[k].class_type==='SaveImage'), pv = Object.keys(g).find(k => g[k].class_type==='PreviewAny');
      const outputs = {[sv]:{images:[{filename:'ph3_0000' + prompts.length + '_.png', subfolder:'RenderDeck/ph3', type:'output'}]}}; if(pv) outputs[pv] = {text:['Edit <Picture 1>. A longer brief.']};
      hist[pid] = {status:{status_str:'success', completed:true}, outputs}; return r.fulfill({contentType:'application/json', body:JSON.stringify({prompt_id:pid})}); }
    if(u.pathname.startsWith('/history/')) return r.fulfill({contentType:'application/json', body:JSON.stringify({[u.pathname.split('/').pop()]:hist[u.pathname.split('/').pop()]})});
    if(u.pathname==='/queue') return r.fulfill({contentType:'application/json', body:'{"queue_running":[],"queue_pending":[]}'});
    if(u.pathname==='/view') return r.fulfill({contentType:'image/png', body:PNG});
    if(u.pathname==='/renderdeck/download'){ const b = JSON.parse(r.request().postData()); downloads.push(b); if(/lora/.test(b.url)) have.lora = true; return r.fulfill({contentType:'application/json', body:'{"ok":true}'}); }
    if(u.pathname==='/renderdeck/jobs') return r.fulfill({contentType:'application/json', body:JSON.stringify({jobs:downloads.map(d => ({name:d.url.split('/').pop(), status:'done'}))})});
    r.fulfill({status:404, body:''}); });
  await page.addInitScript(() => { window.PH3_POLL = 50; });
  await page.goto('https://app.test/rd-ca7a819000b8/ph3/');
  // the LoRA is missing: the page offers it and gets it through the helper
  await page.waitForSelector('#getb', {timeout:5000}); ok(/P-H3 LoRA/.test(await page.textContent('.need')), 'missing LoRA is offered');
  await page.click('#getb'); await page.waitForFunction(() => /Got everything/.test(document.querySelector('#msg').textContent), null, {timeout:5000});
  ok(downloads.length===1 && downloads[0].kind==='loras' && /p-h3-image_lora_bf16/.test(downloads[0].url), 'LoRA downloaded into loras');
  // edit: Picture 1 + a reference
  const pic = path.join(__dirname, 'pic.png'); await page.evaluate(() => new Promise(ok => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; c.toBlob(b => { window.__b = b; ok(); }); }));
  const buf = Buffer.from(await page.evaluate(async () => [...new Uint8Array(await window.__b.arrayBuffer())])); fs.writeFileSync(pic, buf);
  await page.setInputFiles('#file', pic); await page.waitForSelector('.pic.one'); await page.setInputFiles('#file', pic); await page.waitForFunction(() => document.querySelectorAll('.pic img').length===2);
  await page.fill('#prompt', 'put the hat from Picture 2 on her'); await page.click('#make');
  await page.waitForSelector('#resimg', {timeout:8000});
  const g = prompts[0], by = c => Object.values(g).filter(n => n.class_type===c);
  ok(by('UNETLoader')[0].inputs.unet_name==='minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'official FL2VA model');
  ok(by('LoraLoaderModelOnly')[0].inputs.lora_name==='p-h3-image_lora_bf16.safetensors' && by('LoraLoaderModelOnly')[0].inputs.strength_model===1, 'P-H3 LoRA at 1.0');
  ok(by('MiniMaxH3SigmaShift')[0].inputs.shift_video===1 && by('MiniMaxH3SigmaShift')[0].inputs.shift_audio===1, 'shifts 1.0/1.0');
  const ci = by('PH3ImageConditioning')[0].inputs; ok(Array.isArray(ci['images.image_1']) && Array.isArray(ci['images.image_2']) && !ci['images.image_3'], 'two pictures on the conditioning');
  ok(ci.width===1760 && ci.height===2368, 'canvas = Picture 1 at 4 MP (' + ci.width + 'x' + ci.height + ')');
  const tg = by('TextGenerateV2')[0].inputs; ok(/^Aspect ratio: 3:4\nRequest: put the hat/.test(tg.prompt) && tg['images.image2'] && tg.thinking===true && tg.sampling_mode==='off' && tg.max_length===1536, 'auto prompt asks Pruna\'s writer');
  ok(by('ManualSigmas')[0].inputs.sigmas.split(',').length===9 && by('KSamplerSelect')[0].inputs.sampler_name==='er_sde', '8-step sigmas, er_sde');
  ok(by('SaveImage')[0].inputs.filename_prefix==='RenderDeck/ph3/ph3', 'saved under RenderDeck/ph3');
  ok(by('ImageScaleToTotalPixels').length===1, 'only Picture 1 is scaled');
  // every link points at a real node and output
  ok(Object.values(g).every(n => Object.values(n.inputs).every(v => !Array.isArray(v) || (g[v[0]] && typeof v[1]==='number'))), 'links are whole');
  ok(uploads===2, 'both pictures sent'); ok(/A longer brief/.test(await page.textContent('details pre')), 'shows the prompt it wrote');
  ok(await page.$('#before'), 'before/after compare');
  // Edit this: the result becomes Picture 1 (no new upload of it: it's fetched from the PC), the reference stays
  await page.click('#useit'); ok(await page.evaluate(() => document.querySelectorAll('.pic img').length)===2, 'result is Picture 1, reference kept');
  await page.fill('#prompt', 'make it night'); await page.click('#auto'); await page.click('#make'); await page.waitForFunction(() => document.querySelectorAll('.lib button').length===2, null, {timeout:8000});
  const g2 = prompts[1]; ok(!Object.values(g2).some(n => n.class_type==='TextGenerateV2') && Object.values(g2).find(n => n.class_type==='PH3ImageConditioning').inputs.prompt==='make it night', 'auto prompt off sends the words as they are');
  // new picture, 8 MP 4:3 = Pruna's 3360x2496
  await page.click('[data-mode=make]'); await page.click('[data-ratio="4:3"]'); await page.click('[data-mp="8"]'); await page.fill('#prompt', 'a red bicycle'); await page.click('#make');
  await page.waitForFunction(() => document.querySelectorAll('.lib button').length===3, null, {timeout:8000});
  const c3 = Object.values(prompts[2]).find(n => n.class_type==='PH3ImageConditioning').inputs; ok(c3.width===3360 && c3.height===2496 && !c3['images.image_1'], 'new picture 8 MP 4:3 = 3360x2496');
  await page.screenshot({path:path.join(__dirname, 'ph3.png'), fullPage:true});
  fs.unlinkSync(pic); await browser.close(); console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})();
