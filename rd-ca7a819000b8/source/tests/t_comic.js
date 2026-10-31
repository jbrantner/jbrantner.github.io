// 📖 Comic (2026-10-29, Comic and Scene in one place): a script becomes panels with layouts to pick; each panel picks a 3D Scene
// (panels can share one) and opens in the 3D page as its own camera; the panel's 3D render comes back as its picture; 🎞 Animate
// makes a MiniMax clip from it; ⧉ duplicates a panel; 💾 saves the page. Hidden keeps its own pages and scenes.
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
  DepthAnythingV2Preprocessor:[['image','resolution'],1], DWPreprocessor:[['image'],1], ImageBatch:[['image1','image2'],1], MaskToImage:[['mask'],1], AnimeLineArtPreprocessor:[['image','resolution'],1], ImageScaleBy:[['image','upscale_method','scale_by'],1], ControlNetLoader:[['control_net_name'],1], SetUnionControlNetType:[['control_net','type'],1], ControlNetApplyAdvanced:[['positive','negative','control_net','image','strength','start_percent','end_percent'],2],
  LoadBackgroundRemovalModel:[['bg_removal_name'],1], RemoveBackground:[['bg_removal_model','image'],1],
  ModelSamplingAuraFlow:[['model','shift'],1], EmptySD3LatentImage:[['width','height','batch_size'],1], ConditioningZeroOut:[['conditioning'],1],
  Canny:[['image','low_threshold','high_threshold'],1], JoinImageWithAlpha:[['image','alpha'],1], InvertMask:[['mask'],1], VAEEncodeForInpaint:[['pixels','vae','mask','grow_mask_by'],1],
  SolidMask:[['value','width','height'],1], MaskComposite:[['destination','source','x','y','operation'],1], FeatherMask:[['mask','left','top','right','bottom'],1], SetLatentNoiseMask:[['samples','mask'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1], LoadDA3Model:[['model_name','weight_dtype'],1], DA3Inference:[['da3_model','image','resolution','resize_method','mode'],1], DA3GeometryToMesh:[['da3_geometry','batch_index','decimation','discontinuity_threshold','confidence_threshold','use_sky_mask','texture'],1], SaveGLB:[['mesh','filename_prefix'],0], LoadMoGeModel:[['model_name'],1], MoGeInference:[['moge_model','image'],1], MoGeRender:[['moge_geometry','output'],1], ImageToMask:[['image','channel'],1], GrowMask:[['mask','expand','tapered_corners'],1], ColorMatch:[['image_ref','image_target','method'],1], KSamplerAdvanced:[['model','add_noise','noise_seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','start_at_step','end_at_step','return_with_leftover_noise'],1], SaveImage:[['images','filename_prefix'],0], ImageFromBatch:[['image','batch_index','length'],1], LoadVideo:[['file'],1], GetVideoComponents:[['video'],3], ModelPatchLoader:[['name'],1], MiniMaxH3FunControlNetApply:[['model','model_patch','vae','strength','control_video'],1],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(!DEF[t.class_type]) errs.push(t.class_type + ' not known'); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
const OI = () => ({ColorMatch:{input:{required:{method:C(['mkl'])}}}, CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors', 'iriselTouchIL_v10.safetensors', 'totZImageturbo.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler', 'euler_ancestral']), scheduler:C(['normal'])}}},
  LoraLoader:{input:{required:{lora_name:C(['AFKJ Style Illustrious Claude.safetensors', 'librarianx_v2.safetensors'])}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:C(['minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', 'AFK_minimax_h3_style.safetensors', 'librarianx_v2.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors', 'DasiwaMinimaxH3_dasiwaHybridV2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'z_image_turbo_bf16.safetensors']), weight_dtype:C(['default'])}}},
  MiniMaxH3ImageToVideo:{input:{required:{}}}, MiniMaxH3AddGuide:{input:{required:{}}}, CLIPTextEncode:{input:{required:{}}}, ConditioningSetArea:{input:{required:{}}}, ConditioningCombine:{input:{required:{}}},
  ImageScale:{input:{required:{}}}, VAEEncode:{input:{required:{}}}, VAEDecode:{input:{required:{}}}, EmptyLatentImage:{input:{required:{}}}, SolidMask:{input:{required:{}}}, MaskComposite:{input:{required:{}}}, FeatherMask:{input:{required:{}}}, SetLatentNoiseMask:{input:{required:{}}}, ImageBlend:{input:{required:{}}}, ImageToMask:{input:{required:{}}}, ThresholdMask:{input:{required:{}}}, GrowMask:{input:{required:{}}}, ImageCompositeMasked:{input:{required:{}}},
  ImageBatch:{input:{required:{}}}, MaskToImage:{input:{required:{}}}, DWPreprocessor:{input:{required:{}}}, AnimeLineArtPreprocessor:{input:{required:{}}}, ImageScaleBy:{input:{required:{}}}, DepthAnythingV2Preprocessor:{input:{required:{ckpt_name:C(['depth_anything_v2_vitl.pth'])}}}, ControlNetLoader:{input:{required:{control_net_name:C(['diffusion_pytorch_model_promax.safetensors'])}}}, SetUnionControlNetType:{input:{required:{}}}, ControlNetApplyAdvanced:{input:{required:{}}},
  LoadBackgroundRemovalModel:{input:{required:{bg_removal_name:C(['BiRefNet-general.safetensors'])}}}, RemoveBackground:{input:{required:{}}},
  Canny:{input:{required:{}}}, JoinImageWithAlpha:{input:{required:{}}}, InvertMask:{input:{required:{}}}, VAEEncodeForInpaint:{input:{required:{}}}, GrowMask:{input:{required:{}}},
  CLIPLoader:{input:{required:{clip_name:C(['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 'qwen_3_4b.safetensors']), type:C(['stable_diffusion','minimax','lumina2'])}}}, ModelSamplingAuraFlow:{input:{required:{}}}, EmptySD3LatentImage:{input:{required:{}}}, ConditioningZeroOut:{input:{required:{}}},
  VAELoader:{input:{required:{vae_name:C(['minimax_h3_video_vae_fp16.safetensors', 'ae.safetensors'])}}},
  MiniMaxH3ReferenceToVideo:{input:{required:{}}}, SaveVideo:{input:{required:{}}}, SaveImage:{input:{required:{}}}, CreateVideo:{input:{required:{}}}, ModelPatchLoader:{input:{required:{name:C(['minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors'])}}}, MiniMaxH3FunControlNetApply:{input:{required:{}}}, LoadVideo:{input:{required:{}}}, GetVideoComponents:{input:{required:{}}}, ImageFromBatch:{input:{required:{}}}, LoadImage:{input:{required:{}}}});
// a one-triangle .glb (positions and vertex colours), as DA3GeometryToMesh would save
const GLBF = (() => { const pos = new Float32Array([-0.5, -0.5, 2, 0.5, -0.5, 2, 0, 0.6, 2.3]), col = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(col.buffer)]);
  const json = {asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}], meshes:[{primitives:[{attributes:{POSITION:0, COLOR_0:1}}]}], buffers:[{byteLength:bin.length}],
    bufferViews:[{buffer:0, byteOffset:0, byteLength:36}, {buffer:0, byteOffset:36, byteLength:36}], accessors:[{bufferView:0, componentType:5126, count:3, type:'VEC3', min:[-0.5, -0.5, 2], max:[0.5, 0.6, 2.3]}, {bufferView:1, componentType:5126, count:3, type:'VEC3'}]};
  let js = Buffer.from(JSON.stringify(json)); while(js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const h = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8); h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4); return Buffer.concat([h, jh, js, bh, bin]); })();
const SCRIPT = 'page 1:  Panel 1: character 1 walks down a street. Panel 2: she looks behind her and keeps walking. Panel 3: a man starts walking behind her. Panel 4: He\\ eventually catches up to her and grabs her arm. Panel 5: she screams';
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  // the hidden-for-now panel buttons (Jordan 2026-10-30: Scene, ⤢ full screen, 🎞 animate, ✂, ⧉) still work underneath: pressed from here
  const act = a => page.evaluate(a => { const b = document.createElement('button'); b.dataset.cm = a; b.hidden = true; document.querySelector('#comic').appendChild(b); b.click(); b.remove(); }, a);
  const pickSc = v => page.evaluate(v => { const el = document.createElement('select'); el.dataset.cmsc = ''; el.hidden = true; el.innerHTML = `<option value="${v}" selected></option>`; document.querySelector('#comic').appendChild(el); el.dispatchEvent(new Event('change', {bubbles:true})); el.remove(); }, v);
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message+' '+(e.stack||'').split('\n').slice(0,4).join(' / '))); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => { const f = path.join(__dirname, '..', '..', new URL(r.request().url()).pathname.slice(1)); r.fulfill({ contentType:'text/plain', body:fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' }); }); // the real tag lists (the character looks are read into tags)
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  // the pose rig page for 🦴 panels, three.js from RIG_DEPS (unpacked npm packs) when set
  const RIG_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'rig', 'index.html'), 'utf8'), DEPS = process.env.RIG_DEPS || '';
  const VIEW_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'rig', 'view.html'), 'utf8');
  await page.route('https://app.test/rig/**', r => r.fulfill({ contentType:'text/html', body:/\/rig\/view\.html/.test(r.request().url()) ? VIEW_HTML : RIG_HTML.replace('async function poseFromPicture(url, pc){', 'async function poseFromPicture(url, pc){ if(parent.TEST_POSE){ parent.TEST_POSE.push(url); return {partial:false}; }').replace('async function poseFromOrbit(urls, angles, pc, onStep){', 'async function poseFromOrbit(urls, angles, pc, onStep){ if(parent.TEST_POSE){ parent.TEST_POSE.push({orbit:urls.length, a1:angles[1]}); lastRead = null; return {used:urls.length, n:urls.length, partial:false}; }')}));
  if(DEPS) await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => { const f = path.join(DEPS, 'three-0.160.0', 'package', new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.160\.0\//, ''));
    r.fulfill(fs.existsSync(f) ? { contentType:'text/javascript', body:fs.readFileSync(f) } : { status:404, body:'' }); });
  const PCS = {}, ALL = [];
  for(const [name, host] of [['Render', 'https://jordo-desktop.test'], ['Main', 'https://jordo-main.test']]){
    const pc = PCS[name] = {url:host, sent:[], ups:[], polls:{}, outs:[]};
    await page.route(host + '/**', async r => {
      const u = new URL(r.request().url()), cors = {'Access-Control-Allow-Origin':'*'};
      if(u.pathname==='/object_info') return r.fulfill({ json:OI() });
      if(u.pathname==='/view' && /\.webm$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'video/webm', body:VID, headers:cors });
      if(u.pathname==='/view' && /\.glb$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'model/gltf-binary', body:GLBF, headers:cors });
      if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG, headers:cors });
      if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
      if(u.pathname==='/upload/image'){ const body = r.request().postData() || ''; const out = /name="type"\r\n\r\noutput/.test(body);
        if(out){ pc.outs.push(body.match(/name="subfolder"\r\n\r\n([^\r]*)/)[1]); return r.fulfill({ json:{name:'page_' + pc.outs.length + '.png', subfolder:pc.outs[pc.outs.length - 1], type:'output'} }); }
        pc.ups.push(1); return r.fulfill({ json:{name:name[0] + 'up_' + pc.ups.length + '.png', subfolder:'', type:'input'} }); }
      if(u.pathname==='/prompt'){ const jj = JSON.parse(r.request().postData()); ALL.push(jj); pc.sent.push(jj); return r.fulfill({ json:{prompt_id:name[0] + pc.sent.length, number:0, node_errors:{}} }); }
      if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = pc.sent[+id.slice(1) - 1].prompt, ks = Object.keys(g);
        if((pc.polls[id] = (pc.polls[id] || 0) + 1) < 2) return r.fulfill({ json:{[id]:{status:{completed:false}}} });
        const glbs = ks.filter(k => g[k].class_type==='SaveGLB');
        if(glbs.length) return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:Object.fromEntries(glbs.map(k => { const pre = g[k].inputs.filename_prefix, c = pre.lastIndexOf('/'); return [k, {'3d':[{filename:pre.slice(c + 1) + '_00001_.glb', subfolder:pre.slice(0, c), type:'output'}]}]; }))}} });
        const imgs = ks.filter(k => g[k].class_type==='SaveImage');
        if(!ks.some(k => g[k].class_type==='SaveVideo') && imgs.length >= 2) return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:Object.fromEntries(imgs.map(k => { const pre = g[k].inputs.filename_prefix, c = pre.lastIndexOf('/');
          return [k, {images:[{filename:pre.slice(c + 1) + '_' + id + '_.png', subfolder:pre.slice(0, c), type:'output'}]}]; }))}} }); // many pictures in one job (the 16 views' depth)
        const vid = ks.find(k => g[k].class_type==='SaveVideo'), img = ks.find(k => g[k].class_type==='SaveImage'), sv = vid || img, pre = g[sv].inputs.filename_prefix, cut = pre.lastIndexOf('/');
        const f = {filename:pre.slice(cut + 1) + '_' + id + '_.' + (vid ? 'webm' : 'png'), subfolder:pre.slice(0, cut), type:'output'};
        const four = !vid && g[sv].inputs.images && g[g[sv].inputs.images[0]].class_type==='ImageBatch'; // the 3D look's layers come back as a batch of 4
        let nb = 1; for(let q = four ? g[sv].inputs.images[0] : null; q && g[q].class_type==='ImageBatch'; q = g[q].inputs.image1[0]) nb++; // a chain of ImageBatch: that many pictures (4 for the 3D look, 8 for a pose's turn)
        const fs = four ? Array.from({length:nb===2 ? 2 : Math.max(nb, 4)}, (_, n) => n + 1).map(n => Object.assign({}, f, {filename:f.filename.replace('.png', n + '.png')})) : [f];
        return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:{[sv]:{images:fs}}}} }); }
      if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{jobs:[], token:false} });
      if(u.pathname.startsWith('/renderdeck/')) return r.fulfill({ status:404, body:'' });
      r.fulfill({ status:404, body:'' });
    });
  }
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  for(const pc of [PCS.Main, PCS.Render]){ await page.click('#openSettings'); await page.fill('#server', pc.url); await page.evaluate(() => document.querySelector('#connectBtn').click());
    await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on')); }
  await page.waitForFunction(() => S.servers.length===2 && allPcs().every(p => p.online && p.oi), null, {timeout:10000});
  await page.evaluate(srv => { closeSheets(); const u = f => srv + '/view?filename=' + f + '&subfolder=RenderDeck&type=output';
    S.loraWords['librarianx_v2.safetensors'] = 'librarianx'; S.chars = [{id:'lib', name:'Librarian', trigger:'librarianx', tags:'1girl, long skirt', views:[{id:'v1', angle:'ref', img:'lib.png', url:u('lib_00001_.png'), home:srv}]}];
    S.gallery = [{url:u('street_00001_.png'), seed:1, prompt:'', t:Date.now()}]; save(); drawStrip(); show(0); }, PCS.Render.url);

  // the reader on its own
  const rd = await page.evaluate(s => { const pages = cmSplit(s), {cast, who} = cmCast(pages.flat(), []);
    return {pages, cast:cast.map(c => [c.label, c.g]), who:who.map(w => w.map(id => cast.find(c => c.id===id).label)), place:cmPlace(pages.flat()), lays:cmLayouts(pages[0]).length}; }, SCRIPT);
  ok(rd.pages.length===1 && rd.pages[0].length===5 && rd.pages[0][0]==='character 1 walks down a street.' && rd.pages[0][4]==='she screams', 'Jordan\'s script reads as 1 page of 5 panels: ' + JSON.stringify(rd.pages));
  ok(JSON.stringify(rd.cast)==='[["Character 1","f"],["The man","m"]]', 'the cast: Character 1 (she, from the pronouns) and the man (he): ' + JSON.stringify(rd.cast));
  ok(JSON.stringify(rd.who)==='[["Character 1"],["Character 1"],["The man","Character 1"],["The man","Character 1"],["Character 1"]]', 'who is in each panel, pronouns included: ' + JSON.stringify(rd.who));
  ok(rd.place==='a street' && rd.lays >= 3, 'the place is "a street" and there are layouts to pick from (' + rd.lays + ')');
  ok(await page.evaluate(() => cmSplit('A girl reads. A cat jumps on the desk.\n\nShe laughs.\nShe falls over.')[0].join('|')==='A girl reads. A cat jumps on the desk.|She laughs. She falls over.' && cmSplit('A girl reads. She smiles.\nA cat jumps.')[0].length===2 && cmSplit('Page 1: Panel 1: a. Panel 2: b. Page 2: Panel 1: c.').map(p => p.length).join()==='2,1' && cmSplit('Page 1\nA girl reads.\n\nShe laughs.\nPage 2\nA cat jumps.').map(p => p.length).join()==='2,1'), 'no Panel markers: one panel a paragraph (never a sentence); Page 2 starts a new page');
  ok(await page.evaluate(() => { const c = cmCast(['Librarian opens a book.', 'She smiles.'], []); return c.cast.length===1 && c.cast[0].cid==='lib' && c.who[1][0]===c.cast[0].id; }), 'a character card\'s name is that card, and "she" is her');

  // the tab
  ok(await page.$eval('#comic', e => e.hidden) && await page.isVisible('#tabs [data-tab="comic"]'), 'Comic has its own tab at the top');
  await page.click('#tabs [data-tab="comic"]');
  ok(await page.isVisible('#comic') && !(await page.isVisible('#mainView')) && !(await page.isVisible('.go')), 'the Comic tab replaces the recipe screen and the Render bar');
  await page.fill('#cmScript', SCRIPT); await page.dispatchEvent('#cmScript', 'input');
  await page.click('#comic [data-cm="read"]');
  ok(await page.$$eval('#cmPage .cpanel', e => e.length)===5 && /That's 5 panels in 1 page/.test(await page.textContent('#comic')), '5 panels on the page canvas: "That\'s 5 panels in 1 page"');
  const rects = await page.evaluate(() => cmRectsOf(cmPage()));
  ok(rects.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.5001) && rects.every((a, i) => rects.every((b, j) => i===j || a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6)), 'the panels fit the page and don\'t overlap');
  const lays = await page.$$('#comic .cmlay'); ok(lays.length >= 3 && await page.$('#comic .cmlay.on'), 'little layout pages to pick from: ' + lays.length);
  await lays[1].click(); ok(await page.evaluate(() => cmPage().rows.join()===cmPage().lays[1].join()), 'tapping another layout uses it');
  await page.click('#comic [data-cmlay="0"]');
  // the old painting controls are gone: the 3D scene does the painting now
  ok(!(await page.$('#comic [data-cmfold="look"], #comic [data-cmfold="lib"], #comic [data-cmfold="poses"], #comic [data-cm="stills"], #comic [data-cm="still1"], #comic [data-cmshot]')), 'no Comic look, Characters, Poses, Shot or Paint the stills');
  ok(!(await page.$('#comic [data-cmsc], #comic [data-cm="p3d"], #comic [data-cm="anim1"], #comic [data-cm="cut"], #comic [data-cm="pdup"], #comic [data-cm="make3d"]')) && await page.$('#comic .cmed textarea'), 'the panel card is slim (Jordan 2026-10-30): its words; no Scene, ⤢ full screen, 🎞, ✂, ⧉, and no 3D button before there is a picture');
  // panel 1: a new scene
  await pickSc('+');
  const sc1 = await page.evaluate(() => cmPage().panels[0].sc);
  ok(sc1 && await page.evaluate(() => cmPage().panels[0].scName==='Scene 1'), '＋ New scene: panel 1 gets Scene 1');
  // panel 2 opens in 3D with no scene: it takes the panel before's
  await page.click('#cmPage [data-cpi="1"]'); await act('p3d'); await page.waitForTimeout(200);
  const f = await page.evaluate(() => { const fr = document.querySelector('#scn iframe'); return {src:fr && fr.getAttribute('src'), tab:S.tab, lit:document.querySelector('#tabs [data-tab="comic"]').classList.contains('on'), back:!document.querySelector('#libBack').hidden && document.querySelector('#libBackB').textContent, sc:cmPage().panels[1].sc, pid:cmPage().panels[1].id, r:cmRectsOf(cmPage())[1]}; });
  const q = new URLSearchParams((f.src || '').split('?')[1] || '');
  ok(f.sc===sc1 && /^rig\/scene\.html\?/.test(f.src) && q.get('open')===sc1 && q.get('panel')===f.pid && Math.abs(+q.get('ar') - f.r.w / f.r.h) < 0.01 && /looks behind her/.test(q.get('pdesc')) && q.get('plabel')==='Panel 2', 'panel 2 opens the 3D page in Scene 1, as itself, in its own shape, with its words: ' + f.src);
  ok(f.tab==='scene' && f.lit && f.back==='← Comic page' && !(await page.isVisible('#comic')), 'the 3D page fills the screen, Comic stays lit, with ← Comic page');
  // a render made in the 3D page comes back as the panel's picture
  await page.evaluate(([sc, pid, pc]) => localStorage.setItem('rd-scenes', JSON.stringify([{id:sc, name:'Scene 1', objs:[], saved:Date.now(), panels:{[pid]:{cam:{az:0}, scene:{pc, file:'scene_00001_.png', sub:'RenderDeck/scene', at:Date.now()}}}}])), [sc1, f.pid, PCS.Render.url]);
  await page.click('#libBackB'); await page.waitForTimeout(200);
  ok(await page.isVisible('#comic') && await page.evaluate(() => { const p = cmPage().panels[1]; return /scene_00001_\.png/.test(cmStill(p).url) && cmShown(p).still; }), '← Comic page: panel 2 shows its 3D render');
  ok(!(await page.$('#comic [data-cm="anim1"], #comic [data-cm="pdup"]')) && /Remove the background/.test(await page.textContent('#comic [data-cm="cut"]')) && /Show it in 3D/.test(await page.textContent('#comic [data-cm="make3d"]')) && /Render as/.test(await page.textContent('#comic [data-cm="rend3d"]')), 'a panel with a picture: 🧊 Show it in 3D, She is + 🎨 Render as, ✂ Remove the background (Jordan 2026-10-31); no 🎞 Animate or ⧉');
  // 🎨 Render as her over the picture (not 3D yet): the 🖼 The picture recipe, 2 tries in the panel's shape, the new one shown
  { await page.evaluate(srv => { CCV.lib = {pc:srv, list:[{name:'Ellen', trigger:'ellenx', lora:'librarianx_v2.safetensors', ckpt:'iriselTouchIL_v10.safetensors', style:'AFKJ Style Illustrious Claude.safetensors', tags:'1girl, red hair, long skirt', subfolder:'Character Library/Ellen'}], objs:[], at:Date.now() + 1e9}; drawComic(); }, PCS.Render.url); await page.selectOption('#comic [data-cmwho]', {index:1}); await page.waitForTimeout(100); const nR = ALL.length, s0 = await page.evaluate(() => (cmPage().panels[1].stills || []).length);
    await page.click('#comic [data-cm="rend3d"]'); for(let i = 0; i < 150 && ALL.length <= nR; i++) await page.waitForTimeout(100);
    const g = ALL[nR] && ALL[nR].prompt, n = g ? Object.values(g) : [], cn = n.filter(x => x.class_type==='SetUnionControlNetType').map(x => x.inputs.type), ks = n.find(x => x.class_type==='KSampler'), lo = n.filter(x => x.class_type==='LoraLoader').map(x => x.inputs.lora_name);
    ok(g && n.some(x => x.class_type==='DWPreprocessor') && n.some(x => x.class_type==='DepthAnythingV2Preprocessor') && n.some(x => x.class_type==='RemoveBackground') && cn.join()==='openpose,depth,canny/lineart/anime_lineart/mlsd' && ks.inputs.denoise===1 && n.find(x => x.class_type==='EmptyLatentImage').inputs.batch_size===2 && lo.length >= 1 && check(g).length===0,
      '🎨 Render as her over a picture: DWPose + depth + her outlines (ControlNet), her LoRA, 2 tries: ' + JSON.stringify({cn, lo, err:g && check(g)}));
    await page.waitForFunction(s0 => (cmPage().panels[1].stills || []).length > s0, s0, {timeout:20000}).catch(() => {});
    ok(await page.evaluate(s0 => { const p = cmPage().panels[1]; return p.stills.length > s0 && p.still===0; }, s0), 'its tries join the panel\'s pictures, the newest shown'); }
  // 🎞 Animate the picture
  const nA = ALL.length; await act('anim1');
  for(let i = 0; i < 150 && ALL.length <= nA; i++) await page.waitForTimeout(100);
  { const g = ALL[nA].prompt, n = Object.values(g); ok(n.some(x => x.class_type==='MiniMaxH3ImageToVideo') && check(g).length===0, '🎞 Animate this picture: MiniMax from the render as the first frame, a valid graph: ' + check(g).join('; ')); }
  await page.waitForFunction(() => cmPage().panels[1].takes.length, null, {timeout:20000});
  ok(await page.$('#comic .cmscrub') && await page.$('#comic [data-cm="frame"]'), 'its clip scrubs at the bottom, 📸 Use this frame');
  // ⧉ duplicate: same scene, starts as panel 2 in 3D
  await act('pdup');
  { const d = await page.evaluate(() => { const ps = cmPage().panels; return {n:ps.length, sc:ps[2].sc, from:ps[2].from, src:ps[1].id, stills:(ps[2].stills || []).length}; });
    ok(d.n===6 && d.sc===sc1 && d.from===d.src && !d.stills, '⧉ Duplicate: panel 3 in Scene 1, coming from panel 2, with no picture yet: ' + JSON.stringify(d));
    await act('p3d'); await page.waitForTimeout(200);
    const asked = await page.evaluate(() => { const fr = document.querySelector('#scn iframe'); return fr.getAttribute('src'); });
    ok(/pfrom=/.test(asked) || await page.evaluate(() => !cmPage().panels[2].from), 'its first open tells the 3D page to start from panel 2'); await page.click('#libBackB'); }
  // a panel picks another scene
  await page.click('#cmPage [data-cpi="4"]'); await pickSc('+');
  ok(await page.evaluate(() => cmPage().panels[4].scName==='Scene 2' && cmPage().panels[4].sc!==cmPage().panels[0].sc), 'panel 5 in a new Scene 2');
  ok(!(await page.isVisible('#tabs [data-tab="scene"]')), 'no Scene tab any more');
  await page.click('#comic [data-cmborder="black"]');
  ok(await page.$eval('#cmPage', e => e.classList.contains('dark') && getComputedStyle(e).backgroundColor==='rgb(0, 0, 0)'), '⬛ Black borders turn the page black');
  await page.click('#comic [data-cmborder="white"]');
  // save the page
  { const n0 = await page.evaluate(() => S.gallery.length);
    await page.click('#comic [data-cm="export"]');
    await page.waitForFunction(n => S.gallery.length===n + 1, n0, {timeout:15000});
    ok([...PCS.Render.outs, ...PCS.Main.outs].includes('RenderDeck/comics/pages') && await page.evaluate(() => /page_1\.png/.test(S.gallery[0].url)), 'the page is saved into RenderDeck/comics/pages and put at the front of the strip'); }
  // ✍ the words: names become trigger words with her LoRA on; pieces that can be tags are highlighted and swap in on a tap
  await page.evaluate(srv => { CCV.lib = {pc:srv, list:[{name:'Ellen', trigger:'ellenx', lora:'librarianx_v2.safetensors', ckpt:'iriselTouchIL_v10.safetensors', style:'AFKJ Style Illustrious Claude.safetensors', tags:'1girl, red hair, long skirt', subfolder:'Character Library/Ellen'}], objs:[], at:Date.now() + 1e9}; }, PCS.Render.url);
  await page.click('#cmPage [data-cpi="0"]'); await page.fill('#comic [data-cmp="text"]', 'Ellen walks down the street'); await page.dispatchEvent('#comic [data-cmp="text"]', 'change'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => cmSrc(cmPage().panels[0])==='ellenx walks down the street' && cmChars(cmPage().panels[0]).map(e => e.name).join()==='Ellen'), 'typing "Ellen" puts her trigger word in, and her LoRA is on for the panel');
  { const hl = await page.$$eval('#comic .cmed .cmhl', b => b.map(x => x.textContent + ':' + x.className)); ok(hl.length===1 && /^ellenx:.*\bch\b/.test(hl[0]), 'only her trigger word is marked: no tag guessing in Comic (Jordan 2026-10-30): ' + hl.join(' | ')); }
  await page.click('#comic .cmed .cmhl.ch'); ok(/Her LoRA is on/.test(await page.textContent('#comic .cmed .cmsug')), 'tapping her name says her LoRA is on here');
  await page.click('#comic .cmed [data-cmlora]'); ok(await page.evaluate(() => !cmChars(cmPage().panels[0]).length && (cmPage().panels[0].loraOff || []).length===1), 'and can turn it off for this panel');
  await page.waitForTimeout(700); if(!(await page.$('#comic .cmed [data-cmlora]'))) await page.click('#comic .cmed .cmhl.ch'); await page.click('#comic .cmed [data-cmlora]'); ok(await page.evaluate(() => cmChars(cmPage().panels[0]).length===1), 'and on again');
  await page.click('#cmPage [data-cpi="1"]'); await page.fill('#comic [data-cmp="text"]', 'A girl reads a book'); await page.dispatchEvent('#comic [data-cmp="text"]', 'change'); await page.waitForTimeout(200);
  ok(!(await page.$('#comic .cmed .cmhl')), 'words with no character in them have nothing marked');
  // 🎲 the layout phase: N tries for the ticked panels, spread over both PCs
  await page.click('#comic [data-cm="tryless"]'); for(let k = 0; k < 6; k++) await page.click('#comic [data-cm="tryless"]');
  ok(await page.evaluate(() => CM().tryN===3) && /Make 3 tries for every panel/.test(await page.textContent('#comic [data-cm="tries"]')), 'the number of tries can be set (3 here)');
  for(const j of [2, 3, 4, 5]) await page.click(`#comic [data-cmgen="${j}"]`);
  ok(/Make 3 tries for 2 panels/.test(await page.textContent('#comic [data-cm="tries"]')), 'panels can be left out (only 1 and 2 here)');
  ok(await page.evaluate(() => cmDraftWith(CM())==='zit') && /Z-Image/.test(await page.textContent('#comic [data-cmdraft="zit"]')), 'drafts are made with ⚡ Z-Image Turbo unless you pick Illustrious');
  await page.click('#comic [data-cmdraft="ill"]');
  { const n0 = ALL.length; await page.click('#comic [data-cm="tries"]');
    await page.waitForFunction(() => [0, 1].every(i => (cmPage().panels[i].stills || []).filter(s => s.try).length >= 2 && !cmBusy(cmPage().panels[i])), null, {timeout:30000});
    const G = ALL.slice(n0).map(x => x.prompt), n = g => Object.values(g); ok(G.length===4 && G.every(g => check(g).length===0), '2 panels × 2 jobs (2 + 1 tries), every graph valid: ' + G.length + ' ' + G.map(g => check(g).join(';')).join(' | '));
    const g1 = G.find(g => n(g).some(x => x.class_type==='CLIPTextEncode' && /ellenx/.test(x.inputs.text)));
    ok(g1 && n(g1).some(x => x.class_type==='LoraLoader' && x.inputs.lora_name==='librarianx_v2.safetensors') && n(g1).find(x => x.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='iriselTouchIL_v10.safetensors' && /red hair/.test(n(g1).find(x => x.class_type==='CLIPTextEncode').inputs.text), "panel 1's tries: her checkpoint, her LoRA, her trigger word and looks");
    const r0 = await page.evaluate(() => cmRectsOf(cmPage())[0]), lat = n(g1).find(x => x.class_type==='EmptyLatentImage').inputs; ok(Math.abs(Math.log(lat.width / lat.height) - Math.log(Math.max(1 / 3, Math.min(3, r0.w / r0.h)))) < 0.1 && lat.width % 64===0, 'shaped like its panel: ' + lat.width + '×' + lat.height);
    ok(new Set(ALL.slice(n0).map(x => x.client_id + (PCS.Render.sent.includes(x) ? 'R' : 'M'))).size===2, 'spread over both computers'); }
  // ⚡ with Z-Image Turbo (Jordan 2026-10-30): the sentence as written, her name as her looks (no LoRA), 8 steps at cfg 1, in the panel's shape
  await page.click('#comic [data-cmdraft="zit"]'); await page.click('#comic [data-cmgen="1"]');
  { const n0 = ALL.length; await page.click('#comic [data-cm="tries"]'); for(let w = 0; w < 100 && ALL.length < n0 + 2; w++) await page.waitForTimeout(200); await page.waitForFunction(() => !cmBusy(cmPage().panels[0]), null, {timeout:30000});
    const G = ALL.slice(n0).map(x => Object.values(x.prompt)), z = G[0], tx = (z.find(x => x.class_type==='CLIPTextEncode') || {inputs:{}}).inputs.text || '', ks = z.find(x => x.class_type==='KSampler').inputs;
    ok(G.length===2 && G.every(g => check(Object.fromEntries(g.map((x, j) => [String(j + 1), x]))).length===0) && z.find(x => x.class_type==='UNETLoader').inputs.unet_name==='z_image_turbo_bf16.safetensors' && !z.some(x => x.class_type==='LoraLoader') && ks.steps===8 && ks.cfg===1 && /walks down the street/.test(tx) && /a girl \(red hair, long skirt\)/.test(tx) && !/ellenx/.test(tx) && !/Anime/i.test(tx),
      '⚡ Z-Image Turbo tries: her words as written, her looks for her name, no LoRA: ' + tx); }
  // a Z-Image finetune that is an all-in-one checkpoint (TOT Z-Image Turbo): picked in "Z-Image model", it brings its own text encoder and VAE
  ok((await page.$$eval('#comic [data-cmzit] option', o => o.map(x => x.textContent))).join()==='z_image_turbo_bf16,totZImageturbo', 'the Z-Image models on the PCs can be picked');
  await page.selectOption('#comic [data-cmzit]', 'totZImageturbo.safetensors'); await page.waitForTimeout(100);
  { const n0 = ALL.length; await page.click('#comic [data-cm="tries"]'); for(let w = 0; w < 100 && ALL.length < n0 + 2; w++) await page.waitForTimeout(200); await page.waitForFunction(() => !cmBusy(cmPage().panels[0]), null, {timeout:30000});
    const z = Object.values(ALL[n0].prompt); ok(z.find(x => x.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='totZImageturbo.safetensors' && !z.some(x => /UNETLoader|VAELoader/.test(x.class_type)) && z.find(x => x.class_type==='CLIPTextEncode').inputs.clip[0]===Object.keys(ALL[n0].prompt).find(k => ALL[n0].prompt[k].class_type==='CLIPLoader') && z.some(x => x.class_type==='ModelSamplingAuraFlow') && check(ALL[n0].prompt).length===0, 'TOT Z-Image Turbo drafts load from its own checkpoint (model + VAE), with Qwen loaded on its own (TOT has no text encoder): ' + check(ALL[n0].prompt).join(';')); }
  await page.evaluate(() => { delete CM().zitModel; });
  await page.click('#comic [data-cmgen="1"]'); await page.click('#comic [data-cmdraft="ill"]');
  await page.click('#cmPage [data-cpi="0"]'); const s0 = await page.evaluate(() => cmPage().panels[0].still || 0);
  await page.click('#cmPage [data-cpi="0"]'); ok(await page.evaluate(s0 => (cmPage().panels[0].still || 0)===s0 + 1, s0) && /2\//.test(await page.textContent('#cmPage [data-cpi="0"] .cpnav')), 'tapping the picked panel shows its next try, on the page');
  await page.click('#cmPage [data-cpi="0"] [data-cmcyc="-1"]'); ok(await page.evaluate(s0 => (cmPage().panels[0].still || 0)===s0, s0), '‹ goes back');
  // ✋ the picture moves anywhere in its panel and pinches bigger or smaller; ✂ takes its background out
  { const box = await page.$eval('#cmPage [data-cpi="0"]', e => { const b = e.getBoundingClientRect(); return {x:b.x, y:b.y, w:b.width, h:b.height}; }), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const st0 = await page.evaluate(() => cmPage().panels[0].still);
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + box.w * 0.4, cy + 10, {steps:5}); await page.mouse.up();
    const f = await page.evaluate(() => cmStill(cmPage().panels[0]).fr);
    ok(f && f.x > 30 && f.s===1 && await page.evaluate(st0 => cmPage().panels[0].still===st0, st0) && /left:\s*9\d/.test(await page.$eval('#cmPage [data-cpi="0"] img.cpimg', e => e.getAttribute('style'))), 'dragging moves the picture past the panel\'s edge (and isn\'t a tap): ' + JSON.stringify(f));
    const cdp = await page.context().newCDPSession(page), tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints:pts.map((q, id) => ({x:q[0], y:q[1], id}))});
    await tp('touchStart', [[cx - 20, cy], [cx + 20, cy]]); for(let k = 1; k <= 5; k++) await tp('touchMove', [[cx - 20 - k * 8, cy], [cx + 20 + k * 8, cy]]); await tp('touchEnd', []);
    const f2 = await page.evaluate(() => cmStill(cmPage().panels[0]).fr); ok(f2 && f2.s > 1.5, 'two fingers apart make it bigger: ' + JSON.stringify(f2));
    const n0 = ALL.length; await act('cut'); await page.waitForFunction(() => cmStill(cmPage().panels[0]).cut || cmPage().panels[0].err, null, {timeout:20000});
    const g = ALL[n0].prompt, ns = Object.values(g); ok(ns.some(x => x.class_type==='RemoveBackground') && ns.some(x => x.class_type==='JoinImageWithAlpha') && check(g).length===0, '✂ Just the character: BiRefNet cut-out, a valid graph: ' + check(g).join(';'));
    ok(await page.evaluate(f2 => { const st = cmStill(cmPage().panels[0]); return st.cut && st.fr && Math.abs(st.fr.s - f2.s) < 1e-6 && cmPage().panels[0].still===0; }, f2), 'the cut-out shows framed the same, kept as a picture of its own'); }
  // 🧍 Make it 3D: the panel opens in 3D with its picture (the cut-out's original, its framing and the cut-out for her box)
  { await page.evaluate(srv => { const p = cmPage().panels[0], st = cmStill(p); st.url = srv + '/view?filename=cut_1.png&subfolder=RenderDeck%2Fcomics&type=output'; st.src = srv + '/view?filename=try_1.png&subfolder=RenderDeck%2Fcomics&type=output'; delete st.test; window.__asks = []; const was = scnOpen; window.scnOpen = (t, w) => { __asks.push(w); return was(t, w); }; }, PCS.Render.url);
    await page.evaluate(() => drawComic()); await page.click('#comic [data-cm="make3d"]'); await page.waitForTimeout(200);
    // it is made out of sight (Jordan 2026-10-30): the comic page stays up, the 3D page works in a hidden frame
    const src = await page.evaluate(() => { const f = document.querySelector('#scnbg iframe'); const s = f && f.getAttribute('src'); if(f) f.remove(); return s; }), q = new URLSearchParams((src || '').split('?')[1] || ''), ph = JSON.parse(q.get('photo') || 'null');
    ok(ph && ph.file==='try_1.png' && ph.sub==='RenderDeck/comics' && /cut_1\.png/.test(ph.cut) && ph.fr && ph.fr.s > 1.5 && ph.w > 0 && q.get('bg')==='1', '🧍 Make it 3D sends the picture SAM should read, its framing and the cut-out: ' + JSON.stringify(ph));
    ok(await page.isVisible('#comic') && await page.isHidden('#scn') && !(await page.evaluate(() => __asks.length)), 'the comic page stays up while it is made');
    const pid = await page.evaluate(() => cmPage().panels[0].id);
    await page.evaluate(pid => postMessage({rd3d:{pid, msg:'SAM 3D Body is reading the pose… 4 s'}}, location.origin), pid); await page.waitForTimeout(100);
    ok(/reading the pose/.test(await page.$eval('#cmPage [data-cpi="0"]', e => e.textContent)), 'the panel shows how it is going: ' + await page.$eval('#cmPage [data-cpi="0"]', e => e.textContent.trim()));
    await page.evaluate(pid => postMessage({rd3d:{pid, done:true}}, location.origin), pid); await page.waitForTimeout(300);
    // then the panel is a window into its 3D scene (Jordan 2026-10-30), showing the scene itself
    const win = await page.evaluate(pid => { const f = document.querySelector(`#cmwins iframe[data-pid="${pid}"]`), el = document.querySelector('#cmPage [data-cpi="0"]'); if(!f || !el) return null; const a = f.getBoundingClientRect(), b = el.getBoundingClientRect();
      return {src:f.getAttribute('src'), dx:Math.abs(a.left - b.left - el.clientLeft), dy:Math.abs(a.top - b.top - el.clientTop), w:Math.abs(a.width - el.clientWidth), pe:f.style.pointerEvents, is3d:cmPage().panels[0].is3d}; }, pid);
    ok(win && win.is3d && /win=1/.test(win.src) && /panel=/.test(win.src) && !/photo=/.test(win.src) && win.dx < 1.5 && win.dy < 1.5 && win.w < 1.5 && win.pe==='auto' && await page.isVisible('#comic'), '🧊 the 3D panel is a live window laid exactly over it on the page: ' + JSON.stringify(win));
    // behind her: the scene's own background and grid floor (Jordan 2026-10-30: preferred to the picture with her painted out), so nothing is painted for it
    ok(!ALL.some(a => Object.values(a.prompt).some(x => x.class_type==='VAEEncodeForInpaint')) && !(await page.$('#cmPage [data-cpi="0"] img.cpimg')), 'no background is painted and no picture sits under the window');
    // who the rig is: a library character
    const names = await page.$$eval('#comic [data-cmwho] option', o => o.map(x => x.textContent)); ok(names.length > 1 && names[0].includes('Mannequin'), 'she can be the mannequin or a library character: ' + names.join(', '));
    await page.selectOption('#comic [data-cmwho]', {index:1}); await page.waitForTimeout(200);
    const src2 = await page.evaluate(pid => document.querySelector(`#cmwins iframe[data-pid="${pid}"]`).getAttribute('src'), pid);
    ok(/[?&]w3=/.test(src2) && await page.evaluate(() => !!cmPage().panels[0].who3d), 'picking her opens the window again with that character as the rig: ' + src2);
    // 🎨 Render as her: the panel's Render Scene runs in its window, and the painting comes back as the panel's picture
    ok(/Render as/.test(await page.textContent('#comic [data-cm="rend3d"]')), 'there is a 🎨 Render as her button: ' + await page.textContent('#comic [data-cm="rend3d"]'));
    await page.evaluate(pid => { window.__sent = []; const f = document.querySelector(`#cmwins iframe[data-pid="${pid}"]`); f.contentWindow.postMessage = m => __sent.push(m); f.dataset.ready = '1'; }, pid);
    await page.click('#comic [data-cm="rend3d"]'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => __sent.some(m => m.rdrender)), 'it asks the panel\'s 3D window to paint');
    await page.evaluate(([pid, srv]) => { const p = cmPage().panels[0], L = JSON.parse(localStorage.getItem('rd-scenes') || '[]'); let r = L.find(x => x.id===p.sc); if(!r){ r = {id:p.sc, name:'Scene', objs:[], v:1}; L.push(r); }
      r.panels = r.panels || {}; r.panels[pid] = Object.assign({}, r.panels[pid], {scene:{pc:srv, file:'scene_00001_.png', sub:'RenderDeck/scene', at:Date.now()}}); r.saved = Date.now(); localStorage.setItem('rd-scenes', JSON.stringify(L));
      postMessage({rdwin:{pid, msg:'🎬 Painting the scene… 12 s'}}, location.origin); }, [pid, PCS.Render.url]); await page.waitForTimeout(100);
    ok(/Painting the scene/.test(await page.$eval('#cmPage [data-cpi="0"]', e => e.textContent)), 'the panel shows the painting going');
    await page.evaluate(pid => postMessage({rdwin:{pid, rendered:true}}, location.origin), pid); await page.waitForTimeout(150);
    ok(await page.evaluate(() => { const p = cmPage().panels[0], st = cmStill(p); return p.pic2d && st && /scene_00001_/.test(st.url) && !document.querySelector(`#cmwins iframe[data-pid="${p.id}"]`); }), 'when it is painted the panel shows the painting (🧊 Show it in 3D goes back)');
    await page.click('#comic [data-cm="pic2d"]'); await page.waitForTimeout(100);
    // a panel that isn't picked lets taps through, and 🖼 shows the picture again
    await page.evaluate(() => { CM().sel = 1; drawComic(); }); ok(await page.evaluate(pid => document.querySelector(`#cmwins iframe[data-pid="${pid}"]`).style.pointerEvents, pid)==='none', 'another panel picked: the window lets taps and scrolling through');
    await page.evaluate(() => { CM().sel = 0; drawComic(); }); await page.click('#comic [data-cm="pic2d"]'); await page.waitForTimeout(100);
    ok(!(await page.$(`#cmwins iframe[data-pid="${pid}"]`)), '🖼 Show the picture instead takes the window away');
    await page.click('#comic [data-cm="pic2d"]'); await page.waitForTimeout(100);
    await act('p3d'); await page.waitForTimeout(200);
    const w = await page.evaluate(() => __asks[__asks.length - 1]);
    ok(w && w.panel && w.panel.pid===pid && !w.panel.photo && await page.isVisible('#scn'), '🎬 Open in 3D still opens it full screen (without reading the pose again)');
    ok(await page.evaluate(() => document.querySelector('#cmwins').hidden), 'the windows hide while the 3D page is up');
    await page.click('#libBackB'); }
  if(process.env.SHOT) await page.screenshot({path:process.env.SHOT, fullPage:true});
  // the tab is remembered, and a 3D panel reopens on its comic page
  await act('p3d'); await page.waitForTimeout(100);
  await page.reload(); await page.waitForSelector('#cmPage .cpanel');
  ok(await page.isVisible('#comic') && await page.$$eval('#cmPage .cpanel', e => e.length)===6, 'after reopening the app it is on the Comic page');
  // Hidden: its own pages and scenes
  await page.evaluate(() => switchMode());
  ok(await page.isVisible('#comic') && !(await page.$('#cmPage')) && /🙈 Hidden/.test(await page.textContent('#comic')), 'Hidden starts with its own empty comic');
  await page.fill('#cmScript', 'Panel 1: a girl waves. Panel 2: she smiles.'); await page.dispatchEvent('#cmScript', 'input'); await page.click('#comic [data-cm="read"]');
  ok(await page.evaluate(() => !cmScList(CM()).some(c => /Scene 1/.test(c.name))), 'Hidden does not list the normal scenes');
  await act('p3d'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => /h=1/.test(document.querySelector('#scn iframe').getAttribute('src'))), 'Hidden opens its panels in the Hidden 3D page');
  await page.click('#libBackB'); await page.evaluate(() => switchMode());
  ok(await page.evaluate(() => CM().pages[0].panels.length===6), 'back in normal: the page is as it was');
  // 📄 pages and comics
  { const n0 = await page.evaluate(() => CM().pages.length); await page.click('#comic [data-cm="newpage"]');
    ok(await page.evaluate(n => CM().pages.length===n + 1 && !cmPage().panels.length, n0), '➕ New page');
    await page.click('#comic [data-cm="delpage"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(n => CM().pages.length===n && CM().cur===0, n0), '🗑 Remove page'); }
  await page.click('#tabs [data-tab="render"]');
  ok(await page.isVisible('#mainView') && await page.isVisible('.go'), 'the Render tab brings the recipe back');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
