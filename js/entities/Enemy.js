// 怪物實體類別 (普通殭屍、突襲蝙蝠、生化巨漢、自爆蟲、Boss 暴君)

import { ENEMY_TYPES, ELITE_AFFIXES } from '../config.js';
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
    this.dash = config.dash || null;          // 狂奔感染者：週期衝刺
    this.splitInto = config.splitInto || null; // 孢子母體：死亡裂解
    this.splitCount = config.splitCount || 0;
    this.dashTimer = this.dash ? Math.random() * this.dash.every : 0;
    this.dashLeft = 0;

    // 精英詞綴 (由 Spawner 隨機賦予；Boss 不會有)
    this.isElite = false;
    this.affixKey = null;
    this.eliteColor = null;
    this.damageTakenMul = config.damageTakenMul || 1; // 盾衛自帶減傷，裝甲詞綴再疊乘
    this.spriteScale = 1;    // 巨獸詞綴放大繪製用

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
      this.skillTimer = 5;       // 離下一次專屬技能的時間
      this.behaviors = [];       // 由關卡 boss 定義帶入：'summon' / 'nova'
    }
  }

  // 賦予精英詞綴 (數值、外觀、受傷乘數一次到位)
  makeElite(affixKey) {
    const a = ELITE_AFFIXES[affixKey];
    if (!a) return;
    this.isElite = true;
    this.affixKey = affixKey;
    this.eliteColor = a.color;
    this.maxHp = Math.round(this.maxHp * (a.hpMul || 1));
    this.hp = this.maxHp;
    this.speed *= a.speedMul || 1;
    this.damage = Math.round(this.damage * (a.damageMul || 1));
    this.radius = Math.round(this.radius * (a.radiusMul || 1));
    this.spriteScale = a.radiusMul || 1; // 巨獸體型跟著放大 (碰撞半徑同步)
    this.damageTakenMul *= a.damageTakenMul || 1;
    this.exp = Math.round(this.exp * (a.expMul || 1));
  }

  update(dt, player, onExplodeCallback = null, onBossSkill = null) {
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
      this.updateBoss(dt, dx, dy, dist, onBossSkill);
    } else {
      const spd = this.speed * this.dashSpeedMul(dt); // 每幀只推進一次衝刺計時
      if (dist > 0.1) {
        moveX = (dx / dist) * spd;
        moveY = (dy / dist) * spd;
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

  // 衝刺怪：平時走路，冷卻到就短暫加速直撲玩家 (回傳當幀速度倍率)
  dashSpeedMul(dt) {
    if (!this.dash) return 1;
    if (this.dashLeft > 0) {
      this.dashLeft -= dt;
      return this.dash.mul;
    }
    this.dashTimer += dt;
    if (this.dashTimer >= this.dash.every) {
      this.dashTimer = 0;
      this.dashLeft = this.dash.dur;
      return this.dash.mul;
    }
    return 1;
  }

  updateBoss(dt, dx, dy, dist, onBossSkill = null) {
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

    // 關卡專屬技能定時施放：summon 召喚小怪 / nova 範圍震波
    if (this.skillTimer > 0) {
      this.skillTimer -= dt;
      if (this.skillTimer <= 0 && this.behaviors && this.behaviors.length > 0) {
        this.skillTimer = 8 + Math.random() * 3;
        const act = this.behaviors[Math.floor(Math.random() * this.behaviors.length)];
        if (onBossSkill) onBossSkill(this, act);
      }
    }
  }

  takeDamage(amount, knockbackDist = 0, sourceX = 0, sourceY = 0) {
    // 裝甲詞綴減傷；至少造成 1 點，避免高血量時永遠打不動
    this.hp -= Math.max(1, Math.round(amount * (this.damageTakenMul || 1)));
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
    const scale = this.spriteScale || 1;

    if (scale !== 1) {
      // 巨獸詞綴：整隻放大 (自爆膨脹與詞綴倍率疊乘)
      ctx.save();
      ctx.translate(screenX, screenY);
      const swell = this.explodes && this.fuseTimer > 0 ? 1 + this.fuseTimer * 0.3 : 1;
      ctx.scale(scale * swell, scale * swell);
      blit(ctx, sprite, frame, 0, 0, this.flashTimer > 0);
      ctx.restore();
    } else if (this.explodes && this.fuseTimer > 0) {
      // 自爆倒數時整隻膨脹
      const swell = 1 + this.fuseTimer * 0.3;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.scale(swell, swell);
      blit(ctx, sprite, frame, 0, 0, this.flashTimer > 0);
      ctx.restore();
    } else {
      blit(ctx, sprite, frame, screenX, screenY, this.flashTimer > 0);
    }

    // 衝刺中的紅色尾焰警示
    if (this.dashLeft > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 非滿血且非 Boss 時顯示小血條 (Boss 有頂部專屬 HUD)
    if (!this.isBoss && this.hp < this.maxHp) {
      ctx.save();
      ctx.translate(screenX, screenY);
      this.drawMiniHpBar(ctx);
      ctx.restore();
    }

    // 精英光環 (呼吸燈標示詞綴怪)
    if (this.isElite && this.eliteColor) {
      const pulse = 0.4 + Math.sin(this.animTimer * 2.2) * 0.18;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.strokeStyle = this.eliteColor;
      ctx.globalAlpha = Math.max(0.15, pulse);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(18, this.radius + 8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Boss 專屬技能前搖警示 (光圈越亮越接近施放)
    if (this.isBoss && this.behaviors && this.behaviors.length > 0 &&
        this.skillTimer > 0 && this.skillTimer < 1.5) {
      const warn = 1 - this.skillTimer / 1.5;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.strokeStyle = '#ff0055';
      ctx.globalAlpha = 0.15 + warn * 0.5;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 7 * (1 - warn * 0.25), 0, Math.PI * 2);
      ctx.stroke();
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
