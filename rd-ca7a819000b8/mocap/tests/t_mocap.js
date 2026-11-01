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
    const track = new THREE.Group(); track.name = 'track00'; const bones = [];
    for(let i = 1; i <= 127; i++){ const b = new THREE.Bone(); b.name = 'bone_' + String(i).padStart(3, '0'); bones.push(b); }
    const B = n => bones[n - 1], tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (o.tilt || 0) * Math.PI / 180); B(1).position.set(0, 1, 0).applyQuaternion(tilt); B(1).quaternion.copy(tilt); track.add(B(1)); B(2).position.set(0.1, 0, 0); B(1).add(B(2)); B(3).position.set(0, -0.45, 0); B(2).add(B(3)); B(4).position.set(0, -0.45, 0); B(3).add(B(4));
    B(113).position.set(0, 0.6, 0); B(1).add(B(113)); for(let i = 5; i <= 127; i++) if(i!==113) B(1).add(B(i));
    const geo = new THREE.BoxGeometry(0.3, 1.7, 0.2, 2, 12, 2); geo.translate(0, 0.85, 0); const pos = geo.attributes.position, si = [], sw = [];
    for(let i = 0; i < pos.count; i++){ const y = pos.getY(i); si.push(y > 1.45 ? 112 : y < 0.55 ? 2 : y < 1 ? 1 : 0, 0, 0, 0); sw.push(1, 0, 0, 0); }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial()); mesh.name = 'body'; track.add(mesh); track.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
    const root = new THREE.Scene(); root.add(track); const times = [], kq = [], kp = [];
    for(let f = 0; f < 30; f++){ if(f===5) continue; times.push(f / 15); const a = Math.sin(f / 29 * Math.PI) * 1.2, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);  kq.push(...q.toArray());
      // (track00 in camera space: o.at = where she stands, o.climb = metres she goes up, tilted like the camera, all o.far times too far away)
      const w = o.at ? new THREE.Vector3(o.at[0] + (o.slide ? f / 29 * 0.6 : 0), o.at[1] + (o.climb || 0) * f / 29, o.at[2]) : new THREE.Vector3(f / 29 * 0.6, 0, 0); if(o.at) w.applyQuaternion(tilt).multiplyScalar(o.far || 1); kp.push(w.x, w.y, w.z); }
    const clip = new THREE.AnimationClip('motion', -1, [new THREE.QuaternionKeyframeTrack('bone_003.quaternion', times, kq), new THREE.VectorKeyframeTrack('track00.position', times, kp)]);
    const out = await new GLTFExporter().parseAsync(root, {binary:true, animations:[clip]}); return [...new Uint8Array(out)]; }, o).then(a => Buffer.from(a));
  // MoGe's mesh of the place: a ground 1.5 m below a camera looking 15° down, and a wall 5 m away (both in camera space)
  const makeScene = () => page.evaluate(async () => { const THREE = await import('three'), {GLTFExporter} = await import('three/addons/exporters/GLTFExporter.js');
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 15 * Math.PI / 180), g = new THREE.Group();
    const ground = new THREE.PlaneGeometry(8, 10, 40, 50); ground.rotateX(-Math.PI / 2); ground.translate(0, -1.5, -6); const wall = new THREE.PlaneGeometry(8, 3, 40, 15); wall.translate(0, 0, -5);
    for(const geo of [ground, wall]){ const pa = geo.attributes.position, v = new THREE.Vector3(); for(let i = 0; i < pa.count; i++){ v.fromBufferAttribute(pa, i).applyQuaternion(tilt); pa.setXYZ(i, v.x, v.y, v.z); } g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:0x888888}))); }
    const out = await new GLTFExporter().parseAsync(g, {binary:true}); return [...new Uint8Array(out)]; }).then(a => Buffer.from(a));
  let BODY = await makeBody({}), SCENE = null;
  const H = {'access-control-allow-origin':'*'}, GRAPHS = [], UPLOADS = []; let vhsFail = false, missFirst = false;
  const DEF = {SAM3DBody_Loader:{input:{required:{model_file:[['sam_3d_body_dinov3_int8_convrot.safetensors']]}}}, SAM3DBody_Predict:{input:{required:{image:['IMAGE']}}}, BuildPoseFile:{input:{required:{}}},
    UNETLoader:{input:{required:{unet_name:[['z_image_turbo_bf16.safetensors', 'rt_detr_v4-x-hgnet_fp32.safetensors']]}}}, LoadMoGeModel:{input:{required:{model_name:['COMBO', {options:['moge_2_vitl_normal_fp16.safetensors']}]}}},
    SAM3DBody_Smooth:{input:{required:{}}},
    VHS_LoadVideo:{input:{required:{video:[['a.mp4']], force_rate:['FLOAT', {default:0}], custom_width:['INT', {default:0}], custom_height:['INT', {default:0}], frame_load_cap:['INT', {default:0}], skip_first_frames:['INT', {default:0}], select_every_nth:['INT', {default:1}]}, optional:{meta_batch:['VHS_BatchManager'], vae:['VAE'], format:[['AnimateDiff', 'None']]}}}};
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url()), J = b => r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(b) });
    const oi = u.pathname.match(/^\/object_info\/(.+)$/); if(oi){ const c = decodeURIComponent(oi[1]); return J(DEF[c] ? {[c]:DEF[c]} : {}); }
    if(u.pathname==='/upload/image'){ const m = r.request().postDataBuffer().toString('latin1').match(/filename="([^"]+)"/); UPLOADS.push(m && m[1]); return J({name:m && m[1]}); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData())); return J({prompt_id:'p' + GRAPHS.length}); }
    if(u.pathname==='/queue') return J({queue_running:[], queue_pending:[]});
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[+hi[1].slice(1) - 1].prompt, ks = k => Object.keys(g).filter(n => g[n].class_type===k), err = (t, m) => J({[hi[1]]:{status:{status_str:'error', completed:false, messages:[['execution_error', {node_type:t, exception_message:m}]]}}});
      if(vhsFail && ks('VHS_LoadVideo').length) return err('VHS_LoadVideo', 'Could not open the video');
      if(missFirst && g[ks('RTDETR_detect')[0]].inputs.threshold > 0.2) return err('BuildPoseFile', 'build_glb_skeletal: no valid tracks in pose_data');
      return J({[hi[1]]:{status:{status_str:'success', completed:true}, outputs:{...(SCENE && ks('SaveGLB').length ? {[ks('SaveGLB')[0]]:{'3d':[{filename:'scene_0000' + GRAPHS.length + '_.glb', subfolder:'Output_Render\\RenderDeck\\mocap', type:'output'}]}} : {}), [ks('Save3DAdvanced')[0]]:{'3d':[{filename:'motion_0000' + GRAPHS.length + '_.glb', subfolder:'Output_Render\\RenderDeck\\mocap', type:'output'}], camera_info:[null], model_3d_info:[]}}}}); }
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
    const p = n => { const e = A.bn[n].matrixWorld.elements; return [e[12], e[13], e[14]]; }; return {hip:p('bone_001'), ank:p('bone_004'), scrub:document.querySelector('#scrub').value, lab:document.querySelector('#tlab').textContent}; }, f);
  ok(await page.evaluate(() => { const M = window.MOCAP; return document.querySelector('#playb').textContent==='▶' && document.querySelector('#scrub').value==='0'; }), 'it opens paused on frame 1');
  await page.click('#followb'); const f0 = await at(0), f15 = await at(15), f29 = await at(29);
  ok(Math.abs(f0.ank[1] - f15.ank[1]) < 0.02 && f15.hip[1] < f0.hip[1] - 0.1, 'Feet on floor: mid-squat her hips drop and the foot stays down: ' + JSON.stringify([f0.hip[1].toFixed(2), f15.hip[1].toFixed(2), f0.ank[1].toFixed(2), f15.ank[1].toFixed(2)]));
  ok(Math.abs(f29.hip[0] - f0.hip[0] - 0.6) < 0.02 && Math.abs(f0.hip[0]) < 0.01, '🚶 Moves: she starts in the middle and slides 0.6 m with the camera translation: ' + JSON.stringify([f0.hip, f29.hip]));
  ok(f15.scrub==='15' && /^16 \/ 30/.test(f15.lab), 'the timeline shows frame 16 / 30: ' + f15.lab);
  await page.click('[data-walk="0"]'); const p29 = await at(29); ok(Math.abs(p29.hip[0] - f0.hip[0]) < 0.01, '📍 In place keeps her in the middle');
  await page.click('[data-feet="free"]'); const q15 = await at(15); ok(q15.ank[1] > f15.ank[1] + 0.1, '🦘 Free: the floor is the lowest of the whole clip, so the squatting foot lifts off it (as a jump would)');
  await page.evaluate(() => { const s = document.querySelector('#head'); s.value = '1.4'; s.dispatchEvent(new Event('input')); }); ok(await page.evaluate(() => Math.abs(window.MOCAP.A.bn.bone_113.scale.x - 1.4) < 1e-6), '🙂 Head size scales the head bone');
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
  const piv = await page.evaluate(() => { window.MOCAP.setT(29 / 15); const A = window.MOCAP.A, e = A.bn.bone_001.matrixWorld.elements; return window.MOCAP.controls.target.distanceTo({x:e[12], y:e[13], z:e[14]}); }); ok(piv < 1e-6, '🎯 Orbit her: the camera pivot is on her hips as she climbs');
  await page.evaluate(() => window.MOCAP.setT(1)); await shot('ground'); await page.click('#sceneb'); ok(await page.evaluate(() => !window.MOCAP.SCN.root.visible), '🏞 Place hides the scene');
  await page.click('[data-feet="floor"]'); const h29 = await at(29); ok(Math.abs(h29.ank[1] - 0.1) < 0.03, '📌 Feet on floor still pins her lowest point (climb flattened)');
  // a job left running is picked up when the page opens again
  const n = GRAPHS.length, svId = Object.keys(GRAPHS[n - 1].prompt).find(k => GRAPHS[n - 1].prompt[k].class_type==='Save3DAdvanced');
  await page.evaluate(([pid, sv]) => { const d = JSON.parse(localStorage.getItem('rd-mocap-draft')); d.job = {pc:'https://render.test', pid, sv, t0:Date.now(), frames:36, cls:{}}; d.res = null; localStorage.setItem('rd-mocap-draft', JSON.stringify(d)); }, ['p' + n, svId]);
  await page.reload(); await page.waitForFunction(() => window.MOCAP.A && !window.MOCAP.M.job, null, {timeout:20000});
  ok(await page.evaluate(n => window.MOCAP.M.res.file==='motion_0000' + n + '_.glb', n) && GRAPHS.length===n, 'a job still running when the page closed is picked up on reopening (nothing sent again)');
  if(process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(GRAPHS.map(x => x.prompt)));
  ok(logs.length===0, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
