// 守塔專屬塔種（只在 level.td 的關卡使用；生存者的設施列照舊讀 Turret.js 的 FACILITY_TYPES）。
// 風格參考魔獸爭霸三（守衛塔／秘法塔／加農砲塔／兵營）與星海爭霸（飛彈塔、靈能風暴、攻城坦克、地堡）。
//
// 四條路線，各三級，第三級後二選一專精：
//   guard    守衛塔   穿刺，單體快射，對空對地 → 飛彈塔（只打空、雙發）／多重弩炮（一次 3 目標）
//   arcane   秘法塔   魔法脈衝＋減速          → 靈能風暴（路上降風暴持續傷害）／冰霜方尖碑（大範圍、機率凍結）
//   cannon   加農砲塔 攻城範圍爆炸，不打空    → 攻城坦克（超遠射程、有最小射程）／烈焰風暴（落點留火海）
//   barracks 兵營     普通攻擊，3 名步兵擋路  → 騎士營（超耐打）／地堡（4 名陸戰隊在內射擊，可對空，不再擋路）
//
// 每座塔實際還是 Turret：type / variant 決定行為與外觀，這裡只描述「怎麼蓋、怎麼升」。
// 專精的 apply(t) 直接把 Turret 換成對應的 facilityType / variant 或打開旗標。

import { FACILITY_TYPES, TURRET_VARIANTS } from './entities/Turret.js';

// 攻擊類型 × 護甲（魔獸三式）。怪的護甲由 TowerDefense 依怪種標上 e.armorClass。
// air 為 0 的攻擊類型本來就打不到空中（選目標時已排除），這裡寫 0 只是保險。
export const ARMOR_MUL = {
  pierce: { light: 1.5, medium: 1, heavy: 0.5, air: 1, boss: 0.6 },
  siege: { light: 0.75, medium: 1, heavy: 1.5, air: 0, boss: 0.6 },
  magic: { light: 1.25, medium: 0.75, heavy: 1.5, air: 1, boss: 0.6 },
  normal: { light: 1, medium: 1, heavy: 1, air: 1, boss: 0.6 },
};
export const ARMOR_NAMES = { light: '輕甲', medium: '中甲', heavy: '重甲', air: '空中', boss: '首領' };

export const TD_TOWERS = {
  guard: {
    name: '守衛塔', icon: '🏹', type: 'turret', variant: 'standard', dmgType: 'pierce',
    desc: '穿刺：單體快射、對空對地；克輕甲，打重甲只剩一半',
    cost: 70, up: [110, 160], branches: ['missile', 'multishot'],
  },
  arcane: {
    name: '秘法塔', icon: '🔮', type: 'turret', variant: 'cryo', dmgType: 'magic',
    desc: '魔法：脈衝打周圍所有敵人並減速；克重甲與輕甲',
    cost: 100, up: [150, 210], branches: ['storm', 'frost'],
  },
  cannon: {
    name: '加農砲塔', icon: '💣', type: 'mortar', dmgType: 'siege',
    desc: '攻城：拋射砲彈範圍爆炸，克重甲；打不到空中',
    cost: 125, up: [170, 240], branches: ['siege', 'flamestrike'],
  },
  barracks: {
    name: '兵營', icon: '⛺', type: 'barracks', dmgType: 'normal',
    desc: '派 3 名步兵上路擋怪，陣亡自動補兵；擋不住也打不到空中',
    cost: 70, up: [110, 160], branches: ['knight', 'bunker'],
  },
};

// 第二、三級的能力倍率（index = level - 1）；專精後固定為 BRANCH_MUL
export const TD_LEVEL_MUL = { dmg: [1, 1.5, 2.2], range: [1, 1.1, 1.2] };
const BRANCH_MUL = { dmg: 3, range: 1.25 };

const setType = (t, type) => {
  t.facilityType = type;
  t.fConf = FACILITY_TYPES[type];
};
const setVariant = (t, v) => {
  t.variant = v;
  t.conf = TURRET_VARIANTS[v];
};

export const TD_BRANCHES = {
  missile: { name: '飛彈塔', icon: '🚀', cost: 220, desc: '只打空中：每次雙發飛彈，專剋飛行怪', apply: (t) => setVariant(t, 'missile') },
  multishot: { name: '多重弩炮', icon: '🎯', cost: 260, desc: '一次同時射 3 個目標，清輕甲雜兵', apply: (t) => setVariant(t, 'multishot') },
  storm: { name: '靈能風暴', icon: '🌀', cost: 280, desc: '在怪群上降下風暴，範圍內持續魔法傷害', apply: (t) => setVariant(t, 'storm') },
  frost: { name: '冰霜方尖碑', icon: '🧊', cost: 260, desc: '脈衝範圍更大、減速更久，有機率凍住雜兵', apply: (t) => setVariant(t, 'frost') },
  siege: { name: '攻城坦克', icon: '🛞', cost: 300, desc: '架起攻城模式：射程 ×1.6、爆炸更大，但打不到身邊的怪', apply: (t) => { t.siege = true; } },
  flamestrike: { name: '烈焰風暴', icon: '🔥', cost: 280, desc: '落點燃起火海 4 秒，持續燒傷路過的地面敵人', apply: (t) => { t.flamestrike = true; } },
  knight: { name: '騎士營', icon: '🛡️', cost: 240, desc: '步兵換成騎士：血量 ×2.5，擋得住重甲', apply: (t) => { t.unitHpMul = 2.5; } },
  bunker: {
    name: '地堡', icon: '🏯', cost: 260, desc: '4 名陸戰隊在地堡內同時射擊 4 個目標，可對空；不再出兵擋路',
    apply: (t) => { setType(t, 'bunker'); t.priority = 'first'; },
  },
};

// 建造選單／提示用的塔種速覽：DPS、射程、能否對空、剋什麼／怕什麼護甲。
// 數字直接從 Turret.js 的實際設定算出來，不在這裡另抄一份 —— 否則調平衡時選單會謊報，
// 玩家就是照著選單做決定的。
//
// 「火力數字放在哪裡」取決於這座塔是誰在開火，三種情況都不一樣：
//   mortar（加農砲塔）／bunker（地堡）→ 設施自己開火，Turret.update 讀 this.fConf，
//                                        所以數字在 FACILITY_TYPES
//   guard／arcane 等一般塔            → Turret.update 讀 this.conf，數字在 TURRET_VARIANTS
//   barracks                          → 開火的是小兵，兩張表都沒有數字，改用 units 旗標
//                                       讓選單換一種說法（寫「DPS 0」比不寫更糟）
export function tdTowerPreview(key) {
  const d = TD_TOWERS[key];
  if (!d) return null;
  const f = FACILITY_TYPES[d.type] || {};
  const v = d.variant ? (TURRET_VARIANTS[d.variant] || {}) : {};
  const isUnitTower = d.type === 'barracks';
  const src = (d.type === 'mortar' || d.type === 'bunker') ? f : v;
  const dmg = isUnitTower ? 0 : (src.damage ?? f.damage ?? v.damage ?? 0);
  const cd = isUnitTower ? 0 : (src.cooldown ?? f.cooldown ?? v.cooldown ?? 0);
  const range = isUnitTower ? 0 : (src.range ?? f.range ?? v.range ?? 0);
  // 一次打多發（地堡 shots、飛彈塔 salvo）的塔，DPS 要乘上去才對得上體感
  const shots = isUnitTower ? 0 : (src.shots || src.salvo || 1);
  const row = ARMOR_MUL[d.dmgType] || {};
  const keys = ['light', 'medium', 'heavy', 'air'];
  const canAir = isUnitTower ? false : (row.air ?? 0) > 0;
  // 打不到空中的塔，ARMOR_MUL 的 air 是 0 而不是「打得比較癢」。這是「選不到目標」，
  // 列成「弱空中」會跟旁邊的「只打地面」講同一件事還多一次誤導，所以直接不列。
  const rateable = keys.filter((k) => k !== 'air' || canAir);
  return {
    dmg, cd, range, shots,
    // 單體 DPS。打多目標的塔（外加 splash／pulseRadius／stormR）會在選單標「範圍」
    dps: cd > 0 ? Math.round((dmg * shots) / cd) : 0,
    aoe: !isUnitTower && !!(src.splash || src.pulseRadius || src.stormR),
    canAir,
    units: isUnitTower,
    counters: rateable.filter((k) => (row[k] ?? 1) > 1),
    weak: rateable.filter((k) => (row[k] ?? 1) < 1),
  };
}

// 套用等級／專精的倍率（蓋好、升級、專精後都呼叫一次）
//
// 注意：這裡是「直接指派」dmgMul / rangeMul，所以任何外部加成（戰術地基、訓練場累積）
// 都必須一起乘進來，否則會被這行洗掉。地基加成由 Turret 建構子寫進 socketDmgMul /
// socketRangeMul（定義見 js/tdsockets.js），訓練場累積寫在 vetMul。
export function applyTDStats(t) {
  const i = Math.min(t.level, 3) - 1;
  const socketDmg = t.socketDmgMul || 1;
  const socketRange = t.socketRangeMul || 1;
  const vet = t.vetMul || 1;
  // 王國升級（js/tdkingdom.js 的彈道學／光學）走的是全域倍率，買了會立刻重跑這支，
  // 所以已經蓋好的塔也會馬上升級
  const kingdomDmg = t.kingdomDmgMul || 1;
  const kingdomRange = t.kingdomRangeMul || 1;
  // 實戰歷練星等（js/entities/Turret.js 的 TD_ELITE）：升星時 Facilities 會再呼叫一次這支
  const eliteDmg = t.eliteDmgMul || 1;
  const eliteRange = t.eliteRangeMul || 1;
  t.dmgMul = (t.branch ? BRANCH_MUL.dmg : TD_LEVEL_MUL.dmg[i]) * socketDmg * vet * kingdomDmg * eliteDmg;
  t.rangeMul = (t.branch ? BRANCH_MUL.range : TD_LEVEL_MUL.range[i]) * socketRange * kingdomRange * eliteRange;
  if (t.branch !== 'knight') t.unitHpMul = 1 + 0.4 * i;   // 兵營：每級步兵血量 +40%（騎士營自己覆寫成 2.5）
}
