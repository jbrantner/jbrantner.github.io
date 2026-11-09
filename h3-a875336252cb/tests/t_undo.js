// ↶ Undo / ↷ Redo over the whole app: Shot box typing (one step per run), settings, takes taken off the list, Films timeline.
// Run: NODE_PATH=$(npm root -g) node tests/t_undo.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8031);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', rt => { const p = new URL(rt.request().url()).pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, R);
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8031/index.html');
  await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
  await page.waitForTimeout(1500);
  const U = () => page.evaluate(() => [H3.UNDO().length, H3.REDO().length]);
  ok(await page.evaluate(() => document.querySelector('#undoBtn').disabled && document.querySelector('#redoBtn').disabled), '↶ ↷ sit in the top bar, greyed out with nothing to undo');
  // typing: one step for a run of typing
  await page.click('#prompt'); await page.keyboard.type('she walks in', {delay:30}); await page.waitForTimeout(800);
  ok((await U())[0]===1 && await page.evaluate(() => H3.S.f.prompt==='she walks in' && !document.querySelector('#undoBtn').disabled), 'a run of typing is one undo step: ' + await U());
  await page.waitForTimeout(1700); await page.keyboard.type(' and sits', {delay:30}); await page.waitForTimeout(800);
  ok((await U())[0]===2, 'typing again after a pause is a second step');
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => H3.S.f.prompt==='she walks in' && document.querySelector('#prompt').value==='she walks in'), '↶ takes the last words back out (form and box)');
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => H3.S.f.prompt==='' && document.querySelector('#prompt').value===''), '↶ again: empty box');
  await page.click('#redoBtn'); await page.click('#redoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => H3.S.f.prompt==='she walks in and sits') && (await U()).join()==='2,0', '↷ ↷ puts both back');
  // a setting
  const sec0 = await page.evaluate(() => H3.S.f.seconds);
  await page.evaluate(() => { H3.S.f.seconds = 9; H3.save(); H3.undoNow(); }); await page.waitForTimeout(100);
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(s => H3.S.f.seconds===s && H3.S.f.prompt==='she walks in and sits', sec0), '↶ puts a setting back and leaves the words');
  // changes nobody made (a render finishing, the playhead) are not steps
  await page.waitForTimeout(2700); const n0 = (await U())[0];
  await page.evaluate(() => { H3.S.f.mp = 0.3; H3.S.takes.unshift({id:'tk1', t:Date.now(), pc:'x', prompt:'a cat', pieces:[{prompt:'a cat'}], state:'done'}); H3.save(); }); await page.waitForTimeout(1600);
  ok((await U())[0]===n0, 'a change made by the app itself is not an undo step');
  // a take taken off the list comes back, and goes again with ↷
  await page.evaluate(() => { H3.S.takes = H3.S.takes.filter(t => t.id!=='tk1'); H3.save(); H3.undoNow(); });
  ok(await page.evaluate(() => !H3.S.takes.some(t => t.id==='tk1')), 'take off the list');
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => H3.S.takes.some(t => t.id==='tk1' && t.prompt==='a cat')), '↶ brings the take back');
  await page.click('#redoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !H3.S.takes.some(t => t.id==='tk1')), '↷ takes it off again');
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  // a take's words changed everywhere (👥 swap) come back too
  await page.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tk1'); t.prompt = t.pieces[0].prompt = 'a dog'; H3.save(); H3.undoNow(); });
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tk1'); return t.prompt==='a cat' && t.pieces[0].prompt==='a cat'; }), "↶ puts a take's words back");
  // 📚 Library
  await page.evaluate(() => { H3.S.lib.push({id:'Lx', kind:'char', name:'Kat', stand:'', desc:'', pics:[], keep:'exact'}); H3.save(); H3.undoNow(); });
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !H3.S.lib.some(x => x.id==='Lx')), '↶ takes a new Library entry away');
  // 🎞 Films timeline
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /film\//.test(f.src)), null, {timeout:10000}).catch(() => {});
  let fr = null; for(let i = 0; i < 40 && !fr; i++){ fr = page.frames().find(f => /film\/\?embed=1/.test(f.url())); if(!fr) await page.waitForTimeout(250); }
  if(!fr){ await page.click('[data-tab="films"]'); await page.waitForTimeout(1500); fr = page.frames().find(f => /film\/\?embed=1/.test(f.url())); }
  await fr.waitForFunction(() => window.FILM && FILM.S, null, {timeout:10000});
  await page.waitForTimeout(800); await page.evaluate(() => H3.undoNow());
  const nU = (await U())[0];
  await fr.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', {bubbles:true}))); // a tap in Films
  await fr.evaluate(() => { FILM.S.films.unshift({id:'fA', name:'Film A', tracks:[{id:'tr1', clips:[]}], pps:24}); FILM.save(); FILM.go({v:'film', film:'fA'}); });
  await page.evaluate(() => H3.undoNow()); await page.waitForTimeout(400);
  await fr.evaluate(() => { FILM.S.films[0].name = 'Renamed'; FILM.save(); }); await page.evaluate(() => H3.undoNow());
  ok((await U())[0] >= nU + 2, 'film changes are steps of the same one history: ' + (await U()));
  const fb = await fr.$('#undoBtn'); ok(fb && !(await fb.isDisabled()), "the Films timeline's own ↶ is lit");
  await fb.click(); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => FILM.S.films[0].name==='Film A'), "the Films ↶ is the same undo: the film's name is back");
  await page.click('#redoBtn'); await page.waitForTimeout(300);
  ok(await fr.evaluate(() => FILM.S.films[0].name==='Renamed'), '↷ from the top bar redoes it in Films');
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
