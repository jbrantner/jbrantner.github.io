// 🪞 Match her body (Jordan 2026-10-29): an older library character, made from a picture before the mannequin, gets one. Her
// eye-level pictures lie over the mannequin, her body, hair and look start from her tags, and ✓ hands them back to the 📚 Library. Run with RIG_DEPS (three.js) and BODY_FBX
// (the kit's Anime_Female_A.fbx; it is Jordan's bought model, so it is never in the repo).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DEPS = process.env.RIG_DEPS || '', FBX = process.env.BODY_FBX || '';
if(!FBX){ console.log('skip: BODY_FBX not set'); process.exit(0); }
(async () => {
  const browser = await chromium.launch({args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({ viewport:{width:390, height:900} });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  const host = `<!doctype html><body style="margin:0"><iframe id="f" src="rig/mannequin.html?fit=1&id=Ellie&name=Ellie&tags=1girl%2C+large+breasts%2C+goth%2C+very+long+hair%2C+blunt+bangs%2C+black+dress%2C+purple+eyes&pics=%5B%5B0%2C%22https%3A%2F%2Frender.test%2Fview%3Ffilename%3Deye_000.png%26subfolder%3DCharacter%2520Library%252FEllie%26type%3Doutput%22%5D%2C%5B90%2C%22https%3A%2F%2Frender.test%2Fview%3Ffilename%3Deye_090.png%26subfolder%3DCharacter%2520Library%252FEllie%26type%3Doutput%22%5D%2C%5B180%2C%22https%3A%2F%2Frender.test%2Fview%3Ffilename%3Deye_180.png%26subfolder%3DCharacter%2520Library%252FEllie%26type%3Doutput%22%5D%5D" style="width:390px;height:1600px;border:0"></iframe>
    <script>window.GOT = []; addEventListener('message', e => { if(e.data && e.data.rdmq) GOT.push(e.data); });</script></body>`;
  await page.route('https://app.test/host.html', r => r.fulfill({ contentType:'text/html', body:host }));
  await page.route('https://app.test/rig/**', r => { const f = path.join(__dirname, '..', new URL(r.request().url()).pathname.replace('/rig/', '')); r.fulfill({ contentType:f.endsWith('.js') ? 'text/javascript' : 'text/html', body:fs.readFileSync(f) }); });
  await page.route('https://app.test/tags.txt', r => r.fulfill({ contentType:'text/plain', body:fs.readFileSync(path.join(__dirname, '..', '..', 'tags.txt')) }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('https://cdn.jsdelivr.net/npm/**', r => { const u = new URL(r.request().url()).pathname.replace('/npm/', ''), m = u.match(/^(@?[^@]+)@([^/]+)\/(.*)$/);
    const f = path.join(DEPS, {'three':'three-0.160.0'}[m[1]] || 'x', 'package', m[3]); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' }); r.fulfill({ contentType:'text/javascript', body:fs.readFileSync(f) }); });
  const H = {'access-control-allow-origin':'*'}, UPS = [], GRAPHS = [];
  const OI = {CheckpointLoaderSimple:['ckpt_name', ['bismuthIllustrious_v80.safetensors', 'iriselTouchIL_v10.safetensors']], LoraLoader:['lora_name', ['AFKJ Style Illustrious Claude.safetensors']], ControlNetLoader:['control_net_name', ['illustriousXL_controlnetPromax.safetensors']], FaceDetailer:['x', ['y']], UltralyticsDetectorProvider:['x', ['y']], SAMLoader:['x', ['y']]};
  await page.route('https://render.test/**', async r => { const u = new URL(r.request().url());
    const oi = u.pathname.match(/^\/object_info\/(\w+)$/); if(oi){ const d = OI[oi[1]]; return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify(d ? {[oi[1]]:{input:{required:{[d[0]]:[d[1]]}}}} : {}) }); }
    if(u.pathname==='/upload/image'){ const body = r.request().postDataBuffer(), m = body.toString('latin1').match(/filename="([^"]+)"/); UPS.push({name:m && m[1], body}); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({name:m && m[1]}) }); }
    if(u.pathname==='/prompt'){ GRAPHS.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({prompt_id:'p' + GRAPHS.length}) }); }
    const hi = u.pathname.match(/^\/history\/(\w+)$/); if(hi){ const g = GRAPHS[GRAPHS.length - 1], save = Object.keys(g).find(k => g[k].class_type==='SaveImage');
      return r.fulfill({ contentType:'application/json', headers:H, body:JSON.stringify({[hi[1]]:{status:{status_str:'success'}, outputs:{[save]:{images:[0, 1, 2, 3].map(i => ({filename:'ch1_0000' + i + '_.png', subfolder:'RenderDeck/mannequin', type:'output'}))}}}}) }); }
    if(u.pathname==='/view' && u.searchParams.get('filename')==='Anime_Female_A.fbx') return r.fulfill({ contentType:'application/octet-stream', headers:H, body:fs.readFileSync(FBX) });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/svg+xml', headers:H, body:'<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1344"><rect width="768" height="1344" fill="#fff"/><rect x="330" y="80" width="110" height="1200" fill="#c33"/></svg>' });
    r.fulfill({ status:404, headers:H, body:'' }); });
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  await page.goto('https://app.test/host.html');
  await page.evaluate(() => localStorage.setItem('render-deck-v1', JSON.stringify({servers:[{url:'https://render.test', name:'Render'}]})));
  await page.goto('https://app.test/host.html'); const fr = page.frame({url:/mannequin\.html/});
  await fr.waitForFunction(() => window.MQ && MQ.her, null, {timeout:30000}); await page.waitForTimeout(800);
  const S0 = await fr.evaluate(() => ({fit:MQ.FIT, bt:MQ.ST.btags, hair:MQ.ST.hair, look:MQ.ST.look, paint:getComputedStyle(document.querySelector('.paintbox')).display, title:document.querySelector('.bar h1').textContent}));
  ok(S0.fit && S0.paint==='none' && /Ellie/.test(S0.title), '🪞 opens in Match her body mode, with no painting box: ' + S0.title);
  ok(S0.bt.breasts==='large breasts' && S0.hair.style==='long' && S0.hair.len===0.8 && S0.hair.bangs==='blunt' && S0.look.dress.includes('black dress') && S0.look.ecol.includes('purple eyes'), '…her body, hair and look start from her tags: ' + JSON.stringify({bt:S0.bt, hair:S0.hair, dress:S0.look.dress, eyes:S0.look.ecol}));
  await fr.waitForFunction(() => document.querySelector('#ghost').style.display==='block' && /^data:/.test(document.querySelector('#ghost').src), null, {timeout:10000}).catch(() => {});
  const g = () => fr.evaluate(() => { const im = document.querySelector('#ghost'), r = im.getBoundingClientRect(), s = document.querySelector('#stage canvas').getBoundingClientRect(); return {on:im.style.display, data:/^data:/.test(im.src), w:Math.round(r.width), h:Math.round(r.height), cx:Math.round(r.left + r.width / 2 - s.left), sw:Math.round(s.width), sh:Math.round(s.height), bot:Math.round(r.bottom - s.top), op:im.style.opacity}; });
  const G1 = await g(); await page.screenshot({path:path.join(__dirname, 'out', 'mqfit_front.png')});
  ok(G1.on==='block' && G1.data && Math.abs(G1.cx - G1.sw / 2) < 3 && G1.h > G1.sh * 0.6 && G1.h < G1.sh && Math.abs(G1.w / G1.h - 111 / 1201) < 0.02 && G1.op==='0.5', '…her front picture, cut to her outline, lies over the mannequin at her height, centred, half see-through: ' + JSON.stringify(G1));
  await fr.click('#turn [data-t="90"]'); await page.waitForTimeout(400);
  await page.screenshot({path:path.join(__dirname, 'out', 'mqfit_side.png')});
  ok(await fr.evaluate(() => Math.abs(MQ.yaw + Math.PI / 2) < 1e-6 && /eye_090/.test(MQ.GH.url)), 'Side turns her to show her left, the side her eye_090 picture shows');
  await fr.evaluate(() => { const r = document.querySelector('#g_op'); r.value = 0; r.dispatchEvent(new Event('input', {bubbles:true})); }); await page.waitForTimeout(200);
  ok((await g()).on==='none', 'Her picture at 0% hides it');
  await fr.evaluate(() => { const b = [...document.querySelectorAll('#btags [data-g="breasts"]')].find(x => x.dataset.tag==='huge breasts'); b.click(); }); await page.waitForTimeout(200);
  await fr.selectOption('#hgt', '69'); await page.waitForTimeout(100);
  ok(await fr.evaluate(() => MQ.ST.shape.cm===175.3 && /5′ 9″ · 175 cm/.test(document.querySelector('#hgt').selectedOptions[0].textContent)), '📏 Height picks 5′ 9″ and keeps it in cm: ' + await fr.evaluate(() => MQ.ST.shape.cm));
  await fr.evaluate(() => { const b = [...document.querySelectorAll('#btags [data-g="build"]')].find(x => x.dataset.tag==='curvy'); b.click(); }); await page.waitForTimeout(100);
  ok(await fr.evaluate(() => MQ.ST.shape.cm===175.3 && MQ.ST.shape.hips > 1.1), '…and stays when another body tag is picked');
  await fr.click('#fituse'); await page.waitForTimeout(200);
  const M = await page.evaluate(() => GOT.filter(x => x.rdmq==='fit').pop());
  ok(M && M.id==='Ellie' && M.shape.bust===1.7 && M.shape.cm===175.3 && M.btags.breasts==='huge breasts' && M.hair.style==='long' && /^1girl, curvy, huge breasts/.test(M.tags) && /goth/.test(M.tags) && !/large breasts/.test(M.tags) && /black dress/.test(M.tags) && /very long hair/.test(M.tags),
    '✓ Give her this body hands her shape, hair, look and her tags (body ones made new, her own words kept) to the Library: ' + JSON.stringify(M && {shape:M.shape, tags:M.tags}));
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); if(fail.length){ console.log(fail.length + ' failed'); process.exit(1); } console.log('all passed');
})();
