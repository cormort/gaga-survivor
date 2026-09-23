// 圖鑑（參考吸血鬼倖存者的 Collection / Bestiary）：武器、超武、敵人、珠寶四頁。
// 解鎖條件：武器＝局內取得過；超武＝合成過（沿用 save.evolvedEver）；敵人＝擊殺過；珠寶＝撿到過。
// 收集進度到 25 / 50 / 75 / 100% 可以各領一次金幣＋DNA。
//
// 記錄時機：珠寶在撿到當下（save.addJewel）；武器與擊殺在每局結算時一次寫入
// （擊殺每秒幾十次，逐次寫 localStorage 太浪費）。

import { WEAPONS, ENEMY_TYPES } from './config.js';
import { JEWEL_ORDER } from './jewels.js';

export const CODEX_MILESTONES = [
  { pct: 0.25, gold: 500, dna: 50 },
  { pct: 0.5, gold: 1000, dna: 100 },
  { pct: 0.75, gold: 2000, dna: 200 },
  { pct: 1, gold: 4000, dna: 400 },
];

// 四頁各自的條目 id
export function codexCategories() {
  const ids = Object.keys(WEAPONS);
  return {
    weapons: ids.filter((id) => !WEAPONS[id].isEvo),
    evos: ids.filter((id) => WEAPONS[id].isEvo),
    enemies: Object.keys(ENEMY_TYPES),
    jewels: [...JEWEL_ORDER],
  };
}

// 某條目是否已解鎖（data = save.data）
export function codexHas(data, cat, id) {
  const c = data.codex || {};
  if (cat === 'weapons') return !!(c.weapons && c.weapons[id]);
  if (cat === 'evos') return (data.evolvedEver || []).includes(id);
  if (cat === 'enemies') return !!(c.enemies && c.enemies[id] > 0);
  if (cat === 'jewels') return !!(c.jewels && c.jewels[id] > 0);
  return false;
}

// 整體收集進度 { found, total, pct }
export function codexProgress(data) {
  const cats = codexCategories();
  let found = 0;
  let total = 0;
  for (const [cat, list] of Object.entries(cats)) {
    total += list.length;
    found += list.filter((id) => codexHas(data, cat, id)).length;
  }
  return { found, total, pct: total ? found / total : 0 };
}
