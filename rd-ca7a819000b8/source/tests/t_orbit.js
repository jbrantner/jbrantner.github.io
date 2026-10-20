// 📷 Change angle: under a render, pick one of 8 arrows; MiniMax H3 FL2V (Turbo 8-step) pins the picture as the first
// frame and swings the camera round; slide to a frame and Finish redraws it with Illustrious at 0.2 while ControlNet
// (ProMax, anime line art) holds it. Hidden saves into Hidden folders. Without an FL2V model it uses the hybrid Turbo.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const VID = fs.readFileSync(path.join(__dirname, 'fixtures', 'turn.webm'));
const RENDER = 'https://jordo-desktop.test';
const C = a => [a];
const DEF = {
  LoadImage:[['image'],2], UNETLoader:[['unet_name','weight_dtype'],1], LoraLoaderModelOnly:[['model','lora_name','strength_model'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1],
  MiniMaxH3ImageToVideo:[['clip','vae','prompt','width','height','length'],2], MiniMaxH3ReferenceToVideo:[['clip','prompt','width','height','length','ref_image_size'],2], MiniMaxH3AddGuide:[['positive','latent','frame_idx'],1],
  BasicGuider:[['model','conditioning'],1], BasicScheduler:[['model','scheduler','steps','denoise'],1], KSamplerSelect:[['sampler_name'],1], RandomNoise:[['noise_seed'],1],
  SamplerCustomAdvanced:[['noise','guider','sampler','sigmas','latent_image'],2], VAEDecodeTiled:[['samples','vae','tile_size','overlap','temporal_size','temporal_overlap'],1],
  CreateVideo:[['images','fps'],1], SaveVideo:[['video','filename_prefix','format'],0],
  ImageScaleBy:[['image','upscale_method','scale_by'],1], CheckpointLoaderSimple:[['ckpt_name'],3], CLIPTextEncode:[['clip','text'],1], AnimeLineArtPreprocessor:[['image'],1],
  ControlNetLoader:[['control_net_name'],1], SetUnionControlNetType:[['control_net','type'],1], ControlNetApplyAdvanced:[['positive','negative','control_net','image','strength','start_percent','end_percent'],2],
  VAEEncode:[['pixels','vae'],1], ColorMatch:[['image_ref','image_target','method'],1], KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1], VAEDecode:[['samples','vae'],1], SaveImage:[['images','filename_prefix'],0],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
let FL = true;
const OI = () => ({CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal','simple'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:C(['minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors','minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors'].concat(FL ? ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] : [])), weight_dtype:C(['default'])}}},
  CLIPLoader:{input:{required:{clip_name:C(['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']), type:C(['stable_diffusion','minimax'])}}},
  VAELoader:{input:{required:{vae_name:C(['minimax_h3_video_vae_int8_convrot.safetensors','minimax_h3_video_vae_fp16.safetensors'])}}},
  ControlNetLoader:{input:{required:{control_net_name:C(['diffusion_pytorch_model_promax.safetensors'])}}},
  MiniMaxH3ImageToVideo:{input:{required:{}}}, MiniMaxH3ReferenceToVideo:{input:{required:{}}}, MiniMaxH3AddGuide:{input:{required:{}}}, SaveVideo:{input:{required:{}}}, SaveImage:{input:{required:{}}},
  ColorMatch:{input:{required:{method:C(['mkl','hm'])}}}, CreateVideo:{input:{required:{}}}, LoadImage:{input:{required:{}}}, AnimeLineArtPreprocessor:{input:{required:{}}}, SetUnionControlNetType:{input:{required:{}}}, ControlNetApplyAdvanced:{input:{required:{}}}});
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message+' '+(e.stack||'').split('\n').slice(0,4).join(' / '))); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  const WS = []; await page.routeWebSocket(/\.test\/ws/, ws => { WS.push(ws); });
  const sent = [], ups = [], polls = {};
  await page.route(RENDER + '/**', async r => {
    const u = new URL(r.request().url()), cors = {'Access-Control-Allow-Origin':'*'};
    if(u.pathname==='/object_info') return r.fulfill({ json:OI() });
    if(u.pathname==='/view' && /\.webm$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'video/webm', body:VID, headers:cors });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG, headers:cors });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:sent.map((s, i) => [0, 'o' + (i + 1)]).filter(x => (polls[x[1]] || 0) < 2)} });
    if(u.pathname==='/upload/image'){ ups.push(1); return r.fulfill({ json:{name:'up_' + ups.length + '.png', subfolder:'', type:'input'} }); }
    if(u.pathname==='/prompt'){ sent.push(JSON.parse(r.request().postData())); return r.fulfill({ json:{prompt_id:'o' + sent.length, number:0, node_errors:{}} }); }
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = sent[+id.slice(1) - 1].prompt, ks = Object.keys(g);
      if((polls[id] = (polls[id] || 0) + 1) < 2) return r.fulfill({ json:{} });
      const vid = ks.find(k => g[k].class_type==='SaveVideo'), img = ks.find(k => g[k].class_type==='SaveImage'), pre = g[vid || img].inputs.filename_prefix, cut = pre.lastIndexOf('/');
      const f = {filename:pre.slice(cut + 1) + '_00001_.' + (vid ? 'webm' : 'png'), subfolder:pre.slice(0, cut), type:'output'};
      return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:{[vid || img]:{images:[f]}}}} }); }
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', RENDER + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(srv => { closeSheets(); S.gallery = [{url:srv + '/view?filename=hood_00001_.png&subfolder=RenderDeck&type=output', seed:1, prompt:'', t:Date.now()}]; save(); drawStrip(); show(0); }, RENDER);
  await page.click('#resultActions [data-act="orbit"]');
  await page.waitForSelector('#orbitSheet.open .opad');
  ok(await page.$$eval('#orbitBody .opad button', b => b.length)===8 && /hood_00001_/.test(await page.getAttribute('#orbitBody .omid img', 'src')), '8 arrows round the picture');
  ok(/FL2V on .* pins this picture as the first frame/.test(await page.textContent('#orbitBody')), 'it offers the FL2V orbit on Render');
  await page.click('#orbitBody [data-obdir="up-left"]');
  ok(await page.$('#orbitBody [data-obseg="deg"]') && await page.$('#orbitBody [data-obseg="tilt"]'), 'a diagonal asks for both how far round and how far up');
  await page.click('#orbitBody [data-obseg="deg"][data-v="135"]');
  await page.click('#orbitBody [data-ob="make"]');
  await page.waitForSelector('#orbitBody video[data-ob]', {timeout:15000});
  let g = sent[0].prompt, by = c => Object.values(g).filter(n => n.class_type===c);
  ok(sent[0].client_id===await page.evaluate(() => clientId) && check(g).length===0, 'the orbit graph is valid: ' + check(g).join('; '));
  const iv = by('MiniMaxH3ImageToVideo')[0].inputs;
  ok(by('UNETLoader')[0].inputs.unet_name==='minimax_h3_fl2va_pruned_int8_convrot.safetensors' && by('LoraLoaderModelOnly')[0].inputs.lora_name==='minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'
    && by('BasicScheduler')[0].inputs.steps===8 && by('KSamplerSelect')[0].inputs.sampler_name==='res_multistep', 'FL2V model, Turbo 8-step LoRA, 8 steps, res_multistep');
  ok(g[iv.first_frame[0]].inputs.image==='up_1.png' && iv.width===576 && iv.height===576 && iv.length===124, 'the picture (sent to Render) is the first frame; a square picture gets a 576 square canvas: ' + [iv.width, iv.height]);
  ok(/135-degree arc shot to the left/.test(iv.prompt) && /cranes up/.test(iv.prompt) && /from behind their right shoulder and from a high angle/.test(iv.prompt), 'the prompt asks for the move and the end view: ' + iv.prompt.slice(0, 160));
  ok(by('SaveVideo')[0].inputs.filename_prefix==='RenderDeck/angles/orbit', 'the clip saves under RenderDeck/angles');
  await page.waitForFunction(() => document.querySelector('#orbitBody video[data-ob]')._ready, null, {timeout:9000});
  ok(await page.inputValue('#orbitBody [data-obt]')==='1000', 'the slider starts on the last frame (the new angle)');
  await page.fill('#orbitBody [data-obt]', '500'); await page.dispatchEvent('#orbitBody [data-obt]', 'input');
  await page.click('#orbitBody [data-ob="fwd"]');
  ok(Math.abs(+await page.inputValue('#orbitBody [data-obt]') - 508) <= 1, '▶ steps one frame on');
  await page.click('#orbitBody [data-ob="finish"]');
  await page.waitForFunction(() => (OB().done || []).length===1, null, {timeout:15000});
  g = sent[1].prompt;
  ok(check(g).length===0, 'the touch-up graph is valid: ' + check(g).join('; '));
  ok(by('LoadImage')[0].inputs.image==='up_2.png', 'the grabbed frame is uploaded and redrawn');
  ok(by('KSampler')[0].inputs.denoise===0.2 && by('ImageScaleBy')[0].inputs.scale_by===1.5 && by('CheckpointLoaderSimple')[0].inputs.ckpt_name==='oneObsession_v24.safetensors', 'Illustrious at 0.2, 1.5x bigger');
  ok(by('SetUnionControlNetType')[0].inputs.type==='canny/lineart/anime_lineart/mlsd' && by('ControlNetApplyAdvanced')[0].inputs.strength===0.8 && g[by('ControlNetApplyAdvanced')[0].inputs.image[0]].class_type==='AnimeLineArtPreprocessor', 'ControlNet ProMax holds the anime line art at 0.8');
  ok(by('SaveImage')[0].inputs.filename_prefix==='RenderDeck/angles/finished', 'saved under RenderDeck/angles/finished');
  { const ap = by('ControlNetApplyAdvanced'), t = ap[1] && g[g[ap[1].inputs.control_net[0]].inputs.control_net ? ap[1].inputs.control_net[0] : ''];
    ok(ap.length===2 && t && t.inputs.type==='tile' && g[ap[1].inputs.image[0]].class_type==='ImageScaleBy' && ap[1].inputs.strength===0.6, 'a tile ControlNet holds the frame\'s colours and details at 0.6');
    const cm = by('ColorMatch')[0], sv = by('SaveImage')[0];
    ok(cm && cm.inputs.method==='mkl' && g[cm.inputs.image_ref[0]].class_type==='ImageScaleBy' && g[sv.inputs.images[0]].class_type==='ColorMatch' && by('KSampler')[0].inputs.cfg===4, 'the colours are matched back to the frame (Color Match, mkl), cfg 4'); }
  ok(await page.evaluate(() => /finished_00001_.*RenderDeck\/angles/.test(decodeURIComponent(S.gallery[0].url)) && shownIdx===0), 'the new angle lands in the preview strip: ' + await page.evaluate(() => S.gallery[0].url + ' ' + shownIdx));
  // Hidden: same screen, its own picture and folders
  await page.evaluate(srv => { switchMode(); S.gallery = [{url:srv + '/view?filename=h_00001_.png&subfolder=Hidden%2Frender&type=output', seed:1, prompt:'', t:Date.now()}]; save(); drawStrip(); show(0); }, RENDER);
  await page.click('#resultActions [data-act="orbit"]');
  await page.waitForSelector('#orbitSheet.open .opad');
  ok(!(await page.$('#orbitBody video[data-ob]')) && /h_00001_/.test(await page.getAttribute('#orbitBody .omid img', 'src')), 'Hidden has its own orbit, not the normal one');
  await page.click('#orbitBody [data-obdir="down"]'); await page.click('#orbitBody [data-ob="make"]');
  await page.waitForSelector('#orbitBody video[data-ob]', {timeout:15000});
  g = sent[2].prompt;
  ok(by('SaveVideo')[0].inputs.filename_prefix==='Hidden/angles/orbit' && /crane-down/.test(by('MiniMaxH3ImageToVideo')[0].inputs.prompt) && !/arc shot/.test(by('MiniMaxH3ImageToVideo')[0].inputs.prompt), 'Hidden saves into Hidden/angles; down is a crane-down');
  ok(await page.evaluate(() => (OB().clips || []).length===1 && OB().clip.src.includes('h_00001_')), 'the orbit is kept for later');
  await page.click('#orbitBody [data-obseg="dn"][data-v="0"]'); await page.click('#orbitBody [data-ob="finish"]');
  await page.waitForFunction(() => (OB().done || []).length===1, null, {timeout:15000});
  g = sent[3].prompt;
  ok(!by('KSampler').length && by('SaveImage')[0].inputs.filename_prefix==='Hidden/angles/finished', 'Bigger only skips the redraw; Hidden/angles/finished');
  // no FL2V model: the hybrid Turbo with the picture as reference, pinned at frame 0
  FL = false; await page.evaluate(async () => { const p = pcOf(base()); p.oi = await (await fetch(base() + '/object_info')).json(); });
  ok(await page.evaluate(() => { const k = kitOrbit(), g = orbitGraph(k, 'x.png', {dir:'right', deg:90}, 576, 1024).g, n = Object.values(g), gd = n.find(x => x.class_type==='BasicGuider'), ad = g[gd.inputs.conditioning[0]];
    return !k.fl && k.steps===4 && ad.class_type==='MiniMaxH3AddGuide' && ad.inputs.frame_idx===0 && /^<Picture 1> is the first frame/.test(n.find(x => x.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt); }), 'without FL2V: hybrid Turbo, 4 steps, picture as reference pinned at frame 0');
  FL = true; await page.evaluate(async () => { const p = pcOf(base()); p.oi = await (await fetch(base() + '/object_info')).json(); });
  // 📷 Change angle as a block: in Add a block, same arrows / slider / finish, Hidden's own state, no effect on the render
  await page.evaluate(() => closeSheets()); await page.click('#addBtn');
  ok(await page.$('#tray [data-add="orbit"]:not([disabled])'), 'Add a block offers Change angle');
  await page.click('#tray [data-add="orbit"]');
  await page.waitForSelector('#blocks [data-obhost] .opad');
  ok(await page.$('#blocks [data-obhost] video[data-ob]') && /h_00001_/.test(await page.getAttribute('#blocks [data-obhost] .omid img', 'src')) && !(await page.$('#blocks .block[data-id] .tog')) || false, 'the block shows the same orbit (Hidden picture and clip), with no on/off switch');
  await page.evaluate(() => { const b = S.blocks.find(x => x.type==='orbit'); S.open[b.id] = true; renderBlocks(); });
  await page.waitForFunction(() => { const v = document.querySelector('#blocks [data-obhost] video[data-ob]'); return v && v._ready; }, null, {timeout:9000});
  await page.click('#blocks [data-obhost] [data-ob="finish"]');
  await page.waitForFunction(() => (OB().done || []).length===2, null, {timeout:15000});
  ok(sent.length===5 && Object.values(sent[4].prompt).some(n => n.inputs.filename_prefix==='Hidden/angles/finished'), 'Finish works from the block');
  ok(await page.evaluate(() => !JSON.stringify(buildGraph({})).includes('MiniMax')), "the block isn't part of the render");
  await page.evaluate(() => switchMode());
  ok(!(await page.$('#blocks [data-obhost]')), "Hidden's block stays in Hidden");
  await page.evaluate(() => closeSheets()); await page.click('#addBtn'); await page.click('#tray [data-add="orbit"]');
  await page.waitForSelector('#blocks [data-obhost] .opad');
  ok(/hood_00001_/.test(await page.getAttribute('#blocks [data-obhost] .omid img', 'src')), 'the normal block has the normal orbit');
  await page.evaluate(srv => { S.gallery.unshift({url:srv + '/view?filename=new_00001_.png&subfolder=RenderDeck&type=output', seed:2, prompt:'', t:Date.now()}); save(); drawStrip(); show(0); }, RENDER);
  await page.click('#blocks [data-obhost] [data-ob="shown"]');
  ok(/new_00001_/.test(await page.getAttribute('#blocks [data-obhost] .omid img', 'src')) && !(await page.$('#blocks [data-obhost] video[data-ob]')), 'Use the render on screen swaps the picture in');
  await page.setInputFiles('#obFile', {name:'phone.png', mimeType:'image/png', buffer:PNG});
  await page.waitForFunction(() => /up_\d+\.png.*type=input/.test(OB().src), null, {timeout:5000});
  ok(true, 'a picture from the phone is uploaded and used');
  // a picture from the phone replaced the orbit; the earlier one is a tap away
  await page.click('#blocks [data-obhost] [data-obclip]');
  await page.waitForSelector('#blocks [data-obhost] video[data-ob]');
  ok(/hood_00001_/.test(await page.getAttribute('#blocks [data-obhost] .omid img', 'src')), 'Earlier orbits reopens an orbit with its picture and slider');
  // an orbit still being made when the app closes comes in when it opens again
  await page.evaluate(([srv, sv]) => { const o = OB(); o.making = {pc:srv, id:'o1', save:sv, t:Date.now() - 60000, prefix:'RenderDeck/angles/orbit', mins:'5'}; o.clip = null; o.clips = []; save(); },
    [RENDER, Object.keys(sent[0].prompt).find(k => sent[0].prompt[k].class_type==='SaveVideo')]);
  ok(/Swinging the camera round on [\s\S]*Getting ready · \d+% · about \d+ min left/.test(await page.evaluate(() => { drawOrbit(); return document.querySelector('#blocks [data-obhost]').textContent; })), 'while it is made, the block shows a bar and the time left: ' + await page.textContent('#blocks [data-obhost]'));
  await page.reload(); await page.waitForFunction(() => OB().clip && !OB().making, null, {timeout:15000});
  ok(await page.$('#blocks [data-obhost] video[data-ob]'), 'after reopening the app the finished orbit is in the block');
  // a busy computer is passed over for a free one (even without FL2V); both free: the FL2V one
  ok(await page.evaluate(srv => { const M = 'https://main.test', oi = JSON.parse(JSON.stringify(pcOf(srv).oi));
    oi.UNETLoader.input.required.unet_name[0] = oi.UNETLoader.input.required.unet_name[0].filter(n => !/fl2v/.test(n));
    S.servers.push({name:'Main', url:M}); Object.assign(pcOf(M), {online:true, oi, load:0}); pcOf(srv).load = 2;
    const a = kitOrbit(); pcOf(srv).load = 0; const b = kitOrbit(); S.servers = S.servers.filter(x => x.url!==M); delete PCS[M];
    return (a.url===M && !a.fl && /is busy/.test(a.because) && b.url===srv && b.fl) || JSON.stringify([a.url, a.because, b.url]); }, RENDER)===true, 'busy Render: the orbit goes to the free computer, and says why');
  // a live bar with time left, from ComfyUI's step progress over the websocket
  ok(sent.slice(-1)[0] && sent.every(x => x.client_id && x.client_id!=='rd-orbit'), "orbits are queued with the app's own client id, so ComfyUI sends it their progress");
  await page.evaluate(() => { OB_RUN.add('zz'); const o = OB(); o.making = {pc:base(), id:'zz', save:'1', t:Date.now() - 60000, prefix:'x', mins:'4 to 5', smp:'7'}; save(); drawOrbit(); });
  ok(/Getting ready/.test(await page.textContent('#blocks [data-obtxt="make"]')) && /min left/.test(await page.textContent('#blocks [data-obtxt="make"]')), 'before the first step it shows the estimate: ' + await page.textContent('#blocks [data-obtxt="make"]'));
  const say = m => WS.forEach(w => { try{ w.send(JSON.stringify(m)); }catch(e){} });
  say({type:'executing', data:{node:'7', prompt_id:'zz'}}); say({type:'progress', data:{node:'7', prompt_id:'zz', value:2, max:8}});
  await page.waitForFunction(() => LIVE.zz && LIVE.zz.v===2);
  await page.evaluate(() => { const L = LIVE.zz, n = Date.now(); L.ps = n - 46000; L.pt = n; obBar(); });
  let bt = await page.textContent('#blocks [data-obtxt="make"]');
  ok(/step 2 of 8/.test(bt) && /about 3 min left/.test(bt) && parseFloat(await page.evaluate(() => document.querySelector('#blocks [data-obbar="make"]').style.width)) > 10, 'during sampling: the step, the percent and the time left from the measured step time: ' + bt);
  say({type:'progress', data:{node:'7', prompt_id:'zz', value:8, max:8}}); say({type:'executing', data:{node:'9', prompt_id:'zz'}});
  await page.waitForFunction(() => LIVE.zz.node==='9'); await page.evaluate(() => obBar());
  ok(/Decoding and saving/.test(await page.textContent('#blocks [data-obtxt="make"]')), 'after the last step it is decoding: ' + await page.textContent('#blocks [data-obtxt="make"]'));
  ok(await page.evaluate(() => { LIVE.q1 = {ahead:2, pc:base()}; const t = liveEta('q1', '7', Date.now() - 240000, 300, 'Swinging the camera').text; return /^Waiting behind 2 other jobs on .* 4 min so far$/.test(t) || t; })===true, 'queued behind other jobs: it says so');
  ok(await page.evaluate(() => { LIVE.q2 = {running:true}; const x = liveEta('q2', '7', Date.now() - 600000, 300, 'Swinging the camera'); return x.f < 0.99 && /taking longer than the usual 5 min · 10 min so far/.test(x.text) || x.text; })===true, 'past the estimate with no steps: taking longer than usual, not 99% under a minute');
  await page.evaluate(() => { delete OB().making; save(); drawOrbit(); });
  // from the library viewer too
  ok(await page.$('#vLib #vOrbit') && await page.$('#vGal [data-act="orbit"]'), 'the viewers have 📷 Change angle too');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
