// 🧍 Library poses: a pose picture goes as a pose-only reference; 👥 Find the people (SAM 3) paints each person a colour, and each
// colour is given to a film character. Checks the scan graph against ComfyUI's SAM 3 node inputs, the coloured copy, the prompt
// (structured and plain), the per-shot 🧍 chip, finishing passes leaving it out, and the Library sheet. Fake ComfyUI in the browser.
// Run: NODE_PATH=$(npm root -g) node tests/t_poselib.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sam3.1_multiplex_fp16.safetensors']]}}},
  // the real inputs (ComfyUI comfy_extras/nodes_sam3.py, nodes_mask.py, nodes.py)
  SAM3_Detect:{input:{required:{model:['MODEL'], image:['IMAGE'], threshold:['FLOAT', {default:0.5}], refine_iterations:['INT', {default:2}], individual_masks:['BOOLEAN', {default:false}]}, optional:{conditioning:['CONDITIONING'], bboxes:['BOUNDING_BOX'], positive_coords:['STRING'], negative_coords:['STRING']}}},
  MaskToImage:{input:{required:{mask:['MASK']}}}, PreviewImage:{input:{required:{images:['IMAGE']}}}, LoadImage:{input:{required:{image:[['x.png']]}}}, CLIPTextEncode:{input:{required:{text:['STRING'], clip:['CLIP']}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join','MiniMaxH3MotionContext',
  'LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8023);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let MASKS = [], SENT = null;
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/upload/image') return J({name:'h3deck_pose.png', subfolder:'h3deck', type:'input'});
    if(p==='/prompt'){ SENT = JSON.parse(rt.request().postData()).prompt; return J({prompt_id:'pid1'}); }
    if(p==='/history/pid1'){ const save = Object.keys(SENT).find(k => SENT[k].class_type==='PreviewImage'); return J({pid1:{status:{status_str:'success', completed:true, messages:[]}, outputs:{[save]:{images:MASKS.map((m, i) => ({filename:'m' + i + '.png', subfolder:'', type:'temp'}))}}}}); }
    if(p==='/view'){ const i = +(u.searchParams.get('filename') || '').replace(/\D/g, ''); if(!MASKS[i]) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:Buffer.from(MASKS[i], 'base64')}); }
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8023/index.html');
  await page.waitForFunction(() => H3.families().length > 1 && H3.PC['http://render.test'] && H3.PC['http://render.test'].oi, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  // two people side by side (a white mask each), and the picture itself
  const made = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d');
    const mask = (x0) => { x.fillStyle = '#000'; x.fillRect(0, 0, 400, 300); x.fillStyle = '#fff'; x.fillRect(x0, 40, 90, 240); return c.toDataURL('image/png').split(',')[1]; };
    const right = mask(260), left = mask(50), dup = mask(262); x.fillStyle = '#8a6'; x.fillRect(0, 0, 400, 300); x.fillStyle = '#c33'; x.fillRect(50, 40, 90, 240); x.fillStyle = '#33c'; x.fillRect(260, 40, 90, 240);
    return {masks:[right, left, dup], pic:c.toDataURL('image/png').split(',')[1]}; });
  MASKS = made.masks; // SAM's best-first order: right one first, then left, then the right one again (a double)
  await page.evaluate(async ({REF, pic}) => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> and <Subject 2> laugh together.'});
    const b = await (await fetch('data:image/png;base64,' + pic)).blob(); const id = await H3.addMedia(new File([b], 'hug.png', {type:'image/png'}), 'img');
    ['pa', 'pb'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Laura', pics:['pa'], keep:'exact'}, {n:2, kind:'char', stand:'a man', who:'Ben', pics:['pb'], keep:'exact'}];
    const L = H3.libNew('pose'); L.name = 'The hug'; L.pics = [id]; window.POSE = L; H3.drawAll(); }, {REF, pic:made.pic});
  const prom = () => page.evaluate(R => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const T = H3.castTake(t, true), names = {}; T.imgs.forEach(r => names[r.id] = r.id + '.png');
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, names).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, R);
  // one person, no scan: the original picture as a pose-only reference
  await page.evaluate(() => { H3.poseGive(POSE, -1, 1); });
  let P = await prom(); const pid = await page.evaluate(() => POSE.pics[0]);
  console.log(P.p.split('summary:')[0].split('\n').slice(-2).join('\n'));
  ok(P.imgs.includes(pid + '.png') && /<Subject 3> is the body pose shown in <Picture 3>\. <Picture 3> is a pose reference only: the people, faces, clothes and place in it never appear/.test(P.p)
    && /attribute_transfer - only the body pose from <Picture 3> is transferred: the person's pose goes to <Subject 1>/.test(P.p) && /<Subject 1> starts in the pose of the person from <Subject 3>\./.test(P.p), 'one person: the picture goes as a pose reference only, given to <Subject 1>');
  // 👥 Find the people: the graph, then the coloured copy
  await page.evaluate(() => { H3.setTab('lib'); H3.openLib(POSE.id); });
  ok(await page.evaluate(() => !!document.querySelector('[data-lb="scan"]') && /Who takes this pose/.test(document.querySelector('#lbBox').textContent)), 'the pose sheet has 👥 Find the people and who takes it');
  await page.click('[data-lb="scan"]');
  await page.waitForFunction(() => (POSE.ppl || []).length > 0 || /Couldn't|nobody/.test((document.querySelector('#poseNote') || {}).textContent || ''), null, {timeout:20000});
  const det = Object.values(SENT).find(n => n.class_type==='SAM3_Detect'), clip = Object.values(SENT).find(n => n.class_type==='CLIPTextEncode');
  const bad = Object.values(SENT).flatMap(n => Object.keys(n.inputs).filter(k => { const s = SCHEMA[n.class_type]; return !s || !((s.input.required || {})[k] || (s.input.optional || {})[k]); }).map(k => n.class_type + '.' + k));
  ok(det && det.inputs.individual_masks===true && /^person:\d$/.test(clip.inputs.text) && !bad.length && Object.values(SENT).some(n => n.class_type==='LoadImage' && n.inputs.image==='h3deck/h3deck_pose.png'), 'scan graph: SAM 3 "person:N", one mask each, only real inputs ' + JSON.stringify(bad));
  const C = await page.evaluate(async () => { const L = POSE, im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); H3.mediaUrl(L.coded).then(u => i.src = u); });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const px = (a, b) => [...x.getImageData(a, b, 1, 1).data].slice(0, 3);
    return {ppl:L.ppl, left:px(95, 160), right:px(305, 160), bg:px(200, 20), taker:H3.S.cast[0].poses}; });
  console.log(JSON.stringify(C));
  ok(C.ppl.length===2 && C.ppl[0].x < C.ppl[1].x, 'two people (the double dropped), left to right');
  ok(C.left[0] > 150 && C.left[2] < 80 && C.right[2] > 150 && C.right[0] < 100 && Math.abs(C.bg[0] - C.bg[1]) < 3 && C.bg[0] < 140, 'left person red, right person blue, the rest grey');
  ok(JSON.stringify(C.taker)==='[{"id":"' + await page.evaluate(() => POSE.id) + '","p":-1}]', 'an earlier pick stays as "the person" until a colour is picked');
  ok(await page.evaluate(() => document.querySelectorAll('[data-lb^="ptake:0>"]').length===2 && document.querySelectorAll('[data-lb^="ptake:1>"]').length===2 && !!document.querySelector('[data-lb="raw"]')), 'a row of characters for each colour, and the 🎨 switch');
  await page.click('[data-lb="ptake:1>1"]'); await page.click('[data-lb="ptake:0>2"]');
  ok(await page.evaluate(() => JSON.stringify(H3.S.cast.map(c => c.poses.map(x => x.p)))==='[[1],[0]]'), 'tapping gives Laura blue and Ben red');
  await page.click('[data-lb="ptake:0>1"]');
  ok(await page.evaluate(() => JSON.stringify(H3.S.cast.map(c => c.poses.map(x => x.p)))==='[[0],[]]'), 'one person each: giving red to Laura takes it from Ben and her blue');
  await page.click('[data-lb="ptake:1>2"]');
  if(process.env.SHOT) await page.locator('#sheetCard').screenshot({path:process.env.SHOT});
  P = await prom(); const coded = await page.evaluate(() => POSE.coded);
  console.log(P.p.slice(P.p.indexOf('subject_definitions'), P.p.indexOf('overall_soundscape')));
  ok(P.imgs.includes(coded + '.png') && !P.imgs.includes(pid + '.png') && P.imgs.filter(x => x===coded + '.png').length===1, 'the coloured copy goes, once for both of them');
  ok(/<Subject 3> is the body poses and places of the people shown in <Picture 3>\. <Picture 3> is a pose reference only: each person in it is painted one flat colour so they can be told apart \(red person is <Subject 1>, blue person is <Subject 2>\)/.test(P.p)
    && /the red person's pose goes to <Subject 1>, the blue person's pose goes to <Subject 2>/.test(P.p) && /\[Shot 1\] (<Subject \d> is nude\. )*<Subject 1> starts in the pose of the red person from <Subject 3>\. <Subject 2> starts in the pose of the blue person from <Subject 3>\./.test(P.p), 'the prompt says whose pose each colour is');
  // 🎨 off: the original goes, people by place
  await page.click('[data-lb="raw"]'); P = await prom();
  ok(P.imgs.includes(pid + '.png') && /the left-most person's pose goes to <Subject 1>, the second from the left person's pose goes to <Subject 2>/.test(P.p), '🎨 off: the original picture, people named left to right');
  await page.click('[data-lb="raw"]'); await page.click('[data-lb="when:all"]'); P = await prom();
  ok(/<Subject 1> keeps the pose of the red person/.test(P.p) && /\(appears in \[Shot 1\]\): attribute_transfer - only the body poses/.test(P.p), '🧍 The whole shot: they keep it');
  await page.click('[data-lb="when:start"]');
  // a later piece of a split clip: a starting pose is only a weak reference there
  const late = await page.evaluate(() => { const T = H3.castTake({prompt:'<Subject 1> and <Subject 2> laugh.', imgs:[]}, true); return H3.h3Prompt({h3:{}, text:'<Subject 1> and <Subject 2> laugh.', words:'', imgs:T.imgs, vids:[], auds:[], cont:true, secs:5, t0:4.2}); });
  ok(/\(not in this part\): weak_reference/.test(late) && !/starts in the pose/.test(late), 'later pieces: the starting pose is a weak reference');
  // plain prompt (🧾 off)
  await page.evaluate(() => { H3.S.f.h3 = false; }); P = await prom(); await page.evaluate(() => { H3.S.f.h3 = true; });
  ok(/<Picture 3> is a pose reference only, every person in it painted one flat colour: <Subject 1> starts in the pose of the red person in it, <Subject 2> starts in the pose of the blue person in it\./.test(P.p), 'plain prompt says it too');
  // the 🧍 chip switches it off for a shot; finishing passes never send it
  const chip = await page.evaluate(() => H3.descChips(H3.S.cast[0]).find(x => /^pose:/.test(x.key)));
  ok(chip && /🧍 The hug/.test(chip.label), 'a 🧍 chip for the pose under the prompt');
  await page.evaluate(k => { H3.S.f.descOff = {1:[k], 2:[k]}; }, chip.key); P = await prom(); await page.evaluate(() => { H3.S.f.descOff = {}; });
  ok(!P.imgs.includes(coded + '.png') && !/pose reference/.test(P.p), 'chip off: no pose in that shot');
  ok(await page.evaluate(() => !H3.upRefs({prompt:'<Subject 1> and <Subject 2> laugh.', imgs:[]}).some(r => r.poseOf)), '✨ / 🎭 passes leave the pose out');
  // the character card: 🧍 row with ✕, ＋ Pose opens the picker
  await page.evaluate(() => { document.querySelector('[data-close]') && document.querySelector('[data-close]').click(); H3.setTab('films'); H3.drawCast(); });
  ok(await page.evaluate(() => /The hug \(red\) ✕/.test([...document.querySelectorAll('[data-cast^="unpose:"]')].map(b => b.textContent).join('|'))), 'the character card shows "The hug (red) ✕"');
  ok(await page.evaluate(() => { H3.posePickSheet(H3.S.cast[0]); const r = !!document.querySelector('#ppBox [data-pp]'); document.querySelector('[data-close]').click(); return r; }), '＋ Pose lists the Library poses');
  ok(await page.evaluate(() => !H3.libOf(POSE.id) ? false : !document.querySelector('#libTab') || true), 'Library keeps it');
  // nobody found
  MASKS = []; await page.evaluate(() => { H3.setTab('lib'); H3.openLib(POSE.id); }); await page.click('[data-lb="scan"]');
  await page.waitForFunction(() => /nobody/.test((document.querySelector('#poseNote') || {}).textContent || ''), null, {timeout:20000}).catch(() => {});
  console.log(await page.evaluate(() => JSON.stringify({n:(document.querySelector("#poseNote")||{}).textContent, ppl:POSE.ppl, c:H3.S.cast.map(c => c.poses)})));
  ok(await page.evaluate(() => /found nobody/.test(document.querySelector('#poseNote').textContent) && !(POSE.ppl || []).length && !H3.S.cast.some(c => (c.poses || []).some(x => x.p >= 0))), 'nobody found: says so, back to one pose taker');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
