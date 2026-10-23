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
  // where her feet land in the world, and how tall she is: front vs back
  const at = async az => page.evaluate(az => new Promise(res => { const c = VIEW.camera, d = 4.5; c.position.set(Math.sin(az) * d, 0.96, Math.cos(az) * d); VIEW.controls.update();
    setTimeout(() => { const s = VIEW.stand(), f = VIEW.feet(); res({i:VIEW.view().i, feet:f && s.her.localToWorld(new s.V((f.fx - 0.5) * s.g.wM, (0.5 - f.fy) * s.g.hM, 0)).toArray().map(v => +v.toFixed(3)), ht:f && +(f.ht * s.g.hM * s.her.scale.y).toFixed(3)}); }, 120); }), az);
  const front = await at(0.01), back = await at(Math.PI);
  ok(front.i===0 && back.i===4 && front.feet.every(v => Math.abs(v) < 0.01) && back.feet.every(v => Math.abs(v) < 0.01) && Math.abs(front.ht - back.ht) < 0.02,
    'her feet stand on the same spot from the front and the back, and she is as tall, wherever each picture drew her: ' + JSON.stringify({front, back}));
  // a picture that hasn't loaded yet: the last one stays up instead of going blank
  slow = 'slow'; await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('rd-pose-sprites')); L[0].views[10] = 'https://app.test/pic/x111_y280_h200.svg?slow'; localStorage.setItem('rd-pose-sprites', JSON.stringify(L)); });
  await page.evaluate(() => VIEW.reload()); await page.waitForTimeout(400); await at(0.01);
  const wait = await at(Math.PI / 2); const shown = await page.evaluate(() => { const m = VIEW.stand().her.material.map; return {has:!!m, ready:!!(m && m.userData.ready), url:m && m.image && (m.image.src || 'canvas')}; });
  ok(wait.i===2 && shown.has && shown.ready, 'turning to an angle still loading keeps the last picture up (no blank): ' + JSON.stringify({wait, shown}));
  held.forEach(r => r()); await page.waitForTimeout(400); const after = await at(Math.PI / 2 + 0.001);
  ok(after.i===2 && after.feet && after.feet.every(v => Math.abs(v) < 0.01), 'and once it has loaded it swaps in, feet on the spot: ' + JSON.stringify(after));
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
