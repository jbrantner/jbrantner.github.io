// LoRA trigger words in the prompt: drawn in the LoRA colour behind a see-through textarea, and the first time one is
// typed (or picked from the suggestions) its LoRA switches on, or is added. Switching it off again sticks. Works in Hidden.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('dialog', d => d.accept());
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.goto('https://app.test/'); await page.evaluate(() => testMode()); await page.waitForTimeout(300);
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  const L = await page.evaluate(() => { closeSheets(); const l = info.lora; S.loraWords = {[l[0]]:'AFKJ Style', [l[1]]:'laura_rd'}; S.blocks = S.blocks.filter(b => b.type!=='lora'); save(); render(); return l; });
  await page.fill('#prompt', 'AFKJ Style, 1girl, smiling');
  ok(await page.$eval('#promptHi .lw', e => e.textContent)==='AFKJ Style', 'the trigger word is coloured');
  ok(await page.evaluate(f => S.blocks.some(b => b.type==='lora' && b.lora===f && b.on), L[0]), 'its LoRA is added and switched on');
  await page.evaluate(f => { S.blocks.find(b => b.lora===f).on = false; save(); renderBlocks(); }, L[0]);
  await page.type('#prompt', ' outdoors');
  ok(await page.evaluate(f => !S.blocks.find(b => b.lora===f).on, L[0]), 'switched off by hand, it stays off while you keep typing');
  await page.evaluate(f => { S.blocks.find(b => b.lora===f).on = false; }, L[1]).catch(() => {});
  await page.evaluate(f => { const b = addBlock('lora', true); b.lora = f; b.on = false; save(); renderBlocks(); }, L[1]);
  await page.type('#prompt', ', laura_rd');
  ok(await page.evaluate(f => S.blocks.find(b => b.lora===f).on, L[1]) && await page.$$eval('#promptHi .lw', e => e.length)===2, 'typing another trigger switches its LoRA block on');
  ok(!(await page.evaluate(() => lwFind('xafkj stylex').length)) && await page.evaluate(() => lwFind('afkj style').length===1), 'only whole words count, any case');
  await page.evaluate(() => switchMode());
  await page.fill('#prompt', 'laura_rd at the beach');
  ok(await page.$eval('#promptHi .lw', e => e.textContent)==='laura_rd' && await page.evaluate(f => S.blocks.some(b => b.lora===f && b.on), L[1]), 'Hidden too');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close(); console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
