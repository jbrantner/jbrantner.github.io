# Carries a change made to budget/index.html over to budget-next: each hunk of the diff is found, by its old text, in
# exactly one of budget-next's files (css/app.css with the Looks' colors as variables, or a js/ file) and replaced there.
# Usage: git diff A B -- budget/index.html | python3 dev/port.py   (prints each hunk's file; stops on any it can't place)
import json, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
lk = open(os.path.join(ROOT, 'js/looks.js')).read()
i = lk.index('const PAL_LOOKS = ') + len('const PAL_LOOKS = '); PL = json.loads(lk[i:lk.index(';\n', i)])
keys = [k for k in PL['twilight'] if k != 'hue']
vn = lambda x: '--pc-' + x[1:] if x.startswith('#') else '--pr-' + x.replace(',', '-')
def cssvars(s):   # the same conversion compose.py made
    s = re.sub(r'#[0-9a-fA-F]{6}\b', lambda m: f'var({vn(m.group(0).lower())})' if m.group(0).lower() in keys else m.group(0), s)
    s = re.sub(r'(rgba?)\((\d+),\s*(\d+),\s*(\d+)', lambda m: f'{m.group(1)}(var({vn(m.group(2)+","+m.group(3)+","+m.group(4))})' if f'{m.group(2)},{m.group(3)},{m.group(4)}' in keys else m.group(0), s)
    return s.replace('saturate(2.4) hue-rotate(-30deg)', 'saturate(2.4) hue-rotate(var(--p-hue))')
files = [os.path.join(ROOT, 'css/app.css')] + [os.path.join(d, f) for d, _, fs in os.walk(os.path.join(ROOT, 'js')) for f in fs if f.endswith('.js')]
text = {f: open(f).read() for f in files}
hunks, cur = [], None
for line in sys.stdin.read().split('\n'):
    if line.startswith('@@'): cur = ([], []); hunks.append(cur); continue
    if cur is None or line.startswith(('---', '+++', '\\')): continue
    if line.startswith('-'): cur[0].append(line[1:])
    elif line.startswith('+'): cur[1].append(line[1:])
    elif line.startswith(' ') or line == '': cur[0].append(line[1:]); cur[1].append(line[1:])
for old, new in hunks:
    while old and new and old[-1] == '' and new[-1] == '': old.pop(); new.pop()
    def find(old, new):
        o, n = '\n'.join(old), '\n'.join(new); hits = []
        for f in files:
            for oo, nn in ((o, n), (cssvars(o), cssvars(n))) if f.endswith('.css') else ((o, n),):
                c = text[f].count(oo)
                if c: hits.append((f, oo, nn, c))
        return hits
    o = '\n'.join(old); hits = find(old, new)
    # context the split left behind (the page's <script> line, a neighbour now in another file): trimmed a line at a time
    while not hits and old and new:
        if old[0] == new[0] and len(old) > 1: old, new = old[1:], new[1:]
        elif old[-1] == new[-1] and len(old) > 1: old, new = old[:-1], new[:-1]
        else: break
        hits = find(old, new)
    if len(hits) != 1 or hits[0][3] != 1: sys.exit(f'can\'t place this hunk ({len(hits)} files):\n{o[:400]}')
    f, oo, nn, _ = hits[0]; text[f] = text[f].replace(oo, nn); print('ported into', os.path.relpath(f, ROOT))
for f in files: open(f, 'w').write(text[f])
