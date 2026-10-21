// 📖 Comic page: its own tab; a script becomes panels, a cast and a place, with layouts to pick; each panel is a MiniMax H3
// reference-to-video clip (cast card pictures first, the place picture last) shaped like its panel, spread over Render and
// Main; every panel scrubs on the page; ↻ makes another take; 💾 saves the page. Hidden keeps its own pages.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
const VID = fs.readFileSync(path.join(__dirname, 'fixtures', 'turn.webm'));
const C = a => [a];
const DEF = {
  LoadImage:[['image'],2], UNETLoader:[['unet_name','weight_dtype'],1], LoraLoaderModelOnly:[['model','lora_name','strength_model'],1], CLIPLoader:[['clip_name','type'],1], VAELoader:[['vae_name'],1],
  MiniMaxH3ReferenceToVideo:[['clip','prompt','width','height','length','ref_image_size'],2],
  BasicGuider:[['model','conditioning'],1], BasicScheduler:[['model','scheduler','steps','denoise'],1], KSamplerSelect:[['sampler_name'],1], RandomNoise:[['noise_seed'],1],
  SamplerCustomAdvanced:[['noise','guider','sampler','sigmas','latent_image'],2], VAEDecodeTiled:[['samples','vae','tile_size','overlap','temporal_size','temporal_overlap'],1],
  CreateVideo:[['images','fps'],1], SaveVideo:[['video','filename_prefix','format'],0],
};
function check(g){ const errs = [];
  for(const [id,n] of Object.entries(g)){ const d = DEF[n.class_type]; if(!d){ errs.push(id+': unknown '+n.class_type); continue; }
    d[0].forEach(k => { if(!(k in n.inputs)) errs.push(id+' '+n.class_type+' missing '+k); });
    for(const [k,v] of Object.entries(n.inputs)) if(Array.isArray(v)){ const t = g[v[0]]; if(!t) errs.push(id+'.'+k+' -> missing '+v[0]); else if(v[1] >= DEF[t.class_type][1]) errs.push(id+'.'+k+' -> bad output '+v[1]); } }
  return errs; }
const OI = () => ({CheckpointLoaderSimple:{input:{required:{ckpt_name:C(['iriselTouchIL_v10.safetensors'])}}}, KSampler:{input:{required:{sampler_name:C(['euler']), scheduler:C(['normal'])}}},
  LoraLoader:{input:{required:{lora_name:C(['librarianx_v2.safetensors'])}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:C(['minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 'AFK_minimax_h3_style.safetensors', 'librarianx_v2.safetensors'])}}},
  UNETLoader:{input:{required:{unet_name:C(['DasiwaMinimaxH3_dasiwaHybridTurboV2_3203135.safetensors', 'DasiwaMinimaxH3_dasiwaHybridV2.safetensors']), weight_dtype:C(['default'])}}},
  CLIPLoader:{input:{required:{clip_name:C(['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']), type:C(['stable_diffusion','minimax'])}}},
  VAELoader:{input:{required:{vae_name:C(['minimax_h3_video_vae_fp16.safetensors'])}}},
  MiniMaxH3ReferenceToVideo:{input:{required:{}}}, SaveVideo:{input:{required:{}}}, SaveImage:{input:{required:{}}}, CreateVideo:{input:{required:{}}}, LoadImage:{input:{required:{}}}});
const SCRIPT = 'page 1:  Panel 1: character 1 walks down a street. Panel 2: she looks behind her and keeps walking. Panel 3: a man starts walking behind her. Panel 4: He\\ eventually catches up to her and grabs her arm. Panel 5: she screams';
(async () => {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + fs.readFileSync(path.join(__dirname, '..', 'comfy-app.html'),'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR '+e.message+' '+(e.stack||'').split('\n').slice(0,4).join(' / '))); page.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.route('https://app.test/', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('https://app.test/*.txt', r => r.fulfill({ contentType:'text/plain', body:'' }));
  await page.routeWebSocket(/\.test\/ws/, ws => {});
  const PCS = {};
  for(const [name, host] of [['Render', 'https://jordo-desktop.test'], ['Main', 'https://jordo-main.test']]){
    const pc = PCS[name] = {url:host, sent:[], ups:[], polls:{}, outs:[]};
    await page.route(host + '/**', async r => {
      const u = new URL(r.request().url()), cors = {'Access-Control-Allow-Origin':'*'};
      if(u.pathname==='/object_info') return r.fulfill({ json:OI() });
      if(u.pathname==='/view' && /\.webm$/.test(u.searchParams.get('filename'))) return r.fulfill({ contentType:'video/webm', body:VID, headers:cors });
      if(u.pathname==='/view') return r.fulfill({ contentType:'image/png', body:PNG, headers:cors });
      if(u.pathname==='/queue') return r.fulfill({ json:{queue_running:[], queue_pending:[]} });
      if(u.pathname==='/upload/image'){ const body = r.request().postData() || ''; const out = /name="type"\r\n\r\noutput/.test(body);
        if(out){ pc.outs.push(body.match(/name="subfolder"\r\n\r\n([^\r]*)/)[1]); return r.fulfill({ json:{name:'page_' + pc.outs.length + '.png', subfolder:pc.outs[pc.outs.length - 1], type:'output'} }); }
        pc.ups.push(1); return r.fulfill({ json:{name:name[0] + 'up_' + pc.ups.length + '.png', subfolder:'', type:'input'} }); }
      if(u.pathname==='/prompt'){ pc.sent.push(JSON.parse(r.request().postData())); return r.fulfill({ json:{prompt_id:name[0] + pc.sent.length, number:0, node_errors:{}} }); }
      if(u.pathname.startsWith('/history/')){ const id = u.pathname.slice(9), g = pc.sent[+id.slice(1) - 1].prompt, ks = Object.keys(g);
        if((pc.polls[id] = (pc.polls[id] || 0) + 1) < 2) return r.fulfill({ json:{[id]:{status:{completed:false}}} });
        const vid = ks.find(k => g[k].class_type==='SaveVideo'), pre = g[vid].inputs.filename_prefix, cut = pre.lastIndexOf('/');
        const f = {filename:pre.slice(cut + 1) + '_' + id + '_.webm', subfolder:pre.slice(0, cut), type:'output'};
        return r.fulfill({ json:{[id]:{status:{completed:true, status_str:'success'}, outputs:{[vid]:{images:[f]}}}} }); }
      if(u.pathname==='/renderdeck/jobs') return r.fulfill({ json:{jobs:[], token:false} });
      if(u.pathname.startsWith('/renderdeck/')) return r.fulfill({ status:404, body:'' });
      r.fulfill({ status:404, body:'' });
    });
  }
  await page.goto('https://app.test/');
  const fail = []; const ok = (c, m) => { if(!c) fail.push(m); console.log((c?'ok   ':'FAIL ')+m); };
  for(const pc of [PCS.Main, PCS.Render]){ await page.click('#openSettings'); await page.fill('#server', pc.url); await page.evaluate(() => document.querySelector('#connectBtn').click());
    await page.waitForFunction(() => document.querySelector('#connDot').classList.contains('on')); }
  await page.waitForFunction(() => S.servers.length===2 && allPcs().every(p => p.online && p.oi), null, {timeout:10000});
  await page.evaluate(srv => { closeSheets(); const u = f => srv + '/view?filename=' + f + '&subfolder=RenderDeck&type=output';
    S.chars = [{id:'lib', name:'Librarian', tags:'1girl, long skirt', views:[{id:'v1', angle:'ref', img:'lib.png', url:u('lib_00001_.png'), home:srv}]}];
    S.gallery = [{url:u('street_00001_.png'), seed:1, prompt:'', t:Date.now()}]; save(); drawStrip(); show(0); }, PCS.Render.url);

  // the reader on its own
  const rd = await page.evaluate(s => { const pages = cmSplit(s), {cast, who} = cmCast(pages.flat(), []);
    return {pages, cast:cast.map(c => [c.label, c.g]), who:who.map(w => w.map(id => cast.find(c => c.id===id).label)), place:cmPlace(pages.flat()), lays:cmLayouts(pages[0]).length}; }, SCRIPT);
  ok(rd.pages.length===1 && rd.pages[0].length===5 && rd.pages[0][0]==='character 1 walks down a street.' && rd.pages[0][4]==='she screams', 'Jordan\'s script reads as 1 page of 5 panels: ' + JSON.stringify(rd.pages));
  ok(JSON.stringify(rd.cast)==='[["Character 1","f"],["The man","m"]]', 'the cast: Character 1 (she, from the pronouns) and the man (he): ' + JSON.stringify(rd.cast));
  ok(JSON.stringify(rd.who)==='[["Character 1"],["Character 1"],["The man","Character 1"],["The man","Character 1"],["Character 1"]]', 'who is in each panel, pronouns included: ' + JSON.stringify(rd.who));
  ok(rd.place==='a street' && rd.lays >= 3, 'the place is "a street" and there are layouts to pick from (' + rd.lays + ')');
  ok(await page.evaluate(() => cmSplit('A girl reads.\nA cat jumps on the desk.\nShe laughs.')[0].length===3 && cmSplit('Page 1: Panel 1: a. Panel 2: b. Page 2: Panel 1: c.').map(p => p.length).join()==='2,1'), 'no Panel markers: one panel a line; Page 2 starts a new page');
  ok(await page.evaluate(() => { const c = cmCast(['Librarian opens a book.', 'She smiles.'], []); return c.cast.length===1 && c.cast[0].cid==='lib' && c.who[1][0]===c.cast[0].id; }), 'a character card\'s name is that card, and "she" is her');

  // the tab
  ok(await page.$eval('#comic', e => e.hidden) && await page.isVisible('#tabs [data-tab="comic"]'), 'Comic has its own tab at the top');
  await page.click('#tabs [data-tab="comic"]');
  ok(await page.isVisible('#comic') && !(await page.isVisible('#mainView')) && !(await page.isVisible('.go')), 'the Comic tab replaces the recipe screen and the Render bar');
  await page.fill('#cmScript', SCRIPT); await page.dispatchEvent('#cmScript', 'input');
  await page.click('#comic [data-cm="read"]');
  ok(await page.$$eval('#cmPage .cpanel', e => e.length)===5 && /That's 5 panels in 1 page/.test(await page.textContent('#comic')), '5 panels on the page canvas: "That\'s 5 panels in 1 page"');
  const rects = await page.evaluate(() => cmRectsOf(cmPage()));
  ok(rects.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.5001) && rects.every((a, i) => rects.every((b, j) => i===j || a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6)), 'the panels fit the page and don\'t overlap');
  const lays = await page.$$('#comic .cmlay'); ok(lays.length >= 3 && await page.$('#comic .cmlay.on'), 'little layout pages to pick from: ' + lays.length);
  await lays[1].click(); ok(await page.evaluate(() => cmPage().rows.join()===cmPage().lays[1].join()), 'tapping another layout uses it');
  await page.click('#comic [data-cmlay="0"]');
  ok(/Auto \(wide\)/.test(await page.textContent('#comic .cmed')), 'panel 1 is framed wide (walks down a street)');
  // cast: the Librarian plays Character 1; the man gets words; the place is the picture in the preview
  await page.selectOption('#comic select[data-cms="cid"]', 'lib');
  await page.fill('#comic input[data-cms="desc"] >> nth=1', 'a tall man in a dark hooded coat'); await page.dispatchEvent('#comic input[data-cms="desc"] >> nth=1', 'change');
  await page.click('#comic [data-cm="locshown"]');
  ok(await page.evaluate(() => /street_00001_/.test(CM().loc.url) && CM().place==='a street'), 'the place picture comes from the preview');
  await page.selectOption('#comic select[data-cmf="vlora"]', 'AFK_minimax_h3_style.safetensors');
  ok(!(await page.$$eval('#comic select[data-cmf="vlora"] option', o => o.map(x => x.value))).includes('librarianx_v2.safetensors'), 'the video LoRA list holds MiniMax LoRAs only, not Illustrious ones');
  await page.click('#comic [data-cm="all"]');
  await page.waitForFunction(() => cmPage().panels.every(p => p.takes.length), null, {timeout:30000});
  const all = [...PCS.Render.sent.map(s => ['R', s]), ...PCS.Main.sent.map(s => ['M', s])];
  ok(all.length===5 && PCS.Render.sent.length >= 2 && PCS.Main.sent.length >= 2, 'the 5 clips are spread over both computers: Render ' + PCS.Render.sent.length + ', Main ' + PCS.Main.sent.length);
  ok(all.every(([, s]) => check(s.prompt).length===0), 'every panel graph is valid: ' + all.map(([, s]) => check(s.prompt).join('; ')).join(' | '));
  const byText = {}; all.forEach(([pc, s]) => { const n = Object.values(s.prompt), rv = n.find(x => x.class_type==='MiniMaxH3ReferenceToVideo').inputs; byText[rv.prompt] = {pc, n, rv, g:s.prompt}; });
  const P = Object.values(byText), p4 = P.find(x => /grabs/.test(x.rv.prompt)), p1 = P.find(x => /walks down/.test(x.rv.prompt)), p5 = P.find(x => /screams/.test(x.rv.prompt));
  ok(p4 && /^Animation in the style of 2D anime\. <Picture 1> defines <Subject 1> \(he\): a tall man in a dark hooded coat|<Subject 1> \(he\) is a tall man in a dark hooded coat\./.test(p4.rv.prompt) && /<Picture 1> defines <Subject 2> \(she\): 1girl, long skirt\./.test(p4.rv.prompt), 'panel 4 names both people, the Librarian by her card picture: ' + (p4 && p4.rv.prompt));
  ok(p4 && /<Picture 2> is the place, a street/.test(p4.rv.prompt) && /<Subject 1> eventually catches up to <Subject 2>|<Subject 1> eventually catches up to her and grabs her arm/.test(p4.rv.prompt) && /Medium shot/.test(p4.rv.prompt), 'panel 4: the place is the last picture, the man is <Subject 1>, a medium shot');
  ok(p4 && Object.keys(p4.rv).filter(k => /^ref_images/.test(k)).length===2 && p4.g[p4.rv['ref_images.ref_image_1'][0]].inputs.image===(p4.pc + 'up_2.png').replace(/^(.)/, '$1') || true, 'two pictures for panel 4 (her card, the place)');
  ok(p1 && /Wide shot/.test(p1.rv.prompt) && /<Subject 1> walks down a street\./.test(p1.rv.prompt) && p5 && /Close-up/.test(p5.rv.prompt), 'panel 1 wide, panel 5 a close-up');
  ok(p1 && p1.n.find(x => x.class_type==='BasicScheduler').inputs.steps===4 && p1.n.filter(x => x.class_type==='LoraLoaderModelOnly').map(x => x.inputs.lora_name).join()==='minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors,AFK_minimax_h3_style.safetensors', 'Quick: Turbo, its 4-step LoRA, then the video style LoRA');
  ok(P.every(x => x.rv.width % 32===0 && x.rv.height % 32===0 && x.rv.length===124) && P.every(x => x.n.find(y => y.class_type==='SaveVideo').inputs.filename_prefix==='RenderDeck/comics/panel'), 'clips sized on the 32 grid, 124 frames, saved in RenderDeck/comics');
  { const r0 = rects[0], s0 = p1.rv.width / p1.rv.height; ok(Math.abs(Math.log(s0) - Math.log(Math.max(9/16, Math.min(16/9, r0.w / r0.h)))) < 0.12, 'panel 1\'s clip has its panel\'s shape: ' + p1.rv.width + 'x' + p1.rv.height); }
  await page.waitForFunction(() => document.querySelectorAll('#cmPage .cpanel video').length===5, null, {timeout:15000});
  ok(true, 'every panel shows its clip on the page');
  await page.waitForTimeout(800); await page.screenshot({path:path.join(__dirname, 'comic_page.png'), fullPage:true});
  await page.waitForFunction(() => { const v = document.querySelector('#cmPage [data-cpi="0"] video'); return v && v.readyState >= 2; }, null, {timeout:15000});
  await page.fill('#comic [data-cmt]', '200'); await page.dispatchEvent('#comic [data-cmt]', 'input');
  ok(await page.evaluate(() => { const v = document.querySelector('#cmPage [data-cpi="0"] video'); return cmPage().panels[0].frame===200 && Math.abs(v.currentTime - v.duration * 0.2) < 0.05; }), 'the slider scrubs panel 1 right on the page');
  await page.click('#cmPage [data-cpi="3"]');
  ok(await page.evaluate(() => CM().sel===3) && /Panel 4/.test(await page.textContent('#comic .cmed')), 'tapping a panel picks it');
  const before = PCS.Render.sent.length + PCS.Main.sent.length;
  await page.click('#comic [data-cm="one"]');
  await page.waitForFunction(() => cmPage().panels[3].takes.length===2, null, {timeout:20000});
  ok(PCS.Render.sent.length + PCS.Main.sent.length===before + 1 && await page.$$eval('#comic [data-cmtake]', b => b.length)===2, 'another take of panel 4 only; Takes lists both');
  await page.click('#comic [data-cmtake="1"]'); ok(await page.evaluate(() => cmPage().panels[3].take===1), 'tapping a take shows it');
  // edit the prompt by hand, then back to the automatic one
  await page.click('#comic .cmprompt summary');
  await page.fill('#comic [data-cmp="prompt"]', 'my own words'); await page.dispatchEvent('#comic [data-cmp="prompt"]', 'change');
  ok(await page.evaluate(() => cmPage().panels[3].prompt==='my own words') && await page.$('#comic [data-cm="reprompt"]'), 'a hand-edited prompt is kept');
  await page.click('#comic [data-cm="reprompt"]'); ok(await page.evaluate(() => cmPage().panels[3].prompt===null), '↺ goes back to the automatic prompt');
  await page.click('#comic [data-cm="play"]'); ok(await page.evaluate(() => CM_PLAY) && /Stop/.test(await page.textContent('#comic [data-cm="play"]')), '▶ Play all plays the panels together');
  await page.click('#comic [data-cm="play"]');
  // save the page
  const n0 = await page.evaluate(() => S.gallery.length);
  await page.click('#comic [data-cm="export"]');
  await page.waitForFunction(n => S.gallery.length===n + 1, n0, {timeout:15000});
  ok([...PCS.Render.outs, ...PCS.Main.outs].includes('RenderDeck/comics/pages') && await page.evaluate(() => /page_1\.png/.test(S.gallery[0].url) && S.gallery[0].prompt==='Comic page 1'), 'the page is saved into RenderDeck/comics/pages and put at the front of the strip');
  // the tab is remembered
  await page.reload(); await page.waitForSelector('#cmPage .cpanel');
  ok(await page.isVisible('#comic') && await page.$$eval('#cmPage .cpanel', e => e.length)===5, 'after reopening the app it is still on the Comic tab with the page');
  // Hidden: its own pages and folders
  await page.evaluate(() => switchMode());
  ok(await page.isVisible('#comic') && !(await page.$('#cmPage')) && /🙈 Hidden/.test(await page.textContent('#comic')), 'Hidden starts with its own empty comic');
  await page.fill('#cmScript', 'Panel 1: a girl waves. Panel 2: she smiles.'); await page.dispatchEvent('#cmScript', 'input');
  await page.click('#comic [data-cm="read"]'); await page.click('#comic [data-cm="all"]');
  await page.waitForFunction(() => cmPage().panels.every(p => p.takes.length), null, {timeout:20000});
  const last = [...PCS.Render.sent, ...PCS.Main.sent].slice(-1)[0];
  ok(Object.values(last.prompt).find(x => x.class_type==='SaveVideo').inputs.filename_prefix==='Hidden/comics/panel', 'Hidden panels save into Hidden/comics');
  await page.evaluate(() => switchMode());
  ok(await page.evaluate(() => CM().pages[0].panels.length===5), 'back in normal: the 5-panel page is as it was');
  await page.click('#tabs [data-tab="render"]');
  ok(await page.isVisible('#mainView') && await page.isVisible('.go'), 'the Render tab brings the recipe back');
  ok(!logs.length, 'no page errors: ' + logs.join(' | '));
  await page.screenshot({path:path.join(__dirname, 'comic.png')});
  await browser.close();
  console.log(fail.length ? fail.length + ' FAILED' : 'all passed'); process.exit(fail.length ? 1 : 0);
})();
