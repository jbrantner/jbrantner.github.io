// 🔎 Check prompt on a ➕ carry-on shot (Jordan 2026-11-10): the checker never touches the [0s-1s] lead-in, only what comes after it.
// Run: NODE_PATH=$(npm root -g) node tests/t_check.js   (fake ComfyUI and a fake Ollama answered in the browser)
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'text/plain'}); r.end(b); }); }).listen(8023);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const chats = []; let answer = '';
  const fake = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(rt.request().method()==='OPTIONS') return rt.fulfill({status:204, headers:{'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*'}});
    if(p==='/api/chat'){ chats.push(JSON.parse(rt.request().postData())); return J({message:{content:answer}}); }
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')) return J({});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p==='/agent/status') return J({agent:1, comfy:'up', wanted:true});
    if(p.startsWith('/userdata/')) return rt.request().method()==='GET' ? rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}) : J({});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  await page.route(R + '/**', fake); await page.route(R + ':8443/**', fake);
  await page.addInitScript(r => { if(!sessionStorage.getItem('init')){ localStorage.clear(); sessionStorage.setItem('init', '1'); } window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8023/index.html'); await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
  const LEAD = '[0s-1s] she walks to the window, carrying on from the moment before.\n';
  const setShot = (txt, carry) => page.evaluate(([txt, carry]) => { const S = H3.S, f = S.f; if(carry){ S.media.mC = {id:'mC', kind:'vid', name:'➕', carry:{src:'tA', at:2, own:true}}; Object.assign(f, {fl:true, first:'mC'}); } else Object.assign(f, {fl:false, first:null});
    f.prompt = txt; document.querySelector('#prompt').value = txt; H3.drawAll(); }, [txt, carry]);
  const run = async () => { const n = chats.length; await page.evaluate(() => { H3.S.ck = null; document.querySelector('#ckBtn').click(); }); await page.waitForFunction(n => H3.S.ck && H3.S.ck.shot != null && !H3.S.ck.busy, n, {timeout:10000}).catch(() => {}); return chats[n]; };
  // a carry-on: the checker only sees what comes after the lead-in, and its rewrite of the first second is thrown away
  answer = JSON.stringify({verdict:'fix', issues:[], shot:'[0s-1s] she strolls across the room in a new way.\n[1s-] She slowly opens the window and leans out into the cool night air, her hair moving in the breeze.'});
  await setShot(LEAD + '[1s-] she opens the window', true);
  const q = await run(), shotSent = q && q.messages[1].content.split('SHOT:\n')[1].split('\n\nFULL PROMPT')[0];
  ok(q && !/walks to the window, carrying/.test(shotSent || '') && /^\[1s-\] she opens the window/.test(shotSent || '') && /NOT yours to change/.test(q.messages[1].content), 'the checker gets only the shot after the lead-in, and is told the lead-in is not its to change (' + JSON.stringify((shotSent || '').slice(0, 80)) + ')');
  const ck = await page.evaluate(() => H3.S.ck.shot);
  ok(ck.startsWith(LEAD) && /\[1s-\] She slowly opens the window/.test(ck) && !/strolls/.test(ck), 'the suggested shot keeps the lead-in word for word and only changes what comes after (' + JSON.stringify(ck) + ')');
  // 💬 a follow-up note keeps the lead-in too
  answer = JSON.stringify({verdict:'fix', issues:[], shot:'[1s-] She flings the window open fast.'});
  const n2 = chats.length; await page.evaluate(() => { H3.S.ckDraft = 'faster'; const t = document.querySelector('#ckAsk'); if(t) t.value = 'faster'; document.querySelector('[data-ck="ask"]').click(); });
  await page.waitForFunction(n => H3.S.ck && /flings/.test(H3.S.ck.shot || '') && !H3.S.ck.busy, n2, {timeout:10000}).catch(() => {});
  const ck2 = await page.evaluate(() => H3.S.ck.shot);
  ok(ck2===LEAD + '[1s-] She flings the window open fast.', '💬 a follow-up note keeps the lead-in as well (' + JSON.stringify(ck2) + ')');
  // 🎬 a cut on the action written with a [Shot 1] in front: the lead-in is still kept away from the checker
  answer = JSON.stringify({verdict:'fix', issues:[], shot:'[Shot 1] [0s-1s] something new.\n[Shot 2] [1s-] The camera cuts on the action to a close-up as she flings it open.'});
  await setShot('[Shot 1] ' + LEAD + '[Shot 2] [1s-] The camera cuts on the action to a close-up as she opens it', true); const qs = await run(), ss = await page.evaluate(() => H3.S.ck.shot);
  ok(qs && !/walks to the window, carrying/.test(qs.messages[1].content.split('SHOT:\n')[1].split('\n\nFULL PROMPT')[0]) && ss===('[Shot 1] ' + LEAD).replace(/\s*$/, '\n') + '[Shot 2] [1s-] The camera cuts on the action to a close-up as she flings it open.', '🎬 [Shot 1] in front: the lead-in still stays out of the checker (' + JSON.stringify(ss) + ')');
  // a plain shot that is not a carry-on is sent whole, as before
  answer = JSON.stringify({verdict:'fix', issues:[], shot:'[0s-5s] She dances in the rain.'});
  await setShot('[0s-5s] she dances', false); const q3 = await run();
  ok(q3 && /SHOT:\n\[0s-5s\] she dances/.test(q3.messages[1].content) && !/CARRIES ON/.test(q3.messages[1].content) && await page.evaluate(() => H3.S.ck.shot)==='[0s-5s] She dances in the rain.', 'a shot that is not a carry-on goes to the checker whole, as before');
  // 🎯 Pika (Jordan 2026-11-11): the clip length goes along, and the word range follows the model (PIKA fuller, vanilla shorter)
  ok(q3 && /CLIP LENGTH: \d+(\.\d+)? seconds/.test(q3.messages[1].content), 'the checker is told how long the clip is');
  await page.evaluate(() => { H3.S.f.model = 'singularityV2X10eros_prismPIKA'; H3.S.f.finOn = false; }); const q4 = await run();
  ok(q4 && /^MODEL: PIKA/.test(q4.messages[1].content) && /180 to 300 words/.test(q4.messages[1].content), 'PIKA asks for the fuller 180-300 word shot');
  await page.evaluate(() => { H3.S.f.model = 'minimax_h3_ref2va_pruned_int8_convrot'; }); const q5 = await run();
  ok(q5 && /^MODEL: VANILLA/.test(q5.messages[1].content) && /120 to 200 words/.test(q5.messages[1].content), 'vanilla asks for 120-200 words');
  // H3 speech tags from the checker pass through the app's prompt untouched (no timing tag taken from [English])
  const d = await page.evaluate(() => { const t = '[0s-3s] Mei (S1) whispers softly: <d>[English] Come here.</d> [3s-5s] She smiles.'; H3.S.f.prompt = t; document.querySelector('#prompt').value = t; H3.drawAll(); H3.S.f.h3 = true; try{ return document.querySelector('#h3Pre') ? (h3Peek(), document.querySelector('#h3Pre').textContent) : ''; }catch(e){ return 'ERR ' + e.message; } });
  ok(!d || /<d>\[English\] Come here\.<\/d>/.test(d), 'a <d>[English] …</d> line survives into what MiniMax gets (' + JSON.stringify(String(d).slice(0, 200)) + ')');
  const rules = fs.readFileSync(path.join(root, 'checker-rules.md'), 'utf8');
  ok(/# PIKA/.test(rules) && /# VANILLA THEN PIKA/.test(rules) && /\[0s-1s\] lead-in is fixed/.test(rules) && /CLIP LENGTH/.test(rules), 'checker-rules.md has the PIKA, VANILLA THEN PIKA, lead-in and clip-length rules');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
