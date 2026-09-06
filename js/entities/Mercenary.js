// 傭兵 (局內 AI 幫手)：花金幣僱傭，跟隨特工自動索敵射擊；擊殺升級、會被咬死要重雇。
// 像「會移動的砲塔」：不吃武器槽、不進升級三選一，純局內消耗金幣的戰力。

import { GAME_CONFIG } from '../config.js';
import { sound } from '../audio.js';

export const MERC = {
  baseCost: 80,     // 首名費用
  costGrowth: 60,   // 每多雇一名更貴
  maxCount: 3,
  maxLevel: 5,
  hpPerLevel: [90, 130, 170, 210, 250],
  damagePerLevel: [12, 19, 26, 33, 40],
  baseCooldown: 0.95,   // 隨等級微降
  range: 250,
  followSpeed: 250,
  bulletSpeed: 540,
};

// 三種隊形站位 (以玩家為中心)
const FORMATION = [
  { x: -46, y: 6 },
  { x: 46, y: 6 },
  { x: 0, y: -40 },
];

export class Mercenary {
  constructor(x, y, index = 0) {
    this.x = x;
    this.y = y;
    this.index = index;
    this.level = 1;
    this.exp = 0;
    this.maxHp = MERC.hpPerLevel[0];
    this.hp = this.maxHp;
    this.fireCd = 0.6;
    this.angle = Math.PI;       // 槍口指向 (索敵時更新)
    this.flashTimer = 0;
    this.sway = Math.random() * Math.PI * 2;
    this.isDead = false;
  }

  get damage() {
    return MERC.damagePerLevel[this.level - 1] || MERC.damagePerLevel[MERC.damagePerLevel.length - 1];
  }

  get cooldown() {
    return Math.max(0.6, MERC.baseCooldown - 0.05 * (this.level - 1));
  }

  nextExp() {
    return this.level * 3; // Lv1 殺 3 隻升 2，依此類推
  }

  // 傭兵親手擊殺敵人時由主迴圈呼叫
  gainKill() {
    this.exp++;
    if (this.exp >= this.nextExp() && this.level < MERC.maxLevel) {
      this.exp -= this.nextExp();
      this.level++;
      const prevMax = this.maxHp;
      this.maxHp = MERC.hpPerLevel[this.level - 1];
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - prevMax));
      sound.playGem();
    }
  }

  update(dt, player, enemies, onFire) {
    if (this.isDead) return;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    this.sway += dt * 2.2;

    // 跟隨隊形站位 (帶輕微搖擺，避免三個疊成一坨)
    const off = FORMATION[this.index % FORMATION.length];
    const tx = player.x + off.x + Math.sin(this.sway) * 8;
    const ty = player.y + off.y + Math.cos(this.sway * 0.7) * 8;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6) {
      const spd = Math.min(MERC.followSpeed, dist * 6) * dt;
      this.x += (dx / dist) * spd;
      this.y += (dy / dist) * spd;
    }

    // 地圖邊界限制
    const b = GAME_CONFIG.WORLD_BOUNDS;
    this.x = Math.max(b.minX + 30, Math.min(b.maxX - 30, this.x));
    this.y = Math.max(b.minY + 30, Math.min(b.maxY - 30, this.y));

    // 索敵 (最近敵人優先，範圍平方比較)
    this.fireCd -= dt;
    let target = null;
    let best = MERC.range * MERC.range;
    for (const e of enemies) {
      if (e.isDead) continue;
      const edx = e.x - this.x;
      const edy = e.y - this.y;
      const d2 = edx * edx + edy * edy;
      if (d2 < best) {
        best = d2;
        target = e;
      }
    }
    if (target) {
      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.fireCd <= 0 && onFire) {
        this.fireCd = this.cooldown;
        onFire(this, target);
      }
    }
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.hp -= amount; // 保留浮點：敵人啃食是每幀小量累積，round 會把小傷害歸零
    this.flashTimer = 0.08;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    if (this.isDead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (sx < -60 || sx > window.innerWidth + 60 || sy < -60 || sy > window.innerHeight + 60) return;

    ctx.save();
    ctx.translate(sx, sy);

    // 陰影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 槍管 (朝向索敵方向)
    ctx.save();
    ctx.rotate(this.angle);
    ctx.fillStyle = '#3a4756';
    ctx.strokeStyle = '#141b26';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(2, -2.6, 16, 5.2, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 身體 (迷彩綠圓身)
    ctx.fillStyle = this.flashTimer > 0 ? '#ffffff' : '#4a7c3f';
    ctx.strokeStyle = '#1f3b1d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 貝雷帽
    ctx.fillStyle = '#2f5d2a';
    ctx.beginPath();
    ctx.arc(-1, -5, 6.5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(3.5, -8.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#0a0f19';
    ctx.beginPath();
    ctx.arc(2, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 血條 + 等級
    const barW = 26;
    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(-barW / 2 - 1, -19, barW + 2, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = pct > 0.35 ? '#3ddc84' : '#ff5e5e';
    ctx.beginPath();
    ctx.roundRect(-barW / 2, -18, barW * pct, 3, 1.5);
    ctx.fill();
    if (this.level > 1) {
      ctx.fillStyle = '#ffd60a';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Lv${this.level}`, 0, -22);
    }

    ctx.restore();
  }
}
