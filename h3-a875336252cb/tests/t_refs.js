// Ref Deck test: the page on a local static server, a stand-in ComfyUI that checks every graph against the real node
// definitions (LoadAudio, SaveAudio, kijai's MelBandRoFormer nodes, MW Audio Tools' MusicSeparation / MergeAudioMW) and
// answers with a real FLAC stem, and real media cut on the page with Mediabunny (checked afterwards with ffprobe).
// Then the hand-over: the page goes to H3 Deck, which must slot the pieces into its references.
// Run from the repo root: MEDIA=<folder with test.webm (VP9+Opus, 10 s, 24 fps, 640x360) test.mp4 (H.264+AAC, 6 s, 30 fps)
//   stem.flac> NODE_PATH=$(npm root -g) node h3-a875336252cb/tests/t_refs.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const MEDIA = process.env.MEDIA, ROOT = path.resolve(__dirname, '../..'), TMP = fs.mkdtempSync('/tmp/refdeck-');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };

// ---- static server for the site ----
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.webmanifest':'application/json', '.png':'image/png'};
const site = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].split('#')[0]); if(p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if(!f.startsWith(ROOT) || !fs.existsSync(f)){ r.writeHead(404); r.end(); return; }
  r.writeHead(200, {'Content-Type':TYPES[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(8000);

// ---- stand-in ComfyUI (the parts Ref Deck uses), with the real node signatures ----
function mockComfy(port, nodes){
  const DEF = {
    LoadAudio:{input:{required:{audio:[['x.wav']]}}, output:['AUDIO']},
    SaveAudio:{input:{required:{audio:['AUDIO'], filename_prefix:['STRING']}}, output:[]},
    MelBandRoFormerModelLoader:{input:{required:{model_name:[['MelBandRoformer_fp16.safetensors', 'other.safetensors']]}}, output:['MELROFORMERMODEL']},
    MelBandRoFormerSampler:{input:{required:{model:['MELROFORMERMODEL'], audio:['AUDIO']}}, output:['AUDIO', 'AUDIO']},
    MusicSeparation:{input:{required:{audio:['AUDIO']}}, output:['AUDIO', 'AUDIO', 'AUDIO']},
    MergeAudioMW:{input:{required:{audio_1:['AUDIO'], audio_2:['AUDIO']}}, output:['AUDIO']},
  };
  const st = {uploads:{}, graphs:[], hist:{}};
  const srv = http.createServer(async (q, r) => {
    const H = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Content-Type':'application/json'};
    if(q.method==='OPTIONS'){ r.writeHead(204, H); r.end(); return; }
    const u = new URL(q.url, 'http://x'), body = await new Promise(ok => { const c = []; q.on('data', d => c.push(d)); q.on('end', () => ok(Buffer.concat(c))); });
    const J = (o, s) => { r.writeHead(s || 200, H); r.end(JSON.stringify(o)); };
    if(u.pathname==='/system_stats') return J({system:{comfyui_version:'0.41.3'}});
    if(u.pathname.startsWith('/object_info/')){ const n = u.pathname.split('/').pop(); return J(nodes.includes(n) ? {[n]:DEF[n]} : {}); }
    if(u.pathname==='/upload/image'){ const s = body.toString('latin1'), name = (s.match(/filename="([^"]+)"/) || [])[1], sub = (s.match(/name="subfolder"\r\n\r\n([^\r]*)/) || [])[1];
      const i = s.indexOf('\r\n\r\n', s.indexOf('filename=')) + 4, end = s.indexOf('\r\n--', i); st.uploads[sub + '/' + name] = body.subarray(i, end);
      return J({name, subfolder:sub, type:'input'}); }
    if(u.pathname==='/prompt'){ const g = JSON.parse(body).prompt, errs = [];
      for(const [id, n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d || !nodes.includes(n.class_type)){ errs.push(id + ': unknown ' + n.class_type); continue; }
        for(const [k, spec] of Object.entries(d.input.required)){ const v = n.inputs[k]; if(v===undefined){ errs.push(id + ' ' + n.class_type + ' misses ' + k); continue; }
          if(Array.isArray(v)){ const src = g[v[0]]; if(!src){ errs.push(id + ' links to missing ' + v[0]); continue; } const ot = DEF[src.class_type].output[v[1]];
            if(ot!==spec[0]) errs.push(id + '.' + k + ' wants ' + spec[0] + ', got ' + ot); }
          else if(Array.isArray(spec[0]) && n.class_type!=='LoadAudio' && !spec[0].includes(v)) errs.push(id + '.' + k + ' = ' + v + ' not in list');
          else if(n.class_type==='LoadAudio' && !st.uploads[v]) errs.push('LoadAudio file ' + v + ' was never uploaded'); } }
      st.graphs.push({g, errs}); if(errs.length) return J({error:{message:errs.join('; ')}, node_errors:{}}, 400);
      const id = 'p' + st.graphs.length, outputs = {};
      for(const [nid, n] of Object.entries(g)) if(n.class_type==='SaveAudio') outputs[nid] = {audio:[{filename:path.basename(n.inputs.filename_prefix) + '_00001_.flac', subfolder:'RefDeck', type:'output'}]};
      st.hist[id] = {status:{completed:true, status_str:'success', messages:[]}, outputs}; return J({prompt_id:id}); }
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.split('/').pop(); return J(st.hist[id] ? {[id]:st.hist[id]} : {}); }
    if(u.pathname==='/view'){ r.writeHead(200, {'Access-Control-Allow-Origin':'*', 'Content-Type':'audio/flac'}); r.end(fs.readFileSync(path.join(MEDIA, 'stem.flac'))); return; }
    J({}, 404);
  }).listen(port);
  return {st, srv};
}
const A = mockComfy(8188, ['LoadAudio', 'SaveAudio', 'MelBandRoFormerModelLoader', 'MelBandRoFormerSampler', 'MusicSeparation', 'MergeAudioMW']); // like Render with both
const B = mockComfy(8189, ['LoadAudio', 'SaveAudio']); // a PC with no splitter
const probe = f => JSON.parse(execSync(`ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels -of json "${f}"`).toString());

(async () => {
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('console', m => { if(m.type()==='error') console.log('console:', m.text()); });
  await page.addInitScript(() => { window.RD_PCS = [{name:'Render', url:'http://127.0.0.1:8188', on:true}, {name:'Main', url:'http://127.0.0.1:8189', on:true}];
    window.H3_PCS = window.RD_PCS; });
  await page.goto('http://127.0.0.1:8000/h3-a875336252cb/refs/');
  const pick = async file => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#pickBtn:not([hidden]), #changeBtn')]); await fc.setFiles(path.join(MEDIA, file)); };
  await pick('test.webm');
  await page.waitForFunction(() => RD.SRC.dur > 0 && document.querySelectorAll('#strip img').length >= 8, null, {timeout:30000});
  const src = await page.evaluate(() => ({dur:RD.SRC.dur, fps:RD.SRC.fps, w:RD.SRC.w, h:RD.SRC.h, audio:RD.SRC.audio}));
  console.log('source:', JSON.stringify(src));
  ok(Math.abs(src.dur - 10) < 0.1 && src.fps===24 && src.w===640 && src.audio===true, 'video read: 10 s, 24 fps, 640x360, has sound');

  // frame stepping
  await page.click('[data-step="+1s"]'); await page.waitForTimeout(300);
  await page.click('[data-step="+1f"]'); await page.waitForTimeout(300); await page.click('[data-step="+1f"]'); await page.waitForTimeout(300);
  let f = await page.textContent('#fNow'); ok(/^26 \//.test(f), '+1 s then two +1 frame lands on frame 26 (' + f + ')');
  await page.click('[data-step="-1f"]'); await page.waitForTimeout(300); f = await page.textContent('#fNow'); ok(/^25 \//.test(f), '−1 frame goes back to 25');
  // scrub by dragging
  const sb = await page.$('#scrub'), bb = await sb.boundingBox();
  console.log('scrub box', JSON.stringify(bb)); await page.mouse.move(bb.x + bb.width * 0.2, bb.y + 20); await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.move(bb.x + bb.width * 0.5, bb.y + 20, {steps:6}); await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(800);
  const ts = await page.evaluate(() => document.querySelector('#vid').currentTime); ok(Math.abs(ts - 5) < 0.15, 'dragging the scrubber to the middle seeks to ~5 s (' + ts.toFixed(3) + ')');

  // set a 2.0 - 7.0 s clip
  await page.evaluate(() => RD.SRC && document.querySelector('#vid').pause());
  await page.evaluate(async () => { const v = document.querySelector('#vid'); v.currentTime = 2.0; await new Promise(r => v.onseeked = r); }); await page.click('#inBtn');
  await page.evaluate(async () => { const v = document.querySelector('#vid'); v.currentTime = 7.0; await new Promise(r => v.onseeked = r); }); await page.click('#outBtn');
  ok(/Clip 0:02.00 – 0:07.00/.test(await page.textContent('#selNote')) && /Fits/.test(await page.textContent('#selNote')), 'clip 2 – 7 s set, fits MiniMax 2-15 s');

  // frames
  await page.click('#grabBtn'); await page.waitForFunction(() => RD.S.items.length===1, null, {timeout:10000});
  await page.click('#grab9Btn'); await page.waitForFunction(() => RD.S.items.length===10, null, {timeout:60000});
  const out = async (i, name) => { const b64 = await page.evaluate(async id => { const b = await new Promise((ok, no) => { const r = indexedDB.open('refdeck', 1); r.onsuccess = () => { const g = r.result.transaction('blobs').objectStore('blobs').get(id); g.onsuccess = () => ok(g.result); g.onerror = no; }; });
      const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for(let k = 0; k < a.length; k += 32768) s += String.fromCharCode.apply(null, a.subarray(k, k + 32768)); return btoa(s); }, i.id);
    const p = path.join(TMP, name); fs.writeFileSync(p, Buffer.from(b64, 'base64')); return p; };
  let items = await page.evaluate(() => RD.S.items);
  const png = await out(items[0], 'frame.png'), pp = probe(png).streams[0];
  ok(pp.codec_name==='png' && pp.width===640 && pp.height===360, 'frame grab is a full-size 640x360 PNG');
  const subs = items.slice(1).map(i => i.sub); console.log('9 frames at:', subs.join(' '));
  ok(subs.length===9 && parseFloat(subs[0].split(':')[1]) > 2 && parseFloat(subs[8].split(':')[1]) < 7, '9 frames spread inside the clip');

  // clips
  for(const [btn, n] of [['#cutAV', 11], ['#cutV', 12], ['#cutA', 13]]){ await page.click(btn); await page.waitForFunction(k => RD.S.items.length===k, n, {timeout:60000}); }
  items = await page.evaluate(() => RD.S.items);
  const [av, vo, au] = items.slice(10);
  const pav = probe(await out(av, 'av.' + av.ext)), pvo = probe(await out(vo, 'v.' + vo.ext)), pau = probe(await out(au, 'a.' + au.ext));
  console.log('av:', JSON.stringify(pav)); console.log('v:', JSON.stringify(pvo)); console.log('a:', JSON.stringify(pau));
  ok(pav.streams.some(s => s.codec_type==='video') && pav.streams.some(s => s.codec_type==='audio') && Math.abs(pav.format.duration - 5) < 0.15, 'Video + sound: both tracks, 5 s');
  ok(pvo.streams.length===1 && pvo.streams[0].codec_type==='video' && Math.abs(pvo.format.duration - 5) < 0.15, 'Video only: no sound track, 5 s');
  ok(au.ext==='wav' && pau.streams[0].codec_name==='pcm_s16le' && +pau.streams[0].sample_rate===44100 && Math.abs(pau.format.duration - 5) < 0.1, 'Sound only: 44.1 kHz WAV, 5 s');
  ok(av.sound===true && vo.sound===false, 'clip with sound is marked for H3 Deck\'s 🔊');

  // voice split: Render has both; Best one = Mel-Band
  await page.waitForFunction(() => !document.querySelector('#sepBtn').disabled, null, {timeout:10000});
  ok(/on Render/.test(await page.textContent('#sepWhere')), 'voice split goes to Render first');
  await page.click('#sepBtn'); await page.waitForFunction(() => RD.S.items.length===15, null, {timeout:30000});
  let g = A.st.graphs.at(-1); ok(!g.errs.length && Object.values(g.g).some(n => n.class_type==='MelBandRoFormerSampler') && Object.values(g.g).find(n => n.class_type==='MelBandRoFormerModelLoader').inputs.model_name==='MelBandRoformer_fp16.safetensors', 'Mel-Band graph passes the node checks, picks the Mel-Band model');
  const up = Object.entries(A.st.uploads).at(-1); fs.writeFileSync(path.join(TMP, 'up.wav'), up[1]); const pu = probe(path.join(TMP, 'up.wav'));
  ok(/^refdeck\//.test(up[0]) && +pu.streams[0].sample_rate===44100 && Math.abs(pu.format.duration - 5) < 0.1, 'sent the clip\'s 5 s of sound as 44.1 kHz WAV (' + up[0] + ')');
  items = await page.evaluate(() => RD.S.items); ok(items.slice(13).map(i => i.label).join()==='🎤 Voice,🎵 Background' && items[13].ext==='wav', 'Voice + Background back in the tray as WAV');
  // TIGER
  await page.click('[data-method="tiger"]'); await page.click('#sepBtn'); await page.waitForFunction(() => RD.S.items.length===19, null, {timeout:30000});
  g = A.st.graphs.at(-1); ok(!g.errs.length && Object.values(g.g).some(n => n.class_type==='MusicSeparation') && Object.values(g.g).some(n => n.class_type==='MergeAudioMW'), 'TIGER graph passes, background = effects + music merged');
  items = await page.evaluate(() => RD.S.items); ok(items.slice(15).map(i => i.label).join()==='🎤 Voice,🎵 Background,💥 Effects,🎼 Music', 'TIGER gives Voice, Background, Effects, Music');
  // Only Main (no splitter) -> says so
  await page.evaluate(() => { RD.S.where = 'http://127.0.0.1:8189'; RD.pingAll(); }); await page.waitForTimeout(800);
  ok(await page.$eval('#sepBtn', b => b.disabled) && /No voice splitter on Main/.test(await page.textContent('#sepNote')), 'a PC without a splitter is refused with a reason');
  await page.evaluate(() => { RD.S.where = 'auto'; RD.pingAll(); });

  // H3 Deck room: too many sounds picked
  await page.waitForTimeout(300);
  ok(await page.$eval('#goBtn', b => b.disabled) && /Too many/.test(await page.textContent('#h3Room')), 'more than 9 pictures / 3 sounds picked blocks sending, with a reason');
  // pick 3 frames, the 2 clips with video, voice + background
  await page.click('#pickNone');
  for(const i of [1, 4, 7, 10, 11, 13, 14]) await page.click(`.item:nth-child(${i + 1}) .ck`);
  const label = await page.textContent('#goBtn'); console.log('button:', label);
  ok(/Send 3 pictures, 2 videos, 2 sounds to H3 Deck/.test(label), 'send button counts what is picked');

  // mp4 (H.264 + AAC), keyframes every 2 s: an exact 1 - 4 s cut needs a re-encode; without an encoder it starts at 0 s
  await pick('test.mp4');
  await page.waitForFunction(() => RD.SRC.fps===30 && /test\.mp4/.test(document.querySelector('#vidSum').textContent), null, {timeout:30000});
  await page.evaluate(() => { RD.SRC.a = 1; RD.SRC.b = 4; });
  await page.click('#cutAV'); await page.waitForFunction(() => RD.S.items.length===20, null, {timeout:30000});
  items = await page.evaluate(() => RD.S.items); const m4 = probe(await out(items[19], 'mp4cut.' + items[19].ext));
  console.log('mp4 cut:', JSON.stringify(m4));
  ok(items[19].ext==='mp4' && m4.streams.some(s => s.codec_name==='h264') && m4.streams.some(s => s.codec_type==='audio') && m4.format.duration >= 2.9 && m4.format.duration < 5, 'H.264 + AAC clip cut to 1 - 4 s (exact when the browser can re-encode, else from the keyframe before)');
  await page.click(`.item:nth-child(20) .ck`); // un-pick it (new items come picked) so the counts above still hold

  // hand over to H3 Deck
  await page.click('#goBtn');
  await page.waitForURL(/h3-a875336252cb\/(#refs)?$/, {timeout:10000});
  await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:15000});
  await page.waitForTimeout(800);
  const h3 = await page.evaluate(async () => { const f = H3.S.f, ids = f.imgs.concat(f.vids, f.auds).map(r => r.id);
    const blobs = await Promise.all(ids.map(id => new Promise(ok => { const r = indexedDB.open('h3deck', 1); r.onsuccess = () => { const g = r.result.transaction('media').objectStore('media').get(id); g.onsuccess = () => ok(g.result ? g.result.size : 0); }; })));
    return {ref:f.ref, imgs:f.imgs.length, vids:f.vids.map(v => v.sound), auds:f.auds.length, blobs, names:ids.map(id => H3.S.media[id].name), inbox:localStorage.getItem('h3deck-inbox'),
      labels:[...document.querySelectorAll('#vidSlots .tag, #imgSlots .tag, #audSlots .tag')].map(t => t.textContent)}; });
  console.log('H3 Deck:', JSON.stringify(h3));
  ok(h3.ref && h3.imgs===3 && h3.vids.length===2 && h3.auds===2, 'H3 Deck slotted 3 pictures, 2 videos, 2 sounds and turned References on');
  ok(h3.vids.join()==='true,false', 'the clip with sound arrives with 🔊 on, the silent one off');
  ok(h3.blobs.every(s => s > 1000) && !h3.inbox, 'every piece is in H3 Deck\'s media store, inbox emptied');
  ok(h3.labels.some(t => /Picture 3/.test(t)) && h3.labels.some(t => /Video 2/.test(t)), 'they show as <Picture n> / <Video n> slots');
  const shot = path.join(TMP, 'h3.png'); await page.screenshot({path:shot, fullPage:true});
  await page.goto('http://127.0.0.1:8000/h3-a875336252cb/refs/'); await page.waitForFunction(() => RD.SRC.dur > 0, null, {timeout:20000}); await page.waitForTimeout(600);
  ok(await page.evaluate(() => RD.S.items.length===20 && RD.SRC.name==='test.mp4' && RD.S.items.filter(i => i.on).length===0), 'reopening keeps the tray and the last video; sent pieces are un-picked');
  await page.screenshot({path:path.join(TMP, 'refs.png'), fullPage:true});
  console.log('screens in', TMP);
  await br.close(); site.close(); A.srv.close(); B.srv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
