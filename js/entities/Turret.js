// 戰場防禦工事 (設施建造系統)：就地築防，包含機槍砲台、高壓電網、淨化裝置、反傷拒馬

import { getSprite } from '../sprites.js';
import { sound } from '../audio.js';

export const FACILITY_TYPES = {
  turret: {
    id: 'turret',
    name: '機槍砲台',
    icon: '🔫',
    desc: '自動索敵射擊，可進化烈焰/極寒/電漿模組',
    baseCost: 60,
    costGrowth: 35,
    maxHp: 900,
    radius: 20,
    minSpacing: 65,
    color: '#00f5ff',
  },
  electric_grid: {
    id: 'electric_grid',
    name: '高壓電網',
    icon: '⚡',
    desc: '高壓電阻絕網，對進入的怪物造成持續電擊與 50% 減速',
    baseCost: 50,
    costGrowth: 30,
    maxHp: 800,
    radius: 22,
    fieldRadius: 65,
    dps: 45,
    minSpacing: 75,
    color: '#b5179e',
  },
  purifier: {
    id: 'purifier',
    name: '淨化裝置',
    icon: '🧪',
    desc: '定時釋放生化淨化衝擊波，擊退敵人並為範圍內特工回復生命',
    baseCost: 75,
    costGrowth: 40,
    maxHp: 1000,
    radius: 24,
    pulseRadius: 80,
    healAmount: 15,
    pulseCd: 2.8,
    minSpacing: 85,
    color: '#00f59b',
  },
  barricade: {
    id: 'barricade',
    name: '反傷拒馬',
    icon: '🛡️',
    desc: '1,500 HP 超重裝阻絕障礙，敵人啃咬衝撞時受到 100% 尖刺反傷',
    baseCost: 40,
    costGrowth: 20,
    maxHp: 1500,
    radius: 24,
    reflectPct: 1.0,
    desc: '高耐久重裝路障，怪衝撞或啃咬時受到 100% 尖刺反傷',
    color: '#ffb703',
  },
};

// 砲塔升級模組 (僅限機槍砲台)
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

// 相容舊引用
export const TURRET = {
  baseCost: 60,
  costGrowth: 35,
  minSpacing: 65,
  maxHp: 900,
  range: 270,
  cooldown: 0.55,
  damage: 26,
  radius: 20,
  upgradeCost: 50,
};

export class Turret {
  constructor(x, y, facilityType = 'turret', variant = 'standard') {
    this.x = x;
    this.y = y;
    this.facilityType = facilityType;
    this.fConf = FACILITY_TYPES[facilityType] || FACILITY_TYPES.turret;
    this.radius = this.fConf.radius;
    this.maxHp = this.fConf.maxHp;
    this.hp = this.maxHp;
    this.variant = variant;
    this.conf = TURRET_VARIANTS[variant] || TURRET_VARIANTS.standard;

    this.cooldownTimer = 0;
    this.angle = 0;
    this.muzzleTimer = 0;
    this.beam = null;
    this.chainTargets = [];
    this.pulseTimer = 0;
    this.purifierTimer = 0;
    this.animTimer = Math.random() * 10;
    this.isDead = false;
  }

  upgrade(variantKey) {
    if (this.facilityType !== 'turret' || !TURRET_VARIANTS[variantKey]) return;
    this.variant = variantKey;
    this.conf = TURRET_VARIANTS[variantKey];
    this.maxHp += 300;
    this.hp = this.maxHp;
    sound.playGem();
  }

  update(dt, enemies, onHit, player = null, game = null) {
    this.animTimer += dt;
    if (this.muzzleTimer > 0) this.muzzleTimer -= dt;
    if (this.pulseTimer > 0) this.pulseTimer -= dt;

    // 1. 高壓電網行為：持續範圍電擊與減速
    if (this.facilityType === 'electric_grid') {
      const r = this.fConf.fieldRadius;
      const r2 = r * r;
      for (const e of enemies) {
        if (e.isDead) continue;
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        if (dx * dx + dy * dy <= r2) {
          onHit(e, this.fConf.dps * dt);
          e.slowTimer = Math.max(e.slowTimer || 0, 0.4);
        }
      }
      return;
    }

    // 2. 區域淨化裝置行為：定時淨化脈衝 (擊退+增傷+治療)
    if (this.facilityType === 'purifier') {
      this.purifierTimer += dt;
      if (this.purifierTimer >= this.fConf.pulseCd) {
        this.purifierTimer = 0;
        this.pulseTimer = 0.4;
        sound.playEvoFanfare();
        const pr = this.fConf.pulseRadius;
        for (const e of enemies) {
          if (e.isDead) continue;
          const dist = Math.hypot(e.x - this.x, e.y - this.y);
          if (dist <= pr) {
            onHit(e, 85);
            e.damageTakenMul = Math.max(e.damageTakenMul || 1, 1.25);
            if (dist > 0) {
              e.kbX += ((e.x - this.x) / dist) * 180;
              e.kbY += ((e.y - this.y) / dist) * 180;
            }
          }
        }
        if (player && Math.hypot(player.x - this.x, player.y - this.y) <= pr) {
          player.heal(this.fConf.healAmount);
          if (game && game.particles) {
            game.particles.createShockwave(player.x, player.y, 60, '#00f59b');
          }
        }
      }
      return;
    }

    // 3. 反傷拒馬行為：靜態阻絕 (受擊反傷由 takeDamage 觸發)
    if (this.facilityType === 'barricade') {
      return;
    }

    // 4. 基礎與進化砲台行為
    this.cooldownTimer -= dt;

    if (this.variant === 'cryo') {
      if (this.cooldownTimer <= 0) {
        this.cooldownTimer = this.conf.cooldown;
        this.pulseTimer = 0.35;
        sound.playExplosion();
        for (const e of enemies) {
          if (e.isDead) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d <= this.conf.pulseRadius) {
            onHit(e, this.conf.damage);
            e.slowTimer = Math.max(e.slowTimer || 0, this.conf.slowDur);
          }
        }
      }
      return;
    }

    // 鎖定範圍內最近的敵人
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
    } else if (this.variant === 'tesla') {
      this.beam = { x: target.x, y: target.y, life: 0.1 };
      onHit(target, this.conf.damage);
      this.chainTargets = [];
      let lastTarget = target;
      for (let i = 1; i < this.conf.chainCount; i++) {
        let nextTarget = null;
        let nextDist = 180;
        for (const e of enemies) {
          if (e === target || this.chainTargets.includes(e) || e.isDead) continue;
          const d = Math.hypot(e.x - lastTarget.x, e.y - lastTarget.y);
          if (d < nextDist) {
            nextDist = d;
            nextTarget = e;
          }
        }
        if (nextTarget) {
          this.chainTargets.push(nextTarget);
          onHit(nextTarget, Math.round(this.conf.damage * 0.65));
          lastTarget = nextTarget;
        } else {
          break;
        }
      }
      sound.playHit();
    } else {
      this.beam = { x: target.x, y: target.y, life: 0.09 };
      onHit(target, this.conf.damage);
    }
  }

  takeDamage(amount, sourceEnemy = null) {
    this.hp -= amount;
    // 鋼鐵拒馬反傷
    if (this.facilityType === 'barricade' && sourceEnemy && !sourceEnemy.isDead) {
      sourceEnemy.takeDamage(Math.round(amount * (this.fConf.reflectPct || 1.0)), 6, this.x, this.y);
      sound.playHit();
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (sx < -100 || sx > window.innerWidth + 100 || sy < -100 || sy > window.innerHeight + 100) return;

    // ── 繪製高壓電網 ──
    if (this.facilityType === 'electric_grid') {
      const r = this.fConf.fieldRadius;
      ctx.save();
      // 電網地面波紋
      ctx.strokeStyle = 'rgba(181, 23, 158, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(181, 23, 158, 0.12)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // 四根絕緣電極柱與高壓電弧
      const pCount = 4;
      const arcPoints = [];
      for (let i = 0; i < pCount; i++) {
        const ang = (i * Math.PI * 2) / pCount + this.animTimer * 0.3;
        const px = sx + Math.cos(ang) * (r * 0.7);
        const py = sy + Math.sin(ang) * (r * 0.7);
        arcPoints.push({ x: px, y: py });
        ctx.fillStyle = '#3a0ca3';
        ctx.strokeStyle = '#b5179e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 電弧閃爍
      ctx.strokeStyle = '#00f5ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < arcPoints.length; i++) {
        const p1 = arcPoints[i];
        const p2 = arcPoints[(i + 1) % arcPoints.length];
        ctx.moveTo(p1.x, p1.y);
        const midX = (p1.x + p2.x) / 2 + (Math.random() - 0.5) * 12;
        const midY = (p1.y + p2.y) / 2 + (Math.random() - 0.5) * 12;
        ctx.lineTo(midX, midY);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製淨化裝置 ──
    if (this.facilityType === 'purifier') {
      const r = this.fConf.pulseRadius;
      ctx.save();
      // 淨化力場外環
      ctx.strokeStyle = 'rgba(0, 245, 155, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();

      // 脈衝波
      if (this.pulseTimer > 0) {
        ctx.strokeStyle = 'rgba(0, 245, 155, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, r * (1 - this.pulseTimer / 0.4), 0, Math.PI * 2);
        ctx.stroke();
      }

      // 底座與發光球體
      ctx.fillStyle = '#14281d';
      ctx.strokeStyle = '#00f59b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 綠色生化核心
      const pulse = 1 + Math.sin(this.animTimer * 5) * 0.15;
      ctx.fillStyle = '#00f59b';
      ctx.shadowColor = '#00f59b';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sx, sy, 8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製反傷拒馬 ──
    if (this.facilityType === 'barricade') {
      ctx.save();
      // 金屬 X 型拒馬
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx - 16, sy - 14);
      ctx.lineTo(sx + 16, sy + 14);
      ctx.moveTo(sx + 16, sy - 14);
      ctx.lineTo(sx - 16, sy + 14);
      ctx.stroke();

      // 橫向鐵棘刺
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 20, sy);
      ctx.lineTo(sx + 20, sy);
      for (let ox = -15; ox <= 15; ox += 10) {
        ctx.moveTo(sx + ox, sy - 5);
        ctx.lineTo(sx + ox, sy + 5);
      }
      ctx.stroke();
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製機槍砲台 ──
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

    // 底座
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

    if (this.variant !== 'standard') {
      ctx.save();
      ctx.strokeStyle = this.conf.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this.drawHpBar(ctx, sx, sy);
  }

  drawHpBar(ctx, sx, sy) {
    if (this.hp < this.maxHp) {
      const w = 40;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(sx - w / 2 - 1, sy - 30, w + 2, 5);
      ctx.fillStyle = this.hp / this.maxHp > 0.35 ? '#00e5ff' : '#ff0055';
      ctx.fillRect(sx - w / 2, sy - 29, w * (this.hp / this.maxHp), 3);
    }
  }
}
