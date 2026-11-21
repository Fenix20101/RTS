"""Крупное превью солдата в нескольких позах (проверка модели перед полным рендером).

  blender\\blender-4.5.16-windows-x64\\blender.exe -b -P preview_inf.py -- <out_dir> <модель, напр. ger_inf_rifle> <позы через запятую> [азимут]
Кадры: <out_dir>/<модель>_<поза>.png
"""
import os, sys, math
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:]
OUTD, NAME, PL = args[0], args[1], args[2].split(',')
AZ = float(args[3]) if len(args) > 3 else 35
sys.argv = [sys.argv[0], '--', os.path.join(here, '_prev_tmp')]
src = open(os.path.join(here, 'blender_units.py'), encoding='utf-8').read()
src = src[:src.rstrip().rfind('main()')]
exec(compile(src, 'blender_units.py', 'exec'), globals())
exec(open(os.path.join(here, 'blender_infantry.py'), encoding='utf-8').read(), globals())
import bpy
from mathutils import Vector

fac, _, wt = NAME.split('_')
os.makedirs(OUTD, exist_ok=True)
for pose in PL:
    sc = setup_scene(360, 420, 48); MATS.clear()
    r = make_root('obj'); r.scale = (1, 1, 1)
    build_soldier(fac, wt, pose, r)
    cam = sc.camera
    cam.data.type = 'PERSP'; cam.data.lens = 50
    a, e = math.radians(AZ), math.radians(14)
    d = Vector((math.cos(a) * math.cos(e), -math.sin(a) * math.cos(e), math.sin(e)))
    tgt = Vector((0.5, 0, 2.5 if pose in ('prone',) or pose.startswith('c') else 6.0))
    cam.location = tgt + d * 19
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUTD, '%s_%s.png' % (NAME, pose))
    bpy.ops.render.render(write_still=True)
