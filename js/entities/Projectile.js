// 武器投射物與攻擊實體 (苦無、旋轉輪盤、火箭爆破、地面积火、落雷、彈跳足球)

import { GAME_CONFIG, CHARGE, worldBounds } from '../config.js';
import { drawGlow, drawStreak } from '../weapons/ProjectileFX.js';

// ── 飛行光暈與拖尾 ─────────────────────────────────────────────────
// 為什麼要這張表：投射物先前只有「本體」，高速彈體在深色場景裡是一顆顆小點，
// 看不出速度、也看不出屬性。這裡給每個 type 一組外觀參數：
//   color  光暈主色（跟武器配色一致，讓玩家用顏色分辨這是誰的子彈）
//   glow   光暈半徑倍率（× radius，0 = 不畫；加色混合的成本與「面積」成正比，
//          所以大體積的東西（火海）不給光暈 —— 它自己的火焰漸層就是光源）
//   trail  拖尾長度係數（× 速度，0 = 這型不畫拖尾）
// 貼圖由 ProjectileFX 快取，每發每幀只多兩次 drawImage。
const FX = {
  kunai:     { color: '#cfe8ff', glow: 1.9, trail: 0.072 },
  merc:      { color: '#b5e48c', glow: 1.6, trail: 0.05 },
  guardian:  { color: '#4cc9f0', glow: 1.6, trail: 0 },
  saw:       { color: '#ffd166', glow: 1.4, trail: 0.04 },
  drill:     { color: '#ffb703', glow: 1.5, trail: 0.045 },
  rocket:    { color: '#ff7b00', glow: 2.1, trail: 0.075 },
  fire_pool: { color: '#ff7b00', glow: 0, trail: 0 },
  soccer:    { color: '#00e5ff', glow: 1.7, trail: 0.045 },
  boomerang: { color: '#ffd166', glow: 1.6, trail: 0.035 },
  rail_beam: { color: '#7df8ff', glow: 2.2, trail: 0 },
  pellet:    { color: '#ffb347', glow: 1.7, trail: 0.03 },
  shuriken:  { color: '#b98cff', glow: 1.9, trail: 0.05 },
  bottle:    { color: '#ffb703', glow: 1.2, trail: 0 },
  force_field: { color: '#ffd166', glow: 0, trail: 0 },
};
const FX_DEFAULT = { color: '#ffffff', glow: 1.8, trail: 0.05 };
// 拖尾只在「真的在飛」時畫：環繞刀刃與地面积火是慢速/靜止實體
const TRAIL_MIN_SPEED = 140;
const TRAIL_MAX_LEN = 78;   // 上限，避免超高速彈體拉出一條貫穿畫面的長條

// '#rrggbb' → 'r,g,b' (給 rgba() 字串用)
function hexToRgbStr(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// ── 火海/蓄能彈的漸層快取 ──────────────────────────────────────────
// CanvasGradient 的座標是在「填色當下的 CTM」下解讀的，所以一顆從 (0,0) 到 (0,±1)
// 的單位漸層，配上 translate/scale 就能重現任意半徑、任意高度的漸層。
// 原本每根火舌、每灘火、每發蓄能彈每幀各建一顆漸層（後期 6 灘 × 6~11 根 ≈ 每幀近百顆），
// 每顆還附帶 3~4 次 rgba() 模板字串解析；改成共用單位漸層後，這些全部只發生一次。
//
// 漸層的裝置座標綁在「建立它的 ctx」上，跨畫布共用會畫錯 —— 所以快取依 ctx 分開放。
const UNIT_GRADS = new WeakMap();

function gradCache(ctx) {
  let m = UNIT_GRADS.get(ctx);
  if (!m) {
    m = new Map();
    UNIT_GRADS.set(ctx, m);
  }
  return m;
}

function unitLinearGrad(ctx, key, stops) {
  const cache = gradCache(ctx);
  let g = cache.get('L' + key);
  if (g) return g;
  g = ctx.createLinearGradient(0, 0, 0, -1);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  cache.set('L' + key, g);
  return g;
}

function unitRadialGrad(ctx, key, inner, stops) {
  const cache = gradCache(ctx);
  let g = cache.get('R' + key);
  if (g) return g;
  g = ctx.createRadialGradient(0, 0, inner, 0, 0, 1);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  cache.set('R' + key, g);
  return g;
}

// 火海配色：色停字串在建表時就組好 (只有兩套配色)，畫的時候一個字串都不用建
function makeFlamePalette(key, hot, mid, cool, ember) {
  return {
    key,
    ember: `rgb(${ember})`,   // 火星改用固定色 + globalAlpha 調變，不再每顆組 rgba()
    poolStops: [[0, `rgba(${hot}, 0.55)`], [0.45, `rgba(${mid}, 0.38)`], [1, `rgba(${cool}, 0)`]],
    tongueStops: [[0, `rgba(${hot}, 0.95)`], [0.3, `rgba(${mid}, 0.62)`],
                  [0.62, `rgba(${cool}, 0.16)`], [1, `rgba(${cool}, 0)`]],
    coreStops: [[0, `rgba(${hot}, 0.9)`], [1, `rgba(${mid}, 0)`]],
  };
}
const FLAME_NORMAL = makeFlamePalette('n', '255,248,210', '255,145,25', '190,25,0', '255,160,60');
const FLAME_EVO = makeFlamePalette('e', '245,252,255', '70,170,255', '80,30,220', '150,215,255');

// 蓄能彈外圈光暈：顏色只跟 charge 種類有關，同樣只烘一顆單位徑向漸層
function chargeGlowGrad(ctx, charge) {
  const cache = gradCache(ctx);
  let g = cache.get('C' + charge);
  if (g) return g;
  const cDef = CHARGE[charge];
  const glow = (cDef && cDef.color) ? hexToRgbStr(cDef.color) : '255,255,255';
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${glow}, 0.75)`);
  g.addColorStop(0.5, `rgba(${glow}, 0.3)`);
  g.addColorStop(1, `rgba(${glow}, 0)`);
  cache.set('C' + charge, g);
  return g;
}

export class Projectile {
  constructor(options) {
    this.type = options.type || 'bullet';
    this.weaponId = options.weaponId || 'kunai';
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.damage = options.damage || 10;
    this.radius = options.radius || 6;
    this.knockback = options.knockback || 2;
    this.pierce = options.pierce || 1; // 穿透次數
    this.life = options.life || 3.0; // 存活時間
    this.isDead = false;

    // 專屬屬性
    this.isEvo = !!options.isEvo;
    this.isCrit = false; // 由 WeaponManager 依當次射擊是否暴擊標記
    this.hitEnemies = new Set(); // 避免同一次碰撞連續重複傷害

    // 旋轉護盾專屬
    this.orbitAngle = options.orbitAngle || 0;
    this.orbitRadius = options.orbitRadius || 70;
    this.spinSpeed = options.spinSpeed || 3.5;

    // 持續傷害節奏：火海預設每 0.25 秒跳一次 (型態可縮短，例如札格燃燒瓶 ×0.70)，
    // 環繞刀刃/彈跳球用 rehit 決定多久能再打同一隻
    this.tickTimer = 0;
    this.tickInterval = options.tickInterval || 0.25;
    this.healPerSec = options.healPerSec || 0;
    this.rehit = options.rehit || 0;
    this.charge = options.charge || null; // 蓄能彈：'burn' / 'chain'
    this.seed = Math.random() * 100; // 火焰舌動畫相位，讓每灘火各燒各的

    // 迴力鏢：outTime 秒去程、之後折返（回程會被玩家「接住」而消失）
    this.outTime = options.outTime || 0;
    this.outTimer = 0;
    this.speed0 = options.speed0 || Math.abs(this.vx) + Math.abs(this.vy);
    this.spin = 0;
    this.burnOnHit = options.burnOnHit || 0;
    this.sanctuaryResist = options.sanctuaryResist || 0;   // 雅典娜型態的領域減傷（由型態資料決定）
    // 軌道炮的視覺光束
    this.beamRange = options.beamRange || 0;

    // 火箭專屬
    this.explosionRadius = options.explosionRadius || 80;
    this.hasExploded = false;

    // 足球專屬
    this.bounces = options.bounces || 6;

    // 傭兵專屬 (擊殺升級 credit)
    this.mercOwner = options.mercOwner || null;

    // 武器型態專屬 (Hades Aspects)
    this.aspect = options.aspect || null;
    this.markOnHit = !!options.markOnHit;
    this.markDur = options.markDur || 5;
    this.markBonus = options.markBonus || 0.25;
    this.reflectBullets = !!options.reflectBullets;
    this.isSanctuary = !!options.isSanctuary;
    this.freezeDur = options.freezeDur || 0;      // 關羽型態的冰凍秒數 (覆寫 CHARGE 預設)
    this.thanatosBounces = options.thanatosBounces || 0;
    this.bounceGrowth = options.bounceGrowth || 0;
    this.implosionAt = options.implosionAt || 0;
    this.implosionRadius = options.implosionRadius || 0;
    this.implosionDamage = options.implosionDamage || 0;
    this.lavaDuration = options.lavaDuration || 0;
    this.lavaRadius = options.lavaRadius || 0;
    this.lavaDamageMul = options.lavaDamageMul || 0;

    // ── 依名稱重新設計的武器行為 ──
    // 追蹤：homing = 每秒最大轉向（弧度），target 由 WeaponManager 維護（目標死了就換最近的）
    this.homing = options.homing || 0;
    this.target = options.target || null;
    // 鯊魚核彈：魚雷左右擺尾前進（純視覺偏移，不影響命中判定的中心）
    this.swim = !!options.swim;
    // 純視覺實體：不參與碰撞（燃燒瓶飛行中的瓶子）
    this.noCollide = !!options.noCollide;
    // 相位飛刃：命中後相位跳躍到下一個敵人
    this.phaseJump = options.phaseJump || 0;
    this.phaseJumps = options.phaseJumps || 0;   // 還能跳幾次
    // 量子星雲球：命中裂變（世代上限，避免無限分裂）
    this.splitGen = options.splitGen || 0;
    this.maxSplitGen = options.maxSplitGen || 0;
    // 殘影：記錄最近幾個位置（量子星雲球／相位飛刃）
    this.afterimage = !!options.afterimage;
    this.trailPts = [];
    // 燃燒瓶：拋物線飛行（起點、終點、滯空秒數、弧高）
    this.fromX = this.x; this.fromY = this.y;
    this.toX = options.toX ?? this.x; this.toY = options.toY ?? this.y;
    this.flight = options.flight || 0;
    this.arcHeight = options.arcHeight || 0;
    this.age = 0;
    // 燃油煉獄：火海隨時間擴散（半徑從 growFrom 倍長到 growTo 倍）
    this.baseRadius = this.radius;
    this.growFrom = options.growFrom || 0;
    this.growTo = options.growTo || 0;
    this.growTime = options.growTime || 0;
    // 永恆守護力場：跟著玩家的領域
    this.followPlayer = !!options.followPlayer;
  }

  // 朝 target 轉向（每秒最多 homing 弧度），速度大小不變
  steer(dt) {
    const t = this.target;
    if (!this.homing || !t || t.isDead) return;
    const want = Math.atan2(t.y - this.y, t.x - this.x);
    const cur = Math.atan2(this.vy, this.vx);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = this.homing * dt;
    const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
    const sp = Math.hypot(this.vx, this.vy);
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
  }

  update(dt, player, onExplosion = null) {
    if (this.isDead) return;
    this.life -= dt;
    if (this.life <= 0) {
      if (this.type === 'rocket' && !this.hasExploded && onExplosion) {
        onExplosion(this);
      }
      this.isDead = true;
      return;
    }

    this.age += dt;
    this.steer(dt);
    if (this.afterimage) {
      this.trailPts.push(this.x, this.y);
      if (this.trailPts.length > 12) this.trailPts.splice(0, 2);
    }

    switch (this.type) {
      case 'kunai':
      case 'merc':
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        break;

      case 'shuriken':
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.spin += dt * 22;
        break;

      case 'bottle': {
        // 拋物線：水平等速從起點到落點，垂直加一段 sin 弧（畫面上的「往上拋」）
        const k = Math.min(1, this.age / (this.flight || 0.4));
        this.x = this.fromX + (this.toX - this.fromX) * k;
        this.y = this.fromY + (this.toY - this.fromY) * k;
        this.lift = Math.sin(Math.PI * k) * this.arcHeight;
        this.spin += dt * 14;
        break;
      }

      case 'force_field':
        if (player) { this.x = player.x; this.y = player.y; }
        this.spin += dt * 0.8;
        this.tickRehit(dt);
        break;

      case 'guardian':
      case 'saw':
        // 環繞玩家旋轉
        this.orbitAngle += this.spinSpeed * dt;
        this.x = player.x + Math.cos(this.orbitAngle) * this.orbitRadius;
        this.y = player.y + Math.sin(this.orbitAngle) * this.orbitRadius;
        this.tickRehit(dt);
        break;

      case 'boomerang': {
        // 去程：等速直線；回程：朝玩家加速（有速度上限），貼近玩家就被接住
        this.outTimer += dt;
        this.spin += dt * 18;
        if (this.outTimer < this.outTime) {
          this.x += this.vx * dt;
          this.y += this.vy * dt;
        } else if (player) {
          const dx = player.x - this.x;
          const dy = player.y - this.y;
          const d = Math.hypot(dx, dy) || 1;
          const acc = (this.speed0 || 520) * 2.4;
          this.vx += (dx / d) * acc * dt;
          this.vy += (dy / d) * acc * dt;
          const sp = Math.hypot(this.vx, this.vy);
          const maxSp = (this.speed0 || 520) * 1.7;
          if (sp > maxSp) {
            this.vx = (this.vx / sp) * maxSp;
            this.vy = (this.vy / sp) * maxSp;
          }
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          if (d < 26) this.isDead = true;
        } else {
          this.x += this.vx * dt;
          this.y += this.vy * dt;
        }
        // 去回各能命中一次同一隻敵人（rehit 秒後清空命中清單）
        this.tickRehit(dt);
        break;
      }

      case 'rail_beam':
        // 純視覺：傷害在開火當下就結算完了，這裡只讓它隨 life 淡出
        break;

      case 'rocket':
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.spin += dt;
        // 鎖定飛彈：碰到目標就引爆（不再只在壽命結束的落點爆）
        if (this.target && !this.target.isDead && onExplosion) {
          const rr = this.radius + this.target.radius;
          const dx = this.target.x - this.x;
          const dy = this.target.y - this.y;
          if (dx * dx + dy * dy <= rr * rr) {
            onExplosion(this);
            this.isDead = true;
          }
        }
        break;

      case 'fire_pool':
        // 燃油煉獄：火海沿地面擴散
        if (this.growTime > 0) {
          const k = Math.min(1, this.age / this.growTime);
          this.radius = this.baseRadius * (this.growFrom + (this.growTo - this.growFrom) * k);
        }
        // 地面積火固定在原處，定時跳傷害
        this.tickTimer += dt;
        if (this.isSanctuary && player) {
          if (Math.hypot(player.x - this.x, player.y - this.y) <= this.radius) {
            player.sanctuaryTimer = 0.2;   // 站在池內每幀刷新；離開後自動失效
            player.sanctuaryResist = this.sanctuaryResist;   // 減傷值來自型態資料，不是寫死的 0.75
            if (this.tickTimer >= this.tickInterval && this.healPerSec > 0) {
              // 治療量由型態資料決定 (healPerSec 8 ÷ 每秒跳幾次)，不是硬寫的 2
              player.heal(this.healPerSec * this.tickInterval);
            }
          }
        }
        if (this.tickTimer >= this.tickInterval) {
          this.tickTimer = 0;
          this.hitEnemies.clear(); // 每跳重置命中清單，允許持續灼燒
        }
        break;

      case 'soccer':
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.tickRehit(dt); // 不重置的話，一顆球對同一隻怪一輩子只能打一次，彈跳次數等於白給

        // 螢幕邊界反彈：先前只撞世界邊界（±2000px），球等於一路飛出畫面不再回來。
        // 改用「以玩家為中心的視野框」，球會在畫面裡來回彈（世界邊界仍是最外層保險）
        const bounds = worldBounds();
        const hw = player ? (window.innerWidth || 1280) / 2 - this.radius : Infinity;
        const hh = player ? (window.innerHeight || 720) / 2 - this.radius : Infinity;
        const minX = Math.max(bounds.minX, player ? player.x - hw : -Infinity);
        const maxX = Math.min(bounds.maxX, player ? player.x + hw : Infinity);
        const minY = Math.max(bounds.minY, player ? player.y - hh : -Infinity);
        const maxY = Math.min(bounds.maxY, player ? player.y + hh : Infinity);
        if ((this.x < minX && this.vx < 0) || (this.x > maxX && this.vx > 0)) {
          this.vx *= -1;
          this.bounces--;
        }
        if ((this.y < minY && this.vy < 0) || (this.y > maxY && this.vy > 0)) {
          this.vy *= -1;
          this.bounces--;
        }
        if (this.bounces <= 0) {
          this.isDead = true;
        }
        break;

      default:
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        break;
    }
  }

  // 每 rehit 秒清空命中清單，讓同一隻敵人能被重複命中 (rehit 為 0 則維持只打一次)
  tickRehit(dt) {
    if (this.rehit <= 0) return;
    this.tickTimer += dt;
    if (this.tickTimer >= this.rehit) {
      this.tickTimer = 0;
      this.hitEnemies.clear();
    }
  }

  draw(ctx, camera) {
    if (this.isDead) return;

    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 視野優化
    if (screenX < -150 || screenX > window.innerWidth + 150 ||
        screenY < -150 || screenY > window.innerHeight + 150) {
      return;
    }

    // 殘影：在本體之前畫（世界座標 → 螢幕座標），越舊越淡
    if (this.afterimage && this.trailPts.length >= 4) {
      const n = this.trailPts.length / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.type === 'soccer' ? '#00f59b' : '#c77dff';
      for (let i = 0; i < n - 1; i++) {
        ctx.globalAlpha = 0.08 + 0.3 * (i / n);
        ctx.beginPath();
        ctx.arc(this.trailPts[i * 2] - camera.x, this.trailPts[i * 2 + 1] - camera.y,
          this.radius * (0.5 + 0.5 * i / n), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(screenX, screenY);

    // 飛行光暈與速度拖尾：先畫，讓本體疊在最上層（光暈/拖尾都在本體之下）
    const fx = FX[this.type] || FX_DEFAULT;
    const speed = Math.abs(this.vx) + Math.abs(this.vy);
    if (fx.trail > 0 && speed > TRAIL_MIN_SPEED) {
      const len = Math.min(TRAIL_MAX_LEN, speed * fx.trail);
      drawStreak(ctx, this.isEvo ? '#ffffff' : fx.color, len,
        Math.max(3, this.radius * 1.5), Math.atan2(this.vy, this.vx),
        this.isEvo ? 0.72 : 0.5);
    }
    if (fx.glow > 0) drawGlow(ctx, fx.color, this.radius * fx.glow, this.isEvo ? 0.5 : 0.34);

    // 蓄能彈：外圈套一層元素光暈，讓玩家看得出這發不一樣
    if (this.charge) {
      // 顏色改讀 config.js 的 CHARGE 表 (burn/freeze/poison 三個 color 先前沒有任何讀者)
      const pulse = 1 + Math.sin(this.life * 6 + this.seed) * 0.15;
      const R = this.radius * 2.6 * pulse;
      // 單位徑向漸層 + 縮放：換來的是每發每幀不再建漸層、不再組 3 個 rgba() 字串
      const base = ctx.getTransform();
      ctx.transform(R, 0, 0, R, 0, 0);
      ctx.fillStyle = chargeGlowGrad(ctx, this.charge);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.setTransform(base);
    }

    switch (this.type) {
      case 'kunai':
        this.drawKunai(ctx);
        break;

      case 'merc':
        this.drawMerc(ctx);
        break;

      case 'guardian':
        this.drawGuardian(ctx);
        break;

      case 'saw':
        this.drawSaw(ctx);
        break;

      case 'drill':
        this.drawDrill(ctx);
        break;

      case 'rocket':
        this.drawRocket(ctx);
        break;

      case 'fire_pool':
        this.drawFirePool(ctx);
        break;

      case 'soccer':
        this.drawSoccer(ctx);
        break;

      case 'boomerang':
        this.drawBoomerang(ctx);
        break;

      case 'rail_beam':
        this.drawRailBeam(ctx);
        break;

      case 'pellet':
        this.drawPellet(ctx);
        break;

      case 'shuriken':
        this.drawShuriken(ctx);
        break;

      case 'bottle':
        this.drawBottle(ctx);
        break;

      case 'force_field':
        this.drawForceField(ctx);
        break;

      default:
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
  }

  // 幽靈手裏劍：半透明、旋轉的四角星（外圈淡紫幽光）
  drawShuriken(ctx) {
    const r = this.radius * 1.8;
    ctx.rotate(this.spin);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#e0d4ff';
    ctx.shadowColor = '#b98cff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? r : r * 0.32;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2b1d4a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  // 燃燒瓶：沿拋物線旋轉飛行的玻璃瓶，地面有落點預告圈與影子
  drawBottle(ctx) {
    const lift = this.lift || 0;
    const k = Math.min(1, this.age / (this.flight || 0.4));
    // 落點預告（隨飛行進度收縮）與瓶子影子
    ctx.save();
    ctx.translate(this.toX - this.x, this.toY - this.y);
    ctx.strokeStyle = this.isEvo ? 'rgba(80,160,255,0.55)' : 'rgba(255,140,40,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 10 + 26 * (1 - k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, -lift);
    ctx.rotate(this.spin);
    ctx.fillStyle = this.isEvo ? '#4cc9f0' : '#7cb518';
    ctx.beginPath();
    ctx.roundRect(-4, -6, 8, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(-1.6, -11, 3.2, 5);
    // 瓶口的火布
    ctx.fillStyle = this.isEvo ? '#90e0ff' : '#ffb703';
    ctx.beginPath();
    ctx.arc(0, -12, 2.6 + Math.sin(this.spin * 3) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 永恆守護力場：金色光罩 + 旋轉的六角符文環
  drawForceField(ctx) {
    const r = this.radius;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
    g.addColorStop(0, 'rgba(255,209,102,0)');
    g.addColorStop(0.8, 'rgba(255,209,102,0.10)');
    g.addColorStop(1, 'rgba(255,230,140,0.35)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,102,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(this.spin);
    ctx.strokeStyle = 'rgba(255,224,102,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.lineTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
    }
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.fillStyle = 'rgba(255,240,180,0.9)';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 霰彈彈丸：拉長的熾熱彈頭（超武龍息是橘紅火球）
  drawPellet(ctx) {
    ctx.rotate(Math.atan2(this.vy, this.vx));
    const r = this.radius;
    ctx.fillStyle = this.isEvo ? '#ff5722' : '#ffb347';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.6, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.isEvo ? '#ffe066' : '#fff3c4';
    ctx.beginPath();
    ctx.arc(r * 0.4, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // 傭兵能量彈 (金色曳光)
  drawMerc(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.ellipse(4, 0, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(-1, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawKunai(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);

    if (this.isEvo) {
      // 幽靈手裏劍 (藍色發光飛刀)
      ctx.fillStyle = '#00f5ff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = '#e2e8f0';
    }

    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();

    // 苦無握柄
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
  }

  drawGuardian(ctx) {
    ctx.rotate(this.orbitAngle * 4);

    if (this.isEvo) {
      // 永恆守護力場 (金光炫目光盾)
      ctx.fillStyle = '#ffb703';
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = '#00e5ff';
      ctx.shadowColor = '#00b4d8';
      ctx.shadowBlur = 6;
    }

    // 圓形鋒利轉輪
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 外圈鋸齒旋轉刀刃
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * this.radius, Math.sin(a) * this.radius);
      ctx.lineTo(Math.cos(a) * (this.radius + 6), Math.sin(a) * (this.radius + 6));
      ctx.stroke();
    }
  }

  // 相位飛刃 (旋轉鑽刃)
  drawDrill(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);

    if (this.isEvo) {
      ctx.fillStyle = '#b5179e';
      ctx.shadowColor = '#e0aaff';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = '#7fb2a5';
      ctx.shadowColor = '#4a7c3f';
      ctx.shadowBlur = 4;
    }
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(9, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 重力環鋸 (紫色旋轉鋸輪)
  drawSaw(ctx) {
    ctx.rotate(this.orbitAngle * 5);

    if (this.isEvo) {
      // 重力奇點環 (金色)
      ctx.fillStyle = '#ffd60a';
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = '#9d4edd';
      ctx.shadowColor = '#c77dff';
      ctx.shadowBlur = 6;
    }

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 外圈鋸齒刀刃
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * this.radius, Math.sin(a) * this.radius);
      ctx.lineTo(Math.cos(a) * (this.radius + 5), Math.sin(a) * (this.radius + 5));
      ctx.stroke();
    }
  }

  // 鯊魚核彈：擺尾的鯊魚魚雷（背鰭、尾鰭、眼睛、核彈警示紋）
  drawShark(ctx) {
    const wag = Math.sin(this.age * 16) * 0.35;
    ctx.translate(0, Math.sin(this.age * 8) * 3);
    ctx.shadowColor = '#4cc9f0';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#5c7c99';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 尾鰭（擺動）
    ctx.save();
    ctx.translate(-18, 0);
    ctx.rotate(wag);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11, -9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-11, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 背鰭
    ctx.fillStyle = '#3d5a73';
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(-10, -15);
    ctx.lineTo(-10, -5);
    ctx.closePath();
    ctx.fill();
    // 肚子與眼睛
    ctx.fillStyle = '#dbe7f0';
    ctx.beginPath();
    ctx.ellipse(4, 3.5, 13, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(12, -2.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // 核彈警示環
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -7.5);
    ctx.lineTo(-6, 7.5);
    ctx.stroke();
  }

  drawRocket(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);
    if (this.swim) {
      this.drawShark(ctx);
      return;
    }

    if (this.isEvo) {
      // 鯊魚核彈
      ctx.fillStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 14;
    } else {
      ctx.fillStyle = '#ff9900';
    }

    // 彈頭
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -6);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();

    // 噴射火焰
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-18, -3);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-18, 3);
    ctx.closePath();
    ctx.fill();
  }

  drawFirePool(ctx) {
    const r = this.radius;

    // 雅典娜聖光結界：金色神聖領域
    if (this.isSanctuary) {
      ctx.save();
      const pool = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
      pool.addColorStop(0, 'rgba(255, 230, 110, 0.45)');
      pool.addColorStop(0.65, 'rgba(255, 190, 40, 0.22)');
      pool.addColorStop(1, 'rgba(255, 180, 0, 0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `${Math.round(r * 0.45)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✨', 0, 0);
      ctx.restore();
      return;
    }

    const t = Date.now() * 0.003 + this.seed;
    // 藍色煉獄與一般火海只差色溫。火焰的三個關鍵：根部最亮、火舌會歪、舌尖要透明
    const pal = this.isEvo ? FLAME_EVO : FLAME_NORMAL;
    // 後面所有填色都靠 CTM 擺位，先記住原點 (translate 到池心)，畫完再還原
    const base = ctx.getTransform();

    // 1. 地上的燃燒油漬 (壓扁橢圓)，火要有附著的地面
    //    單位圓 + scale(r, r*0.4) 完全等價於 scale(1,0.4) + arc(r)，但漸層可以共用
    ctx.transform(r, 0, 0, r * 0.4, 0, 0);
    ctx.fillStyle = unitRadialGrad(ctx, pal.key + 'pool', 0.1, pal.poolStops);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();

    // 2. 火舌：一根根獨立竄動、互相交疊。每根都會左右擺 (lean)，
    //    漸層從根部的亮白熱一路透明到舌尖 —— 反過來畫就會變成水晶柱。
    //    火舌路徑寫在「以舌根為原點、高度為 1」的正規化座標，用 transform 擺回去，
    //    這樣那顆根部→舌尖的線性漸層也能所有火舌共用一顆（原本每根一顆）。
    ctx.globalCompositeOperation = 'lighter';
    const tongueGrad = unitLinearGrad(ctx, pal.key + 'tongue', pal.tongueStops);
    ctx.fillStyle = tongueGrad;   // 迴圈內不再動 fillStyle/save/restore
    const N = Math.max(6, Math.min(11, Math.round(r / 14))); // 大灘火 = 更多更細的火舌，不會變成粗積木
    for (let i = 0; i < N; i++) {
      const seed = i * 2.399;
      const u = (i + 0.5) / N;                                  // 0..1 橫向位置
      const bx = (u * 2 - 1) * r * 0.78;
      const by = Math.sin(u * Math.PI) * -r * 0.06;             // 中間的舌根稍高
      const env = 0.45 + 0.55 * Math.sin(u * Math.PI);          // 中間高、兩側矮
      const h = r * env * (1.15 + 0.4 * Math.sin(t * 2.6 + seed));
      const w = (r / N) * 1.5 * (0.75 + 0.25 * Math.sin(t * 3.7 + seed));
      const lean = Math.sin(t * 1.9 + seed) * r * 0.22;         // 火舌歪斜

      ctx.setTransform(base);
      ctx.transform(1, 0, 0, h, bx, by);   // (u,v) → (bx+u, by+h*v)
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.bezierCurveTo(-w, -0.5, lean - w * 0.22, -0.85, lean, -1);
      ctx.bezierCurveTo(lean + w * 0.22, -0.85, w, -0.5, w, 0);
      ctx.quadraticCurveTo(0, (w * 0.5) / h, -w, 0);   // 舌根下緣的 y 要用 h 換算回正規化座標
      ctx.fill();
    }

    // 3. 根部的高溫白熱帶 (壓扁)，把所有火舌的根連成一條燒紅的線
    ctx.setTransform(base);
    const coreR = r * 0.85;
    ctx.transform(coreR, 0, 0, coreR * 0.3, 0, 0);
    ctx.fillStyle = unitRadialGrad(ctx, pal.key + 'core', 0, pal.coreStops);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();

    // 4. 竄升的火星：固定色 + globalAlpha（= 原本 rgba(色, a) 的等價寫法，兩者相乘）
    ctx.setTransform(base);
    const ga = ctx.globalAlpha;
    ctx.fillStyle = pal.ember;
    for (let i = 0; i < 5; i++) {
      const p = (t * 0.35 + i * 0.2) % 1;
      const ex = Math.sin(t * 1.3 + i * 2.1) * r * 0.55;
      ctx.globalAlpha = ga * (1 - p) * 0.8;
      ctx.beginPath();
      ctx.arc(ex, -p * r * 1.6, r * 0.045 * (1 - p * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = ga;
    ctx.setTransform(base);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 迴力鏢：三葉旋刃（吃 spin 自轉）＋外圈鋒芒
  drawBoomerang(ctx) {
    ctx.save();
    ctx.rotate(this.spin);
    const r = this.radius;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.32);
      ctx.lineTo(r * 1.5, 0);
      ctx.lineTo(0, r * 0.32);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = this.isEvo ? '#ffe066' : '#d9c7a3';
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.22);
      ctx.lineTo(r * 1.34, 0);
      ctx.lineTo(0, r * 0.22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 軌道炮光束：沿射線方向拉長的亮帶，隨 life 淡出（不帶傷害）
  drawRailBeam(ctx) {
    const len = this.beamRange || 600;
    const w = this.radius * 2;
    const a = Math.max(0, Math.min(1, this.life / 0.18));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.rotate(Math.atan2(this.vy, this.vx));
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(125,248,255,0.55)');
    g.addColorStop(1, 'rgba(125,248,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, -w / 2, len, w);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, -w * 0.12, len * 0.6, w * 0.24);
    ctx.restore();
  }

  drawSoccer(ctx) {
    ctx.rotate(this.x * 0.05);

    if (this.isEvo) {
      ctx.fillStyle = '#00f59b';
      ctx.shadowColor = '#00f59b';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = '#ffffff';
    }

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 足球黑白幾何五邊形
    ctx.fillStyle = '#11141a';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}
