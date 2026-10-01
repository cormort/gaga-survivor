#!/usr/bin/env python3
"""
Slice and alpha-mask all generated boss sheets using OpenCV contour extraction.
Outputs clean transparent PNGs for all bosses.
"""
import os
import cv2
import numpy as np
from PIL import Image

SHEETS = [
    {
        "file": "/Users/hsiehminchieh/.gemini/antigravity-ide/brain/16e5ff95-0b76-4e3b-905e-13c78dabc5a0/boss_batch_sheet_1_1790832519830.jpg",
        "quadrants": [
            ("assets/xian/boss.png", (0, 0, 512, 512)),
            ("assets/xian/boss_charging.png", (512, 0, 1024, 512)),
            ("assets/xian/boss_nob.png", (0, 512, 512, 1024)),
            ("assets/xian/boss_broodlord.png", (512, 512, 1024, 1024)),
        ]
    },
    {
        "file": "/Users/hsiehminchieh/.gemini/antigravity-ide/brain/16e5ff95-0b76-4e3b-905e-13c78dabc5a0/boss_batch_sheet_2_1790832564063.jpg",
        "quadrants": [
            ("assets/xian/boss_carnifex.png", (0, 0, 512, 512)),
            ("assets/bosses/boss_street.png", (512, 0, 1024, 512)),
            ("assets/bosses/boss_lab.png", (0, 512, 512, 1024)),
            ("assets/bosses/boss_frost.png", (512, 512, 1024, 1024)),
        ]
    },
    {
        "file": "/Users/hsiehminchieh/.gemini/antigravity-ide/brain/16e5ff95-0b76-4e3b-905e-13c78dabc5a0/boss_batch_sheet_3_1790832612287.jpg",
        "quadrants": [
            ("assets/bosses/boss_core.png", (0, 0, 512, 512)),
            ("assets/bosses/boss_subway.png", (512, 0, 1024, 512)),
            ("assets/bosses/boss_swamp.png", (0, 512, 512, 1024)),
            ("assets/bosses/boss_storm.png", (512, 512, 1024, 1024)),
        ]
    },
    {
        "file": "/Users/hsiehminchieh/.gemini/antigravity-ide/brain/16e5ff95-0b76-4e3b-905e-13c78dabc5a0/boss_batch_sheet_4_1790832662625.jpg",
        "quadrants": [
            ("assets/bosses/boss_foundry.png", (0, 0, 512, 512)),
            ("assets/bosses/boss_frostvoid.png", (512, 0, 1024, 512)),
            ("assets/bosses/boss_voidroad.png", (0, 512, 512, 1024)),
            ("assets/bosses/boss_thunder.png", (512, 512, 1024, 1024)),
        ]
    },
]

def extract_sprite(im_bgr, box, out_path):
    x0, y0, x1, y1 = box
    sub = im_bgr[y0:y1, x0:x1]
    gray = np.max(sub, axis=2)

    # Anything above threshold 18 is non-background
    _, thresh = cv2.threshold(gray, 18, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # Contours to fill holes inside character
    contours, hierarchy = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    mask = np.zeros(gray.shape, dtype=np.uint8)

    # Filter contours: discard any component whose centroid or area is a neighbor bleed
    h, w = gray.shape
    main_contours = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > 100:
            M = cv2.moments(cnt)
            if M["m00"] > 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                # Discard edge artifacts touching the quadrant seam if area is relatively small
                if (cx < 20 or cx > w - 20 or cy < 20 or cy > h - 20) and area < 4000:
                    continue
            main_contours.append(cnt)

    for cnt in main_contours:
        cv2.drawContours(mask, [cnt], -1, 255, thickness=cv2.FILLED)

    # Edge antialiasing
    mask = cv2.GaussianBlur(mask, (3, 3), 0.6)

    # Assemble RGBA
    rgb = cv2.cvtColor(sub, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([rgb, mask])

    # Crop to content
    ys, xs = np.where(mask > 10)
    if len(xs) == 0 or len(ys) == 0:
        print(f"Warning: Empty cutout for {out_path}")
        return

    cx0, cx1 = max(0, xs.min() - 4), min(rgba.shape[1], xs.max() + 5)
    cy0, cy1 = max(0, ys.min() - 4), min(rgba.shape[0], ys.max() + 5)
    cropped = rgba[cy0:cy1, cx0:cx1]

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out = Image.fromarray(cropped)
    out.save(out_path, optimize=True)
    print(f"Saved: {out_path} ({out.width}x{out.height})")

def main():
    for sheet in SHEETS:
        im = cv2.imread(sheet["file"])
        if im is None:
            print(f"Error loading {sheet['file']}")
            continue
        for out_path, box in sheet["quadrants"]:
            extract_sprite(im, box, out_path)

if __name__ == "__main__":
    main()
