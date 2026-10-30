// 🤸 Pose (rig/pose.html, Jordan 2026-10-29): describe → Make pose (Z-Image, 4 at a time) → pick → Create pose (SAM 3D Body's 3D body) → drag its
// joints → Render with a library character or your own words → save it to the pose library. Run with RIG_DEPS like t_scene.js and SAM_GLB
// (a body GLB from SAM 3D Body; not kept in the repo).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '';
(async () => {
  if(!process.env.SAM_GLB){ console.log('SAM_GLB is needed (a body GLB from SAM 3D Body)'); process.exit(1); }
  const html = fs.readFileSync(path.join(__dirname, '..', 'pose.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:844} });
  const logs = []; page.on('pageerror', e => { logs.push('PAGEERROR ' + e.message); if(process.env.DBG) console.log('PAGEERROR', e.message); }); if(process.env.DBG) page.on('console', m => console.log('C', m.text())); page.on('dialog', d => d.accept());
  await page.route('https://app.test/rig/pose.html*', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route(/https:\/\/app\.test\/rig\/(body|hair|look|bvh)\.js/, r => r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(path.join(__dirname, '..', new URL(r.request().url()).pathname.split('/').pop())) }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  const H = {'access-control-allow-origin':'*'};
  const lib = {name:'Ellie', subfolder:'Character Library/Ellie', trigger:'elliex', lora:'elliex.safetensors', style:'AFKJ Style Illustrious Claude.safetensors', prompt:'elliex, 1girl, solo', tags:'1girl, solo, blue hair, standing, full body', ckpt:'iriselTouchIL_v10.safetensors'};
  const store = new Map(), GRAPHS = []; let samMiss = false;
  const OI = {UNETLoader:['unet_name', ['z_image_turbo_bf16.safetensors', 'rt_detr_v4-x-hgnet_fp32.safetensors']], CLIPLoader:['clip_name', ['qwen_3_4b.safetensors']], VAELoader:['vae_name', ['ae.safetensors']],
    SAM3DBody_Loader:['model_file', ['sam_3d_body_dinov3_int8_convrot.safetensors']], SAM3DBody_Predict:['image', ['x']], BuildPoseFile:['format', ['x']], LoadMoGeModel:['model_name', ['moge_2_vitl_normal_fp16.safetensors']],
    CheckpointLoaderSimple:['ckpt_name', ['iriselTouchIL_v10.safetensors', 'other.safetensors']], LoraLoader:['lora_name', ['elliex.safetensors', 'AFKJ Style Illustrious Claude.safetensors']], ControlNetLoader:['control_net_name', ['diffusion_pytorch_model_promax.safetensors']], DepthAnythingV2Preprocessor:['image', ['x']], AnimeLineArtPreprocessor:['image', ['x']], RemoveBackground:['image', ['x']], LoadBackgroundRemovalModel:['bg_removal_name', ['BiRefNet-general.safetensors']]};
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url()), J = b => r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(b) });
    if(u.pathname==='/renderdeck/library') return J({library:1, kinds:['char', 'obj'], characters:[lib]});
    if(u.pathname==='/renderdeck/scenes') return J({scenes:[...store.values()]});
    if(u.pathname==='/renderdeck/scenes/save'){ const b = JSON.parse(r.request().postData()); store.set(b.scene.id, b.scene); return J({ok:true}); }
    if(u.pathname==='/object_info/DWPreprocessor') return J({DWPreprocessor:{input:{required:{image:['IMAGE']}, optional:{detect_hand:[['enable', 'disable'], {default:'enable'}], detect_body:[['enable', 'disable'], {default:'enable'}], detect_face:[['enable', 'disable'], {default:'enable'}], resolution:['INT', {default:512}], bbox_detector:[['yolox_l.onnx', 'None'], {default:'yolox_l.onnx'}]}}}});
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return J(d ? {[oi[1]]:{input:{required:{[d[0]]:[d[1]]}}}} : {}); }
    if(u.pathname==='/upload/image'){ const m = r.request().postDataBuffer().toString('latin1').match(/filename="([^"]+)"/); return J({name:m && m[1]}); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return J({prompt_id:'p' + GRAPHS.length}); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[+hi[1].slice(1) - 1], ks = k => Object.keys(g).filter(n => g[n].class_type===k), ok = o => J({[hi[1]]:{status:{status_str:'success', completed:true}, outputs:o}});
      if(ks('Save3DAdvanced').length && samMiss && g[ks('RTDETR_detect')[0]].inputs.threshold===0.5) return J({[hi[1]]:{status:{status_str:'error', completed:false, messages:[['execution_error', {node_type:'BuildPoseFile', exception_message:'build_glb_skeletal: no valid tracks in pose_data'}]]}}});
      if(ks('Save3DAdvanced').length) return ok({[ks('Save3DAdvanced')[0]]:{'3d':[{filename:'body_00001.glb', subfolder:'Output_Render\\RenderDeck\\pose', type:'output'}], camera_info:[null], model_3d_info:[]}});
      if(ks('SaveImage').length > 1) return ok(Object.fromEntries(ks('SaveImage').map((k, i) => [k, {images:[{filename:'photo_' + GRAPHS.length + '_' + i + '.png', subfolder:'RenderDeck/pose', type:'output'}]}])));
      return ok({[ks('SaveImage')[0]]:{images:[0, 1, 2, 3].map(i => ({filename:'ellie_' + i + '.png', subfolder:'RenderDeck/pose', type:'output'}))}}); }
    if(u.pathname==='/view' && /\.glb$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'model/gltf-binary', headers:H, body:fs.readFileSync(process.env.SAM_GLB) });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#eee"/><rect x="130" y="40" width="40" height="320" fill="#888"/></svg>' });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  const shot = async n => { if(process.env.SHOT){ await page.waitForTimeout(300); await page.screenshot({path:process.env.SHOT + '/pp-' + n + '.png'}); } };
  await page.goto('https://app.test/rig/pose.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})); window.RENDER_POLL = 50; });
  await page.addInitScript(() => { window.RENDER_POLL = 50; });
  await page.goto('https://app.test/rig/pose.html'); await page.waitForTimeout(800);
  const t0 = await page.evaluate(() => ({hint:!document.querySelector('#hint').hidden, make:document.querySelector('#makeb').disabled, tabs:[...document.querySelectorAll('[data-step]')].map(b => b.disabled), save:document.querySelector('#saveb').disabled}));
  ok(!t0.hint && t0.make && t0.tabs.join()==='false,true,true,true' && t0.save, 'a new pose: describe it first; Tweak, Render and Save wait for a pose: ' + JSON.stringify(t0)); await shot('new');
  // 1 Make
  await page.fill('#desc', 'crouching down with her chin on her fists'); await page.click('#makeb');
  await page.waitForFunction(() => document.querySelectorAll('[data-pick]').length===4, null, {timeout:20000});
  const z = Object.values(GRAPHS[0]), txt = z.find(n => n.class_type==='CLIPTextEncode').inputs.text;
  ok(z.filter(n => n.class_type==='KSampler').length===4 && z.find(n => n.class_type==='CLIPLoader').inputs.type==='lumina2' && /chin on her fists/.test(txt) && /whole body/.test(txt), '📸 Make pose: Z-Image Turbo paints 4 people in the pose: ' + txt);
  ok(await page.evaluate(() => !document.querySelector('#desc') && !document.querySelector('#pmodel') && !!document.querySelector('#moreb') && !!document.querySelector('#editb') && document.querySelector('#createb').disabled), 'then the pictures take the place of the words (＋ 4 more, ✏️), and Create pose waits for a pick');
  await page.click('#moreb'); await page.waitForFunction(() => document.querySelectorAll('[data-pick]').length===8, null, {timeout:20000});
  ok(GRAPHS.length===2, '＋ 4 more adds 4 more pictures (8 now)'); await shot('photos');
  await page.click('[data-pick="5"]'); await page.click('#createb');
  await page.waitForFunction(() => window.POSEPAGE.BODY && document.querySelector('[data-step="tweak"]').getAttribute('aria-selected')==='true', null, {timeout:30000});
  const sg = Object.values(GRAPHS[2]), li = sg.find(n => n.class_type==='LoadImage').inputs.image, bp = sg.find(n => n.class_type==='BuildPoseFile').inputs;
  ok(/^RenderDeck\/pose\/photo_2_1\.png \[output\]$/.test(li) && bp.format==='glb' && bp['format.mesh_style']==='body_mesh' && sg.find(n => n.class_type==='SAM3DBody_Predict').inputs.run_hand_refinement, 'Create pose: SAM 3D Body reads the picked picture and writes its 3D body: ' + li);
  const b0 = await page.evaluate(() => { const B = POSEPAGE.BODY, THREE_ = B.g.constructor; const pts = POSEPAGE.samJoints().pts, side = pts[5].clone().sub(pts[2]);
    let y0 = 1e9; B.g.updateMatrixWorld(true); const v = new pts[0].constructor(); for(let i = 0; i < B.sk.geometry.attributes.position.count; i += 9){ B.sk.getVertexPosition(i, v); v.applyMatrix4(B.sk.matrixWorld); y0 = Math.min(y0, v.y); }
    return {floor:+y0.toFixed(3), faces:+(side.x / side.length()).toFixed(2), dots:POSEPAGE.DOTS.length, head:B.bn.bone_113.scale.x, rot:Object.keys(POSEPAGE.P.rot || {}).length}; });
  ok(Math.abs(b0.floor) < 0.02 && b0.faces > 0.8 && b0.head===1.2 && b0.rot===10, '🧍 the 3D body stands on the floor facing the front, head 1.2×, its pose kept: ' + JSON.stringify(b0)); await shot('body');
  // 2 Tweak: drag the right hand up with the finger
  const hp = await page.evaluate(() => { const d = POSEPAGE.DOTS[0], p = POSEPAGE.dotAt(d), v = p.clone().project(POSEPAGE.camera); return {x:(v.x + 1) / 2 * innerWidth, y:(1 - v.y) / 2 * innerHeight, y3:p.y}; });
  await page.mouse.move(hp.x, hp.y); await page.mouse.down(); for(let i = 1; i <= 6; i++) await page.mouse.move(hp.x, hp.y - i * 12); await page.mouse.up(); await page.waitForTimeout(200);
  const h1 = await page.evaluate(() => ({y:POSEPAGE.dotAt(POSEPAGE.DOTS[0]).y, undo:!document.querySelector('#undob').disabled, cam:POSEPAGE.camera.position.toArray().map(v => +v.toFixed(3))}));
  ok(h1.y > hp.y3 + 0.08 && h1.undo, '✋ dragging the pink hand dot raises her hand (the view stays put): ' + hp.y3.toFixed(2) + ' → ' + h1.y.toFixed(2)); await shot('tweak');
  await page.click('#undob'); const h2 = await page.evaluate(() => POSEPAGE.dotAt(POSEPAGE.DOTS[0]).y);
  ok(Math.abs(h2 - hp.y3) < 0.01, '↶ Undo puts it back');
  const kn = await page.evaluate(() => { const d = POSEPAGE.DOTS[6], a = POSEPAGE.dotAt(d), B = POSEPAGE.BODY; POSEPAGE.swing(B.bn[d.bone], a, a.clone().add(new a.constructor(0.2, 0, 0))); return {moved:POSEPAGE.dotAt(d).distanceTo(a)}; });
  ok(kn.moved > 0.1, 'a blue knee dot swings the thigh');
  await page.evaluate(() => { const s = document.querySelector('#head'); s.value = 1.4; s.dispatchEvent(new Event('input')); });
  ok(await page.evaluate(() => POSEPAGE.BODY.bn.bone_113.scale.x===1.4 && POSEPAGE.P.head===1.4), '🙂 Head size grows the head');
  // 3 Render
  await page.click('[data-step="render"]'); await page.click('#renderb'); await page.waitForTimeout(300);
  ok(/Pick a character/.test(await page.textContent('#msg')), 'my own character needs words first');
  await page.selectOption('#who', 'Character Library/Ellie'); await page.click('#renderb');
  await page.waitForFunction(() => document.querySelectorAll('[data-big]').length===4, null, {timeout:30000});
  const rg = Object.values(GRAPHS[GRAPHS.length - 1]), cn = rg.filter(n => n.class_type==='ControlNetApplyAdvanced').map(n => n.inputs.strength + '/' + n.inputs.end_percent), words = rg.find(n => n.class_type==='CLIPTextEncode').inputs.text;
  ok(rg.some(n => n.inputs.lora_name==='elliex.safetensors') && rg.find(n => n.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='iriselTouchIL_v10.safetensors' && cn.join()==='1/0.8,0.75/0.6' && /^elliex, 1girl, solo, blue hair, crouching down with her chin on her fists, full body/.test(words),
    '🎨 Render: Ellie on her model and LoRA over the body\'s skeleton and depth: ' + words + ' · ' + cn);
  const gd = await page.evaluate(() => { const G = POSEPAGE.guides(), x = G.depth.getContext('2d').getImageData(0, 0, G.W, G.H).data; let lit = 0; for(let i = 0; i < x.length; i += 4) if(x[i] > 20) lit++; window.PP_G = {d:G.depth.toDataURL(), p:G.pose.toDataURL()}; return {W:G.W, H:G.H, fill:+(lit / (G.W * G.H)).toFixed(2)}; });
  ok(gd.fill > 0.15 && gd.fill < 0.8 && gd.W % 64===0 && gd.H % 64===0, 'its depth fills the cropped guide: ' + JSON.stringify(gd));
  if(process.env.SHOT){ const G = await page.evaluate(() => window.PP_G); fs.writeFileSync(process.env.SHOT + '/pp-depth.png', Buffer.from(G.d.split(',')[1], 'base64')); fs.writeFileSync(process.env.SHOT + '/pp-skel.png', Buffer.from(G.p.split(',')[1], 'base64')); }
  await shot('render');
  // 🖼 The picture (Jordan 2026-10-30): the pose's own picture, cut out, read for depth, outlines and a DWPose skeleton
  { await page.click('[data-guide="pic"]'); const n0 = GRAPHS.length; await page.click('#renderb'); await page.waitForFunction(n0 => window.POSEPAGE && document.querySelector('#renderb') && !document.querySelector('#renderb').disabled && document.querySelectorAll('[data-big]').length===4, n0, {timeout:30000}); await page.waitForTimeout(200);
    const pg = Object.values(GRAPHS[GRAPHS.length - 1]), c = k => pg.filter(n => n.class_type===k), cn = c('ControlNetApplyAdvanced').map(n => n.inputs.strength + '/' + n.inputs.end_percent), types = c('SetUnionControlNetType').map(n => n.inputs.type), dw = c('DWPreprocessor')[0];
    const lat = c('EmptyLatentImage')[0].inputs, sc = c('ImageScale')[0].inputs;
    ok(GRAPHS.length===n0 + 1 && c('LoadImage')[0].inputs.image==='RenderDeck/pose/photo_2_1.png [output]' && c('DepthAnythingV2Preprocessor').length===1 && c('RemoveBackground').length===1 && c('ImageBlend').length===2 && c('ImageBlend').every(n => n.inputs.blend_mode==='multiply')
      && dw && dw.inputs.detect_hand==='enable' && dw.inputs.bbox_detector==='None' && types.join()==='openpose,depth,canny/lineart/anime_lineart/mlsd' && cn.join()==='0.9/0.5,0.5/0.4,0.35/0.3' && lat.width===sc.width && lat.height===sc.height && lat.width % 64===0 && lat.width < lat.height,
      '🖼 The picture: the pose\'s own picture cut out (BiRefNet) guides it: skeleton, light depth and outlines, at the picture\'s shape: ' + cn.join() + ' ' + lat.width + '×' + lat.height);
    await page.click('#linesb'); const n1 = GRAPHS.length; await page.click('#renderb'); await page.waitForFunction(n1 => document.querySelector('#renderb') && !document.querySelector('#renderb').disabled, n1, {timeout:30000}); await page.waitForTimeout(300);
    ok(!Object.values(GRAPHS[GRAPHS.length - 1]).some(n => n.class_type==='AnimeLineArtPreprocessor'), '✏️ off leaves the outlines out'); await shot('picguide');
    await page.click('#linesb'); await page.click('[data-guide="3d"]'); }
  // 4 Touch up (Jordan 2026-10-29): a render opened big → 🖌 Touch up → paint where it may change → plain inpaint tries → one back to 2 as the pose
  await page.click('[data-big="2"]'); await page.click('#bigtouch'); await page.waitForFunction(() => { const c = document.querySelector('#tmask'); return c.width===300 && !document.querySelector('#touch').hidden; }, null, {timeout:10000});
  const tw = await page.evaluate(() => ({words:document.querySelector('#twords').value, btn:document.querySelector('#touchb').textContent, pics:document.querySelectorAll('[data-tsel]').length}));
  ok(/^elliex, 1girl/.test(tw.words) && /Redo all/.test(tw.btn) && tw.pics===1, '🖌 Touch up opens the render on its own with the render\'s words: ' + JSON.stringify(tw)); await shot('touch0');
  const mb = await page.evaluate(() => { const r = document.querySelector('#tmask').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height * 0.3}; });
  await page.mouse.move(mb.x, mb.y); await page.mouse.down(); for(let i = 1; i <= 5; i++) await page.mouse.move(mb.x + i * 6, mb.y + i * 8); await page.mouse.up(); await page.waitForTimeout(100);
  ok(/Repaint marked/.test(await page.textContent('#touchb')), 'painting on it marks the part to change'); await shot('touch1');
  const n1 = GRAPHS.length; await page.click('#touchb'); await page.waitForFunction(() => document.querySelectorAll('[data-tsel]').length===5, null, {timeout:20000});
  const tg = Object.values(GRAPHS[n1]), cls = c => tg.filter(n => n.class_type===c), lm = cls('LoadImageMask')[0];
  ok(cls('KSampler').length===4 && cls('KSampler').every(n => n.inputs.denoise===0.6) && new Set(cls('KSampler').map(n => n.inputs.seed)).size===4 && cls('SetLatentNoiseMask').length===1 && cls('ImageCompositeMasked').length===4 && !cls('ControlNetApplyAdvanced').length
    && /^rd-pose-mask-/.test(lm.inputs.image) && cls('LoadImage')[0].inputs.image==='RenderDeck/pose/ellie_2.png [output]' && cls('LoraLoader').some(n => n.inputs.lora_name==='elliex.safetensors'),
    '🎨 Repaint marked: 4 inpaint tries (own seeds, 0.6, her LoRA, no pose guides), pasted back through the softened mask');
  await page.click('[data-tsel="3"]'); await page.click('#clearb'); const n2 = GRAPHS.length;
  await page.evaluate(() => { const s = document.querySelector('#den'); s.value = 0.45; s.dispatchEvent(new Event('input')); }); await page.click('[data-tn="-1"]'); await page.click('[data-tn="-1"]');
  await page.click('#touchb'); await page.waitForFunction(() => document.querySelectorAll('[data-tsel]').length===7, null, {timeout:20000});
  const tg2 = Object.values(GRAPHS[n2]);
  ok(tg2.filter(n => n.class_type==='KSampler').every(n => n.inputs.denoise===0.45) && tg2.filter(n => n.class_type==='KSampler').length===2 && !tg2.some(n => n.class_type==='SetLatentNoiseMask') && /photo_\d+_2\.png \[output\]$/.test(tg2.find(n => n.class_type==='LoadImage').inputs.image),
    'nothing painted: Redo all redoes the picked try as a whole at 0.45, 2 of them');
  await page.click('[data-tsel="6"]'); const tw2 = await page.evaluate(() => POSEPAGE.P.touch.who); samMiss = true; const n3 = GRAPHS.length; await page.click('#useb');
  await page.waitForFunction(() => window.POSEPAGE.BODY && document.querySelector('[data-step="tweak"]').getAttribute('aria-selected')==='true' && document.querySelector('#touch').hidden, null, {timeout:30000});
  samMiss = false; const ug = Object.values(GRAPHS[n3 + 1]);
  ok(tw2==='Character Library/Ellie' && GRAPHS.length===n3 + 2 && Object.values(GRAPHS[n3]).find(n => n.class_type==='RTDETR_detect').inputs.threshold===0.5 && ug.find(n => n.class_type==='RTDETR_detect').inputs.threshold===0.25,
    'touch up keeps the render\'s own character; when SAM finds nobody (an anime render) it looks again at 0.25');
  ok(ug.some(n => n.class_type==='SAM3DBody_Predict') && /photo_\d+_1\.png \[output\]$/.test(ug.find(n => n.class_type==='LoadImage').inputs.image) && await page.evaluate(() => !document.querySelector('[data-step="touch"]').disabled),
    '🦴 Use this one for the pose: SAM reads that try and the body comes back to 2 Tweak (Touch up keeps its pictures)'); await shot('touch2');
  // the library
  await page.click('#saveb'); await page.fill('#savename', 'Chin on fists'); await page.click('#saveok'); await page.waitForTimeout(400);
  const sv = [...store.values()][0];
  ok(sv && sv.kind==='posebook' && sv.name==='Chin on fists' && /^data:image\/jpeg/.test(sv.thumb) && sv.spin.length===16 && sv.spin[0]===sv.thumb && new Set(sv.spin).size===16 && sv.sam && sv.rot && sv.head===1.4 && !sv.renders, '💾 saved to the pose library on the PC (name, thumbnail, 3D body, tweaks, head size)');
  await page.click('#libb'); await page.click('#newb'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !POSEPAGE.BODY && !!document.querySelector('#desc') && POSEPAGE.P.desc===''), '＋ New pose starts clean, on the words');
  const rot = sv.rot; await page.click('#libb'); await page.waitForSelector('[data-open]'); await shot('library');
  { const r = await page.evaluate(() => { const b = document.querySelector('[data-spin]').getBoundingClientRect(); return {x:b.left + b.width / 2, y:b.top + b.height / 2, w:b.width}; }), s0 = await page.getAttribute('[data-spin]', 'src');
    await page.mouse.move(r.x, r.y); await page.mouse.down(); for(let i = 1; i <= 5; i++) await page.mouse.move(r.x - i * r.w / 10, r.y); await page.mouse.up(); await page.waitForTimeout(150);
    const s1 = await page.getAttribute('[data-spin]', 'src'), still = await page.evaluate(() => !document.querySelector('#lib').hidden); await shot('libspin');
    ok(s1!==s0 && still, '🔄 dragging across a library card turns the pose (and doesn\'t open it)'); } await page.waitForTimeout(450);
  await page.click('[data-open]');
  await page.waitForFunction(() => window.POSEPAGE.BODY, null, {timeout:20000});
  const re = await page.evaluate(r => { const B = POSEPAGE.BODY; return Object.entries(r).every(([n, q]) => B.bn[n].quaternion.toArray().every((v, i) => Math.abs(v - q[i]) < 1e-3)) && B.bn.bone_113.scale.x===1.4 && document.querySelector('#title').textContent; }, rot);
  ok(re==='🤸 Chin on fists', 'opening it from the library brings back the body as it was tweaked: ' + re);
  await page.reload(); await page.waitForFunction(() => window.POSEPAGE && POSEPAGE.BODY, null, {timeout:20000});
  ok(await page.evaluate(() => POSEPAGE.P.name==='Chin on fists' && document.querySelector('[data-step="tweak"]').getAttribute('aria-selected')==='true'), 'reopening the tab carries on with the same pose');
  await page.evaluate(() => { const ob = document.querySelector('[data-step="make"]'); ob.click(); }); await page.click('#libb'); await page.waitForSelector('[data-del]'); await page.click('[data-del]'); await page.waitForTimeout(300);
  ok([...store.values()][0].gone && await page.evaluate(() => !document.querySelector('[data-open]')), '🗑 delete takes it out of the library');
  // any model can paint the people (Jordan 2026-10-29: Z-Image repeats itself): an Illustrious model gets the same ask as tags
  { await page.click('#libx'); await page.click('[data-step="make"]'); await page.click('#editb'); await page.waitForFunction(() => document.querySelectorAll('#pmodel option').length > 1, null, {timeout:10000});
    await page.selectOption('#pmodel', 'iriselTouchIL_v10.safetensors');     await page.click('[data-n="-1"]'); await page.click('[data-shape="wide"]'); const lb = await page.evaluate(() => ({b:document.querySelector('#makeb').textContent.trim(), back:!!document.querySelector('#backb'), ask:document.querySelector('#ask').textContent})); const p0 = await page.evaluate(() => POSEPAGE.P.photos.length);
    const n0 = GRAPHS.length; await page.click('#makeb'); await page.waitForFunction(p0 => window.POSEPAGE.P.photos.length===p0 + 3, p0, {timeout:20000});
    const ig = Object.values(GRAPHS[n0]), t = ig.find(n => n.class_type==='CLIPTextEncode').inputs.text, ng = ig.filter(n => n.class_type==='CLIPTextEncode')[1].inputs.text;
    const kept = await page.evaluate(p0 => ({first:POSEPAGE.P.photos[0].from, last:POSEPAGE.P.photos[p0].from}), p0);
    ok(lb.b==='Make 3' && lb.back && /Z-Image/.test(kept.first) && /iriselTouchIL_v10$/.test(kept.last) && ig.filter(n => n.class_type==='KSampler').length===3 && new Set(ig.filter(n => n.class_type==='KSampler').map(n => n.inputs.seed)).size===3 && /^1girl, solo, crouching/.test(lb.ask) && ig.find(n => n.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='iriselTouchIL_v10.safetensors' && ig.filter(n => n.class_type==='EmptyLatentImage').every(n => n.inputs.batch_size===1 && n.inputs.width===1216 && n.inputs.height===832) && t===lb.ask && /feet out of frame/.test(ng),
      '🎨 ' + JSON.stringify([lb, kept]) + ' − to 3, ▭ Wide (1216×832), an Illustrious model: 3 separate runs (own seeds, no batch), added beside the Z-Image ones, asked in tags (shown under What gets asked for): ' + t); }
  // ☑ Several (Jordan 2026-10-30): tick pictures, each becomes its own pose in the library
  { await page.click('#selb'); for(const i of [0, 1]) await page.click('[data-pick="' + i + '"]'); const lbl = await page.textContent('#manyb'), want = +lbl.match(/\d+/)[0], s0 = [...store.values()].filter(x => !x.gone).length;
    await page.click('#manyb'); await page.waitForFunction(() => /saved to the library/.test(document.querySelector('#msg') && document.querySelector('#msg').textContent || ''), null, {timeout:60000});
    const got = [...store.values()].filter(x => !x.gone), st = await page.evaluate(() => ({tab:document.querySelector('[data-step="tweak"]').getAttribute('aria-selected'), body:!!POSEPAGE.BODY}));
    ok(want >= 2 && got.length===s0 + want && got.slice(-want).every(x => x.sam && x.spin.length===16) && st.tab==='true' && st.body, '☑ Several: ' + lbl.trim() + ' made ' + (got.length - s0) + ' poses, each in the library with its turning card; the last one stays open'); await shot('many'); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
