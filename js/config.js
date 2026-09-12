// 嘎嘎特攻 (Gaga Survivor) - 遊戲全局設定與數值配置

export const GAME_CONFIG = {
  // 原本這裡還有 CANVAS_WIDTH/HEIGHT，但它們在 import 時算一次就固定，
  // resize 後即失效，而且引擎用的是 Game 的 this.vw/this.vh —— 沒有任何讀者。
  WORLD_BOUNDS: {
    minX: -2000,
    maxX: 2000,
    minY: -2000,
    maxY: 2000,
  },
  MAX_WEAPON_SLOTS: 4,
  MAX_PASSIVE_SLOTS: 4,
  BASE_EXP_REQUIREMENT: 10,
  EXP_GROWTH_FACTOR: 1.35,
};

// 武器定義
export const WEAPONS = {
  kunai: {
    id: 'kunai',
    name: '特工苦無',
    icon: '🗡️',
    description: '自動朝最近敵人疾速發射穿透苦無。每 5 發蓄能射出燃燒彈。',
    isEvo: false,
    evoTarget: 'ghost_shuriken',
    pairPassive: 'atk_scroll',
    maxLevel: 5,
    baseDamage: 22,
    damageGrowth: 8,
    baseCooldown: 0.7, // 秒
    cooldownGrowth: -0.06,
    speed: 650,
    projectiles: [1, 1, 2, 2, 3], // 各等級發射數量
    pierce: [1, 1, 2, 2, 3],
    charge: { every: 5, effect: 'burn' }, // 每 5 發射出一枚燃燒苦無
  },
  guardian: {
    id: 'guardian',
    name: '守護輪盤',
    icon: '🥏',
    description: '旋轉護盾環繞周身，擊退並割裂靠近的敵人。',
    isEvo: false,
    evoTarget: 'eternal_domain',
    pairPassive: 'max_hp_vest',   // 護身武器 ↔ 生存配件 (原 magnet)
    maxLevel: 5,
    baseDamage: 16,
    damageGrowth: 6,
    baseCooldown: 2.2, // 冷卻（非超武時有旋轉週期）
    duration: 3.5, // 持續旋轉時間
    spinSpeed: 3.5,
    count: [2, 3, 3, 4, 4],
    radius: [65, 75, 80, 90, 95],
  },
  rocket: {
    id: 'rocket',
    name: '高爆火箭',
    icon: '🚀',
    description: '發射鎖定高爆飛彈，命中造成巨大範圍破片爆炸。每 3 發蓄能射出毒氣彈。',
    isEvo: false,
    evoTarget: 'shark_torpedo',
    pairPassive: 'magnet',        // 爆炸清場 → 自動吸寶 (原 range_fuel)
    maxLevel: 5,
    baseDamage: 45,
    damageGrowth: 18,
    baseCooldown: 2.5,
    cooldownGrowth: -0.2,
    speed: 380,
    explosionRadius: [70, 85, 95, 110, 130],
    count: [1, 1, 2, 2, 3],
    charge: { every: 3, effect: 'poison' }, // 每 3 發射出毒氣彈，爆炸範圍內全部中毒
  },
  molotov: {
    id: 'molotov',
    name: '特工燃燒瓶',
    icon: '🍾',
    description: '投擲燃燒瓶在地面鋪展持續灼燒的烈火之海。',
    isEvo: false,
    evoTarget: 'napalm_sea',
    pairPassive: 'range_fuel',    // 火海範圍加大 (原 speed_shoes)
    maxLevel: 5,
    baseDamage: 8, // 每跳傷害
    damageGrowth: 4,
    baseCooldown: 2.8,
    duration: 3.8,
    radius: [55, 65, 75, 85, 95],
    count: [1, 1, 2, 2, 3],
  },
  lightning: {
    id: 'lightning',
    name: '雷電矩陣',
    icon: '⚡',
    description: '召喚天頂落雷，定點重創隨機敵人。',
    isEvo: false,
    evoTarget: 'plasma_storm',
    pairPassive: 'cdr_battery',
    maxLevel: 5,
    baseDamage: 36,
    damageGrowth: 14,
    baseCooldown: 1.8,
    cooldownGrowth: -0.15,
    strikes: [1, 2, 2, 3, 4],
  },
  soccer: {
    id: 'soccer',
    name: '量子足球',
    icon: '⚽',
    description: '踢出高彈力金屬足球，在怪群與空間中高速彈射。每 3 顆蓄能射出冰凍球。',
    isEvo: false,
    evoTarget: 'quantum_sphere',
    pairPassive: 'speed_shoes',   // 走位控球/追球 (原 max_hp_vest)
    maxLevel: 5,
    baseDamage: 28,
    damageGrowth: 10,
    baseCooldown: 3.2,
    speed: 520,
    bounces: [5, 7, 9, 12, 16],
    count: [1, 1, 2, 2, 3],
    charge: { every: 3, effect: 'freeze' }, // 每 3 顆射出冰凍球
  },

  // 超武 (Evo Weapons)
  ghost_shuriken: {
    id: 'ghost_shuriken',
    name: '幽靈手裏劍 (超武)',
    icon: '✨🗡️',
    description: '無需停歇！極限暴風加特林式連續全自動追蹤發射，每 6 發挾帶燃燒彈。',
    isEvo: true,
    baseWeapon: 'kunai',
    baseDamage: 46,  // 40 時單體 DPS 反而略低於滿級苦無
    baseCooldown: 0.12, // 極致機槍射速
    speed: 800,
    projectiles: 1,
    pierce: 5,
    charge: { every: 6, effect: 'burn' }, // 射速快，間隔拉長
  },
  eternal_domain: {
    id: 'eternal_domain',
    name: '永恆守護力場 (超武)',
    icon: '🌌🛡️',
    description: '守護輪盤永不收回！形成絕對防禦圈並產生擊退風暴。',
    isEvo: true,
    baseWeapon: 'guardian',
    baseDamage: 60,  // 傷害節奏改由 rehit (0.4s) 控制，單刀要拉高才撐得起超武定位
    baseCooldown: 0, // 無 CD，永久旋轉
    duration: 999999,
    spinSpeed: 5.5,
    count: 6,
    radius: 110,
  },
  shark_torpedo: {
    id: 'shark_torpedo',
    name: '鯊魚核彈 (超武)',
    icon: '🦈💣',
    description: '發射全螢幕震顫核聚變魚雷，毀天滅地級大範圍爆破，每 2 發挾帶劇毒。',
    isEvo: true,
    baseWeapon: 'rocket',
    baseDamage: 150,
    baseCooldown: 1.2,  // 1.8 時單體 DPS 反而低於滿級火箭
    speed: 460,
    explosionRadius: 220,
    count: 2,
    charge: { every: 2, effect: 'poison' },
  },
  napalm_sea: {
    id: 'napalm_sea',
    name: '燃油煉獄 (超武)',
    icon: '🔥🌊',
    description: '藍色高溫烈火將地面覆蓋成火海，擴散並迅速融化怪群。',
    isEvo: true,
    baseWeapon: 'molotov',
    baseDamage: 40,  // 滿級燃燒瓶每跳就是 24，超武不能原地踏步
    baseCooldown: 2.0,
    duration: 5.5,
    radius: 140,
    count: 3,
  },
  plasma_storm: {
    id: 'plasma_storm',
    name: '狂雷星暴 (超武)',
    icon: '🌩️💥',
    description: '漫天落雷連環轟炸，落點更密、單發威力翻倍。',
    isEvo: true,
    baseWeapon: 'lightning',
    baseDamage: 75,
    baseCooldown: 1.1,
    strikes: 6,
  },
  quantum_sphere: {
    id: 'quantum_sphere',
    name: '量子星雲球 (超武)',
    icon: '⚛️⚽',
    description: '多顆超光速量子球體裂變，留下能量粒子殘影瘋狂彈射，每 4 顆挾帶冰凍。',
    isEvo: true,
    baseWeapon: 'soccer',
    baseDamage: 55,
    baseCooldown: 2.2,
    speed: 700,
    bounces: 24,
    count: 4,
    charge: { every: 4, effect: 'freeze' },
  },

  // 新增武器 (內容擴充批)：開路穿透型 ─ 相位飛刃
  // 彩鴿式雙武合成：相位飛刃滿級 + 苦無滿級 → 相位風暴 (兩把都消耗，騰出一個武器槽)
  phase_blade: {
    id: 'phase_blade',
    name: '相位飛刃',
    icon: '💠',
    description: '朝最近敵人擲出高速相位刃，貫穿成群敵人。每 4 發蓄能射出電弧刃。與苦無可合體為超武。',
    isEvo: false,
    evoTarget: 'phase_storm',
    pairPassive: 'kunai',          // 武器+武器合成 (VS 黑白鴿精神)
    maxLevel: 5,
    baseDamage: 34,
    damageGrowth: 12,
    baseCooldown: 1.4,
    cooldownGrowth: -0.08,
    speed: 560,
    projectiles: [1, 1, 1, 2, 2],
    pierce: [3, 4, 5, 6, 8],
    charge: { every: 4, effect: 'chain' }, // 每 4 發射出一枚電弧刃
    projType: 'drill',
  },
  // 新增武器 (內容擴充批)：護身環繞型 ─ 重力環鋸
  orbit_saw: {
    id: 'orbit_saw',
    name: '重力環鋸',
    icon: '🪚',
    description: '兩把高速環鋸繞體旋轉，割裂所有靠近的敵人。',
    isEvo: false,
    evoTarget: 'singularity_ring',
    pairPassive: 'cdr_battery',
    maxLevel: 5,
    baseDamage: 18,
    damageGrowth: 6,
    baseCooldown: 1.9,
    duration: 3.2,
    spinSpeed: 4.2,
    count: [2, 2, 3, 3, 4],
    // 貼身護體軌道：緊貼角色旋轉，與守護輪盤的寬軌道明顯區隔
    radius: [34, 40, 46, 52, 58],
    projType: 'saw',
  },

  // 雙武合體超武：相位風暴 (消耗 相位飛刃 + 苦無)
  phase_storm: {
    id: 'phase_storm',
    name: '相位風暴 (超武)',
    icon: '🌀💠',
    description: '雙武合體！相位飛刃與苦無融合成不間斷的全自動相位風暴，每 8 發挾帶電弧刃。',
    isEvo: true,
    baseWeapon: 'phase_blade',
    baseDamage: 55,
    baseCooldown: 0.15,
    speed: 720,
    projectiles: 1,
    pierce: 6,
    charge: { every: 8, effect: 'chain' }, // 合體超武射速極快，間隔再拉長
    projType: 'drill',
  },
  // 護身超武：重力奇點環 (重力環鋸的永續型態)
  singularity_ring: {
    id: 'singularity_ring',
    name: '重力奇點環 (超武)',
    icon: '🌌🪚',
    description: '環鋸化為永續運轉的奇點軌道，範圍更大、轉速更快，切割一切近身之物。',
    isEvo: true,
    baseWeapon: 'orbit_saw',
    baseDamage: 70,  // 同上：軌道更貼身、範圍更小，單刀給得比守護力場高
    baseCooldown: 0,
    duration: 999999,
    spinSpeed: 6.2,
    count: 6,
    radius: 62,
    projType: 'saw',
  },
};

// 蓄能彈 (Charged Shot)：投射武器每打出固定發數，下一發附帶元素效果。
// burn  = 命中後持續灼燒 (重複命中只刷新時間，不疊層)
// chain = 命中後電弧跳躍到附近敵人，每跳衰減
export const CHARGE = {
  burn:   { dps: 18, duration: 3, color: '#ff7b00' },
  chain:  { jumps: 3, range: 190, falloff: 0.65, color: '#7df8ff' },
  // 冰凍：雜兵完全定住，Boss 只吃減速 (不然高射速武器能把 Boss 鎖死)
  freeze: { duration: 1.1, bossSlow: 2.2, color: '#7fd8ff' },
  // 中毒：單層比燃燒弱，但持續久且可疊層 — 定位是打高血量目標
  poison: { dps: 7, duration: 5, maxStacks: 5, color: '#7dff8f' },
};

// 被動配件定義
export const PASSIVES = {
  atk_scroll: {
    id: 'atk_scroll',
    name: '強力卷軸',
    icon: '📜',
    description: '提升所有武器攻擊力 +15%。(苦無超武配方)',
    maxLevel: 5,
    valuePerLevel: 0.15,
  },
  speed_shoes: {
    id: 'speed_shoes',
    name: '特工跑鞋',
    icon: '👟',
    description: '提升特工移動速度 +12%。(足球超武配方)',
    maxLevel: 5,
    valuePerLevel: 0.12,
  },
  max_hp_vest: {
    id: 'max_hp_vest',
    name: '防彈護甲',
    icon: '🦺',
    description: '生命上限 +30，每秒自動恢復 1 點生命。(守護輪盤超武配方)',
    maxLevel: 5,
    valuePerLevel: 30,
  },
  magnet: {
    id: 'magnet',
    name: '強力磁鐵',
    icon: '🧲',
    description: '擴大經驗寶石與掉落物的拾取範圍 +30%。(火箭超武配方)',
    maxLevel: 5,
    valuePerLevel: 0.30,
  },
  cdr_battery: {
    id: 'cdr_battery',
    name: '能量魔方',
    icon: '🔋',
    description: '所有武器冷卻時間縮短 -8%。(雷電超武配方)',
    maxLevel: 5,
    valuePerLevel: 0.08,
  },
  range_fuel: {
    id: 'range_fuel',
    name: '高能燃料',
    icon: '⛽',
    description: '所有技能攻擊範圍與彈藥大小 +15%。(燃燒瓶超武配方)',
    maxLevel: 5,
    valuePerLevel: 0.15,
  },
};

// ── 視覺特效參數中心 (Soulstone 風格批 2)：地面殘跡與未來特效共用 ──
export const FX = {
  decalCap: 60,          // 地面殘跡上限 (血漬/焦痕)，超過丟最舊
  decalLife: 7,          // 殘跡存活秒數
  bloodChance: 0.35,     // 雜兵死亡留下血漬的機率
  splatScale: 1.35,      // 血漬大小 = 敵人半徑 × 此值
  bossSplatScale: 2.6,   // Boss 焦痕大小
  bossDecalLife: 10,
  scorch: { fill: '10,10,10', a: 0.4, accent: 'rgba(255,150,50,0.4)' }, // 爆炸焦痕 (暗底 + 暖邊)
};

// 怪物配置
export const ENEMY_TYPES = {
  walker: {
    name: '喪屍步兵',
    ai: { kind: 'shamble', wander: 0.35, animSpeed: 8, sepMul: 1.0 },
    hp: 20,
    speed: 90,
    damage: 8,
    color: '#38b000',
    radius: 14,
    exp: 1,
  },
  bat: {
    name: '狂暴突襲蝠',
    ai: { kind: 'weave', weaveAmp: 46, weaveFreq: 3.6, hoverAmp: 0.40, hoverFreq: 2.4, animSpeed: 13, sepMul: 0.5 },
    hp: 12,
    speed: 160,
    damage: 6,
    color: '#7209b7',
    radius: 11,
    exp: 1,
  },
  brute: {
    name: '生化巨漢',
    ai: { kind: 'plod', kbResist: 0.40, animSpeed: 5.5, sepMul: 1.6 },
    hp: 90,
    speed: 65,
    damage: 16,
    color: '#d90429',
    radius: 22,
    exp: 3,
  },
  boomer: {
    name: '劇毒自爆蟲',
    ai: { kind: 'suicide', fuse: 0.8, animSpeed: 9, sepMul: 0.8 },
    hp: 35,
    speed: 120,
    damage: 22,
    color: '#ffaa00',
    radius: 16,
    exp: 2,
    explodes: true,
  },
  runner: {
    name: '狂奔感染者',
    ai: { kind: 'lunge', lunge: { every: 3.2, windup: 0.40, dur: 0.45, mul: 3.4 }, animSpeed: 11, sepMul: 0.6 },
    hp: 26,
    speed: 105,
    damage: 10,
    color: '#ff6b35',
    radius: 13,
    exp: 2,
  },
  warden: {
    name: '防暴盾衛',
    // 正面盾：減傷只看「來襲方向 vs 面向」，從背後打是完整傷害 (原本是一顆
    // 不分方向的 damageTakenMul，README 寫的「正面大盾」在程式裡根本不存在)
    ai: { kind: 'shield', shieldArc: 1.6, shieldMul: 0.45, animSpeed: 6, sepMul: 1.3 },
    hp: 140,
    speed: 55,
    damage: 14,
    color: '#4cc9f0',
    radius: 20,
    exp: 4,
  },
  spore_host: {
    name: '孢子母體',
    ai: { kind: 'shamble', wander: 0.20, animSpeed: 7, sepMul: 1.0 },
    hp: 60,
    speed: 80,
    damage: 12,
    color: '#7cb518',
    radius: 19,
    exp: 3,
    splitInto: 'sporeling',
    splitCount: 3, // 死亡裂解成三隻幼體
  },
  sporeling: {
    name: '孢子幼體',
    ai: { kind: 'swarm', jitter: 0.9, animSpeed: 14, sepMul: 2.2 },
    hp: 8,
    speed: 175,
    damage: 5,
    color: '#c5f04c',
    radius: 8,
    exp: 1,
  },
  spitter: {
    name: '酸液噴吐者',
    // 繞行方向在生成時隨機，否則整關的噴吐者會一起同方向繞圈
    ai: { kind: 'kite', windup: 0.35, animSpeed: 6.5, sepMul: 0.9 },
    hp: 42,
    speed: 75,
    damage: 8,
    color: '#06d6a0',
    radius: 15,
    exp: 2,
    ranged: {
      range: 270,        // 保持在射程外射擊
      cd: 2.4,           // 射擊冷卻 (秒)
      speed: 230,        // 投射物速度
      damage: 12,        // 投射物傷害
      radius: 6,         // 投射物半徑
      color: '#06d6a0',  // 螢光酸液綠
    },
  },
  hound: {
    name: '嗜血獵犬',
    // 繞邊再撲：先沿著 standoff 半徑繞行，再發起可預警的撲咬 (與狂奔感染者區隔)
    ai: { kind: 'flank', standoff: 190, lunge: { every: 2.8, windup: 0.35, dur: 0.40, mul: 3.2 }, animSpeed: 12, sepMul: 0.7 },
    hp: 32,
    speed: 165,
    damage: 9,
    color: '#b0753b',
    radius: 12,
    exp: 2,
  },
  hatcher: {
    name: '增殖胞囊',
    ai: { kind: 'rooted', kbResist: 0.70, animSpeed: 3.5, sepMul: 2.5 },
    hp: 130,
    speed: 16,
    damage: 12,
    color: '#d5547f',
    radius: 24,
    exp: 5,
    damageTakenMul: 0.8,
    hatchMinion: 'walker', // 定時孵化雜兵的生物巢穴
    hatchInterval: 6,
    hatchCount: 2,
    splitInto: 'sporeling', // 死亡裂解成幼體
    splitCount: 3,
  },
  chimera: {
    name: '攻城巨像',
    // 週期性踏地：停下 → 預警圈 → 範圍震波，給坦克一個自己的節奏
    ai: { kind: 'slam', slam: { every: 3.4, windup: 0.70, radius: 135, dmg: 22 }, kbResist: 0.55, animSpeed: 4.5, sepMul: 2.0 },
    hp: 300,
    speed: 42,
    damage: 24,
    color: '#8c8c92',
    radius: 30,
    exp: 7,
    damageTakenMul: 0.55, // 厚重裝甲，靠穿透或爆發處理
    splitInto: 'brute', // 爆開時掉出兩隻生化巨漢
    splitCount: 2,
  },
  boss: {
    name: '毀滅巨神‧暴君',
    ai: { kind: 'boss', animSpeed: 5, sepMul: 0 },
    hp: 1400,
    speed: 75,
    damage: 28,
    color: '#ff0055',
    radius: 40,
    exp: 25,
    isBoss: true,
  },
};

// 精英詞綴：普通怪低機率帶詞綴，體型/顏色/掉落與行為都升級
export const ELITE_AFFIXES = {
  fast:    { name: '疾風', color: '#00e5ff', speedMul: 1.5, expMul: 2 },
  armored: { name: '裝甲', color: '#9fb3c8', hpMul: 1.6, damageTakenMul: 0.5, expMul: 2.5 },
  giant:   { name: '巨獸', color: '#ffb703', hpMul: 2.5, radiusMul: 1.45, damageMul: 1.35, expMul: 3 },
  toxic:   { name: '劇毒', color: '#b5179e', hpMul: 1.2, speedMul: 1.2, damageMul: 1.25, expMul: 2 },
};

// 掉落道具類型
export const DROP_TYPES = {
  EXP_GREEN: { value: 1, color: '#00f59b', radius: 4 },
  EXP_BLUE: { value: 3, color: '#00b4d8', radius: 5 },
  EXP_PURPLE: { value: 8, color: '#b5179e', radius: 6 },
  EXP_GOLD: { value: 20, color: '#ffb703', radius: 7 },
  MAGNET: { type: 'magnet', icon: '🧲', radius: 10 },
  BOMB: { type: 'bomb', icon: '💣', radius: 10 },
  ROAST_CHICKEN: { type: 'heal', heal: 50, icon: '🍗', radius: 10 },
  GOLD_COIN: { type: 'gold', value: 10, icon: '🪙', radius: 8 },
  SUPPLY: { type: 'supply', icon: '📦', radius: 10 }, // 街頭空投物資箱 (關卡機制)
  GEAR: { type: 'gear', icon: '🎁', radius: 11 },      // 裝備掉落 (顏色由稀有度覆寫)
  CHEST: { type: 'chest', icon: '🧰', radius: 14, color: '#ffb703' }, // 幸運補給箱 (Boss/精英掉落)

  // 惡魔城風格消費道具 (可拾取至口袋手動使用或直接觸發)
  POTION:        { type: 'consumable', subType: 'potion',        icon: '🧪', color: '#00f59b', radius: 11 },
  ELIXIR:        { type: 'consumable', subType: 'elixir',        icon: '💖', color: '#ff4d6d', radius: 12 },
  ATK_POTION:    { type: 'consumable', subType: 'atk_potion',    icon: '🗡️', color: '#ff7b00', radius: 11 },
  SHIELD_POTION: { type: 'consumable', subType: 'shield_potion', icon: '🛡️', color: '#4cc9f0', radius: 11 },
  LUCK_POTION:   { type: 'consumable', subType: 'luck_potion',   icon: '🍀', color: '#70e000', radius: 11 },
  STOPWATCH:     { type: 'consumable', subType: 'stopwatch',     icon: '⏱️', color: '#ffd166', radius: 12 },
  HOLY_WATER:    { type: 'consumable', subType: 'holy_water',    icon: '💧', color: '#00e5ff', radius: 11 },
  MANNA_PRISM:   { type: 'consumable', subType: 'manna_prism',   icon: '🧲', color: '#b5179e', radius: 12 },
  MAGIC_TICKET:  { type: 'consumable', subType: 'magic_ticket',  icon: '🎫', color: '#ffd60a', radius: 12 },
};

// ── 惡魔城經典消費道具定義 (Consumable Items) ──
export const CONSUMABLE_ITEMS = {
  potion:        { name: '恢復藥水', icon: '🍷', kind: 'heal',    value: 80,   desc: '立即回復 80 點生命值' },
  elixir:        { name: '高級萬靈藥', icon: '✨', kind: 'fullHeal', value: 100, desc: '完全回滿生命值，並額外獲得 100 點能量護盾' },
  atk_potion:    { name: '力量藥水', icon: '⚔️', kind: 'buff', duration: 15, desc: '15 秒內全武器攻擊力 +40%' },
  shield_potion: { name: '鐵壁藥水', icon: '🛡️', kind: 'buff', duration: 15, desc: '15 秒內受到傷害減免 50%' },
  luck_potion:   { name: '幸運藥水', icon: '🍀', kind: 'buff', duration: 20, desc: '20 秒內暴擊率 +25%、金幣掉落翻倍' },
  stopwatch:     { name: '時停懷錶', icon: '⏱️', kind: 'cc',   duration: 5,  desc: '凍結全場敵人與敵方子彈 5 秒' },
  holy_water:    { name: '聖水',     icon: '🍶', kind: 'aoe',  value: 260,  desc: '在特工周圍引爆神聖淨化光環，造成 260 點範圍傷害並擊退敵人' },
  manna_prism:   { name: '曼納稜晶', icon: '💎', kind: 'cd',   value: 0,    desc: '所有武器與閃避冷卻立即歸零，瞬間觸發全彈齊發' },
  magic_ticket:  { name: '魔法門票', icon: '🎫', kind: 'magnet', value: 100, desc: '引導神秘信標，瞬間全圖磁吸所有掉落物，並額外獲得 100 金幣' },
};

export const WEAPON_ASPECTS = {
  kunai: [
    { id: 'zagreus', name: '札格型態 (疾風)', icon: '💨', tag: '極速連射',
      desc: '基礎射速 +30%、彈速 +25%、射程 +20%。',
      stats: { cdMul: 0.70, speedMul: 1.25, rangeMul: 1.20 } },
    { id: 'chiron',  name: '基隆型態 (箭雨)', icon: '🏹', tag: '扇形標記',
      desc: '每輪齊射 3 枚扇形飛刀（單發傷害 ×0.6），命中的目標標記 5 秒、受傷 +25%。',
      stats: { fanCount: 3, fanDamageMul: 0.60, markDamageBonus: 0.25, markDur: 5 } },
    { id: 'nemesis', name: '涅墨西斯 (裁決)', icon: '⚖️', tag: '翻滾必暴',
      desc: '戰術閃避翻滾後 3.5 秒內，所有苦無 100% 致命暴擊且暴擊傷害 ×1.5！',
      stats: { dashCritDur: 3.5, critDmgMul: 1.5 } },
  ],
  rocket: [
    { id: 'hestia',  name: '赫斯提亞 (穿甲狙擊)', icon: '🎯', tag: '貫穿巨彈',
      desc: '冷卻 +15%，火箭化為超重型穿甲導彈：彈體傷害 ×1.6、彈速 +35%、貫穿 6 名敵人、爆炸半徑 +80%。',
      stats: { cdMul: 1.15, pierce: 6, damageMul: 1.6, blastRadiusMul: 1.8, speedMul: 1.35, projRadius: 16 } },
    { id: 'eris',    name: '埃里斯 (蜂巢集群)', icon: '🐝', tag: '四發齊射',
      desc: '連射微型追蹤火箭（發射數 ×2、單發傷害 ×0.65），自動精準索敵多個目標轟炸。',
      stats: { clusterMul: 2, damageMul: 0.65, delay: 0.09 } },
    { id: 'lucifer', name: '路西法 (熔岩地火)', icon: '🌋', tag: '熔岩火坑',
      desc: '火箭爆炸後在地面留下滾燙熔岩坑 4 秒，持續灼燒踩過的怪物。',
      stats: { lavaDuration: 4.0, lavaRadius: 55, lavaDamageMul: 0.4 } },
  ],
  molotov: [
    { id: 'zagreus',  name: '札格型態 (烈火海)', icon: '🔥', tag: '大範圍爆燃',
      desc: '燃燒半徑 +40%，火海傷害跳頻加快 30%。',
      stats: { radiusMul: 1.40, tickRateMul: 0.70 } },
    { id: 'poseidon', name: '波塞頓 (激流爆破)', icon: '🌊', tag: '激流擊退',
      desc: '燃燒瓶落地引發激流爆破：範圍傷害 ×1.5、強力擊退並施加 3 秒減速（半速）。',
      stats: { splashDamageMul: 1.5, knockback: 18, slowDur: 3.0 } },
    { id: 'athena',   name: '雅典娜 (聖光領域)', icon: '✨', tag: '聖光庇護',
      desc: '化為神聖守護領域，玩家處於領域內受傷 -25% 且每秒回復 8 HP。',
      stats: { sanctuary: true, dmgResist: 0.25, healPerSec: 8 } },
  ],
  lightning: [
    { id: 'zeus',  name: '宙斯型態 (連鎖狂雷)', icon: '⚡', tag: '連鎖彈射',
      desc: '落雷命中目標後引發連鎖電弧，在周圍最多 4 名敵人之間跳躍傳導（每跳 70% 傷害）。',
      stats: { chainTargets: 4, chainDamageRatio: 0.70 } },
    { id: 'thor',  name: '索爾型態 (定點天罰)', icon: '🔨', tag: '巨雷眩暈',
      desc: '召喚天頂巨雷，造成 300% 巨額傷害、爆炸半徑 +50%，並使命中目標與周圍敵怪眩暈 1.2 秒。',
      stats: { damageMul: 3.0, stunDur: 1.2, radiusMul: 1.5 } },
    { id: 'chaos', name: '混沌型態 (電磁風暴)', icon: '🌀', tag: '引力聚怪',
      desc: '落雷點引爆電磁脈衝，將半徑 180 內的敵人強制往中心牽引。',
      stats: { pullRadius: 180, pullStrength: 80 } },
  ],
  guardian: [
    { id: 'zagreus', name: '札格型態 (疾速環)', icon: '🥏', tag: '高速旋轉',
      desc: '輪盤旋轉速度 +50%，基礎飛盤數量 +1。',
      stats: { spinSpeedMul: 1.50, extraBlades: 1 } },
    { id: 'chaos',   name: '混沌型態 (彈射飛刃)', icon: '🪚', tag: '發射飛盤',
      desc: '輪盤旋轉時，每 2 秒向外發射一枚高速穿透飛刃。',
      stats: { ejectRate: 2.0, ejectSpeed: 360, ejectDamageMul: 1.2, ejectPierce: 8, ejectLife: 3.0 } },
    { id: 'shield',  name: '聖盾型態 (投射反彈)', icon: '🛡️', tag: '消彈護盾',
      desc: '防禦力場擴大 30%，能阻擋消滅甚至反彈所有敵方投射物。',
      stats: { radiusMul: 1.30, reflectBullets: true } },
  ],
  soccer: [
    { id: 'achilles', name: '阿基里斯 (超導衝鋒)', icon: '🏃', tag: '彈射充能',
      desc: '足球每次命中為特工充能 6% 跑速（可疊加至 42%，持續 4 秒）。',
      stats: { speedBoostPerHit: 0.06, maxSpeedBoost: 0.42, boostDur: 4.0 } },
    { id: 'guanyu',   name: '關羽型態 (寒冰重力球)', icon: '❄️', tag: '冰凍引力',
      desc: '足球直徑增大 50%，命中附帶 1.5 秒冰凍定身。',
      stats: { radiusMul: 1.50, freezeDur: 1.5 } },
    { id: 'thanatos', name: '塔納托斯 (湮滅死球)', icon: '💀', tag: '第5擊核爆',
      desc: '足球每次命中傷害提升 25%，第 5 次命中時引發虛空引爆（半徑 100、200 點終結傷害）。',
      stats: { bounceDmgGrowth: 0.25, implosionAt: 5, implosionRadius: 100, implosionDamage: 200 } },
  ],
};

// ── 局內隨機祝福 (Blessings)：里程碑二選一，本局限定的被動效果 ──
// apply(player, game) 在獲得時呼叫一次注入加成，tick(dt, game) 每幀呼叫（需要的話）。
// 部分祝福有 risk 標記（高收益但有代價），UI 會特別標示。
export const BLESSINGS = [
  { id: 'flame_touch',     name: '烈焰之觸',     icon: '🔥', desc: '所有武器範圍 +20%',
    apply(p) { p.blessingAreaMul = (p.blessingAreaMul || 1) * 1.20; } },
  { id: 'overcharge',      name: '過載協議',      icon: '⚡', desc: '攻速 +25%，受傷 +15%', risk: true,
    apply(p) { p.blessingCdrMul = (p.blessingCdrMul || 1) * 0.75; p.damageTakenMul *= 1.15; } },
  { id: 'blood_pact',      name: '嗜血契約',      icon: '🩸', desc: '擊殺回血 2，拾取範圍 -25%', risk: true,
    apply(p) { p.blessingKillHeal = (p.blessingKillHeal || 0) + 2; p.blessingMagnetMul = (p.blessingMagnetMul || 1) * 0.75; } },
  { id: 'fortune_gem',     name: '幸運寶鑽',      icon: '💎', desc: '經驗獲得 +50%',
    apply(p) { p.metaExp = (p.metaExp || 0) + 0.50; } },
  { id: 'phase_shield',    name: '相位護盾',      icon: '🛡️', desc: '每 25 秒自動觸發 2.5 秒無敵',
    apply(p) { p.blessingShieldCD = 25; p.blessingShieldTimer = 0; p.blessingShieldDur = 2.5; } },
  { id: 'gravity_well',    name: '引力異常',      icon: '🧲', desc: '拾取範圍翻倍',
    apply(p) { p.blessingMagnetMul = (p.blessingMagnetMul || 1) * 2; } },
  { id: 'crit_storm',      name: '暴擊風暴',      icon: '🗡️', desc: '暴擊率 +15%',
    apply(p) { p.metaCrit = (p.metaCrit || 0) + 0.15; } },
  { id: 'golden_age',      name: '黃金時代',      icon: '💰', desc: '金幣掉落率翻倍',
    apply(_, g) { g.metaGoldMul = (g.metaGoldMul || 1) * 2; } },
  { id: 'cooldown_crunch', name: '冷卻壓縮',      icon: '🔄', desc: '所有武器冷卻 -18%',
    apply(p) { p.blessingCdrMul = (p.blessingCdrMul || 1) * 0.82; } },
  { id: 'ghost_step',      name: '幽靈步伐',      icon: '🏃', desc: '閃避冷卻 -40%，距離 +30%',
    apply(p) { p.blessingDashCdr = 0.6; p.blessingDashDist = 1.3; } },
  { id: 'armor_pierce',    name: '穿甲之刃',      icon: '⚔️', desc: '所有投射物穿透 +2',
    apply(p) { p.bonusPierce = (p.bonusPierce || 0) + 2; } },
  { id: 'tornado_spin',    name: '龍捲共鳴',      icon: '🌪️', desc: '環繞型武器轉速 +50%',
    apply(p) { p.blessingSpinMul = (p.blessingSpinMul || 1) * 1.5; } },
  { id: 'executioner',     name: '處刑人',        icon: '💀', desc: '對低血量 (<30%) 敵人傷害 +60%',
    apply(p) { p.blessingExecute = true; } },
  { id: 'rainbow_aegis',   name: '虹光護佑',      icon: '🌈', desc: '致死傷害時以 1 HP 存活（每局一次）',
    apply(p) { p.blessingDeathSave = true; } },
  { id: 'berserker',       name: '狂戰士',        icon: '😈', desc: '生命越低傷害越高（30% HP → +60% 傷害）', risk: true,
    apply(p) { p.blessingBerserker = true; } },
];

// ── 局內隨機事件 (Mini-Events)：打破中段節奏空窗 ──
// trigger(game) 在觸發時呼叫，負責生成敵人/獎勵/計時。duration 秒後結束。
export const MINI_EVENTS = [
  { id: 'swarm_rush',      name: '怪潮突襲',      icon: '🌊', color: '#ff0055',
    desc: '15 秒內怪物密度翻倍！撐住就有大量獎勵', duration: 15 },
  { id: 'elite_hunt',      name: '精英獵殺',      icon: '👑', color: '#ffb703',
    desc: '三隻精英怪同時出現，全滅掉幸運箱！', duration: 25 },
  { id: 'treasure_goblin', name: '寶藏哥布林',    icon: '🎁', color: '#00f59b',
    desc: '一隻高速金色怪物正在逃跑，擊殺掉大量金幣！', duration: 12 },
  { id: 'death_march',     name: '死亡行軍',      icon: '💀', color: '#9fb3c8',
    desc: '一波攻城巨像從北方壓境！', duration: 20 },
  { id: 'crystal_rain',    name: '水晶雨',        icon: '💎', color: '#b5179e',
    desc: '天降大量經驗水晶，快收集！', duration: 8 },
];

// ── 武器協同效果 (Synergies)：持有特定武器組合產生額外被動 ──
// weapons: 需要同時持有的武器 id 陣列 (包含超武)
// 一把武器可參與多組協同，但同組只生效一次
export const SYNERGIES = [
  { id: 'steam_blast',    weapons: ['molotov', 'soccer'],    name: '蒸汽爆破',    icon: '💨',
    desc: '冰凍敵人被火焰命中時傷害 ×2', color: '#7df8ff',
    effect: { frozenFireMul: 2.0 } },
  { id: 'thunder_blade',  weapons: ['lightning', 'kunai'],   name: '導電刀鋒',    icon: '⚡',
    desc: '苦無命中 20% 機率觸發落雷', color: '#00e5ff',
    effect: { kunaiThunderChance: 0.20 } },
  { id: 'napalm_chain',   weapons: ['rocket', 'molotov'],    name: '燃爆連鎖',    icon: '🔥',
    desc: '爆炸範圍 +35%', color: '#ff7b00',
    effect: { explosionRangeMul: 1.35 } },
  { id: 'twin_orbit',     weapons: ['guardian', 'orbit_saw'], name: '雙環共振',   icon: '🌀',
    desc: '兩種環繞武器互相加速 +30%', color: '#b5179e',
    effect: { orbitSpeedMul: 1.3 } },
  { id: 'bullet_storm',   weapons: ['kunai', 'phase_blade'],  name: '彈幕風暴',   icon: '🗡️',
    desc: '投射物武器冷卻 -20%', color: '#ffd166',
    effect: { projCdrMul: 0.80 } },
  { id: 'elemental_fusion', weapons: ['lightning', 'molotov'], name: '元素融合',  icon: '🔮',
    desc: '蓄能彈觸發間隔 -1 發', color: '#b388ff',
    effect: { chargeReduction: 1 } },
];

// ── 特殊升級卡 (Special Cards)：升級三選一中低機率出現 ──
export const SPECIAL_CARDS = [
  { id: 'nuke_strike',     name: '軌道核彈',     icon: '💣', tag: '特殊',
    desc: '立即全螢幕清怪 + 3 秒無敵！', color: '#ff0055' },
  { id: 'gene_mutate',     name: '基因突變',     icon: '🧬', tag: '特殊',
    desc: '隨機一把武器直接 +2 級（可能超過正常上限）！', color: '#00f59b' },
  { id: 'lucky_wheel',     name: '幸運大轉盤',   icon: '🎰', tag: '特殊',
    desc: '開啟一個超豐富獎池的幸運輪盤！', color: '#ffb703' },
  { id: 'gold_rush',       name: '淘金狂潮',     icon: '🪙', tag: '特殊',
    desc: '立即獲得 200 金幣 + 30 秒金幣掉落率翻倍！', color: '#ffb703' },
  { id: 'full_heal',       name: '超級急救',     icon: '💖', tag: '特殊',
    desc: '完全恢復生命值 + 獲得 50 點護盾！', color: '#ff69b4' },
];

// ── 局內流浪商人 (Merchant Items)：生存者模式定期出現 ──
export const MERCHANT_ITEMS = [
  { id: 'mega_heal',       name: '強效急救包',   icon: '💊', cost: 40,
    desc: '立即回復 80 HP', color: '#00f59b' },
  { id: 'temp_overclock',  name: '臨時過載晶片', icon: '⚡', cost: 60,
    desc: '30 秒內攻速 +40%', color: '#00e5ff', duration: 30 },
  { id: 'energy_shield',   name: '能量護罩',     icon: '🛡️', cost: 80,
    desc: '獲得 100 點護盾', color: '#4cc9f0' },
  { id: 'hyper_magnet',    name: '超級磁力場',   icon: '🧲', cost: 50,
    desc: '15 秒拾取範圍 ×3', color: '#b5179e', duration: 15 },
  { id: 'orbital_strike',  name: '軌道轟炸',     icon: '💣', cost: 100,
    desc: '延遲 3 秒全場 500 傷害', color: '#ff0055' },
  { id: 'fire_enchant',    name: '元素附魔',     icon: '🔥', cost: 70,
    desc: '30 秒所有攻擊附帶燃燒', color: '#ff7b00', duration: 30 },
];

// ── 成就系統 (Achievements) ──
export const ACHIEVEMENTS = [
  { id: 'combo_200',       name: '暴風切割',     icon: '🗡️', desc: '單局達成 200 連擊',
    check: (s) => s.maxCombo >= 200, reward: 50 },
  { id: 'speed_clear_1',   name: '極速通關',     icon: '🏃', desc: '3 分鐘內擊敗第一關首領',
    check: (s) => s.levelId === 'street' && s.cleared && s.time <= 180, reward: 80 },
  { id: 'no_hit_1',        name: '零傷通關',     icon: '🛡️', desc: '不受傷通過第一關',
    check: (s) => s.levelId === 'street' && s.cleared && s.damageTaken === 0, reward: 150 },
  { id: 'kill_2000',       name: '屠殺模式',     icon: '💀', desc: '單局擊殺 2000 隻怪物',
    check: (s) => s.kills >= 2000, reward: 100 },
  { id: 'evo_3',           name: '超武收藏家',   icon: '⚡', desc: '同一局合成 3 把超武',
    check: (s) => s.evosThisRun >= 3, reward: 120 },
  { id: 'chest_5',         name: '幸運兒',       icon: '🎲', desc: '單局開啟 5 次幸運箱',
    check: (s) => s.chestsOpened >= 5, reward: 60 },
  { id: 'glass_core',      name: '玻璃大砲大師', icon: '🌋', desc: '每日挑戰含玻璃大砲詞綴時通關',
    check: (s) => s.isDaily && s.cleared && s.hasGlassCannon, reward: 200 },
  { id: 'blessing_5',      name: '祝福收集者',   icon: '🔮', desc: '單局獲得 5 個祝福',
    check: (s) => s.blessingsCount >= 5, reward: 80 },
  { id: 'synergy_3',       name: '武器大師',     icon: '🌀', desc: '同一局觸發 3 組武器協同',
    check: (s) => s.synergiesActive >= 3, reward: 100 },
  { id: 'merchant_buy',    name: '老顧客',       icon: '🏪', desc: '單局向商人購買 3 次',
    check: (s) => s.merchantBuys >= 3, reward: 40 },
  { id: 'endless_10m',     name: '深淵倖存者',   icon: '🌀', desc: '深淵無盡戰存活超過 10 分鐘',
    check: (s) => s.levelId === 'endless' && s.time >= 600, reward: 200 },
  { id: 'all_chars',       name: '特工大閱兵',   icon: '🦆', desc: '使用全部 5 位特工各通關一次',
    check: (s) => s.clearedWithAllChars, reward: 300 },
];
