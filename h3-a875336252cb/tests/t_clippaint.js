// 👥 Find and paint the people in a 📚 action clip: SAM 3 tracks each person through the clip, each one painted a flat colour over the
// original; the painted copy becomes the action's clip with its 🎨 colours ticked, the original kept (switch back). Fake ComfyUI in the browser.
// Run: NODE_PATH=$(npm root -g) node tests/t_clippaint.js   (needs ffmpeg for a tiny test clip)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), { execSync } = require('child_process');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const clip = path.join(os.tmpdir(), 'h3_clippaint.mp4'); execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc=size=320x240:rate=24 -t 1 -c:v libx264 -pix_fmt yuv420p "${clip}"`); const MP4 = fs.readFileSync(clip);
const SCHEMA = { // the real inputs (ComfyUI comfy_extras/nodes_sam3.py, nodes_mask.py, nodes_video.py, nodes.py)
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sam3.1_multiplex_fp16.safetensors']]}}}, CLIPTextEncode:{input:{required:{text:['STRING'], clip:['CLIP']}}},
  SAM3_Detect:{input:{required:{model:['MODEL'], image:['IMAGE'], threshold:['FLOAT'], refine_iterations:['INT'], individual_masks:['BOOLEAN']}, optional:{conditioning:['CONDITIONING']}}}, MaskToImage:{input:{required:{mask:['MASK']}}}, PreviewImage:{input:{required:{images:['IMAGE']}}},
  SAM3_VideoTrack:{input:{required:{images:['IMAGE'], model:['MODEL'], detection_threshold:['FLOAT', {default:0.5}], max_objects:['INT', {default:4}], detect_interval:['INT', {default:1}]}, optional:{initial_mask:['MASK'], conditioning:['CONDITIONING']}}},
  SAM3_TrackToMask:{input:{required:{track_data:['SAM3_TRACK_DATA'], object_indices:['STRING', {default:''}]}}},
  GrowMask:{input:{required:{mask:['MASK'], expand:['INT', {default:0, min:-16384, max:16384}], tapered_corners:['BOOLEAN', {default:true}]}}},
  ImageCompositeMasked:{input:{required:{destination:['IMAGE'], source:['IMAGE'], x:['INT'], y:['INT'], resize_source:['BOOLEAN']}, optional:{mask:['MASK']}}},
  EmptyImage:{input:{required:{width:['INT'], height:['INT'], batch_size:['INT'], color:['INT']}}},
  LoadVideo:{input:{required:{file:[['x.mp4']]}}}, GetVideoComponents:{input:{required:{video:['VIDEO']}}}, LoadImage:{input:{required:{image:[['x.png']]}}},
  CreateVideo:{input:{required:{images:['IMAGE'], fps:['FLOAT']}, optional:{audio:['AUDIO']}}},
  SaveVideo:{input:{required:{video:['VIDEO'], filename_prefix:['STRING'], format:['COMFY_DYNAMICCOMBO_V3', {}]}}},
};
const EXTRA = {SaveVideo:['format.codec', 'format.codec.encoding', 'format.codec.encoding.crf']};
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8051);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let SENT = null, UP = 0;
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(!c ? SCHEMA : SCHEMA[c] ? {[c]:SCHEMA[c]} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/upload/image'){ UP++; return J({name:'h3deck_dance.mp4', subfolder:'h3deck', type:'input'}); }
    if(p==='/prompt'){ SENT = JSON.parse(rt.request().postData()).prompt; return J({prompt_id:'pid1'}); }
    if(p==='/history/pid1'){ const sv = Object.keys(SENT).find(k => SENT[k].class_type==='SaveVideo'); return J({pid1:{status:{status_str:'success', completed:true, messages:[]}, outputs:{[sv]:{images:[{filename:'painted.mp4', subfolder:'H3Deck/actpaint', type:'output'}], animated:[true]}}}}); }
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/mp4', headers:{'Access-Control-Allow-Origin':'*'}, body:MP4});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8051/index.html');
  await page.waitForFunction(() => H3.PC['http://render.test'] && H3.PC['http://render.test'].oi && H3.PC['http://render.test'].online, null, {timeout:20000});
  await page.evaluate(async b64 => { const b = await (await fetch('data:video/mp4;base64,' + b64)).blob(); const id = await H3.addMedia(new File([b], 'dance.mp4', {type:'video/mp4'}), 'vid');
    const A = H3.libNew('act'); Object.assign(A, {name:'Dance', what:'Dancing together', vid:id}); window.ACT = A; window.ORIG = id; H3.setTab('lib'); H3.openLib(A.id); }, MP4.toString('base64'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('[data-lb="paint"]') && document.querySelectorAll('[data-lb^="pn:"]').length===4), 'the action sheet has 👥 Find and paint the people and how many');
  await page.click('[data-lb="pn:3"]'); await page.waitForTimeout(150); ok(await page.evaluate(() => ACT.pplN)===3, 'three people picked');
  await page.click('[data-lb="paint"]');
  await page.waitForFunction(() => ACT.vidPaint || /Couldn't|No PC/.test((document.querySelector('#paintNote') || {}).textContent || ''), null, {timeout:30000});
  const note = await page.evaluate(() => (document.querySelector('#paintNote') || {}).textContent); console.log(note);
  const N = Object.values(SENT || {}), C = t => N.filter(n => n.class_type===t);
  const bad = N.flatMap(n => Object.keys(n.inputs).filter(k => { const s = SCHEMA[n.class_type]; return !s || !((s.input.required || {})[k] || (s.input.optional || {})[k] || (EXTRA[n.class_type] || []).includes(k)); }).map(k => n.class_type + '.' + k));
  ok(N.length && !bad.length, 'every node and input is real: ' + JSON.stringify(bad));
  const trk = C('SAM3_VideoTrack')[0], txt = SENT[trk.inputs.conditioning[0]].inputs.text;
  ok(txt==='person:3' && trk.inputs.max_objects===3 && C('SAM3_TrackToMask').map(n => n.inputs.object_indices).join()==='0,1,2', 'SAM 3 follows up to 3 people, one mask each: ' + txt);
  ok(C('GrowMask').map(n => n.inputs.expand).join()==='2,-2,2,-2,2,-2', 'each mask is closed (grow, then shrink back): ' + C('GrowMask').map(n => n.inputs.expand));
  const E = C('EmptyImage'); ok(E.map(n => n.inputs.color).join()===[0xff2a2a, 0x2f6bff, 0x1fcf4f].join() && E.every(n => n.inputs.width===320 && n.inputs.height===240), 'flat red, blue, green at the clip size: ' + JSON.stringify(E.map(n => [n.inputs.width, n.inputs.height, n.inputs.color])));
  const ic = C('ImageCompositeMasked'); ok(ic.length===3 && SENT[ic[0].inputs.destination[0]].class_type==='GetVideoComponents' && SENT[ic[1].inputs.destination[0]]===ic[0], 'painted one after another over the original frames');
  ok(C('SaveVideo')[0].inputs.filename_prefix.startsWith('H3Deck/actpaint/') && UP===1, 'saved to H3Deck/actpaint');
  let A = await page.evaluate(() => ({vid:ACT.vid, orig:ACT.vidOrig, paint:ACT.vidPaint, cols:ACT.cols, isOrig:ACT.vidOrig===ORIG, from:H3.S.media[ACT.vidPaint].from}));
  ok(A.paint && A.vid===A.paint && A.isOrig && A.from==='actpaint' && JSON.stringify(A.cols)==='["red","blue","green"]', 'the painted copy is the clip, the original kept, red/blue/green ticked: ' + JSON.stringify(A));
  // switch back to the original: no colours then
  await page.waitForSelector('[data-lb="porig"]'); await page.click('[data-lb="porig"]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => ACT.vid===ORIG && !H3.actBook().length || ACT.vid===ORIG), 'the original can go instead');
  ok(await page.evaluate(() => /off \(the original goes\)/.test(document.querySelector('[data-lb="porig"]').textContent)), 'the switch says the original goes');
  await page.click('[data-lb="porig"]'); await page.waitForTimeout(150); ok(await page.evaluate(() => ACT.vid===ACT.vidPaint), 'and back to the painted copy');
  // painting again starts from the original, not from the painted copy
  SENT = null; await page.click('[data-lb="paint"]'); await page.waitForFunction(() => !!document.querySelector('[data-lb="paint"]') && !document.querySelector('[data-lb="paint"]').disabled, null, {timeout:30000});
  ok(SENT && await page.evaluate(() => ACT.vidOrig===ORIG && ACT.vid===ACT.vidPaint && ACT.vidPaint!==ORIG), 'painting again starts from the original and keeps it');
  // a new clip clears the painted copy
  await page.evaluate(() => { ACT.vid = ORIG; delete ACT.vidPaint; delete ACT.vidOrig; });
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
