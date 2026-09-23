// 出擊規則卡（參考吸血鬼倖存者的 Arcana、Brotato 的角色特性）：
// 出擊前在開始畫面選一張，整局生效，讓玩家在開局前就規劃構築方向。
// 純資料檔，不 import 任何模組；效果由 main.js 的 Game.applyRunCard() 照 effect 套用。
//
// 原則（與祝福的「風險／報酬」契約一致）：每一張都有代價 ——
// 提高輸出的卡（火力過載、時間壓縮）必須同時削生存；其餘的卡用經驗、移速、冷卻交換。
// 每日挑戰不套用規則卡（每日挑戰有自己的詞綴，比的是同一套規則）。
//
// effect 欄位：
//   dmgMul       全武器傷害倍率            damageTaken  承受傷害倍率
//   pierce       投射物穿透 +N              cdMul        武器冷卻倍率（< 1 = 更快）
//   gold         金幣倍率                   exp          經驗獲得加減（-0.25 = -25%）
//   magnet       拾取範圍倍率               speed        移動速度倍率
//   maxHp        最大生命倍率               banish/skip  升級卡封印／跳過次數 +N
//   rerollMul    升級卡刷新費用倍率
// rules 欄位：併進關卡規則（mergeRules，與難度相乘）—— spawnMul 生成密度、enemyHpMul 雜兵血量
//   （首領血量是固定值，不受 enemyHpMul 影響）

export const RUN_CARDS = {
  overload: {
    id: 'overload', name: '火力過載', icon: '🔥',
    desc: '全武器傷害 +25%，承受傷害 +30%',
    effect: { dmgMul: 1.25, damageTaken: 1.3 },
  },
  piercer: {
    id: 'piercer', name: '貫穿彈頭', icon: '🎯',
    desc: '所有投射物穿透 +1，武器冷卻 +15%',
    effect: { pierce: 1, cdMul: 1.15 },
  },
  midas: {
    id: 'midas', name: '黃金之手', icon: '💰',
    desc: '金幣獲得 ×2，經驗獲得 -25%',
    effect: { gold: 2, exp: -0.25 },
  },
  gravity: {
    id: 'gravity', name: '引力核心', icon: '🧲',
    desc: '拾取範圍 ×2，移動速度 -10%',
    effect: { magnet: 2, speed: 0.9 },
  },
  haste: {
    id: 'haste', name: '時間壓縮', icon: '⏳',
    desc: '武器冷卻 -20%，最大生命 -30%',
    effect: { cdMul: 0.8, maxHp: 0.7 },
  },
  fate: {
    id: 'fate', name: '命運編織', icon: '🎲',
    desc: '升級卡封印與跳過各 +3 次、刷新半價，經驗獲得 -10%',
    effect: { banish: 3, skip: 3, rerollMul: 0.5, exp: -0.1 },
  },
  // 怪海（參考吸血鬼倖存者滿畫面的怪）。場上數量 ≈ 生成速度 × 每隻活多久，
  // 實測（第一關標準、真實生成）：生成 ×2.5 配血量 ×0.4 → 兩者抵銷，場上峰值 152 → 158，看不出怪海；
  // 生成 ×5、血量不變 → 後期每分鐘峰值 278~450（碰到新上限 450）。代價就是怪海本身，
  // 擊殺約 3.5 倍（金幣、DNA 跟著變多），經驗 -40% 讓升級節奏不至於暴衝
  horde: {
    id: 'horde', name: '屍潮', icon: '🧟',
    desc: '怪物生成 ×5（滿畫面怪海，擊殺與掉落大增），經驗 -40%',
    effect: { exp: -0.4 },
    rules: { spawnMul: 5 },
  },
};

export const RUN_CARD_ORDER = ['overload', 'piercer', 'midas', 'gravity', 'haste', 'fate', 'horde'];
