// 🎞 Mocap (mocap/index.html, Jordan 2026-11-01): pick a video → trim → Copy the motion (one ComfyUI job: video frames → RT-DETR → MoGe →
// SAM 3D Body on every frame → Smooth → Create 3D Animation File → Save 3D) → play the animated body, scrub, orbit.
// Run: RIG_DEPS=<folder with three-0.160.0/ unpacked from `npm pack three@0.160.0`> MOCAP_VIDEO=<a short .webm> NODE_PATH=$(npm root -g) node tests/t_mocap.js
// The stand-in ComfyUI sends back a small animated GLB made in the page itself (127 bones named like SAM 3D Body's, root track00).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '', VIDEO = process.env.MOCAP_VIDEO || '';
(async () => {
  if(!DEPS || !VIDEO){ console.log('RIG_DEPS and MOCAP_VIDEO are needed'); process.exit(1); }
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage({ viewport:{width:390, height:844} });
  const logs = []; page.on('pageerror', e => { logs.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); }); if(process.env.DBG) page.on('console', m => console.log('C', m.text()));
  await page.route('https://app.test/mocap/**', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/maker.html', r => r.fulfill({ contentType:'text/html', body:'<!doctype html><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>' }));
  await page.route(/https:\/\/app\.test\/icon/, r => r.fulfill({ status:404, body:'' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  // a stand-in for SAM 3D Body's animated GLB: hips bone_001 under track00, a leg bone_002-004 that squats, head bone_113, the rest at the hips;
  // 30 frames at 15 fps with frame 5 missing (the person finder missed it), and track00 sliding 0.6 m sideways
  await page.goto('https://app.test/maker.html');
  const makeBody = o => page.evaluate(async o => {
    const THREE = await import('three'), {GLTFExporter} = await import('three/addons/exporters/GLTFExporter.js');
    const root = new THREE.Scene(), anim = [];
    for(let k = 0; k < (o.people || 1); k++){
    // (o.people: more tracks, each standing 1 m further along x; the second one only from frame 10 on, as if they walked in)
    const track = new THREE.Group(); track.name = 'track' + String(k).padStart(2, '0'); const bones = [];
    for(let i = 1; i <= 127; i++){ const b = new THREE.Bone(); b.name = 'bone_' + String(i).padStart(3, '0'); bones.push(b); }
    const B = n => bones[n - 1], tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (o.tilt || 0) * Math.PI / 180); B(1).position.set(0, 1, 0).applyQuaternion(tilt); B(1).quaternion.copy(tilt); track.add(B(1)); B(2).position.set(0.1, 0, 0); B(1).add(B(2)); B(3).position.set(0, -0.45, 0); B(2).add(B(3)); B(4).position.set(0, -0.45, 0); B(3).add(B(4));
    B(113).position.set(0, 0.6, 0); B(1).add(B(113)); for(let i = 5; i <= 127; i++) if(i!==113) B(1).add(B(i));
    const geo = new THREE.BoxGeometry(0.3, 1.7, 0.2, 2, 12, 2); geo.translate(0, 0.85, 0); const pos = geo.attributes.position, si = [], sw = [];
    for(let i = 0; i < pos.count; i++){ const y = pos.getY(i); si.push(y > 1.45 ? 112 : y < 0.55 ? 2 : y < 1 ? 1 : 0, 0, 0, 0); sw.push(1, 0, 0, 0); }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial()); mesh.name = track.name + '_mesh'; track.add(mesh); track.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
    root.add(track); const times = [], kq = [], kp = [];
    for(let f = k ? 10 : 0; f < 30; f++){ if(f===5) continue; times.push(f / 15); const a = Math.sin(f / 29 * Math.PI) * 1.2, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);  kq.push(...q.toArray());
      // (track00 in camera space: o.at = where she stands, o.climb = metres she goes up, tilted like the camera, all o.far times too far away)
      const w = o.at ? new THREE.Vector3(o.at[0] + (o.slide ? f / 29 * 0.6 : 0), o.at[1] + (o.climb || 0) * f / 29, o.at[2]) : new THREE.Vector3(f / 29 * 0.6, 0, 0); w.x += k; if(o.at) w.applyQuaternion(tilt).multiplyScalar(o.far || 1); kp.push(w.x, w.y, w.z); }
    if(!k) anim.push(new THREE.QuaternionKeyframeTrack('bone_003.quaternion', times, kq)); anim.push(new THREE.VectorKeyframeTrack(track.name + '.position', times, kp)); }
    const clip = new THREE.AnimationClip('motion', -1, anim);
    const out = await new GLTFExporter().parseAsync(root, {binary:true, animations:[clip]}); return [...new Uint8Array(out)]; }, o).then(a => Buffer.from(a));
  // MoGe's mesh of the place: a ground 1.5 m below a camera looking 15° down, and a wall 5 m away (both in camera space)
  const makeScene = (k = 1) => page.evaluate(async k => { const THREE = await import('three'), {GLTFExporter} = await import('three/addons/exporters/GLTFExporter.js');
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 15 * Math.PI / 180), g = new THREE.Group();
    const ground = new THREE.PlaneGeometry(8, 10, 40, 50); ground.rotateX(-Math.PI / 2); ground.translate(0, -1.5, -6); const wall = new THREE.PlaneGeometry(8, 3, 40, 15); wall.translate(0, 0, -5);
    for(const geo of [ground, wall]){ const pa = geo.attributes.position, v = new THREE.Vector3(); for(let i = 0; i < pa.count; i++){ v.fromBufferAttribute(pa, i).applyQuaternion(tilt); pa.setXYZ(i, v.x, v.y, v.z); } geo.scale(k, k, k); g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:0x888888}))); }
    const out = await new GLTFExporter().parseAsync(g, {binary:true}); return [...new Uint8Array(out)]; }, k).then(a => Buffer.from(a));
  const makeDepth = () => page.evaluate(async () => { const THREE = await import('three'), {GLTFExporter} = await import('three/addons/exporters/GLTFExporter.js');
    const pos = [], uv = [], idx = [], W = 200, H = 100, NX = 41, NY = 21;
    for(let j = 0; j < NY; j++) for(let i = 0; i < NX; i++){ const px = i / (NX - 1) * (W - 1), py = j / (NY - 1) * (H - 1); pos.push((px - (W - 1) / 2) / 100 * 3, -(py - (H - 1) / 2) / 100 * 3, -3); uv.push(px / (W - 1), py / (H - 1)); }
    for(let j = 0; j < NY - 1; j++) for(let i = 0; i < NX - 1; i++){ const a = j * NX + i; idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const out = await new GLTFExporter().parseAsync(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()), {binary:true}); return [...new Uint8Array(out)]; }).then(a => Buffer.from(a));
  const makeMask = () => page.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 100; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 200, 100); x.fillStyle = '#fff'; x.fillRect(120, 20, 41, 41); return c.toDataURL('image/png').split(',')[1]; }).then(b => Buffer.from(b, 'base64'));
  const makeBox = () => page.evaluate(async () => { const THREE = await import('three'), {GLTFExporter} = await import('three/addons/exporters/GLTFExporter.js');
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), new THREE.MeshStandardMaterial({color:0xaaaaaa})); m.position.set(5, 5, 5); const g = new THREE.Scene(); g.add(m);
    const out = await new GLTFExporter().parseAsync(g, {binary:true}); return [...new Uint8Array(out)]; }).then(a => Buffer.from(a));
  let BODY = await makeBody({}), SCENE = null, PLACE = null; const DEPTH = await makeDepth(), MASK = await makeMask(), BOX = await makeBox();
  const H = {'access-control-allow-origin':'*'}, GRAPHS = [], UPLOADS = [], DL = []; let vhsFail = false, missFirst = false, propMiss = false;
  const DEF = {SAM3DBody_Loader:{input:{required:{model_file:[['sam_3d_body_dinov3_int8_convrot.safetensors']]}}}, SAM3DBody_Predict:{input:{required:{image:['IMAGE']}}}, BuildPoseFile:{input:{required:{}}},
    UNETLoader:{input:{required:{unet_name:[['z_image_turbo_bf16.safetensors', 'rt_detr_v4-x-hgnet_fp32.safetensors']]}}}, LoadMoGeModel:{input:{required:{model_name:['COMBO', {options:['moge_2_vitl_normal_fp16.safetensors']}]}}},
    SAM3DBody_Smooth:{input:{required:{}}}, SAM3_VideoTrack:{input:{required:{}}}, CheckpointLoaderSimple:{input:{required:{ckpt_name:[['iriselTouchIL_v10.safetensors']]}}},
    LoadDA3Model:{input:{required:{model_name:[['depth_anything_3_base.safetensors']], weight_dtype:[['default']]}}}, DA3Inference:{input:{required:{}}}, DA3GeometryToMesh:{input:{required:{}}}, SAM3_Detect:{input:{required:{}}},
    Pixal3DConditioning:{input:{required:{}}}, CLIPVisionLoader:{input:{required:{clip_name:[['clip_vision_h.safetensors']]}}}, VAELoader:{input:{required:{vae_name:[['ae.safetensors']]}}}, ImageCropToMask:{input:{required:{}}}, MaskToImage:{input:{required:{}}},
    DecimateMesh:{input:{required:{}}}, UnwrapMesh:{input:{required:{}}}, BakeTextureFromVoxel:{input:{required:{}}}, ApplyTextureToMesh:{input:{required:{}}}, MoGeGeometryToFOV:{input:{required:{}}},
    VHS_LoadVideo:{input:{required:{video:[['a.mp4']], force_rate:['FLOAT', {default:0}], custom_width:['INT', {default:0}], custom_height:['INT', {default:0}], frame_load_cap:['INT', {default:0}], skip_first_frames:['INT', {default:0}], select_every_nth:['INT', {default:1}]}, optional:{meta_batch:['VHS_BatchManager'], vae:['VAE'], format:[['AnimateDiff', 'None']]}}}};
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url()), J = b => r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(b) });
    const oi = u.pathname.match(/^\/object_info\/(.+)$/); if(oi){ const c = decodeURIComponent(oi[1]); return J(DEF[c] ? {[c]:DEF[c]} : {}); }
    if(u.pathname==='/upload/image'){ const m = r.request().postDataBuffer().toString('latin1').match(/filename="([^"]+)"/); UPLOADS.push(m && m[1]); return J({name:m && m[1]}); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData())); return J({prompt_id:'p' + GRAPHS.length}); }
    if(u.pathname==='/renderdeck/download'){ DL.push(JSON.parse(r.request().postData())); return J({name:'sam3.1_multiplex_fp16.safetensors'}); }
    if(u.pathname==='/renderdeck/jobs'){ const where = {checkpoints:['CheckpointLoaderSimple', 'ckpt_name'], diffusion_models:['UNETLoader', 'unet_name'], clip_vision:['CLIPVisionLoader', 'clip_name'], vae:['VAELoader', 'vae_name'], geometry_estimation:['LoadDA3Model', 'model_name']};
      for(const d of DL){ const f = d.url.split('/').pop(), [c, k] = where[d.kind]; const l = DEF[c].input.required[k][0]; if(!l.includes(f)) l.push(f); }
      return J({jobs:DL.map(d => ({name:d.url.split('/').pop(), status:'done', done:1, total:1}))}); }
    if(u.pathname==='/queue') return J({queue_running:[], queue_pending:[]});
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[+hi[1].slice(1) - 1].prompt, ks = k => Object.keys(g).filter(n => g[n].class_type===k), err = (t, m) => J({[hi[1]]:{status:{status_str:'error', completed:false, messages:[['execution_error', {node_type:t, exception_message:m}]]}}});
      if(vhsFail && ks('VHS_LoadVideo').length) return err('VHS_LoadVideo', 'Could not open the video');
      if(missFirst && g[ks('RTDETR_detect')[0]].inputs.threshold > 0.2) return err('BuildPoseFile', 'build_glb_skeletal: no valid tracks in pose_data');
      if(propMiss && ks('SAM3_Detect').length) return err('ImageCropToMask', 'mask is empty');
      const outs = {}, n = +hi[1].slice(1); if(ks('Save3DAdvanced').length) outs[ks('Save3DAdvanced')[0]] = {'3d':[{filename:'motion_0000' + n + '_.glb', subfolder:'Output_Render\\RenderDeck\\mocap', type:'output'}], camera_info:[null], model_3d_info:[]};
      for(const id of ks('SaveGLB')){ const tail = g[id].inputs.filename_prefix.split('/').pop(); if(tail==='scene' && !SCENE) continue; outs[id] = {'3d':[{filename:tail + '_' + id + '_' + n + '_.glb', subfolder:'Output_Render\\RenderDeck\\mocap', type:'output'}]}; }
      for(const id of ks('SaveImage')) outs[id] = {images:[{filename:g[id].inputs.filename_prefix.split('/').pop() + '_' + n + '_.png', subfolder:'Output_Render\\RenderDeck\\mocap\\props', type:'output'}]};
      return J({[hi[1]]:{status:{status_str:'success', completed:true}, outputs:outs}}); }
    const fn = u.searchParams.get('filename') || '';
    if(u.pathname==='/view' && /^place_/.test(fn)) return r.fulfill({ contentType:'model/gltf-binary', headers:H, body:PLACE });
    if(u.pathname==='/view' && /^depth_/.test(fn)) return r.fulfill({ contentType:'model/gltf-binary', headers:H, body:DEPTH });
    if(u.pathname==='/view' && /^mask_/.test(fn)) return r.fulfill({ contentType:'image/png', headers:H, body:MASK });
    if(u.pathname==='/view' && /^sword_/.test(fn)) return r.fulfill({ contentType:'model/gltf-binary', headers:H, body:BOX });
    if(u.pathname==='/view' && /^scene_.*\.glb$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'model/gltf-binary', headers:H, body:SCENE });
    if(u.pathname==='/view' && /\.glb$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'model/gltf-binary', headers:H, body:BODY });
    if(u.pathname==='/view') return r.fulfill({ contentType:'video/webm', headers:H, body:fs.readFileSync(VIDEO) });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  const shot = async n => { if(process.env.SHOT){ await page.waitForTimeout(400); await page.screenshot({path:process.env.SHOT + '/mc-' + n + '.png'}); } };
  await page.goto('https://app.test/mocap/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://main.test', name:'Main'}, {url:'https://render.test', name:'Render'}]})); });
  await page.addInitScript(() => { window.RENDER_POLL = 60; });
  await page.goto('https://app.test/mocap/'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !document.querySelector('#hint').hidden && !!document.querySelector('#pickb')), 'a fresh page: the hint and 🎬 Choose a video'); await shot('fresh');
  // pick the video: the trim screen
  await page.setInputFiles('#file', VIDEO); await page.waitForFunction(() => window.MOCAP.M.dur > 0, null, {timeout:10000});
  const m0 = await page.evaluate(() => ({...window.MOCAP.M}));
  ok(Math.abs(m0.dur - 4) < 0.2 && m0.vw===540 && m0.vh===960 && m0.start===0 && Math.abs(m0.end - m0.dur) < 0.01, 'the video is read on the phone: 4 s, 540x960, the whole clip picked: ' + JSON.stringify({d:m0.dur, w:m0.vw, h:m0.vh, s:m0.start, e:m0.end}));
  ok(await page.evaluate(() => /60 frames/.test(document.querySelector('#body').textContent)), '4 s at 15 fps = 60 frames');
  // trim: start at 1 s
  await page.evaluate(() => { const v = document.querySelector('#prev'); v.currentTime = 1; }); await page.waitForTimeout(300); await page.click('#startb');
  await page.click('#fps [data-v="12"]'); await page.click('#smooth [data-k="strong"]'); await shot('trim');
  ok(await page.evaluate(() => /36 frames/.test(document.querySelector('#body').textContent)), 'Start here at 1 s, 12 fps: 36 frames');
  // copy the motion: one graph on Render (Main has no SAM)
  missFirst = true; await page.click('#gob');
  await page.waitForFunction(() => window.MOCAP.A, null, {timeout:30000}); missFirst = false;
  const G = GRAPHS[GRAPHS.length - 1], g = G.prompt, by = c => Object.values(g).find(n => n.class_type===c), ref = id => g[id[0]];
  const v = by('VHS_LoadVideo').inputs, rt = by('RTDETR_detect').inputs, pd = by('SAM3DBody_Predict').inputs, sm = by('SAM3DBody_Smooth').inputs, bp = by('BuildPoseFile').inputs, sv = by('Save3DAdvanced').inputs;
  ok(UPLOADS.length===1 && /^mocap-\w+\.webm$/.test(UPLOADS[0]) && v.video===UPLOADS[0], 'the video goes up to Render once and VHS loads it: ' + UPLOADS[0]);
  ok(v.force_rate===12 && v.skip_first_frames===12 && v.frame_load_cap===36 && v.custom_width===544 && v.custom_height===960 && v.select_every_nth===1 && !('meta_batch' in v) && !('format' in v), 'VHS: 12 fps, skips the first 12 frames, reads 36, at 544x960 (multiples of 8): ' + JSON.stringify(v));
  ok(GRAPHS.length===2 && GRAPHS[0].prompt[Object.keys(GRAPHS[0].prompt).find(k => GRAPHS[0].prompt[k].class_type==='RTDETR_detect')].inputs.threshold===0.3 && rt.threshold===0.12 && rt.class_name==='person' && rt.max_detections===1, 'no person found at 0.3 → it looks again at 0.12');
  ok(ref(pd.image).class_type==='VHS_LoadVideo' && ref(pd.bboxes).class_type==='RTDETR_detect' && pd.run_hand_refinement===false && ref(pd.fov).class_type==='MoGeGeometryToFOV', 'SAM 3D Body reads every frame with the person boxes and the lens from MoGe, no hands');
  ok(by('ImageFromBatch').inputs.batch_index===0 && by('ImageFromBatch').inputs.length===1 && by('LoadMoGeModel').inputs.model_name==='moge_2_vitl_normal_fp16.safetensors', 'MoGe measures the lens on the first frame only');
  ok(sm.method==='gaussian' && sm.window===15 && bp['format.bone_smooth_window']===11 && ref(bp.pose_data).class_type==='SAM3DBody_Smooth', 'Strong smoothing: Smooth node gaussian 15 + bone smoothing 11');
  ok(bp.fps===12 && bp.camera_translation==='absolute' && bp.format==='glb' && bp['format.mesh_style']==='body_mesh' && bp.track_index===0 && /mocap\/motion$/.test(sv.filename_prefix) && G.client_id && /^rd-mocap-/.test(G.client_id), 'Create 3D Animation File: animated body GLB at 12 fps, where she is from the camera kept (absolute), saved to RenderDeck/mocap');
  const mm = by('MoGePointMapToMesh').inputs, sg = by('SaveGLB').inputs; ok(ref(mm.moge_geometry).class_type==='MoGeInference' && mm.texture===true && mm.decimation===2 && ref(sg.mesh).class_type==='MoGePointMapToMesh' && /mocap\/scene$/.test(sg.filename_prefix) && ref(by('MoGeGeometryToFOV').inputs.moge_geometry)===ref(mm.moge_geometry), 'MoGe (one run) also gives a textured 3D mesh of the place, saved as a GLB');
  await page.waitForTimeout(600); await shot('playing');
  const a = await page.evaluate(() => { const A = window.MOCAP.A; return {F:A.F, fps:A.fps, dur:A.dur, n:document.querySelector('#scrub').max, pip:!document.querySelector('#pip').hidden}; });
  ok(a.fps===15 && a.F===30 && a.n==='29' && a.pip, 'the animation plays: 30 frames at 15 fps (from the keyframe times, with the missed frame left out), timeline 0-29, the video beside it: ' + JSON.stringify(a));
  // scrub: the knee bends, she stays on the floor, and moves sideways
  const at = f => page.evaluate(f => { window.MOCAP.setT(f / 15); const A = window.MOCAP.A;
    const p = n => { const e = A.P[0].bn[n].matrixWorld.elements; return [e[12], e[13], e[14]]; }; return {hip:p('bone_001'), ank:p('bone_004'), scrub:document.querySelector('#scrub').value, lab:document.querySelector('#tlab').textContent}; }, f);
  ok(await page.evaluate(() => { const M = window.MOCAP; return document.querySelector('#playb').textContent==='▶' && document.querySelector('#scrub').value==='0'; }), 'it opens paused on frame 1');
  await page.click('#followb'); const f0 = await at(0), f15 = await at(15), f29 = await at(29);
  ok(Math.abs(f0.ank[1] - f15.ank[1]) < 0.02 && f15.hip[1] < f0.hip[1] - 0.1, 'Feet on floor: mid-squat her hips drop and the foot stays down: ' + JSON.stringify([f0.hip[1].toFixed(2), f15.hip[1].toFixed(2), f0.ank[1].toFixed(2), f15.ank[1].toFixed(2)]));
  ok(Math.abs(f29.hip[0] - f0.hip[0] - 0.6) < 0.02 && Math.abs(f0.hip[0]) < 0.01, '🚶 Moves: she starts in the middle and slides 0.6 m with the camera translation: ' + JSON.stringify([f0.hip, f29.hip]));
  ok(f15.scrub==='15' && /^16 \/ 30/.test(f15.lab), 'the timeline shows frame 16 / 30: ' + f15.lab);
  await page.click('[data-walk="0"]'); const p29 = await at(29); ok(Math.abs(p29.hip[0] - f0.hip[0]) < 0.01, '📍 In place keeps her in the middle');
  await page.click('[data-feet="free"]'); const q15 = await at(15); ok(q15.ank[1] > f15.ank[1] + 0.1, '🦘 Free: the floor is the lowest of the whole clip, so the squatting foot lifts off it (as a jump would)');
  await page.evaluate(() => { const s = document.querySelector('#head'); s.value = '1.4'; s.dispatchEvent(new Event('input')); }); ok(await page.evaluate(() => Math.abs(window.MOCAP.A.P[0].bn.bone_113.scale.x - 1.4) < 1e-6), '🙂 Head size scales the head bone');
  // orbit: dragging the view turns the camera, not her
  const c0 = await page.evaluate(() => window.MOCAP.world.position.toArray()); await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(300, 280, {steps:6}); await page.mouse.up();
  ok(JSON.stringify(c0)===JSON.stringify(await page.evaluate(() => window.MOCAP.world.position.toArray())), 'dragging orbits the camera round her'); await shot('orbit');
  // the clip is in the list; reopening the page brings it back
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rd-mocap')).length===1), 'the finished motion is in 📚 Clips');
  await page.reload(); await page.waitForFunction(() => window.MOCAP.A, null, {timeout:20000}); ok(await page.evaluate(() => !document.querySelector('#pip').hidden && /render\.test\/view.*type=input/.test(document.querySelector('#pip').src)), 'after a reload it comes back with the video from the PC');
  // rebuild with lighter smoothing reuses the uploaded video; VHS failing falls back to ComfyUI's own loader
  vhsFail = true; await page.evaluate(() => document.querySelector('details').open = true); await page.click('#smooth [data-k="off"]'); await page.click('#rebuildb');
  await page.waitForFunction(n => window.MOCAP.M.res && window.MOCAP.M.res.file==='motion_0000' + n + '_.glb', GRAPHS.length + 2, {timeout:20000});
  const g2 = GRAPHS[GRAPHS.length - 1].prompt, by2 = c => Object.values(g2).find(n => n.class_type===c);
  ok(UPLOADS.length===1 && !by2('VHS_LoadVideo') && by2('LoadVideo').inputs.file===UPLOADS[0] && by2('Video Slice').inputs.start_time===1 && Math.abs(by2('Video Slice').inputs.duration - 3) < 0.01 && by2('ImageScaleToMaxDimension').inputs.largest_size===960, 'VHS failed → ComfyUI LoadVideo + Trim Video 1 s for 3 s, longest side 960, same upload');
  ok(!by2('SAM3DBody_Smooth') && by2('BuildPoseFile').inputs['format.bone_smooth_window']===0 && Array.isArray(by2('BuildPoseFile').inputs.fps), 'Smoothing Off: no Smooth node; fps comes from the video itself');
  // 🏞 the ground: MoGe's mesh (ground + a wall), camera 1.5 m up looking 15° down; SAM put her 1.2x too far away and she climbs 0.6 m (0.72 m in its too-far guess)
  BODY = await makeBody({tilt:15, at:[0, -1.5, -4], climb:0.6, far:1.2}); SCENE = await makeScene();
  await page.click('#smooth [data-k="med"]'); vhsFail = false; await page.click('#rebuildb');
  await page.waitForFunction(() => window.MOCAP.A && window.MOCAP.A.ground && window.MOCAP.SCN, null, {timeout:20000}); await page.waitForTimeout(300);
  const gr = await page.evaluate(() => { const A = window.MOCAP.A; return {...A.ground, n:A.ground.n.toArray(), feet:window.MOCAP.M.feet, msg:document.querySelector('#msg').textContent, place:!!document.querySelector('#sceneb')}; });
  ok(Math.abs(gr.height - 1.5) < 0.05 && Math.abs(gr.pitch + 15) < 1.5 && Math.abs(gr.scale - 1 / 1.2) < 0.03, 'the ground is found under the wall: camera 1.5 m up, 15° down; her distance corrected so her feet meet it: ' + JSON.stringify({h:gr.height, p:gr.pitch, s:gr.scale}));
  ok(gr.feet==='free' && /Ground found: the camera was 1\.5 m up, looking 15° down/.test(gr.msg) && gr.place, 'a new result with a ground starts on 🦘 Free, says what it found, and has a 🏞 Place switch: ' + gr.msg);
  await page.click('[data-walk="1"]'); const g0 = await at(0), g29 = await at(29);
  ok(Math.abs(g0.ank[1] - 0.1) < 0.03, 'she starts standing on the real ground (ankle 0.1 m above it): ' + g0.ank[1].toFixed(3));
  ok(Math.abs(g29.hip[1] - g0.hip[1] - 0.6) < 0.04 && Math.abs(g29.hip[0] - g0.hip[0]) < 0.03 && Math.abs(g29.hip[2] - g0.hip[2]) < 0.03, 'she climbs straight up 0.6 m (level now, not leaning with the camera): ' + JSON.stringify([g0.hip, g29.hip].map(p => p.map(v => v.toFixed(2)))));
  const scn = await page.evaluate(() => { const b = new (window.MOCAP.SCN.root.constructor === Object ? Object : window.MOCAP.camera.position.constructor)(); const box = []; window.MOCAP.world.updateMatrixWorld(true); let lo = 1e9; window.MOCAP.SCN.root.traverse(m => { if(m.isMesh){ const pa = m.geometry.attributes.position; for(let i = 0; i < pa.count; i += 37){ b.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); lo = Math.min(lo, b.y); } } }); return lo; });
  ok(Math.abs(scn) < 0.03, 'the place lies level with its ground at the floor: ' + scn.toFixed(3));
  // 🎯 orbit her: the pivot follows her up the wall
  const piv = await page.evaluate(() => { window.MOCAP.setT(29 / 15); const A = window.MOCAP.A, e = A.P[0].bn.bone_001.matrixWorld.elements; return window.MOCAP.controls.target.distanceTo({x:e[12], y:e[13], z:e[14]}); }); ok(piv < 1e-6, '🎯 Orbit her: the camera pivot is on her hips as she climbs');
  // (Jordan: the camera stays where it was put) pan the view up 0.5 m, then scrub: it moves with her climb but doesn't snap back to her hips
  const cam = await page.evaluate(() => { const M = window.MOCAP; M.setT(0); M.controls.target.y += 0.5; M.camera.position.y += 0.5; const off0 = M.controls.target.y - M.A.P[0].bn.bone_001.matrixWorld.elements[13];
    M.setT(1); M.setT(29 / 15); return [off0, M.controls.target.y - M.A.P[0].bn.bone_001.matrixWorld.elements[13]]; });
  ok(Math.abs(cam[0] - 0.5) < 1e-6 && Math.abs(cam[1] - 0.5) < 1e-6, 'a camera moved by hand keeps its place while scrubbing (still 0.5 m above her hips): ' + cam.map(v => v.toFixed(3)));
  await page.evaluate(() => window.MOCAP.setT(1)); await shot('ground'); ok(await page.evaluate(() => !window.MOCAP.SCN.root.visible), 'the place starts hidden (its ground still used)'); await page.click('#sceneb'); ok(await page.evaluate(() => window.MOCAP.SCN.root.visible), '🏞 Place shows the scene'); await page.click('#sceneb'); ok(await page.evaluate(() => !window.MOCAP.SCN.root.visible), '🏞 Place hides it again');
  await page.click('[data-feet="floor"]'); const h29 = await at(29); ok(Math.abs(h29.ank[1] - 0.1) < 0.03, '📌 Feet on floor still pins her lowest point (climb flattened)');
  // a job left running is picked up when the page opens again
  const n = GRAPHS.length, svId = Object.keys(GRAPHS[n - 1].prompt).find(k => GRAPHS[n - 1].prompt[k].class_type==='Save3DAdvanced');
  await page.evaluate(([pid, sv]) => { const d = JSON.parse(localStorage.getItem('rd-mocap-draft')); d.job = {pc:'https://render.test', pid, sv, t0:Date.now(), frames:36, cls:{}}; d.res = null; localStorage.setItem('rd-mocap-draft', JSON.stringify(d)); }, ['p' + n, svId]);
  await page.reload(); await page.waitForFunction(() => window.MOCAP.A && !window.MOCAP.M.job, null, {timeout:20000});
  ok(await page.evaluate(n => window.MOCAP.M.res.file==='motion_0000' + n + '_.glb', n) && GRAPHS.length===n, 'a job still running when the page closed is picked up on reopening (nothing sent again)');
  // 👥 several people: SAM 3.1 isn't on Render yet → one tap downloads it; then SAM 3.1's video tracker feeds SAM 3D Body, every track kept
  BODY = await makeBody({people:2}); SCENE = null;
  await page.setInputFiles('#file', VIDEO); await page.waitForFunction(() => window.MOCAP.M.dur > 0 && !window.MOCAP.M.res, null, {timeout:10000});
  ok(await page.evaluate(() => window.MOCAP.M.people===1 && !!document.querySelector('#people')), 'a new video starts on 👤 One person');
  await page.click('#people [data-v="2"]'); const n2 = GRAPHS.length; await page.click('#gob');
  await page.waitForSelector('#needb', {timeout:10000}); ok(GRAPHS.length===n2 && /needs SAM 3\.1/.test(await page.textContent('#msg')), 'two people without SAM 3.1 on Render: nothing is sent, it offers ⬇ Get SAM 3.1');
  await page.click('#needb'); await page.waitForFunction(() => /Done: SAM 3\.1 on Render/.test(document.querySelector('#msg').textContent), null, {timeout:10000});
  ok(DL.length===1 && DL[0].kind==='checkpoints' && /Comfy-Org\/sam3\.1\/resolve\/main\/checkpoints\/sam3\.1_multiplex_fp16\.safetensors$/.test(DL[0].url), 'Get SAM 3.1 asks the helper to download Comfy-Org/sam3.1 into checkpoints: ' + DL[0].url);
  await page.click('#gob'); await page.waitForFunction(() => window.MOCAP.A && window.MOCAP.A.P.length===2, null, {timeout:30000}); ok(GRAPHS.length===n2 + 1, 'then one job goes to Render');
  { const g = GRAPHS[GRAPHS.length - 1].prompt, by = c => Object.values(g).find(x => x.class_type===c), ref = id => g[id[0]], tr = by('SAM3_VideoTrack').inputs, pd = by('SAM3DBody_Predict').inputs;
    ok(!by('RTDETR_detect') && ref(pd.track_data).class_type==='SAM3_VideoTrack' && !pd.bboxes && tr.max_objects===2 && tr.detect_interval===1 && ref(tr.model).inputs.ckpt_name==='sam3.1_multiplex_fp16.safetensors' && ref(tr.conditioning).inputs.text==='person' && ref(tr.images).class_type==='VHS_LoadVideo', 'two people: SAM 3.1 follows up to 2 "person"s through the frames and SAM 3D Body reads each track (no RT-DETR)');
    ok(by('BuildPoseFile').inputs.track_index===-1, 'every track goes in the animation file'); }
  const pp = await page.evaluate(() => { const A = window.MOCAP.A; window.MOCAP.setT(0); const v0 = A.P.map(p => p.track.visible); window.MOCAP.setT(20 / 15); const v1 = A.P.map(p => p.track.visible);
    const hip = p => { const e = p.bn.bone_001.matrixWorld.elements; return [e[12], e[13], e[14]]; }, h = A.P.map(hip);
    return {v0, v1, dx:h[1][0] - h[0][0], own:A.P[0].bn.bone_001!==A.P[1].bn.bone_001, col:A.P.map(p => p.sk.material.color.getHex()), chips:document.querySelectorAll('#who button').length, t0:A.P[1].t0}; });
  ok(pp.own && pp.chips===2 && pp.col[0]!==pp.col[1], 'two mannequins, each with its own bones and colour, and a chip each: ' + JSON.stringify(pp.col));
  ok(pp.v0.join()==='true,false' && pp.v1.join()==='true,true' && Math.abs(pp.t0 - 10 / 15) < 0.01, 'the second person shows up only once they walk in (frame 11): ' + JSON.stringify([pp.v0, pp.v1]));
  ok(Math.abs(pp.dx - 1) < 0.03, 'they stand 1 m apart, as in the video: ' + pp.dx.toFixed(3));
  await shot('two'); await page.click('#who [data-p="0"]');
  ok(await page.evaluate(() => { const A = window.MOCAP.A; return !A.P[0].track.visible && A.P[1].track.visible && window.MOCAP.M.hide[0]===true; }), '👁 tapping person 1 hides them, person 2 stays');
  const c1 = await page.evaluate(() => window.MOCAP.camera.position.toArray()); await page.click('#who [data-p="0"]'); await page.click('#who [data-p="0"]');
  ok(JSON.stringify(c1)===JSON.stringify(await page.evaluate(() => window.MOCAP.camera.position.toArray())), 'hiding or showing someone leaves the camera where it is');
  await page.reload(); await page.waitForFunction(() => window.MOCAP.A && window.MOCAP.A.P.length===2, null, {timeout:20000});
  ok(await page.evaluate(() => !window.MOCAP.A.P[0].track.visible && JSON.parse(localStorage.getItem('rd-mocap'))[0].people===2), 'after a reload person 1 is still hidden; the clip remembers 2 people');
  // 🗡 a prop: one person 3 m in front of the camera with her wrists where the "sword" is on frame 1, sliding 0.6 m; Pixal3D isn't on Render yet
  BODY = await makeBody({at:[1.2, -0.7, -3], slide:true}); SCENE = null;
  await page.setInputFiles('#file', VIDEO); await page.waitForFunction(() => window.MOCAP.M.dur > 0 && !window.MOCAP.M.res, null, {timeout:10000}); await page.click('#people [data-v="1"]');
  await page.click('#gob'); await page.waitForFunction(() => window.MOCAP.A && window.MOCAP.A.P.length===1 && window.MOCAP.M.res, null, {timeout:30000});
  await page.fill('#propw', 'sword'); const n3 = GRAPHS.length; await page.click('#propb'); await page.waitForSelector('#needb', {timeout:10000});
  ok(GRAPHS.length===n3 && /Pixal3D, DINOv3 \(for Pixal3D\), TRELLIS\.2 shape VAE, TRELLIS\.2 texture VAE \(once, 8\.8 GB\)/.test(await page.textContent('#needb')), 'props without Pixal3D: nothing sent, one ⬇ button for what is missing: ' + (await page.textContent('#needb')).trim());
  await page.click('#needb'); await page.waitForFunction(() => /^Done: Pixal3D/.test(document.querySelector('#msg').textContent), null, {timeout:15000});
  ok(DL.slice(-4).map(d => d.kind).join()==='diffusion_models,clip_vision,vae,vae' && /pixal3d_int8_convrot/.test(DL[DL.length - 4].url), 'it downloads Pixal3D, DINOv3 and the two TRELLIS.2 VAEs through the helper, one after another');
  // a word SAM 3 can't find on this frame
  propMiss = true; await page.evaluate(() => window.MOCAP.setT(0)); await page.click('#propb'); await page.waitForFunction(() => /couldn't find a sword on this frame/.test(document.querySelector('#msg').textContent), null, {timeout:15000}); propMiss = false;
  ok(await page.evaluate(() => window.MOCAP.PROPS.length===0 && !window.MOCAP.M.props.length), 'nothing SAM 3 can find: it says so and adds nothing');
  await page.click('#propb'); await page.waitForFunction(() => window.MOCAP.PROPS.length===1 && window.MOCAP.PROPS[0].obj, null, {timeout:20000});
  { const g = GRAPHS[GRAPHS.length - 1].prompt, by = c => Object.values(g).find(x => x.class_type===c), all = c => Object.values(g).filter(x => x.class_type===c), ref = id => g[id[0]];
    const det = by('SAM3_Detect').inputs, fb = ref(det.image).inputs, pc = by('Pixal3DConditioning').inputs;
    ok(ref(det.conditioning).inputs.text==='sword' && ref(det.model).inputs.ckpt_name==='sam3.1_multiplex_fp16.safetensors' && ref(fb.image).class_type==='VHS_LoadVideo' && fb.batch_index===0, 'SAM 3 looks for "sword" on the frame on screen (frame 1), from the same frames the motion was read from');
    ok(ref(pc.image).class_type==='ImageCropToMask' && ref(pc.camera_angle_x).inputs.axis==='horizontal' && by('UNETLoader').inputs.unet_name==='pixal3d_int8_convrot.safetensors' && all('KSampler').length===4 && all('MoGeInference').length===2, 'Pixal3D builds it from the cut-out with the lens MoGe measures on it (4 sampling passes)');
    ok(all('SaveGLB').length===2 && all('SaveImage').length===1 && /props\/sword$/.test(all('SaveGLB').map(x => x.inputs.filename_prefix).find(x => /sword/.test(x))), 'it saves the 3D sword, the frame\'s surface and the outline'); }
  const sw = await page.evaluate(() => { const M = window.MOCAP, P = M.PROPS[0]; M.setT(0); M.world.updateMatrixWorld(true);
    const c = P.obj.getWorldPosition(P.obj.position.clone()).sub(P.obj.parent.getWorldPosition(P.obj.position.clone())); const s = P.obj.children[0].scale.x, x0 = P.obj.matrixWorld.elements[12];
    M.setT(29 / 15); M.world.updateMatrixWorld(true); const x1 = P.obj.matrixWorld.elements[12];
    return {held:P.held, parent:P.obj.parent && P.obj.parent.name, c:[c.x, c.y, c.z], s, moved:x1 - x0, chip:document.querySelector('#props').textContent}; });
  ok(Math.abs(sw.c[0] - 0.015) < 0.03 && Math.abs(sw.c[1] + 0.015) < 0.03 && Math.abs(sw.c[2]) < 0.05 && Math.abs(sw.s - 1.23) < 0.04, 'the sword lands where its outline is (3 m away on MoGe\'s surface, right at her wrist), sized to the outline (1.23 m): ' + JSON.stringify({c:sw.c.map(v => v.toFixed(3)), s:sw.s.toFixed(3)}));
  ok(sw.held==='her' && /^bone_0(41|77)$/.test(sw.parent) && /sword ✋/.test(sw.chip), 'her wrist is on it, so she holds it (it rides on her wrist bone): ' + sw.parent);
  ok(Math.abs(sw.moved - 0.6) < 0.03, 'as she slides 0.6 m the sword goes with her hand: ' + sw.moved.toFixed(3));
  await shot('prop'); await page.click('#props [data-prop]'); ok(await page.evaluate(() => !window.MOCAP.PROPS[0].obj.visible && window.MOCAP.M.props[0].hide), '👁 hides the sword');
  await page.reload(); await page.waitForFunction(() => window.MOCAP.A && window.MOCAP.PROPS.length===1 && window.MOCAP.PROPS[0].obj, null, {timeout:20000});
  ok(await page.evaluate(() => !window.MOCAP.PROPS[0].obj.visible && window.MOCAP.PROPS[0].held==='her'), 'after a reload the sword is back, still in her hand and still hidden');
  // 🏞 the whole place: Depth Anything 3 on 8 frames spread over the clip
  PLACE = await makeScene(); const n4 = GRAPHS.length; await page.click('#placeb'); await page.waitForFunction(() => window.MOCAP.SCN && window.MOCAP.SCN.place && /built from/.test(document.querySelector('#msg').textContent), null, {timeout:20000});
  { const g = GRAPHS[GRAPHS.length - 1].prompt, by = c => Object.values(g).find(x => x.class_type===c), all = c => Object.values(g).filter(x => x.class_type===c), ref = id => g[id[0]], da = by('DA3Inference').inputs;
    const idx = all('ImageFromBatch').map(x => x.inputs.batch_index).sort((a, b) => a - b), F = by('VHS_LoadVideo').inputs.frame_load_cap;
    ok(GRAPHS.length===n4 + 1 && da.mode==='multiview' && da['mode.ref_view_strategy']==='first' && ref(da.da3_model).inputs.model_name==='depth_anything_3_base.safetensors' && all('DA3GeometryToMesh').length===8 && all('SaveGLB').length===8, 'Depth Anything 3 reads 8 frames together (multi-view, first frame as the anchor) and saves a surface for each');
    ok(idx.length===8 && idx[0]===0 && idx[7]===F - 1 && idx[1] > 0, 'the 8 frames are spread over the whole clip: ' + idx.join(',') + ' of ' + F); }
  const pl = await page.evaluate(() => ({g:window.MOCAP.A.ground && window.MOCAP.A.ground.height, vis:window.MOCAP.SCN.root.visible, msg:document.querySelector('#msg').textContent, btn:!!document.querySelector('#placeb')}));
  ok(Math.abs(pl.g - 1.5) < 0.05 && pl.vis && /built from 8 frames/.test(pl.msg) && !pl.btn, 'the place shows (🏞 on), the ground is found in it, and the button goes: ' + pl.msg);
  // with MoGe's frame (metres) too, the place is scaled to match it: Depth Anything 3 here is half size
  PLACE = await makeScene(0.5); SCENE = await makeScene(1);
  await page.evaluate(async () => { const M = window.MOCAP.M; M.res.scene = {file:'scene_9_9_.glb', sub:''}; await window.MOCAP.reopen(); });
  const ps = await page.evaluate(() => ({s:window.MOCAP.SCN.root.scale.x, g:window.MOCAP.A.ground && window.MOCAP.A.ground.height}));
  ok(Math.abs(ps.s - 2) < 0.05 && Math.abs(ps.g - 1.5) < 0.05, 'Depth Anything 3\'s place is sized to MoGe\'s metres (x2 here), so the ground is still 1.5 m down: ' + JSON.stringify(ps));
  await shot('place');
  // ✥ line up: drag her across the (tilted, levelled) ground, turn her, raise her; it holds on every frame and after a reload
  const hipAt = f => page.evaluate(f => { const M = window.MOCAP; M.setT(f / 15); const e = M.A.P[0].bn.bone_001.matrixWorld.elements, k = M.A.P[0].bn.bone_002.matrixWorld.elements; return {hip:[e[12], e[13], e[14]], knee:[k[12] - e[12], k[14] - e[14]], t:M.controls.target.toArray()}; }, f);
  await page.evaluate(() => { window.MOCAP.setT(0); }); const o0 = await hipAt(0), o29 = await hipAt(29); await page.click('#lineb'); if(await page.evaluate(() => !document.querySelector('#pip').hidden)) await page.click('#pipb');
  ok(await page.evaluate(() => !!document.querySelector('#yaw') && !!document.querySelector('#lifty')), '✥ Line up shows turn and raise sliders');
  const scr = await page.evaluate(() => { const M = window.MOCAP; M.setT(0); M.controls.update(); M.camera.updateMatrixWorld(); M.world.updateMatrixWorld(true); const e = M.A.P[0].bn.bone_001.matrixWorld.elements, v = {x:e[12], y:e[13] - 0.2, z:e[14]};
    const c = document.querySelector('#stage canvas').getBoundingClientRect(), p = M.camera.position, m = M.camera; const w = new (M.camera.position.constructor)(v.x, v.y, v.z).project(m); return [c.left + (w.x + 1) / 2 * c.width, c.top + (1 - w.y) / 2 * c.height]; });
  await page.mouse.move(scr[0], scr[1]); await page.mouse.down(); for(let i = 1; i <= 6; i++) await page.mouse.move(scr[0] + i * 10, scr[1]); await page.mouse.up();
  const d0 = await hipAt(0), d29 = await hipAt(29), mv = [d0.hip[0] - o0.hip[0], d0.hip[1] - o0.hip[1], d0.hip[2] - o0.hip[2]], mv29 = [d29.hip[0] - o29.hip[0], d29.hip[1] - o29.hip[1], d29.hip[2] - o29.hip[2]];
  ok(Math.hypot(mv[0], mv[2]) > 0.1 && Math.abs(mv[1]) < 0.02, 'dragging her moves her along the ground, not up or down: ' + mv.map(v => v.toFixed(3)));
  ok(mv.every((v, i) => Math.abs(v - mv29[i]) < 0.02), 'she stays moved by the same amount on every frame: ' + mv29.map(v => v.toFixed(3)));
  await page.evaluate(() => { const s = document.querySelector('#yaw'); s.value = '90'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); });
  const y0 = await hipAt(0), a0 = Math.atan2(d0.knee[1], d0.knee[0]), a1 = Math.atan2(y0.knee[1], y0.knee[0]); let da = (a1 - a0) * 180 / Math.PI; while(da > 180) da -= 360; while(da < -180) da += 360;
  ok(Math.abs(Math.abs(da) - 90) < 3 && Math.hypot(y0.hip[0] - d0.hip[0], y0.hip[2] - d0.hip[2]) < 0.01, '↻ Turn 90° turns her about her hips (hips stay put): ' + da.toFixed(1) + '°');
  await page.evaluate(() => { const s = document.querySelector('#lifty'); s.value = '0.3'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); });
  const r0 = await hipAt(0); ok(Math.abs(r0.hip[1] - y0.hip[1] - 0.3) < 0.01, '↕ Raise 0.3 m lifts her straight up');
  await page.reload(); await page.waitForFunction(() => window.MOCAP.A && window.MOCAP.A.P.length===1, null, {timeout:20000}); await page.waitForTimeout(300);
  const rl = await hipAt(0); ok(rl.hip.every((v, i) => Math.abs(v - r0.hip[i]) < 0.02), 'after a reload she is still moved, turned and raised');
  await page.click('#lineb'); await page.click('#adjx'); const bk = await hipAt(0); ok(bk.hip.every((v, i) => Math.abs(v - o0.hip[i]) < 0.02), '↺ Put her back undoes it');
  await shot('lineup');
  if(process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(GRAPHS.map(x => x.prompt)));
  ok(logs.length===0, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
