"""🎞 scrub frames: GET /renderdeck/h3strip = every frame of a clip as a small JPEG, in one file with a JSON head.
Run: CLIP=some.mp4 python3 tests/t_h3strip.py (needs aiohttp, av, numpy, pillow)"""
import asyncio, io, json, os, shutil, struct, sys, tempfile, types, time
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
from PIL import Image
H.PX_DIR = os.path.join(OUT, '_px')
H.ST_DIR = os.path.join(OUT, '_st')
fails = 0


def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m)
    if not c:
        fails += 1


def unpack(b):
    assert b[:4] == b'H3S1'
    n = struct.unpack('<I', b[4:8])[0]
    return json.loads(b[8:8 + n]), b[8 + n:]


async def main():
    clip = os.environ.get('CLIP')
    if not clip:
        print('set CLIP to a short video'); sys.exit(2)
    os.makedirs(os.path.join(OUT, 'Output_Render', 'H3Deck'))
    shutil.copy(clip, os.path.join(OUT, 'Output_Render', 'H3Deck', 'c_00001_.mp4'))
    with av.open(clip) as a:
        va = a.streams.video[0]; nf = sum(1 for _ in a.decode(va)); fps = float(va.average_rate)
    app = web.Application(); app.add_routes(srv.PromptServer.instance.routes)
    async with TestClient(TestServer(app)) as cl:
        q = {'filename': 'c_00001_.mp4', 'subfolder': 'Output_Render/H3Deck', 'type': 'output'}
        t0 = time.time(); r = await cl.get('/renderdeck/h3strip', params=q); b = await r.read(); t1 = time.time() - t0
        ok(r.status == 200 and r.headers.get('X-H3-Strip') == '1', 'frames come back (%d KB in %.2f s)' % (len(b) // 1024, t1))
        hd, data = unpack(b)
        ok(hd['n'] == nf and abs(hd['fps'] - fps) < 0.01, 'every frame, same rate (%d/%d, %.2f fps)' % (hd['n'], nf, hd['fps']))
        ok(max(hd['w'], hd['h']) <= 384 and len(hd['offs']) == hd['n'] + 1 and hd['offs'][-1] == len(data), 'small (%dx%d) and the index adds up' % (hd['w'], hd['h']))
        im = Image.open(io.BytesIO(data[hd['offs'][10]:hd['offs'][11]]))
        ok(im.format == 'JPEG' and im.size == (hd['w'], hd['h']), 'frame 10 is a %s %s' % (im.format, im.size))
        ok(len(b) / hd['n'] < 30000, 'about %d KB a frame' % (len(b) / hd['n'] / 1024))
        t0 = time.time(); r = await cl.get('/renderdeck/h3strip', params=q); b2 = await r.read()
        ok(b2 == b and time.time() - t0 < 0.5, 'asked again: the same file, straight away')
        # made from the ⚡ scrub copy when there is one
        r = await cl.get('/renderdeck/h3proxy', params=q); await r.read(); os.remove(H._st_path(H._ex_find(q)))
        r = await cl.get('/renderdeck/h3strip', params=q); hd2, _ = unpack(await r.read())
        ok(r.status == 200 and hd2['n'] == nf, 'from the scrub copy too (%d frames)' % hd2['n'])
        r = await cl.get('/renderdeck/h3strip', params={'filename': 'nope.mp4', 'subfolder': 'Output_Render/H3Deck', 'type': 'output'})
        ok(r.status == 404 and 'json' in r.headers.get('Content-Type', ''), 'a missing clip: 404 with a reason')
        old = H.ST_MAX; H.ST_MAX = 30; os.remove(H._st_path(H._ex_find(q)))
        r = await cl.get('/renderdeck/h3strip', params=q); hd3, _ = unpack(await r.read()); H.ST_MAX = old
        ok(hd3['n'] <= 30 and abs(hd3['fps'] * (nf / hd3['n']) - fps) < fps * 0.2, 'a long video keeps every %dth frame (%d, %.1f fps)' % (round(nf / hd3['n']), hd3['n'], hd3['fps']))
    shutil.rmtree(OUT, ignore_errors=True)
    print(fails and '%d FAILED' % fails or 'ALL PASS')
    sys.exit(1 if fails else 0)

asyncio.run(main())
