// 📏 Size chips (Jordan 2026-11-18): 480p default, 576p middle, 720p slow, in the bare Canvas block.
// Run: NODE_PATH=$(npm root -g) node tests/t_size.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const R = 'http://render.test';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };
const SCHEMA = {
  EasyCache:{input:{required:{model:['MODEL'], reuse_threshold:['FLOAT',{default:0.2}], start_percent:['FLOAT',{default:0.15}], end_percent:['FLOAT',{default:0.95}], verbose:['BOOLEAN',{default:false}]}}},
  ModelAttentionBackend:{input:{required:{model:['MODEL'], attention:[['pytorch attention','comfy kitchen attention'], {default:'pytorch attention'}]}}},
  UNETLoader:{input:{required:{unet_name:[['DaSiWa-MiniMaxH3-Hybrid-V2.safetensors', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors']], weight_dtype:[['default']]}}},
  LoraLoaderModelOnly:{input:{required:{lora_name:[['AFK_Claude_minimaxh3.safetensors','MMH3-Realism-V2-HyperFlow-ref2va.safetensors','DetailSlider-V1.safetensors','MMH3-RealismSlider-V1.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors','minimax_h3_cinematic_v2_tutu.safetensors']], strength_model:['FLOAT', {default:1}]}}},
  MiniMaxH3MotionContext:{input:{required:{}, optional:{context_frames:['IMAGE'], context_latent:['LATENT'], audio_vae:['VAE'], context_audio:['AUDIO']}}},
  CLIPLoader:{input:{required:{clip_name:[['minimax_h3_text_encoder.safetensors']], type:[['minimax']], device:[['default']]}}},
  VAELoader:{input:{required:{vae_name:[['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors']]}}},
};
const OTHER = ['MiniMaxH3ReferenceToVideo','MiniMaxH3ImageToVideo','MiniMaxH3MotionContextTrim','MiniMaxH3MotionContextSaveLatent','MiniMaxH3MotionContextLoadLatent','MiniMaxH3AddGuide','MMH3FitReferences','RenderDeckH3Join',
  'LoadImage','LoadVideo','LoadAudio','BasicGuider','BasicScheduler','KSamplerSelect','RandomNoise','SamplerCustomAdvanced','VAEDecodeTiled','VAEDecodeAudio','CreateVideo','SaveVideo','ConcatenateVideo','GetVideoComponents','ImageScale'];
const node = (g, t) => Object.values(g).find(n => n.class_type===t);
const POSTED = [];
(async () => {
  const root = path.join(__dirname, '..'); const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':/\.html$/.test(f) ? 'text/html' : 'application/octet-stream'}); r.end(b); }); }).listen(8048);
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route(R + '/**', async rt => { const u = new URL(rt.request().url()), p = u.pathname, J = o => rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(o)});
    if(p==='/system_stats') return J({devices:[]});
    if(p==='/object_info' || p.startsWith('/object_info/')){ const c = decodeURIComponent(p.slice(13)); if(!c){ const all = Object.assign({}, SCHEMA); OTHER.forEach(o => all[o] = {input:{required:{}}}); return J(all); } return J(SCHEMA[c] ? {[c]:SCHEMA[c]} : OTHER.includes(c) ? {[c]:{input:{required:{}}}} : {}); }
    if(p==='/queue') return J({queue_running:[], queue_pending:[]});
    if(p==='/prompt'){ POSTED.push(JSON.parse(rt.request().postData()).prompt); return J({prompt_id:'pid' + POSTED.length}); }
    if(p==='/renderdeck/images') return J({shared:true, pc:'Output_Render', images:[]});
    if(p.startsWith('/userdata/')) return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''});
    return rt.fulfill({status:404, headers:{'Access-Control-Allow-Origin':'*'}, body:''}); });
  await page.addInitScript(r => { localStorage.clear(); window.H3_PCS = [{name:'Render', url:r, on:true, speed:1}]; }, R);
  await page.goto('http://127.0.0.1:8048/index.html');
  await page.waitForFunction(() => H3.families().length > 1, null, {timeout:20000});
  const fams = await page.evaluate(() => H3.families().map(f => f.key)); const REF = fams.find(k => /hybrid/.test(k));
  page.on('dialog', d => d.accept());
  const st = () => page.evaluate(() => { const t = H3.snapshot(); return {w:t.w, h:t.h, chips:[...document.querySelectorAll('#sizes [data-mp]')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')), vis:!document.querySelector('#sizeRow').hidden && document.querySelector('#sizeRow').offsetParent!==null}; });
  await page.evaluate(() => { const b = document.querySelector('#bCanvas'); if(b.classList.contains('shut')) b.querySelector('h3').click(); });
  let s = await st(); console.log(JSON.stringify(s));
  ok(s.vis, 'size chips show in the bare app'); ok(s.chips.length===3, 'three sizes'); ok(s.w===864 && s.h===480, 'default stays 864x480'); ok(/480p.*\*$/.test(s.chips[0]), '480p lit by default');
  ok(/1024×576/.test(s.chips[1]), 'middle chip says 1024x576');
  await page.click('#sizes [data-mp="0.59"]'); s = await st(); ok(s.w===1024 && s.h===576, 'middle = 1024x576 (' + s.w + 'x' + s.h + ')'); ok(/\*$/.test(s.chips[1]), 'middle lit');
  await page.click('#aspects [data-asp="9:16"]'); s = await st(); ok(s.w===576 && s.h===1024, 'tall middle = 576x1024 (' + s.w + 'x' + s.h + ')');
  await page.click('#aspects [data-asp="1:1"]'); s = await st(); ok(s.w===768 && s.h===768, 'square middle = 768x768 (' + s.w + 'x' + s.h + ')');
  await page.click('#aspects [data-asp="16:9"]'); await page.click('#sizes [data-mp="0.94"]'); s = await st(); ok(s.w===1280 && s.h===736, '720p = 1280x736 (' + s.w + 'x' + s.h + ')');
  await page.click('#sizes [data-mp="0.41"]'); s = await st(); ok(s.w===864 && s.h===480, 'back to 480p');
  await page.screenshot({path:process.env.SHOT || '/tmp/size.png', clip:await page.evaluate(() => { const r = document.querySelector('#bCanvas').getBoundingClientRect(); return {x:0, y:r.top + scrollY, width:390, height:r.height}; }), fullPage:true});
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
