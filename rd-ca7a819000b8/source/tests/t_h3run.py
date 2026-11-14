"""🌙 H3 Deck keeps going with the phone away: the helper opens the hidden H3 Deck when the phone has been gone a while with work
left, tells it to stop when the phone is back, closes it when it says bye, and an older copy is told to stop without saving.
Run: python3 tests/t_h3run.py (needs aiohttp)"""
import asyncio, os, sys, types, time
from aiohttp import web
from aiohttp.test_utils import TestServer, TestClient

fp = types.ModuleType('folder_paths')
fp.get_save_image_path = lambda *a, **k: None
fp.get_output_directory = lambda: '/tmp'
fp.get_folder_paths = lambda k: ['/tmp']
fp.get_filename_list = lambda k: []
sys.modules['folder_paths'] = fp
srv = types.ModuleType('server')
srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef(), loop=None))
sys.modules['server'] = srv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'comfyui'))
import render_deck_models as H
H.H3RUN_FILE = '/tmp/render_deck_h3run_test.json'
if os.path.exists(H.H3RUN_FILE):
    os.remove(H.H3RUN_FILE)
H.H3RUN.update(want=False, farm='', wid='')

fails = 0


def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m)
    if not c:
        fails += 1


class Proc:  # a pretend hidden browser
    def __init__(self):
        self.alive = True

    def poll(self):
        return None if self.alive else 0

    def terminate(self):
        self.alive = False


opened = []


def fake_open():
    if not H.H3RUN.get('farm'):
        return False
    opened.append(H.H3RUN['farm'])
    H._h3r['proc'] = Proc()
    H.H3RUN['wid'] = 'w%d' % len(opened)
    H._h3r.update(opened=time.time(), seen=time.time(), bye=False, **{'yield': 0.0})
    return True


H._h3r_open = fake_open


async def main():
    app = web.Application()
    app.add_routes([r for r in H.routes if r.path.startswith('/renderdeck/h3run')])
    cl = TestClient(TestServer(app))
    await cl.start_server()
    J = lambda r: r.json()
    # the phone is here with work running: nothing opens
    r = await J(await cl.post('/renderdeck/h3run/beat', json={'who': 'phone', 'want': True, 'farm': 'https://jordo-desktop.tailadee9a.ts.net'}))
    ok(r.get('ok') and not r.get('worker') and H._h3r_step() == 'idle' and not opened, 'phone here with work: nothing opens')
    # 100 s later, no word from the phone: the hidden copy opens on this computer's address
    ok(H._h3r_step(time.time() + 100) == 'opened' and opened == ['https://jordo-desktop.tailadee9a.ts.net'], 'phone gone 90 s with work left: the hidden H3 Deck opens: %s' % opened)
    # it checks in: keep going (the phone is still away)
    H._h3r['phone'] = time.time() - 200
    r = await J(await cl.post('/renderdeck/h3run/beat', json={'who': 'worker', 'wid': 'w1', 'want': True}))
    ok(r.get('go') is True and H._h3r_step() == 'running', 'the hidden copy carries on while the phone is away: %s' % r)
    # an older copy (another id) is told to stop without saving over the current one
    r = await J(await cl.post('/renderdeck/h3run/beat', json={'who': 'worker', 'wid': 'w0', 'want': True}))
    ok(r.get('go') is False and r.get('push') is False, 'an older hidden copy stops without saving: %s' % r)
    # the phone comes back: the copy is told to stop (go false, it saves its last copy), says bye and is closed
    r = await J(await cl.post('/renderdeck/h3run/beat', json={'who': 'phone', 'want': True, 'farm': 'https://jordo-desktop.tailadee9a.ts.net', 'back': True}))
    r2 = await J(await cl.post('/renderdeck/h3run/beat', json={'who': 'worker', 'wid': 'w1', 'want': True}))
    st1 = H._h3r_step()
    await cl.post('/renderdeck/h3run/bye', json={'wid': 'w1', 'want': True})
    g = await J(await cl.get('/renderdeck/h3run'))
    ok(r.get('worker') is True and r2.get('go') is False and r2.get('push') is not False and st1 == 'yield' and g['worker'] is False and H._h3r['proc'] is None,
       'phone back: the copy is told to stop, saves, says bye and is closed: %s' % [r, r2, st1, g])
    # the phone goes into the background (says so): a quick app switch opens nothing; the copy opens after 90 s
    await cl.post('/renderdeck/h3run/beat', json={'who': 'phone', 'want': True, 'farm': 'https://jordo-desktop.tailadee9a.ts.net', 'away': True})
    a30, a95 = H._h3r_step(time.time() + 30), H._h3r_step(time.time() + 95)
    ok(a30 == 'idle' and a95 == 'opened' and len(opened) == 2, 'phone went to the background: nothing at 30 s, opens after 90 s: %s' % [a30, a95])
    # the copy finishes everything: bye with nothing left → closed, nothing opens again
    await cl.post('/renderdeck/h3run/bye', json={'wid': 'w2', 'want': False})
    ok(H._h3r['proc'] is None and not H.H3RUN['want'] and H._h3r_step(time.time() + 500) == 'idle' and len(opened) == 2, 'all done: the copy is closed and nothing opens again')
    # the phone gone with nothing running: nothing opens
    await cl.post('/renderdeck/h3run/beat', json={'who': 'phone', 'want': False})
    ok(H._h3r_step(time.time() + 500) == 'idle' and len(opened) == 2, 'phone gone with nothing running: nothing opens')
    # a copy that stops checking in for 10 minutes is closed (and opened again on the next look)
    await cl.post('/renderdeck/h3run/beat', json={'who': 'phone', 'want': True})
    H._h3r_step(time.time() + 100)
    H._h3r['seen'] = H._h3r['opened'] = time.time() - 700
    ok(H._h3r_step(time.time() + 100) == 'closed' and H._h3r_step(time.time() + 100) == 'opened', 'a copy stuck for 10 minutes is closed and opened again')
    # the app is served from here for the hidden copy, never sw.js or a path out of it
    app2 = web.Application(); app2.add_routes([r for r in H.routes if r.path.startswith('/renderdeck/h3app')])
    c2 = TestClient(TestServer(app2)); await c2.start_server()
    ok((await c2.get('/renderdeck/h3app/sw.js')).status == 404 and (await c2.get('/renderdeck/h3app/a%2F..%2Fx')).status == 404, 'h3app: no service worker, no path out')
    await c2.close()
    await cl.close()


asyncio.run(main())
print('ALL PASS' if not fails else '%d FAILED' % fails)
sys.exit(1 if fails else 0)
