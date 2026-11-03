// 🦴 Motion guide: the app against a fake ComfyUI (requests answered in the browser, nothing renders).
// Mocap leaves a skeleton/depth clip in a PC's ComfyUI input plus a note in /userdata/h3deck_inbox.json; H3 Deck picks it up,
// keeps it on the phone, puts it in Motion guide, and every piece's graph runs ModelPatchLoader → MiniMaxH3FunControlNetApply on the
// model, fed by that piece's stretch of the clip (LoadVideo → Video Slice → GetVideoComponents).
// Input names are the ones in ComfyUI 0.41.3: comfy_extras/nodes_minimax_h3.py, nodes_model_patch.py, nodes_video.py.
// Run: NODE_PATH=$(npm root -g) CLIP=<any short .webm> node tests/t_motion.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const CLIP = process.env.CLIP, PC = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const PATCH = 'minimax_h3_fun_controlnet_union_int8_convrot.safetensors';
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ModelPatchLoader:{input:{required:{name:[['z_image_fun_controlnet.safetensors', PATCH]]}}},
  MiniMaxH3FunControlNetApply:{input:{required:{model:['MODEL'], model_patch:['MODEL_PATCH'], vae:['VAE'], strength:['FLOAT', {default:1}], start_percent:['FLOAT', {default:0}], end_percent:['FLOAT', {default:1}]}, optional:{control_video:['IMAGE'], mask:['MASK'], source_video:['IMAGE']}}},
  'Video Slice':{input:{required:{video:['VIDEO'], start_time:['FLOAT', {default:0}], duration:['FLOAT', {default:0}], strict_duration:['BOOLEAN', {default:false}]}}},
  GetVideoComponents:{input:{required:{video:['VIDEO']}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3AddGuide','MiniMaxH3MotionContext','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MMH3FitReferences',
  'LoadImage','LoadVideo','LoadAudio','TrimAudioDuration','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','ImageFromBatch'];

(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8012);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], uploads = [], views = []; let schema = SCHEMA;
  let inbox = {v:1, items:[{id:'mc1', t:Date.now(), slot:'ctl', file:'mocap/fight_skeleton_everyone.webm', name:'Fight · skeleton everyone', w:832, h:480, fps:24, dur:12.2, frames:294, mode:'pose', thumb:'', people:2}]};
  await page.route(PC + '/**', async (rt) => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[{vram_free:7e9, vram_total:8.5e9}]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(schema[c] ? {[c]:schema[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/userdata/h3deck_inbox.json') return J(inbox);
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    if(p==='/upload/image'){ uploads.push(1); return J({name:'h3deck_x.png', subfolder:'h3deck', type:'input'}); }
    if(p==='/prompt'){ sent.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'p' + sent.length}); }
    if(p.startsWith('/history')) return J({});
    if(p==='/view'){ views.push([u.searchParams.get('subfolder'), u.searchParams.get('filename'), u.searchParams.get('type')]); return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)}); }
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(pc => { if(!sessionStorage.getItem('kept')){ localStorage.clear(); sessionStorage.setItem('kept', '1'); } window.H3_PCS = [{name:'Render', url:pc, on:true, speed:1}]; }, PC);
  await page.goto('http://127.0.0.1:8012/index.html');
  await page.waitForFunction(() => /DaSiWa/.test(document.querySelector('#model').textContent), null, {timeout:20000});
  await page.waitForFunction(() => H3.S.f.ctlVid, null, {timeout:10000}).catch(() => {});

  // ---- the hand-off from Mocap ----
  const st = await page.evaluate(() => { const f = H3.S.f, m = H3.S.media[f.ctlVid] || {}; return {ctl:f.ctl, aspect:f.aspect, seconds:f.seconds, m, up:H3.S.up[f.ctlVid + '|http://render.test'], inbox:H3.S.inbox}; });
  ok(st.ctl && st.m.kind==='vid' && st.m.mode==='pose' && st.m.people===2, 'the Mocap clip lands in Motion guide: ' + JSON.stringify({ctl:st.ctl, kind:st.m.kind, mode:st.m.mode}));
  ok(views.length===1 && views[0][0]==='mocap' && views[0][1]==='fight_skeleton_everyone.webm' && views[0][2]==='input', 'fetched once from the PC\'s input folder: ' + JSON.stringify(views));
  ok(st.up==='mocap/fight_skeleton_everyone.webm', 'that PC already has it, so it is not uploaded again');
  ok(st.aspect==='16:9' && st.seconds===12.2, 'take shape and length follow the clip: ' + st.aspect + ', ' + st.seconds + ' s');
  ok(!(await page.isHidden('#ctlBody')) && /skeleton/.test(await page.textContent('#ctlSlots')) && /2 people/.test(await page.textContent('#ctlNote')), 'Motion guide shows the clip and notes the two people');
  await page.evaluate(() => H3.pullInbox()); await page.waitForTimeout(300);
  ok(views.length===1, 'the same note is not picked up twice');

  // ---- a 5 s take: one piece ----
  await page.fill('#prompt', 'Two people fight on a bridge. The woman in red is on the left, the tall man in black on the right.');
  await page.dispatchEvent('#prompt', 'input');
  await page.fill('#lenNum', '5'); await page.dispatchEvent('#lenNum', 'input');
  await page.evaluate(() => { H3.S.f.ctlStr = 0.9; H3.S.f.ctlEnd = 0.7; H3.drawAll(); });
  ok((await page.textContent('#ctlStrOut'))==='0.90' && (await page.textContent('#ctlEndOut'))==='70%', 'sliders show 0.90 and 70%');
  await page.click('#goBtn'); await page.waitForTimeout(1500);
  ok(sent.length===1 && uploads.length===0, 'one graph, nothing uploaded (the clip is on the PC already): ' + sent.length + ' / ' + uploads.length);
  const g = sent[0], nodes = Object.values(g), by = c => nodes.filter(n => n.class_type===c);
  const cn = by('MiniMaxH3FunControlNetApply')[0];
  ok(cn && cn.inputs.strength===0.9 && cn.inputs.end_percent===0.7 && cn.inputs.start_percent===0, 'Fun ControlNet: strength 0.9, lets go at 70%');
  ok(cn && g[cn.inputs.model_patch[0]].class_type==='ModelPatchLoader' && g[cn.inputs.model_patch[0]].inputs.name===PATCH, 'loads the MiniMax H3 ControlNet patch, not another model\'s');
  ok(cn && g[cn.inputs.vae[0]].class_type==='VAELoader' && /video_vae/.test(g[cn.inputs.vae[0]].inputs.vae_name), 'with the video VAE');
  const gv = cn && g[cn.inputs.control_video[0]], sl = gv && g[gv.inputs.video[0]], lv = sl && g[sl.inputs.video[0]];
  ok(gv && gv.class_type==='GetVideoComponents' && cn.inputs.control_video[1]===0 && sl.class_type==='Video Slice' && sl.inputs.start_time===0 && lv.class_type==='LoadVideo' && lv.inputs.file==='mocap/fight_skeleton_everyone.webm', 'control video = the clip from 0 s');
  const gd = by('BasicGuider')[0], mid = gd.inputs.model[0];
  ok(g[mid].class_type==='MiniMaxH3FunControlNetApply', 'the sampler uses the guided model');
  const un = g[cn.inputs.model[0]]; ok(un.class_type==='UNETLoader' || un.class_type==='LoraLoaderModelOnly', 'the guide goes on after the model and its LoRAs');
  const t0 = await page.evaluate(() => H3.S.takes[0].ctl); ok(t0 && t0.str===0.9 && t0.end===0.7, 'the take keeps its guide settings');

  // ---- a 12 s take: three pieces, each gets its own stretch of the clip ----
  await page.fill('#lenNum', '12'); await page.dispatchEvent('#lenNum', 'input'); await page.waitForTimeout(200);
  const n0 = sent.length; await page.click('#goBtn'); await page.waitForTimeout(2000);
  const pcs = await page.evaluate(() => H3.S.takes[0].pieces.map(p => ({start:p.start, gen:p.gen, ctx:p.ctx})));
  ok(pcs.length >= 2 && sent.length===n0 + pcs.length, 'split take: ' + pcs.length + ' pieces sent');
  pcs.forEach((p, i) => { const gi = sent[n0 + i], s = Object.values(gi).find(n => n.class_type==='Video Slice'), want = Math.max(0, p.start - (p.ctx ? p.ctx + 1 : 0) / 24);
    ok(s && Math.abs(s.inputs.start_time - want) < 1e-6 && Math.abs(s.inputs.duration - (p.gen / 24 + 0.1)) < 0.002, 'piece ' + (i + 1) + ' reads the clip from ' + want.toFixed(3) + ' s for ' + p.gen + ' frames'); });

  // ---- a PC without the ControlNet file says so ----
  schema = Object.assign({}, SCHEMA, {ModelPatchLoader:{input:{required:{name:[['z_image_fun_controlnet.safetensors']]}}}});
  const oiWhy = await page.evaluate(() => { const oi = {ModelPatchLoader:{input:{required:{name:[['z_image_fun_controlnet.safetensors']]}}}}; return H3.patchOf(oi); });
  ok(oiWhy==='', 'a Z-Image ControlNet is not taken for the MiniMax one');

  // ---- switching it off sends no guide ----
  await page.fill('#lenNum', '5'); await page.dispatchEvent('#lenNum', 'input'); await page.click('#ctlSw');
  const n1 = sent.length; await page.click('#goBtn'); await page.waitForTimeout(1500);
  ok(sent.length===n1 + 1 && !Object.values(sent[n1]).some(n => n.class_type==='MiniMaxH3FunControlNetApply'), 'Motion guide off = plain graph');

  // ---- reopening keeps the clip on the phone ----
  await page.reload(); await page.waitForFunction(() => /DaSiWa/.test(document.querySelector('#model').textContent), null, {timeout:20000}); await page.waitForTimeout(500);
  const kept = await page.evaluate(async () => { const id = H3.S.f.ctlVid, req = indexedDB.open('h3deck', 1); const db = await new Promise(r => { req.onsuccess = () => r(req.result); }); return new Promise(r => { const q = db.transaction('media').objectStore('media').get(id); q.onsuccess = () => r(q.result ? q.result.size : 0); }); });
  ok(kept > 0 && views.length===1, 'after reopening the clip is still on the phone and the note is not fetched again');

  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
