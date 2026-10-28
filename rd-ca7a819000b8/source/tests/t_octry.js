// 🎲 Try the picture (Jordan 2026-10-28): step 2 on its own, as often as wanted; the try tapped is step 2 when ▶ Make it starts
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const V = g => Object.values(g), of = (g, c) => V(g).filter(n => n.class_type===c);
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'), 'utf8');
  const PIC = fs.readFileSync(path.join(__dirname, 'fixtures', 'cc_short.png'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:375, height:812}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('dialog', d => d.accept());
  await page.route('https://app.test/**', r => { const u = new URL(r.request().url()); if(u.pathname.endsWith('.txt')) return r.fulfill({ contentType:'text/plain', body:'' }); return r.fulfill({ contentType:'text/html', body:html }); });
  await page.route('https://jordo-desktop.test/**', r => r.fulfill({ contentType:'image/png', headers:{'access-control-allow-origin':'*'}, body:PIC }));
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  await page.click('#openSettings'); await page.click('#testBtn'); await page.evaluate(() => closeSheets());
  await page.click('#tabs [data-tab="obj"]'); await page.waitForTimeout(200);
  await page.click('.ccstep[data-cstep="ref"] summary');
  await page.click('[data-cc="try"]'); ok(await page.evaluate(() => !(ccChar().tries || []).length), '🎲 Try waits for words or a picture');
  await page.fill('[data-ccf="name"]', 'Chair'); await page.fill('[data-ccf="desc"]', 'a wooden chair'); await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(() => { CM_SENT.length = 0; ccDraw(true); });
  for(let n = 0; n < 3; n++){ await page.click('[data-cc="try"]'); await page.waitForFunction(k => (ccChar().tries || []).filter(t => t.url).length===k, n + 1, {timeout:5000}); }
  const st = await page.evaluate(() => ({tries:ccChar().tries.length, sent:CM_SENT.length, seeds:new Set(CM_SENT.map(g => Object.values(g).find(n => n.class_type==='KSampler').inputs.seed)).size, qwen:CM_SENT.every(g => Object.values(g).some(n => n.class_type==='UNETLoader' && /qwen/i.test(n.inputs.unet_name))), P:!!ccP(ccChar()), thumbs:document.querySelectorAll('.octries button').length}));
  ok(st.tries===3 && st.sent===3 && st.seeds===3 && st.qwen && !st.P && st.thumbs===3, 'three tries: only step 2 (Qwen) each time, a new seed each, nothing else started: ' + JSON.stringify(st));
  await page.click('.octries button:nth-child(2)');
  if(process.env.SHOT) await page.locator('.ccstep[data-cstep="ref"]').screenshot({path:process.env.SHOT});
  const pick = await page.evaluate(() => ({pick:ccChar().pick, want:ccChar().tries[1].id, pressed:$('.octries button:nth-child(2)').getAttribute('aria-pressed'), card:!!$('.ccstep[data-cstep="full"] img')}));
  ok(pick.pick===pick.want && pick.pressed==='true' && pick.card, 'tapping a try picks it, and step 2 shows it: ' + JSON.stringify(pick));
  await page.evaluate(() => { CM_SENT.length = 0; }); await page.click('[data-cc="go"]');
  await page.waitForFunction(() => { const P = ccP(ccChar()); return P && P.cc.redraw.url; }, null, {timeout:8000});
  const go = await page.evaluate(() => { const c = ccChar(), P = ccP(c); return {full:P.cc.full.url===c.tries[1].url, qwen:CM_SENT.some(g => Object.values(g).some(n => n.class_type==='UNETLoader' && /qwen/i.test(n.inputs.unet_name))), redraw:CM_SENT.some(g => Object.values(g).some(n => n.class_type==='UpscaleModelLoader')), triesGone:!$('[data-cc="try"]')}; });
  ok(go.full && !go.qwen && go.redraw && go.triesGone, '▶ Make it carries on from the picked try: step 2 is not drawn again, step 3 starts from it: ' + JSON.stringify(go));
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); if(fail.length){ console.log(fail.length + ' FAILED'); process.exit(1); } console.log('all ok');
})();
