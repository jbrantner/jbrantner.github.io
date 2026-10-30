// 📖 a comic panel in the 3D page (2026-10-29): ?open=<scene>&panel=<id>&ar=<shape>. The scene is shared by its panels; a panel keeps
// its own camera, renders and words, and what it changes about anyone (moved, hidden, shown) for itself only.
// Run with RIG_DEPS (three.js) like t_scene.js.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '';
(async () => {
  const dir = path.join(__dirname, '..'), html = fs.readFileSync(path.join(dir, 'scene.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:900} });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('dialog', d => d.accept());
  await page.route('https://app.test/rig/scene.html*', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route(/https:\/\/app\.test\/rig\/(body|hair|look|orbit|bvh)\.js/, r => r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(path.join(dir, new URL(r.request().url()).pathname.split('/').pop())) }));
  await page.route(/https:\/\/app\.test\/rig\/grounds\/\w+\.jpg/, r => r.fulfill({ contentType:'image/jpeg', body:fs.readFileSync(path.join(dir, 'grounds', new URL(r.request().url()).pathname.split('/').pop())) }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  const H = {'access-control-allow-origin':'*'}, store = new Map(), UPS = [], GRAPHS = [];
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url());
    if(u.pathname==='/renderdeck/library') return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(u.searchParams.get('kind')==='obj' ? {library:1, kinds:['char', 'obj'], objects:[]} : {library:1, kinds:['char', 'obj'], characters:[]}) });
    if(u.pathname==='/renderdeck/scenes') return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({scenes:[...store.values()]}) });
    if(u.pathname==='/renderdeck/scenes/save'){ const b = JSON.parse(r.request().postData()); store.set(b.scene.id, b.scene); return r.fulfill({ contentType:'application/json', headers:H, body:'{"ok":true}' }); }
    if(u.pathname==='/upload/image'){ const m = r.request().postDataBuffer().toString('latin1').match(/filename="([^"]+)"/); UPS.push(m && m[1]); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({name:m && m[1]}) }); }
    const OI = {CheckpointLoaderSimple:['ckpt_name', ['iriselTouchIL_v10.safetensors']], LoraLoader:['lora_name', ['AFKJ Style Illustrious Claude.safetensors']], ControlNetLoader:['control_net_name', ['illustriousXL_controlnetPromax.safetensors']], LoadBackgroundRemovalModel:['bg_removal_name', ['birefnet.safetensors']], UltimateSDUpscaleNoUpscale:['mode_type', ['Linear']], RenderDeckUpscaleColorFix:['levels', ['x']]};
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(d ? {[oi[1]]:{input:{required:{[d[0]]:[d[1]]}}}} : {}) }); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({prompt_id:'p' + GRAPHS.length}) }); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[+hi[1].slice(1) - 1], save = Object.keys(g).find(k => g[k].class_type==='SaveImage'), pre = g[save].inputs.filename_prefix.split('/').pop();
      return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({[hi[1]]:{status:{status_str:'success'}, outputs:{[save]:{images:Array.from({length:1 + Object.values(g).filter(n => n.class_type==='ImageBatch').length}, (_, i) => ({filename:pre + '_0000' + (i + 1) + '_.png', subfolder:'RenderDeck/scene', type:'output'}))}}}}) }); }
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#3a6"/></svg>' });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  const SCN = {id:'scA', name:'Scene 1', v:1, saved:1, objs:[{id:'o1', kind:'char', ref:'3D/Mannequin', label:'Mannequin', x:0, y:0, z:0, rot:0, s:1}, {id:'o2', kind:'obj', ref:'3D/Wooden chair', label:'Chair', x:1, y:0, z:0, rot:0, s:1}]};
  await page.goto('https://app.test/rig/scene.html');
  await page.evaluate(s => { localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})); localStorage.setItem('rd-scenes', JSON.stringify([s])); }, SCN);
  store.set('scA', SCN);
  await page.goto('https://app.test/rig/scene.html?open=scA&panel=p1&ar=1.5&pdesc=she%20waves&pname=Scene%201&plabel=Panel%201');
  await page.waitForFunction(() => window.SCENE && SCENE.sc && SCENE.PANEL, null, {timeout:20000}); await page.waitForTimeout(500);
  const recOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('rd-scenes')).find(s => s.id==='scA'));
  { const v = await page.evaluate(() => ({t:document.querySelector('#ptitle').textContent, sel:getComputedStyle(document.querySelector('#scenes')).display, a:SCENE.CAM_A, r:SCENE.rects().cam, desc:SCENE.sc.desc, n:SCENE.sc.objs.length}));
    ok(v.t==='Panel 1 · Scene 1' && v.sel==='none' && v.a===1.5 && Math.abs(v.r.w / v.r.h - 1.5) < 0.02 && v.desc==='she waves' && v.n===2, 'panel 1 opens in Scene 1: its title instead of the scene list, a 3:2 camera frame, its words: ' + JSON.stringify(v)); }
  // in panel 1 she moves and the chair hides: only panel 1 changes
  await page.evaluate(() => { const o = SCENE.sc.objs; o[0].x = 2; o[1].hide = true; SCENE.sc.cam = {az:30, el:5, d:4, t:[0, 1, 0]}; SCENE.changed(); });
  { const r = await recOf(), b1 = r.objs.find(o => o.id==='o1'), b2 = r.objs.find(o => o.id==='o2'), p1 = r.panels.p1;
    ok(b1.x===0 && !b2.hide && p1.ov.o1.x===2 && p1.ov.o2.hide===true && p1.cam.az===30 && !r.cam && p1.desc==='she waves', 'the scene keeps her spot and the chair; panel 1 keeps its move, hide, camera and words: ' + JSON.stringify(p1)); }
  // panel 2: everyone where the scene has them, its camera starting from panel 1's
  await page.evaluate(() => postMessage({rdpanel:{scene:'scA', pid:'p2', ar:0.6, desc:'she smiles', label:'Panel 2'}}, location.origin)); await page.waitForFunction(() => SCENE.PANEL.pid==='p2');
  { const v = await page.evaluate(() => ({x:SCENE.sc.objs[0].x, hide:!!SCENE.sc.objs[1].hide, cam:SCENE.sc.cam && SCENE.sc.cam.az, a:SCENE.CAM_A, desc:SCENE.sc.desc, t:document.querySelector('#ptitle').textContent}));
    ok(v.x===0 && !v.hide && v.cam===30 && v.a===0.6 && v.desc==='she smiles' && v.t==='Panel 2 · Scene 1', 'panel 2 has her and the chair as the scene has them, panel 1\'s camera to start, its own shape and words: ' + JSON.stringify(v)); }
  // someone added in panel 2 joins the scene hidden and shows in panel 2; a shared change (the environment) goes to the scene
  await page.evaluate(() => { SCENE.sc.objs.push({id:'o3', kind:'char', ref:'3D/Mannequin', label:'Mannequin 2', x:-1, y:0, z:0, rot:0, s:1}); SCENE.sc.env = 'e1'; SCENE.sc.scene = {pc:'https://render.test', file:'p2.png', sub:'RenderDeck/scene', key:'k'}; SCENE.changed(); });
  { const r = await recOf(), b3 = r.objs.find(o => o.id==='o3');
    ok(b3 && b3.hide===true && r.panels.p2.ov.o3.hide===false && r.env==='e1' && r.panels.p2.scene.file==='p2.png' && !r.scene && r.panels.p1.ov.o1.x===2, 'the new character is hidden in the scene and shown in panel 2; the environment is the scene\'s; the render is panel 2\'s: ' + JSON.stringify({b3, ov:r.panels.p2.ov, env:r.env})); }
  // back to panel 1: as it was, without the new character, with the scene's environment
  await page.evaluate(() => postMessage({rdpanel:{scene:'scA', pid:'p1', ar:1.5}}, location.origin)); await page.waitForFunction(() => SCENE.PANEL.pid==='p1');
  { const v = await page.evaluate(() => ({x:SCENE.sc.objs.find(o => o.id==='o1').x, chair:!!SCENE.sc.objs.find(o => o.id==='o2').hide, o3:!!SCENE.sc.objs.find(o => o.id==='o3').hide, env:SCENE.sc.env, cam:SCENE.sc.cam.az, scene:SCENE.sc.scene}));
    ok(v.x===2 && v.chair && v.o3 && v.env==='e1' && v.cam===30 && !v.scene, 'panel 1 again: she is where it put her, the chair and the new character hidden, the scene\'s environment, no panel 2 render: ' + JSON.stringify(v)); }
  // a ⧉ duplicated panel starts as the one it came from
  await page.evaluate(() => postMessage({rdpanel:{scene:'scA', pid:'p3', ar:1, from:'p1'}}, location.origin)); await page.waitForFunction(() => SCENE.PANEL.pid==='p3');
  ok(await page.evaluate(() => SCENE.sc.objs.find(o => o.id==='o1').x===2 && !!SCENE.sc.objs.find(o => o.id==='o2').hide), 'a duplicated panel starts with its source panel\'s changes');
  // the PC copy is the same record, panels and all
  await page.waitForTimeout(1200);
  ok(store.get('scA') && store.get('scA').panels && Object.keys(store.get('scA').panels).sort().join()==='p1,p2,p3', 'the PC gets the scene with its 3 panels');
  // opening the scene itself leaves the panel
  await page.evaluate(() => postMessage({rdopen:'scA'}, location.origin)); await page.waitForFunction(() => !SCENE.PANEL);
  ok(await page.evaluate(() => SCENE.sc.objs.find(o => o.id==='o1').x===0 && getComputedStyle(document.querySelector('#ptitle')).display==='none' && SCENE.CAM_A===0.8), 'opening the scene on its own shows the scene, not a panel');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
