// Draft mode with the farm on Render: drafts handed to the farm come back (through a computer's socket or the farm's
// report) as drafts waiting above the preview, show in the library's own Drafts row, and Finish from there sends the full render.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const zlib = require('zlib');
let DRAFT_PNG = null, HIDDEN_ON = false; // a draft picture with ComfyUI's prompt text chunk, as ComfyUI saves it
function pngWithText(key, text){ const data = Buffer.concat([Buffer.from(key,'latin1'), Buffer.from([0]), Buffer.from(text,'latin1')]), len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tc = Buffer.concat([Buffer.from('tEXt'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(tc) >>> 0); return Buffer.concat([PNG.slice(0, 33), len, tc, crc, PNG.slice(33)]); }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const RU = 'https://jordo-desktop.tail.ts.net', MU = 'https://jordo-main.tail.ts.net';
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}}, LoraLoader:{input:{required:{lora_name:[['pixel.safetensors']]}}},
  KSampler:{input:{required:{sampler_name:[['euler','dpmpp_2m']], scheduler:[['normal','karras']]}}}};
let rebootAt = 0, agentCalls = [], mainClosed = false;
const F = {pcs:[], off:[], jobs:[], done:[], adds:[], cancels:[], pcCalls:[]};
const view = since => ({farm:1, now:Date.now()/1000, pcs:[RU, MU].map(u => ({url:u, name:u===RU ? 'Render' : 'Main', online:true, off:F.off.includes(u), load:0, copies:[], why:''})),
  jobs:F.jobs.map(j => { const c = Object.assign({}, j); delete c.graph; return c; }), done:F.done.filter(d => d.t_done > since)});
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message));
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  const socks = {};
  for(const u of [RU, MU]){
    await page.routeWebSocket(new RegExp(new URL(u).host.replace(/\./g, '\\.') + '/ws'), ws => { socks[u] = ws; });
    await page.route(u + '/**', async r => {
      const p = new URL(r.request().url()), body = r.request().method()==='POST' ? JSON.parse(r.request().postData() || '{}') : null;
      if(p.pathname==='/object_info') return r.fulfill({ json:OI });
      if(u===MU && p.pathname.startsWith('/agent/')){ if(p.pathname==='/agent/status') return r.fulfill({ json:{agent:1, comfy:mainClosed ? 'down' : 'up', wanted:!mainClosed, learned:true} });
        agentCalls.push(p.pathname); if(p.pathname==='/agent/close') mainClosed = true; if(p.pathname==='/agent/start') mainClosed = false; return r.fulfill({ json:{message:'ok'} }); }
      if(u===MU && mainClosed) return r.abort();
      if(u===MU && p.pathname==='/api/manager/reboot'){ rebootAt = Date.now(); return r.fulfill({ json:{} }); }
      if(u===MU && rebootAt && Date.now() - rebootAt < 5000) return r.abort();
      if(p.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
      if(p.pathname==='/view' && p.searchParams.get('filename')==='d9.png') return r.fulfill({ contentType:'image/png', body:DRAFT_PNG });
      if(p.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
      if(u===RU && p.pathname==='/renderdeck/farm') return r.fulfill({ json:view(+p.searchParams.get('since') || 0) });
      if(u===RU && p.pathname==='/renderdeck/farm/add'){ F.adds.push(body); F.off = body.off; body.jobs.forEach(j => F.jobs.push(Object.assign({state:'waiting', srv:'', id:''}, j))); return r.fulfill({ json:view(Date.now()/1000) }); }
      if(u===RU && p.pathname==='/renderdeck/farm/cancel'){ F.cancels.push(...body.keys); F.jobs = F.jobs.filter(j => !body.keys.includes(j.key)); return r.fulfill({ json:{cancelled:1} }); }
      if(u===RU && p.pathname==='/renderdeck/farm/pcs'){ F.pcCalls.push(body); F.off = body.off; return r.fulfill({ json:view(Date.now()/1000) }); }
      if(p.pathname==='/renderdeck/images') return r.fulfill({ json:{total:3, shared:1, hidden:'0', images:[{subfolder:'Output_Render/RenderDeck/drafts', filename:'d2.png', t:3},{subfolder:'Output_Main/RenderDeck/drafts', filename:'d1.png', t:2},{subfolder:'Output_Main/RenderDeck', filename:'r0.png', t:1}].concat(DRAFT_PNG ? [{subfolder:'Output_Main/RenderDeck/drafts', filename:'d9.png', t:4}] : []).concat(u===MU ? [{subfolder:'Output_Main/RenderDeck/drafts', filename:'d8.png', t:0.5}] : []).concat(HIDDEN_ON ? [{subfolder:'Output_Main/Hidden/drafts', filename:'h1.png', t:5}] : [])} });
      if(p.pathname==='/renderdeck/jobs') return r.fulfill({ json:{jobs:[]} });
      if(p.pathname.startsWith('/renderdeck/') || p.pathname.startsWith('/view_metadata') || p.pathname.startsWith('/history')) return r.fulfill({ json:{} });
      r.fulfill({ status:404, body:'' });
    });
  }
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  const until = (fn, arg, t) => page.waitForFunction(fn, arg, {timeout:t || 10000});
  const waitFor = async (fn, t) => { const end = Date.now() + (t || 10000); while(Date.now() < end){ if(fn()) return true; await page.waitForTimeout(100); } return false; };
  for(const u of [MU, RU]){ await page.click('#openSettings'); await page.fill('#server', u); await page.click('#connectBtn'); await until(() => document.querySelector('#connDot').classList.contains('on')); }
  await until(() => document.querySelectorAll('#pcDots .dot.on').length===2);
  ok((await page.getAttribute('#connPill', 'aria-label'))==='Main online, Render online', 'a dot for each computer at the top, both online');
  ok(await waitFor(() => F.pcCalls.length > 0), 'the farm is told which computers there are');

  await page.fill('#prompt', 'lantern hunter');
  await page.click('#draftBtn'); await page.click('#runsUp'); await page.click('#goBtn');
  ok(await waitFor(() => F.adds.length===1), 'drafts handed to the farm');
  Object.assign(F.jobs[0], {state:'sent', srv:MU, id:'m1'}); Object.assign(F.jobs[1], {state:'sent', srv:RU, id:'r1'});
  await page.evaluate(() => tick()); await page.waitForTimeout(500);
  // one through the socket, one through the farm report
  socks[MU].send(JSON.stringify({type:'executed', data:{node:'9', prompt_id:'m1', output:{images:[{filename:'d1.png', subfolder:'Output_Main/RenderDeck/drafts', type:'output'}]}}}));
  socks[MU].send(JSON.stringify({type:'execution_success', data:{prompt_id:'m1'}}));
  await page.waitForTimeout(500);
  const job = F.jobs.pop(); F.done.push(Object.assign(job, {state:'done', images:[{filename:'d2.png', subfolder:'Output_Render/RenderDeck/drafts', type:'output'}], t_done:Date.now()/1000}));
  const job1 = F.jobs.shift(); F.done.push(Object.assign(job1, {state:'done', images:[{filename:'d1.png', subfolder:'Output_Main/RenderDeck/drafts', type:'output'}], t_done:Date.now()/1000}));
  await page.evaluate(() => { farmAt = 0; tick(); }); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => S.gallery.length===2 && S.gallery.every(g => g.draft && g.fin)), 'both drafts come back with their full render');
  ok(await page.$$eval('#draftRows .frow', r => r.length)===2, 'and wait in the Drafts list');
  ok(await page.evaluate(() => document.querySelector('#drafts').compareDocumentPosition(document.querySelector('#feed')) & 4), 'the Drafts list sits above the preview');
  await page.click('#libBtn'); await page.waitForSelector('#libTabs button');
  ok(await page.isHidden('#libDraftBox') && await page.isVisible('#libGrid'), 'the library opens on Renders, drafts tucked in their own tab');
  await page.click('#libTabs [data-tab=drafts]'); await page.waitForSelector('#libDrafts button');
  ok(await page.isHidden('#libGrid'), 'the Drafts tab shows only drafts');
  ok(await page.$$eval('#libDrafts button', b => b.length)===3 && await page.$$eval('#libGrid button', b => b.length)===1, 'the Drafts tab has every draft from both computers, each once');
  ok((await page.getAttribute('#libDrafts button:has(img[src*="d8.png"]) img', 'src')).startsWith(MU), 'a draft Dropbox has not brought over yet comes from the computer that has it');
  await page.click('#libDrafts button:has(img[src*="d2.png"])'); ok(await page.isVisible('#vFinish'), 'a draft opened from the library offers Finish');
  await page.click('#vFinish'); ok(await waitFor(() => F.adds.length===2), 'Finish hands it to the farm');
  ok(F.adds[1].jobs.length===1 && Object.values(F.adds[1].jobs[0].graph).some(x => x._meta.title.startsWith('Finishing pass')) && !Object.values(F.adds[1].jobs[0].graph).some(x => x._meta.title.startsWith('Draft')), 'as the full render');
  // a draft this phone never saw (another phone, or long gone from its list): Finish reads the full render from the picture
  DRAFT_PNG = pngWithText('prompt', JSON.stringify(F.adds[0].jobs[0].graph));
  await page.evaluate(() => closeSheets()); await page.click('#libBtn'); await page.waitForFunction(() => document.querySelectorAll('#libDrafts button').length===4);
  await page.click('#libDrafts button:has(img[src*="d9.png"])'); ok(await page.isVisible('#vFinish'), 'a draft this phone has no record of still offers Finish');
  await page.click('#vFinish'); ok(await waitFor(() => F.adds.length===3), 'and Finish sends it');
  const fj = F.adds[2] && F.adds[2].jobs[0];
  ok(fj && fj.home===MU && Object.values(fj.graph).some(x => x._meta.title.startsWith('Finishing pass')) && fj.seed===F.adds[0].jobs[0].seed, 'as the full render read from the picture, on the computer that made it');
  await page.screenshot({ path: path.join(__dirname, 'shot-draft-viewer.png') });

  // Hidden (🙈) works the same, with its own drafts kept apart
  await page.evaluate(() => closeSheets());
  const mainLeft = await page.$$eval('#draftRows .frow', r => r.length);
  await page.click('#modeBtn'); ok(await page.isHidden('#drafts'), 'Hidden starts without the main drafts');
  await page.fill('#prompt', 'hidden one'); const nAdds = F.adds.length;
  if(!(await page.evaluate(() => S.draft))) await page.click('#draftBtn');
  await page.evaluate(() => { S.runs = 1; drawRuns(); }); await page.click('#goBtn');
  ok(await waitFor(() => F.adds.length===nAdds + 1), 'Hidden drafts go to the farm');
  const hj = F.adds[nAdds].jobs[0], hsv = Object.values(hj.graph).find(x => x.class_type==='SaveImage');
  ok(/^Hidden\/drafts\//.test(hsv.inputs.filename_prefix) && Object.values(hsv._meta.rd_finish.graph).find(x => x.class_type==='SaveImage').inputs.filename_prefix.startsWith('Hidden/render'), 'Hidden drafts and their finished renders save into Hidden folders');
  F.jobs = F.jobs.filter(j => j.key!==hj.key); F.done.push(Object.assign({}, hj, {state:'done', srv:MU, id:'h1', images:[{filename:'h1.png', subfolder:'Output_Main/Hidden/drafts', type:'output'}], t_done:Date.now()/1000}));
  await page.evaluate(() => { farmAt = 0; tick(); }); await page.waitForFunction(() => document.querySelectorAll('#draftRows .frow').length===1, null, {timeout:8000});
  ok(true, 'the Hidden draft waits in Hidden\'s Drafts list, alone');
  HIDDEN_ON = true; await page.click('#libBtn'); await page.waitForSelector('#libTabs button');
  if(await page.isHidden('#libDrafts')) await page.click('#libTabs [data-tab=drafts]');
  await page.waitForFunction(() => document.querySelectorAll('#libDrafts button').length===1);
  ok(await page.$$eval('#libDrafts img', x => x.every(i => i.src.includes('h1.png'))), 'Hidden\'s library Drafts tab shows only Hidden drafts');
  await page.click('#libDrafts button'); ok(await page.isVisible('#vFinish'), 'and a Hidden draft offers Finish');
  await page.click('#vFinish'); ok(await waitFor(() => F.adds.length===nAdds + 2), 'Finish sends it');
  const hf = F.adds[nAdds + 1].jobs[0];
  ok(Object.values(hf.graph).find(x => x.class_type==='SaveImage').inputs.filename_prefix.startsWith('Hidden/render'), 'the finished Hidden render saves into Hidden');
  await page.click('#modeBtn'); await page.waitForTimeout(200);
  ok(await page.$$eval('#draftRows .frow', r => r.length)===mainLeft, 'back in the main view, its own drafts are as they were');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
