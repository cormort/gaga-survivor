// 地形機制與可引爆物件（油桶／載具／木箱／毒霧池／地雷／噴發口／縮圈…）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 450 行，而且與戰鬥／進程系統幾乎無關 ——
// 只透過 game 物件讀寫「機制計時器、機制實例、粒子、玩家、敵人、關卡資料」。
// 這裡刻意不採用「把狀態綁到模組實例」的作法，而是把 game 明確當成第一個參數：
// 依賴關係直接寫在簽章上，模組本身不持有任何遊戲狀態。
//
// 呼叫端：main.js 以 hazards.updateHazards(this, dt) 這種形式呼叫；
// 外部（例如 WeaponManager 的爆炸波及木箱）則走 Game 上的同名薄包裝。

import { GAME_CONFIG, FX, worldBounds, isWorldBounded } from '../config.js';
import { LEVELS } from '../levels.js';
import { onPath } from '../tdlevels.js';
import { DropItem, DestructibleCrate } from '../entities/DropItem.js';
import { JEWEL_DROP, rollJewel } from '../jewels.js';
import { sound } from '../audio.js';

// '#rrggbb' + alpha → 'rgba(...)'（原本是 main.js 的模組層函式，只有這裡在用）
function hexToRgba(hex, a) {
  if (!hex || !hex.startsWith('#')) return `rgba(255,255,255,${a})`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 會改變移動速度的地形 (玩家與敵人生效) → 預設倍率
const SPEED_ZONES = {
  tar: 0.55,
  gale: 1.45,
  lava: 0.85,
  quicksand: 0.38,
  sanctuary: 0.65, // 敵人踏入聖域受到神聖斥力減速
};

function defaultHazardColor(type) {
  switch (type) {
    case 'lava': return '#ff3c00';
    case 'quicksand': return '#d4a373';
    case 'electro': return '#00e5ff';
    case 'sanctuary': return '#ffd700';
    case 'tar': return '#3d2b1f';
    case 'spring': return '#4cc9f0';
    case 'gale': return '#ffffff';
    default: return '#ffaa00';
  }
}

function defaultHazardSource(type) {
  switch (type) {
    case 'lava': return '熔岩灼燒';
    case 'quicksand': return '流沙陷阱';
    case 'electro': return '感應過載';
    case 'sanctuary': return '聖域靈氣';
    case 'pool': return '地面毒池';
    default: return null;
  }
}

// 無限地圖的場景物件（油桶／車輛、木箱）：沒有固定的世界範圍可以撒，改成撒在玩家周圍的環帶，
// 離太遠就回收、數量不足就在畫面外補 —— 場上數量固定，密度與原本 4000×4000 的地圖相當
const SCENERY_RING_MAX = 2000;   // 環帶外徑
const SCENERY_FAR = 2600;        // 超過就回收
const SCENERY_OFFSCREEN = 700;   // 遊戲中補充時的內徑（畫面外）
const EXPLODABLE_COUNT = 14;

function ringSpot(game, minD) {
  const p = game.player || { x: 0, y: 0 };
  const a = Math.random() * Math.PI * 2;
  // 面積均勻：半徑取 sqrt 分佈
  const r = Math.sqrt(minD * minD + Math.random() * (SCENERY_RING_MAX * SCENERY_RING_MAX - minD * minD));
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
}

export function initExplodableProps(game) {
  game.explodableProps = [];
  for (let i = 0; i < EXPLODABLE_COUNT; i++) spawnExplodableProp(game, 320);
}

function spawnExplodableProp(game, minD) {
  const types = ['tank', 'car', 'hazard'];
  let px = 0, py = 0;
  if (!isWorldBounded()) {
    ({ x: px, y: py } = ringSpot(game, minD));
  } else {
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    let tries = 0;
    do {
      px = bounds.minX + 250 + Math.random() * (bounds.maxX - bounds.minX - 500);
      py = bounds.minY + 250 + Math.random() * (bounds.maxY - bounds.minY - 500);
      tries++;
    } while ((Math.hypot(px, py) < minD || onPath(game.level, px, py, 32)) && tries < 40);   // 守塔：不擺在路上
  }

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
  if (playerDist < blastR && game.player.takeDamage(12, '場景爆炸')) {
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

// minD：離玩家至少多遠（開局 200；無限地圖遊戲中補充時傳畫面外的距離）
export function spawnSingleDestructible(game, minD = 200) {
  let px = 0, py = 0;
  if (!isWorldBounded()) {
    ({ x: px, y: py } = ringSpot(game, minD));
  } else {
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    let tries = 0;
    do {
      px = bounds.minX + 160 + Math.random() * (bounds.maxX - bounds.minX - 320);
      py = bounds.minY + 160 + Math.random() * (bounds.maxY - bounds.minY - 320);
      tries++;
    } while (((game.player && Math.hypot(px - game.player.x, py - game.player.y) < minD) || onPath(game.level, px, py, 24)) && tries < 40);   // 守塔：不擺在路上
  }

  const kind = Math.random() < 0.65 ? 'crate' : 'barrel';
  game.destructibles.push(new DestructibleCrate(px, py, kind));
}

// 無限地圖：回收離玩家太遠的場景物件，並在畫面外補回可引爆物（木箱由 main.js 的補充邏輯補）
export function recycleScenery(game) {
  if (isWorldBounded()) return;
  const p = game.player;
  const far2 = SCENERY_FAR * SCENERY_FAR;
  const near = (o) => (o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) <= far2;
  game.explodableProps = game.explodableProps.filter(near);
  game.destructibles = game.destructibles.filter(near);
  while (game.explodableProps.length < EXPLODABLE_COUNT) spawnExplodableProp(game, SCENERY_OFFSCREEN);
}

export function sceneryRespawnDist() {
  return isWorldBounded() ? 200 : SCENERY_OFFSCREEN;
}

export function dropCrateLoot(game, x, y, kind = 'crate') {
  // 額外機率掉一顆珠寶（不佔下面的掉落表）
  if (Math.random() < JEWEL_DROP.crate) game.dropItems.push(new DropItem(x + 14, y - 10, 'JEWEL', rollJewel()));
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
          if (p.takeDamage(mech.dmg, '毒圈收縮')) game.particles.createHurtText(p.x, p.y, mech.dmg);
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
          if (p.takeDamage(h.dmg, h.source || '地面毒池')) game.particles.createHurtText(p.x, p.y, h.dmg);
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
          if (p.takeDamage(h.dmg, '安全區外')) game.particles.createHurtText(p.x, p.y, h.dmg);
        }
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'mine' || h.kind === 'geyser') {
      // 延遲的追蹤落點 (天劫三重雷)：預警開始前 (t < 0) 一直貼著特工
      if (h.follow && h.t < 0) {
        h.x = p.x;
        h.y = p.y;
      }
      if (h.t >= h.fuse) {
        explodeHazard(game, h);
        game.hazards.splice(i, 1);
      }
    } else if (h.kind === 'spring') {
      // 回復泉：站在裡面持續回血，逼玩家在「去喝水」與「維持走位」之間取捨
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        if (dx * dx + dy * dy < h.r * h.r && p.hp < p.maxHp) p.heal(h.heal);
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'lava') {
      // 熔岩裂隙：踏入持續受灼燒傷害，對敵人也是高額傷害殺傷區
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const rr = h.r + p.radius;
        if (dx * dx + dy * dy < rr * rr) {
          if (p.takeDamage(h.dmg, h.source || '熔岩灼燒')) {
            game.particles.createHurtText(p.x, p.y, h.dmg);
            game.particles.createHitSpark(p.x, p.y, '#ff4500');
          }
        }
        if (h.dmgEnemy > 0) {
          const hrr = h.r;
          for (const e of game.enemies) {
            if (e.isDead) continue;
            const edx = e.x - h.x;
            const edy = e.y - h.y;
            const err = hrr + e.radius;
            if (edx * edx + edy * edy < err * err) {
              e.takeDamage(h.dmgEnemy, 2, h.x, h.y);
              game.particles.createDamageText(e.x, e.y, Math.round(h.dmgEnemy), false);
              if (Math.random() < 0.25) game.particles.createHitSpark(e.x, e.y, '#ff6600');
            }
          }
        }
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'quicksand') {
      // 流沙泥濘：強烈向心牽引力（玩家與一般敵人均受牽引）
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      const dist = Math.hypot(dx, dy);
      if (dist < h.r && dist > 1) {
        const pull = (1 - dist / h.r) * (h.pullSpeed || 55) * dt;
        p.x -= (dx / dist) * pull;
        p.y -= (dy / dist) * pull;
      }
      for (const e of game.enemies) {
        if (e.isDead || e.isBoss) continue;
        const edx = e.x - h.x;
        const edy = e.y - h.y;
        const edist = Math.hypot(edx, edy);
        if (edist < h.r && edist > 1) {
          const epull = (1 - edist / h.r) * ((h.pullSpeed || 55) * 1.1) * dt;
          e.x -= (edx / edist) * epull;
          e.y -= (edy / edist) * epull;
        }
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'electro') {
      // 雷暴過載電場：週期性放電震撼
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = h.dischargeInterval || 1.2;
        sound.playLightning();
        game.camera.shake = Math.max(game.camera.shake, 4);
        game.particles.createShockwave(h.x, h.y, h.r, '#00e5ff');
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const rr = h.r + p.radius;
        if (dx * dx + dy * dy < rr * rr) {
          if (h.dmg > 0 && p.takeDamage(h.dmg, h.source || '感應過載')) {
            game.particles.createHurtText(p.x, p.y, h.dmg);
          }
        }
        if (h.dmgEnemy > 0) {
          const hrr = h.r;
          for (const e of game.enemies) {
            if (e.isDead) continue;
            const edx = e.x - h.x;
            const edy = e.y - h.y;
            const err = hrr + e.radius;
            if (edx * edx + edy * edy < err * err) {
              e.takeDamage(h.dmgEnemy, 4, h.x, h.y);
              e.stunTimer = Math.max(e.stunTimer || 0, 0.35);
              game.particles.createDamageText(e.x, e.y, Math.round(h.dmgEnemy), false);
              game.particles.createHitSpark(e.x, e.y, '#00ffff');
            }
          }
        }
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'sanctuary') {
      // 聖域靈氣陣：陣內玩家獲得 40% 減傷庇護與每 0.5s 回血，敵人受到神聖壓制與斥力
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      const rr = h.r + p.radius;
      if (dx * dx + dy * dy < rr * rr) {
        p.sanctuaryTimer = 0.25;
        p.sanctuaryResist = h.resist || 0.40;
      }
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        if (dx * dx + dy * dy < rr * rr && p.hp < p.maxHp) {
          p.heal(h.heal || 3);
          game.particles.createHitSpark(p.x, p.y, '#ffd700');
        }
        if (h.dmgEnemy > 0) {
          const hrr = h.r;
          for (const e of game.enemies) {
            if (e.isDead) continue;
            const edx = e.x - h.x;
            const edy = e.y - h.y;
            const err = hrr + e.radius;
            if (edx * edx + edy * edy < err * err) {
              e.takeDamage(h.dmgEnemy, 2, h.x, h.y);
              game.particles.createDamageText(e.x, e.y, Math.round(h.dmgEnemy), false);
              game.particles.createHitSpark(e.x, e.y, '#ffe066');
            }
          }
        }
      }
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    } else if (h.kind === 'tar' || h.kind === 'gale') {
      if (h.t >= h.dur) game.hazards.splice(i, 1);
    }
  }

  applySpeedZones(game);
}

// 泥沼減速／疾風加速：每幀重算玩家與敵人的地形速度倍率 (多區重疊時相乘)。
// ponytail: 區域數 × 敵人數的 O(n·m) 掃描；區域同時最多個位數，250 隻怪可接受
function applySpeedZones(game) {
  const zones = game.hazards.filter((h) => h.speedMul);
  if (!zones.length && !game._speedZonesActive) return;
  game._speedZonesActive = zones.length > 0;
  const mulAt = (x, y, r, isPlayer) => {
    let m = 1;
    for (const z of zones) {
      if (z.kind === 'sanctuary' && isPlayer) continue; // 玩家在聖域不被減速
      const dx = x - z.x;
      const dy = y - z.y;
      const rr = z.r + r * 0.5;
      if (dx * dx + dy * dy < rr * rr) m *= z.speedMul;
    }
    return m;
  };
  const p = game.player;
  p.terrainSpeedMul = mulAt(p.x, p.y, p.radius, true);
  for (const e of game.enemies) {
    if (!e.isDead) e.terrainSpeedMul = e.isBoss ? 1 : mulAt(e.x, e.y, e.radius, false);
  }
}

export function spawnHazard(game, mech) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 260 + Math.random() * 170;
  const b = worldBounds();
  const m = 60;
  const x = Math.max(b.minX + m, Math.min(b.maxX - m, game.player.x + Math.cos(angle) * dist));
  const y = Math.max(b.minY + m, Math.min(b.maxY - m, game.player.y + Math.sin(angle) * dist));

  if (mech.type === 'supply') {
    game.dropItems.push(new DropItem(x, y, 'SUPPLY'));
    game.particles.createShockwave(x, y, 70, '#ffb703');
    sound.playEvoFanfare();
    return;
  }
  placeHazard(game, mech, x, y);
}

// 在指定位置放一個地面區域。關卡機制與敵人 (迫擊砲、焦油拖痕、死亡毒池) 共用這一條，
// 所以敵人造成的地形與關卡地形的判定、畫法、死亡結算來源完全一致。
export function placeHazard(game, mech, x, y) {
  const type = mech.type;
  game.hazards.push({
    kind: type,
    x, y,
    r: mech.radius,
    color: mech.color || defaultHazardColor(type),
    t: 0,
    tick: type === 'electro' ? (mech.dischargeInterval || 1.2) : 0.5,
    dischargeInterval: mech.dischargeInterval || 1.2,
    fuse: mech.fuse || 0,
    dur: mech.dur || mech.duration || 10,
    dmg: mech.dmg !== undefined ? mech.dmg : (type === 'lava' ? 6 : (type === 'electro' ? 4 : 0)),
    dmgEnemy: mech.dmgEnemy !== undefined ? mech.dmgEnemy : (type === 'lava' ? 80 : (type === 'electro' ? 140 : (type === 'sanctuary' ? 45 : 0))),
    heal: mech.heal !== undefined ? mech.heal : (type === 'sanctuary' ? 3 : (type === 'spring' ? 3 : 0)),
    resist: mech.resist !== undefined ? mech.resist : (type === 'sanctuary' ? 0.40 : 0),
    pullSpeed: mech.pullSpeed || 55,
    speedMul: SPEED_ZONES[type] ? (mech.speedMul || SPEED_ZONES[type]) : 0,
    source: mech.source || defaultHazardSource(type),
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
  for (const e of (h.dmgEnemy ? game.enemies : [])) {   // Boss 招式的落點不傷小怪
    if (e.isDead) continue;
    const dx = e.x - h.x;
    const dy = e.y - h.y;
    if (dx * dx + dy * dy < (rr + e.radius) * (rr + e.radius)) {
      e.takeDamage(h.dmgEnemy, 6, h.x, h.y);
    }
  }
  const pd = Math.hypot(game.player.x - h.x, game.player.y - h.y);
  if (pd < rr + game.player.radius) game.player.takeDamage(h.dmg, h.source || (h.kind === 'geyser' ? '地面噴發' : '地雷'));
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
      if (h.t < 0) { ctx.restore(); continue; }   // 尚未開始預警的延遲落點不畫
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
    } else if (h.kind === 'tar' || h.kind === 'spring' || h.kind === 'gale' ||
               h.kind === 'lava' || h.kind === 'quicksand' || h.kind === 'electro' || h.kind === 'sanctuary') {
      const fadeIn = Math.min(1, h.t / 0.4);
      const fadeOut = Math.min(1, (h.dur - h.t) / 0.6);
      ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
      if (h.kind === 'tar') {
        // 焦油泥沼：不透明的暗色黏液 + 冒泡，和半透明的毒池一眼分得出來
        ctx.fillStyle = hexToRgba(h.color, 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(h.color, 0.9);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 4; i++) {
          // 氣泡由小變大後破掉。x 取絕對值：負座標的 % 會是負數 → arc 半徑為負直接拋例外
          const ph = (h.t * 0.8 + i * 0.37 + (Math.abs(h.x) % 7) * 0.1) % 1;
          const a = i * 1.9 + h.x;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * h.r * 0.5, Math.sin(a) * h.r * 0.5, 2 + ph * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (h.kind === 'spring') {
        // 回復泉：往外擴散的水波 + 中央十字
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.r);
        g.addColorStop(0, hexToRgba(h.color, 0.32));
        g.addColorStop(1, hexToRgba(h.color, 0.04));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(h.color, 0.7);
        ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          const ph = (h.t * 0.6 + i * 0.5) % 1;
          ctx.beginPath();
          ctx.arc(0, 0, h.r * ph, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = hexToRgba(h.color, 0.9);
        ctx.fillRect(-3, -11, 6, 22);
        ctx.fillRect(-11, -3, 22, 6);
      } else if (h.kind === 'gale') {
        // 疾風帶：旋轉的虛線圈 + 三道流線，表示「進來會變快」
        ctx.strokeStyle = hexToRgba(h.color, 0.75);
        ctx.lineWidth = 2;
        ctx.setLineDash([16, 12]);
        ctx.lineDashOffset = -h.t * 60;
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = hexToRgba(h.color, 0.1);
        ctx.fill();
        ctx.rotate(h.t * 1.5);
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.arc(0, 0, h.r * 0.55, 0, 0.9);
          ctx.stroke();
        }
      } else if (h.kind === 'lava') {
        // 熔岩裂隙：暗色焦黑外緣 + 熱烈橙紅岩漿核心 + 浮動冒泡與焦痕裂縫
        const wob = 1 + Math.sin(h.t * 3.5 + Math.abs(h.x) % 10) * 0.03;
        const g = ctx.createRadialGradient(0, 0, Math.max(1, h.r * 0.2), 0, 0, Math.max(2, h.r * wob));
        g.addColorStop(0, 'rgba(255, 235, 150, 0.85)'); // 白熱核心
        g.addColorStop(0.35, hexToRgba(h.color || '#ff4500', 0.75)); // 熾熱橙紅
        g.addColorStop(0.75, 'rgba(180, 20, 0, 0.65)'); // 暗紅流體
        g.addColorStop(1, 'rgba(40, 10, 5, 0.15)'); // 焦黑邊緣
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const rPerturb = h.r * wob * (0.92 + ((Math.abs(Math.floor(h.x * 3 + i * 7)) % 10) / 10) * 0.12);
          const px = Math.cos(a) * rPerturb;
          const py = Math.sin(a) * rPerturb;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 120, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 內部熔岩火泡
        ctx.fillStyle = 'rgba(255, 240, 180, 0.85)';
        for (let i = 0; i < 5; i++) {
          const ph = (h.t * 1.1 + i * 0.23 + (Math.abs(Math.floor(h.x)) % 7) * 0.15) % 1;
          const a = i * 1.4 + h.x * 0.1;
          const dist = (0.2 + (i % 3) * 0.25) * h.r;
          const bx = Math.cos(a) * dist;
          const by = Math.sin(a) * dist;
          ctx.beginPath();
          ctx.arc(bx, by, Math.max(1, 2 + ph * 5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (h.kind === 'quicksand') {
        // 流沙泥濘陷阱：旋轉漏斗沙紋 + 內縮層次
        const spin = -h.t * 1.4;
        ctx.save();
        ctx.rotate(spin);
        // 沙色漸層
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, h.r));
        g.addColorStop(0, 'rgba(45, 25, 10, 0.85)'); // 中心深陷漏斗
        g.addColorStop(0.4, 'rgba(150, 105, 55, 0.7)'); // 流沙中層
        g.addColorStop(0.85, 'rgba(210, 165, 95, 0.55)'); // 外圈沙浪
        g.addColorStop(1, 'rgba(210, 165, 95, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.fill();

        // 螺旋流沙臂 (3條流動螺旋)
        ctx.strokeStyle = 'rgba(240, 200, 130, 0.45)';
        ctx.lineWidth = 2.5;
        for (let s = 0; s < 3; s++) {
          const baseA = (s / 3) * Math.PI * 2;
          ctx.beginPath();
          for (let step = 0; step <= 16; step++) {
            const tStep = step / 16;
            const curR = h.r * tStep;
            const curA = baseA + tStep * Math.PI * 1.6;
            const px = Math.cos(curA) * curR;
            const py = Math.sin(curA) * curR;
            if (step === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();

        // 外框流沙波紋
        ctx.strokeStyle = 'rgba(160, 110, 60, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * 0.95, 0, Math.PI * 2);
        ctx.stroke();
      } else if (h.kind === 'electro') {
        // 雷暴過載電場：高壓電漿感應圈 + 閃爍雷電弧
        const dischargeProg = Math.max(0, Math.min(1, ((h.dischargeInterval || 1.2) - h.tick) / (h.dischargeInterval || 1.2)));
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, h.r));
        g.addColorStop(0, hexToRgba(h.color || '#00e5ff', 0.25 + dischargeProg * 0.25));
        g.addColorStop(0.7, hexToRgba(h.color || '#00e5ff', 0.12));
        g.addColorStop(1, hexToRgba(h.color || '#00e5ff', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.fill();

        // 外圈高壓電極環 (旋轉虛線)
        ctx.strokeStyle = h.color || '#00e5ff';
        ctx.lineWidth = 2.5 + dischargeProg * 2;
        ctx.setLineDash([12, 10]);
        ctx.lineDashOffset = -h.t * 75;
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 電弧 (隨機折線)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = h.color || '#00e5ff';
        ctx.shadowBlur = 10;
        const arcCount = 3 + Math.floor((Math.abs(Math.floor(h.x)) + Math.floor(h.t * 20)) % 3);
        for (let aIdx = 0; aIdx < arcCount; aIdx++) {
          const aAngle = (aIdx / arcCount) * Math.PI * 2 + (h.t * 2.5);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          for (let seg = 1; seg <= 3; seg++) {
            const segDist = (h.r * 0.85) * (seg / 3);
            const jitter = Math.sin(h.t * 40 + aIdx * 10 + seg) * 18;
            const curA = aAngle + (jitter * Math.PI / 180);
            const cx = Math.cos(curA) * segDist;
            const cy = Math.sin(curA) * segDist;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // 中心能量球
        ctx.fillStyle = dischargeProg > 0.8 ? '#ffffff' : (h.color || '#00e5ff');
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1, 6 + dischargeProg * 10), 0, Math.PI * 2);
        ctx.fill();
      } else if (h.kind === 'sanctuary') {
        // 聖域靈氣陣：燦金八芒符文星陣 + 神聖光柱脈衝
        const rot = h.t * 0.4;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, h.r));
        g.addColorStop(0, 'rgba(255, 235, 140, 0.45)');
        g.addColorStop(0.6, 'rgba(255, 215, 0, 0.20)');
        g.addColorStop(1, 'rgba(255, 215, 0, 0.02)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.rotate(rot);
        // 外環符文細圈
        ctx.strokeStyle = 'rgba(255, 220, 100, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * 0.78, 0, Math.PI * 2);
        ctx.stroke();

        // 內嵌八角星 (兩個交錯正方形)
        ctx.strokeStyle = 'rgba(255, 240, 170, 0.65)';
        ctx.lineWidth = 2;
        const starR = h.r * 0.65;
        for (let sq = 0; sq < 2; sq++) {
          ctx.save();
          ctx.rotate((sq * Math.PI) / 4);
          ctx.strokeRect(-starR * 0.7, -starR * 0.7, starR * 1.4, starR * 1.4);
          ctx.restore();
        }
        ctx.restore();

        // 8 點向外浮動的聖光粒子
        ctx.fillStyle = 'rgba(255, 255, 220, 0.85)';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + rot * 0.5;
          const ph = (h.t * 0.6 + i * 0.125) % 1;
          const pr = h.r * (0.2 + ph * 0.7);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * pr, Math.sin(a) * pr, Math.max(1, 2 + (1 - ph) * 2.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
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
