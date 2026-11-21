# Деревенские и фронтовые объекты для оживления карты. Выполняется внутри blender_units.py (exec).
# Размеры в метрах, K игровых единиц на метр. Клетка карты = 24 ед. ≈ 5,43 м.

K = 4.42
TILE_M = 24 / K


def wmat():
    return {
        'wood': mat_paint('pwood', '#6e5a40', 0.85, 0.25, 0, 0.45),
        'wood_old': mat_paint('pwood_old', '#7d7466', 0.9, 0.25, 0, 0.5),   # посеревшее дерево
        'wood_dark': mat_paint('pwood_dk', '#4a3a2a', 0.85, 0.2, 0, 0.4),
        'hay': mat_paint('phay', '#a8915a', 0.95, 0.15, 0, 0.35),
        'thatch': mat_paint('pthatch', '#7c6c4c', 0.95, 0.15, 0, 0.4),
        'stone': mat_paint('pstone', '#77736a', 0.9, 0.1, 0, 0.5),
        'steel': mat_flat('psteel', (0.04, 0.038, 0.035, 1), 0.55, 0.7),
        'rust': mat_paint('prust', '#5a3f2c', 0.8, 0.1, 0.3, 0.4),
        'wire': mat_flat('pwire', (0.06, 0.055, 0.05, 1), 0.5, 0.6),
        'white': mat_flat('pwhite', (0.6, 0.6, 0.55, 1), 0.3),
        'barrel': mat_paint('pbarrel', '#4f5236', 0.6, 0.2, 0.2, 0.4),
    }


def fence(root, axis, broken=False):
    B, M = Builder(root, K), wmat()
    L = TILE_M
    def P(a, b, z): return (a, b, z) if axis == 'x' else (b, a, z)
    def BOX(name, a0, a1, b0, b1, z0, z1, m, bev=0.01):
        if axis == 'x': B.box(name, a0, a1, b0, b1, z0, z1, m, bev)
        else: B.box(name, b0, b1, a0, a1, z0, z1, m, bev)
    rng = __import__('random').Random(7 + (axis == 'y') + broken * 3)
    if not broken:
        for i, a in enumerate((-L / 2 + 0.08, -L / 6, L / 6, L / 2 - 0.08)):
            BOX('post%d' % i, a - 0.06, a + 0.06, -0.06, 0.06, 0, 1.35 + rng.random() * 0.1, M['wood_dark'])
        for j, z in enumerate((0.35, 0.95)):
            BOX('rail%d' % j, -L / 2, L / 2, 0.06, 0.1, z, z + 0.08, M['wood_old'])
        n = int(L / 0.16)
        for i in range(n):
            a = -L / 2 + 0.08 + i * 0.16
            h = 1.05 + rng.random() * 0.18
            BOX('pk%d' % i, a - 0.045, a + 0.045, 0.1, 0.13, 0.05, h, M['wood_old'] if rng.random() < 0.8 else M['wood'], 0.003)
    else:   # смятый забор: доски на земле, обломки столбов
        for i, a in enumerate((-L / 2 + 0.08, L / 2 - 0.08)):
            BOX('post%d' % i, a - 0.06, a + 0.06, -0.06, 0.06, 0, 0.35, M['wood_dark'])
        for i in range(14):
            a = -L / 2 + 0.3 + rng.random() * (L - 0.6)
            b = (rng.random() - 0.5) * 1.0
            ang = rng.random() * 3.14
            l = 0.5 + rng.random() * 0.7
            da, db = math.cos(ang) * l / 2, math.sin(ang) * l / 2
            p0, p1 = P(a - da, b - db, 0.03), P(a + da, b + db, 0.03)
            B.beam('pl%d' % i, p0, p1, 0.09, 0.03, M['wood_old'], 0.003)


def haystack(root):
    B, M = Builder(root, K), wmat()
    pts = []
    for z, r in ((0.0, 1.45), (0.6, 1.55), (1.4, 1.35), (2.2, 1.0), (2.9, 0.55), (3.25, 0.15)):
        for i in range(18):
            a = i / 18 * math.pi * 2
            pts.append((math.cos(a) * r, math.sin(a) * r * 0.95, z))
    B.hull('hay', pts, M['hay'], 0.05, smooth_angle=60)
    B.tube('pole', (0, 0, 2.8), (0.05, 0.02, 4.0), 0.05, 0.04, M['wood_dark'], 8)
    for i in range(6):   # жерди-прижимы
        a = i / 6 * math.pi * 2
        B.tube('pr%d' % i, (math.cos(a) * 0.3, math.sin(a) * 0.3, 3.05), (math.cos(a) * 1.25, math.sin(a) * 1.2, 1.6), 0.03, 0.03, M['wood_dark'], 6)


def pole(root, axis):
    B, M = Builder(root, K), wmat()
    B.tube('pole', (0, 0, 0), (0, 0, 7.2), 0.13, 0.1, M['wood_dark'], 10)
    for j, z in enumerate((6.9, 6.3)):
        if axis == 'x': B.box('arm%d' % j, -0.06, 0.06, -0.8, 0.8, z, z + 0.1, M['wood_dark'], 0.01)
        else: B.box('arm%d' % j, -0.8, 0.8, -0.06, 0.06, z, z + 0.1, M['wood_dark'], 0.01)
        for k in (-0.65, -0.25, 0.25, 0.65):
            x, y = (0, k) if axis == 'x' else (k, 0)
            B.tube('ins%d%d' % (j, int(k * 100)), (x, y, z + 0.1), (x, y, z + 0.24), 0.04, 0.03, M['white'], 8)


def well(root):
    """Колодец-журавль: сруб, столб-развилка, длинный шест с противовесом."""
    B, M = Builder(root, K), wmat()
    for i in range(6):   # сруб
        z = i * 0.16
        o = 0.0 if i % 2 else 0.04
        B.box('lx%d' % i, -0.55 - o, 0.55 + o, -0.62, -0.5, z, z + 0.15, M['wood_old'], 0.01)
        B.box('lx2%d' % i, -0.55 - o, 0.55 + o, 0.5, 0.62, z, z + 0.15, M['wood_old'], 0.01)
        B.box('ly%d' % i, -0.62, -0.5, -0.55 - o, 0.55 + o, z, z + 0.15, M['wood_old'], 0.01)
        B.box('ly2%d' % i, 0.5, 0.62, -0.55 - o, 0.55 + o, z, z + 0.15, M['wood_old'], 0.01)
    B.box('water', -0.5, 0.5, -0.5, 0.5, 0.6, 0.62, mat_flat('pwater', (0.02, 0.03, 0.03, 1), 0.1), 0)
    B.tube('fork', (-2.2, 0.3, 0), (-2.2, 0.3, 3.2), 0.12, 0.1, M['wood_dark'], 10)
    B.tube('beam', (-4.3, 0.3, 1.2), (0.0, 0.2, 5.3), 0.08, 0.05, M['wood_dark'], 8)
    B.box('cw', -4.6, -4.0, 0.15, 0.45, 0.9, 1.3, M['stone'], 0.05)
    B.tube('rope', (0.0, 0.2, 5.3), (0.0, 0.0, 1.1), 0.02, 0.02, M['wood_dark'], 6)
    B.tube('bucket', (0.0, 0.0, 0.95), (0.0, 0.0, 1.25), 0.15, 0.17, M['wood'], 10)


def shed(root):
    B, M = Builder(root, K), wmat()
    w, d, h = 3.6, 2.6, 2.1
    for i in range(12):   # стены из досок
        x = -w / 2 + i * w / 12
        B.box('fw%d' % i, x, x + w / 12 - 0.02, d / 2 - 0.05, d / 2, 0, h, M['wood_old'], 0.005)
        B.box('bw%d' % i, x, x + w / 12 - 0.02, -d / 2, -d / 2 + 0.05, 0, h, M['wood_old'], 0.005)
    for s in (-1, 1):
        B.box('sw%d' % s, s * w / 2 - 0.05, s * w / 2, -d / 2, d / 2, 0, h, M['wood_old'], 0.005)
    B.box('door', -0.4, 0.4, d / 2, d / 2 + 0.02, 0, 1.8, M['wood_dark'], 0.005)
    for s in (-1, 1):
        B.hull('roof%d' % s, [(x, y, z) for x in (-w / 2 - 0.25, w / 2 + 0.25) for (y, z) in ((0, h + 1.0), (s * (d / 2 + 0.3), h - 0.15), (s * (d / 2 + 0.3), h - 0.08), (0, h + 1.07))], M['thatch'], 0.02)
    for s in (-1, 1):
        B.hull('gab%d' % s, [(s * w / 2, y, z) for (y, z) in ((-d / 2, h), (d / 2, h), (0, h + 1.0))] + [(s * (w / 2 - 0.04), y, z) for (y, z) in ((-d / 2, h), (d / 2, h), (0, h + 1.0))], M['wood_old'], 0.005)


def cart(root):
    B, M = Builder(root, K), wmat()
    B.box('bed', -1.2, 1.2, -0.65, 0.65, 0.75, 0.85, M['wood'], 0.01)
    for s in (-1, 1):
        B.box('side%d' % s, -1.2, 1.2, s * 0.62, s * 0.68, 0.85, 1.25, M['wood_old'], 0.005)
        for x in (-0.7, 0.75):
            B.tube('wh%d%d' % (s, int(x * 10)), (x, s * 0.72, 0.5), (x, s * 0.82, 0.5), 0.5, 0.5, M['wood_dark'], 16)
            B.tube('hub%d%d' % (s, int(x * 10)), (x, s * 0.82, 0.5), (x, s * 0.9, 0.5), 0.1, 0.08, M['wood'], 10)
    B.beam('shaft1', (1.2, -0.35, 0.8), (3.0, -0.4, 0.15), 0.07, 0.07, M['wood_dark'], 0.005)
    B.beam('shaft2', (1.2, 0.35, 0.8), (3.0, 0.4, 0.15), 0.07, 0.07, M['wood_dark'], 0.005)
    pts = [(math.cos(i / 10 * 6.28) * 0.9, math.sin(i / 10 * 6.28) * 0.5, z) for i in range(10) for z in (0.85, 1.35)] + [(0, 0, 1.6)]
    B.hull('load', pts, M['hay'], 0.05, smooth_angle=60)


def woodpile(root):
    B, M = Builder(root, K), wmat()
    rng = __import__('random').Random(3)
    for row in range(4):
        for i in range(7 - row):
            y = -0.9 + (i + row * 0.5) * 0.28
            z = 0.13 + row * 0.24
            B.tube('lg%d%d' % (row, i), (-1.0 + rng.random() * 0.1, y, z), (1.0 + rng.random() * 0.1, y, z), 0.13, 0.13, M['wood'] if rng.random() < 0.6 else M['wood_old'], 10)


def barrels(root):
    B, M = Builder(root, K), wmat()
    for i, (x, y) in enumerate(((0, 0), (0.62, 0.1), (0.3, 0.6), (-0.4, 0.55))):
        B.tube('br%d' % i, (x, y, 0), (x, y, 0.88), 0.29, 0.29, M['barrel'], 16)
        for z in (0.2, 0.68):
            B.tube('rg%d%d' % (i, int(z * 10)), (x, y, z), (x, y, z + 0.04), 0.3, 0.3, M['rust'], 16)
    B.tube('brl', (-0.8, -0.6, 0.29), (0.08, -0.75, 0.29), 0.29, 0.29, M['barrel'], 16)


def crates(root):
    B, M = Builder(root, K), wmat()
    stack = [(0, 0, 0), (0.75, 0.05, 0), (0.35, 0.0, 0.42), (-0.1, 0.65, 0)]
    for i, (x, y, z) in enumerate(stack):
        B.box('cr%d' % i, x - 0.35, x + 0.35, y - 0.25, y + 0.25, z, z + 0.4, mat_paint('pcrate', '#565a3a', 0.8, 0.2, 0, 0.4), 0.015)
        B.box('crl%d' % i, x - 0.36, x + 0.36, y - 0.26, y + 0.26, z + 0.17, z + 0.23, M['wood_dark'], 0.005)


def stump(root):
    B, M = Builder(root, K), wmat()
    B.tube('st', (0, 0, 0), (0, 0, 0.45), 0.32, 0.26, M['wood_dark'], 12)
    B.tube('top', (0, 0, 0.45), (0, 0, 0.47), 0.25, 0.25, M['wood'], 12)
    for i in range(3):
        a = i * 2.1
        B.tube('rt%d' % i, (0, 0, 0.12), (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.0), 0.1, 0.05, M['wood_dark'], 8)


def rock(root):
    B, M = Builder(root, K), wmat()
    rng = __import__('random').Random(11)
    pts = []
    for i in range(30):
        a, b = rng.random() * 6.28, rng.random() * 1.4
        r = 0.6 + rng.random() * 0.4
        pts.append((math.cos(a) * math.cos(b) * r * 1.3, math.sin(a) * math.cos(b) * r, max(0.0, math.sin(b) * r * 0.75)))
    B.hull('rock', pts, M['stone'], 0.05, smooth_angle=50)


def hedgehog(root):
    """Противотанковый «ёж» из трёх двутавров."""
    B, M = Builder(root, K), wmat()
    for i, (a, b) in enumerate((((-0.8, -0.8, 0.0), (0.8, 0.8, 1.5)), ((0.8, -0.8, 0.0), (-0.8, 0.8, 1.5)), ((0.0, -1.0, 1.4), (0.0, 1.0, 0.0)))):
        B.tube('i%d' % i, a, b, 0.07, 0.07, M['rust'], 4)


def wire(root, axis):
    B, M = Builder(root, K), wmat()
    L = TILE_M
    def P(a, b, z): return (a, b, z) if axis == 'x' else (b, a, z)
    stakes = [-L / 2 + 0.2 + i * (L - 0.4) / 3 for i in range(4)]
    for i, a in enumerate(stakes):
        B.tube('sk%d' % i, P(a, -0.35, 0), P(a, 0.35, 1.0), 0.04, 0.035, M['wood_dark'], 6)
        B.tube('sk2%d' % i, P(a, 0.35, 0), P(a, -0.35, 1.0), 0.04, 0.035, M['wood_dark'], 6)
    for z in (0.3, 0.6, 0.9):   # нити проволоки с провисом
        for i in range(3):
            a0, a1 = stakes[i], stakes[i + 1]
            for s in (-1, 1):
                B.tube('w%d%d%d' % (int(z * 10), i, s), P(a0, s * 0.3 * (1 - z), z), P(a1, s * 0.3 * (1 - z), z - 0.08), 0.012, 0.012, M['wire'], 4)
    for i in range(10):   # спираль
        a = -L / 2 + 0.3 + i * (L - 0.6) / 10
        B.tube('coil%d' % i, P(a, -0.25, 0.1), P(a + 0.25, 0.25, 0.55), 0.015, 0.015, M['wire'], 4)


PROPS = {
    'prop_fence_x': (lambda r: fence(r, 'x'), 192, 160), 'prop_fence_y': (lambda r: fence(r, 'y'), 192, 160),
    'prop_fencebr_x': (lambda r: fence(r, 'x', True), 192, 160), 'prop_fencebr_y': (lambda r: fence(r, 'y', True), 192, 160),
    'prop_hay': (haystack, 128, 144), 'prop_pole_x': (lambda r: pole(r, 'x'), 112, 320), 'prop_pole_y': (lambda r: pole(r, 'y'), 112, 320),
    'prop_well': (well, 160, 192), 'prop_shed': (shed, 160, 160), 'prop_cart': (cart, 160, 128), 'prop_woodpile': (woodpile, 128, 112),
    'prop_barrels': (barrels, 96, 96), 'prop_crates': (crates, 96, 96), 'prop_stump': (stump, 80, 72), 'prop_rock': (rock, 96, 80),
    'prop_hedgehog': (hedgehog, 96, 96), 'prop_wire_x': (lambda r: wire(r, 'x'), 192, 128), 'prop_wire_y': (lambda r: wire(r, 'y'), 192, 128),
}
