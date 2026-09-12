// 怪物實體類別 (普通殭屍、突襲蝙蝠、生化巨漢、自爆蟲、噴吐者、衝刺獵犬、孵化胞囊、攻城巨像、Boss 暴君)

import { ENEMY_TYPES, ELITE_AFFIXES, CHARGE } from '../config.js';
import { getSprite, blit, FRAMES } from '../sprites.js';

// 狀態光暈烘焙：灼燒/中毒原本每隻每幀都重建一個徑向漸層，再填一個半徑 1.5 倍的
// 加色大圓 —— 後期滿場中燒時這是最貴的一段 (實測 250 隻：開啟 21fps / 關閉 48fps)。
// 改成依半徑烘一次到離屏畫布，之後每幀只剩一次 drawImage；動態明滅改用 globalAlpha
// 調變，色階比例照舊，外觀維持不變。
const GLOW_CACHE = new Map();

// 火星/毒氣泡同樣烘成小 sprite。原本每顆都要組一次 rgba() 字串給 fillStyle (字串解析)
// 再走 beginPath/arc/fill —— 250 隻 × 最多 8 顆 = 每幀兩千次，實測 fill 次數與 fps
// 幾乎完全負相關。顏色只有固定幾種、只有透明度在變，改用 globalAlpha 調變後外觀不變。
const SPARK_COLORS = ['rgb(255, 140, 40)', 'rgb(255, 170, 40)', 'rgb(255, 200, 40)',
                      'rgb(150, 255, 170)'];
const SPARK_R = 16;
const SPARKS = SPARK_COLORS.map((color) => {
  const cv = document.createElement('canvas');
  cv.width = SPARK_R * 2;
  cv.height = SPARK_R * 2;
  const x = cv.getContext('2d');
  x.fillStyle = color;
  x.beginPath();
  x.arc(SPARK_R, SPARK_R, SPARK_R, 0, Math.PI * 2);
  x.fill();
  return cv;
});

// 純色填色的 pattern 快取。
//
// 為什麼：`ctx.fillStyle = 'rgba(0,0,0,0.75)'` 每次指派都會重新解析字串，而小血條
// 是「每隻受傷的怪、每幀」畫一次 —— 效能探針在 250 隻燃燒怪的場景量到每幀 498
// 個色彩字串，其中約 500 個就是這裡來的。改用 1×1 畫布做成的 pattern 物件後，
// 指派的是物件而不是字串，完全不需解析，外觀一模一樣。
const PATTERN_CACHE = new WeakMap();
function solidPattern(ctx, rgba) {
  let per = PATTERN_CACHE.get(ctx);
  if (!per) {
    per = new Map();
    PATTERN_CACHE.set(ctx, per);
  }
  let pat = per.get(rgba);
  if (!pat) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const c = cv.getContext('2d');
    c.fillStyle = rgba;
    c.fillRect(0, 0, 1, 1);
    pat = ctx.createPattern(cv, 'repeat');
    per.set(rgba, pat);
  }
  return pat;
}

// 以中心點與半徑貼上烘好的火星
function blitSpark(ctx, idx, cx, cy, r, alpha) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(SPARKS[idx], cx - r, cy - r, r * 2, r * 2);
}

function statusGlow(kind, radius) {
  const r = Math.round(radius);
  const key = `${kind}${r}`;
  let glow = GLOW_CACHE.get(key);
  if (glow) return glow;

  const rad = r * (kind === 'burn' ? 1.5 : 1.4);
  const size = Math.max(2, Math.ceil(rad * 2));
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(rad, rad, 0, rad, rad, rad);
  if (kind === 'burn') {
    // 烘焙時把 alpha 除以基準值 0.5，繪製時再乘回 globalAlpha，總和與原本一致
    g.addColorStop(0, 'rgba(255, 190, 60, 1)');
    g.addColorStop(0.55, 'rgba(255, 90, 0, 0.56)');
    g.addColorStop(1, 'rgba(180, 30, 0, 0)');
  } else {
    g.addColorStop(0, 'rgba(120, 255, 140, 1)');
    g.addColorStop(1, 'rgba(30, 160, 60, 0)');
  }
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);

  glow = { cv, rad };
  GLOW_CACHE.set(key, glow);
  return glow;
}

export class Enemy {
  // scale: { hp, dmg, speed } — 關卡難度、時間成長與關卡規則合併後的係數
  constructor(typeKey, x, y, scale = {}) {
    const config = ENEMY_TYPES[typeKey] || ENEMY_TYPES.walker;
    this.typeKey = typeKey;
    this.skin = null; // Boss 關卡主題外觀 (生成後由 Spawner 依 def.skin 覆寫)
    this.name = config.name;
    this.maxHp = config.hp * (scale.hp || 1);
    this.hp = this.maxHp;
    this.speed = config.speed * (scale.speed || 1);
    this.damage = Math.round(config.damage * (scale.dmg || 1));
    this.radius = config.radius;
    this.color = config.color;
    this.exp = config.exp;
    this.isBoss = !!config.isBoss;
    // 外觀變異：一般怪隨機套一組烘焙好的尺寸變體，成群時不會看起來都一樣
    // (Boss 用關卡主題 skin，不套尺寸抖動)
    this.spriteVariant = this.isBoss ? 0 : Math.floor(Math.random() * 3);
    this.baseSpriteKey = this.spriteVariant > 0 ? this.typeKey + ':v' + this.spriteVariant : this.typeKey;
    this.explodes = !!config.explodes;
    this.splitInto = config.splitInto || null; // 孢子母體：死亡裂解
    this.splitCount = config.splitCount || 0;

    // ── 行為資料 (config.js 的 ENEMY_TYPES[key].ai) ──────────────
    // 原本 13 種敵人沒有任何一種帶行為資料，分派只有三條分支，其餘全是
    // 「直線逼近」換數字。現在每一種都有自己的 ai.kind 與參數。
    const ai = config.ai || {};
    this.ai = ai;
    this.animSpeed = ai.animSpeed || 8;        // 走動畫速度 (原為全體共用的 8)
    this.kbResist = ai.kbResist || 0;          // 擊退抗性 (重裝單位不會被推著走)
    this.wanderPhase = Math.random() * Math.PI * 2;
    this.orbitDir = Math.random() < 0.5 ? -1 : 1;  // 噴吐者繞行方向逐一隨機
    this.facingX = 0;                          // 面向 (盾衛正面判定、撲擊鎖定)
    this.facingY = 1;
    this.windupTimer = 0;                      // > 0 = 預警中 (可被玩家看見並反應)
    this.windupMax = 0;
    this.windupKind = null;                    // 'lunge' | 'slam' | 'shoot'
    this.windupDir = { x: 0, y: 0 };
    this.lungeTimer = ai.lunge ? Math.random() * ai.lunge.every : 0;
    this.lungeLeft = 0;
    this.lungeDir = { x: 0, y: 0 };
    this.slamTimer = ai.slam ? ai.slam.every * 0.6 : 0;
    this.fuseMax = ai.fuse || 0.8;             // 自爆引信長度 (原為引擎硬寫 0.8)
    this.ranged = config.ranged ? { ...config.ranged } : null; // 遠程噴吐怪
    this.shootTimer = this.ranged ? Math.random() * this.ranged.cd : 0;
    this.hatchMinion = config.hatchMinion || null; // 增殖胞囊：定時孵化雜兵
    this.hatchInterval = config.hatchInterval || 0;
    this.hatchCount = config.hatchCount || 1;
    this.hatchTimer = this.hatchMinion ? this.hatchInterval * (0.6 + Math.random() * 0.4) : 0;

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
    this.slowTimer = 0; // 極寒脈衝減速剩餘秒數 (遊戲時間倒數)
    this.burnTimer = 0; // 蓄能燃燒彈的灼燒剩餘秒數
    this.burnDps = 0;
    this.burnSource = null; // 灼燒傷害要記回原武器 (結算榜)
    this.freezeTimer = 0;   // 冰凍定身剩餘秒數 (Boss 不吃，改吃 slowTimer)
    this.stunTimer = 0;     // 眩暈剩餘秒數 (與冰凍分開，才畫得出不同的視覺)
    this.markTimer = 0;     // 基隆型態的追蹤印記剩餘秒數 (受傷加成)
    this.poisonTimer = 0;   // 中毒剩餘秒數
    this.poisonStacks = 0;  // 中毒層數 (可疊，最多 CHARGE.poison.maxStacks)
    this.poisonSource = null;
    this.isDead = false;
    this.lastDamageTaken = 0;  // 實際扣除的傷害 (供飄字/傷害榜顯示減傷後的數字)

    // Boss 專屬技能冷卻
    if (this.isBoss) {
      this.chargeTimer = 0;
      this.isCharging = false;
      this.chargeDir = { x: 0, y: 0 };
      this.skillTimer = 5;       // 離下一次專屬技能的時間
      this.behaviors = [];       // 由關卡 boss 定義帶入：'summon' / 'nova'
      this._lastSkill = null;    // 上一招 (避免連放同一招)
      this._bossStageSeen = 0;   // 已進入的狂暴階段 (0/1/2)
      this._enrageFlash = 0;     // 進階瞬間的紅光殘餘秒數
    }
  }

  // 賦予精英詞綴 (數值、外觀、受傷乘數一次到位)
  makeElite(affixKey) {
    const a = ELITE_AFFIXES[affixKey];
    if (!a) return;
    this.isElite = true;
    this.affixKey = affixKey;
    this.affixName = a.name;   // 顯示用 (原本只讀 color，玩家只能靠色調猜詞綴)
    this.eliteColor = a.color;
    this.maxHp = Math.round(this.maxHp * (a.hpMul || 1));
    this.hp = this.maxHp;
    this.speed *= a.speedMul || 1;
    this.damage = Math.round(this.damage * (a.damageMul || 1));
    this.radius = Math.round(this.radius * (a.radiusMul || 1));
    this.spriteScale = a.radiusMul || 1; // 巨獸體型跟著放大 (碰撞半徑同步)
    this.damageTakenMul *= a.damageTakenMul || 1;
    this.exp = Math.round(this.exp * (a.expMul || 1));
    if (this.ranged) {
      this.ranged.damage = Math.round(this.ranged.damage * (a.damageMul || 1));
      this.ranged.speed *= a.speedMul || 1;
    }
  }

  // target 是要追擊的對象：生存者模式為玩家，守塔模式的雜兵為基地核心 (兩者都有 x/y)
  // cb: { onExplode, onBossSkill, onShoot, onHatch }，缺的就當作沒有
  update(dt, target, cb = {}) {
    if (this.isDead) return;

    // 極寒減速倒數 (遊戲時間驅動：暫停/升級/開箱時同步凍結)
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);

    if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - dt);

    // 持續傷害：灼燒 (高傷短時、不疊層) 與中毒 (低傷長時、可疊層)
    // 兩者都不擊退、不觸發閃白，否則整片怪會狂閃
    let dot = 0;
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      dot += this.burnDps * dt;
      cb.onBurn?.(this, this.burnDps * dt, this.burnSource);
    }
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      const tick = CHARGE.poison.dps * this.poisonStacks * dt;
      dot += tick;
      cb.onBurn?.(this, tick, this.poisonSource);
      if (this.poisonTimer <= 0) this.poisonStacks = 0;
    }
    if (dot > 0) {
      this.hp -= dot;
      if (this.hp <= 0) {
        this.hp = 0;
        this.isDead = true;
        return;
      }
    }

    if (this.markTimer > 0) this.markTimer -= dt;
    if (this.stunTimer > 0) this.stunTimer = Math.max(0, this.stunTimer - dt);

    this.animTimer += dt * this.animSpeed;   // 走動畫節奏逐種不同，不再全體同步
    if (this.flashTimer > 0) this.flashTimer -= dt;

    // 計算朝向目標的向量 (用 sqrt 而非 Math.hypot：hypot 的溢位保護很貴，
    // 而這是每隻每幀都跑的最熱路徑)
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let moveX = 0;
    let moveY = 0;

    if (this.isBoss) {
      this.updateBoss(dt, dx, dy, dist, cb.onBossSkill);
    } else if (this.ranged) {
      // 遠程怪邏輯：在射程外保持距離開火，太近則後撤；繞行方向逐隻隨機
      const desiredRange = this.ranged.range;
      const spd = this.speed * this.speedFactor();
      const nx = dist > 0.1 ? dx / dist : 0;
      const ny = dist > 0.1 ? dy / dist : 0;
      if (dist > desiredRange) {
        moveX = nx * spd;
        moveY = ny * spd;
      } else if (dist < desiredRange * 0.45) {
        moveX = -nx * spd * 0.6;
        moveY = -ny * spd * 0.6;
      } else {
        moveX = -ny * spd * 0.25 * this.orbitDir;
        moveY = nx * spd * 0.25 * this.orbitDir;
      }
      this.facingX = nx;
      this.facingY = ny;

      // 射擊：先預警再發射 (原版冷卻一到當幀就開火，玩家完全無法預判)
      this.shootTimer += dt;
      if (this.windupTimer > 0 && this.windupKind === 'shoot') {
        this.windupTimer -= dt;
        if (this.windupTimer <= 0) {
          this.windupKind = null;
          this.fireRanged(dist, nx, ny, cb);
        }
      } else if (this.shootTimer >= this.ranged.cd) {
        this.shootTimer = 0;
        if (dist > 0 && dist <= desiredRange * 1.6 && this.freezeTimer <= 0 && this.stunTimer <= 0) {
          this.windupTimer = this.windupMax = this.ai.windup || 0.35;
          this.windupKind = 'shoot';
        }
      }
    } else {
      const m = this.moveMelee(dt, dx, dy, dist, target, cb);
      moveX = m.x;
      moveY = m.y;
    }

    // 自爆蟲邏輯：引信會隨距離增減。
    // 原本只增不減 —— 靠近過一次就永遠是「已武裝」的膨脹狀態，離開也不會解除。
    if (this.explodes) {
      if (dist < 65 && this.freezeTimer <= 0 && this.stunTimer <= 0) {
        this.fuseTimer += dt;
      } else if (this.fuseTimer > 0) {
        this.fuseTimer = Math.max(0, this.fuseTimer - dt * 0.6);
      }
      if (this.fuseTimer >= this.fuseMax) {
        this.isDead = true;
        cb.onExplode?.(this);
      }
    }

    // 增殖胞囊邏輯：定時孵化雜兵 (孵化中的小小吞嚥動畫可從 animTimer 推得)
    if (this.hatchMinion && !this.isDead && this.freezeTimer <= 0 && this.stunTimer <= 0) {
      this.hatchTimer -= dt;
      if (this.hatchTimer <= 0) {
        this.hatchTimer = this.hatchInterval;
        cb.onHatch?.(this);
      }
    }

    // 整合普通移動 + 擊退位移
    this.x += (moveX + this.kbX) * dt;
    this.y += (moveY + this.kbY) * dt;

    // 擊退力道衰減
    this.kbX *= Math.pow(0.05, dt);
    this.kbY *= Math.pow(0.05, dt);
  }

  // 遠程射擊 (從 update 抽出，讓預警與發射分離)
  fireRanged(dist, nx, ny, cb) {
    if (!cb.onShoot || dist <= 0 || dist > this.ranged.range * 1.6) return;
    cb.onShoot(this, {
      x: this.x + nx * (this.radius + 6),
      y: this.y + ny * (this.radius + 6),
      vx: nx * this.ranged.speed,
      vy: ny * this.ranged.speed,
      damage: this.ranged.damage,
      radius: this.ranged.radius,
      color: this.eliteColor || this.ranged.color,
      glow: this.eliteColor || this.ranged.color,
    });
  }

  // 近戰移動：回傳「已乘上速度」的位移向量，由 update 統一積分。
  // 每種 ai.kind 一種轉向模型，並在這裡處理可預警的撲擊與踏地。
  moveMelee(dt, dx, dy, dist, target, cb) {
    const ai = this.ai || {};
    const kind = ai.kind || 'plod';
    const nx = dist > 0.1 ? dx / dist : 0;
    const ny = dist > 0.1 ? dy / dist : 0;
    let speedMul = 1;
    let mx = nx;
    let my = ny;

    // ── 撲擊 (lunge)：狂奔感染者 / 嗜血獵犬 ─────────────────────
    // 舊版是「冷卻一到直接 ×3.2~3.4 速度」，唯一的視覺還畫在爆發之後，玩家零反應窗。
    // 新版拆成 預警(減速、畫出方向扇形) → 鎖定方向突進 → 收尾。
    const lunge = ai.lunge;
    if (lunge) {
      if (this.lungeLeft > 0) {
        this.lungeLeft -= dt;
        this.facingX = this.lungeDir.x;
        this.facingY = this.lungeDir.y;
        const burst = this.speed * this.speedFactor() * lunge.mul;
        return { x: this.lungeDir.x * burst, y: this.lungeDir.y * burst };
      }
      if (this.windupKind === 'lunge') {
        this.windupTimer -= dt;
        this.facingX = this.windupDir.x;
        this.facingY = this.windupDir.y;
        if (this.windupTimer <= 0) {
          this.windupKind = null;
          this.lungeLeft = lunge.dur;
          this.lungeDir = { x: this.windupDir.x, y: this.windupDir.y };
        }
      } else {
        this.lungeTimer += dt;
        if (this.lungeTimer >= lunge.every && dist < 460) {
          this.lungeTimer = 0;
          this.windupTimer = this.windupMax = lunge.windup;
          this.windupKind = 'lunge';
          this.windupDir = { x: nx, y: ny };
        }
      }
    }

    // ── 踏地 (slam)：攻城巨像 ─────────────────────────────────
    const slam = ai.slam;
    if (slam) {
      if (this.windupKind === 'slam') {
        this.windupTimer -= dt;
        speedMul = 0.08;
        if (this.windupTimer <= 0) {
          this.windupKind = null;
          cb.onSlam?.(this, slam);
        }
      } else if (this.lungeLeft <= 0) {
        this.slamTimer += dt;
        if (this.slamTimer >= slam.every && dist < slam.radius * 0.85) {
          this.slamTimer = 0;
          this.windupTimer = this.windupMax = slam.windup;
          this.windupKind = 'slam';
        }
      }
    }

    // 預警中：明顯減速 (玩家看得到「牠要動作了」)
    if (this.windupKind === 'lunge') speedMul = 0.2;
    if (this.windupKind === 'shoot') speedMul = 0.3;

    // ── 轉向模型 ─────────────────────────────────────────────
    if (kind === 'weave') {
      // 狂暴突襲蝠：垂直於接近方向的編織擺動 + 速度忽快忽慢 (難瞄、難預測)
      const w = Math.sin(this.animTimer * (ai.weaveFreq || 3.6) * 0.5 + this.wanderPhase) * ((ai.weaveAmp || 46) / 90);
      mx = nx - ny * w;
      my = ny + nx * w;
      speedMul *= 1 + Math.sin(this.animTimer * (ai.hoverFreq || 2.4)) * (ai.hoverAmp || 0.4);
    } else if (kind === 'shamble') {
      // 喪屍步兵 / 孢子母體：慢速蛇行，成群時像一整片搖晃過來
      const w = Math.sin(this.animTimer * 1.1 + this.wanderPhase) * (ai.wander || 0.3);
      mx = nx - ny * w;
      my = ny + nx * w;
    } else if (kind === 'swarm') {
      // 孢子幼體：瘋狂抖動 + 速度脈動
      const j = ai.jitter || 0.8;
      const s = Math.sin(this.animTimer * 4.2 + this.wanderPhase) * j;
      mx = nx - ny * s;
      my = ny + nx * s;
      speedMul *= 0.9 + (Math.sin(this.animTimer * 6 + this.wanderPhase) * 0.5 + 0.5) * 0.3;
    } else if (kind === 'flank') {
      // 嗜血獵犬：保持在 standoff 半徑上側繞，再發起撲咬 (與狂奔感染者直衝區隔)
      const standoff = ai.standoff || 190;
      const err = Math.max(-1.2, Math.min(1.2, (dist - standoff) / standoff));
      const tang = this.orbitDir;
      mx = nx * err - ny * tang * 0.9;
      my = ny * err + nx * tang * 0.9;
    } else if (kind === 'rooted') {
      speedMul *= 0.5;   // 增殖胞囊幾乎不移動
    }
    // plod / shield / kite / suicide 走直進，差別在數值與抗性

    const ml = Math.sqrt(mx * mx + my * my);
    if (ml > 0.0001) {
      mx /= ml;
      my /= ml;
    }

    // 接觸距離內不再往內擠：怪會「圍住」目標而不是全部疊在目標身上。
    // 沒有這一條，分離力永遠打不贏逼近速度 (實測 96 隻怪：推力 30px/s 對上
    // 逼近 90~175px/s，坍塌比例只從 14.1% 降到 13.9%)，因為所有怪的目標
    // 都是同一個點。改成只保留切線分量後，怪群自然圍成一圈。
    const contactD = this.radius + (target && target.radius ? target.radius : 0);
    if (dist < contactD * 1.08 && dist > 0.001) {
      const radial = mx * nx + my * ny;      // 朝目標的分量
      if (radial > 0) {
        mx -= nx * radial;                   // 扣掉朝內分量，只留切線
        my -= ny * radial;
        const sl = Math.sqrt(mx * mx + my * my);
        if (sl > 0.0001) {
          mx /= sl;
          my /= sl;
        } else {
          mx = -ny;                          // 完全正對時改為繞行
          my = nx;
        }
      }
    }

    this.facingX = mx;
    this.facingY = my;
    if (this.windupKind === 'lunge') {
      // 預警時面向已鎖定的撲擊方向，不是當前朝向
      this.facingX = this.windupDir.x;
      this.facingY = this.windupDir.y;
    }
    const spd = this.speed * this.speedFactor() * speedMul;
    return { x: mx * spd, y: my * spd };
  }

  // 極寒脈衝減速：回傳當幀速度倍率 (0.5 = 半速；slowTimer 由遊戲時間倒數，暫停即凍結)
  speedFactor() {
    if (this.freezeTimer > 0 || this.stunTimer > 0) return 0; // 定身/眩暈 (擊退位移不受影響)
    return this.slowTimer > 0 ? 0.5 : 1;
  }

  // Boss 狂暴階段：血量過半、剩四分之一各進一階。技能更密、衝鋒更頻、移動更快。
  // 原本 Boss 從頭到尾行為一致，玩家火力後期成長後只剩「站著磨」，收尾毫無張力。
  bossStage() {
    const r = this.hp / this.maxHp;
    if (r <= 0.25) return 2;
    if (r <= 0.5) return 1;
    return 0;
  }

  updateBoss(dt, dx, dy, dist, onBossSkill = null) {
    const stage = this.bossStage();
    if (stage > this._bossStageSeen) {
      this._bossStageSeen = stage;
      this._enrageFlash = 1.0;          // 進階瞬間的視覺提示
      this.skillTimer = Math.min(this.skillTimer, 0.6);  // 立刻接一招
    }
    if (this._enrageFlash > 0) this._enrageFlash -= dt;

    const rage = 1 + stage * 0.35;      // 階段 0/1/2 → 1.0 / 1.35 / 1.7
    this.chargeTimer += dt * rage;

    // 每 5 秒發動一次極速衝鋒 (狂暴後更頻繁)
    if (!this.isCharging && this.chargeTimer >= 5.0) {
      this.isCharging = true;
      this.chargeTimer = 0;
      if (dist > 0) {
        this.chargeDir = { x: dx / dist, y: dy / dist };
      }
    }

    if (this.isCharging) {
      this.x += this.chargeDir.x * this.speed * this.speedFactor() * 3.2 * rage * dt;
      this.y += this.chargeDir.y * this.speed * this.speedFactor() * 3.2 * rage * dt;
      if (this.chargeTimer >= 1.2) {
        this.isCharging = false;
        this.chargeTimer = 0;
      }
    } else {
      if (dist > 0.1) {
        this.x += (dx / dist) * this.speed * this.speedFactor() * rage * dt;
        this.y += (dy / dist) * this.speed * this.speedFactor() * rage * dt;
      }
    }

    // 關卡專屬技能定時施放：summon 召喚小怪 / nova 範圍震波
    if (this.skillTimer > 0) {
      this.skillTimer -= dt;
      if (this.skillTimer <= 0 && this.behaviors && this.behaviors.length > 0) {
        this.skillTimer = (8 + Math.random() * 3) / rage;
        // 不連續重複同一招：兩招的 Boss 原本可能連放四次同一招
        let act = this.behaviors[Math.floor(Math.random() * this.behaviors.length)];
        if (this.behaviors.length > 1 && act === this._lastSkill) {
          const other = this.behaviors.filter((b) => b !== act);
          act = other[Math.floor(Math.random() * other.length)];
        }
        this._lastSkill = act;
        if (onBossSkill) onBossSkill(this, act);
      }
    }
  }

  // 灼燒：時間刷新而非疊層，避免多發蓄能彈把雜兵瞬間燒穿
  applyBurn(dps, duration, weaponId = null) {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTimer = Math.max(this.burnTimer, duration);
    this.burnSource = weaponId || this.burnSource;
  }

  // 冰凍：雜兵完全定住；Boss 免疫硬控，改吃等長的減速
  applyFreeze(duration) {
    if (this.isBoss) {
      this.slowTimer = Math.max(this.slowTimer, duration * CHARGE.freeze.bossSlow);
      return;
    }
    this.freezeTimer = Math.max(this.freezeTimer, duration);
  }

  // 眩暈：與冰凍共用「定身」機制但用獨立欄位，才畫得出不同的視覺
  // (原本兩者都寫 freezeTimer，閃電眩暈的敵人是顯示成冰晶的)
  applyStun(duration) {
    if (this.isBoss) {
      this.slowTimer = Math.max(this.slowTimer, duration * 0.5);
      return;
    }
    this.stunTimer = Math.max(this.stunTimer, duration);
  }

  // 標記 (基隆型態)：被標記的目標受到額外傷害 (加成值由型態資料帶入)
  applyMark(duration, bonus = 0.25) {
    this.markTimer = Math.max(this.markTimer, duration);
    this.markBonus = bonus;
  }

  // 減速
  applySlow(duration) {
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  // 中毒：疊層 (上限 maxStacks)，每次命中都把持續時間刷滿
  applyPoison(duration, weaponId = null) {
    this.poisonStacks = Math.min(CHARGE.poison.maxStacks, this.poisonStacks + 1);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
    this.poisonSource = weaponId || this.poisonSource;
  }

  takeDamage(amount, knockbackDist = 0, sourceX = 0, sourceY = 0) {
    // 方向性防禦：防暴盾衛的「正面大盾」只看來襲方向 vs 面向。
    // 原本是一顆不分方向的 damageTakenMul: 0.55 —— README 寫的「正面」在程式裡
    // 根本不存在，從背後打也減傷 45%，於是「繞背」這個戰術完全不成立。
    let mul = this.damageTakenMul || 1;
    const ai = this.ai || {};
    if (ai.kind === 'shield' && !this.isBoss) {
      const kdx = sourceX - this.x;
      const kdy = sourceY - this.y;
      const kd = Math.sqrt(kdx * kdx + kdy * kdy);
      if (kd > 0.001) {
        const dot = (kdx / kd) * this.facingX + (kdy / kd) * this.facingY;
        // dot > cos(arc/2) = 命中來自正面 → 吃盾牌減傷；否則完整傷害
        if (dot > Math.cos((ai.shieldArc || 1.6) / 2)) mul *= ai.shieldMul != null ? ai.shieldMul : 0.45;
      }
    }
    // 標記中的目標受到額外傷害 (基隆型態；倍率來自 stats.markDamageBonus)
    if (this.markTimer > 0) mul *= 1 + (this.markBonus != null ? this.markBonus : 0.25);

    // 減傷；至少造成 1 點，避免高血量時永遠打不動
    const applied = Math.max(1, Math.round(amount * mul));
    this.hp -= applied;
    this.lastDamageTaken = applied;
    this.flashTimer = 0.08; // 閃白效果

    // 施加擊退 (重裝單位有抗性，不會被推著走)
    if (knockbackDist > 0 && !this.isBoss) {
      const kdx = this.x - sourceX;
      const kdy = this.y - sourceY;
      const kdist = Math.sqrt(kdx * kdx + kdy * kdy);
      if (kdist > 0) {
        const kb = knockbackDist * 12 * (1 - this.kbResist);
        this.kbX += (kdx / kdist) * kb;
        this.kbY += (kdy / kdist) * kb;
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
    return this.isDead;
  }

  // sprite 變體：Boss 用關卡主題 skin (一般/衝鋒/最終)，雜兵用尺寸抖動
  get spriteKey() {
    if (this.explodes && this.fuseTimer > 0) return 'boomer_armed';
    if (this.isBoss) {
      const base = this.skin || 'boss';
      return this.isCharging ? base + '_charging' : base;
    }
    // 靜態鍵在建構子就算好：原本每幀重建字串 (250 隻就是每幀 250 次串接)
    return this.baseSpriteKey;
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

    // 預警前搖 (撲擊方向扇形 / 踏地範圍圈 / 射擊瞄準線)
    if (this.windupKind) this.drawWindup(ctx, screenX, screenY);

    // 非滿血且非 Boss 時顯示小血條 (Boss 有頂部專屬 HUD)
    if (!this.isBoss && this.hp < this.maxHp) {
      ctx.save();
      ctx.translate(screenX, screenY);
      this.drawMiniHpBar(ctx);
      ctx.restore();
    }

    // Boss 進入狂暴階段的瞬間紅環，讓玩家知道「它變兇了」而不是莫名其妙被打死
    if (this._enrageFlash > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.globalAlpha = Math.min(1, this._enrageFlash);
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * (1.3 + (1 - this._enrageFlash) * 1.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // 灼燒中：加色疊上橘紅火光 + 竄升火星 (加色混合才不會被深色 sprite 吃掉)
    if (this.burnTimer > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.globalCompositeOperation = 'lighter';
      const f = this.animTimer * 6;
      const glow = statusGlow('burn', this.radius);
      ctx.globalAlpha = 0.5 + Math.sin(f) * 0.15;
      ctx.drawImage(glow.cv, -glow.rad, this.radius * 0.3 - glow.rad);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        const p = ((f * 0.12 + i * 0.33) % 1);
        blitSpark(ctx, i,
          Math.sin(f * 0.7 + i * 2.1) * this.radius * 0.6,
          this.radius * 0.3 - p * this.radius * 2,
          this.radius * 0.14 * (1 - p * 0.5), (1 - p) * 0.9);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 冰凍中：冰藍結晶包覆 + 外圈實線
    if (this.freezeTimer > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.fillStyle = 'rgba(140, 220, 255, 0.32)';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 245, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r1 = this.radius + 2;
        const r2 = this.radius + 9;
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a + 0.35) * r2, Math.sin(a + 0.35) * r2);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 眩暈中：黃色電弧 (與冰凍的冰晶區隔開來，玩家才分得出「定身」與「麻痺」)
    if (this.stunTimer > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      const t = this.animTimer * 9;
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = t + (i / 3) * Math.PI * 2;
        const r1 = this.radius * 0.4;
        const r2 = this.radius + 7;
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a + 0.5) * r2 * 0.7, Math.sin(a + 0.5) * r2 * 0.7);
        ctx.lineTo(Math.cos(a + 0.9) * r2, Math.sin(a + 0.9) * r2);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 中毒中：綠色毒霧氣泡，層數越多越濃
    if (this.poisonTimer > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.globalCompositeOperation = 'lighter';
      const density = this.poisonStacks / 5;
      const glow = statusGlow('poison', this.radius);
      ctx.globalAlpha = 0.2 + density * 0.3;
      ctx.drawImage(glow.cv, -glow.rad, -glow.rad);
      ctx.globalAlpha = 1;
      for (let i = 0; i < this.poisonStacks; i++) {
        const p = ((this.animTimer * 0.35 + i * 0.27) % 1);
        blitSpark(ctx, 3,
          Math.sin(this.animTimer * 1.4 + i * 2.4) * this.radius * 0.7,
          this.radius * 0.3 - p * this.radius * 1.8,
          this.radius * 0.11, (1 - p) * 0.85);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 被極寒塔減速中：冰藍虛線光圈提示
    if (this.slowTimer > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.strokeStyle = 'rgba(127, 216, 255, 0.8)';
      ctx.globalAlpha = 0.45 + Math.sin(this.animTimer * 5) * 0.2;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 精英光環 (呼吸燈標示詞綴怪) + 詞綴名稱
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
      // 詞綴名稱：疾風/裝甲/巨獸/劇毒 —— 精英是「哪一種」比「是精英」更重要
      if (this.affixName) {
        ctx.globalAlpha = 0.9;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        const ty = -this.radius - (this.hp < this.maxHp ? 18 : 10);
        ctx.fillText(this.affixName, 0, ty + 1);
        ctx.fillStyle = this.eliteColor;
        ctx.fillText(this.affixName, 0, ty);
      }
      ctx.restore();
    }

    // Boss 專屬技能前搖警示 (Soulstone 風格：旋轉虛線外環 + 內縮實圈 + 角標輻條)
    if (this.isBoss && this.behaviors && this.behaviors.length > 0 &&
        this.skillTimer > 0 && this.skillTimer < 1.5) {
      const warn = 1 - this.skillTimer / 1.5; // 0→1 越接近施放
      const R = this.radius * 7 * (1 - warn * 0.28);
      ctx.save();
      ctx.translate(screenX, screenY);

      // 內縮實圈 (主警示)
      ctx.strokeStyle = '#ff3860';
      ctx.globalAlpha = 0.35 + warn * 0.55;
      ctx.lineWidth = 3 + warn * 2;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();

      // 旋轉虛線外環 (方向感)
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -this.animTimer * 24;
      ctx.strokeStyle = '#ff0055';
      ctx.globalAlpha = 0.4 + warn * 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 12 支輻條角標 (越接近越明顯)
      ctx.globalAlpha = 0.2 + warn * 0.5;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff3860';
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + this.animTimer * 0.15;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ctx.moveTo(ca * (R + 18), sa * (R + 18));
        ctx.lineTo(ca * (R + 24 + warn * 6), sa * (R + 24 + warn * 6));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // 預警前搖的視覺：三種動作三種形狀，而且畫在「動作之前」。
  // 這是敵人可讀性的核心 —— 玩家必須能預判，撲擊才閃得掉、踏地才躲得開。
  drawWindup(ctx, screenX, screenY) {
    const prog = this.windupMax > 0 ? Math.max(0, Math.min(1, 1 - this.windupTimer / this.windupMax)) : 0.5;
    ctx.save();
    ctx.translate(screenX, screenY);

    if (this.windupKind === 'lunge') {
      // 撲擊：朝鎖定方向張開的扇形 (角度與長度隨預警進度收斂)
      const R = 190 - prog * 40;
      const half = 0.5 - prog * 0.16;
      const base = Math.atan2(this.windupDir.y, this.windupDir.x);
      ctx.globalAlpha = 0.14 + prog * 0.3;
      ctx.fillStyle = '#ff3860';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, base - half, base + half);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.5 + prog * 0.5;
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2 + prog * 2;
      ctx.beginPath();
      ctx.arc(0, 0, R, base - half, base + half);
      ctx.stroke();
      // 中央指向線
      ctx.globalAlpha = 0.35 + prog * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(base) * this.radius, Math.sin(base) * this.radius);
      ctx.lineTo(Math.cos(base) * R, Math.sin(base) * R);
      ctx.stroke();
    } else if (this.windupKind === 'slam') {
      // 踏地：範圍圈由大收縮到定值，圈內填色越來越實
      const target = (this.ai.slam && this.ai.slam.radius) || 130;
      const R = target * (1.35 - prog * 0.35);
      ctx.globalAlpha = 0.10 + prog * 0.22;
      ctx.fillStyle = '#ff9500';
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.45 + prog * 0.5;
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = 3 + prog * 2;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + this.animTimer * 0.4;
        ctx.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      }
      ctx.stroke();
    } else if (this.windupKind === 'shoot') {
      // 射擊：細瞄準線 + 槍口亮點
      ctx.globalAlpha = 0.25 + prog * 0.5;
      ctx.strokeStyle = this.eliteColor || this.ranged.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(this.facingX * (this.radius + 4), this.facingY * (this.radius + 4));
      ctx.lineTo(this.facingX * this.ranged.range, this.facingY * this.ranged.range);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = this.eliteColor || this.ranged.color;
      ctx.beginPath();
      ctx.arc(this.facingX * (this.radius + 6), this.facingY * (this.radius + 6), 2.5 + prog * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMiniHpBar(ctx) {
    const barW = this.radius * 1.6;
    const barH = 3;
    const barX = -barW / 2;
    const barY = -this.radius - 8;

    ctx.fillStyle = solidPattern(ctx, 'rgba(0,0,0,0.75)');
    ctx.beginPath();
    ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 2.5);
    ctx.fill();

    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = solidPattern(ctx, '#ff3366');
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(0, barW * pct), barH, 1.5);
    ctx.fill();
  }
}
