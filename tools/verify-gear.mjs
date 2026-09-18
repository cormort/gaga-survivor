// 裝備系統是否真的生效（回歸契約）。
//
// 為什麼要這支：玩家回報「裝備系統好像沒有作用」，而程式碼看起來每一條都接上了 ——
// 這種「看起來有接、實際沒感覺」的問題，只能靠量測擋住，不能靠讀碼。這支把三件事
// 變成可回歸的門檻：
//   1. 十條詞條逐條實測：真的會改變對應的玩家欄位，而且幅度正確（不是「有寫就算」）。
//   2. 生命週期：裝備加成必須撐過「升級 → applyPassives 重算」，也不能被疊第二次。
//      舊寫法把加成寫進 damageMultiplier / speedMultiplier / magnetMultiplier 之後
//      立刻被 applyPassives 重算，只靠對方記得讀回 metaDmg / baseSpeedMul 才活著。
//   3. 顯示與實際一致：倉庫的「等效傷害」必須等於引擎火力公式的期望值
//      （critMul = 2 + critdmg，不是 1 + critdmg）。
//
// 用法：
//   python3 -m http.server 8899        # 另一個終端機，專案根目錄
//   node tools/verify-gear.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright（PW_MODULE 可指向絕對路徑）。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch({
  args: ['--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-rasterization'],
});
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });

  const g = window.game;
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  const { SLOT_ORDER, gearBonuses } = await import(new URL('js/items.js', document.baseURI).href);
  const { Enemy } = await import(new URL('js/entities/Enemy.js', document.baseURI).href);
  const { PASSIVES } = await import(new URL('js/config.js', document.baseURI).href);
  const PASSIVE_VEST_HP = PASSIVES.max_hp_vest.valuePerLevel;
  // 手工打造裝備：可控詞條，排除隨機性。setKey/legendaryEffect 預設不給，
  // 免得套裝或傳奇特效的加成混進「這條詞條有沒有生效」的判讀。
  // effects 是「依部位順序」指派（goggles → coat → boots），只有三格，
  // 第 4 件以後沒有位置 —— 要測某個特效就把它放進前三名，或直接指定對應部位。
  function craft(affixes, opts = {}) {
    const effects = opts.effects ? [...opts.effects] : [];
    const stash = [];
    const equipped = {};
    SLOT_ORDER.forEach((slot, idx) => {
      const it = {
        id: 't_' + slot, slot, rarity: 'mythic', ilvl: 4.25,
        setKey: opts.setKey || null,
        legendaryEffect: effects[idx] || null,
        affixes: [],
      };
      stash.push(it);
      equipped[slot] = it.id;
    });
    if (affixes) affixes.forEach((a, i) => stash[i % SLOT_ORDER.length].affixes.push(a));
    save.data.stash = stash;
    save.data.equipped = equipped;
    return { stash, equipped };
  }

  // 只傳 null 代表「完全空手」；傳 null 但帶 opts 代表「無詞條、但有套裝或傳奇特效」。
  // （這兩者必須分開 —— 先前寫成 `if (affixes)` 會讓套裝／特效那一組直接變成空手，
  //   驗證因此回報「套裝沒生效」的假紅燈。）
  function boot(affixes, opts) {
    if (affixes || opts) craft(affixes, opts);
    else { save.data.stash = []; save.data.equipped = {}; }
    g.ui.startScreen?.classList.add('hidden');
    g.start();
    g.triggerLevelUp = () => {};
    return g.player;
  }

  const snapshot = (p) => ({
    dmg: +p.damageMultiplier.toFixed(5),
    hp: p.maxHp,
    speed: +p.speedMultiplier.toFixed(5),
    magnet: +p.magnetMultiplier.toFixed(5),
    cdr: +p.cdrMultiplier.toFixed(5),
    gold: +(g.metaGoldMul * (g.runGoldMul || 1)).toFixed(5),
    crit: +p.metaCrit.toFixed(5),
    critdmg: +p.metaCritDmg.toFixed(5),
    armor: +p.metaArmor.toFixed(5),
    exp: +p.metaExp.toFixed(5),
  });

  const base = snapshot(boot(null));

  // ── 1) 十條詞條逐條實測 ─────────────────────────────────────────────
  // value 是單件數值，三件同詞條。基準值一律從「空手」快照取，不寫死常數 ——
  // 磁力就是最好的例子：鴨鴨的角色特質基礎磁力是 1.35，不是 1.0，
  // 寫死期望值會把「正常生效」誤判成紅燈。
  const CASES = [
    ['dmg', 0.10, (b) => Math.abs(b.dmg - (1 + 0.30)) < 1e-6, '火力 +30% → damageMultiplier'],
    ['hp', 20, (b) => Math.abs(b.hp - (base.hp + 60)) < 1e-6, '堅韌 +60 → maxHp'],
    ['speed', 0.05, (b) => Math.abs(b.speed - (base.speed + 0.15)) < 1e-6, '疾速 +15% → speedMultiplier'],
    ['magnet', 0.05, (b) => Math.abs(b.magnet - (base.magnet + 0.15)) < 1e-6, '磁力 +15% → magnetMultiplier'],
    ['cdr', 0.05, (b) => Math.abs(b.cdr - 0.85) < 1e-6, '冷卻 -15% → cdrMultiplier'],
    ['gold', 0.10, (b) => Math.abs(b.gold - 1.30) < 1e-6, '財運 +30% → 金幣乘數'],
    ['crit', 0.06, (b) => Math.abs(b.crit - 0.18) < 1e-6, '要害 +18%'],
    ['critdmg', 0.20, (b) => Math.abs(b.critdmg - 0.60) < 1e-6, '處決 +60%'],
    ['armor', 0.08, (b) => Math.abs(b.armor - 0.24) < 1e-6, '硬化 +24%'],
    ['exp', 0.05, (b) => Math.abs(b.exp - 0.15) < 1e-6, '領悟 +15%'],
  ];
  for (const [key, value, expect, label] of CASES) {
    const got = snapshot(boot([{ key, value }, { key, value }, { key, value }]));
    ok(`詞條「${key}」生效：${label}`, expect(got),
      `${JSON.stringify(got)}｜基準 ${JSON.stringify(base)}`);
  }

  // ── 2) 生命週期：升級重算後仍在、且不會被疊第二次 ────────────────────
  {
    // 買被動前後各量一次。重點不是「數字不變」（買被動本來就會變），
    // 而是「連續重算不會繼續往上跑」—— 累加式寫法就是在這裡爆掉。
    const SPEED_SHOES_PER_LV = PASSIVES.speed_shoes.valuePerLevel;
    const p = boot([{ key: 'speed', value: 0.05 }, { key: 'speed', value: 0.05 }, { key: 'speed', value: 0.05 }]);
    const withGear = snapshot(p);
    g.weaponManager.addOrUpgradePassive('speed_shoes');   // 內部會 applyPassives 一次
    g.weaponManager.applyPassives();
    const once = snapshot(p);
    g.weaponManager.applyPassives();
    g.weaponManager.applyPassives();
    const thrice = snapshot(p);
    ok('連續重算不會把裝備移速疊第二次（+15% 只算一次）',
      Math.abs(once.speed - thrice.speed) < 1e-6,
      `買被動後 ${once.speed} → 再重算兩次 ${thrice.speed}`);
    ok('重算後「角色基礎 + 裝備 + 被動」三份移速都還在',
      Math.abs(once.speed - (base.speed + 0.15 + SPEED_SHOES_PER_LV)) < 1e-6,
      `${once.speed} vs 期望 ${(base.speed + 0.15 + SPEED_SHOES_PER_LV).toFixed(4)}（裝備 ${withGear.speed}）`);

    const p2 = boot([{ key: 'magnet', value: 0.05 }, { key: 'magnet', value: 0.05 }, { key: 'magnet', value: 0.05 }]);
    const m1 = snapshot(p2);
    g.weaponManager.applyPassives();
    g.weaponManager.applyPassives();
    const m3 = snapshot(p2);
    ok('連續重算不會把裝備磁力疊第二次',
      Math.abs(m1.magnet - m3.magnet) < 1e-6,
      `${m1.magnet} → ${m3.magnet}（基準 ${base.magnet}）`);

    // 生命上限也要撐得住：升級買防彈護甲後，裝備的生命仍要算在內
    const p3 = boot([{ key: 'hp', value: 20 }, { key: 'hp', value: 20 }, { key: 'hp', value: 20 }]);
    const hpBefore = p3.maxHp;
    g.weaponManager.addOrUpgradePassive('max_hp_vest');
    const hpAfter = p3.maxHp;
    ok('升級買防彈護甲後，裝備的 +60 生命仍然保留（是加上去不是被覆寫）',
      hpAfter === hpBefore + PASSIVE_VEST_HP && hpAfter > base.hp,
      `空手 ${base.hp} → 裝備 ${hpBefore} → 再買護甲 ${hpAfter}`);
  }

  // ── 3) 傳奇特效與套裝 ───────────────────────────────────────────────
  {
    const p = boot(null, { setKey: 'agent' });
    ok('三件同套裝 → 激活套裝加成（火力 +22%）',
      Math.abs(p.damageMultiplier - 1.22) < 1e-6, `dmgMul=${p.damageMultiplier.toFixed(4)}`);

    // 注意：只有三個部位，effects 的第 4 件以後不會被指派。
    // 要把某個特效納入驗證，就得把它排進前三名（speed_rush 放第 4 位＝沒裝上，
    // 會得到一條永遠紅的假紅燈）。
    const p2 = boot(null, { effects: ['speed_rush', 'cdr_burst', 'pierce_all'] });
    ok('傳奇特效清單有進到玩家的 legendaryEffects',
      Array.isArray(p2.legendaryEffects) && p2.legendaryEffects.includes('pierce_all'),
      (p2.legendaryEffects || []).join('、') || '（空）');
    ok('傳奇特效的屬性加成（極限超頻 cdr +15%）有生效',
      Math.abs(p2.cdrMultiplier - 0.85) < 1e-6, `cdrMul=${p2.cdrMultiplier.toFixed(4)}`);
    ok('傳奇特效的音速突進（speed +12%）有生效',
      Math.abs(p2.speedMultiplier - 1.12) < 1e-6, `speedMul=${p2.speedMultiplier.toFixed(4)}`);
  }

  // ── 4) 實際開火傷害：真的吃到裝備的傷害倍率 ──────────────────────────
  {
    // 走真正的 update() 路徑讓武器自己開火。兩個容易踩到的點：
    //   ① fireWeapon 在沒有敵人時直接 return（要先放一隻目標）
    //   ② 苦無是 schedule() 延遲 0.07 秒才產生投射物，只跑一幀量不到 —— 要連跑幾幀。
    const fireOnce = () => {
      const wm = g.weaponManager;
      const w = [...wm.weapons.values()][0];
      if (!w) return [];
      wm.projectiles.length = 0;
      wm.delayed.length = 0;
      w.cooldownTimer = 0;
      for (let i = 0; i < 20; i++) wm.update(1 / 60, g.enemies, g.particles);
      return wm.projectiles.map((pr) => pr.damage);
    };

    const placeDummy = () => {
      g.enemies.length = 0;
      const e = new Enemy('walker', g.player.x + 120, g.player.y, {});
      e.maxHp = e.hp = 1e9;
      g.enemies.push(e);
    };

    // 關掉暴擊變數，只量「傷害倍率」這一段
    const noCrit = () => { g.player.critChance = 0; g.player.metaCrit = 0; };

    boot(null);
    noCrit();
    placeDummy();
    const plain = fireOnce();

    boot([{ key: 'dmg', value: 0.10 }, { key: 'dmg', value: 0.10 }, { key: 'dmg', value: 0.10 }]);
    noCrit();
    placeDummy();
    const buffed = fireOnce();

    const ratio = plain.length && buffed.length ? buffed[0] / plain[0] : 0;
    ok('實際開火傷害吃到裝備的 +30% 火力', Math.abs(ratio - 1.3) < 0.05,
      `無裝備 ${plain[0] ?? '—'} → 全裝備 ${buffed[0] ?? '—'}（×${ratio.toFixed(3)}）`);
  }

  // ── 5) 顯示與實際一致：倉庫的等效傷害公式 ────────────────────────────
  {
    // 造一套有暴擊與暴擊傷害的裝備，比對 UI 顯示值與引擎期望值
    const { stash, equipped } = craft([
      { key: 'crit', value: 0.20 }, { key: 'critdmg', value: 0.50 }, { key: 'dmg', value: 0.10 },
    ]);
    save.data.stash = stash;
    save.data.equipped = equipped;
    g.ui.rebuildGearView(save);
    const text = document.getElementById('gear-summary')?.textContent || '';
    const m = text.match(/×([\d.]+)/);
    const shown = m ? Number(m[1]) : NaN;

    const b = gearBonuses(stash, equipped);
    const crit = Math.min(1, b.crit || 0);
    // 引擎：finalDamage = baseDmg × damageMultiplier × (crit ? 2 + critdmg : 1)
    const engineExpected = (1 + (b.dmg || 0)) * (1 + crit * (1 + (b.critdmg || 0)));
    ok('倉庫顯示的等效傷害等於引擎公式的期望值（不再高估）',
      Number.isFinite(shown) && Math.abs(shown - engineExpected) < 0.02,
      `顯示 ×${shown} vs 引擎 ×${engineExpected.toFixed(3)}｜${text.replace(/\s+/g, ' ').slice(0, 70)}`);
  }

  // ── 6) 戰術興奮劑：單局加成不能被開局重算吃掉、也不能乘兩次 ──────────
  // 為什麼要這一條：興奮劑也是「寫進會被重算的欄位」，與裝備是同一類 bug。
  // 舊寫法把 eff.speed 加進 speedMultiplier 又加進 baseSpeedMul，並把 eff.gold
  // 乘進 metaGoldMul —— 而 metaGoldMul 開局會被天賦重算一次，等於乘了兩次。
  {
    const { SHOP_BOOSTERS } = await import(new URL('js/shop.js', document.baseURI).href);
    // 找一個同時有 speed 與 gold 的興奮劑；找不到就自己合成一個（避免測試綁死商品表）
    const synth = SHOP_BOOSTERS.hyper || SHOP_BOOSTERS.overclock || {
      id: 'test_booster', name: '測試興奮劑', effect: { speed: 0.20, gold: 1.5 },
    };
    const eff = synth.effect || {};
    const realSpeed = eff.speed || 0;
    const realGold = eff.gold || 1;

    boot(null);
    const b = snapshot(g.player);
    g.applyRunMul('speed', 1 + realSpeed);
    g.runGoldMul = (g.runGoldMul || 1) * realGold;
    g.weaponManager.applyPassives();
    const once = snapshot(g.player);
    g.weaponManager.applyPassives();   // 之後任何一次升級都不該把它沖掉或再乘一次
    g.weaponManager.applyPassives();
    const thrice = snapshot(g.player);

    ok('興奮劑的移速加成進得去，而且連續重算不會消失或加倍',
      Math.abs(once.speed - (b.speed + realSpeed)) < 1e-6 && Math.abs(thrice.speed - once.speed) < 1e-6,
      `基準 ${b.speed} → 一次 ${once.speed} → 三次 ${thrice.speed}`);
    ok('興奮劑的金幣加成只乘一次（舊版會被開局重算成平方）',
      Math.abs(thrice.gold - b.gold * realGold) < 1e-6,
      `基準 ×${b.gold} → 套用後 ×${thrice.gold}（期望 ×${(b.gold * realGold).toFixed(4)}）`);
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
