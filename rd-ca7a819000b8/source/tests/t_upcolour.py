# ⬆ Redraw upscale's colour fix (helper): a washed-out, tile-blocky 2x redraw gets its colour and shading back from the
# picture before the upscale, and keeps the redraw's new fine detail
import ast, os, sys, numpy as np, torch
src = open(os.path.join(os.path.dirname(__file__), '..', 'comfyui', 'render_deck_models.py'), encoding='utf-8').read()
node = next(n for n in ast.parse(src).body if isinstance(n, ast.ClassDef) and n.name == 'RenderDeckUpscaleColorFix')
ns = {}; exec(compile(ast.Module([node], []), 'node', 'exec'), ns); C = ns['RenderDeckUpscaleColorFix']
rng = np.random.default_rng(1)
H, W = 160, 120
yy, xx = np.mgrid[0:H, 0:W] / [H, W]
small = np.stack([0.15 + 0.7 * xx, 0.25 + 0.5 * yy, 0.8 - 0.6 * xx * yy], -1)  # rich colour gradients
small[60:100, 40:80] = [0.85, 0.1, 0.3]  # a saturated patch
big = np.kron(small, np.ones((2, 2, 1)))
detail = rng.normal(0, 0.04, big.shape[:2])[..., None] * np.ones(3)  # the redraw's new fine detail
washed = big * 0.7 + 0.2  # lower contrast, lifted blacks
washed[:160, 120:] += 0.05  # one tile a little brighter: a block at the seam
red = np.clip(washed + detail, 0, 1)
T = lambda a: torch.tensor(a[None], dtype=torch.float32)
got = C().fix(T(red), T(small), 1.0)[0][0].numpy()
inner = (slice(16, -16), slice(16, -16))
blur = lambda a: torch.nn.functional.avg_pool2d(torch.tensor(a).permute(2, 0, 1)[None], 9, 1, 4).numpy()[0].transpose(1, 2, 0)
col_before, col_after = np.abs(blur(red) - blur(big))[inner].mean(), np.abs(blur(got) - blur(big))[inner].mean()
fine = lambda a: a - blur(a)
det_kept = np.corrcoef(fine(got)[inner].ravel(), fine(red)[inner].ravel())[0, 1]
seam = lambda a: abs(a[100:140, 118:120].mean() - a[100:140, 120:122].mean())
print('colour error before %.4f after %.4f, detail kept r=%.3f, seam step before %.4f after %.4f' % (col_before, col_after, det_kept, seam(red), seam(got)))
same = C().fix(T(red), T(small), 0.0)[0][0].numpy()
ok = col_after < col_before * 0.25 and det_kept > 0.8 and seam(got) < seam(red) * 0.5 and np.abs(same - red).max() < 1e-6 and got.shape == red.shape
print('ok' if ok else 'FAIL'); sys.exit(0 if ok else 1)
