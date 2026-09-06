// 敵方投射物實體 (遠程怪酸液彈、Boss 散彈幕等)

import { GAME_CONFIG } from '../config.js';

export class EnemyProjectile {
  constructor(options = {}) {
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.damage = options.damage || 10;
    this.radius = options.radius || 6;
    this.life = options.life || 3.5;
    this.maxLife = this.life;
    this.color = options.color || '#06d6a0';
    this.glow = options.glow || options.color || '#06d6a0';
    this.isDead = false;
  }

  update(dt) {
    if (this.isDead) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 超出世界邊界則銷毀
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    if (this.x < bounds.minX - 50 || this.x > bounds.maxX + 50 ||
        this.y < bounds.minY - 50 || this.y > bounds.maxY + 50) {
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 螢幕視野裁切
    if (screenX < -50 || screenX > window.innerWidth + 50 ||
        screenY < -50 || screenY > window.innerHeight + 50) {
      return;
    }

    ctx.save();
    ctx.translate(screenX, screenY);

    // 發光效果
    ctx.shadowColor = this.glow;
    ctx.shadowBlur = 10;

    // 外層光暈
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 核心亮白高光
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(-this.radius * 0.25, -this.radius * 0.25, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
