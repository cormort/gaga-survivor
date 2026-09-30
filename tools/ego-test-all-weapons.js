// Test script using ego-browser to verify all 29 weapon sprites in game
const task = await taskSpace("verify-all-banana-weapons-" + Date.now());
const page = task.page("p1");

console.log("Navigating to http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

// Evaluate inside page: render all 29 weapons held by Duck on a test canvas
const result = await page.evaluate(async () => {
  const { WEAPON_ART, drawHeldWeapon, weaponImages, weaponImagesReady } = await import('./js/weapons/WeaponArt.js');
  const { getSprite, blit, imageSpritesReady } = await import('./js/sprites.js');
  
  await Promise.all([weaponImagesReady, imageSpritesReady]);
  
  const duckSprite = getSprite('duck');
  const weaponIds = Object.keys(WEAPON_ART);
  const loadedCount = weaponIds.filter(id => weaponImages.has(id)).length;
  
  const cols = 6;
  const rows = Math.ceil(weaponIds.length / cols);
  const cellW = 140;
  const cellH = 120;
  
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#10141d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  for (let idx = 0; idx < weaponIds.length; idx++) {
    const id = weaponIds[idx];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = col * cellW + cellW / 2;
    const cy = row * cellH + cellH / 2 - 10;
    
    // Draw character duck
    if (duckSprite) {
      blit(ctx, duckSprite, 0, cx, cy);
    }
    
    // Draw held weapon
    drawHeldWeapon(ctx, id, {
      x: cx,
      y: cy,
      facing: 1,
      aim: 0,
      mount: { dx: 18, dy: 0, aim: true, layer: 'front' },
      time: 0.5,
      level: 3
    });
    
    // Label
    const isPng = weaponImages.has(id);
    ctx.fillStyle = isPng ? '#4cc9f0' : '#ffb703';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${id}`, cx, cy + 38);
    ctx.fillStyle = isPng ? '#00f59b' : '#ffb703';
    ctx.font = '10px sans-serif';
    ctx.fillText(isPng ? '✓ PNG Asset' : '⚡ Canvas Fallback', cx, cy + 52);
  }
  
  return {
    total: weaponIds.length,
    loadedCount,
    weaponIds,
    dataUrl: canvas.toDataURL('image/png')
  };
});

console.log(`Loaded ${result.loadedCount}/${result.total} weapon PNG assets.`);

// Save composite image
const base64Data = result.dataUrl.replace(/^data:image\/png;base64,/, "");
const fs = await import('fs');
fs.writeFileSync('/Users/hsiehminchieh/.gemini/antigravity-ide/brain/406adb68-8e4f-4295-9c5e-16fbb7daccac/all_weapons_ingame_preview.png', Buffer.from(base64Data, 'base64'));

await task.finish({ keep: "all" });
