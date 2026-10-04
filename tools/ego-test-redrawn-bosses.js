// Test script using ego-browser to verify newly redrawn bosses in game and in cutscene
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const task = await taskSpace("redrawn-bosses-verification-" + Date.now());
const page = task.page("p1");

console.log("Navigating to game on port 8899...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(1200);

// Ensure SW cache is cleared and window.game is loaded
console.log("Ensuring game module is initialized...");
await page.evaluate(async () => {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
  }
  if (!window.game) {
    await import('./js/main.js?t=' + Date.now());
  }
});
await page.waitForTimeout(1000);

// Start game
console.log("Starting game...");
await page.evaluate(() => {
  document.getElementById('start-screen')?.classList.add('hidden');
  if (window.game) {
    window.game.state = 'PLAYING';
    if (typeof window.game.start === 'function') {
      window.game.start();
    }
  }
});
await page.waitForTimeout(1000);

// Verify sprite registration
const spriteCheck = await page.evaluate(async () => {
  const { imageSpritesReady, getSprite, hasSprite } = await import('./js/sprites.js');
  await imageSpritesReady;

  const keys = [
    'boss', 'boss_charging', 'boss_nob', 'boss_broodlord', 'boss_carnifex',
    'boss_street', 'boss_lab', 'boss_frost', 'boss_core', 'boss_subway',
    'boss_swamp', 'boss_storm', 'boss_foundry', 'boss_frostvoid', 'boss_voidroad', 'boss_thunder'
  ];

  const results = {};
  for (const k of keys) {
    const sp = getSprite(k);
    results[k] = {
      has: hasSprite(k),
      w: sp?.w,
      h: sp?.h,
      framesCount: sp?.frames?.length || 0,
    };
  }
  return results;
});

console.log("Sprite check results:", JSON.stringify(spriteCheck, null, 2));

// Helper to trigger cutscene and capture bust
async function testBossCutscene(bossName, screenshotPath) {
  console.log(`Triggering cutscene for: ${bossName}...`);
  await page.evaluate((name) => {
    document.getElementById('start-screen')?.classList.add('hidden');
    window.game.state = 'PLAYING';
    if (window.triggerBossCutscene) {
      window.triggerBossCutscene(name);
    } else if (window.game.triggerBossCutscene) {
      window.game.triggerBossCutscene(name);
    } else {
      window.game.bossCutscene.start({ name, hp: 50000 });
    }
    // Fast-forward to Phase 3 (bust & typewriter dialogue)
    if (window.game.bossCutscene) {
      window.game.bossCutscene.startTime = (performance.now() / 1000) - 2.8;
      window.game.bossCutscene.update(0.016);
      window.game.bossCutscene.typedChars = 999;
      window.game.bossCutscene.lastBleepChar = 999;
    }
  }, bossName);

  await page.waitForTimeout(600);
  await page.screenshot({ path: screenshotPath });
  console.log(`Captured: ${screenshotPath}`);

  // Dismiss cutscene
  await page.evaluate(() => {
    window.game.bossCutscene?.finish();
  });
  await page.waitForTimeout(300);
}

const artifactDir = EGO_OUT_DIR;

// Test 1: Ork Warboss (formerly blurry monkey)
await testBossCutscene("歐克戰爭頭目", `${artifactDir}/boss_redrawn_ork_nob.png`);

// Test 2: Tyranid Broodlord (formerly anime girl in bikini)
await testBossCutscene("蟲群基因原體", `${artifactDir}/boss_redrawn_broodlord.png`);

// Test 3: Tyranid Carnifex (formerly chimera lion)
await testBossCutscene("泰倫劊子手暴君", `${artifactDir}/boss_redrawn_carnifex.png`);

// Test 4: Abyssal Demon Tyrant (formerly chimera lion)
await testBossCutscene("深淵魔煞", `${artifactDir}/boss_redrawn_abyssal_demon.png`);

// Test 5: Rampaging Bulldozer Zombie
await testBossCutscene("狂暴推土喪屍", `${artifactDir}/boss_redrawn_street_bulldozer.png`);

// Test 6: Specimen Zero
await testBossCutscene("母體‧零號實驗體", `${artifactDir}/boss_redrawn_lab_specimen.png`);

// Test 7: Heavenly Thunder Sovereign
await testBossCutscene("天劫雷尊‧渡劫", `${artifactDir}/boss_redrawn_thunder_deity.png`);

await task.finish({ keep: "all" });
console.log("All redrawn boss verifications completed!");
