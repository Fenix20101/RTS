"""3D-модели техники «Стального рубежа» и рендер спрайтов со всех направлений.

Запуск (из папки tools):
  blender\blender-4.5.16-windows-x64\blender.exe -b -P blender_units.py -- <out_dir> [модели через запятую] [число направлений]
Пример теста:  ... -- units_raw ussr_medium 4

Координаты как в игре: x вперёд, y вправо-вниз по карте, z вверх. Проекция подогнана под ISO() из render.js:
  экран = (x - y, (x + y)/2 - z) * S  — ортокамера под 30°, высоты сжаты на sqrt(2/3).
Начало координат модели попадает в центр кадра.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'units_raw')
ONLY = argv[1].split(',') if len(argv) > 1 and argv[1] not in ('', 'all') else None
DIRS = int(argv[2]) if len(argv) > 2 else 32
IDIRS = int(argv[3]) if len(argv) > 3 else 24   # направлений для пехоты
S = 3.0                      # пикселей на игровую единицу
SQ = math.sqrt(2.0 / 3.0)    # сжатие высот под игровую проекцию
FW, FH = 384, 320            # кадр; начало координат — в центре
os.makedirs(OUT, exist_ok=True)

FACTION_PAINT = {'ger': '#5b605c', 'usa': '#5a5838', 'ussr': '#4c5934'}
CANVAS = {'ger': '#6e6a58', 'usa': '#5f6040', 'ussr': '#6a6a48'}


def lin(hexc, k=1.0):
    h = hexc.lstrip('#')
    return tuple(((int(h[i:i + 2], 16) / 255.0) ** 2.2) * k for i in (0, 2, 4)) + (1.0,)


# ------------------------------------------------------------------ сцена
def setup_scene(fw=384, fh=320, samples=40):
    global FW, FH
    FW, FH = fw, fh
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    dev = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for t in ('HIP', 'CUDA', 'OPTIX', 'ONEAPI'):
            try:
                prefs.compute_device_type = t
            except TypeError:
                continue
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == t]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == t
                dev = 'GPU'
                print('GPU:', t, [d.name for d in gpus])
                break
    except Exception as e:
        print('GPU setup failed:', e)
    sc.cycles.device = dev
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = FW, FH
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.55, 0.62, 0.75, 1); bg.inputs[1].default_value = 0.65
    # камера
    cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'
    cd.ortho_scale = max(FW, FH) / (math.sqrt(2) * S)   # Blender относит масштаб к большей стороне кадра
    cd.clip_start, cd.clip_end = 1, 2000
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam)
    c30, s30 = math.cos(math.radians(30)), math.sin(math.radians(30))
    d = Vector((c30 / math.sqrt(2), -c30 / math.sqrt(2), s30))   # из центра к камере (y игры перевёрнут)
    cam.location = d * 500
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    # солнце: в игре тени ложатся в сторону (+0.9, -0.45)
    ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = 4.2; ld.angle = math.radians(5)
    sun = bpy.data.objects.new('sun', ld); sc.collection.objects.link(sun)
    hx, hy = -0.894, 0.447                 # к солнцу, игровые координаты
    to_sun = Vector((hx * 0.72, -hy * 0.72, 0.69)).normalized()
    sun.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()
    # «ловец теней»
    bpy.ops.mesh.primitive_plane_add(size=400)
    pl = bpy.context.active_object; pl.name = 'catcher'; pl.is_shadow_catcher = True
    return sc


def check_projection():
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    for name, p in (('x+10', (10, 0, 0)), ('y+10', (0, -10, 0)), ('z+10', (0, 0, 10 * SQ))):
        v = world_to_camera_view(sc, sc.camera, Vector(p))
        print('proj', name, round((v.x - 0.5) * FW, 2), round((0.5 - v.y) * FH, 2))


# ------------------------------------------------------------------ материалы
MATS = {}


def mat_paint(key, hexc, rough=0.62, dust=0.55, metal=0.0, grime=0.3, camo=None, armor=False):
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(key); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bsdf = N['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    tc = N.new('ShaderNodeTexCoord')
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.22; noise.inputs['Detail'].default_value = 8
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 2.5; fine.inputs['Detail'].default_value = 4
    L.new(tc.outputs['Object'], fine.inputs['Vector'])
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    mr = N.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 7.0
    mr.inputs['To Min'].default_value = dust; mr.inputs['To Max'].default_value = 0.0
    L.new(sep.outputs['Z'], mr.inputs['Value'])
    # пыль снизу + пятна
    add = N.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
    L.new(noise.outputs['Fac'], add.inputs[0]); add.inputs[1].default_value = 0.6; L.new(mr.outputs['Result'], add.inputs[2])
    sub = N.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.use_clamp = True
    L.new(add.outputs['Value'], sub.inputs[0]); sub.inputs[1].default_value = 0.3
    mix = N.new('ShaderNodeMixRGB'); mix.blend_type = 'MIX'
    L.new(sub.outputs['Value'], mix.inputs['Fac'])
    if camo:
        # пятна второго и третьего цвета (зелёный, коричневый) поверх основного
        prev = None
        for j, (ch, sc, thr) in enumerate(camo):
            nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = sc; nz.inputs['Detail'].default_value = 1.5
            nz.inputs['Roughness'].default_value = 0.4
            mp = N.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (13.7 * (j + 1), 5.1 * j, 2.3 * j)
            L.new(tc.outputs['Object'], mp.inputs['Vector']); L.new(mp.outputs['Vector'], nz.inputs['Vector'])
            ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
            ramp.color_ramp.elements[1].position = thr
            L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
            cm = N.new('ShaderNodeMixRGB'); cm.blend_type = 'MIX'
            L.new(ramp.outputs['Color'], cm.inputs['Fac'])
            if prev is None: cm.inputs['Color1'].default_value = lin(hexc)
            else: L.new(prev.outputs['Color'], cm.inputs['Color1'])
            cm.inputs['Color2'].default_value = lin(ch)
            prev = cm
        L.new(prev.outputs['Color'], mix.inputs['Color1'])
    else:
        mix.inputs['Color1'].default_value = lin(hexc)
    mix.inputs['Color2'].default_value = lin('#7a6a50')
    # мелкая грязь — затемнение
    mul = N.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'
    gm = N.new('ShaderNodeMapRange'); gm.inputs['From Min'].default_value = 0.35; gm.inputs['From Max'].default_value = 0.75
    gm.inputs['To Min'].default_value = 0.0; gm.inputs['To Max'].default_value = grime
    L.new(fine.outputs['Fac'], gm.inputs['Value'])
    L.new(gm.outputs['Result'], mul.inputs['Fac'])
    L.new(mix.outputs['Color'], mul.inputs['Color1']); mul.inputs['Color2'].default_value = (0.35, 0.32, 0.28, 1)
    if armor:
        col = armor_layers(N, L, tc, mul.outputs['Color'], bsdf, rough)
        L.new(col, bsdf.inputs['Base Color'])
    else:
        L.new(mul.outputs['Color'], bsdf.inputs['Base Color'])
    MATS[key] = m
    return m


def armor_layers(N, L, tc, col_in, bsdf, rough):
    """Слои «настоящей» брони: выгоревшая краска, потёки, грязь в щелях (AO), потёртые кромки,
    налипшая грязь снизу, пыль на горизонталях, шероховатость литья/проката."""
    def noise(scale, detail=6, vec=None, loc=(0, 0, 0), stretch=None):
        n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
        mp = N.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = loc
        if stretch: mp.inputs['Scale'].default_value = stretch
        L.new(tc.outputs['Object'], mp.inputs['Vector']); L.new(mp.outputs['Vector'], n.inputs['Vector'])
        return n.outputs['Fac']
    def mrange(v, a, b, c=0.0, d=1.0):
        r = N.new('ShaderNodeMapRange'); r.clamp = True
        r.inputs['From Min'].default_value = a; r.inputs['From Max'].default_value = b
        r.inputs['To Min'].default_value = c; r.inputs['To Max'].default_value = d
        L.new(v, r.inputs['Value']); return r.outputs['Result']
    def mixc(fac, c1, c2, mode='MIX'):
        m = N.new('ShaderNodeMixRGB'); m.blend_type = mode
        if isinstance(fac, float): m.inputs['Fac'].default_value = fac
        else: L.new(fac, m.inputs['Fac'])
        if isinstance(c1, tuple): m.inputs['Color1'].default_value = c1
        else: L.new(c1, m.inputs['Color1'])
        if isinstance(c2, tuple): m.inputs['Color2'].default_value = c2
        else: L.new(c2, m.inputs['Color2'])
        return m.outputs['Color']
    def mul(a, b):
        m = N.new('ShaderNodeMath'); m.operation = 'MULTIPLY'; m.use_clamp = True
        L.new(a, m.inputs[0])
        if isinstance(b, float): m.inputs[1].default_value = b
        else: L.new(b, m.inputs[1])
        return m.outputs['Value']
    geo = N.new('ShaderNodeNewGeometry')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    nrm = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], nrm.inputs[0])
    c = col_in
    # 1. выгоревшая неровная краска: крупные светлые/тёмные пятна
    fade = mrange(noise(0.06, 3, loc=(3.1, 7.7, 1.3)), 0.3, 0.75, -0.25, 0.3)
    c = mixc(fade, c, (0.16, 0.15, 0.1, 1), 'LINEAR_LIGHT')
    # 2. вертикальные потёки грязи и ржавчины на бортах
    streak = mrange(noise(0.9, 4, loc=(5.0, 1.0, 0.0), stretch=(1.0, 1.0, 0.06)), 0.5, 0.72, 0.0, 0.55)
    side = mrange(nrm.outputs['Z'], 0.6, 0.2)            # только вертикальные поверхности
    c = mixc(mul(streak, side), c, (0.05, 0.04, 0.025, 1))
    # 3. грязь и копоть в щелях и углах (ambient occlusion)
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.samples = 8; ao.inputs['Distance'].default_value = 3.0
    cav = mrange(ao.outputs['AO'], 0.2, 0.97, 0.85, 0.0)
    c = mixc(cav, c, (0.012, 0.01, 0.007, 1))
    # 4. потёртые кромки: светлая краска и сталь на рёбрах
    bev = N.new('ShaderNodeBevel'); bev.samples = 6; bev.inputs['Radius'].default_value = 0.09
    dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    L.new(bev.outputs['Normal'], dot.inputs[0]); L.new(geo.outputs['Normal'], dot.inputs[1])
    edge = mrange(dot.outputs['Value'], 0.985, 0.8)
    chip = mrange(noise(3.5, 6, loc=(9.0, 2.0, 4.0)), 0.4, 0.6)
    wear = mul(edge, chip)
    c = mixc(mul(wear, 0.6), c, (0.2, 0.19, 0.16, 1))
    # 5. налипшая грязь снизу (до ~0,9 м) с рваной кромкой
    low = mrange(sep.outputs['Z'], 5.0, 2.0)
    brk = mrange(noise(0.8, 8, loc=(1.0, 3.0, 0.0)), 0.32, 0.56)
    mud = mul(low, brk)
    c = mixc(mul(mud, 0.92), c, (0.022, 0.014, 0.007, 1))
    # 6. пыль на горизонтальных поверхностях
    top = mrange(nrm.outputs['Z'], 0.55, 0.95)
    dz = mrange(noise(1.6, 5, loc=(4.0, 4.0, 4.0)), 0.35, 0.75, 0.1, 0.5)
    c = mixc(mul(top, dz), c, (0.2, 0.165, 0.11, 1))
    # 7. шероховатость: неровности литья и проката, матовая грязь
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.18; bump.inputs['Distance'].default_value = 0.05
    L.new(noise(2.2, 10, loc=(7.0, 1.0, 3.0)), bump.inputs['Height'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal']); L.new(bump.outputs['Normal'], bev.inputs['Normal'])
    rg = N.new('ShaderNodeMath'); rg.operation = 'MULTIPLY_ADD'; rg.use_clamp = True
    L.new(mud, rg.inputs[0]); rg.inputs[1].default_value = 0.3; rg.inputs[2].default_value = rough
    L.new(rg.outputs['Value'], bsdf.inputs['Roughness'])
    return c


def mat_flat(key, rgba_lin, rough=0.7, metal=0.0):
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(key); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = rgba_lin
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    MATS[key] = m
    return m


def mat_track():
    if 'track' in MATS: return MATS['track']
    m = bpy.data.materials.new('track'); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.03, 0.028, 0.025, 1)
    b.inputs['Roughness'].default_value = 0.85; b.inputs['Metallic'].default_value = 0.1
    tc = N.new('ShaderNodeTexCoord')
    wave = N.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 0.9; wave.inputs['Distortion'].default_value = 0
    L.new(tc.outputs['Object'], wave.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.8
    L.new(wave.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.2; nz.inputs['Detail'].default_value = 8
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.4; ramp.color_ramp.elements[0].color = (0.03, 0.028, 0.025, 1)
    ramp.color_ramp.elements[1].position = 0.62; ramp.color_ramp.elements[1].color = (0.09, 0.07, 0.045, 1)
    L.new(nz.outputs['Fac'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    MATS['track'] = m
    return m


# ------------------------------------------------------------------ геометрия
class Builder:
    def __init__(self, root, k=1.0):
        self.root = root
        self.k = k          # единиц игры на единицу модели (для техники — на метр)

    def G(self, x, y, z):
        k = self.k
        return Vector((x * k, -y * k, z * k))

    def _obj(self, name, bm, mat, bevel=0.0, smooth_angle=None):
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(mat)
        if smooth_angle is not None:
            for p in me.polygons: p.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        if bevel:
            md = ob.modifiers.new('bev', 'BEVEL'); md.width = bevel * self.k; md.segments = 2
            md.limit_method = 'ANGLE'; md.angle_limit = math.radians(25); md.harden_normals = False
        ob.parent = self.root
        return ob

    def hull(self, name, pts, mat, bevel=0.22, smooth_angle=None):
        bm = bmesh.new()
        for p in pts: bm.verts.new(self.G(*p))
        r = bmesh.ops.convex_hull(bm, input=bm.verts[:])
        junk = list({id(g): g for g in r['geom_interior'] + r['geom_unused'] if isinstance(g, bmesh.types.BMVert)}.values())
        if junk: bmesh.ops.delete(bm, geom=junk, context='VERTS')
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts[:], edges=bm.edges[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        return self._obj(name, bm, mat, bevel, smooth_angle)

    def box(self, name, x0, x1, y0, y1, z0, z1, mat, bevel=0.18):
        return self.hull(name, [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)], mat, bevel)

    def tube(self, name, p0, p1, r0, r1, mat, segs=16, bevel=0.0, smooth=True):
        a, b = self.G(*p0), self.G(*p1)
        d = b - a
        q = d.to_track_quat('Z', 'Y')
        M = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r0 * self.k, radius2=r1 * self.k, depth=d.length, matrix=M)
        return self._obj(name, bm, mat, bevel, 40 if smooth else None)

    def wheel(self, name, x, y, z, r, w, mat, hub=None):
        self.tube(name, (x, y - w / 2, z), (x, y + w / 2, z), r, r, mat, segs=20)
        if hub:
            side = 1 if y > 0 else -1
            self.tube(name + 'h', (x, y + side * w / 2, z), (x, y + side * (w / 2 + 0.25), z), r * 0.45, r * 0.4, hub, segs=14)

    def beam(self, name, p0, p1, w, h, mat, bevel=0.1):
        a, b = Vector(p0), Vector(p1)
        d = (b - a); d.z = 0; d.normalize()
        n = Vector((-d.y, d.x, 0)) * (w / 2)
        pts = []
        for p in (a, b):
            for s in (-1, 1):
                for hz in (0, h):
                    q = p + n * s; pts.append((q.x, q.y, q.z + hz))
        return self.hull(name, pts, mat, bevel)

    def ring(self, cx, rx, ry, z, n=16, back=1.0, front=1.0):
        out = []
        for i in range(n):
            a = i / n * math.pi * 2
            k = front if math.cos(a) > 0 else back
            out.append((cx + math.cos(a) * rx * k, math.sin(a) * ry, z))
        return out

    def star(self, name, x, y, z, r, mat, plane='side', side=1):
        pts = []
        for i in range(10):
            a = i / 10 * math.pi * 2 + math.pi / 2
            rr = r if i % 2 == 0 else r * 0.4
            pts.append((math.cos(a) * rr, math.sin(a) * rr))
        bm = bmesh.new()
        vs = []
        for (u, v) in pts:
            if plane == 'side':   p = (x + u, y, z + v)
            elif plane == 'front': p = (x, y + u, z + v)
            else:                  p = (x + v, y + u, z)
            vs.append(bm.verts.new(self.G(*p)))
        f = bm.faces.new(vs)
        bmesh.ops.solidify(bm, geom=[f], thickness=0.06 * (0.25 if self.k > 1 else 1))
        return self._obj(name, bm, mat)

    # ---- гусеница из отдельных траков: обвод вокруг кругов (x, z, r) в профиль
    def track_loop(self, name, circles, y0, y1, thk, pitch, mat):
        pts = []
        for (cx, cz, r) in circles:
            for i in range(36):
                a = i / 36 * math.pi * 2
                pts.append((cx + math.cos(a) * (r + thk / 2), cz + math.sin(a) * (r + thk / 2)))
        pts = sorted(set(pts))
        def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        lo, up = [], []
        for p in pts:
            while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
            lo.append(p)
        for p in reversed(pts):
            while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
            up.append(p)
        loop = lo[:-1] + up[:-1]
        segs, total = [], 0.0
        for i in range(len(loop)):
            a, b = loop[i], loop[(i + 1) % len(loop)]
            l = math.hypot(b[0] - a[0], b[1] - a[1]); segs.append((a, b, l)); total += l
        n = max(8, int(total / pitch))
        step = total / n
        bm = bmesh.new()
        k = self.k
        yc, w = (y0 + y1) / 2, abs(y1 - y0)
        t, si = 0.0, 0
        acc = 0.0
        for i in range(n):
            d = i * step
            while si < len(segs) - 1 and acc + segs[si][2] < d:
                acc += segs[si][2]; si += 1
            a, b, l = segs[si]
            u = (d - acc) / l if l else 0
            x, z = a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            M = Matrix.Translation(self.G(x, yc, z)) @ Matrix.Rotation(-ang, 4, 'Y') @ Matrix.Diagonal((step * 0.86 * k, w * k, thk * k, 1))
            bmesh.ops.create_cube(bm, size=1.0, matrix=M)
            # грунтозацеп
            M2 = Matrix.Translation(self.G(x, yc, z)) @ Matrix.Rotation(-ang, 4, 'Y') @ Matrix.Translation((0, 0, -thk * 0.55 * k)) @ Matrix.Diagonal((step * 0.25 * k, w * 0.92 * k, thk * 0.5 * k, 1))
            bmesh.ops.create_cube(bm, size=1.0, matrix=M2)
        return self._obj(name, bm, mat)

    # ---- каток: шина, диск, ступица
    def roadwheel(self, name, x, y, z, r, w, tire, disc, side, rim=0.12, hubmat=None):
        self.tube(name + 't', (x, y - w / 2, z), (x, y + w / 2, z), r, r, tire, 24)
        yo = y + side * w / 2
        self.tube(name + 'd', (x, yo - side * 0.01, z), (x, yo + side * 0.012, z), r * (1 - rim), r * (1 - rim), disc, 24)
        self.tube(name + 'h', (x, yo, z), (x, yo + side * 0.05, z), r * 0.32, r * 0.26, hubmat or disc, 12)

    # ---- цифры «как на семисегментнике» на вертикальной плоскости y = const
    def digits(self, name, text, x, y, z, h, mat, side=1):
        SEG = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'}
        w, t = h * 0.5, h * 0.14
        n = len(text)
        for i, ch in enumerate(text):
            cx = x + (i - (n - 1) / 2) * (w + t * 1.6) * side   # читаются слева направо с этой стороны
            for sg in SEG.get(ch, ''):
                if sg in 'agd':
                    zz = {'a': z + h / 2, 'g': z, 'd': z - h / 2}[sg]
                    xa, xb, za, zb = cx - w / 2, cx + w / 2, zz - t / 2, zz + t / 2
                else:
                    xx = cx + (w / 2 if sg in 'bc' else -w / 2) * side
                    zz = z + (h / 4 if sg in 'bf' else -h / 4)
                    xa, xb, za, zb = xx - t / 2, xx + t / 2, zz - h / 4, zz + h / 4
                self.box('%s%d%s' % (name, i, sg), xa, xb, y, y + side * 0.012, za, zb, mat, 0)

    def cross(self, name, x, y, z, r, side=1):
        white = mat_flat('white', (0.75, 0.75, 0.72, 1)); black = mat_flat('black', (0.01, 0.01, 0.01, 1))
        t = 0.05 * side
        self.box(name + 'w1', x - r, x + r, y, y + t * 2, z - r * 0.32, z + r * 0.32, white, 0)
        self.box(name + 'w2', x - r * 0.32, x + r * 0.32, y, y + t * 2, z - r, z + r, white, 0)
        k = 0.7
        self.box(name + 'b1', x - r * k, x + r * k, y + t, y + t * 3, z - r * 0.16, z + r * 0.16, black, 0)
        self.box(name + 'b2', x - r * 0.16, x + r * 0.16, y + t, y + t * 3, z - r * k, z + r * k, black, 0)


# ------------------------------------------------------------------ танки
DIMS = {'light': (22, 13, 4.5, 8.0, 12.0), 'medium': (27, 16, 5.5, 9.5, 14.5), 'heavy': (31, 19, 6.0, 10.5, 16.0)}


def build_tank(fac, typ, hull_root, tur_root):
    L, W, hT, hH, tH = DIMS[typ]
    heavy, light = typ == 'heavy', typ == 'light'
    paint = mat_paint('paint_' + fac, FACTION_PAINT[fac])
    dark = mat_flat('dark', (0.02, 0.02, 0.018, 1), 0.8)
    steel = mat_flat('steel', (0.05, 0.05, 0.045, 1), 0.45, 0.8)
    rubber = mat_flat('rubber', (0.025, 0.025, 0.022, 1), 0.9)
    wood = mat_paint('wood', '#6b5238', 0.8, 0.2, 0, 0.4)
    trk = mat_track()
    B = Builder(hull_root)
    tw = W * 0.27
    # гусеницы
    for s in (-1, 1):
        y0, y1 = s * (W / 2 - tw), s * W / 2
        ys = (y0, y1)
        # гусеница — петля: верхняя и нижняя ветви, передний и задний обводы; катки видны между ветвями
        B.hull('trtop%d' % s, [(x, y, z) for x in (-L / 2 + 1.6, L / 2 - 1.6) for y in ys for z in (hT - 0.55, hT)], trk, 0.1)
        B.hull('trbot%d' % s, [(x, y, z) for x in (-L / 2 + 2.2, L / 2 - 2.4) for y in ys for z in (0, 0.5)], trk, 0.1)
        B.hull('trfr%d' % s, [(x, y, z) for y in ys for (x, z) in ((L / 2 - 2.4, 0), (L / 2, hT * 0.6), (L / 2 - 1.6, hT), (L / 2 - 3.4, hT), (L / 2 - 3.6, 0))], trk, 0.15)
        B.hull('trrr%d' % s, [(x, y, z) for y in ys for (x, z) in ((-L / 2 + 2.2, 0), (-L / 2, hT * 0.55), (-L / 2 + 1.6, hT), (-L / 2 + 3.2, hT), (-L / 2 + 3.4, 0))], trk, 0.15)
        # катки
        n = {'ger': 8 if heavy else 8, 'usa': 6, 'ussr': 5}[fac] if not light else 5
        if fac == 'ger' and not heavy and not light: n = 8
        wr = (hT - 1.05) / 2 * (1.0 if n <= 5 or (fac == 'ger' and heavy) else 0.8)
        span = L - 8
        for i in range(n):
            x = -span / 2 + span * i / (n - 1)
            off = (0.3 if (fac == 'ger' and heavy and i % 2) else 0)
            B.wheel('rw%d_%d' % (s, i), x, s * (W / 2 - tw * 0.5 + off), 0.5 + wr, wr, tw * 0.8, rubber, steel)
        if n > 5 and not (fac == 'ger' and heavy):
            for i in range(3):   # поддерживающие катки
                B.wheel('rr%d_%d' % (s, i), -span / 3 + span / 3 * i, s * (W / 2 - tw * 0.5), hT - 0.85, 0.35, tw * 0.5, rubber)
        # ведущее колесо и ленивец
        B.wheel('spr%d' % s, L / 2 - 1.8, s * (W / 2 - tw * 0.5 + 0.5), hT * 0.62, hT * 0.33, tw * 0.5, steel)
        B.wheel('idl%d' % s, -L / 2 + 1.8, s * (W / 2 - tw * 0.5 + 0.5), hT * 0.6, hT * 0.3, tw * 0.5, steel)
    # нижний корпус
    yi = W / 2 - tw + 0.1
    B.hull('lowhull', [(L / 2 - 0.6, y, hT) for y in (-yi, yi)] + [(L / 2 - 2.8, y, 1.2) for y in (-yi, yi)] +
           [(-L / 2 + 0.6, y, hT) for y in (-yi, yi)] + [(-L / 2 + 1.6, y, 1.2) for y in (-yi, yi)], paint)
    # верхний корпус
    z0 = hT - 0.6
    if fac == 'ussr' and not light:
        fx, sl = L / 2, 6.5 if not heavy else 7
        top_y = W / 2 - 1.4
        pts = [(fx, y, z0) for y in (-W / 2, W / 2)] + [(fx - sl, y, hH) for y in (-top_y, top_y)] + \
              [(-L / 2 + 0.4, y, z0) for y in (-W / 2, W / 2)] + [(-L / 2 + 2.6, y, hH) for y in (-top_y, top_y)]
    elif fac == 'usa':
        sl = 5.5 if not light else 3.5
        top_y = W / 2 - 0.5
        pts = [(L / 2, y, z0) for y in (-W / 2 + 0.6, W / 2 - 0.6)] + [(L / 2 - sl, y, hH) for y in (-top_y, top_y)] + \
              [(L / 2 - 0.6, y, z0 + 0.6) for y in (-W / 2, W / 2)] + \
              [(-L / 2 + 0.6, y, z0) for y in (-W / 2, W / 2)] + [(-L / 2 + 0.8, y, hH) for y in (-top_y, top_y)]
    else:
        fx = L / 2 - (2.5 if heavy else 1.8)
        pts = [(fx, y, z0) for y in (-W / 2, W / 2)] + [(fx - 0.3, y, hH) for y in (-W / 2 + 0.2, W / 2 - 0.2)] + \
              [(-L / 2 + 0.5, y, z0) for y in (-W / 2, W / 2)] + [(-L / 2 + 0.8, y, hH) for y in (-W / 2 + 0.2, W / 2 - 0.2)]
        # нижний лобовой лист
        B.hull('nose', [(fx, y, z0) for y in (-yi, yi)] + [(fx, y, hT * 0.4) for y in (-yi, yi)] +
               [(L / 2 - 0.4, y, hT * 0.75) for y in (-yi, yi)], paint)
    B.hull('uphull', pts, paint)
    # детали корпуса
    deck = hH
    B.box('grill1', -L / 2 + 1.6, -L / 2 + L * 0.28, -W * 0.3, -W * 0.05, deck, deck + 0.25, dark, 0.05)
    B.box('grill2', -L / 2 + 1.6, -L / 2 + L * 0.28, W * 0.05, W * 0.3, deck, deck + 0.25, dark, 0.05)
    dx = L / 2 - (7 if fac == 'ussr' and not light else 6 if fac == 'usa' else 3.5)
    B.tube('hatch_d', (dx, -W * 0.22, deck - 0.1), (dx, -W * 0.22, deck + 0.45), W * 0.1, W * 0.09, paint)
    B.tube('hatch_r', (dx, W * 0.22, deck - 0.1), (dx, W * 0.22, deck + 0.45), W * 0.1, W * 0.09, paint)
    # курсовой пулемёт
    if not light:
        mgx = L / 2 - (4.5 if fac == 'ussr' else 3.5 if fac == 'usa' else 2.6)
        B.tube('hmg', (mgx - 0.6, W * 0.22, hH - 1.6), (mgx + 1.6, W * 0.22, hH - 1.6), 0.18, 0.15, steel)
        B.tube('hmgb', (mgx - 0.3, W * 0.22, hH - 1.6), (mgx + 0.5, W * 0.22, hH - 1.6), 0.6, 0.5, paint)
    # фары
    for s in (-1, 1):
        B.tube('lamp%d' % s, (L / 2 - 1.2, s * W * 0.38, hT + 0.4), (L / 2 - 0.4, s * W * 0.38, hT + 0.4), 0.45, 0.5, dark)
    # ящики, инструмент, бочки
    if fac == 'ussr':
        for s in (-1, 1):
            B.tube('drum%d' % s, (-L / 2 + 1, s * (W / 2 - 0.9), hH + 0.9), (-L / 2 + 6.5, s * (W / 2 - 0.9), hH + 0.9), 0.9, 0.9, paint)
        B.tube('logs', (-L / 2 + 1.3, -W * 0.42, hH + 0.2), (-L / 2 + 1.3, W * 0.42, hH + 0.2), 0.55, 0.55, wood)
        for s in (-1, 1):
            B.tube('exh%d' % s, (-L / 2 - 0.2, s * W * 0.2, hH - 2), (-L / 2 + 0.6, s * W * 0.2, hH - 1.6), 0.35, 0.35, dark)
    elif fac == 'usa':
        B.box('box1', -L / 2 + 1, -L / 2 + 5, -W / 2 + 0.3, -W / 2 + 2.2, hH, hH + 1.1, paint, 0.15)
        B.box('box2', -L / 2 + 1, -L / 2 + 4, W / 2 - 2.2, W / 2 - 0.3, hH, hH + 1.0, wood, 0.15)
        B.beam('shovel', (L * 0.05, W / 2 - 0.7, hH), (L * 0.32, W / 2 - 0.7, hH), 0.5, 0.25, wood)
        for i in range(3):
            B.box('link%d' % i, L / 2 - 3.3, L / 2 - 2.3, -W * 0.3 + i * W * 0.2, -W * 0.3 + i * W * 0.2 + W * 0.17, hH - 1.2, hH - 0.6, trk, 0.05)
    else:
        for s in (-1, 1):
            B.tube('exh%d' % s, (-L / 2 + 0.2, s * W * 0.25, hH - 1.5), (-L / 2 + 0.2, s * W * 0.25, hH + 1.2), 0.45, 0.4, dark)
        B.beam('jack', (-L * 0.1, -W / 2 + 0.6, hH), (L * 0.18, -W / 2 + 0.6, hH), 0.45, 0.35, steel)
        B.box('toolbox', L * 0.1, L * 0.3, W / 2 - 1.6, W / 2 - 0.3, hH, hH + 0.8, paint, 0.1)
    # опознавательные знаки на бортах
    for s in (-1, 1):
        if fac == 'ger':
            B.cross('crs%d' % s, -L * 0.05, s * (W / 2 + 0.01), (z0 + hH) / 2, 1.3 if not light else 1.0, s)
        elif fac == 'usa':
            B.star('st%d' % s, -L * 0.05, s * (W / 2 + 0.02), (z0 + hH) / 2, 1.5, mat_flat('white', (0.75, 0.75, 0.72, 1)))
    if fac == 'usa':
        B.star('sttop', -L * 0.3, 0, hH + 0.3, 1.6, mat_flat('white', (0.75, 0.75, 0.72, 1)), 'top')

    # ---------------- башня (начало координат — ось башни)
    T = Builder(tur_root)
    tl, tW = L * (0.5 if heavy else 0.44), W * (0.66 if heavy else 0.6)
    if fac == 'ger':
        if heavy:
            pts = [(x, y * k, z) for (x, y, z0_) in T.ring(0, tl / 2, tW / 2, 0, 20, 1.0, 1.0) for (z, k) in ((hH, 1.0), (tH, 0.97))]
            pts = [(p[0] if p[0] < 0 else min(p[0], tl * 0.42), p[1], p[2]) for p in pts]
        else:
            base = [(-tl / 2, -tW / 2), (tl * 0.32, -tW / 2), (tl / 2, -tW * 0.3), (tl / 2, tW * 0.3), (tl * 0.32, tW / 2), (-tl / 2, tW / 2)]
            pts = [(x, y, hH) for x, y in base] + [(x * 0.92, y * 0.82, tH) for x, y in base]
        T.hull('turret', pts, paint)
        # корзина / ящик сзади
        T.box('bin', -tl / 2 - (3 if heavy else 2.3), -tl / 2 + 0.3, -tW * 0.38, tW * 0.38, hH + 1, tH - 0.6, paint)
        T.tube('cup', (-tl * 0.18, -tW * 0.22, tH - 0.2), (-tl * 0.18, -tW * 0.22, tH + 1.4), tW * 0.17, tW * 0.15, paint)
        for s in (-1, 1):
            T.cross('tcr%d' % s, -tl * 0.05, s * (tW / 2 * (0.97 if heavy else 0.88) + 0.02), (hH + tH) / 2, 0.9, s)
    else:
        bustle = 1.25 if fac == 'usa' else 1.05
        rings = [(hH, 1.0), (hH + (tH - hH) * 0.55, 0.93), (tH, 0.72)]
        pts = []
        for z, k in rings:
            pts += T.ring(-tl * 0.04, tl / 2 * k, tW / 2 * k, z, 22, bustle, 0.95)
        T.hull('turret', pts, paint, 0.1, smooth_angle=35)
        T.tube('cup', (-tl * 0.12, -tW * 0.2, tH - 0.3), (-tl * 0.12, -tW * 0.2, tH + 1.1), tW * 0.15, tW * 0.14, paint)
        T.tube('hat2', (-tl * 0.12, tW * 0.2, tH - 0.3), (-tl * 0.12, tW * 0.2, tH + 0.35), tW * 0.12, tW * 0.11, paint)
        if fac == 'usa':
            T.tube('mg50', (-tl * 0.05, -tW * 0.2, tH + 1.6), (tl * 0.45, -tW * 0.2, tH + 1.6), 0.18, 0.15, steel)
            T.box('mg50b', -tl * 0.12, tl * 0.02, -tW * 0.25, -tW * 0.15, tH + 1.1, tH + 1.9, steel, 0.05)
            T.tube('mg50p', (-tl * 0.1, -tW * 0.2, tH), (-tl * 0.1, -tW * 0.2, tH + 1.2), 0.12, 0.12, steel)
        if fac == 'ussr':
            for s in (-1, 1):
                T.star('tst%d' % s, -tl * 0.05, s * (tW / 2 * 0.93 + 0.05), (hH + tH) / 2 + 0.4, 1.1, mat_flat('red', (0.7, 0.04, 0.03, 1)), 'side', s)
    # маска и ствол
    bz = (hH + tH) / 2
    barrel = L * (0.8 if heavy else 0.52 if light else 0.72)
    bw = 2.8 if heavy else 1.8 if light else 2.3
    bx0 = tl * 0.35
    if fac == 'ger' and heavy:
        T.tube('mant', (bx0 - 0.5, -tW * 0.32, bz), (bx0 - 0.5, tW * 0.32, bz), bw * 0.95, bw * 0.95, paint)
    elif fac == 'ussr':
        T.hull('mant', T.ring(bx0 + 0.2, 1.2, tW * 0.28, bz - bw * 0.7, 10) + T.ring(bx0 + 0.2, 1.2, tW * 0.28, bz + bw * 0.7, 10), paint, 0.1, 35)
    else:
        T.box('mant', bx0 - 0.6, bx0 + 1.2, -tW * 0.3, tW * 0.3, bz - bw * 0.75, bz + bw * 0.75, paint, 0.3)
    T.tube('barrel', (bx0 + 0.5, 0, bz), (bx0 + barrel, 0, bz), bw * 0.36, bw * 0.27, paint)
    if typ != 'light':
        T.tube('brake', (bx0 + barrel - 2.4, 0, bz), (bx0 + barrel + 0.2, 0, bz), bw * 0.48, bw * 0.48, paint, 12)
        if fac == 'ger':
            T.tube('brake2', (bx0 + barrel - 1.2, 0, bz), (bx0 + barrel - 1.0, 0, bz), bw * 0.3, bw * 0.3, dark, 12)
    T.tube('bore', (bx0 + barrel + 0.15, 0, bz), (bx0 + barrel + 0.25, 0, bz), bw * 0.2, bw * 0.2, dark, 12)
    T.tube('coax', (bx0 + 0.8, -tW * 0.14, bz + 0.2), (bx0 + 2.2, -tW * 0.14, bz + 0.2), 0.15, 0.12, steel)


# ------------------------------------------------------------------ грузовик
def build_truck(fac, root):
    L, W = 26, 12
    B = Builder(root)
    paint = mat_paint('paint_' + fac, FACTION_PAINT[fac])
    canvas = mat_paint('canvas_' + fac, CANVAS[fac], 0.9, 0.35, 0, 0.2)
    wood = mat_paint('wood', '#6b5238', 0.8, 0.2, 0, 0.4)
    rubber = mat_flat('rubber', (0.025, 0.025, 0.022, 1), 0.9)
    dark = mat_flat('dark', (0.02, 0.02, 0.018, 1), 0.8)
    glass = mat_flat('glass', (0.03, 0.04, 0.05, 1), 0.1, 0.0)
    steel = mat_flat('steel', (0.05, 0.05, 0.045, 1), 0.45, 0.8)
    wr = 2.4
    for x in (-L * 0.33, -L * 0.12, L * 0.32):
        for s in (-1, 1):
            B.wheel('wh%d%d' % (int(x), s), x, s * (W / 2 - 1.1), wr, wr, 1.8, rubber, paint)
    B.box('frame', -L / 2 + 0.5, L / 2 - 1, -W * 0.3, W * 0.3, 2.0, 3.4, dark, 0.1)
    # кузов
    B.box('bed', -L / 2, L * 0.16, -W / 2, W / 2, 3.8, 4.6, wood, 0.1)
    for s in (-1, 1):
        B.box('side%d' % s, -L / 2, L * 0.16, s * W / 2 - 0.25, s * W / 2 + 0.25 * (-s) + 0.0001, 4.6, 6.6, wood, 0.08)
    arc = []
    for i in range(9):
        a = math.pi * i / 8
        arc.append((math.cos(a) * (W / 2 - 0.1), 6.4 + math.sin(a) * 4.6 * 0.95))
    pts = [(x, y, z) for x in (-L / 2 + 0.3, L * 0.15) for (y, z) in arc] + [(x, y, 4.6) for x in (-L / 2 + 0.3, L * 0.15) for y in (-W / 2 + 0.1, W / 2 - 0.1)]
    B.hull('tent', pts, canvas, 0.25, smooth_angle=30)
    # кабина
    cx0, cx1 = L * 0.18, L * 0.37
    B.hull('cab', [(cx0, y, 4.0) for y in (-W / 2 + 0.6, W / 2 - 0.6)] + [(cx1, y, 4.0) for y in (-W / 2 + 0.6, W / 2 - 0.6)] +
           [(cx0, y, 11.4) for y in (-W / 2 + 0.9, W / 2 - 0.9)] + [(cx1 - 0.8, y, 11.4) for y in (-W / 2 + 0.9, W / 2 - 0.9)], paint)
    B.hull('wind', [(cx1 - 0.25, y, 8.2) for y in (-W / 2 + 1.3, W / 2 - 1.3)] + [(cx1 - 0.85, y, 11.0) for y in (-W / 2 + 1.4, W / 2 - 1.4)] +
           [(cx1 - 0.1, y, 8.2) for y in (-W / 2 + 1.3, W / 2 - 1.3)], glass, 0)
    for s in (-1, 1):
        B.box('sw%d' % s, cx0 + 0.8, cx1 - 1.4, s * (W / 2 - 0.62) - 0.05, s * (W / 2 - 0.62) + 0.05, 8.0, 10.6, glass, 0)
    # капот
    B.hull('hood', [(L * 0.36, y, 4.2) for y in (-W * 0.34, W * 0.34)] + [(L / 2 - 0.4, y, 4.2) for y in (-W * 0.3, W * 0.3)] +
           [(L * 0.36, y, 8.6) for y in (-W * 0.27, W * 0.27)] + [(L / 2 - 0.6, y, 8.2) for y in (-W * 0.24, W * 0.24)], paint, 0.3)
    B.box('grille', L / 2 - 0.5, L / 2 - 0.2, -W * 0.22, W * 0.22, 4.6, 7.9, dark, 0.05)
    # крылья
    for s in (-1, 1):
        B.hull('fend%d' % s, [(L * 0.32 + dx, s * (W / 2 - 1.1) + dy, z) for dx, z in ((-3.4, 4.0), (-2.2, 5.6), (2.2, 5.6), (3.2, 4.4))
                               for dy in (-1.1, 1.1)], paint, 0.2)
        B.tube('lamp%d' % s, (L / 2 - 1.2, s * W * 0.33, 6.2), (L / 2 - 0.2, s * W * 0.33, 6.2), 0.55, 0.6, dark)
    B.box('bumper', L / 2 - 0.6, L / 2 + 0.2, -W / 2 + 0.6, W / 2 - 0.6, 2.6, 3.4, steel, 0.08)
    if fac == 'usa':
        B.star('door', (cx0 + cx1) / 2, -(W / 2 - 0.55), 6.8, 1.1, mat_flat('white', (0.75, 0.75, 0.72, 1)))
        B.star('door2', (cx0 + cx1) / 2, (W / 2 - 0.55), 6.8, 1.1, mat_flat('white', (0.75, 0.75, 0.72, 1)))


# ------------------------------------------------------------------ орудия
def build_gun(fac, how, root):
    L, W = (24, 16) if how else (20, 14)
    B = Builder(root)
    paint = mat_paint('paint_' + fac, FACTION_PAINT[fac])
    rubber = mat_flat('rubber', (0.025, 0.025, 0.022, 1), 0.9)
    dark = mat_flat('dark', (0.02, 0.02, 0.018, 1), 0.8)
    steel = mat_flat('steel', (0.05, 0.05, 0.045, 1), 0.45, 0.8)
    wr = 3.6 if how else 2.9
    for s in (-1, 1):
        B.wheel('wh%d' % s, 0, s * (W / 2 - 0.9), wr, wr, 1.3 if how else 1.0, rubber, paint)
    B.tube('axle', (0, -W / 2 + 1, wr), (0, W / 2 - 1, wr), 0.45, 0.45, steel)
    # станины
    for s in (-1, 1):
        B.beam('trail%d' % s, (0, s * 1.3, wr - 1.0), (-L * 0.7, s * W * 0.36, 0.2), 1.0 if how else 0.8, 1.0, paint)
        B.box('spade%d' % s, -L * 0.72, -L * 0.68, s * W * 0.36 - 1.0, s * W * 0.36 + 1.0, 0, 1.8, paint, 0.05)
    B.box('cradle', -3, 3.5, -1.3, 1.3, wr - 0.6, wr + 1.2, paint, 0.2)
    # щит
    sh_h = 9.5 if how else 8.6
    B.hull('shield', [(2.6, y, 2.4) for y in (-W * 0.44, W * 0.44)] + [(3.2, y, 2.4) for y in (-W * 0.44, W * 0.44)] +
           [(1.8, y, sh_h) for y in (-W * 0.36, W * 0.36)] + [(2.4, y, sh_h) for y in (-W * 0.36, W * 0.36)], paint, 0.12)
    if how:
        pitch = math.radians(14)
        bz, bl, r = 8.0, L * 0.72, 1.05
        p0 = (-4, 0, bz - 4 * math.sin(pitch) * -1 - 0.0)
        tip = (bl * math.cos(pitch), 0, bz + bl * math.sin(pitch))
        B.tube('barrel', (-4 * math.cos(pitch), 0, bz - 4 * math.sin(pitch)), tip, r, r * 0.85, paint)
        B.tube('recup', (-3 * math.cos(pitch), 0, bz + 1.3 - 3 * math.sin(pitch)), (6 * math.cos(pitch), 0, bz + 1.3 + 6 * math.sin(pitch)), 0.7, 0.7, paint)
        B.tube('breech', (-5 * math.cos(pitch), 0, bz - 5 * math.sin(pitch)), (-2.5 * math.cos(pitch), 0, bz - 2.5 * math.sin(pitch)), 1.5, 1.5, paint, 12)
        B.tube('bore', (tip[0] + 0.05, 0, tip[2] + 0.02), (tip[0] + 0.15, 0, tip[2] + 0.05), r * 0.6, r * 0.6, dark)
    else:
        bz, bl = 6.0, L * 0.95
        B.tube('barrel', (-3, 0, bz), (bl, 0, bz), 0.55, 0.4, paint)
        B.tube('recoil', (-2.5, 0, bz - 0.9), (5, 0, bz - 0.9), 0.6, 0.6, paint)
        B.tube('breech', (-4, 0, bz), (-2, 0, bz), 1.0, 1.0, paint, 12)
        B.tube('brake', (bl - 1.6, 0, bz), (bl + 0.1, 0, bz), 0.85, 0.85, paint, 12)
        B.tube('bore', (bl + 0.05, 0, bz), (bl + 0.15, 0, bz), 0.3, 0.3, dark)


# ------------------------------------------------------------------ пехота
INF_COL = {  # форма, каска, снаряжение
    'ger': ('#5d6152', '#4a4e44', '#3d3a30'),
    'usa': ('#7a7250', '#5b5634', '#6e6448'),
    'ussr': ('#7c7650', '#46562d', '#5a4a34'),
}
POSES = ['stand', 'aim', 'w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'prone']


def ik(sh, hand, l1=2.0, l2=2.0, hint=Vector((0, 0, -1))):
    d = hand - sh
    L = d.length
    if L >= l1 + l2 - 0.01:
        return sh + d * (l1 / (l1 + l2))
    a = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    dn = d.normalized()
    perp = hint - dn * hint.dot(dn)
    if perp.length < 1e-4: perp = Vector((0, 0, -1))
    return sh + dn * a + perp.normalized() * h


def build_soldier(fac, wt, pose, root):
    B = Builder(root)
    uni, helm, gear = INF_COL[fac]
    if wt == 'sniper':
        uni = {'ger': '#4f5a40', 'usa': '#5a5e3c', 'ussr': '#56603a'}[fac]
    m_uni = mat_paint('uni_' + fac + wt, uni, 0.9, 0.35, 0, 0.25)
    m_helm = mat_paint('helm_' + fac, helm, 0.6, 0.1, 0, 0.2)
    m_gear = mat_paint('gear_' + fac, gear, 0.85, 0.1, 0, 0.2)
    m_skin = mat_flat('skin', lin('#c99a76'), 0.6)
    m_boot = mat_flat('boot', lin('#2a2018'), 0.6)
    m_legg = mat_paint('legg', '#9c8f68', 0.9, 0.3, 0, 0.2)   # брезентовые гетры (США)
    m_wood = mat_paint('gunwood', '#5a3e26', 0.6, 0.0, 0, 0.2)
    m_metal = mat_flat('gunmetal', (0.03, 0.03, 0.03, 1), 0.4, 0.7)
    V = lambda x, y, z: Vector((x, y, z))   # игровые координаты (Builder сам переворачивает y)

    def limb(name, a, b, r0, r1, mat):
        B.tube(name, tuple(a), tuple(b), r0, r1, mat, 10)

    def ball(name, c, r, mat):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=r, matrix=Matrix.Translation(B.G(*c)))
        B._obj(name, bm, mat, 0, 60)

    def helmet(head, kind):
        if kind == 'ger':
            pts = []
            for i in range(14):
                a = i / 14 * 6.283
                for (r, z) in ((0.95, -0.55), (0.85, 0.15), (0.55, 0.62)):
                    x = head.x + math.cos(a) * r
                    zz = head.z + z - (0.18 if (x < head.x - 0.2 and z < 0) else 0)
                    pts.append((x, math.sin(a) * r, zz))
        else:
            rim = 1.08 if kind == 'usa' else 0.98
            pts = [(head.x + math.cos(a) * r, math.sin(a) * r, head.z + z) for a in [i / 16 * 6.283 for i in range(16)]
                   for (r, z) in ((rim, -0.05), (rim * 0.95, 0.08), (0.8, 0.45), (0.45, 0.72))]
        B.hull('helmet', pts, m_helm, 0.05, 40)

    prone = pose == 'prone'
    walk = pose.startswith('w')
    ph = int(pose[1]) / 6.0 if walk else 0.0
    if not prone:
        hipz = 5.3
        legs = []
        for side, off in ((-1, 0.0), (1, 0.5)):
            a = math.sin((ph + off) * 2 * math.pi) * math.radians(28) if walk else 0.0
            bend = max(0.0, math.sin((ph + off) * 2 * math.pi + 1.2)) * math.radians(40) if walk else 0.0
            if pose == 'aim': a = math.radians(14 if side < 0 else -12)
            hip = V(0, side * 0.62, hipz)
            knee = hip + V(math.sin(a), 0, -math.cos(a)) * 2.6
            foot = knee + V(math.sin(a - bend), 0, -math.cos(a - bend)) * 2.6
            legs.append([hip, knee, foot])
        lift = -min(l[2].z for l in legs) + 0.35
        for i, (hip, knee, foot) in enumerate(legs):
            hip.z += lift; knee.z += lift; foot.z += lift
            limb('thigh%d' % i, hip, knee, 0.62, 0.5, m_uni)
            limb('shin%d' % i, knee, foot, 0.48, 0.42, m_legg if fac == 'usa' else m_boot)
            B.box('boot%d' % i, foot.x - 0.45, foot.x + 0.9, foot.y - 0.35, foot.y + 0.35, foot.z - 0.35, foot.z + 0.25, m_boot, 0.12)
        hz = hipz + lift
        lean = 0.5 if walk else 0.25
        pelvis = V(0, 0, hz)
        chest = V(lean, 0, hz + 3.3)
        pts = [(pelvis.x + dx, dy, pelvis.z + dz) for dx in (-0.55, 0.55) for dy in (-0.85, 0.85) for dz in (-0.3, 0.3)]
        pts += [(chest.x + dx, dy, chest.z + dz) for dx in (-0.6, 0.55) for dy in (-1.15, 1.15) for dz in (-0.3, 0.25)]
        B.hull('torso', pts, m_uni, 0.3, 30)
        if fac == 'ussr':   # скатка шинели через плечо
            B.tube('roll', (chest.x - 0.1, -1.0, chest.z + 0.1), (pelvis.x + 0.2, 0.8, pelvis.z + 0.4), 0.42, 0.42, m_gear, 10)
        B.box('belt', pelvis.x - 0.62, pelvis.x + 0.62, -0.9, 0.9, pelvis.z + 0.15, pelvis.z + 0.55, m_gear, 0.1)
        B.box('pack', chest.x - 1.25, chest.x - 0.55, -0.75, 0.75, chest.z - 2.2, chest.z - 0.1, m_gear, 0.2)
        if fac == 'ger':   # футляр противогаза и котелок
            B.tube('gasm', (pelvis.x - 0.75, 0.55, pelvis.z - 0.2), (pelvis.x - 0.85, 0.55, pelvis.z + 1.3), 0.33, 0.33, mat_paint('gasm', '#5b5e4c', 0.6, 0.1), 12)
            B.tube('mess', (pelvis.x - 0.7, -0.6, pelvis.z + 0.3), (pelvis.x - 0.95, -0.6, pelvis.z + 0.3), 0.35, 0.35, m_gear, 12)
        else:
            B.tube('cant', (pelvis.x - 0.7, -0.75, pelvis.z - 0.1), (pelvis.x - 0.7, -0.75, pelvis.z + 0.6), 0.28, 0.28, m_gear, 10)
        for j in (-1, 1):   # подсумки на ремне
            B.box('pouch%d' % j, pelvis.x + 0.45, pelvis.x + 0.75, j * 0.25, j * 0.75, pelvis.z, pelvis.z + 0.55, m_gear, 0.05)
        head = chest + V(0.15, 0, 1.25)
        sh_r, sh_l = chest + V(0.05, 1.05, 0.0), chest + V(0.05, -1.05, 0.0)
    else:
        pelvis, chest = V(-2.2, 0, 0.95), V(1.0, 0, 1.15)
        pts = [(pelvis.x + dx, dy, pelvis.z + dz) for dx in (-0.6, 0.6) for dy in (-0.85, 0.85) for dz in (-0.55, 0.45)]
        pts += [(chest.x + dx, dy, chest.z + dz) for dx in (-0.5, 0.4) for dy in (-1.15, 1.15) for dz in (-0.6, 0.5)]
        B.hull('torso', pts, m_uni, 0.3, 30)
        B.box('pack', -1.6, 0.6, -0.7, 0.7, 1.4, 2.1, m_gear, 0.2)
        for i, side in enumerate((-1, 1)):
            hip = V(-2.6, side * 0.6, 0.85)
            knee = hip + V(-2.6, side * 0.35, -0.2)
            foot = knee + V(-2.5, side * 0.25, -0.1)
            limb('thigh%d' % i, hip, knee, 0.6, 0.5, m_uni)
            limb('shin%d' % i, knee, foot, 0.48, 0.42, m_boot)
            B.box('boot%d' % i, foot.x - 0.6, foot.x + 0.2, foot.y - 0.35, foot.y + 0.35, foot.z - 0.3, foot.z + 0.6, m_boot, 0.12)
        head = V(2.0, 0, 1.75)
        sh_r, sh_l = chest + V(0.3, 1.05, 0.0), chest + V(0.3, -1.05, 0.0)
    ball('head', head, 0.62, m_skin)
    helmet(head, fac)

    # ---- оружие
    # длины оружия в масштабе фигуры (≈6,2 ед. на метр): Kar98k 1,11 м, Мосинка 1,23, Garand 1,1, MP 40 0,83,
    # ППШ 0,84, Томпсон 0,86, MG 42 1,22, ДП 1,27, M1919A6 1,35, Панцершрек 1,64, Базука 1,55, ПТРД 2,0
    WL = {'ger': {'rifle': 6.9, 'sniper': 6.9, 'smg': 5.1, 'mg': 7.5, 'at': 10.1},
          'usa': {'rifle': 6.8, 'sniper': 6.8, 'smg': 5.3, 'mg': 8.3, 'at': 9.6},
          'ussr': {'rifle': 7.6, 'sniper': 7.6, 'smg': 5.2, 'mg': 7.8, 'at': 12.4}}
    long_w = WL[fac][wt]
    tube_at = wt == 'at' and fac != 'ussr'          # Панцершрек/базука; у СССР — ПТРД
    if prone:
        butt = sh_r + V(-0.2, -0.5, 0.15); dirv = V(1, 0, 0.03).normalized()
    elif pose == 'aim':
        butt = sh_r + V(0.1, -0.45, 0.35 if tube_at else 0.05); dirv = V(1, 0, 0.0)
        if wt == 'mg': butt = chest + V(0.1, 0.6, -1.6); dirv = V(1, 0, 0.08).normalized()
    elif tube_at:
        butt = sh_r + V(-1.6, -0.4, 0.45); dirv = V(1, 0, 0.12).normalized()
    elif wt == 'mg':
        butt = chest + V(-0.3, 0.7, -1.9); dirv = V(1, -0.15, 0.25).normalized()
    else:
        butt = chest + V(-0.2, 0.75, -1.7); dirv = V(0.75, -0.35, 0.6).normalized()
    muzzle = butt + dirv * long_w
    if tube_at:
        B.tube('tube', tuple(butt - dirv * 0.5), tuple(muzzle), 0.42, 0.42, m_helm if fac == 'ger' else m_gear, 12)
        if fac == 'ger':
            c = butt + dirv * 1.7
            B.box('shield', c.x, c.x + 0.15, c.y - 0.9, c.y + 0.9, c.z - 0.4, c.z + 1.0, m_helm, 0.02)
        grip_r, grip_l = butt + dirv * 1.6 + V(0, 0, -0.4), butt + dirv * 3.0 + V(0, 0, -0.4)
    else:
        stock = butt + dirv * (long_w * 0.32)
        thick = 0.42 if wt == 'mg' else 0.3
        B.tube('stock', tuple(butt), tuple(stock), thick * 0.9, thick * 0.7, m_metal if (wt == 'smg' and fac != 'ussr') else m_wood, 8)
        B.tube('body', tuple(stock), tuple(butt + dirv * (long_w * 0.7)), thick * 0.7, thick * 0.6, m_metal if wt == 'mg' else m_wood, 8)
        B.tube('barrel', tuple(butt + dirv * (long_w * 0.6)), tuple(muzzle), 0.2 if wt == 'mg' else 0.14, 0.12, m_metal, 8)
        d = butt + dirv * (long_w * 0.5)
        if wt == 'smg' and fac == 'ussr':
            B.tube('drum', tuple(d + V(0, 0, -0.1)), tuple(d + V(0, 0, -0.8)), 0.55, 0.55, m_metal, 12)
        if wt == 'mg' and fac == 'ussr':
            B.tube('pan', tuple(d + V(0, 0, 0.3)), tuple(d + V(0, 0, 0.55)), 0.9, 0.9, m_metal, 14)
        elif wt == 'mg':
            B.box('mag', d.x - 0.3, d.x + 0.3, d.y - 0.15, d.y + 0.15, d.z - 0.9, d.z, m_metal, 0.03)
        if wt == 'rifle' and fac == 'ussr':   # штык
            B.tube('bayo', tuple(muzzle), tuple(muzzle + dirv * 2.6), 0.07, 0.03, m_metal, 6)
        if wt == 'smg' and fac != 'ussr':
            B.box('smag', d.x - 0.15, d.x + 0.15, d.y - 0.12, d.y + 0.12, d.z - 1.3, d.z, m_metal, 0.02)
        if wt == 'mg' and fac == 'ger':      # кожух ствола MG 42
            B.tube('jack', tuple(butt + dirv * (long_w * 0.55)), tuple(butt + dirv * (long_w * 0.9)), 0.32, 0.3, m_metal, 10)
        if wt == 'at' and fac == 'ussr':     # ПТРД: дульный тормоз и сошки
            B.tube('ptrb', tuple(muzzle - dirv * 0.6), tuple(muzzle), 0.24, 0.24, m_metal, 10)
        if wt == 'sniper':
            s0 = butt + dirv * 1.8 + V(0, 0, 0.45)
            B.tube('scope', tuple(s0), tuple(s0 + dirv * 1.6), 0.2, 0.2, m_metal, 10)
        grip_r = butt + dirv * (long_w * 0.3) + V(0, 0, -0.2)
        grip_l = butt + dirv * (long_w * (0.62 if wt == 'smg' else 0.55)) + V(0, 0, -0.15)
    if prone and wt == 'mg':
        b0 = muzzle - dirv * 1.2
        for s2 in (-1, 1):
            B.tube('bip%d' % s2, tuple(b0), (b0.x + 0.3, b0.y + s2 * 0.5, 0.0), 0.08, 0.08, m_metal, 6)
    # ---- руки
    for name, sh, hand, hint in (('armr', sh_r, grip_r, V(-0.3, 1, -1)), ('arml', sh_l, grip_l, V(-0.2, -1, -1))):
        el = ik(sh, hand, 1.9, 1.9, hint)
        limb(name + 'u', sh, el, 0.45, 0.38, m_uni)
        limb(name + 'f', el, hand, 0.36, 0.3, m_uni)
        ball(name + 'h', hand, 0.3, m_skin)


# ------------------------------------------------------------------ рендер
def make_root(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.scale = (1, 1, SQ)
    return e


def set_visible(root, v, camera=True):
    for ob in root.children:
        ob.hide_render = not v
        ob.visible_camera = camera


def render_set(sc, root, prefix, catcher=True, n=None):
    n = n or DIRS
    cat = bpy.data.objects['catcher']; cat.hide_render = not catcher
    for i in range(n):
        a = i / n * math.pi * 2
        root.rotation_euler = (0, 0, -a)
        sc.render.filepath = os.path.join(OUT, '%s_%02d.png' % (prefix, i))
        bpy.ops.render.render(write_still=True)


def models():
    out = []
    for fac in ('ger', 'usa', 'ussr'):
        for t in ('light', 'medium', 'heavy'):
            out.append((fac + '_' + t, 'tank', fac, t))
        out.append((fac + '_truck', 'truck', fac, None))
        out.append((fac + '_atgun', 'gun', fac, False))
        out.append((fac + '_howitzer', 'gun', fac, True))
    for n in ('prop_fence_x', 'prop_fence_y', 'prop_fencebr_x', 'prop_fencebr_y', 'prop_hay', 'prop_pole_x', 'prop_pole_y',
              'prop_well', 'prop_shed', 'prop_cart', 'prop_woodpile', 'prop_barrels', 'prop_crates', 'prop_stump', 'prop_rock',
              'prop_hedgehog', 'prop_wire_x', 'prop_wire_y'):
        out.append((n, 'prop', None, None))
    for fac in ('ger', 'usa', 'ussr'):
        for wt in ('rifle', 'smg', 'mg', 'at', 'sniper'):
            out.append((fac + '_inf_' + wt, 'inf', fac, wt))
    return out


def main():
    import time, json
    here = os.path.dirname(os.path.abspath(__file__))
    exec(open(os.path.join(here, 'blender_vehicles.py'), encoding='utf-8').read(), globals())
    exec(open(os.path.join(here, 'blender_props.py'), encoding='utf-8').read(), globals())
    exec(open(os.path.join(here, 'blender_infantry.py'), encoding='utf-8').read(), globals())
    global S
    meta_path = os.path.join(OUT, 'meta.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for name, kind, fac, arg in models():
        if ONLY and name not in ONLY: continue
        t0 = time.time()
        if kind == 'prop':
            fn, fw, fh = PROPS[name]
            sc = setup_scene(fw, fh, 32); MATS.clear()
            r = make_root('obj')
            fn(r)
            render_set(sc, r, name + '_h', True, 1)
            print('DONE', name, round(time.time() - t0, 1), 's', flush=True)
            continue
        S = 3.0
        if kind == 'inf':
            S = 5.0   # пехота крупнее: чёткая и при сильном приближении
            for pose in POSES:
                sc = setup_scene(200, 184, 24); MATS.clear()
                r = make_root('obj')
                r.scale = (0.8, 0.8, 0.8 * SQ)   # рост ≈ 1,78 м ×1,1 в масштабе техники
                build_soldier(fac, arg, pose, r)
                render_set(sc, r, name + '_' + pose, True, IDIRS)
            print('DONE', name, round(time.time() - t0, 1), 's', flush=True)
            continue
        sc = setup_scene(); MATS.clear()
        vk, fn = VEHICLES[name]
        if vk == 'tank':
            hr, tr = make_root('hull'), make_root('tur')
            m = fn(hr, tr, fac)
            set_visible(tr, False); set_visible(hr, True)
            render_set(sc, hr, name + '_h', True)
            set_visible(hr, False); set_visible(tr, True)
            render_set(sc, tr, name + '_t', False)
        else:
            r = make_root('obj')
            m = fn(r, fac)
            render_set(sc, r, name + '_h', True)
        if m:   # в игровых единицах
            out = {}
            if 'to' in m: out['to'] = [round(v * K, 2) for v in m['to']]
            out['mr'] = round(m['mr'] * K, 2); out['mz'] = round(m['mz'] * K, 2)
            meta[name] = out
            json.dump(meta, open(meta_path, 'w'), indent=1)
        print('DONE', name, round(time.time() - t0, 1), 's', flush=True)


main()
