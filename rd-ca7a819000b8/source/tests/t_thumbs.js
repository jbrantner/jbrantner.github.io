// thumbnails: the helper's small cached JPEG instead of the full PNG, from a computer that is on; the full picture if that fails
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport:{width:390,height:844} });
  const logs = []; page.on('pageerror', e => logs.push(e.message));
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  const asked = [];
  await page.route('https://render.test/**', r => { const u = new URL(r.request().url()); asked.push(u.pathname + u.search);
    if(u.pathname==='/renderdeck/thumb' && /broken/.test(u.search)) return r.fulfill({ status:404, body:'' });
    return r.fulfill({ contentType:'image/png', body:PNG, headers:{'Access-Control-Allow-Origin':'*'} }); });
  await page.route('https://main.test/**', r => r.abort());
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.evaluate(() => { S.servers = [{name:'Main', url:'https://main.test'}, {name:'Render', url:'https://render.test'}]; S.server = 'https://render.test';
    Object.assign(pcOf('https://render.test'), {online:true, oi:{}}); Object.assign(pcOf('https://main.test'), {online:false, oi:{}});
    S.gallery = [{url:'https://main.test/view?filename=a_00001_.png&subfolder=RenderDeck&type=output'}, {url:'https://render.test/view?filename=broken_00001_.png&subfolder=RenderDeck&type=output'}];
    drawStrip(); });
  await page.waitForTimeout(800);
  ok(asked.includes('/renderdeck/thumb?subfolder=RenderDeck&filename=a_00001_.png'), "a picture made on Main (off) gets its small preview from Render: " + asked.join(' '));
  ok(asked.some(a => a.startsWith('/view?filename=broken_00001_.png')), 'no small preview: the full picture is loaded instead');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
