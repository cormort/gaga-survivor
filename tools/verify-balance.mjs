// 難度分級與祝福門檻的平衡契約（純 Node，免瀏覽器、秒級）。
//
// 兩個真實回報：
//   1. 「難度提升不夠」—— 舊版困難／惡夢只調了敵人血量與生成量，等於同一場打久一點，
//      不是更難。這裡把「每一階都要在多個軸上同時加壓、級距要拉開」寫成契約，
//      避免之後有人把數字調回舒適圈。
//   2. 「引力異常至少要 21 級之後再出現」—— 它是拾取範圍翻倍的祝福，前期拿到會讓
//      「撿東西」這件事完全消失；以 minLevel 進池子過濾，這裡驗證門檻前抽不到、
//      門檻後抽得到，而且池子是從真正的 BLESSINGS 來（不是複製一份清單）。
//
// 用法：node tools/verify-balance.mjs
import { readFileSync } from 'node:fs';
import { DIFFICULTIES, RULE_DEFAULTS, enemyScale, LEVELS, ENEMY_SPEED_BASE, hazardDmgScale } from '../js/levels.js';
import { BLESSINGS, blessingPool, BOMB_TUNING, ENEMY_TYPES, ELEMENTS } from '../js/config.js';

// 原始碼層級：確認實際抽祝福的路徑真的走 blessingPool（而不是各自再寫一次 filter）
const progressionSrc = readFileSync(new URL('../js/systems/Progression.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const hazardsSrc = readFileSync(new URL('../js/systems/Hazards.js', import.meta.url), 'utf8');

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}${detail ? `  [${detail}]` : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ''}`); }
};

const AXES = ['enemyHpMul', 'damageTakenMul', 'spawnMul', 'eliteChanceMul', 'enemySpeedMul', 'goldMul'];

console.log('=== A. 難度分級：每一階都要多方加壓 ===');
{
  const order = ['easy', 'normal', 'hard', 'nightmare', 'hell'];
  ok('五個難度都在（輕鬆／標準／困難／惡夢／地獄）',
    order.every((k) => DIFFICULTIES[k]), order.map((k) => `${k}=${DIFFICULTIES[k]?.name || '?'}`).join(' '));

  const value = (key, axis) => (key === 'normal' ? 1 : (DIFFICULTIES[key][axis] || 1));

  // 標準是基準：沒有任何倍率欄位（避免「標準其實不是 1」的誤會）
  ok('標準沒有任何修正欄位（基準難度）',
    AXES.every((a) => DIFFICULTIES.normal[a] === undefined) && DIFFICULTIES.normal.dnaMult === undefined);

  ok('輕鬆比標準寬鬆（血量／受傷／生成都 < 1）',
    value('easy', 'enemyHpMul') < 1 && value('easy', 'damageTakenMul') < 1 && value('easy', 'spawnMul') < 1,
    `hp=${value('easy', 'enemyHpMul')} 受傷=${value('easy', 'damageTakenMul')} 生成=${value('easy', 'spawnMul')}`);

  // 困難：至少四個軸同時加壓，且血量與生成都要 ≥1.6（這是「感覺變難」的門檻）
  const hardTouched = AXES.filter((a) => value('hard', a) !== 1);
  ok(`困難至少同時加壓 4 個軸（實際 ${hardTouched.length} 個）`, hardTouched.length >= 4, hardTouched.join('、'));
  ok('困難的敵人血量 ≥1.6 且生成密度 ≥1.6（只是調血不夠）',
    value('hard', 'enemyHpMul') >= 1.6 && value('hard', 'spawnMul') >= 1.6,
    `hp=${value('hard', 'enemyHpMul')} 生成=${value('hard', 'spawnMul')}`);
  ok('困難會提高玩家受到的傷害（≥1.4）', value('hard', 'damageTakenMul') >= 1.4, `${value('hard', 'damageTakenMul')}`);

  // 惡夢：每個軸都要比困難更硬
  const weaker = AXES.filter((a) => value('nightmare', a) < value('hard', a));
  ok('惡夢在每一個軸上都不弱於困難', weaker.length === 0, weaker.join('、') || '全部 ≥ 困難');
  ok('惡夢的敵人血量 ≥2.4、生成密度 ≥2.0、受傷 ≥1.8',
    value('nightmare', 'enemyHpMul') >= 2.4 && value('nightmare', 'spawnMul') >= 2.0 && value('nightmare', 'damageTakenMul') >= 1.8,
    `hp=${value('nightmare', 'enemyHpMul')} 生成=${value('nightmare', 'spawnMul')} 受傷=${value('nightmare', 'damageTakenMul')}`);
  ok('惡夢比困難「明顯更難」：血量級距 ≥1.5 倍',
    value('nightmare', 'enemyHpMul') / value('hard', 'enemyHpMul') >= 1.5,
    `${(value('nightmare', 'enemyHpMul') / value('hard', 'enemyHpMul')).toFixed(2)}×`);

  // 地獄：難度上限要再往上開一階，讓「惡夢也覺得不夠」的玩家有去處。
  // 這一階是玩家第二次回報「難度還是不夠」後新增的，契約比照惡夢對困難的寫法。
  const hellWeaker = AXES.filter((a) => value('hell', a) < value('nightmare', a));
  ok('地獄在每一個軸上都不弱於惡夢', hellWeaker.length === 0, hellWeaker.join('、') || '全部 ≥ 惡夢');
  ok('地獄明顯高於惡夢：敵人血量級距 ≥1.3 倍、受傷 ≥1.3 倍',
    value('hell', 'enemyHpMul') / value('nightmare', 'enemyHpMul') >= 1.3
      && value('hell', 'damageTakenMul') / value('nightmare', 'damageTakenMul') >= 1.3,
    `hp=${value('hell', 'enemyHpMul')}（${(value('hell', 'enemyHpMul') / value('nightmare', 'enemyHpMul')).toFixed(2)}×）`
    + ` 受傷=${value('hell', 'damageTakenMul')}（${(value('hell', 'damageTakenMul') / value('nightmare', 'damageTakenMul')).toFixed(2)}×）`);
  // 敵人移速刻意不跟著爆衝：會撞上 enemyScale 的 1.5× 封頂，變成不公平的追殺
  ok('敵人移速不超過 1.2（避免撞上 1.5× 封頂變成不公平追殺）',
    value('hell', 'enemySpeedMul') <= 1.2, `${value('hell', 'enemySpeedMul')}`);

  // 收益要跟著風險走，且越高難越多
  const dna = (k) => DIFFICULTIES[k].dnaMult || 1;
  const gold = (k) => DIFFICULTIES[k].goldMul || 1;
  ok('DNA 收益隨難度單調上升（輕鬆 < 標準 < 困難 < 惡夢 < 地獄）',
    dna('easy') < dna('normal') && dna('normal') < dna('hard')
      && dna('hard') < dna('nightmare') && dna('nightmare') < dna('hell'),
    `${dna('easy')} / ${dna('normal')} / ${dna('hard')} / ${dna('nightmare')} / ${dna('hell')}`);
  ok('金幣收益也隨難度上升', gold('easy') < 1 && gold('hard') > 1 && gold('hell') > gold('nightmare'),
    `${gold('easy')} / 1 / ${gold('hard')} / ${gold('nightmare')} / ${gold('hell')}`);

  // 所有倍率都必須是 RULE_DEFAULTS 認得的欄位，否則 mergeRules 會直接丟掉
  const unknown = [];
  for (const [key, def] of Object.entries(DIFFICULTIES)) {
    for (const axis of Object.keys(def)) {
      if (axis === 'name' || axis === 'dnaMult') continue;
      if (!(axis in RULE_DEFAULTS)) unknown.push(`${key}.${axis}`);
    }
  }
  ok('難度只使用 mergeRules 認得的欄位（打錯字會靜默失效）', unknown.length === 0, unknown.join('、') || '全部合法');
}

console.log('\n=== A2. 敵人傷害曲線：後期必須真的會痛 ===');
{
  // 這是「難度還是不夠」的真正瓶頸。舊版雜兵傷害封頂在 ×3.5，配上玩家 0.5 秒的
  // 無敵影格，20 分鐘後的雜兵最大輸出只有約 28 DPS，而玩家此時有 100+ 血、減傷
  // 與回復 —— 後期不是難，是死不了。這裡把「撐得越久越危險」寫成契約。
  const lv = LEVELS.street || Object.values(LEVELS)[0];
  const dmgAt = (min) => enemyScale(min * 60, lv).dmg;
  const hpAt = (min) => enemyScale(min * 60, lv).hp;

  ok('前 10 分鐘不受影響：3 分鐘的傷害倍率 < 1.6（與舊版一致）',
    dmgAt(3) < 1.6, `3 分 ×${dmgAt(3).toFixed(2)}`);
  ok('傷害隨時間單調成長（10 / 20 / 30 分）',
    dmgAt(10) < dmgAt(20) && dmgAt(20) < dmgAt(30),
    `${dmgAt(10).toFixed(1)} → ${dmgAt(20).toFixed(1)} → ${dmgAt(30).toFixed(1)}`);

  // ── 曲線要平滑，而不是階梯 ──
  //
  // 玩家回報：「過了一個強度就基本不死了」。原因是舊曲線帶著**不連續**：
  //   舊版 = min(12, min(5.5, 1+分鐘×0.14) × (1 + max(0, 分鐘-10)² × 0.010))
  //   ① 10 分鐘處斜率從 0.14 突然跳到 0.14 + 0.2×(分鐘-10)（折線）
  //   ② 約 24 分鐘撞到硬封頂 12 之後完全水平 —— 之後再久都不會更痛
  // 這裡把「不能有折點、不能有硬封頂」直接寫成數值契約，避免又被調回階梯。
  const slopes = [];
  for (let m = 1; m <= 40; m++) slopes.push(dmgAt(m + 0.5) - dmgAt(m - 0.5));   // 每分鐘的斜率
  let worstKink = 0;
  let worstAt = 0;
  for (let i = 1; i < slopes.length; i++) {
    const rel = Math.abs(slopes[i] - slopes[i - 1]) / Math.max(1e-6, slopes[i - 1]);
    if (rel > worstKink) { worstKink = rel; worstAt = i + 1; }
  }
  ok('傷害曲線處處平滑：相鄰斜率變化 < 25%（沒有折點／階梯）',
    worstKink < 0.25, `最大斜率跳動 ${(worstKink * 100).toFixed(1)}%（第 ${worstAt} 分鐘附近）`);
  ok('沒有硬封頂：60 分鐘仍嚴格大於 40 分鐘，40 分鐘大於 30 分鐘',
    dmgAt(60) > dmgAt(40) && dmgAt(40) > dmgAt(30),
    `30 分 ×${dmgAt(30).toFixed(1)} → 40 分 ×${dmgAt(40).toFixed(1)} → 60 分 ×${dmgAt(60).toFixed(1)}`);
  ok('成長是次指數的（不會爆炸成必死）：40 分鐘 ≤ 20 分鐘的 3 倍',
    dmgAt(40) <= dmgAt(20) * 3, `20 分 ×${dmgAt(20).toFixed(2)} → 40 分 ×${dmgAt(40).toFixed(2)}`);
  ok('20 分鐘的傷害倍率 ≥ 6.5（舊版封頂只有 3.5，後期不痛）',
    dmgAt(20) >= 6.5, `20 分 ×${dmgAt(20).toFixed(2)}`);
  ok('30 分鐘的傷害倍率 ≥ 10（後期要有感）',
    dmgAt(30) >= 10, `30 分 ×${dmgAt(30).toFixed(2)}`);
  ok('血量也持續成長，不會出現「血薄到秒殺」的反向失衡',
    hpAt(30) > hpAt(10) * 1.5, `10 分 ×${hpAt(10).toFixed(1)} → 30 分 ×${hpAt(30).toFixed(1)}`);

  // ── 血量曲線要讓雜兵「活著走到玩家面前」──
  // 玩家回報「敵人太脆，近不了身」。實測（tools/probe-enemy-pressure.mjs）：
  // 舊曲線每分鐘只成長 ×0.28（8 分鐘 ×3.2），而玩家輸出 2→20 分鐘成長 413 倍，
  // 雜兵在接近途中就被清掉。契約用「撐不撐得住自己的行軍時間」當門檻。
  const BASE_GRUNT_HP = ENEMY_TYPES.walker.hp;
  const BASE_GRUNT_SPEED = ENEMY_TYPES.walker.speed;
  const marchSeconds = 500 / (BASE_GRUNT_SPEED * ENEMY_SPEED_BASE);   // 生成距離 500px ÷ 實際移速
  // 注意：hpAt() 已經含全局倍率，直接用「基礎血量 × hpAt(分)」就是該時間點的實際血量
  // （先前多除了一次 hpAt(0)，把 225 HP 算成 75，害契約一直紅燈）
  const gruntHpAt = (min) => BASE_GRUNT_HP * hpAt(min);
  const PLAYER_DPS = 44;                                  // 實測：2~8 分鐘的基礎武器輸出
  ok('雜兵血量成長明顯高於舊曲線（24 分鐘 ≥ 12 倍，舊版約 7.7 倍）',
    hpAt(24) / 3 >= 12, `24 分 ×${(hpAt(24) / 3).toFixed(1)}（舊版 ×${(1 + 24 * 0.28).toFixed(1)}）`);
  ok(`5 分鐘的雜兵能撐過自己的行軍時間（≥ ${marchSeconds.toFixed(1)} 秒）`,
    gruntHpAt(5) / PLAYER_DPS >= marchSeconds,
    `walker ${Math.round(gruntHpAt(5))} HP ÷ ${PLAYER_DPS} DPS = ${(gruntHpAt(5) / PLAYER_DPS).toFixed(1)}s vs 行軍 ${marchSeconds.toFixed(1)}s`);
  ok('8 分鐘的雜兵存活時間明顯超過行軍時間（撐得住才代表「近得了身」）',
    gruntHpAt(8) / PLAYER_DPS >= marchSeconds * 1.3,
    `walker ${Math.round(gruntHpAt(8))} HP ÷ ${PLAYER_DPS} DPS = ${(gruntHpAt(8) / PLAYER_DPS).toFixed(1)}s vs 行軍 ${marchSeconds.toFixed(1)}s`);

  // 移速：全局旋鈕必須真的存在且 > 1，否則行軍時間會回到 5.6 秒
  ok('敵人基礎移速有全局加成（ENEMY_SPEED_BASE ≥ 1.4）',
    ENEMY_SPEED_BASE >= 1.4, `ENEMY_SPEED_BASE=${ENEMY_SPEED_BASE}`);

  // 實測換算：雜兵基礎接觸傷害 8，玩家 0.5 秒無敵影格 → 單怪上限 = 傷害/0.5 秒
  const BASE_CONTACT = 8;
  const dps = (min) => (BASE_CONTACT * dmgAt(min)) / 0.5;
  ok('20 分鐘的單怪接觸 DPS 上限 ≥ 90（舊版約 28，後期完全無威脅）',
    dps(20) >= 90, `約 ${dps(20).toFixed(0)} DPS（舊版約 28）`);
  ok('單下傷害仍受控（40 分鐘 ≤ 150；有減傷與裝備的老手撐得住，站著不動的必死）',
    BASE_CONTACT * dmgAt(40) <= 150, `40 分單下約 ${(BASE_CONTACT * dmgAt(40)).toFixed(0)} 點`);
}

console.log('\n=== A2b. 屬性傷害與地形傷害：不能被無敵影格吃掉 ===');
{
  // 為什麼要有這一節：玩家的防禦是「多層相乘 + 上限」（護甲 ≤50%、鐵壁藥水 ×0.5、
  // 聖域 ×(1-resist)、護盾吸收）再加上最關鍵的 **0.5 秒無敵影格**。相乘之後，
  // 一次性傷害的通道被鎖死在「每秒最多 2 下」，於是只要生命＋回復超過那個上限，
  // 敵人再多都殺不死玩家。屬性持續傷害（DoT）逐幀結算、完全不吃無敵影格，
  // 是唯一能讓「站著不動」永遠有代價的通道。地形傷害同理（玩家無法用火力清掉）。
  const lv = LEVELS.street || Object.values(LEVELS)[0];
  const elemAt = (min) => enemyScale(min * 60, lv).elem;

  ok('enemyScale 有 elem（屬性壓力）軸，且 > 0',
    typeof elemAt(1) === 'number' && elemAt(1) > 0, `1 分 ×${elemAt(1).toFixed(2)}`);
  ok('屬性壓力隨時間單調成長（3 / 10 / 20 / 30 分）',
    elemAt(3) < elemAt(10) && elemAt(10) < elemAt(20) && elemAt(20) < elemAt(30),
    `${elemAt(3).toFixed(2)} → ${elemAt(10).toFixed(2)} → ${elemAt(20).toFixed(2)} → ${elemAt(30).toFixed(2)}`);
  {
    const es = [];
    for (let m = 1; m <= 40; m++) es.push(elemAt(m + 0.5) - elemAt(m - 0.5));
    let worst = 0;
    for (let i = 1; i < es.length; i++) {
      const rel = Math.abs(es[i] - es[i - 1]) / Math.max(1e-6, es[i - 1]);
      if (rel > worst) worst = rel;
    }
    ok('屬性壓力曲線也平滑：相鄰斜率變化 < 25%', worst < 0.25, `最大 ${(worst * 100).toFixed(1)}%`);
  }

  // 地形傷害：常數在中期就變成 0，必須隨時間成長，而且同樣平滑
  const hz = (min) => hazardDmgScale(min * 60);
  ok('地形傷害會隨時間成長（1 分 < 8 分 < 20 分）',
    hz(1) < hz(8) && hz(8) < hz(20), `${hz(1).toFixed(2)} → ${hz(8).toFixed(2)} → ${hz(20).toFixed(2)}`);
  ok('地形傷害在 8 分鐘的關卡內有明顯成長（≥ 2 倍）',
    hz(8) >= 2, `8 分 ×${hz(8).toFixed(2)}`);
  {
    const hs = [];
    for (let m = 1; m <= 40; m++) hs.push(hz(m + 0.5) - hz(m - 0.5));
    let worst = 0;
    for (let i = 1; i < hs.length; i++) {
      const rel = Math.abs(hs[i] - hs[i - 1]) / Math.max(1e-6, hs[i - 1]);
      if (rel > worst) worst = rel;
    }
    ok('地形傷害曲線同樣平滑：相鄰斜率變化 < 25%', worst < 0.25, `最大 ${(worst * 100).toFixed(1)}%`);
  }

  // 每一個屬性都要有「穿透護甲」與「持續傷害」——否則屬性只是換顏色
  const badEl = Object.values(ELEMENTS).filter((e) => e.id !== 'physical')
    .filter((e) => !(e.armorPierce > 0) || !(e.dotPct > 0 || e.dotFlat > 0) || !(e.maxStacks > 0));
  ok('每個屬性都有護甲穿透、持續傷害與疊層上限（不是只有換顏色）',
    badEl.length === 0, badEl.map((e) => e.id).join('、') || `${Object.keys(ELEMENTS).length - 1} 種屬性全部合格`);

  // 原始碼層級：DoT 的結算路徑不得經過 takeDamage（那條會被 invulnerableTimer 擋掉）
  const playerSrc = readFileSync(new URL('../js/entities/Player.js', import.meta.url), 'utf8');
  const tickBody = (playerSrc.match(/function tickPlayerElements[\s\S]*?\n}/) || [''])[0];
  ok('屬性 DoT 的逐幀結算不經過 takeDamage（否則會被 0.5 秒無敵影格吃掉）',
    tickBody.length > 0 && !/takeDamage\s*\(/.test(tickBody) && /p\.hp\s*-=/.test(tickBody),
    tickBody ? `${tickBody.split('\n').length} 行實作` : '找不到 tickPlayerElements');
  ok('玩家受傷會把屬性帶進狀態（takeDamage 內有 applyElement 呼叫）',
    /if \(el\.id !== 'physical'\) this\.applyElement\(/.test(playerSrc));
  ok('有對策：回復泉與聖域會淨化屬性層數',
    /clearElements\(\)/.test(hazardsSrc), 'spring / sanctuary');

  // 難度軸：屬性壓力也要吃難度的 damageTakenMul（地獄的屬性傷害比標準痛）
  ok('屬性 DoT 走 damageTakenMul（難度的受傷倍率對屬性一樣有效）',
    /p\.damageTakenMul/.test(tickBody));
}

console.log('\n=== A3. 發射投射物的敵人（玩家要求「多一些」）===');
{
  // 只有兩種敵人會發射投射物（ENEMY_TYPES 裡有 ranged 的）。玩家回報太少，
  // 所以這裡把「每一關的每一個波次」都要有遠程敵人、而且佔比有下限寫成契約。
  const rangedKeys = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k].ranged);
  ok('遠程敵人種類 ≥ 2', rangedKeys.length >= 2, rangedKeys.join('、'));

  const rangedShareOf = (pool) => {
    const total = (pool || []).reduce((s, [, w]) => s + (Number(w) || 0), 0);
    if (!total) return 0;
    return (pool || []).filter(([k]) => rangedKeys.includes(k))
      .reduce((s, [, w]) => s + (Number(w) || 0), 0) / total;
  };

  const emptyWaves = [];
  const levelBest = {};
  for (const [id, lv] of Object.entries(LEVELS)) {
    let best = 0;
    (lv.waves || []).forEach((w, i) => {
      const share = rangedShareOf(w.pool);
      if (share === 0) emptyWaves.push(`${id}#${i + 1}`);
      best = Math.max(best, share);
    });
    levelBest[id] = best;
  }
  ok('每一個波次都有遠程敵人（沒有整段空窗）',
    emptyWaves.length === 0, emptyWaves.slice(0, 6).join('、') || `${Object.keys(LEVELS).length} 關全部涵蓋`);

  const weakest = Object.entries(levelBest).sort((a, b) => a[1] - b[1])[0];
  ok('每一關的遠程敵人佔比都 ≥ 20%（最高波次）',
    weakest[1] >= 0.20, `最低是 ${weakest[0]} ${(weakest[1] * 100).toFixed(1)}%`);
  const avgShare = Object.values(levelBest).reduce((s, v) => s + v, 0) / Object.keys(levelBest).length;
  ok('全關卡平均遠程佔比 ≥ 25%（玩家要求「多一些」）',
    avgShare >= 0.25, `平均 ${(avgShare * 100).toFixed(1)}%`);
  ok('遠程敵人有足夠血量撐到開火（spitter ≥ 80、sniper ≥ 70）',
    ENEMY_TYPES.spitter.hp >= 80 && ENEMY_TYPES.sniper.hp >= 70,
    `spitter ${ENEMY_TYPES.spitter.hp}、sniper ${ENEMY_TYPES.sniper.hp}`);
}

console.log('\n=== B. 引力異常的等級門檻 ===');
{
  const gw = BLESSINGS.find((b) => b.id === 'gravity_well');
  ok('引力異常存在且有 minLevel', !!gw && gw.minLevel === 21, gw ? `minLevel=${gw.minLevel}` : '找不到');

  const at = (lv) => blessingPool([], lv).map((b) => b.id);
  ok('5 級抽不到引力異常（前期不該出現）', !at(5).includes('gravity_well'));
  ok('20 級仍然抽不到（門檻是 21）', !at(20).includes('gravity_well'));
  ok('21 級開始抽得到', at(21).includes('gravity_well'));
  ok('30 級也抽得到', at(30).includes('gravity_well'));

  ok('未達門檻的祝福只是被過濾，池子其餘祝福不受影響',
    at(5).length === BLESSINGS.length - 1 && at(21).length === BLESSINGS.length,
    `lv5=${at(5).length} 個、lv21=${at(21).length} 個、全部=${BLESSINGS.length} 個`);

  ok('已擁有的祝福不會再進池子（避免重複）',
    !blessingPool(['gravity_well'], 30).some((b) => b.id === 'gravity_well'));

  ok('blessingPool 可吃 Set 或陣列', blessingPool(new Set(['gravity_well']), 30).length === BLESSINGS.length - 1);

  ok('實戰抽祝福的路徑使用 blessingPool（不是各自再寫一次 filter）',
    /blessingPool\(/.test(progressionSrc) && !/BLESSINGS\.filter\(\(b\) => !owned/.test(progressionSrc));

  const gated = BLESSINGS.filter((b) => b.minLevel);
  ok('所有有 minLevel 的祝福門檻都是正整數', gated.every((b) => Number.isInteger(b.minLevel) && b.minLevel > 0),
    gated.map((b) => `${b.name}=${b.minLevel}`).join('、') || '（目前只有引力異常）');
}

console.log('\n=== C. 全面引爆類炸彈（回報：威力太大） ===');
{
  // 這類炸彈原本都是 takeDamage(9999)：一鍵抹除全場，清場沒有代價。
  // 現在共用 BOMB_TUNING，對非 Boss 打「當前生命比例」、對 Boss 只吃固定傷害。
  ok('非 Boss 的比例傷害 < 1（不再是必殺）', BOMB_TUNING.fieldDamageRatio < 1,
    `${BOMB_TUNING.fieldDamageRatio} × 當前生命`);
  ok('比例傷害有下限（前期雜兵仍有感）', BOMB_TUNING.fieldDamageMin >= 50, `${BOMB_TUNING.fieldDamageMin}`);
  ok('Boss 只吃固定傷害，且遠低於任何 Boss 血量',
    BOMB_TUNING.bossDamage > 0 && BOMB_TUNING.bossDamage <= 300, `${BOMB_TUNING.bossDamage}`);
  ok('掉落率 ≤ 1.2%（原 1.5%）', BOMB_TUNING.dropChance <= 0.012, `${(BOMB_TUNING.dropChance * 100).toFixed(1)}%`);

  // 原始碼層級：炸彈路徑不得再出現 9999；且三個路徑都要吃 BOMB_TUNING
  const field9999 = [...mainSrc.matchAll(/takeDamage\(9999/g)].length;
  ok('main.js 的炸彈路徑不再有一擊 9999（撤離獎勵的範圍清場不在此列）',
    field9999 <= 1, `remaining=${field9999}（僅戰術撤離的半徑清場保留）`);
  ok('掉落物炸彈與軌道核彈都使用 BOMB_TUNING',
    (mainSrc.match(/BOMB_TUNING\.fieldDamageRatio/g) || []).length >= 2
    && /BOMB_TUNING\.dropChance/.test(mainSrc),
    `引用 ${(mainSrc.match(/BOMB_TUNING\./g) || []).length} 次`);
  ok('里程碑震撼彈也使用同一份 BOMB_TUNING（三處行為一致）',
    /BOMB_TUNING\.fieldDamageRatio/.test(progressionSrc) && /BOMB_TUNING\.bossDamage/.test(progressionSrc));

  const card = (src) => (src.match(/id: 'nuke_strike'[\s\S]{0,160}?desc: '([^']+)'/) || [])[1] || '';
  ok('軌道核彈的文案不再宣稱「全螢幕清怪」',
    /重創/.test(card(readFileSync(new URL('../js/config.js', import.meta.url), 'utf8'))) && !/全螢幕清怪/.test(card(readFileSync(new URL('../js/config.js', import.meta.url), 'utf8'))),
    card(readFileSync(new URL('../js/config.js', import.meta.url), 'utf8')));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
