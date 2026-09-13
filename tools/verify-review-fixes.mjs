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
//   - 倉庫容量、結算不會重複入帳、型態效果是否真的由 stats 驅動
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
  const { WEAPONS, ENEMY_TYPES, SPECIAL_CARDS, MERCHANT_ITEMS, CONSUMABLE_ITEMS } = await import('/js/config.js');
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

  // ── 型態系統：18 個 stats 物件必須真的有讀者 ────────────────────
  const setAspect = (fam, id) => {
    g.player.weaponAspects = { ...(g.player.weaponAspects || {}), [fam]: id };
  };
  const cdFor = (wid, fam, aspectId) => {
    setAspect(fam, aspectId);
    g.weaponManager.weapons.clear();
    g.weaponManager.addWeapon(wid);
    const it = g.weaponManager.weapons.get(wid);
    g.player.cdrMultiplier = 1;
    g.player.overloadTimer = 0;
    it.cooldownTimer = 0;
    g.enemies.length = 0;                    // 冷卻重設與有沒有敵人無關
    g.weaponManager.update(1 / 60, g.enemies, g.particles);
    return it.cooldownTimer;
  };
  const cdZag = cdFor('kunai', 'kunai', 'zagreus');
  const cdNem = cdFor('kunai', 'kunai', 'nemesis');
  ok('苦無札格型態 cdMul 0.70 生效', Math.abs(cdZag / cdNem - 0.70) < 0.02, `zag=${cdZag.toFixed(3)} nem=${cdNem.toFixed(3)}`);
  const cdHestia = cdFor('rocket', 'rocket', 'hestia');
  const cdEris = cdFor('rocket', 'rocket', 'eris');
  ok('火箭赫斯提亞 cdMul 1.15 生效', Math.abs(cdHestia / cdEris - 1.15) < 0.02, `hestia=${cdHestia.toFixed(3)} eris=${cdEris.toFixed(3)}`);
  // 苦無家族：進化武器要跟著 kunai 型態，而不是永遠 zagreus
  setAspect('kunai', 'zagreus');
  const famEvo = g.weaponManager.aspectOf('ghost_shuriken');
  const famBlade = g.weaponManager.aspectOf('phase_blade');
  ok('進化武器跟著自己的型態家族', famEvo.fam === 'kunai' && famEvo.stats.cdMul === 0.70 && famBlade.stats.cdMul === 0.70,
    `fam=${famEvo.fam} cdMul=${famEvo.stats.cdMul}`);

  // 基隆印記：加成值必須來自 stats（用 0.4 反證不是硬寫 0.25）
  const markE = new Enemy('walker', 0, 0, {});
  markE.maxHp = markE.hp = 1e6;
  markE.applyMark(5, 0.4);
  markE.takeDamage(100, 0, 100, 0);
  ok('印記加成來自型態資料', markE.lastDamageTaken === 140, markE.lastDamageTaken);

  // 宙斯連鎖數：chainShock 必須收到 4（先前第 4 個參數被丟掉）
  let chainJumps = null;
  const origChain = g.chainShock;
  g.chainShock = (o, d, w, j) => { chainJumps = j; };
  setAspect('lightning', 'zeus');
  g.weaponManager.weapons.clear();
  g.weaponManager.addWeapon('lightning');
  g.enemies.length = 0;
  const zTarget = new Enemy('chimera', 120, 0, {});
  zTarget.maxHp = zTarget.hp = 1e9;
  g.enemies.push(zTarget);
  g.weaponManager.projectiles.length = 0;
  g.weaponManager.fireWeapon('lightning', g.weaponManager.weapons.get('lightning'), WEAPONS.lightning, g.enemies, g.particles);
  for (let i = 0; i < 40; i++) g.weaponManager.update(1 / 60, g.enemies, g.particles);
  g.chainShock = origChain;
  ok('宙斯連鎖數來自型態資料', chainJumps === 4, 'jumps=' + chainJumps);

  // 索爾眩暈秒數
  setAspect('lightning', 'thor');
  g.enemies.length = 0;
  const thTarget = new Enemy('chimera', 120, 0, {});
  thTarget.maxHp = thTarget.hp = 1e9;
  g.enemies.push(thTarget);
  g.weaponManager.projectiles.length = 0;
  g.weaponManager.fireWeapon('lightning', g.weaponManager.weapons.get('lightning'), WEAPONS.lightning, g.enemies, g.particles);
  for (let i = 0; i < 40; i++) g.weaponManager.update(1 / 60, g.enemies, g.particles);
  ok('索爾眩暈 1.2 秒生效', thTarget.stunTimer > 0.9 && thTarget.stunTimer <= 1.21, thTarget.stunTimer.toFixed(2));

  // 燃燒瓶札格：火海跳頻 tickRateMul 0.70
  setAspect('molotov', 'zagreus');
  g.weaponManager.weapons.clear();
  g.weaponManager.addWeapon('molotov');
  g.enemies.length = 0;
  const mTarget = new Enemy('chimera', 150, 0, {});
  mTarget.maxHp = mTarget.hp = 1e9;
  g.enemies.push(mTarget);
  g.weaponManager.projectiles.length = 0;
  g.weaponManager.fireWeapon('molotov', g.weaponManager.weapons.get('molotov'), WEAPONS.molotov, g.enemies, g.particles);
  const pool = g.weaponManager.projectiles.find((p) => p.type === 'fire_pool');
  ok('燃燒瓶跳頻來自型態資料', !!pool && Math.abs(pool.tickInterval - 0.175) < 0.001, pool ? pool.tickInterval : 'no pool');

  // 守護輪盤混沌型態：飛盤以遊戲時間每 2 秒發射
  setAspect('guardian', 'chaos');
  g.weaponManager.weapons.clear();
  g.weaponManager.addWeapon('guardian');
  g.weaponManager.projectiles.length = 0;
  g.enemies.length = 0;
  for (let i = 0; i < 200; i++) g.weaponManager.update(1 / 60, g.enemies, g.particles);
  const saw = g.weaponManager.projectiles.filter((p) => p.type === 'saw' && !p.isDead).length;
  ok('混沌型態會發射飛盤', saw > 0, 'saw=' + saw);

  // 足球：塔納托斯傷害成長 + 第 5 次命中引爆；阿基里斯疊跑速；關羽冰凍 1.5 秒
  const soccerRun = (aspectId) => {
    setAspect('soccer', aspectId);
    g.weaponManager.weapons.clear();
    g.weaponManager.addWeapon('soccer');
    g.enemies.length = 0;
    // 確定性夾具：把敵人排成一列、強制球往 +x 飛 —— 否則球的初始方向是亂數，
    // 「第 5 次命中引爆」這種累積條件會變成隨機通過。
    const line = [];
    for (let k = 1; k <= 6; k++) {
      const e = new Enemy('chimera', 40 + k * 55, 0, {});
      e.maxHp = e.hp = 1e9;
      e.kbResist = 1;
      g.enemies.push(e);
      line.push(e);
    }
    g.player.x = 0; g.player.y = 0;
    g.player.invulnerableTimer = 1e9;
    g.player.achillesSpeedStacks = 0;
    g.weaponManager.projectiles.length = 0;
    g.weaponManager.fireWeapon('soccer', g.weaponManager.weapons.get('soccer'), WEAPONS.soccer, g.enemies, g.particles);
    // 冷卻調長，避免測試期間射出第二顆球干擾觀測
    g.weaponManager.weapons.get('soccer').cooldownTimer = 999;
    for (const p of g.weaponManager.projectiles) {
      if (p.type !== 'soccer') continue;
      // 絕對方向：球的初始角度是亂數，若照原方向正規化，有一半機率往 -x 飛、
      // 整條測試就變成隨機通過
      p.vx = 300;
      p.vy = 0;
      p.x = g.player.x; p.y = g.player.y;
    }
    const seq = [];
    let imploded = false;
    let maxBounces = 0;
    let freezeSeen = 0;
    let last = 0;
    for (let i = 0; i < 300; i++) {
      g.update(1 / 60);
      g.weaponManager.weapons.get('soccer').cooldownTimer = 999;
      for (const p of g.weaponManager.projectiles) {
        if (p.type !== 'soccer') continue;
        p.vx = 300;   // 維持 +x，避免撞牆反彈後亂跑
        p.vy = 0;
      }
      for (const p of g.weaponManager.projectiles) {
        if (p.type !== 'soccer') continue;
        maxBounces = Math.max(maxBounces, p.thanatosBounces || 0);
        if (p.thanatosBounces >= 5) imploded = true;
      }
      freezeSeen = Math.max(freezeSeen, line.reduce((mx, e) => Math.max(mx, e.freezeTimer || 0), 0));
      const maxDmg = g.enemies.reduce((mx, e) => Math.max(mx, e.lastDamageTaken || 0), 0);
      if (maxDmg !== last) { seq.push(maxDmg); last = maxDmg; }
    }
    return { seq, imploded, maxBounces, freezeSeen, stacks: g.player.achillesSpeedStacks };
  };
  const th = soccerRun('thanatos');
  ok('塔納托斯每次命中傷害遞增', th.seq.length >= 2 && th.seq[1] > th.seq[0], th.seq.slice(0, 5).join('→'));
  ok('塔納托斯第 5 次命中引爆', th.imploded && th.maxBounces >= 5, `bounces=${th.maxBounces}`);
  const ach = soccerRun('achilles');
  ok('阿基里斯命中疊跑速', ach.stacks > 0, 'stacks=' + ach.stacks);
  const gy = soccerRun('guanyu');
  ok('關羽冰凍 1.5 秒生效', gy.freezeSeen > 1.2 && gy.freezeSeen <= 1.51, gy.freezeSeen.toFixed(2));

  // 時停懷錶：秒數吃資料表，且敵方子彈真的停住
  g.player.invulnerableTimer = 1e9;
  g.enemyProjectiles.length = 0;
  g.spawnEnemyProjectile({ x: 0, y: 0, radius: 10 }, {
    x: g.player.x + 200, y: g.player.y, vx: -120, vy: 0, damage: 5, radius: 6, color: '#fff', glow: '#fff',
  });
  const ep = g.enemyProjectiles[0];
  const epX0 = ep ? ep.x : 0;
  g.activateConsumable('stopwatch');
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  ok('時停懷錶凍結敵方子彈', !!ep && Math.abs(ep.x - epX0) < 0.001 && g._timeStopTimer > 3.5,
    `dx=${ep ? (ep.x - epX0).toFixed(2) : 'n/a'} timer=${g._timeStopTimer.toFixed(2)}`);
  g._timeStopTimer = 0;
  g.enemyProjectiles.length = 0;

  // 消耗品文案與表一致（manna_prism / magic_ticket 先前是對調的）
  ok('曼納稜晶說明 = 冷卻歸零', /冷卻立即歸零/.test(CONSUMABLE_ITEMS.manna_prism.desc), CONSUMABLE_ITEMS.manna_prism.desc);
  ok('魔法門票說明 = 磁吸掉落物', /磁吸所有掉落物/.test(CONSUMABLE_ITEMS.magic_ticket.desc), CONSUMABLE_ITEMS.magic_ticket.desc);
  ok('時停懷錶表定 5 秒', CONSUMABLE_ITEMS.stopwatch.duration === 5, CONSUMABLE_ITEMS.stopwatch.duration);
  ok('幸運藥水表定 +25% 暴擊', /\+25%/.test(CONSUMABLE_ITEMS.luck_potion.desc), CONSUMABLE_ITEMS.luck_potion.desc);

  // 武器系統 ↔ 遊戲層的接線（宙斯連鎖、商人增益補回都靠它）
  ok('weaponManager.game 已接上', g.weaponManager.game === g, String(g.weaponManager.game && 'ok'));

  // 死資料清理
  const { GAME_CONFIG } = await import('/js/config.js');
  ok('死欄位 CANVAS_WIDTH 已移除', GAME_CONFIG.CANVAS_WIDTH === undefined);

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
