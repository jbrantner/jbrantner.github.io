// 🪄 Build it all: from one Reference picture the card makes the turnaround (no LoRA), finds six angles in it and
// redraws each with Illustrious (the quality pass), with a progress bar; a frame can be swapped (and is redrawn), any
// step redone. 🎞 Training shots: MiniMax acts each line out from the picture, side and back; the sharpest frame is
// redrawn and joins the card with its tags, which the training set captions use. Test mode throughout.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.click('#testBtn'); await page.waitForTimeout(300);
  await page.evaluate(() => { closeSheets();
    S.chars = [{id:'c1', name:'Mira', tags:'1girl, red jacket', color:'#ff5ca8', views:[{id:'v0', angle:'ref', img:'mira.png', url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', home:'test'}]}]; save();
    window.GRAPHS = []; const mk = makeTurn; makeTurn = async (c, m, o) => { await mk(c, m, o); GRAPHS.push({model:!!m, g:MTV.last}); }; });
  await page.click('#charBtn'); await page.click('#charBody [data-open="c1"]');
  const txt = await page.textContent('#charBody');
  ok(/🪄 Build it all/.test(txt) && /six angles picked out of it/.test(txt) && !/3D model's spin/.test(txt), 'the card offers Build it all (turnaround, angles, quality pass; no 3D)');
  await page.evaluate(() => { const r = redrawPic; redrawPic = async (...a) => { await new Promise(x => setTimeout(x, 120)); return r(...a); }; });
  ok(await page.evaluate(() => redrawW(S.chars[0])===0), 'the quality pass defaults to bigger only (no redraw)');
  await page.evaluate(() => { S.chars[0].redrawW = 0.2; save(); });
  await page.click('#charBody [data-ch="pipego"]');
  await page.waitForSelector('#charBody [data-pipebar]', {timeout:3000});
  ok(/Step \d of 3/.test(await page.textContent('#charBody [data-pipetxt]')), 'a progress bar with the step and time left: ' + await page.textContent('#charBody [data-pipetxt]'));
  await page.waitForFunction(() => S.chars[0].pipe && !S.chars[0].pipe.run && S.chars[0].pipe.done && S.chars[0].pipe.done.redraw, null, {timeout:15000});
  const st = await page.evaluate(() => ({pipe:S.chars[0].pipe, views:S.chars[0].views.map(v => (v.slot || v.angle) + (v.redrawn ? '*' : '')), graphs:GRAPHS.map(x => ({model:x.model, loras:Object.values(x.g).filter(n => n.class_type==='LoraLoaderModelOnly').map(n => n.inputs.lora_name)})), m3d:!!S.chars[0].model3d, red:REDRAWN.length, rg:REDRAWN[0]}));
  ok(Object.keys(st.pipe.done).sort().join()==='redraw,sides,turn1' && !st.pipe.err, 'all three steps done: ' + (st.pipe.err || ''));
  ok(st.views.join()==='ref,front*,three*,right*,back*,left*,three_b*', 'six angles from the turnaround, each redrawn: ' + st.views.join());
  ok(st.graphs.length===1 && !st.graphs[0].model && !st.graphs[0].loras.some(l => /AFK/.test(l)) && !st.m3d, 'one turnaround, no style LoRA, no 3D model');
  const rg = Object.values(st.rg), up = rg.find(n => n.class_type==='UltimateSDUpscaleNoUpscale'), pos = rg.find(n => n.class_type==='CLIPTextEncode');
  ok(st.red===6 && up && up.inputs.denoise===0.2 && up.inputs.tile_width===1024 && rg.find(n => n.class_type==='ImageScaleBy').inputs.scale_by===1.5 && rg.find(n => n.class_type==='CheckpointLoaderSimple').inputs.ckpt_name==='oneObsession_v24.safetensors'
    && /red jacket/.test(pos.inputs.text) && /a-pose/.test(pos.inputs.text) && !rg.some(n => /Lora/.test(n.class_type)), 'quality pass: 1.5×, Illustrious tiles at 0.2 (light), the card tags, no LoRA');
  ok(/Picked from the turnaround, redrawn/.test(await page.textContent('#charBody')) && (await page.$$('#charBody [data-piperedo]')).length===3, 'each step can be redone, and the picked frames are shown');
  // swap the back: the new frame gets the quality pass too
  await page.click('#charBody [data-pvslot="back"]');
  await page.click('#charBody [data-ch="pvuse"]'); await page.waitForFunction(() => REDRAWN.length===7, null, {timeout:5000});
  ok(await page.evaluate(() => S.chars[0].views.filter(v => v.slot==='back').length===1 && S.chars[0].views.find(v => v.slot==='back').redrawn), 'a swapped frame replaces the old one and is redrawn');
  await page.click('#charBody [data-piperedo="redraw"]'); await page.waitForFunction(() => REDRAWN.length===13 && !S.chars[0].pipe.run, null, {timeout:8000});
  ok(await page.evaluate(() => GRAPHS.length===1), 'redoing the quality pass keeps the turnaround');
  // training shots
  ok(/🎞 Training shots/.test(await page.textContent('#charBody')) && /Make 12 training shots/.test(await page.textContent('#charBody [data-ch="shotgo"]')), 'training shots offer the 12 starter actions');
  await page.evaluate(() => { S.chars[0].shotList = 'sits in a wooden armchair, reading a book | sitting, armchair, reading, indoors\nwaves at the camera in a park | waving, outdoors, park'; save(); drawChars(); });
  await page.click('#charBody [data-ch="shotgo"]');
  await page.waitForFunction(() => (S.chars[0].shots || []).length===2 && S.chars[0].shots.every(s => s.view) && !SHOT_RUN.c1, null, {timeout:10000});
  const sg = await page.evaluate(() => { const g = Object.values(SHOT_RUN.last), rv = g.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs;
    return {refs:Object.keys(rv).filter(k => /^ref_images/.test(k)).map(k => g[+rv[k][0] - 1] ? Object.entries(SHOT_RUN.last).find(([id]) => id===rv[k][0])[1].inputs.image : ''), prompt:rv.prompt, loras:g.filter(n => n.class_type==='LoraLoaderModelOnly').map(n => n.inputs.lora_name),
      shots:S.chars[0].views.filter(v => v.shot).map(v => ({cap:v.cap, red:!!v.redrawn}))}; });
  ok(sg.refs.length===3 && sg.refs[0]==='mira.png', 'each shot looks at the picture, a side and the back: ' + sg.refs.join(', '));
  ok(/<Picture 2>: <Subject 1> from the side/.test(sg.prompt) && /<Picture 3>: <Subject 1> from behind/.test(sg.prompt) && /waves at the camera in a park/.test(sg.prompt) && !sg.loras.some(l => /AFK/.test(l)), 'the prompt names the pictures and the action, no style LoRA');
  ok(sg.shots.length===4 && sg.shots.every(x => x.red) && sg.shots[3].cap==='waving, outdoors, park', 'each shot gives two frames to the card, redrawn, with its tags: ' + sg.shots.length);
  // clips queued before the app closed: opening the card picks their frames
  await page.evaluate(() => { const c = S.chars[0]; c.shots.push({id:'shq', say:'sits on a bench', tags:'sitting, bench', pid:'test', pc:'test'}); save(); drawChars(); });
  await page.waitForFunction(() => S.chars[0].views.filter(v => v.shot==='shq').length===2 && !SHOT_RUN.c1 && !S.chars[0].shots.find(s => s.id==='shq').pid, null, {timeout:8000});
  ok(true, 'a clip queued before the app closed gets its frames when the card opens');
  await page.evaluate(() => { const c = S.chars[0]; c.views = c.views.filter(v => v.shot!=='shq'); c.shots = c.shots.filter(s => s.id!=='shq'); save(); drawChars(); });
  // shots from before v.65: their finished clips are found on the computer and given to them in order
  const ad = await page.evaluate(async () => { const c = {id:'cx', name:'Lib', views:[], shots:[{id:'a', view:'v'}, {id:'b'}, {id:'c'}]}, f = window.fetch, t = S.test, sv = S.servers;
    window.fetch = async u => ({ok:+new URL(u).searchParams.get('filename').match(/_(\d+)_\.mp4/)[1] <= 3}); S.test = false; S.servers = [{url:'http://pc'}];
    try{ const n = await adoptClips(c); return {n, urls:c.shots.map(x => (x.url || '').match(/_(\d+)_\.mp4/) ? +x.url.match(/_(\d+)_\.mp4/)[1] : 0)}; } finally { window.fetch = f; S.test = t; S.servers = sv; } });
  ok(ad.n===2 && ad.urls.join()==='0,2,3', 'lost shots get the newest clips in order: ' + JSON.stringify(ad));
  // the picker: leave some out, the meter counts what is kept
  const pk = await page.evaluate(() => { drawChars(); const m = document.querySelector('#charBody .setmeter').textContent; return {n:document.querySelectorAll('#charBody [data-tpick]').length, m}; });
  ok(pk.n===11 && /11 picked/.test(pk.m) && /A bit few/.test(pk.m), 'every picture can be picked, the meter counts them: ' + pk.m.replace(/\s+/g, ' ').slice(0, 90));
  await page.click('#charBody [data-tpick="v0"]');
  ok(await page.evaluate(() => S.chars[0].views.find(v => v.id==='v0').noTrain && /10 picked/.test(document.querySelector('#charBody .setmeter').textContent)), 'tapping a picture leaves it out');
  // the big view: tap a thumbnail, swipe through, the check keeps or leaves out
  await page.click('#charBody [data-tview]:nth-child(2) img');
  const vw = await page.evaluate(() => ({open:!$('#viewer').hidden, mode:V.mode, i:V.i, keep:$('#vKeep').textContent, info:$('#vInfo').textContent}));
  ok(vw.open && vw.mode==='tset' && vw.i===1 && /Keep/.test(vw.keep) && /10 kept/.test(vw.info), 'tapping a thumbnail opens it big with a keep check: ' + vw.info);
  await page.click('#vKeep'); await page.evaluate(() => viewAt(V.i + 1));
  ok(await page.evaluate(() => S.chars[0].views[1].noTrain && /9 kept/.test($('#vInfo').textContent) && V.i===2), 'the check leaves it out and the count follows as you swipe');
  await page.click('#vKeep'); await page.evaluate(() => { viewAt(1); }); await page.click('#vKeep'); await page.click('#vClose');
  ok(await page.evaluate(() => !S.chars[0].views[1].noTrain && S.chars[0].views[2].noTrain && /9 picked/.test(document.querySelector('#charBody .setmeter').textContent)), 'closing the viewer updates the meter on the card');
  await page.evaluate(() => { delete S.chars[0].views[2].noTrain; save(); });
  // the training set: captions from the tags, and the angles instead of raw turnaround frames
  await page.evaluate(() => { S.chars[0].trigger = 'mira'; });
  const caps = await page.evaluate(async () => { const c = S.chars[0]; delete c.views[0].noTrain; c.views[1].noTrain = true; picHash = async () => Math.random().toString(36); c.turn = {url:'', test:true}; await exportSet(c); return {n:c.set.files.length, all:c.views.length, caps:c.set.files.map(f => f.cap + (f.frame ? ' [frame]' : ''))}; }).then(r => { ok(r.n===r.all - 1, 'left-out pictures are not saved: ' + r.n + ' of ' + r.all); return r.caps; });
  ok(caps.some(x => x==='mira, 1girl, solo, sitting, armchair, reading, indoors') && caps.some(x => /from behind, standing, a-pose.*\[frame\]$/.test(x)), 'training set captions come from the shot tags and the angles: ' + caps.slice(-3).join(' / '));
  // the sharpest frame
  const sharp = await page.evaluate(async () => { const real = clipFrames;
    clipFrames = async (url, idx, grab) => idx.map(i => { const cv = document.createElement('canvas'); cv.width = 576; cv.height = 1024; const x = cv.getContext('2d'); x.fillStyle = '#888'; x.fillRect(0, 0, 576, 1024);
      if(i===48){ x.fillStyle = '#000'; for(let k = 0; k < 40; k++) x.fillRect(10 + k * 14, 0, 6, 1024); } else { x.filter = 'blur(6px)'; x.fillStyle = '#000'; for(let k = 0; k < 40; k++) x.fillRect(10 + k * 14, 0, 6, 1024); } return grab(cv); });
    try{ return (await sharpestFrame('x'))[0]; } finally { clipFrames = real; } });
  ok(sharp===48, 'the sharpest frame is picked: ' + sharp);
  // the sides
  const sides = await page.evaluate(async () => { const real = clipFrames;
    clipFrames = async (url, idx, grab) => idx.map(i => { const cv = document.createElement('canvas'); cv.width = 576; cv.height = 1024; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 576, 1024);
      const th = 2 * Math.PI * i / (TV_LEN - 1), w = 60 + 300 * Math.abs(Math.cos(th + 0.25)); x.fillStyle = '#334'; x.fillRect(288 - w / 2, 100, w, 800); return grab(cv); });
    try{ return await findSides('x'); } finally { clipFrames = real; } });
  ok(Math.abs(sides.right - 26.6) <= 2 && Math.abs(sides.left - 88.1) <= 2 && Math.abs(sides.back - 57.4) <= 3 && sides.front <= 9 && sides.three > sides.front && sides.three < sides.right && sides.three_b > sides.left, 'angles found at the narrowest silhouettes: ' + JSON.stringify(sides));
  ok(logs.length===0, 'no errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' failed' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
