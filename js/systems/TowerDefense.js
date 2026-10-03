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
//   - 怪的血量只看波數（TD_HP / TD_HP_GROWTH），不吃生存者時間曲線與動態難度、不擲精英

import { Enemy } from '../entities/Enemy.js';
import { enemyScale } from '../levels.js';
import { projectToSegment } from '../tdlevels.js';
import { sound } from '../audio.js';
import { heroLevelUp, drawHeroTarget } from './TDHero.js';

const WAVE_BONUS = (w) => 60 + w * 15;   // 清完第 w 波的獎金
const EARLY_GOLD_PER_SEC = 4;            // 提前開戰：每剩 1 秒休息 +4 金幣
const GROUP_STAGGER = 2.5;               // 同一波裡各群的起跑間隔 (秒)
const WAYPOINT_REACH = 36;               // 走到這麼近就換下一個路徑點
const TD_HP = 4;                         // 雜兵血量 = 基礎血量 × TD_HP × 關卡 hpScale × 難度 × 波數成長
const TD_BOSS_HP = 0.5;                   // 關卡資料裡的首領血量 × 這個倍率（調難度用的總旋鈕）
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
};
// 入口巢穴與主堡的逐格貼圖（tools/cut_td_structures.py 產生；關卡用 lair / base 欄位指定）
//   巢穴：2 列（待機、出怪中）× 2 格，每格 256×224、地面中心 (128, 214)
//   主堡：4 列（完好、受損、危急、倒塌）× 4 格，每格 224×224、地面中心 (112, 214)
export const TD_STRUCTURE_KEYS = ['lair_canyon', 'lair_swamp', 'lair_void', 'lair_hive', 'base_keep', 'base_reactor'];
export const TD_STRUCTURE_IMAGES = {};
if (typeof Image !== 'undefined') {
  for (const k of TD_STRUCTURE_KEYS) {
    const img = new Image();
    img.src = `assets/td/${k}.png`;
    TD_STRUCTURE_IMAGES[k] = img;
  }
}
const LAIR = { w: 256, h: 224, foot: 214, scale: 0.62 };   // 畫出來約 140 寬（路寬 85~95）
export const TD_LIVES = 20;              // 關卡沒寫 lives 時的預設命數
export const TD_START_GOLD = 250;        // 關卡沒寫 startGold 時的開局金幣（約 4 座基礎砲台）
export const LEAK = (e) => (e.isBoss ? 10 : 1);           // 漏一隻扣幾條命
export const bounty = (e) => (e.isBoss ? 150 : 2 + (e.exp || 1) * 2);   // 擊殺賞金

export class TowerDefense {
  constructor(game) {
    this.game = game;
    this.level = game.level;
    this.waves = this.level.waves;
    this.waveIdx = 0;                 // 下一個要出的波（0-based）
    this.phase = 'break';
    this.timer = this.level.breakTime + 6;   // 開場多給 6 秒佈防
    this.queue = [];
    this.clock = 0;
    this.half = this.level.pathWidth / 2;
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
      const bonus = Math.round(this.timer * EARLY_GOLD_PER_SEC);
      g.gold += bonus;
      g.ui.say(`⏩ 提前開戰！+${bonus} 🪙`, '#ffd166', 1.8);
    }
    const wave = this.waves[this.waveIdx];
    const paths = this.level.paths;
    this.queue = [];
    wave.groups.forEach((grp, gi) => {
      for (let k = 0; k < grp.count; k++) {
        const path = grp.path != null ? paths[grp.path % paths.length] : paths[(k + gi) % paths.length];
        this.queue.push({ t: gi * GROUP_STAGGER + k * grp.gap, type: grp.type, path });
      }
    });
    this.queue.sort((a, b) => a.t - b.t);
    this.clock = 0;
    this.phase = 'wave';
    this.waveIdx++;
    sound.playEvoFanfare();
    g.ui.say(`⚔️ 第 ${this.waveIdx}/${this.total} 波來襲！`, '#ff5e5e', 2);
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

  // 目前這一波雜兵的血量倍率（基礎 × 關卡 × 難度 × 波次）；英雄的隕石也拿它算傷害
  hpMul() {
    const w = Math.max(1, this.waveIdx);
    const wave = this.waves[w - 1];
    const waveHp = wave && wave.hp != null ? wave.hp : 1 + TD_HP_GROWTH * (w - 1);
    return TD_HP * (this.level.hpScale || 1) * this.game.rules.enemyHpMul * waveHp;
  }

  spawn({ type, path }) {
    const g = this.game;
    const scale = enemyScale(0, this.level, g.rules);   // 只取移速與傷害；血量下面重算
    scale.speed *= TD_SPEED;
    scale.hp = this.hpMul();
    const [x, y] = path[0];
    const e = new Enemy(type, x + (Math.random() - 0.5) * this.half, y + (Math.random() - 0.5) * this.half, scale);
    e.armorClass = ARMOR_CLASS[type] || 'medium';
    e.flying = e.armorClass === 'air';
    if (e.flying) path = [path[0], path[path.length - 1]];   // 飛行怪不走路線，從入口直線飛向核心
    e.path = path;
    e.pathIdx = 1;
    e.spawnTime = g.gameTime;
    e._wp = { x: path[1][0], y: path[1][1], radius: 0 };
    g.enemies.push(e);
  }

  waveCleared() {
    const g = this.game;
    const bonus = WAVE_BONUS(this.waveIdx);
    g.gold += bonus;
    heroLevelUp(g);
    g.ui.say(`✅ 第 ${this.waveIdx} 波清空！+${bonus} 🪙 ‧ 英雄升到 Lv.${g.player.heroLevel}`, '#3ddc84', 2.2);
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
    const n = this.level.paths.length;
    const entrances = new Array(n).fill(0);
    const byType = new Map();   // 同一怪種分走不同入口時合併成一筆
    for (const grp of w.groups) {
      if (grp.path != null) entrances[grp.path % n] += grp.count;
      else for (let k = 0; k < grp.count; k++) entrances[k % n]++;
      const g = byType.get(grp.type) || { type: grp.type, count: 0, armor: ARMOR_CLASS[grp.type] || 'medium' };
      g.count += grp.count;
      byType.set(grp.type, g);
    }
    return { index: this.waveIdx + 1, groups: [...byType.values()], entrances, boss: w.boss ? w.boss.name : null };
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

  // 路線：地面上的淺色帶狀路面 + 深色路肩，入口畫一個紅色門標
  draw(ctx, cam) {
    const w = this.level.pathWidth;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const path of this.level.paths) {
      const trace = () => {
        ctx.beginPath();
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x - cam.x, y - cam.y) : ctx.moveTo(x - cam.x, y - cam.y)));
      };
      trace();
      ctx.strokeStyle = 'rgba(255,170,60,0.75)';   // 亮橘路肩：一眼分得出「這是怪物的路」
      ctx.lineWidth = w + 14;
      ctx.stroke();
      trace();
      ctx.strokeStyle = 'rgba(20,16,12,0.85)';
      ctx.lineWidth = w + 4;
      ctx.stroke();
      trace();
      ctx.strokeStyle = 'rgba(120,95,60,0.9)';
      ctx.lineWidth = w;
      ctx.stroke();
      trace();
      ctx.setLineDash([22, 26]);
      ctx.lineDashOffset = -this.game.gameTime * 40;   // 流動的中線：看得出行進方向
      ctx.strokeStyle = 'rgba(255,225,160,0.7)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.setLineDash([]);
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
    ctx.restore();
  }
}
