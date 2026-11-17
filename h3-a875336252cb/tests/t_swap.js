// 🔄 Swap person: the clip as <Video 1> (read from the PC's output, from the clip's start), the new people's pictures, the person swap
// workflow's six-part wording, Pika Flex LoRA on vanilla with six lcm steps, and the swapped stretch spliced back into the take.
// (fake ComfyUI, nothing renders)
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_swap.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const FLEX = 'pika_h3_flex_ref2va_v1_bf16.safetensors';
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'h3_open_regenerate_2k_r128.safetensors', FLEX]], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'Video Slice','ImageFromBatch','TrimAudioDuration','ManualSigmas','AudioConcat','VAEEncode','MiniMaxH3ImageToVideo'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [];
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST') return J({});
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p==='/queue') return J({queue_running:[], queue_pending:sent.map(s => [0, s.pid])});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({});
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)});
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.png', subfolder:'', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, host:u.origin, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => {
    ['p1', 'p2', 'q1', 'q2', 'q3', 'q4'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    const cast = [{n:1, kind:'char', who:'Laura', stand:'a woman', desc:'long red hair, green eyes', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'char', who:'Mia', stand:'a girl', desc:'short black bob', pics:['q1', 'q2', 'q3', 'q4'], keep:'exact'}];
    H3.S.cast = cast; H3.S.casts = H3.S.casts || {}; H3.S.casts[H3.castK('fA')] = cast;
    const t = {id:'tA', t:Date.now(), pc:R, model:m, turbo:false, loras:[], w:640, h:352, seed:1, name:'h3_tA', dir:'H3Deck/h3_tA', film:'fA', prompt:'<Subject 1> dances on the rooftop.', seconds:5, imgs:[], vids:[], auds:[], follow:[],
      pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:'<Subject 1> dances on the rooftop.', state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_tA', type:'output'}}], state:'done', final:{filename:'h3_tA_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_tA', type:'output'}};
    H3.S.takes.unshift(t); H3.saveNow(); H3.drawAll(); }, [R, fam.find(k => /pika/i.test(k)) || fam[0]]);
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  await fr.waitForFunction(() => window.FILM && FILM.S && FILM.takeOf('tA')).catch(() => {});
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}], pps:24}; FILM.S.films.unshift(f); FILM.addClip(f, FILM.takeOf('tA'), 0); FILM.go({v:'film', film:'fA'}); });
  await page.waitForTimeout(400);
  const open = (cin, cout) => fr.evaluate(async ([a, b]) => { const f = FILM.S.films[0], tr = f.tracks[0], c = tr.clips[0]; c.in = a; c.out = b; FILM.swapSheet(f, tr, c); await new Promise(z => setTimeout(z, 150));
    return {txt:document.querySelector('#sheetCard').textContent, on:[...document.querySelectorAll('#swWho .pri')].map(b => b.textContent), looks:[...document.querySelectorAll('#swPpl [data-l]')].map(x => x.value), m:document.querySelector('#swM').value}; }, [cin, cout]);
  const swaps = () => page.evaluate(() => H3.S.takes.filter(x => x.swap).map(t => ({id:t.id, swap:t.swap, redo:t.redo, imgs:t.imgs.map(r => r.id), vids:t.vids, loras:t.loras, model:t.model, prompt:t.prompt, pc:t.pc})));
  const graph = id => page.evaluate(([R, id]) => { const t = H3.S.takes.find(x => x.id===id), names = {}; ['p1', 'p2', 'q1', 'q2', 'q3', 'q4'].forEach(k => names[k] = k + '.png');
    const G = H3.pieceGraph(t, 0, H3.PC[R].oi, names).g, g = Object.values(G), C = c => g.filter(n => n.class_type===c), rv = C('MiniMaxH3ReferenceToVideo')[0], fit = C('MMH3FitReferences')[0];
    const cv = C('CreateVideo')[0], src = x => x && G[x[0]] ? G[x[0]].class_type : '';
    return {imgs:C('LoadImage').map(n => n.inputs.image).sort(), vids:C('LoadVideo').map(n => n.inputs.file), p:rv ? rv.inputs.prompt : '', L:rv && rv.inputs.length, rvid:!!(rv && rv.inputs['ref_videos.ref_video_0']), raud:!!(rv && rv.inputs['ref_video_audios.ref_video_audio_0']),
      fit:fit ? {start:fit.inputs.video_1_start, sound:fit.inputs.video_1_sound, secs:fit.inputs.video_seconds} : null, sig:C('ManualSigmas').map(n => n.inputs.sigmas), ks:C('KSamplerSelect').map(n => n.inputs.sampler_name), bs:C('BasicScheduler').length,
      unet:C('UNETLoader').map(n => n.inputs.unet_name), lora:C('LoraLoaderModelOnly').map(n => n.inputs.lora_name + '@' + n.inputs.strength_model), ifb:C('ImageFromBatch').map(n => n.inputs.batch_index + '+' + n.inputs.length),
      ac:C('AudioConcat').length, aud:src(cv && cv.inputs.audio), guides:C('MiniMaxH3AddGuide').length}; }, [R, id]);
  // 1) one person, the whole clip, the workflow's way
  let O = await open(0, 5);
  ok(/Swap person/.test(O.txt) && O.on.join()==='Laura' && O.m==='', 'the sheet opens with the clip\'s own character picked and Pika Flex as the model: ' + JSON.stringify(O.on) + ' ' + O.m);
  ok(/a woman, long red hair, green eyes/.test(O.looks[0] || ''), 'the looks line starts from her card: ' + O.looks);
  await fr.evaluate(async () => { const g = document.querySelector('#swPpl [data-g="1"]'); g.value = 'the woman in the black dress'; document.querySelector('#swGo').click(); await new Promise(z => setTimeout(z, 2500)); });
  let S1 = await swaps(); const A = S1[0];
  ok(S1.length===1 && A.redo.swap && A.redo.src==='tA' && A.redo.a===0 && A.redo.b===120 && A.redo.film==='fA' && A.swap.pika && A.swap.sound, 'one swap take of the whole clip, a version of the take: ' + JSON.stringify(A && {a:A.redo.a, b:A.redo.b}));
  ok(A.imgs.join()==='p1,p2' && A.vids.length===1 && /h3_tA_00001_\.mp4 \[output\]$/.test(A.vids[0].file) && A.vids[0].start===0 && A.vids[0].sound===true, 'her two pictures, and the clip read from the PC with its sound: ' + JSON.stringify(A.vids));
  ok(A.loras.length===1 && A.loras[0].name===FLEX && /ref2va_pruned/i.test(A.model + ''), 'vanilla model + Pika Flex LoRA: ' + A.model + ' ' + JSON.stringify(A.loras));
  let G = await graph(A.id);
  ok(G.sig.join()==='1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0' && G.ks.join()==='lcm' && G.bs===0, 'Pika\'s six lcm steps: ' + G.sig + ' ' + G.ks);
  ok(G.unet.some(x => /ref2va_pruned_int8/.test(x)) && G.lora.join()===FLEX + '@1', 'the official model with the Flex LoRA at 1.0: ' + G.unet + ' ' + G.lora);
  ok(G.imgs.join()==='p1.png,p2.png' && G.rvid && G.raud && G.fit && G.fit.start===0 && G.fit.sound===true, 'the pictures and the clip (with its sound) go to MiniMax: ' + JSON.stringify(G.fit));
  ok(/<Subject 1> is the woman in the black dress in <Video 1>, selected for replacement\./.test(G.p) && /<Subject 2> is the person in <Picture 1> and <Picture 2>, with the same face and this appearance: a woman, long red hair, green eyes\./.test(G.p), 'the swap\'s subject lines: ' + G.p.slice(0, 400));
  ok(/^subject_definitions:/.test(G.p) && /\nsummary:\n\[video editing\] Replace <Subject 1> with <Subject 2>/.test(G.p) && /<Subject 1>: removed - replace the woman in the black dress with <Subject 2> throughout\./.test(G.p) && /The original sound of <Video 1> continues throughout\./.test(G.p) && /Everyone else stays as they are/.test(G.p), 'the six parts, as the workflow writes them');
  ok(!/Laura|dances/.test(G.p), 'the take\'s own words and names don\'t leak in');
  ok(G.ifb.includes('0+120') && G.aud==='GetVideoComponents' && G.guides===0, 'the swapped frames are the whole take, with the clip\'s sound, nothing pinned: ' + G.ifb + ' ' + G.aud);
  // 2) a stretch in the middle of the take: the frames either side are the take's own
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => !x.swap); });
  O = await open(1, 4);
  await fr.evaluate(async () => { document.querySelector('#swGo').click(); await new Promise(z => setTimeout(z, 2500)); });
  S1 = await swaps(); const B = S1[0]; G = await graph(B.id);
  ok(B.redo.a===24 && B.redo.b===96 && B.vids[0].start===1 && G.fit.start===1, 'the stretch 1–4 s, its video read from 1 s: ' + JSON.stringify({a:B.redo.a, b:B.redo.b, st:G.fit.start}));
  ok(G.ifb.join()==='0+24,0+72,96+24' && G.L >= 72, 'spliced: the take\'s first 24 frames, 72 swapped, the take\'s last 24: ' + G.ifb + ' L=' + G.L);
  ok(/<Subject 1> is the original person in <Video 1>/.test(G.p) && /Show one person throughout\./.test(G.p), 'no "comes in for": the original person, one person shown');
  // 3) two people, the clip's sound off, on Prism Pika
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => !x.swap); });
  O = await open(0, 5);
  await fr.evaluate(async () => { document.querySelector('#swWho [data-n="2"]').click(); document.querySelector('#swOpt [data-o="sound"]').click();
    const o = [...document.querySelectorAll('#swM option')].find(x => /pika/i.test(x.value)); const s = document.querySelector('#swM'); s.value = o.value; s.dispatchEvent(new Event('change'));
    document.querySelector('#swPpl [data-g="2"]').value = 'the man in the hat'; document.querySelector('#swGo').click(); await new Promise(z => setTimeout(z, 2500)); });
  S1 = await swaps(); const C2 = S1[0]; G = await graph(C2.id);
  ok(C2.imgs.join()==='p1,p2,q1,q2,q3' && !C2.swap.pika && !C2.loras.length && C2.swap.sound===false, 'two people: hers and three of Mia\'s pictures, no Flex LoRA: ' + C2.imgs);
  ok(G.unet.some(x => /prismPIKA/.test(x)) && !G.sig.length && G.ks.join()==='res_multistep', 'Prism Pika with its own sampler: ' + G.unet + ' ' + G.ks);
  ok(/<Subject 1> is the person on the left in <Video 1>/.test(G.p) && /<Subject 2> is the man in the hat in <Video 1>/.test(G.p) && /<Subject 4> is the person in <Picture 3>, <Picture 4> and <Picture 5>/.test(G.p) && /Replace <Subject 1> with <Subject 3> and <Subject 2> with <Subject 4>/.test(G.p) && /change only the people\./.test(G.p), 'the people who go are 1-2, the new ones 3-4: ' + G.p.slice(0, 700));
  ok(!G.raud && G.fit.sound===false && G.aud==='TrimAudioDuration', 'sound off: MiniMax makes the sound: ' + G.aud);
  ok(/The steady sound of the place continues/.test(G.p), 'the soundscape line says so');
  // 4) the take card and the timeline label
  const lab = await fr.evaluate(id => FILM.clipLabel ? FILM.clipLabel(FILM.takeOf(id)) : '', C2.id);
  ok(/^🔄 Laura in for the person, Mia in for the man in the hat/.test(C2.prompt) && !/^↻/.test(lab), 'the take\'s label: ' + C2.prompt);
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
