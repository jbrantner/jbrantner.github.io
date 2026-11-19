// ⬇ Import LoRA onto both PCs (Jordan 2026-11-19, "I want Lora on both computers"): a PC set to no new takes still gets the LoRA,
// and one that can't be reached gets the link / phone file when it comes back. Run: NODE_PATH=$(npm root -g) node tests/t_lorboth.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test', M = 'http://main.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8099);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}, hasTouch:true});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const DL = [], UP = []; let mainDown = false;
  for(const U of [R, M]) await page.route(U + '/**', rt => { const u = new URL(rt.request().url()), p = u.pathname, H = {'Access-Control-Allow-Origin':'*'}, J = o => rt.fulfill({status:200, contentType:'application/json', headers:H, body:JSON.stringify(o)});
    if(U===M && mainDown) return rt.abort();
    if(p==='/system_stats') return J({devices:[]}); if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p.startsWith('/object_info')) return J({LoraLoaderModelOnly:{input:{required:{lora_name:[['a.safetensors']]}}}});
    if(p.startsWith('/history')) return J({}); if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/renderdeck/download'){ DL.push([U, JSON.parse(rt.request().postData())]); return J({name:'cool.safetensors'}); }
    if(p==='/renderdeck/upload'){ UP.push([U, u.searchParams.get('name'), (rt.request().postDataBuffer() || []).length]); return J({name:u.searchParams.get('name')}); }
    if(p==='/renderdeck/jobs') return J({token:true, jobs:[]});
    return rt.fulfill({status:404, headers:H, body:''}); });
  const deck = {bare:true, pcs:[{name:'Render', url:R, on:true}, {name:'Main', url:M, on:false}], tab:'films', takes:[], forms:{}, casts:{}, up:{}, lib:[], media:{}};
  await page.addInitScript(([r, m, d]) => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}, {name:'Main', url:m, on:false, speed:1}]; window.FILM_PCS = window.H3_PCS; if(sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear();
    localStorage.setItem('h3deck', JSON.stringify(d)); }, [R, M, deck]);
  await page.goto('http://127.0.0.1:8099/index.html'); await page.waitForFunction(() => window.H3 && H3.S && H3.PC, null, {timeout:20000});
  await page.waitForFunction(([r, m]) => H3.PC[r] && H3.PC[r].online && H3.PC[m] && H3.PC[m].online, [R, M], {timeout:20000});
  const sheet = async () => { await page.evaluate(() => { document.querySelector('[data-lorimp]') ? document.querySelector('[data-lorimp]').click() : document.body.insertAdjacentHTML('beforeend', '<button data-lorimp="1" id="xx"></button>') || document.getElementById('xx').click(); }); await page.waitForTimeout(250); };
  // 1) Main set to no new takes still gets it
  await sheet(); ok(/both PCs/.test(await page.textContent('#lorGo')), 'button says both PCs while Main takes no new takes');
  await page.fill('#lorUrl', 'civitai.com/models/9'); await page.click('#lorGo'); await page.waitForTimeout(600);
  ok(DL.length===2 && new Set(DL.map(d => d[0])).size===2, 'the link went to Render AND Main (' + DL.map(d => d[0]) + ')');
  // 2) Main can't be reached: remembered, sent when it's back
  DL.length = 0; mainDown = true; await page.evaluate(m => { H3.PC[m].online = false; }, M);
  await page.fill('#lorUrl', 'https://civitai.com/models/10'); await page.click('#lorGo'); await page.waitForTimeout(800);
  ok(DL.length===1 && DL[0][0]===R, 'only Render got it while Main is off');
  ok(await page.evaluate(m => (H3.S.lorPend || []).filter(x => x.pc===m && x.u==='https://civitai.com/models/10').length===1, M), 'Main is remembered as waiting for the link');
  ok(/waiting for Main/.test(await page.textContent('#lorJobs')), 'the Downloads list says it waits for Main');
  // phone file while Main is off
  await page.setInputFiles('#lorPick', {name:'mine.safetensors', mimeType:'application/octet-stream', buffer:Buffer.alloc(1234, 7)}); await page.waitForTimeout(1200);
  ok(UP.length===1 && UP[0][0]===R, 'the phone file went to Render');
  ok(await page.evaluate(m => (H3.S.lorPend || []).some(x => x.pc===m && x.blob && x.name==='mine.safetensors'), M), 'and is kept on the phone for Main');
  mainDown = false; await page.waitForFunction(m => H3.PC[m].online, M, {timeout:30000}); await page.waitForTimeout(4000);
  ok(DL.some(d => d[0]===M && d[1].url==='https://civitai.com/models/10'), 'Main got the link when it came back');
  ok(UP.some(d => d[0]===M && d[1]==='mine.safetensors' && d[2] > 1234), 'Main got the phone file when it came back');
  ok(await page.evaluate(() => !(H3.S.lorPend || []).length), 'nothing is left waiting');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
