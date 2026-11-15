// 🧍 Pose picture strength: the pose stand-in only in the first share of the steps (ConditioningSetTimestepRange + ConditioningCombine)
// Run: NODE_PATH=$(npm root -g) node tests/t_pstr.js
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
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','ConditioningSetTimestepRange','ConditioningCombine'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8042);
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
  await page.goto('http://127.0.0.1:8042/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  const graph = () => page.evaluate((R) => { const t = H3.snapshot(); t.id = 't' + Math.random(); t.pc = R; t.seed = 3; t.dir = 'H3Deck/x'; t.name = 'x';
    const g = H3.pieceGraph(t, 0, H3.PC[R].oi, {p1:'p1.png', p2:'p2.png', k1:'k1.png'}).g, nodes = Object.values(g), id = n => Object.keys(g).find(k => g[k]===n);
    const rvs = nodes.filter(n => n.class_type==='MiniMaxH3ReferenceToVideo'), loadOf = v => { let n = g[v[0]]; while(n && n.class_type!=='LoadImage'){ const up = Object.values(n.inputs).find(x => Array.isArray(x)); n = up ? g[up[0]] : null; } return n ? n.inputs.image : '?'; };
    const pics = rv => Object.keys(rv.inputs).filter(k => /^ref_images\./.test(k)).sort().map(k => rv.inputs[k]).map(v => g[v[0]].class_type==='MMH3FitReferences' ? 'fit' + v[1] : loadOf(v));
    const tr = nodes.filter(n => n.class_type==='ConditioningSetTimestepRange').map(n => [rvs.indexOf(g[n.inputs.conditioning[0]]), n.inputs.start, n.inputs.end]);
    const cb = nodes.find(n => n.class_type==='ConditioningCombine'), guider = nodes.find(n => /Guider/.test(n.class_type));
    let gc = guider && (guider.inputs.positive || guider.inputs.conditioning); let up = gc && g[gc[0]]; while(up && up.class_type!=='ConditioningCombine' && up.inputs.conditioning) up = g[up.inputs.conditioning[0]];
    return {n:rvs.length, prompts:rvs.map(r => r.inputs.prompt), pics:rvs.map(pics), tr, combined:!!cb, toGuider:!!up && up===cb}; }, R);
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, fillRefs:false, pstr:100, prompt:'[0s-5s] <Subject 1> waits by the window. <Pose 1>'});
    ['p1', 'p2', 'k1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1', 'p2'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lk', kind:'pose', name:'Kneel', pics:['k1'], desc:'', ppl:[]}]);
    H3.S.lines = H3.S.lines || {}; H3.S.lines[1] = {pose:1, n:1, lib:'Lk', p:-1, name:'Kneel', text:''};
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.querySelector('#pstrRow').hidden), 'the slider shows when a pose picture is in the shot');
  let G = await graph();
  ok(G.n===1 && !G.combined && G.pics[0].length===3, 'at 100%: one reference node, 3 pictures: ' + JSON.stringify(G.pics));
  await page.evaluate(() => { const s = document.querySelector('#pstr'); s.value = 40; s.dispatchEvent(new Event('input')); });
  ok(await page.evaluate(() => H3.S.f.pstr===40 && H3.snapshot().pstr===0.4) && await page.textContent('#pstrOut')==='40%', 'slider sets 40% and the take keeps 0.4');
  G = await graph();
  ok(G.n===2 && G.pics[0].length===3 && G.pics[1].length===3 && JSON.stringify(G.pics[1])===JSON.stringify(['fit0', 'fit1', 'fit0']), 'at 40%: a second node without the pose picture, her picture 1 again in its slot: ' + JSON.stringify(G.pics));
  ok(JSON.stringify(G.tr)==='[[0,0,0.4],[1,0.4,1]]' && G.combined && G.toGuider, 'with pose for 0-40%, without for 40-100%, combined into the guider: ' + JSON.stringify(G.tr) + ' ' + G.toGuider);
  ok(/<Picture 3>/.test(G.prompts[0]) && /Laura, as shown in <Picture 1>, <Picture 2> and <Picture 3>/.test(G.prompts[1]) && !/pose reference/.test(G.prompts[1]) && /kneel/i.test(G.prompts[1].split('detailed_description:')[1] || G.prompts[1]), 'the second prompt gives Picture 3 to her and has words for the pose: ' + (G.prompts[1].split('detailed_description:')[1] || '').slice(0, 200));
  // plain prompt too
  await page.evaluate(() => { H3.S.f.h3 = false; });
  G = await graph(); ok(G.n===2 && /as shown in <Picture 1>, <Picture 2> and <Picture 3>/.test(G.prompts[1]) && !/pose reference/.test(G.prompts[1]) && /pose reference/.test(G.prompts[0]), 'plain prompts work the same: ' + G.prompts[1].slice(0, 200));
  await page.evaluate(() => { H3.S.f.h3 = true; });
  // no pose picture → nothing changes, slider hidden
  await page.evaluate(() => { H3.S.f.prompt = '[0s-5s] <Subject 1> waits by the window.'; document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); });
  G = await graph(); ok(G.n===1, 'no pose picture: one node');
  ok(await page.evaluate(() => document.querySelector('#pstrRow').hidden), 'and no slider');
  await page.evaluate(() => { const t = H3.snapshot(); t.pstr = 0; H3.useAgain(t, true); });
  ok(await page.evaluate(() => H3.S.f.pstr===100), 'Use again restores 100%');
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
