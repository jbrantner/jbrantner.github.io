// 🌿 MOSS-Image (2026-11-03): the split model shows in the Model list, gets its own graph (UNETLoader, CLIPLoader
// moss_image, Empty Flux 2 Latent, er_sde 25 steps CFG 2.5), its own LoRA list, ⚡ Fast, drafts, and 🌿 Get MOSS-Image.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'comfy-app.html');
const SERVER = 'https://render.test';
const DEF = {
  CheckpointLoaderSimple:[['ckpt_name'],3], CLIPTextEncode:[['text','clip'],1], EmptyLatentImage:[['width','height','batch_size'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1],
  KSamplerAdvanced:[['model','add_noise','noise_seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','start_at_step','end_at_step','return_with_leftover_noise'],1],
  VAEDecode:[['samples','vae'],1], SaveImage:[['images','filename_prefix'],0], LoraLoader:[['model','clip','lora_name','strength_model','strength_clip'],2],
  UNETLoader:[['unet_name','weight_dtype'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1],
  EmptyFlux2LatentImage:[['width','height','batch_size'],1], LoraLoaderModelOnly:[['model','lora_name','strength_model'],1],
  ImageScaleBy:[['image','upscale_method','scale_by'],1], LoadImage:[['image'],2], ImageScale:[['image','upscale_method','width','height','crop'],1], VAEEncode:[['pixels','vae'],1],
  FaceDetailer:[['image'],6], UltralyticsDetectorProvider:[['model_name'],2], ModelMergeSDXL:[['model1','model2'],1], CLIPSetLastLayer:[['clip','stop_at_clip_layer'],1],
};
function check(g){
  const errs = [];
  for(const [id,n] of Object.entries(g)){
    const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){
      const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing node '+v[0]); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]);
    }
  }
  return errs;
}
const C = a => ['COMBO',{options:a}];
const full = () => ({
  CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['sdxl.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['moss_image_sft_int8_convrot.safetensors','DasiwaMinimaxH3_turbo.safetensors']), weight_dtype:C(['default'])}}},
  CLIPLoader:{input:{required:{clip_name:C(['umt5.safetensors','qwen3.5_9b_int8_convrot.safetensors','qwen3.5_9b_w4a8_gptq.safetensors']), type:C(['stable_diffusion','moss_image'])}}},
  VAELoader:{input:{required:{vae_name:C(['ae.safetensors','flux2-vae_small.safetensors'])}}},
  LoraLoader:{input:{required:{lora_name:C(['pixel.safetensors','moss_style_lora.safetensors','moss_image_sft_8step_dmd.safetensors'])}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:C(['pixel.safetensors','moss_style_lora.safetensors','moss_image_sft_8step_dmd.safetensors'])}}},
  KSampler:{input:{required:{sampler_name:C(['euler','euler_ancestral','er_sde']),scheduler:C(['normal','simple'])}}},
  EmptyFlux2LatentImage:{input:{required:{}}},
});
let OI = full();
for(const k of Object.keys(DEF)) OI[k] = OI[k] || {input:{required:{}}};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');

(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(SRC,'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  const sent = [], dls = []; let sock = null, n = 0;
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  for(const f of ['chars.txt','tags.txt','words.txt']) await page.route('https://app.test/'+f, r => r.fulfill({ contentType:'text/plain', body:fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8') }));
  await page.route(SERVER+'/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname.startsWith('/object_info/')){ const k = u.pathname.slice(13); return r.fulfill({ json:{[k]:OI[k]} }); }
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{jobs:[]} });
    if(u.pathname==='/renderdeck/download'){ dls.push(JSON.parse(r.request().postData())); return r.fulfill({ json:{id:'d'+dls.length, name:dls[dls.length-1].name, status:'downloading'} }); }
    if(u.pathname.startsWith('/history') || u.pathname.startsWith('/renderdeck/') || u.pathname.startsWith('/view')) return r.fulfill({ json:{} });
    if(u.pathname==='/prompt'){
      const body = JSON.parse(r.request().postData()); sent.push(body.prompt);
      if(check(body.prompt).length) return r.fulfill({ status:400, json:{error:{message:'bad graph'},node_errors:{}} });
      return r.fulfill({ json:{prompt_id:'p'+(++n), number:0, node_errors:{}} });
    }
    r.fulfill({ status:404, body:'' });
  });
  await page.routeWebSocket(/render\.test\/ws/, ws => { sock = ws; });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  const graph = async () => { await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const g = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets()); return g; };
  const nodes = (g, c) => Object.values(g).filter(x => x.class_type===c);
  const titled = (g, t) => Object.values(g).find(x => x._meta.title===t);

  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.click('#connectBtn');
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.click('.block[style*="--model"] h3'); await page.click('.block[style*="--samp"] h3');
  const list = await page.$$eval('[data-k=ckpt] option', o => o.map(x=>x.textContent));
  ok(list.join()==='sdxl.safetensors,moss_image_sft_int8_convrot.safetensors', 'Model list has the checkpoints plus MOSS-Image, not other split models: '+list.join());
  ok(!(await page.$('[data-do=mossget]')), 'no 🌿 Get button when MOSS-Image is all there');

  await page.selectOption('[data-k=ckpt]', 'moss_image_sft_int8_convrot.safetensors');
  ok(!(await page.$('.block[style*="--model"] [data-seg=style]')), 'no Style row for MOSS-Image');
  ok(await page.isHidden('#tagSearchBtn'), 'tag search hidden for MOSS-Image (plain sentences)');
  await page.fill('#prompt', 'a woman holding a sign that says "OPEN", rainy street at night');
  let g = await graph();
  ok(check(g).length===0, 'MOSS graph is valid: '+check(g).join('; '));
  ok(nodes(g,'CheckpointLoaderSimple').length===0 && nodes(g,'UNETLoader')[0].inputs.unet_name==='moss_image_sft_int8_convrot.safetensors', 'loads MOSS with UNETLoader');
  const cl = nodes(g,'CLIPLoader')[0].inputs;
  ok(cl.type==='moss_image' && cl.clip_name==='qwen3.5_9b_w4a8_gptq.safetensors', 'text encoder: w4a8 Qwen3.5 9B, type moss_image ('+cl.clip_name+')');
  ok(nodes(g,'VAELoader')[0].inputs.vae_name==='flux2-vae_small.safetensors', 'small FLUX.2 VAE');
  ok(nodes(g,'EmptyFlux2LatentImage')[0].inputs.width===1024 && nodes(g,'EmptyLatentImage').length===0, 'Empty Flux 2 Latent at 1024');
  let ks = titled(g,'Painting').inputs;
  ok(ks.sampler_name==='er_sde' && ks.scheduler==='simple' && ks.steps===25 && ks.cfg===2.5, 'MOSS settings: '+[ks.sampler_name,ks.scheduler,ks.steps,ks.cfg].join(' '));
  ok(titled(g,'Prompt').inputs.text==='a woman holding a sign that says "OPEN", rainy street at night', 'prompt goes as written: '+titled(g,'Prompt').inputs.text);
  ok(/^nsfw, worst quality, bad anatomy, watermark, jpeg artifact/.test(titled(g,'Avoid').inputs.text), 'MOSS negative: '+titled(g,'Avoid').inputs.text);

  await page.click('#addBtn'); await page.click('[data-add=lora]');
  const lo = await page.$$eval('[data-k=lora] option', o => o.map(x=>x.textContent));
  ok(lo.join()==='moss_style_lora.safetensors', 'LoRA list shows MOSS LoRAs only, not the Fast one: '+lo.join());
  ok(!(await page.$('.block[style*="--lora"] [data-do=styleonly]')), 'no Style only on MOSS');
  g = await graph();
  ok(check(g).length===0 && nodes(g,'LoraLoaderModelOnly').length===1 && nodes(g,'LoraLoader').length===0, 'MOSS LoRA goes on the model only');

  await page.locator('[data-do=mossfast]').dispatchEvent('click');
  g = await graph(); ks = titled(g,'Painting (⚡ 8 steps)').inputs;
  ok(check(g).length===0 && nodes(g,'LoraLoaderModelOnly').some(x => x.inputs.lora_name==='moss_image_sft_8step_dmd.safetensors' && x.inputs.strength_model===1) && ks.steps===8 && ks.cfg===1,
    '⚡ Fast: DMD LoRA at 1.0, 8 steps, CFG 1');
  await page.locator('[data-do=mossfast]').dispatchEvent('click');

  // up block + faces: plain resize, faces skipped, still valid
  await page.click('#addBtn'); await page.click('[data-add=up]');
  await page.evaluate(() => { S.blocks.find(b => b.type==='sampler').faces = true; save(); });
  g = await graph();
  ok(check(g).length===0 && nodes(g,'FaceDetailer').length===0 && nodes(g,'ImageScaleBy').length===1, 'Redraw/Fix faces fall back to a plain resize on MOSS');
  await page.evaluate(() => { S.blocks = S.blocks.filter(b => b.type!=='up'); S.blocks.find(b => b.type==='sampler').faces = false; save(); renderBlocks(); });

  // a draft and its finish
  const dg = await page.evaluate(() => [buildGraph({draft:10, one:true}).graph, buildGraph({one:true, exact:true}).graph]);
  const dk = nodes(dg[0],'KSamplerAdvanced')[0].inputs, fk = nodes(dg[1],'KSamplerAdvanced')[0].inputs;
  ok(check(dg[0]).length===0 && check(dg[1]).length===0 && dk.end_at_step===10 && fk.start_at_step===0 && fk.steps===dk.steps && fk.noise_seed===dk.noise_seed, 'MOSS drafts stop at step 10 and finish from the same start');

  await page.locator('#goBtn').dispatchEvent('click'); await page.waitForFunction(() => document.querySelectorAll('#recentRow img').length>=1 || document.querySelector('#err').style.display==='block', null, {timeout:5000}).catch(() => {});
  ok(sent.length>=1 && sent.every(x => nodes(x,'UNETLoader').length===1 && check(x).length===0), 'Render sends the MOSS graph to ComfyUI');

  // back to the checkpoint: its own graph and LoRAs again
  await page.selectOption('[data-k=ckpt]', 'sdxl.safetensors');
  ok((await page.$$eval('[data-k=lora] option', o => o.map(x=>x.textContent))).includes('pixel.safetensors') && !(await page.$$eval('[data-k=lora] option', o => o.map(x=>x.textContent))).includes('moss_image_sft_8step_dmd.safetensors'), 'SDXL LoRA list hides the Fast LoRA');
  g = await graph();
  ok(check(g).length===0 && nodes(g,'CheckpointLoaderSimple').length===1 && nodes(g,'UNETLoader').length===0, 'SDXL checkpoint still gets its own graph');
  ok(!!(await page.$('.block[style*="--model"] [data-seg=style][data-v=illustrious]')) && !(await page.$('.block[style*="--model"] [data-seg=style][data-v=moss]')), 'Style row back, without MOSS in it');

  // a computer without MOSS: 🌿 Get MOSS-Image fetches the four files into the right folders
  OI = full(); OI.UNETLoader.input.required.unet_name = C(['DasiwaMinimaxH3_turbo.safetensors']); OI.CLIPLoader.input.required.clip_name = C(['umt5.safetensors']);
  OI.LoraLoader.input.required.lora_name = C(['pixel.safetensors']); for(const k of Object.keys(DEF)) OI[k] = OI[k] || {input:{required:{}}};
  await page.evaluate(async () => { const p = pcOf(base()); p.oi = await (await fetch(base() + '/object_info')).json(); info.ckpt = ckptList(p.oi); renderBlocks(); });
  ok(/Get MOSS-Image.*\(13\.9 GB\)/.test(await page.textContent('[data-do=mossget]')), '🌿 Get MOSS-Image offered with its size: '+await page.textContent('[data-do=mossget]'));
  await page.locator('[data-do=mossget]').dispatchEvent('click'); await page.waitForTimeout(300);
  ok(dls.map(d => d.kind).join()==='diffusion_models,text_encoders,loras' && dls[2].name==='moss_image_sft_8step_dmd.safetensors' && dls.every(d => /^https:\/\/huggingface\.co\//.test(d.url)),
    'downloads model, encoder and Fast LoRA (VAE already there): '+dls.map(d => d.kind+':'+d.name).join(' '));
  ok(logs.length===0, 'no console errors '+logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
