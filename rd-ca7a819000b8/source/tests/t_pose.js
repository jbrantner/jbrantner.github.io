// Pose board: stick figures dragged on the phone, each given a character, sent as an OpenPose guide picture to a
// union ControlNet (ProMax, told to read it as OpenPose); each character's tags go into their figure's area.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SERVER = 'https://jordo-desktop.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const DEF = {
  CheckpointLoaderSimple:[['ckpt_name'],3], CLIPTextEncode:[['text','clip'],1], EmptyLatentImage:[['width','height','batch_size'],1],
  KSampler:[['model','seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','denoise'],1],
  KSamplerAdvanced:[['model','add_noise','noise_seed','steps','cfg','sampler_name','scheduler','positive','negative','latent_image','start_at_step','end_at_step','return_with_leftover_noise'],1],
  VAEDecode:[['samples','vae'],1], SaveImage:[['images','filename_prefix'],0], LoadImage:[['image'],2],
  ControlNetLoader:[['control_net_name'],1], SetUnionControlNetType:[['control_net','type'],1],
  ControlNetApplyAdvanced:[['positive','negative','control_net','image','strength','start_percent','end_percent'],2],
  ConditioningSetArea:[['conditioning','width','height','x','y','strength'],1], ConditioningCombine:[['conditioning_1','conditioning_2'],1],
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
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler_ancestral']), scheduler:C(['normal'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}}, ControlNetLoader:{input:{required:{control_net_name:C(['canny-sdxl.safetensors','diffusion_pytorch_model_promax.safetensors'])}}},
  ControlNetApplyAdvanced:{input:{required:{},optional:{vae:['VAE']}}}};
for(const k of Object.keys(DEF)) OI[k] = OI[k] || {input:{required:{}}};
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  const sent = [], uploads = [];
  await page.route(SERVER + '/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname==='/upload/image'){ const m = (r.request().postData() || '').match(/filename="([^"]+)"/); uploads.push(m[1]); return r.fulfill({ json:{name:m[1], subfolder:'', type:'input'} }); }
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:sent.map((x, i) => [i, 'p' + (i + 1)])} }); // still waiting, so nothing is sent again
    if(u.pathname==='/prompt'){ const body = JSON.parse(r.request().postData()); sent.push(body.prompt); return r.fulfill({ json:{prompt_id:'p' + sent.length, number:0, node_errors:{}} }); }
    if(u.pathname.startsWith('/history')) return r.fulfill({ json:{} });
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', SERVER + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(() => { closeSheets(); S.blocks.find(b => b.type==='model').ckpt = 'oneObsession_v24.safetensors'; S.styles['oneObsession_v24.safetensors'] = 'illustrious';
    S.chars = [{id:'c1', name:'Levi', tags:'1boy, black hair, red eyes, black coat', color:'#ff5ca8', views:[]}, {id:'c2', name:'Mira', tags:'1girl, long hair, white hair, blue dress', color:'#33c2c9', views:[]}]; save(); render(); });

  await page.click('#addBtn'); await page.click('#tray [data-add="pose"]');
  const b0 = await page.evaluate(() => { const b = S.blocks.find(x => x.type==='pose'); return {model:b.model, figs:b.figs.length, cid:b.figs[0].cid}; });
  ok(b0.model==='diffusion_pytorch_model_promax.safetensors' && b0.figs===1 && b0.cid==='c1', 'a new Pose board picks ProMax and starts with one figure, given the first character: ' + JSON.stringify(b0));
  ok(await page.isVisible('.block canvas[data-board]'), 'the board is drawn in the block');
  await page.click('.block [data-do="fig"][data-v="fighting"]');
  const b1 = await page.evaluate(() => { const b = S.blocks.find(x => x.type==='pose'); return b.figs.map(f => f.cid + '@' + f.pts[1][0].toFixed(2)); });
  ok(b1.length===2 && b1[0].startsWith('c1@0.33') && b1[1].startsWith('c2@0.67'), 'a second figure spreads the two evenly, with the next character: ' + b1.join(' '));
  // drag the second figure's neck: the whole figure moves
  const cv = await page.$('.block canvas[data-board]'), box = await cv.boundingBox();
  const before = await page.evaluate(() => S.blocks.find(x => x.type==='pose').figs[1].pts.map(p => p.slice()));
  const nx = box.x + before[1][0] * box.width, ny = box.y + before[1][1] * box.height;
  await page.mouse.move(nx, ny); await page.mouse.down(); await page.mouse.move(nx - 20, ny + 10, {steps:4}); await page.mouse.up();
  const after = await page.evaluate(() => S.blocks.find(x => x.type==='pose').figs[1].pts);
  const dx = after[1][0] - before[1][0], same = after.every((p, i) => Math.abs((p[0] - before[i][0]) - dx) < 1e-6);
  ok(dx < -0.02 && same, 'dragging the neck moves the whole figure');
  // drag the right wrist alone: elbow stays
  const wx = box.x + after[4][0] * box.width, wy = box.y + after[4][1] * box.height;
  await page.mouse.move(wx, wy); await page.mouse.down(); await page.mouse.move(wx - 25, wy - 25, {steps:4}); await page.mouse.up();
  const a2 = await page.evaluate(() => S.blocks.find(x => x.type==='pose').figs[1].pts);
  ok(a2[4][0] < after[4][0] - 0.03 && a2[3][0]===after[3][0], 'dragging a wrist moves just the wrist');
  // the picked figure's controls: who it is, mirror
  ok((await page.inputValue('.block select[data-fig="cid"]'))==='c2', 'the picked figure shows its character');
  await page.click('.block [data-do="figmirror"]');
  const m = await page.evaluate(() => S.blocks.find(x => x.type==='pose').figs[1].pts);
  ok(Math.abs(m[2][0] - (2*a2[1][0] - a2[5][0])) < 1e-6, 'mirror flips the figure about its neck and swaps left and right');
  await page.click('.block[style*="--cn"] h3');
  ok((await page.textContent('.block[style*="--cn"] small')).includes('2 figures · Levi, Mira'), 'folded summary names who is in it');

  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelector('#err').style.display==='block' || window.__sent, null, {timeout:3000}).catch(() => {});
  await page.waitForTimeout(800);
  ok(uploads.some(x => /^rd-pose-/.test(x)), 'the board was sent as a picture: ' + uploads.join());
  const g = sent[0] || {}, nodes = Object.values(g);
  ok(sent.length===1 && check(g).length===0, 'scene graph is valid: ' + check(g).join('; '));
  const un = nodes.find(x => x.class_type==='SetUnionControlNetType'), ap = nodes.find(x => x._meta.title==='Apply pose');
  ok(un && un.inputs.type==='openpose' && ap && ap.inputs.end_percent===0.65 && /^rd-pose-/.test(g[ap.inputs.image[0]].inputs.image), 'ProMax is told it is OpenPose and the pose ends at 65%');
  const areas = nodes.filter(x => x.class_type==='ConditioningSetArea').map(x => x.inputs);
  ok(areas.length===2 && areas.every(a => a.x % 8===0 && a.width >= 64 && a.x + a.width <= 1024), 'each character gets an area of the picture: ' + JSON.stringify(areas.map(a => [a.x,a.y,a.width,a.height])));
  const tl = nodes.find(x => x._meta.title==='Levi: tags').inputs.text, tm = nodes.find(x => x._meta.title==='Mira: tags').inputs.text, pr = nodes.find(x => x._meta.title==='Prompt').inputs.text;
  ok(/black coat/.test(tl) && !/white hair/.test(tl) && /blue dress/.test(tm) && !/black hair/.test(tm), 'each area has only its own character\'s tags');
  ok(/1girl, 1boy/.test(pr) && !/black coat|blue dress/.test(pr), 'the whole prompt counts them (1girl, 1boy) without either one\'s look: ' + pr);
  // a second render with the same board doesn't send the picture again
  const n0 = uploads.length; await page.click('#goBtn'); await page.waitForTimeout(800);
  ok(uploads.length===n0 && sent.length===2, 'an unchanged board is not sent twice');
  // Hidden gets the same block
  await page.click('#modeBtn');
  ok(await page.evaluate(() => S.hidden && S.blocks.some(b => b.type==='pose')) && await page.isVisible('.block[style*="--cn"]'), 'Hidden starts from the same recipe, Pose board included');
  await page.evaluate(() => { S.blocks = S.blocks.filter(b => b.type!=='pose'); render(); }); await page.click('#addBtn');
  ok(!(await page.$('#tray [data-add="pose"][disabled]')), 'Hidden can add a Pose board of its own');
  ok(await page.evaluate(() => { const e = {graph:{1:{class_type:'ControlNetLoader', inputs:{control_net_name:'diffusion_pytorch_model_promax.safetensors'}}}, home:'x'};
    const f = fit({url:'y', oi:{ControlNetLoader:{input:{required:{control_net_name:[[]]}}}}}, e); return !f.ok && /promax/.test(f.why); }), 'a computer with no ControlNets at all can\'t take a pose render');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
