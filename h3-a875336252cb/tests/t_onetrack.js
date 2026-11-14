// 🎞 One track (Jordan 2026-11-13: "make it just 1 track again", picked "One track, extras hidden"): without ⚙ Show all tools the
// Films timeline shows one track; empty extra tracks, ＋ Track, the canvas row, ☰ reorder and the track menu's move / ⧉ / ✂ / ⇔ are
// hidden (nothing is deleted). A track that has clips still shows, and Show all tools brings everything back.
// Run: NODE_PATH=$(npm root -g) node tests/t_onetrack.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8041);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}, hasTouch:true});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', rt => rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}));
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const base = {model:'m', turbo:true, loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x', pc:R, w:640, h:360, state:'done', pieces:[{deliv:120, gen:124, ctx:0, state:'done', pid:'p', file:F('p.mp4')}]};
  const tk = id => Object.assign({}, base, {id, name:'h3_' + id, prompt:id, final:F(id + '.mp4')});
  const deck = {bare:true, pcs:[{name:'Render', url:R, on:true}], takes:[tk('tA'), tk('tB'), tk('tC')]};
  await page.addInitScript(d => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); sessionStorage.setItem('init', '1'); } }, deck);
  await page.goto('http://127.0.0.1:8041/film/index.html'); await page.waitForTimeout(500);
  const open = tracks => page.evaluate(tr => { FILM.S.autoPrev = false; FILM.S.guideOn = false; FILM.S.films = [{id:'f1', name:'Film 1', pps:24, canvas:'wide', tracks:tr}]; FILM.go({v:'film', film:'f1'}); }, tracks);
  const shown = () => page.$$eval('#tl .trk', rs => rs.filter(r => getComputedStyle(r).display!=='none').map(r => +r.dataset.k).join(','));
  const vis = sel => page.$$eval(sel, es => es.some(e => e.offsetParent!==null));
  // a new-style film with two empty spare tracks
  await open([{id:'tr1', clips:[{id:'a', take:'tA', in:0, out:5, dur:5, at:0}]}, {id:'tr2', clips:[]}, {id:'tr3', clips:[]}]); await page.waitForTimeout(250);
  ok(await shown()==='0', 'one track on the timeline: the empty spare tracks are hidden (' + await shown() + ')');
  ok(await page.evaluate(() => FILM.S.films[0].tracks.length)===3, 'nothing is deleted: the spare tracks are still in the film');
  ok(!(await vis('[data-act="addTrack"]')), '＋ Track is behind Show all tools');
  ok(!(await vis('[data-act="canvas"]')), 'the canvas row is behind Show all tools');
  ok(!(await vis('#tl .tdrag')), 'no ☰ reorder handles');
  ok(!/🎬/.test(await page.$eval('#tl .trk[data-k="0"] .tn', e => e.textContent)), 'no 🎬 "new clips go here" mark with one track');
  ok(/video editor/.test(await page.$eval('#selNote', e => e.textContent)), 'the hint points to ⬇ Export and a video editor');
  ok(await page.evaluate(() => FILM.actK(FILM.S.films[0]))===0, 'new clips go on the one track');
  await page.click('#tl .trk[data-k="0"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  ok(!(await vis('#sheetCard [data-act="xfOn"]')) && !(await vis('#sheetCard [data-act="cropOn"]')) && !(await vis('#sheetCard [data-act="grpOn"]')), 'track menu: ⧉ picture in picture, ✂ crop and ⇔ slide the track are hidden');
  ok(await vis('#sheetCard [data-act="upTrack"]'), 'track menu: ⬆ Upscale this track stays');
  await page.evaluate(() => { document.getElementById('sheet').hidden = true; });
  // dragging a clip down doesn't drop it onto a hidden track
  await page.evaluate(() => { const f = FILM.S.films[0]; f.tracks[0].clips[0].at = 0; });
  const box = await page.$eval('#tl .clip[data-c="a"]', e => { const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(100);
  await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.move(box.x, box.y + 70, {steps:6}); await page.mouse.up(); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.clipOf(FILM.S.films[0], 'a').k)===0, 'dragging a clip down keeps it on the one track');
  // an older film whose second track has clips (e.g. ⬆ Upscale's new track): that track still shows
  await open([{id:'tr1', clips:[{id:'a', take:'tA', in:0, out:5, dur:5, at:0}]}, {id:'tr2', clips:[{id:'b', take:'tB', in:0, out:5, dur:5, at:0}], xf:{s:0.4, r:0, x:0.2, y:0.2}}, {id:'tr3', clips:[]}]); await page.waitForTimeout(250);
  ok(await shown()==='0,1', 'a track that has clips still shows (' + await shown() + ')');
  await page.click('#tl .trk[data-k="1"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  ok(await vis('#sheetCard [data-act="xfOn"]'), 'a track already in ⧉ picture in picture keeps its ⧉ button');
  await page.evaluate(() => { document.getElementById('sheet').hidden = true; });
  // ⚙ Show all tools: everything back
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('h3deck')); d.bare = false; localStorage.setItem('h3deck', JSON.stringify(d)); FILM.go({v:'film', film:'f1'}); }); await page.waitForTimeout(250);
  ok(await shown()==='0,1,2', 'with Show all tools every track shows (' + await shown() + ')');
  ok(await vis('[data-act="addTrack"]') && await vis('[data-act="canvas"]') && await vis('#tl .tdrag'), '＋ Track, canvas and ☰ are back');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
