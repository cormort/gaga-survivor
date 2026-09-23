// 長期目標四件事：緊急復甦天賦、出擊規則卡、每日任務、圖鑑。
// 斷言的是可觀察的效果（玩家數值、存檔、DOM），不是只看有沒有拋例外。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-longterm.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch();
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

// ── 8) 緊急復甦 ────────────────────────────────────────────────────
const rev = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  const { Enemy } = await import(new URL('js/entities/Enemy.js', document.baseURI).href);
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  const kill = () => { const p = g.player; p.invulnerableTimer = 0; p.shield = 0; p.takeDamage(1e9); return p; };
  const out = {};
  save.data.talents = {};
  g.start(); out.none = kill().isDead;

  save.data.talents = { revive: 1 };
  g.start();
  let p = kill();
  out.lv1 = { dead: p.isDead, hp: p.hp, max: p.maxHp, left: p.revivesLeft, inv: p.invulnerableTimer };
  p = kill();
  out.lv1Second = p.isDead;

  save.data.talents = { revive: 2 };
  g.start();
  g.enemies.length = 0; g.enemyProjectiles.length = 0;
  const near = new Enemy('walker', g.player.x + 60, g.player.y, {}); g.enemies.push(near);
  g.enemyProjectiles.push({ x: g.player.x + 50, y: g.player.y, isDead: false });
  p = kill();
  out.lv2 = { dead: p.isDead, full: p.hp === p.maxHp, dist: Math.round(Math.hypot(near.x - p.x, near.y - p.y)), bullets: g.enemyProjectiles.length };

  // 天賦面板用文字描述逐級效果
  save.data.talents = { revive: 1 };
  g.ui.rebuildTalentView(save);
  out.ui = [...document.querySelectorAll('#talent-list .talent-row')].map((r) => r.textContent).find((t) => t.includes('緊急復甦')) || '';
  save.data.talents = {};
  return out;
});
ok('沒有復甦天賦：致死就陣亡', rev.none === true, rev.none);
ok('復甦 Lv1：致死時復活、回 50% 生命、3 秒無敵、次數用完', !rev.lv1.dead && rev.lv1.hp === Math.round(rev.lv1.max * 0.5)
  && rev.lv1.left === 0 && rev.lv1.inv >= 3, JSON.stringify(rev.lv1));
ok('復甦每局只有一次：第二次致死就陣亡', rev.lv1Second === true, rev.lv1Second);
ok('復甦 Lv2：回滿生命、震退 260 內的雜兵、清掉附近子彈', !rev.lv2.dead && rev.lv2.full && rev.lv2.dist >= 260 && rev.lv2.bullets === 0,
  JSON.stringify(rev.lv2));
ok('天賦面板顯示緊急復甦的逐級文字（不是數字）', /緊急復甦/.test(rev.ui) && /復活回滿生命並震退/.test(rev.ui), rev.ui.slice(0, 80));

// ── 6) 出擊規則卡 ──────────────────────────────────────────────────
const cards = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  const { RUN_CARD_ORDER } = await import(new URL('js/runcards.js', document.baseURI).href);
  const g = window.game;
  const snap = () => {
    const p = g.player;
    return { dmg: p.damageMultiplier, taken: p.damageTakenMul, pierce: p.bonusPierce || 0, cdr: p.cdrMultiplier,
      gold: g.runGoldMul, exp: p.metaExp, mag: p.magnetMultiplier, spd: p.speedMultiplier, hp: p.maxHp,
      ban: g.banishesLeft, skip: g.skipsLeft, reroll: g.rerollCost };
  };
  // 開始畫面的下拉真的寫進存檔
  const sel = document.getElementById('runcard-select');
  sel.value = 'midas'; sel.dispatchEvent(new Event('change'));
  const picked = save.data.runCard;
  const desc = document.getElementById('runcard-desc').textContent;

  save.data.runCard = null; g.start(); const base = snap();
  const out = { picked, desc, opts: sel.options.length, cards: {} };
  for (const id of RUN_CARD_ORDER) {
    save.data.runCard = id; g.start();
    const a = snap();
    g.weaponManager.addOrUpgradePassive('magnet');   // 升級會重算 applyPassives：效果不能被洗掉
    const b = snap();
    out.cards[id] = { a, b };
  }
  save.data.runCard = 'overload'; g.start(true);   // 每日挑戰不套用
  out.dailyCard = g.runCard;
  out.dailyDmg = g.player.damageMultiplier;
  save.data.runCard = null; g.start(true); out.dailyBaseDmg = g.player.damageMultiplier;
  return { base, ...out };
});
const B = cards.base;
const C = cards.cards;
const near = (x, y) => Math.abs(x - y) < 1e-6;
ok('開始畫面有規則卡下拉（不使用 + 6 張），選了會寫進存檔並顯示說明', cards.opts === 7 && cards.picked === 'midas' && /金幣/.test(cards.desc),
  `${cards.opts} 個選項、存檔 ${cards.picked}、${cards.desc}`);
ok('火力過載：傷害 ×1.25、承受傷害 ×1.3', near(C.overload.a.dmg, B.dmg * 1.25) && near(C.overload.a.taken, B.taken * 1.3),
  `${B.dmg}→${C.overload.a.dmg}、${B.taken}→${C.overload.a.taken}`);
ok('貫穿彈頭：穿透 +1、冷卻 ×1.15', C.piercer.a.pierce === B.pierce + 1 && near(C.piercer.a.cdr, B.cdr * 1.15), `${C.piercer.a.pierce} / ${C.piercer.a.cdr}`);
ok('黃金之手：金幣 ×2、經驗 -25%', near(C.midas.a.gold, B.gold * 2) && near(C.midas.a.exp, B.exp - 0.25), `${C.midas.a.gold} / ${C.midas.a.exp}`);
ok('引力核心：拾取 ×2、移速 ×0.9', near(C.gravity.a.mag, B.mag * 2) && near(C.gravity.a.spd, B.spd * 0.9), `${C.gravity.a.mag} / ${C.gravity.a.spd}`);
ok('時間壓縮：冷卻 ×0.8、最大生命 ×0.7', near(C.haste.a.cdr, B.cdr * 0.8) && C.haste.a.hp === Math.round(B.hp * 0.7), `${C.haste.a.cdr} / ${C.haste.a.hp}`);
ok('命運編織：封印／跳過各 6 次、刷新半價、經驗 -10%', C.fate.a.ban === B.ban + 3 && C.fate.a.skip === B.skip + 3
  && C.fate.a.reroll === Math.round(B.reroll / 2) && near(C.fate.a.exp, B.exp - 0.1), JSON.stringify(C.fate.a));
{
  const lost = Object.entries(C).filter(([, { a, b }]) => !(near(a.dmg, b.dmg) && near(a.cdr, b.cdr) && near(a.taken, b.taken)
    && near(a.gold, b.gold) && near(a.exp, b.exp) && a.pierce === b.pierce && near(a.spd, b.spd)));
  ok('升級（重算 applyPassives）後規則卡效果仍在', lost.length === 0, lost.length ? lost.map(([id]) => id).join(',') : '6 張都保留');
}
ok('每日挑戰不套用規則卡', cards.dailyCard === null && near(cards.dailyDmg, cards.dailyBaseDmg), `${cards.dailyCard} ${cards.dailyDmg}`);

// ── 7) 每日任務 ────────────────────────────────────────────────────
const quests = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  const { generateDailyQuests } = await import(new URL('js/quests.js', document.baseURI).href);
  const g = window.game;
  const out = {};
  const a = JSON.stringify(generateDailyQuests('20260923'));
  out.sameDay = a === JSON.stringify(generateDailyQuests('20260923'));
  out.diffDays = new Set(['20260923', '20260924', '20260925', '20260926'].map((d) => JSON.stringify(generateDailyQuests(d).map((q) => q.id)))).size;
  out.three = generateDailyQuests('20260923').length === 3 && new Set(generateDailyQuests('20260923').map((q) => q.id)).size === 3;

  // 用自訂任務清單測累加（不依賴當天抽到什麼）
  save.data.quests = { date: 'T', list: [
    { id: 'kills', stat: 'kills', target: 100, progress: 0, claimed: false, gold: 200, dna: 20 },
    { id: 'survive', stat: 'survive', target: 300, progress: 0, claimed: false, gold: 400, dna: 40 },
    { id: 'weapon', stat: 'weapon', weapon: 'kunai', target: 5000, progress: 0, claimed: false, gold: 700, dna: 70 },
  ] };
  save.progressQuests({ kills: 60, survive: 200, weaponDamage: { kunai: 3000 } }, 'T');
  save.progressQuests({ kills: 60, survive: 100, weaponDamage: { kunai: 3000, rocket: 9999 } }, 'T');
  const L = save.data.quests.list;
  out.acc = { kills: L[0].progress, survive: L[1].progress, weapon: L[2].progress };
  const early = save.claimQuest(1, 'T');
  save.data.gold = 0; save.data.dna = 0;
  const c0 = save.claimQuest(0, 'T');
  const c0again = save.claimQuest(0, 'T');
  out.claim = { early: early.ok, c0: c0.ok, again: c0again.ok, gold: save.data.gold, dna: save.data.dna };

  // 端到端：真的打一局 → 結算 → 當天任務進度增加、結算畫面提醒
  save.data.quests = { date: '', list: [] };
  const list = save.dailyQuests();
  list.forEach((q) => { q.stat = 'kills'; q.id = 'kills'; q.target = 5; q.progress = 0; q.weapon = undefined; });
  g.start();
  g.kills = 7;
  g.player.invulnerableTimer = 0; g.player.shield = 0; g.player.takeDamage(1e9);
  for (let i = 0; i < 5 && g.state !== 'GAME_OVER'; i++) g.update(1 / 60);
  out.e2e = save.dailyQuests().map((q) => q.progress);
  const line = document.getElementById('game-over-quest-line');
  out.line = line.classList.contains('hidden') ? '' : line.textContent;

  // 主選單「❗」與任務彈窗（z-index 要蓋過開始畫面）
  document.getElementById('btn-menu').click();
  out.badge = document.getElementById('btn-quests').classList.contains('has-claim');
  document.getElementById('btn-quests').click();
  const m = document.getElementById('quest-modal');
  const rect = m.querySelector('.modal-content').getBoundingClientRect();
  out.onTop = m.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 20));
  const btn = m.querySelector('.quest-claim:not([disabled])');
  save.data.gold = 0;
  btn?.click();
  out.uiClaimGold = save.data.gold;
  m.classList.add('hidden');
  return out;
});
ok('每日任務：同一天固定同一組、每天 3 個不重複、不同天會換', quests.sameDay && quests.three && quests.diffDays >= 3,
  `不同天 ${quests.diffDays} 種組合`);
ok('跨局累加：擊殺相加、單局存活取最長、武器傷害只算指定武器', quests.acc.kills === 100 && quests.acc.survive === 200 && quests.acc.weapon === 5000,
  JSON.stringify(quests.acc));
ok('未完成不能領、完成領一次得獎勵、不能重複領', !quests.claim.early && quests.claim.c0 && !quests.claim.again
  && quests.claim.gold === 200 && quests.claim.dna === 20, JSON.stringify(quests.claim));
ok('真的打一局結算後任務進度增加，結算畫面提醒去領', quests.e2e.every((v) => v === 5) && /完成 3 個每日任務/.test(quests.line),
  `${quests.e2e}｜${quests.line}`);
ok('主選單按鈕出現「❗」、任務彈窗在最上層、點領取有入帳', quests.badge && quests.onTop && quests.uiClaimGold > 0,
  `badge ${quests.badge}、onTop ${quests.onTop}、+${quests.uiClaimGold}🪙`);

// ── 5) 圖鑑 ────────────────────────────────────────────────────────
const codex = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  const { codexProgress, CODEX_MILESTONES } = await import(new URL('js/codex.js', document.baseURI).href);
  const { Enemy } = await import(new URL('js/entities/Enemy.js', document.baseURI).href);
  const { DropItem } = await import(new URL('js/entities/DropItem.js', document.baseURI).href);
  const g = window.game;
  const out = {};
  save.data.codex = { weapons: {}, enemies: {}, jewels: {}, claimed: [] };
  save.data.evolvedEver = [];
  out.p0 = codexProgress(save.data).found;

  // 一局：擊殺兩種敵人、撿珠寶、進化一把 → 結算
  g.ui.startScreen.classList.add('hidden');
  g.start();
  const W = g.weaponManager;
  for (const t of ['walker', 'walker', 'bat']) { const e = new Enemy(t, 0, 0, {}); g.spawnDropItem(e); }
  g.handleItemPickup(new DropItem(g.player.x, g.player.y, 'JEWEL', 'pearl'));
  W.weapons.get('kunai').level = 5;
  W.addOrUpgradePassive('atk_scroll'); W.passives.get('atk_scroll').level = 5;
  g.applyUpgradeOption({ type: 'evo', baseId: 'kunai', targetId: 'ghost_shuriken', isEvo: true });
  g.player.invulnerableTimer = 0; g.player.shield = 0; g.player.takeDamage(1e9);
  for (let i = 0; i < 5 && g.state !== 'GAME_OVER'; i++) g.update(1 / 60);
  const c = save.data.codex;
  out.rec = { kunai: c.weapons.kunai, walker: c.enemies.walker, bat: c.enemies.bat, pearl: c.jewels.pearl, evo: save.data.evolvedEver.includes('ghost_shuriken') };
  out.p1 = codexProgress(save.data);

  // 里程碑：未達不能領；湊到 25% 領一次
  const early = save.claimCodexMilestone(0);
  const cats = ['walker', 'bat', 'brute', 'boomer', 'runner', 'warden', 'spore_host', 'sporeling', 'spitter', 'hound', 'hatcher'];
  for (const t of cats) c.enemies[t] = c.enemies[t] || 1;   // 已有的擊殺數保留
  const p2 = codexProgress(save.data);
  save.data.gold = 0; save.data.dna = 0;
  const m0 = save.claimCodexMilestone(0);
  const m0again = save.claimCodexMilestone(0);
  const m1 = save.claimCodexMilestone(1);
  out.ms = { early: early.ok, pct: p2.pct, m0: m0.ok, again: m0again.ok, m1: m1.ok, gold: save.data.gold, dna: save.data.dna, want: CODEX_MILESTONES[0] };

  // 彈窗：在最上層、分頁切換、未解鎖顯示 ？？？
  document.getElementById('btn-menu').click();
  document.getElementById('btn-codex').click();
  const m = document.getElementById('codex-modal');
  const rect = m.querySelector('.modal-content').getBoundingClientRect();
  out.onTop = m.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 20));
  out.weaponsTab = document.getElementById('codex-list').textContent;
  document.querySelector('.codex-tab[data-cat="enemies"]').click();
  out.enemiesTab = document.getElementById('codex-list').textContent;
  out.progressText = document.getElementById('codex-progress').textContent;
  m.classList.add('hidden');
  return out;
});
ok('新存檔圖鑑是空的', codex.p0 === 0, codex.p0);
ok('一局結算後記下：取得的武器、各敵人擊殺數、撿到的珠寶、合成的超武', codex.rec.kunai === 1 && codex.rec.walker === 2
  && codex.rec.bat === 1 && codex.rec.pearl === 1 && codex.rec.evo, JSON.stringify(codex.rec));
ok('收集里程碑：未達不能領、到 25% 領一次得獎勵、不能重複、50% 還不能領', !codex.ms.early && codex.ms.pct >= 0.25 && codex.ms.m0
  && !codex.ms.again && !codex.ms.m1 && codex.ms.gold === codex.ms.want.gold && codex.ms.dna === codex.ms.want.dna, JSON.stringify(codex.ms));
ok('圖鑑彈窗在最上層、已解鎖顯示名稱與擊殺數、未解鎖顯示？？？', codex.onTop && /特工苦無/.test(codex.weaponsTab) && /？？？/.test(codex.weaponsTab)
  && /喪屍步兵/.test(codex.enemiesTab) && /擊殺 2/.test(codex.enemiesTab), codex.progressText);

// 舊存檔遷移：沒有 codex 的存檔補上，珠寶袋算撿過、超武的基礎武器算取得過
// 要在遊戲腳本載入「之前」改存檔：離開頁面時遊戲會把記憶體裡的存檔寫回去，
// 在 evaluate 裡改 localStorage 再 reload 會被蓋掉。addInitScript 只做一次（sessionStorage 旗標）。
await page.addInitScript(() => {
  if (sessionStorage.getItem('__mig')) return;
  sessionStorage.setItem('__mig', '1');
  const raw = JSON.parse(localStorage.getItem('gaga_save'));
  delete raw.codex; delete raw.quests;
  raw.jewels = { ring: 2 }; raw.evolvedEver = ['phase_storm'];
  localStorage.setItem('gaga_save', JSON.stringify(raw));
});
const mig = true;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);
const migrated = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  return { codex: save.data.codex, quests: save.data.quests };
});
ok('舊存檔遷移：補上圖鑑（珠寶袋→撿過、合成過的超武→基礎武器取得過）與每日任務欄位', mig && migrated.codex.jewels.ring === 2
  && migrated.codex.weapons.phase_blade === 1 && Array.isArray(migrated.codex.claimed) && Array.isArray(migrated.quests.list),
  JSON.stringify(migrated.codex));

let fail = r.filter((t) => !t.pass).length;
for (const t of r) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${r.length - r.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
