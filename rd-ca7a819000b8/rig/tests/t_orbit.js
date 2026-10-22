// Pose Rig: pose from an orbit, end to end. The rig's own body is filmed turning round in a pose (16 pictures, and a
// video), then read back by the on-phone reader (MediaPipe) and combined into one pose, which is compared with the
// pose it was filmed in. Needs RIG_DEPS like t_photo.js. Writes tests/out/orbit-*.png.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS, OUT = path.join(__dirname, 'out'), PRE = process.argv[2] || 'point';
async function open(browser, opts){
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const ctx = await browser.newContext(Object.assign({ viewport:{width:390, height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:2 }, opts));
  const page = await ctx.newPage(), logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('console', m => { if(m.type()==='error' && !/GL Driver|WebGL/.test(m.text())) logs.push(m.text()); });
  await page.route('https://app.test/rig/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://storage.googleapis.com/**', r => r.fulfill({ contentType:'application/octet-stream', body:fs.readFileSync(path.join(DEPS, 'pose_landmarker_full.task')) }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => { const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const dir = {'three':'three-0.160.0', '@mediapipe/tasks-vision':'mediapipe-tasks-vision-0.10.14'}[m[1]], f = path.join(DEPS, dir, 'package', m[3]);
    if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' }); r.fulfill({ contentType:f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body:fs.readFileSync(f) }); });
  await page.goto('https://app.test/rig/'); await page.waitForFunction(() => window.RIG);
  return {ctx, page, logs};
}
// each limb's two bones as directions in her own hips' frame
const LIMB_DIRS = () => { const R = window.RIG, w = n => R.wpos(R.bones[n]);
  const x = w('thighL').sub(w('thighR')).normalize(), y = w('armL').add(w('armR')).sub(w('thighL')).sub(w('thighR')).normalize(), xx = x.clone().sub(y.clone().multiplyScalar(x.dot(y))).normalize(), z = xx.clone().cross(y);
  const q = R.bones.pelvis.quaternion.clone().setFromRotationMatrix(new (R.bones.pelvis.matrixWorld.constructor)().makeBasis(xx, y, z)).invert(), out = {};
  for(const [k, bs] of Object.entries({armL:['armL', 'foreL', 'handL'], armR:['armR', 'foreR', 'handR'], legL:['thighL', 'shinL', 'footL'], legR:['thighR', 'shinR', 'footR']})){ const g = bs.map(w);
    out[k] = [0, 1].map(i => g[i + 1].clone().sub(g[i]).normalize().applyQuaternion(q).toArray()); }
  return out; };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
(async () => {
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  fs.mkdirSync(path.join(OUT, 'orbit'), {recursive:true});
  // 1. film her: 16 pictures, and a 4-second video of one full turn
  // filmed the way a MiniMax orbit looks: her alone, filling the picture, on white
  const film = await open(browser, {viewport:{width:400, height:640}, deviceScaleFactor:1});
  await film.page.addStyleTag({content:'#view{position:fixed!important;inset:0!important;margin:0!important;border:0!important;border-radius:0!important;z-index:99} #view > :not(canvas){display:none!important}'});
  await film.page.evaluate(() => { window.RIG.scene.background.set(0xffffff); window.dispatchEvent(new Event('resize')); });
  const truth = await film.page.evaluate(pre => { document.querySelector(`[data-preset="${pre}"]`).click(); document.querySelector('#modes [data-m="body"]').click();
    if(window.RIG.S.showHandles) document.querySelector('[data-do="handles"]').click(); return null; }, PRE);
  void truth; const T = await film.page.evaluate(LIMB_DIRS);
  const place = a => film.page.evaluate(a => { const R = window.RIG, c = R.wpos(R.bones.pelvis); c.y = 0.85; const d = 3.0, e = 0.17; R.scene.children.forEach(o => { if(o.type==='GridHelper') o.visible = false; });
    R.controls.target.copy(c); R.camera.position.set(c.x + Math.sin(a) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z + Math.cos(a) * Math.cos(e) * d); R.camera.lookAt(c); R.controls.update(); R.renderer.render(R.scene, R.camera); }, a);
  for(let k = 0; k < 16; k++){ await place(0.5 + k / 16 * Math.PI * 2); await film.page.waitForTimeout(120); await film.page.locator('#view').screenshot({path:path.join(OUT, 'orbit', `view-${String(k).padStart(2, '0')}.png`)}); }
  // the video: the view's own canvas recorded while she turns once in 4 seconds
  const b64 = await film.page.evaluate(async () => { const R = window.RIG, cv = R.renderer.domElement, rec = new MediaRecorder(cv.captureStream(30), {mimeType:'video/webm'}), parts = [];
    rec.ondataavailable = e => parts.push(e.data); const done = new Promise(r => { rec.onstop = r; });
    const c = R.wpos(R.bones.pelvis); c.y = 0.85; const d = 3.0, e = 0.17, t0 = performance.now(); rec.start();
    await new Promise(ok => { const step = () => { const t = (performance.now() - t0) / 4000, a = 0.5 + Math.min(t, 1) * Math.PI * 2;
      R.camera.position.set(c.x + Math.sin(a) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z + Math.cos(a) * Math.cos(e) * d); R.camera.lookAt(c); R.renderer.render(R.scene, R.camera);
      if(t < 1.02) requestAnimationFrame(step); else ok(); }; step(); });
    rec.stop(); await done; const buf = await new Blob(parts, {type:'video/webm'}).arrayBuffer(); let bin = ''; const u8 = new Uint8Array(buf); for(let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]); return btoa(bin); });
  const vid = path.join(OUT, 'orbit', 'turn.webm'); fs.writeFileSync(vid, Buffer.from(b64, 'base64')); await film.ctx.close();
  // 2. read them back, pictures first, then the video
  const results = {};
  for(const [kind, files] of [['pictures', fs.readdirSync(path.join(OUT, 'orbit')).filter(f => f.endsWith('.png')).sort().map(f => path.join(OUT, 'orbit', f))], ['video', [vid]]]){
    const {page, logs, ctx} = await open(browser, {});
    await page.click('#tabs [data-tab="pic"]'); await page.setInputFiles('#orbFile', files); await page.click('#orbGo');
    await page.waitForFunction(() => /good|bad/.test(document.querySelector('#orbStatus').className), null, {timeout:240000});
    const st = await page.evaluate(() => document.querySelector('#orbStatus').textContent), G = /bad/.test(await page.evaluate(() => document.querySelector('#orbStatus').className)) ? null : await page.evaluate(LIMB_DIRS);
    await page.locator('#orbGrid').scrollIntoViewIfNeeded(); await page.locator('#orbGrid').screenshot({path:path.join(OUT, `orbit-${kind}-grid.png`)}); await page.screenshot({path:path.join(OUT, `orbit-${kind}.png`)});
    const angs = G ? Object.keys(T).flatMap(k => [0, 1].map(i => angle(T[k][i], G[k][i]))) : [];
    results[kind] = {per:angs.map(Math.round), status:st, worst:Math.round(Math.max(...angs)), mean:Math.round(angs.reduce((a, b) => a + b, 0) / (angs.length || 1)), errors:logs};
    await ctx.close(); }
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
  const pass = Object.values(results).every(r => r.worst < 30 && r.mean < 15 && !r.errors.length); console.log(pass ? 'all passed' : 'FAILED'); process.exit(pass ? 0 : 1);
})();
