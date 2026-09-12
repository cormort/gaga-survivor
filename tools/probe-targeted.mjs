// 針對四個檔案真正熱點的效能探針。
//
// tools/perf-probe.mjs 的五個情境裡沒有火海、沒有蓄能彈、敵方投射物也只有零星幾顆，
// 而這四個檔案的改動全部集中在：敵方酸液彈（shadowBlur）、火海漸層、粒子/跳字批次。
// 這支探針用同一套計數方式（繪圖指令 / 漸層物件 / 色彩字串 / 塗抹倍率），
// 但把變因固定成上面的熱點，並且可以切成「舊模組 vs 新模組」跑，作為 before/after。
//
//   OLD=1 node /tmp/probe-targeted.mjs    # 用 /tmp/before 的舊模組
//   node /tmp/probe-targeted.mjs          # 用現行模組
const pw = (await import(process.env.PW_MODULE)).default;
const fs = await import('node:fs');
const URL = 'http://127.0.0.1:8899/index.html';
const USE_OLD = !!process.env.OLD;
const FRAMES = 120, DT = 1 / 60;

const OLD_FILES = {
  '/js/entities/EnemyProjectile.js': fs.readFileSync('/tmp/before/EnemyProjectile.js', 'utf8'),
  '/js/entities/Projectile.js': fs.readFileSync('/tmp/before/Projectile.js', 'utf8'),
  '/js/systems/ParticleSystem.js': fs.readFileSync('/tmp/before/ParticleSystem.js', 'utf8'),
};

const SCENARIOS = [
  { id: 'bolts150', 說明: '150 顆敵方酸液彈（shadowBlur 熱點）' },
  { id: 'firepools', 說明: '6 灘活火海（含 1 灘進化）＋2 發蓄能彈' },
  { id: 'particles', 說明: '900 粒子 + 110 跳字 + 12 落雷' },
  { id: 'worst', 說明: '全部疊在一起 + 250 隻灼燒中毒怪' },
];

async function probe(page, sc) {
  return page.evaluate(async ({ sc, FRAMES, DT }) => {
    const g = window.game;
    const { Projectile } = await import('/js/entities/Projectile.js');

    g.ui.startScreen.classList.add('hidden');
    g.start();
    for (let i = 0; i < 40 && !g.enemies.length; i++) await new Promise((r) => setTimeout(r, 200));
    g.triggerLevelUp = () => {};
    // 玩家不死：死亡流程會清空 weaponManager.projectiles，火海/敵彈就量不到了
    g.player.invulnerableTimer = 1e9;
    g.player.takeDamage = () => false;

    const setup = () => {
      const proto = g.enemies[0];   // 先取樣本再清空，否則 worst 情境會抓到 undefined
      g.enemies.length = 0;
      g.enemyProjectiles.length = 0;
      g.weaponManager.projectiles.length = 0;
      g.particles.clear();
      // 固定亂數，讓新舊模組拿到完全一樣的場面
      let s = 7;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const realRandom = Math.random;
      Math.random = rnd;

      if (sc === 'worst') {
        for (let i = 0; i < 250; i++) {
          const e = Object.create(Object.getPrototypeOf(proto));
          Object.assign(e, proto);
          e.x = g.player.x + (Math.random() - 0.5) * 700;
          e.y = g.player.y + (Math.random() - 0.5) * 700;
          e.isDead = false; e.hp = 1e9; e.maxHp = 1e9;
          e.burnTimer = 999; e.poisonTimer = 999; e.poisonStacks = 5;
          g.enemies.push(e);
        }
      }
      if (sc === 'bolts150' || sc === 'worst') {
        for (let i = 0; i < 150; i++) {
          const a = (i / 150) * Math.PI * 2;
          g.spawnEnemyProjectile(g.player, {
            x: g.player.x + Math.cos(a) * 160, y: g.player.y + Math.sin(a) * 160,
            vx: 0, vy: 0, damage: 8, radius: 6, life: 999,
            color: i % 4 === 0 ? '#b5179e' : '#06d6a0',
            glow: i % 4 === 0 ? '#e0aaff' : '#06d6a0',
          });
        }
      }
      if (sc === 'firepools' || sc === 'worst') {
        for (let i = 0; i < 6; i++) {
          const p = new Projectile({
            type: 'fire_pool', x: g.player.x + (i - 2.5) * 60, y: g.player.y + 90,
            radius: 70 + i * 7, isEvo: i === 5, damage: 10, life: 999, pierce: 9999, tickInterval: 0.25,
          });
          g.weaponManager.projectiles.push(p);
        }
        for (const charge of ['burn', 'freeze']) {
          g.weaponManager.projectiles.push(new Projectile({
            type: 'kunai', charge, x: g.player.x, y: g.player.y - 60, vx: 0, vy: 0,
            radius: 7, damage: 10, life: 999, pierce: 9999,
          }));
        }
      }
      if (sc === 'particles' || sc === 'worst') {
        for (let i = 0; i < 70; i++) g.particles.createExplosion(g.player.x + (i % 10) * 30 - 150, g.player.y + ((i / 10) | 0) * 30 - 100, 60, i % 3 === 0);
        for (let i = 0; i < 30; i++) g.particles.createDeathParticles(g.player.x + i * 5, g.player.y + i * 3, '#38b000', 8);
        for (let i = 0; i < 12; i++) g.particles.createShockwave(g.player.x + i * 20, g.player.y, 120, '#00e5ff');
        for (let i = 0; i < 110; i++) g.particles.createDamageText(g.player.x + i, g.player.y + i, i * 7, i % 3 === 0, i % 5 === 0);
        for (let i = 0; i < 12; i++) g.particles.createLightning(g.player.x + i * 30, g.player.y, 40, i % 2 === 0);
      }
      Math.random = realRandom;
    };
    setup();

    // ── 與 tools/perf-probe.mjs 相同的計數器 ──
    const ctx = g.ctx;
    const n = { calls: 0, gradients: 0, strings: 0, saves: 0 };
    let areaNormal = 0, areaAdditive = 0, pathR = 0;
    const orig = {};
    const count = (m, fn) => { orig[m] = ctx[m]; ctx[m] = fn; };
    for (const m of ['createRadialGradient', 'createLinearGradient']) {
      const f = ctx[m];
      ctx[m] = function (...a) { n.gradients++; n.calls++; return f.apply(this, a); };
    }
    const addArea = (px) => { if (ctx.globalCompositeOperation === 'lighter') areaAdditive += px; else areaNormal += px; };
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
    count('strokeText', (function () { const f = ctx.strokeText; return function (...a) { n.calls++; return f.apply(this, a); }; })());
    count('save', (function () { const f = ctx.save; return function (...a) { n.calls++; n.saves++; return f.apply(this, a); }; })());
    count('restore', (function () { const f = ctx.restore; return function (...a) { n.calls++; return f.apply(this, a); }; })());
    const fsDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'fillStyle');
    Object.defineProperty(ctx, 'fillStyle', {
      set(v) { if (typeof v === 'string') n.strings++; fsDesc.set.call(this, v); },
      get() { return fsDesc.get.call(this); },
    });

    let updMs = 0, rndMs = 0;
    const refill = sc === 'particles' || sc === 'worst';
    for (let i = 0; i < FRAMES; i++) {
      // 粒子/跳字/落雷壽命不到 1 秒，開場灑一次會在量測前就死光 ——
      // 這裡持續補到上限，量到的才是滿載狀態而不是殘量。
      if (refill) {
        for (let k = 0; k < 3; k++) g.particles.createExplosion(g.player.x + ((i + k) % 10) * 30 - 150, g.player.y + (((i / 10) | 0) + k) % 8 * 30 - 100, 60, k === 0);
        for (let k = 0; k < 2; k++) g.particles.createDeathParticles(g.player.x + (i % 200), g.player.y + k * 7, '#38b000', 8);
        for (let k = 0; k < 4; k++) g.particles.createDamageText(g.player.x + ((i * 7 + k * 13) % 300) - 150, g.player.y + ((i * 3 + k * 11) % 200) - 100, 123 + k, k === 1, k === 2);
        if (i % 5 === 0) g.particles.createLightning(g.player.x + (i % 7) * 30, g.player.y, 40, i % 2 === 0);
      }
      let t = performance.now();
      g.update(DT);
      updMs += performance.now() - t;
      t = performance.now();
      g.render();
      rndMs += performance.now() - t;
    }
    const per = (v) => +(v / FRAMES).toFixed(1);
    const screen = g.vw * g.vh;
    return {
      情境: sc,
      每幀繪圖指令: Math.round(n.calls / FRAMES),
      每幀save: Math.round(n.saves / FRAMES),
      每幀漸層物件: Math.round(n.gradients / FRAMES),
      每幀色彩字串: Math.round(n.strings / FRAMES),
      每幀塗抹倍率: +((areaNormal + areaAdditive) / FRAMES / screen).toFixed(2),
      其中加色混合: +(areaAdditive / FRAMES / screen).toFixed(2),
      粒子數: g.particles.particles.length,
      火海數: g.weaponManager.projectiles.filter((p) => p.type === 'fire_pool').length,
      敵彈數: g.enemyProjectiles.length,
      updateMs: per(updMs),
      renderMs: per(rndMs),
    };
  }, { sc, FRAMES, DT });
}

const browser = await pw.chromium.launch({ args: ['--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-rasterization'] });
const rows = [];
for (const sc of SCENARIOS) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  if (USE_OLD) {
    await page.route('**/js/entities/EnemyProjectile.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: OLD_FILES['/js/entities/EnemyProjectile.js'] }));
    await page.route('**/js/entities/Projectile.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: OLD_FILES['/js/entities/Projectile.js'] }));
    await page.route('**/js/systems/ParticleSystem.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: OLD_FILES['/js/systems/ParticleSystem.js'] }));
  }
  await page.addInitScript(() => { let s = 42; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; });
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.game);
  rows.push(await probe(page, sc.id));
  await ctx.close();
}
await browser.close();
console.log((USE_OLD ? '[OLD] ' : '[NEW] ') + JSON.stringify(rows));
