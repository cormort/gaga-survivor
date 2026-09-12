// 內容與修復的回歸驗證。
//
// tools/smoke-branches.mjs 只驗證「每個分支不會拋例外」—— 它抓不到
// 「效果根本沒發生」這類缺陷 (欄位名打錯、宣告了卻沒人讀、減傷寫成平面而非方向性)。
// 這個腳本把 code review 複核確認的每一項都用「實際數值」驗一次：
//   - 武器等級上限、突變後仍會開火
//   - 力量/幸運藥劑真的有傷害與暴擊效果
//   - 淘金狂潮是 ×2 且不會殘留、聖光結界會到期
//   - 盾衛正面減傷 vs 背後完整傷害、基隆印記 +25%
//   - 13 種敵人都有各自 ai.kind、五關巨觀地形與格線樣式互不相同
//   - 禮包碼 UI 走真實點擊、倉庫容量、結算不會重複入帳
//
// 用法：
//   npx http-server -p 8899 -s          # 另一個終端機，專案根目錄
//   node tools/verify-review-fixes.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright (PW_MODULE 可指向絕對路徑)。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL);
await page.waitForFunction(() => window.game);

const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });
  const g = window.game;
  const { WEAPONS, ENEMY_TYPES, SPECIAL_CARDS, MERCHANT_ITEMS } = await import('/js/config.js');
  const { RULE_DEFAULTS, mergeRules, LEVELS, LEVEL_ORDER } = await import('/js/levels.js');
  const { sound } = await import('/js/audio.js');
  const { save } = await import('/js/save.js');
  const { Enemy } = await import('/js/entities/Enemy.js');

  g.ui.startScreen.classList.add('hidden');
  g.start();
  g.spawner.update = () => {};
  g.weaponManager.weapons.clear();
  g.enemies.length = 0;
  g.dropItems.length = 0;

  // 1) playSelect 存在
  ok('H1 sound.playSelect 存在', typeof sound.playSelect === 'function', typeof sound.playSelect);
  let threw = false;
  try { sound.playSelect(); } catch (e) { threw = true; }
  ok('H1 呼叫 playSelect 不拋例外', !threw);

  // 2) gene_mutate 不得超過 maxLevel，且武器仍會開火
  for (const id of ['kunai', 'guardian', 'rocket', 'molotov']) {
    g.weaponManager.addOrUpgradePassive; // noop
  }
  g.weaponManager.weapons.clear();
  for (const id of ['kunai', 'rocket']) {
    g.weaponManager.weapons.set(id, { id, level: 5, isEvo: false });
  }
  for (let i = 0; i < 40; i++) g.applySpecialCard({ type: 'special', specialId: 'gene_mutate' });
  const lvls = [...g.weaponManager.weapons.values()].map((w) => w.level);
  ok('B1 gene_mutate 不超過 maxLevel', lvls.every((l) => l <= 5), 'levels=' + lvls.join(','));
  // 開火測試：滿級 + 突變後仍要產出投射物
  const target = new Enemy('walker', 200, 0, {});
  target.maxHp = target.hp = 1e9;
  g.enemies.push(target);
  g.player.x = 0; g.player.y = 0;
  g.weaponManager.projectiles.length = 0;
  g.player.critChance = 0; g.player.metaCrit = 0;
  const kunai = g.weaponManager.weapons.get('kunai');
  g.weaponManager.fireWeapon('kunai', kunai, WEAPONS.kunai, g.enemies, g.particles);
  for (let i = 0; i < 20; i++) g.weaponManager.update(1 / 60, g.enemies, g.particles);
  const alive = g.weaponManager.projectiles.filter((p) => !p.isDead).length;
  ok('B1 突變後武器仍會開火', alive > 0, 'projectiles=' + alive);

  // 3) 力量藥劑 / 幸運藥劑真的有效果
  g.enemies.length = 0; g.weaponManager.projectiles.length = 0;
  const dummy = () => {
    const e = new Enemy('chimera', 150, 0, {});
    e.maxHp = e.hp = 1e9;
    e.damageTakenMul = 1; e.kbResist = 1;
    return e;
  };
  g.player.invulnerableTimer = 1e9;
  const fireOnce = () => {
    const e = dummy();
    g.enemies.push(e);
    g.weaponManager.projectiles.length = 0;
    const w = g.weaponManager.weapons.get('kunai');
    g.weaponManager.fireWeapon('kunai', w, WEAPONS.kunai, g.enemies, g.particles);
    // 走完整 update：傷害判定在 main.js 的 checkProjectileCollisions，
    // 只跑 weaponManager.update 投射物永遠不會命中
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const dmg = e.lastDamageTaken;
    g.enemies.length = 0;
    return dmg;
  };
  const base = fireOnce();
  g.player.atkPotionTimer = 15;
  const buffed = fireOnce();
  g.player.atkPotionTimer = 0;
  ok('力量藥劑 +40% 生效', buffed > base * 1.3, `base=${base} buffed=${buffed}`);
  // 幸運藥劑：暴擊率 +25% → 大量樣本下暴擊次數顯著上升
  const critRate = (timer) => {
    g.player.luckPotionTimer = timer;
    let crits = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const e = dummy();
      g.enemies.length = 0; g.enemies.push(e);
      g.weaponManager.projectiles.length = 0;
      const w = g.weaponManager.weapons.get('kunai');
      g.weaponManager.fireWeapon('kunai', w, WEAPONS.kunai, g.enemies, g.particles);
      for (let k = 0; k < 12; k++) g.weaponManager.update(1 / 60, g.enemies, g.particles);
      if (g.weaponManager.projectiles.some((p) => p.isCrit)) crits++;
    }
    g.enemies.length = 0;
    return crits / N;
  };
  const c0 = critRate(0);
  const c1 = critRate(20);
  g.player.luckPotionTimer = 0;
  ok('幸運藥劑 +25% 暴擊生效', c1 - c0 > 0.15, `crit ${(c0 * 100).toFixed(1)}% → ${(c1 * 100).toFixed(1)}%`);

  // 4) goldMul：淘金狂潮 ×2（不是 ×4）且不會殘留
  g.metaGoldMul = 1; g._goldRushTimer = 0; g.player.luckPotionTimer = 0;
  const m0 = g.goldMul();
  g.applySpecialCard({ type: 'special', specialId: 'gold_rush' });
  const m1 = g.goldMul();
  g.applySpecialCard({ type: 'special', specialId: 'gold_rush' });
  const m2 = g.goldMul();
  g._goldRushTimer = 0;
  const m3 = g.goldMul();
  ok('M7 淘金狂潮為 ×2 且不疊加/不殘留',
    m0 === 1 && m1 === 2 && m2 === 2 && m3 === 1, `${m0}/${m1}/${m2}/${m3}`);
  g.player.luckPotionTimer = 20;
  ok('幸運藥劑金幣 ×2', g.goldMul() === 2, g.goldMul());
  g.player.luckPotionTimer = 0;

  // 5) 聖光結界不再永久有效
  g.player.sanctuaryTimer = 0.2;
  for (let i = 0; i < 30; i++) g.player.update(1 / 60, { x: 0, y: 0 });
  ok('H3 聖光結界會到期', g.player.sanctuaryTimer <= 0, g.player.sanctuaryTimer);

  // 6) 砲塔冷卻倍率 (turretCdr) 真的接上
  ok('turretCdr 進入規則預設', RULE_DEFAULTS.turretCdr === 1, RULE_DEFAULTS.turretCdr);
  const merged = mergeRules({ turretCdr: 0.65 });
  ok('turretCdr 能通過 mergeRules', merged.turretCdr === 0.65, merged.turretCdr);
  const t = g.turrets.length ? g.turrets[0] : null;
  if (t) ok('砲塔讀得到冷卻倍率', t.cdMul({ rules: { turretCdr: 0.65 } }) === 0.65, t.cdMul({ rules: { turretCdr: 0.65 } }));

  // 7) 軌道核彈的無敵真的生效
  g.player.invulnerableTimer = 0;
  g.applySpecialCard({ type: 'special', specialId: 'nuke_strike' });
  ok('H2 軌道核彈給予無敵', g.player.invulnerableTimer >= 3, g.player.invulnerableTimer);

  // 8) 方向性盾牌 + 實際傷害回報
  const front = new Enemy('warden', 0, 0, {});
  front.facingX = 1; front.facingY = 0;      // 面向 +x
  front.maxHp = front.hp = 1e6;
  front.takeDamage(100, 0, 100, 0);          // 從正面
  const dFront = front.lastDamageTaken;
  const back = new Enemy('warden', 0, 0, {});
  back.facingX = 1; back.facingY = 0;
  back.maxHp = back.hp = 1e6;
  back.takeDamage(100, 0, -100, 0);          // 從背後
  const dBack = back.lastDamageTaken;
  ok('盾衛正面減傷、背後完整傷害', dFront < dBack && dFront === 45 && dBack === 100, `front=${dFront} back=${dBack}`);

  // 9) 基隆印記
  const marked = new Enemy('walker', 0, 0, {});
  marked.maxHp = marked.hp = 1e6;
  marked.applyMark(5);
  marked.takeDamage(100, 0, 100, 0);
  ok('基隆印記 +25% 受傷', marked.lastDamageTaken === 125, marked.lastDamageTaken);

  // 10) 敵人 ai 資料齊全且真的分化
  const noAi = Object.entries(ENEMY_TYPES).filter(([, c]) => !c.ai || !c.ai.kind).map(([k]) => k);
  ok('13 種敵人都有 ai.kind', noAi.length === 0, 'missing=' + noAi.join(','));
  const kinds = Object.entries(ENEMY_TYPES).map(([k, c]) => k + ':' + c.ai.kind);
  const statOnly = ['walker', 'bat', 'brute', 'warden', 'sporeling'].map((k) => ENEMY_TYPES[k].ai.kind);
  ok('原本 5 種純數值怪已有各自行為', new Set(statOnly).size >= 4, statOnly.join('/'));
  ok('獵犬與狂奔感染者機制不同', ENEMY_TYPES.hound.ai.kind !== ENEMY_TYPES.runner.ai.kind,
    ENEMY_TYPES.hound.ai.kind + ' vs ' + ENEMY_TYPES.runner.ai.kind);
  ok('沒有舊的 dash 欄位', !ENEMY_TYPES.runner.dash && !ENEMY_TYPES.hound.dash);

  // 11) 地形：五關各有不同的宏觀結構
  const kinds5 = LEVEL_ORDER.map((id) => LEVELS[id].theme.ground.macro && LEVELS[id].theme.ground.macro.kind);
  ok('五關巨觀結構互不相同', new Set(kinds5).size === 5, kinds5.join('/'));
  const dens5 = LEVEL_ORDER.map((id) => LEVELS[id].theme.ground.density && LEVELS[id].theme.ground.density.stain);
  ok('五關汙漬密度不再寫死', new Set(dens5).size >= 4, dens5.join('/'));
  ok('五關格線樣式不同', new Set(LEVEL_ORDER.map((id) => JSON.stringify(LEVELS[id].theme.gridStyle))).size === 5);

  // 11.5) 禮包碼 UI 路徑 (實際點按鈕，不是只測 save)
  const gi = document.getElementById('input-gift-code');
  const gs = document.getElementById('gift-status');
  gi.value = 'VIP666';
  document.getElementById('btn-redeem-code').click();
  const txt = (gs.textContent || '');
  ok('禮包碼 UI 顯示成功訊息 (非 undefined)', txt.includes('🎉') && !txt.includes('undefined'), txt.slice(0, 40));
  gi.value = 'VIP666';
  document.getElementById('btn-redeem-code').click();
  ok('禮包碼 UI 顯示重複領取訊息', gs.textContent.includes('已領取') && !gs.textContent.includes('undefined'), gs.textContent.slice(0, 30));

  // 12) 禮包碼回饋
  const res = save.redeemCode('DUCK888');
  ok('禮包碼回傳 success 欄位', 'success' in res && res.success === true, JSON.stringify(res).slice(0, 60));
  ok('禮包碼已領取時回傳失敗訊息', save.redeemCode('DUCK888').success === false);

  // 13) 倉庫容量
  ok('save.getStashCap 存在', typeof save.getStashCap === 'function');
  const cap0 = save.getStashCap();
  save.data.stashCap = 60;
  ok('倉庫容量可擴充到 60', save.getStashCap() === 60, `${cap0} → ${save.getStashCap()}`);

  // 14) 結算重入保護
  g.pendingGear = [];
  const dna0 = save.data.dna;
  g.start();
  g._settling = false;
  g.handleGameOver(false);
  const dna1 = save.data.dna;
  g.handleGameOver(false);
  const dna2 = save.data.dna;
  ok('結算不會執行兩次', dna1 === dna2, `dna ${dna0} → ${dna1} → ${dna2}`);

  return out;
});

let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log(`PASS  ${r.name}${r.detail !== 'undefined' ? '  [' + r.detail + ']' : ''}`); }
  else { fail++; console.log(`FAIL  ${r.name}  [${r.detail}]`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
