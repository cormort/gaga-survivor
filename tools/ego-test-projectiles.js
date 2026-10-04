// Test script using ego-browser to verify flying projectiles
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const task = await taskSpace("verify-projectiles-" + Date.now());
const page = task.page("p1");

console.log("Navigating to http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  // Clear SW and caches so fresh Projectile.js is loaded
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);

  const t = Date.now();
  const { weaponImagesReady, weaponImages } = await import('./js/weapons/WeaponArt.js?t=' + t);
  await weaponImagesReady;
  const { Projectile } = await import('./js/entities/Projectile.js?t=' + t);

  const types = [
    { type: 'kunai', evo: false, title: 'Kunai (Banana Sprite)' },
    { type: 'kunai', evo: true, title: 'Ghost Shuriken (Banana Sprite)' },
    { type: 'rocket', evo: false, title: 'Rocket (Hazard & Flame)' },
    { type: 'rocket', evo: true, title: 'Shark Torpedo (Cyber Shark)' },
    { type: 'guardian', evo: false, title: 'Guardian Drone (Disc)' },
    { type: 'guardian', evo: true, title: 'Eternal Domain (Sun Disc)' },
    { type: 'saw', evo: false, title: 'Orbit Saw (Industrial Saw)' },
    { type: 'saw', evo: true, title: 'Singularity Ring (Vortex)' },
    { type: 'drill', evo: false, title: 'Drill (Titanium Spiral)' },
    { type: 'soccer', evo: false, title: 'Cyber Soccer (Dynamo)' },
    { type: 'soccer', evo: true, title: 'Quantum Sphere (Matrix)' },
    { type: 'boomerang', evo: false, title: 'Boomerang (Golden Wing)' },
    { type: 'boomerang', evo: true, title: 'Twin Storm (Vortex Wings)' },
    { type: 'bottle', evo: false, title: 'Molotov (Cocktail Bottle)' },
    { type: 'bottle', evo: true, title: 'Napalm Sea (Fuel Projectile)' },
  ];

  const cols = 5;
  const rows = Math.ceil(types.length / cols);
  const cellW = 180;
  const cellH = 140;

  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let idx = 0; idx < types.length; idx++) {
    const item = types[idx];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = col * cellW + cellW / 2;
    const cy = row * cellH + cellH / 2 - 10;

    ctx.strokeStyle = '#182030';
    ctx.strokeRect(col * cellW + 4, row * cellH + 4, cellW - 8, cellH - 8);

    // Mock projectile instance
    const p = new Projectile({
      x: cx,
      y: cy,
      vx: 300,
      vy: 0,
      radius: 14,
      damage: 50,
      duration: 5,
      type: item.type,
      isEvo: item.evo,
    });
    p.orbitAngle = 0.5;
    p.spin = 0.8;
    p.age = 0.3;
    p.flight = 0.6;
    p.toX = cx + 30;
    p.toY = cy + 20;

    // Draw projectile centered at (cx, cy)
    p.draw(ctx, { x: 0, y: 0 });

    ctx.fillStyle = item.evo ? '#ffd166' : '#4cc9f0';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.title, cx, row * cellH + cellH - 12);
  }

  return canvas.toDataURL('image/png');
});

const base64Data = result.replace(/^data:image\/png;base64,/, "");
const fs = await import('fs');
fs.writeFileSync(`${EGO_OUT_DIR}/projectiles_banana_showcase.png`, Buffer.from(base64Data, 'base64'));

await task.finish({ keep: "all" });
