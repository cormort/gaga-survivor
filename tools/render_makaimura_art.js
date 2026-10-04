// tools/render_makaimura_art.js
// High-fidelity procedural rendering pipeline for Ghosts 'n Goblins (魔界村) assets
// REDESIGNED IN 100% AUTHENTIC WARHAMMER 40K / GRIMDARK GOTHIC STYLE

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const task = await taskSpace("render-warhammer-makaimura-" + Date.now());
const page = task.page("p1");

console.log("Navigating to local dev server to initialize rendering context...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");

console.log("Rendering Warhammer-style Makaimura assets in page context...");

const renderedAssets = await page.evaluate(async () => {
  const results = {};

  // Utility: tight bounding box crop with padding
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
        if (a > 12) {
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

  // Linear gradient helper
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

  // Draw Purity Seal (40K Signature)
  function drawPuritySeal(ctx, x, y, size = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    // Red wax seal
    ctx.fillStyle = '#991b1b';
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner skull stamp
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, -0.5, 2, 0, Math.PI * 2);
    ctx.fill();
    // Hanging parchment scroll
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, 4);
    ctx.lineTo(3, 4);
    ctx.lineTo(3.5, 16);
    ctx.lineTo(0, 14);
    ctx.lineTo(-3.5, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Text markings on parchment
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-2, 7, 4, 1);
    ctx.fillRect(-2, 10, 4, 1);
    ctx.restore();
  }

  // Draw Imperial Skull Emblem
  function drawImperialSkull(ctx, x, y, r = 6) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#f1f5f9';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    // Cranium
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Jaw
    ctx.beginPath();
    ctx.roundRect(-r * 0.5, r * 0.4, r, r * 0.6, 1.5);
    ctx.fill();
    ctx.stroke();
    // Eye sockets
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.1, r * 0.25, 0, Math.PI * 2);
    ctx.arc(r * 0.35, -r * 0.1, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ==========================================
  // 1. ARTHUR (WARHAMMER PALADIN / BLACK TEMPLAR)
  // ==========================================
  function renderArthurWarhammer() {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 320;
    const ctx = c.getContext('2d');
    const cx = 160, cy = 175;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(5, 2, 15, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 96, 58, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Backpack Power Unit Exhaust Vents (Space Marine pattern)
    for (const s of [-1, 1]) {
      const vx = cx + s * 42;
      const vy = cy - 48;
      ctx.fillStyle = linearGrad(ctx, vx - 12, vy, vx + 12, vy, '#64748b', '#0f172a');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(vx, vy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Glowing thermal heat grill
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(vx, vy, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy Ceramite Greaves & Sabatons
    for (const s of [-1, 1]) {
      const bx = cx + s * 28;
      const by = cy + 70;
      // Greaves
      ctx.fillStyle = linearGrad(ctx, bx - 14, by - 16, bx + 14, by + 16, '#64748b', '#1e293b');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(bx - 14, by - 16, 28, 26, 4);
      ctx.fill();
      ctx.stroke();

      // Armored Power Boot
      ctx.fillStyle = linearGrad(ctx, bx - 16, by + 8, bx + 16, by + 22, '#94a3b8', '#0f172a');
      ctx.beginPath();
      ctx.roundRect(bx - 16, by + 8, 32, 18, [4, 4, 8, 8]);
      ctx.fill();
      ctx.stroke();

      // Brass Trim & Studs
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(bx - 12, by + 10, 24, 3.5);
      ctx.beginPath();
      ctx.arc(bx - 6, by - 4, 2, 0, Math.PI * 2);
      ctx.arc(bx + 6, by - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Battle Tabard with Sacred Strawberry Oath Relic (40K Easter Egg)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy + 26);
    ctx.lineTo(cx + 24, cy + 26);
    ctx.lineTo(cx + 18, cy + 62);
    ctx.lineTo(cx - 18, cy + 62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sacred Strawberry pattern on tabard
    ctx.fillStyle = '#dc2626';
    for (const [sx, sy] of [[-10, 36], [8, 38], [-2, 48], [-8, 54], [8, 54]]) {
      ctx.beginPath();
      ctx.arc(cx + sx, cy + sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(cx + sx - 1, cy + sy - 4, 2, 2);
      ctx.fillStyle = '#dc2626';
    }

    // Purity seal hanging from tabard
    drawPuritySeal(ctx, cx - 18, cy + 28, 1.1);

    // Ceramite Cuirass / Artificer Breastplate
    const bGrad = ctx.createLinearGradient(cx - 38, cy - 25, cx + 38, cy + 28);
    bGrad.addColorStop(0, '#94a3b8');
    bGrad.addColorStop(0.35, '#475569');
    bGrad.addColorStop(0.75, '#1e293b');
    bGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - 34, cy - 22, 68, 48, [10, 10, 6, 6]);
    ctx.fill();
    ctx.stroke();

    // Golden Imperial Aquila & Skull on Breastplate
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    // Wings
    ctx.beginPath();
    ctx.moveTo(cx, cy + 2);
    ctx.lineTo(cx - 22, cy - 6);
    ctx.lineTo(cx - 20, cy + 8);
    ctx.lineTo(cx, cy + 12);
    ctx.lineTo(cx + 20, cy + 8);
    ctx.lineTo(cx + 22, cy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Center skull
    drawImperialSkull(ctx, cx, cy + 4, 4.5);

    // Massive Astartes Gothic Pauldrons (Shoulder Armor)
    for (const s of [-1, 1]) {
      const px = cx + s * 46;
      const py = cy - 14;
      ctx.fillStyle = linearGrad(ctx, px - 20, py - 20, px + 20, py + 20, '#cbd5e1', '#0f172a');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(px - 18, py - 18, 36, 32, [8, 8, 4, 4]);
      ctx.fill();
      ctx.stroke();

      // Golden Rim Border
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(px - 16, py - 16, 32, 28);

      // Skull on pauldron
      drawImperialSkull(ctx, px, py - 2, 4);

      // Purity Seal on pauldron
      if (s === -1) {
        drawPuritySeal(ctx, px - 12, py + 8, 0.9);
      }
    }

    // Left Arm: Heavy Gothic Storm Shield with Reliquary Skull
    ctx.save();
    ctx.translate(cx - 56, cy + 8);
    ctx.rotate(0.12);
    // Shield Body
    const sGrad = ctx.createLinearGradient(-26, -35, 26, 35);
    sGrad.addColorStop(0, '#475569');
    sGrad.addColorStop(0.5, '#1e293b');
    sGrad.addColorStop(1, '#020617');
    ctx.fillStyle = sGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-24, -36);
    ctx.lineTo(24, -36);
    ctx.lineTo(24, 12);
    ctx.lineTo(0, 44);
    ctx.lineTo(-24, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Brass Gothic Rim & Bolts
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Reliquary Cross & Skull on Shield
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-4, -30, 8, 62);
    ctx.fillRect(-18, -14, 36, 8);
    drawImperialSkull(ctx, 0, -10, 7);
    ctx.restore();

    // Right Arm: Nemesis Force Lance / Power Halberd
    ctx.save();
    ctx.translate(cx + 50, cy + 6);
    // Arm bracer
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-8, -12, 16, 26, 4);
    ctx.fill();
    ctx.stroke();

    // Halberd Shaft (Iron & Brass)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(8, -95, 7, 185);
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, -95, 7, 185);

    // Power Field Generator & Battery Casing
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(4, -98, 15, 12);

    // Power Blade with Disruption Field
    const bladeGrad = ctx.createLinearGradient(0, -135, 25, -95);
    bladeGrad.addColorStop(0, '#e0f2fe');
    bladeGrad.addColorStop(0.4, '#38bdf8');
    bladeGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = bladeGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(11.5, -140);
    ctx.lineTo(26, -95);
    ctx.lineTo(-3, -95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crackling Lightning Disruption Arcs
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11.5, -135); ctx.lineTo(18, -115); ctx.lineTo(6, -105);
    ctx.stroke();
    ctx.restore();

    // Knight Greathelm (Astartes Crusader Pattern)
    const hx = cx, hy = cy - 44;
    const hGrad = ctx.createRadialGradient(hx - 8, hy - 14, 8, hx, hy, 36);
    hGrad.addColorStop(0, '#f1f5f9');
    hGrad.addColorStop(0.35, '#94a3b8');
    hGrad.addColorStop(0.75, '#334155');
    hGrad.addColorStop(1, '#020617');
    ctx.fillStyle = hGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.roundRect(hx - 26, hy - 26, 52, 50, [16, 16, 12, 12]);
    ctx.fill();
    ctx.stroke();

    // Crusader T-Visor
    ctx.fillStyle = '#020617';
    ctx.fillRect(hx - 18, hy - 6, 36, 7);
    ctx.fillRect(hx - 3.5, hy - 6, 7, 24);

    // Glowing Cyan Tactical Visor Lenses
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(hx - 16, hy - 5, 11, 5);
    ctx.fillRect(hx + 5, hy - 5, 11, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 14, hy - 4, 3, 2);
    ctx.fillRect(hx + 7, hy - 4, 3, 2);

    // Rebreather / Vox Grill (Space Marine Vox)
    ctx.fillStyle = '#475569';
    for (let r = 0; r < 3; r++) {
      ctx.fillRect(hx - 10, hy + 8 + r * 3, 6, 1.8);
      ctx.fillRect(hx + 4, hy + 8 + r * 3, 6, 1.8);
    }

    // Legendary Gallant Mustache & Beard under Vox
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(hx, hy + 18, 5, 0, Math.PI);
    ctx.fill();

    // Red Crusader Crest Plume
    const plumeGrad = ctx.createLinearGradient(hx - 10, hy - 65, hx + 25, hy - 25);
    plumeGrad.addColorStop(0, '#ef4444');
    plumeGrad.addColorStop(0.5, '#b91c1c');
    plumeGrad.addColorStop(1, '#450a0a');
    ctx.fillStyle = plumeGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy - 26);
    ctx.quadraticCurveTo(hx - 20, hy - 68, hx + 14, hy - 72);
    ctx.quadraticCurveTo(hx + 30, hy - 52, hx + 12, hy - 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 2. STAGE ENEMIES (NURGLE / KHORNE / CHAOS)
  // ==========================================
  function renderZombieWarhammer() {
    // Nurgle Poxwalker / Rotting Servitor
    const c = document.createElement('canvas');
    c.width = 240; c.height = 260;
    const ctx = c.getContext('2d');
    const cx = 120, cy = 135;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 92, 45, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotting Poxwalker Legs
    for (const s of [-1, 1]) {
      const lx = cx + s * 16;
      const ly = cy + 62;
      ctx.fillStyle = '#4d7c0f';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(lx - 9, ly - 8, 18, 30, 3);
      ctx.fill();
      ctx.stroke();
    }

    // Diseased Bloated Torso with Pustules & Guts
    const tGrad = ctx.createLinearGradient(cx - 25, cy - 20, cx + 25, cy + 45);
    tGrad.addColorStop(0, '#84cc16');
    tGrad.addColorStop(0.5, '#4d7c0f');
    tGrad.addColorStop(1, '#14532d');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(cx - 24, cy - 14, 48, 56, 10);
    ctx.fill();
    ctx.stroke();

    // Toxic Nurgle Pustules (Bubbling boils)
    const pustules = [[-12, 4, 5], [10, -2, 4], [-4, 22, 6], [12, 18, 5]];
    for (const [px, py, pr] of pustules) {
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#713f12';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx + px, cy + py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Arms: Left mutated claw, Right arm wielding rusted scrap cleaver (Choppa)
    // Left mutated claw
    ctx.fillStyle = '#65a30d';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cx - 38, cy + 2, 14, 30, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 40, cy + 28, 4, 8);
    ctx.fillRect(cx - 34, cy + 30, 4, 9);
    ctx.fillRect(cx - 28, cy + 28, 4, 8);

    // Right arm with Rusted Choppa
    ctx.fillStyle = '#4d7c0f';
    ctx.beginPath();
    ctx.roundRect(cx + 24, cy - 4, 14, 28, 4);
    ctx.fill();
    ctx.stroke();
    // Heavy rusted scrap cleaver
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + 32, cy + 20);
    ctx.lineTo(cx + 32, cy - 25);
    ctx.lineTo(cx + 52, cy - 18);
    ctx.lineTo(cx + 46, cy + 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Poxwalker Head with Corrupted Nurgle Horn Spur
    const hx = cx, hy = cy - 38;
    // Mutated Nurgle Horn
    ctx.fillStyle = '#ca8a04';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(hx + 10, hy - 14);
    ctx.quadraticCurveTo(hx + 36, hy - 45, hx + 28, hy - 58);
    ctx.quadraticCurveTo(hx + 18, hy - 35, hx + 4, hy - 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Head base
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(hx - 22, hy - 22, 44, 44, 12);
    ctx.fill();
    ctx.stroke();

    // Half skull / Diseased eye & Cybernetic red sensor
    // Left eye: sickly cataract yellow
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(hx - 10, hy - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(hx - 10, hy - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Right eye: grafted bionic sensor
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(hx + 4, hy - 9, 12, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(hx + 10, hy - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Gaping rotten mouth with crooked teeth
    ctx.fillStyle = '#020617';
    ctx.fillRect(hx - 12, hy + 10, 24, 7);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(hx - 10, hy + 9, 3, 4);
    ctx.fillRect(hx + 4, hy + 9, 3, 4);

    ctx.restore();
    return cropToBBox(c);
  }

  function renderRedArremerWarhammer() {
    // Khorne Bloodletter Daemon / Warp Gargoyle
    const c = document.createElement('canvas');
    c.width = 280; c.height = 280;
    const ctx = c.getContext('2d');
    const cx = 140, cy = 140;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 96, 52, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Large Bat-Daemon Wings with Chaos Brass Runes
    for (const s of [-1, 1]) {
      const wx = cx + s * 36;
      const wy = cy - 25;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.scale(s, 1);

      const wGrad = ctx.createLinearGradient(0, -65, 85, 55);
      wGrad.addColorStop(0, '#dc2626');
      wGrad.addColorStop(0.4, '#991b1b');
      wGrad.addColorStop(0.8, '#450a0a');
      wGrad.addColorStop(1, '#090102');
      ctx.fillStyle = wGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(28, -70);
      ctx.lineTo(88, -40);
      ctx.quadraticCurveTo(68, -10, 78, 18);
      ctx.quadraticCurveTo(50, 30, 46, 52);
      ctx.quadraticCurveTo(22, 35, 0, 38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Burning Brass Khorne Rune on Wing
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(35, -25); ctx.lineTo(55, -25);
      ctx.moveTo(45, -35); ctx.lineTo(45, -5);
      ctx.moveTo(35, -5); ctx.lineTo(55, -5);
      ctx.stroke();
      ctx.restore();
    }

    // Barbed Daemon Tail
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 45);
    ctx.quadraticCurveTo(cx - 45, cy + 70, cx - 35, cy + 96);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + 96);
    ctx.lineTo(cx - 48, cy + 85);
    ctx.lineTo(cx - 24, cy + 88);
    ctx.closePath();
    ctx.fill();

    // Muscular Khorne Red Torso & Spiked Brass Collar
    const tGrad = ctx.createLinearGradient(cx - 25, cy - 15, cx + 25, cy + 45);
    tGrad.addColorStop(0, '#ef4444');
    tGrad.addColorStop(0.4, '#b91c1c');
    tGrad.addColorStop(0.8, '#7f1d1d');
    tGrad.addColorStop(1, '#2d0606');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - 24, cy - 12, 48, 56, 12);
    ctx.fill();
    ctx.stroke();

    // Spiked Brass Collar of Khorne
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx - 18, cy - 14, 36, 6);
    for (let sp = -14; sp <= 14; sp += 7) {
      ctx.beginPath();
      ctx.moveTo(cx + sp - 2, cy - 14);
      ctx.lineTo(cx + sp, cy - 20);
      ctx.lineTo(cx + sp + 2, cy - 14);
      ctx.fill();
    }

    // Clawed Talon Feet
    for (const s of [-1, 1]) {
      const lx = cx + s * 22;
      const ly = cy + 48;
      ctx.fillStyle = '#991b1b';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(lx - 10, ly, 20, 32, 4);
      ctx.fill();
      ctx.stroke();
      // Black razor talons
      ctx.fillStyle = '#020617';
      for (let t = -6; t <= 6; t += 6) {
        ctx.fillRect(lx + t - 1.5, ly + 30, 3.5, 8);
      }
    }

    // Head: Elongated Bloodletter Skull with Jagged Obsidian Horns
    const hx = cx, hy = cy - 40;
    // Sweeping Black Obsidian Horns
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, hx, hy - 45, hx + s * 55, hy - 10, '#0f172a', '#7f1d1d');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hx + s * 14, hy - 14);
      ctx.quadraticCurveTo(hx + s * 52, hy - 48, hx + s * 42, hy - 68);
      ctx.quadraticCurveTo(hx + s * 26, hy - 40, hx + s * 8, hy - 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(hx - 22, hy - 22, 44, 44, 12);
    ctx.fill();
    ctx.stroke();

    // Blazing Hellfire Coal Eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 11;
      const ey = hy - 4;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6, 4, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(ex - 1.2, ey - 4, 2.4, 8);
    }

    // Fanged Snarl
    ctx.fillStyle = '#020617';
    ctx.fillRect(hx - 14, hy + 10, 28, 7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 10, hy + 9, 3.5, 5);
    ctx.fillRect(hx + 6.5, hy + 9, 3.5, 5);

    ctx.restore();
    return cropToBBox(c);
  }

  function renderWoodyWarhammer() {
    // Chaos Nurgling Imp / Flying Warp Gremlin
    const c = document.createElement('canvas');
    c.width = 240; c.height = 240;
    const ctx = c.getContext('2d');
    const cx = 120, cy = 125;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 86, 42, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leathery Chaos Bat Wings
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, cx, cy - 25, cx + s * 65, cy + 20, '#581c87', '#1e0538');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx + s * 18, cy - 10);
      ctx.quadraticCurveTo(cx + s * 62, cy - 48, cx + s * 65, cy - 8);
      ctx.quadraticCurveTo(cx + s * 48, cy + 28, cx + s * 16, cy + 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Chubby Grotesque Nurgling Torso (Toxic Purple-Green)
    const nGrad = ctx.createRadialGradient(cx - 8, cy - 8, 8, cx, cy, 38);
    nGrad.addColorStop(0, '#c084fc');
    nGrad.addColorStop(0.4, '#7e22ce');
    nGrad.addColorStop(0.8, '#4c1d95');
    nGrad.addColorStop(1, '#1e0538');
    ctx.fillStyle = nGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10, 32, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rotting Belly with Green Pustules
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.arc(cx - 8, cy + 15, 5, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy + 20, 6, 0, Math.PI * 2);
    ctx.fill();

    // Barbed Chaos Pitchfork
    ctx.fillStyle = '#78350f';
    ctx.fillRect(cx + 36, cy - 50, 5, 95);
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 36, cy - 50, 5, 95);
    // Rusted Prongs with Chaos Star Icon
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx + 26, cy - 62, 25, 6);
    ctx.fillRect(cx + 26, cy - 76, 4, 16);
    ctx.fillRect(cx + 36.5, cy - 82, 4, 22);
    ctx.fillRect(cx + 47, cy - 76, 4, 16);

    // Mischievous Horned Nurgling Head
    const hx = cx, hy = cy - 28;
    // Twisted Horns
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ca8a04';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hx + s * 14, hy - 10);
      ctx.lineTo(hx + s * 34, hy - 32);
      ctx.lineTo(hx + s * 20, hy - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = nGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(hx, hy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wild Asymmetrical Yellow Eyes
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(hx - 9, hy - 4, 7, 0, Math.PI * 2);
    ctx.arc(hx + 9, hy - 6, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(hx - 8, hy - 4, 3, 0, Math.PI * 2);
    ctx.arc(hx + 10, hy - 6, 4, 0, Math.PI * 2);
    ctx.fill();

    // Wide Cackling Grin with Rotten Teeth
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(hx, hy + 12, 14, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.fillRect(hx - 10, hy + 12, 4, 5);
    ctx.fillRect(hx + 5, hy + 12, 4, 5);

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 3. TERRAIN DECOR (IMPERIAL / CHAOS GRIMDARK)
  // ==========================================
  function renderTombstoneWarhammer() {
    // Imperial Shrine World Gothic Reliquary Stele
    const c = document.createElement('canvas');
    c.width = 260; c.height = 300;
    const ctx = c.getContext('2d');
    const cx = 130, cy = 160;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 95, 68, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heavy Plinth Base with Skull reliefs
    ctx.fillStyle = linearGrad(ctx, cx - 65, cy + 55, cx + 65, cy + 95, '#475569', '#0f172a');
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - 60, cy + 60, 120, 32, 6);
    ctx.fill();
    ctx.stroke();

    // Gothic Stele with Arched Top
    const sGrad = ctx.createLinearGradient(cx - 45, cy - 70, cx + 45, cy + 60);
    sGrad.addColorStop(0, '#94a3b8');
    sGrad.addColorStop(0.4, '#475569');
    sGrad.addColorStop(0.8, '#1e293b');
    sGrad.addColorStop(1, '#020617');
    ctx.fillStyle = sGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(cx - 42, cy + 60);
    ctx.lineTo(cx - 42, cy - 25);
    ctx.arc(cx, cy - 25, 42, Math.PI, 0);
    ctx.lineTo(cx + 42, cy + 60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Carved Imperial Aquila Wings & Skull
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx - 6, cy - 65, 12, 45);
    ctx.fillRect(cx - 25, cy - 50, 50, 10);
    drawImperialSkull(ctx, cx, cy - 10, 12);

    // Purity Seals on Stele
    drawPuritySeal(ctx, cx - 25, cy + 15, 1.2);
    drawPuritySeal(ctx, cx + 24, cy + 25, 1.0);

    // Dripping Red Votive Candles atop Stele
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx - 32, cy - 35, 6, 12);
    ctx.fillRect(cx + 26, cy - 35, 6, 12);
    // Candle flames
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx - 29, cy - 39, 3, 0, Math.PI * 2);
    ctx.arc(cx + 29, cy - 39, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return cropToBBox(c);
  }

  function renderDeadTreeWarhammer() {
    // Warp-corrupted Blight Tree with Barbed Wire & Skulls
    const c = document.createElement('canvas');
    c.width = 300; c.height = 360;
    const ctx = c.getContext('2d');
    const cx = 150, cy = 190;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 125, 78, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gnarled Blackened Trunk
    const tGrad = ctx.createLinearGradient(cx - 40, cy - 80, cx + 40, cy + 120);
    tGrad.addColorStop(0, '#334155');
    tGrad.addColorStop(0.4, '#1e293b');
    tGrad.addColorStop(0.8, '#0f172a');
    tGrad.addColorStop(1, '#020617');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.moveTo(cx - 45, cy + 125);
    ctx.quadraticCurveTo(cx - 30, cy + 85, cx - 22, cy + 20);
    ctx.quadraticCurveTo(cx - 40, cy - 30, cx - 18, cy - 80);
    ctx.quadraticCurveTo(cx - 75, cy - 120, cx - 110, cy - 145);
    ctx.quadraticCurveTo(cx - 85, cy - 135, cx - 60, cy - 100);
    ctx.quadraticCurveTo(cx - 35, cy - 135, cx - 45, cy - 165);
    ctx.quadraticCurveTo(cx - 25, cy - 135, cx - 5, cy - 105);
    ctx.quadraticCurveTo(cx, cy - 145, cx + 15, cy - 175);
    ctx.quadraticCurveTo(cx + 20, cy - 135, cx + 18, cy - 95);
    ctx.quadraticCurveTo(cx + 65, cy - 115, cx + 105, cy - 135);
    ctx.quadraticCurveTo(cx + 80, cy - 105, cx + 38, cy - 70);
    ctx.quadraticCurveTo(cx + 28, cy - 10, cx + 32, cy + 45);
    ctx.quadraticCurveTo(cx + 55, cy + 95, cx + 60, cy + 125);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Coiled Barbed Wire wrapping the trunk
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    for (let wy = cy - 20; wy <= cy + 80; wy += 25) {
      ctx.beginPath();
      ctx.ellipse(cx, wy, 24, 8, -0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hanging Skull Reliquaries on chains
    drawImperialSkull(ctx, cx - 65, cy - 75, 7);
    drawImperialSkull(ctx, cx + 45, cy - 45, 6);

    // Glowing Toxic Warp Eye Knothole
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy + 10, 14, 20, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.arc(cx - 4, cy + 12, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return cropToBBox(c);
  }

  function renderGargoyleWarhammer() {
    // Imperial Cathedral Servitor Gargoyle with Bionic Eye
    const c = document.createElement('canvas');
    c.width = 260; c.height = 320;
    const ctx = c.getContext('2d');
    const cx = 130, cy = 160;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 110, 64, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gothic Column Pedestal with Imperial Skull Medallion
    ctx.fillStyle = linearGrad(ctx, cx - 50, cy + 50, cx + 50, cy + 105, '#475569', '#0f172a');
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.roundRect(cx - 48, cy + 46, 96, 62, 6);
    ctx.fill();
    ctx.stroke();
    drawImperialSkull(ctx, cx, cy + 76, 8);

    // Gargoyle Stone Wings
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, cx, cy - 30, cx + s * 55, cy + 30, '#64748b', '#1e293b');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + s * 14, cy);
      ctx.lineTo(cx + s * 68, cy - 58);
      ctx.lineTo(cx + s * 60, cy + 12);
      ctx.lineTo(cx + s * 38, cy + 36);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Crouched Stone Body
    const gGrad = ctx.createRadialGradient(cx - 8, cy - 6, 8, cx, cy + 10, 36);
    gGrad.addColorStop(0, '#94a3b8');
    gGrad.addColorStop(0.5, '#475569');
    gGrad.addColorStop(1, '#020617');
    ctx.fillStyle = gGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Head with Bionic Sensor Eye
    const hx = cx, hy = cy - 28;
    ctx.fillStyle = gGrad;
    ctx.beginPath();
    ctx.roundRect(hx - 22, hy - 18, 44, 40, 10);
    ctx.fill();
    ctx.stroke();

    // Bionic Red Sensor Eye (Mechanicus style)
    ctx.fillStyle = '#334155';
    ctx.fillRect(hx + 3, hy - 9, 12, 10);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(hx + 9, hy - 4, 4, 0, Math.PI * 2);
    ctx.fill();

    // Normal stone eye on left
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(hx - 9, hy - 4, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return cropToBBox(c);
  }

  function renderSkullUrnWarhammer() {
    // Mechanicus Incense Skull Brazier
    const c = document.createElement('canvas');
    c.width = 240; c.height = 280;
    const ctx = c.getContext('2d');
    const cx = 120, cy = 150;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 85, 58, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Industrial Blackstone & Brass Base
    ctx.fillStyle = linearGrad(ctx, cx - 40, cy + 50, cx + 40, cy + 85, '#d97706', '#0f172a');
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - 36, cy + 60, 72, 24, 6);
    ctx.fill();
    ctx.stroke();

    // Cauldron Bowl with Cogwheel Crest
    const uGrad = ctx.createLinearGradient(cx - 45, cy - 20, cx + 45, cy + 60);
    uGrad.addColorStop(0, '#64748b');
    uGrad.addColorStop(0.5, '#1e293b');
    uGrad.addColorStop(1, '#020617');
    ctx.fillStyle = uGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 20, 50, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Center Mechanicus Skull
    drawImperialSkull(ctx, cx, cy + 22, 10);

    // Blue-Cyan Promethium Warp Fire
    const fGrad = ctx.createLinearGradient(cx, cy - 75, cx, cy - 10);
    fGrad.addColorStop(0, '#67e8f9');
    fGrad.addColorStop(0.3, '#3b82f6');
    fGrad.addColorStop(0.7, '#8b5cf6');
    fGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy - 15);
    ctx.quadraticCurveTo(cx - 45, cy - 50, cx - 18, cy - 75);
    ctx.quadraticCurveTo(cx, cy - 45, cx + 8, cy - 85);
    ctx.quadraticCurveTo(cx + 38, cy - 55, cx + 35, cy - 15);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 4. STAGE BOSSES (WARHAMMER CHAOS DREADNOUGHTS & DAEMON LORDS)
  // ==========================================
  function renderUnicornWarhammer() {
    // Chaos Hellbrute Titan "Unicorn" (Heavy Corrupted Power Warplate)
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const cx = 256, cy = 260;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.7)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 180, 135, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heavy Industrial Exhaust Smokestacks (Spewing soot and flame)
    for (const s of [-1, 1]) {
      const sx = cx + s * 95;
      const sy = cy - 85;
      ctx.fillStyle = linearGrad(ctx, sx - 16, sy, sx + 16, sy, '#64748b', '#0f172a');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(sx - 14, sy - 50, 28, 70, 6);
      ctx.fill();
      ctx.stroke();
      // Orange exhaust flame
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 52, 10, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy Spiked Chaos Greaves
    for (const s of [-1, 1]) {
      const bx = cx + s * 65;
      const by = cy + 130;
      ctx.fillStyle = linearGrad(ctx, bx - 35, by, bx + 35, by + 50, '#334155', '#020617');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(bx - 32, by - 30, 64, 55, 8);
      ctx.fill();
      ctx.stroke();

      // Foot Sabaton
      ctx.fillStyle = linearGrad(ctx, bx - 38, by + 25, bx + 38, by + 55, '#475569', '#090d16');
      ctx.beginPath();
      ctx.roundRect(bx - 36, by + 25, 72, 32, [6, 6, 12, 12]);
      ctx.fill();
      ctx.stroke();

      // Corrupted Brass Trim & Spikes
      ctx.fillStyle = '#d97706';
      ctx.fillRect(bx - 26, by + 28, 52, 6);
    }

    // Massive Corrupted Iron Dreadnought Torso
    const bGrad = ctx.createLinearGradient(cx - 90, cy - 50, cx + 90, cy + 100);
    bGrad.addColorStop(0, '#64748b');
    bGrad.addColorStop(0.35, '#334155');
    bGrad.addColorStop(0.75, '#0f172a');
    bGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cx - 85, cy - 45, 170, 155, 24);
    ctx.fill();
    ctx.stroke();

    // Spiked Brass Chaos Star Trim on Torso
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 4;
    ctx.strokeRect(cx - 75, cy - 35, 150, 135);
    // Chaos Star Arrows
    ctx.fillStyle = '#f59e0b';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const ax = cx + Math.cos(a) * 45;
      const ay = cy + 25 + Math.sin(a) * 45;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 25);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }

    // Gigantic Spiked Pauldrons with Skulls
    for (const s of [-1, 1]) {
      const px = cx + s * 120;
      const py = cy - 35;
      ctx.fillStyle = linearGrad(ctx, px - 45, py - 45, px + 45, py + 45, '#475569', '#020617');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(px - 48, py - 35, 96, 78, 16);
      ctx.fill();
      ctx.stroke();

      // Brass Trim & Huge Spikes
      ctx.fillStyle = '#d97706';
      ctx.fillRect(px - 40, py - 30, 80, 8);
      // Spike
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(px, py - 70);
      ctx.lineTo(px + 20, py - 35);
      ctx.lineTo(px - 20, py - 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Right Arm: Colossal Spiked Chaos Meteor Hammer
    ctx.save();
    ctx.translate(cx + 155, cy + 30);
    // Industrial Chains
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(40, -10); ctx.lineTo(75, -25);
    ctx.stroke();
    // Spiked Meteor Ball
    ctx.fillStyle = linearGrad(ctx, 40, -60, 110, 10, '#475569', '#020617');
    ctx.beginPath();
    ctx.arc(75, -25, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Giant spikes
    ctx.fillStyle = '#f59e0b';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const sx = 75 + Math.cos(a) * 52;
      const sy = -25 + Math.sin(a) * 52;
      const ex = 75 + Math.cos(a) * 78;
      const ey = -25 + Math.sin(a) * 78;
      ctx.beginPath();
      ctx.moveTo(sx - Math.sin(a) * 12, sy + Math.cos(a) * 12);
      ctx.lineTo(ex, ey);
      ctx.lineTo(sx + Math.sin(a) * 12, sy - Math.cos(a) * 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Horned War-Helm with Single Baleful Warp Cyclops Eye
    const hx = cx, hy = cy - 110;
    const hGrad = ctx.createRadialGradient(hx - 15, hy - 25, 15, hx, hy, 75);
    hGrad.addColorStop(0, '#cbd5e1');
    hGrad.addColorStop(0.4, '#475569');
    hGrad.addColorStop(0.8, '#1e293b');
    hGrad.addColorStop(1, '#020617');
    ctx.fillStyle = hGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(hx - 68, hy - 55, 136, 112, 24);
    ctx.fill();
    ctx.stroke();

    // The Colossal Brass UNICORN Horn (Jagged Chaos Horn)
    const hornGrad = ctx.createLinearGradient(hx, hy - 180, hx, hy - 50);
    hornGrad.addColorStop(0, '#fde047');
    hornGrad.addColorStop(0.5, '#d97706');
    hornGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = hornGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(hx - 20, hy - 55);
    ctx.lineTo(hx - 6, hy - 130);
    ctx.lineTo(hx, hy - 185);
    ctx.lineTo(hx + 6, hy - 130);
    ctx.lineTo(hx + 20, hy - 55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Visor Aperture
    ctx.fillStyle = '#020617';
    ctx.fillRect(hx - 55, hy - 12, 110, 30);

    // Baleful Orange-Red Warp Eye
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(hx, hy + 3, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(hx, hy + 3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 3, hy - 1, 6, 6);

    ctx.restore();
    return cropToBBox(c);
  }

  function renderArremerKingWarhammer() {
    // Greater Daemon of Khorne / Bloodthirster "Arremer King"
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const cx = 256, cy = 250;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.7)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 185, 145, 42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Colossal Wings of Khorne with Burning Hellfire
    for (const s of [-1, 1]) {
      const wx = cx + s * 72;
      const wy = cy - 45;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.scale(s, 1);

      const wGrad = ctx.createLinearGradient(0, -125, 175, 95);
      wGrad.addColorStop(0, '#ef4444');
      wGrad.addColorStop(0.35, '#b91c1c');
      wGrad.addColorStop(0.75, '#450a0a');
      wGrad.addColorStop(1, '#090102');
      ctx.fillStyle = wGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(48, -140);
      ctx.lineTo(172, -90);
      ctx.quadraticCurveTo(130, -20, 150, 38);
      ctx.quadraticCurveTo(100, 60, 95, 100);
      ctx.quadraticCurveTo(48, 70, 0, 72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Khorne Skull Runes
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(70, -50); ctx.lineTo(110, -50);
      ctx.moveTo(90, -70); ctx.lineTo(90, -15);
      ctx.stroke();
      ctx.restore();
    }

    // Daemon Prince Torso & Blackened Brass Armor
    const tGrad = ctx.createLinearGradient(cx - 65, cy - 40, cx + 65, cy + 110);
    tGrad.addColorStop(0, '#dc2626');
    tGrad.addColorStop(0.4, '#991b1b');
    tGrad.addColorStop(0.8, '#450a0a');
    tGrad.addColorStop(1, '#020617');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cx - 58, cy - 35, 116, 140, 22);
    ctx.fill();
    ctx.stroke();

    // Belt of Skulls (Khorne signature)
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx - 52, cy + 95, 104, 12);
    for (let sk = -36; sk <= 36; sk += 24) {
      drawImperialSkull(ctx, cx + sk, cy + 101, 7);
    }

    // Heavy Talons of Damnation
    for (const s of [-1, 1]) {
      const lx = cx + s * 48;
      const ly = cy + 110;
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(lx - 24, ly, 48, 72, 8);
      ctx.fill();
      ctx.stroke();
      // Black razor talons
      ctx.fillStyle = '#020617';
      for (let t = -12; t <= 12; t += 12) {
        ctx.fillRect(lx + t - 3, ly + 65, 6, 20);
      }
    }

    // Demonic King Head & Sweeping Horns of Khorne
    const hx = cx, hy = cy - 95;
    for (const s of [-1, 1]) {
      ctx.fillStyle = linearGrad(ctx, hx, hy - 95, hx + s * 100, hy - 20, '#0f172a', '#7f1d1d');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(hx + s * 24, hy - 20);
      ctx.quadraticCurveTo(hx + s * 95, hy - 80, hx + s * 80, hy - 125);
      ctx.quadraticCurveTo(hx + s * 48, hy - 70, hx + s * 14, hy - 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head base
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(hx - 50, hy - 50, 100, 100, 24);
    ctx.fill();
    ctx.stroke();

    // Blazing Molten Eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 24;
      const ey = hy - 10;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 14, 9, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(ex - 2.5, ey - 9, 5, 18);
    }

    // Gaping Maw of Fangs
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.roundRect(hx - 28, hy + 20, 56, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 22, hy + 18, 8, 12);
    ctx.fillRect(hx + 14, hy + 18, 8, 12);

    ctx.restore();
    return cropToBBox(c);
  }

  function renderAstarothWarhammer() {
    // Chaos Undivided Daemon Sovereign Astaroth (Two-Faced Greater Daemon)
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const cx = 256, cy = 250;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 2, 15, 0.7)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 185, 148, 44, 0, 0, Math.PI * 2);
    ctx.fill();

    // Colossal Purple & Gold Chaos Sovereign Body
    const aGrad = ctx.createLinearGradient(cx - 85, cy - 40, cx + 85, cy + 120);
    aGrad.addColorStop(0, '#9333ea');
    aGrad.addColorStop(0.35, '#6b21a8');
    aGrad.addColorStop(0.75, '#3b0764');
    aGrad.addColorStop(1, '#0f0217');
    ctx.fillStyle = aGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(cx - 78, cy - 40, 156, 170, 24);
    ctx.fill();
    ctx.stroke();

    // Golden Chaos Belt
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx - 75, cy + 115, 150, 18);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4;
    ctx.strokeRect(cx - 75, cy + 115, 150, 18);

    // ==========================================
    // THE SECOND FACE ON STOMACH (Warhammer Warp Maw)
    // ==========================================
    const fx = cx, fy = cy + 45;
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.roundRect(fx - 48, fy - 26, 96, 68, 14);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Eyes on stomach maw
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(fx + s * 24, fy - 6, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(fx + s * 24, fy - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Incandescent Cyan-Purple Warpfire roaring from stomach maw
    const fireGrad = ctx.createLinearGradient(fx, fy + 8, fx, fy + 38);
    fireGrad.addColorStop(0, '#ffffff');
    fireGrad.addColorStop(0.3, '#38bdf8');
    fireGrad.addColorStop(0.7, '#8b5cf6');
    fireGrad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = fireGrad;
    ctx.fillRect(fx - 36, fy + 8, 72, 24);

    // Sharp fangs
    ctx.fillStyle = '#f8fafc';
    for (let t = -30; t <= 30; t += 12) {
      ctx.fillRect(fx + t, fy + 6, 6, 11);
      ctx.fillRect(fx + t, fy + 21, 6, 11);
    }

    // Heavy Muscular Arms & Brass Bracers
    for (const s of [-1, 1]) {
      const ax = cx + s * 110;
      const ay = cy + 25;
      ctx.fillStyle = aGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(ax - 28, ay - 45, 56, 110, 16);
      ctx.fill();
      ctx.stroke();

      // Brass Bracer with spikes
      ctx.fillStyle = '#d97706';
      ctx.fillRect(ax - 26, ay + 20, 52, 24);
    }

    // Giant Daemon Halberd / Trident in Right Hand
    ctx.save();
    ctx.translate(cx + 150, cy - 25);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, -145, 10, 300);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, -145, 10, 300);

    // Trident Prongs crackling with Warp Energy
    const pGrad = ctx.createLinearGradient(-35, -200, 45, -135);
    pGrad.addColorStop(0, '#38bdf8');
    pGrad.addColorStop(1, '#6366f1');
    ctx.fillStyle = pGrad;
    ctx.fillRect(-35, -150, 80, 14);
    ctx.beginPath();
    ctx.moveTo(-35, -150); ctx.lineTo(-35, -195); ctx.lineTo(-25, -150);
    ctx.moveTo(5, -150); ctx.lineTo(5, -220); ctx.lineTo(15, -150);
    ctx.moveTo(45, -150); ctx.lineTo(45, -195); ctx.lineTo(35, -150);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Primary Head & Crown of Four Chaos Horns
    const hx = cx, hy = cy - 118;
    for (const s of [-1, 1]) {
      // Outer horns
      ctx.fillStyle = linearGrad(ctx, hx, hy - 90, hx + s * 100, hy - 15, '#fbbf24', '#451a03');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(hx + s * 24, hy - 20);
      ctx.quadraticCurveTo(hx + s * 95, hy - 80, hx + s * 84, hy - 125);
      ctx.quadraticCurveTo(hx + s * 48, hy - 70, hx + s * 14, hy - 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner horns
      ctx.beginPath();
      ctx.moveTo(hx + s * 12, hy - 30);
      ctx.quadraticCurveTo(hx + s * 45, hy - 75, hx + s * 38, hy - 105);
      ctx.quadraticCurveTo(hx + s * 22, hy - 65, hx + s * 6, hy - 38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head base
    ctx.fillStyle = aGrad;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(hx - 52, hy - 50, 104, 100, 24);
    ctx.fill();
    ctx.stroke();

    // Royal Brass Chaos Diadem
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(hx - 46, hy - 46, 92, 16);
    drawImperialSkull(ctx, hx, hy - 38, 6);

    // Blazing Golden Daemon Eyes
    for (const s of [-1, 1]) {
      const ex = hx + s * 24;
      const ey = hy - 12;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 11, 7, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#020617';
      ctx.fillRect(ex - 2, ey - 7, 4, 14);
    }

    ctx.restore();
    return cropToBBox(c);
  }

  // ==========================================
  // 5. WAR-TORN BLIGHTED CEMETERY GROUND (1024x1024)
  // ==========================================
  function renderWarhammerGround() {
    const T = 1024;
    const c = document.createElement('canvas');
    c.width = T; c.height = T;
    const ctx = c.getContext('2d');

    // Scorched mud & blackstone flagstone base
    ctx.fillStyle = '#08090d';
    ctx.fillRect(0, 0, T, T);

    const sGrad = ctx.createLinearGradient(0, 0, T, T);
    sGrad.addColorStop(0, '#10141d');
    sGrad.addColorStop(0.5, '#0b0c10');
    sGrad.addColorStop(1, '#151922');
    ctx.fillStyle = sGrad;
    ctx.fillRect(0, 0, T, T);

    // Weathered Gothic Flagstones (Seamless 128px grid)
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
        const sw = step - 14;
        const sh = step - 14;

        // Dark gothic flagstone with chipped edges
        const stoneGrad = ctx.createLinearGradient(stoneX, stoneY, stoneX + sw, stoneY + sh);
        stoneGrad.addColorStop(0, '#334155');
        stoneGrad.addColorStop(0.3, '#1e293b');
        stoneGrad.addColorStop(0.7, '#0f172a');
        stoneGrad.addColorStop(1, '#020617');

        ctx.fillStyle = stoneGrad;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(stoneX + 4, stoneY + 4, sw, sh, 6);
        ctx.fill();
        ctx.stroke();

        // Chiseled Imperial Skulls or Crushed Bone Dust embedded in cobblestone
        if ((r + col) % 2 === 0) {
          drawImperialSkull(ctx, stoneX + sw * 0.5, stoneY + sh * 0.5, 7);
        }

        // Toxic Nurgle Slime / Warp Runoff
        if ((r * 5 + col * 7) % 3 === 0) {
          ctx.fillStyle = 'rgba(101, 163, 13, 0.35)';
          ctx.beginPath();
          ctx.ellipse(stoneX + sw * 0.3, stoneY + sh * 0.7, 16, 8, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Spent Bolter Shell Casings scattered in the mud
        if ((r * 3 + col * 11) % 4 === 0) {
          ctx.fillStyle = '#f59e0b';
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(stoneX + sw * 0.75, stoneY + sh * 0.3, 8, 3.5, 1);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // Atmospheric Grimdark Vignette (Soft-light blend)
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const mGrad = ctx.createRadialGradient(T / 2, T / 2, T * 0.1, T / 2, T / 2, T * 0.75);
    mGrad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    mGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mGrad;
    ctx.fillRect(0, 0, T, T);
    ctx.restore();

    return c.toDataURL('image/png');
  }

  // Execute all renders
  results['arthur'] = renderArthurWarhammer();
  results['makai_zombie'] = renderZombieWarhammer();
  results['makai_red_arremer'] = renderRedArremerWarhammer();
  results['makai_woody'] = renderWoodyWarhammer();
  results['makai_tombstone'] = renderTombstoneWarhammer();
  results['makai_dead_tree'] = renderDeadTreeWarhammer();
  results['makai_gargoyle'] = renderGargoyleWarhammer();
  results['makai_skull_urn'] = renderSkullUrnWarhammer();
  results['boss_unicorn'] = renderUnicornWarhammer();
  results['boss_arremer_king'] = renderArremerKingWarhammer();
  results['boss_astaroth'] = renderAstarothWarhammer();
  results['ground_makaimura'] = renderWarhammerGround();

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

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
console.log("All Warhammer-style Makaimura assets rendered and saved successfully!");
