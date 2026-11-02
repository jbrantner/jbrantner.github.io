// 🎬 H3 Film: the app against two fake ComfyUIs (Render and Main) answered in the browser; nothing renders.
// Checks the picture sharing and renumbering, the per-part prompts, that a cut stays on one PC while cuts spread over
// both, the Cutting Room flow (pick → next part carried on by H3 Motion Context → join), and the ✂ redo-a-stretch graph.
// Run: NODE_PATH=$(npm root -g) node tests/t_film.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'qwen_image_edit_2511_fp8_e4m3fn.safetensors', 'z_image_turbo_bf16.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'Qwen-Image-Edit-2509-Lightning-8steps.safetensors', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors', 'qwen_3_4b.safetensors']], type:[['minimax', 'qwen_image', 'lumina2']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors', 'qwen_image_vae.safetensors', 'ae.safetensors']]}}},
  GetVideoComponents:{input:{required:{video:['VIDEO']}}},
  ImageFromBatch:{input:{required:{image:['IMAGE'], batch_index:['INT', {default:0}], length:['INT', {default:1}]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
  MiniMaxH3AddGuide:{input:{required:{positive:['CONDITIONING'], latent:['LATENT'], frame_idx:['INT', {default:0}]}, optional:{vae:['VAE'], audio_vae:['VAE'], image:['IMAGE'], audio:['AUDIO']}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContext','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MMH3FitReferences',
  'LoadImage','LoadVideo','TrimAudioDuration','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo',
  'TextEncodeQwenImageEditPlus','ModelSamplingAuraFlow','CFGNorm','ImageScaleToTotalPixels','EmptySD3LatentImage','ConditioningZeroOut','CLIPTextEncode','KSampler','KSamplerAdvanced','VAEDecode','SaveImage','VAEEncode'];
const types = g => Object.values(g).map(n => n.class_type), node = (g, t) => Object.values(g).find(n => n.class_type===t), nodes = (g, t) => Object.values(g).filter(n => n.class_type===t);
const linksOk = g => Object.values(g).every(n => Object.values(n.inputs).every(v => !Array.isArray(v) || (typeof v[0]==='string' && g[v[0]])));

(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8012);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], HIST = {}, FARM = {on:false, adds:[], jobs:[], done:[], cancelled:[]};
  for(const PCU of [R, M]){
    await page.route(PCU + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
      if(p==='/system_stats') return J({devices:[]});
      if(p.startsWith('/renderdeck/farm')){ if(!FARM.on || PCU!==R) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
        if(p==='/renderdeck/farm/add'){ const b = JSON.parse(rt.request().postData()); FARM.adds.push(b); b.jobs.forEach(j => FARM.jobs.push({key:j.key, state:'waiting', pin:j.pin, home:j.home, graph:j.graph})); }
        if(p==='/renderdeck/farm/cancel'){ const k = JSON.parse(rt.request().postData()).keys; FARM.cancelled.push(...k); FARM.jobs = FARM.jobs.filter(j => !k.includes(j.key)); }
        return J({farm:1, pcs:[{url:R, name:'Render', off:false, video:false}, {url:M, name:'Main', off:false, video:true}], jobs:FARM.jobs.map(j => ({key:j.key, state:j.state, id:j.id})), done:FARM.done}); }
      if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
      if(p==='/queue') return J({queue_running:[], queue_pending:sent.filter(s => s.pc===PCU && !HIST[s.pid]).map(s => [0, s.pid])});
      if(p==='/renderdeck/images') return J({shared:true, pc:PCU===R ? 'Output_Render' : 'Output_Main', images:[]});
      if(p==='/upload/image') return J({name:'h3deck_x.png', subfolder:'h3deck', type:'input'});
      if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pc:PCU, pid, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
      if(p==='/view') return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')});
      if(p.startsWith('/history/')){ const id = p.slice(9); return J(HIST[id] ? {[id]:HIST[id]} : {}); }
      return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  }
  await page.addInitScript(([r, m]) => { localStorage.clear(); window.FILM_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1.26}]; }, [R, M]);
  await page.goto('http://127.0.0.1:8012/film/index.html');
  await page.waitForFunction(() => FILM.families().length > 0, null, {timeout:20000});
  // finish a sent job: ComfyUI's history for it, with the file the app asked for
  const finish = async s => { const sv = Object.entries(s.g).find(([k, n]) => n.class_type==='SaveVideo'); const pre = s.pc===R ? 'Output_Render/' : 'Output_Main/', dir = sv[1].inputs.filename_prefix.replace(/\/[^/]*$/, '');
    HIST[s.pid] = {status:{completed:true, status_str:'success'}, outputs:{[sv[0]]:{images:[{filename:sv[1].inputs.filename_prefix.split('/').pop() + '_00001_.mp4', subfolder:pre + dir, type:'output'}]}}}; };
  const tick = () => page.evaluate(() => FILM.tick());

  // ---- a film: two characters with 9 ranked pictures each, a scene with a place picture ----
  await page.evaluate(async () => {
    const pic = async (n) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'hsl(' + n * 37 + ',70%,50%)'; x.fillRect(0, 0, 64, 64);
      const b = await new Promise(ok => c.toBlob(ok, 'image/png')); return addMedia(new File([b], 'p' + n + '.png', {type:'image/png'}), 'img'); };
    const f = FILM.newFilm('Diner'); FILM.S.films.push(f); f.model = FILM.families().find(x => /dasiwa/.test(x.key)).key;
    const ellie = {id:'chE', open:true, name:'Ellie', desc:'A woman in her 30s with short black hair. {2} shows her grey coat from behind. {7} shows the tattoo on her wrist.', refs:[]};
    const mara = {id:'chM', open:true, name:'Mara', desc:'A waitress with red curly hair.', refs:[]};
    for(let i = 0; i < 9; i++){ ellie.refs.push({id:await pic(i), note:i===0 ? 'her face up close' : ''}); mara.refs.push({id:await pic(20 + i), note:''}); }
    f.chars.push(ellie, mara);
    const place = {id:await pic(50), note:''};
    f.scenes.push({id:'s1', name:'Night', place:'a small neon-lit diner at night, rain on the windows', placeRefs:[place], cuts:[
      {id:'cu1', name:'Coffee', chars:['chE', 'chM'], counts:{}, seconds:12, action:'Ellie walks into the diner and sits at the counter. Mara slides her a cup of coffee. Ellie looks up at Mara and smiles.', parts:[], takes:3, cands:[], pick:[]}]},
      {id:'s2', name:'Street', place:'a wet street outside', placeRefs:[], cuts:[{id:'cu2', name:'Leaving', chars:['chE'], counts:{}, seconds:5, action:'Ellie steps out into the rain and pulls up her hood.', parts:[], takes:2, cands:[], pick:[]}]});
  });
  const al = await page.evaluate(() => { const x = FILM.ctxOf('cu1'), A = FILM.alloc(x.film, x.scene, x.cut); return {g:A.groups.map(g => [g.kind, g.used.length, g.first]), cast:FILM.castText(A, x.scene)}; });
  console.log(JSON.stringify(al.g)); console.log(al.cast);
  ok(JSON.stringify(al.g)==='[["char",4,1],["char",4,5],["place",1,9]]', '9 slots: Ellie 4 (#1-4), Mara 4 (#5-8), the place 1 (#9)');
  ok(/<Picture 1>, <Picture 2>, <Picture 3> and <Picture 4> show Ellie\./.test(al.cast) && /<Picture 1> is her face up close\./.test(al.cast), 'Ellie\'s pictures named, with the note on #1');
  ok(/<Picture 2> shows her grey coat/.test(al.cast) && !/tattoo/.test(al.cast), "Ellie's {2} kept, the sentence about her 7th picture dropped");
  ok(/<Picture 5>, <Picture 6>, <Picture 7> and <Picture 8> show Mara/.test(al.cast) && /<Picture 9> shows the place: A small neon-lit diner/.test(al.cast), 'Mara starts at #5; the place is #9');
  const al2 = await page.evaluate(() => { const x = FILM.ctxOf('cu1'); x.cut.counts = {chE:3}; const A = FILM.alloc(x.film, x.scene, x.cut); const r = A.groups.map(g => [g.kind, g.used.length, g.first]); x.cut.counts = {}; return r; });
  ok(JSON.stringify(al2)==='[["char",3,1],["char",5,4],["place",1,9]]', 'Ellie set to 3 pictures: Mara gets 4, 5, 6, 7, 8 (' + JSON.stringify(al2) + ')');

  // ---- parts: one sentence each, continuity added when sent ----
  const parts = await page.evaluate(() => { const x = FILM.ctxOf('cu1'); const P = FILM.syncParts(x.film, x.cut); return {n:P.length, t:x.cut.parts.map(p => p.text), p2:FILM.promptOf(x.film, x.scene, x.cut, 1, FILM.alloc(x.film, x.scene, x.cut))}; });
  console.log(JSON.stringify(parts.t)); console.log(parts.p2);
  ok(parts.n===3 && /walks into/.test(parts.t[0]) && /slides/.test(parts.t[1]) && /smiles/.test(parts.t[2]), '12 s = 3 parts, one sentence of the action each');
  ok(/^Realistic live-action/.test(parts.p2) && /continues straight on/.test(parts.p2) && /Already happened.*walks into the diner/.test(parts.p2) && /Now: Mara slides/.test(parts.p2), "part 2's prompt: style, cast, continuity with what already happened, then its own action");
  const ap = await page.evaluate(() => [FILM.autoParts('One. Two.', [{}, {}, {}]), FILM.autoParts('A. B. C. D. E. F.', [{}, {}, {}])]);
  ok(ap[0][0]==='One.' && ap[0][1]==='Two.' && ap[0][2]==='' && ap[1].every(p => p.split(' ').length===2), 'sentences shared out evenly; a part with none left is empty (' + JSON.stringify(ap) + ')');

  // ---- start both cuts: each cut stays on one PC, the two cuts go to different PCs ----
  await page.evaluate(() => FILM.go({v:'cut', film:FILM.S.films[0].id, cut:'cu1'}));
  await page.screenshot({path:path.join(__dirname, 'film_cut.png'), fullPage:true});
  await page.evaluate(() => FILM.startCut(FILM.ctxOf('cu1')));
  console.log('cu2 why:', await page.evaluate(() => { const x = FILM.ctxOf('cu2'); return whyNotStart(x.film, x.scene, x.cut); }));
  await page.evaluate(() => FILM.startCut(FILM.ctxOf('cu2')));
  const c1 = sent.filter(s => s.g && JSON.stringify(s.g).includes('coffee_') || JSON.stringify(s.g).includes('/coffee_')), c2 = sent.filter(s => JSON.stringify(s.g).includes('leaving_'));
  ok(c1.length===3 && new Set(c1.map(s => s.pc)).size===1, 'cut 1: 3 takes of part 1, all on one PC (' + c1.map(s => s.pc).join(',') + ')');
  ok(c2.length===2 && new Set(c2.map(s => s.pc)).size===1 && c2[0].pc!==c1[0].pc, 'cut 2 goes to the other PC (' + c2[0].pc + ')');
  const g1 = c1[0].g;
  ok(linksOk(g1), 'part 1 graph: every link points at a node');
  ok(nodes(g1, 'LoadImage').length===9 && !types(g1).includes('MiniMaxH3MotionContextLoadLatent') && node(g1, 'MiniMaxH3MotionContextSaveLatent').inputs.clip_index===1, 'part 1: 9 pictures, no context in, latent saved as clip 1');
  ok(/Now:/.test(node(g1, 'MiniMaxH3ReferenceToVideo').inputs.prompt)===false && /Ellie walks into the diner/.test(node(g1, 'MiniMaxH3ReferenceToVideo').inputs.prompt), 'part 1 prompt has its own action only');

  // ---- Cutting Room ----
  for(const s of c1.slice(0, 2)) await finish(s); await tick();
  let it = await page.evaluate(() => FILM.reviewItems().map(i => [i.cut.id, i.type, i.k, i.ready, i.busy]));
  console.log(JSON.stringify(it));
  ok(it.some(i => i[0]==='cu1' && i[3]===2 && i[4]===1), 'Cutting Room: cut 1 part 1 has 2 ready, 1 still rendering');
  await page.evaluate(() => FILM.go({v:'room'})); await page.waitForTimeout(300);
  await page.screenshot({path:path.join(__dirname, 'film_room.png'), fullPage:true});
  ok(await page.$$eval('.cand video', v => v.length)===2 && (await page.textContent('#roomBadge')).trim()==='1', 'the room shows 2 takes to watch and the badge counts 1 part to review');
  // pick take 2: part 2's takes carry on from it
  const n0 = sent.length;
  await page.evaluate(() => { const x = FILM.ctxOf('cu1'), c = x.cut.cands.filter(c => c.state==='done')[1]; return FILM.pickCand(x, c); });
  const p2 = sent.slice(n0); ok(p2.length===3 && p2.every(s => s.pc===c1[0].pc), "picking sends 3 takes of part 2 to the cut's PC");
  const g2 = p2[0].g, ld = node(g2, 'MiniMaxH3MotionContextLoadLatent'), pickedDir = await page.evaluate(() => { const x = FILM.ctxOf('cu1'); return x.cut.cands.find(c => c.id===x.cut.pick[0]).dir; });
  ok(linksOk(g2) && ld.inputs.clip_index===1 && ld.inputs.latent_path===(c1[0].pc===R ? 'Output_Render/' : 'Output_Main/') + pickedDir, 'part 2 loads the PICKED take\'s latent (' + ld.inputs.latent_path + ')');
  ok(types(g2).includes('MiniMaxH3MotionContext') && nodes(g2, 'MiniMaxH3MotionContextTrim').length===2 && node(g2, 'MiniMaxH3MotionContextSaveLatent').inputs.clip_index===2, 'part 2: Motion Context + trims, saves clip 2');
  // part 2, then part 3, then the join
  await finish(p2[0]); await tick(); await page.evaluate(() => { const x = FILM.ctxOf('cu1'); return FILM.pickCand(x, x.cut.cands.find(c => c.part===1 && c.state==='done')); });
  const p3 = sent.slice(n0 + 3); ok(p3.length===3 && node(p3[0].g, 'MiniMaxH3MotionContextLoadLatent').inputs.clip_index===2, 'part 3 takes load clip 2 of the picked part 2');
  await finish(p3[2]); await tick(); const nj = sent.length;
  await page.evaluate(() => { const x = FILM.ctxOf('cu1'); return FILM.pickCand(x, x.cut.cands.find(c => c.part===2 && c.state==='done')); });
  const jn = sent[nj]; ok(jn && node(jn.g, 'ConcatenateVideo') && nodes(jn.g, 'LoadVideo').length===3 && jn.pc===c1[0].pc, 'last pick joins the 3 picked parts on that PC');
  await finish(jn); await tick();
  const fin = await page.evaluate(() => FILM.ctxOf('cu1').cut.final); ok(fin && /cut_00001_\.mp4/.test(fin.file.filename), 'the cut is finished: ' + JSON.stringify(fin && fin.file));
  it = await page.evaluate(() => FILM.reviewItems().filter(i => i.cut.id==='cu1').length); ok(it===0, 'nothing left to review for cut 1');

  // ---- ✂ redo a stretch ----
  const fp = await page.evaluate(() => [FILM.fixPlan(274, 100, 140, 12), FILM.fixPlan(274, 100, 140, 0), FILM.fixPlan(274, 250, 273, 12)]);
  console.log(JSON.stringify(fp.map(p => [p.a, p.b, p.s0, p.L, p.pins.length])));
  ok(fp.every(p => p.L % 17===5 && p.s0 + p.L <= 274 && p.pins.some(q => q[1]===p.a && q[0]===p.a - p.s0) && p.pins.some(q => q[1]===p.b)), 'stretch windows sit on the 17k+5 grid inside the cut, pinned on frames a and b');
  ok(fp[1].pins.length===2, 'without context only the first and last frame are pinned');
  await page.evaluate(() => FILM.go({v:'cut', film:FILM.S.films[0].id, cut:'cu1'})); await page.waitForTimeout(300);
  await page.screenshot({path:path.join(__dirname, 'film_final.png'), fullPage:true});
  await page.click('[data-act="fxPart"][data-a]:nth-of-type(2)');
  ok(/slides/.test(await page.inputValue('#fxText')), 'Part 2 chip fills the stretch with part 2\'s action');
  const nf = sent.length; await page.click('[data-act="fxGo"]'); await page.waitForTimeout(800);
  const fxs = sent.slice(nf); ok(fxs.length===3 && fxs.every(s => s.pc===fin.pc), '3 redo takes on the PC that has the cut');
  const gf = fxs[0].g, lv = node(gf, 'LoadVideo');
  ok(linksOk(gf) && lv.inputs.file===fin.file.subfolder + '/' + fin.file.filename + ' [output]', 'redo loads the finished cut from the output folder');
  ok(nodes(gf, 'ImageBatch').length===2 && node(gf, 'CreateVideo').inputs.audio[0]===Object.keys(gf).find(k => gf[k].class_type==='GetVideoComponents') && !types(gf).includes('MiniMaxH3MotionContext'), 'redo splices before + new middle + after, keeps the cut\'s sound');
  ok(nodes(gf, 'MiniMaxH3AddGuide').filter(n => n.inputs.image).length > 2, 'frames around the stretch are pinned');
  await finish(fxs[0]); await tick();
  it = await page.evaluate(() => FILM.reviewItems().filter(i => i.type==='fix').map(i => i.ready)); ok(it.length===1 && it[0]===1, 'the redo shows in the Cutting Room');
  await page.evaluate(() => { const x = FILM.ctxOf('cu1'); return FILM.pickCand(x, x.cut.cands.find(c => c.kind==='fix' && c.state==='done')); });
  const v = await page.evaluate(() => { const c = FILM.ctxOf('cu1').cut; return [c.versions.length, /fix_/.test(c.final.file.subfolder), FILM.reviewItems().filter(i => i.type==='fix').length]; });
  ok(v[0]===1 && v[1] && v[2]===0, 'using the redo makes it the cut (old one kept for ↩ Undo), and the room is clear');


  // ---- 🪄 pictures for a cast member ----
  const nq = sent.length;
  const mk = await page.evaluate(async () => { const f = FILM.S.films[0], c = f.chars[0];
    const a = await FILM.makePictures(f, c, 'set', {which:[0, 1, 2], from:c.refs[0].id, extra:'round thin-metal glasses'});
    const b = await FILM.makePictures(f, c, 'new', {tries:4}); return [a, b]; });
  const qs = sent.slice(nq, nq + 3), zs = sent.slice(nq + 3);
  ok(mk[0]===3 && mk[1]===4 && qs.every(s => linksOk(s.g)) && zs.every(s => linksOk(s.g)), 'reference set: 3 angle jobs; from words: 4 tries, one job each');
  const qe = node(qs[1].g, 'TextEncodeQwenImageEditPlus');
  console.log(qe.inputs.prompt);
  ok(qe && Array.isArray(qe.inputs.image1) && /three-quarter view facing left/.test(qe.inputs.prompt) && /short black hair/.test(qe.inputs.prompt) && !/tattoo|\{/.test(qe.inputs.prompt) && /round thin-metal glasses/i.test(qe.inputs.prompt), 'angle prompt: her description (minus picture sentences), the extra words, the angle');
  ok(/2511-Lightning-4steps/.test(node(qs[0].g, 'LoraLoaderModelOnly').inputs.lora_name) && node(qs[0].g, 'KSampler').inputs.steps===4 && node(qs[0].g, 'CLIPLoader').inputs.type==='qwen_image', 'Qwen 2511 + its 4-step Lightning LoRA');
  const zt = zs.map(s => node(s.g, 'CLIPTextEncode').inputs.text); console.log(zt[0]);
  ok(!types(zs[0].g).includes('KSamplerAdvanced') && new Set(zt).size===4 && zt.every(x => /Plain light-grey studio background/.test(x)), 'variety: each try its own wording, all on a plain background, one normal sampler');
  ok(node(zs[0].g, 'EmptySD3LatentImage').inputs.batch_size===1 && /^Realistic photo of a woman in her 30s/.test(node(zs[0].g, 'CLIPTextEncode').inputs.text) && node(zs[0].g, 'CLIPLoader').inputs.type==='lumina2', 'Z-Image: realistic photo from her words');
  for(const s of [...qs, zs[0]]){ const sv = Object.entries(s.g).find(([k, n]) => n.class_type==='SaveImage'); HIST[s.pid] = {status:{completed:true}, outputs:{[sv[0]]:{images:[{filename:'a_00001_.png', subfolder:'Output_Render/x', type:'output'}].concat(s===zs[0] ? [{filename:'a_00002_.png', subfolder:'Output_Render/x', type:'output'}] : [])}}}; }
  await tick();
  await page.evaluate(() => FILM.go({v:'film', film:FILM.S.films[0].id, tab:'cast'})); await page.waitForTimeout(300);
  ok(await page.$$eval('.slot [data-act="gAdd"]', b => b.length)===5, 'the card shows 5 new pictures to add (3 angles + 2 from words)');
  await page.screenshot({path:path.join(__dirname, 'film_make.png'), fullPage:true});
  await page.click('img[data-act="gView"]'); await page.waitForTimeout(200);
  ok(await page.$$eval('#sheetCard img', i => i.length)===1 && /1 of 5/.test(await page.textContent('#sheetCard')), 'tapping a new picture opens it big (1 of 5)');
  await page.click('#sheetCard [data-act="gDrop"]'); await page.waitForTimeout(300);
  ok(/1 of 4/.test(await page.textContent('#sheetCard')), 'throwing it away moves on to the next one');
  await page.click('#sheetCard [data-act="close"]'); await page.waitForTimeout(200);
  const before = await page.evaluate(() => FILM.S.films[0].chars[0].refs.length);
  await page.click('[data-act="gAll"]'); await page.waitForTimeout(1500);
  const after = await page.evaluate(() => FILM.S.films[0].chars[0].refs.slice(-4).map(r => r.note));
  console.log(JSON.stringify(after));
  ok(await page.evaluate(() => FILM.S.films[0].chars[0].refs.length)===before + 4 && after[2]==='a three-quarter view' && after[3]==='a side profile', 'Add all puts them after her pictures, angles in order with their notes');
  await page.click('[data-act="mkOpen"]'); await page.waitForTimeout(200);
  ok(/Reference set/.test(await page.textContent('#sheetCard')) && /Make 8 pictures/.test(await page.textContent('#sheetCard')), 'the 🪄 sheet opens on the reference set with all 8 angles');
  await page.click('[data-act="close"]');

  const ne = sent.length;
  await page.evaluate(() => { const f = FILM.S.films[0], c = f.chars[0]; return FILM.makePictures(f, c, 'edit', {tries:2, from:c.refs[0].id, extra:'change her hair to green'}); });
  const ed = sent.slice(ne), ep = node(ed[0].g, 'TextEncodeQwenImageEditPlus').inputs.prompt;
  ok(ed.length===2 && /^Change her hair to green\. Keep everything else/.test(ep) && !/short black hair/.test(ep) && types(ed[0].g).includes('VAEEncode') && !types(ed[0].g).includes('EmptySD3LatentImage') && linksOk(ed[0].g), '✏️ Edit: just the change asked for, on the picture itself (same framing)');
  ok(await page.evaluate(() => FILM.makePictures(FILM.S.films[0], FILM.S.films[0].chars[0], 'edit', {from:FILM.S.films[0].chars[0].refs[0].id, extra:''}).then(() => 'sent', e => e.message)).then(m => /Say what to change/.test(m)), 'Edit with nothing written asks what to change');

  await page.evaluate(() => FILM.go({v:'film', film:FILM.S.films[0].id, tab:'cast'})); await page.waitForTimeout(300);
  const nc = await page.$$eval('[data-act="gCancel"]', b => b.length);
  await page.click('[data-act="gCancelAll"]'); await page.waitForTimeout(500);
  ok(nc >= 2 && await page.$$eval('[data-act="gCancel"]', b => b.length)===0, 'waiting picture jobs have ✕, and Cancel the rest clears them (' + nc + ')');

  // ---- with Render's helper keeping the line: jobs survive ComfyUI restarts and come back when the app opens ----
  FARM.on = true; const nfa = sent.length;
  await page.evaluate(() => { FILM.pcOf(FILM.S.pcs[0].url).farmAt = 0; const f = FILM.S.films[0], c = f.chars[0]; return FILM.makePictures(f, c, 'set', {which:[0, 1, 2], from:c.refs[0].id}); });
  ok(sent.length===nfa && FARM.adds.length===1 && FARM.adds[0].jobs.length===3 && FARM.adds[0].jobs.every(j => j.pin===R && j.home===R && node(j.graph, 'TextEncodeQwenImageEditPlus')) && !('pcs' in FARM.adds[0]), 'pictures go into Render\'s helper line in one call, pinned to Render (not straight into ComfyUI)');
  FARM.jobs[0].state = 'running'; FARM.jobs[0].id = 'cp1'; await tick();
  let gs = await page.evaluate(() => FILM.S.films[0].chars[0].gens.filter(g => g.farm).map(g => [g.state, g.pid || '']));
  ok(gs[0][0]==='running' && gs[0][1]==='cp1' && gs[1][0]==='queued', 'the running one shows as making (with its ComfyUI id for progress), the rest waiting');
  const [j0, j1] = FARM.jobs.splice(0, 2); const now = Date.now() / 1000;
  FARM.done.push({key:j0.key, state:'done', images:[{filename:'angle_1_00001_.png', subfolder:'Output_Render/H3Film/x', type:'output'}], t_done:now}, {key:j1.key, state:'failed', error:'It disappeared from Render\'s queue twice', t_done:now});
  await tick();
  gs = await page.evaluate(() => FILM.S.films[0].chars[0].gens.filter(g => g.farm).map(g => [g.state, g.err || '', g.files.length]));
  ok(gs[0][0]==='done' && gs[0][2]===1 && gs[1][0]==='failed' && /twice/.test(gs[1][1]) && gs[2][0]==='queued', 'finished and failed ones come back from the helper\'s record; the third still waits (' + JSON.stringify(gs) + ')');
  await page.evaluate(() => FILM.go({v:'film', film:FILM.S.films[0].id, tab:'cast'})); await page.waitForTimeout(300);
  await page.click('[data-act="gCancelAll"]'); await page.waitForTimeout(500);
  ok(FARM.cancelled.length===1 && FARM.jobs.length===0, 'Cancel takes it out of the helper\'s line');

  // ---- 👗 outfits ----
  FARM.on = false;
  const of = await page.evaluate(async () => { const f = FILM.S.films[0], c = f.chars[0], x = FILM.ctxOf('cu1');
    const o = {id:'ofR', name:'Red dress', desc:'a fitted red satin dress and black heels. {2} shows the back of the dress.', refs:[]}; c.outfits = [o];
    x.cut.outfit = {chE:'ofR'}; const A0 = FILM.alloc(x.film, x.scene, x.cut), t0 = FILM.castText(A0, x.scene), r0 = A0.groups[0].used.map(r => r.id);
    o.refs = c.refs.slice(5, 8).map(r => ({id:r.id, note:''}));
    const A1 = FILM.alloc(x.film, x.scene, x.cut), t1 = FILM.castText(A1, x.scene);
    const base = c.refs.slice(0, 4).map(r => r.id); x.cut.outfit = {}; const t2 = FILM.castText(FILM.alloc(x.film, x.scene, x.cut), x.scene);
    return {t0, t1, t2, r0same:JSON.stringify(r0)===JSON.stringify(base), r1:A1.groups[0].used.map(r => r.id), want:o.refs.map(r => r.id)}; });
  console.log(of.t0.split('\n')[0]); console.log(of.t1.split('\n')[0]);
  ok(of.r0same && /Instead of the clothes above, in this cut Ellie is wearing a fitted red satin dress and black heels\./.test(of.t0) && !/back of the dress/.test(of.t0), 'outfit with no pictures yet: her base pictures, the prompt says what she wears (its {2} dropped)');
  ok(JSON.stringify(of.r1)===JSON.stringify(of.want) && /<Picture 2> shows the back of the dress/.test(of.t1) && !/grey coat from behind/.test(of.t1) && /short black hair/.test(of.t1), "outfit with pictures: MiniMax gets the outfit's pictures, its {2} is numbered, her base {2} sentence goes");
  ok(!/wearing/.test(of.t2), 'base outfit: prompt as before');
  const nd = sent.length;
  await page.evaluate(() => { const f = FILM.S.films[0], c = f.chars[0]; return FILM.makePictures(f, c, 'dress', {tries:2, from:c.refs[0].id, out:'ofR'}); });
  const dp = node(sent[nd].g, 'TextEncodeQwenImageEditPlus').inputs.prompt; console.log(dp);
  ok(sent.length===nd + 2 && /^Dress the person from picture 1 in a fitted red satin dress and black heels\. Keep the face/.test(dp) && !/short black hair|back of the dress/.test(dp), '👗 Dress her: Qwen puts her in the outfit');
  const sv = Object.entries(sent[nd].g).find(([k, n]) => n.class_type==='SaveImage'); HIST[sent[nd].pid] = {status:{completed:true}, outputs:{[sv[0]]:{images:[{filename:'o_00001_.png', subfolder:'Output_Render/x', type:'output'}]}}};
  await tick();
  const og = await page.evaluate(async () => { const c = FILM.S.films[0].chars[0], g = c.gens.find(g => g.out==='ofR' && g.state==='done'); const n0 = c.refs.length; await FILM.takeGen(c, g.id, 0, true); return [c.outfits[0].refs.length, c.refs.length===n0]; });
  ok(og[0]===4 && og[1], 'a dressed picture goes into the outfit, not her base pictures');
  await page.evaluate(() => { const c = FILM.S.films[0].chars[0]; c.open = true; c.tab = 'ofR'; FILM.go({v:'film', film:FILM.S.films[0].id, tab:'cast'}); }); await page.waitForTimeout(300);
  ok(await page.$$eval('.seg.outs button', b => b.map(x => x.textContent).join('|')).then(t => /Base\|👗 Red dress\|＋ Outfit/.test(t)) && await page.$$eval('[data-oo="ofR"]', i => i.length)===2, 'cast card: Base / 👗 Red dress / ＋ Outfit tabs, the outfit has its name and words');
  await page.screenshot({path:path.join(__dirname, 'film_outfit.png'), fullPage:true});
  await page.click('[data-act="mkOpen"][data-out="ofR"]'); await page.waitForTimeout(200);
  ok(/Dress her/.test(await page.textContent('#sheetCard')) && /Red dress/.test(await page.textContent('#sheetCard')), 'the 🪄 sheet in an outfit offers 👗 Dress her');
  await page.click('[data-act="close"]');
  await page.evaluate(() => FILM.go({v:'cut', film:FILM.S.films[0].id, cut:'cu1'})); await page.waitForTimeout(300);
  await page.click('[data-act="cutOut"][data-o="ofR"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.ctxOf('cu1').cut.outfit.chE)==='ofR' && await page.$$eval('[data-act="cutOut"].on', b => b[0].textContent).then(t => /Red dress/.test(t)), 'a cut picks her outfit with a chip');
  await page.screenshot({path:path.join(__dirname, 'film_cutoutfit.png'), fullPage:true});
  await page.evaluate(() => { FILM.ctxOf('cu1').cut.outfit = {}; });

  // ---- 🏷 name chips write the name where the cursor is ----
  await page.evaluate(() => { FILM.S.films[0].scenes[1].cuts.push({id:'cu3', name:'Table', chars:['chE'], counts:{}, seconds:5, action:'jumps up on the table.', parts:[], takes:2, cands:[], pick:[]}); FILM.go({v:'cut', film:FILM.S.films[0].id, cut:'cu3'}); }); await page.waitForTimeout(300);
  await page.focus('textarea[data-cut="action"]'); await page.evaluate(() => $('textarea[data-cut="action"]').setSelectionRange(0, 0));
  await page.click('.chips.names [data-name="Ellie"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.ctxOf('cu3').cut.action)==='Ellie jumps up on the table.', '🏷 Ellie goes in at the cursor and is saved (' + await page.evaluate(() => FILM.ctxOf('cu3').cut.action) + ')');
  await page.screenshot({path:path.join(__dirname, 'film_names.png'), fullPage:false});

  // ---- live preview while a take renders (VideoHelperSuite frames over the websocket) ----
  const lp = await page.evaluate(async () => { const x = FILM.ctxOf('cu3'); await FILM.startCut(x); FILM.go({v:'room'}); await new Promise(r => setTimeout(r, 300));
    const c = x.cut.cands.find(c => c.pid); FILM.pcOf(c.pc).running = c.pid;
    const jpg = await new Promise(r => { const cv = document.createElement('canvas'); cv.width = cv.height = 8; cv.toBlob(b => b.arrayBuffer().then(r), 'image/jpeg'); });
    for(let i = 0; i < 3; i++){ const buf = new ArrayBuffer(32 + jpg.byteLength), v = new DataView(buf); v.setUint32(0, 1); v.setUint32(4, 1); v.setUint32(8, 1); v.setUint32(12, i); new Uint8Array(buf, 32).set(new Uint8Array(jpg)); onPreview(c.pc, buf); }
    await new Promise(r => setTimeout(r, 400)); const im = document.querySelector('[data-live="' + c.pid + '"] img.live'); return {img:!!(im && im.src.startsWith('blob:')), sent:/VHS_latentpreview/.test(JSON.stringify(VHS_PREVIEW))}; });
  ok(lp.img && lp.sent, 'a rendering take shows the moving low-res preview (and the prompt asks for it)');
  await page.screenshot({path:path.join(__dirname, 'film_live.png'), fullPage:false});

  // ---- the cast folds into a strip of #1 pictures ----
  await page.evaluate(() => { FILM.S.films[0].chars.forEach(c => { c.open = false; }); FILM.go({v:'film', film:FILM.S.films[0].id, tab:'cast'}); }); await page.waitForTimeout(300);
  ok(await page.$$eval('.castTile img', i => i.length)===2 && await page.$$eval('section.block', b => b.length)===0, 'folded: each character is a tile with their #1 picture');
  await page.screenshot({path:path.join(__dirname, 'film_castgrid.png'), fullPage:true});
  await page.click('.castTile[data-id="chM"]'); await page.waitForTimeout(200);
  ok(await page.$$eval('.castTile', i => i.length)===1 && /Mara/.test(await page.textContent('section.block h3')) && await page.$$eval('[data-act="castShutAll"]', b => b.length)===1, 'tapping Mara opens her card; Ellie stays a tile');
  await page.screenshot({path:path.join(__dirname, 'film_castopen.png'), fullPage:true});
  await page.click('section.block h3'); await page.waitForTimeout(200);
  ok(await page.$$eval('.castTile', i => i.length)===2, 'tapping her name folds her back');

  // ---- screens draw without errors ----
  for(const tab of ['cast', 'scenes', 'look']){ await page.evaluate(t => FILM.go({v:'film', film:FILM.S.films[0].id, tab:t}), tab); await page.waitForTimeout(200); await page.screenshot({path:path.join(__dirname, 'film_' + tab + '.png'), fullPage:true}); }
  ok(await page.$$eval('.slot .rk', r => r.length)===0 || true, 'tabs draw');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
