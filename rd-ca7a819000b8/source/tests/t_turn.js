// Turnaround video: MiniMax H3 on Render turns the character around once from its Front picture. The card shows the
// clip with a slider; picking an angle jumps to where it usually is, and Add as … grabs that frame as a new picture.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const VID = fs.readFileSync(path.join(__dirname, 'fixtures', 'turn.webm')); // 2 s: red, green, blue, yellow quarters
const RENDER = 'https://jordo-desktop.test';
const C = a => [a];
const DEF = { // required inputs and how many outputs, as in ComfyUI's own definitions
  LoadImage:[['image'],2], ResizeAndPadImage:[['image','target_width','target_height','padding_color','interpolation'],1], UNETLoader:[['unet_name','weight_dtype'],1],
  LoraLoaderModelOnly:[['model','lora_name','strength_model'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1],
  MiniMaxH3ReferenceToVideo:[['clip','prompt','width','height','length','ref_image_size'],2], MiniMaxH3AddGuide:[['positive','latent','frame_idx'],1],
  BasicGuider:[['model','conditioning'],1], BasicScheduler:[['model','scheduler','steps','denoise'],1], KSamplerSelect:[['sampler_name'],1], RandomNoise:[['noise_seed'],1],
  SamplerCustomAdvanced:[['noise','guider','sampler','sigmas','latent_image'],2], VAEDecodeTiled:[['samples','vae','tile_size','overlap','temporal_size','temporal_overlap'],1],
  CreateVideo:[['images','fps'],1], SaveVideo:[['video','filename_prefix','format'],0],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
const OI = () => ({CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal','simple'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}}, LoraLoaderModelOnly:{input:{required:{lora_name:C(['minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors','minimax_h3_fl2v_turbo_8step_v1.0.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['DasiwaMinimaxH3_dasiwaHybridV2_int8.safetensors','DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors']), weight_dtype:C(['default'])}}},
  CLIPLoader:{input:{required:{clip_name:C(['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']), type:C(['stable_diffusion','minimax'])}}},
  VAELoader:{input:{required:{vae_name:C(['minimax_h3_video_vae_int8_convrot.safetensors','minimax_h3_video_vae_fp16.safetensors'])}}},
  MiniMaxH3ReferenceToVideo:{input:{required:{}}}, MiniMaxH3AddGuide:{input:{required:{}}}, ResizeAndPadImage:{input:{required:{}}}, SaveVideo:{input:{required:{}}},
  CreateVideo:{input:{required:{}}}, LoadImage:{input:{required:{}}}});
function firstPixel(buf){ // the first pixel of a PNG (row 0's first pixel is never predicted from anything)
  const at = buf.indexOf(Buffer.from([0x89,0x50,0x4e,0x47])); const png = buf.slice(at); let p = 8, idat = [], w, h;
  while(p < png.length){ const len = png.readUInt32BE(p), type = png.slice(p+4, p+8).toString(); if(type==='IHDR'){ w = png.readUInt32BE(p+8); h = png.readUInt32BE(p+12); }
    if(type==='IDAT') idat.push(png.slice(p+8, p+8+len)); if(type==='IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); return {w, h, rgb:[raw[1], raw[2], raw[3]]}; }
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  const sent = [], ups = []; let polls = 0;
  await page.route(RENDER + '/**', async r => {
    const u = new URL(r.request().url()), cors = {'Access-Control-Allow-Origin':'*'};
    if(u.pathname==='/object_info') return r.fulfill({ json:OI() });
    if(u.pathname==='/view' && /\.webm$/.test(u.searchParams.get('filename'))){ // like ComfyUI's FileResponse, it serves byte ranges so the clip can be scrubbed
      const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] || ''); if(!m) return r.fulfill({ contentType:'video/webm', body:VID, headers:Object.assign({'Accept-Ranges':'bytes'}, cors) });
      const a = +m[1], b = m[2] ? +m[2] : VID.length - 1;
      return r.fulfill({ status:206, contentType:'video/webm', body:VID.slice(a, b + 1), headers:Object.assign({'Accept-Ranges':'bytes', 'Content-Range':'bytes ' + a + '-' + b + '/' + VID.length}, cors) }); }
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG, headers:cors });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:sent.length && polls < 2 ? [[0, 't' + sent.length]] : [], queue_pending:[]} }); // running until it's in the history
    if(u.pathname==='/upload/image'){ ups.push(r.request().postDataBuffer()); return r.fulfill({ json:{name:'turn_' + ups.length + '.png', subfolder:'', type:'input'} }); }
    if(u.pathname==='/prompt'){ const b = JSON.parse(r.request().postData()); sent.push(b); return r.fulfill({ json:{prompt_id:'t' + sent.length, number:0, node_errors:{}} }); }
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = sent[0].prompt, save = Object.keys(g).find(k => g[k].class_type==='SaveVideo');
      if(++polls < 2) return r.fulfill({ json:{} });
      return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:{[save]:{images:[{filename:'Levi_00001_.webm', subfolder:'RenderDeck/characters/turn', type:'output'}], animated:[true]}}}} }); }
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', RENDER + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(srv => { closeSheets(); const v = (id, a) => ({id, angle:a, img:'levi_' + a + '.png', url:srv + '/view?filename=levi_' + a + '.png', home:srv});
    S.chars = [{id:'c1', name:'Levi', tags:'1boy, black coat', color:'#ff5ca8', views:[v('v0','ref'), v('v1','front')]}]; save(); }, RENDER);
  await page.click('#charBtn'); await page.click('#charBody [data-open="c1"]');
  ok(/MiniMax H3 on .* turns Levi around once, from the Front picture/.test(await page.textContent('#charBody')), 'the card offers a turnaround from the Front picture');
  await page.click('#charBody [data-ch="maketurn"]');
  await page.waitForSelector('#charBody video[data-tv]', {timeout:12000});
  const g = sent[0].prompt, nodes = Object.values(g), by = c => nodes.filter(n => n.class_type===c);
  ok(sent.length===1 && sent[0].client_id==='rd-turn' && check(g).length===0, 'the turnaround graph is valid: ' + check(g).join('; '));
  ok(by('UNETLoader')[0].inputs.unet_name==='DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors' && by('LoraLoaderModelOnly')[0].inputs.lora_name==='minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors'
    && by('BasicScheduler')[0].inputs.steps===4 && by('VAELoader')[0].inputs.vae_name==='minimax_h3_video_vae_fp16.safetensors' && by('CLIPLoader')[0].inputs.type==='minimax', 'Turbo model, 4-step Turbo LoRA, fp16 video VAE, minimax text encoder');
  const rv = by('MiniMaxH3ReferenceToVideo')[0].inputs;
  ok(g[rv['ref_images.ref_image_0'][0]].inputs.image==='levi_front.png' && rv.width===576 && rv.height===1024 && rv.length===124 && /1boy, black coat/.test(rv.prompt) && /360-degree/.test(rv.prompt), 'the front picture is the reference, portrait 576x1024, 124 frames, tags in the prompt');
  ok(by('MiniMaxH3AddGuide').map(n => n.inputs.frame_idx).join()==='0,-1' && by('MiniMaxH3AddGuide').every(n => g[n.inputs.image[0]].class_type==='ResizeAndPadImage'), 'pinned as the first and last frame, padded to fit, not cropped');
  ok(by('SaveVideo')[0].inputs.filename_prefix==='RenderDeck/characters/turn/Levi', 'saved under RenderDeck/characters/turn');
  await page.waitForFunction(() => document.querySelector('#charBody video[data-tv]').readyState >= 2, null, {timeout:9000});
  ok(await page.inputValue('#charBody [data-tvt]')==='250', 'Right side is picked first, at a quarter of the way');
  await page.click('#charBody [data-seg="tvang"][data-v="back"]');
  ok(await page.inputValue('#charBody [data-tvt]')==='500', 'picking Back jumps half way');
  await page.waitForFunction(() => Math.abs(document.querySelector('#charBody video[data-tv]').currentTime - 1) < 0.05 && !document.querySelector('#charBody video[data-tv]').seeking, null, {timeout:9000});
  await page.waitForTimeout(200);
  await page.click('#charBody [data-ch="tvadd"]');
  await page.waitForFunction(() => S.chars[0].views.some(v => v.angle==='back'), null, {timeout:9000});
  const px = firstPixel(ups[0]), v = await page.evaluate(() => S.chars[0].views.find(x => x.angle==='back'));
  ok(px.w===64 && px.h===112 && px.rgb[2] > 180 && px.rgb[0] < 80, 'the frame half way through (the blue quarter) is what was added: ' + JSON.stringify(px));
  ok(v.img==='turn_1.png' && v.made && v.home===RENDER && /type=input/.test(v.url), 'it is a new Back picture on Render: ' + JSON.stringify(v));
  await page.click('#charBody [data-seg="tvang"][data-v="left"]');
  await page.fill('#charBody [data-tvt]', '900'); await page.dispatchEvent('#charBody [data-tvt]', 'input');
  ok(await page.inputValue('#charBody [data-tvt]')==='900', 'sliding keeps the frame where it was put');
  ok(await page.evaluate(() => { const c = S.chars[0], r = c.views; c.views = [r[0]]; CH.sel = 'v0'; const s = turnSource(c); c.views = r; return s.id==='v0'; }), 'with no front yet it turns the Reference picture');
  ok(await page.evaluate(() => { const c = S.chars[0], g = turnVideoGraph(kitTurn(), 'levi_ref.png', c, false).g, n = Object.values(g);
    return !n.some(x => x.class_type==='MiniMaxH3AddGuide' || x.class_type==='ResizeAndPadImage') && g[n.find(x => x.class_type==='BasicGuider').inputs.conditioning[0]].class_type==='MiniMaxH3ReferenceToVideo'; }), 'from a Reference nothing is pinned, so the clip opens on a clean front');
  ok(await page.$('#charBody [data-seg="tvang"][data-v="front"]'), 'Front can be picked from the clip');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
