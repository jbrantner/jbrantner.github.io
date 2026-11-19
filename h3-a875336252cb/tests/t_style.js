// 🎨 Keep their own art style (per character, Library or film cast) + 🎨 Scene style (Off / like a character / 🧊 3D / ✏ 2D / 🖍 Cartoon /
// 🎥 Realistic / 🖼 style picture) in the Prompt box. Checks the retention and description words MiniMax gets, and that the photoreal
// ✨ boost LoRAs stay out of styled takes. Fake ComfyUI in the browser.
// Run: NODE_PATH=$(npm root -g) node tests/t_style.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const BOOSTS = ['MMH3-Realism-V2-HyperFlow-ref2va.safetensors','DetailSlider-V1.safetensors','MMH3-RealismSlider-V1.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors'];
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors']], weight_dtype:[['default']]}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']]}, optional:{device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
  LoraLoaderModelOnly:{input:{required:{model:['MODEL'], lora_name:[BOOSTS], strength_model:['FLOAT', {default:1}]}}},
  LoadImage:{input:{required:{image:[['x.png']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join','MiniMaxH3MotionContext',
  'LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','CLIPTextEncode'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8077);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { if(!sessionStorage.t){ sessionStorage.t = '1'; localStorage.clear(); } window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8077/index.html');
  await page.waitForFunction(() => H3.families().length > 0 && H3.PC['http://render.test'] && H3.PC['http://render.test'].oi, null, {timeout:20000});
  const REF = await page.evaluate(() => H3.families().map(f => f.key).find(k => /hybrid/.test(k)));
  await page.evaluate(async REF => { const pic = async (col, nm) => { const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 64, 96);
      const b = await new Promise(ok => c.toBlob(ok, 'image/png')); return H3.addMedia(new File([b], nm + '.png', {type:'image/png'}), 'img'); };
    window.P = {a:await pic('#c33', 'anna'), b:await pic('#33c', 'ben'), s1:await pic('#999', 'style1')};
    Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, quality:false, boost:true, look:{src:'', n:0, pics:[], redo:{}, use:true}, prompt:'<Subject 1> and <Subject 2> walk through the park.'});
    H3.S.cast = [{n:1, kind:'char', stand:'a woman', who:'Anna', pics:[P.a], keep:'exact'}, {n:2, kind:'char', stand:'a man', who:'Ben', pics:[P.b], keep:'exact'}];
    H3.drawAll(); }, REF);
  const prom = () => page.evaluate(R => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const T = H3.castTake(t, true), names = {}; T.imgs.forEach(r => names[r.id] = r.id + '.png');
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, names).g, nodes = Object.values(g);
    return {p:nodes.find(n => n.class_type==='MiniMaxH3ReferenceToVideo').inputs.prompt, loras:nodes.filter(n => n.class_type==='LoraLoaderModelOnly').map(n => n.inputs.lora_name), styled:!!t.styled, imgs:T.imgs.length}; }, R);
  let X = await prom();
  ok(!/art style/.test(X.p) && !/animated/.test(X.p), 'off: no art style words');
  ok(X.loras.length===4 && !X.styled, 'off: the four ✨ boost LoRAs go (' + X.loras.length + ')');
  ok(await page.evaluate(() => [...document.querySelectorAll('#artBox [data-lk]')].map(b => b.textContent).join('|')).then(s => /Off\|Like Anna\|Like Ben\|🧊 3D animated\|✏ 2D anime\|🖍 Cartoon\|🎥 Realistic\|🖼 Style picture/.test(s)), 'the 🎨 Scene style row in the Prompt box');
  // Anna keeps her 3D look, from her card
  await page.evaluate(() => { H3.drawCast(); });
  const has = await page.evaluate(() => !!document.querySelector('#castList [data-cn="1"] [data-cast="art:3d"]'));
  ok(has, "🎨 Keep their own art style on the character's card");
  await page.evaluate(() => document.querySelector('#castList [data-cn="1"] [data-cast="art:3d"]').click());
  ok(await page.evaluate(() => H3.S.cast[0].art==='3d'), 'tapping 🧊 3D sets it on her');
  X = await prom();
  ok(/<Subject 1> \([^)]*\): [^\n]*Their art style is kept as well: <Subject 1> is rendered exactly as in <Picture 1>, as a stylized 3D animated CG character, with the same proportions, shading, materials and colours\./.test(X.p), 'her retention line keeps her art style');
  ok(!/<Subject 2> \([^)]*\): [^\n]*art style/.test(X.p), 'Ben is left as he is');
  ok(/Each subject is shown in the art style of their own reference pictures\./.test(X.p) && !/live-action/i.test(X.p), "no scene style: the 'live-action, cinematic' line gives way to each one's own style");
  ok(X.styled && X.loras.length===0, 'a styled take sends no realism boost LoRAs');
  ok(/Keeping their own style: Anna \(3D animated\)/.test(await page.evaluate(() => document.querySelector('#artBox').textContent)), 'the Scene style row says who keeps their own style');
  // "As in the pictures": no named kind
  await page.evaluate(() => { H3.S.cast[0].art = 'pic'; }); X = await prom();
  ok(/Their art style is kept as well: <Subject 1> is rendered exactly as in <Picture 1>, with the same proportions/.test(X.p), 'as in the pictures: no kind named');
  // scene style 🧊 3D (words)
  await page.evaluate(() => { H3.S.cast[0].art = ''; H3.drawAll(); document.querySelector('#artBox [data-lk="w:3d"]').click(); });
  X = await prom();
  ok(/detailed_description: The target video is a modern 3D animated feature film: every person, object and place is rendered as stylized CG/.test(X.p) || /The target video is a modern 3D animated feature film: every person, object and place/.test(X.p), 'scene 🧊 3D: the 3D sentence is the style line');
  ok(X.styled && X.loras.length===0 && X.imgs===2, 'scene 3D: no boost LoRAs, no extra pictures');
  // 🎥 Realistic scene: boost stays
  await page.evaluate(() => document.querySelector('#artBox [data-lk="w:real"]').click()); X = await prom();
  ok(/live-action footage filmed on a digital cinema camera/.test(X.p) && !X.styled && X.loras.length===4, 'scene 🎥 Realistic: live-action line, boost kept');
  // like Anna, who is 3D: the 3D sentence + the one-look line
  await page.evaluate(() => { H3.S.cast[0].art = '3d'; H3.drawAll(); document.querySelector('#artBox [data-lk="c:1"]').click(); }); X = await prom();
  ok(/modern 3D animated feature film[^\n]*The whole target video is in one single visual style, the look of <Subject 1>/.test(X.p), 'like Anna (3D): the 3D sentence, then the one-look line');
  ok(/<Subject 2> is shown in the same visual style as <Subject 1>/.test(X.p), 'Ben is told to match her');
  // no pictures at all (base format) with a scene kind
  await page.evaluate(() => { H3.S.f.look = {src:'w', kind:'2d', n:0, pics:[], redo:{}, use:true}; H3.S.f.prompt = 'a woman walks through the park.'; H3.drawAll(); }); X = await prom();
  ok(/hand-drawn 2D anime: every person, object and place is drawn/.test(X.p), 'no references: the 2D sentence leads the base format');
  // Library entry keeps it in every film
  const lib = await page.evaluate(() => { const L = {id:'L1', kind:'char', name:'Mia', stand:'a woman', pics:[P.a], keep:'exact'}; H3.S.lib.push(L); H3.openLib('L1');
    const b = document.querySelector('#lbBox [data-lb="art:toon"]'); if(!b) return 'no button'; b.click(); return H3.S.lib.find(x => x.id==='L1').art; });
  ok(lib==='toon', 'the Library sheet sets 🎨 on the entry (' + lib + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
