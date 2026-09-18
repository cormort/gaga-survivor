// 敵人「近得了身嗎」與「遠程威脅密度」的實機量測。
//
// 為什麼要這支：玩家回報「敵人太脆，近不了身」—— 這是手感問題，但可以量化：
//   ① 近戰壓力：在真實關卡（含場上所有敵人）下，從生成距離放一隻雜兵出去，
//      量牠「存活到接觸玩家」的機率。機率太低就是玩家回報的那件事。
//   ② 遠程密度：關卡波次池裡「會發射投射物」的敵人佔比。
// 兩者都是資料驅動的（config.js 的 ENEMY_TYPES + levels.js 的 wave.pool），
// 所以這支同時是平衡儀表與回歸契約。
//
// 用法：
//   python3 -m http.server 8899
//   node tools/probe-enemy-pressure.mjs
//
// 只印數據，不做判定（判定在 tools/verify-balance.mjs）。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch({
  args: ['--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-rasterization'],
});
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

const out = await page.evaluate(async () => {
  const g = window.game;
  const { Enemy } = await import(new URL('js/entities/Enemy.js', document.baseURI).href);
  const { LEVELS, enemyScale } = await import(new URL('js/levels.js', document.baseURI).href);
  const { ENEMY_TYPES } = await import(new URL('js/config.js', document.baseURI).href);
  const { Spawner } = await import(new URL('js/systems/Spawner.js', document.baseURI).href);
  const { save } = await import(new URL('js/save.js', document.baseURI).href);

  save.data.difficulty = 'normal';
  save.data.stash = []; save.data.equipped = [];
  g.ui.startScreen?.classList.add('hidden');

  const report = { melee: [], hp: [], ranged: [], pool: [] };

  // ── ① 近戰壓力：量「接觸率」──
  //
  // 關鍵：一定要走**真正的 game.update()**。先前版本自己手動呼叫
  // weaponManager.update + enemy.update，結果投射物的移動與碰撞都沒跑，
  // 等於把玩家武器整組關掉 —— 量到 100% 接觸率，完全是假訊號。
  //
  // 為了可重現：每幀清掉 Spawner 生的怪，只留我們放的那一隻；
  // gameTime 每輪歸零，所以 enemyScale 的成長不會污染取樣。
  const contactRate = (typeKey, minutes, trials = 20) => {
    let contacted = 0;
    const level = LEVELS[g.levelId] || LEVELS.street;
    for (let t = 0; t < trials; t++) {
      g.start();
      g.triggerLevelUp = () => {};
      g.input.reset();                     // 玩家站著不動：量「不閃避」的下限情境
      g.gameTime = minutes * 60;           // 從指定時間點開始，血量才會是那個時間點的值
      const scale = enemyScale(g.gameTime, level, g.rules);
      const dist0 = 470 + Math.random() * 120;   // 與 Spawner 的生成距離同級
      const e = new Enemy(typeKey, g.player.x + dist0, g.player.y, scale);
      const sx = g.player.x, sy = g.player.y;
      const DT = 1 / 60;
      let hit = false;
      for (let f = 0; f < Math.round(10 / DT); f++) {
        g.enemies.length = 0;              // 排除 Spawner 生的其他怪
        if (e.isDead) break;
        g.enemies.push(e);
        g.update(DT);
        const d = Math.hypot(e.x - sx, e.y - sy);
        if (d <= e.radius + g.player.radius + 2 && !e.isDead) { hit = true; break; }
        if (g.player.isDead) break;
        if (g.state !== 'PLAYING') g.state = 'PLAYING';   // 升級/開箱彈窗不中斷量測
      }
      if (hit) contacted++;
    }
    return contacted / trials;
  };

  for (const [key, minutes] of [['walker', 2], ['walker', 5], ['walker', 8], ['brute', 8]]) {
    report.melee.push({ type: key, minutes, rate: contactRate(key, minutes) });
  }

  // ── ② 各時間點的雜兵實際血量 ──
  {
    const level = LEVELS[g.levelId] || LEVELS.street;
    for (const minutes of [1, 3, 5, 8]) {
      const scale = enemyScale(minutes * 60, level, g.rules);
      const row = { minutes, enemies: {} };
      for (const k of ['walker', 'bat', 'runner', 'hound', 'brute']) {
        const e = new Enemy(k, 0, 0, scale);
        row.enemies[k] = e.maxHp;
      }
      report.hp.push(row);
    }
  }

  // ── ③ 波次池的遠程佔比（每一關、每一個波次取最大） ──
  for (const [id, lv] of Object.entries(LEVELS)) {
    let best = 0;
    for (const w of lv.waves || []) {
      const total = (w.pool || []).reduce((s, [, wt]) => s + wt, 0);
      if (!total) continue;
      const rw = (w.pool || []).filter(([k]) => ENEMY_TYPES[k] && ENEMY_TYPES[k].ranged)
        .reduce((s, [, wt]) => s + wt, 0);
      best = Math.max(best, rw / total);
    }
    report.pool.push({ level: id, rangedShare: best });
  }

  // ── ④ 遠程怪實測開火頻率（同級敵人數量下的每分鐘發射數） ──
  {
    g.start();
    g.triggerLevelUp = () => {};
    g.enemies.length = 0;
    const shooterKeys = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k].ranged);
    const scale = enemyScale(300, LEVELS[g.levelId] || LEVELS.street, g.rules);
    for (const k of shooterKeys) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const e = new Enemy(k, g.player.x + Math.cos(a) * 260, g.player.y + Math.sin(a) * 260, scale);
        e.maxHp = e.hp = 1e9;      // 不讓牠被打死，才能量到穩定射速
        g.enemies.push(e);
      }
    }
    let shots = 0;
    const DT = 1 / 60;
    const frames = Math.round(30 / DT);      // 跑 30 秒遊戲時間
    for (let f = 0; f < frames; f++) {
      for (const en of g.enemies) {
        en.update(DT, g.player, {
          onShoot: () => { shots++; },
          spawnMinion: () => {},
        });
      }
    }
    report.ranged = { shooters: shooterKeys, count: g.enemies.length, seconds: 30, shots };
  }

  g.enemies.length = 0;
  return report;
});

console.log('=== ① 近戰雜兵「活著走到玩家面前」的機率（24 次取樣、玩家站著不動）===');
for (const r of out.melee) {
  console.log(`  ${r.type.padEnd(7)} ${String(r.minutes).padStart(2)} 分：${(r.rate * 100).toFixed(0)}%`);
}

console.log('\n=== ② 雜兵實際血量（標準難度）===');
console.log('   時間  ' + ['walker', 'bat', 'runner', 'hound', 'brute'].map((k) => k.padStart(8)).join(''));
for (const r of out.hp) {
  console.log(`  ${String(r.minutes).padStart(2)} 分  ` + ['walker', 'bat', 'runner', 'hound', 'brute']
    .map((k) => String(Math.round(r.enemies[k])).padStart(8)).join(''));
}

console.log('\n=== ③ 各關卡波次池的遠程敵人佔比（取最高的波次）===');
for (const r of out.pool) {
  console.log(`  ${r.level.padEnd(12)} ${(r.rangedShare * 100).toFixed(1)}%`);
}
const avg = out.pool.reduce((s, r) => s + r.rangedShare, 0) / out.pool.length;
console.log(`  平均 ${(avg * 100).toFixed(1)}%`);

console.log('\n=== ④ 遠程怪實測開火（12 隻、30 秒遊戲時間）===');
console.log(`  種類 ${out.ranged.shooters.join('、')}｜${out.ranged.count} 隻｜${out.ranged.seconds} 秒共 ${out.ranged.shots} 發`);
console.log(`  → 每隻每分鐘 ${(out.ranged.shots / out.ranged.count / (out.ranged.seconds / 60)).toFixed(1)} 發`);

if (errs.length) console.log('\nPAGE ERRORS:', errs.slice(0, 3).join(' | '));
await browser.close();
