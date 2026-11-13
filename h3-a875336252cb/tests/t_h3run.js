// 🌙 keeps running with the phone away: the phone keeps a copy of everything on Render while work runs and says when it goes into the
// background (then does nothing); the hidden H3 Deck (?worker=1) starts from that copy, carries the work on and saves its own copy;
// when the phone is back it waits for the hidden copy to stop and takes its copy over. Run: NODE_PATH=$(npm root -g) node tests/t_h3run.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', W = 'http://127.0.0.1:8034';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const file = n => ({filename:n + '.mp4', subfolder:'Output_Render/H3Deck/' + n, type:'output'});
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8034);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}});
  // the helper on Render (its 🌙 part) and the run file, shared by the phone (render.test) and the hidden copy (its own address)
  const H = {run:null, beats:[], byes:[], worker:false, go:true, posts:0};
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, m = rt.request().method(), HD = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:HD, body:JSON.stringify(o)});
    if(p==='/renderdeck/h3run/beat'){ const b = JSON.parse(rt.request().postData() || '{}'); H.beats.push(Object.assign({host:u.origin}, b)); return J(b.who==='worker' ? {go:H.go} : {ok:true, worker:H.worker}); }
    if(p==='/renderdeck/h3run/bye'){ H.byes.push(JSON.parse(rt.request().postData() || '{}')); H.worker = false; return J({ok:true}); }
    if(p==='/renderdeck/h3run') return J({h3run:1, worker:H.worker});
    if(p==='/userdata/h3deck_run.json'){ if(m==='POST'){ H.run = JSON.parse(rt.request().postData()); H.posts++; return J({}); } return H.run ? J(H.run) : rt.fulfill({status:404, headers:HD, body:''}); }
    if(u.origin===W && !p.startsWith('/userdata/')) return rt.continue();
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
    if(p.startsWith('/userdata/')) return m==='GET' ? rt.fulfill({status:404, headers:HD, body:''}) : J({});
    return rt.fulfill({status:404, headers:HD, body:''}); };
  await ctx.route(R + '/**', fake); await ctx.route(W + '/userdata/**', fake); await ctx.route(W + '/renderdeck/**', fake);
  await ctx.addInitScript(r => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, R);
  const phone = await ctx.newPage(); phone.on('pageerror', e => { console.log('PAGE ERROR (phone)', e.message); fails++; });
  await phone.goto(W + '/index.html'); await phone.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000}); await phone.waitForTimeout(1500);
  const P0 = await phone.evaluate(() => ({hold:H3.HOLD_(), work:H3.runWork()}));
  ok(!P0.hold && !P0.work, 'the phone starts (nothing came from Render) and isn\'t held: ' + JSON.stringify(P0));
  // a take still rendering on Render: the phone says so, and keeps a copy of everything there
  await phone.evaluate(r => { H3.S.takes.unshift({id:'tW', t:Date.now(), pc:r, w:832, h:480, seconds:5, prompt:'she waves', dir:'H3Deck/tW', name:'tW', state:'working', imgs:[], vids:[], auds:[], follow:[], pieces:[{prompt:'she waves', state:'queued', pid:'pW', tq:Date.now(), deliv:120}]}); H3.saveNow(); }, R);
  await phone.waitForTimeout(9000);
  const P1 = {run:H.run && {by:H.run.by, takes:H.run.deck.takes.map(t => t.id + ':' + t.state)}, want:H.beats.filter(b => b.who==='phone').some(b => b.want)};
  ok(P1.run && P1.run.by==='phone' && P1.run.takes.includes('tW:working'), 'with a take rendering, the phone keeps a copy of everything on Render: ' + JSON.stringify(P1));
  // the phone goes into the background: a last copy, "away" to the helper, and then it does nothing
  const nBeat = H.beats.length;
  await phone.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => true}); Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
  await phone.waitForTimeout(800);
  const P2 = await phone.evaluate(() => ({hold:H3.HOLD_()})); const away = H.beats.slice(nBeat).find(b => b.who==='phone' && b.away);
  ok(P2.hold && away && away.want && away.farm===R, 'in the background the phone says it is away with work left, then holds still: ' + JSON.stringify({P2, away}));
  // the helper opens the hidden copy: it starts from the phone's copy, on the Films tab, and checks in
  H.worker = true; const w = await ctx.newPage(); w.on('pageerror', e => { console.log('PAGE ERROR (hidden)', e.message); fails++; });
  await w.goto(W + '/index.html?worker=1&wid=w1'); await w.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000}); await w.waitForTimeout(3000);
  const W1 = await w.evaluate(() => ({takes:H3.S.takes.map(t => t.id + ':' + t.state), tab:H3.S.tab, hold:H3.HOLD_(), film:!!document.querySelector('#filmTab iframe')}));
  const wb = H.beats.filter(b => b.who==='worker');
  ok(W1.takes.includes('tW:working') && W1.tab==='films' && !W1.hold && W1.film && wb.length && wb[0].wid==='w1' && wb[0].want, 'the hidden copy starts from the phone\'s copy (Films open) and checks in with work left: ' + JSON.stringify({W1, wb:wb.slice(0, 1)}));
  // it carries the work on: the take finishes there, and its copy on Render says so
  await w.evaluate(() => { const t = H3.S.takes.find(x => x.id==='tW'); t.state = 'done'; t.pieces[0].state = 'done'; t.final = {filename:'tW.mp4', subfolder:'Output_Render/H3Deck/tW', type:'output'}; t.t1 = Date.now(); H3.saveNow(); });
  await w.waitForTimeout(7000);
  ok(H.run && H.run.by==='worker' && H.run.deck.takes.some(t => t.id==='tW' && t.state==='done'), 'the hidden copy saves its own copy on Render as it goes: ' + JSON.stringify(H.run && {by:H.run.by}));
  // the phone is back: the helper tells the hidden copy to stop; it saves a last copy and says bye; the phone takes that copy over
  H.go = false;
  await phone.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => false}); Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => 'visible'}); });
  const reload = phone.waitForNavigation({timeout:30000}).catch(() => null);
  await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await reload; await phone.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000}); await phone.waitForTimeout(2500);
  const back = H.beats.find(b => b.who==='phone' && b.back);
  const P3 = await phone.evaluate(() => ({t:(H3.S.takes.find(x => x.id==='tW') || {}).state, hold:H3.HOLD_(), toast:[...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | ')}));
  const W2 = await w.evaluate(() => ({hold:H3.HOLD_()}));
  ok(back && H.byes.length===1 && H.byes[0].wid==='w1' && W2.hold && P3.t==='done' && !P3.hold && /Picked up where Render left off/.test(P3.toast), 'phone back: the hidden copy stops and says bye, the phone takes its copy over (the take is done) and carries on: ' + JSON.stringify({P3, byes:H.byes}));
  // opened again later: the same copy isn't taken twice
  const n0 = H.posts; await phone.reload(); await phone.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000}); await phone.waitForTimeout(2500);
  ok(!(await phone.evaluate(() => H3.HOLD_())) && phone.url().indexOf('worker')<0, 'opened again: no second take-over, not held');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
