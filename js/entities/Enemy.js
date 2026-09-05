// 怪物實體類別 (普通殭屍、突襲蝙蝠、生化巨漢、自爆蟲、Boss 暴君)

import { ENEMY_TYPES } from '../config.js';
import { getSprite, blit, FRAMES } from '../sprites.js';

export class Enemy {
  constructor(typeKey, x, y, hpMultiplier = 1) {
    const config = ENEMY_TYPES[typeKey] || ENEMY_TYPES.walker;
    this.typeKey = typeKey;
    this.name = config.name;
    this.maxHp = config.hp * hpMultiplier;
    this.hp = this.maxHp;
    this.speed = config.speed;
    this.damage = config.damage;
    this.radius = config.radius;
    this.color = config.color;
    this.exp = config.exp;
    this.isBoss = !!config.isBoss;
    this.explodes = !!config.explodes;

    this.x = x;
    this.y = y;

    // 物理擊退向量
    this.kbX = 0;
    this.kbY = 0;

    // 動畫與受傷閃白
    this.flashTimer = 0;
    this.animTimer = Math.random() * 10;
    this.fuseTimer = 0; // 自爆倒數
    this.isDead = false;

    // Boss 專屬技能冷卻
    if (this.isBoss) {
      this.chargeTimer = 0;
      this.isCharging = false;
      this.chargeDir = { x: 0, y: 0 };
    }
  }

  update(dt, player, onExplodeCallback = null) {
    if (this.isDead) return;

    this.animTimer += dt * 8;
    if (this.flashTimer > 0) this.flashTimer -= dt;

    // 計算朝向玩家的向量
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    let moveX = 0;
    let moveY = 0;

    if (this.isBoss) {
      this.updateBoss(dt, dx, dy, dist);
    } else {
      if (dist > 0.1) {
        moveX = (dx / dist) * this.speed;
        moveY = (dy / dist) * this.speed;
      }
    }

    // 自爆蟲邏輯
    if (this.explodes && dist < 65) {
      this.fuseTimer += dt;
      if (this.fuseTimer >= 0.8) {
        this.isDead = true;
        if (onExplodeCallback) onExplodeCallback(this);
      }
    }

    // 整合普通移動 + 擊退位移
    this.x += (moveX + this.kbX) * dt;
    this.y += (moveY + this.kbY) * dt;

    // 擊退力道衰減
    this.kbX *= Math.pow(0.05, dt);
    this.kbY *= Math.pow(0.05, dt);
  }

  updateBoss(dt, dx, dy, dist) {
    this.chargeTimer += dt;

    // 每 5 秒發動一次極速衝鋒
    if (!this.isCharging && this.chargeTimer >= 5.0) {
      this.isCharging = true;
      this.chargeTimer = 0;
      if (dist > 0) {
        this.chargeDir = { x: dx / dist, y: dy / dist };
      }
    }

    if (this.isCharging) {
      this.x += this.chargeDir.x * this.speed * 3.2 * dt;
      this.y += this.chargeDir.y * this.speed * 3.2 * dt;
      if (this.chargeTimer >= 1.2) {
        this.isCharging = false;
        this.chargeTimer = 0;
      }
    } else {
      if (dist > 0.1) {
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
      }
    }
  }

  takeDamage(amount, knockbackDist = 0, sourceX = 0, sourceY = 0) {
    this.hp -= amount;
    this.flashTimer = 0.08; // 閃白效果

    // 施加擊退
    if (knockbackDist > 0 && !this.isBoss) {
      const kdx = this.x - sourceX;
      const kdy = this.y - sourceY;
      const kdist = Math.hypot(kdx, kdy);
      if (kdist > 0) {
        this.kbX += (kdx / kdist) * knockbackDist * 12;
        this.kbY += (kdy / kdist) * knockbackDist * 12;
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
    return this.isDead;
  }

  // sprite 變體 (自爆點火 / Boss 衝鋒各有一組烘焙好的圖)
  get spriteKey() {
    if (this.explodes && this.fuseTimer > 0) return 'boomer_armed';
    if (this.isBoss && this.isCharging) return 'boss_charging';
    return this.typeKey;
  }

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 視野裁切 (超出螢幕過多則跳過繪製以優化效能)
    if (screenX < -90 || screenX > window.innerWidth + 90 ||
        screenY < -90 || screenY > window.innerHeight + 90) {
      return;
    }

    const sprite = getSprite(this.spriteKey);
    const frame = Math.floor(this.animTimer * 1.4) % FRAMES;

    // 自爆倒數時整隻膨脹
    if (this.explodes && this.fuseTimer > 0) {
      const swell = 1 + this.fuseTimer * 0.3;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.scale(swell, swell);
      blit(ctx, sprite, frame, 0, 0, this.flashTimer > 0);
      ctx.restore();
    } else {
      blit(ctx, sprite, frame, screenX, screenY, this.flashTimer > 0);
    }

    // 非滿血且非 Boss 時顯示小血條 (Boss 有頂部專屬 HUD)
    if (!this.isBoss && this.hp < this.maxHp) {
      ctx.save();
      ctx.translate(screenX, screenY);
      this.drawMiniHpBar(ctx);
      ctx.restore();
    }
  }

  drawMiniHpBar(ctx) {
    const barW = this.radius * 1.6;
    const barH = 3;
    const barX = -barW / 2;
    const barY = -this.radius - 8;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 2.5);
    ctx.fill();

    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(0, barW * pct), barH, 1.5);
    ctx.fill();
  }
}
