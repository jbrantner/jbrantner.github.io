// Turnaround from the 3D model: the phone spins the grey model into an outline video (white on black, an MJPEG .avi
// ComfyUI's Load Video reads), sends it to Render, and MiniMax H3 paints the spin through its Fun ControlNet with the
// Front picture as the look. Checked with a wide, thin box: its outline is wide at the start and narrow a quarter in.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os'), { execFileSync } = require('child_process');
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
const HX = 0.2, HY = 0.5, HZ = 0.06; // wide and thin, so front and side look different
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
const OI = () => ({CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal','simple'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}}, LoraLoaderModelOnly:{input:{required:{lora_name:C(['minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors','AFK_MMH3_minimaxh3_3350370_epoch_10.safetensors','AFKJ Style Illustrious Claude.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors','DasiwaMinimaxH3_dasiwaHybridV2_int8.safetensors','minimax_h3_fl2va_pruned_int8_convrot.safetensors','DasiwaMinimaxH3_anime_v3.safetensors']), weight_dtype:C(['default'])}}},
  CLIPLoader:{input:{required:{clip_name:C(['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']), type:C(['minimax'])}}}, VAELoader:{input:{required:{vae_name:C(['minimax_h3_video_vae_fp16.safetensors'])}}},
  ModelPatchLoader:{input:{required:{name:C(['minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors'])}}},
  MiniMaxH3ReferenceToVideo:{input:{required:{}}}, MiniMaxH3AddGuide:{input:{required:{}}}, MiniMaxH3FunControlNetApply:{input:{required:{}}}, LoadVideo:{input:{required:{}}}, GetVideoComponents:{input:{required:{}}},
  ResizeAndPadImage:{input:{required:{}}}, SaveVideo:{input:{required:{}}}, CreateVideo:{input:{required:{}}}, LoadImage:{input:{required:{}}}});
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
    if(u.pathname==='/view' && fn.endsWith('.mp4')){ const n = +/_(\d+)_\.mp4$/.exec(fn)[1]; // two clips on disk; the second was written just now
      return n <= 2 ? r.fulfill({ contentType:'video/mp4', body:'', headers:Object.assign({'Last-Modified':new Date(n===2 ? Date.now() : 0).toUTCString()}, cors) }) : r.fulfill({ status:404, body:'', headers:cors }); }
    if(u.pathname==='/view'){ if(fn.endsWith('.glb')) return r.fulfill({ contentType:'model/gltf-binary', body:GLBF, headers:cors }); return r.fulfill({ contentType:'image/png', body:png(4, 4, () => [200,100,50]), headers:cors }); }
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{version:2, jobs:[]} });
    if(u.pathname==='/upload/image'){ const b = r.request().postDataBuffer(); ups.push(b); const name = /filename="([^"]+)"/.exec(b.toString('latin1'))[1]; return r.fulfill({ json:{name, subfolder:'', type:'input'}, headers:cors }); }
    if(u.pathname==='/prompt'){ sent.push(JSON.parse(r.request().postData())); return r.fulfill({ json:{prompt_id:'t' + sent.length, number:0, node_errors:{}} }); }
    if(u.pathname.startsWith('/history/')) return r.fulfill({ json:{} });
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', RENDER + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(srv => { closeSheets(); const raw = srv + '/view?filename=Box_00001_.glb&subfolder=RenderDeck%2Fcharacters%2F3d&type=output';
    S.chars = [{id:'c1', name:'Box', tags:'1girl, red coat', color:'#ff5ca8', views:[{id:'v1', angle:'front', img:'box_front.png', url:srv + '/view?filename=box_front.png', home:srv}],
      model3d:{url:raw, raw, views:{}, painted:0, eng:'hy', yaw:0, pc:srv, file:'RenderDeck/characters/3d/Box_00001_.glb', at:1}}]; save(); }, RENDER);
  await page.click('#charBtn'); await page.click('#charBody [data-open="c1"]');
  ok(/Turnaround from the 3D model/.test(await page.textContent('#charBody')) && /Plain grey/.test(await page.textContent('#charBody')), 'the card offers a turnaround from the grey 3D model');
  ok((await page.$$eval('#charBody select[data-cf="tvLora"] option', o => o.map(x => x.value))).join()===',AFK_MMH3_minimaxh3_3350370_epoch_10.safetensors', 'the style LoRA list offers only MiniMax LoRAs (not Turbo, not SDXL ones)');
  await page.selectOption('#charBody select[data-cf="tvLora"]', 'AFK_MMH3_minimaxh3_3350370_epoch_10.safetensors');
  await page.fill('#charBody [data-cf="tvLoraW"]', '0.8'); await page.fill('#charBody [data-cf="tvLoraWords"]', 'AFKJ Style');
  await page.click('#charBody [data-ch="maketurn3d"]');
  await page.waitForFunction(() => document.querySelector('#charBody') && /Making the turnaround/.test(document.querySelector('#charBody').textContent), null, {timeout:60000}).catch(() => {});
  const g = sent.length ? sent[0].prompt : {}, by = c => Object.values(g).filter(n => n.class_type===c);
  const up = ups.find(b => /\.avi"/.test(b.toString('latin1'))), name = up && /filename="([^"]+)"/.exec(up.toString('latin1'))[1];
  ok(up && /^rdspin_c1_.*\.avi$/.test(name), 'the spin is sent to Render as an .avi: ' + name);
  const cn = by('MiniMaxH3FunControlNetApply')[0];
  const sl = cn ? g[cn.inputs.model[0]] : {inputs:{model:[0]}};
  ok(cn && cn.inputs.strength===1 && g[cn.inputs.model_patch[0]].inputs.name==='minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors' && g[cn.inputs.control_video[0]].class_type==='GetVideoComponents'
    && g[g[cn.inputs.control_video[0]].inputs.video[0]].inputs.file===name, 'its frames steer the clip through the Fun ControlNet at 1.0');
  ok(g[sl.inputs.model[0]].class_type==='LoraLoaderModelOnly' && g[sl.inputs.model[0]].inputs.lora_name==='minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors' && g[g[sl.inputs.model[0]].inputs.model[0]].inputs.unet_name==='DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors' && by('BasicScheduler')[0].inputs.steps===4,
    'Turbo by default (a turnaround has no acting to lose): Turbo model + 4-step LoRA');
  ok(sl.class_type==='LoraLoaderModelOnly' && sl.inputs.lora_name==='AFK_MMH3_minimaxh3_3350370_epoch_10.safetensors' && sl.inputs.strength_model===0.8 && /^AFKJ Style\. <Picture 1>/.test(by('MiniMaxH3ReferenceToVideo')[0].inputs.prompt),
    'the picked style LoRA sits before the ControlNet at 0.8, its activation words open the prompt');
  ok(g[by('BasicGuider')[0].inputs.model[0]]===cn && !by('MiniMaxH3AddGuide').length && g[by('MiniMaxH3ReferenceToVideo')[0].inputs['ref_images.ref_image_0'][0]].inputs.image==='box_front.png',
    'the patched model samples it; the Front picture is the look, nothing pinned (it might not line up with the model)');
  if(up){
    const at = up.indexOf(Buffer.from('RIFF')), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spin')), f = path.join(tmp, 'spin.avi'); fs.writeFileSync(f, up.slice(at));
    const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', f]).toString()).streams[0];
    ok(pr.codec_name==='mjpeg' && pr.width===576 && pr.height===1024 && +pr.nb_read_frames===124 && pr.r_frame_rate==='24/1', 'ffmpeg reads it: MJPEG 576x1024, 124 frames, 24 fps');
    const span = i => { const o = path.join(tmp, 'f' + i + '.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', 'select=eq(n\\,' + i + '),format=rgb24', '-frames:v', '1', o]);
      const im = unpng(fs.readFileSync(o)); let x0 = 1, x1 = 0, y0 = 1, y1 = 0, white = 0;
      for(let y = 0; y < 1; y += 1 / 256) for(let x = 0; x < 1; x += 1 / 576){ if(im.at(x, y)[0] > 128){ white++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
      return {w:x1 - x0, h:y1 - y0, white}; };
    const a = span(0), b = span(31), c = span(62);
    console.log('   outline spans', JSON.stringify([a, b, c]));
    ok(a.h > 0.8 && a.h < 0.9 && b.h > 0.8, 'the whole body is in frame, 86% of the height');
    ok(a.w > 2.5 * b.w && Math.abs(a.w - c.w) < 0.05, 'wide from the front, narrow a quarter of the way round, wide again from the back');
  }
  // ComfyUI restarted after the clip was saved: it no longer knows the job, so the clip is found by its file
  await page.waitForFunction(() => S.chars[0].turn && S.chars[0].turn.url, null, {timeout:20000}).catch(() => {});
  const tu = await page.evaluate(() => S.chars[0].turn);
  ok(/Box_00002_\.mp4/.test(tu.url || '') && /subfolder=RenderDeck%2Fcharacters%2Fturn/.test(tu.url) && tu.model && !tu.making, 'a clip saved before a ComfyUI restart is still found: ' + JSON.stringify(tu).slice(0, 200));
  // a picked video model is used instead (from the 3D model too); a Turbo pick runs 4 steps with the Turbo LoRA
  await page.evaluate(() => { for(const k in MTV) delete MTV[k]; S.chars[0].turn = {}; drawChars(); });
  ok((await page.$$eval('#charBody select[data-cf="tvModel"] option', o => o.map(x => x.value))).join()===',DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors,DasiwaMinimaxH3_dasiwaHybridV2_int8.safetensors,DasiwaMinimaxH3_anime_v3.safetensors', 'the video model list has the MiniMax models that take a picture (not first/last-frame ones)');
  const pickG = (name, ctl) => page.evaluate(([n, ctl]) => { const c = S.chars[0]; c.tvModel = n; const g = Object.values(turnVideoGraph(kitTurn(), 'x.png', c, false, ctl).g);
    return {un:g.find(x => x.class_type==='UNETLoader').inputs.unet_name, steps:g.find(x => x.class_type==='BasicScheduler').inputs.steps, loras:g.filter(x => x.class_type==='LoraLoaderModelOnly').map(x => x.inputs.lora_name)}; }, [name, ctl]);
  const a1 = await pickG('DasiwaMinimaxH3_anime_v3.safetensors', 'spin.avi'), a2 = await pickG('DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors', null), a3 = await pickG('', null);
  ok(a1.un==='DasiwaMinimaxH3_anime_v3.safetensors' && a1.steps===20 && !a1.loras.some(l => /turbo/.test(l)), 'a picked full model runs 20 steps: ' + JSON.stringify(a1));
  ok(a2.steps===4 && a2.loras[0]==='minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors' && a3.un===a2.un && a3.steps===4, 'a Turbo model (picked, or the automatic one) runs 4 steps with the Turbo LoRA');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
