"""Try the helper's 4K finish outside ComfyUI: python fin_try.py <helper.py> <src.mp4> <dst.mp4> <upscaler.pth> <ComfyUI-VFI dir>"""
import os, sys, time, json, threading
src = open(sys.argv[1], encoding='utf-8').read()
block = src.split('# >>> finish4k', 1)[1].split('# <<< finish4k', 1)[0]
g = {'os': os, 'time': time, '__name__': 'fin'}
exec(block, g)
job = {}
def temp():
    import subprocess
    try:
        return int(subprocess.run(['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=5).stdout.split()[0])
    except Exception:
        return None
peak = [0]
def watch():
    while not job.get('end'):
        t = temp() or 0; peak[0] = max(peak[0], t)
        print('progress %s/%s  gpu %s C  %s' % (job.get('done'), job.get('total'), t, job.get('note', '')), flush=True); time.sleep(5)
threading.Thread(target=watch, daemon=True).start()
t0 = time.time()
r = g['fin_run'](sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], 3840, True, job, temp)
job['end'] = True
import torch
r.update(seconds=round(time.time() - t0, 1), peak_c=peak[0], vram_peak_gb=round(torch.cuda.max_memory_allocated() / 1e9, 2) if torch.cuda.is_available() else None, note=job.get('note'), mb=round(os.path.getsize(sys.argv[3]) / 1e6, 1))
print(json.dumps(r))
