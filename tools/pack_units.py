"""Упаковка кадров из Blender в атласы WebP + assets/units.js.
python pack_units.py <units_raw> <assets_dir>
"""
import sys, os, re, json, glob
from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
FILT = sys.argv[3] if len(sys.argv) > 3 else ''
S = 3.0
os.makedirs(os.path.join(OUT, 'units'), exist_ok=True)

files = sorted(glob.glob(os.path.join(RAW, '*.png')))
models = {}
for f in files:
    m = re.match(r'(.+)_([a-z0-9]+)_(\d+)\.png$', os.path.basename(f))
    if m and FILT in m.group(1):
        models.setdefault(m.group(1), {}).setdefault(m.group(2), {})[int(m.group(3))] = f

meta = {}
total = 0
js = os.path.join(OUT, 'units.js')
if FILT and os.path.exists(js):   # дополнить существующий список
    txt = open(js, encoding='utf-8').read()
    meta = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])['m']
extra = {}
mp = os.path.join(RAW, 'meta.json')
if os.path.exists(mp):
    extra = json.load(open(mp))
for name, parts in sorted(models.items()):
    frames = []   # (part, idx, img, ax, ay)
    for part in sorted(parts):
        for i, f in sorted(parts[part].items()):
            im = Image.open(f).convert('RGBA')
            FW, FH = im.size
            r_, g_, b_, al = im.split()
            al = al.point(lambda v: 0 if v < 9 else v)   # шум «ловца теней» по всему кадру
            im = Image.merge('RGBA', (r_, g_, b_, al))
            a = al.point(lambda v: 255 if v > 0 else 0)
            bb = a.getbbox() or (0, 0, 1, 1)
            x0, y0, x1, y1 = bb[0] - 1, bb[1] - 1, bb[2] + 1, bb[3] + 1
            frames.append((part, i, im.crop((x0, y0, x1, y1)), FW / 2 - x0, FH / 2 - y0))
    # полочная упаковка
    AW = 1024
    order = sorted(range(len(frames)), key=lambda k: -frames[k][2].height)
    x = y = rowh = 0
    pos = {}
    for k in order:
        im = frames[k][2]
        if x + im.width > AW:
            x = 0; y += rowh + 1; rowh = 0
        pos[k] = (x, y); x += im.width + 1; rowh = max(rowh, im.height)
    atlas = Image.new('RGBA', (AW, y + rowh))
    entry = {'f': 'assets/units/%s.webp' % name}
    for k, (part, i, im, ax, ay) in enumerate(frames):
        px, py = pos[k]
        atlas.paste(im, (px, py))
        rec = [px, py, im.width, im.height, round(ax, 1), round(ay, 1)]
        if '_inf_' in name: rec.append(5.0)   # пехота отрендерена крупнее (5 px на единицу)
        entry.setdefault(part, [None] * (max(parts[part]) + 1))[i] = rec
    path = os.path.join(OUT, 'units', name + '.webp')
    atlas.save(path, 'WEBP', quality=90, method=4)
    total += os.path.getsize(path)
    entry.update(extra.get(name, {}))   # смещение башни, вынос и высота дульного среза
    meta[name] = entry
    print(name, atlas.size, os.path.getsize(path) // 1024, 'KB')

dirs = 32
with open(os.path.join(OUT, 'units.js'), 'w', encoding='utf-8') as fh:
    fh.write('// сгенерировано tools/pack_units.py из рендеров tools/blender_units.py\n')
    fh.write('const UNIT_SPRITES = ' + json.dumps({'S': S, 'dirs': dirs, 'm': meta}, separators=(',', ':')) + ';\n')
print('total', total // 1024, 'KB')
