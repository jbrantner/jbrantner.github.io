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
    if(u.pathname==='/renderdeck/images' && u.searchParams.get('hidden')==='1') return r.fulfill({ json:{total:1, shared, pc:'Output_Render', hidden:'1', images:[
      {subfolder:'Output_Render/Hidden', filename:'render_00001_.png', t:3, size:1}]} });
    if(u.pathname==='/renderdeck/images') return r.fulfill({ json:{total:2, shared, pc:'Output_Render', trash:'Deleted by Render Deck', images:[
      {subfolder:'Output_Main/RenderDeck', filename:'render_00001_.png', t:2, size:1}, {subfolder:'Output_Render/RenderDeck', filename:'render_00001_.png', t:1, size:1}]} });
    if(u.pathname==='/view' && !/^Output_/.test(u.searchParams.get('subfolder'))) return r.fulfill({ status:404, body:'' });
    if(u.pathname==='/renderdeck/thumb' || u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/renderdeck/delete'){ deleted = JSON.parse(r.request().postData()).items; return r.fulfill({ json:{moved:deleted.length} }); }
    if(u.pathname.startsWith('/history') || u.pathname==='/queue') return r.fulfill({ json:{} });
    r.fulfill({ status:404, body:'' });
  });
  // two renders in the strip from before the shared folder: one from this computer, one from a computer that's now off
  // the strip gets two renders from before the shared folder: one from this computer, one from a computer that's now off
  await page.route('https://main.test/**', r => r.abort());
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.evaluate(() => { S.gallery = [
    {url:'https://render.test/view?filename=render_00001_.png&subfolder=RenderDeck&type=output', seed:1},
    {url:'https://main.test/view?filename=render_00083_.png&subfolder=Output_Main%2FRenderDeck&type=output', seed:2},
    // Main's render served by Render (the strip fills from both computers' folders), and one an earlier version broke by nesting the folders
    {url:'https://render.test/view?filename=render_00050_.png&subfolder=Output_Main%2FRenderDeck&type=output', seed:3},
    {url:'https://render.test/view?filename=render_00051_.png&subfolder=Output_Render%2FOutput_Main%2FRenderDeck&type=output', seed:4}]; drawStrip(); show(0); });
  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'), null, {timeout:8000}).catch(async () => { console.log('CONN', await page.textContent('#connText'), logs.join(' | ')); });
  await page.waitForFunction(() => [...document.querySelectorAll('#recentRow img')].every(i => i.complete && i.naturalWidth>0), null, {timeout:8000}).catch(()=>{});
  const strip = await page.$$eval('#recentRow img', a => a.map(i => [i.src, i.naturalWidth]));
  ok(strip[0][0].includes('subfolder=Output_Render%2FRenderDeck') && strip[0][1]>0, 'old render link moved into Output_Render and loads: '+strip[0][0]);
  ok(strip[1][0].startsWith(SERVER) && strip[1][1]>0, 'render from the switched-off computer loads from this one: '+strip[1][0]);
  const urls = await page.evaluate(() => S.gallery.map(g => g.url).join(' '));
  ok(urls.includes('render_00050_.png&subfolder=Output_Main%2FRenderDeck'), "the other computer's render served from this one keeps its folder");
  ok(urls.includes('render_00051_.png&subfolder=Output_Main%2FRenderDeck') && !urls.includes('Output_Render%2FOutput_Main'), 'a link with one folder nested in the other is repaired');
  await page.evaluate(() => show(0)); await page.waitForFunction(() => document.querySelector('#shown').naturalWidth>0, null, {timeout:5000}).catch(()=>{});
  ok(await page.$eval('#shown', i => i.naturalWidth>0), 'big picture loads');
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
  // Hidden mode: its own prompt, strip, save folder and renders list
  await page.evaluate(() => { closeSheets(); S.prompt = 'normal prompt'; save(); render(); });
  await page.click('#modeBtn');
  const hm = await page.evaluate(() => ({title:document.querySelector('h1 span').textContent, prompt:S.prompt, strip:S.gallery.filter(g => !g.saved).length,
    prefix:Object.values(buildGraph().graph).find(n => n.class_type==='SaveImage').inputs.filename_prefix}));
  ok(hm.title==='Hidden' && hm.prompt==='' && hm.strip===0, 'Hidden starts with an empty prompt and strip: '+JSON.stringify(hm));
  ok(hm.prefix==='Hidden/render', 'Hidden saves into a Hidden folder: '+hm.prefix);
  await page.evaluate(() => { S.queue.push({key:'h2', images:[{filename:'render_00009_.png', subfolder:'Output_Render/RenderDeck', type:'output'}], srv:'https://render.test'}); return completeOne(S.queue[S.queue.length-1], true); });
  ok(await page.evaluate(() => !S.gallery.some(g => !g.saved) && S.stash.gallery.some(g => g.url.includes('render_00009_'))), 'a normal render finishing in Hidden goes to the normal strip');
  await page.evaluate(() => document.querySelector('#libBtn').click());
  await page.waitForFunction(() => document.querySelectorAll('#libGrid img').length===1);
  ok((await page.textContent('#libTitle'))==='Hidden renders', 'renders list shows only Hidden renders');
  await page.evaluate(() => closeSheets());
  await page.click('#modeBtn');
  const back = await page.evaluate(() => ({title:document.querySelector('h1 span').textContent, prompt:S.prompt, n:S.gallery.filter(g => g.url.includes('render_00009_')).length,
    prefix:Object.values(buildGraph().graph).find(n => n.class_type==='SaveImage').inputs.filename_prefix}));
  ok(back.title==='Deck' && back.prompt==='normal prompt' && back.n===1 && back.prefix==='RenderDeck/render', 'switching back restores the normal workstation: '+JSON.stringify(back));
  ok(!logs.length, 'no page errors: '+logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length+' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
