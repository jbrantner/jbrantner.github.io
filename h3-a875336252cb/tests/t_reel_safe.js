// 🛟 Reel's PC copies are never written over by a phone that hasn't read them yet (2026-11-23 overnight): a PC out of reach when Reel
// opens (Tailscale waking up) later gets its copy read and merged in first, for the engine's takes (h3reel_takes.json) and Reel's reels
// (h3reel_reels.json). Also: the newer copy of a reel wins (mt), and a reel deleted elsewhere goes.
// Run: NODE_PATH=$(npm root -g) node h3-a875336252cb/tests/t_reel_safe.js   (from the repo root)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const now = Date.now(), tid = k => 't' + (now - k * 60000).toString(36) + 'ab' + k + 'z';
const PCTAKE = {id:tid(1), t:now - 60000, state:'done', prompt:'from the PC', pc:R, pieces:[], imgs:[], vids:[], auds:[], follow:[], final:{filename:'a.mp4', subfolder:'Output_Render/H3Deck', type:'output'}};
const PHTAKE = {id:tid(2), t:now - 120000, state:'done', prompt:'from the phone', pc:R, pieces:[], imgs:[], vids:[], auds:[], follow:[], final:{filename:'b.mp4', subfolder:'Output_Render/H3Deck', type:'output'}};
const clip = id => ({id:'c' + id, takes:[id], pick:id, in:0, out:null, words:'w', who:[], meta:{}, tw:{}});
const PCREELS = {v:1, t:now, open:'rB', gone:['rGone'], reels:[{id:'rA', name:'Old name', clips:[clip(PHTAKE.id)], cur:0, t:1, mt:500}, {id:'rB', name:'Only on the PC', clips:[clip(PCTAKE.id)], cur:0, t:2, mt:900}]};
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : /\.png$/.test(f) ? 'image/png' : 'application/octet-stream'}); r.end(b); }); }).listen(8057);
  const br = await chromium.launch(), ctx = await br.newContext(); let online = false; const posts = [];
  await ctx.route(R + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, m = rt.request().method(), J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(!online) return rt.abort();
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')) return J({});
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/history') return J({});
    if(p.startsWith('/userdata/')){ if(m==='POST'){ posts.push({p, body:rt.request().postData()}); return J({}); }
      if(p==='/userdata/h3reel_takes.json') return J({v:1, t:now, takes:[PCTAKE]});
      if(p==='/userdata/h3reel_reels.json') return J(PCREELS); }
    if(p==='/view') return rt.fulfill({status:200, contentType:'video/mp4', headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  const page = await ctx.newPage(); page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.addInitScript(([r, ph, mine]) => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; if(sessionStorage.getItem('done')) return; sessionStorage.setItem('done', 1); localStorage.clear();
    localStorage.setItem('h3deck', JSON.stringify({pcs:[{name:'Render', url:r, on:true, speed:1}], lib:[], media:{}, tsav:Date.now()}));
    localStorage.setItem('h3reel_engine', JSON.stringify({pcs:[{name:'Render', url:r, on:true, speed:1}], takes:[ph], media:{}, tsav:Date.now()}));
    localStorage.setItem('h3reel', JSON.stringify(mine)); }, [R, PHTAKE, {open:'rA', n:2, reels:[{id:'rA', name:'New name', clips:[clip(PHTAKE.id), clip(PHTAKE.id + 'x')], cur:0, t:1, mt:800}, {id:'rGone', name:'Deleted on the other phone', clips:[clip(PHTAKE.id)], cur:0, t:3}]}]);
  await page.goto('http://127.0.0.1:8057/reel-5b1e7c94d2a0/');
  await page.waitForFunction(() => window.REEL && REEL.E() && document.querySelector('#vmsg') && !/Starting/.test(document.querySelector('#vmsg').textContent + (REEL.E().ready() ? '' : 'Starting')), null, {timeout:60000}).catch(() => {});
  await page.waitForTimeout(6000);
  // make a change on the phone while the PC can't be reached
  await page.evaluate(() => { REEL.R().name = 'New name'; REEL.R().cur = 1; REEL.refresh(); });
  await page.waitForTimeout(5000);
  ok(!posts.length, 'nothing is written to the PC while it can\'t be reached (' + posts.length + ')');
  online = true; await page.evaluate(() => REEL.E().refresh()); await page.waitForTimeout(500);
  await page.evaluate(() => { REEL.R().cur = 0; REEL.refresh(); }); // (a save, so the reels push runs)
  await page.waitForFunction(() => REEL.S().reels.some(r => r.id==='rB'), null, {timeout:30000}).catch(() => {});
  await page.waitForTimeout(9000);
  const st = await page.evaluate(() => ({ids:REEL.S().reels.map(r => r.id), name:(REEL.S().reels.find(r => r.id==='rA') || {}).name, nA:((REEL.S().reels.find(r => r.id==='rA') || {}).clips || []).length}));
  ok(st.ids.includes('rB') && !st.ids.includes('rGone'), 'the PC\'s copy is merged in once the PC is reached: its reel comes in, the one deleted elsewhere goes (' + JSON.stringify(st) + ')');
  ok(st.name==='New name' && st.nA===2, 'the phone\'s newer reel keeps its changes over the PC\'s older copy (' + JSON.stringify(st) + ')');
  const rp = posts.filter(x => /h3reel_reels/.test(x.p)).pop(), tp = posts.filter(x => /h3reel_takes/.test(x.p)).pop();
  ok(rp && rp.body.includes('"rB"') && rp.body.includes('New name'), 'the reels written to the PC hold both the PC\'s and the phone\'s reels');
  ok(tp && tp.body.includes(PCTAKE.id) && tp.body.includes(PHTAKE.id), 'the takes written to the PC hold the PC\'s take as well as the phone\'s (' + (tp ? 'sent' : 'not sent') + ')');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
