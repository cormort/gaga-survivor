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
        density: { stain: 0.6, stainRadius: 1, motif: 1.6, grain: 1, accents: 1, base: 1.15 },  // base = 材質底層起伏（柏油坑疤多）
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
      { until: 65, pool: [['walker', 0.893], ['spitter', 0.107]], interval: 0.85, batch: 1 },
      { until: 120, pool: [['walker', 0.643], ['bat', 0.25], ['spitter', 0.107]], interval: 0.72, batch: 1 },
      { until: 240, pool: [['walker', 0.446], ['bat', 0.223], ['runner', 0.134], ['hound', 0.089], ['spitter', 0.107]], interval: 0.6, batch: 1 },
      { until: 360, pool: [['walker', 0.315], ['bat', 0.198], ['brute', 0.162], ['runner', 0.162], ['hound', 0.063], ['blinker', 0.063], ['spitter', 0.108]], interval: 0.45, batch: 1 },
      { until: LEVEL_DURATION, pool: [['walker', 0.165], ['bat', 0.12], ['brute', 0.105], ['boomer', 0.097], ['runner', 0.105], ['hound', 0.067], ['spitter', 0.359], ['blinker', 0.052]], interval: 0.3, batch: 2 },
      // 8 分鐘後：多而脆。玩家唯一要閃的不再只有身體碰撞
      { until: 9999, pool: [['walker', 0.172], ['bat', 0.114], ['brute', 0.071], ['boomer', 0.101], ['runner', 0.114], ['hound', 0.043], ['spitter', 0.403], ['blinker', 0.05]], interval: 0.26, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 4000, name: '狂暴推土喪屍', speed: 58, damage: 30, skin: 'boss_street' },   // 慢、重、撞一下很痛
      { at: 300, hp: 14000, name: '變異清潔工', speed: 84, damage: 26, behaviors: ['summon'], skin: 'boss_street' },
      { at: LEVEL_DURATION, hp: 42000, name: '巨神‧暴虐霸王龍', speed: 68, damage: 30, final: true, behaviors: ['nova', 'summon', 'barrage'], skin: 'boss_street' },
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
        density: { stain: 0.78, stainRadius: 1.1, motif: 2.0, grain: 0.6, accents: 1.2, base: 0.8 },   // 金屬地板平整
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
      { until: 55, pool: [['walker', 0.643], ['boomer', 0.25], ['spitter', 0.107]], interval: 0.8, batch: 1 },
      { until: 100, pool: [['walker', 0.31], ['boomer', 0.193], ['spitter', 0.414], ['spore_host', 0.082]], interval: 0.7, batch: 1 },
      { until: 240, pool: [['walker', 0.231], ['boomer', 0.169], ['bat', 0.123], ['spore_host', 0.107], ['spitter', 0.308], ['hatcher', 0.062]], interval: 0.5, batch: 1 },
      { until: 360, pool: [['boomer', 0.172], ['brute', 0.144], ['bat', 0.114], ['spore_host', 0.114], ['spitter', 0.403], ['hatcher', 0.071], ['medic', 0.05]], interval: 0.4, batch: 2 },
      { until: LEVEL_DURATION, pool: [['boomer', 0.152], ['brute', 0.152], ['walker', 0.097], ['spore_host', 0.11], ['spitter', 0.441], ['hatcher', 0.069], ['medic', 0.048]], interval: 0.28, batch: 2 },
      { until: 9999, pool: [['boomer', 0.146], ['brute', 0.106], ['walker', 0.12], ['spore_host', 0.106], ['spitter', 0.478], ['hatcher', 0.067], ['medic', 0.047]], interval: 0.24, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 5500, name: '生化軟泥聚合體', speed: 52, damage: 30, behaviors: ['summon'], skin: 'boss_lab' },  // 極慢但黏
      { at: 300, hp: 19000, name: '外骨骼改造猩猩', speed: 96, damage: 30, behaviors: ['nova', 'barrage'], skin: 'boss_lab' },  // 快、追擊型
      { at: LEVEL_DURATION, hp: 55000, name: '母體‧零號實驗體', speed: 64, damage: 32, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex'], skin: 'boss_lab' },
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
        density: { stain: 0.34, stainRadius: 1.25, motif: 2.2, grain: 1.4, accents: 1.1, base: 0.75 }, // 雪面起伏平緩
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
      { until: 50, pool: [['walker', 0.625], ['brute', 0.268], ['spitter', 0.107]], interval: 0.8, batch: 1 },
      { until: 100, pool: [['brute', 0.446], ['walker', 0.295], ['bat', 0.152], ['spitter', 0.107]], interval: 0.75, batch: 1 },
      { until: 240, pool: [['brute', 0.286], ['bat', 0.25], ['walker', 0.125], ['warden', 0.161], ['chimera', 0.071], ['spitter', 0.107]], interval: 0.5, batch: 2 },
      { until: 360, pool: [['brute', 0.251], ['bat', 0.184], ['boomer', 0.134], ['warden', 0.167], ['hound', 0.05], ['chimera', 0.05], ['sniper', 0.233]], interval: 0.38, batch: 2 },
      { until: LEVEL_DURATION, pool: [['brute', 0.153], ['bat', 0.106], ['boomer', 0.12], ['warden', 0.133], ['hound', 0.033], ['chimera', 0.047], ['spitter', 0.292], ['sniper', 0.186]], interval: 0.26, batch: 2 },
      { until: 9999, pool: [['brute', 0.116], ['bat', 0.116], ['boomer', 0.129], ['warden', 0.103], ['hound', 0.051], ['chimera', 0.045], ['spitter', 0.333], ['sniper', 0.18]], interval: 0.24, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 7000, name: '冰霜機甲', speed: 46, damage: 34, behaviors: ['ground'], skin: 'boss_frost' },  // 最慢最痛的重甲
      { at: 300, hp: 24000, name: '極地穿山甲王', speed: 104, damage: 28, behaviors: ['nova', 'barrage'], skin: 'boss_frost' },  // 最快
      { at: LEVEL_DURATION, hp: 68000, name: '冰霜暴君‧雪帝', speed: 60, damage: 34, final: true, behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_frost' },
    ],
  },

  core: {
    id: 'core',
    name: '熔岩核心熔爐',
    sub: '高溫死鬥',
    icon: '🌋',
    desc: '漂浮在熔岩湖上的鋼鐵平台，各關精英怪的狂暴版齊聚。',
    difficulty: 4,
    dnaMult: 2.4,
    next: 'subway',
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
        density: { stain: 0.82, stainRadius: 0.9, motif: 1.8, grain: 1, accents: 1.3, base: 1.3 },     // 玄武岩最粗獷
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
      { until: 45, pool: [['walker', 0.491], ['boomer', 0.402], ['spitter', 0.107]], interval: 0.72, batch: 1 },
      { until: 90, pool: [['brute', 0.229], ['boomer', 0.2], ['spitter', 0.571]], interval: 0.6, batch: 1 },
      { until: 220, pool: [['brute', 0.191], ['boomer', 0.147], ['bat', 0.118], ['runner', 0.118], ['spitter', 0.353], ['hatcher', 0.073]], interval: 0.42, batch: 2 },
      { until: 360, pool: [['brute', 0.19], ['boomer', 0.127], ['bat', 0.095], ['warden', 0.111], ['spore_host', 0.095], ['spitter', 0.317], ['chimera', 0.047], ['hatcher', 0.047], ['blinker', 0.055], ['medic', 0.055]], interval: 0.3, batch: 2 },
      { until: LEVEL_DURATION, pool: [['brute', 0.158], ['boomer', 0.127], ['bat', 0.079], ['warden', 0.111], ['spore_host', 0.079], ['runner', 0.047], ['spitter', 0.317], ['hound', 0.047], ['hatcher', 0.064], ['blinker', 0.055], ['medic', 0.055]], interval: 0.22, batch: 3 },
      { until: 9999, pool: [['brute', 0.116], ['boomer', 0.116], ['bat', 0.088], ['warden', 0.088], ['spore_host', 0.073], ['runner', 0.058], ['spitter', 0.409], ['hound', 0.043], ['hatcher', 0.043], ['blinker', 0.051], ['medic', 0.051]], interval: 0.2, batch: 5 },
    ],
    bosses: [
      { at: 120, hp: 9000, name: '烈焰暴君', speed: 88, damage: 32, behaviors: ['nova', 'ground'], skin: 'boss_core' },
      { at: 300, hp: 30000, name: '熔核巨獸', speed: 56, damage: 38, behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_core' },  // 慢而致命
      { at: LEVEL_DURATION, hp: 88000, name: '毀滅特工‧暗影鴨', speed: 90, damage: 38, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex', 'ground'], skin: 'boss_core' },
    ],
  },

  // ── 以下三關是這次新增的：核心熔爐之後、無盡深淵之前 ──────────────────
  // 通關核心（難度 4）之後，玩家原本只剩「無盡深淵」這一個無限模式可打，
  // 少了三個「有終點、有自己規則」的挑戰。三關都沿用既有的地形材質/機制白名單
  // （material: metal/void/asphalt、motif: panel/crystal/crack、macro: channels/rifts/plates、
  // mech: mine/pool/geyser/supply/safeZone），差異來自配色、密度旋鈕、波次組成與 Boss 行為，
  // 只有 Boss 是新的美術（boss_subway / boss_swamp / boss_storm）。

  subway: {
    id: 'subway',
    name: '鏽蝕地下鐵',
    sub: '窄道圍殺',
    icon: '🚇',
    desc: '報廢的地鐵隧道與月台，裝甲巡邏隊與獵犬在狹長通道裡前後包夾。',
    difficulty: 5,
    dnaMult: 2.8,
    next: 'swamp',
    theme: {
      top: '#2a1e14', mid: '#19120c', bottom: '#0a0806',
      grid: 'rgba(255,200,140,0.045)', major: 'rgba(255,150,70,0.13)',
      gridStyle: { size: 56, major: 4 },          // 隧道：密鋼軌道格
      bounds: 'rgba(255,150,70,0.7)',
      grade: { c1: '255,160,70', a1: 0.05, c2: '60,28,10', a2: 0.1 },
      vignette: 1.2,                              // 隧道裡視野本來就窄
      ground: {
        patches: [{ c: '255,255,255', a: 0.018 }, { c: '255,150,70', a: 0.045 }],
        material: 'metal',     // 鏽蝕鋼板與鉚釘
        motif: 'panel',        // 面板接縫 + 鏽斑
        motifColor: 'rgba(255,170,90,0.22)',
        accent: 'rgba(255,205,130,0.4)',
        density: { stain: 0.72, stainRadius: 0.95, motif: 2.0, grain: 1.2, accents: 1.2, base: 1.2 },
        macro: {
          kind: 'channels', cell: 900,
          base: 'rgba(120,80,50,0.30)', line: 'rgba(0,0,0,0.38)', accent: 'rgba(255,190,110,0.45)',
          landmark: ['bus', 'gear'], landmarkCell: 1050, landmarkChance: 0.6,
          escalate: { rgb: '255,150,70', count: 22 },
        },
      },
    },
    decor: ['pipes', 'steel', 'tank', 'bin', 'hazard'],
    decorDensity: 0.55,
    hpScale: 2.3,
    // 鏽蝕圍殺：通道窄、獵犬快，靠密度而不是靠單體強度施壓
    rules: {
      label: '鏽蝕圍殺', desc: '敵人移速 +15%、生成密度 +20%；金幣 +40%',
      enemySpeedMul: 1.15, spawnMul: 1.2, goldMul: 1.4,
    },
    // 關卡機制：軌道爆破地雷 + 定期空投物資
    mechs: [
      { type: 'mine', interval: 24, jitter: 10, radius: 150, fuse: 1.4, dmg: 16, dmgEnemy: 1500, color: '#ffb703' },
      { type: 'supply', interval: 50, jitter: 18 },
    ],
    waves: [
      { until: 45, pool: [['walker', 0.446], ['hound', 0.446], ['spitter', 0.107]], interval: 0.7, batch: 1 },
      { until: 100, pool: [['hound', 0.357], ['runner', 0.268], ['walker', 0.268], ['spitter', 0.107]], interval: 0.6, batch: 1 },
      { until: 220, pool: [['hound', 0.231], ['runner', 0.2], ['brute', 0.154], ['bat', 0.107], ['spitter', 0.308]], interval: 0.46, batch: 2 },
      { until: 360, pool: [['hound', 0.173], ['runner', 0.133], ['brute', 0.133], ['warden', 0.093], ['spitter', 0.32], ['bat', 0.054], ['sniper', 0.187], ['medic', 0.047]], interval: 0.34, batch: 2 },
      { until: LEVEL_DURATION, pool: [['hound', 0.147], ['runner', 0.12], ['brute', 0.12], ['warden', 0.093], ['spitter', 0.32], ['chimera', 0.054], ['bat', 0.054], ['sniper', 0.187], ['medic', 0.047]], interval: 0.26, batch: 3 },
      { until: 9999, pool: [['hound', 0.129], ['runner', 0.116], ['brute', 0.103], ['warden', 0.077], ['spitter', 0.36], ['chimera', 0.064], ['bat', 0.064], ['sniper', 0.18], ['medic', 0.045]], interval: 0.22, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 12000, name: '裝甲列車長', speed: 70, damage: 34, behaviors: ['ground'], skin: 'boss_subway' },
      { at: 300, hp: 36000, name: '軌道劊子手', speed: 96, damage: 30, behaviors: ['nova', 'barrage'], skin: 'boss_subway' },
      { at: LEVEL_DURATION, hp: 105000, name: '鏽鐵暴君‧終末列車', speed: 74, damage: 36, final: true, behaviors: ['summon', 'nova', 'barrage', 'ground'], skin: 'boss_subway' },
    ],
  },

  swamp: {
    id: 'swamp',
    name: '毒霧沼澤',
    sub: '持續消耗',
    icon: '☣️',
    desc: '孢子覆蓋的死水沼地，毒霧與自爆孢子囊逼你在移動中取捨安全區。',
    difficulty: 6,
    dnaMult: 3.3,
    next: 'storm',
    theme: {
      top: '#0b2226', mid: '#061418', bottom: '#030b0d',
      // 刻意偏「毒霧青」而不是純綠：實驗室那關已經是純綠金屬，兩張綠地圖在全域調光後
      // 一度只差 11%（8×8 區塊平均）—— 把沼澤推到青（藍 ≥ 綠）並加密孢子結晶簇才拉開。
      grid: 'rgba(130,245,245,0.045)', major: 'rgba(70,235,230,0.14)',
      gridStyle: { size: 72, major: 5, dash: 8 },   // 有機質地：疏落虛線
      bounds: 'rgba(70,235,230,0.6)',
      grade: { c1: '50,235,235', a1: 0.055, c2: '4,45,55', a2: 0.11 },
      vignette: 1.15,
      ground: {
        patches: [{ c: '255,255,255', a: 0.015 }, { c: '70,240,235', a: 0.05 }],
        material: 'void',      // 星塵微粒在這裡讀成漂浮孢子
        motif: 'crystal',      // 孢子結晶簇（密度調高，跟實驗室的板縫區隔）
        motifColor: 'rgba(110,245,240,0.34)',
        accent: 'rgba(150,250,245,0.30)',
        density: { stain: 0.5, stainRadius: 1.15, motif: 2.4, grain: 1.3, accents: 1.1, base: 1.05 },
        macro: {
          kind: 'rifts', cell: 980,
          base: 'rgba(20,80,50,0.35)', line: 'rgba(0,0,0,0.30)', accent: 'rgba(120,255,170,0.40)',
          landmark: ['obelisk', 'runecircle'], landmarkCell: 1150, landmarkChance: 0.58,
          escalate: { rgb: '110,255,150', count: 26 },
        },
      },
    },
    decor: ['void_crystal', 'bin', 'hazard', 'pipes'],
    decorDensity: 0.5,
    hpScale: 2.6,
    // 劇毒領域：怪更厚、變異體更多，但經驗補償
    rules: {
      label: '劇毒領域', desc: '敵人血量 +30%、變異體出現率 ×1.5；經驗 +20%',
      enemyHpMul: 1.3, eliteChanceMul: 1.5, expMul: 1.2,
    },
    // 關卡機制：毒沼池 + 孢子噴發
    mechs: [
      { type: 'pool', interval: 16, jitter: 6, radius: 150, dur: 9, dmg: 11, color: '#7dff8f' },
      { type: 'geyser', interval: 20, jitter: 8, radius: 180, fuse: 1.2, dmg: 16, dmgEnemy: 1800, color: '#7dff8f' },
    ],
    waves: [
      { until: 40, pool: [['walker', 0.536], ['sporeling', 0.357], ['spitter', 0.107]], interval: 0.7, batch: 1 },
      { until: 90, pool: [['sporeling', 0.211], ['walker', 0.158], ['spitter', 0.632]], interval: 0.6, batch: 1 },
      { until: 200, pool: [['spore_host', 0.163], ['spitter', 0.609], ['brute', 0.108], ['walker', 0.065], ['hatcher', 0.054]], interval: 0.44, batch: 2 },
      { until: 340, pool: [['spore_host', 0.143], ['spitter', 0.528], ['hatcher', 0.088], ['brute', 0.099], ['warden', 0.055], ['chimera', 0.033], ['blinker', 0.039], ['sniper', 0.154]], interval: 0.34, batch: 2 },
      { until: LEVEL_DURATION, pool: [['spore_host', 0.129], ['spitter', 0.467], ['hatcher', 0.093], ['brute', 0.093], ['warden', 0.07], ['chimera', 0.047], ['hound', 0.035], ['blinker', 0.041], ['sniper', 0.163]], interval: 0.26, batch: 3 },
      { until: 9999, pool: [['spore_host', 0.113], ['spitter', 0.499], ['hatcher', 0.091], ['brute', 0.08], ['warden', 0.057], ['chimera', 0.057], ['hound', 0.046], ['blinker', 0.04], ['sniper', 0.159]], interval: 0.22, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 15000, name: '孢子主教', speed: 62, damage: 32, behaviors: ['summon'], skin: 'boss_swamp' },
      { at: 300, hp: 42000, name: '腐沼巨口', speed: 80, damage: 36, behaviors: ['nova', 'barrage'], skin: 'boss_swamp' },
      { at: LEVEL_DURATION, hp: 125000, name: '疫霧之母‧腐潮', speed: 66, damage: 38, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex'], skin: 'boss_swamp' },
    ],
  },

  storm: {
    id: 'storm',
    name: '沙暴要塞',
    sub: '視野與極速',
    icon: '🏜️',
    desc: '黃沙掩埋的裝甲要塞，快速部隊在沙幕裡突進，視野與反應都被壓縮。',
    difficulty: 7,
    dnaMult: 3.9,
    next: 'foundry',
    theme: {
      top: '#2b2418', mid: '#1a150d', bottom: '#0b0906',
      grid: 'rgba(255,230,160,0.04)', major: 'rgba(255,205,90,0.12)',
      gridStyle: { size: 60, major: 4, dash: 4 },   // 沙塵：短虛線
      bounds: 'rgba(255,205,90,0.6)',
      grade: { c1: '255,215,130', a1: 0.055, c2: '70,52,12', a2: 0.09 },
      vignette: 1.3,                                // 沙暴吃掉視野邊緣
      ground: {
        patches: [{ c: '255,255,255', a: 0.02 }, { c: '255,205,90', a: 0.05 }],
        material: 'asphalt',   // 被砂礫磨過的硬地
        motif: 'crack',        // 乾裂沙岩紋
        motifColor: 'rgba(0,0,0,0.30)',
        accent: 'rgba(255,225,150,0.3)',
        density: { stain: 0.45, stainRadius: 1.1, motif: 1.7, grain: 1.5, accents: 1, base: 1.1 },
        macro: {
          kind: 'plates', cell: 820,
          base: 'rgba(150,120,60,0.28)', line: 'rgba(0,0,0,0.32)', accent: 'rgba(255,220,140,0.42)',
          landmark: ['radar', 'bus'], landmarkCell: 1000, landmarkChance: 0.6,
          escalate: { rgb: '255,205,90', count: 28 },
        },
      },
    },
    decor: ['car', 'tank', 'hazard', 'steel', 'radar'],
    decorDensity: 0.5,
    hpScale: 3.0,
    // 沙暴侵襲：又快又多，靠金幣補償（這關是無盡之前的最終裝備檢查點）
    rules: {
      label: '沙暴侵襲', desc: '敵人移速 +25%、生成密度 +30%；金幣 +70%',
      enemySpeedMul: 1.25, spawnMul: 1.3, goldMul: 1.7,
    },
    // 關卡機制：沙暴噴發 + 掩體（站在掩體外持續受傷）
    mechs: [
      { type: 'geyser', interval: 18, jitter: 6, radius: 190, fuse: 1.2, dmg: 18, dmgEnemy: 2200, color: '#ffd166' },
      { type: 'safeZone', interval: 22, jitter: 8, radius: 120, duration: 7, dmg: 8, color: '#ffb703' },
    ],
    waves: [
      { until: 40, pool: [['runner', 0.536], ['walker', 0.357], ['spitter', 0.107]], interval: 0.6, batch: 1 },
      { until: 90, pool: [['runner', 0.402], ['hound', 0.268], ['bat', 0.223], ['spitter', 0.107]], interval: 0.5, batch: 1 },
      { until: 200, pool: [['runner', 0.221], ['hound', 0.176], ['boomer', 0.147], ['bat', 0.103], ['spitter', 0.353]], interval: 0.38, batch: 2 },
      { until: 340, pool: [['runner', 0.234], ['hound', 0.18], ['boomer', 0.162], ['warden', 0.126], ['chimera', 0.09], ['hatcher', 0.108], ['blinker', 0.063], ['spitter', 0.108]], interval: 0.3, batch: 2 },
      { until: LEVEL_DURATION, pool: [['runner', 0.18], ['hound', 0.147], ['boomer', 0.131], ['warden', 0.114], ['chimera', 0.098], ['hatcher', 0.082], ['spitter', 0.262], ['blinker', 0.057]], interval: 0.24, batch: 3 },
      { until: 9999, pool: [['runner', 0.156], ['hound', 0.141], ['boomer', 0.125], ['warden', 0.094], ['chimera', 0.109], ['hatcher', 0.078], ['spitter', 0.313], ['blinker', 0.055]], interval: 0.2, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 18000, name: '沙暴裝甲車', speed: 92, damage: 34, behaviors: ['barrage'], skin: 'boss_storm' },
      { at: 300, hp: 50000, name: '沙蟲女王', speed: 74, damage: 38, behaviors: ['nova', 'summon'], skin: 'boss_storm' },
      { at: LEVEL_DURATION, hp: 150000, name: '天譴沙皇‧烈日', speed: 84, damage: 40, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex', 'ground'], skin: 'boss_storm' },
    ],
  },

  // ── 第二批量身訂做：這三關都用了「既有渲染分支、但組合沒出現過」的地形 ──
  // 前八關用掉的組合是 (asphalt,crack,road) (metal,panel,plates) (snow,crystal,icefield)
  // (lava,lava,channels) (metal,panel,channels) (void,crystal,rifts) (asphalt,crack,plates) (void,void,rifts)，
  // 這裡刻意選三組全新的：(metal,lava,plates)、(snow,void,channels)、(void,crack,road) ——
  // 既有渲染管線、沒有新分支，但畫面與前八關都不會撞。

  foundry: {
    id: 'foundry',
    name: '熔毀鑄造廠',
    sub: '鐵水與重甲',
    icon: '🏭',
    desc: '冷卻中的鑄造產線，鐵水從地縫湧出，重甲守衛在輸送帶之間巡邏。',
    difficulty: 8,
    dnaMult: 4.4,
    next: 'frostvoid',
    theme: {
      top: '#1b1a19', mid: '#111010', bottom: '#070607',
      // 夜間工廠的深灰鐵：底色幾乎無彩度，橘色只出現在地縫（沙暴要塞是亮沙色，
      // 兩者原本都是暖色底 → 8×8 區塊平均只差 7.2%，壓暗底色並拉高裂縫亮度後才分開）
      grid: 'rgba(255,170,120,0.035)', major: 'rgba(255,110,50,0.11)',
      gridStyle: { size: 52, major: 5 },            // 產線：密格柵
      bounds: 'rgba(255,120,60,0.65)',
      grade: { c1: '255,110,40', a1: 0.03, c2: '25,12,6', a2: 0.12 },
      vignette: 1.22,
      ground: {
        patches: [{ c: '255,255,255', a: 0.012 }, { c: '255,110,40', a: 0.035 }],
        material: 'metal',     // 金屬地板（與地鐵同材質、不同配色與花紋）
        motif: 'lava',         // 地縫裡的鐵水：既有的熔岩裂縫模板，換成冷卻中的橘紅
        motifColor: 'rgba(255,110,40,0.34)',
        accent: 'rgba(255,160,90,0.40)',
        density: { stain: 0.76, stainRadius: 0.9, motif: 1.8, grain: 0.95, accents: 1.3, base: 1.15 },
        macro: {
          kind: 'plates', cell: 760,
          base: 'rgba(70,60,55,0.28)', line: 'rgba(0,0,0,0.40)', accent: 'rgba(255,150,80,0.40)',
          landmark: ['gear', 'lavafall'], landmarkCell: 950, landmarkChance: 0.62,
          escalate: { rgb: '255,120,60', count: 26 },
        },
      },
    },
    decor: ['pipes', 'steel', 'gear', 'tank', 'lava_crack'],
    decorDensity: 0.55,
    hpScale: 3.4,
    // 重甲產線：怪更厚、我方更脆，但金幣回報高（換裝備的關）
    rules: {
      label: '鐵水產線', desc: '敵人血量 +40%、我方受到傷害 +25%；金幣 +80%',
      enemyHpMul: 1.4, damageTakenMul: 1.25, goldMul: 1.8,
    },
    mechs: [
      { type: 'geyser', interval: 16, jitter: 6, radius: 200, fuse: 1.1, dmg: 20, dmgEnemy: 2600, color: '#ff7700' },
      { type: 'mine', interval: 20, jitter: 8, radius: 160, fuse: 1.3, dmg: 18, dmgEnemy: 2200, color: '#ffb703' },
    ],
    waves: [
      { until: 40, pool: [['walker', 0.402], ['brute', 0.312], ['boomer', 0.179], ['spitter', 0.107]], interval: 0.66, batch: 1 },
      { until: 95, pool: [['brute', 0.357], ['boomer', 0.268], ['warden', 0.179], ['walker', 0.089], ['spitter', 0.107]], interval: 0.56, batch: 2 },
      { until: 210, pool: [['brute', 0.221], ['warden', 0.176], ['boomer', 0.147], ['hatcher', 0.103], ['spitter', 0.353]], interval: 0.42, batch: 2 },
      { until: 350, pool: [['brute', 0.203], ['warden', 0.172], ['hatcher', 0.125], ['chimera', 0.094], ['boomer', 0.109], ['spitter', 0.313], ['medic', 0.055]], interval: 0.32, batch: 3 },
      { until: LEVEL_DURATION, pool: [['brute', 0.172], ['warden', 0.141], ['hatcher', 0.125], ['chimera', 0.109], ['boomer', 0.109], ['spitter', 0.313], ['hound', 0.047], ['medic', 0.055]], interval: 0.26, batch: 3 },
      { until: 9999, pool: [['brute', 0.156], ['warden', 0.125], ['hatcher', 0.125], ['chimera', 0.125], ['boomer', 0.109], ['spitter', 0.313], ['hound', 0.062], ['medic', 0.055]], interval: 0.22, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 24000, name: '鑄造監督官', speed: 66, damage: 36, behaviors: ['ground'], skin: 'boss_foundry' },
      { at: 300, hp: 62000, name: '鐵水巨兵', speed: 54, damage: 42, behaviors: ['nova', 'summon'], skin: 'boss_foundry' },
      { at: LEVEL_DURATION, hp: 180000, name: '熔毀泰坦‧爐心', speed: 70, damage: 44, final: true, behaviors: ['summon', 'nova', 'barrage', 'ground'], skin: 'boss_foundry' },
    ],
  },

  frostvoid: {
    id: 'frostvoid',
    name: '霜封虛空',
    sub: '冰面與符文',
    icon: '🧊',
    desc: '被虛空符文凍結的冰河渠道，冰面滑行、符文池腐蝕，走位決定生死。',
    difficulty: 9,
    dnaMult: 5.0,
    next: 'voidroad',
    theme: {
      top: '#1a1430', mid: '#100b20', bottom: '#06040f',
      // 紫羅蘭冰原：極寒基地是「亮白藍」，這裡壓暗底色、把符文拉成紫色，
      // 否則兩張冰地圖在全域調光後幾乎同色（8×8 區塊平均只差一位數）
      grid: 'rgba(200,180,255,0.04)', major: 'rgba(170,130,255,0.15)',
      gridStyle: { size: 68, major: 5, dash: 9 },   // 冰河渠道：疏落虛線
      bounds: 'rgba(170,130,255,0.6)',
      grade: { c1: '150,110,255', a1: 0.06, c2: '40,20,90', a2: 0.11 },
      vignette: 1.2,
      ground: {
        patches: [{ c: '255,255,255', a: 0.012 }, { c: '160,120,255', a: 0.05 }],
        material: 'snow',      // 霜雪顆粒
        motif: 'void',         // 但刻的是虛空符文（不是冰晶）
        motifColor: 'rgba(180,150,255,0.36)',
        accent: 'rgba(210,190,255,0.32)',
        density: { stain: 0.34, stainRadius: 1.2, motif: 1.7, grain: 1.1, accents: 1.1, base: 0.8 },
        macro: {
          kind: 'channels', cell: 900,
          base: 'rgba(90,110,190,0.26)', line: 'rgba(0,0,0,0.28)', accent: 'rgba(190,220,255,0.45)',
          landmark: ['icespire', 'runecircle'], landmarkCell: 1100, landmarkChance: 0.6,
          escalate: { rgb: '150,140,255', count: 24 },
        },
      },
    },
    decor: ['ice_spike', 'snow', 'void_crystal', 'radar'],
    decorDensity: 0.45,
    hpScale: 3.8,
    // 冰面 + 符文池：慢怪厚血，靠滑行與走位
    rules: {
      label: '霜封法則', desc: '敵人移速 -10%、血量 +55%；經驗 +35%',
      enemySpeedMul: 0.9, enemyHpMul: 1.55, expMul: 1.35,
    },
    mechs: [
      { type: 'ice', friction: 0.90 },
      { type: 'pool', interval: 15, jitter: 6, radius: 165, dur: 8, dmg: 13, color: '#9d8cff' },
    ],
    waves: [
      { until: 45, pool: [['walker', 0.446], ['brute', 0.268], ['bat', 0.179], ['spitter', 0.107]], interval: 0.66, batch: 1 },
      { until: 100, pool: [['brute', 0.357], ['bat', 0.214], ['warden', 0.179], ['walker', 0.143], ['spitter', 0.107]], interval: 0.56, batch: 2 },
      { until: 215, pool: [['brute', 0.203], ['warden', 0.162], ['chimera', 0.095], ['spitter', 0.433], ['bat', 0.108]], interval: 0.42, batch: 2 },
      { until: 350, pool: [['brute', 0.151], ['warden', 0.126], ['chimera', 0.113], ['spore_host', 0.088], ['spitter', 0.352], ['hound', 0.063], ['sniper', 0.176]], interval: 0.32, batch: 3 },
      { until: LEVEL_DURATION, pool: [['brute', 0.126], ['warden', 0.113], ['chimera', 0.113], ['spore_host', 0.088], ['spitter', 0.352], ['hound', 0.05], ['hatcher', 0.05], ['sniper', 0.176]], interval: 0.26, batch: 3 },
      { until: 9999, pool: [['brute', 0.113], ['warden', 0.101], ['chimera', 0.126], ['spore_host', 0.088], ['spitter', 0.352], ['hound', 0.063], ['hatcher', 0.05], ['sniper', 0.176]], interval: 0.22, batch: 4 },
    ],
    bosses: [
      { at: 120, hp: 30000, name: '霜封守望者', speed: 58, damage: 38, behaviors: ['nova'], skin: 'boss_frostvoid' },
      { at: 300, hp: 72000, name: '虛空冰像', speed: 92, damage: 36, behaviors: ['barrage', 'summon'], skin: 'boss_frostvoid' },
      { at: LEVEL_DURATION, hp: 210000, name: '霜封巨像‧永凍', speed: 62, damage: 46, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex'], skin: 'boss_frostvoid' },
    ],
  },

  voidroad: {
    id: 'voidroad',
    name: '虛空裂道',
    sub: '無盡之前',
    icon: '🕳️',
    desc: '無盡深淵前的最後一段裂道，虛空腐蝕沿著裂縫蔓延，密度與速度同時拉滿。',
    difficulty: 10,
    dnaMult: 5.6,
    next: 'endless',
    theme: {
      top: '#1a1030', mid: '#0e0820', bottom: '#05030c',
      grid: 'rgba(160,220,255,0.04)', major: 'rgba(120,255,235,0.13)',
      gridStyle: { size: 74, major: 6, dash: 14 },  // 裂道：長虛線
      bounds: 'rgba(120,255,235,0.6)',
      grade: { c1: '80,255,225', a1: 0.06, c2: '35,8,55', a2: 0.10 },
      vignette: 1.28,
      ground: {
        patches: [{ c: '255,255,255', a: 0.012 }, { c: '110,255,235', a: 0.05 }],
        material: 'void',      // 虛空星盤
        motif: 'crack',        // 但裂的是實心裂縫（不是符文）
        motifColor: 'rgba(0,0,0,0.38)',
        accent: 'rgba(120,255,235,0.42)',
        density: { stain: 0.32, stainRadius: 1.35, motif: 2.3, grain: 1.15, accents: 1.25, base: 0.95 },
        macro: {
          kind: 'road', cell: 820,
          base: 'rgba(60,30,110,0.32)', line: 'rgba(0,0,0,0.34)', accent: 'rgba(120,255,235,0.42)',
          landmark: ['obelisk', 'containment', 'billboard'], landmarkCell: 1000, landmarkChance: 0.62,
          escalate: { rgb: '120,255,235', count: 30 },
        },
      },
    },
    decor: ['void_crystal', 'void_obelisk', 'neon', 'hazard'],
    decorDensity: 0.48,
    hpScale: 4.2,
    // 無盡之前的最終檢查點：又快又多，金幣爆量
    rules: {
      label: '裂道法則', desc: '敵人移速 +30%、生成 +40%；金幣 +220%',
      enemySpeedMul: 1.3, spawnMul: 1.4, goldMul: 3.2,
    },
    mechs: [
      { type: 'pool', interval: 14, jitter: 5, radius: 170, dur: 9, dmg: 15, color: '#7dffe8' },
      { type: 'supply', interval: 42, jitter: 14 },
    ],
    waves: [
      { until: 40, pool: [['runner', 0.357], ['hound', 0.312], ['walker', 0.223], ['spitter', 0.107]], interval: 0.56, batch: 1 },
      { until: 95, pool: [['runner', 0.304], ['hound', 0.268], ['boomer', 0.179], ['bat', 0.143], ['spitter', 0.107]], interval: 0.48, batch: 2 },
      { until: 210, pool: [['runner', 0.169], ['hound', 0.142], ['boomer', 0.129], ['chimera', 0.091], ['spitter', 0.467]], interval: 0.36, batch: 2 },
      { until: 350, pool: [['runner', 0.199], ['hound', 0.181], ['chimera', 0.163], ['boomer', 0.145], ['warden', 0.109], ['hatcher', 0.109], ['blinker', 0.063], ['medic', 0.063], ['spitter', 0.109]], interval: 0.28, batch: 3 },
      { until: LEVEL_DURATION, pool: [['runner', 0.165], ['hound', 0.148], ['chimera', 0.148], ['boomer', 0.116], ['warden', 0.099], ['hatcher', 0.082], ['spitter', 0.265], ['blinker', 0.057], ['medic', 0.057]], interval: 0.22, batch: 4 },
      { until: 9999, pool: [['runner', 0.142], ['hound', 0.127], ['chimera', 0.158], ['boomer', 0.111], ['warden', 0.095], ['hatcher', 0.079], ['spitter', 0.317], ['blinker', 0.055], ['medic', 0.055]], interval: 0.18, batch: 5 },
    ],
    bosses: [
      { at: 120, hp: 36000, name: '裂道遊魂', speed: 104, damage: 38, behaviors: ['barrage'], skin: 'boss_voidroad' },
      { at: 300, hp: 82000, name: '虛空騎士', speed: 86, damage: 42, behaviors: ['nova', 'vortex'], skin: 'boss_voidroad' },
      { at: LEVEL_DURATION, hp: 250000, name: '裂道行者‧終焉', speed: 88, damage: 48, final: true, behaviors: ['summon', 'nova', 'barrage', 'vortex', 'ground'], skin: 'boss_voidroad' },
    ],
  },

  endless: {
    id: 'endless',
    name: '深淵無盡戰',
    sub: '極限生存',
    icon: '🌀',
    desc: '擊敗虛空裂道的終焉行者後解鎖。無限波次、Boss 每 90 秒輪播降臨，撐得越久拿得越多。',
    difficulty: 11,
    dnaMult: 6.4,
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
        density: { stain: 0.30, stainRadius: 1.4, motif: 1.4, grain: 1.2, accents: 1, base: 0.9 },
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
      { until: 1e9, pool: [['walker', 0.102], ['bat', 0.088], ['brute', 0.073], ['boomer', 0.088], ['runner', 0.073], ['warden', 0.058], ['spore_host', 0.058], ['spitter', 0.233], ['hound', 0.058], ['hatcher', 0.043], ['chimera', 0.029], ['sniper', 0.205], ['medic', 0.051], ['blinker', 0.051]], interval: 0.55, batch: 2 },
    ],
    bosses: [],
  },
};

export const LEVEL_ORDER = ['street', 'lab', 'frost', 'core', 'subway', 'swamp', 'storm',
  'foundry', 'frostvoid', 'voidroad', 'endless'];

// 無盡模式輪播的 Boss 池 (四關 Boss 全收錄)
export const ENDLESS_BOSS_CYCLE = []
  .concat(LEVELS.street.bosses, LEVELS.lab.bosses, LEVELS.frost.bosses, LEVELS.core.bosses,
    LEVELS.subway.bosses, LEVELS.swamp.bosses, LEVELS.storm.bosses,
    LEVELS.foundry.bosses, LEVELS.frostvoid.bosses, LEVELS.voidroad.bosses)
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

// 全域難度：與關卡規則相乘，同一套關卡就能調鬆或調硬；dnaMult 讓收益跟著難度走
//
// 平衡備註（玩家回報「難度提升不夠」後上調）：
//   舊版困難只有血 ×1.4／生成 ×1.4、惡夢 ×2.0／×1.8，而且兩者都沒有碰到
//   「玩家受到的傷害」以外的節奏軸 —— 實際上只是「同一場打久一點」，不是更難。
//   現在每一階都同時加壓五個軸（敵人血量／玩家受傷／生成密度／菁英機率／敵人移速），
//   收益（金幣、DNA）再按風險等比上調；惡夢的 spawnMul 2.3 疊上深淵關的 1.4
//   會逼近 MAX_ENEMIES(250) 的硬上限，這是刻意設計（用數量壓迫走位），
//   效能預算仍由 MAX_ENEMIES 與 worst-case 工具守住。
//
// 第二輪上調（玩家再次回報「難度還是不夠」）：
//   量測到的真正瓶頸不是血量，是**傷害**。舊版雜兵傷害 = 基礎 × min(3.5, 1+分鐘×0.1)，
//   8 分鐘時 ×1.8、20 分鐘就封頂 ×3.5；配上玩家 0.5 秒無敵影格，後期雜兵的實際
//   最大輸出只有約 28 DPS，而玩家此時有 100+ 血、50% 減傷與回復 —— 後期不是難，
//   是死不了。所以這一輪：
//     ① 傷害曲線斜率 0.1 → 0.16、封頂 3.5 → 6.0（見 enemyScale），
//     ② 新增第五階「地獄」，血量級距維持 ≥1.4×，
//     ③ 菁英機率與生成密度一起拉開，讓「數量壓迫」與「單體威脅」同時成立。
//   速度刻意調得保守（原本會逼近 enemyScale 的 1.5× 封頂，調太高會變成不公平的
//   追殺而不是難度）—— 壓力改由傷害與密度提供。
export const DIFFICULTIES = {
  easy:      { name: '🐣 輕鬆', enemyHpMul: 0.65, damageTakenMul: 0.5, spawnMul: 0.85, goldMul: 0.75, dnaMult: 0.6 },
  normal:    { name: '🦆 標準' },
  hard:      { name: '🔥 困難', enemyHpMul: 1.9, damageTakenMul: 1.7, spawnMul: 1.8, eliteChanceMul: 1.6, enemySpeedMul: 1.06, goldMul: 1.40, dnaMult: 1.7 },
  nightmare: { name: '💀 惡夢', enemyHpMul: 3.0, damageTakenMul: 2.4, spawnMul: 2.4, eliteChanceMul: 2.2, enemySpeedMul: 1.14, goldMul: 1.9, dnaMult: 2.6 },
  hell:      { name: '☠️ 地獄', enemyHpMul: 4.2, damageTakenMul: 3.2, spawnMul: 3.0, eliteChanceMul: 3.0, enemySpeedMul: 1.14, goldMul: 2.5, dnaMult: 3.6 },
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

// 敵人基礎移速的全局倍率（單一真相）。為什麼要一個全局旋鈕而不是逐隻改：
// 「近得了身」是**全體**的節奏問題 —— 玩家回報的是「敵人都到不了我面前」，
// 不是某一種怪太慢。逐隻調速度會讓 13 種怪的手感差異（蛇行/撲擊/風箏）一起跑掉，
// 全局倍率則完整保留相對關係。要調手感就改這一個數字。
export const ENEMY_SPEED_BASE = 1.6;

// 敵人隨時間 / 關卡難度的成長係數 (Spawner、孵化、裂解共用一份公式)
//
// dmg 的封頂原本是 1.8×，8 分鐘就到頂 —— 但血量無上限成長，於是 23 分鐘的怪比
// 8 分鐘的耐打 5 倍、傷害卻一模一樣，玩家又多了二十幾級與整套裝備，結果是
// 「完全不會死，只是磨得久」。第一次拉到 3.5× 仍然不夠：配上玩家 0.5 秒的無敵
// 影格，後期雜兵的最大輸出只有約 28 DPS，而此時玩家有 100+ 血＋減傷＋回復。
// 第二次改為斜率 0.16、封頂 6.0，並補上 10 分鐘後的二次項（與血量同一手法），
// 讓「撐得越久」這件事重新有代價。10 分鐘前完全不受影響。
export function enemyScale(gameTime, level, rules = RULE_DEFAULTS) {
  const endless = level && level.id === 'endless';
  return {    // 血量曲線（第三輪：玩家回報「敵人太脆，近不了身」）
    //
    // 實測（tools/probe-enemy-pressure.mjs）在標準難度、真實主迴圈下：
    //   雜兵從生成距離 500px 出發，玩家站著不動、用正常武器 —— **接觸率 0%**。
    //   原因不是玩家太強，是兩條曲線脫節：雜兵血量每分鐘只成長 ×0.28
    //   （8 分鐘 ×3.2），而玩家輸出實測 2→20 分鐘成長 413 倍。雜兵在接近途中就被清掉，
    //   「近戰」這個威脅類別等於不存在。
    //
    // 舊值 0.28 → 0.55、`(1 + (gameTime / 60) * 0.55)`，並另外乘 3 倍：
    //   1 分鐘 ×2.4、3 分鐘 ×4.0、5 分鐘 ×5.7、8 分鐘 ×8.1、20 分鐘 ×18
    //   （搭配各關 hpScale 與難度 enemyHpMul 再往上乘）。
    // 為什麼連前三分鐘也一起加：玩家回報的是全程手感，不是只有後期；
    // 而且雜兵的血量是「能不能走到你面前」的唯一門檻。
    // 3 倍是實測調出來的（tools/probe-enemy-pressure.mjs 的接觸率）：
    // ×2 時 walker 在 5 分鐘只有 75 HP，玩家實測 44 DPS 下 1.7 秒就死，
    // 而牠要走 3.5 秒 —— 接觸率只有 10%，玩家仍然覺得「近不了身」。
    hp: (1 + (gameTime / 60) * 0.55) * 3 * ((level && level.hpScale) || 1)
        * (endless ? 1 + gameTime / 300 : 1) * rules.enemyHpMul
        // 後期二次項：10 分鐘前不動（維持「多而脆」的節奏），之後才加速追上輸出曲線。
        * (1 + Math.pow(Math.max(0, gameTime / 60 - 10), 2) * 0.012),
    // 敵人傷害隨時間的成長（dmg 上限 12 倍，見下方註解）
    dmg: Math.min(
      12,
      Math.min(5.5, 1 + (gameTime / 60) * 0.14)
        // 後期二次項（與血量同一手法）：10 分鐘前完全不動，維持前中期的標準手感，
        // 之後才加速追上玩家的血量與減傷成長。
        * (1 + Math.pow(Math.max(0, gameTime / 60 - 10), 2) * 0.010),
    ),
    // 為什麼要有最外層的 12 倍封頂：沒有它的話 40 分鐘會到 ×80 以上
    //（基礎接觸傷害 8 就等於 640 點一下）—— 那已經不是「難」而是必死，
    // 會把走位與裝備的價值一起抹掉。12 倍 ≈ 96 點基礎傷害：有減傷與裝備的
    // 老手撐得住，站著不動的一定死。
    // 移動速度：原本完全不隨時間成長，而玩家有移速升級 —— 實測「中位敵人距離」
    // 全程卡在 400px，雜兵根本走不到玩家面前。
    //
    // ENEMY_SPEED_BASE = 1.6 是「近得了身」的核心旋鈕（玩家回報的第二個瓶頸）。
    // 為什麼不是只堆血量：實測一輪之後發現，血量 ×2 讓雜兵存活 4.1 秒，
    // 但牠從生成距離 500px 走過來要 6~7 秒 —— 接觸率仍然是 0%。
    // 血量決定「能不能撐到面前」，移速決定「能不能在撐住之前走到」，兩個都要動。
    // 1.6 倍讓 walker 的 500px 行軍從 5.6 秒降到 3.5 秒，配上血量成長才進得了身。
    // 上限 1.5× 與關卡/難度的 enemySpeedMul 照舊，所以地獄的 ×1.14 仍然有效。
    speed: ENEMY_SPEED_BASE * rules.enemySpeedMul * Math.min(1.5, 1 + (gameTime / 60) * 0.03),
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
  // 每日挑戰從「有終點」的關卡裡抽（無盡沒有終點，不適合當每日目標）。
  // 從 LEVEL_ORDER 推導，之後再加關卡會自動進入輪替，不必再改這裡。
  const baseLevelKeys = LEVEL_ORDER.filter((id) => id !== 'endless');
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
