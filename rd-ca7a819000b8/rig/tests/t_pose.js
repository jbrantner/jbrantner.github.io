// 🤸 Pose Creator (Jordan 2026-10-29): scene.html?pose=1. Load her rig, describe the action, drag her joints, paint 4 tries from the
// 📷 Camera, pick one, and 🦴 match her skeleton to that picture (DWPose on a PC). Run with RIG_DEPS and BODY_FBX like t_scene.js.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '';
(async () => {
  if(!process.env.BODY_FBX){ console.log('BODY_FBX is needed (the base body)'); process.exit(1); }
  const html = fs.readFileSync(path.join(__dirname, '..', 'scene.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:900} });
  const logs = []; page.on('pageerror', e => { logs.push('PAGEERROR ' + e.message); if(process.env.DBG) console.log('PAGEERROR', e.message); }); if(process.env.DBG) page.on('console', m => console.log('C', m.text())); page.on('dialog', d => d.accept());
  await page.route('https://app.test/rig/scene.html*', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route(/https:\/\/app\.test\/rig\/(body|hair|look)\.js/, r => r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(path.join(__dirname, '..', new URL(r.request().url()).pathname.split('/').pop())) }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  const H = {'access-control-allow-origin':'*'};
  const lib = {name:'Ellie', subfolder:'Character Library/Ellie', saved:1000, trigger:'elliex', lora:'elliex.safetensors', prompt:'elliex, 1girl, solo', tags:'1girl, solo, blue hair, standing, full body', geo:{wM:1.07, hM:1.87, aim:[0, 0.935, 0]},
    cover:'eye_000.png', views:[{ring:1, i:0, mid:false, file:'eye_000.png'}]};
  const store = new Map(); const GRAPHS = []; let KP = null, ACT = [];
  const OI = {MiniMaxH3ImageToVideo:['prompt', ['x']], SaveVideo:['video', ['x']], UNETLoader:['unet_name', ['minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'other.safetensors']], LoraLoaderModelOnly:['lora_name', ['minimax_h3_fl2v_turbo_8step.safetensors']], CLIPLoader:['clip_name', ['minimax_h3_text_encoder.safetensors']], VAELoader:['vae_name', ['minimax_h3_video_vae_fp16.safetensors']], CheckpointLoaderSimple:['ckpt_name', ['iriselTouchIL_v10.safetensors']], LoraLoader:['lora_name', ['elliex.safetensors']], ControlNetLoader:['control_net_name', ['illustriousXL_controlnetPromax.safetensors']], LoadBackgroundRemovalModel:['bg_removal_name', ['BiRefNet-general.safetensors']]};
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url()), J = b => r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(b) });
    if(u.pathname==='/renderdeck/library') return J(u.searchParams.get('kind')==='obj' ? {library:1, kinds:['char', 'obj'], objects:[]} : {library:1, kinds:['char', 'obj'], characters:[lib]});
    if(u.pathname==='/renderdeck/scenes') return J({scenes:[...store.values()]});
    if(u.pathname==='/renderdeck/scenes/save'){ const b = JSON.parse(r.request().postData()); store.set(b.scene.id, b.scene); return J({ok:true}); }
    if(u.pathname==='/object_info/DWPreprocessor') return J({DWPreprocessor:{input:{required:{image:['IMAGE'], detect_hand:[['enable', 'disable'], {default:'enable'}], detect_body:[['enable', 'disable'], {default:'enable'}], detect_face:[['enable', 'disable'], {default:'enable'}], resolution:['INT', {default:512}]}, optional:{bbox_detector:[['yolox_l.onnx'], {default:'yolox_l.onnx'}]}}}});
    if(u.pathname==='/object_info/SavePoseKpsAsJsonFile') return J({SavePoseKpsAsJsonFile:{input:{required:{}}}});
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return J(d ? {[oi[1]]:{input:{required:{[d[0]]:[d[1]]}}}} : {}); }
    if(u.pathname==='/upload/image'){ const m = r.request().postDataBuffer().toString('latin1').match(/filename="([^"]+)"/); return J({name:m && m[1]}); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return J({prompt_id:'p' + GRAPHS.length}); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[GRAPHS.length - 1], save = Object.keys(g).find(k => g[k].class_type==='SaveImage');
      const sv = Object.keys(g).find(k => g[k].class_type==='SaveVideo'), sk = Object.keys(g).find(k => g[k].class_type==='SavePoseKpsAsJsonFile');
      if(sv) return J({[hi[1]]:{status:{status_str:'success'}, outputs:{[sv]:{images:[{filename:'Ellie_act_00001.mp4', subfolder:'RenderDeck/pose', type:'output'}], animated:[true]}, [sk]:{openpose_json:[JSON.stringify(ACT.map(fl => ({people:fl ? [{pose_keypoints_2d:fl}] : [], canvas_width:KP.W, canvas_height:KP.H})))]}}}});
      if(save) return J({[hi[1]]:{status:{status_str:'success'}, outputs:{[save]:{images:[0, 1, 2, 3].map(i => ({filename:'ellie_' + i + '.png', subfolder:'RenderDeck/scene', type:'output'}))}}}});
      return J({[hi[1]]:{status:{status_str:'success'}, outputs:{3:{openpose_json:[JSON.stringify([{people:[{pose_keypoints_2d:KP.flat}], canvas_width:KP.W, canvas_height:KP.H}])]}}}}); }
    if(u.pathname==='/view' && u.searchParams.get('filename')==='Anime_Female_A.fbx') return r.fulfill({ contentType:'application/octet-stream', headers:H, body:fs.readFileSync(process.env.BODY_FBX) });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="350"><rect width="200" height="350" fill="#fff"/><rect x="80" y="20" width="40" height="320" fill="#c33"/></svg>' });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  await page.goto('https://app.test/rig/scene.html?pose=1');
  await page.evaluate(() => localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})));
  await page.goto('https://app.test/rig/scene.html?pose=1'); await page.waitForFunction(() => window.SCENE && SCENE.sc, null, {timeout:20000}); await page.waitForTimeout(800);
  const t0 = await page.evaluate(() => ({name:SCENE.sc.name, kind:SCENE.sc.kind, title:document.title, gone:['#addo', '#rall', '#rscene', '#d3', '#d2', '#rlibb'].every(k => document.querySelector(k).hidden), desc:document.querySelector('#sdesc').placeholder, add:document.querySelector('#add').textContent}));
  ok(t0.name==='Pose 1' && t0.kind==='pose' && t0.title==='Pose Creator' && t0.gone && /action/.test(t0.desc) && /rig/.test(t0.add), '🤸 a first pose opens, characters only, with 📝 Describe the action: ' + JSON.stringify(t0));
  ok(await page.evaluate(() => !JSON.parse(localStorage.getItem('rd-scenes') || '[]').length && JSON.parse(localStorage.getItem('rd-poses') || '[]').length===1), 'poses are kept apart from scenes');
  await page.click('#add'); await page.waitForSelector('#chars [data-ref]'); await page.click('#chars [data-ref]');
  await page.waitForFunction(() => { const o = [...SCENE.objs.values()][0]; return o && o.mq && o.mq.userData.body && SCENE.BODY; }, null, {timeout:30000}); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-v="cam"]').click()); await page.waitForTimeout(300);
  const dots = await page.evaluate(() => ({on:SCENE.jh.visible, n:SCENE.jh.children.length, note:/pink dots/.test(document.querySelector('#selbox').textContent)}));
  ok(dots.on && dots.n===10 && dots.note, '🦴 her rig shows 10 pink joint dots: ' + JSON.stringify(dots));
  if(process.env.SHOT) await page.screenshot({path:process.env.SHOT + '/pose-dots.png'});
  // drag her right wrist up
  const w0 = await page.evaluate(() => { SCENE.placeCams(SCENE.rects()); SCENE.poseFor('cam'); const o = [...SCENE.objs.values()][0], p = SCENE.jointPts(o)[4], r = SCENE.rects().cam, v = p.clone().project(SCENE.camOf('cam')), st = document.querySelector('#stage').getBoundingClientRect();
    ['.cols', '.hud'].forEach(k => document.querySelector(k).style.pointerEvents = 'none'); return {x:st.left + r.x + (v.x + 1) / 2 * r.w, y:st.top + r.y + (1 - v.y) / 2 * r.h, wy:p.y}; });
  await page.mouse.move(w0.x, w0.y); await page.mouse.down(); for(let i = 1; i <= 8; i++) await page.mouse.move(w0.x - i * 4, w0.y - i * 12); await page.mouse.up(); await page.waitForTimeout(200);
  const d1 = await page.evaluate(() => { const ob = SCENE.sc.objs[0], o = SCENE.objs.get(ob.id); SCENE.poseFor('cam'); return {bq:Object.keys(ob.bq || {}), wy:SCENE.jointPts(o)[4].y, orb:SCENE.shotO.az, undo:!!document.querySelector('[data-act="unbend"]')}; });
  ok(d1.bq.join()==='bn_forearm01R' && d1.wy > w0.wy + 0.1 && d1.undo, '🦴 dragging her wrist bends her forearm up (saved as a bend, with ↺ Undo): ' + JSON.stringify({d1, w0}));
  await page.evaluate(() => ['.cols', '.hud'].forEach(k => document.querySelector(k).style.pointerEvents = ''));
  if(process.env.SHOT) await page.screenshot({path:process.env.SHOT + '/pose-bent.png'});
  // describe the action and paint it
  await page.fill('#sdesc', 'jumping'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-act="render"]').click());
  await page.waitForFunction(() => (SCENE.sc.objs[0].tries || []).length===4, null, {timeout:20000});
  const g = GRAPHS[GRAPHS.length - 1], pos = Object.values(g).find(n => n.class_type==='CLIPTextEncode').inputs.text, tr = await page.evaluate(() => SCENE.sc.objs[0].tries[0]);
  ok(/jumping/.test(pos) && !/standing/.test(pos) && /elliex/.test(pos) && tr.pm && tr.pm.length===16 && tr.mw.length===16 && tr.px.length===2, '🎬 the action goes in her prompt (no "standing"), and each try keeps its camera: ' + pos);
  // pick one, then match: DWPose "sees" her waving
  await page.evaluate(() => document.querySelector('[data-try="0"]').click()); await page.waitForTimeout(200);
  KP = await page.evaluate(() => { const ob = SCENE.sc.objs[0], o = SCENE.objs.get(ob.id), bq = ob.bq, P = SCENE.picPts(o, ob.shot); ob.pose = 'wave'; delete ob.bq; ob.mode = 'mq'; SCENE.poseFor('cam');
    const pts = SCENE.jointPts(o), flat = []; pts.forEach(p => { const [x, y] = P.toPx(p); flat.push(x / P.W, y / P.H, 0.9); }); const wr = pts[4].toArray(), el = pts[3].toArray(), kn = pts[9].toArray(); ob.pose = 'stand'; ob.bq = bq; ob.mode = 'shot'; SCENE.poseFor('cam');
    return {flat, W:P.W, H:P.H, wr, el, kn}; });
  ok(await page.evaluate(() => !!document.querySelector('[data-act="fit"]')), '📸 a picked picture offers 🦴 Match her skeleton to this picture');
  if(process.env.SHOT) await page.screenshot({path:process.env.SHOT + '/pose-pick.png'});
  await page.evaluate(() => document.querySelector('[data-act="fit"]').click());
  await page.waitForFunction(() => /skeleton matches|rror|No PC|nobody|not sure/.test((document.querySelector('#rmsg') || {}).textContent || ''), null, {timeout:20000});
  const f = await page.evaluate(() => { const ob = SCENE.sc.objs[0], o = SCENE.objs.get(ob.id); SCENE.poseFor('cam'); const p = SCENE.jointPts(o); return {msg:document.querySelector('#rmsg').textContent, mode:ob.mode, wr:p[4].toArray(), el:p[3].toArray(), kn:p[9].toArray(), bq:Object.keys(ob.bq || {}).length}; });

  const px = await page.evaluate(KP => { const ob = SCENE.sc.objs[0], o = SCENE.objs.get(ob.id), P = SCENE.picPts(o, ob.shot); SCENE.poseFor('cam'); return SCENE.jointPts(o).map((p, i) => { const [x, y] = P.toPx(p); return Math.round(Math.hypot(x - KP.flat[i * 3] * P.W, y - KP.flat[i * 3 + 1] * P.H)); }).slice(0, 14); }, KP);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), dw = dist(f.wr, KP.wr), de = dist(f.el, KP.el), dk = dist(f.kn, KP.kn);
  const dg = GRAPHS[GRAPHS.length - 1], dwn = Object.values(dg).find(n => n.class_type==='DWPreprocessor');
  ok(/matches/.test(f.msg) && f.mode==='mq' && Math.max(...px) <= 12 && dk < 0.02 && dwn.inputs.detect_body==='enable' && dwn.inputs.detect_hand==='disable', '🦴 her skeleton now waves like the picture: every joint within 12 px of it (' + px.join(' ') + '), legs kept (knee ' + dk.toFixed(3) + ' m); depth is the side nearest her rough pose (wrist ' + dw.toFixed(2) + ' m, elbow ' + de.toFixed(2) + ' m from the true wave): ' + JSON.stringify(f));
  if(process.env.SHOT){ await page.evaluate(() => document.querySelector('[data-v="persp"]').click()); await page.waitForTimeout(400); await page.screenshot({path:process.env.SHOT + '/pose-fit.png'}); }
  // 🎬 Act it out (Jordan 2026-10-29): from her A pose, MiniMax films the action, DWPose reads each frame, her skeleton follows as you scrub
  { const a0 = await page.evaluate(() => { const ob = SCENE.sc.objs[0]; ob.pose = 'apose'; delete ob.bq; ob.mode = 'mq'; SCENE.drawSel(); return !!document.querySelector('[data-act="render"]'); });
    const g0 = GRAPHS.length; await page.evaluate(() => { document.querySelector('#rmsg').textContent = ''; document.querySelector('[data-act="render"]').click(); }); await page.waitForFunction(() => /Pick/.test((document.querySelector('#rmsg') || {}).textContent || '') && !document.querySelector('[data-act="render"]').disabled, null, {timeout:20000});
    const pos2 = Object.values(GRAPHS[GRAPHS.length - 1]).find(n => n.class_type==='CLIPTextEncode').inputs.text;
    ok(a0 && !/jumping/.test(pos2) && /standing/.test(pos2), '🎬 in her A pose the painting is just her standing (the action is for the video): ' + pos2);
    await page.evaluate(() => document.querySelector('[data-try="1"]').click()); await page.waitForTimeout(200);
    // the frames DWPose "reads": her A pose, half way, waving (in the picked painting's pixels)
    ACT = await page.evaluate(() => { const ob = SCENE.sc.objs[0], o = SCENE.objs.get(ob.id), P = SCENE.picPts(o, ob.shot), m0 = ob.mode, fr = [];
      for(const pz of ['apose', 'wave']){ ob.pose = pz; ob.mode = 'mq'; SCENE.poseFor('cam'); const f = []; SCENE.jointPts(o).forEach(p => { const [x, y] = P.toPx(p); f.push(x / P.W, y / P.H, 0.9); }); fr.push(f); }
      ob.pose = 'apose'; ob.mode = m0; SCENE.poseFor('cam'); return [fr[0], fr[0].map((v, i) => i % 3===2 ? 0.9 : (v + fr[1][i]) / 2), null, fr[1]]; });
    const n0 = GRAPHS.length; await page.evaluate(() => document.querySelector('[data-act="actout"]').click());
    if(process.env.DBG) setTimeout(async () => console.log('RMSG', await page.evaluate(() => (document.querySelector('#rmsg') || {}).textContent + ' | ' + document.querySelector('[data-act="actout"]').disabled)), 4000);
    await page.waitForFunction(() => /Done: scrub|rror|No PC|nobody|not DWPose/.test((document.querySelector('#rmsg') || {}).textContent || ''), null, {timeout:30000});
    const ag = GRAPHS[n0] || {}, av = Object.values(ag), iv = (av.find(n => n.class_type==='MiniMaxH3ImageToVideo') || {}).inputs, dwn = (av.find(n => n.class_type==='DWPreprocessor') || {}).inputs;
    const A = await page.evaluate(() => { const ob = SCENE.sc.objs[0]; return {msg:document.querySelector('#rmsg').textContent, n:ob.act && ob.act.bq.length, f:ob.act && ob.act.f, file:ob.act && ob.act.file, scrub:!!document.querySelector('[data-scrub]'), vid:!document.querySelector('#viewvid').hidden && /Ellie_act/.test(document.querySelector('#viewvid').src)}; });
    ok(/Done/.test(A.msg) && iv && /jumping/.test(iv.prompt) && iv.length===124 && dwn && dwn.image[0]===av.indexOf(av.find(n => n.class_type==='VAEDecodeTiled')) + 1 + '' && A.n===4 && A.f===3 && A.scrub && A.vid,
      '🎬 one run on the PC films her (FL2V, the action in the prompt) and DWPose reads its frames; the video shows, a scrubber per frame: ' + JSON.stringify({A, prompt:iv && iv.prompt.slice(0, 120)}));
    const err = f => page.evaluate(([f, fl]) => { const ob = SCENE.sc.objs[0], o = SCENE.objs.get(ob.id), P = SCENE.picPts(o, ob.act.sh); SCENE.poseFor('cam'); return Math.max(...SCENE.jointPts(o).slice(2, 14).map((p, i) => { const [x, y] = P.toPx(p); return Math.round(Math.hypot(x - fl[(i + 2) * 3] * P.W, y - fl[(i + 2) * 3 + 1] * P.H)); })); }, [f, ACT[f]]);
    const eLast = await err(3);
    await page.evaluate(() => { const s = document.querySelector('[data-scrub]'); s.value = 0; s.dispatchEvent(new Event('input')); }); await page.waitForTimeout(100);
    const e0 = await err(0), lbl = await page.textContent('#actf'), f2 = await page.evaluate(() => { const s = document.querySelector('[data-scrub]'); s.value = 2; s.dispatchEvent(new Event('input')); return !!SCENE.sc.objs[0].bq; });
    ok(eLast <= 12 && e0 <= 12 && /Frame 1 of 4/.test(lbl) && f2, '🦴 scrubbing poses her skeleton like that frame (last ' + eLast + ' px, first ' + e0 + ' px off; a frame with nobody keeps the one before): ' + lbl);
    if(process.env.SHOT){ await page.evaluate(() => { const s = document.querySelector('[data-scrub]'); s.value = 3; s.dispatchEvent(new Event('input')); }); await page.waitForTimeout(400); await page.screenshot({path:process.env.SHOT + '/pose-act.png'}); } }
  // the views go all the way round her, under the floor and over her head (Jordan 2026-10-29)
  { const el = await page.evaluate(() => window.EL_MAX * 180 / Math.PI); ok(el >= 85, 'the views turn up to ' + Math.round(el) + '° above and below her'); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
