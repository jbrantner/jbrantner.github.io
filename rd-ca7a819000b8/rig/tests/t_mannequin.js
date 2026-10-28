// 🧍 Mannequin (Jordan 2026-10-28, Character Creator v2 path 2): her body shape on the base body, the A pose, 4 tries painted
// over her skeleton and depth, and the picked one sent back to the Character Creator. Run with RIG_DEPS (three.js) and BODY_FBX
// (the kit's Anime_Female_A.fbx; it is Jordan's bought model, so it is never in the repo).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '', FBX = process.env.BODY_FBX || '';
if(!FBX){ console.log('skip: BODY_FBX not set'); process.exit(0); }
(async () => {
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:900} });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  const host = `<!doctype html><body style="margin:0"><iframe id="f" src="rig/mannequin.html?id=ch1&st=" style="width:390px;height:1600px;border:0"></iframe>
    <script>window.GOT = []; addEventListener('message', e => { if(e.data && e.data.rdmq) GOT.push(e.data); });</script></body>`;
  await page.route('https://app.test/host.html', r => r.fulfill({ contentType:'text/html', body:host }));
  await page.route('https://app.test/rig/**', r => { const f = path.join(__dirname, '..', new URL(r.request().url()).pathname.replace('/rig/', '')); r.fulfill({ contentType:f.endsWith('.js') ? 'text/javascript' : 'text/html', body:fs.readFileSync(f) }); });
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => { const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' }); r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  const H = {'access-control-allow-origin':'*'}, UPS = [], GRAPHS = [];
  const OI = {CheckpointLoaderSimple:['ckpt_name', ['bismuthIllustrious_v80.safetensors', 'iriselTouchIL_v10.safetensors']], LoraLoader:['lora_name', ['AFKJ Style Illustrious Claude.safetensors']], ControlNetLoader:['control_net_name', ['illustriousXL_controlnetPromax.safetensors']], FaceDetailer:['x', ['y']], UltralyticsDetectorProvider:['x', ['y']], SAMLoader:['x', ['y']]};
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url());
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(d ? {[oi[1]]:{input:{required:{[d[0]]:[d[1]]}}}} : {}) }); }
    if(u.pathname==='/upload/image'){ const body = r.request().postDataBuffer(), m = body.toString('latin1').match(/filename="([^"]+)"/); UPS.push({name:m && m[1], body}); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({name:m && m[1]}) }); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({prompt_id:'p' + GRAPHS.length}) }); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[GRAPHS.length - 1], save = Object.keys(g).find(k => g[k].class_type==='SaveImage');
      return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({[hi[1]]:{status:{status_str:'success'}, outputs:{[save]:{images:[0, 1, 2, 3].map(i => ({filename:'ch1_0000' + i + '_.png', subfolder:'RenderDeck/mannequin', type:'output'}))}}}}) }); }
    if(u.pathname==='/view' && u.searchParams.get('filename')==='Anime_Female_A.fbx') return r.fulfill({ contentType:'application/octet-stream', headers:H, body:fs.readFileSync(FBX) });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1344"><rect width="768" height="1344" fill="#fff"/><rect x="330" y="80" width="110" height="1200" fill="#c33"/></svg>' });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  await page.goto('https://app.test/host.html');
  await page.evaluate(() => localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})));
  await page.goto('https://app.test/host.html'); const fr = page.frame({url:/mannequin\.html/});
  await fr.waitForFunction(() => window.MQ && MQ.her, null, {timeout:30000}); await page.waitForTimeout(500);
  ok(await fr.evaluate(() => /Paints on render/.test(document.querySelector('#pc').textContent) && !document.querySelector('#close').hidden), 'she loads from the PC that has her, and the page knows which PC paints (with ✕ Close inside the Character Creator)');
  // her measurements: chest depth, hip width, total height
  const meas = () => fr.evaluate(() => { const V = MQ.her.position.constructor, p = new V(); let chestZ = -9, hipX = 0, top = -9, bot = 9; MQ.her.updateMatrixWorld(true);
    MQ.her.traverse(m => { if(!m.isSkinnedMesh || /Eye|Mouth/i.test(m.name)) return; for(let i = 0; i < m.geometry.attributes.position.count; i += 3){ m.getVertexPosition(i, p); p.applyMatrix4(m.matrixWorld);
      top = Math.max(top, p.y); bot = Math.min(bot, p.y); if(p.y > 1.15 && p.y < 1.3 && Math.abs(p.x) < 0.14) chestZ = Math.max(chestZ, p.z); if(p.y > 0.8 && p.y < 0.95 && Math.abs(p.z) < 0.25 && Math.abs(p.x) < 0.3) hipX = Math.max(hipX, Math.abs(p.x)); } });
    return {chestZ:+chestZ.toFixed(3), hipX:+hipX.toFixed(3), top:+top.toFixed(3), bot:+bot.toFixed(3)}; });
  const m0 = await meas();
  const slide = (k, v) => fr.evaluate(([k, v]) => { const r = document.querySelector('#s_' + k); r.value = v; r.dispatchEvent(new Event('input', {bubbles:true})); }, [k, v]);
  await slide('bust', 1.8); await page.waitForTimeout(300); const m1 = await meas();
  ok(m1.chestZ > m0.chestZ + 0.02 && Math.abs(m1.top - 1.7) < 0.01 && Math.abs(m1.bot) < 0.01, '📏 Bust pushes her chest out, she stays 1.7 m on the floor: ' + JSON.stringify({m0, m1}));
  await slide('hips', 1.3); await page.waitForTimeout(300); const m2 = await meas();
  ok(m2.hipX > m1.hipX + 0.02, '📏 Hips widen her hips: ' + JSON.stringify(m2));
  await slide('legs', 1.12); await page.waitForTimeout(300); const legY = await fr.evaluate(() => { const V = MQ.her.position.constructor; MQ.her.updateMatrixWorld(true); let b = null; MQ.her.traverse(x => { if(x.isBone && x.name==='bn_thigh01L' && !b) b = x; }); return new V().setFromMatrixPosition(b.matrixWorld).y; });
  ok(legY > 0.93 && Math.abs((await meas()).top - 1.7) < 0.01, '📏 Leg length puts her hips higher at the same height: ' + legY.toFixed(3));
  await slide('cm', 172); ok(await fr.evaluate(() => MQ.ST.shape.cm===172 && /172 cm/.test(document.querySelector('#o_cm').textContent)), 'Height is kept in cm');
  await fr.click('[data-p="petite"]'); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => MQ.ST.shape.cm===148 && MQ.ST.shape.bust===0.8 && +document.querySelector('#s_bust').value===0.8), 'a preset (Petite) sets every slider');
  ok(await fr.evaluate(() => JSON.parse(localStorage.getItem('rd-mq-ch1')).shape.cm===148), 'her shape is remembered for this character');
  // she stands in the A pose: hands out from her hips, below the shoulders
  const ap = await fr.evaluate(() => { const J = MQ.B.bodyJoints(MQ.her, MQ.BODY.face); return {handR:[+J[4].x.toFixed(2), +J[4].y.toFixed(2)], hipR:+J[8].x.toFixed(2), shY:+J[2].y.toFixed(2)}; });
  ok(ap.handR[0] < ap.hipR - 0.15 && ap.handR[1] < ap.shY - 0.3, '🅰 she stands in the A pose (hands well out from her hips): ' + JSON.stringify(ap));
  // 🎨 Paint 4
  await fr.fill('#desc', 'long silver hair, blue eyes, white blouse, black pleated skirt');
  await fr.evaluate(() => { window.RENDER_POLL = 50; }); await fr.click('#paint'); await fr.waitForFunction(() => document.querySelectorAll('#tries [data-u]').length===4, null, {timeout:20000});
  const g = GRAPHS[0], nodes = Object.values(g), by = c => nodes.filter(n => n.class_type===c);
  const lat = by('EmptyLatentImage')[0].inputs, cns = by('SetUnionControlNetType').map(n => n.inputs.type), ap2 = by('ControlNetApplyAdvanced').map(n => [n.inputs.strength, n.inputs.end_percent]), txt = by('CLIPTextEncode')[0].inputs.text;
  ok(UPS.length===2 && lat.width===768 && lat.height===1344 && lat.batch_size===4, '🎨 sends her depth and skeleton, paints 4 at 768×1344: ' + JSON.stringify(lat));
  ok(JSON.stringify(cns)==='["openpose","depth"]' && ap2[0][0]===0.9 && ap2[1][1] <= 0.5, '…skeleton strong, depth light and letting go early: ' + JSON.stringify(ap2));
  ok(/silver hair/.test(txt) && /a-pose/.test(txt) && /white background/.test(txt) && !/AFKJ/.test(txt) && !by('LoraLoader').length, '…with her description, the A pose and white round her; no style LoRA when the Character Creator says none: ' + txt.slice(0, 120));
  ok(by('CheckpointLoaderSimple')[0].inputs.ckpt_name==='iriselTouchIL_v10.safetensors' && by('FaceDetailer').length===1 && !by('RemoveBackground').length && /mannequin\/ch1/.test(by('SaveImage')[0].inputs.filename_prefix), '…on iriselTouch, faces fixed, kept on white (the turnaround wants white), saved under mannequin/');
  // the depth guide: her alone, light on dark
  const dep = UPS.find(u => /depth/.test(u.name)); ok(dep && dep.body.length > 4000, 'the depth picture is a real picture: ' + (dep && dep.body.length));
  if(process.env.SHOT) UPS.forEach(u => { const b = u.body, a = b.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])); if(a >= 0) fs.writeFileSync(path.join(process.env.SHOT, u.name), b.subarray(a)); });
  // pick and use
  await fr.click('#tries [data-u]:nth-child(2)'); ok(await fr.evaluate(() => !document.querySelector('#use').disabled && /ch1_00001/.test(MQ.ST.pick)), 'tapping one picks it');
  await fr.click('#use'); await page.waitForTimeout(200); const got = await page.evaluate(() => GOT);
  ok(got.length===1 && got[0].rdmq==='use' && got[0].id==='ch1' && /ch1_00001/.test(got[0].url) && got[0].shape.cm===148 && /silver hair/.test(got[0].desc), '✓ Use this one hands her picture, shape and description to the Character Creator: ' + JSON.stringify(got[0]).slice(0, 160));
  await fr.click('#close'); await page.waitForTimeout(200); ok((await page.evaluate(() => GOT)).some(m => m.rdmq==='close'), '✕ Close asks the Character Creator to close it');
  await fr.click('#paint'); await fr.waitForFunction(() => document.querySelectorAll('#tries [data-u]').length===8, null, {timeout:20000}); ok(true, '🎨 Paint 4 more keeps the earlier tries');
  await page.screenshot({path:path.join(__dirname, 'out', 'mannequin.png'), fullPage:true});
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0); })();
