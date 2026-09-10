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
    sub: '末日突圍割草',
    desc: '就地築防抵禦屍潮！部署機槍砲台、高壓電網、淨化裝置與反傷拒馬，消滅狂暴感染體，擊敗終極首領。',
    accent: '#00e5ff',

    turrets: true,
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
    sub: '基地要塞保衛',
    desc: '中央基地核心會被雜兵圍攻，破了就結束。工事費用 0.6 折，金幣收入加倍，佈署砲台與傭兵重裝陣線！',
    accent: '#ffb703',

    turrets: true,
    mercs: true,
    // 基地核心：放在世界原點，玩家開場站在下方
    // hp 依實測定：攻擊數設上限後進入核心的傷害穩定在 ~195 DPS，
    // 14,000 ≈ 完全不防守時 90 秒破核 (見 main.js 的 CORE_MAX_ATTACKERS)
    //
    // 後期波次改「多而脆」後曾被質疑核心變脆，同機 A/B 實測後維持 14,000：
    //   完全不防守的破核時間 99s → 116s (略微變長 —— 雜兵血量斜率同時下調，
    //   玩家清得更快，擊殺 62 → 96)
    //   但 8 分鐘時的核心 DPS 253 → 455 (+80%) —— CORE_MAX_ATTACKERS 是天花板
    //   不是實際值，密度提高會把實際攻擊者數推向上限
    // 也就是：早期沒有變脆，撐到後期才會明顯更吃防守。這是「後期更難」的預期效果，
    // 不是回歸。血量是很弱的槓桿 (14,000→116s、24,000→130s，+71% 血量只換 +14 秒)，
    // 真要調難度應該動 CORE_MAX_ATTACKERS 或守塔模式的生成密度。
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
