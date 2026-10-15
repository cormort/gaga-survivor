// 挑戰祭壇：局中「要不要冒險」的抉擇點（參考 Halls of Torment 的祭壇）。
// 定時在玩家附近出現，站上去 1.5 秒啟動 → 祭壇周圍湧出一批精英怪，
// 限時內全滅就掉幸運物資箱＋金幣；不理它 30 秒後自己消失。只在生存者模式出現。
import { Enemy } from '../entities/Enemy.js';
import { currentWave, pickEnemy, enemyScale } from '../levels.js';
import { rollEliteAffix } from '../config.js';
import { DropItem } from '../entities/DropItem.js';

const FIRST_AT = 75;        // 第一座祭壇出現時間（秒）
const EVERY = 90;           // 之後的間隔（± JITTER）
const JITTER = 15;
const LIFETIME = 30;        // 沒人理就消失
const RADIUS = 70;          // 啟動範圍
const CHARGE = 1.5;         // 站多久才啟動
const TIME_LIMIT = 25;      // 挑戰時限

export function initAltar(game) {
  game.altar = null;
  game._altarNextAt = game.td ? Infinity : FIRST_AT;
}

export function updateAltar(game, dt) {
  const p = game.player;
  let a = game.altar;

  if (!a) {
    // Boss 在場時不出祭壇（不要疊壓力），順延到 Boss 倒下
    if (game.gameTime < game._altarNextAt || game.boss) return;
    const ang = Math.random() * Math.PI * 2;
    game.altar = { x: p.x + Math.cos(ang) * 380, y: p.y + Math.sin(ang) * 380, state: 'idle', t: 0, charge: 0, foes: [] };
    game.ui.say('⚔️ 挑戰祭壇出現了！站上去召喚精英怪，限時全滅可得物資箱', '#c77dff', 3.5);
    return;
  }

  a.t += dt;
  if (a.state === 'idle') {
    const inside = Math.hypot(p.x - a.x, p.y - a.y) < RADIUS;
    a.charge = inside ? a.charge + dt : Math.max(0, a.charge - dt * 2);
    if (a.charge >= CHARGE) startChallenge(game, a);
    else if (a.t > LIFETIME) finish(game, null);
    return;
  }

  // ponytail: 「不在 enemies 陣列裡」也算擊殺；目前只有死亡會移除敵人，若之後加了遠距回收要改成看擊殺旗標
  a.foes = a.foes.filter((e) => e.hp > 0 && !e.isDead && game.enemies.includes(e));
  if (a.foes.length === 0) finish(game, true);
  else if (a.t > TIME_LIMIT) finish(game, false);
}

function startChallenge(game, a) {
  a.state = 'active';
  a.t = 0;
  const level = game.level;
  const wave = currentWave(level, game.gameTime);
  const scale = enemyScale(game.gameTime, level, game.rules);
  // 數量隨時間成長：1:15 → 3 隻，每 2 分鐘 +1，最多 6
  const n = Math.min(6, 3 + Math.floor((game.gameTime - FIRST_AT) / 120));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const e = new Enemy(pickEnemy(wave.pool), a.x + Math.cos(ang) * 220, a.y + Math.sin(ang) * 220, scale);
    e.spawnTime = game.gameTime;
    e.makeElite(rollEliteAffix());
    game.enemies.push(e);
    a.foes.push(e);
  }
  game.particles.createShockwave(a.x, a.y, 160, '#c77dff');
  game.ui.say(`⚔️ 挑戰開始！${TIME_LIMIT} 秒內擊敗 ${n} 隻精英`, '#c77dff', 3);
}

function finish(game, won) {
  const a = game.altar;
  if (won) {
    game.dropItems.push(new DropItem(a.x, a.y, 'CHEST'));
    const gold = Math.round(40 + game.gameTime / 6);
    game.gold += gold;
    game.particles.createShockwave(a.x, a.y, 200, '#ffd166');
    game.ui.say(`🏆 挑戰成功！祭壇留下了物資箱，+${gold} 🪙`, '#ffd166', 3);
  } else if (won === false) {
    game.ui.say('⌛ 挑戰失敗：時間到，精英怪留在戰場上', '#ff6b6b', 2.5);
  }
  game.altar = null;
  game._altarNextAt = game.gameTime + EVERY + (Math.random() * 2 - 1) * JITTER;
}

export function drawAltar(game, ctx, cam) {
  const a = game.altar;
  if (!a) return;
  const x = a.x - cam.x, y = a.y - cam.y;
  const pulse = 0.5 + 0.5 * Math.sin(game.gameTime * 4);
  ctx.save();
  if (a.state === 'idle') {
    ctx.fillStyle = `rgba(157,78,221,${(0.18 + 0.12 * pulse).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x, y, RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -game.gameTime * 30;
    ctx.beginPath(); ctx.arc(x, y, RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // 啟動進度環
    if (a.charge > 0) {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(x, y, RADIUS + 8, -Math.PI / 2, -Math.PI / 2 + (a.charge / CHARGE) * Math.PI * 2); ctx.stroke();
    }
    // 剩餘時間（淡出提示）
    ctx.globalAlpha = Math.min(1, (LIFETIME - a.t) / 5);
  } else {
    // 挑戰中：倒數環
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, RADIUS, -Math.PI / 2, -Math.PI / 2 + (1 - a.t / TIME_LIMIT) * Math.PI * 2); ctx.stroke();
  }
  ctx.font = '34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚔️', x, y);
  if (a.state === 'active') {
    ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.ceil(TIME_LIMIT - a.t)}s · 剩 ${a.foes.length}`, x, y + RADIUS + 22);
  }
  ctx.restore();
}
