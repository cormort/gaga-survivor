// 敵方投射物實體 (遠程怪酸液彈、Boss 散彈幕等)

import { GAME_CONFIG } from '../config.js';

// 酸液彈光暈烘焙：原本每顆每幀都設 shadowBlur = 10 再填圓。陰影模糊是 Canvas2D
// 最貴的操作之一（活躍彈上限 150 = 每幀 150 次），但彈體是固定形狀、顏色只有少數
// 幾種 —— 開一次離屏畫布烘好，之後每幀只剩一次 drawImage。
//
// 關鍵細節：shadowBlur 的單位是「裝置像素」且不隨 CTM 縮放，所以烘焙倍率必須等於
// 主畫布的裝置倍率（main.js 的 dpr）、貼回時 1:1，光暈半徑才會與原本一模一樣。
const BOLT_CACHE = new Map();
const BOLT_CACHE_MAX = 24;   // 顏色（含精英色）實務上只有幾種；超過就整批清掉重建
const BOLT_PAD = 24;         // 光暈外緣留白（blur 10 的擴散約 20 裝置像素）

function boltSprite(color, glow, radius, scale) {
  const ss = Math.max(1, Math.round(scale * 100) / 100);
  const key = `${color}|${glow}|${radius}|${ss}`;
  const hit = BOLT_CACHE.get(key);
  if (hit) return hit;

  const size = (radius + BOLT_PAD) * 2;   // 邏輯尺寸 (drawImage 的目的尺寸)
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(size * ss);
  cv.height = Math.ceil(size * ss);
  const x = cv.getContext('2d');
  x.scale(ss, ss);
  x.translate(size / 2, size / 2);

  x.shadowColor = glow;
  x.shadowBlur = 10;                      // 裝置像素：這裡刻意不乘 ss，與原畫法等值
  x.fillStyle = color;
  x.beginPath();
  x.arc(0, 0, radius, 0, Math.PI * 2);
  x.fill();

  // 核心亮白高光 (不帶陰影)
  x.shadowBlur = 0;
  x.fillStyle = 'rgba(255, 255, 255, 0.85)';
  x.beginPath();
  x.arc(-radius * 0.25, -radius * 0.25, radius * 0.45, 0, Math.PI * 2);
  x.fill();

  const spr = { cv, size };
  if (BOLT_CACHE.size >= BOLT_CACHE_MAX) BOLT_CACHE.clear();
  BOLT_CACHE.set(key, spr);
  return spr;
}

export class EnemyProjectile {
  constructor(options = {}) {
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.damage = options.damage || 10;
    this.radius = options.radius || 6;
    this.life = options.life || 3.5;
    this.maxLife = this.life;
    this.color = options.color || '#06d6a0';
    this.glow = options.glow || options.color || '#06d6a0';
    this.isDead = false;
  }

  update(dt) {
    if (this.isDead) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 超出世界邊界則銷毀
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    if (this.x < bounds.minX - 50 || this.x > bounds.maxX + 50 ||
        this.y < bounds.minY - 50 || this.y > bounds.maxY + 50) {
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // 螢幕視野裁切
    if (screenX < -50 || screenX > window.innerWidth + 50 ||
        screenY < -50 || screenY > window.innerHeight + 50) {
      return;
    }

    // 主畫布目前只做了 setTransform(dpr,...) 的等比縮放，取 .a 即裝置倍率
    const spr = boltSprite(this.color, this.glow, this.radius, ctx.getTransform().a || 1);
    ctx.drawImage(spr.cv, screenX - spr.size / 2, screenY - spr.size / 2, spr.size, spr.size);
  }
}
