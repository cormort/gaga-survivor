// 掉落物實體 (經驗水晶、磁鐵、炸彈、烤雞回血、金幣)

import { DROP_TYPES } from '../config.js';

export class DropItem {
  constructor(x, y, kind = 'EXP_GREEN') {
    this.x = x;
    this.y = y;
    this.kind = kind;

    const conf = DROP_TYPES[kind] || DROP_TYPES.EXP_GREEN;
    this.value = conf.value || 0;
    this.color = conf.color || '#00f59b';
    this.radius = conf.radius || 5;
    this.type = conf.type || 'exp';
    this.heal = conf.heal || 0;
    this.icon = conf.icon || '';

    // 吸附飛行狀態
    this.isAttracted = false;
    this.flySpeed = 0;
    this.collected = false;

    // 微浮動
    this.animTime = Math.random() * 5;
  }

  update(dt, player) {
    if (this.collected) return;

    this.animTime += dt * 5;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    // 進入拾取半徑觸發磁吸
    if (dist < player.pickupRadius) {
      this.isAttracted = true;
    }

    if (this.isAttracted) {
      this.flySpeed += 1400 * dt; // 加速飛向玩家
      if (dist > 0.1) {
        this.x += (dx / dist) * this.flySpeed * dt;
        this.y += (dy / dist) * this.flySpeed * dt;
      }

      // 觸碰玩家核心即完成拾取
      if (dist < player.radius + this.radius) {
        this.collected = true;
      }
    }
  }

  draw(ctx, camera) {
    if (this.collected) return;

    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 視野邊界優化
    if (screenX < -30 || screenX > window.innerWidth + 30 ||
        screenY < -30 || screenY > window.innerHeight + 30) {
      return;
    }

    const bob = Math.sin(this.animTime) * 2;

    ctx.save();
    ctx.translate(screenX, screenY + bob);

    if (this.type === 'exp') {
      // 繪製發光晶瑩水晶 (菱形)
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 1.3);
      ctx.lineTo(this.radius, 0);
      ctx.lineTo(0, this.radius * 1.3);
      ctx.lineTo(-this.radius, 0);
      ctx.closePath();
      ctx.fill();

      // 水晶高光
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 0.9);
      ctx.lineTo(this.radius * 0.4, 0);
      ctx.lineTo(0, this.radius * 0.4);
      ctx.lineTo(-this.radius * 0.4, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      // 道具 (磁鐵、炸彈、烤雞、金幣)
      ctx.font = `${this.radius * 2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);
    }

    ctx.restore();
  }
}
