const task = await taskSpace("ingame-sprite-verify-" + Date.now());
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const page = task.page("p1");

console.log("Navigating...");
await page.goto("http://127.0.0.1:8899/index.html");
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

// Unlock character & select
await page.evaluate(async () => {
  const { save } = await import('./js/save.js');
  save.unlockCharacter('astartes_duck', 0);
  save.unlock('canyon', 'defense');
  save.flush();

  const charCards = Array.from(document.querySelectorAll('.char-card'));
  const c = charCards.find(card => card.textContent.includes('阿斯塔特') || card.textContent.includes('星際'));
  if (c) c.click();
});
await page.waitForTimeout(500);

console.log("Starting game...");
await page.click("loc=css:#btn-start-game");
await page.waitForTimeout(2000);

const canvasData = await page.evaluate(() => {
  const canvas = document.getElementById('gameCanvas');
  return canvas ? canvas.toDataURL('image/png') : null;
});

if (canvasData) {
  const fs = await import('fs');
  const base64Data = canvasData.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(`${EGO_OUT_DIR}/ingame_astartes_sprite.png`, base64Data, 'base64');
  console.log("In-game canvas saved to ingame_astartes_sprite.png");
} else {
  console.log("No canvas found!");
}

await task.finish({ keep: "all" });
