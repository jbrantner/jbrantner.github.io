// Characters: a card with tags and pictures from several angles, and Make other angles, which sends Qwen-Image-Edit
// renders to the computer that has it (Render) even when the app is connected to the other one (Main), copies the
// picture over first, and puts each finished picture on the character. Hidden keeps its own characters.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const RENDER = 'https://jordo-desktop.test', MAIN = 'https://jordo-main.test';
const DEF = { // required inputs and output count, as in ComfyUI's own node definitions
  UNETLoader:[['unet_name','weight_dtype'],1], LoraLoaderModelOnly:[['model','lora_name','strength_model'],1], ModelSamplingAuraFlow:[['model','shift'],1],
  CFGNorm:[['model','strength'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1], LoadImage:[['image'],2],
  ImageScaleToTotalPixels:[['image','upscale_method','megapixels'],1], TextEncodeQwenImageEdit:[['clip','prompt'],1], TextEncodeQwenImageEditPlus:[['clip','prompt'],1],
  VAEEncode:[['pixels','vae'],1], KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1],
  VAEDecode:[['samples','vae'],1], SaveImage:[['images','filename_prefix'],0],
};
function check(g){
  const errs = [];
  for(const [id,n] of Object.entries(g)){
    const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){
      const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing node '+v[0]); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]);
    }
  }
  return errs;
}
const C = a => [a];
const base = {CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal','simple'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}}, LoadImage:{input:{required:{}}}, SaveImage:{input:{required:{}}}, VAEEncode:{input:{required:{}}}, VAEDecode:{input:{required:{}}}};
const OI = {
  [RENDER]: Object.assign({}, base, {
    UNETLoader:{input:{required:{unet_name:C(['qwen_image_edit_fp8_e4m3fn.safetensors','DasiwaMinimaxH3.safetensors']), weight_dtype:C(['default','fp8_e4m3fn'])}}},
    CLIPLoader:{input:{required:{clip_name:C(['qwen_3_4b.safetensors','qwen_2.5_vl_7b_fp8_scaled.safetensors']), type:C(['stable_diffusion','qwen_image']), }, optional:{device:C(['default','cpu'])}}},
    VAELoader:{input:{required:{vae_name:C(['ae.safetensors','qwen_image_vae.safetensors'])}}},
    LoraLoaderModelOnly:{input:{required:{lora_name:C(['Qwen_Image_Edit_2511_All_included_with_extra_gay_v2.0.safetensors','Qwen-Image-Edit-Lightning-4steps-V1.0-bf16.safetensors'])}}},
    TextEncodeQwenImageEdit:{input:{required:{clip:['CLIP'], prompt:['STRING',{multiline:true}]}, optional:{vae:['VAE'], image:['IMAGE']}}},
    TextEncodeQwenImageEditPlus:{input:{required:{}}}, ModelSamplingAuraFlow:{input:{required:{shift:['FLOAT',{default:1.73}]}}}, CFGNorm:{input:{required:{}}},
    ImageScaleToTotalPixels:{input:{required:{upscale_method:C(['nearest-exact','lanczos']), megapixels:['FLOAT',{default:1}], resolution_steps:['INT',{default:1}]}}},
  }),
  [MAIN]: Object.assign({}, base, {UNETLoader:{input:{required:{unet_name:C(['flux1-dev.safetensors']), weight_dtype:C(['default'])}}}}),
};
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  const syncs = [], socks = {}, sent = {[RENDER]:[], [MAIN]:[]}, uploads = {[RENDER]:[], [MAIN]:[]}, hist = {}; let n = 0;
  await page.routeWebSocket(/\.test\/ws/, ws => { socks[new URL(ws.url()).origin.replace('wss:', 'https:')] = ws; });
  for(const srv of [RENDER, MAIN]) await page.route(srv + '/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname.startsWith('/renderdeck/sync') || u.pathname.startsWith('/renderdeck/download') || u.pathname.startsWith('/renderdeck/file')) syncs.push(srv + u.pathname);
    if(u.pathname==='/object_info') return r.fulfill({ json:OI[srv] });
    if(u.pathname==='/upload/image'){ const name = (r.request().postData() || '').match(/filename="([^"]+)"/); uploads[srv].push(name ? name[1] : '?'); return r.fulfill({ json:{name:name ? name[1] : 'phone.png', subfolder:'', type:'input'} }); }
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9); return r.fulfill({ json:hist[id] ? {[id]:hist[id]} : {} }); }
    if(u.pathname==='/prompt'){
      const body = JSON.parse(r.request().postData()), id = 'q' + (++n); sent[srv].push(body.prompt);
      if(check(body.prompt).length) return r.fulfill({ status:400, json:{error:{message:'bad graph: ' + check(body.prompt).join('; ')}, node_errors:{}} });
      setTimeout(() => { const ws = socks[srv]; const save = Object.keys(body.prompt).find(k => body.prompt[k].class_type==='SaveImage');
        const sub = body.prompt[save].inputs.filename_prefix.split('/').slice(0, -1).join('/'), img = {filename:'turn_' + id + '.png', subfolder:sub, type:'output'};
        hist[id] = {status:{completed:true}, outputs:{[save]:{images:[img]}}};
        ws.send(JSON.stringify({type:'executed', data:{node:save, prompt_id:id, output:{images:[img]}}}));
        ws.send(JSON.stringify({type:'executing', data:{node:null, prompt_id:id}})); }, 80);
      return r.fulfill({ json:{prompt_id:id, number:0, node_errors:{}} });
    }
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };

  // Test mode: a render becomes a character's first picture, then Make other angles fills in the rest
  await page.click('#openSettings'); await page.click('#testBtn'); await page.evaluate(() => { CH.allOpen = true; });
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#strip img').length===1, null, {timeout:8000});
  await page.$eval('#resultActions [data-act="char"]', b => b.click()); await page.waitForSelector('#charSheet.open'); // the button is hidden for now (Jordan 2026-10-24), still wired
  ok((await page.textContent('#charBody')).includes('Who is this picture of'), 'adding a render asks who it is of');
  await page.click('#charBody [data-ch="new"]');
  await page.fill('#charBody [data-cf="name"]', 'Levi'); await page.fill('#charBody [data-cf="tags"]', '1boy, black hair, red eyes, black coat');
  await page.click('#charBody .cviews button[data-cv]');
  let st = await page.evaluate(() => ({n:S.chars.length, c:S.chars[0]}));
  ok(st.n===1 && st.c.name==='Levi' && st.c.views.length===1 && st.c.views[0].angle==='ref', 'new character Levi with the render as its Reference picture');
  // a Reference picture only makes the full-body front, which is then picked for the other angles
  const offer = await page.$$eval('#charBody [data-want]', b => b.map(x => x.dataset.want + (x.classList.contains('on') ? '*' : '')));
  ok(offer.join()==='front*,three,left,right,back,face' && (await page.textContent('#charBody [data-ch="turn"]')).includes('Make the full-body front'), 'a Reference picture offers every angle, with just the front ticked: ' + offer.join());
  await page.click('#charBody [data-ch="turn"]');
  ok(await page.evaluate(() => S.queue.length===1 && Object.values(S.graphOf = S.queue[0].graph).some(n => /full-body front view, from head to feet/.test(n.inputs.prompt || ''))), 'one render, asking for a head-to-feet front view');
  await page.waitForFunction(() => !S.queue.length && S.chars[0].views.length===2, null, {timeout:15000});
  st = await page.evaluate(() => ({a:S.chars[0].views.map(v => v.angle).join(), sel:CH.sel===S.chars[0].views[1].id}));
  ok(st.a==='ref,front' && st.sel, 'the new front joins Levi and is picked: ' + JSON.stringify(st));
  const want = await page.$$eval('#charBody [data-want].on', b => b.map(x => x.dataset.want));
  ok(want.join()==='three,left,right,back,face', 'the angles it lacks are ticked: ' + want.join());
  await page.click('#charBody [data-want="three"]'); await page.click('#charBody [data-want="right"]');
  ok((await page.textContent('#charBody [data-ch="turn"]')).includes('Make 3 angles'), 'unticking two leaves 3 to make');
  await page.click('#charBody [data-ch="turn"]');
  ok(await page.evaluate(() => S.queue.length===3 && S.queue.every(e => S.charJobs[e.key])), 'three renders queued for the character');
  await page.waitForFunction(() => document.querySelectorAll('#charBody .cviews .wait').length > 0, null, {timeout:3000}).catch(() => {});
  await page.waitForFunction(() => !S.queue.length, null, {timeout:15000});
  st = await page.evaluate(() => S.chars[0].views.map(v => v.angle).join());
  ok(st==='ref,front,left,back,face', 'each finished picture joins Levi with its angle: ' + st);
  ok((await page.$$('#charBody .cviews button[data-cv]')).length===5 && !(await page.$('#charBody .cviews .wait')), 'the sheet shows 5 pictures and nothing still making');
  const tg = await page.evaluate(() => { const k = qwenKit(); return turnGraph(k, 'x.png', 'side', S.chars[0]).graph; });
  ok(check(tg).length===0, 'Qwen graph is valid: ' + check(tg).join('; '));
  const txt = Object.values(tg).find(x => x._meta.title==='Turn to Side').inputs.prompt;
  ok(/from the side/.test(txt) && /black coat/.test(txt), 'the prompt asks for the angle and carries the tags: ' + txt);
  ok(await page.$('#charBody .chref img'), 'the top shows the reference picture');
  // picking a picture lets you say which angle it is, and remove it
  await page.click('#charBody .cviews button[data-cv]:nth-child(2)'); await page.click('#charBody [data-seg="cangle"][data-v="three"]');
  ok(await page.evaluate(() => S.chars[0].views[1].angle==='three'), 'a picture\'s angle can be changed');
  await page.click('#charBody [data-ch="delview"]');
  ok(await page.evaluate(() => S.chars[0].views.length===4), 'a picture can be removed');
  await page.evaluate(() => closeSheets());

  // Hidden has its own characters, and normal ones never show there
  await page.click('#modeBtn'); await page.click('#charBtn');
  ok(!(await page.textContent('#charBody')).includes('Levi') && (await page.textContent('#charBody')).includes('Hidden characters'), 'Hidden starts with no characters');
  await page.click('#charBody [data-ch="new"]'); await page.fill('#charBody [data-cf="name"]', 'Secret');
  await page.evaluate(() => closeSheets()); await page.click('#modeBtn'); await page.click('#charBtn');
  const nt = await page.textContent('#charBody');
  ok(nt.includes('Levi') && !nt.includes('Secret'), 'back in the normal view: Levi, not the Hidden character');
  await page.evaluate(() => closeSheets()); await page.click('#modeBtn'); await page.click('#charBtn');
  ok((await page.textContent('#charBody')).includes('Secret'), 'Hidden keeps its character');
  await page.evaluate(() => closeSheets()); await page.click('#modeBtn');

  // two computers, connected to Main (no Qwen): the angles go to Render, with the picture copied there first
  await page.evaluate(() => { S.queue = []; S.test = false; });
  await page.click('#openSettings'); await page.fill('#server', MAIN + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on') || !document.querySelector('#pcDots').hidden);
  await page.evaluate(r => { S.servers.push({name:'Render', url:r}); save(); return wakePc(pcOf(r)); }, RENDER);
  await page.evaluate(m => { const c = S.chars[0]; c.views = [{id:'vm', angle:'front', img:'levi_front.png', url:m + '/view?filename=levi_front.png&type=input', home:m}]; save(); }, MAIN);
  await page.click('#charBtn'); await page.click('#charBody [data-open]');
  ok((await page.textContent('#charBody')).includes('Qwen-Image-Edit on Render'), 'the sheet says the angles are drawn on Render');
  await page.evaluate(() => { CH.want = new Set(); drawChars(); });
  await page.click('#charBody [data-want="back"]'); await page.click('#charBody [data-want="left"]');
  await page.click('#charBody [data-ch="turn"]');
  await page.waitForFunction(() => S.chars[0].views.length===3, null, {timeout:8000}).catch(() => {});
  ok(sent[RENDER].length===2 && sent[MAIN].length===0, 'both renders went to Render, none to Main: ' + sent[RENDER].length + ' / ' + sent[MAIN].length);
  ok(uploads[RENDER].some(x => /levi_front\.png/.test(x)), 'the picture was copied to Render first: ' + uploads[RENDER].join());
  const lg = sent[RENDER][0] || {}, nodes = Object.values(lg);
  ok(nodes.some(x => x.class_type==='LoraLoaderModelOnly' && /Lightning-4steps/.test(x.inputs.lora_name)) && nodes.find(x => x.class_type==='KSampler').inputs.steps===4 && nodes.find(x => x.class_type==='KSampler').inputs.cfg===1,
    'uses the Lightning LoRA, 4 steps, CFG 1');
  ok(nodes.find(x => x.class_type==='CLIPLoader').inputs.clip_name==='qwen_2.5_vl_7b_fp8_scaled.safetensors' && nodes.find(x => x.class_type==='VAELoader').inputs.vae_name==='qwen_image_vae.safetensors', 'picks the Qwen text encoder and VAE');
  ok(nodes.find(x => x.class_type==='ImageScaleToTotalPixels').inputs.resolution_steps===1, 'inputs the graph leaves out get ComfyUI\'s defaults');
  ok(nodes.find(x => x.class_type==='SaveImage').inputs.filename_prefix==='RenderDeck/characters/Levi', 'saved under RenderDeck/characters/Levi');
  st = await page.evaluate(() => S.chars[0].views.slice(1).map(v => v.angle + '@' + v.home + ':' + v.img));
  ok(st.length===2 && st.every(x => x.includes(RENDER) && /\[output\]$/.test(x)), 'finished pictures join Levi, on Render: ' + st.join(' | '));
  ok(!syncs.length, 'Make angles never asks for a model copy or download: ' + syncs.join());
  ok(await page.evaluate(r => S.queue.every(e => !e.pin) && Object.keys(S.charJobs).length===0, RENDER), 'nothing left in the queue');
  // Render offline: the sheet says Render can't be reached, not that nobody has Qwen
  await page.evaluate(r => { pcOf(r).online = false; drawChars(); }, RENDER);
  ok((await page.textContent('#charBody')).includes("Render has Qwen-Image-Edit but can't be reached"), 'an offline Render is named as the one with Qwen');
  ok(await page.evaluate(() => { CH.id = S.chars[0].id; drawChars(); const im = document.querySelector('#charBody .cviews img'); drawQueue(); drawChars(); return im && im.isConnected; }), 'redrawing with nothing changed keeps the same pictures (no blinking)');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
