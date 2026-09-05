// 裝備打寶：物品資料模型、詞條池與隨機生成。
// MVP 範圍：三階稀有度 × 三個部位 × 六種詞條，詞條全部走既有的加成注入點
// (與局外天賦同一條縫)，不新增戰鬥系統。

export const RARITIES = {
  common:    { key: 'common',    name: '普通', color: '#d7dde8', affixes: 0, weight: 8 },
  rare:      { key: 'rare',      name: '精良', color: '#00b4d8', affixes: 1, weight: 68 },
  epic:      { key: 'epic',      name: '史詩', color: '#b5179e', affixes: 2, weight: 27 },
  legendary: { key: 'legendary', name: '傳奇', color: '#ffb703', affixes: 3, weight: 5 },
  mythic:    { key: 'mythic',    name: '神話', color: '#ff4d6d', affixes: 4, weight: 1.4 },
};

export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// 三個部位；bias 是該部位偏好的詞條 (權重加倍)，讓不同部位有性格
export const SLOTS = {
  goggles: { key: 'goggles', name: '特工墨鏡', icon: '🕶️', bias: ['dmg', 'cdr', 'critdmg'] },
  coat:    { key: 'coat',    name: '特工風衣', icon: '🧥', bias: ['hp', 'magnet', 'armor'] },
  boots:   { key: 'boots',   name: '特工皮鞋', icon: '👟', bias: ['speed', 'gold', 'crit'] },
};

export const SLOT_ORDER = ['goggles', 'coat', 'boots'];

// 詞條：stat 對應 gearBonuses 的欄位，數值範圍以「物品等級 1」為基準
export const AFFIXES = {
  dmg:     { key: 'dmg',     name: '火力', stat: 'dmg',     min: 0.03,  max: 0.09,  pct: true },
  hp:      { key: 'hp',      name: '堅韌', stat: 'hp',      min: 6,     max: 22,    pct: false },
  speed:   { key: 'speed',   name: '疾速', stat: 'speed',   min: 0.02,  max: 0.05,  pct: true },
  magnet:  { key: 'magnet',  name: '磁力', stat: 'magnet',  min: 0.05,  max: 0.16,  pct: true },
  cdr:     { key: 'cdr',     name: '冷卻', stat: 'cdr',     min: 0.015, max: 0.045, pct: true },
  gold:    { key: 'gold',    name: '財運', stat: 'gold',    min: 0.06,  max: 0.22,  pct: true },
  crit:    { key: 'crit',    name: '要害', stat: 'crit',    min: 0.02,  max: 0.05,  pct: true },
  critdmg: { key: 'critdmg', name: '處決', stat: 'critdmg', min: 0.08,  max: 0.16,  pct: true },
  armor:   { key: 'armor',   name: '硬化', stat: 'armor',   min: 0.03,  max: 0.07,  pct: true },
  exp:     { key: 'exp',     name: '領悟', stat: 'exp',     min: 0.04,  max: 0.12,  pct: true },
};

export const AFFIX_ORDER = ['dmg', 'hp', 'speed', 'magnet', 'cdr', 'gold', 'crit', 'critdmg', 'armor', 'exp'];

// 物品等級：關卡難度 + 存活時間，數值隨之線性成長 (最高約 2 倍)
export function itemLevelFor(difficulty, gameTime) {
  return 1 + (difficulty - 1) * 0.25 + Math.min(0.75, gameTime / 640);
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

// bonusWeight：Boss 掉落把高稀有度的權重往上推
export function rollRarity(bonusWeight = 0) {
  return pickWeighted(RARITY_ORDER.map((k) => {
    const r = RARITIES[k];
    const boost = k === 'common' ? 0.6
      : k === 'rare' ? 1
      : k === 'epic' ? 1 + bonusWeight
      : k === 'legendary' ? 1 + bonusWeight * 3
      : 1 + bonusWeight * 8; // mythic
    return { key: k, weight: r.weight * boost };
  })).key;
}

let seq = 0;
function newId() {
  seq += 1;
  return `${Date.now().toString(36)}${seq.toString(36)}`;
}

// 依部位偏好抽 n 條不重複詞條 (rollItem 與重鑄共用)
function pickAffixes(slotKey, affixCount, ilvl) {
  const slotDef = SLOTS[slotKey];
  const pool = AFFIX_ORDER.map((k) => ({ key: k, weight: slotDef.bias.includes(k) ? 2 : 1 }));
  const affixes = [];
  for (let i = 0; i < affixCount && pool.length > 0; i++) {
    const picked = pickWeighted(pool);
    pool.splice(pool.findIndex((p) => p.key === picked.key), 1);
    const def = AFFIXES[picked.key];
    const raw = (def.min + Math.random() * (def.max - def.min)) * ilvl;
    affixes.push({ key: picked.key, value: def.pct ? Math.round(raw * 1000) / 1000 : Math.round(raw) });
  }
  return affixes;
}

export function rollItem({ slot = null, rarity = null, ilvl = 1 } = {}) {
  const slotKey = slot || SLOT_ORDER[Math.floor(Math.random() * SLOT_ORDER.length)];
  const rarityKey = rarity || rollRarity();
  const rarityDef = RARITIES[rarityKey];

  return {
    id: newId(),
    slot: slotKey,
    rarity: rarityKey,
    ilvl: Math.round(ilvl * 100) / 100,
    affixes: pickAffixes(slotKey, rarityDef.affixes, ilvl),
  };
}

// 重鑄：保留稀有度/部位/等級，把整組詞條重骰一次 (DNA 出口)
const REFORGE_BASE = { rare: 30, epic: 70, legendary: 150, mythic: 300 };
export function reforgeCost(item) {
  if (!item || !REFORGE_BASE[item.rarity]) return null; // 普通(0 詞綴)無法重鑄
  const base = REFORGE_BASE[item.rarity];
  return Math.max(10, Math.round(base * (0.6 + (item.ilvl || 1) * 0.4)));
}

export function rerollAffixes(item) {
  const rarityDef = RARITIES[item.rarity];
  item.affixes = pickAffixes(item.slot, rarityDef.affixes, item.ilvl || 1);
  return item;
}

export function itemName(item) {
  return `${RARITIES[item.rarity].name} ${SLOTS[item.slot].name}`;
}

export function affixText(a) {
  const def = AFFIXES[a.key];
  if (!def) return '';
  return def.pct ? `${def.name} +${Math.round(a.value * 100)}%` : `${def.name} +${a.value}`;
}

// 粗略戰力值：只用來排序倉庫與比較好壞，不參與實際計算
export function itemScore(item) {
  return item.affixes.reduce((sum, a) => {
    const def = AFFIXES[a.key];
    if (!def) return sum;
    return sum + (def.pct ? a.value * 100 : a.value);
  }, 0);
}

// 分解回收的 DNA：稀有度為主、物品等級為輔
const SALVAGE_BASE = { common: 2, rare: 5, epic: 14, legendary: 32, mythic: 80 };

export function salvageValue(item) {
  const base = SALVAGE_BASE[item.rarity] || 5;
  return Math.max(1, Math.round(base * (0.6 + (item.ilvl || 1) * 0.4)));
}

// 已穿裝備 → 加成總和 (與 meta.js 的 metaBonuses 同格式，直接相加即可)
export function gearBonuses(stash = [], equipped = {}) {
  const m = { dmg: 0, hp: 0, speed: 0, magnet: 0, gold: 0, cdr: 0, crit: 0, critdmg: 0, armor: 0, exp: 0 };
  for (const slotKey of SLOT_ORDER) {
    const id = equipped[slotKey];
    if (!id) continue;
    const item = stash.find((it) => it.id === id);
    if (!item) continue;
    for (const a of item.affixes) {
      const def = AFFIXES[a.key];
      if (def && m[def.stat] !== undefined) m[def.stat] += a.value;
    }
  }
  return m;
}
