#!/usr/bin/env python3
"""
sprite_tool.py — 通用精靈切圖與去背工具
==========================================

參考 https://cormort.github.io/remove-bg/ 的核心演算法重寫，
提供 CLI 介面執行批次切圖 (sprite sheet slicing) 與背景去除。

功能:
  1. 單圖去背 (flood / global / contour 三種演算法)
  2. 精靈圖集自動切割 (指定 rows x cols 或像素寬高)
  3. 批次處理資料夾內所有圖片
  4. 內容感知裁切 (content-aware crop)

用法:
  # 單圖去背 (預設 flood 演算法)
  python3 tools/slice_bosses.py remove input.png -o output.png

  # 單圖去背 + 指定容許度
  python3 tools/slice_bosses.py remove input.png -o output.png --tolerance 30

  # 使用 contour 演算法去背 (適合黑底美漫線條風格)
  python3 tools/slice_bosses.py remove input.png -o output.png --algo contour --threshold 18

  # 精靈圖集切割 (2x2 格)
  python3 tools/slice_bosses.py slice sheet.png --grid 2x2 --outdir ./sprites/

  # 精靈圖集切割 (指定每格 512x512 像素)
  python3 tools/slice_bosses.py slice sheet.png --cell 512x512 --outdir ./sprites/

  # 切割後同時去背
  python3 tools/slice_bosses.py slice sheet.png --grid 2x2 --outdir ./sprites/ --remove-bg

  # 批次去背一整個資料夾
  python3 tools/slice_bosses.py batch ./raw/ --outdir ./clean/ --algo flood --tolerance 25
"""
import argparse
import os
import sys
import glob

import cv2
import numpy as np
from PIL import Image


# ── 演算法核心 ─────────────────────────────────────────────

def flood_fill_remove(im_bgr, tolerance=20):
    """
    智慧邊緣去背 (Edge Fill)：從四角種子開始 FloodFill，
    移除與背景色相近的像素。與 remove-bg 的 'flood' 模式等價。
    """
    h, w = im_bgr.shape[:2]
    rgb = cv2.cvtColor(im_bgr, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([rgb, np.full((h, w), 255, dtype=np.uint8)])

    data = rgba.reshape(-1, 4)
    visited = np.zeros(w * h, dtype=np.uint8)

    # 背景色取左上角
    bg_r, bg_g, bg_b = int(data[0][0]), int(data[0][1]), int(data[0][2])
    tol3 = tolerance * 3  # color_match_factor = 3 (同 remove-bg)

    def color_match(idx):
        diff = abs(int(data[idx][0]) - bg_r) + abs(int(data[idx][1]) - bg_g) + abs(int(data[idx][2]) - bg_b)
        return diff < tol3

    # 種子：四角
    seeds = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1]
    stack = []
    for s in seeds:
        if color_match(s):
            stack.append(s)
            visited[s] = 1
            data[s][3] = 0

    while stack:
        pos = stack.pop()
        x, y = pos % w, pos // w
        for nx, ny in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]:
            if 0 <= nx < w and 0 <= ny < h:
                npos = ny * w + nx
                if visited[npos] == 0:
                    visited[npos] = 1
                    if color_match(npos):
                        data[npos][3] = 0
                        stack.append(npos)

    return rgba


def global_threshold_remove(im_bgr, tolerance=20):
    """
    全域濾除 (Global)：亮度高於閾值的像素一律透明化。
    等價於 remove-bg 的 'global' 模式。
    """
    h, w = im_bgr.shape[:2]
    rgb = cv2.cvtColor(im_bgr, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(im_bgr, cv2.COLOR_BGR2GRAY)
    thresh = 255 - tolerance * 2
    alpha = np.where(gray > thresh, 0, 255).astype(np.uint8)
    return np.dstack([rgb, alpha])


def contour_extract(im_bgr, threshold=18):
    """
    OpenCV 輪廓形態學去背 (Contour)：
    適合黑底或深色背景 + 美漫黑線條風格精靈。
    使用 morphologyEx CLOSE 填充線條間隙，再以輪廓遮罩實心填充。
    """
    h, w = im_bgr.shape[:2]
    gray = np.max(im_bgr, axis=2)

    _, thresh_mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    closed = cv2.morphologyEx(thresh_mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    mask = np.zeros(gray.shape, dtype=np.uint8)

    main_contours = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > 100:
            M = cv2.moments(cnt)
            if M["m00"] > 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                if (cx < 20 or cx > w - 20 or cy < 20 or cy > h - 20) and area < 4000:
                    continue
            main_contours.append(cnt)

    for cnt in main_contours:
        cv2.drawContours(mask, [cnt], -1, 255, thickness=cv2.FILLED)

    mask = cv2.GaussianBlur(mask, (3, 3), 0.6)

    rgb = cv2.cvtColor(im_bgr, cv2.COLOR_BGR2RGB)
    return np.dstack([rgb, mask])


# ── 工具函式 ──────────────────────────────────────────────

def content_crop(rgba, padding=4):
    """
    內容感知裁切：移除全透明邊緣，保留 padding 像素邊距。
    """
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(xs) == 0 or len(ys) == 0:
        return rgba
    x0 = max(0, xs.min() - padding)
    x1 = min(rgba.shape[1], xs.max() + padding + 1)
    y0 = max(0, ys.min() - padding)
    y1 = min(rgba.shape[0], ys.max() + padding + 1)
    return rgba[y0:y1, x0:x1]


def apply_remove_bg(im_bgr, algo='flood', tolerance=20, threshold=18, crop=True):
    """統一去背介面。"""
    if algo == 'flood':
        rgba = flood_fill_remove(im_bgr, tolerance)
    elif algo == 'global':
        rgba = global_threshold_remove(im_bgr, tolerance)
    elif algo == 'contour':
        rgba = contour_extract(im_bgr, threshold)
    else:
        raise ValueError(f"Unknown algo: {algo}")

    if crop:
        rgba = content_crop(rgba)
    return rgba


def save_rgba(rgba, out_path):
    """將 RGBA numpy array 儲存為 PNG。"""
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    out = Image.fromarray(rgba)
    out.save(out_path, optimize=True)
    print(f"  ✅ {out_path} ({out.width}×{out.height})")


# ── CLI 子命令 ────────────────────────────────────────────

def cmd_remove(args):
    """單圖去背。"""
    im = cv2.imread(args.input)
    if im is None:
        print(f"❌ 無法讀取: {args.input}")
        sys.exit(1)

    print(f"🔧 去背: {args.input} (algo={args.algo}, tol={args.tolerance})")
    rgba = apply_remove_bg(im, args.algo, args.tolerance, args.threshold, crop=not args.no_crop)
    save_rgba(rgba, args.output)


def cmd_slice(args):
    """精靈圖集切割。"""
    im = cv2.imread(args.input)
    if im is None:
        print(f"❌ 無法讀取: {args.input}")
        sys.exit(1)

    h, w = im.shape[:2]
    base = os.path.splitext(os.path.basename(args.input))[0]

    if args.grid:
        cols, rows = map(int, args.grid.split('x'))
        cw, ch = w // cols, h // rows
    elif args.cell:
        cw, ch = map(int, args.cell.split('x'))
        cols, rows = w // cw, h // ch
    else:
        print("❌ 需指定 --grid CxR 或 --cell WxH")
        sys.exit(1)

    print(f"✂️  切割: {args.input} → {cols}×{rows} 格 (每格 {cw}×{ch})")

    idx = 0
    names = args.names.split(',') if args.names else None
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cw, r * ch
            sub = im[y0:y0 + ch, x0:x0 + cw]

            if names and idx < len(names):
                fname = names[idx].strip() + '.png'
            else:
                fname = f"{base}_{r}_{c}.png"

            if args.remove_bg:
                rgba = apply_remove_bg(sub, args.algo, args.tolerance, args.threshold, crop=not args.no_crop)
            else:
                rgb = cv2.cvtColor(sub, cv2.COLOR_BGR2RGB)
                rgba_full = np.dstack([rgb, np.full(sub.shape[:2], 255, dtype=np.uint8)])
                rgba = content_crop(rgba_full) if not args.no_crop else rgba_full

            out_path = os.path.join(args.outdir, fname)
            save_rgba(rgba, out_path)
            idx += 1


def cmd_batch(args):
    """批次去背。"""
    patterns = ['*.png', '*.jpg', '*.jpeg', '*.webp', '*.bmp']
    files = []
    for pat in patterns:
        files.extend(glob.glob(os.path.join(args.input_dir, pat)))
    files.sort()

    if not files:
        print(f"⚠️  在 {args.input_dir} 中找不到任何圖片")
        sys.exit(1)

    print(f"📦 批次去背: {len(files)} 張圖片 (algo={args.algo}, tol={args.tolerance})")
    for f in files:
        im = cv2.imread(f)
        if im is None:
            print(f"  ⚠️  跳過: {f}")
            continue
        rgba = apply_remove_bg(im, args.algo, args.tolerance, args.threshold, crop=not args.no_crop)
        fname = os.path.splitext(os.path.basename(f))[0] + '.png'
        out_path = os.path.join(args.outdir, fname)
        save_rgba(rgba, out_path)


# ── 主程式 ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='🧬 sprite_tool — 通用切圖與去背工具 (inspired by remove-bg)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
範例:
  %(prog)s remove input.png -o output.png
  %(prog)s remove input.png -o output.png --algo contour --threshold 18
  %(prog)s slice sheet.png --grid 2x2 --outdir ./sprites/ --remove-bg
  %(prog)s slice sheet.png --cell 512x512 --outdir ./sprites/ --names "boss_a,boss_b,boss_c,boss_d"
  %(prog)s batch ./raw/ --outdir ./clean/ --algo flood --tolerance 25
        """
    )
    sub = parser.add_subparsers(dest='command', required=True)

    # ─ remove ─
    p_rm = sub.add_parser('remove', help='單圖去背')
    p_rm.add_argument('input', help='輸入圖片路徑')
    p_rm.add_argument('-o', '--output', default='output.png', help='輸出路徑 (預設 output.png)')
    p_rm.add_argument('--algo', choices=['flood', 'global', 'contour'], default='flood',
                       help='去背演算法: flood=智慧邊緣, global=全域濾除, contour=輪廓形態學')
    p_rm.add_argument('--tolerance', type=int, default=20, help='容許度 (flood/global, 預設 20)')
    p_rm.add_argument('--threshold', type=int, default=18, help='亮度閾值 (contour 專用, 預設 18)')
    p_rm.add_argument('--no-crop', action='store_true', help='不進行內容感知裁切')

    # ─ slice ─
    p_sl = sub.add_parser('slice', help='精靈圖集切割')
    p_sl.add_argument('input', help='輸入精靈圖集路徑')
    p_sl.add_argument('--grid', help='格數 (如 2x2, 4x4)')
    p_sl.add_argument('--cell', help='每格像素尺寸 (如 512x512)')
    p_sl.add_argument('--outdir', default='./sliced/', help='輸出目錄 (預設 ./sliced/)')
    p_sl.add_argument('--names', help='自訂輸出檔名 (逗號分隔, 如 "boss_a,boss_b")')
    p_sl.add_argument('--remove-bg', action='store_true', help='切割後同時去背')
    p_sl.add_argument('--algo', choices=['flood', 'global', 'contour'], default='contour',
                       help='去背演算法 (預設 contour)')
    p_sl.add_argument('--tolerance', type=int, default=20, help='容許度')
    p_sl.add_argument('--threshold', type=int, default=18, help='亮度閾值 (contour)')
    p_sl.add_argument('--no-crop', action='store_true', help='不進行內容感知裁切')

    # ─ batch ─
    p_ba = sub.add_parser('batch', help='批次去背資料夾內所有圖片')
    p_ba.add_argument('input_dir', help='輸入資料夾路徑')
    p_ba.add_argument('--outdir', default='./cleaned/', help='輸出目錄 (預設 ./cleaned/)')
    p_ba.add_argument('--algo', choices=['flood', 'global', 'contour'], default='flood',
                       help='去背演算法 (預設 flood)')
    p_ba.add_argument('--tolerance', type=int, default=20, help='容許度')
    p_ba.add_argument('--threshold', type=int, default=18, help='亮度閾值 (contour)')
    p_ba.add_argument('--no-crop', action='store_true', help='不進行內容感知裁切')

    args = parser.parse_args()

    if args.command == 'remove':
        cmd_remove(args)
    elif args.command == 'slice':
        cmd_slice(args)
    elif args.command == 'batch':
        cmd_batch(args)


if __name__ == '__main__':
    main()
