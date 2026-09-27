# 從《半夜別修仙》風格設定圖裁出角色/敵人貼圖並去背（邊緣洪水填充）。
# 用法：python3 tools/cut_xian_sprites.py <設定圖.png>  → assets/xian/*.png
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

LABEL = 27  # 每格底部名稱條高度
CHARS = (25, 217, [(6, 177, 'xian_sword'), (186, 356, 'xian_talisman'), (365, 536, 'xian_mage'),
                   (544, 715, 'xian_alchemy'), (724, 894, 'xian_zen'), (903, 1074, 'xian_demon')])
ROWS = [
    (245, 397, [(6, 150, 'hound'), (156, 299, 'runner'), (309, 452, 'ink_wolf'), (459, 613, 'ink_gale_wolf'),
                (620, 770, 'brute'), (777, 920, 'warden'), (927, 1074, 'bloater')]),
    (403, 545, [(6, 138, 'ink_boar'), (145, 281, 'ink_boar_king'), (287, 434, 'ink_gas_boar'), (441, 565, 'bat'),
                (571, 696, 'blinker'), (703, 828, 'ink_crow'), (835, 1074, 'ink_shadow_crow')]),
    (551, 705, [(6, 106, 'spitter'), (113, 207, 'mortar'), (213, 315, 'medic'), (322, 407, 'ink_fox'),
                (414, 516, 'ink_fox_guard'), (522, 647, 'ink_fox_spirit'), (654, 767, 'chimera'),
                (774, 872, 'hatcher'), (878, 970, 'ink_ape'), (977, 1074, 'ink_ape_mother')]),
]


# 個別調參 (鄰點色差, 彩度上限, 亮度上限)：暗色毛皮的怪要收緊，彩色背景光的角色要放寬
TUNE = {
    'ink_wolf': (9, 60, 90), 'runner': (9, 60, 90), 'ink_shadow_crow': (8, 60, 85), 'hound': (12, 60, 100),
    'xian_sword': (26, 255, 150), 'xian_demon': (22, 255, 130), 'xian_alchemy': (24, 255, 130),
    'xian_talisman': (22, 255, 120), 'xian_zen': (20, 255, 120), 'xian_mage': (22, 90, 130),
}


def cut(img, x0, y0, x1, y1, name=''):
    dt, sat, lum = TUNE.get(name, (22, 60, 115))
    a = img[y0 + 4:y1 - LABEL, x0 + 4:x1 - 4].astype(int)
    h, w, _ = a.shape
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        q.append((0, x)); q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0)); q.append((y, w - 1))
    # 背景＝從邊緣出發、顏色平滑變化且偏暗灰低彩度的區域
    while q:
        y, x = q.popleft()
        if bg[y, x]:
            continue
        bg[y, x] = True
        c = a[y, x]
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx]:
                n = a[ny, nx]
                if np.abs(n - c).sum() < dt and n.max() - n.min() < sat and n.mean() < lum:
                    q.append((ny, nx))
    # 只保留夠大的前景連通塊 (去掉背景殘留的小碎片)
    fg = ~bg
    lab = np.zeros((h, w), int); sizes = [0]
    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and not lab[sy, sx]:
                k = len(sizes); cnt = 0; st = [(sy, sx)]; lab[sy, sx] = k
                while st:
                    y, x = st.pop(); cnt += 1
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = k; st.append((ny, nx))
                sizes.append(cnt)
    keep = np.array(sizes) >= max(40, max(sizes) * 0.04)
    keep[0] = False
    bg = ~keep[lab]
    alpha = Image.fromarray(((~bg) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.fromarray(a.astype(np.uint8)).convert('RGBA')
    out.putalpha(alpha)
    return out.crop(out.getbbox())


src = np.array(Image.open(sys.argv[1]).convert('RGB'))
y0, y1, cols = CHARS
for x0, x1, name in cols:
    cut(src, x0, y0, x1, y1, name).save(f'assets/xian/{name}.png', optimize=True)
for y0, y1, cols in ROWS:
    for x0, x1, name in cols:
        cut(src, x0, y0, x1, y1, name).save(f'assets/xian/{name}.png', optimize=True)
