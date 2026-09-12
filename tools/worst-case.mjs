// 最壞情境整合驗證：250 隻灼燒+中毒敵人 + 活火海 + 滿場敵方投射物 + 蓄能彈
// 斷言：無 page error、敵人數 > 0、畫布有非空白像素，並印出每幀成本。
const pw = (await import(process.env.PW_MODULE)).default;
const URL = process.env.GAME_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch({
  args: ['--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-rasterization'],
});
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(URL);
await page.waitForFunction(() => window.game, { timeout: 30000 });
await page.addInitScript(() => {});

const res = await page.evaluate(async () => {
  const g = window.game;
  const { Projectile } = await import('/js/entities/Projectile.js');

  g.ui.startScreen.classList.add('hidden');
  g.start();
  for (let i = 0; i < 40 && !g.enemies.length; i++) await new Promise((r) => setTimeout(r, 200));
  g.triggerLevelUp = () => {};   // 升級彈窗會停掉 update
  // 玩家不死：死亡流程會清空 weaponManager.projectiles，火海就量不到了
  g.player.invulnerableTimer = 1e9;
  g.player.takeDamage = () => false;
  g.player.hp = 1e9; g.player.maxHp = 1e9;

  // ── 250 隻灼燒 + 中毒 5 層 ──
  const proto = g.enemies[0];
  g.enemies.length = 0;
  for (let i = 0; i < 250; i++) {
    const e = Object.create(Object.getPrototypeOf(proto));
    Object.assign(e, proto);
    e.x = g.player.x + (Math.random() - 0.5) * 700;
    e.y = g.player.y + (Math.random() - 0.5) * 700;
    e.isDead = false; e.hp = 1e9; e.maxHp = 1e9;
    e.burnTimer = 999; e.poisonTimer = 999; e.poisonStacks = 5;
    g.enemies.push(e);
  }

  // ── 6 灘活火海（含進化版藍色煉獄）＋ 2 發蓄能彈 ──
  const pools = [];
  for (let i = 0; i < 6; i++) {
    const p = new Projectile({
      type: 'fire_pool', x: g.player.x + (i - 2.5) * 60, y: g.player.y + 90,
      radius: 70 + i * 7, isEvo: i === 5, damage: 10, life: 999, pierce: 9999,
      healPerSec: 0, tickInterval: 0.25, pierce: 9999,
    });
    p.isDead = false;
    pools.push(p);
  }
  g.weaponManager.projectiles.push(...pools);
  for (const charge of ['burn', 'freeze']) {
    const p = new Projectile({
      type: 'kunai', charge, x: g.player.x, y: g.player.y - 60, vx: 120, vy: -60,
      radius: 7, damage: 10, life: 999, pierce: 9999,
    });
    g.weaponManager.projectiles.push(p);
  }

  // ── 滿場敵方投射物 (150 上限) ──
  for (let i = 0; i < 150; i++) {
    const a = Math.random() * Math.PI * 2;
    g.spawnEnemyProjectile(g.player, {
      x: g.player.x + Math.cos(a) * 220, y: g.player.y + Math.sin(a) * 220,
      vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
      damage: 8, radius: 6, life: 999,
      color: i % 4 === 0 ? '#b5179e' : '#06d6a0',
      glow: i % 4 === 0 ? '#e0aaff' : '#06d6a0',
    });
  }

  // ── 跑 180 幀固定步進 ──
  const DT = 1 / 60;
  let updMs = 0, rndMs = 0;
  for (let i = 0; i < 180; i++) {
    let t = performance.now();
    g.update(DT);
    updMs += performance.now() - t;
    t = performance.now();
    g.render();
    rndMs += performance.now() - t;
    // 火海/敵彈壽命很長，但為了保險起見補回數量
    if (g.enemyProjectiles.length < 120) {
      const a = Math.random() * Math.PI * 2;
      g.spawnEnemyProjectile(g.player, {
        x: g.player.x + Math.cos(a) * 220, y: g.player.y + Math.sin(a) * 220,
        vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, damage: 8, radius: 6, life: 999,
        color: '#06d6a0', glow: '#06d6a0',
      });
    }
  }

  // ── 畫布非空白檢查 ──
  const c = g.canvas;
  const px = g.ctx.getImageData(0, 0, c.width, c.height).data;
  let nonTransparent = 0, nonBlack = 0;
  const colors = new Set();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 8) nonTransparent++;
    if (px[i] + px[i + 1] + px[i + 2] > 24) nonBlack++;
    if (colors.size < 4096) colors.add((px[i] >> 3) + ',' + (px[i + 1] >> 3) + ',' + (px[i + 2] >> 3));
  }
  const total = px.length / 4;

  return {
    敵人數: g.enemies.length,
    灼燒中: g.enemies.filter((e) => e.burnTimer > 0).length,
    中毒中: g.enemies.filter((e) => e.poisonTimer > 0).length,
    敵方投射物: g.enemyProjectiles.length,
    我方投射物: g.weaponManager.projectiles.length,
    活火海: g.weaponManager.projectiles.filter((p) => p.type === 'fire_pool' && !p.isDead).length,
    粒子: g.particles.particles.length,
    跳字: g.particles.damageTexts.length,
    落雷: g.particles.lightnings.length,
    每幀updateMs: +(updMs / 180).toFixed(2),
    每幀renderMs: +(rndMs / 180).toFixed(2),
    畫布: `${c.width}x${c.height}`,
    不透明像素佔比: +(100 * nonTransparent / total).toFixed(1) + '%',
    非黑像素佔比: +(100 * nonBlack / total).toFixed(1) + '%',
    顏色數: colors.size,
  };
});

await page.screenshot({ path: '/tmp/worst-case.png' });

const checks = [
  ['無 page error', pageErrors.length === 0, pageErrors.join(' | ')],
  ['無 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ')],
  ['敵人數 > 0', res.敵人數 > 0, `enemies=${res.敵人數}`],
  ['火海存活', res.活火海 >= 6, `pools=${res.活火海}`],
  ['敵方投射物滿載', res.敵方投射物 >= 100, `enemyProjectiles=${res.敵方投射物}`],
  ['畫布非空白 (不透明 > 50%)', parseFloat(res.不透明像素佔比) > 50, res.不透明像素佔比],
  ['畫布有內容 (非黑 > 5%)', parseFloat(res.非黑像素佔比) > 5, res.非黑像素佔比],
];
console.log('── 最壞情境統計 ──');
console.log(JSON.stringify(res, null, 2));
console.log('── 斷言 ──');
let fail = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  → ' + detail}`);
  if (!ok) fail++;
}
console.log(fail === 0 ? '✅ 全部通過' : `❌ ${fail} 項失敗`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
