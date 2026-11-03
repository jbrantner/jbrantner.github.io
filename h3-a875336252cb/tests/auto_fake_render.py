"""A pretend Render for tests/t_auto.js: the Render Deck helper's real Auto Clip routes and loop, on a fake ComfyUI that
answers /object_info with the nodes Auto Clip uses (input names as on ComfyUI 0.41.3 + H3 Motion Context + the helper),
takes /prompt, runs each job for a moment and writes history. Every queued graph is kept in /tmp/ac_sent.json.
Run: python3 tests/auto_fake_render.py PORT"""
import asyncio, json, os, sys, types
from aiohttp import web

HERE = os.path.dirname(os.path.abspath(__file__))
fp = types.ModuleType('folder_paths')
fp.get_save_image_path = lambda *a, **k: None
fp.get_output_directory = lambda: '/tmp/ac_out'
fp.get_folder_paths = lambda k: ['/tmp']
fp.get_filename_list = lambda k: []
sys.modules['folder_paths'] = fp
srv = types.ModuleType('server')
srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
sys.modules['server'] = srv
sys.path.insert(0, os.path.join(HERE, '..', '..', 'rd-ca7a819000b8', 'source', 'comfyui'))
import render_deck_models as H

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18388
H.AC_FILE = '/tmp/render_deck_autoclip_t_auto.json'
if os.path.exists(H.AC_FILE):
    os.remove(H.AC_FILE)
H._me = lambda: 'http://127.0.0.1:%d' % PORT
H._pc = lambda: 'Output_Render'
H._shared = lambda: True
H._kohya_running = lambda: False
H.AC_QUIET, H.AC_TICK = 1, 0.2

C = lambda *o: [list(o)]
F = lambda d=0: ['FLOAT', {'default': d}]
I = lambda d=0: ['INT', {'default': d}]
ST = lambda d='': ['STRING', {'default': d}]
B = lambda d=False: ['BOOLEAN', {'default': d}]
OI = {
    'UNETLoader': {'required': {'unet_name': C('singularityV2X10eros_prismPIKA.safetensors', 'z_image_turbo_bf16.safetensors', 'minimax_h3_fl2va_int8.safetensors'), 'weight_dtype': C('default', 'fp8_e4m3fn')}},
    'LoraLoaderModelOnly': {'required': {'model': ['MODEL'], 'lora_name': C('minimax_h3_afkj_style.safetensors', 'minimax_h3_ref2v_turbo_4step.safetensors'), 'strength_model': F(1)}},
    'CLIPLoader': {'required': {'clip_name': C('minimax_h3_text_encoder.safetensors', 'qwen_3_4b.safetensors'), 'type': C('stable_diffusion', 'minimax', 'lumina2')}, 'optional': {'device': C('default', 'cpu')}},
    'VAELoader': {'required': {'vae_name': C('minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae.safetensors', 'ae.safetensors')}},
    'MiniMaxH3ReferenceToVideo': {'required': {'clip': ['CLIP'], 'vae': ['VAE'], 'audio_vae': ['VAE'], 'prompt': ST(), 'width': I(768), 'height': I(432), 'length': I(121), 'ref_image_size': C('match', 'original')},
                                  'optional': {'ref_images': ['COMFY_AUTOGROW_V3', {}]}},
    'MMH3FitReferences': {'required': {'width': I(), 'height': I(), 'length': I(), 'memory_budget': I(45000), 'video_seconds': F(5), 'image_size': C('match', 'original'), 'keyframes': I(0), 'stop_above': I(72000)},
                          'optional': {('image_%d' % k): ['IMAGE'] for k in range(1, 10)}},
    'MiniMaxH3MotionContext': {'required': {'conditioning': ['CONDITIONING'], 'vae': ['VAE'], 'latent': ['LATENT'], 'context_length': C('22', '14'), 'audio_context_length': I(24)}, 'optional': {'context_latent': ['LATENT']}},
    'MiniMaxH3MotionContextLoadLatent': {'required': {'latent_path': ST(), 'clip_index': I(0)}},
    'MiniMaxH3MotionContextSaveLatent': {'required': {'latent': ['LATENT'], 'filename_prefix': ST(), 'clip_index': I(1)}},
    'MiniMaxH3MotionContextTrim': {'required': {'images': ['IMAGE'], 'trim_frames': ['INT'], 'fps': F(24), 'match_tail': B(True)}, 'optional': {'audio': ['AUDIO']}},
    'LoadImage': {'required': {'image': C('autoclip/hyp_x.png')}},
    'BasicGuider': {'required': {'model': ['MODEL'], 'conditioning': ['CONDITIONING']}},
    'BasicScheduler': {'required': {'model': ['MODEL'], 'scheduler': C('simple', 'normal'), 'steps': I(20), 'denoise': F(1)}},
    'KSamplerSelect': {'required': {'sampler_name': C('euler', 'res_multistep')}},
    'RandomNoise': {'required': {'noise_seed': I(0)}},
    'SamplerCustomAdvanced': {'required': {'noise': ['NOISE'], 'guider': ['GUIDER'], 'sampler': ['SAMPLER'], 'sigmas': ['SIGMAS'], 'latent_image': ['LATENT']}},
    'VAEDecodeTiled': {'required': {'samples': ['LATENT'], 'vae': ['VAE'], 'tile_size': I(512), 'overlap': I(64), 'temporal_size': I(64), 'temporal_overlap': I(8)}},
    'VAEDecodeAudio': {'required': {'samples': ['LATENT'], 'vae': ['VAE']}},
    'CreateVideo': {'required': {'images': ['IMAGE'], 'fps': F(30)}, 'optional': {'audio': ['AUDIO']}},
    'SaveVideo': {'required': {'video': ['VIDEO'], 'filename_prefix': ST('video/ComfyUI'), 'format': ['COMFY_DYNAMICCOMBO_V3', {}]}},
    'RenderDeckH3Join': {'required': {'video': ['VIDEO'], 'folder': ST(), 'before': I(1), 'filename_prefix': ST()}},
    'ModelSamplingAuraFlow': {'required': {'model': ['MODEL'], 'shift': F(1.73)}},
    'EmptySD3LatentImage': {'required': {'width': I(1024), 'height': I(1024), 'batch_size': I(1)}},
    'ConditioningZeroOut': {'required': {'conditioning': ['CONDITIONING']}},
    'KSampler': {'required': {'model': ['MODEL'], 'seed': I(0), 'steps': I(20), 'cfg': F(8), 'sampler_name': C('euler', 'res_multistep'), 'scheduler': C('simple', 'normal'), 'positive': ['CONDITIONING'], 'negative': ['CONDITIONING'], 'latent_image': ['LATENT'], 'denoise': F(1)}},
    'CLIPTextEncode': {'required': {'text': ST(), 'clip': ['CLIP']}},
    'VAEDecode': {'required': {'samples': ['LATENT'], 'vae': ['VAE']}},
    'SaveImage': {'required': {'images': ['IMAGE'], 'filename_prefix': ST('ComfyUI')}},
}
OI = {k: {'input': v} for k, v in OI.items()}
EXTRA = {'SaveVideo': ['format.codec', 'format.codec.encoding', 'format.codec.encoding.crf'], 'MiniMaxH3ReferenceToVideo': ['ref_images.ref_image_%d' % k for k in range(9)]}


def check(g):
    """ComfyUI-like checks: known nodes, every required input there, no unknown inputs, links point at real nodes."""
    errs = []
    for nid, n in g.items():
        d = OI.get(n.get('class_type'))
        if not d:
            errs.append('%s: unknown node %s' % (nid, n.get('class_type')))
            continue
        req, opt = d['input'].get('required', {}), d['input'].get('optional', {})
        for k, spec in req.items():
            if k not in n['inputs'] and not str(spec[0]).startswith('COMFY_'):
                errs.append('%s %s: missing %s' % (nid, n['class_type'], k))
        for k, v in n['inputs'].items():
            if k not in req and k not in opt and k not in EXTRA.get(n['class_type'], []):
                errs.append('%s %s: unknown input %s' % (nid, n['class_type'], k))
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0] not in g:
                errs.append('%s %s: %s links to missing node %s' % (nid, n['class_type'], k, v[0]))
            spec = req.get(k) or opt.get(k)
            if spec and isinstance(spec[0], list) and not isinstance(v, list) and v not in spec[0] and n['class_type'] != 'LoadImage':
                errs.append('%s %s: %s=%r not in its list' % (nid, n['class_type'], k, v))
            if spec and spec[0] == 'INT' and not isinstance(v, (int, list)):
                errs.append('%s %s: %s=%r is not a number' % (nid, n['class_type'], k, v))
            if isinstance(v, str) and '@@' in v:
                errs.append('%s %s: %s still has a placeholder' % (nid, n['class_type'], k))
    return errs


class Comfy:
    def __init__(self):
        self.queue, self.running, self.history, self.sent, self.n = [], None, {}, [], 0

    async def worker(self):
        while True:
            if not self.running and self.queue:
                pid = self.running = self.queue.pop(0)
                b = next(x for x in self.sent if x['pid'] == pid)
                for _ in range(15):
                    await asyncio.sleep(0.05)
                    if self.running != pid:
                        break
                if self.running == pid:
                    outs = {}
                    for nid, n in b['prompt'].items():
                        if n['class_type'] in ('SaveImage', 'SaveVideo', 'RenderDeckH3Join'):
                            pre = n['inputs']['filename_prefix']
                            outs[nid] = {'images': [{'filename': pre.split('/')[-1] + '_00001_.' + ('png' if n['class_type'] == 'SaveImage' else 'mp4'),
                                                     'subfolder': 'Output_Render/' + '/'.join(pre.split('/')[:-1]), 'type': 'output'}]}
                    self.history[pid] = {'status': {'completed': True, 'status_str': 'success', 'messages': []}, 'outputs': outs}
                    self.running = None
                else:
                    self.history[pid] = {'status': {'completed': False, 'status_str': 'error', 'messages': [['execution_interrupted', {}]]}, 'outputs': {}}
            await asyncio.sleep(0.03)


CF = Comfy()


@web.middleware
async def cors(req, handler):
    if req.method == 'OPTIONS':
        r = web.Response()
    else:
        r = await handler(req)
    r.headers.update({'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'})
    return r


r = web.RouteTableDef()


@r.get('/system_stats')
async def stats(req): return web.json_response({'system': {}})


@r.get('/object_info/{node}')
async def oin(req):
    n = req.match_info['node']
    return web.json_response({n: OI[n]} if n in OI else {})


@r.post('/prompt')
async def prompt(req):
    b = await req.json()
    errs = check(b['prompt'])
    CF.n += 1
    pid = 'p%d' % CF.n
    CF.sent.append({'pid': pid, 'prompt': b['prompt'], 'client_id': b.get('client_id'), 'errors': errs})
    json.dump(CF.sent, open('/tmp/ac_sent.json', 'w'))
    if errs:
        return web.json_response({'error': {'message': 'Prompt outputs failed validation'}, 'node_errors': {'1': {'class_type': 'x', 'errors': [{'message': errs[0]}]}}}, status=400)
    CF.queue.append(pid)
    return web.json_response({'prompt_id': pid})


@r.get('/queue')
async def queue(req):
    return web.json_response({'queue_running': [[0, CF.running]] if CF.running else [], 'queue_pending': [[i, p] for i, p in enumerate(CF.queue)]})


@r.post('/queue')
async def qdel(req):
    for p in (await req.json()).get('delete', []):
        if p in CF.queue:
            CF.queue.remove(p)
    return web.json_response({})


@r.post('/interrupt')
async def intr(req):
    CF.running = None
    return web.json_response({})


@r.get('/history/{pid}')
async def hist(req):
    p = req.match_info['pid']
    return web.json_response({p: CF.history[p]} if p in CF.history else {})


@r.post('/upload/image')
async def up(req):
    f = (await req.post())['image']
    return web.json_response({'name': f.filename, 'subfolder': 'autoclip', 'type': 'input'})


@r.get('/view')
async def view(req):
    return web.Response(body=b'\x89PNG\r\n', content_type='image/png')


@r.post('/test/other')  # another app's job lands on Render
async def other(req):
    CF.n += 1
    pid = 'x%d' % CF.n
    CF.sent.append({'pid': pid, 'prompt': {'1': {'class_type': 'SaveImage', 'inputs': {'images': ['9', 0], 'filename_prefix': 'Other/x'}}}, 'client_id': 'renderdeck', 'errors': []})
    CF.queue.append(pid)
    return web.json_response({'prompt_id': pid})


async def main():
    os.makedirs('/tmp/ac_out', exist_ok=True)
    app = web.Application(middlewares=[cors])
    app.add_routes(r)
    app.add_routes([x for x in H.routes if x.path.startswith('/renderdeck/autoclip')])
    rn = web.AppRunner(app)
    await rn.setup()
    await web.TCPSite(rn, '127.0.0.1', PORT).start()
    asyncio.ensure_future(CF.worker())
    print('ready', flush=True)
    while True:
        await asyncio.sleep(3600)


asyncio.run(main())
