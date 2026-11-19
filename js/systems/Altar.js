// 挑戰祭壇：局中「要不要冒險」的抉擇點（參考 Halls of Torment 的祭壇與風險契約）。
// 定時在玩家附近出現，每座祭壇隨機帶有三種「風險契約」之一（狂戰血契／雷霆疾殺契／鎮魂鐵壁契）：
// 站上去 1.5 秒啟動 → 祭壇周圍湧出一批精英怪並套用契約雙向規則，
// 限時內全滅除了掉落幸運物資箱＋金幣外，還會賜予本局永久屬性強化！不理它 30 秒後自己消失。
import { Enemy } from '../entities/Enemy.js';
import { currentWave, pickEnemy, enemyScale } from '../levels.js';
import { rollEliteAffix } from '../config.js';
import { DropItem } from '../entities/DropItem.js';
import { showHint } from './Hints.js';

const FIRST_AT = 75;        // 第一座祭壇出現時間（秒）
const EVERY = 90;           // 之後的間隔（± JITTER）
const JITTER = 15;
const LIFETIME = 30;        // 沒人理就消失
const RADIUS = 70;          // 啟動範圍
const CHARGE = 1.5;         // 站多久才啟動
const BASE_TIME_LIMIT = 25; // 基準挑戰時限
const BASTION_ARENA_R = 250; // 鎮魂鐵壁契的結界作戰半徑

export const ALTAR_CONTRACTS = [
  {
    id: 'bloodlust',
    name: '狂戰血契',
    icon: '🩸',
    color: '#ff4d6d',
    fillRgba: '255,77,109',
    timeLimit: 25,
    extraElites: 1,
    ruleDesc: '試煉中冷卻 -30%、受傷 +25%，多 1 隻精英',
    rewardDesc: '物資箱 + 1.5×金幣 + 永久全傷害 +8%',
  },
  {
    id: 'blitz',
    name: '雷霆疾殺契',
    icon: '⚡',
    color: '#00f5d4',
    fillRgba: '0,245,212',
    timeLimit: 18,
    extraElites: 0,
    eliteSpeedMul: 1.2,
    ruleDesc: '限時 18 秒！試煉中移速 +25%，精英移速 +20%',
    rewardDesc: '物資箱 + 金幣 + 永久冷卻 -6% & 移速 +6%',
  },
  {
    id: 'bastion',
    name: '鎮魂鐵壁契',
    icon: '🛡️',
    color: '#ffd166',
    fillRgba: '255,209,102',
    timeLimit: 25,
    extraElites: 0,
    arenaRadius: BASTION_ARENA_R,
    ruleDesc: '結界圈內減傷 20%，出圈受靈火灼燒',
    rewardDesc: '物資箱 + 金幣 + 永久生命 +25 & 護盾 +30',
  },
];

function clearAltarTrialMods(game) {
  const p = game.player;
  if (!p) return;
  p._altarCdrMul = 1;
  p._altarSpeedMul = 1;
  p._altarDmgTakenMul = 1;
  game.weaponManager?.applyPassives?.();
}

export function initAltar(game) {
  game.altar = null;
  game._altarNextAt = game.td ? Infinity : FIRST_AT;
  clearAltarTrialMods(game);
}

export function updateAltar(game, dt) {
  const p = game.player;
  let a = game.altar;

  if (!a) {
    // Boss 在場時不出祭壇（不要疊壓力），順延到 Boss 倒下
    if (game.gameTime < game._altarNextAt || game.boss) return;
    const ang = Math.random() * Math.PI * 2;
    const contract = ALTAR_CONTRACTS[Math.floor(Math.random() * ALTAR_CONTRACTS.length)];
    game.altar = {
      x: p.x + Math.cos(ang) * 380,
      y: p.y + Math.sin(ang) * 380,
      state: 'idle',
      t: 0,
      charge: 0,
      foes: [],
      contract,
      contractId: contract.id,
      contractName: contract.name,
      icon: contract.icon,
      color: contract.color,
      timeLimit: contract.timeLimit || BASE_TIME_LIMIT,
      _outTick: 0,
    };
    game.ui.say(
      `${contract.icon} 【${contract.name}】祭壇出現！${contract.ruleDesc} → 獎勵：${contract.rewardDesc}`,
      contract.color,
      4.0
    );
    showHint(game, 'altar');
    return;
  }

  a.t += dt;
  const timeLimit = a.timeLimit || BASE_TIME_LIMIT;
  if (a.state === 'idle') {
    const inside = Math.hypot(p.x - a.x, p.y - a.y) < RADIUS;
    a.charge = inside ? a.charge + dt : Math.max(0, a.charge - dt * 2);
    if (a.charge >= CHARGE) startChallenge(game, a);
    else if (a.t > LIFETIME) finish(game, null);
    return;
  }

  // 鎮魂鐵壁契：在結界圈內享有 20% 減傷，踏出結界圈每 0.8 秒受靈火反噬
  if (a.contractId === 'bastion') {
    const dist = Math.hypot(p.x - a.x, p.y - a.y);
    const inArena = dist <= BASTION_ARENA_R;
    const wantMul = inArena ? 0.8 : 1.15;
    if (p._altarDmgTakenMul !== wantMul) {
      p._altarDmgTakenMul = wantMul;
      game.weaponManager?.applyPassives?.();
    }
    if (!inArena) {
      a._outTick = (a._outTick || 0) + dt;
      if (a._outTick >= 0.8) {
        a._outTick = 0;
        const burnDmg = Math.max(2, Math.round(p.maxHp * 0.03));
        p.hp = Math.max(1, p.hp - burnDmg);
        game.particles?.createHurtText?.(p.x, p.y, burnDmg, '#ffd166');
      }
    } else {
      a._outTick = 0;
    }
  }

  // ponytail: 「不在 enemies 陣列裡」也算擊殺；目前只有死亡會移除敵人，若之後加了遠距回收要改成看擊殺旗標
  a.foes = a.foes.filter((e) => e.hp > 0 && !e.isDead && game.enemies.includes(e));
  if (a.foes.length === 0) finish(game, true);
  else if (a.t > timeLimit) finish(game, false);
}

function startChallenge(game, a) {
  a.state = 'active';
  a.t = 0;
  const c = a.contract || ALTAR_CONTRACTS[0];
  const p = game.player;
  const level = game.level;
  const wave = currentWave(level, game.gameTime);
  const scale = enemyScale(game.gameTime, level, game.rules);
  // 數量隨時間成長：1:15 → 3 隻，每 2 分鐘 +1，最多 6（狂戰血契額外 +1）
  const n = Math.min(7, 3 + Math.floor((game.gameTime - FIRST_AT) / 120) + (c.extraElites || 0));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const e = new Enemy(pickEnemy(wave.pool), a.x + Math.cos(ang) * 220, a.y + Math.sin(ang) * 220, scale);
    e.spawnTime = game.gameTime;
    e.makeElite(rollEliteAffix());
    if (c.eliteSpeedMul) e.speed *= c.eliteSpeedMul;
    game.enemies.push(e);
    a.foes.push(e);
  }

  // 套用契約試煉期間的雙向修正
  if (c.id === 'bloodlust') {
    p._altarCdrMul = 0.70;
    p._altarDmgTakenMul = 1.25;
  } else if (c.id === 'blitz') {
    p._altarSpeedMul = 1.25;
  } else if (c.id === 'bastion') {
    p._altarDmgTakenMul = 0.80;
  }
  game.weaponManager?.applyPassives?.();

  game.particles.createShockwave(a.x, a.y, 180, c.color || '#c77dff');
  game.ui.say(`${c.icon} 【${c.name}】開始！${a.timeLimit} 秒內擊敗 ${n} 隻精英（${c.ruleDesc}）`, c.color || '#c77dff', 3.4);
}

function finish(game, won) {
  const a = game.altar;
  const c = (a && a.contract) || ALTAR_CONTRACTS[0];
  const p = game.player;
  clearAltarTrialMods(game);

  if (won) {
    game.dropItems.push(new DropItem(a.x, a.y, 'CHEST'));
    const goldMul = c.id === 'bloodlust' ? 1.5 : 1.0;
    const gold = Math.round((40 + game.gameTime / 6) * goldMul);
    game.gold += gold;

    // 契約專屬本局永久獎勵
    let bonusText = '';
    if (p) {
      p.meta = p.meta || { dmg: 0, hp: 0, speed: 0, magnet: 0, gold: 0, cdr: 0, crit: 0, critdmg: 0, armor: 0, exp: 0 };
      if (c.id === 'bloodlust') {
        p.meta.dmg = (p.meta.dmg || 0) + 0.08;
        bonusText = ' · 永久全傷害 +8%';
      } else if (c.id === 'blitz') {
        p.meta.cdr = Math.min(0.45, (p.meta.cdr || 0) + 0.06);
        p.meta.speed = (p.meta.speed || 0) + 0.06;
        bonusText = ' · 永久冷卻 -6% & 移速 +6%';
      } else if (c.id === 'bastion') {
        p.meta.hp = (p.meta.hp || 0) + 25;
        p.shield = (p.shield || 0) + 30;
        p.maxShield = Math.max(p.maxShield || 0, p.shield);
        bonusText = ' · 永久最大生命 +25 & 護盾 +30';
      }
      game.weaponManager?.applyPassives?.();
    }

    game.particles.createShockwave(a.x, a.y, 220, '#ffd166');
    game.ui.say(`🏆 【${c.name}】完成！獲得物資箱 +${gold} 🪙${bonusText}`, '#ffd166', 3.6);
  } else if (won === false) {
    game.ui.say(`⌛ 【${c.name}】逾時失敗：精英怪留在戰場上`, '#ff6b6b', 2.5);
  }
  game.altar = null;
  game._altarNextAt = game.gameTime + EVERY + (Math.random() * 2 - 1) * JITTER;
}

export function drawAltar(game, ctx, cam) {
  const a = game.altar;
  if (!a) return;
  const c = a.contract || ALTAR_CONTRACTS[0];
  const color = a.color || c.color || '#c77dff';
  const rgb = c.fillRgba || '157,78,221';
  const timeLimit = a.timeLimit || BASE_TIME_LIMIT;
  const x = a.x - cam.x, y = a.y - cam.y;
  const pulse = 0.5 + 0.5 * Math.sin(game.gameTime * 4);
  ctx.save();
  if (a.state === 'idle') {
    ctx.fillStyle = `rgba(${rgb},${(0.16 + 0.12 * pulse).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x, y, RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 3;
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
    // 契約名稱與獎勵標籤
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(`【${c.name}】${c.rewardDesc}`, x, y - RADIUS - 14);
  } else {
    // 鎮魂鐵壁契：畫出 250px 結界圈
    if (a.contractId === 'bastion') {
      ctx.save();
      ctx.strokeStyle = `rgba(255,209,102,${(0.45 + 0.25 * pulse).toFixed(2)})`;
      ctx.fillStyle = 'rgba(255,209,102,0.06)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([14, 8]);
      ctx.lineDashOffset = -game.gameTime * 24;
      ctx.beginPath();
      ctx.arc(x, y, BASTION_ARENA_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // 挑戰中：倒數環
    ctx.strokeStyle = color; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, RADIUS, -Math.PI / 2, -Math.PI / 2 + (1 - a.t / timeLimit) * Math.PI * 2); ctx.stroke();
  }
  ctx.font = '34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(a.icon || '⚔️', x, y);
  if (a.state === 'active') {
    ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(`【${c.name}】${Math.ceil(timeLimit - a.t)}s · 剩 ${a.foes.length}`, x, y + RADIUS + 22);
  }
  ctx.restore();
}
