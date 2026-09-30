#!/usr/bin/env python3
"""把 PWA 圖示壓成完全不透明（alpha 全 255），背景填 manifest 的 background_color。

為什麼要這支：v55 用 AI 重繪圖示時產出了「透明圓角 + 羽化邊」的 PNG，
而 App 圖示在 Android/iOS 上必須不透明 ——
  * maskable 圖示依規範**必須是 opaque**（MDN：「give your maskable icon an opaque
    background color to fill the entire icon area」；web.dev：「supply an opaque image」）
  * 不透明的 `purpose: any` 圖示在 Android 會被塞進**白色圓圈**（web.dev：透明 PWA 圖示
    在 Android 上會出現在白圓圈裡），深色主題的圖示會變得很怪
v54 的圖示是 100% 不透明（palette PNG 無 tRNS），v55 換成有 tRNS 之後就壞了。

這支腳本只做合成（不會重繪、不會改尺寸），輸出無 alpha 通道的 PNG：
    pixel = round(background * (1 - a) + art * a)

用法：python3 tools/flatten-icons.py            # 就地覆蓋 icons/*.png
      python3 tools/flatten-icons.py --check    # 只檢查，不寫檔
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]
# 與 manifest.webmanifest 的 background_color / theme_color 一致
BACKGROUND = (0x0A, 0x0E, 0x17)


def alpha_stats(path):
    """回傳 (寬, 高, 最小 alpha, 非 255 的像素比例)。"""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    a = im.getchannel("A")
    lowest, _ = a.getextrema()          # 最小 / 最大 alpha
    hist = a.histogram()                # 每個 alpha 值各幾個像素
    non_opaque = sum(hist[:255])
    return w, h, lowest, non_opaque / float(w * h)


def flatten(src: Path, dst: Path):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    bg = Image.new("RGBA", (w, h), BACKGROUND + (255,))
    # 合成到不透明背景；art 的 alpha 只用於混合，不寫進輸出
    out = Image.alpha_composite(bg, im)
    # 存成 8-bit 調色盤 PNG（colortype 3、無 tRNS）—— 與 v54 的圖示同格式：
    # 完全不透明、檔案小（truecolor 會大 3~4 倍）。抖色保留霓虹漸層的平滑感。
    pal = out.convert("RGB").quantize(
        colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG
    )
    if "transparency" in pal.info:
        del pal.info["transparency"]  # 確保沒有 tRNS → 真正的不透明
    pal.save(dst, "PNG", optimize=True)
    return w, h


def main():
    check_only = "--check" in sys.argv
    failed = False
    for name in ICONS:
        p = ROOT / "icons" / name
        if not p.exists():
            print(f"SKIP  {name}（不存在）")
            continue
        w, h, lowest, ratio = alpha_stats(p)
        before = f"{w}x{h} 最小alpha={lowest} 非不透明={ratio * 100:.1f}%"
        if check_only:
            status = "PASS" if lowest == 255 else "FAIL"
            if lowest != 255:
                failed = True
            print(f"{status}  {name}  [{before}]")
            continue
        if lowest == 255:
            print(f"KEEP  {name}  [已完全不透明 {before}]")
            continue
        flatten(p, p)
        w2, h2, lowest2, ratio2 = alpha_stats(p)
        if (w2, h2) != (w, h):
            raise SystemExit(f"{name} 尺寸被改掉了：{w}x{h} → {w2}x{h2}")
        print(f"FIX   {name}  [{before} → {w2}x{h2} 最小alpha={lowest2} 非不透明={ratio2 * 100:.1f}%]")
        if lowest2 != 255:
            failed = True
    if check_only and failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
