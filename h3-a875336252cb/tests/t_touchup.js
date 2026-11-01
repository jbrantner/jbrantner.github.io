// 👁 Touch up page against a fake ComfyUI (answered in the browser, nothing renders). Checks the form and every graph
// sent to /prompt: inputs are the ones ComfyUI 0.41.3 (Render) has (comfy_extras/nodes_video.py, nodes_images.py,
// nodes_mediapipe.py, nodes_sam3.py, the Render Deck helper's RenderDeckTouchUp), links point at real nodes.
// Run: NODE_PATH=$(npm root -g) MEDIA=<folder with clip.webm (1920x1080, 3 s) and spiral.png> node tests/t_touchup.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const MEDIA = process.env.MEDIA, PC = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const C = (...o) => [o];
const SCHEMA = {
  LoadVideo:{input:{required:{file:C('h3touch/clip_clip.webm')}}},
  'Video Slice':{input:{required:{video:['VIDEO'], start_time:['FLOAT', {default:0}], duration:['FLOAT', {default:0}], strict_duration:['BOOLEAN', {default:false}]}}},
  GetVideoComponents:{input:{required:{video:['VIDEO']}}},
  CreateVideo:{input:{required:{images:['IMAGE'], fps:['FLOAT', {default:30}]}, optional:{audio:['AUDIO']}}},
  SaveVideo:{input:{required:{video:['VIDEO'], filename_prefix:['STRING', {default:'video/ComfyUI'}], format:['COMFY_DYNAMICCOMBO_V3', {}]}}},
  SaveImage:{input:{required:{images:['IMAGE'], filename_prefix:['STRING', {default:'ComfyUI'}]}}},
  ImageFromBatch:{input:{required:{image:['IMAGE'], batch_index:['INT', {default:0}], length:['INT', {default:1}]}}},
  ImageScaleToMaxDimension:{input:{required:{image:['IMAGE'], upscale_method:['COMBO', {options:['area', 'lanczos']}], largest_size:['INT', {default:512}]}}},
  LoadImage:{input:{required:{image:C('h3touch/pic_spiral.png')}}},
  LoadMediaPipeFaceLandmarker:{input:{required:{model_name:['COMBO', {options:['mediapipe_face_fp32.safetensors']}]}}},
  MediaPipeFaceLandmarker:{input:{required:{face_detection_model:['FACE_DETECTION_MODEL'], image:['IMAGE'], detector_variant:['COMBO', {options:['short', 'full', 'both']}], num_faces:['INT', {default:1}], min_confidence:['FLOAT', {default:0.5}], missing_frame_fallback:['COMBO', {options:['empty', 'previous', 'interpolate']}]}}},
  MediaPipeFaceMask:{input:{required:{face_landmarks:['FACE_LANDMARKS'], regions:['COMFY_DYNAMICCOMBO_V3', {}]}}},
  CheckpointLoaderSimple:{input:{required:{ckpt_name:[['oneObsession.safetensors', 'sam3.1_multiplex_fp16.safetensors']]}}},
  CLIPTextEncode:{input:{required:{text:['STRING'], clip:['CLIP']}}},
  SAM3_Detect:{input:{required:{model:['MODEL'], image:['IMAGE'], threshold:['FLOAT', {default:0.5}], refine_iterations:['INT', {default:2}], individual_masks:['BOOLEAN', {default:false}]}, optional:{conditioning:['CONDITIONING'], bboxes:['BOUNDING_BOX'], positive_coords:['STRING'], negative_coords:['STRING']}}},
  SAM3_VideoTrack:{input:{required:{images:['IMAGE'], model:['MODEL'], detection_threshold:['FLOAT', {default:0.5}], max_objects:['INT', {default:4}], detect_interval:['INT', {default:1}]}, optional:{initial_mask:['MASK'], conditioning:['CONDITIONING']}}},
  SAM3_TrackToMask:{input:{required:{track_data:['SAM3_TRACK_DATA'], object_indices:['STRING', {default:''}]}}},
  RenderDeckTouchUp:{input:{required:{images:['IMAGE'], mask:['MASK'], mode:[['picture', 'colour']], strength:['FLOAT', {default:1}], keep_detail:['FLOAT', {default:0.6}], smooth:['INT', {default:5}], max_parts:['INT', {default:2}], colour:['STRING', {default:'#9e1030'}], grow:['FLOAT', {default:1.08}]}, optional:{picture:['IMAGE'], fit_mask:['MASK'], clip_mask:['MASK']}}},
};
const ALLOWED = {LoadVideo:['file'], 'Video Slice':['video','start_time','duration','strict_duration'], GetVideoComponents:['video'], CreateVideo:['images','fps','audio','bit_depth','color_space','chroma_subsampling'],
  SaveVideo:['video','filename_prefix','format','format.codec','format.codec.encoding','format.codec.encoding.crf'], SaveImage:['images','filename_prefix'], ImageFromBatch:['image','batch_index','length'],
  ImageScaleToMaxDimension:['image','upscale_method','largest_size'], LoadImage:['image'], LoadMediaPipeFaceLandmarker:['model_name'],
  MediaPipeFaceLandmarker:['face_detection_model','image','detector_variant','num_faces','min_confidence','missing_frame_fallback'],
  MediaPipeFaceMask:['face_landmarks','regions','regions.face_oval','regions.lips','regions.left_eye','regions.right_eye','regions.irises'],
  CheckpointLoaderSimple:['ckpt_name'], CLIPTextEncode:['text','clip'], SAM3_Detect:['model','image','conditioning','bboxes','positive_coords','negative_coords','threshold','refine_iterations','individual_masks'],
  SAM3_VideoTrack:['images','model','initial_mask','conditioning','detection_threshold','max_objects','detect_interval'], SAM3_TrackToMask:['track_data','object_indices'],
  RenderDeckTouchUp:['images','mask','mode','strength','keep_detail','smooth','max_parts','colour','grow','picture','fit_mask','clip_mask']};
function checkGraph(g, name){
  let good = true;
  for(const [id, n] of Object.entries(g)){
    const al = ALLOWED[n.class_type]; if(!al){ console.log('  unknown node', n.class_type); good = false; continue; }
    for(const [k, v] of Object.entries(n.inputs)){ if(!al.includes(k)){ console.log('  ' + n.class_type + ' has no input ' + k); good = false; }
      if(Array.isArray(v) && v.length===2 && typeof v[0]==='string' && !g[v[0]]){ console.log('  ' + n.class_type + '.' + k + ' links to a missing node ' + v[0]); good = false; } }
    const req = Object.keys((SCHEMA[n.class_type].input || {}).required || {}); for(const k of req) if(!(k in n.inputs)){ console.log('  ' + n.class_type + ' lacks ' + k); good = false; }
  }
  ok(good, name + ': every node and input exists in ComfyUI 0.41.3');
  return Object.values(g);
}
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8012);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], uploads = [], HIST = {};
  await page.route(PC + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/upload/image'){ const b = rt.request().postDataBuffer(); uploads.push(b ? b.length : 0); const nm = /filename="([^"]+)"/.exec(b.toString('latin1'))[1]; return J({name:nm, subfolder:'h3touch', type:'input'}); }
    if(p==='/prompt'){ sent.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'p' + sent.length}); }
    if(p.startsWith('/history/')){ const id = p.slice(9); return J(HIST[id] ? {[id]:HIST[id]} : {}); }
    if(p==='/view') return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(path.join(MEDIA, 'spiral.png'))});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(pc => { localStorage.clear(); window.TU_PCS = [{name:'Render', url:pc}]; }, PC);
  await page.goto('http://127.0.0.1:8012/touchup/index.html');
  await page.waitForFunction(() => /ready/.test(document.querySelector('#pcNote').textContent), null, {timeout:15000});
  ok(true, 'Render is found ready');
  // no video yet
  await page.click('#tryb'); ok(/Pick a video/.test(await page.textContent('#msg')), 'asks for a video first');
  const pick = async (sel, input, file) => { await page.setInputFiles(input, path.join(MEDIA, file)); await page.waitForTimeout(700); };
  await pick('#vslot', '#vfile', 'clip.webm');
  await page.waitForFunction(() => window.TU.META.vw===1920, null, {timeout:10000});
  ok(true, 'the video is read (1920x1080)');
  await page.click('#tryb'); ok(/picture/.test(await page.textContent('#msg')), 'eyes need a picture');
  await pick('#pslot', '#pfile', 'spiral.png');
  // 1) eyes, face mesh, one frame
  await page.click('#tryb'); await page.waitForFunction(n => window.TU.S.jobs.length===n, 1, {timeout:10000});
  let g = checkGraph(sent[0], 'eyes · face mesh · one frame');
  const tu = g.find(n => n.class_type==='RenderDeckTouchUp'), masks = g.filter(n => n.class_type==='MediaPipeFaceMask');
  ok(tu.inputs.mode==='picture' && tu.inputs.fit_mask && tu.inputs.clip_mask && tu.inputs.picture && tu.inputs.smooth===1, 'iris circles size it, eye openings cut it, the picture goes in');
  ok(masks.some(m => m.inputs['regions.irises'] && !m.inputs['regions.left_eye']) && masks.some(m => m.inputs['regions.left_eye'] && m.inputs['regions.right_eye'] && !m.inputs['regions.irises']), 'face mesh: one irises mask, one eye-openings mask');
  ok(g.some(n => n.class_type==='ImageScaleToMaxDimension' && n.inputs.largest_size===1280), '1080p is brought down to 1280 px');
  ok(g.some(n => n.class_type==='SaveImage') && g.find(n => n.class_type==='Video Slice').inputs.duration < 0.5, 'one frame: a tiny slice, saved as a picture');
  ok(uploads.length===2, 'video and picture sent once each (' + uploads.length + ')');
  // it finishes
  await page.evaluate(() => {}); Object.assign(HIST, {p1:{status:{completed:true, status_str:'success'}, outputs:{[Object.keys(sent[0]).find(k => sent[0][k].class_type==='SaveImage')]:{images:[{filename:'try_00001_.png', subfolder:'Output_Render/H3Deck/touchup', type:'output'}]}}}});
  await page.evaluate(() => window.TU && null); await page.waitForFunction(() => window.TU.S.jobs[0].state==='done', null, {timeout:10000});
  ok(await page.$('.job img'), 'the finished frame shows');
  // 2) the whole clip
  await page.click('#gob'); await page.waitForFunction(n => window.TU.S.jobs.length===n, 2, {timeout:10000});
  g = checkGraph(sent[1], 'eyes · face mesh · clip');
  const cv = g.find(n => n.class_type==='CreateVideo'), sv = g.find(n => n.class_type==='SaveVideo');
  ok(cv && Array.isArray(cv.inputs.fps) && Array.isArray(cv.inputs.audio) && sv.inputs.format==='mp4', 'the clip keeps its frame rate and sound, saved as mp4');
  ok(uploads.length===2, 'nothing sent again for the second job');
  // 3) lips by colour
  await page.click('#part button[data-v=lips]'); ok(await page.evaluate(() => window.TU.S.put)==='colour', 'lips switch to colour');
  await page.click('#gob'); await page.waitForFunction(n => window.TU.S.jobs.length===n, 3, {timeout:10000});
  g = checkGraph(sent[2], 'lips · face mesh');
  ok(g.find(n => n.class_type==='RenderDeckTouchUp').inputs.mode==='colour' && !g.some(n => n.class_type==='LoadImage') && g.some(n => n.class_type==='MediaPipeFaceMask' && n.inputs['regions.lips']), 'lipstick: lips mask, colour, no picture');
  // 4) eyes by SAM 3
  await page.click('#part button[data-v=eyes]'); await page.click('#finder button[data-v=sam]');
  await page.click('#gob'); await page.waitForFunction(n => window.TU.S.jobs.length===n, 4, {timeout:10000});
  g = checkGraph(sent[3], 'eyes · SAM 3');
  const te = g.find(n => n.class_type==='CLIPTextEncode'), vt = g.find(n => n.class_type==='SAM3_VideoTrack');
  ok(te.inputs.text==='iris:2' && vt.inputs.max_objects===2 && g.find(n => n.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='sam3.1_multiplex_fp16.safetensors', 'SAM 3 tracks "iris:2" with the sam3 checkpoint');
  // 5) something else, named
  await page.click('#part button[data-v=pick]'); await page.click('#put button[data-v=colour]');
  await page.click('#gob'); ok(/Name the part/.test(await page.textContent('#msg')), 'asks for a word');
  await page.fill('#word', 'hair'); await page.fill('#count', '1');
  await page.click('#gob'); await page.waitForFunction(n => window.TU.S.jobs.length===n, 5, {timeout:10000});
  g = checkGraph(sent[4], 'hair · named');
  ok(g.find(n => n.class_type==='CLIPTextEncode').inputs.text==='hair:1', 'the word goes to SAM 3');
  // 6) tapped
  await page.click('#how button[data-v=tap]');
  await page.click('#gob'); ok(/Tap the part/.test(await page.textContent('#msg')), 'asks for a tap');
  await page.waitForTimeout(400); await page.$eval('#tapc', c => c.scrollIntoView({block:'center'})); await page.waitForTimeout(200); const box = await (await page.$('#tapc')).boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.25);
  await page.click('#gob'); await page.waitForFunction(n => window.TU.S.jobs.length===n, 6, {timeout:10000});
  g = checkGraph(sent[5], 'tapped part');
  const det = g.find(n => n.class_type==='SAM3_Detect'), pts = JSON.parse(det.inputs.positive_coords);
  ok(pts.length===1 && Math.abs(pts[0].x - 640) <= 3 && Math.abs(pts[0].y - 180) <= 4, 'the tap lands at the right pixel of the 1280-wide frame (' + JSON.stringify(pts) + ')');
  ok(g.find(n => n.class_type==='SAM3_VideoTrack').inputs.initial_mask, 'SAM 3 follows the tapped part from the first frame');
  // a failure shows its reason
  HIST.p6 = {status:{status_str:'error', completed:false, messages:[['execution_error', {node_type:'SAM3_VideoTrack', exception_message:'out of memory'}]]}, outputs:{}};
  await page.waitForFunction(() => window.TU.S.jobs[0].state==='failed', null, {timeout:20000});
  await page.waitForTimeout(500);
  ok(/out of memory/.test(await page.textContent('#jobs')), 'a failed job says why');
  await page.screenshot({path:path.join(MEDIA, 'touchup.png'), fullPage:true});
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
