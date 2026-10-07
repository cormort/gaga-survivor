// 呱呱特工 (Gaga Survivor) - 遊戲全局設定與數值配置

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
  // 升級卡的「封印」與「跳過」每局次數（參考吸血鬼倖存者的 Banish / Skip）。
  // 封印：該武器／配件本局不再出現在升級卡；跳過：這次不選，換一點本局金幣
  BANISH_PER_RUN: 3,
  SKIP_PER_RUN: 3,
  SKIP_GOLD: 25,
  REROLL_COST: 60,   // 升級卡刷新的本局金幣費用（規則卡「命運編織」可打折）
  // 首領寶藏箱（參考吸血鬼倖存者）：一次開出 1 / 3 / 5 次真正的升級，權重如下。
  // 只有首領的箱子是這種；精英箱（一局約 50 個）維持雜物輪盤，否則強度會爆掉
  BOSS_CHEST_COUNTS: [[1, 20], [3, 55], [5, 25]],
  BASE_EXP_REQUIREMENT: 10,
  EXP_GROWTH_FACTOR: 1.35,
};

// ── 這一局的世界邊界 ──
// 生存者模式是無限地圖（參考吸血鬼倖存者）；守塔模式的基地核心在世界原點，維持 WORLD_BOUNDS。
// 由模式資料的 boundedMap 決定、Game.start() 設定。無限地圖回傳 ±Infinity 的邊界 ——
// 夾範圍的寫法（Math.max(min + m, …)）不用改就自動失效；會「在邊界內隨機撒點」或
// 「用邊界切網格」的地方則要改問 isWorldBounded()（Infinity 會算出 NaN）。
export const UNBOUNDED = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
let activeBounds = GAME_CONFIG.WORLD_BOUNDS;
export function worldBounds() { return activeBounds; }
export function isWorldBounded() { return activeBounds !== UNBOUNDED; }
// rect：守塔關傳自己的地圖矩形（js/tdlevels.js 的 bounds），其餘有邊界的模式用 WORLD_BOUNDS
export function setWorldBounded(bounded, rect = GAME_CONFIG.WORLD_BOUNDS) { activeBounds = bounded ? rect : UNBOUNDED; }

// 目前畫面看得到的世界寬高（= 螢幕邏輯像素 ÷ 鏡頭縮放）。守塔關會把鏡頭拉遠看整張圖，
// 這時「畫面外就不畫」的剔除判定不能再用 window.innerWidth —— 那是螢幕寬，不是世界寬。
// 由 Game 在調整縮放時更新。
export const VIEW = { w: 1280, h: 720 };

// 守塔的人物放大倍率。守塔為了看整張圖把鏡頭拉遠（1280×800 時 zoom 0.7），
// 英雄／兵營小兵／怪物在畫面上只有 34~48px 高，比一座塔（約 52px）還小，
// 跟道路（95px 寬）擺在一起就像螞蟻。這裡只放大「畫出來」的尺寸 ——
// 碰撞半徑、傷害、射程、擊退、波次血量全部不動，所以平衡與存檔都不受影響。
export const TD_CHAR_SCALE = 1.3;

// 武器定義
export const WEAPONS = {
  kunai: {
    id: 'kunai',
    name: '特工苦無',
    icon: '🗡️',
    element: 'physical',
    description: '自動朝最近敵人疾速發射穿透苦無。每 5 發蓄能射出燃燒彈。',
    isEvo: false,
    evoTarget: 'ghost_shuriken',
    pairPassive: 'atk_scroll',
    maxLevel: 5,
    baseDamage: 27,  // 射程定位校準（原 27）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 22）
    baseCooldown: 0.7, // 秒
    cooldownGrowth: -0.07,
    speed: 650,
    projectiles: [1, 2, 3, 4, 5], // 各等級發射數量
    pierce: [1, 1, 2, 2, 3],
    charge: { every: 5, effect: 'burn' }, // 每 5 發射出一枚燃燒苦無
    range: 480,               // 中程：鎖定後直線飛行，射程中等
  },
  guardian: {
    id: 'guardian',
    name: '守護輪盤',
    icon: '🥏',
    element: 'physical',
    description: '旋轉護盾環繞周身，擊退並割裂靠近的敵人。',
    isEvo: false,
    evoTarget: 'eternal_domain',
    pairPassive: 'max_hp_vest',   // 護身武器 ↔ 生存配件 (原 magnet)
    maxLevel: 5,
    baseDamage: 9,  // 射程定位校準（原 19）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 16）
    baseCooldown: 2.2, // 冷卻（非超武時有旋轉週期）
    duration: 3.5, // 持續旋轉時間
    spinSpeed: 3.5,
    count: [2, 3, 4, 5, 6],
    radius: [65, 75, 80, 90, 95],
    pierceAll: true,          // 範圍型：旋轉刀刃掃到就中
  },
  rocket: {
    id: 'rocket',
    name: '高爆火箭',
    icon: '🚀',
    element: 'toxic',
    description: '發射會轉彎追蹤的鎖定飛彈，撞上目標引發範圍破片爆炸。每 3 發蓄能射出毒氣彈。',
    isEvo: false,
    evoTarget: 'shark_torpedo',
    pairPassive: 'magnet',        // 爆炸清場 → 自動吸寶 (原 range_fuel)
    maxLevel: 5,
    baseDamage: 44,  // 射程定位校準（原 44）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準到位
    baseCooldown: 2.5,
    cooldownGrowth: -0.3,
    speed: 380,
    homing: 5.0,                   // 每秒最大轉向（弧度）：鎖定目標、轉彎追上
    explosionRadius: [70, 85, 95, 110, 130],
    count: [1, 2, 2, 3, 4],
    charge: { every: 3, effect: 'poison' }, // 每 3 發射出毒氣彈，爆炸範圍內全部中毒
    range: 620,               // 鎖定飛彈的追擊距離（飛行 380×2.5s，實際交戰距離較短）
    pierceAll: true,          // 撞到即爆，爆炸半徑內全中
  },
  molotov: {
    id: 'molotov',
    name: '特工燃燒瓶',
    icon: '🍾',
    element: 'fire',
    description: '拋出燃燒瓶，瓶子落地摔碎後鋪開持續灼燒的烈火之海。',
    isEvo: false,
    evoTarget: 'napalm_sea',
    pairPassive: 'range_fuel',    // 火海範圍加大 (原 speed_shoes)
    maxLevel: 5,
    baseDamage: 5,  // 射程定位校準（原 10）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 8） // 每跳傷害
    baseCooldown: 3.4,
    cooldownGrowth: -0.2,          // 升級加快投擲 (3.4 → 2.6 秒)
    duration: 3.8,
    radius: [55, 65, 75, 85, 95],
    count: [1, 2, 3, 4, 5],
    pierceAll: true,          // 範圍型：火海每跳燒到範圍內全部
  },
  lightning: {
    id: 'lightning',
    name: '雷電矩陣',
    icon: '⚡',
    element: 'shock',
    description: '落雷依序劈中不同敵人，落點之間拉起電網，被電網掃過的敵人一併受創。',
    isEvo: false,
    evoTarget: 'plasma_storm',
    pairPassive: 'cdr_battery',
    maxLevel: 5,
    baseDamage: 30,  // 射程定位校準（原 34）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 32）                // 落點不再重複、又多了電網，單發比舊版略低
    baseCooldown: 2.4,
    cooldownGrowth: -0.15,
    strikes: [1, 2, 3, 4, 5],
    linkDamageMul: 0.15,           // 電網線段的傷害倍率
    linkWidth: 18,
    range: 260,               // 落雷的索敵距離（不是飛行距離）
    pierceAll: true,          // 天頂落雷：落點內全中
  },
  soccer: {
    id: 'soccer',
    name: '量子足球',
    icon: '⚽',
    element: 'frost',
    description: '朝敵人踢出高彈力足球，命中後彈向下一個敵人、撞到畫面邊緣也會反彈。每 3 顆蓄能射出冰凍球。',
    isEvo: false,
    evoTarget: 'quantum_sphere',
    pairPassive: 'speed_shoes',   // 走位控球/追球 (原 max_hp_vest)
    maxLevel: 5,
    baseDamage: 33,  // 射程定位校準（原 33）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 28）
    baseCooldown: 3.2,
    cooldownGrowth: -0.35,         // 升級加快出球 (3.2 → 1.8 秒)
    speed: 520,
    bounces: [4, 5, 6, 7, 8],      // 彈射次數（命中彈向下一個敵人、撞畫面邊緣都算一次）
    count: [1, 2, 2, 3, 4],
    charge: { every: 3, effect: 'freeze' }, // 每 3 顆射出冰凍球
    range: 520,               // 彈跳球的飛行距離（殺傷靠彈射次數，不靠穿透）
    pierceAll: true,          // 彈射型：撞到不消耗（吃群靠 bounces 彈射次數，不是靠穿透）
  },

  // 超武 (Evo Weapons)
  ghost_shuriken: {
    id: 'ghost_shuriken',
    name: '幽靈手裏劍 (超武)',
    icon: '✨🗡️',
    element: 'physical',
    description: '半透明的幽靈手裏劍高速旋轉連發，會轉彎追蹤目標、穿透敵群，每 6 發挾帶燃燒彈。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'kunai',
    baseDamage: 79,  // 射程定位校準（原 79）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 60）  // 40 時單體 DPS 反而略低於滿級苦無
    baseCooldown: 0.12, // 極致機槍射速
    speed: 800,
    projectiles: 1,
    pierce: 5,
    charge: { every: 6, effect: 'burn' }, // 射速快，間隔拉長
    projType: 'shuriken',
    homing: 6.0,
    range: 560,               // 直線穿透的飛行距離
  },
  eternal_domain: {
    id: 'eternal_domain',
    name: '永恆守護力場 (超武)',
    icon: '🌌🛡️',
    element: 'physical',
    description: '輪盤化為常駐的金色力場，範圍內的敵人持續受創，並定時放出擊退風暴。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'guardian',
    baseDamage: 54,  // 射程定位校準（原 109）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 78）  // 傷害節奏改由 rehit (0.4s) 控制，單刀要拉高才撐得起超武定位
    baseCooldown: 0, // 無 CD，永久旋轉
    duration: 999999,
    spinSpeed: 5.5,
    count: 6,
    radius: 110,
    forceField: true,              // 力場：跟著玩家的圓形領域（WeaponManager.fireForceField）
    stormEvery: 2.0,               // 擊退風暴間隔（秒）
    pierceAll: true,          // 持續領域：範圍內全部
  },
  shark_torpedo: {
    id: 'shark_torpedo',
    name: '鯊魚核彈 (超武)',
    icon: '🦈💣',
    element: 'toxic',
    description: '放出擺尾獵殺的鯊魚魚雷，一路追咬目標，撞上即核爆震動全畫面，每 2 發挾帶劇毒。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'rocket',
    baseDamage: 249,  // 射程定位校準（原 249）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 195）
    baseCooldown: 1.2,  // 1.8 時單體 DPS 反而低於滿級火箭
    speed: 460,
    homing: 3.2,                   // 鯊魚轉彎比飛彈鈍，但會一直追
    swim: true,
    explosionRadius: 220,
    count: 2,
    charge: { every: 2, effect: 'poison' },
    range: 660,               // 追咬距離
    pierceAll: true,          // 核爆：範圍內全中
  },
  napalm_sea: {
    id: 'napalm_sea',
    name: '燃油煉獄 (超武)',
    icon: '🔥🌊',
    element: 'fire',
    description: '拋出藍焰燃油彈，落地後火海沿地面持續擴散，迅速融化怪群。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'molotov',
    baseDamage: 46,  // 射程定位校準（原 70）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 52）  // 滿級燃燒瓶每跳就是 24，超武不能原地踏步
    baseCooldown: 2.0,
    duration: 5.5,
    radius: 140,
    count: 3,
    spreadFrom: 0.6,               // 火海半徑從 60% 擴散到 130%（2.5 秒內）
    spreadTo: 1.3,
    spreadTime: 2.5,
    pierceAll: true,          // 範圍型：火海每跳燒到範圍內全部
  },
  plasma_storm: {
    id: 'plasma_storm',
    name: '狂雷星暴 (超武)',
    icon: '🌩️💥',
    element: 'shock',
    description: '中心一記巨雷，外圈落雷呈星形爆開，並以電光射線連回中心。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'lightning',
    baseDamage: 98,  // 射程定位校準（原 98）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 98）
    baseCooldown: 1.1,
    strikes: 6,                    // 中心 1 + 外圈 5
    starBurst: true,
    starRadius: 80,
    linkDamageMul: 0.2,
    linkWidth: 20,
    range: 320,               // 星形落雷的索敵距離
    pierceAll: true,          // 落點與星芒內全中
  },
  quantum_sphere: {
    id: 'quantum_sphere',
    name: '量子星雲球 (超武)',
    icon: '⚛️⚽',
    element: 'frost',
    description: '量子球在敵群間彈射，每次命中裂變出一顆子球，拖著能量殘影，每 4 顆挾帶冰凍。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'soccer',
    baseDamage: 70,  // 射程定位校準（原 70）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 58）                // 命中裂變 + 敵間彈射，命中數遠多於舊版飛出畫面的球
    baseCooldown: 2.2,
    speed: 700,
    bounces: 10,
    count: 4,
    charge: { every: 4, effect: 'freeze' },
    splitGen: 1,                   // 命中裂變的世代上限（子球不再裂變）
    range: 560,               // 彈射球的飛行距離
    pierceAll: true,          // 彈射型：撞到就彈向下一隻（吃群靠彈射，不是靠穿透）
  },

  // 新增武器 (內容擴充批)：開路穿透型 ─ 相位飛刃
  // 彩鴿式雙武合成：相位飛刃滿級 + 苦無滿級 → 相位風暴 (兩把都消耗，騰出一個武器槽)
  // ── 第二輪擴充：兩把新基礎武器 ──────────────────────────────────────
  // 兩把都刻意做成「既有投射物類型之外的新行為」，而不是換皮：
  //   boomerang 去程與回程都會切開路徑（同一隻敵人可以被去/回各打一次）
  //   railgun   開火當下結算整條直線的傷害（不是飛行彈體）
  boomerang: {
    id: 'boomerang',
    name: '特工迴力鏢',
    icon: '🪃',
    element: 'physical',
    description: '擲出會折返的鋒利迴力鏢，去程與回程各切開一次路徑上的敵人。',
    isEvo: false,
    evoTarget: 'twin_storm',
    pairPassive: 'guardian',     // 雙武合成：迴力鏢 + 守護輪盤 → 雙刃風暴
    maxLevel: 5,
    baseDamage: 31,  // 射程定位校準（原 31）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 26）
    baseCooldown: 1.15,
    cooldownGrowth: -0.1,
    speed: 520,
    projType: 'boomerang',
    // 各等級：去程時間（秒）、同時擲出數、穿透、再命中間隔
    outTime: [0.34, 0.36, 0.38, 0.40, 0.42],
    count: [1, 2, 2, 3, 4],
    pierce: [2, 2, 3, 3, 4],
    rehit: 0.45,
    range: 520,               // 去回各一刀的飛行距離
  },
  railgun: {
    id: 'railgun',
    name: '電磁軌道炮',
    icon: '🔫',
    element: 'shock',
    description: '充能後掃出貫穿全場的電磁射線，直線上的敵人一次全部命中。',
    isEvo: false,
    evoTarget: 'annihilation_beam',
    pairPassive: 'atk_scroll',   // 配件滿級即可合成
    maxLevel: 5,
    baseDamage: 82,  // 射程定位校準（原 82）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 58）
    baseCooldown: 2.6,
    cooldownGrowth: -0.4,
    projType: 'rail_beam',
    range: 900,
    width: [26, 30, 34, 38, 42],
    laneCount: 1,
    pierceAll: true,          // 光束：一條線整排貫穿（長射程＝高穿透）
  },

  twin_storm: {
    id: 'twin_storm',
    name: '雙刃風暴',
    icon: '🌪️',
    element: 'fire',
    description: '兩道反向旋轉的巨型迴力鏢持續颳掃，去回都追擊並附帶燃燒。',
    isEvo: true,
    evoTarget: null,
    maxLevel: 5,
    evoGrowth: 0.25,             // 覺醒：每級傷害 +25%（見 WeaponManager 的傷害計算）
    baseDamage: 114,  // 射程定位校準（原 114）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 94）
    baseCooldown: 0.62,
    speed: 610,
    projType: 'boomerang',
    outTime: [0.55, 0.55, 0.55, 0.55, 0.55],
    count: [2, 2, 3, 3, 4],
    pierce: [6, 6, 7, 7, 8],        // 雙迴力鏢：中長射程的中高穿透（不是無限）
    rehit: 0.30,
    burnOnHit: 4,                // 命中點燃（每秒 4 點、由 molotov 的燃燒系統處理）
    range: 560,               // 雙迴力鏢的飛行距離
  },
  annihilation_beam: {
    id: 'annihilation_beam',
    name: '湮滅射線',
    icon: '☄️',
    element: 'fire',
    description: '三道加寬的湮滅射線掃過全場，命中即點燃，冷卻大幅縮短。',
    isEvo: true,
    evoTarget: null,
    maxLevel: 5,
    evoGrowth: 0.25,
    baseDamage: 252,  // 射程定位校準（原 252）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 172）
    baseCooldown: 1.25,
    projType: 'rail_beam',
    range: 1200,
    width: [64, 64, 64, 64, 64],
    laneCount: 3,
    burnOnHit: 6,
    pierceAll: true,          // 光束：一條線整排貫穿（最長射程）
  },

  phase_blade: {
    id: 'phase_blade',
    name: '相位飛刃',
    icon: '💠',
    element: 'shock',
    description: '相位刃命中後會相位跳躍到附近下一個敵人面前繼續切割。每 4 發蓄能射出電弧刃。與苦無可合體為超武。',
    isEvo: false,
    evoTarget: 'phase_storm',
    pairPassive: 'kunai',          // 武器+武器合成 (VS 黑白鴿精神)
    maxLevel: 5,
    baseDamage: 24,  // 射程定位校準（原 24）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 22）                // 相位跳躍讓命中率大增，單發傷害相應調低
    baseCooldown: 1.4,
    cooldownGrowth: -0.12,
    speed: 560,
    projectiles: [1, 2, 2, 3, 4],
    pierce: [2, 2, 3, 4, 5],       // 相位跳躍保證第二刀命中，穿透比直線飛行時少
    charge: { every: 4, effect: 'chain' }, // 每 4 發射出一枚電弧刃
    projType: 'drill',
    phaseJump: 200,                // 相位跳躍搜尋半徑
    phaseJumps: 1,                 // 每發最多跳幾次
    range: 340,               // 貼近的鑽頭：短射程 + 相位跳躍
  },
  // 新增武器 (內容擴充批)：護身環繞型 ─ 重力環鋸
  orbit_saw: {
    id: 'orbit_saw',
    name: '重力環鋸',
    icon: '🪚',
    element: 'physical',
    description: '環鋸繞體旋轉並產生重力場，把附近的敵人吸向鋸環切割。',
    isEvo: false,
    evoTarget: 'singularity_ring',
    pairPassive: 'cdr_battery',
    maxLevel: 5,
    baseDamage: 10,  // 射程定位校準（原 20）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 18）
    baseCooldown: 1.9,
    duration: 3.2,
    spinSpeed: 4.2,
    count: [2, 3, 4, 5, 6],
    // 貼身護體軌道：緊貼角色旋轉，與守護輪盤的寬軌道明顯區隔
    radius: [34, 40, 46, 52, 58],
    projType: 'saw',
    pullRadius: 110,               // 重力場：鋸環外 110px 內的雜兵被往內拉
    pullSpeed: 55,
    pierceAll: true,          // 範圍型：鋸環掃到就中
  },

  // 雙武合體超武：相位風暴 (消耗 相位飛刃 + 苦無)
  phase_storm: {
    id: 'phase_storm',
    name: '相位風暴 (超武)',
    icon: '🌀💠',
    element: 'shock',
    description: '雙武合體！飛刃從特工周圍的相位裂隙不斷射出，命中後連續相位跳躍，每 8 發挾帶電弧刃。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'phase_blade',
    baseDamage: 69,  // 射程定位校準（原 69）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 58）
    baseCooldown: 0.3,             // 裂隙射出 + 相位跳躍，命中率高，射速相應放慢
    speed: 720,
    projectiles: 1,
    pierce: 4,                     // 中短射程的中穿透（相位跳躍另計，不是靠穿透）
    charge: { every: 8, effect: 'chain' }, // 合體超武射速極快，間隔再拉長
    projType: 'drill',
    phaseJump: 240,
    phaseJumps: 1,
    riftRadius: 70,                // 相位裂隙：出生點在玩家周圍 70px 的圓上
    range: 420,               // 裂隙射出的鑽頭：中短射程
  },
  // 護身超武：重力奇點環 (重力環鋸的永續型態)
  singularity_ring: {
    id: 'singularity_ring',
    name: '重力奇點環 (超武)',
    icon: '🌌🪚',
    element: 'physical',
    description: '特工身邊生成黑洞奇點，強大引力把大範圍的敵人吸進永續運轉的鋸環。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,   // 覺醒：每級傷害 +25%（超武進化後仍可升級）
    baseWeapon: 'orbit_saw',
    baseDamage: 52,  // 射程定位校準（原 105）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 91）  // 同上：軌道更貼身、範圍更小，單刀給得比守護力場高
    baseCooldown: 0,
    duration: 999999,
    spinSpeed: 6.2,
    count: 6,
    radius: 62,
    projType: 'saw',
    pullRadius: 200,
    pullSpeed: 110,
    pierceAll: true,          // 範圍型：奇點環內全部
  },

  // ── 第三輪擴充：兩把新基礎武器 ──────────────────────────────────────
  // 一樣刻意選「既有類型之外的新行為」：
  //   frost_nova 以玩家為中心的冰霜脈衝（不鎖定、不飛行，範圍內一次全吃，附帶減速）
  //   shotgun    近距離扇形霰彈（多顆短射程彈丸 + 強擊退，貼臉才打得滿）
  frost_nova: {
    id: 'frost_nova',
    name: '冰霜新星',
    icon: '❄️',
    element: 'frost',
    description: '以特工為中心爆發冰霜脈衝，範圍內的敵人全部受創並減速。',
    isEvo: false,
    evoTarget: 'absolute_zero',
    pairPassive: 'range_fuel',     // 範圍型武器 ↔ 範圍配件
    maxLevel: 5,
    baseDamage: 24,  // 射程定位校準（原 48）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 30）
    baseCooldown: 1.8,
    cooldownGrowth: -0.25,
    radius: [110, 120, 135, 150, 165],
    slowDur: 2.0,                  // 比冷卻長：範圍內的敵人會被持續減速（赫爾碎冰也靠這個）
    pierceAll: true,          // 範圍型：脈衝半徑內全部
  },
  shotgun: {
    id: 'shotgun',
    name: '特工霰彈槍',
    icon: '💥',
    element: 'physical',
    description: '朝最近敵人轟出扇形霰彈，射程短但彈丸多、擊退強。單發射擊後強制換彈（幫浦行程）；升級縮短換彈時間。射程越短，每顆彈丸越痛。',
    isEvo: false,
    evoTarget: 'dragon_breath',
    pairPassive: 'max_hp_vest',    // 近戰距離武器 ↔ 生存配件
    maxLevel: 5,
    baseDamage: 21,  // 射程定位校準（原 21）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 17）                // 單顆彈丸（升級不加傷害，超武才提高攻擊力）；
                                   // 實際傷害 = 這個值 × rangeDamageMul（見下方反比規則）。
                                   // 13 → 17：單發換彈讓每分鐘擊發次數掉到約 1/3，
                                   // 拉高單顆威力才不會讓「改成單發」變成純粹的削弱
                                   // （預設型態赫米斯 +30% 射程，反比規則會再打 0.77 折）
    baseCooldown: 0.42,
    magazine: 1,                   // 單發：擊發一次就進入換彈（幫浦／上彈）
    reload: [1.5, 1.32, 1.14, 0.94, 0.75],  // 換彈秒數：升級的主要收益
    speed: 720,
    projType: 'pellet',
    pellets: [8, 8, 8, 8, 8],
    spread: 0.8,                   // 扇形總角度（弧度）
    range: 165,                    // 240 → 165：真正的貼臉武器（也是傷害加成的來源）
    pierce: [1, 1, 1, 2, 2],
    pierce: [1, 1, 1, 1, 2],  // 最短射程＝最低穿透（滿級才多穿一隻）
  },

  absolute_zero: {
    id: 'absolute_zero',
    name: '絕對零度 (超武)',
    icon: '🧊',
    element: 'frost',
    description: '冰霜脈衝擴張成絕對零度領域，範圍翻倍，命中的雜兵直接凍結。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,
    baseWeapon: 'frost_nova',
    baseDamage: 113,  // 射程定位校準（原 113）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 110）
    baseCooldown: 1.2,
    radius: 230,
    slowDur: 2.5,
    freezeOnHit: 1.0,              // 雜兵凍結秒數（Boss 改吃減速，見 Enemy.applyFreeze）
    pierceAll: true,          // 範圍型：絕對零度領域內全部
  },
  dragon_breath: {
    id: 'dragon_breath',
    name: '龍息霰彈 (超武)',
    icon: '🐲',
    element: 'fire',
    description: '霰彈化為龍息烈焰，一次噴出 12 顆燃燒彈丸，貫穿並點燃整片怪群。攻擊力大幅提升，仍需換彈（單發）。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,               // 超武覺醒每級 +25% 基礎傷害（主打攻擊力）
    baseWeapon: 'shotgun',
    baseDamage: 94,  // 射程定位校準（原 94）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 88）                // 32 → 48 → 66 → 88：與霰彈槍同一條 rangeDamageMul 反比規則
                                   // （單發換彈後每輪少打兩發，威力要補回來）
    baseCooldown: 0.36,
    magazine: 1,                   // 繼承霰彈槍的單發換彈手感
    reload: 0.9,
    speed: 780,
    projType: 'pellet',
    pellets: 12,
    spread: 1.0,
    range: 210,                    // 300 → 210
    pierce: 2,                     // 短射程→低穿透
    burnOnHit: 6,
    pierce: 2,                // 短射程但龍息夠厚，比霰彈槍多穿一隻（仍遠低於光束）
  },

  // ── 戰鎚 40K 擴充武器 ─────────────────────────────────────────────
  bolter: {
    id: 'bolter',
    name: '帝國爆彈槍',
    icon: '🦅🔫',
    element: 'physical',
    description: '發射超音速高爆火箭彈丸，在目標體內延遲起爆，造成強烈穿甲破片與範圍擊退。',
    isEvo: false,
    evoTarget: 'storm_bolter',
    pairPassive: 'atk_scroll',     // 強力卷軸滿級合成
    maxLevel: 5,
    baseDamage: 47,  // 射程定位校準（原 47）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 38）
    baseCooldown: 0.85,
    cooldownGrowth: -0.08,
    speed: 760,
    projectiles: [1, 2, 2, 3, 4],
    pierce: [1, 1, 2, 2, 2],
    explosionRadius: [40, 45, 52, 60, 70],
    projType: 'bolter',
    range: 600,               // 爆彈槍的飛行距離（穿透低，靠爆炸吃群）
  },
  chainsword: {
    id: 'chainsword',
    name: '咆哮鏈鋸劍',
    icon: '⚙️🗡️',
    element: 'physical',
    description: '向前橫向弧形揮砍，高轉速鋸齒在短時間內造成多次割裂並附加持續流血。',
    isEvo: false,
    evoTarget: 'power_sword',
    pairPassive: 'max_hp_vest',    // 防護背心滿級合成
    maxLevel: 5,
    baseDamage: 17,  // 射程定位校準（原 34）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 28）
    baseCooldown: 1.35,
    cooldownGrowth: -0.15,
    radius: [75, 85, 95, 105, 120],
    arc: [1.8, 2.0, 2.2, 2.4, 2.8],
    hits: [3, 3, 4, 4, 5],
    projType: 'chainsword',
    bleedDps: 12,
    bleedDur: 3.0,
    pierceAll: true,          // 揮砍弧：弧內全部
  },

  storm_bolter: {
    id: 'storm_bolter',
    name: '神聖風暴爆彈槍 (超武)',
    icon: '⚡🦅',
    element: 'shock',
    description: '雙聯裝全自動傾瀉高爆彈幕！具備 2 次穿透與神聖火花二次空爆，橫掃異形群。',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,
    baseWeapon: 'bolter',
    baseDamage: 112,  // 射程定位校準（原 112）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 88）
    baseCooldown: 0.38,
    speed: 860,
    projectiles: [2, 3, 4, 4, 5],
    pierce: [2, 2, 3, 3, 4],
    explosionRadius: [75, 80, 85, 90, 100],
    projType: 'storm_bolter',
    range: 660,               // 風暴爆彈槍的飛行距離
  },
  power_sword: {
    id: 'power_sword',
    name: '帝皇動力神劍 (超武)',
    icon: '⚔️⚡',
    element: 'shock',
    description: '360 度激發神聖解離力場橫掃近身敵人，並向前激射兩道月牙型空間震波！',
    isEvo: true,
    maxLevel: 5,
    evoGrowth: 0.25,
    baseWeapon: 'chainsword',
    baseDamage: 88,  // 射程定位校準（原 176）：淨效果 = 宣告射程的 tier^0.25  // 射程定位校準（原 115）
    baseCooldown: 0.85,
    radius: 145,
    projType: 'power_sword',
    shockwaveDmg: 85,
    shockwaveSpeed: 520,
    shockwavePierce: 99,
    pierceAll: true,          // 揮砍弧：弧內全部
  },
};

// ── 射程的正規化（單一真相）──────────────────────────────────────────
//
// 「範圍就是射程」的武器（環繞刀刃、火海、冰霜脈動、揮砍弧）不另外寫一份 range，
// 直接沿用 radius —— 兩份數字一定會漂移，而漂移的方向永遠是「改了 radius 但忘記
// 改 range，於是傷害倍率默默算錯」。這裡補齊之後，下面每一把武器的 range 都保證有值。
for (const def of Object.values(WEAPONS)) {
  if (def.range === undefined && def.radius !== undefined) def.range = def.radius;
}

// 開機體檢：射程與穿透是「射程 ↔ 攻擊力 ↔ 穿透」三軸定位的必要資料，
// 缺一個就等於那把武器不參與規則（而且不會有任何錯誤訊息）。
for (const [id, def] of Object.entries(WEAPONS)) {
  if (def.range === undefined) console.warn(`[config] 武器 ${id} 沒有 range，射程規則對它無效`);
  if (def.pierce === undefined && !def.pierceAll) {
    console.warn(`[config] 武器 ${id} 沒有 pierce 也沒有 pierceAll（穿透無法區隔）`);
  }
}


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

// ── 敵人攻擊屬性（元素）────────────────────────────────────────────────
//
// 為什麼要有這一層：玩家的防禦是「多層相乘 + 上限」的堆疊（護甲 ≤50%、鐵壁藥水
// 再 ×0.5、聖域再 ×(1-resist)、護盾吸收、以及最關鍵的 **0.5 秒無敵影格**）。
// 相乘之後，雜兵的接觸傷害只有「每 0.5 秒一下」這個上限 —— 一旦玩家的
// 生命＋回復超過 2×單下傷害÷減傷，**任何人數的雜兵都殺不死他**。
// 這正是「過了一個強度就基本不死」的結構原因：不是敵人太弱，是傷害只有一個
// 通道，而那個通道被無敵影格與減傷封死了。
//
// 所以這裡加的是**第二條通道**：屬性傷害。
//   ① armorPierce —— 護甲（metaArmor）對屬性傷害只有部分效果，堆滿 50% 也擋不住。
//   ② dotPct / dotFlat —— 命中後在玩家身上留下持續傷害。持續傷害是**逐幀結算**，
//      完全不受 0.5 秒無敵影格限制，所以「站著不動」永遠是危險的。
//   ③ dotPct 是「玩家最大生命的比例」—— 這是讓曲線平滑的核心：傷害自動跟著
//      玩家的成長曲線走，不會在後期變成 0，也不會在前期一擊秒殺。
//
// 數值刻意保守：單層最多 1.0~1.6%/秒，疊滿 3~5 層約 4~6%/秒（約 17~25 秒致命），
// 而且離開攻擊源後數秒內自動消退 —— 是「逼你走位」的壓力，不是無法應對的死刑。
export const ELEMENTS = {
  physical: {
    id: 'physical', name: '物理', icon: '🩸', color: '#ffffff',
    armorPierce: 0, dotFlat: 0, dotPct: 0, dotDur: 0, maxStacks: 0, speedMul: 1,
  },
  toxic: {
    id: 'toxic', name: '劇毒', icon: '☠️', color: '#7dff8f',
    armorPierce: 0.5,        // 護甲只擋一半
    dotFlat: 1.4,            // × enemyScale().elem（時間曲線）
    dotPct: 0.012,           // 每層每秒 1.2% 最大生命
    dotDur: 4.5,
    maxStacks: 5,
    speedMul: 1,
  },
  fire: {
    id: 'fire', name: '燃燒', icon: '🔥', color: '#ff7b00',
    armorPierce: 0.35,
    dotFlat: 2.2,
    dotPct: 0.018,
    dotDur: 3.0,
    maxStacks: 3,
    speedMul: 1,
  },
  shock: {
    id: 'shock', name: '電擊', icon: '⚡', color: '#00e5ff',
    armorPierce: 0.6,        // 金屬護甲反而導電
    dotFlat: 1.1,
    dotPct: 0.009,
    dotDur: 2.5,
    maxStacks: 4,
    speedMul: 0.88,
  },
  frost: {
    id: 'frost', name: '冰凍', icon: '❄️', color: '#7fd8ff',
    armorPierce: 0.25,
    dotFlat: 0.8,
    dotPct: 0.006,
    dotDur: 3.0,
    maxStacks: 3,
    speedMul: 0.78,          // 減速才是冰凍的主效果，傷害只是附帶
  },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS).filter((k) => k !== 'physical');

// ── 射程 ↔ 攻擊力 ↔ 穿透（設計原則，玩家指定）────────────────────────
//
// 「射程越短的攻擊力越強」對**所有**武器成立，而且「穿透能力也要有所區隔」。
// 三條軸合起來就是每一把武器的定位：
//
//   短射程 ── 高單發傷害 ── 低穿透   （霰彈槍、鏈鋸劍、環鋸、火海）
//   中射程 ── 中單發傷害 ── 中穿透   （苦無、迴力鏢、爆彈槍）
//   長射程 ── 低單發傷害 ── 高穿透   （軌道炮、殲滅光束：一條線整排)
//
// 怎麼讓它「真的成立」而不是只寫在說明文字裡 —— 三個部件：
//
//   ① `WEAPONS[*].range`：每一把武器都必須明列射程（見檔案下方的正規化）。
//      沒有這個欄位就沒有規則可言，所以它同時是資料也是契約（verify-weapons 會驗）。
//   ② `rangeDamageMul()`：規則本體。用 **(REF/range)^EXP 再夾住**，而不是單純的
//      REF/range —— 武器的射程橫跨 34px（環鋸）到 1200px（殲滅光束），線性反比會變成
//      35 倍的傷害差，那不是定位而是失衡。取 0.45 次方把 35 倍壓成 2.6 倍，
//      再夾在 0.6~2.2 之間。這個值用來**校準 baseDamage**（見每把武器的註解）。
//   ③ `rangeTradeoffMul()`：玩家端的動態取捨。高能燃料（+15%/級）、烈焰之觸（範圍 +20%）、
//      赫米斯型態（射程 +30%）拉長射程時，傷害會依同一條規則下降。
//
// 為什麼 ③ 要用「比值」而不是絕對值：等級成長也會放大射程（守護輪盤 L1 65 → L5 95、
// 烈焰新星 110 → 165）。如果直接乘絕對值，**升級反而會讓武器變弱**。
// 用「拉長後的射程 ÷ 原始射程」當比值，升級的射程成長不列入取捨，只有玩家主動
// 用配件／型態換覆蓋範圍時才付代價。
export const RANGE_DAMAGE_REF = 320;     // 基準射程（中程武器 ≈ ×1）
export const RANGE_DAMAGE_EXP = 0.45;    // 壓縮指數：把 35 倍的射程差壓成 2.6 倍
export const RANGE_DAMAGE_MIN = 0.6;     // 長射程武器的下限（不會被懲罰到負值）
export const RANGE_DAMAGE_MAX = 2.2;     // 貼臉武器的上限（不會無限膨脹）

export function rangeDamageMul(range) {
  const r = Math.max(20, Number(range) || RANGE_DAMAGE_REF);
  const raw = Math.pow(RANGE_DAMAGE_REF / r, RANGE_DAMAGE_EXP);
  return Math.min(RANGE_DAMAGE_MAX, Math.max(RANGE_DAMAGE_MIN, raw));
}

// 一把武器的「射程定位倍率」：由它宣告的射程決定。短射程 > 1、長射程 < 1。
// 取宣告值（陣列取第一級）而不是當前等級的值 —— 等級造成的射程成長是升級獎勵，
// 不該反過來扣傷害（守護輪盤 L1 65 → L5 95，用當前值會讓升級變成變弱）。
export function weaponRangeTier(def) {
  if (!def || def.range === undefined) return 1;
  const r = Array.isArray(def.range) ? def.range[0] : def.range;
  return rangeDamageMul(r);
}

// 玩家把射程拉長 k 倍之後，傷害要乘多少。k = 1 → 1（原封不動）。
export function rangeTradeoffMul(k) {
  const kk = Math.max(0.35, Number(k) || 1);
  return Math.min(RANGE_DAMAGE_MAX, Math.max(RANGE_DAMAGE_MIN, Math.pow(1 / kk, RANGE_DAMAGE_EXP)));
}

// 一次開火實際的射程倍率（型態的 rangeMul / radiusMul × 玩家的範圍倍率）。
// 寫成純函式是為了讓 verify-weapons 能在 Node 直接驗，不必起瀏覽器。
export function weaponRangeMul(stats = {}, playerRangeMultiplier = 1) {
  return (playerRangeMultiplier || 1) * ((stats && (stats.rangeMul || stats.radiusMul)) || 1);
}

// 「觸及即命中全部」：範圍型（火海／脈動／旋轉領域）與貫穿型（光束／揮砍弧）用這個
// 當穿透值。原本是散在 WeaponManager 各處的魔術數字 9999，改成一个具名常數。
export const PIERCE_ALL = 9999;

export function elementOf(id) {
  return ELEMENTS[id] || ELEMENTS.physical;
}

// ── 元素相剋循環 (四系循環相剋，物理中立) ───────────────────────────
// 🔥火 → ❄️冰 → ⚡電 → ☠️毒 → 🔥火
// 克制 (effective):   1.40× (+40% 傷害)
// 逆剋 (ineffective): 0.80× (-20% 傷害)
// 同屬 (resisted):    0.75× (-25% 傷害，同屬抗性)
// 物理 (physical):    1.00× (中立穩定無加減)
export const ELEMENT_COUNTERS = {
  fire:     { strong: 'frost', weak: 'toxic' },
  frost:    { strong: 'shock', weak: 'fire' },
  shock:    { strong: 'toxic', weak: 'frost' },
  toxic:    { strong: 'fire',  weak: 'shock' },
  physical: { strong: null,    weak: null },
};

export function getElementMultiplier(attackElement, targetElement) {
  const atk = (attackElement && attackElement.id) || attackElement || 'physical';
  const def = (targetElement && targetElement.id) || targetElement || 'physical';
  if (atk === 'physical' || def === 'physical') {
    return { mul: 1.0, relation: 'neutral' };
  }
  if (atk === def) {
    return { mul: 0.75, relation: 'resisted' };
  }
  const rule = ELEMENT_COUNTERS[atk];
  if (rule && rule.strong === def) {
    return { mul: 1.4, relation: 'effective' };
  }
  if (rule && rule.weak === def) {
    return { mul: 0.8, relation: 'ineffective' };
  }
  return { mul: 1.0, relation: 'neutral' };
}

// 哪一種敵人的攻擊與身軀帶哪一種屬性。沒有列到的就是純物理 —— 名單刻意覆蓋
// （酸液、火焰、電擊、冰霜），各屬性皆有普通怪、精英與首領。
export const ENEMY_ELEMENTS = {
  // 毒／酸：噴吐、孢子、自爆、焦油、毒氣
  boomer: 'toxic', spitter: 'toxic', spore_host: 'toxic', sporeling: 'toxic',
  hatcher: 'toxic', sniper: 'toxic', tar_slug: 'toxic', bloater: 'toxic',
  medic: 'toxic', termagant: 'toxic', poxwalker: 'toxic', spore_mine: 'toxic',
  boss_broodlord: 'toxic', rat_evil: 'toxic', snake_evil: 'toxic',
  ink_gas_boar: 'toxic', ink_ape_mother: 'toxic', pig_evil: 'toxic',
  // 火：砲擊、巨像重擊、龍息、狐火、爆破、猛獸
  mortar: 'fire', chimera: 'fire', dragon_evil: 'fire', squig_bomb: 'fire',
  makai_red_arremer: 'fire', tiger_evil: 'fire', dog_evil: 'fire',
  ink_fox: 'fire', ink_fox_guard: 'fire', ink_boar_king: 'fire',
  brute: 'fire',
  // 電：相位閃現、風刃、電場型、迅捷奔襲
  blinker: 'shock', warden: 'shock', rooster_evil: 'shock',
  horse_evil: 'shock', goat_evil: 'shock', ink_gale_wolf: 'shock',
  runner: 'shock',
  // 冰：寒霜主題、蝙蝠、暗鴉
  ink_shadow_crow: 'frost', ink_fox_spirit: 'frost', rabbit_evil: 'frost',
  bat: 'frost',
};

// 依關卡主題追加的屬性覆寫：同一隻雜兵在「冰封荒原」與「淪陷商業街」不該一樣冷。
// key 是關卡 id，值是 { 敵人 key: 元素 }。只覆寫有列到的。
export const LEVEL_ENEMY_ELEMENTS = {
  frost: { walker: 'frost', bat: 'frost', brute: 'frost', hound: 'frost', warden: 'frost' },
  frostvoid: { walker: 'frost', bat: 'frost', brute: 'frost', hound: 'frost', warden: 'frost', bloater: 'frost' },
  foundry: { walker: 'fire', brute: 'fire', hound: 'fire', warden: 'fire' },
  storm: { walker: 'shock', bat: 'shock', runner: 'shock', hound: 'shock' },
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
    // 42 → 95：遠程怪是「玩家要求多一些」的對象，但牠原本 42 血在玩家 44 DPS 下
    // 撐不到 1 秒 —— 加權重只會變成更多「一出現就被清掉」的雜兵，射不到幾發。
    hp: 95,
    speed: 75,
    damage: 8,
    color: '#06d6a0',
    radius: 15,
    exp: 2,
    ranged: {
      range: 270,        // 保持在射程外射擊
      cd: 2.0,           // 射擊冷卻 (秒)：2.4 → 2.0，讓遠程壓力真的存在
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
  sniper: {
    name: '酸蝕狙擊蟲',
    ai: { kind: 'kite', windup: 0.6, animSpeed: 5, sepMul: 0.9 }, // 長預警，閃得掉但不能站樁
    hp: 80,   // 38 → 80（同 spitter 的理由）
    speed: 60,
    damage: 8,
    color: '#4895ef',
    radius: 15,
    exp: 3,
    ranged: { range: 460, cd: 3.0, speed: 520, damage: 20, radius: 5, color: '#4cc9f0' },
  },
  medic: {
    name: '屍群巫醫',
    ai: { kind: 'shamble', wander: 0.2, animSpeed: 7, sepMul: 1.0 },
    hp: 55,
    speed: 70,
    damage: 8,
    color: '#9d4edd',
    radius: 14,
    exp: 4,
    healAura: { radius: 160, every: 2.5, pct: 0.15 }, // 定時替周圍雜兵回血，優先擊殺目標
  },
  blinker: {
    name: '虛空潛行者',
    ai: { kind: 'weave', weaveAmp: 30, weaveFreq: 4, hoverAmp: 0.3, hoverFreq: 2.4, animSpeed: 13, sepMul: 0.5 },
    hp: 24,
    speed: 110,
    damage: 12,
    color: '#2ec4b6',
    radius: 11,
    exp: 2,
    blink: { every: 4, min: 260, dist: 110 }, // 離目標太遠時瞬移到身邊
  },
  mortar: {
    name: '迫擊砲蟲',
    ai: { kind: 'plod', kbResist: 0.3, animSpeed: 4.5, sepMul: 1.2 },
    hp: 60,
    speed: 45,
    damage: 10,
    color: '#fb8500',
    radius: 18,
    exp: 4,
    // 朝特工「當下位置」拋射：地面先亮 fuse 秒預警圈才爆 —— 站著不動才會中
    mortar: { every: 4.2, range: 560, radius: 70, fuse: 1.2, dmg: 18, color: '#fb8500' },
  },
  tar_slug: {
    name: '焦油蛞蝓',
    ai: { kind: 'shamble', wander: 0.15, animSpeed: 4, sepMul: 1.4 },
    hp: 75,
    speed: 55,
    damage: 10,
    color: '#5a3e2b',
    radius: 18,
    exp: 3,
    // 沿路留下減速泥沼 (特工與怪物都會被拖慢)：把路線切碎，翻滾才是出路
    trail: { every: 1.3, radius: 48, dur: 6, color: '#3d2b1f' },
  },
  bloater: {
    name: '腐屍氣囊',
    ai: { kind: 'plod', kbResist: 0.2, animSpeed: 6, sepMul: 1.1 },
    hp: 45,
    speed: 75,
    damage: 10,
    color: '#8ac926',
    radius: 17,
    exp: 3,
    // 死亡時炸出毒池：近身擊殺要付代價，逼玩家用遠程武器或殺完就走
    deathZone: { radius: 80, dur: 4, dmg: 6, color: '#8ac926' },
  },
  // ── 水墨仙山妖獸 (只在水墨仙山出現；sprite key 與 type 同名) ──────────
  ink_wolf: {
    name: '墨狼',
    // 狼群：繞到側面再撲咬，撲得比獵犬更遠
    ai: { kind: 'flank', standoff: 170, lunge: { every: 2.6, windup: 0.35, dur: 0.45, mul: 3.4 }, animSpeed: 12, sepMul: 0.7 },
    hp: 40,
    speed: 160,
    damage: 10,
    color: '#3c4745',
    radius: 13,
    exp: 2,
  },
  ink_boar: {
    name: '山豬妖',
    // 直線衝撞：長預警 → 鎖定方向狂奔一大段，側身一閃就能躲開
    ai: { kind: 'plod', kbResist: 0.55, lunge: { every: 3.8, windup: 0.8, dur: 0.95, mul: 4.6 }, animSpeed: 6, sepMul: 1.5 },
    hp: 130,
    speed: 58,
    damage: 18,
    color: '#5a6663',
    radius: 21,
    exp: 4,
  },
  ink_crow: {
    name: '墨鴉',
    // 成群俯衝：大幅左右擺盪、忽快忽慢，脆但難瞄
    ai: { kind: 'weave', weaveAmp: 60, weaveFreq: 4.4, hoverAmp: 0.5, hoverFreq: 3, animSpeed: 14, sepMul: 0.5 },
    hp: 20,
    speed: 150,
    damage: 7,
    color: '#1c2322',
    radius: 12,
    exp: 1,
  },
  ink_fox: {
    name: '狐火妖',
    // 狐火三連：一次噴出扇形三團狐火，站在正前方最危險
    ai: { kind: 'kite', windup: 0.5, animSpeed: 7, sepMul: 0.9 },
    hp: 90,
    speed: 80,
    damage: 8,
    color: '#f5962d',
    radius: 15,
    exp: 3,
    ranged: { range: 300, cd: 2.6, speed: 210, damage: 11, radius: 7, color: '#ff9a3c', count: 3, spread: 0.32 },
  },
  ink_ape: {
    name: '山魈',
    // 重型妖王：遠處投石 (落點預警)，貼近就捶地震波
    ai: { kind: 'slam', slam: { every: 3.6, windup: 0.7, radius: 130, dmg: 22 }, kbResist: 0.6, animSpeed: 4.5, sepMul: 2.0 },
    hp: 320,
    speed: 46,
    damage: 22,
    color: '#c9443a',
    radius: 27,
    exp: 7,
    damageTakenMul: 0.7,
    mortar: { every: 5, range: 520, radius: 64, fuse: 1.1, dmg: 16, color: '#8a7a66' },
  },
  ink_gale_wolf: {
    name: '疾風狼妖',
    // 風遁：直線狂奔撲殺，連撲間隔短
    ai: { kind: 'lunge', lunge: { every: 2.2, windup: 0.3, dur: 0.5, mul: 3.8 }, animSpeed: 13, sepMul: 0.6 },
    hp: 34, speed: 125, damage: 11, color: '#7b6cff', radius: 13, exp: 2,
  },
  ink_boar_king: {
    name: '鐵鬃豬王',
    // 正面鐵鬃擋傷 + 長預警衝撞：要繞到背後打
    ai: { kind: 'shield', shieldArc: 1.6, shieldMul: 0.45, kbResist: 0.7, lunge: { every: 4.6, windup: 0.9, dur: 1.0, mul: 4.2 }, animSpeed: 5, sepMul: 1.6 },
    hp: 220, speed: 54, damage: 22, color: '#b3261e', radius: 23, exp: 6,
  },
  ink_gas_boar: {
    name: '脹氣豬妖',
    // 死後炸出瘴氣池
    ai: { kind: 'plod', kbResist: 0.3, animSpeed: 6, sepMul: 1.1 },
    hp: 60, speed: 72, damage: 12, color: '#a3b84a', radius: 18, exp: 3,
    deathZone: { radius: 85, dur: 4, dmg: 7, color: '#a3b84a' },
  },
  ink_shadow_crow: {
    name: '遁影鴉',
    // 影遁：離太遠就瞬移到身邊
    ai: { kind: 'weave', weaveAmp: 40, weaveFreq: 4, hoverAmp: 0.3, hoverFreq: 2.4, animSpeed: 14, sepMul: 0.5 },
    hp: 26, speed: 120, damage: 12, color: '#7a3cff', radius: 12, exp: 2,
    blink: { every: 3.6, min: 240, dist: 100 },
  },
  ink_fox_guard: {
    name: '玄狐衛士',
    // 狐火落雷：朝特工腳下拋出狐火，地面先亮預警圈
    ai: { kind: 'plod', kbResist: 0.3, animSpeed: 5, sepMul: 1.2 },
    hp: 80, speed: 50, damage: 10, color: '#4a6cff', radius: 17, exp: 4,
    mortar: { every: 3.8, range: 560, radius: 72, fuse: 1.1, dmg: 18, color: '#5b8cff' },
  },
  ink_fox_spirit: {
    name: '青丘靈狐',
    // 九尾靈氣：定時替周圍妖獸回血，優先擊殺
    ai: { kind: 'shamble', wander: 0.2, animSpeed: 7, sepMul: 1.0 },
    hp: 70, speed: 68, damage: 8, color: '#9fc0ff', radius: 16, exp: 5,
    healAura: { radius: 170, every: 2.4, pct: 0.15 },
  },
  ink_ape_mother: {
    name: '育魈母',
    // 妖巢之母：定時產下墨鴉，死後裂出兩隻山魈幼崽 (墨狼)
    ai: { kind: 'rooted', kbResist: 0.7, animSpeed: 3.5, sepMul: 2.5 },
    hp: 200, speed: 20, damage: 14, color: '#e0b0c0', radius: 26, exp: 7,
    damageTakenMul: 0.8,
    hatchMinion: 'ink_crow', hatchInterval: 6, hatchCount: 2,
    splitInto: 'ink_wolf', splitCount: 2,
  },

  // ── 戰鎚 40K 異形與綠皮軍團 ───────────────────────────────────────
  hormagaunt: {
    name: '泰倫跳蟲',
    ai: { kind: 'weave', weaveAmp: 35, weaveFreq: 4.5, hoverAmp: 0.25, hoverFreq: 3.0, animSpeed: 14, sepMul: 0.6 },
    hp: 28,
    speed: 155,
    damage: 10,
    color: '#8338ec',
    radius: 13,
    exp: 2,
  },
  termagant: {
    name: '泰倫槍蟲',
    ai: { kind: 'kite', windup: 0.5, animSpeed: 6, sepMul: 0.8 },
    hp: 45,
    speed: 75,
    damage: 12,
    color: '#3a0ca3',
    radius: 14,
    exp: 3,
    ranged: { range: 380, cd: 2.8, speed: 420, damage: 16, radius: 6, color: '#38b000' },
  },
  spore_mine: {
    name: '漂浮孢子囊',
    ai: { kind: 'plod', kbResist: 0.1, animSpeed: 5, sepMul: 0.9 },
    hp: 25,
    speed: 60,
    damage: 18,
    color: '#70e000',
    radius: 16,
    exp: 2,
    deathZone: { radius: 85, dur: 4.5, dmg: 10, color: '#38b000' },
  },
  genestealer: {
    name: '基因竊取者',
    ai: { kind: 'flank', standoff: 160, lunge: { every: 2.4, windup: 0.3, dur: 0.45, mul: 3.6 }, animSpeed: 13, sepMul: 0.6 },
    hp: 70,
    speed: 165,
    damage: 18,
    color: '#560bad',
    radius: 16,
    exp: 4,
  },
  ork_boy: {
    name: '歐克砍砍小子',
    ai: { kind: 'plod', kbResist: 0.60, lunge: { every: 3.5, windup: 0.6, dur: 0.7, mul: 2.8 }, animSpeed: 7, sepMul: 1.3 },
    hp: 95,
    speed: 80,
    damage: 16,
    color: '#2d6a4f',
    radius: 17,
    exp: 4,
  },
  squig_bomb: {
    name: '爆彈跳跳怪',
    ai: { kind: 'lunge', lunge: { every: 1.8, windup: 0.2, dur: 0.6, mul: 4.0 }, animSpeed: 15, sepMul: 0.5 },
    hp: 35,
    speed: 180,
    damage: 35,
    color: '#d00000',
    radius: 12,
    exp: 2,
    deathZone: { radius: 65, dur: 1.5, dmg: 25, color: '#ff5400' },
  },
  poxwalker: {
    name: '納垢瘟疫行者',
    ai: { kind: 'shamble', wander: 0.2, animSpeed: 5, sepMul: 1.0 },
    hp: 65,
    speed: 55,
    damage: 12,
    color: '#606c38',
    radius: 15,
    exp: 2,
    deathZone: { radius: 75, dur: 4.0, dmg: 8, color: '#606c38' },
  },

  // 魔界村經典魔物
  makai_zombie: {
    name: '食屍活死人',
    ai: { kind: 'shamble', wander: 0.35, animSpeed: 7, sepMul: 0.9 },
    hp: 34,
    speed: 84,
    damage: 10,
    color: '#8a4fff',
    radius: 14,
    exp: 1,
  },
  makai_red_arremer: {
    name: '紅魔鬼',
    ai: { kind: 'weave', weaveAmp: 55, weaveFreq: 4.2, hoverAmp: 0.45, hoverFreq: 2.8, animSpeed: 14, sepMul: 0.6 },
    hp: 24,
    speed: 160,
    damage: 14,
    color: '#e63946',
    radius: 13,
    exp: 2,
  },
  makai_woody: {
    name: '枯木妖靈',
    ai: { kind: 'plod', kbResist: 0.6, animSpeed: 5, sepMul: 1.5 },
    hp: 135,
    speed: 62,
    damage: 22,
    color: '#5a3d68',
    radius: 22,
    exp: 4,
  },

  // 40K 專屬 Boss
  boss_nob: {
    name: '綠皮突擊大隻佬',
    ai: { kind: 'boss', animSpeed: 5, sepMul: 0 },
    hp: 12000,
    speed: 75,
    damage: 28,
    color: '#1b4332',
    radius: 36,
    exp: 60,
    behaviors: ['slam', 'charge', 'summon'],
  },
  boss_broodlord: {
    name: '基因竊取巢主',
    ai: { kind: 'boss', animSpeed: 6, sepMul: 0 },
    hp: 26000,
    speed: 95,
    damage: 32,
    color: '#3c096c',
    radius: 38,
    exp: 100,
    behaviors: ['blink', 'nova', 'summon'],
  },
  boss_carnifex: {
    name: '泰倫劊子手巨獸',
    ai: { kind: 'boss', animSpeed: 4, sepMul: 0 },
    hp: 55000,
    speed: 68,
    damage: 40,
    color: '#240046',
    radius: 48,
    exp: 250,
    behaviors: ['slam', 'barrage', 'nova', 'charge'],
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

  // ── 12 生肖邪煞魔怪 (Zodiac Evil Monsters) ──
  rat_evil: {
    name: '疫病魔鼠',
    ai: { kind: 'lunge', lunge: { every: 2.8, windup: 0.3, dur: 0.45, mul: 3.2 }, animSpeed: 12, sepMul: 0.6 },
    hp: 48, speed: 130, damage: 14, color: '#a700ff', radius: 14, exp: 3,
    deathZone: { radius: 70, dur: 3.5, dmg: 8, color: '#a700ff' },
  },
  ox_evil: {
    name: '熔岩煞牛',
    ai: { kind: 'plod', kbResist: 0.65, lunge: { every: 3.6, windup: 0.7, dur: 0.9, mul: 4.2 }, animSpeed: 5.5, sepMul: 1.5 },
    hp: 220, speed: 60, damage: 26, color: '#ff3300', radius: 24, exp: 5,
  },
  tiger_evil: {
    name: '幽冥魔虎',
    ai: { kind: 'flank', standoff: 175, lunge: { every: 2.5, windup: 0.35, dur: 0.48, mul: 3.8 }, animSpeed: 12, sepMul: 0.7 },
    hp: 160, speed: 145, damage: 24, color: '#9d0208', radius: 22, exp: 5,
  },
  rabbit_evil: {
    name: '血月狂兔',
    ai: { kind: 'weave', weaveAmp: 55, weaveFreq: 4.2, hoverAmp: 0.4, hoverFreq: 3, animSpeed: 14, sepMul: 0.5 },
    hp: 55, speed: 175, damage: 18, color: '#d00000', radius: 13, exp: 3,
  },
  dragon_evil: {
    name: '深淵邪龍',
    ai: { kind: 'kite', windup: 0.5, animSpeed: 6.5, sepMul: 1.2 },
    hp: 450, speed: 70, damage: 32, color: '#7209b7', radius: 28, exp: 12,
    damageTakenMul: 0.75,
    ranged: { range: 420, cd: 2.5, speed: 280, damage: 22, radius: 9, color: '#7209b7', count: 3, spread: 0.28 },
  },
  snake_evil: {
    name: '五毒巨蟒',
    ai: { kind: 'kite', windup: 0.4, animSpeed: 7, sepMul: 0.8 },
    hp: 140, speed: 85, damage: 16, color: '#38b000', radius: 18, exp: 4,
    ranged: { range: 340, cd: 2.2, speed: 240, damage: 14, radius: 8, color: '#38b000', count: 5, spread: 0.35 },
  },
  horse_evil: {
    name: '煉獄魔駒',
    ai: { kind: 'lunge', lunge: { every: 3.2, windup: 0.5, dur: 0.85, mul: 4.0 }, animSpeed: 10, sepMul: 1.1 },
    hp: 180, speed: 125, damage: 22, color: '#ff4800', radius: 22, exp: 5,
    trail: { every: 0.8, radius: 45, dur: 4, color: '#ff4800' },
  },
  goat_evil: {
    name: '巴弗煞羊',
    ai: { kind: 'plod', kbResist: 0.4, animSpeed: 6, sepMul: 1.2 },
    hp: 190, speed: 72, damage: 20, color: '#9c19e6', radius: 21, exp: 5,
    mortar: { every: 4.0, range: 480, radius: 65, fuse: 1.1, dmg: 20, color: '#9c19e6' },
  },
  monkey_evil: {
    name: '六耳魔猿',
    ai: { kind: 'slam', slam: { every: 3.4, windup: 0.65, radius: 135, dmg: 26 }, kbResist: 0.55, animSpeed: 6.5, sepMul: 1.6 },
    hp: 280, speed: 88, damage: 24, color: '#e01e37', radius: 25, exp: 7,
  },
  rooster_evil: {
    name: '亡骨魔雞',
    ai: { kind: 'kite', windup: 0.35, animSpeed: 8, sepMul: 0.7 },
    hp: 85, speed: 110, damage: 18, color: '#6a040f', radius: 15, exp: 4,
    ranged: { range: 360, cd: 2.0, speed: 380, damage: 18, radius: 7, color: '#6a040f' },
  },
  dog_evil: {
    name: '地獄狂犬',
    ai: { kind: 'lunge', lunge: { every: 2.2, windup: 0.25, dur: 0.5, mul: 3.6 }, animSpeed: 13, sepMul: 0.6 },
    hp: 95, speed: 165, damage: 20, color: '#dc2f02', radius: 16, exp: 4,
  },
  pig_evil: {
    name: '嗜血戰彘',
    ai: { kind: 'plod', kbResist: 0.6, animSpeed: 5, sepMul: 1.6 },
    hp: 310, speed: 65, damage: 28, color: '#b5179e', radius: 26, exp: 7,
    explodes: true,
    deathZone: { radius: 90, dur: 3.0, dmg: 25, color: '#b5179e' },
  },
};

// 精英詞綴：普通怪低機率帶詞綴，體型/顏色/掉落與行為都升級
export const ELITE_AFFIXES = {
  fast:    { name: '疾風', color: '#00e5ff', speedMul: 1.5, expMul: 2 },
  armored: { name: '裝甲', color: '#9fb3c8', hpMul: 1.6, damageTakenMul: 0.5, expMul: 2.5 },
  giant:   { name: '巨獸', color: '#ffb703', hpMul: 2.5, radiusMul: 1.45, damageMul: 1.35, expMul: 3 },
  toxic:   { name: '劇毒', color: '#b5179e', hpMul: 1.2, speedMul: 1.2, damageMul: 1.25, expMul: 2 },
  // 封印：靠近特工時用鎖鏈封住一把武器（停止攻擊），擊殺牠才解封
  sealer:  { name: '封印', color: '#9d4edd', hpMul: 1.8, expMul: 3, seal: { range: 360 } },
};

// 詞綴抽選：生存者（Spawner.rollElite）與守塔（TowerDefense.spawn）共用同一個池子，
// 兩邊的精英才會是同一批詞綴、同一組數值。
export const ELITE_KEYS = Object.keys(ELITE_AFFIXES);
export function rollEliteAffix() {
  return ELITE_KEYS[Math.floor(Math.random() * ELITE_KEYS.length)];
}

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
  JEWEL: { type: 'jewel', icon: '💎', radius: 10 },    // 珠寶 (圖示與顏色由 jewels.js 覆寫；陣亡也保留)
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
// color：拾取／使用提示的字色 (原本沒有這欄，提示一律吃到 undefined)。
// auto：「道具自動使用」開啟時的觸發時機說明；條件本身在 main.js 的 AUTO_USE，兩邊要一致。
export const CONSUMABLE_ITEMS = {
  potion:        { name: '恢復藥水', icon: '🍷', kind: 'heal',    value: 80, color: '#ff3366', desc: '立即回復 35% 生命值（至少 80 點）', auto: '生命低於 45%' },
  elixir:        { name: '高級萬靈藥', icon: '✨', kind: 'fullHeal', value: 100, color: '#ffd700', desc: '完全回滿生命值，並額外獲得 100 點能量護盾', auto: '生命低於 30%' },
  atk_potion:    { name: '力量藥水', icon: '⚔️', kind: 'buff', duration: 15, color: '#ff4d4d', desc: '15 秒內全武器攻擊力 +40%', auto: 'Boss 在附近或被大群包圍' },
  shield_potion: { name: '鐵壁藥水', icon: '🛡️', kind: 'buff', duration: 15, color: '#4da6ff', desc: '15 秒內受到傷害減免 50%', auto: '生命低於 60% 且被包圍或 Boss 在附近' },
  luck_potion:   { name: '幸運藥水', icon: '🍀', kind: 'buff', duration: 20, color: '#33ff99', desc: '20 秒內暴擊率 +25%、金幣掉落翻倍', auto: '畫面上怪物夠多時' },
  stopwatch:     { name: '時停懷錶', icon: '⏱️', kind: 'cc',   duration: 5, color: '#00ffff', desc: '凍結全場敵人與敵方子彈 5 秒', auto: '生命低於 35% 且被包圍，或彈幕逼近' },
  holy_water:    { name: '聖水',     icon: '🍶', kind: 'aoe',  value: 260, color: '#b3ecff', desc: '在特工周圍引爆淨化光環，造成隨時間成長的範圍傷害（足以清掉同期雜兵）並擊退敵人', auto: '身邊擠滿怪物時' },
  manna_prism:   { name: '曼納稜晶', icon: '💎', kind: 'cd',   value: 0, color: '#d966ff', desc: '所有武器與閃避冷卻立即歸零，瞬間觸發全彈齊發', auto: 'Boss 在附近或被大群包圍' },
  magic_ticket:  { name: '魔法門票', icon: '🎫', kind: 'magnet', value: 100, color: '#ffcc00', desc: '瞬間全圖磁吸所有掉落物，並獲得金幣（隨時間成長，基礎 100）', auto: '場上掉落物堆積時' },
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
  boomerang: [
    { id: 'hermes',  name: '赫米斯 (疾風迴旋)', icon: '💨', tag: '快速折返',
      desc: '投擲冷卻 -28%、飛行速度 +28%，迴力鏢更密集地來回切場。',
      stats: { cdMul: 0.72, speedMul: 1.28 } },
    { id: 'ares',    name: '阿瑞斯 (血刃)', icon: '🩸', tag: '重擊連切',
      desc: '單發傷害 ×1.35，且同一目標的再命中間隔縮短 35%（去回連段更痛）。',
      stats: { damageMul: 1.35, rehitMul: 0.65 } },
    { id: 'artemis', name: '阿特米斯 (月刃追獵)', icon: '🌙', tag: '多鏢齊發',
      desc: '每次多擲 2 枚迴力鏢，且穿透 +2。',
      stats: { extraProjectiles: 2, pierce: 2 } },
  ],
  railgun: [
    { id: 'apollo',     name: '阿波羅 (烈日聚焦)', icon: '☀️', tag: '高傷慢充',
      desc: '射線傷害 ×1.35，但冷卻 +20%。',
      stats: { damageMul: 1.35, cdMul: 1.2 } },
    { id: 'hermes',     name: '赫米斯 (超導加速)', icon: '💨', tag: '高速連掃',
      desc: '冷卻 -38%、射線傷害 ×0.85，變成高頻掃射。',
      stats: { cdMul: 0.62, damageMul: 0.85 } },
    { id: 'prometheus', name: '普羅米修斯 (焚天)', icon: '🔥', tag: '燃燒射線',
      desc: '命中點燃 8 秒，並額外多掃一道射線。',
      stats: { burnOnHit: 8, laneCount: 1 } },
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
  frost_nova: [
    { id: 'boreas', name: '玻瑞阿斯 (凜冬風暴)', icon: '🌬️', tag: '擴散擊退',
      desc: '脈衝半徑 +35%，並把範圍內的敵人向外吹開。',
      stats: { radiusMul: 1.35, knockback: 9 } },
    { id: 'skadi',  name: '斯卡蒂 (永凍)', icon: '🏔️', tag: '脈衝凍結',
      desc: '每次脈衝都凍結範圍內的雜兵 0.8 秒（Boss 改為減速），但傷害 ×0.8。',
      stats: { freezeDur: 0.8, damageMul: 0.8 } },
    { id: 'hel',    name: '赫爾 (碎冰)', icon: '💀', tag: '碎冰重擊',
      desc: '脈衝傷害 ×0.75，但對已被減速、冰凍或眩暈的敵人傷害 ×1.6。',
      stats: { shatterMul: 1.6, damageMul: 0.75 } },
  ],
  shotgun: [
    { id: 'hermes',     name: '赫米斯 (速射)', icon: '💨', tag: '快速連轟',
      desc: '開火冷卻 -25%，射程 +30%（依反比規則，單發威力會隨之下降）。',
      stats: { cdMul: 0.75, rangeMul: 1.3 } },
    { id: 'hephaestus', name: '赫菲斯托斯 (燃燒彈)', icon: '🔥', tag: '點燃彈丸',
      desc: '彈丸命中點燃（每秒 5 點），扇形收窄 25% 讓彈丸更集中。',
      stats: { burnOnHit: 5, spreadMul: 0.75 } },
    { id: 'ares',       name: '阿瑞斯 (獨頭彈)', icon: '🎯', tag: '單發貫穿',
      desc: '改射一顆獨頭重彈：傷害 = 單顆彈丸 × 2.5，貫穿 3 名敵人。',
      stats: { slugShot: true, slugDamageMul: 2.5, pierce: 3 } },
  ],
};

/**
 * 依「已擁有」與「玩家等級」過濾出可抽的祝福池。
 * 抽出來放在 config.js 是為了能在 Node 直接測（config.js 沒有任何 import）：
 * 有 minLevel 的祝福（例如引力異常 21 級）在門檻前不該出現。
 */
export function blessingPool(ownedIds, playerLevel, pool = BLESSINGS) {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds || []);
  const lv = Number(playerLevel) || 1;
  return pool.filter((b) => !owned.has(b.id) && (!b.minLevel || lv >= b.minLevel));
}

// ── 局內隨機祝福 (Blessings)：里程碑二選一，本局限定的被動效果 ──
// apply(player, game) 在獲得時呼叫一次注入加成，tick(dt, game) 每幀呼叫（需要的話）。
// 部分祝福有 risk 標記（高收益但有代價），UI 會特別標示。
// 風險／報酬原則（玩家要求）：「增傷的祝福，收到的傷害比率要高於增傷的比率」。
//
// 所以每一個會提高輸出的祝福都必須同時宣告兩個欄位：
//   damageRisk —— 承受傷害的倍率。契約要求 **damageRisk ≥ 實測輸出增益 × 1.05**
//
// 增益為什麼不寫在這裡：輸出增益不是一個現成的數字 —— 攻速是 1/cd、暴擊率要乘上
// 暴擊倍率、穿透與範圍取決於場面。手寫第二份估計值一定會跟引擎漂移（第一版就是
// 這樣：宣告 overcharge ×1.13，引擎量到 ×1.33）。所以 tools/verify-gear.mjs
// 直接把祝福套進遊戲物件量測，再用實測值檢查 damageRisk。
// 要調平衡就改這一個欄位，契約會立刻告訴你夠不夠。
//
// 祝福寫進 p.blessing.* 而不是 metaCrit / metaExp 這些「總和」欄位：
// 總和每次升級都會被 applyPassives 重算成「永久層＋局內層」，寫進總和會被歸零。
//
// `damageBoosting: false` 標記「這個祝福不提供輸出增益」，因此不需要 damageRisk。
// 契約會列舉整個池子：每一個祝福都必須是「有 gain 與 risk」或「明確標記不增傷」
// —— 靠欄位有無來判斷的話，之後新增一個增傷祝福忘了寫 risk 就會靜默漏掉。
//
// `risk: true` 只影響卡片樣式（代價祝福／神聖祝福），語意標記請以 damageRisk 為準。
export const BLESSINGS = [
  { id: 'flame_touch',     name: '烈焰之觸',     icon: '🔥', desc: '所有武器範圍 +20%，受傷 +16%', risk: true,
    damageRisk: 1.16,
    apply(p) { p.blessingAreaMul = (p.blessingAreaMul || 1) * 1.20; } },
  { id: 'overcharge',      name: '過載協議',      icon: '⚡', desc: '攻速 +25%，受傷 +45%', risk: true,
    damageRisk: 1.45,
    apply(p) { p.blessingCdrMul = (p.blessingCdrMul || 1) * 0.75; } },
  { id: 'blood_pact',      name: '嗜血契約',      icon: '🩸', desc: '擊殺回血 2，拾取範圍 -25%', risk: true, damageBoosting: false,
    apply(p) { p.blessingKillHeal = (p.blessingKillHeal || 0) + 2; p.blessingMagnetMul = (p.blessingMagnetMul || 1) * 0.75; } },
  { id: 'fortune_gem',     name: '幸運寶鑽',      icon: '💎', desc: '經驗獲得 +50%', damageBoosting: false,
    apply(p) { p.blessing.exp += 0.50; } },
  { id: 'phase_shield',    name: '相位護盾',      icon: '🛡️', desc: '每 25 秒自動觸發 2.5 秒無敵', damageBoosting: false,
    apply(p) { p.blessingShieldCD = 25; p.blessingShieldTimer = 0; p.blessingShieldDur = 2.5; } },
  // minLevel：要玩家等級（局內 LV）達到才會進入祝福池。拾取範圍翻倍在前期就拿到
  // 會讓「撿東西」這件事完全消失，因此排到 21 級之後（Progression.pickBlessingPool 會過濾）。
  { id: 'gravity_well',    name: '引力異常',      icon: '🧲', desc: '拾取範圍翻倍', minLevel: 21, damageBoosting: false,
    apply(p) { p.blessingMagnetMul = (p.blessingMagnetMul || 1) * 2; } },
  { id: 'crit_storm',      name: '暴擊風暴',      icon: '🗡️', desc: '暴擊率 +15%，受傷 +23%', risk: true,
    // 增益要看暴擊倍率：+15% 暴擊率在 critMul = 2 時是 ×(1 + 0.15×1) = 1.15
    damageRisk: 1.23,
    apply(p) { p.blessing.crit += 0.15; } },
  { id: 'golden_age',      name: '黃金時代',      icon: '💰', desc: '金幣掉落率翻倍', damageBoosting: false,
    apply(_, g) { g.metaGoldMul = (g.metaGoldMul || 1) * 2; } },
  { id: 'cooldown_crunch', name: '冷卻壓縮',      icon: '🔄', desc: '所有武器冷卻 -18%，受傷 +30%', risk: true,
    // -18% 冷卻 = 輸出 ×1/0.82 = 1.22
    damageRisk: 1.3,
    apply(p) { p.blessingCdrMul = (p.blessingCdrMul || 1) * 0.82; } },
  { id: 'ghost_step',      name: '幽靈步伐',      icon: '🏃', desc: '閃避冷卻 -40%，距離 +30%', damageBoosting: false,
    apply(p) { p.blessingDashCdr = 0.6; p.blessingDashDist = 1.3; } },
  // 穿透的增益高度取決於場面（對單體幾乎是 0、對整排敵人接近翻倍），
  // 但契約取的是峰值，所以 risk 要壓過峰值 1.60 × 1.05 = 1.68。
  { id: 'armor_pierce',    name: '穿甲之刃',      icon: '⚔️', desc: '所有投射物穿透 +2，受傷 +75%', risk: true,
    damageRisk: 1.75,
    apply(p) { p.bonusPierce = (p.bonusPierce || 0) + 2; } },
  { id: 'tornado_spin',    name: '龍捲共鳴',      icon: '🌪️', desc: '環繞型武器轉速 +50%，受傷 +58%', risk: true,
    damageRisk: 1.58,
    apply(p) { p.blessingSpinMul = (p.blessingSpinMul || 1) * 1.5; } },
  { id: 'executioner',     name: '處刑人',        icon: '💀', desc: '對低血量 (<30%) 敵人傷害 +60%，受傷 +70%', risk: true,
    damageRisk: 1.70,
    apply(p) { p.blessingExecute = true; } },
  { id: 'rainbow_aegis',   name: '虹光護佑',      icon: '🌈', desc: '致死傷害時以 1 HP 存活（每局一次）', damageBoosting: false,
    apply(p) { p.blessingDeathSave = true; } },
  { id: 'berserker',       name: '狂戰士',        icon: '😈', desc: '生命越低傷害越高（30% HP → +60%），受傷 +72%', risk: true,
    damageRisk: 1.72,
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

// ── 炸彈類效果調校（單一真相）──
// 回報：「全面引爆的炸彈威力太大」。三個地方都有「全場清怪」的炸彈：
//   1. 掉落物 BOMB（原本 1.5% 掉落，撿到即全場 9999）
//   2. 特殊卡「軌道核彈」（升級三選一，全場 9999 + 3 秒無敵）
//   3. 里程碑「震撼彈支援」（每 4 次里程碑輪到一次，全場 9999）
// 9999 等於「一鍵抹除」，清場沒有代價、也讓後期難度設計失去意義。現在改成
// 對非 Boss 造成「當前生命比例」傷害（保留清場感，但殘血精英不會被一擊帶走），
// Boss 只吃固定傷害，並把掉落率下修 —— 強力但不無腦。
export const BOMB_TUNING = {
  fieldDamageRatio: 0.6,   // 非 Boss：對當前生命的比例（0.6 = 六成）
  fieldDamageMin: 90,      // 比例傷害的下限，避免前期雜兵血量太低時完全無感
  bossDamage: 180,         // Boss 固定傷害（原 300／600）
  dropChance: 0.010,       // 掉落物 BOMB 的掉落率（原 0.015）
  knockback: 10,           // 擊退距離（原 10／12／5 各自不同，現在一致）
};

// ── 特殊升級卡 (Special Cards)：升級三選一中低機率出現 ──
export const SPECIAL_CARDS = [
  { id: 'nuke_strike',     name: '軌道核彈',     icon: '💣', tag: '特殊',
    desc: '全場敵人重創（非首領 60% 當前生命）+ 3 秒無敵！', color: '#ff0055' },
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
    desc: '延遲 3 秒全場固定 500 傷害（首領減半）', color: '#ff0055' },
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
