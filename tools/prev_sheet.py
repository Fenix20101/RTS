import sys, os
from PIL import Image
d, names, out = sys.argv[1], sys.argv[2].split(','), sys.argv[3]
dirs = [int(x) for x in (sys.argv[4] if len(sys.argv) > 4 else '0,1,2,3').split(',')]
cw, ch = 240, 170
sheet = Image.new('RGBA', (cw * len(dirs), ch * len(names)), (120, 140, 90, 255))
for r, n in enumerate(names):
    for c, i in enumerate(dirs):
        h = Image.open(f'{d}/{n}_h_{i:02d}.png')
        im = Image.new('RGBA', h.size); im.alpha_composite(h)
        t = f'{d}/{n}_t_{i:02d}.png'
        if os.path.exists(t): im.alpha_composite(Image.open(t))
        W, H = im.size
        sheet.alpha_composite(im.crop((W // 2 - cw // 2, H // 2 - 110, W // 2 + cw // 2, H // 2 + 60)), (c * cw, r * ch))
sheet.save(out)
