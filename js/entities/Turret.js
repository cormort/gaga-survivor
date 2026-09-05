// 防禦砲塔 (塔防機制)：花金幣就地佈署，自動掃射範圍內敵人，會被敵人啃壞。

import { getSprite } from '../sprites.js';

export const TURRET = {
  baseCost: 60,
  costGrowth: 40,   // 每多蓋一座就更貴
  minSpacing: 70,   // 兩座砲塔的最小間距
  maxHp: 900,   // 一隻喪屍啃約 8 DPS，被三四隻圍住還能撐 20 秒左右
  range: 270,
  cooldown: 0.55,
  damage: 26,
  radius: 20,
};

export class Turret {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = TURRET.radius;
    this.maxHp = TURRET.maxHp;
    this.hp = this.maxHp;
    this.cooldownTimer = 0;
    this.angle = 0;
    this.muzzleTimer = 0;   // 開火閃光
    this.beam = null;       // 最近一次射線 (畫面用)
    this.isDead = false;
  }

  update(dt, enemies, onHit) {
    this.cooldownTimer -= dt;
    if (this.muzzleTimer > 0) this.muzzleTimer -= dt;

    // 鎖定範圍內最近的敵人 (Boss 優先，避免砲塔一直打雜兵)
    let target = null;
    let bestDist = TURRET.range;
    for (const e of enemies) {
      if (e.isDead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > TURRET.range) continue;
      const score = e.isBoss ? d * 0.5 : d;
      if (score < bestDist) {
        bestDist = score;
        target = e;
      }
    }
    if (!target) {
      this.beam = null;
      return;
    }

    this.angle = Math.atan2(target.y - this.y, target.x - this.x);

    if (this.cooldownTimer > 0) return;
    this.cooldownTimer = TURRET.cooldown;
    this.muzzleTimer = 0.09;
    this.beam = { x: target.x, y: target.y, life: 0.09 };
    onHit(target, TURRET.damage);
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (sx < -80 || sx > window.innerWidth + 80 || sy < -80 || sy > window.innerHeight + 80) return;

    // 射程圈 (很淡)
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, TURRET.range, 0, Math.PI * 2);
    ctx.stroke();

    // 雷射線
    if (this.beam && this.muzzleTimer > 0) {
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(this.angle) * 18, sy + Math.sin(this.angle) * 18);
      ctx.lineTo(this.beam.x - camera.x, this.beam.y - camera.y);
      ctx.stroke();
    }

    // 底座 (烘焙 sprite)
    const sp = getSprite('turret');
    ctx.drawImage(sp.frames[0], sx - sp.w / 2, sy - sp.h / 2, sp.w, sp.h);

    // 砲管 (跟著目標轉，兩筆繪製就夠)
    ctx.save();
    ctx.translate(sx, sy - 4);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#4a5b70';
    ctx.strokeStyle = '#141b26';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(0, -3.5, 20, 7, 3);
    ctx.fill();
    ctx.stroke();
    if (this.muzzleTimer > 0) {
      ctx.fillStyle = 'rgba(0,245,255,0.9)';
      ctx.beginPath();
      ctx.arc(22, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 血條
    if (this.hp < this.maxHp) {
      const w = 40;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(sx - w / 2 - 1, sy - 30, w + 2, 5);
      ctx.fillStyle = this.hp / this.maxHp > 0.35 ? '#00e5ff' : '#ff0055';
      ctx.fillRect(sx - w / 2, sy - 29, w * (this.hp / this.maxHp), 3);
    }
  }
}
