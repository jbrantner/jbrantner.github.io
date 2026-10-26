# 🧍 the Character Creator's colour match node (helper) against the numpy script that made "version B" on Main
import ast, os, sys, numpy as np, torch
src = open(os.path.join(os.path.dirname(__file__), '..', 'comfyui', 'render_deck_models.py'), encoding='utf-8').read()
node = next(n for n in ast.parse(src).body if isinstance(n, ast.ClassDef) and n.name == 'RenderDeckCutoutColorMatch')
ns = {}; exec(compile(ast.Module([node], []), 'node', 'exec'), ns); C = ns['RenderDeckCutoutColorMatch']
from PIL import Image, ImageFilter
rng = np.random.default_rng(1)
def girl(shift):  # a figure on white: a dress, hair, skin, with a colour cast
    a = np.ones((200, 120, 3)); a[40:190, 30:90] = np.array([0.35, 0.22, 0.15]) + shift; a[10:40, 40:80] = [0.95, 0.6, 0.7]; a[40:60, 45:75] = [0.95, 0.8, 0.7]
    a[40:190, 30:90] += rng.normal(0, 0.03, (150, 60, 3)); return np.clip(a, 0, 1)
ref, tgt = girl(0), girl(np.array([-0.12, -0.1, -0.08]))
# the script's way
def srgb2lin(c): return np.where(c<=0.04045, c/12.92, ((c+0.055)/1.055)**2.4)
def lin2srgb(c): return np.where(c<=0.0031308, c*12.92, 1.055*np.clip(c,0,None)**(1/2.4)-0.055)
M = np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]]); Mi = np.linalg.inv(M); W = np.array([0.95047,1.0,1.08883])
f = lambda t: np.where(t>0.008856, np.cbrt(t), 7.787*t+16/116); fi = lambda t: np.where(t>0.206893, t**3, (t-16/116)/7.787)
def rgb2lab(a): xyz = srgb2lin(a)@M.T/W; fx,fy,fz = f(xyz[...,0]),f(xyz[...,1]),f(xyz[...,2]); return np.stack([116*fy-16, 500*(fx-fy), 200*(fy-fz)],-1)
def lab2rgb(l): fy=(l[...,0]+16)/116; fx=fy+l[...,1]/500; fz=fy-l[...,2]/200; return np.clip(lin2srgb(np.stack([fi(fx),fi(fy),fi(fz)],-1)*W@Mi.T),0,1)
rh = ref.min(-1) < 0.94; rl = rgb2lab(ref)[rh]; rm, rs = rl.mean(0), rl.std(0)
hard = tgt.min(-1) < 0.94; soft = np.asarray(Image.fromarray((hard*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1)))/255.0
lab = rgb2lab(tgt); m, s = lab[hard].mean(0), lab[hard].std(0); want = tgt + (lab2rgb((lab-m)/s*rs+rm)-tgt)*0.6*soft[...,None]
got = C().match(torch.tensor(tgt[None], dtype=torch.float32), torch.tensor(ref[None], dtype=torch.float32), 0.6)[0][0].numpy()
err = np.abs(got - want); white = ~hard
print('max diff', err.max().round(4), 'mean', err.mean().round(5), 'white kept', np.abs(got[white & (soft < 0.01)] - 1).max().round(4))
dress = (slice(60, 180), slice(35, 85)); print('dress before', tgt[dress].mean((0, 1)).round(3), 'after', got[dress].mean((0, 1)).round(3), 'ref', ref[dress].mean((0, 1)).round(3))
ok = err.max() < 0.04 and np.abs(got[white & (soft < 0.01)] - 1).max() < 1e-3
print('ok' if ok else 'FAIL'); sys.exit(0 if ok else 1)
