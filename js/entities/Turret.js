// 戰場防禦工事 (設施建造系統)：就地築防，包含機槍砲台、高壓電網、淨化裝置、反傷拒馬

import { getSprite } from '../sprites.js';
import { sound } from '../audio.js';
import { VIEW } from '../config.js';
import { GuardsmanUnit, LemanRussUnit } from './AlliedUnit.js';

// 高解析度設施與防禦塔貼圖 (Banana 2D Game Assets)
export const FACILITY_IMAGES = {};
const FACILITY_IMAGE_KEYS = [
  'turret', 'turret_flame', 'turret_cryo',
  'electric_grid', 'purifier', 'barricade',
  'heavy_bolter', 'barracks', 'manufactorum'
];
if (typeof Image !== 'undefined') {
  for (const k of FACILITY_IMAGE_KEYS) {
    const img = new Image();
    img.src = `assets/facilities/${k}.png`;
    FACILITY_IMAGES[k] = img;
  }
}

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
  heavy_bolter: {
    id: 'heavy_bolter',
    name: '重型爆彈砲座',
    icon: '🦅',
    desc: '雙聯裝重型爆彈槍，射程極遠、射速極快，命中引爆穿甲高爆彈片',
    baseCost: 90,
    costGrowth: 45,
    maxHp: 1400,
    radius: 22,
    range: 380,
    cooldown: 0.22,
    damage: 44,
    minSpacing: 65,
    color: '#f39c12',
  },
  barracks: {
    id: 'barracks',
    name: '星界軍兵營',
    icon: '⛺',
    desc: '卡迪亞星界軍前進兵營，定時訓練生產步兵衝向戰線阻截並射擊敵人 (最多 6 名士兵)',
    baseCost: 110,
    costGrowth: 55,
    maxHp: 1800,
    radius: 28,
    minSpacing: 85,
    spawnCd: 4.5,
    maxUnits: 6,
    color: '#27ae60',
  },
  manufactorum: {
    id: 'manufactorum',
    name: '機械製造廠',
    icon: '🏭',
    desc: '鑄造世界重型工廠，組裝黎曼魯斯主戰戰車推進戰線，重砲壓制敵陣 (最多 2 輛戰車)',
    baseCost: 180,
    costGrowth: 90,
    maxHp: 2600,
    radius: 32,
    minSpacing: 100,
    spawnCd: 12.0,
    maxUnits: 2,
    color: '#e67e22',
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
  constructor(x, y, facilityType = 'turret', variant = 'standard', socket = null) {
    this.x = x;
    this.y = y;
    this.facilityType = facilityType;
    this.fConf = FACILITY_TYPES[facilityType] || FACILITY_TYPES.turret;
    this.radius = this.fConf.radius;
    this.maxHp = this.fConf.maxHp;
    this.variant = variant;
    this.conf = TURRET_VARIANTS[variant] || TURRET_VARIANTS.standard;
    this.level = 1;
    this.socket = socket;
    this.socketId = socket ? socket.id : null;
    this.socketBonus = socket ? socket.bonus : null;

    // 戰術地基槽加成 (Tactical Socket Buffs)
    this.rangeMul = 1.0;
    this.cdrMulMod = 1.0;
    this.dmgMul = 1.0;
    if (this.socketBonus === 'range') this.rangeMul = 1.15;
    if (this.socketBonus === 'haste') this.cdrMulMod = 0.85;
    if (this.socketBonus === 'damage') this.dmgMul = 1.20;
    if (this.socketBonus === 'armor') this.maxHp = Math.round(this.maxHp * 1.30);

    this.hp = this.maxHp;
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

  upgradeLevel() {
    this.level = (this.level || 1) + 1;
    const hpBoost = Math.round(this.fConf.maxHp * 0.3);
    this.maxHp += hpBoost;
    this.hp = Math.min(this.maxHp, this.hp + hpBoost);
    this.dmgMul = (this.dmgMul || 1) * 1.2;
    sound.playEvoFanfare();
  }

  getUpgradeCost() {
    const base = this.fConf.baseCost || 60;
    return Math.round(base * 0.75 * (this.level || 1));
  }

  getSellValue() {
    const base = this.fConf.baseCost || 60;
    const levelInvested = (this.level > 1) ? (this.level - 1) * Math.round(base * 0.75) : 0;
    return Math.round((base + levelInvested) * 0.7);
  }

  // 砲塔冷卻倍率 (每日詞綴「淘金狂熱」的 turretCdr + 地基加速)
  cdMul(game) {
    const m = game && game.rules && game.rules.turretCdr;
    const base = typeof m === 'number' && m > 0 ? m : 1;
    return base * (this.cdrMulMod || 1);
  }

  // 挑射程內的目標。priority 未設（生存者）＝最近、首領優先；
  // 守塔可切換 first（沿路線走最遠）／last／strong（血最多）／close。
  // e.progress 由 TowerDefense.targetFor 每幀寫入。
  pickTarget(enemies, range) {
    const range2 = range * range;
    const p = this.priority;
    let target = null;
    let best = Infinity;
    for (const e of enemies) {
      if (e.isDead) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > range2) continue;
      const score = p === 'first' ? -(e.progress || 0)
        : p === 'last' ? (e.progress || 0)
        : p === 'strong' ? -e.hp
        : p === 'close' ? d2
        : (e.isBoss ? d2 * 0.25 : d2);
      if (score < best) {
        best = score;
        target = e;
      }
    }
    return target;
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

    // 4. 重型爆彈砲座 (Heavy Bolter Emplacement) 行為：雙聯高速爆彈射擊 + 小範圍高爆濺射
    if (this.facilityType === 'heavy_bolter') {
      this.cooldownTimer -= dt;
      const target = this.pickTarget(enemies, this.fConf.range || 380);
      if (!target) return;

      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.cooldownTimer > 0) return;
      this.cooldownTimer = (this.fConf.cooldown || 0.22) * this.cdMul(game);
      this.muzzleTimer = 0.08;
      this.barrelSide = 1 - (this.barrelSide || 0);

      onHit(target, this.fConf.damage || 44);
      if (game && game.particles) {
        game.particles.createExplosion(target.x, target.y, 24);
      }
      // 爆彈彈片範圍破片傷害
      const splashR = 48;
      for (const e of enemies) {
        if (e.isDead || e === target) continue;
        if (Math.hypot(e.x - target.x, e.y - target.y) <= splashR) {
          onHit(e, Math.round((this.fConf.damage || 44) * 0.45));
        }
      }
      sound.playShoot();
      return;
    }

    // 5. 星界軍兵營與機械製造廠行為：定時召喚部隊馳援前線
    if (this.facilityType === 'barracks' || this.facilityType === 'manufactorum') {
      if (game && game.alliedUnits) {
        const myUnits = game.alliedUnits.filter((u) => u.facility === this && !u.isDead);
        const maxU = this.fConf.maxUnits || 4;
        if (myUnits.length < maxU) {
          this.spawnTimer = (this.spawnTimer || 0) + dt;
          if (this.spawnTimer >= (this.fConf.spawnCd || 5)) {
            this.spawnTimer = 0;
            if (this.facilityType === 'barracks') {
              game.alliedUnits.push(new GuardsmanUnit(this.x, this.y, this, game));
              game.ui.say('💂 星界軍步兵受命奔赴前線！', '#27ae60', 1.8);
            } else {
              game.alliedUnits.push(new LemanRussUnit(this.x, this.y, this, game));
              game.ui.say('🚜 黎曼魯斯主戰戰車出廠推進！', '#e67e22', 2.2);
            }
            sound.playEvoFanfare();
            if (game.particles) {
              game.particles.createShockwave(this.x, this.y, 50, this.fConf.color);
            }
          }
        }
      }
      return;
    }

    // 6. 基礎與進化砲台行為
    this.cooldownTimer -= dt;

    if (this.variant === 'cryo') {
      if (this.cooldownTimer <= 0) {
        this.cooldownTimer = this.conf.cooldown * this.cdMul(game);
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

    // 鎖定範圍內的目標（依瞄準優先序）
    const target = this.pickTarget(enemies, this.conf.range);
    if (!target) {
      this.beam = null;
      this.chainTargets = [];
      return;
    }

    this.angle = Math.atan2(target.y - this.y, target.x - this.x);

    if (this.cooldownTimer > 0) return;
    this.cooldownTimer = this.conf.cooldown * this.cdMul(game);
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
    if (sx < -100 || sx > VIEW.w + 100 || sy < -100 || sy > VIEW.h + 100) return;

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

      // 高壓電網設施本體
      const egImg = FACILITY_IMAGES.electric_grid;
      if (egImg && egImg.naturalWidth > 0) {
        const iw = 44, ih = 68;
        ctx.drawImage(egImg, sx - iw / 2, sy - ih * 0.72, iw, ih);
      } else {
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
      }
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

      // 高解析度淨化燈塔本體
      const purImg = FACILITY_IMAGES.purifier;
      if (purImg && purImg.naturalWidth > 0) {
        const iw = 50, ih = 58;
        ctx.drawImage(purImg, sx - iw / 2, sy - ih * 0.68, iw, ih);
      } else {
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
      }
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製反傷拒馬 ──
    if (this.facilityType === 'barricade') {
      ctx.save();
      const barImg = FACILITY_IMAGES.barricade;
      if (barImg && barImg.naturalWidth > 0) {
        const iw = 58, ih = 52;
        ctx.drawImage(barImg, sx - iw / 2, sy - ih * 0.62, iw, ih);
      } else {
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
      }
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製重型爆彈砲座 (Heavy Bolter Emplacement) ──
    if (this.facilityType === 'heavy_bolter') {
      const hurt = this.hp < this.maxHp * 0.6;
      const pulseA = 0.25 + 0.1 * Math.sin(this.animTimer * 2.2);
      ctx.save();
      ctx.strokeStyle = hurt ? `rgba(255,59,92,${(pulseA + 0.16).toFixed(3)})` : `rgba(243,156,18,${pulseA.toFixed(3)})`;
      ctx.lineWidth = hurt ? 2 : 1.4;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(sx, sy, this.fConf.range || 380, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const hbImg = FACILITY_IMAGES.heavy_bolter;
      if (hbImg && hbImg.naturalWidth > 0) {
        const iw = 64, ih = 56;
        ctx.drawImage(hbImg, sx - iw / 2, sy - ih * 0.65, iw, ih);
      } else {
        // 六角形鋼筋混凝土工事底座
        ctx.fillStyle = '#243342';
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 3;
          const px = sx + Math.cos(ang) * 22;
          const py = sy + Math.sin(ang) * 22;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 前沿環形沙包防壁
        ctx.fillStyle = '#7f8c8d';
        ctx.beginPath();
        ctx.arc(sx, sy + 10, 16, Math.PI * 0.1, Math.PI * 0.9);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#95a5a6';
        ctx.stroke();

        // 旋轉雙聯爆彈砲身
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);

        // 雙聯砲管
        ctx.fillStyle = '#1e272e';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.2;
        ctx.fillRect(4, -7, 24, 5);
        ctx.strokeRect(4, -7, 24, 5);
        ctx.fillRect(4, 2, 24, 5);
        ctx.strokeRect(4, 2, 24, 5);

        // 砲口制退擴焰筒
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(26, -8, 4, 7);
        ctx.fillRect(26, 1, 4, 7);

        // 雙側大容量彈鼓
        ctx.fillStyle = '#d35400';
        ctx.beginPath();
        ctx.arc(-2, -9, 6, 0, Math.PI * 2);
        ctx.arc(-2, 9, 6, 0, Math.PI * 2);
        ctx.fill();

        // 槍盾 (金屬盾牌 + 帝國天鷹羽翼金飾)
        ctx.fillStyle = '#2c3e50';
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(-8, -12, 12, 24, 3);
        ctx.fill();
        ctx.stroke();
      }

      // 開火槍口爆焰
      if (this.muzzleTimer > 0) {
        ctx.fillStyle = '#ffbe0b';
        ctx.shadowColor = '#ff5400';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(this.angle) * 32, sy + Math.sin(this.angle) * 32, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製星界軍兵營 (Astra Militarum Barracks) ──
    if (this.facilityType === 'barracks') {
      ctx.save();
      const bkImg = FACILITY_IMAGES.barracks;
      if (bkImg && bkImg.naturalWidth > 0) {
        const iw = 66, ih = 66;
        ctx.drawImage(bkImg, sx - iw / 2, sy - ih * 0.65, iw, ih);
        // 通訊雷達天線綠燈閃爍
        const blink = Math.sin(this.animTimer * 5) > 0;
        ctx.fillStyle = blink ? '#2ecc71' : '#145a32';
        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur = blink ? 8 : 0;
        ctx.beginPath();
        ctx.arc(sx + 10, sy - 32, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 地基加固鋼板
        ctx.fillStyle = '#14231a';
        ctx.strokeStyle = '#27ae60';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(sx - 26, sy - 20, 52, 40, 6);
        ctx.fill();
        ctx.stroke();

        // 迷彩重裝營舍本體
        ctx.fillStyle = '#1b382b';
        ctx.beginPath();
        ctx.roundRect(sx - 22, sy - 17, 44, 34, 4);
        ctx.fill();

        // 防暴升降閘門
        ctx.fillStyle = '#0a140f';
        ctx.fillRect(sx - 10, sy + 3, 20, 14);
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sx - 10, sy + 3, 20, 14);

        // 帝國骷髏徽記
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(sx, sy - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(sx - 7, sy - 8, 14, 2);

        // 通訊雷達天線
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + 14, sy - 17);
        ctx.lineTo(sx + 14, sy - 28);
        ctx.stroke();
        const blink = Math.sin(this.animTimer * 5) > 0;
        ctx.fillStyle = blink ? '#2ecc71' : '#145a32';
        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur = blink ? 6 : 0;
        ctx.beginPath();
        ctx.arc(sx + 14, sy - 29, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製機械製造廠 (Adeptus Mechanicus Manufactorum) ──
    if (this.facilityType === 'manufactorum') {
      ctx.save();
      const mfImg = FACILITY_IMAGES.manufactorum;
      if (mfImg && mfImg.naturalWidth > 0) {
        const iw = 72, ih = 72;
        ctx.drawImage(mfImg, sx - iw / 2, sy - ih * 0.65, iw, ih);
        // 排煙粒子
        const pOff = (this.animTimer * 20) % 15;
        ctx.fillStyle = 'rgba(180, 180, 180, 0.4)';
        ctx.beginPath();
        ctx.arc(sx - 18, sy - 36 - pOff, 4 + pOff * 0.4, 0, Math.PI * 2);
        ctx.arc(sx + 18, sy - 36 - pOff, 4 + pOff * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 工廠厚重基座
        ctx.fillStyle = '#2c140a';
        ctx.strokeStyle = '#d35400';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(sx - 30, sy - 24, 60, 48, 6);
        ctx.fill();
        ctx.stroke();

        // 鍛造爐高溫外殼
        ctx.fillStyle = '#442314';
        ctx.beginPath();
        ctx.roundRect(sx - 26, sy - 20, 52, 40, 4);
        ctx.fill();

        // 雙聯排煙巨管
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(sx - 20, sy - 34, 9, 14);
        ctx.fillRect(sx + 11, sy - 34, 9, 14);
        const pOff = (this.animTimer * 20) % 15;
        ctx.fillStyle = 'rgba(180, 180, 180, 0.4)';
        ctx.beginPath();
        ctx.arc(sx - 15.5, sy - 36 - pOff, 4 + pOff * 0.4, 0, Math.PI * 2);
        ctx.arc(sx + 15.5, sy - 36 - pOff, 4 + pOff * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // 坦克出廠液壓防護閘門
        ctx.fillStyle = '#111827';
        ctx.fillRect(sx - 16, sy + 2, 32, 18);
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx - 16, sy + 2, 32, 18);
        ctx.clip();
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 3;
        for (let ox = -20; ox <= 40; ox += 8) {
          ctx.beginPath();
          ctx.moveTo(sx - 16 + ox, sy + 20);
          ctx.lineTo(sx - 16 + ox + 10, sy + 2);
          ctx.stroke();
        }
        ctx.restore();

        // 機械神教齒輪徽記
        const pulse = 0.8 + 0.2 * Math.sin(this.animTimer * 3);
        ctx.fillStyle = '#e67e22';
        ctx.beginPath();
        ctx.arc(sx, sy - 8, 7 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy - 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      this.drawHpBar(ctx, sx, sy);
      return;
    }

    // ── 繪製機槍砲台 ──
    const hurt = this.hp < this.maxHp * 0.6;
    const pulseA = 0.26 + 0.1 * Math.sin(this.animTimer * 2.2);
    ctx.strokeStyle = hurt ? `rgba(255,59,92,${(pulseA + 0.16).toFixed(3)})` : hexA(this.conf.color, pulseA);
    ctx.lineWidth = hurt ? 2 : 1.4;
    ctx.setLineDash(hurt ? [10, 7] : [14, 12]);
    ctx.beginPath();
    ctx.arc(sx, sy, this.conf.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

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

    // 高解析度砲台貼圖
    const imgKey = this.variant === 'flame' ? 'turret_flame' : this.variant === 'cryo' ? 'turret_cryo' : 'turret';
    const tImg = FACILITY_IMAGES[imgKey];
    if (tImg && tImg.naturalWidth > 0) {
      const iw = 54, ih = 54;
      ctx.drawImage(tImg, sx - iw / 2, sy - ih * 0.65, iw, ih);
    } else {
      const sp = getSprite('turret');
      ctx.drawImage(sp.frames[0], sx - sp.w / 2, sy - sp.h / 2, sp.w, sp.h);
    }

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
      // 外框改成不透明近黑：原本 0.7 半透明在亮地面上會整條失去邊界
      ctx.fillStyle = 'rgba(4,6,12,0.92)';
      ctx.fillRect(sx - w / 2 - 1.5, sy - 31.5, w + 3, 8);
      const pct = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = pct > 0.35 ? '#00e5ff' : '#ff3b5c';
      ctx.fillRect(sx - w / 2, sy - 30, w * pct, 5);
    }
  }
}

// '#rrggbb' → rgba(...)：射程圈的 alpha 需要隨時間脈動，字串拼接做不出來
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

// 繪製地圖上的戰術地基槽 (Tactical Sockets)
export function drawSocket(ctx, camera, socket, isOccupied = false, isHovered = false, animTimer = 0) {
  const sx = socket.x - camera.x;
  const sy = socket.y - camera.y;
  if (sx < -80 || sx > VIEW.w + 80 || sy < -80 || sy > VIEW.h + 80) return;

  const colorMap = {
    range: '#00f5ff',
    haste: '#b5179e',
    damage: '#f39c12',
    armor: '#2ecc71',
  };
  const iconMap = {
    range: '🎯',
    haste: '⚡',
    damage: '⚔️',
    armor: '🛡️',
  };
  const themeColor = colorMap[socket.bonus] || '#ffd166';
  const icon = iconMap[socket.bonus] || '⚙️';

  ctx.save();

  // 六角形合金底座
  const r = 30;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = (i * Math.PI) / 3;
    const px = sx + Math.cos(ang) * r;
    const py = sy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = isOccupied ? 'rgba(20, 32, 48, 0.9)' : 'rgba(12, 20, 32, 0.85)';
  ctx.fill();

  // 外框高亮
  ctx.lineWidth = isHovered ? 3 : 1.8;
  ctx.strokeStyle = isHovered ? '#ffffff' : themeColor;
  if (isHovered) {
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 14;
  }
  ctx.stroke();

  // 若未佔用，繪製內部全息發光能量紋理與戰術標誌
  if (!isOccupied) {
    // 內縮六角形
    ctx.lineWidth = 1;
    ctx.strokeStyle = `${themeColor}66`;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      const px = sx + Math.cos(ang) * (r * 0.65);
      const py = sy + Math.sin(ang) * (r * 0.65);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    // 全息浮動圖標
    const floatY = Math.sin(animTimer * 4 + socket.x) * 3;
    ctx.font = '16px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, sx, sy + floatY);

    // 戰術加成簡短標籤（守塔的一般建塔點沒有 label）
    if (socket.label) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = themeColor;
      ctx.fillText(socket.label.split(' ')[0], sx, sy + r + 13);
    }
  } else {
    // 佔用時繪製精簡插槽指示燈
    ctx.fillStyle = themeColor;
    ctx.beginPath();
    ctx.arc(sx - r + 8, sy - r + 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 繪製滑鼠/觸控建造幽靈與射程範圍預覽 (Placement Ghost)
export function drawPlacementGhost(ctx, camera, placement, game) {
  if (!placement) return;
  const sx = placement.x - camera.x;
  const sy = placement.y - camera.y;

  const conf = FACILITY_TYPES[placement.type] || FACILITY_TYPES.turret;
  const isRangeType = placement.type === 'turret' || placement.type === 'heavy_bolter';
  let range = isRangeType ? (conf.range || 270) : (conf.pulseRadius || conf.fieldRadius || 70);
  if (placement.socket && placement.socket.bonus === 'range') range *= 1.15;

  ctx.save();

  // 1. 射程 / 影響範圍圈
  const strokeColor = placement.valid ? '#2ecc71' : '#e74c3c';
  const fillColor = placement.valid ? 'rgba(46, 204, 113, 0.14)' : 'rgba(231, 76, 60, 0.14)';

  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = fillColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(sx, sy, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. 吸附地基提示
  if (placement.socket) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sx, sy, 36, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. 半透明幽靈本體
  ctx.globalAlpha = 0.7;
  if (!drawPlacementGhost._tempTurret || drawPlacementGhost._tempTurret.facilityType !== placement.type) {
    drawPlacementGhost._tempTurret = new Turret(placement.x, placement.y, placement.type);
  }
  const temp = drawPlacementGhost._tempTurret;
  temp.x = placement.x;
  temp.y = placement.y;
  temp.draw(ctx, camera);
  ctx.globalAlpha = 1.0;

  // 4. 浮動資訊徽章 (合法 / 錯誤原因 / 地基加成)
  let badgeText = '';
  let badgeColor = '';
  if (!placement.valid) {
    badgeText = placement.reason || '無法在此建造';
    badgeColor = '#e74c3c';
  } else if (placement.socket) {
    badgeText = `✨ 已吸附：${placement.socket.label}`;
    badgeColor = '#2ecc71';
  } else {
    badgeText = `建造【${conf.name}】(${placement.cost || conf.baseCost} 🪙)`;
    badgeColor = '#00f5ff';
  }

  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const textW = ctx.measureText(badgeText).width;

  ctx.fillStyle = 'rgba(10, 16, 28, 0.88)';
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(sx - textW / 2 - 10, sy - conf.radius - 28, textW + 20, 22, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = badgeColor;
  ctx.fillText(badgeText, sx, sy - conf.radius - 12);

  ctx.restore();
}
