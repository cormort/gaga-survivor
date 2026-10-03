// 星界軍盟軍單位：星界軍步兵 (Guardsman) 與黎曼魯斯主戰戰車 (Leman Russ)
// 由星界軍兵營與機械製造廠定時生產，沿戰線推進阻擊敵人並建立堅固防線。

import { getSprite } from '../sprites.js';
import { sound } from '../audio.js';
import { VIEW } from '../config.js';
import { Projectile } from './Projectile.js';
import { nearestOnPaths, projectToSegment } from '../tdlevels.js';

// 守塔近戰小兵的逐格動畫（tools/cut_td_units.py 產生）：4 列（待機/走路/攻擊/陣亡）× 4 格，
// 每格 160×128、面朝右、腳底在 (80, 120)
export const UNIT_IMAGES = {};
const UNIT_CELL_W = 160;
const UNIT_CELL_H = 128;
const UNIT_FOOT_Y = 120;
const UNIT_SCALE = 0.5;        // 待機高 96px → 世界 48px
const MELEE_ENGAGE = 130;      // 離集結點這麼遠以內的怪才去打
const MELEE_CD = 0.8;
const MELEE_MUL = 2.4;         // 一刀 = 基礎傷害 × 這個倍率。近戰只能打到身邊，比原本 250 射程的雷射槍接敵時間短，單發要重一點
const ATTACK_ANIM = 0.45;
if (typeof Image !== 'undefined') {
  for (const k of ['unit_footman_1', 'unit_footman_2', 'unit_footman_3', 'unit_knight']) {
    const img = new Image();
    img.src = `assets/td/${k}.png`;
    UNIT_IMAGES[k] = img;
  }
}

// 守塔兵營派出的小兵外觀：依兵營等級（民兵→步兵→重步兵），騎士營專精換騎士
export function tdUnitSprite(t) {
  return t.branch === 'knight' ? 'unit_knight' : `unit_footman_${Math.min(3, t.level)}`;
}

export class GuardsmanUnit {
  constructor(x, y, facility, game) {
    this.x = x;
    this.y = y;
    this.facility = facility;
    this.type = 'guardsman';
    this.radius = 13;
    this.maxHp = 340;
    this.hp = this.maxHp;
    this.speed = 68;
    this.range = 250;
    this.damage = 28;
    this.shootCd = 0.58;
    this.shootTimer = Math.random() * 0.3;
    this.bayonetCd = 0.55;
    this.bayonetTimer = 0;
    this.laserFx = null;
    this.laserTimer = 0;
    this.animTimer = Math.random() * 10;
    this.facing = 1;
    this.isDead = false;

    // 巡邏站位點：若在守塔地圖，尋找最近路徑點作為集結前線
    this.targetWp = null;
    this.findInitialWaypoint(game);
  }

  findInitialWaypoint(game) {
    if (game.level && game.level.paths && game.level.paths.length > 0) {
      const near = nearestOnPaths(game.level, this.x, this.y);
      this.targetWp = { x: near.px, y: near.py };
    } else {
      this.targetWp = { x: this.x + (Math.random() - 0.5) * 60, y: this.y + (Math.random() - 0.5) * 60 };
    }
  }

  // 守塔近戰（melee）：守在路上的集結點，附近有地面怪就上前砍，打完走回集結點。
  // 怪物撞上小兵會被推擠擋住（updateAlliedUnits），所以站在路中間就是擋路。
  updateMelee(dt, enemies, game) {
    if (this.bayonetTimer > 0) this.bayonetTimer -= dt;
    if (this.attackAnim > 0) this.attackAnim -= dt;
    // 同一座兵營的兵各自站在集結點旁一點，不然三個人疊成一個
    if (!this.slot) this.slot = { x: (Math.random() - 0.5) * 44, y: (Math.random() - 0.5) * 30 };
    const home = { x: this.targetWp.x + this.slot.x, y: this.targetWp.y + this.slot.y };
    let target = null;
    let best = Infinity;
    for (const e of enemies) {
      if (e.isDead || e.flying) continue;
      if (Math.hypot(e.x - home.x, e.y - home.y) > MELEE_ENGAGE) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < best) {
        best = d;
        target = e;
      }
    }
    const goal = target || home;
    const dx = goal.x - this.x;
    const dy = goal.y - this.y;
    const dist = Math.hypot(dx, dy);
    const reach = target ? this.radius + target.radius + 6 : 6;
    this.isMoving = dist > reach;
    if (this.isMoving) {
      const step = Math.min(dist - reach, this.speed * dt);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    if (Math.abs(dx) > 1) this.facing = dx >= 0 ? 1 : -1;
    if (target && !this.isMoving && this.bayonetTimer <= 0) {
      this.bayonetTimer = MELEE_CD;
      this.attackAnim = ATTACK_ANIM;
      game.damageEnemy(target, Math.round(this.damage * MELEE_MUL * (this.damageMul || 1)), 2, this.x, this.y, 'footman');
      sound.playHit();
    }
  }

  update(dt, enemies, game) {
    this.animTimer += dt;
    if (this.melee) {
      this.updateMelee(dt, enemies, game);
      return;
    }
    if (this.laserTimer > 0) this.laserTimer -= dt;
    if (this.shootTimer > 0) this.shootTimer -= dt;
    if (this.bayonetTimer > 0) this.bayonetTimer -= dt;

    // 1. 索敵：尋找射程內最近的敵方單位
    let target = null;
    let minDist = this.range;
    for (const e of enemies) {
      if (e.isDead || e.flying) continue;   // 飛行怪（守塔）步兵與戰車打不到
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < minDist) {
        minDist = d;
        target = e;
      }
    }

    // 2. 移動邏輯：
    // 若前方有敵人進入射程，停止跑步進入齊射跪姿；否則向路徑前線或目標前進
    let isMoving = false;
    if (!target && this.targetWp) {
      const dx = this.targetWp.x - this.x;
      const dy = this.targetWp.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 15) {
        isMoving = true;
        const moveDist = Math.min(dist, this.speed * dt);
        this.x += (dx / dist) * moveDist;
        this.y += (dy / dist) * moveDist;
        this.facing = dx >= 0 ? 1 : -1;
      } else if (game.level && game.level.paths) {
        // 到達路徑點後，緩慢朝敵人源頭方向前移 (保持路寬中央)
        const near = nearestOnPaths(game.level, this.x, this.y);
        this.targetWp.x = near.px;
        this.targetWp.y = near.py;
      }
    }

    // 3. 攻擊邏輯
    if (target) {
      this.facing = target.x >= this.x ? 1 : -1;

      // 白刃刺刀交火
      if (minDist <= this.radius + target.radius + 14 && this.bayonetTimer <= 0) {
        this.bayonetTimer = this.bayonetCd;
        const bayonetDmg = Math.round(this.damage * 1.6 * (this.damageMul || 1));
        game.damageEnemy(target, bayonetDmg, 2, this.x, this.y, 'bayonet');
        sound.playHit();
        const dist = Math.hypot(target.x - this.x, target.y - this.y) || 1;
        target.kbX += ((target.x - this.x) / dist) * 160;
        target.kbY += ((target.y - this.y) / dist) * 160;
      } else if (this.shootTimer <= 0) {
        // 雷射槍射擊 (Lasgun)
        this.shootTimer = this.shootCd;
        this.laserTimer = 0.08;
        this.laserFx = { tx: target.x, ty: target.y };
        sound.playShoot();
        game.damageEnemy(target, Math.round(this.damage * (this.damageMul || 1)), 1, this.x, this.y, 'lasgun');
      }
    }
  }

  takeDamage(amount, sourceEnemy = null) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (sx < -60 || sx > VIEW.w + 60 || sy < -60 || sy > VIEW.h + 60) return;

    // 繪製雷射槍光束 (緋紅高能離子射線)
    if (this.laserTimer > 0 && this.laserFx) {
      ctx.save();
      ctx.strokeStyle = '#ff2a2a';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff5400';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(sx + this.facing * 10, sy - 2);
      ctx.lineTo(this.laserFx.tx - camera.x, this.laserFx.ty - camera.y);
      ctx.stroke();

      // 白色核心高光
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + this.facing * 10, sy - 2);
      ctx.lineTo(this.laserFx.tx - camera.x, this.laserFx.ty - camera.y);
      ctx.stroke();
      ctx.restore();
    }

    // 守塔近戰小兵：逐格動畫（陣亡 → 攻擊 → 走路 → 待機）
    const img = this.spriteKey && UNIT_IMAGES[this.spriteKey];
    if (img && img.naturalWidth) {
      let row = 0;
      let frame = Math.floor(this.animTimer * 4) % 4;
      if (this.isDead) {
        row = 3;
        frame = Math.min(3, Math.floor((this.deathT || 0) / 0.2));
      } else if (this.attackAnim > 0) {
        row = 2;
        frame = Math.min(3, Math.floor((1 - this.attackAnim / ATTACK_ANIM) * 4));
      } else if (this.isMoving) {
        row = 1;
        frame = Math.floor(this.animTimer * 8) % 4;
      }
      const w = UNIT_CELL_W * UNIT_SCALE;
      const h = UNIT_CELL_H * UNIT_SCALE;
      const footY = sy + this.radius * 0.6;   // 腳踩在碰撞圓的下緣附近
      ctx.save();
      ctx.translate(sx, footY);
      if (this.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, frame * UNIT_CELL_W, row * UNIT_CELL_H, UNIT_CELL_W, UNIT_CELL_H,
        -w / 2, -UNIT_FOOT_Y * UNIT_SCALE, w, h);
      ctx.restore();
    } else {
      // 繪製士兵本體
      const sp = getSprite('guardsman');
      if (sp) {
        ctx.save();
        ctx.translate(sx, sy);
        if (this.facing < 0) ctx.scale(-1, 1);
        const frameIdx = Math.floor(this.animTimer * 6) % sp.frames.length;
        ctx.drawImage(sp.frames[frameIdx], -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        ctx.restore();
      }
    }

    // 血條
    if (this.hp < this.maxHp && !this.isDead) {
      const w = 28;
      ctx.fillStyle = 'rgba(5,8,15,0.85)';
      ctx.fillRect(sx - w / 2 - 1, sy - 24, w + 2, 5);
      const pct = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = pct > 0.35 ? '#2ecc71' : '#e74c3c';
      ctx.fillRect(sx - w / 2, sy - 23, w * pct, 3);
    }
  }
}

export class LemanRussUnit {
  constructor(x, y, facility, game) {
    this.x = x;
    this.y = y;
    this.facility = facility;
    this.type = 'leman_russ';
    this.radius = 28;
    this.maxHp = 2800;
    this.hp = this.maxHp;
    this.speed = 38;
    this.cannonRange = 460;
    this.cannonCd = 2.3;
    this.cannonTimer = Math.random() * 0.6;
    this.sponsonRange = 320;
    this.sponsonCd = 0.24;
    this.sponsonTimer = 0;
    this.turretAngle = 0;
    this.bodyAngle = 0;
    this.animTimer = Math.random() * 10;
    this.exhaustTimer = 0;
    this.sponsonMuzzleTimer = 0;
    this.isDead = false;

    this.targetWp = null;
    this.findInitialWaypoint(game);
  }

  findInitialWaypoint(game) {
    if (game.level && game.level.paths && game.level.paths.length > 0) {
      const near = nearestOnPaths(game.level, this.x, this.y);
      this.targetWp = { x: near.px, y: near.py };
    } else {
      this.targetWp = { x: this.x + 80, y: this.y };
    }
  }

  update(dt, enemies, game) {
    this.animTimer += dt;
    if (this.cannonTimer > 0) this.cannonTimer -= dt;
    if (this.sponsonTimer > 0) this.sponsonTimer -= dt;
    if (this.sponsonMuzzleTimer > 0) this.sponsonMuzzleTimer -= dt;

    // 1. 尋找主砲目標 (優先鎖定血量最高或 Boss 敵人，次選最近群體)
    let bestTarget = null;
    let bestScore = -1;
    for (const e of enemies) {
      if (e.isDead || e.flying) continue;   // 飛行怪（守塔）步兵與戰車打不到
      const dist = Math.hypot(e.x - this.x, e.y - this.y);
      if (dist > this.cannonRange) continue;
      const score = (e.isBoss ? 5000 : 0) + e.hp - dist * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = e;
      }
    }

    if (bestTarget) {
      this.turretAngle = Math.atan2(bestTarget.y - this.y, bestTarget.x - this.x);

      // 主戰加農砲轟擊
      if (this.cannonTimer <= 0) {
        this.cannonTimer = this.cannonCd;
        const bx = this.x + Math.cos(this.turretAngle) * 32;
        const by = this.y + Math.sin(this.turretAngle) * 32;
        const vx = Math.cos(this.turretAngle) * 440;
        const vy = Math.sin(this.turretAngle) * 440;

        game.weaponManager.projectiles.push(new Projectile({
          type: 'tank_shell',
          weaponId: 'tank_shell',
          x: bx,
          y: by,
          vx: vx,
          vy: vy,
          damage: Math.round(240 * (this.damageMul || 1)),
          radius: 12,
          pierce: 1,
          life: 1.8,
          knockback: 4,
        }));

        sound.playExplosion();
        if (game.camera) game.camera.shake = Math.max(game.camera.shake || 0, 5);
        if (game.particles) game.particles.createShockwave(bx, by, 40, '#f39c12');
      }
    }

    // 2. 側舷雙聯重型爆彈槍 (Sponson Heavy Bolters)
    let sponsonTarget = null;
    let minSpDist = this.sponsonRange;
    for (const e of enemies) {
      if (e.isDead || e.flying) continue;   // 飛行怪（守塔）步兵與戰車打不到
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < minSpDist) {
        minSpDist = d;
        sponsonTarget = e;
      }
    }

    if (sponsonTarget && this.sponsonTimer <= 0) {
      this.sponsonTimer = this.sponsonCd;
      this.sponsonMuzzleTimer = 0.08;
      game.damageEnemy(sponsonTarget, Math.round(36 * (this.damageMul || 1)), 1, this.x, this.y, 'heavy_bolter');
      if (game.particles) game.particles.createExplosion(sponsonTarget.x, sponsonTarget.y, 22);
      sound.playShoot();
    }

    // 3. 移動推進邏輯
    // 如果附近有敵人，停止前進充當重裝火力支點；否則沿戰線向外推進
    if (!bestTarget && this.targetWp) {
      const dx = this.targetWp.x - this.x;
      const dy = this.targetWp.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 18) {
        this.bodyAngle = Math.atan2(dy, dx);
        const moveDist = Math.min(dist, this.speed * dt);
        this.x += (dx / dist) * moveDist;
        this.y += (dy / dist) * moveDist;
      }
    }
  }

  takeDamage(amount, sourceEnemy = null) {
    // 黎曼魯斯超重裝裝甲板：承受傷害減免 60%
    const actual = Math.round(amount * 0.4);
    this.hp -= actual;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (sx < -90 || sx > VIEW.w + 90 || sy < -90 || sy > VIEW.h + 90) return;

    // 繪製車體底盤
    const sp = getSprite('leman_russ');
    if (sp) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.bodyAngle);
      const frameIdx = Math.floor(this.animTimer * 5) % sp.frames.length;
      ctx.drawImage(sp.frames[frameIdx], -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      ctx.restore();
    }

    // 繪製獨立旋轉的主砲塔
    ctx.save();
    ctx.translate(sx, sy - 2);
    ctx.rotate(this.turretAngle);

    // 加農砲管
    ctx.fillStyle = '#2c3e50';
    ctx.strokeStyle = '#1a252f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(10, -5, 36, 10, 2);
    ctx.fill();
    ctx.stroke();

    // 砲口制退器
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(42, -7, 8, 14);

    // 砲塔座圈
    ctx.fillStyle = '#34495e';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 開火火光
    if (this.cannonTimer >= this.cannonCd - 0.12) {
      ctx.fillStyle = '#f39c12';
      ctx.shadowColor = '#e67e22';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(52, 0, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 側舷機槍開火光芒
    if (this.sponsonMuzzleTimer > 0) {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(sx - 12, sy + 16, 6, 0, Math.PI * 2);
      ctx.arc(sx - 12, sy - 16, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 重裝血條
    if (this.hp < this.maxHp) {
      const w = 48;
      ctx.fillStyle = 'rgba(5,8,15,0.9)';
      ctx.fillRect(sx - w / 2 - 1.5, sy - 36, w + 3, 7);
      const pct = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = pct > 0.35 ? '#e67e22' : '#e74c3c';
      ctx.fillRect(sx - w / 2, sy - 35, w * pct, 4);
    }
  }
}
