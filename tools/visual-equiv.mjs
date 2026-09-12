// 視覺等價驗證：把 /tmp/before 的舊模組與現行新模組同時載入頁面，
// 在相同 CTM (dpr 1.5)、相同亂數、相同時間下各畫一次，逐像素比對。
const pw = (await import(process.env.PW_MODULE)).default;
const fs = await import('node:fs');

const OLD = {
  '/js/entities/__old_ep.js': fs.readFileSync('/tmp/before/EnemyProjectile.js', 'utf8'),
  '/js/entities/__old_pr.js': fs.readFileSync('/tmp/before/Projectile.js', 'utf8'),
  '/js/systems/__old_ps.js': fs.readFileSync('/tmp/before/ParticleSystem.js', 'utf8'),
};

const browser = await pw.chromium.launch({ args: ['--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-rasterization'] });
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.route('**/js/entities/__old_*.js', (route) => {
  const u = new URL(route.request().url()).pathname;
  route.fulfill({ status: 200, contentType: 'application/javascript', body: OLD[u] });
});
await page.route('**/js/systems/__old_*.js', (route) => {
  const u = new URL(route.request().url()).pathname;
  route.fulfill({ status: 200, contentType: 'application/javascript', body: OLD[u] });
});
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto('http://127.0.0.1:8899/index.html');
await page.waitForFunction(() => window.game);

const out = await page.evaluate(async () => {
  const oldEP = await import('/js/entities/__old_ep.js');
  const newEP = await import('/js/entities/EnemyProjectile.js');
  const oldPR = await import('/js/entities/__old_pr.js');
  const newPR = await import('/js/entities/Projectile.js');
  const oldPS = await import('/js/systems/__old_ps.js');
  const newPS = await import('/js/systems/ParticleSystem.js');

  const DPR = 1.5;   // 與 main.js 的 dpr 上限一致
  function mk(w, h, alpha = 1) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * DPR);
    c.height = Math.round(h * DPR);
    const x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.globalAlpha = alpha;
    return { c, x };
  }
  function diff(a, b) {
    const da = a.x.getImageData(0, 0, a.c.width, a.c.height).data;
    const db = b.x.getImageData(0, 0, b.c.width, b.c.height).data;
    let n = 0, max = 0, sum = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]),
                         Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
      if (d > 0) n++;
      if (d > max) max = d;
      sum += d;
    }
    const px = da.length / 4;
    return { 不同像素: n, 佔比: +(n / px * 100).toFixed(3) + '%', 最大差: max, 平均差: +(sum / px).toFixed(4) };
  }

  const report = {};

  // ── A. 敵方酸液彈 (含精英色) ──
  for (const spec of [
    { name: '一般綠彈', color: '#06d6a0', glow: '#06d6a0', radius: 6 },
    { name: '精英紫彈', color: '#b5179e', glow: '#e0aaff', radius: 9 },
  ]) {
    const A = mk(160, 160), B = mk(160, 160);
    const o = new oldEP.EnemyProjectile({ ...spec, x: 0, y: 0 });
    const n = new newEP.EnemyProjectile({ ...spec, x: 0, y: 0 });
    const cam = { x: -80, y: -80 };   // 讓 screenX/screenY = 80,80
    o.draw(A.x, cam); n.draw(B.x, cam);
    report['A 酸液彈/' + spec.name] = diff(A, B);
  }

  // ── C. 火海 (凍結時間，逐像素比對) ──
  const realNow = Date.now;
  Date.now = () => 1700000000000;
  try {
    for (const spec of [
      { name: '一般火海 r=90', isEvo: false, radius: 90 },
      { name: '一般火海 r=45', isEvo: false, radius: 45 },
      { name: '藍色煉獄 r=110', isEvo: true, radius: 110 },
    ]) {
      const A = mk(300, 300), B = mk(300, 300);
      const o = new oldPR.Projectile({ type: 'fire_pool', ...spec });
      const n = new newPR.Projectile({ type: 'fire_pool', ...spec });
      o.seed = n.seed = 1.2345;   // 建構子固定用 Math.random()，這裡手動對齊相位
      const cam = { x: -150, y: -150 };
      o.draw(A.x, cam); n.draw(B.x, cam);
      report['C 火海/' + spec.name] = diff(A, B);
    }
    // 火海 ×4 灘疊在同一張畫布上（檢查 additive 疊加順序也一致）
    {
      const A = mk(400, 400), B = mk(400, 400);
      const specs = [{ radius: 90, seed: 0.1 }, { radius: 70, seed: 2.2 }, { radius: 100, seed: 4.4 }, { radius: 55, seed: 5.5 }];
      for (const s of specs) {
        const o = new oldPR.Projectile({ type: 'fire_pool', isEvo: false, radius: s.radius });
        const n = new newPR.Projectile({ type: 'fire_pool', isEvo: false, radius: s.radius });
        o.seed = n.seed = s.seed;
        o.draw(A.x, { x: -120 + s.seed * 10, y: -120 });
        n.draw(B.x, { x: -120 + s.seed * 10, y: -120 });
      }
      report['C 火海/四灘疊加'] = diff(A, B);
    }
    // 蓄能彈光暈
    for (const charge of ['burn', 'freeze', 'poison']) {
      const A = mk(200, 200), B = mk(200, 200);
      const o = new oldPR.Projectile({ type: 'kunai', charge, radius: 7, life: -0.3, vx: 1, vy: 0 });
      const n = new newPR.Projectile({ type: 'kunai', charge, radius: 7, life: -0.3, vx: 1, vy: 0 });
      o.seed = n.seed = 0.5;
      const cam = { x: -100, y: -100 };
      o.draw(A.x, cam); n.draw(B.x, cam);
      report['C 蓄能光暈/' + charge] = diff(A, B);
    }
    // 全域 alpha 不為 1 時的火星等價性
    {
      const A = mk(300, 300, 0.6), B = mk(300, 300, 0.6);
      const o0 = new oldPR.Projectile({ type: 'fire_pool', radius: 80 });
      const n0 = new newPR.Projectile({ type: 'fire_pool', radius: 80 });
      o0.seed = n0.seed = 3.1;
      o0.draw(A.x, { x: -150, y: -150 });
      n0.draw(B.x, { x: -150, y: -150 });
      report['C 火海/globalAlpha=0.6'] = diff(A, B);
    }
  } finally { Date.now = realNow; }

  // ── B. 粒子系統：同一份狀態、同一顆鏡頭 ──
  {
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const realRandom = Math.random;
    Math.random = rnd;
    const src = new oldPS.ParticleSystem();
    for (let i = 0; i < 120; i++) src.createExplosion(i * 7, i * 3, 60, i % 3 === 0);
    for (let i = 0; i < 40; i++) src.createDeathParticles(i * 5, i * 2, '#38b000', 8);
    for (let i = 0; i < 12; i++) src.createShockwave(i * 20, i * 9, 120, '#00e5ff');
    for (let i = 0; i < 30; i++) src.createHitSpark(i * 3, i * 4, '#ff6b00');
    for (let i = 0; i < 12; i++) src.createDamageText(i * 11, i * 13, i * 7, i % 3 === 0, i % 5 === 0);
    for (let i = 0; i < 8; i++) src.createHurtText(i * 9, i * 6, 13);
    for (let i = 0; i < 12; i++) src.createLightning(i * 30, i * 8, 40 + i, i % 2 === 0);
    for (let i = 0; i < 6; i++) src.createArc(i * 20, 0, i * 20 + 60, 80, '#7df8ff');
    Math.random = realRandom;

    const A = mk(600, 600), B = mk(600, 600);
    const clone = new newPS.ParticleSystem();
    clone.particles = src.particles.map((p) => ({ ...p }));
    clone.lightnings = src.lightnings.map((l) => ({ ...l, points: l.points.map((q) => ({ ...q })) }));
    // 跳字：走公開 API 塞進新的環狀緩衝，順序與舊陣列相同
    for (const dt of src.damageTexts) clone._pushDamageText({ ...dt });
    const cam = { x: 0, y: 0 };
    src.draw(A.x, cam);
    clone.draw(B.x, cam);
    report['B 粒子+跳字+落雷 全量'] = diff(A, B);
    report['B 內部狀態'] = { 舊跳字數: src.damageTexts.length, 新跳字槽: clone.damageTexts.length };

    // 環狀緩衝淘汰行為：狂塞 500 筆，比對「畫面上留下的內容」是否一致
    Math.random = rnd;
    const s2 = new oldPS.ParticleSystem();
    const n2 = new newPS.ParticleSystem();
    for (let i = 0; i < 500; i++) { s2.createDamageText(i, i, i, false, false); n2.createDamageText(i, i, i, false, false); }
    Math.random = realRandom;
    const live = (ps, isNew) => {
      const arr = [];
      const total = ps.damageTexts.length;
      const head = isNew ? ps._dtHead : 0;
      for (let k = 0; k < total; k++) {
        const d = ps.damageTexts[(head + k) % total];
        if (d.life > 0) arr.push(d.text);
      }
      return arr;
    };
    const lo = live(s2, false), ln = live(n2, true);
    report['B 淘汰順序一致'] = { 舊: lo.length, 新: ln.length, 內容相同: JSON.stringify(lo) === JSON.stringify(ln), 首筆: lo[0] + '/' + ln[0], 末筆: lo[lo.length - 1] + '/' + ln[ln.length - 1] };

    // 更新路徑等價：同一份狀態各自 update 60 幀後比對
    const u1 = new oldPS.ParticleSystem(), u2 = new newPS.ParticleSystem();
    Math.random = rnd;
    for (let i = 0; i < 60; i++) { u1.createDeathParticles(i, i, '#fff', 8); u2.createDeathParticles(i, i, '#fff', 8); }
    for (let i = 0; i < 20; i++) { u1.createDamageText(i, i, i); u2.createDamageText(i, i, i); }
    Math.random = realRandom;
    for (let f = 0; f < 60; f++) { u1.update(1 / 60); u2.update(1 / 60); }
    const pa = u1.particles.map((p) => [p.x.toFixed(6), p.y.toFixed(6), p.vx.toFixed(6), p.vy.toFixed(6)].join(','));
    const pb = u2.particles.map((p) => [p.x.toFixed(6), p.y.toFixed(6), p.vx.toFixed(6), p.vy.toFixed(6)].join(','));
    report['B update 物理一致'] = { 粒子數: [u1.particles.length, u2.particles.length], 軌跡完全相同: JSON.stringify(pa) === JSON.stringify(pb) };
    report['B 60 幀後存活跳字'] = [u1.damageTexts.length, live(u2, true).length];
  }
  return report;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
