"""Обработка сгенерированных картинок: бесшовные текстуры (jpg) и вырезка спрайтов (png-атлас).
python process_assets.py <raw_dir> <out_dir>
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# размер текстуры в игре (пиксели мира; клетка = 24 px)
TEX = {'grass': 256, 'field': 384, 'forest': 256, 'water': 512, 'road': 256, 'sand': 256,
       'rubble': 192, 'planks': 128, 'roof': 128, 'wall': 128, 'thatch': 128, 'logs': 128}


def seamless(a):
    """Смешивание с копией, сдвинутой на половину: края становятся непрерывными."""
    h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]
    x = np.abs(np.linspace(-1, 1, w))[None, :]
    d = np.maximum(x, y)
    m = np.clip((d - 0.55) / 0.4, 0, 1)
    m = m * m * (3 - 2 * m)
    return a * (1 - m[..., None]) + b * m[..., None]


def even_light(a, r=64):
    """Убрать крупные перепады яркости (неровное освещение), сохранив детали."""
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    blur = np.asarray(img.filter(ImageFilter.GaussianBlur(r))).astype(np.float32)
    mean = a.reshape(-1, 3).mean(0)
    return a - blur + mean


for name, size in TEX.items():
    p = os.path.join(RAW, name + '.png')
    if not os.path.exists(p):
        print('skip', name); continue
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    a = even_light(a)
    a = seamless(a)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.jpg'), quality=90)
    print('tex', name, size)

# --- спрайты: разрезать лист по компонентам связности альфы ---
from collections import deque

def components(alpha, thr=40):
    h, w = alpha.shape
    mask = alpha > thr
    lab = np.zeros((h, w), np.int32)
    boxes = []
    n = 0
    small = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((w // 4, h // 4), Image.BOX)) > 20
    sh, sw = small.shape
    seen = np.zeros_like(small)
    for y0 in range(sh):
        for x0 in range(sw):
            if not small[y0, x0] or seen[y0, x0]:
                continue
            q = deque([(y0, x0)]); seen[y0, x0] = 1
            xs = [x0, x0]; ys = [y0, y0]; cnt = 0
            while q:
                y, x = q.popleft(); cnt += 1
                xs[0] = min(xs[0], x); xs[1] = max(xs[1], x); ys[0] = min(ys[0], y); ys[1] = max(ys[1], y)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1; q.append((ny, nx))
            if cnt > 120:
                boxes.append((xs[0] * 4, ys[0] * 4, xs[1] * 4 + 4, ys[1] * 4 + 4, cnt))
    return boxes


sprites = []
SPR = {'trees_leafy': 'leafy', 'trees_pine': 'pine', 'bushes': 'bush'}
for sheet, kind in SPR.items():
    p = os.path.join(RAW, sheet + '.png')
    if not os.path.exists(p):
        print('skip', sheet); continue
    im = Image.open(p).convert('RGBA')
    a = np.asarray(im).copy()
    # JoinImageWithAlpha в этой версии ComfyUI инвертирует маску — фон оказывается непрозрачным
    corners = [a[2, 2, 3], a[2, -3, 3], a[-3, 2, 3], a[-3, -3, 3]]
    if np.mean(corners) > 128:
        a[..., 3] = 255 - a[..., 3]
    # подчистить полупрозрачный ореол от белого фона
    al = a[..., 3].astype(np.float32) / 255
    al = np.clip((al - 0.15) / 0.75, 0, 1)
    a[..., 3] = (al * 255).astype(np.uint8)
    im = Image.fromarray(a)
    for (x0, y0, x1, y1, cnt) in components(a[..., 3]):
        h = y1 - y0
        if h < 120 or (x1 - x0) < h * 0.3:
            continue
        crop = im.crop((x0, y0, x1, y1))
        # не трогать спрайты, обрезанные краем листа
        if x0 <= 2 or y0 <= 2 or x1 >= im.width - 2 or y1 >= im.height - 2:
            continue
        sprites.append((kind, crop))
    print('sheet', sheet, sum(1 for s in sprites if s[0] == kind))

# атлас: все спрайты масштабируются к высоте H
H = {'leafy': 128, 'pine': 140, 'bush': 56}
placed, x, y, rowh, AW = [], 0, 0, 0, 1024
for kind, crop in sprites:
    s = H[kind] / crop.height
    c = crop.resize((max(1, round(crop.width * s)), H[kind]), Image.LANCZOS)
    if x + c.width > AW:
        x = 0; y += rowh + 2; rowh = 0
    placed.append((kind, c, x, y))
    x += c.width + 2; rowh = max(rowh, c.height)
if placed:
    atlas = Image.new('RGBA', (AW, y + rowh))
    meta = []
    for kind, c, px, py in placed:
        atlas.paste(c, (px, py))
        a = np.asarray(c)[..., 3]
        cols = np.where(a[-max(4, a.shape[0] // 8):].max(0) > 60)[0]
        foot = float(cols.mean()) if len(cols) else c.width / 2
        meta.append({'k': kind, 'x': px, 'y': py, 'w': c.width, 'h': c.height, 'fx': round(foot, 1)})
    atlas.save(os.path.join(OUT, 'trees.png'), optimize=True)
    open(os.path.join(OUT, 'trees.js'), 'w').write('// сгенерировано tools/process_assets.py\nconst TREE_ATLAS = ' + json.dumps(meta) + ';\n')
    print('atlas', atlas.size, len(meta))
