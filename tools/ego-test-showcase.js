// Test script using ego-browser to verify multiple characters holding Banana weapons
const task = await taskSpace("verify-characters-banana-weapons-" + Date.now());
const page = task.page("p1");

await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

const result = await page.evaluate(async () => {
  const { WEAPON_ART, drawHeldWeapon, weaponImages, weaponImagesReady } = await import('./js/weapons/WeaponArt.js');
  const { getSprite, blit, imageSpritesReady } = await import('./js/sprites.js');
  
  await Promise.all([weaponImagesReady, imageSpritesReady]);
  
  const showcases = [
    { char: 'astartes_duck', weapon: 'bolter', name: 'Astartes Duck (Bolter)' },
    { char: 'astartes_duck', weapon: 'chainsword', name: 'Astartes Duck (Chainsword)' },
    { char: 'astartes_duck', weapon: 'storm_bolter', name: 'Astartes Duck (Storm Bolter)' },
    { char: 'astartes_duck', weapon: 'power_sword', name: 'Astartes Duck (Power Sword)' },
    { char: 'duck', weapon: 'shotgun', name: 'Agent Duck (Shotgun)' },
    { char: 'duck', weapon: 'dragon_breath', name: 'Agent Duck (Dragon Breath)' },
    { char: 'duck', weapon: 'railgun', name: 'Agent Duck (Railgun)' },
    { char: 'duck', weapon: 'annihilation_beam', name: 'Agent Duck (Annihilation Beam)' },
    { char: 'xian_sword', weapon: 'phase_blade', name: 'Xian Sword (Phase Blade)' },
    { char: 'xian_demon', weapon: 'ghost_shuriken', name: 'Xian Demon (Ghost Shuriken)' },
    { char: 'cat', weapon: 'soccer', name: 'Cat Ninja (Cyber Soccer)' },
    { char: 'penguin', weapon: 'absolute_zero', name: 'Penguin (Absolute Zero)' },
  ];
  
  const cols = 4;
  const rows = Math.ceil(showcases.length / cols);
  const cellW = 180;
  const cellH = 140;
  
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#10141d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  for (let idx = 0; idx < showcases.length; idx++) {
    const item = showcases[idx];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = col * cellW + cellW / 2;
    const cy = row * cellH + cellH / 2 - 10;
    
    // Draw character sprite
    const spr = getSprite(item.char);
    if (spr) {
      blit(ctx, spr, 0, cx, cy);
    }
    
    // Draw held weapon
    drawHeldWeapon(ctx, item.weapon, {
      x: cx,
      y: cy,
      facing: 1,
      aim: 0,
      mount: { dx: 18, dy: 0, aim: true, layer: 'front' },
      time: 0.5,
      level: 4
    });
    
    ctx.fillStyle = '#f1fa8c';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, cx, cy + 45);
    ctx.fillStyle = '#00f59b';
    ctx.font = '10px sans-serif';
    ctx.fillText('✓ Banana Sprite', cx, cy + 60);
  }
  
  return canvas.toDataURL('image/png');
});

const base64Data = result.replace(/^data:image\/png;base64,/, "");
const fs = await import('fs');
fs.writeFileSync('/Users/hsiehminchieh/.gemini/antigravity-ide/brain/406adb68-8e4f-4295-9c5e-16fbb7daccac/characters_banana_showcase.png', Buffer.from(base64Data, 'base64'));

await task.finish({ keep: "all" });
