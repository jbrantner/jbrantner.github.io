"""⚡ scrub copies: GET /renderdeck/h3proxy makes a small copy of a clip (long side 640, keyframe every 6 frames, same length,
sound kept), once, and serves it with byte ranges. Run: CLIP=some.mp4 python3 tests/t_h3proxy.py (needs aiohttp, av, numpy)"""
import asyncio, os, shutil, sys, tempfile, types, time
from aiohttp import web
from aiohttp.test_utils import TestServer, TestClient

OUT = tempfile.mkdtemp()
fp = types.ModuleType('folder_paths')
fp.get_save_image_path = lambda *a, **k: None
fp.get_output_directory = lambda: OUT
fp.get_folder_paths = lambda k: [OUT]
fp.get_filename_list = lambda k: []
sys.modules['folder_paths'] = fp
srv = types.ModuleType('server')
srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef(), loop=None))
sys.modules['server'] = srv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'comfyui'))
import render_deck_models as H
import av
H.PX_DIR = os.path.join(OUT, '_px')
fails = 0


def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m)
    if not c:
        fails += 1


async def main():
    clip = os.environ.get('CLIP')
    if not clip:
        print('set CLIP to a short video'); sys.exit(2)
    os.makedirs(os.path.join(OUT, 'Output_Render', 'H3Deck'))
    shutil.copy(clip, os.path.join(OUT, 'Output_Render', 'H3Deck', 'c_00001_.mp4'))
    app = web.Application(); app.add_routes(srv.PromptServer.instance.routes)
    async with TestClient(TestServer(app)) as cl:
        q = {'filename': 'c_00001_.mp4', 'subfolder': 'Output_Render/H3Deck', 'type': 'output'}
        t0 = time.time(); r = await cl.get('/renderdeck/h3proxy', params=q); b = await r.read(); t1 = time.time() - t0
        ok(r.status == 200 and r.headers.get('Content-Type') == 'video/mp4' and len(b) > 1000, 'a copy comes back (%d KB in %.1f s)' % (len(b) // 1024, t1))
        p = os.path.join(OUT, 'x.mp4'); open(p, 'wb').write(b)
        with av.open(clip) as a, av.open(p) as c:
            va, vc = a.streams.video[0], c.streams.video[0]
            da, dc = float(va.duration * va.time_base), float(vc.duration * vc.time_base)
            fa = sum(1 for _ in a.decode(va)); c.seek(0); fr = list(c.decode(vc))
            keys = [i for i, f in enumerate(fr) if f.key_frame]
            ok(max(vc.codec_context.width, vc.codec_context.height) <= 640, 'long side at most 640 (%dx%d)' % (vc.codec_context.width, vc.codec_context.height))
            ok(len(fr) == fa and abs(da - dc) < 0.1, 'same frames and length (%d/%d, %.2f/%.2f s)' % (len(fr), fa, dc, da))
            ok(len(keys) > 1 and max(b - a for a, b in zip(keys, keys[1:] + [len(fr)])) <= 6, 'a keyframe every 6 frames or sooner: ' + str(keys[:8]))
            ok(bool(c.streams.audio) == bool(a.streams.audio), 'sound kept')
        r2 = await cl.get('/renderdeck/h3proxy', params=q, headers={'Range': 'bytes=0-99'})
        ok(r2.status == 206 and len(await r2.read()) == 100, 'byte ranges work (the video element seeks with them)')
        t0 = time.time(); r3 = await cl.get('/renderdeck/h3proxy', params=q); await r3.read()
        ok(time.time() - t0 < 0.5 and len(os.listdir(H.PX_DIR)) == 1, 'made once, then served from disk')
        r4 = await cl.get('/renderdeck/h3proxy', params={'filename': 'nope.mp4', 'subfolder': 'x'})
        ok(r4.status == 404, 'a missing clip is a 404')
    shutil.rmtree(OUT, ignore_errors=True)
    print('ALL PASS' if not fails else '%d FAILED' % fails); sys.exit(1 if fails else 0)

asyncio.run(main())
