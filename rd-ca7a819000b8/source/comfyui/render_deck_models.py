"""Render Deck model helper for ComfyUI: lets the phone app add checkpoints and LoRAs to this computer.

Copy this file into ComfyUI/custom_nodes/ and restart ComfyUI. It adds three routes and no nodes:
  GET  /renderdeck/jobs                     -> downloads and uploads, with progress
  POST /renderdeck/download {url, kind}     -> fetch a Civitai or Hugging Face link in the background
  POST /renderdeck/upload?kind=..&name=..   -> receive a file sent from the phone (multipart field "file")
  GET  /renderdeck/model_info?kind=..&name=.. -> Civitai's trigger words and base model for a file, found by its fingerprint
  GET  /renderdeck/images, /renderdeck/thumb  -> the pictures in the output folder, newest first, and small previews
  POST /renderdeck/delete {items}             -> move pictures into "Deleted by Render Deck" in the output folder
kind is "checkpoints" or "loras". Only .safetensors files are accepted (they can't run code), only from
civitai.com and huggingface.co, and an existing file is never overwritten.
Civitai models that need sign-in: put your Civitai API key in the CIVITAI_API_TOKEN environment variable,
or in a file named civitai_token.txt next to this one.
Copyright (c) 2026 Jordan Brantner. All rights reserved.
"""
import asyncio, os, re, shutil, time, uuid
from urllib.parse import urlparse, parse_qs, unquote
import aiohttp
from aiohttp import web
import folder_paths
from server import PromptServer

KINDS = ('checkpoints', 'loras')
CIVITAI = ('civitai.com', 'civitai.red', 'civitai.green')  # Civitai's sites share one API and the same model ids
HOSTS = CIVITAI + ('huggingface.co',)
JOBS = {}  # id -> job dict, newest last
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


async def _download(j, file_url, path):
    tmp = path + '.part'
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
    return web.json_response({'version': 1, 'token': bool(_token()), 'jobs': list(JOBS.values())[::-1]})


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


def _out_path(subfolder, filename):
    root = os.path.realpath(folder_paths.get_output_directory())
    path = os.path.realpath(os.path.join(root, subfolder or '', os.path.basename(filename or '')))
    if not path.startswith(root + os.sep) or not path.lower().endswith(PICS):
        raise ValueError('Not a picture in the output folder')
    return root, path


@routes.get('/renderdeck/images')
async def images(request):
    """Every picture in ComfyUI's output folder, newest first, a page at a time."""
    root = folder_paths.get_output_directory()
    found = []
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x != TRASH and not x.startswith('.')]
        sub = os.path.relpath(d, root).replace('\\', '/')
        for f in files:
            if f.lower().endswith(PICS):
                st = os.stat(os.path.join(d, f))
                found.append({'subfolder': '' if sub == '.' else sub, 'filename': f, 't': st.st_mtime, 'size': st.st_size})
    found.sort(key=lambda x: -x['t'])
    off, lim = int(request.query.get('offset', 0)), min(200, int(request.query.get('limit', 60)))
    return web.json_response({'total': len(found), 'images': found[off:off + lim], 'trash': TRASH})


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
    """Move pictures into the "Deleted by Render Deck" folder (same subfolders), so a slip can be undone on the computer."""
    items, moved = (await request.json()).get('items', []), 0
    for it in items:
        try:
            root, path = _out_path(it.get('subfolder'), it.get('filename'))
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


NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
