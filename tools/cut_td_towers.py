# 從守塔塔種設定圖（4 條塔線 × 3 級 + 2 專精）裁出每座塔的貼圖並去背。
# 用法：python3 tools/cut_td_towers.py [assets/td/tower_sheet.jpeg]  → assets/td/<塔線>_<階段>.png
#
# 背景是純灰底＋綠色等角格線：從裁切框四邊做洪水填充，只吃「接近底色的灰」或「偏綠的格線」像素，
# 塔身內部的綠色（弓箭手、陸戰隊）因為不和邊緣連通而保留。最後丟掉太小的殘塊（格線斷點、雜訊）。
import sys
from collections import deque
import numpy as np
from PIL import Image

# 名稱 → 裁切框 (x0, y0, x1, y1)，座標以 1024×559 原圖為準；避開左側的文字與圖示欄
CELLS = {
    'guard_1': (140, 38, 280, 130), 'guard_2': (140, 132, 280, 232), 'guard_3': (140, 232, 221, 338),
    'guard_missile': (145, 342, 300, 438), 'guard_multishot': (150, 440, 300, 556),
    'arcane_1': (360, 38, 510, 130), 'arcane_2': (360, 132, 510, 232), 'arcane_3': (350, 228, 520, 340),
    'arcane_storm': (382, 338, 548, 430), 'arcane_frost': (392, 436, 528, 556),
    'cannon_1': (600, 50, 730, 125), 'cannon_2': (600, 136, 730, 232), 'cannon_3': (600, 232, 735, 338),
    'cannon_siege': (605, 342, 786, 432), 'cannon_flamestrike': (598, 440, 786, 556),
    'barracks_1': (838, 46, 990, 130), 'barracks_2': (838, 134, 1000, 232), 'barracks_3': (838, 238, 1000, 336),
    'barracks_knight': (846, 340, 1000, 444), 'barracks_bunker': (838, 452, 1010, 556),
}


BG = 53   # 設定圖底色是純中性灰 (53,53,53)；塔身的深色金屬偏藍或更暗，差距 > 10 就不會被吃掉


def is_bg(px):
    r, g, b = px
    gray = max(abs(r - BG), abs(g - BG), abs(b - BG)) <= 10 and max(px) - min(px) <= 6
    grid = g - max(r, b) >= 6 and r < 100   # 綠色等角格線與格子分隔線（JPEG 壓縮後偏綠程度只剩 6~8）
    return gray or grid


def cut(img, box):
    x0, y0, x1, y1 = box
    a = img[y0:y1, x0:x1].astype(int)
    h, w, _ = a.shape
    bg = np.zeros((h, w), bool)
    q = deque([(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)])
    while q:
        y, x = q.popleft()
        if bg[y, x] or not is_bg(a[y, x]):
            continue
        bg[y, x] = True
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx]:
                q.append((ny, nx))
    # 去掉小殘塊：前景連通塊小於 90 像素的視為格線斷點／隔壁格的火焰碎片
    fg = ~bg
    seen = np.zeros_like(fg)
    for sy in range(h):
        for sx in range(w):
            if not fg[sy, sx] or seen[sy, sx]:
                continue
            comp, q = [], deque([(sy, sx)])
            seen[sy, sx] = True
            while q:
                y, x = q.popleft()
                comp.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(comp) < 90:
                for y, x in comp:
                    fg[y, x] = False
    rgba = np.dstack([a, (fg * 255)]).astype(np.uint8)
    ys, xs = np.nonzero(fg)
    return Image.fromarray(rgba, 'RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'assets/td/tower_sheet.jpeg'
    img = np.array(Image.open(src).convert('RGB'))
    for name, box in CELLS.items():
        out = cut(img, box)
        out.save(f'assets/td/{name}.png')
        print(name, out.size)
