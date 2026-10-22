// Pose Rig: the skinned body. Builds it, checks it is one closed, outward-facing skin bound to the bones, that it
// follows a pose, and screenshots a few poses in Body and X-ray view (tests/out/body-*.png). RIG_DEPS as in t_rig.js.
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
    const f = path.join(DEPS, {'three':'three-0.160.0', '@mediapipe/tasks-vision':'mediapipe-tasks-vision-0.10.14'}[m[1]], 'package', m[3]);
    if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' }); r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  await page.goto('https://app.test/rig/'); await page.waitForFunction(() => window.RIG, null, {timeout:20000});
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  const info = await page.evaluate(() => { const {mesh, info} = RIG.body(), g = mesh.geometry, idx = g.index.array, ec = new Map();
    for(let i = 0; i < idx.length; i += 3) for(const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]){ const k = a < b ? a + ',' + b : b + ',' + a; ec.set(k, (ec.get(k) || 0) + 1); }
    const open = [...ec.values()].filter(v => v!==2).length, w = g.attributes.skinWeight.array; let badW = 0; for(let v = 0; v < w.length; v += 4) if(Math.abs(w[v] + w[v + 1] + w[v + 2] + w[v + 3] - 1) > 1e-3) badW++;
    // the normals point out: the top of the head's normal points up
    const p = g.attributes.position.array, n = g.attributes.normal.array; let top = 0; for(let v = 1; v < p.length / 3; v++) if(p[v * 3 + 1] > p[top * 3 + 1]) top = v;
    return {...info, open, badW, topUp:n[top * 3 + 1]}; });
  ok(info.verts > 5000 && info.open < info.tris * 0.002 && !info.badW && info.topUp > 0.5, 'the body is one closed skin, weights add up, normals face out: ' + JSON.stringify(info));
  // posed: a raised hand's skin goes up with the hand bone
  const follow = await page.evaluate(() => { const R = RIG; R.applyPreset('cheer'); const {mesh} = R.body(), g = mesh.geometry, p = g.attributes.position, v = new (R.bones.pelvis.position.constructor)();
    let maxY = -1; for(let i = 0; i < p.count; i += 7){ mesh.getVertexPosition(i, v); maxY = Math.max(maxY, v.y); } return {maxY, hand:R.wpos(R.bones.handEndL).y}; });
  ok(follow.maxY > follow.hand - 0.05, 'with arms up the skin reaches the raised hands: ' + JSON.stringify(follow));
  const t = await page.evaluate(() => { const t0 = performance.now(); RIG.changeBody({head:1.3}); RIG.changeBody({}); return Math.round((performance.now() - t0) / 2); });
  console.log('rebuild time per body change: ' + t + ' ms');
  fs.mkdirSync(path.join(__dirname, 'out'), {recursive:true});
  for(const [pre, mode, view] of [['stand', 'body', 'front'], ['stand', 'body', 'side'], ['contra', 'body', 'three'], ['run', 'body', 'three'], ['sit', 'xray', 'three'], ['crouch', 'body', 'three'], ['cheer', 'body', 'front']]){
    await page.evaluate(([pre, mode, view]) => { document.querySelector(`[data-preset="${pre}"]`).click(); document.querySelector(`#modes [data-m="${mode}"]`).click(); document.querySelector(`#views [data-v="${view}"]`).click(); RIG.selectH(null); }, [pre, mode, view]);
    await page.waitForTimeout(150); await page.locator('#view').screenshot({path:path.join(__dirname, 'out', `body-${pre}-${mode}-${view}.png`)}); }
  // the three guides at full size, for a look (tests/out/guide-*.png)
  const urls = await page.evaluate(() => { document.querySelector('[data-preset="contra"]').click(); document.querySelector('#views [data-v="three"]').click(); document.querySelector('#gSize').value = '832x1216'; document.querySelector('#gSize').onchange();
    const cs = RIG.guideCanvases(832, 1216, ['pose', 'depth', 'line']); return Object.fromEntries(Object.entries(cs).map(([k, c]) => [k, c.toDataURL('image/png')])); });
  for(const [k, u] of Object.entries(urls)) fs.writeFileSync(path.join(__dirname, 'out', 'guide-' + k + '.png'), Buffer.from(u.split(',')[1], 'base64'));
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
