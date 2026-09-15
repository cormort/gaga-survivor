// 地形機制與可引爆物件（油桶／載具／木箱／毒霧池／地雷／噴發口／縮圈…）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 450 行，而且與戰鬥／進程系統幾乎無關 ——
// 只透過 game 物件讀寫「機制計時器、機制實例、粒子、玩家、敵人、關卡資料」。
// 這裡刻意不採用「把狀態綁到模組實例」的作法，而是把 game 明確當成第一個參數：
// 依賴關係直接寫在簽章上，模組本身不持有任何遊戲狀態。
//
// 呼叫端：main.js 以 hazards.updateHazards(this, dt) 這種形式呼叫；
// 外部（例如 WeaponManager 的爆炸波及木箱）則走 Game 上的同名薄包裝。

import { GAME_CONFIG, FX } from '../config.js';
import { LEVELS } from '../levels.js';
import { DropItem, DestructibleCrate } from '../entities/DropItem.js';
import { sound } from '../audio.js';

// '#rrggbb' + alpha → 'rgba(...)'（原本是 main.js 的模組層函式，只有這裡在用）
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function initExplodableProps(game) {
  game.explodableProps = [];
  const bounds = GAME_CONFIG.WORLD_BOUNDS;
  const count = 14;
  const types = ['tank', 'car', 'hazard'];
  for (let i = 0; i < count; i++) {
    let px = 0, py = 0;
    let tries = 0;
    do {
      px = bounds.minX + 250 + Math.random() * (bounds.maxX - bounds.minX - 500);
      py = bounds.minY + 250 + Math.random() * (bounds.maxY - bounds.minY - 500);
      tries++;
    } while (Math.hypot(px, py) < 320 && tries < 20);

    const type = types[Math.floor(Math.random() * types.length)];
    game.explodableProps.push({
      x: px,
      y: py,
      hp: 45,
      maxHp: 45,
      radius: type === 'car' ? 32 : 24,
      type: type,
      flashTimer: 0,
    });
  }
}

export function triggerPropExplosion(game, prop) {
  game.particles.createExplosion(prop.x, prop.y, 140);
  game.particles.createShockwave(prop.x, prop.y, 180, '#ff9e00');
  sound.playExplosion(prop.x);
  game.camera.shake = Math.max(game.camera.shake, 14);
  // 爆炸焦痕
  game.addDecal(prop.x, prop.y, 150, FX.scorch.fill, FX.scorch.a, FX.scorch.accent, FX.decalLife + 2);

  const blastR = 175;
  for (const enemy of game.enemies) {
    if (enemy.isDead) continue;
    const d = Math.hypot(enemy.x - prop.x, enemy.y - prop.y);
    if (d < blastR + enemy.radius) {
      game.damageEnemy(enemy, 350, 16, prop.x, prop.y);
    }
  }
  const playerDist = Math.hypot(game.player.x - prop.x, game.player.y - prop.y);
  if (playerDist < blastR && game.player.takeDamage(12)) {
    game.particles.createHurtText(game.player.x, game.player.y, 12);
  }
}

export function drawExplodableProps(game, camera) {
  const ctx = game.ctx;
  for (const p of game.explodableProps) {
    const rx = p.x - camera.x;
    const ry = p.y - camera.y;
    if (rx < -80 || rx > game.vw + 80 || ry < -80 || ry > game.vh + 80) continue;

    ctx.save();
    ctx.translate(rx, ry);

    // 陰影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, p.radius * 0.7, p.radius, p.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 受擊閃白
    if (p.flashTimer > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (p.type === 'tank') {
      // 紅色高爆汽油桶
      ctx.fillStyle = '#d90429';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-16, -22, 32, 44, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-14, -8, 28, 6);
      ctx.fillRect(-14, 6, 28, 6);

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛢️', 0, 0);
    } else if (p.type === 'hazard') {
      // 毒素生化廢料桶
      ctx.fillStyle = '#06d6a0';
      ctx.strokeStyle = '#073b4c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-18, -20, 36, 40, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☣️', 0, 0);
    } else {
      // 廢棄裝甲車
      ctx.fillStyle = '#3a5a40';
      ctx.strokeStyle = '#1b263b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-28, -18, 56, 36, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1b263b';
      ctx.fillRect(-20, -10, 40, 20);

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚨', 0, 0);
    }

    // 血條
    if (p.hp < p.maxHp) {
      const bw = p.radius * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-bw / 2, -p.radius - 10, bw, 4);
      ctx.fillStyle = '#ef233c';
      ctx.fillRect(-bw / 2, -p.radius - 10, bw * (p.hp / p.maxHp), 4);
    }

    ctx.restore();
  }
}

export function initDestructibles(game) {
  game.destructibles = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    spawnSingleDestructible(game);
  }
}

export function spawnSingleDestructible(game) {
  const bounds = GAME_CONFIG.WORLD_BOUNDS;
  let px = 0, py = 0;
  let tries = 0;
  do {
    px = bounds.minX + 160 + Math.random() * (bounds.maxX - bounds.minX - 320);
    py = bounds.minY + 160 + Math.random() * (bounds.maxY - bounds.minY - 320);
    tries++;
  } while (game.player && Math.hypot(px - game.player.x, py - game.player.y) < 200 && tries < 25);

  const kind = Math.random() < 0.65 ? 'crate' : 'barrel';
  game.destructibles.push(new DestructibleCrate(px, py, kind));
}

export function dropCrateLoot(game, x, y, kind = 'crate') {
  const r = Math.random();
  // 55% 掉落惡魔城式戰術消費道具、25% 金幣、10% 烤雞回血、10% 紫色經驗
  if (r < 0.55) {
    const keys = ['POTION', 'ATK_POTION', 'SHIELD_POTION', 'LUCK_POTION', 'STOPWATCH', 'HOLY_WATER', 'MANNA_PRISM', 'MAGIC_TICKET', 'ELIXIR'];
    const weights = [22, 16, 16, 14, 10, 8, 7, 7, 3];
    const sum = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * sum;
    let pick = 'POTION';
    for (let i = 0; i < keys.length; i++) {
      if (rand < weights[i]) {
        pick = keys[i];
        break;
      }
      rand -= weights[i];
    }
    game.dropItems.push(new DropItem(x, y, pick));
  } else if (r < 0.80) {
    game.dropItems.push(new DropItem(x, y, 'GOLD_COIN'));
  } else if (r < 0.90) {
    game.dropItems.push(new DropItem(x, y, 'ROAST_CHICKEN'));
  } else {
    game.dropItems.push(new DropItem(x, y, 'EXP_PURPLE'));
  }
}

export function updateHazards(game, dt) {
  const level = game.level || LEVELS.street;
  // 向下相容：舊的 mech 單物件自動包成陣列
  const mechs = level.mechs || (level.mech ? [level.mech] : []);

  for (const mech of mechs) {
    // 冰面慣性：只需每幀設定玩家的 iceFriction
    if (mech.type === 'ice') {
      game.player.iceFriction = mech.friction || 0.92;
      continue;
    }
    // 縮圈結界：每幀縮小半徑，圈外扣血 + 向圈心微推
    if (mech.type === 'shrinkCircle') {
      if (!game._shrinkCircle) {
        game._shrinkCircle = { radius: mech.startRadius, tick: 0 };
      }
      const sc = game._shrinkCircle;
      sc.radius = Math.max(mech.endRadius, sc.radius - mech.shrinkRate * dt);
      sc.tick -= dt;
      const p = game.player;
      const dist = Math.hypot(p.x, p.y); // 圈心固定在世界原點
      if (dist > sc.radius) {
        if (sc.tick <= 0) {
          sc.tick = mech.dmgInterval || 0.4;
          if (p.takeDamage(mech.dmg)) game.particles.createHurtText(p.x, p.y, mech.dmg);
        }
        // 微推向圈心
        if (dist > 0) {
          p.x -= (p.x / dist) * 30 * dt;
          p.y -= (p.y / dist) * 30 * dt;
        }
      }
      continue;
    }

    // 需要計時器的機制 (pool/mine/geyser/supply/safeZone)
    const timerKey = mech.type;
    if (game._mechTimers[timerKey] === undefined) {
      game._mechTimers[timerKey] = 10; // 開場 10 秒後才開始
    }
    game._mechTimers[timerKey] -= dt;
    if (game._mechTimers[timerKey] <= 0) {
      game._mechTimers[timerKey] = mech.interval + Math.random() * (mech.jitter || 0);
      spawnHazard(game, mech);
    }
  }

  const p = game.player;
  for (let i = game.hazards.length - 1; i >= 0; i--) {
    const h = game.hazards[i];
    h.t += dt;

    if (h.kind === 'pool') {
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const rr = h.r + p.radius;
        if (dx * dx + dy * dy < rr * rr) {
          if (p.takeDamage(h.dmg)) game.particles.createHurtText(p.x, p.y, h.dmg);
        }
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'safeZone') {
      // 安全高台：站在範圍「外」持續扣血
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const rr = h.r + p.radius;
        if (dx * dx + dy * dy > rr * rr) {
          if (p.takeDamage(h.dmg)) game.particles.createHurtText(p.x, p.y, h.dmg);
        }
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'mine' || h.kind === 'geyser') {
      if (h.t >= h.fuse) {
        explodeHazard(game, h);
        game.hazards.splice(i, 1);
      }
    }
  }
}

export function spawnHazard(game, mech) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 260 + Math.random() * 170;
  const b = GAME_CONFIG.WORLD_BOUNDS;
  const m = 60;
  const x = Math.max(b.minX + m, Math.min(b.maxX - m, game.player.x + Math.cos(angle) * dist));
  const y = Math.max(b.minY + m, Math.min(b.maxY - m, game.player.y + Math.sin(angle) * dist));

  if (mech.type === 'supply') {
    game.dropItems.push(new DropItem(x, y, 'SUPPLY'));
    game.particles.createShockwave(x, y, 70, '#ffb703');
    sound.playEvoFanfare();
    return;
  }
  game.hazards.push({
    kind: mech.type,
    x, y,
    r: mech.radius,
    color: mech.color,
    t: 0,
    tick: 0.5,
    fuse: mech.fuse || 0,
    dur: mech.dur || mech.duration || 0,
    dmg: mech.dmg || 0,
    dmgEnemy: mech.dmgEnemy || 0,
  });
}

export function explodeHazard(game, h) {
  sound.playExplosion(h.x);
  game.camera.shake = Math.max(game.camera.shake, 9);
  game.particles.createExplosion(h.x, h.y, h.r, h.kind === 'geyser');
  game.particles.createShockwave(h.x, h.y, h.r, h.color);
  // 地雷/噴發地面焦痕
  game.addDecal(h.x, h.y, h.r * 0.9, FX.scorch.fill, FX.scorch.a, hexToRgba(h.color, 0.45), FX.decalLife + 2);

  const rr = h.r;
  for (const e of game.enemies) {
    if (e.isDead) continue;
    const dx = e.x - h.x;
    const dy = e.y - h.y;
    if (dx * dx + dy * dy < (rr + e.radius) * (rr + e.radius)) {
      e.takeDamage(h.dmgEnemy, 6, h.x, h.y);
    }
  }
  const pd = Math.hypot(game.player.x - h.x, game.player.y - h.y);
  if (pd < rr + game.player.radius) game.player.takeDamage(h.dmg);
}

export function drawHazards(game, cam) {
  const ctx = game.ctx;
  for (const h of game.hazards) {
    const sx = h.x - cam.x;
    const sy = h.y - cam.y;
    const margin = h.r + 60;
    if (sx < -margin || sx > game.vw + margin || sy < -margin || sy > game.vh + margin) continue;

    ctx.save();
    ctx.translate(sx, sy);
    if (h.kind === 'pool') {
      // 毒霧池：鼓動的半透明毒圈 (出現/消失前淡入淡出)
      const wob = 1 + Math.sin(h.t * 3.2 + h.x) * 0.04;
      const fadeIn = Math.min(1, h.t / 0.4);
      const fadeOut = Math.min(1, (h.dur - h.t) / 0.5);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      ctx.globalAlpha = alpha;
      const g = ctx.createRadialGradient(0, 0, h.r * 0.15, 0, 0, h.r * wob);
      g.addColorStop(0, hexToRgba(h.color, 0.38));
      g.addColorStop(1, hexToRgba(h.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(h.color, 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
      ctx.stroke();
    } else if (h.kind === 'mine' || h.kind === 'geyser') {
      // 地雷/噴發：倒數警示 (Soulstone 風格刻紋圓陣：旋轉虛線外環 + 內縮實圈 + 輻條)
      const prog = Math.min(1, h.t / h.fuse); // 0→1 越接近引爆
      const R = h.r * (1.3 - prog * 0.3);
      ctx.strokeStyle = h.color;
      // 外環旋轉虛線
      ctx.globalAlpha = 0.25 + prog * 0.4;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 9]);
      ctx.lineDashOffset = -h.t * 40;
      ctx.beginPath();
      ctx.arc(0, 0, R + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 內縮主警示圈
      ctx.globalAlpha = 0.4 + prog * 0.5;
      ctx.lineWidth = 3 + prog * 2;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      // 8 支輻條
      ctx.globalAlpha = 0.2 + prog * 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + h.t * 1.2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ctx.moveTo(ca * (R + 18), sa * (R + 18));
        ctx.lineTo(ca * (R + 24 + prog * 4), sa * (R + 24 + prog * 4));
      }
      ctx.stroke();
      // 中央核心點 (越接近越亮越大)
      ctx.fillStyle = h.color;
      ctx.globalAlpha = 0.5 + prog * 0.4;
      ctx.shadowColor = h.color;
      ctx.shadowBlur = 10 + prog * 10;
      ctx.beginPath();
      ctx.arc(0, 0, 5 + prog * 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (h.kind === 'safeZone') {
      // 安全高台：亮綠色光圈，站裡面才安全
      const wob = 1 + Math.sin(h.t * 2.5) * 0.03;
      const fadeIn = Math.min(1, h.t / 0.5);
      const fadeOut = Math.min(1, (h.dur - h.t) / 0.6);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
      ctx.stroke();
      // 內部安全光暈
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.r * wob);
      g.addColorStop(0, 'rgba(0,230,118,0.12)');
      g.addColorStop(1, 'rgba(0,230,118,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 縮圈結界 (深淵無盡戰)
  if (game._shrinkCircle) {
    const sc = game._shrinkCircle;
    const mechs = (game.level || LEVELS.street).mechs || [];
    const scMech = mechs.find((m) => m.type === 'shrinkCircle');
    if (scMech) {
      ctx.save();
      const cx = 0 - cam.x;
      const cy = 0 - cam.y;
      // 圈外半透明紫霧
      ctx.fillStyle = 'rgba(120,50,255,0.06)';
      ctx.beginPath();
      ctx.rect(0, 0, game.vw, game.vh);
      ctx.arc(cx, cy, sc.radius, 0, Math.PI * 2, true);
      ctx.fill();
      // 圈邊緣
      ctx.strokeStyle = scMech.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + Math.sin(game.gameTime * 2) * 0.15;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -game.gameTime * 30;
      ctx.beginPath();
      ctx.arc(cx, cy, sc.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}
