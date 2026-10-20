"""Render Deck model helper for ComfyUI: lets the phone app add checkpoints and LoRAs to this computer.

Copy this file into ComfyUI/custom_nodes/ and restart ComfyUI. It adds three routes and no nodes:
  GET  /renderdeck/jobs                     -> downloads and uploads, with progress
  POST /renderdeck/download {url, kind}     -> fetch a Civitai or Hugging Face link in the background
  POST /renderdeck/upload?kind=..&name=..   -> receive a file sent from the phone (multipart field "file")
  GET  /renderdeck/model_info?kind=..&name=.. -> Civitai's trigger words and base model for a file, found by its fingerprint
  GET  /renderdeck/images, /renderdeck/thumb  -> the pictures in the output folder, newest first, and small previews
  POST /renderdeck/delete {items}             -> move pictures into "Deleted by Render Deck" in the output folder
                                               (a shared Dropbox output folder deletes for real; Dropbox keeps them in Deleted files)
  GET  /renderdeck/models                     -> the .safetensors checkpoints and LoRAs on this computer, with sizes
  GET  /renderdeck/file?kind=..&name=..       -> one of those files, so another computer can copy it
  POST /renderdeck/sync {source}              -> copy the models and LoRAs another computer has and this one lacks
  GET  /renderdeck/tagger, POST /renderdeck/tagger/get, POST /renderdeck/tag -> the WD EVA02 tagger (Danbooru tags with
                                               scores, on the CPU) for training captions; fetched once from Hugging Face
  GET  /renderdeck/farm, POST /renderdeck/farm/add|cancel|pcs -> the render farm queue: renders go to whichever of your
                                               computers is free, even with the phone app closed (render_deck_farm.json)
  GET  /renderdeck/auto, POST /renderdeck/auto/start|stop -> a character's auto run: turnaround, angles, training shots,
                                               the picked set and a kohya LoRA, here, with the phone app closed (render_deck_auto.json)
kind is "checkpoints" or "loras". Only .safetensors files are accepted (they can't run code), only from
civitai.com, huggingface.co and your own computers' Tailscale (.ts.net) addresses, and an existing file is never overwritten.
Civitai models that need sign-in: put your Civitai API key in the CIVITAI_API_TOKEN environment variable,
or in a file named civitai_token.txt next to this one.
Shared outputs: when ComfyUI's output folder is inside Dropbox (--output-directory), every computer saves into its own
subfolder named in render_deck_pc.txt next to this file (or the computer's name), so both computers' renders sync
without their file numbers clashing, and each computer's renders browser shows them all.
Copyright (c) 2026 Jordan Brantner. All rights reserved.
"""
import asyncio, json, os, re, shutil, socket, time, uuid
from urllib.parse import urlparse, parse_qs, quote, unquote
import aiohttp
from aiohttp import web
import folder_paths
from server import PromptServer

KINDS = ('checkpoints', 'loras', 'diffusion_models', 'vae', 'text_encoders', 'clip_vision', 'controlnet', 'upscale_models')  # the app's own picker offers the first two
CIVITAI = ('civitai.com', 'civitai.red', 'civitai.green')  # Civitai's sites share one API and the same model ids
HOSTS = CIVITAI + ('huggingface.co',)
JOBS = {}  # id -> job dict, newest last
RETRIES = 8  # a download waits 30 s, 1, 2, 4 … up to 10 minutes after each drop before carrying on
SYNC_MBPS = 2  # the gentle speed, MB a second: at 15 the house WiFi kept dropping (2026-10-18); a router fix later let Jordan try full speed
SPEED_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render_deck_speed.json')


def _speed():
    """MB a second that downloads and copies are held to, 0 for full speed. Set from the app (⚙ › Download speed);
    full speed unless the gentle speed was picked."""
    try:
        return float(json.load(open(SPEED_FILE, encoding='utf-8')).get('mbps', 0))
    except Exception:
        return 0.0
routes = PromptServer.instance.routes


def _token():
    t = os.environ.get('CIVITAI_API_TOKEN', '').strip()
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'civitai_token.txt')
    if not t and os.path.exists(p):
        t = open(p, encoding='utf-8').read().strip()
    return t


def _folder(kind):
    return folder_paths.get_folder_paths(kind)[0]  # Comfy Desktop's shared models folder comes first


def _clean(name):
    name = os.path.basename(unquote(name or '')).strip().replace('\\', '_')
    name = re.sub(r'[<>:"|?*\x00-\x1f]', '_', name)
    if not name.lower().endswith('.safetensors'):
        raise ValueError('Only .safetensors files can be added')
    return name


def _job(**kw):
    j = dict(id=uuid.uuid4().hex[:10], status='starting', done=0, total=0, error='', started=time.time())
    j.update(kw)
    JOBS[j['id']] = j
    for old in list(JOBS)[:-20]:  # keep the list short
        if JOBS[old]['status'] in ('done', 'failed'):
            del JOBS[old]
    return j


def _target(kind, name):
    if kind not in KINDS:
        raise ValueError('Pick checkpoint or LoRA')
    path = os.path.join(_folder(kind), name)
    if os.path.exists(path):
        raise ValueError(name + ' is already on this computer')
    return path


def _room(path, size):
    free = shutil.disk_usage(os.path.dirname(path)).free
    if size and size > free - 2 * 1024**3:  # keep 2 GB spare
        raise ValueError('Not enough disk space: needs %.1f GB, %.1f GB free' % (size / 1024**3, free / 1024**3))


async def _civitai(session, url):
    """Turn any Civitai model link into the file to fetch and what the model is."""
    u = urlparse(url)
    q = parse_qs(u.query)
    m = re.search(r'/api/download/models/(\d+)', u.path)
    vid = m.group(1) if m else (q.get('modelVersionId') or [None])[0]
    api = 'https://civitai.com/api/v1/'
    if vid:
        meta_url = api + 'model-versions/' + vid
    else:
        m = re.search(r'/models/(\d+)', u.path)
        if not m:
            raise ValueError('That Civitai link does not point at a model')
        meta_url = api + 'models/' + m.group(1)
    headers = {'Authorization': 'Bearer ' + _token()} if _token() else {}
    async with session.get(meta_url, headers=headers) as r:
        if r.status != 200:
            raise ValueError('Civitai said %d for that model' % r.status)
        meta = await r.json()
    v = meta if vid else (meta.get('modelVersions') or [{}])[0]
    files = [f for f in v.get('files', []) if f.get('name', '').lower().endswith('.safetensors')]
    if not files:
        raise ValueError('That model has no .safetensors file')
    f = next((f for f in files if f.get('primary')), files[0])
    mtype = (meta.get('type') or (v.get('model') or {}).get('type') or '').lower()
    kind = 'loras' if mtype in ('lora', 'locon', 'dora', 'lycoris') else 'checkpoints' if mtype == 'checkpoint' else None
    return dict(file_url=f['downloadUrl'], name=f['name'], size=int(f.get('sizeKB', 0) * 1024), kind=kind,
                base=v.get('baseModel', ''), words=v.get('trainedWords') or [], title=((v.get('model') or {}).get('name') if vid else meta.get('name')) or '')


async def _pace(started, sent):
    """Sleep as long as it takes to keep a download or copy at the chosen speed (no wait at full speed)."""
    mbps = _speed()
    if mbps <= 0:
        return
    ahead = sent / (mbps * 1024**2) - (time.time() - started)
    if ahead > 0:
        await asyncio.sleep(ahead)


async def _download(j, file_url, path, retries=RETRIES):
    """Fetch into path + '.part', held to the picked speed (_speed). When the internet drops it waits and carries on from where it got to
    (an HTTP Range request) instead of starting the file again, up to RETRIES times, longer each time."""
    tmp = path + '.part'
    headers = {'Authorization': 'Bearer ' + _token()} if _token() and any(c in file_url for c in CIVITAI) else {}
    for attempt in range(retries + 1):
        started, have = time.time(), os.path.getsize(tmp) if os.path.exists(tmp) else 0
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, sock_connect=30, sock_read=120)) as s:
                h = dict(headers, Range='bytes=%d-' % have) if have else headers
                async with s.get(file_url, headers=h, allow_redirects=True) as r:
                    if r.status in (401, 403):
                        raise PermissionError('Civitai wants you signed in for this one: add your API key on the render computer (see the helper file)')
                    if r.status == 416 and have:  # already all there
                        break
                    if r.status not in (200, 206):
                        raise PermissionError('Download answered %d' % r.status)
                    if r.status == 200:
                        have = 0  # the server sent it all again: start the file over
                    j['total'] = have + int(r.headers.get('Content-Length') or 0) or j['total'] or 0
                    if not have:
                        _room(path, j['total'])
                    j['status'], j['done'], j['error'] = 'downloading', have, ''
                    with open(tmp, 'ab' if have else 'wb') as out:
                        async for chunk in r.content.iter_chunked(1 << 20):
                            out.write(chunk)
                            j['done'] += len(chunk)
                            await _pace(started, j['done'] - have)  # downloads and copies alike: gently, for the house WiFi
                            if j.get('cancel'):
                                raise PermissionError('Stopped')
            if j['total'] and os.path.getsize(tmp) < j['total']:
                raise aiohttp.ClientPayloadError('the download was cut short')
            break
        except Exception as e:
            j['error'] = str(e) or e.__class__.__name__
            if isinstance(e, (PermissionError, ValueError)) or attempt == retries:
                j['status'] = 'failed'
                if j.get('cancel') and os.path.exists(tmp):
                    os.remove(tmp)
                return  # a part left by a dropped connection stays, so asking again carries on from it
            wait = min(600, 30 * 2 ** attempt)
            j['status'], j['retry_at'] = 'waiting', time.time() + wait  # the internet dropped: wait, then carry on
            for _ in range(wait):
                await asyncio.sleep(1)
                if j.get('cancel'):
                    j['status'], j['error'] = 'failed', 'Stopped'
                    return
    os.replace(tmp, path)
    j['status'] = 'done'


@routes.get('/renderdeck/speed')
async def get_speed(request):
    return web.json_response({'mbps': _speed(), 'gentle': SYNC_MBPS})


@routes.post('/renderdeck/speed')
async def set_speed(request):
    b = await request.json()
    mbps = max(0.0, float(b.get('mbps', 0)))
    with open(SPEED_FILE, 'w', encoding='utf-8') as f:
        json.dump({'mbps': mbps}, f)
    return web.json_response({'mbps': mbps})


@routes.get('/renderdeck/jobs')
async def jobs(request):
    return web.json_response({'version': 2, 'token': bool(_token()), 'jobs': list(JOBS.values())[::-1]})


@routes.post('/renderdeck/download')
async def download(request):
    try:
        body = await request.json()
        url = (body.get('url') or '').strip()
        host = (urlparse(url).hostname or '').lower()
        if urlparse(url).scheme != 'https' or not any(host == h or host.endswith('.' + h) for h in HOSTS):
            raise ValueError('Only Civitai (.com, .red, .green) and huggingface.co links work')
        info = dict(file_url=url, name=None, size=0, kind=None, base='', words=[], title='')
        if any(host == c or host.endswith('.' + c) for c in CIVITAI):
            async with aiohttp.ClientSession() as s:
                info = await _civitai(s, url)
        else:
            info['name'] = urlparse(url).path.split('/')[-1]
            info['file_url'] = url.replace('/blob/', '/resolve/')
        kind = info['kind'] or body.get('kind')
        if body.get('kind') == 'diffusion_models' or re.search(r'minimax|wan ?2|hunyuan ?video|ltx', info['base'] or '', re.I):
            kind = 'diffusion_models'  # video and other split models load with UNETLoader, not as checkpoints
        name = _clean(body.get('name') or info['name'])
        path = _target(kind, name)
        _room(path, info['size'])
        j = _job(name=name, kind=kind, total=info['size'], source=url, base=info['base'], words=info['words'], title=info['title'])
        asyncio.ensure_future(_download(j, info['file_url'], path))
        return web.json_response(j)
    except Exception as e:
        return web.json_response({'error': str(e)}, status=400)


# ---------- WD EVA02 tagger: Danbooru tags with a confidence each, for LoRA training captions ----------
# SmilingWolf's wd-eva02-large-tagger-v3 (trained on Danbooru itself), run with onnxruntime on the CPU so it never
# competes with a render or a training run for the graphics card. 1.26 GB, fetched once into models/wd_tagger.
WD_REPO = 'SmilingWolf/wd-eva02-large-tagger-v3'
WD_FILES = ('selected_tags.csv', 'model.onnx')
WD = {}  # the loaded model: sess, names, cats


def _wd_dir():
    return os.path.join(folder_paths.models_dir, 'wd_tagger', WD_REPO.split('/')[1])


def _wd_ready():
    return all(os.path.exists(os.path.join(_wd_dir(), f)) for f in WD_FILES)


def _wd_job():
    return next((j for j in reversed(list(JOBS.values())) if j.get('kind') == 'tagger'), None)


async def _wd_get(j):
    os.makedirs(_wd_dir(), exist_ok=True)
    for f in WD_FILES:
        path = os.path.join(_wd_dir(), f)
        if os.path.exists(path):
            continue
        j['file'] = f
        await _download(j, 'https://huggingface.co/%s/resolve/main/%s' % (WD_REPO, f), path)
        if j['status'] != 'done':
            return
    j['status'] = 'done'


def _wd_load():
    if 'sess' not in WD:
        import csv, onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = max(1, (os.cpu_count() or 4) // 2)  # half the cores, so the computer stays usable
        WD['sess'] = ort.InferenceSession(os.path.join(_wd_dir(), 'model.onnx'), so, providers=['CPUExecutionProvider'])
        with open(os.path.join(_wd_dir(), 'selected_tags.csv'), encoding='utf-8') as f:
            rows = list(csv.DictReader(f))
        WD['names'], WD['cats'] = [r['name'] for r in rows], [int(r['category']) for r in rows]
    return WD


def _wd_run(paths, thr, cthr):
    import numpy as np
    from PIL import Image
    w = _wd_load()
    sess, inp = w['sess'], w['sess'].get_inputs()[0]
    size = inp.shape[1] if isinstance(inp.shape[1], int) else 448
    out = []
    for p in paths:
        im = Image.open(p).convert('RGBA')
        flat = Image.new('RGBA', im.size, (255, 255, 255, 255))
        flat.alpha_composite(im)
        im, m = flat.convert('RGB'), max(im.size)
        sq = Image.new('RGB', (m, m), (255, 255, 255))  # padded square on white, as the model was trained
        sq.paste(im, ((m - im.width) // 2, (m - im.height) // 2))
        a = np.asarray(sq.resize((size, size), Image.BICUBIC), dtype=np.float32)[:, :, ::-1]  # BGR, 0-255
        probs = sess.run([sess.get_outputs()[0].name], {inp.name: np.ascontiguousarray(a[None])})[0][0]
        pick = lambda cat, t: sorted(((n, round(float(x), 3)) for n, c, x in zip(w['names'], w['cats'], probs) if c == cat and x >= t), key=lambda v: -v[1])
        out.append({'general': pick(0, thr), 'character': pick(4, cthr), 'rating': {n: round(float(x), 3) for n, c, x in zip(w['names'], w['cats'], probs) if c == 9}})
    return out


@routes.get('/renderdeck/tagger')
async def tagger_state(request):
    return web.json_response({'model': WD_REPO, 'ready': _wd_ready(), 'gb': 1.26, 'job': _wd_job()})


@routes.post('/renderdeck/tagger/get')
async def tagger_get(request):
    j = _wd_job()
    if _wd_ready() or (j and j['status'] not in ('done', 'failed')):
        return web.json_response({'ready': _wd_ready(), 'job': j})
    _room(os.path.join(folder_paths.models_dir, 'x'), int(1.3 * 1024**3))
    j = _job(name=WD_REPO.split('/')[1], kind='tagger', total=0, source='https://huggingface.co/' + WD_REPO)
    asyncio.ensure_future(_wd_get(j))
    return web.json_response({'ready': False, 'job': j})


@routes.post('/renderdeck/tag')
async def tag(request):
    """{images: [{filename, subfolder, type: output|input}], threshold, character_threshold} -> {results: [{general: [[tag, score]], character, rating}]}"""
    try:
        b = await request.json()
        if not _wd_ready():
            raise ValueError('The WD tagger is not on this computer yet')
        paths = []
        for im in b.get('images') or []:
            if im.get('type') == 'input':
                root = os.path.realpath(folder_paths.get_input_directory())
                path = os.path.realpath(os.path.join(root, im.get('subfolder') or '', os.path.basename(im.get('filename') or '')))
                if not path.startswith(root + os.sep) or not path.lower().endswith(PICS):
                    raise ValueError('Not a picture in the input folder')
            else:
                path = _out_path(im.get('subfolder'), im.get('filename'))[1]
            if not os.path.exists(path):
                raise ValueError(os.path.basename(path) + ' is not there')
            paths.append(path)
        thr, cthr = float(b.get('threshold', 0.35)), float(b.get('character_threshold', 0.85))
        res = await asyncio.get_running_loop().run_in_executor(None, _wd_run, paths, thr, cthr)
        return web.json_response({'model': WD_REPO, 'results': res})
    except Exception as e:
        return web.json_response({'error': str(e) or e.__class__.__name__}, status=400)


@routes.post('/renderdeck/token')
async def set_token(request):
    """Save (or clear) the Civitai API key typed in the app. It is written next to this file and never sent back."""
    t = ((await request.json()).get('token') or '').strip()
    if t and not re.fullmatch(r'[A-Za-z0-9_\-]{16,128}', t):
        return web.json_response({'error': "That doesn't look like a Civitai API key"}, status=400)
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'civitai_token.txt')
    if t:
        with open(p, 'w', encoding='utf-8') as f:
            f.write(t)
    elif os.path.exists(p):
        os.remove(p)
    return web.json_response({'token': bool(t)})


@routes.post('/renderdeck/cancel')
async def cancel(request):
    j = JOBS.get((await request.json()).get('id'))
    if j:
        j['cancel'] = True
    return web.json_response({'ok': bool(j)})


@routes.post('/renderdeck/upload')
async def upload(request):
    j = None
    try:
        kind = request.query.get('kind')
        name = _clean(request.query.get('name'))
        path = _target(kind, name)
        _room(path, int(request.query.get('size') or 0))
        j = _job(name=name, kind=kind, total=int(request.query.get('size') or 0), source='phone')
        j['status'] = 'uploading'
        reader = await request.multipart()
        field = await reader.next()
        while field is not None and field.name != 'file':
            field = await reader.next()
        if field is None:
            raise ValueError('No file came with the upload')
        tmp = path + '.part'
        with open(tmp, 'wb') as out:
            while True:
                chunk = await field.read_chunk(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                j['done'] += len(chunk)
        os.replace(tmp, path)
        j['status'] = 'done'
        return web.json_response(j)
    except Exception as e:
        if j:
            j['status'], j['error'] = 'failed', str(e)
            if os.path.exists(path + '.part'):
                os.remove(path + '.part')
        return web.json_response({'error': str(e)}, status=400)


CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render_deck_cache.json')
_cache = None


def _sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 22), b''):
            h.update(block)
    return h.hexdigest()


@routes.get('/renderdeck/model_info')
async def model_info(request):
    """What Civitai knows about a file already on this computer, found by its SHA-256: trigger words, base model, title.
    The fingerprint and the answer are remembered in render_deck_cache.json, so each file is only read once."""
    global _cache
    import json
    try:
        kind, name = request.query.get('kind'), request.query.get('name') or ''
        if kind not in KINDS:
            raise ValueError('kind must be checkpoints or loras')
        path = folder_paths.get_full_path(kind, name)
        if not path:
            raise ValueError('No such file')
        if _cache is None:
            _cache = json.load(open(CACHE_FILE, encoding='utf-8')) if os.path.exists(CACHE_FILE) else {}
        st = os.stat(path)
        key = '%s|%s|%d|%d' % (kind, name, st.st_size, int(st.st_mtime))
        if key not in _cache:
            sha = await asyncio.get_running_loop().run_in_executor(None, _sha256, path)
            headers = {'Authorization': 'Bearer ' + _token()} if _token() else {}
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as s:
                async with s.get('https://civitai.com/api/v1/model-versions/by-hash/' + sha, headers=headers) as r:
                    if r.status == 404:
                        v = None
                    elif r.status == 200:
                        v = await r.json()
                    else:
                        raise ValueError('Civitai answered %d' % r.status)
            _cache[key] = {'found': bool(v), 'words': (v or {}).get('trainedWords') or [], 'base': (v or {}).get('baseModel', ''),
                           'title': ((v or {}).get('model') or {}).get('name', '')}
            json.dump(_cache, open(CACHE_FILE, 'w', encoding='utf-8'), indent=1)
        return web.json_response(_cache[key])
    except Exception as e:
        return web.json_response({'error': str(e)}, status=400)


# ---------- the renders on this computer: browse and delete from the phone ----------
TRASH = 'Deleted by Render Deck'  # deleted pictures are moved here inside the output folder, never erased
PICS = ('.png', '.jpg', '.jpeg', '.webp')
HIDDEN = 'Hidden'  # the app's Hidden mode saves into folders with this name, kept out of the normal renders list


def _pc():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render_deck_pc.txt')
    name = open(p, encoding='utf-8').read().strip() if os.path.exists(p) else ''
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name or socket.gethostname()) or 'ComfyUI'


def _shared():
    """True when the output folder is inside Dropbox, so the other computer sees (and deletes) the same files."""
    return 'dropbox' in os.path.realpath(folder_paths.get_output_directory()).lower().replace('\\', '/').split('/')


_save_path = folder_paths.get_save_image_path


def _save_path_per_pc(filename_prefix, output_dir, *a, **kw):
    """Saves into the output folder go into this computer's subfolder when the folder is shared (not previews in temp)."""
    try:
        same = os.path.normcase(os.path.realpath(output_dir)) == os.path.normcase(os.path.realpath(folder_paths.get_output_directory()))
        if same and _shared():
            pc = _pc()
            if not filename_prefix.replace('\\', '/').lower().startswith(pc.lower() + '/'):
                filename_prefix = pc + '/' + filename_prefix
    except Exception:
        pass
    return _save_path(filename_prefix, output_dir, *a, **kw)


folder_paths.get_save_image_path = _save_path_per_pc


def _out_path(subfolder, filename):
    root = os.path.realpath(folder_paths.get_output_directory())
    path = os.path.realpath(os.path.join(root, subfolder or '', os.path.basename(filename or '')))
    if not path.startswith(root + os.sep) or not path.lower().endswith(PICS):
        raise ValueError('Not a picture in the output folder')
    return root, path


@routes.get('/renderdeck/images')
async def images(request):
    """Every picture in ComfyUI's output folder, newest first, a page at a time.
    hidden=1 lists only the app's Hidden renders (any folder named Hidden); otherwise they are always left out."""
    root = folder_paths.get_output_directory()
    found, hidden = [], request.query.get('hidden')
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x != TRASH and not x.startswith('.')]
        sub = os.path.relpath(d, root).replace('\\', '/')
        for f in files:
            if f.lower().endswith(PICS):
                if (HIDDEN in sub.split('/')) != (hidden == '1'):
                    continue
                st = os.stat(os.path.join(d, f))
                found.append({'subfolder': '' if sub == '.' else sub, 'filename': f, 't': st.st_mtime, 'size': st.st_size})
    found.sort(key=lambda x: -x['t'])
    off, lim = int(request.query.get('offset', 0)), min(200, int(request.query.get('limit', 60)))
    return web.json_response({'total': len(found), 'images': found[off:off + lim], 'trash': TRASH, 'shared': _shared(), 'pc': _pc(), 'hidden': hidden})


@routes.get('/renderdeck/thumb')
async def thumb(request):
    """A small JPEG of an output picture, so the phone's grid loads fast; kept in ComfyUI's temp folder."""
    import hashlib
    from PIL import Image
    try:
        _, path = _out_path(request.query.get('subfolder'), request.query.get('filename'))
        st = os.stat(path)
        cache = os.path.join(folder_paths.get_temp_directory(), 'render_deck_thumbs')
        os.makedirs(cache, exist_ok=True)
        tp = os.path.join(cache, hashlib.sha1(('%s|%d' % (path, st.st_mtime)).encode()).hexdigest() + '.jpg')
        if not os.path.exists(tp):
            def make():
                with Image.open(path) as im:
                    im.thumbnail((360, 360))
                    im.convert('RGB').save(tp, 'JPEG', quality=80)
            await asyncio.get_running_loop().run_in_executor(None, make)
        return web.FileResponse(tp, headers={'Cache-Control': 'max-age=86400'})
    except Exception as e:
        return web.json_response({'error': str(e)}, status=404)


@routes.post('/renderdeck/delete')
async def delete(request):
    """Move pictures into the "Deleted by Render Deck" folder (same subfolders), so a slip can be undone on the computer.
    In a shared Dropbox output folder they are deleted for real, so they go from both computers; Dropbox's Deleted files can bring them back."""
    items, moved, shared = (await request.json()).get('items', []), 0, _shared()
    for it in items:
        try:
            root, path = _out_path(it.get('subfolder'), it.get('filename'))
            if shared:
                os.remove(path)
                moved += 1
                continue
            dest_dir = os.path.join(root, TRASH, it.get('subfolder') or '')
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, os.path.basename(path))
            if os.path.exists(dest):
                b, e = os.path.splitext(dest)
                dest = '%s_%d%s' % (b, int(time.time()), e)
            shutil.move(path, dest)
            moved += 1
        except Exception:
            pass
    return web.json_response({'moved': moved})


# ---------- sync: copy the models and LoRAs another of your computers has onto this one ----------
def _models():
    return {k: [{'name': n.replace('\\', '/'), 'size': os.path.getsize(folder_paths.get_full_path(k, n))}
                for n in folder_paths.get_filename_list(k) if n.lower().endswith('.safetensors')] for k in KINDS}


@routes.get('/renderdeck/models')
async def models(request):
    return web.json_response(_models())


@routes.get('/renderdeck/file')
async def model_file(request):
    """Send one model or LoRA file. Only names ComfyUI itself lists are served, so nothing outside the models folders."""
    kind, name = request.query.get('kind'), request.query.get('name') or ''
    listed = {n.replace('\\', '/'): n for n in folder_paths.get_filename_list(kind)} if kind in KINDS else {}
    if name not in listed or not name.lower().endswith('.safetensors'):
        return web.json_response({'error': 'No such model'}, status=404)
    path = folder_paths.get_full_path(kind, listed[name])
    resp = web.StreamResponse(headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(os.path.getsize(path))})
    await resp.prepare(request)
    loop = asyncio.get_running_loop()
    started, sent = time.time(), 0
    with open(path, 'rb') as f:  # not FileResponse: on Windows its sendfile sends nothing for files over 2 GB, and checkpoints are bigger
        while chunk := await loop.run_in_executor(None, f.read, 1 << 20):
            await resp.write(chunk)
            sent += len(chunk)
            await _pace(started, sent)  # held to the picked speed, whichever computer's helper is the newer one
    return resp


def _sync_path(kind, rel):
    """Where a copied file goes: the same subfolder it has on the other computer, cleaned part by part."""
    parts = [re.sub(r'[<>:"|?*\x00-\x1f]', '_', p).strip() for p in rel.split('/')]
    if any(p in ('', '.', '..') for p in parts):
        raise ValueError('Bad file name ' + rel)
    parts[-1] = _clean(parts[-1])
    return os.path.join(_folder(kind), *parts)


async def _sync_run(todo):
    for j, url, path in todo:  # one file at a time, so the network and the disk aren't split between them
        if j.get('cancel'):
            j['status'], j['error'] = 'failed', 'Stopped'
            continue
        if os.path.exists(path):  # added some other way while this one waited
            j['status'] = 'done'
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        await _download(j, url, path, retries=0)  # copies between computers keep their own 30-minute wait after a failure


@routes.post('/renderdeck/sync')
async def sync(request):
    try:
        src = ((await request.json()).get('source') or '').strip().rstrip('/')
        u = urlparse(src)
        if u.scheme != 'https' or not (u.hostname or '').lower().endswith('.ts.net'):
            raise ValueError('Sync only works with your computers\' Tailscale https addresses')
        who = u.hostname.split('.')[0]
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
                async with s.get(src + '/renderdeck/models') as r:
                    if r.status == 404:
                        raise ValueError(who + ' needs the newest Render Deck helper: copy it there and restart ComfyUI')
                    theirs = await r.json()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return web.json_response({'error': who + " can't be reached. Is it on, with ComfyUI running?", 'offline': True}, status=502)
        mine = _models()
        busy = {(j['kind'], j['name'].lower()) for j in JOBS.values() if j['status'] not in ('done', 'failed')}
        todo, skipped = [], []
        for kind in KINDS:
            have = {os.path.basename(m['name']).lower() for m in mine[kind]}  # same file name in any subfolder counts as having it
            for m in theirs.get(kind, []):
                name = os.path.basename(m['name'])
                if name.lower() in have or (kind, name.lower()) in busy or not name.lower().endswith('.safetensors'):
                    continue
                try:
                    path = _sync_path(kind, m['name'])
                except ValueError:
                    skipped.append(m['name'])
                    continue
                j = _job(name=name, kind=kind, total=int(m.get('size') or 0), source=who, title=name)
                j['status'] = 'queued'
                todo.append((j, src + '/renderdeck/file?kind=' + kind + '&name=' + quote(m['name']), path))
        need = sum(j['total'] for j, _, _ in todo)
        free = shutil.disk_usage(_folder('checkpoints')).free
        if todo:
            asyncio.ensure_future(_sync_run(todo))
        return web.json_response({'from': who, 'queued': [j['name'] for j, _, _ in todo], 'bytes': need,
                                  'room': need <= free - 2 * 1024**3, 'skipped': skipped})
    except Exception as e:
        return web.json_response({'error': str(e)}, status=400)


# ---------- the render farm: one queue that hands renders to whichever of your computers is free ----------
# The phone adds renders here (on the computer that is always on) and can then close. Every couple of seconds this
# looks at each computer's ComfyUI; one with nothing to do gets the next render it can run. A computer missing a
# checkpoint or LoRA is asked to copy it from another (the sync above, one file at a time, at the picked speed, and only
# when Tailscale reaches the other computer directly, not through a relay). The queue is saved to render_deck_farm.json, so it
# survives a restart.
FARM_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render_deck_farm.json')
FARM = {'pcs': [], 'off': [], 'jobs': [], 'done': []}  # pcs: [{url, name}]; jobs: waiting/sent/running; done: finished or failed, newest last
PCSTATE = {}  # url -> {online, running, pending, oi, oi_at, models, synced_at, copies, why}
_farm_task = None
_farm_wake = None


def _farm_load():
    try:
        with open(FARM_FILE, encoding='utf-8') as f:
            FARM.update(json.load(f))
    except (OSError, ValueError):
        pass


def _farm_save():
    try:
        tmp = FARM_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(FARM, f)
        os.replace(tmp, FARM_FILE)
    except OSError:
        pass


def _tailnet(url):
    u = urlparse(url or '')
    if u.scheme != 'https' or not (u.hostname or '').lower().endswith('.ts.net'):
        raise ValueError('Computers are reached by their Tailscale https addresses')
    return url.strip().rstrip('/')


def _st(url):
    return PCSTATE.setdefault(url, {'online': False, 'running': [], 'pending': [], 'oi': None, 'oi_at': 0, 'models': None,
                                    'lists_at': 0, 'synced_at': time.time(), 'copies': [], 'why': '', 'asked': 0})


def _combo(spec):
    if not spec:
        return []
    if isinstance(spec[0], list):
        return spec[0]
    if spec[0] == 'COMBO' and len(spec) > 1 and isinstance(spec[1], dict):
        return spec[1].get('options') or []
    return []


def _base(name):
    return re.split(r'[\\/]', str(name))[-1]


LOADERS = {('CheckpointLoaderSimple', 'ckpt_name'): 'checkpoints', ('LoraLoader', 'lora_name'): 'loras'}


def _fit(url, job):
    """Can this computer run the job? (its own copy of the graph with file names matched, models it lacks, why not)"""
    graph = json.loads(json.dumps(job['graph']))
    if job.get('pin') and url != job['pin']:
        return None, [], 'only ' + job['pin'] + ' runs this one'  # Qwen renders: never moved, never a reason to copy models
    if url == job['home']:
        return graph, [], ''  # built from this computer's own lists
    oi = _st(url)['oi']
    if not oi:
        return None, [], 'not connected'
    missing, why = [], ''
    for n in graph.values():
        d = oi.get(n.get('class_type'))
        if not d:
            why = 'has no ' + str(n.get('class_type')) + ' node'
            continue
        inp = d.get('input') or {}
        for k, v in list((n.get('inputs') or {}).items()):
            if not isinstance(v, str) or (n['class_type'] == 'LoadImage' and k == 'image'):
                continue
            spec = (inp.get('required') or {}).get(k) or (inp.get('optional') or {}).get(k)
            opts = _combo(spec)
            if v in opts or not opts and not (spec and (isinstance(spec[0], list) or spec[0] == 'COMBO')):
                continue  # not a list of files, or the file is there (an empty list means it has none of them, like no ControlNets)
            same = next((o for o in opts if _base(o).lower() == _base(v).lower()), None)
            if same:
                n['inputs'][k] = same
                continue
            kind = LOADERS.get((n['class_type'], k))
            if kind and v.lower().endswith('.safetensors'):
                missing.append({'kind': kind, 'name': _base(v)})
            else:
                why = 'has no ' + _base(v)
    return graph, missing, why


async def _get(s, url, timeout=6):
    async with s.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as r:
        if r.status != 200:
            raise aiohttp.ClientError(str(r.status))
        return await r.json(content_type=None)


async def _post(s, url, body, timeout=30):
    async with s.post(url, json=body, timeout=aiohttp.ClientTimeout(total=timeout)) as r:
        return r.status, await r.json(content_type=None)


async def _look(s, url):
    st = _st(url)
    try:
        q = await _get(s, url + '/queue')
        st['running'] = [x[1] for x in q.get('queue_running', [])]
        st['pending'] = [x[1] for x in q.get('queue_pending', [])]
        if not st['oi'] or time.time() - st['oi_at'] > 600:
            st['oi'] = await _get(s, url + '/object_info', 30)
            st['oi_at'] = time.time()
        elif time.time() - st['lists_at'] > 30:  # new models show up in the loader lists
            for node in ('CheckpointLoaderSimple', 'LoraLoader'):
                st['oi'][node] = (await _get(s, url + '/object_info/' + node)).get(node) or st['oi'].get(node)
            st['lists_at'] = time.time()
        st['online'] = True  # (no new compare when it comes back: a WiFi drop would start the copies again)
    except Exception:
        st['online'] = False
    if st['online'] and st['copies']:
        try:
            jobs = (await _get(s, url + '/renderdeck/jobs')).get('jobs', [])
            before = len(st['copies'])
            st['copies'] = [{'name': x['name'], 'done': x.get('done', 0), 'total': x.get('total', 0)}
                            for x in jobs if x.get('source') and x.get('status') not in ('done', 'failed')]
            if len(st['copies']) < before:
                st['lists_at'] = 0
        except Exception:
            pass


_DIRECT = {}  # host -> (checked at, direct?)


async def _direct(url):
    """True unless Tailscale says the way to that computer goes through a relay (then copies would use the internet upload)."""
    host = urlparse(url).hostname or ''
    at, ok = _DIRECT.get(host, (0, True))
    if time.time() - at < 600:
        return ok
    exe = shutil.which('tailscale') or r'C:\Program Files\Tailscale\tailscale.exe'
    try:
        p = await asyncio.create_subprocess_exec(exe, 'ping', '-c', '3', '--timeout', '3s', host.split('.')[0],
                                                 stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        out = (await asyncio.wait_for(p.communicate(), 20))[0].decode(errors='replace')
        ok = 'via DERP' not in out or 'via ' in out.replace('via DERP', '')  # a direct answer after a relayed one counts
    except Exception:
        ok = True  # no tailscale command here: the picked speed still holds
    _DIRECT[host] = (time.time(), ok)
    return ok


async def _sync_pair(s, dst, src):
    if not (await _direct(src) and await _direct(dst)):
        return  # relayed: a big copy would go out through the internet connection
    try:
        status, j = await _post(s, dst + '/renderdeck/sync', {'source': src})
        if status == 200 and j.get('queued'):
            _st(dst)['copies'] += [{'name': n, 'done': 0, 'total': 0} for n in j['queued']]
            _st(dst)['lists_at'] = 0
    except Exception:
        pass


async def _copy_pictures(s, graph, home, url, key):
    for n in graph.values():
        if n.get('class_type') != 'LoadImage':
            continue
        name, kind = n['inputs']['image'], 'input'
        if name.endswith(' [output]'):
            name, kind = name[:-9], 'output'
        sub, _, file = name.rpartition('/')
        async with s.get(home + '/view', params={'filename': file, 'subfolder': sub, 'type': kind}) as r:
            if r.status != 200:
                raise ValueError('could not get the picture ' + file)
            data = await r.read()
        form = aiohttp.FormData()
        form.add_field('image', data, filename='rd-' + key + '-' + file)
        form.add_field('overwrite', 'true')
        form.add_field('type', 'input')
        async with s.post(url + '/upload/image', data=form) as r:
            u = await r.json(content_type=None)
        n['inputs']['image'] = (u['subfolder'] + '/' if u.get('subfolder') else '') + u['name']


def _finish(job, status, **kw):
    job.update(kw, state=status, t_done=time.time())
    FARM['jobs'] = [j for j in FARM['jobs'] if j is not job]
    job.pop('graph', None)
    FARM['done'] = (FARM['done'] + [job])[-200:]


async def _farm_round(s):
    pcs = [p['url'] for p in FARM['pcs']]
    await asyncio.gather(*[_look(s, u) for u in pcs])
    changed = False
    # what came back from renders already handed out
    for job in list(FARM['jobs']):
        if job['state'] not in ('sent', 'running'):
            continue
        st = _st(job['srv'])
        if not st['online']:
            continue
        if job['id'] in st['running']:
            if job['state'] != 'running':
                job['state'], changed = 'running', True
            continue
        if job['id'] in st['pending']:
            continue
        try:
            h = (await _get(s, job['srv'] + '/history/' + job['id'])).get(job['id'])
        except Exception:
            continue
        if h and (h.get('status') or {}).get('completed'):
            imgs = [i for o in (h.get('outputs') or {}).values() for i in o.get('images', []) if i.get('type') == 'output']
            _finish(job, 'done', images=imgs)
        elif h and (h.get('status') or {}).get('status_str') == 'error':
            msg = next((m[1].get('exception_message') for m in (h['status'].get('messages') or []) if m[0] == 'execution_error'), '')
            _finish(job, 'failed', error=msg or 'ComfyUI hit an error while rendering')
        elif not h and time.time() - job.get('t_sent', 0) > 15:
            if job.get('resent'):
                _finish(job, 'failed', error='It disappeared from ' + job['srv'] + "'s queue twice")
            else:  # ComfyUI restarted and forgot it, or it was cancelled there: send it again once
                job.update(state='waiting', resent=True)
        else:
            continue
        changed = True
    # free computers take the next render they can run
    for u in pcs:
        st = _st(u)
        st['why'] = ''
        if not st['online'] or u in FARM['off'] or st['running'] or st['pending']:
            continue
        if AUTO_TRAINING['pc'] and _tailnet(AUTO_TRAINING['pc']) == u:
            st['why'] = 'training a LoRA'
            continue
        for job in FARM['jobs']:
            if job['state'] != 'waiting':
                continue
            graph, missing, why = _fit(u, job)
            if missing and not why and time.time() - st['asked'] > 1800:  # at most every half hour, so a failed copy doesn't start again at once
                st['asked'] = time.time()
                await _sync_pair(s, u, job['home'])
            if graph is None or missing or why:
                st['why'] = why or ('copying ' + ', '.join(m['name'] for m in missing) if missing else '')
                continue
            try:
                if u != job['home']:
                    await _copy_pictures(s, graph, job['home'], u, job['key'])
                status, j = await _post(s, u + '/prompt', {'prompt': graph, 'client_id': job.get('client_id') or 'renderdeck-farm'})
            except Exception as e:
                st['why'] = 'could not send: ' + str(e)
                break
            if status != 200 or j.get('error'):
                err = j.get('error') or {}
                _finish(job, 'failed', error=(err.get('message') if isinstance(err, dict) else str(err)) or 'ComfyUI refused the graph',
                        node_errors=j.get('node_errors'), srv=u)
            else:
                job.update(state='sent', srv=u, id=j['prompt_id'], t_sent=time.time())
                st['pending'] = [j['prompt_id']]
            changed = True
            break
    # No timed compare for now: copies only start when a render needs a model a computer lacks (above), or from
    # the app's Check now. A timed one, started again after each WiFi drop, is the suspect for the house WiFi dropping.
    if changed:
        _farm_save()


async def _farm_loop():
    global _farm_wake
    _farm_wake = asyncio.Event()
    async with aiohttp.ClientSession() as s:
        while True:
            try:
                await _farm_round(s)
            except Exception as e:
                print('[Render Deck farm]', e)
            busy = FARM['jobs'] or any(_st(p['url'])['copies'] for p in FARM['pcs'])
            try:
                await asyncio.wait_for(_farm_wake.wait(), 1.5 if busy else 30)
            except asyncio.TimeoutError:
                pass
            _farm_wake.clear()


def _farm_start():
    global _farm_task
    if _farm_task is None or _farm_task.done():
        _farm_load()
        _farm_task = asyncio.ensure_future(_farm_loop())
    elif _farm_wake:
        _farm_wake.set()


def _farm_pcs(body):
    if 'pcs' in body:
        pcs = []
        for p in body['pcs']:
            url = _tailnet(p.get('url'))
            if not any(x['url'] == url for x in pcs):
                pcs.append({'url': url, 'name': str(p.get('name') or url)[:40]})
        FARM['pcs'] = pcs
    if 'off' in body:
        FARM['off'] = [u for u in body['off'] if any(p['url'] == u for p in FARM['pcs'])]


def _farm_view(since):
    pcs = []
    for p in FARM['pcs']:
        st = _st(p['url'])
        pcs.append({'url': p['url'], 'name': p['name'], 'online': st['online'], 'off': p['url'] in FARM['off'],
                    'load': len(st['running']) + len(st['pending']), 'copies': st['copies'], 'why': st['why']})
    jobs = [{k: v for k, v in j.items() if k != 'graph'} for j in FARM['jobs']]
    done = [j for j in FARM['done'] if j.get('t_done', 0) > since]
    return {'farm': 1, 'pcs': pcs, 'jobs': jobs, 'done': done, 'now': time.time()}


@routes.get('/renderdeck/farm')
async def farm(request):
    _farm_start()
    try:
        since = float(request.query.get('since') or 0)
    except ValueError:
        since = 0
    return web.json_response(_farm_view(since))


@routes.post('/renderdeck/farm/add')
async def farm_add(request):
    """{pcs:[{url,name}], off:[url], jobs:[{key, graph, home, client_id, prompt, seed, ckpt, n, of, hidden}]}"""
    try:
        body = await request.json()
        _farm_start()
        _farm_pcs(body)
        for j in body.get('jobs', []):
            if not isinstance(j.get('graph'), dict) or not j.get('key'):
                raise ValueError('Each render needs its graph')
            home = _tailnet(j.get('home'))
            FARM['jobs'].append({'key': str(j['key'])[:40], 'graph': j['graph'], 'home': home, 'client_id': str(j.get('client_id') or '')[:60],
                                 'prompt': str(j.get('prompt') or '')[:300], 'seed': j.get('seed'), 'ckpt': str(j.get('ckpt') or '')[:200],
                                 'n': j.get('n'), 'of': j.get('of'), 'hidden': bool(j.get('hidden')), 'pin': _tailnet(j.get('pin')) if j.get('pin') else '', 'state': 'waiting', 'srv': '', 'id': '', 't_added': time.time()})
        _farm_save()
        _farm_wake.set()
        return web.json_response(_farm_view(time.time()))
    except Exception as e:
        return web.json_response({'error': str(e)}, status=400)


@routes.post('/renderdeck/farm/cancel')
async def farm_cancel(request):
    """{keys:[...]}: waiting renders are dropped; one handed out is taken out of that computer's queue, or stopped."""
    try:
        keys = set((await request.json()).get('keys') or [])
        gone = [j for j in FARM['jobs'] if j['key'] in keys]
        FARM['jobs'] = [j for j in FARM['jobs'] if j['key'] not in keys]
        _farm_save()
        async with aiohttp.ClientSession() as s:
            for j in gone:
                if j['state'] in ('sent', 'running') and j.get('id'):
                    try:
                        await _post(s, j['srv'] + '/queue', {'delete': [j['id']]}, 10)
                        q = await _get(s, j['srv'] + '/queue')
                        if any(x[1] == j['id'] for x in q.get('queue_running', [])):
                            await _post(s, j['srv'] + '/interrupt', {'prompt_id': j['id']}, 10)
                    except Exception:
                        pass
        if _farm_wake:
            _farm_wake.set()
        return web.json_response({'cancelled': len(gone)})
    except Exception as e:
        return web.json_response({'error': str(e)}, status=400)


@routes.post('/renderdeck/farm/pcs')
async def farm_pcs(request):
    """{pcs:[{url,name}], off:[url]}: which computers take renders"""
    try:
        _farm_start()
        _farm_pcs(await request.json())
        _farm_save()
        _farm_wake.set()
        return web.json_response(_farm_view(time.time()))
    except Exception as e:
        return web.json_response({'error': str(e)}, status=400)


# ---------- auto run: one reference picture to a finished LoRA, on this computer, with the phone app closed ----------
# The app sends the graphs it would run itself (the turnaround, one per training shot with @SIDE/@BACK for the angle
# pictures this run finds, and the quality pass with @IMG/@TAGS when it redraws) and how far to go. Here, in order:
#   turn   the turnaround clip through this ComfyUI's queue
#   angles six frames found by the silhouette's width (as the app's findSides), saved 1.5x bigger (or redrawn)
#   shots  every training shot queued at once; the two sharpest moments of each clip (a second apart), saved the same way
#   pick   15-30 pictures: near-repeats and blurry ones dropped, the angles always kept, the sharpest shot frames after
#          them; written with captions to kohya's data folder and to RenderDeck/datasets/<trigger> in the output folder
#   train  kohya sd-scripts (found next to ComfyUI) with the settings that fit the 8 GB laptops, stopped above 87 C
# State lives in render_deck_auto.json, so a ComfyUI restart picks the run back up at the step it was on.
AUTO_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render_deck_auto.json')
AUTO = {'jobs': []}
AUTO_STEPS = ('turn', 'angles', 'shots', 'pick', 'train')
AUTO_UNTIL = {'angles': 'angles', 'shots': 'shots', 'pick': 'pick', 'lora': 'train'}
AUTO_TRAINING = {'pc': ''}  # the farm leaves this computer alone while kohya has the GPU
_auto_task = None
TV_LEN = 124
SLOTS = (('front', 'front'), ('three', 'three'), ('right', 'right'), ('back', 'back'), ('left', 'left'), ('three_b', 'three'))
VIEW_TAG = {'front': '', 'three': '', 'right': 'from side', 'left': 'from side', 'back': 'from behind'}
A_POSE = 'standing, a-pose, full body, simple background, white background'
HOT_C = 87


def _auto_load():
    try:
        with open(AUTO_FILE, encoding='utf-8') as f:
            AUTO.update(json.load(f))
    except Exception:
        pass


def _auto_save():
    tmp = AUTO_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(AUTO, f)
    os.replace(tmp, AUTO_FILE)


def _auto_view(j):
    return {k: v for k, v in j.items() if k not in ('turn_graph', 'shot_graphs', 'redraw')}


def _me():
    try:
        from comfy.cli_args import args
        return 'http://127.0.0.1:%d' % args.port
    except Exception:
        return 'http://127.0.0.1:8188'


def _say(j, step, text, prog=None):
    j.update(step=step, text=text)
    if prog is not None:
        j['prog'] = round(prog, 4)
    _auto_save()


def _outfile(f):
    return os.path.join(folder_paths.get_output_directory(), f.get('subfolder', ''), f['filename'])


async def _comfy_run(s, j, graph, save_id, label):
    """Queue a graph on this ComfyUI and wait for its first output file; returns {filename, subfolder, type}."""
    st, r = await _post(s, _me() + '/prompt', {'prompt': graph, 'client_id': 'rd-auto'})
    if st != 200 or not r.get('prompt_id'):
        raise RuntimeError(label + ': ComfyUI turned it down (' + json.dumps(r.get('error') or r)[:200] + ')')
    return await _comfy_wait(s, j, r['prompt_id'], save_id, label)


async def _comfy_wait(s, j, pid, save_id, label):
    while True:
        await asyncio.sleep(3)
        if j.get('stop'):
            raise RuntimeError('stopped')
        try:
            h = (await _get(s, _me() + '/history/' + pid, 10)).get(pid)
        except Exception:
            continue
        if not h:
            q = await _get(s, _me() + '/queue', 10)
            if any(x[1] == pid for x in q.get('queue_running', []) + q.get('queue_pending', [])):
                continue
            raise RuntimeError(label + ': it left the queue without finishing (ComfyUI restarted?)')
        stt = h.get('status') or {}
        if stt.get('status_str') == 'error':
            msg = next((m[1].get('exception_message') for m in stt.get('messages', []) if m[0] == 'execution_error'), 'ComfyUI hit an error')
            raise RuntimeError(label + ': ' + str(msg).strip()[:300])
        if not stt.get('completed'):
            continue
        o = (h.get('outputs') or {}).get(str(save_id)) or {}
        f = (o.get('images') or o.get('videos') or o.get('gifs') or [None])[0]
        if not f:
            raise RuntimeError(label + ': nothing came back')
        return {'filename': f['filename'], 'subfolder': f.get('subfolder', ''), 'type': 'output'}


def _frames(path, want=None, small=None):
    """Frames of a clip as PIL pictures: all (as `small` (w, h) when given) or just the indexes in `want`."""
    import av
    from PIL import Image
    out = {}
    with av.open(path) as c:
        for i, fr in enumerate(c.decode(video=0)):
            if want is None or i in want:
                im = fr.to_image().convert('RGB')
                out[i] = im.resize(small, Image.BILINEAR) if small else im
    return out


def _find_sides(path):
    import numpy as np
    n, W, H = TV_LEN, 144, 256
    idx = [min(n - 1, i * 2) for i in range((n + 1) // 2)]
    fr = _frames(path, set(idx), (W, H))
    n = max(fr) + 1 if fr else n
    idx = [i for i in idx if i in fr]
    rows = round(H * 0.92)
    wid = []
    for i in idx:
        a = np.asarray(fr[i])[:rows].min(axis=2) < 225
        wid.append(int((a.sum(axis=0) >= 3).sum()))

    def best(lo, hi, wide=False):
        b, bv = -1, 0
        for f, w in zip(idx, wid):
            p = f / (n - 1)
            if lo <= p <= hi:
                v = w if wide else -w
                if b < 0 or v > bv:
                    b, bv = f, v
        return b
    at = {'front': 0.03, 'three': 0.125, 'right': 0.25, 'back': 0.5, 'left': 0.75}
    right = best(0.14, 0.36)
    right = right if right >= 0 else round(at['right'] * (n - 1))
    left = best(0.64, 0.86)
    left = left if left >= 0 else round(at['left'] * (n - 1))
    mid = (right + left) / 2 / (n - 1)
    near = [(f, w) for f, w in zip(idx, wid) if abs(f / (n - 1) - mid) <= 0.06]
    top = max([w for _, w in near] or [0])
    wide = [f for f, w in near if w >= 0.97 * top]
    back = wide[len(wide) >> 1] if wide else round(at['back'] * (n - 1))
    front = best(0, 0.08, True)
    front = front if front >= 0 else round(at['front'] * (n - 1))
    return {'front': front, 'three': round((front + right) / 2), 'right': right, 'back': back, 'left': left, 'three_b': round((left + n - 1) / 2)}


def _sharp(im):
    """Edge detail (variance of a Laplacian) of a picture, on a 144x256 grey copy."""
    import numpy as np
    from PIL import Image
    g = np.asarray(im.convert('L').resize((144, 256), Image.BILINEAR), dtype=np.float32)
    lap = 4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]
    return float(lap.var())


def _sharpest(path, n):
    fr = _frames(path, None, (144, 256))
    last = max(fr) if fr else TV_LEN - 1
    sc = sorted(((i, _sharp(fr[i])) for i in range(12, last - 1, 4) if i in fr), key=lambda x: -x[1])
    out = []
    for f, _ in sc:
        if len(out) >= n:
            break
        if all(abs(x - f) >= 24 for x in out):
            out.append(f)
    return out


def _dhash(path):
    from PIL import Image
    g = Image.open(path).convert('L').resize((9, 8), Image.BILINEAR)
    p = list(g.getdata())
    return sum(1 << i for i in range(64) if p[(i // 8) * 9 + i % 8] > p[(i // 8) * 9 + i % 8 + 1])


async def _keep_frame(s, j, im, prefix, tags):
    """A frame as a training picture: 1.5x bigger (lanczos), or through the app's quality pass graph when it redraws."""
    from PIL import Image
    if j.get('redraw'):
        name = 'rdauto_%s_%s.png' % (j['id'], uuid.uuid4().hex[:8])
        im.save(os.path.join(folder_paths.get_input_directory(), name))
        g = json.loads(json.dumps(j['redraw']['graph']).replace('@IMG', name).replace('@TAGS', tags.replace('"', '')))
        return await _comfy_run(s, j, g, j['redraw']['save'], 'the quality pass')
    sub, base = prefix.rsplit('/', 1)
    full, _, _ = _save_path_per_pc_dir(sub)
    os.makedirs(full, exist_ok=True)
    name = '%s_%s_%s.png' % (base, time.strftime('%y%m%d%H%M%S'), uuid.uuid4().hex[:4])
    big = im.resize((round(im.width * 1.5), round(im.height * 1.5)), Image.LANCZOS)
    await asyncio.to_thread(big.save, os.path.join(full, name))
    return {'filename': name, 'subfolder': os.path.relpath(full, folder_paths.get_output_directory()).replace('\\', '/'), 'type': 'output'}


def _save_path_per_pc_dir(sub):
    """The folder a SaveImage with this subfolder would write to (this computer's own subfolder in a shared output)."""
    full, filename, counter, subfolder, _ = folder_paths.get_save_image_path(sub + '/x', folder_paths.get_output_directory())
    return full, subfolder, filename


def _input_copy(j, f, tag):
    name = 'rdauto_%s_%s.png' % (j['id'], tag)
    shutil.copyfile(_outfile(f), os.path.join(folder_paths.get_input_directory(), name))
    return name


async def _step_turn(s, j):
    if j.get('turn'):
        return
    _say(j, 'turn', 'Making the turnaround video…', 0.01)
    j['turn'] = await _comfy_run(s, j, j['turn_graph']['graph'], j['turn_graph']['save'], 'the turnaround')
    _auto_save()


async def _step_angles(s, j):
    if j.get('angles') and len(j['angles']) >= len(SLOTS) - (1 if j.get('keep_front') else 0):
        return
    _say(j, 'angles', 'Finding the six angles in the turnaround…')
    clip = _outfile(j['turn'])
    at = await asyncio.to_thread(_find_sides, clip)
    fr = await asyncio.to_thread(_frames, clip, set(at.values()))
    j['angles'] = j.get('angles') or {}
    for slot, ang in SLOTS:
        if slot in j['angles'] or (slot == 'front' and j.get('keep_front')) or at[slot] not in fr:
            continue
        _say(j, 'angles', 'Saving the ' + slot.replace('three_b', '3/4 other side').replace('three', '3/4') + ' view…')
        f = await _keep_frame(s, j, fr[at[slot]], j['angles_prefix'], A_POSE + (', ' + VIEW_TAG[ang] if VIEW_TAG[ang] else ''))
        j['angles'][slot] = dict(f, at=at[slot], angle=ang)
        _auto_save()


async def _step_shots(s, j):
    shots = j['shots']
    if all(x.get('frames') or x.get('err') for x in shots):
        return
    side = j['angles'].get('right') or j['angles'].get('left')
    back = j['angles'].get('back')
    ins = {'@SIDE': _input_copy(j, side, 'side') if side else j['src'], '@BACK': _input_copy(j, back, 'back') if back else j['src']}
    # everything into the queue at once, so a restart of the run finds them already made or waiting
    for i, x in enumerate(shots):
        if x.get('frames') or x.get('err') or x.get('pid') or x.get('clip'):
            continue
        g = json.dumps(j['shot_graphs'][i]['graph'])
        for k, v in ins.items():
            g = g.replace(k, v)
        st, r = await _post(s, _me() + '/prompt', {'prompt': json.loads(g), 'client_id': 'rd-auto'})
        if st != 200 or not r.get('prompt_id'):
            x['err'] = 'ComfyUI turned it down'
        else:
            x['pid'] = r['prompt_id']
        _auto_save()
    for i, x in enumerate(shots):
        if x.get('frames') or x.get('err'):
            continue
        _say(j, 'shots', 'Training shot %d of %d: %s' % (i + 1, len(shots), x['say'][:60]))
        try:
            if not x.get('clip'):
                x['clip'] = await _comfy_wait(s, j, x['pid'], j['shot_graphs'][i]['save'], 'shot %d' % (i + 1))
                _auto_save()
            best = await asyncio.to_thread(_sharpest, _outfile(x['clip']), j.get('per_shot', 2))
            fr = await asyncio.to_thread(_frames, _outfile(x['clip']), set(best))
            x['frames'] = []
            for b in best:
                f = await _keep_frame(s, j, fr[b], j['shots_prefix'], x.get('tags', ''))
                x['frames'].append(dict(f, at=b))
        except RuntimeError as e:
            if str(e) == 'stopped':
                raise
            x['err'] = str(e)
        _auto_save()


def _pick(j):
    """Drop near-repeats and blurry pictures, keep the angles, fill up to the most with the sharpest shot frames."""
    lo, hi = j.get('set_min', 15), j.get('set_max', 30)
    items = [dict(f, kind='angle', cap=A_POSE + (', ' + VIEW_TAG[f['angle']] if VIEW_TAG[f['angle']] else '')) for f in j['angles'].values()]
    for x in j['shots']:
        for f in x.get('frames') or []:
            items.append(dict(f, kind='shot', cap=x.get('tags', '')))
    for it in items:
        from PIL import Image
        p = _outfile(it)
        it['sharp'] = _sharp(Image.open(p))
        it['hash'] = _dhash(p)
    shots = sorted([i for i in items if i['kind'] == 'shot'], key=lambda i: -i['sharp'])
    med = sorted(i['sharp'] for i in shots)[len(shots) // 2] if shots else 0
    keep = [i for i in items if i['kind'] == 'angle']
    for i in shots:
        if len(keep) >= hi:
            break
        if med and i['sharp'] < 0.35 * med:
            continue
        if any(bin(i['hash'] ^ k['hash']).count('1') <= 6 for k in keep):
            continue
        keep.append(i)
    j['picks'] = [{'filename': i['filename'], 'subfolder': i['subfolder'], 'cap': i['cap']} for i in keep]
    j['pick_note'] = '' if len(keep) >= lo else 'Only %d good pictures (aim %d-%d): add more training shots for a better LoRA.' % (len(keep), lo, hi)


_KOHYA = []


def _kohya():
    """kohya sd-scripts next to ComfyUI and the Python of its own venv (looked up once)."""
    if not _KOHYA or not _KOHYA[0][0]:
        _KOHYA[:] = [_kohya_find()]
    return _KOHYA[0]


def _kohya_find():
    import glob
    base = os.path.abspath(getattr(folder_paths, 'base_path', os.getcwd()))
    roots = [base, os.path.dirname(base), os.path.dirname(os.path.dirname(base)), os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Comfy-Desktop')]
    for r in roots:
        sd = os.path.join(r, 'kohya', 'sd-scripts')
        if os.path.exists(os.path.join(sd, 'sdxl_train_network.py')):
            for py in glob.glob(os.path.join(r, 'kohya', '**', 'python.exe'), recursive=True) + glob.glob(os.path.join(r, 'kohya', '**', 'bin', 'python'), recursive=True):
                if 'venv' in py.lower():
                    return sd, py
    return None, None


def _write_set(j):
    trig, who = j['trigger'], j.get('who', '')
    sd, py = _kohya()
    dirs = [os.path.join(folder_paths.get_output_directory(), j['dataset_dir'])]
    if sd:
        dirs.append(os.path.join(os.path.dirname(sd), 'data', trig, '10_' + trig))
    for d in dirs:
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.lower().endswith(PICS + ('.txt', '.npz')):
                    os.remove(os.path.join(d, f))
        os.makedirs(d, exist_ok=True)
        for n, p in enumerate(j['picks']):
            stem = '%s_%02d' % (trig, n + 1)
            shutil.copyfile(_outfile(p), os.path.join(d, stem + '.png'))
            cap = ', '.join(x for x in [trig, who, 'solo', p['cap']] if x)
            with open(os.path.join(d, stem + '.txt'), 'w', encoding='utf-8') as f:
                f.write(cap)
    j['kohya_data'] = os.path.dirname(dirs[-1]) if sd else ''


async def _step_pick(s, j):
    if j.get('picks') is None:
        _say(j, 'pick', 'Picking the training set…')
        await asyncio.to_thread(_pick, j)
    await asyncio.to_thread(_write_set, j)
    _auto_save()


def _gpu_c():
    import subprocess
    try:
        out = subprocess.run(['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=10).stdout
        return int(out.strip().splitlines()[0])
    except Exception:
        return 0


def _train_blocking(j, cmd, env, cwd):
    import subprocess
    p = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    j['_pid'] = p.pid
    buf, hot, tail, last_t = b'', 0, [], 0
    while True:
        ch = p.stdout.read(256)
        if not ch:
            break
        buf = (buf + ch)[-4000:]
        txt = buf.decode('utf-8', 'replace')
        m = re.findall(r'(\d+)/(\d+) \[', txt)
        if m:
            a, b = map(int, m[-1])
            if b == int(j.get('steps', 1200)):  # the training bar, not the caching ones
                j['train_step'], j['train_steps'] = a, b
        tail = txt.splitlines()[-12:]
        if time.time() - last_t > 20:
            last_t = time.time()
            c = _gpu_c()
            j['gpu_c'] = c
            hot = hot + 1 if c > HOT_C else 0
            if hot >= 2:
                p.kill()
                p.wait()
                return 'The GPU went over %d C, so training stopped to protect the laptop.' % HOT_C
            if j.get('stop'):
                p.kill()
                p.wait()
                return 'stopped'
    p.wait()
    if p.returncode:
        return 'kohya stopped with an error: ' + ' | '.join(tail)[-400:]
    return ''


async def _step_train(s, j):
    if j.get('lora'):
        return
    sd, py = _kohya()
    if not sd:
        raise RuntimeError("kohya sd-scripts isn't next to ComfyUI (looked for kohya\\sd-scripts with its venv)")
    ckpt = folder_paths.get_full_path('checkpoints', j['ckpt'])
    if not ckpt:
        raise RuntimeError('this computer has no ' + j['ckpt'])
    loras = folder_paths.get_folder_paths('loras')[0]
    name = '%s_auto_%s' % (j['trigger'], time.strftime('%y%m%d_%H%M'))
    j['lora_name'] = name
    _say(j, 'train', 'Freeing the graphics card for training…')
    try:
        await _post(s, _me() + '/free', {'unload_models': True, 'free_memory': True})
    except Exception:
        pass
    AUTO_TRAINING['pc'] = j.get('pc', '')
    steps = int(j.get('steps', 1200))
    cmd = [py, os.path.join(sd, 'sdxl_train_network.py'), '--pretrained_model_name_or_path', ckpt, '--train_data_dir', j['kohya_data'],
           '--output_dir', loras, '--output_name', name, '--save_model_as', 'safetensors', '--network_module', 'networks.lora',
           '--network_dim', '16', '--network_alpha', '8', '--network_train_unet_only', '--resolution', '1024,1024', '--enable_bucket',
           '--min_bucket_reso', '512', '--max_bucket_reso', '1536', '--bucket_reso_steps', '64', '--caption_extension', '.txt',
           '--optimizer_type', 'Adafactor', '--optimizer_args', 'scale_parameter=False', 'relative_step=False', 'warmup_init=False',
           '--learning_rate', '1e-4', '--lr_scheduler', 'constant_with_warmup', '--lr_warmup_steps', '50', '--max_train_steps', str(steps),
           '--save_every_n_steps', str(max(100, steps // 3)), '--train_batch_size', '1', '--mixed_precision', 'bf16', '--save_precision', 'fp16',
           '--fp8_base', '--cache_latents', '--cache_latents_to_disk', '--cache_text_encoder_outputs', '--gradient_checkpointing', '--sdpa',
           '--max_data_loader_n_workers', '0', '--seed', '42']
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
    _say(j, 'train', 'Training the LoRA with kohya…')
    try:
        why = await asyncio.to_thread(_train_blocking, j, cmd, env, sd)
    finally:
        AUTO_TRAINING['pc'] = ''
    if why:
        raise RuntimeError(why)
    j['lora'] = name + '.safetensors'
    j['lora_saves'] = sorted(f for f in os.listdir(loras) if f.startswith(name) and f.endswith('.safetensors'))
    _auto_save()


AUTO_FN = {'turn': _step_turn, 'angles': _step_angles, 'shots': _step_shots, 'pick': _step_pick, 'train': _step_train}


def _auto_prog(j):
    w = {'turn': 300, 'angles': 30, 'shots': 330 * max(1, len(j.get('shots', []))), 'pick': 30, 'train': 2400}
    upto = AUTO_STEPS[:AUTO_STEPS.index(AUTO_UNTIL[j['until']]) + 1]
    total = sum(w[x] for x in upto)
    done = sum(w[x] for x in upto[:upto.index(j['step'])]) if j.get('step') in upto else 0
    part = 0
    if j.get('step') == 'shots':
        sh = j.get('shots', [])
        part = w['shots'] * sum(1 for x in sh if x.get('frames') or x.get('err')) / max(1, len(sh))
    elif j.get('step') == 'train' and j.get('train_steps'):
        part = w['train'] * j['train_step'] / j['train_steps']
    elif j.get('step') == 'turn' and j.get('t_step'):
        part = min(0.95, (time.time() - j['t_step']) / w['turn']) * w['turn']
    return min(0.99, (done + part) / total)


async def _auto_loop():
    async with aiohttp.ClientSession() as s:
        while True:
            j = next((x for x in AUTO['jobs'] if x['state'] == 'running'), None)
            if not j:
                return
            try:
                upto = AUTO_STEPS[:AUTO_STEPS.index(AUTO_UNTIL[j['until']]) + 1]
                for st in upto:
                    if j.get('stop'):
                        raise RuntimeError('stopped')
                    j['step'], j['t_step'] = st, time.time()
                    j['prog'] = _auto_prog(j)
                    _auto_save()
                    await AUTO_FN[st](s, j)
                    j.setdefault('done', [])
                    if st not in j['done']:
                        j['done'].append(st)
                j.update(state='done', text='Finished', prog=1, ended=time.time())
            except Exception as e:
                stopped = str(e) == 'stopped'
                j.update(state='stopped' if stopped else 'error', text='Stopped' if stopped else str(e)[:500], ended=time.time())
                print('[Render Deck auto]', e)
            _auto_save()


async def _auto_tick():
    while True:
        await asyncio.sleep(5)
        for j in AUTO['jobs']:
            if j['state'] == 'running':
                j['prog'] = _auto_prog(j)


_auto_ticker = None


def _auto_start():
    global _auto_task, _auto_ticker
    if _auto_task is None or _auto_task.done():
        _auto_task = asyncio.ensure_future(_auto_loop())
    if _auto_ticker is None or _auto_ticker.done():
        _auto_ticker = asyncio.ensure_future(_auto_tick())


@routes.get('/renderdeck/auto')
async def auto_state(request):
    if _auto_task is None and any(x['state'] == 'running' for x in AUTO['jobs']):
        _auto_start()  # a run left going when ComfyUI restarted
    return web.json_response({'jobs': [_auto_view(j) for j in AUTO['jobs'][-10:]], 'kohya': bool(_kohya()[0]), 'busy': any(x['state'] == 'running' for x in AUTO['jobs'])})


@routes.post('/renderdeck/auto/start')
async def auto_start(request):
    b = await request.json()
    if any(x['state'] == 'running' for x in AUTO['jobs']):
        return web.json_response({'error': 'An auto run is already going on this computer.'}, status=409)
    if b.get('until') not in AUTO_UNTIL:
        return web.json_response({'error': 'until must be one of ' + ', '.join(AUTO_UNTIL)}, status=400)
    if b['until'] == 'lora' and not _kohya()[0]:
        return web.json_response({'error': "kohya sd-scripts isn't next to ComfyUI on this computer, so it can't train the LoRA here."}, status=400)
    j = {'id': uuid.uuid4().hex[:10], 'state': 'running', 'started': time.time(), 'prog': 0, 'step': 'turn', 'text': 'Starting…', 'done': []}
    for k in ('char', 'until', 'turn_graph', 'shot_graphs', 'redraw', 'src', 'keep_front', 'angles_prefix', 'shots_prefix', 'trigger', 'who',
              'dataset_dir', 'ckpt', 'steps', 'per_shot', 'set_min', 'set_max', 'pc'):
        if k in b:
            j[k] = b[k]
    j['shots'] = [{'say': x.get('say', ''), 'tags': x.get('tags', '')} for x in b.get('shots', [])]
    j['trigger'] = re.sub(r'[^\w]+', '_', j.get('trigger') or 'character').strip('_') or 'character'
    AUTO['jobs'] = AUTO['jobs'][-9:] + [j]
    _auto_save()
    _auto_start()
    return web.json_response({'id': j['id']})


@routes.post('/renderdeck/auto/stop')
async def auto_stop(request):
    b = await request.json()
    for j in AUTO['jobs']:
        if j['id'] == b.get('id') and j['state'] == 'running':
            j['stop'] = True
            # clips still waiting in the queue go too
            pids = [x['pid'] for x in j.get('shots', []) if x.get('pid') and not x.get('clip')]
            if pids:
                try:
                    async with aiohttp.ClientSession() as s:
                        await _post(s, _me() + '/queue', {'delete': pids})
                except Exception:
                    pass
            _auto_save()
    return web.json_response({'ok': True})


_auto_load()
if any(x['state'] == 'running' for x in AUTO['jobs']):  # a run left going when ComfyUI restarted carries on
    try:
        PromptServer.instance.loop.call_soon_threadsafe(_auto_start)
    except Exception as e:
        print('[Render Deck auto] resume later:', e)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
