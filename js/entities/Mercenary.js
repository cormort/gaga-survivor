// 傭兵 (局內 AI 幫手)：花金幣僱傭的修仙弟子，跟隨特工自動索敵、御劍攻擊；
// 擊殺提升境界 (煉氣→化神)、會被咬死要重雇。
// 像「會移動的砲塔」：不吃武器槽、不進升級三選一，純局內消耗金幣的戰力。

import { worldBounds } from '../config.js';
import { sound } from '../audio.js';
import { getSprite, blit } from '../sprites.js';

export const MERC = {
  baseCost: 80,     // 首名費用
  costGrowth: 60,   // 每多雇一名更貴
  maxCount: 3,
  maxLevel: 5,
  hpPerLevel: [90, 130, 170, 210, 250],
  damagePerLevel: [12, 19, 26, 33, 40],
  baseCooldown: 0.95,   // 隨等級微降
  range: 250,
  followSpeed: 250,
  bulletSpeed: 540,
};

// 境界：參考修仙境界表，傭兵等級 1~5 對應凡人階段前五境
export const REALM = ['煉氣期', '築基期', '金丹期', '元嬰期', '化神期'];
const REALM_COLOR = ['#ff6b5e', '#6ea8ff', '#ffd166', '#ffe45e', '#e8e8e8'];

// 六脈弟子 (貼圖 = 修仙角色)，雇用時隨機抽一脈；qi = 劍氣顏色
const SECTS = [
  { sprite: 'xian_sword', qi: '#6ea8ff' },
  { sprite: 'xian_talisman', qi: '#ff6b5e' },
  { sprite: 'xian_mage', qi: '#e8f0ff' },
  { sprite: 'xian_alchemy', qi: '#3ddc84' },
  { sprite: 'xian_zen', qi: '#ffd166' },
  { sprite: 'xian_demon', qi: '#b388ff' },
];

// 本命飛劍 (傭兵手上懸浮的與射出去的共用同一把)：劍尖朝 +x
export function drawFlyingSword(ctx, k, qi, glow = 1) {
  ctx.save();
  ctx.scale(k, k);
  ctx.shadowColor = qi;
  ctx.shadowBlur = 10 * glow;
  // 劍身
  ctx.fillStyle = '#eef3f5';
  ctx.strokeStyle = '#4b5a60';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(4, -2.4);
  ctx.lineTo(-6, -2.2);
  ctx.lineTo(-6, 2.2);
  ctx.lineTo(4, 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // 劍脊
  ctx.strokeStyle = qi;
  ctx.globalAlpha = 0.5 + 0.5 * glow;
  ctx.beginPath();
  ctx.moveTo(13, 0); ctx.lineTo(-5, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 護手 + 劍柄 + 劍穗
  ctx.fillStyle = '#c9a44a';
  ctx.fillRect(-8, -4, 2.2, 8);
  ctx.fillStyle = '#3a2a22';
  ctx.fillRect(-14, -1.4, 6, 2.8);
  ctx.strokeStyle = '#c9443a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-18, 2, -20, 5);
  ctx.stroke();
  ctx.restore();
}

// 三種隊形站位 (以玩家為中心)
const FORMATION = [
  { x: -46, y: 6 },
  { x: 46, y: 6 },
  { x: 0, y: -40 },
];

export class Mercenary {
  constructor(x, y, index = 0) {
    this.x = x;
    this.y = y;
    this.index = index;
    this.level = 1;
    this.exp = 0;
    this.maxHp = MERC.hpPerLevel[0];
    this.hp = this.maxHp;
    this.fireCd = 0.6;
    this.angle = Math.PI;       // 槍口指向 (索敵時更新)
    this.flashTimer = 0;
    this.sway = Math.random() * Math.PI * 2;
    this.isDead = false;
    this.sect = SECTS[Math.floor(Math.random() * SECTS.length)];
  }

  get damage() {
    return MERC.damagePerLevel[this.level - 1] || MERC.damagePerLevel[MERC.damagePerLevel.length - 1];
  }

  get qiColor() {
    return this.sect.qi;
  }

  get cooldown() {
    return Math.max(0.6, MERC.baseCooldown - 0.05 * (this.level - 1));
  }

  nextExp() {
    return this.level * 3; // Lv1 殺 3 隻升 2，依此類推
  }

  // 傭兵親手擊殺敵人時由主迴圈呼叫
  gainKill() {
    this.exp++;
    if (this.exp >= this.nextExp() && this.level < MERC.maxLevel) {
      this.exp -= this.nextExp();
      this.level++;
      const prevMax = this.maxHp;
      this.maxHp = MERC.hpPerLevel[this.level - 1];
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - prevMax));
      sound.playGem();
    }
  }

  update(dt, player, enemies, onFire) {
    if (this.isDead) return;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    this.sway += dt * 2.2;

    // 跟隨隊形站位 (帶輕微搖擺，避免三個疊成一坨)
    const off = FORMATION[this.index % FORMATION.length];
    const tx = player.x + off.x + Math.sin(this.sway) * 8;
    const ty = player.y + off.y + Math.cos(this.sway * 0.7) * 8;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6) {
      const spd = Math.min(MERC.followSpeed, dist * 6) * dt;
      this.x += (dx / dist) * spd;
      this.y += (dy / dist) * spd;
    }

    // 地圖邊界限制
    const b = worldBounds();
    this.x = Math.max(b.minX + 30, Math.min(b.maxX - 30, this.x));
    this.y = Math.max(b.minY + 30, Math.min(b.maxY - 30, this.y));

    // 索敵 (最近敵人優先，範圍平方比較)
    this.fireCd -= dt;
    let target = null;
    let best = MERC.range * MERC.range;
    for (const e of enemies) {
      if (e.isDead) continue;
      const edx = e.x - this.x;
      const edy = e.y - this.y;
      const d2 = edx * edx + edy * edy;
      if (d2 < best) {
        best = d2;
        target = e;
      }
    }
    if (target) {
      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.fireCd <= 0 && onFire) {
        this.fireCd = this.cooldown;
        onFire(this, target);
      }
    }
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.hp -= amount; // 保留浮點：敵人啃食是每幀小量累積，round 會把小傷害歸零
    this.flashTimer = 0.08;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    if (this.isDead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (sx < -60 || sx > window.innerWidth + 60 || sy < -60 || sy > window.innerHeight + 60) return;

    const bob = Math.sin(this.sway * 2) * 1.2;   // 御氣懸浮的上下起伏
    const face = Math.cos(this.angle) >= 0 ? 1 : -1;

    ctx.save();
    ctx.translate(sx, sy);

    // 本命飛劍：懸浮在身後、劍尖指向目標 (冷卻快好時劍光變亮)
    const ready = 1 - Math.max(0, this.fireCd) / this.cooldown;
    ctx.save();
    ctx.translate(-face * 14, -14 + bob);
    ctx.rotate(this.angle);
    drawFlyingSword(ctx, 0.75, this.sect.qi, 0.3 + ready * 0.7);
    ctx.restore();

    // 弟子本體：縮小版修仙角色貼圖 (傭兵比玩家小一號)
    ctx.save();
    ctx.translate(0, bob - 6);
    ctx.scale(face * 0.62, 0.62);
    blit(ctx, getSprite(this.sect.sprite), 0, 0, 0, this.flashTimer > 0);
    ctx.restore();

    // 血條 + 境界
    const barW = 26;
    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(-barW / 2 - 1, -34, barW + 2, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = pct > 0.35 ? '#3ddc84' : '#ff5e5e';
    ctx.beginPath();
    ctx.roundRect(-barW / 2, -33, barW * pct, 3, 1.5);
    ctx.fill();
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const label = REALM[this.level - 1] || REALM[REALM.length - 1];
    ctx.strokeText(label, 0, -36);
    ctx.fillStyle = REALM_COLOR[this.level - 1] || '#ffd60a';
    ctx.fillText(label, 0, -36);

    ctx.restore();
  }
}
