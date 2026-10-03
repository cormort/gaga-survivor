// 基地核心 (守塔模式)：場中央要守住的建物。雜兵會朝它進攻並持續啃食，
// HP 歸零即任務失敗。數值來自 js/modes.js 的 mode.core，這裡只負責狀態與繪製。
//
// 畫面上的三個問題與對應處理：
//   1. 顏色門檻太寬：舊版 60% 以上皆為青色、30~60% 琥珀，於是「快掉一半了」
//      看起來仍像滿血。門檻收緊成 65 / 35，危險感才跟得上實際血量。
//   2. 沒有「正在被打」的資訊：雜兵圍上來啃的時候，畫面只有血條在慢慢變短。
//      現在受擊會炸開一圈衝擊環，並在核心周圍點亮紅色角標。
//   3. 危急時不夠吵：血量低於 35% 進入危急狀態 —— 外環轉紅加速、角標持續呼吸
//      、頭頂跳出「核心危急」字樣，讓玩家知道該回頭救家了。

import { TD_STRUCTURE_IMAGES } from '../systems/TowerDefense.js';

const CRIT_PCT = 0.35;    // 進入「危急」的血量門檻
const WARN_PCT = 0.65;    // 進入「警戒」的血量門檻

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
    this.hitTimer = 0;      // 最近被啃食的殘餘時間 (驅動受擊衝擊環)
  }

  takeDamage(amount) {
    if (this.isDead) return false;
    this.hp -= amount;
    this.flashTimer = 0.12;
    this.hitTimer = Math.min(0.5, this.hitTimer + 0.1);
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
    return true;
  }

  // 血量分級：critical / warn / ok。繪製與 UI 共用同一組門檻，
  // 避免「畫面說危急、HUD 說正常」這種兩邊說法不一致的情況。
  get status() {
    const pct = Math.max(0, this.hp / this.maxHp);
    if (pct <= CRIT_PCT) return 'critical';
    if (pct <= WARN_PCT) return 'warn';
    return 'ok';
  }

  update(dt) {
    this.animTimer += dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.hitTimer > 0) this.hitTimer -= dt;
  }

  // 守塔主堡貼圖（spriteKey 由 main.js 依關卡 base 欄位設定）：4 列 完好／受損／危急／倒塌。
  // 前三列只循環前 3 格 —— 第 4 格在設定圖裡是「更嚴重一級」（危急列的第 4 格火已燒完），
  // 混進循環會一閃一閃。倒塌列直接畫最後一格的廢墟（核心倒下時遊戲就結算了，動畫看不到）
  drawSprite(ctx, sx, sy) {
    const img = TD_STRUCTURE_IMAGES[this.spriteKey];
    if (!img || !img.naturalWidth) return false;
    const C = 224, FOOT = 214, SCALE = 0.85;   // 畫出來約 150 寬（碰撞半徑 46，漏怪判定不變）
    const row = this.isDead ? 3 : { ok: 0, warn: 1, critical: 2 }[this.status];
    const frame = this.isDead ? 3 : Math.floor(this.animTimer * 4) % 3;
    const w = C * SCALE;
    const footY = sy + this.radius * 0.7;
    ctx.drawImage(img, frame * C, row * C, C, C, sx - w / 2, footY - FOOT * SCALE, w, w);
    if (this.hitTimer > 0) {   // 漏怪時底座閃一圈紅光
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.hitTimer * 2);
      ctx.strokeStyle = '#ff3355';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(sx, footY - 6, w * 0.42, w * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return true;
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.spriteKey && this.drawSprite(ctx, sx, sy)) return;
    const r = this.radius;
    const pct = Math.max(0, this.hp / this.maxHp);
    const status = this.status;
    const critical = status === 'critical';
    // 血量越低越紅，並加快脈動
    const color = status === 'ok' ? '#00e5ff' : status === 'warn' ? '#ffb703' : '#ff0055';
    const pulseSpeed = critical ? 7 : status === 'warn' ? 3.4 : 2;
    const pulse = 1 + Math.sin(this.animTimer * pulseSpeed) * (critical ? 0.09 : 0.05);

    ctx.save();
    ctx.translate(sx, sy);

    // 地面光暈：危急時半徑跟著呼吸一起放大，遠遠就看得到
    const glowR = r * (critical ? 2.2 + Math.sin(this.animTimer * 7) * 0.25 : 2.2);
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, glowR);
    glow.addColorStop(0, hexA(color, critical ? 0.42 : 0.28));
    glow.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 防禦範圍虛線環 (旋轉)：危急時加粗、加速，變成明顯的警報環
    ctx.strokeStyle = hexA(color, critical ? 0.85 : 0.45);
    ctx.lineWidth = critical ? 3.5 : 2;
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -this.animTimer * (critical ? 60 : 26);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 受擊衝擊環：被啃的瞬間往外炸一圈，把「現在正在被打」變成看得見的事件
    if (this.hitTimer > 0) {
      const t = 1 - this.hitTimer / 0.5;      // 0 → 1
      ctx.strokeStyle = hexA('#ff3b5c', (1 - t) * 0.9);
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.1 + t * 1.5), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 危急角標：四角折線隨脈動收放，靜止畫面也持續在喊「這裡要爆了」
    if (critical) {
      const br = r * (1.44 + Math.sin(this.animTimer * 7) * 0.05);
      const len = r * 0.42;
      ctx.strokeStyle = hexA('#ff3b5c', 0.5 + 0.4 * Math.abs(Math.sin(this.animTimer * 7)));
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
        const cx2 = Math.cos(a) * br;
        const cy2 = Math.sin(a) * br;
        const tx = -Math.sin(a), ty = Math.cos(a);   // 切線方向
        ctx.moveTo(cx2 + tx * len, cy2 + ty * len);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(cx2 - tx * len, cy2 - ty * len);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

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
    ctx.lineWidth = critical ? 4.5 : 3;
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

    // 頭頂血條：加寬加高並加深色外框，在雜亂的戰場上仍然是最大的一條。
    // 核心常常被推到畫面最上緣（玩家往下走時相機跟著跑），此時頭頂的血條與
    // 「核心危急」會被頂部 HUD 蓋掉 —— 那是全遊戲最重要的一條血條，被蓋掉等於
    // 沒有。偵測到上方空間不足時改畫在核心下方。
    const barW = r * 2.4;
    const below = sy - r - 30 < 78;
    const barY = below ? r + 24 : -r - 18;
    ctx.fillStyle = 'rgba(4,6,12,0.92)';
    ctx.beginPath();
    ctx.roundRect(-barW / 2 - 2, barY - 2, barW + 4, 11, 5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-barW / 2, barY, Math.max(0, barW * pct), 7, 3.5);
    ctx.fill();

    // 危急標籤：文字是最後一道防線 —— 玩家可能正在看畫面別的地方
    if (critical) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(this.animTimer * 6));
      ctx.font = '900 15px "Noto Sans TC", "Chakra Petch", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = below ? 'top' : 'bottom';
      const labelY = below ? barY + 16 : barY - 6;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,6,12,0.92)';
      ctx.strokeText('⚠ 核心危急', 0, labelY);
      ctx.fillStyle = '#ff3b5c';
      ctx.fillText('⚠ 核心危急', 0, labelY);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
