// The app with a farm on Render (a pretend helper that keeps the queue): renders are handed to the farm with their
// graphs, the list shows their place in line, progress comes from the computer painting it, finished ones land in the
// strip, cancel and the on/off switch go to the farm, and both computers show at the top with their status.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const RU = 'https://jordo-desktop.tail.ts.net', MU = 'https://jordo-main.tail.ts.net';
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}}, LoraLoader:{input:{required:{lora_name:[['pixel.safetensors']]}}},
  KSampler:{input:{required:{sampler_name:[['euler','dpmpp_2m']], scheduler:[['normal','karras']]}}}};
['CLIPTextEncode','EmptyLatentImage','KSamplerAdvanced','VAEDecode','SaveImage','CLIPSetLastLayer','ModelMergeSDXL','LoadImage','VAEEncode','ImageScale','ImageScaleBy'].forEach(k => OI[k] = {input:{required:{}}}); // every computer has ComfyUI's own nodes
let rebootAt = 0, agentCalls = [], mainClosed = false;
const F = {pcs:[], off:[], jobs:[], done:[], adds:[], cancels:[], pcCalls:[]};
const view = since => ({farm:1, chain:1, now:Date.now()/1000, pcs:[RU, MU].map(u => ({url:u, name:u===RU ? 'Render' : 'Main', online:true, off:F.off.includes(u), load:0, copies:[], why:''})),
  jobs:F.jobs.map(j => { const c = Object.assign({}, j); delete c.graph; return c; }), done:F.done.filter(d => d.t_done > since)});
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='warning') console.log('WARN', m.text(), JSON.stringify(m.location())); });
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
  await until(() => document.querySelectorAll('#recentRow img').length===1);
  ok((await page.getAttribute('#recentRow img', 'src')).startsWith(MU + '/view'), 'the finished picture lands in the strip, from Main');
  await page.evaluate(() => tick()); await page.waitForTimeout(300);
  ok(await page.$$eval('#recentRow img', x => x.length)===1, 'and only once');

  // cancel the last one from the list, switch Main off
  const key = await page.evaluate(() => S.queue[S.queue.length-1].key);
  await page.click(`#qList [data-cancel="${key}"]`);
  ok(await waitFor(() => F.cancels.includes(key)), 'cancel goes to the farm');
  await page.click(`#pcList [data-pc="${MU}"]`);
  ok(await waitFor(() => F.pcCalls.some(c => c.off.includes(MU))), 'switching Main off goes to the farm');
  // Render has no agent: its Restart goes through ComfyUI-Manager, and the app sees it go down and come back
  // (here Main plays that part through Manager first, then with its agent)
  await page.evaluate(() => { const p = pcOf('https://jordo-main.tail.ts.net'); p.agent = null; S.agents = []; drawQueue(); });
  page.once('dialog', d => d.accept());
  await page.click(`#pcList [data-restart="${MU}"]`);
  ok(await waitFor(() => rebootAt > 0), 'Restart without the agent asks ComfyUI-Manager to reboot');
  await until(() => /Restarting/.test(document.querySelector('#pcList').textContent));
  ok(true, 'Main shows as restarting');
  await until(() => !/Restarting/.test(document.querySelector('#pcList').textContent) && document.querySelectorAll('#pcDots .dot.on').length===2, null, 20000);
  ok(true, 'and green again once it is back');
  // with the agent on Main: Close, then Start
  await page.evaluate(() => closeSheets()); await page.click('#queueBtn'); await page.waitForSelector('#queueSheet.open');
  await page.waitForSelector(`#pcList [data-agent="close"][data-url="${MU}"]`);
  ok(true, 'with the agent, Main offers Restart and Close');
  page.once('dialog', d => d.accept());
  await page.click(`#pcList [data-agent="close"][data-url="${MU}"]`);
  ok(await waitFor(() => agentCalls.includes('/agent/close')), 'Close asks Main\'s agent to close ComfyUI');
  await until(() => document.querySelector('#pcDots .dot.test') && /ComfyUI is closed/.test(document.querySelector('#pcList').textContent), null, 8000);
  ok(true, 'Main shows a yellow dot (computer on, ComfyUI closed) and says so');
  await page.click(`#pcList [data-agent="start"][data-url="${MU}"]`);
  ok(await waitFor(() => agentCalls.includes('/agent/start')), 'Start asks the agent to start ComfyUI');
  await until(() => document.querySelectorAll('#pcDots .dot.on').length===2, null, 20000);
  ok(true, 'and Main is green again once ComfyUI answers');
  // the phone slept in the middle of a look that never finished: the dots must not stay offline
  await page.evaluate(() => { clearTimeout(tickTimer); ticking = Date.now() - 25000; allPcs().forEach(p => { p.online = false; }); drawPcs(); });
  await until(() => document.querySelectorAll('#pcDots .dot.on').length===2, null, 20000);
  ok(true, 'a stuck look does not freeze the dots: they come back on their own');
  await page.evaluate(() => closeSheets());
  await page.screenshot({ path: path.join(__dirname, 'shot-farm-top.png') });
  // 🧊 Make 3D on the farm: the whole 3D goes at once, high/low circles waiting for their crane and each angle for its circle
  const n0 = F.adds.length;
  await page.evaluate(RU => { const K = {url:RU, oi:{}, fl:true, unet:'fl2v.safetensors', lora:'fl2v_turbo_8step.safetensors', steps:8, clip:'c', vae:'v', bg:'birefnet', cn:'promax', ckpt:'sdxl.safetensors', loras:[], has:x => x};
    window.cmFlKits = () => [K]; window.cmIllKits = () => [K]; window.cmUp = async u => 'up_' + ((u.match(/filename=([^&]+)/) || [])[1] || u.split('=').pop()); window.obLooks = async () => ({ckpt:'sdxl.safetensors', loras:[], words:'', prompt:'a girl'});
    const P = {id:'spT', name:'🧊 test', who:'', from:true, snap:null, geo:{wM:1, hM:1.5, aim:[0, 0.75, 0]}, seed:1, at:Date.now(), by:'mm', pic:true, src:RU + '/view?filename=jump.png', off:0, dn:0, mw:544, mh:800, iw:832, ih:1216,
      views:[0, 1, 2].flatMap(ring => [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({id:'v' + ring + i, ring, i, url:''})))};
    P.orb = cmPoseOrbs().map(o => Object.assign(o, {pose:P.id})); S.cmPoses = [P]; S.m3Pick = false; window.cmOutline = async () => { throw new Error('no picture'); }; cmPoseRun(P); }, RU);
  ok(await waitFor(() => F.adds.length > n0), 'the 3D is handed to the farm');
  if(F.adds.length===n0) console.log('DIAG', await page.evaluate(() => JSON.stringify({farm, farmChain, toast:(document.querySelector('#toast') || {}).textContent, err:S.cmPoses[0].orb.map(o => o.err || o.farm || '-')})));
  const J = F.adds[F.adds.length - 1].jobs, byKey = Object.fromEntries(J.map(j => [j.key, j]));
  const orbs = await page.evaluate(() => S.cmPoses[0].orb.map(o => ({key:cmFarmKey(o), step:o.step, ring:o.ring})));
  const crane = r => orbs.find(o => o.step==='crane' && o.ring===r).key, circ = r => orbs.find(o => o.step==='circle' && o.ring===r).key;
  const hi = byKey[circ(2)];
  ok(J.length===5 && !byKey[circ(1)].after.length && !byKey[crane(2)].after.length && hi.after[0]===crane(2) && Object.values(hi.use)[0][0]===crane(2) && J.every(j => j.home===RU),
    '5 moves: 3 start at once, high/low circles wait for their crane (the angles wait until they are picked): ' + JSON.stringify({n:J.length, hi:hi.after}));
  // the farm finishes the eye-level circle: 31 frames land, its 8 angles are lined up and handed over, each with its own frame
  let tt = Date.now() / 1000; F.jobs = F.jobs.filter(j => j.key!==circ(1)); const n1 = F.adds.length;
  F.done.push({key:circ(1), state:"done", srv:MU, t_done:tt, images:Array.from({length:31}, (_, n) => ({filename:'c' + n + '.png', subfolder:'RenderDeck/comics/poses', type:'output'}))});
  await page.evaluate(() => farmLook());
  ok(await waitFor(() => F.adds.length > n1), 'once the circle is in, its angles go to the farm');
  const J2 = F.adds[F.adds.length - 1].jobs, v13 = J2.find(j => j.key==='p3-v13'), fr13 = v13 && Object.values(v13.graph).find(n => n.class_type==='LoadImage').inputs.image;
  ok(J2.length===8 && J2.every(j => /^p3-v1/.test(j.key) && !j.after.length) && fr13==='up_c11.png', 'the 8 eye-level angles, each from its lined-up frame (no outlines here, so the whole clip is one turn and ¾ back is frame 11): ' + JSON.stringify({n:J2.length, fr13}));
  // an angle running shows on its own, a finished one lands on the 3D
  tt = Date.now() / 1000; F.jobs = F.jobs.filter(j => j.key!=='p3-v10'); F.jobs.push({key:'p3-v11', state:'running', srv:MU, id:'M9'});
  F.done.push({key:'p3-v10', state:"done", srv:RU, t_done:tt, images:[{filename:'a.png', subfolder:'x', type:'output'}]});
  await page.evaluate(() => farmLook());
  const st = await page.evaluate(() => { const P = S.cmPoses[0]; return {circ:P.orb.find(o => o.step==='circle' && o.ring===1).urls.length, v10:P.views.find(v => v.id==='v10').url, run:!!(P.views.find(v => v.id==='v11').making || {}).farm, q:S.queue.some(e => /^p3-/.test(e.key))}; });
  ok(st.circ===31 && /jordo-desktop.*a\.png/.test(st.v10) && st.run && !st.q, 'finished 3D jobs land on the 3D (not in the render queue), a running one gets a step bar: ' + JSON.stringify(st));
  await page.evaluate(() => { const b = document.createElement('div'); b.id = 'm3Box'; document.body.appendChild(b); M3.P = 'spT'; M3.g = {}; });
  const nc = F.cancels.length; await page.evaluate(() => { const P = S.cmPoses[0]; P.stopped = true; const fks = P.orb.concat(P.views).map(h => h.farm).filter(Boolean); farmCall('/cancel', {keys:fks}); });
  ok(await waitFor(() => F.cancels.length > nc), 'Stop cancels its farm jobs');
  // 🦴 a rig 3D on the farm: 24 independent Illustrious angles from the rig's guides
  const n2 = F.adds.length;
  await page.evaluate(() => { const P = {id:'spR', name:'🧊 rig', who:'', from:true, snap:null, geo:{wM:1, hM:1.5, aim:[0, 0.75, 0]}, seed:1, at:Date.now(), by:'ill', src:'x', views:[0, 1, 2].flatMap(ring => [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({id:'r' + ring + i, ring, i, url:''})))};
    P.views.forEach(v => CM_SPG[v.id] = {pose:'pose_' + v.id, depth:'depth_' + v.id}); S.cmPoses = [P]; cmPoseRun(P); });
  ok(await waitFor(() => F.adds.length > n2), 'a rig 3D is handed to the farm too');
  const RJ = F.adds[F.adds.length - 1].jobs;
  ok(RJ.length===24 && RJ.every(j => !j.after.length && Object.values(j.graph).some(n => n.class_type==='LoadImage' && /^up_pose_/.test(n.inputs.image))), 'its 24 angles go at once, each with its own rig guides: ' + RJ.length);
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
