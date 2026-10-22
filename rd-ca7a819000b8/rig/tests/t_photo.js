// Pose Rig: the on-phone picture reader (MediaPipe) on a real photo. Needs RIG_DEPS (unpacked three and
// tasks-vision, plus pose_landmarker_full.task) and a photo path as the first argument.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS, PHOTO = process.argv[2];
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:2 });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('console', m => { if(m.type()==='error') logs.push(m.text()); });
  await page.route('https://app.test/rig/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.png', r => r.fulfill({ status:404, body:'' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://storage.googleapis.com/**', r => r.fulfill({ contentType:'application/octet-stream', body:fs.readFileSync(path.join(DEPS, 'pose_landmarker_full.task')) }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => {
    const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const dir = {'three':'three-0.160.0', '@mediapipe/tasks-vision':'mediapipe-tasks-vision-0.10.14'}[m[1]];
    const f = path.join(DEPS, dir, 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' });
    r.fulfill({ contentType:f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body:fs.readFileSync(f) });
  });
  await page.goto('https://app.test/rig/'); await page.waitForFunction(() => window.RIG);
  await page.click('#tabs [data-tab="pic"]');
  await page.setInputFiles('#picFile', PHOTO); await page.waitForFunction(() => !document.querySelector('#picGo').disabled);
  await page.click('#picGo');
  await page.waitForFunction(() => /Copied|No person|bad/.test(document.querySelector('#picStatus').className + document.querySelector('#picStatus').textContent), null, {timeout:90000});
  const st = await page.evaluate(() => document.querySelector('#picStatus').textContent); console.log('status:', st);
  await page.waitForTimeout(300); fs.mkdirSync(path.join(__dirname, 'out'), {recursive:true});
  await page.screenshot({path:path.join(__dirname, 'out', 'photo-fit.png')});
  await page.evaluate(() => document.querySelector('#views [data-v="front"]').click()); await page.waitForTimeout(200);
  await page.screenshot({path:path.join(__dirname, 'out', 'photo-front.png')});
  console.log(logs.join('\n') || 'no errors'); await browser.close(); process.exit(/Copied/.test(st) ? 0 : 1);
})();
