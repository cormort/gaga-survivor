// 守塔關卡（td_*）的固定基準場景：給 ego-browser 用的頁面內注入腳本。
//
// 為什麼要針對 td_*：守塔模式是「固定路線 + 分波」的關卡（js/tdlevels.js），
// 畫面上最需要讀的是「路線在哪、怪物走到哪、核心還剩多少」，跟生存者關卡完全不同。
// 這裡把波次推進到中段、沿路線擺出敵人，做出可重複對照的畫面。
//
// 用法：
//   await page.evaluate(SOURCE)
//   await page.evaluate(() => window.__tdScene.setup({ level: "td_canyon", wave: 3 }))
(function () {
  const SRC = {
    async setup({ level = 'td_canyon', wave = 3, enemyCount = null, corePct = null } = {}) {
      const g = window.game;
      g.ui.startScreen.classList.add('hidden');
      g.modeId = 'defense';
      g.levelId = level;
      g.start(false);
      for (let i = 0; i < 80 && !g.enemies.length && !g.td; i++) await new Promise((r) => setTimeout(r, 100));
      g.triggerLevelUp = () => {};

      const td = g.td;
      if (!td) return { error: 'no td instance', mode: g.mode && g.mode.id, level: g.levelId };

      // 快轉到指定波：直接叫波、跳過休息
      g.enemies.length = 0;
      while (td.waveIdx < wave && td.waveIdx < td.total) {
        td.phase = 'break';
        td.timer = 0;
        td.startWave();
        // 讓這一波全部出完（佇列清空）並往前走一段
        for (let k = 0; k < 400 && (td.queue.length || g.enemies.length < 4); k++) td.update(1 / 60);
        for (let k = 0; k < 240; k++) g.update(1 / 60);
      }

      if (enemyCount != null) {
        while (g.enemies.length > enemyCount) g.enemies.pop();
      }
      if (corePct != null && g.core) g.core.hp = g.core.maxHp * corePct;
      // 玩家移到核心附近，相機才會框到路線與核心
      g.player.invulnerableTimer = 1e9;
      g.render();
      g.render();
      return {
        mode: g.mode.id,
        level: g.levelId,
        td: { wave: td.waveIdx, total: td.total, phase: td.phase },
        enemies: g.enemies.length,
        withPath: g.enemies.filter((e) => e.path).length,
        turrets: g.turrets.length,
        corePct: g.core ? +(g.core.hp / g.core.maxHp).toFixed(2) : null,
        paths: (g.level.paths || []).length,
      };
    },

    // 把相機框到「路線中段」：路線是折線，取最長那條的中點附近
    framePath({ scale = 1 } = {}) {
      const g = window.game;
      const paths = g.level.paths || [];
      if (!paths.length) return null;
      let best = paths[0];
      let bestLen = -1;
      for (const p of paths) {
        let L = 0;
        for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        if (L > bestLen) { bestLen = L; best = p; }
      }
      const mid = best[Math.floor(best.length / 2)];
      g.player.x = mid[0];
      g.player.y = mid[1];
      g.camera.x = g.player.x - g.vw / 2;
      g.camera.y = g.player.y - g.vh / 2;
      void scale;
      g.render();
      return { mid, len: Math.round(bestLen), points: best.length };
    },

    // 把敵人沿路線排成一列（真實對局中牠們就是這樣魚貫前進）。
    // 沒有這一步，「快轉幾百幀」會讓整批怪擠在入口或全衝到核心，畫面不可重現。
    // anchor = true 時，相機框在「最長那條路線 + 核心」的中點，讓兩者同框 ——
    // 守塔的畫面重點就是「怪沿著路走向核心」，分開拍就看不到這個關係。
    lineUp({ n = 14, from = 0.15, to = 0.92, pathIdx = 0, anchor = true } = {}) {
      const g = window.game;
      const path = (g.level.paths || [])[pathIdx];
      if (!path) return null;
      // 累積弧長，才能用「路線進度 0~1」均勻擺放
      const segs = [];
      let total = 0;
      for (let i = 1; i < path.length; i++) {
        const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        segs.push({ a: path[i - 1], b: path[i], L, s0: total });
        total += L;
      }
      const at = (t) => {
        const d = Math.max(0, Math.min(1, t)) * total;
        for (const s of segs) {
          if (d <= s.s0 + s.L) {
            const k = (d - s.s0) / (s.L || 1);
            return [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k];
          }
        }
        return path[path.length - 1];
      };

      // 從既有敵人挑出樣本，其餘清掉
      const proto = g.enemies.find((e) => e.path) || g.enemies[0];
      if (!proto) return null;
      const kinds = g.enemies.filter((e) => e.path).slice(0, n);
      g.enemies.length = 0;
      for (let i = 0; i < n; i++) {
        const [x, y] = at(from + (to - from) * (i / Math.max(1, n - 1)));
        const src = kinds[i % Math.max(1, kinds.length)] || proto;
        const e = Object.create(Object.getPrototypeOf(src));
        Object.assign(e, src);
        e.x = x; e.y = y;
        e.isDead = false;
        e.path = path; e.pathIdx = 1; e.spawnTime = g.gameTime;
        e.hp = e.maxHp * [1, 0.68, 0.34][i % 3];
        e.burnTimer = 0; e.freezeTimer = 0; e.stunTimer = 0;
        g.enemies.push(e);
      }
      if (anchor) {
        // 框在「路線中後段」：比起整條路線，這裡同時看得到怪、路線與核心
        const [ax, ay] = at(0.82);
        g.player.x = ax;
        g.player.y = ay;
        g.camera.x = g.player.x - g.vw / 2;
        g.camera.y = g.player.y - g.vh / 2;
      }
      g.render();
      g.render();
      return { total: Math.round(total), placed: g.enemies.length, anchor: g.player.y };
    },

    // ── 效能探針（與 tools/gfx-scene.js 同一套量法）──
    async probe({ frames = 90, dt = 1 / 60, enemies = 250 } = {}) {
      const g = window.game;
      const proto = g.enemies[0];
      if (!proto) return { error: 'no enemies' };
      let s = 12345;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const Ctor = proto.constructor;
      void Ctor;
      while (g.enemies.length < enemies) {
        const e = Object.create(Object.getPrototypeOf(proto));
        Object.assign(e, proto);
        e.x = g.player.x + (rnd() - 0.5) * 900;
        e.y = g.player.y + (rnd() - 0.5) * 900;
        e.isDead = false;
        e.hp = e.maxHp * (0.3 + rnd() * 0.7);
        e.burnTimer = 0; e.freezeTimer = 0; e.stunTimer = 0;
        g.enemies.push(e);
      }
      g.enemies.forEach((e, i) => { e.hp = e.maxHp * [1, 0.62, 0.28][i % 3]; });
      g.render();

      const ctx = g.ctx;
      const n = { calls: 0, gradients: 0, strings: 0 };
      let areaNormal = 0, areaAdditive = 0, pathR = 0;
      const count = (m, fn) => { ctx[m] = fn; };
      for (const m of ['createRadialGradient', 'createLinearGradient']) {
        const f = ctx[m];
        ctx[m] = function (...a) { n.gradients++; n.calls++; return f.apply(this, a); };
      }
      const addArea = (px) => {
        if (ctx.globalCompositeOperation === 'lighter') areaAdditive += px;
        else areaNormal += px;
      };
      count('beginPath', (function () { const f = ctx.beginPath; return function (...a) { pathR = 0; return f.apply(this, a); }; })());
      count('arc', (function () { const f = ctx.arc; return function (x, y, r, ...a) { pathR = Math.max(pathR, r); n.calls++; return f.call(this, x, y, r, ...a); }; })());
      count('fill', (function () { const f = ctx.fill; return function (...a) { n.calls++; if (pathR) addArea(Math.PI * pathR * pathR); return f.apply(this, a); }; })());
      count('stroke', (function () { const f = ctx.stroke; return function (...a) { n.calls++; return f.apply(this, a); }; })());
      count('fillRect', (function () { const f = ctx.fillRect; return function (x, y, w, h) { n.calls++; addArea(Math.abs(w * h)); return f.call(this, x, y, w, h); }; })());
      count('drawImage', (function () { const f = ctx.drawImage; return function (...a) { n.calls++; const w = a.length >= 5 ? a[3] : a[0]?.width || 0; const h = a.length >= 5 ? a[4] : a[0]?.height || 0; if (a.length === 9) addArea(Math.abs(a[7] * a[8])); else addArea(Math.abs(w * h)); return f.apply(this, a); }; })());
      count('fillText', (function () { const f = ctx.fillText; return function (...a) { n.calls++; return f.apply(this, a); }; })());
      count('save', (function () { const f = ctx.save; return function (...a) { n.calls++; return f.apply(this, a); }; })());
      const fsDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'fillStyle');
      Object.defineProperty(ctx, 'fillStyle', {
        set(v) { if (typeof v === 'string') n.strings++; fsDesc.set.call(this, v); },
        get() { return fsDesc.get.call(this); },
      });

      let updMs = 0, rndMs = 0;
      for (let i = 0; i < frames; i++) {
        let t = performance.now();
        g.update(dt);
        updMs += performance.now() - t;
        t = performance.now();
        g.render();
        rndMs += performance.now() - t;
      }
      const per = (v) => +(v / frames).toFixed(1);
      const vw = g.vw || window.innerWidth, vh = g.vh || window.innerHeight;
      return {
        敵人: g.enemies.length,
        每幀繪圖指令: Math.round(n.calls / frames),
        每幀漸層: Math.round(n.gradients / frames),
        每幀色彩字串: Math.round(n.strings / frames),
        每幀塗抹倍率: +((areaNormal + areaAdditive) / frames / (vw * vh)).toFixed(2),
        updateMs: per(updMs),
        renderMs: per(rndMs),
      };
    },
  };
  window.__tdScene = SRC;
})();
