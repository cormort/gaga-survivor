// 硬體無關的效能探針。
//
// 為什麼不量 fps：在 M4 這種機器上 GPU 合成太快，後期卡頓量不出來；
// 而 fps 又同時受 vsync、機器負載、瀏覽器排程影響，跨機器不可比。
//
// 改量「工作量」——每幀送出多少繪圖指令、塗了多少像素、配置了多少物件。
// 這些數字在任何機器上跑都一樣，可以直接設門檻、直接跨機器比較。
//
// 用法：
//   npx http-server -p 8899 -s          # 另一個終端機，專案根目錄
//   node tools/perf-probe.mjs                    # 跑全部情境
//   node tools/perf-probe.mjs --scenario burn5   # 只跑一個
//   node tools/perf-probe.mjs --json             # 輸出 JSON 供比對
//
// 需要 playwright。Chromium 路徑可用 CHROMIUM 環境變數覆蓋。

// PW_MODULE 可指向 playwright 的絕對路徑 (未安裝在專案內時用)
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;

const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const AS_JSON = process.argv.includes('--json');
const ONLY = (process.argv.find((a) => a.startsWith('--scenario=')) || '').split('=')[1];
const FRAMES = 120;      // 固定步進的幀數，與真實時間無關
const DT = 1 / 60;       // 固定 dt，消除時間抖動

// 情境：只改一個變因，方便歸因
const SCENARIOS = [
  { id: 'idle',     敵人: 0,   burn: false, poison: 0, 說明: '空場基準' },
  { id: 'mobs',     敵人: 250, burn: false, poison: 0, 說明: '滿場敵人、無狀態特效' },
  { id: 'burn',     敵人: 250, burn: true,  poison: 0, 說明: '滿場灼燒' },
  { id: 'burn5',    敵人: 250, burn: true,  poison: 5, 說明: '滿場灼燒 + 中毒 5 層（最壞）' },
  { id: 'drops',    敵人: 100, burn: false, poison: 0, 掉落物: 400, 說明: '大量掉落物' },
  // 三個舊情境都沒有「敵方子彈、火焰池、粒子滿載」—— 而這正是繪圖成本最集中的地方
  // （150 發會發光的酸液彈、6 灘各 6~11 束火舌的火海、900 顆粒子＋110 個傷害飄字）。
  { id: 'barrage',  敵人: 60,  burn: false, poison: 0, 額外: '彈幕火海粒子', 說明: '150 酸液彈 + 6 火海 + 粒子滿載（繪圖成本最壞）' },
  // 碰撞成本最壞：滿場敵人 × 大量「玩家的」投射物。舊情境完全沒有這一項，
  // 所以先前 O(投射物 × 敵人) 的最佳化完全量不到。
  { id: 'bullets',  敵人: 250, burn: false, poison: 0, 額外: '玩家彈幕', 說明: '250 敵人 × 120 玩家投射物（碰撞成本最壞）' },
];

async function probe(page, sc) {
  return page.evaluate(async ({ sc, FRAMES, DT }) => {
    const g = window.game;

    // 照真實流程隱藏開始畫面 —— 不隱藏會留一層全螢幕 backdrop-filter，汙染所有數據
    g.ui.startScreen.classList.add('hidden');
    g.start();
    for (let i = 0; i < 40 && !g.enemies.length; i++) await new Promise((r) => setTimeout(r, 200));

    g.triggerLevelUp = () => {};   // 彈窗會停掉 update，測量期間關掉

    const proto = g.enemies[0];
    g.enemies.length = 0;
    for (let i = 0; i < sc.敵人; i++) {
      const e = Object.create(Object.getPrototypeOf(proto));
      Object.assign(e, proto);
      e.x = g.player.x + (Math.random() - 0.5) * 700;
      e.y = g.player.y + (Math.random() - 0.5) * 700;
      e.isDead = false; e.hp = 1e9; e.maxHp = 1e9;
      e.burnTimer = sc.burn ? 999 : 0;
      e.poisonTimer = sc.poison ? 999 : 0;
      e.poisonStacks = sc.poison;
      g.enemies.push(e);
    }
    if (sc.掉落物) {
      const { DropItem } = await import('/js/entities/DropItem.js');
      for (let i = 0; i < sc.掉落物; i++) {
        const a = Math.random() * Math.PI * 2, d = 100 + Math.random() * 500;
        g.dropItems.push(new DropItem(g.player.x + Math.cos(a) * d, g.player.y + Math.sin(a) * d, 'EXP_GREEN'));
      }
    }

    if (sc.額外 === '玩家彈幕') {
      const { Projectile } = await import('/js/entities/Projectile.js');
      // 固定亂數：兩版對比時敵人與投射物的分佈必須完全一致，否則 update 時間無從比較
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (const e of g.enemies) {
        e.x = g.player.x + (rnd() - 0.5) * 700;
        e.y = g.player.y + (rnd() - 0.5) * 700;
      }
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const d = 80 + (i % 5) * 60;
        g.weaponManager.projectiles.push(new Projectile({
          type: 'kunai', weaponId: 'kunai',
          x: g.player.x + Math.cos(a) * d, y: g.player.y + Math.sin(a) * d,
          vx: 0, vy: 0, damage: 1, radius: 8,
          pierce: 9999, life: 99999, knockback: 0,
        }));
      }
    }

    if (sc.額外 === '彈幕火海粒子') {
      const { Projectile } = await import('/js/entities/Projectile.js');
      // 6 灘火海：每灘自己會畫 6~11 束火舌（燃油煉獄的數量級）
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.weaponManager.projectiles.push(new Projectile({
          type: 'fire_pool', weaponId: 'molotov',
          x: g.player.x + Math.cos(a) * 220, y: g.player.y + Math.sin(a) * 220,
          damage: 40, radius: 120, pierce: 9999, life: 9999, knockback: 0.2, tickInterval: 0.25,
        }));
      }
      // 150 發酸液彈（遊戲內上限）
      for (let i = 0; i < 150; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 220 + Math.random() * 500;
        g.spawnEnemyProjectile({ x: 0, y: 0, radius: 10 }, {
          x: g.player.x + Math.cos(a) * d, y: g.player.y + Math.sin(a) * d,
          vx: 0, vy: 0, damage: 12, radius: 6, color: '#06d6a0', glow: '#06d6a0',
        });
      }
      // 粒子與傷害飄字滿載
      for (let i = 0; i < 120; i++) {
        const px = g.player.x + (Math.random() - 0.5) * 900;
        const py = g.player.y + (Math.random() - 0.5) * 600;
        g.particles.createDamageText(px, py, 1234, i % 3 === 0, i % 5 === 0);
        g.particles.createDeathParticles(px, py, '#ff0055', 6);
      }
      g.player.invulnerableTimer = 1e9;
    }

    // ── 預熱：把「一次性」成本排除在量測之外 ────────────────
    // 地表材質磚、巨觀地形層、暗角畫布、各角色的 sprite 都是在第一次繪製時才烘焙。
    // 不先預熱的話，那幾百毫秒會被攤進 120 帧的窗期裡，量到的是「開場」而不是
    // 「穩態」—— 實測 250 隻燃燒+中毒：含烘焙 20.2ms/幀，預熱後 16.3ms/幀。
    g.render();
    g.render();

    // ── 繪圖指令與塗抹面積的計數器 ──
    const ctx = g.ctx;
    const n = { calls: 0, gradients: 0, strings: 0 };
    let areaNormal = 0, areaAdditive = 0;
    let pathR = 0;   // 目前路徑最後一次 arc 的半徑，供 fill() 估面積

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
    count('beginPath', (function () { const f = orig.beginPath = ctx.beginPath; return function (...a) { pathR = 0; return f.apply(this, a); }; })());
    count('arc', (function () { const f = ctx.arc; return function (x, y, r, ...a) { pathR = Math.max(pathR, r); n.calls++; return f.call(this, x, y, r, ...a); }; })());
    count('fill', (function () { const f = ctx.fill; return function (...a) { n.calls++; if (pathR) addArea(Math.PI * pathR * pathR); return f.apply(this, a); }; })());
    count('stroke', (function () { const f = ctx.stroke; return function (...a) { n.calls++; return f.apply(this, a); }; })());
    count('fillRect', (function () { const f = ctx.fillRect; return function (x, y, w, h) { n.calls++; addArea(Math.abs(w * h)); return f.call(this, x, y, w, h); }; })());
    count('drawImage', (function () { const f = ctx.drawImage; return function (...a) {
      n.calls++;
      const w = a.length >= 5 ? a[3] : a[0]?.width || 0;
      const h = a.length >= 5 ? a[4] : a[0]?.height || 0;
      if (a.length === 9) addArea(Math.abs(a[7] * a[8])); else addArea(Math.abs(w * h));
      return f.apply(this, a);
    }; })());
    count('fillText', (function () { const f = ctx.fillText; return function (...a) { n.calls++; return f.apply(this, a); }; })());
    count('save', (function () { const f = ctx.save; return function (...a) { n.calls++; return f.apply(this, a); }; })());

    // fillStyle 設成字串 = 每次都要解析色彩，是後期的隱性成本
    const fsDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'fillStyle');
    Object.defineProperty(ctx, 'fillStyle', {
      set(v) { if (typeof v === 'string') n.strings++; fsDesc.set.call(this, v); },
      get() { return fsDesc.get.call(this); },
    });

    // ── 固定步進：不用 rAF，消除 vsync 與排程雜訊 ──
    let updMs = 0, rndMs = 0;
    for (let i = 0; i < FRAMES; i++) {
      let t = performance.now();
      g.update(DT);
      updMs += performance.now() - t;
      t = performance.now();
      g.render();
      rndMs += performance.now() - t;
    }

    const per = (v) => +(v / FRAMES).toFixed(1);
    const vw = g.vw || window.innerWidth, vh = g.vh || window.innerHeight;
    const screen = vw * vh;
    return {
      情境: sc.id,
      說明: sc.說明,
      敵人: g.enemies.length,
      每幀繪圖指令: Math.round(n.calls / FRAMES),
      每幀漸層物件: Math.round(n.gradients / FRAMES),
      每幀色彩字串: Math.round(n.strings / FRAMES),
      每幀塗抹倍率: +((areaNormal + areaAdditive) / FRAMES / screen).toFixed(2),
      其中加色混合: +(areaAdditive / FRAMES / screen).toFixed(2),
      updateMs: per(updMs),
      renderMs: per(rndMs),
    };
  }, { sc, FRAMES, DT });
}

const browser = await pw.chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  // 強制軟體光柵化：讓快機器也會暴露填充率瓶頸，數據才跨機器可比
  args: ['--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-rasterization'],
});
const rows = [];
for (const sc of SCENARIOS) {
  if (ONLY && sc.id !== ONLY) continue;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // 固定亂數種子，讓每次跑的場面一致
  await page.addInitScript(() => {
    let s = 42;
    Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  });
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.game);
  rows.push(await probe(page, sc));
  await ctx.close();
}
await browser.close();

if (AS_JSON) console.log(JSON.stringify(rows, null, 2));
else console.table(rows);
