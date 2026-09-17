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
import { DIFFICULTIES, RULE_DEFAULTS } from '../js/levels.js';
import { BLESSINGS, blessingPool, BOMB_TUNING } from '../js/config.js';

// 原始碼層級：確認實際抽祝福的路徑真的走 blessingPool（而不是各自再寫一次 filter）
const progressionSrc = readFileSync(new URL('../js/systems/Progression.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}${detail ? `  [${detail}]` : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ''}`); }
};

const AXES = ['enemyHpMul', 'damageTakenMul', 'spawnMul', 'eliteChanceMul', 'enemySpeedMul', 'goldMul'];

console.log('=== A. 難度分級：每一階都要多方加壓 ===');
{
  const order = ['easy', 'normal', 'hard', 'nightmare'];
  ok('四個難度都在（輕鬆／標準／困難／惡夢）',
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

  // 收益要跟著風險走，且越高難越多
  const dna = (k) => DIFFICULTIES[k].dnaMult || 1;
  const gold = (k) => DIFFICULTIES[k].goldMul || 1;
  ok('DNA 收益隨難度單調上升（輕鬆 < 標準 < 困難 < 惡夢）',
    dna('easy') < dna('normal') && dna('normal') < dna('hard') && dna('hard') < dna('nightmare'),
    `${dna('easy')} / ${dna('normal')} / ${dna('hard')} / ${dna('nightmare')}`);
  ok('金幣收益也隨難度上升', gold('easy') < 1 && gold('hard') > 1 && gold('nightmare') > gold('hard'),
    `${gold('easy')} / 1 / ${gold('hard')} / ${gold('nightmare')}`);

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
