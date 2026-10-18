// The render queue across two pretend computers (Render and Main), each a small fake ComfyUI with a real queue:
// renders split between them, Render keeps adding while busy, the queue list shows progress and cancels one render,
// a computer missing a LoRA gets it from the other, and a free computer takes a render waiting on the busy one.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
let DUR = 900; // how long one pretend render takes
function makePc(host, loras){
  const pc = {host, url:'https://' + host, loras, queue:[], running:null, history:{}, socks:[], prompts:[], deleted:[], interrupted:[], syncs:[], copies:[], n:0};
  pc.send = m => pc.socks.forEach(s => s.send(typeof m==='string' || Buffer.isBuffer(m) ? m : JSON.stringify(m)));
  pc.status = () => pc.send({type:'status', data:{status:{exec_info:{queue_remaining:pc.queue.length + (pc.running ? 1 : 0)}}}});
  pc.next = () => {
    if(pc.running || !pc.queue.length) return;
    const it = pc.running = pc.queue.shift(); pc.status();
    pc.send({type:'execution_start', data:{prompt_id:it.id}});
    let step = 0;
    it.timer = setInterval(() => {
      if(pc.running!==it){ clearInterval(it.timer); return; }
      step++; pc.send({type:'progress', data:{value:step, max:5, prompt_id:it.id, node:'1'}});
      pc.send(Buffer.concat([Buffer.from([0,0,0,1,0,0,0,2]), PNG]));
      if(step < 5) return;
      clearInterval(it.timer);
      const img = {filename:host + '_' + it.id + '.png', subfolder:'RenderDeck', type:'output'};
      pc.history[it.id] = {status:{completed:true}, outputs:{9:{images:[img]}}};
      pc.send({type:'executed', data:{node:'9', prompt_id:it.id, output:{images:[img]}}});
      pc.send({type:'executing', data:{node:null, prompt_id:it.id}});
      pc.running = null; pc.status(); pc.next();
    }, DUR / 5);
  };
  pc.oi = () => ({
    CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}},
    LoraLoader:{input:{required:{lora_name:[pc.loras.slice()]}}},
    KSampler:{input:{required:{sampler_name:[['euler','euler_ancestral','dpmpp_2m']], scheduler:[['normal','karras']]}}},
    CLIPTextEncode:{input:{required:{}}}, EmptyLatentImage:{input:{required:{}}}, VAEDecode:{input:{required:{}}}, SaveImage:{input:{required:{}}},
    KSamplerAdvanced:{input:{required:{}}},
  });
  return pc;
}
const R = makePc('render.test', ['pixel.safetensors', 'afkj.safetensors']), M = makePc('main.test', ['pixel.safetensors']);
let landCopy = false;

(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message));
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  for(const pc of [R, M]){
    await page.routeWebSocket(new RegExp(pc.host.replace('.', '\\.') + '/ws'), ws => { pc.socks.push(ws); ws.onClose(() => { pc.socks = pc.socks.filter(s => s!==ws); }); });
    await page.route(pc.url + '/**', async r => {
      const u = new URL(r.request().url()), post = r.request().method()==='POST', body = post ? JSON.parse(r.request().postData() || '{}') : null;
      if(u.pathname==='/object_info') return r.fulfill({ json:pc.oi() });
      if(u.pathname.startsWith('/object_info/')){ const n = u.pathname.slice(13); return r.fulfill({ json:{[n]:pc.oi()[n]} }); }
      if(u.pathname==='/prompt'){ const id = pc.host[0] + (++pc.n); pc.prompts.push({id, graph:body.prompt}); pc.queue.push({id}); pc.status(); setTimeout(pc.next, 10); return r.fulfill({ json:{prompt_id:id, number:pc.n, node_errors:{}} }); }
      if(u.pathname==='/queue' && post){ (body.delete || []).forEach(id => { if(pc.queue.some(q => q.id===id)){ pc.deleted.push(id); pc.queue = pc.queue.filter(q => q.id!==id); } }); pc.status(); return r.fulfill({ json:{} }); }
      if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:pc.running ? [[0, pc.running.id]] : [], queue_pending:pc.queue.map((q,i) => [i+1, q.id])} });
      if(u.pathname==='/interrupt'){ pc.interrupted.push(body.prompt_id); if(pc.running && pc.running.id===body.prompt_id){ pc.send({type:'execution_interrupted', data:{prompt_id:pc.running.id}}); pc.running = null; pc.status(); pc.next(); } return r.fulfill({ json:{} }); }
      if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9); return r.fulfill({ json:pc.history[id] ? {[id]:pc.history[id]} : {} }); }
      if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
      if(u.pathname==='/renderdeck/sync'){
        pc.syncs.push(body.source);
        const src = [R, M].find(x => x.url===body.source), want = src.loras.filter(l => !pc.loras.includes(l) && !pc.copies.some(c => c.name===l));
        want.forEach(name => pc.copies.push({id:name, name, kind:'loras', source:src.host.split('.')[0], status:'downloading', done:1, total:4}));
        return r.fulfill({ json:{from:src.host, queued:want, bytes:4, room:true, skipped:[]} });
      }
      if(u.pathname==='/renderdeck/jobs'){
        if(landCopy) pc.copies.forEach(c => { if(c.status!=='done'){ c.status = 'done'; c.done = 4; if(!pc.loras.includes(c.name)) pc.loras.push(c.name); } });
        return r.fulfill({ json:{jobs:pc.copies, token:false} });
      }
      if(u.pathname.startsWith('/renderdeck/') || u.pathname.startsWith('/view_metadata')) return r.fulfill({ json:{} });
      r.fulfill({ status:404, body:'' });
    });
  }
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  const until = (fn, arg, t) => page.waitForFunction(fn, arg, {timeout:t || 10000});
  const waitFor = async (fn, t) => { const end = Date.now() + (t || 10000); while(Date.now() < end){ if(fn()) return true; await page.waitForTimeout(100); } return false; };

  // connect to Main, then to Render: both are remembered, Render drives the recipe
  for(const pc of [M, R]){ await page.click('#openSettings'); await page.fill('#server', pc.url); await page.click('#connectBtn'); await until(() => document.querySelector('#connDot').classList.contains('on')); }
  ok(await page.evaluate(() => S.servers.map(x => x.name).join())==='Main,Render', 'both computers remembered');
  ok(await waitFor(() => M.syncs.includes(R.url)), 'Main is asked to copy what Render has, without tapping Sync');
  ok(M.copies.some(c => c.name==='afkj.safetensors'), "Main starts copying Render's LoRA it lacks");

  // a render needing that LoRA goes to Render while Main is still copying it; once it lands, Main takes the waiting one
  DUR = 5000;
  await page.click('#addBtn'); await page.click('[data-add=lora]');
  await page.selectOption('.block[style*="--lora"] [data-k=lora]', 'afkj.safetensors');
  await page.fill('#prompt', 'lantern hunter');
  await page.click('#runsUp'); await page.click('#goBtn');
  await until(() => S.queue.length===2 && S.queue.every(e => e.state!=='sending'));
  ok(R.prompts.length===2 && M.prompts.length===0, 'Main lacks the LoRA, so both go to Render: Render ' + R.prompts.length + ', Main ' + M.prompts.length);
  ok((await page.textContent('#goBtn'))==='Add to queue', 'Render button says Add to queue while rendering');
  landCopy = true;
  ok(await waitFor(() => M.prompts.length===1, 12000), 'after the copy lands, free Main takes the render waiting on Render');
  ok(R.deleted.length===1 && M.prompts[0] && JSON.stringify(M.prompts[0].graph).includes('afkj.safetensors'), 'it was taken out of Render\'s line and sent to Main with the LoRA');
  await until(() => !S.queue.length, null, 15000);
  ok(await page.$$eval('#strip img', x => x.length)===2, 'both renders came back');

  // four renders split between the two, more added while they run, one cancelled from the list
  DUR = 1500;
  await page.locator('.block[style*="--lora"] [data-do=toggle]').dispatchEvent('click');
  const r0 = R.prompts.length, m0 = M.prompts.length;
  await page.click('#runsUp'); await page.click('#runsUp'); ok((await page.textContent('#runsN'))==='4×', 'count steps up one at a time to 4×');
  await page.click('#goBtn'); await until(() => S.queue.length===4 && S.queue.every(e => e.state!=='sending'));
  ok(R.prompts.length - r0===2 && M.prompts.length - m0===2, 'four renders split two and two: Render ' + (R.prompts.length - r0) + ', Main ' + (M.prompts.length - m0));
  await page.click('#runsDown'); await page.click('#runsDown'); await page.click('#runsDown');
  await page.click('#goBtn'); await until(() => S.queue.length===5);
  ok((await page.textContent('#qCount'))==='5', 'tapping again while busy adds to the queue: ' + await page.textContent('#qCount'));
  await page.click('#queueBtn'); await page.waitForSelector('#queueSheet.open');
  await until(() => document.querySelectorAll('#qList .qjob').length===5 && document.querySelector('#qList .qjob.running .pbar'));
  ok(true, 'queue list shows every render, the painting ones with a progress bar');
  ok(await page.$$eval('#pcList .pcrow', x => x.length)===2, 'queue list shows both computers');
await page.click('#qList .qjob.running'); await page.waitForSelector('#qList .jbig');
  ok(true, 'tapping the painting render shows its preview big');
  const victim = await page.evaluate(() => { const e = S.queue.find(q => q.state==='sent'); return e && {key:e.key, id:e.id, srv:e.srv}; });
  await page.click(`#qList [data-cancel="${victim.key}"]`);
  const host = victim.srv.includes('main') ? M : R;
  ok(await waitFor(() => host.deleted.includes(victim.id)), 'cancel takes that render out of ' + host.host + "'s line");
  ok(await page.$$eval('#qList .qjob', x => x.length)===4, 'and out of the list');
  await until(() => !S.queue.length, null, 20000);
  ok((await page.textContent('#goBtn'))==='Render' && (await page.textContent('#qCount'))==='☰', 'back to Render once the queue is empty');

  // Main switched off (say, gaming): new renders all go to Render
  await page.click('#queueBtn').catch(()=>{}); await page.waitForSelector('#queueSheet.open');
  await page.click(`#pcList [data-pc="${M.url}"]`);
  await page.evaluate(() => closeSheets());
  const m1 = M.prompts.length; await page.click('#runsUp'); await page.click('#goBtn');
  await until(() => S.queue.length===2 && S.queue.every(e => e.state!=='sending'));
  ok(M.prompts.length===m1, 'a computer switched off in the queue takes nothing new');
  await until(() => S.queue[0] && S.queue[0].state==='running'); await page.evaluate(() => cancelJob(S.queue[0]));
  ok(await waitFor(() => R.interrupted.length===1), 'cancelling the one painting now stops it');

  await page.screenshot({ path: path.join(__dirname, 'shot-queue-bar.png') });
  await page.click('#queueBtn'); await page.waitForSelector('#queueSheet.open'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'shot-queue.png') });
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
