// 特工黑市 (Shop System)：消耗 DNA 與金幣購買軍火補給、單局戰術興奮劑及後勤設施擴充

import { rollItem, RARITIES, itemLevelFor } from './items.js';
import { LEVELS } from './levels.js';

// ── 黑市裝備等級 ────────────────────────────────────────────────────────
// 為什麼要有這支：黑市箱子原本是 `rollItem({ rarity })` —— 沒帶 ilvl，所以**永遠是 ilvl 1**
// （詞條數值 = 基礎值 × ilvl）。但局內掉落是 `itemLevelFor(關卡難度, 存活時間)`，後期到 2.75。
// 實測傳奇裝備的詞條總和：ilvl 1 = 7.13、ilvl 2.75 = 15.22（×2.13）—— 也就是說
// 「傳奇特工箱」（1600 🪙 + 320 🧬）開出來的東西，比路上免費掉的還弱一半，黑市只在前期有意義。
// 現在改成跟玩家自己的最佳紀錄連動：打過越深的關卡、在那裡撐得越久，黑市就拿得出越好的貨。
export function shopItemLevel(save) {
  const best = (save && save.data && save.data.best) || {};
  let difficulty = 1;
  let time = 0;
  for (const perMode of Object.values(best)) {
    for (const [levelId, rec] of Object.entries(perMode || {})) {
      const def = LEVELS[levelId];
      const diff = (def && def.difficulty) || 1;
      const t = (rec && rec.time) || 0;
      if (diff > difficulty || (diff === difficulty && t > time)) {
        difficulty = diff;
        time = t;
      }
    }
  }
  return itemLevelFor(difficulty, time);
}

export const SHOP_CRATES = {
  rare_crate: {
    id: 'rare_crate',
    name: '精良軍備箱',
    icon: '📦',
    desc: '內含 1 件精良 (Rare) 或以上特工裝備',
    color: '#00b4d8',
    costGold: 250,
    costDna: 50,
    roll: (ilvl = 1) => rollItem({ rarity: Math.random() < 0.25 ? 'epic' : 'rare', ilvl }),
  },
  epic_crate: {
    id: 'epic_crate',
    name: '史詩機密箱',
    icon: '🧰',
    desc: '內含 1 件史詩 (Epic) 或更高階特工裝備',
    color: '#b5179e',
    costGold: 650,
    costDna: 130,
    roll: (ilvl = 1) => rollItem({ rarity: Math.random() < 0.2 ? 'legendary' : 'epic', ilvl }),
  },
  legendary_crate: {
    id: 'legendary_crate',
    name: '傳奇特工箱',
    icon: '👑',
    desc: '必得 1 件傳奇 (Legendary) 裝備，附帶強力傳奇特效！',
    color: '#ffb703',
    costGold: 1600,
    costDna: 320,
    roll: (ilvl = 1) => rollItem({ rarity: 'legendary', ilvl }),
  },
};

// 單局戰術興奮劑。
//
// 兩個原則（都會被 tools/verify-meta-shop.mjs 守住）：
//   1. `effect` 是唯一真相：main.js 照這張表套用，`desc` 只是它的文字版，
//      驗證工具會比對兩者的數字有沒有對上（先前這種「說明 +15% 程式給 +10%」的漂移踩過）。
//   2. 消耗品必須在單局內明顯強過永久天賦，否則沒人買：舊值（迅捷 +15% / 15 🧬）換算下來
//      每點 DNA 只有永久天賦「疾走引擎」（+5% / 10 🧬，而且永久）的 1/3，
//      也就是同一筆 DNA 買永久天賦在兩場之後就完全超車。
//      現在 DNA 成本砍半、效果微調，每一項都 ≥ 同價位永久天賦的 3 倍（單局）。
export const MAX_BOOSTER_STACK = 3;   // 同一種最多帶幾劑（疊加是黑市的 DNA 出口）

export const SHOP_BOOSTERS = {
  speed_stim: {
    id: 'speed_stim',
    name: '迅捷興奮劑',
    icon: '💉',
    desc: '下局出擊：特工移動速度 +18%',
    color: '#4cc9f0',
    costGold: 60,
    costDna: 8,
    effect: { speed: 0.18 },
  },
  pierce_ammo: {
    id: 'pierce_ammo',
    name: '穿甲彈藥箱',
    icon: '⚡',
    desc: '下局出擊：投射物武器穿透次數 +1',
    color: '#ffd166',
    costGold: 90,
    costDna: 10,
    effect: { pierce: 1 },
  },
  fortune_magnet: {
    id: 'fortune_magnet',
    name: '財運超導磁石',
    icon: '🧲',
    desc: '下局出擊：拾取半徑 +60%，局內金幣收益 +40%',
    color: '#06d6a0',
    costGold: 80,
    costDna: 5,
    effect: { magnet: 0.60, gold: 1.4 },
  },
  frenzy_core: {
    id: 'frenzy_core',
    name: '狂暴戰鬥核心',
    icon: '💥',
    desc: '下局出擊：暴擊率 +12%，暴擊傷害 +30%',
    color: '#ef476f',
    costGold: 110,
    costDna: 10,
    effect: { crit: 0.12, critDmg: 0.30 },
  },
  vitality_shield: {
    id: 'vitality_shield',
    name: '納米護盾裝置',
    icon: '🛡️',
    desc: '下局出擊：開局獲得 120 點高能護盾抵擋傷害',
    color: '#118ab2',
    costGold: 80,
    costDna: 8,
    effect: { shield: 120 },
  },
};

export const STASH_EXPANSION_STEP = 5;
export const MAX_STASH_CAP = 60;
export const STASH_EXPAND_COST = {
  costGold: 800,
  costDna: 160,
};
