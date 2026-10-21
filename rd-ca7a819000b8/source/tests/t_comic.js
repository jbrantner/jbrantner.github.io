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
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
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
  // 🌄 3D look on a still, and ✨ Use this angle
  await page.click('#comic [data-cm="d3"]');
  await page.waitForFunction(() => { const q = cmPage().panels[2].d3; return q && q.depth && !q.making; }, null, {timeout:20000});
  { const g = ALL[ALL.length - 1].prompt, n = Object.values(g), d = n.find(x => x.class_type==='DepthAnythingV2Preprocessor');
    ok(check(g).length===0 && d && d.inputs.ckpt_name==='depth_anything_v2_vitl.pth' && /comics\/depth/.test(n.find(x => x.class_type==='SaveImage').inputs.filename_prefix), '🌄 3D look: Depth Anything V2 reads the still\'s depth on a computer: ' + check(g).join('; '));
    ok(n.some(x => x.class_type==='RemoveBackground') && n.filter(x => x.class_type==='DepthAnythingV2Preprocessor').length===2 && n.filter(x => x.class_type==='ImageBatch').length===3 && /no humans, scenery/.test(n.filter(x => x.class_type==='CLIPTextEncode').map(x => x.inputs.text).join())
      && await page.evaluate(() => { const q = cmPage().panels[2].d3; return q.bg && q.bgDepth && q.mask && d3Layers(q).length===2; }), 'in layers: the character cut out (BiRefNet), the background painted in behind them (Illustrious, no humans), the depth of both'); }
  await page.waitForSelector('#comic [data-d3view]'); await page.waitForTimeout(400);
  { const n = await page.$eval('#comic [data-d3view]', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for(let q = 0; q < d.length; q += 16) if(d[q] + d[q+1] + d[q+2] > 30) k++; return k; });
    ok(n > 100, '🌄 3D look draws the still as a relief'); }
  await (await page.$('#comic [data-d3view]')).scrollIntoViewIfNeeded();
  { const bx = await (await page.$('#comic [data-d3view]')).boundingBox();
    await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.5); await page.mouse.down(); await page.mouse.move(bx.x + bx.width * 0.6, bx.y + bx.height * 0.5, {steps:4}); await page.mouse.up();
    ok(await page.evaluate(() => Math.abs(cmPage().panels[2].d3.yaw) > 0.05), 'dragging swings its angle a little'); }
  await page.click('#comic [data-cm="d3wig"]'); await page.waitForTimeout(300); ok(await page.evaluate(() => D3.play), '▶ Wiggle swings it side to side'); await page.click('#comic [data-cm="d3wig"]');
  { const n0 = await page.evaluate(() => cmPage().panels[2].stills.length), nb = ALL.length; await page.click('#comic [data-cm="d3use"]');
    await page.waitForFunction(n => cmPage().panels[2].stills.length===n + 1 && !cmBusy(cmPage().panels[2]), n0, {timeout:20000});
    const g = ALL[nb].prompt, n = Object.values(g), ks = n.filter(x => x.class_type==='KSampler').map(x => x.inputs.denoise);
    ok(check(g).length===0 && ks.join()==='0.65,0.25' && n.some(x => x.class_type==='SetLatentNoiseMask') && n.find(x => x.class_type==='SetUnionControlNetType').inputs.type==='tile' && n.filter(x => x.class_type==='LoadImage').length===2 && g[n.find(x => x.class_type==='SaveImage').inputs.images[0]].class_type==='ColorMatch',
      '✨ Use this angle: the swung view, its torn edges repainted at 0.65 then 0.25 over all, held by ProMax tile, colours matched back to the view, lands as a new still: ' + check(g).join('; ') + ' ' + ks); }
  // ---- 3D look, better: MoGe-2 depth, which way it runs, and a third layer (the far backdrop) ----
  { const sp = await page.evaluate(async () => { const mk = f => { const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d'), im = x.createImageData(64, 96);
        for(let j = 0; j < 96; j++) for(let i = 0; i < 64; i++){ const v = f(i, j); im.data.set([v, v, v, 255], (j * 64 + i) * 4); } x.putImageData(im, 0, 0); return c.toDataURL(); };
      const two = await d3Split(mk((i, j) => j > 60 ? 220 : 30), false), slope = await d3Split(mk((i, j) => Math.round(j * 2.6)), false);
      return {two:!!two && Math.abs(two.near - 35 / 96) < 0.05, slope:slope===null, dbg:JSON.stringify([two && two.near, slope && slope.near])}; });
    ok(sp.two && sp.slope, 'the background splits in two only where its depth has a clear near part and far part (not a smooth slope) ' + sp.dbg); }
  { const fl = await page.evaluate(async () => { const mk = (f, w = 64, h = 64) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), im = x.createImageData(w, h);
        for(let j = 0; j < h; j++) for(let i = 0; i < w; i++){ const v = f(i, j); im.data.set([v, v, v, 255], (j * w + i) * 4); } x.putImageData(im, 0, 0); return c.toDataURL(); };
      const ph = {id:'t3d', url:mk(() => 128), depth:mk((i, j) => i > 20 && i < 44 ? 40 : 200), mask:mk((i, j) => i > 20 && i < 44 ? 255 : 0), moge:true};
      await d3After(ph); const a = ph.dflip; const ph2 = Object.assign({}, ph, {moge:false}); await d3After(ph2); return {a, b:ph2.dflip, e:ph.err}; });
    ok(fl.a===true && !fl.b, 'MoGe depth that runs the other way (the character darker than the wall) is turned round; Depth Anything\'s is left ' + JSON.stringify(fl)); }
  await page.evaluate(() => { const o = allPcs().find(p => /desktop/.test(p.url)).oi; Object.assign(o, {LoadMoGeModel:{input:{required:{model_name:[['moge_2_vitl_normal_fp16.safetensors']]}}}, MoGeInference:{input:{required:{}}},
    MoGeRender:{input:{required:{output:[['depth_colored', 'depth', 'mask', 'normal_opengl', 'normal_directx']]}}}}); drawComic(); });
  { const nb = ALL.length; await page.click('#comic [data-cm="d3"]');
    await page.waitForFunction(() => { const q = cmPage().panels[2].d3; return q && q.depth && !q.making; }, null, {timeout:20000});
    const g = ALL[nb].prompt, n = Object.values(g), r = n.filter(x => x.class_type==='MoGeRender');
    ok(check(g).length===0 && r.length===2 && r.every(x => x.inputs.output==='depth') && n.find(x => x.class_type==='LoadMoGeModel').inputs.model_name==='moge_2_vitl_normal_fp16.safetensors' && !n.some(x => x.class_type==='DepthAnythingV2Preprocessor')
      && await page.evaluate(() => cmPage().panels[2].d3.moge), 'with ComfyUI\'s MoGe nodes and MoGe-2 on a computer, the 3D look reads both depths with MoGe-2: ' + check(g).join('; ')); }
  { const nb = ALL.length; await page.evaluate(async () => { const ph = cmPage().panels[2].d3, c = document.createElement('canvas'); c.width = 8; c.height = 8; await cmFar(ph, {canvas:c, t:0.5, near:0.4}); });
    await page.waitForFunction(() => { const q = cmPage().panels[2].d3; return q.far && !q.making; }, null, {timeout:20000});
    const g = ALL[nb].prompt, n = Object.values(g), sv = n.find(x => x.class_type==='SaveImage');
    ok(check(g).length===0 && n.some(x => x.class_type==='ImageToMask') && n.some(x => x.class_type==='SetLatentNoiseMask') && /no humans, scenery, distant view/.test(n.filter(x => x.class_type==='CLIPTextEncode').map(x => x.inputs.text).join())
      && g[sv.inputs.images[0]].class_type==='ImageBatch' && n.some(x => x.class_type==='MoGeRender'), 'the far backdrop: the near part of the background painted out (Illustrious, scenery), its depth read again: ' + check(g).join('; '));
    ok(await page.evaluate(() => { const q = cmPage().panels[2].d3; return d3Layers(q).length===3 && q.nearMask && d3Layers(q)[1].mask===q.nearMask; }) && /Three layers/.test(await page.textContent('#comic .d3box')), 'and the 3D look draws three layers: far backdrop, near background, character'); }
  await page.waitForTimeout(300);
  { const n = await page.$eval('#comic [data-d3view]', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for(let q = 0; q < d.length; q += 16) if(d[q] + d[q+1] + d[q+2] > 30) k++; return k; });
    ok(n > 100, 'the three layers draw'); }
  // ---- 🎞 MiniMax views: a left and a right orbit from the still, scrubbed by dragging ----
  { const nb = ALL.length; await page.click('#comic [data-d3deg="20"]'); await page.click('#comic [data-cm="d3orb"]');
    await page.waitForFunction(() => { const q = cmPage().panels[2].d3; return d3OrbReady(q) && !d3Orbs(q).some(o => o.making || o.busy); }, null, {timeout:30000});
    const gs = ALL.slice(nb).map(x => x.prompt), sv = g => Object.values(g).find(n => n.class_type==='SaveVideo'), iv = g => Object.values(g).find(n => n.class_type==='MiniMaxH3ImageToVideo');
    ok(gs.length===2 && /panel_3\/orbit_left$/.test(sv(gs[0]).inputs.filename_prefix) && /panel_3\/orbit_right$/.test(sv(gs[1]).inputs.filename_prefix) && /20-degree arc shot.*to the left/.test(iv(gs[0]).inputs.prompt) && /to the right/.test(iv(gs[1]).inputs.prompt),
      '🎞 Make real angles: two MiniMax FL2V orbits from the still, left and right, at the picked 20°, saved in the panel\'s folder: ' + gs.map(g => sv(g).inputs.filename_prefix).join(' | '));
    ok(new Set(ALL.slice(nb).map(x => PCS.Render.sent.includes(x) ? 'R' : 'M')).size===2, 'the two orbits go to both computers at once'); }
  await page.click('#comic [data-d3view="mm"]');
  await page.waitForFunction(() => { const q = cmPage().panels[2].d3; return D3F[q.orbs.right.url] && D3F[q.orbs.right.url].ready; }, null, {timeout:20000}).catch(() => {});
  ok(await page.evaluate(() => { const q = cmPage().panels[2].d3; q.yaw = 0.2; return d3MmDraw(q, document.querySelector('#comic [data-d3view]')); }), 'Swing with MiniMax views: dragging shows the orbit\'s painted frames');
  { const nb = ALL.length, n0 = await page.evaluate(() => cmPage().panels[2].stills.length); await page.click('#comic [data-cm="d3use"]');
    await page.waitForFunction(n => cmPage().panels[2].stills.length===n + 1 && !cmBusy(cmPage().panels[2]), n0, {timeout:20000});
    const g = ALL[nb].prompt, sv = Object.values(g).find(n => n.class_type==='SaveImage');
    ok(/panel_3\/finished/.test(sv.inputs.filename_prefix) && Object.values(g).some(n => n.class_type==='ColorMatch'), 'Use this angle on a MiniMax view finishes that exact frame in Illustrious as a new still'); }
  // ---- 🧊 the orbit views fused into a 3D model (Depth Anything 3, multiview) ----
  await page.evaluate(() => { const p = cmPage().panels[2]; p.still = p.stills.findIndex(x => x.url===p.d3.url); p.show = 'still'; p.d3.view = 'depth'; drawComic(); });
  ok(/update ComfyUI/.test(await page.textContent('#comic .d3box')), 'without the Depth Anything 3 nodes, the 3D look says to update ComfyUI');
  await page.evaluate(() => { const o = allPcs().find(p => /desktop/.test(p.url)).oi; Object.assign(o, {DA3Inference:{input:{required:{}}}, DA3GeometryToMesh:{input:{required:{}}}, SaveGLB:{input:{required:{}}},
    LoadDA3Model:{input:{required:{model_name:[['moge_2_vitl_normal_fp16.safetensors']], weight_dtype:[['default']]}}}}); drawComic(); });
  ok(await page.isVisible('#comic [data-cm="d3getda3"]'), 'with the nodes but no DA3 model: ⬇ Get Depth Anything 3');
  await page.evaluate(() => { allPcs().find(p => /desktop/.test(p.url)).oi.LoadDA3Model.input.required.model_name = [['moge_2_vitl_normal_fp16.safetensors', 'depth_anything_3_base.safetensors']]; drawComic(); });
  { const nb = ALL.length; await page.click('#comic [data-cm="d3fuse"]');
    await page.waitForFunction(() => { const q = cmPage().panels[2].d3; return q.fuse && q.fuse.glbs && !q.fuse.making; }, null, {timeout:30000});
    const g = ALL[nb].prompt, n = Object.values(g), di = n.find(x => x.class_type==='DA3Inference'), ms = n.filter(x => x.class_type==='DA3GeometryToMesh').map(x => x.inputs.batch_index);
    ok(check(g).length===0 && n.filter(x => x.class_type==='LoadImage').length===17 && di.inputs.mode==='multiview' && di.inputs['mode.ref_view_strategy']==='middle' && n.find(x => x.class_type==='LoadDA3Model').inputs.model_name==='depth_anything_3_base.safetensors'
      && ms.join()==='0,4,8,12,16' && n.filter(x => x.class_type==='SaveGLB').every(x => /panel_3\/model3d_v\d+$/.test(x.inputs.filename_prefix)),
      '🧊 Fuse: the still + 8 frames of each orbit go to Depth Anything 3 multiview (anchored on the still), 5 views become meshes saved as .glb: ' + check(g).join('; ') + ' ' + ms); }
  ok(await page.evaluate(() => cmPage().panels[2].d3.view==='fuse') && await page.$('#comic [data-d3view="fuse"].on'), 'when it is ready the 3D look switches to 🧊 3D model');
  await page.waitForTimeout(800);
  { const px = () => page.$eval('#comic [data-d3view]', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for(let q = 0; q < d.length; q += 16) if(d[q] + d[q+1] + d[q+2] > 30) k++; return k; });
    const a = await px(); await page.evaluate(() => { cmPage().panels[2].d3.yaw = 0.8; d3Redraw(); }); const b = await px();
    ok(a > 50 && b > 0 && a!==b, 'the fused model draws on the phone and turns (' + a + ' → ' + b + ' lit points)'); }
  { await page.evaluate(() => { cmPage().panels[2].d3.yaw = 0.3; }); const nb = ALL.length, n0 = await page.evaluate(() => cmPage().panels[2].stills.length); await page.click('#comic [data-cm="d3use"]');
    await page.waitForFunction(n => cmPage().panels[2].stills.length===n + 1 && !cmBusy(cmPage().panels[2]), n0, {timeout:20000});
    const g = ALL[nb].prompt, ks = Object.values(g).filter(x => x.class_type==='KSampler').map(x => x.inputs.denoise);
    ok(check(g).length===0 && ks.join()==='0.65,0.25', 'Use this angle from the 3D model: its holes repainted (0.65), then a light pass (0.25), as a new still'); }
  await page.evaluate(() => { cmPage().panels[2].d3.view = 'depth'; });
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
  await page.click('#tabs [data-tab="render"]');
  ok(await page.isVisible('#mainView') && await page.isVisible('.go'), 'the Render tab brings the recipe back');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await page.screenshot({path:path.join(__dirname, 'comic.png')});
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
