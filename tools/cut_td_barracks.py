# 主題兵營：從洋紅底、黑格線分格的設定圖切出 5 個階段（1/2/3 級、重裝專精、地堡專精），去背後輸出成
# assets/td/<輸出鍵>_1.png … _3.png、_knight.png、_bunker.png（Turret.drawTD 依兵營 artKey 取用）。
# 用法：python3 tools/cut_td_barracks.py <來源> <輸出鍵，如 barracks_redalert>
#
# 為什麼不用 cut_td_structures：
#   - 格子不等寬（紅警第 2 列是一大格＋兩小格），改成自動偵測黑色格線
#   - 一棟建物常是好幾塊（沙包牆、附加模組跟主體分開），不能只留最大連通塊
#   - 第 2 列：第 1 格＝重裝專精，最後一個非空格＝地堡（紅警畫了兩種碉堡，取有機槍的那個）
# 尺寸：整張用同一個縮放倍率（取 1~3 級對齊原本 assets/td/barracks_<階段>.png 寬度的平均），
#   保留畫面裡各階段的相對大小 —— 逐張對齊寬度的話，小小的碉堡會被放大到跟原本「地堡＋一圈沙包」一樣寬；
#   另有下限（原本該階段寬度的 55%），避免畫裡特別小的建物在遊戲裡縮成一個點
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

STAGES_ROW1 = ['1', '2', '3']


def lines(dark, axis, frac=0.6):   # 0.6：格線被大型建物壓到一點也要抓得到（紅警第 2 列那條只有 74% 是黑的）
    """沿 axis 方向，暗色像素比例超過 frac 的線（格線）位置，相鄰的合併成一條"""
    ratio = dark.mean(axis=axis)
    idx = np.nonzero(ratio > frac)[0]
    out = []
    for i in idx:
        if out and i - out[-1][-1] <= 3:
            out[-1].append(i)
        else:
            out.append([i])
    return [int(np.mean(g)) for g in out]


def cells_of(img):
    dark = img.max(axis=2) < 50
    h, w = dark.shape
    rows = [0] + [y for y in lines(dark, 1) if 20 < y < h - 20] + [h]
    out = []
    for r in range(len(rows) - 1):
        y0, y1 = rows[r], rows[r + 1]
        cols = [0] + [x for x in lines(dark[y0:y1], 0) if 20 < x < w - 20] + [w]
        out.append([(cols[c], y0, cols[c + 1], y1) for c in range(len(cols) - 1)])
    return out


def cutout(img, box):
    x0, y0, x1, y1 = box
    a = img[y0 + 4:y1 - 4, x0 + 4:x1 - 4].astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r - g >= 40) & (b - g >= 25)          # 洋紅底與深洋紅投影
    tint = (r - g >= 25) & (b - g >= 15)
    near = np.zeros_like(bg)
    near[1:] |= bg[:-1]; near[:-1] |= bg[1:]; near[:, 1:] |= bg[:, :-1]; near[:, :-1] |= bg[:, 1:]
    bg |= tint & near
    fg = ~bg
    lab, n = ndimage.label(fg)
    if n == 0:
        return None
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    if sizes.max() < 2000:   # 空格
        return None
    thin = [min(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) < 8 for sl in ndimage.find_objects(lab)]
    keep = np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= sizes.max() * 0.01 and not thin[i]])
    im = Image.fromarray(np.dstack([a.astype(np.uint8), np.where(keep, 255, 0).astype(np.uint8)]), 'RGBA')
    return im.crop(im.getbbox())


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    img = np.array(Image.open(src).convert('RGB'))
    grid = cells_of(img)
    row1 = [c for c in (cutout(img, b) for b in grid[0]) if c is not None]
    row2 = [c for c in (cutout(img, b) for b in grid[1]) if c is not None]
    stages = dict(zip(STAGES_ROW1, row1))
    stages['knight'] = row2[0]
    stages['bunker'] = row2[-1]
    k = float(np.mean([Image.open(f'assets/td/barracks_{s}.png').width / stages[s].width for s in STAGES_ROW1]))
    for stage, im in stages.items():
        # 下限：不小於原本該階段寬度的 55%（紅警的碉堡在畫裡很小，照比例縮只剩 42px，專精塔看起來比 1 級還弱）
        ks = max(k, 0.55 * Image.open(f'assets/td/barracks_{stage}.png').width / im.width)
        sm = im.resize((max(1, round(im.width * ks)), max(1, round(im.height * ks))), Image.LANCZOS)
        sm.save(f'assets/td/{out}_{stage}.png', optimize=True)
        print(f'{out}_{stage}', sm.size)
