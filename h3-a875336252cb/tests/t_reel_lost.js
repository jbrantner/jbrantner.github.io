// 🛟 Reel's takes lost from the phone (Jordan 2026-11-23: "What just happened?", 18 options said Not found): found again from the PCs'
// history by the take folder's last 4 letters, backed up to h3reel_takes.json, and Reel's save leaves out H3 Deck's Library pictures.
// Run: NODE_PATH=$(npm root -g) node tests/t_reel_lost.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
const OLDID = 't' + Date.UTC(2026, 10, 22, 18, 32, 40).toString(36) + 'qrfm', VIEWSUB = 'Output_Main/H3Deck/h3_202611221832_qrfm';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..', '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8053);
  const br = await chromium.launch(); let pushed = null;
  const handle = async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info') return J({});
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/history') return J({
      p1:{prompt:[10, 'p1', {}, {}, []], status:{completed:true}, outputs:{'9':{images:[{filename:'h3_202611230120_ab12_00001_.mp4', subfolder:'Output_Render\\H3Deck\\h3_202611230120_ab12', type:'output'}], animated:[true]}}},
      p2:{prompt:[12, 'p2', {}, {}, []], status:{completed:true}, outputs:{'9':{images:[{filename:'h3_202611230125_zz99_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_202611230125_zz99', type:'output'}]}}},
      p3:{prompt:[11, 'p3', {}, {}, []], status:{completed:true}, outputs:{'9':{images:[{filename:'x.png', subfolder:'Output_Render', type:'output'}]}}}});
    if(p==='/view' && u.searchParams.get('subfolder')===VIEWSUB && u.searchParams.get('filename')==='piece_01_00001_.mp4') return rt.fulfill({status:200, contentType:'video/mp4', headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    if(p==='/userdata/h3reel_takes.json' && rt.request().method()==='POST'){ pushed = rt.request().postData(); return J({}); }
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); };
  const pe = await br.newPage(); pe.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pe.route(R + '/**', handle);
  await pe.addInitScript(r => { window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; if(sessionStorage.getItem('done')) return; sessionStorage.setItem('done', 1); localStorage.clear();
    localStorage.setItem('h3deck', JSON.stringify({lib:[{id:'L1', kind:'char', name:'Mia', pics:['m1']}], media:{m1:{id:'m1', kind:'img', thumb:'data:image/jpeg;base64,' + 'A'.repeat(20000)}}, tsav:Date.now()}));
    window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await pe.goto('http://127.0.0.1:8053/h3-a875336252cb/index.html?engine=1');
  await pe.waitForFunction(() => window.H3Engine && H3Engine.findLost, null, {timeout:20000});
  const e = await pe.evaluate(async OLD => { const E = H3Engine, o = {};
    o.before = E.info('tq7xab12').state; o.n = await E.findLost([{id:'tq7xab12', words:'she waves'}, {id:'tq7xcd34', words:'gone for good'}]);
    const i = E.info('tq7xab12'); o.after = i.state; o.url = i.url; o.words = i.words; o.other = E.info('tq7xcd34').state;
    o.again = await E.findLost([{id:'tq7xab12'}]); o.old = await E.findLost([{id:OLD, words:'older'}]); o.oldI = E.info(OLD);
    H3.save(); await new Promise(r => setTimeout(r, 400)); const sv = localStorage.getItem('h3reel_engine') || ''; o.slim = !sv.includes('AAAAAAAAAAAAAAAA') && sv.includes('tq7xab12'); o.libHere = (H3.S.lib || []).some(L => L.id==='L1');
    await new Promise(r => setTimeout(r, 4800)); return o; }, OLDID);
  ok(e.old===1 && e.oldI.state==='done' && /h3_202611221832_qrfm/.test(decodeURIComponent(e.oldI.url)), 'one that left the history (ComfyUI restarted) is found from its id\'s time in the shared output folders ' + JSON.stringify([e.old, e.oldI.url]));
  ok(e.before==='gone' && e.n===1 && e.after==='done', 'a lost option is found on the PC by its folder name and plays again ' + JSON.stringify(e));
  ok(/ab12/.test(e.url) && e.words==='she waves', 'its video and words: ' + e.url);
  ok(e.other==='gone', "one that isn't on the PC stays Not found");
  ok(e.again===0, 'nothing more to find: nothing changes');
  ok(e.slim && e.libHere, "Reel's save leaves out H3 Deck's Library pictures (still there in Reel)");
  ok(pushed && pushed.includes('tq7xab12'), "Reel's takes get a copy on the PC (h3reel_takes.json)");
  // a fresh phone: the copy on the PC brings them back
  const body = pushed; await pe.unroute(R + '/**');
  await pe.route(R + '/**', rt => { const p = new URL(rt.request().url()).pathname; if(p==='/userdata/h3reel_takes.json' && rt.request().method()==='GET') return rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body}); return handle(rt); });
  await pe.evaluate(() => { localStorage.removeItem('h3reel_engine'); });
  await pe.reload(); await pe.waitForFunction(() => window.H3Engine, null, {timeout:20000});
  const b = await pe.evaluate(async () => { for(let i = 0; i < 40 && H3Engine.info('tq7xab12').state==='gone'; i++) await new Promise(r => setTimeout(r, 250)); return H3Engine.info('tq7xab12').state; });
  ok(b==='done', 'with the phone copy gone, the PC copy brings the take back: ' + b);
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
