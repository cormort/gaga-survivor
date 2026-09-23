// 武器管理器 (自動鎖定、冷卻計時、投射物生成、超武進化檢測與傷害統計)

import { WEAPONS, PASSIVES, CHARGE, WEAPON_ASPECTS } from '../config.js';
import { Projectile } from '../entities/Projectile.js';
import { drawHeldWeapon, HELD_MOUNTS } from './WeaponArt.js';
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
  boomerang: 'boomerang', twin_storm: 'boomerang',
  railgun: 'railgun', annihilation_beam: 'railgun',
  frost_nova: 'frost_nova', absolute_zero: 'frost_nova',
  shotgun: 'shotgun', dragon_breath: 'shotgun',
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
    this._stormCd = 0;   // 永恆守護力場的擊退風暴冷卻（同樣以遊戲時間倒數）

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
      // 手持外觀用：最後一次開火方向、後座與槍口火光的剩餘量 (0~1)
      aim: this.player.facing < 0 ? Math.PI : 0,
      recoil: 0,
      muzzle: 0,
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
      aim: old.aim != null ? old.aim : (this.player.facing < 0 ? Math.PI : 0),
      recoil: 0,
      muzzle: 1,   // 進化瞬間讓槍口亮一下，作為「換手了」的視覺提示
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
    const p = this.player;
    const meta = p.meta || { dmg: 0, hp: 0, speed: 0, magnet: 0, gold: 0, cdr: 0, crit: 0, critdmg: 0, armor: 0, exp: 0 };
    const run = p.runMuls || { speed: 1, magnet: 1 };
    // 傳奇特效的屬性加成（音速突進／引力漩渦）。這些在引擎裡是加到「最終倍率」上，
    // 與詞條／天賦（加在角色基礎值）語意不同 —— 混在一起會讓 50% 移速變成 +8%。
    const leg = p.legendary || { cdr: 0, speed: 0, magnet: 0 };

    // 唯一的「局外加成套用點」。計算語意是「重算」而不是「累加」：
    // 每次升級／買被動都會重跑這裡，所以任何加成只要寫成 += 就會被疊第二次或沖掉。
    //
    // 每一條 meta 欄位都是「永久層 + 局內層」相加：
    //   永久層 = player.meta（天賦＋裝備詞條），局內層 = player.blessing*（祝福、興奮劑）
    // 為什麼要分局內層：祝福是單局的，但這些欄位的總和必須每次重算 ——
    // 直接寫進總和欄位（例如 p.metaCrit += 0.15）會在升級時被這行重算歸零，
    // 祝福就等於沒選到（實測 crit_storm 選了之後 metaCrit 一直是 0）。
    const bl = p.blessing || {};
    p.legendaryEffects = this.game?.gearEffects || p.legendaryEffects || [];
    p.metaDmg = meta.dmg;
    p.metaCdr = meta.cdr;
    p.metaCrit = (meta.crit || 0) + (bl.crit || 0);
    p.metaCritDmg = (meta.critdmg || 0) + (bl.critDmg || 0);
    p.metaArmor = Math.min(0.5, meta.armor);   // 減傷上限 50%，防止堆滿免疫
    p.metaExp = (meta.exp || 0) + (bl.exp || 0);
    p.gearHp = meta.hp;

    p.damageMultiplier = 1.0 + (p.metaDmg || 0);          // 天賦／裝備的常駐傷害
    // 角色基礎移速 + 裝備詞條移速 + 傳奇特效移速。
    // baseSpeedMul 保持「不含單局加成」的語意，單局加成只反映在 speedMultiplier 上
    // （唯一寫入點就是這三行，其他地方不該再改它）。
    const baseSpeed = (p.charBaseSpeedMul ?? 1.0) + (meta.speed || 0) + (leg.speed || 0);
    const baseMagnet = (p.charBaseMagnet ?? 1.0) + (meta.magnet || 0) + (leg.magnet || 0);
    p.baseSpeedMul = baseSpeed;
    p.baseMagnet = baseMagnet;
    p.speedMultiplier = baseSpeed * (run.speed || 1);
    p.magnetMultiplier = baseMagnet * (run.magnet || 1);
    p.cdrMultiplier = 1.0;
    p.rangeMultiplier = 1.0;
    p.hpRegen = 0;
    const prevMaxHp = p.maxHp;
    p.maxHp = (p.charMaxHp ?? p.baseMaxHp ?? 100) + (p.gearHp || 0);
    p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - prevMaxHp));

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

    // 防彈護甲：生命上限 = 角色基礎 + 裝備 + 護甲被動。維持「角色基礎值往上加」
    // 的語意（企鵝 130 不會被覆寫回 100），升級瞬間把多出來的上限同步補進當前 HP。
    if (vestLevel > 0) {
      const prevMax = this.player.maxHp;
      const nextMax = (this.player.charMaxHp ?? this.player.baseMaxHp ?? 100)
        + (this.player.gearHp || 0)
        + PASSIVES.max_hp_vest.valuePerLevel * vestLevel;
      this.player.maxHp = nextMax;
      this.player.baseMaxHp = nextMax;
      this.player.hp = Math.min(nextMax, this.player.hp + Math.max(0, nextMax - prevMax));
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
    // 出擊規則卡的冷卻倍率（貫穿彈頭 ×1.15、時間壓縮 ×0.8）
    if (this.player.runCardCdrMul) {
      this.player.cdrMultiplier = Math.max(0.3, this.player.cdrMultiplier * this.player.runCardCdrMul);
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

    // 局外裝備的冷卻縮減：被動算完後再乘 (被動是直接指派，不能相加)。
    // 詞條（metaCdr）與傳奇特效「極限超頻」（leg.cdr）同語意，一起算。
    const totalCdr = (this.player.metaCdr || 0) + (leg.cdr || 0);
    if (totalCdr > 0) {
      this.player.cdrMultiplier = Math.max(0.3, this.player.cdrMultiplier * (1 - totalCdr));
    }

    // 承受傷害 = 基礎層（角色特質 × 每日詞綴 × 關卡／難度規則）× 祝福的風險懲罰。
    // 風險懲罰在這裡重算而不是在 applyBlessing 裡寫死：祝福是每局重新拿的，
    // 但這條公式會被升級、買被動、換祝福反覆重跑，寫死就會被沖掉或疊兩次。
    if (p.baseDamageTaken !== undefined) {
      p.damageTakenMul = p.baseDamageTaken * (p.blessingDamageRisk || 1);
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
    if (this._stormCd > 0) this._stormCd -= dt;

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

      // 手持外觀的後座與槍口火光衰減（純視覺，不影響任何傷害路徑）
      if (item.recoil > 0) item.recoil = Math.max(0, item.recoil - dt * 5.5);
      if (item.muzzle > 0) item.muzzle = Math.max(0, item.muzzle - dt * 8);

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

    // 追蹤彈的目標死了就換離彈體最近的敵人（鎖定飛彈／幽靈手裏劍／鯊魚魚雷）
    for (const p of this.projectiles) {
      if (!p.homing || p.isDead || (p.target && !p.target.isDead)) continue;
      p.target = this.getClosestEnemy(enemies, p.x, p.y, 600);
    }

    // 重力環鋸／重力奇點環：環鋸運轉期間把附近的敵人往鋸環拉
    this.applyGravity(dt, enemies);

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

    // 覺醒：超武進化後仍可繼續升級（每級 +evoGrowth × 基礎傷害）。
    // 為什麼要這個：超武先前 `level` 永遠停在 1、也不會出現在升級卡裡 ——
    // 四把武器都進化完之後，升級卡就只剩「補血包」這個退路。
    const baseDmg = def.baseDamage
      + (def.damageGrowth ? def.damageGrowth * (item.level - 1) : 0)
      + (def.evoGrowth ? Math.round(def.baseDamage * def.evoGrowth * (item.level - 1)) : 0);
    // 幸運藥劑 (+25% 暴擊率) 與力量藥劑 (+40% 傷害) 在這裡讀計時器。
    // 兩者原本都只被倒數與畫光環，沒有任何傷害路徑讀取 —— 撿到等於沒撿。
    const crit = Math.random() < (this.player.critChance || 0) + (this.player.metaCrit || 0) +
      (this.player.luckPotionTimer > 0 ? 0.25 : 0);
    const critMul = 2 + (this.player.metaCritDmg || 0);
    const potionDmgMul = this.player.atkPotionTimer > 0 ? 1.4 : 1;
    const finalDamage = Math.round(baseDmg * this.player.damageMultiplier * (this.player.traitDmgMul || 1) * potionDmgMul * (crit ? critMul : 1) * (this.player.blessingBerserkerMul || 1));

    // 手持武器外觀：記下這一發瞄準的方向，並補上後座與槍口火光。
    // 方向以「最近的敵人」為準 —— 與各武器實際鎖定的目標一致，玩家看到的槍口
    // 永遠指著它正在打的東西（沒有敵人時維持上一個方向，不會亂轉）。
    const aimTarget = this.getClosestEnemy(enemies);
    if (aimTarget) item.aim = Math.atan2(aimTarget.y - this.player.y, aimTarget.x - this.player.x);
    item.recoil = 1;
    item.muzzle = 1;

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

      case 'boomerang':
      case 'twin_storm':
        this.fireBoomerang(def, item, finalDamage, enemies, crit);
        break;

      case 'railgun':
      case 'annihilation_beam':
        this.fireRailgun(def, item, finalDamage, enemies, particleSystem, crit);
        break;

      case 'soccer':
      case 'quantum_sphere':
        this.fireSoccer(def, item, finalDamage, enemies, crit);
        break;

      case 'frost_nova':
      case 'absolute_zero':
        this.fireFrostNova(def, item, finalDamage, enemies, particleSystem);
        break;

      case 'shotgun':
      case 'dragon_breath':
        this.fireShotgun(def, item, finalDamage, enemies, crit);
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
        // 相位風暴：飛刃從玩家周圍隨機的相位裂隙射出，而不是全部從手上出來
        let ox = this.player.x;
        let oy = this.player.y;
        if (def.riftRadius) {
          const ra = Math.random() * Math.PI * 2;
          ox += Math.cos(ra) * def.riftRadius;
          oy += Math.sin(ra) * def.riftRadius;
        }
        const dx = target.x - ox;
        const dy = target.y - oy;
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
              x: ox,
              y: oy,
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
              homing: def.homing || 0,
              target,
              phaseJump: def.phaseJump || 0,
              phaseJumps: def.phaseJumps || 0,
              afterimage: !!def.phaseJump,
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
    if (def.forceField) {
      this.fireForceField(def, damage, stats, crit);
      return;
    }
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

  // 永恆守護力場：跟著玩家的圓形領域，範圍內每 rehit 秒結算一次傷害，
  // 每 stormEvery 秒放一次向外的擊退風暴。守護輪盤的型態照樣生效：
  // 聖盾（半徑 +30%、消彈）、札格（跳傷更快、+1 刃 → 傷害 +15%）、混沌（飛盤在上面已處理）。
  fireForceField(def, damage, stats, crit) {
    const radius = def.radius * this.player.rangeMultiplier * (stats.radiusMul || 1);
    const dmg = Math.round(damage * (1 + 0.15 * (stats.extraBlades || 0)));
    const rehit = ORBIT_REHIT / (stats.spinSpeedMul || 1);
    let field = this.projectiles.find((p) => p.type === 'force_field' && p.weaponId === def.id && !p.isDead);
    if (!field) {
      field = this.mkProjectile({
        type: 'force_field', weaponId: def.id, x: this.player.x, y: this.player.y,
        damage: dmg, radius, pierce: 9999, life: def.duration, isEvo: true,
        knockback: 1.5, rehit, reflectBullets: !!stats.reflectBullets, followPlayer: true,
      }, crit);
      this.projectiles.push(field);
    }
    field.damage = dmg;
    field.radius = radius;
    field.rehit = rehit;
    field.reflectBullets = !!stats.reflectBullets;

    // 擊退風暴：以遊戲時間倒數（update 扣 _stormCd，暫停時不會偷跑）
    if (this._stormCd <= 0) {
      this._stormCd = def.stormEvery;
      const px = this.player.x;
      const py = this.player.y;
      const enemies = this.game ? this.game.enemies : [];
      for (const e of enemies) {
        if (e.isDead) continue;
        if (Math.hypot(e.x - px, e.y - py) <= radius * 1.35 + e.radius) {
          e.takeDamage(dmg, 9, px, py);
          this.recordDamage(def.id, dmg);
        }
      }
      if (this.game?.particles) {
        this.game.particles.createShockwave(px, py, radius * 1.35, '#ffd166');
      }
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
        // 鎖定飛彈：每一發各自鎖一個目標（第一發鎖主目標，其餘分散索敵），
        // 發射時往外側偏一點，再靠 homing 轉回來 —— 看得出「鎖定、轉彎、追上」
        let lock = i === 0 ? target : this.getRandomEnemy(enemies);
        if (!lock || lock.isDead) lock = this.getClosestEnemy(enemies);
        if (!lock) return;
        const dx = lock.x - this.player.x;
        const dy = lock.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        const spd = def.speed * (stats.speedMul || 1);
        const dmg = Math.round(damage * (stats.damageMul || 1));
        const side = (i % 2 === 0 ? 1 : -1) * (0.35 + Math.random() * 0.35);
        const a = Math.atan2(dy, dx) + side;

        this.projectiles.push(
          this.mkProjectile({
            type: 'rocket',
            weaponId: def.id,
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            damage: dmg,
            radius: stats.projRadius || 10,
            explosionRadius: expRadius,
            pierce: stats.pierce || 1,
            life: 2.5,                     // 追不到就在 2.5 秒後原地引爆
            homing: def.homing || 0,
            target: lock,
            swim: !!def.swim,
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

      // 真的「投擲」：瓶子沿拋物線飛到落點（純視覺、不碰撞），落地摔碎才點燃火海。
      // 先前火海是開火當下直接出現在目標腳下，看不出是丟出去的瓶子。
      const dist = Math.hypot(targetX - this.player.x, targetY - this.player.y);
      const flight = Math.min(0.55, 0.28 + dist / 1400);
      this.projectiles.push(
        this.mkProjectile({
          type: 'bottle', weaponId: def.id, x: this.player.x, y: this.player.y,
          toX: targetX, toY: targetY, flight, arcHeight: 40 + dist * 0.15,
          damage, radius: 6, pierce: 9999, life: flight, isEvo: def.isEvo, noCollide: true,
        }, crit)
      );

      this.schedule(flight, () => this.landMolotov(def, stats, damage, r, targetX, targetY, enemies, crit));
    }
  }

  // 燃燒瓶落地：玻璃碎裂 → 火海（燃油煉獄的火海會沿地面擴散）
  landMolotov(def, stats, damage, r, targetX, targetY, enemies, crit) {
    const ps = this.game?.particles;
    if (ps) {
      ps.createHitSpark(targetX, targetY, '#e9ecef');
      ps.createShockwave(targetX, targetY, r * 0.6, def.isEvo ? '#4cc9f0' : '#ff9f1c');
    }
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
        // 雅典娜型態的 dmgResist 先前**全 repo 沒有讀取端**（宣告了 25% 減傷但完全沒生效），
        // 這裡把值傳進火海實體，站在領域內時由 Player.takeDamage 套用
        sanctuaryResist: stats.dmgResist || 0,
        // 札格型態：火海跳頻 +30% (tickRateMul 0.70) —— 這個欄位先前沒有讀者
        tickInterval: 0.25 * (stats.tickRateMul || 1),
        healPerSec: stats.healPerSec || 0,
        // 燃油煉獄：火海從 spreadFrom 倍擴散到 spreadTo 倍（spreadTime 秒內）
        growFrom: def.spreadFrom || 0,
        growTo: def.spreadTo || 0,
        growTime: def.spreadTime || 0,
      }, crit)
    );
  }

  // 5. 雷電矩陣 / 狂雷星暴
  // 雷電矩陣：落雷打在「不同的」敵人身上，相鄰落點之間拉起電網（3 點以上首尾相接成環），
  //   電網線段上的敵人吃 linkDamageMul 倍的傷害 —— 落點越多，網越密，名字裡的「矩陣」。
  // 狂雷星暴：中心一記巨雷，外圈等距落雷呈星形爆開，中心與每個外圈落點以電光射線相連。
  // 型態（宙斯連鎖／索爾眩暈／混沌牽引）對每一記落雷都照樣生效。
  fireLightning(def, item, damage, enemies, particleSystem, crit = false) {
    const { stats } = this.aspectOf(def.id);
    const strikes = def.isEvo ? def.strikes : def.strikes[item.level - 1];
    const finalDmg = Math.round(damage * (stats.damageMul || 1));
    const blastRadius = 45 * this.player.rangeMultiplier * (stats.radiusMul || 1);
    const linkDmg = Math.round(finalDmg * (def.linkDamageMul || 0.5));

    // 落點：{ enemy?, x, y }。有 enemy 的落點在落雷當下讀它的最新位置
    const nodes = [];
    if (def.starBurst) {
      const center = this.getRandomEnemy(enemies);
      if (!center) return;
      nodes.push({ enemy: center, big: true });
      const n = strikes - 1;
      const rot = Math.random() * Math.PI * 2;
      const R = def.starRadius * this.player.rangeMultiplier;
      for (let i = 0; i < n; i++) {
        const a = rot + (i * Math.PI * 2) / n;
        const x = center.x + Math.cos(a) * R;
        const y = center.y + Math.sin(a) * R;
        // 星芒點附近 110px 內有敵人就吸附過去（形狀仍是星形，但不會整排劈空地）
        const near = this.getClosestEnemy(enemies, x, y, 110);
        nodes.push(near && near !== center ? { enemy: near } : { x, y });
      }
    } else {
      // 從「還沒被劈過」的活敵人裡隨機挑，保證每一記落雷打在不同敵人身上
      const pool = enemies.filter((e) => !e.isDead);
      for (let i = 0; i < strikes && pool.length > 0; i++) {
        const k = Math.floor(Math.random() * pool.length);
        nodes.push({ enemy: pool[k] });
        pool[k] = pool[pool.length - 1];
        pool.pop();
      }
      if (nodes.length === 0) return;
    }

    const posOf = (n) => (n.enemy && !n.enemy.isDead ? { x: n.enemy.x, y: n.enemy.y } : { x: n.x ?? n.enemy.x, y: n.y ?? n.enemy.y });

    const strike = (node) => {
      const pt = posOf(node);
      node.x = pt.x; node.y = pt.y;   // 記住落點，連線用
      const R = node.big ? blastRadius * 1.5 : blastRadius;   // 星暴中心：巨雷範圍較大
      const dmg = finalDmg;
      sound.playLightning();
      if (particleSystem) particleSystem.createLightning(pt.x, pt.y, R, def.isEvo || !!stats.stunDur);
      let anchor = null;
      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        const d = Math.hypot(enemy.x - pt.x, enemy.y - pt.y);
        if (d <= R + enemy.radius) {
          if (!anchor) anchor = enemy;
          enemy.takeDamage(dmg, 2, pt.x, pt.y);
          this.recordDamage(def.id, dmg);
          if (stats.stunDur) enemy.applyStun(stats.stunDur);
          if (particleSystem) particleSystem.createDamageText(enemy.x, enemy.y, dmg, true);
        }
      }
      // 宙斯型態：連鎖電弧（從落點上的敵人起跳）
      const chainFrom = node.enemy && !node.enemy.isDead ? node.enemy : anchor;
      if (stats.chainTargets && chainFrom && this.game?.chainShock) {
        this.game.chainShock(chainFrom, Math.round(dmg * (stats.chainDamageRatio || 0.7)), 'lightning', stats.chainTargets);
      }
      // 混沌型態：電磁脈衝把半徑內的敵人往落點牽引
      if (stats.pullRadius) {
        for (const e of enemies) {
          const ed = Math.hypot(e.x - pt.x, e.y - pt.y);
          if (ed > 10 && ed < stats.pullRadius) {
            e.x += ((pt.x - e.x) / ed) * (stats.pullStrength || 80);
            e.y += ((pt.y - e.y) / ed) * (stats.pullStrength || 80);
          }
        }
      }
    };

    // 兩個落點之間的電網：線段附近（線寬 + 敵人半徑）的敵人吃連線傷害
    const link = (a, b) => {
      if (particleSystem) particleSystem.createArc(a.x, a.y, b.x, b.y, def.isEvo ? '#c77dff' : '#ffe600');
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      const w = def.linkWidth || 18;
      for (const e of enemies) {
        if (e.isDead) continue;
        const t = Math.max(0, Math.min(1, ((e.x - a.x) * vx + (e.y - a.y) * vy) / len2));
        const cx = a.x + vx * t;
        const cy = a.y + vy * t;
        if (Math.hypot(e.x - cx, e.y - cy) <= w + e.radius) {
          e.takeDamage(linkDmg, 0.5, cx, cy);
          this.recordDamage(def.id, linkDmg);
        }
      }
    };

    const gap = def.isEvo ? 0.06 : 0.12;
    nodes.forEach((node, i) => {
      this.schedule(i * gap, () => {
        strike(node);
        if (def.starBurst) {
          if (i > 0) link(nodes[0], node);          // 星芒：中心 → 外圈
        } else if (i > 0) {
          link(nodes[i - 1], node);                   // 電網：前一個落點 → 這一個
          if (i === nodes.length - 1 && nodes.length >= 3) link(node, nodes[0]);   // 收成環
        }
      });
    });
  }

  // 6. 量子足球 / 量子星雲球
  // 迴力鏢：去程 outTime 秒後折返，去回都會切開路徑（靠 rehit 讓同一隻敵人被兩次命中）
  fireBoomerang(def, item, damage, enemies, crit = false) {
    const target = this.getClosestEnemy(enemies);
    if (!target) return;

    const { stats } = this.aspectOf(def.id);
    const lvl = Math.min(item.level, def.maxLevel) - 1;
    const outTime = (def.outTime && def.outTime[lvl]) || 0.38;
    const count = ((def.count && def.count[lvl]) || 1) + (stats.extraProjectiles || 0);
    const pierce = ((def.pierce && def.pierce[lvl]) || 2) + (stats.pierce || 0);
    const speed = def.speed * (stats.speedMul || 1);
    const dmg = Math.round(damage * (stats.damageMul || 1));
    const rehit = (def.rehit || 0.4) * (stats.rehitMul || 1);
    const baseAngle = Math.atan2(target.y - this.player.y, target.x - this.player.x);

    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i - (count - 1) / 2) * 0.22;
      this.projectiles.push(
        this.mkProjectile({
          type: 'boomerang',
          weaponId: def.id,
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          damage: dmg,
          radius: 12,
          pierce,
          life: outTime * 2 + 1.4,   // 保險：就算沒接到也會自己消失
          isEvo: def.isEvo,
          knockback: 2,
          outTime,
          speed0: speed,
          rehit,
          burnOnHit: def.burnOnHit || 0,
        }, crit)
      );
    }
    sound.playShoot('boomerang');
  }

  // 軌道炮：開火當下就結算整條直線的傷害（不是飛行彈體），再補一個純視覺的光束實體
  fireRailgun(def, item, damage, enemies, particleSystem, crit = false) {
    const target = this.getClosestEnemy(enemies);
    if (!target) return;

    const { stats } = this.aspectOf(def.id);
    const lvl = Math.min(item.level, def.maxLevel) - 1;
    const width = ((def.width && def.width[lvl]) || 30) * (stats.widthMul || 1);
    const range = def.range * (stats.rangeMul || 1) * this.player.rangeMultiplier;
    const lanes = (def.laneCount || 1) + (stats.laneCount || 0);
    const dmg = Math.round(damage * (stats.damageMul || 1));
    const baseAngle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    const hit = new Set();

    for (let i = 0; i < lanes; i++) {
      const a = baseAngle + (i - (lanes - 1) / 2) * 0.16;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      // 直線命中：把敵人投影到射線上，長度在射程內、垂直距離在線寬內就算命中
      for (const enemy of enemies) {
        if (enemy.isDead || hit.has(enemy)) continue;
        const rx = enemy.x - this.player.x;
        const ry = enemy.y - this.player.y;
        const along = rx * ox + ry * oy;
        if (along < 0 || along > range) continue;
        const perp = Math.abs(rx * oy - ry * ox);
        if (perp > width / 2 + enemy.radius) continue;

        hit.add(enemy);
        enemy.takeDamage(dmg, 3, this.player.x, this.player.y);
        this.recordDamage(def.id, dmg);
        if (def.burnOnHit || stats.burnOnHit) {
          enemy.applyBurn(def.burnOnHit || stats.burnOnHit, 2.5, def.id);
        }
        if (particleSystem) particleSystem.createDamageText(enemy.x, enemy.y, dmg, true);
      }

      // 視覺光束：不帶傷害，只負責畫出這條射線並淡出
      this.projectiles.push(
        this.mkProjectile({
          type: 'rail_beam',
          weaponId: def.id,
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(a),
          vy: Math.sin(a),
          damage: 0,
          radius: width / 2,
          beamRange: range,
          pierce: 9999,
          life: 0.18,
          isEvo: def.isEvo,
          knockback: 0,
        }, crit)
      );
    }
    sound.playShoot('railgun');
  }

  fireSoccer(def, item, damage, enemies, crit = false) {
    const { id: aspect, stats } = this.aspectOf(def.id);
    const count = def.isEvo ? def.count : def.count[item.level - 1];
    const bounces = def.isEvo ? def.bounces : def.bounces[item.level - 1];
    const rad = 10 * this.player.rangeMultiplier * (stats.radiusMul || 1);

    // 開球：朝敵人踢出去（先前是亂數方向，常常一腳踢向沒有怪的地方）
    const kickAt = this.getClosestEnemy(enemies);
    const aim = kickAt ? Math.atan2(kickAt.y - this.player.y, kickAt.x - this.player.x) : Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      // 第一顆正中目標，其餘左右交錯張開（0, +0.18, -0.18, +0.36…），不會整排都擦邊而過
      const angle = aim + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.18;
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
          // 量子星雲球：命中裂變出子球、拖著能量殘影
          maxSplitGen: def.splitGen || 0,
          afterimage: !!def.splitGen,
        }, crit)
      );
      sound.playShoot('soccer');
    }
  }

  // 冰霜新星：以玩家為中心的瞬發脈衝（跟軌道炮一樣開火當下就結算，沒有飛行彈體）
  fireFrostNova(def, item, damage, enemies, particleSystem) {
    const { stats } = this.aspectOf(def.id);
    const lvl = Math.min(item.level, def.maxLevel) - 1;
    const baseR = Array.isArray(def.radius) ? def.radius[lvl] : def.radius;
    const radius = baseR * this.player.rangeMultiplier * (stats.radiusMul || 1);
    const dmg = Math.round(damage * (stats.damageMul || 1));
    const freezeDur = def.freezeOnHit || stats.freezeDur || 0;
    const px = this.player.x;
    const py = this.player.y;

    if (particleSystem) {
      particleSystem.createShockwave(px, py, radius, def.isEvo ? '#e0fbff' : '#7fd8ff');
    }
    sound.playShoot('frost_nova');

    for (const enemy of enemies) {
      if (enemy.isDead) continue;
      const d = Math.hypot(enemy.x - px, enemy.y - py);
      if (d > radius + enemy.radius) continue;
      // 赫爾型態：已被減速／冰凍／眩暈的目標吃碎冰加成（判定在本次減速之前）
      const brittle = enemy.slowTimer > 0 || enemy.freezeTimer > 0 || enemy.stunTimer > 0;
      const hit = stats.shatterMul && brittle ? Math.round(dmg * stats.shatterMul) : dmg;
      enemy.takeDamage(hit, stats.knockback || 1, px, py);
      this.recordDamage(def.id, hit);
      enemy.applySlow(def.slowDur || 2);
      if (freezeDur) enemy.applyFreeze(freezeDur);
      if (particleSystem) particleSystem.createDamageText(enemy.x, enemy.y, hit, def.isEvo);
    }
  }

  // 霰彈槍：朝最近敵人扇形噴出多顆短射程彈丸（射程 = 彈速 × 壽命）
  fireShotgun(def, item, damage, enemies, crit = false) {
    const target = this.getClosestEnemy(enemies);
    if (!target) return;

    const { stats } = this.aspectOf(def.id);
    const lvl = Math.min(item.level, def.maxLevel) - 1;
    const at = (v) => (Array.isArray(v) ? v[lvl] : v);
    const slug = !!stats.slugShot;   // 阿瑞斯型態：單發獨頭彈
    const count = slug ? 1 : at(def.pellets);
    const spread = def.spread * (stats.spreadMul || 1);
    const range = def.range * (stats.rangeMul || 1) * this.player.rangeMultiplier;
    const dmg = slug ? Math.round(damage * (stats.slugDamageMul || 2.5)) : damage;
    const pierce = slug ? (stats.pierce || 3) : at(def.pierce);
    const baseAngle = Math.atan2(target.y - this.player.y, target.x - this.player.x);

    for (let i = 0; i < count; i++) {
      // 彈丸平均分布在扇形內，再加一點抖動，避免每次都是同一把梳子
      const t = count > 1 ? i / (count - 1) - 0.5 : 0;
      const a = baseAngle + t * spread + (count > 1 ? (Math.random() - 0.5) * 0.08 : 0);
      const speed = def.speed * (0.92 + Math.random() * 0.16);
      this.projectiles.push(
        this.mkProjectile({
          type: 'pellet',
          weaponId: def.id,
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          damage: dmg,
          radius: slug ? 9 : 5,
          pierce,
          life: range / speed,
          isEvo: def.isEvo,
          knockback: slug ? 6 : 4,
          burnOnHit: def.burnOnHit || stats.burnOnHit || 0,
        }, crit)
      );
    }
    sound.playShoot('shotgun');
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
    // 鯊魚核彈：核爆 —— 畫面震動 + 雙層衝擊波（內圈白熱、外圈蕈狀雲邊緣）
    if (rocketProj.swim) {
      if (this.game?.camera) this.game.camera.shake = Math.max(this.game.camera.shake || 0, 14);
      if (particleSystem) {
        particleSystem.createShockwave(rocketProj.x, rocketProj.y, rocketProj.explosionRadius * 0.55, '#ffffff');
        particleSystem.createShockwave(rocketProj.x, rocketProj.y, rocketProj.explosionRadius * 1.15, '#ffe066');
      }
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

  // 重力：以玩家為圓心、鋸環半徑為目標，把 pullRadius 內的雜兵每秒往內拉 pullSpeed。
  // 只拉到鋸環外緣（不會把怪直接塞進玩家身上），Boss 不受影響。
  applyGravity(dt, enemies) {
    this._gravity = null;
    for (const [id, item] of this.weapons) {
      const def = WEAPONS[id];
      if (!def || !def.pullSpeed) continue;
      const saws = this.projectiles.filter((p) => p.weaponId === id && !p.isDead);
      if (saws.length === 0) continue;
      const ring = saws[0].orbitRadius;
      const reach = ring + def.pullRadius * this.player.rangeMultiplier;
      const px = this.player.x;
      const py = this.player.y;
      for (const e of enemies) {
        if (e.isDead || e.isBoss) continue;
        const dx = px - e.x;
        const dy = py - e.y;
        const d = Math.hypot(dx, dy);
        const stop = ring + e.radius * 0.5;
        if (d <= stop || d > reach) continue;
        const step = Math.min(d - stop, def.pullSpeed * dt);
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
      this._gravity = { ring, reach, isEvo: !!def.isEvo };
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

  // 預設以玩家為中心；追蹤彈換目標時改用彈體位置與搜尋半徑
  getClosestEnemy(enemies, fromX = this.player.x, fromY = this.player.y, maxDist = Infinity) {
    let closest = null;
    let minDist = maxDist;
    for (const e of enemies) {
      if (e.isDead) continue; // 本幀剛死、還沒被清除的屍體不鎖定
      const d = Math.hypot(e.x - fromX, e.y - fromY);
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
    // 重力井：鋸環外圍的吸積螺旋（奇點環多一顆黑洞核心）
    const gv = this._gravity;
    if (gv && this.player && !this.player.isDead) {
      const sx = this.player.x - camera.x;
      const sy = this.player.y - camera.y;
      const t = performance.now() * 0.001;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.strokeStyle = gv.isEvo ? 'rgba(255,214,10,0.35)' : 'rgba(199,125,255,0.3)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const r = gv.ring + ((t * 60 + k * (gv.reach - gv.ring) / 3) % (gv.reach - gv.ring));
        // 由外往內收縮的虛線環 = 「被吸進去」
        const rr = gv.reach - (r - gv.ring);
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -t * 40;
        ctx.globalAlpha = 0.25 + 0.6 * (1 - (rr - gv.ring) / (gv.reach - gv.ring));
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (gv.isEvo) {
        // 奇點：暗色吸積盤（比角色大，才不會被角色蓋住）+ 三條往內捲的金色旋臂
        const R = gv.ring * 1.35;
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.85;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        g.addColorStop(0, 'rgba(0,0,0,0.75)');
        g.addColorStop(0.6, 'rgba(30,0,60,0.45)');
        g.addColorStop(1, 'rgba(255,214,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,10,0.7)';
        ctx.lineWidth = 2.5;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          for (let j = 0; j <= 16; j++) {
            const u = j / 16;
            const a = t * 2.4 + k * (Math.PI * 2 / 3) + u * 2.6;   // 越往內轉越多圈
            const r = R * (1 - u * 0.75);
            if (j === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    for (const p of this.projectiles) {
      p.draw(ctx, camera);
    }
  }

  // 手持武器：依 `HELD_MOUNTS` 的掛載點畫在角色身上。
  // main.js 會呼叫兩次（'back' 在 player.draw 之前、'front' 之後），讓背在身上的武器
  // 被角色擋住一部分，四把同時出現時也讀得出各自是什麼。武器欄上限 4。
  drawHeldWeapons(ctx, camera, layer = 'front') {
    const p = this.player;
    if (!p || p.isDead) return;
    const sx = p.x - camera.x;
    const sy = p.y - camera.y;
    const now = performance.now() * 0.001;
    let slot = 0;
    for (const [id, item] of this.weapons.entries()) {
      // slot 一定要跟著所有武器遞增（不能只算這一層），否則前後兩層會被塞到同一個掛載點
      const mount = HELD_MOUNTS[slot] || HELD_MOUNTS[HELD_MOUNTS.length - 1];
      slot++;
      if (mount.layer !== layer) continue;
      drawHeldWeapon(ctx, id, {
        x: sx,
        y: sy,
        aim: item.aim,
        recoil: item.recoil || 0,
        muzzle: item.muzzle || 0,
        level: item.level,
        mount,
        facing: p.facing,
        time: now,
      });
    }
  }
}
