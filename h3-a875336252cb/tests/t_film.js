// 🎬 H3 Film (review + timeline), against a fake ComfyUI answered in the browser and H3 Deck takes put in its storage.
// Run: NODE_PATH=$(npm root -g) node tests/t_film.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8014);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const HIST = {}, Q = {running:[], pending:[]};
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/queue') return J({queue_running:Q.running.map(x => [0, x]), queue_pending:Q.pending.map(x => [0, x])});
    if(p.startsWith('/history/')){ const id = p.slice(9); return J(HIST[id] ? {[id]:HIST[id]} : {}); }
    if(p==='/view') return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  const F = (n, sub) => ({filename:n, subfolder:sub || 'Output_Render/H3Deck/x', type:'output'});
  const pieces = (n, st) => Array.from({length:n}, (_, i) => ({deliv:i ? 101 : 120, gen:124, ctx:i ? 22 : 0, state:st, pid:'pp' + i, file:st==='done' ? F('piece_0' + (i + 1) + '_00001_.mp4') : null}));
  const base = {model:'dasiwaminimaxh3_hybrid_v2', turbo:true, loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x'};
  const deck = {pcs:[{name:'Render', url:R, on:true}], takes:[
    Object.assign({}, base, {name:'h3_tA', id:'tA', pc:R, w:640, h:360, prompt:'A woman walks in', state:'done', pieces:pieces(1, 'done'), final:F('a.mp4')}),
    Object.assign({}, base, {name:'h3_tB', id:'tB', pc:R, w:640, h:360, prompt:'She sits down', state:'done', pieces:pieces(2, 'done'), final:F('b.mp4')}),
    Object.assign({}, base, {name:'h3_tB2', id:'tB2', pc:R, w:640, h:360, prompt:'She sits down', from:{id:'tB', at:1}, state:'done', pieces:pieces(2, 'done'), final:F('b2.mp4')}),
    Object.assign({}, base, {name:'h3_tW', id:'tW', pc:R, w:640, h:360, prompt:'Still rendering', state:'working', pieces:[{deliv:120, state:'queued', pid:'w1'}, {deliv:101, state:'queued', pid:'w2'}]})]};
  await page.addInitScript(d => { if(!sessionStorage.getItem('init')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); sessionStorage.setItem('init', '1'); } }, deck);
  await page.goto('http://127.0.0.1:8014/film/index.html'); await page.waitForTimeout(600);
  ok(/No films yet/.test(await page.textContent('#view')) && await page.textContent('#roomBadge')==='4', 'home: no films; ✂ Review counts the 4 takes');
  await page.click('#roomBtn'); await page.waitForTimeout(300);
  ok(await page.$$eval('.rv', r => r.length)===4 && /rendering/i.test(await page.textContent('#view')), 'review shows 3 finished takes and the one still rendering');
  ok(/🎲 piece 2 again, after piece 1/.test(await page.textContent('[data-take="tB2"]')), 'a 🎲 take says what it was made from');
  // the rendering one finishes while H3 Deck is closed: its last piece's job has the joined file
  Q.running = []; HIST.w2 = {status:{completed:true}, outputs:{'9':{images:[F('piece_02_00001_.mp4')]}, '10':{images:[F('h3_w_00001_.mp4')]}}};
  await page.evaluate(() => FILM.tick()); await page.waitForTimeout(400);
  ok(await page.evaluate(() => FILM.fileOf(FILM.takeOf('tW')).filename)==='h3_w_00001_.mp4', 'a take that finished while H3 Deck was closed is picked up from the PC (joined file)');
  await page.click('[data-take="tA"] [data-act="toFilm"]'); await page.waitForTimeout(200);
  await page.click('[data-take="tB"] [data-act="toFilm"]'); await page.waitForTimeout(200);
  await page.click('[data-take="tB2"] [data-act="skip"]'); await page.waitForTimeout(200);
  ok(await page.$$eval('.rv', r => r.length)===1, 'added and skipped takes leave the review');
  const f = await page.evaluate(() => FILM.S.films[0]); const cl = f.tracks[0].clips;
  ok(f.tracks.length===2 && cl.length===2 && cl[0].at===0 && Math.abs(cl[1].at - 5) < 0.01 && Math.abs(cl[1].out - 221 / 24) < 0.01, '＋ Add to a film makes a film and puts the clips one after another on track 1 (' + JSON.stringify(cl.map(c => [c.at, c.out])) + ')');
  await page.evaluate(id => FILM.go({v:'film', film:id}), f.id); await page.waitForTimeout(300);
  ok(await page.$$eval('.clip', c => c.length)===2, 'the timeline shows the 2 clips');
  // drag clip 2 down onto track 2 and left by 2 s (24 px a second)
  const b = await page.$eval('.clip[data-c="' + cl[1].id + '"]', e => { const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
  await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x - 24, b.y + 30, {steps:5}); await page.mouse.move(b.x - 48, b.y + 58, {steps:5}); await page.mouse.up(); await page.waitForTimeout(300);
  const f2 = await page.evaluate(() => FILM.S.films[0]);
  ok(f2.tracks[0].clips.length===1 && f2.tracks[1].clips.length===1 && Math.abs(f2.tracks[1].clips[0].at - 3) < 0.05, 'dragging moves a clip in time and down to track 2 (' + f2.tracks[1].clips[0].at.toFixed(2) + ' s)');
  const act = await page.evaluate(() => { const f = FILM.S.films[0]; return [1, 4, 7].map(t => { const c = FILM.activeAt(f, t); return c && c.take; }); });
  ok(act[0]==='tA' && act[1]==='tA' && act[2]==='tB', 'the upper track plays where clips overlap (' + act + ')');
  // trim the end of clip 1 by dragging its right handle 1 s left
  const h = await page.$eval('.clip[data-c="' + cl[0].id + '"] .h.r', e => { const r = e.getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x - 12, h.y, {steps:3}); await page.mouse.move(h.x - 24, h.y, {steps:3}); await page.mouse.up(); await page.waitForTimeout(300);
  const o1 = await page.evaluate(() => FILM.S.films[0].tracks[0].clips[0].out);
  ok(Math.abs(o1 - 4) < 0.1, 'dragging the right end trims the clip (' + o1.toFixed(2) + ' s)');
  // split clip 2 at 6 s
  await page.evaluate(id => { FILM.SEL = id; FILM.PH = 6; }, cl[1].id); await page.evaluate(() => FILM.draw());
  await page.click('[data-act="split"]'); await page.waitForTimeout(200);
  const sp = await page.evaluate(() => FILM.S.films[0].tracks[1].clips.map(c => [c.at, c.in, c.out].map(x => +x.toFixed(2))));
  ok(sp.length===2 && sp[0][2]===3 && sp[1][0]===6 && sp[1][1]===3, '✂ Split cuts the clip at the playhead (' + JSON.stringify(sp) + ')');
  // versions: swap for the 🎲 take
  await page.click('[data-act="versions"]'); await page.waitForTimeout(200);
  ok(await page.$$eval('[data-pick]', p => p.length)===2, '⇄ Versions lists the take and its 🎲 take');
  await page.click('[data-pick="tB2"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.clipOf(FILM.S.films[0], FILM.SEL).c.take)==='tB2', 'picking a version swaps the clip');
  await page.screenshot({path:path.join(__dirname, 'film_timeline.png'), fullPage:true});
  // ✏️ Edit in H3 Deck opens that take there
  await page.click('[data-act="editDeck"]'); await page.waitForURL(/#take=tB2/); await page.waitForTimeout(800);
  ok(/#take=tB2$/.test(page.url()) && await page.$$eval('.take.hl', e => e.length)===1, '✏️ Edit in H3 Deck opens H3 Deck on that take');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
