// Test actual in-game gameplay with PNG ground backgrounds & character action
const task = await taskSpace("ground-ingame-action-" + Date.now());
const page = task.page("p1");

console.log("Navigating to dev server...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

const testResult = await page.evaluate(async () => {
  const ts = Date.now();
  const { GroundRenderer } = await import(`./js/systems/Ground.js?t=${ts}`);
  const { LEVELS } = await import(`./js/levels.js?t=${ts}`);
  const { getSprite, blit, imageSpritesReady } = await import(`./js/sprites.js?t=${ts}`);
  const { drawHeldWeapon, weaponImagesReady } = await import(`./js/weapons/WeaponArt.js?t=${ts}`);

  await Promise.all([imageSpritesReady, weaponImagesReady]);

  const gr = new GroundRenderer();

  // Wait for PNGs
  const maxWait = 4000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    let allReady = true;
    for (const [id, loaded] of gr._pngLoaded.entries()) {
      if (!loaded) { allReady = false; break; }
    }
    if (gr._pngLoaded.size >= 12 && allReady) break;
    await new Promise(r => setTimeout(r, 100));
  }

  // Showcase 3 dramatic in-game battle scenes:
  // 1) Street: Astartes Duck with Chainsword & Bolter slashing through night street
  // 2) Core: Duck with Dragon Breath erupting over molten lava basalt
  // 3) Inkmount: Xian Swordsman with Flying Swords over Shan-Shui paper
  const scenes = [
    { lvlId: 'street', char: 'astartes_duck', weapon: 'chainsword', title: 'Street: Astartes Chainsword Slash' },
    { lvlId: 'core', char: 'duck', weapon: 'dragon_breath', title: 'Core: Molten Basalt & Dragon Breath' },
    { lvlId: 'inkmount', char: 'wuxia_lin', weapon: 'kunai', title: 'Inkmount: Xuan Paper & Spirit Blade' }
  ];

  const viewW = 400;
  const viewH = 300;
  const canvas = document.createElement('canvas');
  canvas.width = scenes.length * viewW;
  canvas.height = viewH;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const lvl = LEVELS[sc.lvlId];
    const ox = i * viewW;

    const sub = document.createElement('canvas');
    sub.width = viewW;
    sub.height = viewH;
    const sctx = sub.getContext('2d');

    const camera = { x: 350 + i * 100, y: 250 };
    gr.drawFloorGrid(sctx, lvl, camera, viewW, viewH, 18.5 + i * 2);
    gr.drawColorGrade(sctx, viewW, viewH, lvl);
    gr.drawVignette(sctx, viewW, viewH, lvl);

    // Render character in action
    const cx = viewW / 2;
    const cy = viewH / 2;
    const spr = getSprite(sc.char) || getSprite('duck');
    if (spr) {
      blit(sctx, spr, 0, cx, cy);
    }
    drawHeldWeapon(sctx, sc.weapon, {
      x: cx,
      y: cy,
      recoil: 0.9,
      muzzleProgress: 0.95,
      time: 12.0
    });

    // Blit to main
    ctx.drawImage(sub, ox, 0);

    // Title banner
    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 20, 0.82)';
    ctx.fillRect(ox + 10, 10, viewW - 20, 30);
    ctx.strokeStyle = 'rgba(120, 210, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 10, 10, viewW - 20, 30);
    ctx.fillStyle = '#f0f6fc';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(sc.title, ox + 18, 30);
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
});

const fs = await import('node:fs');
const base64Data = testResult.replace(/^data:image\/png;base64,/, "");
const artifactPath = "/Users/hsiehminchieh/.gemini/antigravity-ide/brain/406adb68-8e4f-4295-9c5e-16fbb7daccac/ground_ingame_action.png";
fs.writeFileSync(artifactPath, Buffer.from(base64Data, 'base64'));
console.log("Saved ingame action showcase to", artifactPath);

await task.finish({ keep: "all" });
