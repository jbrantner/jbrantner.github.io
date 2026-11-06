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
  const REMOTE = {}, EXP = {}, HIST = {}, Q = {running:[], pending:[]};
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/queue') return J({queue_running:Q.running.map(x => [0, x]), queue_pending:Q.pending.map(x => [0, x])});
    if(p.startsWith('/history/')){ const id = p.slice(9); return J(HIST[id] ? {[id]:HIST[id]} : {}); }
    if(p==='/renderdeck/h3export' && rt.request().method()==='POST'){ EXP.body = JSON.parse(rt.request().postData()); EXP.n = 0; return J({id:'x1', state:'working', done:0, total:0}); }
    if(p==='/renderdeck/h3export'){ EXP.n++; return J(EXP.n < 2 ? {id:'x1', state:'working', done:50, total:200} : {id:'x1', state:'done', done:200, total:200, file:{filename:'Film 1_00001_.mp4', subfolder:'Render/H3Film', type:'output'}}); }
    if(p==='/userdata/h3deck_takes.json') return REMOTE.j ? J(REMOTE.j) : rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
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
  ok(await page.evaluate(() => FILM.reviewList().length)===1, 'added and skipped takes leave the review');
  const f = await page.evaluate(() => FILM.S.films[0]); const cl = f.tracks[0].clips;
  ok(f.tracks.length===2 && cl.length===2 && cl[0].at===0 && Math.abs(cl[1].at - 5) < 0.01 && Math.abs(cl[1].out - 221 / 24) < 0.01, '＋ Add to a film makes a film and puts the clips one after another on track 1 (' + JSON.stringify(cl.map(c => [c.at, c.out])) + ')');
  await page.evaluate(id => FILM.go({v:'film', film:id}), f.id); await page.waitForTimeout(300);
  ok(await page.$$eval('.clip', c => c.length)===2, 'the timeline shows the 2 clips');
  // drag clip 2 down onto track 2 and left by 2 s (24 px a second); first slide the timeline so it's under the needle (the needle stays put)
  await page.evaluate(() => { FILM.PH = 5; FILM.draw(); }); await page.waitForTimeout(200);
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
  // ↶ Undo takes the split back; doing it again brings it back the normal way
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.S.films[0].tracks[1].clips.length)===1, '↶ Undo takes back the split');
  await page.evaluate(id => { FILM.SEL = id; FILM.PH = 6; FILM.draw(); }, cl[1].id); await page.click('[data-act="split"]'); await page.waitForTimeout(200);
  // scrubbing near a clip's edge snaps onto it
  const sn = await page.evaluate(() => { const f = FILM.S.films[0], c = f.tracks[1].clips[0], e = c.at + (c.out - c.in), w = document.querySelector('#tlw'); w.scrollLeft = Math.round((e - 4 / f.pps) * f.pps); return new Promise(r => setTimeout(() => r({ph:FILM.PH, e}), 400)); });
  ok(Math.abs(sn.ph - sn.e) < 1e-6, 'scrubbing a few pixels from a clip\'s edge snaps onto the edge (' + JSON.stringify(sn) + ')');
  // dragging a clip: its END snaps to another clip's start too (Jordan 2026-11-06), with a line where
  const ds = await page.evaluate(() => { const sel0 = FILM.SEL, f = FILM.S.films[0], x = f.tracks[0].clips[0], y = f.tracks[1].clips[f.tracks[1].clips.length - 1]; x.at = 1; y.at = 9; FILM.PH = 0; FILM.SEL = x.id; FILM.draw(); return {id:x.id, L:x.out - x.in, pps:f.pps, y:y.at, sel0}; });
  const cx = await page.$eval('.clip[data-c="' + ds.id + '"] .nm', e => { const r = e.getBoundingClientRect(); return {x:r.x + 4, y:r.y + r.height / 2}; });
  const want = (ds.y - ds.L - 1) * ds.pps - 6; let line = false;
  await page.mouse.move(cx.x, cx.y); await page.mouse.down(); await page.mouse.move(cx.x + want / 2, cx.y, {steps:4}); await page.mouse.move(cx.x + want, cx.y, {steps:4});
  line = await page.evaluate(() => { const l = document.querySelector('.snapline'); return !!(l && !l.hidden); }); await page.mouse.up(); await page.waitForTimeout(300);
  const da = await page.evaluate(id => { const f = FILM.S.films[0], c = f.tracks.flatMap(t => t.clips).find(c => c.id===id); return c.at + c.out - c.in; }, ds.id);
  ok(Math.abs(da - ds.y) < 1e-6 && line, 'a dragged clip\'s end snaps onto the next clip\'s start, with a line there (' + da.toFixed(3) + ' vs ' + ds.y + ')');
  await page.click('#undoBtn'); await page.waitForTimeout(200); await page.evaluate(id => { FILM.SEL = id; FILM.draw(); }, ds.sel0);
  // versions: swap for the 🎲 take
  await page.evaluate(() => FILM.draw()); await page.waitForTimeout(200);
  ok(await page.$$eval('#vstrip [data-act="useTake"]', p => p.length)===2, 'the selected clip shows its takes under it (the take and its 🎲 take)');
  await page.click('#vstrip [data-t="tB2"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.clipOf(FILM.S.films[0], FILM.SEL).c.take)==='tB2', 'picking a version swaps the clip');
  // ⤓ One track: what plays now becomes the clips of one track; ↶ Undo brings the tracks back
  const fl0 = await page.evaluate(() => { const f = FILM.S.films[0]; return {n:f.tracks.length, secs:FILM.filmSecs(f), at:[0.5, 2, 4, 7, 9].map(t => { const c = FILM.activeAt(f, t); return c && [c.take, +(c.in + t - c.at).toFixed(2)]; })}; });
  await page.evaluate(() => { window.confirm = () => true; }); await page.click('[data-act="flatten"]'); await page.waitForTimeout(200);
  const fl1 = await page.evaluate(() => { const f = FILM.S.films[0]; return {n:f.tracks.length, secs:FILM.filmSecs(f), at:[0.5, 2, 4, 7, 9].map(t => { const c = FILM.activeAt(f, t); return c && [c.take, +(c.in + t - c.at).toFixed(2)]; })}; });
  ok(fl1.n===1 && fl1.secs===fl0.secs && JSON.stringify(fl1.at)===JSON.stringify(fl0.at), '⤓ One track merges the tracks and the film plays exactly the same (' + JSON.stringify([fl0, fl1]) + ')');
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => FILM.S.films[0].tracks.length)===fl0.n, '↶ Undo brings the tracks back');
  // ⬇ Export sends the edit list (files, trims, track numbers) to the PC and shows its progress, then a link
  await page.click('[data-act="export"]'); await page.waitForTimeout(400);
  const eb = EXP.body || {clips:[]};
  ok(eb.clips.length===3 && eb.clips.every(c => c.filename && c.out > c.in) && eb.clips.filter(c => c.track===1).length===2 && /%/.test(await page.textContent('#exp')), '⬇ Export sends 3 clips with tracks and shows progress (' + JSON.stringify(eb.clips.map(c => [c.filename, c.track, +c.at.toFixed(2)])) + ')');
  await page.waitForTimeout(3500);
  ok(/Open the mp4/.test(await page.textContent('#exp')) && await page.evaluate(() => FILM.S.films[0].exp.state)==='done', 'when the PC finishes, the film shows a link to the mp4');
  await page.screenshot({path:path.join(__dirname, 'film_timeline.png'), fullPage:true});
  // ⚡ Preview: the PC writes the film as one small video; ▶ Play plays it in real time until the edit changes
  await page.click('[data-act="preview"]'); await page.waitForTimeout(400);
  ok(EXP.body && EXP.body.preview===true && /Making a smooth preview/.test(await page.textContent('#prevBox')), '⚡ Preview asks the PC for a small temporary video of the film and shows its progress');
  await page.waitForTimeout(3000);
  ok(await page.evaluate(() => FILM.prevOk(FILM.S.films[0])) && /Smooth preview on/.test(await page.textContent('#prevBox')), 'when it is ready the film says ▶ Play uses it');
  await page.evaluate(() => { FILM.PH = 0; }); await page.click('[data-act="play"]'); await page.waitForTimeout(500);
  const pvp = await page.evaluate(() => { const v = document.querySelector('.stage video.on'); return {src:v && v.src, ph:FILM.PH}; });
  await page.click('[data-act="play"]');
  ok(/Film\+1_00001_\.mp4/.test(pvp.src || ''), '▶ Play plays the preview video (' + JSON.stringify(pvp) + ')');
  await page.evaluate(() => { const f = FILM.S.films[0]; f.tracks[1].clips[0].out -= 0.5; FILM.draw(); });
  ok(await page.evaluate(() => !FILM.prevOk(FILM.S.films[0])) && /out of date/.test(await page.textContent('#prevBox')), 'any edit turns the preview off (it says it is out of date)');
  // takes come from the PC's copy when this app can't see H3 Deck's storage (iPhone home-screen apps don't share it)
  REMOTE.j = {v:1, t:Date.now() + 60000, takes:[{id:'tR', pc:R, w:640, h:352, prompt:'from the PC copy', state:'done', pieces:[{deliv:120, file:{filename:'r.mp4', subfolder:'Render/H3Deck/r'}}]}]};
  const rr = await page.evaluate(async () => { await FILM.pullDeck(); return {has:!!FILM.takeOf('tR'), n:FILM.takes().length, rev:FILM.reviewList().map(t => t.id)}; });
  ok(rr.has && rr.rev.includes('tR'), "the newest takes list is read from the PC's copy (" + JSON.stringify(rr) + ')');
  REMOTE.j = null; await page.evaluate(() => { localStorage.setItem('h3deck', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('h3deck')), {tsav:Date.now() + 120000}))); });
  ok(await page.evaluate(() => !FILM.takeOf('tR') && !!FILM.takeOf('tB2')), "a newer copy on this phone wins over the PC's");
  await page.evaluate(() => { FILM.S.rev.tB2 = 'keep'; FILM.go({v:'review'}); }); await page.waitForTimeout(200);
  ok(/✓ Kept/.test(await page.textContent('#view')) && !!(await page.$('.rv[data-take="tB2"] [data-act="next"]')), 'kept takes are listed under ✓ Kept with ➕ Next part options');
  await page.evaluate(() => FILM.go({v:'film', film:FILM.S.films[0].id})); await page.evaluate(id => { FILM.SEL = id; FILM.draw(); }, await page.evaluate(() => FILM.S.films[0].tracks[1].clips[1].id)); await page.waitForTimeout(200);
  // ✏️ Edit in H3 Deck opens that take there
  await page.click('[data-act="editDeck"]'); await page.waitForURL(/#take=tB2/); await page.waitForTimeout(800);
  ok(/#take=tB2$/.test(page.url()) && await page.$$eval('.take.hl', e => e.length)===1, '✏️ Edit in H3 Deck opens H3 Deck on that take');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
