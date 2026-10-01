// tools/verify_makaimura_gameplay.js
// Automated verification of Makaimura stage, Arthur character, enemies, bosses, and ground using ego-browser.

import fs from 'fs';

const task = await taskSpace("verify-makaimura-gameplay");
const page = task.page("p1");

console.log("Navigating to Gaga Survivor at http://127.0.0.1:8899/index.html ...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(1200);

// 1. Verify Modules & Registries
const registryStatus = await page.evaluate(async () => {
  const ts = Date.now();
  const { CHARACTERS, CHARACTER_ORDER } = await import(`./js/characters.js?t=${ts}`);
  const { LEVELS, LEVEL_ORDER } = await import(`./js/levels.js?t=${ts}`);
  const { getSprite, imageSpritesReady } = await import(`./js/sprites.js?t=${ts}`);
  const { GroundRenderer } = await import(`./js/systems/Ground.js?t=${ts}`);

  await imageSpritesReady;

  const arthur = CHARACTERS.arthur;
  const makaimura = LEVELS.makaimura;

  const spriteKeys = [
    'arthur', 'makai_zombie', 'makai_red_arremer', 'makai_woody',
    'makai_tombstone', 'makai_dead_tree', 'makai_gargoyle', 'makai_skull_urn',
    'boss_unicorn', 'boss_arremer_king', 'boss_astaroth'
  ];

  const spriteReport = {};
  for (const k of spriteKeys) {
    const sp = getSprite(k);
    spriteReport[k] = {
      found: !!sp,
      frames: sp && sp.frames ? sp.frames.length : 0,
      w: sp ? sp.w : 0,
      h: sp ? sp.h : 0,
    };
  }

  // Check Ground PNG
  const gr = new GroundRenderer();
  const grTex = gr.getGroundTexture(makaimura);

  return {
    arthurInOrder: CHARACTER_ORDER.includes('arthur'),
    arthurDefined: !!arthur,
    arthurTrait: arthur ? arthur.traitName : null,
    makaimuraInOrder: LEVEL_ORDER.includes('makaimura'),
    makaimuraDefined: !!makaimura,
    makaimuraTheme: makaimura ? makaimura.theme.id : null,
    makaimuraBossesCount: makaimura && makaimura.bosses ? makaimura.bosses.length : 0,
    sprites: spriteReport,
    groundReady: !!(grTex && grTex.width === 1024),
  };
});

console.log("Registry Status Report:", JSON.stringify(registryStatus, null, 2));

// 2. Select Arthur and Makaimura Level, then Launch Game
const launchSuccess = await page.evaluate(async () => {
  if (!window.game) return false;

  // Unlock and select Arthur
  window.game.save.data.unlockedChars = window.game.save.data.unlockedChars || [];
  if (!window.game.save.data.unlockedChars.includes('arthur')) {
    window.game.save.data.unlockedChars.push('arthur');
  }
  window.game.selectedChar = 'arthur';

  // Select Makaimura stage
  window.game.selectedLevel = 'makaimura';

  // Start game session
  window.game.start();
  return true;
});

console.log("Game started with Arthur in Makaimura:", launchSuccess);
await page.waitForTimeout(1500);

// Capture In-Game Screenshot 1: Walking in Makaimura Graveyard
const sc1Path = '/tmp/makaimura_gameplay.png';
await page.screenshot({ path: sc1Path });
console.log("Captured in-game screenshot at", sc1Path);

// 3. Spawn Makaimura Boss and Trigger Boss Intro Cutscene
console.log("Triggering boss cutscene for 一角魔將‧獨角巨靈 (boss_unicorn)...");
const cutsceneTriggered = await page.evaluate(() => {
  if (!window.game) return false;
  // Trigger cutscene directly via game.bossCutscene
  const bossObj = {
    name: '一角魔將‧獨角巨靈',
    skin: 'boss_unicorn',
    hp: 45000,
    maxHp: 45000,
    x: window.game.player.x + 80,
    y: window.game.player.y,
  };
  window.game.bossCutscene.trigger(bossObj);
  return window.game.bossCutscene.active;
});

console.log("Cutscene active:", cutsceneTriggered);
await page.waitForTimeout(1200);

// Capture Boss Cutscene Screenshot
const sc2Path = '/tmp/makaimura_boss_cutscene.png';
await page.screenshot({ path: sc2Path });
console.log("Captured boss cutscene screenshot at", sc2Path);

await page.waitForTimeout(2000);

// Capture Boss Battle in gameplay
const sc3Path = '/tmp/makaimura_boss_battle.png';
await page.screenshot({ path: sc3Path });
console.log("Captured boss battle screenshot at", sc3Path);

await task.finish({ keep: "all" });
console.log("Verification finished successfully!");
