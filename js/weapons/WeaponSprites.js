// 武器與配件 Sprite 烘焙系統
// 為全遊戲 24 種武器與 12 種配件提供精靈圖示（Retina 2x），
// 取代原本跨平台外觀不一的 Emoji，並提供手持開火與攻擊動畫幀。

const SS = 2; // 超取樣倍率 (64x64 Retina)
const ICON_SIZE = 64;

// 緩存表：id -> dataURL
const iconDataUrls = new Map();
const iconCanvases = new Map();

// ── 輔助繪圖工具 ────────────────────────────────────────────────────────
function makeIcon(draw) {
  const c = document.createElement('canvas');
  c.width = ICON_SIZE * SS;
  c.height = ICON_SIZE * SS;
  const x = c.getContext('2d');
  x.scale(SS, SS);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  draw(x, ICON_SIZE, ICON_SIZE);
  return c;
}

// 底板與外框
function drawBadge(x, isEvo, accentColor = '#4cc9f0') {
  const w = ICON_SIZE;
  const pad = 4;
  const r = isEvo ? 14 : 12;

  // 外部陰影
  x.save();
  x.shadowColor = isEvo ? accentColor : 'rgba(0,0,0,0.5)';
  x.shadowBlur = isEvo ? 12 : 6;

  // 底板漸層
  const bgGrad = x.createLinearGradient(0, 0, 0, w);
  if (isEvo) {
    bgGrad.addColorStop(0, '#241b38');
    bgGrad.addColorStop(0.5, '#161324');
    bgGrad.addColorStop(1, '#0e0b17');
  } else {
    bgGrad.addColorStop(0, '#1c2434');
    bgGrad.addColorStop(0.5, '#131924');
    bgGrad.addColorStop(1, '#0c1017');
  }
  x.fillStyle = bgGrad;
  x.beginPath();
  x.roundRect(pad, pad, w - pad * 2, w - pad * 2, r);
  x.fill();
  x.restore();

  // 內底微光
  const radial = x.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w * 0.45);
  radial.addColorStop(0, isEvo ? 'rgba(255,209,102,0.18)' : 'rgba(0,229,255,0.12)');
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = radial;
  x.beginPath();
  x.roundRect(pad + 1, pad + 1, w - pad * 2 - 2, w - pad * 2 - 2, r - 1);
  x.fill();

  // 外框高光
  x.lineWidth = isEvo ? 2 : 1.5;
  const borderGrad = x.createLinearGradient(0, 0, w, w);
  if (isEvo) {
    borderGrad.addColorStop(0, '#ffe066');
    borderGrad.addColorStop(0.5, '#ffd166');
    borderGrad.addColorStop(1, '#b5179e');
  } else {
    borderGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
    borderGrad.addColorStop(0.6, 'rgba(100,160,255,0.3)');
    borderGrad.addColorStop(1, 'rgba(0,229,255,0.2)');
  }
  x.strokeStyle = borderGrad;
  x.beginPath();
  x.roundRect(pad, pad, w - pad * 2, w - pad * 2, r);
  x.stroke();

  // 超武專屬：左上角金色菱形徽記
  if (isEvo) {
    x.fillStyle = '#ffd166';
    x.beginPath();
    x.moveTo(pad + 6, pad + 2);
    x.lineTo(pad + 9, pad + 6);
    x.lineTo(pad + 6, pad + 10);
    x.lineTo(pad + 3, pad + 6);
    x.closePath();
    x.fill();
  }
}

// ── 武器主體繪製邏輯 ──────────────────────────────────────────────────
const WEAPON_DRAWERS = {
  // 1. 苦無 (Kunai)
  kunai: (x, w, h) => {
    drawBadge(x, false, '#00e5ff');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 刀身暗色基底
    x.fillStyle = '#2a3547';
    x.beginPath();
    x.moveTo(0, -20);
    x.lineTo(7, -2);
    x.lineTo(3, 10);
    x.lineTo(-3, 10);
    x.lineTo(-7, -2);
    x.closePath();
    x.fill();
    // 鋼刃漸層
    const bladeGrad = x.createLinearGradient(-7, 0, 7, 0);
    bladeGrad.addColorStop(0, '#cce3ff');
    bladeGrad.addColorStop(0.5, '#ffffff');
    bladeGrad.addColorStop(1, '#7eaaff');
    x.fillStyle = bladeGrad;
    x.beginPath();
    x.moveTo(0, -19);
    x.lineTo(5.5, -2);
    x.lineTo(2, 8);
    x.lineTo(-2, 8);
    x.lineTo(-5.5, -2);
    x.closePath();
    x.fill();
    // 能量槽 (Cyan)
    x.strokeStyle = '#00f5ff';
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(0, -14);
    x.lineTo(0, 6);
    x.stroke();
    // 握把繃帶
    x.fillStyle = '#10141d';
    x.fillRect(-2.5, 9, 5, 8);
    x.strokeStyle = '#e2711d';
    x.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(-2.5, 10 + i * 2.5);
      x.lineTo(2.5, 12 + i * 2.5);
      x.stroke();
    }
    // 環形圓尾
    x.strokeStyle = '#8ea1b8';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(0, 20, 3.5, 0, Math.PI * 2);
    x.stroke();
    x.restore();
  },

  // 2. 幽靈手裏劍 (Ghost Shuriken - Evo)
  ghost_shuriken: (x, w, h) => {
    drawBadge(x, true, '#b98cff');
    x.save();
    x.translate(w / 2, h / 2);
    // 紫色幽能光環
    const g = x.createRadialGradient(0, 0, 2, 0, 0, 18);
    g.addColorStop(0, 'rgba(215,130,255,0.6)');
    g.addColorStop(0.5, 'rgba(150,50,255,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 18, 0, Math.PI * 2);
    x.fill();
    // 四片彎月幽靈刃
    for (let i = 0; i < 4; i++) {
      x.save();
      x.rotate((i * Math.PI) / 2);
      x.fillStyle = '#b98cff';
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(10, -5, 18, 0);
      x.quadraticCurveTo(8, 6, 0, 0);
      x.fill();
      // 刃尖亮線
      x.strokeStyle = '#ffffff';
      x.lineWidth = 1.2;
      x.stroke();
      x.restore();
    }
    // 核心幽火
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(0, 0, 3.5, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#e0aaff';
    x.lineWidth = 1.5;
    x.stroke();
    x.restore();
  },

  // 3. 守護輪盤 (Guardian)
  guardian: (x, w, h) => {
    drawBadge(x, false, '#4cc9f0');
    x.save();
    x.translate(w / 2, h / 2);
    // 能量力場外環
    x.strokeStyle = 'rgba(76,201,240,0.35)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(0, 0, 18, 0, Math.PI * 2);
    x.stroke();
    // 旋轉偏折無人機 / 刀片
    for (let i = 0; i < 3; i++) {
      x.save();
      x.rotate((i * Math.PI * 2) / 3);
      x.fillStyle = '#4cc9f0';
      x.beginPath();
      x.roundRect(10, -3.5, 10, 7, 2);
      x.fill();
      x.fillStyle = '#ffffff';
      x.fillRect(15, -1.5, 3, 3);
      x.restore();
    }
    // 中央主體
    x.fillStyle = '#1e283d';
    x.beginPath();
    x.arc(0, 0, 9, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#4cc9f0';
    x.lineWidth = 2;
    x.stroke();
    x.fillStyle = '#00f5ff';
    x.beginPath();
    x.arc(0, 0, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 4. 永恆領域 (Eternal Domain - Evo)
  eternal_domain: (x, w, h) => {
    drawBadge(x, true, '#ffd166');
    x.save();
    x.translate(w / 2, h / 2);
    // 金色聖光脈衝
    const g = x.createRadialGradient(0, 0, 4, 0, 0, 20);
    g.addColorStop(0, 'rgba(255,230,120,0.7)');
    g.addColorStop(0.5, 'rgba(255,183,3,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 20, 0, Math.PI * 2);
    x.fill();
    // 神聖雙重符文輪
    x.strokeStyle = '#ffd166';
    x.lineWidth = 1.8;
    x.beginPath();
    x.arc(0, 0, 16, 0, Math.PI * 2);
    x.stroke();
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      x.save();
      x.rotate(ang);
      x.fillStyle = '#fff4cc';
      x.beginPath();
      x.moveTo(13, -2.5);
      x.lineTo(19, 0);
      x.lineTo(13, 2.5);
      x.closePath();
      x.fill();
      x.restore();
    }
    // 核心金色寶珠
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(0, 0, 6, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#ffb703';
    x.lineWidth = 2;
    x.stroke();
    x.restore();
  },

  // 5. 高爆火箭筒 (Rocket)
  rocket: (x, w, h) => {
    drawBadge(x, false, '#ff7b00');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 發射筒本體
    x.fillStyle = '#2c3340';
    x.beginPath();
    x.roundRect(-8, -16, 16, 32, 3);
    x.fill();
    // 筒身塗裝與警戒條紋
    x.fillStyle = '#ff7b00';
    x.fillRect(-7, -6, 14, 12);
    x.fillStyle = '#222630';
    for (let i = -1; i <= 1; i++) {
      x.beginPath();
      x.moveTo(-7, i * 4);
      x.lineTo(-3, i * 4);
      x.lineTo(7, i * 4 + 4);
      x.lineTo(3, i * 4 + 4);
      x.closePath();
      x.fill();
    }
    // 筒口導彈頭露出一截
    x.fillStyle = '#ff3b30';
    x.beginPath();
    x.arc(0, -16, 6, Math.PI, 0);
    x.fill();
    x.fillStyle = '#ffffff';
    x.fillRect(-1.5, -20, 3, 4);
    // 握把與瞄具
    x.fillStyle = '#505a6e';
    x.fillRect(-12, -4, 4, 8); // 側邊瞄準器
    x.fillRect(2, 12, 5, 8);   // 底部扳機握把
    x.restore();
  },

  // 6. 狂鯊魚雷 (Shark Torpedo - Evo)
  shark_torpedo: (x, w, h) => {
    drawBadge(x, true, '#4cc9f0');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 狂鯊魚雷主體 (深藍精鋼)
    x.fillStyle = '#193354';
    x.beginPath();
    x.moveTo(0, -22);
    x.quadraticCurveTo(10, -8, 8, 16);
    x.lineTo(-8, 16);
    x.quadraticCurveTo(-10, -8, 0, -22);
    x.closePath();
    x.fill();
    // 鯊魚銳利鋼牙
    x.fillStyle = '#ffffff';
    for (let i = -6; i <= 4; i += 3) {
      x.beginPath();
      x.moveTo(i, -6);
      x.lineTo(i + 1.5, -2);
      x.lineTo(i + 3, -6);
      x.fill();
    }
    // 狂怒紅眼
    x.fillStyle = '#ff1744';
    x.beginPath();
    x.arc(-4, -12, 2, 0, Math.PI * 2);
    x.arc(4, -12, 2, 0, Math.PI * 2);
    x.fill();
    // 尾部推進鰭片與水下光焰
    x.fillStyle = '#00f5ff';
    x.beginPath();
    x.moveTo(-8, 16);
    x.lineTo(-14, 22);
    x.lineTo(14, 22);
    x.lineTo(8, 16);
    x.fill();
    x.restore();
  },

  // 7. 燃燒瓶 (Molotov)
  molotov: (x, w, h) => {
    drawBadge(x, false, '#ffb703');
    x.save();
    x.translate(w / 2, h / 2);
    // 玻璃瓶身
    x.fillStyle = 'rgba(70,120,60,0.85)';
    x.beginPath();
    x.roundRect(-8, -4, 16, 20, 4);
    x.fill();
    // 瓶頸
    x.fillRect(-4, -12, 8, 8);
    // 瓶內燃燒油液
    x.fillStyle = '#ff9f1c';
    x.beginPath();
    x.roundRect(-6, 2, 12, 12, 2);
    x.fill();
    // 燃燒布條 (焰心與火舌)
    x.fillStyle = '#ffffff';
    x.fillRect(-2, -15, 4, 4);
    // 火舌
    const flm = x.createRadialGradient(0, -18, 1, 0, -18, 9);
    flm.addColorStop(0, '#ffffff');
    flm.addColorStop(0.3, '#ffe066');
    flm.addColorStop(0.7, '#ff5722');
    flm.addColorStop(1, 'rgba(255,30,0,0)');
    x.fillStyle = flm;
    x.beginPath();
    x.arc(0, -18, 9, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 8. 末日炎海 (Napalm Sea - Evo)
  napalm_sea: (x, w, h) => {
    drawBadge(x, true, '#ff5722');
    x.save();
    x.translate(w / 2, h / 2);
    // 地獄烈火光環
    const g = x.createRadialGradient(0, 0, 4, 0, 0, 20);
    g.addColorStop(0, 'rgba(255,240,180,0.8)');
    g.addColorStop(0.4, 'rgba(255,100,0,0.6)');
    g.addColorStop(0.8, 'rgba(180,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 20, 0, Math.PI * 2);
    x.fill();
    // 噴射鋼罐
    x.fillStyle = '#2b1b1b';
    x.beginPath();
    x.roundRect(-9, -10, 18, 22, 4);
    x.fill();
    x.fillStyle = '#ff3d00';
    x.fillRect(-7, -4, 14, 8);
    // 頂部高壓火焰噴口 (藍白高溫核心)
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.moveTo(0, -18);
    x.lineTo(6, -9);
    x.lineTo(-6, -9);
    x.closePath();
    x.fill();
    x.strokeStyle = '#00e5ff';
    x.lineWidth = 1.5;
    x.stroke();
    x.restore();
  },

  // 9. 磁暴線圈 (Lightning)
  lightning: (x, w, h) => {
    drawBadge(x, false, '#7df8ff');
    x.save();
    x.translate(w / 2, h / 2);
    // 特斯拉線圈柱身
    x.fillStyle = '#222938';
    x.fillRect(-5, -6, 10, 22);
    // 銅質纏繞線圈
    x.strokeStyle = '#ffb703';
    x.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(-6, -3 + i * 5);
      x.lineTo(6, -1 + i * 5);
      x.stroke();
    }
    // 頂端放電圓球
    const g = x.createRadialGradient(0, -11, 1, 0, -11, 11);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#7df8ff');
    g.addColorStop(0.8, '#0099ff');
    g.addColorStop(1, 'rgba(0,100,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, -11, 11, 0, Math.PI * 2);
    x.fill();
    // 電漿放電火花
    x.strokeStyle = '#ffffff';
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(-3, -15);
    x.lineTo(0, -11);
    x.lineTo(5, -16);
    x.stroke();
    x.restore();
  },

  // 10. 電漿風暴 (Plasma Storm - Evo)
  plasma_storm: (x, w, h) => {
    drawBadge(x, true, '#c77dff');
    x.save();
    x.translate(w / 2, h / 2);
    // 狂暴雷雲光暈
    const g = x.createRadialGradient(0, 0, 3, 0, 0, 20);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(199,125,255,0.7)');
    g.addColorStop(0.7, 'rgba(114,9,183,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 20, 0, Math.PI * 2);
    x.fill();
    // 磁場束縛環
    x.strokeStyle = '#e0aaff';
    x.lineWidth = 1.8;
    x.beginPath();
    x.ellipse(0, 0, 16, 7, Math.PI / 4, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.ellipse(0, 0, 16, 7, -Math.PI / 4, 0, Math.PI * 2);
    x.stroke();
    // 暴風閃電折線
    x.strokeStyle = '#ffffff';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(-4, -14);
    x.lineTo(2, -4);
    x.lineTo(-3, 3);
    x.lineTo(5, 13);
    x.stroke();
    x.restore();
  },

  // 11. 量子足球 (Soccer)
  soccer: (x, w, h) => {
    drawBadge(x, false, '#00e5ff');
    x.save();
    x.translate(w / 2, h / 2);
    // 足球球體
    x.fillStyle = '#eaf6ff';
    x.beginPath();
    x.arc(0, 0, 15, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#00e5ff';
    x.lineWidth = 2;
    x.stroke();
    // 賽博六邊形紋路
    x.fillStyle = '#0077b6';
    x.beginPath();
    x.moveTo(0, -6);
    x.lineTo(5, -3);
    x.lineTo(5, 3);
    x.lineTo(0, 6);
    x.lineTo(-5, 3);
    x.lineTo(-5, -3);
    x.closePath();
    x.fill();
    // 能量動態軌跡光圈
    x.strokeStyle = 'rgba(0,229,255,0.6)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(-4, -4, 18, 0.4, 2.5);
    x.stroke();
    x.restore();
  },

  // 12. 量子裂變球 (Quantum Sphere - Evo)
  quantum_sphere: (x, w, h) => {
    drawBadge(x, true, '#00f59b');
    x.save();
    x.translate(w / 2, h / 2);
    // 翡翠核能裂變環
    const g = x.createRadialGradient(0, 0, 2, 0, 0, 19);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(0,245,155,0.7)');
    g.addColorStop(0.7, 'rgba(0,150,100,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 19, 0, Math.PI * 2);
    x.fill();
    // 三環原子軌道
    for (let i = 0; i < 3; i++) {
      x.save();
      x.rotate((i * Math.PI) / 3);
      x.strokeStyle = '#70e000';
      x.lineWidth = 1.6;
      x.beginPath();
      x.ellipse(0, 0, 17, 6, 0, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(17, 0, 2, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    // 裂變中心黑洞/白熱點
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(0, 0, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 13. 獵鷹迴力鏢 (Boomerang)
  boomerang: (x, w, h) => {
    drawBadge(x, false, '#ffd166');
    x.save();
    x.translate(w / 2, h / 2);
    // V 字金色合金迴力鏢
    x.fillStyle = '#ffd166';
    x.beginPath();
    x.moveTo(0, 10);
    x.lineTo(16, -12);
    x.lineTo(11, -15);
    x.lineTo(0, 2);
    x.lineTo(-11, -15);
    x.lineTo(-16, -12);
    x.closePath();
    x.fill();
    // 氣動高光邊緣
    x.strokeStyle = '#ffffff';
    x.lineWidth = 1.2;
    x.stroke();
    // 握把中樞
    x.fillStyle = '#222938';
    x.beginPath();
    x.arc(0, 4, 3, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 14. 雙子風暴 (Twin Storm - Evo)
  twin_storm: (x, w, h) => {
    drawBadge(x, true, '#ffe066');
    x.save();
    x.translate(w / 2, h / 2);
    // 旋風氣流環
    x.strokeStyle = 'rgba(255,224,102,0.4)';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(0, 0, 18, 0, Math.PI * 2);
    x.stroke();
    // 雙十字交錯光刃
    for (let r = -1; r <= 1; r += 2) {
      x.save();
      x.rotate(r * (Math.PI / 4));
      x.fillStyle = '#ffe066';
      x.beginPath();
      x.moveTo(0, 8);
      x.lineTo(15, -10);
      x.lineTo(10, -13);
      x.lineTo(0, 0);
      x.lineTo(-10, -13);
      x.lineTo(-15, -10);
      x.closePath();
      x.fill();
      x.restore();
    }
    // 核心風暴眼
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(0, 0, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 15. 重型軌道炮 (Railgun)
  railgun: (x, w, h) => {
    drawBadge(x, false, '#7df8ff');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 雙導軌槍管
    x.fillStyle = '#202636';
    x.fillRect(-6, -18, 12, 34);
    // 軌道加速條 (電光藍)
    x.fillStyle = '#00f5ff';
    x.fillRect(-4, -16, 2, 28);
    x.fillRect(2, -16, 2, 28);
    // 槍口能量聚焦
    x.fillStyle = '#ffffff';
    x.fillRect(-5, -20, 10, 3);
    // 散熱散片
    x.strokeStyle = '#8ea1b8';
    x.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(-8, -8 + i * 5);
      x.lineTo(-6, -8 + i * 5);
      x.moveTo(6, -8 + i * 5);
      x.lineTo(8, -8 + i * 5);
      x.stroke();
    }
    x.restore();
  },

  // 16. 湮滅光束 (Annihilation Beam - Evo)
  annihilation_beam: (x, w, h) => {
    drawBadge(x, true, '#7df8ff');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 毀滅粒子聚焦光束
    const g = x.createRadialGradient(0, -18, 2, 0, -18, 16);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#7df8ff');
    g.addColorStop(0.8, '#3a0ca3');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, -18, 16, 0, Math.PI * 2);
    x.fill();
    // 重型外骨架
    x.fillStyle = '#181b24';
    x.beginPath();
    x.roundRect(-8, -12, 16, 28, 4);
    x.fill();
    // 稜鏡水晶發射陣列
    x.fillStyle = '#00f5ff';
    x.beginPath();
    x.moveTo(0, -22);
    x.lineTo(6, -10);
    x.lineTo(-6, -10);
    x.closePath();
    x.fill();
    x.restore();
  },

  // 17. 相位飛刃 (Phase Blade)
  phase_blade: (x, w, h) => {
    drawBadge(x, false, '#7df8ff');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 高科技量子相位刃
    x.fillStyle = '#1d2a44';
    x.fillRect(-2, 6, 4, 12);
    // 刀身 (青藍透明相位能量)
    const blade = x.createLinearGradient(-8, 0, 8, 0);
    blade.addColorStop(0, 'rgba(0,245,255,0.3)');
    blade.addColorStop(0.5, '#ffffff');
    blade.addColorStop(1, 'rgba(0,245,255,0.9)');
    x.fillStyle = blade;
    x.beginPath();
    x.moveTo(0, -22);
    x.lineTo(6, 4);
    x.lineTo(-6, 4);
    x.closePath();
    x.fill();
    // 數位擾動線條
    x.strokeStyle = '#00f5ff';
    x.lineWidth = 1.2;
    x.stroke();
    x.restore();
  },

  // 18. 相位風暴 (Phase Storm - Evo)
  phase_storm: (x, w, h) => {
    drawBadge(x, true, '#7df8ff');
    x.save();
    x.translate(w / 2, h / 2);
    // 雙刀交錯相位渦流
    for (let r = -1; r <= 1; r += 2) {
      x.save();
      x.rotate(r * (Math.PI / 4));
      x.fillStyle = '#00f5ff';
      x.beginPath();
      x.moveTo(0, -20);
      x.lineTo(5, 5);
      x.lineTo(-5, 5);
      x.closePath();
      x.fill();
      x.restore();
    }
    // 核心空間扭曲
    const g = x.createRadialGradient(0, 0, 2, 0, 0, 14);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#4cc9f0');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 14, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 19. 軌道鋸刃 (Orbit Saw)
  orbit_saw: (x, w, h) => {
    drawBadge(x, false, '#ff8fab');
    x.save();
    x.translate(w / 2, h / 2);
    // 工業鋼鋸齒輪
    const R = 15;
    x.fillStyle = '#3a4152';
    x.beginPath();
    x.arc(0, 0, R, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ff8fab';
    for (let i = 0; i < 8; i++) {
      x.save();
      x.rotate((i * Math.PI * 2) / 8);
      x.beginPath();
      x.moveTo(R * 0.8, -3);
      x.lineTo(R * 1.25, 0);
      x.lineTo(R * 0.8, 3);
      x.closePath();
      x.fill();
      x.restore();
    }
    // 中央馬達軸心
    x.fillStyle = '#1c1f26';
    x.beginPath();
    x.arc(0, 0, 6, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 1.5;
    x.stroke();
    x.restore();
  },

  // 20. 奇點滅星環 (Singularity Ring - Evo)
  singularity_ring: (x, w, h) => {
    drawBadge(x, true, '#c77dff');
    x.save();
    x.translate(w / 2, h / 2);
    // 宇宙事件視界暗斑
    const g = x.createRadialGradient(0, 0, 3, 0, 0, 19);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.5, '#4a0e4e');
    g.addColorStop(0.8, '#c77dff');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 19, 0, Math.PI * 2);
    x.fill();
    // 扭曲吸積環
    x.strokeStyle = '#e0aaff';
    x.lineWidth = 2.5;
    x.beginPath();
    x.ellipse(0, 0, 17, 7, -Math.PI / 6, 0, Math.PI * 2);
    x.stroke();
    x.restore();
  },

  // 21. 極寒冰晶 (Frost Nova)
  frost_nova: (x, w, h) => {
    drawBadge(x, false, '#7fd8ff');
    x.save();
    x.translate(w / 2, h / 2);
    // 六角冰花晶體
    x.strokeStyle = '#7fd8ff';
    x.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      x.save();
      x.rotate((i * Math.PI) / 3);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(0, -17);
      x.moveTo(0, -11);
      x.lineTo(-4, -14);
      x.moveTo(0, -11);
      x.lineTo(4, -14);
      x.stroke();
      x.restore();
    }
    // 冰晶中心
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(0, 0, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 22. 絕對零度 (Absolute Zero - Evo)
  absolute_zero: (x, w, h) => {
    drawBadge(x, true, '#e0fbff');
    x.save();
    x.translate(w / 2, h / 2);
    // 零度寒氣霧雲
    const g = x.createRadialGradient(0, 0, 3, 0, 0, 20);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#b3f0ff');
    g.addColorStop(0.8, '#00b4d8');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 20, 0, Math.PI * 2);
    x.fill();
    // 堅固鑽石冰棘
    x.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 8; i++) {
      x.save();
      x.rotate((i * Math.PI) / 4);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(3, -8);
      x.lineTo(0, -19);
      x.lineTo(-3, -8);
      x.closePath();
      x.fill();
      x.restore();
    }
    x.restore();
  },

  // 23. 戰術霰彈槍 (Shotgun)
  shotgun: (x, w, h) => {
    drawBadge(x, false, '#ffb347');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 雙管槍管
    x.fillStyle = '#3a4152';
    x.fillRect(-6, -16, 5, 26);
    x.fillRect(1, -16, 5, 26);
    // 實木槍托與護木
    x.fillStyle = '#8b4513';
    x.beginPath();
    x.roundRect(-4, 8, 8, 12, 2);
    x.fill();
    // 散彈槍彈丸扇形噴射示意
    x.fillStyle = '#ff7b00';
    x.beginPath();
    x.arc(-3, -19, 2, 0, Math.PI * 2);
    x.arc(3, -19, 2, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 24. 巨龍吐息 (Dragon Breath - Evo)
  dragon_breath: (x, w, h) => {
    drawBadge(x, true, '#ff5722');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 巨龍頭部造形主砲
    x.fillStyle = '#6b0000';
    x.beginPath();
    x.moveTo(0, -22);
    x.lineTo(10, -6);
    x.lineTo(6, 16);
    x.lineTo(-6, 16);
    x.lineTo(-10, -6);
    x.closePath();
    x.fill();
    // 龍牙與噴口
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.moveTo(-6, -10);
    x.lineTo(-4, -6);
    x.lineTo(-2, -10);
    x.lineTo(0, -6);
    x.lineTo(2, -10);
    x.lineTo(4, -6);
    x.lineTo(6, -10);
    x.fill();
    // 噴發熔岩烈焰
    const g = x.createRadialGradient(0, -20, 1, 0, -20, 12);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, '#ffcc00');
    g.addColorStop(0.7, '#ff3300');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, -20, 12, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 25. 帝國爆彈槍 (Bolter)
  bolter: (x, w, h) => {
    drawBadge(x, false, '#ffb703');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 6);
    // 重型槍身
    x.fillStyle = '#222831';
    x.beginPath();
    x.roundRect(-16, -7, 32, 14, 2);
    x.fill();
    x.strokeStyle = '#393e46';
    x.lineWidth = 1;
    x.stroke();
    // 粗重槍管與開口
    x.fillStyle = '#11151c';
    x.fillRect(16, -5, 6, 10);
    x.fillStyle = '#ffb703';
    x.fillRect(20, -3, 2, 6);
    // 彈匣
    x.fillStyle = '#393e46';
    x.beginPath();
    x.roundRect(-6, 7, 10, 10, 2);
    x.fill();
    // 雙頭鷹或金色骷髏標記
    x.fillStyle = '#ffd166';
    x.beginPath();
    x.arc(-4, -1, 3.5, 0, Math.PI * 2);
    x.fill();
    x.fillRect(-7, 2, 6, 2);
    x.restore();
  },

  // 26. 咆哮鏈鋸劍 (Chainsword)
  chainsword: (x, w, h) => {
    drawBadge(x, false, '#e63946');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 劍身骨架 (工業黃底)
    x.fillStyle = '#ffb703';
    x.beginPath();
    x.roundRect(-6, -22, 12, 28, 2);
    x.fill();
    // 黑黃警戒條紋 (Hazard Stripes)
    x.fillStyle = '#1a1a1a';
    for (let i = -18; i < 4; i += 7) {
      x.beginPath();
      x.moveTo(-6, i);
      x.lineTo(6, i - 4);
      x.lineTo(6, i - 1);
      x.lineTo(-6, i + 3);
      x.closePath();
      x.fill();
    }
    // 鏈鋸單分子鋸齒
    x.fillStyle = '#e5e5e5';
    for (let y = -22; y <= 4; y += 4.5) {
      x.beginPath();
      x.moveTo(6, y);
      x.lineTo(10, y + 2.2);
      x.lineTo(6, y + 4.4);
      x.closePath();
      x.fill();
    }
    // 護手與發動機外殼
    x.fillStyle = '#333333';
    x.fillRect(-9, 5, 18, 6);
    // 劍柄
    x.fillStyle = '#111111';
    x.fillRect(-3, 11, 6, 11);
    x.restore();
  },

  // 27. 神聖風暴爆彈槍 (Storm Bolter - Evo)
  storm_bolter: (x, w, h) => {
    drawBadge(x, true, '#ffd166');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 6);
    // 雙聯重型槍機
    x.fillStyle = '#1f242d';
    x.beginPath();
    x.roundRect(-18, -11, 34, 22, 3);
    x.fill();
    x.strokeStyle = '#ffd166';
    x.lineWidth = 1;
    x.stroke();
    // 雙聯槍管
    x.fillStyle = '#11151c';
    x.fillRect(16, -8, 8, 6);
    x.fillRect(16, 2, 8, 6);
    // 金色雙槍口火光微芒
    x.fillStyle = '#ffcc00';
    x.fillRect(22, -6, 3, 3);
    x.fillRect(22, 4, 3, 3);
    // 大容量加寬箱型彈匣
    x.fillStyle = '#2b303c';
    x.fillRect(-8, 11, 14, 11);
    // 金色雙頭天鷹翼徽章 (Aquila)
    x.fillStyle = '#ffd166';
    x.beginPath();
    x.moveTo(-4, -4);
    x.lineTo(4, -4);
    x.lineTo(8, -8);
    x.lineTo(-8, -8);
    x.closePath();
    x.fill();
    x.arc(0, 0, 3, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  // 28. 帝皇動力神劍 (Power Sword - Evo)
  power_sword: (x, w, h) => {
    drawBadge(x, true, '#00d4ff');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    // 解離力場外暈
    x.shadowColor = '#00f5ff';
    x.shadowBlur = 10;
    // 銀白主劍刃
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.moveTo(0, -25);
    x.lineTo(5, -18);
    x.lineTo(4, 5);
    x.lineTo(-4, 5);
    x.lineTo(-5, -18);
    x.closePath();
    x.fill();
    // 劍脊湛藍能量導軌
    x.strokeStyle = '#00d4ff';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -22);
    x.lineTo(0, 4);
    x.stroke();
    // 金色天鷹十字護手
    x.shadowBlur = 0;
    x.fillStyle = '#ffd166';
    x.beginPath();
    x.moveTo(-11, 5);
    x.lineTo(11, 5);
    x.lineTo(8, 9);
    x.lineTo(-8, 9);
    x.closePath();
    x.fill();
    // 劍柄與能量電池柄底
    x.fillStyle = '#11151c';
    x.fillRect(-2.5, 9, 5, 10);
    x.fillStyle = '#00d4ff';
    x.beginPath();
    x.arc(0, 20, 3, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },
};

// ── 12 款被動配件繪製邏輯 ──────────────────────────────────────────────
const PASSIVE_DRAWERS = {
  ninja_scroll: (x, w, h) => {
    drawBadge(x, false, '#ff4d6d');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 6);
    x.fillStyle = '#f4e8c1';
    x.beginPath();
    x.roundRect(-14, -7, 28, 14, 3);
    x.fill();
    x.fillStyle = '#d90429';
    x.fillRect(-3, -7, 6, 14); // 紅色束帶
    x.strokeStyle = '#8d0801';
    x.lineWidth = 1;
    x.strokeRect(-3, -7, 6, 14);
    x.restore();
  },

  sneakers: (x, w, h) => {
    drawBadge(x, false, '#00f59b');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#00f59b';
    x.beginPath();
    x.moveTo(-14, 8);
    x.lineTo(14, 8);
    x.lineTo(14, 2);
    x.lineTo(4, 0);
    x.lineTo(-6, -8);
    x.lineTo(-14, -4);
    x.closePath();
    x.fill();
    x.fillStyle = '#ffffff';
    x.fillRect(-14, 8, 28, 3); // 鞋底
    x.restore();
  },

  exo_skeleton: (x, w, h) => {
    drawBadge(x, false, '#4cc9f0');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#3a475a';
    x.beginPath();
    x.roundRect(-10, -12, 20, 24, 4);
    x.fill();
    x.strokeStyle = '#4cc9f0';
    x.lineWidth = 2;
    x.strokeRect(-8, -10, 16, 20);
    x.fillStyle = '#4cc9f0';
    x.beginPath();
    x.arc(0, 0, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  magnet: (x, w, h) => {
    drawBadge(x, false, '#ff4d6d');
    x.save();
    x.translate(w / 2, h / 2);
    x.lineWidth = 6;
    x.strokeStyle = '#e63946';
    x.beginPath();
    x.arc(0, 2, 11, Math.PI, 0, false);
    x.stroke();
    x.fillStyle = '#e63946';
    x.fillRect(-14, 2, 6, 8);
    x.fillRect(8, 2, 6, 8);
    x.fillStyle = '#ffffff';
    x.fillRect(-14, 8, 6, 4);
    x.fillRect(8, 8, 6, 4);
    x.restore();
  },

  hi_power_bullet: (x, w, h) => {
    drawBadge(x, false, '#ff7b00');
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    x.fillStyle = '#e5a100';
    x.fillRect(-4, -6, 8, 18);
    x.fillStyle = '#ff3b30';
    x.beginPath();
    x.arc(0, -6, 4, Math.PI, 0);
    x.fill();
    x.restore();
  },

  fuel_tank: (x, w, h) => {
    drawBadge(x, false, '#ffb703');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#d90429';
    x.beginPath();
    x.roundRect(-10, -12, 20, 24, 3);
    x.fill();
    x.fillStyle = '#ffffff';
    x.fillRect(-5, -15, 4, 3); // 蓋子
    x.fillStyle = '#ffb703';
    x.beginPath();
    x.arc(0, 0, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  coffee: (x, w, h) => {
    drawBadge(x, false, '#9c6644');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect(-9, -7, 18, 18, 3);
    x.fill();
    x.fillStyle = '#582f0e';
    x.fillRect(-7, -5, 14, 6);
    x.strokeStyle = '#ffffff';
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(9, 1, 4, -Math.PI / 2, Math.PI / 2);
    x.stroke();
    x.restore();
  },

  energy_cube: (x, w, h) => {
    drawBadge(x, false, '#00e5ff');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = 'rgba(0,229,255,0.4)';
    x.strokeStyle = '#00e5ff';
    x.lineWidth = 2;
    x.strokeRect(-9, -9, 18, 18);
    x.fillRect(-9, -9, 18, 18);
    x.fillStyle = '#ffffff';
    x.fillRect(-4, -4, 8, 8);
    x.restore();
  },

  chrono_crystal: (x, w, h) => {
    drawBadge(x, false, '#c77dff');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#c77dff';
    x.beginPath();
    x.moveTo(0, -16);
    x.lineTo(10, 0);
    x.lineTo(0, 16);
    x.lineTo(-10, 0);
    x.closePath();
    x.fill();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 1.5;
    x.stroke();
    x.restore();
  },

  nanobot: (x, w, h) => {
    drawBadge(x, false, '#00f59b');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#00f59b';
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      x.save();
      x.translate(Math.cos(a) * 8, Math.sin(a) * 8);
      x.beginPath();
      x.moveTo(0, -4);
      x.lineTo(4, 3);
      x.lineTo(-4, 3);
      x.closePath();
      x.fill();
      x.restore();
    }
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(0, 0, 2.5, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },

  cooling_device: (x, w, h) => {
    drawBadge(x, false, '#7fd8ff');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#222d3d';
    x.beginPath();
    x.roundRect(-12, -12, 24, 24, 3);
    x.fill();
    x.strokeStyle = '#7fd8ff';
    x.lineWidth = 2;
    for (let i = -7; i <= 7; i += 5) {
      x.beginPath();
      x.moveTo(i, -9);
      x.lineTo(i, 9);
      x.stroke();
    }
    x.restore();
  },

  iron_badge: (x, w, h) => {
    drawBadge(x, false, '#ffd166');
    x.save();
    x.translate(w / 2, h / 2);
    x.fillStyle = '#d90429';
    x.fillRect(-7, -15, 14, 10);
    x.fillStyle = '#ffd166';
    x.beginPath();
    x.arc(0, 3, 10, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 1.5;
    x.stroke();
    x.restore();
  },
};

// ── 預先烘焙所有圖示 ──────────────────────────────────────────────────
export function initWeaponSprites() {
  if (typeof document === 'undefined') return;
  for (const [id, drawer] of Object.entries(WEAPON_DRAWERS)) {
    const c = makeIcon(drawer);
    iconCanvases.set(id, c);
    iconDataUrls.set(id, c.toDataURL('image/png'));
  }
  for (const [id, drawer] of Object.entries(PASSIVE_DRAWERS)) {
    const c = makeIcon(drawer);
    iconCanvases.set(id, c);
    iconDataUrls.set(id, c.toDataURL('image/png'));
  }
}

// 取得 Sprite 畫布
export function getWeaponIconCanvas(id) {
  if (!iconCanvases.size) initWeaponSprites();
  return iconCanvases.get(id) || null;
}

// 取得 DataURL
export function getWeaponIconDataUrl(id) {
  if (!iconDataUrls.size) initWeaponSprites();
  return iconDataUrls.get(id) || null;
}

// 檢查是否具有專屬 Sprite
export function hasWeaponSprite(id) {
  return WEAPON_DRAWERS[id] != null || PASSIVE_DRAWERS[id] != null;
}

// 渲染為 HTML 影像標籤 (若無專屬 Sprite 則退回 emoji)
export function renderWeaponIconHtml(id, fallbackEmoji = '⚔️', name = '') {
  const url = getWeaponIconDataUrl(id);
  if (url) {
    return `<img class="weapon-sprite-icon" src="${url}" alt="${name || id}" draggable="false" />`;
  }
  return `<span class="fallback-emoji">${fallbackEmoji}</span>`;
}
