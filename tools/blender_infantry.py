# Пехота v2: анатомия, снаряжение по армиям, детальное оружие, живые циклы движения.
# Подключается из blender_units.py через exec (использует Builder, mat_paint, mat_flat, lin, ik, INF_COL).
# Координаты как у остальных моделей: x — вперёд, y — вправо (Builder сам переворачивает), z — вверх.

POSES = ['stand', 'aim', 'throw', 'prone'] + ['w%d' % i for i in range(8)] + ['c%d' % i for i in range(4)]


def _rot(v, lean, twist=0.0):
    """наклон корпуса вперёд (вокруг y) и поворот плеч (вокруг z)"""
    c, s = math.cos(lean), math.sin(lean)
    x, y, z = v.x * c + v.z * s, v.y, -v.x * s + v.z * c
    c2, s2 = math.cos(twist), math.sin(twist)
    return Vector((x * c2 - y * s2, x * s2 + y * c2, z))


def build_soldier(fac, wt, pose, root):
    B = Builder(root)
    uni, helm, gear = INF_COL[fac]
    if wt == 'sniper':
        uni = {'ger': '#4f5a40', 'usa': '#5a5e3c', 'ussr': '#56603a'}[fac]
    m_uni = mat_paint('uni_' + fac + wt, uni, 0.92, 0.38, 0, 0.3)
    m_uni2 = mat_paint('uni2_' + fac + wt, {'ger': '#565a4c', 'usa': '#6a6448', 'ussr': '#6e6a46'}[fac] if wt != 'sniper' else uni, 0.92, 0.45, 0, 0.3)
    m_helm = mat_paint('helm_' + fac, helm, 0.55, 0.15, 0, 0.3)
    m_gear = mat_paint('gear_' + fac, gear, 0.85, 0.15, 0, 0.25)
    m_web = mat_paint('web_' + fac, {'ger': '#2b241c', 'usa': '#7a6e4c', 'ussr': '#4a3a26'}[fac], 0.7, 0.1, 0, 0.2)
    m_skin = mat_flat('skin', lin('#c99a76'), 0.6)
    m_skin2 = mat_flat('skin2', lin('#b08060'), 0.6)
    m_boot = mat_paint('boot', '#2a2018', 0.5, 0.25, 0, 0.3)
    m_legg = mat_paint('legg', '#9c8f68', 0.9, 0.35, 0, 0.25)
    m_wood = mat_paint('gunwood', '#5a3e26', 0.55, 0.05, 0, 0.2)
    m_metal = mat_flat('gunmetal', (0.03, 0.03, 0.032, 1), 0.38, 0.8)
    m_canv = mat_paint('canv_' + fac, {'ger': '#6a6650', 'usa': '#6e6a4c', 'ussr': '#646044'}[fac], 0.9, 0.3, 0, 0.25)
    m_roll = mat_paint('roll', '#5e5a44', 0.95, 0.3, 0, 0.3)
    V = lambda x, y, z: Vector((x, y, z))
    T3 = lambda v: tuple(v)

    def limb(name, a, b, r0, r1, mat, segs=12):
        B.tube(name, T3(a), T3(b), r0, r1, mat, segs)

    def ball(name, c, r, mat, sx=1.0, sy=1.0, sz=1.0):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r,
                                  matrix=Matrix.Translation(B.G(*c)) @ Matrix.Diagonal((sx, sy, sz, 1)))
        B._obj(name, bm, mat, 0, 60)

    def ring(z, ax, ay, n=12, x0=0.0, flat_back=1.0):
        out = []
        for i in range(n):
            a = i / n * 2 * math.pi
            x = math.cos(a) * ax
            if x < 0: x *= flat_back
            out.append(V(x0 + x, math.sin(a) * ay, z))
        return out

    # ------------------------------------------------------------ скелет по позе
    prone = pose == 'prone'
    crawl = pose.startswith('c')
    walk = pose.startswith('w')
    low = prone or crawl
    ph = (int(pose[1]) / 8.0) if walk else ((int(pose[1]) + 0.5) / 4.0 if crawl else 0.0)
    twist = 0.0
    if low:
        lean = math.radians(84)
        sway = math.sin(ph * 2 * math.pi) * 0.25 if crawl else 0.0
        pelvis = V(-2.4, sway, 1.0)
        twist = math.sin(ph * 2 * math.pi) * math.radians(6) if crawl else 0.0
    else:
        legs = []
        for side, off in ((-1, 0.0), (1, 0.5)):
            hip = V(0, side * 0.62, 0)
            if walk:
                f = (ph + off) * 2 * math.pi
                a = math.radians(32) * math.sin(f) + math.radians(6)
                swing = max(0.0, math.cos(f))           # нога идёт вперёд по воздуху — колено сгибается сильнее
                bend = math.radians(18) + math.radians(78) * swing ** 1.3
                if math.sin(f) < -0.3: bend = math.radians(10) + math.radians(30) * swing   # толчок назад
                foot_p = (a - bend) * 0.6 + (math.radians(25) if math.sin(f) < -0.5 else 0)
            elif pose == 'aim':
                a = math.radians(16 if side < 0 else -10); bend = math.radians(8); foot_p = 0
            elif pose == 'throw':
                a = math.radians(24 if side < 0 else -18); bend = math.radians(14 if side < 0 else 4); foot_p = 0
            else:
                a = math.radians(3 if side < 0 else -2); bend = math.radians(4 if side < 0 else 9); foot_p = 0
            knee = hip + V(math.sin(a), 0, -math.cos(a)) * 2.65
            ank = knee + V(math.sin(a - bend), 0, -math.cos(a - bend)) * 2.55
            legs.append([hip, knee, ank, foot_p, side])
        # ступня: пятка и носок; самая низкая точка — на земле
        def foot_pts(ank, fp):
            fwd = V(math.cos(fp), 0, -math.sin(fp))
            dn = V(math.sin(fp), 0, math.cos(fp))
            return ank - fwd * 0.45 - dn * 0.42, ank + fwd * 1.0 - dn * 0.4
        lows = []
        for hip, knee, ank, fp, sd in legs:
            h_, t_ = foot_pts(ank, fp); lows += [h_.z, t_.z]
        lift = -min(lows)
        if walk: lift += 0.32 * max(0.0, math.cos(ph * 4 * math.pi))   # фаза полёта бегуна
        for l in legs:
            for j in range(3): l[j] = l[j] + V(0, 0, lift)
        pelvis = V(0, 0, lift + 0.1)
        if walk:
            lean = math.radians(16); twist = math.sin(ph * 2 * math.pi) * math.radians(9)
        elif pose == 'throw':
            lean = math.radians(-14); twist = math.radians(-28)
        elif pose == 'aim':
            lean = math.radians(6); twist = math.radians(-12)
        else:
            lean = math.radians(4)
    T = lambda x, y, z: pelvis + _rot(V(x, y, z), lean, twist)          # точка в системе корпуса
    TP = lambda x, y, z: pelvis + _rot(V(x, y, z), lean * (0.25 if not low else 1.0), twist * 0.3)   # таз

    # ------------------------------------------------------------ туловище
    long_tunic = fac in ('ger', 'ussr')
    B.hull('hips', [TP(*p) for p in ring(0.35, 0.55, 0.86, 10) + ring(-0.55, 0.58, 0.98, 10)], m_uni2, 0.1, 50)
    torso = ring(0.25, 0.6, 0.9, 12) + ring(1.5, 0.66, 1.0, 12, 0.05) + ring(2.6, 0.68, 1.12, 12, 0.08) + ring(3.2, 0.5, 1.05, 12, 0.02)
    B.hull('torso', [T(*p) for p in torso], m_uni, 0.1, 50)
    skirt_z = -1.2 if long_tunic else -0.7
    B.hull('skirt', [T(*p) for p in ring(0.3, 0.64, 0.94, 12) + ring(skirt_z, 0.72, 1.02, 12)], m_uni, 0.05, 50)
    # карманы на груди, воротник
    for sd in (-1, 1):
        c = T(0.66, sd * 0.5, 2.2)
        B.hull('pocket%d' % sd, [T(0.62 + dx, sd * 0.5 + dy, 2.2 + dz) for dx in (0, 0.14) for dy in (-0.28, 0.28) for dz in (-0.35, 0.3)], m_uni, 0.04)
    B.hull('collar', [T(*p) for p in ring(3.2, 0.5, 0.62, 10) + ring(3.5, 0.45, 0.55, 10)], m_uni, 0.04, 50)
    neck = T(0.05, 0, 3.5)
    if low:
        head = neck + V(0.7, 0, 0.5)
    elif pose == 'throw':
        head = neck + V(0.0, 0, 0.75)
    else:
        head = neck + _rot(V(0.12, 0, 0.72), -lean * 0.6, twist * 0.5)
    limb('neck', neck, head, 0.33, 0.3, m_skin)
    ball('head', head + V(0, 0, 0.05), 0.66, m_skin, 1.02, 0.94, 1.1)
    fdir = (head - neck); fdir.z = 0
    fdir = fdir.normalized() if fdir.length > 0.05 else V(1, 0, 0)
    if low: fdir = V(1, 0, 0)
    ball('nose', head + fdir * 0.66 + V(0, 0, -0.02), 0.14, m_skin2)
    for sd in (-1, 1): ball('ear%d' % sd, head + V(-fdir.y, fdir.x, 0) * 0.58 * sd, 0.12, m_skin2, 0.6, 1, 1)

    # каска
    def helmet(kind):
        hc = head + V(0, 0, 0.3)
        fw = fdir
        sideV = V(-fw.y, fw.x, 0)
        def P(x, y, z): return hc + fw * x + sideV * y + V(0, 0, z)
        if kind == 'ger':     # штальхельм: козырёк и опущенные «уши»
            pts = []
            for i in range(18):
                a = i / 18 * 2 * math.pi
                for (r, z) in ((0.98, -0.62), (0.9, -0.1), (0.82, 0.32), (0.5, 0.68)):
                    x, y = math.cos(a) * r, math.sin(a) * r
                    zz = z
                    if z < -0.5 and x > 0.3: zz = -0.28                 # над лицом выше
                    if z < -0.5 and x < -0.3: zz = -0.85                # сзади ниже
                    rr = 1.12 if z < -0.5 else 1.0
                    pts.append(P(x * rr, y * rr, zz))
            B.hull('helmet', pts, m_helm, 0.04, 40)
        elif kind == 'usa':   # M1: округлая, с ровным краем и сеткой-ремешком
            pts = [P(math.cos(a) * r, math.sin(a) * r, z) for a in [i / 18 * 2 * math.pi for i in range(18)]
                   for (r, z) in ((1.12, -0.18), (1.06, -0.05), (0.92, 0.38), (0.55, 0.7))]
            B.hull('helmet', pts, m_helm, 0.04, 40)
            for sd in (-1, 1):
                limb('chin%d' % sd, P(0, sd * 0.95, -0.15), P(0.2, sd * 0.5, -0.75), 0.05, 0.05, m_web, 6)
        else:                  # СШ-40: глубокая, с небольшим полем
            pts = [P(math.cos(a) * r, math.sin(a) * r, z) for a in [i / 18 * 2 * math.pi for i in range(18)]
                   for (r, z) in ((1.04, -0.28), (0.98, -0.12), (0.88, 0.36), (0.52, 0.7))]
            B.hull('helmet', pts, m_helm, 0.04, 40)
            ball('star', P(0.98, 0, 0.12), 0.1, mat_flat('starred', lin('#8a2a1c'), 0.5), 0.4, 1, 1)
    helmet(fac)

    # ------------------------------------------------------------ ноги
    m_shin = m_legg if fac == 'usa' else m_boot
    if not low:
        for i, (hip, knee, ank, fp, sd) in enumerate(legs):
            hipw = TP(0, sd * 0.6, -0.15)
            limb('thigh%d' % i, hipw, knee, 0.66, 0.5, m_uni2)
            if fac == 'ussr':   # галифе
                mid = hipw.lerp(knee, 0.45) + V(0, sd * 0.18, 0)
                ball('galife%d' % i, mid, 0.62, m_uni2, 1, 1.05, 1.25)
            ball('knee%d' % i, knee, 0.5, m_uni2)
            top = knee.lerp(ank, 0.08 if fac != 'usa' else 0.12)
            limb('shin%d' % i, top, ank, 0.5, 0.42, m_shin)
            if fac == 'usa':
                limb('bootc%d' % i, knee.lerp(ank, 0.82), ank, 0.45, 0.43, m_boot)
            if fac == 'ger':   # раструб голенища
                limb('cuff%d' % i, knee.lerp(ank, 0.06), knee.lerp(ank, 0.22), 0.54, 0.5, m_boot)
            fwd = V(math.cos(fp), 0, -math.sin(fp)); dn = V(math.sin(fp), 0, math.cos(fp)); sv = V(0, 1, 0)
            pts = []
            for along, w, zb, zt in ((-0.45, 0.3, -0.42, 0.15), (0.2, 0.36, -0.42, 0.05), (0.85, 0.3, -0.4, -0.12), (1.02, 0.18, -0.38, -0.2)):
                for s2 in (-1, 1):
                    for zz in (zb, zt):
                        pts.append(ank + fwd * along + sv * s2 * w + dn * zz)
            B.hull('boot%d' % i, pts, m_boot, 0.06, 40)
    else:
        for i, sd in enumerate((-1, 1)):
            hip = TP(0, sd * 0.6, -0.3) + V(0, 0, -0.1)
            if crawl:
                u = max(0.0, math.sin((ph + (0 if sd < 0 else 0.5)) * 2 * math.pi))   # колено подтянуто
                knee = hip + V(-2.5 + 1.5 * u, sd * (0.35 + 1.1 * u), -0.3)
                ank = knee + V(-2.4 + 0.9 * u, sd * (0.15 - 0.4 * u), 0.15 + 0.3 * u)
            else:
                knee = hip + V(-2.6, sd * 0.45, -0.25)
                ank = knee + V(-2.45, sd * 0.4, 0.0)
            knee.z = max(knee.z, 0.5); ank.z = max(ank.z, 0.45)
            limb('thigh%d' % i, hip, knee, 0.64, 0.5, m_uni2)
            limb('shin%d' % i, knee, ank, 0.5, 0.42, m_shin)
            ball('knee%d' % i, knee, 0.5, m_uni2)
            # стопа носком в землю
            ld = (ank - knee).normalized()
            limb('boot%d' % i, ank - ld * 0.1, ank + ld * 0.45, 0.43, 0.4, m_boot, 12)
            tip = ank + ld * 0.3
            B.hull('toe%d' % i, [tip + V(dx, s2 * 0.28, dz) for dx in (-0.25, 0.25) for s2 in (-1, 1) for dz in (-tip.z + 0.02, 0.1)], m_boot, 0.08)

    # ------------------------------------------------------------ снаряжение
    belt_z = 0.45
    B.hull('belt', [T(*p) for p in ring(belt_z - 0.18, 0.66, 0.97, 14) + ring(belt_z + 0.18, 0.66, 0.97, 14)], m_web, 0.03, 50)
    B.hull('buckle', [T(0.66 + dx, dy, belt_z + dz) for dx in (0, 0.08) for dy in (-0.2, 0.2) for dz in (-0.17, 0.17)], mat_flat('brass', lin('#7a6a40'), 0.4, 0.6), 0.02)
    # плечевые ремни (Y-образные)
    for sd in (-1, 1):
        pf = [T(0.66, sd * 0.55, belt_z), T(0.72, sd * 0.6, 2.4), T(0.25, sd * 0.75, 3.35), T(-0.55, sd * 0.55, 2.6), T(-0.62, sd * 0.15, 1.4)]
        for k in range(len(pf) - 1):
            limb('strap%d%d' % (sd, k), pf[k], pf[k + 1], 0.1, 0.1, m_web, 6)

    def pouch(name, x, y, z, w, h, d, mat=m_gear, flap=True):
        pts = [T(x + dx, y + dy, z + dz) for dx in (0, d) for dy in (-w / 2, w / 2) for dz in (-h / 2, h / 2)]
        B.hull(name, pts, mat, 0.05)
        if flap:
            B.hull(name + 'f', [T(x + d + dx, y + dy, z + h / 2 + dz) for dx in (-0.02, 0.05) for dy in (-w / 2 - 0.03, w / 2 + 0.03) for dz in (-0.3, 0.03)], mat, 0.02)

    if fac == 'ger':
        if wt in ('rifle', 'sniper', 'at'):
            for sd in (-1, 1):
                for j in range(3):   # тройные подсумки
                    pouch('pch%d%d' % (sd, j), 0.62, sd * (0.32 + j * 0.24), belt_z - 0.2, 0.22, 0.5, 0.22, m_web)
        elif wt == 'smg':
            for sd in (-1, 1): pouch('magp%d' % sd, 0.62, sd * 0.55, belt_z - 0.5, 0.42, 1.1, 0.2, m_canv)
        else:
            B.hull('tool', [T(0.62 + dx, 0.6 + dy, belt_z - 0.3 + dz) for dx in (0, 0.25) for dy in (-0.25, 0.25) for dz in (-0.3, 0.3)], m_web, 0.05)
        # противогаз (рифлёный цилиндр), сухарная сумка, котелок, лопатка
        g0, g1 = T(-0.95, 0.35, 0.0), T(-0.95, 0.35, 1.6)
        for k in range(4):
            limb('gasm%d' % k, g0.lerp(g1, k / 4), g0.lerp(g1, (k + 1) / 4), 0.36 if k % 2 == 0 else 0.33, 0.33 if k % 2 == 0 else 0.36, mat_paint('gasm', '#5b5e4c', 0.6, 0.15), 12)
        pouch('bread', -0.85, -0.55, belt_z - 0.55, 0.75, 0.75, -0.35, m_canv)
        ball('mess', T(-1.0, -0.2, belt_z + 0.6), 0.38, m_gear, 0.8, 1, 1.1)
        B.hull('spade', [T(-0.75 + dx, 0.75 + dy, belt_z - 0.4 + dz) for dx in (-0.06, 0.06) for dy in (-0.25, 0.25) for dz in (-0.75, 0.15)], m_web, 0.03)
        limb('spadeh', T(-0.75, 0.75, belt_z + 0.15), T(-0.72, 0.75, belt_z + 1.0), 0.07, 0.07, m_wood, 6)
    elif fac == 'usa':
        for j in range(5):    # патронташ M1923 по кругу
            a = -1.3 + j * 0.65
            pouch('pch%d' % j, math.cos(a) * 0.62, math.sin(a) * 0.92, belt_z - 0.18, 0.32, 0.45, 0.16, m_web, True)
        limb('cant', T(-0.55, 0.85, belt_z - 0.15), T(-0.55, 0.85, belt_z - 0.95), 0.3, 0.3, m_canv, 12)
        pouch('pack', -0.66, 0, 2.3, 1.3, 1.5, -0.55, m_canv, False)
        B.hull('shov', [T(-1.22 + dx, dy, 1.0 + dz) for dx in (-0.08, 0.08) for dy in (-0.35, 0.35) for dz in (-0.45, 0.45)], m_canv, 0.04)
        limb('shovh', T(-1.25, 0, 1.4), T(-1.25, 0, 2.5), 0.07, 0.07, m_wood, 6)
    else:
        for sd in ((1,) if wt == 'smg' else (-1, 1)):
            pouch('pch%d' % sd, 0.62, sd * 0.5, belt_z - 0.2, 0.45 if wt != 'smg' else 0.55, 0.5, 0.22, m_web)
        # вещмешок и скатка шинели через плечо
        ball('sack', T(-1.0, 0, 2.1), 0.75, m_canv, 0.7, 1.15, 1.0)
        limb('sackn', T(-0.95, 0, 2.7), T(-0.9, 0, 3.0), 0.25, 0.15, m_canv, 8)
        ring_c = T(0, 0, 2.2)
        prev = None
        for k in range(15):
            a = k / 14 * 2 * math.pi
            # эллипс через левое плечо и правый бок
            p = T(math.cos(a) * 0.95, -math.sin(a) * 0.6 + 0.2 * math.cos(a) - 0.15, 2.1 + math.sin(a) * 1.25)
            if prev is not None: limb('roll%d' % k, prev, p, 0.36, 0.36, m_roll, 10)
            prev = p
        limb('cant', T(-0.6, -0.85, belt_z - 0.15), T(-0.6, -0.85, belt_z - 0.85), 0.27, 0.27, m_gear, 10)

    # ------------------------------------------------------------ оружие
    WL = {'ger': {'rifle': 6.9, 'sniper': 6.9, 'smg': 5.1, 'mg': 7.5, 'at': 10.1},
          'usa': {'rifle': 6.8, 'sniper': 6.8, 'smg': 5.3, 'mg': 8.3, 'at': 9.6},
          'ussr': {'rifle': 7.6, 'sniper': 7.6, 'smg': 5.2, 'mg': 7.8, 'at': 12.4}}
    L = WL[fac][wt]
    tube_at = wt == 'at' and fac != 'ussr'
    sh_r, sh_l = T(0.05, 1.12, 3.0), T(0.05, -1.12, 3.0)
    chest = T(0.2, 0, 2.4)
    bob = V(0, 0, 0.18 * math.sin(ph * 4 * math.pi)) if walk else V(0, 0, 0)
    slung = False
    if prone:
        butt = sh_r + V(-0.2, -0.5, 0.15); dirv = V(1, 0, 0.03).normalized()
    elif crawl:
        butt = chest + V(0.3 + 0.6 * max(0.0, math.sin(ph * 2 * math.pi)), 1.1, -0.45); dirv = V(1, -0.08, 0.02).normalized()
    elif pose == 'throw':
        slung = True
        butt = T(-0.8, 0.7, -0.5); dirv = (T(-0.75, -0.7, 3.6) - butt).normalized()
    elif pose == 'aim':
        butt = sh_r + V(0.1, -0.45, 0.35 if tube_at else 0.05); dirv = V(1, 0, 0.0)
        if wt == 'mg': butt = chest + V(0.1, 0.6, -1.6); dirv = V(1, 0, 0.08).normalized()
    elif tube_at:
        butt = sh_r + V(-1.6, -0.4, 0.45) + bob; dirv = V(1, 0, 0.12).normalized()
    elif wt == 'mg':
        butt = chest + V(-0.3, 0.75, -1.9) + bob; dirv = V(1, -0.15, 0.25).normalized()
    else:
        butt = chest + V(-0.25, 0.8, -1.65) + bob; dirv = V(0.72, -0.38, 0.58).normalized()
        if walk: dirv = V(0.8, -0.35, 0.48).normalized()
    up = (V(0, 0, 1) - dirv * dirv.z)
    up = up.normalized() if up.length > 0.05 else V(1, 0, 0)
    sv = dirv.cross(up).normalized()
    W_ = lambda t, u=0.0, s=0.0: butt + dirv * t + up * u + sv * s   # точка вдоль оружия

    def bx(name, t0, t1, u0, u1, s0, s1, mat, bev=0.03):
        B.hull(name, [W_(t, u, s) for t in (t0, t1) for u in (u0, u1) for s in (s0, s1)], mat, bev)

    if tube_at:
        r = 0.3 if fac == 'ger' else 0.22
        limb('tube', W_(-0.5), W_(L), r, r, m_helm if fac == 'ger' else mat_paint('bazooka', '#4a4a30', 0.6, 0.15), 14)
        limb('tubeb', W_(L - 0.4), W_(L), r + 0.07, r + 0.07, m_metal, 14)
        bx('grip1', 1.4, 1.65, -0.9, -r, -0.1, 0.1, m_wood)
        bx('grip2', 2.9, 3.15, -0.8, -r, -0.1, 0.1, m_wood)
        if fac == 'ger':
            bx('shield', 2.4, 2.52, -0.5, 1.1, -0.95, 0.95, m_helm, 0.02)
        else:
            bx('stockb', -0.5, 0.9, -0.75, -r, -0.2, 0.2, m_wood)
        bx('sight', 3.6, 3.75, r, r + 0.35, -0.05, 0.05, m_metal)
        grip_r, grip_l = W_(1.5, -0.85), W_(3.0, -0.75)
    elif wt == 'at':    # ПТРД
        limb('barrel', W_(1.6), W_(L), 0.2, 0.17, m_metal, 10)
        limb('brake', W_(L - 0.7), W_(L), 0.3, 0.3, m_metal, 10)
        bx('recv', 0.6, 2.3, -0.3, 0.3, -0.25, 0.25, m_metal)
        bx('stock', -0.3, 0.8, -0.45, 0.3, -0.18, 0.18, m_wood)
        bx('pad', -0.45, -0.2, -0.5, 0.45, -0.2, 0.2, m_canv)
        bx('handle', 2.6, 3.4, 0.3, 0.45, -0.06, 0.06, m_wood)
        for s2 in (-1, 1):
            limb('bip%d' % s2, W_(L * 0.62), W_(L * 0.62, -1.6 if not low else -0.9, s2 * 0.8), 0.07, 0.07, m_metal, 6)
        grip_r, grip_l = W_(0.7, -0.4), W_(2.5, -0.2)
    else:
        mg = wt == 'mg'
        th = 0.42 if mg else 0.3
        metal_stock = wt == 'smg' and fac == 'ger'
        if metal_stock:   # складной приклад MP 40
            for s2 in (-1, 1): limb('stk%d' % s2, W_(0), W_(L * 0.32, 0.1, s2 * 0.12), 0.06, 0.06, m_metal, 6)
            bx('stkp', -0.08, 0.08, -0.35, 0.3, -0.15, 0.15, m_metal)
        else:
            B.hull('stock', [W_(0, u, s) for u in (-0.55 if not mg else -0.6, 0.25) for s in (-0.17, 0.17)] +
                   [W_(L * 0.3, u, s) for u in (-0.2, 0.22) for s in (-0.14, 0.14)], m_wood, 0.06)
        # ствольная коробка и цевьё
        bx('recv', L * 0.28, L * 0.5, -0.2, th * 0.75, -th * 0.55, th * 0.55, m_metal)
        if not (wt == 'smg' and fac == 'ger'):
            bx('fore', L * 0.48, L * (0.72 if wt in ('rifle', 'sniper') else 0.62), -0.2, 0.18, -0.15, 0.15, m_wood if not mg or fac == 'ussr' else m_metal)
        limb('barrel', W_(L * 0.6), W_(L), 0.2 if mg else 0.11, 0.1, m_metal, 8)
        bx('fsight', L - 0.25, L - 0.12, 0.08, 0.3, -0.04, 0.04, m_metal)
        if wt in ('rifle', 'sniper'):
            limb('bolt', W_(L * 0.42, 0.1, 0.1), W_(L * 0.42, -0.05, 0.5), 0.05, 0.05, m_metal, 6)
            ball('boltk', W_(L * 0.42, -0.05, 0.52), 0.1, m_metal)
            # ремень: от приклада провисает к цевью
            s0, s2_ = W_(L * 0.18, -0.4), W_(L * 0.66, -0.2)
            mid = s0.lerp(s2_, 0.5) - up * 0.55
            limb('sling1', s0, mid, 0.06, 0.06, m_web, 5); limb('sling2', mid, s2_, 0.06, 0.06, m_web, 5)
        if wt == 'rifle' and fac == 'ussr':
            limb('bayo', W_(L), W_(L + 2.0, 0.05), 0.06, 0.02, m_metal, 6)
        if wt == 'sniper':
            bx('mnt', L * 0.33, L * 0.47, 0.18, 0.38, -0.06, 0.06, m_metal)
            limb('scope', W_(L * 0.26, 0.5), W_(L * 0.55, 0.5), 0.17, 0.17, m_metal, 10)
            limb('scopeo', W_(L * 0.52, 0.5), W_(L * 0.58, 0.5), 0.22, 0.22, m_metal, 10)
        if wt == 'smg':
            if fac == 'ger':   bx('mag', L * 0.42, L * 0.5, -1.5, -0.15, -0.09, 0.09, m_metal)
            elif fac == 'usa':
                bx('mag', L * 0.44, L * 0.52, -1.0, -0.15, -0.1, 0.1, m_metal)
                bx('fgrip', L * 0.62, L * 0.7, -0.6, -0.1, -0.1, 0.1, m_wood)
            else:
                limb('drum', W_(L * 0.45, -0.25), W_(L * 0.45, -0.85), 0.62, 0.62, m_metal, 16)
                limb('jacket', W_(L * 0.6), W_(L * 0.95), 0.2, 0.2, m_metal, 10)
        if mg:
            if fac == 'ussr':
                limb('pan', W_(L * 0.38, 0.35), W_(L * 0.38, 0.6), 1.0, 1.0, m_metal, 18)
                limb('jacket', W_(L * 0.6), W_(L * 0.88), 0.28, 0.24, m_metal, 10)
            else:
                limb('jacket', W_(L * 0.52), W_(L * 0.9), 0.32, 0.3, m_metal, 10)
                bx('feed', L * 0.33, L * 0.45, 0.2, 0.42, -0.25, 0.25, m_metal)
                if fac == 'usa': limb('handle', W_(L * 0.45, 0.35), W_(L * 0.58, 0.35), 0.07, 0.07, m_metal, 6)
                if fac == 'ger':   # хвост ленты
                    for k in range(5):
                        bx('belt%d' % k, L * 0.36 + k * 0.05, L * 0.36 + k * 0.05 + 0.12, -0.3 - k * 0.22, -0.12 - k * 0.22, 0.25 + k * 0.08, 0.6 + k * 0.08, mat_flat('brass', lin('#7a6a40'), 0.4, 0.6), 0.01)
            b0 = W_(L * 0.8)
            for s2 in (-1, 1):
                if low or pose == 'aim':
                    limb('bip%d' % s2, b0, W_(L * 0.8, -1.4, s2 * 0.55), 0.07, 0.07, m_metal, 6)
                else:
                    limb('bip%d' % s2, b0, W_(L * 0.55, -0.15, s2 * 0.12), 0.07, 0.07, m_metal, 6)
        grip_r = W_(L * 0.3, -0.25)
        grip_l = W_(L * (0.62 if wt == 'smg' else 0.55), -0.18)

    # ------------------------------------------------------------ руки
    def arm(name, sh, hand, hint, glove=True):
        el = ik(sh, hand, 1.95, 1.85, hint)
        ball(name + 's', sh, 0.42, m_uni)
        limb(name + 'u', sh, el, 0.46, 0.4, m_uni)
        ball(name + 'e', el, 0.4, m_uni)
        limb(name + 'f', el, el.lerp(hand, 0.86), 0.39, 0.34, m_uni)
        limb(name + 'c', el.lerp(hand, 0.78), el.lerp(hand, 0.9), 0.37, 0.37, m_uni2)
        ball(name + 'h', hand, 0.3, m_skin, 1.2, 0.9, 1.0)

    if slung:
        # бросок гранаты: правая рука отведена назад-вверх, левая вытянута к цели
        hand_r = T(-1.2, 1.3, 4.6)
        arm('armr', sh_r, hand_r, V(0, 1, 1))
        g = hand_r + V(-0.15, 0, 0.3)
        if fac == 'ger':
            gd = V(-0.75, 0.1, -0.65).normalized()
            limb('gren_h', hand_r - gd * 0.2, hand_r + gd * 1.2, 0.13, 0.13, m_wood, 8)
            limb('gren', hand_r + gd * 1.2, hand_r + gd * 1.75, 0.33, 0.33, m_helm, 12)
        else:
            ball('gren', g, 0.36, m_helm if fac == 'ussr' else m_gear, 1, 1, 1.25)
        arm('arml', sh_l, sh_l + V(1.9, -0.3, 0.9), V(0, -1, -1))
        # оружие за спиной на ремне
        limb('sling', T(-0.6, 0.9, 3.3), T(0.6, -0.8, 0.6), 0.06, 0.06, m_web, 5)
    elif crawl:
        u = math.sin(ph * 2 * math.pi)
        arm('armr', sh_r, W_(L * 0.4 if not tube_at else 2.0, -0.1, 0.3), V(0, 1, -1))
        hand_l = sh_l + V(1.5 + 0.9 * max(0.0, -u), -0.4, -0.95)
        hand_l.z = max(hand_l.z, 0.3)
        arm('arml', sh_l, hand_l, V(0, -1, -1))
    else:
        arm('armr', sh_r, grip_r, V(-0.3, 1, -1))
        arm('arml', sh_l, grip_l, V(-0.2, -1, -1))
