// tools/render_makaimura_art.js
// High-fidelity procedural rendering pipeline for Ghosts 'n Goblins (魔界村) assets in Gaga Survivor
// Uses the game's authentic Canvas 2D shading, multi-tone gradients, cel-shaded outlines, and rim lighting.

import fs from 'fs';
import path from 'path';

const task = await taskSpace("render-makaimura-art-" + Date.now());
const page = task.page("p1");

console.log("Navigating to local dev server to initialize rendering context...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");

console.log("Rendering Makaimura assets in page context...");

const renderedAssets = await page.evaluate(async () => {
  const results = {};

  // Utility: tight bounding box crop
  function cropToBBox(sourceCanvas, pad = 6) {
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;
    const sctx = sourceCanvas.getContext('2d');
    const imgData = sctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    let minX = sw, minY = sh, maxX = 0, maxY = 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const a = data[(y * sw + x) * 4 + 3];
        if (a > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX > maxX || minY > maxY) {
      return sourceCanvas.toDataURL('image/png');
    }

    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(sw - 1, maxX + pad);
    maxY = Math.min(sh - 1, maxY + pad);

    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = cw;
    outCanvas.height = ch;
    const octx = outCanvas.getContext('2d');
    octx.drawImage(sourceCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return outCanvas.toDataURL('image/png');
  }

  // Shading helpers
  function sphereGrad(ctx, color, r, cx, cy) {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, color);
    g.addColorStop(0.85, darken(color, 0.45));
    g.addColorStop(1, '#05030a');
    return g;
  }

  function linearGrad(ctx, x0, y0, x1, y1, c0, c1, c2 = null) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c0);
    if (c2) {
      g.addColorStop(0.5, c1);
      g.addColorStop(1, c2);
    } else {
      g.addColorStop(1, c1);
    }
    return g;
  }

  function darken(hex, factor = 0.5) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = Math.max(0, Math.floor(((num >> 16) & 255) * factor));
    const g = Math.max(0, Math.floor(((num >> 8) & 255) * factor));
    const b = Math.max(0, Math.floor((num & 255) * factor));
    return `rgb(${r},${g},${b})`;
  }

  // ==========================================
  // 1. ARTHUR (魔界騎士 亞瑟)
  // ==========================================
  function renderArthur() {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 320;
    const ctx = c.getContext('2d');
    const cx = 160, cy = 175;

    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 95, 55, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Steel Boots & Greaves
    for (const s of [-1, 1]) {
      const bx = cx + s * 28;
      const by = cy + 72;
      // Leg armor
      ctx.fillStyle = linearGrad(ctx, bx - 14, by, bx + 14, by, '#cbd5e1', '#475569');
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(bx - 12, by - 18, 24, 24, 4);
      ctx.fill();
      ctx.stroke();

      // Foot boot
      ctx.fillStyle = linearGrad(ctx, bx - 16, by + 6, bx + 16, by + 18, '#e2e8f0', '#334155');
      ctx.beginPath();
      ctx.roundRect(bx - 14, by + 6, 28, 16, [4, 4, 6, 6]);
      ctx.fill();
      ctx.stroke();

      // Gold buckle trim
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(bx - 10, by + 8, 20, 3.5);
    }

    // Iconic Strawberry Boxer Shorts peek
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cx - 30, cy + 32, 60, 26, 4);
    ctx.fill();
    ctx.stroke();

    // Red strawberry pattern dots
    ctx.fillStyle = '#ef4444';
    const strawPoints = [[-18, 40], [-6, 46], [6, 38], [18, 44], [-12, 50], [12, 52]];
    for (const [sx, sy] of strawPoints) {
      ctx.beginPath();
      ctx.arc(cx + sx, cy + sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10b981';
      ctx.fillRect(cx + sx - 1, cy + sy - 4, 2, 2);
      ctx.fillStyle = '#ef4444';
    }

    // Steel Tassets / Skirt Armor
    ctx.fillStyle = linearGrad(ctx, cx - 34, cy + 26, cx + 34, cy + 26, '#e2e8f0', '#475569');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(cx - 32, cy + 24, 64, 16, 3);
    ctx.fill();
    ctx.stroke();
    // Gold rivets
    ctx.fillStyle = '#fbbf24';
    for (let r = -24; r <= 24; r += 12) {
      ctx.beginPath();
      ctx.arc(cx + r, cy + 32, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Breastplate Body Armor
    const bGrad = ctx.createLinearGradient(cx - 36, cy - 25, cx + 36, cy + 28);
    bGrad.addColorStop(0, '#f8fafc');
    bGrad.addColorStop(0.3, '#cbd5e1');
    bGrad.addColorStop(0.7, '#64748b');
    bGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 32, cy - 20);
    ctx.lineTo(cx + 32, cy - 20);
    ctx.lineTo(cx + 28, cy + 25);
    ctx.lineTo(cx - 28, cy + 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Holy Cross on Breastplate
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx - 5, cy - 14, 10, 32);
    ctx.fillRect(cx - 18, cy - 5, 36, 9);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 5, cy - 14, 10, 32);
    ctx.strokeRect(cx - 18, cy - 5, 36, 9);

    // Pauldrons (Spike Shoulder Guards)
    for (const s of [-1, 1]) {
      const px = cx + s * 42;
      const py = cy - 18;
      ctx.fillStyle = linearGrad(ctx, px - 18, py - 18, px + 18, py + 18, '#f1f5f9', '#334155');
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(px, py, 18, 14, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Gold Trim
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Left Arm Kite Shield
    ctx.save();
    ctx.translate(cx - 52, cy + 8);
    ctx.rotate(0.15);
    const sGrad = ctx.createLinearGradient(-24, -30, 24, 30);
    sGrad.addColorStop(0, '#e2e8f0');
    sGrad.addColorStop(0.5, '#64748b');
    sGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = sGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-20, -32);
    ctx.lineTo(20, -32);
    ctx.lineTo(20, 8);
    ctx.lineTo(0, 38);
    ctx.lineTo(-20, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Shield Gold Cross
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-4, -28, 8, 54);
    ctx.fillRect(-18, -15, 36, 8);
    ctx.restore();

    // Right Arm with Knight's Holy Spear / Lance
    ctx.save();
    ctx.translate(cx + 46, cy + 6);
    // Arm
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-8, -12, 16, 24, 4);
    ctx.fill();
    ctx.stroke();
    // Spear Shaft
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.fillRect(8, -85, 7, 165);
    ctx.strokeRect(8, -85, 7, 165);
    // Spear Blade
    const bladeGrad = ctx.createLinearGradient(0, -115, 20, -85);
    bladeGrad.addColorStop(0, '#f8fafc');
    bladeGrad.addColorStop(1, '#475569');
    ctx.fillStyle = bladeGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(11.5, -125);
    ctx.lineTo(22, -85);
    ctx.lineTo(1, -85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Holy spear crossguard
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-2, -85, 27, 6);
    ctx.restore();

    // Knight Helmet & Face
    const hx = cx, hy = cy - 46;
    // Visor Helmet Base
    const hGrad = ctx.createRadialGradient(hx - 8, hy - 12, 6, hx, hy, 32);
    hGrad.addColorStop(0, '#ffffff');
    hGrad.addColorStop(0.3, '#cbd5e1');
    hGrad.addColorStop(0.8, '#475569');
    hGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = hGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(hx - 26, hy - 24, 52, 46, [16, 16, 10, 10]);
    ctx.fill();
    ctx.stroke();

    // Eye Visor Opening
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(hx - 20, hy - 4, 40, 10);
    // Gallant eyes behind visor
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(hx - 14, hy - 2, 8, 5);
    ctx.fillRect(hx + 6, hy - 2, 8, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 12, hy - 2, 3, 3);
    ctx.fillRect(hx + 8, hy - 2, 3, 3);

    // Iconic Gallant Knight Mustache & Beard
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy + 12);
    ctx.quadraticCurveTo(hx, hy + 6, hx + 18, hy + 12);
    ctx.quadraticCurveTo(hx + 12, hy + 22, hx, hy + 24);
    ctx.quadraticCurveTo(hx - 12, hy + 22, hx - 18, hy + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Knight Plume (Ruby Red Feather Crest)
    const plumeGrad = ctx.createLinearGradient(hx - 10, hy - 60, hx + 25, hy - 20);
    plumeGrad.addColorStop(0, '#f87171');
    plumeGrad.addColorStop(0.4, '#dc2626');
    plumeGrad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = plumeGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy - 24);
    ctx.quadraticCurveTo(hx - 18, hy - 58, hx + 12, hy - 62);
    ctx.quadraticCurveTo(hx + 28, hy - 45, hx + 10, hy - 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 2. STAGE ENEMIES
  // ==========================================
  function renderZombie() {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 260;
    const ctx = c.getContext('2d');
    const cx = 120, cy = 135;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 90, 45, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Decayed Legs & Tattered Trousers
    for (const s of [-1, 1]) {
      const lx = cx + s * 18;
      const ly = cy + 62;
      ctx.fillStyle = linearGrad(ctx, lx - 10, ly, lx + 10, ly + 25, '#334155', '#0f172a');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(lx - 10, ly - 10, 20, 32, 3);
      ctx.fill();
      ctx.stroke();

      // Bony bare feet
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.roundRect(lx - 9, ly + 20, 22, 10, 3);
      ctx.fill();
      ctx.stroke();
    }

    // Tattered Grave Shroud / Vest
    const vGrad = ctx.createLinearGradient(cx - 26, cy - 20, cx + 26, cy + 50);
    vGrad.addColorStop(0, '#15803d');
    vGrad.addColorStop(0.6, '#166534');
    vGrad.addColorStop(1, '#052e16');
    ctx.fillStyle = vGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy - 15);
    ctx.lineTo(cx + 24, cy - 15);
    ctx.lineTo(cx + 28, cy + 45);
    // Jagged hem
    ctx.lineTo(cx + 16, cy + 52);
    ctx.lineTo(cx + 6, cy + 44);
    ctx.lineTo(cx - 8, cy + 53);
    ctx.lineTo(cx - 20, cy + 46);
    ctx.lineTo(cx - 26, cy + 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Exposed Ribs / Decay Wounds
    ctx.fillStyle = '#090d16';
    ctx.fillRect(cx - 10, cy + 4, 20, 16);
    ctx.fillStyle = '#f1f5f9';
    for (let r = 0; r < 3; r++) {
      ctx.fillRect(cx - 8, cy + 6 + r * 5, 16, 2.5);
    }

    // Outstretched Grasping Zombie Arms
    for (const s of [-1, 1]) {
      const ax = cx + s * 34;
      const ay = cy + 4;
      ctx.fillStyle = linearGrad(ctx, ax - 8, ay - 8, ax + 8, ay + 20, '#94a3b8', '#475569');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(ax - 8, ay - 10, 16, 32, 4);
      ctx.fill();
      ctx.stroke();

      // Sharp rotting claws
      ctx.fillStyle = '#cbd5e1';
      for (let f = -4; f <= 4; f += 4) {
        ctx.beginPath();
        ctx.moveTo(ax + f, ay + 22);
        ctx.lineTo(ax + f + s * 2, ay + 34);
        ctx.lineTo(ax + f - 2, ay + 22);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Zombie Head
    const zx = cx, zy = cy - 42;
    const hGrad = ctx.createRadialGradient(zx - 6, zy - 10, 6, zx, zy, 28);
    hGrad.addColorStop(0, '#cbd5e1');
    hGrad.addColorStop(0.4, '#94a3b8');
    hGrad.addColorStop(0.8, '#475569');
    hGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = hGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(zx - 24, zy - 24, 48, 50, [14, 14, 20, 20]);
    ctx.fill();
    ctx.stroke();

    // Hollow Gaping Eye Sockets with Sinister Yellow Glowing Eyes
    for (const s of [-1, 1]) {
      const ex = zx + s * 11;
      const ey = zy - 4;
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.arc(ex, ey, 7, 0, Math.PI * 2);
      ctx.fill();

      // Glowing amber iris
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex - 1, ey - 2, 2, 2);
    }

    // Gaping Maw with Jagged Teeth
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.roundRect(zx - 14, zy + 14, 28, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    for (let t = -10; t <= 10; t += 5) {
      ctx.fillRect(zx + t, zy + 15, 3, 4);
      ctx.fillRect(zx + t, zy + 21, 3, 4);
    }

    ctx.restore();
    return cropToBBox(c);
  }

  function renderRedArremer() {
    const c = document.createElement('canvas');
    c.width = 280; c.height = 280;
    const ctx = c.getContext('2d');
    const cx = 140, cy = 140;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 95, 50, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Large Demonic Scalloped Bat Wings
    for (const s of [-1, 1]) {
      const wx = cx + s * 35;
      const wy = cy - 25;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.scale(s, 1);

      // Wing Membrane
      const wGrad = ctx.createLinearGradient(0, -60, 80, 50);
      wGrad.addColorStop(0, '#dc2626');
      wGrad.addColorStop(0.5, '#7f1d1d');
      wGrad.addColorStop(1, '#180709');
      ctx.fillStyle = wGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(25, -65);
      ctx.lineTo(82, -35);
      ctx.quadraticCurveTo(62, -10, 72, 15);
      ctx.quadraticCurveTo(45, 25, 42, 48);
      ctx.quadraticCurveTo(20, 32, 0, 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing Bone Struts
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(82, -35);
      ctx.moveTo(25, -65); ctx.lineTo(72, 15);
      ctx.moveTo(35, -20); ctx.lineTo(42, 48);
      ctx.stroke();

      ctx.restore();
    }

    // Barbed Demonic Tail
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 50);
    ctx.quadraticCurveTo(cx - 45, cy + 75, cx - 35, cy + 95);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + 95);
    ctx.lineTo(cx - 46, cy + 85);
    ctx.lineTo(cx - 24, cy + 88);
    ctx.closePath();
    ctx.fill();

    // Muscular Crimson Torso
    const tGrad = ctx.createLinearGradient(cx - 25, cy - 15, cx + 25, cy + 45);
    tGrad.addColorStop(0, '#f87171');
    tGrad.addColorStop(0.4, '#dc2626');
    tGrad.addColorStop(0.8, '#991b1b');
    tGrad.addColorStop(1, '#450a0a');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(cx - 22, cy - 10, 44, 55, 12);
    ctx.fill();
    ctx.stroke();

    // Clawed Talon Feet
    for (const s of [-1, 1]) {
      const lx = cx + s * 22;
      const ly = cy + 48;
      ctx.fillStyle = '#b91c1c';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(lx - 9, ly, 18, 30, 4);
      ctx.fill();
      ctx.stroke();

      // Sharp talons
      ctx.fillStyle = '#f8fafc';
      for (let t = -6; t <= 6; t += 6) {
        ctx.beginPath();
        ctx.moveTo(lx + t, ly + 28);
        ctx.lineTo(lx + t + s * 2, ly + 38);
        ctx.lineTo(lx + t - 2, ly + 28);
        ctx.fill();
      }
    }

    // Demonic Head & Horns
    const hx = cx, hy = cy - 38;
    // Sweeping Black & Red Horns
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, hx, hy - 40, hx + s * 45, hy - 10, '#f87171', '#0f172a');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(hx + s * 14, hy - 14);
      ctx.quadraticCurveTo(hx + s * 42, hy - 42, hx + s * 34, hy - 58);
      ctx.quadraticCurveTo(hx + s * 22, hy - 35, hx + s * 8, hy - 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head
    const headGrad = ctx.createRadialGradient(hx - 5, hy - 6, 5, hx, hy, 26);
    headGrad.addColorStop(0, '#f87171');
    headGrad.addColorStop(0.5, '#dc2626');
    headGrad.addColorStop(1, '#450a0a');
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(hx - 22, hy - 22, 44, 44, 12);
    ctx.fill();
    ctx.stroke();

    // Fierce Amber Slit Eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 10;
      const ey = hy - 4;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6, 4, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(ex - 1.2, ey - 4, 2.4, 8);
    }

    // Fanged Snarl
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(hx - 12, hy + 10, 24, 8, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 9, hy + 9, 3.5, 5);
    ctx.fillRect(hx + 5.5, hy + 9, 3.5, 5);

    ctx.restore();
    return cropToBBox(c);
  }

  function renderWoody() {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 240;
    const ctx = c.getContext('2d');
    const cx = 120, cy = 125;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 85, 40, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flapping Imp Wings
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, cx, cy - 20, cx + s * 55, cy + 20, '#a855f7', '#3b0764');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + s * 18, cy - 10);
      ctx.quadraticCurveTo(cx + s * 58, cy - 45, cx + s * 62, cy - 10);
      ctx.quadraticCurveTo(cx + s * 45, cy + 25, cx + s * 16, cy + 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Chubby Purple Imp Body
    const iGrad = ctx.createRadialGradient(cx - 8, cy - 8, 8, cx, cy, 38);
    iGrad.addColorStop(0, '#c084fc');
    iGrad.addColorStop(0.4, '#9333ea');
    iGrad.addColorStop(0.85, '#6b21a8');
    iGrad.addColorStop(1, '#2e1065');
    ctx.fillStyle = iGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10, 30, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Chubby belly highlight
    ctx.fillStyle = 'rgba(233, 213, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 18, 18, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Miniature Pitchfork / Trident
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.5;
    // Shaft
    ctx.fillRect(cx + 34, cy - 45, 5, 85);
    ctx.strokeRect(cx + 34, cy - 45, 5, 85);
    // Prongs
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(cx + 25, cy - 56, 23, 5);
    ctx.fillRect(cx + 25, cy - 68, 4, 14);
    ctx.fillRect(cx + 34.5, cy - 72, 4, 18);
    ctx.fillRect(cx + 44, cy - 68, 4, 14);

    // Mischievous Head with Pointy Goblin Ears
    const hx = cx, hy = cy - 28;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#9333ea';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx + s * 16, hy - 4);
      ctx.lineTo(hx + s * 42, hy - 22);
      ctx.lineTo(hx + s * 22, hy + 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head base
    ctx.fillStyle = iGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(hx, hy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Big glowing yellow eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 10;
      const ey = hy - 4;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(ex, ey, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ex + s * 1.5, ey, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex + s * 1.5 - 1, ey - 2, 2, 2);
    }

    // Wide Mischievous Grin
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(hx, hy + 12, 12, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(hx - 8, hy + 12, 4, 4);
    ctx.fillRect(hx + 4, hy + 12, 4, 4);

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 3. TERRAIN DECOR OBJECTS
  // ==========================================
  function renderTombstone() {
    const c = document.createElement('canvas');
    c.width = 260; c.height = 300;
    const ctx = c.getContext('2d');
    const cx = 130, cy = 160;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 95, 65, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pedestal Stone Base
    ctx.fillStyle = linearGrad(ctx, cx - 60, cy + 60, cx + 60, cy + 95, '#64748b', '#1e293b');
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - 55, cy + 65, 110, 28, [6, 6, 2, 2]);
    ctx.fill();
    ctx.stroke();

    // Stele Slab
    const sGrad = ctx.createLinearGradient(cx - 45, cy - 70, cx + 45, cy + 65);
    sGrad.addColorStop(0, '#cbd5e1');
    sGrad.addColorStop(0.3, '#94a3b8');
    sGrad.addColorStop(0.7, '#475569');
    sGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = sGrad;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 42, cy + 65);
    ctx.lineTo(cx - 42, cy - 25);
    ctx.arc(cx, cy - 25, 42, Math.PI, 0);
    ctx.lineTo(cx + 42, cy + 65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gothic Cross Top Carving
    ctx.fillStyle = '#090d16';
    ctx.fillRect(cx - 6, cy - 65, 12, 60);
    ctx.fillRect(cx - 26, cy - 48, 52, 12);

    // Carved Relic Skull in Medallion
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, cy + 8, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 10, cy + 16, 20, 10);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx - 6, cy + 7, 4, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy + 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 6, cy + 18, 3, 5);
    ctx.fillRect(cx + 3, cy + 18, 3, 5);

    // Chiseled Stone Cracks & Spectral Moss
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 25, cy - 20); ctx.lineTo(cx + 12, cy + 5); ctx.lineTo(cx + 30, cy + 35);
    ctx.stroke();

    // Creeping Eerie Cyan Moss
    ctx.fillStyle = '#0d9488';
    ctx.beginPath();
    ctx.ellipse(cx - 30, cy + 65, 18, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 25, cy + 68, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return cropToBBox(c);
  }

  function renderDeadTree() {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 360;
    const ctx = c.getContext('2d');
    const cx = 150, cy = 190;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 125, 75, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Twisted Haunted Trunk
    const tGrad = ctx.createLinearGradient(cx - 40, cy - 80, cx + 40, cy + 120);
    tGrad.addColorStop(0, '#475569');
    tGrad.addColorStop(0.3, '#334155');
    tGrad.addColorStop(0.7, '#1e293b');
    tGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;

    // Gnarled roots
    ctx.beginPath();
    ctx.moveTo(cx - 45, cy + 125);
    ctx.quadraticCurveTo(cx - 30, cy + 85, cx - 22, cy + 20);
    // Main trunk knot
    ctx.quadraticCurveTo(cx - 40, cy - 30, cx - 18, cy - 80);
    // Left major branch
    ctx.quadraticCurveTo(cx - 75, cy - 120, cx - 110, cy - 145);
    ctx.quadraticCurveTo(cx - 85, cy - 135, cx - 60, cy - 100);
    ctx.quadraticCurveTo(cx - 35, cy - 135, cx - 45, cy - 165);
    ctx.quadraticCurveTo(cx - 25, cy - 135, cx - 5, cy - 105);
    // Center branch
    ctx.quadraticCurveTo(cx, cy - 145, cx + 15, cy - 175);
    ctx.quadraticCurveTo(cx + 20, cy - 135, cx + 18, cy - 95);
    // Right branch
    ctx.quadraticCurveTo(cx + 65, cy - 115, cx + 105, cy - 135);
    ctx.quadraticCurveTo(cx + 80, cy - 105, cx + 38, cy - 70);
    // Right trunk down
    ctx.quadraticCurveTo(cx + 28, cy - 10, cx + 32, cy + 45);
    ctx.quadraticCurveTo(cx + 55, cy + 95, cx + 60, cy + 125);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Spooky Hollow Knothole with Amber Glow
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy + 12, 14, 20, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx - 4, cy + 14, 6, 0, Math.PI * 2);
    ctx.fill();

    // Hanging Spanish Moss / Necrotic Tendrils
    ctx.fillStyle = '#1e3a5f';
    for (const [mx, my] of [[cx - 85, cy - 110], [cx + 70, cy - 90], [cx - 25, cy - 120]]) {
      ctx.beginPath();
      ctx.roundRect(mx, my, 8, 35, 4);
      ctx.fill();
    }

    ctx.restore();
    return cropToBBox(c);
  }

  function renderGargoyle() {
    const c = document.createElement('canvas');
    c.width = 260; c.height = 320;
    const ctx = c.getContext('2d');
    const cx = 130, cy = 160;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 110, 60, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Carved Gothic Stone Pillar Pedestal
    ctx.fillStyle = linearGrad(ctx, cx - 50, cy + 50, cx + 50, cy + 105, '#64748b', '#1e293b');
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - 45, cy + 48, 90, 60, [6, 6, 4, 4]);
    ctx.fill();
    ctx.stroke();
    // Pillar fluting lines
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 30, cy + 54, 8, 48);
    ctx.fillRect(cx - 4, cy + 54, 8, 48);
    ctx.fillRect(cx + 22, cy + 54, 8, 48);

    // Stone Gargoyle Wings
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, cx, cy - 30, cx + s * 55, cy + 30, '#94a3b8', '#334155');
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx + s * 14, cy);
      ctx.lineTo(cx + s * 65, cy - 55);
      ctx.lineTo(cx + s * 58, cy + 10);
      ctx.lineTo(cx + s * 38, cy + 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Crouching Stone Demon Body
    const gGrad = ctx.createRadialGradient(cx - 8, cy - 6, 8, cx, cy + 10, 36);
    gGrad.addColorStop(0, '#cbd5e1');
    gGrad.addColorStop(0.5, '#64748b');
    gGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = gGrad;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Claws gripping the pedestal ledge
    ctx.fillStyle = '#e2e8f0';
    for (const s of [-1, 1]) {
      for (let f = -8; f <= 8; f += 8) {
        ctx.fillRect(cx + s * 24 + f, cy + 44, 5, 12);
      }
    }

    // Gargoyle Head & Horns
    const hx = cx, hy = cy - 28;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx + s * 10, hy - 8);
      ctx.lineTo(hx + s * 34, hy - 36);
      ctx.lineTo(hx + s * 18, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = gGrad;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(hx - 22, hy - 18, 44, 40, 10);
    ctx.fill();
    ctx.stroke();

    // Glowing Ruby-Red Demonic Eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 10;
      const ey = hy - 4;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex - 1, ey - 2, 2, 2);
    }

    ctx.restore();
    return cropToBBox(c);
  }

  function renderSkullUrn() {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 280;
    const ctx = c.getContext('2d');
    const cx = 120, cy = 150;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 85, 55, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iron Brazier Pedestal
    ctx.fillStyle = linearGrad(ctx, cx - 40, cy + 50, cx + 40, cy + 85, '#475569', '#090d16');
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - 35, cy + 60, 70, 24, [4, 4, 8, 8]);
    ctx.fill();
    ctx.stroke();

    // Large Cauldron / Urn Bowl
    const uGrad = ctx.createLinearGradient(cx - 45, cy - 20, cx + 45, cy + 60);
    uGrad.addColorStop(0, '#64748b');
    uGrad.addColorStop(0.5, '#334155');
    uGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = uGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 20, 48, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Carved Relic Skull on Urn Face
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(cx, cy + 22, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 8, cy + 30, 16, 8);
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(cx - 5, cy + 21, 3.5, 0, Math.PI * 2);
    ctx.arc(cx + 5, cy + 21, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Dancing Spirit Flame (Purple & Cyan Hellfire)
    const fGrad = ctx.createLinearGradient(cx, cy - 75, cx, cy - 10);
    fGrad.addColorStop(0, '#67e8f9');
    fGrad.addColorStop(0.3, '#a855f7');
    fGrad.addColorStop(0.7, '#7c3aed');
    fGrad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy - 15);
    ctx.quadraticCurveTo(cx - 45, cy - 50, cx - 18, cy - 75);
    ctx.quadraticCurveTo(cx, cy - 45, cx + 8, cy - 85);
    ctx.quadraticCurveTo(cx + 38, cy - 55, cx + 34, cy - 15);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 4. STAGE BOSSES
  // ==========================================
  function renderUnicornBoss() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const cx = 256, cy = 260;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 180, 130, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heavy Gothic Iron Greaves & Sabatons
    for (const s of [-1, 1]) {
      const bx = cx + s * 65;
      const by = cy + 130;
      ctx.fillStyle = linearGrad(ctx, bx - 35, by, bx + 35, by + 50, '#94a3b8', '#1e293b');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(bx - 30, by - 30, 60, 55, 8);
      ctx.fill();
      ctx.stroke();

      // Massive iron foot
      ctx.fillStyle = linearGrad(ctx, bx - 38, by + 25, bx + 38, by + 55, '#cbd5e1', '#334155');
      ctx.beginPath();
      ctx.roundRect(bx - 35, by + 25, 70, 30, [6, 6, 10, 10]);
      ctx.fill();
      ctx.stroke();

      // Gold Trim
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(bx - 26, by + 28, 52, 6);
    }

    // Heavy Gothic Iron Breastplate & Spiked Faulds
    const bGrad = ctx.createLinearGradient(cx - 85, cy - 50, cx + 85, cy + 100);
    bGrad.addColorStop(0, '#f1f5f9');
    bGrad.addColorStop(0.35, '#94a3b8');
    bGrad.addColorStop(0.75, '#475569');
    bGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cx - 80, cy - 45, 160, 150, [24, 24, 16, 16]);
    ctx.fill();
    ctx.stroke();

    // Massive Ornate Gold Medallion with Horn Skull Insignia
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx, cy + 20, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    // Inner gem
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(cx, cy + 20, 18, 0, Math.PI * 2);
    ctx.fill();

    // Colossal Spiked Iron Pauldrons (Shoulder Armor)
    for (const s of [-1, 1]) {
      const px = cx + s * 115;
      const py = cy - 35;
      ctx.fillStyle = linearGrad(ctx, px - 45, py - 45, px + 45, py + 45, '#f8fafc', '#1e293b');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.roundRect(px - 45, py - 35, 90, 75, 16);
      ctx.fill();
      ctx.stroke();

      // Gold Trim & Heavy Spikes
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px - 38, py - 30, 76, 8);
      // Spike
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(px, py - 65);
      ctx.lineTo(px + 18, py - 35);
      ctx.lineTo(px - 18, py - 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Right Hand Wielding Enormous Spiked Mace / Flail
    ctx.save();
    ctx.translate(cx + 145, cy + 30);
    // Arm
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(-22, -30, 44, 75, 12);
    ctx.fill();
    ctx.stroke();
    // Heavy Spiked Mace Ball
    ctx.fillStyle = linearGrad(ctx, 35, -55, 105, 15, '#e2e8f0', '#090d16');
    ctx.beginPath();
    ctx.arc(70, -20, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Mace Spikes
    ctx.fillStyle = '#f59e0b';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const sx = 70 + Math.cos(a) * 48;
      const sy = -20 + Math.sin(a) * 48;
      const ex = 70 + Math.cos(a) * 72;
      const ey = -20 + Math.sin(a) * 72;
      ctx.beginPath();
      ctx.moveTo(sx - Math.sin(a) * 10, sy + Math.cos(a) * 10);
      ctx.lineTo(ex, ey);
      ctx.lineTo(sx + Math.sin(a) * 10, sy - Math.cos(a) * 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Colossal Helmet with Single Piercing Cyclopean Eye
    const hx = cx, hy = cy - 110;
    const hGrad = ctx.createRadialGradient(hx - 15, hy - 25, 15, hx, hy, 75);
    hGrad.addColorStop(0, '#f8fafc');
    hGrad.addColorStop(0.4, '#94a3b8');
    hGrad.addColorStop(0.8, '#334155');
    hGrad.addColorStop(1, '#020617');
    ctx.fillStyle = hGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(hx - 65, hy - 55, 130, 110, [32, 32, 20, 20]);
    ctx.fill();
    ctx.stroke();

    // The Legendary UNICORN Horn (Colossal Gold Blade Horn)
    const hornGrad = ctx.createLinearGradient(hx, hy - 170, hx, hy - 50);
    hornGrad.addColorStop(0, '#fef08a');
    hornGrad.addColorStop(0.5, '#f59e0b');
    hornGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = hornGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy - 55);
    ctx.lineTo(hx, hy - 175);
    ctx.lineTo(hx + 18, hy - 55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Visor Slit
    ctx.fillStyle = '#020617';
    ctx.fillRect(hx - 50, hy - 10, 100, 28);

    // Glowing Red/Amber Cyclopean Eye
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(hx, hy + 4, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(hx, hy + 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 2, hy + 1, 5, 5);

    ctx.restore();
    return cropToBBox(c);
  }

  function renderArremerKingBoss() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const cx = 256, cy = 250;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 185, 140, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // Colossal Majestic Bat Wings
    for (const s of [-1, 1]) {
      const wx = cx + s * 70;
      const wy = cy - 45;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.scale(s, 1);

      const wGrad = ctx.createLinearGradient(0, -120, 170, 90);
      wGrad.addColorStop(0, '#f87171');
      wGrad.addColorStop(0.3, '#dc2626');
      wGrad.addColorStop(0.7, '#7f1d1d');
      wGrad.addColorStop(1, '#0f0204');
      ctx.fillStyle = wGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(45, -135);
      ctx.lineTo(165, -85);
      ctx.quadraticCurveTo(125, -20, 145, 35);
      ctx.quadraticCurveTo(95, 55, 90, 95);
      ctx.quadraticCurveTo(45, 65, 0, 68);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing Struts
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(165, -85);
      ctx.moveTo(45, -135); ctx.lineTo(145, 35);
      ctx.moveTo(70, -40); ctx.lineTo(90, 95);
      ctx.stroke();

      ctx.restore();
    }

    // Muscular Demonic Body & Obsidian Chest Carapace
    const tGrad = ctx.createLinearGradient(cx - 65, cy - 40, cx + 65, cy + 110);
    tGrad.addColorStop(0, '#ef4444');
    tGrad.addColorStop(0.4, '#b91c1c');
    tGrad.addColorStop(0.8, '#450a0a');
    tGrad.addColorStop(1, '#0f0204');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cx - 55, cy - 35, 110, 135, 20);
    ctx.fill();
    ctx.stroke();

    // Glowing Magma Veins on Chest
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx - 28, cy + 25); ctx.lineTo(cx - 15, cy + 70);
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 28, cy + 25); ctx.lineTo(cx + 15, cy + 70);
    ctx.stroke();

    // Clawed Talon Feet
    for (const s of [-1, 1]) {
      const lx = cx + s * 48;
      const ly = cy + 105;
      ctx.fillStyle = '#991b1b';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(lx - 22, ly, 44, 70, 8);
      ctx.fill();
      ctx.stroke();

      // Talons
      ctx.fillStyle = '#f8fafc';
      for (let t = -12; t <= 12; t += 12) {
        ctx.beginPath();
        ctx.moveTo(lx + t, ly + 65);
        ctx.lineTo(lx + t + s * 4, ly + 88);
        ctx.lineTo(lx + t - 4, ly + 65);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Demonic King Head & Crown of Horns
    const hx = cx, hy = cy - 95;
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, hx, hy - 90, hx + s * 95, hy - 20, '#ef4444', '#020617');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(hx + s * 24, hy - 20);
      ctx.quadraticCurveTo(hx + s * 88, hy - 75, hx + s * 75, hy - 120);
      ctx.quadraticCurveTo(hx + s * 45, hy - 65, hx + s * 14, hy - 32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head
    const headGrad = ctx.createRadialGradient(hx - 12, hy - 12, 12, hx, hy, 55);
    headGrad.addColorStop(0, '#f87171');
    headGrad.addColorStop(0.4, '#dc2626');
    headGrad.addColorStop(0.8, '#7f1d1d');
    headGrad.addColorStop(1, '#0f0204');
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.roundRect(hx - 48, hy - 48, 96, 96, 24);
    ctx.fill();
    ctx.stroke();

    // Piercing Glowing Amber Eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 22;
      const ey = hy - 10;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 12, 8, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(ex - 2.5, ey - 8, 5, 16);
    }

    // Snarl with sharp fangs
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.roundRect(hx - 26, hy + 20, 52, 18, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 20, hy + 18, 7, 10);
    ctx.fillRect(hx + 13, hy + 18, 7, 10);

    ctx.restore();
    return cropToBBox(c);
  }

  function renderAstarothBoss() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const cx = 256, cy = 250;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 185, 145, 42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Colossal Purple & Indigo Demon Body
    const aGrad = ctx.createLinearGradient(cx - 85, cy - 40, cx + 85, cy + 120);
    aGrad.addColorStop(0, '#c084fc');
    aGrad.addColorStop(0.35, '#7e22ce');
    aGrad.addColorStop(0.75, '#581c87');
    aGrad.addColorStop(1, '#1e0538');
    ctx.fillStyle = aGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cx - 75, cy - 40, 150, 165, 24);
    ctx.fill();
    ctx.stroke();

    // Golden Armored Belt
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 4;
    ctx.fillRect(cx - 72, cy + 115, 144, 18);
    ctx.strokeRect(cx - 72, cy + 115, 144, 18);

    // ==========================================
    // THE SECOND FACE ON STOMACH (Iconic Astaroth)
    // ==========================================
    const fx = cx, fy = cy + 45;
    // Stomach face socket
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.roundRect(fx - 45, fy - 25, 90, 65, 14);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Stomach Eyes
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(fx + s * 22, fy - 6, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(fx + s * 22, fy - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Incandescent Hellfire spitting from stomach mouth
    const fireGrad = ctx.createLinearGradient(fx, fy + 8, fx, fy + 35);
    fireGrad.addColorStop(0, '#ffffff');
    fireGrad.addColorStop(0.3, '#fde047');
    fireGrad.addColorStop(0.7, '#ea580c');
    fireGrad.addColorStop(1, '#991b1b');
    ctx.fillStyle = fireGrad;
    ctx.fillRect(fx - 34, fy + 8, 68, 22);

    // Sharp fangs
    ctx.fillStyle = '#f8fafc';
    for (let t = -28; t <= 28; t += 11) {
      ctx.fillRect(fx + t, fy + 6, 6, 10);
      ctx.fillRect(fx + t, fy + 20, 6, 10);
    }

    // Massive Muscular Arms & Heavy Gold Bracers
    for (const s of [-1, 1]) {
      const ax = cx + s * 105;
      const ay = cy + 25;
      ctx.fillStyle = aGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.roundRect(ax - 28, ay - 45, 56, 105, 16);
      ctx.fill();
      ctx.stroke();

      // Gold Bracer
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(ax - 26, ay + 20, 52, 24);
      ctx.strokeStyle = '#78350f';
      ctx.strokeRect(ax - 26, ay + 20, 52, 24);
    }

    // Giant Cursed Trident in Right Hand
    ctx.save();
    ctx.translate(cx + 145, cy - 25);
    // Gold shaft
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3.5;
    ctx.fillRect(0, -140, 10, 290);
    ctx.strokeRect(0, -140, 10, 290);
    // Trident prongs
    const pGrad = ctx.createLinearGradient(-35, -190, 45, -130);
    pGrad.addColorStop(0, '#67e8f9');
    pGrad.addColorStop(1, '#3b82f6');
    ctx.fillStyle = pGrad;
    ctx.fillRect(-35, -145, 80, 12);
    ctx.beginPath();
    ctx.moveTo(-35, -145); ctx.lineTo(-35, -185); ctx.lineTo(-25, -145);
    ctx.moveTo(5, -145); ctx.lineTo(5, -210); ctx.lineTo(15, -145);
    ctx.moveTo(45, -145); ctx.lineTo(45, -185); ctx.lineTo(35, -145);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Primary Head & Magnificent Golden Crown Horns
    const hx = cx, hy = cy - 115;
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, hx, hy - 85, hx + s * 95, hy - 15, '#fbbf24', '#78350f');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(hx + s * 24, hy - 20);
      ctx.quadraticCurveTo(hx + s * 90, hy - 75, hx + s * 80, hy - 115);
      ctx.quadraticCurveTo(hx + s * 45, hy - 65, hx + s * 14, hy - 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head base
    const headGrad = ctx.createRadialGradient(hx - 14, hy - 14, 14, hx, hy, 55);
    headGrad.addColorStop(0, '#c084fc');
    headGrad.addColorStop(0.4, '#7e22ce');
    headGrad.addColorStop(0.8, '#581c87');
    headGrad.addColorStop(1, '#1e0538');
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.roundRect(hx - 50, hy - 48, 100, 96, 22);
    ctx.fill();
    ctx.stroke();

    // Regal Golden Diadem Crown
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(hx - 44, hy - 44, 88, 14);
    for (let c = -30; c <= 30; c += 20) {
      ctx.beginPath();
      ctx.moveTo(hx + c - 7, hy - 44);
      ctx.lineTo(hx + c, hy - 60);
      ctx.lineTo(hx + c + 7, hy - 44);
      ctx.fill();
    }

    // Piercing Glowing Eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 22;
      const ey = hy - 12;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 10, 6, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#020617';
      ctx.fillRect(ex - 2, ey - 6, 4, 12);
    }

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 5. SEAMLESS MAKAIMURA GROUND (1024x1024)
  // ==========================================
  function renderMakaimuraGround() {
    const T = 1024;
    const c = document.createElement('canvas');
    c.width = T; c.height = T;
    const ctx = c.getContext('2d');

    // Deep haunted midnight graveyard base
    ctx.fillStyle = '#0d0b1a';
    ctx.fillRect(0, 0, T, T);

    // Subtle dark purple soil gradient
    const sGrad = ctx.createLinearGradient(0, 0, T, T);
    sGrad.addColorStop(0, '#151128');
    sGrad.addColorStop(0.5, '#0e0b1d');
    sGrad.addColorStop(1, '#1b1433');
    ctx.fillStyle = sGrad;
    ctx.fillRect(0, 0, T, T);

    // Voronoi / Cobblestone grid generation with seamless wrapping
    const step = 128;
    const rows = T / step;
    const cols = T / step;

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * step;
        const y = r * step;
        const shiftX = ((r % 2) * (step / 2));
        const stoneX = (x + shiftX) % T;
        const stoneY = y;

        // Draw individual weathered gothic cobblestone slab
        const sw = step - 12;
        const sh = step - 14;

        // Stone gradient with 3D bevel
        const stoneGrad = ctx.createLinearGradient(stoneX, stoneY, stoneX + sw, stoneY + sh);
        stoneGrad.addColorStop(0, '#2d274c');
        stoneGrad.addColorStop(0.3, '#211c38');
        stoneGrad.addColorStop(0.7, '#181329');
        stoneGrad.addColorStop(1, '#090712');

        ctx.fillStyle = stoneGrad;
        ctx.strokeStyle = '#05030a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(stoneX + 4, stoneY + 4, sw, sh, 8);
        ctx.fill();
        ctx.stroke();

        // Top-left specular moonlight edge highlight
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(stoneX + 8, stoneY + sh + 2);
        ctx.lineTo(stoneX + 8, stoneY + 8);
        ctx.lineTo(stoneX + sw, stoneY + 8);
        ctx.stroke();

        // Chiseled surface cracks
        if ((r + col) % 3 === 0) {
          ctx.strokeStyle = 'rgba(5, 3, 10, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(stoneX + 18, stoneY + 16);
          ctx.lineTo(stoneX + 38, stoneY + 42);
          ctx.lineTo(stoneX + 54, stoneY + 36);
          ctx.stroke();
        }

        // Spectral graveyard moss patches
        if ((r * 7 + col * 13) % 4 === 0) {
          ctx.fillStyle = 'rgba(13, 148, 136, 0.28)';
          ctx.beginPath();
          ctx.ellipse(stoneX + sw * 0.7, stoneY + sh * 0.75, 18, 10, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Ambient Necrotic Mist (Soft-light blend)
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const mGrad = ctx.createRadialGradient(T / 2, T / 2, T * 0.1, T / 2, T / 2, T * 0.7);
    mGrad.addColorStop(0, 'rgba(147, 51, 234, 0.45)');
    mGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mGrad;
    ctx.fillRect(0, 0, T, T);
    ctx.restore();

    return c.toDataURL('image/png');
  }

  // Execute all renders
  results['arthur'] = renderArthur();
  results['makai_zombie'] = renderZombie();
  results['makai_red_arremer'] = renderRedArremer();
  results['makai_woody'] = renderWoody();
  results['makai_tombstone'] = renderTombstone();
  results['makai_dead_tree'] = renderDeadTree();
  results['makai_gargoyle'] = renderGargoyle();
  results['makai_skull_urn'] = renderSkullUrn();
  results['boss_unicorn'] = renderUnicornBoss();
  results['boss_arremer_king'] = renderArremerKingBoss();
  results['boss_astaroth'] = renderAstarothBoss();
  results['ground_makaimura'] = renderMakaimuraGround();

  return results;
});

// Save all rendered data URLs to corresponding disk files
const destinationMap = {
  'arthur': 'assets/makaimura/arthur.png',
  'makai_zombie': 'assets/makaimura/makai_zombie.png',
  'makai_red_arremer': 'assets/makaimura/makai_red_arremer.png',
  'makai_woody': 'assets/makaimura/makai_woody.png',
  'makai_tombstone': 'assets/decor/makai_tombstone.png',
  'makai_dead_tree': 'assets/decor/makai_dead_tree.png',
  'makai_gargoyle': 'assets/decor/makai_gargoyle.png',
  'makai_skull_urn': 'assets/decor/makai_skull_urn.png',
  'boss_unicorn': 'assets/bosses/boss_unicorn.png',
  'boss_arremer_king': 'assets/bosses/boss_arremer_king.png',
  'boss_astaroth': 'assets/bosses/boss_astaroth.png',
  'ground_makaimura': 'assets/ground/ground_makaimura.png',
};

const PROJECT_ROOT = '/Users/hsiehminchieh/Dev/Personal/gaga-survivor';
for (const [key, destRel] of Object.entries(destinationMap)) {
  const dataUrl = renderedAssets[key];
  if (!dataUrl) {
    console.error(`Missing dataUrl for ${key}`);
    continue;
  }
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
  const buf = Buffer.from(base64Data, 'base64');
  const destAbs = path.resolve(PROJECT_ROOT, destRel);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, buf);
  console.log(`Saved ${key} -> ${destRel} (${buf.length} bytes)`);
}

await task.finish({ keep: "all" });
console.log("All Makaimura assets rendered and saved successfully!");
