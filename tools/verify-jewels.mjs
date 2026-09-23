// 珠寶與分解金幣：分解裝備給金幣＋DNA、珠寶撿到即入袋（陣亡／重新整理後仍在）、
// 黑市收購換金幣＋DNA、結算畫面列出本局珠寶、終極首領的珠寶直接入袋。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-jewels.mjs
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

// ── 1) 分解：金幣＋DNA ──────────────────────────────────────────────
const part1 = await page.evaluate(async () => {
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { save } = await imp('js/save.js');
  const { rollItem, salvageValue, salvageGold } = await imp('js/items.js');

  save.data.gold = 0; save.data.dna = 0; save.data.stash = []; save.data.equipped = {};
  const a = rollItem({ rarity: 'epic', ilvl: 2 });
  const b = rollItem({ rarity: 'rare', ilvl: 1 });
  const c = rollItem({ rarity: 'rare', ilvl: 1.5 });
  for (const it of [a, b, c]) save.addItem(it);
  const res = save.salvageItem(a.id);
  ok('分解單件同時給金幣與 DNA', res.ok && res.gold === salvageGold(a) && res.dna === salvageValue(a)
    && save.data.gold === res.gold && save.data.dna === res.dna, JSON.stringify(res));
  ok('分解金幣隨稀有度與物品等級成長', salvageGold(rollItem({ rarity: 'legendary', ilvl: 1 })) > salvageGold(b)
    && salvageGold(c) > salvageGold(b), `rare@1 ${salvageGold(b)}、rare@1.5 ${salvageGold(c)}`);

  save.equipItem(b.id);
  const worn = save.salvageItem(b.id);
  ok('穿著的裝備不能分解（不扣也不給）', !worn.ok && save.data.stash.some((it) => it.id === b.id), worn.reason);
  save.unequipSlot(b.slot);

  const g0 = save.data.gold;
  const bulk = save.salvageAll('rare');
  ok('批次分解也給金幣', bulk.count === 2 && bulk.gold === salvageGold(b) + salvageGold(c) && save.data.gold === g0 + bulk.gold,
    JSON.stringify(bulk));
  return out;
});
r.push(...part1);

// ── 2) 局內撿珠寶 → 陣亡 → 重新整理後仍在 ─────────────────────────────
await page.evaluate(async () => {
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { save } = await imp('js/save.js');
  const { DropItem } = await imp('js/entities/DropItem.js');
  save.data.jewels = {}; save.flush();
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  g.start();
  const p = g.player;
  for (const id of ['sapphire', 'sapphire', 'crown']) g.handleItemPickup(new DropItem(p.x, p.y, 'JEWEL', id));
  // 撿到當下就要在 localStorage 裡（還沒結算）
  window.__rawAfterPickup = JSON.parse(localStorage.getItem('gaga_save')).jewels;
  window.__runJewels = { ...g.runJewels };
  p.invulnerableTimer = 0; p.shield = 0;
  p.takeDamage(1e9);
  for (let i = 0; i < 5 && g.state !== 'GAME_OVER'; i++) g.update(1 / 60);
  window.__afterDeath = { state: g.state, box: !document.getElementById('game-over-jewel-box').classList.contains('hidden'),
    status: document.getElementById('game-over-jewel-status').textContent,
    chips: document.getElementById('game-over-jewel-items').textContent };
});
const mid = await page.evaluate(() => ({ raw: window.__rawAfterPickup, run: window.__runJewels, after: window.__afterDeath }));
ok('撿到珠寶當下就寫進存檔（尚未結算）', mid.raw && mid.raw.sapphire === 2 && mid.raw.crown === 1, JSON.stringify(mid.raw));
ok('本局珠寶有記錄', mid.run.sapphire === 2 && mid.run.crown === 1, JSON.stringify(mid.run));
ok('陣亡結算畫面列出本局珠寶與價值', mid.after.state === 'GAME_OVER' && mid.after.box && /1220/.test(mid.after.status)
  && /藍寶石 ×2/.test(mid.after.chips), `${mid.after.state}｜${mid.after.status}｜${mid.after.chips}`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);
const kept = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  return save.data.jewels;
});
ok('陣亡並重新整理後珠寶仍在', kept.sapphire === 2 && kept.crown === 1, JSON.stringify(kept));

// ── 3) 黑市收購（點 UI） ─────────────────────────────────────────────
const shop = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  save.data.gold = 0; save.data.dna = 0;
  document.getElementById('btn-shop').click();
  document.querySelector('.shop-tab[data-tab="jewels"]').click();
  const one = document.querySelector('[data-sell-jewel="sapphire"][data-count="1"]');
  one.click();
  const afterOne = { gold: save.data.gold, dna: save.data.dna, bag: { ...save.data.jewels } };
  document.querySelector('[data-sell-jewel="*"]').click();
  const afterAll = { gold: save.data.gold, dna: save.data.dna, bag: { ...save.data.jewels } };
  const again = save.sellJewels();
  return { afterOne, afterAll, again, disabled: document.querySelector('[data-sell-jewel="*"]').disabled };
});
ok('賣 1 顆藍寶石：+160 🪙 +3 🧬、剩 1 顆', shop.afterOne.gold === 160 && shop.afterOne.dna === 3 && shop.afterOne.bag.sapphire === 1,
  JSON.stringify(shop.afterOne));
ok('整袋賣出：再得 1060 🪙 + 21 🧬（累計 1220 / 24），袋子清空', shop.afterAll.gold === 1220 && shop.afterAll.dna === 24
  && Object.keys(shop.afterAll.bag).length === 0, JSON.stringify(shop.afterAll));
ok('空袋再賣會被拒絕、按鈕停用', !shop.again.ok && shop.disabled, shop.again.reason);

// ── 4) 終極首領：珠寶直接入袋（打倒即勝利，地上的撿不到） ─────────────
const fin = await page.evaluate(async () => {
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { save } = await imp('js/save.js');
  const { Enemy } = await imp('js/entities/Enemy.js');
  const { JEWEL_DROP } = await imp('js/jewels.js');
  save.data.jewels = {};
  const g = window.game;
  document.getElementById('shop-modal')?.classList.add('hidden');
  g.ui.startScreen.classList.add('hidden');
  g.start(false);
  const boss = new Enemy('walker', g.player.x + 100, g.player.y, {});
  boss.isBoss = true; boss.isFinal = true;
  const before = g.dropItems.filter((d) => d.type === 'jewel').length;
  g.rollJewelDrop(boss);
  const n = Object.values(save.data.jewels).reduce((a, b) => a + b, 0);
  return { n, want: JEWEL_DROP.finalBoss, onGround: g.dropItems.filter((d) => d.type === 'jewel').length - before };
});
ok('終極首領的珠寶直接收進珠寶袋、不掉在地上', fin.n === fin.want && fin.onGround === 0, JSON.stringify(fin));

let fail = r.filter((t) => !t.pass).length;
for (const t of r) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${r.length - r.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
