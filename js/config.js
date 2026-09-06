// 嘎嘎特攻 (Gaga Survivor) - 遊戲全局設定與數值配置

export const GAME_CONFIG = {
  CANVAS_WIDTH: window.innerWidth,
  CANVAS_HEIGHT: window.innerHeight,
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
    description: '自動朝最近敵人疾速發射穿透苦無。',
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
    description: '發射鎖定高爆飛彈，命中造成巨大範圍破片爆炸。',
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
    description: '踢出高彈力金屬足球，在怪群與空間中高速彈射。',
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
  },

  // 超武 (Evo Weapons)
  ghost_shuriken: {
    id: 'ghost_shuriken',
    name: '幽靈手裏劍 (超武)',
    icon: '✨🗡️',
    description: '無需停歇！極限暴風加特林式連續全自動追蹤發射！',
    isEvo: true,
    baseWeapon: 'kunai',
    baseDamage: 40,
    baseCooldown: 0.12, // 極致機槍射速
    speed: 800,
    projectiles: 1,
    pierce: 5,
  },
  eternal_domain: {
    id: 'eternal_domain',
    name: '永恆守護力場 (超武)',
    icon: '🌌🛡️',
    description: '守護輪盤永不收回！形成絕對防禦圈並產生擊退風暴。',
    isEvo: true,
    baseWeapon: 'guardian',
    baseDamage: 32,
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
    description: '發射全螢幕震顫核聚變魚雷，毀天滅地級大範圍爆破。',
    isEvo: true,
    baseWeapon: 'rocket',
    baseDamage: 120,
    baseCooldown: 1.8,
    speed: 460,
    explosionRadius: 220,
    count: 2,
  },
  napalm_sea: {
    id: 'napalm_sea',
    name: '燃油煉獄 (超武)',
    icon: '🔥🌊',
    description: '藍色高溫烈火將地面覆蓋成火海，擴散並迅速融化怪群。',
    isEvo: true,
    baseWeapon: 'molotov',
    baseDamage: 24,
    baseCooldown: 2.0,
    duration: 5.5,
    radius: 140,
    count: 3,
  },
  plasma_storm: {
    id: 'plasma_storm',
    name: '狂雷星暴 (超武)',
    icon: '🌩️💥',
    description: '漫天落雷連環轟炸，並觸發連鎖電弧擴散爆裂。',
    isEvo: true,
    baseWeapon: 'lightning',
    baseDamage: 75,
    baseCooldown: 1.1,
    strikes: 6,
    chainHits: 2,
  },
  quantum_sphere: {
    id: 'quantum_sphere',
    name: '量子星雲球 (超武)',
    icon: '⚛️⚽',
    description: '多顆超光速量子球體裂變，留下能量粒子殘影瘋狂彈射。',
    isEvo: true,
    baseWeapon: 'soccer',
    baseDamage: 55,
    baseCooldown: 2.2,
    speed: 700,
    bounces: 24,
    count: 4,
  },

  // 新增武器 (內容擴充批)：開路穿透型 ─ 相位飛刃
  // 彩鴿式雙武合成：相位飛刃滿級 + 苦無滿級 → 相位風暴 (兩把都消耗，騰出一個武器槽)
  phase_blade: {
    id: 'phase_blade',
    name: '相位飛刃',
    icon: '💠',
    description: '朝最近敵人擲出高速相位刃，貫穿成群敵人。與苦無可合體為超武。',
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
    spinSpeed: 3.2,
    count: [2, 2, 3, 3, 4],
    radius: [70, 80, 85, 95, 100],
    projType: 'saw',
  },

  // 雙武合體超武：相位風暴 (消耗 相位飛刃 + 苦無)
  phase_storm: {
    id: 'phase_storm',
    name: '相位風暴 (超武)',
    icon: '🌀💠',
    description: '雙武合體！相位飛刃與苦無融合成不間斷的全自動相位風暴，貫穿一切。',
    isEvo: true,
    baseWeapon: 'phase_blade',
    baseDamage: 55,
    baseCooldown: 0.15,
    speed: 720,
    projectiles: 1,
    pierce: 6,
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
    baseDamage: 38,
    baseCooldown: 0,
    duration: 999999,
    spinSpeed: 5.2,
    count: 6,
    radius: 120,
    projType: 'saw',
  },
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

// 怪物配置
export const ENEMY_TYPES = {
  walker: {
    name: '喪屍步兵',
    hp: 20,
    speed: 90,
    damage: 8,
    color: '#38b000',
    radius: 14,
    exp: 1,
  },
  bat: {
    name: '狂暴突襲蝠',
    hp: 12,
    speed: 160,
    damage: 6,
    color: '#7209b7',
    radius: 11,
    exp: 1,
  },
  brute: {
    name: '生化巨漢',
    hp: 90,
    speed: 65,
    damage: 16,
    color: '#d90429',
    radius: 22,
    exp: 3,
  },
  boomer: {
    name: '劇毒自爆蟲',
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
    hp: 26,
    speed: 105,
    damage: 10,
    color: '#ff6b35',
    radius: 13,
    exp: 2,
    dash: { every: 3.2, dur: 0.45, mul: 3.4 }, // 週期性衝刺，逼玩家提早轉向
  },
  warden: {
    name: '防暴盾衛',
    hp: 140,
    speed: 55,
    damage: 14,
    color: '#4cc9f0',
    radius: 20,
    exp: 4,
    damageTakenMul: 0.55, // 盾牌減傷，靠爆發或穿透才好處理
  },
  spore_host: {
    name: '孢子母體',
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
    hp: 8,
    speed: 175,
    damage: 5,
    color: '#c5f04c',
    radius: 8,
    exp: 1,
  },
  spitter: {
    name: '酸液噴吐者',
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
  boss: {
    name: '毀滅巨神‧暴君',
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
};
