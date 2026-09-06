// 角色與怪物 sprite 烘焙：所有精緻筆刷 (漸層、描邊、發光) 只在首次使用時畫一次，
// 之後每幀只做 drawImage。畫質提升 + 每幀繪製成本大幅下降。

const SS = 2;          // 超取樣倍率 (retina 上不糊)
export const FRAMES = 8;

const cache = new Map();

function make(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * SS);
  c.height = Math.round(h * SS);
  const x = c.getContext('2d');
  x.scale(SS, SS);
  x.translate(w / 2, h / 2);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  draw(x);
  return c;
}

// 受傷閃白：把整張 sprite 疊上白色
function whiten(src) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(255,255,255,0.88)';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

// 球面打光漸層
function sphere(x, color, r, cx = 0, cy = 0) {
  const g = x.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r * 1.05);
  g.addColorStop(0, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.32, color);
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  return g;
}

// 底部落地陰影
function shadow(x, rx, y) {
  x.fillStyle = 'rgba(0,0,0,0.4)';
  x.beginPath();
  x.ellipse(0, y, rx, rx * 0.36, 0, 0, Math.PI * 2);
  x.fill();
}

/* ==================== 特工鴨 ==================== */

function drawDuck(x, t) {
  const p = t * Math.PI * 2;
  const bob = Math.sin(p) * 3;
  const step = Math.sin(p);
  const wing = Math.sin(p * 1.5) * 3;

  shadow(x, 14 - Math.abs(step) * 1.5, 19);

  x.save();
  x.rotate(Math.sin(p) * 0.05);

  // 蹼腳 (交替踏步)
  for (const s of [-1, 1]) {
    const lift = s * step * 3;
    x.fillStyle = '#e8710a';
    x.strokeStyle = '#a34600';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(-1 + s * 3, 14 + bob);
    x.lineTo(3 + s * 3, 19 + bob - lift);
    x.lineTo(-5 + s * 3, 19 + bob - lift);
    x.closePath();
    x.fill();
    x.stroke();
  }

  // 尾羽
  x.fillStyle = '#dda000';
  x.strokeStyle = '#8a5600';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(-11, 1 + bob);
  x.lineTo(-24, -7 + bob);
  x.lineTo(-19, 0 + bob);
  x.lineTo(-23, 4 + bob);
  x.lineTo(-12, 8 + bob);
  x.closePath();
  x.fill();
  x.stroke();

  // 身體
  x.fillStyle = sphere(x, '#ffcc00', 17, 0, bob);
  x.beginPath();
  x.arc(0, bob, 16, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#7d4d00';
  x.lineWidth = 2;
  x.stroke();

  // 腹部亮面
  x.fillStyle = 'rgba(255,247,190,0.5)';
  x.beginPath();
  x.ellipse(-1, 6 + bob, 9, 6, 0, 0, Math.PI * 2);
  x.fill();

  // 羽毛紋理
  x.strokeStyle = 'rgba(138,86,0,0.28)';
  x.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.arc(-6, 2 + bob + i * 3.5, 6, -0.6, 0.9);
    x.stroke();
  }

  // 翅膀
  x.save();
  x.translate(-3, 4 + bob + wing * 0.3);
  x.rotate(-0.35 + wing * 0.07);
  const wg = x.createLinearGradient(-7, -5, 7, 5);
  wg.addColorStop(0, '#ffd94a');
  wg.addColorStop(1, '#dc9c00');
  x.fillStyle = wg;
  x.strokeStyle = '#7d4d00';
  x.lineWidth = 1.3;
  x.beginPath();
  x.ellipse(0, 0, 8, 5.5, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.strokeStyle = 'rgba(125,77,0,0.5)';
  x.lineWidth = 0.9;
  for (let i = -1; i <= 1; i++) {
    x.beginPath();
    x.moveTo(-5, i * 2);
    x.lineTo(6, i * 2.4);
    x.stroke();
  }
  x.restore();

  // 鴨嘴
  const bg = x.createLinearGradient(8, 0, 21, 4);
  bg.addColorStop(0, '#ffa940');
  bg.addColorStop(1, '#f06a00');
  x.fillStyle = bg;
  x.strokeStyle = '#a34600';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(7, -2 + bob);
  x.lineTo(21, 1 + bob);
  x.lineTo(21, 3 + bob);
  x.lineTo(7, 8 + bob);
  x.closePath();
  x.fill();
  x.stroke();
  x.strokeStyle = 'rgba(140,60,0,0.75)';
  x.lineWidth = 1.2;
  x.beginPath();
  x.moveTo(8, 3.4 + bob);
  x.lineTo(20.5, 2.2 + bob);
  x.stroke();

  // 特工耳機
  x.fillStyle = '#1b222e';
  x.beginPath();
  x.arc(-9, -5 + bob, 3.2, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#00e5ff';
  x.beginPath();
  x.arc(-9, -5 + bob, 1.2, 0, Math.PI * 2);
  x.fill();

  // 墨鏡
  x.fillStyle = '#0b0e14';
  x.beginPath();
  x.roundRect(-1, -10 + bob, 17, 9.5, [3, 6, 6, 3]);
  x.fill();
  x.strokeStyle = 'rgba(0,229,255,0.65)';
  x.lineWidth = 1;
  x.stroke();
  // 鏡片反光
  x.save();
  x.beginPath();
  x.roundRect(-1, -10 + bob, 17, 9.5, [3, 6, 6, 3]);
  x.clip();
  x.strokeStyle = 'rgba(160,240,255,0.85)';
  x.lineWidth = 2.2;
  x.beginPath();
  x.moveTo(2, -11 + bob);
  x.lineTo(7, 1 + bob);
  x.stroke();
  x.strokeStyle = 'rgba(160,240,255,0.45)';
  x.lineWidth = 1.2;
  x.beginPath();
  x.moveTo(7, -11 + bob);
  x.lineTo(11, 1 + bob);
  x.stroke();
  x.restore();
  // 鏡腳
  x.strokeStyle = '#0b0e14';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-1, -6 + bob);
  x.lineTo(-9, -5.5 + bob);
  x.stroke();

  // 西裝領 + 領帶
  x.fillStyle = '#141b26';
  x.beginPath();
  x.moveTo(-6, 7 + bob);
  x.lineTo(6, 7 + bob);
  x.lineTo(3, 12 + bob);
  x.lineTo(-4, 11 + bob);
  x.closePath();
  x.fill();
  x.fillStyle = '#ff0055';
  x.beginPath();
  x.moveTo(-1, 8 + bob);
  x.lineTo(4, 8 + bob);
  x.lineTo(1.5, 12 + bob);
  x.closePath();
  x.fill();
  x.fillStyle = '#c40040';
  x.beginPath();
  x.moveTo(0, 12 + bob);
  x.lineTo(3.5, 12 + bob);
  x.lineTo(3, 18 + bob);
  x.lineTo(1.5, 20 + bob);
  x.lineTo(0, 18 + bob);
  x.closePath();
  x.fill();

  x.restore();
}


/* ==================== 暴走蘿蔔 (特工兔兔) ==================== */

function drawRabbit(x, t) {
  const p = t * Math.PI * 2;
  const bob = Math.sin(p) * 3;
  const lean = 0.12 + Math.sin(p) * 0.04;
  const wheel = p * 2;

  shadow(x, 13, 19);

  x.save();
  x.rotate(-lean);

  // 噴射尾焰
  const fg = x.createLinearGradient(-14, 0, -34, 0);
  fg.addColorStop(0, 'rgba(0,229,255,0.85)');
  fg.addColorStop(0.5, 'rgba(120,90,255,0.5)');
  fg.addColorStop(1, 'rgba(120,90,255,0)');
  x.fillStyle = fg;
  x.beginPath();
  x.moveTo(-12, 8 + bob);
  x.lineTo(-30 - Math.sin(p) * 6, 12 + bob);
  x.lineTo(-12, 15 + bob);
  x.closePath();
  x.fill();

  // 直排輪
  x.fillStyle = '#2a3240';
  x.beginPath();
  x.roundRect(-11, 14 + bob, 21, 5, 2.5);
  x.fill();
  for (const wx of [-7, 0, 7]) {
    x.fillStyle = '#151b24';
    x.beginPath();
    x.arc(wx, 20 + bob, 3.4, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#00e5ff';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(wx, 20 + bob);
    x.lineTo(wx + Math.cos(wheel) * 2.6, 20 + bob + Math.sin(wheel) * 2.6);
    x.stroke();
  }

  // 長耳朵 (向後飄)
  for (const s of [0, 1]) {
    const sway = Math.sin(p + s) * 4;
    x.save();
    x.translate(-2 + s * 5, -12 + bob);
    x.rotate(-0.9 + s * 0.25 + sway * 0.02);
    x.fillStyle = '#f6f2ea';
    x.strokeStyle = '#b9ac99';
    x.lineWidth = 1.2;
    x.beginPath();
    x.ellipse(0, -9, 3.6, 10, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.fillStyle = '#ff9db3';
    x.beginPath();
    x.ellipse(0, -9, 1.7, 7, 0, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }

  // 身體
  x.fillStyle = sphere(x, '#fbf7f0', 16, 0, bob);
  x.beginPath();
  x.ellipse(0, bob, 15, 14, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#a2947f';
  x.lineWidth = 1.8;
  x.stroke();

  // 毛絨紋理
  x.strokeStyle = 'rgba(160,145,120,0.3)';
  x.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.arc(-5, 1 + bob + i * 3.5, 5.5, -0.5, 0.9);
    x.stroke();
  }

  // 紅圍巾 (飄動)
  x.fillStyle = '#e01e37';
  x.beginPath();
  x.ellipse(1, 6 + bob, 9, 4, 0, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(-6, 4 + bob);
  x.quadraticCurveTo(-18, 3 + bob + Math.sin(p) * 5, -26, 9 + bob + Math.sin(p) * 7);
  x.lineTo(-24, 13 + bob + Math.sin(p) * 6);
  x.quadraticCurveTo(-16, 9 + bob + Math.sin(p) * 4, -6, 9 + bob);
  x.closePath();
  x.fill();
  x.strokeStyle = '#8c0f22';
  x.lineWidth = 1;
  x.stroke();

  // 護目鏡
  x.fillStyle = '#1b2430';
  x.beginPath();
  x.roundRect(-2, -9 + bob, 16, 8, [3, 5, 5, 3]);
  x.fill();
  const gg = x.createLinearGradient(-2, -9, 14, -1);
  gg.addColorStop(0, 'rgba(255,166,0,0.95)');
  gg.addColorStop(1, 'rgba(255,60,0,0.75)');
  x.fillStyle = gg;
  x.beginPath();
  x.roundRect(0, -7.5 + bob, 12.5, 5, 2.5);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(2, -6.5 + bob);
  x.lineTo(6, -3.5 + bob);
  x.stroke();
  x.strokeStyle = '#1b2430';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-2, -5 + bob);
  x.lineTo(-9, -4 + bob);
  x.stroke();

  // 兔鼻與牙
  x.fillStyle = '#ff9db3';
  x.beginPath();
  x.moveTo(13, 1 + bob); x.lineTo(16, 3 + bob); x.lineTo(13, 4.5 + bob); x.closePath();
  x.fill();
  x.fillStyle = '#ffffff';
  x.fillRect(11.5, 4.5 + bob, 2, 3);

  x.restore();
}

/* ==================== 鋼鐵肥啾 (重裝企鵝) ==================== */

function drawPenguin(x, t) {
  const p = t * Math.PI * 2;
  const bob = Math.sin(p) * 1.6;
  const step = Math.sin(p);

  shadow(x, 15, 20);

  // 蹼腳
  for (const s of [-1, 1]) {
    x.fillStyle = '#ff9e2c';
    x.strokeStyle = '#a35a00';
    x.lineWidth = 1.2;
    x.beginPath();
    x.ellipse(s * 5, 19 - Math.max(0, s * step) * 2, 5, 2.6, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
  }

  // 身體 (裝甲底層)
  x.fillStyle = sphere(x, '#26323f', 18, 0, bob);
  x.beginPath();
  x.ellipse(0, bob, 15, 17, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#0d141c';
  x.lineWidth = 2;
  x.stroke();

  // 白肚皮
  x.fillStyle = '#f3f6fa';
  x.beginPath();
  x.ellipse(1, 3 + bob, 9, 11, 0, 0, Math.PI * 2);
  x.fill();

  // 鈦合金外骨骼板
  const ag = x.createLinearGradient(0, -14, 0, 14);
  ag.addColorStop(0, '#9fb3c8');
  ag.addColorStop(0.5, '#5d7085');
  ag.addColorStop(1, '#37475a');
  x.fillStyle = ag;
  x.strokeStyle = '#1d2836';
  x.lineWidth = 1.4;
  // 肩甲
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(s * 13, -6 + bob, 5.5, 6.5, s * 0.25, 0, Math.PI * 2);
    x.fill();
    x.stroke();
  }
  // 胸甲
  x.beginPath();
  x.roundRect(-8, -3 + bob, 16, 12, 3);
  x.fill();
  x.stroke();
  // 能量核心
  const cg = x.createRadialGradient(0, 3 + bob, 0, 0, 3 + bob, 7);
  cg.addColorStop(0, 'rgba(0,229,255,0.95)');
  cg.addColorStop(1, 'rgba(0,229,255,0)');
  x.fillStyle = cg;
  x.beginPath();
  x.arc(0, 3 + bob, 7, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#00e5ff';
  x.beginPath();
  x.arc(0, 3 + bob, 2.6, 0, Math.PI * 2);
  x.fill();

  // 頭
  x.fillStyle = sphere(x, '#26323f', 11, 0, -12 + bob);
  x.beginPath();
  x.arc(0, -12 + bob, 10, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#0d141c';
  x.lineWidth = 1.8;
  x.stroke();
  // 臉
  x.fillStyle = '#f3f6fa';
  x.beginPath();
  x.ellipse(3, -11 + bob, 7, 7.5, 0, 0, Math.PI * 2);
  x.fill();
  // 眼
  x.fillStyle = '#12181f';
  x.beginPath();
  x.arc(3, -14 + bob, 2.2, 0, Math.PI * 2);
  x.arc(8, -13 + bob, 1.8, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(2.3, -14.7 + bob, 0.8, 0, Math.PI * 2);
  x.fill();
  // 橘喙
  x.fillStyle = '#ff9e2c';
  x.strokeStyle = '#a35a00';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(8, -10 + bob);
  x.lineTo(16, -8 + bob);
  x.lineTo(8, -6 + bob);
  x.closePath();
  x.fill();
  x.stroke();
  // 頭盔護額
  x.fillStyle = '#5d7085';
  x.beginPath();
  x.roundRect(-9, -21 + bob, 15, 6, [4, 4, 2, 2]);
  x.fill();
  x.strokeStyle = '#1d2836';
  x.stroke();

  // 防暴盾 (前方)
  x.save();
  x.translate(15, 2 + bob);
  x.rotate(0.12 + Math.sin(p) * 0.05);
  const sg = x.createLinearGradient(-4, -14, 4, 14);
  sg.addColorStop(0, 'rgba(180,205,230,0.95)');
  sg.addColorStop(1, 'rgba(80,105,135,0.95)');
  x.fillStyle = sg;
  x.strokeStyle = '#1d2836';
  x.lineWidth = 1.6;
  x.beginPath();
  x.roundRect(-4, -14, 8, 27, 4);
  x.fill();
  x.stroke();
  x.strokeStyle = 'rgba(0,229,255,0.55)';
  x.lineWidth = 1.2;
  x.beginPath();
  x.moveTo(-2, -10); x.lineTo(-2, 9);
  x.moveTo(2, -10); x.lineTo(2, 9);
  x.stroke();
  x.restore();
}

/* ==================== 脈衝喵喵 (賽博駭客) ==================== */

function drawCat(x, t) {
  const p = t * Math.PI * 2;
  const bob = Math.sin(p) * 2.5;
  const float = Math.sin(p * 2);

  shadow(x, 12, 19);

  // 尾巴
  x.strokeStyle = '#1a1a24';
  x.lineWidth = 4.5;
  x.beginPath();
  x.moveTo(-11, 6 + bob);
  x.quadraticCurveTo(-22, 2 + bob + float * 3, -20, -8 + bob + float * 4);
  x.stroke();
  x.strokeStyle = '#b5179e';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(-14, 5 + bob);
  x.quadraticCurveTo(-21, 1 + bob + float * 3, -19.5, -7 + bob + float * 4);
  x.stroke();

  // 懸浮無人機
  for (let i = 0; i < 3; i++) {
    const a = p + i * (Math.PI * 2 / 3);
    const dx = Math.cos(a) * 17;
    const dy = -14 + Math.sin(a) * 5 + bob;
    const dg = x.createRadialGradient(dx, dy, 0, dx, dy, 7);
    dg.addColorStop(0, 'rgba(0,229,255,0.5)');
    dg.addColorStop(1, 'rgba(0,229,255,0)');
    x.fillStyle = dg;
    x.beginPath();
    x.arc(dx, dy, 7, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#1e2a38';
    x.beginPath();
    x.roundRect(dx - 3, dy - 2, 6, 4, 1.5);
    x.fill();
    x.fillStyle = '#00e5ff';
    x.beginPath();
    x.arc(dx, dy, 1.2, 0, Math.PI * 2);
    x.fill();
  }

  // 身體
  x.fillStyle = sphere(x, '#232331', 15, 0, bob);
  x.beginPath();
  x.ellipse(0, bob + 1, 13, 14, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#0a0a12';
  x.lineWidth = 1.8;
  x.stroke();
  // 霓虹線路
  x.strokeStyle = 'rgba(181,23,158,0.8)';
  x.lineWidth = 1.2;
  x.beginPath();
  x.moveTo(-6, 8 + bob); x.lineTo(-2, 2 + bob); x.lineTo(3, 6 + bob); x.lineTo(7, -1 + bob);
  x.stroke();

  // 頭
  x.fillStyle = sphere(x, '#282838', 11, 0, -10 + bob);
  x.beginPath();
  x.arc(1, -10 + bob, 10, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#0a0a12';
  x.lineWidth = 1.6;
  x.stroke();
  // 貓耳
  x.fillStyle = '#282838';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(1 + s * 5, -17 + bob);
    x.lineTo(1 + s * 8, -25 + bob);
    x.lineTo(1 + s * 10.5, -15 + bob);
    x.closePath();
    x.fill();
    x.stroke();
  }
  // 霓虹耳機
  x.strokeStyle = '#00e5ff';
  x.lineWidth = 2.2;
  x.beginPath();
  x.arc(1, -12 + bob, 11, Math.PI * 1.15, Math.PI * 1.85);
  x.stroke();
  for (const s of [-1, 1]) {
    x.fillStyle = '#151d28';
    x.beginPath();
    x.roundRect(1 + s * 10 - 2.5, -13 + bob, 5, 7, 2);
    x.fill();
    x.fillStyle = '#00e5ff';
    x.beginPath();
    x.arc(1 + s * 10, -9.5 + bob, 1.3, 0, Math.PI * 2);
    x.fill();
  }
  // 眼睛
  x.fillStyle = '#00f59b';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(1 + s * 4, -10 + bob, 2.4, 3.2, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#08221a';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(1 + s * 4, -10 + bob, 0.9, 3, 0, 0, Math.PI * 2);
    x.fill();
  }
  // 鬍鬚
  x.strokeStyle = 'rgba(255,255,255,0.45)';
  x.lineWidth = 0.8;
  for (const s of [-1, 1]) {
    for (const yy of [-6, -4]) {
      x.beginPath();
      x.moveTo(1 + s * 6, yy + bob);
      x.lineTo(1 + s * 14, yy - 1.5 + bob);
      x.stroke();
    }
  }

  // 全息鍵盤
  const kg = x.createLinearGradient(4, 10, 22, 16);
  kg.addColorStop(0, 'rgba(0,229,255,0.55)');
  kg.addColorStop(1, 'rgba(0,229,255,0.05)');
  x.fillStyle = kg;
  x.beginPath();
  x.moveTo(6, 9 + bob);
  x.lineTo(24, 12 + bob);
  x.lineTo(21, 17 + bob);
  x.lineTo(5, 14 + bob);
  x.closePath();
  x.fill();
  x.fillStyle = 'rgba(0,229,255,0.9)';
  for (let i = 0; i < 4; i++) {
    const on = (Math.floor(t * 8) + i) % 3 === 0;
    x.globalAlpha = on ? 1 : 0.35;
    x.fillRect(8 + i * 4, 11.5 + bob + i * 0.4, 2.6, 2);
  }
  x.globalAlpha = 1;
  // 前爪
  x.fillStyle = '#282838';
  x.beginPath();
  x.ellipse(8, 7 + bob + float, 3.4, 2.6, -0.3, 0, Math.PI * 2);
  x.fill();
}

/* ==================== 怪物 ==================== */

function drawWalker(x, t, r) {
  const p = t * Math.PI * 2;
  const bob = Math.sin(p) * 2;
  const arm = Math.sin(p) * 2.5;
  shadow(x, r * 0.85, r * 0.95);

  // 前伸的雙臂
  x.strokeStyle = '#1f6b12';
  x.lineWidth = 4;
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * r * 0.6, bob + 2);
    x.lineTo(s * r * 0.5 + r * 0.9, bob + arm * s);
    x.stroke();
  }

  // 身體
  x.fillStyle = sphere(x, '#38b000', r, 0, bob);
  x.beginPath();
  x.arc(0, bob, r, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(8,30,4,0.75)';
  x.lineWidth = 2;
  x.stroke();

  // 腐爛斑塊
  x.fillStyle = 'rgba(20,70,10,0.55)';
  x.beginPath();
  x.arc(-r * 0.4, bob + r * 0.35, r * 0.3, 0, Math.PI * 2);
  x.arc(r * 0.45, bob - r * 0.4, r * 0.22, 0, Math.PI * 2);
  x.fill();

  // 破損頭盔
  x.fillStyle = '#4b5a2a';
  x.beginPath();
  x.arc(0, bob - r * 0.25, r * 0.92, Math.PI * 1.08, Math.PI * 1.92);
  x.closePath();
  x.fill();
  x.strokeStyle = '#2c3618';
  x.lineWidth = 1.4;
  x.stroke();

  // 眼睛 (烘焙好的光暈)
  const eg = x.createRadialGradient(0, bob - 1, 0, 0, bob - 1, r * 0.75);
  eg.addColorStop(0, 'rgba(255,60,20,0.55)');
  eg.addColorStop(1, 'rgba(255,60,20,0)');
  x.fillStyle = eg;
  x.beginPath();
  x.arc(0, bob - 1, r * 0.75, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ff4a1f';
  x.beginPath();
  x.arc(-4, bob - 1, 2.6, 0, Math.PI * 2);
  x.arc(4, bob - 1, 2.6, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#fff2c0';
  x.beginPath();
  x.arc(-4.6, bob - 1.8, 0.9, 0, Math.PI * 2);
  x.arc(3.4, bob - 1.8, 0.9, 0, Math.PI * 2);
  x.fill();

  // 咧開的嘴
  x.strokeStyle = '#0d2606';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(-5, bob + r * 0.5);
  x.lineTo(5, bob + r * 0.5);
  x.stroke();
  x.fillStyle = '#d9e6c0';
  for (let i = -1; i <= 1; i++) {
    x.fillRect(i * 3 - 0.8, bob + r * 0.5 - 0.5, 1.6, 2.2);
  }
}

function drawBat(x, t, r) {
  const p = t * Math.PI * 2;
  const flap = Math.sin(p) * 12;
  shadow(x, r * 0.7, r * 1.5);

  // 雙翼 (含膜紋)
  const wg = x.createLinearGradient(0, -10, 0, 10);
  wg.addColorStop(0, '#9d2fe0');
  wg.addColorStop(1, '#4c0a78');
  x.fillStyle = wg;
  x.strokeStyle = '#c862ff';
  x.lineWidth = 1.3;
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(0, 0);
    x.quadraticCurveTo(s * r * 1.1, flap - 6, s * r * 1.9, flap);
    x.lineTo(s * r * 1.3, 3);
    x.lineTo(s * r * 0.8, 5);
    x.closePath();
    x.fill();
    x.stroke();
    x.strokeStyle = 'rgba(200,98,255,0.45)';
    x.lineWidth = 0.9;
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(s * r * 1.5, flap * 0.75);
    x.moveTo(0, 1);
    x.lineTo(s * r * 1.1, 3.5);
    x.stroke();
    x.strokeStyle = '#c862ff';
    x.lineWidth = 1.3;
  }

  // 耳朵
  x.fillStyle = '#5f1090';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * 3, -r * 0.55);
    x.lineTo(s * 6, -r * 1.45);
    x.lineTo(s * 8, -r * 0.35);
    x.closePath();
    x.fill();
  }

  // 身體
  x.fillStyle = sphere(x, '#7209b7', r * 0.72);
  x.beginPath();
  x.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(20,0,35,0.8)';
  x.lineWidth = 1.6;
  x.stroke();

  // 發光雙眼
  const eg = x.createRadialGradient(0, -1, 0, 0, -1, r);
  eg.addColorStop(0, 'rgba(255,234,0,0.5)');
  eg.addColorStop(1, 'rgba(255,234,0,0)');
  x.fillStyle = eg;
  x.beginPath();
  x.arc(0, -1, r, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffea00';
  x.beginPath();
  x.moveTo(-4.5, -3); x.lineTo(-1, -1.5); x.lineTo(-4.5, 0.5); x.closePath();
  x.moveTo(4.5, -3); x.lineTo(1, -1.5); x.lineTo(4.5, 0.5); x.closePath();
  x.fill();

  // 尖牙
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(-2.2, 3); x.lineTo(-1, 6); x.lineTo(-0.2, 3); x.closePath();
  x.moveTo(2.2, 3); x.lineTo(1, 6); x.lineTo(0.2, 3); x.closePath();
  x.fill();
}

function drawBrute(x, t, r) {
  const p = t * Math.PI * 2;
  const stomp = Math.sin(p) * 1.8;
  shadow(x, r * 0.95, r * 1.05);

  // 肩甲
  x.fillStyle = '#8d0016';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(s * r * 0.95, -r * 0.5 + stomp, r * 0.42, r * 0.32, 0, 0, Math.PI * 2);
    x.fill();
  }

  // 軀幹
  x.fillStyle = sphere(x, '#d90429', r * 1.25, 0, stomp);
  x.beginPath();
  x.roundRect(-r, -r + stomp, r * 2, r * 2, 9);
  x.fill();
  x.strokeStyle = '#40060f';
  x.lineWidth = 3;
  x.stroke();

  // 裝甲板分線與鉚釘
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-r * 0.85, r * 0.32 + stomp);
  x.lineTo(r * 0.85, r * 0.32 + stomp);
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.16)';
  x.lineWidth = 1.2;
  x.beginPath();
  x.moveTo(-r * 0.85, r * 0.24 + stomp);
  x.lineTo(r * 0.85, r * 0.24 + stomp);
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.28)';
  for (const s of [-1, 1]) {
    for (const yy of [-0.6, 0.62]) {
      x.beginPath();
      x.arc(s * r * 0.78, yy * r + stomp, 1.6, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 生化獨眼 (烘焙光暈)
  const eg = x.createRadialGradient(0, -r * 0.15 + stomp, 0, 0, -r * 0.15 + stomp, r * 0.8);
  eg.addColorStop(0, 'rgba(0,245,155,0.55)');
  eg.addColorStop(1, 'rgba(0,245,155,0)');
  x.fillStyle = eg;
  x.beginPath();
  x.arc(0, -r * 0.15 + stomp, r * 0.8, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#00f59b';
  x.beginPath();
  x.arc(0, -r * 0.15 + stomp, 5.5, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#03301f';
  x.beginPath();
  x.arc(0, -r * 0.15 + stomp, 2.2, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.beginPath();
  x.arc(-1.8, -r * 0.15 - 1.8 + stomp, 1.3, 0, Math.PI * 2);
  x.fill();
}

function drawBoomer(x, t, r, armed) {
  const p = t * Math.PI * 2;
  const breathe = 1 + Math.sin(p) * 0.05;
  shadow(x, r * 0.8, r * 0.95);

  x.save();
  x.scale(breathe, breathe);

  // 外殼
  x.fillStyle = sphere(x, armed ? '#ff3b1f' : '#ffaa00', r);
  x.beginPath();
  x.arc(0, 0, r, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(60,30,0,0.7)';
  x.lineWidth = 2;
  x.stroke();

  // 節肢分段線
  x.strokeStyle = 'rgba(90,45,0,0.45)';
  x.lineWidth = 1.4;
  for (let i = -1; i <= 1; i++) {
    x.beginPath();
    x.arc(0, i * r * 0.42, r * 0.9, 0.25, Math.PI - 0.25);
    x.stroke();
  }

  // 劇毒囊腫
  const sacs = [[-6, -6, 4.5], [6, -4, 5.5], [2, 6, 4.5], [-7, 4, 3.5]];
  for (const [sx, sy, sr] of sacs) {
    x.fillStyle = sphere(x, '#4fdd1a', sr, sx, sy);
    x.beginPath();
    x.arc(sx, sy, sr, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(20,60,5,0.6)';
    x.lineWidth = 1;
    x.stroke();
  }

  // 眼睛
  x.fillStyle = '#1a0d00';
  x.beginPath();
  x.arc(-3.5, -1, 2, 0, Math.PI * 2);
  x.arc(4, 0, 2, 0, Math.PI * 2);
  x.fill();
  x.restore();

  // 引信火花
  x.strokeStyle = '#6b3b00';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(0, -r);
  x.lineTo(2, -r - 6);
  x.stroke();
  const fg = x.createRadialGradient(2, -r - 7, 0, 2, -r - 7, armed ? 8 : 4);
  fg.addColorStop(0, armed ? '#fff6c0' : '#ffd166');
  fg.addColorStop(1, 'rgba(255,140,0,0)');
  x.fillStyle = fg;
  x.beginPath();
  x.arc(2, -r - 7, armed ? 8 : 4, 0, Math.PI * 2);
  x.fill();
}

function drawBoss(x, t, r, charging) {
  const p = t * Math.PI * 2;
  const pulse = 1 + Math.sin(p) * 0.05;
  shadow(x, r * 0.9, r * 1.05);

  // 外層氣場
  const ag = x.createRadialGradient(0, 0, r, 0, 0, (r + 22) * pulse);
  ag.addColorStop(0, charging ? 'rgba(255,0,85,0.55)' : 'rgba(255,0,85,0.28)');
  ag.addColorStop(1, 'rgba(255,0,85,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, 0, (r + 22) * pulse, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = charging ? 'rgba(255,80,140,0.95)' : 'rgba(255,0,85,0.5)';
  x.lineWidth = charging ? 5 : 3;
  x.beginPath();
  x.arc(0, 0, (r + 7) * pulse, 0, Math.PI * 2);
  x.stroke();

  // 犄角
  const horn = x.createLinearGradient(0, -r * 1.4, 0, -r * 0.4);
  horn.addColorStop(0, '#f5f0e0');
  horn.addColorStop(1, '#4a1020');
  x.fillStyle = horn;
  x.strokeStyle = '#26000d';
  x.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * r * 0.72, -r * 0.48);
    x.quadraticCurveTo(s * r * 1.35, -r * 1.15, s * r * 1.02, -r * 1.55);
    x.quadraticCurveTo(s * r * 0.82, -r * 1.0, s * r * 0.3, -r * 0.82);
    x.closePath();
    x.fill();
    x.stroke();
  }

  // 主體
  x.fillStyle = sphere(x, '#ff0055', r);
  x.beginPath();
  x.arc(0, 0, r, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#33000f';
  x.lineWidth = 3;
  x.stroke();

  // 裂痕裝甲
  x.strokeStyle = 'rgba(40,0,15,0.65)';
  x.lineWidth = 2.2;
  x.beginPath();
  x.moveTo(-r * 0.75, -r * 0.1);
  x.lineTo(-r * 0.3, r * 0.15);
  x.lineTo(-r * 0.5, r * 0.55);
  x.moveTo(r * 0.7, r * 0.05);
  x.lineTo(r * 0.35, r * 0.35);
  x.stroke();

  // 雙眼
  const eg = x.createRadialGradient(0, -r * 0.16, 0, 0, -r * 0.16, r * 0.85);
  eg.addColorStop(0, 'rgba(255,221,0,0.5)');
  eg.addColorStop(1, 'rgba(255,221,0,0)');
  x.fillStyle = eg;
  x.beginPath();
  x.arc(0, -r * 0.16, r * 0.85, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffe600';
  x.beginPath();
  x.arc(-r * 0.27, -r * 0.16, r * 0.16, 0, Math.PI * 2);
  x.arc(r * 0.27, -r * 0.16, r * 0.16, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#7a0018';
  x.beginPath();
  x.ellipse(-r * 0.27, -r * 0.16, r * 0.05, r * 0.11, 0, 0, Math.PI * 2);
  x.ellipse(r * 0.27, -r * 0.16, r * 0.05, r * 0.11, 0, 0, Math.PI * 2);
  x.fill();

  // 獠牙大嘴
  x.fillStyle = '#2a0010';
  x.beginPath();
  x.ellipse(0, r * 0.42, r * 0.42, r * 0.2, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#fff0d0';
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(i * r * 0.16 - r * 0.06, r * 0.3);
    x.lineTo(i * r * 0.16, r * 0.52);
    x.lineTo(i * r * 0.16 + r * 0.06, r * 0.3);
    x.closePath();
    x.fill();
  }
}

/* ==================== 防禦砲塔 ==================== */

function drawTurret(x) {
  shadow(x, 17, 14);

  // 沙包基座
  x.fillStyle = '#3a3f2e';
  x.strokeStyle = '#20241a';
  x.lineWidth = 1.3;
  for (const [bx, by] of [[-12, 8], [0, 10], [12, 8]]) {
    x.beginPath();
    x.ellipse(bx, by, 8, 5, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
  }

  // 金屬底盤
  const bg = x.createLinearGradient(0, -8, 0, 10);
  bg.addColorStop(0, '#8fa3b8');
  bg.addColorStop(1, '#3c4b5e');
  x.fillStyle = bg;
  x.strokeStyle = '#141b26';
  x.lineWidth = 1.8;
  x.beginPath();
  x.ellipse(0, 2, 15, 9, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();

  // 砲塔本體
  x.fillStyle = sphere(x, '#5d7085', 12, 0, -5);
  x.beginPath();
  x.arc(0, -5, 11, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#141b26';
  x.stroke();

  // 能量核心
  const cg = x.createRadialGradient(0, -6, 0, 0, -6, 8);
  cg.addColorStop(0, 'rgba(0,229,255,0.95)');
  cg.addColorStop(1, 'rgba(0,229,255,0)');
  x.fillStyle = cg;
  x.beginPath();
  x.arc(0, -6, 8, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#00e5ff';
  x.beginPath();
  x.arc(0, -6, 3, 0, Math.PI * 2);
  x.fill();

  // 鴨頭吉祥物標記
  x.fillStyle = '#ffcc00';
  x.beginPath();
  x.arc(-9, -13, 4.5, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ff8a1f';
  x.beginPath();
  x.moveTo(-6, -13); x.lineTo(-1, -12); x.lineTo(-6, -10.5); x.closePath();
  x.fill();
}

/* ==================== 場景裝飾物 ==================== */

// 商業街：報廢汽車 / 垃圾桶 / 霓虹招牌
function drawCar(x) {
  shadow(x, 26, 12);
  const g = x.createLinearGradient(0, -12, 0, 12);
  g.addColorStop(0, '#4a5568');
  g.addColorStop(1, '#232b38');
  x.fillStyle = g;
  x.strokeStyle = '#12171f';
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(-26, -11, 52, 22, 6);
  x.fill();
  x.stroke();
  x.fillStyle = 'rgba(0,229,255,0.18)';
  x.beginPath();
  x.roundRect(-14, -8, 26, 12, 3);
  x.fill();
  x.fillStyle = '#0e1218';
  for (const wx of [-16, 16]) {
    x.beginPath();
    x.ellipse(wx, 12, 6, 3.5, 0, 0, Math.PI * 2);
    x.fill();
  }
  // 破損的車頭燈還在閃
  x.fillStyle = 'rgba(255,214,90,0.5)';
  x.beginPath();
  x.arc(25, -3, 3, 0, Math.PI * 2);
  x.fill();
}

function drawBin(x) {
  shadow(x, 11, 11);
  const g = x.createLinearGradient(-9, 0, 9, 0);
  g.addColorStop(0, '#2f7d4f');
  g.addColorStop(1, '#17402a');
  x.fillStyle = g;
  x.strokeStyle = '#0d2318';
  x.lineWidth = 1.6;
  x.beginPath();
  x.roundRect(-9, -12, 18, 22, 3);
  x.fill();
  x.stroke();
  x.fillStyle = '#3f9a63';
  x.beginPath();
  x.roundRect(-11, -15, 22, 5, 2);
  x.fill();
  x.stroke();
}

function drawNeonSign(x) {
  shadow(x, 8, 16);
  x.strokeStyle = '#2a3240';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(0, 16);
  x.lineTo(0, -6);
  x.stroke();
  const g = x.createRadialGradient(0, -16, 2, 0, -16, 20);
  g.addColorStop(0, 'rgba(255,0,133,0.55)');
  g.addColorStop(1, 'rgba(255,0,133,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, -16, 20, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#12171f';
  x.strokeStyle = '#ff2d95';
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(-13, -24, 26, 17, 3);
  x.fill();
  x.stroke();
}

// 實驗室：培養槽 / 管線 / 警示標
function drawTank(x) {
  shadow(x, 14, 16);
  x.fillStyle = '#1d2c26';
  x.strokeStyle = '#0a1410';
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(-13, -20, 26, 36, 6);
  x.fill();
  x.stroke();
  const g = x.createLinearGradient(0, -18, 0, 14);
  g.addColorStop(0, 'rgba(0,245,155,0.55)');
  g.addColorStop(1, 'rgba(0,245,155,0.15)');
  x.fillStyle = g;
  x.beginPath();
  x.roundRect(-9, -16, 18, 28, 4);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.25)';
  for (const [bx, by, br] of [[-3, 2, 2], [4, -6, 1.5], [0, -12, 2.5]]) {
    x.beginPath();
    x.arc(bx, by, br, 0, Math.PI * 2);
    x.fill();
  }
}

function drawPipes(x) {
  shadow(x, 22, 8);
  x.strokeStyle = '#3d4a52';
  x.lineWidth = 8;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(-24, -4);
  x.lineTo(6, -4);
  x.lineTo(6, 8);
  x.stroke();
  x.strokeStyle = '#5b6b74';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(-24, -6);
  x.lineTo(4, -6);
  x.stroke();
  x.fillStyle = '#1b2429';
  for (const px of [-16, -4]) {
    x.beginPath();
    x.roundRect(px, -9, 4, 10, 1.5);
    x.fill();
  }
}

function drawHazardSign(x) {
  shadow(x, 10, 10);
  x.fillStyle = '#c8b400';
  x.strokeStyle = '#3a3300';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(0, -14); x.lineTo(14, 8); x.lineTo(-14, 8); x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = '#221e00';
  x.font = 'bold 14px sans-serif';
  x.textAlign = 'center';
  x.fillText('!', 0, 6);
}

// 極寒：冰柱 / 雪堆 / 雷達碟
function drawIceSpike(x) {
  shadow(x, 12, 12);
  const g = x.createLinearGradient(0, -26, 0, 12);
  g.addColorStop(0, 'rgba(220,245,255,0.95)');
  g.addColorStop(1, 'rgba(90,160,210,0.85)');
  x.fillStyle = g;
  x.strokeStyle = 'rgba(255,255,255,0.6)';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(0, -26); x.lineTo(11, 10); x.lineTo(-9, 10); x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.5)';
  x.beginPath();
  x.moveTo(-1, -22); x.lineTo(3, 6); x.lineTo(-4, 6); x.closePath();
  x.fill();
}

function drawSnowMound(x) {
  x.fillStyle = 'rgba(200,230,255,0.22)';
  x.beginPath();
  x.ellipse(0, 6, 26, 11, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(230,245,255,0.35)';
  x.beginPath();
  x.ellipse(-6, 2, 14, 7, 0, 0, Math.PI * 2);
  x.fill();
}

function drawRadar(x) {
  shadow(x, 14, 16);
  x.strokeStyle = '#41505f';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(0, 16); x.lineTo(0, -4);
  x.stroke();
  x.fillStyle = 'rgba(150,190,220,0.8)';
  x.strokeStyle = '#1d2836';
  x.lineWidth = 1.8;
  x.beginPath();
  x.ellipse(0, -12, 15, 8, -0.35, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = 'rgba(120,200,255,0.5)';
  x.beginPath();
  x.ellipse(0, -12, 8, 4, -0.35, 0, Math.PI * 2);
  x.fill();
}

// 熔爐：岩漿裂隙 / 鋼板 / 齒輪
function drawLavaCrack(x) {
  const g = x.createLinearGradient(-24, 0, 24, 0);
  g.addColorStop(0, 'rgba(255,90,0,0)');
  g.addColorStop(0.5, 'rgba(255,150,20,0.85)');
  g.addColorStop(1, 'rgba(255,90,0,0)');
  x.strokeStyle = g;
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(-24, 4); x.lineTo(-8, -3); x.lineTo(4, 5); x.lineTo(22, -2);
  x.stroke();
  x.strokeStyle = 'rgba(255,240,180,0.7)';
  x.lineWidth = 1.4;
  x.stroke();
}

function drawSteelPlate(x) {
  shadow(x, 22, 12);
  const g = x.createLinearGradient(0, -14, 0, 14);
  g.addColorStop(0, '#5a4038');
  g.addColorStop(1, '#2c1c18');
  x.fillStyle = g;
  x.strokeStyle = '#160c0a';
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(-22, -13, 44, 26, 4);
  x.fill();
  x.stroke();
  x.fillStyle = 'rgba(255,160,80,0.35)';
  for (const px of [-16, -5, 6, 16]) {
    x.beginPath();
    x.arc(px, 0, 2, 0, Math.PI * 2);
    x.fill();
  }
}

function drawGear(x) {
  shadow(x, 16, 12);
  x.fillStyle = '#4a3a34';
  x.strokeStyle = '#1c1210';
  x.lineWidth = 1.8;
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r1 = 17, r2 = 12;
    x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    x.lineTo(Math.cos(a + 0.16) * r2, Math.sin(a + 0.16) * r2);
  }
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = '#1c1210';
  x.beginPath();
  x.arc(0, 0, 5, 0, Math.PI * 2);
  x.fill();
}


function drawRunner(x, t, r) {
  const p = t * Math.PI * 2;
  const gallop = Math.sin(p);          // 前後腿交替
  const lunge = Math.cos(p) * 2.2;     // 撲擊時身體前後伸縮
  shadow(x, r * 0.95, r * 0.85);

  // 後方拖曳的火焰速度線
  for (const [ty, len, a] of [[-r * 0.4, 1.1, 0.5], [r * 0.05, 1.6, 0.65], [r * 0.45, 0.9, 0.4]]) {
    const tg = x.createLinearGradient(-r * (1.1 + len), 0, -r * 0.9, 0);
    tg.addColorStop(0, 'rgba(255,60,0,0)');
    tg.addColorStop(1, `rgba(255,170,60,${a})`);
    x.strokeStyle = tg;
    x.lineWidth = 2.6;
    x.beginPath();
    x.moveTo(-r * (1.1 + len) - lunge, ty + gallop * 2);
    x.lineTo(-r * 0.9 - lunge, ty + gallop);
    x.stroke();
  }

  // 四足 (前後交錯擺動)
  x.strokeStyle = '#59200a';
  x.lineWidth = 3.4;
  const legs = [[-r * 0.55, 1], [-r * 0.2, -1], [r * 0.3, -1], [r * 0.62, 1]];
  for (const [lx, phase] of legs) {
    const swing = gallop * phase * 4;
    x.beginPath();
    x.moveTo(lx, r * 0.35);
    x.lineTo(lx + swing, r * 0.95);
    x.lineTo(lx + swing * 1.6 + 2, r * 1.25);
    x.stroke();
  }

  // 拉長低伏的軀幹
  x.fillStyle = sphere(x, '#ff6b35', r * 1.1, -r * 0.1, 0);
  x.beginPath();
  x.moveTo(-r * 1.25, r * 0.1);
  x.quadraticCurveTo(-r * 1.1, -r * 0.75, -r * 0.1, -r * 0.7);
  x.quadraticCurveTo(r * 0.95 + lunge, -r * 0.72, r * 1.3 + lunge, -r * 0.05);
  x.quadraticCurveTo(r * 0.9 + lunge, r * 0.72, -r * 0.2, r * 0.66);
  x.quadraticCurveTo(-r * 1.05, r * 0.62, -r * 1.25, r * 0.1);
  x.closePath();
  x.fill();
  x.strokeStyle = '#4a1704';
  x.lineWidth = 2;
  x.stroke();

  // 背脊骨刺
  x.fillStyle = '#ffd6a5';
  x.strokeStyle = '#4a1704';
  x.lineWidth = 1.1;
  for (let i = 0; i < 4; i++) {
    const bx = -r * 0.8 + i * r * 0.52;
    const h = r * (0.42 - i * 0.05);
    x.beginPath();
    x.moveTo(bx - 2.6, -r * 0.62);
    x.lineTo(bx, -r * 0.62 - h);
    x.lineTo(bx + 2.6, -r * 0.62);
    x.closePath();
    x.fill();
    x.stroke();
  }

  // 前伸的顎部與獠牙
  x.fillStyle = '#c9400f';
  x.beginPath();
  x.moveTo(r * 0.75 + lunge, -r * 0.35);
  x.quadraticCurveTo(r * 1.7 + lunge, -r * 0.2, r * 1.62 + lunge, r * 0.12);
  x.quadraticCurveTo(r * 1.2 + lunge, r * 0.45, r * 0.72 + lunge, r * 0.3);
  x.closePath();
  x.fill();
  x.strokeStyle = '#4a1704';
  x.lineWidth = 1.6;
  x.stroke();
  x.fillStyle = '#fff2d0';
  for (let i = 0; i < 3; i++) {
    const tx = r * (0.95 + i * 0.28) + lunge;
    x.beginPath();
    x.moveTo(tx, r * 0.02);
    x.lineTo(tx + 2, r * 0.32);
    x.lineTo(tx + 3.6, r * 0.02);
    x.closePath();
    x.fill();
  }

  // 燃燒般的獨目
  const eg = x.createRadialGradient(r * 0.55 + lunge, -r * 0.42, 0, r * 0.55 + lunge, -r * 0.42, r * 0.7);
  eg.addColorStop(0, 'rgba(255,240,150,0.75)');
  eg.addColorStop(1, 'rgba(255,120,0,0)');
  x.fillStyle = eg;
  x.beginPath();
  x.arc(r * 0.55 + lunge, -r * 0.42, r * 0.7, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#fff3b0';
  x.beginPath();
  x.ellipse(r * 0.55 + lunge, -r * 0.42, 3.4, 2.2, -0.3, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#5c1c05';
  x.beginPath();
  x.ellipse(r * 0.6 + lunge, -r * 0.42, 1.1, 2.2, -0.3, 0, Math.PI * 2);
  x.fill();
}

function drawWarden(x, t, r) {
  const p = t * Math.PI * 2;
  const step = Math.sin(p) * 1.4;
  const guard = Math.sin(p) * 1.2; // 盾牌隨步伐微晃
  shadow(x, r * 1.0, r * 1.05);

  // 靴子
  x.fillStyle = '#123449';
  for (const sgn of [-1, 1]) {
    x.beginPath();
    x.roundRect(sgn * r * 0.42 - r * 0.26, r * 0.75 - step * sgn, r * 0.52, r * 0.4, 3);
    x.fill();
  }

  // 軀幹裝甲 (梯形，上寬下窄)
  x.fillStyle = sphere(x, '#2a6f97', r * 1.2, 0, step);
  x.beginPath();
  x.moveTo(-r * 0.82, -r * 0.62 + step);
  x.lineTo(r * 0.82, -r * 0.62 + step);
  x.lineTo(r * 0.66, r * 0.82 + step);
  x.lineTo(-r * 0.66, r * 0.82 + step);
  x.closePath();
  x.fill();
  x.strokeStyle = '#08202e';
  x.lineWidth = 2.4;
  x.stroke();

  // 胸甲分線與能量核心
  x.strokeStyle = 'rgba(0,0,0,0.4)';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(-r * 0.74, r * 0.12 + step);
  x.lineTo(r * 0.74, r * 0.12 + step);
  x.stroke();
  const cg = x.createRadialGradient(0, r * 0.4 + step, 0, 0, r * 0.4 + step, r * 0.45);
  cg.addColorStop(0, 'rgba(76,201,240,0.9)');
  cg.addColorStop(1, 'rgba(76,201,240,0)');
  x.fillStyle = cg;
  x.beginPath();
  x.arc(0, r * 0.4 + step, r * 0.45, 0, Math.PI * 2);
  x.fill();

  // 厚重肩甲
  x.fillStyle = '#1b5a7d';
  x.strokeStyle = '#08202e';
  x.lineWidth = 2;
  for (const sgn of [-1, 1]) {
    x.beginPath();
    x.ellipse(sgn * r * 0.92, -r * 0.55 + step, r * 0.38, r * 0.3, sgn * 0.3, 0, Math.PI * 2);
    x.fill();
    x.stroke();
  }

  // 頭盔與發光觀察縫
  x.fillStyle = '#1b5a7d';
  x.beginPath();
  x.roundRect(-r * 0.42, -r * 1.12 + step, r * 0.84, r * 0.58, 5);
  x.fill();
  x.strokeStyle = '#08202e';
  x.lineWidth = 2;
  x.stroke();
  const vg = x.createLinearGradient(-r * 0.34, 0, r * 0.34, 0);
  vg.addColorStop(0, '#4cc9f0');
  vg.addColorStop(0.5, '#d8f6ff');
  vg.addColorStop(1, '#4cc9f0');
  x.fillStyle = vg;
  x.fillRect(-r * 0.32, -r * 0.92 + step, r * 0.64, r * 0.16);

  // 正面大盾 (減傷的視覺依據)：六角板 + 警示斜紋 + 高光
  const sy = step + guard;
  x.fillStyle = '#4cc9f0';
  x.strokeStyle = '#08202e';
  x.lineWidth = 2.6;
  x.beginPath();
  x.moveTo(r * 0.55, -r * 1.05 + sy);
  x.lineTo(r * 1.32, -r * 0.68 + sy);
  x.lineTo(r * 1.32, r * 0.68 + sy);
  x.lineTo(r * 0.55, r * 1.05 + sy);
  x.lineTo(r * 0.4, sy);
  x.closePath();
  x.fill();
  x.stroke();
  x.save();
  x.clip();
  x.strokeStyle = 'rgba(10,30,45,0.45)';
  x.lineWidth = 4;
  for (let i = -3; i <= 4; i++) {
    x.beginPath();
    x.moveTo(r * 0.4 + i * 9, -r * 1.2 + sy);
    x.lineTo(r * 0.4 + i * 9 + r * 0.8, r * 1.2 + sy);
    x.stroke();
  }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,0.6)';
  x.lineWidth = 1.8;
  x.beginPath();
  x.moveTo(r * 0.72, -r * 0.78 + sy);
  x.lineTo(r * 1.18, -r * 0.56 + sy);
  x.stroke();
}

function drawSporeHost(x, t, r) {
  const p = t * Math.PI * 2;
  const breathe = 1 + Math.sin(p) * 0.07;
  shadow(x, r * 0.95, r * 1.0);

  // 短觸足
  x.strokeStyle = '#3d5a08';
  x.lineWidth = 3;
  for (let i = -2; i <= 2; i++) {
    const lx = i * r * 0.32;
    x.beginPath();
    x.moveTo(lx, r * 0.6);
    x.quadraticCurveTo(lx + Math.sin(p + i) * 3, r * 0.95, lx + Math.sin(p + i) * 6, r * 1.15);
    x.stroke();
  }

  x.save();
  x.scale(breathe, breathe);

  // 半透明孢囊 (看得見裡面的胚胎)
  x.fillStyle = sphere(x, '#7cb518', r, 0, 0);
  x.beginPath();
  x.ellipse(0, 0, r, r * 0.95, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#2f4a06';
  x.lineWidth = 2.2;
  x.stroke();

  // 內部待孵幼體 (緩慢繞行)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + p * 0.4;
    const ex = Math.cos(a) * r * 0.42;
    const ey = Math.sin(a) * r * 0.38;
    x.fillStyle = sphere(x, '#d8ff7a', r * 0.3, ex, ey);
    x.beginPath();
    x.arc(ex, ey, r * 0.3, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(47,74,6,0.8)';
    x.lineWidth = 1.2;
    x.stroke();
    x.fillStyle = '#243a04';
    x.beginPath();
    x.arc(ex + r * 0.06, ey, r * 0.11, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.beginPath();
    x.arc(ex - r * 0.1, ey - r * 0.11, r * 0.06, 0, Math.PI * 2);
    x.fill();
  }

  // 囊壁血管
  x.strokeStyle = 'rgba(47,74,6,0.5)';
  x.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    x.beginPath();
    x.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    x.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.7, Math.sin(a + 0.5) * r * 0.7,
                       Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.9);
    x.stroke();
  }
  x.restore();

  // 頂部菌傘
  x.fillStyle = '#5d8a10';
  x.strokeStyle = '#2f4a06';
  x.lineWidth = 2;
  x.beginPath();
  x.ellipse(0, -r * 0.75, r * 0.95, r * 0.45, 0, Math.PI, Math.PI * 2);
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = 'rgba(197,240,76,0.75)';
  for (const [dx, dy, dr] of [[-r * 0.45, -r * 0.9, 3], [0, -r * 1.02, 3.6], [r * 0.48, -r * 0.88, 2.6]]) {
    x.beginPath();
    x.arc(dx, dy, dr, 0, Math.PI * 2);
    x.fill();
  }

  // 噴孢管與飄散的孢子霧
  x.fillStyle = '#4a6b12';
  for (const a of [-2.5, -0.6, 2.5]) {
    x.save();
    x.translate(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.88);
    x.rotate(a);
    x.beginPath();
    x.roundRect(-3, -4.5, 9, 9, 3);
    x.fill();
    x.restore();
  }
  x.fillStyle = `rgba(197,240,76,${0.28 + Math.sin(p) * 0.14})`;
  for (let i = 0; i < 4; i++) {
    const a = p * 0.5 + i * 1.6;
    x.beginPath();
    x.arc(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.15, 2.4, 0, Math.PI * 2);
    x.fill();
  }
}

function drawSporeling(x, t, r) {
  const p = t * Math.PI * 2;
  const wag = Math.sin(p) * 5;   // 尾巴擺動
  const hop = Math.sin(p * 2) * 1.8;
  shadow(x, r * 0.75, r * 0.95);

  // 擺動的尾鰭
  x.strokeStyle = '#6e9e0d';
  x.lineWidth = 2.4;
  x.beginPath();
  x.moveTo(-r * 0.6, hop);
  x.quadraticCurveTo(-r * 1.3, hop + wag * 0.5, -r * 1.7, hop + wag);
  x.stroke();
  x.fillStyle = 'rgba(197,240,76,0.6)';
  x.beginPath();
  x.moveTo(-r * 1.45, hop + wag * 0.85);
  x.lineTo(-r * 2.1, hop + wag - 4);
  x.lineTo(-r * 2.1, hop + wag + 4);
  x.closePath();
  x.fill();

  // 水滴狀身體
  x.fillStyle = sphere(x, '#c5f04c', r * 1.05, r * 0.1, hop);
  x.beginPath();
  x.moveTo(-r * 0.7, hop);
  x.quadraticCurveTo(-r * 0.5, hop - r, r * 0.35, hop - r * 0.85);
  x.quadraticCurveTo(r * 1.15, hop - r * 0.3, r * 1.1, hop + r * 0.15);
  x.quadraticCurveTo(r * 0.9, hop + r * 0.95, -r * 0.2, hop + r * 0.9);
  x.quadraticCurveTo(-r * 0.6, hop + r * 0.6, -r * 0.7, hop);
  x.closePath();
  x.fill();
  x.strokeStyle = '#42600a';
  x.lineWidth = 1.6;
  x.stroke();

  // 背上的孢子點
  x.fillStyle = 'rgba(66,96,10,0.55)';
  for (const [dx, dy, dr] of [[-r * 0.1, -r * 0.42, 2], [r * 0.4, -r * 0.2, 1.5], [r * 0.05, r * 0.35, 1.7]]) {
    x.beginPath();
    x.arc(dx, dy + hop, dr, 0, Math.PI * 2);
    x.fill();
  }

  // 單顆大眼
  x.fillStyle = '#f6ffe0';
  x.beginPath();
  x.arc(r * 0.45, hop - r * 0.1, r * 0.42, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#42600a';
  x.lineWidth = 1.2;
  x.stroke();
  x.fillStyle = '#1d2b04';
  x.beginPath();
  x.arc(r * 0.58, hop - r * 0.1, r * 0.2, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.beginPath();
  x.arc(r * 0.5, hop - r * 0.24, r * 0.09, 0, Math.PI * 2);
  x.fill();
}

function drawSpitter(x, t, r) {
  const p = t * Math.PI * 2;
  const bob = Math.sin(p) * 2;
  const crawl = Math.sin(p);

  shadow(x, r * 1.15, r * 0.85 + 4);

  // 4 隻生化節肢蟲腿 (前後交替爬行)
  x.strokeStyle = '#0b291e';
  x.lineWidth = 2.2;
  x.lineCap = 'round';
  const legPairs = [
    { side: -1, fore: 1, angle: -0.65, legStep: crawl },
    { side: 1, fore: 1, angle: 0.65, legStep: -crawl },
    { side: -1, fore: -1, angle: -2.35, legStep: -crawl },
    { side: 1, fore: -1, angle: 2.35, legStep: crawl },
  ];
  for (const lp of legPairs) {
    const lx = Math.cos(lp.angle) * (r * 0.7);
    const ly = Math.sin(lp.angle) * (r * 0.6) + bob;
    const kneeX = lx * 1.6 + lp.legStep * 3;
    const kneeY = ly * 1.1 - 4;
    const footX = lx * 2.1 + lp.legStep * 5;
    const footY = ly + 8;

    x.beginPath();
    x.moveTo(lx, ly);
    x.lineTo(kneeX, kneeY);
    x.lineTo(footX, footY);
    x.stroke();
  }

  // 背部蓄積酸液的半透明發光囊球 (隨呼吸脈動)
  const sacPulse = Math.sin(p) * 1.2;
  const sacR = r * 0.85 + sacPulse;
  const sacX = -r * 0.35;
  const sacY = bob - 2;

  x.save();
  x.fillStyle = sphere(x, '#06d6a0', sacR, sacX, sacY);
  x.beginPath();
  x.arc(sacX, sacY, sacR, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#024b30';
  x.lineWidth = 1.6;
  x.stroke();

  // 囊球內部酸液高光與氣泡
  x.fillStyle = 'rgba(255, 255, 255, 0.7)';
  x.beginPath();
  x.arc(sacX - sacR * 0.35, sacY - sacR * 0.35, sacR * 0.28, 0, Math.PI * 2);
  x.fill();

  x.fillStyle = '#b7efc5';
  for (let i = 0; i < 3; i++) {
    const bubbleAng = p * 0.6 + i * 2.1;
    const bx = sacX + Math.cos(bubbleAng) * (sacR * 0.45);
    const by = sacY + Math.sin(bubbleAng) * (sacR * 0.4);
    x.beginPath();
    x.arc(bx, by, 2, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();

  // 前身幾丁質硬甲 (深橄欖綠)
  x.fillStyle = sphere(x, '#1b4332', r * 0.75, r * 0.3, bob);
  x.strokeStyle = '#081c15';
  x.lineWidth = 2;
  x.beginPath();
  x.ellipse(r * 0.3, bob, r * 0.65, r * 0.55, 0.1, 0, Math.PI * 2);
  x.fill();
  x.stroke();

  // 噴酸管口器 (朝前開口)
  x.fillStyle = '#06d6a0';
  x.strokeStyle = '#0b291e';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(r * 0.75, bob - 4);
  x.lineTo(r * 1.15, bob - 2);
  x.lineTo(r * 1.15, bob + 2);
  x.lineTo(r * 0.75, bob + 4);
  x.closePath();
  x.fill();
  x.stroke();

  // 口器滴垂的酸液滴
  const dripY = bob + 4 + (Math.sin(p * 2) > 0 ? Math.sin(p * 2) * 3 : 0);
  x.fillStyle = '#38b000';
  x.beginPath();
  x.arc(r * 1.05, dripY, 2, 0, Math.PI * 2);
  x.fill();

  // 雙眼 (螢光劇毒紅)
  x.fillStyle = '#ff0055';
  x.beginPath();
  x.arc(r * 0.55, bob - 5, 2.2, 0, Math.PI * 2);
  x.arc(r * 0.55, bob + 2, 2.2, 0, Math.PI * 2);
  x.fill();
}

/* ==================== 經驗水晶 ==================== */

// 經驗水晶：數量最多、每幀都在畫的東西，烘焙後每顆只剩一次 drawImage。
// 外圈光暈直接烘進圖裡，取代原本每顆每幀的 shadowBlur (最貴的 canvas 操作)。
function drawGem(x, color, r) {
  const hh = r * 1.3; // 菱形上下半高

  // 外圈光暈 (原本是 shadowBlur = 6)
  const glow = x.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.4);
  glow.addColorStop(0, hexA(color, 0.55));
  glow.addColorStop(0.5, hexA(color, 0.18));
  glow.addColorStop(1, hexA(color, 0));
  x.fillStyle = glow;
  x.beginPath();
  x.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  x.fill();

  // 左半面 (暗面) 與右半面 (亮面) 分開上色，做出稜面寶石感
  x.beginPath();
  x.moveTo(0, -hh);
  x.lineTo(-r, 0);
  x.lineTo(0, hh);
  x.closePath();
  x.fillStyle = mix(color, '#000000', 0.35);
  x.fill();

  x.beginPath();
  x.moveTo(0, -hh);
  x.lineTo(r, 0);
  x.lineTo(0, hh);
  x.closePath();
  const face = x.createLinearGradient(0, -hh, 0, hh);
  face.addColorStop(0, mix(color, '#ffffff', 0.55));
  face.addColorStop(0.45, color);
  face.addColorStop(1, mix(color, '#000000', 0.2));
  x.fillStyle = face;
  x.fill();

  // 外框
  x.strokeStyle = mix(color, '#ffffff', 0.3);
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(0, -hh);
  x.lineTo(r, 0);
  x.lineTo(0, hh);
  x.lineTo(-r, 0);
  x.closePath();
  x.stroke();

  // 上方鏡面高光
  x.fillStyle = 'rgba(255,255,255,0.8)';
  x.beginPath();
  x.moveTo(0, -hh * 0.82);
  x.lineTo(r * 0.36, -hh * 0.16);
  x.lineTo(0, hh * 0.1);
  x.lineTo(-r * 0.36, -hh * 0.16);
  x.closePath();
  x.fill();
}

// #rrggbb → rgba()，以及兩色線性混合 (水晶稜面上色用)
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(hex, other, t) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (sh) => Math.round((((a >> sh) & 255) * (1 - t)) + (((b >> sh) & 255) * t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/* ==================== 對外介面 ==================== */


const BUILDERS = {
  duck:    { w: 64, h: 60, fn: (x, t) => drawDuck(x, t) },
  rabbit:  { w: 72, h: 64, fn: (x, t) => drawRabbit(x, t) },
  penguin: { w: 64, h: 64, fn: (x, t) => drawPenguin(x, t) },
  cat:     { w: 68, h: 64, fn: (x, t) => drawCat(x, t) },
  walker: { w: 56, h: 52, fn: (x, t) => drawWalker(x, t, 14) },
  bat:    { w: 60, h: 48, fn: (x, t) => drawBat(x, t, 11) },
  brute:  { w: 76, h: 72, fn: (x, t) => drawBrute(x, t, 22) },
  boomer: { w: 60, h: 68, fn: (x, t) => drawBoomer(x, t, 16, false) },
  boomer_armed: { w: 60, h: 68, fn: (x, t) => drawBoomer(x, t, 16, true) },
  runner: { w: 84, h: 56, fn: (x, t) => drawRunner(x, t, 13) },
  warden: { w: 76, h: 64, fn: (x, t) => drawWarden(x, t, 20) },
  spore_host: { w: 64, h: 60, fn: (x, t) => drawSporeHost(x, t, 19) },
  sporeling:  { w: 44, h: 34, fn: (x, t) => drawSporeling(x, t, 8) },
  spitter:    { w: 68, h: 58, fn: (x, t) => drawSpitter(x, t, 15) },
  boss:   { w: 168, h: 168, fn: (x, t) => drawBoss(x, t, 40, false) },
  boss_charging: { w: 168, h: 168, fn: (x, t) => drawBoss(x, t, 40, true) },
  turret:  { w: 60, h: 56, fn: (x) => drawTurret(x) },

  // 經驗水晶 (static：一格就夠，上下浮動由 DropItem 自己 translate)
  gem_green:  { w: 32, h: 32, static: true, fn: (x) => drawGem(x, '#00f59b', 4) },
  gem_blue:   { w: 36, h: 36, static: true, fn: (x) => drawGem(x, '#00b4d8', 5) },
  gem_purple: { w: 40, h: 40, static: true, fn: (x) => drawGem(x, '#b5179e', 6) },
  gem_gold:   { w: 44, h: 44, static: true, fn: (x) => drawGem(x, '#ffb703', 7) },

  // 場景裝飾 (只需一格，不做動畫)
  car:        { w: 64, h: 40, static: true, fn: drawCar },
  bin:        { w: 30, h: 40, static: true, fn: drawBin },
  neon:       { w: 48, h: 56, static: true, fn: drawNeonSign },
  tank:       { w: 34, h: 48, static: true, fn: drawTank },
  pipes:      { w: 56, h: 28, static: true, fn: drawPipes },
  hazard:     { w: 34, h: 32, static: true, fn: drawHazardSign },
  ice_spike:  { w: 30, h: 46, static: true, fn: drawIceSpike },
  snow:       { w: 60, h: 30, static: true, fn: drawSnowMound },
  radar:      { w: 38, h: 48, static: true, fn: drawRadar },
  lava_crack: { w: 56, h: 20, static: true, fn: drawLavaCrack },
  steel:      { w: 52, h: 34, static: true, fn: drawSteelPlate },
  gear:       { w: 42, h: 42, static: true, fn: drawGear },
};

// 取得某角色的 sprite 組 (首次呼叫才烘焙，之後直接命中快取)
export function getSprite(key) {
  let s = cache.get(key);
  if (s) return s;

  const b = BUILDERS[key] || BUILDERS.walker;
  const count = b.static ? 1 : FRAMES;
  const frames = [];
  for (let i = 0; i < count; i++) {
    frames.push(make(b.w, b.h, (x) => b.fn(x, i / FRAMES)));
  }
  s = { frames, flash: b.static ? frames : frames.map(whiten), w: b.w, h: b.h };
  cache.set(key, s);
  return s;
}

// 把 sprite 畫到畫布中心點 (sx, sy)
export function blit(ctx, sprite, frameIndex, sx, sy, useFlash = false) {
  const list = useFlash ? sprite.flash : sprite.frames;
  const img = list[frameIndex % list.length];
  ctx.drawImage(img, sx - sprite.w / 2, sy - sprite.h / 2, sprite.w, sprite.h);
}
