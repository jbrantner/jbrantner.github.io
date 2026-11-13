// ✂ Remove background against a pretend ComfyUI (Render, with BiRefNet): the graph it sends for see-through and for a
// colour backdrop, the save folder, the result showing, and the buttons that open it (viewer, preview, Library tab).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SERVER = 'https://render.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const R = {required:{}};
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}}, KSampler:{input:{required:{sampler_name:[['euler']],scheduler:[['normal']]}}},
  LoadImage:{input:R}, SaveImage:{input:R}, RemoveBackground:{input:R}, JoinImageWithAlpha:{input:R}, InvertMask:{input:R}, ImageCompositeMasked:{input:R}, EmptyImage:{input:R},
  LoadBackgroundRemovalModel:{input:{required:{bg_removal_name:[['rmbg.safetensors', 'birefnet.safetensors']]}}}};
const OUT = {LoadImage:2, LoadBackgroundRemovalModel:1, RemoveBackground:1, JoinImageWithAlpha:1, InvertMask:1, ImageCompositeMasked:1, EmptyImage:1, SaveImage:0};
const links = g => Object.entries(g).flatMap(([id, n]) => Object.entries(n.inputs).filter(([, v]) => Array.isArray(v)).map(([k, v]) => !g[v[0]] ? id + '.' + k + ' -> missing' : v[1] >= OUT[g[v[0]].class_type] ? id + '.' + k + ' bad output' : '')).filter(Boolean);
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message));
  const sent = [], ups = []; let n = 0;
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/render\.test\/ws/, ws => {});
  await page.route(SERVER+'/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname==='/upload/image'){ ups.push(1); return r.fulfill({ json:{name:'cutout_src.png', subfolder:'', type:'input'} }); }
    if(u.pathname==='/prompt' && r.request().method()==='POST'){ sent.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({ json:{prompt_id:'p' + (++n)} }); }
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.split('/').pop(), g = sent[+id.slice(1) - 1]; if(!g) return r.fulfill({ json:{} });
      const sv = Object.keys(g).find(k => g[k].class_type==='SaveImage');
      return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:{[sv]:{images:[{filename:'cut_' + id + '_.png', subfolder:'RenderDeck/cutouts', type:'output'}]}}}} }); }
    if(u.pathname==='/renderdeck/images') return r.fulfill({ json:{total:1, shared:false, images:[{subfolder:'RenderDeck', filename:'render_00001_.png', t:1, size:1}]} });
    if(u.pathname==='/view' || u.pathname==='/renderdeck/thumb') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  await page.evaluate(() => { window.WAIT_MS = 50; });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'), null, {timeout:8000});
  await page.waitForFunction(() => cutKits().length===1, null, {timeout:8000});
  await page.evaluate(() => closeSheets());

  // from the 🗂 renders viewer
  await page.evaluate(() => document.querySelector('#libBtn').click()); await page.waitForSelector('#libGrid img');
  await page.click('#libGrid [data-k="0"]'); await page.click('#vCut');
  await page.waitForSelector('#cutSheet.open'); ok(await page.isHidden('#viewer'), 'viewer ✂ closes the viewer and opens the cut sheet');
  ok(await page.$eval('#cutBody .cutpic img', i => i.src.includes('render_00001_')), 'the picked render shows in the sheet');
  ok((await page.textContent('#cutBody [data-cut="go"]')).includes('on Render'), 'the button says it runs on Render');
  await page.click('#cutBody [data-cut="go"]');
  await page.waitForSelector('#cutBody [data-cut="save"]', {timeout:8000});
  let g = sent[0], cls = Object.values(g).map(x => x.class_type);
  ok(ups.length===1 && Object.values(g).find(x => x.class_type==='LoadImage').inputs.image==='cutout_src.png', 'the picture is sent to Render and loaded');
  ok(Object.values(g).find(x => x.class_type==='LoadBackgroundRemovalModel').inputs.bg_removal_name==='birefnet.safetensors', 'BiRefNet is picked (not the other remover)');
  ok(cls.includes('JoinImageWithAlpha') && cls.includes('InvertMask') && !cls.includes('EmptyImage') && !links(g).length, 'see-through: mask joined as alpha, links fine ' + links(g).join());
  ok(Object.values(g).find(x => x.class_type==='SaveImage').inputs.filename_prefix==='RenderDeck/cutouts/render_00001_', 'saved in RenderDeck/cutouts');
  ok(await page.$eval('#cutBody .cutpic img', i => i.src.includes('cut_p1_.png')), 'the cut-out shows when done');

  // a colour backdrop
  await page.click('#cutBody [data-cut="redo"]'); await page.click('#cutBody [data-cutbg="custom"]');
  await page.$eval('#cutCol', i => { i.value = '#ff5ca8'; i.dispatchEvent(new Event('input', {bubbles:true})); });
  await page.click('#cutBody [data-cut="go"]'); await page.waitForSelector('#cutBody [data-cut="save"]', {timeout:8000});
  g = sent[1]; const em = Object.values(g).find(x => x.class_type==='EmptyImage'), cm = Object.values(g).find(x => x.class_type==='ImageCompositeMasked');
  ok(em && em.inputs.color===0xff5ca8 && em.inputs.width===1 && em.inputs.height===1 && cm && cm.inputs.mask && !links(g).length, 'colour backdrop: subject pasted on a plain #ff5ca8 picture the same size ' + JSON.stringify(em && em.inputs));
  ok((await page.textContent('#cutBody')).includes('on #ff5ca8'), 'says it is on the colour');

  // a picture from the phone
  await page.click('#cutBody [data-cut="new"]'); await page.click('#cutBody [data-cutbg=""]');
  const tmp = path.join(__dirname, 'cut-test.png'); fs.writeFileSync(tmp, PNG);
  await page.setInputFiles('#cutFile', tmp); fs.unlinkSync(tmp);
  await page.waitForFunction(() => CUT.src.startsWith('blob:'));
  await page.click('#cutBody [data-cut="go"]'); await page.waitForSelector('#cutBody [data-cut="save"]', {timeout:8000}).catch(async () => console.log('ERR', await page.evaluate(() => CUT.err)));
  ok(sent.length===3 && ups.length===3 && Object.values(sent[2]).find(x => x.class_type==='SaveImage').inputs.filename_prefix==='RenderDeck/cutouts/cut-test', 'a phone picture is uploaded and cut out');

  // Hidden saves in Hidden
  await page.evaluate(() => { closeSheets(); document.querySelector('#modeBtn').click(); });
  await page.evaluate(() => { cutOpen('https://render.test/view?filename=x.png&subfolder=&type=output'); });
  await page.click('#cutBody [data-cut="go"]'); await page.waitForSelector('#cutBody [data-cut="save"]', {timeout:8000});
  ok(Object.values(sent[3]).find(x => x.class_type==='SaveImage').inputs.filename_prefix==='Hidden/cutouts/x', 'Hidden mode saves in Hidden/cutouts');
  await page.evaluate(() => { closeSheets(); document.querySelector('#modeBtn').click(); });

  // the other ways in: the preview's buttons and the 📚 Library tab
  await page.evaluate(() => { S.gallery.unshift({url:'https://render.test/view?filename=render_00002_.png&subfolder=RenderDeck&type=output', seed:1}); drawStrip(); show(0); });
  await page.click('#resultActions [data-act="cut"]'); await page.waitForSelector('#cutSheet.open');
  ok(await page.$eval('#cutBody .cutpic img', i => i.src.includes('render_00002_')), 'preview ✂ opens with the shown render');
  await page.evaluate(() => closeSheets());
  await page.click('#tabs [data-tab="lib"]'); await page.waitForSelector('[data-cc="cutbg"]');
  await page.click('[data-cc="cutbg"]'); await page.waitForSelector('#cutSheet.open');
  ok(true, 'Library tab ✂ button opens the sheet');
  await page.screenshot({path:path.join(__dirname, 'shot-cutbg.png')});

  // no Render: says why, button off
  await page.evaluate(() => { allPcs().forEach(p => p.online = false); cutDraw(); });
  ok(await page.$eval('#cutBody [data-cut="go"]', b => b.disabled) && (await page.textContent('#cutBody .warn')).length > 10, 'with no computer on it says why and the button is off');
  ok(!logs.length, 'no page errors: '+logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length+' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
