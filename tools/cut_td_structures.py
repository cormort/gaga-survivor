# 守塔建物：從一張合成設定圖切出 4 種敵人巢穴與 2 種主堡的逐格動畫，去背、以地面接觸點對齊。
# 用法：python3 tools/cut_td_structures.py [assets/td/structures_sheet.jpeg]
#   → assets/td/lair_canyon / lair_swamp / lair_void / lair_hive .png、base_keep / base_reactor .png
#
# 來源圖排法（Gemini 產出的實際排法，不是當初給的規格）：外圍深灰底＋檔名文字，8 塊純色底面板
#   上排 4 塊：巢穴（峽谷/沼澤 洋紅底、虛空/蟲巢 純綠底），每塊 2×2：上列待機、下列出怪中
#   下排 4 塊：主堡左右兩塊、反應爐左右兩塊（洋紅底），每塊 4×4，列由上而下：完好 / 受損 / 危急 / 倒塌。
#             只用左邊那塊：左塊每列 4 格是連續的循環（倒塌列是完好→廢墟）；右塊是更嚴重的變體，
#             接在後面會在循環裡跳一下（倒塌列甚至從廢墟跳回半毀），所以不收
# 面板位置由色底自動偵測（不寫死座標），再等分成格子。
#
# 輸出格式（js/systems/TowerDefense.js 讀取的約定）：
#   巢穴：2 列（待機、出怪中）× 2 欄，每格 LAIR_W×LAIR_H，地面中心在 (LAIR_W/2, LAIR_FOOT)
#   主堡：4 列（完好、受損、危急、倒塌）× 4 欄，每格 BASE_W×BASE_H，地面中心在 (BASE_W/2, BASE_FOOT)
# 輸出存成 256 色調色盤 PNG（像素畫用不到更多色；每張省一半以上，玩家每次換版都要重抓預快取）
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

LAIR_W, LAIR_H, LAIR_FOOT, LAIR_SPAN = 256, 224, 214, 230   # SPAN：第一格縮放到的寬度
BASE_W, BASE_H, BASE_FOOT, BASE_SPAN = 224, 224, 214, 180

LAIRS = ['lair_canyon', 'lair_swamp', 'lair_void', 'lair_hive']


def key_mask(a, kind):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if kind == 'magenta':
        bg = (r - g >= 60) & (b - g >= 60)
        tint = (r - g >= 30) & (b - g >= 25)
    else:
        bg = g - np.maximum(r, b) >= 80
        tint = g - np.maximum(r, b) >= 35
    near = np.zeros_like(bg)
    near[1:] |= bg[:-1]; near[:-1] |= bg[1:]; near[:, 1:] |= bg[:, :-1]; near[:, :-1] |= bg[:, 1:]
    return bg | (tint & near)   # 邊緣的色暈（JPEG）一起去掉


def panels(img):
    """偵測 8 塊純色底面板，回傳 [(x0, y0, x1, y1, 'magenta'|'green')]，依 (列, 欄) 排序"""
    r, g, b = img[..., 0].astype(int), img[..., 1].astype(int), img[..., 2].astype(int)
    out = []
    for kind, m in (('magenta', (r - g >= 80) & (b - g >= 80)), ('green', g - np.maximum(r, b) >= 80)):
        lab, n = ndimage.label(m)
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        for i, sl in enumerate(ndimage.find_objects(lab)):
            if sizes[i] >= 50000:
                out.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop, kind))
    assert len(out) == 8, f'預期 8 塊面板，找到 {len(out)}'
    out.sort(key=lambda p: (round(p[1] / 200), p[0]))
    return out


def cutout(img, box, kind):
    x0, y0, x1, y1 = box
    a = img[y0:y1, x0:x1].astype(int)
    bg = key_mask(a, kind)
    fg = ~bg
    lab, n = ndimage.label(fg)
    if n > 1:   # 只留主體：最大塊＋至少它 4% 大的塊（煙、火、碎石）
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        bg = ~np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= sizes.max() * 0.04])
    return Image.fromarray(np.dstack([a.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)]), 'RGBA')


def ground(im):
    """地面接觸點：最低的不透明列；水平取最下方 10% 高度內不透明像素的中位數"""
    al = np.array(im)[..., 3] > 0
    ys, xs = np.nonzero(al)
    band = ys >= ys.max() - (ys.max() - ys.min()) * 0.10
    return int(np.median(xs[band])), int(ys.max()), xs.max() - xs.min() + 1


def grid(panel, cols, rows):
    x0, y0, x1, y1, kind = panel
    cw, ch = (x1 - x0) / cols, (y1 - y0) / rows
    return [[(int(x0 + c * cw), int(y0 + r * ch), int(x0 + (c + 1) * cw), int(y0 + (r + 1) * ch)) for c in range(cols)] for r in range(rows)]


def assemble(img, rows_of_cells, kind, cw, chh, foot, span, out):
    frames = [[cutout(img, b, kind) for b in row] for row in rows_of_cells]
    scale = span / ground(frames[0][0])[2]   # 第一格（完好／待機）縮到 span 寬，其餘格同比例
    sheet = Image.new('RGBA', (cw * len(frames[0]), chh * len(frames)), (0, 0, 0, 0))
    for r, row in enumerate(frames):
        for c, im in enumerate(row):
            gx, gy, _ = ground(im)
            sm = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
            cell = Image.new('RGBA', (cw, chh), (0, 0, 0, 0))
            cell.alpha_composite(sm, (cw // 2 - round(gx * scale), foot - round(gy * scale)))   # 超出格子的部分自動裁掉
            sheet.alpha_composite(cell, (c * cw, r * chh))
    sheet.quantize(256, method=Image.Quantize.FASTOCTREE).save(f'assets/td/{out}.png', optimize=True)
    print(out, sheet.size, 'scale', round(scale, 3))


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'assets/td/structures_sheet.jpeg'
    img = np.array(Image.open(src).convert('RGB'))
    p = panels(img)
    for name, panel in zip(LAIRS, p[:4]):
        assemble(img, grid(panel, 2, 2), panel[4], LAIR_W, LAIR_H, LAIR_FOOT, LAIR_SPAN, name)
    for name, left in (('base_keep', p[4]), ('base_reactor', p[6])):
        assemble(img, grid(left, 4, 4), left[4], BASE_W, BASE_H, BASE_FOOT, BASE_SPAN, name)
