// 🧊 the 3D block (Jordan 2026-10-24): ▶ Make it 3D from the picture in the preview, the face fixed on every MiniMax picture, Light /
// Medium / Heavy Illustrious looks kept to switch between, 🖌 Repaint this angle, 🎨 Render character cut out along her outline;
// and the same made on Render with the app closed: the phone hands it to Render's helper (a pretend one here), a hidden app
// (?worker=1, its own browser) takes it, makes it and sends it back, and the phone shows it.
// reference-to-video clip (cast card pictures first, the place picture last) shaped like its panel, spread over Render and
// Main; every panel scrubs on the page; ↻ makes another take; 💾 saves the page. Hidden keeps its own pages.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const VID = fs.readFileSync(path.join(__dirname, 'fixtures', 'turn.webm'));
const C = a => [a];
const DEF = {
  LoadImage:[['image'],2], UNETLoader:[['unet_name','weight_dtype'],1], LoraLoaderModelOnly:[['model','lora_name','strength_model'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1],
  MiniMaxH3ReferenceToVideo:[['clip','prompt','width','height','length','ref_image_size'],2],
  BasicGuider:[['model','conditioning'],1], BasicScheduler:[['model','scheduler','steps','denoise'],1], KSamplerSelect:[['sampler_name'],1], RandomNoise:[['noise_seed'],1],
  SamplerCustomAdvanced:[['noise','guider','sampler','sigmas','latent_image'],2], VAEDecodeTiled:[['samples','vae','tile_size','overlap','temporal_size','temporal_overlap'],1],
  CreateVideo:[['images','fps'],1], SaveVideo:[['video','filename_prefix','format'],0],
  MiniMaxH3ImageToVideo:[['clip','vae','prompt','width','height','length'],2], MiniMaxH3AddGuide:[['positive','latent','frame_idx'],1],
  CheckpointLoaderSimple:[['ckpt_name'],3], LoraLoader:[['model','clip','lora_name','strength_model','strength_clip'],2], CLIPTextEncode:[['clip','text'],1],
  ConditioningSetArea:[['conditioning','width','height','x','y','strength'],1], ConditioningCombine:[['conditioning_1','conditioning_2'],1],
  ImageScale:[['image','upscale_method','width','height','crop'],1], VAEEncode:[['pixels','vae'],1], VAEDecode:[['samples','vae'],1], EmptyLatentImage:[['width','height','batch_size'],1],
  ImageBlend:[['image1','image2','blend_factor','blend_mode'],1], ImageToMask:[['image','channel'],1], ThresholdMask:[['mask','value'],1], GrowMask:[['mask','expand'],1], ImageCompositeMasked:[['destination','source','x','y','mask'],1],
  DepthAnythingV2Preprocessor:[['image','resolution'],1], ImageBatch:[['image1','image2'],1], MaskToImage:[['mask'],1], AnimeLineArtPreprocessor:[['image','resolution'],1], ImageScaleBy:[['image','upscale_method','scale_by'],1], ControlNetLoader:[['control_net_name'],1], SetUnionControlNetType:[['control_net','type'],1], ControlNetApplyAdvanced:[['positive','negative','control_net','image','strength','start_percent','end_percent'],2],
  LoadBackgroundRemovalModel:[['bg_removal_name'],1], RemoveBackground:[['bg_removal_model','image'],1],
  Canny:[['image','low_threshold','high_threshold'],1], JoinImageWithAlpha:[['image','alpha'],1], InvertMask:[['mask'],1],
  SolidMask:[['value','width','height'],1], MaskComposite:[['destination','source','x','y','operation'],1], FeatherMask:[['mask','left','top','right','bottom'],1], SetLatentNoiseMask:[['samples','mask'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1], LoadDA3Model:[['model_name','weight_dtype'],1], DA3Inference:[['da3_model','image','resolution','resize_method','mode'],1], DA3GeometryToMesh:[['da3_geometry','batch_index','decimation','discontinuity_threshold','confidence_threshold','use_sky_mask','texture'],1], SaveGLB:[['mesh','filename_prefix'],0], LoadMoGeModel:[['model_name'],1], MoGeInference:[['moge_model','image'],1], MoGeRender:[['moge_geometry','output'],1], ImageToMask:[['image','channel'],1], GrowMask:[['mask','expand','tapered_corners'],1], ColorMatch:[['image_ref','image_target','method'],1], KSamplerAdvanced:[['model','add_noise','noise_seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','start_at_step','end_at_step','return_with_leftover_noise'],1], SaveImage:[['images','filename_prefix'],0], ImageFromBatch:[['image','batch_index','length'],1], LoadVideo:[['file'],1], GetVideoComponents:[['video'],3], ModelPatchLoader:[['name'],1], MiniMaxH3FunControlNetApply:[['model','model_patch','vae','strength','control_video'],1],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(!DEF[t.class_type]) errs.push(t.class_type + ' not known'); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
const OI = () => ({ColorMatch:{input:{required:{method:C(['mkl'])}}}, CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors', 'iriselTouchIL_v10.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler', 'euler_ancestral']), scheduler:C(['normal'])}}},
  LoraLoader:{input:{required:{lora_name:C(['AFKJ Style Illustrious Claude.safetensors', 'librarianx_v2.safetensors'])}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:C(['minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', 'AFK_minimax_h3_style.safetensors', 'librarianx_v2.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors', 'DasiwaMinimaxH3_dasiwaHybridV2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']), weight_dtype:C(['default'])}}},
  MiniMaxH3ImageToVideo:{input:{required:{}}}, MiniMaxH3AddGuide:{input:{required:{}}}, CLIPTextEncode:{input:{required:{}}}, ConditioningSetArea:{input:{required:{}}}, ConditioningCombine:{input:{required:{}}},
  ImageScale:{input:{required:{}}}, VAEEncode:{input:{required:{}}}, VAEDecode:{input:{required:{}}}, EmptyLatentImage:{input:{required:{}}}, SolidMask:{input:{required:{}}}, MaskComposite:{input:{required:{}}}, FeatherMask:{input:{required:{}}}, SetLatentNoiseMask:{input:{required:{}}}, ImageBlend:{input:{required:{}}}, ImageToMask:{input:{required:{}}}, ThresholdMask:{input:{required:{}}}, GrowMask:{input:{required:{}}}, ImageCompositeMasked:{input:{required:{}}},
  ImageBatch:{input:{required:{}}}, MaskToImage:{input:{required:{}}}, AnimeLineArtPreprocessor:{input:{required:{}}}, ImageScaleBy:{input:{required:{}}}, DepthAnythingV2Preprocessor:{input:{required:{ckpt_name:C(['depth_anything_v2_vitl.pth'])}}}, ControlNetLoader:{input:{required:{control_net_name:C(['diffusion_pytorch_model_promax.safetensors'])}}}, SetUnionControlNetType:{input:{required:{}}}, ControlNetApplyAdvanced:{input:{required:{}}},
  LoadBackgroundRemovalModel:{input:{required:{bg_removal_name:C(['BiRefNet-general.safetensors'])}}}, RemoveBackground:{input:{required:{}}},
  Canny:{input:{required:{}}}, JoinImageWithAlpha:{input:{required:{}}}, InvertMask:{input:{required:{}}},
  CLIPLoader:{input:{required:{clip_name:C(['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']), type:C(['stable_diffusion','minimax'])}}},
  VAELoader:{input:{required:{vae_name:C(['minimax_h3_video_vae_fp16.safetensors'])}}},
  MiniMaxH3ReferenceToVideo:{input:{required:{}}}, SaveVideo:{input:{required:{}}}, SaveImage:{input:{required:{}}}, CreateVideo:{input:{required:{}}}, ModelPatchLoader:{input:{required:{name:C(['minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors'])}}}, MiniMaxH3FunControlNetApply:{input:{required:{}}}, LoadVideo:{input:{required:{}}}, GetVideoComponents:{input:{required:{}}}, ImageFromBatch:{input:{required:{}}}, LoadImage:{input:{required:{}}}});
// a one-triangle .glb (positions and vertex colours), as DA3GeometryToMesh would save
const GLBF = (() => { const pos = new Float32Array([-0.5, -0.5, 2, 0.5, -0.5, 2, 0, 0.6, 2.3]), col = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(col.buffer)]);
  const json = {asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}], meshes:[{primitives:[{attributes:{POSITION:0, COLOR_0:1}}]}], buffers:[{byteLength:bin.length}],
    bufferViews:[{buffer:0, byteOffset:0, byteLength:36}, {buffer:0, byteOffset:36, byteLength:36}], accessors:[{bufferView:0, componentType:5126, count:3, type:'VEC3', min:[-0.5, -0.5, 2], max:[0.5, 0.6, 2.3]}, {bufferView:1, componentType:5126, count:3, type:'VEC3'}]};
  let js = Buffer.from(JSON.stringify(json)); while(js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const h = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8); h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4); return Buffer.concat([h, jh, js, bh, bin]); })();
DEF.FaceDetailer = [['image','model','clip','vae','positive','negative','bbox_detector','denoise','guide_size','seed'],6]; DEF.UltralyticsDetectorProvider = [['model_name'],2]; DEF.SAMLoader = [['model_name','device_mode'],1];
const OI2 = () => Object.assign(OI(), {FaceDetailer:{input:{required:{}}}, UltralyticsDetectorProvider:{input:{required:{model_name:C(['bbox/face_yolov8m.pt'])}}}, SAMLoader:{input:{required:{}}}});
const V = g => Object.values(g), has = (g, c) => V(g).some(n => n.class_type===c);
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const RIG_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'rig', 'index.html'), 'utf8'), DEPS = process.env.RIG_DEPS || '';
  const VIEW_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'rig', 'view.html'), 'utf8');
  if(!DEPS){ console.log('needs RIG_DEPS (three.js) for the rig and the 3D viewer'); process.exit(1); }
  const browser = await chromium.launch(), logs = [], ALL = [], PCS = {};
  // the pretend Render helper's 🧊 store, as render_deck_models.py keeps it
  const P3D = {}, P3DLOG = [];
  const p3d = (u, body) => {
    if(u.pathname==='/renderdeck/p3d'){ const ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean);
      return {p3d:1, jobs:Object.fromEntries(Object.entries(P3D).filter(([k]) => !ids.length || ids.includes(k)).map(([k, j]) => [k, {P:j.P, rev:j.rev, done:j.done && !j.asks.length}]))}; }
    const b = JSON.parse(body || '{}'), w = u.pathname.split('/').pop(); P3DLOG.push(w);
    if(w==='add'){ P3D[b.id] = {P:b.P, rev:1, done:false, asks:[], hidden:!!b.hidden, servers:b.servers, off:b.off || [], app:b.app, farm:b.farm}; return {ok:1}; }
    if(w==='ask'){ const j = P3D[b.id]; j.asks.push(b.ask); j.done = false; return {ok:1}; }
    if(w==='take'){ const out = []; for(const [k, j] of Object.entries(P3D)){ if(j.asks.some(a => a.drop)){ out.push({id:k, drop:true}); delete P3D[k]; }
        else if(!j.done || j.asks.length){ out.push({id:k, P:j.P, hidden:j.hidden, servers:j.servers, off:j.off, asks:j.asks}); j.asks = []; } } return {jobs:out}; }
    if(w==='put'){ const j = P3D[b.id]; j.P = b.P; j.rev++; j.done = !!b.done && !j.asks.length; return {ok:1}; } };
  for(const [name, host] of [['Render', 'https://jordo-desktop.test'], ['Main', 'https://jordo-main.test']]) PCS[name] = {url:host, sent:[], ups:[], polls:{}, outs:[]};
  async function open(url){
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true }), page = await ctx.newPage();
    page.on('pageerror', e => logs.push('PAGEERROR '+e.message+' '+(e.stack||'').split('\n').slice(0,4).join(' / '))); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
    page.on('dialog', d => d.accept());
    await ctx.route(/^https:\/\/app\.test\/(\?.*)?$/, r => r.fulfill({ contentType:'text/html', body:html }));
    await ctx.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
    await ctx.routeWebSocket(/\.test\/ws/, ws => {});
    await ctx.route('https://app.test/rig/**', r => r.fulfill({ contentType:'text/html', body:/\/rig\/view\.html/.test(r.request().url()) ? VIEW_HTML : RIG_HTML.replace('async function poseFromPicture(url, pc){', 'async function poseFromPicture(url, pc){ if(parent.TEST_POSE){ parent.TEST_POSE.push(url); return {partial:false}; }').replace('async function poseFromOrbit(urls, angles, pc, onStep){', 'async function poseFromOrbit(urls, angles, pc, onStep){ if(parent.TEST_POSE){ parent.TEST_POSE.push({orbit:urls.length, a1:angles[1]}); lastRead = null; return {used:urls.length, n:urls.length, partial:false}; }')}));
    await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => { const f = path.join(DEPS, 'three-0.160.0', 'package', new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.160\.0\//, ''));
      r.fulfill(fs.existsSync(f) ? { contentType:'text/javascript', body:fs.readFileSync(f) } : { status:404, body:'' }); });
    for(const [name, pc] of Object.entries(PCS)) await ctx.route(pc.url + '/**', async r => {
      const u = new URL(r.request().url()), cors = {'Access-Control-Allow-Origin':'*'};
      if(u.pathname==='/object_info') return r.fulfill({ json:OI2() });
      if(u.pathname==='/view' && /\.webm$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'video/webm', body:VID, headers:cors });
      if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG, headers:cors });
      if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
      if(u.pathname==='/upload/image'){ pc.ups.push(1); const bd = r.request().postDataBuffer(); if(bd && /name="type"\r\n\r\noutput/.test(bd.toString('latin1'))) pc.outs.push({sub:bd.toString('latin1').match(/name="subfolder"\r\n\r\n([^\r]*)/)[1], png:bd.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])) >= 0, alpha:bd.indexOf(Buffer.from('IHDR')) >= 0 && bd[bd.indexOf(Buffer.from('IHDR')) + 13]===6}); return r.fulfill({ json:{name:name[0] + 'up_' + pc.ups.length + '.png', subfolder:'', type:'input'} }); }
      if(u.pathname==='/prompt'){ const jj = JSON.parse(r.request().postData()); ALL.push(jj); pc.sent.push(jj); return r.fulfill({ json:{prompt_id:name[0] + pc.sent.length, number:0, node_errors:{}} }); }
      if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = pc.sent[+id.slice(1) - 1].prompt, ks = Object.keys(g);
        if((pc.polls[id] = (pc.polls[id] || 0) + 1) < 2) return r.fulfill({ json:{[id]:{status:{completed:false}}} });
        const imgs = ks.filter(k => g[k].class_type==='SaveImage');
        if(!ks.some(k => g[k].class_type==='SaveVideo') && imgs.length >= 2) return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:Object.fromEntries(imgs.map(k => { const pre = g[k].inputs.filename_prefix, c = pre.lastIndexOf('/');
          return [k, {images:[{filename:pre.slice(c + 1) + '_' + id + '_.png', subfolder:pre.slice(0, c), type:'output'}]}]; }))}} });
        const vid = ks.find(k => g[k].class_type==='SaveVideo'), img = ks.find(k => g[k].class_type==='SaveImage'), sv = vid || img, pre = g[sv].inputs.filename_prefix, cut = pre.lastIndexOf('/');
        const f = {filename:pre.slice(cut + 1) + '_' + id + '_.' + (vid ? 'webm' : 'png'), subfolder:pre.slice(0, cut), type:'output'};
        const four = !vid && g[sv].inputs.images && g[g[sv].inputs.images[0]].class_type==='ImageBatch';
        let nb = 1; for(let q = four ? g[sv].inputs.images[0] : null; q && g[q].class_type==='ImageBatch'; q = g[q].inputs.image1[0]) nb++;
        const fs = four ? Array.from({length:nb===2 ? 2 : Math.max(nb, 4)}, (_, n) => n + 1).map(n => Object.assign({}, f, {filename:f.filename.replace('.png', n + '.png')})) : [f];
        return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:{[sv]:{images:fs}}}} }); }
      if(name==='Render' && u.pathname.startsWith('/renderdeck/p3d')) return r.fulfill({ json:p3d(u, r.request().postData()), headers:cors });
      if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{jobs:[], token:false} });
      r.fulfill({ status:404, body:'' });
    });
    await page.goto(url); return page;
  }
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  const page = await open('https://app.test/'); page.on('framenavigated', f => { if(f===page.mainFrame()) console.log('NAV', f.url()); });
  for(const pc of [PCS.Main, PCS.Render]){ await page.click('#openSettings'); await page.fill('#server', pc.url); await page.evaluate(() => document.querySelector('#connectBtn').click());
    await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on')); }
  await page.waitForFunction(() => S.servers.length===2 && allPcs().every(p => p.online && p.oi), null, {timeout:10000});
  const pic = n => ({url:'https://jordo-desktop.test/view?filename=' + n + '.png', prompt:'a girl jumping', seed:1, t:Date.now(), snap:{prompt:'a girl jumping', blocks:[{type:'model', ckpt:'iriselTouchIL_v10.safetensors'}, {type:'lora', on:true, lora:'AFKJ Style Illustrious Claude.safetensors', strength:0.8}]}});
  await page.evaluate(g => { closeSheets(); window.TEST_POSE = []; window.WAIT_MS = 150; S.gallery = [g]; save(); drawStrip(); show(0); }, pic('jump'));

  // the row under the picture is gone (✨ Finish stays for drafts); 🧊 is a block you add
  ok(await page.evaluate(() => [...document.querySelectorAll('#resultActions button')].filter(b => !b.hidden && b.offsetParent!==null).map(b => b.dataset.act).join()==='recipe,seed'), 'the row under the picture has only ⤵ Use its settings and 🎲 Keep this seed (Jordan 2026-10-29)');
  await page.click('#addBtn'); ok(await page.isVisible('[data-add="d3"]'), '🧊 3D is in the Add a block list'); await page.click('[data-add="d3"]');
  await page.waitForSelector('#d3Body [data-d3="start"]', {timeout:5000}).catch(async e => { console.log('DBG', await page.evaluate(() => JSON.stringify({b:S.blocks.map(b => b.type), open:S.open, body:($('#d3Body') || {}).outerHTML}))); throw e; });
  ok(!(await page.$('.block:has(#d3Body) [data-do="toggle"]')) && /Keep the app open/.test(await page.textContent('#d3Body')), 'the block has no on/off switch (it isn\'t part of the render) and, with no Render helper, says to keep the app open');
  const before = await page.evaluate(() => JSON.stringify(buildGraph()));
  ok(!/FaceDetailer|MiniMax/.test(before), 'a normal render is unchanged with the block in the recipe');
  await page.evaluate(g => { g.snap = {prompt:'another girl', blocks:JSON.parse(JSON.stringify(S.blocks.filter(b => b.type!=='d3')))}; S.gallery.push(g); save(); drawStrip(); }, pic('other')); await page.click('#strip img[data-i="1"]'); await page.waitForTimeout(300);
  ok(await page.$('#d3Body') && await page.evaluate(() => S.blocks.filter(b => b.type==='d3').length===1), 'tapping another thumbnail loads its recipe but keeps the 🧊 block (Jordan: it vanished)');
  await page.evaluate(() => show(0)); await page.waitForSelector('#d3Body [data-d3="start"]');

  // ▶ Make it 3D, from the app
  const n0 = ALL.length; await page.click('#d3Body [data-d3="start"]');
  await page.waitForSelector('#d3Body .pbar', {timeout:10000});
  ok(await page.evaluate(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p); return P && P.ctl && P.faces && P.mids.length===40 && !P.remote && S.pv3d; }), '▶ Make it 3D starts the 🦴🎬 3D (5 heights, the in-between angles too, face fixing on) with a progress bar');
  await page.waitForFunction(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p); return P && P.views.every(v => v.url) && P.mids.every(v => v.url); }, null, {timeout:150000}).catch(async e => { console.log('DBG', await page.evaluate(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p); return JSON.stringify({orb:P.orb.map(o => [o.step, o.ring, (o.urls || []).length, o.err, !!o.making, !!o.pick]), v:P.views.filter(v => !v.url).length, m:P.mids.filter(v => !v.url).length, ve:P.views.concat(P.mids).filter(v => v.err).slice(0, 2), mk:P.views.concat(P.mids).filter(v => v.making || v.busy).map(v => [v.ring, v.i, v.mid, v.busy, v.making && v.making.id, v.making && v.making.pc]), nofr:P.views.concat(P.mids).filter(v => !v.url && !cmPoseFrame(P, v)).map(v => [v.ring, v.i, !!v.mid]).slice(0, 8), rig:P.rigging, st:m3Status(P), stopped:P.stopped}); }), ALL.length - n0, JSON.stringify(PCS.Render.polls).slice(-300), JSON.stringify(PCS.Main.polls).slice(-300)); throw e; });
  { const gs = ALL.slice(n0).map(x => x.prompt), pics = gs.filter(g => has(g, 'CheckpointLoaderSimple')), mm = gs.filter(g => V(g).some(n => /^MiniMaxH3/.test(n.class_type)));
    ok(mm.length===7 && pics.length >= 20 && pics.every(g => has(g, 'FaceDetailer') && has(g, 'UltralyticsDetectorProvider')) && !gs.flatMap(check).length,
      'every MiniMax picture gets its face fixed in Illustrious (FaceDetailer, face_yolov8m): ' + JSON.stringify({mm:mm.length, pics:pics.length, e:gs.flatMap(check).slice(0, 3)})); }
  await page.waitForSelector('#d3Body [data-d3look="medium"]', {timeout:10000});
  const vw = await (await page.waitForSelector('#st3d')).contentFrame();
  await vw.waitForFunction(() => window.VIEW && VIEW.view() && VIEW.view().url, null, {timeout:20000});
  ok(await vw.evaluate(() => VIEW.view().N)===16, 'the preview shows her in 3D with 16 angles round each height');

  // a look: Illustrious over the same MiniMax frames, kept
  { const nl = ALL.length; await page.click('#d3Body [data-d3look="medium"]'); await page.waitForTimeout(800);
    ok(ALL.length===nl && await page.$('#d3Body [data-d3="paintall"]') && /Render character paints at this strength/.test(await page.textContent('#d3Body')), 'picking Medium only picks it: nothing is painted until asked (Jordan)'); }
  const n1 = ALL.length; await page.click('#d3Body [data-d3="paintall"]');
  await page.waitForFunction(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p); return (P.lk || []).length===80 && P.lk.every(h => h.url); }, null, {timeout:150000});
  { const gs = ALL.slice(n1).map(x => x.prompt), dn = [...new Set(gs.map(g => (V(g).find(n => n.class_type==='KSampler') || {inputs:{}}).inputs.denoise))];
    ok(gs.length===80 && dn.join()==='0.4' && gs.every(g => has(g, 'FaceDetailer') && has(g, 'VAEEncode')) && !gs.flatMap(check).length, 'Medium paints all 80 angles over the MiniMax frames at 0.4, face fixed: ' + JSON.stringify({n:gs.length, dn}));
    const sw = await page.evaluate(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p), a = m3Pics(P, 'medium')[0][0], b = m3Pics(P, 'mm')[0][0]; return a!==b && /medium|_str/.test(a); });
    ok(sw, 'the 3D shows the Medium pictures'); }
  await page.click('#d3Body [data-d3look="mm"]'); const n2 = ALL.length; await page.click('#d3Body [data-d3look="medium"]'); await page.waitForTimeout(800);
  ok(ALL.length===n2 && await page.evaluate(() => S.cmPoses.find(x => x.id===S.gallery[0].d3p).show==='medium'), 'switching back to Medium paints nothing again: the look is kept');
  { const nh = ALL.length; await page.click('#d3Body [data-d3look="heavy"]'); await page.click('#d3Body [data-d3="paintall"]'); await page.waitForSelector('#d3Body [data-d3="unlook"]'); await page.click('#d3Body [data-d3="unlook"]'); await page.waitForTimeout(1200);
    const hv = await page.evaluate(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p); return {left:(P.lk || []).filter(h => h.str==='heavy').length, busy:cmPics(P).filter(h => h.making || h.busy).length}; });
    ok(hv.left <= 4 && ALL.length - nh <= 4 && !!(await page.$('#d3Body [data-d3="paintall"]')), '✕ Stop painting the angles stops the Heavy pass (only what was already sent): ' + JSON.stringify(hv));
    await page.click('#d3Body [data-d3look="medium"]'); await page.waitForTimeout(500); }

  // 🖌 Repaint this angle
  await vw.evaluate(() => VIEW.view()); const n3 = ALL.length; await page.click('#d3Body [data-d3="repaint"]');
  await page.waitForFunction(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p); return !cmPics(P).some(h => h.redo); }, null, {timeout:30000});
  ok(ALL.length===n3 + 1 && has(ALL[n3].prompt, 'FaceDetailer') && V(ALL[n3].prompt).find(n => n.class_type==='KSampler').inputs.denoise===0.4, '🖌 Repaint this angle paints just that one again, in the look shown');

  // 🎨 Render character: one Illustrious picture of the view, cut out along her outline
  const g0 = await page.evaluate(() => S.gallery.length);
  await page.click('#d3Body [data-d3="char"]');
  await page.waitForFunction(n => S.gallery.length===n + 1, g0, {timeout:20000});
  { const g = await page.evaluate(() => CM_SENT[CM_SENT.length - 1] || null) || ALL[ALL.length - 1].prompt, j = V(g).find(n => n.class_type==='JoinImageWithAlpha'), ld = j && g[j.inputs.alpha[0]];
    const it = await page.evaluate(() => ({p:!!S.gallery[0].d3p, from:!!S.gallery[0].d3from, cam:!!S.gallery[0].d3cam, url:/\/render_|render/.test(S.gallery[0].url)}));
    ok(j && ld && ld.class_type==='LoadImage' && j.inputs.alpha[1]===1 && has(g, 'FaceDetailer') && /a girl jumping/.test(V(g).filter(n => n.class_type==='CLIPTextEncode')[0].inputs.text) && V(g).find(n => n.class_type==='KSampler').inputs.denoise===0.4 && !check(g).length && it.p && it.from && it.cam,
      '🎨 Render character: Illustrious with the render\'s prompt at the look\'s strength, face fixed, cut out with the view\'s own outline (LoadImage mask), landing in the strip: ' + check(g).join('; ') + JSON.stringify(it)); }

  // ⬇ Flatten: the 3D view as it is now, one see-through PNG, into the same project
  await page.evaluate(() => { const i = S.gallery.findIndex(x => x.d3p && !x.d3from && pic3d(x)===2); show(i); });
  await (await page.waitForSelector('#st3d')).contentFrame().then(f => f.waitForFunction(() => window.VIEW && VIEW.view() && VIEW.view().url, null, {timeout:20000}));
  const alpha = await page.evaluate(async () => { const r = await flatShot(); const im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = r.url; }); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return {corner:x.getImageData(2, 2, 1, 1).data[3], png:/^data:image\/png/.test(r.url), what:r.what}; });
  ok(alpha.png && alpha.corner===0 && alpha.what==='3D view', 'the flat copy is a PNG with see-through around her (no grid, no floor): ' + JSON.stringify(alpha));
  ok(/Flat/.test(await page.textContent('#st3dBtn')), 'the 🖼 Flat button is on the 3D preview');
  const gf = await page.evaluate(() => S.gallery.length), of = PCS.Render.outs.length; await page.click('#st3dBtn');
  await page.waitForFunction(n => S.gallery.length===n + 1, gf, {timeout:10000});
  { const it = await page.evaluate(() => ({flat:S.gallery[0].flat, proj:S.gallery[0].proj===S.gallery[1].proj || !!S.gallery[0].proj, from:!!S.gallery[0].from, shown:shownIdx===0, d3:!!document.querySelector('#d3Body')})), up = PCS.Render.outs[of];
    ok(it.flat==='3D view' && it.from && it.shown && up && up.sub==='RenderDeck/render', '🖼 Flat saves the 3D view as one PNG with see-through kept (RGBA) into RenderDeck/render and shows it: ' + JSON.stringify({it, up})); }
  // 🖥 made on Render with the app closed
  await page.evaluate(g => { window.TEST_P3D = 'https://jordo-desktop.test'; S.gallery.unshift(g); save(); drawStrip(); show(0); }, pic('jump2'));
  await page.waitForFunction(() => document.querySelector('#d3Body [data-d3="start"]'), null, {timeout:5000});
  ok(/close the app/.test(await page.textContent('#d3Body')), 'with Render\'s helper there, the block says it is made on Render and the app can close');
  const n4 = ALL.length; await page.click('#d3Body [data-d3="start"]');
  await page.waitForFunction(() => Object.keys(window).length && S.cmPoses.find(x => x.id===S.gallery[0].d3p && x.remote), null, {timeout:10000});
  await page.waitForTimeout(1500);
  const pid = await page.evaluate(() => S.gallery[0].d3p);
  ok(P3DLOG.includes('add') && P3D[pid] && ALL.length===n4, 'the phone hands the 3D to Render and sends no jobs itself: ' + JSON.stringify({log:P3DLOG, sent:ALL.length - n4}));
  const worker = await open('https://app.test/?worker=1&farm=' + encodeURIComponent('https://jordo-desktop.test'));
  await worker.evaluate(() => { window.TEST_POSE = []; window.WAIT_MS = 150; });
  await worker.waitForFunction(id => (S.cmPoses || []).some(P => P.id===id && P.views.every(v => v.url)), pid, {timeout:200000}).catch(async e => { console.log('DBG', P3DLOG.slice(-6), await worker.evaluate(() => JSON.stringify({srv:S.servers, test:S.test, info:!!info, pcs:allPcs().map(p => [p.url, p.online, !!p.oi]), P:(S.cmPoses || []).map(P => ({id:P.id, st:m3Status(P), rig:P.rigging, stopped:P.stopped, v:P.views.filter(v => v.url).length, orb:P.orb.map(o => (o.urls || []).length + (o.err || '') + ':' + (o.pick || []).join('-') + (M3_PK.has(o.id) ? 'PK' : '')), fit:!!P.rigFit, fail:!!P.rigFail, orbRig:P.orbRig, fr:P.views.slice(0, 3).map(v => !!cmPoseFrame(P, v)), busy:P.views.filter(v => v.busy || v.making || v.err).slice(0, 3).map(v => [v.busy, v.err, !!v.making])}))}))); console.log(logs.slice(0, 5)); throw e; });
  ok(ALL.length - n4 >= 27 && P3DLOG.includes('take') && P3DLOG.includes('put'), 'the hidden app on Render takes it and makes it: ' + (ALL.length - n4) + ' jobs');
  await page.waitForFunction(() => { const P = S.cmPoses.find(x => x.id===S.gallery[0].d3p); return P && P.views.every(v => v.url) && P.rdone; }, null, {timeout:30000});
  ok(true, 'the phone shows it done, mirrored from Render');
  await page.waitForSelector('#d3Body [data-d3look="light"]', {timeout:5000});
  const n5 = ALL.length; await page.click('#d3Body [data-d3look="light"]'); await page.click('#d3Body [data-d3="paintall"]');
  await worker.waitForFunction(id => { const P = S.cmPoses.find(x => x.id===id); return (P.lk || []).length===80 && P.lk.every(h => h.url); }, pid, {timeout:150000});
  ok(P3DLOG.includes('ask') && ALL.slice(n5).every(x => V(x.prompt).find(n => n.class_type==='KSampler').inputs.denoise===0.3), 'tapping Light on the phone is passed to Render, which paints it at 0.3');
  await page.waitForFunction(id => { const P = S.cmPoses.find(x => x.id===id); return (P.lk || []).filter(h => h.url).length===80 && P.show==='light'; }, pid, {timeout:30000});
  ok(true, 'the phone gets the Light pictures and keeps showing Light');
  // one started from the app before Render had the helper can be handed over
  await page.evaluate(g => { delete window.TEST_P3D; S.gallery.unshift(g); save(); drawStrip(); show(0); }, pic('jump3'));
  await page.waitForSelector('#d3Body [data-d3="start"]'); await page.click('#d3Body [data-d3="start"]'); await page.waitForSelector('#d3Body .pbar');
  ok(/needs the new helper/.test(await page.textContent('#d3Body')) && !(await page.$('#d3Body [data-d3="move"]')), 'made from the app: it says Render needs the new helper to close the app');
  await page.evaluate(() => { window.TEST_P3D = 'https://jordo-desktop.test'; d3Draw(true); }); await page.click('#d3Body [data-d3="move"]');
  const mid = await page.evaluate(() => S.gallery[0].d3p); await page.waitForFunction(id => S.cmPoses.find(x => x.id===id).remote, mid, {timeout:5000});
  ok(!!P3D[mid] && /close the app/.test(await page.textContent('#d3Body')), '🖥 Hand it to Render moves one being made from the app over to Render');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
