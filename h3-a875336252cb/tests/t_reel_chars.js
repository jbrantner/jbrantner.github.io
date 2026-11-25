// 👥 Reel's own characters are kept on the PCs (h3reel_chars.json) like H3 Deck's Library (Jordan 2026-11-25: one vanished).
// A character only on the PC comes back with her picture; one made on the phone is written to the PC (merged, never over it);
// a deleted one stays deleted.
// Run: NODE_PATH=$(npm root -g) node h3-a875336252cb/tests/t_reel_chars.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const PNG = fs.readFileSync(path.join(__dirname, '..', '..', 'icon-192.png'));
const PCCHARS = {v:1, gone:[], lib:[{id:'Lgoth0001', kind:'char', name:'Goth woman', stand:'', desc:'Blue hair, black lipstick.', pics:['mgothpic01'], keep:'exact', what:'', reel:true, mt:1000},
  {id:'Lold00001', kind:'char', name:'Deleted on the phone', desc:'', pics:[], reel:true, mt:1}], media:{mgothpic01:{id:'mgothpic01', kind:'img', name:'goth.png', type:'image/png'}}, up:{['mgothpic01|' + R]:'h3deck/h3deck_mgothpic01.png'}};
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8058);
  const br = await chromium.launch(), ctx = await br.newContext(); const posts = [], views = [];
  await ctx.route(R + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, m = rt.request().method(), J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')) return J({});
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/history') return J({});
    if(p==='/upload/image') return J({name:'h3deck_x.png', subfolder:'h3deck', type:'input'});
    if(p.startsWith('/userdata/')){ if(m==='POST'){ posts.push({p, body:rt.request().postData()}); return J({}); }
      if(p==='/userdata/h3reel_chars.json') return J(PCCHARS); }
    if(p==='/view'){ views.push(u.search); return rt.fulfill({status:200, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body:PNG}); }
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  const page = await ctx.newPage(); page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.addInitScript(([r]) => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; if(sessionStorage.getItem('done')) return; sessionStorage.setItem('done', 1); localStorage.clear();
    localStorage.setItem('h3deck', JSON.stringify({pcs:[{name:'Render', url:r, on:true, speed:1}], lib:[], media:{}, tsav:Date.now()}));
    localStorage.setItem('h3reel_engine', JSON.stringify({pcs:[{name:'Render', url:r, on:true, speed:1}], takes:[], media:{}, tsav:Date.now(), goneChars:['Lold00001']})); }, [R]);
  await page.goto('http://127.0.0.1:8058/reel-5b1e7c94d2a0/');
  await page.waitForFunction(() => window.REEL && REEL.E() && REEL.E().lib().some(L => L.id==='Lgoth0001'), null, {timeout:60000}).catch(() => {});
  const lib = await page.evaluate(() => REEL.E().lib());
  const g = lib.find(L => L.id==='Lgoth0001');
  ok(g && g.name==='Goth woman' && g.desc==='Blue hair, black lipstick.' && g.reel, 'a Reel character only on the PC comes back (' + JSON.stringify(lib.map(L => L.name)) + ')');
  ok(!lib.some(L => L.id==='Lold00001'), 'one deleted on the phone stays deleted');
  await page.waitForFunction(() => { const L = REEL.E().lib().find(x => x.id==='Lgoth0001'); return L && L.thumb; }, null, {timeout:15000}).catch(() => {});
  ok(views.some(v => /h3deck_mgothpic01/.test(v)) && await page.evaluate(() => !!(REEL.E().lib().find(x => x.id==='Lgoth0001') || {}).thumb), 'her picture is fetched back from the PC (thumb made)');
  // a new character made on the phone goes to the PC, next to the one already there
  const id = await page.evaluate(async () => { const b = await (await fetch('/icon-192.png')).blob(); const f = new File([b], 'new.png', {type:'image/png'}); return (await REEL.E().saveChar({name:'Alicr', desc:'Blonde hair', files:[f]})).id; });
  await page.waitForFunction(id => true, id); await page.waitForTimeout(9000);
  const last = posts.filter(x => /h3reel_chars/.test(x.p)).pop(); const j = last ? JSON.parse(last.body) : {lib:[]};
  ok(j.lib.some(L => L.name==='Alicr' && L.pics.length===1) && j.lib.some(L => L.id==='Lgoth0001') && (j.gone || []).includes('Lold00001'), 'the PC copy holds the new character, the PC\'s one and the deleted list (' + JSON.stringify(j.lib.map(L => L.name)) + ')');
  ok(j.lib.some(L => L.name==='Alicr' && Object.keys(j.up).some(k => k.startsWith(L.pics[0] + '|'))), 'the new character\'s picture went to the PC\'s input folder');
  await page.evaluate(id => REEL.E().delChar(id), id); await page.waitForTimeout(6000);
  const j2 = JSON.parse(posts.filter(x => /h3reel_chars/.test(x.p)).pop().body);
  ok(!j2.lib.some(L => L.id===id) && j2.gone.includes(id), 'a character deleted in Reel is gone from the PC copy and marked deleted');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
