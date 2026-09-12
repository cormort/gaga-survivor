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
      gridStyle: { size: 64, major: 4 },          // 街廓：標準細格
      bounds: 'rgba(255,0,85,0.65)',
      // 全域調光 (Batch 4)：上下漸層色調 overlay + 暗角強度
      grade: { c1: '80,60,230', a1: 0.05, c2: '8,18,70', a2: 0.09 },
      vignette: 1,
      ground: {
        patches: [{ c: '255,255,255', a: 0.02 }, { c: '120,80,220', a: 0.045 }],
        material: 'asphalt',   // 焦裂柏油路面：粗礫砂點 + 油漬 + 縫裂
        motif: 'crack',        // 柏油裂紋 + 偶發霓虹微光裂縫
        motifColor: 'rgba(0,0,0,0.28)',
        accent: 'rgba(0,229,255,0.10)',
        // 密度旋鈕 (相對於引擎預設值；1 = 不變)。讓「稀疏的商業街」與
        // 「密集的金屬實驗室」用同一套繪製程式碼卻長得完全不一樣。
        density: { stain: 0.6, stainRadius: 1, motif: 1.6, grain: 1, accents: 1 },
        // 宏觀結構：棋盤式街廓 + 霓虹招牌/報廢公車地標
        macro: {
          kind: 'road', cell: 880,
          base: 'rgba(255,255,255,0.045)', line: 'rgba(0,0,0,0.30)', accent: 'rgba(0,229,255,0.16)',
          landmark: ['billboard', 'bus'], landmarkCell: 1150, landmarkChance: 0.6,
          escalate: { rgb: '255,60,120', count: 20 },   // 越到後期地上越多霓虹火星
        },
      },
    },
    decor: ['car', 'bin', 'neon', 'hazard'],
    decorDensity: 0.45,
    hpScale: 1.0,
    // 基準關：不加任何規則，讓新手先熟悉底層手感
    rules: { label: '標準交戰規則', desc: '沒有額外環境修正，適合熟悉操作' },
    // 關卡機制：街頭定期空投物資箱
    mechs: [
      { type: 'supply', interval: 45, jitter: 20 },
    ],
    waves: [
      { until: 65, pool: [['walker', 1]], interval: 0.85, batch: 1 },
      { until: 120, pool: [['walker', 0.72], ['bat', 0.28]], interval: 0.72, batch: 1 },
      { until: 240, pool: [['walker', 0.5], ['bat', 0.25], ['runner', 0.15], ['hound', 0.1]], interval: 0.6, batch: 1 },
      { until: 360, pool: [['walker', 0.35], ['bat', 0.22], ['brute', 0.18], ['runner', 0.18], ['hound', 0.07]], interval: 0.45, batch: 1 },
      { until: 480, pool: [['walker', 0.22], ['bat', 0.16], ['brute', 0.14], ['boomer', 0.13], ['runner', 0.14], ['hound', 0.09], ['spitter', 0.12]], interval: 0.3, batch: 2 },
      // 8 分鐘後：多而脆。玩家唯一要閃的不再只有身體碰撞
      { until: 9999, pool: [['walker', 0.24], ['bat', 0.16], ['brute', 0.1], ['boomer', 0.14], ['runner', 0.16], ['hound', 0.06], ['spitter', 0.14]], interval: 0.26, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 4000, name: '狂暴推土喪屍', speed: 58, damage: 30, skin: 'boss_street' },   // 慢、重、撞一下很痛
      { at: 300, hp: 14000, name: '變異清潔工', speed: 84, damage: 26, behaviors: ['summon'], skin: 'boss_street' },
      { at: 480, hp: 42000, name: '巨神‧暴虐霸王龍', speed: 68, damage: 30, final: true, behaviors: ['nova', 'summon', 'barrage'], skin: 'boss_street' },
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
      gridStyle: { size: 96, major: 3 },          // 實驗室：大塊金屬板
      bounds: 'rgba(120,255,120,0.55)',
      grade: { c1: '0,170,110', a1: 0.05, c2: '0,50,30', a2: 0.08 },
      vignette: 0.9,
      ground: {
        patches: [{ c: '255,255,255', a: 0.02 }, { c: '0,245,155', a: 0.035 }],
        material: 'metal',     // 鏽蝕金屬地板：刷紋 + 面板縫 + 鉚釘
        motif: 'panel',      // 金屬板接縫 + 偶發腐蝕斑
        motifColor: 'rgba(140,255,190,0.07)',
        accent: 'rgba(0,245,155,0.08)',
        density: { stain: 0.78, stainRadius: 1.1, motif: 2.0, grain: 0.6, accents: 1.2 },
        // 宏觀結構：大型金屬板塊 + 艙位圓環 + 培養槽/反應槽地標
        macro: {
          kind: 'plates', cell: 720,
          base: 'rgba(255,255,255,0.030)', line: 'rgba(0,0,0,0.34)', accent: 'rgba(0,245,155,0.14)',
          landmark: ['containment', 'tank'], landmarkCell: 1080, landmarkChance: 0.62,
          escalate: { rgb: '0,245,155', count: 18 },
        },
      },
    },
    decor: ['tank', 'pipes', 'hazard', 'steel'],
    decorDensity: 0.5,
    hpScale: 1.3,
    // 蟲海壓迫：怪多而脆，考驗清群面積而非單體輸出
    rules: {
      label: '蟲潮壓迫', desc: '敵人數量 +40%、血量 -25%，變異體出現率 ×1.6',
      spawnMul: 1.4, enemyHpMul: 0.75, eliteChanceMul: 1.6,
    },
    // 關卡機制：實驗室毒霧池 (玩家踩到持續扣血)
    mechs: [
      { type: 'pool', interval: 24, jitter: 8, radius: 115, dur: 6, dmg: 6, color: '#b5179e' },
    ],
    waves: [
      { until: 55, pool: [['walker', 0.72], ['boomer', 0.28]], interval: 0.8, batch: 1 },
      { until: 100, pool: [['walker', 0.45], ['boomer', 0.28], ['spitter', 0.15], ['spore_host', 0.12]], interval: 0.7, batch: 1 },
      { until: 240, pool: [['walker', 0.3], ['boomer', 0.22], ['bat', 0.16], ['spore_host', 0.14], ['spitter', 0.1], ['hatcher', 0.08]], interval: 0.5, batch: 1 },
      { until: 360, pool: [['boomer', 0.24], ['brute', 0.2], ['bat', 0.16], ['spore_host', 0.16], ['spitter', 0.14], ['hatcher', 0.1]], interval: 0.4, batch: 2 },
      { until: 480, pool: [['boomer', 0.22], ['brute', 0.22], ['walker', 0.14], ['spore_host', 0.16], ['spitter', 0.16], ['hatcher', 0.1]], interval: 0.28, batch: 2 },
      { until: 9999, pool: [['boomer', 0.22], ['brute', 0.16], ['walker', 0.18], ['spore_host', 0.16], ['spitter', 0.18], ['hatcher', 0.1]], interval: 0.24, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 5500, name: '生化軟泥聚合體', speed: 52, damage: 30, behaviors: ['summon'], skin: 'boss_lab' },  // 極慢但黏
      { at: 300, hp: 19000, name: '外骨骼改造猩猩', speed: 96, damage: 30, behaviors: ['nova', 'barrage'], skin: 'boss_lab' },  // 快、追擊型
      { at: 480, hp: 55000, name: '母體‧零號實驗體', speed: 64, damage: 32, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex'], skin: 'boss_lab' },
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
      gridStyle: { size: 64, major: 6, dash: 6 }, // 雪地：虛線格 (風雪感)
      bounds: 'rgba(120,200,255,0.6)',
      grade: { c1: '150,225,255', a1: 0.06, c2: '30,70,140', a2: 0.06 },
      vignette: 1,
      ground: {
        patches: [{ c: '255,255,255', a: 0.025 }, { c: '120,200,255', a: 0.04 }],
        material: 'snow',      // 凍結凍土：密實霜雪顆粒 + 冰晶析出
        motif: 'crystal',    // 凍土冰晶簇 + 霜紋
        motifColor: 'rgba(200,240,255,0.5)',
        accent: 'rgba(160,220,255,0.22)',
        density: { stain: 0.34, stainRadius: 1.25, motif: 2.2, grain: 1.4, accents: 1.1 },
        // 宏觀結構：大面積冰原與凍湖 (長裂縫貫穿) + 墜毀雷達碟/冰晶塔地標
        macro: {
          kind: 'icefield', cell: 950,
          base: 'rgba(190,235,255,0.085)', line: 'rgba(0,0,0,0.20)', accent: 'rgba(255,255,255,0.50)',
          landmark: ['radar', 'icespire'], landmarkCell: 1200, landmarkChance: 0.55,
          escalate: { rgb: '190,235,255', count: 16 },
        },
      },
    },
    decor: ['ice_spike', 'snow', 'radar', 'steel'],
    decorDensity: 0.4,
    hpScale: 1.6,
    // 凍原重甲：怪走得慢但更厚，加上冰面滑行 → 風箏走位關
    rules: {
      label: '凍原重甲', desc: '敵人移速 -20%、血量 +25%；地面結冰會滑行',
      enemySpeedMul: 0.8, enemyHpMul: 1.25,
    },
    // 關卡機制：冰爆地雷 (短暫警示後爆炸，敵我皆傷)
    // 關卡機制：冰爆地雷 + 冰面滑行慣性 (鬆開搖桿後速度指數衰減而非瞬停)
    mechs: [
      { type: 'mine', interval: 30, jitter: 12, radius: 125, fuse: 1.8, dmg: 10, dmgEnemy: 600, color: '#90e0ef' },
      { type: 'ice', friction: 0.92 },
    ],
    waves: [
      { until: 50, pool: [['walker', 0.7], ['brute', 0.3]], interval: 0.8, batch: 1 },
      { until: 100, pool: [['brute', 0.5], ['walker', 0.33], ['bat', 0.17]], interval: 0.75, batch: 1 },
      { until: 240, pool: [['brute', 0.32], ['bat', 0.28], ['walker', 0.14], ['warden', 0.18], ['chimera', 0.08]], interval: 0.5, batch: 2 },
      { until: 360, pool: [['brute', 0.3], ['bat', 0.22], ['boomer', 0.16], ['warden', 0.2], ['hound', 0.06], ['chimera', 0.06]], interval: 0.38, batch: 2 },
      { until: 480, pool: [['brute', 0.23], ['bat', 0.16], ['boomer', 0.18], ['warden', 0.2], ['hound', 0.05], ['chimera', 0.07], ['spitter', 0.11]], interval: 0.26, batch: 2 },
      { until: 9999, pool: [['brute', 0.18], ['bat', 0.18], ['boomer', 0.2], ['warden', 0.16], ['hound', 0.08], ['chimera', 0.07], ['spitter', 0.13]], interval: 0.24, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 7000, name: '冰霜機甲', speed: 46, damage: 34, behaviors: ['ground'], skin: 'boss_frost' },  // 最慢最痛的重甲
      { at: 300, hp: 24000, name: '極地穿山甲王', speed: 104, damage: 28, behaviors: ['nova', 'barrage'], skin: 'boss_frost' },  // 最快
      { at: 480, hp: 68000, name: '冰霜暴君‧雪帝', speed: 60, damage: 34, final: true, behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_frost' },
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
      gridStyle: { size: 48, major: 4 },          // 熔爐：密鋼格柵
      bounds: 'rgba(255,90,0,0.7)',
      grade: { c1: '255,120,30', a1: 0.06, c2: '70,8,0', a2: 0.1 },
      vignette: 1.15,
      ground: {
        patches: [{ c: '255,255,255', a: 0.015 }, { c: '255,120,0', a: 0.05 }],
        material: 'lava',      // 龜裂熔岩岩盤：玄武岩碎屑 + 透光餘燼
        motif: 'lava',       // 龜裂熔岩地殼，裂縫透出橙紅餘燼
        motifColor: 'rgba(255,120,0,0.28)',
        accent: 'rgba(255,170,40,0.5)',
        density: { stain: 0.82, stainRadius: 0.9, motif: 1.8, grain: 1, accents: 1.3 },
        // 宏觀結構：貫穿的岩漿渠道切開玄武岩平台 + 巨型齒輪/熔岩瀑布地標
        macro: {
          kind: 'channels', cell: 1050,
          base: 'rgba(255,80,0,0.30)', line: 'rgba(0,0,0,0.35)', accent: 'rgba(255,225,150,0.55)',
          landmark: ['gear', 'lavafall'], landmarkCell: 1150, landmarkChance: 0.62,
          escalate: { rgb: '255,150,40', count: 30 },
        },
      },
    },
    decor: ['lava_crack', 'steel', 'gear', 'pipes'],
    decorDensity: 0.5,
    hpScale: 2.0,
    // 熔爐試煉：高風險高報酬，玩家與敵人都變得極脆
    rules: {
      label: '熔爐試煉', desc: '我方傷害 +30%，但受到傷害 +50%；金幣 +60%',
      playerDmgMul: 1.3, damageTakenMul: 1.5, goldMul: 1.6,
    },
    // 關卡機制：熔岩噴發 (大範圍、對敵傷害高，幫你清場但要閃)
    // 關卡機制：熔岩噴發 + 安全高台 (隨機亮環，站在範圍外持續扣血)
    mechs: [
      { type: 'geyser', interval: 22, jitter: 8, radius: 170, fuse: 1.5, dmg: 14, dmgEnemy: 1300, color: '#ff7700' },
      { type: 'safeZone', interval: 25, jitter: 8, radius: 130, duration: 8, dmg: 6, color: '#ff9500' },
    ],
    waves: [
      { until: 45, pool: [['walker', 0.55], ['boomer', 0.45]], interval: 0.72, batch: 1 },
      { until: 90, pool: [['brute', 0.4], ['boomer', 0.35], ['spitter', 0.25]], interval: 0.6, batch: 1 },
      { until: 220, pool: [['brute', 0.26], ['boomer', 0.2], ['bat', 0.16], ['runner', 0.16], ['spitter', 0.12], ['hatcher', 0.1]], interval: 0.42, batch: 2 },
      { until: 360, pool: [['brute', 0.24], ['boomer', 0.16], ['bat', 0.12], ['warden', 0.14], ['spore_host', 0.12], ['spitter', 0.1], ['chimera', 0.06], ['hatcher', 0.06]], interval: 0.3, batch: 2 },
      { until: 480, pool: [['brute', 0.2], ['boomer', 0.16], ['bat', 0.1], ['warden', 0.14], ['spore_host', 0.1], ['runner', 0.06], ['spitter', 0.1], ['hound', 0.06], ['hatcher', 0.08]], interval: 0.22, batch: 3 },
      { until: 9999, pool: [['brute', 0.16], ['boomer', 0.16], ['bat', 0.12], ['warden', 0.12], ['spore_host', 0.1], ['runner', 0.08], ['spitter', 0.14], ['hound', 0.06], ['hatcher', 0.06]], interval: 0.2, batch: 5 },
    ],
    bosses: [
      { at: 120, hp: 9000, name: '烈焰暴君', speed: 88, damage: 32, behaviors: ['nova', 'ground'], skin: 'boss_core' },
      { at: 300, hp: 30000, name: '熔核巨獸', speed: 56, damage: 38, behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_core' },  // 慢而致命
      { at: 480, hp: 88000, name: '毀滅特工‧暗影鴨', speed: 90, damage: 38, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex', 'ground'], skin: 'boss_core' },
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
      gridStyle: { size: 80, major: 5, dash: 12 },// 深淵：疏落符文格
      bounds: 'rgba(180,90,255,0.6)',
      grade: { c1: '170,80,255', a1: 0.06, c2: '30,8,70', a2: 0.1 },
      vignette: 1.1,
      ground: {
        patches: [{ c: '255,255,255', a: 0.018 }, { c: '180,120,255', a: 0.05 }],
        material: 'void',      // 虛空星盤：星塵微粒 + 星點 + 符文
        motif: 'void',       // 虛空符文刻痕與星塵
        motifColor: 'rgba(200,160,255,0.16)',
        accent: 'rgba(255,255,255,0.14)',
        density: { stain: 0.30, stainRadius: 1.4, motif: 1.4, grain: 1.2, accents: 1 },
        // 宏觀結構：虛空裂縫與符文圓陣 + 方尖碑地標
        macro: {
          kind: 'rifts', cell: 1100,
          base: 'rgba(60,20,110,0.35)', line: 'rgba(0,0,0,0.30)', accent: 'rgba(200,140,255,0.45)',
          landmark: ['obelisk', 'runecircle'], landmarkCell: 1250, landmarkChance: 0.6,
          escalate: { rgb: '170,80,255', count: 24 },
        },
      },
    },
    decor: ['void_crystal', 'void_obelisk', 'gear'],
    decorDensity: 0.42,
    hpScale: 1,
    // 無盡深淵：全面加壓，用經驗加成補償
    rules: {
      label: '深淵法則', desc: '敵人移速 +20%、變異體出現率 ×2；經驗 +30%',
      enemySpeedMul: 1.2, eliteChanceMul: 2, expMul: 1.3,
    },
    // 關卡機制：縮圈結界 (圈外持續扣血 + 向圈心微推，場地越來越小)
    mechs: [
      { type: 'shrinkCircle', startRadius: 1800, endRadius: 500, shrinkRate: 0.6, dmg: 8, dmgInterval: 0.4, color: '#b388ff' },
    ],
    waves: [
      { until: 1e9, pool: [['walker', 0.14], ['bat', 0.12], ['brute', 0.1], ['boomer', 0.12], ['runner', 0.1], ['warden', 0.08], ['spore_host', 0.08], ['spitter', 0.08], ['hound', 0.08], ['hatcher', 0.06], ['chimera', 0.04]], interval: 0.55, batch: 2 },
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

// 無盡後期的 Boss 間隔：90 秒起，每分鐘縮 2 秒，最短 45 秒。固定 90 秒的話
// 後期玩家火力早就過剩，Boss 之間的空檔只是在等下一隻。
export function endlessBossInterval(gameTime) {
  return Math.max(45, ENDLESS_BOSS_INTERVAL - (gameTime / 60) * 2);
}

// ── 關卡規則層 ───────────────────────────────────────────────
// 每關除了敵人組成與地形機制，再掛一組「常駐規則」改變玩法手感。
// 每日挑戰的詞綴走同一套欄位與同一個合併函式，兩邊共用一份注入層。
export const RULE_DEFAULTS = {
  enemySpeedMul: 1,   // 敵人移速
  enemyHpMul: 1,      // 敵人血量 (疊在 hpScale 之上)
  spawnMul: 1,        // 生成密度 (直接縮短生成間隔)
  eliteChanceMul: 1,  // 精英詞綴機率
  playerDmgMul: 1,    // 玩家武器輸出
  damageTakenMul: 1,  // 玩家受到的傷害
  goldMul: 1,         // 金幣收益
  expMul: 1,          // 經驗獲得
  turretCdr: 1,       // 砲塔冷卻倍率 (每日詞綴「淘金狂熱」用；先前沒有這個欄位
                      // 導致 mergeRules 直接丟掉它，README 宣傳的 -35% 從未生效)
};

// 把關卡規則與每日詞綴相乘合併 (缺的欄位一律當 1)
export function mergeRules(...sources) {
  const out = { ...RULE_DEFAULTS };
  for (const src of sources) {
    if (!src) continue;
    for (const k of Object.keys(RULE_DEFAULTS)) {
      if (typeof src[k] === 'number') out[k] *= src[k];
    }
  }
  return out;
}

// 敵人隨時間 / 關卡難度的成長係數 (Spawner、孵化、裂解共用一份公式)
//
// dmg 的封頂原本是 1.8×，8 分鐘就到頂 —— 但血量無上限成長，於是 23 分鐘的怪比
// 8 分鐘的耐打 5 倍、傷害卻一模一樣，玩家又多了二十幾級與整套裝備，結果是
// 「完全不會死，只是磨得久」。封頂拉到 3.5×，斜率不變 (約 25 分鐘到頂)，
// 前 8 分鐘的體驗完全不受影響。
export function enemyScale(gameTime, level, rules = RULE_DEFAULTS) {
  const endless = level && level.id === 'endless';
  return {
    // 0.4 → 0.28：後期改走「數量多、單隻脆」而不是「一隻一隻變成肉山」。
    // 8 分鐘時的血量倍率由 4.2 降為 3.24，配合下面各關卡新增的高 batch 末波。
    hp: (1 + (gameTime / 60) * 0.28) * ((level && level.hpScale) || 1)
        * (endless ? 1 + gameTime / 300 : 1) * rules.enemyHpMul
        // 後期二次項：玩家輸出實測 2→20 分鐘成長 413 倍，血量只成長 26 倍，
        // 於是雜兵在接近途中就被清掉。10 分鐘前不動 (維持「多而脆」的手感)，
        // 之後才加速追上。23 分鐘時整體倍率約為原本的 2.1 倍。
        * (1 + Math.pow(Math.max(0, gameTime / 60 - 10), 2) * 0.012),
    dmg: Math.min(3.5, 1 + (gameTime / 60) * 0.1),
    // 移動速度原本完全不隨時間成長，而玩家有移速升級 —— 實測「中位敵人距離」
    // 全程卡在 400px，雜兵根本走不到玩家面前。緩升並封頂 1.5×。
    speed: rules.enemySpeedMul * Math.min(1.5, 1 + (gameTime / 60) * 0.03),
  };
}

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
  { id: 'glass_cannon', name: '💥 玻璃大砲', desc: '全武器傷害 +75%，受到傷害 +60%', playerDmgMul: 1.75, damageTakenMul: 1.6, survivalRisk: true },
  { id: 'gold_rush', name: '🪙 淘金狂熱', desc: '金幣獲取 +100%，砲塔冷卻縮短 35%', goldMul: 2.0, turretCdr: 0.65 },
  { id: 'dense_swarm', name: '🧟 狂暴怪海', desc: '怪物數量 +40%，雜兵血量 -25%', spawnMul: 1.4, enemyHpMul: 0.75 },
  { id: 'vampiric', name: '🩸 吸血盛宴', desc: '生命上限 -25，擊殺精英怪立即回血 30', maxHpOffset: -25, eliteHeal: 30, survivalRisk: true },
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

  // 削生存能力的詞綴最多一個。glass_cannon (受傷 +60%) 與 vampiric (生命上限 -25)
  // 同時抽中會變成純懲罰疊加，那天的難度直接爆掉。
  const pool2 = m1.survivalRisk ? mods.filter((m) => !m.survivalRisk) : mods;
  const m2Idx = Math.floor(lcg() * pool2.length);
  const m2 = pool2[m2Idx];

  return {
    date: d,
    levelKey,
    modifiers: [m1, m2],
  };
}
