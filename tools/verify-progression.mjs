// 角色差異與裝備用處的驗證。
//
// 為什麼要這支：這兩個問題的共同點是「**感覺**」—— 而感覺不能回歸。
// 這支把兩件事變成可以量的門檻：
//   1. 裝備：用真實的 items.js 擲骰，算出一套傳奇裝備的「等效傷害」與戰鬥詞條占比，
//      並確認稀有度真的會隨物品等級提升。
//   2. 角色：逐項觸發五個角色的招牌機制（不是看程式碼，是讓它在真的遊戲物件上跑一次），
//      確認它有效、而且**幅度沒有退回無感區間**（例如鴨鴨的移動暴擊被改回 +15% 就會紅）。
//
// 用法：
//   npx http-server -p 8899 -s        # 另一個終端機，專案根目錄
//   node tools/verify-progression.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright（PW_MODULE 可指向絕對路徑）。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });

  // ── 1) 裝備：等效傷害、戰鬥占比、稀有度隨 ilvl ─────────────────────────
  const { rollItem, gearBonuses, AFFIXES, SLOT_ORDER } = await import('/js/items.js');
  const COMBAT = new Set(['dmg', 'crit', 'critdmg', 'cdr', 'armor', 'hp', 'speed']);

  const N = 1500;
  let effSum = 0;
  let combatCount = 0;
  let utilCount = 0;
  for (let i = 0; i < N; i++) {
    const stash = [];
    const equipped = {};
    for (const slot of SLOT_ORDER) {
      const it = rollItem({ slot, rarity: 'legendary', ilvl: 2.75 });
      stash.push(it);
      equipped[slot] = it.id;
    }
    const g = gearBonuses(stash, equipped);
    // 與 UI 的「等效傷害」同一條公式，對齊 WeaponManager 的 critMul = 2 + critdmg
    effSum += (1 + (g.dmg || 0)) * (1 + (g.crit || 0) * (1 + (g.critdmg || 0)));
    for (const it of stash) {
      for (const a of it.affixes) {
        const def = AFFIXES[a.key];
        if (!def) continue;
        if (COMBAT.has(def.stat)) combatCount++;
        else utilCount++;
      }
    }
  }
  const avgEff = effSum / N;
  ok('一套傳奇裝備（ilvl 2.75）的等效傷害 ≥ +40%', avgEff - 1 >= 0.4,
    `×${avgEff.toFixed(2)}（+${((avgEff - 1) * 100).toFixed(0)}%）`);
  ok('戰鬥詞條占比 ≥ 75%（不再被財運/磁力/領悟稀釋）',
    combatCount / (combatCount + utilCount) >= 0.75,
    `${((combatCount / (combatCount + utilCount)) * 100).toFixed(0)}%（戰鬥 ${combatCount} / 非戰鬥 ${utilCount}）`);

  const highRate = (ilvl) => {
    let hi = 0;
    for (let i = 0; i < 3000; i++) {
      const r = rollItem({ ilvl }).rarity;
      if (r === 'legendary' || r === 'mythic') hi++;
    }
    return hi / 3000;
  };
  const r1 = highRate(1);
  const r2 = highRate(2.75);
  ok('稀有度隨物品等級提升（打得深＝拿得到好東西）', r2 > r1 * 1.5,
    `ilvl 1：${(r1 * 100).toFixed(1)}% → ilvl 2.75：${(r2 * 100).toFixed(1)}%`);

  // ── 2) 角色招牌機制（在真的遊戲物件上跑一次）──────────────────────────
  const { CHARACTERS } = await import('/js/characters.js');
  const { Enemy } = await import('/js/entities/Enemy.js');
  const g = window.game;
  const savedCharacter = (await import('/js/save.js')).save.data.character;

  const startAs = async (id) => {
    const { save } = await import('/js/save.js');
    // g.characterId 在建構子就固定了（main.js 讀 save 一次），只改存檔不會換人 ——
    // 兩個都要設，否則測試會拿著上一個角色的 player 繼續跑（實測踩過）。
    save.data.character = id;
    g.characterId = id;
    g.ui.startScreen.classList.add('hidden');
    g.start();
    return g.player;
  };
  // 在玩家附近放一隻血很厚的怪，回傳它（用來觀測特質造成的傷害）
  const spawnNear = (radius) => {
    const e = new Enemy('walker', g.player.x + radius, g.player.y, {});
    e.maxHp = e.hp = 1e9;
    e.applyBurn = e.applyBurn || (() => {});
    g.enemies.push(e);
    return e;
  };

  // 鴨鴨：移動時大額暴擊 + 翻滾冷卻縮短；站著時兩者都消失
  {
    const p = await startAs('duck');
    p.walkCycle = 1;
    p.character.tick(0.016, g);
    const movingCrit = p.critChance;
    const movingDash = p.dashCooldownMul;
    p.walkCycle = 0;
    p.character.tick(0.016, g);
    ok('鴨鴨：移動時暴擊 +40% 以上、翻滾冷卻明顯縮短',
      movingCrit >= 0.4 && movingDash <= 0.7,
      `移動 crit=${(movingCrit * 100).toFixed(0)}% dashMul=${movingDash}`);
    ok('鴨鴨：站著不動就失去加成（必須是風箏玩法）',
      p.critChance === 0 && p.dashCooldownMul === 1,
      `靜止 crit=${p.critChance} dashMul=${p.dashCooldownMul}`);
  }

  // 蘿蔔：火痕會造成傷害，而且傷害隨存活時間成長
  {
    const p = await startAs('rabbit');
    p.walkCycle = 1;
    const e = spawnNear(10);
    const hitAt = (time) => {
      g.gameTime = time;
      p.trailTimer = 0;
      const before = e.hp;
      p.character.tick(0.016, g);
      return before - e.hp;
    };
    const d0 = hitAt(0);
    const d600 = hitAt(600);
    ok('蘿蔔：奔跑火痕會造成傷害', d0 > 0, `gameTime 0 時傷害 ${d0}`);
    ok('蘿蔔：火痕傷害隨存活時間成長（不再是固定 6 點）', d600 > d0 * 5,
      `0 秒 ${d0} → 600 秒 ${d600}`);
    g.enemies.length = 0;
  }

  // 肥啾：受擊反震傷害吃最大生命
  {
    const p = await startAs('penguin');
    const e = spawnNear(100);
    p.armorShockCd = 0;
    const before = e.hp;
    p.character.onHit(g);
    const dealt = before - e.hp;
    ok('肥啾：受擊反震會傷害周圍敵人', dealt > 0, `造成 ${dealt}`);
    ok('肥啾：反震傷害吃最大生命（≥18 + 15% maxHp）', dealt >= 18 + p.maxHp * 0.15 - 1,
      `傷害 ${dealt}，maxHp ${Math.round(p.maxHp)}（下限 ${Math.round(18 + p.maxHp * 0.15)}）`);
    ok('肥啾：減傷至少 -25%', p.damageTakenMul <= 0.75, `damageTakenMul=${p.damageTakenMul}`);
    g.enemies.length = 0;
  }

  // 喵喵：普通怪也能累積出超載，期間傷害 +25%
  {
    const p = await startAs('cat');
    const target = new Enemy('walker', p.x + 300, p.y, {});
    target.maxHp = target.hp = 1e9;
    let triggeredAt = -1;
    for (let i = 1; i <= 25; i++) {
      p.character.onKill(target, g);
      if (p.overloadTimer > 0 && triggeredAt < 0) triggeredAt = i;
    }
    ok('喵喵：普通怪累積 25 殺也能觸發超載（不再只有菁英）',
      triggeredAt > 0 && triggeredAt <= 25, `第 ${triggeredAt} 殺觸發`);
    p.character.tick(0.016, g);
    ok('喵喵：超載期間傷害 +25%', p.traitDmgMul >= 1.2, `traitDmgMul=${p.traitDmgMul}`);
    p.overloadTimer = 0;
    p.character.tick(0.016, g);
    ok('喵喵：超載結束後傷害回復', p.traitDmgMul === 1, `traitDmgMul=${p.traitDmgMul}`);
  }

  // 阿鴨：開局直接有一台砲台 + 費用/耐久
  {
    const p = await startAs('mechanic');
    const own = g.turrets.filter((t) => t.facilityType === 'turret' || !t.facilityType).length;
    ok('阿鴨：開局就贈送一座機槍砲台', own >= 1, `場上砲台 ${own} 座`);
    ok('阿鴨：設施費用 ≤ -35%、耐久 ≥ +90%',
      p.facilityCostMul <= 0.65 && p.facilityHpMul >= 1.9,
      `成本 ×${p.facilityCostMul}、耐久 ×${p.facilityHpMul}`);
  }

  // ── 3) 倉庫的「裝備總和」摘要要真的渲染出來（這是「感覺不到」的一半原因）──
  {
    const { save } = await import('/js/save.js');
    const { rollItem, SLOT_ORDER } = await import('/js/items.js');
    const stash = SLOT_ORDER.map((slot) => rollItem({ slot, rarity: 'legendary', ilvl: 2.75 }));
    save.data.stash = stash;
    save.data.equipped = Object.fromEntries(stash.map((it) => [it.slot, it.id]));
    g.ui.rebuildGearView(save);
    const el = document.getElementById('gear-summary');
    const text = el ? el.textContent : '';
    ok('倉庫會顯示裝備總和與等效傷害', /等效傷害/.test(text) && /火力/.test(text),
      text.replace(/\s+/g, ' ').slice(0, 90) || '（空的）');
  }

  // 還原存檔中的角色選擇，避免污染後續測試
  {
    const { save } = await import('/js/save.js');
    save.data.character = savedCharacter;
  }

  return out;
});

let pass = 0;
let fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log(`PASS  ${r.name}  [${r.detail}]`); }
  else { fail++; console.log(`FAIL  ${r.name}  [${r.detail}]`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
