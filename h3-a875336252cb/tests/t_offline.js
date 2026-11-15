// 🔌 a PC that's off (Jordan 2026-11-15: "if one computer is offline (usually main) I'm still able to scrub and access video
// clips"): Main can't be reached; its clips (Output_Main/…, in the shared Dropbox output folder) come from Render instead: the
// scrub copy from Render's helper, links to the full clip point at Render, and a video that fails to load from Main moves to Render.
// Run: CLIP=a.mp4 NODE_PATH=$(npm root -g) node tests/t_offline.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
if(!process.env.CLIP){ console.log('set CLIP to a short video'); process.exit(2); }
const VID = fs.readFileSync(process.env.CLIP);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8051);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const hits = []; let mainUp = false;
  for(const base of [R, M]) await ctx.route(base + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*', 'Access-Control-Expose-Headers':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(base===M && !mainUp){ hits.push(M + ' ' + p); return rt.abort('connectionrefused'); }
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
    if(p==='/renderdeck/h3proxy'){ hits.push(base + ' proxy ' + u.searchParams.get('subfolder') + '/' + u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/mp4', headers:Object.assign({'X-H3-Proxy':'1'}, H), body:VID}); }
    if(p==='/view'){ hits.push(base + ' view ' + u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/mp4', headers:H, body:VID}); }
    return rt.fulfill({status:404, headers:H, body:''}); });
  const F = (pc, n) => ({filename:n, subfolder:'Output_' + pc + '/H3Deck/x', type:'output'});
  const tk = (id, pc, nm) => ({id, t:1, pc, w:640, h:360, seconds:5, prompt:id, dir:'H3Deck/' + id, film:'fA', state:'done', final:F(nm, id + '.mp4'), pieces:[{prompt:id, state:'done', deliv:120, file:F(nm, id + '.mp4')}]});
  const deck = {pcs:[{name:'Render', url:R, on:true}, {name:'Main', url:M, on:true}], takes:[tk('tA', R, 'Render'), tk('tC', M, 'Main'), tk('tD', M, 'Main')], tab:'films', fkey:'fA'};
  const edit = {films:[{id:'fA', name:'Beach', pps:24, tracks:[{id:'a1', clips:[{id:'c1', take:'tA', in:0, out:5, dur:5, at:0}, {id:'c3', take:'tC', in:0, out:5, dur:5, at:5}, {id:'c4', take:'tD', in:0, out:5, dur:5, at:10}]}]}], nav:{v:'film', film:'fA'}};
  await ctx.addInitScript(([r, m, d, e]) => { if(!sessionStorage.getItem('i')){ sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); localStorage.setItem('h3edit', JSON.stringify(e)); }
    window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, [R, M, deck, edit]);
  const open = async () => { await page.goto('http://127.0.0.1:8051/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
    let fr = null; for(let i = 0; i < 60 && !fr; i++){ fr = page.frames().find(f => /film\/\?embed=1/.test(f.url())); if(fr && !(await fr.evaluate(() => !!window.FILM).catch(() => false))) fr = null; if(!fr) await page.waitForTimeout(250); } return fr; };
  let fr = await open(); await page.waitForTimeout(4000);
  const st = () => fr.evaluate(() => ({down:FILM.downOf('http://main.test'), ready:Object.keys(FILM.PX.url).length, srcs:FILM.S.films[0].tracks[0].clips.map(c => { const t = FILM.takeOf(c.take); return FILM.playUrl(t.pc, FILM.fileOf(t)); })}));
  let S = await st(); console.log(JSON.stringify(S), hits);
  ok(S.down, 'Films knows Main is off');
  ok(S.ready===3 && S.srcs.every(s => /^blob:/.test(s)), 'every clip, Main\'s too, is on the phone and plays from memory (' + S.ready + ')');
  ok(hits.includes(R + ' proxy Output_Main/H3Deck/x/tC.mp4') && hits.includes(R + ' proxy Output_Main/H3Deck/x/tD.mp4'), 'Main\'s clips came as scrub copies from Render (its Dropbox copy)');
  // the full clip (Export, ⬇ Save, the take card) points at Render while Main is off
  const v = await fr.evaluate(() => FILM.viewUrl('http://main.test', {filename:'tC.mp4', subfolder:'Output_Main/H3Deck/x', type:'output'}));
  ok(v.startsWith(R + '/view?') && /Output_Main/.test(v), 'Films\' full-clip link for Main\'s clip goes to Render: ' + v);
  const iv = await page.evaluate(() => H3.viewUrl('http://main.test', {filename:'tC.mp4', subfolder:'Output_Main/H3Deck/x', type:'output'}));
  ok(iv.startsWith(R + '/view?'), 'the main app\'s link goes to Render too: ' + iv);
  const inp = await page.evaluate(() => H3.viewUrl('http://main.test', {filename:'a.png', subfolder:'', type:'input'}));
  ok(inp.startsWith(M + '/view?'), 'an input picture (not shared through Dropbox) still points at its own PC');
  // a video already pointing at Main moves to Render when it fails to load
  const hop = await page.evaluate(async () => { const v = document.createElement('video'); v.muted = true; v.setAttribute('src', 'http://main.test/view?filename=tD.mp4&subfolder=Output_Main%2FH3Deck%2Fx&type=output#t=0.05'); document.body.appendChild(v);
    for(let i = 0; i < 40 && !/render\.test/.test(v.getAttribute('src')); i++) await new Promise(r => setTimeout(r, 100)); const s = v.getAttribute('src'); v.remove(); return s; });
  ok(/^http:\/\/render\.test\/view\?filename=tD\.mp4/.test(hop) && /#t=0\.05$/.test(hop), 'a video that fails to load from Main tries Render: ' + hop);
  // Main comes back: its own links again
  mainUp = true; await page.evaluate(() => H3.S && Promise.resolve()); await page.waitForTimeout(100);
  await page.evaluate(async () => { for(let i = 0; i < 80 && H3.downOf('http://main.test'); i++) await new Promise(r => setTimeout(r, 250)); });
  const back = await page.evaluate(() => H3.viewUrl('http://main.test', {filename:'tC.mp4', subfolder:'Output_Main/H3Deck/x', type:'output'}));
  ok(back.startsWith(M + '/view?'), 'Main back on: its clips point at Main again: ' + back);
  // opened again with Main off: the copies are on the phone, nothing is fetched
  mainUp = false; hits.length = 0; fr = await open(); await page.waitForTimeout(2500); S = await st();
  ok(S.ready===3 && !hits.some(h => / (proxy|view) /.test(h)), 'opened again with Main off, every clip comes from the phone (' + JSON.stringify(hits) + ')');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
