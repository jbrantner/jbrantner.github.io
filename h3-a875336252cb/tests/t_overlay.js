// ⧉ Picture-in-picture tracks (Jordan 2026-11-13: "videos can overlay other videos… scale and rotate and move an entire track").
// A track with xf sits over the tracks below it: preview/scrub layers it with CSS, ⬇ Export / ⚡ preview send xf to the helper.
// Run: NODE_PATH=$(npm root -g) node tests/t_overlay.js   (ffmpeg makes two small test clips; SHOT=1 saves a screenshot)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const R = 'http://render.test';
const FILM_AR = (a, b) => Math.abs(a - b) < 0.03;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ovl-'));
  try{ cp.execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=24:duration=6 -c:v libvpx -b:v 1M "${tmp}/h.webm"`);
    cp.execSync(`ffmpeg -loglevel error -y -f lavfi -i "color=c=red:size=360x640:rate=24:duration=6,drawbox=x=0:y=0:w=360:h=80:color=yellow:t=fill" -c:v libvpx -b:v 1M "${tmp}/v.webm"`); }
  catch(e){ console.log('no ffmpeg: the clips stay empty (' + String(e.message).slice(0, 200) + ')'); }
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8032);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}, hasTouch:true});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const posts = [];
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url());
    if(u.pathname==='/view'){ const p = path.join(tmp, u.searchParams.get('filename')); if(fs.existsSync(p)){ const all = fs.readFileSync(p), m = /bytes=(\d+)-(\d*)/.exec(rt.request().headers()['range'] || '');
      const h = {'Access-Control-Allow-Origin':'*', 'Content-Type':'video/webm', 'Accept-Ranges':'bytes'}; if(!m) return rt.fulfill({status:200, headers:h, body:all}); // ranges, so the players can seek
      const a = +m[1], e = m[2] ? Math.min(+m[2], all.length - 1) : all.length - 1; return rt.fulfill({status:206, headers:Object.assign(h, {'Content-Range':`bytes ${a}-${e}/${all.length}`}), body:all.slice(a, e + 1)}); } }
    if(u.pathname==='/renderdeck/h3export' && rt.request().method()==='POST'){ const b = JSON.parse(rt.request().postData()); posts.push(b); return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Content-Type':'application/json'}, body:JSON.stringify({id:'x' + posts.length, state:'working', ov:posts.length > 1 ? 1 : undefined})}); }
    if(u.pathname==='/system_stats') return rt.fulfill({status:200, headers:{'Access-Control-Allow-Origin':'*', 'Content-Type':'application/json'}, body:'{}'});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const base = {model:'m', turbo:true, loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:6, seed:1, dir:'H3Deck/x', pc:R, state:'done', pieces:[{deliv:144, gen:148, ctx:0, state:'done', pid:'p', file:F('p.mp4')}]};
  const deck = {bare:false, pcs:[{name:'Render', url:R, on:true}], takes:[Object.assign({}, base, {id:'tH', name:'h3_tH', prompt:'wide', w:640, h:360, final:F('h.webm')}), Object.assign({}, base, {id:'tV', name:'h3_tV', prompt:'tall', w:360, h:640, final:F('v.webm')})]};
  await page.addInitScript(d => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); sessionStorage.setItem('init', '1'); } }, deck);
  await page.goto('http://127.0.0.1:8032/film/index.html'); await page.waitForTimeout(500);
  await page.evaluate(() => { FILM.S.autoPrev = false; FILM.S.guideOn = false;
    FILM.S.films = [{id:'f1', name:'Film 1', pps:24, tracks:[{id:'trV', clips:[{id:'v', take:'tV', in:0, out:4, dur:6, at:1}]}, {id:'trH', clips:[{id:'h', take:'tH', in:0, out:6, dur:6, at:0}]}]}];
    FILM.PH = 2; FILM.go({v:'film', film:'f1'}); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => FILM.S.films[0].canvas)==='wide', '🖼 a film without a canvas starts ▭ wide, even when its first clip is tall (Jordan 2026-11-13)');
  await page.click('[data-act="canvas"][data-v="wide"]'); await page.waitForTimeout(300);
  // before: the top track covers the one below (no overlay)
  let L = await page.evaluate(() => { const l = FILM.layersAt(FILM.S.films[0], 2); return {base:l.base && l.base.id, ov:l.ov.map(o => o.c.id)}; });
  ok(L.base==='v' && !L.ov.length, 'without ⧉ the upper track covers the track below (' + JSON.stringify(L) + ')');
  // track 1 ⋯ → ⧉ Picture in picture
  await page.click('#tl .trk[data-k="0"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  ok(/Picture in picture/.test(await page.textContent('#sheetCard')), 'the track menu offers ⧉ Picture in picture');
  await page.click('#sheetCard [data-act="xfOn"]'); await page.waitForTimeout(300);
  let f = await page.evaluate(() => FILM.S.films[0]);
  ok(f.tracks[0].xf && f.tracks[0].xf.s===0.5 && f.tracks[0].xf.x===0.25, 'track 1 becomes a picture in picture (half size, right of middle)');
  ok(await page.$('#xfBox .xfbox') && await page.$eval('.stage', s => s.classList.contains('xfed')), 'the size / turn / place panel shows under the picture');
  ok(/⧉/.test(await page.textContent('#tl .trk[data-k="0"] .tn')), 'the track label shows ⧉');
  L = await page.evaluate(() => { const l = FILM.layersAt(FILM.S.films[0], 2); return {base:l.base && l.base.id, ov:l.ov.map(o => o.c.id)}; });
  ok(L.base==='h' && L.ov.join()==='v', 'with ⧉ the wide clip below plays and the tall one sits over it (' + JSON.stringify(L) + ')');
  ok(await page.evaluate(() => FILM.layersAt(FILM.S.films[0], 0.5).ov.length===0), 'before the overlay clip starts only the wide clip shows');
  // the overlay box: a 9:16 clip fitted in a 16:9 frame = 31.6% wide, full height; centred at 75%
  await page.waitForTimeout(800);
  let bx = await page.$eval('.stage .ovl', e => ({l:parseFloat(e.style.left), w:parseFloat(e.style.width), h:parseFloat(e.style.height), tf:e.style.transform}));
  ok(Math.abs(bx.w - 31.64) < 0.2 && Math.abs(bx.h - 100) < 0.1 && Math.abs(bx.l + bx.w / 2 - 75) < 0.2 && /scale\(0\.5\)/.test(bx.tf), 'the tall clip is fitted, sized and placed (' + JSON.stringify(bx) + ')');
  const on = await page.$eval('.stage .ovl', e => e.classList.contains('on'));
  ok(on || !fs.existsSync(path.join(tmp, 'v.webm')), 'the overlay video shows while scrubbing');
  // sliders
  await page.$eval('#xfBox [data-xf="r"]', i => { i.value = 30; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); });
  await page.$eval('#xfBox [data-xf="s"]', i => { i.value = 40; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); });
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(f.tracks[0].xf.r===30 && Math.abs(f.tracks[0].xf.s - 0.4) < 1e-9, 'Size and Turn sliders set it');
  ok(/rotate\(30deg\) scale\(0\.4\)/.test(await page.$eval('.stage .ovl', e => e.style.transform)), 'the picture turns and shrinks live');
  // drag on the picture moves it
  const sb = await page.$eval('.stage', e => { const r = e.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; });
  await page.mouse.move(sb.x + sb.w * 0.75, sb.y + sb.h * 0.5); await page.mouse.down(); await page.mouse.move(sb.x + sb.w * 0.6, sb.y + sb.h * 0.4, {steps:5}); await page.mouse.up(); await page.waitForTimeout(200);
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(Math.abs(f.tracks[0].xf.x - 0.1) < 0.02 && Math.abs(f.tracks[0].xf.y + 0.1) < 0.02, 'dragging moves it (' + f.tracks[0].xf.x.toFixed(3) + ', ' + f.tracks[0].xf.y.toFixed(3) + ')');
  ok(+(await page.$eval('#xfBox [data-xf="x"]', i => i.value))===10, 'the sliders follow a drag');
  // two-finger pinch + turn (pointer events, as on the phone)
  await page.evaluate(() => { const st = document.querySelector('.stage'), r = st.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const ev = (t, id, x, y) => st.dispatchEvent(new PointerEvent(t, {pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true, pointerType:'touch'}));
    ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy); ev('pointermove', 2, cx + 40, cy + 80); ev('pointerup', 2, cx + 40, cy + 80); ev('pointerup', 1, cx - 40, cy); });
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(Math.abs(f.tracks[0].xf.s - 0.4 * Math.hypot(80, 80) / 80) < 0.01 && Math.abs(f.tracks[0].xf.r - 75) < 0.5, 'pinching sizes and turns it (s ' + f.tracks[0].xf.s.toFixed(3) + ', r ' + f.tracks[0].xf.r.toFixed(1) + ')');
  // corner and quarter turn
  await page.evaluate(() => { const t = FILM.S.films[0].tracks[0]; t.xf.r = 0; t.xf.s = 0.5; }); await page.click('#xfBox [data-act="xfPut"][data-v="tr"]'); await page.waitForTimeout(100);
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(Math.abs(f.tracks[0].xf.x - (0.5 - 0.3164 * 0.5 / 2 - 0.03)) < 0.01 && Math.abs(f.tracks[0].xf.y + (0.5 - 0.5 / 2 - 0.03 * 16 / 9)) < 0.01, '↗ puts it in the top-right corner (' + f.tracks[0].xf.x.toFixed(3) + ', ' + f.tracks[0].xf.y.toFixed(3) + ')');
  await page.click('#xfBox [data-act="xfTurn"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => FILM.S.films[0].tracks[0].xf.r)===90, '↻ 90° turns it a quarter');
  if(process.env.SHOT){ await page.evaluate(() => { const t = FILM.S.films[0].tracks[0]; t.xf.r = 8; t.xf.s = 0.55; t.xf.x = 0.28; t.xf.y = 0; FILM.draw(); }); await page.waitForTimeout(900); await page.screenshot({path:process.env.SHOT}); }
  await page.click('#xfBox [data-act="xfDone"]'); await page.waitForTimeout(200);
  if(fs.existsSync(path.join(tmp, 'v.webm'))){ await page.evaluate(() => { FILM.PH = 1.5; FILM.draw(); }); await page.waitForTimeout(600);
    await page.click('[data-act="play"]'); await page.waitForTimeout(1500);
    const pl = await page.evaluate(() => { const v = document.querySelector('.stage .ovl video'); return {on:v.parentNode.classList.contains('on'), paused:v.paused, t:v.currentTime, ph:FILM.PH}; });
    await page.click('[data-act="play"]');
    ok(pl.on && !pl.paused && Math.abs(pl.t - (pl.ph - 1)) < 0.5, '▶ Play plays the overlay in step with the film (' + JSON.stringify(pl) + ')'); }
  ok(!(await page.$('#xfBox .xfbox')) && !(await page.$eval('.stage', s => s.classList.contains('xfed'))), '✓ Done closes the panel; the track stays a picture in picture');
  // export / preview send it to the PC
  const ec = await page.evaluate(() => FILM.expClips(FILM.S.films[0]).out);
  ok(ec.find(c => c.filename==='v.webm').xf && !ec.find(c => c.filename==='h.webm').xf, '⬇ Export sends the ⧉ track\'s size / turn / place, not the full-frame one\'s');
  const s1 = await page.evaluate(() => FILM.sigOf(FILM.S.films[0]));
  await page.evaluate(() => { FILM.S.films[0].tracks[0].xf.x = 0; }); const s2 = await page.evaluate(() => FILM.sigOf(FILM.S.films[0]));
  ok(s1!==s2, 'moving the picture makes the ⚡ preview out of date');
  // an old helper (answers without ov) can't draw overlays: its preview is not used
  await page.evaluate(() => { const f = FILM.S.films[0]; f.prev = {id:'p1', pc:'http://render.test', state:'done', sig:FILM.sigOf(f), file:{filename:'p.mp4', subfolder:'H3Film/_preview'}}; });
  ok(!(await page.evaluate(() => FILM.prevOk(FILM.S.films[0]))), "an old helper's preview (no overlays in it) isn't played");
  await page.evaluate(() => { FILM.S.films[0].prev.ov = 1; FILM.S.films[0].prev.cv = 1; });
  ok(await page.evaluate(() => FILM.prevOk(FILM.S.films[0])), "a new helper's preview (ov) is played");
  // ⬜ Full frame again
  await page.click('#tl .trk[data-k="0"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  await page.click('#sheetCard [data-act="xfOff"]'); await page.waitForTimeout(200);
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(!f.tracks[0].xf && !(await page.$('.stage .ovl')), '⬜ Full frame again puts the track back to covering the one below');
  await page.evaluate(() => FILM.undo()); await page.waitForTimeout(200);
  ok(!!(await page.evaluate(() => FILM.S.films[0].tracks[0].xf)), '↶ Undo brings the picture in picture back');
  // 🖼 the canvas stays the shape picked (Jordan 2026-11-13), whatever clip shows; clips fit inside (contain, never stretched)
  await page.evaluate(() => { const f = FILM.S.films[0]; delete f.tracks[0].xf; FILM.PH = 2; FILM.draw(); }); await page.waitForTimeout(300);
  const ar = async () => page.$eval('.stage', e => +(e.clientWidth / e.clientHeight).toFixed(2));
  const a1 = await ar(); await page.evaluate(() => { FILM.PH = 0.5; FILM.showFrame(FILM.S.films[0]); }); await page.waitForTimeout(200); const a2 = await ar();
  await page.evaluate(() => { FILM.PH = 2; FILM.showFrame(FILM.S.films[0]); }); await page.waitForTimeout(200); const a3 = await ar();
  ok(FILM_AR(a1, 16 / 9) && FILM_AR(a2, 16 / 9) && FILM_AR(a3, 16 / 9), '▭ Wide: the picture stays 16:9 over the wide and the tall clip (' + [a1, a2, a3] + ')');
  ok(await page.$eval('#vA', v => getComputedStyle(v).objectFit)==='contain', 'clips are fitted inside, not stretched');
  await page.click('[data-act="canvas"][data-v="square"]'); await page.waitForTimeout(300);
  ok(FILM_AR(await ar(), 1), '◻ Square makes it 1:1');
  ok(await page.evaluate(() => FILM.needsFit(FILM.S.films[0])), 'clips of another shape need fitting');
  await page.evaluate(() => { const f = FILM.S.films[0]; f.prev = {id:'p2', pc:'http://render.test', state:'done', ov:1, sig:FILM.sigOf(f), file:{filename:'p.mp4', subfolder:'H3Film/_preview'}}; });
  ok(!(await page.evaluate(() => FILM.prevOk(FILM.S.films[0]))), "an older helper's preview (stretched clips) isn't played");
  await page.evaluate(() => { FILM.S.films[0].prev.cv = 1; });
  ok(await page.evaluate(() => FILM.prevOk(FILM.S.films[0])), "a new helper's preview (cv) is played");
  // ✂ crop a track (Jordan 2026-11-13: "I also want the ability to crop a video")
  await page.evaluate(() => { FILM.PH = 0.5; FILM.draw(); }); await page.waitForTimeout(300);
  await page.click('#tl .trk[data-k="1"] [data-act="trackMenu"]'); await page.waitForTimeout(150);
  await page.click('#sheetCard [data-act="cropOn"]'); await page.waitForTimeout(300);
  ok(!!(await page.$('#cropBox .xfbox')), 'track ⋯ › ✂ Crop opens the crop panel');
  for(const [n, v] of [['l', 33], ['r', 33]]) await page.$eval(`#cropBox [data-cr="${n}"]`, (i, v) => { i.value = v; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); }, v);
  f = await page.evaluate(() => FILM.S.films[0]);
  ok(Math.abs(f.tracks[1].crop.l - 0.33) < 1e-9 && Math.abs(f.tracks[1].crop.r - 0.33) < 1e-9, 'the sliders set the crop');
  const cq = await page.evaluate(() => { const v = [...document.querySelectorAll('#vA,#vB')].find(v => v.dataset.c==='h'); return v ? {cp:v.style.clipPath, w:parseFloat(v.style.width)} : null; });
  ok(cq && /inset\(0%? 33%/.test(cq.cp) && cq.w > 100, 'the wide clip shows cropped, its middle fitted to the canvas (' + JSON.stringify(cq) + ')');
  ok((await page.evaluate(() => FILM.expClips(FILM.S.films[0]).out.find(c => c.filename==='h.webm').crop.l))===0.33, '⬇ Export sends the crop');
  ok(/✂/.test(await page.textContent('#tl .trk[data-k="1"] .tn')), 'the track label shows ✂');
  if(process.env.SHOT2){ await page.waitForTimeout(800); await page.screenshot({path:process.env.SHOT2}); }
  await page.click('#cropBox [data-act="cropOff"]'); await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => FILM.S.films[0].tracks[1].crop)) && await page.evaluate(() => !document.querySelector('#vA').style.clipPath && !document.querySelector('#vB').style.clipPath), '↺ No crop takes it off');
  await page.click('#cropBox [data-act="cropDone"]'); await page.waitForTimeout(200);
  ok(!(await page.$('#cropBox .xfbox')), '✓ Done closes the crop panel');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); fs.rmSync(tmp, {recursive:true, force:true}); process.exit(fails ? 1 : 0);
})();
