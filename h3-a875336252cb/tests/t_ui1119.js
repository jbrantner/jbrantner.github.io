// 🧹 Jordan's UI notes (2026-11-19), bare bones: Films header with ⚙, ▶ Play + ＋ Clip + 🛠 Editing tools, tracks again, a selected clip
// shows only its takes; Prompt box with 👥 Characters that open into their own chips, ＋ Line / ＋ LoRA / ⬇ Import LoRA; ref images with
// 🎬 Start on it; hidden Check/Randomize/Fill/strength; Custom quality always on; subject tiles; two model choices with boost always on;
// 480p only; no Renders list under Films; ⬇ Import LoRA sends to both PCs. Run: NODE_PATH=$(npm root -g) node tests/t_ui1119.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8099);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}, hasTouch:true});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const DL = [], TOK = [];
  for(const U of [R, M]) await page.route(U + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p.startsWith('/object_info')) return J({UNETLoader:{input:{required:{unet_name:[['singularityV2X10eros_prismPIKA.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors']]}}}, MiniMaxH3ReferenceToVideo:{input:{required:{}}}, LoraLoaderModelOnly:{input:{required:{lora_name:[['a.safetensors']]}}}});
    if(p.startsWith('/history')) return J({}); if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/renderdeck/download'){ DL.push([U, JSON.parse(rt.request().postData())]); return J({name:'cool.safetensors'}); }
    if(p==='/renderdeck/token'){ TOK.push(U); return J({token:true}); }
    if(p==='/renderdeck/jobs') return J({token:U===R, jobs:DL.filter(d => d[0]===U).map((d, i) => ({id:'j' + i, kind:'loras', name:'cool.safetensors', status:'downloading', done:5, total:10}))});
    return rt.fulfill({status:404, headers:H, body:''}); });
  const F = n => ({filename:n, subfolder:'Output_Render/H3Deck/x', type:'output'});
  const base = {model:'singularityV2X10eros_prismPIKA', turbo:false, loras:[], imgs:[], vids:[], auds:[], follow:[], seconds:5, seed:1, dir:'H3Deck/x', pc:R, w:864, h:480, state:'done', film:'s2', pieces:[{deliv:120, gen:124, ctx:0, state:'done', pid:'p', file:F('p.mp4')}]};
  const tk = (id, x) => Object.assign({}, base, {id, name:'h3_' + id, prompt:'<Subject 1> walks in.', final:F(id + '.mp4'), t:1000}, x || {});
  const deck = {bare:true, pcs:[{name:'Render', url:R, on:true}, {name:'Main', url:M, on:true}], tab:'films', takes:[tk('tA'), tk('tB'), tk('tA2', {t:2000})], forms:{}, casts:{}, up:{},
    lib:[{id:'L1', kind:'char', name:'Brianna', stand:'a woman', desc:'tall, long curly hair', pics:['m1'], keep:'exact'}, {id:'L2', kind:'char', name:'Marcus', stand:'a man', desc:'', pics:['m2'], keep:'exact'},
      {id:'W1', kind:'wear', name:'White tee', what:'outfit', pics:[]}, {id:'W2', kind:'wear', name:'Red dress', what:'outfit', pics:[]}],
    media:{m1:{id:'m1', kind:'img', name:'b.png', w:64, h:96, thumb:'', tc:1}, m2:{id:'m2', kind:'img', name:'m.png', w:64, h:96, thumb:'', tc:1}}};
  const ed = {films:[{id:'s1', name:'Intro', movie:'mv', tracks:[{id:'t0', clips:[]}], pps:24, canvas:'wide'}, {id:'s2', name:'Brianna Outfits', movie:'mv', pps:24, canvas:'wide', tracks:[{id:'t1', clips:[{id:'a', take:'tA', in:0, out:5, dur:5, at:0, alts:['tA2']}, {id:'b', take:'tB', in:0, out:5, dur:5, at:5}]}, {id:'t2', clips:[]}]}],
    movies:[{id:'mv', name:'Acceptance', shots:['s1', 's2']}], nav:{v:'film', film:'s2'}};
  await page.addInitScript(([r, m, d, e]) => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:true, speed:1.26}]; window.FILM_PCS = window.H3_PCS; if(sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear();
    localStorage.setItem('h3deck', JSON.stringify(d)); localStorage.setItem('h3edit', JSON.stringify(e)); }, [R, M, deck, ed]);
  await page.goto('http://127.0.0.1:8099/index.html'); await page.waitForFunction(() => window.H3 && H3.S && document.querySelector('#filmTab iframe'), null, {timeout:20000});
  await page.waitForFunction(() => H3.families().length >= 2, null, {timeout:20000}); await page.waitForTimeout(1500);
  const fr = () => page.frames().find(f => /\/film\//.test(f.url()));
  const vis = (F, sel) => F.$$eval(sel, es => es.some(e => e.offsetParent!==null || (e.getClientRects().length > 0 && getComputedStyle(e).display!=='none')));
  // ---- Films
  let FR = fr(); await FR.evaluate(() => FILM.selTake ? FILM.selTake('tA') : 0); await page.waitForTimeout(600); FR = fr();
  ok(await vis(FR, '[data-act="shotSet"]'), 'a ⚙ beside the breadcrumb');
  ok(!(await vis(FR, '.shotnav')) && !(await vis(FR, 'input[data-fname]')), 'no "Shot 2 of 2" row and no name row');
  const tv = await FR.$$eval('.transport > *', es => es.filter(e => getComputedStyle(e).display!=='none').map(e => e.dataset.act || e.className));
  ok(tv.join()==='play,edon,addClip,edTools', 'under the picture: ▶ Play, ＋ Clip, 🛠 Editing tools only (' + tv + ')');
  ok(!(await vis(FR, '.tools [data-act="carry"]')) && !(await vis(FR, '#prevBox')), 'the clip tools and preview line are behind 🛠');
  await FR.click('[data-act="edTools"]'); await page.waitForTimeout(250); FR = fr();
  ok(await vis(FR, '.tools [data-act="carry"]') && await vis(FR, '[data-act="toStart"]') && await vis(FR, '.tools [data-act="addTrack"]'), '🛠 opens the transport extras, the clip tools and ＋ Track');
  ok(!(await vis(FR, '.tools [data-act="addClip"]')), 'no second ＋ Clip in the tools');
  ok(await FR.$$eval('#tl .trk', rs => rs.filter(r => getComputedStyle(r).display!=='none').length)===2, 'both tracks show (tracks again)');
  ok(await vis(FR, '#vstrip [data-act="useTake"]') && !(await vis(FR, '[data-act="keepOnly"]')), 'a selected clip shows its takes, no ✓ Keep only this');
  ok(await FR.$eval('#pbBox', e => e.innerHTML.trim()==='') && await FR.$eval('#selNote', e => e.textContent.trim()===''), 'no 📝 clip words box and no clip info line');
  await FR.click('[data-act="shotSet"]'); await page.waitForTimeout(150);
  ok(await vis(FR, '#sheetCard input[data-fname]') && await vis(FR, '#sheetCard [data-act="delFilm"]'), '⚙ holds the shot name and 🗑 delete');
  await FR.fill('#sheetCard input[data-fname]', 'Renamed'); await FR.click('#sheetCard .btns [data-act="shotSetDone"]'); await page.waitForTimeout(150);
  ok(/Renamed/.test(await FR.$eval('.crumb', e => e.textContent)), 'renaming in ⚙ updates the breadcrumb');
  ok(await page.evaluate(() => document.getElementById('filmFormNote').offsetParent===null), 'no "New takes go into…" note');
  // ---- the form
  await page.evaluate(() => { H3.S.cast = [{n:1, kind:'char', lib:'L1', stand:'a woman', who:'Brianna', pics:['m1'], keep:'exact', attrs:['W1']}, {n:2, kind:'char', lib:'L2', stand:'a man', who:'Marcus', pics:['m2'], keep:'exact'}];
    Object.assign(H3.S.f, {prompt:'<Subject 1> walks in.', shuffle:1, fillRefs:true, quality:false, qstyle:'cinema', boost:false, nsfw:true, mp:0.94, model:H3.families().find(x => /prism/i.test(x.key)).key, rstr:{c:{s:0, e:50}}}); H3.S.open = Object.assign(H3.S.open || {}, {bModel:true, bCanvas:true});
    document.getElementById('prompt').value = H3.S.f.prompt; H3.drawAll(); });
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => [...document.querySelectorAll('#bShot h3 > span')].filter(e => e.offsetParent!==null).map(e => e.textContent).join('|')).then(s => /^Prompt/.test(s)), 'the Shot box is called Prompt');
  const ch = await page.$$eval('#descBar .charrow [data-dexp]', bs => bs.map(b => b.textContent + (b.style.background ? '*' : '')));
  ok(ch.join()==='Brianna*,Marcus', '👥 Characters: a chip per subject, filled when the words name them (' + ch + ')');
  ok(!(await page.$('#descBar [data-tag]')), 'their chips stay folded until tapped');
  await page.click('#descBar [data-dexp="1"]'); await page.waitForTimeout(100);
  const row = await page.$$eval('#descBar .descrow:not(.charrow) button', bs => bs.map(b => b.textContent));
  ok(row[0]==='↧ Into the words' && row.some(x => /White tee/.test(x)) && !row.some(x => /Red dress/.test(x)), 'a tap opens ↧ Into the words and only what is on her, not every Library outfit (' + row + ')');
  const tb = await page.$$eval('#tagBar button', bs => bs.map(b => Object.keys(b.dataset)[0]));
  ok(tb.slice(0, 3).join()==='dlg,lrn,lorimp' && !tb.includes('shot') && !tb.includes('acn') && !tb.includes('psn'), 'under the words: ＋ Line, ＋ LoRA, ⬇ Import LoRA only (' + tb + ')');
  ok(await page.evaluate(() => { const d = document.getElementById('descBar'); return d.nextElementSibling===document.getElementById('tagBar'); }), 'the buttons sit under the 👥 Characters');
  ok(!(await page.isVisible('#shotMore')) && !(await page.isVisible('#rstrBox')) && !(await page.isVisible('#startBox')), 'no Check / Randomize / Fill spare, no Reference strength, no separate Start on a picture');
  const f = await page.evaluate(() => { const f = H3.S.f; return {q:f.quality, qs:f.qstyle, b:f.boost, n:f.nsfw, sh:f.shuffle, fr:f.fillRefs, mp:f.mp, m:f.model, fin:f.finOn, at:f.finAt, rs:Object.keys(f.rstr || {}).length}; });
  ok(f.q===true && f.qs==='' && f.b===true && f.n===false && !f.sh && f.fr===false && f.mp===0.41 && !f.rs, 'Custom quality on, boost on, no 🔥, no shuffle/fill/strength, 480p (' + JSON.stringify(f) + ')');
  ok(/prism/i.test(f.m) && f.fin===false, 'a PIKA form stays PRISM PIKA (no finish)');
  ok(!(await page.$('#styleChips [data-q]')) && !(await page.$('#styleChips [data-qs]')), 'no quality on/off or presets');
  await page.click('#modelPick [data-mpk="combo"]'); await page.waitForTimeout(150);
  const g = await page.evaluate(() => ({m:H3.S.f.model, fin:H3.S.f.finOn, at:H3.S.f.finAt, t:H3.S.f.turbo, len:document.getElementById('lenBox').closest('section').id}));
  ok(/ref2va/.test(g.m) && g.fin===true && g.at===0.5 && g.t===false, 'H3 Reference → PIKA finish: the reference model with Finish on PIKA at 50% (' + JSON.stringify(g) + ')');
  ok(g.len==='bModel', 'Length sits in the Model box');
  ok(!(await page.isVisible('#model')) && !(await page.isVisible('#boostSw')) && !(await page.isVisible('#nsfwSw')) && !(await page.isVisible('#sizeRow')), 'no model list, boost or 🔥 switch, no size chips');
  ok(!(await page.isVisible('#takesH')) && !(await page.isVisible('#takes')), 'no Renders list under Films');
  ok(await page.$$eval('#castList .ctile', b => b.length)===2 && !(await page.$('#castList .cast')), '👥 Subjects: one tile per subject');
  await page.click('#castList [data-cexp="1"]'); await page.waitForTimeout(100);
  ok(await page.isVisible('#castList .cast [data-cast="wear"]') && !(await page.$('#castList [data-cast="wild"]')) && !(await page.$('#castList [data-cast="act"]')), 'a tap opens the card for outfits/attributes, no 🎲 Wildcard, no ＋ Action/Pose');
  // ---- 🖼 ref image: Start on it
  await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const b = await new Promise(o => c.toBlob(o, 'image/png'));
    const id = await H3.addMedia(new File([b], 'r.png', {type:'image/png'}), 'img'); H3.S.f.imgs.push({id, on:true, shot:true}); H3.drawAll(); });
  await page.waitForTimeout(150);
  const sb = await page.$('#srefBox [data-startpic]');
  ok(!!sb, 'a ref image has 🎬 Start on it');
  if(sb){ await sb.click(); await page.waitForTimeout(150); console.log(await page.evaluate(() => JSON.stringify({sp:H3.S.f.startPic, fl:H3.S.f.fl, first:!!H3.S.f.first, sm:H3.S.f.sm, imgs:H3.S.f.imgs.map(r => [r.id, r.on, !!H3.S.media[r.id]])}))); ok(await page.evaluate(() => !!H3.S.f.startPic) && /: on/.test(await page.textContent('#srefBox [data-startpic]')), 'tapping it opens the video on that picture'); }
  // ---- ⬇ Import LoRA: both PCs
  await page.click('#tagBar [data-lorimp]'); await page.waitForTimeout(200);
  ok(/both PCs/.test(await page.textContent('#lorGo')), 'the sheet downloads onto both PCs');
  await page.fill('#lorUrl', 'civitai.com/models/123'); await page.click('#lorGo'); await page.waitForTimeout(600);
  ok(DL.length===2 && DL.every(d => d[1].kind==='loras' && d[1].url==='https://civitai.com/models/123') && new Set(DL.map(d => d[0])).size===2, 'the link goes to Render and Main as a LoRA');
  await page.waitForTimeout(800);
  ok(/Render/.test(await page.textContent('#lorJobs')) && /Main/.test(await page.textContent('#lorJobs')) && /No Civitai key on Main/.test(await page.textContent('#lorTok')), 'progress per PC and which PC has no Civitai key');
  await page.fill('#lorKey', 'abc'); await page.click('#lorKeyGo'); await page.waitForTimeout(400);
  ok(TOK.length===2, 'the Civitai key is saved on both');
  // ---- ⚙ Show all the tools brings the old layout back
  await page.evaluate(() => { H3.S.bare = false; H3.save(); H3.drawAll(); }); await page.waitForTimeout(200);
  ok(await page.isVisible('#model') && await page.isVisible('#takesH') && await page.$$eval('#castList .cast', b => b.length)===2, 'Show all tools: model list, Renders and full subject cards are back');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
