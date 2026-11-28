// 🌙 Reel keeps going with the phone away (Jordan 2026-11-28: "Can we make sure it runs even when my phone is off?"): the phone leaves a copy on
// Render and holds; Render's hidden copy (H3 Deck ?worker=1 → reelw/) becomes Reel and carries on; back on the phone, the copy comes back. Fake PCs.
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_away.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'glow.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  ImageBatch:{input:{required:{image1:['IMAGE'], image2:['IMAGE']}}},
};
const OTHER = ['ColorMatch','ConditioningSetTimestepRange','ConditioningCombine','MiniMaxH3ReferenceToVideo','NAGGuiderMiniMaxH3','CLIPTextEncode','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale',
  'BboxDetectorSEGS','UltralyticsDetectorProvider','SplitSigmas','DisableNoise','SegsToCombinedMask','MaskToImage','PreviewImage','Video Slice','ImageFromBatch','TrimAudioDuration','VAEEncode','LTXVSeparateAVLatent','LTXVConcatAVLatent','ManualSigmas'];
const nodes = (g, t) => Object.values(g).filter(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8053);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}, deviceScaleFactor:2}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], faces = [];
  const MASK = (() => { const zlib = require('zlib'), W = 64, rows = []; for(let y = 0; y < W; y++){ const r = Buffer.alloc(W + 1); for(let x = 0; x < W; x++) r[x + 1] = (x >= 20 && x <= 35 && y >= 4 && y <= 19) ? 255 : 0; rows.push(r); }
    const crc = b => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for(const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const h = Buffer.alloc(13); h.writeUInt32BE(W, 0); h.writeUInt32BE(W, 4); h[8] = 8; h[9] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', h), ch('IDAT', zlib.deflateSync(Buffer.concat(rows))), ch('IEND', Buffer.alloc(0))]); })();
  const exps = [], drops = [], dels = []; let OLD = false;
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    // 🙂 the face finder: a 64x64 mask with the face box at x 20-35, y 4-19
    if(p==='/object_info/UltralyticsDetectorProvider') return J({UltralyticsDetectorProvider:{input:{required:{model_name:[['bbox/hand_yolov8s.pt', 'bbox/face_yolov8m.pt']]}}}});
    if(p==='/prompt' && /BboxDetectorSEGS/.test(rt.request().postData() || '')){ const g = JSON.parse(rt.request().postData()).prompt; faces.push(g); return J({prompt_id:'face' + faces.length}); }
    if(p.startsWith('/history/face')){ const id = p.slice(9); return J({[id]:{status:{completed:true, status_str:'success'}, outputs:{6:{images:[{filename:'m.png', subfolder:'', type:'temp'}]}}}}); }
    if(p==='/view' && u.searchParams.get('type')==='temp') return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:MASK});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')){ if(rt.request().method()!=='GET') sent.push({userdata:p}); return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({}); }
    if(p.startsWith('/renderdeck/h3run')){ sent.push({run:p}); return J({}); }
    if(p==='/renderdeck/h3export'){ if(rt.request().method()==='POST'){ exps.push(Object.assign(JSON.parse(rt.request().postData()), {_host:u.origin})); return J({id:'ex1', state:'working'}); } return J({id:'ex1', state:'done', done:10, total:10, file:{filename:'reel_ex1.mp4', subfolder:'H3Film/reel', type:'output'}}); }
    if(p==='/renderdeck/h3drop'){ drops.push(Object.assign(JSON.parse(rt.request().postData()), {_host:u.origin})); return OLD ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({dropped:1}); }
    if(p==='/renderdeck/delete'){ dels.push(JSON.parse(rt.request().postData())); return J({moved:1}); }
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)});
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.png', subfolder:'h3deck', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  const UD = {}, beats = [], byes = []; let RUN = {want:false, wid:'', worker:false, go:true};
  const root2 = path.join(__dirname, '..', '..');
  const fake2 = async rt => { const q = rt.request(), u = new URL(q.url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(/^\/userdata\/h3(reel|deck)_run\.json$/.test(p)){ const k = p.slice(10); if(q.method()==='POST'){ UD[k] = q.postData(); return J({}); } return UD[k] ? rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:UD[k]}) : rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); }
    if(p==='/renderdeck/h3run/beat'){ const b = JSON.parse(q.postData()); beats.push(b); if(b.who==='worker'){ RUN.wid = RUN.wid || b.wid; return J({go:RUN.go}); } RUN.want = b.want; return J({ok:true, worker:RUN.worker}); }
    if(p==='/renderdeck/h3run/bye'){ byes.push(Object.assign(JSON.parse(q.postData()), {_f:(() => { try{ return q.frame().url(); }catch(e){ return '?'; } })()})); RUN.worker = false; return J({ok:true}); }
    if(p==='/renderdeck/h3run') return J({h3run:1, worker:RUN.worker, want:RUN.want});
    if(p.startsWith('/renderdeck/h3app/')){ let t = p.slice(18); if(t==='' || t.endsWith('/')) t += 'index.html'; const f = path.join(root2, 'h3-a875336252cb', t);
      return fs.existsSync(f) ? rt.fulfill({status:200, contentType:/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream', body:fs.readFileSync(f)}) : rt.fulfill({status:404, body:''}); }
    return fake(rt); };
  await page.route(R + '/**', fake2); await page.route('http://main.test/**', fake);
  // H3 Deck's own save: a Library character and its picture, one take of its own, the PCs
  const PNG = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true, qtext:'Soft film grain and gentle handheld sway.', negOn:true, neg:'blurry hands', h3Style:'A quiet indie film.'}, takes:[{id:'tDeck', t:1, state:'done', prompt:'H3 Deck take', pieces:[], imgs:[], vids:[], auds:[], follow:[]}],
    lib:[{id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}, {id:'Lpip', kind:'char', name:'Pip', stand:'cat girl', desc:'an anthro cat with orange fur', pics:['mPic'], keep:'exact', what:'', art:'3d'}, {id:'Lfrk', kind:'attr', name:'Freckles', stand:'', desc:'light freckles', pics:[], keep:'exact', what:''}, {id:'Lglow', kind:'lora', name:'Glow', stand:'', desc:'', pics:[], keep:'exact', what:'soft glow light', loras:[{name:'glow.safetensors', str:0.8}]}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png', w:180, h:180, thumb:'data:image/png;base64,' + PNG}, mOld:{id:'mOld', kind:'img', name:'old.png', type:'image/png'}}, up:{['mPic|' + R]:'h3deck/h3deck_mPic.png'}};
  await page.addInitScript(([deck, r]) => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(deck)); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, [DECK, R]);
  // the picture in IndexedDB (shared by both apps)
  await page.goto('http://127.0.0.1:8053/reel-5b1e7c94d2a0/');
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:30000});

  await page.waitForTimeout(800);
  const eng = page.frames().find(f => /engine=1/.test(f.url()));
  const mk = async w => page.evaluate(async w => { const E = REEL.E(), r = await E.make({words:w, who:['Lmia'], secs:3, n:1}); const c = REEL.addClip(REEL.clips().length, {kind:'new', words:w}); c.takes = r.ids.slice(); c.pick = r.ids[0]; return r.ids[0]; }, w);
  const id = await mk('Mia walks to the door');
  await eng.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); t.pieces[0].state = 'running'; }, id);
  ok(await page.evaluate(() => REEL.reelWork()), 'a rendering option counts as work still going');
  await page.waitForTimeout(16000);
  ok(beats.some(b => b.who==='phone' && b.want && b.farm===R), 'the phone tells Render it is here, with work going (' + JSON.stringify(beats.slice(-1)) + ')');
  // into the background
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => true}); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1500);
  const run = UD['h3reel_run.json'] && JSON.parse(UD['h3reel_run.json']);
  ok(run && run.by==='phone' && run.ls && run.ls.h3reel && run.ls.h3reel_engine && run.ls.h3deck && JSON.parse(run.ls.h3reel_engine).takes.some(t => t.id===id), 'going away, the phone leaves Render a copy of the reels, the takes and the Library');
  ok(beats.some(b => b.who==='phone' && b.away && b.want), 'and says it is going away with work left');
  ok(await page.evaluate(() => REEL.RHOLD()) && await eng.evaluate(() => H3.HOLD_()), 'the phone holds (Reel and its engine) while it is away');
  // Render's hidden copy
  RUN.worker = true;
  const wctx = await br.newContext({viewport:{width:390, height:844}}), wp = await wctx.newPage();
  wp.on('pageerror', e => { console.log('WORKER PAGE ERROR', e.message); });
  await wp.route(R + '/**', fake2); await wp.route('http://main.test/**', fake);
  await wp.route('https://jbrantner.github.io/reel-5b1e7c94d2a0/**', rt => rt.fulfill({status:200, contentType:'text/html', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(path.join(root2, 'reel-5b1e7c94d2a0', 'index.html'))}));
  await wp.goto(R + '/renderdeck/h3app/?worker=1&wid=w1');
  await wp.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:40000});
  ok(/\/renderdeck\/h3app\/reelw\/\?wid=w1/.test(wp.url()) && await wp.evaluate(() => window.REEL_WORKER==='w1'), 'the hidden copy on Render becomes Reel (' + wp.url() + ')');
  const wst = await wp.evaluate(id => ({clips:REEL.clips().length, info:REEL.info(id).state}), id);
  ok(wst.clips===1 && wst.info==='working', 'it has the phone\'s reel and its rendering option (' + JSON.stringify(wst) + ')');
  const weng = wp.frames().find(f => /engine=1/.test(f.url()));
  ok(weng && /\/renderdeck\/h3app\/\?engine=1/.test(weng.url()) && !(await weng.evaluate(() => H3.HOLD_())), 'with H3 Deck from Render as its engine, following the takes');
  // the take finishes on Render while the phone is away; the hidden copy notices and carries the reel on
  await weng.evaluate(id => { const t = H3.S.takes.find(x => x.id===id); t.state = 'done'; t.pieces.forEach(p => { p.state = 'done'; p.file = {filename:'ok_00001_.webm', subfolder:'Output_Render/' + t.dir, type:'output'}; }); t.final = t.pieces[0].file; H3.saveNow(); }, id);
  await wp.evaluate(() => { REEL.R().name = 'Changed on Render'; });
  await wp.waitForTimeout(6500);
  ok(beats.some(b => b.who==='worker' && b.wid==='w1'), 'it checks in with Render\'s helper');
  ok(!beats.some(b => b.who==='worker' && b.wid!=='w1') && !(await weng.evaluate(() => H3.HOLD_())), 'only Reel checks in (its engine doesn\'t, so it is never told to stop) and the engine keeps following the takes');
  // the phone comes back: the hidden copy is told to stop, saves and says bye
  RUN.go = false; await wp.waitForTimeout(6500);
  const run2 = UD['h3reel_run.json'] && JSON.parse(UD['h3reel_run.json']);
  ok(byes.length===1 && run2.by==='worker' && JSON.parse(run2.ls.h3reel).reels.some(r => r.name==='Changed on Render'), 'told to stop, it leaves its copy and says bye (' + JSON.stringify({byes, by:run2 && run2.by}) + ')');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => false}); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:40000}); await page.waitForTimeout(1500);
  const back = await page.evaluate(id => ({name:REEL.R().name, st:REEL.info(id).state, hold:REEL.RHOLD()}), id);
  ok(back.name==='Changed on Render' && back.st==='done' && !back.hold, 'back on the phone, it takes Render\'s copy over: the finished option and the change (' + JSON.stringify(back) + ')');
  // nothing going: going away doesn't hold or leave a copy
  delete UD['h3reel_run.json'];
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => true}); document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(1000);
  ok(!UD['h3reel_run.json'] && !(await page.evaluate(() => REEL.RHOLD())), 'with nothing going, going away leaves things as they are');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
