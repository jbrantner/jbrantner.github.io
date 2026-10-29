// 🌄 Environment tab (Jordan 2026-10-28): the Scene page with ?env=1. An environment is a painted ground, 3D objects and the
// words for the place; a scene picks one and shows its ground and objects behind the characters, locked.
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
  await page.goto('https://app.test/rig/scene.html?env=1');
  await page.evaluate(() => localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})));
  await page.goto('https://app.test/rig/scene.html?env=1'); await page.waitForFunction(() => window.SCENE && SCENE.sc, null, {timeout:20000}); await page.waitForTimeout(800);
  const e0 = await page.evaluate(() => ({name:SCENE.sc.name, kind:SCENE.sc.kind, ground:!!SCENE.sc.ground, add:document.querySelector('#add').hidden, rall:document.querySelector('#rall').hidden, words:!!document.querySelector('#ewords'), paint:!!document.querySelector('#gpaint')}));
  ok(e0.name==='Environment 1' && e0.kind==='env' && e0.ground && e0.add && e0.rall && e0.words && e0.paint, '🌄 the Environment tab opens a first environment with a ground, place words and no characters: ' + JSON.stringify(e0));
  // the place words and a built-in 3D object
  await page.fill('#ewords', 'old library, tall bookshelves, warm lamp light');
  await page.click('#addo'); await page.waitForSelector('#chars [data-ref="3D/Wooden chair"]'); await page.click('#chars [data-ref="3D/Wooden chair"]'); await page.waitForTimeout(300);
  // 🖌 paint: Top view, grass base, paint planks on a square
  await page.click('#orthob'); await page.click('#ortho [data-v="top"]'); await page.waitForTimeout(200);
  await page.selectOption('#gpm', '1'); await page.click('#gpaint');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
  const bx = await (await page.$('#stage')).boundingBox();
  await page.mouse.move(bx.x + bx.width / 2 + 40, bx.y + bx.height / 2 + 40); await page.mouse.down(); await page.mouse.move(bx.x + bx.width / 2 + 90, bx.y + bx.height / 2 + 40, {steps:5}); await page.mouse.up(); await page.waitForTimeout(1200);
  const e1 = await page.evaluate(() => ({cells:Object.values(SCENE.sc.ground.cells || {}), objs:SCENE.sc.objs.map(o => o.ref), words:SCENE.sc.words}));
  ok(e1.cells.length >= 2 && e1.cells.every(v => v===1) && e1.objs.join()==='3D/Wooden chair' && /bookshelves/.test(e1.words), '🖌 dragging on the ground paints planks in squares; the chair and words are kept: ' + JSON.stringify(e1));
  const st = [...store.values()].find(s => s.kind==='env');
  ok(st && Object.keys(st.ground.cells).length===e1.cells.length && st.objs.length===1, '💾 the environment is saved on the PC as kind env: ' + JSON.stringify(st && {kind:st.kind, cells:Object.keys(st.ground.cells).length}));
  // 📥 own texture: uploaded to the PC, used in the chosen slot
  await page.setInputFiles('#gf', {name:'stones.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')}); await page.waitForTimeout(700);
  const e2 = await page.evaluate(() => ({tex:SCENE.sc.ground.tex, opt:document.querySelector('#gsel').selectedOptions[0].textContent}));
  ok(UPS.length===1 && e2.tex && e2.tex[0] && /^rd-ground-/.test(e2.tex[0].name) && /yours/.test(e2.opt), '📥 your own ground picture goes to the PC and replaces the chosen texture: ' + JSON.stringify(e2));
  // 🎬 a scene picks it: its ground and its objects (locked) stand behind
  await page.waitForTimeout(900);
  await page.goto('https://app.test/rig/scene.html'); await page.waitForFunction(() => window.SCENE && SCENE.sc, null, {timeout:20000}); await page.waitForTimeout(800);
  const s0 = await page.evaluate(() => ({kind:SCENE.sc.kind || '', opts:[...document.querySelectorAll('#envsel option')].map(o => o.textContent), n:SCENE.sc.objs.length}));
  ok(s0.kind==='' && s0.opts.includes('Environment 1') && s0.n===0, '🎬 Scene keeps its own scenes and lists the environments: ' + JSON.stringify(s0));
  const envId = st.id; await page.evaluate(v => { const e = document.querySelector('#envsel'); e.value = v; e.dispatchEvent(new Event('change')); }, envId); await page.waitForTimeout(400);
  const s1 = await page.evaluate(() => { const o = [...SCENE.objs.values()].find(x => x.ob.fromEnv); return {env:SCENE.sc.env, fromEnv:!!o, lock:o && o.ob.lock, inList:document.querySelector('#objs').textContent.includes('Wooden chair'), ground:SCENE.ground.visible, note:document.querySelector('#envbox').textContent}; });
  ok(s1.env===envId && s1.fromEnv && s1.lock && !s1.inList && s1.ground && /bookshelves/.test(s1.note), '🌄 a scene in that environment shows its ground and its chair (locked, not in the list): ' + JSON.stringify(s1));
  // 🎬 Render Scene in an environment (renovated 2026-10-29): one painting, the place words + ground words in the background region,
  // its chair in the depth guide but not a region of its own (it belongs to the place); no old background test or ▶ Render all
  await page.click('.views [data-v="cam"]'); await page.evaluate(() => { window.RENDER_POLL = 50; scrollTo(0, 0); }); await page.click('#rscene');
  await page.waitForFunction(() => /Done|rror|No PC|not/i.test((document.querySelector('#allmsg') || {}).textContent || ''), null, {timeout:20000});
  { const msgT = await page.textContent('#allmsg'), v = Object.values(GRAPHS[GRAPHS.length - 1]), txt = v.filter(n => n.class_type==='CLIPTextEncode').map(n => n.inputs.text), cls = v.map(n => n.class_type);
    const gone = await page.evaluate(() => ['#rall', '#d3', '#d2'].every(k => document.querySelector(k).hidden) && !document.querySelector('#bgtest'));
    ok(/Done/.test(msgT) && txt.some(t => /old library, tall bookshelves/.test(t) && /scenery/.test(t)) && cls.filter(c => c==='ConditioningSetMask').length===1 && !cls.includes('DetailerForEach') && UPS.some(n => /^rd-scene-sdepth-/.test(n)) && gone,
      '🎬 Render Scene paints the place as one picture (its words in the background region, its chair in the depth): ' + JSON.stringify({msgT, txt:txt.map(t => t.slice(0, 60)), gone})); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
