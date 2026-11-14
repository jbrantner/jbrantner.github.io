// 🎞 Films are folders of shots (Jordan 2026-11-13): an old film becomes one shot of a film with the same id and name; the film's
// screen lists its shots in order (⬆⬇, ＋ New shot, ▶ Play the film, ⬇ Export joins them); a shot is today's timeline, with
// ‹ › to the next shot; every shot of a film shares its cast ("make sure each shot has access to all characters in a film").
// Run: NODE_PATH=$(npm root -g) node tests/t_shots.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8043);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  const exp = [];
  await page.route(R + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
    if(p==='/renderdeck/h3export' && rt.request().method()==='GET') return J({state:'working', done:0, total:1});
    if(p==='/renderdeck/h3export'){ const pd = rt.request().postData(); if(pd) exp.push(JSON.parse(pd)); return J({id:'x1', ov:1, cv:1}); } if(p==='/renderdeck/h3export/status') return J({state:'working', done:0, total:1});
    return rt.fulfill({status:404, headers:H, body:''}); });
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const tk = (id, film) => ({id, t:1, pc:R, w:640, h:360, seconds:5, prompt:id, dir:'H3Deck/' + id, film, state:'done', final:F(id + '.mp4'), pieces:[{prompt:id, state:'done', deliv:120, file:F(id + '.mp4')}]});
  const deck = {pcs:[{name:'Render', url:R, on:true}], takes:[tk('tA', 'fA'), tk('tB', 'fB')], tab:'films', fkey:'fA', cast:[{n:1, name:'Laura', desc:'a woman'}], casts:{fB:[{n:1, name:'Kat', desc:'a cat'}]}};
  const edit = {films:[{id:'fA', name:'Beach', pps:24, tracks:[{id:'a1', clips:[{id:'c1', take:'tA', in:0, out:5, dur:5, at:0}]}, {id:'a2', clips:[]}]},
    {id:'fB', name:'Forest', pps:24, tracks:[{id:'b1', clips:[{id:'c2', take:'tB', in:1, out:4, dur:5, at:0}]}]}], nav:{v:'film', film:'fA'}, lastFilm:'fA'};
  await page.addInitScript(([r, d, e]) => { if(!sessionStorage.getItem('i')){ sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); localStorage.setItem('h3edit', JSON.stringify(e)); }
    window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, [R, deck, edit]);
  await page.goto('http://127.0.0.1:8043/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
  let fr = null; for(let i = 0; i < 60 && !fr; i++){ fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()) && f.url()); if(fr && !(await fr.evaluate(() => !!window.FILM).catch(() => false))) fr = null; if(!fr) await page.waitForTimeout(250); }
  await page.waitForTimeout(800);
  const FS = () => fr.evaluate(() => ({movies:FILM.S.movies.map(m => [m.id, m.name, m.shots.join('+')].join(':')).join(','), nav:FILM.S.nav}));
  ok((await FS()).movies==='fB:Forest:fB,fA:Beach:fA' || (await FS()).movies==='fA:Beach:fA,fB:Forest:fB', 'old films became films of one shot each, same ids and names: ' + (await FS()).movies);
  ok(await fr.evaluate(() => FILM.S.films.every(f => f.movie===f.id)), 'each old film is a shot of its own film');
  ok(/Beach/.test(await fr.$eval('.crumb', e => e.textContent)) && /Shot 1/.test(await fr.$eval('.crumb', e => e.textContent)), 'the shot screen says Films › Beach › Shot 1: ' + await fr.$eval('.crumb', e => e.textContent));
  ok(await page.evaluate(() => H3.S.cast.map(c => c.name).join())==='Laura', 'Beach\'s cast is Laura');
  // the film screen
  await fr.click('.crumb button:nth-of-type(2)'); await page.waitForTimeout(300);
  ok((await FS()).nav.v==='movie' && await fr.$$eval('.shot', e => e.length)===1, 'tapping the film name shows its shots (1)');
  await fr.click('[data-act="mvNewShot"]'); await page.waitForTimeout(600);
  const s2 = await fr.evaluate(() => FILM.S.nav.film);
  const cr = (await fr.$eval('.crumb', e => e.textContent)).replace(/\s+/g, ''); ok(/Beach›Shot2/.test(cr), 'crumb: Films › Beach › Shot 2: ' + cr);
  ok(/Shot 2 of 2/.test(await fr.$eval('.shotnav', e => e.textContent)), 'shot nav: Shot 2 of 2');
  ok(await page.evaluate(() => H3.S.cast.map(c => c.name).join())==='Laura', 'the new shot has the film\'s characters (Laura)');
  await page.evaluate(() => { H3.S.cast.push({n:2, name:'Mia', desc:'a girl'}); H3.save(); });
  await fr.click('[data-act="shotGo"][data-d="-1"]'); await page.waitForTimeout(600);
  ok((await FS()).nav.film==='fA', '‹ goes back to Shot 1');
  ok(await page.evaluate(() => H3.S.cast.map(c => c.name).join())==='Laura,Mia', 'a character added in Shot 2 is in Shot 1 too');
  ok(await page.evaluate(() => H3.S.forms[H3.S.fkey]===undefined && H3.S.fkey==='fA'), 'the form follows the shot');
  // another film has its own cast
  await fr.evaluate(() => FILM.go({v:'film', film:'fB'})); await page.waitForTimeout(600);
  ok(await page.evaluate(() => H3.S.cast.map(c => c.name).join())==='Kat', 'Forest keeps its own cast (Kat)');
  await fr.evaluate(id => FILM.go({v:'film', film:id}), s2); await page.waitForTimeout(600);
  ok(await page.evaluate(() => H3.S.cast.map(c => c.name).join())==='Laura,Mia', 'back in Beach\'s Shot 2: Laura and Mia');
  // reorder, film timeline, export
  await fr.evaluate(() => { const f = FILM.S.films.find(x => x.id===FILM.S.nav.film); f.tracks[0].clips.push({id:'c9', take:'tB', in:0, out:2, dur:5, at:0}); FILM.save(); FILM.go({v:'movie', movie:'fA'}); }); await page.waitForTimeout(400);
  ok(await fr.$$eval('.shot', e => e.length)===2, 'the film shows 2 shots');
  let V = await fr.evaluate(() => FILM.mvFilm(FILM.movieOf('fA')).tracks[0].clips.map(c => [c.take, c.at].join('@')).join(','));
  ok(V==='tA@0,tB@5', 'the film timeline is the shots end to end: ' + V);
  await fr.click('.shot:nth-of-type(2) [data-act="mvMove"][data-d="-1"]'); await page.waitForTimeout(300);
  V = await fr.evaluate(() => FILM.mvFilm(FILM.movieOf('fA')).tracks[0].clips.map(c => [c.take, c.at].join('@')).join(','));
  ok(V==='tB@0,tA@2', '⬆ moves Shot 2 first: ' + V);
  ok(await fr.evaluate(() => FILM.mvSegs(FILM.mvFilm(FILM.movieOf('fA'))).length)===2, '▶ Play the film plays both shots in a row');
  await fr.click('[data-act="mvExport"]'); await page.waitForTimeout(600);
  ok(exp.length===1 && exp[0].name==='Beach' && exp[0].clips.map(c => c.filename + '@' + c.at).join()==='tB.mp4@0,tA.mp4@2', '⬇ Export sends the whole film in shot order: ' + JSON.stringify(exp.map(x => x.clips.map(c => c.filename + '@' + c.at))));
  ok(await fr.evaluate(() => FILM.movieOf('fA').exp && FILM.movieOf('fA').exp.id==='x1'), 'the export is kept on the film');
  ok(await fr.$eval('#exp', e => /Exporting/.test(e.textContent)), 'the film screen shows the export');
  // home lists films, not shots
  await fr.evaluate(() => FILM.go({v:'home'})); await page.waitForTimeout(300);
  ok(await fr.$$eval('#view .item', e => e.map(x => x.textContent).join('|')).then(t => /Beach.*2 shots/.test(t) && /Forest.*1 shot/.test(t)), 'Films lists films with their shot counts');
  // a shot deleted, then the film
  await fr.evaluate(id => FILM.go({v:'film', film:id}), s2); await page.waitForTimeout(400);
  await fr.click('[data-act="delFilm"]'); await page.waitForTimeout(400);
  ok(await fr.evaluate(() => FILM.S.nav.v==='movie' && FILM.movieOf('fA').shots.join()==='fA'), '🗑 on a shot takes it out of the film and shows the film');
  await fr.click('[data-act="mvDel"]'); await page.waitForTimeout(400);
  ok(await fr.evaluate(() => !FILM.movieOf('fA') && !FILM.S.films.some(f => f.id==='fA') && FILM.S.nav.v==='home'), '🗑 on the film deletes it and its shots');
  // new film opens its first shot
  await page.evaluate(() => { window.prompt = () => 'Party'; }); await fr.evaluate(() => { window.prompt = () => 'Party'; });
  await fr.click('[data-act="newFilm"]'); await page.waitForTimeout(500);
  ok(await fr.evaluate(() => { const m = FILM.S.movies.find(x => x.name==='Party'); return m && m.shots.length===1 && FILM.S.nav.film===m.shots[0] && FILM.S.films.find(f => f.id===m.shots[0]).tracks.length===1; }), '＋ New film makes Party with Shot 1 (one track) and opens it');
  ok(await fr.evaluate(() => { const m = FILM.S.movies.find(x => x.name==='Party'); return FILM.S.films.find(f => f.id===m.shots[0]).canvas==='wide'; }), 'a new film is ▭ wide');
  await page.waitForTimeout(600); ok(await page.evaluate(() => H3.S.f.aspect)==='16:9', 'and its Render form starts wide (16:9): ' + await page.evaluate(() => H3.S.f.aspect));
  // the PC copy has the films
  ok(await page.evaluate(() => { const b = JSON.parse(H3.backupBody ? H3.backupBody() : '{}'); return (b.movies || []).some(m => m.name==='Party'); }), 'the copy on the PCs keeps the films');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
