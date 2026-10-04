// Test script using ego-browser to verify unified character sprites
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const task = await taskSpace("unified-sprites-" + Date.now());
const page = task.page("p1");

console.log("Navigating to http://127.0.0.1:8899/index.html...");
await page.goto("http://127.0.0.1:8899/index.html");
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

// Setup save: unlock all characters so all cards are visible
await page.evaluate(async () => {
  const { save } = await import('./js/save.js');
  const { CHARACTERS, CHARACTER_ORDER } = await import('./js/characters.js');
  for (const id of CHARACTER_ORDER) {
    save.unlockCharacter(id, 0);
  }
  save.flush();

  // Re-build character select
  window.game?.ui?.buildCharacterSelect(
    CHARACTERS,
    CHARACTER_ORDER,
    save,
    (id) => { if (window.game) window.game.characterId = id; },
    (id, cost) => save.unlockCharacter(id, cost),
    'duck'
  );
});

await page.waitForTimeout(1000);

// Check rendered portraits
const report = await page.evaluate(async () => {
  const { imageSpritesReady } = await import('./js/sprites.js');
  await imageSpritesReady;

  const cards = Array.from(document.querySelectorAll('.char-card'));
  const results = [];
  for (const card of cards) {
    const name = card.querySelector('.char-name')?.textContent?.trim() || '';
    const role = card.querySelector('.char-role')?.textContent?.trim() || '';
    const canvas = card.querySelector('.char-portrait');
    let hasPixels = false;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < imgData.length; i += 4) {
        if (imgData[i] > 10) {
          hasPixels = true;
          break;
        }
      }
    }
    results.push({ name, role, hasCanvas: !!canvas, hasPixels });
  }
  return results;
});

// Export composite canvas of all 13 character portraits
const compositeDataUrl = await page.evaluate(async () => {
  const cards = Array.from(document.querySelectorAll('.char-card'));
  const comp = document.createElement('canvas');
  comp.width = 13 * 130;
  comp.height = 140;
  const cctx = comp.getContext('2d');
  cctx.fillStyle = '#1a1d24';
  cctx.fillRect(0, 0, comp.width, comp.height);

  cards.forEach((card, idx) => {
    const canvas = card.querySelector('.char-portrait');
    if (canvas) {
      cctx.drawImage(canvas, idx * 130, 10);
    }
  });
  return comp.toDataURL('image/png');
});

if (compositeDataUrl) {
  const fs = await import('fs');
  const base64Data = compositeDataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(`${EGO_OUT_DIR}/character_sprites_grid.png`, base64Data, 'base64');
  console.log("Composite character sprites grid saved to character_sprites_grid.png");
}

await task.finish({ keep: "all" });
