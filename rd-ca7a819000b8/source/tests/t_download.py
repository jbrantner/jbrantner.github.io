"""The helper's download: when the connection drops halfway it waits and carries on from where it got to (a Range
request) instead of starting again, and the finished file is whole. Run: python3 tests/t_download.py (needs aiohttp)"""
import asyncio, os, sys, time, types, tempfile
from aiohttp import web
fp = types.ModuleType('folder_paths'); fp.get_folder_paths = lambda k: ['/tmp']; fp.get_filename_list = lambda k: []
fp.get_save_image_path = lambda *a, **k: None; fp.get_output_directory = lambda: '/tmp'
sys.modules['folder_paths'] = fp
srv = types.ModuleType('server'); srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef())); sys.modules['server'] = srv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'comfyui'))
import render_deck_models as H
H.SYNC_MBPS = 1000
H.SPEED_FILE = os.path.join(tempfile.mkdtemp(), 'speed.json')  # no file: full speed
DATA = os.urandom(5 * 1024 * 1024)
seen = []

async def handler(request):
    rng = request.headers.get('Range'); seen.append(rng)
    start = int(rng[6:-1]) if rng else 0
    resp = web.StreamResponse(status=206 if rng else 200, headers={'Content-Length': str(len(DATA) - start)})
    await resp.prepare(request)
    end = len(DATA) if len(seen) > 1 else 2 * 1024 * 1024  # the first time, the line drops after 2 MB
    for i in range(start, end, 1 << 16):
        await resp.write(DATA[i:min(end, i + (1 << 16))])
    if end < len(DATA):
        request.transport.close()
        return resp
    await resp.write_eof(); return resp

async def main():
    fails = []
    def ok(c, m):
        print(('ok   ' if c else 'FAIL ') + m)
        if not c: fails.append(m)
    app = web.Application(); app.router.add_get('/f', handler)
    run = web.AppRunner(app); await run.setup(); site = web.TCPSite(run, '127.0.0.1', 8791); await site.start()
    real = asyncio.sleep
    async def quick(t): await real(min(t, 0.01))
    asyncio.sleep = quick  # the waits between tries
    d = tempfile.mkdtemp(); path = os.path.join(d, 'm.safetensors')
    j = {'status': 'queued', 'done': 0, 'total': 0}
    await H._download(j, 'http://127.0.0.1:8791/f', path)
    asyncio.sleep = real
    ok(j['status'] == 'done' and open(path, 'rb').read() == DATA, 'the file is whole after the drop: ' + j['status'] + ' ' + str(j.get('error')))
    ok(len(seen) == 2 and seen[0] is None and seen[1] == 'bytes=%d-' % (2 * 1024 * 1024), 'the second try asks for the rest only: ' + str(seen))
    ok(not os.path.exists(path + '.part'), 'no part file left')
    # the speed: full by default, the gentle speed once picked in the app
    ok(H._speed() == 0, 'full speed when nothing was picked')
    t0 = time.time(); await H._pace(t0, 50 * 1024**2); ok(time.time() - t0 < 0.05, 'no waiting at full speed')
    open(H.SPEED_FILE, 'w').write('{"mbps": 100}')
    t0 = time.time(); await H._pace(t0, 20 * 1024**2); ok(0.15 < time.time() - t0 < 0.4, 'held to the picked speed (20 MB at 100 MB/s is about 0.2 s): %.2f' % (time.time() - t0))
    # what the sync copies: checkpoints and LoRAs, never Qwen, MiniMax or 3D files, nothing from other folders
    ok(H._synced('checkpoints', 'oneObsession_v24.safetensors') and H._synced('loras', 'chars/Librarian_rd.safetensors'), 'checkpoints and LoRAs are copied')
    ok(not any(H._synced(k, n) for k, n in [('diffusion_models', 'qwen_image_edit_fp8_e4m3fn.safetensors'), ('text_encoders', 'qwen_2.5_vl_7b.safetensors'),
        ('loras', 'Qwen-Image-Lightning-4steps.safetensors'), ('loras', 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'),
        ('controlnet', 'diffusion_pytorch_model_promax.safetensors'), ('checkpoints', 'trellis_model.safetensors'), ('vae', 'sdxl_vae.safetensors')]), 'Qwen, MiniMax, 3D and other folders stay put')
    # two syncs asked for at once still copy one file at a time
    live, most = [0], [0]
    async def slow(todo):
        live[0] += 1; most[0] = max(most[0], live[0]); await asyncio.sleep(0.05); live[0] -= 1
    H._sync_files = slow
    await asyncio.gather(H._sync_run([]), H._sync_run([]), H._sync_run([]))
    ok(most[0] == 1, 'one copy at a time across syncs: %d' % most[0])
    await run.cleanup()
    print(('%d FAILED' % len(fails)) if fails else 'all passed'); os._exit(1 if fails else 0)
asyncio.run(main())
