// 手持武器外觀。
//
// 為什麼要這支：在這之前，武器只在「發射之後」才存在 —— 角色手上永遠是空的，
// 所以「這局帶了什麼武器」只能從投射物、圖示與文字看出來，角色本身沒有職業感。
// 這支把每把武器畫在角色手上：以手為原點、+x 指向最後一次開火的方向，
// 開火時吃後座位移，槍口吃閃光。全部是程序化繪製（沒有圖片資產），
// 每幀最多畫 4 把（武器欄上限），成本是純路徑運算。
//
// 畫法按「家族」分：17 把武器不需要 17 套美術，四種造型 + 各自的長度／顏色／
// 超武發光就足以讓每一把在畫面上一眼分辨。

const F = {
  blade: '#cfe8ff',
  disc: '#4cc9f0',
  launcher: '#ff7b00',
  coil: '#7df8ff',
};

// 武器 → { 家族, 長度(px), 主色, 超武是否發光 }
export const WEAPON_ART = {
  kunai: { family: 'blade', len: 26, color: F.blade },
  ghost_shuriken: { family: 'blade', len: 30, color: '#b98cff', evoGlow: true, shuriken: true },
  phase_blade: { family: 'blade', len: 32, color: '#7df8ff', evoGlow: true },
  phase_storm: { family: 'blade', len: 32, color: '#7df8ff', evoGlow: true, shuriken: true },

  guardian: { family: 'disc', len: 20, color: F.disc },
  eternal_domain: { family: 'disc', len: 24, color: '#ffd166', evoGlow: true },
  orbit_saw: { family: 'disc', len: 22, color: '#ff8fab', saw: true },
  singularity_ring: { family: 'disc', len: 24, color: '#c77dff', evoGlow: true },
  soccer: { family: 'disc', len: 22, color: '#00e5ff' },
  quantum_sphere: { family: 'disc', len: 24, color: '#00f59b', evoGlow: true },

  rocket: { family: 'launcher', len: 38, color: F.launcher },
  shark_torpedo: { family: 'launcher', len: 44, color: '#4cc9f0', evoGlow: true },
  napalm_sea: { family: 'launcher', len: 38, color: '#ff5722', evoGlow: true, bottle: true },
  molotov: { family: 'launcher', len: 26, color: '#ffb703', bottle: true },

  lightning: { family: 'coil', len: 30, color: F.coil },
  plasma_storm: { family: 'coil', len: 34, color: '#c77dff', evoGlow: true },
  drill: { family: 'coil', len: 28, color: '#ffb703', drill: true },

  // 第二輪擴充：迴力鏢走 blade 家族的「彎刃」變體，軌道炮走 launcher 的長管
  boomerang: { family: 'blade', len: 24, color: '#ffd166', boomerang: true },
  twin_storm: { family: 'blade', len: 30, color: '#ffe066', evoGlow: true, boomerang: true },
  railgun: { family: 'launcher', len: 44, color: '#7df8ff' },
  annihilation_beam: { family: 'launcher', len: 52, color: '#7df8ff', evoGlow: true },

  // 第三輪擴充：冰霜新星走 coil 的法器造型，霰彈槍走 launcher 的短粗槍管
  frost_nova: { family: 'coil', len: 26, color: '#7fd8ff' },
  absolute_zero: { family: 'coil', len: 32, color: '#e0fbff', evoGlow: true },
  shotgun: { family: 'launcher', len: 30, color: '#ffb347' },
  dragon_breath: { family: 'launcher', len: 36, color: '#ff5722', evoGlow: true },
};

// ── 四種家族 ────────────────────────────────────────────────────────────
// 每個函式都在「手為原點、+x 為瞄準方向」的座標系裡工作。

function blade(x, a, spin) {
  const L = a.len;
  // 握把
  x.fillStyle = '#2b2f3a';
  x.beginPath();
  x.roundRect(-9, -2.6, 11, 5.2, 2.4);
  x.fill();
  x.fillStyle = '#4a5162';
  x.fillRect(-6, -2.6, 1.6, 5.2);
  // 護手
  x.fillStyle = a.color;
  x.beginPath();
  x.roundRect(1, -5, 3.4, 10, 1.4);
  x.fill();

  if (a.boomerang) {
    // 迴力鏢：兩支彎刃 + 中央握把（用兩段二次曲線做出「V 字」的辨識度）
    const L = a.len * 0.9;
    x.save();
    x.translate(8, 0);
    x.fillStyle = 'rgba(0,0,0,0.5)';
    x.beginPath();
    x.moveTo(0, -3.4);
    x.quadraticCurveTo(L * 0.72, -L * 0.30, L, -L * 0.06);
    x.quadraticCurveTo(L * 0.7, -L * 0.12, 0, 3.4);
    x.closePath();
    x.fill();
    x.fillStyle = a.color;
    x.beginPath();
    x.moveTo(0, -2.6);
    x.quadraticCurveTo(L * 0.70, -L * 0.26, L * 0.96, -L * 0.05);
    x.quadraticCurveTo(L * 0.68, -L * 0.10, 0, 2.6);
    x.closePath();
    x.fill();
    x.fillStyle = '#2b2f3a';
    x.beginPath();
    x.roundRect(-6, -2.4, 9, 4.8, 2.2);
    x.fill();
    x.restore();
    return L;
  }

  if (a.shuriken) {
    // 手裏劍：四片刃，緩慢自轉
    x.save();
    x.translate(8 + L * 0.25, 0);
    x.rotate(spin);
    x.fillStyle = a.color;
    for (let i = 0; i < 4; i++) {
      x.rotate(Math.PI / 2);
      x.beginPath();
      x.moveTo(0, -2.4);
      x.lineTo(L * 0.42, 0);
      x.lineTo(0, 2.4);
      x.closePath();
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.arc(0, 0, L * 0.13, 0, Math.PI * 2);
    x.fill();
    x.restore();
    return L * 0.8;
  }

  // 刃：暗底 + 主色 + 中間高光，做出鍛造感
  x.fillStyle = 'rgba(0,0,0,0.55)';
  x.beginPath();
  x.moveTo(4, -4.2);
  x.lineTo(L, -0.6);
  x.lineTo(L, 0.6);
  x.lineTo(4, 4.2);
  x.closePath();
  x.fill();
  x.fillStyle = a.color;
  x.beginPath();
  x.moveTo(4.6, -3.4);
  x.lineTo(L - 0.6, -0.4);
  x.lineTo(L - 0.6, 0.4);
  x.lineTo(4.6, 3.4);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(6, -1.2);
  x.lineTo(L - 2, -0.2);
  x.stroke();
  return L;
}

function disc(x, a, spin) {
  const R = a.len * 0.42;
  x.save();
  x.translate(a.len * 0.55, 0);

  if (a.saw) {
    // 環鋸：鋸齒 + 旋轉，看得出是「會轉的東西」
    x.rotate(spin * 2.2);
    x.fillStyle = '#3a4152';
    x.beginPath();
    x.arc(0, 0, R, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = a.color;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      x.save();
      x.rotate(ang);
      x.beginPath();
      x.moveTo(R * 0.8, -R * 0.16);
      x.lineTo(R * 1.22, 0);
      x.lineTo(R * 0.8, R * 0.16);
      x.closePath();
      x.fill();
      x.restore();
    }
    x.fillStyle = '#1b1f27';
    x.beginPath();
    x.arc(0, 0, R * 0.45, 0, Math.PI * 2);
    x.fill();
  } else {
    // 輪盤／球體：主色實心 + 白熱中心 + 環繞符文
    x.fillStyle = a.color;
    x.beginPath();
    x.arc(0, 0, R, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.arc(-R * 0.28, -R * 0.3, R * 0.36, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.55)';
    x.lineWidth = 1.4;
    x.rotate(spin * 0.9);
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(0, 0, R * (0.62 + i * 0.14), i * 1.6, i * 1.6 + 2.1);
      x.stroke();
    }
  }
  x.restore();
  return a.len * 0.55 + R * 1.2;
}

function launcher(x, a) {
  const L = a.len;
  if (a.bottle) {
    // 燃燒瓶：瓶身 + 布條
    x.fillStyle = '#2f3a2b';
    x.beginPath();
    x.roundRect(0, -5.5, L * 0.62, 11, 3);
    x.fill();
    x.fillStyle = a.color;
    x.beginPath();
    x.roundRect(1.5, -4.2, L * 0.58, 8.4, 2.4);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(3, -3.4, L * 0.5, 1.8);
    x.strokeStyle = '#d9c7a3';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(L * 0.62, 0);
    x.lineTo(L * 0.95, -2.5);
    x.stroke();
    return L * 0.95;
  }
  // 發射管：管身 + 槍口環 + 上方瞄具
  x.fillStyle = '#242a36';
  x.beginPath();
  x.roundRect(-4, -6, L, 12, 4);
  x.fill();
  x.fillStyle = a.color;
  x.beginPath();
  x.roundRect(-2, -4, L - 4, 8, 3);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.28)';
  x.fillRect(0, -3.2, L - 8, 2);
  x.fillStyle = '#141821';
  x.beginPath();
  x.arc(L - 3.5, 0, 3.2, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#5a6478';
  x.beginPath();
  x.roundRect(L * 0.3, -10, L * 0.34, 4, 1.6);
  x.fill();
  return L;
}

function coil(x, a, spin) {
  const L = a.len;
  if (a.drill) {
    // 鑽頭：錐體 + 螺旋紋
    x.fillStyle = '#3a4152';
    x.beginPath();
    x.roundRect(-6, -4.5, 12, 9, 3);
    x.fill();
    x.fillStyle = a.color;
    x.beginPath();
    x.moveTo(6, -4.6);
    x.lineTo(L, 0);
    x.lineTo(6, 4.6);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      x.beginPath();
      x.moveTo(6 + (L - 6) * t, -4.6 * (1 - t));
      x.lineTo(6 + (L - 6) * t * 0.6, 4.6 * (1 - t) * 0.6);
      x.stroke();
    }
    return L;
  }
  // 線圈／法杖：絕緣握把 + 纏繞線圈 + 頂端電極
  x.fillStyle = '#242a36';
  x.beginPath();
  x.roundRect(-7, -3.4, L * 0.75, 6.8, 3);
  x.fill();
  x.strokeStyle = a.color;
  x.lineWidth = 1.8;
  for (let i = 0; i < 4; i++) {
    const px = -3 + i * (L * 0.62 / 4);
    x.beginPath();
    x.moveTo(px, -3.4);
    x.lineTo(px + 3, 3.4);
    x.stroke();
  }
  // 頂端電極：開火時吃 spin 當作電弧抖動
  x.save();
  x.translate(L * 0.78, 0);
  x.fillStyle = a.color;
  x.beginPath();
  x.arc(0, 0, 4.4, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.beginPath();
  x.arc(0, 0, 2.1 + Math.sin(spin * 6) * 0.5, 0, Math.PI * 2);
  x.fill();
  x.restore();
  return L * 0.78 + 5;
}

// 把一把武器畫在手上。
// opts: { x, y, aim, recoil(0~1), muzzle(0~1), level, slot, facing, time }
// 回傳值：槍口在畫面座標的位置（給粒子系統或測試使用）
// ── 武器掛載點 ──────────────────────────────────────────────────────────
// 為什麼不是「四把都拿在手上」：實測四把武器共用同一個手部原點時，兩兩重疊率高達 54~99%
// （kunai/rocket 87%、rocket/molotov 99%），而且火箭/軌道炮這種長管武器會直接橫在角色臉上。
// 改成「一手追瞄 + 背/腰掛載」：主手那一把會轉向敵人，其餘以固定角度背在身上，
// 位置也刻意留在角色輪廓之外（dx 13~-13、dy -7~16），四把同時出現時仍看得出各自是什麼。
//   dx 往面向方向為正、dy 往螢幕下方為正、angle 是「面向右」時的角度、layer 決定畫在角色前或後
export const HELD_MOUNTS = [
  { dx: 13, dy: 7, scale: 1.00, aim: true, layer: 'front' },       // 主手：追瞄敵人
  { dx: -7, dy: -11, angle: -2.05, scale: 0.80, layer: 'back' },   // 斜背在肩後（露出上半，不壓到頭頂）
  { dx: 11, dy: 15, angle: 0.70, scale: 0.60, layer: 'front' },    // 腰前：斜插在髖部前外側
  { dx: -16, dy: 18, angle: 1.50, scale: 0.55, layer: 'back' },    // 後腰：垂在身後下方
];
const DEFAULT_MOUNT = HELD_MOUNTS[0];

export function drawHeldWeapon(ctx, id, opts) {
  const a = WEAPON_ART[id];
  if (!a) return null;
  const facing = opts.facing < 0 ? -1 : 1;      // -1 = 面向左
  const mount = opts.mount || DEFAULT_MOUNT;
  const aim = opts.aim != null ? opts.aim : (facing < 0 ? Math.PI : 0);
  const recoil = opts.recoil || 0;
  const muzzle = opts.muzzle || 0;
  const time = opts.time || 0;

  // 掛載點：dx 是「往面向方向」的偏移、dy 是螢幕下方，兩者都會隨面向鏡射。
  // 只有 `aim: true` 的主手會追瞄敵人；其餘以固定角度背/掛在身上。
  // 掛在身上的武器角度用「方向向量鏡射」換算（θ → π−θ），所以面向左時整組會左右對調。
  const baseAngle = mount.aim ? aim : (facing > 0 ? mount.angle : Math.PI - mount.angle);
  const handX = opts.x + facing * mount.dx;
  const handY = opts.y + mount.dy;
  // 掛在身上的武器不會整把跟著開火往後彈，只留一點震動
  const kick = mount.aim ? recoil : recoil * 0.25;

  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(baseAngle);
  if (mount.scale && mount.scale !== 1) ctx.scale(mount.scale, mount.scale);
  ctx.translate(-kick * 3.2, -kick * 1.2);
  ctx.rotate(-kick * 0.10);
  // 等級越高手感越重：每級放大 3%（Lv5 = +12%），換武器或升級都看得出來
  const lv = Math.max(1, Math.min(5, opts.level || 1));
  if (lv > 1) ctx.scale(1 + (lv - 1) * 0.03, 1 + (lv - 1) * 0.03);

  // 超武的外圈光環：一眼看出這把已經進化
  if (a.evoGlow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32 + Math.sin(time * 3) * 0.08;
    const R = a.len * 1.15;
    const cx = a.len * 0.45;   // 光環對齊武器中段，不是對齊握把
    ctx.drawImage(glowCanvas(a.color), cx - R / 2, -R / 2, R, R);
    ctx.restore();
  }

  const spin = time * (a.family === 'disc' ? 2.2 : 1.4);
  let tip = 0;
  if (a.family === 'blade') tip = blade(ctx, a, spin);
  else if (a.family === 'disc') tip = disc(ctx, a, spin);
  else if (a.family === 'launcher') tip = launcher(ctx, a);
  else tip = coil(ctx, a, spin);

  // 槍口火光
  if (muzzle > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = muzzle;
    const R = 13 + muzzle * 7;
    ctx.drawImage(glowCanvas(a.color), tip - R * 0.35, -R / 2, R, R);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(tip, 0);
    ctx.lineTo(tip + 9 * muzzle, -3.2 * muzzle);
    ctx.lineTo(tip + 14 * muzzle, 0);
    ctx.lineTo(tip + 9 * muzzle, 3.2 * muzzle);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // 回傳世界座標的槍口位置（大致值，供粒子/測試參考）
  const ang = baseAngle - kick * 0.10;
  const k = mount.scale || 1;
  const ox = -kick * 3.2;
  const oy = -kick * 1.2;
  return {
    x: handX + (Math.cos(ang) * (tip + ox) - Math.sin(ang) * oy) * k,
    y: handY + (Math.sin(ang) * (tip + ox) + Math.cos(ang) * oy) * k,
  };
}

// 這支模組自己的迷你光暈快取（與 ProjectileFX 的尺寸不同，各自一張更省）
const glows = new Map();
function glowCanvas(color) {
  let c = glows.get(color);
  if (c) return c;
  const S = 64;
  c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const n = parseInt(color.replace('#', ''), 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  g.addColorStop(0, `rgba(255,255,255,0.85)`);
  g.addColorStop(0.3, `rgba(${rgb},0.55)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  glows.set(color, c);
  return c;
}
