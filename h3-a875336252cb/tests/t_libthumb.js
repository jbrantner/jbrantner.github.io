// 📚 Library pictures (Jordan 2026-11-15: "names load but no images?"): a full save drops the small previews of everything outside
// the form; the Library's come back from the kept picture (only for the session, not written into the save), and a picture the
// phone no longer has is fetched back from the PC's input/h3deck folder. Run: NODE_PATH=$(npm root -g) node tests/t_libthumb.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8052);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}}); const gets = [];
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
    if(p==='/view' && u.searchParams.get('type')==='input'){ gets.push(u.searchParams.get('filename')); return /^h3deck_m[12]\.png$/.test(u.searchParams.get('filename')) ? rt.fulfill({status:200, contentType:'image/png', headers:H, body:PNG}) : rt.fulfill({status:404, headers:H, body:''}); }
    return rt.fulfill({status:404, headers:H, body:''}); });
  const deck = {pcs:[{name:'Render', url:R, on:true}], tab:'lib', takes:[], forms:{}, casts:{}, up:{},
    lib:[{id:'L1', kind:'char', name:'Kat', stand:'a woman', desc:'', pics:['m1'], keep:'exact'}, {id:'L2', kind:'char', name:'Zoe', stand:'a woman', desc:'', pics:['m2'], keep:'exact'}],
    media:{m1:{id:'m1', kind:'img', name:'kat.png', w:1, h:1, thumb:'', tc:1}, m2:{id:'m2', kind:'img', name:'zoe.png', w:1, h:1, thumb:'', tc:1}}};
  await page.addInitScript(([r, d, png]) => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; if(sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear();
    localStorage.setItem('h3deck', JSON.stringify(d)); localStorage.setItem('h3edit', JSON.stringify({films:[{id:'fA', name:'A', tracks:[{id:'t1', clips:[]}], pps:24}], nav:{v:'home'}}));
    // m1 is still kept on the phone, m2 isn't (the phone dropped it)
    const b = Uint8Array.from(atob(png), c => c.charCodeAt(0)); const q = indexedDB.open('h3deck', 1); q.onupgradeneeded = () => q.result.createObjectStore('media');
    q.onsuccess = () => { q.result.transaction('media', 'readwrite').objectStore('media').put(new Blob([b], {type:'image/png'}), 'm1'); q.result.close(); }; }, [R, deck, PNG.toString('base64')]);
  await page.goto('http://127.0.0.1:8052/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
  await page.evaluate(() => { const b = document.querySelector('[data-tab="lib"]'); if(b) b.click(); });
  await page.waitForTimeout(6000); await page.evaluate(() => H3.drawLib()); await page.waitForTimeout(1500);
  const imgs = await page.evaluate(() => [...document.querySelectorAll('#libTab .libTile img')].map(i => ({src:i.getAttribute('src'), ok:i.complete && i.naturalWidth > 0})));
  console.log(JSON.stringify(imgs), gets);
  ok(imgs.length===2 && imgs.every(i => /^blob:/.test(i.src) && i.ok), 'both Library tiles show their picture again (' + imgs.length + ')');
  ok(gets.includes('h3deck_m2.png') && !gets.includes('h3deck_m1.png'), 'only the picture the phone lost was fetched back from the PC');
  const saved = await page.evaluate(() => { H3.S.tsav = 0; try{ window.dispatchEvent(new Event('pagehide')); }catch(e){} return JSON.parse(localStorage.getItem('h3deck')).media; });
  ok(!/blob:/.test(JSON.stringify(saved)), 'the session-only previews are never written into the save');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
