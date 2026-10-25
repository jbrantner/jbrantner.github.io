// 🗂 projects (Jordan 2026-10-24): the thumbnails under the picture are projects, each showing the picture picked in it;
// renders made while a project is open go into it (listed in the row below), ＋ New project starts an empty one, renders from
// before projects are in "Earlier renders", and Hidden keeps its own projects.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' / ')));
  let answer = 'Café scene'; page.on('dialog', d => d.type()==='prompt' ? d.accept(answer) : d.accept());
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.click('#testBtn'); await page.evaluate(() => closeSheets());
  const st = () => page.evaluate(() => ({projs:[...document.querySelectorAll('#projs .sth')].map(t => [t.dataset.proj, (t.querySelector('.pcount') || {}).textContent || (t.querySelector('img') ? '1' : '0'), t.classList.contains('on'), (t.querySelector('img') || {}).dataset ? (t.querySelector('img') || {dataset:{}}).dataset.full : '']),
    strip:document.querySelectorAll('#strip img').length, head:$('#projHead').textContent, shown:$('#shown').hidden ? '' : $('#shown').src, proj:S.proj, empty:$('#empty').textContent}));
  // renders from before projects become "Earlier renders"
  await page.evaluate(() => { S.gallery = [1, 2, 3].map(n => ({url:'https://render.test/view?filename=old' + n + '.png', prompt:'old ' + n, seed:n, t:Date.now() - n * 1000})); delete S.projects; delete S.proj; save(); drawStrip(); showOpen(); });
  let s = await st();
  ok(s.projs.length===1 && s.projs[0][0]==='earlier' && s.projs[0][1]==='3' && s.projs[0][2] && s.strip===3 && /Earlier renders · 3 pictures/.test(s.head) && /old1/.test(s.shown), 'the renders from before are one project, "Earlier renders" (3 pictures), open, its pictures in the row below: ' + JSON.stringify(s));
  // ＋ New project: empty, open
  await page.click('#projs [data-newproj]'); s = await st();
  ok(s.projs.length===2 && s.projs[0][2] && s.projs[0][1]==='0' && s.strip===0 && !s.shown && /Project 1/.test(s.empty) && /Project 1 · 0 pictures/.test(s.head), '＋ New project opens an empty one: no picture, nothing in its row: ' + JSON.stringify(s));
  const B = s.proj;
  // renders go into it
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#strip img').length===1, null, {timeout:8000});
  await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#strip img').length===2, null, {timeout:8000});
  s = await st();
  ok(s.proj===B && s.projs.find(p => p[0]===B)[1]==='2' && s.projs.find(p => p[0]==='earlier')[1]==='3' && s.shown && s.projs.find(p => p[0]===B)[3]===s.shown, 'two renders land in the new project; its thumbnail shows the newest; Earlier renders still has 3: ' + JSON.stringify(s));
  // the picture you look at becomes the project's thumbnail
  await page.click('#strip img[data-i="1"]'); s = await st();
  ok(s.projs.find(p => p[0]===B)[3]===s.shown && await page.evaluate(b => S.projects.find(p => p.id===b).pick===S.gallery[1].url, B), 'tapping the older one shows it and makes it the project\'s thumbnail');
  // opening another project
  await page.click('#projs .sth[data-proj="earlier"] img'); s = await st();
  ok(s.proj==='earlier' && s.strip===3 && /old1/.test(s.shown), 'tapping Earlier renders opens it: its picture and its 3 pictures');
  // a render started in one project lands there even if you open another meanwhile
  await page.click(`#projs .sth[data-proj="${B}"] img`); await page.click('#goBtn'); await page.click('#projs .sth[data-proj="earlier"] img');
  await page.waitForFunction(b => S.gallery.filter(g => g.proj===b).length===3, B, {timeout:8000}); await page.waitForTimeout(300); s = await st();
  ok(s.proj==='earlier' && /old1/.test(s.shown) && s.strip===3 && s.projs.find(p => p[0]===B)[1]==='3', 'a render started in the new project lands there while you look at Earlier renders, which stays on screen: ' + JSON.stringify(s));
  // a picture tapped while a render runs stays on screen when the render lands
  await page.click(`#projs .sth[data-proj="${B}"] img`); await page.click('#goBtn'); await page.waitForTimeout(50);
  const pinned = await page.evaluate(() => { const i = S.gallery.findIndex((g, n) => g.proj===S.proj && n > 0); document.querySelector(`#strip img[data-i="${i}"]`).click(); return S.gallery[i].url; });
  await page.waitForFunction(b => S.gallery.filter(g => g.proj===b).length===4, B, {timeout:8000}); await page.waitForTimeout(300);
  ok(await page.evaluate(u => $('#shown').src===u && !S.queue.length, pinned), 'a picture you tap while a render runs stays on screen when the render lands (Jordan)');
  // rename
  await page.click(`#projs .sth[data-proj="${B}"] img`); await page.click('#projHead [data-projname]');
  ok(/Café scene · 4 pictures/.test(await page.textContent('#projHead')), '✎ Rename names the project');
  // Hidden keeps its own
  await page.click('#modeBtn'); await page.waitForTimeout(300); s = await st();
  ok(!s.projs.some(p => p[0]===B) && s.strip===0, 'Hidden has its own projects, none of the normal ones: ' + JSON.stringify(s));
  await page.click('#projs [data-newproj]'); await page.click('#goBtn'); await page.waitForFunction(() => document.querySelectorAll('#strip img').length===1, null, {timeout:8000});
  const hp = await page.evaluate(() => S.proj);
  await page.click('#modeBtn'); await page.waitForTimeout(300); s = await st();
  ok(s.proj===B && s.projs.length===2 && !s.projs.some(p => p[0]===hp) && s.strip===4, 'back in the normal workstation: its projects as they were, the Hidden one not among them: ' + JSON.stringify(s));
  // kept on reload
  await page.reload(); await page.waitForTimeout(500); s = await st();
  ok(s.proj===B && s.projs.length===2 && /Café scene/.test(s.head) && s.strip===4 && s.shown, 'projects are kept when the app is reopened: ' + JSON.stringify(s));
  // 🗑 Delete removes the project and its pictures, and opens the next one
  await page.click('#projHead [data-projdel]'); await page.waitForTimeout(300); s = await st();
  ok(!s.projs.some(p => p[0]===B) && s.proj==='earlier' && s.strip===3 && await page.evaluate(b => !S.gallery.some(g => g.proj===b) && !S.projects.some(p => p.id===b), B), '🗑 Delete removes the project and its 4 pictures and opens Earlier renders: ' + JSON.stringify(s));
  await page.click('#projs [data-newproj]'); await page.click('#projHead [data-projdel]'); await page.waitForTimeout(300); s = await st();
  ok(s.proj==='earlier' && s.projs.length===1, 'an empty project can be deleted too: ' + JSON.stringify(s));
  await page.reload(); await page.waitForTimeout(500); s = await st();
  ok(s.proj==='earlier' && s.projs.length===1 && s.strip===3, 'the deleted project stays gone after reopening: ' + JSON.stringify(s));
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
