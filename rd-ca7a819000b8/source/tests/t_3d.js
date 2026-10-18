// 3D model of a character: Pixal3D on ComfyUI's TRELLIS.2 nodes. Before the model is on Render it offers the one
// download (through the helper, after asking); with it, Make 3D model sends a graph built from the front, side and
// back pictures, follows it to the end and shows the .glb on the card.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const RENDER = 'https://jordo-desktop.test';
const C = a => [a];
const DEF = { // required inputs and how many outputs, as in ComfyUI's own definitions
  LoadImage:[['image'],2], LoadBackgroundRemovalModel:[['bg_removal_name'],1], RemoveBackground:[['bg_removal_model','image'],1],
  ImageCropToMask:[['images','masks','width','height','pad_factor','grow_mask','background'],1], CLIPVisionLoader:[['clip_name'],1], UNETLoader:[['unet_name','weight_dtype'],1],
  VAELoader:[['vae_name'],1], Pixal3DMultiViewConditioning:[['clip_vision_model','fov'],2], ModelSamplingSD3:[['model','shift'],1], EmptyTrellis2LatentStructure:[['batch_size'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1], VaeDecodeStructureTrellis2:[['samples','vae','resolution'],1],
  Trellis2ShapeStage:[['positive','negative','voxel'],3], Trellis2UpsampleStage:[['positive','negative','shape_latent','vae','target_resolution'],3], Trellis2TextureStage:[['positive','negative','shape_latent'],3],
  VaeDecodeShapeTrellis:[['samples','vae'],2], VaeDecodeTextureTrellis:[['samples','vae','shape_subdivides'],1], DecimateMesh:[['mesh','target_face_count','placement_mode'],1],
  MeshSmoothNormals:[['mesh','crease_angle'],1], PaintMesh:[['mesh','voxel_colors'],1], SaveGLB:[['mesh','filename_prefix'],0],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
let unets = ['qwen_image_edit_fp8_e4m3fn.safetensors'];
const OI = () => ({CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal','simple'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}}, UNETLoader:{input:{required:{unet_name:C(unets.slice()), weight_dtype:C(['default'])}}},
  CLIPVisionLoader:{input:{required:{clip_name:C(['dino_v3_L_naf_fp32.safetensors'])}}}, VAELoader:{input:{required:{vae_name:C(['trellis_2_shape_vae_bf16.safetensors','trellis_2_texture_vae_bf16.safetensors'])}}},
  LoadBackgroundRemovalModel:{input:{required:{bg_removal_name:C(['birefnet.safetensors'])}}}, Pixal3DMultiViewConditioning:{input:{required:{}}}, SaveGLB:{input:{required:{}}},
  DecimateMesh:{input:{required:{}}}, MeshSmoothNormals:{input:{required:{}}}, LoadImage:{input:{required:{}}}});
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.route('https://unpkg.com/**', r => r.fulfill({ contentType:'text/javascript', body:'customElements.define("model-viewer", class extends HTMLElement{})' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  const sent = [], dls = []; let jobs = [], polls = 0;
  await page.route(RENDER + '/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI() });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname==='/renderdeck/download'){ const b = JSON.parse(r.request().postData()); dls.push(b); jobs = [{name:b.url.split('/').pop(), status:'downloading', done:2 * 1073741824, total:5584555824}]; return r.fulfill({ json:jobs[0] }); }
    if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{version:2, jobs} });
    if(u.pathname==='/prompt'){ const b = JSON.parse(r.request().postData()); sent.push(b); return r.fulfill({ json:{prompt_id:'m' + sent.length, number:0, node_errors:{}} }); }
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = sent[0].prompt, save = Object.keys(g).find(k => g[k].class_type==='SaveGLB');
      if(++polls < 2) return r.fulfill({ json:{} });
      return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:{[save]:{'3d':[{filename:'Levi_00001_.glb', subfolder:'RenderDeck/characters/3d', type:'output'}]}}}} }); }
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', RENDER + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(srv => { closeSheets(); const v = (id, a) => ({id, angle:a, img:'levi_' + a + '.png', url:srv + '/view?filename=levi_' + a + '.png', home:srv});
    S.chars = [{id:'c1', name:'Levi', tags:'1boy', color:'#ff5ca8', views:[v('v0','ref'), v('v1','front'), v('v2','side'), v('v3','back'), v('v4','face')]}]; save(); }, RENDER);
  await page.click('#charBtn'); await page.click('#charBody [data-open="c1"]');
  ok(/everything but the model itself: 5\.6 GB/.test(await page.textContent('#charBody')), 'without Pixal3D on Render it offers the one 5.6 GB download');
  await page.click('#charBody [data-ch="get3d"]');
  ok(dialogs.length===1 && /5\.6 GB/.test(dialogs[0]) && /carries on/.test(dialogs[0]), 'it asks first: ' + dialogs[0]);
  await page.waitForTimeout(300);
  ok(dls.length===1 && dls[0].kind==='diffusion_models' && /Comfy-Org\/Pixal3D\/resolve\/main\/diffusion_models\/pixal3d_multiview_int8_convrot\.safetensors$/.test(dls[0].url), 'the helper is asked for the Pixal3D model into diffusion_models');
  await page.waitForFunction(() => /Downloading Pixal3D on .* 2\.1 of 5\.6 GB/.test(document.querySelector('#charBody').textContent), null, {timeout:9000}).catch(() => {});
  ok(/2\.1 of 5\.6 GB/.test(await page.textContent('#charBody')), 'the card follows the download');
  unets.push('pixal3d_multiview_int8_convrot.safetensors'); jobs[0].status = 'done';
  await page.waitForSelector('#charBody [data-ch="make3d"]', {timeout:9000});
  ok(/Front, Side, Back pictures/.test(await page.textContent('#charBody')), 'once it is there, Make 3D model uses the front, side and back');
  await page.click('#charBody [data-seg="side3d"][data-v="right"]');
  await page.click('#charBody [data-ch="make3d"]');
  await page.waitForSelector('#charBody model-viewer', {timeout:12000});
  const g = sent[0].prompt, nodes = Object.values(g), pc = nodes.find(n => n.class_type==='Pixal3DMultiViewConditioning').inputs;
  ok(sent.length===1 && check(g).length===0, 'the 3D graph is valid: ' + check(g).join('; '));
  const img = slot => g[g[g[pc[slot][0]].inputs.images[0]] ? pc[slot][0] : ''] && g[g[pc[slot][0]].inputs.images[0]].inputs.image;
  ok(img('front')==='levi_front.png' && img('right')==='levi_side.png' && img('back')==='levi_back.png' && !pc.left, 'front, back, and the side as their right side');
  ok(nodes.find(n => n.class_type==='SaveGLB').inputs.filename_prefix==='RenderDeck/characters/3d/Levi', 'saved under RenderDeck/characters/3d');
  const src = await page.getAttribute('#charBody model-viewer', 'src');
  ok(/filename=Levi_00001_\.glb/.test(src) && /subfolder=RenderDeck%2Fcharacters%2F3d/.test(src), 'the finished model is shown on the card: ' + src);
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
