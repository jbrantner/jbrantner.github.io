// Draft mode with the farm on Render: drafts handed to the farm come back (through a computer's socket or the farm's
// report) as drafts waiting above the preview, show in the library's own Drafts row, and Finish from there sends the full render.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
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
      if(p.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
      if(u===RU && p.pathname==='/renderdeck/farm') return r.fulfill({ json:view(+p.searchParams.get('since') || 0) });
      if(u===RU && p.pathname==='/renderdeck/farm/add'){ F.adds.push(body); F.off = body.off; body.jobs.forEach(j => F.jobs.push(Object.assign({state:'waiting', srv:'', id:''}, j))); return r.fulfill({ json:view(Date.now()/1000) }); }
      if(u===RU && p.pathname==='/renderdeck/farm/cancel'){ F.cancels.push(...body.keys); F.jobs = F.jobs.filter(j => !body.keys.includes(j.key)); return r.fulfill({ json:{cancelled:1} }); }
      if(u===RU && p.pathname==='/renderdeck/farm/pcs'){ F.pcCalls.push(body); F.off = body.off; return r.fulfill({ json:view(Date.now()/1000) }); }
      if(p.pathname==='/renderdeck/images') return r.fulfill({ json:{total:3, shared:1, hidden:'0', images:[{subfolder:'Output_Render/RenderDeck/drafts', filename:'d2.png', t:3},{subfolder:'Output_Main/RenderDeck/drafts', filename:'d1.png', t:2},{subfolder:'Output_Main/RenderDeck', filename:'r0.png', t:1}]} });
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
  await page.click('#libBtn'); await page.waitForSelector('#libDrafts button');
  ok(await page.$$eval('#libDrafts button', b => b.length)===2 && await page.$$eval('#libGrid button', b => b.length)===1, 'the library keeps drafts in their own row');
  await page.click('#libDrafts button >> nth=0'); ok(await page.isVisible('#vFinish'), 'a draft opened from the library offers Finish');
  await page.click('#vFinish'); ok(await waitFor(() => F.adds.length===2), 'Finish hands it to the farm');
  ok(F.adds[1].jobs.length===1 && Object.values(F.adds[1].jobs[0].graph).some(x => x._meta.title.startsWith('Finishing pass')) && !Object.values(F.adds[1].jobs[0].graph).some(x => x._meta.title.startsWith('Draft')), 'as the full render');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
