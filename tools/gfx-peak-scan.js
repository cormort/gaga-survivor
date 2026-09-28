// 「真實對局的最壞一幀」量測（ego-browser 頁面內注入）。
//
// 為什麼需要這一支：tools/perf-probe.mjs 量的是「人工灌到 250 隻 + 全場灼燒」的
// 合成最壞情況，數字很大但沒有告訴我們「實際玩到後期會有多少隻同時在場」。
// 沒有那個數字，就無法判斷 renderMs 146~217ms 到底是「理論上限」還是「玩家真的會遇到」。
//
// 做法：把整場守塔關卡用固定 dt 快轉跑完（不靠 rAF），每一步記錄同時在場的敵人數
// 與該步的 render 時間，最後回報峰值與分布。
//
// 用法：
//   await page.evaluate(SOURCE)
//   await page.evaluate(() => window.__peakScan.run())
(function () {
  window.__peakScan = {
    run({ level = 'td_fortress', dt = 1 / 60, maxSeconds = 900 } = {}) {
      const g = window.game;
      g.ui.startScreen.classList.add('hidden');
      g.modeId = 'defense';
      g.levelId = level;
      g.start(false);
      g.triggerLevelUp = () => {};

      const samples = [];
      let peakEnemies = 0, peakEnemiesAt = 0;
      let peakRender = 0, peakRenderEnemies = 0, peakRenderAt = 0;
      let sumRender = 0, steps = 0;
      const seenWaves = new Set();

      for (let i = 0; i < maxSeconds / dt; i++) {
        g.pendingLevelUps = 0;          // 升級彈窗會停掉 update
        try { g.update(dt); } catch (e) { break; }

        const t0 = performance.now();
        try { g.render(); } catch (e) { break; }
        const rms = performance.now() - t0;

        const n = g.enemies.length;
        sumRender += rms; steps++;
        if (n > peakEnemies) { peakEnemies = n; peakEnemiesAt = g.gameTime; }
        if (rms > peakRender) { peakRender = rms; peakRenderEnemies = n; peakRenderAt = g.gameTime; }

        if (g.td) seenWaves.add(g.td.waveIdx);
        // 每 5 秒取樣一次，供分布參考
        if (i % Math.round(5 / dt) === 0) samples.push({ t: Math.round(g.gameTime), n, rms: +rms.toFixed(1) });

        // 全部波次打完且場上清空就停
        if (g.td && g.td.phase === 'done' && g.enemies.length === 0) break;
        if (g.state === 'GAME_OVER') break;
      }

      return {
        關卡: level,
        跑到幾秒: Math.round(g.gameTime),
        波次推進到: g.td ? `${g.td.waveIdx}/${g.td.total}` : null,
        敵人上限: g.spawner.maxEnemies,
        同時在場峰值: peakEnemies,
        峰值出現在秒: Math.round(peakEnemiesAt),
        最壞單幀renderMs: +peakRender.toFixed(1),
        最壞單幀敵人數: peakRenderEnemies,
        最壞單幀出現在秒: Math.round(peakRenderAt),
        平均renderMs: +(sumRender / Math.max(1, steps)).toFixed(1),
        取樣: samples,
      };
    },
  };
})();
