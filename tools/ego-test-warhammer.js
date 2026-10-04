// E2E test script using ego-browser to verify Warhammer 40K features
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
// Usage: ego-browser nodejs < tools/ego-test-warhammer.js

const task = await taskSpace("warhammer-40k-verification");
const page = task.page("p1");

console.log("Navigating to http://127.0.0.1:8899/index.html...");
await page.goto("http://127.0.0.1:8899/index.html");
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

// Setup save: unlock characters & levels
console.log("Setting up save data (characters, levels, mode)...");
await page.evaluate(async () => {
  const { save } = await import('./js/save.js');
  save.data.dna = 99999;
  save.unlockCharacter('astartes_duck', 0);
  save.unlockCharacter('techpriest_goose', 0);
  save.unlock('td_canyon', 'defense');
  save.unlock('td_fork', 'defense');
  save.unlock('td_fortress', 'defense');
  save.unlock('td_forgeworld', 'defense');
  save.flush();

  // Re-render character select & mode select to reflect unlocks
  window.game?.ui?.buildCharacterSelect(
    (await import('./js/characters.js')).CHARACTERS,
    (await import('./js/characters.js')).CHARACTER_ORDER,
    save,
    (id) => { window.game.characterId = id; },
    (id, cost) => save.unlockCharacter(id, cost),
    'astartes_duck'
  );
});
await page.waitForTimeout(600);

// 1. Verify Characters
const charCheck = await page.evaluate(() => {
  const select = document.getElementById('character-select');
  const cards = Array.from(select ? select.children : []);
  const names = cards.map(c => c.textContent || '');
  const hasAstartes = names.some(t => t.includes('阿斯塔特') || t.includes('星際'));
  const hasTechpriest = names.some(t => t.includes('機械修會') || t.includes('賢者'));
  return { hasAstartes, hasTechpriest, count: cards.length };
});
console.log("Characters check:", charCheck);

// 2. Verify Codex Recipes
await page.evaluate(() => {
  window.game.ui.recipeBtn.click();
});
await page.waitForTimeout(800);

const recipeCheck = await page.evaluate(() => {
  const list = document.getElementById('recipe-list');
  const text = list ? list.innerText : '';
  const hasBolter = text.includes('爆彈槍');
  const hasChainsword = text.includes('鏈鋸劍');
  return { hasBolter, hasChainsword, textLength: text.length };
});
console.log("Codex recipes check:", recipeCheck);

// Screenshot recipe modal
await page.screenshot({ path: `${EGO_OUT_DIR}/ego_recipe_40k.png` });

// Close recipe modal
await page.evaluate(() => {
  document.getElementById('recipe-modal')?.classList.add('hidden');
});
await page.waitForTimeout(400);

// 3. Select Astartes Duck
await page.evaluate(() => {
  const charCards = Array.from(document.querySelectorAll('.char-card'));
  const astartesCard = charCards.find(c => c.textContent.includes('阿斯塔特') || c.textContent.includes('星際'));
  if (astartesCard) astartesCard.click();
});
await page.waitForTimeout(400);

// 4. Select Defense Mode & td_forgeworld
await page.evaluate(() => {
  const modeCards = Array.from(document.querySelectorAll('.mode-card'));
  const defenseCard = modeCards.find(c => c.textContent.includes('守塔'));
  if (defenseCard) defenseCard.click();
});
await page.waitForTimeout(600);

const levelCheck = await page.evaluate(() => {
  const levelCards = Array.from(document.querySelectorAll('.level-card'));
  const forgeCard = levelCards.find(c => c.textContent.includes('卡迪亞') || c.textContent.includes('鑄造世界'));
  if (forgeCard) forgeCard.click();
  return {
    foundForge: !!forgeCard,
    availableLevels: levelCards.map(c => c.textContent.trim().split('\n')[0])
  };
});
console.log("Level selection check:", levelCheck);
await page.waitForTimeout(600);

// Screenshot character & level select
await page.screenshot({ path: `${EGO_OUT_DIR}/ego_select_40k.png` });

// 5. Start Game
console.log("Clicking start game button...");
await page.click("loc=css:#btn-start-game");
await page.waitForTimeout(1500);

// 6. Test in-game facilities and units
const gameTest = await page.evaluate(async () => {
  const g = window.game;
  if (!g) return { error: "No window.game" };

  // Give resources
  g.gold = 10000;
  g.player.hp = g.player.maxHp = 9999;

  // Verify facility buttons exist
  const heavyBtn = document.getElementById('btn-build-heavy-bolter');
  const barracksBtn = document.getElementById('btn-build-barracks');
  const factoryBtn = document.getElementById('btn-build-manufactorum');

  // Move player near road shoulder to deploy facilities
  g.player.x = -350;
  g.player.y = -500;

  // Build facilities
  const { buildFacility } = await import('./js/systems/Facilities.js');
  buildFacility(g, 'heavy_bolter');
  g.player.x = -350;
  g.player.y = -350;
  buildFacility(g, 'barracks');
  g.player.x = -350;
  g.player.y = -200;
  buildFacility(g, 'manufactorum');

  // Trigger wave
  if (g.td) g.td.startWave(true);

  return {
    state: g.state,
    gold: g.gold,
    turretsCount: g.turrets.length,
    facilityTypes: g.turrets.map(t => t.facilityType),
    buttonsFound: {
      heavy: !!heavyBtn,
      barracks: !!barracksBtn,
      factory: !!factoryBtn,
    },
  };
});
console.log("In-game deployment:", gameTest);

// Wait 6 seconds for units to produce and enemies to advance
console.log("Waiting for military units production and movement...");
await page.waitForTimeout(6000);

const unitTest = await page.evaluate(() => {
  const g = window.game;
  return {
    alliedCount: g.alliedUnits ? g.alliedUnits.length : 0,
    alliedTypes: g.alliedUnits ? g.alliedUnits.map(u => u.type) : [],
    enemiesCount: g.enemies ? g.enemies.length : 0,
    enemyTypes: g.enemies ? g.enemies.slice(0, 10).map(e => e.type) : [],
    playerWeapon: g.player.weapons ? g.player.weapons.map(w => w.id) : [],
  };
});
console.log("Military units & enemy state:", unitTest);

// Capture in-game screenshot
await page.screenshot({ path: `${EGO_OUT_DIR}/ego_ingame_40k.png` });

console.log("All verifications completed cleanly.");
await task.finish({ keep: "all" });
