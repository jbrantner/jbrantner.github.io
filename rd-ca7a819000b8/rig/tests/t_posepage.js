// 🤸 Pose (rig/pose.html, Jordan 2026-10-29): describe → Make pose (Z-Image, 4 at a time) → pick → Create pose (SAM 3D Body's 3D body) → drag its
// joints → Render with a library character or your own words → save it to the pose library. Run with RIG_DEPS like t_scene.js and SAM_GLB
// (a body GLB from SAM 3D Body; not kept in the repo).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '';
(async () => {
  if(!process.env.SAM_GLB){ console.log('SAM_GLB is needed (a body GLB from SAM 3D Body)'); process.exit(1); }
  const html = fs.readFileSync(path.join(__dirname, '..', 'pose.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:844} });
  const logs = []; page.on('pageerror', e => { logs.push('PAGEERROR ' + e.message); if(process.env.DBG) console.log('PAGEERROR', e.message); }); if(process.env.DBG) page.on('console', m => console.log('C', m.text())); page.on('dialog', d => d.accept());
  await page.route('https://app.test/rig/pose.html*', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route(/https:\/\/app\.test\/rig\/(body|hair|look|bvh)\.js/, r => r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(path.join(__dirname, '..', new URL(r.request().url()).pathname.split('/').pop())) }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  const H = {'access-control-allow-origin':'*'};
  const lib = {name:'Ellie', subfolder:'Character Library/Ellie', trigger:'elliex', lora:'elliex.safetensors', style:'AFKJ Style Illustrious Claude.safetensors', prompt:'elliex, 1girl, solo', tags:'1girl, solo, blue hair, standing, full body', ckpt:'iriselTouchIL_v10.safetensors'};
  const store = new Map(), GRAPHS = [];
  const OI = {UNETLoader:['unet_name', ['z_image_turbo_bf16.safetensors', 'rt_detr_v4-x-hgnet_fp32.safetensors']], CLIPLoader:['clip_name', ['qwen_3_4b.safetensors']], VAELoader:['vae_name', ['ae.safetensors']],
    SAM3DBody_Loader:['model_file', ['sam_3d_body_dinov3_int8_convrot.safetensors']], SAM3DBody_Predict:['image', ['x']], BuildPoseFile:['format', ['x']], LoadMoGeModel:['model_name', ['moge_2_vitl_normal_fp16.safetensors']],
    CheckpointLoaderSimple:['ckpt_name', ['iriselTouchIL_v10.safetensors', 'other.safetensors']], LoraLoader:['lora_name', ['elliex.safetensors', 'AFKJ Style Illustrious Claude.safetensors']], ControlNetLoader:['control_net_name', ['diffusion_pytorch_model_promax.safetensors']]};
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url()), J = b => r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(b) });
    if(u.pathname==='/renderdeck/library') return J({library:1, kinds:['char', 'obj'], characters:[lib]});
    if(u.pathname==='/renderdeck/scenes') return J({scenes:[...store.values()]});
    if(u.pathname==='/renderdeck/scenes/save'){ const b = JSON.parse(r.request().postData()); store.set(b.scene.id, b.scene); return J({ok:true}); }
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return J(d ? {[oi[1]]:{input:{required:{[d[0]]:[d[1]]}}}} : {}); }
    if(u.pathname==='/upload/image'){ const m = r.request().postDataBuffer().toString('latin1').match(/filename="([^"]+)"/); return J({name:m && m[1]}); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return J({prompt_id:'p' + GRAPHS.length}); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[+hi[1].slice(1) - 1], ks = k => Object.keys(g).filter(n => g[n].class_type===k), ok = o => J({[hi[1]]:{status:{status_str:'success', completed:true}, outputs:o}});
      if(ks('Save3DAdvanced').length) return ok({[ks('Save3DAdvanced')[0]]:{'3d':[{filename:'body_00001.glb', subfolder:'Output_Render\\RenderDeck\\pose', type:'output'}], camera_info:[null], model_3d_info:[]}});
      if(ks('EmptySD3LatentImage').length) return ok(Object.fromEntries(ks('SaveImage').map((k, i) => [k, {images:[{filename:'photo_' + GRAPHS.length + '_' + i + '.png', subfolder:'RenderDeck/pose', type:'output'}]}])));
      return ok({[ks('SaveImage')[0]]:{images:[0, 1, 2, 3].map(i => ({filename:'ellie_' + i + '.png', subfolder:'RenderDeck/pose', type:'output'}))}}); }
    if(u.pathname==='/view' && /\.glb$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'model/gltf-binary', headers:H, body:fs.readFileSync(process.env.SAM_GLB) });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#eee"/><rect x="130" y="40" width="40" height="320" fill="#888"/></svg>' });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  const shot = async n => { if(process.env.SHOT){ await page.waitForTimeout(300); await page.screenshot({path:process.env.SHOT + '/pp-' + n + '.png'}); } };
  await page.goto('https://app.test/rig/pose.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})); window.RENDER_POLL = 50; });
  await page.addInitScript(() => { window.RENDER_POLL = 50; });
  await page.goto('https://app.test/rig/pose.html'); await page.waitForTimeout(800);
  const t0 = await page.evaluate(() => ({hint:!document.querySelector('#hint').hidden, make:document.querySelector('#makeb').disabled, tabs:[...document.querySelectorAll('[data-step]')].map(b => b.disabled), save:document.querySelector('#saveb').disabled}));
  ok(t0.hint && t0.make && t0.tabs.join()==='false,true,true' && t0.save, 'a new pose: describe it first; Tweak, Render and Save wait for a pose: ' + JSON.stringify(t0)); await shot('new');
  // 1 Make
  await page.fill('#desc', 'crouching down with her chin on her fists'); await page.click('#makeb');
  await page.waitForFunction(() => document.querySelectorAll('[data-pick]').length===4, null, {timeout:20000});
  const z = Object.values(GRAPHS[0]), txt = z.find(n => n.class_type==='CLIPTextEncode').inputs.text;
  ok(z.filter(n => n.class_type==='KSampler').length===4 && z.find(n => n.class_type==='CLIPLoader').inputs.type==='lumina2' && /chin on her fists/.test(txt) && /whole body/.test(txt), '📸 Make pose: Z-Image Turbo paints 4 people in the pose: ' + txt);
  ok(await page.evaluate(() => document.querySelector('#makeb').textContent.trim()==='＋ 4 more' && document.querySelector('#createb').disabled), 'then the button offers 4 more, and Create pose waits for a pick');
  await page.click('#makeb'); await page.waitForFunction(() => document.querySelectorAll('[data-pick]').length===8, null, {timeout:20000});
  ok(GRAPHS.length===2, '＋ 4 more adds 4 more pictures (8 now)'); await shot('photos');
  await page.click('[data-pick="5"]'); await page.click('#createb');
  await page.waitForFunction(() => window.POSEPAGE.BODY && document.querySelector('[data-step="tweak"]').getAttribute('aria-selected')==='true', null, {timeout:30000});
  const sg = Object.values(GRAPHS[2]), li = sg.find(n => n.class_type==='LoadImage').inputs.image, bp = sg.find(n => n.class_type==='BuildPoseFile').inputs;
  ok(/^RenderDeck\/pose\/photo_2_1\.png \[output\]$/.test(li) && bp.format==='glb' && bp['format.mesh_style']==='body_mesh' && sg.find(n => n.class_type==='SAM3DBody_Predict').inputs.run_hand_refinement, 'Create pose: SAM 3D Body reads the picked picture and writes its 3D body: ' + li);
  const b0 = await page.evaluate(() => { const B = POSEPAGE.BODY, THREE_ = B.g.constructor; const pts = POSEPAGE.samJoints().pts, side = pts[5].clone().sub(pts[2]);
    let y0 = 1e9; B.g.updateMatrixWorld(true); const v = new pts[0].constructor(); for(let i = 0; i < B.sk.geometry.attributes.position.count; i += 9){ B.sk.getVertexPosition(i, v); v.applyMatrix4(B.sk.matrixWorld); y0 = Math.min(y0, v.y); }
    return {floor:+y0.toFixed(3), faces:+(side.x / side.length()).toFixed(2), dots:POSEPAGE.DOTS.length, head:B.bn.bone_113.scale.x, rot:Object.keys(POSEPAGE.P.rot || {}).length}; });
  ok(Math.abs(b0.floor) < 0.02 && b0.faces > 0.8 && b0.head===1.2 && b0.rot===10, '🧍 the 3D body stands on the floor facing the front, head 1.2×, its pose kept: ' + JSON.stringify(b0)); await shot('body');
  // 2 Tweak: drag the right hand up with the finger
  const hp = await page.evaluate(() => { const d = POSEPAGE.DOTS[0], p = POSEPAGE.dotAt(d), v = p.clone().project(POSEPAGE.camera); return {x:(v.x + 1) / 2 * innerWidth, y:(1 - v.y) / 2 * innerHeight, y3:p.y}; });
  await page.mouse.move(hp.x, hp.y); await page.mouse.down(); for(let i = 1; i <= 6; i++) await page.mouse.move(hp.x, hp.y - i * 12); await page.mouse.up(); await page.waitForTimeout(200);
  const h1 = await page.evaluate(() => ({y:POSEPAGE.dotAt(POSEPAGE.DOTS[0]).y, undo:!document.querySelector('#undob').disabled, cam:POSEPAGE.camera.position.toArray().map(v => +v.toFixed(3))}));
  ok(h1.y > hp.y3 + 0.08 && h1.undo, '✋ dragging the pink hand dot raises her hand (the view stays put): ' + hp.y3.toFixed(2) + ' → ' + h1.y.toFixed(2)); await shot('tweak');
  await page.click('#undob'); const h2 = await page.evaluate(() => POSEPAGE.dotAt(POSEPAGE.DOTS[0]).y);
  ok(Math.abs(h2 - hp.y3) < 0.01, '↶ Undo puts it back');
  const kn = await page.evaluate(() => { const d = POSEPAGE.DOTS[6], a = POSEPAGE.dotAt(d), B = POSEPAGE.BODY; POSEPAGE.swing(B.bn[d.bone], a, a.clone().add(new a.constructor(0.2, 0, 0))); return {moved:POSEPAGE.dotAt(d).distanceTo(a)}; });
  ok(kn.moved > 0.1, 'a blue knee dot swings the thigh');
  await page.evaluate(() => { const s = document.querySelector('#head'); s.value = 1.4; s.dispatchEvent(new Event('input')); });
  ok(await page.evaluate(() => POSEPAGE.BODY.bn.bone_113.scale.x===1.4 && POSEPAGE.P.head===1.4), '🙂 Head size grows the head');
  // 3 Render
  await page.click('[data-step="render"]'); await page.click('#renderb'); await page.waitForTimeout(300);
  ok(/Pick a character/.test(await page.textContent('#msg')), 'my own character needs words first');
  await page.selectOption('#who', 'Character Library/Ellie'); await page.click('#renderb');
  await page.waitForFunction(() => document.querySelectorAll('[data-big]').length===4, null, {timeout:30000});
  const rg = Object.values(GRAPHS[GRAPHS.length - 1]), cn = rg.filter(n => n.class_type==='ControlNetApplyAdvanced').map(n => n.inputs.strength + '/' + n.inputs.end_percent), words = rg.find(n => n.class_type==='CLIPTextEncode').inputs.text;
  ok(rg.some(n => n.inputs.lora_name==='elliex.safetensors') && rg.find(n => n.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='iriselTouchIL_v10.safetensors' && cn.join()==='1/0.55,0.6/0.35' && /^elliex, 1girl, solo, blue hair, crouching down with her chin on her fists, full body/.test(words),
    '🎨 Render: Ellie on her model and LoRA over the body\'s skeleton and depth: ' + words + ' · ' + cn);
  const gd = await page.evaluate(() => { const G = POSEPAGE.guides(), x = G.depth.getContext('2d').getImageData(0, 0, G.W, G.H).data; let lit = 0; for(let i = 0; i < x.length; i += 4) if(x[i] > 20) lit++; window.PP_G = {d:G.depth.toDataURL(), p:G.pose.toDataURL()}; return {W:G.W, H:G.H, fill:+(lit / (G.W * G.H)).toFixed(2)}; });
  ok(gd.fill > 0.15 && gd.fill < 0.8 && gd.W % 64===0 && gd.H % 64===0, 'its depth fills the cropped guide: ' + JSON.stringify(gd));
  if(process.env.SHOT){ const G = await page.evaluate(() => window.PP_G); fs.writeFileSync(process.env.SHOT + '/pp-depth.png', Buffer.from(G.d.split(',')[1], 'base64')); fs.writeFileSync(process.env.SHOT + '/pp-skel.png', Buffer.from(G.p.split(',')[1], 'base64')); }
  await shot('render');
  // the library
  await page.click('#saveb'); await page.fill('#savename', 'Chin on fists'); await page.click('#saveok'); await page.waitForTimeout(400);
  const sv = [...store.values()][0];
  ok(sv && sv.kind==='posebook' && sv.name==='Chin on fists' && /^data:image\/jpeg/.test(sv.thumb) && sv.sam && sv.rot && sv.head===1.4 && !sv.renders, '💾 saved to the pose library on the PC (name, thumbnail, 3D body, tweaks, head size)');
  await page.click('#libb'); await page.click('#newb'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !POSEPAGE.BODY && !document.querySelector('#hint').hidden && POSEPAGE.P.desc===''), '＋ New pose starts clean');
  const rot = sv.rot; await page.click('#libb'); await page.waitForSelector('[data-open]'); await shot('library'); await page.click('[data-open]');
  await page.waitForFunction(() => window.POSEPAGE.BODY, null, {timeout:20000});
  const re = await page.evaluate(r => { const B = POSEPAGE.BODY; return Object.entries(r).every(([n, q]) => B.bn[n].quaternion.toArray().every((v, i) => Math.abs(v - q[i]) < 1e-3)) && B.bn.bone_113.scale.x===1.4 && document.querySelector('#title').textContent; }, rot);
  ok(re==='🤸 Chin on fists', 'opening it from the library brings back the body as it was tweaked: ' + re);
  await page.reload(); await page.waitForFunction(() => window.POSEPAGE && POSEPAGE.BODY, null, {timeout:20000});
  ok(await page.evaluate(() => POSEPAGE.P.name==='Chin on fists' && document.querySelector('[data-step="tweak"]').getAttribute('aria-selected')==='true'), 'reopening the tab carries on with the same pose');
  await page.evaluate(() => { const ob = document.querySelector('[data-step="make"]'); ob.click(); }); await page.click('#libb'); await page.waitForSelector('[data-del]'); await page.click('[data-del]'); await page.waitForTimeout(300);
  ok([...store.values()][0].gone && await page.evaluate(() => !document.querySelector('[data-open]')), '🗑 delete takes it out of the library');
  // any model can paint the people (Jordan 2026-10-29: Z-Image repeats itself): an Illustrious model gets the same ask as tags
  { await page.click('#libx'); await page.click('[data-step="make"]'); await page.waitForFunction(() => document.querySelectorAll('#pmodel option').length > 1, null, {timeout:10000});
    await page.selectOption('#pmodel', 'iriselTouchIL_v10.safetensors'); const lb = await page.evaluate(() => ({b:document.querySelector('#makeb').textContent.trim(), ask:document.querySelector('#ask').textContent}));
    const n0 = GRAPHS.length; await page.click('#makeb'); await page.waitForFunction(n => window.POSEPAGE.P.photos.length===4 && window.POSEPAGE.P.made.endsWith('iriselTouchIL_v10.safetensors'), n0, {timeout:20000});
    const ig = Object.values(GRAPHS[n0]), t = ig.find(n => n.class_type==='CLIPTextEncode').inputs.text, ng = ig.filter(n => n.class_type==='CLIPTextEncode')[1].inputs.text;
    ok(lb.b==='Make pose' && /^1girl, solo, crouching/.test(lb.ask) && ig.find(n => n.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='iriselTouchIL_v10.safetensors' && ig.find(n => n.class_type==='EmptyLatentImage').inputs.batch_size===4 && t===lb.ask && /feet out of frame/.test(ng),
      '🎨 an Illustrious model paints the 4 people instead, asked in tags (shown under What gets asked for): ' + t); }
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
