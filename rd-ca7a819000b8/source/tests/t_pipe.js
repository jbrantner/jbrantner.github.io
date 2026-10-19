// 🪄 Build it all: from one Reference picture the card runs the turnaround (no LoRA), finds the front, sides and back in
// it, makes the 3D model, then the styled turnaround from the 3D model with the AFKJ Style LoRA, with a progress bar.
// Afterwards a found frame can be swapped and any step redone; the steps after it run again. Test mode throughout.
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
  await page.evaluate(() => { closeSheets(); FAKETV.LoraLoaderModelOnly.input.required.lora_name[0].push('AFK_Claude_minimaxh3_3378890_epoch_10.safetensors', 'AFK_MMH3_minimaxh3_3350370_epoch_10.safetensors');
    S.chars = [{id:'c1', name:'Mira', tags:'1girl, red jacket', color:'#ff5ca8', views:[{id:'v0', angle:'ref', img:'mira.png', url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', home:'test'}]}]; save();
    window.GRAPHS = []; const mk = makeTurn; makeTurn = async (c, m, o) => { await mk(c, m, o); GRAPHS.push({model:!!m, g:MTV.last}); }; });
  await page.click('#charBtn'); await page.click('#charBody [data-open="c1"]');
  const txt = await page.textContent('#charBody');
  ok(/🪄 Build it all/.test(txt) && /One tap does the whole chain from the Reference picture/.test(txt), 'the card offers Build it all from the Reference picture');
  ok(await page.inputValue('#charBody [data-pipecf="lora"]')==='AFK_Claude_minimaxh3_3378890_epoch_10.safetensors' && await page.inputValue('#charBody [data-pipecf="words"]')==='AFKJ Style', 'step 4 defaults to the AFKJ Style LoRA (not the retired one) with its activation words');
  // slow the steps a little so the progress bar can be seen
  await page.evaluate(() => { const m = make3d; make3d = async c => { await new Promise(r => setTimeout(r, 600)); return m(c); }; });
  await page.click('#charBody [data-ch="pipego"]');
  await page.waitForSelector('#charBody [data-pipebar]', {timeout:3000});
  ok(/Step \d of 4/.test(await page.textContent('#charBody [data-pipetxt]')), 'a progress bar with the step and time left: ' + await page.textContent('#charBody [data-pipetxt]'));
  await page.waitForFunction(() => S.chars[0].pipe && !S.chars[0].pipe.run && S.chars[0].pipe.done && S.chars[0].pipe.done.turn2, null, {timeout:15000});
  const st = await page.evaluate(() => ({pipe:S.chars[0].pipe, views:S.chars[0].views.map(v => v.angle + (v.pipe ? '*' : '')), graphs:GRAPHS.map(x => ({model:x.model, loras:Object.values(x.g).filter(n => n.class_type==='LoraLoaderModelOnly').map(n => n.inputs.lora_name), cn:Object.values(x.g).some(n => n.class_type==='MiniMaxH3FunControlNetApply'), prompt:(Object.values(x.g).find(n => n.class_type==='MiniMaxH3ReferenceToVideo') || {inputs:{}}).inputs.prompt})), m3d:!!S.chars[0].model3d}));
  ok(Object.keys(st.pipe.done).sort().join()==='model,sides,turn1,turn2' && !st.pipe.err, 'all four steps done: ' + (st.pipe.err || ''));
  ok(st.views.join()==='ref,front*,right*,back*,left*', 'front, right side, back and left side were added from the first turnaround: ' + st.views.join());
  ok(st.graphs.length===2 && !st.graphs[0].model && !st.graphs[0].loras.some(l => /AFK/.test(l)), 'the first turnaround has no style LoRA: ' + JSON.stringify(st.graphs[0] && st.graphs[0].loras));
  ok(st.graphs[1] && st.graphs[1].model && st.graphs[1].cn && st.graphs[1].loras.includes('AFK_Claude_minimaxh3_3378890_epoch_10.safetensors') && /^AFKJ Style\. /.test(st.graphs[1].prompt), 'the second is from the 3D model (ControlNet) with the AFKJ Style LoRA and "AFKJ Style." first');
  ok(st.m3d, 'the 3D model was made');
  ok(st.graphs.every(x => x.prompt && !/undefined/.test(x.prompt)), 'both prompts are clean');
  // both turnarounds used the picture given, not the front it found
  ok(await page.evaluate(() => Object.values(GRAPHS[1].g).find(n => n.class_type==='LoadImage').inputs.image)==='mira.png', 'the styled turnaround still looks at the original picture');
  let t2 = await page.textContent('#charBody');
  ok(/Picked from the first turnaround/.test(t2) && (await page.$$('#charBody [data-piperedo]')).length===4, 'each step can be redone, and the picked frames are shown');
  // swap the back for another frame
  await page.click('#charBody [data-pvang="back"]');
  ok(await page.$('#charBody [data-ch="pvuse"]')!==null, 'tapping a picked frame opens the frame picker');
  await page.click('#charBody [data-ch="pvuse"]'); await page.waitForTimeout(300);
  const sw = await page.evaluate(() => ({backs:S.chars[0].views.filter(v => v.angle==='back').length, swapped:S.chars[0].pipe.swapped}));
  ok(sw.backs===1 && sw.swapped, 'the swapped frame replaces the old back');
  ok(await page.$('#charBody button[data-piperedo="model"].hot')!==null, 'after a swap it offers to redo the 3D model and styled turnaround');
  const n3d = await page.evaluate(() => S.chars[0].model3d.at);
  await page.click('#charBody button[data-piperedo="model"].hot');
  await page.waitForFunction(at => S.chars[0].pipe && !S.chars[0].pipe.run && S.chars[0].pipe.done.turn2 && S.chars[0].model3d.at > at, n3d, {timeout:15000});
  const re = await page.evaluate(() => ({graphs:GRAPHS.length, turn1:!!S.chars[0].pipe.done.turn1, views:S.chars[0].views.length}));
  ok(re.graphs===3 && re.turn1 && re.views===5, 'redo from the 3D model kept the first turnaround and the frames, and made the model and the styled turnaround again');
  // a different LoRA for step 4, then redo only that step
  await page.selectOption('#charBody [data-pipecf="lora"]', '');
  await page.click('#charBody [data-piperedo="turn2"]');
  await page.waitForFunction(() => GRAPHS.length===4 && !S.chars[0].pipe.run, null, {timeout:10000});
  ok(await page.evaluate(() => !Object.values(GRAPHS[3].g).some(n => n.class_type==='LoraLoaderModelOnly' && /AFK/.test(n.inputs.lora_name))), 'picking None for step 4 drops the style LoRA when it is redone');
  // the sides are found where the silhouette is narrowest
  const sides = await page.evaluate(async () => { const real = clipFrames;
    clipFrames = async (url, idx, grab) => idx.map(i => { const cv = document.createElement('canvas'); cv.width = 576; cv.height = 1024; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 576, 1024);
      const th = 2 * Math.PI * i / (TV_LEN - 1), w = 60 + 300 * Math.abs(Math.cos(th + 0.25)); x.fillStyle = '#334'; x.fillRect(288 - w / 2, 100, w, 800); return grab(cv); });
    try{ return await findSides('x'); } finally { clipFrames = real; } });
  // |cos(th + 0.25)| is smallest at th = pi/2 - 0.25 and 3pi/2 - 0.25: frames ~26.6 and ~88.1
  ok(Math.abs(sides.right - 26.6) <= 2 && Math.abs(sides.left - 88.1) <= 2 && Math.abs(sides.back - 57.4) <= 3 && sides.front <= 9, 'sides found at the narrowest silhouettes: ' + JSON.stringify(sides));
  ok(logs.length===0, 'no errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' failed' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
