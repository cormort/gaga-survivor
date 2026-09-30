// 手持武器外觀。
//
// 為什麼要這支：在這之前，武器只在「發射之後」才存在 —— 角色手上永遠是空的，
// 所以「這局帶了什麼武器」只能從投射物、圖示與文字看出來，角色本身沒有職業感。
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

  guardian: { family: 'disc', len: 22, color: F.disc },
  eternal_domain: { family: 'disc', len: 26, color: '#ffd166', evoGlow: true },
  orbit_saw: { family: 'disc', len: 24, color: '#ff8fab', saw: true },
  singularity_ring: { family: 'disc', len: 26, color: '#c77dff', evoGlow: true },
  soccer: { family: 'disc', len: 22, color: '#00e5ff' },
  quantum_sphere: { family: 'disc', len: 24, color: '#00f59b', evoGlow: true },

  rocket: { family: 'launcher', len: 38, color: F.launcher },
  shark_torpedo: { family: 'launcher', len: 44, color: '#4cc9f0', evoGlow: true },
  napalm_sea: { family: 'launcher', len: 38, color: '#ff5722', evoGlow: true, bottle: true },
  molotov: { family: 'launcher', len: 26, color: '#ffb703', bottle: true },

  lightning: { family: 'coil', len: 30, color: F.coil },
  plasma_storm: { family: 'coil', len: 34, color: '#c77dff', evoGlow: true },
  drill: { family: 'coil', len: 28, color: '#ffb703', drill: true },

  // 第二輪擴充：迴力鏢、軌道炮
  boomerang: { family: 'blade', len: 25, color: '#ffd166', boomerang: true },
  twin_storm: { family: 'blade', len: 30, color: '#ffe066', evoGlow: true, boomerang: true },
  railgun: { family: 'launcher', len: 44, color: '#7df8ff' },
  annihilation_beam: { family: 'launcher', len: 52, color: '#7df8ff', evoGlow: true },

  // 第三輪擴充：冰霜新星、霰彈槍
  frost_nova: { family: 'coil', len: 28, color: '#7fd8ff' },
  absolute_zero: { family: 'coil', len: 32, color: '#e0fbff', evoGlow: true },
  shotgun: { family: 'launcher', len: 30, color: '#ffb347' },
  dragon_breath: { family: 'launcher', len: 36, color: '#ff5722', evoGlow: true },

  // 戰鎚 40K 擴充武器
  bolter: { family: 'launcher', len: 32, color: '#ffb703' },
  storm_bolter: { family: 'launcher', len: 38, color: '#ffd166', evoGlow: true },
  chainsword: { family: 'blade', len: 36, color: '#ff3344' },
  power_sword: { family: 'blade', len: 40, color: '#00d4ff', evoGlow: true },
};

// ── 武器 PNG 貼圖掛載與錨點設定 ──────────────────────────────────────
// 支援外部 PNG 貼圖載入（放置於 assets/weapons/${id}.png）
// anchorX, anchorY: 握把手持中心點（相對於 PNG 左上角）
// renderW, renderH: 繪製尺寸（像素）
// tipX: 槍口/刀尖相對於握把點的 X 軸偏移量（開火火光、斬擊弧光定位）
export const WEAPON_PNG_CONFIG = {
  // ── 基礎武器 (已導入 Banana 專屬高解析 Sprite) ──
  kunai:             { anchorX:  7, anchorY:  5, renderW: 42, renderH: 11, tipX: 34 },
  rocket:            { anchorX: 15, anchorY: 12, renderW: 48, renderH: 22, tipX: 32 },
  shotgun:           { anchorX: 10, anchorY:  6, renderW: 38, renderH: 12, tipX: 27 },
  chainsword:        { anchorX:  7, anchorY:  5, renderW: 42, renderH: 10, tipX: 34 },
  bolter:            { anchorX: 10, anchorY: 13, renderW: 38, renderH: 25, tipX: 27 },
  storm_bolter:      { anchorX: 10, anchorY: 14, renderW: 38, renderH: 26, tipX: 27 },
  power_sword:       { anchorX:  7, anchorY:  7, renderW: 42, renderH: 14, tipX: 34 },

  // ── 元素與科技武器 ──
  guardian:          { anchorX: 14, anchorY: 20, renderW: 32, renderH: 40, tipX: 22 },
  molotov:           { anchorX:  8, anchorY: 26, renderW: 28, renderH: 40, tipX: 20 },
  lightning:         { anchorX:  8, anchorY: 10, renderW: 44, renderH: 20, tipX: 35 },
  soccer:            { anchorX: 17, anchorY: 16, renderW: 34, renderH: 32, tipX: 24 },
  boomerang:         { anchorX: 17, anchorY: 17, renderW: 34, renderH: 34, tipX: 24 },
  railgun:           { anchorX: 13, anchorY:  9, renderW: 54, renderH: 18, tipX: 42 },
  phase_blade:       { anchorX:  7, anchorY:  4, renderW: 42, renderH:  9, tipX: 34 },
  orbit_saw:         { anchorX: 17, anchorY: 16, renderW: 34, renderH: 33, tipX: 24 },
  frost_nova:        { anchorX:  8, anchorY: 14, renderW: 44, renderH: 30, tipX: 35 },
  drill:             { anchorX:  9, anchorY: 17, renderW: 36, renderH: 29, tipX: 27 },

  // ── 進化超武 ──
  ghost_shuriken:    { anchorX: 17, anchorY: 30, renderW: 34, renderH: 60, tipX: 24 },
  eternal_domain:    { anchorX: 17, anchorY: 17, renderW: 34, renderH: 35, tipX: 25 },
  shark_torpedo:     { anchorX: 15, anchorY: 11, renderW: 48, renderH: 20, tipX: 33 },
  napalm_sea:        { anchorX: 15, anchorY: 10, renderW: 48, renderH: 19, tipX: 33 },
  plasma_storm:      { anchorX: 10, anchorY:  6, renderW: 38, renderH: 12, tipX: 28 },
  quantum_sphere:    { anchorX: 17, anchorY: 16, renderW: 34, renderH: 32, tipX: 24 },
  twin_storm:        { anchorX: 17, anchorY: 19, renderW: 34, renderH: 39, tipX: 26 },
  annihilation_beam: { anchorX: 13, anchorY: 10, renderW: 54, renderH: 19, tipX: 42 },
  phase_storm:       { anchorX:  8, anchorY: 12, renderW: 44, renderH: 24, tipX: 35 },
  singularity_ring:  { anchorX: 17, anchorY: 17, renderW: 34, renderH: 34, tipX: 24 },
  absolute_zero:     { anchorX:  8, anchorY: 13, renderW: 44, renderH: 26, tipX: 35 },
  dragon_breath:     { anchorX: 15, anchorY:  9, renderW: 48, renderH: 17, tipX: 33 },
};

// 武器 PNG 快取表 (id -> HTMLImageElement / HTMLCanvasElement)
export const weaponImages = new Map();

// 預載入 assets/weapons/${id}.png (若不存在則靜默由 Canvas 程序化繪圖接手)
export const weaponImagesReady = typeof Image === 'undefined'
  ? Promise.resolve()
  : Promise.all(
      Object.keys(WEAPON_ART).map((id) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          weaponImages.set(id, img);
          resolve();
        };
        img.onerror = () => {
          // 找不到圖檔時安全退回 Canvas 繪製，不阻塞遊戲載入
          resolve();
        };
        img.src = `./assets/weapons/${id}.png?v=20260930`;
      }))
    );

// 支援外部注入或動態註冊自訂 PNG 貼圖 (例如 DataURL、Image 物件、或 Canvas)
export function registerWeaponPng(id, imgOrUrl, config = null) {
  if (config) {
    WEAPON_PNG_CONFIG[id] = { ...(WEAPON_PNG_CONFIG[id] || {}), ...config };
  }
  if (typeof imgOrUrl === 'string') {
    const img = new Image();
    img.onload = () => weaponImages.set(id, img);
    img.src = imgOrUrl;
    return img;
  } else if (imgOrUrl) {
    weaponImages.set(id, imgOrUrl);
    return imgOrUrl;
  }
}

// ── 專屬手持武器精靈繪圖器 ──────────────────────────────────────────────
// 配合遊戲整體 Q 版特工風格（清晰深色描邊、金屬漸層、能量光影與豐富細節），
// 每個函式都在「手為原點 (0,0)、+x 為瞄準方向」的區域座標系繪製，並回傳槍口/刀尖的 x 軸長度。

const HELD_DRAWERS = {
  // 1. 苦無 (Kunai)
  kunai: (ctx, spin, opts) => {
    // 尾部圓環 Pommel
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#8ea1b8';
    ctx.fillStyle = '#10141d';
    ctx.beginPath();
    ctx.arc(-11, 0, 3.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-11, 0, 1.8, 0, Math.PI * 2);
    ctx.stroke();

    // 握把 Handle
    ctx.fillStyle = '#1e2430';
    ctx.strokeStyle = '#0e1218';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-8, -2.5, 9, 5, 1.5);
    ctx.fill();
    ctx.stroke();

    // 橙色繃帶斜紋
    ctx.strokeStyle = '#e2711d';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-7 + i * 2.8, -2.2);
      ctx.lineTo(-5.5 + i * 2.8, 2.2);
      ctx.stroke();
    }

    // 護手盤 Tsuba
    ctx.fillStyle = '#3a4454';
    ctx.strokeStyle = '#151a22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(1, -4.2, 2.4, 8.4, 1.2);
    ctx.fill();
    ctx.stroke();

    // 苦無刀身基底
    ctx.fillStyle = '#222c3c';
    ctx.strokeStyle = '#0e131a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(3.4, -4.5);
    ctx.lineTo(26, 0);
    ctx.lineTo(3.4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 刃面鋼質漸層
    const bg = ctx.createLinearGradient(3.4, -4.5, 3.4, 4.5);
    bg.addColorStop(0, '#cce3ff');
    bg.addColorStop(0.5, '#ffffff');
    bg.addColorStop(1, '#6894d4');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(3.8, -3.4);
    ctx.lineTo(24.5, 0);
    ctx.lineTo(3.8, 3.4);
    ctx.closePath();
    ctx.fill();

    // 青藍能量血槽
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(19, 0);
    ctx.stroke();

    return 26;
  },

  // 2. 幽靈手裏劍 (Ghost Shuriken - Evo)
  ghost_shuriken: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(10, 0);
    ctx.rotate(spin * 2.5);

    // 幽能光環
    const rg = ctx.createRadialGradient(0, 0, 1, 0, 0, 15);
    rg.addColorStop(0, 'rgba(215, 130, 255, 0.45)');
    rg.addColorStop(0.6, 'rgba(150, 50, 255, 0.15)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    // 四片月牙飛刃
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.fillStyle = '#8a2be2';
      ctx.strokeStyle = '#320066';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(8, -5.5, 14, 0);
      ctx.quadraticCurveTo(6, 4.5, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 鋒刃亮線
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(8, -5.5, 14, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 核心靈魂之火
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0aaff';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
    return 26;
  },

  // 3. 守護輪盤 (Guardian)
  guardian: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(10, 0);

    // 握把/基座
    ctx.fillStyle = '#1c2434';
    ctx.fillRect(-10, -2, 6, 4);

    // 力場光圈
    ctx.strokeStyle = 'rgba(76, 201, 240, 0.4)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.stroke();

    // 旋轉偏折無人機刃片
    ctx.save();
    ctx.rotate(spin * 2.2);
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 3);
      ctx.fillStyle = '#3a506b';
      ctx.strokeStyle = '#0b132b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(6, -2.8, 8, 5.6, 1.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00f5ff';
      ctx.fillRect(10, -1.2, 3, 2.4);
      ctx.restore();
    }
    ctx.restore();

    // 中央主機芯
    ctx.fillStyle = '#1c2541';
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 核心青光
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return 24;
  },

  // 4. 永恆領域 (Eternal Domain - Evo)
  eternal_domain: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(11, 0);

    ctx.fillStyle = '#3a2e10';
    ctx.fillRect(-11, -2, 6, 4);

    // 金色神聖光暈
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    g.addColorStop(0, 'rgba(255, 230, 120, 0.55)');
    g.addColorStop(0.6, 'rgba(255, 183, 3, 0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // 六道金色聖刃
    ctx.save();
    ctx.rotate(spin * 1.6);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      ctx.fillStyle = '#ffe066';
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(9, -2.2);
      ctx.lineTo(14, 0);
      ctx.lineTo(9, 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 核心神聖寶珠
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return 26;
  },

  // 5. 高爆火箭筒 (Rocket)
  rocket: (ctx, spin, opts) => {
    // 底部握把與扳機護弓
    ctx.fillStyle = '#1a1f28';
    ctx.strokeStyle = '#0d1015';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-2, 3, 5, 8, 1.5);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#3a4454';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(3, 4, 3, 0, Math.PI * 0.9);
    ctx.stroke();

    // 筒身主體
    ctx.fillStyle = '#26303c';
    ctx.strokeStyle = '#10141a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-9, -6, 28, 12, 2.5);
    ctx.fill();
    ctx.stroke();

    // 尾部排氣錐
    ctx.fillStyle = '#191f28';
    ctx.beginPath();
    ctx.moveTo(-9, -7);
    ctx.lineTo(-13, -8.5);
    ctx.lineTo(-13, 8.5);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 警戒條紋
    ctx.fillStyle = '#ff7b00';
    ctx.fillRect(8, -5.2, 8, 10.4);
    ctx.fillStyle = '#1a1f28';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(8 + i * 4, -5.2);
      ctx.lineTo(11 + i * 4, -5.2);
      ctx.lineTo(9 + i * 4, 5.2);
      ctx.lineTo(6 + i * 4, 5.2);
      ctx.closePath();
      ctx.fill();
    }

    // 頂部瞄準鏡
    ctx.fillStyle = '#3a4658';
    ctx.strokeStyle = '#10141a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-3, -10.5, 14, 4.5, 1.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#00f5ff';
    ctx.fillRect(9, -9.5, 1.5, 2.5);

    // 外露彈頭
    ctx.fillStyle = '#e63946';
    ctx.strokeStyle = '#7a0010';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(19, -4.5);
    ctx.quadraticCurveTo(27, -3.5, 30, 0);
    ctx.quadraticCurveTo(27, 3.5, 19, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 引信白頭
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(29, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();

    return 31;
  },

  // 6. 狂鯊魚雷 (Shark Torpedo - Evo)
  shark_torpedo: (ctx, spin, opts) => {
    ctx.fillStyle = '#121e2e';
    ctx.fillRect(-2, 3, 5, 8);

    // 鯊魚外殼本體
    ctx.fillStyle = '#193354';
    ctx.strokeStyle = '#09131f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-11, -6);
    ctx.lineTo(16, -6);
    ctx.quadraticCurveTo(28, -5, 35, 0);
    ctx.quadraticCurveTo(28, 5, 16, 6);
    ctx.lineTo(-11, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 腹部淺藍鋼板
    ctx.fillStyle = '#32608a';
    ctx.beginPath();
    ctx.moveTo(-8, 1);
    ctx.lineTo(18, 1);
    ctx.quadraticCurveTo(26, 3, 33, 0);
    ctx.quadraticCurveTo(25, 5, 16, 5);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fill();

    // 背鰭
    ctx.fillStyle = '#10233b';
    ctx.beginPath();
    ctx.moveTo(4, -6);
    ctx.lineTo(9, -10.5);
    ctx.lineTo(13, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 鯊魚尖牙
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(21 + i * 3, -1);
      ctx.lineTo(22.5 + i * 3, 2.5);
      ctx.lineTo(24 + i * 3, -1);
      ctx.closePath();
      ctx.fill();
    }

    // 狂怒紅眼
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(22, -3, 2, 0, Math.PI * 2);
    ctx.fill();

    // 尾部推進鰭
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.moveTo(-11, -7);
    ctx.lineTo(-16, -9);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-16, 9);
    ctx.lineTo(-11, 7);
    ctx.closePath();
    ctx.fill();

    return 36;
  },

  // 7. 燃燒瓶 (Molotov)
  molotov: (ctx, spin, opts) => {
    // 玻璃瓶身
    ctx.fillStyle = 'rgba(46, 82, 42, 0.9)';
    ctx.strokeStyle = '#142612';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(4, -6, 16, 12, 3);
    ctx.fill();
    ctx.stroke();

    // 瓶內晃動液體
    const fwave = Math.sin(opts.time * 6) * 1.2;
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.moveTo(6, 0 + fwave);
    ctx.lineTo(18, 0 - fwave);
    ctx.lineTo(18, 4.5);
    ctx.lineTo(6, 4.5);
    ctx.closePath();
    ctx.fill();

    // 玻璃反光白線
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, -4.2);
    ctx.lineTo(18, -4.2);
    ctx.stroke();

    // 瓶頸與軟木塞
    ctx.fillStyle = 'rgba(46, 82, 42, 0.95)';
    ctx.fillRect(-2, -3.5, 6, 7);
    ctx.strokeRect(-2, -3.5, 6, 7);
    ctx.fillStyle = '#a0522d';
    ctx.fillRect(-4, -2.5, 2.5, 5);

    // 燃燒布條
    ctx.strokeStyle = '#eae0d5';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-7, -2);
    ctx.stroke();

    // 躍動火焰
    const flameR = 5.5 + Math.sin(opts.time * 12) * 1.2;
    const fg = ctx.createRadialGradient(-8, -2, 1, -8, -2, flameR);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(0.3, '#ffe066');
    fg.addColorStop(0.7, '#ff5722');
    fg.addColorStop(1, 'rgba(255, 30, 0, 0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(-8, -2, flameR, 0, Math.PI * 2);
    ctx.fill();

    return 22;
  },

  // 8. 末日炎海 (Napalm Sea - Evo)
  napalm_sea: (ctx, spin, opts) => {
    ctx.fillStyle = '#222';
    ctx.fillRect(-4, 3, 5, 8);

    // 高壓鋼罐
    ctx.fillStyle = '#4a1515';
    ctx.strokeStyle = '#1c0808';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-8, -6.5, 22, 13, 3);
    ctx.fill();
    ctx.stroke();

    // 警戒條紋帶
    ctx.fillStyle = '#d90429';
    ctx.fillRect(0, -5.5, 10, 11);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(3, -5.5, 4, 11);

    // 壓力錶
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-2, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 前端重型噴口管身
    ctx.fillStyle = '#2b2d42';
    ctx.strokeStyle = '#10121a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(14, -4);
    ctx.lineTo(26, -5.5);
    ctx.lineTo(26, 5.5);
    ctx.lineTo(14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 噴口引燃藍白熱焰
    const flamX = 26;
    const fg = ctx.createRadialGradient(flamX, 0, 1, flamX, 0, 7);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(0.3, '#00f5ff');
    fg.addColorStop(0.7, '#ff3d00');
    fg.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(flamX, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    return 32;
  },

  // 9. 磁暴線圈 (Lightning)
  lightning: (ctx, spin, opts) => {
    // 握把
    ctx.fillStyle = '#1c212a';
    ctx.strokeStyle = '#0e1116';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-8, -2.5, 11, 5, 1.5);
    ctx.fill();
    ctx.stroke();

    // 線圈柱身
    ctx.fillStyle = '#262f3d';
    ctx.fillRect(3, -3.5, 16, 7);
    ctx.strokeRect(3, -3.5, 16, 7);

    // 銅質纏繞線圈
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(4 + i * 3.8, -3.8);
      ctx.lineTo(6.5 + i * 3.8, 3.8);
      ctx.stroke();
    }

    // 頂端放電圓球
    const orbX = 23;
    const g = ctx.createRadialGradient(orbX, 0, 1, orbX, 0, 7.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#7df8ff');
    g.addColorStop(0.8, '#0099ff');
    g.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(orbX, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // 電漿放電火花
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    const sparkY = Math.sin(opts.time * 16) * 3;
    ctx.beginPath();
    ctx.moveTo(orbX - 2, sparkY);
    ctx.lineTo(orbX + 3, sparkY - 3);
    ctx.lineTo(orbX + 7, sparkY + 2);
    ctx.stroke();

    return 28;
  },

  // 10. 電漿風暴 (Plasma Storm - Evo)
  plasma_storm: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(12, 0);

    ctx.fillStyle = '#1c1b29';
    ctx.fillRect(-12, -2, 7, 4);

    // 狂暴雷雲紫暈
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(199,125,255,0.7)');
    g.addColorStop(0.7, 'rgba(114,9,183,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // 雙環磁場束縛環
    ctx.save();
    ctx.rotate(spin * 2);
    ctx.strokeStyle = '#e0aaff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, -Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 電漿核心與白熱閃電
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    const ldx = Math.sin(opts.time * 20) * 3;
    ctx.beginPath();
    ctx.moveTo(-3, -7);
    ctx.lineTo(ldx, 0);
    ctx.lineTo(4, 7);
    ctx.stroke();

    ctx.restore();
    return 28;
  },

  // 11. 量子足球 (Soccer)
  soccer: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(11, 0);

    ctx.fillStyle = '#eaf6ff';
    ctx.strokeStyle = '#0077b6';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 賽博六邊形紋路
    ctx.fillStyle = '#0077b6';
    ctx.beginPath();
    ctx.moveTo(0, -4.5);
    ctx.lineTo(4, -2);
    ctx.lineTo(4, 2);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-4, 2);
    ctx.lineTo(-4, -2);
    ctx.closePath();
    ctx.fill();

    // 青藍能量動態軌道
    ctx.save();
    ctx.rotate(spin * 3);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13.5, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    return 23;
  },

  // 12. 量子裂變球 (Quantum Sphere - Evo)
  quantum_sphere: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(11, 0);

    // 翡翠核能光環
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 15);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(0,245,155,0.6)');
    g.addColorStop(0.8, 'rgba(0,150,100,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    // 三環原子軌道
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3 + spin * 1.5);
      ctx.strokeStyle = '#70e000';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 軌道電子
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(12, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 中心裂變白熱光斑
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return 25;
  },

  // 13. 獵鷹迴力鏢 (Boomerang)
  boomerang: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(6, 0);

    // 合金基底
    ctx.fillStyle = '#ffb703';
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(16, -11);
    ctx.lineTo(14, -14);
    ctx.lineTo(3, -3);
    ctx.lineTo(14, 14);
    ctx.lineTo(16, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 鋒刃銀白高光
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(14, -14);
    ctx.lineTo(3, -3);
    ctx.lineTo(14, 14);
    ctx.stroke();

    // 握把/中心中樞
    ctx.fillStyle = '#1c222d';
    ctx.beginPath();
    ctx.arc(1, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.arc(1, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return 24;
  },

  // 14. 雙子風暴 (Twin Storm - Evo)
  twin_storm: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(11, 0);

    // 氣流旋風光環
    ctx.strokeStyle = 'rgba(255, 224, 102, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();

    // 旋轉雙交錯飛刃
    ctx.save();
    ctx.rotate(spin * 3);
    for (let r = -1; r <= 1; r += 2) {
      ctx.save();
      ctx.rotate(r * (Math.PI / 4));
      ctx.fillStyle = '#ffe066';
      ctx.strokeStyle = '#d4a373';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.lineTo(12, -9);
      ctx.lineTo(9, -12);
      ctx.lineTo(0, 0);
      ctx.lineTo(-9, -12);
      ctx.lineTo(-12, -9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(9, -12);
      ctx.lineTo(0, 0);
      ctx.lineTo(-9, -12);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 核心風暴眼
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return 27;
  },

  // 15. 重型軌道炮 (Railgun)
  railgun: (ctx, spin, opts) => {
    // 後托與握把
    ctx.fillStyle = '#1c222e';
    ctx.strokeStyle = '#0e1219';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-10, -3.5, 10, 6, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-2, 2.5, 4, 7);

    // 雙導軌外機匣
    ctx.fillStyle = '#263040';
    ctx.strokeStyle = '#10151d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(0, -5, 36, 10, 2);
    ctx.fill();
    ctx.stroke();

    // 散熱散片
    ctx.strokeStyle = '#8ea1b8';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(6 + i * 5, -7);
      ctx.lineTo(6 + i * 5, -5);
      ctx.moveTo(6 + i * 5, 5);
      ctx.lineTo(6 + i * 5, 7);
      ctx.stroke();
    }

    // 雙加速導軌（電光藍）
    ctx.fillStyle = '#00f5ff';
    ctx.fillRect(4, -3.2, 32, 1.8);
    ctx.fillRect(4, 1.4, 32, 1.8);

    // 槍口能量聚能環
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(36, -4, 3, 8, 1);
    ctx.fill();
    ctx.stroke();

    return 40;
  },

  // 16. 湮滅光束 (Annihilation Beam - Evo)
  annihilation_beam: (ctx, spin, opts) => {
    // 後托與握把
    ctx.fillStyle = '#141822';
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(-12, -4.5, 12, 8, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-3, 3.5, 5, 8);

    // 重型外骨架砲身
    ctx.fillStyle = '#1e2430';
    ctx.strokeStyle = '#0c0f14';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, -6.5, 38, 13, 3);
    ctx.fill();
    ctx.stroke();

    // 毀滅粒子能量槽
    const g = ctx.createLinearGradient(4, 0, 36, 0);
    g.addColorStop(0, '#7b2cbf');
    g.addColorStop(0.6, '#00f5ff');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(6, -2.5, 30, 5);

    // 頂部與底部散熱裝甲翼
    ctx.fillStyle = '#3a4454';
    ctx.beginPath();
    ctx.moveTo(12, -6.5);
    ctx.lineTo(24, -9.5);
    ctx.lineTo(28, -6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 前端多重稜鏡水晶焦點
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.moveTo(38, -6);
    ctx.lineTo(46, 0);
    ctx.lineTo(38, 6);
    ctx.closePath();
    ctx.fill();

    // 槍口光團
    const rg = ctx.createRadialGradient(44, 0, 1, 44, 0, 8);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.5, '#7df8ff');
    rg.addColorStop(1, 'rgba(125,248,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(44, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    return 46;
  },

  // 17. 相位飛刃 (Phase Blade)
  phase_blade: (ctx, spin, opts) => {
    // 刀柄
    ctx.fillStyle = '#182030';
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(-8, -2.5, 9, 5, 1.5);
    ctx.fill();
    ctx.stroke();

    // 能量發射護手
    ctx.fillStyle = '#3a4962';
    ctx.fillRect(1, -4.5, 2.5, 9);
    ctx.fillStyle = '#00f5ff';
    ctx.fillRect(2, -2, 1.5, 4);

    // 相位能量刀身
    const bg = ctx.createLinearGradient(3.5, -4, 3.5, 4);
    bg.addColorStop(0, 'rgba(0, 245, 255, 0.4)');
    bg.addColorStop(0.5, '#ffffff');
    bg.addColorStop(1, 'rgba(0, 245, 255, 0.85)');
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(3.5, -4);
    ctx.lineTo(27, 0);
    ctx.lineTo(3.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 數位擾動光線
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();

    return 28;
  },

  // 18. 相位風暴 (Phase Storm - Evo)
  phase_storm: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(10, 0);

    // 核心空間扭曲光環
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#4cc9f0');
    g.addColorStop(0.8, '#7209b7');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // 雙刃交錯旋轉
    ctx.save();
    ctx.rotate(spin * 2.4);
    for (let r = -1; r <= 1; r += 2) {
      ctx.save();
      ctx.rotate(r * (Math.PI / 4));
      ctx.fillStyle = '#00f5ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -3.5);
      ctx.lineTo(15, 0);
      ctx.lineTo(0, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
    return 27;
  },

  // 19. 軌道鋸刃 (Orbit Saw)
  orbit_saw: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(11, 0);

    ctx.fillStyle = '#222831';
    ctx.fillRect(-11, -2.5, 6, 5);

    const R = 11;
    ctx.save();
    ctx.rotate(spin * 4);
    ctx.fillStyle = '#495057';
    ctx.strokeStyle = '#212529';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 八片鋸齒
    ctx.fillStyle = '#ff8fab';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 8);
      ctx.beginPath();
      ctx.moveTo(R * 0.8, -2.4);
      ctx.lineTo(R * 1.3, 0);
      ctx.lineTo(R * 0.8, 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 中央馬達軸心
    ctx.fillStyle = '#1c1f26';
    ctx.strokeStyle = '#ced4da';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff8fab';
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return 24;
  },

  // 20. 奇點滅星環 (Singularity Ring - Evo)
  singularity_ring: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(11, 0);

    ctx.fillStyle = '#160d27';
    ctx.fillRect(-11, -2, 6, 4);

    // 引力透鏡外暈
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.5, '#4a0e4e');
    g.addColorStop(0.8, '#c77dff');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // 扭曲吸積環
    ctx.save();
    ctx.rotate(-spin * 2.2);
    ctx.strokeStyle = '#e0aaff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 5.5, -Math.PI / 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 5.5, -Math.PI / 6, Math.PI * 0.3, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();

    // 黑洞核心
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#7b2cbf';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return 26;
  },

  // 21. 極寒冰晶 (Frost Nova)
  frost_nova: (ctx, spin, opts) => {
    // 握把杖身
    ctx.fillStyle = '#1f2e42';
    ctx.strokeStyle = '#0e1724';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-8, -2.4, 18, 4.8, 1.5);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#7fd8ff';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-2, -3, 3, 6);

    // 六角冰花晶體
    const fx = 18;
    ctx.save();
    ctx.translate(fx, 0);
    ctx.rotate(spin * 0.8);

    ctx.strokeStyle = '#7fd8ff';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(9.5, 0);
      ctx.moveTo(6, 0);
      ctx.lineTo(8, -2.5);
      ctx.moveTo(6, 0);
      ctx.lineTo(8, 2.5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return 27;
  },

  // 22. 絕對零度 (Absolute Zero - Evo)
  absolute_zero: (ctx, spin, opts) => {
    ctx.save();
    ctx.translate(12, 0);

    ctx.fillStyle = '#102236';
    ctx.fillRect(-12, -2, 8, 4);

    // 寒氣霧雲
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#b3f0ff');
    g.addColorStop(0.8, '#00b4d8');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // 八向鑽石冰棘
    ctx.save();
    ctx.rotate(spin * 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#0077b6';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(3.5, 5);
      ctx.lineTo(0, 13);
      ctx.lineTo(-3.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 核心冰極之核
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return 28;
  },

  // 23. 戰術霰彈槍 (Shotgun)
  shotgun: (ctx, spin, opts) => {
    // 實木槍托
    ctx.fillStyle = '#8b4513';
    ctx.strokeStyle = '#4a2508';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-2, -3);
    ctx.lineTo(-1, 5);
    ctx.lineTo(-7, 7);
    ctx.lineTo(-11, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 扳機護弓
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-1, 2, 4, 4);

    // 機匣
    ctx.fillStyle = '#3a4454';
    ctx.strokeStyle = '#151922';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(0, -4, 7, 8, 1.5);
    ctx.fill();
    ctx.stroke();

    // 雙聯槍管
    ctx.fillStyle = '#222832';
    ctx.strokeStyle = '#0d1015';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(7, -3.8, 19, 7.6, 1);
    ctx.fill();
    ctx.stroke();

    // 槍管分隔線與散熱肋條
    ctx.strokeStyle = '#4f5d75';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(26, 0);
    ctx.moveTo(7, -3.8);
    ctx.lineTo(26, -3.8);
    ctx.stroke();

    // 實木前護木
    ctx.fillStyle = '#8b4513';
    ctx.strokeStyle = '#4a2508';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(9, 1, 9, 4, 1.5);
    ctx.fill();
    ctx.stroke();

    // 雙槍口
    ctx.fillStyle = '#ff7b00';
    ctx.beginPath();
    ctx.arc(26, -1.8, 1.2, 0, Math.PI * 2);
    ctx.arc(26, 1.8, 1.2, 0, Math.PI * 2);
    ctx.fill();

    return 27;
  },

  // 24. 巨龍吐息 (Dragon Breath - Evo)
  dragon_breath: (ctx, spin, opts) => {
    ctx.fillStyle = '#2b1010';
    ctx.fillRect(-3, 3, 5, 8);

    // 龍頭主砲機體
    ctx.fillStyle = '#6b0000';
    ctx.strokeStyle = '#2d0000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -5.5);
    ctx.lineTo(14, -6.5);
    ctx.lineTo(28, -4);
    ctx.lineTo(33, 0);
    ctx.lineTo(28, 4);
    ctx.lineTo(14, 6.5);
    ctx.lineTo(-6, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 龍角
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(10, -6.5);
    ctx.lineTo(13, -11);
    ctx.lineTo(18, -6.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 龍眼
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(19, -2.5, 2, 0, Math.PI * 2);
    ctx.fill();

    // 龍嘴白牙
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(23 + i * 3, -3);
      ctx.lineTo(24.5 + i * 3, 0);
      ctx.lineTo(26 + i * 3, -3);
      ctx.closePath();
      ctx.fill();
    }

    // 噴口熔岩火暈
    const g = ctx.createRadialGradient(31, 0, 1, 31, 0, 8);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, '#ffcc00');
    g.addColorStop(0.7, '#ff3300');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(31, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    return 34;
  },

  // 25. 帝國爆彈槍 (Bolter)
  bolter: (ctx, spin, opts) => {
    // 握把
    ctx.fillStyle = '#141820';
    ctx.strokeStyle = '#090c10';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(-4, 2, 5.5, 8.5, 1.5);
    ctx.fill();
    ctx.stroke();

    ctx.strokeRect(1, 2, 4, 4.5);

    // 機匣主體
    ctx.fillStyle = '#222831';
    ctx.strokeStyle = '#10141a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-8, -6, 26, 12, 2);
    ctx.fill();
    ctx.stroke();

    // 頂部導軌
    ctx.fillStyle = '#393e46';
    ctx.fillRect(-6, -8, 20, 2);

    // 粗壯槍管與排氣孔
    ctx.fillStyle = '#11151c';
    ctx.strokeStyle = '#080a0e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(18, -4, 10, 8, 1.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.arc(22, -1.8, 1.2, 0, Math.PI * 2);
    ctx.arc(22, 1.8, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // 彎型重型彈匣
    ctx.fillStyle = '#393e46';
    ctx.strokeStyle = '#1a1d24';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(5, 6, 8, 9, 2);
    ctx.fill();
    ctx.stroke();

    // 金色帝國天鷹徽章
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(4, -1, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(1, 1.5, 6, 1.5);

    return 29;
  },

  // 26. 咆哮鏈鋸劍 (Chainsword)
  chainsword: (ctx, spin, opts) => {
    // 握把
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#0d0d0d';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-10, -2.4, 11, 4.8, 1.5);
    ctx.fill();
    ctx.stroke();

    // 劍首配重球
    ctx.fillStyle = '#3a4454';
    ctx.beginPath();
    ctx.arc(-11, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 護手與發動機外殼
    ctx.fillStyle = '#333333';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(1, -6, 6, 12, 1.8);
    ctx.fill();
    ctx.stroke();

    // 排氣口
    ctx.fillStyle = '#555555';
    ctx.fillRect(2, -8, 2, 2.5);
    ctx.fillRect(5, -8, 2, 2.5);

    // 鏈鋸劍身主架構
    ctx.fillStyle = '#ffb703';
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(7, -4.5, 26, 9, 2);
    ctx.fill();
    ctx.stroke();

    // 黑黃警戒條紋
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(7, -4.5, 26, 9, 2);
    ctx.clip();
    ctx.fillStyle = '#1a1a1a';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(9 + i * 6, -5);
      ctx.lineTo(13 + i * 6, -5);
      ctx.lineTo(8 + i * 6, 5);
      ctx.lineTo(4 + i * 6, 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 單分子鏈鋸齒
    ctx.fillStyle = '#e5e5e5';
    ctx.strokeStyle = '#777777';
    ctx.lineWidth = 0.8;
    const toothOff = (opts.time * 25) % 4;
    for (let x = 8; x <= 31; x += 4) {
      const tx = x + toothOff;
      if (tx > 32) continue;
      ctx.beginPath();
      ctx.moveTo(tx, 4.5);
      ctx.lineTo(tx + 2.4, 7.2);
      ctx.lineTo(tx + 3.8, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 刀尖倒鉤齒
    ctx.beginPath();
    ctx.moveTo(33, -3);
    ctx.lineTo(36, 0);
    ctx.lineTo(33, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return 36;
  },

  // 27. 神聖風暴爆彈槍 (Storm Bolter - Evo)
  storm_bolter: (ctx, spin, opts) => {
    ctx.fillStyle = '#141820';
    ctx.fillRect(-4, 3, 6, 9);
    ctx.strokeRect(-4, 3, 6, 9);

    // 雙聯重型機匣
    ctx.fillStyle = '#1f242d';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(-8, -8, 28, 16, 2.5);
    ctx.fill();
    ctx.stroke();

    // 雙聯重型槍管
    ctx.fillStyle = '#11151c';
    ctx.strokeStyle = '#080a0e';
    ctx.lineWidth = 1.2;
    ctx.fillRect(20, -6.5, 12, 5);
    ctx.strokeRect(20, -6.5, 12, 5);
    ctx.fillRect(20, 1.5, 12, 5);
    ctx.strokeRect(20, 1.5, 12, 5);

    // 雙槍口火光微芒
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(30, -5, 2.5, 2.5);
    ctx.fillRect(30, 2.5, 2.5, 2.5);

    // 大容量箱型彈匣
    ctx.fillStyle = '#2b303c';
    ctx.strokeStyle = '#12151c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(4, 8, 12, 9, 2);
    ctx.fill();
    ctx.stroke();

    // 金色雙頭天鷹翼徽章
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(2, -3);
    ctx.lineTo(12, -3);
    ctx.lineTo(15, -6);
    ctx.lineTo(8, -4);
    ctx.lineTo(2, -6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();

    return 33;
  },

  // 28. 帝皇動力神劍 (Power Sword - Evo)
  power_sword: (ctx, spin, opts) => {
    // 劍柄與能量電池柄底
    ctx.fillStyle = '#11151c';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-10, -2.2, 11, 4.4, 1.2);
    ctx.fill();
    ctx.stroke();

    // 劍底藍色動力電池
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.arc(-11, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 金色十字天鷹護手
    ctx.fillStyle = '#ffd166';
    ctx.strokeStyle = '#997300';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(1, -7.5);
    ctx.lineTo(4, -8);
    ctx.lineTo(3.5, 8);
    ctx.lineTo(1, 7.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 雙刃銀白劍刃
    const bg = ctx.createLinearGradient(3.5, -4, 3.5, 4);
    bg.addColorStop(0, '#d8e8f8');
    bg.addColorStop(0.5, '#ffffff');
    bg.addColorStop(1, '#90b4d8');
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#1a3048';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(3.5, -3.8);
    ctx.lineTo(38, 0);
    ctx.lineTo(3.5, 3.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 劍脊湛藍解離力場導軌
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(34, 0);
    ctx.stroke();

    return 38;
  },

  // 額外支援：電鑽 (Drill)
  drill: (ctx, spin, opts) => {
    ctx.fillStyle = '#3a4152';
    ctx.strokeStyle = '#181d24';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-7, -4, 11, 8, 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffb703';
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(4, -4.5);
    ctx.lineTo(26, 0);
    ctx.lineTo(4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.2;
    const dOff = (opts.time * 20) % 5;
    for (let i = 0; i < 4; i++) {
      const tx = 5 + i * 5 + dOff;
      if (tx > 24) continue;
      ctx.beginPath();
      ctx.moveTo(tx, -3.5);
      ctx.lineTo(tx - 3, 3.5);
      ctx.stroke();
    }
    return 27;
  },
};

// ── 武器掛載點 ──────────────────────────────────────────────────────────
// 為什麼不是「四把都拿在手上」：實測四把武器共用同一個手部原點時，兩兩重疊率高達 54~99%
// （kunai/rocket 87%、rocket/molotov 99%），而且火箭/軌道炮這種長管武器會直接橫在角色臉上。
// 改成「一手追瞄 + 背/腰掛載」：主手那一把會轉向敵人，其餘以固定角度背在身上，
// 位置也刻意留在角色輪廓之外（dx 13~-13、dy -7~16），四把同時出現時仍看得出各自是什麼。
//   dx 往面向方向為正、dy 往螢幕下方為正、angle 是「面向右」時的角度、layer 決定畫在角色前或後
export const HELD_MOUNTS = [
  { dx: 13, dy: 7, scale: 1.00, aim: true, layer: 'front' },       // 主手：追瞄敵人
  { dx: -10, dy: -14, angle: -2.08, scale: 0.85, layer: 'back' },  // 斜背在肩後（露出上半，不壓到頭頂）
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
  let tip = a.len;

  const pngImg = weaponImages.get(id);
  if (pngImg && (pngImg.complete || pngImg.width > 0)) {
    // ── PNG 貼圖渲染模式 ────────────────────────────────────
    const cfg = WEAPON_PNG_CONFIG[id] || {
      anchorX: (pngImg.width || 32) * 0.25,
      anchorY: (pngImg.height || 32) * 0.5,
      renderW: a.len * 1.25,
      renderH: ((pngImg.height || 32) / (pngImg.width || 32)) * a.len * 1.25,
      tipX: a.len,
    };
    ctx.drawImage(pngImg, -cfg.anchorX, -cfg.anchorY, cfg.renderW, cfg.renderH);
    tip = cfg.tipX || a.len;
  } else {
    // ── Canvas 程序化繪圖模式 (Fallback 安全後備) ──────────
    const drawer = HELD_DRAWERS[id];
    if (drawer) {
      tip = drawer(ctx, spin, opts);
    }
  }

  // 刀刃揮砍弧光 (Slash Arc)
  if (a.family === 'blade' && (muzzle > 0.05 || recoil > 0.05)) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const arcPower = Math.max(muzzle, recoil);
    ctx.globalAlpha = arcPower * 0.85;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(tip * 0.6, 0, tip * 0.75, -Math.PI * 0.38, Math.PI * 0.38);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(tip * 0.6, 0, tip * 0.75, -Math.PI * 0.25, Math.PI * 0.25);
    ctx.stroke();
    ctx.restore();
  }

  // 電弧枝椏 (Electric Discharges)
  if (a.family === 'coil' && muzzle > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = muzzle * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 3.5;
      ctx.beginPath();
      ctx.moveTo(tip, off);
      ctx.lineTo(tip + 8 * muzzle, off + (i % 2 === 0 ? 4 : -4));
      ctx.lineTo(tip + 16 * muzzle, off);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 槍口火光 (Muzzle Flash)
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
