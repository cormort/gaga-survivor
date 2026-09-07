// 武器管理器 (自動鎖定、冷卻計時、投射物生成、超武進化檢測與傷害統計)

import { WEAPONS, PASSIVES } from '../config.js';
import { Projectile } from '../entities/Projectile.js';
import { sound } from '../audio.js';

export class WeaponManager {
  constructor(player) {
    this.player = player;

    // 擁有的武器: Map<weaponId, { level, cooldownTimer, isEvo, totalDamage }>
    this.weapons = new Map();

    // 擁有的被動配件: Map<passiveId, { level }>
    this.passives = new Map();

    // 投射物集合
    this.projectiles = [];

    // 延遲射擊佇列：以遊戲時間倒數 (取代 setTimeout)。暫停/升級選卡時 update()
    // 不會執行 → 佇列自然凍結；重開新局時舊 manager 直接棄置，不會有殘留射擊。
    this.delayed = [];

    // 傭兵部隊與防禦砲塔獨立傷害統計
    this.mercTotalDamage = 0;
    this.turretTotalDamage = 0;

    // 初始武器由角色決定
    this.addWeapon(player.character.startWeapon || 'kunai');
  }

  addWeapon(weaponId) {
    if (this.weapons.has(weaponId)) return;
    const def = WEAPONS[weaponId];
    if (!def) return;

    this.weapons.set(weaponId, {
      id: weaponId,
      level: 1,
      cooldownTimer: 0,
      isEvo: !!def.isEvo,
      totalDamage: 0,
    });
  }

  upgradeWeapon(weaponId) {
    const item = this.weapons.get(weaponId);
    if (!item) {
      this.addWeapon(weaponId);
      return;
    }

    const def = WEAPONS[weaponId];
    if (item.level < def.maxLevel) {
      item.level++;
    }
  }

  evolveWeapon(baseWeaponId, evoWeaponId) {
    if (!this.weapons.has(baseWeaponId)) return;
    const old = this.weapons.get(baseWeaponId);

    // 彩鴿式雙武合成：配方是另一把武器 → 一併消耗，傷害加總繼承
    const baseDef = WEAPONS[baseWeaponId];
    const partnerId = baseDef ? baseDef.pairPassive : null;
    const partnerDef = partnerId ? WEAPONS[partnerId] : null;
    let partnerDmg = 0;
    if (partnerDef && !partnerDef.isEvo && this.weapons.has(partnerId)) {
      const partnerItem = this.weapons.get(partnerId);
      if (partnerItem) partnerDmg = partnerItem.totalDamage || 0;
      this.weapons.delete(partnerId);
    }

    // 替換為超武 (繼承主武器與副手武器之累計總傷害)
    this.weapons.delete(baseWeaponId);
    this.weapons.set(evoWeaponId, {
      id: evoWeaponId,
      level: 1,
      cooldownTimer: 0,
      isEvo: true,
      totalDamage: old.totalDamage + partnerDmg,
    });

    sound.playEvoFanfare();
  }

  addOrUpgradePassive(passiveId) {
    const item = this.passives.get(passiveId);
    const def = PASSIVES[passiveId];
    if (!def) return;

    if (!item) {
      this.passives.set(passiveId, { id: passiveId, level: 1 });
    } else if (item.level < def.maxLevel) {
      item.level++;
    }

    this.applyPassives();
  }

  applyPassives() {
    // 重置基礎被動倍率 (天賦的常駐傷害加成不被重置)
    this.player.damageMultiplier = 1.0 + (this.player.metaDmg || 0);
    this.player.speedMultiplier = this.player.baseSpeedMul;
    this.player.cdrMultiplier = 1.0;
    this.player.rangeMultiplier = 1.0;
    this.player.magnetMultiplier = this.player.baseMagnet;
    this.player.hpRegen = 0;

    let vestLevel = 0;
    for (const [id, data] of this.passives.entries()) {
      const def = PASSIVES[id];
      if (!def) continue;

      const lvl = data.level;
      switch (id) {
        case 'atk_scroll':
          this.player.damageMultiplier += def.valuePerLevel * lvl;
          break;
        case 'speed_shoes':
          this.player.speedMultiplier += def.valuePerLevel * lvl;
          break;
        case 'max_hp_vest':
          vestLevel = lvl;
          break;
        case 'magnet':
          this.player.magnetMultiplier += def.valuePerLevel * lvl;
          break;
        case 'cdr_battery':
          this.player.cdrMultiplier = Math.max(0.4, 1.0 - def.valuePerLevel * lvl);
          break;
        case 'range_fuel':
          this.player.rangeMultiplier += def.valuePerLevel * lvl;
          break;
      }
    }

    // 防彈護甲：生命上限以角色基礎值往上加 (企鵝 130 不會被覆寫回 100)，
    // 升級瞬間把多出來的上限同步補進當前 HP，玩家會立刻有感
    if (vestLevel > 0) {
      const prevMax = this.player.maxHp;
      this.player.maxHp = this.player.baseMaxHp + PASSIVES.max_hp_vest.valuePerLevel * vestLevel;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + (this.player.maxHp - prevMax));
      this.player.hpRegen = 1.2 * vestLevel;
    }

    // 模式的武器輸出倍率 (守塔模式壓低玩家自身火力，讓砲塔成為主力)
    if (this.player.modeDmgMul !== undefined) {
      this.player.damageMultiplier *= this.player.modeDmgMul;
    }

    // 局外裝備的冷卻縮減：被動算完後再乘 (被動是直接指派，不能相加)
    if (this.player.metaCdr > 0) {
      this.player.cdrMultiplier = Math.max(0.3, this.player.cdrMultiplier * (1 - this.player.metaCdr));
    }

    // 角色特質的常駐加成 (例如兔兔「跑得越快打越痛」)
    this.player.character.passive?.(this.player);
  }

  update(dt, enemies, particleSystem) {
    // 推進延遲射擊佇列 (倒數完才開火，吃暫停也吃遊戲結束)
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        d.fn();
      }
    }

    // 移除已銷毀投射物
    this.projectiles = this.projectiles.filter((p) => !p.isDead);

    // 更新各武器冷卻與自動攻擊
    for (const [id, item] of this.weapons.entries()) {
      const def = WEAPONS[id];
      if (!def) continue;

      item.cooldownTimer -= dt;

      // 檢查冷卻完畢
      if (item.cooldownTimer <= 0) {
        this.fireWeapon(id, item, def, enemies, particleSystem);

        // 重置冷卻時間 (套用玩家冷卻縮減 cdrMultiplier)
        const baseCd = def.baseCooldown + (def.cooldownGrowth ? def.cooldownGrowth * (item.level - 1) : 0);
        const overload = this.player.overloadTimer > 0 ? 0.5 : 1;
        item.cooldownTimer = Math.max(0.08, baseCd * this.player.cdrMultiplier * overload);
      }
    }

    // 更新現有投射物
    for (const p of this.projectiles) {
      p.update(dt, this.player, (rocketProj) => {
        // 火箭到期或碰撞爆炸回呼
        this.createExplosion(rocketProj, enemies, particleSystem);
      });
    }
  }

  // 統一產生投射物。crit 必須由開火端顯式帶入 —— 延遲開火的閉包若回頭讀 this，
  // 期間別把武器開火會把旗標蓋掉，暴擊跳字與「連環爆裂」特效就會掛在錯的彈上。
  mkProjectile(options, crit = false) {
    if (this.player.legendaryEffects?.includes('pierce_all') && options.pierce !== undefined) {
      options.pierce = 999;
    } else if (this.player.bonusPierce && options.pierce !== undefined && options.pierce < 900) {
      options.pierce += this.player.bonusPierce;
    }
    const p = new Projectile(options);
    p.isCrit = crit;
    return p;
  }

  // 排入一發延遲開火 (秒)，由 update() 依遊戲時間觸發
  schedule(delay, fn) {
    this.delayed.push({ t: delay, fn });
  }

  fireWeapon(id, item, def, enemies, particleSystem) {
    // 環繞型武器沒有敵人也要維持旋轉
    if (enemies.length === 0 && id !== 'guardian' && id !== 'eternal_domain' &&
        id !== 'orbit_saw' && id !== 'singularity_ring') return;

    const baseDmg = def.baseDamage + (def.damageGrowth ? def.damageGrowth * (item.level - 1) : 0);
    const crit = Math.random() < (this.player.critChance || 0) + (this.player.metaCrit || 0);
    const critMul = 2 + (this.player.metaCritDmg || 0);
    const finalDamage = Math.round(baseDmg * this.player.damageMultiplier * (crit ? critMul : 1));

    switch (id) {
      case 'kunai':
      case 'ghost_shuriken':
      case 'phase_blade':
      case 'phase_storm':
        this.fireKunai(def, item, finalDamage, enemies, crit);
        break;

      case 'guardian':
      case 'eternal_domain':
      case 'orbit_saw':
      case 'singularity_ring':
        this.fireGuardian(def, item, finalDamage, crit);
        break;

      case 'rocket':
      case 'shark_torpedo':
        this.fireRocket(def, item, finalDamage, enemies, crit);
        break;

      case 'molotov':
      case 'napalm_sea':
        this.fireMolotov(def, item, finalDamage, enemies, crit);
        break;

      case 'lightning':
      case 'plasma_storm':
        this.fireLightning(def, item, finalDamage, enemies, particleSystem, crit);
        break;

      case 'soccer':
      case 'quantum_sphere':
        this.fireSoccer(def, item, finalDamage, enemies, crit);
        break;
    }
  }

  // 1. 苦無 / 幽靈手裏劍 (追蹤發射)
  fireKunai(def, item, damage, enemies, crit = false) {
    // 尋找最近的敵人
    const target = this.getClosestEnemy(enemies);
    if (!target) return;

    const count = def.isEvo ? 1 : def.projectiles[item.level - 1];
    const pierce = def.isEvo ? def.pierce : def.pierce[item.level - 1];

    for (let i = 0; i < count; i++) {
      this.schedule(i * 0.07, () => {
        if (!target) return;
        const dx = target.x - this.player.x;
        const dy = target.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        // 稍微散佈角度
        const spread = (i - (count - 1) / 2) * 0.12;
        const baseAngle = Math.atan2(dy, dx) + spread;

        this.projectiles.push(
          this.mkProjectile({
            type: def.projType || 'kunai',
            weaponId: def.id,
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(baseAngle) * def.speed,
            vy: Math.sin(baseAngle) * def.speed,
            damage: damage,
            radius: 7 * this.player.rangeMultiplier,
            pierce: pierce,
            life: 2.2,
            isEvo: def.isEvo,
            knockback: 1.5,
          }, crit)
        );
        sound.playShoot();
      });
    }
  }

  // 2. 守護輪盤 / 永恆守護力場
  fireGuardian(def, item, damage, crit = false) {
    const fam = def.projType || 'guardian';
    // 移除同家族的舊環體 (守護輪盤/重力環鋸各自獨立，不會互清)
    this.projectiles = this.projectiles.filter((p) => p.type !== fam);

    const count = def.isEvo ? def.count : def.count[item.level - 1];
    const radius = (def.isEvo ? def.radius : def.radius[item.level - 1]) * this.player.rangeMultiplier;

    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count;
      this.projectiles.push(
        this.mkProjectile({
          type: fam,
          weaponId: def.id,
          x: this.player.x,
          y: this.player.y,
          damage: damage,
          radius: 12 * this.player.rangeMultiplier,
          orbitAngle: angle,
          orbitRadius: radius,
          spinSpeed: def.spinSpeed,
          pierce: 9999,
          life: def.duration,
          isEvo: def.isEvo,
          knockback: 4.5,
        }, crit)
      );
    }
  }

  // 3. 火箭 / 鯊魚核彈
  fireRocket(def, item, damage, enemies, crit = false) {
    const target = this.getRandomEnemy(enemies);
    if (!target) return;

    const count = def.isEvo ? def.count : def.count[item.level - 1];
    const expRadius = (def.isEvo ? def.explosionRadius : def.explosionRadius[item.level - 1]) * this.player.rangeMultiplier;

    for (let i = 0; i < count; i++) {
      this.schedule(i * 0.15, () => {
        const dx = target.x + (Math.random() * 60 - 30) - this.player.x;
        const dy = target.y + (Math.random() * 60 - 30) - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        this.projectiles.push(
          this.mkProjectile({
            type: 'rocket',
            weaponId: def.id,
            x: this.player.x,
            y: this.player.y,
            vx: (dx / dist) * def.speed,
            vy: (dy / dist) * def.speed,
            damage: damage,
            radius: 10,
            explosionRadius: expRadius,
            pierce: 1,
            life: Math.min(2.5, dist / def.speed + 0.1),
            isEvo: def.isEvo,
          }, crit)
        );
        sound.playShoot();
      });
    }
  }

  // 4. 燃燒瓶 / 燃油煉獄
  fireMolotov(def, item, damage, enemies, crit = false) {
    const count = def.isEvo ? def.count : def.count[item.level - 1];
    const r = (def.isEvo ? def.radius : def.radius[item.level - 1]) * this.player.rangeMultiplier;

    for (let i = 0; i < count; i++) {
      const target = this.getRandomEnemy(enemies);
      const targetX = target ? target.x + (Math.random() * 40 - 20) : this.player.x + (Math.random() * 160 - 80);
      const targetY = target ? target.y + (Math.random() * 40 - 20) : this.player.y + (Math.random() * 160 - 80);

      this.projectiles.push(
        this.mkProjectile({
          type: 'fire_pool',
          weaponId: def.id,
          x: targetX,
          y: targetY,
          damage: damage,
          radius: r,
          pierce: 9999,
          life: def.duration,
          isEvo: def.isEvo,
          knockback: 0.2,
        }, crit)
      );
    }
  }

  // 5. 天降狂雷 / 狂雷星暴
  fireLightning(def, item, damage, enemies, particleSystem, crit = false) {
    const strikes = def.isEvo ? def.strikes : def.strikes[item.level - 1];

    for (let i = 0; i < strikes; i++) {
      this.schedule(i * 0.12, () => {
        const target = this.getRandomEnemy(enemies);
        if (!target) return;

        // 造成範圍定點落雷
        const blastRadius = 45 * this.player.rangeMultiplier;
        sound.playLightning();

        if (particleSystem) {
          particleSystem.createLightning(target.x, target.y, blastRadius, def.isEvo);
        }

        // 傷害周圍怪物
        for (const enemy of enemies) {
          const d = Math.hypot(enemy.x - target.x, enemy.y - target.y);
          if (d <= blastRadius + enemy.radius) {
            enemy.takeDamage(damage, 2, target.x, target.y);
            this.recordDamage(def.id, damage);
            if (particleSystem) {
              particleSystem.createDamageText(enemy.x, enemy.y, damage, true);
            }
          }
        }
      });
    }
  }

  // 6. 量子足球 / 量子星雲球
  fireSoccer(def, item, damage, enemies, crit = false) {
    const count = def.isEvo ? def.count : def.count[item.level - 1];
    const bounces = def.isEvo ? def.bounces : def.bounces[item.level - 1];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.projectiles.push(
        this.mkProjectile({
          type: 'soccer',
          weaponId: def.id,
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(angle) * def.speed,
          vy: Math.sin(angle) * def.speed,
          damage: damage,
          radius: 10 * this.player.rangeMultiplier,
          bounces: bounces,
          pierce: 9999,
          life: 8.0,
          isEvo: def.isEvo,
          knockback: 3.5,
        }, crit)
      );
      sound.playShoot();
    }
  }

  // 火箭爆炸處理
  createExplosion(rocketProj, enemies, particleSystem) {
    if (rocketProj.hasExploded) return;
    rocketProj.hasExploded = true;
    rocketProj.isDead = true;

    sound.playExplosion();

    if (particleSystem) {
      particleSystem.createExplosion(rocketProj.x, rocketProj.y, rocketProj.explosionRadius, rocketProj.isEvo);
    }

    // 範圍傷害
    for (const enemy of enemies) {
      const dist = Math.hypot(enemy.x - rocketProj.x, enemy.y - rocketProj.y);
      if (dist <= rocketProj.explosionRadius + enemy.radius) {
        enemy.takeDamage(rocketProj.damage, 5, rocketProj.x, rocketProj.y);
        this.recordDamage(rocketProj.weaponId, rocketProj.damage);
        if (particleSystem) {
          particleSystem.createDamageText(enemy.x, enemy.y, rocketProj.damage, true);
        }
      }
    }
  }

  recordDamage(weaponId, amount) {
    if (weaponId === 'merc') {
      this.mercTotalDamage += amount;
      return;
    }
    if (weaponId === 'turret') {
      this.turretTotalDamage += amount;
      return;
    }
    const item = this.weapons.get(weaponId);
    if (item) {
      item.totalDamage += amount;
    }
  }

  getClosestEnemy(enemies) {
    let closest = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (e.isDead) continue; // 本幀剛死、還沒被清除的屍體不鎖定
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (d < minDist) {
        minDist = d;
        closest = e;
      }
    }
    return closest;
  }

  getRandomEnemy(enemies) {
    let alive = 0;
    for (const e of enemies) if (!e.isDead) alive++;
    if (alive === 0) return null;
    let pick = Math.floor(Math.random() * alive);
    for (const e of enemies) {
      if (e.isDead) continue;
      if (pick-- === 0) return e;
    }
    return null;
  }

  draw(ctx, camera) {
    for (const p of this.projectiles) {
      p.draw(ctx, camera);
    }
  }
}
