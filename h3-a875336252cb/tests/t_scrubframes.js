// 🎞 scrub frames (Jordan 2026-11-19: "Optimize the hell out of the video scrubbing and playback"): while a finger swipes the
// timeline the frame under the needle is drawn from the clip's small JPEG frames (helper /renderdeck/h3strip, kept on the phone)
// and the players don't seek at all; when the finger rests the player seeks once and takes over. A PC with an older helper: as before.
// Run: CLIP=a.mp4 STRIP=a.h3s NODE_PATH=$(npm root -g) node tests/t_scrubframes.js   (STRIP = the helper's h3strip answer for CLIP)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
if(!process.env.CLIP || !process.env.STRIP){ console.log('set CLIP to a short video and STRIP to its h3strip file'); process.exit(2); }
const VID = fs.readFileSync(process.env.CLIP), STRIP = fs.readFileSync(process.env.STRIP);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8051);
  const br = await chromium.launch(), ctx = await br.newContext({viewport:{width:390, height:844}}), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const hits = [];
  for(const base of [R, M]) await ctx.route(base + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*', 'Access-Control-Expose-Headers':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]}); if(p==='/object_info') return J({}); if(p.startsWith('/history')) return J({});
    if(p==='/renderdeck/h3strip' || p==='/renderdeck/h3proxy'){ const kind = p.endsWith('strip') ? 'strip' : 'proxy'; hits.push(base + ' ' + kind + ' ' + u.searchParams.get('filename'));
      if(base===M) return rt.fulfill({status:404, contentType:'text/plain', headers:H, body:'404: Not Found'}); // Main: older helper
      if(kind==='strip' && u.searchParams.get('filename')==='tC.mp4') return rt.fulfill({status:404, contentType:'application/json', headers:H, body:'{"error":"not here yet"}'}); // (Dropbox hasn't brought Main's clip yet)
      return kind==='strip' ? rt.fulfill({status:200, contentType:'application/octet-stream', headers:Object.assign({'X-H3-Strip':'1'}, H), body:STRIP})
        : rt.fulfill({status:200, contentType:'video/mp4', headers:Object.assign({'X-H3-Proxy':'1'}, H), body:VID}); }
    if(p==='/view'){ hits.push(base + ' view ' + u.searchParams.get('filename')); return rt.fulfill({status:200, contentType:'video/mp4', headers:H, body:VID}); }
    return rt.fulfill({status:404, headers:H, body:''}); });
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const tk = (id, pc) => ({id, t:1, pc, w:832, h:480, seconds:5, prompt:id, dir:'H3Deck/' + id, film:'fA', state:'done', final:F(id + '.mp4'), pieces:[{prompt:id, state:'done', deliv:120, file:F(id + '.mp4')}]});
  const deck = {pcs:[{name:'Render', url:R, on:true}, {name:'Main', url:M, on:true}], takes:[tk('tA', R), tk('tB', R), tk('tC', M)], tab:'films', fkey:'fA'};
  const edit = {films:[{id:'fA', name:'Beach', pps:24, tracks:[{id:'a1', clips:[{id:'c1', take:'tA', in:0, out:5, dur:5, at:0}, {id:'c2', take:'tB', in:0, out:5, dur:5, at:5}, {id:'c3', take:'tC', in:0, out:5, dur:5, at:10}]}]}], nav:{v:'film', film:'fA'}};
  await ctx.addInitScript(([r, m, d, e]) => { if(!sessionStorage.getItem('i')){ sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(d)); localStorage.setItem('h3edit', JSON.stringify(e)); }
    window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1}]; window.FILM_PCS = window.H3_PCS; }, [R, M, deck, edit]);
  const open = async () => { await page.goto('http://127.0.0.1:8051/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
    let fr = null; for(let i = 0; i < 60 && !fr; i++){ fr = page.frames().find(f => /film\/\?embed=1/.test(f.url())); if(fr && !(await fr.evaluate(() => !!window.FILM).catch(() => false))) fr = null; if(!fr) await page.waitForTimeout(250); } return fr; };
  let fr = await open(); await page.waitForTimeout(3000);
  const nst = () => fr.evaluate(() => Object.keys(FILM.ST.d).length);
  ok(await nst()===2, 'Render\'s two clips have their frames on the phone (' + await nst() + ')');
  ok(hits.includes(M + ' strip tC.mp4') && !hits.some(h => h.startsWith(M + ' strip') && h!==M + ' strip tC.mp4'), 'Main (older helper) was asked once and is left alone after');
  // count the players' seeks while a finger swipes over clip 2 (the timeline's own scroll, as a finger does it)
  await fr.evaluate(() => { window.SEEKS = 0; document.querySelectorAll('.stage video').forEach(v => v.addEventListener('seeking', () => { window.SEEKS++; })); });
  const swipe = async (from, to, steps) => { for(let i = 0; i <= steps; i++){ await fr.evaluate(t => { const w = document.getElementById('tlw'), f = FILM.S.films[0]; w.scrollLeft = Math.round(t * f.pps); w.dispatchEvent(new Event('scroll')); }, from + (to - from) * i / steps); await page.waitForTimeout(16); } };
  await swipe(5.4, 9.2, 30);
  let s = await fr.evaluate(() => ({seeks:SEEKS, on:document.getElementById('scv').classList.contains('on'), w:document.getElementById('scv').width, i:FILM.stAt(FILM.S.films[0]).i, PH:FILM.PH}));
  console.log(JSON.stringify(s));
  ok(s.on && s.w > 0 && s.w <= 384, 'the frame under the needle is drawn from the phone\'s frames while swiping');
  ok(s.seeks===0, 'the players did not seek once during a 30-step swipe (' + s.seeks + ')');
  ok(s.i===Math.floor((s.PH - 5) * 24 + 1e-3), 'it is the right frame of the clip (' + s.i + ')');
  await page.waitForTimeout(1500);
  s = await fr.evaluate(() => { const v = document.querySelector('.stage video.on'), f = FILM.S.films[0]; return {seeks:SEEKS, on:document.getElementById('scv').classList.contains('on'), vc:v && v.dataset.c, t:v && v.currentTime, want:FILM.PH - 5}; });
  console.log(JSON.stringify(s));
  ok(s.seeks >= 1 && s.seeks <= 3, 'the finger rested: the player sought once to that spot (' + s.seeks + ')');
  ok(!s.on && s.vc==='c2' && Math.abs(s.t - s.want) < 0.06, 'and took over from the frames at the exact frame (canvas hidden)');
  // ▶ Play hides the frames; the clip plays in the player
  await fr.evaluate(() => { FILM.play(FILM.S.films[0]); }); await page.waitForTimeout(300);
  ok(!(await fr.evaluate(() => document.getElementById('scv').classList.contains('on'))), 'playing: the player shows, not the frames');
  await fr.evaluate(() => FILM.stopPlay());
  // a clip from a PC with an older helper scrubs the old way
  await fr.evaluate(() => { SEEKS = 0; }); await swipe(11, 12.5, 10);
  s = await fr.evaluate(() => ({seeks:SEEKS, on:document.getElementById('scv').classList.contains('on')}));
  ok(!s.on && s.seeks >= 1, 'a clip with no frames: the player seeks as before (' + s.seeks + ' seeks)');
  ok(/^blob:/.test(await fr.evaluate(() => { const t = FILM.takeOf('tA'); return FILM.stThumb(t.pc, FILM.fileOf(t), 1); })), 'thumbnails are still pictures from the frames, not players');
  // opened again: the frames come from the phone
  hits.length = 0; fr = await open(); await page.waitForTimeout(1500);
  ok(await nst()===2 && !hits.some(h => / strip t[AB]\.mp4/.test(h)), 'opened again, the frames are the phone\'s own (no fetches: ' + JSON.stringify(hits) + ')');
  await br.close(); srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
