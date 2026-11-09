// 🧾 Write it the H3 way: the prompt builder and the graphs, against a fake ComfyUI answered in the browser (nothing renders).
// The format is MiniMax's own (MiniMaxAI/MiniMax-H3 docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md and _base_en.md).
// Run: NODE_PATH=$(npm root -g) node tests/t_h3way.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','NAGGuiderMiniMaxH3','CLIPTextEncode','SplitSigmas','DisableNoise','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8014);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8014/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k)), FL = fams.find(k => /fl2v/.test(k));
  ok(REF && FL, 'a reference family and the first/last frame family: ' + fams.join(', '));

  // ---- the builder on its own ----
  const P = await page.evaluate(() => H3.h3Prompt({h3:{style:'Live-action, cinematic', sound:'Rain on the window', music:''}, text:'Ellen walks to the window. She turns and smiles at the camera. The camera pushes in slowly.', words:'AFKJ Style',
    imgs:[{desc:'Ellen, a woman in her 20s with long red hair', keep:'exact'}, {desc:'Ellen, a woman in her 20s with long red hair.'}, {desc:'the cafe, warm wood and big windows', keep:'loose'}, {}], vids:[], auds:[{desc:'the voice of Ellen (S1)'}], secs:5}));
  console.log(P);
  const sec = ['subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:'], at = sec.map(x => P.indexOf(x));
  ok(at.every(i => i >= 0) && at.every((i, k) => !k || i > at[k - 1]), 'six sections in the official order');
  ok(P.startsWith('AFKJ Style.\n\nsubject_definitions:'), 'LoRA words come first, as they were trained');
  ok(/<Subject 1> is Ellen, a woman in her 20s with long red hair, as shown in <Picture 1> and <Picture 2>\./.test(P), 'two pictures with the same words = one subject');
  ok(/<Subject 2> is the cafe.*<Picture 3>/.test(P) && /<Subject 3> is the subject shown in <Picture 4>\./.test(P), 'other pictures get their own subjects, a bare one a plain line');
  ok(/<Subject 1> \(appears in \[Shot 1\]\): fully_preserved/.test(P) && /<Subject 2> \(appears in \[Shot 1\]\): weak_reference/.test(P), 'keep levels map to the official markers');
  ok(/<Audio 1> is the voice of Ellen \(S1\)\./.test(P) && /<Audio 1>: reference - /.test(P), 'a sound is a voice reference by default');
  ok(/summary:\n\[reference generation \+ audio reference\] It features <Subject 1>, <Subject 2> and <Subject 3>\. Ellen walks to the window\. She turns/.test(P), 'summary: task tags, subjects, the gist');
  ok(/detailed_description:\nThe target video is in a live-action, cinematic style\.\n\[Shot 1\] \[0s-5s\] Ellen walks/.test(P), 'style sentence before [Shot 1], untimed words timed from 0 s');
  ok(/overall_soundscape:\nRain on the window\./.test(P) && /non_diegetic_music:\nN\/A$/.test(P), 'sound line, and N/A with no music');

  const Z = await page.evaluate(() => [H3.h3Prompt({h3:{}, text:'[2s-4s] a fox runs', secs:5}), H3.h3Prompt({h3:{}, text:'a fox keeps running', cont:true, secs:5}), H3.h3Prompt({h3:{}, text:'[0s-] a fox sits. [3s] it runs', secs:5})]);
  ok(!/\[0s-5s\]/.test(Z[0]) && /\[2s-4s\] a fox runs/i.test(Z[0]) && !/\[0s-/.test(Z[1]) && !/\[0s-5s\]/.test(Z[2]), '[0s-] is only added when no times are typed, and never to a piece that carries on: ' + JSON.stringify(Z.map(z => (z.match(/\[Shot 1\][^\n]*/) || [''])[0])));
  const B = await page.evaluate(() => [H3.h3Prompt({h3:{}, text:'a fox runs through snow', fl2v:true, first:true, last:true, secs:5.1667}), H3.h3Prompt({h3:{}, text:'a fox runs', fl2v:true, first:true}), H3.h3Prompt({h3:{}, text:'a fox', fl2v:false})]);
  console.log(B[0]);
  ok(B[0].startsWith('How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 5.17-second mark of the target video.\n\nintegrated_multimodal_description: [Shot 1] Live-action, cinematic. [0s-5.2s] A fox runs'), 'FL2VA: the official alignment line, then the description');
  ok(B[1].startsWith('For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.'), 'first frame only: the I2VA line');
  ok(B[2].startsWith('integrated_multimodal_description: [Shot 1]') && /overall_soundscape: Natural ambient/.test(B[2]), 'no references at all: the T2VA format, with a natural default sound');

  // ---- the form and the graphs ----
  const G = await page.evaluate(([R, REF]) => { const f = H3.S.f; ['a', 'b', 'ff'].forEach(id => H3.S.media[id] = {id, kind:'img', name:id + '.png', w:640, h:352, thumb:''});
    Object.assign(f, {model:REF, turbo:false, ref:true, imgs:[{id:'a', on:true, desc:'Ellen, red hair'}, {id:'b', on:true, desc:'Ellen, red hair'}], fl:true, first:'ff', last:false, seconds:9, maxPiece:5, prompt:'Ellen walks to the window and looks out at the rain.', h3Style:'2D anime'});
    H3.drawAll(); const t = H3.snapshot(); t.id = 't1'; t.pc = R; t.seed = 3; t.dir = 'H3Deck/h3_t1'; t.name = 'h3_t1';
    const oi = H3.PC[R].oi, names = {a:'a.png', b:'b.png', ff:'ff.png'}, g = i => H3.pieceGraph(t, i, oi, names).g;
    return {n:t.pieces.length, h3:t.h3, p0:Object.values(g(0)).find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, p1:Object.values(g(1)).find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt,
      peek:document.querySelector('#h3Pre').textContent, shown:!document.querySelector('#h3Body').hidden, rows:document.querySelectorAll('#h3Refs [data-h3d]').length, note:document.querySelector('#h3Note').textContent}; }, [R, REF]);
  console.log(G.p1);
  ok(G.shown && G.rows===2, 'on by default, one row per reference picture');
  ok(G.n===2 && G.h3 && G.h3.style==='2D anime', 'a 9 s clip in two pieces keeps the H3 settings');
  ok(/<Subject 1> is Ellen, red hair, as shown in <Picture 1> and <Picture 2>\./.test(G.p0) && /<Picture 3> is the first frame of \[Shot 1\]\./.test(G.p0) && /\[keyframe completion \+ reference generation\]/.test(G.p0) && /\[Shot 1\] The shot begins from <Picture 3>\./.test(G.p0), 'piece 1: the first frame is <Picture 3> with keyframe completion');
  ok(/^subject_definitions:/.test(G.p1) && /\[video continuation \+ reference generation\] The target video carries straight on/.test(G.p1) && !/first frame/.test(G.p1), 'piece 2: video continuation, no first frame');
  ok(/The target video is in a 2D anime style\./.test(G.p0), 'the style box is used');
  ok(G.peek===G.p0, 'the 👁 look matches what piece 1 sends');
  ok(/words in the shot/.test(G.note), 'word count note: ' + G.note);

  const F = await page.evaluate(([R, FL]) => { const f = H3.S.f; Object.assign(f, {model:FL, ref:false, fl:true, first:'ff', last:true, lastImg:'b', seconds:5}); H3.drawAll();
    const t = H3.snapshot(); t.id = 't2'; t.pc = R; t.seed = 3; t.dir = 'H3Deck/h3_t2'; t.name = 'h3_t2'; const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {b:'b.png', ff:'ff.png'}).g;
    return Object.values(g).find(n => n.class_type==='MiniMaxH3ImageToVideo').inputs.prompt; }, [R, FL]);
  ok(/^How the reference pictures align/.test(F) && /5\.17-second/.test(F), 'FL2V model graph gets the alignment line for 124 frames');

  const O = await page.evaluate(([R, REF]) => { const f = H3.S.f; Object.assign(f, {model:REF, ref:false, fl:false, h3:false, seconds:5, prompt:'plain prompt'}); H3.drawAll();
    const t = H3.snapshot(); t.id = 't3'; t.pc = R; t.seed = 3; t.dir = 'H3Deck/h3_t3'; t.name = 'h3_t3';
    return {h3:t.h3, p:Object.values(H3.pieceGraph(t, 0, H3.PC[R].oi, {}).g).find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, hid:document.querySelector('#h3Body').hidden}; }, [R, REF]);
  ok(O.h3===null && O.p==='plain prompt' && O.hid, 'switched off (and old takes): the prompt goes as typed');

  await page.evaluate(() => { H3.S.f.h3 = true; H3.S.f.ref = true; H3.S.f.fl = false; H3.drawAll(); });
  await page.fill('[data-h3d="img:0"]', 'Mara, short black hair'); await page.click('[data-h3k="img:0:mostly"]');
  const U = await page.evaluate(() => ({d:H3.S.f.imgs[0].desc, k:H3.S.f.imgs[0].keep, pre:document.querySelector('#h3Pre').textContent}));
  ok(U.d==='Mara, short black hair' && U.k==='mostly' && /<Subject 1> is Mara, short black hair, as shown in <Picture 1>\./.test(U.pre) && /partially_preserved/.test(U.pre), 'typing and the keep buttons update the prompt');
  // ---- the save space: old previews are cleared instead of the save failing (Jordan 2026-11-04) ----
  const Q = await page.evaluate(async () => { const big = 'data:image/jpeg;base64,' + 'A'.repeat(60000); const toasts = [];
    new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(n => n.className==='toast' && toasts.push(n.textContent)))).observe(document.body, {childList:true});
    for(let i = 0; i < 250; i++) H3.S.media['old' + i] = {id:'old' + i, kind:'img', name:'x', thumb:big};
    H3.S.takes.unshift({id:'tk', t:Date.now(), pc:'x', imgs:[{id:'old1'}], vids:[], auds:[], follow:[], pieces:[], state:'done'});
    const keep = H3.S.f.imgs[0].id; H3.S.media[keep].thumb = big; H3.saveNow(); await new Promise(r => setTimeout(r, 300));
    const saved = JSON.parse(localStorage.getItem('h3deck') || '{}').media || {};
    return {toasts, n:Object.keys(H3.S.media).length, kept1:!!H3.S.media.old1, thumb1:H3.S.media.old1 && H3.S.media.old1.thumb, formThumb:!!H3.S.media[keep].thumb, savedKeep:!!saved[keep], len:(localStorage.getItem('h3deck') || '').length}; });
  console.log(JSON.stringify(Object.assign({}, Q, {thumb1:(Q.thumb1 || '').length})));
  ok(!Q.toasts.some(t => /full/.test(t)) && Q.savedKeep && Q.len > 0, 'a full save space clears old previews and saves, no "full" message');
  ok(Q.kept1 && !Q.thumb1 && !Q.n.toString().startsWith('25') && Q.formThumb, 'unused media gone, a take\'s picture kept without its preview, the form keeps its previews');
  // 🎬 shots (Jordan 2026-11-06): ＋ Shot adds [Shot N] markers; the H3 prompt puts each shot on its own line, every subject in every shot
  const SH = await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.value = 'she walks to the window'; ta.dispatchEvent(new Event('input'));
    document.querySelector('[data-shot]').click(); const v1 = ta.value; ta.value += 'close-up of her eyes'; ta.dispatchEvent(new Event('input')); document.querySelector('[data-shot]').click(); const v2 = ta.value;
    const P = H3.h3Prompt({text:'[Shot 1] she walks to the window [shot 2] close-up of her eyes', imgs:[{desc:'a woman', keep:'exact'}], secs:5});
    const B = H3.h3Prompt({text:'she walks in [Shot 2] her face', secs:5}); return {v1, v2, P, B}; });
  ok(SH.v1==='[Shot 1] she walks to the window\n[Shot 2] ' && /\n\[Shot 3\] $/.test(SH.v2), '🎬 ＋ Shot numbers the shots in the Shot box: ' + JSON.stringify([SH.v1, SH.v2]));
  // ✏ Custom canvas (Jordan 2026-11-07): her own width × height, snapped to 32, shrunk if over MiniMax's cap
  await page.evaluate(() => { H3.S.f.sm = false; H3.S.f.fl = false; H3.S.f.first = null; H3.drawAll(); document.querySelector('#bCanvas').classList.remove('shut'); });
  await page.click('[data-asp="custom"]'); await page.waitForTimeout(100);
  await page.fill('#cw', '1000'); await page.fill('#ch', '400'); await page.waitForTimeout(100);
  const CU = await page.evaluate(() => ({d:H3.dims(), shown:!document.querySelector('#customWH').hidden, res:document.querySelector('#resRow').hidden, note:document.querySelector('#customNote').textContent, snap:H3.snapshot()}));
  await page.fill('#cw', '1344'); await page.fill('#ch', '1344'); await page.waitForTimeout(100);
  const CB = await page.evaluate(() => H3.dims());
  await page.click('#cSwap'); const CS = await page.evaluate(() => [H3.S.f.cw, H3.S.f.ch]);
  await page.click('[data-asp="16:9"]'); const C0 = await page.evaluate(() => ({d:H3.dims(), shown:!document.querySelector('#customWH').hidden}));
  ok(CU.shown && CU.res && CU.d.w===992 && CU.d.h===416 && CU.snap.w===992 && /992×416/.test(CU.note) && CB.w===CB.h && CB.w * CB.h <= 768 * 1344 && CB.w % 32===0 && CS.join()===[CB.w, CB.h].join() && !C0.shown && C0.d.w > C0.d.h,
    '✏ Custom canvas: width × height snapped to 32, over the cap shrunk same shape, back to a ratio chip hides it: ' + JSON.stringify({d:CU.d, shown:CU.shown, res:CU.res, sw:CU.snap.w, note:CU.note, big:CB, CS, back:C0}));
  ok(/\n\[Shot 1\] she walks to the window\n\[Shot 2\] close-up of her eyes/.test(SH.P) && /appears in every shot/.test(SH.P) && /multi-shot/.test(SH.P) && /\[Shot 1\] Live-action, cinematic\. She walks in\n\[Shot 2\] her face/.test(SH.B), '🎬 the H3 prompt puts each shot on its own line: ' + JSON.stringify(SH.P.slice(-400)));
  await page.click('#h3Peek summary'); await page.screenshot({path:path.join(__dirname, 'h3way.png'), fullPage:false, clip:{x:0, y:0, width:390, height:1400}}).catch(() => {});
  // ✨ motion and quality words (Jordan 2026-11-09): OFF by default (every version pulled the Eros merge toward skin); a tap turns them on, after the style
  const ST = await page.evaluate(() => { const q = s => document.querySelector(s); H3.S.f.h3 = true; H3.S.f.sm = false; delete H3.S.f.quality;
    H3.S.f.h3Style = 'The target video is photorealistic live-action film footage shot on a real cinema camera: real people with natural skin texture and pores, real locations, natural light and lens depth of field. It is not animation, not a cartoon, not anime, not a 3D render and not CGI.'; H3.drawH3();
    const r = {row:!q('#styleRow').hidden, off0:/off/.test(q('#styleChips [data-q]').textContent) && !q('#styleChips [data-q]').classList.contains('pri'), cleared:H3.S.f.h3Style===''};
    const P = o => H3.h3Prompt({h3:Object.assign({style:''}, o), text:'she waves', imgs:[{desc:'a woman', keep:'exact'}], secs:5});
    r.P0 = P({}); r.Pq = P({quality:true}); r.Bq = H3.h3Prompt({h3:{style:'', quality:true}, text:'she waves', secs:5}); r.own = /my words here/.test(H3.h3Prompt({h3:{style:'', quality:true, qtext:'my words here'}, text:'x', secs:5}));
    q('#styleChips [data-q]').click(); r.on = H3.S.f.quality===true && /on/.test(q('#styleChips [data-q]').textContent) && H3.snapshot().h3.quality===true; q('#styleChips [data-q]').click(); r.back = H3.S.f.quality!==true && H3.snapshot().h3.quality===false; return r; });
  const qs = ST.Pq.split('detailed_description:')[1].split('[Shot 1]')[0];
  ok(ST.row && ST.off0 && ST.cleared && !/tripod/.test(ST.P0) && /style\. The camera is on a tripod/.test(ST.Pq) && /cinematic\. The camera is on a tripod/.test(ST.Bq) && !/detailed|sharp|professional|skin|clothing|bod(y|ies)|rich|flattering/i.test(qs) && ST.own && ST.on && ST.back,
    '✨ motion and quality words: off by default, on after a tap (both prompt formats, concrete camera and light words only): ' + JSON.stringify({row:ST.row, off0:ST.off0, cleared:ST.cleared, on:ST.on, back:ST.back}));
  // 🚫 Keep out (Jordan 2026-11-09): on by default, the NAG guider with the keep-out words in place of the plain guider; own words and strength;
  // off = plain guider; a PC without the node gets no 🚫 job while another PC has it; an old take (no neg field) follows the form
  const NG = await page.evaluate(R => { const q = s => document.querySelector(s), f = H3.S.f, oi = H3.PC[R].oi; delete f.negOn; f.neg = ''; f.negScale = ''; H3.drawH3(); H3.h3Peek();
    const mk = id => { const t = H3.snapshot(); Object.assign(t, {id, pc:R, seed:1, dir:'H3Deck/h3_' + id, name:'h3_' + id}); return t; };
    const G = t => H3.pieceGraph(t, 0, oi, {}).g, find = (g, c) => Object.keys(g).find(k => g[k].class_type===c);
    const r = {chip:/on/.test(q('#styleChips [data-neg]').textContent), box:!q('#negBox').hidden, ph:q('#h3Neg').placeholder===H3.KEEP_OUT, peek:/🚫 Keep out \(NAG negative\): nipples showing/.test(q('#h3NegPeek').textContent)};
    const t = mk('tn'), g = G(t), ng = find(g, 'NAGGuiderMiniMaxH3'), ce = find(g, 'CLIPTextEncode');
    r.neg = t.neg===H3.KEEP_OUT && !!ng && !find(g, 'BasicGuider') && !!ce && g[ce].inputs.text===H3.KEEP_OUT && g[ng].inputs.nag_scale===9 && g[ng].inputs.nag_tau===3.48 && g[ng].inputs.nag_alpha===0.5 && g[ng].inputs.nag_sigma_end===0 && g[ng].inputs.nag_negative[0]===ce && g[find(g, 'SamplerCustomAdvanced')].inputs.guider[0]===ng && g[ce].inputs.clip[0]===find(g, 'CLIPLoader');
    f.neg = 'red, red paint'; f.negScale = '3'; const t2 = mk('tn2'), g2 = G(t2), n2 = find(g2, 'NAGGuiderMiniMaxH3');
    r.own = t2.neg==='red, red paint' && t2.negScale===3 && g2[n2].inputs.nag_scale===3 && g2[n2].inputs.nag_tau===2.16 && g2[n2].inputs.nag_alpha===0.17 && g2[find(g2, 'CLIPTextEncode')].inputs.text==='red, red paint';
    q('#styleChips [data-neg]').click(); r.offChip = f.negOn===false && /off/.test(q('#styleChips [data-neg]').textContent) && q('#negBox').hidden; const t3 = mk('tn3'), g3 = G(t3); r.off = t3.neg==='' && !!find(g3, 'BasicGuider') && !find(g3, 'NAGGuiderMiniMaxH3');
    q('#styleChips [data-neg]').click(); r.backOn = f.negOn!==false;
    const bare = JSON.parse(JSON.stringify(oi)); delete bare.NAGGuiderMiniMaxH3; H3.PC['http://main.test'] = {online:true, oi:bare, load:0}; H3.S.pcs.push({name:'Main', url:'http://main.test', on:true, speed:1});
    r.route = /Keep out node/.test(H3.canRun('http://main.test', t2)) && H3.canRun(R, t2)==='' && H3.canRun('http://main.test', t3)===''; H3.S.pcs.pop(); delete H3.PC['http://main.test'];
    const old = JSON.parse(JSON.stringify(t2)); delete old.neg; delete old.negScale; const go = G(old); r.old = !!find(go, 'NAGGuiderMiniMaxH3') && go[find(go, 'CLIPTextEncode')].inputs.text==='red, red paint';
    // back in the form from a take: its words and strength, off when it had none
    H3.useAgain(t2, true); r.again = f.negOn!==false && f.neg==='red, red paint' && +f.negScale===3; H3.useAgain(t3, true); r.againOff = f.negOn===false; H3.useAgain(t, true); r.againDef = f.negOn!==false && f.neg==='';
    f.neg = ''; f.negScale = ''; return r; }, R);
  // (Jordan 2026-11-09: in bare bones she could toggle 🚫 but not find the box: every .note in the form was hidden)
  const BB = await page.evaluate(() => { document.body.classList.add('bare'); const v = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display!=='none'; };
    const r = {sum:v('#negBox summary'), scale:v('#negScale')}; document.body.classList.remove('bare'); return r; });
  ok(BB.sum && BB.scale, '🚫 the box and its Strength stay visible in bare bones: ' + JSON.stringify(BB));
  ok(NG.chip && NG.box && NG.ph && NG.peek && NG.neg && NG.own && NG.offChip && NG.off && NG.backOn && NG.route && NG.old && NG.again && NG.againOff && NG.againDef,
    '🚫 Keep out: on by default with the NAG guider and the keep-out words, own words and strength, off = plain guider, only to a PC with the node, back into the form: ' + JSON.stringify(NG));
  // 🔀 Finish on PIKA (Jordan 2026-11-09): the first model samples the first part of the steps, PIKA + the LoRAs the rest from that latent
  const FP = await page.evaluate(R => { const q = s => document.querySelector(s), f = H3.S.f, oi = H3.PC[R].oi; f.model = H3.families().find(x => /hybrid/.test(x.key)).key; f.finOn = false; f.finAt = 0.5; H3.drawAll && H3.drawAll();
    const r = {row:!q('#finRow').hidden}; q('#finSw').click(); r.on = f.finOn===true;
    const t = H3.snapshot(); Object.assign(t, {id:'tf', pc:R, seed:5, dir:'H3Deck/h3_tf', name:'h3_tf'}); r.fin = t.fin && t.fin.at===0.5;
    const g = H3.pieceGraph(t, 0, oi, {}).g, ks = Object.keys(g), by = c => ks.filter(k => g[k].class_type===c);
    const sp = by('SplitSigmas')[0], sa = by('SamplerCustomAdvanced'), un = by('UNETLoader').map(k => g[k].inputs.unet_name);
    r.split = !!sp && sa.length===2 && g[sa[0]].inputs.sigmas[0]===sp && g[sa[0]].inputs.sigmas[1]===0 && g[sa[1]].inputs.sigmas[1]===1 && g[sa[1]].inputs.latent_image[0]===sa[0] && g[g[sa[1]].inputs.noise[0]].class_type==='DisableNoise';
    r.models = un.length===2 && /Hybrid/.test(un[0]) && /prismPIKA/.test(un[1]);
    f.model = H3.families().find(x => /singularity|prism|pika/.test(x.key)).key; H3.drawAll && H3.drawAll(); r.hiddenOnPika = q('#finRow').hidden && !H3.snapshot().fin;
    f.finOn = false; f.model = H3.families().find(x => /hybrid/.test(x.key)).key; H3.drawAll && H3.drawAll(); return r; }, R);
  ok(FP.row && FP.on && FP.fin && FP.split && FP.models && FP.hiddenOnPika, '🔀 Finish on PIKA: split sigmas, first model then PIKA from its latent, hidden when the model is PIKA: ' + JSON.stringify(FP));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
