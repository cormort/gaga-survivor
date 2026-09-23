// 局外天賦 (基因強化) 資料與數值計算：純資料檔，不依賴其他模組 (避免循環 import)。
// 花費 DNA 永久強化，影響所有特工的所有局。
//
// 為什麼是 8 級 / 這條成本曲線：先前 5 個天賦都是 [10,20,30,40,50]，全滿只要 750 🧬 ——
// 而一場 6~10 分鐘的局就有 150~250 🧬（`save.recordRun` 的公式：時間/10 + 擊殺/20 +
// 等級×2，通關 ×1.5），所以「基因強化」大約 4 場就畢業，長期目標等於不存在。
// 改成 8 級、成本指數成長（每級 ×1.5）：10 → 171，單條全滿 494 🧬、全樹 2470 🧬（約 10 場），
// 才撐得起局外養成的長度。
// 前四級比舊的線性表便宜（新手容易起步），後段每一級都比前一級貴 50%。

// 指數成本：base × growth^n，round 決定取整的單位（金幣取到 10、DNA 取到 1）。
// 天賦、特工等級、倉庫擴建共用這一支，曲線只由 base / growth 兩個數字決定。
export function expCost(base, growth, n, round = 1) {
  return Math.round((base * Math.pow(growth, n)) / round) * round;
}

function expCosts(base, growth, levels) {
  return Array.from({ length: levels }, (_, n) => expCost(base, growth, n));
}

const TALENT_COSTS = expCosts(10, 1.5, 8);   // [10, 15, 23, 34, 51, 76, 114, 171]

export const TALENTS = {
  power: {
    id: 'power',
    name: '火力核心',
    icon: '💥',
    desc: '所有武器傷害 +8%',
    valuePerLevel: 0.08,
    maxLevel: 8,
    costs: TALENT_COSTS,
  },
  vitality: {
    id: 'vitality',
    name: '奈米修復',
    icon: '❤️‍🩹',
    desc: '最大生命 +15',
    valuePerLevel: 15,
    maxLevel: 8,
    costs: TALENT_COSTS,
  },
  swift: {
    id: 'swift',
    name: '疾走引擎',
    icon: '💨',
    desc: '移動速度 +5%',
    valuePerLevel: 0.05,
    maxLevel: 8,
    costs: TALENT_COSTS,
  },
  magnet: {
    id: 'magnet',
    name: '引力增幅',
    icon: '🧲',
    desc: '拾取範圍 +12%',
    valuePerLevel: 0.12,
    maxLevel: 8,
    costs: TALENT_COSTS,
  },
  fortune: {
    id: 'fortune',
    name: '幸運加成',
    icon: '🍀',
    desc: '金幣獲得 +25%',
    valuePerLevel: 0.25,
    maxLevel: 8,
    costs: TALENT_COSTS,
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

// 整棵樹全滿的 DNA（2470）：這是局外養成的長度指標
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

// ── 特工等級：每位特工各自養成，消耗金幣＋DNA 提升基礎數值 ──
// 為什麼要有：天賦樹 2350 🧬 就畢業、黑市箱子是賭運氣，後期累積的金幣與 DNA 沒有
// 穩定的出口；而困難以上 (怪血 ×1.4~2、受傷 ×1.3~1.7) 需要「確定會變強」的長線養成。
// 成本指數成長 (Lv L → L+1：250×1.14^(L-1) 🪙 + 25×1.14^(L-1) 🧬)：Lv1→2 是 250 🪙 + 25 🧬，
// Lv29→30 是 9,800 🪙 + 980 🧬；單一特工 Lv1 → 30 共約 78,000 🪙 + 7,800 🧬。
export const CHAR_LEVEL = {
  max: 30,
  dmg: 0.04,     // 每級全傷害 +4%
  hp: 10,        // 每級最大生命 +10
  armor: 0.006,  // 每級減傷 +0.6% (與裝備共用 50% 上限)
};

export function charLevelCost(level) {
  return { gold: expCost(250, 1.14, level - 1, 10), dna: expCost(25, 1.14, level - 1) };
}

// 等級 1 = 沒有加成；回傳格式與 metaBonuses 相同的欄位，直接疊進 player.meta
export function charLevelBonuses(level = 1) {
  const n = Math.max(0, Math.min(CHAR_LEVEL.max, level) - 1);
  return { dmg: n * CHAR_LEVEL.dmg, hp: n * CHAR_LEVEL.hp, armor: n * CHAR_LEVEL.armor };
}
