// Test script using ego-browser to verify weapon attack animations & FX
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const task = await taskSpace("verify-attack-animations-" + Date.now());
const page = task.page("p1");

console.log("Navigating to http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

const result = await page.evaluate(async () => {
  const { WEAPON_ART, drawHeldWeapon, weaponImages, weaponImagesReady } = await import('./js/weapons/WeaponArt.js');
  const { getSprite, blit, imageSpritesReady } = await import('./js/sprites.js');
  
  await Promise.all([weaponImagesReady, imageSpritesReady]);
  
  const attacks = [
    { char: 'astartes_duck', weapon: 'chainsword', title: 'Chainsword (Hazard Slash & Sparks)', recoil: 0.85, muzzle: 0.9, time: 1.2 },
    { char: 'astartes_duck', weapon: 'power_sword', title: 'Power Sword (Disruption Crescent)', recoil: 0.8, muzzle: 0.95, time: 1.2 },
    { char: 'duck', weapon: 'kunai', title: 'Kunai (Thrust & Sonic Stream)', recoil: 0.7, muzzle: 0.8, time: 1.2 },
    { char: 'duck', weapon: 'railgun', title: 'Railgun (EM Shockwave Rings)', recoil: 0.95, muzzle: 1.0, time: 1.2 },
    { char: 'duck', weapon: 'dragon_breath', title: 'Dragon Breath (Flame Cone Blast)', recoil: 0.9, muzzle: 0.95, time: 1.2 },
    { char: 'duck', weapon: 'frost_nova', title: 'Frost Nova (Hexagonal Ice Crystal)', recoil: 0.75, muzzle: 0.9, time: 1.2 },
    { char: 'astartes_duck', weapon: 'bolter', title: 'Bolter (Explosive Flash & Jets)', recoil: 0.85, muzzle: 0.95, time: 1.2 },
    { char: 'duck', weapon: 'orbit_saw', title: 'Orbit Saw (High-speed Sparks)', recoil: 0.8, muzzle: 0.85, time: 1.2 },
    { char: 'duck', weapon: 'lightning', title: 'Lightning (Forked Electro Burst)', recoil: 0.75, muzzle: 0.95, time: 1.2 },
  ];
  
  const cols = 3;
  const rows = Math.ceil(attacks.length / cols);
  const cellW = 240;
  const cellH = 150;
  
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#0e1219';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  for (let idx = 0; idx < attacks.length; idx++) {
    const item = attacks[idx];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = col * cellW + 70;
    const cy = row * cellH + cellH / 2 - 5;
    
    // Grid border
    ctx.strokeStyle = '#1e2638';
    ctx.strokeRect(col * cellW + 4, row * cellH + 4, cellW - 8, cellH - 8);
    
    // Draw character
    const spr = getSprite(item.char);
    if (spr) {
      blit(ctx, spr, 0, cx, cy);
    }
    
    // Draw held weapon attacking
    drawHeldWeapon(ctx, item.weapon, {
      x: cx,
      y: cy,
      facing: 1,
      aim: 0,
      mount: { dx: 18, dy: 0, aim: true, layer: 'front' },
      recoil: item.recoil,
      muzzle: item.muzzle,
      time: item.time,
      level: 4
    });
    
    // Label
    ctx.fillStyle = '#4cc9f0';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.title, col * cellW + 16, row * cellH + 26);
    ctx.fillStyle = '#8ea1b8';
    ctx.font = '10px monospace';
    ctx.fillText(`recoil: ${item.recoil} | muzzle: ${item.muzzle}`, col * cellW + 16, row * cellH + cellH - 12);
  }
  
  return canvas.toDataURL('image/png');
});

const base64Data = result.replace(/^data:image\/png;base64,/, "");
const fs = await import('fs');
fs.writeFileSync(`${EGO_OUT_DIR}/attack_animations_showcase.png`, Buffer.from(base64Data, 'base64'));

await task.finish({ keep: "all" });
