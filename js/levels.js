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
    decor: ['car', 'bin', 'neon'],
    hpScale: 1.0,
    // 關卡機制：街頭定期空投物資箱
    mech: { type: 'supply', interval: 45, jitter: 20 },
    waves: [
      { until: 120, pool: [['walker', 1]], interval: 0.85, batch: 1 },
      { until: 240, pool: [['walker', 0.5], ['bat', 0.3], ['runner', 0.2]], interval: 0.6, batch: 1 },
      { until: 360, pool: [['walker', 0.35], ['bat', 0.25], ['brute', 0.2], ['runner', 0.2]], interval: 0.45, batch: 1 },
      { until: 480, pool: [['walker', 0.28], ['bat', 0.2], ['brute', 0.17], ['boomer', 0.17], ['runner', 0.18]], interval: 0.3, batch: 2 },
    ],
    bosses: [
      { at: 120, hp: 4000, name: '狂暴推土喪屍' },
      { at: 300, hp: 14000, name: '變異清潔工', behaviors: ['summon'] },
      { at: 480, hp: 42000, name: '巨神‧暴虐霸王龍', final: true, behaviors: ['nova', 'summon', 'barrage'] },
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
    decor: ['tank', 'pipes', 'hazard'],
    hpScale: 1.3,
    // 關卡機制：實驗室毒霧池 (玩家踩到持續扣血)
    mech: { type: 'pool', interval: 24, jitter: 8, radius: 115, dur: 6, dmg: 6, color: '#b5179e' },
    waves: [
      { until: 100, pool: [['walker', 0.6], ['boomer', 0.25], ['spitter', 0.15]], interval: 0.7, batch: 1 },
      { until: 240, pool: [['walker', 0.3], ['boomer', 0.25], ['bat', 0.18], ['spore_host', 0.15], ['spitter', 0.12]], interval: 0.5, batch: 1 },
      { until: 360, pool: [['boomer', 0.26], ['brute', 0.22], ['bat', 0.18], ['spore_host', 0.18], ['spitter', 0.16]], interval: 0.4, batch: 2 },
      { until: 480, pool: [['boomer', 0.24], ['brute', 0.24], ['walker', 0.16], ['spore_host', 0.18], ['spitter', 0.18]], interval: 0.28, batch: 2 },
    ],
    bosses: [
      { at: 120, hp: 5500, name: '生化軟泥聚合體', behaviors: ['summon'] },
      { at: 300, hp: 19000, name: '外骨骼改造猩猩', behaviors: ['nova', 'barrage'] },
      { at: 480, hp: 55000, name: '母體‧零號實驗體', final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex'] },
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
    decor: ['ice_spike', 'snow', 'radar'],
    hpScale: 1.6,
    // 關卡機制：冰爆地雷 (短暫警示後爆炸，敵我皆傷)
    mech: { type: 'mine', interval: 30, jitter: 12, radius: 125, fuse: 1.8, dmg: 10, dmgEnemy: 600, color: '#90e0ef' },
    waves: [
      { until: 100, pool: [['brute', 0.5], ['walker', 0.5]], interval: 0.75, batch: 1 },
      { until: 240, pool: [['brute', 0.35], ['bat', 0.3], ['walker', 0.15], ['warden', 0.2]], interval: 0.5, batch: 2 },
      { until: 360, pool: [['brute', 0.35], ['bat', 0.25], ['boomer', 0.18], ['warden', 0.22]], interval: 0.38, batch: 2 },
      { until: 480, pool: [['brute', 0.3], ['bat', 0.22], ['boomer', 0.22], ['warden', 0.26]], interval: 0.26, batch: 2 },
    ],
    bosses: [
      { at: 120, hp: 7000, name: '冰霜機甲', behaviors: ['ground'] },
      { at: 300, hp: 24000, name: '極地穿山甲王', behaviors: ['nova', 'barrage'] },
      { at: 480, hp: 68000, name: '冰霜暴君‧雪帝', final: true, behaviors: ['summon', 'nova', 'barrage'] },
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
    next: 'endless',
    theme: {
      top: '#301410', mid: '#1c0b09', bottom: '#0d0504',
      grid: 'rgba(255,180,120,0.05)', major: 'rgba(255,120,0,0.16)',
      bounds: 'rgba(255,90,0,0.7)',
    },
    decor: ['lava_crack', 'steel', 'gear'],
    hpScale: 2.0,
    // 關卡機制：熔岩噴發 (大範圍、對敵傷害高，幫你清場但要閃)
    mech: { type: 'geyser', interval: 22, jitter: 8, radius: 170, fuse: 1.5, dmg: 14, dmgEnemy: 1300, color: '#ff7700' },
    waves: [
      { until: 90, pool: [['brute', 0.45], ['boomer', 0.4], ['spitter', 0.15]], interval: 0.6, batch: 1 },
      { until: 220, pool: [['brute', 0.28], ['boomer', 0.22], ['bat', 0.18], ['runner', 0.18], ['spitter', 0.14]], interval: 0.42, batch: 2 },
      { until: 360, pool: [['brute', 0.26], ['boomer', 0.18], ['bat', 0.14], ['warden', 0.16], ['spore_host', 0.14], ['spitter', 0.12]], interval: 0.3, batch: 2 },
      { until: 480, pool: [['brute', 0.22], ['boomer', 0.18], ['bat', 0.12], ['warden', 0.16], ['spore_host', 0.12], ['runner', 0.08], ['spitter', 0.12]], interval: 0.22, batch: 3 },
    ],
    bosses: [
      { at: 120, hp: 9000, name: '烈焰暴君', behaviors: ['nova', 'ground'] },
      { at: 300, hp: 30000, name: '熔核巨獸', behaviors: ['summon', 'nova', 'barrage'] },
      { at: 480, hp: 88000, name: '毀滅特工‧暗影鴨', final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex', 'ground'] },
    ],
  },

  endless: {
    id: 'endless',
    name: '深淵無盡戰',
    sub: '極限生存',
    icon: '🌀',
    desc: '擊敗核心首腦後解鎖。無限波次、Boss 每 90 秒輪播降臨，撐得越久拿得越多。',
    difficulty: 5,
    dnaMult: 3,
    next: null,
    theme: {
      top: '#241637', mid: '#140b24', bottom: '#07030f',
      grid: 'rgba(200,160,255,0.05)', major: 'rgba(180,120,255,0.14)',
      bounds: 'rgba(180,90,255,0.6)',
    },
    decor: ['lava_crack', 'gear', 'radar'],
    hpScale: 1,
    waves: [
      { until: 1e9, pool: [['walker', 0.18], ['bat', 0.14], ['brute', 0.12], ['boomer', 0.14], ['runner', 0.12], ['warden', 0.1], ['spore_host', 0.1], ['spitter', 0.1]], interval: 0.55, batch: 2 },
    ],
    bosses: [],
  },
};

export const LEVEL_ORDER = ['street', 'lab', 'frost', 'core', 'endless'];

// 無盡模式輪播的 Boss 池 (四關 Boss 全收錄)
export const ENDLESS_BOSS_CYCLE = []
  .concat(LEVELS.street.bosses, LEVELS.lab.bosses, LEVELS.frost.bosses, LEVELS.core.bosses)
  .map((b) => ({ ...b }));

export const ENDLESS_BOSS_INTERVAL = 90;

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

// 每日挑戰詞綴庫與種子生成
export const DAILY_MODIFIERS = [
  { id: 'hyper_speed', name: '⚡ 極速狂飆', desc: '玩家與怪物速度 +35%', playerSpeedMul: 1.35, enemySpeedMul: 1.35 },
  { id: 'glass_cannon', name: '💥 玻璃大砲', desc: '全武器傷害 +75%，受到傷害 +60%', playerDmgMul: 1.75, damageTakenMul: 1.6 },
  { id: 'gold_rush', name: '🪙 淘金狂熱', desc: '金幣獲取 +100%，砲塔冷卻縮短 35%', goldMul: 2.0, turretCdr: 0.65 },
  { id: 'dense_swarm', name: '🧟 狂暴怪海', desc: '怪物數量 +40%，雜兵血量 -25%', spawnMul: 1.4, hpMul: 0.75 },
  { id: 'vampiric', name: '🩸 吸血盛宴', desc: '生命上限 -25，擊殺精英怪立即回血 30', maxHpOffset: -25, eliteHeal: 30 },
];

export function getDailyChallenge(dateStr = null) {
  const d = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let seed = 0;
  for (let i = 0; i < d.length; i++) seed = (seed * 31 + d.charCodeAt(i)) >>> 0;

  const lcg = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const baseLevelKeys = ['street', 'lab', 'frost', 'core'];
  const levelKey = baseLevelKeys[Math.floor(lcg() * baseLevelKeys.length)];

  const mods = [...DAILY_MODIFIERS];
  const m1Idx = Math.floor(lcg() * mods.length);
  const m1 = mods.splice(m1Idx, 1)[0];
  const m2Idx = Math.floor(lcg() * mods.length);
  const m2 = mods.splice(m2Idx, 1)[0];

  return {
    date: d,
    levelKey,
    modifiers: [m1, m2],
  };
}
