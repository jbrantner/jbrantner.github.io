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
  // undo and redo through the buttons
  const und = await page.evaluate(async () => { const R = RIG; document.querySelector('[data-preset="stand"]').click(); const a = JSON.stringify(R.P); document.querySelector('[data-preset="cheer"]').click();
    const b = JSON.stringify(R.P); document.querySelector('#undoBtn').click(); const c = JSON.stringify(R.P); document.querySelector('#redoBtn').click(); return {back:c===a, fwd:JSON.stringify(R.P)===b}; });
  ok(und.back && und.fwd, 'undo goes back to Standing and redo forward to Arms up: ' + JSON.stringify(und));
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
  // the guide tab draws a preview, the saved picture has the chosen size
  await page.click('#tabs [data-tab="guide"]'); await page.waitForTimeout(100);
  const g = await page.evaluate(() => { const c = document.querySelector('#gPrev'); document.querySelector('#gSize').value = '832x1216'; document.querySelector('#gSize').onchange();
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
  ok(ups.length===1 && /^rd-rig-openpose-/.test(ups[0]) && G[8] && G[8].inputs.type==='openpose' && G[9].inputs.end_percent===0.7 && G[2].inputs.lora_name.startsWith('AFKJ') && G[3].inputs.lora_name.startsWith('librarianx')
    && G[11].inputs.model[0]==='3' && /^librarianx, 1girl, solo/.test(G[4].inputs.text) && G[10].inputs.width===832, 'the render graph: ' + types.join(', '));
  ok(await page.evaluate(() => !document.querySelector('#testOut').hidden), 'the finished render shows on the page');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
