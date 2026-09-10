// 掉落物實體 (經驗水晶、磁鐵、炸彈、烤雞回血、金幣)

import { DROP_TYPES } from '../config.js';
import { RARITIES } from '../items.js';
import { getSprite, blit } from '../sprites.js';

// 經驗水晶 → 烘焙 sprite。水晶是場上數量最多的東西 (實測 7:50 有 126 顆佔掉落物 91%)，
// 逐顆逐幀畫向量菱形 + shadowBlur 是整個渲染最貴的一段，改走既有的烘焙管線。
const GEM_SPRITE = {
  EXP_GREEN: 'gem_green',
  EXP_BLUE: 'gem_blue',
  EXP_PURPLE: 'gem_purple',
  EXP_GOLD: 'gem_gold',
};

// 會過期的掉落物類型：場上量最大、玩家不會特地繞路去撿的雜物。
// 裝備/寶箱/消費道具/補給這類「值得繞路」的掉落物不設時限，讓它們消失只會變成懲罰。
const EXPIRING_TYPES = new Set(['exp', 'gold']);
const DROP_LIFETIME = 60;   // 秒
const BLINK_LAST = 5;       // 最後幾秒開始閃爍預告

export class DropItem {
  constructor(x, y, kind = 'EXP_GREEN', payload = null) {
    this.x = x;
    this.y = y;
    this.kind = kind;

    const conf = DROP_TYPES[kind] || DROP_TYPES.EXP_GREEN;
    this.value = conf.value || 0;
    this.color = conf.color || '#00f59b';
    this.radius = conf.radius || 5;
    this.type = conf.type || 'exp';
    this.heal = conf.heal || 0;
    this.icon = conf.icon || '';

    this.subType = conf.subType || null;

    // 裝備掉落：帶著整件物品，顏色改用稀有度色
    this.item = payload;
    if (this.type === 'gear' && payload) {
      this.color = RARITIES[payload.rarity].color;
    }

    // 吸附飛行狀態
    this.isAttracted = false;
    this.flySpeed = 0;
    this.collected = false;

    // 存活倒數：撿不到的雜物會無限累積，每幀照樣 update + draw
    this.life = EXPIRING_TYPES.has(this.type) ? DROP_LIFETIME : Infinity;
    this.expired = false;

    // 微浮動
    this.animTime = Math.random() * 5;
  }

  // drift: 場上水晶太多時給的緩慢牽引速度 (px/s)，0 表示不牽引。
  // 拾取半徑之外的水晶原本只能靠玩家自己走過去，清完一波後場上散落幾百顆，
  // 要嘛繞路撿到手軟、要嘛放它過期。堆積時給一點被動吸引，摩擦少很多。
  update(dt, player, drift = 0) {
    if (this.collected || this.expired) return;

    this.animTime += dt * 5;

    // 已經起飛的道具不再倒數 —— 飛到一半憑空消失最惱人
    if (!this.isAttracted) {
      this.life -= dt;
      if (this.life <= 0) {
        this.expired = true;
        return;
      }
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    // 進入拾取半徑觸發磁吸
    if (dist < player.pickupRadius) {
      this.isAttracted = true;
    } else if (drift > 0 && dist > 0.1) {
      this.x += (dx / dist) * drift * dt;
      this.y += (dy / dist) * drift * dt;
    }

    if (this.isAttracted) {
      this.flySpeed += 1400 * dt; // 加速飛向玩家
      const step = this.flySpeed * dt;
      const reach = player.radius + this.radius;

      // 一幀的位移可能大於接觸半徑 (磁鐵吸全場的遠距離水晶會加速到 1500+ px/s，
      // 敵人一多、幀時間拉長時更誇張)。只比對距離的話水晶會直接穿過玩家，
      // 之後在兩側來回彈跳且越飛越快，永遠撿不到 —— 這些幽靈水晶不斷累積，
      // 每幀照樣 update + draw，就是磁鐵之後越來越卡的原因。
      if (dist <= reach || step >= dist - reach) {
        this.collected = true;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }
  }

  draw(ctx, camera) {
    if (this.collected || this.expired) return;

    // 剩最後幾秒閃爍，讓玩家知道再不撿就沒了
    if (this.life < BLINK_LAST && Math.sin(this.animTime * 4) < 0) return;

    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 視野邊界優化
    if (screenX < -30 || screenX > window.innerWidth + 30 ||
        screenY < -30 || screenY > window.innerHeight + 30) {
      return;
    }

    const bob = Math.sin(this.animTime) * 2;

    ctx.save();
    ctx.translate(screenX, screenY + bob);

    if (this.type === 'exp') {
      // 光暈與稜面都已烘進 sprite，這裡只剩一次 drawImage
      blit(ctx, getSprite(GEM_SPRITE[this.kind] || 'gem_green'), 0, 0, 0);
    } else if (this.type === 'gear') {
      // 裝備：稀有度光暈 + 寶箱圖示，遠遠就看得出值不值得繞路
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 2.6);
      g.addColorStop(0, this.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55 + Math.sin(this.animTime * 1.4) * 0.15;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.35, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `${this.radius * 1.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);
    } else if (this.type === 'chest') {
      // 幸運補給箱：奪目金黃光暈與外圈旋轉金環
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, this.radius * 3.2);
      g.addColorStop(0, '#ffb703');
      g.addColorStop(1, 'rgba(255, 183, 3, 0)');
      ctx.globalAlpha = 0.65 + Math.sin(this.animTime * 2) * 0.2;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `${this.radius * 2.2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon || '🧰', 0, 0);
    } else if (this.type === 'consumable') {
      // 惡魔城風格消費道具：絢麗光暈與旋轉星環
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 2.8);
      g.addColorStop(0, this.color || '#00f59b');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.6 + Math.sin(this.animTime * 2.5) * 0.2;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = this.color || '#00f59b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `${this.radius * 1.8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);
    } else {
      // 道具 (磁鐵、炸彈、烤雞、金幣)
      ctx.font = `${this.radius * 2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);
    }

    ctx.restore();
  }
}

// ── 地圖街頭可破壞場景物 (Destructibles: 木箱 / 油桶 / 補給桶) ──
export class DestructibleCrate {
  constructor(x, y, kind = 'crate') {
    this.x = x;
    this.y = y;
    this.kind = kind; // 'crate' | 'barrel'
    this.radius = kind === 'barrel' ? 18 : 16;
    this.maxHp = kind === 'barrel' ? 40 : 25;
    this.hp = this.maxHp;
    this.isDead = false;
    this.shake = 0;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.shake = 4;
    if (this.hp <= 0) {
      this.isDead = true;
    }
    return this.isDead;
  }

  update(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 20);
    }
  }

  // 破壞時的木屑/鐵片噴濺
  splinter(particles) {
    const color = this.kind === 'barrel' ? '#4cc9f0' : '#d4a373';
    particles.createDeathParticles(this.x, this.y, color, 12);
    particles.createHitSpark(this.x, this.y, color);
  }

  draw(ctx, camera) {
    if (this.isDead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;

    if (sx < -40 || sx > window.innerWidth + 40 || sy < -40 || sy > window.innerHeight + 40) return;

    ctx.save();
    ctx.translate(sx + (Math.random() - 0.5) * this.shake, sy + (Math.random() - 0.5) * this.shake);

    if (this.kind === 'barrel') {
      // 鋼鐵油桶 / 科技物資桶
      ctx.fillStyle = '#2b2d42';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4cc9f0';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛢️', 0, 0);
    } else {
      // 復古木箱
      const size = this.radius * 2;
      ctx.fillStyle = '#8d5b4c';
      ctx.fillRect(-this.radius, -this.radius, size, size);
      ctx.strokeStyle = '#d4a373';
      ctx.lineWidth = 2;
      ctx.strokeRect(-this.radius, -this.radius, size, size);

      // 對角交叉木條
      ctx.beginPath();
      ctx.moveTo(-this.radius, -this.radius);
      ctx.lineTo(this.radius, this.radius);
      ctx.moveTo(this.radius, -this.radius);
      ctx.lineTo(-this.radius, this.radius);
      ctx.strokeStyle = '#582f0e';
      ctx.stroke();

      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📦', 0, 0);
    }

    // 若受損，顯示微型血條
    if (this.hp < this.maxHp) {
      const barW = this.radius * 2;
      const barH = 3;
      const barY = -this.radius - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-this.radius, barY, barW, barH);
      ctx.fillStyle = '#ffb703';
      ctx.fillRect(-this.radius, barY, barW * Math.max(0, this.hp / this.maxHp), barH);
    }

    ctx.restore();
  }
}

