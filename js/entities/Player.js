// 特工鴨 (Player) 實體類別 - 包含精緻特工裝扮繪製、屬性與成長邏輯

import { GAME_CONFIG, worldBounds } from '../config.js';
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
    this.basePickupRadius = 130;   // 90 → 130：原本得一直繞路去撿水晶，是操作上最持續的摩擦

    // 角色特質提供的基礎值 (被動重算時會回歸到這組數字，而非寫死的 1.0)
    this.baseSpeedMul = 1.0;
    this.baseMagnet = 1.0;
    this.damageTakenMul = 1.0;
    // 承受傷害拆兩層（見 WeaponManager.applyPassives）：
    //   baseDamageTaken   —— 角色特質 × 每日詞綴 × 關卡／難度規則
    //   blessingDamageRisk —— 增傷祝福的風險懲罰乘數（可重算，不會被升級沖掉）
    this.baseDamageTaken = undefined;   // undefined = 還沒進局，不覆寫角色特質的初值
    this.blessingDamageRisk = 1;
    this.critChance = 0;
    this.overloadTimer = 0;

    // 被動加成倍率 (升級被動時更新)
    this.damageMultiplier = 1.0;
    // 角色特質的即時傷害倍率（例如脈衝喵喵超載期間 +25%）。
    // 與 damageMultiplier 分開：那個由被動重算覆寫，這個由角色的 tick 逐幀維護。
    this.traitDmgMul = 1.0;
    // 局外天賦＋裝備的加成（由 Game.applyMetaTalents 一次寫入，applyPassives 每次重讀）。
    // 為什麼要獨立成一個物件：這些數字必須「可重算」而不是「累加」——
    // 每次升級都會跑一次 applyPassives，累加式的寫法會讓裝備加成在升級時被疊第二次
    // 或被重置掉（兩者都真的發生過）。
    this.meta = { dmg: 0, hp: 0, speed: 0, magnet: 0, gold: 0, cdr: 0, crit: 0, critdmg: 0, armor: 0, exp: 0 };
    this.runMuls = { speed: 1, magnet: 1 };  // 單局加成（興奮劑／每日詞綴），乘法語意
    this.charBaseSpeedMul = 1.0;  // 角色特質的基礎移速（不含局外裝備）
    this.charBaseMagnet = 1.0;    // 角色特質的基礎磁力
    this.charMaxHp = 100;         // 角色特質的基礎生命上限（不含裝備與局內被動）
    this.gearHp = 0;              // 裝備提供的生命上限
    this.metaDmg = 0; // 局外天賦「火力核心」＋裝備的常駐傷害加成 (applyPassives 重置時要加回去)
    this.metaCdr = 0; // 局外裝備的冷卻縮減 (0~1)，在被動算完之後再乘上去
    // 局內加成層（祝福、興奮劑）。為什麼要獨立於 metaCrit / metaExp 這些「總和」欄位：
    // 總和每次 applyPassives 都會被重算成「永久層 + 局內層」，直接寫進總和會在升級時
    // 被歸零（祝福等於沒選到）。這裡放的是「局內那一份」，只增不減、每局開始清空。
    this.blessing = { crit: 0, critDmg: 0, exp: 0 };
    this.metaCrit = 0;     // 局外裝備的暴擊率 (0~1)
    this.metaCritDmg = 0;  // 局外裝備的暴擊傷害加值 (2 之外的額外倍率)
    this.metaArmor = 0;    // 局外裝備的減傷 (0~1，乘在 damageTakenMul 之後)
    this.metaExp = 0;      // 局外裝備的經驗加成 (0~1)
    this.modeDmgMul = 1;   // 模式的武器輸出倍率 (js/modes.js 的 weaponMul)
    this.speedMultiplier = 1.0;
    this.cdrMultiplier = 1.0; // 冷卻縮減 (例如 0.84 代表 CD 變成 84%)
    this.rangeMultiplier = 1.0;
    this.magnetMultiplier = 1.0;
    this.hpRegen = 0;
    this.shield = 0;
    this.maxShield = 0;
    this.bonusPierce = 0;

    // 狀態
    this.facing = 1; // 1: 右, -1: 左
    this.invulnerableTimer = 0;
    this.walkCycle = 0;
    this.isDead = false;
    this.regenTimer = 0;

    // 冰面滑行慣性 (地形機制 'ice')：iceFriction > 0 時操控改為加速度模型
    this.velocity = { x: 0, y: 0 };
    this.iceFriction = 0;

    // 戰術閃避翻滾 (Dash)
    this.dashCooldown = 3.8;
    this.dashMaxTimer = this.dashCooldown; // 含 CDR 後的本輪實際冷卻 (UI 覆蓋層比例用)
    this.dashTimer = 0;
    // 角色特質對翻滾冷卻的乘數（007 鴨鴨移動中縮短）
    this.dashCooldownMul = 1.0;
    this.dashDuration = 0.22;
    this.dashTimeLeft = 0;
    this.dashDir = { x: 0, y: 0 };
    this.dashGhosts = [];

    // 戰術口袋 (惡魔城風格消費道具)
    // 兩格，各放一種道具 { id, count } (同款堆疊上限 POCKET_STACK)；空格為 null。
    // 用完不往前補位：E 永遠是第 1 格、F 永遠是第 2 格
    this.pockets = [null, null];
    this.atkPotionTimer = 0;
    this.shieldPotionTimer = 0;
    this.luckPotionTimer = 0;
    // 雅典娜聖光結界用「計時器」而不是布林旗標：原本只在踩進池子時設 true，
    // 全 repo 沒有任何地方設回 false —— 踩過一次整局受傷 -25%，而且跨局殘留。
    this.sanctuaryTimer = 0;
    this.nemesisCritTimer = 0;
    this.achillesSpeedTimer = 0;
    this.achillesSpeedStacks = 0;

    // 武器型態配置 (Hades Aspects)
    this.weaponAspects = {
      kunai: 'zagreus',
      rocket: 'hestia',
      molotov: 'zagreus',
      lightning: 'zeus',
      guardian: 'zagreus',
      soccer: 'achilles',
    };

    // 套用角色專屬特質的初始值。
    // 角色 init 會直接改 baseSpeedMul / baseMagnet / maxHp（例如企鵝 130、兔兔 1.25），
    // 這裡把它們存成「角色基礎值」——applyPassives 之後每次都用這組基準重算，
    // 局外裝備與單局興奮劑才不會被重算覆蓋掉，也不會被疊第二次。
    this.character.init?.(this);
    this.charBaseSpeedMul = this.baseSpeedMul;
    this.charBaseMagnet = this.baseMagnet;
    this.charMaxHp = this.maxHp;
    // 被動(防彈護甲)重算生命上限的基準：角色 init 若抬高 maxHp (企鵝 130) 要留在這裡
    this.baseMaxHp = this.maxHp;
    this.speedMultiplier = this.baseSpeedMul;
    this.magnetMultiplier = this.baseMagnet;
  }

  get pickupRadius() {
    return this.basePickupRadius * this.magnetMultiplier;
  }

  get speed() {
    const achillesBonus = 1 + (this.achillesSpeedStacks || 0) * 0.06;
    // terrainSpeedMul：焦油泥沼減速／疾風帶加速，由 Hazards.js 每幀寫入
    return this.baseSpeed * this.speedMultiplier * achillesBonus * (this.terrainSpeedMul || 1);
  }

  // 觸發戰術閃避翻滾
  dash(inputVector) {
    if (this.dashTimer > 0 || this.dashTimeLeft > 0 || this.isDead) return false;

    // 依當前移動方向翻滾，無輸入則依面向
    const dirX = inputVector.x;
    const dirY = inputVector.y;
    const len = Math.hypot(dirX, dirY);
    if (len > 0.1) {
      this.dashDir = { x: dirX / len, y: dirY / len };
    } else {
      this.dashDir = { x: this.facing, y: 0 };
    }

    this.dashTimeLeft = this.dashDuration;
    // 局外 CDR 可微幅減免翻滾冷卻，至多 -30%；幽靈步伐祝福可進一步降低 40%
    const cdrMod = Math.max(0.4, (1 - (this.metaCdr || 0) * 0.5) * (this.blessingDashCdr || 1));
    this.dashMaxTimer = this.dashCooldown * cdrMod * (this.dashCooldownMul || 1);
    this.dashTimer = this.dashCooldown * cdrMod * (this.dashCooldownMul || 1);
    this.invulnerableTimer = Math.max(this.invulnerableTimer, this.dashDuration + 0.1);

    // 武器型態：涅墨西斯裁決 (翻滾後 3.5 秒內苦無必暴)
    if (this.weaponAspects?.kunai === 'nemesis') {
      this.nemesisCritTimer = 3.5;
    }

    sound.playDash();
    return true;
  }

  update(dt, inputVector) {
    if (this.isDead) return;

    // 閃避冷卻計時
    if (this.dashTimer > 0) this.dashTimer -= dt;

    // 藥劑與型態 Buff 計時
    if (this.atkPotionTimer > 0) this.atkPotionTimer -= dt;
    if (this.shieldPotionTimer > 0) this.shieldPotionTimer -= dt;
    if (this.luckPotionTimer > 0) this.luckPotionTimer -= dt;
    // 聖光結界：站在池子裡時每幀被刷新 (來源見 Projectile 的 fire_pool)
    if (this.sanctuaryTimer > 0) this.sanctuaryTimer -= dt;
    if (this.nemesisCritTimer > 0) this.nemesisCritTimer -= dt;
    if (this.achillesSpeedTimer > 0) {
      this.achillesSpeedTimer -= dt;
      if (this.achillesSpeedTimer <= 0) this.achillesSpeedStacks = 0;
    }

    // 翻滾狀態 vs 普通移動
    if (this.dashTimeLeft > 0) {
      this.dashTimeLeft -= dt;
      const dashSpeed = this.speed * 3.6 * (this.blessingDashDist || 1);
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
      if (this.iceFriction > 0) {
        // 冰面慣性：向目標速度漸進 (lerp 0.12)，鬆手後速度指數衰減
        const tx = inputVector.x * this.speed;
        const ty = inputVector.y * this.speed;
        this.velocity.x += (tx - this.velocity.x) * 0.12;
        this.velocity.y += (ty - this.velocity.y) * 0.12;
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
      } else {
        this.x += inputVector.x * this.speed * dt;
        this.y += inputVector.y * this.speed * dt;
      }

      if (inputVector.x > 0.1) this.facing = 1;
      else if (inputVector.x < -0.1) this.facing = -1;

      this.walkCycle += dt * 14;
    } else {
      if (this.iceFriction > 0 && (Math.abs(this.velocity.x) > 1 || Math.abs(this.velocity.y) > 1)) {
        // 冰面：鬆手時速度指數衰減
        this.velocity.x *= this.iceFriction;
        this.velocity.y *= this.iceFriction;
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
        this.walkCycle += dt * 8;
      } else {
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.walkCycle = 0;
      }
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
    const bounds = worldBounds();   // 無限地圖時 ±Infinity，不夾
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

  takeDamage(amount, source = '未知來源') {
    if (this.invulnerableTimer > 0 || this.isDead) return false;

    let dmg = Math.round(amount * this.damageTakenMul * (1 - (this.metaArmor || 0)));
    // 惡魔城防禦藥劑：受傷減半
    if (this.shieldPotionTimer > 0) {
      dmg = Math.round(dmg * 0.5);
    }
    // 雅典娜聖光結界：領域減傷。值由型態資料 (WEAPON_ASPECTS.molotov[athena].dmgResist) 帶進火海，
    // 站在領域內時寫到 player.sanctuaryResist —— 先前這裡寫死 0.75，型態欄位改了完全不會生效
    // （實測 dmgResist 在 js/ 的讀取次數是 0）。保留 0.25 當退路，讓沒有帶欄位的舊火海維持原行為。
    if (this.sanctuaryTimer > 0) {
      dmg = Math.round(dmg * (1 - (this.sanctuaryResist || 0.25)));
    }
    if (this.shield && this.shield > 0) {
      if (this.shield >= dmg) {
        this.shield -= dmg;
        dmg = 0;
      } else {
        dmg -= this.shield;
        this.shield = 0;
      }
    }
    this.hp -= dmg;
    if (this.game && dmg > 0) {
      this.game._damageTaken = (this.game._damageTaken || 0) + dmg;
      // 死亡結算用：最後一擊與各來源累計，讓「莫名其妙死掉」變成可學習的回饋
      this.game._lastHit = { source, dmg };
      const by = (this.game._dmgBySource ||= {});
      by[source] = (by[source] || 0) + dmg;
    }
    this.invulnerableTimer = 0.5; // 0.5 秒無敵時間
    sound.playHurt();

    if (this.hp <= 0) {
      if (this.blessingDeathSave) {
        this.blessingDeathSave = false;
        this.hp = 1;
        this.invulnerableTimer = 3.0; // 3 秒無敵時間
        sound.playEvoFanfare();
        if (this.game?.ui) this.game.ui.say('🌈 虹光護佑觸發！以 1 HP 存活！', '#00f59b', 3);
        return true;
      }
      // 緊急復甦天賦（每局一次）：Lv1 回 50%、Lv2 回滿並由遊戲層震退周圍
      if (this.revivesLeft > 0) {
        this.revivesLeft--;
        this.hp = Math.round(this.maxHp * (this.reviveFull ? 1 : 0.5));
        this.invulnerableTimer = 3.0;
        sound.playEvoFanfare();
        this.game?.onPlayerRevive?.(this.reviveFull);
        return true;
      }
      this.hp = 0;
      this.isDead = true;
    }
    return true;
  }

  heal(amount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  // 回傳這次升了「幾級」。一口氣灌進大量經驗 (磁鐵吸全場) 時會一次跨好幾級，
  // 只回傳布林的話呼叫端無從得知，升級卡就會少發。
  gainExp(amount) {
    this.exp += amount;
    let levels = 0;

    while (this.exp >= this.nextExp) {
      this.exp -= this.nextExp;
      this.level++;
      this.nextExp = Math.floor(this.nextExp * GAME_CONFIG.EXP_GROWTH_FACTOR);
      levels++;
    }

    return levels;
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

    // 戰術藥劑與型態 Buff 視覺環
    const now = Date.now() * 0.003;
    if (this.shieldPotionTimer > 0) {
      ctx.strokeStyle = '#4cc9f0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 28 + Math.sin(now * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.atkPotionTimer > 0) {
      ctx.strokeStyle = '#ff7b00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 24 + Math.cos(now * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.nemesisCritTimer > 0) {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 無敵時間閃爍
    if (this.invulnerableTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
      this.drawHpBar(ctx, screenX, screenY);
      return;
    }

    const sprite = getSprite(this.character.sprite);
    const moving = this.walkCycle > 0;
    const frame = moving
      ? Math.floor(this.walkCycle / (Math.PI * 2) * FRAMES) % FRAMES
      : 0;

    // 走路壓縮伸展 + 上下起伏：先前角色是「整張圖平移」，看起來像貼紙在滑動。
    // 抬腿那半拍拉長、落地那半拍壓扁，並讓身體跟著步伐上下 1.8px —— 碰撞半徑
    // 完全不變，只有繪製時的縮放（純視覺）。
    const stride = moving ? Math.sin(this.walkCycle) : 0;
    const bob = moving ? Math.abs(Math.cos(this.walkCycle)) : 0;
    // 站著不動時給一點極慢的呼吸，避免角色像被暫停
    const breath = moving ? 0 : Math.sin(now * 1.6) * 0.012;
    const scaleY = 1 + stride * 0.045 + breath;
    const scaleX = 1 - stride * 0.035 - breath;

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
    ctx.translate(screenX, screenY - bob * 1.8);
    if (this.facing < 0) ctx.scale(-1, 1);
    ctx.scale(scaleX, scaleY);
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

    // 若有高能納米護盾，在血條上方繪製藍光護盾條
    if (this.shield > 0) {
      const shieldPct = Math.min(1, this.shield / (this.maxShield || 100));
      const sBarY = barY - 6;
      ctx.fillStyle = 'rgba(6, 10, 18, 0.7)';
      ctx.fillRect(barX - 1, sBarY - 1, barW + 2, 4);
      ctx.shadowColor = '#00d2ff';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#00d2ff';
      ctx.fillRect(barX, sBarY, barW * shieldPct, 3);
    }
    ctx.restore();
  }
}
