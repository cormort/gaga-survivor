// 守塔關卡的波次與路線（只在 level.td 的關卡啟用；生存者模式完全不經過這裡）。
//
// 流程：休息（可蓋塔）→ 出波（怪從入口沿路線走）→ 該波清空 → 發波次獎金 → 下一段休息…
// 最後一波附帶終極首領，擊敗即過關（沿用主迴圈既有的 isFinal 通關判定）。
// 休息中按「提前開戰」(N) 立刻出下一波，剩餘秒數換成金幣。

import { Enemy } from '../entities/Enemy.js';
import { enemyScale } from '../levels.js';
import { projectToSegment } from '../tdlevels.js';
import { sound } from '../audio.js';

const WAVE_BONUS = (w) => 60 + w * 15;   // 清完第 w 波的獎金
const EARLY_GOLD_PER_SEC = 4;            // 提前開戰：每剩 1 秒休息 +4 金幣
const GROUP_STAGGER = 2.5;               // 同一波裡各群的起跑間隔 (秒)
const WAYPOINT_REACH = 36;               // 走到這麼近就換下一個路徑點

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
        this.queue.push({ t: gi * GROUP_STAGGER + k * grp.gap, type: grp.type, path: paths[(k + gi) % paths.length] });
      }
    });
    this.queue.sort((a, b) => a.t - b.t);
    this.clock = 0;
    this.phase = 'wave';
    this.waveIdx++;
    sound.playEvoFanfare();
    g.ui.say(`⚔️ 第 ${this.waveIdx}/${this.total} 波來襲！`, '#ff5e5e', 2);
    if (wave.boss) {
      g.spawner.spawnBoss({ ...wave.boss, final: true }, g.player, g.enemies, (boss) => g.onBossSpawned(boss));
      const [x, y] = paths[0][0];
      g.boss.x = x;
      g.boss.y = y;
    }
  }

  spawn({ type, path }) {
    const g = this.game;
    const scale = enemyScale(g.gameTime, this.level, g.rules);
    scale.hp *= g.spawner.adaptiveHpMul * (1 + 0.1 * (this.waveIdx - 1));
    const [x, y] = path[0];
    const e = new Enemy(type, x + (Math.random() - 0.5) * this.half, y + (Math.random() - 0.5) * this.half, scale);
    g.spawner.rollElite(e, g.gameTime);
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
    g.ui.say(`✅ 第 ${this.waveIdx} 波清空！+${bonus} 🪙`, '#3ddc84', 2);
    if (this.waveIdx >= this.total) {
      this.phase = 'done';   // 最後一波的首領若還活著，擊敗它就過關
      return;
    }
    this.phase = 'break';
    this.timer = this.level.breakTime;
  }

  // 沿路線走的怪：目標是下一個路徑點，走完才朝核心
  targetFor(e, core) {
    if (!e.path) return null;
    if (e.pathIdx >= e.path.length) return core;
    const [wx, wy] = e.path[e.pathIdx];
    if (Math.hypot(e.x - wx, e.y - wy) < WAYPOINT_REACH) {
      e.pathIdx++;
      if (e.pathIdx >= e.path.length) return core;
      e._wp.x = e.path[e.pathIdx][0];
      e._wp.y = e.path[e.pathIdx][1];
    }
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

  objective() {
    if (this.phase === 'break') {
      return `第 ${this.waveIdx + 1}/${this.total} 波 ‧ 佈防時間 ${Math.ceil(this.timer)} 秒（N 提前開戰拿金幣）`;
    }
    if (this.phase === 'wave') return `第 ${this.waveIdx}/${this.total} 波進攻中 ‧ 守住核心！`;
    return '最後一波！擊敗終極首領即可通關';
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
      const [gx, gy] = path[0];
      ctx.fillStyle = 'rgba(255,60,80,0.35)';
      ctx.beginPath();
      ctx.arc(gx - cam.x, gy - cam.y, w * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚪', gx - cam.x, gy - cam.y);
    }
    ctx.restore();
  }
}
