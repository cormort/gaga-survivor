// 首領寶藏箱：一次開出 1/3/5 次真正的升級（參考吸血鬼倖存者），超武能合成就優先合成。
// 斷言的是實際升了幾級、拿到什麼，不是只看畫面有沒有出來。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-chest.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const r = [];
const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });

const res = await page.evaluate(async () => {
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { Enemy } = await imp('js/entities/Enemy.js');
  const { GAME_CONFIG, WEAPONS, PASSIVES } = await imp('js/config.js');
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  document.getElementById('chk-skip-chest').checked = true;   // 直接結算，不等動畫
  const out = {};
  const W = () => g.weaponManager;
  // 總等級數：每把武器／配件的等級加總（新拿到一件 = +1）
  const levels = () => [...W().weapons.values()].reduce((a, it) => a + it.level, 0)
    + [...W().passives.values()].reduce((a, it) => a + it.level, 0);

  // 1) 首領（非終極）掉的是首領寶藏箱，精英掉的是一般補給箱
  g.start();
  g.dropItems.length = 0;
  const boss = new Enemy('walker', g.player.x + 200, g.player.y, {}); boss.isBoss = true;
  g.spawnDropItem(boss);
  const bossChest = g.dropItems.find((d) => d.type === 'chest');
  out.bossDrop = bossChest ? { item: bossChest.item, icon: bossChest.icon, radius: bossChest.radius } : null;

  // 2) 開出的升級次數 = 實際增加的等級數；三種次數都驗
  out.counts = {};
  const table = GAME_CONFIG.BOSS_CHEST_COUNTS;
  const total = table.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  out.rollOk = true;
  for (const [n, w] of table) {
    // 次數抽選本身：落在這一格中間的亂數要抽到 n
    const mid = (acc + w / 2) / total;
    acc += w;
    if (g.rollBossChestCount(() => mid) !== n) out.rollOk = false;
    g.start();
    const before = levels();
    let shown = 0;
    const orig = g.ui.showLuckyChest.bind(g.ui);
    g.ui.showLuckyChest = (count, rewards, cb, opts) => { shown = rewards.length; out.title = opts && opts.title; return orig(count, rewards, cb, opts); };
    try { g.openBossChest(n); } finally { g.ui.showLuckyChest = orig; }
    out.counts[n] = { gained: levels() - before, shown, state: g.state };
  }

  // 3) 超武優先：苦無滿級 + 強力卷軸滿級 → 第一個獎勵就是合成幽靈手裏劍
  g.start();
  W().weapons.get('kunai').level = WEAPONS.kunai.maxLevel;
  W().addOrUpgradePassive('atk_scroll'); W().passives.get('atk_scroll').level = PASSIVES.atk_scroll.maxLevel;
  let rewards = [];
  const orig = g.ui.showLuckyChest.bind(g.ui);
  g.ui.showLuckyChest = (count, rw, cb, opts) => { rewards = rw; return orig(count, rw, cb, opts); };
  g.openBossChest(5);
  g.ui.showLuckyChest = orig;
  out.evo = { first: rewards[0] && rewards[0].desc, has: W().weapons.has('ghost_shuriken'), kunaiGone: !W().weapons.has('kunai'), evoRun: g._evosThisRun };

  // 4) 封印的武器／配件不會從寶箱開出（開 30 箱）
  g.start();
  for (const id of Object.keys(WEAPONS)) if (!WEAPONS[id].isEvo && id !== 'kunai') g.banished.add(id);
  for (const id of Object.keys(PASSIVES)) if (id !== 'magnet') g.banished.add(id);
  let leak = 0;
  for (let i = 0; i < 30; i++) {
    g.openBossChest();
    for (const id of W().weapons.keys()) if (id !== 'kunai' && id !== 'ghost_shuriken') leak++;
    for (const id of W().passives.keys()) if (id !== 'magnet') leak++;
  }
  out.banishLeak = leak;
  out.afterBanish = { kunai: W().weapons.get('kunai')?.level, magnet: W().passives.get('magnet')?.level };

  // 5) 全部滿級：退回金幣，不當機、回到戰鬥
  const gold0 = g.gold;
  g.openBossChest(5);
  out.fallback = { gold: g.gold - gold0, state: g.state };

  // 6) 一般補給箱（精英掉的）維持原本的雜物輪盤與標題
  g.start();
  document.getElementById('chk-skip-chest').checked = false;
  g.openLuckyChest();
  out.normalTitle = document.querySelector('#lucky-chest-modal .chest-title').textContent;
  document.getElementById('lucky-chest-modal').classList.add('hidden');
  g.state = 'PLAYING';
  // 首領箱畫面：標題換成首領寶藏箱、逐張翻出、確認後回到戰鬥
  g.openBossChest();
  out.bossTitle = document.querySelector('#lucky-chest-modal .chest-title').textContent;
  out.bossSub = document.getElementById('chest-subtitle').textContent;
  return out;
});

ok('首領（非終極）掉落首領寶藏箱：王冠圖示、比一般箱大', res.bossDrop && res.bossDrop.item === 'boss' && res.bossDrop.icon === '👑'
  && res.bossDrop.radius > 14, JSON.stringify(res.bossDrop));
ok('開箱次數照權重表抽（1／3／5 各自的區間）', res.rollOk, res.rollOk);
for (const [n, c] of Object.entries(res.counts)) {
  ok(`開出 ${n} 次：實際升了 ${n} 級、畫面列 ${n} 張、回到戰鬥`, c.gained === Number(n) && c.shown === Number(n) && c.state === 'PLAYING',
    JSON.stringify(c));
}
ok('超武優先：配方湊齊時第一個獎勵就是合成超武（基礎武器被吃掉）', /超武進化/.test(res.evo.first) && res.evo.has && res.evo.kunaiGone
  && res.evo.evoRun === 1, JSON.stringify(res.evo));
ok('封印的武器／配件不會從寶箱開出（30 箱）', res.banishLeak === 0 && res.afterBanish.kunai > 1, `外洩 ${res.banishLeak}｜${JSON.stringify(res.afterBanish)}`);
ok('全部滿級時退回金幣、不當機並回到戰鬥', res.fallback.gold > 0 && res.fallback.state === 'PLAYING', JSON.stringify(res.fallback));
ok('一般補給箱維持原標題；首領箱換成「首領寶藏箱」並顯示開出幾次', /特工幸運補給/.test(res.normalTitle) && /首領寶藏箱/.test(res.bossTitle)
  && /開出 \d 次升級/.test(res.bossSub), `${res.normalTitle}｜${res.bossTitle}｜${res.bossSub}`);

let fail = r.filter((t) => !t.pass).length;
for (const t of r) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${r.length - r.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
