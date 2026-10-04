// E2E test script using ego-browser to verify Tactical Sockets & Placement System
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const task = await taskSpace("td-placement-verification");
const page = task.page("p1");

console.log("Navigating to game...");
await page.goto("http://127.0.0.1:8899/index.html");
await page.waitForLoadState("load");
await page.waitForFunction(() => !!window.game);
await page.waitForTimeout(1000);

// Setup save and start game in TD mode with td_canyon
console.log("Configuring game state for Tower Defense...");
await page.evaluate(async () => {
  const { save } = await import('./js/save.js');
  save.data.dna = 99999;
  save.unlock('td_canyon', 'defense');
  save.flush();

  const game = window.game;
  game.modeKey = 'defense';
  game.levelKey = 'td_canyon';
  game.characterId = 'duck';
  game.gold = 500;
  game.ui.startScreen.classList.add('hidden');
  game.start();
});

await page.waitForTimeout(1000);

// Verify Sockets in level
const socketsInfo = await page.evaluate(() => {
  const game = window.game;
  return {
    isTD: !!game.td,
    levelKey: game.levelKey,
    socketCount: game.level?.sockets ? game.level.sockets.length : 0,
    sockets: game.level?.sockets?.map(s => ({ id: s.id, x: s.x, y: s.y, bonus: s.bonus, label: s.label }))
  };
});
console.log("Level sockets info:", JSON.stringify(socketsInfo, null, 2));

// Step 1: Start placement of heavy_bolter
console.log("Activating placement mode for heavy_bolter...");
await page.evaluate(() => {
  const game = window.game;
  game.gold = 800; // ensure sufficient funds
  const btn = document.getElementById('btn-build-heavy-bolter');
  btn?.click();
});
await page.waitForTimeout(400);

// Verify placement state and HUD banner
const placementState1 = await page.evaluate(() => {
  const game = window.game;
  const hud = document.getElementById('placement-hud');
  return {
    hasPlacement: !!game.placement,
    type: game.placement?.type,
    hudVisible: hud && !hud.classList.contains('hidden'),
    hudText: document.getElementById('placement-hud-title')?.textContent
  };
});
console.log("Placement state 1 (HUD active):", placementState1);

// Step 2: Hover near first tactical socket to trigger magnetic snapping
console.log("Moving cursor near first tactical socket to test snapping...");
const targetSocket = socketsInfo.sockets[0];
await page.evaluate((target) => {
  const game = window.game;
  // screen coord corresponding to target socket
  const screenX = target.x - game.camera.x + 20; // 20px offset
  const screenY = target.y - game.camera.y + 15;
  game.canvas.dispatchEvent(new PointerEvent('pointermove', {
    clientX: screenX,
    clientY: screenY,
    bubbles: true
  }));
}, targetSocket);
await page.waitForTimeout(400);

// Verify snapping
const snapCheck = await page.evaluate((target) => {
  const game = window.game;
  return {
    isSnapped: !!game.placement?.socket,
    snappedId: game.placement?.socket?.id,
    expectedId: target.id,
    valid: game.placement?.valid,
    reason: game.placement?.reason,
    posX: game.placement?.x,
    posY: game.placement?.y
  };
}, targetSocket);
console.log("Snapping check:", snapCheck);

// Take screenshot of ghost placement preview
await page.screenshot({ path: `${EGO_OUT_DIR}/ego_td_placement_ghost.png` });

// Step 3: Confirm placement on socket
console.log("Confirming placement by left clicking canvas...");
await page.evaluate((target) => {
  const game = window.game;
  const screenX = target.x - game.camera.x;
  const screenY = target.y - game.camera.y;
  game.canvas.dispatchEvent(new PointerEvent('pointerdown', {
    clientX: screenX,
    clientY: screenY,
    button: 0,
    bubbles: true
  }));
}, targetSocket);
await page.waitForTimeout(600);

// Verify turret placed and socket occupied with tactical bonuses
const placedTurretCheck = await page.evaluate((target) => {
  const game = window.game;
  const turret = game.turrets.find(t => t.socket && t.socket.id === target.id);
  const hud = document.getElementById('placement-hud');
  return {
    placementCleared: !game.placement,
    hudHidden: hud && hud.classList.contains('hidden'),
    turretFound: !!turret,
    turretType: turret?.facilityType,
    turretSocketBonus: turret?.socketBonus,
    rangeMul: turret?.rangeMul,
    cdrMulMod: turret?.cdrMulMod,
    dmgMul: turret?.dmgMul,
    maxHp: turret?.maxHp,
    goldRemaining: game.gold
  };
}, targetSocket);
console.log("Placed turret check:", placedTurretCheck);

// Step 4: Click the placed turret to open Facility Inspector
console.log("Clicking the placed turret to inspect...");
await page.evaluate((target) => {
  const game = window.game;
  const screenX = target.x - game.camera.x;
  const screenY = target.y - game.camera.y;
  game.canvas.dispatchEvent(new PointerEvent('pointerdown', {
    clientX: screenX,
    clientY: screenY,
    button: 0,
    bubbles: true
  }));
}, targetSocket);
await page.waitForTimeout(600);

// Verify Inspector Modal
const inspectModalCheck = await page.evaluate(() => {
  const modal = document.getElementById('facility-inspect-modal');
  const visible = modal && !modal.classList.contains('hidden');
  const title = document.getElementById('inspect-title')?.textContent;
  const level = document.getElementById('inspect-level')?.textContent;
  const socketName = document.getElementById('inspect-socket-name')?.textContent;
  const socketDesc = document.getElementById('inspect-socket-desc')?.textContent;
  const hpText = document.getElementById('inspect-hp')?.textContent;
  const upgradeCost = document.getElementById('inspect-upgrade-cost')?.textContent;
  const recycleVal = document.getElementById('inspect-recycle-val')?.textContent;
  return { visible, title, level, socketName, socketDesc, hpText, upgradeCost, recycleVal };
});
console.log("Inspector modal check:", inspectModalCheck);

// Take screenshot of Facility Inspector
await page.screenshot({ path: `${EGO_OUT_DIR}/ego_td_inspector_view.png` });

// Step 5: Test Upgrade in Inspector
console.log("Clicking Upgrade in Inspector...");
await page.evaluate(() => {
  const upBtn = document.getElementById('btn-inspect-upgrade');
  upBtn?.click();
});
await page.waitForTimeout(500);

const afterUpgradeCheck = await page.evaluate((target) => {
  const game = window.game;
  const turret = game.turrets.find(t => t.socket && t.socket.id === target.id);
  const levelText = document.getElementById('inspect-level')?.textContent;
  return {
    turretLevel: turret?.level,
    turretHp: turret?.hp,
    turretMaxHp: turret?.maxHp,
    turretDmgMul: turret?.dmgMul,
    modalLevelText: levelText
  };
}, targetSocket);
console.log("After upgrade check:", afterUpgradeCheck);

// Step 6: Test Recycle / Sell (70% gold refund)
// 拆除自 v93 起要點兩次（第一次只上膛），所以這裡先按一次確認「還沒拆」，再按第二次真的拆。
console.log("Testing Recycle / Demolish for 70% refund (two-step confirm)...");
const beforeGold = await page.evaluate(() => window.game.gold);
const afterFirstClick = await page.evaluate((target) => {
  document.getElementById('btn-inspect-recycle')?.click();
  const btn = document.getElementById('btn-inspect-recycle');
  return {
    armed: !!btn?.classList.contains('armed'),
    label: document.getElementById('inspect-recycle-label')?.textContent,
    turretStillExists: window.game.turrets.some(t => t.socket && t.socket.id === target.id),
  };
}, targetSocket);
console.log("After first (arming) click:", afterFirstClick);

await page.evaluate(() => {
  const recBtn = document.getElementById('btn-inspect-recycle');
  recBtn?.click();
});
await page.waitForTimeout(600);

const afterRecycleCheck = await page.evaluate((target, initialGold) => {
  const game = window.game;
  const modal = document.getElementById('facility-inspect-modal');
  const turretStillExists = game.turrets.some(t => t.socket && t.socket.id === target.id);
  const targetSocketObj = game.level.sockets.find(s => s.id === target.id);
  return {
    modalClosed: modal && modal.classList.contains('hidden'),
    turretStillExists,
    socketFreed: targetSocketObj && !targetSocketObj.occupied,
    goldBefore: initialGold,
    goldAfter: game.gold,
    refundReceived: game.gold - initialGold
  };
}, targetSocket, beforeGold);
console.log("After recycle check:", afterRecycleCheck);

// Final game view screenshot
await page.screenshot({ path: `${EGO_OUT_DIR}/ego_td_after_recycle.png` });

await task.finish({ keep: "all" });
console.log("TD Placement & Inspector E2E test finished cleanly!");
