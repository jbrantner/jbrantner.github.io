"""The helper's render farm against two pretend ComfyUIs (Render, which hosts the farm, and Main), run with plain
http on this machine: renders split between the computers, a computer missing a LoRA is asked to copy it and takes
renders once it has it, a switched-off computer takes nothing, and cancel takes a render out of a computer's line.
Run: python3 tests/t_farm.py (needs aiohttp)"""
import asyncio, json, os, sys, types
from aiohttp import web
import aiohttp

# stand-ins for ComfyUI's own modules
fp = types.ModuleType('folder_paths')
fp.get_save_image_path = lambda *a, **k: None
fp.get_output_directory = lambda: '/tmp'
fp.get_folder_paths = lambda k: ['/tmp']
fp.get_filename_list = lambda k: []
sys.modules['folder_paths'] = fp
srv = types.ModuleType('server')
srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
sys.modules['server'] = srv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'comfyui'))
import render_deck_models as H
H.FARM_FILE = '/tmp/render_deck_farm_test.json'
if os.path.exists(H.FARM_FILE):
    os.remove(H.FARM_FILE)
H._tailnet = lambda u: u.strip().rstrip('/')  # the pretend computers are plain http on this machine

DUR = 0.6


class Pc:
    def __init__(self, name, loras):
        self.name, self.loras, self.queue, self.running, self.history = name, loras, [], None, {}
        self.prompts, self.deleted, self.syncs, self.n = [], [], [], 0

    def oi(self):
        return {'CheckpointLoaderSimple': {'input': {'required': {'ckpt_name': [['sdxl.safetensors']]}}},
                'LoraLoader': {'input': {'required': {'lora_name': [list(self.loras)]}}},
                'KSampler': {'input': {'required': {}}}, 'SaveImage': {'input': {'required': {}}}, 'LoadImage': {'input': {'required': {'image': [[]]}}}}

    async def worker(self):
        while True:
            if not self.running and self.queue:
                self.running = self.queue.pop(0)
                await asyncio.sleep(DUR)
                if self.running:
                    pid = self.running
                    self.history[pid] = {'status': {'completed': True}, 'outputs': {'9': {'images': [{'filename': pid + '.png', 'subfolder': '', 'type': 'output'}]}}}
                self.running = None
            await asyncio.sleep(0.02)

    def routes(self, app, farm=False):
        r = web.RouteTableDef()

        @r.get('/object_info')
        async def oi(req): return web.json_response(self.oi())

        @r.get('/object_info/{node}')
        async def oin(req): return web.json_response({req.match_info['node']: self.oi().get(req.match_info['node'])})

        @r.post('/prompt')
        async def prompt(req):
            b = await req.json(); self.n += 1; pid = self.name[0] + str(self.n)
            self.prompts.append(b['prompt']); self.queue.append(pid)
            return web.json_response({'prompt_id': pid})

        @r.get('/queue')
        async def queue(req):
            return web.json_response({'queue_running': [[0, self.running]] if self.running else [], 'queue_pending': [[i, p] for i, p in enumerate(self.queue)]})

        @r.post('/queue')
        async def qdel(req):
            for p in (await req.json()).get('delete', []):
                if p in self.queue: self.queue.remove(p); self.deleted.append(p)
            return web.json_response({})

        @r.get('/view')
        async def view(req): self.views = getattr(self, 'views', []) + [req.query.get('filename')]; return web.Response(body=b'png', content_type='image/png')

        @r.post('/upload/image')
        async def up(req):
            f = (await req.post())['image']; return web.json_response({'name': f.filename, 'subfolder': ''})

        @r.post('/interrupt')
        async def intr(req): self.running = None; return web.json_response({})

        @r.get('/history/{pid}')
        async def hist(req):
            p = req.match_info['pid']; return web.json_response({p: self.history[p]} if p in self.history else {})

        if not farm:  # the farm host's own /renderdeck routes come from the helper; these stand in for the other computer's
            @r.post('/renderdeck/sync')
            async def sync(req):
                self.syncs.append((await req.json())['source'])
                return web.json_response({'queued': [], 'room': True})

            @r.get('/renderdeck/jobs')
            async def jobs(req): return web.json_response({'jobs': []})
        app.add_routes(r)


async def main():
    fails = []
    def ok(c, m):
        print(('ok   ' if c else 'FAIL ') + m)
        if not c: fails.append(m)
    R, M = Pc('Render', ['pixel.safetensors', 'afkj.safetensors']), Pc('Main', ['pixel.safetensors'])
    ra, ma = web.Application(), web.Application()
    R.routes(ra, farm=True); M.routes(ma)
    real_sync = [r for r in H.routes if getattr(r, 'path', '') == '/renderdeck/sync']
    ra.add_routes([r for r in H.routes if r.path.startswith('/renderdeck/farm')])
    # the farm host's sync: record it, as the real one would start copying
    async def rsync(req): R.syncs.append((await req.json())['source']); return web.json_response({'queued': []})
    async def rjobs(req): return web.json_response({'jobs': []})
    ra.router.add_post('/renderdeck/sync', rsync); ra.router.add_get('/renderdeck/jobs', rjobs)
    runners = []
    for app, port in ((ra, 18188), (ma, 18189)):
        rn = web.AppRunner(app); await rn.setup(); await web.TCPSite(rn, '127.0.0.1', port).start(); runners.append(rn)
    RU, MU = 'http://127.0.0.1:18188', 'http://127.0.0.1:18189'
    asyncio.ensure_future(R.worker()); asyncio.ensure_future(M.worker())
    pcs = [{'url': RU, 'name': 'Render'}, {'url': MU, 'name': 'Main'}]
    g = lambda lora: {'1': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': 'sdxl.safetensors'}},
                      '2': {'class_type': 'LoraLoader', 'inputs': {'lora_name': lora, 'strength_model': 1}},
                      '3': {'class_type': 'KSampler', 'inputs': {'seed': 1}}, '9': {'class_type': 'SaveImage', 'inputs': {}}}
    off = []
    async with aiohttp.ClientSession() as s:
        async def add(n, lora, tag):
            jobs = [{'key': tag + str(i), 'graph': g(lora), 'home': RU, 'client_id': 'rd-test', 'prompt': 'x', 'seed': i, 'n': i + 1, 'of': n} for i in range(n)]
            async with s.post(RU + '/renderdeck/farm/add', json={'pcs': pcs, 'off': off, 'jobs': jobs}) as r: return await r.json()
        async def view(since=0):
            async with s.get(RU + '/renderdeck/farm?since=' + str(since)) as r: return await r.json()
        async def until(fn, t=15):
            for _ in range(int(t / 0.1)):
                v = await view()
                if fn(v): return v
                await asyncio.sleep(0.1)
            return await view()

        await add(4, 'pixel.safetensors', 'a')
        v = await until(lambda v: len([d for d in v['done'] if d['key'].startswith('a')]) == 4)
        ok(len([d for d in v['done'] if d['key'].startswith('a') and d['state'] == 'done']) == 4, 'four renders come back done')
        ok(len(R.prompts) >= 1 and len(M.prompts) >= 1, 'both computers took renders: Render %d, Main %d' % (len(R.prompts), len(M.prompts)))
        ok(all(d['images'] for d in v['done']), 'each finished render lists its pictures')
        ok(not R.syncs and not M.syncs, 'no copying while every computer has what the renders need')

        m0, r0 = len(M.prompts), len(R.prompts)
        await add(2, 'afkj.safetensors', 'b')
        v = await until(lambda v: len([d for d in v['done'] if d['key'].startswith('b')]) == 2)
        ok(len(M.prompts) == m0 and len(R.prompts) == r0 + 2, 'Main lacks the LoRA, so Render does both')
        ok(RU in M.syncs, 'Main is asked to copy it from Render')
        M.loras.append('afkj.safetensors'); H._st(MU)['lists_at'] = 0
        await add(2, 'afkj.safetensors', 'c')
        v = await until(lambda v: len([d for d in v['done'] if d['key'].startswith('c')]) == 2)
        ok(len(M.prompts) > m0, 'once Main has it, Main takes those renders too')

        off.append(MU)
        async with s.post(RU + '/renderdeck/farm/pcs', json={'off': off}) as r: await r.json()
        m1 = len(M.prompts)
        await add(3, 'pixel.safetensors', 'd')
        await asyncio.sleep(0.4)
        v = await view()
        sent = [j for j in v['jobs'] if j['key'].startswith('d') and j['state'] in ('sent', 'running')]
        waiting = [j for j in v['jobs'] if j['key'].startswith('d') and j['state'] == 'waiting']
        ok(len(sent) == 1 and len(waiting) == 2, 'one render at a time per computer, the rest wait in the farm')
        async with s.post(RU + '/renderdeck/farm/cancel', json={'keys': [waiting[0]['key'], sent[0]['key']]}) as r: c = await r.json()
        ok(c.get('cancelled') == 2, 'cancel drops a waiting render and one handed out')
        v = await until(lambda v: not [j for j in v['jobs'] if j['key'].startswith('d')])
        ok(len(M.prompts) == m1, 'switched-off Main took nothing')
        ok(len([d for d in v['done'] if d['key'].startswith('d')]) == 1, 'only the one not cancelled was rendered')
        saved = json.load(open(H.FARM_FILE))
        ok(saved['off'] == [MU] and len(saved['pcs']) == 2, 'the farm is saved to its file')
        # a computer whose list of ControlNets is empty has none of them, so it can't take a pose render; a pinned render stays put
        g = {'1': {'class_type': 'ControlNetLoader', 'inputs': {'control_net_name': 'promax.safetensors'}}}
        H._st('M')['oi'] = {'ControlNetLoader': {'input': {'required': {'control_net_name': [[]]}}}}
        H._st('R2')['oi'] = {'ControlNetLoader': {'input': {'required': {'control_net_name': [['promax.safetensors']]}}}}
        ok('promax' in H._fit('M', {'graph': g, 'home': 'R'})[2] and not H._fit('R2', {'graph': g, 'home': 'R'})[2], 'no ControlNets at all means it lacks ProMax')
        ok('only' in H._fit('M', {'graph': {}, 'home': 'M', 'pin': 'R'})[2], 'a pinned render only runs on its computer')
        # every half hour the farm has each computer copy what the other has (⚙ › Model downloads, on by default)
        g = lambda lora: {'1': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': 'sdxl.safetensors'}},
                          '2': {'class_type': 'LoraLoader', 'inputs': {'lora_name': lora, 'strength_model': 1}},
                          '3': {'class_type': 'KSampler', 'inputs': {'seed': 1}}, '9': {'class_type': 'SaveImage', 'inputs': {}}}
        async def direct(u): return True
        H._direct = direct
        H.SPEED_FILE = '/tmp/render_deck_speed_test.json'
        if os.path.exists(H.SPEED_FILE): os.remove(H.SPEED_FILE)
        R.syncs.clear(); M.syncs.clear(); H._last_compare = 0
        for p in pcs: H._st(p['url'])['copies'] = []
        await add(1, 'pixel.safetensors', 'c'); await asyncio.sleep(2)
        ok(MU in R.syncs and RU in M.syncs, 'the timed compare asks each computer to copy from the other: %r %r' % (R.syncs, M.syncs))
        R.syncs.clear(); M.syncs.clear(); await add(1, 'pixel.safetensors', 'd'); await asyncio.sleep(2)
        ok(not R.syncs and not M.syncs, 'not again within half an hour')
        json.dump({'mbps': 0, 'auto': False}, open(H.SPEED_FILE, 'w')); H._last_compare = 0
        await add(1, 'pixel.safetensors', 'e'); await asyncio.sleep(2)
        ok(not R.syncs and not M.syncs and not H._auto_sync(), 'switched off: no timed compare')
        # 🧊 chained jobs: a step waits for the one before it and uses its picture, fetched from whichever computer made it
        off.clear()
        async with s.post(RU + '/renderdeck/farm/pcs', json={'off': off}) as r: await r.json()
        gi = lambda: {'5': {'class_type': 'LoadImage', 'inputs': {'image': 'placeholder.png'}}, '3': {'class_type': 'KSampler', 'inputs': {'seed': 1}}, '9': {'class_type': 'SaveImage', 'inputs': {}}}
        base = {'1': {'class_type': 'KSampler', 'inputs': {'seed': 2}}, '9': {'class_type': 'SaveImage', 'inputs': {}}}
        jobs = [{'key': 'p3-a', 'graph': base, 'home': RU}] + [{'key': 'p3-b' + str(i), 'graph': gi(), 'home': RU, 'after': ['p3-a'], 'use': {'5': ['p3-a', 0]}} for i in range(3)]
        async with s.post(RU + '/renderdeck/farm/add', json={'pcs': pcs, 'off': off, 'jobs': jobs}) as r: await r.json()
        await asyncio.sleep(0.3); v = await view()
        st = {j['key']: j['state'] for j in v['jobs']}
        ok(st.get('p3-a') in ('sent', 'running') and all(st.get('p3-b' + str(i)) == 'waiting' for i in range(3)), 'the chained steps wait for the first: %r' % st)
        v = await until(lambda v: len([d for d in v['done'] if d['key'].startswith('p3-b')]) == 3)
        a = next(d for d in v['done'] if d['key'] == 'p3-a'); bs = [d for d in v['done'] if d['key'].startswith('p3-b')]
        ims = [p['5']['inputs']['image'] for p in R.prompts + M.prompts if '5' in p]
        ok(all(d['state'] == 'done' for d in bs) and len(ims) == 3, 'then they all run: %r' % [d['state'] for d in bs])
        made = a['images'][0]['filename']
        ok(all(i == made + ' [output]' or i == 'rd-p3-b%d-%s' % (n, made) or i.startswith('rd-p3-b') and i.endswith(made) for n, i in enumerate(ims)), 'each uses the first step\'s picture (its own output, or a copy from the computer that made it): %r' % ims)
        ok(len({d['srv'] for d in bs}) == 2, 'and they spread over both computers')
        jobs = [{'key': 'p3-c', 'graph': base, 'home': RU}, {'key': 'p3-d', 'graph': gi(), 'home': RU, 'after': ['p3-c'], 'use': {'5': ['p3-c', 0]}}]
        async with s.post(RU + '/renderdeck/farm/add', json={'pcs': pcs, 'off': off, 'jobs': jobs}) as r: await r.json()
        async with s.post(RU + '/renderdeck/farm/cancel', json={'keys': ['p3-c']}) as r: await r.json()
        v = await until(lambda v: any(d['key'] == 'p3-d' for d in v['done']))
        ok(next((d['state'] for d in v['done'] if d['key'] == 'p3-d'), '') == 'failed', 'a step whose earlier step was cancelled fails instead of waiting for ever')
    for rn in runners: await rn.cleanup()
    print(('%d FAILED' % len(fails)) if fails else 'all passed')
    os._exit(1 if fails else 0)

asyncio.run(main())
