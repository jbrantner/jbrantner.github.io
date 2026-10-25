// 🧱 job cards (Jordan 2026-10-25): no main preview, a stack of jobs each with its own recipe and live preview;
// Another prompt / Another model render every combination; Hidden has its own jobs; 🧊 3D is a job.
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
  const sent = [], done = {}, held = []; let sock = null, n = 0, hold = false;
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
      const finish = () => {
        const ks = Object.keys(body.prompt).find(k => /^KSampler/.test(body.prompt[k].class_type));
        for(let i=1;i<=3;i++) sock.send(JSON.stringify({type:'progress',data:{value:i,max:3,prompt_id:id,node:ks}}));
        const prev = Buffer.concat([Buffer.from([0,0,0,1,0,0,0,2]), PNG]); sock.send(prev);
        if(hold){ held.push(() => end()); return; } end(); };
      const end = () => {
        const save = Object.keys(body.prompt).find(k => body.prompt[k].class_type==='SaveImage');
        const sub = body.prompt[save].inputs.filename_prefix.split('/').slice(0,-1).join('/'); // saved where the graph says, like ComfyUI
        sock.send(JSON.stringify({type:'executed',data:{node:save,prompt_id:id,output:{images:[{filename:'render_0000'+id.slice(1)+'.png',subfolder:sub,type:'output'}]}}}));
        done[id] = {status:{completed:true}, outputs:{[save]:{images:[{filename:'render_0000'+id.slice(1)+'.png',subfolder:sub,type:'output'}]}}};
        sock.send(JSON.stringify({type:'executing',data:{node:null,prompt_id:id}}));
      };
      setTimeout(finish, 50);
      return r.fulfill({ json:{prompt_id:id, number:0, node_errors:{}} });
    }
    r.fulfill({ status:404, body:'' });
  });
  await page.routeWebSocket(/render\.test\/ws/, ws => { sock = ws; });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  const textOf = (g, t) => Object.values(g).find(x => x._meta.title===t).inputs.text;
  const ckOf = g => Object.values(g).find(x => x.class_type==='CheckpointLoaderSimple').inputs.ckpt_name;
  const seedOf = g => Object.values(g).find(x => /^KSampler/.test(x.class_type)).inputs.seed ?? Object.values(g).find(x => /^KSampler/.test(x.class_type)).inputs.noise_seed;
  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.click('#connectBtn');
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on')); await page.evaluate(() => closeSheets());
  ok(!(await page.$('#feedHead')) && await page.isVisible('#jobOpen #stage') && (await page.$$('.job')).length===1, 'one job card, holding the picture; no Preview section');
  ok(await page.evaluate(() => document.querySelector('#strip').compareDocumentPosition(document.querySelector('#jobs')) & 4), 'thumbnails sit above the jobs');
  ok((await page.textContent('#goBtn'))==='Render', 'one job: the button says Render');
  await page.fill('#prompt', 'job one');
  await page.click('#goBtn'); await page.waitForFunction(() => S.gallery.length===1, null, {timeout:8000});
  const j1 = await page.evaluate(() => S.job);
  ok(await page.evaluate(j => S.gallery[0].job===j, j1), 'its picture belongs to the job');

  // ＋ Add a job: a copy of the open one, opened
  await page.click('#addJobBtn'); await page.waitForSelector('#jobSheet.open'); await page.click('#jobTray [data-job="render"]');
  ok((await page.$$('.job')).length===2 && (await page.$$('.job.fold')).length===1 && (await page.inputValue('#prompt'))==='job one', 'a new Render job starts as a copy and opens');
  ok((await page.textContent('#goBtn'))==='Render all', 'two jobs: the button says Render all');
  ok((await page.textContent('#jobHead b')).includes('Render 2') && (await page.textContent('.job.fold .jhead b')).includes('Render'), 'the jobs are named');
  await page.fill('#prompt', 'job two');
  // Another prompt + Another model: every prompt on every model, same seeds
  await page.click('#addBtn'); await page.click('#tray [data-add="xprompt"]'); await page.fill('.block[data-id] textarea[data-k="text"]', 'job two b');
  await page.click('#addBtn'); await page.click('#tray [data-add="xmodel"]');
  ok(await page.evaluate(() => S.blocks.find(b => b.type==='xmodel').ckpt)==='pony.safetensors', 'Another model picks a model the job is not using');
  ok((await page.textContent('#jobHead small')).includes('+1 prompt · +1 model'), 'the head line counts them');
  let s0 = sent.length; await page.click('#jobHead [data-jgo]'); await page.waitForFunction(() => S.gallery.length===5, null, {timeout:8000});
  const four = sent.slice(s0);
  const combos = four.map(g => ckOf(g) + '|' + textOf(g, 'Prompt').replace(/^.*?(job two( b)?)$/, '$1')).sort();
  ok(four.length===4 && combos.join()==='pony.safetensors|job two,pony.safetensors|job two b,sdxl.safetensors|job two,sdxl.safetensors|job two b', 'every prompt on every model: ' + combos.join());
  ok(new Set(four.map(seedOf)).size===1, 'the combinations share the seed');
  ok(await page.evaluate(() => S.prompt==='job two' && S.blocks.find(b => b.type==='model').ckpt==='sdxl.safetensors'), 'the job keeps its own prompt and model after');
  ok(await page.evaluate(() => S.gallery.slice(0, 4).every(g => g.job===S.job && !g.snap.blocks.some(b => b.type==='xprompt'))), "the four pictures are the job's, each with its one prompt as its settings");

  // open job 1 again: its recipe comes back, job 2 keeps its own
  await page.click('.job.fold .jmini');
  ok((await page.inputValue('#prompt'))==='job one' && await page.evaluate(() => !S.blocks.some(b => b.type==='xprompt')), 'opening job 1 brings back its recipe');
  ok(await page.evaluate(() => S.jobs[1].rec.prompt==='job two' && S.jobs[1].rec.blocks.some(b => b.type==='xmodel')), 'job 2 keeps its recipe while folded');
  ok(await page.evaluate(() => S.gallery[shownIdx] && S.gallery[shownIdx].job===S.job), "the open job's picture is its own last render");
  ok(!!(await page.$('.job.fold .jpic img')), 'the folded job shows its last picture');

  // Render all: every Render job, each with its own recipe
  s0 = sent.length; await page.click('#goBtn'); await page.waitForFunction(n => S.gallery.length===n, 10, {timeout:8000});
  const all = sent.slice(s0).map(g => textOf(g, 'Prompt'));
  ok(all.length===5 && all.filter(t => /job one$/.test(t)).length===1 && all.filter(t => /job two( b)?$/.test(t)).length===4, 'Render all sends both jobs: ' + all.length);
  ok((await page.inputValue('#prompt'))==='job one' && await page.evaluate(j => S.job===j, j1), 'job 1 is still the open one after Render all');

  // live preview per job: job 2 painting while job 1 is open shows in job 2's card, not job 1's picture
  hold = true; await page.click('.job.fold [data-jgo]');
  await page.waitForFunction(() => document.querySelector('.job.fold.run .jpic img[data-pv]'), null, {timeout:8000});
  ok(true, "the folded job shows its own live preview while it paints");
  ok(!(await page.isVisible('#status')), "the open job's picture shows no status for the other job's render");
  ok((await page.textContent('.job.fold .jtag')).includes('%'), 'the folded job head shows its progress');
  hold = false; while(held.length) held.shift()(); await page.waitForFunction(() => !S.queue.length, null, {timeout:8000});
  ok(await page.evaluate(() => S.gallery[shownIdx].job===S.job), "job 2's finished render didn't replace job 1's picture");

  // Hidden has its own jobs, with the same screen
  await page.click('#modeBtn'); await page.waitForTimeout(200);
  ok((await page.$$('.job')).length===1 && await page.isVisible('#jobOpen #stage') && (await page.textContent('#goBtn'))==='Render', 'Hidden starts with one job of its own');
  await page.click('#addJobBtn'); await page.click('#jobTray [data-job="render"]'); ok((await page.$$('.job')).length===2, 'Hidden can add jobs too');
  await page.click('#modeBtn'); await page.waitForTimeout(200);
  ok((await page.$$('.job')).length===2 && (await page.inputValue('#prompt'))==='job one', 'back from Hidden: the normal jobs and recipe');

  // 🧊 3D is a job for the picture shown
  await page.click('#addJobBtn'); ok(!(await page.$eval('#jobTray [data-job="d3"]', b => b.disabled)), '3D job offered for the picture shown');
  await page.click('#jobTray [data-job="d3"]');
  ok((await page.textContent('#jobHead b')).includes('🧊') && !!(await page.$('#jobOpen #d3Body')) && !(await page.$('#jobHead [data-jgo]')), 'the 3D job opens with the 3D block and no ▶ Render');
  ok((await page.$$eval('#tray [data-add="d3"]', x => x.length))===0, '3D is no longer in the block list');
  ok((await page.textContent('#goBtn'))==='Render all', 'Render all is still the Render jobs');
  // remove it
  page.once('dialog', d => d.accept()); await page.click('#jobHead [data-jx]');
  ok((await page.$$('.job')).length===2, 'a job can be removed');
  await page.reload(); await page.waitForTimeout(800);
  ok((await page.$$('.job')).length===2 && await page.evaluate(() => S.jobs.filter(j => j.rec).length===1), 'jobs survive a reload');

  ok(!logs.length, 'no console errors ' + logs.join(' | '));
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed');
  await browser.close(); process.exit(fail.length ? 1 : 0);
})();
