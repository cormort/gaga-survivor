// 掉落物實體 (經驗水晶、磁鐵、炸彈、烤雞回血、金幣)

import { DROP_TYPES } from '../config.js';
import { RARITIES } from '../items.js';
import { getSprite, blit } from '../sprites.js';

// 經驗水晶 → 烘焙 sprite。水晶是場上數量最多的東西 (實測 7:50 有 126 顆佔掉落物 91%)，
// 逐顆逐幀畫向量菱形 + shadowBlur 是整個渲染最貴的一段，改走既有的烘焙管線。
const GEM_SPRITE = {
  EXP_GREEN: 'gem_green',
  EXP_BLUE: 'gem_blue',
  EXP_PURPLE: 'gem_purple',
  EXP_GOLD: 'gem_gold',
};

export class DropItem {
  constructor(x, y, kind = 'EXP_GREEN', payload = null) {
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

    this.subType = conf.subType || null;

    // 裝備掉落：帶著整件物品，顏色改用稀有度色
    this.item = payload;
    if (this.type === 'gear' && payload) {
      this.color = RARITIES[payload.rarity].color;
    }

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
      // 光暈與稜面都已烘進 sprite，這裡只剩一次 drawImage
      blit(ctx, getSprite(GEM_SPRITE[this.kind] || 'gem_green'), 0, 0, 0);
    } else if (this.type === 'gear') {
      // 裝備：稀有度光暈 + 寶箱圖示，遠遠就看得出值不值得繞路
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 2.6);
      g.addColorStop(0, this.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55 + Math.sin(this.animTime * 1.4) * 0.15;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.35, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `${this.radius * 1.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);
    } else if (this.type === 'chest') {
      // 幸運補給箱：奪目金黃光暈與外圈旋轉金環
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, this.radius * 3.2);
      g.addColorStop(0, '#ffb703');
      g.addColorStop(1, 'rgba(255, 183, 3, 0)');
      ctx.globalAlpha = 0.65 + Math.sin(this.animTime * 2) * 0.2;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `${this.radius * 2.2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon || '🧰', 0, 0);
    } else if (this.type === 'consumable') {
      // 惡魔城風格消費道具：絢麗光暈與旋轉星環
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 2.8);
      g.addColorStop(0, this.color || '#00f59b');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.6 + Math.sin(this.animTime * 2.5) * 0.2;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = this.color || '#00f59b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `${this.radius * 1.8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);
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

// ── 地圖街頭可破壞場景物 (Destructibles: 木箱 / 油桶 / 補給桶) ──
export class DestructibleCrate {
  constructor(x, y, kind = 'crate') {
    this.x = x;
    this.y = y;
    this.kind = kind; // 'crate' | 'barrel'
    this.radius = kind === 'barrel' ? 18 : 16;
    this.maxHp = kind === 'barrel' ? 40 : 25;
    this.hp = this.maxHp;
    this.isDead = false;
    this.shake = 0;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.shake = 4;
    if (this.hp <= 0) {
      this.isDead = true;
    }
    return this.isDead;
  }

  update(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 20);
    }
  }

  // 破壞時的木屑/鐵片噴濺
  splinter(particles) {
    const color = this.kind === 'barrel' ? '#4cc9f0' : '#d4a373';
    particles.createDeathParticles(this.x, this.y, color, 12);
    particles.createHitSpark(this.x, this.y, color);
  }

  draw(ctx, camera) {
    if (this.isDead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;

    if (sx < -40 || sx > window.innerWidth + 40 || sy < -40 || sy > window.innerHeight + 40) return;

    ctx.save();
    ctx.translate(sx + (Math.random() - 0.5) * this.shake, sy + (Math.random() - 0.5) * this.shake);

    if (this.kind === 'barrel') {
      // 鋼鐵油桶 / 科技物資桶
      ctx.fillStyle = '#2b2d42';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4cc9f0';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛢️', 0, 0);
    } else {
      // 復古木箱
      const size = this.radius * 2;
      ctx.fillStyle = '#8d5b4c';
      ctx.fillRect(-this.radius, -this.radius, size, size);
      ctx.strokeStyle = '#d4a373';
      ctx.lineWidth = 2;
      ctx.strokeRect(-this.radius, -this.radius, size, size);

      // 對角交叉木條
      ctx.beginPath();
      ctx.moveTo(-this.radius, -this.radius);
      ctx.lineTo(this.radius, this.radius);
      ctx.moveTo(this.radius, -this.radius);
      ctx.lineTo(-this.radius, this.radius);
      ctx.strokeStyle = '#582f0e';
      ctx.stroke();

      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📦', 0, 0);
    }

    // 若受損，顯示微型血條
    if (this.hp < this.maxHp) {
      const barW = this.radius * 2;
      const barH = 3;
      const barY = -this.radius - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-this.radius, barY, barW, barH);
      ctx.fillStyle = '#ffb703';
      ctx.fillRect(-this.radius, barY, barW * Math.max(0, this.hp / this.maxHp), barH);
    }

    ctx.restore();
  }
}

