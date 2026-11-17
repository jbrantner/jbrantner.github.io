// 🔍 Find the best loop: a clip that opens on something walking in, then moves back and forth, loops on the back-and-forth part.
// Run: LOOPCLIP=<video> NODE_PATH=$(npm root -g) node tests/t_loopfind.js
// The clip used: ffmpeg -f lavfi -i "color=c=0x334455:s=320x180:r=24:d=8" -f lavfi -i "color=c=0xffcc00:s=50x60:r=24:d=8" -filter_complex "[0][1]overlay=x='if(lt(t,2),-60+t*100,140+80*sin(2*PI*(t-2)/2))':y=60" -c:v libvpx loopy.webm
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const CLIP = process.env.LOOPCLIP; if(!CLIP || !fs.existsSync(CLIP)){ console.log('set LOOPCLIP to the walk-in clip'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { if(q.url==='/clip.webm'){ r.writeHead(200, {'Content-Type':'video/webm'}); r.end(fs.readFileSync(CLIP)); return; }
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8053);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.addInitScript(() => { localStorage.clear(); window.H3_PCS = []; });
  await page.goto('http://127.0.0.1:8053/index.html'); await page.waitForTimeout(1500);
  const id = await page.evaluate(async () => { const b = await (await fetch('/clip.webm')).blob(); return H3.addMedia(new File([b], 'clip.webm', {type:'video/webm'}), 'vid'); });
  ok(!!id, 'the clip is on the phone');
  const L = await page.evaluate(id => H3.findLoop(id), id);
  ok(L.start >= 1.9 && L.start <= 4.1, 'the walk-in at the start is left out: ' + JSON.stringify(L));
  ok(Math.abs(L.secs % 2) < 0.2 || Math.abs(L.secs % 2 - 2) < 0.2, 'the loop is a whole number of swings (2 s each): ' + L.secs + ' s');
  ok(L.score >= 80 && L.whole <= 60, 'loopability is high for it and low for the whole clip: ' + L.score + ' vs ' + L.whole);
  const A = await page.evaluate(async id => { Object.assign(H3.S.f, {sm:true, smVid:id, smLoop:true, smStart:0, seconds:8, prompt:'[0s-2s] A box slides in.\n[2s-8s] It swings back and forth.'}); const r = await H3.loopApply(); return {r, f:{st:H3.S.f.smStart, s:H3.S.f.seconds, p:H3.S.f.prompt}, note:document.querySelector('#smFindOut').textContent}; }, id);
  ok(A.f.st===A.r.start && A.f.s===A.r.secs, 'the Smooth window is set to it: ' + JSON.stringify(A.f));
  ok(!/slides in/.test(A.f.p) && /^\[0s-[\d.]+s\] It swings/.test(A.f.p), 'timed words move to the loop\'s clock: ' + JSON.stringify(A.f.p));
  ok(/Loopability \d+\/100/.test(A.note), 'the loop box shows the loopability: ' + A.note);
  const W = await page.evaluate(() => { H3.loopWhole(); return {st:H3.S.f.smStart, s:H3.S.f.seconds, p:H3.S.f.prompt}; });
  ok(W.st===0 && W.s >= 7.9 && /slides in/.test(W.p), 'Whole clip puts it all back: ' + JSON.stringify(W));
  // ✂ start/end sliders (Jordan 2026-11-17): they set the window, move the words, and the preview plays the stretch
  const C = await page.evaluate(async () => { H3.S.f.smLoop = true; H3.drawAll && H3.drawAll(); await new Promise(z => setTimeout(z, 300)); const box = document.querySelector('#smCut'), r = {shown:!box.hidden};
    H3.cutSet('a', 2); H3.cutSet('b', 6); await new Promise(z => setTimeout(z, 500)); const v = document.querySelector('#smCutV');
    return Object.assign(r, {st:H3.S.f.smStart, s:H3.S.f.seconds, p:H3.S.f.prompt, a:document.querySelector('#smCutAOut').textContent, b:document.querySelector('#smCutBOut').textContent, src:!!v.getAttribute('src') || !!v.src, t:v.currentTime}); });
  ok(C.shown && C.st===2 && C.s===4 && /^\[0s-4s\] It swings/.test(C.p) && /2(\.0)? s/.test(C.a) && C.src, '✂ Loop from / to set the window (2 s → 6 s), move the words, and the preview has the clip: ' + JSON.stringify(C));
  // the search gives up instead of hanging: a reading that runs past its time stops with a reason (the whole clip is used)
  const BG = await page.evaluate(async id => { const b = await (await fetch('/clip.webm')).blob(); try{ await H3.grabFrames(b, 0, 64, 24, null, 3, {until:Date.now() - 1}); return 'no stop'; }catch(e){ return e.message; } }, id);
  ok(/too long/.test(BG), 'reading the frames stops at its time limit: ' + BG);
  const RW = await page.evaluate(() => { const before = H3.runWork(); H3.S.takes.unshift({id:'wl', state:'done', wildLoop:true, final:{filename:'x.mp4'}, pieces:[]}); const owed = H3.runWork(); H3.S.takes[0].loopTake = 'x'; const after = H3.runWork(); H3.S.takes.shift(); return {before, owed, after}; });
  ok(!RW.before && RW.owed && !RW.after, 'a finished wildcard clip still owed its 🔁 copy counts as work left (the hidden copy on Render keeps going with the app closed): ' + JSON.stringify(RW));
  ok(await page.evaluate(() => H3.shiftTimed('[1s-] carries on.', 2, 3)==='[0s-] carries on.'), 'an open line keeps running');
  // (Jordan 2026-11-17: "use the longest loop it can find") a 10 s clip that swings every 2 s, with a slow drift so a short stretch matches a
  // little better than a long one: at least half the clip is used, not the 2 s one
  const LG = await page.evaluate(() => { const w = 16, h = 16, F = []; for(let k = 0; k < 80; k++){ const g = new Uint8Array(w * h), ph = Math.sin(2 * Math.PI * k / 16), dr = k * 0.6;
      for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) g[y * w + x] = Math.max(0, Math.min(255, 128 + 100 * ph * Math.cos((x + y) / 5) + dr)); F.push(g); }
    const r = H3.loopScore(F, w, h, 16); return {secs:(r.best.j - r.best.i) / 8, score:r.best.score}; });
  ok(LG.secs >= 4.9 && LG.score >= 60, 'a slowly drifting 10 s clip loops at least half of it (not the 2 s that matches a little better): ' + JSON.stringify(LG));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
