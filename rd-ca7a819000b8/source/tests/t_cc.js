// 🧍 Character Creator (Jordan 2026-10-25/26): its own screen (?cc) on Render Deck's engine. Step 1 a picture, tags, the style;
// step 2 MiniMax's full body on white (reference route, Turbo 4-step, last frame, mouth closed); step 3 the AFKJ redraw 0.45 with
// line art 0.6 on a white margin, ESRGAN 2x with no redraw, the soft face fix; then the 🧊 rig-led orbit with the pose guide at
// 0.6 letting go at 60%; step 5 the finish on every angle (repaint 0.3, line art 0.8, tile 0.6, soft face fix, colour matched on
// her cut-out). The viewer turns her by dragging, changes height up and down, and keeps her feet on one point and her size steady.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const C = a => [a];
const DEF = {
  LoadImage:[['image'],2], UNETLoader:[['unet_name','weight_dtype'],1], LoraLoaderModelOnly:[['model','lora_name','strength_model'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1],
  MiniMaxH3ReferenceToVideo:[['clip','vae','prompt','width','height','length','ref_image_size'],2], ImageFromBatch:[['image','batch_index','length'],1],
  BasicGuider:[['model','conditioning'],1], BasicScheduler:[['model','scheduler','steps','denoise'],1], KSamplerSelect:[['sampler_name'],1], RandomNoise:[['noise_seed'],1],
  SamplerCustomAdvanced:[['noise','guider','sampler','sigmas','latent_image'],2], VAEDecodeTiled:[['samples','vae','tile_size','overlap','temporal_size','temporal_overlap'],1], SaveImage:[['images','filename_prefix'],0],
  CheckpointLoaderSimple:[['ckpt_name'],3], CLIPSetLastLayer:[['clip','stop_at_clip_layer'],1], LoraLoader:[['model','clip','lora_name','strength_model','strength_clip'],2], CLIPTextEncode:[['clip','text'],1],
  ImageScale:[['image','upscale_method','width','height','crop'],1], VAEEncode:[['pixels','vae'],1], VAEDecode:[['samples','vae'],1], EmptyImage:[['width','height','batch_size','color'],1],
  ImageCompositeMasked:[['destination','source','x','y','resize_source'],1], GrowMask:[['mask','expand'],1], InvertMask:[['mask'],1], JoinImageWithAlpha:[['image','alpha'],1], MaskComposite:[['destination','source','x','y','operation'],1], SetLatentNoiseMask:[['samples','mask'],1],
  AnimeLineArtPreprocessor:[['image','resolution'],1], ControlNetLoader:[['control_net_name'],1], SetUnionControlNetType:[['control_net','type'],1],
  ControlNetApplyAdvanced:[['positive','negative','control_net','image','strength','start_percent','end_percent'],2],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1],
  LoadBackgroundRemovalModel:[['bg_removal_name'],1], RemoveBackground:[['bg_removal_model','image'],1], UpscaleModelLoader:[['model_name'],1], ImageUpscaleWithModel:[['upscale_model','image'],1],
  FaceDetailer:[['image','model','clip','vae','positive','negative','bbox_detector','denoise','guide_size','seed'],6], UltralyticsDetectorProvider:[['model_name'],2], SAMLoader:[['model_name','device_mode'],1],
  RenderDeckCutoutColorMatch:[['image','image_ref','strength'],1],
  MiniMaxH3ImageToVideo:[['clip','vae','prompt','width','height','length','first_frame'],2], MiniMaxH3FunControlNetApply:[['model','model_patch','vae','strength','start_percent','end_percent','control_video'],1],
  ModelPatchLoader:[['name'],1], LoadVideo:[['file'],1], GetVideoComponents:[['video'],3], ImageBatch:[['image1','image2'],1],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(!DEF[t.class_type]) errs.push(t.class_type + ' not known'); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
const V = g => Object.values(g), of = (g, c) => V(g).filter(n => n.class_type===c);
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const TALL = fs.readFileSync(path.join(__dirname, 'fixtures', 'cc_tall.png')), SHORT = fs.readFileSync(path.join(__dirname, 'fixtures', 'cc_short.png'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' / ')));
  page.on('dialog', d => d.accept());
  await page.route('https://app.test/**', r => { const u = new URL(r.request().url()); if(u.pathname.endsWith('.txt')) return r.fulfill({ contentType:'text/plain', body:'' }); return r.fulfill({ contentType:'text/html', body:html }); });
  // the pictures the pretend computers made: a tall figure for the high heights, a short one elsewhere (the size fix evens them)
  await page.route('https://jordo-desktop.test/**', r => r.fulfill({ contentType:'image/png', headers:{'access-control-allow-origin':'*'}, body:/_(2|3)_\d+m?/.test(r.request().url()) ? TALL : SHORT }));
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.click('#testBtn'); await page.evaluate(() => closeSheets());
  await page.click('#tabs [data-tab="cc"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !$('#cc').hidden && $('#mainView').offsetParent===null && $('#tabs [data-tab="cc"]').classList.contains('on') && document.querySelectorAll('.ccstep').length===5), 'the 🧍 Character tab (beside Render and Comic) opens the Character Creator with its five steps, Render\'s screen hidden');
  await page.click('#tabs [data-tab="comic"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => $('#cc').hidden && !$('#comic').hidden && S.tab==='comic'), '📖 Comic swaps it out');
  await page.click('#tabs [data-tab="render"]'); await page.click('#tabs [data-tab="cc"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !$('#cc').hidden && $('#comic').hidden && S.tab==='cc'), 'and 🧍 Character comes back');
  ok(await page.evaluate(() => $('[data-cc="go"]').disabled && /Pick her picture/.test($('#cc').textContent)), '▶ Make her waits for a picture');
  // step 1: a picture from the phone, a name, tags, the style
  await page.click('.ccstep[data-cstep="ref"] summary');
  await page.setInputFiles('#ccPick', {name:'her.png', mimeType:'image/png', buffer:SHORT}); await page.waitForTimeout(300);
  await page.fill('[data-ccf="name"]', 'Pinky'); await page.fill('[data-ccf="tags"]', '1girl, solo, pink hair, short hair, blue eyes, brown pinafore dress');
  ok(await page.evaluate(() => { const c = ccChar(); return c.ref && c.name==='Pinky' && /pink hair/.test(c.tags); }), 'step 1 keeps her picture, name and tags');
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-ccf="lora"] option')].some(o => o.selected && /AFKJ/.test(o.value)) && [...document.querySelectorAll('[data-ccf="ckpt"] option')].some(o => o.selected && /iriselTouch/.test(o.value))), 'the style starts as iriselTouch + AFKJ');
  await page.evaluate(() => { CM_SENT.length = 0; }); await page.click('[data-cc="go"]');
  await page.waitForFunction(() => { const P = ccP(ccChar()); return P && P.src; }, null, {timeout:8000});
  const G = await page.evaluate(() => CM_SENT.map(g => JSON.parse(JSON.stringify(g))));
  const full = G.find(g => of(g, 'MiniMaxH3ReferenceToVideo').length), red = G.find(g => of(g, 'UpscaleModelLoader').length);
  ok(full && !check(full).length, 'step 2 is a whole graph: ' + (full ? check(full).join('; ') : 'none sent'));
  if(full){ const rv = of(full, 'MiniMaxH3ReferenceToVideo')[0].inputs, fb = of(full, 'ImageFromBatch')[0].inputs;
    ok(/<Picture 1>/.test(rv.prompt) && /mouth closed, not speaking/.test(rv.prompt) && /white/.test(rv.prompt) && rv.width===576 && rv.height===1024 && rv.length===124, 'step 2: the reference route, 576×1024, <Picture 1>, mouth closed, on white');
    ok(of(full, 'BasicScheduler')[0].inputs.steps===4 && /ref2v_turbo_4step/.test(of(full, 'LoraLoaderModelOnly')[0].inputs.lora_name) && /Turbo/.test(of(full, 'UNETLoader')[0].inputs.unet_name) && fb.batch_index===123, 'step 2: Turbo + its ref2v 4-step LoRA, 4 steps, the last frame kept'); }
  ok(red && !check(red).length, 'step 3 is a whole graph: ' + (red ? check(red).join('; ') : 'none sent'));
  if(red){ const ks = of(red, 'KSampler')[0].inputs, cn = of(red, 'ControlNetApplyAdvanced')[0].inputs, fd = of(red, 'FaceDetailer')[0].inputs, sc = of(red, 'ImageScale').map(n => n.inputs.width + 'x' + n.inputs.height), cp = of(red, 'ImageCompositeMasked')[0].inputs;
    ok(ks.denoise===0.45 && ks.sampler_name==='euler_ancestral' && ks.cfg===5 && cn.strength===0.6 && cn.end_percent===0.8 && of(red, 'CLIPSetLastLayer')[0].inputs.stop_at_clip_layer===-2, 'step 3: AFKJ redraw 0.45 (euler a, CFG 5, clip skip 2) with line art 0.6 to 80%');
    ok(/AFKJ/.test(of(red, 'LoraLoader')[0].inputs.lora_name) && of(red, 'LoraLoader')[0].inputs.strength_model===1 && /iriselTouch/.test(of(red, 'CheckpointLoaderSimple')[0].inputs.ckpt_name) && /AFKJ Style/.test(of(red, 'CLIPTextEncode')[0].inputs.text) && /pink hair/.test(of(red, 'CLIPTextEncode')[0].inputs.text), 'step 3: iriselTouch + AFKJ 1.0, "AFKJ Style" and her tags in the prompt');
    ok(sc.includes('792x1408') && cp.x===36 && cp.y===64 && sc.includes('1728x3072') && /RealESRGAN_x4plus_anime/.test(of(red, 'UpscaleModelLoader')[0].inputs.model_name) && of(red, 'KSampler').length===1, 'step 3: a white margin round her (792×1408 on 864×1536), then ESRGAN 2x to 1728×3072 with no second redraw');
    ok(fd.denoise===0.25 && fd.feather===24 && fd.noise_mask_feather===32 && fd.sam_model_opt && of(red, 'RemoveBackground').length===2, 'step 3: the soft SAM face fix (0.25, feather 24, 32 px noise blend), white pasted back round her'); }
  // step 4 is the 🧊: its moves are led by the rig at 0.6, letting go at 60%
  const P = await page.evaluate(() => { const P = ccP(ccChar()); return {views:P.views.length, mids:P.mids.length, lk:P.lk.filter(h => h.str==='cc').length, orb:P.orb.length, ctl:P.ctl, orbRig:P.orbRig, faces:P.faces, dn:P.dn, src:P.src, iw:P.iw, ih:P.ih, mw:P.mw, mh:P.mh}; });
  ok(P.views===40 && P.mids===40 && P.lk===80 && P.orb===7 && P.ctl && P.orbRig && P.faces && P.dn===0 && /redraw/.test(P.src) && P.iw===768 && P.ih===1344 && P.mw===480 && P.mh===864, 'step 4 is a 🧊 of 5 heights × 16 angles from the step 3 picture (MiniMax 480×864, angles 768×1344, faces fixed, cut out): ' + JSON.stringify(P));
  const orb = await page.evaluate(() => { const P = ccP(ccChar()), o = P.orb.find(o => o.step==='circle' && o.ring===2); return cmPoseOrbGraph(cmFlKits()[0], 'x.png', cmPoseOrbPrompt(o), cmPosePicks(o), 'p', P.mw, P.mh, 'skel.avi', null, P.cc ? 0.6 : 1).g; });
  const fun = of(orb, 'MiniMaxH3FunControlNetApply')[0];
  ok(fun && fun.inputs.strength===0.6 && fun.inputs.end_percent===0.6, 'step 4: the pose guide at 0.6, letting go at 60% (no skeleton lines or red eye points)');
  ok(!(await page.evaluate(() => cmPosesHtml())).includes('Pinky'), "her 🧊 isn't listed among the comic's poses");
  // step 5: waits for each angle's cut-out, then finishes it
  const ready = await page.evaluate(() => { const P = ccP(ccChar()), v = P.lk.find(h => h.str==='cc' && h.ring===1 && h.i===0); const before = !!ccBase(P, v); P.views.find(x => x.ring===1 && x.i===0).url = 'https://jordo-desktop.test/view?filename=eye_0.png'; return [before, !!ccBase(P, v)]; });
  ok(!ready[0] && ready[1], 'an angle is finished only once its turnaround cut-out is in');
  const fin = await page.evaluate(() => { const P = ccP(ccChar()), v = P.lk.find(h => h.str==='cc' && h.ring===1 && h.i===0); return ccFinishGraph(ccIllKits()[0], P.cc, v, 'eye_0.png', 'front.png', 'p', P.seed).g; });
  ok(!check(fin).length, 'step 5 is a whole graph: ' + check(fin).join('; '));
  { const ks = of(fin, 'KSampler')[0].inputs, cns = of(fin, 'ControlNetApplyAdvanced').map(n => n.inputs), types = of(fin, 'SetUnionControlNetType').map(n => n.inputs.type), fd = of(fin, 'FaceDetailer')[0].inputs, cm = of(fin, 'RenderDeckCutoutColorMatch')[0];
    ok(ks.denoise===0.3 && ks.sampler_name==='euler' && cns[0].strength===0.8 && cns[0].end_percent===0.8 && cns[1].strength===0.6 && cns[1].end_percent===1 && types.includes('tile'), 'step 5: repaint 0.3 (euler) with line art 0.8 to 80% and tile 0.6');
    ok(fd.denoise===0.25 && fd.feather===24 && fd.noise_mask_feather===32 && fd.sam_model_opt, 'step 5: the soft SAM face fix');
    ok(cm && cm.inputs.strength===0.6 && of(fin, 'LoadImage').some(n => n.inputs.image==='front.png') && !of(fin, 'ColorMatch').length, 'step 5: colour matched on her cut-out to the step 3 front at 0.6 (no whole-frame ColorMatch)');
    ok(of(fin, 'InvertMask').length===2 && of(fin, 'ImageCompositeMasked').length===2 && of(fin, 'JoinImageWithAlpha').length===1, 'step 5: her outline comes from the cut-out, white round her before and after, saved see-through'); }
  ok(await page.evaluate(() => { const oi = Object.assign({}, ccIllKits()[0].oi); delete oi.RenderDeckCutoutColorMatch; const P = ccP(ccChar()), v = P.lk[0]; return !Object.values(ccFinishGraph(Object.assign({}, ccIllKits()[0], {oi}), P.cc, v, 'a.png', 'b.png', 'p', 1).g).some(n => /ColorMatch/.test(n.class_type)); }), 'a computer without the new helper finishes without the colour match');
  // the viewer: every angle in, she turns by dragging, the height changes up and down, her feet and size stay put
  await page.evaluate(() => { const P = ccP(ccChar()); P.views.concat(P.mids).forEach(v => v.url = 'https://jordo-desktop.test/view?filename=a_' + v.ring + '_' + v.i + (v.mid ? 'm' : '') + '.png'); P.lk.forEach(h => h.url = 'https://jordo-desktop.test/view?filename=f_' + h.ring + '_' + h.i + (h.mid ? 'm' : '') + '.png'); P.orb.forEach(o => { o.urls = ['https://jordo-desktop.test/view?filename=o.png']; delete o.err; delete o.making; }); save(); CCV.key = ''; ccDraw(true); });
  await page.waitForFunction(() => $('#ccCv') && CCV.box.size >= 2, null, {timeout:8000}); await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({deg:$('#ccDeg').textContent, hl:$('#ccHl').textContent, txt:$('#ccTxt').textContent, go:$('[data-cc="go"]').textContent, states:[...document.querySelectorAll('.ccs')].map(s => s.textContent.trim().split(' ')[0])}));
  ok(st.deg==='0°' && /Eye level · 1\/16/.test(st.hl) && /All 5 steps done · 80 angles/.test(st.txt) && /Make her again/.test(st.go) && st.states.every(s => s==='Done'), 'all 80 in: the viewer opens at eye level, front, and every step says Done: ' + JSON.stringify(st));
  await page.evaluate(() => $('.ccstage').scrollIntoView({block:'center'})); await page.waitForTimeout(100);
  const box = await page.$('#ccStage').then(e => e.boundingBox());
  const drag = async (dx, dy) => { await page.mouse.move(box.x + 150, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 150 + dx, box.y + 300 + dy, {steps:12}); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(150); };
  await drag(box.width / 4, 0);
  ok(await page.evaluate(() => $('#ccDeg').textContent)==='270°', 'a quarter of the viewer dragged right turns her a quarter round (to 270°, the way the sketch turned)');
  await drag(0, 120);
  ok(await page.evaluate(() => /^High/.test($('#ccHl').textContent)), 'dragging down looks from higher up');
  // the size fix: the eye-level picture (short figure) and the high one (tall figure) stand on one floor point, sized by the camera
  const feet = await page.evaluate(() => { const at = h => { CCV.h = h; CCV.a = 0; ccPaint(); const cv = $('#ccCv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let top = -1, bot = -1;
      for(let y = 0; y < cv.height; y++){ let any = false; for(let x = 0; x < cv.width; x += 2){ const o = (y * cv.width + x) * 4; if(d[o] < 200){ any = true; break; } } if(any){ if(top < 0) top = y; bot = y; } } return [top, bot]; };
    return {eye:at(2), high:at(0)}; });
  const he = feet.eye[1] - feet.eye[0], hh = feet.high[1] - feet.high[0];
  ok(Math.abs(feet.eye[1] - feet.high[1]) <= 5 && Math.abs(hh / he - Math.cos(35 * Math.PI / 180) / Math.cos(5 * Math.PI / 180)) < 0.03, 'her feet stay on one floor point and the high view is her eye-level height × cos 35° (no size jump): ' + JSON.stringify(feet));
  // step 5 finds her with BiRefNet, kept inside the picture's own cut-out: a picture with no cut-out isn't all "her" (Jordan 2026-10-26)
  ok(await page.evaluate(() => { const P = ccP(ccChar()), G = ccFinishGraph(ccIllKits()[0], P.cc, P.lk[0], 'a.png', 'f.png', 'p', 1).g, N = Object.values(G), mc = N.find(n => n.class_type==='MaskComposite');
    return mc && mc.inputs.operation==='multiply' && G[mc.inputs.destination[0]].class_type==='RemoveBackground' && G[mc.inputs.source[0]].class_type==='InvertMask' && N.filter(n => n.class_type==='ImageCompositeMasked').every(n => n.inputs.mask[0]===mc._id || G[n.inputs.mask[0]]===mc); }), 'step 5: her outline is BiRefNet × her own cut-out, so a picture without one keeps its white');
  const noBg = async bg => page.evaluate(async bg => { const real = cmIllKits; cmIllKits = () => real().map(k => Object.assign({}, k, bg ? {} : {bg:''})); const P = ccP(ccChar()), h = P.lk[0], keep = h.url; h.url = ''; delete h.making; delete h.err; CM_SENT.length = 0;
    cmPoseRun(P, true); await new Promise(r => setTimeout(r, 600)); const sent = CM_SENT.length > 0 || !!h.making || !!h.busy || (h.url && h.url!==''); delete h.making; delete h.busy; h.url = keep; cmIllKits = real; return sent; }, bg);
  ok(await noBg(true) && !await noBg(false), 'step 4/5 jobs go to a PC with BiRefNet, never to one without');
  ok(await page.evaluate(() => { const P = ccP(ccChar()), G = ccFinishGraph(ccIllKits()[0], P.cc, P.lk[0], 'a.png', 'f.png', 'p', 1).g, N = Object.values(G), sv = N.find(n => n.class_type==='SaveImage'), j = G[sv.inputs.images[0]];
    return j.class_type==='JoinImageWithAlpha' && G[j.inputs.alpha[0]].class_type==='InvertMask' && G[G[j.inputs.alpha[0]].inputs.mask[0]].class_type==='MaskComposite'; }), 'step 5 saves her as a see-through PNG (her outline as the alpha)');
  // her axis: from above, the lowest band is only the near foot; the top of her head stays on her turning axis
  ok(await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 700; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 700); x.fillStyle = '#222';
    x.fillRect(180, 40, 40, 50); x.fillRect(150, 90, 100, 450); x.fillRect(230, 540, 60, 80); const im = new Image(); im.src = c.toDataURL(); await im.decode(); ccMeasure(im); const b = CCV.box.get(im.src); return Math.abs(b.cx - 0.5) < 0.02; }), 'her axis is the middle of her body, not the foot nearer the camera');
  // an angle whose finish isn't in yet: never the raw MiniMax frame (grey, not cut out), the nearest finished angle holds instead (Jordan 2026-10-26)
  ok(await page.evaluate(() => { const P = ccP(ccChar()), h = P.lk.find(x => x.str==='cc' && x.ring===1 && x.i===1 && !x.mid), keep = h.url; h.url = '';
    const pics = ccPics(P), raw = pics[2][2]; CCV.key = ''; ccViewer(pics); CCV.h = 2; const n = ccNear(2); h.url = keep; CCV.key = ''; ccViewer(ccPics(P));
    return raw==='' && n && /_1_0m?\.png|_1_1m\.png/.test(n.im.src) && n.ring===1; }), 'an unfinished angle shows the nearest finished one at that height, not its grey MiniMax frame');
  // 🧊 Open in 3D (Jordan 2026-10-26): her finished angles go to the 3D viewer, anchored on her body
  ok(await page.evaluate(() => { const P = ccP(ccChar()); cmPoseSync(); const sp = JSON.parse(localStorage.getItem('rd-pose-sprites')).find(x => x.id===P.id);
    return sp && sp.cc===true && sp.views.length===40 && sp.views16.length===80 && sp.views.every(u => /filename=f_/.test(u)) && sp.views16.every(u => /filename=f_/.test(u)) && sp.views[8]===sp.src; }), 'Open in 3D hands the viewer her 80 finished angles (8 and 16 round each height), marked as a character');
  await page.evaluate(() => $('[data-cc="open3d"]').scrollIntoView()); await page.click('[data-cc="open3d"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => { const f = $('#cc3d iframe'); return !$('#cc3d').hidden && f && /rig\/view\.html\?pose=/.test(f.getAttribute('src')); }), '🧊 Open in 3D shows her in the 3D viewer over the page');
  await page.click('[data-cc3d="close"]');
  ok(await page.evaluate(() => $('#cc3d').hidden), '✕ Close goes back to the Character tab');
  // ↻ Redo from here: step 5 again keeps the turnaround; step 3 again starts the 🧊 over from a new redraw
  await page.evaluate(() => { const P = ccP(ccChar()); ccRedo(P, 5); });
  ok(await page.evaluate(() => { const P = ccP(ccChar()); return P.lk.filter(h => h.str==='cc' && !h.url).length===80 && P.views.every(v => v.url) && P.src; }), '↻ Redo from step 5 makes the 80 finishes again and keeps the turnaround');
  await page.evaluate(() => { const P = ccP(ccChar()); p3dApply(P, {redo:'ccredo:3'}); });
  ok(await page.evaluate(() => { const P = ccP(ccChar()); return !P.cc.redraw.url && P.cc.full.url && !P.src && P.views.every(v => !v.url); }), "↻ Redo from step 3 (also as a tap passed on to Render's hidden app) keeps the full body and makes the redraw and everything after again");
  await page.evaluate(() => { CM_SENT.length = 0; ccRun(ccP(ccChar())); }); await page.waitForFunction(() => ccP(ccChar()).src, null, {timeout:8000});
  ok(await page.evaluate(() => CM_SENT.some(g => Object.values(g).some(n => n.class_type==='UpscaleModelLoader')) && !CM_SENT.some(g => Object.values(g).some(n => n.class_type==='MiniMaxH3ReferenceToVideo'))), 'it carries on from the redraw, without drawing the full body again');
  // a second character, and deleting one
  await page.click('[data-cc="new"]');
  ok(await page.evaluate(() => ccState().chars.length===2 && !ccChar().ref && $('[data-cc="go"]').disabled), '＋ New character starts an empty one');
  // typing in her boxes: nothing is drawn again under the finger (Jordan 2026-10-26: the box glitched and wouldn't take typing)
  await page.evaluate(() => { const d = $('.ccstep[data-cstep="ref"]'); if(d) d.open = true; });
  await page.click('[data-ccf="name"]'); await page.keyboard.type('Ell', {delay:30}); await page.waitForTimeout(2000); await page.keyboard.type('ie', {delay:30});
  ok(await page.evaluate(() => ccChar().name==='Ellie' && document.activeElement===$('[data-ccf="name"]') && $('.ccchip[aria-pressed="true"]').textContent==='Ellie'), 'the name box keeps her typing, with her chip following along');
  await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(1700); // drawn once with her name in, as after picking her picture
  await page.click('[data-ccf="tags"]'); await page.evaluate(() => { window._ta = $('[data-ccf="tags"]'); }); await page.keyboard.type('blue hair', {delay:30}); await page.waitForTimeout(3300);
  await page.keyboard.type(', red eyes', {delay:30});
  ok(await page.evaluate(() => window._ta===$('[data-ccf="tags"]') && document.activeElement===window._ta && ccChar().tags==='blue hair, red eyes'), 'with a name in, the tags box keeps her typing across the 1.5 s redraws (it glitched for Jordan)');
  // a render from this app as her picture: its prompt, model and LoRAs fill step 1 (Jordan 2026-10-26)
  await page.evaluate(() => { S.gallery.unshift({url:'https://jordo-desktop.test/view?filename=lib.png&subfolder=RenderDeck&type=output', t:Date.now(), prompt:'librarianx, 1girl, solo, gothic dress',
    snap:{prompt:'librarianx, 1girl, solo, gothic dress, standing', addedTags:['purple eyes'], blocks:[{type:'model', ckpt:'iriselTouchIL_v10.safetensors'}, {type:'lora', on:true, lora:'AFKJ Style Illustrious Claude.safetensors', strength:1}, {type:'lora', on:true, lora:'librarianx_v2.safetensors', strength:1}]}}); ccDraw(true); });
  await page.evaluate(() => { const d = $('.ccstep[data-cstep="ref"]'); if(d) d.open = true; }); await page.click('[data-cc="usepic"][data-i="0"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const c = ccChar(); return /librarianx, 1girl, solo, gothic dress/.test(c.tags) && /purple eyes/.test(c.tags) && /iriselTouch/.test(c.ckpt) && /AFKJ/.test(c.lora) && c.loras.length===1 && c.loras[0].name==='librarianx_v2.safetensors' && /librarianx_v2 1 ✕/.test($('#cc').textContent); }), 'tapping a render fills her tags from its prompt, its model, AFKJ as the style and librarianx_v2 as her own LoRA');
  ok(await page.evaluate(() => { const c = ccChar(), k = JSON.parse(JSON.stringify(ccIllKits()[0])), L = k.oi.LoraLoader.input.required.lora_name; (Array.isArray(L[0]) ? L[0] : L[1].options).push('librarianx_v2.safetensors');
    const g = {}; let n = 0; const add = (t, inputs) => { g[++n] = {class_type:t, inputs}; return String(n); }; ccIll(add, k, ccMakeP(c).cc, '');
    const ls = Object.values(g).filter(x => x.class_type==='LoraLoader').map(x => x.inputs.lora_name); return ls.length===2 && /AFKJ/.test(ls[0]) && ls[1]==='librarianx_v2.safetensors'; }), 'her own LoRA is chained after AFKJ in the Illustrious steps');
  await page.click('[data-cc="droplora"]');
  ok(await page.evaluate(() => !ccChar().loras.length), '✕ leaves her LoRA out');
  await page.evaluate(() => S.gallery.shift());
  await page.click('[data-cc="del"]');
  ok(await page.evaluate(() => ccState().chars.length===1 && ccChar().name==='Pinky'), '🗑 deletes the open one and opens the other');
  // the app reopened: still there
  await page.goto('https://app.test/?cc'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !$('#cc').hidden && ccChar().name==='Pinky' && !!ccP(ccChar())), 'reopening the page with ?cc opens the Character Creator on her again');
  await page.click('#tabs [data-tab="render"]'); await page.goto('https://app.test/'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => $('#cc').hidden && !$('#mainView').hidden), 'left on Render, the app reopens on Render');
  await page.click('#tabs [data-tab="cc"]'); await page.goto('https://app.test/'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !$('#cc').hidden && S.tab==='cc'), 'left on 🧍 Character, the app reopens on it');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
