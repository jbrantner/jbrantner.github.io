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
  await page.route(/https:\/\/app\.test\/rig\/(body|hair|look|orbit|bvh)\.js/, r => r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(path.join(__dirname, '..', new URL(r.request().url()).pathname.split('/').pop())) })); // 🧍 the base body, shared with the Mannequin page
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  // a pretend Render: the library (Ellie, 8 eye-level angles, see-through) and the scenes store
  const H = {'access-control-allow-origin':'*'}, files = ['000', '045', '090', '135', '180', '225', '270', '315'];
  const lib = {name:'Ellie', subfolder:'Character Library/Ellie', saved:1000, trigger:'elliex', lora:'elliex.safetensors', prompt:'elliex, 1girl, solo', tags:'1girl, solo, blue hair, standing, brown_boots, full body', geo:{wM:1.07, hM:1.87, aim:[0, 0.935, 0]}, ringEl:[-12, 5, 35, 20, -4],
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
    const OI = {CheckpointLoaderSimple:['ckpt_name', ['iriselTouchIL_v10.safetensors']], LoraLoader:['lora_name', ['elliex.safetensors', 'AFKJ Style Illustrious Claude.safetensors']], ControlNetLoader:['control_net_name', ['illustriousXL_controlnetPromax.safetensors']], LoadBackgroundRemovalModel:['bg_removal_name', ['BiRefNet-general.safetensors']], FaceDetailer:['guide_size', ['x']], UltralyticsDetectorProvider:['model_name', ['bbox/face_yolov8m.pt']], SAMLoader:['model_name', ['sam_vit_b_01ec64.pth']], UltimateSDUpscaleNoUpscale:['mode_type', ['Linear']], RenderDeckUpscaleColorFix:['levels', ['x']], RenderDeckCutoutColorMatch:['strength', ['x']], DetailerForEach:['guide_size', ['x']], MaskToSEGS:['combined', ['x']], SAMDetectorCombined:['detection_hint', ['mask-points']]};
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(d ? {[oi[1]]:{input:{required:{[d[0]]:oi[1]==='LoadBackgroundRemovalModel' ? ['COMBO', {options:d[1]}] : [d[1]]}}}} : {}) }); } // BiRefNet's loader answers in the newer COMBO shape, as on the real PCs
    if(u.pathname==='/upload/image'){ const body = r.request().postDataBuffer(), m = body.toString('latin1').match(/filename="([^"]+)"/); UPS.push({name:m && m[1], body}); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({name:m && m[1]}) }); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({prompt_id:'p' + GRAPHS.length}) }); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[GRAPHS.length - 1], save = Object.keys(g).find(k => g[k].class_type==='SaveImage');
      return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({[hi[1]]:{status:{status_str:'success'}, outputs:{[save]:{images:[0, 1, 2, 3].map(i => ({filename:'ellie_' + i + '.png', subfolder:'RenderDeck/scene', type:'output'}))}}}}) }); }
    if(u.pathname==='/view' && u.searchParams.get('filename')==='Anime_Female_A.fbx') return process.env.BODY_FBX ? r.fulfill({ contentType:'application/octet-stream', headers:H, body:fs.readFileSync(process.env.BODY_FBX) }) : r.fulfill({ status:404, headers:H, body:'' }); // 🧍 the base body (a bought model, only on Render)
    if(u.pathname==='/view' && /^rd-scene-depth-/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="350"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#444"/></radialGradient></defs><rect width="200" height="350" fill="#000"/><ellipse cx="100" cy="175" rx="60" ry="160" fill="url(#g)"/></svg>' }); // her depth guide: a rounded body
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
  // 🧍 Jordan 2026-10-28: in a scene she is only Mannequin (the default) or Rendered, no 🖼 Her angles
  const md = await page.evaluate(() => { const ob = SCENE.sc.objs[0], o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('persp'); const rp = document.querySelector('#selbox [data-act="repaint"]'); return {mq:o.mq && o.mq.visible, card:o.card.visible, btns:[...document.querySelectorAll('#selbox [data-mode], #selbox [data-act="render"], #selbox [data-act="hi"]')].length, rp:!!rp && rp.disabled, gone:['#d3', '#d2', '#rall'].every(k => document.querySelector(k).hidden)}; });
  ok(md.mq && !md.card && !md.btns && md.rp && md.gone, 'she is always her mannequin in a scene: no picture cards, no Render this angle or High res, 🖌 Repaint just her waits for a 🎬 Render Scene: ' + JSON.stringify(md));
  await page.evaluate(() => { window.SHOW_PICS = true; SCENE.sc.d3 = false; SCENE.sc.objs[0].mode = 'pics'; }); // the picture-card checks below (🌄 Environment objects still use them)
  const pick = v => page.evaluate(v => { SCENE.placeCams(SCENE.rects()); const o = [...SCENE.objs.values()][0]; SCENE.placeCams({[v]:{x:0, y:0, w:300, h:300}}); const a = SCENE.pickAngle(o, SCENE.camOf(v)); return a && decodeURIComponent(a.url); }, v);
  ok(/eye_000\.png/.test(await pick('front')) && /eye_090\.png/.test(await pick('side')), 'Front shows her front, Side her side: ' + await pick('front') + ' / ' + await pick('side'));
  await page.evaluate(() => { const r = document.querySelector('[data-n="rot"]'); r.value = 90; r.dispatchEvent(new Event('input')); });
  ok(/eye_270\.png/.test(await pick('front')), 'turned 90°, the Front view sees her other side: ' + await pick('front'));
  // drag her in the Front view: only once selected
  await page.click('#orthob'); await page.click('#ortho [data-v="front"]'); await page.waitForTimeout(300);
  const box = await page.$('#stage').then(e => e.boundingBox());
  // (the full-screen Scene's top bar and layer list float over the viewer: drags here reach the viewer under them)
  const thru = on => page.evaluate(on => document.querySelectorAll('.cols, .hud').forEach(e => { e.style.pointerEvents = on ? 'none' : ''; }), on);
  const drag = async (x0, y0, dx, dy) => { await thru(true); await page.mouse.move(box.x + x0, box.y + y0); await page.mouse.down(); await page.mouse.move(box.x + x0 + dx, box.y + y0 + dy, {steps:8}); await page.mouse.up(); await page.waitForTimeout(200);  await thru(false); };
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
  await page.click('#orthob'); await page.click('#ortho [data-v="top"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const o = [...SCENE.objs.values()][0]; SCENE.poseFor('top'); return !o.card.visible && o.disc.visible !== false && o.label.visible; }), 'Top shows where she stands and which way she faces, with her name');
  await page.click('#orthob'); await page.click('#ortho [data-v="quad"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => Object.keys(SCENE.rects()).sort().join()==='front,persp,side,top' && document.querySelectorAll('.vlab').length===4), '⊞ All 4 shows 3D, Top, Front and Side together');
  // the reference: re-saved in the library, she is re-drawn from the new pictures
  lib.saved = 2000; await page.evaluate(() => SCENE.reload()); await page.waitForTimeout(300);
  ok(/v=2000/.test(await pick('front')), 're-saving her in the library changes her in the scene (a reference, not a copy)');
  // kept: reopening finds the scene and where she stands
  await page.waitForTimeout(900); await page.goto('https://app.test/rig/scene.html'); await page.waitForFunction(() => window.SCENE && SCENE.sc && SCENE.sc.objs.length, null, {timeout:20000}); await page.evaluate(() => { window.SHOW_PICS = true; });
  ok(await page.evaluate(x => Math.abs(SCENE.sc.objs[0].x - x) < 0.001 && SCENE.sc.objs[0].rot===90, x1), 'reopened, the scene has her where she was left');
  // a second scene, rename, delete
  await page.evaluate(() => { window.prompt = () => 'Library set'; }); await page.evaluate(() => document.querySelector('#new').click()); await page.waitForTimeout(800);
  ok(await page.evaluate(() => SCENE.sc.name==='Library set' && !SCENE.sc.objs.length) && store.size===2, '＋ New starts an empty scene, kept as its own file');
  await page.evaluate(() => document.querySelector('#del').click()); await page.waitForTimeout(500);
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
  // 🧍 Ellie as her mannequin in the 📷 Camera
  { await page.evaluate(() => { window.RENDER_POLL = 50; const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); ob.x = 0; ob.z = 0; ob.rot = 0; ob.hide = false; SCENE.sc.objs.forEach(o => { if(o!==ob) o.hide = true; }); SCENE.ui.sel = ob.id; SCENE.setView('persp'); });
    await page.evaluate(() => SCENE.drawSel());
    await page.evaluate(() => { SCENE.sc.d3 = true; }); await page.waitForTimeout(300);
    const mqv = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'), o = SCENE.objs.get(ob.id); SCENE.placeCams(SCENE.rects()); SCENE.poseFor('persp'); return {mq:o.mq.visible, card:o.card.visible, mode:ob.mode}; });
    ok(mqv.mq && !mqv.card, '🧍 her mannequin shows in place of her angles: ' + JSON.stringify(mqv));
    // 📷 the Camera view keeps its angle while locked, and the render paints from it, not from Free
    const lk = await page.evaluate(async () => { SCENE.setView('cam'); await new Promise(r => setTimeout(r, 200)); return SCENE.shotO.az; });
    { const bx = await (await page.$('#stage')).boundingBox(); await thru(true); await page.mouse.move(bx.x + 30, bx.y + bx.height - 30); await page.mouse.down(); await page.mouse.move(bx.x + 200, bx.y + bx.height - 60, {steps:6}); await page.mouse.up(); await thru(false); }
    const lk2 = await page.evaluate(() => ({az:SCENE.shotO.az, lock:!!document.querySelector('#camlock') && /Locked/.test(document.querySelector('#camlock').textContent), ctl:!document.querySelector('#camctl').hidden}));
    ok(Math.abs(lk2.az - lk)<1e-9 && lk2.lock && lk2.ctl, '📷 dragging in the locked Camera view leaves its angle alone: ' + JSON.stringify({lk, ...lk2}));
    await page.evaluate(() => { SCENE.shotO.az = 0.3; SCENE.setView('persp'); SCENE.redraw(); });
    const rig = await page.evaluate(() => { SCENE.placeCams(SCENE.rects()); const a = SCENE.camRig.geometry.attributes.position; return {vis:SCENE.camRig.visible, n:a.count, tail:+Math.hypot(a.getX(3) - a.getX(2), a.getY(3) - a.getY(2), a.getZ(3) - a.getZ(2)).toFixed(3), toLens:+SCENE.camOf('cam').position.distanceTo(new (SCENE.shotO.t.constructor)(a.getX(3), a.getY(3), a.getZ(3))).toFixed(2) < +SCENE.camOf('cam').position.distanceTo(new (SCENE.shotO.t.constructor)(a.getX(2), a.getY(2), a.getZ(2))).toFixed(2), free:+SCENE.camOf('persp').position.distanceTo(SCENE.camOf('cam').position).toFixed(2)}; });
    ok(rig.tail===1.2 && rig.toLens && rig.free > 0.5, '🕹 Free view sees the Camera as a pink frame pointing back to its lens: ' + JSON.stringify(rig));
    await page.evaluate(() => { SCENE.sc.d3 = false; SCENE.sc.objs.forEach(o => { o.hide = false; if(o.mode) o.mode = 'pics'; }); }); }
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
  if(process.env.SHOT){ await page.click('.views [data-v="persp"]'); await page.click('[data-sel]'); await page.waitForTimeout(500); await page.screenshot({path:process.env.SHOT + '/scene3d.png', fullPage:true}); await page.click('#orthob'); await page.click('#ortho [data-v="quad"]'); await page.waitForTimeout(500); await page.screenshot({path:process.env.SHOT + '/scenequad.png'}); }
  // 💡 the light (Jordan 2026-10-28): a sun lights the 3D stand-ins with shadows, and that light multiplies the 📷 Camera view
  { await page.evaluate(() => { window.SHOW_PICS = false; SCENE.sc.d3 = true; SCENE.sc.objs.forEach(o => { o.hide = false; if(o.kind!=='obj') o.mode = 'mq'; }); scrollTo(0, 0); });
    await page.evaluate(() => document.querySelector('#lon').click()); await page.waitForTimeout(600);
    const mean = () => page.evaluate(() => new Promise(res => { requestAnimationFrame(() => requestAnimationFrame(() => { const c = document.querySelector('#stage canvas'), x = document.createElement('canvas'); x.width = 64; x.height = 64; const g = x.getContext('2d'); g.drawImage(c, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; let t = 0; for(let i = 0; i < d.length; i += 4) t += d[i] + d[i + 1] + d[i + 2]; res(t / (64 * 64 * 3)); })); }));
    const st = await page.evaluate(() => ({on:SCENE.sc.light && SCENE.sc.light.on, view:SCENE.ui.view, box:!!document.querySelector('[data-l="turn"]')}));
    const set = (k, v) => page.evaluate(([k, v]) => { const i = document.querySelector(`[data-l="${k}"]`); i.value = v; i.dispatchEvent(new Event('input')); }, [k, v]);
    await set('power', 2); await set('fillK', 0.6); const hiM = await mean(); await set('power', 0.1); await set('fillK', 0.1); const loM = await mean(); await set('power', 1); await set('fillK', 0.45);
    ok(st.on && st.view==='cam' && st.box && hiM > loM + 8, '💡 the light shows in the Camera view, and a stronger light makes it brighter: ' + JSON.stringify({st, hiM:+hiM.toFixed(1), loM:+loM.toFixed(1)}));
    { await page.evaluate(() => SCENE.setView('top')); await page.waitForTimeout(300);
      const at = await page.evaluate(() => { const R = SCENE.rects(), r = R.top, b = document.querySelector('#stage').getBoundingClientRect(); SCENE.placeCams(R); const c = SCENE.camOf('top'), p = SCENE.sunMark.getWorldPosition(new (SCENE.sunMark.position.constructor)()).project(c);
        return {x:b.left + r.x + (p.x + 1) / 2 * r.w, y:b.top + r.y + (1 - p.y) / 2 * r.h, cx:b.left + r.x + r.w / 2, cy:b.top + r.y + r.h / 2, turn:SCENE.sc.light.turn}; });
      await thru(true); await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + (at.cx - at.x) * 2, at.y + (at.cy - at.y) * 2, {steps:8}); await page.mouse.up(); await thru(false); await page.waitForTimeout(200);
      const lt = await page.evaluate(() => ({turn:SCENE.sc.light.turn, up:SCENE.sc.light.up, shown:document.querySelector('[data-v="turn"]').textContent}));
      ok(Math.abs(((lt.turn - at.turn + 540) % 360) - 180) > 120 && lt.up >= 5 && lt.up <= 85 && lt.shown===lt.turn + '°', '☀ dragging the sun across the Top view moves where the light comes from (and the sliders follow): ' + JSON.stringify({from:at.turn, to:lt})); }
    const sm = await page.evaluate(() => { SCENE.setView('persp'); return new Promise(r => setTimeout(() => r(SCENE.sunMark.visible || true), 200)); }); await page.evaluate(() => SCENE.setView('cam'));
    if(process.env.SHOT){ await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); ob.pose = 'wave'; SCENE.redraw(); }); await page.waitForTimeout(400); await page.screenshot({path:process.env.SHOT + '/scene-light.png'});  await page.evaluate(() => { window.LIGHT_ONLY = true; SCENE.setView('cam'); }); await page.waitForTimeout(400); await page.screenshot({path:process.env.SHOT + '/scene-lightonly.png'}); await page.evaluate(() => { SCENE.sc.light = Object.assign({}, SCENE.sc.light, {power:2, fillK:0}); SCENE.redraw(); }); await page.waitForTimeout(400); await page.screenshot({path:process.env.SHOT + '/scene-lightonly2.png'}); await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); ob.mode = 'mq'; SCENE.redraw(); }); await page.waitForTimeout(400); await page.screenshot({path:process.env.SHOT + '/scene-lightonly3.png'}); await page.evaluate(() => { window.LIGHT_ONLY = false; }); } }
  // 🎬 Render Scene (renovated, Jordan 2026-10-29): ONE painting of the whole Camera view from all the mannequins (so people can overlap),
  // each one's region from the 3D mannequins, then each character's own pass with only her LoRA, back to front; 🖌 Repaint just her
  { await page.evaluate(() => { SCENE.sc.d3 = true; SCENE.sc.light = Object.assign({}, SCENE.sc.light, {on:false}); const ob = SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie'); ob.x = -0.15; ob.z = -0.5; ob.rot = 0; ob.pose = 'sit';
      const two = Object.assign(JSON.parse(JSON.stringify(ob)), {id:'ellie2', label:'Ellie 2', x:0.15, z:0.4, pose:'stand', words:''}); SCENE.sc.objs.push(two);
      SCENE.sc.objs.forEach(o => { o.hide = !(o.ref==='Character Library/Ellie' || o.ref==='3D/Wooden chair'); }); SCENE.shotO.az = 0; SCENE.sc.cam = undefined;
      document.querySelector('#allmsg').textContent = ''; scrollTo(0, 0); SCENE.reload(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { SCENE.sc.desc = 'hug'; SCENE.sc.objs.find(o => o.ref==='Character Library/Ellie').words = 'angry'; });
    const n0 = GRAPHS.length, u0 = UPS.length; await page.click('#rscene'); await page.waitForFunction(() => /Done|rror|No PC|not/i.test((document.querySelector('#allmsg') || {}).textContent || ''), null, {timeout:30000});
    const msgT = await page.textContent('#allmsg'), g = GRAPHS[GRAPHS.length - 1], v = Object.values(g), cls = v.map(n => n.class_type), ups = UPS.slice(u0), un = ups.map(u => u.name), txt = v.filter(n => n.class_type==='CLIPTextEncode').map(n => n.inputs.text);
    const ks = v.find(n => n.class_type==='KSampler'), lat = v.find(n => n.class_type==='EmptyLatentImage'), types = v.filter(n => n.class_type==='SetUnionControlNetType').map(n => n.inputs.type), sc = v.find(n => n.class_type==='ImageScale');
    const dfe = v.filter(n => n.class_type==='DetailerForEach'), cnt = c => cls.filter(x => x===c).length, img = id => g[id[0]], maskOf = d => { let n = img(d.inputs.segs); while(n.class_type!=='LoadImage') n = img(n.inputs.mask || n.inputs.destination || n.inputs.image); return n.inputs.image; };
    // (the first pass's mask: MaskToSEGS ← subtract ← add ← grow ← ImageToMask ← LoadImage of her mask)
    ok(/Done/.test(msgT) && GRAPHS.length===n0 + 1 && ks.inputs.denoise===1 && lat && lat.inputs.batch_size===1 && !v.some(n => n.class_type==='LoadImage' && /flat/.test(n.inputs.image)) && types.join()==='depth,openpose,depth' && sc && sc.inputs.width===Math.round(lat.inputs.width * 1.5 / 8) * 8 && cnt('ConditioningSetMask')===4,
      '🎬 one painting from scratch (no flat cut-outs under it): every mannequin\'s depth + skeleton, a region each for both Ellies, the chair and the background, then 1.5×: ' + JSON.stringify({msgT, lat:lat && lat.inputs, sc:sc && [sc.inputs.width, sc.inputs.height], masks:cnt('ConditioningSetMask')}));
    const neg = txt.find(t => /^worst quality/.test(t)) || '';
    ok(txt.some(t => /^AFKJ Style, 2girls, multiple girls, hug$/.test(t)) && !/2girls/.test(neg) && txt.some(t => /^AFKJ Style, elliex, 1girl, blue hair.*sitting, angry, masterpiece/.test(t) && !/solo/.test(t)) && txt.some(t => /wooden chair/.test(t)),
      '🏷 over everything: how many people + 📝 the scene words; each one\'s own words in her region, and "2girls" is no longer in the negative: ' + JSON.stringify(txt.map(t => t.slice(0, 60))));
    ok(dfe.length===4 && cnt('SAMDetectorCombined')===4 && !cnt('ImpactSegsAndMask') && dfe.filter(d => d.inputs.denoise===0.35).every(d => d.inputs.feather===32 && d.inputs.noise_mask_feather===32) && dfe.filter(d => d.inputs.denoise===0.5).length===2 && dfe.filter(d => d.inputs.denoise===0.35).length===2 && v.filter(n => n.class_type==='LoraLoader' && n.inputs.lora_name==='elliex.safetensors' && n.inputs.strength_model===1).length===3 && (() => { const k = v.find(n => n.class_type==='KSampler'); let m = g[k.inputs.model[0]]; const l = []; while(m.class_type==='LoraLoader'){ l.push(m.inputs.lora_name); m = g[m.inputs.model[0]]; } return l.join()==='elliex.safetensors,AFKJ Style Illustrious Claude.safetensors'; })(),
      '🧍 the first painting has their LoRAs + the style LoRA (v.294 without them swapped the girls\' hair); then each Ellie gets her own pass (her mask + what SAM finds of her, her LoRA only, 0.5) and her face (0.35, face-shaped by SAM, feathered 32): ' + JSON.stringify({dfe:dfe.length, lora:v.filter(n => n.class_type==='LoraLoader').map(n => n.inputs.lora_name + ' ' + n.inputs.strength_model)}));
    { const kss = v.filter(n => n.class_type==='KSampler'), bl = kss.find(k => k.inputs.denoise===0.25), save = v.find(n => n.class_type==='SaveImage'), cfx = g[save.inputs.images[0]], dec = g[cfx.inputs.image[0]], enc = bl && g[bl.inputs.latent_image[0]];
      const lor = []; let m = bl && g[bl.inputs.model[0]]; while(m && m.class_type==='LoraLoader'){ lor.push(m.inputs.lora_name); m = g[m.inputs.model[0]]; }
      const bgk = kss.find(k => k.inputs.denoise===0.6), bgl = []; { let m = bgk && g[bgk.inputs.model[0]]; while(m && m.class_type==='LoraLoader'){ bgl.push(m.inputs.lora_name); m = g[m.inputs.model[0]]; } }
      ok(kss.length===3 && bgk && bgl.join()==='AFKJ Style Illustrious Claude.safetensors' && g[bgk.inputs.latent_image[0]].class_type==='SetLatentNoiseMask', '🌄 after the first painting the background is painted again on its own, style LoRA only (no character LoRAs, no people): ' + JSON.stringify(bgl));
      ok(cfx.class_type==='RenderDeckCutoutColorMatch' && cfx.inputs.strength===0.85 && g[cfx.inputs.image_ref[0]].class_type==='ImageScale', '🎨 the finished picture is colour-matched back to the first painting (passes through the VAE wash it out)');
      ok(bl && dec.class_type==='VAEDecodeTiled' && enc.class_type==='VAEEncodeTiled' && g[enc.inputs.pixels[0]].class_type==='DetailerForEach' && g[bl.inputs.positive[0]].class_type==='ConditioningCombine' && lor.join()==='elliex.safetensors,AFKJ Style Illustrious Claude.safetensors' && await page.evaluate(() => document.querySelector('#rblend').getAttribute('aria-pressed')==='true'),
        '🎞 then the blend: the finished picture once more at 0.25, same regions and LoRAs as the first painting, no ControlNet (🎞 on by default): ' + JSON.stringify({kss:kss.map(k => k.inputs.denoise), lor})); }
    const body = dfe.filter(d => d.inputs.denoise===0.5), first = maskOf(body[0]), fr = ups.filter(u => /^rd-scene-front\d/.test(u.name)), far = fr.find(u => /front0/.test(u.name)), near = fr[fr.length - 1]; // (Ellie is item 0, far back; Ellie 2 the last, in front)
    ok(/^rd-scene-mask0-/.test(first) && fr.length===2 && far.body.length > near.body.length && un.filter(n => /^rd-scene-mask\d/.test(n)).length===4,
      '↕ the farther Ellie goes first (the nearer one is painted on top), and only the farther one has someone in front of her to keep clear of: ' + JSON.stringify({first, front:fr.map(u => u.name + ' ' + u.body.length)}));
    if(process.env.SHOT) ups.forEach(u => { const b = u.body, i = b.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])); if(i >= 0) fs.writeFileSync(path.join(process.env.SHOT, u.name.replace(/-[a-z0-9]+\.png$/, '.png')), b.subarray(i)); });
    { const vs = await page.evaluate(() => { const v = document.querySelector('#viewimg'), vb = v.getBoundingClientRect(), lb = document.querySelector('.cols').getBoundingClientRect(); return {clear:vb.bottom <= lb.top + 1 && !document.querySelector('#camctl').hidden===false, thumbs:[...document.querySelectorAll('#final .rthumbs span')].map(x => x.textContent.split(' · ')[0]), shown:!v.hidden && !!SCENE.sc.scene && v.src.includes(encodeURIComponent(SCENE.sc.scene.file)), renders:(SCENE.sc.renders || []).map(r => r.kind), who:SCENE.sc.scene.who.length}; });
      ok(vs.shown && vs.clear && vs.thumbs[0]==='🎬 Scene' && vs.renders[0]==='scene' && vs.who===2, '🎬 the rendered scene shows in the viewer and first in 🖼 Renders: ' + JSON.stringify(vs)); }
    // 🖌 Repaint just her: her own pass again on the last render, nothing else
    await page.evaluate(() => { SCENE.ui.sel = 'ellie2'; SCENE.drawSel(); }); await page.waitForTimeout(200);
    const en = await page.evaluate(() => !document.querySelector('#selbox [data-act="repaint"]').disabled), f0 = await page.evaluate(() => SCENE.sc.scene.file);
    const n1 = GRAPHS.length, u1 = UPS.length; await page.click('#selbox [data-act="repaint"]'); await page.waitForFunction(() => /Done|rror|not|moved/i.test((document.querySelector('#rmsg') || {}).textContent || ''), null, {timeout:30000});
    const g2 = GRAPHS[GRAPHS.length - 1], v2 = Object.values(g2), c2 = v2.map(n => n.class_type), u2 = UPS.slice(u1).map(u => u.name), rm = await page.textContent('#rmsg');
    ok(en && /Done/.test(rm) && GRAPHS.length===n1 + 1 && c2.filter(c => c==='DetailerForEach').length===2 && !c2.includes('KSampler') && !c2.includes('ConditioningSetMask') && u2.some(n => /^rd-scene-last-/.test(n)) && u2.some(n => /^rd-scene-mask-/.test(n)) && u2.some(n => /^rd-scene-front-/.test(n)),
      '🖌 Repaint just her sends the last render with her mask and only redoes her pass: ' + JSON.stringify({en, rm, cls:c2, ups:u2}));
    // 🖌 Repaint the background: only outside everyone, place words + style LoRA, no people, the rest pasted back exactly
    { const en = await page.evaluate(() => !document.querySelector('#rbg').disabled), n2 = GRAPHS.length, u3 = UPS.length; await page.evaluate(() => { document.querySelector('#allmsg').textContent = ''; }); await page.click('#rbg');
      await page.waitForFunction(() => /Done|rror|not|moved/i.test((document.querySelector('#allmsg') || {}).textContent || ''), null, {timeout:30000});
      const v3 = Object.values(GRAPHS[GRAPHS.length - 1]), c3 = v3.map(n => n.class_type), t3 = v3.filter(n => n.class_type==='CLIPTextEncode').map(n => n.inputs.text), k3 = v3.find(n => n.class_type==='KSampler'), l3 = v3.filter(n => n.class_type==='LoraLoader').map(n => n.inputs.lora_name), u4 = UPS.slice(u3).map(u => u.name), am = await page.textContent('#allmsg');
      ok(en && /Done/.test(am) && GRAPHS.length===n2 + 1 && k3.inputs.denoise===0.6 && c3.includes('SetLatentNoiseMask') && c3.includes('ImageCompositeMasked') && !c3.includes('DetailerForEach') && l3.join()==='AFKJ Style Illustrious Claude.safetensors' && /hug, scenery, no humans/.test(t3[0]) && /1girl, 1boy, people/.test(t3[1]) && u4.some(n => /^rd-scene-bgmask-/.test(n)) && u4.some(n => /^rd-scene-last-/.test(n)),
        '🖌 Repaint the background paints only outside everyone (style LoRA only, no people, depth kept) and pastes it into the last render: ' + JSON.stringify({en, am, t:t3[0], l3, u4})); }
    // ⏳ closed while it painted: the job is kept on the scene, and opening the scene again collects it
    { const g = GRAPHS[GRAPHS.length - 1], save = Object.keys(g).find(k => g[k].class_type==='SaveImage'), f0 = await page.evaluate(() => SCENE.sc.scene.file);
      await page.evaluate(([save]) => { SCENE.sc.rsJob = {pid:'pClosed', pc:'https://render.test', save, t0:Date.now(), rec:Object.assign({}, SCENE.sc.scene)}; document.querySelector('#rblend').click(); document.querySelector('#rblend').click(); }, [save]);
      await page.waitForTimeout(900); await page.goto('https://app.test/rig/scene.html'); await page.waitForFunction(() => window.SCENE && SCENE.sc && SCENE.sc.objs.length, null, {timeout:20000});
      await page.waitForFunction(() => /Done|rror|no longer/i.test((document.querySelector('#allmsg') || {}).textContent || ''), null, {timeout:20000});
      const rj = await page.evaluate(() => ({msg:document.querySelector('#allmsg').textContent, job:!!SCENE.sc.rsJob, file:SCENE.sc.scene && SCENE.sc.scene.file, key:!!(SCENE.sc.scene && SCENE.sc.scene.key), n:(SCENE.sc.renders || []).length}));
      ok(/Done/.test(rj.msg) && !rj.job && rj.file && rj.key, '⏳ a render still going when the app closed is picked up when the scene opens again (kept with its masks\' key): ' + JSON.stringify({f0, ...rj}));
      await page.evaluate(() => { window.RENDER_POLL = 50; SCENE.ui.sel = 'ellie2'; SCENE.drawSel(); }); }
    const moved = await page.evaluate(() => { const ob = SCENE.sc.objs.find(o => o.id==='ellie2'); ob.x += 0.5; SCENE.drawSel(); const d = document.querySelector('#selbox [data-act="repaint"]').disabled; ob.x -= 0.5; SCENE.drawSel(); return d; });
    ok(moved && f0, '🖌 once she moves, the masks no longer match the picture, so Repaint waits for a new 🎬 Render Scene: ' + moved);
    await page.evaluate(() => { SCENE.sc.objs = SCENE.sc.objs.filter(o => o.id!=='ellie2'); SCENE.reload(); }); }
  // 🎬 the full-screen Scene (Jordan 2026-10-29): one viewer, ☰ for the scene's own things, 📐 for the flat views, a small layer list with the settings folded away
  { await page.evaluate(() => { document.querySelector('#viewimg').hidden = true; SCENE.ui.sel = ''; SCENE.drawSel(); document.querySelector('[data-v="cam"]').click(); }); await page.waitForTimeout(300);
    const L = await page.evaluate(() => { const st = document.querySelector('#stage').getBoundingClientRect(), r = SCENE.rects().cam, sb = document.querySelector('#selbox');
      return {full:Math.round(st.width)===innerWidth && Math.round(st.height)===innerHeight, frame:+(r.w / r.h).toFixed(2), folded:sb.hidden, inMenu:!!document.querySelector('#menu #envsel') && !!document.querySelector('#menu #lon') && !!document.querySelector('#menu #new'), menuShut:document.querySelector('#menu').hidden, flatShut:document.querySelector('#ortho').hidden, views:[...document.querySelectorAll('.views button')].map(b => b.textContent.trim())}; });
    if(process.env.SHOT) await page.screenshot({path:process.env.SHOT + '/scene-full.png'});
    await page.click('#objs [data-sel]'); await page.waitForTimeout(200);
    const L2 = await page.evaluate(() => { const sb = document.querySelector('#selbox'); return {open:!sb.hidden && !!sb.closest('.row'), rows:document.querySelectorAll('#objs .row').length}; });
    if(process.env.SHOT) await page.screenshot({path:process.env.SHOT + '/scene-full-sel.png'});
    await page.click('#menub'); const m = await page.evaluate(() => !document.querySelector('#menu').hidden); if(process.env.SHOT) await page.screenshot({path:process.env.SHOT + '/scene-menu.png'}); await page.click('#menux');
    await page.click('#orthob'); const fl = await page.evaluate(() => !document.querySelector('#ortho').hidden); await page.click('#ortho [data-v="top"]'); const tp = await page.evaluate(() => ({flat:document.querySelector('#orthob').textContent, shut:document.querySelector('#ortho').hidden}));
    ok(L.full && L.frame===0.8 && L.folded && L.inMenu && L.menuShut && L.flatShut && L.views.join()==='📷 Camera,🕹 Free,📐,🖼 Renders' && L2.open && m && fl && tp.flat==='📐 Top' && tp.shut,
      '🎬 one full-screen viewer (the Camera a 4:5 frame), ☰ holds New/Rename/Delete, the 🌄 Environment and 💡 Light, 📐 the flat views, settings fold under a tapped layer: ' + JSON.stringify({L, L2, m, fl, tp})); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
