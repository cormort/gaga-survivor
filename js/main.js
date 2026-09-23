// 嘎嘎特攻 (Gaga Survivor) - 遊戲核心主循環與遊戲狀態機

import {
  GAME_CONFIG,
  ENEMY_TYPES,
  WEAPONS,
  FX,
  CHARGE,
  CONSUMABLE_ITEMS,
  WEAPON_ASPECTS,
  BOMB_TUNING,
} from './config.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { EnemyProjectile } from './entities/EnemyProjectile.js';
import { DropItem } from './entities/DropItem.js';
import { MERC } from './entities/Mercenary.js';


import { InputController } from './input.js';
import { WeaponManager } from './weapons/WeaponManager.js';
import { Spawner, MAX_ENEMIES as SPAWNER_MAX_ENEMIES } from './systems/Spawner.js';
import { ParticleSystem, MAX_PARTICLES } from './systems/ParticleSystem.js';
import { UIManager } from './systems/UI.js';
import { sound } from './audio.js';
import { CHARACTERS } from './characters.js';
import {
  LEVELS,
  LEVEL_ORDER,
  currentWave,
  pickEnemy,
  enemyScale,
  mergeRules,
  getDailyChallenge,
  DIFFICULTIES,
} from './levels.js';
import { save } from './save.js';
import { drawDecor } from './systems/Decor.js';
import { GroundRenderer } from './systems/Ground.js';
import {
  initExplodableProps,
  initDestructibles,
  spawnSingleDestructible,
  dropCrateLoot,
  updateHazards,
  drawExplodableProps,
  drawHazards,
  triggerPropExplosion,
  placeHazard,
} from './systems/Hazards.js';
import {
  checkMilestones,
  tickBlessingEffects,
  endMiniEvent,
  checkSynergies,
  checkAchievements,
  objectiveText,
  shuffleInPlace,
  buildEventSchedule,
} from './systems/Progression.js';
import {
  getFacilityCost,
  updateFacilityHUD,
  grantStarterTurret,
  updateTurrets,
  tryUpgradeNearestTurret,
  updateMercenaries,
  facilityGoldMul,
} from './systems/Facilities.js';
import {
  checkMerchantSchedule,
  updateMerchant,
  dismissMerchant,
  drawMerchant,
} from './systems/Merchant.js';
import { bindEvents, returnToMenu } from './systems/Menu.js';
import { metaBonuses, upgradeKeyOf, charLevelBonuses } from './meta.js';
import { SHOP_BOOSTERS } from './shop.js';
import {
  rollItem,
  rollRarity,
  itemLevelFor,
  itemName,
  gearBonuses,
  salvageValue,
  RARITIES,
} from './items.js';
import { MODES, getMode } from './modes.js';
import { Core } from './entities/Core.js';


// 孵化/裂解用的上限：比 Spawner 的 MAX_ENEMIES 低 10 隻，留給波次生成的餘裕，
// 否則自我增殖的怪會把名額吃光、後續波次的新怪種再也進不來。
// 兩邊過去各寫一個數字 (240 / 250) 且沒說明關係，改為從同一個來源推導。
const HATCH_ENEMY_CAP = SPAWNER_MAX_ENEMIES - 10;
// 核心外圈實際擠得下的同時攻擊數 (半徑 46 的六角形一圈約十幾隻)
// 不會過期的掉落物 (裝備/寶箱/消費道具/補給) 在場上的數量上限
const NON_EXPIRING_DROP_CAP = 15;

// 兩次精英擊殺頓格之間的最小間隔 (秒)
const ELITE_HITSTOP_GAP = 0.5;

// 局內待回收裝備的上限，超出的自動分解成金幣 (原本無上限，實測 23 分鐘累積數百件)
const PENDING_GEAR_CAP = 40;

const POCKET_STACK = 2; // 口袋每格同款道具的堆疊上限

// 道具自動使用的觸發條件 (c = autoUseContext())。說明文字在 config.js 的 CONSUMABLE_ITEMS[].auto
const AUTO_USE = {
  potion:        (c) => c.hp < 0.45,
  elixir:        (c) => c.hp < 0.30,
  shield_potion: (c) => c.hp < 0.60 && (c.near220 >= 8 || c.bossNear),
  stopwatch:     (c) => (c.hp < 0.35 && c.near260 >= 6) || c.bullets >= 6,
  holy_water:    (c) => c.near260 >= 12 || (c.hp < 0.4 && c.near260 >= 5),
  atk_potion:    (c) => c.bossNear || c.near400 >= 25,
  manna_prism:   (c) => c.bossNear || c.near400 >= 25,
  luck_potion:   (c) => c.near500 >= 15,
  magic_ticket:  (c) => c.drops >= 25,
};

// ── 自適應解析度 (DPR) ─────────────────────────────────────────
// 為什麼需要：原本畫布解析度寫死 `Math.min(devicePixelRatio, 1.5)`，而現在的手機
// dpr 普遍是 2.75~3 —— 等於只以 1.5× 算圖再被瀏覽器放大約 2 倍，材質細節全部被
// 抹掉（DOM 的 HUD 卻是銳利的，對比之下更明顯）。這個上限原本是為了舊機／軟體
// 渲染的安全值，但對所有裝置一視同仁。
//
// 改成階梯：起始取裝置 dpr 與 2 之間的最高階（細節看得出來），真的跟不上時
// 自動往下退。判斷用的是「update + render 的實測耗時」而不是幀距 —— 有 vsync 時
// 幀距永遠是 16.7ms，量不出真正的餘裕。
const DPR_STEPS = [1, 1.25, 1.5, 2];
const DPR_MAX = 2;            // 上限（2× 以上的邊際效益低、填充率卻是平方成長）
const DPR_SAMPLE = 30;        // 每 30 幀（約 0.5 秒）結算一次平均
const DPR_DOWN_MS = 12;       // 平均 update+render 超過這個值 → 降一階
const DPR_UP_MS = 7;          // 降階後若長期低於這個值 → 升回一階（滯後避免震盪）
const DPR_UP_STREAK = 4;      // 連續幾次結算都很快才升階

// 掉落物堆積到這個數量後，未進入拾取半徑的也開始緩慢飄向玩家
const DRIFT_THRESHOLD = 40;
const DRIFT_SPEED = 55;        // px/s


const CORE_MAX_ATTACKERS = 16;

// #rrggbb + alpha → rgba() 字串 (地形機制的半透明渲染用)

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // 狀態機: 'START', 'PLAYING', 'LEVEL_UP', 'PAUSED', 'GAME_OVER', 'CHEST_MODAL', 'BLESSING_MODAL', 'MERCHANT_MODAL'
    this.state = 'START';

    this.input = new InputController();
    save.load();
    this.characterId = CHARACTERS[save.data.character] ? save.data.character : 'duck';
    this.modeId = MODES[save.data.mode] ? save.data.mode : 'survivor';
    this.mode = getMode(this.modeId);
    this.levelId = save.isUnlocked(save.data.lastLevel, this.modeId) ? save.data.lastLevel : 'street';
    this.core = null;
    this.player = new Player(0, 0, this.characterId);
    this.player.game = this;
    this.weaponManager = new WeaponManager(this.player);
    // 武器系統也要能呼叫回遊戲層 (宙斯連鎖閃電 game.chainShock、商人臨時增益
    // 在被動重算後補回)。先前只設了 player.game，WeaponManager 自己讀的
    // this.game 永遠是 null，於是 `this.game?.chainShock(...)` 靜默不執行 ——
    // 宙斯型態的連鎖電弧從來沒有生效過。
    this.weaponManager.game = this;
    this.spawner = new Spawner();
    this.particles = new ParticleSystem();
    this.ground = new GroundRenderer();
    this.ui = new UIManager();

    // 實體清單
    this.enemies = [];
    this._pendingSpawns = [];
    this.enemyProjectiles = [];
    this.dropItems = [];
    this.pendingLevelUps = 0;
    this._levelUpHold = 0;
    this.turrets = [];
    this.selectedFacility = 'turret';
    this.mercenaries = [];
    this.decals = []; // 地面殘跡 (血漬/焦痕)
    this.destructibles = []; // 街頭可破壞物件 (木箱/補給油桶)

    // 遊戲性增強系統狀態
    this.hitstopTimer = 0;
    this.redFlash = 0; // Boss 大招紅閃
    this.combo = 0;
    this.comboTimer = 0;
    this.frenzyTimer = 0;
    this.explodableProps = [];
    this.extractionWell = null;
    this.isDaily = false;
    this.dailyConfig = null;

    // 地形機制 (毒霧/地雷/噴發) 與里程碑排程
    this.hazards = [];
    this._mechTimers = {};
    this._shrinkCircle = null;
    this.killMilestoneAt = 100;
    this.timeMilestoneAt = 120;
    this._milestoneIdx = 0; // 里程碑輪播計數 (偶數=舊獎勵, 奇數=祝福)

    // ── 新系統狀態 ──
    this.blessings = [];           // 本局已獲得的祝福 [{id, name, icon}]
    this._pendingBlessings = [];   // 因彈窗衝突而延後的祝福 (回到 PLAYING 再補發)
    this.activeEvent = null;       // 當前進行中的局內事件
    this._eventSchedule = [];      // 預排的事件觸發時間
    this._eventBag = [];           // 事件洗牌袋 (抽完一輪才重置)
    this._recycleTally = 0;        // 累積待提示的回收金幣
    this._lastEliteHitstop = -99;  // 上次精英擊殺頓格的遊戲時間 (未觸發過)
    this._buildHintShown = false;  // 守塔建造引導只提示一次
    this._eventIdx = 0;
    this.activeSynergies = [];     // 當前生效的武器協同 [{id, name, icon}]
    this.merchant = null;          // 當前場上的商人 {x, y, timer, items}
    this._merchantTimer = 0;
    this._merchantBuys = 0;
    this._maxCombo = 0;
    this._damageTaken = 0;
    this._lastHit = null;
    this._dmgBySource = {};
    this._chestsOpened = 0;
    this._evosThisRun = 0;
    this._goldRushTimer = 0;       // 淘金狂潮特殊卡的計時
    this._tempBuffs = [];          // 商人臨時增益 [{id, timer, revert, reapply}]
    this._settled = false;         // 本局是否已結算 (防止重複入帳)
    this._timeStopTimer = 0;       // 時停懷錶：敵方子彈凍結剩餘秒數
    this._settling = false;        // 結算進行中 (防止遞迴)

    // 統計數據
    this.gameTime = 0;
    this.kills = 0;
    this.gold = 0;
    this.boss = null;

    // 局內金幣 reroll：升級三選一花錢重抽；幸運加成天賦放大金幣收入
    this.rerollCost = 60;
    this.metaGoldMul = 1;
    this._shownUpgradeKeys = [];

    // 相機與視差平移
    this.camera = {
      x: 0,
      y: 0,
      shake: 0,
    };

    this.lastTime = performance.now();
    this.perf = this.initPerfHUD();

    this.initWindow();
    bindEvents(this);
    this.loop = this.loop.bind(this);

    requestAnimationFrame(this.loop);
  }

  // 新的一局要從乾淨狀態開始。不清的話，玩家踩過一次例外之後，之後每一局的
  // 效能面板都掛著舊的「✖ 每幀例外 ×N」與舊訊息，紅色告示也一直留在畫面上。
  clearFrameErrors() {
    this.frameError = null;
    this.frameErrorCount = 0;
    this.frameErrorStreak = 0;
    this._fatalEl?.remove();
    this._fatalEl = null;
    // 頓格事件數與最小間隔是「整局」的統計，不跟著新局歸零就會累積到看不懂
    if (this.perf) {
      this.perf.hitstopEvents = 0;
      this.perf.lastHitstopAt = -99;
      this.perf.minHitstopGap = Infinity;
    }
  }

  // 遊戲迴圈連續拋例外時的告示。本身必須絕對安全 —— 它跑在 catch 裡，
  // 若自己再拋一次就會沖出 loop()，連 rAF 鏈都一起弄死。
  showFatalError(err) {
    try {
      if (this._fatalEl) return;
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:99999;' +
        'background:rgba(30,0,8,0.94);border-top:2px solid #ff0055;color:#ffd9e2;' +
        'font:12px/1.6 ui-monospace,monospace;padding:12px 14px;white-space:pre-wrap;' +
        'word-break:break-all;max-height:45vh;overflow:auto;';
      const where = String(err?.stack || '').split('\n')[1]?.trim() || '';
      box.textContent = '⚠️ 遊戲發生錯誤，畫面已停止更新\n' +
        `${err?.message || err}\n${where}\n`;
      const btn = document.createElement('button');
      btn.textContent = '重新載入';
      btn.style.cssText = 'margin-top:10px;padding:8px 18px;font:inherit;font-size:13px;' +
        'background:#ff0055;color:#fff;border:0;border-radius:6px;';
      btn.onclick = () => location.reload();
      box.appendChild(btn);
      document.body.appendChild(box);
      this._fatalEl = box;
    } catch (_) { /* 告示都掛了就算了，至少別再往上炸 */ }
  }

  // 網址加 ?perf=1 才建立效能面板；沒開就回傳 null，正常遊玩零成本。
  initPerfHUD() {
    if (!new URLSearchParams(location.search).has('perf')) return null;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;pointer-events:none;' +
      'font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap;color:#00f59b;' +
      'max-width:100vw;box-sizing:border-box;word-break:break-all;' +
      'background:rgba(0,0,0,0.72);padding:6px 9px;border-bottom-right-radius:8px;';
    document.body.appendChild(el);
    return { el, frames: [], update: 0, render: 0, ticks: 0, last: 0,
             hitstopFrames: 0, pausedFrames: 0,
             hitstopEvents: 0, lastHitstopAt: -99, minHitstopGap: Infinity };
  }

  // 效能面板：網址加 ?perf=1 開啟。卡頓時直接截圖就看得出是哪一項爆掉。
  // 每 250ms 才寫一次 DOM，本身的成本可忽略。
  drawPerfHUD(now) {
    const pf = this.perf;
    if (now - pf.last < 250) return;
    pf.last = now;

    const f = pf.frames.sort((a, b) => a - b);
    const med = f.length ? f[f.length >> 1] : 0;
    const worst = f.length ? f[f.length - 1] : 0;
    const ticks = pf.ticks || 1;
    const n = (arr) => arr?.length ?? 0;   // 開始畫面時部分系統尚未建立

    // 這一段窗期內，有多少幀「畫得出來但世界沒在動」
    const total = f.length || 1;
    const frozen = Math.round((pf.hitstopFrames + pf.pausedFrames) / total * 100);

    pf.el.textContent = [
      `${(1000 / (med || 1)).toFixed(0)} fps   幀 ${med.toFixed(1)} / 最差 ${worst.toFixed(0)} ms`,
      `update ${(pf.update / ticks).toFixed(2)}  render ${(pf.render / ticks).toFixed(2)} ms  跑${pf.ticks}幀`,
      `凍結 ${frozen}%  (頓格${pf.hitstopFrames}幀/${pf.hitstopEvents}次 暫停${pf.pausedFrames})`,
      `頓格最小間隔 ${pf.minHitstopGap === Infinity ? '—' : pf.minHitstopGap.toFixed(2) + 's'}  hs ${this.hitstopTimer.toFixed(2)}`,
      `敵 ${n(this.enemies)}  投射 ${n(this.weaponManager?.projectiles)}  敵彈 ${n(this.enemyProjectiles)}`,
      `掉落 ${n(this.dropItems)}  粒子 ${n(this.particles?.particles)}  殘跡 ${n(this.decals)}`,
      `砲塔 ${n(this.turrets)}  傭兵 ${n(this.mercenaries)}  待升級 ${this.pendingLevelUps}`,
      `狀態 ${this.state}`,
      ...(this.frameErrorCount ? [
        `\n✖ 每幀例外 ×${this.frameErrorCount}`,
        `${this.frameError?.message || this.frameError}`,
        `${String(this.frameError?.stack || '').split('\n')[1]?.trim() || ''}`,
      ] : []),
    ].join('\n');

    pf.frames.length = 0;
    pf.update = 0;
    pf.render = 0;
    pf.ticks = 0;
    pf.hitstopFrames = 0;
    pf.pausedFrames = 0;
    // hitstopEvents / minHitstopGap 刻意不重設 —— 那是整局的統計，
    // 每 250ms 歸零就又變回受幀率影響的量了
  }

  initWindow() {
    const resize = () => {
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;
      this._applyCanvasSize();
    };
    window.addEventListener('resize', resize);

    // 可用階梯 = 裝置 dpr 與 DPR_MAX 之間的所有階（例：dpr 3 → [1, 1.25, 1.5, 2]）。
    // ?dpr=N 可強制指定並鎖定（測試與效能對照用，不會被自動調整）。
    const override = new URLSearchParams(location.search).get('dpr');
    const device = Math.max(1, Math.min(DPR_MAX, window.devicePixelRatio || 1));
    if (override !== null && !Number.isNaN(parseFloat(override))) {
      this._dprSteps = [Math.max(1, Math.min(DPR_MAX, parseFloat(override)))];
      this._dprLocked = true;
    } else {
      this._dprSteps = DPR_STEPS.filter((v) => v <= device);
      if (this._dprSteps.length === 0) this._dprSteps = [1];
    }
    this._dprIdx = this._dprSteps.length - 1;   // 起始取最高階
    resize();
  }

  // 依目前階梯套用畫布解析度（vw/vh 是邏輯像素，畫布乘上 dpr）
  _applyCanvasSize() {
    const dpr = this._dprSteps[this._dprIdx];
    this.dpr = dpr;
    this.canvas.width = Math.round(this.vw * dpr);
    this.canvas.height = Math.round(this.vh * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 暫停/結算中改變解析度時補畫一幀，避免畫布留白
    if (this.player && this.state !== 'PLAYING') this.render();
  }

  // 累積每幀的 update+render 耗時，每 DPR_SAMPLE 幀結算一次
  _trackFrame(ms) {
    this._dprAcc = (this._dprAcc || 0) + ms;
    this._dprN = (this._dprN || 0) + 1;
    if (this._dprN < DPR_SAMPLE) return;
    const avg = this._dprAcc / this._dprN;
    this._dprAcc = 0;
    this._dprN = 0;
    this._adaptDpr(avg);
  }

  // 真的跟不上就降階；降階後長期有餘裕才升回（升階要連續 DPR_UP_STREAK 次）
  _adaptDpr(avgMs) {
    // 最後一階：解析度已到底 (或裝置本來就 1×) 仍然太慢 → 粒子上限減半；有餘裕就先恢復粒子
    const ps = this.particles;
    if (ps && !this._dprLocked && this._dprIdx === 0) {
      if (avgMs > DPR_DOWN_MS && ps.cap === MAX_PARTICLES) {
        ps.cap = MAX_PARTICLES / 2;
        return;
      }
      if (avgMs < DPR_UP_MS && ps.cap !== MAX_PARTICLES) {
        ps.cap = MAX_PARTICLES;
        return;
      }
    }
    const steps = this._dprSteps;
    if (!steps || this._dprLocked || steps.length <= 1) return;
    if (avgMs > DPR_DOWN_MS && this._dprIdx > 0) {
      this._dprIdx--;
      this._dprFastStreak = 0;
      this._applyCanvasSize();
      return;
    }
    if (avgMs < DPR_UP_MS && this._dprIdx < steps.length - 1) {
      this._dprFastStreak = (this._dprFastStreak || 0) + 1;
      if (this._dprFastStreak >= DPR_UP_STREAK) {
        this._dprFastStreak = 0;
        this._dprIdx++;
        this._applyCanvasSize();
      }
    } else {
      this._dprFastStreak = 0;
    }
  }


  // 戰術閃避翻滾
  triggerDash() {
    if (this.state !== 'PLAYING' || !this.player) return;
    if (this.player.dash(this.input.vector)) {
      this.camera.shake = Math.max(this.camera.shake, 4);
      this.ui.updateDash(this.player.dashMaxTimer ? this.player.dashTimer / this.player.dashMaxTimer : 0);
    }
  }

  // 砲塔專精進化 (消耗 50 金幣)

  // 僱傭傭兵 (局內金幣消耗；最多 MERC.maxCount 名，費用隨人數成長)

  get mercCost() {
    const n = this.mercenaries.length;
    return n >= MERC.maxCount ? null : MERC.baseCost + MERC.costGrowth * n;
  }

  // 傭兵 AI 更新：跟隨/索敵開火 + 被敵人啃食；陣亡清掉

  // 啟動每日挑戰。固定跑生存者模式 —— 每日挑戰的賣點是「同一天所有人條件一致」，
  // 讓它跟著當前選的模式跑就破功了。

  // 實際生效的金幣乘數 (夾在上限內)。metaGoldMul 本身不夾 —— 淘金潮是 ×2 後再 ÷2
  // 還原，先夾住會把還原算錯。

  // 打擊微頓挫 (Hitstop)
  triggerHitstop(duration = 0.05) {
    this.hitstopTimer = Math.max(this.hitstopTimer, duration);
    if (this.perf) {
      // 面板原本只數「頓格幀數」，但一次 0.08 秒的 Boss 頓格在 10fps 下就佔 5 幀，
      // 看起來像五次精英頓格洗版。改為同時記錄事件數與最小間隔 —— 這兩個量與
      // 幀率無關，才分得出「偶爾一次」和「洗版」。
      const gap = this.gameTime - this.perf.lastHitstopAt;
      if (this.perf.hitstopEvents > 0) {
        this.perf.minHitstopGap = Math.min(this.perf.minHitstopGap, gap);
      }
      this.perf.hitstopEvents++;
      this.perf.lastHitstopAt = this.gameTime;
    }
  }

  // 連擊計算與狂潮觸發
  addCombo() {
    this.combo++;
    this.comboTimer = 3.6;
    this._maxCombo = Math.max(this._maxCombo, this.combo);
    if (this.combo === 30 || (this.combo > 30 && (this.combo - 30) % 25 === 0)) {
      this.frenzyTimer = 7.5;
      sound.playEvoFanfare();
      this.particles.createShockwave(this.player.x, this.player.y, 160, '#00e5ff');
      this.ui.say('🔥 連擊狂潮！急速射擊！', '#00e5ff', 2.2);
    }
    this.ui.updateCombo(this.combo, this.frenzyTimer > 0);
  }

  // 初始化全圖可引爆場景物件

  // 引爆場景油桶/載具

  // ── 惡魔城式地圖街頭可破壞物件 (木箱/補給油桶) ──



  // ── 惡魔城式 9 大經典戰術消費道具效果啟動 ──
  activateConsumable(id) {
    if (!this.player || this.player.isDead) return;
    const cDef = CONSUMABLE_ITEMS[id];
    if (!cDef) return;

    switch (id) {
      case 'potion': {
        // 比例回血：固定 80 在後期 (天賦/裝備堆高最大生命) 只剩一小口
        const amt = Math.max(cDef.value, Math.round(this.player.maxHp * 0.35));
        this.player.heal(amt);
        sound.playGem();
        this.particles.createShockwave(this.player.x, this.player.y, 110, '#ff3366');
        this.particles.createDamageText(this.player.x, this.player.y, `+${amt} HP`, false);
        this.ui.say(`🍷 恢復藥水：生命恢復 +${amt}！`, '#ff3366', 2.0);
        break;
      }

      case 'elixir':
        this.player.heal(this.player.maxHp);
        this.player.shield = Math.max(this.player.shield, this.player.maxShield || 100);
        sound.playEvoFanfare();
        this.particles.createShockwave(this.player.x, this.player.y, 160, '#ffd700');
        this.particles.createDamageText(this.player.x, this.player.y, 'FULL RESTORE!', false);
        this.ui.say('✨ 高級萬靈藥：HP 與護盾全滿！', '#ffd700', 3.0);
        break;

      case 'atk_potion':
        this.player.atkPotionTimer = Math.max(this.player.atkPotionTimer, cDef.duration || 15);
        sound.playEvoFanfare();
        this.particles.createShockwave(this.player.x, this.player.y, 130, '#ff4d4d');
        this.ui.say('⚔️ 力量藥水：15 秒內攻擊力 +40%！', '#ff4d4d', 2.5);
        break;

      case 'shield_potion':
        this.player.shieldPotionTimer = Math.max(this.player.shieldPotionTimer, cDef.duration || 15);
        sound.playEvoFanfare();
        this.particles.createShockwave(this.player.x, this.player.y, 130, '#4da6ff');
        this.ui.say('🛡️ 鐵壁藥水：15 秒內受傷減免 50%！', '#4da6ff', 2.5);
        break;

      case 'luck_potion':
        this.player.luckPotionTimer = Math.max(this.player.luckPotionTimer, cDef.duration || 20);
        sound.playEvoFanfare();
        this.particles.createShockwave(this.player.x, this.player.y, 130, '#33ff99');
        this.ui.say('🍀 幸運藥水：20 秒暴擊率 +25% & 金幣加倍！', '#33ff99', 2.5);
        break;

      case 'stopwatch': {
        // 秒數改讀資料表 (原本硬寫 5.0，與表上的 3.5 不符)，並且真的把敵方子彈
        // 一起停住 —— 說明與 README 都寫了「與敵方子彈」，但先前只暈敵人。
        const dur = cDef.duration || 5;
        sound.playExplosion();
        this.camera.shake = Math.max(this.camera.shake, 10);
        this.particles.createShockwave(this.player.x, this.player.y, 280, '#00ffff');
        for (const e of this.enemies) {
          e.applyStun(dur);
        }
        this._timeStopTimer = dur;
        this.ui.say(`⏱️ 時停懷錶：全場時間凍結 ${dur} 秒！`, '#00ffff', 3.0);
        break;
      }

      case 'holy_water': {
        // 傷害跟雜兵血量曲線走：固定 260 在 8 分鐘 (血量 ×8) 之後連一隻步兵都清不掉
        const dmg = Math.round(cDef.value * enemyScale(this.gameTime, this.level, this.rules).hp);
        sound.playExplosion();
        this.camera.shake = Math.max(this.camera.shake, 12);
        this.particles.createExplosion(this.player.x, this.player.y, 240, true);
        this.particles.createShockwave(this.player.x, this.player.y, 250, '#b3ecff');
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
          if (d <= 240 + e.radius) {
            e.takeDamage(dmg, 12, this.player.x, this.player.y);
            this.particles.createDamageText(e.x, e.y, dmg, true);
          }
        }
        this.ui.say('🍶 聖水淨化：惡靈全數退散！', '#b3ecff', 2.5);
        break;
      }

      case 'manna_prism':
        sound.playEvoFanfare();
        this.particles.createShockwave(this.player.x, this.player.y, 200, '#d966ff');
        // 冷卻是存在每把武器自己的 cooldownTimer 上，WeaponManager 沒有 cooldowns
        // 這個 Map —— 原本的 cooldowns.clear() 必定拋 TypeError，而這裡跑在
        // update() 的 try/catch 內，一炸就整局凍結 (畫面停住、音效照常)。
        for (const w of this.weaponManager.weapons.values()) w.cooldownTimer = 0;
        this.player.dashTimer = 0;
        this.ui.say('💎 曼納稜晶：全武裝冷卻歸零，立即重置！', '#d966ff', 2.5);
        break;

      case 'magic_ticket': {
        sound.playGem();
        sound.playEvoFanfare();
        for (const d of this.dropItems) {
          d.isAttracted = true;
        }
        const gold = Math.round((cDef.value + (this.gameTime / 60) * 25) * facilityGoldMul(this)); // 每分鐘 +25
        this.gold += gold;
        this.particles.createShockwave(this.player.x, this.player.y, 220, '#ffcc00');
        this.particles.createDamageText(this.player.x, this.player.y, `+${gold} 🪙`, false);
        this.ui.say(`🎫 魔法門票：全圖寶石磁吸 + ${gold} 🪙！`, '#ffcc00', 2.5);
        break;
      }
    }
  }

  // 道具自動使用：每 0.25 秒檢查一次口袋道具的觸發條件 (條件說明寫在 CONSUMABLE_ITEMS[].auto)。
  // 用過之後冷卻 1.5 秒，避免同款兩瓶在同一個危機裡連灌。
  updateAutoPocket(dt) {
    const p = this.player;
    if (!p.pockets.some(Boolean) || save.data.settings.autoPocket === false) return;
    this._autoPocketTimer = (this._autoPocketTimer || 0) - dt;
    if (this._autoPocketTimer > 0) return;
    this._autoPocketTimer = 0.25;
    const ctx = this.autoUseContext();
    // 兩格都符合時先用第 1 格；一次只用一個，下一個等冷卻結束再判斷
    const slot = p.pockets.findIndex((s) => s && AUTO_USE[s.id]?.(ctx));
    if (slot >= 0) {
      this.usePocketItem(slot);
      this._autoPocketTimer = 1.5;
    }
  }

  // ponytail: 每次檢查掃一遍全場敵人 (0.25 秒一次、最多 250 隻)，不必動用碰撞網格
  autoUseContext() {
    const p = this.player;
    let near220 = 0, near260 = 0, near400 = 0, near500 = 0, bossNear = false;
    for (const e of this.enemies) {
      if (e.isDead) continue;
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (e.isBoss && d2 < 600 * 600) bossNear = true;
      if (d2 < 500 * 500) near500++; else continue;
      if (d2 < 400 * 400) near400++;
      if (d2 < 260 * 260) near260++;
      if (d2 < 220 * 220) near220++;
    }
    let bullets = 0;
    for (const b of this.enemyProjectiles) if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 200 * 200) bullets++;
    return { hp: p.hp / p.maxHp, near220, near260, near400, near500, bossNear, bullets, drops: this.dropItems.length };
  }

  usePocketItem(slot = 0) {
    if (this.state !== 'PLAYING' || !this.player || this.player.isDead) return;
    const pockets = this.player.pockets;
    const s = pockets[slot];
    if (!s) return;

    this.activateConsumable(s.id);
    s.count--;
    if (s.count <= 0) pockets[slot] = null;
    this.ui.updatePockets(pockets);
  }

  // 拾取幸運補給箱抽獎
  openLuckyChest() {
    this._chestsOpened++;
    this.state = 'CHEST_MODAL';
    sound.pauseBGM();
    sound.playEvoFanfare();

    const roll = Math.random();
    const count = roll < 0.2 ? 1 : roll < 0.85 ? 3 : 5;

    const rewardPool = [
      { name: '金幣大獎', desc: '+120 🪙 戰備金', icon: '🪙', isGold: true, apply: () => { this.gold += Math.round(120 * facilityGoldMul(this)); } },
      { name: '急救補給包', desc: '+45 HP 治療', icon: '🩹', apply: () => { this.player.heal(45); } },
      { name: '超導磁石', desc: '瞬間吸收全圖寶石', icon: '🧲', apply: () => { for (const d of this.dropItems) d.isAttracted = true; } },
      { name: '基因碎片', desc: '+35 🧬 密鑰', icon: '🧬', apply: () => { save.data.dna += 35; save.flush(); } },
      { name: '全頻震盪波', desc: '全螢幕重創（非首領 60% 當前生命）', icon: '💣', apply: () => {
        // 與掉落物／核彈卡／里程碑共用 BOMB_TUNING，不再是一擊抹除
        for (const e of this.enemies) {
          if (!e.isBoss) {
            const dmg = Math.max(BOMB_TUNING.fieldDamageMin, e.hp * BOMB_TUNING.fieldDamageRatio);
            e.takeDamage(dmg, BOMB_TUNING.knockback, this.player.x, this.player.y);
          } else {
            e.takeDamage(BOMB_TUNING.bossDamage, BOMB_TUNING.knockback, this.player.x, this.player.y);
          }
        }
      }},
    ];

    // 可升級的既有武器 (不含超武；level 已滿的也排除)
    const upgradeable = [];
    for (const [id, item] of this.weaponManager.weapons) {
      const def = WEAPONS[id];
      if (def && !item.isEvo && item.level < def.maxLevel) upgradeable.push(id);
    }
    if (upgradeable.length > 0) {
      rewardPool.push({
        name: '武器突變',
        desc: '隨機在場武器立即升級 +1',
        icon: '⚡',
        apply: () => {
          const wid = upgradeable[Math.floor(Math.random() * upgradeable.length)];
          this.weaponManager.upgradeWeapon(wid);
          this.ui.updateSkillSlots(this.weaponManager);
        }
      });
    }

    const pickedRewards = [];
    for (let i = 0; i < count; i++) {
      const rw = rewardPool[Math.floor(Math.random() * rewardPool.length)];
      pickedRewards.push(rw);
    }

    this.ui.showLuckyChest(count, pickedRewards, () => {
      for (const r of pickedRewards) {
        r.apply();
      }
      this.state = 'PLAYING';
      sound.resumeBGM();
      this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
      this.ui.updateBuildBtn(this.gold, this.turretCost);
      this.particles.createShockwave(this.player.x, this.player.y, 160, '#ffd60a');
    });
  }

  // 主選單特工卡 (含 DNA 解鎖與武器流派型態選擇)

  // 切模式：解鎖清單與最佳紀錄都依模式而分，所以要連帶重繪關卡卡片




  // 結算畫面 → 回主選單：清掉戰局殘留並重繪選單 (DNA 等資料已由 recordRun 更新)

  // 把局外天賦＋裝備加成套進這一局的玩家身上。
  //
  // 為什麼拆成「meta（跨局，每局唯一一次）」與「run（單局，每次被動重算都要重套）」：
  // 舊寫法把局外加成直接寫進 p.damageMultiplier / p.speedMultiplier / p.magnetMultiplier，
  // 6 行之後 applyPassives() 又把這幾個欄位從頭重算 —— 只因為 applyPassives 剛好記得
  // 讀回 metaDmg / baseSpeedMul / baseMagnet 才活著。這種「靠對方記得補回來」的耦合，
  // 每加一個欄位就會靜默失效一次。現在有了唯一的套用點 WeaponManager.applyPassives()：
  //   damageMultiplier = 1 + meta.dmg + 被動
  //   speedMultiplier  = 角色基礎 + meta.speed（再乘單局加成）
  //   cdrMultiplier    = 被動 × (1 - meta.cdr)…
  applyMetaTalents() {
    const t = metaBonuses(save.data.talents);
    const g = gearBonuses(save.data.stash, save.data.equipped);
    const c = charLevelBonuses(save.charLevel(this.characterId)); // 特工等級 (每位特工各自)
    // 角色的基礎移速／磁力先存成獨立欄位：applyPassives 每次都用它重算，
    // 所以 meta 加成不會在每次升級時被疊第二次。
    const p = this.player;
    p.runMuls = { speed: 1, magnet: 1 };
    p.meta = {
      dmg: t.dmg + g.dmg + c.dmg,
      hp: t.hp + g.hp + c.hp,
      speed: t.speed + g.speed,
      magnet: t.magnet + g.magnet,
      gold: t.gold + g.gold,
      cdr: g.cdr,
      crit: g.crit,
      critdmg: g.critdmg,
      armor: g.armor + c.armor,
      exp: g.exp,
    };
    // 傳奇特效的屬性加成（音速突進／引力漩渦／極限超頻）走另一桶：
    // 它們在引擎裡是加到最終倍率，不是加在角色基礎值上。收進 p.legendary 之後，
    // applyPassives 每次都能重算出相同結果 —— 舊寫法是直接改 speedMultiplier，
    // 然後被同一輪的 applyPassives 蓋掉（實測 speedMul 一直是 1.0）。
    p.legendary = { cdr: 0, speed: 0, magnet: 0, ...(g.legendary || {}) };
    this.gearEffects = g.effects || [];
    // 金幣乘數分兩層：metaGoldMul 是「局外＋模式」的常駐倍率，runGoldMul 放單局興奮劑。
    // 為什麼要分開：舊寫法把興奮劑直接乘進 metaGoldMul，而 applyMetaTalents 開局會用
    // 天賦重算這個欄位 —— 等於同一劑興奮劑乘了兩次，而且每次重算都會再乘一次。
    this.metaGoldMul = (1 + (p.meta.gold || 0)) * (this.mode ? this.mode.goldMul : 1);
    this.runGoldMul = 1;
    this.weaponManager.applyPassives();
  }

  // 單局加成（興奮劑、每日詞綴）：一律乘在這個倍率上，不直接改 baseSpeedMul，
  // 才不會在「升級 → applyPassives 重算」時被重置掉。
  applyRunMul(stat, mul) {
    const p = this.player;
    if (!p.runMuls) p.runMuls = { speed: 1, magnet: 1 };
    p.runMuls[stat] = (p.runMuls[stat] || 1) * mul;
  }

  start(isDaily = false) {
    this.isDaily = isDaily;
    this.dailyConfig = isDaily ? (this.dailyConfig || getDailyChallenge()) : null;

    sound.ensureContext();
    const activeLevelId = this.isDaily ? this.dailyConfig.levelKey : this.levelId;
    sound.startBGM(activeLevelId);

    this.level = LEVELS[activeLevelId] || LEVELS.street;
    // 關卡常駐規則 × 每日挑戰詞綴 → 合併成單一份係數，Spawner 與各注入點共用
    // 全域難度疊在關卡規則上；每日挑戰固定標準難度，成績才可比
    this.difficulty = (!this.isDaily && DIFFICULTIES[save.data.difficulty]) || DIFFICULTIES.normal;
    this.rules = mergeRules(this.level.rules, this.difficulty, ...(this.isDaily ? this.dailyConfig.modifiers : []));
    this.spawner.setLevel(activeLevelId, this.rules);
    this._eliteHeal = 0; // 每日「吸血盛宴」用，開局先清掉上一局的殘留

    // 模式：守塔在場中央生出基地核心，玩家開場站在核心下方讓出位置
    this.mode = getMode(this.modeId);
    this.core = this.mode.core ? new Core(this.mode.core) : null;
    const spawnY = this.core ? this.core.y + this.core.radius + 90 : 0;
    this.player = new Player(this.core ? this.core.x : 0, spawnY, this.characterId);
    this.player.game = this;
    this.weaponManager = new WeaponManager(this.player);
    // 武器系統也要能呼叫回遊戲層 (宙斯連鎖閃電 game.chainShock、商人臨時增益
    // 在被動重算後補回)。先前只設了 player.game，WeaponManager 自己讀的
    // this.game 永遠是 null，於是 `this.game?.chainShock(...)` 靜默不執行 ——
    // 宙斯型態的連鎖電弧從來沒有生效過。
    this.weaponManager.game = this;
    this.applyMetaTalents();
    this.player.modeDmgMul = this.mode.weaponMul;
    this.weaponManager.applyPassives();

    // 戰術興奮劑 (單局戰備加成) 注入套用
    // 只讀不消耗：真正扣除留到 handleGameOver，開局秒退/放棄才不會白白吃掉戰備
    const activeBoosters = [...(save.data.boosters || [])];
    if (activeBoosters.length > 0) {
      // 一律照 SHOP_BOOSTERS[id].effect 套用：先前這裡把 0.15 / 1.3 / 0.10 / 100 等數字
      // 各寫一份，黑市說明改了程式沒改就會變成「說明與實際不符」。
      // 同一種多劑時清單裡就有多筆，逐筆套用即為疊加（護盾也因此改成累加，不是覆寫）。
      const names = new Map();
      for (const bId of activeBoosters) {
        const booster = SHOP_BOOSTERS[bId];
        const eff = booster && booster.effect;
        if (!eff) continue;
        // 走 applyRunMul 而不是直接改 speedMultiplier / magnetMultiplier：
        // 那兩個欄位每次 applyPassives 都會從 base × runMuls 重算，直接改會在
        // 下一次升級時被抹掉（同一劑興奮劑只生效到第一次升級為止）。
        if (eff.speed) this.applyRunMul('speed', 1 + eff.speed);
        if (eff.pierce) this.player.bonusPierce = (this.player.bonusPierce || 0) + eff.pierce;
        if (eff.magnet) this.applyRunMul('magnet', 1 + eff.magnet);
        if (eff.gold) this.runGoldMul = (this.runGoldMul || 1) * eff.gold;
        // 也走局內層：metaCrit / metaCritDmg 是「永久層＋局內層」的總和，
        // 直接寫進總和會在升級重算時被歸零（與祝福同一類問題）。
        if (eff.crit) this.player.blessing.crit += eff.crit;
        if (eff.critDmg) this.player.blessing.critDmg += eff.critDmg;
        // 注意：這裡刻意「不」寫 speedMultiplier / magnetMultiplier / metaGoldMul。
        // 那三個欄位在開局時已經由 applyMetaTalents 依天賦重算過一次，直接在這裡
        // 累加會變成乘兩次；移速／磁力改走 applyRunMul（見上），金幣走 runGoldMul。
        if (eff.shield) {
          this.player.shield = (this.player.shield || 0) + eff.shield;
          this.player.maxShield = Math.max(this.player.maxShield || 0, this.player.shield);
        }
        names.set(booster.name, (names.get(booster.name) || 0) + 1);
      }
      const list = [...names].map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join('、');
      this.ui.sayStatus(`💉 戰術興奮劑已生效！${list}`);
      // 興奮劑的移速／磁力都進了 runMuls，要在這裡重算一次才會生效
      this.weaponManager.applyPassives();
    }

    // 每日挑戰中規則層處理不了的兩項 (玩家速度與血量上限是加法/覆寫語意)
    // 移速走單局乘數，不直接改 baseSpeedMul —— 後者每次 applyPassives 都會重算。
    if (this.isDaily && this.dailyConfig) {
      for (const mod of this.dailyConfig.modifiers) {
        if (mod.playerSpeedMul) this.applyRunMul('speed', mod.playerSpeedMul);
        if (mod.playerHpMul) {
          this.player.charMaxHp = Math.round(this.player.charMaxHp * mod.playerHpMul);
        }
        if (mod.maxHpOffset) {
          this.player.charMaxHp = Math.max(20, this.player.charMaxHp + mod.maxHpOffset);
        }
        if (mod.eliteHeal) this._eliteHeal = mod.eliteHeal;
      }
    }

    // 規則層注入：輸出、受傷、金幣三個乘數。
    // 受傷拆成兩層：baseDamageTaken 是「角色特質 × 每日詞綴 × 關卡／難度規則」，
    // damageTakenMul 再乘上「祝福的風險懲罰」。分開的理由是祝福懲罰必須可重算 ——
    // 直接寫進 damageTakenMul 的話，任何重新指派這條公式的地方都會把它沖掉
    // （裝備的 meta 加成就是這樣踩過的）。baseDamageTaken 由 applyPassives() 負責套用。
    this.player.baseDamageTaken = this.player.damageTakenMul * this.rules.damageTakenMul;
    this.player.modeDmgMul = (this.player.modeDmgMul || 1) * this.rules.playerDmgMul;
    // rules.goldMul 不在這裡烘進 metaGoldMul：rules 會被局內事件暫時改寫
    // （Progression 的 spawnMul/goldMul 事件），烘進去會在事件結束後留下殘留值。
    // 它由 facilityGoldMul() 每次即時相乘。
    // 以上全部就緒後才做最後一次套用：生命上限／移速／傷害都在這裡一次算完
    this.weaponManager.applyPassives();
    this.player.hp = this.player.maxHp;

    this.lowHpWarned = false;
    this.particles.clear();
    this.enemies = [];
    this._pendingSpawns = [];
    this.enemyProjectiles = [];
    this.dropItems = [];
    this.pendingLevelUps = 0;
    this._levelUpHold = 0;
    this.turrets = [];
    this.mercenaries = [];
    this.decals = [];
    initExplodableProps(this);
    this.destructibles = [];
    initDestructibles(this);
    this.extractionWell = null;

    this.gameTime = 0;
    this.kills = 0;
    this.gold = (this.player && this.player.startBonusGold) ? this.player.startBonusGold : 0;
    // 角色的開局加成要放在「本局狀態重置之後」：turrets 等陣列在上方才被清空，
    // 放在 applyMetaTalents() 旁邊會被緊接著的 this.turrets = [] 清掉（實測踩過，
    // 工兵阿鴨的開局砲台就這樣消失無蹤）。
    this.player.character.startBonus?.(this);
    this.boss = null;
    this.hitstopTimer = 0;
    this.redFlash = 0; // Boss 大招紅閃
    this.combo = 0;
    this.comboTimer = 0;
    this.frenzyTimer = 0;
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.shake = 0;
    this.hazards = [];
    this._mechTimers = {};       // 每種 mech 各自計時
    this._shrinkCircle = null;   // 深淵縮圈狀態
    this.player.iceFriction = 0; // 重設冰面慣性
    this.killMilestoneAt = 100;
    this.timeMilestoneAt = 120;
    this._milestoneIdx = 0;
    this.pendingGear = [];       // 局內拾獲待回收裝備 (暫存區)
    this.ui.updatePendingGear(0);

    // 戰術口袋與武器型態重設
    this.player.pockets = [null, null];
    this._autoPocketTimer = 0;
    this.player.weaponAspects = { ...(save.data.weaponAspects || {}) };
    this.ui.updatePockets(this.player.pockets);

    // ── 新系統重設 ──
    this.blessings = [];
    this._pendingBlessings = [];
    this.activeEvent = null;
    // 預排局內事件：90s, 210s, 330s, 420s (閃過 Boss 時段 120/300/480)
    this._eventSchedule = buildEventSchedule();
    this._eventBag = [];
    this._recycleTally = 0;
    this._lastEliteHitstop = -99;
    this._buildHintShown = false;
    this.clearFrameErrors();
    this._eventIdx = 0;
    this.activeSynergies = [];
    this.merchant = null;
    this._merchantTimer = 150; // 首次商人 2.5 分鐘後出現
    this._merchantBuys = 0;
    this._maxCombo = 0;
    this._damageTaken = 0;
    this._lastHit = null;
    this._dmgBySource = {};
    this._chestsOpened = 0;
    this._evosThisRun = 0;
    this._goldRushTimer = 0;
    this._tempBuffs = [];
    this._eventSpawnMul = 1;   // 迷你事件的生成倍率殘留 (原本只有 endMiniEvent 會清)
    this._settled = false;     // 新的一局可以再結算一次
    this._timeStopTimer = 0;   // 時停懷錶的敵方子彈凍結
    this.ui.updateBlessings([]);
    this.ui.updateSynergies([]);
    this.ui.updateEventBanner(null);
    this.ui.onMerchantClose = () => dismissMerchant(this);
    this.input.reset();

    this.ui.updateSkillSlots(this.weaponManager);
    this.ui.updateBossHUD(null);
    this.ui.updateDash(0);
    this.ui.updateCombo(0, false);
    this.ui.showTurretUpgrade(false);

    if (this.isDaily && this.dailyConfig) {
      this.ui.say(`每日挑戰啟動！【${this.dailyConfig.modifiers.map((m) => m.name).join(' | ')}】`, '#00e5ff', 4.5);
    } else {
      this.ui.say(this.player.character.lines.start, this.player.character.accent);
      // 開場台詞講完才提示本關規則 (共用同一個氣泡通道，先講的會被蓋掉)
      if (!this.isDaily && this.level.rules?.label && this.level.id !== 'street') {
        this.weaponManager.schedule(3.4, () =>
          this.ui.say(`⚔️ ${this.level.rules.label}：${this.level.rules.desc}`, '#ffd166', 4.5));
      }
    }

    this.ui.setModeButtons(this.mode);
    this.ui.updateCoreHUD(this.core);
    updateFacilityHUD(this);
    this.ui.updateHireBtn(this.mercCost, this.gold >= (this.mercCost || 1e9));
    grantStarterTurret(this);

    this.state = 'PLAYING';
  }


  get turretCost() {
    return getFacilityCost(this, 'turret');
  }




  // 守塔模式開局免費給一座塔並說明怎麼蓋。模式定位是「靠佈防而不是靠走位輸出」，
  // 但過去沒有任何東西告訴玩家該蓋、蓋哪裡、蓋了有什麼差 —— 實測整場十分鐘
  // 砲塔 0 座，等於整條主線沒被使用。


  // 對外統一的傷害入口 (角色特質、道具都走這裡，才會計入傷害統計與跳字)
  damageEnemy(enemy, damage, knockback, sourceX, sourceY, weaponId = null) {
    enemy.takeDamage(damage, knockback, sourceX, sourceY);
    // 顯示與統計都要用「實際扣除」的值：裝甲/盾衛/標記會改變最終傷害，
    // 用傳入值會虛報 (打防暴盾衛時畫面數字是實際的兩倍以上)
    const applied = enemy.lastDamageTaken || damage;
    if (weaponId) this.weaponManager.recordDamage(weaponId, applied);
    this.particles.createDamageText(enemy.x, enemy.y, applied, false);
  }

  // Boss 專屬技能效果 (由 Enemy.updateBoss 依冷卻觸發)
  handleBossSkill(boss, act) {
    // Boss 大招紅閃 (Soulstone 風格：施法瞬間畫面邊緣泛紅；召喚較輕)
    this.redFlash = Math.max(this.redFlash, act === 'summon' ? 0.3 : 0.55);
    if (act === 'nova') {
      // 範圍震波：光圈內受傷 + 震屏
      const R = boss.radius * 7;
      this.particles.createShockwave(boss.x, boss.y, R, '#ff0055');
      sound.playExplosion();
      this.camera.shake = Math.max(this.camera.shake, 10);
      const d = Math.hypot(this.player.x - boss.x, this.player.y - boss.y);
      if (d < R + this.player.radius) {
        this.player.takeDamage(14, `${boss.name}・震波`);
        this.particles.createHurtText(this.player.x, this.player.y, 14);
      }
    } else if (act === 'summon') {
      // 召喚 3 隻當前波次的小怪 (數量逼近上限就不召)
      if (this.enemies.length < 230) {
        const pool = currentWave(this.level || LEVELS.street, this.gameTime).pool;
        const scale = enemyScale(this.gameTime, this.level, this.rules);
        scale.hp = (1 + this.gameTime / 90) * (this.level ? this.level.hpScale : 1) * 0.6; // 召喚怪刻意壓低
        for (let i = 0; i < 3; i++) {
          const ang = Math.random() * Math.PI * 2;
          this.enemies.push(new Enemy(
            pickEnemy(pool),
            boss.x + Math.cos(ang) * 120,
            boss.y + Math.sin(ang) * 120,
            scale
          ));
        }
      }
      this.particles.createShockwave(boss.x, boss.y, 130, '#b5179e');
    } else if (act === 'barrage') {
      // 扇形散彈幕 (7 發)
      const count = 7;
      const spread = Math.PI * 0.55;
      const baseAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
      sound.playShoot();
      for (let i = 0; i < count; i++) {
        const angle = baseAngle - spread / 2 + (spread / (count - 1)) * i;
        const spd = 260;
        this.spawnEnemyProjectile(boss, {
          x: boss.x + Math.cos(angle) * (boss.radius + 12),
          y: boss.y + Math.sin(angle) * (boss.radius + 12),
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          damage: 16,
          radius: 8,
          life: 4.5,
          color: '#ff0055',
          glow: '#ff5400',
        });
      }
      this.particles.createShockwave(boss.x, boss.y, boss.radius * 2, '#ff0055');
    } else if (act === 'vortex') {
      // 引力漩渦：短暫強烈吸引玩家往 Boss 靠近
      boss.vortexTimer = 2.2;
      this.particles.createShockwave(boss.x, boss.y, 220, '#7209b7');
      sound.playExplosion();
      this.camera.shake = Math.max(this.camera.shake, 8);
    } else if (act === 'ground') {
      // 地面預警雷區：在特工附近召喚定時爆破地雷 (與關卡 mech 地雷同 schema：kind/r/t)
      const offsetAng = Math.random() * Math.PI * 2;
      const offsetDist = Math.random() * 80 + 35;
      const b = GAME_CONFIG.WORLD_BOUNDS;
      const mx = Math.max(b.minX + 60, Math.min(b.maxX - 60, this.player.x + Math.cos(offsetAng) * offsetDist));
      const my = Math.max(b.minY + 60, Math.min(b.maxY - 60, this.player.y + Math.sin(offsetAng) * offsetDist));
      this.hazards.push({
        kind: 'mine',
        x: mx,
        y: my,
        r: 110,
        color: '#ff0055',
        t: 0,
        tick: 0.5,
        fuse: 1.6,
        dur: 0,
        dmg: 18,
        dmgEnemy: 450,
      });
      this.particles.createShockwave(boss.x, boss.y, 90, '#ff0055');
    }
  }

  // 失敗結算的「為什麼死」：最後一擊 + 本局承受最多的來源
  deathRecap() {
    if (this.core && this.core.isDead) return '💥 基地核心被摧毀';
    const hit = this._lastHit;
    if (!hit) return null;
    const [topSrc, topDmg] = Object.entries(this._dmgBySource || {}).sort((a, b) => b[1] - a[1])[0];
    return `💀 最後傷害：${hit.source} ${hit.dmg}　·　承受最多：${topSrc} ${topDmg}（共 ${this._damageTaken}）`;
  }

  spawnEnemyProjectile(shooter, projData) {
    if (this.enemyProjectiles.length < 150) {
      const ep = new EnemyProjectile(projData);
      ep.sourceName = shooter?.name;
      this.enemyProjectiles.push(ep);
    }
  }

  updateEnemyProjectiles(dt) {
    // 時停懷錶：敵方子彈原地凍結 (說明承諾的效果)
    if (this._timeStopTimer > 0) return;
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = this.enemyProjectiles[i];
      ep.update(dt);
      if (ep.isDead) {
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  checkEnemyProjectileHits() {
    const p = this.player;
    if (p.isDead) return;

    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = this.enemyProjectiles[i];
      if (ep.isDead) continue;

      // 聖盾/偏轉護刃 (Aegis Shield 型態) 旋轉刀刃擊碎/偏轉敵方子彈
      let deflected = false;
      for (const proj of this.weaponManager.projectiles) {
        if (proj.isDead || !proj.reflectBullets) continue;
        const dProj = Math.hypot(proj.x - ep.x, proj.y - ep.y);
        if (dProj < proj.radius + ep.radius + 6) {
          deflected = true;
          this.particles.createShockwave(ep.x, ep.y, 20, '#00e5ff');
          sound.playHit();
          break;
        }
      }
      if (deflected) {
        ep.isDead = true;
        this.enemyProjectiles.splice(i, 1);
        continue;
      }

      const dist = Math.hypot(p.x - ep.x, p.y - ep.y);
      let consumed = false;
      // 優先判定玩家 (含無敵幀擋彈)
      if (dist < p.radius + ep.radius) {
        consumed = true;
        if (p.takeDamage(ep.damage, ep.sourceName ? `${ep.sourceName}・子彈` : '敵方子彈')) {
          this.camera.shake = Math.max(this.camera.shake, 6);
          this.particles.createHurtText(p.x, p.y, ep.damage);
          this.particles.createDeathParticles(ep.x, ep.y, ep.color || '#06d6a0', 6);
          p.character.onHit?.(this);
        }
      }
      // 沒打到玩家就檢查傭兵 (酸液/彈幕會打傭兵)
      if (!consumed) {
        for (const m of this.mercenaries) {
          if (m.isDead) continue;
          const dm = Math.hypot(m.x - ep.x, m.y - ep.y);
          if (dm < 11 + ep.radius) {
            consumed = true;
            m.takeDamage(ep.damage);
            this.particles.createDeathParticles(ep.x, ep.y, ep.color || '#06d6a0', 3);
            break;
          }
        }
      }
      if (consumed) {
        ep.isDead = true;
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  // 關卡地形機制更新 (levels.mechs 陣列)：毒霧、地雷、噴發 + 冰面/安全高台/縮圈


  // 地雷/噴發引爆：敵我皆傷 (噴發對敵傷害高，幫清場但要閃)


  // 里程碑獎勵：每 100 殺交替 [舊獎勵 / 祝福二選一]，每 2 分鐘一次後勤補給


  // ── 方向 1：局內隨機祝福 ──


  // 祝福的逐幀效果 (相位護盾、狂戰士 — 在 updatePlayer 裡呼叫)

  // ── 方向 2：隨機局內事件 ──



  // ── 方向 4：武器協同效果 ──

  // ── 方向 5：局內商人 ──



  // 「離開商店」：關閉面板並讓商人立刻收攤，避免玩家還站在原地時面板又跳出來




  // ── 方向 6：成就系統 ──


  // 任務目標提示：下一波 Boss 倒數 / 終極首領通關條件 (無盡 = 生存挑戰)

  loop(currentTime) {
    const dt = Math.min(0.1, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    if (this.perf) {
      this.perf.frames.push(dt * 1000);
      if (this.state !== 'PLAYING') this.perf.pausedFrames++;
    }

    // ponytail: 只在遊戲進行中重繪。覆蓋層有全螢幕 backdrop-filter: blur，
    // 畫布每幀變動會逼瀏覽器每幀重做全螢幕模糊 → 死亡/升級時直接卡死。
    // 停止重繪後畫布保留最後一幀，視覺上完全一樣。
    // ponytail: 單幀例外不能弄死整條 rAF 鏈 —— 以前一次丟出就永久卡住畫面
    try {
      if (this.state === 'PLAYING') {
        if (this.hitstopTimer > 0) {
          this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
          this.render();
          if (this.perf) this.perf.hitstopFrames++;
        } else {
          // 一律量測 update/render（三次 performance.now 成本可忽略）：效能面板要用，
          // 自適應解析度也要用它判斷餘裕 —— 幀距有 vsync 夾住，量不出真正剩多少。
          const t0 = performance.now();
          this.update(dt);
          const t1 = performance.now();
          this.render();
          const t2 = performance.now();
          if (this.perf) {
            this.perf.update += t1 - t0;
            this.perf.render += t2 - t1;
            this.perf.ticks++;
          }
          this._trackFrame(t2 - t0);
        }
      }
      this.frameErrorStreak = 0;
    } catch (err) {
      // 例外只要是必然重現的，這裡每幀都會接到 —— rAF 還在跑、畫布留著最後
      // 一幀、音訊照常，但遊戲世界從此不再前進，看起來就是「畫面卡住」。
      // 記下來讓效能面板顯示，否則只能靠接主機看 console 才發現。
      console.error('[frame error]', err);
      this.frameError = err;
      this.frameErrorCount = (this.frameErrorCount || 0) + 1;
      this.frameErrorStreak = (this.frameErrorStreak || 0) + 1;
      // 兩種都要抓：連續半秒都在拋 = 畫面已經回不來了；累計三次 = 反覆出現的
      // 真 bug (例如結算流程拋錯後只會拋幾次就停在 GAME_OVER，連續計數永遠到不了
      // 門檻，玩家卻已經卡死沒有出口)。
      if (this.frameErrorStreak === 30 || this.frameErrorCount === 3) this.showFatalError(err);
    }

    if (this.perf) this.drawPerfHUD(currentTime);

    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.gameTime += dt;
    if (this._timeStopTimer > 0) this._timeStopTimer -= dt;

    // 1. 更新特工玩家
    this.player.update(dt, this.input.vector);
    tickBlessingEffects(this, dt);
    updateMerchant(this, dt);

    // 檢查特工是否身亡
    if (this.player.isDead) {
      this.handleGameOver(false);
      return;
    }

    // 2. 更新相機追隨
    const targetCamX = this.player.x - this.vw / 2;
    const targetCamY = this.player.y - this.vh / 2;
    this.camera.x += (targetCamX - this.camera.x) * 0.12;
    this.camera.y += (targetCamY - this.camera.y) * 0.12;

    // 螢幕震動衰減
    if (this.camera.shake > 0) {
      this.camera.shake *= 0.9;
      if (this.camera.shake < 0.1) this.camera.shake = 0;
    }

    // 3. 怪物波次生成
    this.spawner.update(dt, this.gameTime, this.player, this.enemies, (boss) => {
      this.boss = boss;
      this.camera.shake = 15;
      this.ui.say(
        boss.isFinal ? '終極首領降臨！擊敗它即可完成任務！' : this.player.character.lines.boss,
        '#ff0055',
        boss.isFinal ? 5 : 3.2
      );
    });

    // 4. 更新怪物行動、遠程射擊與自爆回呼
    // 守塔模式：雜兵朝基地核心進攻；Boss 仍鎖玩家 (技能全以玩家為原點，且核心撐不住 Boss)
    const mobTarget = this.core && this.mode.enemyTarget === 'core' ? this.core : this.player;
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      enemy.update(dt, enemy.isBoss ? this.player : mobTarget, {
        onExplode: (boomer) => {
          // 自爆蟲引爆
          this.particles.createExplosion(boomer.x, boomer.y, 75);
          sound.playExplosion();
          const dist = Math.hypot(this.player.x - boomer.x, this.player.y - boomer.y);
          if (dist <= 75 + this.player.radius) {
            this.player.takeDamage(20, `${boomer.name}・自爆`);
            this.camera.shake = 8;
          }
        },
        onBossSkill: (boss, act) => this.handleBossSkill(boss, act),
        onShoot: (shooter, projData) => this.spawnEnemyProjectile(shooter, projData),
        onHatch: (e) => this.spawnHatchling(e),
        onHeal: (e) => {
          // ponytail: O(n) 掃全場，巫醫數量少可接受；變多再改用碰撞網格
          const r2 = e.healAura.radius ** 2;
          for (const o of this.enemies) {
            if (o.isDead || o.isBoss || o.hp >= o.maxHp) continue;
            if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > r2) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.healAura.pct);
          }
          this.particles.createDeathParticles(e.x, e.y, '#9d4edd', 10);
        },
        onBlink: (e) => this.particles.createDeathParticles(e.x, e.y, '#2ec4b6', 8),
        onMortar: (e) => {
          // 瞄準特工「此刻」的位置；落點用既有的地雷預警圈畫法，fuse 秒後才爆
          const m = e.mortar;
          const p = this.player;
          if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 > m.range ** 2) return;
          placeHazard(this, { type: 'mine', radius: m.radius, fuse: m.fuse, dmg: m.dmg, color: m.color, source: `${e.name}・砲擊` }, p.x, p.y);
          this.particles.createDeathParticles(e.x, e.y, m.color, 6);
        },
        onTrail: (e) => {
          const t = e.trail;
          placeHazard(this, { type: 'tar', radius: t.radius, dur: t.dur, color: t.color }, e.x, e.y);
        },
        onSlam: (e, slam) => {
          // 攻城巨像踏地：範圍震波對特工造成傷害，也把周圍雜兵震開
          // (原本巨像只有「走得慢、血很厚」，沒有任何自己的節奏)
          this.particles.createShockwave(e.x, e.y, slam.radius, '#ffb703');
          this.particles.createExplosion(e.x, e.y, slam.radius * 0.6);
          this.camera.shake = Math.max(this.camera.shake, 10);
          const sdx = this.player.x - e.x;
          const sdy = this.player.y - e.y;
          if (Math.sqrt(sdx * sdx + sdy * sdy) <= slam.radius + this.player.radius) {
            if (this.player.takeDamage(slam.dmg, `${e.name}・重擊`)) {
              this.particles.createHurtText(this.player.x, this.player.y, slam.dmg);
            }
          }
          for (const other of this.enemies) {
            if (other === e || other.isDead || other.isBoss) continue;
            const odx = other.x - e.x;
            const ody = other.y - e.y;
            if (odx * odx + ody * ody <= slam.radius * slam.radius) {
              other.takeDamage(0, 5, e.x, e.y);
            }
          }
        },
        onBurn: (e, dmg, src) => this.weaponManager.recordDamage(src, dmg),
      });

      // Boss 引力漩渦吸附判定
      if (enemy.isBoss && enemy.vortexTimer > 0) {
        enemy.vortexTimer -= dt;
        const vdx = enemy.x - this.player.x;
        const vdy = enemy.y - this.player.y;
        const vdist = Math.hypot(vdx, vdy);
        if (vdist > 15) {
          const pullSpeed = 165 * dt;
          this.player.x += (vdx / vdist) * pullSpeed;
          this.player.y += (vdy / vdist) * pullSpeed;
        }
        if (Math.random() < 0.4) {
          this.particles.createDeathParticles(
            enemy.x + (Math.random() - 0.5) * 160,
            enemy.y + (Math.random() - 0.5) * 160,
            '#b5179e',
            2
          );
        }
      }

      // 怪物撞擊特工傷害檢測
      const dist = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
      if (dist < this.player.radius + enemy.radius) {
        if (this.player.takeDamage(enemy.damage, enemy.name)) {
          this.camera.shake = 6;
          this.particles.createDeathParticles(this.player.x, this.player.y, '#ff0055', 6);
          this.player.character.onHit?.(this);
        }
      }
    }

    // 4.1 怪物互相推擠 (分離力)。沒有這一步的話，全部敵人會收斂到同一個座標上
    // 變成一坨在移動 —— 這是「敵人看起來很單調」最強的單一來源，比美術更關鍵。
    this.applyEnemySeparation(dt);

    // 4.2 更新敵方投射物與判定
    this.updateEnemyProjectiles(dt);
    this.checkEnemyProjectileHits();

    // 4.5 砲塔開火與被啃
    updateTurrets(this, dt);

    // 4.55 基地核心 (守塔模式)：雜兵貼上來就啃，破了即任務失敗。
    // 推擠對所有貼上來的怪都生效 (物理阻擋)，但「打得到核心」的只有最外圈的
    // CORE_MAX_ATTACKERS 隻 —— 否則傷害會隨怪數無上限累加 (實測不防守時會衝到
    // 2,972 DPS、249 隻同時啃)，核心開多少血都是幾十秒內被秒。
    if (this.core) {
      this.core.update(dt);
      let attackers = 0;
      for (const e of this.enemies) {
        if (e.isDead) continue;
        const dx = e.x - this.core.x;
        const dy = e.y - this.core.y;
        const minD = this.core.radius + e.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        // 推開，讓怪圍在核心外圈啃 (比照砲塔被啃的處理)
        e.x = this.core.x + (dx / d) * minD;
        e.y = this.core.y + (dy / d) * minD;
        if (attackers < CORE_MAX_ATTACKERS) {
          attackers++;
          this.core.takeDamage(e.damage * dt * 1.5);
        }
      }
      if (this.core.isDead) {
        this.particles.createExplosion(this.core.x, this.core.y, 220);
        this.particles.createShockwave(this.core.x, this.core.y, 420, '#ff0055');
        sound.playExplosion();
        this.camera.shake = 24;
        this.ui.say('💥 基地核心被摧毀！任務失敗', '#ff0055', 3);
        this.handleGameOver(false);
        return;
      }
      this.ui.updateCoreHUD(this.core);
    }

    // 迴圈中孵化的新怪統一在這裡入場 (下一幀才開始行動)
    if (this._pendingSpawns.length > 0) {
      this.enemies.push(...this._pendingSpawns);
      this._pendingSpawns.length = 0;
    }

    // 4.6 傭兵 AI (跟隨/索敵/被啃)
    updateMercenaries(this, dt);

    // 開局送的那一座之外，玩家還是不知道自己「可以再蓋」。金幣第一次夠的時候
    // 提示一次就好 —— 實測整場只蓋一座 (就是預置的那座)，主線仍然沒被使用。
    if (this.core && this.mode.turrets && !this._buildHintShown
        && this.gold >= getFacilityCost(this, 'turret')) {
      this._buildHintShown = true;
      this.ui.say('🪙 金幣足夠了 — 走到空地按建造鈕，多一座砲台就多一道防線', '#ffb703', 4);
    }

    // 檢測是否在標準砲塔附近 (顯示進化按鈕)
    const nearStandardTurret = this.turrets.find(
      (t) => t.variant === 'standard' && Math.hypot(t.x - this.player.x, t.y - this.player.y) <= 125
    );
    if (nearStandardTurret && this.gold >= 50) {
      // 第二參數才是點擊回呼 (UI 簽名 showTurretUpgrade(show, onUpgrade)) — 別把砲塔物件當回呼傳
      this.ui.showTurretUpgrade(true, () => tryUpgradeNearestTurret(this));
    } else {
      this.ui.showTurretUpgrade(false);
    }

    // 4.6 關卡地形機制 (毒霧/地雷/噴發/空投)
    updateHazards(this, dt);
    this.updateAutoPocket(dt);

    // 4.7 可引爆物件受傷閃白更新
    for (const prop of this.explodableProps) {
      if (prop.flashTimer > 0) prop.flashTimer -= dt;
    }

    // 4.7b 可破壞街頭木箱/油桶更新與地圖動態補充
    for (let i = this.destructibles.length - 1; i >= 0; i--) {
      const c = this.destructibles[i];
      c.update(dt);
      if (c.isDead) this.destructibles.splice(i, 1);
    }
    if (this.destructibles.length < 12) {
      spawnSingleDestructible(this);
    }

    // 地面殘跡生命週期
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const dc = this.decals[i];
      dc.life -= dt;
      if (dc.life <= 0) this.decals.splice(i, 1);
    }

    // 4.8 撤離井刷新與倒數 (生成位置 clamp 在世界邊界內，避免貼牆時開在界外)
    if (!this.extractionWell && ((this.gameTime >= 150 && this.gameTime < 155) || (this.gameTime >= 330 && this.gameTime < 335))) {
      const ang = Math.random() * Math.PI * 2;
      const d = 360 + Math.random() * 120;
      const b = GAME_CONFIG.WORLD_BOUNDS;
      this.extractionWell = {
        x: Math.max(b.minX + 90, Math.min(b.maxX - 90, this.player.x + Math.cos(ang) * d)),
        y: Math.max(b.minY + 90, Math.min(b.maxY - 90, this.player.y + Math.sin(ang) * d)),
        radius: 75,
        holdTime: 0,
        requiredTime: 4.0,
        life: 25, // 25 秒沒人進去就關閉，讓 5:30 的第二窗口能再開
        active: true,
      };
      sound.playEvoFanfare();
      this.ui.say('🚨 戰術撤離井已開啟！前往光環完成撤離獲取巨額獎勵！', '#00e5ff', 4.5);
    }

    if (this.extractionWell && this.extractionWell.active) {
      this.extractionWell.life -= dt;
      if (this.extractionWell.life <= 0) {
        // 錯過窗口：關閉並清掉，下一窗口才能再開
        this.extractionWell = null;
        this.ui.say('🚁 戰術撤離井已關閉', '#8a9bb0', 2);
      } else {
        const dist = Math.hypot(this.player.x - this.extractionWell.x, this.player.y - this.extractionWell.y);
        if (dist <= this.extractionWell.radius) {
          this.extractionWell.holdTime += dt;
          if (Math.random() < 0.4) {
            this.particles.createShockwave(this.extractionWell.x, this.extractionWell.y, this.extractionWell.radius, '#00e5ff');
          }
          if (this.extractionWell.holdTime >= this.extractionWell.requiredTime) {
            this.extractionWell.active = false;
            sound.playEvoFanfare();
            this.particles.createShockwave(this.extractionWell.x, this.extractionWell.y, 600, '#00e5ff');
            const rewardDna = 180;
            save.data.dna += rewardDna;

            // 撤離井成功：目前背包內的所有待回收裝備直接安全入庫！
            // (只保住此刻手上的，之後再撿的照樣吃陣亡懲罰 —— 這才是「回收風險」)
            let securedCount = 0;
            if (this.pendingGear && this.pendingGear.length > 0) {
              securedCount = this.pendingGear.length;
              for (const it of this.pendingGear) {
                if (!save.addItem(it)) {
                  save.data.dna += salvageValue(it);
                }
              }
              this.pendingGear = [];
              this.ui.updatePendingGear(0);
            }
            save.flush();

            this.gold += 150;
            const secMsg = securedCount > 0 ? `，安全運回 ${securedCount} 件裝備！` : '！';
            this.ui.say(`🚁 戰術撤離成功！+${rewardDna} 🧬 DNA, +150 🪙${secMsg}`, '#ffd60a', 4);
            for (const e of this.enemies) {
              if (!e.isBoss && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 500) {
                e.takeDamage(9999, 10, this.player.x, this.player.y);
              }
            }
            // 撤離成功後清掉，讓 5:30 的第二窗口能再開一次
            this.extractionWell = null;
          }
        } else {
          this.extractionWell.holdTime = Math.max(0, this.extractionWell.holdTime - dt * 0.8);
        }
      }
    }

    // 5. 武器庫冷卻與攻擊 (連擊狂潮下攻速加速 35%)
    const weaponDt = this.frenzyTimer > 0 ? dt * 1.35 : dt;
    this.weaponManager.update(weaponDt, this.enemies, this.particles);

    // 6. 投射物與怪物/環境碰撞檢測
    this.checkProjectileCollisions();

    // 7. 清除死亡怪物並產出掉落物
    this.cleanupDeadEnemies();

    // 8. 更新掉落物與拾取
    this.updateDropItems(dt);

    // 9. 更新粒子與跳字
    this.particles.update(dt);

    // 10. 角色專屬特質的逐幀效果
    this.player.character.tick?.(dt, this);

    // 11. 血量低於 20% 的一次性告急台詞
    if (!this.lowHpWarned && this.player.hp / this.player.maxHp < 0.2) {
      this.lowHpWarned = true;
      this.ui.say(this.player.character.lines.lowhp, '#ff0055');
    }

    // 12. 翻滾冷卻與連擊倒數更新
    this.ui.updateDash(this.player.dashMaxTimer ? this.player.dashTimer / this.player.dashMaxTimer : 0);
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
      this.ui.updateCombo(this.combo, this.frenzyTimer > 0);
    }
    if (this.redFlash > 0) this.redFlash = Math.max(0, this.redFlash - dt * 1.6);
    if (this.frenzyTimer > 0) {
      this.frenzyTimer -= dt;
      if (Math.random() < 0.25) {
        this.particles.createShockwave(this.player.x, this.player.y, 25, '#00e5ff');
      }
    }

    // 音訊：把畫面中心當成聽者 (音效左右定位)，並依戰況餵入音樂張力。
    // 張力高時 BGM 會疊上 16 分音符琶音層、lead 變密、ghost hat 出現。
    sound.setListener(this.camera.x + this.vw / 2, this.vw);
    {
      const bossAlive = this.boss && !this.boss.isDead ? 0.4 : 0;
      const lowHp = this.player.hp / this.player.maxHp < 0.35 ? 0.35 : 0;
      const frenzy = this.frenzyTimer > 0 ? 0.3 : 0;
      sound.setIntensity(Math.min(1, bossAlive + lowHp + frenzy));
    }

    // 13. 更新 UI
    this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    // 四種設施按鈕一起刷新 (內部有值快取，每幀呼叫不會產生多餘的 DOM 寫入)
    this.ui.updateFacilityButtons(this.gold, (type) => getFacilityCost(this, type));
    this.ui.updateHireBtn(this.mercCost, this.gold >= (this.mercCost || 1e9));
    this.ui.updateBossHUD(this.boss);
    this.ui.setObjective(objectiveText(this));

    // 14. 里程碑獎勵 (擊殺數 / 存活時間)
    checkMilestones(this, dt);
  }

  // 敵人互相推擠 (separation)。
  //
  // 為什麼需要：所有近戰怪的移動程式碼只有「朝目標點直線前進」一行，沒有任何
  // 鄰居排斥，於是 250 隻上限下整群怪會塌成同一個座標、像一坨在移動。這是視覺上
  // 最強的單調來源，也讓「包夾」「繞背」這類戰術完全不存在。
  //
  // 成本控制：用空間雜湊 (44 單位一格) 把鄰居查詢從 O(n²) 壓成 O(n)；格子用
  // 平鋪的鏈結串列 (head/next + frame stamp)，暖機後每幀零配置 —— 原本若用
  // Map<cell, array> 每幀會重建數百個小陣列，反而製造 GC 壓力。
  applyEnemySeparation(dt) {
    const list = this.enemies;
    const n = list.length;
    if (n < 2) return;

    const CELL = 44;
    const CW = 96;                       // 4000 / 44 ≈ 91，取 96 留邊
    const B = GAME_CONFIG.WORLD_BOUNDS;
    if (!this._sep) {
      this._sep = {
        head: new Int32Array(CW * CW),
        stamp: new Int32Array(CW * CW),
        next: new Int32Array(512),
        frame: 0,
      };
    }
    const sep = this._sep;
    if (sep.next.length < n) sep.next = new Int32Array(Math.max(256, n * 2));
    sep.frame++;
    if (sep.frame > 2000000000) {        // 極端長局才需要，整批重置
      sep.stamp.fill(0);
      sep.frame = 1;
    }

    const cellI = (v, min) => {
      const c = Math.floor((v - min) / CELL);
      return c < 0 ? 0 : (c >= CW ? CW - 1 : c);
    };

    // 建立雜湊格
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.isDead || e.isBoss) continue;
      const ai = e.ai;
      if (!ai || !(ai.sepMul > 0)) continue;
      const cell = cellI(e.x, B.minX) * CW + cellI(e.y, B.minY);
      if (sep.stamp[cell] !== sep.frame) {
        sep.stamp[cell] = sep.frame;
        sep.head[cell] = -1;
      }
      sep.next[i] = sep.head[cell];
      sep.head[cell] = i;
    }

    const STRENGTH = 90;                 // 最大推擠速度 (px/s)：必須大於雜兵的逼近速度，
                                         // 否則推力永遠打不贏「全部朝同一點收斂」
    const cxMin = cellI(B.minX, B.minX);
    const cyMin = cellI(B.minY, B.minY);

    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.isDead || e.isBoss) continue;
      const ai = e.ai;
      if (!ai || !(ai.sepMul > 0)) continue;

      const ecx = cellI(e.x, B.minX);
      const ecy = cellI(e.y, B.minY);
      let px = 0;
      let py = 0;

      for (let ox = -1; ox <= 1; ox++) {
        const gx = ecx + ox;
        if (gx < cxMin || gx >= CW) continue;
        for (let oy = -1; oy <= 1; oy++) {
          const gy = ecy + oy;
          if (gy < cyMin || gy >= CW) continue;
          const cell = gx * CW + gy;
          if (sep.stamp[cell] !== sep.frame) continue;
          for (let j = sep.head[cell]; j !== -1; j = sep.next[j]) {
            if (j === i) continue;
            const o = list[j];
            const dx = e.x - o.x;
            const dy = e.y - o.y;
            const minD = (e.radius + o.radius) * 0.92;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD) continue;
            const d = Math.sqrt(d2) || 0.01;
            const w = (minD - d) / minD;   // 0..1：重疊越深推得越用力
            px += (dx / d) * w;
            py += (dy / d) * w;
          }
        }
      }

      const mag = Math.sqrt(px * px + py * py);
      if (mag < 0.001) continue;
      const push = Math.min(1, mag) * STRENGTH * ai.sepMul * dt;
      const nx = (px / mag) * push;
      const ny = (py / mag) * push;
      e.x = Math.max(B.minX, Math.min(B.maxX, e.x + nx));
      e.y = Math.max(B.minY, Math.min(B.maxY, e.y + ny));
    }
  }

  // 木箱掉寶：WeaponManager 的爆炸波及木箱時呼叫 game.dropCrateLoot(...)，
  // 保留同名薄包裝，外部呼叫端不必知道它搬去 Hazards 模組了
  // 商人排程：Progression 的擊殺里程碑會呼叫 game.checkMerchantSchedule(dt)，
  // 保留同名薄包裝（同時避免 Progression ↔ Merchant 互相 import 形成循環）
  checkMerchantSchedule(dt) {
    return checkMerchantSchedule(this, dt);
  }

  // 金幣乘數：Progression 的里程碑獎勵與回歸測試都呼叫 game.goldMul()，
  // 保留同名薄包裝，呼叫端不必知道它搬去 Facilities 模組了
  goldMul() {
    return facilityGoldMul(this);
  }

  dropCrateLoot(x, y, kind = 'crate') {
    return dropCrateLoot(this, x, y, kind);
  }

  // 地面殘跡的薄包裝：把陣列交給 GroundRenderer（呼叫點不必知道它搬去哪裡了）
  addDecal(x, y, r, fill, alpha = 0.5, accent = null, life = FX.decalLife) {
    this.ground.addDecal(this.decals, x, y, r, fill, alpha, accent, life);
  }

  // 敵人空間網格：把「投射物 × 全部敵人」的 O(P·E) 降成「投射物 × 附近幾格」。
  // 滿級彈幕（上百發投射物）× 250 隻怪原本是每幀數萬次距離計算，現在只檢查
  // 投射物周圍與其半徑相符的格子。每幀重建一次（O(E) 很便宜），格子陣列重用，
  // 不每幀配置數百個小陣列。
  _buildEnemyGrid() {
    const cell = 96;
    const g = this._enemyGrid || (this._enemyGrid = { cell, map: new Map(), pool: [], used: 0, maxR: 0 });
    g.used = 0;
    g.map.clear();
    let maxR = 0;
    for (const e of this.enemies) {
      if (e.isDead) continue;
      if (e.radius > maxR) maxR = e.radius;
      const k = (Math.floor(e.x / cell) + 4096) * 8192 + (Math.floor(e.y / cell) + 4096);
      let arr = g.map.get(k);
      if (!arr) {
        arr = g.pool[g.used];
        if (!arr) arr = g.pool[g.used] = [];
        arr.length = 0;
        g.used++;
        g.map.set(k, arr);
      }
      arr.push(e);
    }
    g.maxR = maxR;
    return g;
  }

  // 走訪 (x, y) 半徑 r 內所有格子裡的敵人。回呼回傳 true 代表要求提前停止
  // （取代原本的 break），會直接結束整個走訪。
  _forEachNearbyEnemy(grid, x, y, r, fn) {
    const cell = grid.cell;
    const x0 = Math.floor((x - r) / cell);
    const x1 = Math.floor((x + r) / cell);
    const y0 = Math.floor((y - r) / cell);
    const y1 = Math.floor((y + r) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = grid.map.get((cx + 4096) * 8192 + (cy + 4096));
        if (!arr) continue;
        for (const e of arr) {
          if (fn(e) === true) return true;
        }
      }
    }
    return false;
  }

  checkProjectileCollisions() {
    // 沒有投射物就直接跳過，別為了幾隻怪白建一張網格（開局與空場時最常見）
    if (this.weaponManager.projectiles.length === 0) return;
    // 每幀只建一次網格；本次呼叫內的所有查詢（含暴擊衝擊波、塔納托斯引爆）共用
    const grid = this._buildEnemyGrid();
    for (const p of this.weaponManager.projectiles) {
      if (p.isDead || p.type === 'rocket') continue; // 火箭走自帶到達爆炸

      const hitR = p.radius;

      // 投射物與可引爆物判定
      for (let i = this.explodableProps.length - 1; i >= 0; i--) {
        const prop = this.explodableProps[i];
        const dx = prop.x - p.x;
        const dy = prop.y - p.y;
        const rr = hitR + prop.radius;
        if (dx * dx + dy * dy < rr * rr) {
          prop.hp -= p.damage;
          prop.flashTimer = 0.12;
          this.particles.createDamageText(prop.x, prop.y, p.damage, false);
          sound.playHit(prop.x);
          p.pierce--;
          if (p.pierce <= 0) {
            p.isDead = true;
          }
          if (prop.hp <= 0) {
            triggerPropExplosion(this, prop);
            this.explodableProps.splice(i, 1);
          }
          break;
        }
      }

      // 投射物與可破壞街頭物件 (木箱/補給油桶) 判定
      for (let i = this.destructibles.length - 1; i >= 0; i--) {
        if (p.isDead) break;
        const crate = this.destructibles[i];
        if (crate.isDead) continue;
        const dx = crate.x - p.x;
        const dy = crate.y - p.y;
        const rr = hitR + crate.radius;
        if (dx * dx + dy * dy < rr * rr) {
          const destroyed = crate.takeDamage(p.damage);
          this.particles.createDamageText(crate.x, crate.y, Math.round(p.damage), false);
          sound.playHit(crate.x);
          if (p.pierce > 0) {
            p.pierce--;
            if (p.pierce <= 0) {
              p.isDead = true;
            }
          }
          if (destroyed) {
            crate.splinter(this.particles);
            dropCrateLoot(this, crate.x, crate.y, crate.kind);
            this.destructibles.splice(i, 1);
          }
          break;
        }
      }

      // 只掃投射物附近的敵人（取代原本逐一走訪全部敵人）
      this._forEachNearbyEnemy(grid, p.x, p.y, hitR + grid.maxR, (enemy) => {
        if (p.isDead) return true; // 投射物已撞爆可引爆物件身亡，不再繼續掃怪
        if (enemy.isDead || p.hitEnemies.has(enemy)) return;

        // 平方距離比較：省掉每組碰撞一次的開根號 (滿級彈幕×兩百隻怪是每幀幾萬次運算)
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const rr = hitR + enemy.radius;
        if (dx * dx + dy * dy >= rr * rr) return;

        p.hitEnemies.add(enemy);

        // 給予傷害與擊退
        let actualDmg = p.damage;
        // 處刑人祝福：對低血量 (<30%) 敵人傷害 +60%
        if (this.player.blessingExecute && (enemy.hp / enemy.maxHp) < 0.3) {
          actualDmg = Math.round(actualDmg * 1.6);
        }
        // 協同：蒸汽爆破（冰凍/減速敵人被火焰/烈火海命中傷害 x2）
        if (this.player.synergies?.frozenFireMul && (enemy.freezeTimer > 0 || enemy.slowTimer > 0) &&
            (p.weaponId === 'molotov' || p.weaponId === 'napalm_sea' || p.charge === 'burn')) {
          actualDmg = Math.round(actualDmg * this.player.synergies.frozenFireMul);
        }
        // 商人火魔藥附魔
        if (this.player._fireEnchant) {
          enemy.applyBurn(CHARGE.burn.dps, CHARGE.burn.duration, p.weaponId);
        }
        // 武器自帶的點燃（雙刃風暴 / 湮滅射線）
        if (p.burnOnHit > 0) {
          enemy.applyBurn(p.burnOnHit, 2.5, p.weaponId);
        }
        // 協同：導電刀鋒 (苦無 20% 機率觸發落雷)
        if (this.player.synergies?.kunaiThunderChance &&
            (p.weaponId === 'kunai' || p.weaponId === 'ghost_shuriken') &&
            Math.random() < this.player.synergies.kunaiThunderChance) {
          this.chainShock(enemy, Math.round(actualDmg * 0.8), 'lightning');
        }

        // 基隆型態的追蹤印記：記在敵人身上，受傷 +25% (原本 markOnHit 只被
        // 存進投射物就沒有人讀，_markedTimer 只會被扣、永遠不會被設)
        if (p.markOnHit) enemy.applyMark(p.markDur, p.markBonus);
        const died = enemy.takeDamage(actualDmg, p.knockback, p.x, p.y);
        if (died && p.mercOwner) p.mercOwner.gainKill(); // 傭兵擊殺 → 經驗升級
        this.weaponManager.recordDamage(p.weaponId, actualDmg);
        this.particles.createDamageText(enemy.x, enemy.y, actualDmg, p.isCrit || p.isEvo, p.isCrit);
        sound.playHit(enemy.x);

        // 塔納托斯：每次命中傷害 +bounceDmgGrowth，第 implosionAt 次命中引發虛空引爆。
        // 先前 thanatosBounces 只被寫入一次、從未遞增或讀取，整個型態不存在。
        if (p.implosionAt > 0) {
          p.thanatosBounces++;
          if (p.thanatosBounces >= p.implosionAt) {
            p.isDead = true;
            this.camera.shake = Math.max(this.camera.shake, 12);
            this.particles.createExplosion(p.x, p.y, p.implosionRadius);
            this.particles.createShockwave(p.x, p.y, p.implosionRadius, '#b388ff');
            sound.playExplosion();
            this._forEachNearbyEnemy(grid, p.x, p.y, p.implosionRadius + grid.maxR, (nearE) => {
              if (nearE.isDead) return;
              const ndx = nearE.x - p.x;
              const ndy = nearE.y - p.y;
              if (ndx * ndx + ndy * ndy <= (p.implosionRadius + nearE.radius) ** 2) {
                nearE.takeDamage(p.implosionDamage, 8, p.x, p.y);
                this.weaponManager.recordDamage(p.weaponId, nearE.lastDamageTaken || p.implosionDamage);
                this.particles.createDamageText(nearE.x, nearE.y, nearE.lastDamageTaken || p.implosionDamage, true, true);
              }
            });
          } else if (p.bounceGrowth > 0) {
            p.damage = Math.round(p.damage * (1 + p.bounceGrowth));
          }
        }
        // 阿基里斯：每次命中為特工充能跑速 (步進值/上限/秒數都來自型態資料)
        if (p.aspect === 'achilles' && this.player) {
          const ach = (WEAPON_ASPECTS.soccer || []).find((a) => a.id === 'achilles');
          const st = (ach && ach.stats) || {};
          const step = st.speedBoostPerHit || 0.06;
          const maxStacks = Math.max(1, Math.round((st.maxSpeedBoost || 0.42) / step));
          this.player.achillesSpeedStacks = Math.min(maxStacks, (this.player.achillesSpeedStacks || 0) + 1);
          this.player.achillesSpeedTimer = st.boostDur || 4.0;
        }

        // 蓄能彈效果 (火箭的毒氣走爆炸，不在這裡)
        if (p.charge === 'burn') {
          enemy.applyBurn(CHARGE.burn.dps, CHARGE.burn.duration, p.weaponId);
        } else if (p.charge === 'chain') {
          this.chainShock(enemy, p.damage, p.weaponId);
        } else if (p.charge === 'freeze') {
          enemy.applyFreeze(p.freezeDur || CHARGE.freeze.duration);
        } else if (p.charge === 'poison') {
          enemy.applyPoison(CHARGE.poison.duration, p.weaponId);
        }

        // 傳奇特效：暴擊衝擊波
        if (p.isCrit && this.player.legendaryEffects?.includes('crit_blast')) {
          this.particles.createShockwave(enemy.x, enemy.y, 45, '#ffb703');
          // 判定條件與原本完全相同（中心距離 < 55，不看半徑）；查詢半徑放大到
          // 55 + maxR 只會多掃幾格，不會改變誰受傷。
          this._forEachNearbyEnemy(grid, enemy.x, enemy.y, 55 + grid.maxR, (nearE) => {
            if (nearE !== enemy && !nearE.isDead) {
              const bdx = nearE.x - enemy.x;
              const bdy = nearE.y - enemy.y;
              if (bdx * bdx + bdy * bdy < 55 * 55) {
                nearE.takeDamage(Math.round(p.damage * 0.4), 3, enemy.x, enemy.y);
              }
            }
          });
        }

        p.pierce--;
        if (p.pierce <= 0) {
          p.isDead = true;
          return true;   // 穿透耗盡 → 結束走訪（等同原本的 break）
        }
      });
    }
  }

  cleanupDeadEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.isDead) {
        this.kills++;
        this.addCombo();
        // 傳奇特效：擊殺汲取生命
        if (this.player.legendaryEffects?.includes('kill_heal')) {
          this.player.heal(3);
        }
        // 祝福：嗜血契約擊殺回血
        if (this.player.blessingKillHeal) {
          this.player.heal(this.player.blessingKillHeal);
        }
        // 每日詞綴「吸血盛宴」：擊殺精英/Boss 回血
        if ((enemy.isElite || enemy.isBoss) && this._eliteHeal) {
          this.player.heal(this._eliteHeal);
        }
        // 寶藏哥布林擊殺獎勵
        if (enemy._isGoblin) {
          for (let g = 0; g < 12; g++) {
            this.dropItems.push(new DropItem(
              enemy.x + (Math.random() - 0.5) * 120,
              enemy.y + (Math.random() - 0.5) * 120, 'GOLD_COIN'));
          }
          this.dropItems.push(new DropItem(enemy.x, enemy.y, 'CHEST'));
          this.ui.say('🎁 寶藏哥布林被擊殺！金幣爆裂！', '#ffd700', 2.5);
        }
        if (enemy.isBoss) {
          this.triggerHitstop(0.08);
        } else if (enemy.isElite && this.gameTime - this._lastEliteHitstop >= ELITE_HITSTOP_GAP) {
          // 精英機率提高後，密集擊殺會讓頓格幀佔比衝到一成以上 (實測 endless 局
          // 面板出現「凍結 33–50%」)。頓格是打擊感，不是節流閥，加最小間隔。
          this._lastEliteHitstop = this.gameTime;
          this.triggerHitstop(0.035);
        }
        this.player.character.onKill?.(enemy, this);
        this.particles.createDeathParticles(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 28 : 8);

        // 地面殘跡：雜兵死亡留血漬 (Soulstone 風格視覺回饋)
        if (!enemy.isBoss && Math.random() < FX.bloodChance) {
          const [rr, gg, bb] = this._hexRgb(enemy.color);
          this.addDecal(enemy.x, enemy.y, enemy.radius * FX.splatScale,
            `${Math.round(rr * 0.55)},${Math.round(gg * 0.5)},${Math.round(bb * 0.55)}`, 0.5);
        }

        // 掉落經驗寶石或稀有道具
        this.spawnDropItem(enemy);

        // 腐屍氣囊：死亡原地炸出毒池
        if (enemy.deathZone) {
          const z = enemy.deathZone;
          placeHazard(this, { type: 'pool', radius: z.radius, dur: z.dur, dmg: z.dmg, color: z.color, source: `${enemy.name}・毒池` }, enemy.x, enemy.y);
        }

        // 孢子母體死亡裂解成幼體 (沿用母體的血量成長係數)
        if (enemy.splitInto && this.enemies.length < HATCH_ENEMY_CAP) {
          // 沿用母體的血量成長，傷害與移速用目前時間/規則重算
          const scale = enemyScale(this.gameTime, this.level, this.rules);
          scale.hp = enemy.maxHp / ENEMY_TYPES[enemy.typeKey].hp;
          for (let n = 0; n < enemy.splitCount; n++) {
            const ang = (n / enemy.splitCount) * Math.PI * 2 + Math.random();
            this.enemies.push(new Enemy(
              enemy.splitInto,
              enemy.x + Math.cos(ang) * 26,
              enemy.y + Math.sin(ang) * 26,
              scale
            ));
          }
        }

        // 若 Boss 死亡，判定勝利或給予超級大寶箱
        if (enemy.isBoss) {
          this.camera.shake = 18;
          sound.playEvoFanfare();

          // Boss 級焦痕
          const [rr, gg, bb] = this._hexRgb(enemy.color);
          this.addDecal(enemy.x, enemy.y, enemy.radius * FX.bossSplatScale,
            `${Math.round(rr * 0.4)},${Math.round(gg * 0.38)},${Math.round(bb * 0.42)}`, 0.62, null, FX.bossDecalLife);

          // 擊敗 15:00 的終極首領 = 任務達成
          if (enemy.isFinal) {
            this.enemies.splice(i, 1);
            this.handleGameOver(true);
            return;
          }
          // Boss 掉落大炸彈與全場磁鐵
          this.dropItems.push(new DropItem(enemy.x - 20, enemy.y, 'MAGNET'));
          this.dropItems.push(new DropItem(enemy.x + 20, enemy.y, 'BOMB'));
        }

        this.enemies.splice(i, 1);
      }
    }

    // Boss 血條跟著場上仍存活的 Boss (可能同時有階段 Boss 與終極首領)
    if (this.boss && this.boss.isDead) {
      this.boss = this.enemies.find((e) => e.isBoss && !e.isDead) || null;
    }
  }

  // 蓄能電擊：從命中的敵人往外連跳，每跳傷害衰減
  chainShock(origin, damage, weaponId, jumpsOverride = 0) {
    const { range, falloff, color } = CHARGE.chain;
    // 跳躍數可由武器型態指定 (宙斯：chainTargets 4)。先前呼叫端傳了第 4 個
    // 參數但這裡沒有收，宣告的 4 名敵人永遠只跳 3 次。
    const jumps = jumpsOverride > 0 ? jumpsOverride : CHARGE.chain.jumps;
    const hit = new Set([origin]);
    let from = origin;
    let dmg = damage;

    for (let j = 0; j < jumps; j++) {
      let next = null;
      let bestD = range * range;
      for (const e of this.enemies) {
        if (e.isDead || hit.has(e)) continue;
        const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
        if (d < bestD) {
          bestD = d;
          next = e;
        }
      }
      if (!next) break;

      dmg = Math.round(dmg * falloff);
      if (dmg < 1) break;
      this.particles.createArc(from.x, from.y, next.x, next.y, color);
      next.takeDamage(dmg, 1, from.x, from.y);
      this.weaponManager.recordDamage(weaponId, dmg);
      this.particles.createDamageText(next.x, next.y, dmg, true);
      hit.add(next);
      from = next;
    }
  }

  // 增殖胞囊孵化：吐出雜兵 (沿用目前關卡的雜兵血量成長係數)
  spawnHatchling(hatcher) {
    if (this.enemies.length + this._pendingSpawns.length >= HATCH_ENEMY_CAP) return;
    const scale = enemyScale(this.gameTime, this.level, this.rules);
    for (let i = 0; i < (hatcher.hatchCount || 1); i++) {
      const ang = Math.random() * Math.PI * 2;
      // 不能直接 push 進 this.enemies：孵化是在敵人 update 迴圈裡觸發的，
      // 當場加入會讓新生怪在同一幀被 update + 撞擊判定 (玩家還沒看到就吃傷害)
      this._pendingSpawns.push(new Enemy(
        hatcher.hatchMinion,
        hatcher.x + Math.cos(ang) * (hatcher.radius + 10),
        hatcher.y + Math.sin(ang) * (hatcher.radius + 10),
        scale
      ));
    }
    this.particles.createExplosion(hatcher.x, hatcher.y, 46);
    sound.playExplosion();
  }

  spawnDropItem(enemy) {
    const rand = Math.random();
    let kind = 'EXP_GREEN';

    if (enemy.isBoss) {
      kind = 'EXP_GOLD';
      // Boss 必掉幸運輪盤補給箱與高階戰術道具 (終極首領打完直接勝利，箱子撿不到，略過)
      if (!enemy.isFinal) {
        this.dropItems.push(new DropItem(enemy.x + 24, enemy.y + 24, 'CHEST'));
        const bossConsumables = ['ELIXIR', 'MANNA_PRISM', 'STOPWATCH', 'HOLY_WATER'];
        const pickBossC = bossConsumables[Math.floor(Math.random() * bossConsumables.length)];
        this.dropItems.push(new DropItem(enemy.x - 24, enemy.y + 24, pickBossC));
      }
    } else if (enemy.exp >= 3) {
      kind = 'EXP_PURPLE';
    } else if (rand < 0.015) {
      kind = 'MAGNET'; // 1.5% 磁鐵
    } else if (rand < 0.015 + BOMB_TUNING.dropChance) {
      // 全場重創炸彈：掉落率由 BOMB_TUNING 控制（原 1.5%，現 1.0%）
      kind = 'BOMB';
    } else if (rand < 0.05) {
      kind = 'ROAST_CHICKEN'; // 2% 烤雞回血
    } else if (rand < 0.12) {
      kind = 'GOLD_COIN'; // 7% 金幣
    } else if (rand < 0.35) {
      kind = 'EXP_BLUE'; // 藍色水晶
    }

    // 精英怪掉得更好：保底紫水晶，22% 機率掉幸運補給箱，35% 機率掉落戰術消費道具 (惡魔城風格)，另有機率改噴金幣
    if (enemy.isElite && !enemy.isBoss) {
      if (Math.random() < 0.22) {
        this.dropItems.push(new DropItem(enemy.x + 18, enemy.y, 'CHEST'));
      } else if (Math.random() < 0.35) {
        const cKeys = ['POTION', 'ATK_POTION', 'SHIELD_POTION', 'LUCK_POTION', 'STOPWATCH', 'HOLY_WATER', 'MANNA_PRISM', 'MAGIC_TICKET', 'ELIXIR'];
        const pick = cKeys[Math.floor(Math.random() * cKeys.length)];
        this.dropItems.push(new DropItem(enemy.x + 18, enemy.y, pick));
      } else if (Math.random() < 0.25) {
        kind = 'GOLD_COIN';
      } else if (kind === 'EXP_GREEN' || kind === 'EXP_BLUE') {
        kind = 'EXP_PURPLE';
      }
    }

    this.dropItems.push(new DropItem(enemy.x, enemy.y, kind));
    this.rollGearDrop(enemy);
  }

  // 打寶掉落：只有精英與 Boss 會噴裝備 (雜兵噴裝會讓倉庫瞬間爆掉且毫無驚喜感)
  rollGearDrop(enemy) {
    let chance = 0;
    let rarityBoost = 0;

    if (enemy.isFinal) {
      chance = 1;
      rarityBoost = 3;          // 終極首領保底一件，且大幅偏向高稀有度
    } else if (enemy.isBoss) {
      chance = 1;
      rarityBoost = 1.2;
    } else if (enemy.isElite) {
      chance = 0.22;
      rarityBoost = 0;
    }
    if (chance === 0 || Math.random() >= chance) return;

    const ilvl = itemLevelFor(this.level ? this.level.difficulty : 1, this.gameTime);
    const item = rollItem({ rarity: rollRarity(rarityBoost), ilvl });
    const offset = enemy.isBoss ? 34 : 0;
    this.dropItems.push(new DropItem(enemy.x + offset, enemy.y, 'GEAR', item));
  }

  updateDropItems(dt) {
    // 場上堆太多時給未進入拾取半徑的掉落物一點被動牽引。超過門檻才啟動，
    // 平常撿取手感不變；牽引很慢，遠處的水晶仍然要花時間才會過來。
    const drift = this.dropItems.length > DRIFT_THRESHOLD ? DRIFT_SPEED : 0;

    let inFlight = 0;
    for (let i = this.dropItems.length - 1; i >= 0; i--) {
      const item = this.dropItems[i];
      item.update(dt, this.player, drift);
      if (item.isAttracted && !item.collected) inFlight++;

      // 逾時未撿的雜物折算成金幣再移除。直接蒸發等於「打了怪卻什麼都沒拿到」，
      // 玩家既沒成長也看不到回收回饋；折算金幣至少讓擊殺不白費。
      if (item.expired) {
        this.recycleDrop(item);
        this.dropItems.splice(i, 1);
        continue;
      }

      if (item.collected) {
        this.handleItemPickup(item);
        this.dropItems.splice(i, 1);
        // 開箱/升級會切換狀態機 (CHEST_MODAL/LEVEL_UP)：剩餘掉落物等恢復後再撿，
        // 避免同幀疊加 (雙箱互蓋、升級卡被箱子蓋掉)
        if (this.state !== 'PLAYING') break;
      }
    }

    // 等這一波全部落袋才彈升級卡。逐顆立刻彈窗的話，磁鐵一次灌進大量經驗會變成
    // 「彈窗 → 回 PLAYING 撿下一顆 → 再彈窗」反覆數十次；而非 PLAYING 狀態
    // 不重繪畫布 (見 loop())，玩家看到的就是畫面凍結、升級卡狂跳，音效卻正常。
    this.capNonExpiringDrops();

    // 但不能無限等 —— 密集刷怪時場上可能永遠有水晶在飛，所以最多壓 0.6 秒。
    if (this.pendingLevelUps > 0 && this.state === 'PLAYING') {
      this._levelUpHold += dt;
      if (inFlight === 0 || this._levelUpHold >= 0.6) {
        this._levelUpHold = 0;
        this.triggerLevelUp();
      }
    } else {
      this._levelUpHold = 0;
    }
  }

  // 過期或被上限擠掉的掉落物折算金幣。累積到一定量才提示一次，
  // 否則長局會被回收訊息洗版。
  recycleDrop(item) {
    const worth = item.type === 'gold'
      ? Math.round(item.value * facilityGoldMul(this))
      : Math.max(1, Math.round((item.value || 1) * 0.5));
    this.gold += worth;
    this._recycleTally = (this._recycleTally || 0) + worth;
    if (this._recycleTally >= 25) {
      this.ui.say(`♻️ 回收未拾取的戰利品 +${this._recycleTally} 🪙`, '#ffb703', 1.8);
      this._recycleTally = 0;
    }
  }

  // 裝備/寶箱/消費道具/補給不會過期，長局或掛機時會無上限堆在地上，
  // 每幀照樣 update + draw。超過上限就把最舊的折算掉。
  capNonExpiringDrops() {
    let over = 0;
    for (const d of this.dropItems) if (d.life === Infinity) over++;
    over -= NON_EXPIRING_DROP_CAP;
    if (over <= 0) return;
    for (let i = 0; i < this.dropItems.length && over > 0; i++) {
      if (this.dropItems[i].life !== Infinity) continue;
      this.recycleDrop(this.dropItems[i]);
      this.dropItems.splice(i, 1);
      i--;
      over--;
    }
  }

  handleItemPickup(item) {
    if (item.type === 'exp') {
      sound.playGem();
      // 裝備「領悟」詞條放大經驗水晶 (每顆至少 1)
      const val = Math.max(1, Math.round(item.value * (1 + (this.player.metaExp || 0)) * this.rules.expMul));
      // 只累積待處理的升級數，彈窗留到整批掉落物都吸完才觸發 (見 updateDropItems)
      this.pendingLevelUps += this.player.gainExp(val);
    } else if (item.type === 'magnet') {
      sound.playGem();
      // 全場經驗水晶瞬間全部吸向玩家
      for (const d of this.dropItems) {
        d.isAttracted = true;
      }
    } else if (item.type === 'bomb') {
      sound.playExplosion();
      this.camera.shake = 20;
      // 全場重創（不是一鍵抹除）：非 Boss 吃「當前生命 × 比例」，Boss 吃固定傷害。
      // 9999 會讓清場沒有代價，也讓後期難度設計失去意義（見 BOMB_TUNING 的說明）。
      for (const e of this.enemies) {
        if (!e.isBoss) {
          const dmg = Math.max(BOMB_TUNING.fieldDamageMin, e.hp * BOMB_TUNING.fieldDamageRatio);
          e.takeDamage(dmg, BOMB_TUNING.knockback, this.player.x, this.player.y);
        } else {
          e.takeDamage(BOMB_TUNING.bossDamage, BOMB_TUNING.knockback, this.player.x, this.player.y);
        }
      }
    } else if (item.type === 'heal') {
      sound.playGem();
      this.player.heal(item.heal);
      this.particles.createDamageText(this.player.x, this.player.y, `+${item.heal} HP`, false);
    } else if (item.type === 'gold') {
      sound.playGem();
      this.gold += Math.round(item.value * facilityGoldMul(this));
    } else if (item.type === 'chest') {
      this.openLuckyChest();
    } else if (item.type === 'gear') {
      const gear = item.item;
      if (!gear) return;
      if (!this.pendingGear) this.pendingGear = [];
      this.pendingGear.push(gear);
      // 超出上限就把最舊的自動分解 —— 原本無上限，長局會累積到數百上千件，
      // 而回收時本來就多半是分解掉的
      let autoSalvaged = 0;
      while (this.pendingGear.length > PENDING_GEAR_CAP) {
        const old = this.pendingGear.shift();
        this.gold += salvageValue(old);
        autoSalvaged++;
      }
      if (autoSalvaged > 0) {
        this.ui.say(`♻️ 暫存已滿，自動分解 ${autoSalvaged} 件舊裝備`, '#9fb0c8', 1.6);
      }
      this.ui.updatePendingGear(this.pendingGear.length);
      const color = RARITIES[gear.rarity].color;
      sound.playEvoFanfare();
      this.particles.createShockwave(this.player.x, this.player.y, 130, color);
      this.ui.say(`拾獲 ${itemName(gear)}！(暫存待回收)`, color, 2.6);
    } else if (item.type === 'supply') {
      // 街頭空投物資箱：金幣 + 回血 + 金色衝擊波
      const gold = Math.round(30 * facilityGoldMul(this));
      this.gold += gold;
      this.player.heal(25);
      sound.playEvoFanfare();
      this.particles.createShockwave(this.player.x, this.player.y, 150, '#ffb703');
      this.particles.createDamageText(this.player.x, this.player.y, `+${gold} 🪙 +25 HP`, false);
    } else if (item.type === 'consumable') {
      const cDef = CONSUMABLE_ITEMS[item.subType];
      if (!cDef) return;
      sound.playGem();

      // 先疊到同款的格子，再放進空格；兩格都被別款占滿才即拾即用
      const pockets = this.player.pockets;
      const same = pockets.findIndex((s) => s && s.id === item.subType && s.count < POCKET_STACK);
      const empty = pockets.indexOf(null);
      if (same >= 0) {
        pockets[same].count++;
        this.ui.updatePockets(pockets);
        this.ui.say(`道具【${cDef.name}】堆疊 (${pockets[same].count}/${POCKET_STACK})！`, cDef.color, 2.0);
      } else if (empty >= 0) {
        pockets[empty] = { id: item.subType, count: 1 };
        this.ui.updatePockets(pockets);
        const key = empty === 0 ? 'E' : 'F';
        this.ui.say(save.data.settings.autoPocket === false
          ? `獲得道具【${cDef.name}】！[${key}] 鍵使用`
          : `獲得道具【${cDef.name}】！自動使用：${cDef.auto}`, cDef.color, 2.2);
      } else {
        this.activateConsumable(item.subType);
        this.ui.say(`口袋已滿，拾獲並立即使用【${cDef.name}】！`, cDef.color, 2.0);
      }
    }
  }

  triggerLevelUp() {
    if (this.pendingLevelUps > 0) this.pendingLevelUps--;
    this.state = 'LEVEL_UP';
    this.ui.say(this.player.character.lines.levelup, this.player.character.accent);

    this.presentUpgradeChoices(null);
  }

  // 生成並顯示三張升級卡；excludeKeys = 上一輪顯示的卡 (reroll 時用)
  presentUpgradeChoices(excludeKeys) {
    const opts = this.ui.generateUpgradeOptions(this.weaponManager, excludeKeys);
    this._shownUpgradeKeys = opts.map(upgradeKeyOf);
    this.ui.showUpgradeCards(
      opts,
      this.gold,
      this.rerollCost,
      (selectedOption) => this.applyUpgradeOption(selectedOption),
      () => this.tryRerollUpgrade()
    );
  }

  // 金幣 reroll：扣 60 金，重抽不重複的三選一
  tryRerollUpgrade() {
    if (this.state !== 'LEVEL_UP') return;
    if (this._shownUpgradeKeys.length <= 1) {
      this.ui.flashRerollDenied('沒有其他選項了！');
      return;
    }
    if (this.gold < this.rerollCost) {
      this.ui.flashRerollDenied();
      sound.playHurt();
      return;
    }
    this.gold -= this.rerollCost;
    this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    sound.playGem();
    this.presentUpgradeChoices(this._shownUpgradeKeys);
  }

  applyUpgradeOption(selectedOption) {
    // 應用升級選項
    if (selectedOption.type === 'evo') {
      this.weaponManager.evolveWeapon(selectedOption.baseId, selectedOption.targetId);
      save.markEvolved(selectedOption.targetId); // 圖鑑 ★ 標記 (跨局保留)
      this._evosThisRun++;
      this.ui.say(this.player.character.lines.evolve, this.player.character.accent);
      checkSynergies(this);
    } else if (selectedOption.type === 'weapon_upgrade' || selectedOption.type === 'weapon_new') {
      this.weaponManager.upgradeWeapon(selectedOption.id);
      checkSynergies(this);
    } else if (selectedOption.type === 'passive_upgrade' || selectedOption.type === 'passive_new') {
      this.weaponManager.addOrUpgradePassive(selectedOption.id);
    } else if (selectedOption.type === 'special') {
      this.applySpecialCard(selectedOption);
    } else if (selectedOption.type === 'heal') {
      this.player.heal(this.player.maxHp * 0.5);
      this.gold += Math.round(50 * facilityGoldMul(this));
    }

    this.ui.updateSkillSlots(this.weaponManager);

    // 檢查是否還有多餘升級 (連續升級)。改看待處理計數 —— 原本比對銀行內的 exp，
    // 一次跨多級時 gainExp 已把 exp 扣光，條件不成立，多出來的升級卡就被吃掉了。
    if (this.pendingLevelUps > 0) {
      this.triggerLevelUp();
    } else {
      this.state = 'PLAYING';
    }
  }

  // ── 方向 3：特殊升級卡 ──
  applySpecialCard(card) {
    switch (card.specialId) {
      case 'nuke_strike':
        this.camera.shake = Math.max(this.camera.shake, 20);
        sound.playExplosion();
        for (const e of this.enemies) {
          if (e.isBoss) e.takeDamage(BOMB_TUNING.bossDamage, BOMB_TUNING.knockback, this.player.x, this.player.y);
          else {
            const dmg = Math.max(BOMB_TUNING.fieldDamageMin, e.hp * BOMB_TUNING.fieldDamageRatio);
            e.takeDamage(dmg, BOMB_TUNING.knockback, this.player.x, this.player.y);
          }
        }
        this.particles.createExplosion(this.player.x, this.player.y, 250);
        // Player 用的是 invulnerableTimer，沒有 invincible 這個欄位 ——
        // 原本這行只是寫了一個沒人讀的屬性，卡片宣稱的「3 秒無敵」完全沒發生
        this.player.invulnerableTimer = Math.max(this.player.invulnerableTimer || 0, 3);
        this.ui.say('💣 軌道核彈發射！3 秒無敵！', '#ff0055', 3);
        break;
      case 'gene_mutate': {
        const wIds = [...this.weaponManager.weapons.keys()];
        if (wIds.length > 0) {
          const pickId = wIds[Math.floor(Math.random() * wIds.length)];
          const wItem = this.weaponManager.weapons.get(pickId);
          // 上限是武器自己的 maxLevel。原本硬寫 7，而所有基礎武器 maxLevel 都是 5、
          // 各等級索引表長度也都是 5 —— 升到 6/7 級會索引到 undefined，
          // WeaponManager 的 for (i < undefined) 一次都不跑，該武器整局啞火。
          const maxLv = WEAPONS[pickId].maxLevel || 5;
          wItem.level = Math.min(wItem.level + 2, maxLv);
          this.ui.say(`🧬 ${WEAPONS[pickId].name} 突變到 LV ${wItem.level}！`, '#00f59b', 2.5);
        }
        break;
      }
      case 'lucky_wheel':
        this.openLuckyChest();
        break;
      case 'gold_rush':
        this.gold += Math.round(200 * facilityGoldMul(this));
        // 只開計時器，不動 metaGoldMul。原本是 metaGoldMul *= 2 再由 goldMul()
        // 乘一次 → 實際 ×4；而且到期固定 /= 2，30 秒內吃到第二次就永久洩漏 ×2。
        this._goldRushTimer = 30;
        this.ui.say('🪙 淘金狂潮！30 秒金幣翻倍！', '#ffb703', 3);
        break;
      case 'full_heal':
        this.player.hp = this.player.maxHp;
        this.player.shield = (this.player.shield || 0) + 50;
        this.player.maxShield = Math.max(this.player.maxShield || 0, this.player.shield);
        this.ui.say('💖 完全復活 + 50 護盾！', '#ff69b4', 2.5);
        break;
    }
    this.particles.createShockwave(this.player.x, this.player.y, 200, card.color || '#ffb703');
    sound.playEvoFanfare();
  }


  handleGameOver(isVictory = false) {
    // 結算保護：一局只能結算一次，且結算過程中不能再進來。
    // _settled 是「本局已結算」旗標 (start() 會重設)，_settling 擋的是結算
    // 中途的遞迴呼叫 —— 兩者都需要：實測只擋遞迴時，連續呼叫兩次結算會讓
    // DNA 重複入帳 (60 → 62 → 64)。
    if (this._settled || this._settling) return;
    this._settled = true;
    this._settling = true;
    try {
      this.settleRun(isVictory);
    } catch (err) {
      // 結算中途拋例外時，state 已經變成 GAME_OVER（update 不會再跑），
      // 而結算面板是唯一的出口 —— 例外被 loop 的 catch 吞掉就會永久卡死。
      // 這裡保證一定回得到主選單。
      console.error('[結算] 流程發生例外，改為直接返回主選單', err);
      try {
        returnToMenu(this);
      } catch (e2) {
        console.error('[結算] 連返回主選單都失敗', e2);
      }
    } finally {
      this._settling = false;
    }
  }

  settleRun(isVictory = false) {
    this.state = 'GAME_OVER';
    sound.stopBGM();
    save.consumeBoosters(); // 本局結算了才真正消耗戰術興奮劑
    const lines = this.player.character.lines;
    const result = save.recordRun(this.level.id, {
      time: this.gameTime,
      kills: this.kills,
      level: this.player.level,
      cleared: isVictory,
      dnaMult: this.level.dnaMult * (this.difficulty.dnaMult || 1),
      nextLevel: this.level.next,
      // 每日挑戰成績獨立 (daily 欄位)：不寫入該關 best、不解鎖下一關，但 DNA 照發
      skipProgress: this.isDaily,
      modeId: this.modeId,
      gold: this.gold,
    });

    if (this.isDaily && this.dailyConfig) {
      save.recordDailyRun({
        date: this.dailyConfig.date,
        time: this.gameTime,
        cleared: isVictory,
      });
    }

    // 局內待回收裝備結算：通關 100% 入庫，陣亡隨機保留 50% (撤離井是當場入庫，不留旗標)
    const savedGear = [];
    const lostGear = [];
    const salvagedGear = []; // 倉庫滿 → 自動分解換 DNA，跟真的入庫要分開列
    const secure = (it) => {
      if (save.addItem(it)) savedGear.push(it);
      else {
        save.data.dna += salvageValue(it);
        salvagedGear.push(it);
      }
    };
    if (this.pendingGear && this.pendingGear.length > 0) {
      if (isVictory) {
        for (const it of this.pendingGear) secure(it);
      } else {
        const shuffled = shuffleInPlace([...this.pendingGear]);
        // 真正 50%：Math.ceil 在只有 1 件時等於 100% 保留，與說明不符
        let keepCount = Math.floor(shuffled.length * 0.5);
        if (shuffled.length % 2 === 1 && Math.random() < 0.5) keepCount++;
        for (const it of shuffled.slice(0, keepCount)) secure(it);
        lostGear.push(...shuffled.slice(keepCount));
      }
      save.flush();
      this.pendingGear = [];
      this.ui.updatePendingGear(0);
    }

    // ── 成就系統檢查 ──
    const newAchievements = checkAchievements(this, isVictory);

    this.ui.showGameOver(
      {
        isVictory: isVictory,
        gameTime: this.gameTime,
        kills: this.kills,
        level: this.player.level,
        gold: this.gold,
        line: isVictory ? lines.win : lines.death,
        codename: this.player.character.codename,
        levelName: this.isDaily
          ? `每日挑戰·${this.level.name} (${this.dailyConfig?.date || ''})`
          : this.level.name,
        dna: result.dna,
        totalDna: save.data.dna,
        totalGold: save.data.gold,
        bestTime: this.isDaily
          ? (save.data.daily && save.data.daily.date === this.dailyConfig?.date ? save.data.daily.bestTime || 0 : 0)
          : (save.bestOf(this.level.id, this.modeId)?.time || 0),
        unlockedName: result.unlockedNew ? LEVELS[this.level.next].name : null,
        achievements: newAchievements,
        blessings: this.blessings,
        synergies: this.activeSynergies,
        deathRecap: isVictory ? null : this.deathRecap(),
      },
      this.weaponManager,
      { savedGear, lostGear, salvagedGear }
    );

    // 解鎖新關卡後，選單要立刻反映
    if (result.unlockedNew) {
      this.ui.buildLevelSelect(LEVELS, LEVEL_ORDER, save, (id) => {
        this.levelId = id;
        save.set({ lastLevel: id });
      }, this.levelId);
    }
  }

  render() {
    // 螢幕震動偏移
    const shakeX = (Math.random() - 0.5) * this.camera.shake;
    const shakeY = (Math.random() - 0.5) * this.camera.shake;

    const renderCam = {
      x: this.camera.x + shakeX,
      y: this.camera.y + shakeY,
    };

    // 繪製地板漸層 + 網格 (本身即不透明滿版，不需另外清屏)
    this.ground.drawFloorGrid(this.ctx, this.level || LEVELS.street, renderCam, this.vw, this.vh, this.gameTime || 0);

    // 繪製場景裝飾 (地板之上、掉落物之下)
    drawDecor(this.ctx, renderCam, this.level || LEVELS.street, this.vw, this.vh);

    // 地面殘跡 (血漬/焦痕，實體之下)
    this.ground.drawDecals(this.ctx, renderCam, this.decals, this.vw, this.vh);

    // 全域色調 overlay (Soulstone 風格調光：場景染上關卡色，角色保持原色)
    this.ground.drawColorGrade(this.ctx, this.vw, this.vh, this.level || LEVELS.street);

    // 繪製掉落物
    for (const item of this.dropItems) {
      item.draw(this.ctx, renderCam);
    }

    // 繪製可引爆場景物件 (油桶/載具)
    drawExplodableProps(this, renderCam);

    // 繪製可破壞街頭物件 (木箱/補給油桶)
    for (const crate of this.destructibles) {
      crate.draw(this.ctx, renderCam);
    }

    // 繪製戰術撤離井
    if (this.extractionWell && this.extractionWell.active) {
      this.drawExtractionWell(renderCam);
    }

    // 繪製地形機制 (毒霧圈 / 地雷警示)
    drawHazards(this, renderCam);

    // 繪製武器投射物 (地面積火最底層)
    this.weaponManager.draw(this.ctx, renderCam);

    // 繪製基地核心 (守塔模式)
    if (this.core) this.core.draw(this.ctx, renderCam);

    // 繪製砲塔
    for (const t of this.turrets) {
      t.draw(this.ctx, renderCam);
    }

    // 繪製怪物
    for (const enemy of this.enemies) {
      enemy.draw(this.ctx, renderCam);
    }

    // 繪製敵方投射物
    for (const ep of this.enemyProjectiles) {
      ep.draw(this.ctx, renderCam);
    }

    // 繪製傭兵 (隊友，畫在敵人之上、特工之下)
    for (const m of this.mercenaries) {
      m.draw(this.ctx, renderCam);
    }

    // 武器掛載：斜背/後腰的武器畫在角色「之下」（才會被身體擋住一部分，像真的背在身上），
    // 主手與腰前的武器畫在角色之上。分兩層是為了讓四把武器不互相疊在一起。
    this.weaponManager.drawHeldWeapons(this.ctx, renderCam, 'back');

    // 繪製主角特工鴨
    this.player.draw(this.ctx, renderCam);

    // 手上的武器畫在角色之上：這是「帶了什麼武器」最直接的視覺答案
    this.weaponManager.drawHeldWeapons(this.ctx, renderCam, 'front');

    // 繪製流浪黑市商人
    if (this.merchant) {
      drawMerchant(this, renderCam);
    }

    // 繪製粒子、衝擊波與傷害飄字
    this.particles.draw(this.ctx, renderCam);

    // 畫面後製：暗角 + 玩家聚光，讓視覺焦點集中在主角身上
    this.ground.drawVignette(this.ctx, this.vw, this.vh, this.level || LEVELS.street);

    // Boss 大招紅閃 (畫面邊緣泛紅，最上層)
    if (this.redFlash > 0) {
      const ctx = this.ctx;
      const g = ctx.createRadialGradient(
        this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.35,
        this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
      g.addColorStop(0, 'rgba(255,0,60,0)');
      g.addColorStop(1, `rgba(255,0,60,${(0.3 * this.redFlash).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }

    // 小地圖
    this.drawMinimap();
  }


  drawExtractionWell(camera) {
    const ctx = this.ctx;
    const well = this.extractionWell;
    const rx = well.x - camera.x;
    const ry = well.y - camera.y;

    ctx.save();
    ctx.translate(rx, ry);

    const pulse = (Math.sin(this.gameTime * 4) + 1) * 0.5;
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.4 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, well.radius + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const progress = Math.min(1, well.holdTime / well.requiredTime);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, well.radius, 0, Math.PI * 2);
    ctx.fill();

    if (progress > 0) {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, well.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
    }

    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚁', 0, 0);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`撤離進度 ${Math.round(progress * 100)}%`, 0, well.radius + 18);

    ctx.restore();
  }

  // 全域色調 overlay：關卡色上下漸層，極淡染上場景 (角色繪製在其上，不受影響)

  drawMinimap() {
    const ctx = this.ctx;
    const size = this.vw < 620 ? 96 : 136;
    const pad = this.vw < 620 ? 10 : 18;
    const ox = this.vw - size - pad;
    const oy = this.vh - size - pad;

    // 以玩家為中心的局部視野。整張地圖 4000 單位縮到 136px 的話所有東西會擠成一團，
    // 只顯示周圍 RANGE 單位才看得出敵人分佈與 Boss 方位。
    const RANGE = 1300;
    const k = size / (RANGE * 2);
    const cx = ox + size / 2;
    const cy = oy + size / 2;
    const toX = (wx) => cx + (wx - this.player.x) * k;
    const toY = (wy) => cy + (wy - this.player.y) * k;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.72)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(ox, oy, size, size, 8);
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    // 地圖邊界 (走近時才會出現在小地圖上，提示別撞牆)
    const b = GAME_CONFIG.WORLD_BOUNDS;
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(toX(b.minX), toY(b.minY), (b.maxX - b.minX) * k, (b.maxY - b.minY) * k);

    // 目前畫面視野
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(toX(this.camera.x), toY(this.camera.y), this.vw * k, this.vh * k);

    // 砲塔
    ctx.fillStyle = '#00e5ff';
    for (const t of this.turrets) {
      ctx.fillRect(toX(t.x) - 2, toY(t.y) - 2, 4, 4);
    }

    // 稀有掉落物 (經驗水晶太多，標了會糊成一片)
    ctx.fillStyle = '#ffb703';
    for (const d of this.dropItems) {
      if (d.type === 'exp') continue;
      ctx.fillRect(toX(d.x) - 1.5, toY(d.y) - 1.5, 3, 3);
    }

    // 敵人
    ctx.fillStyle = 'rgba(255, 90, 90, 0.9)';
    for (const e of this.enemies) {
      if (e.isDead || e.isBoss) continue;
      ctx.fillRect(toX(e.x) - 1.5, toY(e.y) - 1.5, 3, 3);
    }

    // Boss：範圍外時貼在小地圖邊緣當方位指示
    for (const e of this.enemies) {
      if (e.isDead || !e.isBoss) continue;
      let bx = toX(e.x);
      let by = toY(e.y);
      const outside = bx < ox + 5 || bx > ox + size - 5 || by < oy + 5 || by > oy + size - 5;
      bx = Math.max(ox + 5, Math.min(ox + size - 5, bx));
      by = Math.max(oy + 5, Math.min(oy + size - 5, by));

      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(bx, by, outside ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (outside) {
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 玩家
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  _hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
}


// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  // 掛在 window 上方便在 console 觀察/除錯遊戲狀態
  window.game = new Game();
});
