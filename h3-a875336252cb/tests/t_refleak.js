// 👥 characters' pictures never land in 🖼 Ref images, and a 🔄 swap's own settings (people's pictures, Pika Flex LoRA, 6 steps) never stick
// in the form (Jordan 2026-11-19: Jinx wasn't in the words, yet two of her pictures were Ref Image 1 and 2, and the swap LoRA was still on).
// Run: NODE_PATH=$(npm root -g) node tests/t_refleak.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', rt => rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}));
  // a saved state from before the fix: the form holds Jinx's two pictures as shot refs (words don't name them) plus a real ref the words name, and the swap LoRA
  const media = {}; ['j1', 'j2', 'f1', 'u1'].forEach(k => media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
  const old = {pcs:[{name:'Render', url:R, on:true, speed:1}], media, lib:[{id:'Lj', kind:'char', name:'Jinx', pics:['j1', 'j2']}, {id:'Lf', kind:'char', name:'Fae', pics:['f1']}],
    cast:[{n:1, kind:'char', who:'Jinx', lib:'Lj', pics:['j1', 'j2']}, {n:2, kind:'char', who:'Fae', lib:'Lf', pics:['f1']}],
    f:{prompt:'<Subject 2> holds <Ref Image 3> up.', ref:true, imgs:[{id:'j1', on:true, desc:'', keep:''}, {id:'j2', on:true, desc:'', keep:''}, {id:'u1', on:true, desc:'an umbrella', keep:''}],
      loras:[{name:'pika_h3_flex_ref2va_v1_bf16.safetensors', str:1, words:''}, {name:'AFK.safetensors', str:0.8, words:''}], steps:6}};
  await page.addInitScript(o => { if(!sessionStorage.getItem('seeded')){ localStorage.clear(); localStorage.setItem('h3deck', JSON.stringify(o)); sessionStorage.setItem('seeded', '1'); } window.H3_PCS = o.pcs; }, old);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => window.H3 && H3.S, null, {timeout:20000});
  let U = await page.evaluate(() => ({imgs:H3.S.f.imgs.map(r => r.id), prompt:H3.S.f.prompt, loras:H3.S.f.loras.map(l => l.name), steps:H3.S.f.steps}));
  ok(U.imgs.join()==='u1', 'saved shot: the leaked Jinx pictures are gone, the named ref stays: ' + U.imgs);
  ok(U.prompt==='<Subject 2> holds <Ref Image 1> up.', 'its <Ref Image 3> closes up to <Ref Image 1>: ' + U.prompt);
  ok(U.loras.join()==='AFK.safetensors' && !U.steps, 'saved shot: the swap LoRA and its 6 steps are gone: ' + JSON.stringify(U));

  // tapping a 🔄 swap clip loads the take it was swapped from, not the swap's own pictures / LoRA
  U = await page.evaluate(() => { const S = H3.S, base = JSON.parse(JSON.stringify(S.takes[0] || {}));
    const src = {id:'tS', prompt:'<Subject 2> waves.', seconds:5, model:S.f.model, turbo:S.f.turbo, loras:[{name:'AFK.safetensors', str:0.8, words:''}], steps:'', imgs:[], vids:[], auds:[], follow:[], pins:[], pieces:[], state:'done'};
    const sw = Object.assign({}, src, {id:'tW', prompt:'🔄 Jinx in for the woman', loras:[{name:'pika_h3_flex_ref2va_v1_bf16.safetensors', str:1, words:''}], steps:6,
      imgs:[{id:'j1', cast:1, desc:'', keep:'exact'}, {id:'j2', cast:1, desc:'', keep:'exact'}], vids:[{file:{filename:'x.mp4'}, sound:true, start:0}], swap:{text:'x', ppl:[{n:1}]}, redo:{src:'tS', swap:true}});
    S.takes.unshift(sw, src); S.f.prompt = 'something else'; H3.useAgain(sw, true);
    const a = {imgs:S.f.imgs.map(r => r.id), prompt:S.f.prompt, loras:S.f.loras.map(l => l.name), steps:S.f.steps};
    // a swap whose source is gone: the form is left alone
    S.takes.splice(1, 1); S.f.prompt = 'mine'; S.f.imgs = []; S.f.loras = []; H3.useAgain(sw, true);
    const b = {imgs:S.f.imgs.map(r => r.id), prompt:S.f.prompt, loras:S.f.loras.map(l => l.name)};
    // an ordinary take that somehow carries character-marked pictures: only its own come in
    const t2 = Object.assign({}, src, {id:'t2', prompt:'<Subject 1> sits.', imgs:[{id:'j1', cast:1, desc:'', keep:'exact'}, {id:'u1', desc:'an umbrella', keep:'', rk:1}]}); H3.useAgain(t2, true);
    const c = S.f.imgs.map(r => r.id);
    // a take made while her pictures had leaked in (no marks, words don't name them)
    const t3 = Object.assign({}, src, {id:'t3', prompt:'<Subject 1> sits by <Ref Image 2>.', imgs:[{id:'j2', desc:'', keep:'', rk:1}, {id:'u1', desc:'an umbrella', keep:'', rk:2}]}); H3.useAgain(t3, true);
    return {a, b, c, d:{imgs:S.f.imgs.map(r => r.id), prompt:S.f.prompt}}; });
  ok(U.a.imgs.length===0 && U.a.prompt==='<Subject 2> waves.' && U.a.loras.join()==='AFK.safetensors' && !U.a.steps, 'tapped swap clip loads its source take: ' + JSON.stringify(U.a));
  ok(U.b.imgs.length===0 && U.b.prompt==='mine' && U.b.loras.length===0, 'swap with no source left: the form stays as it was: ' + JSON.stringify(U.b));
  ok(U.c.join()==='u1', 'character-marked pictures never become ref images: ' + U.c);
  ok(U.d.imgs.join()==='u1' && U.d.prompt==='<Subject 1> sits by <Ref Image 1>.', 'a leaked take loads without her picture, numbers close up: ' + JSON.stringify(U.d));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
