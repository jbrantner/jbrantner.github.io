// ➕ a carry-on keeps the place of the take it carries on from (Jordan 2026-11-18: a carry-on whose words named only her came out as
// her on the black of her own pictures: the bedroom's pictures were dropped because the new words didn't name the bedroom).
// Run: NODE_PATH=$(npm root -g) node tests/t_carryplace.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  UNETLoader:{input:{required:{unet_name:[['minimaxH3INT8INT4_ref2vaINT8Pruned.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['x.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale','Video Slice'];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8063);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_FULL = true; window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8063/index.html');
  await page.waitForFunction(() => H3.families().length > 0, null, {timeout:20000});
  const fam = (await page.evaluate(() => H3.families().map(f => f.key)))[0];
  const run = (words, srcWords, carry) => page.evaluate(([fam, words, srcWords, carry]) => {
    ['p1', 'p2', 'b1', 'b2'].forEach(id => H3.S.media[id] = {id, kind:'img', name:id + '.png', w:768, h:1344, thumb:''});
    H3.S.cast = [{n:1, kind:'char', who:'Amber', pics:['p1', 'p2'], keep:'exact'}, {n:2, kind:'place', who:"Amber's bedroom", pics:['b1', 'b2'], keep:'exact'}];
    H3.S.takes = H3.S.takes.filter(x => x.id!=='tSrc');
    H3.S.takes.push({id:'tSrc', t:Date.now(), pc:'http://render.test', model:fam, prompt:srcWords, seconds:5, imgs:[], vids:[], auds:[], follow:[], loras:[], w:864, h:480,
      pieces:[{start:0, gen:124, deliv:120, ctx:0, prompt:srcWords, state:'done', file:{filename:'piece_01_00001_.mp4', subfolder:'Output_Render/H3Deck/h3_s', type:'output'}}], state:'done'});
    H3.S.media.cv = {id:'cv', kind:'vid', name:'cv.mp4', remote:'Output_Render\\H3Deck\\h3_s/piece_01_00001_.mp4 [output]', w:864, h:480, fps:24, sound:true, dur:5, cut:0,
      carry:carry ? {src:'tSrc', at:5, own:true, key:'k1'} : undefined};
    Object.assign(H3.S.f, {model:fam, turbo:false, ref:true, fl:true, first:'cv', last:false, aspect:'pic', seconds:5, h3:true, prompt:words, imgs:[], pieceText:{}});
    document.querySelector('#prompt').value = words; H3.drawAll();
    const t = H3.snapshot(); t.id = 'tNew'; t.pc = 'http://render.test'; t.seed = 3; t.dir = 'H3Deck/n'; t.name = 'n'; t.w = 864; t.h = 480;
    const names = {cv:'Output_Render\\H3Deck\\h3_s/piece_01_00001_.mp4 [output]', p1:'p1.png', p2:'p2.png', b1:'b1.png', b2:'b2.png'};
    const g = H3.pieceGraph(t, 0, H3.PC['http://render.test'].oi, names).g, N = Object.values(g);
    return {cont:!!t.cont, pics:N.filter(n => n.class_type==='LoadImage').map(n => n.inputs.image), prompt:(N.find(n => n.class_type==='MiniMaxH3ReferenceToVideo') || {inputs:{}}).inputs.prompt || ''}; }, [fam, words, srcWords, carry]);
  const SRC = '<Subject 1> sits on her bed. The scene takes place in <Subject 2>.';
  let A = await run('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] <Subject 1> stares at the viewer.', SRC, true);
  ok(A.cont, 'the take carries on the clip');
  ok(A.pics.includes('b1.png') && A.pics.includes('b2.png') && A.pics.includes('p1.png'), "a carry-on whose words name only her still sends the bedroom's pictures: " + JSON.stringify(A.pics));
  ok(/is Amber's bedroom, as shown in/.test(A.prompt) && /setting, its layout, light and colours/.test(A.prompt), 'the bedroom is a subject with its setting kept');
  ok(/The scene takes place in <Subject 2>\./.test(A.prompt.split('detailed_description:')[1] || ''), 'and the words say the scene takes place there: ' + (A.prompt.split('detailed_description:')[1] || '').slice(0, 600));
  A = await run('[0s-1s] The scene keeps carrying on from the moment before.\n[1s-] <Subject 1> stares at the viewer.', '<Subject 1> sits on her bed.', true);
  ok(!A.pics.some(x => /^b/.test(x)), 'a source take with no place brings none: ' + JSON.stringify(A.pics));
  A = await run('<Subject 1> stares at the viewer.', SRC, false);
  ok(!A.pics.some(x => /^b/.test(x)), 'a plain first-frame take (not a carry-on) only sends what its words name: ' + JSON.stringify(A.pics));
  await br.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
