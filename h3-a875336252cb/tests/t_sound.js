// 🔊 Add sound: HunyuanVideo-Foley on a finished clip (in pieces of up to 10 s), 💬 voices pulled out of MiniMax's sound with MelBand
// RoFormer and mixed back on top, saved as a version of the take that drops into its Films clip; the take card, the clip tools and the
// track ⋯ open the sheet. (fake ComfyUI, nothing renders)
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node tests/t_sound.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  HunyuanModelLoader:{input:{required:{model_name:[['hunyuanvideo_foley.safetensors', 'hunyuanvideo_foley_fp8_e4m3fn.safetensors', 'vae_128d_48k_fp16.safetensors']], precision:[['auto', 'bf16', 'fp16', 'fp32'], {default:'bf16'}], quantization:[['none', 'fp8_e4m3fn', 'fp8_e5m2', 'auto'], {default:'auto'}]}}},
  HunyuanDependenciesLoader:{input:{required:{vae_name:[['vae_128d_48k_fp16.safetensors']], synchformer_name:[['synchformer_state_dict_fp16.safetensors']]}}},
  HunyuanFoleySampler:{input:{required:{hunyuan_model:['HUNYUAN_MODEL'], hunyuan_deps:['HUNYUAN_DEPS'], frame_rate:['FLOAT', {default:16}], duration:['FLOAT', {default:5}], prompt:['STRING', {}], negative_prompt:['STRING', {}], cfg_scale:['FLOAT', {default:4.5}], steps:['INT', {default:50}], sampler:[['euler', 'heun-2'], {default:'euler'}], batch_size:['INT', {default:1}], seed:['INT', {default:0}], force_offload:['BOOLEAN', {default:true}]}, optional:{image:['IMAGE']}}},
  MelBandRoFormerModelLoader:{input:{required:{model_name:[['minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'MelBandRoformer_fp16.safetensors']]}}},
  AudioMerge:{input:{required:{audio1:['AUDIO'], audio2:['AUDIO'], merge_method:[['add', 'mean', 'subtract', 'multiply']]}}},
  AudioAdjustVolume:{input:{required:{audio:['AUDIO'], volume:['INT', {default:1}]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3AddGuide','MMH3FitReferences','LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced',
  'VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','Video Slice','ImageFromBatch','TrimAudioDuration','AudioConcat','MelBandRoFormerSampler','H3AudioRefineSampler','RepeatImageBatch','ImageBatch','VAEEncode','LTXVSeparateAVLatent','LTXVConcatAVLatent'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8049);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = []; let schema = SCHEMA;
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, schema); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(schema[c] ? {[c]:schema[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST') return J({});
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p==='/queue') return J({queue_running:[], queue_pending:sent.map(s => [0, s.pid])});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({});
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, host:u.origin, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = [{name:'Render', url:r, on:true}]; }, R);
  await page.goto('http://127.0.0.1:8049/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  const fam = await page.evaluate(() => H3.families().map(f => f.key));
  await page.evaluate(([R, m]) => {
    const mk = (id, F, words, extra) => Object.assign({id, t:Date.now(), pc:R, model:m, turbo:false, loras:[], w:640, h:352, seed:7, name:'h3_' + id, dir:'H3Deck/h3_' + id, film:'fA', prompt:words, seconds:F / 24, imgs:[], vids:[], auds:[], follow:[],
      h3:{sound:'rain on the window'}, pieces:[{start:0, gen:F + 4, deliv:F, ctx:0, prompt:words, state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}}], state:'done',
      final:{filename:'h3_' + id + '_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_' + id, type:'output'}}, extra || {});
    H3.S.takes.unshift(mk('tA', 120, '<Subject 1> dances on the rooftop.'), mk('tB', 336, '<Subject 1> walks in. <Subject 1> (S1) says softly, <Dialogue 1>'));
    H3.saveNow(); H3.drawAll(); }, [R, fam[0]]);
  const snd = () => page.evaluate(() => H3.S.takes.filter(x => x.snd).map(t => ({id:t.id, snd:t.snd, redo:t.redo, prompt:t.prompt, pc:t.pc, noMove:t.noMove, p0:t.pieces[0], state:t.state})));
  const graph = id => page.evaluate(([R, id]) => { const t = H3.S.takes.find(x => x.id===id), G = H3.sndGraph(t, t.pieces[0], H3.PC[R].oi).g, g = Object.values(G), C = c => g.filter(n => n.class_type===c), src = x => x && G[x[0]] ? G[x[0]].class_type : '';
    const sv = C('SaveVideo')[0], cv = C('CreateVideo')[0];
    return {lv:C('LoadVideo').map(n => n.inputs.file), fs:C('HunyuanFoleySampler').map(n => ({d:n.inputs.duration, fr:n.inputs.frame_rate, p:n.inputs.prompt, neg:n.inputs.negative_prompt, st:n.inputs.steps, img:src(n.inputs.image), cfg:n.inputs.cfg_scale, sm:n.inputs.sampler})),
      ml:C('HunyuanModelLoader').map(n => n.inputs.model_name + '|' + n.inputs.quantization), dl:C('HunyuanDependenciesLoader').map(n => n.inputs.vae_name + '|' + n.inputs.synchformer_name), ifb:C('ImageFromBatch').map(n => n.inputs.batch_index + '+' + n.inputs.length),
      ac:C('AudioConcat').length, mel:C('MelBandRoFormerModelLoader').map(n => n.inputs.model_name), melIn:C('MelBandRoFormerSampler').map(n => src(n.inputs.audio)), mg:C('AudioMerge').map(n => src(n.inputs.audio1) + '+' + src(n.inputs.audio2) + ':' + n.inputs.merge_method),
      vol:C('AudioAdjustVolume').map(n => n.inputs.volume), aud:src(cv.inputs.audio), img:src(cv.inputs.images), pre:sv.inputs.filename_prefix, nodes:g.length}; }, [R, id]);
  // 1) the take card's ⋯ › 🔊 Add sound
  await page.evaluate(() => { H3.soundSheet(H3.S.takes.find(x => x.id==='tA')); });
  let txt = await page.evaluate(() => document.querySelector('#sheetCard').textContent);
  const P0 = await page.evaluate(() => document.querySelector('#sndP').value), V0 = await page.evaluate(() => document.querySelector('#sndOpt [data-o="voice"]').className);
  ok(/Add sound/.test(txt) && P0==='rain on the window' && !/pri/.test(V0), 'the sheet opens with the take\'s "sounds you hear" words, voices off (no 💬 lines): ' + P0);
  await page.evaluate(async () => { document.querySelector('#sndP').value = 'Wind on a rooftop, sneakers scuffing on gravel'; document.querySelector('#sndGo').click(); await new Promise(z => setTimeout(z, 1500)); });
  let S1 = await snd(), A = S1[0]; if(!A) console.log('toast:', await page.evaluate(() => [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | ')));
  ok(S1.length===1 && A.redo.snd && A.redo.src==='tA' && A.redo.Fout===120 && A.p0.snd.F===120 && A.noMove && A.state==='working', 'one sound take, a version of the take, the whole 5 s: ' + JSON.stringify(A && {F:A.redo.Fout, st:A.state}));
  ok(/h3_tA_00001_\.mp4 \[output\]$/.test(A.p0.snd.file) && /^🔊 Wind on a rooftop/.test(A.prompt), 'it reads the take\'s finished video from the PC: ' + A.p0.snd.file);
  ok(sent.length===1, 'it was sent to Render: ' + sent.length);
  let G = await graph(A.id);
  ok(G.ml.join()==='hunyuanvideo_foley_fp8_e4m3fn.safetensors|auto' && G.dl.join()==='vae_128d_48k_fp16.safetensors|synchformer_state_dict_fp16.safetensors', 'Foley fp8 with its VAE and Synchformer: ' + G.ml + ' ' + G.dl);
  ok(G.fs.length===1 && G.fs[0].d===5 && G.fs[0].fr===24 && G.fs[0].img==='GetVideoComponents' && G.fs[0].st===50 && G.fs[0].cfg===4.5 && G.fs[0].sm==='euler', 'one Foley run over the whole clip\'s frames at 24 fps: ' + JSON.stringify(G.fs[0]));
  ok(/^Wind on a rooftop/.test(G.fs[0].p) && /speech/.test(G.fs[0].neg) && /music/.test(G.fs[0].neg), 'the sheet\'s words; speech and music kept out: ' + G.fs[0].neg);
  ok(!G.mel.length && !G.mg.length && G.aud==='AudioAdjustVolume' && G.vol.join()==='-3' && G.img==='GetVideoComponents', 'no voices: the new sound replaces MiniMax\'s, the frames are the clip\'s own: ' + G.aud);
  ok(G.pre==='H3Deck/' + A.redo.src.replace('tA', '') + G.pre.split('/')[1] + '/piece_01' || /^H3Deck\/h3_[^/]+\/piece_01$/.test(G.pre), 'saved as the new take\'s piece_01: ' + G.pre);
  // 2) a 14 s take with 💬 lines: Foley in two 7 s pieces, voices kept, effects 4 dB down
  await page.evaluate(() => { H3.soundSheet(H3.S.takes.find(x => x.id==='tB')); });
  const V1 = await page.evaluate(() => document.querySelector('#sndOpt [data-o="voice"]').className);
  ok(/pri/.test(V1) && await page.evaluate(() => document.querySelector('#sndDb').value)==='-10', '💬 Keep their voices is on by itself for a take with dialogue lines, effects 10 dB down');
  await page.evaluate(async () => { const r = document.querySelector('#sndDb'); r.value = '-12'; r.dispatchEvent(new Event('input')); document.querySelector('#sndOpt [data-o="music"]').click(); document.querySelector('#sndSt [data-v="25"]').click(); document.querySelector('#sndGo').click(); await new Promise(z => setTimeout(z, 1500)); });
  S1 = await snd(); const B = S1.find(x => x.redo.src==='tB'); G = await graph(B.id);
  ok(B.snd.voice && B.snd.music && B.snd.db===-12 && B.snd.steps===25, 'its settings: ' + JSON.stringify(B.snd));
  ok(G.fs.length===2 && G.fs.every(x => x.d===7 && x.img==='ImageFromBatch' && x.st===25) && G.ifb.join()==='0+168,168+168' && G.ac===1, 'two 7 s Foley pieces joined end to end: ' + G.ifb + ' ' + JSON.stringify(G.fs.map(x => x.d)));
  ok(!/music/.test(G.fs[0].neg) && /speech/.test(G.fs[0].neg), '🎵 lets music in, speech stays out: ' + G.fs[0].neg);
  ok(G.mel.join()==='MelBandRoformer_fp16.safetensors' && G.melIn.join()==='GetVideoComponents' && G.mg.join()==='AudioAdjustVolume+MelBandRoFormerSampler:add' && G.vol.join()==='-12', 'MiniMax\'s voices (MelBand) over the effects at -12 dB: ' + G.mg + ' ' + G.vol);
  // 2b) 🎙 a voice-over: MiniMax makes the sound with the picture frozen (H3 Audio Refine), MelBand keeps its voice, over the Foley effects
  await page.evaluate(() => { H3.soundSheet(H3.S.takes.find(x => x.id==='tA')); });
  await page.evaluate(async () => { const v = document.querySelector('#sndVo'); v.value = 'She never thought she would see this place again'; v.dispatchEvent(new Event('input')); document.querySelector('#sndVoHow').value = 'calm older woman\'s';
    document.querySelector('#sndGo').click(); await new Promise(z => setTimeout(z, 1500)); });
  S1 = await snd(); const V = S1.find(x => x.snd.vo);
  ok(V && V.snd.vo==='She never thought she would see this place again' && V.snd.voHow==="calm older woman's" && V.snd.db===-10 && /^🎙 "She never/.test(V.prompt), 'a voice-over take, effects 10 dB down under it: ' + JSON.stringify(V && V.snd));
  const GV = await page.evaluate(([R, id]) => { const t = H3.S.takes.find(x => x.id===id), G = H3.sndGraph(t, t.pieces[0], H3.PC[R].oi).g, g = Object.values(G), C = c => g.filter(n => n.class_type===c), src = x => x && G[x[0]] ? G[x[0]].class_type : '';
    const rf = C('H3AudioRefineSampler')[0], rv = C('MiniMaxH3ReferenceToVideo')[0], cv = C('CreateVideo')[0], ids = Object.keys(G), at = c => ids.findIndex(k => G[k].class_type===c);
    return {rf:rf && {ad:rf.inputs.audio_denoise, vd:rf.inputs.video_denoise, cfg:rf.inputs.cfg, st:rf.inputs.steps, lat:src(rf.inputs.latent), pos:src(rf.inputs.positive)}, p:rv && rv.inputs.prompt, L:rv && rv.inputs.length, wh:rv && [rv.inputs.width, rv.inputs.height],
      sc:C('ImageScale').map(n => n.inputs.width + 'x' + n.inputs.height), rep:C('RepeatImageBatch').map(n => n.inputs.amount), tr:C('TrimAudioDuration').map(n => n.inputs.duration), mel:C('MelBandRoFormerSampler').map(n => src(n.inputs.audio)),
      mg:C('AudioMerge').map(n => src(n.inputs.audio1) + '+' + src(n.inputs.audio2)), aud:src(cv.inputs.audio), img:src(cv.inputs.images), mmFirst:at('UNETLoader') < at('HunyuanModelLoader'), unet:C('UNETLoader').map(n => n.inputs.unet_name)}; }, [R, V.id]);
  ok(GV.rf && GV.rf.ad===1 && GV.rf.vd===0 && GV.rf.cfg===1 && GV.rf.lat==='LTXVConcatAVLatent' && GV.rf.pos==='MiniMaxH3ReferenceToVideo', 'H3 Audio Refine: video frozen, sound made from scratch at CFG 1: ' + JSON.stringify(GV.rf));
  ok(/says in an off-screen voiceover: <d>\[English\] She never thought she would see this place again\.<\/d>/.test(GV.p) && /A calm older woman's voice/.test(GV.p) && /lips completely closed/.test(GV.p), 'the voice-over line in MiniMax\'s words: ' + GV.p);
  ok(GV.L===124 && GV.rep.join()==='4' && GV.tr.join()==='5' && GV.sc.length===1, 'on MiniMax\'s 17k+5 grid (120 → 124, the last frame held 4 more), its sound cut back to 5 s: ' + GV.L + ' ' + GV.sc);
  ok(GV.mel.join()==='TrimAudioDuration' && GV.mg.join()==='AudioAdjustVolume+MelBandRoFormerSampler' && GV.aud==='AudioMerge' && GV.img==='GetVideoComponents', 'only MiniMax\'s voice is kept, laid over the effects; the frames are the clip\'s own: ' + GV.mg);
  ok(GV.mmFirst && GV.unet.length===1, 'MiniMax runs before Foley loads: ' + GV.unet);
  const longVo = await page.evaluate(async () => { const n0 = H3.S.takes.filter(x => x.snd).length; const r = await window.H3Sound({take:'tB', prompt:'x', vo:'Hello there'}); return {r, n:H3.S.takes.filter(x => x.snd).length - n0}; });
  ok(longVo.r===0 && longVo.n===0, 'a 14 s clip is too long for a voice-over (8 s on 8 GB)');
  // 3) a PC without the nodes can't take it, and says why
  const why = await page.evaluate(() => H3.sndMissing({LoadVideo:{}}, {voice:false}));
  ok(/HunyuanVideo-Foley/.test(why), 'a PC without Foley says so: ' + why);
  const why2 = await page.evaluate(([R]) => { const oi = Object.assign({}, H3.PC[R].oi); delete oi.MelBandRoFormerSampler; return [H3.sndMissing(oi, {voice:true}), H3.sndMissing(oi, {voice:false})]; }, [R]);
  ok(/voices/.test(why2[0]) && why2[1]==='', 'without MelBand only the voices can\'t be kept: ' + why2);
  ok(await page.evaluate(([R]) => H3.canRun(R, H3.S.takes.find(x => x.snd))==='', [R]), 'canRun lets a sound take onto a PC with the nodes (no MiniMax checks)');
  // 4) Films: the clip tool and the track ⋯, and the finished pass drops into the clip
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => !x.snd); H3.saveNow(); });
  await page.click('[data-tab="films"]'); await page.waitForTimeout(2500);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  await fr.waitForFunction(() => window.FILM && FILM.S && FILM.takeOf('tA')).catch(() => {});
  await fr.evaluate(() => { const f = {id:'fA', name:'Film', tracks:[{id:'tr1', clips:[]}], pps:24}; FILM.S.films.unshift(f); FILM.addClip(f, FILM.takeOf('tA'), 0); FILM.addClip(f, FILM.takeOf('tB'), 0); FILM.go({v:'film', film:'fA'}); FILM.SEL = f.tracks[0].clips[0].id; FILM.draw(); });
  await page.waitForTimeout(400);
  const hasBtn = await fr.evaluate(() => !!document.querySelector('[data-act="sound"]'));
  ok(hasBtn, '🔊 Add sound is in the clip tools');
  await fr.evaluate(() => document.querySelector('[data-act="sound"]').click()); await page.waitForTimeout(300);
  txt = await page.evaluate(() => document.querySelector('#sheet').hidden ? '' : document.querySelector('#sheetCard').textContent);
  ok(/Add sound to 5 s/.test(txt), 'the clip tool opens the sheet over the app: ' + txt.slice(0, 60));
  await page.evaluate(async () => { document.querySelector('#sndGo').click(); await new Promise(z => setTimeout(z, 1500)); });
  S1 = await snd(); const Cc = S1[0];
  ok(S1.length===1 && Cc.redo.film==='fA' && Cc.redo.clip && Cc.redo.src==='tA', 'the pass knows its film and clip: ' + JSON.stringify(Cc && {film:Cc.redo.film, clip:Cc.redo.clip}));
  await page.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); t.state = 'done'; t.pieces[0].state = 'done'; t.pieces[0].file = {filename:'piece_01_00001_.mp4', subfolder:'Output_Render/' + t.dir, type:'output'}; t.final = t.pieces[0].file; H3.saveNow(); }, Cc.id);
  const placed = await fr.evaluate(id => { FILM.placeNew(); const c = FILM.S.films[0].tracks[0].clips[0]; return {take:c.take, lab:FILM.clipLabel ? FILM.clipLabel(FILM.takeOf(id)) : ''}; }, Cc.id);
  ok(placed.take===Cc.id, 'when done it\'s the clip\'s take (⇄ Versions keeps the one before): ' + placed.take);
  ok(!/^↻/.test(placed.lab), 'its timeline label isn\'t a ↻ redo: ' + placed.lab);
  // the whole track: each clip its own pass, voices only where someone talks
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(x => !x.snd || x.state==='done'); H3.saveNow(); });
  const n0 = (await snd()).length;
  await fr.evaluate(() => { const f = FILM.S.films[0]; f.tracks[0].clips[0].take = 'tA'; FILM.save(); });
  await fr.evaluate(async () => { const b = document.querySelector('[data-act="trackMenu"]'); b.click(); await new Promise(z => setTimeout(z, 200)); document.querySelector('[data-act="soundTrack"]').click(); }); await page.waitForTimeout(300);
  txt = await page.evaluate(() => document.querySelector('#sheetCard').textContent);
  ok(/2 clips/.test(txt), 'the track ⋯ opens one sheet for its 2 clips: ' + (txt.match(/Add sound to [^\n]*/) || [''])[0]);
  await page.evaluate(async () => { document.querySelector('#sndGo').click(); await new Promise(z => setTimeout(z, 2500)); });
  S1 = (await snd()).filter(x => x.state==='working');
  ok(S1.length===2 && S1.find(x => x.redo.src==='tA').snd.voice===false && S1.find(x => x.redo.src==='tB').snd.voice===true, 'two passes; voices kept only on the clip with 💬 lines: ' + JSON.stringify(S1.map(x => x.redo.src + ':' + x.snd.voice)));
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
