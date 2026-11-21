"""Крупное превью модели танка (для сверки с фотографиями), без игровой проекции.

Запуск (из папки tools):
  blender\\blender-4.5.16-windows-x64\\blender.exe -b -P preview_tank.py -- <out.png> <модель, напр. ussr_medium>
Рисует 3 ракурса: спереди-сбоку (как на фото), строго сбоку, сверху-сзади.
"""
import os, sys, math
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:]
OUTPNG, NAME = args[0], args[1]
sys.argv = [sys.argv[0], '--', os.path.join(here, '_prev_tmp')]
src = open(os.path.join(here, 'blender_units.py'), encoding='utf-8').read()
src = src[:src.rstrip().rfind('main()')]
exec(compile(src, 'blender_units.py', 'exec'), globals())
exec(open(os.path.join(here, 'blender_vehicles.py'), encoding='utf-8').read(), globals())
import bpy
from mathutils import Vector

VIEWS = [(35, 12, 'fr'), (90, 2, 'side'), (215, 28, 'rear')]   # азимут от носа, высота камеры (град)


def go():
    sc = setup_scene(900, 520, 48)
    hr, tr = make_root('hull'), make_root('tur')
    for r in (hr, tr): r.scale = (1, 1, 1)
    fac = NAME.split('_')[0]
    vk, fn = VEHICLES[NAME]
    fn(hr, tr, fac)
    set_visible(hr, True); set_visible(tr, True)
    cam = sc.camera
    cam.data.type = 'PERSP'; cam.data.lens = 50
    bpy.data.objects['catcher'].hide_render = False
    tmp = []
    for az, el, tag in VIEWS:
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.cos(a) * math.cos(e), -math.sin(a) * math.cos(e), math.sin(e)))
        tgt = Vector((0.3 * K, 0, 1.2 * K))
        cam.location = tgt + d * 13.5 * K
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        p = os.path.join(here, '_prev_tmp', NAME + '_' + tag + '.png')
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        tmp.append(p)
    # склеить в столбик
    imgs = [bpy.data.images.load(p) for p in tmp]
    W, H = imgs[0].size
    out = bpy.data.images.new('sheet', W, H * len(imgs), alpha=True)
    px = []
    for im in reversed(imgs):   # у Blender строки снизу вверх
        px.extend(im.pixels[:])
    out.pixels[:] = px
    out.filepath_raw = OUTPNG; out.file_format = 'PNG'; out.save()
    print('PREVIEW', OUTPNG)


go()
