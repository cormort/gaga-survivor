// 武器管理器 (自動鎖定、冷卻計時、投射物生成、超武進化檢測與傷害統計)

import { WEAPONS, PASSIVES, CHARGE, WEAPON_ASPECTS } from '../config.js';
import { Projectile } from '../entities/Projectile.js';
import { sound } from '../audio.js';

// 同一隻敵人被同一個投射物再次命中的間隔 (秒)
const ORBIT_REHIT = 0.4;   // 環繞刀刃：每目標 DPS ≈ 單刀傷害 / 0.4
const SOCCER_REHIT = 0.5;  // 彈跳球：讓「彈跳次數」真的能轉成傷害

// 武器 id → 型態家族。8 把超武都掛在自己基礎武器的型態上（型態由出擊選單選擇，
// 存在存檔的 weaponAspects，鍵是 6 把基礎武器）。phase_blade 與 phase_storm 的
// 行為由苦無的型態決定 —— 先前引擎永遠讀 'kunai'，連帶讓「基隆苦無」把進化後的
// 幽靈手裏劍與相位風暴一起砍成 60% 傷害。
const ASPECT_FAMILY = {
  kunai: 'kunai', ghost_shuriken: 'kunai', phase_blade: 'kunai', phase_storm: 'kunai',
  guardian: 'guardian', eternal_domain: 'guardian', orbit_saw: 'guardian', singularity_ring: 'guardian',
  rocket: 'rocket', shark_torpedo: 'rocket',
  molotov: 'molotov', napalm_sea: 'molotov',
  lightning: 'lightning', plasma_storm: 'lightning',
  soccer: 'soccer', quantum_sphere: 'soccer',
};

export class WeaponManager {
  constructor(player) {
    this.shotCount = new Map(); // 各武器累計發數 (蓄能彈用)
    this.player = player;
    this.game = null;

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

    // 混沌型態的飛盤發射冷卻：以遊戲時間倒數 (原本用 Date.now()，
    // 暫停或開升級卡時照樣在跑，回來就白送一發)
    this._sawEjectCd = 0;

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

    // 局內祝福效果乘數。15 個祝福各自用 blessingXxxMul 欄位，這裡集中套用；
    // 原本還有一個 blessingDmgMul 分支，但全 repo 沒有任何祝福會設定它（死讀取）。
    if (this.player.blessingCdrMul) {
      this.player.cdrMultiplier = Math.max(0.3, this.player.cdrMultiplier * this.player.blessingCdrMul);
    }
    if (this.player.blessingAreaMul) {
      this.player.rangeMultiplier *= this.player.blessingAreaMul;
    }
    if (this.player.blessingMagnetMul) {
      this.player.magnetMultiplier *= this.player.blessingMagnetMul;
    }

    // 協同效果：彈幕風暴 (投射物冷卻 -20%)
    // 商人臨時增益必須在每次被動重算後重新套用。applyPassives 會把
    // cdrMultiplier / magnetMultiplier 從頭算，而買了「臨時過載晶片」之後
    // 只要再升一級就會被重置掉 —— 計時器還在跑，效果卻消失了。
    const buffs = this.game && this.game._tempBuffs;
    if (buffs && buffs.length > 0) {
      for (const b of buffs) {
        if (!b.reapply) continue;
        b.reapply(this.player);
      }
    }

    if (this.player.synergies?.projCdrMul) {
      this.player.cdrMultiplier = Math.max(0.3, this.player.cdrMultiplier * this.player.synergies.projCdrMul);
    }

    // 局外裝備的冷卻縮減：被動算完後再乘 (被動是直接指派，不能相加)
    if (this.player.metaCdr > 0) {
      this.player.cdrMultiplier = Math.max(0.3, this.player.cdrMultiplier * (1 - this.player.metaCdr));
    }

    // 角色特質的常駐加成 (例如兔兔「跑得越快打越痛」)
    this.player.character.passive?.(this.player);
  }

  // 目前這把武器吃的型態與數值表。型態的數字只放在 config.js 的
  // WEAPON_ASPECTS[*].stats，引擎不再各自硬寫第二份 —— 先前 18 個 stats 物件
  // 全部沒有讀者，而塔納托斯／阿基里斯／宙斯連鎖數等宣告的效果根本沒實作。
  aspectOf(weaponId) {
    const fam = ASPECT_FAMILY[weaponId] || 'kunai';
    const list = WEAPON_ASPECTS[fam] || [];
    const wanted = (this.player.weaponAspects && this.player.weaponAspects[fam]) || (list[0] && list[0].id);
    const entry = list.find((a) => a.id === wanted) || list[0] || null;
    return { fam, id: entry ? entry.id : null, stats: (entry && entry.stats) || {} };
  }

  update(dt, enemies, particleSystem) {
    if (this._sawEjectCd > 0) this._sawEjectCd -= dt;

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

        // 重置冷卻時間 (套用玩家冷卻縮減 cdrMultiplier 與型態的 cdMul)
        const baseCd = def.baseCooldown + (def.cooldownGrowth ? def.cooldownGrowth * (item.level - 1) : 0);
        const overload = this.player.overloadTimer > 0 ? 0.5 : 1;
        // 型態冷卻倍率：札格苦無 0.70 (射速 +30%)、赫斯提亞火箭 1.15 (冷卻 +15%)。
        // 這兩個數字先前都沒有任何讀者。
        const aspectCd = this.aspectOf(id).stats.cdMul || 1;
        item.cooldownTimer = Math.max(0.08, baseCd * this.player.cdrMultiplier * overload * aspectCd);
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
    // 幸運藥劑 (+25% 暴擊率) 與力量藥劑 (+40% 傷害) 在這裡讀計時器。
    // 兩者原本都只被倒數與畫光環，沒有任何傷害路徑讀取 —— 撿到等於沒撿。
    const crit = Math.random() < (this.player.critChance || 0) + (this.player.metaCrit || 0) +
      (this.player.luckPotionTimer > 0 ? 0.25 : 0);
    const critMul = 2 + (this.player.metaCritDmg || 0);
    const potionDmgMul = this.player.atkPotionTimer > 0 ? 1.4 : 1;
    const finalDamage = Math.round(baseDmg * this.player.damageMultiplier * potionDmgMul * (crit ? critMul : 1) * (this.player.blessingBerserkerMul || 1));

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
  // 蓄能：逐發計數 (不是逐輪)，每 charge.every 發回傳一次元素效果 (協同：元素融合可減少間隔)
  chargeFor(def) {
    if (!def.charge) return null;
    const n = (this.shotCount.get(def.id) || 0) + 1;
    this.shotCount.set(def.id, n);
    const interval = Math.max(1, def.charge.every - (this.player.synergies?.chargeReduction || 0));
    return n % interval === 0 ? def.charge.effect : null;
  }

  fireKunai(def, item, damage, enemies, crit = false) {
    const target = this.getClosestEnemy(enemies);
    if (!target) return;

    // 型態要跟著「這把武器自己的家族」而不是永遠讀 kunai：fireKunai 同時服務
    // phase_blade / ghost_shuriken / phase_storm，原本選了基隆苦無會讓進化後的
    // 幽靈手裏劍與相位風暴永久只打 60% 傷害 (扇形補償對 isEvo 不生效)。
    const { id: aspect, stats } = this.aspectOf(def.id);
    let finalCrit = crit;
    let finalDmg = damage;

    // 涅墨西斯型態：翻滾後 dashCritDur 秒內必暴 + 暴擊傷害倍率
    if (stats.dashCritDur && this.player.nemesisCritTimer > 0) {
      finalCrit = true;
      finalDmg = Math.round(damage * (stats.critDmgMul || 1.5));
    }

    const baseCount = def.isEvo ? 1 : def.projectiles[item.level - 1];
    const pierce = def.isEvo ? def.pierce : def.pierce[item.level - 1];
    const speed = def.speed * (stats.speedMul || 1);
    const rangeMul = this.player.rangeMultiplier * (stats.rangeMul || 1);

    for (let i = 0; i < baseCount; i++) {
      const charged = this.chargeFor(def);

      this.schedule(i * 0.07, () => {
        if (!target) return;
        const dx = target.x - this.player.x;
        const dy = target.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        // 基隆型態：每發扇形射出 fanCount 枚標記飛刀 (只有非超武吃這個扇形)
        const fanCount = (!def.isEvo && stats.fanCount) ? stats.fanCount : 1;
        for (let f = 0; f < fanCount; f++) {
          const spread = (i - (baseCount - 1) / 2) * 0.12 + (f - (fanCount - 1) / 2) * 0.18;
          const baseAngle = Math.atan2(dy, dx) + spread;

          this.projectiles.push(
            this.mkProjectile({
              type: def.projType || 'kunai',
              weaponId: def.id,
              x: this.player.x,
              y: this.player.y,
              vx: Math.cos(baseAngle) * speed,
              vy: Math.sin(baseAngle) * speed,
              // 扇形傷害補償只在「真的射出多發」時套用：先前條件寫成 aspect === 'chiron'
              // 而不管 fanCount，進化武器 (扇形被停用) 因此白吃 ×0.6 的永久減傷
              damage: fanCount > 1 ? Math.round(finalDmg * (stats.fanDamageMul || 1)) : finalDmg,
              radius: 7 * rangeMul,
              pierce: pierce,
              life: 2.2,
              isEvo: def.isEvo,
              charge: charged,
              knockback: 1.5,
              markOnHit: !!stats.markDamageBonus,
              markDur: stats.markDur || 5,
              markBonus: stats.markDamageBonus || 0,
            }, finalCrit)
          );
        }
        sound.playShoot('kunai');
      });
    }
  }

  // 2. 守護輪盤 / 永恆守護力場
  fireGuardian(def, item, damage, crit = false) {
    const fam = def.projType || 'guardian';
    const { stats } = this.aspectOf(def.id);
    let count = (def.isEvo ? def.count : def.count[item.level - 1]) + (stats.extraBlades || 0);
    const radius = (def.isEvo ? def.radius : def.radius[item.level - 1]) * this.player.rangeMultiplier * (stats.radiusMul || 1);
    const spinSpeed = def.spinSpeed * (stats.spinSpeedMul || 1) * (this.player.blessingSpinMul || 1) * (this.player.synergies?.orbitSpeedMul || 1);

    // 混沌型態：定時向外發射一枚高速穿透飛刃。
    // 這裡必須放在「超武規格沒變就跳過重建」的早退之前，否則超武版本的輪盤
    // 永遠不會發射飛盤 (早退會直接 return)。
    if (stats.ejectRate && this._sawEjectCd <= 0) {
      this._sawEjectCd = stats.ejectRate;
      const randAngle = Math.random() * Math.PI * 2;
      this.projectiles.push(
        this.mkProjectile({
          type: 'saw',
          weaponId: def.id,
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(randAngle) * (stats.ejectSpeed || 360),
          vy: Math.sin(randAngle) * (stats.ejectSpeed || 360),
          damage: Math.round(damage * (stats.ejectDamageMul || 1.2)),
          radius: 14,
          pierce: stats.ejectPierce || 8,
          life: stats.ejectLife || 3.0,
          knockback: 3,
        }, crit)
      );
    }

    const alive = this.projectiles.filter((p) => p.type === fam && !p.isDead);
    if (def.isEvo && alive.length === count &&
        alive[0].damage === damage && Math.abs(alive[0].orbitRadius - radius) < 0.01) {
      return;
    }
    this.projectiles = this.projectiles.filter((p) => p.type !== fam);

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
          spinSpeed: spinSpeed,
          pierce: 9999,
          life: def.duration,
          isEvo: def.isEvo,
          knockback: 4.5,
          rehit: ORBIT_REHIT,
          reflectBullets: !!stats.reflectBullets,
        }, crit)
      );
    }
  }

  // 3. 火箭 / 鯊魚核彈
  fireRocket(def, item, damage, enemies, crit = false) {
    const target = this.getRandomEnemy(enemies);
    if (!target) return;

    const { id: aspect, stats } = this.aspectOf(def.id);
    let count = def.isEvo ? def.count : def.count[item.level - 1];
    if (stats.clusterMul) count *= stats.clusterMul; // 埃里斯：蜂巢集群微型火箭

    let expRadius = (def.isEvo ? def.explosionRadius : def.explosionRadius[item.level - 1]) * this.player.rangeMultiplier * (this.player.synergies?.explosionRangeMul || 1) * (stats.blastRadiusMul || 1);

    for (let i = 0; i < count; i++) {
      const charged = this.chargeFor(def);
      this.schedule(i * (stats.delay || 0.15), () => {
        const dx = target.x + (Math.random() * 60 - 30) - this.player.x;
        const dy = target.y + (Math.random() * 60 - 30) - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        const spd = def.speed * (stats.speedMul || 1);
        const dmg = Math.round(damage * (stats.damageMul || 1));

        this.projectiles.push(
          this.mkProjectile({
            type: 'rocket',
            weaponId: def.id,
            x: this.player.x,
            y: this.player.y,
            vx: (dx / dist) * spd,
            vy: (dy / dist) * spd,
            damage: dmg,
            radius: stats.projRadius || 10,
            explosionRadius: expRadius,
            pierce: stats.pierce || 1,
            life: Math.min(2.5, dist / spd + 0.1),
            isEvo: def.isEvo,
            charge: charged,
            aspect: aspect,
            lavaDuration: stats.lavaDuration,
            lavaRadius: stats.lavaRadius,
            lavaDamageMul: stats.lavaDamageMul,
          }, crit)
        );
        sound.playShoot('rocket');
      });
    }
  }

  // 4. 燃燒瓶 / 燃油煉獄
  fireMolotov(def, item, damage, enemies, crit = false) {
    const { id: aspect, stats } = this.aspectOf(def.id);
    const count = def.isEvo ? def.count : def.count[item.level - 1];
    const r = (def.isEvo ? def.radius : def.radius[item.level - 1]) * this.player.rangeMultiplier * (stats.radiusMul || 1);

    for (let i = 0; i < count; i++) {
      const target = this.getRandomEnemy(enemies);
      const targetX = target ? target.x + (Math.random() * 40 - 20) : this.player.x + (Math.random() * 160 - 80);
      const targetY = target ? target.y + (Math.random() * 40 - 20) : this.player.y + (Math.random() * 160 - 80);

      sound.playShoot('molotov');   // 燃燒瓶原本沒有任何投擲音效（六種武器唯一的靜音）
      // 波塞頓型態：落地時激流爆破，強力擊退並減速
      if (stats.splashDamageMul) {
        sound.playExplosion(targetX);
        for (const e of enemies) {
          const d = Math.hypot(e.x - targetX, e.y - targetY);
          if (d <= r + 40) {
            e.takeDamage(Math.round(damage * stats.splashDamageMul), stats.knockback || 18, targetX, targetY);
            e.applySlow(stats.slowDur || 3.0);
          }
        }
      }

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
          isSanctuary: !!stats.sanctuary,
          // 札格型態：火海跳頻 +30% (tickRateMul 0.70) —— 這個欄位先前沒有讀者
          tickInterval: 0.25 * (stats.tickRateMul || 1),
          healPerSec: stats.healPerSec || 0,
        }, crit)
      );
    }
  }

  // 5. 天降狂雷 / 狂雷星暴
  fireLightning(def, item, damage, enemies, particleSystem, crit = false) {
    const { id: aspect, stats } = this.aspectOf(def.id);
    const strikes = def.isEvo ? def.strikes : def.strikes[item.level - 1];
    const finalDmg = Math.round(damage * (stats.damageMul || 1));
    const blastRadius = 45 * this.player.rangeMultiplier * (stats.radiusMul || 1);

    for (let i = 0; i < strikes; i++) {
      this.schedule(i * 0.12, () => {
        const target = this.getRandomEnemy(enemies);
        if (!target) return;

        sound.playLightning();
        if (particleSystem) {
          particleSystem.createLightning(target.x, target.y, blastRadius, def.isEvo || !!stats.stunDur);
        }

        for (const enemy of enemies) {
          const d = Math.hypot(enemy.x - target.x, enemy.y - target.y);
          if (d <= blastRadius + enemy.radius) {
            enemy.takeDamage(finalDmg, 2, target.x, target.y);
            this.recordDamage(def.id, finalDmg);
            if (stats.stunDur) enemy.applyStun(stats.stunDur);
            if (particleSystem) {
              particleSystem.createDamageText(enemy.x, enemy.y, finalDmg, true);
            }
          }
        }

        // 宙斯型態：連鎖電弧。跳躍數改由型態資料決定 (chainShock 先前把第 4 個
        // 參數丟掉、永遠用 CHARGE.chain.jumps = 3，宣告的 4 名敵人沒有生效)
        if (stats.chainTargets && this.game?.chainShock) {
          this.game.chainShock(target, Math.round(finalDmg * (stats.chainDamageRatio || 0.7)), 'lightning', stats.chainTargets);
        }

        // 混沌型態：電磁脈衝把半徑內的敵人往中心牽引
        if (stats.pullRadius) {
          for (const e of enemies) {
            const ed = Math.hypot(e.x - target.x, e.y - target.y);
            if (ed > 10 && ed < stats.pullRadius) {
              e.x += ((target.x - e.x) / ed) * (stats.pullStrength || 80);
              e.y += ((target.y - e.y) / ed) * (stats.pullStrength || 80);
            }
          }
        }
      });
    }
  }

  // 6. 量子足球 / 量子星雲球
  fireSoccer(def, item, damage, enemies, crit = false) {
    const { id: aspect, stats } = this.aspectOf(def.id);
    const count = def.isEvo ? def.count : def.count[item.level - 1];
    const bounces = def.isEvo ? def.bounces : def.bounces[item.level - 1];
    const rad = 10 * this.player.rangeMultiplier * (stats.radiusMul || 1);

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
          radius: rad,
          bounces: bounces,
          pierce: 9999,
          life: 8.0,
          isEvo: def.isEvo,
          knockback: 3.5,
          rehit: SOCCER_REHIT,
          charge: stats.freezeDur ? 'freeze' : this.chargeFor(def),
          aspect: aspect,
          freezeDur: stats.freezeDur,
          // 塔納托斯：每次命中傷害成長與第 N 次命中的虛空引爆 (先前 thanatosBounces
          // 只被寫入一次、從未遞增或讀取，整個型態等於不存在)
          thanatosBounces: 0,
          bounceGrowth: stats.bounceDmgGrowth || 0,
          implosionAt: stats.implosionAt || 0,
          implosionRadius: stats.implosionRadius || 0,
          implosionDamage: stats.implosionDamage || 0,
        }, crit)
      );
      sound.playShoot('soccer');
    }
  }

  // 火箭爆炸處理
  createExplosion(rocketProj, enemies, particleSystem) {
    if (rocketProj.hasExploded) return;
    rocketProj.hasExploded = true;
    rocketProj.isDead = true;

    sound.playExplosion(rocketProj.x);

    if (particleSystem) {
      particleSystem.createExplosion(rocketProj.x, rocketProj.y, rocketProj.explosionRadius, rocketProj.isEvo);
    }

    // 範圍傷害
    for (const enemy of enemies) {
      const dist = Math.hypot(enemy.x - rocketProj.x, enemy.y - rocketProj.y);
      if (dist <= rocketProj.explosionRadius + enemy.radius) {
        enemy.takeDamage(rocketProj.damage, 5, rocketProj.x, rocketProj.y);
        this.recordDamage(rocketProj.weaponId, rocketProj.damage);
        // 毒氣彈：爆炸範圍內全員中毒 (火箭的蓄能效果走爆炸，不走直接命中)
        if (rocketProj.charge === 'poison') {
          enemy.applyPoison(CHARGE.poison.duration, rocketProj.weaponId);
        }
        if (particleSystem) {
          particleSystem.createDamageText(enemy.x, enemy.y, rocketProj.damage, true);
        }
      }
    }

    // 爆炸波及破壞地圖木箱/油桶
    if (this.player.game && this.player.game.destructibles) {
      for (let i = this.player.game.destructibles.length - 1; i >= 0; i--) {
        const crate = this.player.game.destructibles[i];
        if (crate.isDead) continue;
        const dist = Math.hypot(crate.x - rocketProj.x, crate.y - rocketProj.y);
        if (dist <= rocketProj.explosionRadius + crate.radius) {
          const destroyed = crate.takeDamage(rocketProj.damage);
          if (particleSystem) {
            particleSystem.createDamageText(crate.x, crate.y, Math.round(rocketProj.damage), false);
          }
          if (destroyed) {
            crate.splinter(particleSystem);
            this.player.game.dropCrateLoot(crate.x, crate.y, crate.kind);
            this.player.game.destructibles.splice(i, 1);
          }
        }
      }
    }

    // 路西法型態：爆炸在地面留下熔岩坑 (秒數/半徑/傷害倍率都來自型態資料)
    if (rocketProj.lavaDuration) {
      this.projectiles.push(
        this.mkProjectile({
          type: 'fire_pool',
          weaponId: rocketProj.weaponId,
          x: rocketProj.x,
          y: rocketProj.y,
          damage: Math.round(rocketProj.damage * (rocketProj.lavaDamageMul || 0.4)),
          radius: rocketProj.lavaRadius || 55,
          pierce: 9999,
          life: rocketProj.lavaDuration,
          knockback: 0.1,
        })
      );
    }
  }

  recordDamage(weaponId, amount) {
    if (weaponId === 'merc') {
      this.mercTotalDamage += amount;
      return;
    }
    if (weaponId === 'turret' || weaponId === 'electric_grid' || weaponId === 'purifier' || weaponId === 'barricade') {
      // 四種設施都算進「設施傷害」：先前只特判 'turret'，電網與淨化裝置打出的
      // 傷害會在結算面板上整批消失
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
