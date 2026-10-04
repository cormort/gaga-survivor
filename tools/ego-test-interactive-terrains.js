// 互動式機制地形（熔岩裂隙、流沙陷阱、雷暴電場、聖域靈氣陣）自動化驗證腳本
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
import fs from 'fs';

const task = await taskSpace("interactive-terrains-" + Date.now());
const page = task.page("p1");

console.log("導航至遊戲網頁並清除舊快取...");
await page.goto("http://127.0.0.1:8899/index.html");
await page.waitForLoadState("load");

await page.evaluate(async () => {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
  }
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1000);

const testResults = await page.evaluate(async () => {
  const r = [];
  const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const H = await imp('js/systems/Hazards.js?v=' + Date.now());
  const { Enemy } = await imp('js/entities/Enemy.js');

  const g = window.game;
  if (!g) return [{ name: 'Game instance', pass: false, detail: 'window.game not found' }];

  g.ui.startScreen.classList.add('hidden');
  g.start();
  g.paused = true; // 凍結背景 requestAnimationFrame，確保測試步進確定性

  const p = g.player;
  const reset = () => {
    g.hazards = [];
    g.enemies = [];
    p.x = 0;
    p.y = 0;
    p.hp = p.maxHp;
    p.invulnerableTimer = 0;
    p.terrainSpeedMul = 1;
    p.sanctuaryTimer = 0;
    p.sanctuaryResist = 0;
  };

  // 1. 熔岩裂隙 (Lava)
  reset();
  const baseSpeed = p.speed;
  H.placeHazard(g, { type: 'lava', radius: 100, dur: 30, dmg: 6, dmgEnemy: 100, color: '#ff3c00' }, 0, 0);
  const mobLava = new Enemy('walker', 20, 0, {});
  g.enemies.push(mobLava);
  const mobLavaHp0 = mobLava.hp;
  H.updateHazards(g, 1 / 60);

  ok('熔岩裂隙：玩家移速減緩 (0.85)', Math.abs(p.speed / baseSpeed - 0.85) < 0.02, `${(p.speed / baseSpeed).toFixed(2)}`);
  ok('熔岩裂隙：敵人移速減緩 (0.85)', Math.abs(mobLava.speedFactor() - 0.85) < 0.02, `${mobLava.speedFactor().toFixed(2)}`);
  
  // 敵人在熔岩中持續受到高額灼燒傷害 (0.5s tick)
  for (let i = 0; i < 35; i++) H.updateHazards(g, 1 / 60);
  ok('熔岩裂隙：對踏入的敵人造成灼燒傷害', mobLava.hp < mobLavaHp0, `${mobLavaHp0} → ${mobLava.hp}`);

  // 玩家在熔岩中受到灼燒傷害
  reset();
  const pLavaHp0 = p.hp;
  H.placeHazard(g, { type: 'lava', radius: 100, dur: 30, dmg: 6, dmgEnemy: 100, color: '#ff3c00' }, 0, 0);
  for (let i = 0; i < 35; i++) H.updateHazards(g, 1 / 60);
  ok('熔岩裂隙：玩家受到灼燒傷害', p.hp < pLavaHp0, `${pLavaHp0} → ${p.hp}`);

  // 2. 流沙泥濘陷阱 (Quicksand)
  reset();
  H.placeHazard(g, { type: 'quicksand', radius: 120, dur: 30, pullSpeed: 60, color: '#d4a373' }, 0, 0);
  p.x = 60; p.y = 0;
  const sandMob = new Enemy('walker', 70, 0, {});
  g.enemies.push(sandMob);
  H.updateHazards(g, 1 / 60);

  ok('流沙陷阱：玩家受到強烈減速 (0.38)', Math.abs(p.speed / baseSpeed - 0.38) < 0.02, `${(p.speed / baseSpeed).toFixed(2)}`);
  ok('流沙陷阱：敵人受到強烈減速 (0.38)', Math.abs(sandMob.speedFactor() - 0.38) < 0.02, `${sandMob.speedFactor().toFixed(2)}`);
  
  // 測試向心牽引力
  const px0 = p.x;
  const mobX0 = sandMob.x;
  for (let i = 0; i < 20; i++) H.updateHazards(g, 1 / 60);
  ok('流沙陷阱：將玩家向中心牽引', p.x < px0, `x: ${px0} → ${p.x.toFixed(1)}`);
  ok('流沙陷阱：將敵人向中心牽引', sandMob.x < mobX0, `x: ${mobX0} → ${sandMob.x.toFixed(1)}`);

  // 3. 雷暴過載電場 (Electro)
  reset();
  H.placeHazard(g, { type: 'electro', radius: 110, dur: 30, dischargeInterval: 0.25, dmg: 4, dmgEnemy: 150, color: '#00e5ff' }, 0, 0);
  const electroMob = new Enemy('walker', 30, 0, {});
  g.enemies.push(electroMob);
  const electroHp0 = electroMob.hp;
  for (let i = 0; i < 16; i++) H.updateHazards(g, 1 / 60); // 觸發放電震撼
  ok('雷暴電場：放電震撼造成電擊傷害', electroMob.hp < electroHp0, `${electroHp0} → ${electroMob.hp}`);
  ok('雷暴電場：電擊附帶感電眩暈', electroMob.stunTimer > 0, `stunTimer: ${electroMob.stunTimer.toFixed(2)}`);

  // 4. 聖域靈氣陣 (Sanctuary)
  reset();
  p.hp = p.maxHp - 30;
  const pSancHp0 = p.hp;
  H.placeHazard(g, { type: 'sanctuary', radius: 120, dur: 30, heal: 4, dmgEnemy: 60, color: '#ffd700' }, 0, 0);
  const evilMob = new Enemy('walker', 40, 0, {});
  g.enemies.push(evilMob);
  const evilHp0 = evilMob.hp;
  H.updateHazards(g, 1 / 60);

  ok('聖域靈氣陣：玩家獲得聖域減傷加持 (40%)', p.sanctuaryTimer > 0 && Math.abs(p.sanctuaryResist - 0.40) < 0.01, `timer: ${p.sanctuaryTimer.toFixed(2)}, resist: ${p.sanctuaryResist}`);
  ok('聖域靈氣陣：玩家不受減速限制 (1.00)', Math.abs(p.speed / baseSpeed - 1.0) < 0.02, `${(p.speed / baseSpeed).toFixed(2)}`);
  ok('聖域靈氣陣：邪惡敵人受到神聖斥力減速 (0.65)', Math.abs(evilMob.speedFactor() - 0.65) < 0.02, `${evilMob.speedFactor().toFixed(2)}`);

  for (let i = 0; i < 35; i++) H.updateHazards(g, 1 / 60); // 0.5s heal & smite
  ok('聖域靈氣陣：陣內玩家獲得生命回復', p.hp > pSancHp0, `${pSancHp0} → ${p.hp}`);
  ok('聖域靈氣陣：陣內敵人受到神聖制裁傷害', evilMob.hp < evilHp0, `${evilHp0} → ${evilMob.hp}`);

  // 5. 負座標與全部地形繪製安全防護
  reset();
  let renderErr = null;
  const types = ['tar', 'spring', 'gale', 'lava', 'quicksand', 'electro', 'sanctuary'];
  for (const type of types) {
    H.placeHazard(g, { type, radius: 90, dur: 30, color: '#ff00aa' }, -150.2, -88.7);
  }
  try {
    g.render();
  } catch (e) {
    renderErr = e.message;
  }
  ok('所有新舊地形在負座標繪製無異常', !renderErr, renderErr || 'ok');

  return r;
});

console.log("\n====== 互動式地形功能驗證結果 ======");
let failCount = 0;
for (const t of testResults) {
  if (!t.pass) failCount++;
  console.log(`${t.pass ? '✅ PASS' : '❌ FAIL'}  ${t.name}  [${t.detail}]`);
}

// 擺放四種地形在畫布上並截圖留存
console.log("\n正在生成四種地形的遊戲內渲染截圖...");
await page.evaluate(async () => {
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const H = await imp('js/systems/Hazards.js?v=' + Date.now());
  const g = window.game;
  g.hazards = [];
  g.enemies = [];
  g.player.x = 0;
  g.player.y = 0;
  g.camera.x = -g.vw / 2;
  g.camera.y = -g.vh / 2;

  // 4 個象限各放一種新地形
  H.placeHazard(g, { type: 'lava', radius: 130, dur: 999, color: '#ff3c00' }, -200, -180);
  H.placeHazard(g, { type: 'quicksand', radius: 130, dur: 999, color: '#d4a373' }, 200, -180);
  H.placeHazard(g, { type: 'electro', radius: 130, dur: 999, color: '#00e5ff' }, -200, 180);
  H.placeHazard(g, { type: 'sanctuary', radius: 130, dur: 999, color: '#ffd700' }, 200, 180);

  // 走幾個 tick 讓動畫粒子與旋轉展開
  for (let i = 0; i < 60; i++) H.updateHazards(g, 1 / 60);
  g.render();
});

const canvasData = await page.evaluate(() => {
  const canvas = document.getElementById('gameCanvas');
  return canvas ? canvas.toDataURL('image/png') : null;
});

if (canvasData) {
  const base64Data = canvasData.replace(/^data:image\/png;base64,/, "");
  const outPath = `${EGO_OUT_DIR}/interactive_terrains_showcase.png`;
  fs.writeFileSync(outPath, base64Data, 'base64');
  console.log("📸 四種互動地形遊戲畫面已截圖至:", outPath);
}

await task.finish({ keep: "all" });
process.exit(failCount ? 1 : 0);
