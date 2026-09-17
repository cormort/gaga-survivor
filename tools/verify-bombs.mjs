// 全面引爆類炸彈的行為驗證（Playwright）。
//
// 回報：「全面引爆的炸彈威力要調小，或是降低機率」。原本三處都是 takeDamage(9999)，
// 撿到就全場抹除。這支在真實遊戲迴圈裡驗證改動後的行為：
//   1. 非 Boss 只吃「當前生命 60%」→ 1000 HP 的怪應該剩約 400，而不是直接死
//   2. Boss 只吃固定 180（原本 300／600）
//   3. 特殊卡「軌道核彈」與里程碑「震撼彈」走同一份 BOMB_TUNING（同樣打 60%）
//   4. 掉落率 ≤ 1.2%（由 BOMB_TUNING 讀出，不寫死）
//   5. 三秒無敵仍然生效（核彈卡的賣點不能被砍掉）
//
// 用法：
//   npx http-server -p 8899 -s
//   PW_MODULE=... node tools/verify-bombs.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}${detail ? `  [${detail}]` : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ''}`); }
};

const browser = await pw.chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0].slice(0, 120)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game, undefined, { timeout: 30000 });

const config = await page.evaluate(async () => {
  const mod = await import(new URL('js/config.js', document.baseURI).href);
  return mod.BOMB_TUNING;
});
ok('讀到 BOMB_TUNING（單一真相）', !!config && typeof config.fieldDamageRatio === 'number', JSON.stringify(config));
ok('掉落率 ≤ 1.2%（原 1.5%）', config.dropChance <= 0.012, `${(config.dropChance * 100).toFixed(1)}%`);

// 開一場，準備測試場景
const setup = await page.evaluate(async () => {
  const { Enemy } = await import(new URL('js/entities/Enemy.js', document.baseURI).href);
  const g = window.game;
  g.start(false);
  g.state = 'PLAYING';
  g.enemies.length = 0;
  const mk = (hp, isBoss) => {
    const e = new Enemy(g.player.x + 80, g.player.y, 'NORMAL', 1);
    e.isBoss = isBoss;
    e.maxHp = hp; e.hp = hp; e.alive = true;
    if (isBoss) e.hp = e.maxHp = hp;
    g.enemies.push(e);
    return e;
  };
  const grunt = mk(1000, false);
  const boss = mk(42000, true);
  return { gruntHp: grunt.hp, bossHp: boss.hp, gruntMax: grunt.maxHp };
});
console.log('   setup:', JSON.stringify(setup));

const pickup = await page.evaluate(async () => {
  const { DropItem } = await import(new URL('js/entities/DropItem.js', document.baseURI).href);
  const g = window.game;
  const item = new DropItem(g.player.x, g.player.y, 'BOMB');
  g.handleItemPickup(item);
  return g.enemies.map((e) => ({ isBoss: e.isBoss, hp: Math.round(e.hp), maxHp: e.maxHp, alive: e.alive }));
});
const grunt = pickup.find((e) => !e.isBoss);
const boss = pickup.find((e) => e.isBoss);
ok('拾取炸彈後非 Boss 沒被一擊抹除（剩約 40%）',
  grunt.alive === true && grunt.hp > 0 && Math.abs(grunt.hp - (setup.gruntHp * (1 - config.fieldDamageRatio))) <= 2,
  `hp=${grunt.hp}/${grunt.maxHp}`);
ok('Boss 只吃固定傷害', Math.abs(boss.hp - (setup.bossHp - config.bossDamage)) <= 2,
  `hp=${boss.hp}（-${setup.bossHp - boss.hp}）`);

// 軌道核彈卡：同樣是 60% + 3 秒無敵
const nuke = await page.evaluate(async () => {
  const { Enemy } = await import(new URL('js/entities/Enemy.js', document.baseURI).href);
  const g = window.game;
  g.enemies.length = 0;
  const e = new Enemy(g.player.x + 80, g.player.y, 'NORMAL', 1);
  e.maxHp = 1000; e.hp = 1000; e.alive = true;
  g.enemies.push(e);
  g.player.invulnerableTimer = 0;
  g.applySpecialCard({ specialId: 'nuke_strike' });
  return { hp: Math.round(e.hp), alive: e.alive, inv: g.player.invulnerableTimer };
});
ok('軌道核彈卡同樣只打 60%（不是清怪）', nuke.alive === true && Math.abs(nuke.hp - 400) <= 2, `hp=${nuke.hp}`);
ok('軌道核彈卡的 3 秒無敵仍然生效', nuke.inv >= 2.9, `invulnerableTimer=${nuke.inv}`);

// 里程碑震撼彈：同一份 BOMB_TUNING
const milestone = await page.evaluate(async () => {
  const { Enemy } = await import(new URL('js/entities/Enemy.js', document.baseURI).href);
  const mod = await import(new URL('js/systems/Progression.js', document.baseURI).href);
  const g = window.game;
  g.enemies.length = 0;
  const e = new Enemy(g.player.x + 80, g.player.y, 'NORMAL', 1);
  e.maxHp = 1000; e.hp = 1000; e.alive = true;
  g.enemies.push(e);
  mod.grantMilestone(g, 'bomb', '測試里程碑');
  return { hp: Math.round(e.hp), alive: e.alive };
});
ok('里程碑震撼彈同樣打 60%（三處行為一致）', milestone.alive === true && Math.abs(milestone.hp - 400) <= 2, `hp=${milestone.hp}`);

ok('過程中没有未捕捉的例外', errs.length === 0, errs.slice(0, 3).join(' | ') || '0 筆');

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
