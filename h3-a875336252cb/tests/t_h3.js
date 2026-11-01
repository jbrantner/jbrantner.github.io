// H3 Deck end-to-end test against two real ComfyUI servers (same version as the PCs, models as empty files):
//   A on :8188 with ComfyUI-H3-Motion-Context + mmh3_studio_refs.py (like Render)
//   B on :8189 with --disable-all-custom-nodes (a PC without Motion Context)
// and the app served on :8000. Every graph the app sends must pass ComfyUI's own checks (/prompt answers with a
// prompt id); sampling then fails on the empty model files, which also tests the failure path. The join is tested for
// real: two short mp4 pieces made with ffmpeg are joined by ComfyUI's Concatenate Video.
// Run: NODE_PATH=$(npm root -g) MEDIA=<folder with first.png last.png ref.png ref.mp4 voice.wav> OUT=<ComfyUI output dir> node tests/t_h3.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const A = 'http://127.0.0.1:8188', B = 'http://127.0.0.1:8189', APP = 'http://127.0.0.1:8000/';
const MEDIA = process.env.MEDIA, OUT = process.env.OUT;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if(!c) fails++; };

(async () => {
  const br = await chromium.launch(), page = await br.newPage({viewport:{width:390, height:844}});
  const sent = []; // every graph the app queued, with ComfyUI's answer
  page.on('response', async r => { if(r.url().endsWith('/prompt') && r.request().method()==='POST'){ let j = {}; try{ j = await r.json(); }catch(e){} sent.push({url:r.url(), graph:JSON.parse(r.request().postData()).prompt, status:r.status(), ans:j}); } });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.addInitScript(([a, b]) => { window.H3_PCS = [{name:'Render', url:a, on:true, speed:1}, {name:'Main', url:b, on:true, speed:1.26}]; }, [A, B]);
  await page.goto(APP);
  await page.waitForFunction(() => document.querySelectorAll('#model option').length > 1, null, {timeout:30000});
  const models = await page.$$eval('#model option', o => o.map(x => x.textContent));
  console.log('models:', models.join(' | '));
  ok(models.some(m => /DaSiWa Hybrid V2/.test(m)) && models.some(m => /ErosMax/.test(m)) && models.some(m => /First\/last/.test(m)), 'model families found');

  // ---- the splitter ----
  const P = await page.evaluate(() => [6, 11, 12, 30, 5, 5.2].map(s => H3.plan(s, 5, []).map(p => [p.gen, p.deliv])));
  console.log('plans:', JSON.stringify(P));
  ok(P[0].length===2 && Math.abs(P[0][0][1] - P[0][1][1]) < 10, '6 s = two near-even pieces, not 5 + 1');
  ok(P[2].length===3 && P[2].every(p => p[1] >= 85 && p[1] <= 105), '12 s = three ~4 s pieces');
  ok(P[3].length===6 && P[3].every(p => p[0] % 17===5), '30 s = six pieces, all on the 17k+5 grid');
  ok(P[4].length===1 && P[4][0][0]===124, '5 s = one 124-frame render');
  const pp = await page.evaluate(() => { const t = 'Style line. <Picture 1> defines <Subject 1>.\n[0s-3s] she walks in.\n[3s-7s] she sits down.\n[7s-10s] she opens a book.'; const pl = H3.plan(10, 5, H3.parseBeats(t).beats); return pl.map((p, i) => H3.piecePrompt(t, pl, i)); });
  console.log(pp.join('\n---\n'));
  ok(pp.length===2 && /walks/.test(pp[0]) && /opens a book/.test(pp[1]) && /continues straight on/.test(pp[1]) && !/walks in/.test(pp[1]), 'beats go to the piece they fall in, re-timed');

  // ---- a long Reference + FLFrame clip with every kind of reference ----
  await page.fill('#prompt', '<Picture 1> defines <Subject 1>. [0s-4s] she walks toward the camera. [4s-8s] she stops and looks up. [8s-12s] she smiles.');
  await page.fill('#lenNum', '12'); await page.dispatchEvent('#lenNum', 'input');
  const pick = async (sel, file) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(path.join(MEDIA, file)); await page.waitForTimeout(600); };
  await page.click('#refSw');
  await pick('[data-add="img"]', 'ref.png'); await pick('[data-add="img"]', 'first.png');
  await pick('[data-add="vid"]', 'ref.mp4'); await page.click('[data-opt="sound"][data-k="vid"]');
  await pick('[data-add="aud"]', 'voice.wav'); await pick('[data-add="aud"]', 'voice.wav'); await page.click('[data-opt="follow"][data-k="aud"][data-i="1"]');
  await page.click('[data-tg="img"][data-i="1"]'); // second picture off
  await page.click('#flSw'); await pick('[data-add="first"]', 'first.png'); await page.click('#lastSw'); await pick('[data-add="lastImg"]', 'last.png');
  const tags = await page.$$eval('#imgSlots .tag, #vidSlots .tag, #audSlots .tag', t => t.map(x => x.textContent));
  console.log('labels:', tags.join(', '));
  ok(tags[0]==='<Picture 1>' && tags[1]==='off' && /<Audio 1> \+ <Video 1>/.test(tags[2]) && tags[3]==='<Audio 2>' && tags[4]==='soundtrack', 'reference labels follow MiniMax order and on/off');
  await page.click('#bMore h3'); await page.click('#whereSeg [data-w="both"]');
  await page.click('[data-pre="1024x576"]');
  const why = await page.$eval('#goWhy', e => e.hidden ? '' : e.textContent); console.log('why not:', why);
  ok(!why, 'Render is allowed');
  await page.click('#goBtn'); await page.waitForTimeout(4000);
  ok(sent.length===3, '3 pieces queued (' + sent.length + ')');
  ok(sent.every(s => s.url.startsWith(A) && s.status===200 && s.ans.prompt_id), 'all went to the PC with Motion Context, and ComfyUI accepted every graph: ' + JSON.stringify(sent.map(s => s.ans.node_errors || s.ans.error || 'ok')));
  const types = g => Object.values(g).map(n => n.class_type);
  const g1 = sent[0] && sent[0].graph, g2 = sent[1] && sent[1].graph, g3 = sent[2] && sent[2].graph;
  if(g1){
    ok(types(g1).filter(t => t==='MiniMaxH3AddGuide').length===2, 'piece 1: first-frame guide + soundtrack guide');
    ok(!types(g1).includes('MiniMaxH3MotionContext') && types(g1).includes('MiniMaxH3MotionContextSaveLatent'), 'piece 1: no context in, latent saved');
    ok(types(g2).includes('MiniMaxH3MotionContext') && types(g2).includes('MiniMaxH3MotionContextTrim') && types(g2).filter(t => t==='MiniMaxH3AddGuide').length===1, 'piece 2: Motion Context + Trim, soundtrack only');
    ok(types(g3).filter(t => t==='MiniMaxH3AddGuide').length===2, 'piece 3: last-frame guide + soundtrack');
    const jn = Object.values(g3).find(n => n.class_type==='RenderDeckH3Join');
    ok(!types(g1).includes('RenderDeckH3Join') && !types(g2).includes('RenderDeckH3Join') && jn && jn.inputs.before===2 && Array.isArray(jn.inputs.video), 'the last piece joins pieces 1-2 onto itself as its final step');
    const rv = Object.values(g1).find(n => n.class_type==='MiniMaxH3ReferenceToVideo');
    ok(rv.inputs['ref_videos.ref_video_0'] && rv.inputs['ref_video_audios.ref_video_audio_0'] && rv.inputs['ref_audios.ref_audio_0'] && rv.inputs['ref_images.ref_image_1'], 'piece 1 refs: picture, first frame as picture 2, video + sound, voice');
    ok(/^<Picture 2> is the first frame/.test(rv.inputs.prompt), 'hybrid model is told which picture is the first frame');
    const ld = Object.values(g2).find(n => n.class_type==='MiniMaxH3MotionContextLoadLatent'), sv = Object.values(g1).find(n => n.class_type==='MiniMaxH3MotionContextSaveLatent');
    ok(ld.inputs.clip_index===1 && sv.inputs.clip_index===1 && sv.inputs.filename_prefix.startsWith(ld.inputs.latent_path + '/'), 'piece 2 loads the latent piece 1 saves');
    const tr = Object.values(g2).find(n => n.class_type==='TrimAudioDuration');
    console.log('piece 2 soundtrack slice', JSON.stringify(tr.inputs));
    ok(tr.inputs.start_index > 3.5 && tr.inputs.start_index < 4.6, 'piece 2 gets its own slice of the soundtrack');
    fs.writeFileSync(path.join(__dirname, 'last_piece2_graph.json'), JSON.stringify(g2, null, 1));
  }
  // they fail on the empty model files: the take should stop and say so
  await page.waitForFunction(() => H3.S.takes[0] && H3.S.takes[0].state==='failed', null, {timeout:90000}).catch(() => {});
  const st = await page.evaluate(() => ({s:H3.S.takes[0].state, p:H3.S.takes[0].pieces.map(p => p.state + ':' + (p.err || '').slice(0, 60))}));
  console.log('after running:', JSON.stringify(st));
  ok(st.s==='failed' && st.p[0].startsWith('failed') && st.p.slice(1).every(x => x.startsWith('new')), 'a failed piece stops the take and takes the rest out of the queue');

  // ---- a short FLFrame-only clip on the official FL2V model, Main only ----
  sent.length = 0;
  await page.click('#refSw'); // references off
  await page.fill('#lenNum', '4'); await page.dispatchEvent('#lenNum', 'input');
  const fl = await page.$$eval('#model option', o => o.find(x => /First\/last/.test(x.textContent)).value); await page.selectOption('#model', fl);
  await page.click('#whereSeg [data-w="' + B + '"]');
  await page.click('#goBtn'); await page.waitForTimeout(3000);
  ok(sent.length===1 && sent[0].url.startsWith(B) && sent[0].ans.prompt_id, 'FL2V clip sent to Main and accepted: ' + JSON.stringify(sent[0] && (sent[0].ans.node_errors || sent[0].ans.error || 'ok')));
  if(sent[0]){ const iv = Object.values(sent[0].graph).find(n => n.class_type==='MiniMaxH3ImageToVideo'), lo = Object.values(sent[0].graph).find(n => n.class_type==='LoraLoaderModelOnly');
    ok(iv && iv.inputs.first_frame && iv.inputs.last_frame, 'FL2V: first and last frame on the node');
    ok(lo && /fl2v_turbo/.test(lo.inputs.lora_name) && Object.values(sent[0].graph).find(n => n.class_type==='BasicScheduler').inputs.steps===8, 'Turbo on the official model = FL2V turbo LoRA, 8 steps'); }
  // regular, 21:9, 0.9 MP
  sent.length = 0; await page.click('#speedSeg [data-v="regular"]'); await page.click('[data-asp="21:9"]'); await page.fill('#res', '0.9').catch(() => {}); await page.$eval('#res', e => { e.value = 0.9; e.dispatchEvent(new Event('input')); });
  await page.click('#goBtn'); await page.waitForTimeout(3000);
  if(sent[0]){ const iv = Object.values(sent[0].graph).find(n => n.class_type==='MiniMaxH3ImageToVideo'); console.log('21:9 size', iv.inputs.width, iv.inputs.height);
    ok(iv.inputs.width % 32===0 && iv.inputs.height % 32===0 && iv.inputs.width * iv.inputs.height <= 768 * 1344 && Math.abs(iv.inputs.width / iv.inputs.height - 21 / 9) < 0.15, 'canvas: 21:9, multiple of 32, inside the MiniMax cap');
    ok(Object.values(sent[0].graph).find(n => n.class_type==='BasicScheduler').inputs.steps===20 && !Object.values(sent[0].graph).some(n => n.class_type==='LoraLoaderModelOnly'), 'Regular = 20 steps, no turbo LoRA'); }
  // a long clip can't go to the PC without Motion Context
  await page.fill('#lenNum', '9'); await page.dispatchEvent('#lenNum', 'input'); await page.waitForTimeout(300);
  const why2 = await page.$eval('#goWhy', e => e.textContent); console.log('Main only, 9 s:', why2);
  ok(/Motion Context/.test(why2) && await page.$eval('#goBtn', b => b.disabled), 'a split clip is refused on a PC without H3 Motion Context');

  // ---- two takes over both PCs ----
  sent.length = 0; await page.fill('#lenNum', '4'); await page.dispatchEvent('#lenNum', 'input'); await page.click('#whereSeg [data-w="both"]'); await page.click('#takesUp');
  await page.click('#goBtn'); await page.waitForTimeout(3500);
  ok(sent.length===2 && new Set(sent.map(s => new URL(s.url).port)).size===2, 'two takes go to the two PCs');

  // ---- the join, for real: two mp4 pieces → ComfyUI Concatenate Video ----
  const dir = path.join(OUT, 'H3Deck', 'jointest'); fs.mkdirSync(dir, {recursive:true});
  for(const [i, f] of [[1, 440], [2, 660]]) execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc=size=416x240:rate=24 -f lavfi -i sine=frequency=${f} -t 2 -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -shortest "${path.join(dir, 'piece_0' + i + '_00001_.mp4')}"`);
  await page.evaluate(A => { const t = {id:'tjoin', t:Date.now(), pc:A, model:'dasiwaminimaxh3_dasiwahybridv2', turbo:true, w:416, h:240, seed:1, name:'jointest_all', dir:'H3Deck/jointest', prompt:'join test', seconds:4, imgs:[], vids:[], auds:[], follow:[], state:'working',
    pieces:[1, 2].map(i => ({start:(i - 1) * 2, gen:48, deliv:48, ctx:i > 1 ? 22 : 0, state:'done', file:{filename:'piece_0' + i + '_00001_.mp4', subfolder:'H3Deck/jointest', type:'output'}}))};
    H3.S.takes.unshift(t); }, A);
  await page.waitForFunction(() => { const t = H3.S.takes.find(x => x.id==='tjoin'); return t && t.state==='done'; }, null, {timeout:60000}).catch(() => {});
  const jt = await page.evaluate(() => H3.S.takes.find(x => x.id==='tjoin'));
  console.log('join:', JSON.stringify({state:jt.state, final:jt.final, err:jt.joinErr}));
  ok(jt.final && jt.final.filename, 'pieces joined into one file');
  if(jt.final){ const f = path.join(OUT, jt.final.subfolder, jt.final.filename), d = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim(), st2 = execSync(`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${f}"`).toString().trim().split('\n');
    console.log('joined file', f, d, st2); ok(Math.abs(+d - 4) < 0.2 && st2.includes('audio') && st2.includes('video'), 'joined clip is 4 s with picture and sound'); }
  await page.waitForTimeout(500);
  await page.screenshot({path:path.join(__dirname, 'screen_list.png'), fullPage:false});
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({path:path.join(__dirname, 'screen_top.png'), fullPage:true});
  await br.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
