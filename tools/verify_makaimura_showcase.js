// tools/verify_makaimura_showcase.js
// Renders and verifies all Makaimura sprites, terrain, ground, in-game scene, and cutscenes using ego-browser.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const task = await taskSpace("verify-makaimura-showcase-" + Date.now());
const page = task.page("p1");

console.log("Navigating to dev server...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");

const showcaseData = await page.evaluate(async () => {
  const ts = Date.now();
  const { CHARACTERS, CHARACTER_ORDER } = await import(`./js/characters.js?t=${ts}`);
  const { LEVELS, LEVEL_ORDER } = await import(`./js/levels.js?t=${ts}`);
  const { getSprite, blit, imageSpritesReady } = await import(`./js/sprites.js?t=${ts}`);
  const { GroundRenderer } = await import(`./js/systems/Ground.js?t=${ts}`);

  await imageSpritesReady;

  const W = 1200;
  const H = 900;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Dark retro background
  ctx.fillStyle = '#080511';
  ctx.fillRect(0, 0, W, H);

  // Title Banner
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('魔界村 (Makaimura) 戰鎚40K Grimdark 哥德風 — 審判聖騎士・混沌異形・三大惡魔・神聖靈廟', W / 2, 40);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText('Gaga Survivor x Makaimura — Warhammer 40K Grimdark Gothic Full Asset Redraw Verification', W / 2, 68);

  // 1. Arthur Walking Sequence (Top Left)
  ctx.fillStyle = '#1e1b4b';
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 90, 540, 160);
  ctx.fillRect(40, 90, 540, 160);

  ctx.fillStyle = '#e0e7ff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('魔界騎士 亞瑟 (Knight Arthur) 8幀踏步動作 & 草莓四角褲彩蛋', 55, 118);

  const arthurSpr = getSprite('arthur');
  if (arthurSpr && arthurSpr.frames) {
    for (let f = 0; f < 8; f++) {
      const fx = 75 + f * 62;
      const fy = 195;
      blit(ctx, arthurSpr, f, fx, fy);
    }
  }

  // 2. Stage Mobs & Decor (Top Right)
  ctx.fillStyle = '#18181b';
  ctx.strokeStyle = '#a1a1aa';
  ctx.strokeRect(620, 90, 540, 160);
  ctx.fillRect(620, 90, 540, 160);

  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('關卡魔物 (殭屍 / 紅魔鬼 / 飛天小鬼) & 墓園裝飾物', 635, 118);

  const mobs = [
    { key: 'makai_zombie', label: '殭屍' },
    { key: 'makai_red_arremer', label: '紅魔鬼' },
    { key: 'makai_woody', label: '飛天小鬼' },
    { key: 'makai_tombstone', label: '十字墓碑' },
    { key: 'makai_dead_tree', label: '扭曲枯樹' },
    { key: 'makai_gargoyle', label: '石像鬼' },
    { key: 'makai_skull_urn', label: '幽冥火盆' },
  ];

  for (let i = 0; i < mobs.length; i++) {
    const item = mobs[i];
    const sp = getSprite(item.key);
    const mx = 655 + i * 72;
    const my = 195;
    if (sp) {
      blit(ctx, sp, 0, mx, my);
    }
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.label, mx, 235);
  }

  // 3. Stage Bosses (Middle Row)
  ctx.fillStyle = '#1e1124';
  ctx.strokeStyle = '#c026d3';
  ctx.strokeRect(40, 275, 1120, 240);
  ctx.fillRect(40, 275, 1120, 240);

  ctx.fillStyle = '#fae8ff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('魔界村三大首領 (Bosses) — 一角魔將‧獨角巨靈 / 猩紅魔王‧阿雷默 / 雙面魔王‧阿斯塔羅特', 55, 305);

  const bosses = [
    { key: 'boss_unicorn', name: '一角魔將‧獨角巨靈', code: 'CHAOS HELLBRUTE // 2:00 首領', cx: 220 },
    { key: 'boss_arremer_king', name: '猩紅魔王‧阿雷默', code: 'BLOODTHIRSTER // 4:00 首領', cx: 600 },
    { key: 'boss_astaroth', name: '雙面魔王‧阿斯塔羅特', code: 'WARP DAEMON LORD // 6:00 關底魔王', cx: 980 },
  ];

  for (const b of bosses) {
    const sp = getSprite(b.key);
    if (sp) {
      blit(ctx, sp, 0, b.cx, 400);
    }
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.cx, 480);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(b.code, b.cx, 498);
  }

  // 4. In-Game Ground & Scene Simulation (Bottom Row)
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#38bdf8';
  ctx.strokeRect(40, 535, 1120, 335);
  ctx.fillRect(40, 535, 1120, 335);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('墓園實戰場景模擬：1024×1024 無接縫地表貼圖 + 戰場障礙物 + 亞瑟與魔王對峙', 55, 565);

  // Render ground inside simulated in-game viewport
  const viewX = 55, viewY = 585, viewW = 1090, viewH = 265;
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewX, viewY, viewW, viewH);
  ctx.clip();

  // Load ground image directly
  const groundImg = new Image();
  groundImg.src = 'assets/ground/ground_makaimura.png?t=' + ts;
  await new Promise(r => {
    groundImg.onload = r;
    groundImg.onerror = r;
  });

  if (groundImg.naturalWidth > 0) {
    const tileW = 512;
    for (let gy = viewY; gy < viewY + viewH + tileW; gy += tileW) {
      for (let gx = viewX; gx < viewX + viewW + tileW; gx += tileW) {
        ctx.drawImage(groundImg, gx, gy, tileW, tileW);
      }
    }
  }

  // Draw tactical grid
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.15)';
  ctx.lineWidth = 1;
  for (let x = viewX; x < viewX + viewW; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, viewY); ctx.lineTo(x, viewY + viewH); ctx.stroke();
  }
  for (let y = viewY; y < viewY + viewH; y += 64) {
    ctx.beginPath(); ctx.moveTo(viewX, y); ctx.lineTo(viewX + viewW, y); ctx.stroke();
  }

  // Place decor
  const decorTomb = getSprite('makai_tombstone');
  const decorTree = getSprite('makai_dead_tree');
  const decorGarg = getSprite('makai_gargoyle');
  const decorUrn = getSprite('makai_skull_urn');

  if (decorTree) blit(ctx, decorTree, 0, viewX + 100, viewY + 140);
  if (decorTomb) blit(ctx, decorTomb, 0, viewX + 220, viewY + 200);
  if (decorTomb) blit(ctx, decorTomb, 0, viewX + 320, viewY + 110);
  if (decorGarg) blit(ctx, decorGarg, 0, viewX + 850, viewY + 120);
  if (decorUrn) blit(ctx, decorUrn, 0, viewX + 750, viewY + 210);
  if (decorTree) blit(ctx, decorTree, 0, viewX + 1000, viewY + 150);

  // Place mobs swarm
  const zombSpr = getSprite('makai_zombie');
  const arremerSpr = getSprite('makai_red_arremer');
  const woodySpr = getSprite('makai_woody');

  if (zombSpr) {
    blit(ctx, zombSpr, 2, viewX + 400, viewY + 180);
    blit(ctx, zombSpr, 5, viewX + 430, viewY + 220);
  }
  if (arremerSpr) {
    blit(ctx, arremerSpr, 3, viewX + 540, viewY + 110);
  }
  if (woodySpr) {
    blit(ctx, woodySpr, 1, viewX + 590, viewY + 210);
  }

  // Place Arthur hero
  if (arthurSpr) {
    blit(ctx, arthurSpr, 4, viewX + 480, viewY + 175);
  }

  // Place Boss Astaroth descending
  const astarothSpr = getSprite('boss_astaroth');
  if (astarothSpr) {
    blit(ctx, astarothSpr, 2, viewX + 680, viewY + 160);
  }

  // HUD crosshair
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(viewX + 480 - 24, viewY + 175 - 24, 48, 48);

  ctx.restore();

  return canvas.toDataURL('image/png');
});

const outPath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'tools', 'makaimura_showcase_verification.png');
const base64Data = showcaseData.replace(/^data:image\/png;base64,/, "");
fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
console.log("Showcase verification image saved to:", outPath);

await task.finish({ keep: "all" });
console.log("Done!");
