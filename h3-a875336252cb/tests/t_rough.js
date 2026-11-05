// 🎭 a rough video as the Motion guide: the phone sends it to a PC with DWPose, which writes a skeleton clip and a depth clip of every frame;
// both land in the 🦴 Motion guide, the depth light. Fake ComfyUI in the browser, nothing renders.
// Run: NODE_PATH=$(npm root -g) CLIP=<any short .webm> node tests/t_rough.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const CLIP = process.env.CLIP, PC = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors']], weight_dtype:[['default']]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors']]}}},
  DWPreprocessor:{input:{required:{image:['IMAGE']}, optional:{detect_hand:[['enable', 'disable']], detect_body:[['enable', 'disable']], detect_face:[['enable', 'disable']], resolution:['INT', {default:512}], bbox_detector:[['yolox_l.onnx']], pose_estimator:[['dw-ll_ucoco_384_bs5.torchscript.pt']]}}},
  DepthAnythingV2Preprocessor:{input:{required:{image:['IMAGE']}, optional:{ckpt_name:[['depth_anything_v2_vitl.pth']], resolution:['INT', {default:512}]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3AddGuide','LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','CreateVideo','SaveVideo','GetVideoComponents','ImageFromBatch','MiniMaxH3FunControlNetApply','ModelPatchLoader','Video Slice'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8013);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], uploads = [], views = [];
  await page.route(PC + '/**', async (rt) => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[{vram_free:7e9, vram_total:8.5e9}]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    if(p==='/upload/image'){ uploads.push(1); return J({name:'h3deck_rough.webm', subfolder:'h3deck', type:'input'}); }
    if(p==='/prompt'){ sent.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'g' + sent.length}); }
    if(p.startsWith('/history/')){ const g = sent[sent.length - 1], saves = Object.keys(g).filter(k => g[k].class_type==='SaveVideo');
      return J({['g' + sent.length]:{status:{completed:true, status_str:'success'}, outputs:Object.fromEntries(saves.map(k => [k, {images:[{filename:g[k].inputs.filename_prefix.split('/').pop() + '_00001_.mp4', subfolder:'Output_Render/H3Deck/guides', type:'output'}], animated:[true]}]))}}); }
    if(p==='/view'){ views.push(u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)}); }
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(pc => { localStorage.clear(); window.H3_PCS = [{name:'Render', url:pc, on:true, speed:1}]; }, PC);
  await page.goto('http://127.0.0.1:8013/index.html');
  await page.waitForFunction(() => /DaSiWa/.test(document.querySelector('#model').textContent), null, {timeout:20000});
  ok(/From a rough video/.test(await page.textContent('#roughBtn')), '🎭 From a rough video in the Motion guide');
  const b64 = fs.readFileSync(CLIP).toString('base64');
  await page.evaluate(async b => { const raw = Uint8Array.from(atob(b), c => c.charCodeAt(0)); await H3.guideFrom(new File([raw], 'rough.webm', {type:'video/webm'}), 'rough.webm'); }, b64);
  const g = sent[0] || {}, n = Object.values(g), dw = n.find(x => x.class_type==='DWPreprocessor'), da = n.find(x => x.class_type==='DepthAnythingV2Preprocessor');
  ok(sent.length===1 && uploads.length===1 && dw && da && n.filter(x => x.class_type==='SaveVideo').length===2 && dw.inputs.detect_hand==='enable' && dw.inputs.bbox_detector==='yolox_l.onnx' && da.inputs.ckpt_name==='depth_anything_v2_vitl.pth'
    && n.find(x => x.class_type==='LoadVideo').inputs.file==='h3deck/h3deck_rough.webm' && JSON.stringify(n.find(x => x.class_type==='CreateVideo').inputs.fps)===JSON.stringify([Object.keys(g).find(k => g[k].class_type==='GetVideoComponents'), 2]),
    'one job on Render: the video uploaded, DWPose + Depth Anything on every frame, two clips saved at the video\'s own fps: ' + JSON.stringify(n.map(x => x.class_type)));
  const st = await page.evaluate(() => { const f = H3.S.f; return {ctl:f.ctl, a:(H3.S.media[f.ctlVid] || {}).mode, b:(H3.S.media[f.ctl2Vid] || {}).mode, s1:f.ctlStr, s2:f.ctl2Str, e2:f.ctl2End, fol:f.follow}; });
  ok(st.ctl && st.a==='pose' && st.b==='depth' && st.s2 < 0.5 && st.e2 < 0.6 && st.s1 > 0.8 && views.length===2, 'skeleton is the Motion guide, depth the light second guide that lets go early: ' + JSON.stringify(st));
  ok(!(await page.isHidden('#ctlBody')) && /Guide ready/.test(await page.textContent('#roughNote')), 'the Motion guide shows them, with a note');
  // the rough take's words come along, each at its time
  const w = await page.evaluate(() => [H3.guideWords({prompt:'She walks in.\n\n＋ She sits.', pieces:[{start:0, deliv:120, prompt:'She walks in.'}, {start:5, deliv:120, prompt:'This continues straight on from the moment before, in the same shot with the same camera and no cut. She sits down. The action carries on from where it is now and does not start again.'}]}),
    H3.guideWords({prompt:'[0s-3s] She waves. [3s-9s] She runs.', pieces:[]}), H3.guideWords({prompt:'She dances.', pieces:[{start:0, deliv:120, prompt:'She dances.'}]})]);
  ok(w[0]==='[0s - 5s] She walks in.\n[5s - 10s] She sits down.' && w[1]==='[0s-3s] She waves. [3s-9s] She runs.' && w[2]==='She dances.', "a take's words as timed beats, so each new piece gets its own stretch's words: " + JSON.stringify(w));
  ok(await page.evaluate(() => { const p = H3.plan(13, 5, H3.parseBeats ? [] : []), txt = '[0s - 4s] A.\n[4s - 8s] B.\n[8s - 13s] C.'; return p.length===3 && /A\./.test(H3.piecePrompt(txt, p, 0)) && /B\./.test(H3.piecePrompt(txt, p, 1)) && /C\./.test(H3.piecePrompt(txt, p, 2)); }), '13 s guide → 3 pieces, each with the words for its stretch');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
