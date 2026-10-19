"""The helper's WD tagger: pictures padded square on white, BGR at the model's size, Danbooru tags back with scores,
character tags only above their own threshold. A tiny stand-in model keeps it quick: its blue_hair score follows the
blue channel, red_hair the red one, so a pure blue picture checks the colour order. Run: python3 tests/t_tagger.py
(needs aiohttp, numpy, pillow, onnx, onnxruntime)"""
import asyncio, os, sys, types, tempfile, json
import numpy as np, onnx
from onnx import helper, TensorProto
from PIL import Image
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
ROOT = tempfile.mkdtemp(); OUT = os.path.join(ROOT, 'output'); INP = os.path.join(ROOT, 'input'); MOD = os.path.join(ROOT, 'models')
for d in (OUT, INP, MOD): os.makedirs(d)
fp = types.ModuleType('folder_paths'); fp.get_folder_paths = lambda k: [MOD]; fp.get_filename_list = lambda k: []
fp.get_save_image_path = lambda *a, **k: None; fp.get_output_directory = lambda: OUT; fp.get_input_directory = lambda: INP; fp.models_dir = MOD
sys.modules['folder_paths'] = fp
routes = web.RouteTableDef()
srv = types.ModuleType('server'); srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes)); sys.modules['server'] = srv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'comfyui'))
import render_deck_models as H
# the stand-in model: [1,448,448,3] -> mean per channel -> scores for 4 tags
W = np.array([[0, 20, 0, 4], [0, 0, 0, 0], [0, 0, 20, 0]], dtype=np.float32)  # rows: B, G, R; columns: general, blue_hair, red_hair, hatsune_miku
g = helper.make_graph([
    helper.make_node('ReduceMean', ['x', 'axes'], ['m'], keepdims=0),
    helper.make_node('Div', ['m', 'k255'], ['n']), helper.make_node('Sub', ['n', 'half'], ['c']),
    helper.make_node('MatMul', ['c', 'w'], ['z']), helper.make_node('Sigmoid', ['z'], ['y'])], 'wd',
  [helper.make_tensor_value_info('x', TensorProto.FLOAT, [1, 448, 448, 3])], [helper.make_tensor_value_info('y', TensorProto.FLOAT, [1, 4])],
  [helper.make_tensor('axes', TensorProto.INT64, [2], [1, 2]), helper.make_tensor('k255', TensorProto.FLOAT, [], [255.0]),
   helper.make_tensor('half', TensorProto.FLOAT, [], [0.5]), helper.make_tensor('w', TensorProto.FLOAT, [3, 4], W.flatten().tolist())])
os.makedirs(H._wd_dir())
onnx.save(helper.make_model(g, opset_imports=[helper.make_opsetid('', 18)], ir_version=9), os.path.join(H._wd_dir(), 'model.onnx'))
open(os.path.join(H._wd_dir(), 'selected_tags.csv'), 'w').write('tag_id,name,category,count\n1,general,9,1\n2,blue_hair,0,1\n3,red_hair,0,1\n4,hatsune_miku,4,1\n')
os.makedirs(os.path.join(OUT, 'RenderDeck', 'datasets', 'x'))
Image.new('RGB', (300, 300), (0, 0, 255)).save(os.path.join(OUT, 'RenderDeck', 'datasets', 'x', 'x_01.png'))
Image.new('RGB', (300, 300), (255, 0, 0)).save(os.path.join(INP, 'red.png'))

async def main():
    fails = []
    def ok(c, m):
        print(('ok   ' if c else 'FAIL ') + m)
        if not c: fails.append(m)
    app = web.Application(); app.add_routes(routes)
    async with TestClient(TestServer(app)) as cl:
        st = await (await cl.get('/renderdeck/tagger')).json()
        ok(st['ready'] and st['model'] == 'SmilingWolf/wd-eva02-large-tagger-v3', 'the tagger says it is ready: ' + json.dumps(st))
        r = await cl.post('/renderdeck/tag', json={'images': [{'filename': 'x_01.png', 'subfolder': 'RenderDeck/datasets/x', 'type': 'output'}, {'filename': 'red.png', 'type': 'input'}], 'threshold': 0.5, 'character_threshold': 0.99})
        j = await r.json(); print('  ', json.dumps(j))
        a, b = j['results']
        ok([t for t, _ in a['general']] == ['blue_hair'] and [t for t, _ in b['general']] == ['red_hair'], 'a blue picture gets blue_hair, a red one red_hair (colours sent in the model\'s BGR order)')
        ok(a['general'][0][1] > 0.99 and 'general' in a['rating'] and not any(t == 'general' for t, _ in a['general']), 'scores come back, ratings apart from the tags')
        ok(a['character'] == [], 'a character tag needs its own higher score (0.99 here; it scored 0.88)')
        r2 = await cl.post('/renderdeck/tag', json={'images': [{'filename': 'x_01.png', 'subfolder': 'RenderDeck/datasets/x', 'type': 'output'}], 'threshold': 0.5, 'character_threshold': 0.85})
        ok([t for t, _ in (await r2.json())['results'][0]['character']] == ['hatsune_miku'], 'and is returned when it clears it')
        r3 = await cl.post('/renderdeck/tag', json={'images': [{'filename': '../../secret.png', 'subfolder': '..', 'type': 'output'}]})
        ok(r3.status == 400, 'nothing outside the output folder is read')
        os.remove(os.path.join(H._wd_dir(), 'model.onnx'))
        st = await (await cl.get('/renderdeck/tagger')).json(); r4 = await cl.post('/renderdeck/tag', json={'images': []})
        ok(not st['ready'] and r4.status == 400 and 'not on this computer' in (await r4.json())['error'], 'without the model it says so')
    print(len(fails) and '%d FAILED' % len(fails) or 'all passed'); sys.exit(1 if fails else 0)
asyncio.run(main())
