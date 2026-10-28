// 🪑 Object Creator (Jordan 2026-10-27): the Character Creator's screen and steps for props, minus the character-only parts.
// Step 1 words (or a picture it is in), tags, its real height; step 2 Qwen-Image-Edit draws it alone on white (or takes it out
// of the picture); step 3 the AFKJ redraw with line art, no face fix; step 4 MiniMax with no skeleton (its turn lined up from
// its outline); step 5 the finish, no face fix. Saved to the Object Library (its own folder) and listed apart in 📚 Library.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const V = g => Object.values(g), of = (g, c) => V(g).filter(n => n.class_type===c);
// every link points at a node that is there
const links = g => { const errs = []; for(const [id, n] of Object.entries(g)) for(const [k, v] of Object.entries(n.inputs)) if(Array.isArray(v) && typeof v[0]==='string' && !g[v[0]]) errs.push(id + '.' + k + ' -> ' + v[0]); return errs; };
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'), 'utf8');
  const PIC = fs.readFileSync(path.join(__dirname, 'fixtures', 'cc_short.png'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:375, height:812}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' / ')));
  page.on('dialog', d => d.accept());
  await page.route('https://app.test/**', r => { const u = new URL(r.request().url()); if(u.pathname.endsWith('.txt')) return r.fulfill({ contentType:'text/plain', body:'' }); return r.fulfill({ contentType:'text/html', body:html }); });
  await page.route('https://jordo-desktop.test/**', r => r.fulfill({ contentType:'image/png', headers:{'access-control-allow-origin':'*'}, body:PIC }));
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  await page.click('#openSettings'); await page.click('#testBtn'); await page.evaluate(() => closeSheets());
  ok(await page.evaluate(() => { const t = $('#tabs'); return t.scrollWidth <= t.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll('#tabs button').length===7; }), 'seven tabs fit a 375 px phone with no sideways scroll');
  // a character first, so the two lists can be told apart
  await page.click('#tabs [data-tab="cc"]'); await page.waitForTimeout(200); await page.evaluate(() => { ccChar().name = 'Pinky'; save(); ccDraw(true); });
  await page.click('#tabs [data-tab="obj"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => S.tab==='obj' && !$('#cc').hidden && /Object Creator/.test($('.cctop h1').textContent) && document.querySelectorAll('.ccstep').length===5 && !$('.ccstep[data-cstep="lora"]') && /New object/.test($('.ccchips').textContent) && !/Pinky/.test($('.ccchips').textContent)), '🪑 Object Creator opens with its own list (no Pinky), five steps and no 🎓 LoRA card');
  ok(await page.evaluate(() => $('[data-cc="go"]').disabled && /Make it/.test($('[data-cc="go"]').textContent)), '▶ Make it waits for words or a picture');
  await page.click('.ccstep[data-cstep="ref"] summary');
  await page.fill('[data-ccf="name"]', 'Chair'); await page.fill('[data-ccf="desc"]', 'a wooden library chair with a red velvet cushion'); await page.fill('[data-ccf="tags"]', 'chair, wooden chair, red cushion'); await page.fill('[data-ccf="h"]', '0.9');
  ok(await page.evaluate(() => { const c = ccChar(); return c.obj && c.name==='Chair' && c.h===0.9 && /velvet/.test(c.desc) && !$('[data-cc="go"]').disabled; }), 'step 1 keeps its name, words, tags and height (0.9 m), and ▶ Make it is ready without a picture');
  await page.evaluate(() => { CM_SENT.length = 0; }); await page.click('[data-cc="go"]');
  await page.waitForFunction(() => { const P = ccP(ccChar()); return P && P.src; }, null, {timeout:8000});
  const G = await page.evaluate(() => CM_SENT.map(g => JSON.parse(JSON.stringify(g))));
  const full = G.find(g => of(g, 'UNETLoader').length && /qwen/i.test(of(g, 'UNETLoader')[0].inputs.unet_name)), red = G.find(g => of(g, 'UpscaleModelLoader').length);
  ok(full && !links(full).length && !of(full, 'LoadImage').length, 'step 2 is Qwen-Image-Edit, drawn from the words alone: ' + (full ? links(full).join('; ') : 'none sent'));
  if(full){ const enc = V(full).find(n => /TextEncodeQwenImageEdit/.test(n.class_type)).inputs, wh = of(full, 'EmptyImage')[0].inputs, cut = of(full, 'RemoveBackground');
    ok(/^Draw a wooden library chair with a red velvet cushion alone on this plain white page/.test(enc.prompt) && /No people/.test(enc.prompt) && wh.color===16777215 && wh.width===928 && wh.height===1664 && cut.length===1 && of(full, 'ImageScale')[0].inputs.width===864, 'step 2: "Draw … alone on this plain white page" on a white 928×1664 page, 864×1536 out, pure white round it'); }
  ok(red && !links(red).length, 'step 3 is a whole graph');
  if(red){ const pos = of(red, 'CLIPTextEncode').map(n => n.inputs.text);
    ok(!of(red, 'FaceDetailer').length && of(red, 'KSampler')[0].inputs.denoise===0.45 && of(red, 'ControlNetApplyAdvanced')[0].inputs.strength===0.6 && /AFKJ/.test(of(red, 'LoraLoader')[0].inputs.lora_name), 'step 3: the AFKJ redraw 0.45 with line art 0.6, and no face fix');
    ok(/no humans, still life, object focus/.test(pos[0]) && /wooden chair/.test(pos[0]) && !/1girl|standing|arms at sides/.test(pos[0]) && /1girl, 1boy, person/.test(pos[1]), 'step 3: its tags with "no humans, still life, object focus"; people kept out'); }
  const P = await page.evaluate(() => { const P = ccP(ccChar()); return {obj:P.obj, ctl:P.ctl, orbRig:P.orbRig, faces:P.faces, orb:P.orb.length, lk:P.lk.length, ccobj:P.cc.obj, name:P.name}; });
  ok(P.obj && !P.ctl && !P.orbRig && !P.faces && P.orb===9 && P.lk===48 && P.ccobj && /🪑 Chair/.test(P.name), 'step 4 has no skeleton to lead it, no faces, the same 9 clips and 48 angles: ' + JSON.stringify(P));
  const pr = await page.evaluate(() => { const P = ccP(ccChar()); return P.orb.map(o => cmPoseOrbPrompt(o)); });
  ok(/turntable/.test(pr[0]) && /rigid/.test(pr[0]) && /telephoto/.test(pr[0]) && pr.slice(1).every(t => /straight up and then straight down/.test(t) && /never turns/.test(t)) && !pr.some(t => /\b(her|she)\b/i.test(t)), "MiniMax's words are for an object: a turntable turn, then up and down from each side, rigid, no her or she");
  const og = await page.evaluate(() => { const P = ccP(ccChar()), o = P.orb[0]; return [cmOrbCtl(P, o), cmOrbCtl(P, P.orb[1]), cmPoseOrbGraph(cmFlKits()[0], 'x.png', cmPoseOrbPrompt(o), cmPosePicks(o), 'p', P.mw, P.mh).g]; });
  ok(!og[0] && !og[1] && !of(og[2], 'MiniMaxH3FunControlNetApply').length, 'its clips have no pose guide');
  // the eye-level turn comes back: lined up from its outline, then each side's up-and-down clip starts from that side
  const pk = await page.evaluate(async () => { const P = ccP(ccChar()), o = cmEyeOrb(P); o.urls = Array.from({length:31}, (_, n) => 'https://jordo-desktop.test/view?filename=turn_' + n + '.png'); await cmAutoPick(P, o);
    const v = P.views.find(x => x.ring===1 && x.i===2 && !x.look); return {pick:o.pick, frame:cmPoseFrame(P, v)}; });
  ok(pk.pick && pk.pick.length===8 && /turn_\d+\.png/.test(pk.frame || ''), 'its eye-level turn is lined up from its outline, so the sides can start: ' + JSON.stringify(pk));
  const fin = await page.evaluate(() => { const P = ccP(ccChar()), v = P.lk.find(h => h.ring===1 && h.i===2); return ccFinishGraph(ccIllKits()[0], P.cc, v, 'side.png', 'front.png', 'p', P.seed).g; });
  ok(!links(fin).length && !of(fin, 'FaceDetailer').length && of(fin, 'KSampler')[0].inputs.denoise===0.3 && /from side/.test(of(fin, 'CLIPTextEncode')[0].inputs.text) && !/looking/.test(of(fin, 'CLIPTextEncode')[0].inputs.text) && of(fin, 'JoinImageWithAlpha').length===1, 'step 5: repaint 0.3 with "from side", no face fix, saved see-through');
  // all in: saved to the Object Library with its height
  await page.evaluate(() => { const P = ccP(ccChar()); P.views.concat(P.mids).forEach(v => v.url = 'https://jordo-desktop.test/view?filename=a_' + v.ring + '_' + v.i + (v.mid ? 'm' : '') + '.png'); P.lk.forEach(h => h.url = 'https://jordo-desktop.test/view?filename=f_' + h.ring + '_' + h.i + (h.mid ? 'm' : '') + '.png'); P.orb.forEach(o => { o.urls = o.urls.length ? o.urls : ['https://jordo-desktop.test/view?filename=o.png']; delete o.err; delete o.making; }); save(); ccDraw(true); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => /All 5 steps done · 48 angles/.test($('#ccTxt').textContent) && /Make it again/.test($('[data-cc="go"]').textContent)), 'all 48 in: every step done');
  await page.fill('[data-ccf="h"]', '0.95');
  ok(await page.evaluate(() => ccChar().h===0.95), 'its height can still change once it is made');
  await page.evaluate(() => { CCV.lib = {pc:'https://jordo-desktop.test', list:[], objs:[], kinds:true, at:Date.now()}; ccDraw(true); });
  ok(await page.evaluate(() => /Object Library/.test($('#ccLib').textContent) && !$('[data-cc="libsave"]').disabled), '📚 Save it to the library is ready');
  await page.click('[data-cc="libsave"]'); await page.waitForTimeout(150);
  const LE = await page.evaluate(() => JSON.parse(JSON.stringify(CCV.libLast)));
  ok(LE.kind==='obj' && LE.name==='Chair' && LE.pics.length===48 && LE.meta.kind==='obj' && LE.meta.height===0.95 && /no humans, still life, object focus/.test(LE.meta.prompt) && !LE.meta.lora, 'it goes to the Object Library: 48 see-through angles, 0.95 m tall, its tags: ' + JSON.stringify(LE.meta).slice(0, 200));
  await page.click('[data-cc="libtab"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => S.tab==='lib' && /🪑 Objects/.test($('#cc').textContent) && /Chair/.test($('#cc').textContent) && /0.95 m/.test($('#cc').textContent)), '📚 Library lists it under 🪑 Objects with its height');
  await page.click('[data-cc="libopen"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => /0.95 m tall/.test($('.cclibone').textContent) && !!$('[data-cc="lib3d"]')), 'tapping it shows its height, 🧊 Open in 3D');
  await page.click('[data-cc="libdel"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => !CCV.lib.objs.length), '🗑 takes it out');
  // a picture with other things in it: Qwen takes the object out of it
  await page.click('#tabs [data-tab="obj"]'); await page.waitForTimeout(200); await page.click('[data-cc="new"]'); await page.waitForTimeout(100); await page.evaluate(() => { const d = $('.ccstep[data-cstep="ref"]'); if(!d.open) d.open = true; });
  await page.setInputFiles('#ccPick', {name:'room.png', mimeType:'image/png', buffer:PIC}); await page.waitForTimeout(300);
  await page.fill('[data-ccf="desc"]', 'the brass lamp on the desk');
  const pg = await page.evaluate(async () => { const c = ccChar(), k = Object.assign({}, ocFullKit(), {enc:'TextEncodeQwenImageEditPlus'}), plus = ocFullGraph(k, 'room.png', c, 'p', 1).g, one = ocFullGraph(ocFullKit(), 'room.png', c, 'p', 1).g;
    const t = g => Object.values(g).find(n => /TextEncodeQwenImageEdit/.test(n.class_type)).inputs; return {plus:t(plus), one:t(one).prompt, img:Object.values(plus).filter(n => n.class_type==='LoadImage').length}; });
  ok(pg.img===1 && /^Take the brass lamp on the desk from picture 2 and show it alone on the plain white page of picture 1/.test(pg.plus.prompt) && pg.plus.image1 && pg.plus.image2 && /Leave out everything else/.test(pg.plus.prompt), 'from a picture: "Take … from picture 2" onto the white page of picture 1 (Qwen keeps just that object)');
  ok(/^Show only the brass lamp on the desk from this picture/.test(pg.one), 'and an older Qwen-Image-Edit gets the one-picture wording');
  // the character tab still has only her
  await page.click('#tabs [data-tab="cc"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => /Pinky/.test($('.ccchips').textContent) && !/Chair|No name/.test($('.ccchips').textContent.replace('Pinky', '')) && /Character Creator/.test($('.cctop h1').textContent) && !ccChar().obj), '🧍 Character Creator still shows only the characters');
  await page.goto('https://app.test/'); await page.waitForTimeout(400); await page.click('#tabs [data-tab="obj"]'); await page.goto('https://app.test/'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !$('#cc').hidden && S.tab==='obj' && /Object Creator/.test($('.cctop h1').textContent)), 'left on 🪑 Object Creator, the app reopens on it');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
