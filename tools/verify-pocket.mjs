// 戰術口袋道具：自動使用條件、關閉開關、數值隨時間成長、設定不被音量滑桿洗掉。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-pocket.mjs
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

const out = await page.evaluate(async () => {
  const r = [];
  const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { CONSUMABLE_ITEMS } = await imp('js/config.js');
  const { save } = await imp('js/save.js');
  const { Enemy } = await imp('js/entities/Enemy.js');
  const g = window.game;

  ok('每個道具都有 color 與自動使用說明', Object.values(CONSUMABLE_ITEMS).every((c) => c.color && c.auto),
    Object.entries(CONSUMABLE_ITEMS).filter(([, c]) => !c.color || !c.auto).map(([k]) => k).join(',') || 'all');
  ok('預設開啟自動使用', save.data.settings.autoPocket === true, save.data.settings.autoPocket);

  // 音量滑桿不能洗掉 autoPocket
  const cb = document.getElementById('auto-pocket');
  cb.checked = false; cb.dispatchEvent(new Event('change'));
  const sfx = document.getElementById('sfx-vol');
  sfx.value = 50; sfx.dispatchEvent(new Event('input'));
  ok('調音量後 autoPocket 設定仍保留', save.data.settings.autoPocket === false && save.data.settings.sfx === 0.5, JSON.stringify(save.data.settings));
  cb.checked = true; cb.dispatchEvent(new Event('change'));

  g.ui.startScreen.classList.add('hidden');
  g.start();
  const p = g.player;
  const give = (id, n = 1) => { p.pockets = [{ id, count: n }, null]; g._autoPocketTimer = 0; };
  const slot0 = () => p.pockets[0]?.id ?? null;
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(1 / 60); };
  const clear = () => { g.enemies = []; g.enemyProjectiles = []; g.dropItems = []; p.invulnerableTimer = 999; };

  clear(); give('potion'); p.hp = p.maxHp * 0.6; step(3);
  ok('恢復藥水：生命 60% 不會自動喝', slot0() === 'potion', `${slot0()} hp ${Math.round(p.hp)}`);
  p.hp = p.maxHp * 0.4; step(20); // 檢查間隔 0.25 秒
  ok('恢復藥水：生命 40% 自動喝', slot0() === null && p.hp > p.maxHp * 0.4, `${slot0()} hp ${Math.round(p.hp)}/${p.maxHp}`);

  clear(); give('potion', 2); p.hp = p.maxHp * 0.2; step(3);
  ok('兩瓶藥水不會同一刻連灌 (1.5 秒冷卻)', p.pockets[0]?.count === 1, p.pockets[0]?.count);

  save.data.settings.autoPocket = false;
  clear(); give('potion'); p.hp = p.maxHp * 0.2; step(30);
  ok('關閉自動使用後不會自動喝', slot0() === 'potion', slot0());
  save.data.settings.autoPocket = true;

  clear(); give('holy_water'); p.hp = p.maxHp;
  for (let i = 0; i < 5; i++) g.enemies.push(new Enemy('walker', p.x + 100, p.y + i * 10, {}));
  step(20);
  ok('聖水：身邊 5 隻、滿血不會用', slot0() === 'holy_water', slot0());
  for (let i = 0; i < 10; i++) g.enemies.push(new Enemy('walker', p.x - 100, p.y + i * 10, {}));
  step(20);
  ok('聖水：身邊 15 隻自動使用', slot0() === null, slot0());

  // 聖水傷害隨時間成長：8 分鐘時單隻吃到的傷害 > 基礎 260
  clear(); g.gameTime = 480;
  const dummy = new Enemy('brute', p.x + 50, p.y, { hp: 1000 }); g.enemies.push(dummy);
  const hp0 = dummy.hp; g.activateConsumable('holy_water');
  ok('聖水 8 分鐘傷害隨雜兵血量成長', hp0 - dummy.hp > 260 * 3, `${Math.round(hp0 - dummy.hp)}`);

  clear(); g.gameTime = 480; const gold0 = g.gold; g.activateConsumable('magic_ticket');
  ok('魔法門票 8 分鐘金幣 > 基礎 100', g.gold - gold0 > 250, g.gold - gold0);

  clear(); give('luck_potion'); step(20);
  ok('幸運藥水：沒有怪時不浪費', slot0() === 'luck_potion', slot0());

  // HUD 顯示 AUTO
  give('potion'); g.ui.updatePockets(p.pockets);
  const el0 = document.querySelector('.pocket-slot[data-slot="0"]');
  ok('口袋顯示 AUTO 標記', el0.classList.contains('auto'), el0.className);

  // ── 兩格口袋 ──
  const { DropItem } = await imp('js/entities/DropItem.js');
  const pick = (type) => { const d = new DropItem(p.x, p.y, type); g.handleItemPickup(d); };
  save.data.settings.autoPocket = false;
  clear(); p.pockets = [null, null];
  pick('POTION'); pick('HOLY_WATER');
  ok('兩格各放不同道具', p.pockets[0]?.id === 'potion' && p.pockets[1]?.id === 'holy_water', JSON.stringify(p.pockets));
  pick('HOLY_WATER');
  ok('同款疊到自己那一格', p.pockets[1]?.count === 2 && p.pockets[0]?.count === 1, JSON.stringify(p.pockets));
  p.hp = p.maxHp * 0.5; const hpBefore = p.hp;
  pick('ELIXIR');
  ok('兩格都被占滿時新道具即拾即用', p.hp === p.maxHp && hpBefore < p.maxHp && p.pockets.every((s) => s && s.id !== 'elixir'), `${hpBefore} → ${p.hp}`);
  const n1 = p.pockets[1].count;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
  ok('F 使用第 2 格、第 1 格不動', p.pockets[1]?.count === n1 - 1 && p.pockets[0]?.count === 1, JSON.stringify(p.pockets));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
  ok('E 用完第 1 格後第 2 格不往前補位', p.pockets[0] === null && p.pockets[1]?.id === 'holy_water', JSON.stringify(p.pockets));
  document.querySelector('.pocket-slot[data-slot="1"]').click();
  ok('點擊第 2 格使用', p.pockets[1] === null, JSON.stringify(p.pockets));
  save.data.settings.autoPocket = true;

  clear(); p.pockets = [{ id: 'luck_potion', count: 1 }, { id: 'potion', count: 1 }]; g._autoPocketTimer = 0;
  p.hp = p.maxHp * 0.3; step(20);
  ok('自動使用會檢查第 2 格 (第 1 格條件不成立)', p.pockets[1] === null && p.pockets[0]?.id === 'luck_potion', JSON.stringify(p.pockets));
  return r;
});

let fail = out.filter((t) => !t.pass).length;
for (const t of out) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${out.length - out.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
