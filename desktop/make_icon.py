"""Рисует иконку игры (танк на фоне щита) в icon.ico."""
import os
from PIL import Image, ImageDraw

S = 256
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
# щит
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=40, fill=(43, 50, 32, 255), outline=(217, 180, 90, 255), width=10)
# танк
body = (110, 128, 78, 255)
dark = (40, 40, 36, 255)
d.rounded_rectangle([40, 150, 216, 196], radius=20, fill=dark)          # гусеницы
for x in range(62, 200, 28):
    d.ellipse([x - 12, 160, x + 12, 184], fill=(90, 90, 82, 255))        # катки
d.polygon([(48, 150), (208, 150), (196, 122), (62, 122)], fill=body)     # корпус
d.rounded_rectangle([88, 86, 160, 126], radius=14, fill=body)            # башня
d.rectangle([156, 98, 232, 110], fill=dark)                              # ствол
# звезда
import math
cx, cy, r = 124, 106, 12
pts = []
for i in range(10):
    a = -math.pi / 2 + i * math.pi / 5
    rr = r if i % 2 == 0 else r * 0.42
    pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
d.polygon(pts, fill=(200, 40, 30, 255))

out = os.path.join(os.path.dirname(__file__), 'icon.ico')
img.save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('saved', out)
