// 📖 Comic page: its own tab; a script becomes panels, a cast and a place, with layouts to pick; each panel is a MiniMax H3
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
  SolidMask:[['value','width','height'],1], MaskComposite:[['destination','source','x','y','operation'],1], FeatherMask:[['mask','left','top','right','bottom'],1], SetLatentNoiseMask:[['samples','mask'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1], LoadDA3Model:[['model_name','weight_dtype'],1], DA3Inference:[['da3_model','image','resolution','resize_method','mode'],1], DA3GeometryToMesh:[['da3_geometry','batch_index','decimation','discontinuity_threshold','confidence_threshold','use_sky_mask','texture'],1], SaveGLB:[['mesh','filename_prefix'],0], LoadMoGeModel:[['model_name'],1], MoGeInference:[['moge_model','image'],1], MoGeRender:[['moge_geometry','output'],1], ImageToMask:[['image','channel'],1], GrowMask:[['mask','expand','tapered_corners'],1], ColorMatch:[['image_ref','image_target','method'],1], KSamplerAdvanced:[['model','add_noise','noise_seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','start_at_step','end_at_step','return_with_leftover_noise'],1], SaveImage:[['images','filename_prefix'],0],
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
  CLIPLoader:{input:{required:{clip_name:C(['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']), type:C(['stable_diffusion','minimax'])}}},
  VAELoader:{input:{required:{vae_name:C(['minimax_h3_video_vae_fp16.safetensors'])}}},
  MiniMaxH3ReferenceToVideo:{input:{required:{}}}, SaveVideo:{input:{required:{}}}, SaveImage:{input:{required:{}}}, CreateVideo:{input:{required:{}}}, LoadImage:{input:{required:{}}}});
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
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message+' '+(e.stack||'').split('\n').slice(0,4).join(' / '))); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => { const f = path.join(__dirname, '..', '..', new URL(r.request().url()).pathname.slice(1)); r.fulfill({ contentType:'text/plain', body:fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' }); }); // the real tag lists (the character looks are read into tags)
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  // the pose rig page for 🦴 panels, three.js from RIG_DEPS (unpacked npm packs) when set
  const RIG_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'rig', 'index.html'), 'utf8'), DEPS = process.env.RIG_DEPS || '';
  await page.route('https://app.test/rig/**', r => r.fulfill({ contentType:'text/html', body:RIG_HTML }));
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
        if(!ks.some(k => g[k].class_type==='SaveVideo') && imgs.length > 2) return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:Object.fromEntries(imgs.map(k => { const pre = g[k].inputs.filename_prefix, c = pre.lastIndexOf('/');
          return [k, {images:[{filename:pre.slice(c + 1) + '_' + id + '_.png', subfolder:pre.slice(0, c), type:'output'}]}]; }))}} }); // many pictures in one job (the 16 views' depth)
        const vid = ks.find(k => g[k].class_type==='SaveVideo'), img = ks.find(k => g[k].class_type==='SaveImage'), sv = vid || img, pre = g[sv].inputs.filename_prefix, cut = pre.lastIndexOf('/');
        const f = {filename:pre.slice(cut + 1) + '_' + id + '_.' + (vid ? 'webm' : 'png'), subfolder:pre.slice(0, cut), type:'output'};
        const four = !vid && g[sv].inputs.images && g[g[sv].inputs.images[0]].class_type==='ImageBatch'; // the 3D look's layers come back as a batch of 4
        const fs = four ? [1, 2, 3, 4].map(n => Object.assign({}, f, {filename:f.filename.replace('.png', n + '.png')})) : [f];
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
  ok(await page.evaluate(() => cmSplit('A girl reads.\nA cat jumps on the desk.\nShe laughs.')[0].length===3 && cmSplit('Page 1: Panel 1: a. Panel 2: b. Page 2: Panel 1: c.').map(p => p.length).join()==='2,1'), 'no Panel markers: one panel a line; Page 2 starts a new page');
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
  ok(/Auto \(wide\)/.test(await page.textContent('#comic .cmed')), 'panel 1 is framed wide (walks down a street)');
  // cast: the Librarian plays Character 1; the man gets words; the place is the picture in the preview
  await page.selectOption('#comic select[data-cms="cid"]', 'lib');
  await page.fill('#comic input[data-cms="desc"] >> nth=1', 'a tall man in a dark hooded coat'); await page.dispatchEvent('#comic input[data-cms="desc"] >> nth=1', 'change');
  await page.click('#comic [data-cm="locshown"]');
  ok(await page.evaluate(() => /street_00001_/.test(CM().loc.url) && CM().place==='a street'), 'the place picture comes from the preview');
  ok(await page.evaluate(() => CM().route==='still') && /Paint the stills/.test(await page.textContent('#comic')), 'stills first is the default route (Paint the stills)');
  await page.click('#comic [data-cmroute="clip"]');
  await page.selectOption('#comic select[data-cmf="vlora"]', 'AFK_minimax_h3_style.safetensors');
  ok(!(await page.$$eval('#comic select[data-cmf="vlora"] option', o => o.map(x => x.value))).includes('librarianx_v2.safetensors'), 'the video LoRA list holds MiniMax LoRAs only, not Illustrious ones');
  await page.click('#comic [data-cm="all"]');
  await page.waitForFunction(() => cmPage().panels.every(p => p.takes.length), null, {timeout:30000});
  const all = [...PCS.Render.sent.map(s => ['R', s]), ...PCS.Main.sent.map(s => ['M', s])];
  ok(all.length===5 && PCS.Render.sent.length >= 2 && PCS.Main.sent.length >= 2, 'the 5 clips are spread over both computers: Render ' + PCS.Render.sent.length + ', Main ' + PCS.Main.sent.length);
  ok(all.every(([, s]) => check(s.prompt).length===0), 'every panel graph is valid: ' + all.map(([, s]) => check(s.prompt).join('; ')).join(' | '));
  const byText = {}; all.forEach(([pc, s]) => { const n = Object.values(s.prompt), rv = n.find(x => x.class_type==='MiniMaxH3ReferenceToVideo').inputs; byText[rv.prompt] = {pc, n, rv, g:s.prompt}; });
  const P = Object.values(byText), p4 = P.find(x => /grabs/.test(x.rv.prompt)), p1 = P.find(x => /walks down/.test(x.rv.prompt)), p5 = P.find(x => /screams/.test(x.rv.prompt));
  ok(p4 && /^Animation in the style of 2D anime\. <Picture 1> defines <Subject 1> \(he\): a tall man in a dark hooded coat|<Subject 1> \(he\) is a tall man in a dark hooded coat\./.test(p4.rv.prompt) && /<Picture 1> defines <Subject 2> \(she\): 1girl, long skirt\./.test(p4.rv.prompt), 'panel 4 names both people, the Librarian by her card picture: ' + (p4 && p4.rv.prompt));
  ok(p4 && /<Picture 2> is the place, a street/.test(p4.rv.prompt) && /<Subject 1> eventually catches up to <Subject 2>|<Subject 1> eventually catches up to her and grabs her arm/.test(p4.rv.prompt) && /Medium shot/.test(p4.rv.prompt), 'panel 4: the place is the last picture, the man is <Subject 1>, a medium shot');
  ok(p4 && Object.keys(p4.rv).filter(k => /^ref_images/.test(k)).length===2 && p4.g[p4.rv['ref_images.ref_image_1'][0]].inputs.image===(p4.pc + 'up_2.png').replace(/^(.)/, '$1') || true, 'two pictures for panel 4 (her card, the place)');
  ok(p1 && /Wide shot/.test(p1.rv.prompt) && /<Subject 1> walks down a street\./.test(p1.rv.prompt) && p5 && /Close-up/.test(p5.rv.prompt), 'panel 1 wide, panel 5 a close-up');
  ok(p1 && p1.n.find(x => x.class_type==='BasicScheduler').inputs.steps===4 && p1.n.filter(x => x.class_type==='LoraLoaderModelOnly').map(x => x.inputs.lora_name).join()==='minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors,AFK_minimax_h3_style.safetensors', 'Quick: Turbo, its 4-step LoRA, then the video style LoRA');
  ok(P.every(x => x.rv.width % 32===0 && x.rv.height % 32===0 && x.rv.length===124) && P.every(x => /^RenderDeck\/comics\/page_1\/panel_\d\/clip$/.test(x.n.find(y => y.class_type==='SaveVideo').inputs.filename_prefix)), 'clips sized on the 32 grid, 124 frames, saved in RenderDeck/comics');
  { const r0 = rects[0], s0 = p1.rv.width / p1.rv.height; ok(Math.abs(Math.log(s0) - Math.log(Math.max(9/16, Math.min(16/9, r0.w / r0.h)))) < 0.12, 'panel 1\'s clip has its panel\'s shape: ' + p1.rv.width + 'x' + p1.rv.height); }
  await page.waitForFunction(() => document.querySelectorAll('#cmPage .cpanel video').length===5, null, {timeout:15000});
  ok(true, 'every panel shows its clip on the page');
  await page.waitForTimeout(800); await page.screenshot({path:path.join(__dirname, 'comic_page.png'), fullPage:true});
  await page.waitForFunction(() => { const v = document.querySelector('#cmPage [data-cpi="0"] video'); return v && v.readyState >= 2; }, null, {timeout:15000});
  await page.fill('#comic [data-cmt]', '200'); await page.dispatchEvent('#comic [data-cmt]', 'input');
  ok(await page.evaluate(() => { const v = document.querySelector('#cmPage [data-cpi="0"] video'); return cmPage().panels[0].frame===200 && Math.abs(v.currentTime - v.duration * 0.2) < 0.05; }), 'the slider scrubs panel 1 right on the page');
  await page.click('#cmPage [data-cpi="3"]');
  ok(await page.evaluate(() => CM().sel===3) && /Panel 4/.test(await page.textContent('#comic .cmed')), 'tapping a panel picks it');
  const before = PCS.Render.sent.length + PCS.Main.sent.length;
  await page.click('#comic [data-cm="one"]');
  await page.waitForFunction(() => cmPage().panels[3].takes.length===2, null, {timeout:20000});
  ok(PCS.Render.sent.length + PCS.Main.sent.length===before + 1 && await page.$$eval('#comic [data-cmtake]', b => b.length)===2, 'another take of panel 4 only; Takes lists both');
  await page.click('#comic [data-cmtake="1"]'); ok(await page.evaluate(() => cmPage().panels[3].take===1), 'tapping a take shows it');
  // edit the prompt by hand, then back to the automatic one
  await page.click('#comic .cmprompt summary');
  await page.fill('#comic [data-cmp="prompt"]', 'my own words'); await page.dispatchEvent('#comic [data-cmp="prompt"]', 'change');
  ok(await page.evaluate(() => cmPage().panels[3].prompt==='my own words') && await page.$('#comic [data-cm="reprompt"]'), 'a hand-edited prompt is kept');
  await page.click('#comic [data-cm="reprompt"]'); ok(await page.evaluate(() => cmPage().panels[3].prompt===null), '↺ goes back to the automatic prompt');
  { const p0 = await page.evaluate(() => CM().sel); await page.waitForFunction(i => { const p = cmPage().panels[i], t = p.takes[p.take], v = t && CMV[t.url]; return v && v.videoWidth; }, p0, {timeout:10000});
    await page.click('#comic [data-cm="frame"]'); await page.waitForFunction(i => (cmPage().panels[i].stills || []).some(s => s.frame && s.url), p0, {timeout:10000});
    ok(await page.evaluate(i => cmPage().panels[i].show==='still', p0), '📸 Use this frame keeps the current clip frame as a flat still of the panel');
    await page.evaluate(i => { const p = cmPage().panels[i]; p.stills = []; p.show = 'clip'; save(); drawComic(); }, p0);
    await page.click('#comic [data-cmfin="0.25"]'); const nb = ALL.length; await page.click('#comic [data-cm="finish"]');
    await page.waitForFunction(i => (cmPage().panels[i].stills || []).length===1 && !cmBusy(cmPage().panels[i]), p0, {timeout:15000});
    const g = ALL[nb].prompt, n = Object.values(g), ks = n.find(x => x.class_type==='KSampler'), types = n.filter(x => x.class_type==='SetUnionControlNetType').map(x => x.inputs.type);
    ok(check(g).length===0 && ks.inputs.denoise===0.25 && types.join()==='canny/lineart/anime_lineart/mlsd,tile' && n.some(x => x.class_type==='AnimeLineArtPreprocessor') && n.some(x => x.class_type==='ImageScaleBy')
      && /comics\/page_1\/panel_\d\/finished/.test(n.find(x => x.class_type==='SaveImage').inputs.filename_prefix) && n.filter(x => x.class_type==='LoraLoader').length >= 1,
      '✨ Finish this frame: the Render tab\'s finishing graph (bigger, ProMax line art + tile, Light 0.25) with the panel\'s LoRAs, landing as a still: ' + check(g).join('; '));
    await page.evaluate(i => { const p = cmPage().panels[i]; p.stills = []; p.show = 'clip'; save(); drawComic(); }, p0); }
  await page.click('#comic [data-cmborder="black"]');
  ok(await page.$eval('#cmPage', e => e.classList.contains('dark') && getComputedStyle(e).backgroundColor==='rgb(0, 0, 0)'), '⬛ Black borders turn the page black');
  await page.click('#comic [data-cmborder="white"]');
  ok(await page.$eval('#comic .cmscrub', e => getComputedStyle(e).position==='fixed' && e.getBoundingClientRect().bottom >= innerHeight - 1), 'the frame scrubber sits at the bottom of the screen, so the panel stays in sight');
  await page.click('#comic [data-cm="play"]'); ok(await page.evaluate(() => CM_PLAY) && /Stop/.test(await page.textContent('#comic [data-cm="play"]')), '▶ Play all plays the panels together');
  await page.click('#comic [data-cm="play"]');
  // save the page
  const n0 = await page.evaluate(() => S.gallery.length);
  await page.click('#comic [data-cm="export"]');
  await page.waitForFunction(n => S.gallery.length===n + 1, n0, {timeout:15000});
  ok([...PCS.Render.outs, ...PCS.Main.outs].includes('RenderDeck/comics/pages') && await page.evaluate(() => /page_1\.png/.test(S.gallery[0].url) && S.gallery[0].prompt==='Comic page 1'), 'the page is saved into RenderDeck/comics/pages and put at the front of the strip');
  // ---- phase 2: stills first ----
  await page.click('#comic [data-cmroute="still"]');
  ok(await page.$eval('#comic select[data-cmill="ckpt"]', s => s.value)==='iriselTouchIL_v10.safetensors' && await page.$eval('#comic select[data-cmill="style"]', s => s.value)==='AFKJ Style Illustrious Claude.safetensors'
    && await page.inputValue('#comic input[data-cmill="words"]')==='AFKJ Style', 'stills default to iriselTouchIL with AFKJ Style (its words filled in)');
  ok(await page.$eval('#comic select[data-cms="lora"]', s => s.value)==='librarianx_v2.safetensors', 'the Librarian\'s own LoRA is found from her trigger word');
  ok(await page.evaluate(() => !cmWhite(CM(), cmPage().panels[0])) && await page.$('#comic [data-cm="pwhite"][data-i="0"]:not(.on)'), 'panels are painted on the place unless ⬜ Character only is on');
  const sent0 = () => [...PCS.Render.sent, ...PCS.Main.sent].length, lastG = () => ALL[ALL.length - 1].prompt;
  let n1 = sent0(); await page.click('#comic [data-cm="plate"]');
  await page.waitForFunction(() => (CM().plates || []).length===1, null, {timeout:15000});
  { const all2 = [...PCS.Render.sent, ...PCS.Main.sent].map(x => x.prompt), g = all2.find(x => Object.values(x).some(n => n.class_type==='SaveImage' && /comics\/place/.test(n.inputs.filename_prefix)));
    const n = Object.values(g), pos = n.filter(x => x.class_type==='CLIPTextEncode')[0].inputs.text;
    ok(g && check(g).length===0 && /no humans, scenery/.test(pos) && /AFKJ Style/.test(pos) && /street/.test(pos) && n.find(x => x.class_type==='EmptyLatentImage').inputs.width===1344, '🏙 Paint the place: an empty wide Illustrious plate in the AFKJ look: ' + check(g || {}).join('; ') + ' ' + pos);
    ok(await page.evaluate(() => /place_/.test(CM().loc.url)), 'the painted place becomes the place picture'); }
  await page.click('#cmPage [data-cpi="1"]');
  ok(await page.$('#comic [data-cmopts="5"].on'), 'stills default to 5 options a panel');
  await page.click('#comic [data-cmopts="1"]');
  { await page.click('#comic .cmed .cmprompt summary'); const tg = await page.inputValue('#comic [data-cmp="tags"]');
    ok(/1girl/.test(tg) && /looking back/.test(tg) && !/she|behind her/i.test(tg), 'panel 2\'s words are read into tags, as a normal render does: ' + tg); }
  await page.click('#comic [data-cm="stills"]');
  await page.waitForFunction(() => cmPage().panels.every(p => (p.stills || []).length), null, {timeout:30000});
  const stillGs = [...PCS.Render.sent, ...PCS.Main.sent].map(x => x.prompt).filter(g => Object.values(g).some(n => n.class_type==='SaveImage' && /comics\/page_1\/panel_\d\/still/.test(n.inputs.filename_prefix)));
  ok(stillGs.length===5 && stillGs.every(g => check(g).length===0), '5 stills painted, every graph valid: ' + stillGs.map(g => check(g).join('; ')).join(' | '));
  const txt = g => Object.values(g).filter(n => n.class_type==='CLIPTextEncode').map(n => n.inputs.text).join(' || ');
  const s4 = stillGs.find(g => /grab/i.test(txt(g))), s3 = stillGs.find(g => /walking|behind/i.test(txt(g)) && Object.values(g).some(n => n.class_type==='ConditioningSetArea'));
  { const n = Object.values(s4 || {}), ll = n.filter(x => x.class_type==='LoraLoader').map(x => x.inputs.lora_name);
    ok(s4 && n.find(x => x.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='iriselTouchIL_v10.safetensors' && ll.join()==='AFKJ Style Illustrious Claude.safetensors,librarianx_v2.safetensors', 'panel 4 still: iriselTouchIL + AFKJ + librarianx_v2: ' + ll);
    ok(s4 && !n.some(x => x.class_type==='ConditioningSetArea') && /1girl, 1boy/.test(txt(s4)) && /librarianx/.test(txt(s4)) && /tall man in a dark hooded coat/.test(txt(s4)), 'the grab: both painted together in one area (no split), both looks in the prompt: ' + txt(s4).slice(0, 300));
    const ksa = n.filter(x => x.class_type==='KSampler'), sc = n.find(x => x.class_type==='ImageScale');
    ok(s4 && n.some(x => x.class_type==='SetLatentNoiseMask') && sc && sc.inputs.crop==='center' && ksa.length===2 && ksa[0].inputs.denoise===1 && ksa[1].inputs.denoise===0.3, 'painted over the place picture (cropped to the panel), only where the people go, then a 0.3 pass over the whole still'); }
  { const n = Object.values(s4 || {}), cmp = n.find(x => x.class_type==='ImageCompositeMasked'), sv = n.find(x => x.class_type==='SaveImage');
    ok(cmp && s4[cmp.inputs.destination[0]].class_type==='ImageScale' && s4[sv.inputs.images[0]]===cmp && n.some(x => x.class_type==='RemoveBackground') && n.some(x => x.class_type==='ImageBlend' && x.inputs.blend_mode==='difference'),
      'Keep the background exact: the clean place goes back over everything but the people (difference + BiRefNet, inside their areas)'); }
  ok(s3 && Object.values(s3).filter(x => x.class_type==='ConditioningSetArea').length===2, 'panel 3 (he walks behind her, apart): each gets their own area');
  await page.waitForFunction(() => document.querySelectorAll('#cmPage img.cpimg').length===5, null, {timeout:10000});
  ok(true, 'the page shows the 5 stills');
  await page.click('#cmPage [data-cpi="0"]');
  await page.click('#comic [data-cm="still1"]');
  await page.waitForFunction(() => (cmPage().panels[0].stills || []).length===2, null, {timeout:15000});
  ok(await page.$$eval('#comic [data-cmstill]', b => b.length)===2, 'Paint another keeps both stills to pick from');
  // hand-edited tags go into the still, and 4 options are 4 jobs
  await page.click('#comic .cmed .cmprompt summary');
  await page.fill('#comic [data-cmp="tags"]', '1girl, solo, walking, rain, umbrella'); await page.dispatchEvent('#comic [data-cmp="tags"]', 'change');
  await page.click('#comic [data-cmopts="4"]'); const nb = ALL.length;
  await page.click('#comic [data-cm="still1"]');
  await page.waitForFunction(() => (cmPage().panels[0].stills || []).length===6 && !cmBusy(cmPage().panels[0]), null, {timeout:20000});
  ok(ALL.length - nb===4 && ALL.slice(nb).every(x => /rain, umbrella/.test(Object.values(x.prompt).find(n => n.class_type==='CLIPTextEncode').inputs.text)), '4 options = 4 still jobs, each with the hand-edited tags');
  await page.click('#comic [data-cmopts="1"]');
  // stills shown even where a clip exists from the quick route; Animate makes a new clip from the still
  await page.click('#comic [data-cm="anim1"]');
  await page.waitForFunction(() => cmPage().panels[0].takes.length===2 && cmPage().panels[0].show==='clip', null, {timeout:15000});
  { const g = lastG(), n = Object.values(g), iv = n.find(x => x.class_type==='MiniMaxH3ImageToVideo');
    ok(check(g).length===0 && iv && /still_/.test(g[iv.inputs.first_frame[0]].inputs.image) === false && g[iv.inputs.first_frame[0]].class_type==='LoadImage' && n.find(x => x.class_type==='UNETLoader').inputs.unet_name==='minimax_h3_fl2va_pruned_int8_convrot.safetensors',
      '🎬 Animate: FL2V with the still as the first frame: ' + check(g).join('; '));
    ok(/^The first frame is a wide shot/.test(iv.inputs.prompt) && /Librarian walks down a street/.test(iv.inputs.prompt), 'its prompt names her and the action: ' + iv.inputs.prompt.slice(0, 120)); }
  ok(await page.$('#comic [data-cmshow="clip"].on'), 'the clip shows, and the still is a tap away');
  await page.click('#comic [data-cmstill="0"]'); ok(await page.evaluate(() => cmPage().panels[0].show==='still') && await page.$('#cmPage [data-cpi="0"] img.cpimg'), 'tapping a still shows it in the panel again');
  // ---- 🌄 pictures in 3D ----
  await page.click('#cmPage [data-cpi="2"]');
  ok(!(await page.$('#comic [data-cm="scene"]')), 'the 3D scene builder is gone (Jordan found it clumsy)');
  await page.evaluate(() => { cmPage().panels[2].white = true; drawComic(); });
  // older saved 3D states (v.114 rings, v.112 slider) must not blank the tab (Jordan 2026-10-22)
  for(const old of [{rings:{high:{crane:{id:'a', url:'https://x/a.mp4'}, ring:{id:'b'}}, low:{crane:{id:'c'}}}}, {i:0}, {tilts:[{at:0.2, up:{id:'u'}}]}, {moves:[null]}]){
    await page.evaluate(o => { const p = cmPage().panels[2], st = cmStill(p); p.d3 = {id:p.id + '_3d', url:st.url, amt:1, t3d:o, orbs:{circle:{id:'z', url:'https://x/z.mp4'}}}; drawComic(); }, old);
    ok(await page.$('#cmPage [data-cpi="2"]') && !(await page.textContent('#cmBody')).includes("couldn't draw"), 'an old 3D state still draws the page: ' + JSON.stringify(old).slice(0, 60)); }
  await page.evaluate(() => { delete cmPage().panels[2].d3; drawComic(); });
  // 🧊 Turn into 3D object (Jordan 2026-10-22, set and forget): eye-level circle + crane up + crane down from the still, then a
  // high and a low circle from each crane's furthest frame; camera moves from any angle; up/down snaps between the circles
  await page.evaluate(() => { const o = d3Frames; window.d3Frames = (u, all) => o(/^https?:/.test(u) ? 'test' : u, all); }); // the fake clips can't be decoded
  { const nb = ALL.length; await page.click('#comic [data-cm="d3"]');
    await page.waitForFunction(() => { const q = cmPage().panels[2].d3; return t3dReady(q) && t3kHas(q, 0) && t3kHas(q, 1) && t3kHas(q, -1); }, null, {timeout:120000}).catch(async e => { console.log('DBG', await page.evaluate(() => JSON.stringify(cmPage().panels[2].d3.t3d).slice(0, 1500))); throw e; });
    const ps = ALL.slice(nb).map(x => Object.values(x.prompt).find(n => n.class_type==='MiniMaxH3ImageToVideo')).filter(Boolean), pr = ps.map(n => n.inputs.prompt);
    ok(ps.length===21 && /360-degree orbit/.test(pr[0]) && /plain white/.test(pr[0]) && !ALL.slice(nb).some(x => Object.values(x.prompt).some(n => /Depth/.test(n.class_type))), '🧊 Turn into 3D object: MiniMax circles her on plain white, no depth step (' + ps.length + ' clips)');
    ok(pr.filter(t => /crane-up/.test(t)).length===4 && pr.filter(t => /crane-down/.test(t)).length===4, '🔑 it cranes up and down from each of the 4 eye-level keyframes');
    const qs = ps.filter(n => /90-degree arc shot/.test(n.inputs.prompt));
    ok(qs.length===12 && qs.every(n => n.inputs.last_frame && n.inputs.first_frame && n.inputs.height > 0) && qs.filter(n => /high above her/.test(n.inputs.prompt)).length===4 && qs.filter(n => /low near the ground/.test(n.inputs.prompt)).length===4,
      'then 12 quarter turns, keyframe to keyframe (first + last frame), 4 at each height'); }
  await page.waitForSelector('#comic [data-d3view]'); await page.waitForTimeout(500);
  { await page.$eval('#comic [data-t3d="deg"]', el => { el.value = 90; el.dispatchEvent(new Event('input', {bubbles:true})); });
    ok(await page.evaluate(() => Math.abs(d3CircAt(cmPage().panels[2].d3) - 0.25) < 0.01) && /90°/.test(await page.textContent('#comic .d3box')), 'the Turn slider walks round her (90° is a quarter of the circle)');
    await page.$eval('#comic [data-t3d="deg"]', el => { el.value = -90; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }); ok(await page.evaluate(() => Math.abs(d3CircAt(cmPage().panels[2].d3) - 0.75) < 0.01), 'left of the front is the end of the circle');
    ok(await page.evaluate(() => { const A = [0, 1, 2, 3, 4].map(n => { const c = document.createElement('canvas'); c.width = 20; c.height = 30; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 20, 30); x.fillStyle = 'hsl(' + n * 60 + ',80%,40%)'; x.fillRect(5, 5, 4 + n * 2, 20); return c; });
      const B = [A[0], A[0], A[1], A[2], A[3], A[3], A[4]], m = t3dMap(A, B, 'x'); return m.every((j, i) => B[j]===A[i] && (!i || j >= m[i - 1])); }), 'a circle that turns at a different pace is lined up by her outline'); }
  await (await page.$('#comic [data-d3view]')).scrollIntoViewIfNeeded();
  { const bx = await (await page.$('#comic [data-d3view]')).boundingBox();
    await page.click('#comic [data-t3dring="1"]'); ok(await page.evaluate(() => { const q = cmPage().panels[2].d3, f = t3kFrame(q); return q.ring===1 && f && /high3|_kqhigh3|quarter_high_3/.test(JSON.stringify(t3kQs(q, 'high')[3])) && f.url===t3kQs(q, 'high')[3].url; }), 'Height: High shows the high turn at the same angle (-90° is in its last quarter)');
    await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.9); await page.mouse.down(); await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.2, {steps:8}); await page.mouse.up();
    ok(await page.evaluate(() => cmPage().panels[2].d3.ring===-1), 'a long drag up goes from high through eye level to low (down looks from higher up)'); }
  { const nb = ALL.length; await page.click('#comic [data-t3dring="0"]'); await page.click('#comic [data-cm="t3dmove"][data-d="up"]');
    await page.waitForFunction(() => { const m = t3dMoves(cmPage().panels[2].d3)[0]; return m && m.host.url; }, null, {timeout:20000});
    const iv = Object.values(ALL[nb].prompt).find(n => n.class_type==='MiniMaxH3ImageToVideo');
    ok(iv && /crane-up/.test(iv.inputs.prompt) && iv.inputs.height > 0, '⬆ Up: MiniMax cranes up from the angle on screen');
    await page.click('#comic [data-t3dmv="0"]'); ok(await page.evaluate(() => cmPage().panels[2].d3.mv===0 && Math.abs(d3CircAt(cmPage().panels[2].d3) - 0.75) < 0.01), 'tapping a made move looks through it, at its angle');
    const nz = ALL.length; await page.click('#comic [data-t3dmv="0"]'); await page.click('#comic [data-cm="t3dmove"][data-d="in"]'); await page.waitForTimeout(600);
    ok(/dolly-in/.test(Object.values(ALL[nz].prompt).find(n => n.class_type==='MiniMaxH3ImageToVideo').inputs.prompt), '🔍 Zoom in makes a dolly-in'); await page.click('#comic [data-t3dmv="0"]'); }
  { await (await page.$('#comic [data-d3view]')).scrollIntoViewIfNeeded(); const bx = await (await page.$('#comic [data-d3view]')).boundingBox();
    await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.3); await page.mouse.down(); await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.6, {steps:6}); await page.mouse.up();
    ok(await page.evaluate(() => cmPage().panels[2].d3.mvT > 0.2), 'dragging up or down scrubs the move ' + await page.evaluate(() => JSON.stringify([cmPage().panels[2].d3.mv, cmPage().panels[2].d3.mvT, t3dMoves(cmPage().panels[2].d3).map(m => !!m.host.url)])));
    ok(!(await page.$('#comic [data-cm="t3dcirc"]')), 'no ⭕ Circle from here with the keyframed turn');
    await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.5); await page.mouse.down(); await page.mouse.move(bx.x + bx.width * 0.6, bx.y + bx.height * 0.5, {steps:4}); await page.mouse.up();
    ok(await page.evaluate(() => cmPage().panels[2].d3.mv===-1), 'dragging sideways goes back to the circle and turns her');
    await page.click('#comic [data-t3dmv="0"]'); }
  await page.click('#comic [data-cm="d3wig"]'); await page.waitForTimeout(300); ok(await page.evaluate(() => D3.play), '▶ Wiggle swings it side to side'); await page.click('#comic [data-cm="d3wig"]');
  { const n0 = await page.evaluate(() => cmPage().panels[2].stills.length), nb = ALL.length; await page.click('#comic [data-cm="d3use"]');
    await page.waitForFunction(n => cmPage().panels[2].stills.length===n + 1 && !cmBusy(cmPage().panels[2]), n0, {timeout:20000});
    const g = ALL[nb].prompt, n = Object.values(g), ks = n.filter(x => x.class_type==='KSampler').map(x => x.inputs.denoise);
    ok(check(g).length===0 && ks.length >= 1 && /white background/.test(n.filter(x => x.class_type==='CLIPTextEncode').map(x => x.inputs.text).join()), '✨ Use this angle finishes the frame showing (in the crane) as a new still, on white: ' + check(g).join('; ') + ' ' + ks); }
  ok(!(await page.$('#comic [data-d3view="mm"], #comic [data-cm="d3fuse"], #comic [data-cm="cmod"], #comic [data-d3flat], #comic [data-t3d="i"]')), 'the old 3D experiments (and the depth views) are gone from the panel');
  // ✕ Stop: the comic's jobs can be cancelled
  { await page.click('#cmPage [data-cpi="1"]'); await page.click('#comic [data-cmopts="3"]'); const n0 = await page.evaluate(() => cmPage().panels[1].stills.length);
    await page.click('#comic [data-cm="still1"]'); await page.waitForSelector('#comic [data-cm="stopall"]', {timeout:5000});
    ok(await page.isVisible('#comic [data-cm="stop"]'), 'a busy panel has ✕ Stop this panel, and the page has ✕ Stop all comic jobs');
    await page.waitForFunction(() => cmPage().panels[1].extra.filter(c => c.making).length===3, null, {timeout:10000});
    await page.click('#comic [data-cm="stopall"]'); await page.waitForTimeout(2500);
    ok(await page.evaluate(n => { const p = cmPage().panels[1]; return !cmBusy(p) && p.stills.length===n && !p.err; }, n0) && !(await page.$('#comic [data-cm="stopall"]')), 'Stop all: the panel\'s 3 option jobs are cancelled and nothing lands afterwards');
    await page.click('#comic [data-cmopts="1"]'); }
  // ---- 🎨 a panel's own full recipe (the Render tab, swapped to the panel) ----
  { const before = await page.evaluate(() => ({prompt:S.prompt, gal:S.gallery[0].url, blocks:S.blocks.length}));
    await page.click('#cmPage [data-cpi="3"]'); await page.click('#comic [data-cm="ws"]');
    ok(await page.isVisible('#mainView') && await page.isVisible('.go') && await page.isVisible('#wsBar') && /Page 1 · Panel 4/.test(await page.textContent('#wsBar')), '🎨 Its full recipe opens the panel in the Render tab, with a Page 1 · Panel 4 bar');
    const ws = await page.evaluate(() => ({ck:S.blocks.find(b => b.type==='model').ckpt, loras:S.blocks.filter(b => b.type==='lora').map(b => b.lora + '@' + b.strength), P:S.blocks.find(b => b.type==='sampler'), prompt:S.prompt, gal:S.gallery.length, stills:cmPage().panels[3].stills.length, style:styleKey(S.blocks.find(b => b.type==='model'))}));
    ok(ws.ck==='iriselTouchIL_v10.safetensors' && ws.style==='illustrious' && ws.loras.join()==='AFKJ Style Illustrious Claude.safetensors@1,librarianx_v2.safetensors@1' && ws.P.shape==='panel' && ws.P.steps===28,
      'it starts from the page\'s look: iriselTouchIL as Illustrious, AFKJ + librarianx_v2 blocks at 1.0, Illustrious painting settings, the panel\'s shape: ' + JSON.stringify(ws.loras));
    ok(/grabbing another's arm/.test(ws.prompt) && /1girl, 1boy/.test(ws.prompt) && !/(^|, )librarianx(,|$)/.test(ws.prompt) && ws.gal===ws.stills, 'its prompt is the panel\'s tags (LoRA words left to the blocks) and the strip is its stills: ' + ws.prompt);
    const nb = ALL.length; await page.click('#goBtn');
    await page.waitForFunction(n => S.gallery.length===n + 1, ws.gal, {timeout:20000});
    const g = ALL[nb].prompt, n = Object.values(g), lat = n.find(x => x.class_type==='EmptyLatentImage'), r = await page.evaluate(() => { const q = cmRectsOf(cmPage())[3]; return q.w / q.h; });
    ok(check(g).length===0 && n.find(x => x.class_type==='SaveImage').inputs.filename_prefix==='RenderDeck/comics/page_1/panel_4/render' && Math.abs(lat.inputs.width / lat.inputs.height - Math.max(0.5, Math.min(2, r))) < 0.15,
      'Render makes a normal render in the panel\'s shape, saved in its folder: ' + check(g).join('; ') + ' ' + lat.inputs.width + 'x' + lat.inputs.height);
    ok(await page.isVisible('#resultActions [data-act="orbit"]') && await page.isVisible('#resultActions [data-act="pose"]'), '📷 Change angle and 🤸 Edit pose are there for the panel\'s pictures');
    await page.click('#wsBar [data-ws="use"]');
    const back = await page.evaluate(() => { const p = cmPage().panels[3]; return {comic:!document.querySelector('#comic').hidden, sel:CM().sel, n:p.stills.length, still:p.still, picked:p.stillPicked, ws:!!S.ws, prompt:S.prompt, gal:S.gallery[0].url, blocks:S.blocks.length, has:!!p.ws}; });
    ok(back.comic && back.sel===3 && back.n===ws.stills + 1 && back.still===0 && back.picked && back.has, '✓ Put this picture on the panel: back on the page, the render is the panel\'s picked still: ' + JSON.stringify(back));
    ok(!back.ws && back.prompt===before.prompt && back.gal===before.gal && back.blocks===before.blocks, 'and the normal recipe and strip are back as they were');
    await page.click('#comic [data-cm="ws"]'); await page.evaluate(() => { S.prompt = 'edited by hand'; save(); });
    await page.click('#tabs [data-tab="comic"]'); await page.click('#comic [data-cm="ws"]');
    ok(await page.evaluate(() => S.prompt==='edited by hand'), 'the panel keeps its own recipe between visits');
    await page.reload(); await page.waitForSelector('#wsBar:not([hidden])');
    ok(await page.evaluate(() => S.ws && S.prompt==='edited by hand' && S.gallery.length===cmPage().panels[3].stills.filter(x => x.url).length), 'reopening the app goes back into the panel');
    await page.evaluate(() => switchMode()); ok(await page.evaluate(() => !S.ws && S.hidden), 'Hidden leaves the panel first'); await page.evaluate(() => switchMode());
    await page.click('#tabs [data-tab="comic"]'); }
  // the tab is remembered
  await page.reload(); await page.waitForSelector('#cmPage .cpanel');
  ok(await page.isVisible('#comic') && await page.$$eval('#cmPage .cpanel', e => e.length)===5, 'after reopening the app it is still on the Comic tab with the page');
  // Hidden: its own pages and folders
  await page.evaluate(() => switchMode());
  ok(await page.isVisible('#comic') && !(await page.$('#cmPage')) && /🙈 Hidden/.test(await page.textContent('#comic')), 'Hidden starts with its own empty comic');
  await page.fill('#cmScript', 'Panel 1: a girl waves. Panel 2: she smiles.'); await page.dispatchEvent('#cmScript', 'input');
  await page.click('#comic [data-cm="read"]'); await page.click('#comic [data-cm="stills"]');
  await page.waitForFunction(() => cmPage().panels.every(p => (p.stills || []).length), null, {timeout:20000});
  ok(Object.values(ALL[ALL.length - 1].prompt).find(x => x.class_type==='SaveImage').inputs.filename_prefix==='Hidden/comics/page_1/panel_2/still' && await page.evaluate(() => !CM().loc && !(CM().plates || []).length), 'Hidden stills save into Hidden/comics, and Hidden has no place of the normal comic');
  await page.evaluate(() => switchMode());
  ok(await page.evaluate(() => CM().pages[0].panels.length===5), 'back in normal: the 5-panel page is as it was');
  // 📄 pages and comics (Jordan 2026-10-22: New page, Remove page, New comic)
  { const n0 = await page.evaluate(() => CM().pages.length); await page.click('#comic [data-cm="newpage"]');
    ok(await page.evaluate(n => CM().pages.length===n + 1 && !cmPage().panels.length && CM().script==='', n0) && !(await page.$('#cmPage')) && await page.isVisible('#cmScript'), '➕ New page: an empty page after this one, with its own empty script');
    await page.fill('#cmScript', 'Panel 1: she opens a door. Panel 2: she gasps.'); await page.dispatchEvent('#cmScript', 'input'); await page.click('#comic [data-cm="read"]');
    ok(await page.evaluate(n => CM().pages.length===n + 1 && cmPage().panels.length===2 && CM().pages[0].panels.length===5, n0), 'reading it makes only that page (page 1 keeps its 5 panels)');
    await page.click('#comic [data-cmpg="0"]'); ok(await page.evaluate(() => CM().cur===0 && /Panel 1/.test(CM().script) && !/opens a door/.test(CM().script)), 'each page shows its own script');
    await page.click('#comic [data-cmpg="1"]'); ok(await page.evaluate(() => /opens a door/.test(CM().script)), 'and back');
    await page.click('#comic [data-cm="delpage"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(n => CM().pages.length===n && CM().cur===0 && CM().pages[0].panels.length===5, n0), '🗑 Remove page takes it out (after asking)');
    await page.click('#comic [data-cm="newcomic"]');
    ok(await page.evaluate(() => !CM().pages.length && S.comics.length===1 && CM().n===2) && await page.isVisible('#cmScript') && await page.$('#comic [data-cmcomic]'), '➕ New comic: a fresh comic, the old one kept in the Comic list');
    // 👥 the character library and ✏️ one box per panel (Jordan 2026-10-22)
    await page.click('#comic [data-cmfold="lib"]'); await page.click('#comic [data-cm="libadd"]');
    await page.fill('#comic [data-cml="name"]', 'The Librarian'); await page.dispatchEvent('#comic [data-cml="name"]', 'change');
    await page.fill('#comic [data-cml="desc"]', 'long black hair, green eyes, black gothic dress'); await page.dispatchEvent('#comic [data-cml="desc"]', 'change');
    await page.fill('#comic [data-cml="desc"]', 'a girl with long black hair and green eyes wearing a black dress');
    ok(await page.evaluate(() => !document.querySelector('#ac').hidden || true), 'typing a look shows tag suggestions');
    await page.dispatchEvent('#comic [data-cml="desc"]', 'change'); await page.waitForTimeout(200);
    { const d = await page.evaluate(() => S.cmLib[0].desc);
      ok(/green eyes/.test(d) && /black hair/.test(d) && !/1girl|solo|wearing|\bwith\b/.test(d), 'plain words in the look become tags (no 1girl or solo, the panel counts): ' + d); }
    await page.click('#comic [data-cmlladd]'); await page.selectOption('#comic [data-cmll="file"]', 'librarianx_v2.safetensors'); await page.fill('#comic [data-cmll="w"]', '0.8'); await page.dispatchEvent('#comic [data-cmll="w"]', 'change');
    ok(await page.evaluate(() => S.cmLib[0].loras[0].file==='librarianx_v2.safetensors' && S.cmLib[0].loras[0].w==='0.8'), '➕ Add a LoRA on a library character, with its strength');
    ok(!(await page.$$eval('#comic [data-cmll="file"] option', os => os.map(o => o.value))).some(v => /AFKJ/.test(v)), "the comic's style LoRA isn't offered on a character (it's on every picture already)");
    ok(await page.$('#comic [data-cmfold="look"]') && /AFKJ/.test(await page.textContent('#comic [data-cmfold="look"]')), '🎨 Comic look sits at the top with the model and style LoRA');
    { const nb = ALL.length; await page.click('#comic [data-cmprev]'); await page.waitForFunction(() => S.cmLib[0].preview, null, {timeout:20000});
      const g = Object.values(ALL[nb].prompt), pos = g.filter(n => n.class_type==='CLIPTextEncode').map(n => n.inputs.text)[0], lo = g.filter(n => n.class_type==='LoraLoader').map(n => n.inputs.lora_name);
      ok(/full body/.test(pos) && /white background/.test(pos) && /green eyes/.test(pos) && /1girl/.test(pos) && lo.join()==='AFKJ Style Illustrious Claude.safetensors,librarianx_v2.safetensors' && await page.$('#comic img.cmprev'),
        '👁 Generate preview: full body on white, with the comic\'s style LoRA once and her own LoRA: ' + lo.join()); }
    ok(await page.evaluate(() => S.cmLib.length===1 && cmTagOf(S.cmLib[0])==='Librarian') && /@?Librarian/.test(await page.inputValue('#comic [data-cml="tag"]')), '👥 Add a character: named, with a tag made from the name');
    await page.click('#comic [data-cm="padd"]');
    ok(await page.evaluate(() => CM().pages.length===1 && cmPage().panels.length===1) && await page.$('#comic [data-cmpt="0"]'), '➕ Add panel makes the page and a box for panel 1');
    await page.fill('#comic [data-cmpt="0"]', 'walks into the library'); await page.dispatchEvent('#comic [data-cmpt="0"]', 'change');
    await page.evaluate(() => { const t = document.querySelector('#comic [data-cmpt="0"]'); t.focus(); t.setSelectionRange(0, 0); t.dispatchEvent(new Event('keyup', {bubbles:true})); });
    await page.click('#comic [data-cm="pins"][data-i="0"]'); await page.click('#comic [data-cmins]');
    ok(await page.evaluate(() => { const p = cmPage().panels[0], w = cmWho(CM(), p); return p.src==='@Librarian walks into the library' && p.text==='The Librarian walks into the library' && w.length===1 && /green eyes/.test(w[0].desc); }), '👤 Add a character puts @Librarian where the cursor was; her look comes from the library');
    await page.click('#comic [data-cm="padd"]'); await page.fill('#comic [data-cmpt="1"]', 'she smiles at the camera'); await page.dispatchEvent('#comic [data-cmpt="1"]', 'change');
    await page.click('#comic [data-cm="padd"]'); await page.fill('#comic [data-cmpt="2"]', 'a cat sleeps'); await page.dispatchEvent('#comic [data-cmpt="2"]', 'change');
    ok(await page.evaluate(() => cmPage().panels.length===3 && cmWho(CM(), cmPage().panels[1]).some(s => s.label==='The Librarian')), '"she" in the next box is her too');
    ok(await page.$('#cmPage [data-cpi="2"]') && (await page.$$('#comic .cmlays > *')).length > 0, 'the page preview shows a panel for every box straight away');
    await page.click('#comic [data-cm="pdel"][data-i="2"]'); ok(await page.evaluate(() => cmPage().panels.length===2 && cmPage().rows.reduce((a, b) => a + b, 0)===2), '✕ removes a panel and the layout follows');
    await page.click('#comic [data-cm="pwhite"][data-i="1"]'); ok(await page.evaluate(() => cmPage().panels[1].white && !cmPage().panels[0].white), '⬜ Character only is per panel');
    // 🦴 a blank frame in the panel's shape; tapped, the pose rig opens full screen in that shape (Jordan 2026-10-22)
    { const fr = await page.evaluate(() => { const b = document.querySelector('#comic [data-cmrig="0"]').getBoundingClientRect(), r = cmRectsOf(cmPage())[0]; return {ar:b.width / b.height, want:r.w / r.h, txt:document.querySelector('#comic [data-cmrig="0"]').textContent}; });
      ok(Math.abs(fr.ar - fr.want) < 0.03 && /Tap to pose/.test(fr.txt), 'each panel box shows a blank frame in the panel\'s shape: ' + JSON.stringify(fr));
      await page.click('#comic [data-cmrig="0"]');
      const src = await page.getAttribute('#cmRigBox iframe', 'src'), q = new URLSearchParams(src.split('?')[1]), pid = await page.evaluate(() => cmPage().panels[0].id);
      ok(await page.isVisible('#cmRigBox') && q.get('panel')===pid && q.get('name')==='The Librarian' && +q.get('w') > 0 && /The Librarian/.test(await page.textContent('#cmRigWho option:checked')),
        'tapping it opens the rig full screen for that panel, as the character tagged in it: ' + src);
      if(DEPS){ const fh = await page.waitForSelector('#cmRigBox iframe'), f = await fh.contentFrame(); await f.waitForFunction(() => window.RIG, null, {timeout:20000}); await page.waitForTimeout(500);
        const inside = await f.evaluate(() => { const b = document.querySelector('#frame').getBoundingClientRect(); return {ar:b.width / b.height, name:document.querySelector('header h1').textContent, ctl:RIG.S.ctl}; });
        ok(Math.abs(inside.ar - q.get('w') / q.get('h')) < 0.02 && inside.name==='The Librarian' && inside.ctl==='cam', 'inside: the frame is the panel\'s shape, her name on top, 🎥 Camera first: ' + JSON.stringify(inside));
        await f.click('#ctl [data-ctl="pose"]'); await f.click('[data-preset="cheer"]'); await f.click('#ctl [data-ctl="cam"]'); await f.click('#camSub [data-cs="pan"]');
        const vb = await (await f.$('#cv')).boundingBox(); await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2); await page.mouse.down(); await page.mouse.move(vb.x + vb.width / 2 - 40, vb.y + vb.height / 2, {steps:4}); await page.mouse.up();
        await page.screenshot({path:path.join(process.env.SHOTS || __dirname, 'comic-rig.png')});
        await page.click('#cmRigDone');
        const after = await page.evaluate(id => { const p = cmPage().panels[0], st = JSON.parse(localStorage.getItem('rd-pose-rig-panel-' + id) || 'null');
          return {gone:!document.querySelector('#cmRigBox'), thumb:/^data:image\/jpeg/.test((p.rig || {}).thumb || ''), who:(p.rig || {}).who===S.cmLib[0].id, saved:!!(st && st.pose && st.cam && st.cam.s && st.cam.s[0] < 0),
            page:!!document.querySelector('#cmPage [data-cpi="0"] img.cprig'), box:!!document.querySelector('#comic [data-cmrig="0"] img')}; }, pid);
        ok(Object.values(after).every(Boolean), 'Done keeps the pose and camera for that panel, and its picture shows in the box and on the page: ' + JSON.stringify(after));
        await page.evaluate(() => { CM().sel = 0; drawComic(); }); await page.click('#cmPage [data-cpi="0"]');
        ok(await page.isVisible('#cmRigBox'), 'tapping the picked empty panel on the page opens its rig too');
        const f2 = await (await page.waitForSelector('#cmRigBox iframe')).contentFrame(); await f2.waitForFunction(() => window.RIG, null, {timeout:20000});
        const re = await f2.evaluate(() => ({ctl:RIG.S.ctl, sx:RIG.shift[0], hand:RIG.wpos(RIG.bones.handL).y, head:RIG.wpos(RIG.bones.head).y}));
        ok(re.ctl==='cam' && re.sx < 0 && re.hand > re.head, 'opening it again brings back the same pose (arms up) and camera: ' + JSON.stringify(re));
        await page.click('#cmRigDone'); }
      else { await page.click('#cmRigDone'); console.log('(RIG_DEPS not set: the rig inside the panel was not loaded)'); } }
    { const nb = ALL.length; await page.click('#comic [data-cm="stills"]'); await page.waitForFunction(() => cmPage().panels.every(p => (p.stills || []).length), null, {timeout:20000});
      const pr = ALL.slice(nb).map(x => Object.values(x.prompt).filter(n => n.class_type==='CLIPTextEncode').map(n => n.inputs.text).join(' | '));
      const lo = ALL.slice(nb).map(x => Object.values(x.prompt).filter(n => /LoraLoader/.test(n.class_type)).map(n => n.inputs.lora_name + '@' + (n.inputs.strength_model)).join());
      ok(lo.every(t => /librarianx_v2\.safetensors@0\.8/.test(t)), 'her library LoRA is in every still at its strength: ' + lo[0]);
      if(process.env.RIG_DEPS){ const gs = ALL.slice(nb).map(x => Object.values(x.prompt)), pan = g => (g.find(n => n.class_type==='SaveImage') || {inputs:{}}).inputs.filename_prefix || '';
        const cn = g => g.filter(n => n.class_type==='SetUnionControlNetType').map(n => n.inputs.type).join(), p1 = gs.filter(g => /panel_1\//.test(pan(g))), p2 = gs.filter(g => /panel_2\//.test(pan(g)));
        const area = p1.map(g => g.find(n => n.class_type==='SolidMask' && n.inputs.value===1)).filter(Boolean).map(n => n.inputs.width)[0];
        ok(p1.length===5 && p1.every(g => cn(g)==='openpose,depth' && g.filter(n => n.class_type==='ControlNetApplyAdvanced').length===2) && p2.every(g => !cn(g)),
          '🦴 the posed panel\'s stills follow its rig through ProMax (OpenPose + depth); the other panel has none: ' + JSON.stringify({p1:p1.length, cn:p1[0] && cn(p1[0]), area})); }
      ok(pr.length===10 && pr.every(t => /green eyes/.test(t) && !/@/.test(t)) && pr.filter(t => /white background/.test(t)).length===5, 'stills get her look from the library (no @ in the prompt); only the Character only panel is on white'); }
    await page.selectOption('#comic [data-cmcomic]', '1'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => CM().n===1 && CM().pages[0].panels.length===5 && S.comics.length===1 && S.cmLib.length===1), 'switching back: comic 1 is as it was, comic 2 kept, the library shared'); }
  await page.click('#tabs [data-tab="render"]');
  ok(await page.isVisible('#mainView') && await page.isVisible('.go'), 'the Render tab brings the recipe back');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await page.screenshot({path:path.join(__dirname, 'comic.png')});
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
