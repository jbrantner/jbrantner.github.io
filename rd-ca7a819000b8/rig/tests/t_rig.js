// Pose Rig: loads the page in a phone-sized browser (three.js and MediaPipe served from local copies when
// RIG_DEPS points at unpacked npm packages, otherwise from the CDN), then checks IK, mirror, presets, body changes,
// undo, the OpenPose guide and the picture reader's 2D lifting.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '';
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:2 });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('console', m => { if(m.type()==='error') logs.push(m.text()); });
  await page.route('https://app.test/rig/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.png', r => r.fulfill({ status:404, body:'' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  if(DEPS) await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const dir = {'three':'three-0.160.0', '@mediapipe/tasks-vision':'mediapipe-tasks-vision-0.10.14'}[m[1]];
    const f = path.join(DEPS, dir, 'package', m[3]);
    if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body:fs.readFileSync(f) });
  });
  await page.goto('https://app.test/rig/');
  await page.waitForFunction(() => window.RIG, null, {timeout:15000});
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };

  // IK: the hand reaches its handle, the elbow bends towards the pole
  const ik = await page.evaluate(() => { const R = RIG, w = R.limbWorld('armL'); const t = w.t.clone().add(new w.t.constructor(0, 0.12, 0.1));
    R.setLimbWorld('armL', {t}); R.solve(); const hand = R.wpos(R.bones.handL); return {d:hand.distanceTo(t)}; });
  ok(ik.d < 1e-3, 'the left hand reaches a moved IK handle (off by ' + ik.d.toFixed(5) + ')');
  const pole = await page.evaluate(() => { const R = RIG, w = R.limbWorld('armL'), A = R.wpos(R.bones.armL), el0 = R.wpos(R.bones.foreL);
    const out = w.p.clone(); out.x += 0.5; R.setLimbWorld('armL', {p:out}); R.solve(); const el = R.wpos(R.bones.foreL), hand = R.wpos(R.bones.handL);
    return {moved:el.x - el0.x, d:hand.distanceTo(w.t)}; });
  ok(pole.moved > 0.005 && pole.d < 1e-3, 'moving the pole out swings the elbow out and the hand stays put: ' + JSON.stringify(pole));
  // feet stay planted when the hips move
  const hips = await page.evaluate(() => { const R = RIG; R.applyPreset('stand'); const f0 = R.wpos(R.bones.footL); R.P.root.p[1] -= 0.12; R.solve(); const f1 = R.wpos(R.bones.footL);
    const k = R.wpos(R.bones.shinL); return {d:f0.distanceTo(f1), kneeFwd:k.z - R.wpos(R.bones.thighL).z}; });
  ok(hips.d < 1e-3 && hips.kneeFwd > 0.02, 'lowering the hips keeps the feet planted and bends the knees forward: ' + JSON.stringify(hips));
  // every preset: hands and feet reach, nothing broken, feet on the floor
  const pre = await page.evaluate(() => { const R = RIG, out = {};
    for(const k of ['apose', 'tpose', 'stand', 'contra', 'walk', 'run', 'sit', 'floor', 'kneel', 'crouch', 'hip', 'wave', 'point', 'cross', 'cheer', 'fight', 'jump', 'lie']){
      R.applyPreset(k); const bad = []; for(const [l, L] of Object.entries(R.LIMB)){ const t = R.limbWorld(l).t, e = R.wpos(R.bones[L.c]); if(e.distanceTo(t) > 0.01) bad.push(l); }
      const vals = Object.values(R.bones).flatMap(b => b.quaternion.toArray()).every(Number.isFinite);
      const lo = Math.min(...['toeL', 'toeR', 'footL', 'footR', 'shinL', 'shinR', 'pelvis'].map(n => R.wpos(R.bones[n]).y));
      out[k] = {bad, vals, lo:+lo.toFixed(3)}; }
    return out; });
  for(const [k, v] of Object.entries(pre)) ok(!v.bad.length && v.vals && (k==='jump' ? v.lo > 0.2 : v.lo > -0.005 && v.lo < 0.1), 'preset ' + k + ': ' + JSON.stringify(v));
  // walking: left leg forward, right arm forward
  const walk = await page.evaluate(() => { const R = RIG; R.applyPreset('walk'); return {lfoot:R.wpos(R.bones.footL).z, rfoot:R.wpos(R.bones.footR).z, rhand:R.wpos(R.bones.handR).z, lhand:R.wpos(R.bones.handL).z}; });
  ok(walk.lfoot > walk.rfoot && walk.rhand > walk.lhand, 'walking: left foot and right hand forward: ' + JSON.stringify(walk));
  // mirror: right arm copies the left one, mirrored
  const mir = await page.evaluate(() => { const R = RIG; R.applyPreset('wave'); R.mirror('R'); const l = R.wpos(R.bones.handL), r = R.wpos(R.bones.handR), p = R.wpos(R.bones.pelvis);
    return {dx:Math.abs((l.x - p.x) + (r.x - p.x)), dy:Math.abs(l.y - r.y), dz:Math.abs(l.z - r.z)}; });
  ok(mir.dx < 0.01 && mir.dy < 0.01 && mir.dz < 0.01, 'Right → left copies the waving arm onto the left, mirrored: ' + JSON.stringify(mir));
  const flip = await page.evaluate(() => { const R = RIG; R.applyPreset('walk'); const a = {l:R.wpos(R.bones.footL), r:R.wpos(R.bones.footR)}; R.flipPose(); const b = {l:R.wpos(R.bones.footL), r:R.wpos(R.bones.footR)};
    return {lz:b.l.z - a.r.z, rz:b.r.z - a.l.z}; });
  ok(Math.abs(flip.lz) < 0.01 && Math.abs(flip.rz) < 0.01, 'Flip swaps which leg is forward: ' + JSON.stringify(flip));
  // the floor ring turns her round on the spot
  const turn = await page.evaluate(() => { const R = RIG; R.applyPreset('stand'); R.selectH({kind:'ground', id:'ground'}); R.rotateSel(new R.bones.pelvis.position.constructor(0, 1, 0), Math.PI / 2);
    const f = R.wpos(R.bones.footL), p = R.wpos(R.bones.pelvis), t = R.limbWorld('legL').t; return {footOff:f.distanceTo(t), lx:f.x - p.x, lz:f.z - p.z}; });
  ok(turn.footOff < 1e-3 && turn.lz < -0.05, 'the floor ring turns the whole body (her left foot goes behind after a quarter turn): ' + JSON.stringify(turn));
  // joint limits: the head can't spin round
  const lim = await page.evaluate(() => { const R = RIG; R.selectH({kind:'fk', id:'head', bone:'head'}); for(let i = 0; i < 20; i++) R.rotateSel(new R.bones.pelvis.position.constructor(0, 1, 0), 0.2);
    const e = new (R.bones.head.rotation.constructor)().setFromQuaternion(R.bones.head.quaternion, 'XYZ'); return e.y * 180 / Math.PI; });
  ok(lim <= 55.1 && lim > 50, 'the head stops turning at its limit (55°): ' + lim.toFixed(1));
  // proportions: a bigger head and longer legs keep the pose and the feet on the floor
  const body = await page.evaluate(() => { const R = RIG; R.applyPreset('walk'); const lz = R.wpos(R.bones.footL).z;
    R.changeBody({head:1.6, legs:1.2}); const after = {lz:R.wpos(R.bones.footL).z, lo:Math.min(R.wpos(R.bones.toeL).y, R.wpos(R.bones.toeR).y), hipY:R.bones.shinL.position.length()};
    R.changeBody({}); return {lz, after}; });
  ok(body.after.lz > 0.05 && Math.abs(body.after.lo) < 0.03 && body.after.hipY > 0.45, 'changing the body keeps the walk and the feet on the floor: ' + JSON.stringify(body));
  // OpenPose: from the front, her right shoulder is on the picture's left; from the back, the face points are gone
  const op = await page.evaluate(async () => { const R = RIG; R.applyPreset('stand'); document.querySelector('#views [data-v="front"]').click(); await new Promise(r => setTimeout(r, 50));
    const f = R.opView(R.exportCam()); document.querySelector('#views [data-v="back"]').click(); await new Promise(r => setTimeout(r, 50)); const b = R.opView(R.exportCam());
    document.querySelector('#views [data-v="side"]').click(); await new Promise(r => setTimeout(r, 50)); const s = R.opView(R.exportCam());
    return {front:{r:f[2][0], l:f[5][0], nose:!!f[0], inFrame:f.filter(Boolean).every(p => p[0] > 0 && p[0] < 1 && p[1] > 0 && p[1] < 1)}, back:{nose:!!b[0], r:b[2][0], l:b[5][0]}, side:{earsSeen:[s[16], s[17]].filter(Boolean).length}}; });
  ok(op.front.r < op.front.l && op.front.nose && op.front.inFrame, 'OpenPose from the front: right shoulder on the left, face seen, all in frame: ' + JSON.stringify(op.front));
  ok(!op.back.nose && op.back.r > op.back.l, 'OpenPose from the back: no face, sides swapped: ' + JSON.stringify(op.back));
  ok(op.side.earsSeen===1, 'OpenPose from the side: only the near ear: ' + JSON.stringify(op.side));
  // the picture reader: project a known pose to flat OpenPose points, lift them back and fit: the walk comes back
  const lift = await page.evaluate(async () => { const R = RIG; R.applyPreset('walk'); document.querySelector('#views [data-v="front"]').click(); await new Promise(r => setTimeout(r, 50));
    const v = R.opView(R.exportCam()), W = 832, H = 1216, flat = []; v.forEach(p => flat.push(p ? p[0] * W : 0, p ? p[1] * H : 0, p ? 0.9 : 0));
    const want = {lfoot:R.wpos(R.bones.footL).clone(), rhand:R.wpos(R.bones.handR).clone()};
    const res = R.lift2D(flat, W, H, W, H); R.fitPoints(res);
    const lf = R.wpos(R.bones.footL), rf = R.wpos(R.bones.footR), lh = R.wpos(R.bones.handL), rh = R.wpos(R.bones.handR);
    const ok2 = Object.values(R.bones).flatMap(b => b.quaternion.toArray()).every(Number.isFinite);
    const back = R.opView(R.exportCam()); let err = 0, n = 0; back.forEach((p, i) => { if(p && v[i]){ err += Math.hypot((p[0] - v[i][0]) * W, (p[1] - v[i][1]) * H); n++; } });
    return {finite:ok2, legsApart:lf.z - rf.z, handsApart:rh.z - lh.z, px:err / n, photo:document.querySelector('#gSize').value}; });
  ok(lift.finite && lift.px < 25, 'a flat pose read back lines up with the picture (mean ' + (lift.px || 0).toFixed(1) + ' px off): ' + JSON.stringify(lift));
  // straight legs that look short (anime proportions) stay straight, they don't fold at the knee (Jordan 2026-10-23)
  const st = await page.evaluate(async () => { const R = RIG; R.applyPreset('stand'); document.querySelector('#views [data-v="front"]').click(); await new Promise(r => setTimeout(r, 50));
    const v = R.opView(R.exportCam()), W = 832, H = 1216; [9, 10, 12, 13].forEach(i => { const h = v[i < 12 ? 8 : 11]; v[i] = [v[i][0], h[1] + (v[i][1] - h[1]) * 0.75]; }); // legs 25% shorter on the picture
    const flat = []; v.forEach(p => flat.push(p ? p[0] * W : 0, p ? p[1] * H : 0, p ? 0.9 : 0)); const r = R.lift2D(flat, W, H, W, H).pts;
    return {kneeL:+(r.lkn.z - r.lhip.z).toFixed(3), ankL:+(r.lank.z - r.lhip.z).toFixed(3), kneeR:+(r.rkn.z - r.rhip.z).toFixed(3)}; });
  ok(Math.abs(st.kneeL) < 0.01 && Math.abs(st.ankL) < 0.01 && Math.abs(st.kneeR) < 0.01, 'straight legs that look short stay straight (no knee bend from the shortness): ' + JSON.stringify(st));
  // a picture on white is cut out from its edges in; white inside her stays
  const wc = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 40; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 40, 60);
    x.fillStyle = '#226'; x.fillRect(10, 10, 20, 40); x.fillStyle = '#fff'; x.fillRect(16, 20, 8, 8); const o = RIG.whiteCut(c), d = o.getContext('2d');
    const al = (px, py) => d.getImageData(px, py, 1, 1).data[3]; const cc = document.createElement('canvas'); cc.width = cc.height = 4; cc.getContext('2d').clearRect(0, 0, 4, 4);
    return {corner:al(1, 1), body:al(12, 40), inside:al(20, 24), already:RIG.whiteCut(cc)===null}; });
  ok(wc.corner===0 && wc.body===255 && wc.inside===255 && wc.already, 'whiteCut: the white round her goes see-through, white inside her stays, a cut-out picture is left alone: ' + JSON.stringify(wc));
  // undo and redo through the buttons
  const und = await page.evaluate(async () => { const R = RIG; document.querySelector('[data-preset="stand"]').click(); const a = JSON.stringify(R.P); document.querySelector('[data-preset="cheer"]').click();
    const b = JSON.stringify(R.P); document.querySelector('#undoBtn').click(); const c = JSON.stringify(R.P); document.querySelector('#redoBtn').click(); return {back:c===a, fwd:JSON.stringify(R.P)===b}; });
  ok(und.back && und.fwd, 'undo goes back to Standing and redo forward to Arms up: ' + JSON.stringify(und));
  // 🎥 Camera mode: a drag on her hand's handle orbits the camera and leaves her alone; 🦴 Pose mode: empty space does nothing
  await page.evaluate(() => { document.querySelector('[data-preset="stand"]').click(); document.querySelector('#views [data-v="front"]').click(); document.querySelector('#ctl [data-ctl="cam"]').click(); document.querySelector('#camSub [data-cs="orbit"]').click(); });
  const cam0 = await page.evaluate(() => { const R = RIG, t = R.limbWorld('armL').t, v = t.clone().project(R.camera), r = document.querySelector('#cv').getBoundingClientRect();
    return {x:r.left + (v.x + 1) / 2 * r.width, y:r.top + (1 - v.y) / 2 * r.height, hand:R.wpos(R.bones.handL).toArray(), cam:R.camera.position.toArray(), pose:JSON.stringify(R.P)}; });
  await page.mouse.move(cam0.x, cam0.y); await page.mouse.down(); await page.mouse.move(cam0.x + 60, cam0.y, {steps:6}); await page.mouse.up();
  const cam1 = await page.evaluate(() => ({cam:RIG.camera.position.toArray(), pose:JSON.stringify(RIG.P), handles:RIG.scene.children.some(c => c.isGroup && c.visible===false)}));
  ok(cam1.pose===cam0.pose && Math.hypot(...cam1.cam.map((v, i) => v - cam0.cam[i])) > 0.1, 'Camera mode: dragging over her hand orbits the camera and the pose stays the same');
  await page.evaluate(() => document.querySelector('#ctl [data-ctl="pose"]').click());
  const cam2 = await page.evaluate(() => RIG.camera.position.toArray());
  await page.mouse.move(30, 300); await page.mouse.down(); await page.mouse.move(120, 330, {steps:6}); await page.mouse.up();
  const cam3 = await page.evaluate(() => RIG.camera.position.toArray());
  ok(Math.hypot(...cam3.map((v, i) => v - cam2[i])) < 1e-6, 'Pose mode: dragging empty space leaves the camera where it is');
  // Pan / zoom: a drag slides her across the picture with the same view of her; the guide follows; the wheel zooms
  await page.evaluate(() => { document.querySelector('#ctl [data-ctl="cam"]').click(); document.querySelector('#camSub [data-cs="pan"]').click(); });
  const pz0 = await page.evaluate(() => { const R = RIG, c = R.charCenter(), v = c.clone().project(R.camera), r = document.querySelector('#cv').getBoundingClientRect(), dir = R.camera.position.clone().sub(c).normalize();
    return {x:r.left + (v.x + 1) / 2 * r.width, y:r.top + (1 - v.y) / 2 * r.height, dir:dir.toArray(), d:R.camera.position.distanceTo(c), pose:JSON.stringify(R.P)}; });
  await page.mouse.move(pz0.x, pz0.y); await page.mouse.down(); await page.mouse.move(pz0.x - 50, pz0.y + 40, {steps:6}); await page.mouse.up();
  const pz1 = await page.evaluate(() => { const R = RIG, c = R.charCenter(), v = c.clone().project(R.camera), r = document.querySelector('#cv').getBoundingClientRect(), dir = R.camera.position.clone().sub(c).normalize();
    const cam = R.exportCam(); cam.updateMatrixWorld(); const g = c.clone().project(cam), f = document.querySelector('#frame').getBoundingClientRect();
    return {x:r.left + (v.x + 1) / 2 * r.width, y:r.top + (1 - v.y) / 2 * r.height, dir:dir.toArray(), d:R.camera.position.distanceTo(c), pose:JSON.stringify(R.P),
      gx:f.left + (g.x + 1) / 2 * f.width, gy:f.top + (1 - g.y) / 2 * f.height}; });
  const same = pz1.dir.every((v, i) => Math.abs(v - pz0.dir[i]) < 1e-4);
  ok(Math.abs(pz1.x - pz0.x + 50) < 2 && Math.abs(pz1.y - pz0.y - 40) < 2 && same && pz1.pose===pz0.pose, 'Pan: a drag slides her 50 px left and 40 px down, same angle on her: ' + JSON.stringify({dx:pz1.x - pz0.x, dy:pz1.y - pz0.y, same}));
  ok(Math.abs(pz1.gx - pz1.x) < 1.5 && Math.abs(pz1.gy - pz1.y) < 1.5, 'the guide camera sees her where the screen shows her: ' + JSON.stringify({gx:pz1.gx - pz1.x, gy:pz1.gy - pz1.y}));
  await page.mouse.move(pz1.x, pz1.y); await page.mouse.wheel(0, -300); await page.waitForTimeout(50);
  const pz2 = await page.evaluate(() => { const R = RIG, c = R.charCenter(), v = c.clone().project(R.camera), r = document.querySelector('#cv').getBoundingClientRect(); return {x:r.left + (v.x + 1) / 2 * r.width, y:r.top + (1 - v.y) / 2 * r.height, d:R.camera.position.distanceTo(c)}; });
  ok(pz2.d < pz1.d - 0.05 && Math.abs(pz2.x - pz1.x) < 1.5 && Math.abs(pz2.y - pz1.y) < 1.5, 'zooming brings the camera closer and she stays where she was put: ' + JSON.stringify({d0:pz1.d, d1:pz2.d}));
  // back to orbit: she stays where she was put while the camera turns round her middle
  await page.evaluate(() => document.querySelector('#camSub [data-cs="orbit"]').click());
  const ob0 = await page.evaluate(() => { const R = RIG, c = R.charCenter(), v = c.clone().project(R.camera); return {v:[v.x, v.y], t:R.controls.target.distanceTo(c)}; });
  await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(280, 400, {steps:6}); await page.mouse.up();
  const ob1 = await page.evaluate(() => { const R = RIG, c = R.charCenter(), v = c.clone().project(R.camera); return {v:[v.x, v.y]}; });
  ok(ob0.t < 1e-4 && Math.abs(ob1.v[0] - ob0.v[0]) < 0.01 && Math.abs(ob1.v[1] - ob0.v[1]) < 0.01, 'Orbit turns round her middle and she keeps her place in the frame: ' + JSON.stringify({ob0, ob1}));
  await page.evaluate(() => document.querySelector('#ctl [data-ctl="pose"]').click());
  // a real drag of the left hand's handle on the screen
  await page.evaluate(() => { document.querySelector('[data-preset="stand"]').click(); document.querySelector('#views [data-v="front"]').click(); });
  await page.waitForTimeout(100);
  const drag = await page.evaluate(() => { const R = RIG, t = R.limbWorld('armL').t, v = t.clone().project(R.camera), r = document.querySelector('#cv').getBoundingClientRect();
    return {x:r.left + (v.x + 1) / 2 * r.width, y:r.top + (1 - v.y) / 2 * r.height, hy:R.wpos(R.bones.handL).y}; });
  await page.mouse.move(drag.x, drag.y); await page.mouse.down(); await page.mouse.move(drag.x + 10, drag.y - 40, {steps:5}); await page.mouse.move(drag.x + 20, drag.y - 90, {steps:5}); await page.mouse.up();
  const after = await page.evaluate(() => ({hy:RIG.wpos(RIG.bones.handL).y, sel:document.querySelector('#selName').textContent, undo:!document.querySelector('#undoBtn').disabled}));
  ok(after.hy > drag.hy + 0.05 && /Left hand/.test(after.sel) && after.undo, 'dragging the pink handle on screen lifts the left hand: ' + JSON.stringify({before:drag.hy, ...after}));
  // a ring drag on screen: pick the head, drag along its green (turn) ring
  const ring = await page.evaluate(() => { const R = RIG; R.selectH({kind:'fk', id:'head', bone:'head'}); const c = R.wpos(R.bones.head), v = c.clone().project(R.camera), r = document.querySelector('#cv').getBoundingClientRect();
    const e0 = R.bones.head.quaternion.toArray(); return {x:r.left + (v.x + 1) / 2 * r.width, y:r.top + (1 - v.y) / 2 * r.height, e0}; });
  // from the front the turn ring (y) is seen edge-on as a flat line through the head: grab its right end and go down
  const rad = 46; // the rings' radius on screen
  await page.mouse.move(ring.x + rad, ring.y - 0); await page.mouse.down(); await page.mouse.move(ring.x + rad - 5, ring.y + 30, {steps:6}); await page.mouse.up();
  const ring2 = await page.evaluate(() => ({q:RIG.bones.head.quaternion.toArray(), sel:document.querySelector('#selName').textContent}));
  ok(/Head/.test(ring2.sel) && ring2.q.some((v, i) => Math.abs(v - ring.e0[i]) > 0.01), 'dragging a ring on screen turns the head: ' + JSON.stringify(ring2));
  // depth and outline from the body: depth bright in front, dark behind, black around her; outline has white lines
  const gd = await page.evaluate(() => { const R = RIG; document.querySelector('[data-preset="point"]').click(); document.querySelector('#views [data-v="front"]').click();
    const cs = R.guideCanvases(208, 304, ['depth', 'line']), d = cs.depth.getContext('2d').getImageData(0, 0, 208, 304).data, l = cs.line.getContext('2d').getImageData(0, 0, 208, 304).data;
    let body = 0, bg = 0, maxV = 0, minV = 255, lines = 0; for(let i = 0; i < d.length; i += 4){ if(d[i] > 0){ body++; maxV = Math.max(maxV, d[i]); minV = Math.min(minV, d[i]); } else bg++; if(l[i] > 128) lines++; }
    // the pointing hand (her right, picture's left, reaching towards the camera) is nearer than her hips
    const v = (p) => { const q = p.clone().project(R.exportCam()); const x = Math.round((q.x + 1) / 2 * 208), y = Math.round((1 - q.y) / 2 * 304); return d[(y * 208 + x) * 4]; };
    return {body, bg, maxV, minV, lines, hand:v(R.wpos(R.bones.handR)), hips:v(R.wpos(R.bones.pelvis))}; });
  ok(gd.body > 3000 && gd.bg > gd.body && gd.maxV > 230 && gd.minV < 120 && gd.hand > gd.hips && gd.lines > 300 && gd.lines < gd.body, 'depth and outline guides from the body: ' + JSON.stringify(gd));
  // the guide tab draws a preview, the saved picture has the chosen size
  await page.click('#tabs [data-tab="guide"]'); await page.waitForTimeout(100);
  const g = await page.evaluate(() => { const c = document.querySelector('#gPrevs canvas'); document.querySelector('#gSize').value = '832x1216'; document.querySelector('#gSize').onchange();
    return {w:c.width, h:c.height, lit:[...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].some((v, i) => i % 4===0 && v > 100)}; });
  ok(g.w > 100 && g.lit, 'the Guide tab shows the OpenPose preview: ' + JSON.stringify(g));
  fs.mkdirSync(path.join(__dirname, 'out'), {recursive:true});
  for(const [v, n] of [['three', 'rig-34'], ['front', 'rig-front']]){ await page.evaluate(v => document.querySelector(`#views [data-v="${v}"]`).click(), v); await page.waitForTimeout(150); await page.screenshot({path:path.join(__dirname, 'out', n + '.png')}); }
  await page.evaluate(() => { document.querySelector('[data-preset="fight"]').click(); RIG.selectH({kind:'upper', id:'armR', limb:'armR'}); document.querySelector('#views [data-v="three"]').click(); });
  await page.click('#tabs [data-tab="pose"]'); await page.waitForTimeout(150); await page.screenshot({path:path.join(__dirname, 'out', 'rig-fight-rings.png')});
  // Try a render: a stand-in ComfyUI on Render; the graph is Illustrious + both LoRAs + ProMax told to read OpenPose
  const SRV = 'https://jordo-desktop.tailadee9a.ts.net', sent = [], ups = [];
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  await page.route(SRV + '/**', r => { const u = new URL(r.request().url());
    const L = {CheckpointLoaderSimple:{ckpt_name:[['bismuthIllustrious_v80.safetensors', 'iriselTouchIL_v10.safetensors']]}, LoraLoader:{lora_name:[['AFKJ Style Illustrious Claude.safetensors', 'librarianx_v2.safetensors', 'other.safetensors']]},
      ControlNetLoader:{control_net_name:[['canny.safetensors', 'diffusion_pytorch_model_promax.safetensors']]}};
    const cls = u.pathname.split('/')[2]; if(u.pathname.startsWith('/object_info/')) return r.fulfill({json:L[cls] ? {[cls]:{input:{required:L[cls]}}} : {}});
    if(u.pathname==='/upload/image'){ const m = (r.request().postData() || '').match(/filename="([^"]+)"/); ups.push(m[1]); return r.fulfill({json:{name:m[1], subfolder:'', type:'input'}}); }
    if(u.pathname==='/prompt'){ sent.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({json:{prompt_id:'p1', number:0, node_errors:{}}}); }
    if(u.pathname==='/history/p1') return r.fulfill({json:{p1:{status:{status_str:'success', completed:true}, outputs:{13:{images:[{filename:'test_00001_.png', subfolder:'RenderDeck/rig', type:'output'}]}}}}});
    if(u.pathname==='/view') return r.fulfill({contentType:'image/png', body:PNG});
    r.fulfill({status:404, body:''}); });
  await page.evaluate(() => { document.querySelector('#testBox').open = true; });
  await page.waitForFunction(() => /Ready/.test(document.querySelector('#tStatus').textContent), null, {timeout:10000});
  const picks = await page.evaluate(() => ['#tPc', '#tCkpt', '#tLora1', '#tLora2', '#tCn'].map(i => document.querySelector(i).value));
  ok(picks.join('|')===SRV + '|iriselTouchIL_v10.safetensors|AFKJ Style Illustrious Claude.safetensors|librarianx_v2.safetensors|diffusion_pytorch_model_promax.safetensors', 'Try a render starts on Render with the Librarian setup: ' + picks.join(' · '));
  await page.evaluate(() => document.querySelector('#tGo').click()); await page.waitForFunction(() => /Done|bad/.test(document.querySelector('#tStatus').textContent + document.querySelector('#tStatus').className), null, {timeout:15000});
  const G = sent[0] || {}, types = Object.values(G).map(n => n.class_type);
  ok(ups.length===2 && /^rd-rig-openpose-/.test(ups[0]) && /^rd-rig-depth-/.test(ups[1]) && G['8pose'].inputs.type==='openpose' && G['8depth'].inputs.type==='depth' && G['9pose'].inputs.end_percent===0.7
    && G[9].inputs.positive[0]==='9pose' && G[9].inputs.image[0]==='6depth' && G[11].inputs.positive[0]==='9' && G[2].inputs.lora_name.startsWith('AFKJ') && G[3].inputs.lora_name.startsWith('librarianx')
    && G[11].inputs.model[0]==='3' && /^librarianx, 1girl, solo/.test(G[4].inputs.text) && G[10].inputs.width===832, 'the render graph: ' + types.join(', '));
  ok(await page.evaluate(() => !document.querySelector('#testOut').hidden), 'the finished render shows on the page');
  // pose from an orbit: a pose seen from 16 views by a pretend reader (uneven turns, a tilted camera, wobbling size and
  // position, noise, a missing point per view, left and right mixed up whenever she faces away) is rebuilt in 3D
  for(const [pre, turn] of [['point', 1], ['fight', 0.9], ['run', 1.1], ['sit', 1]]){
    const orb = await page.evaluate(([pre, turn]) => { const R = window.RIG, T = R.THREE || null; document.querySelector(`[data-preset="${pre}"]`).click();
      const w = n => R.wpos(R.bones[n]), hp = (x, y, z) => R.bones.head.localToWorld(new (R.wpos(R.bones.head).constructor)(x * R.REST().h, y * R.REST().h, z * R.REST().h));
      const J = {lsh:w('armL'), rsh:w('armR'), lel:w('foreL'), rel:w('foreR'), lwr:w('handL'), rwr:w('handR'), lhip:w('thighL'), rhip:w('thighR'), lkn:w('shinL'), rkn:w('shinR'), lank:w('footL'), rank:w('footR'),
        ltoe:w('toeL'), rtoe:w('toeR'), nose:hp(0, 0.33, 0.5), lear:hp(0.4, 0.4, 0), rear:hp(-0.4, 0.4, 0)};
      const truth = {}; for(const [k, L] of [['armL', ['lsh', 'lel', 'lwr']], ['armR', ['rsh', 'rel', 'rwr']], ['legL', ['lhip', 'lkn', 'lank']], ['legR', ['rhip', 'rkn', 'rank']]]) truth[k] = L.map(n => J[n].clone());
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5, yaw = 0.7, e = 0.2, views = [];
      for(let k = 0; k < 16; k++){ const a = k / 16 * Math.PI * 2, th = a * turn + yaw + rnd() * 0.25, s = 300 * (1 + rnd() * 0.15), tx = 400 + rnd() * 60, ty = 500 + rnd() * 60, pts = {};
        for(const [n, X] of Object.entries(J)){ const q = R.orbProj(X, {th, e, s, tx, ty}); pts[n] = [q[0] + rnd() * 6, q[1] + rnd() * 6, 1]; }
        delete pts[Object.keys(pts)[k % 17]];
        if(Math.cos(th) < -0.2 && pts.lsh && pts.rsh && pts.lhip && pts.rhip){ const sw = {}; for(const [n, v] of Object.entries(pts)) sw[n[0]==='l' ? 'r' + n.slice(1) : n[0]==='r' ? 'l' + n.slice(1) : n] = v; Object.keys(pts).forEach(n => delete pts[n]); Object.assign(pts, sw); }
        views.push({pts, a}); }
      R.applyPreset('apose');
      const t0 = performance.now(), res = R.solveOrbit(views), ms = Math.round(performance.now() - t0); R.fitPoints(res);
      // compare each limb's bend and direction in her own hips' frame
      const qp = R.bones.pelvis.getWorldQuaternion(R.bones.pelvis.quaternion.clone()).invert(), angs = [];
      const L2 = {armL:['armL', 'foreL', 'handL'], armR:['armR', 'foreR', 'handR'], legL:['thighL', 'shinL', 'footL'], legR:['thighR', 'shinR', 'footR']};
      // the truth's hips frame: from its own hips and shoulders
      const tq = (() => { const x = J.lhip.clone().sub(J.rhip).normalize(), y = J.lsh.clone().add(J.rsh).sub(J.lhip).sub(J.rhip).normalize(), xx = x.clone().sub(y.clone().multiplyScalar(x.dot(y))).normalize(), z = xx.clone().cross(y);
        const m = new (R.bones.pelvis.matrixWorld.constructor)().makeBasis(xx, y, z); return R.bones.pelvis.quaternion.clone().setFromRotationMatrix(m).invert(); })();
      const gq = (() => { const x = w('thighL').sub(w('thighR')).normalize(), y = w('armL').add(w('armR')).sub(w('thighL')).sub(w('thighR')).normalize(), xx = x.clone().sub(y.clone().multiplyScalar(x.dot(y))).normalize(), z = xx.clone().cross(y);
        const m = new (R.bones.pelvis.matrixWorld.constructor)().makeBasis(xx, y, z); return R.bones.pelvis.quaternion.clone().setFromRotationMatrix(m).invert(); })();
      for(const [k, bs] of Object.entries(L2)){ const g = bs.map(w), t = truth[k];
        for(let i = 0; i < 2; i++){ const a = g[i + 1].clone().sub(g[i]).normalize().applyQuaternion(gq), b = t[i + 1].clone().sub(t[i]).normalize().applyQuaternion(tq); angs.push(Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI); } }
      void qp; void T;
      return {ms, worst:Math.round(Math.max(...angs)), mean:Math.round(angs.reduce((x, y) => x + y) / angs.length), flips:res.flips, used:res.used.length, err:+res.err.toFixed(3)}; }, [pre, turn]);
    ok(orb.worst < 20 && orb.mean < 9, `pose from an orbit rebuilds "${pre}" from 16 messy views (turning ${Math.round(turn * 360)}°): ` + JSON.stringify(orb));
  }
  // my poses keep their shape through a save and load
  const my = await page.evaluate(() => { const R = window.RIG; document.querySelector('[data-preset="kneel"]').click(); const a = R.packPose(), before = ['handL', 'footR', 'shinL'].map(n => R.wpos(R.bones[n]));
    document.querySelector('[data-preset="tpose"]').click(); R.unpackPose(JSON.parse(JSON.stringify(a))); return Math.max(...['handL', 'footR', 'shinL'].map((n, i) => R.wpos(R.bones[n]).distanceTo(before[i]))); });
  ok(my < 0.03, 'a saved pose comes back the same: ' + my.toFixed(3) + ' m');
  // inside a comic panel: its own saved rig, the frame in the panel's shape, a small picture of the frame for the page
  await page.route('https://app.test/rig/?*', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.goto('https://app.test/rig/?panel=ptest&w=1216&h=832&name=Girl%201');
  await page.waitForFunction(() => window.RIG, null, {timeout:15000}); await page.waitForTimeout(400);
  const emb = await page.evaluate(() => { const R = RIG, f = document.querySelector('#frame').getBoundingClientRect(), shot = R.frameShot(240); R.save();
    return {name:document.querySelector('header h1').textContent, ar:f.width / f.height, size:document.querySelector('#gSize').value, dis:document.querySelector('#gSize').disabled,
      ctl:R.S.ctl, keys:Object.keys(localStorage), shot:shot.slice(0, 23), body:R.S.body.legs}; });
  const im = await page.evaluate(async () => { const img = new Image(); img.src = RIG.frameShot(240); await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let white = 0, dark = 0; for(let i = 0; i < d.length; i += 4){ if(d[i] > 240 && d[i + 1] > 240) white++; else if(d[i] < 120) dark++; }
    return {w:img.width, h:img.height, white:white / (d.length / 4), dark}; });
  ok(emb.name==='Girl 1' && Math.abs(emb.ar - 1216 / 832) < 0.02 && /1216 × 832/.test(emb.size) && emb.dis && emb.ctl==='cam' && emb.keys.includes('rd-pose-rig-panel-ptest'),
    'in a panel: the name on top, the frame in the panel\'s shape, size fixed, Camera mode first, saved under its own key: ' + JSON.stringify(emb));
  ok(im.w===240 && im.h===164 && im.white > 0.5 && im.dark > 50, 'the panel\'s little picture is her on white in the panel\'s shape: ' + JSON.stringify(im));
  // the chips only turn the camera in a panel: where she sits and how big stay
  await page.evaluate(() => { document.querySelector('#camSub [data-cs="pan"]').click(); });
  await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(150, 300, {steps:4}); await page.mouse.up();
  const ch = await page.evaluate(async () => { const R = RIG, s0 = R.shift.slice(), d0 = R.camera.position.distanceTo(R.controls.target); R.save(); document.querySelector('#views [data-v="side"]').click();
    return {s0, s1:R.shift.slice(), d0, d1:R.camera.position.distanceTo(R.controls.target)}; });
  ok(Math.abs(ch.s0[0] - ch.s1[0]) < 0.02 && Math.abs(ch.d0 - ch.d1) < 0.02, 'in a panel, Side turns the camera but keeps her place and size: ' + JSON.stringify(ch));
  // 🛋 Set: walls and furniture shared by the comic's panels, moved in flat views one axis at a time
  await page.evaluate(() => document.querySelector('#ctl [data-ctl="set"]').click());
  const sm = await page.evaluate(() => ({views:!document.querySelector('#setViews').hidden && document.querySelector('#views').hidden, tab:!document.querySelector('[data-pane="set"]').hidden, cam:RIG.SV.cam}));
  ok(sm.views && sm.tab && sm.cam, '🛋 Set shows the flat views and the Set tab: ' + JSON.stringify(sm));
  await page.evaluate(() => { document.querySelector('#setAdd [data-sadd="room"]').click(); document.querySelector('#setAdd [data-sadd="sofa"]').click(); });
  const px = (p) => page.evaluate(p => { const R = RIG, v = new (R.camera.position.constructor)(...p).project(R.setOrtho), r = document.querySelector('#cv').getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * R.topH()]; }, p);
  const sofa0 = await page.evaluate(() => { const R = RIG; R.S.setDrag = 'one'; const it = R.SET.items.find(i => i.k==='sofa'); it.p = [1.5, 0, -2]; R.buildSet(); R.fitSet(); return it.p.slice(); });
  let [sx, sy] = await px([1.5, 0.5, -2]); await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx - 60, sy + 18, {steps:6}); await page.mouse.up();
  const sofa1 = await page.evaluate(() => RIG.SET.items.find(i => i.k==='sofa').p.slice());
  ok(sofa1[0] < sofa0[0] - 0.2 && sofa1[2]===sofa0[2] && sofa1[1]===0 && Math.abs(sofa1[0] * 20 - Math.round(sofa1[0] * 20)) < 1e-6, 'Top view: a mostly sideways drag slides the sofa along x only, in 5 cm steps: ' + JSON.stringify([sofa0, sofa1]));
  await page.evaluate(() => document.querySelector('#setViews [data-sv="front"]').click());
  await page.evaluate(() => { const R = RIG, it = R.SET.items.find(i => i.k==='sofa'); it.p = [1.5, 0, -2]; R.buildSet(); });
  [sx, sy] = await px([1.5, 0.3, -2]); await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 10, sy - 50, {steps:6}); await page.mouse.up();
  const sofa2 = await page.evaluate(() => RIG.SET.items.find(i => i.k==='sofa').p.slice());
  // nothing is picked by a tap: a tap in the view with the sofa picked keeps the sofa
  [sx, sy] = await px([0, 1.4, -3.06]); await page.mouse.click(sx, sy); ok(await page.evaluate(() => RIG.setItem ? true : true) && /^i/.test(await page.evaluate(() => RIG.setSel)) && await page.evaluate(() => RIG.SET.items.find(i => i.id===RIG.setSel).k==='sofa'), 'a tap in the view never picks another piece');
  ok(sofa2[1] > 0.2 && sofa2[0]===1.5 && sofa2[2]===-2, 'Front view: an upward drag lifts it, nothing else moves: ' + JSON.stringify(sofa2));
  // ✥ Both ways (the default): a diagonal drag in the top view moves it across and back at once, the height locked
  await page.evaluate(() => { const R = RIG; delete R.S.setDrag; document.querySelector('#setViews [data-sv="top"]').click(); const it = R.SET.items.find(i => i.k==='sofa'); it.p = [1.5, 0, -2]; R.buildSet(); R.fitSet(); R.setUi(); });
  [sx, sy] = await px([1.5, 0.5, -2]); await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx - 60, sy + 40, {steps:6}); await page.mouse.up();
  { const p = await page.evaluate(() => RIG.SET.items.find(i => i.k==='sofa').p.slice()), seg = await page.evaluate(() => !!document.querySelector('#setPicked [data-sdrag="both"].on'));
    ok(seg && p[0] < 1.3 && Math.abs(p[2] + 2) > 0.15 && p[1]===0, '✥ Both ways: a diagonal drag in the top view moves the sofa on both floor axes, height locked: ' + JSON.stringify(p)); }
  // any angle: the slider turns it round the axis of the view; 🧲 snaps to 45°
  { const r = await page.evaluate(() => { const R = RIG, it = R.SET.items.find(i => i.k==='sofa'), sl = () => document.querySelector('#setPicked [data-srot]'), set = v => { const e = sl(); e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); };
      set(30); const g = R.setG.children.find(x => x.userData.id===it.id), yaw = new (R.camera.rotation.constructor)().setFromQuaternion(g.quaternion, 'YXZ').y * 180 / Math.PI, top = {r:it.r, yaw, lbl:sl().closest('.row').textContent};
      document.querySelector('#setViews [data-sv="front"]').click(); set(-20); const front = {tz:it.tz, lbl:sl().closest('.row').textContent};
      document.querySelector('#setPicked [data-sdo="snap"]').click(); set(-28); const snap = it.tz; document.querySelector('#setPicked [data-sdo="snap"]').click();
      document.querySelector('#setPicked [data-sdo="r0"]').click(); return {top, front, snap, back:[it.r, it.tz]}; });
    ok(Math.abs(r.top.r - 1 / 3) < 1e-6 && Math.abs(r.top.yaw - 30) < 0.5 && /Spin/.test(r.top.lbl) && r.front.tz===-20 && /Tilt/.test(r.front.lbl) && r.snap===-45 && r.back[0]===0 && r.back[1]===undefined,
      '↻ the turn slider spins it 30° from above, tilts it from the front, 🧲 snaps to 45°, ↺ Straight resets: ' + JSON.stringify(r)); }
  await page.evaluate(() => { const it = RIG.SET.items.find(i => i.k==='sofa'); it.p = [1.5, 0, -2]; RIG.buildSet(); });
  const her0 = await page.evaluate(() => { RIG.pickSet('her'); return RIG.wpos(RIG.bones.pelvis).toArray(); }); [sx, sy] = await px(her0);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 50, sy, {steps:6}); await page.mouse.up();
  const her1 = await page.evaluate(() => ({p:RIG.wpos(RIG.bones.pelvis).toArray(), feet:RIG.wpos(RIG.bones.footL).y}));
  const lay = await page.evaluate(() => { const b = [...document.querySelectorAll('#setLayers [data-slay]')]; return {n:b.length, on:b.filter(x => x.classList.contains('on')).map(x => x.dataset.slay), split:!document.querySelector('#setSplit').hidden}; });
  ok(lay.n===6 && lay.on.join()==='her' && lay.split, 'Layers lists her and every piece, the picked one lit; the panel camera shows under the flat view: ' + JSON.stringify(lay));
  ok(her1.p[0] > her0[0] + 0.15 && Math.abs(her1.p[2] - her0[2]) < 0.01 && Math.abs(her1.p[1] - her0[1]) < 0.01, 'her too: she slides across the floor, same height: ' + JSON.stringify([her0, her1]));
  // what the comic gets: the set's colours and depth from the panel's camera, and where a piece stands in front of her
  const sg = await page.evaluate(() => { const R = RIG; document.querySelector('#ctl [data-ctl="cam"]').click();
    const c = R.camera.position.clone(), h = R.wpos(R.bones.pelvis), m = c.clone().lerp(h, 0.45); const it = R.addSet('box'); it.p = [Math.round(m.x * 20) / 20, 0, Math.round(m.z * 20) / 20]; it.s = [0.5, 0.9, 0.5]; R.buildSet();
    const g = R.panelGuides(); return {bg:(g.bg || '').slice(0, 15), dp:(g.bgDepth || '').slice(0, 15), front:!!g.front, v:g.setV, key:Object.keys(localStorage).includes('rd-pose-rig-set-p-ptest'), n:R.SET.items.length}; });
  ok(/^data:image\/jpeg/.test(sg.bg) && /^data:image\/jpeg/.test(sg.dp) && sg.front && sg.v > 0 && sg.key && sg.n===6, 'the panel\'s guides carry the set (colours, depth, what stands in front of her), saved for the comic: ' + JSON.stringify(sg));
  const tone = await page.evaluate(async () => { const g = RIG.panelGuides(), im = new Image(); im.src = g.bg; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let grey = 0; for(let i = 0; i < d.length; i += 4) if(Math.abs(d[i] - 244) < 4 && Math.abs(d[i + 2] - 244) < 4) grey++; return grey / (d.length / 4); });
  ok(tone < 0.5, 'the set colour picture shows the room, not empty sky: ' + tone.toFixed(2));
  // 🧍 pose sprites: 24 guides from her pose (3 heights × 8 directions), then a camera-facing picture that swaps with the angle
  const ss = await page.evaluate(() => { const t0 = performance.now(), r = RIG.spriteShots(256); return {ms:Math.round(performance.now() - t0), n:r.views.length, rings:[...new Set(r.views.map(v => v.ring))].join(), png:r.views.every(v => /^data:image\/png/.test(v.pose) && /^data:image\/jpeg/.test(v.depth)), wM:r.wM, hM:r.hM, aimY:r.aim[1], differ:r.views[0].pose!==r.views[4].pose}; });
  ok(ss.n===24 && ss.rings==='0,1,2' && ss.png && ss.hM > 1.6 && ss.aimY > 0.6 && ss.differ, 'a pose sprite\'s 24 guides (OpenPose + depth), the same size from every angle: ' + JSON.stringify(ss));
  const sv = await page.evaluate(() => { const R = RIG, c = document.createElement('canvas'); c.width = 8; c.height = 12; const views = [];
    for(let n = 0; n < 24; n++){ const x = c.getContext('2d'); x.fillStyle = 'hsl(' + n * 15 + ',80%,50%)'; x.fillRect(0, 0, 8, 12); views.push(c.toDataURL()); }
    localStorage.setItem(R.SPKEY, JSON.stringify([{id:'sp1', name:'Walking', geo:{wM:1.2, hM:1.9, aim:[0, 0.9, 0]}, views}]));
    const it = R.addSet('sprite:sp1'); it.p = [0, 0, 0]; it.r = 0; R.buildSet(); const m = R.spriteMeshes()[0], P = (x, y, z) => new (R.camera.position.constructor)(x, y, z);
    const at = (x, y, z) => { const v = R.spriteView(m, P(x, y, z)); return v.ring * 8 + v.i; };
    const out = {front:at(0, 1, 5), left45:at(3.5, 1, 3.5), back:at(0, 1, -5), above:at(0, 6, 2), below:at(0, -2, 5), btn:!!document.querySelector('#setAdd [data-sadd="sprite:sp1"]')};
    it.r = 1; R.buildSet(); out.turned = at(0, 1, 5); const m2 = R.spriteMeshes()[0]; R.updSprites(R.camera); out.tex = !!m2.material.map; out.faces = m2.getWorldDirection(P()).dot(R.camera.position.clone().sub(m2.getWorldPosition(P())).normalize()); return out; });
  ok(sv.front===8 && sv.left45===9 && sv.back===12 && sv.above===16 && sv.below===0 && sv.turned===14 && sv.btn && sv.tex && sv.faces > 0.99,
    'the sprite shows the picture for the camera\'s angle and height, turns with the piece, and faces the camera: ' + JSON.stringify(sv));
  // 👀 a pose with the looking-at-camera set: the piece's switch picks it
  const lk = await page.evaluate(() => { const R = RIG, L = JSON.parse(localStorage.getItem(R.SPKEY)); L[0].look = L[0].views.map((u, n) => 'data:look' + n); localStorage.setItem(R.SPKEY, JSON.stringify(L));
    const it = R.SET.items.find(x => x.k==='sprite'); it.r = 0; R.buildSet(); if(R.setSel!==it.id) R.pickSet(it.id); else R.setUi(); const btn = document.querySelector('#setPicked [data-sdo="look"]'), m = () => R.spriteMeshes()[0], P = new (R.camera.position.constructor)(0, 1, 5);
    const away = R.spriteView(m(), P).url; btn.click(); const at = R.spriteView(m(), P).url; return {btn:!!btn, away:away.slice(0, 15), at, on:!!it.look}; });
  ok(lk.btn && lk.on && lk.at==='data:look8' && lk.away!==lk.at, '👀 Looks at camera swaps the piece to the pose\'s looking-at-camera pictures: ' + JSON.stringify(lk));
  // 🦴🎬 the skeleton turning for MiniMax: n frames a move, the first frame's skeleton fitted onto the picture's points
  { const r = await page.evaluate(() => { RIG.lastRead = null; const a = RIG.spinGuides(100, 150, 5, [{kind:'circle', el:5}, {kind:'crane', from:5, to:35}]);
      const OPN = ['nose', 'neck', 'rsh', 'rel', 'rwr', 'lsh', 'lel', 'lwr', 'rhip', 'rkn', 'rank', 'lhip', 'lkn', 'lank', 'reye', 'leye', 'rear', 'lear'], img2 = {};
      a.pts0.forEach((p, i) => { if(p) img2[OPN[i]] = [(p[0] * 100 * 1.5 + 10) * 2, (p[1] * 150 * 1.5 - 20) * 2]; }); RIG.lastRead = {W:200, H:300, img2};
      const b = RIG.spinGuides(100, 150, 5, [{kind:'circle', el:5}]); RIG.lastRead = null;
      return {n:a.moves.map(m => m.length), jpg:/^data:image\/jpeg/.test(a.moves[0][0]), k0:a.fit.k, fit:b.fit, same:a.moves[0][0]!==a.moves[0][2]}; });
    ok(r.n.join()==='5,5' && r.jpg && r.k0===1 && Math.abs(r.fit.k - 1.5) < 0.01 && Math.abs(r.fit.tx - 10) < 0.5 && Math.abs(r.fit.ty + 20) < 0.5 && r.same,
      '🦴🎬 spinGuides: frames for each move, the first frame fitted onto the picture\'s points (scale and shift): ' + JSON.stringify(r)); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
