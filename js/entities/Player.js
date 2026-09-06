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
    this.metaDmg = 0; // 局外天賦「火力核心」的常駐傷害加成 (applyPassives 重置時要加回去)
    this.metaCdr = 0; // 局外裝備的冷卻縮減 (0~1)，在被動算完之後再乘上去
    this.metaCrit = 0;     // 局外裝備的暴擊率 (0~1)
    this.metaCritDmg = 0;  // 局外裝備的暴擊傷害加值 (2 之外的額外倍率)
    this.metaArmor = 0;    // 局外裝備的減傷 (0~1，乘在 damageTakenMul 之後)
    this.metaExp = 0;      // 局外裝備的經驗加成 (0~1)
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

    // 戰術閃避翻滾 (Dash)
    this.dashCooldown = 3.8;
    this.dashMaxTimer = this.dashCooldown; // 含 CDR 後的本輪實際冷卻 (UI 覆蓋層比例用)
    this.dashTimer = 0;
    this.dashDuration = 0.22;
    this.dashTimeLeft = 0;
    this.dashDir = { x: 1, y: 0 };
    this.dashGhosts = [];

    // 套用角色專屬特質的初始值
    this.character.init?.(this);
    this.speedMultiplier = this.baseSpeedMul;
    this.magnetMultiplier = this.baseMagnet;
    // 被動(防彈護甲)重算生命上限的基準：角色 init 若抬高 maxHp (企鵝 130) 要留在這裡
    this.baseMaxHp = this.maxHp;
  }

  get pickupRadius() {
    return this.basePickupRadius * this.magnetMultiplier;
  }

  get speed() {
    return this.baseSpeed * this.speedMultiplier;
  }

  // 觸發戰術閃避翻滾
  dash(inputVector) {
    if (this.dashTimer > 0 || this.dashTimeLeft > 0 || this.isDead) return false;

    let dirX = inputVector?.x || 0;
    let dirY = inputVector?.y || 0;
    const len = Math.hypot(dirX, dirY);

    if (len > 0.1) {
      this.dashDir = { x: dirX / len, y: dirY / len };
    } else {
      this.dashDir = { x: this.facing, y: 0 };
    }

    this.dashTimeLeft = this.dashDuration;
    // 局外 CDR 可微幅減免翻滾冷卻，至多 -30%
    const cdrMod = Math.max(0.7, 1 - (this.metaCdr || 0) * 0.5);
    this.dashMaxTimer = this.dashCooldown * cdrMod;
    this.dashTimer = this.dashCooldown * cdrMod;
    this.invulnerableTimer = Math.max(this.invulnerableTimer, this.dashDuration + 0.1);
    sound.playDash();
    return true;
  }

  update(dt, inputVector) {
    if (this.isDead) return;

    // 閃避冷卻計時
    if (this.dashTimer > 0) this.dashTimer -= dt;

    // 翻滾狀態 vs 普通移動
    if (this.dashTimeLeft > 0) {
      this.dashTimeLeft -= dt;
      const dashSpeed = this.speed * 3.6;
      this.x += this.dashDir.x * dashSpeed * dt;
      this.y += this.dashDir.y * dashSpeed * dt;

      // 產生殘影
      this.dashGhosts.push({
        x: this.x,
        y: this.y,
        facing: this.facing,
        alpha: 0.6,
      });
      this.walkCycle += dt * 25;
    } else if (inputVector.x !== 0 || inputVector.y !== 0) {
      this.x += inputVector.x * this.speed * dt;
      this.y += inputVector.y * this.speed * dt;

      if (inputVector.x > 0.1) this.facing = 1;
      else if (inputVector.x < -0.1) this.facing = -1;

      this.walkCycle += dt * 14;
    } else {
      this.walkCycle = 0;
    }

    // 更新殘影透明度
    for (let i = this.dashGhosts.length - 1; i >= 0; i--) {
      const g = this.dashGhosts[i];
      g.alpha -= dt * 3.8;
      if (g.alpha <= 0) {
        this.dashGhosts.splice(i, 1);
      }
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

    this.hp -= Math.round(amount * this.damageTakenMul * (1 - (this.metaArmor || 0)));
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

    // 繪製翻滾殘影 (白色電光幻影)
    for (const g of this.dashGhosts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, g.alpha));
      ctx.translate(g.x - camera.x, g.y - camera.y);
      if (g.facing < 0) ctx.scale(-1, 1);
      blit(ctx, sprite, frame, 0, 0, true);
      ctx.restore();
    }

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
