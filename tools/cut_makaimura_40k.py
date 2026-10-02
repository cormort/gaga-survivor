#!/usr/bin/env python3
"""魔界村 × 戰鎚 40K 素材：去背（邊緣洪水填充）→ 裁切 → 縮放到遊戲用尺寸。

為什麼需要這一步：js/sprites.js 的 imageBuilder() 是「把整張 PNG 依 height 等比縮放
後貼上去」，所以貼圖**必須是去背過的 RGBA**（街機版素材就是 mode=RGBA、四角 alpha=0）。
AI 生圖輸出的是 RGB + 純色底（黑或白），直接進 repo 會在角色周圍畫出一個黑／白方塊。

用法：
    python3 tools/cut_makaimura_40k.py --source ~/makaimura-40k/assets [--check]

--check 只報表不寫檔。輸出路徑與 js/sprites.js 的貼圖表一致：
    assets/makaimura/<key>.png      (MAKAIMURA_SPRITES)
    assets/bosses/<key>.png         (BOSS_PNG_SPRITES)
    assets/decor/<key>.png          (DECOR_PNG_SPRITES)
地面貼圖 (assets/ground/ground_makaimura.png) 不做去背，維持原樣。

尺寸策略：輸出高度 = 遊戲內高度 × 4（街機版是 250px 高對 66px 遊戲高 ≈ 3.8×）。
"""
import argparse
import os
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

# key -> (遊戲內高度, 輸出相對路徑)
TARGETS = {
    'arthur':            (66,  'assets/makaimura/arthur.png'),
    'makai_zombie':      (54,  'assets/makaimura/makai_zombie.png'),
    'makai_red_arremer': (58,  'assets/makaimura/makai_red_arremer.png'),
    'makai_woody':       (66,  'assets/makaimura/makai_woody.png'),
    'boss_unicorn':      (130, 'assets/bosses/boss_unicorn.png'),
    'boss_arremer_king': (135, 'assets/bosses/boss_arremer_king.png'),
    'boss_astaroth':     (145, 'assets/bosses/boss_astaroth.png'),
    'makai_tombstone':   (68,  'assets/decor/makai_tombstone.png'),
    'makai_dead_tree':   (84,  'assets/decor/makai_dead_tree.png'),
    'makai_gargoyle':    (72,  'assets/decor/makai_gargoyle.png'),
    'makai_skull_urn':   (56,  'assets/decor/makai_skull_urn.png'),
}

SCALE = 4          # 輸出高度 = 遊戲高度 × SCALE
PAD = 2            # 裁切後留白（像素，輸出尺寸下）
TOL = 42           # 洪水填充：與底色距離 < TOL 視為背景


def background_mask(a, tol=TOL):
    """從四邊洪水填充：與邊界底色相近且連通的區域視為背景。"""
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg_color = np.median(border, axis=0)
    dist = np.abs(a - bg_color).sum(axis=2)
    near = dist < tol
    mask = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True
                q.append((ny, nx))
    return mask, bg_color


def drop_small_blobs(mask, min_ratio=0.0002):
    """清掉前景裡面積過小的碎片（AI 生圖常在純色底留下小點）。"""
    fg = ~mask
    h, w = fg.shape
    seen = np.zeros_like(fg)
    keep = np.zeros_like(fg)
    min_px = max(16, int(h * w * min_ratio))
    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and not seen[sy, sx]:
                comp = []
                stack = [(sy, sx)]
                seen[sy, sx] = True
                while stack:
                    y, x = stack.pop()
                    comp.append((y, x))
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
                if len(comp) >= min_px:
                    for y, x in comp:
                        keep[y, x] = True
    return ~keep


def fill_enclosed_holes(mask, img, bg_color, tol=TOL, max_ratio=0.06):
    """把「完全被角色包住、且顏色就是底色」的封閉色塊也變透明。

    典型情況：兩腿之間的空隙、樹幹中心的空洞、握把內側。這些區域從畫面邊界
    洪水填充**到不了**（被角色圍住），所以第一段的 mask 不會包含它們。

    做法是對「與底色相近的像素」再跑一次連通分量，只清**不與邊界相連**且面積
    <= max_ratio 的那些。面積上限是保險：角色身上大面積的淺色部位（例如亞瑟的
    白披風）不會被誤判成洞。
    """
    h, w = mask.shape
    dist = np.abs(img - bg_color).sum(axis=2)
    near = dist < tol
    seen = np.zeros((h, w), bool)
    out = mask.copy()
    for sy in range(h):
        for sx in range(w):
            if near[sy, sx] and not seen[sy, sx]:
                comp = []
                stack = [(sy, sx)]
                seen[sy, sx] = True
                touches = False
                while stack:
                    y, x = stack.pop()
                    comp.append((y, x))
                    if y in (0, h - 1) or x in (0, w - 1):
                        touches = True
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
                if touches or len(comp) > h * w * max_ratio:
                    continue
                for y, x in comp:
                    out[y, x] = True
    return out


def cut(src, out_h):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(int)
    mask, bg_color = background_mask(a)
    if mask.all():
        raise SystemExit(f'{src}: 整張都被判定成背景（底色 {bg_color}），請檢查素材')
    mask = drop_small_blobs(mask)
    mask = fill_enclosed_holes(mask, a, bg_color)

    rgba = np.dstack([np.asarray(im).astype(np.uint8), np.where(mask, 0, 255).astype(np.uint8)])
    out = Image.fromarray(rgba, 'RGBA')

    # 邊緣抗鋸齒：alpha 做 1px 模糊後重新收緊，避免白／黑邊殘留
    alpha = out.getchannel('A').filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(alpha)

    bbox = out.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        raise SystemExit(f'{src}: 去背後沒有前景')
    out = out.crop(bbox)

    k = out_h / out.height
    new_w = max(1, round(out.width * k))
    out = out.resize((new_w, out_h), Image.LANCZOS)

    canvas = Image.new('RGBA', (new_w + PAD * 2, out_h + PAD * 2), (0, 0, 0, 0))
    canvas.paste(out, (PAD, PAD))
    return canvas, bg_color


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', default=os.path.expanduser('~/makaimura-40k/assets'),
                    help='AI 生圖原始檔（未去背）所在目錄')
    ap.add_argument('--check', action='store_true', help='只報表，不寫檔')
    args = ap.parse_args()
    src_dir = Path(args.source)
    if not src_dir.is_dir():
        raise SystemExit(f'找不到來源目錄：{src_dir}')

    total = 0
    for key, (game_h, rel) in TARGETS.items():
        src = src_dir / f'{key}.png'
        if not src.exists():
            print(f'! 缺少來源 {src}')
            continue
        out_img, bg = cut(src, game_h * SCALE)
        dst = ROOT / rel
        before = dst.stat().st_size if dst.exists() else 0
        alpha = out_img.getchannel('A')
        lo, hi = alpha.getextrema()
        opaque = sum(alpha.histogram()[249:])
        report = (f'{key:19s} bg={tuple(int(v) for v in bg)}  {out_img.width}x{out_img.height}'
                  f'  alpha={lo}..{hi}  前景={opaque * 100 // (out_img.width * out_img.height)}%')
        if args.check:
            print(report)
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        out_img.save(dst, optimize=True)
        size = dst.stat().st_size
        total += size
        print(f'{report}  {before // 1024}KB -> {size // 1024}KB  ({rel})')
    if not args.check:
        print(f'合計 {total / 1024 / 1024:.2f}MB')


if __name__ == '__main__':
    sys.exit(main())
