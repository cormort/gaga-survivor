// 吸取水晶的距離：驗證基礎拾取半徑縮短到 80px，而且真的表現在行為上
// （120px 外的新水晶不會自己飛過來，60px 內的會被吸走撿起來）。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-pickup.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const r = [];
const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });

const base = await page.evaluate(() => {
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  g.start();
  const p = g.player;
  return {
    basePickupRadius: p.basePickupRadius,
    magnetMul: p.magnetMultiplier,
    pickupRadius: p.pickupRadius,
  };
});
ok('basePickupRadius 縮到 80', base.basePickupRadius === 80, `basePickupRadius=${base.basePickupRadius}`);
ok('pickupRadius = base × magnetMultiplier',
  Math.abs(base.pickupRadius - base.basePickupRadius * base.magnetMul) < 1e-6,
  `pickupRadius=${base.pickupRadius.toFixed(1)} magnetMul=${base.magnetMul}`);

// 行為驗證：把水晶放在不同距離，跑 1 秒（不做被動 drift），看它有沒有被吸走
const behavior = await page.evaluate(async () => {
  const g = window.game;
  const p = g.player;
  const { DropItem } = await import(new URL('js/entities/DropItem.js', document.baseURI).href);
  const R = p.pickupRadius;

  const run = (dist) => {
    const item = new DropItem(p.x + dist, p.y, 'EXP_GREEN');
    const x0 = item.x;
    for (let i = 0; i < 60; i++) item.update(1 / 60, p, 0);   // 1 秒，無 drift
    return {
      dist,
      isAttracted: item.isAttracted,
      collected: item.collected,
      moved: Math.abs(item.x - x0),
    };
  };

  return {
    R,
    far130: run(120),        // 舊半徑 130 的範圍內、新半徑 80 的範圍外
    near: run(Math.max(20, R - 20)),
    inside: run(R - 5),
  };
});
ok('120px 外（舊 130 會吸）的新水晶不再被吸',
  !behavior.far130.isAttracted && !behavior.far130.collected && behavior.far130.moved < 0.5,
  JSON.stringify(behavior.far130));
ok('半徑內的近距離水晶照樣被吸走',
  behavior.inside.isAttracted && behavior.inside.collected,
  JSON.stringify(behavior.inside));
ok('剛進半徑的水晶會被吸引', behavior.near.isAttracted, JSON.stringify(behavior.near));

ok('沒有 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || 'none');

await browser.close();
let failed = 0;
for (const t of r) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  —  ${t.detail}`);
}
console.log(failed === 0 ? `\n全部通過 (${r.length} 項)` : `\n${failed}/${r.length} 失敗`);
process.exit(failed === 0 ? 0 : 1);
