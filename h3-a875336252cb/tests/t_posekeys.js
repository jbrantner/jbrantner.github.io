// 🧍 Poses tab: pose keys on a timeline → Motion guide clips + timed pose pictures in H3 Deck, against a fake PC.
// Needs two SAM 3D Body GLBs and three@0.160.0 unpacked: SAM_GLB=a.glb SAM_GLB2=b.glb RIG_DEPS=<dir with three-0.160.0/package>
// Run: NODE_PATH=$(npm root -g) node tests/t_posekeys.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', DEPS = process.env.RIG_DEPS || '', OUT = process.env.SHOTS || '';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
if(!process.env.SAM_GLB || !process.env.SAM_GLB2){ console.log('SAM_GLB and SAM_GLB2 are needed'); process.exit(1); }
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'qwen_image_edit_2511_fp8_e4m3fn.safetensors']], weight_dtype:[['default']]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors', 'qwen_image_vae.safetensors']]}}},
  ModelPatchLoader:{input:{required:{name:[['minimax_h3_fun_controlnet_union_int8.safetensors']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[[]], strength_model:['FLOAT', {default:1}]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContext','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','Video Slice','MiniMaxH3FunControlNetApply','ImageFromBatch','TextEncodeQwenImageEditPlus'];
const POSES = [{kind:'posebook', id:'pzA', name:'Crouch', saved:2, head:1.2, thumb:'', sam:{pc:R, file:'body_A.glb', sub:'RenderDeck/pose', type:'output'}, rot:null},
  {kind:'posebook', id:'pzB', name:'Reach', saved:3, head:1.2, thumb:'', sam:{pc:R, file:'body_B.glb', sub:'RenderDeck/pose', type:'output'}, rot:null}];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8017);
  const br = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}), ctx = await br.newContext({viewport:{width:390, height:844}}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('console', m => { if(m.type()==='error') console.log('console:', m.text()); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:''}));
  await ctx.route('https://cdn.jsdelivr.net/npm/**', r => { const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, 'three-0.160.0', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({status:404, body:''}); r.fulfill({contentType:'text/javascript', body:fs.readFileSync(f)}); });
  let glbGets = 0; const QW = [], UP = {};
  await ctx.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/renderdeck/scenes') return J({scenes:POSES});
    if(p==='/view' && /\.glb$/.test(u.searchParams.get('filename'))){ glbGets++; return rt.fulfill({contentType:'model/gltf-binary', headers:H, body:fs.readFileSync(u.searchParams.get('filename')==='body_A.glb' ? process.env.SAM_GLB : process.env.SAM_GLB2)}); }
    if(p==='/internal/files/input') return J([]);
    // 👤 stand-ins: Qwen jobs (the fake hands back the mannequin picture it was given as the "stand-in")
    if(p==='/upload/image'){ const body = rt.request().postDataBuffer(), m = /filename="([^"]+)"/.exec(body.toString('latin1')), name = m ? m[1] : 'x.png'; const st = body.indexOf(Buffer.from('\x89PNG', 'latin1')); UP[name] = st >= 0 ? body.slice(st) : body; return J({name, subfolder:'', type:'input'}); }
    if(p==='/prompt'){ const g = JSON.parse(rt.request().postData()).prompt; if(Object.values(g).some(n => n.class_type==='TextEncodeQwenImageEditPlus')){ QW.push(g); return J({prompt_id:'q' + QW.length}); } return J({prompt_id:'x'}); }
    if(p.startsWith('/history/q')){ const id = p.slice(9), g = QW[+id.slice(1) - 1], sv = Object.keys(g).find(k => g[k].class_type==='SaveImage'), first = Object.values(g).find(n => n.class_type==='LoadImage').inputs.image;
      return J({[id]:{status:{status_str:'success', completed:true}, outputs:{[sv]:{images:[{filename:'st_' + id + '.png', subfolder:'H3Deck/standins', type:'output', src:first}]}}}}); }
    if(p==='/view' && /^st_q\d+\.png$/.test(u.searchParams.get('filename'))){ const g = QW[+u.searchParams.get('filename').match(/q(\d+)/)[1] - 1], first = Object.values(g).find(n => n.class_type==='LoadImage').inputs.image; return rt.fulfill({contentType:'image/png', headers:H, body:UP[first] || Buffer.alloc(0)}); }
    return rt.fulfill({status:404, headers:H, body:''}); });
  await page.addInitScript(r => { if(!sessionStorage.getItem('done')){ localStorage.clear(); sessionStorage.setItem('done', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.PK_PCS = [r]; }, R);
  await page.goto('http://127.0.0.1:8017/index.html');
  await page.waitForFunction(() => window.H3 && H3.families().length > 0, null, {timeout:20000});

  // ---- the prompt builder: pose pictures become pose subjects with their times
  const P = await page.evaluate(() => H3.h3Prompt({h3:{style:'Live-action, cinematic'}, text:'Ellen dances in the kitchen.', imgs:[{desc:'Ellen, a woman with red hair'}, {pose:{t:0}}, {pose:{t:2}}, {pose:{t:4.5}}], vids:[], auds:[], secs:5, t0:0}));
  console.log(P);
  ok(/<Subject 2> is the body pose shown by the plain grey mannequin in <Picture 2>/.test(P), 'a pose picture is defined as a pose subject');
  ok(/<Subject 3> \(the pose at 00:02\.000\): attribute_transfer - only the body pose of <Picture 3> is transferred to <Subject 1>/.test(P), 'retention says attribute_transfer to the person, with the time');
  ok(/At 00:02\.000, <Subject 1> is in the pose of <Subject 3> from <Picture 3>\./.test(P) && /At 00:04\.500/.test(P), 'the shot says when each pose is reached');
  ok(/<Subject 1> is Ellen, a woman with red hair, as shown in <Picture 1>\./.test(P) && !/Picture 1>, <Picture 2>/.test(P), 'the person stays her own subject');
  const P2 = await page.evaluate(() => H3.h3Prompt({h3:{}, text:'She dances.', imgs:[{desc:'Ellen'}, {pose:{t:1}}, {pose:{t:6}}], secs:4.8, t0:3.9}));
  ok(/\(the pose at 00:02\.100\)/.test(P2) && /<Subject 2> \(not reached in this part\): weak_reference/.test(P2), 'a later piece counts times from its own start, and earlier keys are marked as not in it');
  const PL = await page.evaluate(() => H3.poseLine([{}, {pose:{t:1.5}}], 0, 5));
  ok(/At 00:01\.500 the person is in the pose of the grey mannequin in <Picture 2>/.test(PL), 'plain prompts get one line per pose picture: ' + PL.trim());

  // ---- the Poses tab
  await page.click('#tabs [data-tab="poses"]');
  const fr = await (await page.waitForSelector('#poseTab iframe')).contentFrame();
  await fr.waitForFunction(() => window.PK && PK.LIB.length===2, null, {timeout:20000});
  ok(true, 'the pose library comes from the PC (2 poses)');
  await fr.click('#lib [data-pose="pzA"]');
  await fr.waitForFunction(() => PK.S.keys.length===1 && PK.BODY && Object.keys(PK.Q).length===1, null, {timeout:60000});
  ok(true, 'tapping a pose puts a key at 0 s and the body comes in');
  // to 2 s on the timeline, then the second pose
  const box = await fr.$eval('#tl', e => { const r = e.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; });
  await page.mouse.click(box.x + box.w * 0.4 + 0, box.y + box.h - 6 + (await page.$eval('#poseTab iframe', e => e.getBoundingClientRect().top)));
  const T = await fr.evaluate(() => PK.S.T); ok(Math.abs(T - 2) < 0.1, 'tapping the timeline moves the playhead (' + T.toFixed(3) + ' s)');
  await fr.evaluate(() => { PK.S.T = 2; PK.drawAll(); });
  await fr.click('#lib [data-pose="pzB"]');
  await fr.waitForFunction(() => PK.S.keys.length===2 && Object.keys(PK.Q).length===2, null, {timeout:60000});
  ok(true, 'second key at 2 s with the second pose');
  const turns = await fr.evaluate(() => { const bn = PK.BODY.bn, q = n => bn[n].quaternion.toArray().map(v => +v.toFixed(3)).join(',');
    const at = (t, m) => { PK.poseAt(t, m, true); return {a:q('bone_039'), b:q('bone_002'), hip:PK.BODY.g.position.x}; };
    const s0 = at(0, 'step'), s1 = at(1, 'step'), e1 = at(1, 'ease'), e2 = at(2, 'ease'), k2 = at(2, 'step'); return {s0, s1, e1, e2, k2}; });
  ok(turns.s0.a===turns.s1.a, 'stepped: halfway still holds the first pose');
  ok(turns.e1.a!==turns.s0.a && turns.e1.a!==turns.e2.a, 'eased: halfway is between the two poses');
  ok(turns.e2.a===turns.k2.a, 'both reach the second pose at its key');
  // feet on the floor in an in-between pose
  const minY = await fr.evaluate(() => { PK.poseAt(1, 'ease', true); const THREE = null; const sk = PK.BODY.sk; const b = new (PK.BODY.g.position.constructor)(); return null; });
  const skel = await fr.evaluate(() => { PK.poseAt(1, 'ease', true); const j = PK.opJoints(PK.BODY.bn); return j ? j.pts.map(p => +p.y.toFixed(2)) : null; });
  ok(skel && skel.length===18 && skel.every(y => y > -0.1 && y < 2.2), 'the 18 OpenPose points are on a standing-size body: ' + (skel || []).join(' '));
  if(OUT){ await fr.evaluate(() => { PK.S.T = 0; PK.showT(true); }); await page.waitForTimeout(300); await page.screenshot({path:path.join(OUT, 'posekeys_tab.png')}); }
  // turn the second key
  await fr.evaluate(() => { PK.S.T = 2; PK.showT(true); PK.drawAll(); });
  await fr.$eval('#yaw', e => { e.value = 90; e.dispatchEvent(new Event('input', {bubbles:true})); });
  ok(await fr.evaluate(() => PK.S.keys.find(k => k.t===2).yaw===90), 'Turn her sets the key\'s turn');

  // ---- 🎬 Use in Render
  await fr.evaluate(() => { PK.S.depth = true; PK.S.pics = true; PK.S.clip = 'ease'; PK.drawAll(); });
  await fr.click('#send');
  await page.waitForFunction(() => H3.S.f.ctlVid && H3.S.f.imgs.filter(r => r.pose).length===2, null, {timeout:90000});
  const f = await page.evaluate(() => { const f = H3.S.f, m = H3.S.media; return {ctl:f.ctl, c1:m[f.ctlVid], c2:m[f.ctl2Vid], imgs:f.imgs.map(r => ({pose:r.pose, kind:m[r.id].kind, w:m[r.id].w})), secs:f.seconds, tab:H3.S.tab, ref:f.ref}; });
  console.log(JSON.stringify(f).slice(0, 600));
  ok(f.ctl && f.c1 && f.c1.mode==='pose' && f.c1.size > 1000, 'the skeleton clip is the Motion guide (' + (f.c1 && f.c1.size) + ' bytes)');
  ok(f.c2 && f.c2.mode==='depth', 'the depth clip is the second guide');
  ok(f.imgs.length===2 && f.imgs[0].pose.t===0 && f.imgs[1].pose.t===2 && f.imgs.every(i => i.kind==='img'), 'two pose pictures with their times');
  ok(f.secs===5 && f.tab==='render' && f.ref, 'the shot is 5 s, references on, back on the Render tab');
  const pk = await fr.evaluate(() => ({clips:PK_LAST.clips.map(c => [c.mode, c.frames, c.w, c.h]), keys:PK_LAST.keys.length}));
  ok(pk.clips.length===2 && pk.clips[0][1]===121, 'clips are 121 frames at ' + pk.clips[0][2] + 'x' + pk.clips[0][3]);
  if(OUT){ const b = await fr.evaluate(async () => { const r = new FileReader(); return await new Promise(ok => { r.onload = () => ok(r.result); r.readAsDataURL(PK_LAST.keys[1].blob); }); }); fs.writeFileSync(path.join(OUT, 'posekey_2.png'), Buffer.from(b.split(',')[1], 'base64'));
    const c = await fr.evaluate(async () => { const r = new FileReader(); return await new Promise(ok => { r.onload = () => ok(r.result); r.readAsDataURL(PK_LAST.clips[0].blob); }); }); fs.writeFileSync(path.join(OUT, 'skeleton.webm'), Buffer.from(c.split(',')[1], 'base64'));
    const d = await fr.evaluate(async () => { const r = new FileReader(); return await new Promise(ok => { r.onload = () => ok(r.result); r.readAsDataURL(PK_LAST.clips[1].blob); }); }); fs.writeFileSync(path.join(OUT, 'depth.webm'), Buffer.from(d.split(',')[1], 'base64')); }
  // 📍 Touch points: the skeleton only round each key (black between), no depth, strength from the slider
  { await page.click('#tabs [data-tab="poses"]'); await fr.evaluate(() => { PK.S.clip = 'touch'; PK.S.tstr = 0.7; PK.S.thold = 0.2; PK.S.depth = true; PK.drawAll(); }); const n0 = await page.evaluate(() => Object.keys(H3.S.media).length);
    await fr.click('#send'); await page.waitForFunction(n0 => Object.keys(H3.S.media).length >= n0 + 3 && !document.querySelector('#poseTab iframe').contentWindow.document.querySelector('#send').disabled, n0, {timeout:90000});
    const tf = await page.evaluate(() => ({str:H3.S.f.ctlStr, end:H3.S.f.ctlEnd, c2str:H3.S.f.ctl2Str, c2:H3.S.media[H3.S.f.ctl2Vid] && H3.S.media[H3.S.f.ctl2Vid].name, mode:H3.S.media[H3.S.f.ctlVid].mode, name:H3.S.media[H3.S.f.ctlVid].name}));
    const b = await fr.evaluate(async () => { const r = new FileReader(); return await new Promise(ok => { r.onload = () => ok(r.result); r.readAsDataURL(PK_LAST.clips[0].blob); }); });
    const tmp = path.join(require('os').tmpdir(), 'touch.webm'); fs.writeFileSync(tmp, Buffer.from(b.split(',')[1], 'base64'));
    const b2 = await fr.evaluate(async () => { const r = new FileReader(); return await new Promise(ok => { r.onload = () => ok(r.result); r.readAsDataURL(PK_LAST.clips[1].blob); }); }); const tmp2 = path.join(require('os').tmpdir(), 'touch2.webm'); fs.writeFileSync(tmp2, Buffer.from(b2.split(',')[1], 'base64'));
    const st2 = require('child_process').execSync(`ffmpeg -loglevel error -i ${tmp2} -vf signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=- -f null - 2>/dev/null`).toString().match(/YMAX=\d+/g).map(x => +x.slice(5) > 40 ? 1 : 0), lit2 = st2.map((v, i) => v ? i : -1).filter(i => i >= 0);
    const st = require('child_process').execSync(`ffmpeg -loglevel error -i ${tmp} -vf signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=- -f null - 2>/dev/null`).toString().match(/YMAX=\d+/g).map(x => +x.slice(5) > 40 ? 1 : 0);
    const lit = st.map((v, i) => v ? i : -1).filter(i => i >= 0);
    ok(tf.str===0.7 && tf.end===1 && tf.c2str===0.5 && /touchdepth/.test(tf.c2) && tf.mode==='pose' && /touchpoints/.test(tf.name), 'touch points: skeleton at the slider strength, depth at 0.7 of it, both held to the end: ' + JSON.stringify(tf));
    ok(lit2.join()==='0,1,2,46,47,48,49,50', 'the depth body shows only round each key too (frames ' + lit2.join(',') + ')');
    ok(lit.length===8 && lit.join()==='0,1,2,46,47,48,49,50', 'the skeleton shows only round each key (frames ' + lit.join(',') + ' of ' + st.length + '), black between'); }
  { await page.click('#tabs [data-tab="poses"]'); await fr.evaluate(() => { PK.S.thold = 0.6; PK.S.depth = false; PK.drawAll(); }); const keep = await page.evaluate(() => ({v:H3.S.f.ctl2Vid, imgs:H3.S.f.imgs})); const n0 = await page.evaluate(() => Object.keys(H3.S.media).length);
    await fr.click('#send'); await page.waitForFunction(n0 => Object.keys(H3.S.media).length >= n0 + 3 && !document.querySelector('#poseTab iframe').contentWindow.document.querySelector('#send').disabled, n0, {timeout:90000});
    const b = await fr.evaluate(async () => { const r = new FileReader(); return await new Promise(ok => { r.onload = () => ok(r.result); r.readAsDataURL(PK_LAST.clips[0].blob); }); }); const tmp = path.join(require('os').tmpdir(), 'touch3.webm'); fs.writeFileSync(tmp, Buffer.from(b.split(',')[1], 'base64'));
    const lit = require('child_process').execSync(`ffmpeg -loglevel error -i ${tmp} -vf signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=- -f null - 2>/dev/null`).toString().match(/YMAX=\d+/g).map((x, i) => +x.slice(5) > 40 ? i : -1).filter(i => i >= 0);
    ok(lit.length===8 + 15 && lit[7]===7 && lit[8]===41 && lit[22]===55, 'a 0.6 s hold lights 0.3 s each side of each key (frames ' + lit.join(',') + ')');
    await page.evaluate(k => { H3.S.f.ctl2Vid = k.v; H3.S.f.imgs = k.imgs; }, keep); }
  // the graph: pose pictures go in as references and the prompt carries their times
  await page.evaluate(() => { H3.S.f.prompt = 'Ellen dances in the kitchen.'; H3.S.f.h3 = true; });
  const g = await page.evaluate(() => { const t = H3.snapshot(), oi = H3.PC['http://render.test'].oi, names = {}; [t.ctl.vid, (t.ctl2 || {}).vid, ...t.imgs.map(r => r.id)].filter(Boolean).forEach((id, i) => names[id] = 'f' + i); t.id = 't1'; t.pc = 'http://render.test'; t.seed = 1; t.dir = 'H3Deck/h3_t1'; t.name = 'h3_t1'; return {imgs:t.imgs, g:H3.pieceGraph(t, 0, oi, names).g}; });
  const prompt = Object.values(g.g).map(n => n.inputs && n.inputs.prompt).find(Boolean) || '';
  ok(g.imgs.every(r => r.pose), 'the take keeps the pose times');
  ok(/At 00:02\.000, the person is in the pose of <Subject 2> from <Picture 2>/.test(prompt), 'the take\'s prompt has the timed pose');
  { const cn = Object.values(g.g).filter(n => n.class_type==='MiniMaxH3FunControlNetApply'); ok(cn.length===2 && cn[0].inputs.strength===0.7 && cn[1].inputs.strength===0.5, 'two Fun ControlNet guides (touch points) at 0.7 and 0.5 in the graph: ' + JSON.stringify(cn.map(n => n.inputs))); }
  await page.evaluate(() => { H3.S.f.h3 = false; });
  const g2 = await page.evaluate(() => { const t = H3.snapshot(), oi = H3.PC['http://render.test'].oi, names = {}; [t.ctl.vid, (t.ctl2 || {}).vid, ...t.imgs.map(r => r.id)].filter(Boolean).forEach((id, i) => names[id] = 'f' + i); t.id = 't2'; t.pc = 'http://render.test'; t.seed = 1; t.dir = 'H3Deck/h3_t2'; t.name = 'h3_t2'; return H3.pieceGraph(t, 0, oi, names).g; });
  const prompt2 = Object.values(g2).map(n => n.inputs && n.inputs.prompt).find(Boolean) || ''; console.log(prompt2);
  ok(/At 00:02\.000 the person is in the pose of the grey mannequin in <Picture 2>/.test(prompt2), 'plain prompt too');
  if(OUT){ await page.evaluate(() => { H3.S.f.h3 = true; H3.drawAll(); }); await page.waitForTimeout(300); await page.screenshot({path:path.join(OUT, 'render_tab.png'), fullPage:true}); }
  // ---- ✨ Create in-betweens: the keys go to MiniMax as keyframes at their times, with a mannequin prompt, and no guide
  { await page.click('#tabs [data-tab="poses"]'); await page.evaluate(() => { H3.S.f.prompt = 'Ellen dances in the kitchen.'; });
    const n0 = await page.evaluate(() => Object.keys(H3.S.media).length);
    await fr.click('#ibBtn'); await page.waitForFunction(n0 => Object.keys(H3.S.media).length >= n0 + 2 && H3.S.tab==='render', n0, {timeout:60000});
    const P = await page.evaluate(() => { const f = H3.S.f; return {pins:f.imgs.filter(r => r.pin).map(r => r.pose.t), other:f.imgs.filter(r => !r.pin && r.pose).length, ctl:f.ctl, prompt:f.prompt, mq:f.mq, note:!document.querySelector('#mqNote').hidden}; });
    ok(QW.length===2 && QW.every(g => Object.values(g).some(n => n.class_type==='SaveImage')), '👤 two Qwen stand-in jobs, one per key (' + QW.length + ')');
    { const enc = g => Object.values(g).find(n => n.class_type==='TextEncodeQwenImageEditPlus').inputs; const a = enc(QW[0]), b = enc(QW[1]);
      console.log('QWEN 1:', a.prompt.slice(0, 160)); console.log('QWEN 2:', b.prompt.slice(0, 160)); ok(/^IMPORTANT: (She faces the camera|Seen from)/.test(a.prompt) && /^IMPORTANT: /.test(b.prompt), 'Qwen is told which way she faces');
      ok(/a woman in her 20s/.test(a.prompt) && !a.image2 && /same person as in Picture 2/.test(b.prompt) && b.image2, 'key 1 is made from the words, key 2 also gets key 1\'s stand-in so it is the same person'); }
    ok(await fr.evaluate(() => document.querySelectorAll('#stStrip [data-st]').length===2 && !document.querySelector('#stStrip').hidden), 'the stand-ins show in a strip on the Poses tab');
    ok(await page.evaluate(() => H3.S.f.imgs.filter(r => r.pin).every(r => /^standin_/.test(H3.S.media[r.id].name))), 'the keyframes sent are the stand-ins');
    const plan = await page.evaluate(() => H3.currentPlan().map(p => [p.start, p.gen, p.ctx])); console.log(JSON.stringify(plan));
    ok(plan.length===2 && plan[1][0] >= 2 && plan[1][0] < 2.8 && plan[1][2] > 0, 'key to key: piece 1 runs to just past the 2 s key, piece 2 carries on from it: ' + JSON.stringify(plan));
    ok(P.pins.join()==='0,2' && !P.other && !P.ctl && P.prompt==='Ellen dances in the kitchen.' && /One person, the same throughout/.test(P.mq) && P.note, '✨ in-betweens: two keyframes pinned at 0 s and 2 s, no Motion guide, your prompt untouched, the rest of the wording kept out of sight: ' + JSON.stringify(P).slice(0, 200));
    for(const h3 of [true, false]){ await page.evaluate(h3 => { H3.S.f.h3 = h3; }, h3);
      const g = await page.evaluate(() => { const t = H3.snapshot(), oi = H3.PC['http://render.test'].oi, names = {}; [...t.imgs.map(r => r.id), ...t.pins.map(r => r.id)].forEach((id, i) => names[id] = 'f' + i); t.id = 't9'; t.pc = 'http://render.test'; t.seed = 1; t.dir = 'H3Deck/h3_t9'; t.name = 'h3_t9'; return {pins:t.pins, imgs:t.imgs.length, g:H3.pieceGraph(t, 0, oi, names).g}; });
      const nodes = Object.values(g.g), guides = nodes.filter(n => n.class_type==='MiniMaxH3AddGuide' && n.inputs.image), rv = nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo'), prm = (rv && rv.inputs.prompt) || '';
      const frames = guides.map(n => n.inputs.frame_idx).join(), imgsOk = guides.every(n => g.g[n.inputs.image[0]].class_type==='LoadImage');
      ok(g.imgs===0 && frames==='0,48' && imgsOk && !Object.keys(rv.inputs).some(k => /ref_images\./.test(k)) && !nodes.some(n => n.class_type==='MiniMaxH3FunControlNetApply') && !/Picture/.test(prm) && /One person, the same throughout[\s\S]*Ellen dances in the kitchen/.test(prm),
        (h3 ? '🧾' : 'plain') + ' graph: the pictures are MiniMax keyframes at frames ' + frames + ', not references; the prompt is the hidden mannequin wording + yours'); }
  }
  ok(await page.evaluate(() => typeof H3.toMocap==='function') && await page.evaluate(() => !!document.querySelector('#mocapBox')), 'takes can go to Mocap');
  ok(glbGets===2, 'each 3D body was fetched once (' + glbGets + ')');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
