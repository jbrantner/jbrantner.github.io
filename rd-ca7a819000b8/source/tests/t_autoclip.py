"""🌀 Auto Clip's loop in the helper against a pretend ComfyUI (plain http on this machine): wildcards roll once per clip or
per part, the adult guard is in every prompt and a child word is never sent, the still then each part are queued in order
with the placeholders filled, another job arriving stops the part being made and it is made again after the quiet time,
a finished clip is kept and the next one starts, 'Again with her' keeps the character and her still.
Run: python3 tests/t_autoclip.py (needs aiohttp)"""
import asyncio, json, os, sys, types, random
from aiohttp import web
import aiohttp

fp = types.ModuleType('folder_paths')
fp.get_save_image_path = lambda *a, **k: None
fp.get_output_directory = lambda: '/tmp/ac_out'
fp.get_folder_paths = lambda k: ['/tmp']
fp.get_filename_list = lambda k: []
sys.modules['folder_paths'] = fp
srv = types.ModuleType('server')
srv.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
sys.modules['server'] = srv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'comfyui'))
import render_deck_models as H
H.AC_FILE = '/tmp/render_deck_autoclip_test.json'
if os.path.exists(H.AC_FILE):
    os.remove(H.AC_FILE)
os.makedirs('/tmp/ac_out', exist_ok=True)
PORT = 18288
H._me = lambda: 'http://127.0.0.1:%d' % PORT
H._pc = lambda: 'Output_Render'
H._shared = lambda: True
H._kohya_running = lambda: False
H.AC_QUIET = 1.5
H.AC_TICK = 0.2
DUR = 0.8


class Comfy:
    def __init__(self):
        self.queue, self.running, self.history, self.prompts, self.n, self.interrupted = [], None, {}, {}, 0, []

    async def worker(self):
        while True:
            if not self.running and self.queue:
                self.running = self.queue.pop(0)
                pid = self.running
                for _ in range(int(DUR / 0.02)):
                    await asyncio.sleep(0.02)
                    if self.running != pid:
                        break
                if self.running == pid:
                    g = self.prompts[pid]['prompt']
                    outs = {}
                    for nid, n in g.items():
                        if n['class_type'] in ('SaveImage', 'SaveVideo', 'RenderDeckH3Join'):
                            pre = n['inputs'].get('filename_prefix', 'x')
                            outs[nid] = {'images': [{'filename': pre.split('/')[-1] + '_00001_.' + ('png' if n['class_type'] == 'SaveImage' else 'mp4'),
                                                     'subfolder': 'Output_Render/' + '/'.join(pre.split('/')[:-1]), 'type': 'output'}]}
                    self.history[pid] = {'status': {'completed': True, 'status_str': 'success', 'messages': []}, 'outputs': outs}
                    self.running = None
                else:
                    self.history[pid] = {'status': {'completed': False, 'status_str': 'error', 'messages': [['execution_interrupted', {}]]}, 'outputs': {}}
            await asyncio.sleep(0.02)

    def routes(self, app):
        r = web.RouteTableDef()

        @r.post('/prompt')
        async def prompt(req):
            b = await req.json(); self.n += 1; pid = 'p' + str(self.n)
            self.prompts[pid] = b; self.queue.append(pid)
            return web.json_response({'prompt_id': pid})

        @r.get('/queue')
        async def queue(req):
            return web.json_response({'queue_running': [[0, self.running]] if self.running else [], 'queue_pending': [[i, p] for i, p in enumerate(self.queue)]})

        @r.post('/queue')
        async def qdel(req):
            for p in (await req.json()).get('delete', []):
                if p in self.queue: self.queue.remove(p)
            return web.json_response({})

        @r.post('/interrupt')
        async def intr(req):
            self.interrupted.append(self.running); self.running = None; return web.json_response({})

        @r.get('/history/{pid}')
        async def hist(req):
            p = req.match_info['pid']; return web.json_response({p: self.history[p]} if p in self.history else {})
        app.add_routes(r)


def part_graph(i, last, hyp):
    g = {'1': {'class_type': 'LoadImage', 'inputs': {'image': '@@REF@@'}},
         '2': {'class_type': 'MiniMaxH3ReferenceToVideo', 'inputs': {'prompt': '@@PROMPT@@'}},
         '3': {'class_type': 'RandomNoise', 'inputs': {'noise_seed': '@@SEED@@'}},
         '4': {'class_type': 'MiniMaxH3MotionContextLoadLatent', 'inputs': {'latent_path': '@@OUTDIR@@', 'clip_index': i}},
         '5': {'class_type': 'SaveVideo', 'inputs': {'filename_prefix': '@@DIR@@/piece_%02d' % (i + 1)}}}
    if hyp:
        g['6'] = {'class_type': 'LoadImage', 'inputs': {'image': '@@HYP@@'}}
    if last:
        g['7'] = {'class_type': 'RenderDeckH3Join', 'inputs': {'folder': '@@DIR@@', 'filename_prefix': '@@DIR@@/@@NAME@@'}}
    return g


N = 4
RECIPE = {
    'name': 'test',
    'lists': {'character': {'items': ['a __age__ woman with __hair__']}, 'age': {'items': ['25-year-old', '31-year-old', '40-year-old']},
              'hair': {'items': ['red hair', 'black hair', 'short grey hair']}, 'place': {'items': ['a library', 'a beach', 'a rooftop']},
              'action': {'items': ['jumping', 'sitting down', 'spinning', 'waving'], 'each': True}},
    'character': '__character__', 'ref_text': 'Realistic photo of __character__.', 'cast': '<Picture 1> is __character__.',
    'parts': [{'text': 'She is __action__ in __place__.'}, {'text': 'She keeps __action__.'}, {'text': 'Suddenly __hypnosis_change__.'}, {'text': 'With __hypnosis_look__ she is {smiling|swaying}.'}],
    'hyp': [{'name': 'Spiral', 'change': 'her irises turn into spirals', 'look': 'spiral eyes', 'images': ['autoclip/spiral.png']},
            {'name': 'Hearts', 'change': 'her irises turn into pink hearts', 'look': 'heart eyes', 'images': ['autoclip/heart.png']}],
    'hyp_from': 2,
    'ref': {'graph': {'1': {'class_type': 'CLIPTextEncode', 'inputs': {'text': '@@PROMPT@@'}}, '2': {'class_type': 'KSampler', 'inputs': {'seed': '@@SEED@@'}},
                      '9': {'class_type': 'SaveImage', 'inputs': {'filename_prefix': '@@DIR@@/her'}}}, 'save': '9'},
    'graphs': [{'g': part_graph(i, i == N - 1, False), 'save': '5', 'join': '7' if i == N - 1 else '', 'gh': part_graph(i, i == N - 1, True), 'saveh': '5', 'joinh': '7' if i == N - 1 else ''} for i in range(N)],
}


async def main():
    fails = []

    def ok(c, m):
        print(('ok   ' if c else 'FAIL ') + m)
        if not c: fails.append(m)

    # wildcards on their own
    rnd = random.Random(3)
    P = H._ac_plan(RECIPE, None, rnd)
    ok(all(p.startswith(H.AC_GUARD) for p in P['prompts']) and H.AC_GUARD_PIC in P['ref_text'], 'the adult guard leads every part prompt and the still')
    ok(all(P['picks']['character'] in p for p in P['prompts']), 'the character is the same in every part')
    ok('__' not in ' '.join(P['prompts']) and '{' not in ' '.join(P['prompts']), 'no wildcard is left unfilled')
    ok('<Picture 2>' in P['prompts'][2] and '<Picture 2>' not in P['prompts'][1], 'the hypnosis picture is named from part 3 on')
    ok('This continues straight on' in P['prompts'][1] and 'This continues' not in P['prompts'][0], 'parts 2 on carry on from the one before')
    acts = set()
    for k in range(20):
        acts |= set(p.get('action') for p in H._ac_plan(RECIPE, None, random.Random(k))['part_picks'] if p.get('action'))
    ok(len(acts) > 2, 'per-part lists roll anew each part')
    places = [H._ac_plan(RECIPE, None, random.Random(k))['picks']['place'] for k in range(10)]
    ok(len(set(places)) > 1, 'per-clip lists differ between clips')
    bad = json.loads(json.dumps(RECIPE)); bad['lists']['age']['items'] = ['16-year-old', 'teenage']
    try:
        H._ac_plan(bad, None, random.Random(1)); ok(False, 'a list of only child ages is refused')
    except ValueError:
        ok(True, 'a list of only child ages is refused')
    mixed = json.loads(json.dumps(RECIPE)); mixed['lists']['age']['items'] = ['17-year-old', '29-year-old']
    ok(all('17' not in H._ac_plan(mixed, None, random.Random(k))['ref_text'] for k in range(30)), 'a child age in a list is never used')

    C = Comfy(); app = web.Application(); C.routes(app)
    app.add_routes([r for r in H.routes if r.path.startswith('/renderdeck/autoclip')])
    rn = web.AppRunner(app); await rn.setup(); await web.TCPSite(rn, '127.0.0.1', PORT).start()
    asyncio.ensure_future(C.worker())
    U = 'http://127.0.0.1:%d' % PORT
    async with aiohttp.ClientSession() as s:
        async def post(path, b):
            async with s.post(U + path, json=b) as r: return r.status, await r.json()

        async def view():
            async with s.get(U + '/renderdeck/autoclip') as r: return await r.json()

        async def until(fn, t=20):
            for _ in range(int(t / 0.1)):
                v = await view()
                if fn(v): return v
                await asyncio.sleep(0.1)
            return await view()

        st, v = await post('/renderdeck/autoclip/recipe', RECIPE)
        ok(st == 200, 'the recipe is taken')
        st, v = await post('/renderdeck/autoclip/run', {'on': True, 'forever': False, 'left': 2})
        v = await until(lambda v: v['cur'] and v['cur']['stage'] >= 2)
        sent = list(C.prompts.values())
        ok(sent and sent[0]['prompt']['9']['class_type'] == 'SaveImage' and H.AC_GUARD_PIC in sent[0]['prompt']['1']['inputs']['text'], 'the still is made first, with the guard')
        ok(sent and isinstance(sent[0]['prompt']['2']['inputs']['seed'], int), 'the seed is a number')
        ok(len(sent) > 1 and sent[1]['prompt']['1']['inputs']['image'].endswith('her_00001_.png [output]'), 'part 1 uses her still')
        ok(len(sent) > 1 and sent[1]['prompt']['4']['inputs']['latent_path'].startswith('Output_Render/AutoClip/'), 'carried-over latents are read from the PC\'s own folder')
        ok(all(p['client_id'] == H.AC_CID for p in sent), 'jobs carry the auto clip client id')
        # another app sends a job while a part is being made
        while not (C.running and C.running in C.prompts and C.prompts[C.running]['client_id'] == H.AC_CID and v['cur']['stage'] >= 2):
            await asyncio.sleep(0.02); v = await view()
        stage = v['cur']['stage']
        C.n += 1; other = 'x' + str(C.n); C.prompts[other] = {'prompt': {'1': {'class_type': 'SaveImage', 'inputs': {'filename_prefix': 'Other/x'}}}, 'client_id': 'renderdeck'}; C.queue.append(other)
        v = await until(lambda v: v['status'] == 'paused')
        ok(v['status'] == 'paused' and 'another job' in v['why'], 'it pauses when another job arrives: ' + v['why'])
        ok(len(C.interrupted) == 1, 'the part being made is stopped at once')
        await until(lambda v: other in C.history)
        ok(other in C.history and C.history[other]['status']['completed'], 'the other job runs')
        v = await until(lambda v: 'stay free' in v['why'], 3)
        ok(v['status'] == 'paused' and 'stay free' in v['why'], 'it waits for Render to stay free: ' + v['why'])
        v = await until(lambda v: v['cur'] and v['cur']['stage'] > stage or v['clips'])
        ok(v['clips'] or v['cur']['stage'] > stage, 'the stopped part is made again and it carries on')
        v = await until(lambda v: len(v['clips']) >= 2 or not v['on'], 40)
        ok(len(v['clips']) == 2 and all(c['state'] == 'done' for c in v['clips']), 'two clips come out done')
        c1 = v['clips'][0]
        ok(c1['final']['filename'].startswith('clip_') and c1['final']['subfolder'].startswith('Output_Render/AutoClip/'), 'the joined clip is the clip\'s file')
        ok(not v['on'] and v['status'] == 'finished', 'it stops after the clips asked for')
        hyp_parts = [p for p in C.prompts.values() if '6' in p['prompt']]
        ok(hyp_parts and all(p['prompt']['6']['inputs']['image'].startswith('autoclip/') for p in hyp_parts), 'the hypnosis picture goes in from part 3')
        ok(all('@@' not in json.dumps(p['prompt']) for p in C.prompts.values()), 'no placeholder is left in any graph')
        # again with her
        st, v = await post('/renderdeck/autoclip/clip', {'id': c1['id'], 'do': 'again'})
        n0 = len(C.prompts)
        st, v = await post('/renderdeck/autoclip/run', {'on': True, 'forever': False, 'left': 1})
        v = await until(lambda v: len(v['clips']) >= 3 or not v['on'], 40)
        c3 = v['clips'][-1]
        new = [C.prompts['p%d' % k] for k in range(1, C.n + 1) if 'p%d' % k in C.prompts][n0:]
        ok(c3['picks']['character'] == c1['picks']['character'] and c3['ref'] == c1['ref'], 'Again with her keeps her and her still')
        ok(not any(p['prompt'].get('9', {}).get('class_type') == 'SaveImage' for p in new), 'her still is not made again')
        # stop part-way, then skip
        st, v = await post('/renderdeck/autoclip/run', {'on': True, 'forever': True})
        await until(lambda v: v['cur'] and v['cur'].get('pid'))
        st, v = await post('/renderdeck/autoclip/run', {'on': False})
        ok(not v['on'] and v['cur'] and not v['cur']['pid'], 'Stop takes the step out of ComfyUI and keeps the clip')
        st, v = await post('/renderdeck/autoclip/clip', {'do': 'skip'})
        ok(v['cur'] is None and v['clips'][-1]['state'] == 'skipped', 'Skip drops the clip being made')
        st, v = await post('/renderdeck/autoclip/clip', {'id': c1['id'], 'do': 'star'})
        ok(next(c for c in v['clips'] if c['id'] == c1['id']).get('star'), 'a clip can be starred')
    await rn.cleanup()
    print('\n%d failed' % len(fails) if fails else '\nall passed')
    os._exit(1 if fails else 0)


asyncio.run(main())
