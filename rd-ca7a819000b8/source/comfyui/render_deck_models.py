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
  GET  /renderdeck/farm, POST /renderdeck/farm/add|cancel|pcs -> the render farm queue: renders go to whichever of your
                                               computers is free, even with the phone app closed (render_deck_farm.json)
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

KINDS = ('checkpoints', 'loras')
CIVITAI = ('civitai.com', 'civitai.red', 'civitai.green')  # Civitai's sites share one API and the same model ids
HOSTS = CIVITAI + ('huggingface.co',)
JOBS = {}  # id -> job dict, newest last
SYNC_MBPS = 2  # copies between your computers are held to about this many MB a second: at 15 the house WiFi kept dropping
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
    """Sleep as long as it takes to keep a copy between computers at SYNC_MBPS."""
    ahead = sent / (SYNC_MBPS * 1024**2) - (time.time() - started)
    if ahead > 0:
        await asyncio.sleep(ahead)


async def _download(j, file_url, path):
    tmp = path + '.part'
    started = time.time()
    try:
        headers = {'Authorization': 'Bearer ' + _token()} if _token() and any(c in file_url for c in CIVITAI) else {}
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, sock_read=120)) as s:
            async with s.get(file_url, headers=headers, allow_redirects=True) as r:
                if r.status in (401, 403):
                    raise ValueError('Civitai wants you signed in for this one: add your API key on the render computer (see the helper file)')
                if r.status != 200:
                    raise ValueError('Download answered %d' % r.status)
                j['total'] = int(r.headers.get('Content-Length') or j['total'] or 0)
                _room(path, j['total'])
                j['status'] = 'downloading'
                with open(tmp, 'wb') as out:
                    async for chunk in r.content.iter_chunked(1 << 20):
                        out.write(chunk)
                        j['done'] += len(chunk)
                        if j.get('source'):  # a copy from your other computer: gently
                            await _pace(started, j['done'])
                        if j.get('cancel'):
                            raise ValueError('Stopped')
        os.replace(tmp, path)
        j['status'] = 'done'
    except Exception as e:
        j['status'], j['error'] = 'failed', str(e) or e.__class__.__name__
        if os.path.exists(tmp):
            os.remove(tmp)


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
        name = _clean(body.get('name') or info['name'])
        path = _target(kind, name)
        _room(path, info['size'])
        j = _job(name=name, kind=kind, total=info['size'], source=url, base=info['base'], words=info['words'], title=info['title'])
        asyncio.ensure_future(_download(j, info['file_url'], path))
        return web.json_response(j)
    except Exception as e:
        return web.json_response({'error': str(e)}, status=400)


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
    hidden=1 lists only the app's Hidden renders (any folder named Hidden), hidden=0 everything else."""
    root = folder_paths.get_output_directory()
    found, hidden = [], request.query.get('hidden')
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x != TRASH and not x.startswith('.')]
        sub = os.path.relpath(d, root).replace('\\', '/')
        for f in files:
            if f.lower().endswith(PICS):
                if hidden in ('0', '1') and (HIDDEN in sub.split('/')) != (hidden == '1'):
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
            await _pace(started, sent)  # held to SYNC_MBPS, whichever computer's helper is the newer one
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
        await _download(j, url, path)


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
# checkpoint or LoRA is asked to copy it from another (the sync above), and the computers' models are compared
# every half hour, so a new model ends up on all of them (copied one file at a time, at SYNC_MBPS). The queue is saved to render_deck_farm.json, so it
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
                                    'lists_at': 0, 'synced_at': 0, 'copies': [], 'why': '', 'asked': 0})


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
            opts = _combo((inp.get('required') or {}).get(k) or (inp.get('optional') or {}).get(k))
            if not opts or v in opts:
                continue
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


async def _sync_pair(s, dst, src):
    try:
        status, j = await _post(s, dst + '/renderdeck/sync', {'source': src})
        if status == 200 and j.get('queued'):
            _st(dst)['copies'] += [{'name': n, 'done': 0, 'total': 0} for n in j['queued']]
            _st(dst)['lists_at'] = 0
    except Exception:
        pass


async def _sync_all(s):
    on = [p['url'] for p in FARM['pcs'] if _st(p['url'])['online']]
    for dst in on:
        for src in on:
            if dst != src:
                await _sync_pair(s, dst, src)
    for u in on:
        _st(u)['synced_at'] = time.time()


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
        for job in FARM['jobs']:
            if job['state'] != 'waiting':
                continue
            graph, missing, why = _fit(u, job)
            if missing and not why and time.time() - st['asked'] > 60:
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
    # every half hour, the computers copy each other's missing models (paced)
    if len([u for u in pcs if _st(u)['online']]) > 1 and any(_st(u)['online'] and time.time() - _st(u)['synced_at'] > 1800 for u in pcs):
        await _sync_all(s)
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
    """{pcs:[{url,name}], off:[url], jobs:[{key, graph, home, client_id, prompt, seed, ckpt, n, of}]}"""
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
                                 'n': j.get('n'), 'of': j.get('of'), 'state': 'waiting', 'srv': '', 'id': '', 't_added': time.time()})
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

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
