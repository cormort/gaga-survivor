// 兩種遊戲模式的資料定義。模式只描述「規則差異」，不含任何邏輯 ——
// main.js / WeaponManager / UI 一律讀這張表，新增模式不用動引擎。
//
// survivor：原本的純割草。沒有砲塔與傭兵，玩家武器就是全部火力。
// defense ：守塔。場中央有基地核心，雜兵改為朝核心進攻，核心被打爆即失敗；
//           玩家武器輸出被壓低、金幣收入拉高、砲塔便宜，逼你靠佈防而不是靠走位輸出。

export const MODES = {
  survivor: {
    id: 'survivor',
    name: '生存者',
    icon: '🏃',
    sub: '純走位割草',
    desc: '沒有砲塔與傭兵，全靠自己的武器與走位。怪物只追著你跑，撐過 8 分鐘擊敗終極首領。',
    accent: '#00e5ff',

    turrets: false,
    mercs: false,
    core: null,
    enemyTarget: 'player',

    weaponMul: 1,
    goldMul: 1,
    turretCostMul: 1,
  },

  defense: {
    id: 'defense',
    name: '守塔',
    icon: '🗼',
    sub: '佈防與取捨',
    desc: '中央基地核心會被雜兵圍攻，破了就結束。玩家武器輸出砍到 6 成、金幣加倍，火力主要來自砲塔與傭兵。',
    accent: '#ffb703',

    turrets: true,
    mercs: true,
    // 基地核心：放在世界原點，玩家開場站在下方
    // hp 依實測定：攻擊數設上限後進入核心的傷害穩定在 ~195 DPS，
    // 14,000 ≈ 完全不防守時 90 秒破核 (見 main.js 的 CORE_MAX_ATTACKERS)
    core: { hp: 14000, radius: 46, x: 0, y: 0 },
    enemyTarget: 'core',

    weaponMul: 0.6,      // 自身武器變弱 → 砲塔才是主力
    goldMul: 2.2,        // 金幣收入拉高 → 撐得起持續佈防
    turretCostMul: 0.6,  // 砲塔更便宜，鼓勵多蓋
  },
};

export const MODE_ORDER = ['survivor', 'defense'];

export function getMode(id) {
  return MODES[id] || MODES.survivor;
}
