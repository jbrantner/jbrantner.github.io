"""🌿 Make it MOSS: the helper moves a model file from checkpoints to diffusion_models (and back), never over a file.
Run: python3 tests/t_move.py (needs aiohttp)"""
import asyncio, json, os, sys, types, tempfile
from aiohttp import web
from aiohttp.test_utils import make_mocked_request
root = tempfile.mkdtemp(); D = {k: os.path.join(root, k) for k in ('checkpoints', 'diffusion_models')}
for d in D.values(): os.makedirs(d)
fp = types.ModuleType('folder_paths'); fp.get_folder_paths = lambda k: [D[k]]; fp.get_filename_list = lambda k: os.listdir(D[k])
fp.get_full_path = lambda k, n: os.path.join(D[k], n) if os.path.exists(os.path.join(D[k], n)) else None
fp.get_save_image_path = lambda *a, **k: None; fp.get_output_directory = lambda: root; fp.filename_list_cache = {'checkpoints': 1}
sys.modules['folder_paths'] = fp
srv = types.ModuleType('server'); srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef())); sys.modules['server'] = srv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'comfyui'))
import render_deck_models as H
fails = []
def ok(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
async def call(body):
    req = make_mocked_request('POST', '/renderdeck/move_model')
    async def js(): return body
    req.json = js
    r = await H.move_model(req); return r.status, json.loads(r.body)
async def main():
    open(os.path.join(D['checkpoints'], 'dirtyMoss_3317613.safetensors'), 'wb').write(b'x' * 10)
    s, j = await call({'name': 'dirtyMoss_3317613.safetensors'})
    ok(s == 200 and os.path.exists(os.path.join(D['diffusion_models'], 'dirtyMoss_3317613.safetensors')) and not os.listdir(D['checkpoints']), 'moved to diffusion_models: ' + str(j))
    ok('checkpoints' not in fp.filename_list_cache, "ComfyUI's cached file list is dropped")
    open(os.path.join(D['checkpoints'], 'dirtyMoss_3317613.safetensors'), 'wb').write(b'y')
    s, j = await call({'name': 'dirtyMoss_3317613.safetensors'})
    ok(s == 400 and 'already' in j['error'] and open(os.path.join(D['diffusion_models'], 'dirtyMoss_3317613.safetensors'), 'rb').read() == b'x' * 10, 'never over an existing file: ' + j.get('error', ''))
    s, j = await call({'name': '../../etc/passwd'}); ok(s == 400, 'a name outside the folder is refused')
    s, j = await call({'name': 'x.safetensors', 'to': 'loras'}); ok(s == 400, 'only checkpoints <-> diffusion_models')
    s, j = await call({'name': 'dirtyMoss_3317613.safetensors', 'from': 'diffusion_models', 'to': 'checkpoints'}); ok(s == 400, 'back the other way refused while a file is there')
    ok(bool(H.STAYS_PUT.search('moss_style.safetensors')), 'MOSS files never sync')
asyncio.run(main())
print('all passed' if not fails else '%d FAILED' % len(fails)); sys.exit(1 if fails else 0)
