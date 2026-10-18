// Suggest tags: Florence-2 PromptGen on Render reads a character's pictures and offers the Danbooru tags it saw,
// ranked by how many pictures agree, minus tags about the picture (background, framing) and ones the card already has.
// The first time it says the model is a one-off download and asks before starting it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const RENDER = 'https://jordo-desktop.test';
const TAGS = ['1boy\t0\t900\t', 'solo\t0\t890\t', 'black_hair\t0\t800\t', 'short_hair\t0\t790\t', 'red_eyes\t0\t700\t', 'black_coat\t0\t600\t', 'gloves\t0\t500\t',
  'white_background\t0\t880\t', 'simple_background\t0\t870\t', 'looking_at_viewer\t0\t860\t', 'scarf\t0\t400\t', 'masterpiece\t9\t999\t'].join('\n');
const C = a => [a];
const OI = {CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['oneObsession_v24.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal'])}}},
  LoraLoader:{input:{required:{lora_name:C([])}}}, LoadImage:{input:{required:{image:C([])}}},
  DownloadAndLoadFlorence2Model:{input:{required:{model:C(['microsoft/Florence-2-base','MiaoshouAI/Florence-2-base-PromptGen-v2.0']), precision:C(['fp16','bf16','fp32'])}}},
  Florence2ModelLoader:{input:{required:{model:C([])}}}, // nothing in models/LLM yet
  Florence2Run:{input:{required:{task:C(['caption','prompt_gen_tags'])}}}, 'ShowText|pysssss':{input:{required:{text:['STRING',{forceInput:true}]}}}};
const OUT = {'1':'1boy, solo, black hair, short hair, red eyes, black coat, white background, simple background, scarf', '2':'1boy, black_hair, red eyes, gloves, looking at viewer, nonsense tag'};
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message)); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/tags.txt', r => r.fulfill({ contentType:'text/plain', body:TAGS }));
  await page.route('https://app.test/chars.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  const sent = []; let polls = 0;
  await page.route(RENDER + '/**', async r => {
    const u = new URL(r.request().url());
    if(u.pathname==='/object_info') return r.fulfill({ json:OI });
    if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG });
    if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
    if(u.pathname==='/prompt'){ const b = JSON.parse(r.request().postData()); sent.push(b); return r.fulfill({ json:{prompt_id:'t' + sent.length, number:0, node_errors:{}} }); }
    if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = sent[+id.slice(1) - 1].prompt; if(++polls < 2) return r.fulfill({ json:{} });
      const outputs = {}; Object.entries(g).filter(([, n]) => n.class_type==='ShowText|pysssss').forEach(([k], i) => outputs[k] = {text:[OUT[String(i + 1)]]});
      return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs}} }); }
    r.fulfill({ status:404, body:'' });
  });
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  await page.click('#openSettings'); await page.fill('#server', RENDER + '/'); await page.evaluate(() => document.querySelector('#connectBtn').click());
  await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on'));
  await page.evaluate(srv => { closeSheets(); S.chars = [{id:'c1', name:'Levi', tags:'1boy, black coat', color:'#ff5ca8',
    views:[{id:'v1', angle:'front', img:'levi_front.png', url:srv + '/view?filename=levi_front.png', home:srv}, {id:'v2', angle:'side', img:'levi_side.png', url:srv + '/view?filename=levi_side.png', home:srv}]}]; save(); }, RENDER);
  await page.click('#charBtn'); await page.click('#charBody [data-open="c1"]');
  const note = await page.textContent('#charBody');
  ok(/downloads it from Hugging Face \(about 1\.1 GB, once\)/.test(note) && await page.isVisible('#charBody [data-ch="sugdl"]'), 'before the tagger is on Render, it says the first time is a 1.1 GB download');
  await page.click('#charBody [data-ch="sugdl"]');
  ok(dialogs.length===1 && /1\.1 GB/.test(dialogs[0]), 'it asks before starting the download: ' + dialogs[0]);
  await page.waitForSelector('#charBody [data-addtag]', {timeout:8000});
  const g = sent[0].prompt, cls = Object.values(g).map(n => n.class_type);
  ok(sent.length===1 && sent[0].client_id==='rd-tagger' && cls.filter(c => c==='Florence2Run').length===2 && cls.filter(c => c==='DownloadAndLoadFlorence2Model').length===1, 'one job on Render: one tagger, a read per picture');
  const run = Object.values(g).filter(n => n.class_type==='Florence2Run').map(n => n.inputs);
  ok(run.every(x => x.task==='prompt_gen_tags') && run[0].keep_model_loaded===true && run[1].keep_model_loaded===false && Object.values(g).find(n => n.class_type==='DownloadAndLoadFlorence2Model').inputs.model==='MiaoshouAI/Florence-2-base-PromptGen-v2.0', 'tags task, model kept loaded between pictures, the PromptGen model');
  const chips = await page.$$eval('#charBody [data-addtag]', b => b.map(x => x.dataset.addtag + '=' + x.textContent.trim()));
  ok(chips[0].startsWith('black_hair=black hair 2/2') && chips[1].startsWith('red_eyes=') && chips.length===5, 'tags both pictures agree on come first, shown as typed: ' + chips.join(' | '));
  ok(!chips.some(c => /background|looking|solo|1boy|black_coat|nonsense/.test(c)), 'no picture tags, no tags already on the card, no made-up tags');
  await page.click('#charBody [data-addtag="black_hair"]');
  ok(await page.evaluate(() => S.chars[0].tags)==='1boy, black coat, black hair' && !(await page.$('#charBody [data-addtag="black_hair"]')), 'tapping one adds it to the tags and takes it off the list');
  ok((await page.inputValue('#charBody [data-cf="tags"]'))==='1boy, black coat, black hair', 'the tags box shows it');
  await page.click('#charBody [data-ch="sugall"]');
  const all = await page.evaluate(() => S.chars[0].tags);
  ok(/red eyes/.test(all) && /gloves/.test(all) && /scarf/.test(all) && /short hair/.test(all) && !(await page.$('#charBody [data-addtag]')), 'Add all adds the rest: ' + all);
  ok(await page.evaluate(() => S.taggerOn.includes('https://jordo-desktop.test')) && await page.isVisible('#charBody [data-ch="sugg"]') && !(await page.$('#charBody [data-ch="sugdl"]')), 'after the first run it no longer warns about the download');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
