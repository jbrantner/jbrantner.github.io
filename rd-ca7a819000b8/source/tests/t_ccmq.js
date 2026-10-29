// 🧍 Character Creator v2, path 2 (Jordan 2026-10-28): start from the mannequin. Step 1 opens rig/mannequin.html over the screen;
// its ✓ Use this one hands back the picked painting, her body shape and its words; ▶ Make her then skips MiniMax's zoom-out (the
// painting is her full body on white), redraws it lightly, and turns her at eye level only (no high or low passes, for every new
// character from v.230). Her shape goes into the Character Library for 🎬 Scene.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'), 'utf8');
  const PIC = fs.readFileSync(path.join(__dirname, 'fixtures', 'cc_short.png'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390, height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('dialog', d => d.accept());
  const STUB = '<!doctype html><title>Mannequin</title><p>stub</p>';
  await page.route('https://app.test/**', r => { const u = new URL(r.request().url()); if(u.pathname.endsWith('.txt')) return r.fulfill({ contentType:'text/plain', body:'' });
    if(u.pathname==='/rig/mannequin.html') return r.fulfill({ contentType:'text/html', body:STUB }); return r.fulfill({ contentType:'text/html', body:html }); });
  await page.route('https://jordo-desktop.test/**', r => r.fulfill({ contentType:'image/png', headers:{'access-control-allow-origin':'*'}, body:PIC }));
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  await page.click('#openSettings'); await page.click('#testBtn'); await page.evaluate(() => closeSheets());
  await page.evaluate(() => goTab('cc')); await page.waitForTimeout(200); await page.click('.ccstep[data-cstep="ref"] summary');
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-cc="start"]')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed')).join('|')==='🖼 From a picture:true|🧍 From the mannequin:false'), 'step 1 starts from a picture, with 🧍 From the mannequin beside it');
  await page.click('[data-cc="start"][data-v="mq"]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => ccChar().start==='mq' && !!$('[data-cc="mq"]') && !$('[data-cc="phone"]') && /Not painted yet/.test($('.ccstep[data-cstep="ref"]').textContent)), 'From the mannequin swaps the picture picker for 🧍 Open the mannequin');
  await page.click('[data-cc="go"]').catch(() => {}); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !ccP(ccChar())), '▶ Make her waits until she is painted');
  await page.click('[data-cc="mq"]'); await page.waitForTimeout(300);
  const src = await page.evaluate(() => { const f = $('#ccmq iframe'); return !$('#ccmq').hidden && f && f.getAttribute('src'); });
  const q = src ? new URL(src, 'https://app.test/').searchParams : new URLSearchParams();
  ok(src && /^rig\/mannequin\.html\?/.test(src) && q.get('id')===(await page.evaluate(() => ccChar().id)) && /iriselTouch/.test(q.get('ck') || 'iriselTouch') && /AFKJ/.test(q.get('st')) && q.get('tw')==='AFKJ Style', 'it opens the mannequin page over the screen, for her, with her model and style: ' + src);
  // the mannequin page answers (as rig/mannequin.html does)
  const id = await page.evaluate(() => ccChar().id), fr = page.frames().find(f => /mannequin\.html/.test(f.url()));
  await fr.evaluate(id => parent.postMessage({rdmq:'use', id, url:'https://jordo-desktop.test/view?filename=mq_00002_.png&subfolder=RenderDeck%2Fmannequin&type=output', shape:{cm:152, head:1.05, bust:1.4, hips:1.1, waist:1, shoulders:1, thighs:1, arms:1, legs:1}, hair:{style:'bob', len:0.5, vol:1, bangs:'blunt', side:true}, tags:'large breasts, short hair, bob cut, blunt bangs', desc:'silver hair, blue eyes, white blouse, black pleated skirt'}, '*'), id);
  await page.waitForTimeout(300);
  const c = await page.evaluate(() => JSON.parse(JSON.stringify(ccChar())));
  ok(/mq_00002_/.test(c.ref) && c.body.cm===152 && c.body.bust===1.4 && c.tags==='1girl, solo, large breasts, short hair, bob cut, blunt bangs, silver hair, blue eyes, white blouse, black pleated skirt' && c.hair.style==='bob' && c.mqDesc==='silver hair, blue eyes, white blouse, black pleated skirt' && await page.evaluate(() => $('#ccmq').hidden), '✓ Use this one: her picture, shape and tags come back and the mannequin closes: ' + c.tags);
  ok(await page.evaluate(() => /5′ 0″ \(152 cm\) · head 105% · bust 140% · hips 110% · 💇 bob/.test($('.ccstep[data-cstep="ref"]').textContent) && /Back to the mannequin/.test($('[data-cc="mq"]').textContent)), 'step 1 shows her shape and goes back to the mannequin');
  if(process.env.SHOT) await page.screenshot({path:path.join(process.env.SHOT, 'ccmq-step1.png'), fullPage:true});
  ok(await page.evaluate(() => /doesn’t zoom out/.test($('.ccstep[data-cstep="full"]').textContent) && /eye level/.test($('.ccstep[data-cstep="turn"]').textContent)), 'steps 2 and 4 say what happens: no zoom-out, eye level only');
  // ✕ Close from the page
  await page.click('[data-cc="mq"]'); await page.waitForTimeout(200); await page.frames().find(f => /mannequin\.html/.test(f.url())).evaluate(() => parent.postMessage({rdmq:'close'}, '*')); await page.waitForTimeout(200);
  ok(await page.evaluate(() => $('#ccmq').hidden && /mq_00002_/.test(ccChar().ref)), '✕ Close shuts it and keeps her picture');
  // ▶ Make her
  await page.evaluate(() => { CM_SENT.length = 0; }); await page.click('[data-cc="go"]');
  await page.waitForFunction(() => { const P = ccP(ccChar()); return P && P.src; }, null, {timeout:8000});
  const G = await page.evaluate(() => CM_SENT.map(g => JSON.parse(JSON.stringify(g)))), of = (g, cls) => Object.values(g).filter(n => n.class_type===cls);
  ok(!G.some(g => of(g, 'MiniMaxH3ReferenceToVideo').length), '▶ Make her sends no MiniMax zoom-out');
  const red = G.find(g => of(g, 'UpscaleModelLoader').length);
  ok(red && of(red, 'KSampler')[0].inputs.denoise===0.25 && /silver hair/.test(of(red, 'CLIPTextEncode')[0].inputs.text) && /mq_00002_|\.png/.test(JSON.stringify(of(red, 'LoadImage'))), 'step 3 redraws her lightly (0.25) with her tags: ' + (red && of(red, 'KSampler')[0].inputs.denoise));
  const P = await page.evaluate(() => { const P = ccP(ccChar()); return {eye:P.eyeOnly, mq:P.cc.mq, full:P.cc.full.url, body:P.cc.body, views:P.views.length, rings:[...new Set(P.views.map(v => v.ring))], mids:P.mids.length, lk:P.lk.filter(h => h.str==='cc').length, orb:P.orb.map(o => o.step + o.ring)}; });
  ok(P.eye && P.mq && /mq_00002_/.test(P.full) && P.body.cm===152 && P.views===8 && P.rings.join()==='1' && P.mids===8 && P.lk===16 && P.orb.join()==='circle1', 'her turnaround is eye level only: 8 sides + 8 between, one MiniMax turn, 16 to finish: ' + JSON.stringify(P));
  ok(await page.evaluate(() => { const P = ccP(ccChar()), p = ccProgress(P); return p.step===4 && p.nbase===16 && p.nmv===1; }), 'her progress counts only those');
  // 👁 her eye-level turn came back and was lined up: with no sweeps to guide, the rig still fits her turn so the 16 angles start
  const rs = await page.evaluate(() => { const P = ccP(ccChar()), o = P.orb[0]; o.urls = Array.from({length:31}, (_, i) => 'https://jordo-desktop.test/view?filename=circle_eye_' + i + '.png'); o.turn = 30; o.pick = [0, 4, 8, 11, 15, 19, 23, 26];
    P.src = P.src || 'x'; delete P.rigFit; delete P.rigFail; window.__spin = 0; const f = m3RigSpin; m3RigSpin = Q => { window.__spin++; }; m3Resume(P); m3RigSpin = f; return {spin:window.__spin, rigging:!!P.rigging}; });
  ok(rs.spin===1 && rs.rigging, '👁 a finished eye-level turn goes on to fit the rig (her angles waited for it for ever): ' + JSON.stringify(rs));
  await page.evaluate(() => { delete ccP(ccChar()).rigging; });
  // ↻ Redo from step 2 keeps the mannequin painting (MiniMax doesn't zoom out)
  await page.evaluate(() => { CM_SENT.length = 0; const P = ccP(ccChar()); ccRedo(P, 2); });
  ok(await page.evaluate(() => { const P = ccP(ccChar()); return /mq_00002_/.test(P.cc.full.url) && !P.cc.redraw.url && P.eyeOnly && P.views.length===8; }), '↻ Redo from step 2 keeps her painting and stays eye level');
  // the library keeps her shape
  ok(await page.evaluate(() => { const e = ccLibEntry(ccChar(), ccP(ccChar())); return e.meta.body && e.meta.body.cm===152 && e.meta.body.bust===1.4 && e.meta.hair.style==='bob'; }), '📚 her Character Library entry keeps her body shape and hair for 🎬 Scene');
  ok(await page.evaluate(() => { const u = new URL('https://app.test/' + (ccOpenMq(ccChar()), $('#ccmq iframe').getAttribute('src'))).searchParams; ccCloseMq(); return u.get('desc')==='silver hair, blue eyes, white blouse, black pleated skirt' && JSON.parse(u.get('hair')).style==='bob'; }), 'reopening the mannequin gives it back her own words and hair (not the added tags)');
  // a character from a picture still starts with MiniMax, also at eye level only
  await page.evaluate(() => { ccNewChar(); ccDraw(true); }); await page.waitForTimeout(100);
  await page.setInputFiles('#ccPick', {name:'her.png', mimeType:'image/png', buffer:PIC}); await page.waitForTimeout(300);
  await page.evaluate(() => { CM_SENT.length = 0; }); await page.click('[data-cc="go"]'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => { const P = ccP(ccChar()); return P && !P.cc.mq && P.eyeOnly && P.views.length===8 && CM_SENT.some(g => Object.values(g).some(n => n.class_type==='MiniMaxH3ReferenceToVideo')); }), 'from a picture: MiniMax zooms out as before, and she is turned at eye level only too');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0); })();
