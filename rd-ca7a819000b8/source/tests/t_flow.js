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
        sock.send(JSON.stringify({type:'executed',data:{node:save,prompt_id:id,output:{images:[{filename:'render_0000'+n+'.png',subfolder:'RenderDeck',type:'output'}]}}}));
        done[id] = {status:{completed:true}, outputs:{[save]:{images:[{filename:'render_0000'+n+'.png',subfolder:'RenderDeck',type:'output'}]}}};
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
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#strip img').length===1, null, {timeout:8000});
  ok(true, 'test mode renders a pretend picture');
  await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const tj = JSON.parse(await page.textContent('#json')); ok(check(tj).length===0, 'test-mode graph is valid: '+check(tj).join('; '));
  await page.evaluate(() => closeSheets());

  // real (pretend) server
  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.click('#connectBtn');
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  ok(true, 'connects and reads models');
  ok((await page.$$eval('[data-k=ckpt] option', o => o.map(x=>x.textContent))).join()==='sdxl.safetensors,pony.safetensors', 'model list filled from object_info');
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#strip img').length===2, null, {timeout:5000});
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
  ok((await page.$$eval('#ideas .hl', s => s.map(x => x.textContent))).join('|')==='a girl|jumping jacks', 'sentence split into phrases');
  const sentPrompt = async () => { await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); const g = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets()); return textOf(g,'Prompt'); };
  ok((await sentPrompt()).endsWith(', 1girl, solo, jumping, exercising, arms up') && (await page.inputValue('#prompt'))==='A girl who is doing jumping jacks', 'Send as tags sends the picked tags and leaves the words in the box');
  await page.click('[data-pick=solo]'); ok(!(await sentPrompt()).includes('solo'), 'unticked tag is left out');
  await page.click('[data-ideas=mode]'); ok((await sentPrompt()).endsWith(', A girl who is doing jumping jacks'), 'switched off, the words go as typed');
  await page.click('[data-ideas=mode]'); await page.click('[data-pick=solo]');
  await page.click('[data-extra=upper_body]');
  ok((await sentPrompt()).endsWith(', upper body') && (await page.inputValue('#prompt'))==='A girl who is doing jumping jacks', 'extra tag sent after the words, prompt box untouched');
  await page.fill('#prompt', 'zelda and purah'); await page.waitForTimeout(400); await page.waitForSelector('#ideas .hl');
  ok((await page.$$eval('#ideas .irow:not(.wrap) .hl', s => s.map(x => x.textContent))).join('|')==='zelda|purah', 'character names in a sentence are found');
  ok((await sentPrompt()).includes('2girls, multiple girls, princess zelda, purah'), 'two named girls are counted: '+await sentPrompt());
  await page.fill('#prompt', 'zelda and purah and link'); await page.waitForTimeout(400);
  ok((await sentPrompt()).includes('2girls, multiple girls, 1boy, '), 'adding Link adds 1boy: '+await sentPrompt());
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
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#strip img').length===3, null, {timeout:5000});
  const g = sent[sent.length-1]; const types = Object.values(g).map(x=>x.class_type);
  ok(check(g).length===0, 'full graph valid: '+check(g).join('; '));
  ok(['LoraLoader','Canny','ControlNetApplyAdvanced','VAEEncode','ImageUpscaleWithModel'].every(t => types.includes(t)), 'all blocks appear in graph');
  ok(!types.includes('EmptyLatentImage'), 'start picture replaces blank canvas');
  ok('vae' in Object.values(g).find(x=>x.class_type==='ControlNetApplyAdvanced').inputs, 'ControlNet gets vae when supported');
  // LoRA activation words go into the prompt while the LoRA is on
  await page.fill('.block[style*="--lora"] [data-lw]', 'pixel style');
  await page.click('#graphBtn'); await page.waitForSelector('#graphSheet.open'); let lg = JSON.parse(await page.textContent('#json')); await page.evaluate(() => closeSheets());
  ok(textOf(lg,'Prompt').includes(', pixel style, ') && (await page.textContent('#addedPos')).includes('LoRA adds: pixel style'), 'LoRA activation words added: '+textOf(lg,'Prompt'));

  // reuse result as start picture
  await page.click('[data-act=pic]');
  const g2before = sent.length; await page.click('#goBtn'); await page.waitForFunction(n => document.querySelectorAll('#strip img').length===n, 4, {timeout:5000});
  const li = Object.values(sent[g2before]).find(x=>x._meta.title==='Start picture');
  ok(li.inputs.image==='RenderDeck/render_00002.png [output]', 'reused render points at output file: '+li.inputs.image);

  // renders in a row: 2× queues two prompts with different seeds, and both pictures come back
  await page.click('#runsUp'); ok((await page.textContent('#runsN'))==='2×', 'plus steps the count to 2×');
  const before = sent.length, strip = await page.$$eval('#strip img', x => x.length);
  await page.click('#goBtn'); await page.waitForFunction(n => document.querySelectorAll('#strip img').length===n, strip + 2, {timeout:8000});
  const seeds = sent.slice(before).map(g => (i => i.seed ?? i.noise_seed)(Object.values(g).find(x => x._meta.title==='Painting').inputs));
  ok(seeds.length===2 && seeds[0]!==seeds[1], 'two renders queued with different seeds');
  await page.click('#runsDown'); ok((await page.textContent('#runsN'))==='1×' && await page.isDisabled('#runsDown'), 'minus steps back to 1× and stops there');

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
