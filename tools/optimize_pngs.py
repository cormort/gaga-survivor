#!/usr/bin/env python3
"""optimize_ground_pngs.py — 把地表貼圖轉成 256 色調色盤 PNG（大幅縮小下載量）

背景：assets/ 下的 PNG 是遊戲美術本體，總量約 43MB；其中 sw.js 的 PRECACHE 就佔
      31.6MB（玩家第一次開啟 PWA 就要下載）。以無損方式重壓（Pillow optimize +
      compress_level 9）實測只省 0.2% —— 原檔已經壓得很好；唯一有效的手段是降到
      256 色調色盤。

代價：這是 **有損** 轉換（地表貼圖實測平均單通道差 2.5–3.5/255、最大 25–32；
      角色/特效 sprite 含 alpha，量化後邊緣可能略有差異）。
      動之前請先看過 --compare 產出的 1:1 對照圖。

用法：
  python3 tools/optimize_pngs.py --dry-run                  # 只報告，不改檔（預設）
  python3 tools/optimize_pngs.py --apply                    # 就地轉換 assets/ 下所有 PNG
  python3 tools/optimize_pngs.py --apply --only ground      # 只做 assets/ground
  python3 tools/optimize_pngs.py --apply --colors 128
  python3 tools/optimize_pngs.py --compare assets/bosses/boss_inkape.png   # 產生對照圖

轉完記得跑：
  node tools/audit-assets.mjs --write-version    # 更新 version.json 的 assetsKB
  node tools/verify-pwa.mjs                      # 圖示與 manifest 沒被動到

注意：不會碰 icons/（PWA 圖示必須不透明，且總量需 <200KB）與 tools/（切割用來源圖）。
"""
import argparse
import glob
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
# 不碰：icons/（PWA 圖示必須不透明、總量 <200KB）、td/ 原始設定圖（.jpeg，不在這支處理範圍）
EXCLUDE_DIRS = ("icons",)


def collect(only=None):
    """列出要處理的 PNG：assets/ 下、排除 EXCLUDE_DIRS；only 可限定某個子目錄名。"""
    out = []
    for dirpath, dirnames, filenames in os.walk(ASSETS):
        rel = os.path.relpath(dirpath, ASSETS)
        top = rel.split(os.sep)[0]
        if top in EXCLUDE_DIRS:
            dirnames[:] = []
            continue
        if only and top != only and rel != only:
            continue
        for fn in filenames:
            if fn.lower().endswith(".png"):
                out.append(os.path.join(dirpath, fn))
    return sorted(out)


def stats(a: Image.Image, b: Image.Image):
    """回傳 (pixel_diff_pct, max_visible, mean_visible)。

    **只看「看得見」的差異**：RGBA 直接比會把「完全透明區域裡存的 RGB 亂七八糟」
    也算進去（AI 產圖常見：alpha=0 但 RGB 留著棋盤格或雜色），那種差異在遊戲裡
    根本看不到，卻會讓平均值爆掉、把好素材誤判成不能壓。
    因此先做預乘 alpha（RGB × A）再比，alpha 本身的變化另外算，取兩者較大者為
    「可見差」。經驗值：可見差 ≤ 4/255 就是肉眼看不出來。
    """
    pa, pb = premultiply(a), premultiply(b)
    rgb_diff = ImageStat.Stat(ImageChops.difference(pa, pb)).mean
    mean_rgb = sum(rgb_diff) / 3
    alpha_diff = ImageStat.Stat(ImageChops.difference(a.getchannel("A"), b.getchannel("A"))).mean[0]
    mean_visible = max(mean_rgb, alpha_diff)
    max_visible = max(ImageStat.Stat(ImageChops.difference(pa, pb)).extrema[i][1] for i in range(3))
    max_visible = max(max_visible, ImageStat.Stat(ImageChops.difference(a.getchannel("A"), b.getchannel("A"))).extrema[0][1])
    # 供參考：未預乘的原始差異（含透明區域）
    raw = ImageChops.difference(a, b)
    mean_raw = sum(ImageStat.Stat(raw).mean) / 4
    nonidentical = sum(1 for x, y in zip(a.tobytes(), b.tobytes()) if x != y)
    return nonidentical / len(a.tobytes()) * 100, max_visible, mean_visible, mean_raw


def premultiply(rgba: Image.Image) -> Image.Image:
    r, g, b, al = rgba.split()
    return Image.merge("RGB", (ImageChops.multiply(r, al), ImageChops.multiply(g, al), ImageChops.multiply(b, al)))


def checkerboard(size, cell=16, a=(58, 58, 64), b=(38, 38, 44)) -> Image.Image:
    """透明區域的標準顯示方式：棋盤底。兩側都用同一塊底才比得出真正的差。"""
    img = Image.new("RGBA", size, a + (255,))
    px = img.load()
    for y in range(size[1]):
        for x in range(size[0]):
            if ((x // cell) + (y // cell)) % 2:
                px[x, y] = b + (255,)
    return img


def convert(path, colors, apply, max_mean=0.0, max_delta=0):
    """回傳 (before, after, pct, mx, mean, mean_raw, skipped_reason)。

    品質守門用**可見差**（預乘 alpha 後的平均差，見 stats()）。實測一般角色／首領／
    地表貼圖可見差只有 1.6–3.9/255，而發光、半透明、加色混合類素材會到 10 以上，
    那已經看得出漸層被壓壞，寧可保留原檔。
    """
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
        pct, mx, mean, mean_raw = stats(rgba, Image.open(tmp).convert("RGBA"))
    reason = ""
    if max_mean and mean > max_mean:
        reason = f"可見差 {mean:.1f} > {max_mean}（量化破壞明顯）"
    elif max_delta and mx > max_delta:
        reason = f"最大可見差 {mx} > {max_delta}"
    if reason or after >= before:
        os.remove(tmp)
        return before, before, pct, mx, mean, mean_raw, reason or "重壓沒變小"
    if apply:
        os.replace(tmp, path)
    else:
        os.remove(tmp)
    return before, after, pct, mx, mean, mean_raw, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="就地轉換（預設只報告不動檔）")
    ap.add_argument("--dry-run", action="store_true", help="只報告（預設行為，加上這旗標也一樣）")
    ap.add_argument("--colors", type=int, default=256)
    ap.add_argument("--only", help="只做某個子目錄（例如 ground、bosses、xian）")
    ap.add_argument("--max-mean", type=float, default=4.0,
                    help="品質守門：平均單通道差超過此值就跳過不改（0 = 不限；預設 4.0）")
    ap.add_argument("--max-delta", type=int, default=0,
                    help="品質守門：最大單通道差超過此值就跳過（0 = 不限；預設關閉）")
    ap.add_argument("--csv", help="把每張的統計寫成 CSV（規劃用）")
    ap.add_argument("--compare", help="產生某張圖的 1:1 對照圖（assets/ 相對路徑，或 assets/ground 下的檔名）")
    args = ap.parse_args()

    if args.compare:
        src = args.compare
        if not os.path.exists(src):
            cand = os.path.join(ASSETS, "ground", args.compare)
            src = cand if os.path.exists(cand) else os.path.join(ROOT, args.compare)
        if not os.path.exists(src):
            sys.exit(f"找不到 {args.compare}")
        with Image.open(src) as im:
            rgba = im.convert("RGBA")
            w, h = rgba.size
            win = min(512, w, h)
            crop = rgba.crop(((w - win) // 2, (h - win) // 2, (w + win) // 2, (h + win) // 2))
        q = crop.quantize(colors=args.colors, method=Image.FASTOCTREE).convert("RGBA")
        # 疊在同一個棋盤底上（透明區域在兩側看起來一致，才比得出真正差在哪）
        board = checkerboard(crop.size, 16)
        left = board.copy(); left.alpha_composite(crop)
        right = board.copy(); right.alpha_composite(q)
        out = Image.new("RGB", (crop.width * 2 + 8, crop.height + 24), (20, 20, 20))
        out.paste(left.convert("RGB"), (0, 24))
        out.paste(right.convert("RGB"), (crop.width + 8, 24))
        d = ImageDraw.Draw(out)
        d.text((4, 6), "BEFORE (original)", fill=(255, 220, 120))
        d.text((crop.width + 12, 6), f"AFTER ({args.colors} colors)", fill=(120, 230, 255))
        dst = "/tmp/compare-" + os.path.basename(src).replace(".png", ".jpg")
        out.save(dst, quality=92)
        print(f"對照圖（左原圖／右 {args.colors} 色，疊在棋盤底上）：{dst}")
        return

    files = collect(args.only)
    if not files:
        sys.exit("找不到要處理的 PNG（assets/ 下，排除 icons/）")
    print(f"要處理 {len(files)} 張 PNG" + (f"（只做 {args.only}）" if args.only else "")
          + f"｜品質守門：可見差 ≤ {args.max_mean}" + (f"、最大可見差 ≤ {args.max_delta}" if args.max_delta else ""))
    tb = ta = 0
    rows, skipped = [], []
    for f in files:
        b, a, pct, mx, mean, mean_raw, reason = convert(f, args.colors, args.apply, args.max_mean, args.max_delta)
        tb += b
        ta += a
        rel = os.path.relpath(f, ROOT)
        if reason:
            skipped.append((b, rel, reason, mx, mean, mean_raw))
        else:
            rows.append((b - a, rel, b, a, pct, mx, mean, mean_raw))
    rows.sort(reverse=True)
    if args.csv:
        import csv as _csv
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            w = _csv.writer(fh)
            w.writerow(["file", "before", "after", "saved", "pct_saved", "pixel_diff_pct",
                        "max_visible_delta", "mean_visible_delta", "mean_delta_rawincl_transparent", "skipped"])
            for d, name, b, a, pct, mx, mean, mean_raw in rows:
                w.writerow([name, b, a, d, round(d / b * 100, 1), round(pct, 1), mx, round(mean, 2), round(mean_raw, 2), ""])
            for b, name, reason, mx, mean, mean_raw in skipped:
                w.writerow([name, b, b, 0, 0, "", mx, round(mean, 2), round(mean_raw, 2), reason])
        print(f"CSV 已寫入 {args.csv}")
    print(f"{'檔案':40}{'原始':>10}{'轉後':>10}{'省':>7}  像素差/最大可見差/平均可見差")
    for d, name, b, a, pct, mx, mean, mean_raw in rows[:30]:
        print(f"{name:40}{b:>10,}{a:>10,}{d/b*100:>6.0f}%  {pct:5.1f}% / {mx:3d} / {mean:4.1f}")
    if len(rows) > 30:
        print(f"…另有 {len(rows)-30} 張成功")
    if skipped:
        print(f"\n⏭  跳過 {len(skipped)} 張（{sum(b for b,_,_,_,_,_ in skipped)/1048576:.2f} MB，保留原檔）：")
        for b, name, reason, mx, mean, mean_raw in sorted(skipped, reverse=True)[:15]:
            print(f"    {name:40}{b/1024:8.0f} KB  {reason}")
    print(f"\n合計 {tb:,} → {ta:,} bytes（省 {(tb-ta)/1048576:.1f} MB，{(1-ta/tb)*100:.0f}%）")
    print("（--dry-run）未寫入檔案" if not args.apply else "✅ 已就地轉換；記得跑 node tools/audit-assets.mjs --write-version")


if __name__ == "__main__":
    main()
