// 基地核心 (守塔模式)：場中央要守住的建物。雜兵會朝它進攻並持續啃食，
// HP 歸零即任務失敗。數值來自 js/modes.js 的 mode.core，這裡只負責狀態與繪製。

export class Core {
  constructor({ x = 0, y = 0, hp = 3000, radius = 46 } = {}) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.maxHp = hp;
    this.hp = hp;
    this.isDead = false;
    this.flashTimer = 0;
    this.animTimer = 0;
  }

  takeDamage(amount) {
    if (this.isDead) return false;
    this.hp -= amount;
    this.flashTimer = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
    return true;
  }

  update(dt) {
    this.animTimer += dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const r = this.radius;
    const pct = Math.max(0, this.hp / this.maxHp);
    // 血量越低越紅，並加快脈動
    const color = pct > 0.6 ? '#00e5ff' : pct > 0.3 ? '#ffb703' : '#ff0055';
    const pulse = 1 + Math.sin(this.animTimer * (pct > 0.3 ? 2 : 6)) * 0.05;

    ctx.save();
    ctx.translate(sx, sy);

    // 地面光暈
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.2);
    glow.addColorStop(0, hexA(color, 0.28));
    glow.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 防禦範圍虛線環 (旋轉)
    ctx.strokeStyle = hexA(color, 0.45);
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -this.animTimer * 26;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 六角形底座
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r * pulse;
      const py = Math.sin(a) * r * pulse * 0.9;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = this.flashTimer > 0 ? '#ffffff' : '#16243a';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 內部能量核心 (呼吸)
    const inner = r * 0.5 * pulse;
    const ig = ctx.createRadialGradient(0, 0, 0, 0, 0, inner);
    ig.addColorStop(0, '#ffffff');
    ig.addColorStop(0.4, color);
    ig.addColorStop(1, hexA(color, 0.1));
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(0, 0, inner, 0, Math.PI * 2);
    ctx.fill();

    // 頭頂血條
    const barW = r * 2;
    const barY = -r - 16;
    ctx.fillStyle = 'rgba(6,10,18,0.85)';
    ctx.beginPath();
    ctx.roundRect(-barW / 2 - 1.5, barY - 1.5, barW + 3, 9, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-barW / 2, barY, Math.max(0, barW * pct), 6, 3);
    ctx.fill();

    ctx.restore();
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
