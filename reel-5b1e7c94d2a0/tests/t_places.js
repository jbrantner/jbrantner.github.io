// 🏞 Reel (Jordan 2026-11-28): Library places in a reel. Harness from t_firstlast.js, fake PCs. A place is listed under 🏞 Places, goes in the reel,
// is tapped into the words, and is sent the way H3 Deck sends a 🏞 Place (its pictures, "the setting, its layout, light and colours ... are kept").
// Run: CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_places.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', CLIP = process.env.CLIP;
if(!CLIP || !fs.existsSync(CLIP)){ console.log('set CLIP to a short video'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-Turbo-V2.safetensors', 'DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'singularityV2X10eros_prismPIKA.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['minimax_h3_ref2v_turbo_4step.safetensors', 'glow.safetensors', 'minimax_h3_anime_style.safetensors']], strength_model:['FLOAT', {default:1}]}}},
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}, deviceScaleFactor:2}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const sent = [], faces = [];
  const MASK = (() => { const zlib = require('zlib'), W = 64, rows = []; for(let y = 0; y < W; y++){ const r = Buffer.alloc(W + 1); for(let x = 0; x < W; x++) r[x + 1] = (x >= 20 && x <= 35 && y >= 4 && y <= 19) ? 255 : 0; rows.push(r); }
    const crc = b => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for(const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const h = Buffer.alloc(13); h.writeUInt32BE(W, 0); h.writeUInt32BE(W, 4); h[8] = 8; h[9] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', h), ch('IDAT', zlib.deflateSync(Buffer.concat(rows))), ch('IEND', Buffer.alloc(0))]); })();
  const exps = [];
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
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/webm', headers:{'Access-Control-Allow-Origin':'*'}, body:fs.readFileSync(CLIP)});
    if(p==='/upload/image') return J({name:'up_' + Date.now() + '.png', subfolder:'h3deck', type:'input'});
    if(p==='/prompt'){ const pid = 'p' + (sent.length + 1); sent.push({pid, host:u.host, g:JSON.parse(rt.request().postData()).prompt}); return J({prompt_id:pid}); }
    if(p.startsWith('/history')) return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route('http://main.test/**', fake);
  // H3 Deck's own save: a Library character and its picture, one take of its own, the PCs
  const PNG = fs.readFileSync(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-180.png')).toString('base64');
  const DECK = {pcs:[{name:'Render', url:R, on:true, speed:1}], f:{model:'', aspect:'16:9', mp:0.41, turbo:true, qtext:'Soft film grain and gentle handheld sway.', negOn:true, neg:'blurry hands', h3Style:'A quiet indie film.'}, takes:[{id:'tDeck', t:1, state:'done', prompt:'H3 Deck take', pieces:[], imgs:[], vids:[], auds:[], follow:[]}],
    lib:[{id:'Lroof', kind:'place', name:'The rooftop bar', stand:'a place', desc:'a rooftop bar at night with string lights', pics:['mPic'], keep:'exact', what:''}, {id:'Lmia', kind:'char', name:'Mia', stand:'woman', desc:'red hair', pics:['mPic'], keep:'exact', what:''}, {id:'Lpip', kind:'char', name:'Pip', stand:'cat girl', desc:'an anthro cat with orange fur', pics:['mPic'], keep:'exact', what:'', art:'3d'}, {id:'Lfrk', kind:'attr', name:'Freckles', stand:'', desc:'light freckles', pics:[], keep:'exact', what:''}, {id:'Lglow', kind:'lora', name:'Glow', stand:'', desc:'', pics:[], keep:'exact', what:'soft glow light', loras:[{name:'glow.safetensors', str:0.8}]}], media:{mPic:{id:'mPic', kind:'img', name:'mia.png', type:'image/png', w:180, h:180, thumb:'data:image/png;base64,' + PNG}, mOld:{id:'mOld', kind:'img', name:'old.png', type:'image/png'}}, up:{['mPic|' + R]:'h3deck/h3deck_mPic.png'}};
  await page.addInitScript(([deck, r]) => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(deck)); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, [DECK, R]);
  // the picture in IndexedDB (shared by both apps)
  await page.goto('http://127.0.0.1:8047/reel-5b1e7c94d2a0/');
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().ready(), null, {timeout:30000});
  await page.waitForTimeout(800);
  const eng = page.frames().find(f => /engine=1/.test(f.url()));
  ok(!!eng, 'H3 Deck runs hidden as the engine');
  const iso = await eng.evaluate(() => ({key:Object.keys(localStorage), deckTakes:H3.S.takes.length, lib:H3.S.lib.map(L => L.name), media:Object.keys(H3.S.media), tab:H3.S.tab, films:!!document.querySelector('#filmTab iframe')}));
  ok(iso.deckTakes===0 && iso.lib.join()==='The rooftop bar,Mia,Pip,Freckles,Glow' && iso.media.join()==='mPic' && iso.tab==='lib' && !iso.films, 'the engine has its own takes (none of H3 Deck\'s), H3 Deck\'s Library and only its pictures, and no Films frame (' + JSON.stringify(iso) + ')');
  ok(await page.evaluate(() => /Make your first clip/.test(document.querySelector('#vmsg').textContent)), 'an empty reel asks for the first clip');
  // 📚 the place has its own 🏞 Places row, not mixed in with the characters
  await page.click('#tabs [data-tab="lib"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => /The rooftop bar/.test(document.querySelector('#libPlace').textContent) && !/The rooftop bar/.test(document.querySelector('#libAll').textContent) && /Mia/.test(document.querySelector('#libAll').textContent)), '🏞 H3 Deck\'s place is under Places, not under All characters');
  await page.click('#libPlace [data-ch="Lroof"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => /🏞 The rooftop bar/.test(document.querySelector('#card h3').textContent) && /Put it in this reel/.test(document.querySelector('#chIn').textContent) && !document.querySelector('#chA')), 'its card is worded for a place, with no ✨👗 row');
  await page.click('#chIn'); await page.waitForTimeout(300);
  await page.click('#libAll [data-ch="Lmia"]'); await page.waitForTimeout(200); await page.click('#chIn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => REEL.R().cast.includes('Lroof') && REEL.R().cast.includes('Lmia')), 'the place and Mia are in this reel');
  // ＋ New place made in Reel
  await page.click('#libPlace [data-ch="new:place"]'); await page.waitForTimeout(200); await page.fill('#chN', 'The beach');
  ok(await page.evaluate(() => /New place/.test(document.querySelector('#card h3').textContent)), '＋ New place opens a place card');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#chAdd')]); await fc.setFiles(path.join(root, 'reel-5b1e7c94d2a0', 'icon-violet-192.png')); await page.waitForTimeout(300);
  await page.click('#chGo'); await page.waitForTimeout(1200);
  const bz = await page.evaluate(() => { const z = REEL.E().lib().find(x => x.name==='The beach'); return z && {kind:z.kind, pics:z.pics.length, inReel:REEL.R().cast.includes(z.id), row:/The beach/.test(document.querySelector('#libPlace').textContent)}; });
  ok(bz && bz.kind==='place' && bz.pics===1 && bz.inReel && bz.row, '＋ New place makes a place with its picture, in this reel (' + JSON.stringify(bz) + ')');
  await page.evaluate(() => { const z = REEL.E().lib().find(x => x.name==='The beach'); REEL.R().cast = REEL.R().cast.filter(x => x!==z.id); });
  await page.click('#tabs [data-tab="reel"]'); await page.waitForTimeout(300);
  // ✍ a clip in the place
  await page.click('[data-act="make"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => /🏞 The rooftop bar/.test((document.querySelector('#who [data-w="Lroof"]') || {}).textContent || '')), '👥 the place is tappable under the words, marked 🏞');
  await page.fill('#mkW', 'Mia sips a drink at the counter in'); await page.click('#who [data-w="Lroof"]');
  ok(/in The rooftop bar $/.test(await page.inputValue('#mkW')), 'tapping it puts the place in the words');
  let n0 = sent.filter(x => x.g).length; await page.click('#mkGo'); await page.waitForTimeout(3000);
  const gs = sent.filter(x => x.g).slice(n0); ok(gs.length >= 1, 'the clip is sent (' + gs.length + ')');
  if(gs[0]){ const g = gs[0].g, r = nodes(g, 'MiniMaxH3ReferenceToVideo')[0], p = r ? r.inputs.prompt : '';
    const body = p.slice(p.lastIndexOf('[Shot 1]'));
    ok(/<Subject 1> is The rooftop bar, as shown in <Picture \d+>/.test(p) && /<Subject 2> is Mia/.test(p) && /<Subject 2> sips a drink at the counter in <Subject 1>/.test(body), 'Mia and the place are both subjects, the place named where it was tapped (' + body.slice(0, 160) + ')');
    ok(/the setting, its layout, light and colours from <Picture \d+> are kept/.test(p), 'the place is sent the H3 Deck way: its setting, layout, light and colours kept');
    ok(/A rooftop bar at night with string lights\./.test(p), 'its own words go with its picture');
    ok(nodes(g, 'LoadImage').length >= 2, 'its picture goes along with Mia\'s'); }
  // 🏞 picked but not named (engine): "The scene takes place in <Subject n>."
  n0 = sent.filter(x => x.g).length; await page.evaluate(() => REEL.E().make({words:'Mia dances slowly', who:['Lmia', 'Lroof'], n:1})); await page.waitForTimeout(3000);
  { const g = (sent.filter(x => x.g).slice(n0)[0] || {}).g, r = g && nodes(g, 'MiniMaxH3ReferenceToVideo')[0], p = r ? r.inputs.prompt : '', body = p.slice(p.lastIndexOf('[Shot 1]'));
    ok(/dances slowly\. The scene takes place in <Subject \d>\./.test(body) && !/<Subject \d> is in the scene/.test(body.replace(/<Subject \d> is in the scene\. (?=<Subject)/, '')) && /the setting, its layout/.test(p), 'a place picked but not named is where it happens ("The scene takes place in …"), not "is in the scene" (' + body.slice(0, 200) + ')'); }
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
