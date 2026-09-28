// 守塔模式畫面基準場景 (給 ego-browser / CDP 用的頁面內注入腳本)。
//
// 為什麼要固定場景：畫面優化最怕「改完看起來比較好」其實只是敵人站位不同。
// 這裡用固定亂數種子擺出一場有代表性的守塔戰況：
//   中央核心 + 玩家 + 三座設施 + 24 隻雜兵 (含遠程) 圍住核心，
//   外加一座正在被啃的拒馬。每次跑都一模一樣，可用來對照改前/改後。
//
// 用法 (ego-browser)：
//   await page.evaluate(SCENE_SRC)  // 先載入本檔內容
//   await page.evaluate(() => window.__gfxScene.setup())
(function () {
  const SRC = {
    // 固定亂數：兩版對比時分佈必須完全一致
    seed: 20240607,
    rnd(state) {
      state.s = (state.s * 1664525 + 1013904223) >>> 0;
      return state.s / 4294967296;
    },

    async setup(opts = {}) {
      const g = window.game;
      const mode = opts.mode || 'defense';
      const levelId = opts.level || 'street';

      // 直接進場，不要經過開始畫面的 backdrop-filter
      g.ui.startScreen.classList.add('hidden');
      g.modeId = mode;                 // main.js 讀 modeId 決定 mode
      g.levelId = levelId;
      g.start(false);

      // 等第一隻敵人出現 (spawner warm-up)，再清場自己擺
      for (let i = 0; i < 60 && !g.enemies.length; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      g.triggerLevelUp = () => {};

      const { Enemy } = await import('/js/entities/Enemy.js');
      const { Turret } = await import('/js/entities/Turret.js');

      const st = { s: SRC.seed };
      const rnd = () => SRC.rnd(st);

      // ── 清掉自然生成的東西 ──
      g.enemies.length = 0;
      g.turrets.length = 0;
      if (g.enemyProjectiles) g.enemyProjectiles.length = 0;

      const core = g.core;
      const px = core ? core.x : g.player.x;
      const py = core ? core.y : g.player.y;

      // 玩家站在核心下方 (守塔開局站位)
      g.player.x = px;
      g.player.y = py + 130;
      g.player.invulnerableTimer = 1e9;

      // ── 三座設施：機槍砲台 ×2 + 高壓電網 ×1 (守塔最常見的佈陣) ──
      const spots = [
        ['turret', px - 150, py - 40],
        ['turret', px + 150, py + 30],
        ['electric_grid', px - 60, py + 190],
        ['purifier', px + 80, py + 200],
      ];
      for (const [type, x, y] of spots) {
        const t = new Turret(x, y, type);
        t.animTimer = 0.4;
        g.turrets.push(t);
      }

      // ── 24 隻雜兵圍住核心 ──
      const types = ['walker', 'walker', 'runner', 'brute', 'spitter', 'walker', 'runner', 'bloater'];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + rnd() * 0.2;
        const d = 230 + rnd() * 130;
        const key = types[i % types.length];
        let e;
        try {
          e = new Enemy(key, px + Math.cos(a) * d, py + Math.sin(a) * d, { hp: 1, speed: 1, damage: 1, gold: 1, exp: 1 });
        } catch (err) {
          e = new Enemy('walker', px + Math.cos(a) * d, py + Math.sin(a) * d);
        }
        // 血量分散：一部分滿血、一部分半血、一部分殘血 —— 血條可讀性才驗得到
        const frac = [1, 0.62, 0.28][i % 3];
        e.hp = e.maxHp * frac;
        e.animTimer = (i % 7) * 0.12;
        if (i % 5 === 2) e.freezeTimer = 2;
        if (i % 7 === 3) e.burnTimer = 2;
        if (i % 6 === 4) e.stunTimer = 2;
        g.enemies.push(e);
      }

      // ── 兩隻正在啃核心的雜兵 (貼在核心邊上) ──
      for (let i = 0; i < 2; i++) {
        const a = -Math.PI / 2 + i * 0.9;
        const d = core ? core.radius + 22 : 60;
        const e = new Enemy('walker', px + Math.cos(a) * d, py + Math.sin(a) * d);
        e.hp = e.maxHp * 0.75;
        g.enemies.push(e);
      }

      // ── 核心打到 34%：驗「危急提示」是否看得出來 ──
      if (core) core.hp = core.maxHp * (opts.corePct == null ? 0.34 : opts.corePct);

      // 兩個 render 把一次性烘焙 (地表磚/巨觀地形/暗角) 排掉
      g.render();
      g.render();

      return {
        mode: g.mode.id,
        level: g.currentLevel && g.currentLevel.id,
        enemies: g.enemies.length,
        turrets: g.turrets.length,
        corePct: core ? +(core.hp / core.maxHp).toFixed(2) : null,
      };
    },

    // ── 效能探針：量「每幀繪圖指令 / 塗抹面積」，與機器無關 ──
    async probe({ frames = 120, dt = 1 / 60, enemies = 250 } = {}) {
      const g = window.game;
      const { Enemy } = await import('/js/entities/Enemy.js');

      // 灌到指定敵人數
      const proto = g.enemies[0];
      const st = { s: 12345 };
      const rnd = () => SRC.rnd(st);
      while (g.enemies.length < enemies) {
        const e = Object.create(Object.getPrototypeOf(proto));
        Object.assign(e, proto);
        e.x = g.player.x + (rnd() - 0.5) * 760;
        e.y = g.player.y + (rnd() - 0.5) * 760;
        e.isDead = false;
        e.hp = e.maxHp * (0.3 + rnd() * 0.7);
        e.burnTimer = 0; e.freezeTimer = 0; e.stunTimer = 0;
        g.enemies.push(e);
      }
      // 一堆半血/殘血 → 逼出最多血條繪製
      g.enemies.forEach((e, i) => { e.hp = e.maxHp * [1, 0.62, 0.28][i % 3]; });

      g.render();

      const ctx = g.ctx;
      const n = { calls: 0, gradients: 0, strings: 0, save: 0, drawImage: 0, fillText: 0, arc: 0, fillRect: 0 };
      let areaNormal = 0, areaAdditive = 0, pathR = 0;
      const orig = {};
      const count = (m, fn) => { orig[m] = ctx[m]; ctx[m] = fn; };

      for (const m of ['createRadialGradient', 'createLinearGradient']) {
        const f = ctx[m];
        ctx[m] = function (...a) { n.gradients++; n.calls++; return f.apply(this, a); };
      }
      const addArea = (px) => {
        if (ctx.globalCompositeOperation === 'lighter') areaAdditive += px;
        else areaNormal += px;
      };
      count('beginPath', function () { const f = orig.beginPath = ctx.beginPath; return function (...a) { pathR = 0; return f.apply(this, a); }; }());
      count('arc', function () { const f = ctx.arc; return function (x, y, r, ...a) { pathR = Math.max(pathR, r); n.calls++; n.arc++; return f.call(this, x, y, r, ...a); }; }());
      count('fill', function () { const f = ctx.fill; return function (...a) { n.calls++; if (pathR) addArea(Math.PI * pathR * pathR); return f.apply(this, a); }; }());
      count('stroke', function () { const f = ctx.stroke; return function (...a) { n.calls++; return f.apply(this, a); }; }());
      count('fillRect', function () { const f = ctx.fillRect; return function (x, y, w, h) { n.calls++; n.fillRect++; addArea(Math.abs(w * h)); return f.call(this, x, y, w, h); }; }());
      count('drawImage', function () { const f = ctx.drawImage; return function (...a) { n.calls++; n.drawImage++; const w = a.length >= 5 ? a[3] : a[0]?.width || 0; const h = a.length >= 5 ? a[4] : a[0]?.height || 0; if (a.length === 9) addArea(Math.abs(a[7] * a[8])); else addArea(Math.abs(w * h)); return f.apply(this, a); }; }());
      count('fillText', function () { const f = ctx.fillText; return function (...a) { n.calls++; n.fillText++; return f.apply(this, a); }; }());
      count('save', function () { const f = ctx.save; return function (...a) { n.calls++; n.save++; return f.apply(this, a); }; }());

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
      const screen = vw * vh;
      return {
        敵人: g.enemies.length,
        每幀繪圖指令: Math.round(n.calls / frames),
        每幀漸層: Math.round(n.gradients / frames),
        每幀色彩字串: Math.round(n.strings / frames),
        每幀塗抹倍率: +((areaNormal + areaAdditive) / frames / screen).toFixed(2),
        updateMs: per(updMs),
        renderMs: per(rndMs),
      };
    },
  };
  window.__gfxScene = SRC;
})();
