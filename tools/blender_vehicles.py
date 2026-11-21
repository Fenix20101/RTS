# Модели техники в метрах по реальным размерам. Выполняется внутри blender_units.py (exec),
# поэтому Builder, mat_paint, mat_flat и др. уже определены.
# Оси: x — вперёд от центра корпуса, y — вправо, z — вверх от земли. 1 м = K игровых единиц.

K = 4.42


def paint(fac):
    if fac == 'ger':   # тёмно-жёлтый с оливковыми и красно-коричневыми пятнами (1943–45)
        return mat_paint('ger_camo', '#8d8156', 0.66, 0.5, 0, 0.3, camo=[('#4a5530', 0.22, 0.52), ('#5f3f2b', 0.2, 0.58)], armor=True)
    if fac == 'usa':   # Olive Drab
        return mat_paint('usa_od', '#575638', 0.62, 0.55, armor=True)
    return mat_paint('ussr_4bo', '#4b5833', 0.62, 0.55, armor=True)   # 4БО


def mats():
    return {
        'dark': mat_flat('dark', (0.02, 0.02, 0.018, 1), 0.8),
        'steel': mat_flat('steel', (0.05, 0.05, 0.045, 1), 0.45, 0.8),
        'rubber': mat_flat('rubber', (0.022, 0.022, 0.02, 1), 0.9),
        'link': mat_flat('link', (0.045, 0.038, 0.032, 1), 0.65, 0.55),
        'white': mat_flat('white', (0.72, 0.72, 0.68, 1), 0.6),
        'black': mat_flat('black', (0.01, 0.01, 0.01, 1), 0.6),
        'red': mat_flat('red', (0.55, 0.04, 0.03, 1), 0.6),
        'glass': mat_flat('glass', (0.02, 0.03, 0.035, 1), 0.08),
        'wood': mat_paint('wood', '#6b5238', 0.8, 0.2, 0, 0.4),
        'canvas_ger': mat_paint('canvas_ger', '#8a7d58', 0.95, 0.35, 0, 0.2),
        'canvas_usa': mat_paint('canvas_usa', '#5d5c3e', 0.95, 0.35, 0, 0.2),
        'canvas_ussr': mat_paint('canvas_ussr', '#6a6448', 0.95, 0.35, 0, 0.25),
        'strap': mat_flat('strap', (0.045, 0.03, 0.018, 1), 0.8),
        'can_ger': mat_paint('can_ger', '#4d4f3a', 0.6, 0.4, 0, 0.3),
        'can_usa': mat_paint('can_usa', '#4f4e33', 0.6, 0.4, 0, 0.3),
        'can_ussr': mat_paint('can_ussr', '#46502f', 0.6, 0.4, 0, 0.3),
        'lamp': mat_flat('lamp', (0.5, 0.5, 0.45, 1), 0.15, 0.6),
    }


def running_gear(B, P, M, y_out, tw, wheels, spr, idl, rollers, ww=None, thk=0.07, pitch=0.16, disc=None):
    """wheels: [(x, r, dy)] dy — смещение внутрь (шахматные катки); spr/idl: (x, z, r); rollers: [(x, z, r)]"""
    disc = disc or P
    ww = ww or tw * 0.8
    for side in (-1, 1):
        y_in = y_out - tw
        circ = []
        for i, (x, r, dy) in enumerate(wheels):
            wy = side * (y_out - tw / 2 - dy)
            B.roadwheel('rw%d_%d' % (side, i), x, wy, r + thk, r, ww, M['rubber'], disc, side)
            circ.append((x, r + thk, r))
        for nm, c in (('spr', spr), ('idl', idl)):
            x, z, r = c
            B.tube('%s%d' % (nm, side), (x, side * (y_out - tw * 0.85), z), (x, side * (y_out - tw * 0.15), z), r, r, M['dark'], 20)
            B.tube('%sd%d' % (nm, side), (x, side * (y_out - tw * 0.12), z), (x, side * (y_out - tw * 0.05), z), r * 0.7, r * 0.7, P, 16)
            circ.append(c)
        for j, (x, z, r) in enumerate(rollers):
            B.tube('rr%d_%d' % (side, j), (x, side * (y_out - tw * 0.8), z), (x, side * (y_out - tw * 0.2), z), r, r, M['rubber'], 14)
            circ.append((x, z, r))
        B.track_loop('trk%d' % side, circ, side * y_in, side * y_out, thk, pitch, M['link'])


def headlight(B, M, x, y, z, r=0.09):
    B.tube('hl%d' % int(y * 100), (x - 0.12, y, z), (x + 0.05, y, z), r, r * 1.1, M['dark'], 14)
    B.tube('hlg%d' % int(y * 100), (x + 0.05, y, z), (x + 0.06, y, z), r * 0.95, r * 0.95, M['lamp'], 14)


def mg_ball(B, P, M, x, y, z, ang=0.0):
    B.tube('mgb', (x - 0.08, y, z), (x + 0.08, y, z), 0.13, 0.12, P, 14)
    B.tube('mgbar', (x, y, z), (x + 0.45, y, z + 0.45 * math.sin(ang)), 0.02, 0.018, M['steel'], 8)


def hatch(B, P, x, y, z, r=0.3, h=0.06, name='hatch'):
    B.tube(name, (x, y, z - 0.02), (x, y, z + h), r, r * 0.95, P, 20)


def cupola(T, P, M, x, y, z, r=0.33, h=0.25, n=6):
    T.tube('cup', (x, y, z - 0.03), (x, y, z + h), r, r * 0.92, P, 24)
    T.tube('cupl', (x, y, z + h), (x, y, z + h + 0.05), r * 0.9, r * 0.85, P, 24)
    for i in range(n):
        a = i / n * math.pi * 2
        T.box('cupv%d' % i, x + math.cos(a) * r * 0.98 - 0.04, x + math.cos(a) * r * 0.98 + 0.04,
              y + math.sin(a) * r * 0.98 - 0.04, y + math.sin(a) * r * 0.98 + 0.04, z + h * 0.45, z + h * 0.75, M['glass'], 0)


def barrel(T, P, M, x0, length, z, r0, r1, brake=None, mat=None):
    mat = mat or P
    T.tube('barrel', (x0, 0, z), (x0 + length, 0, z), r0, r1, mat, 18)
    end = x0 + length
    if brake == 'double':      # двухкамерный дульный тормоз
        T.tube('mb1', (end - 0.05, 0, z), (end + 0.42, 0, z), r1 * 1.75, r1 * 1.75, mat, 16)
        T.tube('mb2', (end + 0.13, 0, z), (end + 0.2, 0, z), r1 * 1.8, r1 * 1.8, M['dark'], 16)
        end += 0.42
    elif brake == 'd25':
        T.tube('mb1', (end - 0.05, 0, z), (end + 0.5, 0, z), r1 * 1.9, r1 * 1.9, mat, 20)
        T.tube('mbf', (end + 0.46, 0, z), (end + 0.5, 0, z), r1 * 2.0, r1 * 2.0, mat, 20)
        for i, (a, b) in enumerate(((0.07, 0.19), (0.27, 0.4))):
            T.box('mbw%d' % i, end + a, end + b, -r1 * 1.95, r1 * 1.95, z - r1 * 1.0, z + r1 * 1.0, M['dark'], 0)
        end += 0.5
    elif brake == 'single':
        T.tube('mb1', (end - 0.05, 0, z), (end + 0.3, 0, z), r1 * 1.6, r1 * 1.6, mat, 16)
        T.box('mbs', end + 0.08, end + 0.18, -r1 * 1.65, r1 * 1.65, z - r1 * 0.7, z + r1 * 0.7, M['dark'], 0)
        end += 0.3
    elif brake == 'T':         # Т-образный тормоз Д-25Т
        T.tube('mb1', (end - 0.05, 0, z), (end + 0.55, 0, z), r1 * 1.6, r1 * 1.6, mat, 16)
        T.box('mbw', end + 0.05, end + 0.5, -r1 * 2.6, r1 * 2.6, z - r1 * 1.1, z + r1 * 1.1, mat, 0.01)
        T.box('mbg', end + 0.2, end + 0.32, -r1 * 2.7, r1 * 2.7, z - r1 * 0.8, z + r1 * 0.8, M['dark'], 0)
        end += 0.55
    elif brake == 'slotted':   # ЗиС-3
        T.box('mb1', end - 0.05, end + 0.32, -r1 * 1.7, r1 * 1.7, z - r1 * 1.4, z + r1 * 1.4, mat, 0.01)
        for i in range(4):
            T.box('mbs%d' % i, end + 0.02 + i * 0.07, end + 0.05 + i * 0.07, -r1 * 1.75, r1 * 1.75, z - r1 * 1.0, z + r1 * 1.0, M['dark'], 0)
        end += 0.32
    elif brake == 'flash':     # пламегаситель автоматической пушки
        T.tube('fh', (end - 0.02, 0, z), (end + 0.16, 0, z), r1 * 1.5, r1 * 1.7, M['steel'], 12)
        end += 0.16
    T.tube('bore', (end - 0.01, 0, z), (end + 0.004, 0, z), r1 * 0.75, r1 * 0.75, M['black'], 12)
    return end


def side_rails(B, M, x0, x1, y, z):
    B.tube('rail%d' % int(y * 10), (x0, y, z), (x1, y, z), 0.02, 0.02, M['steel'], 8)
    for i in range(4):
        x = x0 + (x1 - x0) * (i + 0.5) / 4
        B.tube('railp%d_%d' % (int(y * 10), i), (x, y * 0.97, z - 0.08), (x, y, z), 0.015, 0.015, M['steel'], 6)


# ===================================================================== ГЕРМАНИЯ
def tiger(hr, tr, fac):
    P, M = paint('ger'), mats()
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.78, 0.725
    wheels = []
    for i in range(8):
        wheels.append((-2.33 + i * 0.665, 0.4, 0.0 if i % 2 == 0 else 0.3))
    running_gear(B, P, M, yo, tw, wheels, (2.78, 0.78, 0.36), (-2.95, 0.62, 0.3), [], ww=0.3, thk=0.08, pitch=0.17)
    # корпус: днище между гусеницами, нос, надгусеничная коробка
    B.hull('low', [(x, y, z) for x in (-2.95, 2.55) for y in (-1.02, 1.02) for z in (0.47, 1.18)], P, 0.02)
    B.hull('nose', [(x, y, z) for y in (-1.02, 1.02) for (x, z) in ((2.55, 0.47), (3.06, 0.98), (3.0, 1.1), (2.5, 1.18), (2.5, 0.47))], P, 0.02)
    B.hull('glacis', [(x, y, z) for y in (-1.58, 1.58) for (x, z) in ((3.0, 1.1), (2.45, 1.18), (2.45, 1.12), (3.06, 1.02))], P, 0.02)
    B.hull('super', [(x, y, z) for x in (-3.1, 2.45) for y in (-1.6, 1.6) for z in (1.16, 1.86)], P, 0.03)
    for s in (-1, 1):   # крылья над гусеницами
        B.box('fender%d' % s, -3.05, 3.1, s * 1.6, s * 1.79, 1.12, 1.16, P, 0.005)
        B.hull('mudg%d' % s, [(x, y, z) for y in (s * 1.08, s * 1.79) for (x, z) in ((2.95, 1.16), (3.25, 1.06), (3.22, 1.0), (2.95, 1.12))], P, 0.005)
    # лоб: смотровой прибор водителя, курсовой пулемёт, фара
    B.box('visor', 2.45, 2.56, -0.95, -0.45, 1.42, 1.62, P, 0.02)
    B.box('visors', 2.555, 2.565, -0.85, -0.55, 1.5, 1.53, M['black'], 0)
    mg_ball(B, P, M, 2.5, 0.65, 1.52)
    headlight(B, M, 2.48, -1.25, 1.95, 0.1)
    # крыша: люки, вентиляторы и решётки МТО
    hatch(B, P, 1.8, -0.75, 1.86, 0.28, name='h1'); hatch(B, P, 1.8, 0.75, 1.86, 0.28, name='h2')
    for s in (-1, 1):
        B.tube('fan%d' % s, (-2.45, s * 0.85, 1.85), (-2.45, s * 0.85, 1.93), 0.3, 0.3, M['dark'], 20)
        B.box('grl%d' % s, -1.95, -1.2, s * 0.2, s * 0.8, 1.86, 1.9, M['dark'], 0.01)
        B.tube('exh%d' % s, (-3.15, s * 0.55, 1.2), (-3.15, s * 0.55, 2.05), 0.075, 0.075, M['dark'], 12)
        B.box('exhg%d' % s, -3.24, -3.18, s * 0.42, s * 0.68, 1.3, 1.95, P, 0.01)
        # трос и шанцевый инструмент на бортах
        B.tube('cable%d' % s, (-2.6, s * 1.62, 1.7), (2.2, s * 1.62, 1.7), 0.025, 0.025, M['steel'], 6)
        B.cross('crs%d' % s, -0.7, s * 1.605, 1.5, 0.28 * K, s) if False else None
    for s in (-1, 1):
        B.cross('bk%d' % s, -0.75 * K, s * 1.605 * K, 1.5 * K, 0.27 * K, s) if False else None
    _ger_cross(B, M, -0.75, 1.6, 1.5, 0.27)
    # ----- башня (подковообразная, вертикальные борта)
    zb, zt = 1.86, 2.68
    out = [(0.95, -1.0), (0.95, 1.0)]
    for i in range(13):
        a = math.pi / 2 + i / 12 * math.pi
        out.append((-0.15 + math.cos(a) * 1.12, math.sin(a) * 1.08))
    T.hull('tur', [(x, y, zb) for x, y in out] + [(x * 0.99, y * 0.99, zt) for x, y in out], P, 0.03)
    T.hull('mant', [(x, y, z) for y in (-0.82, 0.82) for (x, z) in ((0.95, 1.95), (1.22, 2.02), (1.3, 2.3), (1.22, 2.58), (0.95, 2.64))], P, 0.03)
    for s in (-1, 1):
        for j in range(3):
            T.tube('smk%d%d' % (s, j), (0.75 - j * 0.12, s * 1.0, 2.35), (0.85 - j * 0.12, s * 1.14, 2.48), 0.045, 0.045, P, 10)
        for j in range(4):
            T.box('spare%d%d' % (s, j), -0.45 + j * 0.22, -0.27 + j * 0.22, s * 1.1, s * 1.14, 2.0, 2.55, M['link'], 0.005)
    cupola(T, P, M, -0.6, -0.55, zt, 0.33, 0.26, 7)
    hatch(T, P, -0.35, 0.55, zt, 0.25, name='lh')
    T.box('bin', -1.62, -1.12, -0.62, 0.62, 2.0, 2.55, P, 0.03)
    T.tube('coax', (1.2, 0.35, 2.3), (1.35, 0.35, 2.3), 0.03, 0.03, M['steel'], 8)
    T.box('sight', 1.22, 1.3, -0.33, -0.25, 2.35, 2.42, M['dark'], 0)
    end = barrel(T, P, M, 1.3, 4.93, 2.3, 0.12, 0.088, 'double')
    T.digits('num', '131', -0.2, 1.1, 2.3, 0.28, M['black'], 1)
    T.digits('numl', '131', -0.2, -1.1, 2.3, 0.28, M['black'], -1)
    return {'to': [0.2, 0], 'mr': end, 'mz': 2.3}


def _ger_cross(B, M, x, y, z, r):
    """Балкенкройц: белая окантовка и чёрный крест, на обоих бортах (y — модуль)."""
    for s in (-1, 1):
        yy = s * (y + 0.004)
        t = 0.012 * s
        B.box('cw1%d' % s, x - r, x + r, yy, yy + t, z - r * 0.36, z + r * 0.36, M['white'], 0)
        B.box('cw2%d' % s, x - r * 0.36, x + r * 0.36, yy, yy + t, z - r, z + r, M['white'], 0)
        B.box('cb1%d' % s, x - r * 0.82, x + r * 0.82, yy + t, yy + 2 * t, z - r * 0.18, z + r * 0.18, M['black'], 0)
        B.box('cb2%d' % s, x - r * 0.18, x + r * 0.18, yy + t, yy + 2 * t, z - r * 0.82, z + r * 0.82, M['black'], 0)


def pz4(hr, tr, fac):
    P, M = paint('ger'), mats()
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.44, 0.4
    wheels = []
    for c in (-1.83, -0.68, 0.47, 1.62):
        wheels += [(c - 0.28, 0.235, 0), (c + 0.28, 0.235, 0)]
    rollers = [(x, 0.98, 0.11) for x in (-1.75, -0.55, 0.65, 1.85)]
    running_gear(B, P, M, yo, tw, wheels, (2.62, 0.66, 0.33), (-2.72, 0.58, 0.3), rollers, ww=0.3)
    for s in (-1, 1):   # тележки с рессорами
        for c in (-1.83, -0.68, 0.47, 1.62):
            B.box('bog%d%d' % (s, int(c * 10)), c - 0.35, c + 0.35, s * (yo - tw - 0.02), s * (yo - tw - 0.12), 0.25, 0.55, P, 0.02)
            B.box('spr%d%d' % (s, int(c * 10)), c - 0.3, c + 0.3, s * (yo - tw - 0.13), s * (yo - tw - 0.2), 0.55, 0.62, M['steel'], 0.01)
    B.hull('low', [(x, y, z) for x in (-2.9, 2.4) for y in (-1.02, 1.02) for z in (0.4, 1.05)], P, 0.02)
    B.hull('nose', [(x, y, z) for y in (-1.02, 1.02) for (x, z) in ((2.4, 0.4), (2.88, 0.88), (2.82, 1.0), (2.4, 1.05))], P, 0.02)
    B.hull('glacis', [(x, y, z) for y in (-1.0, 1.0) for (x, z) in ((2.82, 1.0), (2.36, 1.14), (2.36, 1.05))], P, 0.02)
    B.hull('super', [(x, y, z) for x in (-2.95, 2.36) for y in (-1.42, 1.42) for z in (1.05, 1.72)], P, 0.03)
    for s in (-1, 1):
        B.box('fender%d' % s, -2.95, 2.95, s * 1.0, s * 1.46, 1.03, 1.07, P, 0.005)
    B.box('visor', 2.36, 2.44, -0.75, -0.4, 1.4, 1.55, P, 0.02)
    mg_ball(B, P, M, 2.38, 0.55, 1.45)
    headlight(B, M, 2.6, -0.85, 1.14, 0.08)
    for i in range(5):   # запасные траки на носу
        B.box('splk%d' % i, 2.62 + i * 0.0, 2.7, -0.95 + i * 0.32, -0.67 + i * 0.32, 0.72, 0.86, M['link'], 0.005)
    hatch(B, P, 1.85, -0.6, 1.72, 0.22, name='h1'); hatch(B, P, 1.85, 0.6, 1.72, 0.22, name='h2')
    B.box('grl', -2.6, -1.4, -0.8, 0.8, 1.72, 1.75, M['dark'], 0.01)
    B.tube('muff', (-3.05, -0.9, 0.9), (-3.05, 0.4, 0.9), 0.15, 0.15, M['dark'], 14)
    B.beam('jack', (-1.2, 1.2, 1.07), (0.2, 1.2, 1.07), 0.18, 0.12, M['steel'], 0.01)
    # экраны (Schürzen) на бортах, на кронштейнах
    for s in (-1, 1):
        for i in range(5):
            x0 = -2.5 + i * 0.95
            B.box('sch%d%d' % (s, i), x0, x0 + 0.92, s * 1.62, s * 1.645, 0.66, 1.62, P, 0.005)
        B.box('schr%d' % s, -2.55, 2.25, s * 1.46, s * 1.64, 1.6, 1.64, P, 0.005)
    _ger_cross(B, M, -0.3, 1.645, 1.15, 0.24)
    # ----- башня
    zb, zt = 1.72, 2.4
    base = [(0.85, -0.62), (0.85, 0.62), (0.25, 0.95), (-0.95, 0.85), (-0.95, -0.85), (0.25, -0.95)]
    T.hull('tur', [(x, y, zb) for x, y in base] + [(x * 0.93 - 0.02, y * 0.86, zt) for x, y in base], P, 0.02)
    T.hull('mant', [(x, y, z) for x in (0.83, 1.02) for y in (-0.42, 0.42) for z in (1.85, 2.28)], P, 0.04)
    cupola(T, P, M, -0.62, 0, zt, 0.34, 0.26, 6)
    for s in (-1, 1):   # экраны башни
        T.box('tsch%d' % s, -0.55, 0.65, s * 1.2, s * 1.22, 1.82, 2.48, P, 0.005)
        T.hull('tschr%d' % s, [(x, y, z) for (x, y) in ((-0.55, s * 1.21), (-1.25, s * 0.85), (-1.25, s * 0.83), (-0.55, s * 1.19)) for z in (1.82, 2.48)], P, 0.005)
        T.box('tschb%d' % s, -0.2, 0.2, s * 0.95, s * 1.2, 2.2, 2.24, P, 0.005)
        for j in range(3):
            T.tube('smk%d%d' % (s, j), (0.55, s * (0.8 + j * 0.08), 2.3), (0.66, s * (0.86 + j * 0.08), 2.4), 0.04, 0.04, P, 8)
    T.tube('coax', (1.02, 0.25, 2.12), (1.12, 0.25, 2.12), 0.03, 0.03, M['steel'], 8)
    end = barrel(T, P, M, 1.02, 3.6, 2.05, 0.08, 0.062, 'double')
    T.digits('num', '624', -0.75, 1.22, 2.15, 0.22, M['black'], 1)
    T.digits('numl', '624', -0.75, -1.22, 2.15, 0.22, M['black'], -1)
    return {'to': [0.1, 0], 'mr': end, 'mz': 2.05}


def luchs(hr, tr, fac):
    P, M = paint('ger'), mats()
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.24, 0.36
    wheels = [(-1.55 + i * 0.73, 0.37, 0.0 if i % 2 == 0 else 0.16) for i in range(5)]
    running_gear(B, P, M, yo, tw, wheels, (2.0, 0.58, 0.27), (-2.08, 0.55, 0.26), [], ww=0.17)
    B.hull('low', [(x, y, z) for x in (-2.2, 1.9) for y in (-0.86, 0.86) for z in (0.4, 0.95)], P, 0.02)
    B.hull('nose', [(x, y, z) for y in (-0.86, 0.86) for (x, z) in ((1.9, 0.4), (2.3, 0.82), (2.25, 0.95), (1.85, 0.97))], P, 0.02)
    B.hull('super', [(x, y, z) for y in (-1.22, 1.22) for (x, z) in ((-2.3, 0.95), (-2.3, 1.52), (1.72, 1.55), (1.85, 0.95))], P, 0.02)
    for s in (-1, 1):
        B.box('fender%d' % s, -2.3, 2.3, s * 0.86, s * 1.26, 0.93, 0.96, P, 0.005)
    B.box('visor', 1.74, 1.82, -0.7, -0.35, 1.25, 1.4, P, 0.02)
    headlight(B, M, 2.15, -0.75, 1.05, 0.07)
    B.box('grl', -2.1, -1.2, -0.7, 0.7, 1.52, 1.55, M['dark'], 0.01)
    _ger_cross(B, M, -0.9, 1.22, 1.22, 0.2)
    zb, zt = 1.53, 2.12
    base = [(0.75, -0.62), (0.75, 0.62), (0.45, 0.82), (-0.95, 0.82), (-0.95, -0.82), (0.45, -0.82)]
    T.hull('tur', [(x, y, zb) for x, y in base] + [(x * 0.95, y * 0.9, zt) for x, y in base], P, 0.02)
    T.box('mant', 0.72, 0.88, -0.25, 0.25, 1.68, 1.98, P, 0.03)
    hatch(T, P, -0.4, -0.35, zt, 0.22, name='h1'); hatch(T, P, -0.4, 0.35, zt, 0.22, name='h2')
    T.tube('coax', (0.88, 0.14, 1.83), (1.25, 0.14, 1.83), 0.018, 0.018, M['steel'], 8)
    for s in (-1, 1):
        for j in range(3):
            T.tube('smk%d%d' % (s, j), (0.5, s * (0.72 + j * 0.06), 1.95), (0.58, s * (0.76 + j * 0.06), 2.04), 0.035, 0.035, P, 8)
    end = barrel(T, P, M, 0.88, 1.12, 1.83, 0.032, 0.026, 'flash', M['steel'])
    return {'to': [0.0, 0], 'mr': end, 'mz': 1.83}


# ===================================================================== США
def _star(B, M, x, y, z, r, side, circle=True):
    if circle:
        B.tube('sc%d' % int(x * 100), (x, y, z), (x, y + side * 0.006, z), r * 1.12, r * 1.12, M['white'], 32)
        B.tube('scc%d' % int(x * 100), (x, y + side * 0.003, z), (x, y + side * 0.009, z), r * 1.02, r * 1.02, M['paint'], 32)
    B.star('st%d' % int(x * 100), x, y + side * 0.01, z, r, M['white'])


def sherman(hr, tr, fac):
    P, M = paint('usa'), mats(); M['paint'] = P
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.31, 0.42
    bogies = (-1.55, -0.08, 1.38)
    wheels = []
    for c in bogies: wheels += [(c - 0.27, 0.255, 0), (c + 0.27, 0.255, 0)]
    rollers = [(c - 0.12, 0.9, 0.11) for c in bogies]
    running_gear(B, P, M, yo, tw, wheels, (2.48, 0.74, 0.33), (-2.62, 0.45, 0.29), rollers, ww=0.24)
    for s in (-1, 1):
        for c in bogies:   # корпус тележки VVSS и пружины
            B.hull('bog%d%d' % (s, int(c * 10)), [(x, y, z) for y in (s * (yo - 0.08), s * (yo - 0.34)) for (x, z) in ((c - 0.2, 0.35), (c + 0.2, 0.35), (c + 0.1, 0.78), (c - 0.1, 0.78))], P, 0.02)
            B.box('bogs%d%d' % (s, int(c * 10)), c - 0.22, c - 0.02, s * (yo - 0.12), s * (yo - 0.3), 0.78, 0.84, M['steel'], 0.01)
    B.hull('low', [(x, y, z) for x in (-2.75, 2.2) for y in (-0.88, 0.88) for z in (0.45, 0.95)], P, 0.02)
    # литой картер трансмиссии (круглый нос)
    prof = [(2.15, 0.42), (2.5, 0.47), (2.72, 0.6), (2.85, 0.8), (2.86, 1.0), (2.8, 1.16), (2.6, 1.18)]
    B.hull('diff', [(x, y, z) for y in (-1.02, 1.02) for (x, z) in prof] + [(x - 0.1, y * 1.12, z) for y in (-1.0, 1.0) for (x, z) in prof[2:6]], P, 0.03, smooth_angle=35)
    B.hull('upper', [(x, y, z) for y in (-1.31, 1.31) for (x, z) in ((2.8, 1.16), (1.88, 2.0), (-2.7, 2.0), (-2.85, 1.2), (-2.85, 0.95), (2.75, 0.95))], P, 0.03)
    # люки водителей с «капюшонами» и перископами
    for s in (-1, 1):
        B.hull('hood%d' % s, [(x, y, z) for y in (s * 0.25, s * 0.8) for (x, z) in ((2.0, 1.92), (1.7, 2.06), (1.4, 2.06), (1.4, 2.0))], P, 0.03)
        B.box('peri%d' % s, 1.55, 1.68, s * 0.45, s * 0.6, 2.06, 2.13, M['dark'], 0.01)
        headlight(B, M, 2.7, s * 0.95, 1.28, 0.08)
        B.tube('guard%d' % s, (2.82, s * 0.82, 1.15), (2.82, s * 1.08, 1.15), 0.015, 0.015, M['steel'], 6)
        B.box('sand%d' % s, -2.8, 2.6, s * 1.31, s * 1.36, 0.85, 0.98, P, 0.005)
        B.box('fendf%d' % s, 2.45, 2.95, s * 0.88, s * 1.34, 1.0, 1.03, P, 0.005)
    mg_ball(B, P, M, 2.35, 0.48, 1.55, -0.3)
    B.box('grl', -2.6, -1.3, -0.95, 0.95, 2.0, 2.03, M['dark'], 0.01)
    B.box('tbox', -2.8, -2.45, -1.0, 1.0, 1.95, 2.15, P, 0.02)
    B.beam('axe', (0.4, -1.2, 2.0), (1.3, -1.2, 2.0), 0.1, 0.05, M['wood'], 0.01)
    for s in (-1, 1):
        _star(B, M, -0.6, s * 1.31, 1.48, 0.33, s)
    _star_top(B, M, 2.35, -0.45, 1.6)
    # ----- литая башня с нишей
    zb = 2.0
    rings = [(zb, 1.0), (zb + 0.45, 0.94), (zb + 0.72, 0.74)]
    pts = []
    for z, k in rings:
        for i in range(24):
            a = i / 24 * math.pi * 2
            rx = 0.88 if math.cos(a) > 0 else 1.25
            ry = 0.9 if math.cos(a) > -0.3 else 0.78
            pts.append((math.cos(a) * rx * k, math.sin(a) * ry * k, z))
    T.hull('tur', pts, P, 0.02, smooth_angle=35)
    T.hull('mant', [(x, y, z) for y in (-0.55, 0.55) for (x, z) in ((0.72, 2.1), (0.95, 2.14), (1.0, 2.3), (0.95, 2.48), (0.72, 2.5))], P, 0.03, smooth_angle=30)
    hatch(T, P, -0.35, 0.42, zb + 0.72, 0.3, name='ch')
    T.box('lh', -0.5, -0.1, -0.62, -0.25, zb + 0.66, zb + 0.73, P, 0.03)
    T.tube('vent', (-0.9, 0, zb + 0.58), (-0.9, 0, zb + 0.66), 0.12, 0.1, P, 14)
    # .50 на кормовой турели
    T.tube('m2p', (-0.75, 0.35, zb + 0.72), (-0.75, 0.35, zb + 1.05), 0.025, 0.025, M['steel'], 8)
    T.box('m2r', -0.95, -0.6, 0.31, 0.39, zb + 1.02, zb + 1.12, M['steel'], 0.01)
    T.tube('m2b', (-0.6, 0.35, zb + 1.08), (0.55, 0.35, zb + 1.08), 0.025, 0.02, M['steel'], 8)
    T.box('sight', 0.8, 0.95, -0.42, -0.32, 2.48, 2.56, M['dark'], 0)
    end = barrel(T, P, M, 1.0, 3.0, 2.29, 0.075, 0.062, None)
    return {'to': [0.15, 0], 'mr': end, 'mz': 2.29}


def _star_top(B, M, x, y, z):
    B.star('stt', x, y, z + 0.4, 0.0001, M['white'], 'top') if False else None


def stuart(hr, tr, fac):
    P, M = paint('usa'), mats(); M['paint'] = P
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.12, 0.295
    bogies = (-0.55, 0.85)
    wheels = []
    for c in bogies: wheels += [(c - 0.26, 0.255, 0), (c + 0.26, 0.255, 0)]
    wheels.append((-1.9, 0.3, 0))   # ленивец на земле
    rollers = [(x, 0.85, 0.09) for x in (-1.2, 0.15, 1.45)]
    running_gear(B, P, M, yo, tw, wheels, (1.98, 0.6, 0.29), (-1.9, 0.37, 0.3), rollers, ww=0.2)
    for s in (-1, 1):
        for c in bogies:
            B.hull('bog%d%d' % (s, int(c * 10)), [(x, y, z) for y in (s * (yo - 0.05), s * (yo - 0.25)) for (x, z) in ((c - 0.2, 0.33), (c + 0.2, 0.33), (c + 0.1, 0.72), (c - 0.1, 0.72))], P, 0.02)
    B.hull('low', [(x, y, z) for x in (-2.25, 1.7) for y in (-0.82, 0.82) for z in (0.4, 0.92)], P, 0.02)
    B.hull('nose', [(x, y, z) for y in (-0.85, 0.85) for (x, z) in ((1.7, 0.4), (2.3, 0.75), (2.35, 0.9), (1.7, 0.92))], P, 0.02)
    B.hull('upper', [(x, y, z) for (x, y, z) in
                     [(2.35, s * 1.0, 0.9) for s in (-1, 1)] + [(1.25, s * 0.88, 1.6) for s in (-1, 1)] +
                     [(-2.3, s * 0.92, 1.6) for s in (-1, 1)] + [(-2.35, s * 1.12, 0.92) for s in (-1, 1)] + [(1.8, s * 1.12, 0.92) for s in (-1, 1)]], P, 0.03)
    for s in (-1, 1):
        B.hull('hood%d' % s, [(x, y, z) for y in (s * 0.15, s * 0.65) for (x, z) in ((1.55, 1.42), (1.3, 1.62), (1.05, 1.62), (1.05, 1.6))], P, 0.02)
        headlight(B, M, 2.2, s * 0.75, 1.0, 0.07)
        B.box('sand%d' % s, -2.3, 2.0, s * 1.12, s * 1.15, 0.8, 0.92, P, 0.005)
        _star(B, M, -0.7, s * 1.03, 1.2, 0.26, s)
    mg_ball(B, P, M, 1.75, 0.45, 1.25, -0.2)
    B.box('grl', -2.1, -1.1, -0.7, 0.7, 1.6, 1.63, M['dark'], 0.01)
    zb = 1.6
    out = [(0.62, -0.55), (0.62, 0.55), (0.3, 0.72), (-0.55, 0.72), (-1.12, 0.6), (-1.12, -0.6), (-0.55, -0.72), (0.3, -0.72)]
    T.hull('tur', [(x, y, zb) for x, y in out] + [(x * 0.95, y * 0.88, zb + 0.58) for x, y in out], P, 0.03)
    T.box('mant', 0.58, 0.78, -0.36, 0.36, 1.7, 2.05, P, 0.03)
    hatch(T, P, -0.3, -0.3, zb + 0.58, 0.24, name='h1'); hatch(T, P, -0.3, 0.3, zb + 0.58, 0.24, name='h2')
    T.tube('aap', (-0.3, 0.75, 1.75), (-0.3, 0.75, 2.35), 0.02, 0.02, M['steel'], 8)
    T.tube('aab', (-0.6, 0.75, 2.35), (0.4, 0.75, 2.38), 0.022, 0.018, M['steel'], 8)
    T.tube('coax', (0.78, 0.18, 1.86), (0.95, 0.18, 1.86), 0.02, 0.02, M['steel'], 8)
    end = barrel(T, P, M, 0.78, 1.98, 1.88, 0.05, 0.04, None)
    T.tube('recsl', (0.78, 0, 1.88), (1.15, 0, 1.88), 0.07, 0.07, P, 12)
    return {'to': [0.1, 0], 'mr': end, 'mz': 1.88}


def pershing(hr, tr, fac):
    P, M = paint('usa'), mats(); M['paint'] = P
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.755, 0.61
    wheels = [(-2.18 + i * 0.875, 0.33, 0) for i in range(6)]
    rollers = [(-1.75 + i * 0.875, 0.98, 0.1) for i in range(5)]
    running_gear(B, P, M, yo, tw, wheels, (-2.88, 0.62, 0.33), (2.85, 0.62, 0.3), rollers, ww=0.48)
    B.hull('low', [(x, y, z) for x in (-3.1, 2.7) for y in (-1.12, 1.12) for z in (0.45, 1.02)], P, 0.02)
    B.hull('upper', [(x, y, z) for y in (-1.5, 1.5) for (x, z) in ((2.7, 0.48), (3.18, 0.95), (2.3, 1.85), (-3.05, 1.85), (-3.17, 1.6), (-3.17, 1.0), (2.7, 1.0))], P, 0.03)
    for s in (-1, 1):
        B.box('fend%d' % s, -3.15, 3.2, s * 1.5, s * 1.78, 1.0, 1.04, P, 0.005)
        B.box('sbox%d' % s, -2.2, -0.6, s * 1.52, s * 1.76, 1.04, 1.35, P, 0.02)
        headlight(B, M, 3.05, s * 1.2, 1.12, 0.08)
        _star(B, M, 0.2, s * 1.5, 1.42, 0.3, s)
        hatch(B, P, 2.0, s * 0.6, 1.85, 0.25, name='h%d' % s)
    mg_ball(B, P, M, 2.75, 0.55, 1.3, -0.3)
    B.box('grl', -2.8, -1.2, -1.1, 1.1, 1.85, 1.88, M['dark'], 0.01)
    zb = 1.85
    pts = []
    for z, k in ((zb, 1.0), (zb + 0.45, 0.95), (zb + 0.78, 0.78)):
        for i in range(24):
            a = i / 24 * math.pi * 2
            rx = 1.0 if math.cos(a) > 0 else 1.62
            ry = 1.18 if math.cos(a) > -0.4 else 0.92
            pts.append((math.cos(a) * rx * k, math.sin(a) * ry * k, z))
    T.hull('tur', pts, P, 0.02, smooth_angle=35)
    T.hull('mant', [(x, y, z) for y in (-0.64, 0.64) for (x, z) in ((0.9, 1.95), (1.22, 2.02), (1.28, 2.22), (1.22, 2.45), (0.9, 2.52))], P, 0.03, smooth_angle=30)
    cupola(T, P, M, -0.45, 0.55, zb + 0.78, 0.3, 0.2, 6)
    hatch(T, P, -0.4, -0.55, zb + 0.78, 0.26, name='lh')
    T.tube('m2b', (-0.6, 0.55, zb + 1.12), (0.5, 0.55, zb + 1.12), 0.025, 0.02, M['steel'], 8)
    T.tube('m2p', (-0.45, 0.55, zb + 0.98), (-0.45, 0.55, zb + 1.1), 0.03, 0.03, M['steel'], 8)
    T.box('bin', -1.95, -1.55, -0.75, 0.75, 1.95, 2.45, P, 0.02)
    end = barrel(T, P, M, 1.28, 4.5, 2.22, 0.1, 0.075, 'single')
    return {'to': [0.4, 0], 'mr': end, 'mz': 2.22}


# ===================================================================== СССР
def _fuel_tank(B, P, x, y, z, length=0.85, r=0.19):
    B.tube('ft%d%d' % (int(x * 10), int(y * 10)), (x, y, z), (x + length, y, z), r, r, P, 16)
    for e in (x + 0.12, x + length - 0.12):
        B.tube('ftb%d%d%d' % (int(x * 10), int(y * 10), int(e * 10)), (e, y, z), (e + 0.04, y, z), r * 1.04, r * 1.04, P, 16)


def t34(hr, tr, fac):
    P, M = paint('ussr'), mats()
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.5, 0.5
    wheels = [(-1.95 + i * 1.0, 0.415, 0) for i in range(5)]
    running_gear(B, P, M, yo, tw, wheels, (-2.78, 0.58, 0.32), (2.76, 0.56, 0.31), [], ww=0.42, pitch=0.172, thk=0.075)
    for s in (-1, 1):   # спицы-диски катков Кристи
        for i in range(5):
            x = -1.95 + i * 1.0
            B.tube('rim%d%d' % (s, i), (x, s * (yo + 0.0), 0.49), (x, s * (yo + 0.03), 0.49), 0.12, 0.1, P, 12)
    B.hull('low', [(x, y, z) for x in (-2.85, 2.75) for y in (-1.0, 1.0) for z in (0.4, 0.92)], P, 0.02)
    B.hull('nose', [(x, y, z) for y in (-1.0, 1.0) for (x, z) in ((2.75, 0.4), (3.05, 0.93), (2.75, 0.93))], P, 0.02)
    B.hull('upper', [(x, y, z) for (x, y, z) in
                     [(3.05, s * 1.5, 0.93) for s in (-1, 1)] + [(1.88, s * 1.0, 1.62) for s in (-1, 1)] +
                     [(-2.45, s * 1.0, 1.62) for s in (-1, 1)] + [(-3.0, s * 1.5, 1.05) for s in (-1, 1)] +
                     [(-3.0, s * 1.5, 0.93) for s in (-1, 1)]], P, 0.025)
    B.hull('rear', [(x, y, z) for y in (-1.0, 1.0) for (x, z) in ((-2.85, 0.4), (-3.02, 1.0), (-2.85, 1.0))], P, 0.02)
    # люк водителя на лобовом листе, курсовой ДТ, фара
    B.hull('dhatch', [(x, y, z) for y in (-0.82, -0.3) for (x, z) in ((2.55, 1.1), (2.2, 1.4), (2.15, 1.38), (2.5, 1.07))], P, 0.02)
    B.box('dperi', 2.3, 2.4, -0.72, -0.42, 1.35, 1.42, M['dark'], 0)
    mg_ball(B, P, M, 2.42, 0.6, 1.2, -0.5)
    headlight(B, M, 2.75, -0.95, 1.12, 0.085)
    for i in range(3):   # запасные траки на лобовом листе
        B.hull('splk%d' % i, [(x, y, z) for y in (0.05 + i * 0.0 - 0.9 + i * 0.6, -0.4 + i * 0.6) for (x, z) in ((2.62, 1.0), (2.5, 1.08), (2.46, 1.05), (2.58, 0.97))], M['link'], 0.005)
    hatch(B, P, -1.25, 0, 1.62, 0.0001, name='none') if False else None
    B.box('louv', -2.3, -1.2, -0.75, 0.75, 1.62, 1.65, M['dark'], 0.01)
    B.box('eng', -1.15, -0.55, -0.5, 0.5, 1.62, 1.66, P, 0.02)
    for s in (-1, 1):
        _fuel_tank(B, P, -1.6, s * 1.3, 1.2)
        _fuel_tank(B, P, -0.55, s * 1.3, 1.2)
        B.tube('exh%d' % s, (-3.0, s * 0.62, 1.05), (-3.18, s * 0.62, 1.02), 0.07, 0.07, M['dark'], 12)
        side_rails(B, M, -1.9, 1.0, s * 1.22, 1.45)
        B.tube('smk%d' % s, (-3.05, s * 0.3, 0.75), (-3.05, s * 0.3, 0.98), 0.12, 0.12, P, 14)
    B.beam('logs', (-2.75, -1.0, 1.25), (-2.75, 1.0, 1.25), 0.2, 0.2, M['wood'], 0.04) if False else None
    B.tube('log', (-2.8, -1.1, 1.15), (-2.8, 1.1, 1.15), 0.11, 0.11, M['wood'], 12)
    # ----- литая башня Т-34-85: почти отвесные борта, широкие скулы, нависающая корма
    B.hull('mudf', [(x, y, z) for y in (-1.5, 1.5) for (x, z) in ((2.75, 0.95), (2.8, 0.9), (3.2, 0.62), (3.15, 0.58))], P, 0.005)
    for s in (-1, 1):
        B.tube('hook%d' % s, (2.98, s * 0.55, 0.45), (3.1, s * 0.55, 0.45), 0.06, 0.06, M['steel'], 10)
    zb = 1.62
    def outline(k, ky, dz):
        pts = []
        for (x, y) in ((1.1, 0.58), (0.9, 0.97), (0.25, 1.08), (-0.65, 1.04), (-1.3, 0.9), (-1.55, 0.55)):
            pts += [(x * k, y * ky, zb + dz), (x * k, -y * ky, zb + dz)]
        pts += [(-1.62 * k, 0, zb + dz), (1.16 * k, 0, zb + dz)]
        return pts
    T.tube('ring', (0.0, 0, zb - 0.04), (0.0, 0, zb + 0.06), 0.88, 0.88, P, 28)
    T.hull('tur', outline(1.0, 1.0, 0.04) + outline(0.99, 0.99, 0.48) + outline(0.92, 0.9, 0.8), P, 0.03, smooth_angle=30)
    # литая маска и манжета ствола
    T.hull('mant', [(x, y, z) for y in (-0.64, 0.64) for (x, z) in ((0.95, 1.76), (1.28, 1.82), (1.42, 2.02), (1.3, 2.24), (0.95, 2.3))], P, 0.03, smooth_angle=30)
    T.tube('sleeve', (1.38, 0, 2.02), (1.78, 0, 2.02), 0.15, 0.13, P, 18)
    cupola(T, P, M, -0.62, -0.45, zb + 0.8, 0.36, 0.22, 5)
    hatch(T, P, -0.55, 0.45, zb + 0.8, 0.27, name='lh')
    for s in (-1, 1):
        T.tube('vent%d' % s, (-1.05, s * 0.24, zb + 0.74), (-1.05, s * 0.24, zb + 0.9), 0.14, 0.12, P, 14)
        T.digits('num%d' % s, '214', -0.35, s * 1.085, zb + 0.4, 0.26, M['white'], s)
        T.tube('grab%d' % s, (-1.0, s * 1.06, zb + 0.66), (0.4, s * 1.06, zb + 0.66), 0.018, 0.018, M['steel'], 6)
    T.box('sight', 0.98, 1.08, -0.42, -0.3, 2.2, 2.3, M['dark'], 0)
    T.tube('coax', (1.3, 0.26, 1.98), (1.42, 0.26, 1.98), 0.025, 0.025, M['steel'], 8)
    # ЗиС-С-53: за нос корпуса выступает около 2 м (длина с пушкой 8,15 м)
    end = barrel(T, P, M, 1.75, 2.7, 2.02, 0.085, 0.068, None)
    T.tube('muz', (end - 0.12, 0, 2.02), (end, 0, 2.02), 0.078, 0.078, P, 16)
    return {'to': [0.62, 0], 'mr': end, 'mz': 2.02}


def is2(hr, tr, fac):
    P, M = paint('ussr'), mats()
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.535, 0.65
    wheels = [(-2.5 + i * 0.99, 0.275, 0) for i in range(6)]
    rollers = [(x, 0.98, 0.12) for x in (-1.5, 0.0, 1.45)]
    running_gear(B, P, M, yo, tw, wheels, (-3.08, 0.6, 0.33), (3.1, 0.62, 0.3), rollers, ww=0.5)
    # нижний корпус между гусеницами, прямой лобовой лист (обр. 1944)
    B.hull('low', [(x, y, z) for x in (-3.2, 3.0) for y in (-0.88, 0.88) for z in (0.42, 1.0)], P, 0.02)
    B.hull('nose', [(x, y, z) for y in (-0.88, 0.88) for (x, z) in ((3.0, 0.42), (3.38, 1.0), (3.0, 1.0))], P, 0.02)
    # верхний корпус: борта почти отвесные, над гусеницами полки
    B.hull('upper', [(x, y, z) for (x, y, z) in
                     [(3.38, s * 1.22, 1.0) for s in (-1, 1)] + [(2.25, s * 1.15, 1.62) for s in (-1, 1)] +
                     [(-2.75, s * 1.15, 1.62) for s in (-1, 1)] + [(-3.35, s * 1.28, 1.12) for s in (-1, 1)] +
                     [(-3.35, s * 1.3, 1.0) for s in (-1, 1)] + [(1.5, s * 1.3, 1.0) for s in (-1, 1)]], P, 0.025)
    for s in (-1, 1):
        B.box('fend%d' % s, -3.3, 3.15, s * 1.28, s * 1.64, 0.98, 1.03, P, 0.005)
        # передние грязевые щитки под углом
        B.hull('mud%d' % s, [(x, y, z) for y in (s * 0.9, s * 1.64) for (x, z) in ((3.1, 1.03), (3.15, 0.98), (3.62, 0.74), (3.58, 0.7))], P, 0.005)
        B.box('sbox%d' % s, 1.75, 2.55, s * 1.32, s * 1.6, 1.03, 1.3, P, 0.02)
        # два длинных топливных бака в линию на кормовых полках
        _fuel_tank(B, P, -3.1, s * 1.46, 1.24, 1.0, 0.2)
        _fuel_tank(B, P, -2.05, s * 1.46, 1.24, 1.0, 0.2)
        side_rails(B, M, -1.0, 1.3, s * 1.17, 1.5)
        B.tube('exh%d' % s, (-3.3, s * 0.62, 1.1), (-3.5, s * 0.62, 1.08), 0.08, 0.08, M['dark'], 12)
        B.tube('cab%d' % s, (-0.9, s * 1.45, 1.08), (1.6, s * 1.45, 1.08), 0.035, 0.035, M['steel'], 8)
    B.hull('dvisor', [(x, y, z) for y in (-0.22, 0.22) for (x, z) in ((2.55, 1.42), (2.4, 1.52), (2.32, 1.5), (2.48, 1.4))], P, 0.01)
    B.box('dslit', 2.46, 2.5, -0.12, 0.12, 1.44, 1.47, M['dark'], 0)
    headlight(B, M, 3.0, -0.98, 1.2, 0.09)
    B.box('louv', -2.6, -1.35, -0.85, 0.85, 1.62, 1.65, M['dark'], 0.01)
    B.box('eng', -1.3, -0.75, -0.6, 0.6, 1.62, 1.67, P, 0.02)
    # ----- литая башня: высокая, борта с наклоном, большая кормовая ниша
    zb = 1.62
    def outline(k, ky, dz, dx=0.0):
        pts = []
        for (x, y) in ((1.18, 0.72), (0.95, 1.16), (0.2, 1.25), (-0.8, 1.18), (-1.5, 0.95), (-1.78, 0.5)):
            pts += [(x * k + dx, y * ky, zb + dz), (x * k + dx, -y * ky, zb + dz)]
        pts += [(-1.84 * k + dx, 0, zb + dz), (1.22 * k + dx, 0, zb + dz)]
        return pts
    T.tube('ring', (0.0, 0, zb - 0.04), (0.0, 0, zb + 0.06), 1.0, 1.0, P, 28)
    T.hull('tur', outline(1.0, 1.0, 0.04) + outline(0.98, 0.95, 0.5) + outline(0.86, 0.76, 0.9, -0.05), P, 0.03, smooth_angle=32)
    # коробчатая литая маска Д-25Т и манжета
    T.hull('mant', [(x, y, z) for y in (-0.62, 0.62) for (x, z) in ((1.02, 1.9), (1.46, 1.96), (1.54, 2.24), (1.46, 2.54), (1.02, 2.6))], P, 0.03, smooth_angle=25)
    T.tube('sleeve', (1.5, 0, 2.24), (1.95, 0, 2.24), 0.17, 0.15, P, 18)
    cupola(T, P, M, -0.6, -0.5, zb + 0.88, 0.36, 0.2, 6)
    hatch(T, P, -0.55, 0.52, zb + 0.88, 0.28, name='lh')
    T.tube('dshp', (-0.55, 0.52, zb + 0.94), (-0.55, 0.52, zb + 1.18), 0.03, 0.03, M['steel'], 8)
    T.tube('dshb', (-0.85, 0.52, zb + 1.2), (0.55, 0.52, zb + 1.22), 0.035, 0.025, M['steel'], 8)
    T.box('dshr', -0.85, -0.45, 0.47, 0.57, zb + 1.14, zb + 1.26, M['steel'], 0.01)
    T.tube('rmg', (-1.9, -0.3, zb + 0.45), (-1.72, -0.3, zb + 0.45), 0.11, 0.1, P, 14)
    T.tube('rmgb', (-2.05, -0.3, zb + 0.45), (-1.88, -0.3, zb + 0.45), 0.02, 0.02, M['steel'], 8)
    for s in (-1, 1):
        T.digits('num%d' % s, '312', -0.35, s * 1.235, zb + 0.42, 0.28, M['white'], s)
        T.tube('grab%d' % s, (-1.2, s * 1.17, zb + 0.72), (0.3, s * 1.17, zb + 0.72), 0.018, 0.018, M['steel'], 6)
    # Д-25Т: за нос корпуса выступает около 3 м (длина с пушкой 9,83 м)
    end = barrel(T, P, M, 1.92, 3.7, 2.24, 0.115, 0.095, 'd25')
    return {'to': [0.35, 0], 'mr': end, 'mz': 2.24}


def t70(hr, tr, fac):
    P, M = paint('ussr'), mats()
    B, T = Builder(hr, K), Builder(tr, K)
    yo, tw = 1.16, 0.26
    wheels = [(-1.55 + i * 0.74, 0.275, 0) for i in range(5)]
    rollers = [(x, 0.8, 0.1) for x in (-1.15, 0.0, 1.1)]
    running_gear(B, P, M, yo, tw, wheels, (1.88, 0.52, 0.26), (-1.98, 0.42, 0.26), rollers, ww=0.2)
    B.hull('low', [(x, y, z) for x in (-2.1, 1.75) for y in (-0.88, 0.88) for z in (0.32, 0.82)], P, 0.02)
    B.hull('upper', [(x, y, z) for y in (-1.0, 1.0) for (x, z) in ((1.95, 0.35), (2.15, 0.82), (1.42, 1.3), (-1.9, 1.3), (-2.15, 1.05), (-2.15, 0.82))], P, 0.025)
    for s in (-1, 1):
        B.box('fend%d' % s, -2.1, 2.1, s * 1.0, s * 1.18, 0.82, 0.85, P, 0.005)
    B.box('dvisor', 1.6, 1.75, -0.6, -0.25, 1.1, 1.22, P, 0.02)
    headlight(B, M, 1.95, -0.85, 0.95, 0.07)
    B.box('louv', -1.9, -1.0, -0.6, 0.6, 1.3, 1.33, M['dark'], 0.01)
    for s in (-1, 1):
        B.tube('exh%d' % s, (-2.15, s * 0.5, 0.95), (-2.3, s * 0.5, 0.95), 0.05, 0.05, M['dark'], 10)
    # башня смещена влево; ось вращения — её центр (передаётся в игру как смещение)
    zb = 1.3
    base = [(0.62, -0.42), (0.62, 0.42), (0.2, 0.62), (-0.72, 0.52), (-0.72, -0.52), (0.2, -0.62)]
    T.hull('tur', [(x, y, zb) for x, y in base] + [(x * 0.9, y * 0.82, zb + 0.6) for x, y in base], P, 0.02)
    T.box('mant', 0.58, 0.75, -0.25, 0.25, 1.42, 1.78, P, 0.03)
    hatch(T, P, -0.2, 0, zb + 0.6, 0.25, name='h')
    T.box('peri', 0.05, 0.18, -0.25, -0.12, zb + 0.6, zb + 0.68, M['dark'], 0)
    T.digits('num1', '105', -0.1, 0.58, 1.55, 0.18, M['white'], 1)
    T.digits('num2', '105', -0.1, -0.58, 1.55, 0.18, M['white'], -1)
    end = barrel(T, P, M, 0.75, 2.07, 1.6, 0.05, 0.04, None)
    return {'to': [0.0, -0.22], 'mr': end, 'mz': 1.6}


# ===================================================================== ГРУЗОВИКИ
def _cargo(B, M, x0, x1, half_w, z_floor, side_h, wood):
    B.box('floor', x0, x1, -half_w, half_w, z_floor - 0.08, z_floor, wood, 0.01)
    for s in (-1, 1):
        for j in range(3):
            zz = z_floor + j * side_h / 3
            B.box('sb%d%d' % (s, j), x0, x1, s * half_w, s * (half_w - 0.04), zz + 0.01, zz + side_h / 3 - 0.01, wood, 0.005)
    for j in range(3):
        zz = z_floor + j * side_h / 3
        B.box('tb%d' % j, x0, x0 + 0.04, -half_w, half_w, zz + 0.01, zz + side_h / 3 - 0.01, wood, 0.005)
        B.box('fb%d' % j, x1 - 0.04, x1, -half_w, half_w, zz + 0.01, zz + side_h / 3 - 0.01, wood, 0.005)


def _tarp(B, x0, x1, half_w, z0, z1, mat, round_top=0.35):
    prof = []
    for i in range(9):
        a = math.pi * i / 8
        prof.append((math.cos(a) * half_w, z1 - round_top + math.sin(a) * round_top if abs(math.cos(a)) < 0.999 else z1 - round_top))
    pts = [(x, y, z) for x in (x0, x1) for (y, z) in prof] + [(x, y, z0) for x in (x0, x1) for y in (-half_w, half_w)]
    B.hull('tarp', pts, mat, 0.03, smooth_angle=30)
    for i in range(1, 4):   # дуги тента
        x = x0 + (x1 - x0) * i / 4
        B.hull('bow%d' % i, [(xx, y * 1.01, z + 0.005) for xx in (x - 0.03, x + 0.03) for (y, z) in prof], mat, 0.005)


def _wheel_pair(B, M, x, y_c, r, w, P, dual=False):
    for s in (-1, 1):
        if dual:
            for k, dy in enumerate((-w * 0.52, w * 0.52)):
                B.roadwheel('tw%d%d%d' % (int(x * 10), s, k), x, s * (y_c + dy), r, r, w, M['rubber'], P, s, 0.3)
        else:
            B.roadwheel('tw%d%d' % (int(x * 10), s), x, s * y_c, r, r, w, M['rubber'], P, s, 0.3)
    B.tube('axle%d' % int(x * 10), (x, -y_c, r), (x, y_c, r), 0.06, 0.06, M['dark'], 10)


def opel_blitz(root, fac):
    P, M = paint('ger'), mats()
    B = Builder(root, K)
    r = 0.47
    _wheel_pair(B, M, 1.95, 0.83, r, 0.2, P)
    _wheel_pair(B, M, -1.65, 0.75, r, 0.2, P, dual=True)
    B.box('frame', -2.95, 2.7, -0.45, 0.45, 0.62, 0.82, M['dark'], 0.01)
    # капот с вертикальной решёткой
    B.hull('hood', [(x, y, z) for (x, y, z) in
                    [(1.62, s * 0.52, 0.9) for s in (-1, 1)] + [(2.85, s * 0.44, 0.9) for s in (-1, 1)] +
                    [(1.62, s * 0.46, 1.55) for s in (-1, 1)] + [(2.82, s * 0.36, 1.45) for s in (-1, 1)]], P, 0.05, smooth_angle=25)
    B.box('grille', 2.84, 2.9, -0.36, 0.36, 0.85, 1.45, M['dark'], 0.03)
    for s in (-1, 1):   # округлые крылья
        prof = [(1.3, 0.75), (1.55, 1.05), (1.95, 1.15), (2.4, 1.08), (2.75, 0.85), (2.9, 0.75)]
        B.hull('fend%d' % s, [(x, y, z) for y in (s * 0.55, s * 1.08) for (x, z) in prof] + [(x, y, z - 0.04) for y in (s * 0.55, s * 1.08) for (x, z) in prof], P, 0.03, smooth_angle=30)
        B.box('step%d' % s, 0.45, 1.35, s * 0.85, s * 1.08, 0.72, 0.76, P, 0.01)
        headlight(B, M, 2.6, s * 0.75, 1.25, 0.09)
    # кабина
    B.hull('cab', [(x, y, z) for (x, y, z) in
                   [(0.55, s * 0.98, 0.9) for s in (-1, 1)] + [(1.62, s * 0.98, 0.9) for s in (-1, 1)] +
                   [(1.66, s * 0.95, 1.55) for s in (-1, 1)] + [(1.5, s * 0.92, 2.1) for s in (-1, 1)] +
                   [(0.55, s * 0.92, 2.18) for s in (-1, 1)]], P, 0.08, smooth_angle=25)
    B.hull('wind', [(x, y, z) for y in (-0.82, 0.82) for (x, z) in ((1.65, 1.6), (1.53, 2.03), (1.55, 2.03), (1.67, 1.6))], M['glass'], 0)
    for s in (-1, 1):
        B.box('sw%d' % s, 0.75, 1.4, s * 0.975, s * 0.985, 1.6, 2.0, M['glass'], 0)
        B.box('door%d' % s, 0.62, 1.48, s * 0.982, s * 0.988, 1.0, 1.55, M['dark'], 0) if False else None
    _cargo(B, M, -3.0, 0.45, 1.13, 1.1, 0.45, M['wood'])
    _tarp(B, -2.95, 0.42, 1.12, 1.55, 2.7, M['canvas_ger'], 0.25)
    B.box('notek', 2.5, 2.6, -0.95, -0.85, 1.1, 1.18, M['dark'], 0)


def gmc(root, fac):
    P, M = paint('usa'), mats(); M['paint'] = P
    B = Builder(root, K)
    r = 0.47
    _wheel_pair(B, M, 2.45, 0.8, r, 0.2, P)
    _wheel_pair(B, M, -0.95, 0.73, r, 0.18, P, dual=True)
    _wheel_pair(B, M, -2.07, 0.73, r, 0.18, P, dual=True)
    B.box('frame', -3.35, 3.2, -0.45, 0.45, 0.62, 0.82, M['dark'], 0.01)
    B.hull('hood', [(x, y, z) for x in (1.95, 3.15) for y in (-0.48, 0.48) for z in (0.95, 1.55)], P, 0.03)
    B.box('grille', 3.15, 3.22, -0.45, 0.45, 0.85, 1.52, M['dark'], 0.01)
    for i in range(6):   # защитная решётка
        B.box('gb%d' % i, 3.22, 3.26, -0.43 + i * 0.17, -0.41 + i * 0.17, 0.85, 1.5, M['steel'], 0)
    B.box('bump', 3.2, 3.4, -1.05, 1.05, 0.6, 0.78, M['dark'], 0.01)
    for s in (-1, 1):   # плоские крылья
        B.hull('fend%d' % s, [(x, y, z) for y in (s * 0.5, s * 1.1) for (x, z) in ((1.6, 1.1), (2.85, 1.1), (3.15, 0.95), (3.15, 0.9), (2.85, 1.06), (1.6, 1.06))], P, 0.01)
        headlight(B, M, 2.95, s * 0.7, 1.2, 0.09)
        B.box('step%d' % s, 0.85, 1.6, s * 0.85, s * 1.1, 0.72, 0.76, P, 0.01)
        _star(B, M, 1.35, s * 0.99, 1.3, 0.18, s, False)
    _star(B, M, 2.55, -0.0001, 1.56, 0.0001, 1, False) if False else None
    # открытая кабина с брезентовым верхом
    B.hull('cab', [(x, y, z) for x in (0.85, 1.95) for y in (-0.98, 0.98) for z in (0.95, 1.6)], P, 0.03)
    B.box('wsf', 1.88, 1.95, -0.95, 0.95, 1.6, 2.15, P, 0.01)
    B.box('ws', 1.9, 1.93, -0.88, 0.88, 1.65, 2.1, M['glass'], 0)
    B.hull('ctop', [(x, y, z) for x in (0.85, 1.92) for y in (-0.98, 0.98) for z in (2.15, 2.25)], M['canvas_usa'], 0.03)
    B.tube('spare', (0.7, -0.35, 1.45), (0.7, 0.35, 1.45), r, r, M['rubber'], 20) if False else None
    _cargo(B, M, -3.4, 0.75, 1.12, 1.12, 0.55, P)
    _tarp(B, -3.35, 0.72, 1.11, 1.67, 2.77, M['canvas_usa'], 0.3)


def zis5(root, fac):
    P, M = paint('ussr'), mats()
    B = Builder(root, K)
    r = 0.43
    _wheel_pair(B, M, 1.95, 0.78, r, 0.18, P)
    _wheel_pair(B, M, -1.86, 0.72, r, 0.18, P, dual=True)
    B.box('frame', -2.95, 2.75, -0.42, 0.42, 0.58, 0.78, M['dark'], 0.01)
    B.hull('hood', [(x, y, z) for x in (1.7, 2.85) for y in (-0.45, 0.45) for z in (0.85, 1.48)], P, 0.03)
    B.box('grille', 2.85, 2.92, -0.42, 0.42, 0.8, 1.48, M['dark'], 0.01)
    for i in range(8):
        B.box('gl%d' % i, 2.92, 2.94, -0.4 + i * 0.11, -0.37 + i * 0.11, 0.84, 1.44, P, 0)
    for s in (-1, 1):   # угловатые крылья военного выпуска
        B.hull('fend%d' % s, [(x, y, z) for y in (s * 0.5, s * 1.08) for (x, z) in ((1.45, 0.98), (2.55, 0.98), (2.9, 0.75), (2.9, 0.72), (2.55, 0.94), (1.45, 0.94))], P, 0.005)
        B.box('step%d' % s, 0.55, 1.45, s * 0.85, s * 1.08, 0.7, 0.74, M['wood'], 0.01)
    headlight(B, M, 2.75, -0.7, 1.15, 0.09)   # одна фара (ЗиС-5В)
    # деревянная кабина
    wood_cab = mat_paint('zis_cab', '#4f5a36', 0.85, 0.4, 0, 0.35)
    B.box('cab', 0.65, 1.72, -1.0, 1.0, 0.9, 2.16, wood_cab, 0.02)
    B.box('cabr', 0.6, 1.78, -1.04, 1.04, 2.12, 2.18, wood_cab, 0.01)
    B.box('ws', 1.72, 1.74, -0.85, 0.85, 1.6, 2.05, M['glass'], 0)
    for s in (-1, 1):
        B.box('sw%d' % s, 0.95, 1.5, s * 1.0, s * 1.01, 1.6, 2.0, M['glass'], 0)
    _cargo(B, M, -3.0, 0.55, 1.11, 1.05, 0.55, M['wood'])
    for i, (x, y) in enumerate(((-2.5, -0.5), (-2.5, 0.2), (-1.9, -0.3), (-1.3, 0.4))):   # ящики со снарядами
        B.box('crate%d' % i, x, x + 0.5, y, y + 0.55, 1.05, 1.32, M['wood'], 0.01)


# ===================================================================== ОРУДИЯ
def _gun_wheels(B, M, P, y, r, w, spokes=False):
    for s in (-1, 1):
        B.roadwheel('gw%d' % s, 0, s * y, r, r, w, M['rubber'], P, s, 0.18 if not spokes else 0.12)
        if spokes:
            for i in range(8):
                a = i / 8 * math.pi
                B.box('sp%d%d' % (s, i), -0.02, 0.02, s * (y + w / 2), s * (y + w / 2 + 0.01), r - r * 0.85, r + r * 0.85, P, 0) if False else None
    B.tube('axle', (0, -y, r), (0, y, r), 0.05, 0.05, M['dark'], 10)


def _trails(B, M, P, axle_z, end_x, spread, w=0.13, h=0.16):
    for s in (-1, 1):
        B.beam('tr%d' % s, (-0.15, s * 0.18, axle_z - 0.12), (end_x, s * spread, 0.05), w, h, P, 0.01)
        B.box('spade%d' % s, end_x - 0.06, end_x + 0.06, s * spread - 0.22, s * spread + 0.22, 0.0, 0.3, P, 0.01)
        B.tube('hdl%d' % s, (end_x + 0.4, s * spread * 0.95, 0.24), (end_x + 0.4, s * (spread * 0.95 + 0.25), 0.3), 0.02, 0.02, M['steel'], 6)


def _pitched(B, P, x0, x1, z0, pitch, r0, r1, mat, name='barrel', segs=18):
    c, s = math.cos(pitch), math.sin(pitch)
    B.tube(name, (x0 * c, 0, z0 + x0 * s), (x1 * c, 0, z0 + x1 * s), r0, r1, mat, segs)
    return (x1 * c, z0 + x1 * s)


def pak40(root, fac):
    P, M = paint('ger'), mats()
    B = Builder(root, K)
    _gun_wheels(B, M, P, 0.92, 0.38, 0.16)
    _trails(B, M, P, 0.38, -3.1, 0.85)
    B.box('cradle', -0.7, 0.75, -0.13, 0.13, 0.6, 0.78, P, 0.02)
    B.tube('recup', (-0.6, 0, 0.62), (1.0, 0, 0.62), 0.085, 0.085, P, 14)
    B.box('breech', -0.85, -0.45, -0.16, 0.16, 0.66, 0.92, P, 0.02)
    end = barrel(B, P, M, -0.45, 3.45, 0.8, 0.075, 0.055, 'double')
    # двойной разнесённый щит со скошенным верхом
    for k, x in enumerate((0.25, 0.42)):
        prof = [(-1.0, 0.3), (1.0, 0.3), (1.0, 0.95 - k * 0.05), (0.25, 1.2 - k * 0.1), (-0.25, 1.2 - k * 0.1), (-1.0, 0.95 - k * 0.05)]
        B.hull('sh%d' % k, [(x + (z - 0.3) * -0.25, y, z) for (y, z) in prof] + [(x + 0.012 + (z - 0.3) * -0.25, y, z) for (y, z) in prof], P, 0.005)
    B.box('sight', -0.1, 0.1, -0.3, -0.22, 0.95, 1.05, M['dark'], 0)
    B.tube('hw', (-0.3, -0.3, 0.75), (-0.3, -0.36, 0.75), 0.11, 0.11, M['steel'], 12)
    return {'mr': end, 'mz': 0.8}


def m1_57(root, fac):
    P, M = paint('usa'), mats()
    B = Builder(root, K)
    _gun_wheels(B, M, P, 0.82, 0.38, 0.2)
    _trails(B, M, P, 0.38, -2.7, 0.75, 0.1, 0.12)
    B.box('cradle', -0.6, 0.6, -0.11, 0.11, 0.62, 0.78, P, 0.02)
    B.box('breech', -0.75, -0.4, -0.13, 0.13, 0.68, 0.92, P, 0.02)
    end = barrel(B, P, M, -0.4, 2.82, 0.82, 0.06, 0.042, None)
    B.hull('shield', [(x, y, z) for (y, z) in ((-0.85, 0.32), (0.85, 0.32), (0.85, 1.25), (-0.85, 1.25)) for x in (0.32, 0.34)], P, 0.005)
    for s in (-1, 1):
        B.hull('wing%d' % s, [(x, y, z) for (x, y) in ((0.33, s * 0.85), (0.15, s * 1.0)) for z in (0.32, 1.1)] + [(0.15, s * 1.0, 1.1), (0.15, s * 1.0, 0.32)], P, 0.005)
    B.hull('flap', [(x, y, z) for y in (-0.85, 0.85) for (x, z) in ((0.34, 0.32), (0.5, 0.05), (0.52, 0.05), (0.36, 0.32))], P, 0.005)
    return {'mr': end, 'mz': 0.82}


def zis3(root, fac):
    P, M = paint('ussr'), mats()
    B = Builder(root, K)
    _gun_wheels(B, M, P, 0.72, 0.42, 0.17)
    for s in (-1, 1):   # трубчатые станины
        B.tube('tr%d' % s, (-0.2, s * 0.15, 0.32), (-3.0, s * 0.78, 0.08), 0.07, 0.06, P, 12)
        B.box('spade%d' % s, -3.08, -2.95, s * 0.78 - 0.2, s * 0.78 + 0.2, 0.0, 0.32, P, 0.01)
    B.box('cradle', -0.65, 0.7, -0.12, 0.12, 0.66, 0.84, P, 0.02)
    B.box('breech', -0.85, -0.45, -0.15, 0.15, 0.72, 0.98, P, 0.02)
    end = barrel(B, P, M, -0.45, 3.0, 0.88, 0.07, 0.055, 'slotted')
    B.hull('shield', [(x, y, z) for (y, z) in ((-0.78, 0.55), (0.78, 0.55), (0.78, 1.15), (0.35, 1.37), (-0.35, 1.37), (-0.78, 1.15)) for x in (0.32, 0.345)], P, 0.005)
    B.hull('apron', [(x, y, z) for y in (-0.6, 0.6) for (x, z) in ((0.36, 0.5), (0.4, 0.18), (0.42, 0.18), (0.38, 0.5))], P, 0.005)
    return {'mr': end, 'mz': 0.88}


def lefh18(root, fac):
    P, M = paint('ger'), mats()
    B = Builder(root, K)
    _gun_wheels(B, M, P, 0.92, 0.65, 0.15)
    _trails(B, M, P, 0.65, -3.65, 0.95, 0.18, 0.22)
    pitch = math.radians(8)
    z0 = 1.2
    B.box('cradle', -0.6, 0.8, -0.16, 0.16, 0.95, 1.12, P, 0.02)
    _pitched(B, P, -0.75, -0.35, z0, pitch, 0.2, 0.2, P, 'breech', 12)
    _pitched(B, P, -0.4, 1.4, z0 + 0.25, pitch, 0.08, 0.08, P, 'recup', 12)
    ex, ez = _pitched(B, P, -0.35, 2.6, z0, pitch, 0.1, 0.085, P)
    B.hull('shield', [(x, y, z) for (y, z) in ((-0.95, 0.75), (0.95, 0.75), (0.95, 1.6), (0.3, 1.88), (-0.3, 1.88), (-0.95, 1.6)) for x in (0.45, 0.47)], P, 0.005)
    return {'mr': ex, 'mz': ez}


def m2a1(root, fac):
    P, M = paint('usa'), mats()
    B = Builder(root, K)
    _gun_wheels(B, M, P, 0.95, 0.45, 0.24)
    _trails(B, M, P, 0.45, -3.5, 1.0, 0.14, 0.18)
    pitch = math.radians(8)
    z0 = 1.1
    B.box('cradle', -0.6, 0.6, -0.15, 0.15, 0.82, 1.0, P, 0.02)
    _pitched(B, P, -0.8, -0.4, z0, pitch, 0.19, 0.19, P, 'breech', 12)
    _pitched(B, P, -0.4, 1.0, z0 - 0.22, pitch, 0.09, 0.09, P, 'recup', 12)
    ex, ez = _pitched(B, P, -0.4, 1.95, z0, pitch, 0.09, 0.08, P)
    B.hull('shield', [(x, y, z) for (y, z) in ((-0.78, 0.55), (0.78, 0.55), (0.78, 1.4), (-0.78, 1.4)) for x in (0.42, 0.44)], P, 0.005)
    return {'mr': ex, 'mz': ez}


def m30(root, fac):
    P, M = paint('ussr'), mats()
    B = Builder(root, K)
    _gun_wheels(B, M, P, 0.88, 0.55, 0.18)
    _trails(B, M, P, 0.55, -3.45, 0.95, 0.16, 0.2)
    pitch = math.radians(10)
    z0 = 1.2
    _pitched(B, P, -0.9, 1.3, z0 - 0.26, pitch, 0.14, 0.14, P, 'cradle', 14)
    _pitched(B, P, -0.8, -0.35, z0, pitch, 0.2, 0.2, P, 'breech', 12)
    ex, ez = _pitched(B, P, -0.35, 2.45, z0, pitch, 0.105, 0.09, P)
    B.hull('shield', [(x, y, z) for (y, z) in ((-0.95, 0.75), (0.95, 0.75), (0.95, 1.55), (0.25, 1.72), (-0.25, 1.72), (-0.95, 1.55)) for x in (0.45, 0.47)], P, 0.005)
    B.hull('apron', [(x, y, z) for y in (-0.7, 0.7) for (x, z) in ((0.47, 0.72), (0.52, 0.3), (0.54, 0.3), (0.49, 0.72))], P, 0.005)
    return {'mr': ex, 'mz': ez}


# ===================================================================== НАВЕСНОЕ И МЕЛКИЕ ДЕТАЛИ
# Всё, что делает машину «настоящей», а не игрушечной: брезент, ящики, канистры, шанцевый
# инструмент, запасные траки, болты, перископы, рымы, антенны. Координаты — в метрах.

def kit_bolts(B, mat, x0, x1, y, z, n, side, r=0.028):
    """Ряд болтов на вертикальном листе (выступают наружу по y)."""
    for i in range(n):
        x = x0 + (x1 - x0) * i / max(1, n - 1)
        B.tube('blt', (x, y, z), (x, y + side * 0.03, z), r, r * 0.8, mat, 6)


def kit_bolts_top(B, mat, pts, z, r=0.028):
    for (x, y) in pts:
        B.tube('bltt', (x, y, z), (x, y, z + 0.03), r, r * 0.8, mat, 6)


def kit_bolt_frame(B, mat, x0, x1, y0, y1, z, step=0.22):
    """Болты по периметру съёмного листа на крыше."""
    pts = []
    nx, ny = max(2, int((x1 - x0) / step) + 1), max(2, int((y1 - y0) / step) + 1)
    for i in range(nx):
        x = x0 + (x1 - x0) * i / (nx - 1); pts += [(x, y0), (x, y1)]
    for j in range(1, ny - 1):
        y = y0 + (y1 - y0) * j / (ny - 1); pts += [(x0, y), (x1, y)]
    kit_bolts_top(B, mat, pts, z, 0.024)


def kit_links_side(B, M, x0, y, z0, n, side, h=0.42, pitch=0.2):
    """Запасные траки, повешенные вертикально на борт."""
    for i in range(n):
        x = x0 + i * pitch
        B.box('lk', x, x + pitch * 0.86, y, y + side * 0.045, z0, z0 + h, M['link'], 0.004)
        B.box('lkg', x + pitch * 0.3, x + pitch * 0.56, y + side * 0.04, y + side * 0.09, z0 + h * 0.35, z0 + h * 0.65, M['link'], 0.004)


def kit_links_flat(B, M, x0, y0, y1, z, n, pitch=0.2):
    """Траки, уложенные плашмя (на крыле, на корме)."""
    for i in range(n):
        x = x0 + i * pitch
        B.box('lkf', x, x + pitch * 0.86, y0, y1, z, z + 0.045, M['link'], 0.004)
        B.box('lkfg', x + pitch * 0.3, x + pitch * 0.56, (y0 + y1) / 2 - 0.04, (y0 + y1) / 2 + 0.04, z + 0.04, z + 0.1, M['link'], 0.004)


def kit_tarp(B, M, cv, x, y0, y1, z, r=0.15):
    """Скатанный брезент поперёк корпуса с ремнями."""
    B.tube('tarp', (x, y0, z + r), (x, y1, z + r), r, r * 0.95, cv, 14)
    for t in (0.22, 0.78):
        y = y0 + (y1 - y0) * t
        B.tube('tstr', (x, y - 0.025, z + r), (x, y + 0.025, z + r), r * 1.06, r * 1.06, M['strap'], 14)


def kit_tarp_x(B, M, cv, x0, x1, y, z, r=0.13):
    """Скатанный брезент вдоль борта."""
    B.tube('tarpx', (x0, y, z + r), (x1, y, z + r), r, r * 0.95, cv, 14)
    for t in (0.2, 0.8):
        x = x0 + (x1 - x0) * t
        B.tube('tstrx', (x - 0.025, y, z + r), (x + 0.025, y, z + r), r * 1.06, r * 1.06, M['strap'], 14)


def kit_jerrycan(B, mat, M, x, y, z, along_x=True):
    w, d, h = (0.35, 0.165, 0.47) if along_x else (0.165, 0.35, 0.47)
    B.box('jc', x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + h, mat, 0.02)
    B.box('jch', x - 0.04, x + 0.04, y - 0.05, y + 0.05, z + h, z + h + 0.05, M['steel'], 0.004)


def kit_box(B, P, M, x0, x1, y0, y1, z0, z1):
    """Ящик ЗИП с крышкой и замками."""
    B.box('zip', x0, x1, y0, y1, z0, z1, P, 0.015)
    B.box('zipl', x0 - 0.01, x1 + 0.01, y0 - 0.01, y1 + 0.01, z1 - 0.05, z1 - 0.035, M['dark'], 0)
    yc = y0 if abs(y0) > abs(y1) else y1
    for t in (0.25, 0.75):
        x = x0 + (x1 - x0) * t
        B.box('zipk', x - 0.03, x + 0.03, yc - 0.015, yc + 0.015, z1 - 0.12, z1 - 0.05, M['steel'], 0)


def kit_tools(B, M, x0, y, z, side=1):
    """Шанцевый инструмент плашмя: лопата, лом, топор, кувалда."""
    W, S = M['wood'], M['steel']
    dy = side * 0.09
    B.beam('shv', (x0, y, z), (x0 + 0.85, y, z), 0.045, 0.04, W, 0.005)
    B.box('shvb', x0 + 0.85, x0 + 1.12, y - 0.1, y + 0.1, z, z + 0.025, S, 0.005)
    B.tube('crow', (x0 - 0.1, y + dy, z + 0.025), (x0 + 1.15, y + dy, z + 0.025), 0.022, 0.022, S, 6)
    B.beam('axe', (x0 + 0.1, y + 2 * dy, z), (x0 + 0.75, y + 2 * dy, z), 0.045, 0.04, W, 0.005)
    B.box('axeh', x0 + 0.66, x0 + 0.78, y + 2 * dy - 0.03, y + 2 * dy + 0.1 * side, z, z + 0.04, S, 0.004)
    for x in (x0 + 0.15, x0 + 0.95):   # скобы крепления
        B.box('clip', x - 0.02, x + 0.02, y - 0.06, y + 2.3 * dy, z + 0.04, z + 0.06, S, 0)


def kit_periscope(B, P, M, x, y, z, a=0.0):
    B.box('per', x - 0.07, x + 0.07, y - 0.09, y + 0.09, z, z + 0.1, P, 0.01)
    B.box('perg', x + 0.06, x + 0.075, y - 0.07, y + 0.07, z + 0.03, z + 0.08, M['glass'], 0)


def kit_hooks(B, M, pts, z):
    """Рымы (подъёмные проушины) на башне/корпусе."""
    for (x, y) in pts:
        B.tube('hk', (x - 0.06, y, z + 0.06), (x + 0.06, y, z + 0.06), 0.045, 0.045, M['steel'], 8)
        B.box('hkb', x - 0.05, x + 0.05, y - 0.02, y + 0.02, z, z + 0.05, M['steel'], 0)


def kit_antenna(B, M, x, y, z, h=2.0):
    B.tube('antb', (x, y, z), (x, y, z + 0.12), 0.05, 0.04, M['dark'], 8)
    B.tube('ant', (x, y, z + 0.12), (x, y, z + h), 0.016, 0.01, M['dark'], 6)


def kit_log(B, M, x0, x1, y, z, r=0.12):
    B.tube('logx', (x0, y, z + r), (x1, y, z + r), r, r * 0.9, M['wood'], 10)


def kit_cable_loops(B, M, x0, x1, y, z):
    """Буксирный трос с петлями на концах вдоль борта."""
    B.tube('cbl', (x0, y, z), (x1, y, z), 0.03, 0.03, M['steel'], 6)
    for x in (x0, x1):
        B.tube('cbll', (x - 0.12, y, z), (x + 0.12, y, z), 0.06, 0.06, M['steel'], 8)


def kit_weld(B, P, p0, p1):
    B.tube('weld', p0, p1, 0.016, 0.016, P, 6)


# ---------- по машинам
def det_tiger(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    for s in (-1, 1):
        kit_periscope(B, P, M, 2.2, s * 0.75, 1.86)
        kit_tools(B, M, -1.0, s * 1.68, 1.16, s)               # на крыльях
        kit_bolts(B, P, -2.9, 2.3, s * 1.6, 1.8, 18, s)          # крыша на болтах по кромке
    kit_bolt_frame(B, P, -2.0, -1.15, -0.85, 0.85, 1.86)
    kit_tarp(B, M, cv, -2.9, -1.1, 1.1, 1.86, 0.16)
    kit_box(B, P, M, -3.3, -3.15, -1.2, -0.4, 0.8, 1.15)       # ящик на корме
    B.tube('jack', (-3.22, 0.3, 0.75), (-3.22, 0.3, 1.1), 0.09, 0.09, M['steel'], 10)
    kit_antenna(B, M, -2.6, 1.2, 1.86, 2.0)
    kit_hooks(T, M, [(0.6, 0.75), (0.6, -0.75), (-1.0, 0.0)], 2.68)
    kit_bolts_top(T, P, [(0.75, y) for y in (-0.6, -0.3, 0.3, 0.6)], 2.68)


def det_pz4(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    for s in (-1, 1):
        kit_periscope(B, P, M, 2.15, s * 0.6, 1.72)
    kit_tarp(B, M, cv, -2.75, -1.0, 1.0, 1.72, 0.15)
    kit_jerrycan(B, M['can_ger'], M, -2.2, 0.75, 1.72); kit_jerrycan(B, M['can_ger'], M, -2.2, 0.55, 1.72)
    kit_box(B, P, M, -2.9, -2.4, 1.02, 1.4, 1.07, 1.35)
    kit_tools(B, M, 0.4, -1.2, 1.07, -1)
    kit_bolt_frame(B, P, -2.6, -1.4, -0.8, 0.8, 1.72)
    for i in range(2):   # запасные катки на корме
        B.tube('srw%d' % i, (-3.0, -0.45 + i * 0.6, 1.3), (-3.08, -0.45 + i * 0.6, 1.3), 0.235, 0.235, M['rubber'], 18)
        B.tube('srwd%d' % i, (-3.07, -0.45 + i * 0.6, 1.3), (-3.1, -0.45 + i * 0.6, 1.3), 0.2, 0.2, P, 18)
    kit_antenna(B, M, -2.4, 1.2, 1.72, 2.0)
    kit_hooks(T, M, [(0.4, 0.8), (0.4, -0.8)], 2.4)


def det_luchs(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    kit_tarp(B, M, cv, -2.15, -0.9, 0.9, 1.52, 0.13)
    kit_jerrycan(B, M['can_ger'], M, -1.6, 0.95, 1.52); kit_jerrycan(B, M['can_ger'], M, -1.6, -0.95, 1.52)
    kit_tools(B, M, -0.9, -1.02, 1.53, -1)
    kit_periscope(B, P, M, 1.5, -0.5, 1.55)
    kit_antenna(B, M, -1.9, 1.0, 1.52, 1.6)
    kit_bolts(B, P, -2.2, 1.6, 1.22, 1.45, 14, 1); kit_bolts(B, P, -2.2, 1.6, -1.22, 1.45, 14, -1)


def det_sherman(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    for s in (-1, 1):
        kit_links_side(B, M, 0.45, s * 1.31, 1.2, 4, s)
        kit_jerrycan(B, M['can_usa'], M, -2.95, s * 0.75, 0.98, False)
        kit_tools(B, M, -1.3, s * 1.12, 2.0, s)
        kit_bolts(B, P, 2.5, 2.5, s * 1.0, 0.75, 1, s)
    kit_bolts_top(B, P, [(2.45, y) for y in (-0.9, -0.6, -0.3, 0.0, 0.3, 0.6, 0.9)], 1.17)   # фланец картера
    kit_tarp(B, M, cv, -2.2, -1.0, 1.0, 2.0, 0.16)
    kit_bolt_frame(B, P, -2.6, -1.3, -0.95, 0.95, 2.0)
    kit_hooks(B, M, [(1.7, 1.15), (1.7, -1.15), (-2.5, 1.15), (-2.5, -1.15)], 2.0)
    kit_hooks(T, M, [(0.3, 0.7), (0.3, -0.7), (-0.9, 0.6)], 2.72)
    kit_periscope(T, P, M, 0.2, -0.45, 2.72)
    kit_antenna(T, M, -1.05, -0.45, 2.55, 2.1)


def det_stuart(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    kit_tarp(B, M, cv, -2.15, -0.8, 0.8, 1.6, 0.13)
    kit_jerrycan(B, M['can_usa'], M, -2.42, 0.5, 0.92, False); kit_jerrycan(B, M['can_usa'], M, -2.42, -0.5, 0.92, False)
    kit_tools(B, M, -0.9, 0.78, 1.6, 1)
    for s in (-1, 1):
        kit_bolts(B, P, -2.2, 1.0, s * 1.1, 1.0, 12, s)
        kit_periscope(B, P, M, 1.2, s * 0.4, 1.62)
    kit_antenna(B, M, -1.9, 0.75, 1.6, 1.8)
    kit_hooks(T, M, [(0.2, 0.55), (0.2, -0.55)], 2.18)


def det_pershing(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    for s in (-1, 1):
        kit_tools(B, M, 0.0, s * 1.6, 1.04, s)
        kit_jerrycan(B, M['can_usa'], M, -2.75, s * 1.62, 1.04)
        kit_periscope(B, P, M, 2.25, s * 0.6, 1.85)
    kit_links_flat(B, M, 2.75, -1.3, -0.8, 1.06, 4)
    kit_tarp(B, M, cv, -2.95, -1.2, 1.2, 1.85, 0.16)
    kit_bolt_frame(B, P, -2.8, -1.2, -1.1, 1.1, 1.85)
    kit_hooks(T, M, [(0.5, 0.85), (0.5, -0.85), (-1.2, 0.0)], 2.63)
    kit_antenna(T, M, -1.3, -0.5, 2.5, 2.1)


def det_t34(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    for s in (-1, 1):
        kit_box(B, P, M, 0.9, 1.6, s * 1.18, s * 1.48, 0.93, 1.25)    # ящики ЗИП на надгусеничных полках
        kit_cable_loops(B, M, -1.9, 0.6, s * 1.42, 1.07)
        kit_weld(B, P, (-2.4, s * 1.0, 1.62), (1.85, s * 1.0, 1.62))
    kit_tarp(B, M, cv, -2.15, -0.85, 0.85, 1.62, 0.15)
    kit_bolt_frame(B, P, -2.3, -1.2, -0.75, 0.75, 1.65)
    kit_bolts_top(B, P, [(-2.6, y) for y in (-0.6, -0.3, 0.0, 0.3, 0.6)], 1.55)
    kit_tools(B, M, -0.2, -1.32, 1.12, -1)
    kit_hooks(T, M, [(0.55, 0.85), (0.55, -0.85), (-1.25, 0.6), (-1.25, -0.6)], 2.42)
    kit_antenna(T, M, 0.55, 0.92, 2.2, 2.0)
    kit_periscope(T, P, M, 0.45, -0.55, 2.42)


def det_is2(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    for s in (-1, 1):
        kit_links_flat(B, M, 2.62, s * 1.34, s * 1.6, 1.03, 3) if s > 0 else kit_links_flat(B, M, 2.62, -1.6, -1.34, 1.03, 3)
        kit_bolts(B, P, -2.7, 2.2, s * 1.15, 1.58, 20, s)
        kit_weld(B, P, (-2.7, s * 1.15, 1.62), (2.2, s * 1.15, 1.62))
    kit_tools(B, M, -0.95, -1.36, 1.03, -1)
    kit_box(B, P, M, -0.9, -0.2, 1.3, 1.6, 1.03, 1.28)
    kit_tarp(B, M, cv, -2.85, -0.9, 0.9, 1.62, 0.16)
    kit_bolt_frame(B, P, -2.6, -1.35, -0.85, 0.85, 1.65)
    kit_periscope(B, P, M, 2.1, -0.35, 1.62)
    kit_hooks(T, M, [(0.6, 0.95), (0.6, -0.95), (-1.4, 0.6), (-1.4, -0.6)], 2.5)
    kit_antenna(T, M, 0.45, 1.05, 2.45, 2.0)
    kit_periscope(T, P, M, 0.5, 0.55, 2.5)


def det_t70(B, T, P, M, fac):
    cv = M['canvas_' + fac]
    kit_tarp(B, M, cv, -1.75, -0.75, 0.75, 1.3, 0.12)
    kit_tools(B, M, -1.2, 1.09, 0.85, 1)
    kit_box(B, P, M, 0.6, 1.2, -1.0, -1.18, 0.85, 1.08)
    for s in (-1, 1):
        B.tube('ftk%d' % s, (-2.15, s * 0.75, 0.62), (-2.55, s * 0.75, 0.62), 0.14, 0.14, P, 14)
        kit_bolts(B, P, -1.8, 1.3, s * 1.0, 1.15, 12, s)
    kit_bolt_frame(B, P, -1.9, -1.0, -0.6, 0.6, 1.33)
    kit_hooks(T, M, [(0.3, 0.45), (0.3, -0.45)], 1.9)


DETAILS = {'tiger': det_tiger, 'pz4': det_pz4, 'luchs': det_luchs, 'sherman': det_sherman, 'stuart': det_stuart,
           'pershing': det_pershing, 't34': det_t34, 'is2': det_is2, 't70': det_t70}


def with_details(fn):
    det = DETAILS[fn.__name__]
    def f(hr, tr, fac):
        m = fn(hr, tr, fac)
        det(Builder(hr, K), Builder(tr, K), paint(fac), mats(), fac)
        return m
    return f


VEHICLES = {
    'ger_light': ('tank', with_details(luchs)), 'ger_medium': ('tank', with_details(pz4)), 'ger_heavy': ('tank', with_details(tiger)),
    'usa_light': ('tank', with_details(stuart)), 'usa_medium': ('tank', with_details(sherman)), 'usa_heavy': ('tank', with_details(pershing)),
    'ussr_light': ('tank', with_details(t70)), 'ussr_medium': ('tank', with_details(t34)), 'ussr_heavy': ('tank', with_details(is2)),
    'ger_truck': ('obj', opel_blitz), 'usa_truck': ('obj', gmc), 'ussr_truck': ('obj', zis5),
    'ger_atgun': ('obj', pak40), 'usa_atgun': ('obj', m1_57), 'ussr_atgun': ('obj', zis3),
    'ger_howitzer': ('obj', lefh18), 'usa_howitzer': ('obj', m2a1), 'ussr_howitzer': ('obj', m30),
}
