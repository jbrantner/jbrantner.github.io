// 🛟 films and Library: a copy on the PCs, brought back when the phone starts empty; films rebuilt from the renders when there's no copy.
// Run: NODE_PATH=$(npm root -g) node tests/t_rescue.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const file = n => ({filename:n + '.mp4', subfolder:'Output_Render/H3Deck/' + n, type:'output'});
const take = (id, t, o) => Object.assign({id, t, pc:R, w:832, h:480, seconds:5, prompt:id, dir:'H3Deck/' + id, film:'fA', state:'done', final:file(id), pieces:[{prompt:id, state:'done', deliv:120, file:file(id)}]}, o);
const TAKES = [take('tA', 1, {toFilm:{film:'fA', name:'Beach', key:'k1', track:'x', at:0}}), take('tB', 3, {carry:{film:'fA', key:'k2', clip:'c?', src:'tA', at:5}}),
  take('tC', 2, {toFilm:{film:'fA', name:'Beach', key:'k3', clip:'c?'}, redo:{src:'tA', film:'fA', key:'k4'}}), take('tD', 4, {film:'fB'})];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8033);
  const br = await chromium.launch();
  const run = async (backup, seed) => { const page = await br.newPage({viewport:{width:390, height:844}}), posts = [];
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await page.route(R + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, m = rt.request().method(), H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
      if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
      if(p==='/userdata/h3deck_takes.json' && m==='GET') return J({v:1, t:5, takes:TAKES});
      if(p==='/userdata/h3deck_films.json' && m==='GET') return backup ? J(backup) : rt.fulfill({status:404, headers:H, body:''});
      if(p.startsWith('/userdata/') && m==='POST'){ posts.push({p, body:rt.request().postData()}); return J({}); }
      if(p==='/view' && u.searchParams.get('type')==='input') return u.searchParams.get('filename')==='h3deck_m1.png' ? rt.fulfill({status:200, contentType:'image/png', headers:H, body:PNG}) : rt.fulfill({status:404, headers:H, body:''});
      return rt.fulfill({status:404, headers:H, body:''}); });
    await page.addInitScript(([r, seed]) => { if(sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear(); indexedDB.deleteDatabase('h3deck');
      window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; if(seed){ localStorage.setItem('h3deck', JSON.stringify(seed.deck)); localStorage.setItem('h3edit', JSON.stringify(seed.edit)); } }, [R, seed]);
    await page.addInitScript(r => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, R);
    await page.goto('http://127.0.0.1:8033/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000}); await page.waitForTimeout(5000);
    const fr = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
    return {page, posts, fr, films:fr ? await fr.evaluate(() => FILM.S.films) : null}; };
  // 1) an empty phone, no copy on the PCs: the films are rebuilt from the renders
  { const {page, posts, films} = await run(null);
    const A = (films || []).find(f => f.id==='fA'), B = (films || []).find(f => f.id==='fB'), cl = A ? A.tracks[0].clips : [];
    ok(films && films.length===2 && A && A.name==='Beach (rebuilt)' && B, '🛟 two films rebuilt from the renders, named from the takes: ' + JSON.stringify((films || []).map(f => f.name)));
    ok(cl.length===2 && cl[0].take==='tA' && JSON.stringify(cl[0].alts)==='["tA","tC"]' && cl[1].take==='tB' && cl[1].at===5, 'the redo is an option of its clip, the carry-on follows it: ' + JSON.stringify(cl.map(c => [c.take, c.at, c.alts])));
    const fp = posts.filter(x => /h3deck_films/.test(x.p)); ok(fp.length >= 1 && JSON.parse(fp[fp.length - 1].body).films.length===2, 'the rebuilt films get their copy on the PC');
    await page.reload(); await page.waitForTimeout(4000); const fr2 = page.frames().find(f => /film\/\?embed=1/.test(f.url()));
    ok((await fr2.evaluate(() => FILM.S.films.length))===2, 'rebuilt once: opening again doesn\'t add them twice'); await page.close(); }
  // 2) an empty phone with a copy on the PC: films, Library and its picture come back
  { const backup = {v:1, t:9, films:[{id:'fA', name:'My Beach Film', tracks:[{id:'tr1', clips:[{id:'c1', take:'tA', in:0, out:5, dur:5, at:0}]}], pps:24}],
      lib:[{id:'L1', kind:'char', name:'Kat', stand:'a woman', desc:'', pics:['m1'], keep:'exact'}], media:{m1:{id:'m1', kind:'img', name:'kat.png', w:1, h:1, thumb:''}}, up:{}, forms:{}, casts:{}};
    const {page, films} = await run(backup);
    ok(films && films.length===1 && films[0].name==='My Beach Film' && films[0].tracks[0].clips.length===1, '🛟 the film comes back as it was: ' + JSON.stringify((films || []).map(f => f.name)));
    const L = await page.evaluate(async () => ({lib:H3.S.lib.map(x => x.name), m:!!H3.S.media.m1, blob:await new Promise(ok => { const r = indexedDB.open('h3deck', 1); r.onsuccess = () => { const g = r.result.transaction('media').objectStore('media').get('m1'); g.onsuccess = () => ok(!!(g.result && g.result.size)); g.onerror = () => ok(false); }; r.onerror = () => ok(false); })}));
    ok(L.lib.join()==='Kat' && L.m && L.blob, 'the Library entry and its picture (fetched back from the PC) are back: ' + JSON.stringify(L)); await page.close(); }
  // 3) a phone with its films: nothing is replaced, and the copy goes to the PC
  { const seed = {deck:{pcs:[{name:'Render', url:R, on:true}], lib:[{id:'L9', kind:'char', name:'Zoe', pics:[]}], takes:TAKES}, edit:{films:[{id:'fZ', name:'Mine', tracks:[{id:'t1', clips:[]}], pps:24}], nav:{v:'home'}}};
    const {page, posts, films} = await run({v:1, t:9, films:[{id:'fA', name:'Old copy', tracks:[], pps:24}], lib:[]}, seed);
    ok(films && films.length===1 && films[0].name==='Mine' && await page.evaluate(() => H3.S.lib.map(x => x.name).join()==='Zoe'), 'films and Library already on the phone are left as they are');
    const fp = posts.filter(x => /h3deck_films/.test(x.p)), last = fp.length && JSON.parse(fp[fp.length - 1].body);
    ok(last && last.films[0].name==='Mine' && last.lib[0].name==='Zoe', '…and their copy goes to the PC'); await page.close(); }
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
