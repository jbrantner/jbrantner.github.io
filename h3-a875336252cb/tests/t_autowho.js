// ↩ Pose / action chips go to the character named before them in the words
// Run: NODE_PATH=$(npm root -g) node tests/t_autowho.js
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
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8043);
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
  await page.goto('http://127.0.0.1:8043/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  await page.evaluate(REF => { Object.assign(H3.S.f, {model:REF, turbo:false, ref:true, imgs:[], fl:false, seconds:5, h3:true, shuffle:0, prompt:'[0s-5s] <Subject 2> looks to her left and '});
    ['p1', 'q1', 'k1'].forEach(k => H3.S.media[k] = {id:k, kind:'img', name:k + '.png', w:640, h:352, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Laura', pics:['p1'], keep:'exact'}, {n:2, kind:'char', who:'Mia', pics:['q1'], keep:'exact'}];
    H3.S.lib = (H3.S.lib || []).concat([{id:'Lk', kind:'pose', name:'Kneel', pics:['k1'], desc:'', ppl:[]}]);
    document.querySelector('#prompt').value = H3.S.f.prompt; H3.drawAll(); }, REF);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-psn]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelector('#pcWho [data-pw="-1"]').classList.contains('pri')), 'a new pose chip starts on ↩ Named before it');
  await page.click('#pcLib [data-pl="Lk"]');
  let prev = await page.textContent('#pcPrev'); ok(/^Sent to MiniMax as: Mia moves into/.test(prev) && /↩ Mia, the character named before it/.test(prev), 'the preview names Mia: ' + prev);
  await page.click('#pcGo'); await page.waitForTimeout(200);
  let L = await page.evaluate(() => H3.lineOf(1)); ok(L.auto===1 && L.n===2, 'saved as auto, who = Mia: ' + JSON.stringify(L));
  let lab = await page.evaluate(() => [...document.querySelectorAll('#promptHl mark')].map(m => m.dataset.n).join()); ok(/🧍 Mia · Kneel/.test(lab), 'the chip reads Mia · Kneel: ' + lab);
  let T = await page.evaluate(() => { const t = H3.castTake(H3.snapshot(), true); return t.imgs.map(r => r.id).join(); }); ok(T==='q1,k1', 'Mia\'s picture and the pose picture go: ' + T);
  // change who is named before it: it follows the words
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.value = ta.value.replace('<Subject 2>', '<Subject 1>'); ta.dispatchEvent(new Event('input')); });
  L = await page.evaluate(() => H3.lineOf(1)); ok(L.n===1, 'after the words change to Laura, the chip is Laura\'s: ' + L.n);
  T = await page.evaluate(() => H3.castTake(H3.snapshot(), true).imgs.map(r => r.id).join()); ok(T==='p1,k1', 'Laura\'s picture goes now: ' + T);
  // an action chip right after a pose chip goes to the same character; nothing named before → the first one after
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.selectionStart = ta.selectionEnd = ta.value.length; });
  await page.click('#tagBar [data-acn]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelector('#acWho [data-aw="-1"]').classList.contains('pri')), 'a new action chip starts on ↩ Named before it');
  await page.fill('#acText', 'throws a punch'); await page.fill('#acName', 'Punch'); await page.click('#acGo'); await page.waitForTimeout(200);
  let A = await page.evaluate(() => { const ks = Object.keys(H3.S.lines).map(Number); return H3.S.lines[Math.max(...ks)]; }); ok(A.auto===1 && A.n===1, 'the action is Laura\'s too: ' + JSON.stringify(A));
  const sent = await page.evaluate(() => H3.lineOut(H3.S.f.prompt)); ok(/<Subject 1> looks to her left and moves into \u0002/.test(sent) && /\. <Subject 1> throws a punch/.test(sent), 'sent: on her sentence, no second tag: ' + JSON.stringify(sent));
  ok(await page.evaluate(() => H3.lineOut('<Subject 1> waves and <Action ' + Math.max(...Object.keys(H3.S.lines).map(Number)) + '>'))==='<Subject 1> waves and throws a punch', 'an action mid-sentence: no second tag');
  ok(await page.evaluate(() => H3.autoWho('<Pose 7> and then <Subject 2> waves', 7)===2 && H3.autoWho('nobody here <Pose 7>', 7)===0), 'nothing before → the first one after; nobody → 0');
  // a picked character stays picked
  await page.evaluate(() => { const ta = document.querySelector('#prompt'); ta.focus(); const i = ta.value.indexOf('<Pose 1>') + 3; ta.selectionStart = ta.selectionEnd = i; ta.dispatchEvent(new MouseEvent('click', {bubbles:true})); }); await page.waitForTimeout(200);
  await page.click('#pcWho [data-pw="2"]'); await page.click('#pcGo'); await page.waitForTimeout(150);
  L = await page.evaluate(() => H3.lineOf(1)); ok(!L.auto && L.n===2, 'picking Mia by hand sticks: ' + JSON.stringify(L));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
