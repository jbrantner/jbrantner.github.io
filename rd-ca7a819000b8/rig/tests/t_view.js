// 🧊 3D viewer: every angle preloads and the last picture stays up until the next one has loaded; each picture is moved and
// sized so her feet stand on the same spot on the floor (pictures with the figure drawn at different places and sizes)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '';
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'view.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:600} });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  let slow = null; const held = [];
  await page.route('https://app.test/rig/view.html*', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/pic/**', async r => { const u = r.request().url(), m = u.match(/x(\d+)_y(\d+)_h(\d+)/);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect x="${m[1] - 15}" y="${m[2] - m[3]}" width="30" height="${m[3]}" fill="#c33"/></svg>`;
    if(slow && u.includes(slow)){ await new Promise(res => held.push(res)); }
    r.fulfill({ contentType:'image/svg+xml', body:svg, headers:{'access-control-allow-origin':'*'} }); });
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  // 24 views: the figure's feet at different spots and heights; ring 1 view 0 (index 8) is the reference
  const pic = (x, y, h) => `https://app.test/pic/x${x}_y${y}_h${h}.svg`;
  const views = Array.from({length:24}, (_, n) => pic(100 + (n % 5) * 8 - 16, 280 - (n % 3) * 20, 200 + (n % 4) * 15));
  views[12] = pic(130, 250, 170); // the back, drawn off to one side, higher up and smaller
  await page.goto('https://app.test/rig/view.html?pose=sp1');
  await page.evaluate(v => { localStorage.setItem('rd-pose-sprites', JSON.stringify([{id:'sp1', name:'t', geo:{wM:1.28, hM:1.92, aim:[0, 0.96, 0]}, src:'', views:v}])); VIEW.reload(); }, views);
  await page.waitForFunction(() => window.VIEW && VIEW.feet(), null, {timeout:20000});
  ok(await page.evaluate(() => !VIEW.stand || true), 'opens'); 
  // where her feet land in the world, and how tall she is: front vs back
  const at = async az => page.evaluate(az => new Promise(res => { const c = VIEW.camera, d = 4.5; c.position.set(Math.sin(az) * d, 0.96, Math.cos(az) * d); VIEW.controls.update();
    setTimeout(() => { const s = VIEW.stand(), f = VIEW.feet(); res({i:VIEW.view().i, feet:f && s.her.localToWorld(new s.V((f.fx - 0.5) * s.g.wM, (0.5 - f.fy) * s.g.hM, 0)).toArray().map(v => +v.toFixed(3)), ht:f && +(f.ht * s.g.hM * s.her.scale.y).toFixed(3)}); }, 120); }), az);
  const front = await at(0.01), back = await at(Math.PI);
  ok(front.i===0 && back.i===4 && front.feet.every(v => Math.abs(v) < 0.01) && back.feet.every(v => Math.abs(v) < 0.01) && Math.abs(front.ht - back.ht) < 0.02,
    'her feet stand on the same spot from the front and the back, and she is as tall, wherever each picture drew her: ' + JSON.stringify({front, back}));
  // from above she is drawn shorter: she is not grown to make up for it (her head blew up)
  { await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); for(let n = 16; n < 24; n++) L[0].views[n] = 'https://app.test/pic/x100_y280_h150.svg'; L[0].views[20] = 'https://app.test/pic/x100_y280_h140.svg'; localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); VIEW.reload(); });
    await page.waitForTimeout(500); const hi = await page.evaluate(() => new Promise(res => { const c = VIEW.camera; c.position.set(0, 0.96 + 4.5 * Math.sin(0.7), 4.5 * Math.cos(0.7)); VIEW.controls.update();
      setTimeout(() => { const s = VIEW.stand(), f = VIEW.feet(); res({ring:VIEW.view().ring, k:+s.her.scale.y.toFixed(3), ht:f && f.ht}); }, 150); }));
    ok(hi.ring===2 && hi.k===1, 'from above she keeps the size she is drawn at (sized only against the front at that height): ' + JSON.stringify(hi)); }
  // a picture that hasn't loaded yet: the last one stays up instead of going blank
  slow = 'slow'; await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); L[0].views[10] = 'https://app.test/pic/x111_y280_h200.svg?slow'; localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); });
  await page.evaluate(() => VIEW.reload()); await page.waitForTimeout(400); await at(0.01);
  const wait = await at(Math.PI / 2); const shown = await page.evaluate(() => { const m = VIEW.stand().her.material.map; return {has:!!m, ready:!!(m && m.userData.ready), url:m && m.image && (m.image.src || 'canvas')}; });
  ok(wait.i===2 && shown.has && shown.ready, 'turning to an angle still loading keeps the last picture up (no blank): ' + JSON.stringify({wait, shown}));
  held.forEach(r => r()); await page.waitForTimeout(400); const after = await at(Math.PI / 2 + 0.001);
  ok(after.i===2 && after.feet && after.feet.every(v => Math.abs(v) < 0.01), 'and once it has loaded it swaps in, feet on the spot: ' + JSON.stringify(after));
  // no fading: only the nearest angle shows, even near the switch (a flat render needs one clean picture)
  { const top = await page.evaluate(() => new Promise(res => { const c = VIEW.camera, d = 4.5; c.position.set(Math.sin(0.38) * d, 0.96, Math.cos(0.38) * d); VIEW.controls.update(); setTimeout(() => res(VIEW.stand().layers[1].mesh.visible), 150); }));
    ok(!top, 'no second picture fades in near a switch: ' + top);
  }
  // 16 angles round: the in-between frames show between the 8
  { await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); L[0].views16 = Array.from({length:48}, (_, n) => n % 2 ? 'https://app.test/pic/x100_y280_h20' + (n % 10) + '.svg?b' + n : L[0].views[Math.floor(n / 16) * 8 + (n % 16) / 2]); localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); VIEW.reload(); });
    await page.waitForTimeout(500); const v = await page.evaluate(() => new Promise(res => { const c = VIEW.camera, d = 4.5, az = Math.PI / 8; c.position.set(Math.sin(az) * d, 0.96, Math.cos(az) * d); VIEW.controls.update(); setTimeout(() => res(VIEW.view()), 150); }));
    ok(v.N===16 && v.k===1 && /\?b17$/.test(v.url), '16 angles round: at 22.5° the in-between frame shows: ' + JSON.stringify(v)); }
  // pinned to the rig: her head-to-feet line leans right from the front, so the upright picture tilts to match; from the side
  // the line stands straight, so that picture doesn't tilt, and it is sized from the rig's line, not from how big it was drawn
  { await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); delete L[0].views16; L[0].rig = [0.2, 1.6, 0]; for(let n = 0; n < 24; n++) L[0].views[n] = 'https://app.test/pic/x100_y280_h200.svg'; L[0].views[10] = 'https://app.test/pic/x100_y280_h170.svg'; localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); VIEW.reload(); });
    await page.waitForTimeout(600); const pin = async az => page.evaluate(az => new Promise(res => { const c = VIEW.camera, d = 4.5; c.position.set(Math.sin(az) * d, 0.96, Math.cos(az) * d); VIEW.controls.update();
      setTimeout(() => { const s = VIEW.stand(), f = VIEW.feet(); res({i:VIEW.view().i, el:VIEW.view().el, rot:+s.layers[0].pivot.rotation.z.toFixed(3), ht:+(f.ht * s.g.hM * s.her.scale.y).toFixed(3)}); }, 150); }), az);
    const fr = await pin(0.01), sd = await pin(Math.PI / 2);
    const E = fr.el * Math.PI / 180, side = 1.6 * Math.cos(E) - 0.2 * Math.sin(E), front = Math.hypot(0.2, 1.6 * Math.cos(E)); // the line as the camera sees it now
    ok(Math.abs(fr.rot + Math.atan2(0.2, 1.6 * Math.cos(E))) < 0.02 && Math.abs(sd.rot) < 0.02 && Math.abs(sd.ht / fr.ht - side / front) < 0.02,
      'pinned to the rig: each picture leans and is sized as the skeleton is from that angle, whatever size it was drawn: ' + JSON.stringify({fr, sd})); }
  // no jump at the switch from the eye-level pictures to the high ones (Jordan 2026-10-23: "her head jumps up on screen"): the high
  // pictures are drawn shorter (seen from above), but either side of the switch she is the height the rig is from the camera
  { await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); L[0].rig = [0, 1.6, 0]; for(let n = 0; n < 24; n++) L[0].views[n] = 'https://app.test/pic/x100_y280_h' + (n >= 16 ? 150 : 200) + '.svg'; localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); VIEW.reload(); });
    await page.waitForTimeout(600); const hAt = async deg => page.evaluate(deg => new Promise(res => { const c = VIEW.camera, d = 4.5, e = deg * Math.PI / 180; c.position.set(0.001, 1 + Math.sin(e) * d, Math.cos(e) * d); VIEW.controls.update();
      setTimeout(() => { const s = VIEW.stand(), f = VIEW.feet(); res({ring:VIEW.view().ring, ht:+(f.ht * s.g.hM * s.her.scale.y).toFixed(3)}); }, 150); }), deg);
    const lo = await hAt(31), hi = await hAt(33.5), top = await hAt(60);
    // and never stretched much past its size from where it was made (its head is drawn big): at 60° it is the high picture's size
    const nat = 1.6 * Math.cos(35 * Math.PI / 180) / (1.6 * Math.cos(5 * Math.PI / 180)) * lo.ht / (Math.cos(31 * Math.PI / 180) / Math.cos(5 * Math.PI / 180));
    ok(lo.ring===1 && hi.ring===2 && Math.abs(hi.ht / lo.ht - 1) < 0.05 && hi.ht <= nat * 1.01 && top.ht <= nat * 1.01, 'no jump in her height where the eye-level pictures switch to the high ones: ' + JSON.stringify({lo, hi, top, nat})); }
  // a flat camera: zoomed right in and from above, the picture keeps its drawn shape (it deformed with the perspective camera)
  { const z = await page.evaluate(() => new Promise(res => { const c = VIEW.camera; c.position.set(0, 0.96 + 4.5 * Math.sin(0.5), 4.5 * Math.cos(0.5)); c.zoom = 4; c.updateProjectionMatrix(); VIEW.controls.update();
      setTimeout(() => { const s = VIEW.stand(), V = s.V, g = s.g, P = (x, y) => s.her.localToWorld(new V(x, y, 0)).project(c), a = P(-g.wM / 2, -g.hM / 2), b = P(g.wM / 2, -g.hM / 2), d = P(-g.wM / 2, g.hM / 2);
        res({flat:!!c.isOrthographicCamera, ratio:+(Math.hypot((b.x - a.x) * c.aspect, b.y - a.y) / Math.hypot((d.x - a.x) * c.aspect, d.y - a.y) / (g.wM / g.hM)).toFixed(3)}); }, 150); }));
    ok(z.flat && Math.abs(z.ratio - 1) < 0.02, 'a flat camera: zoomed in and from above, she keeps the shape she was drawn with: ' + JSON.stringify(z)); }
  // 5 heights (Jordan 2026-10-24): with the in-between rings (20° and -10°) the nearest height's pictures show
  { const rr = await page.evaluate(() => new Promise(res => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); delete L[0].views16; L[0].views = Array.from({length:40}, () => 'https://app.test/pic/x100_y280_h200.svg'); localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); VIEW.reload();
      const c = VIEW.camera, d = 4.5, out = []; const go = (els, k) => { if(!els.length) return k(); const e = els[0] * Math.PI / 180; c.position.set(0.001, 0.96 + Math.sin(e) * d, Math.cos(e) * d); VIEW.controls.update(); setTimeout(() => { out.push(VIEW.view().ring); go(els.slice(1), k); }, 120); };
      setTimeout(() => go([0, 15, 30, 50, -5, -30], () => res(out.join())), 500); }));
    ok(rr==='1,3,2,2,4,0', '5 heights: the nearest of eye level, a little high, high, a little low and low shows: ' + rr); }
  // 📌 locked (Jordan 2026-10-24): the card faces the way its picture was made and doesn't turn as the camera moves within one
  // angle; at the next angle it faces that one's way
  { const lk = await page.evaluate(() => new Promise(res => { VIEW.lock(true); const c = VIEW.camera, d = 4.5, n = [];
      const go = (az, k) => { c.zoom = 1; c.updateProjectionMatrix(); c.position.set(Math.sin(az) * d, 0.96 + 0.39, Math.cos(az) * d); VIEW.controls.update(); setTimeout(() => { const s = VIEW.stand(), q = new s.V(0, 0, 1).applyQuaternion(s.layers[0].st.getWorldQuaternion(new THREE_Q())); n.push(Math.atan2(q.x, q.z)); k(); }, 150); };
      const THREE_Q = VIEW.camera.quaternion.constructor;
      go(-0.15, () => go(0.15, () => go(Math.PI / 4 + 0.05, () => { VIEW.lock(false); res(n.map(a => +a.toFixed(3))); }))); }));
    const step = 2 * Math.PI / 8;
    ok(Math.abs(lk[0]) < 0.01 && Math.abs(lk[1]) < 0.01 && Math.abs(lk[2] - step) < 0.01, '📌 locked: the picture keeps facing the way it was made while the camera moves round, and turns only at the next angle: ' + JSON.stringify(lk)); }
  // 🌄 360° background: a ring drawn behind her by a camera that only turns; the base picture's point faces the front camera,
  // and from the side (camera at +x looking at -x) the part of the panorama a quarter turn to the left shows
  { const px = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 100; const x = c.getContext('2d'); ['#f00', '#0f0', '#00f', '#ff0'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 200, 0, 200, 100); });
      const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); L[0].views = L[0].views.map(() => ''); L[0].src = ''; localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); VIEW.reload();
      VIEW.setPano(c.toDataURL(), 0.125); await new Promise(r => setTimeout(r, 400));
      const at = az => new Promise(res => { const cam = VIEW.camera, d = 4.5; cam.position.set(Math.sin(az) * d, 0.96, Math.cos(az) * d); cam.zoom = 1; cam.updateProjectionMatrix(); VIEW.controls.update();
        setTimeout(() => { const g = document.querySelector('canvas'), gl = g.getContext('webgl2') || g.getContext('webgl'), b = new Uint8Array(4); gl.readPixels(Math.round(g.width / 2), Math.round(g.height * 0.6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); res([...b].slice(0, 3)); }, 200); });
      return {front:await at(0.001), side:await at(Math.PI / 2), has:!!VIEW.pano()}; });
    const col = p => p[0] > 150 && p[1] > 150 ? 'yellow' : p[0] > 150 ? 'red' : p[1] > 150 ? 'green' : p[2] > 150 ? 'blue' : '?';
    ok(px.has && col(px.front)==='red' && col(px.side)==='yellow', '🌄 the 360° background wraps round: the base picture faces the front, a quarter turn of it to each side: ' + JSON.stringify({front:col(px.front), side:col(px.side), px})); }
  // 🧍 straightened: a character's high picture (35° up, filmed with a 30° lens) is unbent: the top of her narrower, the bottom wider,
  // feet and head top where they were; eye level and ?straight off leave the card flat
  { await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); delete L[0].rig; delete L[0].views16; L[0].cc = true; L[0].fov = 30; L[0].ringEl = [-12, 5, 35, 20, -4]; L[0].views = Array.from({length:40}, (_, n) => 'https://app.test/pic/x100_y280_h200.svg?r' + Math.floor(n / 8)); localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); VIEW.reload(); });
    await page.waitForTimeout(700);
    const shape = el => page.evaluate(el => new Promise(res => { const c = VIEW.camera, d = 4.5, e = el * Math.PI / 180; c.position.set(0, 0.96 + d * Math.sin(e), d * Math.cos(e)); VIEW.controls.update();
      setTimeout(() => { const L = VIEW.stand().layers[0], p = L.mesh.geometry.attributes.position, b = L.mesh.geometry.userData.base, n = p.count, w = i => p.getX(i * 2 + 1) - p.getX(i * 2), r = n / 2 - 1;
        res({ring:VIEW.view().ring, top:+(w(0) / (b[3] - b[0])).toFixed(3), bot:+(w(r) / (b[3] - b[0])).toFixed(3), moved:+Math.max(...Array.from(p.array, (v, i) => Math.abs(v - b[i]))).toFixed(3)}); }, 200); }), el);
    const hi = await shape(36), eye = await shape(3); await page.evaluate(() => VIEW.straight(false)); const off = await shape(36); await page.evaluate(() => VIEW.straight(true));
    ok(hi.ring===2 && hi.top < 0.95 && hi.bot > 1.05 && eye.ring===1 && eye.moved < 0.04 && off.moved===0, '🧍 her high picture is straightened (top narrower, bottom wider); eye level barely moves; off leaves it flat: ' + JSON.stringify({hi, eye, off})); }
  // 🧍 slimmed: from 35° up she is narrowed by cos 35° / cos 5° (Jordan's hand edit), eye level not at all; ?slim off leaves her
  { const w = el => page.evaluate(el => new Promise(res => { const c = VIEW.camera, d = 4.5, e = el * Math.PI / 180; c.position.set(0, 0.96 + d * Math.sin(e), d * Math.cos(e)); VIEW.controls.update();
      setTimeout(() => { const m = VIEW.stand().her; res(+(m.scale.x / m.scale.y).toFixed(3)); }, 200); }), el);
    const hi = await w(36), eye = await w(3); await page.evaluate(() => VIEW.slim(false)); const off = await w(36); await page.evaluate(() => VIEW.slim(true));
    ok(Math.abs(hi - Math.cos(35 * Math.PI / 180) / Math.cos(5 * Math.PI / 180)) < 0.01 && eye===1 && off===1, '🧍 slimmed: her high picture is narrowed to ' + hi + ' (cos 35° / cos 5°), eye level ' + eye + ', off ' + off); }
  // 🧍 leaned: the frame rolls about 4° counter-clockwise (the world's up leans left on screen: tilt -4) from 35° up at 45° round, the other way at 315°, none from the front
  { const r = (el, az) => page.evaluate(([el, az]) => new Promise(res => { const c = VIEW.camera, d = 4.5, e = el * Math.PI / 180, a = az * Math.PI / 180; c.position.set(Math.sin(a) * Math.cos(e) * d, 0.96 + d * Math.sin(e), Math.cos(a) * Math.cos(e) * d); VIEW.controls.update();
      setTimeout(() => { const V = VIEW.stand().V, q = c.quaternion, cu = new V(0, 1, 0).applyQuaternion(q), cr = new V(1, 0, 0).applyQuaternion(q), w = new V(0, 1, 0); res({tilt:+(Math.atan2(w.dot(cr), w.dot(cu)) * 180 / Math.PI).toFixed(2), roll:+VIEW.roll().toFixed(2)}); }, 200); }), [el, az]);
    const a = await r(35, 45), b = await r(35, 315), f = await r(35, 0.01), e = await r(5, 45);
    ok(Math.abs(a.tilt + 4) < 0.3 && Math.abs(b.tilt - 4) < 0.3 && Math.abs(f.tilt) < 0.1 && Math.abs(e.tilt) < 1, '🧍 leaned: ' + JSON.stringify({a, b, f, e})); }
  // 🧍 snapping: let go between angles and the camera glides to the nearest made angle and height
  { const r = await page.evaluate(() => new Promise(res => { const c = VIEW.camera, d = 4.5, az = 0.5, e = 28 * Math.PI / 180; c.position.set(Math.sin(az) * Math.cos(e) * d, 0.96 + d * Math.sin(e), Math.cos(az) * Math.cos(e) * d); VIEW.controls.update();
      VIEW.controls.dispatchEvent({type:'end'}); setTimeout(() => { const v = VIEW.view(); res({az:+(v.az * 180 / Math.PI).toFixed(1), el:+v.el.toFixed(1), ring:v.ring}); }, 900); }));
    ok(r.ring===2 && Math.abs(r.az - 45) < 0.5 && Math.abs(r.el - 35) < 0.5, '🧍 letting go between angles glides the camera to the nearest made one (45° round, 35° up): ' + JSON.stringify(r)); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
