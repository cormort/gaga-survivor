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

// 套用等級／專精的倍率（蓋好、升級、專精後都呼叫一次）
export function applyTDStats(t) {
  const i = Math.min(t.level, 3) - 1;
  t.dmgMul = t.branch ? BRANCH_MUL.dmg : TD_LEVEL_MUL.dmg[i];
  t.rangeMul = t.branch ? BRANCH_MUL.range : TD_LEVEL_MUL.range[i];
  if (t.branch !== 'knight') t.unitHpMul = 1 + 0.4 * i;   // 兵營：每級步兵血量 +40%（騎士營自己覆寫成 2.5）
}
