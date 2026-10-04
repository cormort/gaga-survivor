// 守塔關卡的波次與路線（只在 level.td 的關卡啟用；生存者模式完全不經過這裡）。
//
// 流程：休息（可蓋塔）→ 出波（怪從入口沿路線走）→ 該波清空 → 發波次獎金 → 下一段休息…
// 最後一波附帶終極首領，擊敗即過關（沿用主迴圈既有的 isFinal 通關判定）；
// 首領漏過去但命數還在，最後一波清空時同樣過關。
// 休息中按「提前開戰」(N) 立刻出下一波，剩餘秒數換成金幣。
//
// 與生存者刻意不同的規則（經典守塔）：
//   - 命數制：怪走到核心＝漏怪，扣 LEAK 條命後消失（main.js 核心區塊），不再貼著核心啃血
//   - 擊殺直接入帳 bounty()，不掉經驗寶石／金幣，所以也沒有升級卡
//   - 怪的血量只看波數（TD_HP / TD_HP_GROWTH），不吃生存者時間曲線與動態難度
//   - 難度（js/levels.js DIFFICULTIES）是「守塔自己那一份」（v91，見 save.js DIFF_KEYS）：
//     血量／首領血量／玩家受傷／移速／金幣沿用原本的套用點，密度與菁英機率由這裡接上
//     （密度＝壓縮波次間隔、每波總數不變；菁英＝逐怪擲 js/config.js 的 ELITE_AFFIXES 詞綴）

import { Enemy } from '../entities/Enemy.js';
import { enemyScale } from '../levels.js';
import { projectToSegment } from '../tdlevels.js';
import { randomizeTDLevel } from '../tdprocedural.js';
import { sound } from '../audio.js';
import { heroLevelUp, drawHeroTarget } from './TDHero.js';
import { WAVE_MODS, waveModMul, AIR_FILLER } from '../tdwaves.js';
import { KINGDOM_UPGRADES, kingdomValue, kingdomNextCost, kingdomTrack } from '../tdkingdom.js';
import { applyTDStats } from '../tdtowers.js';
import { TD_CHAR_SCALE, rollEliteAffix } from '../config.js';

const WAVE_BONUS = (w) => 60 + w * 15;   // 清完第 w 波的獎金
const EARLY_GOLD_PER_SEC = 4;            // 提前開戰：每剩 1 秒休息 +4 金幣
const GROUP_STAGGER = 2.5;               // 同一波裡各群的起跑間隔 (秒)
const WAYPOINT_REACH = 36;               // 走到這麼近就換下一個路徑點
const TD_HP = 3.6;                         // 雜兵血量 = 基礎血量 × TD_HP × 關卡 hpScale × 難度 × 波數成長
const TD_BOSS_HP = 0.45;                   // 關卡資料裡的首領血量 × 這個倍率（調難度用的總旋鈕）
const TD_SPEED = 0.6;                     // 地圖壓到約 1600×900 後路線短了一半，怪走慢一點才有時間被火網消耗
const TD_HP_GROWTH = 0.15;               // 波次沒寫 hp 時：每多一波 +15%（不套生存者的時間曲線、開局厚血與動態難度）
// 怪種護甲（魔獸三式）：light / medium / heavy / air（首領一律 boss）。
// 塔的攻擊類型 × 護甲倍率見 js/tdtowers.js 的 ARMOR_MUL。沒列到的怪種算 medium。
// air：不走路線、從入口直線飛向核心；加農砲與兵營打不到、也擋不住。
export const ARMOR_CLASS = {
  walker: 'light', runner: 'light', hound: 'light', boomer: 'light', blinker: 'light',
  hormagaunt: 'light', squig_bomb: 'light',
  brute: 'heavy', warden: 'heavy', chimera: 'heavy', ork_boy: 'heavy',
  bat: 'air', spore_mine: 'air',
  // 魔獸主題（td_warcraft）：食屍鬼輕甲、石像鬼（紅魔鬼）會飛、枯木妖靈重甲
  makai_zombie: 'light', makai_red_arremer: 'air', makai_woody: 'heavy',
};
// 入口巢穴與主堡的逐格貼圖（tools/cut_td_structures.py 產生；關卡用 lair / base 欄位指定）
//   巢穴：2 列（待機、出怪中）× 2 格，每格 256×224、地面中心 (128, 214)
//   主堡：4 列（完好、受損、危急、倒塌）× 4 格，每格 224×224、地面中心 (112, 214)
export const TD_STRUCTURE_KEYS = ['lair_canyon', 'lair_swamp', 'lair_void', 'lair_hive', 'base_keep', 'base_reactor', 'base_redalert',
  'lair_redalert', 'lair_starcraft', 'lair_warcraft', 'base_starcraft'];
export const TD_STRUCTURE_IMAGES = {};
if (typeof Image !== 'undefined') {
  for (const k of TD_STRUCTURE_KEYS) {
    const img = new Image();
    img.src = `assets/td/${k}.png`;
    TD_STRUCTURE_IMAGES[k] = img;
  }
}

// 守塔專屬無縫路面貼圖（assets/td/path_<主題>.png）
export const TD_PATH_KEYS = [
  'path_canyon', 'path_swamp', 'path_fortress', 'path_forgeworld',
  'path_redalert', 'path_starcraft', 'path_warcraft'
];
export const TD_PATH_IMAGES = {};
if (typeof Image !== 'undefined') {
  for (const k of TD_PATH_KEYS) {
    const img = new Image();
    img.src = `assets/td/${k}.png`;
    TD_PATH_IMAGES[k] = img;
  }
}
// 烘靜態路面圖層時用的「零相機」：paintRoadStatic 沿用正式繪製的 x - cam.x 寫法
const ROAD_LAYER_ORIGIN = { x: 0, y: 0 };

// 守塔關卡主題路線風格配置：峽谷道溝壑高差 ＋ 實體兩側圍籬／護欄／木樁防護（凸顯怪物行進走廊）
export const TD_PATH_STYLES = {
  td_canyon: {
    texture: 'path_canyon',
    gorgeShadow: 'rgba(12, 6, 2, 0.85)',
    gorgeShadowWidth: 36,
    cliffBase: '#4a250e',
    cliffBaseWidth: 24,
    cliffRim: '#783d18',
    cliffRimWidth: 16,
    sunkenBed: '#261306',
    sunkenBedWidth: 4,
    road: '#85461e',
    roadInner: '#9c5425',
    flow: 'rgba(254, 240, 138, 0.55)',
    flowDash: [14, 26],
    flowSpeed: 32,
    fence: {
      offset: 5,
      railColors: ['#b45309', '#78350f'],
      railOffsets: [-11, -5],
      railWidths: [3, 2.5],
      postStep: 38,
      postH: 16,
      postW: 6,
      postGrad: ['#d97706', '#78350f', '#451a03'],
      postBorder: '#291004',
      postCap: '#fde68a',
      postDetail: 'rope',
      detailColor: '#fef08a',
    },
  },
  td_fork: {
    texture: 'path_swamp',
    gorgeShadow: 'rgba(5, 15, 8, 0.85)',
    gorgeShadowWidth: 36,
    cliffBase: '#142818',
    cliffBaseWidth: 24,
    cliffRim: '#1e3f24',
    cliffRimWidth: 16,
    sunkenBed: '#0d1a10',
    sunkenBedWidth: 4,
    road: '#1e241c',
    roadInner: '#2c3529',
    flow: 'rgba(74, 222, 128, 0.5)',
    flowDash: [12, 30],
    flowSpeed: 28,
    fence: {
      offset: 5,
      railColors: ['#365314', '#1c1917'],
      railOffsets: [-10, -4],
      railWidths: [3, 2.2],
      postStep: 40,
      postH: 15,
      postW: 7,
      postGrad: ['#44403c', '#292524', '#142818'],
      postBorder: '#0c0a09',
      postCap: '#4ade80',
      postDetail: 'moss',
      detailColor: 'rgba(74, 222, 128, 0.7)',
    },
  },
  td_fortress: {
    texture: 'path_fortress',
    gorgeShadow: 'rgba(4, 9, 18, 0.9)',
    gorgeShadowWidth: 38,
    cliffBase: '#08172e',
    cliffBaseWidth: 26,
    cliffRim: '#0f2b48',
    cliffRimWidth: 16,
    sunkenBed: '#030712',
    sunkenBedWidth: 4,
    road: '#0f172a',
    roadInner: '#1e293b',
    flow: 'rgba(186, 230, 253, 0.65)',
    flowDash: [16, 24],
    flowSpeed: 38,
    fence: {
      offset: 6,
      railColors: ['#0284c7', '#38bdf8'],
      railOffsets: [-11, -5],
      railWidths: [3.5, 2],
      postStep: 44,
      postH: 16,
      postW: 7,
      postGrad: ['#38bdf8', '#1e293b', '#0f172a'],
      postBorder: '#020617',
      postCap: '#e0f2fe',
      postDetail: 'rune',
      detailColor: '#7dd3fc',
    },
  },
  td_forgeworld: {
    texture: 'path_forgeworld',
    gorgeShadow: 'rgba(0, 0, 0, 0.92)',
    gorgeShadowWidth: 40,
    cliffBase: '#1c1917',
    cliffBaseWidth: 26,
    cliffRim: '#292524',
    cliffRimWidth: 16,
    sunkenBed: '#0a0a0a',
    sunkenBedWidth: 4,
    road: '#1c1917',
    roadInner: '#292524',
    flow: 'rgba(239, 68, 68, 0.75)',
    flowDash: [24, 18],
    flowSpeed: 45,
    fence: {
      offset: 6,
      railColors: ['#f59e0b', '#78350f'],
      railOffsets: [-11, -5],
      railWidths: [3.8, 2.2],
      postStep: 42,
      postH: 16,
      postW: 6,
      postGrad: ['#f59e0b', '#78350f', '#1c1917'],
      postBorder: '#000000',
      postCap: '#ef4444',
      postDetail: 'hazard',
      detailColor: '#000000',
    },
  },
  td_redalert: {
    texture: 'path_redalert',
    gorgeShadow: 'rgba(10, 15, 26, 0.85)',
    gorgeShadowWidth: 38,
    cliffBase: '#1e293b',
    cliffBaseWidth: 26,
    cliffRim: '#334155',
    cliffRimWidth: 16,
    sunkenBed: '#0f172a',
    sunkenBedWidth: 4,
    road: '#1e293b',
    roadInner: '#334155',
    flow: 'rgba(239, 68, 68, 0.65)',
    flowDash: [14, 24],
    flowSpeed: 40,
    fence: {
      offset: 5,
      railColors: ['#cbd5e1', '#64748b'],
      railOffsets: [-11, -5],
      railWidths: [3.2, 2],
      postStep: 42,
      postH: 15,
      postW: 5,
      postGrad: ['#cbd5e1', '#475569', '#1e293b'],
      postBorder: '#0f172a',
      postCap: '#ffffff',
      postDetail: 'soviet',
      detailColor: '#ef4444',
    },
  },
  td_starcraft: {
    texture: 'path_starcraft',
    gorgeShadow: 'rgba(30, 4, 50, 0.88)',
    gorgeShadowWidth: 40,
    cliffBase: '#2e1065',
    cliffBaseWidth: 26,
    cliffRim: '#3b0764',
    cliffRimWidth: 16,
    sunkenBed: '#0a030f',
    sunkenBedWidth: 4,
    road: '#18042b',
    roadInner: '#2e1065',
    flow: 'rgba(244, 114, 182, 0.7)',
    flowDash: [18, 22],
    flowSpeed: 45,
    fence: {
      offset: 6,
      railColors: ['#a855f7', '#d946ef'],
      railOffsets: [-12, -6],
      railWidths: [3.5, 2],
      postStep: 38,
      postH: 17,
      postW: 6,
      postGrad: ['#f472b6', '#9333ea', '#3b0764'],
      postBorder: '#18042b',
      postCap: '#e879f9',
      postDetail: 'chitin',
      detailColor: '#f43f5e',
    },
  },
  td_warcraft: {
    texture: 'path_warcraft',
    gorgeShadow: 'rgba(2, 6, 23, 0.92)',
    gorgeShadowWidth: 38,
    cliffBase: '#0f172a',
    cliffBaseWidth: 26,
    cliffRim: '#1e293b',
    cliffRimWidth: 16,
    sunkenBed: '#020617',
    sunkenBedWidth: 4,
    road: '#090d16',
    roadInner: '#1e293b',
    flow: 'rgba(52, 211, 153, 0.6)',
    flowDash: [18, 26],
    flowSpeed: 36,
    fence: {
      offset: 5,
      railColors: ['#475569', '#334155'],
      railOffsets: [-11, -5],
      railWidths: [3.2, 1.8],
      postStep: 40,
      postH: 16,
      postW: 5,
      postGrad: ['#64748b', '#334155', '#0f172a'],
      postBorder: '#020617',
      postCap: '#94a3b8',
      postDetail: 'spear',
      detailColor: '#10b981',
    },
  },
};
const LAIR = { w: 256, h: 224, foot: 214, scale: 0.62 };   // 畫出來約 140 寬（路寬 85~95）
export const TD_LIVES = 20;              // 關卡沒寫 lives 時的預設命數
export const TD_START_GOLD = 250;        // 關卡沒寫 startGold 時的開局金幣（約 4 座基礎砲台）
export const LEAK = (e) => (e.isBoss ? 10 : 1);           // 漏一隻扣幾條命
export const bounty = (e) => Math.round((e.isBoss ? 150 : 2 + (e.exp || 1) * 2) * (e.bountyMul || 1));   // 擊殺賞金（精英詞綴會再乘）

export class TowerDefense {
  constructor(game) {
    this.game = game;
    this.level = game.level;
    // 配合玩家的視野選擇（橫屏 / 竪屏 / 自動）動態隨機化生成道路走勢與砲塔地基點（維持每關固定建塔總數）
    randomizeTDLevel(this.level, this.game.orientation || 'auto');
    this.waves = this.level.waves;
    this.waveIdx = 0;                 // 下一個要出的波（0-based）
    this.phase = 'break';
    this.timer = this.level.breakTime + 6;   // 開場多給 6 秒佈防
    this.queue = [];
    this.clock = 0;
    this.half = this.level.pathWidth / 2;
    // 實際使用的路線：有巢穴的關卡，路從巢穴洞口開始（第一點換成入口標記），
    // 怪從洞口出來、路面也從洞口畫起，不會再有一截路伸到巢穴後面的地圖邊。
    // 不改 level.paths 本身：關卡物件跨局重用，就地改會每開一局往內縮一次
    this.paths = this.level.paths.map((p) => {
      if (!this.level.lair) return p;
      const m = this.entranceMark(p);
      return [[m.x, m.y], ...p.slice(1)];
    });
    // 王國升級（js/tdkingdom.js）：每條線目前的等級，0 = 還沒買。買了的效果見 kingdomStat()
    this.kingdom = {};
    this._heroKingdomMul = 1;   // 英雄的加成是乘在 modeDmgMul 上，要記住上次乘到哪才不會重複疊
  }

  // 王國升級目前提供的全局數值（每次買升級／要顯示時現算，不另外快取）
  kingdomStat() {
    const lv = (k) => kingdomValue(k, this.kingdom[k] || 0);
    return {
      goldBonus: lv('economy'),
      costCut: lv('engineering'),
      dmg: lv('ballistics'),
      range: lv('optics'),
      earlyBonus: lv('logistics'),
      hero: lv('hero'),
    };
  }

  // 面板要用的列：UI 只負責畫，能不能買、多少錢都在這裡決定
  kingdomRows() {
    return KINGDOM_UPGRADES.map((t) => {
      const level = this.kingdom[t.key] || 0;
      const cost = kingdomNextCost(t.key, level);
      const maxed = cost == null;
      return {
        key: t.key, icon: t.icon, name: t.name, desc: t.desc,
        level, max: t.levels.length, cost, maxed,
        value: kingdomValue(t.key, level),
        nextText: maxed ? '' : t.levels[level].text,
        affordable: !maxed && this.game.gold >= cost,
      };
    });
  }

  // 買一階王國升級。已滿級或錢不夠就只跳提示、不扣款。
  buyKingdom(key) {
    const g = this.game;
    const track = kingdomTrack(key);
    if (!track) return false;
    const level = this.kingdom[key] || 0;
    const cost = kingdomNextCost(key, level);
    if (cost == null) { g.ui.say(`${track.name} 已經滿級了`, '#9aa4b2', 1.5); return false; }
    if (g.gold < cost) { g.ui.say(`需要 ${cost} 🪙 才能升級${track.name}`, '#ff6b7a', 1.5); return false; }
    g.gold -= cost;
    this.kingdom[key] = level + 1;
    this.applyKingdom();
    g.ui.say(`🏰 ${track.name} Lv.${level + 1} — ${track.levels[level].text}`, '#ffd166', 2.4);
    return true;
  }

  // 把王國升級的全局倍率推到「已經在場上」的東西：塔（含兵營小兵與傭兵，因為它們的
  // damageMul 每幀跟著塔走）與英雄。已蓋好的塔要立刻受益，否則玩家會覺得升級沒用。
  applyKingdom() {
    const g = this.game;
    const st = this.kingdomStat();
    for (const t of g.turrets || []) {
      t.kingdomDmgMul = 1 + st.dmg;
      t.kingdomRangeMul = 1 + st.range;
      applyTDStats(t);
    }
    const p = g.player;
    if (p) {
      const next = 1 + st.hero;
      if (this._heroKingdomMul > 0) p.modeDmgMul *= next / this._heroKingdomMul;
      this._heroKingdomMul = next;
    }
  }

  get total() {
    return this.waves.length;
  }

  update(dt) {
    if (this.phase === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave();
      return;
    }
    if (this.phase !== 'wave') return;
    this.clock += dt;
    while (this.queue.length && this.queue[0].t <= this.clock) this.spawn(this.queue.shift());
    // 該波清空：佇列出完、場上沒有沿路線走的怪（召喚／孵化的小怪不擋進度）
    if (!this.queue.length && !this.game.enemies.some((e) => !e.isDead && e.path)) this.waveCleared();
  }

  startWave(early = false) {
    if (this.phase !== 'break' || this.waveIdx >= this.total) return;
    const g = this.game;
    if (early && this.timer > 0) {
      // 王國升級「後勤」把每剩 1 秒的金幣從 4 往上加
      const perSec = EARLY_GOLD_PER_SEC + this.kingdomStat().earlyBonus;
      const bonus = Math.round(this.timer * perSec);
      g.gold += bonus;
      g.ui.say(`⏩ 提前開戰！+${bonus} 🪙`, '#ffd166', 1.8);
    }
    const wave = this.waves[this.waveIdx];
    const paths = this.paths;
    // 波次詞綴（js/tdwaves.js）：數量與空襲要在排佇列時就決定，
    // 血量／移速／護甲／賞金則跟著每個佇列項目帶到 spawn()（同一波可能橫跨好幾秒）
    const mods = wave.mods || [];
    const mm = waveModMul(mods);
    const groups = wave.groups.map((grp) => ({ ...grp, count: Math.max(1, Math.round(grp.count * mm.count)) }));
    // 空襲：追加一批飛行單位。數量隨波次成長，否則後期的空襲等於沒加一樣。
    if (mods.includes('aerial')) groups.push({ type: AIR_FILLER, count: Math.round(6 + this.waveIdx * 1.5), gap: 0.4 });

    this.queue = [];
    // 生成密度（難度軸）：只壓縮佇列的時間軸，每波總數不變 ——
    // 困難的 1.8 = 同一波在 1/1.8 的時間內到齊。用意與生存者 Spawner.js 的
    // `interval /= rules.spawnMul` 相同，壓力來自「來得及打嗎」而不是「怪變多」，
    // 所以不會讓場上怪物數爆掉（守塔沒有 MAX_ENEMIES 上限）。
    const density = Math.max(0.25, g.rules.spawnMul || 1);
    groups.forEach((grp, gi) => {
      for (let k = 0; k < grp.count; k++) {
        const path = grp.path != null ? paths[grp.path % paths.length] : paths[(k + gi) % paths.length];
        this.queue.push({ t: (gi * GROUP_STAGGER + k * grp.gap) / density, type: grp.type, path, mods });
      }
    });
    this.queue.sort((a, b) => a.t - b.t);
    this.clock = 0;
    this.phase = 'wave';
    this.waveIdx++;
    sound.playEvoFanfare();
    const modNames = mods.map((m) => (WAVE_MODS[m] ? WAVE_MODS[m].name : null)).filter(Boolean).join('、');
    g.ui.say(`⚔️ 第 ${this.waveIdx}/${this.total} 波來襲！${modNames ? `〔${modNames}〕` : ''}`, '#ff5e5e', 2);
    if (wave.boss) {
      const isFinal = this.waveIdx === this.total;
      g.spawner.spawnBoss({ ...wave.boss, hp: Math.round(wave.boss.hp * TD_BOSS_HP * g.rules.enemyHpMul), final: isFinal }, g.player, g.enemies, (boss) => g.onBossSpawned(boss));
      // 首領也從入口出發、沿路線走向核心（輪流挑一條路線）
      const path = paths[(this.waveIdx - 1) % paths.length];
      g.boss.x = path[0][0];
      g.boss.y = path[0][1];
      g.boss.path = path;
      g.boss.armorClass = 'boss';
      g.boss.speed *= TD_SPEED;   // 首領也照路線縮短的比例放慢，否則 20 秒就走完全程、必定漏掉
      g.boss.pathIdx = 1;
      g.boss._wp = { x: path[1][0], y: path[1][1], radius: 0 };
    }
  }

  // 路網上離 (x, y) 最近的位置：路線 pi、線段 i（paths[pi][i-1] → paths[pi][i]）、投影點與距離
  locate(x, y) {
    let best = null;
    this.paths.forEach((p, pi) => {
      for (let i = 1; i < p.length; i++) {
        const r = projectToSegment(p[i - 1], p[i], x, y);
        if (!best || r.d < best.d) best = { ...r, pi, i };
      }
    });
    return best;
  }

  // 英雄只能走在路上：把 (x, y) 夾回最近的路面（離中線不超過路寬一半 − margin）
  clampToRoad(x, y, margin = 0) {
    const r = this.locate(x, y);
    const lim = Math.max(4, this.half - margin);
    if (r.d <= lim) return { x, y };
    return { x: r.px + ((x - r.px) / r.d) * lim, y: r.py + ((y - r.py) / r.d) * lim };
  }

  // 英雄沿路走的路徑點：同一條路就沿折線走；不同路就先走到核心（每條路的終點都在核心）再沿另一條往回走。
  // 直接朝目的地走的話會穿過路外、卡在路肩的夾制上
  roadRoute(from, to) {
    const a = this.locate(from.x, from.y);
    const b = this.locate(to.x, to.y);
    const vert = (pi, k) => ({ x: this.paths[pi][k][0], y: this.paths[pi][k][1] });
    const pts = [];
    if (a.pi === b.pi) {
      if (b.i > a.i) for (let k = a.i; k < b.i; k++) pts.push(vert(a.pi, k));
      else if (b.i < a.i) for (let k = a.i - 1; k >= b.i; k--) pts.push(vert(a.pi, k));
    } else {
      for (let k = a.i; k < this.paths[a.pi].length; k++) pts.push(vert(a.pi, k));
      for (let k = this.paths[b.pi].length - 2; k >= b.i; k--) pts.push(vert(b.pi, k));
    }
    pts.push({ x: to.x, y: to.y });
    return pts;
  }

  // 目前這一波雜兵的血量倍率（基礎 × 關卡 × 難度 × 波次）；英雄的隕石也拿它算傷害
  hpMul() {
    const w = Math.max(1, this.waveIdx);
    const wave = this.waves[w - 1];
    const waveHp = wave && wave.hp != null ? wave.hp : 1 + TD_HP_GROWTH * (w - 1);
    return TD_HP * (this.level.hpScale || 1) * this.game.rules.enemyHpMul * waveHp;
  }

  // 難度的「菁英機率」軸：生存者由 Spawner.rollElite 依開局時間擲，守塔改用波次進度擲
  // （TD 不吃生存者的時間曲線與動態難度）。第 3 波起才可能出現、越後面越高；
  // 基礎曲線上限 30%，再乘難度的 eliteChanceMul（地獄 3.0 → 最高 45%）。
  // 詞綴與數值跟生存者共用同一個池子（js/config.js ELITE_AFFIXES）。
  eliteChance() {
    const w = this.waveIdx;
    if (w < 3) return 0;
    const base = Math.min(0.30, 0.04 + (w - 3) * 0.015);
    return Math.min(0.45, base * (this.game.rules.eliteChanceMul || 1));
  }

  spawn({ type, path, mods = [] }) {
    const g = this.game;
    const mm = waveModMul(mods);
    const scale = enemyScale(0, this.level, g.rules);   // 只取移速與傷害；血量下面重算
    scale.speed *= TD_SPEED * mm.speed;
    scale.hp = this.hpMul() * mm.hp;
    const [x, y] = path[0];
    const e = new Enemy(type, x + (Math.random() - 0.5) * this.half, y + (Math.random() - 0.5) * this.half, scale);
    e.tdDrawScale = TD_CHAR_SCALE;   // 守塔鏡頭拉遠：怪物只放大繪製，碰撞半徑不動
    const skin = this.level.enemySkins && this.level.enemySkins[type];
    if (skin) e.baseSpriteKey = skin;   // 主題地圖只換外觀（例：紅警的 brute 畫成犀牛坦克），數值與護甲照原怪種
    e.armorClass = ARMOR_CLASS[type] || 'medium';
    e.flying = e.armorClass === 'air';
    // 重甲縱隊：只把地面單位升成重甲。若連飛行怪也改，空襲＋重甲就會把「對空塔」整條廢掉。
    if (mods.includes('armored') && !e.flying) e.armorClass = 'heavy';
    e.bountyMul = mm.bounty;
    if (e.flying) path = [path[0], path[path.length - 1]];   // 飛行怪不走路線，從入口直線飛向核心
    e.path = path;
    e.pathIdx = 1;
    e.spawnTime = g.gameTime;
    e._wp = { x: path[1][0], y: path[1][1], radius: 0 };
    // 詞綴精英：makeElite 會乘上血量／移速／傷害／體型與經驗（賞金 bounty() 用 exp 計算，
    // 所以精英的賞金會自動跟著提高，算是給玩家的部分補償）。首領不走這裡，不會被擲中。
    const eliteChance = this.eliteChance();
    if (eliteChance > 0 && Math.random() < eliteChance) e.makeElite(rollEliteAffix());
    g.enemies.push(e);
  }

  waveCleared() {
    const g = this.game;
    // 王國升級「稅收」直接放大每波清空獎金（利息的計算基準也跟著變高，這是刻意的）
    const bonus = Math.round(WAVE_BONUS(this.waveIdx) * (1 + this.kingdomStat().goldBonus));
    g.gold += bonus;
    heroLevelUp(g);

    // 地基的經濟／成長加成（定義見 js/tdsockets.js）：
    //   金庫 bank      —— 清空當下結算利息（現有金幣 ×5%，單座上限 80）
    //   訓練場 veteran —— 每清一波，這座塔永久 +4% 威力
    // 兩者是相反的取捨：金庫要你「忍住不花錢」，訓練場要你「越早蓋越好」。
    // 利息刻意用「清空當下」的金幣計算（而不是波前的存款），否則玩家可以靠預支獎金套利。
    let interest = 0;
    let veteranCount = 0;
    let veteranMax = 0;
    for (const t of g.turrets) {
      if (t.isDead) continue;
      if (t.bankRate > 0) interest += Math.min(t.bankCap || 0, Math.round(g.gold * t.bankRate));
      if (t.vetRate > 0) {
        t.vetStacks = (t.vetStacks || 0) + 1;
        t.vetMul = (t.vetMul || 1) * (1 + t.vetRate);
        t.dmgMul = (t.dmgMul || 1) * (1 + t.vetRate);   // 下一次升級／專精時 applyTDStats 會用 vetMul 重算
        veteranCount++;
        veteranMax = Math.max(veteranMax, Math.round((t.vetMul - 1) * 100));
      }
    }
    if (interest > 0) g.gold += interest;

    const parts = [`✅ 第 ${this.waveIdx} 波清空！+${bonus} 🪙`];
    if (interest > 0) parts.push(`金庫利息 +${interest} 🪙`);
    if (veteranCount > 0) parts.push(`訓練場 ×${veteranCount} 成長（最高 +${veteranMax}%）`);
    parts.push(`英雄升到 Lv.${g.player.heroLevel}`);
    g.ui.say(parts.join(' ‧ '), '#3ddc84', 2.2);
    if (this.waveIdx >= this.total) {
      // 走到這裡代表最後一波（含首領）都已擊殺或漏掉。擊殺首領會先在
      // cleanupDeadEnemies 判勝；首領漏掉但命數還在，也算守住了
      this.phase = 'done';
      g.handleGameOver(true);
      return;
    }
    this.phase = 'break';
    this.timer = this.level.breakTime;
  }

  // 沿路線走的怪：目標是下一個路徑點，走完才朝核心
  targetFor(e, core, dt = 0) {
    if (!e.path) return null;
    if (e.pathIdx >= e.path.length) return core;
    const [wx, wy] = e.path[e.pathIdx];
    // 換下一個路徑點：夠近、或已經走過了這段（投影超出線段終點）、或卡太久
    const [ax, ay] = e.path[e.pathIdx - 1];
    const sx = wx - ax, sy = wy - ay;
    const passed = ((e.x - ax) * sx + (e.y - ay) * sy) >= sx * sx + sy * sy;
    e._wpTime = (e._wpTime || 0) + dt;
    if (Math.hypot(e.x - wx, e.y - wy) < WAYPOINT_REACH || passed || e._wpTime > 25) {
      e._wpTime = 0;
      e.pathIdx++;
      if (e.pathIdx >= e.path.length) {
        e.progress = e.pathIdx * 1e5;
        return core;
      }
      e._wp.x = e.path[e.pathIdx][0];
      e._wp.y = e.path[e.pathIdx][1];
    }
    // 沿路線走了多遠（砲塔「打最前面」用）：段數為主、離下一個路徑點越近越前面
    e.progress = e.pathIdx * 1e5 - Math.hypot(e.x - e._wp.x, e.y - e._wp.y);
    return e._wp;
  }

  // 路寬夾制：繞行／擺盪型的怪也不能離開路線（路兩側視為牆）
  clamp(e) {
    if (!e.path || e.pathIdx >= e.path.length) return;
    const a = e.path[e.pathIdx - 1];
    const b = e.path[e.pathIdx];
    const r = projectToSegment(a, b, e.x, e.y);
    const lim = Math.max(8, this.half - e.radius * 0.6);
    if (r.d > lim) {
      e.x = r.px + ((e.x - r.px) / r.d) * lim;
      e.y = r.py + ((e.y - r.py) / r.d) * lim;
    }
  }

  // 下一波預告（休息時顯示）：每群的怪種、數量、護甲與入口；首領另列
  nextWaveInfo() {
    if (this.phase !== 'break' || this.waveIdx >= this.total) return null;
    const w = this.waves[this.waveIdx];
    const mods = w.mods || [];
    const mm = waveModMul(mods);
    const n = this.level.paths.length;
    const entrances = new Array(n).fill(0);
    const byType = new Map();   // 同一怪種分走不同入口時合併成一筆
    for (const grp of w.groups) {
      const count = Math.max(1, Math.round(grp.count * mm.count));
      if (grp.path != null) entrances[grp.path % n] += count;
      else for (let k = 0; k < count; k++) entrances[k % n]++;
      const g = byType.get(grp.type) || { type: grp.type, count: 0, armor: ARMOR_CLASS[grp.type] || 'medium' };
      g.count += count;
      byType.set(grp.type, g);
    }
    // 空襲的追加批也要先算進來，否則預告會少報一整群（玩家就是照預告決定要不要補對空）
    if (mods.includes('aerial')) {
      const count = Math.round(6 + this.waveIdx * 1.5);
      const g = byType.get(AIR_FILLER) || { type: AIR_FILLER, count: 0, armor: ARMOR_CLASS[AIR_FILLER] || 'air' };
      g.count += count;
      byType.set(AIR_FILLER, g);
      for (let k = 0; k < count; k++) entrances[k % n]++;
    }
    const total = [...byType.values()].reduce((s, g) => s + g.count, 0);
    return {
      index: this.waveIdx + 1, groups: [...byType.values()], entrances,
      boss: w.boss ? w.boss.name : null, mods, total,
      hpPct: Math.round(mm.hp * 100), speedPct: Math.round(mm.speed * 100),
    };
  }

  objective() {
    if (this.phase === 'break') {
      return `第 ${this.waveIdx + 1}/${this.total} 波 ‧ 佈防時間 ${Math.ceil(this.timer)} 秒（N 提前開戰拿金幣）`;
    }
    if (this.phase === 'wave') return `第 ${this.waveIdx}/${this.total} 波進攻中 ‧ 守住核心！`;
    return '最後一波！守住終極首領即可通關';
  }

  // 重甲怪頭上畫一面小盾牌（穿刺塔打牠只剩一半傷害，要看得出來）。在怪物之後畫
  drawBadges(ctx, cam) {
    ctx.save();
    ctx.fillStyle = '#c9d3df';
    ctx.strokeStyle = '#1b222c';
    ctx.lineWidth = 1.5;
    for (const e of this.game.enemies) {
      if (e.isDead || e.armorClass !== 'heavy') continue;
      const x = e.x - cam.x;
      const y = e.y - cam.y - e.radius - 16;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.quadraticCurveTo(x + 6, y + 5, x, y + 8);
      ctx.quadraticCurveTo(x - 6, y + 5, x - 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 入口巢穴：出怪中（這一波還在出）播第 2 列，其餘播待機。sx/sy 是地面中心的螢幕座標
  drawLair(ctx, sx, sy) {
    const img = TD_STRUCTURE_IMAGES[this.level.lair];
    if (!img || !img.naturalWidth) return false;
    const row = this.phase === 'wave' && this.queue.length ? 1 : 0;
    const frame = Math.floor(this.game.gameTime * 3) % 2;
    const w = LAIR.w * LAIR.scale;
    const h = LAIR.h * LAIR.scale;
    ctx.drawImage(img, frame * LAIR.w, row * LAIR.h, LAIR.w, LAIR.h, sx - w / 2, sy - LAIR.foot * LAIR.scale, w, h);
    return true;
  }

  // 入口標記（門、來怪紅圈）的位置：入口本身貼在地圖邊上，標記畫在邊上的話有一半會
  // 跑出地圖、壓進頂部 HUD（三門要塞北門被下一波預告蓋住）。所以沿路線往地圖內側挪
  // 一個標記半徑，整個標記都落在地圖裡。ix/iy 是指向地圖內側的單位向量
  entranceMark(path) {
    const b = this.level.bounds;
    const [x, y] = path[0];
    const ix = x <= b.minX + 1 ? 1 : x >= b.maxX - 1 ? -1 : 0;
    const iy = y <= b.minY + 1 ? 1 : y >= b.maxY - 1 ? -1 : 0;
    // 有巢穴貼圖時要挪到整張圖都在地圖裡：貼圖以底部中心為錨點往上長，
    // 所以上緣入口要挪一整個圖高、左右入口挪半個圖寬，下緣入口挪一點就好
    const base = this.level.pathWidth * 0.6 + 20;
    const lair = this.level.lair ? { w: LAIR.w * LAIR.scale, h: LAIR.foot * LAIR.scale } : null;
    const insetX = lair ? Math.max(base, lair.w / 2 + 6) : base;
    const insetY = lair && iy > 0 ? Math.max(base, lair.h + 6) : base;
    return { x: x + ix * insetX, y: y + iy * insetY, ix, iy };
  }

  // 路線：先鋪靜態圖層（離屏烘一次），再畫會動的流向引導線，最後才是巢穴／門牌／主堡指示
  draw(ctx, cam) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const layer = this.staticRoadLayer(this.screenScale(ctx));
    if (layer && this._roadLayerOrigin) {
      ctx.drawImage(layer, this._roadLayerOrigin.x - cam.x, this._roadLayerOrigin.y - cam.y,
        this._roadLayerW, this._roadLayerH);
    } else {
      // 沒有 DOM（例如無頭資料檢查）時的退路：直接照舊畫
      this.paintRoadStatic(ctx, cam);
    }
    this.paintFlow(ctx, cam);
    this.paintDynamicOverlay(ctx, cam);
    ctx.restore();
  }

  // 靜態路面圖層的快取鍵：關卡、視野邊界、路線、路寬只要有一項變了就得重烘
  roadLayerKey() {
    const b = this.level.bounds;
    return [
      this.level.id, b.minX, b.minY, b.maxX, b.maxY, this.level.pathWidth,
      this.paths.map((p) => p.map((q) => `${q[0]},${q[1]}`).join(';')).join('|'),
    ].join('#');
  }

  // 畫布目前的實際縮放（dpr × 鏡頭縮放）：烘圖層時要對齊它，否則每幀都在做代價更高的重取樣
  screenScale(ctx) {
    if (ctx && typeof ctx.getTransform === 'function') {
      const m = ctx.getTransform();
      const s = Math.hypot(m.a, m.b);
      if (isFinite(s) && s > 0) return s;
    }
    const z = this.game && this.game.zoom ? this.game.zoom : 1;
    const dpr = this.game && this.game.dpr ? this.game.dpr : 1;
    return z * dpr;
  }

  // 靜態路面只跟關卡資料有關（唯一會動的流向線在 paintFlow），所以整層烘到離屏 canvas，
  // 每幀只付一次 drawImage。這是 v86 檢討裡「每幀重建約 190 個 createLinearGradient 樁柱、
  // 比 v84 慢 20%」的解法；也因為只烘一次，7 張路面貼圖才負擔得起逐線段旋轉鋪設。
  staticRoadLayer(scaleHint) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const style = TD_PATH_STYLES[this.level.id] || TD_PATH_STYLES.td_canyon;
    const tex = TD_PATH_IMAGES[style.texture];
    const texReady = !!(tex && tex.naturalWidth);
    // 烘的解析度取「剛好不低於畫面縮放」的階梯值：與畫面 1:1 的圖層貼起來最便宜，
    // 階梯化則讓縮放/自適應解析度微調時不會一直重烘。
    const s = Math.max(0.2, Math.min(1, scaleHint || 1));
    const k = [0.35, 0.5, 0.65, 0.8, 1].find((v) => v >= s - 1e-6) || 1;
    const key = `${this.roadLayerKey()}#${texReady ? 'tex' : 'notex'}#${k}`;
    // 貼圖還沒解碼完就先不進快取，下一幀補烘（否則這一局就永遠是沒有貼圖的路面）
    if (this._roadLayerCanvas && this._roadLayerKey === key) return this._roadLayerCanvas;

    const b = this.level.bounds;
    const pad = 160;
    const needW = Math.max(1, Math.ceil(b.maxX - b.minX + pad * 2));
    const needH = Math.max(1, Math.ceil(b.maxY - b.minY + pad * 2));
    // 超大視野的保險：超過約 600 萬像素就再降一級
    const MAX_PX = 6.0e6;
    const kk = needW * needH * k * k > MAX_PX ? k * Math.sqrt(MAX_PX / (needW * needH * k * k)) : k;

    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(needW * kk));
    cv.height = Math.max(1, Math.round(needH * kk));
    const c = cv.getContext('2d');
    if (!c) return null;
    c.scale(kk, kk);
    c.translate(pad - b.minX, pad - b.minY);
    this.paintRoadStatic(c, ROAD_LAYER_ORIGIN);

    this._roadLayerCanvas = cv;
    this._roadLayerKey = key;
    this._roadLayerOrigin = { x: b.minX - pad, y: b.minY - pad };
    this._roadLayerW = needW;
    this._roadLayerH = needH;
    return cv;
  }

  // 主題無縫貼圖：512×512 可以縮放，縮放版另存一張小 canvas，pattern 只建一次
  pathPattern(img, scale) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    if (!img || !img.naturalWidth) return null;
    const s = Math.max(0.25, Math.min(2, scale || 1));
    const key = `${img.src}@${s}`;
    if (!this._patternCache) this._patternCache = new Map();
    const hit = this._patternCache.get(key);
    if (hit) return hit;

    let src = img;
    if (Math.abs(s - 1) > 0.001) {
      const nw = Math.max(1, Math.round(img.naturalWidth * s));
      const nh = Math.max(1, Math.round(img.naturalHeight * s));
      const tmp = document.createElement('canvas');
      tmp.width = nw;
      tmp.height = nh;
      const tc = tmp.getContext('2d');
      if (!tc) return null;
      tc.drawImage(img, 0, 0, nw, nh);
      src = tmp;
    }
    if (!this._patternHost) this._patternHost = document.createElement('canvas');
    const host = this._patternHost.getContext('2d');
    if (!host) return null;
    const pat = host.createPattern(src, 'repeat');
    if (pat) this._patternCache.set(key, pat);
    return pat;
  }

  // 把主題貼圖沿著路線鋪上去：整條路先圍成一個裁切多邊形，再逐線段旋轉填滿，
  // 貼圖才會順著路走（固定朝北的 pattern 在轉彎處會像貼歪的壁紙）。
  paintRoadTexture(ctx, path, w, style, offsets, cam) {
    if (!style || !style.texture || path.length < 2 || !offsets) return;
    const img = TD_PATH_IMAGES[style.texture];
    if (!img || !img.naturalWidth) return;
    const pattern = this.pathPattern(img, style.textureScale || 1);
    if (!pattern) return;

    const left = offsets(-w / 2);
    const right = offsets(w / 2);
    ctx.save();
    // 世界座標 → 畫面座標（烘圖層時 cam 是 0，逐幀退路時要跟著鏡頭）
    ctx.translate(-(cam ? cam.x : 0), -(cam ? cam.y : 0));
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.clip();

    ctx.globalAlpha = style.textureAlpha != null ? style.textureAlpha : 0.85;
    ctx.fillStyle = pattern;
    for (let i = 0; i < path.length - 1; i++) {
      const ax = path[i][0];
      const ay = path[i][1];
      const bx = path[i + 1][0];
      const by = path[i + 1][1];
      const segLen = Math.hypot(bx - ax, by - ay);
      if (segLen < 1) continue;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(by - ay, bx - ax));
      // 兩端各外擴半個路寬補轉角的楔形缺口（超出的部分由上面的裁切處理掉）
      ctx.fillRect(-w / 2, -w / 2, segLen + w, w);
      ctx.restore();
    }
    ctx.restore();
  }

  // 路線靜態層：峽谷道深凹溝壑 + 主題路面（含無縫貼圖）+ 車痕 + 兩側立體圍籬／樁柱／護欄
  paintRoadStatic(ctx, cam) {
    const w = this.level.pathWidth;
    const style = TD_PATH_STYLES[this.level.id] || TD_PATH_STYLES.td_canyon;
    const f = style.fence;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // A. 峽谷道深坑與崖壁高差 (Gorge Depth & Cliff Embankments)
    for (const path of this.paths) {
      if (path.length < 2) continue;

      const trace = () => {
        ctx.beginPath();
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x - cam.x, y - cam.y) : ctx.moveTo(x - cam.x, y - cam.y)));
      };

      // 折線外擴計算器 (平滑角點斜接，左右分開，永不交叉貫穿道路)
      const computePolylineOffsets = (dist) => {
        const pts = [];
        const n = path.length;
        const segNorms = [];
        for (let i = 0; i < n - 1; i++) {
          const dx = path[i + 1][0] - path[i][0];
          const dy = path[i + 1][1] - path[i][1];
          const len = Math.hypot(dx, dy) || 1;
          segNorms.push({ nx: -dy / len, ny: dx / len });
        }

        pts.push({
          x: path[0][0] + segNorms[0].nx * dist,
          y: path[0][1] + segNorms[0].ny * dist,
        });

        for (let i = 1; i < n - 1; i++) {
          const n1 = segNorms[i - 1];
          const n2 = segNorms[i];
          const mx = n1.nx + n2.nx;
          const my = n1.ny + n2.ny;
          const mLen = Math.hypot(mx, my);
          if (mLen < 0.001) {
            pts.push({ x: path[i][0] + n1.nx * dist, y: path[i][1] + n1.ny * dist });
          } else {
            const bx = mx / mLen;
            const by = my / mLen;
            const cosHalf = bx * n1.nx + by * n1.ny;
            const miter = Math.min(1.7, 1 / Math.max(0.25, cosHalf));
            pts.push({
              x: path[i][0] + bx * dist * miter,
              y: path[i][1] + by * dist * miter,
            });
          }
        }

        pts.push({
          x: path[n - 1][0] + segNorms[n - 2].nx * dist,
          y: path[n - 1][1] + segNorms[n - 2].ny * dist,
        });

        return pts;
      };

      // 1. 峽谷深層外緣落影 (Gorge Ambient Drop Shadow)
      trace();
      ctx.strokeStyle = style.gorgeShadow;
      ctx.lineWidth = w + (style.gorgeShadowWidth || 36);
      ctx.stroke();

      // 2. 懸崖護坡岩層基礎 (Cliff Embankment Base)
      trace();
      ctx.strokeStyle = style.cliffBase;
      ctx.lineWidth = w + (style.cliffBaseWidth || 24);
      ctx.stroke();

      // 3. 護坡崖壁頂緣 (Cliff Rim)
      trace();
      ctx.strokeStyle = style.cliffRim;
      ctx.lineWidth = w + (style.cliffRimWidth || 16);
      ctx.stroke();

      // 4. 下凹谷底接縫 (Sunken Bed Seam)
      trace();
      ctx.strokeStyle = style.sunkenBed;
      ctx.lineWidth = w + 4;
      ctx.stroke();

      // 5. 峽谷底層基路 (Packed Canyon Roadbed)
      trace();
      ctx.strokeStyle = style.road;
      ctx.lineWidth = w;
      ctx.stroke();

      trace();
      ctx.strokeStyle = style.roadInner;
      ctx.lineWidth = Math.max(12, w - 16);
      ctx.stroke();

      // 5b. 主題無縫路面貼圖（assets/td/path_<主題>.png，512×512）
      //     貼圖只跟關卡資料有關，所以只在這層烘一次；每個線段各自旋轉，貼圖才會順著路走。
      this.paintRoadTexture(ctx, path, w, style, computePolylineOffsets, cam);

      // 6. 峽谷北壁下凹落影 (Sunken Cliff Inner Drop Shadow)
      ctx.save();
      ctx.translate(0, 5);
      trace();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = Math.max(8, w - 10);
      ctx.stroke();
      ctx.restore();

      // 7. 谷底行軍車痕／足印細溝痕
      const rutLeft = computePolylineOffsets(-w * 0.22);
      const rutRight = computePolylineOffsets(w * 0.22);
      [rutLeft, rutRight].forEach((rPts) => {
        ctx.beginPath();
        rPts.forEach((p, idx) => (idx ? ctx.lineTo(p.x - cam.x, p.y - cam.y) : ctx.moveTo(p.x - cam.x, p.y - cam.y)));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 3;
        ctx.stroke();
      });

      // 8. 主題流向引導線見 paintFlow（每幀都會動，不進這層烘焙）

      // B. 兩側實體立體圍籬／樁柱／護欄 (Physical Guardrails & Palisade Posts)
      if (f) {
        const leftFence = computePolylineOffsets(-(w / 2 + (f.offset || 5)));
        const rightFence = computePolylineOffsets(w / 2 + (f.offset || 5));

        const renderFenceLine = (fencePts) => {
          // 1. 先畫所有 3D 立體圍籬木樁／鋼柱／拒馬（讓橫向護欄能穿過柱身）
          const step = f.postStep || 38;
          const pH = f.postH || 16;
          const pW = f.postW || 6;
          const halfW = pW / 2;

          const drawPostAt = (px, py) => {
            // 底部地面落影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath();
            ctx.ellipse(px + 2, py + 3, halfW + 3, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // 立體立柱漸層
            const pGrad = ctx.createLinearGradient(px - halfW, py - pH, px + halfW, py);
            pGrad.addColorStop(0, f.postGrad[0]);
            pGrad.addColorStop(0.5, f.postGrad[1]);
            pGrad.addColorStop(1, f.postGrad[2]);

            ctx.fillStyle = pGrad;
            ctx.strokeStyle = f.postBorder || '#000000';
            ctx.lineWidth = 1.2;
            ctx.fillRect(px - halfW, py - pH, pW, pH);
            ctx.strokeRect(px - halfW, py - pH, pW, pH);

            // 柱頂高光 / 雪帽 / 倒角 / 寶石
            ctx.fillStyle = f.postCap;
            ctx.fillRect(px - halfW, py - pH, pW, 2.5);

            // 主題特徵裝飾
            if (f.postDetail === 'rope') {
              ctx.strokeStyle = f.detailColor;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(px - halfW, py - 11); ctx.lineTo(px + halfW, py - 11);
              ctx.moveTo(px - halfW, py - 5); ctx.lineTo(px + halfW, py - 5);
              ctx.stroke();
            } else if (f.postDetail === 'hazard') {
              ctx.fillStyle = f.detailColor;
              ctx.fillRect(px - halfW, py - pH * 0.55, pW, 3);
            } else if (f.postDetail === 'soviet') {
              ctx.fillStyle = f.detailColor;
              ctx.beginPath();
              ctx.arc(px, py - pH - 2, 2, 0, Math.PI * 2);
              ctx.fill();
            } else if (f.postDetail === 'spear') {
              ctx.fillStyle = f.detailColor;
              ctx.beginPath();
              ctx.moveTo(px, py - pH - 4);
              ctx.lineTo(px - halfW, py - pH);
              ctx.lineTo(px + halfW, py - pH);
              ctx.closePath();
              ctx.fill();
            } else if (f.postDetail === 'chitin') {
              ctx.fillStyle = f.detailColor;
              ctx.beginPath();
              ctx.moveTo(px, py - pH - 5);
              ctx.lineTo(px - halfW - 1, py - pH);
              ctx.lineTo(px, py - pH + 2);
              ctx.closePath();
              ctx.fill();
            } else if (f.postDetail === 'rune') {
              ctx.fillStyle = f.detailColor;
              ctx.fillRect(px - 1.5, py - pH * 0.65, 3, 3);
            }
          };

          for (let i = 0; i < fencePts.length - 1; i++) {
            const p0 = fencePts[i];
            const p1 = fencePts[i + 1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const segLen = Math.hypot(dx, dy);

            // 角點固定放一根樁柱
            drawPostAt(p0.x - cam.x, p0.y - cam.y);

            // 線段中間均勻分佈樁柱
            const count = Math.max(0, Math.floor(segLen / step) - 1);
            if (count > 0) {
              const actualStep = segLen / (count + 1);
              const ux = dx / segLen;
              const uy = dy / segLen;
              for (let k = 1; k <= count; k++) {
                const d = k * actualStep;
                drawPostAt(p0.x + ux * d - cam.x, p0.y + uy * d - cam.y);
              }
            }

            // 最後一段的末端樁柱
            if (i === fencePts.length - 2) {
              drawPostAt(p1.x - cam.x, p1.y - cam.y);
            }
          }

          // 2. 繪製橫向連續護欄／雙層原木／鋼纜／能量束
          for (let rIdx = 0; rIdx < f.railColors.length; rIdx++) {
            const rColor = f.railColors[rIdx];
            const rOffY = f.railOffsets[rIdx] || 0;
            const rWidth = f.railWidths[rIdx] || 2;

            ctx.beginPath();
            fencePts.forEach((p, idx) => {
              const rx = p.x - cam.x;
              const ry = p.y - cam.y + rOffY;
              idx === 0 ? ctx.moveTo(rx, ry) : ctx.lineTo(rx, ry);
            });
            ctx.strokeStyle = rColor;
            ctx.lineWidth = rWidth;
            ctx.stroke();
          }
        };

        renderFenceLine(leftFence);
        renderFenceLine(rightFence);
      }
    }
    ctx.restore();
  }

  // 主題流向引導線：唯一每幀都要重畫的路面元素（虛線位移 = 怪物行進方向）
  paintFlow(ctx, cam) {
    const style = TD_PATH_STYLES[this.level.id] || TD_PATH_STYLES.td_canyon;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const path of this.paths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      path.forEach(([x, y], i) => (i ? ctx.lineTo(x - cam.x, y - cam.y) : ctx.moveTo(x - cam.x, y - cam.y)));
      ctx.setLineDash(style.flowDash || [14, 26]);
      ctx.lineDashOffset = -this.game.gameTime * (style.flowSpeed || 32);
      ctx.strokeStyle = style.flow;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // 動態疊加層：巢穴貼圖（會隨出怪換格）／門牌、主堡方向指示、下一波入口預告
  paintDynamicOverlay(ctx, cam) {
    const w = this.level.pathWidth;
    // 巢穴（或門牌）在所有路面之後畫，別條路不會蓋到它
    for (const path of this.level.paths) {
      const { x: gx, y: gy } = this.entranceMark(path);
      if (this.drawLair(ctx, gx - cam.x, gy - cam.y)) continue;   // 有巢穴貼圖就不畫門牌
      ctx.fillStyle = 'rgba(255,60,80,0.35)';
      ctx.beginPath();
      ctx.arc(gx - cam.x, gy - cam.y, w * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚪', gx - cam.x, gy - cam.y);
    }
    drawHeroTarget(this.game, ctx, cam);
    // 休息時：下一波會從哪些入口來、各來幾隻（脈動紅圈＋數字）
    const info = this.nextWaveInfo();
    if (info) {
      const beat = 0.5 + 0.5 * Math.sin(this.game.gameTime * 5);
      this.level.paths.forEach((path, i) => {
        if (!info.entrances[i]) return;
        const m = this.entranceMark(path);
        const x = m.x - cam.x;
        const y = m.y - cam.y;
        ctx.strokeStyle = `rgba(255,70,90,${0.5 + 0.4 * beat})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, w * 0.6 + 8 + beat * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        const label = `×${info.entrances[i]}`;
        // 數字再往地圖內側放一格，不要壓在紅圈上
        const lx = x + m.ix * (w * 0.6 + 40);
        const ly = y + m.iy * (w * 0.6 + 40);
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#ff6b7a';
        ctx.fillText(label, lx, ly);
      });
    }
  }
}
