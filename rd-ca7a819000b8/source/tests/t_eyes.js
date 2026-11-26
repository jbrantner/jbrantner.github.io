// 👁 Eye redraw block (2026-11-26): SAM 3 finds both eyes, kept inside faces, grown, one crop for both, the Impact Detailer
// zooms and redraws with the render's model + its LoRAs + the eye LoRA, then pastes back feathered. Last step of a render.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'comfy-app.html');
const SERVER = 'https://render.test';
const DEF = { // required inputs and output count
  CheckpointLoaderSimple:[['ckpt_name'],3], CLIPTextEncode:[['text','clip'],1], EmptyLatentImage:[['width','height','batch_size'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1],
  KSamplerAdvanced:[['model','add_noise','noise_seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','start_at_step','end_at_step','return_with_leftover_noise'],1],
  VAEDecode:[['samples','vae'],1], SaveImage:[['images','filename_prefix'],0], LoraLoader:[['model','clip','lora_name','strength_model','strength_clip'],2],
  UNETLoader:[['unet_name','weight_dtype'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1],
  EmptyFlux2LatentImage:[['width','height','batch_size'],1], LoraLoaderModelOnly:[['model','lora_name','strength_model'],1],
  ImageScaleBy:[['image','upscale_method','scale_by'],1], CLIPSetLastLayer:[['clip','stop_at_clip_layer'],1],
  FaceDetailer:[['image'],6], UltralyticsDetectorProvider:[['model_name'],2], SAMLoader:[['model_name'],1],
  SAM3_Detect:[['model','image','threshold','refine_iterations','individual_masks'],2], GrowMask:[['mask','expand','tapered_corners'],1],
  MaskComposite:[['destination','source','x','y','operation'],1], BboxDetectorSEGS:[['bbox_detector','image','threshold','dilation','crop_factor','drop_size','labels'],1],
  SegsToCombinedMask:[['segs'],1], MaskToSEGS:[['mask','combined','crop_factor','bbox_fill','drop_size','contour_fill'],1],
  DetailerForEach:[['image','segs','model','clip','vae','guide_size','guide_size_for','max_size','seed','steps','cfg','sampler_name','scheduler','positive','negative','denoise','feather','noise_mask','force_inpaint','wildcard','cycle'],1],
  ImpactImageBatchToImageList:[['image'],1],
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
const OI = {
  CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['BismuthIlMix_v8.safetensors','Oblivious_mix_illustrious.fp16.safetensors','sam3.1_multiplex_fp16.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['moss_image_sft_int8_convrot.safetensors']), weight_dtype:C(['default','fp8_e4m3fn'])}}},
  CLIPLoader:{input:{required:{clip_name:C(['qwen3.5_9b_w4a8_gptq.safetensors']), type:C(['stable_diffusion','moss_image'])}}},
  VAELoader:{input:{required:{vae_name:C(['flux2-vae_small.safetensors'])}}},
  LoraLoader:{input:{required:{lora_name:C(['DetailSlider-V1.safetensors','spiralwash_eyes_v4_il.safetensors','moss_image_sft_8step_dmd.safetensors'])}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:C(['moss_image_sft_8step_dmd.safetensors'])}}},
  KSampler:{input:{required:{sampler_name:C(['euler','euler_ancestral','er_sde','dpmpp_2m']),scheduler:C(['normal','simple','karras'])}}},
  UltralyticsDetectorProvider:{input:{required:{model_name:C(['bbox/face_yolov8m.pt'])}}},
  SAMLoader:{input:{required:{model_name:C(['sam_vit_b_01ec64.pth'])}}},
  EmptyFlux2LatentImage:{input:{required:{}}},
};
for(const k of Object.keys(DEF)) OI[k] = OI[k] || {input:{required:{}}};

(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(SRC,'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  for(const f of ['chars.txt','tags.txt','words.txt']) await page.route('https://app.test/'+f, r => r.fulfill({ contentType:'text/plain', body:fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8') }));
  await page.route(SERVER+'/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname.startsWith('/object_info/')){ const k = u.pathname.slice(13); return r.fulfill({ json:{[k]:OI[k]} }); }
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{jobs:[]} });
    if(u.pathname.startsWith('/history') || u.pathname.startsWith('/renderdeck/') || u.pathname.startsWith('/view')) return r.fulfill({ json:{} });
    r.fulfill({ status:404, body:'' });
  });
  await page.routeWebSocket(/render\.test\/ws/, ws => {});
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  const graph = async () => { await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const g = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets()); return g; };
  const nodes = (g, c) => Object.values(g).filter(x => x.class_type===c);
  const titled = (g, t) => Object.values(g).find(x => x._meta.title===t);
  const ref = (g, r) => g[r[0]];

  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.click('#connectBtn');
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.click('.block[style*="--model"] h3');
  await page.selectOption('[data-k=ckpt]', 'BismuthIlMix_v8.safetensors');
  await page.fill('#prompt', '1girl, solo, long hair, pink eyes, smile');

  await page.click('#addBtn');
  ok(await page.isEnabled('[data-add=eyes]'), 'Eye redraw is in the ＋ tray');
  await page.click('[data-add=eyes]');
  const eb = '.block[style*="--eye"]';
  ok(await page.$eval(eb + ' [data-k=lora]', s => s.value)==='spiralwash_eyes_v4_il.safetensors', 'the eye LoRA is picked by itself');
  const lo = await page.$$eval(eb + ' [data-k=lora] option', o => o.map(x => x.textContent));
  ok(!lo.some(x => /moss/i.test(x)) && lo[0].startsWith('No LoRA'), 'LoRA list: "No LoRA" first, no MOSS LoRAs: ' + lo.join());
  const ck = await page.$$eval(eb + ' [data-k=eckpt] option', o => o.map(x => x.textContent));
  ok(!ck.some(x => /sam3/i.test(x)) && /Same as the render/.test(ck[0]), 'Model list leaves SAM out: ' + ck.join());
  await page.fill(eb + ' [data-lw]', 'spiralwash');
  await page.fill(eb + ' [data-k=words]', 'spiral eyes, glowing eyes');

  let g = await graph();
  ok(check(g).length===0, 'graph is valid: ' + check(g).join('; '));
  const dfe = nodes(g, 'DetailerForEach'); ok(dfe.length===1, 'one eye Detailer');
  const save = nodes(g, 'SaveImage')[0];
  ok(ref(g, save.inputs.images)===dfe[0], 'the eye redraw is the very last step before Save');
  const d = dfe[0].inputs;
  ok(d.noise_mask===true && d.guide_size===1024 && d.max_size===1536 && d.denoise===0.45 && d.feather===16 && d.noise_mask_feather===16, 'zoom 1024 (max 1536), redraw 0.45, blend 16');
  const lora = ref(g, d.model); ok(lora.class_type==='LoraLoader' && lora.inputs.lora_name==='spiralwash_eyes_v4_il.safetensors' && ref(g, d.clip)===lora, 'eye LoRA on model and clip');
  ok(ref(g, lora.inputs.model)._meta.title==='Model', 'on top of the render\'s own model');
  ok(ref(g, d.vae)._meta.title==='Model', 'render\'s VAE');
  const pt = ref(g, d.positive).inputs.text;
  ok(/spiralwash, spiral eyes, glowing eyes/.test(pt) && /1girl, solo, long hair, pink eyes, smile/.test(pt) && pt.indexOf('spiralwash') < pt.indexOf('1girl'), 'eye words (trigger first) in front of the render\'s words: ' + pt);
  ok(!/spiralwash/.test(titled(g, 'Prompt').inputs.text), 'the eye trigger stays out of the main prompt');
  const segs = ref(g, d.segs).inputs; ok(segs.combined===true && segs.crop_factor===2 && segs.contour_fill===true, 'both eyes in ONE crop, context 2');
  const grow = ref(g, segs.mask); ok(grow.class_type==='GrowMask' && grow.inputs.expand===12, 'mask grown 12 px over the lids');
  const mul = ref(g, grow.inputs.mask); ok(mul.class_type==='MaskComposite' && mul.inputs.operation==='multiply', 'kept inside faces');
  const det = ref(g, mul.inputs.destination); ok(det.class_type==='SAM3_Detect' && det.inputs.threshold===0.4 && ref(g, det.inputs.image)===ref(g, d.image), 'SAM 3 looks at the picture being fixed');
  ok(ref(g, det.inputs.model).inputs.ckpt_name==='sam3.1_multiplex_fp16.safetensors' && ref(g, det.inputs.conditioning).inputs.text==='eye:2', 'SAM 3.1 looks for "eye:2"');
  ok(ref(g, ref(g, ref(g, mul.inputs.source).inputs.mask).inputs.segs).class_type==='BboxDetectorSEGS', 'face area from the face finder');

  // settings
  await page.evaluate(() => { const E = S.blocks.find(b => b.type==='eyes'); E.people = 2; E.find = 'eye, iris'; E.ctx = 3.5; E.zoom = 1280; E.faceOnly = false; E.keepLoras = false; save(); renderBlocks(); });
  await page.evaluate(() => { S.blocks.push({id:90, type:'lora', on:true, lora:'DetailSlider-V1.safetensors', strength:0.5}); save(); renderBlocks(); });
  g = await graph(); const d2 = nodes(g, 'DetailerForEach')[0].inputs;
  ok(check(g).length===0, 'graph is valid: ' + check(g).join('; '));
  ok(ref(g, nodes(g, 'SAM3_Detect')[0].inputs.conditioning).inputs.text==='eye:4, iris:4', '2 people: up to 4 of each word');
  ok(!nodes(g, 'MaskComposite').length && ref(g, d2.segs).inputs.crop_factor===3.5 && d2.guide_size===1280, 'faces off, context 3.5, zoom 1280');
  ok(ref(g, ref(g, d2.model).inputs.model)._meta.title==='Model', "render's LoRAs off: the eye LoRA sits on the plain checkpoint");
  await page.evaluate(() => { const E = S.blocks.find(b => b.type==='eyes'); E.keepLoras = true; E.eckpt = 'Oblivious_mix_illustrious.fp16.safetensors'; save(); });
  g = await graph(); const d3 = nodes(g, 'DetailerForEach')[0].inputs;
  ok(check(g).length===0 && ref(g, d3.vae).inputs.ckpt_name==='Oblivious_mix_illustrious.fp16.safetensors' && nodes(g, 'LoraLoader').filter(n => n.inputs.lora_name==='DetailSlider-V1.safetensors').length===2,
    'another checkpoint for the eyes gets the render\'s LoRAs too');

  // with an upscale ×2 the pixel sizes double
  await page.evaluate(() => { const E = S.blocks.find(b => b.type==='eyes'); E.eckpt = ''; E.faceOnly = true; S.blocks = S.blocks.filter(b => b.id!==90); S.blocks.push({id:91, type:'up', on:true, mode:'simple', scale:2, model:''}); save(); renderBlocks(); });
  g = await graph();
  ok(check(g).length===0 && nodes(g, 'GrowMask').some(n => n.inputs.expand===24) && ref(g, nodes(g, 'SAM3_Detect')[0].inputs.image).class_type==='ImageScaleBy', 'after a ×2 upscale: SAM looks at the big picture, mask grow 24 px');
  await page.evaluate(() => { S.blocks = S.blocks.filter(b => b.id!==91); save(); renderBlocks(); });

  // a batch of 2 goes one picture at a time
  await page.evaluate(() => { S.batch = 2; save(); });
  g = await graph(); ok(check(g).length===0 && nodes(g, 'ImpactImageBatchToImageList').length===1, 'batch: pictures go one at a time');
  await page.evaluate(() => { S.batch = 1; save(); });

  // drafts skip it, off skips it
  const dr = await page.evaluate(() => Object.values(buildGraph({draft:8}).graph).map(n => n.class_type));
  ok(!dr.includes('DetailerForEach') && !dr.includes('SAM3_Detect'), 'a draft has no eye redraw (its finish does)');
  await page.locator(eb + ' [data-do=toggle]').click();
  g = await graph(); ok(!nodes(g, 'SAM3_Detect').length, 'switched off: no eye pass');
  await page.locator(eb + ' [data-do=toggle]').click();

  // MOSS: the eyes are redrawn by a checkpoint
  await page.selectOption('.block[style*="--model"] [data-k=ckpt]', 'moss_image_sft_int8_convrot.safetensors');
  g = await graph(); const dm = nodes(g, 'DetailerForEach')[0];
  ok(check(g).length===0 && dm && ref(g, dm.inputs.vae).inputs.ckpt_name==='BismuthIlMix_v8.safetensors' && dm.inputs.sampler_name!=='er_sde' && dm.inputs.cfg!==2.5, 'MOSS picture: eyes redrawn by the first checkpoint with its own style settings, not MOSS ones: ' + check(g).join('; '));

  // a PNG of this render read back: the eye pass's model and LoRA aren't taken for the render's
  const pg = JSON.stringify(g);
  const rd = await page.evaluate(t => { const txt = 'prompt\0' + t, b = new TextEncoder().encode(txt), buf = new Uint8Array(8 + 12 + b.length + 12); const v = new DataView(buf.buffer);
    v.setUint32(8, b.length); buf.set(new TextEncoder().encode('tEXt'), 12); buf.set(b, 16); v.setUint32(20 + b.length, 0); buf.set(new TextEncoder().encode('IEND'), 24 + b.length);
    const r = fromPng(buf.buffer); return {ckpt:r.blocks.find(x => x.type==='model').ckpt, loras:r.blocks.filter(x => x.type==='lora').length}; }, pg);
  ok(rd.ckpt==='moss_image_sft_int8_convrot.safetensors' && rd.loras===0, 'reading the PNG back keeps MOSS as the model and adds no LoRA blocks: ' + JSON.stringify(rd));

  // no SAM 3.1 on the computer: skipped with a note
  await page.selectOption('.block[style*="--model"] [data-k=ckpt]', 'BismuthIlMix_v8.safetensors');
  await page.evaluate(() => { const p = pcOf(base()); p.oi = JSON.parse(JSON.stringify(p.oi)); p.oi.CheckpointLoaderSimple.input.required.ckpt_name[1].options = ['BismuthIlMix_v8.safetensors']; renderBlocks(); });
  const r2 = await page.evaluate(() => { const r = buildGraph(); return {has:Object.values(r.graph).some(n => n.class_type==='SAM3_Detect'), notes:r.notes}; });
  ok(!r2.has && r2.notes.some(n => /no SAM 3\.1/.test(n)) && await page.isVisible(eb + ' .warn'), 'no SAM 3.1: eyes skipped, the block says why');

  await page.evaluate(() => scrollTo(0, 0)); await page.locator(eb).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(__dirname, 'shot-eyes.png'), fullPage:false });
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  if(fail.length){ console.log('\n' + fail.length + ' failed'); process.exit(1); } console.log('\nall passed');
})();
