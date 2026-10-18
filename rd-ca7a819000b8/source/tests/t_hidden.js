// Hidden must stay out of the normal workstation: no picture, prompt, model or seed of a Hidden render
// in the queue, the live previews, the strip, the drafts or the renders list.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SERVER = 'https://render.test', MAIN = 'https://main.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAAABJRU5ErkJggg==','base64');
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sdxl.safetensors']]}}}, KSampler:{input:{required:{sampler_name:[['euler']],scheduler:[['normal']]}}}};
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message));
  let oldHelper = false;
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  const pics = [{subfolder:'Output_Render/Hidden', filename:'secret_00001_.png', t:3, size:1}, {subfolder:'Output_Render/Hidden/drafts', filename:'secretdraft_00001_.png', t:3, size:1},
    {subfolder:'Output_Render/RenderDeck', filename:'render_00001_.png', t:2, size:1}];
  for(const srv of [SERVER, MAIN]) await page.route(srv+'/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname==='/renderdeck/images'){ const h = u.searchParams.get('hidden')==='1';
      if(oldHelper) return r.fulfill({ json:{total:pics.length, shared:true, pc:'Output_Render', images:pics} }); // a helper from before Hidden: sends everything
      const list = pics.filter(i => i.subfolder.includes('/Hidden')===h); return r.fulfill({ json:{total:list.length, shared:true, pc:'Output_Render', hidden:u.searchParams.get('hidden'), images:list} }); }
    if(u.pathname==='/renderdeck/thumb' || u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', SERVER+'/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(() => closeSheets());

  // a Hidden render painting on Render and a normal one on Main, queued from Hidden; then back to normal
  await page.click('#modeBtn');
  await page.evaluate(([a, b]) => {
    S.queue.push({key:'hid1', srv:a, home:a, id:'p1', state:'running', hidden:true, prompt:'secret prompt words', ckpt:'secretmodel.safetensors', seed:987654, titles:{}, images:[], prog:{text:'Painting 3/20', f:0.15}},
                 {key:'nor1', srv:b, home:b, id:'p2', state:'running', hidden:false, prompt:'a calm lake', ckpt:'sdxl.safetensors', seed:42, titles:{}, images:[], prog:{text:'Painting 5/20', f:0.25}});
    save(); }, [SERVER, MAIN]);
  await page.click('#modeBtn');
  const frame = [...Buffer.from([0,0,0,1,0,0,0,2]), ...PNG];
  await page.evaluate(([a, b, f]) => { onPreview(pcOf(a), new Uint8Array(f).buffer); onPreview(pcOf(b), new Uint8Array(f).buffer); drawStatus(); }, [SERVER, MAIN, frame]);
  const pv = await page.evaluate(([a, b]) => ({hid:pcOf(a).preview, nor:pcOf(b).preview, shown:document.querySelector('#shown').src}), [SERVER, MAIN]);
  ok(!pv.hid, 'Hidden render\'s live picture is dropped in the normal view');
  ok(!!pv.nor, 'the normal render\'s live picture still comes through');
  const duo = await page.evaluate(() => ({text:document.querySelector('#duo').textContent, srcs:[...document.querySelectorAll('#duo img')].map(i => i.src.startsWith('blob:'))}));
  ok(duo.text.includes('Hidden render') && !duo.text.includes('3/20') && duo.srcs.filter(Boolean).length===1, 'side-by-side preview shows only "Hidden render" for it: '+duo.text);
  await page.evaluate(([a]) => { focusPc = a; document.querySelector('#duo [data-duo="'+a+'"]') && document.querySelector('#duo [data-duo="'+a+'"]').click(); }, [SERVER]);
  ok(!(await page.evaluate(() => document.querySelector('#shown').src)).includes('secret'), 'tapping it doesn\'t show anything of it');
  await page.evaluate(() => { openSheet('#queueSheet'); drawQueue(); });
  const q = await page.evaluate(() => ({text:document.querySelector('#qList').textContent, thumbs:document.querySelectorAll('[data-job="hid1"] img').length}));
  ok(!/secret|987654/.test(q.text) && q.text.includes('Hidden render') && q.thumbs===0, 'queue list shows "Hidden render" with no prompt, model, seed or picture');
  await page.evaluate(() => document.querySelector('[data-job="hid1"]').click());
  ok(await page.evaluate(() => !document.querySelector('[data-job="hid1"] .jbig')), 'tapping it in the queue doesn\'t open its picture');
  ok(q.text.includes('a calm lake'), 'normal renders still show their prompt');

  // a render from another phone or a closed app, handed back by the farm
  await page.evaluate(() => { farmView({pcs:[], jobs:[{key:'farmhid', hidden:true, prompt:'secret farm words', seed:5, state:'waiting', home:'https://render.test'}], done:[], now:0}); drawQueue(); });
  ok(!(await page.textContent('#qList')).includes('secret farm'), 'a Hidden render from the farm is masked too');

  // it finishes while the normal view is open
  await page.evaluate(() => { closeSheets(); const e = S.queue.find(q => q.key==='hid1'); e.images = [{filename:'secret_00002_.png', subfolder:'Output_Render/Hidden', type:'output'}]; return completeOne(e, true); });
  const st = await page.evaluate(() => ({strip:document.querySelector('#strip').innerHTML + document.querySelector('#recentRow').innerHTML + document.querySelector('#drafts').innerHTML, shown:document.querySelector('#shown').src, n:S.gallery.filter(g => g.url.includes('secret')).length}));
  ok(!st.strip.includes('secret') && !st.shown.includes('secret') && st.n===0, 'finished Hidden render stays out of the strip, preview and drafts');
  // a Hidden draft finishing in the normal view doesn't land in the drafts list
  await page.evaluate(() => { const e = {key:'hd', srv:'https://render.test', id:'p9', state:'running', hidden:true, draft:true, fin:{}, prompt:'secret draft', seed:1, titles:{}, images:[{filename:'secretdraft_00002_.png', subfolder:'Output_Render/Hidden/drafts', type:'output'}]}; S.queue.push(e); return completeOne(e, true); });
  ok(!(await page.evaluate(() => document.querySelector('#drafts').innerHTML + JSON.stringify(S.gallery))).includes('secret'), 'Hidden draft stays out of the drafts list');

  // the photo viewer from the preview: swiping through every picture never reaches a Hidden one
  const seen = await page.evaluate(() => { S.gallery.unshift({url:'https://render.test/view?filename=render_00003_.png&subfolder=Output_Render%2FRenderDeck&type=output', seed:3}); drawStrip(); show(0);
    document.querySelector('#shown').click(); const out = [document.querySelector('#vStrip').innerHTML];
    for(let k = 0; k < V.list.length + 2; k++){ viewAt(V.i + 1); out.push(document.querySelector('#viewImg').src); } closeViewer(); return out.join(' '); });
  ok(seen.includes('render_00003_') && !seen.includes('secret'), 'photo viewer and its thumbnails never show a Hidden picture');
  // renders list and its drafts tab, with the new helper and with one from before Hidden
  for(const old of [false, true]){
    oldHelper = old;
    await page.evaluate(() => document.querySelector('#libBtn').click());
    await page.waitForFunction(() => document.querySelectorAll('#libGrid img').length>=1);
    await page.waitForTimeout(400);
    const lib = await page.evaluate(() => document.querySelector('#libSheet').innerHTML);
    ok(!lib.includes('secret'), 'renders list and drafts tab show nothing Hidden' + (old ? ' (older helper)' : ''));
    const sw = await page.evaluate(() => { document.querySelector('#libGrid [data-k]').click(); const out = [document.querySelector('#vStrip').innerHTML];
      for(let k = 0; k < V.list.length + 2; k++){ viewAt(V.i + 1); out.push(document.querySelector('#viewImg').src); } closeViewer(); return out.join(' '); });
    ok(!sw.includes('secret'), 'swiping in the library viewer never lands on a Hidden picture' + (old ? ' (older helper)' : ''));
    await page.evaluate(() => closeSheets());
  }
  // and in Hidden it's all there
  oldHelper = false;
  await page.click('#modeBtn');
  ok(await page.evaluate(() => S.gallery.some(g => g.url.includes('secret_00002_'))), 'in Hidden, the finished Hidden render is in its strip');
  ok(!logs.length, 'no page errors: '+logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length+' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
