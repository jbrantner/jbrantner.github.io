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
  ImageScaleBy:[['image','upscale_method','scale_by'],1], LoraLoader:[['model','clip','lora_name','strength_model','strength_clip'],2], CheckpointLoaderSimple:[['ckpt_name'],3], CLIPTextEncode:[['clip','text'],1], AnimeLineArtPreprocessor:[['image'],1],
  ControlNetLoader:[['control_net_name'],1], SetUnionControlNetType:[['control_net','type'],1], ControlNetApplyAdvanced:[['positive','negative','control_net','image','strength','start_percent','end_percent'],2],
  VAEEncode:[['pixels','vae'],1], ColorMatch:[['image_ref','image_target','method'],1], KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1], VAEDecode:[['samples','vae'],1], SaveImage:[['images','filename_prefix'],0],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
let FL = true;
const OI = () => ({CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors', 'iriselTouchIL_v10.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal','simple'])}}},
  LoraLoader:{input:{required:{lora_name:C(['chars\\librarianx_v2.safetensors', 'AFKJ Style Illustrious Claude.safetensors'])}}},
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
  const sent = [], ups = [], polls = {}, EXTRA = [], mainSent = [];
  await page.route('https://main.test/**', r => { const u = new URL(r.request().url());
    if(u.pathname==='/upload/image') return r.fulfill({ json:{name:'main_up.png', subfolder:'', type:'input'} });
    if(u.pathname==='/prompt'){ mainSent.push(JSON.parse(r.request().postData())); return r.fulfill({ json:{prompt_id:'m1', number:0, node_errors:{}} }); }
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[['0', 'm1']], queue_pending:[]} });
    return r.fulfill({ status:404, body:'' }); });
  await page.route(RENDER + '/**', async r => {
    const u = new URL(r.request().url()), cors = {'Access-Control-Allow-Origin':'*'};
    if(u.pathname==='/object_info') return r.fulfill({ json:OI() });
    if(u.pathname==='/view' && /\.webm$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'video/webm', body:VID, headers:cors });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG, headers:cors });
    if(u.pathname==='/queue' && r.request().method()==='POST'){ const del = JSON.parse(r.request().postData()).delete || []; EXTRA.splice(0, EXTRA.length, ...EXTRA.filter(x => !del.includes(x))); return r.fulfill({ json:{} }); }
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:sent.map((s, i) => [0, 'o' + (i + 1)]).filter(x => (polls[x[1]] || 0) < 2).concat(EXTRA.map((x, i) => [100 + i, x]))} });
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
  await page.evaluate(srv => { closeSheets(); const u = f => srv + '/view?filename=' + f + '&subfolder=RenderDeck&type=output';
    const looks = JSON.parse(JSON.stringify(S.blocks)); looks.find(b => b.type==='model').ckpt = 'iriselTouchIL_v10.safetensors';
    looks.push({id:90, type:'lora', on:true, lora:'librarianx_v2.safetensors', strength:1}, {id:91, type:'lora', on:true, lora:'AFKJ Style Illustrious Claude.safetensors', strength:0.8}, {id:92, type:'lora', on:false, lora:'off.safetensors', strength:1});
    S.loraWords['librarianx_v2.safetensors'] = 'librarianx'; S.loraWords['AFKJ Style Illustrious Claude.safetensors'] = 'AFKJ Style';
    S.gallery = [{url:u('hood_00001_.png'), seed:1, prompt:'', t:Date.now(), snap:{blocks:looks, prompt:'librarianx eating a burger'}}, {url:u('fox_00001_.png'), seed:2, prompt:'', t:Date.now(), snap:{prompt:'a red fox in the snow'}}, {url:u('owl_00001_.png'), seed:3, prompt:'', t:Date.now()}];
    save(); drawStrip(); show(0); }, RENDER);
  await page.click('#resultActions [data-act="orbit"]');
  await page.waitForSelector('#obPanel:not([hidden]) .opad');
  ok(await page.$$eval('#obPanel .opad button', b => b.length)===8 && !(await page.$('#orbitSheet')), '8 arrows in a panel under the strip (no sheet)');
  ok(/FL2V on .* pins this picture as the first frame/.test(await page.textContent('#obPanel')), 'it offers the FL2V orbit on Render');
  await page.click('#obPanel [data-obdir="up-left"]');
  ok(await page.$('#obPanel [data-obseg="deg"]') && await page.$('#obPanel [data-obseg="tilt"]'), 'a diagonal asks for both how far round and how far up');
  await page.click('#obPanel [data-obseg="deg"][data-v="135"]');
  await page.click('#obPanel [data-ob="make"]');
  await page.waitForSelector('#strip [data-sb="0"]', {timeout:5000}).catch(() => {});
  ok(await page.$('#strip [data-sb="0"]'), 'the thumbnail making an orbit shows a small bar');
  // another picture meanwhile: its own (empty) project, and its settings load
  await page.click('#strip img[data-i="1"]');
  await page.waitForFunction(() => S.prompt==='a red fox in the snow', null, {timeout:3000}).catch(() => {});
  ok(await page.evaluate(() => S.prompt==='a red fox in the snow' && shownIdx===1) && await page.$eval('#obPanel', p => p.hidden) && await page.$eval('#obVid', v => v.hidden), 'tapping another thumbnail loads its settings, and its angle work is its own');
  await page.click('#strip img[data-i="0"]');
  await page.waitForFunction(() => { const v = document.querySelector('#obVid'); return !v.hidden && v._ready; }, null, {timeout:20000});
  ok(true, 'back on the first picture, its orbit plays in the preview where the picture was');
  let g = sent[0].prompt, by = c => Object.values(g).filter(n => n.class_type===c);
  ok(sent[0].client_id===await page.evaluate(() => clientId) && check(g).length===0, 'the orbit graph is valid: ' + check(g).join('; '));
  const iv = by('MiniMaxH3ImageToVideo')[0].inputs;
  ok(by('UNETLoader')[0].inputs.unet_name==='minimax_h3_fl2va_pruned_int8_convrot.safetensors' && by('LoraLoaderModelOnly')[0].inputs.lora_name==='minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'
    && by('BasicScheduler')[0].inputs.steps===8 && by('KSamplerSelect')[0].inputs.sampler_name==='res_multistep', 'FL2V model, Turbo 8-step LoRA, 8 steps, res_multistep');
  ok(g[iv.first_frame[0]].inputs.image==='up_1.png' && iv.width===576 && iv.height===576 && iv.length===124, 'the picture (sent to Render) is the first frame; a square picture gets a 576 square canvas: ' + [iv.width, iv.height]);
  ok(/135-degree arc shot to the left/.test(iv.prompt) && /cranes up/.test(iv.prompt) && /from behind their right shoulder and from a high angle/.test(iv.prompt), 'the prompt asks for the move and the end view: ' + iv.prompt.slice(0, 160));
  ok(by('SaveVideo')[0].inputs.filename_prefix==='RenderDeck/angles/orbit', 'the clip saves under RenderDeck/angles');
  ok(!(await page.$('#strip [data-sb="0"]')), 'the thumbnail bar goes when the orbit is ready');
  ok(await page.inputValue('#obPanel [data-obt]')==='1000', 'the slider starts on the last frame (the new angle)');
  await page.fill('#obPanel [data-obt]', '500'); await page.dispatchEvent('#obPanel [data-obt]', 'input');
  await page.click('#obPanel [data-ob="fwd"]');
  ok(Math.abs(+await page.inputValue('#obPanel [data-obt]') - 508) <= 1, '▶ steps one frame on');
  ok(/uses this picture's model and LoRAs: iriselTouchIL_v10\.safetensors · librarianx_v2 1 · AFKJ Style Illustrious Claude 0\.8/.test(await page.textContent('#obPanel')), 'the panel says the touch-up uses the picture\'s model and LoRAs: ' + await page.textContent('#obPanel'));
  await page.click('#obPanel [data-ob="finish"]');
  await page.waitForFunction(() => (S.gallery[0].hist || []).length===1, null, {timeout:15000});
  g = sent[1].prompt;
  ok(check(g).length===0, 'the touch-up graph is valid: ' + check(g).join('; '));
  ok(by('LoadImage')[0].inputs.image==='up_2.png', 'the grabbed frame is uploaded and redrawn');
  ok(by('KSampler')[0].inputs.denoise===0.2 && by('ImageScaleBy')[0].inputs.scale_by===1.5 && by('CheckpointLoaderSimple')[0].inputs.ckpt_name==='iriselTouchIL_v10.safetensors', 'the picture\'s own checkpoint at 0.2, 1.5x bigger');
  { const ll = by('LoraLoader'), ks = by('KSampler')[0], pos = by('CLIPTextEncode')[0].inputs.text;
    ok(ll.length===2 && ll[0].inputs.lora_name==='chars\\librarianx_v2.safetensors' && ll[1].inputs.lora_name==='AFKJ Style Illustrious Claude.safetensors' && ll[1].inputs.strength_model===0.8
      && g[ks.inputs.model[0]]===ll[1] && g[by('CLIPTextEncode')[0].inputs.clip[0]]===ll[1], 'its LoRAs (the ones switched on, at their strengths, found in their folder) feed the redraw');
    ok(/librarianx, AFKJ Style/.test(pos), 'and their trigger words are in the prompt: ' + pos); }
  ok(by('SetUnionControlNetType')[0].inputs.type==='canny/lineart/anime_lineart/mlsd' && by('ControlNetApplyAdvanced')[0].inputs.strength===0.8 && g[by('ControlNetApplyAdvanced')[0].inputs.image[0]].class_type==='AnimeLineArtPreprocessor', 'ControlNet ProMax holds the anime line art at 0.8');
  ok(by('SaveImage')[0].inputs.filename_prefix==='RenderDeck/angles/finished', 'saved under RenderDeck/angles/finished');
  { const ap = by('ControlNetApplyAdvanced'), t = ap[1] && g[g[ap[1].inputs.control_net[0]].inputs.control_net ? ap[1].inputs.control_net[0] : ''];
    ok(ap.length===2 && t && t.inputs.type==='tile' && g[ap[1].inputs.image[0]].class_type==='ImageScaleBy' && ap[1].inputs.strength===0.6, 'a tile ControlNet holds the frame\'s colours and details at 0.6');
    const cm = by('ColorMatch')[0], sv = by('SaveImage')[0];
    ok(cm && cm.inputs.method==='mkl' && g[cm.inputs.image_ref[0]].class_type==='ImageScaleBy' && g[sv.inputs.images[0]].class_type==='ColorMatch' && by('KSampler')[0].inputs.cfg===4, 'the colours are matched back to the frame (Color Match, mkl), cfg 4'); }
  ok(await page.evaluate(() => /finished_00001_/.test(S.gallery[0].url) && /hood_00001_/.test(S.gallery[0].hist[0].url) && S.gallery.length===3 && shownIdx===0 && /finished_00001_/.test(document.querySelector('#strip img[data-i="0"]').src)),
    'the finished angle becomes this picture (its thumbnail), the old one goes into its history, no new strip item');
  ok(await page.$eval('#strip .sver', e => e.textContent)==='2' && await page.$$eval('#obPanel .obhist button', b => b.length)===2, 'the thumbnail shows 2 versions; History lists both');
  await page.click('#obPanel [data-obhist="0"]');
  ok(await page.evaluate(() => /hood_00001_/.test(S.gallery[0].url) && /finished_00001_/.test(S.gallery[0].hist[0].url)), 'tapping an earlier version makes it the picture again');
  await page.click('#obPanel [data-obhist="0"]');
  // Hidden: same screen, its own pictures and folders
  await page.evaluate(srv => { switchMode(); S.gallery = [{url:srv + '/view?filename=h_00001_.png&subfolder=Hidden%2Frender&type=output', seed:1, prompt:'', t:Date.now()}]; save(); drawStrip(); show(0); }, RENDER);
  ok(await page.$eval('#obPanel', p => p.hidden) && await page.$eval('#obVid', v => v.hidden), 'Hidden has its own pictures, not the normal ones');
  await page.click('#resultActions [data-act="orbit"]');
  await page.click('#obPanel [data-obdir="down"]'); await page.click('#obPanel [data-ob="make"]');
  await page.waitForFunction(() => { const v = document.querySelector('#obVid'); return !v.hidden && v._ready; }, null, {timeout:20000});
  g = sent[2].prompt;
  ok(by('SaveVideo')[0].inputs.filename_prefix==='Hidden/angles/orbit' && /crane-down/.test(by('MiniMaxH3ImageToVideo')[0].inputs.prompt) && !/arc shot/.test(by('MiniMaxH3ImageToVideo')[0].inputs.prompt), 'Hidden saves into Hidden/angles; down is a crane-down');
  ok(await page.evaluate(() => (OB().clips || []).length===1 && OB().clip.src.includes('h_00001_')), 'the orbit is kept for later');
  await page.click('#obPanel [data-obseg="dn"][data-v="0"]'); await page.click('#obPanel [data-ob="finish"]');
  await page.waitForFunction(() => (S.gallery[0].hist || []).length===1, null, {timeout:15000});
  g = sent[3].prompt;
  ok(!by('KSampler').length && by('SaveImage')[0].inputs.filename_prefix==='Hidden/angles/finished', 'Bigger only skips the redraw; Hidden/angles/finished');
  await page.evaluate(() => switchMode());
  ok(await page.evaluate(() => /finished_00001_/.test(S.gallery[0].url) && S.gallery[0].ob.clip), 'back in normal: its picture and orbit are as they were');
  // no FL2V model: the hybrid Turbo with the picture as reference, pinned at frame 0
  FL = false; await page.evaluate(async () => { const p = pcOf(base()); p.oi = await (await fetch(base() + '/object_info')).json(); });
  ok(await page.evaluate(() => { const k = kitOrbit(), g = orbitGraph(k, 'x.png', {dir:'right', deg:90}, 576, 1024).g, n = Object.values(g), gd = n.find(x => x.class_type==='BasicGuider'), ad = g[gd.inputs.conditioning[0]];
    return !k.fl && k.steps===4 && ad.class_type==='MiniMaxH3AddGuide' && ad.inputs.frame_idx===0 && /^<Picture 1> is the first frame/.test(n.find(x => x.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt); }), 'without FL2V: hybrid Turbo, 4 steps, picture as reference pinned at frame 0');
  FL = true; await page.evaluate(async () => { const p = pcOf(base()); p.oi = await (await fetch(base() + '/object_info')).json(); });
  // no Change angle block any more: it is gone from the tray, and an old one is dropped
  await page.evaluate(() => closeSheets()); await page.click('#addBtn');
  ok(!(await page.$('#tray [data-add="orbit"]')), 'Add a block has no Change angle block');
  ok(await page.evaluate(() => { const st = {blocks:[{type:'sampler'}, {type:'orbit', id:99}]}; migrate(st); return st.blocks.length===1; }), 'an old Change angle block is dropped');
  await page.evaluate(() => { closeSheets(); show(0); });
  // Earlier orbits
  await page.evaluate(() => { const o = S.gallery[0].ob; o.open = true; o.clips = [o.clip, {url:o.clip.url.replace('orbit_00001_', 'orbit_00009_'), pc:o.clip.pc, src:o.clip.src, dir:'left'}]; save(); drawOrbit(); });
  await page.click('#obPanel [data-obclip]');
  ok(await page.evaluate(() => /orbit_00009_/.test(S.gallery[0].ob.clip.url) && S.gallery[0].ob.dir==='left' && document.querySelector('#obVid').dataset.src.includes('orbit_00009_')), 'Earlier orbits puts that orbit back in the preview');
  // an orbit still being made when the app closes comes in when it opens again
  await page.evaluate(([srv, sv]) => { show(0); const o = OB(); o.making = {pc:srv, id:'o1', save:sv, t:Date.now() - 60000, prefix:'RenderDeck/angles/orbit', mins:'5'}; o.clip = null; o.clips = []; save(); },
    [RENDER, Object.keys(sent[0].prompt).find(k => sent[0].prompt[k].class_type==='SaveVideo')]);
  ok(/Swinging the camera round on [\s\S]*Getting ready · \d+% · about \d+ min left/.test(await page.evaluate(() => { drawOrbit(); obBar(); return document.querySelector('#obPanel').textContent; })), 'while it is made, the panel shows a bar and the time left: ' + await page.textContent('#obPanel'));
  await page.reload(); await page.waitForFunction(() => S.gallery[0].ob && S.gallery[0].ob.clip && !S.gallery[0].ob.making, null, {timeout:15000});
  ok(true, 'after reopening the app the finished orbit is on its picture');
  // a busy computer is passed over for a free one (even without FL2V); both free: the FL2V one
  ok(await page.evaluate(srv => { const M = 'https://main.test', oi = JSON.parse(JSON.stringify(pcOf(srv).oi));
    oi.UNETLoader.input.required.unet_name[0] = oi.UNETLoader.input.required.unet_name[0].filter(n => !/fl2v/.test(n));
    S.servers.push({name:'Main', url:M}); Object.assign(pcOf(M), {online:true, oi, load:0}); pcOf(srv).load = 2;
    const a = kitOrbit(); pcOf(srv).load = 0; const b = kitOrbit(); S.servers = S.servers.filter(x => x.url!==M); delete PCS[M];
    return (a.url===M && !a.fl && /is busy/.test(a.because) && b.url===srv && b.fl) || JSON.stringify([a.url, a.because, b.url]); }, RENDER)===true, 'busy Render: the orbit goes to the free computer, and says why');
  // a waiting orbit moves itself to a free computer
  ok(await page.evaluate(async ([srv]) => { const M = 'https://main.test', oi = JSON.parse(JSON.stringify(pcOf(srv).oi));
    S.servers.push({name:'Main', url:M}); Object.assign(pcOf(M), {online:true, oi, load:0}); pcOf(srv).load = 3;
    const o = OB(); OB_RUN.add('wait1'); o.making = {pc:srv, id:'wait1', save:'1', t:Date.now(), prefix:'x', mins:'5', smp:'7'}; save(); return true; }, [RENDER]), 'set up: an orbit waiting on busy Render, Main free');
  EXTRA.push('busy1', 'wait1');
  await page.evaluate(srv => liveQueue('wait1', srv), RENDER);
  await page.waitForFunction(() => OB().making && OB().making.pc==='https://main.test', null, {timeout:8000}).catch(() => {});
  ok(!EXTRA.includes('wait1') && mainSent.length===1 && await page.evaluate(() => OB().making && OB().making.pc==='https://main.test' && !OB().err), 'it is taken out of Render\'s queue and made on Main: ' + JSON.stringify([EXTRA, mainSent.length, await page.evaluate(() => [OB().making && OB().making.pc, OB().err])]));
  await page.evaluate(srv => { OB_RUN.add(OB().making.id); delete OB().making; pcOf(srv).load = 0; S.servers = S.servers.filter(x => x.url!=='https://main.test'); delete PCS['https://main.test']; save(); }, RENDER);
  EXTRA.length = 0;
  // a live bar with time left, from ComfyUI's step progress over the websocket
  ok(sent.slice(-1)[0] && sent.every(x => x.client_id && x.client_id!=='rd-orbit'), "orbits are queued with the app's own client id, so ComfyUI sends it their progress");
  await page.evaluate(() => { OB_RUN.add('zz'); const o = OB(); o.making = {pc:base(), id:'zz', save:'1', t:Date.now() - 60000, prefix:'x', mins:'4 to 5', smp:'7'}; save(); drawOrbit(); });
  ok(/Getting ready/.test(await page.textContent('#obPanel [data-obtxt="make"]')) && /min left/.test(await page.textContent('#obPanel [data-obtxt="make"]')), 'before the first step it shows the estimate: ' + await page.textContent('#obPanel [data-obtxt="make"]'));
  const say = m => WS.forEach(w => { try{ w.send(JSON.stringify(m)); }catch(e){} });
  say({type:'executing', data:{node:'7', prompt_id:'zz'}}); say({type:'progress', data:{node:'7', prompt_id:'zz', value:2, max:8}});
  await page.waitForFunction(() => LIVE.zz && LIVE.zz.v===2);
  await page.evaluate(() => { const L = LIVE.zz, n = Date.now(); L.ps = n - 46000; L.pt = n; obBar(); });
  let bt = await page.textContent('#obPanel [data-obtxt="make"]');
  ok(/step 2 of 8/.test(bt) && /about 3 min left/.test(bt) && parseFloat(await page.evaluate(() => document.querySelector('#obPanel [data-obbar="make"]').style.width)) > 10, 'during sampling: the step, the percent and the time left from the measured step time: ' + bt);
  say({type:'progress', data:{node:'7', prompt_id:'zz', value:8, max:8}}); say({type:'executing', data:{node:'9', prompt_id:'zz'}});
  await page.waitForFunction(() => LIVE.zz.node==='9'); await page.evaluate(() => obBar());
  ok(/Decoding and saving/.test(await page.textContent('#obPanel [data-obtxt="make"]')), 'after the last step it is decoding: ' + await page.textContent('#obPanel [data-obtxt="make"]'));
  ok(await page.evaluate(() => { LIVE.q1 = {ahead:2, pc:base()}; const t = liveEta('q1', '7', Date.now() - 240000, 300, 'Swinging the camera').text; return /^Waiting behind 2 other jobs on .* 4 min so far$/.test(t) || t; })===true, 'queued behind other jobs: it says so');
  ok(await page.evaluate(() => { LIVE.q2 = {running:true}; const x = liveEta('q2', '7', Date.now() - 600000, 300, 'Swinging the camera'); return x.f < 0.99 && /taking longer than the usual 5 min · 10 min so far/.test(x.text) || x.text; })===true, 'past the estimate with no steps: taking longer than usual, not 99% under a minute');
  await page.evaluate(() => { delete OB().making; save(); drawOrbit(); });
  // 🤸 Edit pose: same clip and finish, camera locked, the typed action; it chains on the picture's current version
  await page.evaluate(() => { show(0); delete OB().making; });
  await page.click('#resultActions [data-act="pose"]');
  await page.waitForSelector('#obPanel [data-obf="action"]');
  ok(!(await page.$('#obPanel .opad')), 'Edit pose: no camera arrows, an action box instead');
  const before = sent.length;
  await page.click('#obPanel [data-ob="make"]'); await page.waitForTimeout(400);
  ok(sent.length===before, 'no action typed: nothing is sent');
  await page.click('#obPanel [data-obidea="picks up the coffee mug and sips it"]');
  await page.click('#obPanel [data-ob="make"]');
  await page.waitForFunction(() => S.gallery[0].ob.clip && S.gallery[0].ob.clip.mode==='pose', null, {timeout:20000});
  { const pg = sent[before].prompt, pv = Object.values(pg).find(n => n.class_type==='MiniMaxH3ImageToVideo').inputs, li = pg[pv.first_frame[0]];
    ok(/Locked-off static shot/.test(pv.prompt) && /The character picks up the coffee mug and sips it/.test(pv.prompt) && !/arc shot|crane/.test(pv.prompt), 'the pose prompt locks the camera and asks for the action: ' + pv.prompt.slice(0, 140));
    ok(check(pg).length===0 && Object.values(pg).some(n => n.class_type==='SaveVideo' && n.inputs.filename_prefix==='RenderDeck/angles/orbit'), 'same FL2V graph, saved with the angles'); }
  ok(/Make another move/.test(await page.textContent('#obPanel')), 'its clip plays with the same slider and finish');
  // from the library viewer too: that picture becomes a project at the front of the strip
  ok(await page.$('#vLib #vOrbit') && await page.$('#vLib #vPose') && await page.$('#vGal [data-act="orbit"]') && await page.$('#vGal [data-act="pose"]'), 'the viewers have 📷 Change angle too');
  await page.evaluate(srv => orbitUrl(srv + '/view?filename=old_00001_.png&subfolder=RenderDeck&type=output'), RENDER);
  ok(await page.evaluate(() => /old_00001_/.test(S.gallery[0].url) && shownIdx===0 && !document.querySelector('#obPanel').hidden), 'a library picture opens as its own project with the angle panel');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
