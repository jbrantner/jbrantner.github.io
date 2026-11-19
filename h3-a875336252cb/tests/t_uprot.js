// 📤 a tall phone video comes in tall (Jordan 2026-11-19: "I have a vertical video I'm trying to import and it keeps importing it
// horizontally"): the shape comes from the file's track header turned by its rotation, not only from the phone's player
// Run: NODE_PATH=$(npm root -g) node tests/t_uprot.js   (needs ffmpeg to make the test videos)
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execSync } = require('child_process');
const root = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uprot'));
try{ execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc=size=640x360:rate=30:duration=2 -c:v libx264 "${tmp}/wide.mp4"`); execSync(`ffmpeg -loglevel error -y -display_rotation 90 -i "${tmp}/wide.mp4" -c copy "${tmp}/tall.mp4"`); }
catch(e){ console.log('needs ffmpeg'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const srv = http.createServer((q, r) => { if(q.url.startsWith('/vid/')){ r.writeHead(200, {'Content-Type':'video/mp4'}); return r.end(fs.readFileSync(path.join(tmp, q.url.slice(5)))); }
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8112);
(async () => { const br = await chromium.launch(), page = await br.newPage(); page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://127.0.0.1:8112/index.html'); await page.waitForFunction(() => window.H3 && H3.addMedia);
  const get = n => page.evaluate(async n => { const b = await (await fetch('/vid/' + n)).blob(), id = await H3.addMedia(new File([b], n, {type:'video/mp4'}), 'vid'), x = H3.S.media[id]; return {w:x.w, h:x.h, fps:x.fps}; }, n);
  const T = await get('tall.mp4'), W = await get('wide.mp4');
  ok(T.w===360 && T.h===640 && T.fps===30, 'a phone video stored wide with "turn 90°" is tall: ' + JSON.stringify(T));
  ok(W.w===640 && W.h===360, 'a wide video stays wide: ' + JSON.stringify(W));
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); fs.rmSync(tmp, {recursive:true, force:true}); process.exit(fails ? 1 : 0); })();
