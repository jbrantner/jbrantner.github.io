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
for s in range(1, steps + 1, 100): sys.stderr.write('steps: %d%%| %d/%d [00:01<00:01]\\r' % (s * 100 // steps, s, steps))
open(os.path.join(out, name + '.safetensors'), 'w').close()
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
    v = json.loads((await PS.instance.routes.h[('GET', '/renderdeck/auto')](None)).body)
    ok(v['jobs'][-1]['id'] == jid and 'turn_graph' not in v['jobs'][-1], 'the app reads the run without its graphs')
    await run.cleanup()
asyncio.run(main())
print(len(fails), 'failed' if fails else 'all passed'); sys.exit(1 if fails else 0)
