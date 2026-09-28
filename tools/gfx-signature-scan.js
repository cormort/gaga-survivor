// 地面簽章健檢 (ego-browser 用)：比對任兩關的地表外觀差異，並可即時開關
// 各個後製層（暗角／對比層），用來定位 D15b（任兩關地表不得相似 > 5%）的成因。
//
// 用法：
//   await page.evaluate(SOURCE)   // 載入本檔
//   await page.evaluate(() => window.__sigScan.run({ ids: ["voidroad","endless"], vignette: false }))
(function () {
  const SIG = 32;
  const CAP = { x0: 0.10, x1: 0.72, y0: 0.25, y1: 0.75 };

  const sigDiff = (a, b) => {
    let diff = 0;
    for (let i = 0; i < a.length; i += 3) {
      if (Math.abs(a[i] - b[i]) > 24 || Math.abs(a[i + 1] - b[i + 1]) > 24 || Math.abs(a[i + 2] - b[i + 2]) > 24) diff++;
    }
    return diff / (SIG * SIG);
  };

  window.__sigScan = {
    run({ ids = ['voidroad', 'endless'], vignette = true, contrast = true, decor = true } = {}) {
      const g = window.game;
      // 舊版沒有 applyEntityContrast —— 不要假設方法一定存在
      const hasContrast = typeof g.ground.applyEntityContrast === 'function';
      const origVig = g.ground.drawVignette;
      const origCon = g.ground.applyEntityContrast;
      const savedDecor = {};

      if (!vignette && origVig) g.ground.drawVignette = () => {};
      if (!contrast && hasContrast) g.ground.applyEntityContrast = () => {};

      const capture = (id) => {
        g.levelId = id;
        g.start(false);
        if (!decor) { savedDecor[id] = g.level.decor; g.level.decor = []; }
        for (let i = 0; i < 60; i++) {
          g.triggerLevelUp = () => {};
          g.pendingLevelUps = 0;
          try { g.ui.hideLevelUp && g.ui.hideLevelUp(); } catch (e) { /* ignore */ }
          g.update(1 / 60);
        }
        for (const a of [g.enemies, g.dropItems, g.enemyProjectiles, g.hazards, g.turrets, g.mercenaries, g.destructibles, g.decals]) {
          if (Array.isArray(a)) a.length = 0;
        }
        if (g.weaponManager) { g.weaponManager.projectiles.length = 0; if (g.weaponManager.delayed) g.weaponManager.delayed.length = 0; }
        if (g.particles && g.particles.clear) g.particles.clear();
        g.merchant = null;
        g.redFlash = 0;
        g.camera.shake = 0;
        const px = g.player.x, py = g.player.y;
        g.camera.x = -g.vw / 2;
        g.camera.y = -g.vh / 2;
        g.player.x = g.camera.x - 4000;
        g.player.y = g.camera.y - 4000;
        g.render();

        const cv = g.canvas;
        const small = document.createElement('canvas');
        small.width = SIG; small.height = SIG;
        const sctx = small.getContext('2d');
        sctx.drawImage(cv,
          Math.round(cv.width * CAP.x0), Math.round(cv.height * CAP.y0),
          Math.round(cv.width * (CAP.x1 - CAP.x0)), Math.round(cv.height * (CAP.y1 - CAP.y0)),
          0, 0, SIG, SIG);
        const d = sctx.getImageData(0, 0, SIG, SIG).data;
        const q = new Uint8Array(SIG * SIG * 3);
        for (let p = 0, k = 0; p < d.length; p += 4, k += 3) {
          q[k] = (d[p] >> 3) << 3;
          q[k + 1] = (d[p + 1] >> 3) << 3;
          q[k + 2] = (d[p + 2] >> 3) << 3;
        }
        g.player.x = px;
        g.player.y = py;
        return q;
      };

      const sigs = {};
      for (const id of ids) sigs[id] = capture(id);

      g.ground.drawVignette = origVig;
      if (hasContrast) g.ground.applyEntityContrast = origCon;
      for (const [id, decor] of Object.entries(savedDecor)) {
        if (g.level && g.level.id === id) g.level.decor = decor;
      }

      const out = [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          out.push({ pair: `${ids[i]}↔${ids[j]}`, diff: +(sigDiff(sigs[ids[i]], sigs[ids[j]]) * 100).toFixed(1) });
        }
      }
      return { vignette, contrast, decor, pairs: out };
    },
  };
})();
