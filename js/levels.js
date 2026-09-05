// 四張關卡的資料定義。波次、Boss 排程、主題配色全部資料化，Spawner 只負責照表操課。
//
// 單局長度統一 8 分鐘 (480 秒) 的快節奏：Boss 在 2:00 / 5:00 出現，8:00 為終極首領，
// 擊敗即通關並解鎖下一關。Boss 血量依實測玩家 DPS 曲線 (2 分 ~200 / 5 分 ~700 / 8 分 ~1200)
// 反推每場約 20~35 秒的理論擊殺時間，再乘上各關難度係數。

export const LEVEL_DURATION = 480;

// pool 是 [敵人 key, 權重] 的清單；interval 為生成間隔 (秒)；batch 為單次生成隻數
export const LEVELS = {
  street: {
    id: 'street',
    name: '淪陷商業街',
    sub: '新手啟航',
    icon: '🌃',
    desc: '霓虹閃爍的破敗夜市街區，喪屍與夜行蝙蝠的第一道防線。',
    difficulty: 1,
    dnaMult: 1,
    next: 'lab',
    theme: {
      top: '#141d30', mid: '#0b1220', bottom: '#070a11',
      grid: 'rgba(255,255,255,0.035)', major: 'rgba(0,229,255,0.10)',
      bounds: 'rgba(255,0,85,0.65)',
    },
    hpScale: 1.0,
    waves: [
      { until: 120, pool: [['walker', 1]], interval: 0.85, batch: 1 },
      { until: 240, pool: [['walker', 0.6], ['bat', 0.4]], interval: 0.6, batch: 1 },
      { until: 360, pool: [['walker', 0.45], ['bat', 0.3], ['brute', 0.25]], interval: 0.45, batch: 1 },
      { until: 480, pool: [['walker', 0.35], ['bat', 0.25], ['brute', 0.2], ['boomer', 0.2]], interval: 0.3, batch: 2 },
    ],
    bosses: [
      { at: 120, hp: 4000, name: '狂暴推土喪屍' },
      { at: 300, hp: 14000, name: '變異清潔工' },
      { at: 480, hp: 42000, name: '巨神‧暴虐霸王龍', final: true },
    ],
  },

  lab: {
    id: 'lab',
    name: '廢棄生化實驗室',
    sub: '狹小壓迫',
    icon: '🧪',
    desc: '陰暗地下設施，突變體與自爆毒蟲成群湧出。',
    difficulty: 2,
    dnaMult: 1.4,
    next: 'frost',
    theme: {
      top: '#12251c', mid: '#0a1712', bottom: '#050c09',
      grid: 'rgba(180,255,200,0.045)', major: 'rgba(0,245,155,0.12)',
      bounds: 'rgba(120,255,120,0.55)',
    },
    hpScale: 1.3,
    waves: [
      { until: 100, pool: [['walker', 0.7], ['boomer', 0.3]], interval: 0.7, batch: 1 },
      { until: 240, pool: [['walker', 0.4], ['boomer', 0.35], ['bat', 0.25]], interval: 0.5, batch: 1 },
      { until: 360, pool: [['boomer', 0.4], ['brute', 0.3], ['bat', 0.3]], interval: 0.4, batch: 2 },
      { until: 480, pool: [['boomer', 0.35], ['brute', 0.35], ['walker', 0.3]], interval: 0.28, batch: 2 },
    ],
    bosses: [
      { at: 120, hp: 5500, name: '生化軟泥聚合體' },
      { at: 300, hp: 19000, name: '外骨骼改造猩猩' },
      { at: 480, hp: 55000, name: '母體‧零號實驗體', final: true },
    ],
  },

  frost: {
    id: 'frost',
    name: '極寒暴風雪基地',
    sub: '速度與風箏考驗',
    icon: '❄️',
    desc: '冰天雪地的軍事雷達基地，血厚的雪怪與俯衝飛鷹輪番施壓。',
    difficulty: 3,
    dnaMult: 1.8,
    next: 'core',
    theme: {
      top: '#16283d', mid: '#0d1a2a', bottom: '#060c14',
      grid: 'rgba(200,235,255,0.05)', major: 'rgba(120,200,255,0.14)',
      bounds: 'rgba(120,200,255,0.6)',
    },
    hpScale: 1.6,
    waves: [
      { until: 100, pool: [['brute', 0.5], ['walker', 0.5]], interval: 0.75, batch: 1 },
      { until: 240, pool: [['brute', 0.4], ['bat', 0.4], ['walker', 0.2]], interval: 0.5, batch: 2 },
      { until: 360, pool: [['brute', 0.45], ['bat', 0.35], ['boomer', 0.2]], interval: 0.38, batch: 2 },
      { until: 480, pool: [['brute', 0.4], ['bat', 0.3], ['boomer', 0.3]], interval: 0.26, batch: 2 },
    ],
    bosses: [
      { at: 120, hp: 7000, name: '冰霜機甲' },
      { at: 300, hp: 24000, name: '極地穿山甲王' },
      { at: 480, hp: 68000, name: '冰霜暴君‧雪帝', final: true },
    ],
  },

  core: {
    id: 'core',
    name: '熔岩核心熔爐',
    sub: '終極死鬥',
    icon: '🌋',
    desc: '漂浮在熔岩湖上的鋼鐵平台，各關精英怪的狂暴版齊聚。',
    difficulty: 4,
    dnaMult: 2.4,
    next: null,
    theme: {
      top: '#301410', mid: '#1c0b09', bottom: '#0d0504',
      grid: 'rgba(255,180,120,0.05)', major: 'rgba(255,120,0,0.16)',
      bounds: 'rgba(255,90,0,0.7)',
    },
    hpScale: 2.0,
    waves: [
      { until: 90, pool: [['brute', 0.5], ['boomer', 0.5]], interval: 0.6, batch: 1 },
      { until: 220, pool: [['brute', 0.4], ['boomer', 0.3], ['bat', 0.3]], interval: 0.42, batch: 2 },
      { until: 360, pool: [['brute', 0.45], ['boomer', 0.3], ['bat', 0.25]], interval: 0.3, batch: 2 },
      { until: 480, pool: [['brute', 0.4], ['boomer', 0.35], ['bat', 0.25]], interval: 0.22, batch: 3 },
    ],
    bosses: [
      { at: 120, hp: 9000, name: '烈焰暴君' },
      { at: 300, hp: 30000, name: '熔核巨獸' },
      { at: 480, hp: 88000, name: '毀滅特工‧暗影鴨', final: true },
    ],
  },
};

export const LEVEL_ORDER = ['street', 'lab', 'frost', 'core'];

// 依時間取出當前波次設定
export function currentWave(level, gameTime) {
  for (const w of level.waves) {
    if (gameTime < w.until) return w;
  }
  return level.waves[level.waves.length - 1];
}

// 依權重抽一種敵人
export function pickEnemy(pool) {
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of pool) {
    r -= w;
    if (r <= 0) return key;
  }
  return pool[0][0];
}
