// 守塔模式專屬關卡：固定路線（怪物沿路徑走向核心）＋ 分波、波間休息蓋塔。
//
// 與生存者關卡共用 LEVELS 的欄位（theme / decor / rules …），多了：
//   td: true         —— Spawner 改走波次狀態機（js/systems/TowerDefense.js）
//   paths: [[x,y]…]  —— 每條路線是一串折線點，第一點是入口、最後一點接到核心 (0,0)
//   pathWidth        —— 路寬 (px)；怪物被夾在路內，砲塔只能蓋在路外
//   waves            —— 由 genWaves 產生：[{ groups: [{ type, count, gap, path }], boss? }]
//   coreHp           —— 覆寫模式預設的核心血量（守塔關的核心只挨漏網之魚，血量低一些）
// 座標系：守塔模式是 4000×4000 有邊界地圖（±2000），核心在原點。

import { LEVELS } from './levels.js';

// 依波數產生波次：主力群數量逐波增加，逢 3 的倍數加一群飛行／快速怪，
// 後半段加入重裝與特殊怪；最後一波附帶終極首領（擊敗即過關）。
function genWaves(n, { main, fast, heavy, special, boss }) {
  const waves = [];
  for (let w = 1; w <= n; w++) {
    const groups = [];
    groups.push({ type: main[(w - 1) % main.length], count: 6 + w * 2, gap: Math.max(0.35, 0.9 - w * 0.04) });
    if (w % 3 === 0) groups.push({ type: fast, count: 4 + w, gap: 0.3 });
    if (w >= n * 0.4) groups.push({ type: heavy, count: Math.floor(w / 2), gap: 1.2 });
    if (w >= n * 0.6) groups.push({ type: special[w % special.length], count: 2 + Math.floor(w / 3), gap: 0.9 });
    waves.push({ groups, boss: w === n ? boss : null });
  }
  return waves;
}

const base = (id) => LEVELS[id];

export const TD_LEVELS = {
  td_canyon: {
    ...base('storm'),
    id: 'td_canyon',
    name: '峽谷隘口',
    sub: '守塔 ‧ 單線',
    icon: '🏜️',
    desc: '一條蜿蜒的峽谷路線直通基地。在彎道兩側佈防，讓怪物在長長的路上被火網消耗。',
    difficulty: 1,
    dnaMult: 1.2,
    next: 'td_fork',
    td: true,
    coreHp: 3000,
    pathWidth: 150,
    breakTime: 14,
    paths: [
      [[0, -1850], [0, -1350], [-950, -1350], [-950, -700], [750, -700], [750, -250], [0, -250], [0, 0]],
    ],
    waves: genWaves(8, {
      main: ['walker', 'walker', 'runner'],
      fast: 'bat',
      heavy: 'brute',
      special: ['spitter', 'boomer'],
      boss: { hp: 9000, name: '峽谷掠奪者', speed: 60, damage: 30, behaviors: ['summon', 'barrage'], skin: 'boss_storm' },
    }),
    rules: { label: '守塔規則', desc: '怪物沿路線進攻核心；波間休息可蓋塔，提前開戰拿金幣' },
    mechs: [],
    bosses: [],
    hpScale: 1.0,
  },

  td_fork: {
    ...base('swamp'),
    id: 'td_fork',
    name: '雙叉河道',
    sub: '守塔 ‧ 雙線',
    icon: '🌿',
    desc: '東西兩條河道在基地前匯流。兩邊都要顧，還是集中火力守在匯流口？',
    difficulty: 2,
    dnaMult: 1.6,
    next: 'td_fortress',
    td: true,
    coreHp: 3500,
    pathWidth: 140,
    breakTime: 13,
    paths: [
      [[-1850, -300], [-1250, -300], [-1250, 550], [-550, 550], [-550, 0], [0, 0]],
      [[1850, -700], [1150, -700], [1150, 350], [450, 350], [450, 0], [0, 0]],
    ],
    waves: genWaves(10, {
      main: ['walker', 'hound', 'runner'],
      fast: 'bat',
      heavy: 'warden',
      special: ['spitter', 'bloater', 'medic'],
      boss: { hp: 22000, name: '沼澤雙頭蛇', speed: 64, damage: 34, behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_swamp' },
    }),
    rules: { label: '守塔規則', desc: '兩條路線同時進攻；波間休息可蓋塔，提前開戰拿金幣' },
    mechs: [],
    bosses: [],
    hpScale: 1.3,
  },

  td_fortress: {
    ...base('frostvoid'),
    id: 'td_fortress',
    name: '三門要塞',
    sub: '守塔 ‧ 三線',
    icon: '🏰',
    desc: '北、西南、東南三道城門同時被攻破。砲塔數量有限，看清每一波從哪裡來。',
    difficulty: 3,
    dnaMult: 2.0,
    next: null,
    td: true,
    coreHp: 4000,
    pathWidth: 130,
    breakTime: 12,
    paths: [
      [[0, -1850], [0, -1200], [-600, -1200], [-600, -500], [0, -500], [0, 0]],
      [[-1850, 1500], [-1200, 1500], [-1200, 700], [-500, 700], [-500, 250], [0, 0]],
      [[1850, 1500], [1200, 1500], [1200, 900], [500, 900], [500, 250], [0, 0]],
    ],
    waves: genWaves(12, {
      main: ['walker', 'hound', 'runner', 'brute'],
      fast: 'blinker',
      heavy: 'chimera',
      special: ['spitter', 'mortar', 'medic', 'boomer'],
      boss: { hp: 48000, name: '要塞攻城巨像', speed: 56, damage: 40, behaviors: ['summon', 'nova', 'barrage', 'ground'], skin: 'boss_frostvoid' },
    }),
    rules: { label: '守塔規則', desc: '三條路線輪番進攻；波間休息可蓋塔，提前開戰拿金幣' },
    mechs: [],
    bosses: [],
    hpScale: 1.6,
  },
};

export const TD_ORDER = ['td_canyon', 'td_fork', 'td_fortress'];

// 併入 LEVELS：Spawner、音樂、關卡選單等所有以 id 查關卡的地方都能直接用
Object.assign(LEVELS, TD_LEVELS);

// 點到線段的距離與投影（路寬夾制、砲塔「只能蓋路邊」判定共用）
export function nearestOnPaths(level, x, y) {
  let best = { d: Infinity, px: x, py: y };
  for (const path of level.paths || []) {
    for (let i = 1; i < path.length; i++) {
      const r = projectToSegment(path[i - 1], path[i], x, y);
      if (r.d < best.d) best = r;
    }
  }
  return best;
}

export function projectToSegment(a, b, x, y) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / len2));
  const px = a[0] + vx * t;
  const py = a[1] + vy * t;
  return { d: Math.hypot(x - px, y - py), px, py };
}
