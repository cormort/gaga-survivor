// 局外天賦 (基因強化) 資料與數值計算：純資料檔，不依賴其他模組 (避免循環 import)。
// 花費 DNA 永久強化，影響所有特工的所有局。
//
// 為什麼是 8 級 / 這條成本曲線：先前 5 個天賦都是 [10,20,30,40,50]，全滿只要 750 🧬 ——
// 而一場 6~10 分鐘的局就有 150~250 🧬（`save.recordRun` 的公式：時間/10 + 擊殺/20 +
// 等級×2，通關 ×1.5），所以「基因強化」大約 4 場就畢業，長期目標等於不存在。
// 改成 8 級、成本 10→140，全滿 2350 🧬（約 10~15 場），才撐得起局外養成的長度。
// 成本仍然嚴格遞增（每級 +10、後段 +25/+35），所以越後面的每一點都更貴。

export const TALENTS = {
  power: {
    id: 'power',
    name: '火力核心',
    icon: '💥',
    desc: '所有武器傷害 +8%',
    valuePerLevel: 0.08,
    maxLevel: 8,
    costs: [10, 20, 30, 40, 50, 75, 105, 140],
  },
  vitality: {
    id: 'vitality',
    name: '奈米修復',
    icon: '❤️‍🩹',
    desc: '最大生命 +15',
    valuePerLevel: 15,
    maxLevel: 8,
    costs: [10, 20, 30, 40, 50, 75, 105, 140],
  },
  swift: {
    id: 'swift',
    name: '疾走引擎',
    icon: '💨',
    desc: '移動速度 +5%',
    valuePerLevel: 0.05,
    maxLevel: 8,
    costs: [10, 20, 30, 40, 50, 75, 105, 140],
  },
  magnet: {
    id: 'magnet',
    name: '引力增幅',
    icon: '🧲',
    desc: '拾取範圍 +12%',
    valuePerLevel: 0.12,
    maxLevel: 8,
    costs: [10, 20, 30, 40, 50, 75, 105, 140],
  },
  fortune: {
    id: 'fortune',
    name: '幸運加成',
    icon: '🍀',
    desc: '金幣獲得 +25%',
    valuePerLevel: 0.25,
    maxLevel: 8,
    costs: [10, 20, 30, 40, 50, 75, 105, 140],
  },
};

export const TALENT_ORDER = ['power', 'vitality', 'swift', 'magnet', 'fortune'];

export function talentCost(def, level) {
  return def.costs[level] ?? def.costs[def.costs.length - 1];
}

// 一個天賦全滿要多少 DNA（UI 顯示「距離全滿」、驗證工具設門檻都用這支，
// 避免同一個數字在兩個地方各寫一次）
export function talentFullCost(def) {
  let sum = 0;
  for (let l = 0; l < def.maxLevel; l++) sum += talentCost(def, l);
  return sum;
}

// 整棵樹全滿的 DNA（2350）：這是局外養成的長度指標
export function talentTreeCost() {
  return TALENT_ORDER.reduce((sum, id) => sum + talentFullCost(TALENTS[id]), 0);
}

// 目前已經投入的 DNA：由存檔的等級反推（成本是固定的，所以不必另外記帳）
export function talentInvested(talents = {}) {
  let sum = 0;
  for (const [id, lvl] of Object.entries(talents)) {
    const def = TALENTS[id];
    if (!def) continue;
    for (let l = 0; l < Math.min(lvl, def.maxLevel); l++) sum += talentCost(def, l);
  }
  return sum;
}

// 第 level 級為止的累積效果（UI 要顯示「升級前 → 升級後」）
export function talentValueAt(def, level) {
  return def.valuePerLevel * Math.max(0, Math.min(level, def.maxLevel));
}

export function upgradeKeyOf(opt) {
  if (opt.type === 'evo') return 'evo:' + opt.baseId;
  if (opt.type === 'special') return 'special:' + opt.specialId;
  return opt.type + ':' + (opt.id || '');
}

// 由存檔的 talents {id: lvl} 算出整場的加成總和 (Game.start 時套用到玩家身上)
export function metaBonuses(talents = {}) {
  const m = { dmg: 0, hp: 0, speed: 0, magnet: 0, gold: 0 };
  for (const [id, lvl] of Object.entries(talents)) {
    const def = TALENTS[id];
    if (!def || !lvl) continue;
    const v = def.valuePerLevel * lvl;
    if (id === 'power') m.dmg += v;
    else if (id === 'vitality') m.hp += v;
    else if (id === 'swift') m.speed += v;
    else if (id === 'magnet') m.magnet += v;
    else if (id === 'fortune') m.gold += v;
  }
  return m;
}
