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

// 鑄造世界 40K 專屬波次生成器：融合泰倫蟲群、歐克蠻兵與納垢瘟疫行者
function gen40kWaves() {
  const waves = [];
  const bossNob = { hp: 18000, name: '歐克戰爭頭目', speed: 64, damage: 38, behaviors: ['summon', 'barrage', 'ground'], skin: 'boss_nob' };
  const bossBroodlord = { hp: 36000, name: '蟲群基因原體', speed: 78, damage: 45, behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_broodlord' };
  const bossCarnifex = { hp: 72000, name: '泰倫劊子手暴君', speed: 52, damage: 60, behaviors: ['summon', 'nova', 'barrage', 'ground'], skin: 'boss_carnifex' };

  const mains = ['hormagaunt', 'ork_boy', 'termagant', 'genestealer'];
  for (let w = 1; w <= 12; w++) {
    const groups = [];
    // 基礎主力潮
    groups.push({ type: mains[(w - 1) % mains.length], count: 8 + w * 3, gap: Math.max(0.28, 0.78 - w * 0.03) });
    // 自爆/快速突擊單位 (孢子地雷、跳跳炸彈)
    if (w % 2 === 0) {
      groups.push({ type: (w % 4 === 0) ? 'squig_bomb' : 'spore_mine', count: 4 + Math.floor(w * 0.8), gap: 0.35 });
    }
    // 重裝單位 (瘟疫行者、基因竊取者)
    if (w >= 3) {
      groups.push({ type: (w % 3 === 0) ? 'poxwalker' : 'genestealer', count: 3 + Math.floor(w / 3), gap: 0.9 });
    }
    // 遠程火力壓制單位 (槍蟲)
    if (w >= 5) {
      groups.push({ type: 'termagant', count: 4 + Math.floor(w / 2), gap: 0.65 });
    }

    let waveBoss = null;
    if (w === 4) waveBoss = bossNob;
    else if (w === 8) waveBoss = bossBroodlord;
    else if (w === 12) waveBoss = bossCarnifex;

    waves.push({ groups, boss: waveBoss });
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
    sockets: [
      { id: 'c1', x: -160, y: -1500, bonus: 'range', label: '高地瞰角 (+15% 射程)' },
      { id: 'c2', x: -800, y: -1200, bonus: 'haste', label: '西側急彎充能台 (-15% 冷卻)' },
      { id: 'c3', x: -1100, y: -850, bonus: 'damage', label: '懸崖重火伏擊點 (+20% 傷害)' },
      { id: 'c4', x: 600, y: -850, bonus: 'range', label: '東側長廊哨塔 (+15% 射程)' },
      { id: 'c5', x: 900, y: -450, bonus: 'damage', label: '南側轉角戰位 (+20% 傷害)' },
      { id: 'c6', x: -160, y: -120, bonus: 'armor', label: '基地守門護盾座 (+30% 耐久)' },
    ],
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
    sockets: [
      { id: 'f1', x: -1400, y: -150, bonus: 'range', label: '西河高台 (+15% 射程)' },
      { id: 'f2', x: -1100, y: 700, bonus: 'haste', label: '西側轉折充能位 (-15% 冷卻)' },
      { id: 'f3', x: 1400, y: -550, bonus: 'range', label: '東河石崖 (+15% 射程)' },
      { id: 'f4', x: 1000, y: 500, bonus: 'damage', label: '東側急流重火位 (+20% 傷害)' },
      { id: 'f5', x: -160, y: 160, bonus: 'damage', label: '雙河匯流夾擊點 (+20% 傷害)' },
      { id: 'f6', x: 160, y: 160, bonus: 'haste', label: '基地前沿動力節點 (-15% 冷卻)' },
    ],
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
    next: 'td_forgeworld',
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
    sockets: [
      { id: 'ft1', x: 160, y: -1350, bonus: 'range', label: '北大門箭樓 (+15% 射程)' },
      { id: 'ft2', x: -750, y: -1050, bonus: 'haste', label: '西北城牆砲台 (-15% 冷卻)' },
      { id: 'ft3', x: -1050, y: 1350, bonus: 'damage', label: '西南城門堡壘 (+20% 傷害)' },
      { id: 'ft4', x: -350, y: 550, bonus: 'range', label: '西南內門隘口 (+15% 射程)' },
      { id: 'ft5', x: 1050, y: 1350, bonus: 'damage', label: '東南城門堡壘 (+20% 傷害)' },
      { id: 'ft6', x: 350, y: 550, bonus: 'haste', label: '東南內門隘口 (-15% 冷卻)' },
      { id: 'ft7', x: 0, y: -220, bonus: 'armor', label: '要塞核心中樞神盾 (+30% 耐久)' },
    ],
    mechs: [],
    bosses: [],
    hpScale: 1.6,
  },

  td_forgeworld: {
    ...base('lab'),
    id: 'td_forgeworld',
    name: '鑄造世界 ‧ 卡迪亞防線',
    sub: '守塔 ‧ 終極決戰',
    icon: '⚙️',
    desc: '歐姆尼賽亞的泰坦巨型反應爐遭受泰倫蟲群與歐克獸人聯手狂暴圍攻！指揮星界軍步兵營與黎曼魯斯坦克守衛核心。',
    difficulty: 4,
    dnaMult: 2.8,
    next: null,
    td: true,
    coreHp: 5000,
    pathWidth: 155,
    breakTime: 14,
    theme: {
      top: '#180e07', mid: '#100904', bottom: '#080402',
      grid: 'rgba(230,126,34,0.06)', major: 'rgba(243,156,18,0.14)',
      gridStyle: { size: 64, major: 4 },
      bounds: 'rgba(230,81,0,0.75)',
      grade: { c1: '230,126,34', a1: 0.06, c2: '180,40,10', a2: 0.10 },
      vignette: 1.2,
      ground: {
        patches: [{ c: '243,156,18', a: 0.04 }, { c: '230,81,0', a: 0.06 }],
        material: 'metal',
        motif: 'hazard',
        motifColor: 'rgba(0,0,0,0.4)',
        accent: 'rgba(243,156,18,0.2)',
        density: { stain: 0.8, stainRadius: 1.2, motif: 1.5, grain: 1, accents: 1.2, base: 1.2 },
        macro: {
          kind: 'road', cell: 900,
          base: 'rgba(230,126,34,0.05)', line: 'rgba(0,0,0,0.35)', accent: 'rgba(243,156,18,0.2)',
          landmark: ['hazard', 'car'], landmarkCell: 1200, landmarkChance: 0.7,
          escalate: { rgb: '230,81,0', count: 25 },
        },
      },
    },
    decor: ['hazard', 'car', 'bin'],
    decorDensity: 0.5,
    paths: [
      [[-1900, -1450], [-1100, -1450], [-1100, -650], [-450, -650], [-450, -160], [0, 0]],
      [[1900, -1450], [1100, -1450], [1100, -650], [450, -650], [450, -160], [0, 0]],
    ],
    waves: gen40kWaves(),
    rules: { label: '卡迪亞死守令', desc: '兩條主要戰線遭受蟲群與綠皮猛烈衝擊；佈署星界軍兵營與機械製造廠構築阻絕陣線' },
    sockets: [
      { id: 'fw1', x: -1100, y: -1280, bonus: 'range', label: '西北泰倫警戒哨塔 (+15% 射程)' },
      { id: 'fw2', x: -940, y: -800, bonus: 'haste', label: '西北熱能導流節點 (-15% 冷卻)' },
      { id: 'fw3', x: -280, y: -500, bonus: 'damage', label: '西側鑄造重砲戰位 (+20% 傷害)' },
      { id: 'fw4', x: 1100, y: -1280, bonus: 'range', label: '東北歐克警戒哨塔 (+15% 射程)' },
      { id: 'fw5', x: 940, y: -800, bonus: 'haste', label: '東北動力增壓節點 (-15% 冷卻)' },
      { id: 'fw6', x: 280, y: -500, bonus: 'damage', label: '東側鑄造重砲戰位 (+20% 傷害)' },
      { id: 'fw7', x: -180, y: -220, bonus: 'armor', label: '泰坦核心左翼鋼印基座 (+30% 耐久)' },
      { id: 'fw8', x: 180, y: -220, bonus: 'armor', label: '泰坦核心右翼鋼印基座 (+30% 耐久)' },
    ],
    mechs: [],
    bosses: [],
    hpScale: 1.8,
  },
};

export const TD_ORDER = ['td_canyon', 'td_fork', 'td_fortress', 'td_forgeworld'];

// 併入 LEVELS：Spawner、音樂、關卡選單等所有以 id 查關卡的地方都能直接用
Object.assign(LEVELS, TD_LEVELS);

// 場景物件避開路線：守塔關裡 (x,y) 半徑 r 的物件是否會壓到路（含 margin 路肩）。
// 非守塔關一律回傳 false。
export function onPath(level, x, y, r = 0, margin = 30) {
  if (!level || !level.td) return false;
  return nearestOnPaths(level, x, y).d < level.pathWidth / 2 + r + margin;
}

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
