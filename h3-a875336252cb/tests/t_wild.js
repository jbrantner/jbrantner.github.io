// 🎲 Wildcards: options kept apart from the Library, a fresh mix rolled per take, carried on, kept.
// Run: NODE_PATH=$(npm root -g) node tests/t_wild.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8047);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8047/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const prom = (t) => page.evaluate(([R, t]) => { t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', h1:'h1.png', h2:'h2.png', p2:'p2.png'}).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, imgs:nodes.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image)}; }, [R, t]);
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, prompt:'<Subject 1> walks to the window.', descOff:{}});
    for(const id of ['p1', 'h1', 'h2', 'p2']) H3.S.media[id] = {id, kind:'img', name:id + '.png', w:640, h:352, thumb:''};
    H3.S.lib = [{id:'Lmia', kind:'char', name:'Mia', stand:'a woman', desc:'', pics:['p2'], keep:'exact', what:''}];
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact', attrs:[]}];
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  // the tab
  await page.click('#tabs [data-tab="wild"]');
  ok(await page.evaluate(() => !document.querySelector('#wildTab').hidden && /Outfit/.test(document.querySelector('#wildTab').textContent)), '🎲 Wildcards tab shows its categories');
  await page.click('[data-wt="new:wear"]'); await page.fill('[data-wof="desc"]', 'a red silk slip dress'); await page.click('#sheetCard [data-close]');
  await page.click('[data-wt="new:wear"]'); await page.fill('[data-wof="desc"]', 'a grey knit sweater and jeans'); await page.click('#sheetCard [data-close]');
  await page.click('[data-wt="new:hair"]'); await page.fill('[data-wof="name"]', 'Silver bob');
  await page.fill('[data-wof="desc"]', 'large breasts'); ok(await page.evaluate(() => document.querySelector('#woBust').style.display!=='none'), 'breast words get the warning');
  await page.fill('[data-wof="desc"]', ''); await page.evaluate(() => { const A = H3.S.wlib.find(x => x.name==='Silver bob'); A.pics = ['h1']; }); await page.click('#sheetCard [data-close]');
  const W = await page.evaluate(() => ({n:H3.S.wlib.length, lib:H3.S.lib.length}));
  ok(W.n===3 && W.lib===1, 'options live apart from the 📚 Library: ' + JSON.stringify(W));
  // give Laura the wildcard
  await page.click('#tabs [data-tab="films"]');
  // (no Films frame in this test, so the form stays the wildcard one: put Laura back by hand)
  await page.evaluate(() => { H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact', attrs:[]}]; H3.S.f.prompt = '<Subject 1> walks to the window.'; H3.drawAll(); });
  await page.click('#castList [data-cn="1"] [data-cast="wild"]');
  await page.click('[data-ws="cat:wear"]'); await page.click('[data-ws="cat:hair"]'); await page.click('[data-ws="try"]');
  ok(await page.evaluate(() => /Outfit: .*Hair: Silver bob/.test(document.querySelector('#wsTry').textContent)), 'Try a roll shows a mix: ' + await page.evaluate(() => document.querySelector('#wsTry').textContent));
  await page.click('#sheetCard [data-close]');
  // rolls
  const rolls = await page.evaluate(() => { const o = new Set(); for(let i = 0; i < 40; i++){ const t = H3.wildMark(H3.snapshot()); o.add(t.wild[1].picks.map(p => p.label).join('|')); } return [...o]; });
  ok(rolls.length===2, 'takes roll different outfits: ' + rolls.join(' / '));
  const t1 = await page.evaluate(() => { let t; do { t = H3.wildMark(H3.snapshot()); } while(!/sweater/.test(t.wild[1].picks[0].label)); t.id = 'tA'; return t; });
  let P = await prom(t1);
  ok(/grey knit sweater and jeans/.test(P.p) && !/slip dress/.test(P.p), 'the rolled outfit is in the words');
  ok(!/is nude/.test(P.p), 'a rolled outfit dresses her');
  ok(P.imgs.includes('h1.png') && P.imgs.includes('p1.png'), 'the hair picture goes as an attribute picture: ' + P.imgs);
  ok(/hairstyle/.test(P.p), 'the hair is named as a hairstyle: ' + (P.p.match(/[^.]*hairstyle[^.]*\./) || [''])[0]);
  // no wildcard roll: base Laura only
  P = await prom(await page.evaluate(() => H3.snapshot()));
  ok(!/sweater|slip dress/.test(P.p) && !P.imgs.includes('h1.png'), 'a take with no roll is unchanged');
  // carry-on keeps the mix
  const same = await page.evaluate(t1 => { H3.S.takes.unshift(t1); const t = H3.snapshot(); t.carry = {src:t1.id}; H3.wildMark(t); H3.S.takes.shift(); return JSON.stringify(t.wild)===JSON.stringify(t1.wild) && t.wildFrom==='carry'; }, t1);
  ok(same, 'a carry-on keeps the clip before\'s mix');
  // who
  await page.evaluate(() => { H3.S.cast[0].wild.who = ['Lmia']; });
  const tw = await page.evaluate(() => H3.wildMark(H3.snapshot())); P = await prom(tw);
  ok(/<Subject 1> is Mia/.test(P.p) && P.imgs.includes('p2.png') && !P.imgs.includes('p1.png'), '🧑 Who: rolled Library character is sent instead: ' + P.imgs);
  ok(await page.evaluate(() => H3.S.cast[0].who==='Laura'), 'the film\'s cast itself is untouched');
  // keep
  await page.evaluate(t => { H3.S.takes.unshift(Object.assign(t, {id:'tK', state:'done', pieces:t.pieces.map(p => Object.assign(p, {state:'done'}))})); H3.drawAll(); }, tw);
  const kept = await page.evaluate(() => { const t = H3.S.takes[0], b = document.querySelector('[data-take="tK"] [data-act="wildKeep"]'); if(!b) return 'no button'; b.click(); const n = H3.wildMark(H3.snapshot()); return n.wildFrom==='keep' && JSON.stringify(n.wild)===JSON.stringify(t.wild) ? 'ok' : 'differs'; });
  ok(kept==='ok', '🔒 Keep this mix: new takes use it (' + kept + ')');
  { const tx = await page.evaluate(() => (document.querySelector('[data-take="tK"] .wdRoll') || {}).textContent || 'none'); ok(/🎲 .*Laura: Mia/.test(tx), 'take card says what it rolled: ' + tx); }
  await page.evaluate(() => { document.querySelector('#castList [data-cast="wildfree"]').click(); });
  ok(await page.evaluate(() => H3.wildMark(H3.snapshot()).wildFrom!=='keep'), 'Roll again lets the kept mix go');
  // grown-ups only
  await page.evaluate(() => { H3.S.wlib.forEach(A => { if(A.cat==='wear') A.desc = 'a school uniform for a 15 year old'; }); H3.S.cast[0].wild.who = []; });
  ok(await page.evaluate(() => { const t = H3.wildMark(H3.snapshot()); return !t.wild[1].picks.some(p => /school/.test(p.label)); }), 'an option that reads under 18 is never rolled');

  // 🎬 Wildcard clips: the tab has its own form and list, no timeline
  await page.evaluate(() => { H3.S.fkey = ''; delete H3.S.forms['~wild']; delete H3.S.casts['~wild']; });
  await page.click('#tabs [data-tab="wild"]'); await page.waitForTimeout(300);
  const wt = await page.evaluate(() => ({fk:H3.S.fkey, form:!document.querySelector('#renderTab').hidden, film:document.querySelector('#filmTab').hidden, go:getComputedStyle(document.querySelector('.go') || document.body).display!=='none', cast:H3.S.cast.length, prompt:H3.S.f.prompt}));
  ok(wt.fk==='~wild' && wt.form && wt.film && wt.go, 'Wildcards tab: its own form + Render button, no Films timeline: ' + JSON.stringify(wt));
  ok(!wt.prompt, 'it starts with its own empty prompt: ' + JSON.stringify(wt));
  // 🎲 ready-made Wildcard subject 1, 2
  const pre = await page.evaluate(() => H3.S.cast.map(c => [c.n, c.who, c.wild && c.wild.on, c.wild && c.wild.all]));
  ok(JSON.stringify(pre)===JSON.stringify([[1, 'Wildcard subject 1', true, true], [2, 'Wildcard subject 2', true, true]]), 'two ready-made wildcard subjects: ' + JSON.stringify(pre));
  ok(await page.evaluate(() => /Wildcard subject 1/.test(document.querySelector('#tagBar').textContent)), 'their chips are in the Shot box bar');
  await page.click('#tagBar [data-wdn]'); await page.click('[data-wa="wild"]');
  const p3 = await page.evaluate(() => ({c:H3.S.cast.map(c => c.who), p:H3.S.f.prompt}));
  ok(p3.c[2]==='Wildcard subject 3' && /<Subject 3>/.test(p3.p), '🎲 ＋ Wildcard adds subject 3 and puts its chip in: ' + JSON.stringify(p3));
  const r3 = await page.evaluate(() => { H3.S.f.prompt = '<Subject 1> waves. Then <Subject 1> sits.'; const t = H3.wildMark(H3.snapshot()); return t.wild && t.wild[1] && t.wild[1].picks.map(p => p.cat); });
  ok(r3 && r3.some(x => /Hair/.test(x)) && !r3.some(x => /Outfit/.test(x)), 'a ready-made one rolls every category with usable options (the under-18 outfits are skipped): ' + JSON.stringify(r3));
  const P2 = await prom(await page.evaluate(() => { const t = H3.wildMark(H3.snapshot()); return t; }));
  ok((P2.p.match(/<Subject 1>/g) || []).length >= 2 && !/<Subject 2>/.test(P2.p.split('\n').filter(l => /waves|sits/.test(l)).join()), 'the same subject twice in one take is one person (one tag)');
  await page.click('#tagBar [data-wdn]'); await page.click('[data-wa="lib:Lmia"]');
  const pm = await page.evaluate(() => ({c:H3.S.cast.find(c => c.lib==='Lmia'), p:H3.S.f.prompt}));
  ok(pm.c && new RegExp('<Subject ' + pm.c.n + '>').test(pm.p), '👥 ＋ Character › a Library character joins the cast with its chip in: ' + pm.p);
  // two no-picture wildcard subjects: each its own name, rolled words labelled by category
  const P3 = await prom(await page.evaluate(() => { H3.S.f.prompt = '<Subject 1> dances while <Subject 2> watches.'; H3.S.cast.filter(c => c.n <= 2).forEach(c => { c.pics = []; c.stand = 'a woman'; }); return H3.wildMark(H3.snapshot()); }));
  ok(/The first woman is nude\./.test(P3.p) && /The second woman is nude\./.test(P3.p) && /the second woman watches/.test(P3.p) && /The first woman dances/.test(P3.p), 'two wildcard women get their own names and a labelled hair line: ' + (P3.p.match(/\[0s[^\n]*/) || [''])[0].slice(0, 300));
  ok(!/The woman:/.test(P3.p), 'no shared "The woman:" description any more');
  ok(/The first woman's hair: silver bob\./.test(P3.p), 'a picture option\'s name goes in the words too: ' + (P3.p.match(/The first woman's hair[^.]*\./) || ['none'])[0]);
  await page.evaluate(() => { H3.S.f.prompt = ''; });
  await page.evaluate(() => { H3.S.cast = [{n:1, kind:'char', who:'Ava', pics:['p1'], keep:'exact', attrs:[], wild:{on:true, cats:['hair'], who:[]}}]; H3.S.f.prompt = 'In a park. <Subject 1> smiles.'; H3.drawAll(); });
  // 🥋 random action options + chip
  await page.click('#wdOpts summary').catch(() => {});
  await page.evaluate(() => { document.querySelector('#wdOpts').open = true; });
  for(const [n, d] of [['Twirl', 'spins slowly on the spot'], ['Wave', 'waves at the camera']]){ await page.click('[data-wt="new:act"]'); await page.fill('[data-wof="name"]', n); await page.fill('[data-wof="desc"]', d); await page.click('#sheetCard [data-close]'); }
  ok(await page.evaluate(() => !document.querySelector('#woBox')), 'action options have no picture box (sheet closed)');
  await page.evaluate(() => H3.actSheet(0)); await page.click('#acWho [data-aw="1"]'); await page.click('#acRand'); await page.click('#acGo');
  const ln = await page.evaluate(() => { const k = Object.keys(H3.S.lines).find(k => H3.S.lines[k].rand); return {k, L:H3.S.lines[k], p:H3.S.f.prompt}; });
  ok(ln.k && ln.L.n===1 && new RegExp('<Action ' + ln.k + '>').test(ln.p), 'a 🎲 random action chip goes in the shot: ' + JSON.stringify(ln));
  const acts = await page.evaluate(() => { const o = new Set(); for(let i = 0; i < 30; i++){ const t = H3.wildMark(H3.snapshot()); o.add(Object.values(t.lines).filter(L => L.act).map(L => L.text).join()); } return [...o]; });
  ok(acts.length===2, 'takes roll different actions: ' + acts.join(' / '));
  const ta = await page.evaluate(() => { const t = H3.wildMark(H3.snapshot()); t.id = 'tW'; return t; }); P = await prom(ta);
  ok(/<Subject 1> (spins slowly on the spot|waves at the camera)/.test(P.p), 'the rolled action is sent for her: ' + (P.p.match(/<Subject 1> (spins|waves)[^.]*\./) || [''])[0]);
  { const wl = await page.evaluate(t => H3.wildLine(t), ta); ok(/Ava: .* \/ 🥋 (Twirl|Wave)/.test(wl), 'the take card line lists the action: ' + wl); }
  const sameA = await page.evaluate(t => { H3.S.takes.unshift(t); const n = H3.snapshot(); n.carry = {src:t.id}; H3.wildMark(n); H3.S.takes.shift(); return JSON.stringify(n.wildActs)===JSON.stringify(t.wildActs); }, ta);
  ok(sameA, 'a carry-on keeps the same action');
  // ✂ choices inside one option (Jordan 2026-11-16): periods split, {a|b|c} picks, {Category} nests, the picture always goes
  { const ch = await page.evaluate(() => { const o = new Set(); for(let i = 0; i < 40; i++) o.add(H3.wChoose('goth outfit. Punk outfit. Cute outfit.', true)); return [...o].sort(); });
    ok(ch.join('|')==='Cute outfit|Punk outfit|goth outfit', 'split at periods: one of three each time: ' + ch.join(' / ')); }
  { const w = await page.evaluate(() => H3.wChoose('goth outfit. Punk outfit.', false)); ok(w==='goth outfit. Punk outfit', 'with ✂ off the words stay whole: ' + w); }
  { const ch = await page.evaluate(() => { const o = new Set(); for(let i = 0; i < 40; i++) o.add(H3.wChoose('a goth outfit covering her {small|medium|large} chest', false)); return [...o].sort(); });
    ok(ch.length===3 && ch.every(x => /^a goth outfit covering her (small|medium|large) chest$/.test(x)), '{a|b|c} picks one: ' + ch.join(' / ')); }
  { const r = await page.evaluate(() => { H3.wcats(); const S = H3.S;
      S.wcats.push({id:'cx', name:'📏 Size', kind:'attr', what:'size'});
      S.wlib = (S.wlib || []).filter(A => !['wear', 'cx'].includes(A.cat));
      const o = H3.wildNew('wear'); Object.assign(o, {name:'Goth', desc:'goth outfit with a {Size} figure', pics:['h1']});
      const z1 = H3.wildNew('cx'); z1.desc = 'petite'; const z2 = H3.wildNew('cx'); z2.desc = 'tall';
      const c = {n:9, kind:'char', who:'W', stand:'a woman', pics:[], attrs:[], wild:{on:true, cats:['wear', 'cx']}};
      const seen = new Set(); let hid = true, pic = true;
      for(let i = 0; i < 30; i++){ const R = H3.wildRoll([c])[9], t = {wild:{9:R}}; const W = H3.wildWords(c, t); seen.add(W.map(x => x.join(':')).join(' ; '));
        if(W.some(x => x[0]==='size')) hid = false; if(!H3.attrsOf(c, t).includes(o.id)) pic = false; }
      return {seen:[...seen].sort(), hid, pic}; });
    ok(r.seen.join('|')==='outfit:goth outfit with a petite figure|outfit:goth outfit with a tall figure', '{Size} nests that category\'s roll: ' + r.seen.join(' / '));
    ok(r.hid, 'a nested category is not said twice'); ok(r.pic, 'the outfit picture goes in whatever words are picked'); }
  // 🧑 the stand-in rolls too (Jordan 2026-11-16)
  { const r = await page.evaluate(() => { const o = new Set(), bad = []; for(let i = 0; i < 60; i++){ const w = H3.wStandRoll('a woman. a mature woman | a teen girl. a young adult woman'); o.add(w); if(/teen/.test(w)) bad.push(w); }
      const c = {n:9, kind:'char', who:'W', stand:'a woman. a mature woman', pics:[], attrs:[], wild:{on:true, cats:[]}}, R = H3.wildRoll([c]), t = {wild:R}, x = H3.wildCast(c, t);
      return {o:[...o].sort(), bad, st:x.stand, same:H3.wildCast(c, t)===x, pick:R && R[9].picks.map(p => p.cat + '=' + p.label).join(), plain:H3.wStandRoll('a woman.')}; });
    ok(r.o.join('|')==='a mature woman|a woman|a young adult woman' && !r.bad.length, 'the stand-in rolls one of its choices, never one under 18: ' + r.o.join(' / '));
    ok(/^a (mature )?woman$/.test(r.st) && r.same && /Stand-in=/.test(r.pick), 'one stand-in for the whole take: ' + r.st + ' · ' + r.pick);
    ok(r.plain==='', 'a plain stand-in is left alone'); }
  // 🔀 rolled lines come in a new order (Jordan 2026-11-16)
  { const o = await page.evaluate(() => { H3.wcats(); const A = H3.wildNew('hair'); A.desc = 'blue hair'; const B = H3.wildNew('eyes'); B.desc = 'green eyes'; const W = H3.wildNew('wear'); W.desc = 'a red dress';
      const c = {n:9, kind:'char', who:'W', stand:'a woman', pics:[], attrs:[], wild:{on:true, cats:['hair', 'eyes', 'wear']}}, seen = new Set();
      for(let i = 0; i < 40; i++){ const t = {wild:H3.wildRoll([c])}; seen.add(H3.wildWords(c, t).map(x => x[0]).join(',')); } return [...seen]; });
    ok(o.length >= 4, 'the rolled lines come in different orders: ' + o.join(' / ')); }
  // 👥 an action option can name others: <Subject n> chips and 🎲 {someone} (Jordan 2026-11-16)
  { const r = await page.evaluate(() => { H3.wcats(); const S = H3.S; S.wlib = (S.wlib || []).filter(A => A.cat!=='act');
      const A = H3.wildNew('act'); A.name = 'Hug'; A.desc = 'hugs {someone} from behind'; A.split = false;
      const c2 = S.cast.find(c => c.n===2) || (S.cast.push({n:2, kind:'char', who:'Bea', stand:'a woman', pics:[], attrs:[]}), S.cast.find(c => c.n===2));
      const out = new Set(); for(let i = 0; i < 20; i++) out.add(H3.wActText(A, {prompt:'<Subject 1> and <Subject 2> in a park.', pieces:[]}, {n:1}));
      const B = H3.wildNew('act'); B.desc = 'pulls <Subject 2> close'; B.split = false;
      H3.wildOpt(A.id); const chips = [...document.querySelectorAll('#woBox [data-wo^="sub:"]')].map(b => b.textContent);
      document.querySelector('#woBox [data-wo="sub:2"]').click(); const after = S.wlib.find(x => x.id===A.id).desc; document.querySelector('#woBox [data-close]').click();
      return {out:[...out], kept:H3.wActText(B, {prompt:'', pieces:[]}, {n:1}), chips, after}; });
    ok(r.out.length===1 && r.out[0]==='hugs <Subject 2> from behind', '🎲 someone else is the other character in the shot: ' + r.out.join(' / '));
    ok(r.kept==='pulls <Subject 2> close', 'a <Subject n> chip stays in the action words: ' + r.kept);
    ok(r.chips.length >= 2 && /someone else/.test(r.chips.join()) && /<Subject 2>/.test(r.after), 'the action option has chip buttons that put a name in: ' + r.chips.join(', ') + ' → ' + r.after);
    const P2 = await page.evaluate(() => { const S = H3.S; S.lines = {7:{act:1, n:1, name:'🎲 Random action', text:'', rand:1}}; S.f.prompt = 'In a park. <Subject 1> <Action 7>.';
      const A = S.wlib.find(x => x.name==='Hug'); S.wlib = S.wlib.filter(x => x.cat!=='act' || x===A);
      const t = H3.wildMark(H3.snapshot()); return {line:t.lines[7] && t.lines[7].text, used:H3.castUsed ? H3.castUsed(t) : null}; });
    ok(/hugs <Subject 2> from behind/.test(P2.line || ''), 'a random action can bring in the other character: ' + JSON.stringify(P2));
    const tq = await page.evaluate(() => { const t = H3.wildMark(H3.snapshot()); t.id = 'tQ'; return t; }); const PQ = await prom(tq);
    ok(/hugs (a |the )?[\w ]*woman from behind/.test(PQ.p), 'the character named only in the action goes out as her stand-in words: ' + PQ.p.slice(0, 400).replace(/\n/g, ' | ')); }
  // 🧑 Who she is: a category in the Wildcards tab (Jordan 2026-11-16)
  { const r = await page.evaluate(() => { const S = H3.S; H3.wcats(); const A = H3.wildNew('stand'); A.desc = 'a woman. a mature woman. a teen girl'; A.split = true;
      H3.drawWild(); const shown = /Who she is/.test(document.querySelector('#wildTab').textContent);
      H3.wildOpt(A.id); const noPic = !document.querySelector('#woBox [data-wo="pic"]'); document.querySelector('#woBox [data-close]').click();
      const c = {n:9, kind:'char', who:'W', stand:'a woman', pics:[], attrs:[], wild:{on:true, all:true}}, o = new Set();
      for(let i = 0; i < 40; i++){ const R = H3.wildRoll([c]); o.add(H3.wildCast(c, {wild:R}).stand); } return {shown, noPic, o:[...o].sort(), kind:A.kind}; });
    ok(r.shown && r.noPic && r.kind==='wstand', 'the Wildcards tab has a 🧑 Who she is category (words only)');
    ok(r.o.join('|')==='a mature woman|a woman', 'her stand-in words roll from it, never one under 18: ' + r.o.join(' / ')); }
  // back to Films: its own form comes back
  await page.evaluate(() => H3.setTab ? H3.setTab('films') : document.querySelector('#tabs [data-tab="films"]').click());
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
