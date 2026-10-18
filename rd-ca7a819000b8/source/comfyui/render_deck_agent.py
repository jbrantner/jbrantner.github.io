"""Render Deck agent: keeps ComfyUI running on this computer, and lets the phone app start, restart or close it.

It runs on its own, outside ComfyUI (Windows starts it at sign-in; see install_agent.ps1), so it still works when
ComfyUI has crashed or been closed. Only the Python standard library is used.
  - Every 30 seconds it asks ComfyUI (http://127.0.0.1:8188) if it's alive. Three missed answers in a row and it
    starts ComfyUI again, unless you closed it from the app.
  - It learns how to start ComfyUI by looking at the ComfyUI that's running (the command Comfy Desktop uses), and
    saves that in render_deck_agent.json next to this file. Started by the agent, ComfyUI runs without the Comfy
    Desktop window; it's the same ComfyUI, folders and settings.
  - The app talks to it through Tailscale: tailscale serve --bg --set-path /agent http://127.0.0.1:8190
      GET  /agent/status   -> {comfy: up|down|starting, wanted, learned}
      POST /agent/start | /agent/restart | /agent/close
Copyright (c) 2026 Jordan Brantner. All rights reserved.
"""
import json, os, subprocess, sys, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
CONF = os.path.join(HERE, 'render_deck_agent.json')
LOG = os.path.join(HERE, 'render_deck_agent.log')
COMFY = 'http://127.0.0.1:8188'
PORT = 8190
WIN = os.name == 'nt'
state = {'cmd': None, 'cwd': None, 'wanted': True, 'misses': 0, 'starting': 0, 'proc': None}
lock = threading.Lock()


def log(*a):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')
    except OSError:
        pass


def load():
    try:
        with open(CONF, encoding='utf-8') as f:
            c = json.load(f)
        state.update({k: c[k] for k in ('cmd', 'cwd', 'wanted') if k in c})
    except (OSError, ValueError):
        pass


def save():
    try:
        with open(CONF, 'w', encoding='utf-8') as f:
            json.dump({k: state[k] for k in ('cmd', 'cwd', 'wanted')}, f, indent=1)
    except OSError:
        pass


def alive():
    try:
        with urllib.request.urlopen(COMFY + '/queue', timeout=5) as r:
            return r.status == 200
    except Exception:
        return False


def comfy_procs():
    """The python processes running ComfyUI's main.py: [(pid, command line, working folder guess)]."""
    if not WIN:
        return []
    ps = ("Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'main\\.py' } | "
          "ForEach-Object { [pscustomobject]@{pid=$_.ProcessId; ppid=$_.ParentProcessId; cmd=$_.CommandLine; exe=$_.ExecutablePath} } | ConvertTo-Json -Compress")
    try:
        out = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True, timeout=30,
                             creationflags=0x08000000).stdout.strip()
        rows = json.loads(out) if out else []
        return rows if isinstance(rows, list) else [rows]
    except Exception as e:
        log('could not list processes:', e)
        return []


def learn():
    """Remember how the running ComfyUI was started (the outermost python running main.py)."""
    rows = comfy_procs()
    pids = {r['pid'] for r in rows}
    top = [r for r in rows if r['ppid'] not in pids]
    if not top:
        return False
    cmd = top[0]['cmd']
    exe = top[0]['exe'] or ''
    # Comfy Desktop runs "<install>\ComfyUI\.venv\Scripts\python.exe -s ComfyUI\main.py ..." from <install>
    cwd = exe.split('\\ComfyUI\\.venv\\')[0] if '\\ComfyUI\\.venv\\' in exe else os.path.dirname(exe)
    if cmd != state['cmd'] or cwd != state['cwd']:
        state['cmd'], state['cwd'] = cmd, cwd
        save()
        log('learned how to start ComfyUI:', cmd, 'in', cwd)
    return True


def start():
    with lock:
        if alive() or (state['starting'] and time.time() - state['starting'] < 120):
            return 'ComfyUI is already running' if alive() else 'ComfyUI is starting'
        if not state['cmd']:
            return "I haven't seen ComfyUI running yet, so I don't know how to start it. Open Comfy Desktop and press Launch once."
        out = open(os.path.join(HERE, 'comfyui_console.log'), 'a', encoding='utf-8', errors='replace')
        flags = (0x00000008 | 0x00000200 | 0x08000000) if WIN else 0  # detached, own process group, no window
        state['proc'] = subprocess.Popen(state['cmd'], cwd=state['cwd'] or None, stdout=out, stderr=subprocess.STDOUT,
                                         stdin=subprocess.DEVNULL, creationflags=flags, shell=not WIN)
        state['starting'], state['misses'] = time.time(), 0
        log('started ComfyUI, pid', state['proc'].pid)
        return 'Starting ComfyUI'


def close():
    with lock:
        learn()
        rows = comfy_procs()
        pids = {r['pid'] for r in rows}
        for r in rows:
            if r['ppid'] not in pids:  # the whole tree from the top one
                subprocess.run(['taskkill', '/PID', str(r['pid']), '/T', '/F'], capture_output=True, creationflags=0x08000000)
                log('closed ComfyUI, pid', r['pid'])
        state['starting'] = 0
        return 'ComfyUI closed' if rows else 'ComfyUI was not running'


def watch():
    while True:
        try:
            if alive():
                state['misses'], state['starting'] = 0, 0
                if not state['cmd']:
                    learn()
            else:
                state['misses'] += 1
                starting = state['starting'] and time.time() - state['starting'] < 180
                if state['wanted'] and state['misses'] >= 3 and not starting:
                    log('ComfyUI stopped answering:', start())
        except Exception as e:
            log('watch:', e)
        time.sleep(30)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _path(self):
        p = self.path.split('?')[0].rstrip('/')
        return p[len('/agent'):] if p.startswith('/agent') else p  # with or without the Tailscale mount path

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        if self._path() == '/status':
            up = alive()
            starting = not up and state['starting'] and time.time() - state['starting'] < 180
            return self._send(200, {'agent': 1, 'comfy': 'up' if up else 'starting' if starting else 'down',
                                    'wanted': state['wanted'], 'learned': bool(state['cmd'])})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        p = self._path()
        if p == '/start':
            state['wanted'] = True; save()
            return self._send(200, {'message': start()})
        if p == '/close':
            state['wanted'] = False; save()
            return self._send(200, {'message': close()})
        if p == '/restart':
            state['wanted'] = True; save()
            close()
            for _ in range(20):  # wait for the port to free up
                if not alive():
                    break
                time.sleep(0.5)
            return self._send(200, {'message': start()})
        self._send(404, {'error': 'not found'})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    load()
    log('agent started')
    threading.Thread(target=watch, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
