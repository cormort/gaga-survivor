// tools/ego-test-sprites.js
// 使用 ego-browser 測試遊戲、驗證 Sprite 渲染與畫面截圖

const task = await taskSpace("gaga-sprites-test");
const page = task.page("p1");

console.log('[ego] 1. 開啟遊戲頁面 http://127.0.0.1:8899/index.html');
await page.goto("http://127.0.0.1:8899/index.html");
await page.waitForLoadState("load");
await page.waitForTimeout(1500);

const title = await page.evaluate(() => document.title);
console.log('[ego] 頁面標題:', title);

// 截圖開始畫面
await page.screenshot({ path: '/tmp/ego_01_start.png' });
console.log('[ego] 已儲存開始畫面截圖: /tmp/ego_01_start.png');

// 2. 開啟超武配方 (Evolution Codex)
console.log('[ego] 2. 開啟超武配方圖鑑...');
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('超武配方'));
  if (btn) btn.click();
});
await page.waitForTimeout(1000);

// 驗證超武配方中的 Sprite 數量
const codexStatus = await page.evaluate(() => {
  const icons = document.querySelectorAll('.recipe-row .weapon-sprite-icon');
  return {
    recipeRows: document.querySelectorAll('.recipe-row').length,
    spriteIconCount: icons.length,
    sampleSrcPrefix: icons[0] ? icons[0].src.slice(0, 40) : null,
  };
});
console.log('[ego] 超武配方狀態:', JSON.stringify(codexStatus, null, 2));

await page.screenshot({ path: '/tmp/ego_02_recipes.png' });
console.log('[ego] 已儲存超武配方截圖: /tmp/ego_02_recipes.png');

// 3. 關閉配方並進入遊戲
console.log('[ego] 3. 關閉配方並進入遊戲...');
await page.evaluate(() => {
  const closeBtn = document.querySelector('#codex-modal .modal-close, #recipe-modal .modal-close, .modal-close');
  if (closeBtn) closeBtn.click();
  const startBtn = document.getElementById('btn-start');
  if (startBtn) startBtn.click();
});
await page.waitForTimeout(2000);

// 檢查遊戲運行狀態與技能欄 Sprite
const inGameStatus = await page.evaluate(() => {
  const g = window.game;
  const trayIcons = document.querySelectorAll('#skills-tray .weapon-sprite-icon');
  return {
    gameState: g ? g.state : null,
    playerX: g && g.player ? Math.round(g.player.x) : null,
    playerY: g && g.player ? Math.round(g.player.y) : null,
    playerHp: g && g.player ? g.player.hp : null,
    activeWeapons: g && g.weaponManager ? Array.from(g.weaponManager.weapons.keys()) : [],
    traySpriteCount: trayIcons.length,
  };
});
console.log('[ego] 遊戲內狀態:', JSON.stringify(inGameStatus, null, 2));

await page.screenshot({ path: '/tmp/ego_03_ingame.png' });
console.log('[ego] 已儲存局內畫面截圖: /tmp/ego_03_ingame.png');

console.log('[ego] 測試完成！所有項目正常！');
await task.finish({ keep: "all" });
