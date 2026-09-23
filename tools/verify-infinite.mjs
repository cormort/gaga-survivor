// 無限地圖：生存者模式沒有世界邊界（地形無接縫平鋪、場景物件跟著玩家、被甩掉的怪搬到前方），
// 守塔模式維持 4000×4000 圍牆。斷言的是實際座標與數量，不是只看畫面有沒有出來。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-infinite.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const r = [];
const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });

const res = await page.evaluate(async () => {
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { Enemy } = await imp('js/entities/Enemy.js');
  const { isWorldBounded } = await imp('js/config.js');
  const { drawMacro } = await imp('js/systems/Terrain.js');
  const { LEVELS } = await imp('js/levels.js');
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  const out = {};
  // 一幀：固定遊戲狀態（背景升級不會把狀態切走），跑 update + render
  const step = (dt = 1 / 60) => { g.state = 'PLAYING'; g.pendingLevelUps = 0; g.update(dt); g.render(); };
  const walk = (dx, dy, seconds) => {
    // 直接推玩家位置（等速），模擬一路往同一方向跑
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) { g.player.x += dx / n; g.player.y += dy / n; g.player.hp = g.player.maxHp; step(); }
  };

  // 1) 生存者：無邊界，玩家可以走到 2 萬外（Player.update 內的夾範圍不生效）
  g.modeId = 'survivor';
  g.start();
  out.survivorBounded = isWorldBounded();
  g.player.x = 20000; g.player.y = -20000;
  step();
  out.far = { x: g.player.x, y: g.player.y };

  // 2) 地形：遠處也畫得出大地形（原本整張世界烘成 4000² 的一張，走出去是一片空白）
  const macroPixels = (cx, cy) => {
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400;
    const c = cv.getContext('2d');
    drawMacro(c, { x: cx, y: cy }, LEVELS[g.levelId], 400, 400);
    const d = c.getImageData(0, 0, 400, 400).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  };
  out.macroOrigin = macroPixels(-200, -200);
  out.macroFar = macroPixels(20000 - 200, -20000 - 200);
  out.macroFar2 = macroPixels(-53117, 81234);

  // 3) 場景物件跟著玩家：一路跑 3 萬單位後，可引爆物與木箱都還在玩家附近、數量有上限
  g.start();
  for (let k = 0; k < 10; k++) walk(3000, 0, 1);
  const near = (arr) => arr.every((o) => Math.hypot(o.x - g.player.x, o.y - g.player.y) <= 2700);
  out.scenery = {
    props: g.explodableProps.length, crates: g.destructibles.length,
    propsNear: near(g.explodableProps), cratesNear: near(g.destructibles), px: Math.round(g.player.x),
  };

  // 4) 被甩掉的雜兵搬到前方，首領不動
  g.start();
  g.enemies.length = 0;
  g.spawner.update = () => {};   // 不讓生成器干擾計數
  const mob = new Enemy('walker', g.player.x - 3000, g.player.y, {});
  const boss = new Enemy('walker', g.player.x - 3000, g.player.y + 50, {}); boss.isBoss = true;
  g.enemies.push(mob, boss);
  // 直接驅動一次：玩家這段時間往 +x 移動了 300
  g._recycleFrom = { x: g.player.x - 300, y: g.player.y };
  g._recycleTimer = 1;
  const moved = g.recycleFarEnemies(0);
  const dm = Math.hypot(mob.x - g.player.x, mob.y - g.player.y);
  const ahead = mob.x > g.player.x;
  // 整合：再把怪丟到後方 3000，一路跑 1 秒，遊戲迴圈自己會把它搬回來
  mob.x = g.player.x - 3000; mob.y = g.player.y;
  walk(600, 0, 1);
  out.relocate = {
    moved, mobDist: Math.round(dm), mobAhead: ahead, mobDead: mob.isDead,
    loopDist: Math.round(Math.hypot(mob.x - g.player.x, mob.y - g.player.y)),
    bossDist: Math.round(Math.hypot(boss.x - g.player.x, boss.y - g.player.y)),
  };

  // 5) 推擠在遠處仍有效（網格以玩家為中心）：兩隻怪疊在同一點，幾幀後分開
  g.player.x = 40000; g.player.y = 40000;
  g.enemies.length = 0;
  const a = new Enemy('walker', 40200, 40000, {}); const b = new Enemy('walker', 40200, 40000.5, {});
  a.speed = b.speed = 0;
  g.enemies.push(a, b);
  for (let i = 0; i < 20; i++) g.applyEnemySeparation(1 / 60);
  out.separation = Math.hypot(a.x - b.x, a.y - b.y);

  // 6) 敵方子彈：沒有邊界可撞，離玩家太遠就回收
  g.enemyProjectiles.length = 0;
  g.spawnEnemyProjectile(null, { x: g.player.x + 1000, y: g.player.y, vx: 2000, vy: 0, life: 60 });
  g.spawnEnemyProjectile(null, { x: g.player.x + 100, y: g.player.y + 100, vx: 0, vy: 0, life: 60 });
  for (let i = 0; i < 60; i++) g.updateEnemyProjectiles(1 / 60);
  out.bullets = g.enemyProjectiles.length;

  // 7) 守塔：維持 4000×4000 圍牆
  g.modeId = 'defense';
  g.start();
  out.defenseBounded = isWorldBounded();
  g.player.x = 20000; g.player.y = 20000;
  step();
  out.defensePos = { x: g.player.x, y: g.player.y };
  // 守塔不搬怪
  const m2 = new Enemy('walker', g.player.x - 3000, g.player.y, {});
  g.enemies.push(m2);
  out.defenseRecycle = g.recycleFarEnemies(1);
  g.modeId = 'survivor';
  return out;
});

ok('生存者模式沒有世界邊界：玩家可走到 (20000, -20000)', !res.survivorBounded && res.far.x === 20000 && res.far.y === -20000, JSON.stringify(res.far));
ok('大地形在原點與遠處都畫得出來（無接縫平鋪）', res.macroOrigin > 1000 && res.macroFar > 1000 && res.macroFar2 > 1000,
  `原點 ${res.macroOrigin}｜遠處 ${res.macroFar}｜負座標 ${res.macroFar2}`);
ok('場景物件跟著玩家（跑 3 萬單位後仍在附近、數量有上限）', res.scenery.propsNear && res.scenery.cratesNear
  && res.scenery.props === 14 && res.scenery.crates >= 12 && res.scenery.crates <= 18, JSON.stringify(res.scenery));
ok('被甩掉的雜兵搬到玩家前方的畫面外（只搬雜兵；遊戲迴圈中也會自動搬）', res.relocate.moved === 1 && !res.relocate.mobDead && res.relocate.mobAhead
  && res.relocate.mobDist >= 500 && res.relocate.mobDist <= 800 && res.relocate.loopDist < 1400,
  JSON.stringify(res.relocate));
ok('首領不會被搬走', res.relocate.bossDist > 3000, JSON.stringify(res.relocate));
ok('遠處敵人推擠仍有效', res.separation > 5, res.separation.toFixed(1));
ok('敵方子彈離玩家太遠就回收，近的保留', res.bullets === 1, res.bullets);
ok('守塔模式維持 4000×4000 圍牆', res.defenseBounded && res.defensePos.x <= 2000 && res.defensePos.y <= 2000, JSON.stringify(res.defensePos));
ok('守塔模式不搬怪', res.defenseRecycle === 0, res.defenseRecycle);

let fail = r.filter((t) => !t.pass).length;
for (const t of r) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${r.length - r.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
