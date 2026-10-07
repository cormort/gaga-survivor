#!/usr/bin/env python3
"""optimize_ground_pngs.py — 把地表貼圖轉成 256 色調色盤 PNG（大幅縮小下載量）

背景：assets/ground/*.png 是 1024×1024 的 RGBA 貼圖，每張約 2MB、16 張共約 30MB，
      而且玩家進關才下載（見 tools/audit-assets.mjs 的「同意才下載的素材」統計）。
      以無損方式重壓（Pillow optimize + compress_level 9）實測省 0.0%，
      因為原檔已經壓得很好；唯一有效的手段是降到 256 色調色盤。

代價：這是 **有損** 轉換（實測 ground_core 像素位元組 69.7% 不同、最大單通道差 26）。
      1:1 目視看不太出來，但屬於美術取捨，動之前請先看過 tools 產出的對照圖。

用法：
  python3 tools/optimize_ground_pngs.py --dry-run          # 只報告，不改檔
  python3 tools/optimize_ground_pngs.py --apply            # 就地轉換 assets/ground/*.png
  python3 tools/optimize_ground_pngs.py --apply --colors 128
  python3 tools/optimize_ground_pngs.py --compare ground_frostvoid.png   # 產生 1:1 對照圖

轉完記得跑：node tools/audit-assets.mjs --write-version   # 更新 version.json 的 assetsKB
"""
import argparse
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GROUND = os.path.join(ROOT, "assets", "ground")


def stats(a: Image.Image, b: Image.Image):
    x, y = a.tobytes(), b.tobytes()
    n = len(x)
    diff = sum(1 for i in range(n) if x[i] != y[i])
    mx = max((abs(x[i] - y[i]) for i in range(n)), default=0)
    mean = sum(abs(x[i] - y[i]) for i in range(n)) / n
    return diff / n * 100, mx, mean


def convert(path, colors, apply):
    before = os.path.getsize(path)
    with Image.open(path) as im:
        rgba = im.convert("RGBA")
        size = im.size
        q = rgba.quantize(colors=colors, method=Image.FASTOCTREE)
        tmp = path + ".tmp.png"
        q.save(tmp, optimize=True)
        after = os.path.getsize(tmp)
        # 驗證：尺寸不變、可解碼
        with Image.open(tmp) as chk:
            assert chk.size == size, f"尺寸變了：{chk.size} != {size}"
        pct, mx, mean = stats(rgba, Image.open(tmp).convert("RGBA"))
    if apply and after < before:
        os.replace(tmp, path)
    else:
        os.remove(tmp)
    return before, after, pct, mx, mean


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="就地轉換（預設只報告不動檔）")
    ap.add_argument("--dry-run", action="store_true", help="只報告（預設行為，加上這旗標也一樣）")
    ap.add_argument("--colors", type=int, default=256)
    ap.add_argument("--compare", help="產生某張貼圖的 1:1 對照圖（檔名）")
    args = ap.parse_args()

    if args.compare:
        src = os.path.join(GROUND, args.compare)
        with Image.open(src) as im:
            rgba = im.convert("RGBA")
            w, h = rgba.size
            crop = rgba.crop(((w - 512) // 2, (h - 512) // 2, (w + 512) // 2, (h + 512) // 2))
        q = crop.quantize(colors=args.colors, method=Image.FASTOCTREE).convert("RGBA")
        out = Image.new("RGB", (crop.width * 2 + 8, crop.height), (20, 20, 20))
        out.paste(crop.convert("RGB"), (0, 0))
        out.paste(q.convert("RGB"), (crop.width + 8, 0))
        dst = f"/tmp/compare-{args.compare}"
        out.save(dst, quality=92)
        print(f"對照圖（左原圖／右 {args.colors} 色）：{dst}")
        return

    files = sorted(glob.glob(os.path.join(GROUND, "*.png")))
    if not files:
        sys.exit(f"找不到 {GROUND}/*.png")
    tb = ta = 0
    rows = []
    for f in files:
        b, a, pct, mx, mean = convert(f, args.colors, args.apply)
        tb += b
        ta += a
        rows.append((b - a, os.path.basename(f), b, a, pct, mx, mean))
    rows.sort(reverse=True)
    print(f"{'檔案':34}{'原始':>10}{'轉後':>10}{'省':>7}  像素差/最大差/平均差")
    for d, name, b, a, pct, mx, mean in rows:
        print(f"{name:34}{b:>10,}{a:>10,}{d/b*100:>6.0f}%  {pct:5.1f}% / {mx:3d} / {mean:4.1f}")
    print(f"\n合計 {tb:,} → {ta:,} bytes（{(tb-ta)/1048576:.1f} MB，{(1-ta/tb)*100:.0f}%）")
    print("（--dry-run）未寫入檔案" if not args.apply else "✅ 已就地轉換；記得跑 node tools/audit-assets.mjs --write-version")


if __name__ == "__main__":
    main()
