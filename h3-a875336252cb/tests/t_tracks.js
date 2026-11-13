// 🎞 Films separate tracks in bare bones (Jordan 2026-11-13): every track shows, clips drag between tracks, new clips go on the
// 🎬 track (the one tapped last), and ⇔ Select the whole track slides all its clips together, snapping to other tracks' clip edges.
// Run: NODE_PATH=$(npm root -g) node tests/t_tracks.js
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
  const base = {model:'m', turbo:true, loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x', pc:R, w:640, h:360, state:'done', pieces:[{deliv:120, gen:124, ctx:0, state:'done', pid:'p', file:F('p.mp4')}]};
  const tk = (id, extra) => Object.assign({}, base, {id, name:'h3_' + id, prompt:id, final:F(id + '.mp4')}, extra || {});
  const deck = {bare:true, pcs:[{name:'Render', url:R, on:true}], takes:[tk('tA'), tk('tB'), tk('tC'), tk('tD')]};
  await page.addInitScript(d => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); sessionStorage.setItem('init', '1'); } }, deck);
  await page.goto('http://127.0.0.1:8031/film/index.html'); await page.waitForTimeout(500);
  const fid = await page.evaluate(() => { FILM.S.autoPrev = false; FILM.S.guideOn = false; const L = 5;
    const f = {id:'f1', name:'Film 1', pps:24, tracks:[{id:'tr1', clips:[{id:'a', take:'tA', in:0, out:L, dur:L, at:0}, {id:'b', take:'tB', in:0, out:L, dur:L, at:L}]}, {id:'tr2', clips:[]}]};
    FILM.S.films = [f]; FILM.PH = 0; FILM.go({v:'film', film:'f1'}); return f.id; });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.body.classList.contains('bare')), 'bare bones is on');
  ok(await page.$$eval('#tl .trk', r => r.length)===2, 'an empty second track still shows in bare bones');
  ok(await page.$eval('.tools [data-act="addTrack"]', b => getComputedStyle(b).display!=='none'), '＋ Track shows in bare bones');

  // drag clip b down onto track 2 (bare bones used to keep clips on their track)
  const pt = async id => page.$eval('.clip[data-c="' + id + '"]', e => { const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
  await page.evaluate(() => { FILM.PH = 5; FILM.SEL = 'b'; FILM.draw(); }); await page.waitForTimeout(200);
  let b = await pt('b'); await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x, b.y + 30, {steps:4}); await page.mouse.move(b.x, b.y + 58, {steps:4}); await page.mouse.up(); await page.waitForTimeout(300);
  let f = await page.evaluate(() => FILM.S.films[0]);
  ok(f.tracks[1].clips.some(c => c.id==='b') && f.tracks[0].clips.length===1, 'a clip drags down to track 2 in bare bones');
  ok(await page.evaluate(() => FILM.actK(FILM.S.films[0]))===1, 'the track of the clip tapped last is the 🎬 track');
  // put b back on track 1 at 5 s, and two clips on track 2 at 2 s and 12 s
  await page.evaluate(() => { const f = FILM.S.films[0]; f.tracks = [{id:'tr1', clips:[{id:'a', take:'tA', in:0, out:5, dur:5, at:0}, {id:'b', take:'tB', in:0, out:5, dur:5, at:5}]}, {id:'tr2', clips:[{id:'c', take:'tC', in:0, out:3, dur:5, at:2}, {id:'d', take:'tD', in:0, out:2, dur:5, at:12}]}]; FILM.SEL = null; FILM.PH = 10; FILM.draw(); });
  await page.waitForTimeout(200);

  // tap empty timeline on track 1 → it becomes the 🎬 track; a new take from the Render form lands at its end
  const row1 = await page.$eval('#tl .trk[data-k="0"]', e => { const r = e.getBoundingClientRect(); return {y:r.y + 40}; });
  const x12 = await page.evaluate(() => { const tl = document.querySelector('#tl .trk[data-k="0"]').getBoundingClientRect(); return tl.x + 11 * 24; });
  await page.mouse.click(x12, row1.y); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.actK(FILM.S.films[0]))===0, 'tapping empty space on track 1 makes it the 🎬 track');
  ok(/🎬/.test(await page.textContent('#tl .trk[data-k="0"] .tn')) && !/🎬/.test(await page.textContent('#tl .trk[data-k="1"] .tn')), 'the 🎬 mark is on track 1 only');
  // switch to track 2 from its ⋯ menu, then a render lands on track 2
  await page.click('#tl .trk[data-k="1"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  await page.click('#sheetCard [data-act="actOn"]'); await page.waitForTimeout(150);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('h3deck')); d.takes.push(Object.assign({}, d.takes[0], {id:'tN', name:'h3_tN', prompt:'new', toFilm:{film:'f1', name:'Film 1', key:'kN'}})); d.tsav = Date.now(); localStorage.setItem('h3deck', JSON.stringify(d)); });
  await page.evaluate(() => FILM.tick()); await page.waitForTimeout(300);
  f = await page.evaluate(() => FILM.S.films[0]);
  const nc = f.tracks[1].clips.find(c => c.take==='tN');
  ok(nc && Math.abs(nc.at - 14) < 0.01 && !f.tracks[0].clips.some(c => c.take==='tN'), 'a new render goes on the end of the 🎬 track 2 (' + (nc && nc.at) + ')');
  await page.evaluate(() => { const f = FILM.S.films[0]; f.tracks[1].clips = f.tracks[1].clips.filter(c => c.take!=='tN'); FILM.draw(); });

  // ⇔ Select the whole track 2 and slide it 2.75 s right: c start (2 → 4.75) snaps onto b's start at 5 s, d moves with it
  await page.click('#tl .trk[data-k="1"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  await page.click('#sheetCard [data-act="grpOn"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.getTSEL())==='tr2' && await page.$$eval('#tl .trk[data-k="1"] .clip.sel', c => c.length)===2 && /All of track 2 is selected/.test(await page.textContent('#selNote')), '⇔ selects every clip on track 2');
  const c = await pt('c'); await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 30, c.y, {steps:4}); await page.mouse.move(c.x + 66, c.y, {steps:4});
  ok(await page.evaluate(() => { const l = document.querySelector('.snapline'); return !!l && !l.hidden; }), 'a snap line shows while the track snaps');
  await page.mouse.up(); await page.waitForTimeout(300);
  f = await page.evaluate(() => FILM.S.films[0]);
  const at = f.tracks[1].clips.map(x => +x.at.toFixed(3));
  ok(at[0]===5 && at[1]===15, 'the whole track slid together and snapped to track 1\'s clip edge (' + at + ')');
  ok(f.tracks[0].clips.map(x => x.at).join()==='0,5', 'track 1 stayed put');
  // no snap when nothing is near: slide left 1 s from 5 → 4 (edges at 4, 7, 14, 16 are > 10 px from 0, 5, 10)
  const c2 = await pt('c'); await page.mouse.move(c2.x, c2.y); await page.mouse.down(); await page.mouse.move(c2.x - 12, c2.y, {steps:3}); await page.mouse.move(c2.x - 24, c2.y, {steps:3}); await page.mouse.up(); await page.waitForTimeout(300);
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(f.tracks[1].clips.map(x => +x.at.toFixed(2)).join()==='4,14', 'it slides freely when no edge is near (' + f.tracks[1].clips.map(x => x.at.toFixed(2)) + ')');
  // it can't slide before 0
  const c3 = await pt('c'); await page.mouse.move(c3.x, c3.y); await page.mouse.down(); await page.mouse.move(c3.x - 100, c3.y, {steps:3}); await page.mouse.move(c3.x - 200, c3.y, {steps:3}); await page.mouse.up(); await page.waitForTimeout(300);
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(f.tracks[1].clips.map(x => +x.at.toFixed(2)).join()==='0,10', 'the track stops at 0 s and keeps its spacing (' + f.tracks[1].clips.map(x => x.at.toFixed(2)) + ')');
  await page.evaluate(() => FILM.undo()); await page.waitForTimeout(200);
  ok((await page.evaluate(() => FILM.S.films[0].tracks[1].clips.map(x => +x.at.toFixed(2)))).join()==='4,14', '↶ Undo takes back a whole-track slide');
  // pressing a clip on another track ends the whole-track selection and selects that clip
  await page.evaluate(() => { FILM.setTSEL('tr2'); FILM.PH = 2; FILM.draw(); }); await page.waitForTimeout(150);
  const a = await pt('a'); await page.mouse.click(a.x, a.y); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.getTSEL())===null && await page.evaluate(() => FILM.SEL)==='a' && await page.$$eval('#tl .trk[data-k="1"] .clip.sel', c => c.length)===0, 'tapping a clip on another track ends ⇔ and selects that clip');
  // ＋ Track adds a track and makes it the 🎬 track
  await page.click('.tools [data-act="addTrack"]'); await page.waitForTimeout(200);
  ok(await page.$$eval('#tl .trk', r => r.length)===3 && await page.evaluate(() => FILM.actK(FILM.S.films[0]))===2, '＋ Track adds an empty track 3 and new clips go on it');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
