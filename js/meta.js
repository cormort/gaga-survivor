// 局外天賦 (基因強化) 資料與數值計算：純資料檔，不依賴其他模組 (避免循環 import)。
// 花費 DNA 永久強化，影響所有特工的所有局。

export const TALENTS = {
  power: {
    id: 'power',
    name: '火力核心',
    icon: '💥',
    desc: '所有武器傷害 +8%',
    valuePerLevel: 0.08,
    maxLevel: 5,
    costs: [10, 20, 30, 40, 50],
  },
  vitality: {
    id: 'vitality',
    name: '奈米修復',
    icon: '❤️‍🩹',
    desc: '最大生命 +15',
    valuePerLevel: 15,
    maxLevel: 5,
    costs: [10, 20, 30, 40, 50],
  },
  swift: {
    id: 'swift',
    name: '疾走引擎',
    icon: '💨',
    desc: '移動速度 +5%',
    valuePerLevel: 0.05,
    maxLevel: 5,
    costs: [10, 20, 30, 40, 50],
  },
  magnet: {
    id: 'magnet',
    name: '引力增幅',
    icon: '🧲',
    desc: '拾取範圍 +12%',
    valuePerLevel: 0.12,
    maxLevel: 5,
    costs: [10, 20, 30, 40, 50],
  },
  fortune: {
    id: 'fortune',
    name: '幸運加成',
    icon: '🍀',
    desc: '金幣獲得 +25%',
    valuePerLevel: 0.25,
    maxLevel: 5,
    costs: [10, 20, 30, 40, 50],
  },
};

export const TALENT_ORDER = ['power', 'vitality', 'swift', 'magnet', 'fortune'];

export function talentCost(def, level) {
  return def.costs[level] ?? def.costs[def.costs.length - 1];
}

// 升級選項的識別鍵 (reroll 排除重複卡、比對顯示清單用)
export function upgradeKeyOf(opt) {
  return opt.type === 'evo' ? 'evo:' + opt.baseId : opt.type + ':' + (opt.id || '');
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
