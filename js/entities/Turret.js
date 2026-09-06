// 防禦砲塔 (塔防機制)：花金幣就地佈署，支援模組進化 (烈焰/極寒/電磁)

import { getSprite } from '../sprites.js';
import { sound } from '../audio.js';

export const TURRET = {
  baseCost: 60,
  costGrowth: 40,   // 每多蓋一座就更貴
  minSpacing: 70,   // 兩座砲塔的最小間距
  maxHp: 900,
  range: 270,
  cooldown: 0.55,
  damage: 26,
  radius: 20,
  upgradeCost: 50,  // 升級模組費用
};

export const TURRET_VARIANTS = {
  standard: {
    id: 'standard',
    name: '基礎雷射塔',
    color: '#00f5ff',
    range: 270,
    cooldown: 0.55,
    damage: 26,
  },
  flame: {
    id: 'flame',
    name: '🔥 烈焰噴射塔',
    color: '#ff5400',
    range: 230,
    cooldown: 0.12,
    damage: 9,
    coneAngle: Math.PI * 0.45,
  },
  cryo: {
    id: 'cryo',
    name: '❄️ 極寒脈衝塔',
    color: '#00e5ff',
    range: 250,
    cooldown: 1.8,
    damage: 40,
    pulseRadius: 210,
    slowDur: 2.5,
  },
  tesla: {
    id: 'tesla',
    name: '⚡ 磁暴電漿塔',
    color: '#b5179e',
    range: 340,
    cooldown: 0.75,
    damage: 80,
    chainCount: 3,
  },
};

export class Turret {
  constructor(x, y, variant = 'standard') {
    this.x = x;
    this.y = y;
    this.radius = TURRET.radius;
    this.maxHp = TURRET.maxHp;
    this.hp = this.maxHp;
    this.variant = variant;
    this.conf = TURRET_VARIANTS[variant] || TURRET_VARIANTS.standard;

    this.cooldownTimer = 0;
    this.angle = 0;
    this.muzzleTimer = 0;   // 開火閃光
    this.beam = null;       // 最近一次射線 (畫面用)
    this.chainTargets = [];
    this.pulseTimer = 0;
    this.isDead = false;
  }

  upgrade(variantKey) {
    if (!TURRET_VARIANTS[variantKey]) return;
    this.variant = variantKey;
    this.conf = TURRET_VARIANTS[variantKey];
    this.maxHp += 300;
    this.hp = this.maxHp;
    sound.playGem();
  }

  update(dt, enemies, onHit) {
    this.cooldownTimer -= dt;
    if (this.muzzleTimer > 0) this.muzzleTimer -= dt;
    if (this.pulseTimer > 0) this.pulseTimer -= dt;

    if (this.variant === 'cryo') {
      // 極寒脈衝：全周波範圍震波 + 減速
      if (this.cooldownTimer <= 0) {
        this.cooldownTimer = this.conf.cooldown;
        this.pulseTimer = 0.35;
        sound.playExplosion();
        for (const e of enemies) {
          if (e.isDead) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d <= this.conf.pulseRadius) {
            onHit(e, this.conf.damage);
            // 減速：寫入 Enemy 的 slowTimer (遊戲時間驅動)，暫停即凍結、疊加安全
            e.slowTimer = Math.max(e.slowTimer || 0, this.conf.slowDur);
          }
        }
      }
      return;
    }

    // 鎖定範圍內最近的敵人 (Boss 優先，避免砲塔一直打雜兵)
    let target = null;
    const range2 = this.conf.range * this.conf.range;
    let bestScore = range2;
    for (const e of enemies) {
      if (e.isDead) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > range2) continue;
      const score = e.isBoss ? d2 * 0.25 : d2;
      if (score < bestScore) {
        bestScore = score;
        target = e;
      }
    }
    if (!target) {
      this.beam = null;
      this.chainTargets = [];
      return;
    }

    this.angle = Math.atan2(target.y - this.y, target.x - this.x);

    if (this.cooldownTimer > 0) return;
    this.cooldownTimer = this.conf.cooldown;
    this.muzzleTimer = 0.08;

    if (this.variant === 'flame') {
      // 烈焰噴射：扇形貫穿傷害
      this.beam = { x: target.x, y: target.y, life: 0.1 };
      for (const e of enemies) {
        if (e.isDead) continue;
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d <= this.conf.range) {
          const ang = Math.atan2(dy, dx);
          let diff = Math.abs(ang - this.angle);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff <= this.conf.coneAngle / 2) {
            onHit(e, this.conf.damage);
          }
        }
      }
      sound.playShoot();
    } else if (this.variant === 'tesla') {
      // 磁暴電漿：連鎖電弧跳躍
      this.beam = { x: target.x, y: target.y, life: 0.12 };
      onHit(target, target.isBoss ? this.conf.damage * 2.2 : this.conf.damage);

      // 尋找次級目標連鎖
      this.chainTargets = [];
      let lastTarget = target;
      for (let c = 1; c < this.conf.chainCount; c++) {
        let nextT = null;
        let bestDist2 = 180 * 180;
        for (const e of enemies) {
          if (e.isDead || e === lastTarget || this.chainTargets.includes(e)) continue;
          const cd2 = (e.x - lastTarget.x) ** 2 + (e.y - lastTarget.y) ** 2;
          if (cd2 < bestDist2) {
            bestDist2 = cd2;
            nextT = e;
          }
        }
        if (nextT) {
          this.chainTargets.push(nextT);
          onHit(nextT, Math.round(this.conf.damage * 0.7));
          lastTarget = nextT;
        } else break;
      }
      sound.playHit();
    } else {
      // 基礎單體雷射
      this.beam = { x: target.x, y: target.y, life: 0.09 };
      onHit(target, this.conf.damage);
    }
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

    // 射程圈 (淡色)
    ctx.strokeStyle = this.conf.color + '18';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, this.conf.range, 0, Math.PI * 2);
    ctx.stroke();

    // 脈衝光環 (極寒塔專用)
    if (this.pulseTimer > 0) {
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, this.conf.pulseRadius * (1 - this.pulseTimer / 0.35), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 開火射線與電弧
    if (this.beam && this.muzzleTimer > 0) {
      ctx.strokeStyle = this.conf.color;
      ctx.lineWidth = this.variant === 'flame' ? 6 : 2.5;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(this.angle) * 18, sy + Math.sin(this.angle) * 18);
      ctx.lineTo(this.beam.x - camera.x, this.beam.y - camera.y);
      ctx.stroke();

      // Tesla 電弧鏈
      if (this.chainTargets.length > 0) {
        ctx.strokeStyle = '#e0aaff';
        ctx.lineWidth = 2;
        let curX = this.beam.x - camera.x;
        let curY = this.beam.y - camera.y;
        for (const ct of this.chainTargets) {
          ctx.beginPath();
          ctx.moveTo(curX, curY);
          curX = ct.x - camera.x;
          curY = ct.y - camera.y;
          ctx.lineTo(curX, curY);
          ctx.stroke();
        }
      }
    }

    // 底座 (烘焙 sprite)
    const sp = getSprite('turret');
    ctx.drawImage(sp.frames[0], sx - sp.w / 2, sy - sp.h / 2, sp.w, sp.h);

    // 砲管
    ctx.save();
    ctx.translate(sx, sy - 4);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.variant === 'flame' ? '#ff7b00' : this.variant === 'cryo' ? '#00b4d8' : this.variant === 'tesla' ? '#7209b7' : '#4a5b70';
    ctx.strokeStyle = '#141b26';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(0, -3.5, 22, 7, 3);
    ctx.fill();
    ctx.stroke();
    if (this.muzzleTimer > 0) {
      ctx.fillStyle = this.conf.color;
      ctx.beginPath();
      ctx.arc(24, 0, this.variant === 'flame' ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 升級標記 / 模組光暈
    if (this.variant !== 'standard') {
      ctx.save();
      ctx.strokeStyle = this.conf.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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
