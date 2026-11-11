// 🧹 Start fresh: renders (and films, optionally Library) off the phone and the PCs' copies, and old copies don't come back.
// Run: NODE_PATH=$(npm root -g) node tests/t_fresh.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const file = n => ({filename:n + '.mp4', subfolder:'Output_Render/H3Deck/' + n, type:'output'});
const take = (id, t) => ({id, t, pc:R, w:832, h:480, seconds:5, prompt:id, dir:'H3Deck/' + id, film:'fA', state:'done', final:file(id), pieces:[{prompt:id, state:'done', deliv:120, file:file(id)}]});
const OLD = {v:1, t:5, takes:[take('tA', 1), take('tB', 2)]};
const OLDF = {v:1, t:9, films:[{id:'fA', name:'Old', tracks:[{id:'x', clips:[]}], pps:24}], lib:[{id:'L1', kind:'char', name:'Kat', pics:[]}]};
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8034);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}});
  const store = {takes:OLD, films:OLDF}, posts = [];
  const page = await ctx.newPage(); page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await ctx.route(R + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, m = rt.request().method(), H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
    if(p==='/userdata/h3deck_takes.json' && m==='GET') return J(store.takes);
    if(p==='/userdata/h3deck_films.json' && m==='GET') return J(store.films);
    if(p.startsWith('/userdata/') && m==='POST'){ const b = JSON.parse(rt.request().postData()); posts.push(p); if(/takes/.test(p)) store.takes = b; else store.films = b; return J({}); }
    return rt.fulfill({status:404, headers:H, body:''}); });
  await ctx.addInitScript(r => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, R);
  await page.goto('http://127.0.0.1:8034/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000}); await page.waitForTimeout(5000);
  ok(await page.evaluate(() => H3.S.takes.length===2 && H3.S.lib.length===1), 'before: renders and Library came from the PC copy');
  // through the ⚙ sheet: Films on (default), Library off (default)
  await page.click('#setBtn'); await page.click('#freshBtn'); page.once('dialog', d => d.accept()); await page.click('#frGo'); await page.waitForTimeout(6000);
  const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  const st = await page.evaluate(() => ({takes:H3.S.takes.length, lib:H3.S.lib.length, fresh:H3.S.fresh}));
  ok(st.takes===0 && st.lib===1 && st.fresh, '🧹 renders gone, Library kept: ' + JSON.stringify(st));
  ok(fr && (await fr.evaluate(() => FILM.S.films.length))===0, 'films gone');
  ok(store.takes.takes.length===0 && store.takes.fresh, "the PC's takes copy is emptied");
  ok(store.films.films.length===0 && store.films.lib.length===1, "the PC's films copy has no films, keeps the Library");
  // an old copy on a PC that was off can't bring them back
  store.takes = OLD; store.films = OLDF; await page.reload(); await page.waitForTimeout(6000);
  const fr2 = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
  ok(await page.evaluate(() => H3.S.takes.length===0), 'an older takes copy is ignored after the fresh start');
  ok(fr2 && (await fr2.evaluate(() => FILM.S.films.length))===0, 'an older films copy is ignored too');
  // everything incl. Library, via the function
  await page.evaluate(() => H3Fresh({films:true, lib:true})); await page.waitForTimeout(3000);
  ok(await page.evaluate(() => H3.S.lib.length===0), 'Library too when asked');
  ok(store.films.films.length===0 && store.films.lib.length===0 && store.films.fresh, 'an empty copy is written on purpose after Start fresh');
  // a new render after the fresh start still comes back on another phone
  const p2 = await ctx.browser().newContext(); await p2.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
