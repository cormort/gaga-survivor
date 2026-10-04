const task = await taskSpace("enemy-terrain-verify-" + Date.now());
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const page = task.page("p1");

console.log("Navigating to game...");
await page.goto("http://127.0.0.1:8899/index.html");
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

// Start game in Level 1 (street) or Level 11 (xian)
await page.evaluate(async () => {
  const { save } = await import('./js/save.js');
  save.unlock('xian', 'survival');
  save.flush();
  window.game.levelId = 'xian';
  window.game.characterId = 'duck';
});

console.log("Starting game in Xian level...");
await page.click("loc=css:#btn-start-game");
await page.waitForTimeout(3000);

// Capture in-game canvas
const canvasData = await page.evaluate(() => {
  const canvas = document.getElementById('gameCanvas');
  return canvas ? canvas.toDataURL('image/png') : null;
});

if (canvasData) {
  const fs = await import('fs');
  const base64Data = canvasData.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(`${EGO_OUT_DIR}/ingame_enemies_terrain.png`, base64Data, 'base64');
  console.log("In-game screenshot saved to ingame_enemies_terrain.png");
}

await task.finish({ keep: "all" });
