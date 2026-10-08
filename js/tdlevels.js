// 守塔模式專屬關卡：固定路線（怪物沿路徑走向核心）＋ 分波、波間休息蓋塔。
//
// 與生存者關卡共用 LEVELS 的欄位（theme / decor / rules …），多了：
//   td: true         —— Spawner 改走波次狀態機（js/systems/TowerDefense.js）
//   paths: [[x,y]…]  —— 每條路線是一串折線點，第一點是入口（貼地圖邊）、最後一點接到核心 (0,0)
//   pathWidth        —— 路寬 (px)；怪物被夾在路內
//   bounds           —— 地圖矩形（v92 起約 2080×1250；鏡頭預設 fit 寬度，比畫面高時靠拖曳或開場導覽平移）
//   socketTarget     —— 選填，開局程序化生成的建塔點數量（覆寫 sockets.length；見 tdprocedural.js）
//   sockets          —— 建塔點：守塔關只能蓋在這裡（點擊開建造選單）。
//                       離入口巢穴 110 以內的已拿掉：出怪點旁邊不能蓋塔（直接堵在洞口太強，也壓住巢穴圖）
//   socketPlan       —— 選填，逐格指定地基加成（順序對應 sockets；八種加成見 js/tdsockets.js）。
//                       載入時展平寫進 sockets[i].bonus / .label 後就刪掉，關卡資料不留第二份真相。
//                       沒填到的格子＝普通建塔點（沒有加成），所以 plan 比 sockets 短是合法的。
//   lair / base      —— 入口巢穴與主堡的貼圖鍵（assets/td/<鍵>.png；載入見 TowerDefense.js 的 TD_STRUCTURE_KEYS）
//   soldier          —— 選填，兵營小兵的貼圖鍵（主題地圖的槍兵；見 AlliedUnit.js 的 tdUnitSprite）
//   barracksArt      —— 選填，兵營建築外觀的前綴（Turret.js 的 TD_IMAGE_KEYS）
//   enemySkins       —— 選填，{ 原怪種: 主題外觀鍵 }，只換外觀（sprites.js 的 TD_ENEMY_SPRITES）
//   waves            —— 手寫波次（見 wave()）：[{ hp, groups: [{ type, count, gap, path? }], boss? }]
//   lives / startGold —— 選填，覆寫命數與開局金幣（預設見 TowerDefense.js 的 TD_LIVES / TD_START_GOLD）
// 座標系：核心在原點；地圖範圍由各關 bounds 決定（不是生存者的 4000×4000）。
// 路線與建塔點由舊版 4000×4000 版圖等比壓縮後，沿路肩每 ~170px 自動排出建塔點再烘進來。
// v92：七關 bounds 一律 ×1.3（地圖真的變大、路線平均長 1.25 倍 → TowerDefense.js 的 TD_SPEED
//      由 0.6 提到 0.75 補償，怪物走完路線的時間與放大前相同），塔位目標數（socketTarget）
//      也一起提高，讓單位面積的佈防密度不變。

import { LEVELS } from './levels.js';
import { SOCKET_BONUSES } from './tdsockets.js';
import { initTDLevelBaselines, randomizeTDLevel } from './tdprocedural.js';

// 手寫波次：wave(血量倍率, [群組…], 首領?, 詞綴?)；群組 = [怪種, 數量, 出怪間隔秒, 入口?]
// 入口省略＝輪流走所有路線；寫數字＝固定走 paths[入口]。
// 血量倍率乘在 TowerDefense 的基礎血量上（基礎 × 關卡 hpScale × 難度 × 這個倍率）。
// 詞綴省略＝普通波。詞綴是字串陣列，可疊加，定義與數值見 js/tdwaves.js：
//   swift 疾行／armored 重甲縱隊／swarm 蟲潮／aerial 空襲／elite 精英／fortified 要塞
//   掛了詞綴的波，下一波預告會亮出標籤，來襲提示也會寫出來。
// 設計原則：每關先教一種護甲，再逼你混搭 ——
//   輕甲（喪屍／獵犬）→ 守衛塔；重甲（巨漢／盾衛／巨像）→ 加農砲、秘法塔；空中（蝙蝠／孢子）→ 守衛塔、飛彈塔、秘法塔
//   （護甲倍率見 js/tdtowers.js 的 ARMOR_MUL，怪種護甲見 TowerDefense.js 的 ARMOR_CLASS）
// 詞綴的排法：前期關卡只在第 3 波之後零星掛，後期關卡變成常態，而且刻意掛在
// 「這一波原本的弱點」上（例如全重甲的波掛 swift，逼你不只要穿甲還要補射程）。
const wave = (hp, groups, boss = null, mods = []) => ({
  hp,
  groups: groups.map(([type, count, gap, path]) => ({ type, count, gap, path })),
  boss,
  mods,
});

const base = (id) => LEVELS[id];

export const TD_LEVELS = {
  td_canyon: {
    ...base('storm'),
    id: 'td_canyon',
    lair: 'lair_canyon',   // 入口巢穴貼圖（assets/td/，tools/cut_td_structures.py）
    base: 'base_keep',
    name: '峽谷隘口',
    sub: '守塔 ‧ 單線',
    icon: '🏜️',
    desc: '一條蜿蜒的峽谷路線直通基地。在彎道兩側佈防，讓怪物在長長的路上被火網消耗。',
    difficulty: 1,
    dnaMult: 1.2,
    next: 'td_fork',
    td: true,
    pathWidth: 95,
    socketTarget: 16,
    bounds: { minX: -1145, maxX: 935, minY: -1080, maxY: 170 },
    breakTime: 14,
    paths: [
      [[0, -960], [-80, -780], [-680, -780], [-820, -560], [-640, -340], [-160, -340], [380, -340], [680, -260], [680, -120], [160, -120], [0, 0]],
    ],
    waves: [
      wave(1.0, [['walker', 10, 0.9]]),
      wave(1.1, [['walker', 12, 0.8], ['runner', 5, 0.7]]),
      wave(1.2, [['runner', 10, 0.6], ['hound', 6, 0.5]], null, ['swift']),   // 快速輕甲：守衛塔（疾行：更考驗射程）
      wave(1.3, [['walker', 12, 0.6], ['brute', 4, 1.4]]),                        // 第一次重甲：加農砲／秘法塔
      wave(1.4, [['bat', 12, 0.35], ['walker', 10, 0.6]]),                        // 第一次空中：加農砲、兵營沒用
      wave(1.6, [['brute', 6, 1.1], ['spitter', 4, 1.0], ['runner', 10, 0.5]]),
      wave(1.8, [['hound', 12, 0.4], ['bat', 10, 0.4], ['brute', 5, 1.2]], null, ['swarm']),   // 蟲潮：考驗清場速度
      wave(2.0, [['walker', 16, 0.5], ['warden', 4, 1.5], ['bat', 8, 0.4]],
        { hp: 7000, name: '峽谷掠奪者', speed: 60, damage: 30, moveStyle: 'rush', behaviors: ['summon', 'barrage'], skin: 'boss_storm' }),
    ],
    rules: { label: '守塔規則', desc: '怪物沿路線進攻核心；波間休息可蓋塔，提前開戰拿金幣' },
    sockets: [
      { id: 'c1', x: 599, y: -201 },
      { id: 'c2', x: -685, y: -568 },
      { id: 'c3', x: -154, y: -893 },
      { id: 'c4', x: -615, y: -662 },
      { id: 'c5', x: -582, y: -462 },
      { id: 'c6', x: 203, y: 8 },
      { id: 'c7', x: 362, y: -206 },
      { id: 'c8', x: 98, y: -178 },
      { id: 'c9', x: -423, y: -869 },
      { id: 'c10', x: -251, y: -697 },
      { id: 'c11', x: -637, y: -871 },
      { id: 'c12', x: -378, y: -251 },
      { id: 'c13', x: -596, y: -248 },
      { id: 'c14', x: -870, y: -643 },
      { id: 'c15', x: -378, y: -431 },
      { id: 'c16', x: -841, y: -438 },
    ],
    socketPlan: ['range', 'damage', 'haste', 'pierce', 'veteran', 'bank', 'damage', 'haste', 'range', 'range', 'pierce', 'command', 'damage', 'armor', 'armor', 'command'],
    mechs: [],
    bosses: [],
    hpScale: 1.0,
  },

  td_fork: {
    ...base('swamp'),
    id: 'td_fork',
    lair: 'lair_swamp',   // 入口巢穴貼圖（assets/td/，tools/cut_td_structures.py）
    base: 'base_keep',
    startGold: 320,   // 兩個入口：開局要能兩邊各蓋一座
    name: '雙叉河道',
    sub: '守塔 ‧ 雙線',
    icon: '🌿',
    desc: '東西兩條河道在基地前匯流。兩邊都要顧，還是集中火力守在匯流口？',
    difficulty: 2,
    dnaMult: 1.6,
    next: 'td_fortress',
    td: true,
    pathWidth: 90,
    socketTarget: 20,
    bounds: { minX: -1040, maxX: 1040, minY: -740, maxY: 530 },   // 上緣多留 95：東門巢穴（約 133 高）才不會凸出地圖
    breakTime: 13,
    paths: [
      [[-850, -420], [-560, -420], [-560, 240], [-240, 240], [-240, 0], [0, 0]],
      [[850, -520], [540, -520], [540, 160], [240, 160], [240, 0], [0, 0]],
    ],
    waves: [
      wave(1.0, [['walker', 8, 0.9, 0], ['walker', 8, 0.9, 1]]),
      wave(1.1, [['runner', 8, 0.7, 0], ['hound', 6, 0.6, 1]]),
      wave(1.2, [['bat', 10, 0.4], ['walker', 12, 0.6]]),
      wave(1.3, [['brute', 4, 1.3, 0], ['runner', 12, 0.5, 1]], null, ['armored']),   // 西邊重甲、東邊輕甲：兩邊要蓋不同的塔（重甲縱隊：東邊也得穿甲）
      wave(1.4, [['walker', 14, 0.5, 0], ['medic', 3, 1.4, 0], ['warden', 3, 1.6, 1]]),
      wave(1.55, [['bat', 14, 0.35], ['bloater', 6, 0.9]], null, ['aerial']),
      wave(1.7, [['brute', 6, 1.1, 0], ['brute', 6, 1.1, 1]], null, ['fortified']),
      wave(1.85, [['hound', 14, 0.4, 0], ['spitter', 6, 0.9, 1], ['blinker', 10, 0.5, 1]]),
      wave(2.0, [['warden', 5, 1.3], ['bat', 14, 0.35], ['runner', 14, 0.45]], null, ['elite']),
      wave(2.2, [['walker', 20, 0.4], ['brute', 6, 1.0], ['bat', 10, 0.4]],
        { hp: 16000, name: '沼澤雙頭蛇', speed: 64, damage: 34, moveStyle: 'serpentine', behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_swamp' }),
    ],
    rules: { label: '守塔規則', desc: '兩條路線同時進攻；波間休息可蓋塔，提前開戰拿金幣' },
    sockets: [
      { id: 'f1', x: -639, y: -341 },
      { id: 'f2', x: 161, y: 79 },
      { id: 'f3', x: 319, y: 81 },
      { id: 'f4', x: -481, y: 161 },
      { id: 'f5', x: -319, y: 161 },
      { id: 'f6', x: 461, y: 81 },
      { id: 'f7', x: -161, y: 79 },
      { id: 'f8', x: 619, y: -441 },
      { id: 'f9', x: -135, y: -81 },
      { id: 'f10', x: 185, y: -81 },
      { id: 'f11', x: -478, y: -112 },
      { id: 'f12', x: 457, y: -384 },
      { id: 'f13', x: 449, y: -21 },
      { id: 'f14', x: -642, y: 152 },
      { id: 'f15', x: -514, y: 321 },
      { id: 'f16', x: -469, y: -332 },
      { id: 'f17', x: 497, y: 248 },
      { id: 'f18', x: 629, y: -609 },
      { id: 'f19', x: 449, y: -248 },
      { id: 'f20', x: 625, y: -112 },
    ],
    socketPlan: ['pierce', 'damage', 'haste', 'range', 'damage', 'pierce', 'range', 'haste', 'damage', 'pierce', 'haste', 'range', 'command', 'command', 'bank', 'bank', 'veteran', 'veteran', 'armor', 'armor'],
    mechs: [],
    bosses: [],
    hpScale: 1.3,
  },

  td_fortress: {
    ...base('frostvoid'),
    id: 'td_fortress',
    lair: 'lair_void',   // 入口巢穴貼圖（assets/td/，tools/cut_td_structures.py）
    base: 'base_keep',
    startGold: 420,   // 三個入口
    name: '三門要塞',
    sub: '守塔 ‧ 三線',
    icon: '🏰',
    desc: '北、西南、東南三道城門同時被攻破。砲塔數量有限，看清每一波從哪裡來。',
    difficulty: 3,
    dnaMult: 2.0,
    next: 'td_forgeworld',
    td: true,
    pathWidth: 85,
    socketTarget: 16,
    bounds: { minX: -1040, maxX: 1040, minY: -850, maxY: 710 },
    breakTime: 12,
    paths: [
      [[0, -750], [0, -460], [-260, -460], [-260, -200], [0, -200], [0, 0]],
      [[-850, 480], [-520, 480], [-520, 240], [-220, 240], [-220, 90], [0, 0]],
      [[850, 480], [520, 480], [520, 280], [220, 280], [220, 90], [0, 0]],
    ],
    waves: [
      wave(1.0, [['walker', 6, 0.9, 0], ['walker', 6, 0.9, 1], ['walker', 6, 0.9, 2]]),
      wave(1.1, [['runner', 8, 0.6, 0], ['hound', 6, 0.6, 1], ['hound', 6, 0.6, 2]]),
      wave(1.2, [['brute', 3, 1.4, 1], ['brute', 3, 1.4, 2], ['walker', 10, 0.6, 0]]),
      wave(1.3, [['bat', 16, 0.3], ['blinker', 8, 0.6, 0]], null, ['swift']),
      wave(1.45, [['warden', 3, 1.6, 0], ['medic', 4, 1.2, 1], ['runner', 12, 0.5, 2]]),
      wave(1.6, [['mortar', 4, 1.6], ['brute', 6, 1.0], ['walker', 12, 0.5]]),
      wave(1.75, [['hound', 18, 0.35], ['bat', 12, 0.35]], null, ['swarm']),
      wave(1.9, [['chimera', 2, 3.0, 0], ['spitter', 6, 0.9, 1], ['spitter', 6, 0.9, 2]]),   // 攻城巨像：最重的重甲
      wave(2.05, [['bloater', 8, 0.8], ['blinker', 12, 0.45], ['brute', 6, 1.0]]),
      wave(2.2, [['warden', 6, 1.2], ['bat', 18, 0.3], ['runner', 16, 0.4]], null, ['elite']),
      wave(2.4, [['chimera', 3, 2.5], ['mortar', 5, 1.4], ['hound', 16, 0.35]], null, ['armored']),
      wave(2.4, [['brute', 9, 0.9], ['bat', 16, 0.3], ['walker', 24, 0.35], ['chimera', 2, 3.0]],
        { hp: 24000, name: '要塞攻城巨像', speed: 56, damage: 40, moveStyle: 'leap', behaviors: ['summon', 'nova', 'barrage', 'ground'], skin: 'boss_frostvoid' }),
    ],
    rules: { label: '守塔規則', desc: '三條路線輪番進攻；波間休息可蓋塔，提前開戰拿金幣' },
    sockets: [
      { id: 'ft1', x: -183, y: -383 },
      { id: 'ft2', x: -183, y: -276 },
      { id: 'ft3', x: -596, y: 404 },
      { id: 'ft4', x: 597, y: 404 },
      { id: 'ft5', x: 444, y: 357 },
      { id: 'ft6', x: -443, y: 317 },
      { id: 'ft7', x: -76, y: -124 },
      { id: 'ft8', x: -76, y: -536 },
      { id: 'ft9', x: -296, y: 164 },
      { id: 'ft10', x: 297, y: 204 },
      { id: 'ft11', x: 108, y: 165 },
      { id: 'ft12', x: -108, y: 165 },
      { id: 'ft13', x: -201, y: -3 },
      { id: 'ft14', x: 155, y: -22 },
      { id: 'ft15', x: 79, y: -135 },
      { id: 'ft16', x: -349, y: 322 },
    ],
    socketPlan: ['command', 'damage', 'pierce', 'range', 'haste', 'bank', 'veteran', 'damage', 'pierce', 'range', 'haste', 'command', 'damage', 'veteran', 'armor', 'armor'],
    mechs: [],
    bosses: [],
    hpScale: 1.6,
  },

  td_forgeworld: {
    ...base('lab'),
    id: 'td_forgeworld',
    lair: 'lair_hive',   // 入口巢穴貼圖（assets/td/，tools/cut_td_structures.py）
    base: 'base_reactor',
    startGold: 450,   // 終極關：開場就是快速蟲群
    name: '鑄造世界 ‧ 卡迪亞防線',
    sub: '守塔 ‧ 終極決戰',
    icon: '⚙️',
    desc: '歐姆尼賽亞的泰坦巨型反應爐遭受泰倫蟲群與歐克獸人聯手狂暴圍攻！指揮星界軍步兵營與黎曼魯斯坦克守衛核心。',
    difficulty: 4,
    dnaMult: 2.8,
    next: 'td_redalert',
    td: true,
    pathWidth: 95,
    socketTarget: 19,
    bounds: { minX: -1040, maxX: 1040, minY: -1175, maxY: 170 },   // 上緣多留 100：兩座蟲巢（約 140 高）才不會凸出地圖
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
      [[-850, -820], [-520, -820], [-520, -400], [-220, -400], [-220, -100], [0, 0]],
      [[850, -820], [520, -820], [520, -400], [220, -400], [220, -100], [0, 0]],
    ],
    waves: [
      wave(0.6, [['hormagaunt', 8, 0.9]]),
      wave(0.7, [['ork_boy', 4, 1.4, 0], ['hormagaunt', 10, 0.6, 1]]),            // 歐克小子是重甲
      wave(0.85, [['spore_mine', 8, 0.7], ['termagant', 6, 0.9]], null, ['aerial']),   // 孢子囊會飛（空襲）
      wave(1.0, [['hormagaunt', 12, 0.5], ['ork_boy', 4, 1.3]],
        { hp: 4500, name: '歐克戰爭頭目', speed: 64, damage: 38, moveStyle: 'leap', behaviors: ['summon', 'barrage', 'ground'], skin: 'boss_nob' }),
      wave(1.25, [['genestealer', 8, 0.7], ['squig_bomb', 8, 0.5]]),
      wave(1.4, [['poxwalker', 10, 0.8, 0], ['ork_boy', 6, 1.1, 1]], null, ['fortified']),
      wave(1.55, [['spore_mine', 12, 0.5], ['hormagaunt', 18, 0.35]]),
      wave(1.7, [['termagant', 10, 0.7], ['genestealer', 10, 0.55], ['ork_boy', 5, 1.2]],
        { hp: 11000, name: '蟲群基因原體', speed: 78, damage: 45, moveStyle: 'blink', behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_broodlord' }),
      wave(1.85, [['squig_bomb', 14, 0.35], ['poxwalker', 12, 0.6]], null, ['swarm']),
      wave(2.0, [['ork_boy', 10, 0.9], ['spore_mine', 14, 0.45]]),
      wave(2.2, [['genestealer', 16, 0.4], ['termagant', 12, 0.6], ['hormagaunt', 20, 0.3]], null, ['elite']),
      wave(2.4, [['ork_boy', 12, 0.8], ['poxwalker', 14, 0.5], ['spore_mine', 12, 0.4]], null, ['armored'],
        { hp: 24000, name: '泰倫劊子手暴君', speed: 52, damage: 60, moveStyle: 'leap', behaviors: ['summon', 'nova', 'barrage', 'ground'], skin: 'boss_carnifex' }),
    ],
    rules: { label: '卡迪亞死守令', desc: '兩條主要戰線遭受蟲群與綠皮猛烈衝擊；佈署星界軍兵營與機械製造廠構築阻絕陣線' },
    sockets: [
      { id: 'fw1', x: -601, y: -738 },
      { id: 'fw2', x: -438, y: -481 },
      { id: 'fw3', x: 439, y: -481 },
      { id: 'fw4', x: -301, y: -318 },
      { id: 'fw5', x: 602, y: -738 },
      { id: 'fw6', x: 302, y: -318 },
      { id: 'fw7', x: -106, y: -173 },
      { id: 'fw8', x: 106, y: -173 },
      { id: 'fw9', x: 203, y: -1 },
      { id: 'fw10', x: -157, y: 20 },
      { id: 'fw11', x: -133, y: -357 },
      { id: 'fw12', x: -433, y: -652 },
      { id: 'fw13', x: -477, y: -316 },
      { id: 'fw14', x: -604, y: -442 },
      { id: 'fw15', x: -263, y: -492 },
      { id: 'fw16', x: -431, y: -778 },
      { id: 'fw17', x: -685, y: -906 },
      { id: 'fw18', x: 437, y: -736 },
      { id: 'fw19', x: 134, y: -314 },
    ],
    socketPlan: ['pierce', 'pierce', 'damage', 'haste', 'command', 'veteran', 'range', 'pierce', 'pierce', 'damage', 'haste', 'command', 'veteran', 'range', 'bank', 'bank', 'armor', 'armor', 'pierce'],
    mechs: [],
    bosses: [],
    hpScale: 1.8,
  },
  // ── 紅色警戒主題：蘇聯寒冬前線（兩路長蛇形；攻擊犬、坦克、空艇）──
  // 地面貼圖：assets/ground/ground_td_redalert.png（tools/make_ground_tile.py 轉成 1024 無縫）
  td_redalert: {
    ...base('frost'),
    id: 'td_redalert',
    lair: 'lair_redalert',
    base: 'base_redalert',   // 盟軍建造廠
    soldier: 'unit_gi',   // 兵營派盟軍大兵（槍兵）
    barracksArt: 'barracks_redalert',   // 兵營 5 個階段的外觀（assets/td/barracks_redalert_*.png）
    // 只換外觀（數值、護甲照原怪種）：徵召兵、攻擊犬、犀牛坦克、天啟坦克、武裝直升機
    enemySkins: {
      walker: 'ra_conscript', runner: 'ra_conscript', sniper: 'ra_conscript', hound: 'ra_dog',
      brute: 'ra_rhino', warden: 'ra_rhino', mortar: 'ra_rhino', chimera: 'ra_apocalypse', bat: 'ra_helicopter',
    },
    name: '紅色警戒 ‧ 寒冬前線',
    sub: '守塔 ‧ 蘇聯裝甲',
    icon: '☭',
    desc: '蘇聯裝甲師越過凍原！徵召兵與攻擊犬打頭陣，犀牛坦克、V3 火箭與基洛夫空艇隨後壓境。',
    difficulty: 5,
    dnaMult: 3.2,
    next: 'td_starcraft',
    td: true,
    startGold: 450,
    pathWidth: 90,
    socketTarget: 18,
    bounds: { minX: -1040, maxX: 1040, minY: -860, maxY: 310 },
    breakTime: 13,
    paths: [
      [[-850, -520], [-640, -520], [-640, -100], [-400, -100], [-400, -440], [-180, -440], [-180, -40], [0, 0]],
      [[520, -720], [520, -480], [740, -480], [740, -150], [300, -150], [300, -20], [0, 0]],
    ],
    waves: [
      wave(1.0, [['walker', 8, 0.9, 0], ['walker', 8, 0.9, 1]]),                       // 徵召兵
      wave(1.1, [['runner', 10, 0.6], ['hound', 6, 0.55, 1]]),
      wave(1.2, [['hound', 14, 0.4]]),                                                 // 攻擊犬：快速輕甲
      wave(1.3, [['brute', 4, 1.3, 0], ['brute', 4, 1.3, 1], ['walker', 10, 0.6]], null, ['armored']),    // 犀牛坦克：重甲（重甲縱隊）
      wave(1.4, [['bat', 10, 0.4], ['runner', 10, 0.55]]),                             // 空中部隊
      wave(1.55, [['mortar', 4, 1.5], ['warden', 4, 1.4], ['walker', 14, 0.5]]),
      wave(1.7, [['chimera', 2, 3.0, 0], ['hound', 14, 0.4, 1]], null, ['swift']),
      wave(1.85, [['bat', 12, 0.35], ['brute', 6, 1.0]],
        { hp: 6000, name: '天啟坦克', speed: 46, damage: 50, moveStyle: 'rush', behaviors: ['barrage', 'ground'], skin: 'boss_frost' }),
      wave(2.0, [['warden', 6, 1.2], ['sniper', 6, 1.0], ['runner', 16, 0.4]], null, ['elite']),
      wave(2.2, [['chimera', 3, 2.5], ['bat', 16, 0.32], ['hound', 16, 0.35]], null, ['aerial']),
      wave(2.35, [['brute', 10, 0.8], ['mortar', 6, 1.2], ['walker', 24, 0.35]]),
      wave(2.5, [['chimera', 4, 2.2], ['bat', 18, 0.3], ['warden', 6, 1.2]], null, ['fortified'],
        { hp: 20000, name: '蘇聯天啟巨坦', speed: 42, damage: 60, moveStyle: 'rush', behaviors: ['barrage', 'ground', 'nova'], skin: 'boss_frost' }),
    ],
    rules: { label: '守塔規則', desc: '兩路裝甲縱隊同時推進；坦克是重甲、空艇與蝙蝠會飛' },
    sockets: [
      { id: 're1', x: -561, y: -179 },
      { id: 're2', x: 599, y: -559 },
      { id: 're3', x: 661, y: -229 },
      { id: 're4', x: -321, y: -361 },
      { id: 're5', x: 379, y: -71 },
      { id: 're6', x: 661, y: -401 },
      { id: 're7', x: 216, y: -99 },
      { id: 're8', x: -82, y: -119 },
      { id: 're9', x: -149, y: 50 },
      { id: 're10', x: 190, y: 69 },
      { id: 're11', x: -552, y: -352 },
      { id: 're12', x: -224, y: -521 },
      { id: 're13', x: 436, y: -560 },
      { id: 're14', x: -95, y: -351 },
      { id: 're15', x: -520, y: -18 },
      { id: 're16', x: 828, y: -191 },
      { id: 're17', x: -267, y: -84 },
      { id: 're18', x: 92, y: 82 },
    ],
    socketPlan: ['bank', 'bank', 'haste', 'damage', 'range', 'command', 'pierce', 'veteran', 'haste', 'pierce', 'damage', 'range', 'bank', 'command', 'veteran', 'armor', 'armor', 'damage'],
    mechs: [],
    bosses: [],
    hpScale: 1.4,
  },

  // ── 星海爭霸主題：查爾星灰燼平台（超長 S 形主路＋右側短突襲路；空中單位多）──
  // 地面貼圖：assets/ground/ground_td_starcraft.png（tools/make_ground_tile.py 轉成 1024 無縫）
  td_starcraft: {
    ...base('core'),
    id: 'td_starcraft',
    lair: 'lair_starcraft',
    base: 'base_starcraft',
    soldier: 'unit_marine',   // 兵營派陸戰隊（槍兵）
    barracksArt: 'barracks_starcraft',   // 兵營 5 個階段的外觀（assets/td/barracks_starcraft_*.png）
    // 只換外觀：跳蟲、刺蛇、異龍、王蟲、雷獸
    enemySkins: {
      hormagaunt: 'sc_zergling', genestealer: 'sc_zergling', termagant: 'sc_hydralisk', sniper: 'sc_hydralisk',
      bat: 'sc_mutalisk', spore_mine: 'sc_overlord', chimera: 'sc_ultralisk',
    },
    name: '星海爭霸 ‧ 查爾灰燼',
    sub: '守塔 ‧ 異蟲狂潮',
    icon: '🛰️',
    desc: '異蟲從查爾星的熔岩裂谷湧出！跳蟲成群、異龍從天而降，雷獸撞開防線。長路要佈滿火力，右側的短路更要提防。',
    difficulty: 6,
    dnaMult: 3.6,
    next: 'td_warcraft',
    td: true,
    startGold: 480,
    pathWidth: 88,
    socketTarget: 22,
    bounds: { minX: -1040, maxX: 1040, minY: -860, maxY: 310 },
    breakTime: 13,
    paths: [
      [[640, -720], [640, -520], [-580, -520], [-580, -300], [460, -300], [460, -120], [0, -120], [0, 0]],
      [[850, 140], [260, 140], [260, 0], [0, 0]],
    ],
    waves: [
      wave(0.9, [['hormagaunt', 10, 0.7, 0]]),                                          // 跳蟲
      wave(1.0, [['hormagaunt', 12, 0.6, 0], ['termagant', 4, 1.0, 1]]),
      wave(1.1, [['bat', 12, 0.4]], null, ['aerial']),                                    // 異龍：空中（空襲）
      wave(1.2, [['genestealer', 8, 0.7, 0], ['hormagaunt', 10, 0.5, 1]]),
      wave(1.35, [['spore_mine', 10, 0.6], ['hormagaunt', 16, 0.4]], null, ['swarm']),
      wave(1.5, [['chimera', 2, 3.0, 0], ['termagant', 8, 0.8, 1]]),                    // 雷獸：重甲
      wave(1.65, [['bat', 12, 0.36], ['genestealer', 10, 0.55]], null, ['swift'],
        { hp: 5000, name: '異蟲刀鋒宿主', speed: 56, damage: 50, moveStyle: 'orbit', behaviors: ['summon', 'nova', 'barrage'], skin: 'boss_broodlord' }),
      wave(1.8, [['sniper', 6, 1.0, 1], ['hormagaunt', 20, 0.35, 0]], null, ['elite']),
      wave(1.95, [['spore_mine', 14, 0.45], ['bat', 14, 0.35], ['genestealer', 10, 0.5]]),
      wave(2.1, [['chimera', 3, 2.5], ['termagant', 12, 0.6]], null, ['armored']),
      wave(2.3, [['hormagaunt', 28, 0.28], ['bat', 18, 0.3], ['genestealer', 12, 0.45]], null, ['swarm']),
      wave(2.2, [['chimera', 2, 2.5], ['spore_mine', 8, 0.5], ['hormagaunt', 20, 0.32]],
        { hp: 10000, name: '原生異蟲 ‧ 雷獸之王', speed: 44, damage: 62, moveStyle: 'rush', behaviors: ['summon', 'nova', 'barrage', 'ground'], skin: 'boss_carnifex' }),
    ],
    rules: { label: '守塔規則', desc: '長路與短路同時來；異龍與孢子囊會飛，記得蓋對空塔' },
    sockets: [
      { id: 'st1', x: -502, y: -442 },
      { id: 'st2', x: 182, y: 78 },
      { id: 'st3', x: 382, y: -198 },
      { id: 'st4', x: 338, y: 62 },
      { id: 'st5', x: -80, y: -185 },
      { id: 'st6', x: 234, y: -211 },
      { id: 'st7', x: -128, y: -382 },
      { id: 'st8', x: 53, y: -431 },
      { id: 'st9', x: -219, y: -606 },
      { id: 'st10', x: 188, y: -436 },
      { id: 'st11', x: -264, y: -436 },
      { id: 'st12', x: -535, y: -216 },
      { id: 'st13', x: 7, y: -609 },
      { id: 'st14', x: -173, y: -220 },
      { id: 'st15', x: 98, y: -221 },
      { id: 'st16', x: 578, y: 229 },
      { id: 'st17', x: 305, y: 227 },
      { id: 'st18', x: 532, y: 54 },
      { id: 'st19', x: 324, y: -435 },
      { id: 'st20', x: -668, y: -388 },
      { id: 'st21', x: -444, y: -606 },
      { id: 'st22', x: 549, y: -210 },
    ],
    socketPlan: ['range', 'range', 'haste', 'damage', 'command', 'bank', 'pierce', 'veteran', 'damage', 'haste', 'range', 'armor', 'command', 'pierce', 'range', 'haste', 'bank', 'damage', 'veteran', 'range', 'armor', 'command'],
    mechs: [],
    bosses: [],
    hpScale: 1.5,
  },

  // ── 魔獸爭霸主題：洛丹倫天譴之地（三路：西、北、東；食屍鬼、石像鬼、憎惡）──
  // 地面貼圖：assets/ground/ground_td_warcraft.png（tools/make_ground_tile.py 轉成 1024 無縫）
  td_warcraft: {
    ...base('makaimura'),
    id: 'td_warcraft',
    lair: 'lair_warcraft',
    base: 'base_keep',
    name: '魔獸爭霸 ‧ 洛丹倫天譴',
    sub: '守塔 ‧ 天譴軍團',
    icon: '⚔️',
    desc: '天譴軍團的瘟疫吞沒了洛丹倫！食屍鬼、石像鬼與憎惡從三個方向湧向人類王城，守住最後的城堡。',
    difficulty: 7,
    dnaMult: 4.0,
    next: null,
    td: true,
    startGold: 520,
    pathWidth: 85,
    socketTarget: 19,
    bounds: { minX: -1040, maxX: 1040, minY: -860, maxY: 310 },
    breakTime: 13,
    paths: [
      [[-850, -220], [-580, -220], [-580, 140], [-260, 140], [-260, 0], [0, 0]],
      [[-140, -720], [-140, -500], [180, -500], [180, -240], [0, -240], [0, 0]],
      [[850, -420], [540, -420], [540, 80], [240, 80], [240, 0], [0, 0]],
    ],
    waves: [
      wave(1.0, [['makai_zombie', 6, 0.9, 0], ['makai_zombie', 6, 0.9, 1], ['makai_zombie', 6, 0.9, 2]]),   // 食屍鬼
      wave(1.1, [['makai_zombie', 10, 0.6], ['hound', 8, 0.5]]),
      wave(1.2, [['makai_red_arremer', 12, 0.4]], null, ['aerial']),                                      // 石像鬼：空中（空襲）
      wave(1.3, [['makai_woody', 4, 1.5, 1], ['makai_zombie', 12, 0.5, 0], ['medic', 3, 1.3, 2]]),
      wave(1.45, [['brute', 4, 1.3, 0], ['brute', 4, 1.3, 2], ['makai_red_arremer', 10, 0.45, 1]], null, ['armored']),   // 憎惡：重甲（重甲縱隊）
      wave(1.6, [['spitter', 6, 0.9], ['makai_zombie', 18, 0.4]],
        { hp: 7000, name: '恐懼魔王 ‧ 瑪爾加尼斯', speed: 54, damage: 50, moveStyle: 'blink', behaviors: ['summon', 'nova'], skin: 'boss_arremer_king' }),
      wave(1.75, [['makai_red_arremer', 16, 0.32], ['blinker', 12, 0.45]], null, ['swift']),
      wave(1.9, [['makai_woody', 8, 1.0], ['warden', 5, 1.3], ['makai_zombie', 20, 0.35]]),
      wave(2.05, [['brute', 8, 0.9], ['medic', 6, 1.0], ['makai_red_arremer', 14, 0.35]], null, ['elite']),
      wave(2.2, [['chimera', 2, 3.0, 1], ['makai_woody', 8, 0.9], ['hound', 18, 0.35]], null, ['fortified']),
      wave(2.4, [['makai_zombie', 30, 0.28], ['makai_red_arremer', 18, 0.3], ['brute', 8, 0.9]], null, ['swarm']),
      wave(2.5, [['makai_woody', 8, 0.9], ['chimera', 2, 2.8], ['makai_red_arremer', 14, 0.35]],
        { hp: 14000, name: '巫妖王 ‧ 寒冰王座', speed: 50, damage: 62, moveStyle: 'blink', behaviors: ['nova', 'barrage', 'summon', 'vortex'], skin: 'boss_astaroth' }),
    ],
    rules: { label: '守塔規則', desc: '三路同時進攻；石像鬼會飛、憎惡與枯木妖靈是重甲' },
    sockets: [
      { id: 'wa1', x: -336, y: 64 },
      { id: 'wa2', x: 164, y: 76 },
      { id: 'wa3', x: 617, y: -343 },
      { id: 'wa4', x: -183, y: 76 },
      { id: 'wa5', x: -503, y: 64 },
      { id: 'wa6', x: 76, y: -163 },
      { id: 'wa7', x: 317, y: 4 },
      { id: 'wa8', x: -656, y: -143 },
      { id: 'wa9', x: -64, y: -576 },
      { id: 'wa10', x: 104, y: -316 },
      { id: 'wa11', x: 104, y: -423 },
      { id: 'wa12', x: 464, y: 4 },
      { id: 'wa13', x: 185, y: -78 },
      { id: 'wa14', x: -185, y: -78 },
      { id: 'wa15', x: -78, y: -185 },
      { id: 'wa16', x: -666, y: 5 },
      { id: 'wa17', x: 629, y: -507 },
      { id: 'wa18', x: 620, y: -102 },
      { id: 'wa19', x: -87, y: -79 },
    ],
    socketPlan: ['command', 'command', 'damage', 'pierce', 'veteran', 'bank', 'haste', 'range', 'veteran', 'damage', 'pierce', 'haste', 'range', 'damage', 'command', 'armor', 'armor', 'bank', 'veteran'],
    mechs: [],
    bosses: [],
    hpScale: 1.6,
  },
};

// 地基加成展平：socketPlan 只是「逐格意圖」的書寫形式，載入時寫進 sockets[i].bonus / .label。
// 讀取端（Turret.js 蓋塔、Facilities.js 護甲相剋與光環、UI.js 徽章、TowerDefense.draw 的六角底座）
// 一律只看 socket.bonus，不需要知道 plan 的存在；寫完就刪，避免同一份資料有兩個來源。
for (const level of Object.values(TD_LEVELS)) {
  if (level.socketPlan) {
    level.sockets.forEach((s, i) => {
      const key = level.socketPlan[i];
      const def = Object.prototype.hasOwnProperty.call(SOCKET_BONUSES, key) ? SOCKET_BONUSES[key] : null;
      if (!def) return;   // plan 比 sockets 短（或打錯字）＝這一格維持普通建塔點
      s.bonus = key;
      s.label = def.label;
    });
    delete level.socketPlan;
  }
  // 初始化程序化生成基準（預設備份路線、固定建塔數量、加成池）
  initTDLevelBaselines(level);
}

export { randomizeTDLevel };

export const TD_ORDER = ['td_canyon', 'td_fork', 'td_fortress', 'td_forgeworld', 'td_redalert', 'td_starcraft', 'td_warcraft'];

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
