// Drives the app on a phone-sized page against a pretend ComfyUI (routes + websocket),
// and checks each graph it sends: every link points at a real node and output, and
// every node gets the inputs ComfyUI's own definitions require.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'comfy-app.html');
const SERVER = 'https://render.test';
const DEF = { // required inputs and output count, copied from ComfyUI nodes.py
  CheckpointLoaderSimple:[['ckpt_name'],3], CLIPTextEncode:[['text','clip'],1], EmptyLatentImage:[['width','height','batch_size'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1],
  VAEDecode:[['samples','vae'],1], SaveImage:[['images','filename_prefix'],0], LoraLoader:[['model','clip','lora_name','strength_model','strength_clip'],2],
  ControlNetLoader:[['control_net_name'],1], ControlNetApplyAdvanced:[['positive','negative','control_net','image','strength','start_percent','end_percent'],2],
  LoadImage:[['image'],2], Canny:[['image','low_threshold','high_threshold'],1], VAEEncode:[['pixels','vae'],1],
  ImageScale:[['image','upscale_method','width','height','crop'],1], ImageScaleBy:[['image','upscale_method','scale_by'],1],
  UpscaleModelLoader:[['model_name'],1], ImageUpscaleWithModel:[['upscale_model','image'],1],
  CLIPSetLastLayer:[['clip','stop_at_clip_layer'],1],
  VAEEncodeTiled:[['pixels','vae','tile_size','overlap'],1], VAEDecodeTiled:[['samples','vae','tile_size','overlap'],1],
  ModelMergeSDXL:[['model1','model2','input_blocks.0','middle_block.0','output_blocks.8','out.'],1],
  KSamplerAdvanced:[['model','add_noise','noise_seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','start_at_step','end_at_step','return_with_leftover_noise'],1],
  UltimateSDUpscale:[['image','model','positive','negative','vae','upscale_by','seed','steps','cfg','sampler_name','scheduler','denoise','upscale_model','mode_type','tile_width','tile_height'],1],
  UltimateSDUpscaleNoUpscale:[['upscaled_image','model','positive','negative','vae','seed','steps','cfg','denoise'],1],
  RenderDeckUpscaleColorFix:[['image','image_ref','strength','levels'],1],
  FaceDetailer:[['image','model','clip','vae','positive','negative','bbox_detector','denoise','guide_size'],6], UltralyticsDetectorProvider:[['model_name'],2],
};
function check(g){
  const errs = [];
  for(const [id,n] of Object.entries(g)){
    const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){
      const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing node '+v[0]);
      else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]);
    }
  }
  return errs;
}
const combo = a => [a]; // older ComfyUI style
const comboNew = a => ['COMBO',{options:a}];
const OI = {
  CheckpointLoaderSimple:{input:{required:{ckpt_name:combo(['sdxl.safetensors','pony.safetensors'])}}},
  LoraLoader:{input:{required:{lora_name:comboNew(['pixel.safetensors'])}}},
  ControlNetLoader:{input:{required:{control_net_name:combo(['canny-sdxl.safetensors'])}}},
  ControlNetApplyAdvanced:{input:{required:{},optional:{vae:['VAE']}}},
  UpscaleModelLoader:{input:{required:{model_name:combo(['4x-UltraSharp.pth'])}}},
  KSampler:{input:{required:{sampler_name:combo(['euler','euler_ancestral','dpmpp_2m']),scheduler:combo(['normal','karras'])}}},
};
for(const k of Object.keys(DEF)) OI[k] = OI[k] || {input:{required:{}}};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');

(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(SRC,'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error') logs.push(m.text()); });
  const sent = [], done = {}; let sock = null, n = 0;
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/chars.txt', r => r.fulfill({ contentType:'text/plain', body:fs.readFileSync(path.join(__dirname, '..', '..', 'chars.txt'), 'utf8') }));
  await page.route('https://app.test/tags.txt', r => r.fulfill({ contentType:'text/plain', body:fs.readFileSync(path.join(__dirname, '..', '..', 'tags.txt'), 'utf8') }));
  await page.route('https://app.test/words.txt', r => r.fulfill({ contentType:'text/plain', body:fs.readFileSync(path.join(__dirname, '..', '..', 'words.txt'), 'utf8') }));
  await page.route(SERVER+'/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname==='/upload/image') return r.fulfill({ json:{name:'phone.png',subfolder:'',type:'input'} });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname.startsWith('/history/') && done[u.pathname.slice(9)]) return r.fulfill({ json:{[u.pathname.slice(9)]:done[u.pathname.slice(9)]} });
    if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{jobs:[]} });
    if(u.pathname.startsWith('/history') || u.pathname.startsWith('/renderdeck/') || u.pathname.startsWith('/view_metadata')) return r.fulfill({ json:{} });
    if(u.pathname==='/prompt'){
      const body = JSON.parse(r.request().postData()); sent.push(body.prompt);
      const id = 'p'+(++n), errs = check(body.prompt);
      if(errs.length) return r.fulfill({ status:400, json:{error:{message:'bad graph'},node_errors:{}} });
      setTimeout(() => {
        const ks = Object.keys(body.prompt).find(k => /^KSampler/.test(body.prompt[k].class_type));
        for(let i=1;i<=3;i++) sock.send(JSON.stringify({type:'progress',data:{value:i,max:3,prompt_id:id,node:ks}}));
        const prev = Buffer.concat([Buffer.from([0,0,0,1,0,0,0,2]), PNG]); sock.send(prev);
        const save = Object.keys(body.prompt).find(k => body.prompt[k].class_type==='SaveImage');
        const sub = body.prompt[save].inputs.filename_prefix.split('/').slice(0,-1).join('/'); // saved where the graph says, like ComfyUI
        sock.send(JSON.stringify({type:'executed',data:{node:save,prompt_id:id,output:{images:[{filename:'render_0000'+id.slice(1)+'.png',subfolder:sub,type:'output'}]}}}));
        done[id] = {status:{completed:true}, outputs:{[save]:{images:[{filename:'render_0000'+id.slice(1)+'.png',subfolder:sub,type:'output'}]}}};
        sock.send(JSON.stringify({type:'executing',data:{node:null,prompt_id:id}}));
      }, 50);
      return r.fulfill({ json:{prompt_id:id, number:0, node_errors:{}} });
    }
    r.fulfill({ status:404, body:'' });
  });
  await page.routeWebSocket(/render\.test\/ws/, ws => { sock = ws; });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };

  // test mode first
  await page.click('#openSettings'); await page.click('#testBtn');
  await page.fill('#prompt', 'lantern hunter');
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#recentRow img').length===1, null, {timeout:8000});
  ok(true, 'test mode renders a pretend picture');
  await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const tj = JSON.parse(await page.textContent('#json')); ok(check(tj).length===0, 'test-mode graph is valid: '+check(tj).join('; '));
  await page.evaluate(() => closeSheets());

  // real (pretend) server
  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.click('#connectBtn');
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  ok(true, 'connects and reads models');
  ok((await page.$$eval('[data-k=ckpt] option', o => o.map(x=>x.textContent))).join()==='sdxl.safetensors,pony.safetensors', 'model list filled from object_info');
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#recentRow img').length===2, null, {timeout:5000});
  ok(sent.length===1 && check(sent[0]).length===0, 'plain text-to-image graph valid');

  // prompt styles: the SDXL model gets the SDXL prefix, a pony-named model gets score tags and CLIP skip 2
  const textOf = (g, t) => Object.values(g).find(x => x._meta.title===t).inputs.text;
  ok(/^high quality, highly detailed, lantern hunter$/.test(textOf(sent[0],'Prompt')), 'SDXL style adds its prefix: '+textOf(sent[0],'Prompt'));
  // blocks start folded to their summary line; tapping the header shows the details, tapping again folds it
  ok(!(await page.isVisible('[data-k=ckpt]')) && (await page.textContent('.block[style*="--model"] small')).includes('sdxl.safetensors'), 'blocks start folded with a summary line');
  await page.click('.block[style*="--model"] h3'); ok(await page.isVisible('[data-k=ckpt]'), 'tapping a block opens it');
  await page.click('.block[style*="--model"] h3'); ok(!(await page.isVisible('[data-k=ckpt]')), 'tapping again folds it');
  await page.click('.block[style*="--model"] h3'); await page.click('.block[style*="--samp"] h3');
  await page.selectOption('[data-k=ckpt]', 'pony.safetensors');
  await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const pg = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets());
  ok(check(pg).length===0 && Object.values(pg).some(x => x.class_type==='CLIPSetLastLayer' && x.inputs.stop_at_clip_layer===-2), 'Pony style adds CLIP skip 2: '+check(pg).join('; '));
  ok(/^score_9, score_8_up/.test(textOf(pg,'Prompt')) && /^score_6, /.test(textOf(pg,'Avoid')), 'Pony style adds score tags');
  const ks = Object.values(pg).find(x => x._meta.title==='Painting').inputs;
  // Finishing pass: Painting stops at 80% and passes its leftover noise on; the finishing sampler adds none and picks up from there
  const fin = Object.values(pg).find(x => x._meta.title==='Finishing pass (no added noise)');
  ok(fin && ks.return_with_leftover_noise==='enable' && ks.end_at_step===fin.inputs.start_at_step && fin.inputs.add_noise==='disable' && fin.inputs.start_at_step===Math.round(ks.steps*0.8),
    'finishing pass continues the leftover noise instead of re-running a finished picture');
  ok(ks.cfg===7 && ks.steps===25 && ks.sampler_name==='euler_ancestral', 'Pony model gets Pony settings: cfg '+ks.cfg+', '+ks.steps+' steps, '+ks.sampler_name);
  await page.click('.block[style*="--model"] [data-seg=style][data-v=illustrious]');
  ok((await page.textContent('#addedPos')).includes('masterpiece'), 'picked style is shown under the prompt');
  // tag suggestions: typing part of a tag offers it with spaces and escaped brackets
  await page.fill('#prompt', ''); await page.type('#prompt', '1girl, long_ha');
  await page.waitForSelector('#ac button'); const chips = await page.$$eval('#ac button', b => b.map(x => x.firstChild.textContent));
  ok(chips[0]==='long hair', 'suggests long hair first: '+chips.slice(0,3).join(' | '));
  await page.click('#ac button[data-i="0"]');
  ok((await page.inputValue('#prompt'))==='1girl, long hair, ', 'tapping a suggestion fills the tag: '+await page.inputValue('#prompt'));
  await page.type('#prompt', 'saber_(fa'); await page.waitForSelector('#ac button');
  ok((await page.$$eval('#ac button', b => b.map(x => x.firstChild.textContent))).includes('saber \\(fate\\)'), 'brackets in tags are escaped');
  await page.fill('#prompt', ''); await page.type('#prompt', 'girl'); await page.waitForSelector('#ac button');
  ok((await page.textContent('#ac button[data-i="0"]')).startsWith('1girl'), 'girl finds 1girl first');
  // a written sentence becomes tag ideas phrase by phrase, plus optional extras
  await page.fill('#prompt', 'A girl who is doing jumping jacks'); await page.waitForTimeout(400); await page.waitForSelector('#ideas .hl');
  ok((await page.$$eval('#ideas .irow:not(.wrap) .hl', s => s.map(x => x.textContent))).join('|')==='girl|jumping jacks', 'sentence split into phrases');
  await page.fill('#prompt', 'a girl hitting another girl'); await page.waitForTimeout(400);
  ok((await page.textContent('#ideas')).includes('2girls, multiple girls, hitting'), 'a girl hitting another girl is 2girls, the words replaced by their tags');
  await page.fill('#prompt', 'a woman holding her daughter\'s hand'); await page.waitForTimeout(400);
  ok((await page.textContent('#ideas')).includes('2girls, multiple girls, mature female, holding hands'), 'her daughter is a second girl, and holding her hand is holding hands');
  await page.fill('#prompt', 'a girl, the girl waves'); await page.waitForTimeout(400);
  ok((await page.textContent('#ideas')).includes('1girl, solo, waving'), 'the same girl mentioned again counts once');
  // a misspelt character, a tag spread over the sentence and a plain word: no adult tags offered for "magic"
  await page.fill('#prompt', 'freiren casting an epic magic spell'); await page.waitForTimeout(400);
  ok((await page.$$eval('#ideas .irow:not(.wrap) .hl', s => s.map(x => x.textContent))).join('|')==='freiren|casting … spell|magic', 'Jordan\'s example is read phrase by phrase');
  ok((await page.textContent('#ideas')).includes('1girl, solo, frieren, sousou no frieren, casting spell, epic, magic') && !(await page.textContent('#ideas')).includes('hitachi'), 'frieren, casting spell and magic, nothing odd');
  await page.fill('#prompt', 'A girl who is doing jumping jacks'); await page.waitForTimeout(400);
  const sentPrompt = async () => { await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const g = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets()); return textOf(g,'Prompt'); };
  ok((await sentPrompt()).endsWith(', 1girl, solo, jumping, exercising, arms up') && (await page.inputValue('#prompt'))==='A girl who is doing jumping jacks', 'Send as tags sends the picked tags and leaves the words in the box');
  await page.click('[data-pick=solo]'); ok(!(await sentPrompt()).includes('solo'), 'unticked tag is left out');
  await page.click('[data-ideas=mode]'); ok((await sentPrompt()).endsWith(', A girl who is doing jumping jacks'), 'switched off, the words go as typed');
  await page.click('[data-ideas=mode]'); await page.click('[data-pick=solo]');
  await page.click('[data-extra=upper_body]');
  ok((await sentPrompt()).endsWith(', upper body') && (await page.inputValue('#prompt'))==='A girl who is doing jumping jacks', 'extra tag sent after the words, prompt box untouched');
  await page.fill('#prompt', 'zelda and purah'); await page.waitForTimeout(400); await page.waitForSelector('#ideas .hl');
  ok((await page.$$eval('#ideas .irow:not(.wrap) .hl', s => s.map(x => x.textContent))).join('|')==='zelda|purah', 'character names in a sentence are found');
  ok((await sentPrompt()).includes('2girls, multiple girls, princess zelda, the legend of zelda, purah'), 'two named girls are counted: '+await sentPrompt());
  await page.fill('#prompt', 'zelda and purah and link'); await page.waitForTimeout(400);
  ok((await sentPrompt()).includes('2girls, multiple girls, 1boy, '), 'adding Link adds 1boy: '+await sentPrompt());
  // adult words: the style's rating follows them (general -> nsfw, nsfw out of the style's negative), and can be kept as it was
  const texts = async () => { await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const g = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets()); return [textOf(g,'Prompt'), textOf(g,'Avoid')]; };
  const items = s => s.split(',').map(x => x.trim());
  await page.fill('#prompt', 'a naked woman relaxing in a hot spring'); await page.waitForTimeout(400);
  ok((await page.textContent('#ideas')).includes('General → nsfw; nsfw taken out of the style\'s negative'), 'adult words: the rating row says what changes');
  let [tp, tn] = await texts();
  ok(items(tp).includes('nsfw') && !items(tp).includes('general') && items(tp).includes('nude') && !items(tn).includes('nsfw'), 'adult words: nsfw rating sent, nsfw out of the negative: ' + tp + ' / ' + tn);
  await page.click('[data-ideas=rate]'); [tp, tn] = await texts();
  ok(items(tp).includes('general') && items(tn).includes('nsfw'), 'rating kept as the style has it when switched off');
  await page.click('[data-ideas=rate]');
  await page.fill('#prompt', 'a woman in lingerie'); await page.waitForTimeout(400); [tp, tn] = await texts();
  ok(items(tp).includes('sensitive') && items(tn).includes('nsfw'), 'lingerie is sensitive, nsfw stays in the negative');
  await page.fill('#prompt', 'a girl reading in a library'); await page.waitForTimeout(400); [tp, tn] = await texts();
  ok(items(tp).includes('general') && items(tn).includes('nsfw') && !(await page.textContent('#ideas')).includes('Rating'), 'an ordinary prompt keeps general and shows no rating row');
  await page.selectOption('[data-k=ckpt]', 'sdxl.safetensors'); await page.type('#prompt', 'smil'); await page.waitForTimeout(150);
  ok(await page.isHidden('#ac'), 'no tag suggestions for SDXL');
  await page.fill('#prompt', 'lantern hunter');

  // add every block
  for(const t of ['lora','cn','pic','up']){ await page.click('#addBtn'); await page.click(`[data-add=${t}]`); }
  await page.click('#goBtn');
  ok(/guide picture/.test(await page.textContent('#err')), 'missing pictures are explained before sending');
  // give pictures
  const tmp = path.join(__dirname, 'tiny.png'); fs.writeFileSync(tmp, PNG);
  for(const sel of ['--cn','--pic']){ const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`.block[style*="${sel}"] [data-do=pick]`)]); await fc.setFiles(tmp); await page.waitForTimeout(200); }
  await page.click('.block[style*="--cn"] [data-seg=prep][data-v=edges]');
  await page.click('.block[style*="--up"] [data-seg=mode][data-v=model]');
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#recentRow img').length===3, null, {timeout:5000});
  const g = sent[sent.length-1]; const types = Object.values(g).map(x=>x.class_type);
  ok(check(g).length===0, 'full graph valid: '+check(g).join('; '));
  ok(['LoraLoader','Canny','ControlNetApplyAdvanced','VAEEncode','ImageUpscaleWithModel'].every(t => types.includes(t)), 'all blocks appear in graph');
  ok(!types.includes('EmptyLatentImage'), 'start picture replaces blank canvas');
  ok('vae' in Object.values(g).find(x=>x.class_type==='ControlNetApplyAdvanced').inputs, 'ControlNet gets vae when supported');
  // LoRA activation words go into the prompt while the LoRA is on
  await page.fill('.block[style*="--lora"] [data-lw]', 'pixel style');
  await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); let lg = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets());
  ok(textOf(lg,'Prompt').includes(', pixel style, ') && (await page.textContent('#addedPos')).includes('LoRA adds: pixel style'), 'LoRA activation words added: '+textOf(lg,'Prompt'));
  // Redraw upscale: soft tile edges + Band Pass seam fix, then colours taken back from the picture before the upscale
  await page.click('.block[style*="--up"] [data-seg=mode][data-v=redraw]');
  const upGraph = async () => { await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const x = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets()); return x; };
  let rg = await upGraph(), us = Object.values(rg).find(x => /^UltimateSDUpscale/.test(x.class_type)), cf = Object.entries(rg).find(([k, x]) => x.class_type==='RenderDeckUpscaleColorFix');
  ok(check(rg).length===0 && us.inputs.seam_fix_mode==='Band Pass' && us.inputs.tile_padding===64 && us.inputs.mask_blur===16 && us.inputs.seam_fix_denoise<=0.3, 'redraw smooths seams: ' + check(rg).join('; '));
  const usId = Object.keys(rg).find(k => rg[k]===us), src = us.inputs.image || rg[us.inputs.upscaled_image[0]].inputs.image;
  ok(cf && cf[1].inputs.image[0]===usId && JSON.stringify(cf[1].inputs.image_ref)===JSON.stringify(src) && rg[src[0]].class_type==='VAEDecode', 'keep colours matches the redraw to the picture before it');
  const ckId = Object.keys(rg).find(k => rg[k].class_type==='CheckpointLoaderSimple');
  ok(rg[us.inputs.model[0]].class_type==='LoraLoader', 'with keep colours the tiles are redrawn with the LoRAs');
  const fd = Object.values(rg).find(x => x.class_type==='FaceDetailer');
  ok(fd ? fd.inputs.image[0]===cf[0] : rg[Object.keys(rg).find(k => rg[k].class_type==='SaveImage')].inputs.images[0]===cf[0], 'the colour-fixed picture goes on to faces or the save');
  await page.click('.block[style*="--up"] [data-do=seams]'); await page.click('.block[style*="--up"] [data-do=keepColour]');
  rg = await upGraph(); us = Object.values(rg).find(x => /^UltimateSDUpscale/.test(x.class_type));
  ok(us.inputs.model[0]===ckId, 'without keep colours the tiles use the bare checkpoint');
  ok(us.inputs.seam_fix_mode==='None' && !Object.values(rg).some(x => x.class_type==='RenderDeckUpscaleColorFix') && /Smooth seams: off/.test(await page.textContent('.block[style*="--up"]')), 'both switch off');
  await page.click('.block[style*="--up"] [data-do=seams]'); await page.click('.block[style*="--up"] [data-do=keepColour]');
  await page.click('.block[style*="--up"] [data-seg=mode][data-v=model]');

  // reuse result as start picture
  // the big picture and the thumbnail strip, all in one section that folds; the library's latest row opens a render there
  ok(await page.isVisible('#shown') && (await page.$$eval('#strip img', x => x.length))===3, 'big picture with thumbnails below');
  // the picture viewer works like a photo app: tap the picture, swipe sideways for the next one, pinch to zoom, swipe down to close
  const swipe = (sel, from, to, two) => page.evaluate(([sel, from, to, two]) => { const el = document.querySelector(sel);
    const T = (x, y, id) => new Touch({identifier:id, target:el, clientX:x, clientY:y});
    const fire = (type, list) => el.dispatchEvent(new TouchEvent(type, {touches:type==='touchend' ? [] : list, changedTouches:list, bubbles:true, cancelable:true}));
    const at = f => two ? [T(from[0] - 40 - f*60, from[1], 1), T(from[0] + 40 + f*60, from[1], 2)] : [T(from[0] + (to[0]-from[0])*f, from[1] + (to[1]-from[1])*f, 1)];
    fire('touchstart', at(0)); for(let k = 1; k <= 6; k++) fire('touchmove', at(k/6)); fire('touchend', at(1)); }, [sel, from, to, two]);
  await page.click('#shown'); ok(await page.isVisible('#viewer') && (await page.$$eval('#vStrip img', x => x.length))===3 && (await page.textContent('#vInfo'))==='1 / 3', 'tapping the picture opens the viewer with thumbnails');
  await page.waitForTimeout(350); await swipe('#vStage', [300, 300], [80, 300]); await page.waitForTimeout(400);
  ok((await page.textContent('#vInfo'))==='2 / 3' && (await page.$eval('#vStrip img.sel', i => i.dataset.v))==='1', 'swiping left shows the next picture');
  await page.waitForTimeout(350); await swipe('#vStage', [200, 300], [200, 300], true); ok(await page.evaluate(() => V.s > 1.5), 'pinching zooms in');
  await page.waitForTimeout(350); await page.evaluate(() => vMove(1,0,0)); await swipe('#vStage', [200, 200], [200, 420]); await page.waitForTimeout(300);
  ok(await page.isHidden('#viewer'), 'swiping down closes the viewer');
  await page.click('#libBtn'); await page.waitForSelector('#libSheet.open'); await page.waitForTimeout(300);
  await swipe('#libSheet .grab', [195, 470], [195, 640]); await page.waitForTimeout(300); ok(!(await page.$('#libSheet.open')), 'swiping a menu down closes it');
  // the prompt folds to one line showing the prompt itself
  await page.click('#promptHead'); ok(!(await page.isVisible('#prompt')) && (await page.textContent('#promptSum')).includes(await page.evaluate(() => S.prompt.trim().slice(0,10))), 'the prompt folds to a line with the prompt');
  await page.click('#promptHead'); ok(await page.isVisible('#prompt'), 'and opens again');
  // Hidden gets the same screen: preview with thumbnails, the viewer, draft button, library, folding
  await page.click('#modeBtn'); ok((await page.textContent('h1 span'))==='Hidden', 'Hidden on');
  const hBefore = sent.length; await page.click('#goBtn'); await page.waitForFunction(n => S.gallery.length===1, null, {timeout:8000});
  ok(sent.length===hBefore + 1 && await page.isVisible('#shown') && (await page.$$eval('#strip img', x => x.length))===1 && await page.isVisible('#feedHead') && await page.isVisible('#draftBtn'), 'Hidden has the preview, thumbnails and draft button');
  await page.click('#shown'); ok(await page.isVisible('#viewer') && (await page.$$eval('#vStrip img', x => x.length))===1, 'Hidden opens the photo viewer');
  await page.click('#vClose'); await page.click('#promptHead'); ok(!(await page.isVisible('#prompt')) && await page.isVisible('#promptSum'), 'Hidden prompt folds too'); await page.click('#promptHead');
  await page.click('#shown');
  await page.click('#vClose'); await page.click('#libBtn'); await page.waitForSelector('#libSheet.open'); ok((await page.$$eval('#recentRow img', x => x.length))===1, 'Hidden library shows its own latest');
  await page.evaluate(() => closeSheets()); await page.waitForTimeout(300); await page.click('#modeBtn'); ok((await page.$$eval('#strip img', x => x.length))===3, 'back from Hidden with the normal thumbnails');
  await page.click('#feedHead'); ok(!(await page.isVisible('#shown')) && !(await page.isVisible('#strip')), 'the preview section folds');
  await page.click('#libBtn'); await page.waitForSelector('#libSheet.open'); await page.click('#recentRow [data-i="1"]');
  ok(!(await page.$('#libSheet.open')) && await page.isVisible('#shown') && (await page.$eval('#strip img.sel', i => i.dataset.i))==='1', 'a render tapped in the library opens in the preview');
  await page.click('#strip img[data-i="0"]');
  await page.click('#shown'); await page.click('#vGal [data-act=pic]'); // the row under the picture is gone (Jordan 2026-10-24): the viewer has it
  const g2before = sent.length; await page.click('#goBtn'); await page.waitForFunction(n => document.querySelectorAll('#recentRow img').length===n, 4, {timeout:5000});
  const li = Object.values(sent[g2before]).find(x=>x._meta.title==='Start picture');
  ok(li.inputs.image==='RenderDeck/render_00002.png [output]', 'reused render points at output file: '+li.inputs.image);

  // renders in a row: 2× queues two prompts with different seeds, and both pictures come back
  await page.click('#runsUp'); ok((await page.textContent('#runsN'))==='2×', 'plus steps the count to 2×');
  const before = sent.length, strip = await page.$$eval('#recentRow img', x => x.length);
  await page.click('#goBtn'); await page.waitForFunction(n => document.querySelectorAll('#recentRow img').length===n, strip + 2, {timeout:8000});
  const seeds = sent.slice(before).map(g => (i => i.seed ?? i.noise_seed)(Object.values(g).find(x => x._meta.title==='Painting').inputs));
  ok(seeds.length===2 && seeds[0]!==seeds[1], 'two renders queued with different seeds');
  await page.click('#runsDown'); ok((await page.textContent('#runsN'))==='1×' && await page.isDisabled('#runsDown'), 'minus steps back to 1× and stops there');

  // draft mode: renders stop partway as drafts; ticking one and Finish sends the full render with the same seed
  const seedOf = g => (i => i.seed ?? i.noise_seed)(Object.values(g).find(x => /^(Painting|Draft)/.test(x._meta.title)).inputs);
  const saveOf = g => Object.values(g).find(x => x.class_type==='SaveImage').inputs.filename_prefix;
  await page.click('#draftBtn'); await page.click('#runsUp'); ok((await page.textContent('#goBtn'))==='Draft', 'draft mode on: the button says Draft');
  const dBefore = sent.length;
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#draftRows .frow').length===2, null, {timeout:8000});
  const drafts = sent.slice(dBefore), stopAt = await page.evaluate(() => draftStep(S.blocks.find(b => b.type==='sampler')));
  const lastKs = g => Object.values(g).find(x => x._meta.title.startsWith('Draft: stop'));
  ok(drafts.length===2 && drafts.every(g => !check(g).length && lastKs(g) && lastKs(g)._meta.title.endsWith(' ' + stopAt) && lastKs(g).inputs.end_at_step - lastKs(g).inputs.start_at_step===stopAt && lastKs(g).inputs.return_with_leftover_noise==='disable'
    && /\/drafts\/draft$/.test(saveOf(g)) && !Object.values(g).some(x => /FaceDetailer|UltimateSDUpscale|ImageScaleBy/.test(x.class_type))),
    'drafts stop at step ' + stopAt + ' with no upscale or face fix: ' + drafts.map(check).flat().join('; '));
  ok(await page.isVisible('#drafts') && await page.$$eval('#draftRows .tick', t => t.length)===2, 'drafts wait under the main list with a tick box each');
  await page.click('#draftRows .tick >> nth=1'); ok((await page.textContent('#draftBar')).includes('Finish 1'), 'ticking a draft offers Finish 1: ' + await page.textContent('#draftBar'));
  const pickedSeed = await page.evaluate(() => S.gallery.find(g => g.draft && !g.sent && [...picked].includes(g.url)).seed), gBefore = await page.evaluate(() => S.gallery.length);
  await page.click('#draftGo'); await page.waitForFunction(n => S.gallery.length===n, gBefore + 1, {timeout:8000});
  const fg = sent[sent.length - 1];
  ok(sent.length===dBefore + 3 && !check(fg).length && !lastKs(fg) && /\/render$/.test(saveOf(fg)) && seedOf(fg)===pickedSeed && drafts.some(g => seedOf(g)===pickedSeed),
    'Finish sends the full render with the draft\'s seed ' + pickedSeed + ': ' + check(fg).join('; '));
  const dk = Object.values(drafts.find(g => seedOf(g)===pickedSeed)).filter(x => x.class_type==='KSamplerAdvanced'), fk = Object.values(fg).filter(x => x.class_type==='KSamplerAdvanced');
  ok(dk.length && fk.length && ['steps','cfg','sampler_name','scheduler','start_at_step'].every(k => dk[0].inputs[k]===fk[0].inputs[k]), 'the finished render starts exactly like its draft');
  ok(await page.$$eval('#draftRows .frow', r => r.length)===1, 'the finished draft leaves the drafts list, the other stays');
  page.once('dialog', d => d.accept()); await page.click('#draftDrop'); ok(await page.isHidden('#drafts'), 'Put away clears the drafts list');
  await page.click('#draftBtn'); await page.click('#runsDown'); ok((await page.textContent('#goBtn'))==='Render', 'draft mode off again');

  // switching a block off removes it
  await page.locator('.block[style*="--lora"] [data-do=toggle]').dispatchEvent('click');
  await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); ok(!(await page.textContent('#json')).includes('LoraLoader'), 'switched-off block left out');
  await page.evaluate(() => closeSheets());
  await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({ path: path.join(__dirname, 'shot-top.png') }); await page.evaluate(()=>document.querySelector('.block[style*="--cn"]').scrollIntoView()); await page.screenshot({ path: path.join(__dirname, 'shot-blocks.png') }); await page.click('#addBtn'); await page.waitForTimeout(400); await page.screenshot({ path: path.join(__dirname, 'shot-tray.png') }); await page.evaluate(() => closeSheets());
  ok(logs.length===0, 'no console errors '+logs.join(' | '));
  fs.unlinkSync(tmp);
  await browser.close();
  if(fail.length){ console.log(fail.length+' failed'); process.exit(1); } console.log('all passed');
})();
