// 🗂 Renders: which clip and take each render is (Jordan 2026-11-11). Run: NODE_PATH=$(npm root -g) node tests/t_takewhere.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8031);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', rt => rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}));
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const base = {model:'m', loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x', pc:R, w:640, h:360, state:'done', pieces:[{deliv:120, state:'done', file:F('p.mp4')}], film:'F1'};
  const T = (id, o) => Object.assign({}, base, {id, name:'h3_' + id, final:F(id + '.mp4')}, o);
  const deck = {pcs:[{name:'Render', url:R, on:true}], takes:[
    T('a', {t:1, prompt:'A woman walks in'}),
    T('c1', {t:2, prompt:'She sits', carry:{key:'k1'}}), T('c2', {t:3, prompt:'She sits', carry:{key:'k1'}}), T('c3', {t:4, prompt:'She sits', carry:{key:'k1'}}),
    T('lone', {t:5, prompt:'Not used'})]};
  await page.addInitScript(d => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); sessionStorage.setItem('init', '1'); } }, deck);
  await page.goto('http://127.0.0.1:8031/film/index.html'); await page.waitForTimeout(500);
  await page.evaluate(() => { FILM.S.autoPrev = false; FILM.S.films = [{id:'F1', name:'Film 1', tracks:[{clips:[{id:'x2', take:'c2', at:5, in:0, out:5}]}, {clips:[{id:'x1', take:'a', at:0, in:0, out:5}]}]}]; FILM.save(); });
  const w = await page.evaluate(() => ['a', 'c1', 'c2', 'c3', 'lone'].map(id => FILM.takeWhere(id)));
  ok(w[0].ci===1 && w[0].n===1 && w[0].use, 'the first clip (left to right, any track) is Clip 1, Take 1, in use');
  ok(w[1].ci===2 && w[1].n===1 && w[1].of===3 && !w[1].use && w[2].n===2 && w[2].use && w[3].n===3, 'the carry-on takes are Clip 2 Takes 1-3 of 3, take 2 in use (' + JSON.stringify(w.slice(1, 4)) + ')');
  ok(w[4] && !w[4].clip, 'a take on no clip says so');
  await page.evaluate(() => FILM.go({v:'film', film:'F1'})); await page.waitForTimeout(300);
  await page.evaluate(() => FILM.selTake('c3')); await page.waitForTimeout(200);
  const st = await page.evaluate(() => { const b = document.querySelector('#vstrip [data-t="c3"]'); return {sel:FILM.SEL, hl:!!(b && b.classList.contains('hl')), l:b && b.textContent}; });
  ok(st.sel==='x2' && st.hl && /Take 3/.test(st.l), 'Go to this take selects its clip and picks out the same Take 3 in "Takes of this clip" (' + JSON.stringify(st) + ')');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0); })();
