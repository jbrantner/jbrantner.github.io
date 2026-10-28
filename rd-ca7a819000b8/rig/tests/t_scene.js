// 🎬 Scene (Jordan 2026-10-27): a saved 3D space with Character Library characters placed in it as references (re-saving
// her in the library changes her in the scene), a layers-style object list where only the selected one moves, and flat
// Front / Side / Top views beside the 3D one. Run with RIG_DEPS (three.js) like t_view.js.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '';
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'scene.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:900} });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('dialog', d => d.accept());
  await page.route('https://app.test/rig/scene.html*', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  // a pretend Render: the library (Ellie, 8 eye-level angles, see-through) and the scenes store
  const H = {'access-control-allow-origin':'*'}, files = ['000', '045', '090', '135', '180', '225', '270', '315'];
  const lib = {name:'Ellie', subfolder:'Character Library/Ellie', saved:1000, trigger:'elliex', lora:'elliex.safetensors', geo:{wM:1.07, hM:1.87, aim:[0, 0.935, 0]}, ringEl:[-12, 5, 35, 20, -4],
    cover:'eye_000.png', views:files.map((f, i) => ({ring:1, i, mid:false, file:'eye_' + f + '.png'}))};
  // 🪑 and a chair in the Object Library, 0.9 m tall
  const chair = {name:'Chair', subfolder:'Object Library/Chair', saved:1000, kind:'obj', height:0.9, geo:{wM:1.07, hM:1.87}, ringEl:[-12, 5, 35, 20, -4], cover:'eye_000.png', views:files.map((f, i) => ({ring:1, i, mid:false, file:'eye_' + f + '.png'}))};
  const store = new Map(); let saves = 0; const UPS = [], GRAPHS = [];
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url());
    if(u.pathname==='/renderdeck/library') return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(u.searchParams.get('kind')==='obj' ? {library:1, kinds:['char', 'obj'], objects:[chair]} : {library:1, kinds:['char', 'obj'], characters:[lib]}) });
    if(u.pathname==='/renderdeck/scenes') return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({scenes:[...store.values()]}) });
    if(u.pathname==='/renderdeck/scenes/save'){ const b = JSON.parse(r.request().postData()); store.set(b.scene.id, b.scene); saves++; return r.fulfill({ contentType:'application/json', headers:H, body:'{"ok":true}' }); }
    if(u.pathname==='/renderdeck/scenes/delete'){ store.delete(JSON.parse(r.request().postData()).id); return r.fulfill({ contentType:'application/json', headers:H, body:'{"ok":true}' }); }
    // 🎬 a pretend ComfyUI for Render this angle
    const OI = {CheckpointLoaderSimple:['ckpt_name', ['iriselTouchIL_v10.safetensors']], LoraLoader:['lora_name', ['elliex.safetensors', 'AFKJ Style Illustrious Claude.safetensors']], ControlNetLoader:['control_net_name', ['illustriousXL_controlnetPromax.safetensors']], LoadBackgroundRemovalModel:['bg_removal_name', ['BiRefNet-general.safetensors']], FaceDetailer:['guide_size', ['x']], UltralyticsDetectorProvider:['model_name', ['bbox/face_yolov8m.pt']], SAMLoader:['model_name', ['sam_vit_b_01ec64.pth']]};
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(d ? {[oi[1]]:{input:{required:{[d[0]]:[d[1]]}}}} : {}) }); }
    if(u.pathname==='/upload/image'){ const body = r.request().postDataBuffer(), m = body.toString('latin1').match(/filename="([^"]+)"/); UPS.push({name:m && m[1], body}); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({name:m && m[1]}) }); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({prompt_id:'p' + GRAPHS.length}) }); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[GRAPHS.length - 1], save = Object.keys(g).find(k => g[k].class_type==='SaveImage');
      return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({[hi[1]]:{status:{status_str:'success'}, outputs:{[save]:{images:[0, 1, 2, 3].map(i => ({filename:'ellie_' + i + '.png', subfolder:'RenderDeck/scene', type:'output'}))}}}}) }); }
    if(u.pathname==='/view' && u.searchParams.get('filename')==='Anime_Female_A.fbx') return process.env.BODY_FBX ? r.fulfill({ contentType:'application/octet-stream', headers:H, body:fs.readFileSync(process.env.BODY_FBX) }) : r.fulfill({ status:404, headers:H, body:'' }); // 🧍 the base body (a bought model, only on Render)
    if(u.pathname==='/view' && /^ellie_/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="350"><rect width="200" height="350" fill="#fff"/><rect x="80" y="20" width="40" height="320" fill="#c33"/></svg>' }); // a PC without BiRefNet: on white
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/svg+xml', headers:H, body:u.searchParams.get('filename')==='eye_090.png' && u.searchParams.get('subfolder')==='Character Library/Ellie' // MiniMax drew this angle smaller
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="350"><rect x="85" y="100" width="30" height="240" fill="#c33"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="350"><rect x="80" y="20" width="40" height="320" fill="#c33"/></svg>' });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  await page.goto('https://app.test/rig/scene.html');
  await page.evaluate(() => localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})));
  await page.goto('https://app.test/rig/scene.html'); await page.waitForFunction(() => window.SCENE && SCENE.sc, null, {timeout:20000}); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => SCENE.sc.name==='Scene 1' && !!document.querySelector('#saved')), 'a first scene opens on its own') ;
  ok(saves >= 1 && store.size===1, 'and is kept on the PC (Scenes/ in the shared output): ' + saves);
  // ＋ Add a character from the library
  await page.click('#add'); await page.waitForSelector('#chars [data-ref]'); await page.click('#chars [data-ref]'); await page.waitForTimeout(600);
  const ob = await page.evaluate(() => JSON.parse(JSON.stringify(SCENE.sc.objs)));
  ok(ob.length===1 && ob[0].ref==='Character Library/Ellie' && ob[0].label==='Ellie' && await page.evaluate(() => SCENE.ui.sel===SCENE.sc.objs[0].id), 'she goes in as a reference to her library folder, selected');
  ok(await page.evaluate(() => /🧍 Ellie/.test(document.querySelector('#objs').textContent) && /elliex/.test(document.querySelector('#objs').textContent) && /LoRA/.test(document.querySelector('#selbox').textContent)), 'the object list shows her (with her LoRA trigger word)');
  // which picture each view shows
  const pick = v => page.evaluate(v => { SCENE.placeCams(SCENE.rects()); const o = [...SCENE.objs.values()][0]; SCENE.placeCams({[v]:{x:0, y:0, w:300, h:300}}); const a = SCENE.pickAngle(o, SCENE.camOf(v)); return a && decodeURIComponent(a.url); }, v);
  ok(/eye_000\.png/.test(await pick('front')) && /eye_090\.png/.test(await pick('side')), 'Front shows her front, Side her side: ' + await pick('front') + ' / ' + await pick('side'));
  await page.evaluate(() => { const r = document.querySelector('[data-n="rot"]'); r.value = 90; r.dispatchEvent(new Event('input')); });
  ok(/eye_270\.png/.test(await pick('front')), 'turned 90°, the Front view sees her other side: ' + await pick('front'));
  // drag her in the Front view: only once selected
  await page.click('.views [data-v="front"]'); await page.waitForTimeout(300);
  const box = await page.$('#stage').then(e => e.boundingBox());
  const drag = async (x0, y0, dx, dy) => { await page.mouse.move(box.x + x0, box.y + y0); await page.mouse.down(); await page.mouse.move(box.x + x0 + dx, box.y + y0 + dy, {steps:8}); await page.mouse.up(); await page.waitForTimeout(200); };
  // where she is on screen in the Front view: x=0 at the middle, her middle ~0.9 m up
  const at = await page.evaluate(() => { const r = SCENE.rects().front, C = SCENE.camOf('front'); SCENE.placeCams(SCENE.rects()); const p = new (C.position.constructor)(0, 0.9, 0).project(C); return [(p.x + 1) / 2 * r.w, (1 - p.y) / 2 * r.h, r.h, C.top - C.bottom]; });
  await drag(at[0], at[1], 60, 0);
  const x1 = await page.evaluate(() => SCENE.sc.objs[0].x), want = 60 * at[3] / at[2];
  ok(Math.abs(x1 - want) < 0.05, 'dragging her in Front moves her across by the same amount: ' + x1.toFixed(3) + ' m (want ' + want.toFixed(3) + ')');
  await page.evaluate(() => { document.querySelector('[data-sel]').click(); }); // deselect
  const before = await page.evaluate(() => JSON.stringify(SCENE.sc.objs[0]));
  const at2 = await page.evaluate(x => { const r = SCENE.rects().front, C = SCENE.camOf('front'); SCENE.placeCams(SCENE.rects()); const p = new (C.position.constructor)(x, 0.9, 0).project(C); return [(p.x + 1) / 2 * r.w, (1 - p.y) / 2 * r.h]; }, x1);
  await drag(at2[0], at2[1], 50, 0);
  ok(await page.evaluate(b => JSON.stringify(SCENE.sc.objs[0])===b, before), 'not selected, she stays put (the drag pans the view)');
  // Top view: no card, her ring and name on the floor
  await page.click('.views [data-v="top"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const o = [...SCENE.objs.values()][0]; SCENE.poseFor('top'); return !o.card.visible && o.disc.visible !== false && o.label.visible; }), 'Top shows where she stands and which way she faces, with her name');
  await page.click('.views [data-v="quad"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => Object.keys(SCENE.rects()).sort().join()==='front,persp,side,top' && document.querySelectorAll('.vlab').length===4), '⊞ All 4 shows 3D, Top, Front and Side together');
  // the reference: re-saved in the library, she is re-drawn from the new pictures
  lib.saved = 2000; await page.evaluate(() => SCENE.reload()); await page.waitForTimeout(300);
  ok(/v=2000/.test(await pick('front')), 're-saving her in the library changes her in the scene (a reference, not a copy)');
  // kept: reopening finds the scene and where she stands
  await page.waitForTimeout(900); await page.goto('https://app.test/rig/scene.html'); await page.waitForFunction(() => window.SCENE && SCENE.sc && SCENE.sc.objs.length, null, {timeout:20000});
  ok(await page.evaluate(x => Math.abs(SCENE.sc.objs[0].x - x) < 0.001 && SCENE.sc.objs[0].rot===90, x1), 'reopened, the scene has her where she was left');
  // a second scene, rename, delete
  await page.evaluate(() => { window.prompt = () => 'Library set'; }); await page.click('#new'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => SCENE.sc.name==='Library set' && !SCENE.sc.objs.length) && store.size===2, '＋ New starts an empty scene, kept as its own file');
  await page.click('#del'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => SCENE.sc.name==='Scene 1') && store.size===1, '🗑 deletes it and goes back to the other');
  // 🪑 ＋ Object: from the Object Library, stood at its real height
  await page.click('#addo'); await page.waitForSelector('#chars [data-ref]');
  ok(await page.evaluate(() => /Object Library/.test(document.querySelector('#pickh').textContent) && document.querySelectorAll('#chars [data-ref]').length===2 && !/Mannequin/.test(document.querySelector('#chars').textContent) && /Chair/.test(document.querySelector('#chars').textContent) && /Wooden chair \(3D\)/.test(document.querySelector('#chars').textContent)), '＋ Object lists only the Object Library, plus the built-in 3D chair');
  await page.click('#chars [data-ref="Object Library/Chair"]'); await page.waitForTimeout(800);
  const ch = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.kind==='obj'), o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('front');
    const ft = o.card.material.map && o.card.material.map.userData.feet; return {ref:ob.ref, sel:SCENE.ui.sel===ob.id, list:/🪑 Chair/.test(document.querySelector('#objs').textContent), tall:ft ? o.geo.hM * o.card.scale.y * ft.ht : null, smax:document.querySelector('[data-n="s"]').max}; });
  ok(ch.ref==='Object Library/Chair' && ch.sel && ch.list && Math.abs(ch.tall - 0.9) < 0.01 && ch.smax==='3', 'the chair goes in by reference, listed with 🪑, standing 0.9 m tall, its size up to 300%: ' + JSON.stringify(ch));
  // 🪑 the built-in 3D chair (Jordan 2026-10-28): a real model, no pictures, 0.9 m tall, turning with its spot
  await page.click('#addo'); await page.waitForSelector('#chars [data-ref="3D/Wooden chair"]'); await page.click('#chars [data-ref="3D/Wooden chair"]'); await page.waitForTimeout(500);
  const m3 = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='3D/Wooden chair'); ob.rot = 90; const o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('persp'); o.g.updateMatrixWorld(true);
    const b = new (o.g.position.constructor)(), box = {min:[9, 9, 9], max:[-9, -9, -9]}; o.mesh.traverse(m => { if(m.isMesh && m.material.side!==1){ m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); ['x', 'y', 'z'].forEach((k, i) => { box.min[i] = Math.min(box.min[i], bb.min[k]); box.max[i] = Math.max(box.max[i], bb.max[k]); }); } });
    return {card:o.card.visible, low:+(box.min[1] - ob.y).toFixed(3), tall:+(box.max[1] - box.min[1]).toFixed(2), turned:Math.abs(o.mesh.rotation.y - Math.PI / 2) < 1e-6}; });
  ok(!m3.card && Math.abs(m3.low) < 0.005 && Math.abs(m3.tall - 0.9) < 0.03 && m3.turned, '🪑 the built-in 3D chair stands on the floor, 0.9 m tall, no picture card, turns with its spot: ' + JSON.stringify(m3));
  // 🧍 the built-in mannequin: 1.7 m on the floor
  await page.click('#add'); await page.waitForSelector('#chars [data-ref="3D/Mannequin"]'); await page.click('#chars [data-ref="3D/Mannequin"]'); await page.waitForTimeout(500);
  const mq = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='3D/Mannequin'), o = SCENE.objs.get(ob.id); SCENE.poseFor('persp'); o.g.updateMatrixWorld(true); let lo = 9, hi = -9;
    o.mesh.traverse(m => { if(m.isMesh && m.material.side!==1){ m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); lo = Math.min(lo, bb.min.y); hi = Math.max(hi, bb.max.y); } }); return {low:+(lo - ob.y).toFixed(3), tall:+(hi - lo).toFixed(2)}; });
  ok(Math.abs(mq.low) < 0.005 && Math.abs(mq.tall - 1.7) < 0.03, '🧍 the built-in 3D mannequin is under ＋ Character and stands on the floor, 1.7 m tall: ' + JSON.stringify(mq));
  // 🎬 render this angle: Ellie as a mannequin, painted from the camera by a PC, picked, and standing back where she was
  { await page.evaluate(() => { window.RENDER_POLL = 50; const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); ob.x = 0; ob.z = 0; ob.rot = 0; ob.hide = false; SCENE.sc.objs.forEach(o => { if(o!==ob) o.hide = true; }); SCENE.ui.sel = ob.id; SCENE.setView('persp'); });
    await page.evaluate(() => SCENE.drawSel());
    await page.click('[data-mode="mq"]'); await page.waitForTimeout(300);
    const mqv = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'), o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('persp'); return {mq:o.mq.visible, card:o.card.visible, mode:ob.mode}; });
    ok(mqv.mq && !mqv.card && mqv.mode==='mq', '🧍 her mannequin shows in place of her angles: ' + JSON.stringify(mqv));
    // 📷 the Camera view keeps its angle while locked, and the render paints from it, not from Free
    const lk = await page.evaluate(async () => { SCENE.setView('cam'); await new Promise(r => setTimeout(r, 200)); return SCENE.shotO.az; });
    { const bx = await (await page.$('#stage')).boundingBox(); await page.mouse.move(bx.x + 30, bx.y + bx.height - 30); await page.mouse.down(); await page.mouse.move(bx.x + 200, bx.y + bx.height - 60, {steps:6}); await page.mouse.up(); }
    const lk2 = await page.evaluate(() => ({az:SCENE.shotO.az, lock:!!document.querySelector('#camlock') && /Locked/.test(document.querySelector('#camlock').textContent), ctl:!document.querySelector('#camctl').hidden}));
    ok(Math.abs(lk2.az - lk)<1e-9 && lk2.lock && lk2.ctl, '📷 dragging in the locked Camera view leaves its angle alone: ' + JSON.stringify({lk, ...lk2}));
    await page.evaluate(() => { SCENE.shotO.az = 0.3; SCENE.setView('persp'); SCENE.redraw(); });
    const rig = await page.evaluate(() => { SCENE.placeCams(SCENE.rects()); const a = SCENE.camRig.geometry.attributes.position; return {vis:SCENE.camRig.visible, n:a.count, tail:+Math.hypot(a.getX(3) - a.getX(2), a.getY(3) - a.getY(2), a.getZ(3) - a.getZ(2)).toFixed(3), toLens:+SCENE.camOf('cam').position.distanceTo(new (SCENE.shotO.t.constructor)(a.getX(3), a.getY(3), a.getZ(3))).toFixed(2) < +SCENE.camOf('cam').position.distanceTo(new (SCENE.shotO.t.constructor)(a.getX(2), a.getY(2), a.getZ(2))).toFixed(2), free:+SCENE.camOf('persp').position.distanceTo(SCENE.camOf('cam').position).toFixed(2)}; });
    ok(rig.tail===1.2 && rig.toLens && rig.free > 0.5, '🕹 Free view sees the Camera as a pink frame pointing back to its lens: ' + JSON.stringify(rig));
    await page.click('[data-act="render"]'); await page.waitForSelector('.tries [data-try]', {timeout:15000});
    const rv = await page.evaluate(() => ({view:SCENE.ui.view, az:SCENE.shotO.az}));
    ok(rv.view==='cam' && rv.az===0.3, '🎬 Render this angle switches to and paints from the 📷 Camera view: ' + JSON.stringify(rv));
    const g = GRAPHS[GRAPHS.length - 1], cls = Object.values(g).map(n => n.class_type), lor = Object.values(g).filter(n => n.class_type==='LoraLoader').map(n => n.inputs.lora_name), types = Object.values(g).filter(n => n.class_type==='SetUnionControlNetType').map(n => n.inputs.type);
    const lat = Object.values(g).find(n => n.class_type==='EmptyLatentImage').inputs, txt = Object.values(g).filter(n => n.class_type==='CLIPTextEncode').map(n => n.inputs.text).join(' | ');
    ok(UPS.length===2 && lor.includes('elliex.safetensors') && types.join()==='openpose,depth' && lat.batch_size===4 && lat.width % 64===0 && lat.height % 64===0 && cls.includes('RemoveBackground') && cls.includes('FaceDetailer') && cls.includes('SAMLoader') && /elliex/.test(txt),
      '🎬 Render this angle sends the mannequin\'s skeleton and depth, paints 4 with her LoRA on ProMax, fixes the faces and cuts them out: ' + JSON.stringify({ups:UPS.length, lor, types, lat, txt:txt.slice(0, 80)}));
    if(process.env.SHOT) UPS.forEach(u => { const b = u.body, i = b.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])); if(i >= 0) fs.writeFileSync(path.join(process.env.SHOT, u.name), b.subarray(i)); });
    await page.click('.tries [data-try="1"]'); await page.waitForTimeout(500);
    if(process.env.SHOT){ await page.waitForTimeout(400); await (await page.$('#selbox')).screenshot({path:path.join(process.env.SHOT, 'render-panel.png')}); await (await page.$('#stage')).screenshot({path:path.join(process.env.SHOT, 'render-stage.png')}); }
    const sh = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'), o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('cam'); o.g.updateMatrixWorld(true);
      const cam = SCENE.camOf('cam'), V = o.g.position.constructor, P2 = v => { const p = v.clone().project(cam); return [p.x, p.y]; }, a = P2(o.shot.localToWorld(new V(0, -0.5, 0))), b = P2(o.shot.localToWorld(new V(0, 0.5, 0)));
      const ft = (o.shot.material.map && o.shot.material.map.userData.feet) || null, foot = ft ? P2(o.shot.localToWorld(new V(ft.ax - 0.5, 0.5 - ft.ay, 0))) : null, spot = P2(new V(ob.x, ob.y, ob.z)), top = P2(new V(ob.x, ob.y + 1.7, ob.z));
      return {mode:ob.mode, vis:o.shot.visible, mq:o.mq.visible, file:ob.shot && ob.shot.file, footErr:foot ? +Math.hypot(foot[0] - spot[0], foot[1] - spot[1]).toFixed(3) : null, cardH:+Math.abs(b[1] - a[1]).toFixed(3), mqH:+Math.abs(top[1] - spot[1]).toFixed(3), low:ft ? +o.shot.localToWorld(new V(0, 0.5 - ft.by, 0)).y.toFixed(4) : null, sfy:ob.shot.fy, by:ft && ft.by}; });
    ok(sh.mode==='shot' && sh.vis && !sh.mq && sh.file==='ellie_1.png', '📸 the picked one stands in the scene in place of the mannequin: ' + JSON.stringify(sh));
    ok(sh.low!=null && sh.low >= -0.002 && sh.by > sh.sfy, '⬆ the rendered picture never dips under the floor: ' + JSON.stringify({low:sh.low, by:sh.by, fy:sh.sfy}));
    const cut = await page.evaluate(() => { const o = SCENE.objs.get(SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie').id), im = o.shot.material.map.image; if(!im.getContext) return {canvas:false}; const x = im.getContext('2d'); return {canvas:true, corner:x.getImageData(2, 2, 1, 1).data[3], body:x.getImageData(100, 200, 1, 1).data[3], thumb:/^data:/.test((document.querySelector('.tries img[data-u]') || {}).src || '')}; });
    ok(cut.canvas && cut.corner===0 && cut.body===255 && cut.thumb, '✂ a render that came back on white is cut out here (scene and thumbnails): ' + JSON.stringify(cut));
    await page.evaluate(() => { SCENE.sc.objs.forEach(o => { o.hide = false; if(o.mode) o.mode = 'pics'; }); }); }
  // 🕹 Free shows each picture as the 📷 Camera sees it: the same picture, flat, facing the Camera, not turning to Free
  const fr = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); ob.x = 0; ob.z = 0; ob.rot = 0; const o = SCENE.objs.get(ob.id);
    SCENE.shotO.az = 0; SCENE.placeCams(SCENE.rects()); SCENE.poseFor('cam'); const u0 = o.card.material.map && o.card.material.map.userData.url, y0 = new (o.g.position.constructor)(0, 0, 1).applyQuaternion(o.card.quaternion);
    const res = [0.9, 2.2].map(a => { SCENE.SET_ORBIT_AZ(a); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('persp'); const y = new (o.g.position.constructor)(0, 0, 1).applyQuaternion(o.card.quaternion); return {url:o.card.material.map && o.card.material.map.userData.url, dot:+y.dot(y0).toFixed(4)}; });
    return {u0:(u0 || '').match(/eye_\d+/) + '', res:res.map(r => ({url:(r.url || '').match(/eye_\d+/) + '', dot:r.dot})), same:res.every(r => r.url===u0 && r.dot > 0.9999)}; });
  ok(fr.same, '🕹 turning round in Free keeps the Camera\'s picture standing flat, facing the Camera: ' + JSON.stringify(fr));
  // 🧍 the base body (when the test is given it): the mannequin is her, posed, feet on the floor, and the guides' skeleton comes from her bones
  if(process.env.BODY_FBX){ await page.waitForFunction(() => SCENE.BODY, null, {timeout:30000}); await page.waitForTimeout(300);
    const bd = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); ob.mode = 'mq'; ob.hide = false; const res = {};
      for(const k of ['stand', 'wave', 'sit']){ ob.pose = k; const o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('cam'); o.g.updateMatrixWorld(true);
        const J = SCENE.bodyJoints(o.mq), V = J[0].constructor, box = new (o.g.position.constructor)(); let lo = 9, hi = -9; const p = new V(); o.mq.traverse(m => { if(m.isSkinnedMesh) for(let i = 0; i < m.geometry.attributes.position.count; i += 13){ m.getVertexPosition(i, p); p.applyMatrix4(m.matrixWorld); lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); } });
        res[k] = {body:!!o.mq.userData.body, lo:+lo.toFixed(3), hi:+hi.toFixed(3), wristR:+J[4].y.toFixed(2), nose:+J[0].y.toFixed(2), hip:+J[8].y.toFixed(2), noseZ:+(J[0].z - J[1].z).toFixed(3), eyesSide:+(J[14].x - J[15].x).toFixed(3)}; }
      ob.pose = 'stand'; return res; });
    ok(bd.stand.body && Math.abs(bd.stand.lo) < 0.03 && bd.stand.hi > 1.5 && bd.stand.noseZ > 0.05 && bd.stand.eyesSide < 0, '🧍 the mannequin is the base body, standing on the floor, face points the right way: ' + JSON.stringify(bd.stand));
    ok(bd.wave.wristR > bd.wave.nose && Math.abs(bd.wave.lo) < 0.03, '👋 Waving puts her right hand above her head, feet still on the floor: ' + JSON.stringify(bd.wave));
    ok(bd.sit.hip < bd.stand.hip - 0.2 && Math.abs(bd.sit.lo) < 0.03, '🪑 Sitting drops her hips with her feet still on the floor: ' + JSON.stringify(bd.sit));
    if(process.env.SHOT){ await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); SCENE.sc.objs.forEach(o => { o.hide = o!==ob; }); ob.pose = 'hip'; SCENE.ui.sel = ob.id; SCENE.drawSel(); SCENE.setView('cam'); });
      await page.waitForTimeout(500); await page.screenshot({path:path.join(process.env.SHOT, 'body-scene.png'), fullPage:true});
    }
    await page.evaluate(() => { SCENE.sc.objs.forEach(o => { o.hide = false; if(o.mode) o.mode = 'pics'; }); }); }
  // 📏 even size: an angle MiniMax drew smaller is scaled up to the others at that height, so she is the same height all round
  const ev = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.kind!=='obj'); ob.rot = 0; const o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects());
    const tall = v => { SCENE.poseFor(v); const ft = o.card.material.map && o.card.material.map.userData.feet; return {url:(o.card.material.map.userData.url || o.card.material.map.image && o.card.material.map.image.src || '').match(/eye_\d+/) + '', h:ft ? +(o.geo.hM * o.card.scale.y * ft.ht).toFixed(3) : null}; };
    return {front:tall('front'), side:tall('side')}; });
  ok(ev.front.h && ev.side.h && /090/.test(ev.side.url) && Math.abs(ev.front.h - ev.side.h) < 0.01, '📏 an angle drawn smaller is shown the same height as the rest: ' + JSON.stringify(ev));
  // 🖼 a card off to the side stands upright and leans with the perspective like the 3D chair beside it (Jordan 2026-10-28)
  const fl = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Object Library/Chair'); ob.x = 2.5; ob.z = 0; const o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('cam');
    const cam = SCENE.camOf('cam'), V = o.card.position.constructor, up = new V(0, 1, 0).applyQuaternion(o.card.quaternion), P = (x, y) => o.card.localToWorld(new V(x, y, 0)).project(cam);
    o.card.updateMatrixWorld(true); const a = P(0, -0.5), b = P(0, 0.5), w0 = new V(o.g.position.x, 0, o.g.position.z).project(cam), w1 = new V(o.g.position.x, 1, o.g.position.z).project(cam);
    const ang = (p, q2) => Math.atan2((q2.x - p.x) * cam.aspect, q2.y - p.y) * 180 / Math.PI;
    return {vis:o.card.visible, upright:+up.y.toFixed(4), cardLean:+ang(a, b).toFixed(2), worldLean:+ang(w0, w1).toFixed(2)}; });
  ok(fl.vis && fl.upright===1 && Math.abs(fl.cardLean - fl.worldLean) < 0.05 && Math.abs(fl.worldLean) > 0.2, '🖼 a card off to the side stands upright, so it leans with the perspective exactly like a 3D upright beside it: ' + JSON.stringify(fl));
  if(process.env.SHOT){ await page.click('.views [data-v="persp"]'); await page.click('[data-sel]'); await page.waitForTimeout(500); await page.screenshot({path:process.env.SHOT + '/scene3d.png', fullPage:true}); await page.click('.views [data-v="quad"]'); await page.waitForTimeout(500); await page.screenshot({path:process.env.SHOT + '/scenequad.png'}); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
