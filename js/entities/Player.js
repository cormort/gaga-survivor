// 特工鴨 (Player) 實體類別 - 包含精緻特工裝扮繪製、屬性與成長邏輯

import { GAME_CONFIG } from '../config.js';
import { sound } from '../audio.js';
import { getSprite, blit, FRAMES } from '../sprites.js';
import { CHARACTERS } from '../characters.js';

export class Player {
  constructor(x = 0, y = 0, characterId = 'duck') {
    this.character = CHARACTERS[characterId] || CHARACTERS.duck;
    this.x = x;
    this.y = y;
    this.radius = 18;

    // 基礎生命與經驗
    this.maxHp = 100;
    this.hp = this.maxHp;
    this.level = 1;
    this.exp = 0;
    this.nextExp = GAME_CONFIG.BASE_EXP_REQUIREMENT;
    this.baseSpeed = 190;

    // 基礎拾取範圍
    this.basePickupRadius = 90;

    // 角色特質提供的基礎值 (被動重算時會回歸到這組數字，而非寫死的 1.0)
    this.baseSpeedMul = 1.0;
    this.baseMagnet = 1.0;
    this.damageTakenMul = 1.0;
    this.critChance = 0;
    this.overloadTimer = 0;

    // 被動加成倍率 (升級被動時更新)
    this.damageMultiplier = 1.0;
    this.speedMultiplier = 1.0;
    this.cdrMultiplier = 1.0; // 冷卻縮減 (例如 0.84 代表 CD 變成 84%)
    this.rangeMultiplier = 1.0;
    this.magnetMultiplier = 1.0;
    this.hpRegen = 0;

    // 狀態
    this.facing = 1; // 1: 右, -1: 左
    this.invulnerableTimer = 0;
    this.walkCycle = 0;
    this.isDead = false;
    this.regenTimer = 0;

    // 套用角色專屬特質的初始值
    this.character.init?.(this);
    this.speedMultiplier = this.baseSpeedMul;
    this.magnetMultiplier = this.baseMagnet;
  }

  get pickupRadius() {
    return this.basePickupRadius * this.magnetMultiplier;
  }

  get speed() {
    return this.baseSpeed * this.speedMultiplier;
  }

  update(dt, inputVector) {
    if (this.isDead) return;

    // 移動
    if (inputVector.x !== 0 || inputVector.y !== 0) {
      this.x += inputVector.x * this.speed * dt;
      this.y += inputVector.y * this.speed * dt;

      if (inputVector.x > 0.1) this.facing = 1;
      else if (inputVector.x < -0.1) this.facing = -1;

      this.walkCycle += dt * 14;
    } else {
      this.walkCycle = 0;
    }

    // 地圖邊界限制
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x));
    this.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.y));

    // 無敵時間遞減
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    // 生命自動回復
    if (this.hpRegen > 0 && this.hp < this.maxHp) {
      this.regenTimer += dt;
      if (this.regenTimer >= 1.0) {
        this.heal(this.hpRegen);
        this.regenTimer = 0;
      }
    }
  }

  takeDamage(amount) {
    if (this.invulnerableTimer > 0 || this.isDead) return false;

    this.hp -= Math.round(amount * this.damageTakenMul);
    this.invulnerableTimer = 0.5; // 0.5 秒無敵時間
    sound.playHurt();

    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
    return true;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  gainExp(amount) {
    this.exp += amount;
    let leveledUp = false;

    while (this.exp >= this.nextExp) {
      this.exp -= this.nextExp;
      this.level++;
      this.nextExp = Math.floor(this.nextExp * GAME_CONFIG.EXP_GROWTH_FACTOR);
      leveledUp = true;
    }

    return leveledUp;
  }

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 拾取範圍光圈 + 腳下聚光 (半徑會隨磁力升級變動，維持即時繪製)
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.10)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, this.pickupRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.drawImage(Player.glow(), -56, -50, 112, 112);
    ctx.restore();

    // 無敵時間閃爍
    if (this.invulnerableTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
      this.drawHpBar(ctx, screenX, screenY);
      return;
    }

    const sprite = getSprite(this.character.sprite);
    const frame = this.walkCycle > 0
      ? Math.floor(this.walkCycle / (Math.PI * 2) * FRAMES) % FRAMES
      : 0;

    ctx.save();
    ctx.translate(screenX, screenY);
    if (this.facing < 0) ctx.scale(-1, 1);
    blit(ctx, sprite, frame, 0, 0);
    ctx.restore();

    this.drawHpBar(ctx, screenX, screenY);
  }

  // ponytail: 腳下暖光烘焙一次就好
  static glow() {
    if (!Player._glow) {
      const c = document.createElement('canvas');
      c.width = c.height = 112;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(56, 56, 4, 56, 56, 56);
      g.addColorStop(0, 'rgba(255, 214, 90, 0.22)');
      g.addColorStop(1, 'rgba(255, 214, 90, 0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 112, 112);
      Player._glow = c;
    }
    return Player._glow;
  }

  drawHpBar(ctx, screenX, screenY) {
    const barW = 44;
    const barH = 6;
    const barX = screenX - barW / 2;
    const barY = screenY - 32;
    const pct = Math.max(0, this.hp / this.maxHp);

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.85)';
    ctx.beginPath();
    ctx.roundRect(barX - 1.5, barY - 1.5, barW + 3, barH + 3, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const color = pct > 0.6 ? '#00f59b' : pct > 0.3 ? '#ffb703' : '#ff0055';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(0, barW * pct), barH, 3);
    ctx.fill();
    ctx.restore();
  }
}
