"""Auto run on the helper, end to end against a pretend ComfyUI: turnaround -> angles -> shots -> picked set -> a pretend
kohya. Run: python3 tests/t_auto.py (needs av, numpy, pillow, aiohttp)."""
import asyncio, json, os, sys, tempfile, types, time
import numpy as np, av
from PIL import Image, ImageDraw, ImageFilter
from aiohttp import web

T = tempfile.mkdtemp()
OUT, INP = os.path.join(T, 'output'), os.path.join(T, 'input')
for d in (OUT, INP, os.path.join(T, 'loras'), os.path.join(T, 'ckpt')):
    os.makedirs(d)
open(os.path.join(T, 'ckpt', 'oneObsession_v24.safetensors'), 'w').close()

# stand-ins for ComfyUI's modules
fp = types.ModuleType('folder_paths')
fp.base_path = os.path.join(T, 'ComfyUI')
fp.get_output_directory = lambda: OUT
fp.get_input_directory = lambda: INP
def gsip(prefix, out, *a, **k):
    sub, name = os.path.split(prefix)
    return os.path.join(out, 'Output_Render', sub), name, 1, os.path.join('Output_Render', sub).replace('\\', '/'), prefix
fp.get_save_image_path = gsip
fp.get_full_path = lambda kind, name: os.path.join(T, 'ckpt', name)
fp.get_folder_paths = lambda kind: [os.path.join(T, 'loras')]
sys.modules['folder_paths'] = fp
class R:
    def __init__(self): self.h = {}
    def get(self, p): return lambda f: self.h.setdefault(('GET', p), f)
    def post(self, p): return lambda f: self.h.setdefault(('POST', p), f)
srv = types.ModuleType('server'); PS = types.SimpleNamespace(instance=types.SimpleNamespace(routes=R()))
srv.PromptServer = PS; sys.modules['server'] = srv
ca = types.ModuleType('comfy.cli_args'); ca.args = types.SimpleNamespace(port=18188); sys.modules['comfy'] = types.ModuleType('comfy'); sys.modules['comfy.cli_args'] = ca
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'comfyui'))
import render_deck_models as H
H.AUTO_FILE = os.path.join(T, 'auto.json'); H.AUTO['jobs'] = []

def clip(path, frame):
    with av.open(path, 'w') as c:
        st = c.add_stream('libx264', rate=24); st.width, st.height, st.pix_fmt = 576, 1024, 'yuv420p'
        for i in range(124):
            for p in st.encode(av.VideoFrame.from_image(frame(i))): c.mux(p)
        for p in st.encode(): c.mux(p)
def spin(i):  # a figure whose width follows a turn: narrow at the sides (25% and 75%)
    im = Image.new('RGB', (576, 1024), 'white'); th = 2 * np.pi * i / 123; w = 60 + 300 * abs(np.cos(th + 0.25))
    ImageDraw.Draw(im).rectangle([288 - w / 2, 100, 288 + w / 2, 900], fill=(51, 51, 68)); return im
def action(i):  # stripes, sharp only at frames 40 and 88
    im = Image.new('RGB', (576, 1024), (136, 136, 136)); d = ImageDraw.Draw(im)
    for k in range(40): d.rectangle([10 + k * 14, 0, 16 + k * 14, 1024], fill='black')
    return im if i in (40, 88) else im.filter(ImageFilter.GaussianBlur(6))
os.makedirs(os.path.join(OUT, 'Output_Render', 'clips'))
clip(os.path.join(OUT, 'Output_Render', 'clips', 'turn.mp4'), spin)
clip(os.path.join(OUT, 'Output_Render', 'clips', 'act.mp4'), action)

# a pretend ComfyUI: every prompt finishes at once with the clip its SaveVideo prefix names
HIST, SEEN = {}, []
async def prompt(r):
    b = await r.json(); g = b['prompt']; SEEN.append(g); pid = 'p%d' % len(SEEN)
    save = next(k for k, n in g.items() if n['class_type'] in ('SaveVideo', 'SaveImage'))
    f = 'turn.mp4' if 'turn' in g[save]['inputs']['filename_prefix'] else 'act.mp4'
    HIST[pid] = {'status': {'completed': True, 'status_str': 'success'}, 'outputs': {save: {'images': [{'filename': f, 'subfolder': 'Output_Render/clips'}]}}}
    return web.json_response({'prompt_id': pid})
async def hist(r): pid = r.match_info['pid']; return web.json_response({pid: HIST[pid]} if pid in HIST else {})
async def queue(r): return web.json_response({'queue_running': [], 'queue_pending': []})
async def free(r): return web.json_response({})

# a pretend kohya that counts its steps and leaves a LoRA
K = os.path.join(T, 'kohya'); os.makedirs(os.path.join(K, 'sd-scripts')); os.makedirs(os.path.join(K, 'venv', 'bin'))
open(os.path.join(K, 'sd-scripts', 'sdxl_train_network.py'), 'w').write('''import sys, os
a = sys.argv; out, name, steps = a[a.index('--output_dir') + 1], a[a.index('--output_name') + 1], int(a[a.index('--max_train_steps') + 1])
data = a[a.index('--train_data_dir') + 1]; assert os.listdir(data), 'no data'
open(os.path.join(out, name + '.args'), 'w').write(' '.join(a))
for s in range(1, steps + 1, 100): sys.stderr.write('steps: %d%%| %d/%d [00:01<00:01]\\r' % (s * 100 // steps, s, steps))
open(os.path.join(out, name + '.safetensors'), 'w').close()
''')
os.makedirs(os.path.join(K, 'sd-scripts', 'networks'))
open(os.path.join(K, 'sd-scripts', 'networks', 'sdxl_merge_lora.py'), 'w').write('''import sys
a = sys.argv; open(a[a.index('--save_to') + 1], 'w').write(a[a.index('--models') + 1] + ' ' + a[a.index('--ratios') + 1])
''')
os.symlink(sys.executable, os.path.join(K, 'venv', 'bin', 'python'))
H._kohya_find = lambda: (os.path.join(K, 'sd-scripts'), os.path.join(K, 'venv', 'bin', 'python'))
H._gpu_c = lambda: 60

fails = []
def ok(c, m): print(('ok   ' if c else 'FAIL ') + m); (None if c else fails.append(m))

async def main():
    app = web.Application(); app.router.add_post('/prompt', prompt); app.router.add_get('/history/{pid}', hist); app.router.add_get('/queue', queue); app.router.add_post('/free', free)
    run = web.AppRunner(app); await run.setup(); await web.TCPSite(run, '127.0.0.1', 18188).start()
    sides = H._find_sides(os.path.join(OUT, 'Output_Render', 'clips', 'turn.mp4'))
    ok(abs(sides['right'] - 26.6) <= 3 and abs(sides['left'] - 88.1) <= 3 and abs(sides['back'] - 57.4) <= 4, 'angles found at the narrowest silhouettes: ' + json.dumps(sides))
    ok(sorted(H._sharpest(os.path.join(OUT, 'Output_Render', 'clips', 'act.mp4'), 2)) == [40, 88], 'the two sharpest moments: %s' % H._sharpest(os.path.join(OUT, 'Output_Render', 'clips', 'act.mp4'), 2))
    vg = lambda p: {'graph': {'1': {'class_type': 'LoadImage', 'inputs': {'image': '@SIDE'}}, '2': {'class_type': 'LoadImage', 'inputs': {'image': '@BACK'}}, '3': {'class_type': 'SaveVideo', 'inputs': {'filename_prefix': p}}}, 'save': '3'}
    body = {'char': 'Lib', 'until': 'lora', 'turn_graph': vg('RenderDeck/characters/turn/Lib'), 'src': 'ref.png', 'angles_prefix': 'RenderDeck/characters/angles/Lib', 'shots_prefix': 'RenderDeck/characters/shots/Lib',
            'shots': [{'say': 'sits', 'tags': 'sitting, chair'}, {'say': 'walks', 'tags': 'walking'}], 'shot_graphs': [vg('RenderDeck/characters/shots/Lib_clip_a'), vg('RenderDeck/characters/shots/Lib_clip_b')],
            'trigger': 'lib rd', 'who': '1girl', 'dataset_dir': 'RenderDeck/datasets/lib_rd', 'ckpt': 'oneObsession_v24.safetensors', 'steps': 300, 'pc': 'https://render.ts.net'}
    r = await PS.instance.routes.h[('POST', '/renderdeck/auto/start')](types.SimpleNamespace(json=lambda: asyncio.sleep(0, body)))
    jid = json.loads(r.body)['id']
    for _ in range(200):
        await asyncio.sleep(0.2)
        j = next(x for x in H.AUTO['jobs'] if x['id'] == jid)
        if j['state'] != 'running': break
    ok(j['state'] == 'done', 'the run finishes: %s %s' % (j['state'], j.get('text')))
    ok(len(j.get('angles', {})) == 6 and all(os.path.exists(H._outfile(f)) for f in j['angles'].values()), 'six angle pictures saved')
    im = Image.open(H._outfile(j['angles']['front'])); ok(im.size == (864, 1536), 'angles are 1.5x bigger: %s' % (im.size,))
    shot_g = [g for g in SEEN if '@SIDE' not in json.dumps(g) and 'clip_' in json.dumps(g)]
    ok(len(shot_g) == 2 and all(g['1']['inputs']['image'].startswith('rdauto_') and g['2']['inputs']['image'].endswith('_back.png') for g in shot_g), 'shots look at the angles this run found')
    ok(all(len(x.get('frames', [])) == 2 for x in j['shots']), 'two frames from each shot')
    ok(6 <= len(j['picks']) <= 10, 'near-repeat shot frames dropped from the set: %d picked' % len(j['picks']))
    d = os.path.join(K, 'data', 'lib_rd', '10_lib_rd'); caps = sorted(open(os.path.join(d, f)).read() for f in os.listdir(d) if f.endswith('.txt'))
    ok(any(c.startswith('lib_rd, 1girl, solo, standing, a-pose') and 'from behind' in c for c in caps), 'captions: ' + caps[0])
    ok(os.path.exists(os.path.join(OUT, 'RenderDeck', 'datasets', 'lib_rd')) and j['pick_note'], 'the set is also in the output folder, with a note when short: ' + j['pick_note'])
    ok(j['lora'] == 'lib_rd.safetensors' and os.path.exists(os.path.join(T, 'loras', j['lora'])) and j.get('train_steps') == 300, 'the LoRA is trained into the loras folder: %s %s' % (j.get('lora'), j.get('train_steps')))
    args = open(os.path.join(T, 'loras', 'lib_rd.args')).read()
    ok('--text_encoder_lr' in args and '--network_dim 32' in args and '--cache_text_encoder_outputs' not in args and '--base_weights' not in args, 'trains rank 32 with the text encoders, no style mixed in unless asked')
    ok('merged' not in args, 'no merged checkpoint without a style')
    # train again from that run's pictures: new trigger word, the style LoRA mixed into the checkpoint
    open(os.path.join(T, 'ckpt', 'AFKJ Style.safetensors'), 'w').close()
    rb = {'from': jid, 'trigger': 'lib x', 'steps': 200, 'style_lora': 'AFKJ Style.safetensors', 'style_mult': 1}
    r = await PS.instance.routes.h[('POST', '/renderdeck/auto/retrain')](types.SimpleNamespace(json=lambda: asyncio.sleep(0, rb)))
    rid = json.loads(r.body)['id']
    for _ in range(100):
        await asyncio.sleep(0.2)
        j2 = next(x for x in H.AUTO['jobs'] if x['id'] == rid)
        if j2['state'] != 'running': break
    ok(j2['state'] == 'done' and j2['lora'] == 'lib_x.safetensors' and j2['ckpt'] == 'oneObsession_v24.safetensors', 'the retrain makes lib_x on the same checkpoint: %s %s' % (j2['state'], j2.get('text')))
    d2 = os.path.join(K, 'data', 'lib_x', '10_lib_x'); caps2 = [open(os.path.join(d2, f)).read() for f in os.listdir(d2) if f.endswith('.txt')]
    ok(len(caps2) == len(caps) and all(c.startswith('lib_x, 1girl') and 'lib_rd' not in c for c in caps2), 'the same pictures, captions start with the new trigger: ' + caps2[0])
    a2 = open(os.path.join(T, 'loras', 'lib_x.args')).read()
    mg = os.path.join(K, 'merged', 'oneObsession_v24_AFKJ_Style_1.safetensors')
    ok(os.path.exists(mg) and '--pretrained_model_name_or_path ' + mg in a2 and '--base_weights' not in a2, 'the style LoRA is baked into a copy of the checkpoint, and it trains on that')
    v = json.loads((await PS.instance.routes.h[('GET', '/renderdeck/auto')](None)).body)
    ok(v['jobs'][-2]['id'] == jid and 'turn_graph' not in v['jobs'][-2], 'the app reads the run without its graphs')
    # kohya started by hand (not by an auto run) still counts as training, so the farm leaves this computer alone
    import subprocess
    pr = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(20)', 'sdxl_train_network.py'])
    await asyncio.sleep(0.5); H._KOHYA_SEEN[0] = 0; seen = H._kohya_running(); pr.kill()
    # and ComfyUI's own queue holds its renders meanwhile
    ex = types.ModuleType('execution')
    class PQ:
        def get(self, timeout=None): return ('prompt', 1)
    ex.PromptQueue = PQ; sys.modules['execution'] = ex; H._hold_queue_while_training()
    H._KOHYA_SEEN[:] = [time.time(), True]; held = PQ().get(1)
    H._KOHYA_SEEN[:] = [time.time(), False]; after = PQ().get(1)
    ok(held is None and after == ('prompt', 1), 'ComfyUI holds its queue while kohya trains, then carries on')
    r = await PS.instance.routes.h[('GET', '/renderdeck/jobs')](None)
    ok(seen and 'training' in json.loads(r.body), 'a hand-started kohya shows as training in /renderdeck/jobs')
    # the Character Creator's run (2026-10-27): starts at the shots, with her finished cut-out angles given (always kept, on white)
    cc = os.path.join(OUT, 'Output_Render', 'RenderDeck', 'cc'); os.makedirs(cc)
    given = []
    for n in range(10):
        im = Image.new('RGBA', (768, 1344), (0, 0, 0, 0)); ImageDraw.Draw(im).rectangle([300 - n * 8, 200, 470 + n * 8, 1200], fill=(200, 40, 90, 255)); im.save(os.path.join(cc, 'f_%d.png' % n))
        given.append({'filename': 'f_%d.png' % n, 'subfolder': 'Output_Render/RenderDeck/cc', 'cap': 'standing, full body, white background' + (', from side' if n == 2 else '')})
    vf = lambda p: {'graph': {'1': {'class_type': 'LoadImage', 'inputs': {'image': '@FRONT'}}, '2': {'class_type': 'LoadImage', 'inputs': {'image': '@SIDE'}}, '3': {'class_type': 'LoadImage', 'inputs': {'image': '@BACK'}}, '4': {'class_type': 'SaveVideo', 'inputs': {'filename_prefix': p}}}, 'save': '4'}
    cb = {'char': 'Ellie', 'until': 'lora', 'only': ['shots', 'pick', 'train'], 'front': given[0], 'side': given[2], 'back': given[4], 'given': given,
          'shots_prefix': 'RenderDeck/characters/shots/Ellie', 'shots': [{'say': 'sits', 'tags': 'sitting, chair'}], 'shot_graphs': [vf('RenderDeck/characters/shots/Ellie_clip_a')],
          'trigger': 'elliex', 'who': '1girl', 'dataset_dir': 'RenderDeck/datasets/elliex', 'ckpt': 'oneObsession_v24.safetensors', 'steps': 200, 'pc': 'https://render.ts.net'}
    bad = dict(cb, given=given + [{'filename': 'gone.png', 'subfolder': 'x'}])
    r = await PS.instance.routes.h[('POST', '/renderdeck/auto/start')](types.SimpleNamespace(json=lambda: asyncio.sleep(0, bad)))
    ok(r.status == 400 and 'gone.png' in r.body.decode(), 'a picture missing from the output folder is turned down at the start: ' + r.body.decode()[:120])
    SEEN.clear()
    r = await PS.instance.routes.h[('POST', '/renderdeck/auto/start')](types.SimpleNamespace(json=lambda: asyncio.sleep(0, cb)))
    cid = json.loads(r.body)['id']
    for _ in range(200):
        await asyncio.sleep(0.2)
        j3 = next(x for x in H.AUTO['jobs'] if x['id'] == cid)
        if j3['state'] != 'running': break
    ok(j3['state'] == 'done' and j3['done'] == ['shots', 'pick', 'train'] and not j3.get('turn') and j3['lora'] == 'elliex.safetensors', 'her LoRA run skips the turnaround and angles: %s %s %s' % (j3['state'], j3.get('done'), j3.get('text')))
    g = SEEN[0]; ims = [g[k]['inputs']['image'] for k in '123']
    ok(len(SEEN) == 1 and ims == ['rdauto_%s_front.png' % cid, 'rdauto_%s_side.png' % cid, 'rdauto_%s_back.png' % cid], 'MiniMax gets her front, side and back: %s' % ims)
    fi = Image.open(os.path.join(INP, ims[0])); ok(fi.mode == 'RGB' and fi.getpixel((5, 5)) == (255, 255, 255), 'her cut-out goes to MiniMax on white')
    d3 = os.path.join(K, 'data', 'elliex', '10_elliex'); pics = sorted(f for f in os.listdir(d3) if f.endswith('.png')); caps3 = [open(os.path.join(d3, f)).read() for f in sorted(os.listdir(d3)) if f.endswith('.txt')]
    ok(len(pics) >= 10 and sum(c.endswith('white background') or 'white background, from side' in c for c in caps3) == 10 and caps3[0].startswith('elliex, 1girl, solo, standing'), 'all 10 given angles are in the set with their captions, plus shot frames: %d pictures, %s' % (len(pics), caps3[2]))
    ti = Image.open(os.path.join(d3, pics[0])); ok(ti.mode == 'RGB' and ti.getpixel((5, 5)) == (255, 255, 255), 'and kohya gets them on white')
    # 📚 Character Library: her angles copied as they are (see-through), character.json, listed, left out of the renders browser
    R = PS.instance.routes.h
    J = lambda b: types.SimpleNamespace(json=lambda: asyncio.sleep(0, b))
    pics = [dict(ring=1, i=n % 8, mid=n >= 8, filename='f_%d.png' % n, subfolder='Output_Render/RenderDeck/cc') for n in range(10)]
    r = await R[('POST', '/renderdeck/library/save')](J({'name': 'Ellie', 'meta': {'trigger': 'elliex', 'lora': 'elliex.safetensors'}, 'pics': pics}))
    ok(r.status == 200 and json.loads(r.body)['n'] == 10, 'her angles go into the library: ' + r.body.decode()[:100])
    ld = os.path.join(OUT, 'Character Library', 'Ellie')
    li = Image.open(os.path.join(ld, 'eye_000.png')); cj = json.load(open(os.path.join(ld, 'character.json')))
    ok(li.mode == 'RGBA' and li.getpixel((5, 5))[3] == 0 and os.path.exists(os.path.join(ld, 'eye_022.5.png')) and cj['trigger'] == 'elliex' and len(cj['views']) == 10, 'kept see-through, named by height and turn, with her LoRA in character.json: %s' % sorted(os.listdir(ld))[:4])
    lst = json.loads((await R[('GET', '/renderdeck/library')](types.SimpleNamespace(query={}))).body)
    ok(len(lst['characters']) == 1 and lst['characters'][0]['subfolder'] == 'Character Library/Ellie', 'the library lists her: %s' % lst)
    imgs = json.loads((await R[('GET', '/renderdeck/images')](types.SimpleNamespace(query={'limit': '200'}))).body)['images']
    ok(not any('Character Library' in x['subfolder'] for x in imgs), 'the renders browser leaves the library out')
    r = await R[('POST', '/renderdeck/library/save')](J({'name': 'Ellie', 'pics': pics + [dict(ring=1, i=0, filename='nope.png', subfolder='x')]}))
    ok(r.status == 400, 'a missing angle is turned down')
    await R[('POST', '/renderdeck/library/delete')](J({'name': 'Ellie'}))
    ok(not os.path.exists(ld), 'taken out of the library')
    # 🪑 an object goes to the Object Library, listed on its own
    r = await R[('POST', '/renderdeck/library/save')](J({'name': 'Chair', 'kind': 'obj', 'meta': {'kind': 'obj', 'height': 0.9}, 'pics': pics}))
    od = os.path.join(OUT, 'Object Library', 'Chair')
    ok(r.status == 200 and os.path.exists(os.path.join(od, 'object.json')) and os.path.exists(os.path.join(od, 'eye_000.png')), 'an object goes to the Object Library: %s' % r.body.decode()[:100])
    lo = json.loads((await R[('GET', '/renderdeck/library')](types.SimpleNamespace(query={'kind': 'obj'}))).body)
    lc = json.loads((await R[('GET', '/renderdeck/library')](types.SimpleNamespace(query={}))).body)
    ok([x['subfolder'] for x in lo['objects']] == ['Object Library/Chair'] and lo['objects'][0]['height'] == 0.9 and not lc['characters'], 'objects are listed apart from characters: %s' % lo)
    imgs = json.loads((await R[('GET', '/renderdeck/images')](types.SimpleNamespace(query={'limit': '200'}))).body)['images']
    ok(not any('Object Library' in x['subfolder'] for x in imgs), 'the renders browser leaves the Object Library out')
    await R[('POST', '/renderdeck/library/delete')](J({'name': 'Chair', 'kind': 'obj'}))
    ok(not os.path.exists(od), 'and it can be taken out')
    await run.cleanup()
asyncio.run(main())
print(len(fails), 'failed' if fails else 'all passed'); sys.exit(1 if fails else 0)
