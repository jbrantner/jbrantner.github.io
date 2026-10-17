"""Render Deck model helper for ComfyUI: lets the phone app add checkpoints and LoRAs to this computer.

Copy this file into ComfyUI/custom_nodes/ and restart ComfyUI. It adds three routes and no nodes:
  GET  /renderdeck/jobs                     -> downloads and uploads, with progress
  POST /renderdeck/download {url, kind}     -> fetch a Civitai or Hugging Face link in the background
  POST /renderdeck/upload?kind=..&name=..   -> receive a file sent from the phone (multipart field "file")
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
HOSTS = ('civitai.com', 'huggingface.co')
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
                base=v.get('baseModel', ''), words=v.get('trainedWords') or [], title=(meta.get('name') or (v.get('model') or {}).get('name') or ''))


async def _download(j, file_url, path):
    tmp = path + '.part'
    try:
        headers = {'Authorization': 'Bearer ' + _token()} if _token() and 'civitai.com' in file_url else {}
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
            raise ValueError('Only civitai.com and huggingface.co links work')
        info = dict(file_url=url, name=None, size=0, kind=None, base='', words=[], title='')
        if host.endswith('civitai.com'):
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


NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
