// Films' renders under the canvas say which clip and take each is; ⬆ Pick it selects it up top (Jordan 2026-11-11)
// Run: NODE_PATH=$(npm root -g) node tests/t_takewhere2.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8033);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', rt => rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}));
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const base = {model:'m', loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x', pc:R, w:640, h:360, state:'done', pieces:[{deliv:120, state:'done', file:F('p.mp4')}], film:'F1'};
  const T = (id, o) => Object.assign({}, base, {id, name:'h3_' + id, final:F(id + '.mp4')}, o);
  const deck = {pcs:[{name:'Render', url:R, on:true}], takes:[T('a', {t:1, prompt:'A woman walks in'}),
    T('c1', {t:2, prompt:'She sits', carry:{key:'k1'}}), T('c2', {t:3, prompt:'She sits', carry:{key:'k1'}}), T('c3', {t:4, prompt:'She sits', carry:{key:'k1'}})]};
  await page.addInitScript(d => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); sessionStorage.setItem('init', '1'); } }, deck);
  await page.goto('http://127.0.0.1:8033/index.html'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const F = FW.FILM; F.S.films = [{id:'F1', name:'Film 1', tracks:[{clips:[{id:'x1', take:'a', at:0, in:0, out:5}, {id:'x2', take:'c2', at:5, in:0, out:5}]}]}]; F.save(); F.go({v:'film', film:'F1'}); });
  await page.waitForTimeout(2500);
  const lab = await page.$$eval('#takes .take', e => e.map(x => x.dataset.take + ':' + ((x.querySelector('.rtWhere') || {}).textContent || '')));
  console.log(lab);
  ok(lab.some(x => /^c3:.*Clip 2 · Take 3 of 3/.test(x)) && lab.some(x => /^c2:.*Take 2 of 3 · in use/.test(x)) && lab.some(x => /^a:.*Clip 1 · Take 1/.test(x)), 'the renders under the canvas say their clip and take');
  await page.click('#takes [data-pick="c3"]'); await page.waitForTimeout(400);
  const st = await page.evaluate(() => { const b = FW.document.querySelector('#vstrip [data-t="c3"]'); return {sel:FW.FILM.SEL, hl:!!(b && b.classList.contains('hl'))}; });
  ok(st.sel==='x2' && st.hl, '⬆ Pick it selects clip 2 up top with Take 3 picked out (' + JSON.stringify(st) + ')');
  await page.evaluate(() => { const F = FW.FILM, f = F.S.films[0], r = F.clipOf(f, 'x2'); F.useTake(f, r, F.takeOf('c3')); F.save(); }); await page.waitForTimeout(2000);
  ok(/in use/.test(await page.textContent('#takes [data-take="c3"] .rtWhere')), 'picking another take moves "in use" to it');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0); })();
