// ⚡ scrubbing (Jordan 2026-11-14: "Is there any way to improve the playback and scrubbing for the video edits? Should it be kept locally
// on the phone?"): the timeline plays each clip's small scrub copy from the PC's helper, kept on the phone and played from memory;
// a PC with an older helper: the full clip is kept on the phone. Run: CLIP=a.mp4 NODE_PATH=$(npm root -g) node tests/t_scrub.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
if(!process.env.CLIP){ console.log('set CLIP to a short video'); process.exit(2); }
const VID = fs.readFileSync(process.env.CLIP);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8049);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const hits = [];
  for(const base of [R, M]) await ctx.route(base + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*', 'Access-Control-Expose-Headers':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
    if(p==='/renderdeck/h3proxy'){ hits.push(base + ' proxy ' + u.searchParams.get('filename'));
      if(base===M) return rt.fulfill({status:404, contentType:'text/plain', headers:H, body:'404: Not Found'}); // Main: older helper
      return rt.fulfill({status:200, contentType:'video/mp4', headers:Object.assign({'X-H3-Proxy':'1'}, H), body:VID}); }
    if(p==='/view'){ hits.push(base + ' view ' + u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/mp4', headers:H, body:VID}); }
    return rt.fulfill({status:404, headers:H, body:''}); });
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const tk = (id, pc) => ({id, t:1, pc, w:640, h:360, seconds:5, prompt:id, dir:'H3Deck/' + id, film:'fA', state:'done', final:F(id + '.mp4'), pieces:[{prompt:id, state:'done', deliv:120, file:F(id + '.mp4')}]});
  const deck = {pcs:[{name:'Render', url:R, on:true}, {name:'Main', url:M, on:true}], takes:[tk('tA', R), tk('tB', R), tk('tC', M)], tab:'films', fkey:'fA'};
  const edit = {films:[{id:'fA', name:'Beach', pps:24, tracks:[{id:'a1', clips:[{id:'c1', take:'tA', in:0, out:5, dur:5, at:0}, {id:'c2', take:'tB', in:0, out:5, dur:5, at:5}, {id:'c3', take:'tC', in:0, out:5, dur:5, at:10}]}]}], nav:{v:'film', film:'fA'}};
  await ctx.addInitScript(([r, m, d, e]) => { if(!sessionStorage.getItem('i')){ sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); localStorage.setItem('h3edit', JSON.stringify(e)); }
    window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, [R, M, deck, edit]);
  const open = async () => { await page.goto('http://127.0.0.1:8049/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
    let fr = null; for(let i = 0; i < 60 && !fr; i++){ fr = page.frames().find(f => /film\/\?embed=1/.test(f.url())); if(fr && !(await fr.evaluate(() => !!window.FILM).catch(() => false))) fr = null; if(!fr) await page.waitForTimeout(250); } return fr; };
  let fr = await open(); await page.waitForTimeout(2500);
  const st = () => fr.evaluate(() => ({ready:Object.keys(FILM.PX.url).length, srcs:FILM.S.films[0].tracks[0].clips.map(c => { const t = FILM.takeOf(c.take); return FILM.playUrl(t.pc, FILM.fileOf ? FILM.fileOf(t) : t.final); })}));
  let S = await st(); console.log(JSON.stringify(S), hits);
  ok(S.ready===3 && S.srcs.every(s => /^blob:/.test(s)), 'every clip of the shot is on the phone and plays from memory (' + S.ready + ')');
  ok(hits.includes(R + ' proxy tA.mp4') && hits.includes(R + ' proxy tB.mp4') && !hits.includes(R + ' view tB.mp4'), 'Render\'s clips came as small scrub copies (only the first one on screen started from the PC while its copy came)');
  ok(hits.includes(M + ' proxy tC.mp4') && hits.includes(M + ' view tC.mp4'), 'Main (older helper) gave the full clip instead, also kept on the phone');
  // scrubbing: the stage video plays the copy
  const sv = await fr.evaluate(() => { const f = FILM.S.films[0]; FILM.PH = 6; FILM.showFrame(f); const v = document.querySelector('.stage video.on'); return v ? v.src : ''; });
  ok(/^blob:/.test(sv), 'scrubbing shows the copy kept on the phone: ' + sv.slice(0, 40));
  // opened again: nothing is fetched from the PCs a second time
  hits.length = 0; fr = await open(); await page.waitForTimeout(2000); S = await st();
  ok(S.ready===3 && !hits.some(h => / (proxy|view) t[ABC]\.mp4/.test(h)), 'opened again, the clips come from the phone\'s own copies (no fetches: ' + JSON.stringify(hits) + ')');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
