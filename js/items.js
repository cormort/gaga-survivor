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
// 詞條：stat 對應 gearBonuses 的欄位，數值範圍以「物品等級 1」為基準
//
// 這一版的數值經過重新配比，理由是實測（tools/verify-progression.mjs）：
// 舊值下一套傳奇裝備的火力只有 +15.3%，等於局內「點一級強力卷軸」(+15%/級)，
// 而武器 1→5 級是 +145%、被動滿級 +75% —— 裝備等於不存在。
// 另一併把非戰鬥詞條（財運/磁力/領悟）下修約 35%：舊值它們與戰鬥詞條一樣大，
// 約 40% 的裝備價值跑到金幣與拾取半徑上，玩家當然感覺不到裝備的用處。
export const AFFIXES = {
  dmg:     { key: 'dmg',     name: '火力', stat: 'dmg',     min: 0.06,  max: 0.14,  pct: true },
  hp:      { key: 'hp',      name: '堅韌', stat: 'hp',      min: 10,    max: 30,    pct: false },
  speed:   { key: 'speed',   name: '疾速', stat: 'speed',   min: 0.035, max: 0.08,  pct: true },
  magnet:  { key: 'magnet',  name: '磁力', stat: 'magnet',  min: 0.03,  max: 0.10,  pct: true },
  cdr:     { key: 'cdr',     name: '冷卻', stat: 'cdr',     min: 0.03,  max: 0.08,  pct: true },
  gold:    { key: 'gold',    name: '財運', stat: 'gold',    min: 0.04,  max: 0.13,  pct: true },
  crit:    { key: 'crit',    name: '要害', stat: 'crit',    min: 0.04,  max: 0.09,  pct: true },
  critdmg: { key: 'critdmg', name: '處決', stat: 'critdmg', min: 0.15,  max: 0.30,  pct: true },
  armor:   { key: 'armor',   name: '硬化', stat: 'armor',   min: 0.05,  max: 0.11,  pct: true },
  exp:     { key: 'exp',     name: '領悟', stat: 'exp',     min: 0.025, max: 0.07,  pct: true },
};

export const AFFIX_ORDER = ['dmg', 'hp', 'speed', 'magnet', 'cdr', 'gold', 'crit', 'critdmg', 'armor', 'exp'];

// 物品等級：關卡難度 + 存活時間，數值隨之線性成長。
// 上限由「最難關卡的難度」決定：難度 8（深淵無盡戰）撐滿 480 秒 → 1 + 1.75 + 0.75 = 3.5。
// 所以每次新增更深的關卡，裝備的成長天花板會跟著往上，不需要改這裡。
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
// 非戰鬥詞條的抽選權重。10 條詞條裡有 7 條戰鬥、3 條非戰鬥，等權重下戰鬥占比只有 70%
// —— 加上部位偏好後實測 72%，代表每四件裝備就有一件的價值跑到金幣與拾取半徑上。
// 把非戰鬥降到 0.45 後戰鬥占比約 84%，裝備才會是「變強」而不是「變有錢」。
const UTILITY_AFFIX_WEIGHT = 0.45;

function pickAffixes(slotKey, affixCount, ilvl) {
  const slotDef = SLOTS[slotKey];
  const pool = AFFIX_ORDER.map((k) => {
    const def = AFFIXES[k];
    const combat = def && ['dmg', 'hp', 'speed', 'cdr', 'crit', 'critdmg', 'armor'].includes(def.stat);
    const base = combat ? 1 : UTILITY_AFFIX_WEIGHT;
    return { key: k, weight: slotDef.bias.includes(k) ? base * 2 : base };
  });
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

// 三大套裝定義 (每套集齊 3 件額外啟動專屬強力效果)
export const SETS = {
  agent: {
    key: 'agent',
    name: '特工套裝',
    color: '#4cc9f0',
    bonusText: '火力 +22%',
    bonus: { dmg: 0.22 },
  },
  shadow: {
    key: 'shadow',
    name: '暗影套裝',
    color: '#b5179e',
    bonusText: '要害率 +15%',
    bonus: { crit: 0.15 },
  },
  core: {
    key: 'core',
    name: '熔核套裝',
    color: '#ff7700',
    bonusText: '減傷 +22%',
    bonus: { armor: 0.22 },
  },
};

export const SET_KEYS = ['agent', 'shadow', 'core'];

// 傳奇與神話特效池 (開火/擊殺/屬性特化)
export const LEGENDARY_EFFECTS = {
  pierce_all: {
    key: 'pierce_all',
    name: '貫穿全場',
    desc: '投射物穿透數提升至 999',
    icon: '⚡',
  },
  cdr_burst: {
    key: 'cdr_burst',
    name: '極限超頻',
    desc: '冷卻縮減額外 +15%',
    icon: '⏱️',
    bonus: { cdr: 0.15 },
  },
  kill_heal: {
    key: 'kill_heal',
    name: '生命汲取',
    desc: '擊殺敵人時回復 3 點生命',
    icon: '🩸',
  },
  crit_blast: {
    key: 'crit_blast',
    name: '連環爆裂',
    desc: '暴擊命中引發範圍衝擊波',
    icon: '💥',
  },
  speed_rush: {
    key: 'speed_rush',
    name: '音速突進',
    desc: '移動速度額外 +12%',
    icon: '👟',
    bonus: { speed: 0.12 },
  },
  magnet_nova: {
    key: 'magnet_nova',
    name: '引力漩渦',
    desc: '拾取範圍額外 +35%',
    icon: '🧲',
    bonus: { magnet: 0.35 },
  },
};

export const LEGENDARY_EFFECT_KEYS = Object.keys(LEGENDARY_EFFECTS);

// 三合一升階消耗 DNA
export const FUSION_COST = {
  common: 30,
  rare: 80,
  epic: 200,
  legendary: 450,
};

export function rollItem({ slot = null, rarity = null, ilvl = 1, setKey = null, legendaryEffect = null } = {}) {
  const slotKey = slot || SLOT_ORDER[Math.floor(Math.random() * SLOT_ORDER.length)];
  // 稀有度吃物品等級：原本 rollRarity() 不帶參數，打得再深也不會更容易掉傳奇/神話，
  // 於是「深入關卡」對裝備完全沒有回報。ilvl 1 → 無加成、ilvl 3.5（最難關撐滿）→ 權重大幅提高。
  const rarityKey = rarity || rollRarity(Math.max(0, (ilvl - 1) * 0.5));
  const rarityDef = RARITIES[rarityKey];

  // 套裝標記 (三組隨機之一)
  const assignedSet = setKey || SET_KEYS[Math.floor(Math.random() * SET_KEYS.length)];

  // 傳奇/神話額外隨機附加一條傳奇特效
  let assignedEffect = null;
  if (rarityKey === 'legendary' || rarityKey === 'mythic') {
    assignedEffect = legendaryEffect || LEGENDARY_EFFECT_KEYS[Math.floor(Math.random() * LEGENDARY_EFFECT_KEYS.length)];
  }

  return {
    id: newId(),
    slot: slotKey,
    rarity: rarityKey,
    ilvl: Math.round(ilvl * 100) / 100,
    setKey: assignedSet,
    legendaryEffect: assignedEffect,
    affixes: pickAffixes(slotKey, rarityDef.affixes, ilvl),
  };
}

// 三合一升階：3 件同部位、同稀有度 → 1 件高一階裝備 (ilvl 取平均 × 1.15)
export function fuseItems(items) {
  if (!items || items.length !== 3) {
    return { ok: false, reason: '合成需要選中 3 件裝備' };
  }
  const [a, b, c] = items;
  if (a.slot !== b.slot || b.slot !== c.slot) {
    return { ok: false, reason: '3 件裝備部位必須相同' };
  }
  if (a.rarity !== b.rarity || b.rarity !== c.rarity) {
    return { ok: false, reason: '3 件裝備稀有度必須相同' };
  }
  const currIdx = RARITY_ORDER.indexOf(a.rarity);
  if (currIdx < 0 || currIdx >= RARITY_ORDER.length - 1) {
    return { ok: false, reason: '神話裝備已是最高階，無法再升階' };
  }
  const nextRarity = RARITY_ORDER[currIdx + 1];
  const avgIlvl = (a.ilvl + b.ilvl + c.ilvl) / 3;
  const newIlvl = Math.round(avgIlvl * 1.15 * 100) / 100;

  // 套裝繼承：若 2 件或以上同套裝則優先繼承，否則隨機
  const setCounts = {};
  for (const it of items) {
    if (it.setKey) setCounts[it.setKey] = (setCounts[it.setKey] || 0) + 1;
  }
  let inheritedSet = null;
  for (const [k, count] of Object.entries(setCounts)) {
    if (count >= 2) {
      inheritedSet = k;
      break;
    }
  }

  const newItem = rollItem({
    slot: a.slot,
    rarity: nextRarity,
    ilvl: newIlvl,
    setKey: inheritedSet,
  });

  return { ok: true, item: newItem };
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
  const setDef = item.setKey ? SETS[item.setKey] : null;
  const setPrefix = setDef ? `[${setDef.name}] ` : '';
  return `${setPrefix}${RARITIES[item.rarity].name} ${SLOTS[item.slot].name} ${ilvlText(item)}`;
}

// 裝備等級標記：詞條數值 = 基礎隨機值 × ilvl，所以這個數字直接代表這件裝備多強
export function ilvlText(item) {
  return `Lv.${(item.ilvl || 1).toFixed(2)}`;
}

export function legendaryEffectText(effectKey) {
  const def = LEGENDARY_EFFECTS[effectKey];
  return def ? `${def.icon} ${def.name}：${def.desc}` : '';
}

export function affixText(a) {
  const def = AFFIXES[a.key];
  if (!def) return '';
  return def.pct ? `${def.name} +${Math.round(a.value * 100)}%` : `${def.name} +${a.value}`;
}

// 粗略戰力值：只用來排序倉庫與比較好壞，不參與實際計算
export function itemScore(item) {
  const legBonus = item.legendaryEffect ? 30 : 0;
  return item.affixes.reduce((sum, a) => {
    const def = AFFIXES[a.key];
    if (!def) return sum;
    return sum + (def.pct ? a.value * 100 : a.value);
  }, legBonus);
}

// 分解回收的 DNA：稀有度為主、物品等級為輔
const SALVAGE_BASE = { common: 2, rare: 5, epic: 14, legendary: 32, mythic: 80 };

export function salvageValue(item) {
  const base = SALVAGE_BASE[item.rarity] || 5;
  return Math.max(1, Math.round(base * (0.6 + (item.ilvl || 1) * 0.4)));
}

// 已穿裝備 → 加成總和 (含套裝效果、傳奇特效屬性加成與特效清單)
export function gearBonuses(stash = [], equipped = {}) {
  const m = {
    dmg: 0, hp: 0, speed: 0, magnet: 0, gold: 0,
    cdr: 0, crit: 0, critdmg: 0, armor: 0, exp: 0,
    effects: [],
    activeSets: [],
  };
  const setCounts = {};

  for (const slotKey of SLOT_ORDER) {
    const id = equipped[slotKey];
    if (!id) continue;
    const item = stash.find((it) => it.id === id);
    if (!item) continue;

    // 詞條加成
    for (const a of item.affixes) {
      const def = AFFIXES[a.key];
      if (def && m[def.stat] !== undefined) m[def.stat] += a.value;
    }

    // 傳奇特效加成
    if (item.legendaryEffect) {
      if (!m.effects.includes(item.legendaryEffect)) {
        m.effects.push(item.legendaryEffect);
      }
      const legDef = LEGENDARY_EFFECTS[item.legendaryEffect];
      if (legDef && legDef.bonus) {
        for (const [stat, val] of Object.entries(legDef.bonus)) {
          if (m[stat] !== undefined) m[stat] += val;
        }
      }
    }

    // 套裝部位計數
    if (item.setKey) {
      setCounts[item.setKey] = (setCounts[item.setKey] || 0) + 1;
    }
  }

  // 套裝達成 (集齊 3 件同一套裝)
  for (const [sKey, count] of Object.entries(setCounts)) {
    if (count >= 3 && SETS[sKey]) {
      const sDef = SETS[sKey];
      m.activeSets.push(sDef);
      if (sDef.bonus) {
        for (const [stat, val] of Object.entries(sDef.bonus)) {
          if (m[stat] !== undefined) m[stat] += val;
        }
      }
    }
  }

  return m;
}

