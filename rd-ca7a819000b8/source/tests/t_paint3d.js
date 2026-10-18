// Painting the 3D model from the pictures: with ComfyUI's texture-map nodes the 3D graph unwraps the model, and keeps
// the cut-out views and their masks; the app then projects each view onto the texture (rig cameras, depth tested),
// uploads the painted .glb to the same computer and shows it. Checked with a box whose faces each get one picture.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const RENDER = 'https://jordo-desktop.test';
const C = a => [a];
// ---- tiny PNG writer / reader ----
const crcT = Array.from({length:256}, (_, n) => { let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for(const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cr]); };
function png(w, h, f){ const raw = Buffer.alloc((w * 3 + 1) * h); for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ const c = f(x, y); c.forEach((v, i) => raw[y * (w * 3 + 1) + 1 + x * 3 + i] = v); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
function unpng(buf){ let p = 8, w, h, ct, idat = []; while(p < buf.length){ const len = buf.readUInt32BE(p), t = buf.slice(p+4, p+8).toString();
    if(t==='IHDR'){ w = buf.readUInt32BE(p+8); h = buf.readUInt32BE(p+12); ct = buf[p+17]; } if(t==='IDAT') idat.push(buf.slice(p+8, p+8+len)); p += 12 + len; }
  const bpp = ct===6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), st = w * bpp, out = Buffer.alloc(st * h);
  for(let y = 0; y < h; y++){ const f = raw[y * (st + 1)]; for(let x = 0; x < st; x++){ const r = raw[y * (st + 1) + 1 + x], a = x >= bpp ? out[y*st + x - bpp] : 0, b = y ? out[(y-1)*st + x] : 0, c = x >= bpp && y ? out[(y-1)*st + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2*c), pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[y*st + x] = (r + [0, a, b, (a + b) >> 1, pr][f]) & 255; } }
  return {w, h, at:(u, v) => { const x = Math.min(w-1, Math.floor(u * w)), y = Math.min(h-1, Math.floor(v * h)); return [...out.slice(y*st + x*bpp, y*st + x*bpp + 3)]; }}; }
// ---- a box, each face its own island of the texture map (3 x 2 cells) ----
const HX = 0.25, HY = 0.5, HZ = 0.25;
const FACES = { // name: [normal, u axis (picture right as seen from outside), v axis (picture down)], cell
  front:[[0,0,1],[1,0,0],[0,-1,0],0], back:[[0,0,-1],[-1,0,0],[0,-1,0],1], left:[[1,0,0],[0,0,-1],[0,-1,0],2], right:[[-1,0,0],[0,0,1],[0,-1,0],3], top:[[0,1,0],[1,0,0],[0,0,1],4], bottom:[[0,-1,0],[1,0,0],[0,0,-1],5]};
const H = [HX, HY, HZ];
const cellUv = (cell, a, b) => [(cell % 3 + 0.1 + 0.8 * a) / 3, (Math.floor(cell / 3) + 0.1 + 0.8 * b) / 2];
function boxGlb(){
  const P = [], N = [], T = [], I = [];
  for(const [nm, [n, u, v, cell]] of Object.entries(FACES)){ const b0 = P.length / 3;
    for(const [a, b] of [[0,0],[1,0],[1,1],[0,1]]) { for(let i = 0; i < 3; i++) P.push((n[i] + u[i] * (2*a - 1) + v[i] * (2*b - 1)) * H[i]); N.push(...n); T.push(...cellUv(cell, a, b)); }
    I.push(b0, b0+2, b0+1, b0, b0+3, b0+2); }
  const tex = png(64, 64, () => [128,128,128]);
  const parts = [new Float32Array(P), new Float32Array(N), new Float32Array(T), new Uint32Array(I)].map(a => Buffer.from(a.buffer)), all = [];
  let off = 0; const views = [];
  for(const b of [...parts, tex]){ views.push({buffer:0, byteOffset:off, byteLength:b.length}); const pad = (4 - b.length % 4) % 4; all.push(b, Buffer.alloc(pad)); off += b.length + pad; }
  const bin = Buffer.concat(all), json = {asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}], buffers:[{byteLength:bin.length}], bufferViews:views,
    accessors:[{bufferView:0, componentType:5126, count:P.length/3, type:'VEC3', min:[-HX,-HY,-HZ], max:[HX,HY,HZ]}, {bufferView:1, componentType:5126, count:N.length/3, type:'VEC3'},
      {bufferView:2, componentType:5126, count:T.length/2, type:'VEC2'}, {bufferView:3, componentType:5125, count:I.length, type:'SCALAR'}],
    meshes:[{primitives:[{attributes:{POSITION:0, NORMAL:1, TEXCOORD_0:2}, indices:3, material:0}]}], materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}], textures:[{source:0}], images:[{bufferView:4, mimeType:'image/png'}]};
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const hd = Buffer.alloc(12); hd.writeUInt32LE(0x46546C67, 0); hd.writeUInt32LE(2, 4); hd.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, t) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(t, 4); return b; };
  return Buffer.concat([hd, ch(js.length, 0x4E4F534A), js, ch(bin.length, 0x004E4942), bin]);
}
function readGlbTexture(buf){ const jl = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + jl).toString()), bin = buf.slice(20 + jl + 8);
  const im = json.images[json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index].source], bv = json.bufferViews[im.bufferView];
  return unpng(bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)); }
// the cut-out views: the front split in quarters to check which way round it lands, the others one colour each
const Q = {tl:[255,0,0], tr:[255,0,255], bl:[255,128,0], br:[0,255,255]};
const PICS = {front:png(256, 256, (x, y) => Q[(y < 128 ? 't' : 'b') + (x < 128 ? 'l' : 'r')]), back:png(256, 256, () => [0,0,255]), left:png(256, 256, () => [0,200,0]), right:png(256, 256, () => [255,255,0])};
const MASK = png(256, 256, () => [255,255,255]);
const OI = () => ({CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal','simple'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}}, UNETLoader:{input:{required:{unet_name:C(['pixal3d_multiview_int8_convrot.safetensors']), weight_dtype:C(['default'])}}},
  CLIPVisionLoader:{input:{required:{clip_name:C(['dino_v3_L_naf_fp32.safetensors'])}}}, VAELoader:{input:{required:{vae_name:C(['trellis_2_shape_vae_bf16.safetensors','trellis_2_texture_vae_bf16.safetensors'])}}},
  LoadBackgroundRemovalModel:{input:{required:{bg_removal_name:C(['birefnet.safetensors'])}}}, Pixal3DMultiViewConditioning:{input:{required:{}}}, SaveGLB:{input:{required:{}}},
  DecimateMesh:{input:{required:{}}}, MeshSmoothNormals:{input:{required:{}}}, LoadImage:{input:{required:{}}}, CFGOverride:{input:{required:{}}}, RescaleCFG:{input:{required:{}}},
  RemeshMesh:{input:{required:{}}}, UnwrapMesh:{input:{required:{segmenter:C(['pec','adaptive'])}}}, BakeTextureFromVoxel:{input:{required:{}}}, ApplyTextureToMesh:{input:{required:{}}}, MaskToImage:{input:{required:{}}}, SaveImage:{input:{required:{}}}});
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch({args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource|WebGL|GPU stall/.test(m.text())) logs.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.route('https://unpkg.com/**', r => r.fulfill({ contentType:'text/javascript', body:'customElements.define("model-viewer", class extends HTMLElement{})' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  const sent = [], ups = [], GLBF = boxGlb(), cors = {'Access-Control-Allow-Origin':'*'};
  await page.route(RENDER + '/**', async r => {
    const u = new URL(r.request().url()), fn = u.searchParams.get('filename') || '';
    if(u.pathname==='/object_info') return r.fulfill({ json:OI() });
    if(u.pathname==='/view'){ if(fn.endsWith('.glb')) return r.fulfill({ contentType:'model/gltf-binary', body:GLBF, headers:cors });
      const m = /_(front|back|left|right)(_mask)?_/.exec(fn); return r.fulfill({ contentType:'image/png', body:m ? (m[2] ? MASK : PICS[m[1]]) : png(1, 1, () => [9,9,9]), headers:cors }); }
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{version:2, jobs:[]} });
    if(u.pathname==='/upload/image'){ const b = r.request().postDataBuffer(); ups.push(b); const name = /filename="([^"]+)"/.exec(b.toString('latin1'))[1]; return r.fulfill({ json:{name, subfolder:'', type:'input'}, headers:cors }); }
    if(u.pathname==='/prompt'){ const b = JSON.parse(r.request().postData()); sent.push(b); return r.fulfill({ json:{prompt_id:'m' + sent.length, number:0, node_errors:{}} }); }
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = sent[0].prompt, outputs = {};
      for(const [k, n] of Object.entries(g)){ if(n.class_type==='SaveGLB') outputs[k] = {'3d':[{filename:'Box_00001_.glb', subfolder:'RenderDeck/characters/3d', type:'output'}]};
        if(n.class_type==='SaveImage'){ const pre = n.inputs.filename_prefix.split('/').pop(); outputs[k] = {images:[{filename:pre + '_00001_.png', subfolder:'RenderDeck/characters/3d/views', type:'output'}]}; } }
      return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs}} }); }
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', RENDER + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(srv => { closeSheets(); const v = (id, a) => ({id, angle:a, img:'box_' + a + '.png', url:srv + '/view?filename=box_' + a + '.png', home:srv});
    S.chars = [{id:'c1', name:'Box', tags:'', color:'#ff5ca8', views:[v('v1','front'), v('v2','left'), v('v3','back'), v('v4','right')]}]; save(); }, RENDER);
  await page.click('#charBtn'); await page.click('#charBody [data-open="c1"]');
  await page.click('#charBody [data-ch="make3d"]');
  const g = () => sent[0].prompt, by = c => Object.values(g()).filter(n => n.class_type===c);
  await page.waitForFunction(() => S.chars[0].model3d && S.chars[0].model3d.painted, null, {timeout:30000}).catch(() => {});
  ok(by('UnwrapMesh').length===1 && by('BakeTextureFromVoxel').length===1 && by('ApplyTextureToMesh').length===1 && !by('PaintMesh').length, 'the model gets a real texture map (unwrap, bake, apply), not painted points');
  ok(by('CFGOverride').length===2 && by('RescaleCFG').length===2 && by('Trellis2UpsampleStage')[0].inputs.target_resolution===1536 && by('RemeshMesh').length===1, "ComfyUI's template settings: eased guidance, 1536 upsample, remesh");
  ok(by('SaveImage').length===8 && by('MaskToImage').length===4, 'the four cut-out views and their masks are kept');
  const m3 = await page.evaluate(() => S.chars[0].model3d);
  ok(m3.painted && /filename=rd3d_c1_.*\.glb/.test(m3.url) && /Box_00001_\.glb/.test(m3.raw) && Object.keys(m3.views).length===4, 'the painted copy is uploaded and shown: ' + JSON.stringify(m3).slice(0, 300));
  const body = ups.length ? ups[0] : Buffer.alloc(0), at = body.indexOf(Buffer.from('glTF'));
  if(at >= 0){
    const tx = readGlbTexture(body.slice(at)), face = (nm, a, b) => tx.at(...cellUv(FACES[nm][3], a, b)), near = (c, want) => c.every((v, i) => Math.abs(v - want[i]) < 40);
    console.log('   front quarters', face('front', 0.25, 0.25), face('front', 0.75, 0.25), face('front', 0.25, 0.75), face('front', 0.75, 0.75), 'left', face('left', 0.5, 0.5), 'back', face('back', 0.5, 0.5), 'right', face('right', 0.5, 0.5), 'top', face('top', 0.5, 0.5));
    ok(tx.w===2048 && near(face('front', 0.25, 0.25), Q.tl) && near(face('front', 0.75, 0.25), Q.tr) && near(face('front', 0.25, 0.75), Q.bl) && near(face('front', 0.75, 0.75), Q.br), 'the front picture lands on the front the right way round');
    ok(near(face('left', 0.5, 0.5), [0,200,0]) && near(face('back', 0.5, 0.5), [0,0,255]) && near(face('right', 0.5, 0.5), [255,255,0]), 'left, back and right pictures land on their sides');
    ok(!near(face('top', 0.5, 0.5), [0,0,0]), 'the top, which no picture faces, is filled from around it');
  } else ok(false, 'no painted .glb was uploaded');
  if(at >= 0){ const b2 = body.slice(at), jl = b2.readUInt32LE(12), js = JSON.parse(b2.slice(20, 20 + jl).toString()), mt = js.materials[0];
    ok(mt.extensions && mt.extensions.KHR_materials_unlit && mt.pbrMetallicRoughness.metallicFactor===0 && !mt.pbrMetallicRoughness.metallicRoughnessTexture, 'the painted model is flat (unlit, no metal), like the drawings'); }
  // Hunyuan3D-2mv: once the computer has its nodes and model it is the default shape model, painted the same way
  await page.evaluate(() => { const oi = allPcs()[0].oi; oi.Hunyuan3Dv2ConditioningMultiView = {input:{required:{}}}; oi.ImageOnlyCheckpointLoader = {input:{required:{ckpt_name:[['hunyuan3d-dit-v2-mv_fp16.safetensors']]}}};
    ['CLIPVisionEncode','ModelSamplingAuraFlow','EmptyLatentHunyuan3Dv2','VAEDecodeHunyuan3D','VoxelToMesh','EmptyImage'].forEach(c => oi[c] = {input:{required:{}}}); drawChars(); });
  ok(await page.$eval('#charBody [data-seg="eng3d"].on', b => b.dataset.v)==='hy', 'Hunyuan3D-2mv is offered and picked first');
  sent.length = 0; ups.length = 0;
  await page.click('#charBody [data-ch="make3d"]');
  await page.waitForFunction(() => S.chars[0].model3d.eng==='hy' && S.chars[0].model3d.painted, null, {timeout:30000}).catch(() => {});
  const hc = by('Hunyuan3Dv2ConditioningMultiView')[0];
  ok(hc && ['front','left','back','right'].every(k => g()[hc.inputs[k][0]].class_type==='CLIPVisionEncode') && by('ImageOnlyCheckpointLoader')[0].inputs.ckpt_name==='hunyuan3d-dit-v2-mv_fp16.safetensors'
    && by('ImageCropToMask').filter(n => n.inputs.background==='#ffffff').length===4 && !by('UNETLoader').length, 'the Hunyuan graph: four views cut out on white, multi-view conditioning, its own checkpoint');
  ok(by('VoxelToMesh').length===1 && by('UnwrapMesh').length===1 && by('ApplyTextureToMesh').length===1 && by('SaveImage').length===8, 'its mesh gets a blank texture map, and the views are kept for painting');
  ok(ups.length===1 && (await page.evaluate(() => S.chars[0].model3d.url)).includes('rd3d_'), 'and it is painted from the pictures too');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
