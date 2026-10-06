// 劍陣 —— 青霜劍尊 R 技「萬劍歸宗」的實體。
//
// 為什麼要有這一支：舊版的萬劍歸宗只是「一圈衝擊波 + 一次 300 範圍瞬傷」，
// 看起來跟獅子吼、血祭沒有差別 —— 但「萬劍歸宗」這個名字講的是劍陣本身：
// 飛劍插成一圈、劍陣旋轉把劍氣甩出去掃場、收招時萬劍往主人身上收攏。
//
// 傷害契約（tools/verify-sword-formation.mjs 會擋）：總量維持原本的 aoe(...,3)，
// 拆成「落地一擊 1.2×」＋「劍陣掃斬 6×0.3×」= 3.0×，不多也不少。
//
// 繪圖成本：劍與劍氣都是向量描邊（不是貼圖、也不是加色混合），刻意避開
// fill + globalCompositeOperation='lighter' 這條最貴的路 —— 那條是面板上
// 「加色混合」與「每幀塗抹倍率」兩個門檻的來源。劍的數量、劍氣同時存在的
// 上限都在這裡訂死，tools/perf-probe.mjs 的 sword 情境會量實際增加多少指令。

import { enemyScale } from '../levels.js';
import { drawFlyingSword } from '../entities/Mercenary.js';

export const FORMATION = {
  drop: 0.45,        // 飛劍落下的時間（插進地面）
  spinFor: 1.6,      // 劍陣旋轉掃場的時間
  gather: 0.35,      // 收招「歸宗」：萬劍往主人身上收攏
  swords: 12,        // 飛劍數（環繞一圈）
  ringR: 120,        // 劍陣半徑：劍插在玩家周圍這個距離
  sweepR: 300,       // 劍氣掃到的最外緣 = 技能原本的 aoe 半徑
  landMul: 1.2,      // 落地一擊的傷害倍率
  ticks: 6,          // 劍陣期間的掃斬次數
  tickMul: 0.3,      // 每一次掃斬的傷害倍率（1.2 + 6×0.3 = 3.0）
  tickKnock: 5,
  landKnock: 14,
  spin: 2.2,         // 環繞角速度 (rad/s)
  slashesPerTick: 4, // 每次掃斬甩出幾道劍氣
  slashLife: 0.7,    // 一道劍氣的存活時間（秒）
  MAX_SLASHES: 24,   // 同時存在的劍氣上限（超過就丟最舊的，避免累積）
};

export const FORMATION_COLOR = '#6ea8ff';

function enrageScale(game) {
  return enemyScale(game.gameTime, game.level, game.rules).hp;
}

// 以玩家為圓心的範圍傷害（沿用 Skills.js 的 aoe 語意：半徑吃敵人半徑）。
// 傷害全部結算，但傷害飄字只給最近的 MAX_TEXTS 隻 —— 這一招一場最多結算 7 次，
// 滿場 250 隻時每個人都印字會讓文字層（每幀 fillText × 存活字數）變成主要成本，
// 實測就是這個差別（見 perf-probe 的 sword 情境）。
const MAX_TEXTS = 10;
function aoe(game, radius, mul, knock) {
  const p = game.player;
  const dmg = Math.round(mul * 100 * enrageScale(game));
  const hits = [];
  for (const e of game.enemies) {
    if (e.isDead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > radius + e.radius) continue;
    e.takeDamage(dmg, knock, p.x, p.y);
    hits.push({ e, d });
  }
  hits.sort((a, b) => a.d - b.d);
  for (let i = 0; i < Math.min(hits.length, MAX_TEXTS); i++) {
    const e = hits[i].e;
    game.particles.createDamageText(e.x, e.y, dmg, false);
  }
  return hits.length;
}

// 落劍：先插一圈劍，再開始旋轉
export function spawnSwordFormation(game) {
  const p = game.player;
  if (!p) return null;
  const f = {
    x: p.x,
    y: p.y,
    t: 0,
    phase: 'drop',
    tick: 0,
    tickEvery: FORMATION.spinFor / FORMATION.ticks,
    slashSeed: Math.random() * Math.PI * 2,           // 每次施放的劍氣方位都不同
    slashes: [],
    swords: [],
  };
  for (let i = 0; i < FORMATION.swords; i++) {
    const a = (i / FORMATION.swords) * Math.PI * 2 + Math.random() * 0.12;
    f.swords.push({
      a0: a,
      // 落劍有先後：從外圈依序插下，不是一次全部出現
      delay: (i / FORMATION.swords) * FORMATION.drop * 0.7,
      landed: false,
    });
  }
  game.swordFormation = f;
  game.camera.shake = Math.max(game.camera.shake, 8);
  // 落地一擊：萬劍插地的瞬間就該有重量
  aoe(game, FORMATION.sweepR, FORMATION.landMul, FORMATION.landKnock);
  game.particles.createShockwave(p.x, p.y, FORMATION.ringR * 1.6, '#e8f0ff');
  return f;
}

export function clearSwordFormation(game) {
  game.swordFormation = null;
}

export function updateSwordFormation(game, dt) {
  const f = game.swordFormation;
  if (!f) return;
  const p = game.player;
  f.t += dt;

  // 劍陣跟著主人走（但不完全黏死：主人衝出去時劍陣會稍微落後，才像真的插在地上）
  const follow = 1 - Math.pow(0.001, dt);
  f.x += (p.x - f.x) * follow;
  f.y += (p.y - f.y) * follow;

  if (f.phase === 'drop') {
    for (const s of f.swords) {
      if (s.landed || f.t < s.delay) continue;
      s.landed = true;
      const sx = f.x + Math.cos(s.a0) * FORMATION.ringR;
      const sy = f.y + Math.sin(s.a0) * FORMATION.ringR;
      game.particles.createShockwave(sx, sy, 26, FORMATION_COLOR);
    }
    if (f.t >= FORMATION.drop) f.phase = 'spin';
    return;
  }

  if (f.phase === 'spin') {
    // 掃斬：以固定節奏結算傷害 + 甩出劍氣。
    // 用「已旋轉時間」推哪幾刀該出，而不是每次減一個 tickTimer 的倒數 ——
    // dt 累加會有浮點殘差（1/60 減 16 次會停在 1.4e-17），倒數版本每刀會多吃一幀，
    // 六刀就塞不進 1.6 秒的窗口，實際只結算到五刀（實測踩過）。
    const spinT = f.t - FORMATION.drop;
    while (f.tick < FORMATION.ticks && spinT >= (f.tick + 1) * f.tickEvery - 1e-6) {
      f.tick++;
      aoe(game, FORMATION.sweepR, FORMATION.tickMul, FORMATION.tickKnock);
      for (let i = 0; i < FORMATION.slashesPerTick; i++) {
        const a = f.slashSeed + f.tick * 1.1 + (i / FORMATION.slashesPerTick) * (Math.PI * 2 / FORMATION.slashesPerTick);
        f.slashes.push({ a0: a, t: 0, dir: i % 2 ? -1 : 1 });
        if (f.slashes.length > FORMATION.MAX_SLASHES) f.slashes.shift();
      }
    }
    if (spinT >= FORMATION.spinFor) {
      f.phase = 'gather';
      f.gatherT = 0;
    }
  }

  // 劍氣前進與過期（三種階段都要推進，收招時地上殘留的劍氣才會自己散掉）
  for (let i = f.slashes.length - 1; i >= 0; i--) {
    const s = f.slashes[i];
    s.t += dt;
    if (s.t >= FORMATION.slashLife) f.slashes.splice(i, 1);
  }

  if (f.phase === 'gather') {
    f.gatherT += dt;
    if (f.gatherT >= FORMATION.gather) {
      game.particles.createShockwave(p.x, p.y, 90, FORMATION_COLOR);
      clearSwordFormation(game);
    }
  }
}

// 一支劍的當下位置（世界座標）：落劍 → 環繞 → 歸宗收攏
function swordPos(f, s, t) {
  const spinT = Math.max(0, t - FORMATION.drop);
  const a = s.a0 + spinT * FORMATION.spin;
  if (f.phase === 'gather') {
    const k = Math.min(1, (f.gatherT || 0) / FORMATION.gather);
    const r = FORMATION.ringR * (1 - k);
    return {
      x: f.x + Math.cos(a) * r,
      y: f.y + Math.sin(a) * r,
      ang: a + Math.PI / 2,
      alpha: 1 - k,
      r,
    };
  }
  if (t < s.delay) {
    // 還在半空中：從上方掉下來（y 位移 + 淡入）
    const k = Math.max(0, (t - s.delay + 0.28) / 0.28);
    return { x: f.x + Math.cos(s.a0) * FORMATION.ringR, y: f.y + Math.sin(s.a0) * FORMATION.ringR - 260 * (1 - k), ang: Math.PI / 2, alpha: k, r: FORMATION.ringR };
  }
  return { x: f.x + Math.cos(a) * FORMATION.ringR, y: f.y + Math.sin(a) * FORMATION.ringR, ang: a + Math.PI / 2, alpha: 1, r: FORMATION.ringR };
}

export function drawSwordFormation(ctx, camera, game) {
  const f = game.swordFormation;
  if (!f) return;
  const sx = f.x - camera.x;
  const sy = f.y - camera.y;
  const calm = game.particles?.reduceFlash ? 0.5 : 1;   // 減少閃光的顯示設定：劍氣減半
  const fade = f.phase === 'gather' ? Math.max(0, 1 - (f.gatherT || 0) / FORMATION.gather) : 1;

  ctx.save();

  // 1) 劍氣：從劍陣外緣往外甩的弧線，越外圈越淡（貼近參考圖那種一圈圈掃出去的軌跡）
  // 三層描邊 = 柔光 + 劍氣本體 + 白亮核心，看起來才像一道「甩出去的劍光」而不是一條線
  if (f.slashes.length) {
    ctx.lineCap = 'round';
    for (const s of f.slashes) {
      const k = s.t / FORMATION.slashLife;
      const ease = 1 - Math.pow(1 - k, 2);
      const r = FORMATION.ringR + (FORMATION.sweepR - FORMATION.ringR) * ease;
      const a = s.a0 + s.dir * ease * 0.9;
      const span = 0.9 * (1 - k * 0.3);
      const alpha = (1 - k) * 0.9 * fade * calm;
      const taper = 1 - k * 0.45;
      ctx.strokeStyle = FORMATION_COLOR;
      ctx.globalAlpha = alpha * 0.32;
      ctx.lineWidth = 15 * taper;
      ctx.beginPath();
      ctx.arc(sx, sy, r, a - span / 2, a + span / 2);
      ctx.stroke();

      ctx.globalAlpha = alpha * 0.8;
      ctx.lineWidth = 6.5 * taper;
      ctx.beginPath();
      ctx.arc(sx, sy, r, a - span * 0.45, a + span * 0.45);
      ctx.stroke();

      // 劍尖的亮線（同一道劍氣的中心）
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#eaf4ff';
      ctx.lineWidth = 2.4 * taper;
      ctx.beginPath();
      ctx.arc(sx, sy, r, a - span * 0.26, a + span * 0.26);
      ctx.stroke();
    }
  }

  // 2) 劍陣環：地面上的一圈細環，標出劍插在哪（也是「陣」的視覺依據）
  if (f.phase !== 'gather') {
    ctx.globalAlpha = 0.28 * fade;
    ctx.strokeStyle = FORMATION_COLOR;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(sx, sy, FORMATION.ringR, 0, Math.PI * 2);
    ctx.stroke();
    const spin = (f.t * FORMATION.spin) % (Math.PI * 2);
    ctx.globalAlpha = 0.5 * fade;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(sx, sy, FORMATION.ringR, spin, spin + 0.9);
    ctx.stroke();
  }

  // 3) 飛劍：同一支本命飛劍的畫法（與傭兵共用），沿著切線指向
  const sprite = getSwordSprite();
  for (const s of f.swords) {
    const pos = swordPos(f, s, f.t);
    if (pos.alpha <= 0.02) continue;
    ctx.globalAlpha = pos.alpha * fade;
    ctx.save();
    ctx.translate(pos.x - camera.x, pos.y - camera.y);
    ctx.rotate(pos.ang);
    ctx.drawImage(sprite.c, -sprite.half, -sprite.half, sprite.half * 2, sprite.half * 2);
    ctx.restore();
  }

  ctx.restore();
}

// 飛劍貼圖只烘焙一次。為什麼不直接呼叫 drawFlyingSword：
//   1. 它內含 shadowBlur（即時陰影），12 把劍每幀各畫一次是純浪費 —— 烘焙後每把劍
//      只剩一次 drawImage，跟角色 sprite 走同一條最便宜的路。
//   2. 它自己會改 globalAlpha（劍脊與劍柄用固定值），外層的淡出會被它蓋掉，
//      收招「歸宗」時劍柄會留在畫面上不會淡出。
const SWORD_K = 1.35;      // 劍的視覺大小倍率
const SWORD_HALF = 26;     // 以原點為中心的方形貼圖半寬（含劍穗與劍光）
let swordSprite = null;

function getSwordSprite() {
  if (swordSprite) return swordSprite;
  const S = 2;   // 與 sprites.js 同一套超取樣概念：先畫大的，再交給 canvas 縮
  const c = document.createElement('canvas');
  const size = Math.round(SWORD_HALF * 2 * SWORD_K * S);
  c.width = size;
  c.height = size;
  const x = c.getContext('2d');
  x.scale(SWORD_K * S, SWORD_K * S);
  x.translate(SWORD_HALF, SWORD_HALF);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  drawFlyingSword(x, 1, FORMATION_COLOR, 0.85);
  swordSprite = { c, half: SWORD_HALF };
  return swordSprite;
}

// 給測試用的契約：總傷害倍率（＝落地一擊 + 掃斬次數 × 單次倍率）
export function formationTotalMul() {
  return FORMATION.landMul + FORMATION.ticks * FORMATION.tickMul;
}
