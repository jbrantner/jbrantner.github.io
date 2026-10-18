// The app with a farm on Render (a pretend helper that keeps the queue): renders are handed to the farm with their
// graphs, the list shows their place in line, progress comes from the computer painting it, finished ones land in the
// strip, cancel and the on/off switch go to the farm, and both computers show at the top with their status.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const RU = 'https://jordo-desktop.tail.ts.net', MU = 'https://jordo-main.tail.ts.net';
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}}, LoraLoader:{input:{required:{lora_name:[['pixel.safetensors']]}}},
  KSampler:{input:{required:{sampler_name:[['euler','dpmpp_2m']], scheduler:[['normal','karras']]}}}};
let rebootAt = 0;
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
      if(u===MU && p.pathname==='/api/manager/reboot'){ rebootAt = Date.now(); return r.fulfill({ json:{} }); }
      if(u===MU && rebootAt && Date.now() - rebootAt < 5000) return r.abort();
      if(p.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
      if(p.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
      if(u===RU && p.pathname==='/renderdeck/farm') return r.fulfill({ json:view(+p.searchParams.get('since') || 0) });
      if(u===RU && p.pathname==='/renderdeck/farm/add'){ F.adds.push(body); F.off = body.off; body.jobs.forEach(j => F.jobs.push(Object.assign({state:'waiting', srv:'', id:''}, j))); return r.fulfill({ json:view(Date.now()/1000) }); }
      if(u===RU && p.pathname==='/renderdeck/farm/cancel'){ F.cancels.push(...body.keys); F.jobs = F.jobs.filter(j => !body.keys.includes(j.key)); return r.fulfill({ json:{cancelled:1} }); }
      if(u===RU && p.pathname==='/renderdeck/farm/pcs'){ F.pcCalls.push(body); F.off = body.off; return r.fulfill({ json:view(Date.now()/1000) }); }
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
  await page.click('#runsUp'); await page.click('#runsUp'); await page.click('#goBtn');
  ok(await waitFor(() => F.adds.length===1), 'Render hands the renders to the farm');
  const a = F.adds[0];
  ok(a.jobs.length===3 && a.jobs.every(j => j.graph && j.home===RU && j.client_id), 'three renders, each with its graph, home and the app\'s socket id');
  ok(a.pcs.map(x => x.name).join()==='Main,Render', 'with both computers');
  await page.click('#queueBtn'); await page.waitForSelector('#queueSheet.open');
  const rows = await page.$$eval('#qList .qjob small', x => x.map(y => y.textContent));
  ok(/Next/.test(rows[0]) && /#2 in line/.test(rows[1]) && /#3 in line/.test(rows[2]), 'the list shows their place in line: ' + rows.join(' / '));

  // the farm hands the first to Main, which starts painting it (progress reaches the app through Main's socket)
  Object.assign(F.jobs[0], {state:'sent', srv:MU, id:'m1'});
  await page.evaluate(() => tick());
  await until(() => S.queue[0].srv && S.queue[0].srv.includes('main'));
  socks[MU].send(JSON.stringify({type:'progress', data:{value:3, max:10, prompt_id:'m1', node:'5'}}));
  socks[MU].send(Buffer.concat([Buffer.from([0,0,0,1,0,0,0,2]), PNG]));
  await until(() => document.querySelector('#qList .qjob.running .pbar'));
  ok(true, 'the render Main is painting shows its progress in the list');

  // it finishes: the farm reports it done with its picture
  const job = F.jobs.shift(); F.done.push(Object.assign(job, {state:'done', images:[{filename:'r1.png', subfolder:'Output_Main/RenderDeck', type:'output'}], t_done:Date.now()/1000}));
  await page.evaluate(() => tick());
  await until(() => document.querySelectorAll('#strip img').length===1);
  ok((await page.getAttribute('#strip img', 'src')).startsWith(MU + '/view'), 'the finished picture lands in the strip, from Main');
  await page.evaluate(() => tick()); await page.waitForTimeout(300);
  ok(await page.$$eval('#strip img', x => x.length)===1, 'and only once');

  // cancel the last one from the list, switch Main off
  const key = await page.evaluate(() => S.queue[S.queue.length-1].key);
  await page.click(`#qList [data-cancel="${key}"]`);
  ok(await waitFor(() => F.cancels.includes(key)), 'cancel goes to the farm');
  await page.click(`#pcList [data-pc="${MU}"]`);
  ok(await waitFor(() => F.pcCalls.some(c => c.off.includes(MU))), 'switching Main off goes to the farm');
  // restart ComfyUI on Main: the app asks Manager to reboot, sees it go down and come back
  page.once('dialog', d => d.accept());
  await page.click(`#pcList [data-restart="${MU}"]`);
  ok(await waitFor(() => rebootAt > 0), 'Restart asks Main\'s ComfyUI-Manager to reboot');
  await until(() => /Restarting/.test(document.querySelector('#pcList').textContent));
  ok(true, 'Main shows as restarting');
  await until(() => document.querySelectorAll('#pcDots .dot.on').length===1, null, 6000);
  ok(true, 'its dot goes grey while it is down');
  await until(() => !/Restarting/.test(document.querySelector('#pcList').textContent) && document.querySelectorAll('#pcDots .dot.on').length===2, null, 20000);
  ok(true, 'and green again once it is back');
  await page.evaluate(() => closeSheets());
  await page.screenshot({ path: path.join(__dirname, 'shot-farm-top.png') });
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
