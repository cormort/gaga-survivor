// 武器投射物與攻擊實體 (苦無、旋轉輪盤、火箭爆破、地面积火、落雷、彈跳足球)

import { GAME_CONFIG } from '../config.js';

export class Projectile {
  constructor(options) {
    this.type = options.type || 'bullet';
    this.weaponId = options.weaponId || 'kunai';
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.damage = options.damage || 10;
    this.radius = options.radius || 6;
    this.knockback = options.knockback || 2;
    this.pierce = options.pierce || 1; // 穿透次數
    this.life = options.life || 3.0; // 存活時間
    this.isDead = false;

    // 專屬屬性
    this.isEvo = !!options.isEvo;
    this.isCrit = false; // 由 WeaponManager 依當次射擊是否暴擊標記
    this.hitEnemies = new Set(); // 避免同一次碰撞連續重複傷害

    // 旋轉護盾專屬
    this.orbitAngle = options.orbitAngle || 0;
    this.orbitRadius = options.orbitRadius || 70;
    this.spinSpeed = options.spinSpeed || 3.5;

    // 燃燒火海專屬
    this.tickTimer = 0;
    this.tickInterval = 0.25;

    // 火箭專屬
    this.explosionRadius = options.explosionRadius || 80;
    this.hasExploded = false;

    // 足球專屬
    this.bounces = options.bounces || 6;

    // 傭兵專屬 (擊殺升級 credit)
    this.mercOwner = options.mercOwner || null;
  }

  update(dt, player, onExplosion = null) {
    if (this.isDead) return;
    this.life -= dt;
    if (this.life <= 0) {
      if (this.type === 'rocket' && !this.hasExploded && onExplosion) {
        onExplosion(this);
      }
      this.isDead = true;
      return;
    }

    switch (this.type) {
      case 'kunai':
      case 'merc':
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        break;

      case 'guardian':
      case 'saw':
        // 環繞玩家旋轉
        this.orbitAngle += this.spinSpeed * dt;
        this.x = player.x + Math.cos(this.orbitAngle) * this.orbitRadius;
        this.y = player.y + Math.sin(this.orbitAngle) * this.orbitRadius;
        break;

      case 'rocket':
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        break;

      case 'fire_pool':
        // 地面積火固定在原處，定時跳傷害
        this.tickTimer += dt;
        if (this.tickTimer >= this.tickInterval) {
          this.tickTimer = 0;
          this.hitEnemies.clear(); // 每跳重置命中清單，允許持續灼燒
        }
        break;

      case 'soccer':
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // 螢幕與世界邊界反彈
        const bounds = GAME_CONFIG.WORLD_BOUNDS;
        if (this.x < bounds.minX || this.x > bounds.maxX) {
          this.vx *= -1;
          this.bounces--;
        }
        if (this.y < bounds.minY || this.y > bounds.maxY) {
          this.vy *= -1;
          this.bounces--;
        }
        if (this.bounces <= 0) {
          this.isDead = true;
        }
        break;

      default:
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        break;
    }
  }

  draw(ctx, camera) {
    if (this.isDead) return;

    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 視野優化
    if (screenX < -150 || screenX > window.innerWidth + 150 ||
        screenY < -150 || screenY > window.innerHeight + 150) {
      return;
    }

    ctx.save();
    ctx.translate(screenX, screenY);

    switch (this.type) {
      case 'kunai':
        this.drawKunai(ctx);
        break;

      case 'merc':
        this.drawMerc(ctx);
        break;

      case 'guardian':
        this.drawGuardian(ctx);
        break;

      case 'saw':
        this.drawSaw(ctx);
        break;

      case 'drill':
        this.drawDrill(ctx);
        break;

      case 'rocket':
        this.drawRocket(ctx);
        break;

      case 'fire_pool':
        this.drawFirePool(ctx);
        break;

      case 'soccer':
        this.drawSoccer(ctx);
        break;

      default:
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
  }

  // 傭兵能量彈 (金色曳光)
  drawMerc(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.ellipse(4, 0, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(-1, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawKunai(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);

    if (this.isEvo) {
      // 幽靈手裏劍 (藍色發光飛刀)
      ctx.fillStyle = '#00f5ff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = '#e2e8f0';
    }

    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();

    // 苦無握柄
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
  }

  drawGuardian(ctx) {
    ctx.rotate(this.orbitAngle * 4);

    if (this.isEvo) {
      // 永恆守護力場 (金光炫目光盾)
      ctx.fillStyle = '#ffb703';
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = '#00e5ff';
      ctx.shadowColor = '#00b4d8';
      ctx.shadowBlur = 6;
    }

    // 圓形鋒利轉輪
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 外圈鋸齒旋轉刀刃
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * this.radius, Math.sin(a) * this.radius);
      ctx.lineTo(Math.cos(a) * (this.radius + 6), Math.sin(a) * (this.radius + 6));
      ctx.stroke();
    }
  }

  // 相位飛刃 (旋轉鑽刃)
  drawDrill(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);

    if (this.isEvo) {
      ctx.fillStyle = '#b5179e';
      ctx.shadowColor = '#e0aaff';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = '#7fb2a5';
      ctx.shadowColor = '#4a7c3f';
      ctx.shadowBlur = 4;
    }
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(9, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 重力環鋸 (紫色旋轉鋸輪)
  drawSaw(ctx) {
    ctx.rotate(this.orbitAngle * 5);

    if (this.isEvo) {
      // 重力奇點環 (金色)
      ctx.fillStyle = '#ffd60a';
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = '#9d4edd';
      ctx.shadowColor = '#c77dff';
      ctx.shadowBlur = 6;
    }

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 外圈鋸齒刀刃
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * this.radius, Math.sin(a) * this.radius);
      ctx.lineTo(Math.cos(a) * (this.radius + 5), Math.sin(a) * (this.radius + 5));
      ctx.stroke();
    }
  }

  drawRocket(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);

    if (this.isEvo) {
      // 鯊魚核彈
      ctx.fillStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 14;
    } else {
      ctx.fillStyle = '#ff9900';
    }

    // 彈頭
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -6);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();

    // 噴射火焰
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-18, -3);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-18, 3);
    ctx.closePath();
    ctx.fill();
  }

  drawFirePool(ctx) {
    const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.06;
    const r = this.radius * pulse;

    const grad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    if (this.isEvo) {
      // 藍色高溫煉獄
      grad.addColorStop(0, 'rgba(0, 245, 255, 0.85)');
      grad.addColorStop(0.6, 'rgba(114, 9, 183, 0.55)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      grad.addColorStop(0, 'rgba(255, 180, 0, 0.8)');
      grad.addColorStop(0.6, 'rgba(255, 0, 60, 0.45)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSoccer(ctx) {
    ctx.rotate(this.x * 0.05);

    if (this.isEvo) {
      ctx.fillStyle = '#00f59b';
      ctx.shadowColor = '#00f59b';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = '#ffffff';
    }

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 足球黑白幾何五邊形
    ctx.fillStyle = '#11141a';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}
