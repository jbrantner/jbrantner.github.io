// ☰ reorder tracks in 🎞 Films (Jordan 2026-11-13: "I need to be able to reorder the tracks"): track ⋯ ⬆/⬇ Move and dragging the
// ☰ handle; the upper track draws on top in the preview (activeAt/layersAt/overlay z) and in ⬇ Export (track:k).
// Run: NODE_PATH=$(npm root -g) node tests/t_trkorder.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8037);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}, hasTouch:true});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', rt => rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}));
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const base = {model:'m', turbo:true, loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x', pc:R, w:640, h:360, state:'done', pieces:[{deliv:120, gen:124, ctx:0, state:'done', pid:'p', file:F('p.mp4')}]};
  const tk = (id, extra) => Object.assign({}, base, {id, name:'h3_' + id, prompt:id, final:F(id + '.mp4')}, extra || {});
  const deck = {bare:true, pcs:[{name:'Render', url:R, on:true}], takes:[tk('tA'), tk('tB'), tk('tC')]};
  await page.addInitScript(d => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); sessionStorage.setItem('init', '1'); } }, deck);
  await page.goto('http://127.0.0.1:8037/film/index.html'); await page.waitForTimeout(500);
  await page.evaluate(() => { FILM.S.autoPrev = false; FILM.S.guideOn = false;
    const f = {id:'f1', name:'Film 1', pps:24, canvas:'wide', tracks:[{id:'tr1', clips:[{id:'a', take:'tA', in:0, out:5, dur:5, at:0}]}, {id:'tr2', clips:[{id:'b', take:'tB', in:0, out:5, dur:5, at:0}], xf:{s:0.4, r:0, x:0.2, y:0.2}}, {id:'tr3', clips:[{id:'c', take:'tC', in:0, out:5, dur:5, at:0}]}]};
    FILM.S.films = [f]; FILM.PH = 1; FILM.go({v:'film', film:'f1'}); });
  await page.waitForTimeout(300);
  const ids = () => page.evaluate(() => FILM.S.films[0].tracks.map(t => t.id).join(','));
  ok(await page.$$eval('#tl .trk .tdrag', h => h.length)===3, 'every track has a ☰ handle');
  ok(await page.evaluate(() => FILM.activeAt(FILM.S.films[0], 1).id)==='a', 'track 1 (a) plays on top at first');
  ok(await page.evaluate(() => { const L = FILM.layersAt(FILM.S.films[0], 1); return L.base.id==='a' && !L.ov.length; }), 'full-frame track 1 covers the ⧉ track 2 below it');

  // ⋯ › ⬇ Move down on track 1
  await page.click('#tl .trk[data-k="0"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  ok(await page.$eval('#sheetCard [data-act="trkMove"][data-d="-1"]', b => b.disabled), '⬆ Move up is off for the top track');
  await page.click('#sheetCard [data-act="trkMove"][data-d="1"]'); await page.waitForTimeout(200);
  ok(await ids()==='tr2,tr1,tr3', '⬇ Move down swaps track 1 and 2 (' + await ids() + ')');
  ok(await page.evaluate(() => document.getElementById('sheet').hidden), 'the sheet closes after a move');
  ok(await page.evaluate(() => { const L = FILM.layersAt(FILM.S.films[0], 1); return L.base.id==='a' && L.ov.length===1 && L.ov[0].c.id==='b'; }), 'now the ⧉ track draws over track 2 in the preview');
  ok(await page.evaluate(() => { const o = document.querySelector('.stage .ovl[data-tr="tr2"]'); return +o.style.zIndex > 10 + 1; }), 'its overlay layer sits on top');
  ok(await page.evaluate(() => FILM.expClips(FILM.S.films[0]).out.find(c => /tB/.test(c.filename)).track===0), 'export sends the moved track as track 0 (top)');
  await page.evaluate(() => FILM.undo()); await page.waitForTimeout(200);
  ok(await ids()==='tr1,tr2,tr3', '↶ Undo puts the order back');

  // drag track 3's ☰ up two rows with a finger
  const h = await page.$eval('#tl .trk[data-k="2"] .tdrag', e => { const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
  const rh = await page.$eval('#tl .trk', e => e.offsetHeight);
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x, h.y - rh, {steps:5});
  ok(await page.$$eval('#tl .trk.tmove', r => r.length)===1, 'the dragged track lifts while moving');
  await page.mouse.move(h.x, h.y - 2 * rh - 5, {steps:5}); await page.mouse.up(); await page.waitForTimeout(250);
  ok(await ids()==='tr3,tr1,tr2', 'dragging ☰ of track 3 up two rows puts it on top (' + await ids() + ')');
  ok(await page.evaluate(() => FILM.activeAt(FILM.S.films[0], 1).id)==='c', 'the moved track now plays on top');
  ok(await page.evaluate(() => FILM.SEL)==null, 'dragging the handle does not select or move a clip');
  ok(await page.evaluate(() => FILM.S.films[0].tracks.every(t => t.clips.length===1 && t.clips[0].at===0)), 'clips stay where they were on their tracks');
  // a short drag (less than half a row) changes nothing
  const h2 = await page.$eval('#tl .trk[data-k="1"] .tdrag', e => { const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
  await page.mouse.move(h2.x, h2.y); await page.mouse.down(); await page.mouse.move(h2.x, h2.y + rh * 0.3, {steps:3}); await page.mouse.up(); await page.waitForTimeout(200);
  ok(await ids()==='tr3,tr1,tr2', 'a small wiggle of ☰ keeps the order');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
