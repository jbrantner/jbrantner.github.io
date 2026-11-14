// H3 Deck 🧵 seams in one job send every reference the bridges use (2026-11-14: a character's 🥋 move video was never sent,
// so ComfyUI said "LoadVideo.validate_inputs() missing 1 required positional argument: file"). Run: NODE_PATH=$(npm root -g) node tests/t_seamrefs.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8048);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const PCS = {[M]:{name:'Main', line:[], run:false, dels:[], n:0, hist:{}, sent:[]}}; let ints = [];
  await page.route(M + '/**', async rt => { const P = PCS[M], u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(rt.request().method()==='OPTIONS') return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*'}, body:''});
    if(p==='/system_stats') return J({devices:[]});
    if(p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue' && rt.request().method()==='POST'){ const b = JSON.parse(rt.request().postData() || '{}'); if(b.delete){ P.dels.push(...b.delete); P.line = P.line.filter(id => !b.delete.includes(id)); } return J({}); }
    if(p==='/queue'){ const run = P.run && P.line.length ? [[0, P.line[0]]] : []; return J({queue_running:run, queue_pending:P.line.slice(run.length).map((id, i) => [i + 1, id])}); }
    if(p==='/interrupt'){ ints.push(JSON.parse(rt.request().postData() || '{}').prompt_id); return J({}); }
    if(p==='/free') return J({});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Main', images:[]});
    if(p==='/prompt'){ const pid = 'M' + (++P.n); P.line.push(pid); P.sent.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:pid}); }
    if(p.startsWith('/history/')){ const id = p.slice(9); return J(P.hist[id] ? {[id]:P.hist[id]} : {}); }
    if(p.startsWith('/view')) return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(m => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Main', url:m, on:true, speed:1}]; }, M);
  await page.goto('http://127.0.0.1:8048/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  await page.evaluate(() => { Object.assign(H3.S.f, {prompt:'<Subject 1> dances.', seconds:5, takes:1, seed:''}); H3.drawAll(); });
  await page.click('#goBtn'); await page.waitForTimeout(2500);
  // Laura has a 🥋 move from the Library with its own video; a 🧵 seam join of two clips whose words name her
  const R = await page.evaluate(async () => { const S = H3.S, t0 = S.takes[0];
    S.media.mPic = {kind:'img', name:'laura.png', remote:'h3deck/laura.png'}; S.media.mMove = {kind:'vid', name:'twirl.mp4', remote:'h3deck/twirl.mp4'};
    S.lib = (S.lib || []).concat([{id:'Lm1', kind:'act', name:'Twirl', vid:'mMove', pics:[]}]);
    const cast = [{n:1, kind:'char', who:'Laura', pics:['mPic'], keep:'exact', acts:[{id:'Lm1'}]}]; S.cast = cast; S.casts = S.casts || {}; S.casts[t0.film || S.fkey] = cast;
    const t = JSON.parse(JSON.stringify(t0)); Object.assign(t, {id:'tSeam', state:'new', prompt:'[0s-5s] <Subject 1> dances.\n[5s-10s] <Subject 1> twirls.', film:t0.film || S.fkey, imgs:[], vids:[],
      combo:{parts:[{file:'H3Deck/a.mp4 [output]', in:0, out:5, w:t0.w, h:t0.h}, {file:'H3Deck/b.mp4 [output]', in:0, out:5, w:t0.w, h:t0.h}], seam:{one:true, frames:[120], qw:''}}, pieces:[{state:'new', start:0, gen:240, deliv:240, ctx:0}]});
    S.takes.unshift(t); let err = ''; try{ await H3.sendPieces(t, 0); }catch(e){ err = e.message; } return {err, used:H3.castTake(t, true).vids.map(v => v.id)}; });
  const G = PCS[M].sent[PCS[M].sent.length - 1] || {}, LV = Object.values(G).filter(n => n.class_type==='LoadVideo').map(n => n.inputs.file);
  console.log(JSON.stringify(R), LV);
  ok(R.used.includes('mMove'), 'the bridge uses Laura\'s move video');
  ok(!R.err && LV.length===3 && LV.every(f => typeof f==='string' && f) && LV.includes('h3deck/twirl.mp4'), 'the seam job is sent with every video named: ' + JSON.stringify(LV));
  // a graph with a video that was never sent says so plainly instead of ComfyUI's riddle
  const E = await page.evaluate(async () => { try{ await H3.queueGraph('http://main.test', {g:{1:{class_type:'LoadVideo', inputs:{}}}}); return ''; }catch(e){ return e.message; } });
  ok(/video for node 1 was never sent to Main/.test(E), 'a missing video is caught before sending: ' + E);
  // "The scene keeps carrying on from the moment before." is never cut down to "The scene keeps."
  // "The scene keeps carrying on from the moment before." is never cut down to "The scene keeps."
  await page.goto('http://127.0.0.1:8048/film/index.html'); await page.waitForFunction(() => window.FILM && FILM.untime, null, {timeout:20000});
  const UT = await page.evaluate(() => FILM.untime('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] the milk swirls. <Action 6>'));
  ok(UT==='the milk swirls. <Action 6>', 'the carry-on lead-in is dropped whole when the words are re-timed: ' + JSON.stringify(UT));
  ok(await page.evaluate(() => FILM.untime('[0s-1s] She turns, carrying on from the moment before.\n[1s-] She walks.'))==='She turns. She walks.', 'the older lead-in style still reads as before');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
