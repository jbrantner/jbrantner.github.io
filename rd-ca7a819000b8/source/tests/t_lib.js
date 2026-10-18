// Your renders sheet against a pretend ComfyUI whose output folder is shared through Dropbox:
// each picture shows which computer made it, and Delete says it goes from both.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SERVER = 'https://render.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}}, KSampler:{input:{required:{sampler_name:[['euler']],scheduler:[['normal']]}}}};
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message));
  let shared = true, deleted = null;
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/render\.test\/ws/, ws => {});
  await page.route(SERVER+'/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname==='/renderdeck/images') return r.fulfill({ json:{total:2, shared, pc:'Output_Render', trash:'Deleted by Render Deck', images:[
      {subfolder:'Output_Main/RenderDeck', filename:'render_00001_.png', t:2, size:1}, {subfolder:'Output_Render/RenderDeck', filename:'render_00001_.png', t:1, size:1}]} });
    if(u.pathname==='/renderdeck/thumb' || u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/renderdeck/delete'){ deleted = JSON.parse(r.request().postData()).items; return r.fulfill({ json:{moved:deleted.length} }); }
    if(u.pathname.startsWith('/history') || u.pathname==='/queue') return r.fulfill({ json:{} });
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.click('#connectBtn');
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(() => document.querySelector('#libBtn').click());
  await page.waitForFunction(() => document.querySelectorAll('#libGrid img').length===2);
  const tags = await page.$$eval('#libGrid .pc', a => a.map(x => x.textContent));
  ok(tags.join()==='Main,Render', 'each picture names its computer: '+tags.join());
  ok((await page.textContent('#libNote')).includes('Dropbox'), 'note says the renders sync through Dropbox');
  let msg = ''; page.once('dialog', d => { msg = d.message(); d.accept(); });
  await page.click('#libGrid [data-k="0"]'); await page.click('#vDel');
  await page.waitForFunction(() => document.querySelectorAll('#libGrid img').length===1);
  ok(msg.includes('both computers'), 'delete warns it goes from both: '+msg);
  ok(deleted && deleted[0].subfolder==='Output_Main/RenderDeck', 'sends the other computer\'s picture to delete');
  // not shared: the old wording and no labels
  shared = false; await page.click('#vClose').catch(()=>{}); await page.evaluate(() => document.querySelector('#libBtn').click());
  await page.waitForFunction(() => document.querySelectorAll('#libGrid img').length===2);
  ok(!(await page.$('#libGrid .pc')), 'no computer labels when the folder is not shared');
  ok((await page.textContent('#libNote')).includes('Deleted by Render Deck'), 'note keeps the trash-folder wording');
  ok(!logs.length, 'no page errors: '+logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length+' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
