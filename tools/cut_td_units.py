# 守塔小兵動畫：從洋紅底的 4×4 精靈設定圖切出逐格動畫、去背、以腳底對齊，輸出成遊戲用的精靈表。
# 用法：python3 tools/cut_td_units.py  → assets/td/unit_footman_1~3.png、unit_knight.png
#
# 輸出格式（Turret/AlliedUnit 讀取的約定）：4 列 × 4 欄、每格 CELL_W×CELL_H，
#   列 0 待機、1 走路、2 攻擊（第 3 格是砍中）、3 陣亡；人物面朝右，腳底中心對齊 (CELL_W/2, FOOT_Y)。
#
# 來源圖兩種排法：
#   unit_footman_2~4.jpeg：列＝動作、欄＝格數，每格 512px，沒有文字
#   unit_footman_1.jpeg  ：欄＝動作、列＝格數，每格約 492px，上下有文字標籤、待機與走路每格畫了兩個人（取左邊那個）
import numpy as np
from scipy import ndimage
from PIL import Image

CELL_W, CELL_H, FOOT_Y = 160, 128, 120
IDLE_H = 96   # 待機第一格縮放到這個高度，其餘格子用同一個比例（動作幅度才不會被各自縮放扭曲）

SRC = {
    'unit_footman_1': ('assets/td/unit_footman_1.jpeg', 'col'),
    'unit_footman_2': ('assets/td/unit_footman_2.jpeg', 'row'),
    'unit_footman_3': ('assets/td/unit_footman_3.jpeg', 'row'),
    'unit_knight': ('assets/td/unit_footman_4.jpeg', 'row'),
}


def boxes(kind):
    """回傳 [動作][格] 的裁切框 (x0, y0, x1, y1)"""
    if kind == 'row':
        return [[(c * 512 + 6, r * 512 + 6, c * 512 + 506, r * 512 + 506) for c in range(4)] for r in range(4)]
    cw = 2048 / 4.16   # 第一張的格線約在 490 / 985 / 1476
    out = []
    for act in range(4):
        x0 = act * cw
        # 待機、走路格畫了兩個人：只取左半邊那個
        x1 = x0 + (cw * 0.53 if act < 2 else cw - 8)
        out.append([(int(x0 + 8), int(r * cw + 66), int(x1), int(r * cw + 440)) for r in range(4)])
    return out


def cutout(img, box):
    x0, y0, x1, y1 = box
    a = img[y0:y1, x0:x1].astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r - g >= 40) & (b - g >= 25)            # 洋紅底與它的深色投影
    # 邊緣洋紅暈：跟背景相鄰、還帶一點洋紅色調的像素一起去掉（JPEG 壓縮造成）
    tint = (r - g >= 25) & (b - g >= 15)
    near = np.zeros_like(bg)
    near[1:] |= bg[:-1]; near[:-1] |= bg[1:]; near[:, 1:] |= bg[:, :-1]; near[:, :-1] |= bg[:, 1:]
    bg |= tint & near
    # 黑色格線與文字（只有第一張有）：純黑且貼著背景的細線
    dark = (a.max(axis=2) < 40)
    bg |= dark & near
    # 只留人物：最大的連通塊，加上至少它 5% 大的塊（陣亡時掉在旁邊的盾、劍）；格線與文字標籤都是細碎小塊
    fg = ~bg
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        # 細長條（寬或高 < 12px）是格線，不論大小都丟
        thin = [min(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) < 12 for sl in ndimage.find_objects(lab)]
        ok = [i + 1 for i in range(n) if sizes[i] >= sizes.max() * 0.05 and not thin[i]]
        keep = np.isin(lab, ok)
        bg = ~keep
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    return Image.fromarray(rgba, 'RGBA')


def anchor(im):
    """腳底錨點：不透明像素的最低列；水平位置取最下方 12% 高度內不透明像素的中位數（站位，不受揮劍影響）"""
    al = np.array(im)[..., 3] > 0
    ys, xs = np.nonzero(al)
    bottom = ys.max()
    band = ys >= bottom - (ys.max() - ys.min()) * 0.12
    return int(np.median(xs[band])), int(bottom), (xs.min(), ys.min(), xs.max(), ys.max())


def build(name, path, kind):
    img = np.array(Image.open(path).convert('RGB'))
    frames = [[cutout(img, b) for b in row] for row in boxes(kind)]
    _, _, (bx0, by0, bx1, by1) = anchor(frames[0][0])
    scale = IDLE_H / (by1 - by0)
    sheet = Image.new('RGBA', (CELL_W * 4, CELL_H * 4), (0, 0, 0, 0))
    for r, row in enumerate(frames):
        for c, im in enumerate(row):
            fx, fy, _ = anchor(im)
            sm = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
            ox = c * CELL_W + CELL_W // 2 - round(fx * scale)
            oy = r * CELL_H + FOOT_Y - round(fy * scale)
            cell = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
            cell.paste(sm, (ox, oy), sm)
            # 只保留落在自己格子裡的部分（陣亡倒地的長條身體不要蓋到隔壁格）
            mask = Image.new('L', sheet.size, 0)
            mask.paste(255, (c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H))
            sheet.paste(cell, (0, 0), Image.composite(cell, Image.new('RGBA', sheet.size), mask).split()[3])
    sheet.save(f'assets/td/{name}.png')
    print(name, 'scale', round(scale, 3))


if __name__ == '__main__':
    for name, (path, kind) in SRC.items():
        build(name, path, kind)
