// 修仙六脈的專屬技能演出（青霜劍尊的劍陣在 SwordFormation.js，那支的環繞/掃斬
// 邏輯比較特殊，獨立一支；其餘五脈共用這裡的 SignatureFX）。
//
// 為什麼要有這一支：五脈的大招原本都只是「粒子系統的爆炸/落雷/衝擊波」——
// 六位角色放起大招來長得一模一樣，看不出赤符天師、紫霄雷君、九轉丹君的分別。
//
// 兩條規矩：
//   1. 傷害一個字都不改（除了九天雷劫改成依序落下，總量仍是 12 × 2.2×）。
//      演出是加在原本的傷害之外的「看得見的那一半」，不是重新平衡。
//      驗證工具 tools/verify-signature-fx.mjs 會逐一比對每一次結算的倍率與半徑。
//   2. 繪圖一律向量描邊／畫弧，不用加色混合（加色混合是面板上最貴的一格），
//      而且每個效果都有存活時間上限，時間到就自己消失，不會累積。
//   3. 地面上的東西（火池、血霧、蓮花、音波、丹爐）畫在敵人與角色「之下」
//      （main.js 呼叫時傳 'ground'），上半部（火舌、雷柱、金丹、佛光、血氣、金鐘罩）
//      畫在最上層。全部擠在最上層時，五個火池會把敵人也染成橘色。
//
// 成本（perf-probe 的量測方式，250 敵人）：mobs 706 繪圖指令 → 五種演出「同時」
// 掛在場上的天花板 1396（+690，加色混合仍為 0，塗抹倍率 +1.0）；實戰一次只有一招。

import { enemyScale } from '../levels.js';

const MAX_TEXTS = 10;   // 傷害飄字只印最近的 N 隻（與劍陣同一條規矩）

export const SIG = {
  // 赤符天師・天火燎原：五道符紙落地成符火陣
  fire: { life: 3.0, radius: 150 },
  // 紫霄雷君・九天雷劫：雷雲聚頂，12 道落雷依序打下
  thunder: { life: 1.9, cloud: 1.1, strikes: 12, stagger: 0.04, radius: 50, mul: 2.2, stun: 1.5, knock: 6 },
  // 九轉丹君・九轉金丹：丹爐現形、九顆金丹繞行上升
  pill: { life: 2.2, forge: 0.5, pills: 9 },
  // 金剛尊者・獅子吼：佛光輪現、三圈音波擴散
  lion: { life: 1.2, radius: 280 },
  // 血蓮魔姬・血魔化身：血霧爆開、血蓮綻放，化身期間血氣纏身
  blood: { life: 8.0, bloom: 1.2, radius: 240 },
  // 金剛罩（Q）：護盾期間的鐘形金罩，跟著角色走
  dome: { life: 0 },
};

export const SIG_COLOR = {
  fire: '#ff6b5e',
  fireHot: '#ffb057',
  thunder: '#dfe6ff',
  thunderCore: '#b9c8ff',
  pill: '#3ddc84',
  pillGold: '#ffd166',
  lion: '#ffd166',
  lionCore: '#fff3c4',
  blood: '#b388ff',
  bloodDeep: '#ff0055',
  dome: '#ffd166',
};

function scaleHp(game) {
  return enemyScale(game.gameTime, game.level, game.rules).hp;
}

// 與 Skills.js 的 aoe 同一套語意（半徑吃敵人半徑）；傷害全部結算、飄字只給最近的幾隻
function aoe(game, x, y, radius, mul, { knock = 10, stun = 0 } = {}) {
  const dmg = Math.round(mul * 100 * scaleHp(game));
  const hits = [];
  for (const e of game.enemies) {
    if (e.isDead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > radius + e.radius) continue;
    e.takeDamage(dmg, knock, x, y);
    if (stun) e.applyStun(stun);
    hits.push({ e, d });
  }
  hits.sort((a, b) => a.d - b.d);
  for (let i = 0; i < Math.min(hits.length, MAX_TEXTS); i++) {
    game.particles.createDamageText(hits[i].e.x, hits[i].e.y, dmg, true);
  }
  return hits.length;
}

function nearest(game, n, range) {
  const p = game.player;
  return game.enemies
    .filter((e) => !e.isDead && Math.hypot(e.x - p.x, e.y - p.y) <= range)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
    .slice(0, n);
}

// 建立一個演出。f 就是狀態本身（t 是存活時間，其他欄位由各效果各自解讀）
export function spawnSignatureFX(game, kind, opts = {}) {
  const p = game.player;
  if (!p) return null;
  const f = { kind, t: 0, x: p.x, y: p.y, ...opts };
  if (kind === 'fire') {
    f.life = SIG.fire.life;
    f.seed = Math.random() * Math.PI * 2;
  } else if (kind === 'thunder') {
    f.life = SIG.thunder.life;
    f.cloudT = 0;
    // 目標在施放當下就鎖定（與舊版同一批敵人），只是依序打下
    f.targets = opts.targets || [];
    f.done = 0;
    f.bolts = [];
  } else if (kind === 'pill') {
    f.life = SIG.pill.life;
  } else if (kind === 'lion') {
    f.life = SIG.lion.life;
  } else if (kind === 'blood') {
    f.life = SIG.blood.life;
  }
  (game.signatureFX = game.signatureFX || []).push(f);
  return f;
}

export function clearSignatureFX(game) {
  if (game.signatureFX) game.signatureFX.length = 0;
}

export function updateSignatureFX(game, dt) {
  const list = game.signatureFX;
  if (!list || !list.length) return;
  const p = game.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    f.t += dt;

    if (f.kind === 'thunder') {
      // 雷雲先聚 0.35 秒，之後每 stagger 秒打下一道
      if (f.t >= 0.35 + f.done * SIG.thunder.stagger && f.done < f.targets.length) {
        const e = f.targets[f.done];
        f.done++;
        const tx = e && !e.isDead ? e.x : f.x;
        const ty = e && !e.isDead ? e.y : f.y;
        game.particles.createLightning(tx, ty, 60);
        aoe(game, tx, ty, SIG.thunder.radius, SIG.thunder.mul, { knock: SIG.thunder.knock, stun: SIG.thunder.stun });
        game.particles.createShockwave(tx, ty, SIG.thunder.radius, SIG_COLOR.thunder);
        f.bolts.push({ x: tx, y: ty, t: 0 });
      }
    } else if (f.kind === 'blood') {
      // 血氣纏身：跟著主人走（化身期間的視覺依據）
      f.x += (p.x - f.x) * (1 - Math.pow(0.002, dt));
      f.y += (p.y - f.y) * (1 - Math.pow(0.002, dt));
    }

    for (const b of f.bolts || []) b.t += dt;
    if (f.bolts) f.bolts = f.bolts.filter((b) => b.t < 0.42);

    if (f.t >= f.life) list.splice(i, 1);
  }
}

// ── 繪圖 ────────────────────────────────────────────────────────────
// 兩層：'ground' 畫在敵人與角色之下（地上的火池、血霧、蓮花、音波、丹爐），
// 'upper' 畫在最上面（火舌、雷柱、金丹、佛光輪、血氣、金鐘罩）。
// 為什麼要分：整塊畫在最上層時，五個火池的半透明橘色會把敵人一起染橘，
// 看不出誰站在火上 —— 地面效果本來就該在人物腳下。
export function drawSignatureFX(ctx, camera, game, layer = 'upper') {
  const list = game.signatureFX;
  const domeActive = game.player && (game.player.shieldPotionTimer || 0) > 0;
  if ((!list || !list.length) && !(domeActive && layer === 'upper')) return;

  ctx.save();
  if (list) for (const f of list) {
    const x = f.x - camera.x;
    const y = f.y - camera.y;
    if (f.kind === 'fire') drawFireRites(ctx, f, camera, layer);
    else if (f.kind === 'thunder') drawThunder(ctx, f, x, y, layer);
    else if (f.kind === 'pill') drawPillForge(ctx, f, x, y, layer);
    else if (f.kind === 'lion') drawLionHalo(ctx, f, x, y, layer);
    else if (f.kind === 'blood') drawBloodBloom(ctx, f, camera, layer);
  }
  // 金剛罩：護盾還在就畫（這是狀態，不是一次性演出）
  if (domeActive) drawDome(ctx, camera, game, layer);
  ctx.restore();
}

// 符火陣：每個落點一圈朱紅符環 + 符紙刻痕 + 幾束火舌
// 顏色刻意挑最暖的一組：街道地版本來就偏冷，用 #ff6b5e 這種紅只會被地面吃掉（實測看起來像土黃色）
function drawFireRites(ctx, f, camera, layer) {
  const fade = f.t < 0.25 ? f.t / 0.25 : Math.max(0, 1 - Math.max(0, f.t - (SIG.fire.life - 0.6)) / 0.6);
  for (const s of f.sites) {
    const x = s.x - camera.x;
    const y = s.y - camera.y;
    const r = SIG.fire.radius * 0.72;
    const spin = f.seed + s.a + f.t * 0.6;
    if (layer === 'upper') {
      // 火舌：三束大＋內層小，位置錯開一點才不會疊成一根
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + f.t * 1.1;
        const fx = x + Math.cos(a) * r * 0.42;
        const fy = y + Math.sin(a) * r * 0.42;
        const h = 30 + Math.sin(f.t * 9 + k) * 6;
        drawFlame(ctx, fx, fy, h, 0.5 * fade, SIG_COLOR.fireHot);
        drawFlame(ctx, fx + 3, fy, h * 0.6, 0.55 * fade, '#ffe08a');
      }
      continue;
    }
    // 燒紅的地面：兩層填色（外圈暗紅、內圈亮橙）——這是「這一塊在燒」最直接的視覺
    ctx.globalAlpha = 0.13 * fade;
    ctx.fillStyle = SIG_COLOR.fire;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.12 * fade;
    ctx.fillStyle = SIG_COLOR.fireHot;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // 符環
    ctx.globalAlpha = 0.45 * fade;
    ctx.strokeStyle = SIG_COLOR.fireHot;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(x, y, r, spin, spin + 1.0);
    ctx.stroke();
    // 符紙刻痕：一圈短刻線，像貼在火裡的符
    ctx.globalAlpha = 0.8 * fade;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = spin * 0.4 + (i / 8) * Math.PI * 2;
      ctx.moveTo(x + Math.cos(a) * (r - 11), y + Math.sin(a) * (r - 11));
      ctx.lineTo(x + Math.cos(a) * (r + 11), y + Math.sin(a) * (r + 11));
    }
    ctx.stroke();
    // 火舌：四束填色的火焰（比描邊的細線讀得清楚），內層再疊一層亮黃
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + f.t * 1.1;
      const fx = x + Math.cos(a) * r * 0.42;
      const fy = y + Math.sin(a) * r * 0.42;
      const h = 30 + Math.sin(f.t * 9 + k) * 6;
      drawFlame(ctx, fx, fy, h, 0.5 * fade, SIG_COLOR.fireHot);
      drawFlame(ctx, fx + 3, fy, h * 0.6, 0.55 * fade, '#ffe08a');
    }
  }
}

// 一束火焰：底寬、中段鼓起、尖端收攏。
// 用單一個 quadratic 畫出來會變成三角形（實測像三角錐），所以要兩段 bezier 做出葉形。
function drawFlame(ctx, x, y, h, alpha, color) {
  const w = h * 0.46;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.bezierCurveTo(x - w * 1.25, y - h * 0.42, x - w * 0.62, y - h * 0.78, x, y - h);
  ctx.bezierCurveTo(x + w * 0.62, y - h * 0.78, x + w * 1.25, y - h * 0.42, x + w, y);
  ctx.closePath();
  ctx.fill();
}

// 九天雷劫：頭頂雷雲 + 12 道依序落下的電柱
function drawThunder(ctx, f, x, y, layer) {
  if (layer === 'ground') {
    for (const b of f.bolts) {
      const k = Math.min(1, b.t / 0.42);
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = SIG_COLOR.thunder;
      ctx.beginPath();
      ctx.arc(b.x - (f.x - x), b.y - (f.y - y), 30 + 16 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const cloudA = f.t < SIG.thunder.cloud ? f.t / SIG.thunder.cloud : Math.max(0, 1 - (f.t - SIG.thunder.cloud) / (f.life - SIG.thunder.cloud));
  if (cloudA > 0.01) {
    ctx.globalAlpha = 0.5 * cloudA;
    ctx.strokeStyle = SIG_COLOR.thunderCore;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 150, 62, Math.PI, Math.PI * 2);      // 雲頂
    ctx.stroke();
    ctx.globalAlpha = 0.35 * cloudA;
    ctx.fillStyle = SIG_COLOR.thunder;
    ctx.beginPath();
    ctx.arc(x, y - 150, 62, Math.PI, Math.PI * 2);
    ctx.fill();
    // 雲層電弧
    ctx.globalAlpha = 0.75 * cloudA;
    ctx.strokeStyle = SIG_COLOR.thunder;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const px = x + i * 22;
      const zig = 10 + Math.sin(f.t * 22 + i) * 6;
      ctx.moveTo(px, y - 150);
      ctx.lineTo(px + zig * 0.4, y - 150 + 14);
      ctx.lineTo(px - zig * 0.4, y - 150 + 26);
    }
    ctx.stroke();
  }
  for (const b of f.bolts) {
    const k = Math.min(1, b.t / 0.42);
    const a = (1 - k) * 0.95;
    const bx = b.x - (f.x - x);
    const by = b.y - (f.y - y);
    // 電柱：三條折線 + 落地光環
    ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = SIG_COLOR.thunder;
    ctx.lineWidth = 14 * (1 - k * 0.5);
    strokeBolt(ctx, bx, by - 150, bx, by);
    ctx.globalAlpha = a;
    ctx.strokeStyle = SIG_COLOR.thunderCore;
    ctx.lineWidth = 5 * (1 - k * 0.5);
    strokeBolt(ctx, bx, by - 150, bx, by);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    strokeBolt(ctx, bx, by - 150, bx, by);
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = SIG_COLOR.thunder;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(bx, by, 44 + 26 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function strokeBolt(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = x0 + (x1 - x0) * t + (i === steps ? 0 : (i % 2 ? 9 : -9));
    ctx.lineTo(nx, y0 + (y1 - y0) * t);
  }
  ctx.stroke();
}

// 九轉金丹：丹爐現形、九顆金丹繞行上升
// 爐子放在角色腳下（y + 18）而不是以角色為中心 —— 疊在角色身上時看起來像一塊貼圖
function drawPillForge(ctx, f, x, y, layer) {
  const fade = Math.max(0, 1 - Math.max(0, f.t - (SIG.pill.life - 0.7)) / 0.7);
  const fy = y + 18;
  const heat = Math.min(1, f.t / SIG.pill.forge);
  if (layer === 'upper') {
    // 爐口的丹火（綠）與九顆金丹
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = SIG_COLOR.pill;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, fy - 10, 17, Math.PI, Math.PI * 2);
    ctx.stroke();
    drawFlame(ctx, x - 9, fy - 12, 22 + Math.sin(f.t * 10) * 5, 0.5 * fade, SIG_COLOR.pill);
    drawFlame(ctx, x + 8, fy - 12, 18 + Math.sin(f.t * 12 + 1) * 5, 0.5 * fade, '#9ff5c0');
    for (let i = 0; i < SIG.pill.pills; i++) {
      const k = Math.min(1, Math.max(0, (f.t - 0.15 - i * 0.09) / 1.2));
      if (k <= 0) continue;
      const a = i * 0.7 + f.t * 2.6;
      const rr = 28 * (1 - k * 0.5);
      const py = fy - 12 - k * 92 + Math.sin(a) * 4;
      ctx.globalAlpha = (1 - k) * fade;
      ctx.fillStyle = SIG_COLOR.pillGold;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, py, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = (1 - k) * 0.9 * fade;
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr - 1.4, py - 1.4, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // 爐身的暖光暈（填色，不用漸層物件）
  ctx.globalAlpha = 0.16 * heat * fade;
  ctx.fillStyle = SIG_COLOR.pillGold;
  ctx.beginPath();
  ctx.arc(x, fy - 4, 40, 0, Math.PI * 2);
  ctx.fill();
  // 丹爐：爐身填色 + 金邊 + 三足 + 爐口
  ctx.globalAlpha = 0.3 * fade;
  ctx.fillStyle = SIG_COLOR.pillGold;
  ctx.beginPath();
  ctx.moveTo(x - 26, fy + 14);
  ctx.lineTo(x + 26, fy + 14);
  ctx.lineTo(x + 18, fy - 10);
  ctx.lineTo(x - 18, fy - 10);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.95 * fade;
  ctx.strokeStyle = '#e8c168';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x - 26, fy + 14);
  ctx.lineTo(x + 26, fy + 14);
  ctx.lineTo(x + 18, fy - 10);
  ctx.lineTo(x - 18, fy - 10);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 16, fy + 14);
  ctx.lineTo(x - 21, fy + 26);
  ctx.moveTo(x + 16, fy + 14);
  ctx.lineTo(x + 21, fy + 26);
  ctx.moveTo(x, fy + 14);
  ctx.lineTo(x, fy + 26);
  ctx.stroke();
}

// 獅子吼：佛光輪 + 三圈音波 + 地面蓮花紋
function drawLionHalo(ctx, f, x, y, layer) {
  const fade = Math.max(0, 1 - f.t / SIG.lion.life);
  if (layer === 'upper') {
  // 佛光輪：12 道光芒
  ctx.globalAlpha = 0.55 * fade;
  ctx.strokeStyle = SIG_COLOR.lion;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + f.t * 0.5;
    const r0 = 40;
    const r1 = 40 + 16 + Math.sin(f.t * 12 + i) * 4;
    ctx.moveTo(x + Math.cos(a) * r0, y - 26 + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y - 26 + Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.7 * fade;
  ctx.beginPath();
  ctx.arc(x, y - 26, 40, 0, Math.PI * 2);
  ctx.stroke();
  return;
  }
  // 三圈音波（地面層：震波貼著地面擴散才看得出「吼」的範圍）
  for (let k = 0; k < 3; k++) {
    const tt = f.t - k * 0.14;
    if (tt <= 0) continue;
    const p = Math.min(1, tt / 0.75);
    ctx.globalAlpha = (1 - p) * 0.6 * fade;
    ctx.strokeStyle = k === 0 ? SIG_COLOR.lionCore : SIG_COLOR.lion;
    ctx.lineWidth = 6 * (1 - p * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, SIG.lion.radius * (0.25 + 0.75 * p), 0, Math.PI * 2);
    ctx.stroke();
  }
  // 地面蓮花：八片花瓣的弧
  ctx.globalAlpha = 0.4 * fade;
  ctx.strokeStyle = SIG_COLOR.lionCore;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.moveTo(x + Math.cos(a) * 46, y + Math.sin(a) * 46);
    ctx.quadraticCurveTo(x + Math.cos(a) * 78 + Math.cos(a + 1.57) * 18, y + Math.sin(a) * 78 + Math.sin(a + 1.57) * 18, x + Math.cos(a + 0.6) * 92, y + Math.sin(a + 0.6) * 92);
  }
  ctx.stroke();
}

// 血魔化身：血霧爆開 + 血蓮綻放 + 化身期間纏身的血氣
function drawBloodBloom(ctx, f, camera, layer) {
  const fade = Math.max(0, 1 - Math.max(0, f.t - (SIG.blood.life - 1.2)) / 1.2);
  const x = f.x - camera.x;
  const y = f.y - camera.y;
  if (layer === 'upper') {
    // 纏身血氣：三圈繞著角色轉的血紅弧（畫在角色之上才像纏在身上）
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = SIG_COLOR.bloodDeep;
    ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      const a = f.t * 2.2 + (k / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x, y - 10, 30 + k * 9, a, a + 2.1);
      ctx.stroke();
    }
    return;
  }
  // 血霧（地面）
  const bloomP = Math.min(1, f.t / SIG.blood.bloom);
  ctx.globalAlpha = 0.3 * (1 - bloomP * 0.6) * fade;
  ctx.strokeStyle = SIG_COLOR.bloodDeep;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, SIG.blood.radius * (0.4 + 0.6 * bloomP), 0, Math.PI * 2);
  ctx.stroke();
  // 血蓮：8 片花瓣張開
  ctx.globalAlpha = 0.55 * (1 - bloomP * 0.35) * fade;
  ctx.strokeStyle = SIG_COLOR.blood;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + f.t * 0.3;
    const r0 = 30 + 30 * bloomP;
    const r1 = r0 + 46 * bloomP;
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.4) * r1, y + Math.sin(a + 0.4) * r1,
      x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  ctx.stroke();
}

// 金剛罩：鐘形金罩（護盾還在就畫，跟著角色）
function drawDome(ctx, camera, game, layer) {
  const p = game.player;
  const x = p.x - camera.x;
  const y = p.y - camera.y;
  const pulse = 1 + Math.sin(game.gameTime * 6) * 0.03;
  const r = 48 * pulse;
  const top = y - 16;
  if (layer === 'ground') {
    // 地面投影環
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = SIG_COLOR.dome;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 24, r * 0.78, r * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  // 罩身：半透明金 + 外緣亮線（先前只有 0.3 alpha 的填色，實測幾乎看不見）
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = SIG_COLOR.dome;
  ctx.beginPath();
  ctx.arc(x, top, r, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = SIG_COLOR.lionCore;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, top, r, Math.PI, Math.PI * 2);
  ctx.stroke();
  // 內圈（鐘的厚度）
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, top, r * 0.84, Math.PI, Math.PI * 2);
  ctx.stroke();
  // 鐘的兩側下垂到底 + 頂珠
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x - r, top);
  ctx.lineTo(x - r * 0.78, y + 24);
  ctx.moveTo(x + r, top);
  ctx.lineTo(x + r * 0.78, y + 24);
  ctx.stroke();
  ctx.fillStyle = SIG_COLOR.dome;
  ctx.beginPath();
  ctx.arc(x, top - r, 4, 0, Math.PI * 2);
  ctx.fill();
}
