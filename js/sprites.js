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

/* ==================== 材質層 (material pass) ==================== */
// 為什麼要有這一層：五個角色原本是「各自畫完就交件」，光向、邊光、體積感全看各函式
// 記不記得畫 —— 結果是角色在深色柏油地上像一張貼紙，缺厚度、也不好從背景裡辨識。
// 這一層在烘焙完成後統一補三件事（只跑一次，每幀仍然只有 drawImage）：
//   1. 輪廓光：把剪影往左上偏移後減掉本體，得到「左上外緣」的新月；外圈一層寬而淡、
//      內圈一層窄而亮，並且再用 source-atop 疊一層落在本體內側的 accent 邊光。
//      等於全遊戲固定從左上方打一盞側光 —— 敵人與角色因此都有立體邊緣。
//   2. 頂光：剪影內上半部疊極淡的白。
//   3. 底部環境光遮蔽：剪影內下半部疊暗，讓角色「坐」在地上而不是飄著。
// accent 是各角色／敵種的主色，讓輪廓光跟角色配色一致（鴨鴨琥珀、喵喵洋紅…）。
const DEFAULT_ACCENT = '#cfe3ff';   // 敵人預設：冷白邊光
const FIXED_ACCENT = {
  duck: '#ffd166',
  rabbit: '#b98cff',
  penguin: '#7fd8ff',
  cat: '#ff5fd2',
  mechanic: '#ff9f45',
  turret: '#ffb703',
  gem_green: '#00f59b',
  gem_blue: '#00b4d8',
  gem_purple: '#b5179e',
  gem_gold: '#ffb703',
};
// Boss 的 key 是動態組出來的 (boss_<theme>[_final][_charging])，用前綴比對
const BOSS_ACCENT = [
  ['boss_street', '#ff7b00'],
  ['boss_lab', '#7dff8f'],
  ['boss_frost', '#7fd8ff'],
  ['boss_core', '#c77dff'],
  // 新三關的主色必須排在泛用規則 ['boss', …] 之前：accentFor 是前綴比對、取第一個命中，
  // 放到後面就永遠輪不到它們，三隻會全部吃到泛用粉紅邊光。
  ['boss_subway', '#ff9f45'],
  ['boss_swamp', '#7dff8f'],
  ['boss_storm', '#ffd166'],
  // 第二批三關（熔毀鑄造廠／霜封虛空／虛空裂道）：同樣必須排在泛用 ['boss', …] 之前，
  // 否則這三隻會全部吃到粉紅邊光，跟關卡主題色（橙紅／紫藍／青綠）對不起來。
  ['boss_foundry', '#ff9a3c'],
  ['boss_frostvoid', '#9d8cff'],
  ['boss_voidroad', '#7dffe8'],
  ['boss', '#ff4d6d'],
];

function accentFor(key, b) {
  if (b.static) return null;         // 場景裝飾維持平面：它們本來就是貼在地上的圖
  const m = key.match(/^([^:]+)/);
  const base = m ? m[1] : key;
  if (FIXED_ACCENT[base]) return FIXED_ACCENT[base];
  for (const [prefix, color] of BOSS_ACCENT) {
    if (base.startsWith(prefix)) return color;
  }
  return DEFAULT_ACCENT;
}

// 邊光兩層都往左上偏移，而且**偏移量大於模糊半徑 + 外框厚度**：
// 這樣亮部只會出現在左上，不會繞成一圈均勻光暈（均勻光暈會把「左上比右下亮」的
// 對比吃掉，看起來像發光貼紙而不是被打光）。
const RIM_LAYERS = [
  { off: 3.0, blur: 1.1, alpha: 0.42 },   // 外圈：柔，負責把左上角推出去
  { off: 1.6, blur: 0.45, alpha: 0.82 },  // 內圈：窄而亮，負責讀出邊緣
];
// 深色外框的厚度（device px）。它同時是可讀性（任何底色都有邊界）與對比來源。
const OUTLINE_BLUR = 2.2;
const OUTLINE_ALPHA = 0.5;

function scratchCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// canvas 為 make() 烘好的成品；sil / rim 是同一顆 sprite 內重複使用的暫存畫布
function materialize(canvas, accent, sil, rim) {
  const W = canvas.width;
  const H = canvas.height;
  const cx = canvas.getContext('2d');
  const sx = sil.getContext('2d');
  const rx = rim.getContext('2d');

  // 1) 邊光剪影：邊光要比主色亮 —— 它代表的是「光」，不是角色配色。
  // 直接用主色會有一半的角色失效：兔子的薰衣草紫 (#b98cff) 與牠自己的白身體幾乎同亮度、
  // 喵喵的洋紅比牠頭上的青色光暈還暗 → 這兩隻的邊光等於沒畫（實測 Δ3 / Δ14）。
  const rimColor = mix(accent, '#ffffff', 0.5);

  // 0) 深色外框：canvas 的 shadow 畫在本體之下，所以只會露在外側。
  //    角色因此在任何底色上都有邊界，而且右下角被壓暗之後，左上的邊光才有對比
  //    （只加均勻亮光暈會讓整圈一樣亮，反而看不出光從哪來）。
  cx.save();
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.globalCompositeOperation = 'source-over';
  cx.shadowColor = `rgba(0,0,0,${OUTLINE_ALPHA})`;
  cx.shadowBlur = OUTLINE_BLUR * SS;
  cx.drawImage(canvas, 0, 0);
  cx.restore();

  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalCompositeOperation = 'source-over';
  sx.globalAlpha = 1;
  sx.clearRect(0, 0, W, H);
  sx.drawImage(canvas, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = rimColor;
  sx.fillRect(0, 0, W, H);
  sx.globalCompositeOperation = 'source-over';

  const offsetSil = (off) => {
    rx.setTransform(1, 0, 0, 1, 0, 0);
    rx.globalCompositeOperation = 'source-over';
    rx.globalAlpha = 1;
    rx.clearRect(0, 0, W, H);
    rx.drawImage(sil, -off * SS, -off * SS);
  };

  // 2) 外側輪廓光：偏移剪影 − 本體 = 只有本體外的新月
  cx.save();
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.globalCompositeOperation = 'source-over';
  for (const layer of RIM_LAYERS) {
    // 模糊讓外圈變成柔光而不是一圈硬邊（瀏覽器不支援 filter 時退回硬邊，不會壞）；
    // 要在把偏移剪影「畫進 rim」之前設，濾鏡才會作用在那一次繪製上
    rx.filter = `blur(${(layer.blur * SS).toFixed(2)}px)`;
    offsetSil(layer.off);
    rx.filter = 'none';
    rx.globalCompositeOperation = 'destination-out';
    rx.drawImage(canvas, 0, 0);
    rx.globalCompositeOperation = 'source-over';
    cx.globalAlpha = layer.alpha;
    cx.drawImage(rim, 0, 0);
  }

  // 3) 內側邊光：偏移剪影 ∩ 本體，再用 source-atop 疊回去，保證不超出外型
  offsetSil(1.4);
  rx.globalCompositeOperation = 'destination-in';
  rx.drawImage(canvas, 0, 0);
  rx.globalCompositeOperation = 'source-over';
  cx.globalCompositeOperation = 'source-atop';
  cx.globalAlpha = 0.34;
  cx.drawImage(rim, 0, 0);

  // 4) 頂光 + 底部環境光遮蔽：source-atop 讓漸層只落在剪影內
  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.11)');
  g.addColorStop(0.40, 'rgba(255,255,255,0)');
  g.addColorStop(0.66, 'rgba(0,0,0,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  cx.globalAlpha = 1;
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);
  cx.restore();
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

/* ==================== 戰地工程師 (工兵阿鴨) ==================== */

function drawMechanicDuck(x, t) {
  const p = t * Math.PI * 2;
  const bob = Math.sin(p) * 2.2;
  const wing = Math.sin(p + 0.4);

  x.save();
  shadow(x, 15, 8);

  // 雙腳 (踩踏步)
  for (const s of [-1, 1]) {
    const ph = p + (s === 1 ? Math.PI : 0);
    const lift = Math.max(0, -Math.sin(ph)) * 3;
    x.fillStyle = '#ff7b00';
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

  // 身體 (鮮黃羽毛)
  x.fillStyle = sphere(x, '#ffc72c', 17, 0, bob);
  x.beginPath();
  x.arc(0, bob, 16, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#7d4d00';
  x.lineWidth = 2;
  x.stroke();

  // 工程反光背心
  x.fillStyle = '#ff6b35';
  x.beginPath();
  x.roundRect(-10, bob - 2, 20, 14, 4);
  x.fill();
  // 反光條
  x.fillStyle = '#e0f7fa';
  x.fillRect(-10, bob + 3, 20, 3);
  x.fillStyle = '#00f59b';
  x.fillRect(-10, bob + 7, 20, 2);

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

  // 工程安全帽
  x.fillStyle = '#ffb703';
  x.strokeStyle = '#b27700';
  x.lineWidth = 1.6;
  x.beginPath();
  x.arc(2, -10 + bob, 14, Math.PI * 0.9, Math.PI * 2.1);
  x.fill();
  x.stroke();
  // 帽緣
  x.fillStyle = '#fb8500';
  x.beginPath();
  x.roundRect(-11, -10 + bob, 26, 4.5, 2);
  x.fill();
  x.stroke();
  // 戰術探照燈
  x.fillStyle = '#1b222e';
  x.fillRect(2, -15 + bob, 6, 5);
  x.fillStyle = '#00f59b';
  x.beginPath();
  x.arc(5, -12.5 + bob, 2.5, 0, Math.PI * 2);
  x.fill();

  // 防護風鏡
  x.fillStyle = 'rgba(0, 229, 255, 0.75)';
  x.strokeStyle = '#1b222e';
  x.lineWidth = 1.5;
  x.beginPath();
  x.roundRect(1, -6 + bob, 13, 7, 2);
  x.fill();
  x.stroke();

  // 扳手手持 / 翅膀
  x.save();
  x.translate(-3, 4 + bob + wing * 0.3);
  x.rotate(-0.35 + wing * 0.07);
  x.fillStyle = '#dc9c00';
  x.strokeStyle = '#7d4d00';
  x.lineWidth = 1.2;
  x.beginPath();
  x.ellipse(0, 0, 7.5, 5, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  // 金屬扳手
  x.fillStyle = '#adb5bd';
  x.strokeStyle = '#495057';
  x.lineWidth = 1.2;
  x.beginPath();
  x.rect(2, -2, 14, 3.5);
  x.fill();
  x.stroke();
  x.beginPath();
  x.arc(17, 0, 4, -0.6, 0.6, true);
  x.stroke();
  x.restore();

  x.restore();
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

/* ==================== 關卡主題 Boss ==================== */
// 四種 Boss 外觀依關卡主題區分 (街頭巨屍 / 生化軟泥 / 冰霜機甲 / 熔岩暴君)，
// 每種都有 一般 + 衝鋒(changing arg) + 最終(final arg 加王冠/巨體) 變體。

function drawBossStreet(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const pulse = 1 + Math.sin(p) * 0.05;
  const step = Math.sin(p) * 3;
  shadow(x, r * 1.15, r * 1.1);

  // 外層氣場 (暖黃朽光)
  const c1 = charging ? 'rgba(255,140,30,0.55)' : final ? 'rgba(255,160,50,0.35)' : 'rgba(220,170,60,0.22)';
  const ag = x.createRadialGradient(0, 0, r, 0, 0, (r + (final ? 34 : 22)) * pulse);
  ag.addColorStop(0, c1);
  ag.addColorStop(1, 'rgba(220,170,60,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, 0, (r + (final ? 34 : 22)) * pulse, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = charging ? 'rgba(255,170,60,0.95)' : 'rgba(220,170,60,0.45)';
  x.lineWidth = charging ? 5 : 3;
  x.beginPath();
  x.arc(0, 0, (r + 6) * pulse, 0, Math.PI * 2);
  x.stroke();

  x.save();
  x.rotate(charging ? 0.08 : Math.sin(p * 0.5) * 0.02);

  // 雙腿 (交錯步伐)
  x.strokeStyle = '#2e3a18';
  x.lineWidth = 9;
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * r * 0.5, r * 0.55);
    x.lineTo(s * r * 0.48 + step * s, r * 1.02);
    x.stroke();
  }
  x.fillStyle = '#1f2416';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(s * r * 0.42 + step * s, r * 1.06, r * 0.28, r * 0.14, 0, 0, Math.PI * 2);
    x.fill();
  }

  // 廢輪胎肩甲
  for (const s of [-1, 1]) {
    x.fillStyle = '#141414';
    x.beginPath();
    x.arc(s * r * 0.85, -r * 0.5, r * 0.42, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#000';
    x.lineWidth = 2.2;
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.08)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      x.beginPath();
      x.moveTo(s * r * 0.85 + Math.cos(a) * r * 0.3, -r * 0.5 + Math.sin(a) * r * 0.3);
      x.lineTo(s * r * 0.85 + Math.cos(a) * r * 0.42, -r * 0.5 + Math.sin(a) * r * 0.42);
      x.stroke();
    }
  }

  // 主體 (巨大腐屍)
  x.fillStyle = sphere(x, final ? '#8a6a22' : '#5d7132', r * 0.95, 0, r * 0.06);
  x.beginPath();
  x.arc(0, r * 0.06, r * 0.95, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#20290f';
  x.lineWidth = 3;
  x.stroke();
  x.fillStyle = '#33401a';
  x.beginPath();
  x.ellipse(0, r * 0.45, r * 0.62, r * 0.4, 0, 0, Math.PI * 2);
  x.fill();
  // 露出肋骨
  x.strokeStyle = 'rgba(20,26,8,0.7)';
  x.lineWidth = 2.2;
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.arc(i * r * 0.18, r * 0.2, r * 0.28, Math.PI * 0.35, Math.PI * 1.35);
    x.stroke();
  }

  // 左臂曳鏈鎚球 (隨步伐擺盪)
  const swing = Math.sin(p) * r * 0.45;
  x.strokeStyle = '#222';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(-r * 0.92, -r * 0.1);
  x.quadraticCurveTo(-r * 1.3, r * 0.1 + swing, -r * 1.35, r * 0.3 + swing);
  x.stroke();
  x.fillStyle = '#3c3c46';
  x.beginPath();
  x.arc(-r * 1.35, r * 0.32 + swing, r * 0.3, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#15151c';
  x.lineWidth = 2.4;
  x.stroke();
  x.fillStyle = '#7a7a8a';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    x.beginPath();
    x.arc(-r * 1.35 + Math.cos(a) * r * 0.22, r * 0.32 + swing + Math.sin(a) * r * 0.22, r * 0.07, 0, Math.PI * 2);
    x.fill();
  }

  // 右臂
  x.fillStyle = '#2b3417';
  x.strokeStyle = '#1a2010';
  x.lineWidth = 2.2;
  x.beginPath();
  x.moveTo(r * 0.95, -r * 0.15);
  x.lineTo(r * 1.25, r * 0.22);
  x.lineTo(r * 1.05, r * 0.55);
  x.closePath();
  x.fill();
  x.stroke();

  // 頭 + 工程鋼帽
  x.fillStyle = '#3a3f2e';
  x.beginPath();
  x.arc(0, -r * 0.52, r * 0.44, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#1a2010';
  x.lineWidth = 2.5;
  x.stroke();
  x.fillStyle = '#5a5a46';
  x.beginPath();
  x.arc(0, -r * 0.72, r * 0.5, Math.PI, Math.PI * 2);
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = '#3d3d2e';
  x.fillRect(-r * 0.5, -r * 0.9, r, r * 0.14);

  // 發光獨眼
  const eg = x.createRadialGradient(r * 0.12, -r * 0.52, 0, r * 0.12, -r * 0.52, r * 0.5);
  eg.addColorStop(0, 'rgba(255,60,120,0.6)');
  eg.addColorStop(1, 'rgba(255,60,120,0)');
  x.fillStyle = eg;
  x.beginPath();
  x.arc(r * 0.12, -r * 0.52, r * 0.5, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ff3c78';
  x.beginPath();
  x.ellipse(r * 0.12, -r * 0.5, r * 0.15, r * 0.2, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#50000f';
  x.beginPath();
  x.ellipse(r * 0.16, -r * 0.5, r * 0.05, r * 0.12, 0, 0, Math.PI * 2);
  x.fill();

  // 撕裂大嘴 + 獠牙
  x.fillStyle = '#2a0f05';
  x.beginPath();
  x.ellipse(0, r * 0.05, r * 0.5, r * 0.3, 0, 0, Math.PI);
  x.fill();
  x.fillStyle = '#e8dcc0';
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(i * r * 0.16 - r * 0.06, r * 0.03);
    x.lineTo(i * r * 0.16, r * 0.18);
    x.lineTo(i * r * 0.16 + r * 0.06, r * 0.03);
    x.closePath();
    x.fill();
  }

  x.restore();

  // 最終魔王：金色額冠
  if (final) {
    x.fillStyle = '#b3924f';
    x.strokeStyle = '#d4b469';
    x.lineWidth = 2.6;
    x.beginPath();
    x.arc(0, -r * 1.2, r * 0.4, Math.PI, Math.PI * 2);
    x.closePath();
    x.fill();
    x.beginPath(); x.arc(0, -r * 1.34, r * 0.1, 0, Math.PI * 2); x.stroke();
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(s * r * 0.24, -r * 1.2);
      x.lineTo(s * r * 0.24, -r * 1.3);
      x.stroke();
    }
  }
}

function drawBossLab(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const pulse = 1 + Math.sin(p) * 0.06;
  shadow(x, r * 1.1, r * 1.05);

  const c1 = charging ? 'rgba(160,255,90,0.6)' : final ? 'rgba(200,255,120,0.35)' : 'rgba(120,230,60,0.22)';
  const ag = x.createRadialGradient(0, 0, r, 0, 0, (r + (final ? 34 : 22)) * pulse);
  ag.addColorStop(0, c1);
  ag.addColorStop(1, 'rgba(120,230,60,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, 0, (r + (final ? 34 : 22)) * pulse, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = charging ? 'rgba(180,255,100,0.9)' : 'rgba(120,230,60,0.4)';
  x.lineWidth = charging ? 5 : 3;
  x.beginPath();
  x.arc(0, 0, (r + 6) * pulse, 0, Math.PI * 2);
  x.stroke();

  // 兩側擺動觸手
  for (const s of [-1, 1]) {
    x.strokeStyle = charging ? 'rgba(120,220,60,0.95)' : 'rgba(90,190,45,0.9)';
    x.lineWidth = r * 0.16;
    x.beginPath();
    x.moveTo(s * r * 0.6, r * 0.1);
    x.quadraticCurveTo(s * r * 1.35, -r * 0.15 + Math.sin(p * 0.6 + s) * r * 0.25, s * r * 1.4, r * 0.25 + Math.sin(p * 0.5 + s * 2) * r * 0.35);
    x.stroke();
    x.strokeStyle = 'rgba(170,255,120,0.8)';
    x.lineWidth = r * 0.06;
    x.beginPath();
    x.moveTo(s * r * 0.6, r * 0.1);
    x.quadraticCurveTo(s * r * 1.35, -r * 0.15 + Math.sin(p * 0.6 + s) * r * 0.25, s * r * 1.4, r * 0.25 + Math.sin(p * 0.5 + s * 2) * r * 0.35);
    x.stroke();
  }

  // 半透黏液主體
  const g = x.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.2);
  g.addColorStop(0, final ? 'rgba(120,255,180,0.55)' : 'rgba(120,240,140,0.5)');
  g.addColorStop(0.6, final ? 'rgba(40,150,70,0.6)' : 'rgba(50,170,80,0.55)');
  g.addColorStop(1, 'rgba(20,90,40,0.7)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, r * 0.05, r * (final ? 1.02 : 0.95), 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(170,255,120,0.35)';
  x.lineWidth = 2.5;
  x.stroke();

  // 體內血管
  x.strokeStyle = 'rgba(30,90,45,0.85)';
  x.lineWidth = 2.4;
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(0, -r * 0.3);
    x.quadraticCurveTo(s * r * 0.6, 0, s * r * 0.4, r * 0.5);
    x.stroke();
  }

  // 多顆眼睛
  const eyes = final
    ? [[0, -r * 0.3, r * 0.2, '#7dff8a'], [-r * 0.5, r * 0.15, r * 0.14, '#59e8ff'], [r * 0.5, r * 0.15, r * 0.14, '#ffd24a']]
    : [[0, -r * 0.28, r * 0.18, '#7dff8a'], [-r * 0.48, r * 0.18, r * 0.13, '#7dff8a'], [r * 0.44, r * 0.22, r * 0.11, '#59e8ff']];
  for (const [ex, ey, er, cc] of eyes) {
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(ex, ey, er, 0, Math.PI * 2); x.fill();
    x.fillStyle = cc;
    x.beginPath(); x.arc(ex, ey, er * 0.62, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#0a2610';
    x.beginPath(); x.arc(ex + er * 0.2, ey, er * 0.18, 0, Math.PI * 2); x.fill();
  }

  // 裂縫大嘴 + 黏牙
  x.fillStyle = '#0c2e13';
  x.beginPath();
  x.ellipse(0, r * 0.48, r * 0.42, r * 0.2, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(210,255,170,0.5)';
  x.lineWidth = 1.8;
  x.stroke();
  x.fillStyle = '#d8ffe0';
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(i * r * 0.16 - r * 0.05, r * 0.35);
    x.lineTo(i * r * 0.16, r * 0.54);
    x.lineTo(i * r * 0.16 + r * 0.05, r * 0.35);
    x.closePath();
    x.fill();
  }

  // 最終：頂部觸手冠
  if (final) {
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.5;
      x.strokeStyle = 'rgba(150,255,110,0.9)';
      x.lineWidth = r * 0.11;
      x.beginPath();
      x.moveTo(i * r * 0.3, -r * 0.85);
      x.quadraticCurveTo(i * r * 0.42 + a * r * 0.3, -r * 1.25, i * r * 0.2 + a * r * 0.4, -r * 1.4 + Math.sin(p * 0.7 + i) * r * 0.1);
      x.stroke();
    }
  }
}

function drawBossFrost(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const pulse = 1 + Math.sin(p) * 0.05;
  shadow(x, r * 1.05, r * 1.1);

  const c1 = charging ? 'rgba(120,220,255,0.6)' : final ? 'rgba(160,240,255,0.35)' : 'rgba(90,190,255,0.22)';
  const ag = x.createRadialGradient(0, 0, r, 0, 0, (r + (final ? 34 : 22)) * pulse);
  ag.addColorStop(0, c1);
  ag.addColorStop(1, 'rgba(90,190,255,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, 0, (r + (final ? 34 : 22)) * pulse, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = charging ? 'rgba(150,230,255,0.9)' : 'rgba(90,190,255,0.4)';
  x.lineWidth = charging ? 5 : 3;
  x.beginPath();
  x.arc(0, 0, (r + 6) * pulse, 0, Math.PI * 2);
  x.stroke();

  // 四足穩定器
  for (const s of [-1, 1]) {
    const foot = Math.sin(p * 0.5 + s) * 3;
    x.strokeStyle = '#243447';
    x.lineWidth = 10;
    x.beginPath();
    x.moveTo(s * r * 0.4, r * 0.55);
    x.lineTo(s * r * 0.4 + foot, r * 1.05);
    x.stroke();
    x.fillStyle = '#1a2434';
    x.beginPath();
    x.ellipse(s * r * 0.4 + foot, r * 1.07, r * 0.3, r * 0.13, 0, 0, Math.PI * 2);
    x.fill();
  }

  // 肩部冰晶
  for (const s of [-1, 1]) {
    x.fillStyle = '#b9e9ff';
    for (let i = 0; i < 2; i++) {
      x.beginPath();
      x.moveTo(s * r * 0.55 + i * s * r * 0.25, -r * 0.35);
      x.lineTo(s * r * 1.15 + i * s * r * 0.2, -r * 0.85);
      x.lineTo(s * r * 0.8 + i * s * r * 0.2, -r * 0.15);
      x.closePath();
      x.fill();
    }
    x.fillStyle = '#dfefff';
    x.beginPath();
    x.arc(s * r * 0.6, -r * 0.28, r * 0.28, 0, Math.PI * 2);
    x.fill();
  }

  // 八角裝甲主體
  const pg = x.createLinearGradient(-r, -r, r, r);
  pg.addColorStop(0, final ? '#5e7a96' : '#4a5f78');
  pg.addColorStop(1, '#1c2838');
  x.fillStyle = pg;
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rr = r * 0.95 * (i % 2 ? 1 : 0.88);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.closePath();
  x.fill();
  x.strokeStyle = '#101a28';
  x.lineWidth = 3;
  x.stroke();

  // 裝甲接縫
  x.strokeStyle = 'rgba(20,30,45,0.8)';
  x.lineWidth = 1.8;
  x.beginPath();
  x.moveTo(-r * 0.75, 0); x.lineTo(r * 0.75, 0);
  x.moveTo(0, -r * 0.75); x.lineTo(0, r * 0.5);
  x.stroke();

  // 胸口能量核心
  const cg = x.createRadialGradient(0, -r * 0.1, 0, 0, -r * 0.1, r * 0.45);
  cg.addColorStop(0, charging ? 'rgba(255,255,255,0.95)' : 'rgba(120,240,255,0.5)');
  cg.addColorStop(1, 'rgba(160,220,255,0)');
  x.fillStyle = cg;
  x.beginPath(); x.arc(0, -r * 0.1, r * 0.45, 0, Math.PI * 2); x.fill();
  x.fillStyle = charging ? '#eaffff' : '#9fe8ff';
  x.beginPath();
  x.arc(0, -r * 0.1, r * 0.2, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(20,40,60,0.7)';
  x.lineWidth = 2.4;
  x.stroke();

  // 面罩目鏡
  x.fillStyle = '#0d1622';
  x.beginPath();
  x.arc(0, -r * 0.42, r * 0.36, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#9fe8ff';
  x.lineWidth = 2;
  x.stroke();
  const vg = x.createRadialGradient(-r * 0.1, -r * 0.42, 0, -r * 0.1, -r * 0.42, r * 0.4);
  vg.addColorStop(0, charging ? 'rgba(255,255,255,0.9)' : 'rgba(120,230,255,0.55)');
  vg.addColorStop(1, 'rgba(120,230,255,0)');
  x.fillStyle = vg;
  x.beginPath();
  x.ellipse(-r * 0.05, -r * 0.42, r * 0.3, r * 0.16, 0, 0, Math.PI * 2);
  x.fill();

  // 衝鋒噴雪
  if (charging) {
    x.fillStyle = 'rgba(220,245,255,0.7)';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.ellipse(s * r * 0.5, r * 0.78 + Math.sin(p * 2) * 3, r * 0.22, r * 0.1, 0, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 最終：帝王冰冠 + 冰披風
  if (final) {
    for (let i = -2; i <= 2; i++) {
      x.fillStyle = '#c8ecff';
      x.strokeStyle = '#5fb4e8';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(i * r * 0.22 - r * 0.08, -r * 0.85);
      x.lineTo(i * r * 0.22, -r * 1.3 - Math.abs(i) * r * 0.1);
      x.lineTo(i * r * 0.22 + r * 0.08, -r * 0.85);
      x.closePath();
      x.fill();
      x.stroke();
    }
    x.fillStyle = 'rgba(160,220,255,0.8)';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(s * r * 0.2, r * 0.1);
      x.quadraticCurveTo(s * r * 1.55, r * 0.2, s * r * 1.45, r * 0.9);
      x.lineTo(s * r * 1.1, r * 0.75);
      x.quadraticCurveTo(s * r * 1.3, r * 0.2, 0, r * 0.15);
      x.closePath();
      x.fill();
    }
  }
}

function drawBossCore(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const pulse = 1 + Math.sin(p) * 0.05;
  shadow(x, r * 1.1, r * 1.05);

  const c1 = charging ? 'rgba(255,120,40,0.6)' : final ? 'rgba(255,170,70,0.4)' : 'rgba(255,100,30,0.24)';
  const ag = x.createRadialGradient(0, 0, r, 0, 0, (r + (final ? 36 : 24)) * pulse);
  ag.addColorStop(0, c1);
  ag.addColorStop(1, 'rgba(255,100,30,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, 0, (r + (final ? 36 : 24)) * pulse, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = charging ? 'rgba(255,150,60,0.95)' : 'rgba(255,100,30,0.45)';
  x.lineWidth = charging ? 5 : 3;
  x.beginPath();
  x.arc(0, 0, (r + 7) * pulse, 0, Math.PI * 2);
  x.stroke();

  // 熔岩腳掌 + 壟底火光
  for (const s of [-1, 1]) {
    const lift = Math.sin(p * 0.5 + s) * 3;
    x.fillStyle = '#3a1305';
    x.strokeStyle = '#581c08';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(s * r * 0.3, r * 0.4);
    x.lineTo(s * r * 0.22, r * 1.0 + lift);
    x.lineTo(s * r * 0.1, r * 1.0 + lift);
    x.lineTo(s * r * 0.3, r * 0.98);
    x.lineTo(s * r * 0.5, r * 1.0 + lift);
    x.lineTo(s * r * 0.38, r * 1.0 + lift);
    x.closePath();
    x.fill();
    x.stroke();
    const lg = x.createRadialGradient(0, r * 0.85, 0, 0, r * 0.85, r * 0.5);
    lg.addColorStop(0, 'rgba(255,130,40,0.35)');
    lg.addColorStop(1, 'rgba(255,130,40,0)');
    x.fillStyle = lg;
    x.beginPath(); x.ellipse(0, r * 0.85, r * 0.5, r * 0.22, 0, 0, Math.PI * 2); x.fill();
  }

  x.save();
  x.rotate(Math.sin(p * 0.5) * 0.03);

  // 熔岩身 (龜甲般隆背)
  const bg = x.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.15);
  bg.addColorStop(0, final ? 'rgba(255,180,80,0.85)' : 'rgba(255,150,60,0.8)');
  bg.addColorStop(0.55, final ? 'rgba(200,80,20,0.9)' : 'rgba(170,60,15,0.85)');
  bg.addColorStop(1, 'rgba(70,22,4,0.95)');
  x.fillStyle = bg;
  x.beginPath();
  x.arc(0, r * 0.05, r * 0.98, Math.PI * 0.05, Math.PI * 0.95);
  x.closePath();
  x.fill();
  x.strokeStyle = '#2a0d02';
  x.lineWidth = 3;
  x.stroke();

  // 熔岩裂縫光
  x.strokeStyle = 'rgba(255,220,120,0.85)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-r * 0.7, r * 0.1); x.lineTo(-r * 0.35, r * 0.25); x.lineTo(-r * 0.5, r * 0.5);
  x.moveTo(r * 0.6, r * 0.15); x.lineTo(r * 0.3, r * 0.4);
  x.moveTo(0, -r * 0.1); x.lineTo(-r * 0.2, r * 0.3);
  x.stroke();

  // 熔岩爪翼
  for (const s of [-1, 1]) {
    x.fillStyle = '#8a3208';
    x.strokeStyle = '#3a1102';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(s * r * 0.7, -r * 0.1);
    x.lineTo(s * r * 1.2, -r * 0.25 + Math.sin(p + s) * r * 0.1);
    x.lineTo(s * r * 0.95, r * 0.25);
    x.closePath();
    x.fill();
    x.stroke();
  }

  x.restore();

  // 鴨頭 + 邪惡噱
  x.fillStyle = '#b45012';
  x.strokeStyle = '#4a1805';
  x.lineWidth = 2.4;
  x.beginPath();
  x.arc(0, -r * 0.62, r * 0.34, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = final ? '#3a3a4a' : '#2e2e3c';
  x.beginPath();
  x.moveTo(-r * 0.18, -r * 0.62);
  x.quadraticCurveTo(r * 0.25, -r * 0.72, r * 0.52, -r * 0.55);
  x.quadraticCurveTo(r * 0.18, -r * 0.42, -r * 0.18, -r * 0.44);
  x.closePath();
  x.fill();
  x.stroke();
  // 邪惡紅眼
  const eg = x.createRadialGradient(r * 0.16, -r * 0.68, 0, r * 0.16, -r * 0.68, r * 0.35);
  eg.addColorStop(0, 'rgba(255,40,60,0.7)');
  eg.addColorStop(1, 'rgba(255,40,60,0)');
  x.fillStyle = eg;
  x.beginPath(); x.arc(r * 0.16, -r * 0.68, r * 0.35, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ff1f2e';
  x.beginPath();
  x.arc(r * 0.16, -r * 0.68, r * 0.08, 0, Math.PI * 2);
  x.fill();
  // 犄角
  for (const s of [-1, 1]) {
    x.fillStyle = '#d8a35a';
    x.beginPath();
    x.moveTo(s * r * 0.28, -r * 0.82);
    x.quadraticCurveTo(s * r * 0.5, -r * 1.0, s * r * 0.42, -r * 1.18);
    x.lineTo(s * r * 0.3, -r * 0.86);
    x.closePath();
    x.fill();
  }

  // 最終：特工高帽
  if (final) {
    x.fillStyle = '#20222e';
    x.beginPath();
    x.ellipse(0, -r * 1.02, r * 0.42, r * 0.1, 0, 0, Math.PI * 2);
    x.fill();
    x.fillRect(-r * 0.2, -r * 1.42, r * 0.4, r * 0.44);
    x.fillStyle = '#c8ccd8';
    x.fillRect(-r * 0.2, -r * 1.4, r * 0.4, r * 0.07);
  }
}

/* ==================== 三隻新增關卡 Boss ====================
   為什麼要偏離「圓形身體 + 兩隻手」：street/lab/frost/core 四隻骨子裡都是同一個模板
   （一顆球 + 四肢 + 一顆頭），擺在一起只看剪影會認不出誰是誰。辨識度來自**外輪廓的
   長寬比與重心**，不是內部的細節，所以新三隻各自認領一種輪廓：
     subway 橫向長條（實心剪影 223×209 → 寬:高 ≈ 1.07。舊的 street/lab 數字更寬，
       但牠們的「寬」是揮出去的兩隻手，subway 的寬是一整條連續車體，讀起來完全不同）、
     swamp 上寬下窄（186×203，重心在上、底下收成細柄 + 垂根）、
     storm 縱向分節圓柱（167×204，最窄最高，由 4~5 節甲殼堆疊而成）。
   三隻都吃 t（0~1 相位）讓動畫循環，且都以「陰影 → 氣場 → 附肢 → 主體 → 發光細節」的
   順序畫，這樣後面的東西才會蓋在前面（列車的砲塔要壓在車頂上、沙蟲的口器要在身體前面）。
   另外三隻的半徑都抓在 0.9r 附近：r 是碰撞半徑，畫超過 1r 會讓「看起來打到卻沒傷害」，
   但 final 版沿用同一顆 r=50，所以體型差異要靠長度/節數而不是無腦放大。 */

// ── 鏽蝕地下鐵：裝甲列車頭 ───────────────────────────────────────────────
// 為什麼是「火車」而不是人形：這關的主題字是「地下鐵」，橫向長條的剪影同時解決兩件事 ——
// 跟其他四隻不會撞衫，而且車頭燈(前方暖光) + 排障器(下方楔形)天然給了「朝右衝過來」的
// 方向感。動畫選擇讓**輪子轉**而不是讓車身上下跳：輪子是旋轉運動，8 幀循環看不出接縫，
// 而整台車上下跳會讓人以為它在飄。
function drawBossSubway(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  // 車體長度刻意只跟 final 有關：final 更長 → 剪影直接變「更橫」，比重畫細節更有感。
  const half = r * (final ? 1.52 : 1.3);
  const cy = r * 0.16;                       // 車體中心；下面留 r*0.85 給輪組與地面陰影
  const sway = Math.sin(p) * 1.4;            // 懸吊微晃；幅度刻意小於輪徑，否則是船不是車
  const chug = Math.abs(Math.sin(p));        // 0~1，煙囪噴煙的節拍

  // 貼地陰影用長橢圓而不是 shadow()：shadow() 畫的是圓，套在長條形車體上會
  // 在車頭車尾各露出一角，看起來像車子浮在兩個點上。
  x.fillStyle = 'rgba(0,0,0,0.4)';
  x.beginPath();
  x.ellipse(0, r * 1.02, half * 0.95, r * 0.24, 0, 0, Math.PI * 2);
  x.fill();

  const aura = r + (final ? 34 : 22);
  const ag = x.createRadialGradient(0, 0, r * 0.5, 0, 0, aura * (1 + Math.sin(p) * 0.05));
  ag.addColorStop(0, charging ? 'rgba(255,190,70,0.6)' : final ? 'rgba(255,159,69,0.35)' : 'rgba(255,159,69,0.22)');
  ag.addColorStop(1, 'rgba(255,159,69,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, 0, aura * (1 + Math.sin(p) * 0.05), 0, Math.PI * 2);
  x.fill();

  x.save();
  x.translate(0, sway);

  // 轉向架 (兩組車輪)：輪輻轉動 = 行進感。輻條角度加 i 才會「輪子各轉各的」，
  // 全部同相位看起來像整台車在震動而不是在跑。
  const wheelR = r * 0.3;
  const axles = [-half * 0.58, half * 0.52];
  for (let wi = 0; wi < axles.length; wi++) {
    const wx = axles[wi];
    for (const side of [-1, 1]) {           // 兩側輪：遠側先畫且壓暗，給出一點縱深
      const wy = cy + r * 0.6;
      x.fillStyle = side > 0 ? '#241a12' : '#140f0a';
      x.beginPath();
      x.arc(wx, wy, wheelR, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = '#5a422a';
      x.lineWidth = 2;
      x.stroke();
      const spin = p * 2 + wi * 1.3 + (side > 0 ? 0.4 : 0);
      x.strokeStyle = side > 0 ? 'rgba(220,190,150,0.55)' : 'rgba(160,140,110,0.35)';
      x.lineWidth = 2.2;
      for (let k = 0; k < 6; k++) {
        const a = spin + (k / 6) * Math.PI * 2;
        x.beginPath();
        x.moveTo(wx + Math.cos(a) * wheelR * 0.2, wy + Math.sin(a) * wheelR * 0.2);
        x.lineTo(wx + Math.cos(a) * wheelR * 0.88, wy + Math.sin(a) * wheelR * 0.88);
        x.stroke();
      }
      x.fillStyle = '#6b563a';
      x.beginPath();
      x.arc(wx, wy, wheelR * 0.2, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 車體下方裝甲裙板：把底盤「收邊」。少了它，車體跟輪子之間會露出一條底色縫。
  x.fillStyle = '#241812';
  x.strokeStyle = '#0f0a06';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-half * 0.76, cy + r * 0.52);
  x.lineTo(half * 0.7, cy + r * 0.52);
  x.lineTo(half * 0.72, cy + r * 0.74);
  x.lineTo(-half * 0.76, cy + r * 0.74);
  x.closePath();
  x.fill();
  x.stroke();

  // 車體：用線性漸層（上亮下暗）而不是 sphere()。球面漸層套在長方形上會出現
  // 中央一顆亮斑，金屬板看起來像吹漲的氣球。
  const bg = x.createLinearGradient(0, cy - r * 0.66, 0, cy + r * 0.62);
  bg.addColorStop(0, final ? '#8a5a30' : '#76502c');
  bg.addColorStop(0.42, final ? '#5e3d1f' : '#4c321b');
  bg.addColorStop(1, '#26180d');
  x.fillStyle = bg;
  x.strokeStyle = '#150e07';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(-half, cy - r * 0.66);                     // 車頂後緣
  x.lineTo(half * 0.68, cy - r * 0.66);               // 車頂前緣
  x.lineTo(half, cy - r * 0.26);                      // 車頭斜切
  x.lineTo(half * 0.92, cy + r * 0.62);               // 車頭下緣
  x.lineTo(-half * 0.94, cy + r * 0.62);              // 車底
  x.lineTo(-half, cy + r * 0.16);                     // 車尾斜切
  x.closePath();
  x.fill();
  x.stroke();

  // 車側三條鋼板接縫：長條剪影如果沒有這些橫線，縮到遊戲內尺寸會變成一塊純色磚。
  x.strokeStyle = 'rgba(16,10,6,0.75)';
  x.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const yy = cy - r * 0.42 + k * r * 0.36;
    x.beginPath();
    x.moveTo(-half * 0.98, yy);
    x.lineTo(half * 0.96 - k * r * 0.1, yy);
    x.stroke();
  }
  // 車頂高光：一條就好。多畫幾條會把「上亮下暗」的金屬感洗掉。
  x.strokeStyle = 'rgba(255,200,140,0.34)';
  x.lineWidth = 2.6;
  x.beginPath();
  x.moveTo(-half * 0.94, cy - r * 0.6);
  x.lineTo(half * 0.62, cy - r * 0.6);
  x.stroke();

  // 鉚釘：沿接縫打。final 多打一排 —— 「更多鉚釘」比「更多顏色」更像同一台車的加強版。
  x.fillStyle = '#c9a468';
  const rivetRows = final ? [-0.52, -0.16, 0.2, 0.52] : [-0.5, 0.2];
  for (let k = 0; k < rivetRows.length; k++) {
    const yy = cy + rivetRows[k] * r;
    for (let i = 0; i < (final ? 11 : 8); i++) {
      const rx = -half * 0.9 + (i / ((final ? 11 : 8) - 1)) * half * 1.75;
      x.beginPath();
      x.arc(rx, yy, 1.7, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 側面通風柵：故意做成「暗底 + 亮柵條」而不是亮底暗條 —— 3px 的暗線在深色柏油上
  // 完全讀不出來，暗底才讓琥珀色的柵條自己發亮。
  for (let g = 0; g < (final ? 2 : 1); g++) {
    const gx = -half * 0.5 + g * r * 0.72;
    const gy = cy - r * 0.02;
    const gw = r * 0.52;
    const gh = r * 0.42;
    x.fillStyle = '#120b06';
    x.beginPath();
    x.rect(gx - gw / 2, gy - gh / 2, gw, gh);
    x.fill();
    x.strokeStyle = '#0a0603';
    x.lineWidth = 2;
    x.stroke();
    const heat = charging ? 0.92 : 0.5;
    for (let i = 0; i < 4; i++) {
      x.strokeStyle = `rgba(255,159,69,${heat - i * 0.07})`;
      x.lineWidth = 2.2;
      const yy = gy - gh / 2 + 2 + i * (gh / 4);
      x.beginPath();
      x.moveTo(gx - gw / 2 + 1.5, yy);
      x.lineTo(gx + gw / 2 - 1.5, yy);
      x.stroke();
    }
    // charging：柵縫漏出強光。這是「蓄力」最好讀的訊號 —— 光從機器內部透出來。
    if (charging) {
      const gg = x.createRadialGradient(gx, gy, 0, gx, gy, gw * 0.9);
      gg.addColorStop(0, 'rgba(255,220,130,0.55)');
      gg.addColorStop(1, 'rgba(255,159,69,0)');
      x.fillStyle = gg;
      x.beginPath();
      x.arc(gx, gy, gw * 0.9, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 車頭燈：整台車唯一的「往右」指標。蓄力時燈泡由琥珀轉白，並且在燈前加一道光束。
  const lx = half * 0.84;
  const ly = cy - r * 0.3;
  const lr = r * 0.2;
  if (charging) {
    const beam = x.createLinearGradient(lx, ly, lx + r * 1.05, ly);
    beam.addColorStop(0, 'rgba(255,235,170,0.6)');
    beam.addColorStop(1, 'rgba(255,200,90,0)');
    x.fillStyle = beam;
    x.beginPath();
    x.moveTo(lx, ly - lr);
    x.lineTo(lx + r * 1.05, ly - lr * 1.9);
    x.lineTo(lx + r * 1.05, ly + lr * 1.9);
    x.lineTo(lx, ly + lr);
    x.closePath();
    x.fill();
  }
  x.fillStyle = '#33200e';
  x.beginPath();
  x.arc(lx, ly, lr * 1.28, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#140d05';
  x.lineWidth = 2;
  x.stroke();
  const hg = x.createRadialGradient(lx, ly, 0, lx, ly, lr * 1.5);
  hg.addColorStop(0, charging ? 'rgba(255,255,255,0.95)' : 'rgba(255,232,160,0.9)');
  hg.addColorStop(1, 'rgba(255,159,69,0)');
  x.fillStyle = hg;
  x.beginPath();
  x.arc(lx, ly, lr * 1.5, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = charging ? '#fffbe8' : '#ffcf72';
  x.beginPath();
  x.arc(lx, ly, lr * 0.68, 0, Math.PI * 2);
  x.fill();

  // 排障器（楔形柵）：畫在車頭最前面並超出車體輪廓，剪影右端因此有「尖」，
  // 一眼就能判斷車頭朝哪 —— 純圓角矩形做不到這件事。
  x.strokeStyle = '#3f2a14';
  x.lineWidth = 3.4;
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(half * 0.55, cy + r * 0.5 + Math.abs(i) * r * 0.03);
    x.lineTo(half * 1.08, cy + r * 0.06 + i * r * 0.15);
    x.stroke();
  }
  x.strokeStyle = '#6b4a22';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(half * 0.8, cy + r * 0.02);
  x.lineTo(half * 0.98, cy + r * 0.02);
  x.stroke();

  // 車尾聯結器 + 拖曳臂：final 多掛一節車廂，聯結器負責「交代」那節車廂是被拉的。
  // 起點刻意往內縮到車尾斜切面上（不是 -half）：從斜切面伸出去才像真的有掛勾，
  // 而且整段都在畫布內，不會有半截線條被切掉。
  if (final) {
    x.strokeStyle = '#3a3a42';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(-half * 0.86, cy + r * 0.2);
    x.lineTo(-half * 0.96, cy + r * 0.4 + Math.sin(p + 1) * 1.2);
    x.stroke();
    x.strokeStyle = '#5a5a66';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(-half * 0.86, cy + r * 0.2);
    x.lineTo(-half * 0.96, cy + r * 0.4 + Math.sin(p + 1) * 1.2);
    x.stroke();
  }

  // 排煙：三顆固定位置的煙團用不同相位漲縮。用「圓的漲縮」而不是真實流體，
  // 是因為烘焙只有 8 幀、又要能無縫循環，任何有方向性的位移在接回第 0 幀時都會跳。
  const sx = -half * 0.5;
  const sy = cy - r * 0.62;
  x.fillStyle = '#12100e';
  x.fillRect(sx - r * 0.09, sy - r * 0.3, r * 0.18, r * 0.34);
  x.fillStyle = '#2a241c';
  x.fillRect(sx - r * 0.13, sy - r * 0.34, r * 0.26, r * 0.09);
  for (let i = 0; i < 3; i++) {
    const k = (chug + i * 0.33) % 1;
    x.fillStyle = `rgba(90,80,70,${(0.42 - i * 0.1) * (0.4 + k)})`;
    x.beginPath();
    x.arc(sx + Math.sin(p + i * 1.7) * r * 0.14, sy - r * 0.42 - i * r * 0.3, r * (0.1 + i * 0.075) * (1 + k * 0.5), 0, Math.PI * 2);
    x.fill();
  }

  x.restore();   // 懸吊晃動結束
  x.save();
  x.translate(0, final ? -r * 0.62 : 0);   // 後面的車頂裝備不再跟著晃（車頂是剛性的）

  // final：多一節車廂 + 車頂砲塔。兩者都畫在車體之上，剪影因此「更長上更厚」。
  // 車廂左緣抓在 -half*1.22 ≈ -83px（畫布半寬 104px）：留 20px 給左上的輪廓光與外框。
  // 原本用 1.52 的版本會讓車廂左緣撞到畫布邊（實測 device bbox x=0），邊光被切平、
  // 車廂還少一角，看起來像破圖而不是「後面還掛著一節」。
  if (final) {
    const carR = -half * 1.0;    // 車廂右緣：躲在車尾斜切後面，接縫不外露
    const carL = -half * 1.22;   // 車廂左緣
    const ch2 = r * 0.4;
    x.fillStyle = '#422c17';
    x.strokeStyle = '#150e07';
    x.lineWidth = 2.6;
    x.beginPath();
    x.rect(carL, cy - ch2, carR - carL, r * 0.96);
    x.fill();
    x.stroke();
    x.strokeStyle = 'rgba(16,10,6,0.7)';
    x.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      const yy = cy - ch2 + r * 0.32 + k * r * 0.34;
      x.beginPath();
      x.moveTo(carL + 2, yy);
      x.lineTo(carR - 2, yy);
      x.stroke();
    }
    x.fillStyle = '#c9a468';
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.arc(carL + 5 + (i % 2) * Math.max(3, carR - carL - 10), cy - ch2 + 7 + Math.floor(i / 2) * r * 0.72, 1.6, 0, Math.PI * 2);
      x.fill();
    }
    // 尾燈：車頭燈是暖白、尾燈是鏽紅，讓長條剪影的兩端不對稱。
    const tl = x.createRadialGradient(carL + 3, cy - r * 0.24, 0, carL + 3, cy - r * 0.24, r * 0.22);
    tl.addColorStop(0, 'rgba(255,90,70,0.95)');
    tl.addColorStop(1, 'rgba(255,60,50,0)');
    x.fillStyle = tl;
    x.beginPath();
    x.arc(carL + 3, cy - r * 0.24, r * 0.22, 0, Math.PI * 2);
    x.fill();
  }

  const tx = half * 0.34;
  const ty = cy - r * 0.62;
  if (final) {
    // 砲塔基座
    x.fillStyle = '#3a2612';
    x.strokeStyle = '#140d05';
    x.lineWidth = 2.4;
    x.beginPath();
    x.ellipse(tx, ty + r * 0.16, r * 0.42, r * 0.14, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    // 砲塔本體
    // 砲塔本體：用垂直漸層（上亮下暗）而不是 sphere()，因為砲塔是圓頂 + 垂直側壁，
    // 球面漸層會在側壁中央留一圈亮斑，看起來像一顆貼在車頂的球。
    const tg = x.createLinearGradient(tx, ty - r * 0.3, tx, ty + r * 0.18);
    tg.addColorStop(0, '#7a5426');
    tg.addColorStop(1, '#3d2812');
    x.fillStyle = tg;
    x.beginPath();
    x.arc(tx, ty, r * 0.3, Math.PI, Math.PI * 2);
    x.closePath();
    x.fill();
    x.strokeStyle = '#140d05';
    x.lineWidth = 2.2;
    x.stroke();
    // 砲管：charging 時往後縮（後座），並在管口聚一顆愈來愈大的光球。
    const recoil = charging ? -r * 0.16 + Math.sin(p * 2) * r * 0.02 : 0;
    x.fillStyle = '#2e2013';
    x.strokeStyle = '#100a05';
    x.lineWidth = 2;
    x.beginPath();
    x.rect(tx + r * 0.12 + recoil, ty - r * 0.11, r * 0.52, r * 0.13);
    x.fill();
    x.stroke();
    const mg = x.createRadialGradient(tx + r * 0.66 + recoil, ty - r * 0.045, 0, tx + r * 0.66 + recoil, ty - r * 0.045, r * (charging ? 0.3 : 0.16));
    mg.addColorStop(0, charging ? 'rgba(255,255,235,0.95)' : 'rgba(255,190,90,0.7)');
    mg.addColorStop(1, 'rgba(255,159,69,0)');
    x.fillStyle = mg;
    x.beginPath();
    x.arc(tx + r * 0.66 + recoil, ty - r * 0.045, r * (charging ? 0.3 : 0.16), 0, Math.PI * 2);
    x.fill();
    // 天線
    x.strokeStyle = '#6b4a22';
    x.lineWidth = 1.8;
    x.beginPath();
    x.moveTo(tx - r * 0.22, ty - r * 0.14);
    x.lineTo(tx - r * 0.34, ty - r * 0.74 + Math.sin(p) * 2);
    x.stroke();
  }

  // charging：車頂裝甲板浮起、底盤下方積蓄電弧。
  // 浮起的板子讀成「內部壓力正在上升」，比單純加亮更符合機械主題。
  if (charging) {
    const lift = 2 + Math.sin(p * 2) * 1.6;
    x.fillStyle = '#3f4a2e';
    x.strokeStyle = '#12160c';
    x.lineWidth = 2;
    for (const off of [-half * 0.62, half * 0.04]) {
      x.beginPath();
      x.rect(off, cy - r * 0.78 - lift, r * 0.46, r * 0.14);
      x.fill();
      x.stroke();
    }
    x.strokeStyle = 'rgba(255,230,150,0.8)';
    x.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      const ax = -half * 0.7 + i * half * 0.7;
      x.beginPath();
      x.moveTo(ax, cy + r * 0.72);
      x.lineTo(ax + r * 0.1, cy + r * 0.9 - Math.sin(p * 3 + i) * r * 0.06);
      x.lineTo(ax - r * 0.05, cy + r * 1.06);
      x.stroke();
    }
  }
  x.restore();
}

// ── 毒霧沼澤：孢子巨獸 ───────────────────────────────────────────────────
// 為什麼是倒水滴而不是球：主題是「孢子囊」，生物學上孢子囊就是上寬下窄掛在柄上。
// 剪影一旦選了倒水滴，跟其他六隻的球形身體就再也分不開 —— 而且重心在上，視覺上
// 會有「隨時要倒下來壓你」的壓迫感。垂落的根鬚順便提供了下半部的剪影，讓它不會
// 只是「一顆飄在空中的球」。
function drawBossSwamp(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const breathe = Math.sin(p);
  const pulse2 = 1 + breathe * 0.09;     // 孢子囊的呼吸；幅度比 street 的 0.05 大，因為它是軟的
  const cy = -r * 0.34;                  // 囊心抬高，底下才有空間掛根鬚

  shadow(x, r * 1.02, r * 1.08);   // 陰影要跟變寬的囊體一起變寬，否則囊會「凸出」自己的影子

  const ag = x.createRadialGradient(0, cy, 0, 0, cy, (r + (final ? 34 : 22)) * pulse2);
  ag.addColorStop(0, charging ? 'rgba(160,255,150,0.6)' : final ? 'rgba(125,255,143,0.36)' : 'rgba(125,255,143,0.22)');
  ag.addColorStop(1, 'rgba(125,255,143,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, cy, (r + (final ? 34 : 22)) * pulse2, 0, Math.PI * 2);
  x.fill();

  // 垂落的根鬚：先畫，讓囊體壓在上面（根是從囊底長出來的，接縫不該露出來）。
  // 每條用不同頻率擺動，群體才不會像一整排節拍器。
  const roots = final ? 7 : 5;
  for (let i = 0; i < roots; i++) {
    const u = roots === 1 ? 0 : (i / (roots - 1)) * 2 - 1;
    const bend = Math.sin(p + i * 0.8) * r * 0.06;
    const len = r * (0.5 + 0.16 * Math.cos(u * 2.2)) * (final ? 1.12 : 1);
    const ex = u * r * 0.8 + bend;
    const ey = cy + r * 0.72 + len;
    x.strokeStyle = i % 2 ? '#33591f' : '#27491a';
    x.lineWidth = r * (0.055 - Math.abs(u) * 0.016);
    x.beginPath();
    x.moveTo(u * r * 0.72, cy + r * 0.5);
    x.quadraticCurveTo(u * r * 0.92 + bend * 1.6, cy + r * 0.5 + len * 0.55, ex, ey);
    x.stroke();
    // 根尖的孢子珠：一顆亮點就能讓「下垂的線」讀成「有機的觸鬚」。
    x.fillStyle = charging ? '#d8ffd0' : '#8fe87a';
    x.beginPath();
    x.arc(ex, ey, r * 0.045, 0, Math.PI * 2);
    x.fill();
  }

  // 主囊體：上寬下窄的倒水滴（兩段二次曲線 + 底部收成柄）。
  // 寬高比刻意做到 0.72 左右（寬 > 高的一半很多）：一開始畫成 0.96 寬的版本時，
  // 它跟沙蟲的剪影重疊度（IoU）高達 73% —— 兩隻都是「直立橢圓」就等於沒分開。
  // 把囊體壓扁、加寬之後，沼澤是「一團橫向的囊」，沙蟲是「一根窄高的分節柱」。
  const bw = r * (final ? 1.2 : 1.12);
  const bh = r * (final ? 0.8 : 0.72) * pulse2;
  const bodyG = x.createRadialGradient(-bw * 0.32, cy - bh * 0.42, bw * 0.06, 0, cy, bw * 1.16);
  bodyG.addColorStop(0, final ? 'rgba(190,255,150,0.95)' : 'rgba(170,240,140,0.9)');
  bodyG.addColorStop(0.42, final ? 'rgba(78,140,52,0.95)' : 'rgba(62,118,44,0.95)');
  bodyG.addColorStop(1, 'rgba(24,54,24,0.98)');
  x.fillStyle = bodyG;
  x.beginPath();
  x.moveTo(-bw, cy - bh * 0.1);
  x.quadraticCurveTo(-bw * 1.04, cy + bh * 0.62, -bw * 0.24, cy + bh * 1.02);   // 左下腹
  x.quadraticCurveTo(0, cy + bh * 1.18, bw * 0.24, cy + bh * 1.02);              // 囊頸
  x.quadraticCurveTo(bw * 1.04, cy + bh * 0.62, bw, cy - bh * 0.1);
  x.quadraticCurveTo(bw * 0.82, cy - bh * 1.08, 0, cy - bh * 1.12);              // 圓頂
  x.quadraticCurveTo(-bw * 0.82, cy - bh * 1.08, -bw, cy - bh * 0.1);
  x.closePath();
  x.fill();
  x.strokeStyle = '#0d240f';
  x.lineWidth = 3;
  x.stroke();

  // 潰爛表皮：只畫在左半與下半（光源固定在左上），畫滿一圈會變成豹紋。
  x.fillStyle = 'rgba(30,66,26,0.55)';
  for (let i = 0; i < (final ? 7 : 4); i++) {
    const a = 0.5 + (i / (final ? 7 : 4)) * Math.PI * 1.35;
    const rr = bw * (0.5 + 0.28 * Math.cos(i * 1.7));
    x.beginPath();
    x.ellipse(Math.cos(a) * rr * 0.86, cy + Math.sin(a) * bh * 0.78, bw * 0.15, bw * 0.1, a, 0, Math.PI * 2);
    x.fill();
  }
  // 膿皰：亮綠小突起。它是「毒」的視覺證據，顏色刻意比囊體亮一階。
  for (let i = 0; i < (final ? 6 : 3); i++) {
    const a = -0.6 + i * 1.1;
    const px2 = Math.cos(a) * bw * 0.66;
    const py2 = cy + Math.sin(a) * bh * 0.66;
    x.fillStyle = charging ? '#e6ffd8' : '#a8ff8a';
    x.beginPath();
    x.arc(px2, py2, r * (0.055 + 0.012 * Math.sin(p + i)), 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(20,50,18,0.8)';
    x.lineWidth = 1.6;
    x.stroke();
  }

  // 孢子核心：囊體中央的脈動光。亮度與半徑都吃 t，charging 時變成主光源
  // （連囊體都被照亮），這是「牠正在蓄力」最直覺的讀法。
  const corePulse = 0.5 + 0.5 * Math.sin(p);
  const coreR = r * 0.3 * (charging ? 1.5 : 1) * (1 + corePulse * 0.22);
  const cg = x.createRadialGradient(0, cy + r * 0.06, 0, 0, cy + r * 0.06, coreR * 2.1);
  cg.addColorStop(0, charging ? 'rgba(240,255,220,0.95)' : 'rgba(180,255,160,0.85)');
  cg.addColorStop(0.42, 'rgba(125,255,143,0.5)');
  cg.addColorStop(1, 'rgba(125,255,143,0)');
  x.fillStyle = cg;
  x.beginPath();
  x.arc(0, cy + r * 0.06, coreR * 2.1, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = charging ? '#f4ffe8' : '#c8ffb0';
  x.beginPath();
  x.arc(0, cy + r * 0.06, coreR * 0.44, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(30,70,25,0.75)';
  x.lineWidth = 2;
  x.stroke();
  // 核心周圍的孢子環：讓核心「在囊裡面」而不是貼在正面。
  for (let i = 0; i < 4; i++) {
    const a = p + i * (Math.PI / 2);
    x.fillStyle = 'rgba(220,255,190,0.7)';
    x.beginPath();
    x.arc(Math.cos(a) * coreR * 1.35, cy + r * 0.06 + Math.sin(a) * coreR * 0.6, r * 0.038, 0, Math.PI * 2);
    x.fill();
  }

  // 底部裙襬觸手：一圈短粗的根盤，負責把囊體「坐」在地上。
  // charging 時往外撐開（擴張感），比單純放大整體更能讀出「要爆了」。
  const spread = charging ? 1.28 : 1;
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.36;
    const tl = r * (0.42 + 0.1 * Math.cos(i * 1.2)) * spread;
    x.strokeStyle = i === 0 ? '#2b5220' : '#22421a';
    x.lineWidth = r * 0.135;
    x.beginPath();
    x.moveTo(0, cy + r * 0.42);
    x.lineTo(Math.sin(a) * tl * 1.5 * spread, cy + r * 0.42 + Math.cos(a) * tl);
    x.stroke();
    x.strokeStyle = 'rgba(150,240,120,0.4)';
    x.lineWidth = r * 0.045;
    x.beginPath();
    x.moveTo(0, cy + r * 0.42);
    x.lineTo(Math.sin(a) * tl * 1.5 * spread, cy + r * 0.42 + Math.cos(a) * tl);
    x.stroke();
  }

  // 巨大的兩顆眼：不對稱（一大一小）讓它像生物而不是圖示。
  for (const [ex, ey, er] of [[-r * 0.26, cy - r * 0.18, r * 0.17], [r * 0.3, cy - r * 0.1, r * 0.12]]) {
    x.fillStyle = '#0c1c0c';
    x.beginPath();
    x.arc(ex, ey, er * 1.16, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = charging ? '#f2ffcf' : '#d8ff9a';
    x.beginPath();
    x.arc(ex, ey, er, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#0a2610';
    x.beginPath();
    x.ellipse(ex + er * 0.24, ey, er * 0.2, er * 0.64, 0, 0, Math.PI * 2);
    x.fill();
  }

  // 裂口 + 黏牙
  x.fillStyle = '#132a12';
  x.beginPath();
  x.ellipse(0, cy + r * 0.44, r * 0.36, r * 0.15, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(180,255,150,0.45)';
  x.lineWidth = 1.8;
  x.stroke();
  x.fillStyle = '#dbffcf';
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(i * r * 0.14 - r * 0.045, cy + r * 0.33);
    x.lineTo(i * r * 0.14, cy + r * 0.5);
    x.lineTo(i * r * 0.14 + r * 0.045, cy + r * 0.33);
    x.closePath();
    x.fill();
  }

  // final：囊頂孢子冠（往上長，讓剪影更高更兇）。
  // 冠頂刻意只到 y ≈ -93px（畫布半高 104px）：再高就會被畫布切平，而外框 + 輪廓光
  // 需要最上面那幾 px 才長得出來 —— 冠被切掉的話 final 反而比一般版更扁。
  if (final) {
    for (let i = -2; i <= 2; i++) {
      const bx = i * bw * 0.34;
      const top = cy - bh * 1.12;
      x.strokeStyle = '#3f7a2a';
      x.lineWidth = r * 0.09;
      x.beginPath();
      x.moveTo(bx, top + r * 0.08);
      x.quadraticCurveTo(bx + i * r * 0.06, top - r * 0.2, bx + i * r * 0.12, top - r * 0.34 + Math.sin(p + i) * r * 0.05);
      x.stroke();
      x.fillStyle = i % 2 ? '#c8ff8a' : '#8ff0a0';
      x.beginPath();
      x.arc(bx + i * r * 0.12, top - r * 0.4 + Math.sin(p + i) * r * 0.05, r * 0.1, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(24,54,24,0.85)';
      x.lineWidth = 1.8;
      x.stroke();
    }
  }

  // charging：外圈孢子雲。粒子數量刻意少（6 顆）—— 8 幀循環下粒子一多就會
  // 被看成閃爍雜訊，6 顆才讀得出「孢子正在被吸進囊裡」。
  if (charging) {
    for (let i = 0; i < 6; i++) {
      const a = p * 1.5 + (i / 6) * Math.PI * 2;
      const rr = r * (0.92 + 0.18 * Math.sin(p * 2 + i));
      x.fillStyle = `rgba(180,255,150,${0.4 + 0.3 * Math.sin(p * 2 + i)})`;
      x.beginPath();
      x.arc(Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82, r * 0.055, 0, Math.PI * 2);
      x.fill();
    }
  }
}

// ── 沙暴要塞：裝甲沙蟲 ───────────────────────────────────────────────────
// 為什麼是縱向分節圓柱：沙蟲的可辨識特徵是「一節一節往地底延伸」，剪影的資訊量集中在
// 縱軸 —— 跟列車（橫軸）、孢子囊（上重下輕）剛好三分天下。分節用「固定間距的堆疊」
// 而不是隨機位置，這樣 t 造成的身體擺動會讓每一節的位移有連續性，看起來像蠕動而不是抖動。
function drawBossStorm(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const wave = Math.sin(p);
  const segs = final ? 5 : 4;

  // 沙塵暴底座：好幾層橢圓疊出「揚起的沙」。不畫成向量的沙粒是因為
  // 沙粒在 8 幀裡會閃，橢圓的邊緣抖動反而更像被風吹的沙幕。
  for (let i = 0; i < 3; i++) {
    x.fillStyle = `rgba(214,178,104,${0.12 + i * 0.07})`;
    x.beginPath();
    x.ellipse(Math.sin(p + i) * r * 0.1, r * (0.92 + i * 0.08), r * (1.06 - i * 0.16), r * (0.2 - i * 0.045), 0, 0, Math.PI * 2);
    x.fill();
  }
  shadow(x, r * 0.5, r * 1.12);

  const aura = r + (final ? 34 : 22);
  const ag = x.createRadialGradient(0, -r * 0.2, r * 0.4, 0, -r * 0.2, aura * (1 + wave * 0.05));
  ag.addColorStop(0, charging ? 'rgba(255,214,102,0.6)' : final ? 'rgba(255,209,102,0.34)' : 'rgba(255,209,102,0.22)');
  ag.addColorStop(1, 'rgba(255,209,102,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, -r * 0.2, aura * (1 + wave * 0.05), 0, Math.PI * 2);
  x.fill();

  // 尖端朝右下、上緣帶沙：尾部要往外甩才像從地底鑽出來。
  x.fillStyle = '#6b552f';
  x.strokeStyle = '#2a2114';
  x.lineWidth = 2.4;
  x.beginPath();
  x.moveTo(-r * 0.62, r * 1.0);
  x.lineTo(r * 0.24, r * 1.04);
  x.lineTo(r * 0.44, r * 1.2 + wave * 2);
  x.lineTo(-r * 0.2, r * 1.16);
  x.closePath();
  x.fill();
  x.stroke();
  // 尾部往上噴的沙
  for (let i = 0; i < 4; i++) {
    const k = (i / 4 + (wave + 1) * 0.25) % 1;
    x.fillStyle = `rgba(232,204,140,${0.5 - k * 0.42})`;
    x.beginPath();
    x.arc(-r * 0.1 + Math.sin(i * 2.1) * r * 0.2, r * 1.04 - k * r * 0.42, r * 0.075 * (1 - k * 0.4), 0, Math.PI * 2);
    x.fill();
  }

  // 分節甲殼：從最後一節畫到第一節（由後往前），前面自然壓在後面之上，
  // 堆疊感就出來了 —— 反過來畫會讓每一節都像浮在別人身上。
  const segH = final ? r * 0.36 : r * 0.34;
  for (let i = segs - 1; i >= 0; i--) {
    const yy = r * 0.76 - i * segH * 0.86;
    const sw = r * (0.86 - i * 0.055) * (1 + wave * 0.015 * i);   // 每節擺幅不同 → 蠕動
    const sxs = wave * i * r * 0.045;
    const sg = x.createRadialGradient(sxs - sw * 0.34, yy - sw * 0.3, sw * 0.08, sxs, yy, sw * 1.1);
    sg.addColorStop(0, final ? 'rgba(255,238,190,0.95)' : 'rgba(246,220,160,0.9)');
    sg.addColorStop(0.4, final ? 'rgba(214,170,86,0.96)' : 'rgba(196,158,84,0.95)');
    sg.addColorStop(1, 'rgba(104,76,32,0.98)');
    x.fillStyle = sg;
    x.beginPath();
    x.ellipse(sxs, yy, sw, segH * 0.74, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#2a2012';
    x.lineWidth = 2.6;
    x.stroke();
    // 甲片分界：每節下緣一道暗弧。少了它，堆疊會糊成一根香腸。
    x.strokeStyle = 'rgba(38,28,14,0.7)';
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(sxs, yy + segH * 0.3, sw * 0.78, segH * 0.34, 0, Math.PI * 0.12, Math.PI * 0.88);
    x.stroke();
    // 背甲尖刺：長在右側（光來自左上，尖刺放右側才不會被自己的邊光吃掉）
    const spikes = final ? 3 : 2;
    for (let k = 0; k < spikes; k++) {
      const a = -0.5 + k * 0.42;
      const bx = sxs + Math.cos(a) * sw * 0.9;
      const by = yy + Math.sin(a) * segH * 0.6;
      x.fillStyle = '#e6cc96';
      x.strokeStyle = '#3a2c16';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(bx, by);
      x.lineTo(bx + Math.cos(a) * sw * 0.46, by + Math.sin(a) * segH * 0.5);
      x.lineTo(bx + Math.cos(a + 1.2) * sw * 0.16, by + Math.sin(a + 1.2) * segH * 0.22);
      x.closePath();
      x.fill();
      x.stroke();
    }
    // 腹側盾板 + 一圈小鉚釘：把「很多節」的資訊量補在暗部。
    x.fillStyle = '#7c5f30';
    x.beginPath();
    x.ellipse(sxs, yy + segH * 0.14, sw * 0.92, segH * 0.34, 0, 0, Math.PI);
    x.fill();
    x.fillStyle = '#c9a468';
    for (let k = -1; k <= 1; k++) {
      x.beginPath();
      x.arc(sxs + k * sw * 0.5, yy + segH * 0.24, 1.5, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 頸環：頭與第一節之間的收束，讓頭看起來是「連接」而不是「擺著」。
  x.fillStyle = '#7a5f2c';
  x.strokeStyle = '#2a2012';
  x.lineWidth = 2.4;
  x.beginPath();
  x.ellipse(wave * r * 0.03, -r * 0.52, r * 0.4, r * 0.16, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();

  // 頭部：往前傾（rotate 一點點）才像正在撲咬。傾角吃 t，所以牠會左右啄。
  const hx = wave * r * 0.08;
  const hy = -r * 0.76;
  x.save();
  x.translate(hx, hy);
  x.rotate(Math.sin(p) * 0.06);
  const hg = x.createRadialGradient(-r * 0.24, -r * 0.24, r * 0.06, 0, 0, r * 0.74);
  hg.addColorStop(0, final ? '#ffeec0' : '#f3dba4');
  hg.addColorStop(0.45, '#c9a35c');
  hg.addColorStop(1, '#6b4f24');
  x.fillStyle = hg;
  x.beginPath();
  x.ellipse(0, 0, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#2a2012';
  x.lineWidth = 3;
  x.stroke();
  // 頭部裝甲板
  x.fillStyle = 'rgba(255,238,190,0.28)';
  x.beginPath();
  x.ellipse(-r * 0.06, -r * 0.16, r * 0.44, r * 0.2, -0.2, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(50,38,18,0.7)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-r * 0.5, -r * 0.06);
  x.lineTo(r * 0.5, -r * 0.06);
  x.stroke();
  // 環狀口器：由外向內三層同心環 + 放射排列的牙。同心環是「圓形口器」的核心符號，
  // 缺了它就會被讀成一顆普通的頭。
  for (let k = 0; k < 3; k++) {
    x.strokeStyle = k === 0 ? '#3a2c14' : k === 1 ? '#7a5f2c' : '#3a2c14';
    x.lineWidth = k === 1 ? 3.4 : 2.2;
    x.beginPath();
    x.ellipse(0, r * 0.08, r * (0.3 - k * 0.085), r * (0.24 - k * 0.068), 0, 0, Math.PI * 2);
    x.stroke();
  }
  const throat = x.createRadialGradient(0, r * 0.08, 0, 0, r * 0.08, r * 0.16);
  throat.addColorStop(0, charging ? 'rgba(255,250,220,0.95)' : 'rgba(60,26,8,0.95)');
  throat.addColorStop(1, 'rgba(20,10,4,0.95)');
  x.fillStyle = throat;
  x.beginPath();
  x.ellipse(0, r * 0.08, r * 0.14, r * 0.11, 0, 0, Math.PI * 2);
  x.fill();
  // 放射狀尖牙：charging 時往喉嚨縮（準備咬合），靜止時張開。
  const bite = charging ? 0.6 : 1;
  x.fillStyle = '#f0e2bc';
  x.strokeStyle = '#3a2c14';
  x.lineWidth = 1.6;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + p * 0.15;
    const r0 = r * 0.17 * bite;
    const r1 = r * 0.3 * bite;
    x.beginPath();
    x.moveTo(Math.cos(a) * r0, r * 0.08 + Math.sin(a) * r0 * 0.82);
    x.lineTo(Math.cos(a) * r1, r * 0.08 + Math.sin(a) * r1 * 0.82);
    x.lineTo(Math.cos(a + 0.3) * r0, r * 0.08 + Math.sin(a + 0.3) * r0 * 0.82);
    x.closePath();
    x.fill();
    x.stroke();
  }
  // 側面覆眼（沙蟲沒有眼睛，但遊戲需要「注視感」）：兩顆發光裂縫。
  for (const s of [-1, 1]) {
    const eg = x.createRadialGradient(s * r * 0.4, -r * 0.16, 0, s * r * 0.4, -r * 0.16, r * 0.22);
    eg.addColorStop(0, charging ? 'rgba(255,255,225,0.95)' : 'rgba(255,214,102,0.7)');
    eg.addColorStop(1, 'rgba(255,214,102,0)');
    x.fillStyle = eg;
    x.beginPath();
    x.arc(s * r * 0.4, -r * 0.16, r * 0.22, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = charging ? '#fffce8' : '#ffd166';
    x.beginPath();
    x.ellipse(s * r * 0.42, -r * 0.16, r * 0.11, r * 0.04, s * 0.3, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();

  // final：兩側巨型脛刺 + 額外甲板。刻意不對稱高度（左短右長），
  // 對稱的尖刺看起來像裝飾，不對稱才像「長出來的」。
  if (final) {
    for (const s of [-1, 1]) {
      const len = r * (s < 0 ? 0.34 : 0.46);
      x.fillStyle = '#e0c48c';
      x.strokeStyle = '#3a2c16';
      x.lineWidth = 2.2;
      x.beginPath();
      x.moveTo(s * r * 0.72, -r * 0.66);
      x.lineTo(s * (r * 0.72 + len), -r * 1.06 - (s > 0 ? r * 0.14 : 0) + wave * 1.5);
      x.lineTo(s * r * 0.6, -r * 0.42);
      x.closePath();
      x.fill();
      x.stroke();
    }
    x.fillStyle = '#8a6c34';
    x.strokeStyle = '#2a2012';
    x.lineWidth = 2;
    for (const yy of [-r * 0.28, r * 0.02]) {
      x.beginPath();
      x.rect(-r * 0.94, yy, r * 0.34, r * 0.16);
      x.fill();
      x.stroke();
    }
  }

  // charging：口器聚能 + 集氣圈 + 飛沙。
  // 集氣圈往內收（半徑隨 t 變小）是蓄力最容易被看懂的方向性動畫。
  if (charging) {
    for (let i = 0; i < 3; i++) {
      const k = (i / 3 + p / (Math.PI * 2)) % 1;
      x.strokeStyle = `rgba(255,236,170,${0.6 - k * 0.45})`;
      x.lineWidth = 2.4;
      x.beginPath();
      x.arc(hx, hy, r * (1.05 - k * 0.6), 0, Math.PI * 2);
      x.stroke();
    }
    x.fillStyle = 'rgba(255,244,200,0.9)';
    for (let i = 0; i < 6; i++) {
      const a = p * 2 + i * (Math.PI / 3);
      const rr = r * 0.7;
      x.beginPath();
      x.arc(hx + Math.cos(a) * rr * 0.8, hy + Math.sin(a) * rr * 0.6, r * 0.045, 0, Math.PI * 2);
      x.fill();
    }
  }
  for (let i = 0; i < 5; i++) {
    const k = (i / 5 + p * 0.5) % 1;
    x.fillStyle = `rgba(255,222,150,${0.42 * (1 - k)})`;
    x.beginPath();
    x.arc(-r * 0.98 - k * r * 0.34, -r * 0.3 + i * r * 0.26 + wave * 3, r * 0.05, 0, Math.PI * 2);
    x.fill();
  }
}

/* ==================== 第二批新關卡 Boss（熔毀鑄造廠／霜封虛空／虛空裂道） ====================
   為什麼還要再換一次剪影：前七隻雖然各自換過身體，但「橫向的寬度」多半來自左右對稱的
   附肢，縮到遊戲內尺寸時很容易一起糊成「一團肉 + 兩隻手」。這一批改從**重心位置與
   上下緣的形狀**下手，三隻各認領一個別的剪影都不具備的特徵：
     foundry   寬肩重底盤（實心 bbox 最寬也最扁；上緣是水平的硬肩線、下緣是兩條分離的履帶）
     frostvoid 直立窄長冰晶（最窄，上下都收成尖 —— 全場唯一的「細高」剪影）
     voidroad  披風狀不規則裂體（上窄下寬，而且是唯一「下襬被撕裂成鋸齒」的）
   三隻一律照「陰影 → 地面光 → 背後的部件 → 主體 → 前景部件 → 發光細節」的順序畫，
   後面畫的會蓋在前面，部件的前後關係才不會打架（煙囪要在肩線後面、爐口要在胸甲前面）。
   charging 一律用「內部增亮 + 外型伸縮」而**不改配色**：8 幀循環裡換色會像壞掉，
   增亮與收縮才讀得出「正在蓄力」。
   尺寸紀律：一般版畫布 172（半寬 86）、最終版 208（半寬 104），但材質層的外框與兩層
   輪廓光還會往外吃約 5px，所以任何剪影都必須留在 ±(半寬 − 8) 之內，否則邊光會被切平、
   看起來像破圖而不是發光。下面每一隻的註解都寫了自己守住的那條界限。 */

// ── 熔毀鑄造廠：重型工業機甲 ───────────────────────────────────────────────
// 為什麼是「寬肩 + 履帶底盤」而不是又一隻人形：這關的關鍵字是熔爐與鐵水，最直覺的形體
// 就是「一座會走路的工廠」。辨識點放在四個分離的塊體：兩個肩甲、兩條履帶，塊體之間
// 刻意留出腰身凹陷 —— 玩家在遊戲內尺寸下仍然數得出零件。列車是一整塊連續長方體、
// 沙蟲是一根分節柱，都沒有「分離的塊體」這個特徵。
// 動畫節拍分給三個部位：履帶咬合、爐口呼吸、排渣火星，全部寫成 t 的相位函式，
// 8 幀循環才接得回第 0 幀。
function drawBossFoundry(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const breathe = 0.5 + 0.5 * Math.sin(p);          // 0~1：爐火呼吸
  const shiver = Math.sin(p * 2) * r * 0.012;       // 引擎怠速震動；雙倍頻才像機械而不是呼吸
  const tread = (t * 7) % 1;                        // 履帶相位：7 齒，一週期剛好走完一齒

  // 貼地陰影要寬（重底盤），再補一層爐渣的暖色反光：純黑陰影會讓履帶看起來浮在空中，
  // 而這關的材質是「地縫鐵水」，底部的暖反光順便把機甲跟關卡地板綁在一起。
  shadow(x, r * 1.6, r * 1.16);
  const pool = x.createRadialGradient(0, r * 1.06, 0, 0, r * 1.06, r * 1.5);
  pool.addColorStop(0, charging ? 'rgba(255,186,96,0.5)' : 'rgba(255,154,60,0.26)');
  pool.addColorStop(1, 'rgba(255,154,60,0)');
  x.fillStyle = pool;
  x.beginPath();
  x.ellipse(0, r * 1.06, r * 1.5, r * 0.46, 0, 0, Math.PI * 2);
  x.fill();

  const aura = r + (final ? 30 : 20);
  const ag = x.createRadialGradient(0, 0, r * 0.6, 0, 0, aura);
  ag.addColorStop(0, charging ? 'rgba(255,196,110,0.6)' : final ? 'rgba(255,154,60,0.34)' : 'rgba(255,154,60,0.2)');
  ag.addColorStop(1, 'rgba(255,154,60,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, 0, aura, 0, Math.PI * 2);
  x.fill();

  // 排氣煙囪：畫在主體之前（它們長在肩線後面）。管口只放「一顆會呼吸的熱光」而不畫煙 ——
  // 煙團在 8 幀裡一定變成閃爍雜訊，一顆亮度固定的光點反而穩定讀成「正在排熱」。
  // 高度與光暈半徑一起受限：光暈半徑抓 1.8×管口半徑（一開始用 3×，結果 final_charging
  // 的光暈頂端直接撞到畫布上緣被切平，量到 bbox margin-top = 0）。
  // 現在最高一根的管口在 -1.53r（=76.5px）、光暈再往上吃 16.6px → 離上緣還有 11px。
  const stackH = final ? r * 0.6 : r * 0.62;
  const stacks = final
    ? [[-r * 0.54, 0.95], [r * 0.54, 0.95], [0, 1.15]]
    : [[-r * 0.5, 0.9], [r * 0.5, 1.0]];
  for (let i = 0; i < stacks.length; i++) {
    const sx0 = stacks[i][0];
    const top = -r * 0.84 - stackH * stacks[i][1];
    x.fillStyle = '#2b2521';
    x.strokeStyle = '#14100d';
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(sx0 - r * 0.15, -r * 0.8);
    x.lineTo(sx0 - r * 0.12, top);
    x.lineTo(sx0 + r * 0.12, top);
    x.lineTo(sx0 + r * 0.15, -r * 0.8);
    x.closePath();
    x.fill();
    x.stroke();
    // 管口的加強環 + 左側高光：沒有這兩筆，煙囪在深色關卡裡只是一根沒有輪廓的暗管。
    x.fillStyle = '#3d3630';
    x.strokeStyle = '#100d0b';
    x.lineWidth = 2;
    x.beginPath();
    x.rect(sx0 - r * 0.17, top - r * 0.05, r * 0.34, r * 0.11);
    x.fill();
    x.stroke();
    x.strokeStyle = 'rgba(226,214,192,0.3)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(sx0 - r * 0.11, top + r * 0.04);
    x.lineTo(sx0 - r * 0.13, -r * 0.82);
    x.stroke();
    const hr = r * (charging ? 0.16 : 0.11) * (0.85 + 0.3 * Math.sin(p + i));
    const hg = x.createRadialGradient(sx0, top, 0, sx0, top, hr * 1.8);
    hg.addColorStop(0, charging ? 'rgba(255,252,232,0.95)' : 'rgba(255,190,110,0.8)');
    hg.addColorStop(1, 'rgba(255,154,60,0)');
    x.fillStyle = hg;
    x.beginPath();
    x.arc(sx0, top, hr * 1.8, 0, Math.PI * 2);
    x.fill();
    // charging：管口往上噴一小段火舌。長度吃 t，所以它是「正在噴」而不是貼圖。
    if (charging) {
      x.fillStyle = 'rgba(255,224,150,0.75)';
      x.beginPath();
      x.moveTo(sx0 - r * 0.1, top);
      x.lineTo(sx0, top - r * (0.2 + 0.07 * Math.sin(p * 2 + i)));
      x.lineTo(sx0 + r * 0.1, top);
      x.closePath();
      x.fill();
    }
  }

  // 履帶底盤（左右各一條、彼此分離）：這是整隻最寬的部分，也是「重」的來源。
  // 外緣抓在 ±1.68r（final =84px，半寬 104 → 留 20px），寬度是這隻最需要守住的界限。
  // 履帶齒是 7 顆等距短豎線、整排一起位移，位移量剛好一個齒距 → 循環時接得回原點；
  // 若讓齒「個別」動，8 幀看起來會像在抖而不是在跑。
  const podX = r * 1.26;
  const podHW = r * 0.42;
  const tTop = r * 0.44;
  const tBot = r * 1.12;
  for (const s of [-1, 1]) {
    const cx = s * podX;
    const L = cx - podHW;
    const R = cx + podHW;
    const tg = x.createLinearGradient(0, tTop, 0, tBot);
    tg.addColorStop(0, '#4a423a');
    tg.addColorStop(0.45, '#282320');
    tg.addColorStop(1, '#151210');
    x.fillStyle = tg;
    x.strokeStyle = '#0d0a08';
    x.lineWidth = 2.6;
    // 圓角履帶外型：四個角用二次曲線收，比純矩形更像橡膠帶。
    x.beginPath();
    x.moveTo(L + r * 0.12, tTop);
    x.lineTo(R - r * 0.12, tTop);
    x.quadraticCurveTo(R, tTop, R, tTop + r * 0.12);
    x.lineTo(R, tBot - r * 0.12);
    x.quadraticCurveTo(R, tBot, R - r * 0.12, tBot);
    x.lineTo(L + r * 0.12, tBot);
    x.quadraticCurveTo(L, tBot, L, tBot - r * 0.12);
    x.lineTo(L, tTop + r * 0.12);
    x.quadraticCurveTo(L, tTop, L + r * 0.12, tTop);
    x.closePath();
    x.fill();
    x.stroke();
    // 履帶齒
    x.strokeStyle = 'rgba(196,186,168,0.5)';
    x.lineWidth = 2;
    const teeth = 7;
    const span = podHW * 2 - r * 0.2;
    for (let k = 0; k < teeth; k++) {
      const tx = L + r * 0.1 + ((k / teeth + tread) % 1) * span;
      x.beginPath();
      x.moveTo(tx, tBot - r * 0.02);
      x.lineTo(tx, tBot - r * 0.16);
      x.stroke();
    }
    // 承載輪：四顆，輻條吃 t 旋轉。輪子是旋轉件，8 幀循環看不出接縫。
    for (let k = 0; k < 4; k++) {
      const wx = L + r * 0.2 + (k / 3) * (podHW * 2 - r * 0.4);
      const wy = tBot - r * 0.05;
      x.fillStyle = '#191512';
      x.beginPath();
      x.arc(wx, wy, r * 0.13, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = '#5a5048';
      x.lineWidth = 1.6;
      x.stroke();
      x.strokeStyle = 'rgba(214,196,160,0.6)';
      x.lineWidth = 1.6;
      const wa = p * 1.6 + k * 0.9;
      x.beginPath();
      x.moveTo(wx - Math.cos(wa) * r * 0.09, wy - Math.sin(wa) * r * 0.09);
      x.lineTo(wx + Math.cos(wa) * r * 0.09, wy + Math.sin(wa) * r * 0.09);
      x.stroke();
    }
    // 履帶護板的高光：左上光源 → 只在上緣畫一條亮邊，履帶的厚度就出來了。
    x.strokeStyle = 'rgba(230,214,186,0.32)';
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(L + r * 0.16, tTop + r * 0.06);
    x.lineTo(R - r * 0.16, tTop + r * 0.06);
    x.stroke();
    // charging：履帶接縫漏出暖光 —— 內部鐵水正在加壓，光從機械縫裡透出來最好讀。
    if (charging) {
      x.fillStyle = 'rgba(255,170,80,0.5)';
      x.beginPath();
      x.rect(L + r * 0.04, tTop + r * 0.02, podHW * 2 - r * 0.08, r * 0.06);
      x.fill();
    }
  }

  // 底盤中央塊 + 前方的排渣斜板：把兩條履帶連起來，並給底部一個方向性的楔形。
  x.fillStyle = '#241f1b';
  x.strokeStyle = '#100d0b';
  x.lineWidth = 2.4;
  x.beginPath();
  x.rect(-r * 1.0, r * 0.42, r * 2.0, r * 0.62);
  x.fill();
  x.stroke();
  x.fillStyle = '#312a24';
  x.beginPath();
  x.moveTo(-r * 0.9, r * 1.06);
  x.lineTo(r * 1.0, r * 1.06);
  x.lineTo(r * 0.86, r * 0.8);
  x.lineTo(-r * 0.78, r * 0.8);
  x.closePath();
  x.fill();
  x.stroke();

  // 危險斜紋：工業機具的視覺語彙，一眼就知道「這是機器不是生物」。
  // 只畫中央一小塊 —— 斜紋鋪滿整片會把金屬的明暗層次吃掉。
  x.save();
  x.beginPath();
  x.rect(-r * 0.34, r * 0.7, r * 0.68, r * 0.24);
  x.clip();
  x.fillStyle = '#191411';
  x.fillRect(-r * 0.34, r * 0.7, r * 0.68, r * 0.24);
  x.fillStyle = '#ff9a3c';
  for (let i = -1; i < 4; i++) {
    x.save();
    x.translate(-r * 0.3 + i * r * 0.22, r * 0.82);
    x.rotate(-0.6);
    x.fillRect(-r * 0.05, -r * 0.22, r * 0.1, r * 0.44);
    x.restore();
  }
  x.restore();

  x.save();
  x.translate(0, shiver);

  // 軀幹：上寬下窄的梯形 + 腰身凹陷。用線性漸層（上亮下暗）而不是 sphere()：
  // 這是一塊裝甲板不是球，球面漸層會在胸口中央留一顆亮斑，像吹漲的氣球。
  const bodyG = x.createLinearGradient(-r * 0.7, -r * 0.95, r * 0.5, r * 0.6);
  bodyG.addColorStop(0, final ? '#6d6055' : '#5c5148');
  bodyG.addColorStop(0.45, '#3a332d');
  bodyG.addColorStop(1, '#1d1916');
  x.fillStyle = bodyG;
  x.strokeStyle = '#100d0b';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(-r * 1.02, -r * 0.92);
  x.lineTo(r * 1.02, -r * 0.92);
  x.lineTo(r * 1.08, -r * 0.42);
  x.lineTo(r * 0.74, r * 0.2);
  x.lineTo(r * 0.88, r * 0.56);
  x.lineTo(-r * 0.88, r * 0.56);
  x.lineTo(-r * 0.74, r * 0.2);
  x.lineTo(-r * 1.08, -r * 0.42);
  x.closePath();
  x.fill();
  x.stroke();

  // 裝甲接縫：只留三條（肩線一條、腰兩條）。長方形軀幹如果沒有這些線，縮小後會變成一塊磚。
  x.strokeStyle = 'rgba(14,11,9,0.72)';
  x.lineWidth = 2.2;
  x.beginPath();
  x.moveTo(-r * 0.98, -r * 0.62);
  x.lineTo(r * 0.98, -r * 0.62);
  x.stroke();
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * r * 0.5, -r * 0.62);
    x.lineTo(s * r * 0.62, r * 0.16);
    x.stroke();
  }
  // 鉚釘：沿肩線打一排，final 多打一排。更多鉚釘比更多顏色更像「同一台機器的加強版」。
  x.fillStyle = '#c9a468';
  for (const [ry0, cnt] of [[-r * 0.78, 9], final ? [r * 0.3, 7] : null].filter(Boolean)) {
    for (let i = 0; i < cnt; i++) {
      x.beginPath();
      x.arc(-r * 0.86 + (i / (cnt - 1)) * r * 1.72, ry0, 1.7, 0, Math.PI * 2);
      x.fill();
    }
  }
  // 側面散熱柵：暗底 + 亮柵條（暗線在深色金屬上讀不出來），final 多一格。
  for (let g = 0; g < (final ? 2 : 1); g++) {
    const gx = -r * 0.62 + g * r * 0.5;
    const gy = -r * 0.24;
    const gw = r * 0.38;
    const gh = r * 0.3;
    x.fillStyle = '#120e0b';
    x.strokeStyle = '#0a0705';
    x.lineWidth = 1.8;
    x.beginPath();
    x.rect(gx - gw / 2, gy - gh / 2, gw, gh);
    x.fill();
    x.stroke();
    for (let i = 0; i < 3; i++) {
      x.strokeStyle = `rgba(255,154,60,${(charging ? 0.95 : 0.55) - i * 0.08})`;
      x.lineWidth = 2.2;
      const yy = gy - gh / 2 + 2.5 + i * (gh / 3.2);
      x.beginPath();
      x.moveTo(gx - gw / 2 + 1.5, yy);
      x.lineTo(gx + gw / 2 - 1.5, yy);
      x.stroke();
    }
  }

  // 胸口爐口：整隻的視覺中心，也是唯一讀得出「蓄力」的部件。
  // 呼吸同時推半徑與亮度（只有亮度會像壞掉的燈、只有半徑會像在縮放），兩者一起吃 t
  // 才像真的在燃燒。口徑抓 0.36~0.40r，比頭還大 —— 爐口是牠的「臉」。
  const mcy = -r * 0.3;
  const mouthR = r * (final ? 0.4 : 0.36) * (1 + breathe * 0.07);
  x.fillStyle = '#211c18';
  x.strokeStyle = '#0e0b09';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(0, mcy, mouthR * 1.42, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  const mg = x.createRadialGradient(0, mcy, mouthR * 0.1, 0, mcy, mouthR);
  mg.addColorStop(0, charging ? 'rgba(255,255,238,0.98)' : `rgba(255,${Math.round(196 + breathe * 48)},${Math.round(96 + breathe * 66)},0.95)`);
  mg.addColorStop(0.45, 'rgba(255,140,50,0.92)');
  mg.addColorStop(1, 'rgba(120,40,10,0.95)');
  x.fillStyle = mg;
  x.beginPath();
  x.arc(0, mcy, mouthR, 0, Math.PI * 2);
  x.fill();
  // 爐柵三根橫條：有柵條才讀得出「這是爐門不是眼睛」。一顆亮圓掛在怪物胸口很容易被
  // 看成瞳孔，加上橫條就瞬間變成人造物。弦長取 0.86R 才不會凸出圓外。
  x.strokeStyle = '#171310';
  x.lineWidth = r * 0.055;
  for (let i = -1; i <= 1; i++) {
    const yy = mcy + i * mouthR * 0.42;
    const half = mouthR * 0.86 * Math.sqrt(Math.max(0, 1 - (i * 0.42) * (i * 0.42)));
    x.beginPath();
    x.moveTo(-half, yy);
    x.lineTo(half, yy);
    x.stroke();
  }
  // 爐口的溢出光：蓄力時整片胸口被照亮，這是「牠正在加熱」最直覺的讀法。
  const spill = x.createRadialGradient(0, mcy, mouthR * 0.5, 0, mcy, mouthR * (charging ? 2.6 : 1.8));
  spill.addColorStop(0, charging ? 'rgba(255,236,190,0.5)' : 'rgba(255,154,60,0.22)');
  spill.addColorStop(1, 'rgba(255,154,60,0)');
  x.fillStyle = spill;
  x.beginPath();
  x.arc(0, mcy, mouthR * (charging ? 2.6 : 1.8), 0, Math.PI * 2);
  x.fill();

  // 兩側導管：把爐口接到肩甲，順便給胸口一條斜線（純水平/垂直的裝甲會很呆）。
  for (const s of [-1, 1]) {
    x.strokeStyle = '#2a2420';
    x.lineWidth = r * 0.15;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(s * mouthR * 0.92, mcy - mouthR * 0.24);
    x.lineTo(s * r * 0.84, -r * 0.7);
    x.stroke();
    x.strokeStyle = charging ? 'rgba(255,240,200,0.95)' : 'rgba(255,154,60,0.55)';
    x.lineWidth = r * 0.045;
    x.beginPath();
    x.moveTo(s * mouthR * 0.92, mcy - mouthR * 0.24);
    x.lineTo(s * r * 0.84, -r * 0.7);
    x.stroke();
  }

  // 肩甲：兩個獨立的塊體，是「寬肩」的來源。比軀幹亮一階（朝上的面吃得到頂光），
  // 而且外緣切角 —— 方塊肩會像貨櫃，切角才像機甲。外緣 ±1.55r，安全。
  for (const s of [-1, 1]) {
    const px0 = s * r * 1.02;
    const pw = s * r * 0.46;
    x.fillStyle = final ? '#5f5347' : '#4b423a';
    x.strokeStyle = '#0e0b09';
    x.lineWidth = 2.8;
    x.beginPath();
    x.moveTo(px0, -r * 0.96);
    x.lineTo(px0 + pw, -r * 0.84);
    x.lineTo(px0 + pw * 1.04, -r * 0.28);
    x.lineTo(px0 + pw * 0.46, -r * 0.16);
    x.lineTo(px0, -r * 0.34);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#c9a468';
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(px0 + pw * (0.3 + i * 0.28), -r * 0.66, 1.6, 0, Math.PI * 2);
      x.fill();
    }
    // final：肩甲上加開熔爐口。肩甲的寬度已經到頂，所以 final 的增量只能往上/往內長。
    if (final) {
      const fx = px0 + pw * 0.62;
      const fy = -r * 0.62;
      const fg = x.createRadialGradient(fx, fy, 0, fx, fy, r * 0.26);
      fg.addColorStop(0, charging ? 'rgba(255,255,240,0.95)' : 'rgba(255,200,120,0.85)');
      fg.addColorStop(1, 'rgba(255,154,60,0)');
      x.fillStyle = fg;
      x.beginPath();
      x.arc(fx, fy, r * 0.26, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#171310';
      x.beginPath();
      x.arc(fx, fy, r * 0.12, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 液壓臂 + 工具：左邊鐵鎚、右邊夾爪。不對稱的兩隻手讓剪影一眼分得出左右，
  // 也避免整體變成完全鏡像的圖示。手臂隨 t 微幅升降（液壓在找壓力平衡），
  // 幅度刻意小於鎚頭半徑，否則看起來像在揮而不是在站。
  const armLift = Math.sin(p) * r * 0.05;
  const bot = r * 0.3 + armLift;
  const grip = charging ? 0.5 : 1;      // 夾爪開合：蓄力時收緊，比伸手更好讀
  for (const s of [-1, 1]) {
    const ax = s * r * 1.24;
    x.strokeStyle = '#241f1b';
    x.lineWidth = r * 0.24;
    x.beginPath();
    x.moveTo(ax, -r * 0.4);
    x.lineTo(ax + s * r * 0.03, bot);
    x.stroke();
    // 活塞桿（亮色細線）貼在液壓缸外側，給手臂一條高光
    x.strokeStyle = '#8d8172';
    x.lineWidth = r * 0.07;
    x.beginPath();
    x.moveTo(ax + s * r * 0.11, -r * 0.32);
    x.lineTo(ax + s * r * 0.07, bot - r * 0.02);
    x.stroke();
    if (s < 0) {
      // 鐵鎚頭：方塊 + 左上亮面
      x.save();
      x.translate(ax - r * 0.02, bot + r * 0.3);
      x.fillStyle = '#3a332d';
      x.strokeStyle = '#0d0a08';
      x.lineWidth = 2.6;
      x.beginPath();
      x.rect(-r * 0.34, -r * 0.2, r * 0.68, r * 0.4);
      x.fill();
      x.stroke();
      x.fillStyle = 'rgba(226,214,192,0.22)';
      x.fillRect(-r * 0.32, -r * 0.18, r * 0.66, r * 0.1);
      if (charging) {
        const hgl = x.createRadialGradient(0, r * 0.22, 0, 0, r * 0.22, r * 0.42);
        hgl.addColorStop(0, 'rgba(255,214,150,0.8)');
        hgl.addColorStop(1, 'rgba(255,154,60,0)');
        x.fillStyle = hgl;
        x.beginPath();
        x.arc(0, r * 0.22, r * 0.42, 0, Math.PI * 2);
        x.fill();
      }
      x.restore();
    } else {
      // 夾爪：兩片顎往內收。爪尖 x 最遠約 1.6r，仍在 1.68r 的履帶範圍內。
      for (const gdir of [-1, 1]) {
        x.save();
        x.translate(ax + r * 0.02, bot + r * 0.26);
        x.rotate(gdir * 0.42 * grip);
        x.fillStyle = '#3f3830';
        x.strokeStyle = '#0d0a08';
        x.lineWidth = 2.4;
        x.beginPath();
        x.moveTo(-r * 0.1, 0);
        x.lineTo(r * 0.11, 0);
        x.lineTo(r * 0.05, r * 0.46);
        x.lineTo(-r * 0.02, r * 0.4);
        x.closePath();
        x.fill();
        x.stroke();
        x.restore();
      }
    }
  }

  // final：背上的鍋爐艙（兩片側板 + 一排壓力鉚釘）。它必須畫在駕駛艙**之前** ——
  // 鍋爐的範圍是 ±0.72r、-1.5r~-0.98r，而駕駛艙正好坐在 -0.94r~-1.3r，先畫鍋爐才不會
  // 把整顆頭蓋掉（先前畫在後面，final 版直接變成沒有頭的方塊）。
  if (final) {
    x.fillStyle = '#3d3630';
    x.strokeStyle = '#0f0c0a';
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(-r * 0.72, -r * 1.5);
    x.lineTo(r * 0.72, -r * 1.5);
    x.lineTo(r * 0.84, -r * 0.98);
    x.lineTo(-r * 0.84, -r * 0.98);
    x.closePath();
    x.fill();
    x.stroke();
    x.strokeStyle = '#191411';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(-r * 0.74, -r * 1.24);
    x.lineTo(r * 0.74, -r * 1.24);
    x.stroke();
    x.fillStyle = '#c9a468';
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.arc(-r * 0.56 + i * r * 0.28, -r * 1.37, 1.6, 0, Math.PI * 2);
      x.fill();
    }
  }

  // 駕駛艙（頭）：刻意做小。重機甲的頭一大就變成人形機器人；頭小才顯得軀幹厚重。
  // 面罩是一條橫向的暖光縫，跟胸口的圓爐口形成「圓 vs 線」的對比。頂點 -1.3r（=-65px）。
  x.fillStyle = '#332d28';
  x.strokeStyle = '#0d0a08';
  x.lineWidth = 2.6;
  x.beginPath();
  x.moveTo(-r * 0.42, -r * 0.94);
  x.lineTo(r * 0.42, -r * 0.94);
  x.lineTo(r * 0.34, -r * 1.3);
  x.lineTo(-r * 0.34, -r * 1.3);
  x.closePath();
  x.fill();
  x.stroke();
  const vg = x.createLinearGradient(-r * 0.3, 0, r * 0.3, 0);
  vg.addColorStop(0, charging ? 'rgba(255,255,240,0.98)' : 'rgba(255,196,120,0.92)');
  vg.addColorStop(1, 'rgba(255,140,50,0.7)');
  x.fillStyle = vg;
  x.fillRect(-r * 0.3, -r * 1.2, r * 0.6, r * 0.09);
  const visor = x.createRadialGradient(0, -r * 1.16, 0, 0, -r * 1.16, r * 0.5);
  visor.addColorStop(0, 'rgba(255,190,110,0.34)');
  visor.addColorStop(1, 'rgba(255,154,60,0)');
  x.fillStyle = visor;
  x.beginPath();
  x.arc(0, -r * 1.16, r * 0.5, 0, Math.PI * 2);
  x.fill();

  // 排渣管：腰際往外下方的短管，管口在蓄力時噴火星。火星位置用 (i/n + t) % 1 算，
  // 一週期剛好走完一圈 → 8 幀接回第 0 幀時不會有粒子憑空消失。
  for (const s of [-1, 1]) {
    const sx0 = s * r * 0.92;
    const sy0 = r * 0.46;
    const tipX = sx0 + s * r * 0.36;
    const tipY = sy0 + r * 0.24;
    x.strokeStyle = '#2b2521';
    x.lineWidth = r * 0.14;
    x.beginPath();
    x.moveTo(sx0, sy0 - r * 0.1);
    x.lineTo(tipX, tipY);
    x.stroke();
    const tg2 = x.createRadialGradient(tipX, tipY, 0, tipX, tipY, r * (charging ? 0.34 : 0.2));
    tg2.addColorStop(0, charging ? 'rgba(255,248,220,0.95)' : 'rgba(255,170,80,0.7)');
    tg2.addColorStop(1, 'rgba(255,154,60,0)');
    x.fillStyle = tg2;
    x.beginPath();
    x.arc(tipX, tipY, r * (charging ? 0.34 : 0.2), 0, Math.PI * 2);
    x.fill();
    const n = charging ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const k = (i / n + t * (charging ? 2 : 1)) % 1;
      x.fillStyle = `rgba(255,${Math.round(220 - 60 * k)},${Math.round(150 - 90 * k)},${0.85 * (1 - k)})`;
      x.beginPath();
      x.arc(tipX + s * k * r * 0.3, tipY + k * r * 0.36 - Math.sin(k * Math.PI) * r * 0.1,
        r * 0.035 * (1 - k * 0.4), 0, Math.PI * 2);
      x.fill();
    }
  }

  // charging：肩甲蒸氣 + 爐渣池冒泡。粒子/氣團數量刻意少（兩道蒸氣、三顆氣泡）——
  // 8 幀循環下粒子一多就會被看成閃爍雜訊，少才讀得出「壓力正在上升」。
  if (charging) {
    for (const s of [-1, 1]) {
      const jx = s * r * 1.28;
      const jy = -r * 0.9;
      const jg = x.createRadialGradient(jx, jy, 0, jx, jy, r * 0.34);
      jg.addColorStop(0, 'rgba(255,244,214,0.55)');
      jg.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = jg;
      x.beginPath();
      x.arc(jx, jy - Math.abs(Math.sin(p + (s > 0 ? 0.4 : 0))) * r * 0.16, r * 0.34, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 3; i++) {
      const bx = -r * 0.9 + i * r * 0.9;
      const k = (t * 1.5 + i / 3) % 1;
      x.fillStyle = `rgba(255,210,140,${0.5 * (1 - k)})`;
      x.beginPath();
      x.arc(bx, r * 1.06 - k * r * 0.5, r * 0.05 * (1 - k * 0.5), 0, Math.PI * 2);
      x.fill();
    }
  }
  x.restore();
}

// ── 霜封虛空：冰封巨像 ─────────────────────────────────────────────────────
// 為什麼是「直立窄長」而不是又一顆冰球：霜的主題很容易畫成「白色的圓」，那會直接撞上
// 街頭/lab 的球體剪影。這裡改賭**長寬比**：實心 bbox 只有約 1.5r 寬、2.8r 高，是全場
// 唯一的「細高」形狀；軀幹做成上下都收尖的六角冰柱，重心垂直，看起來像一根插在地上的
// 冰錐而不是一團東西。
// 可動的部分刻意全部交給「符文環」：冰是剛體、不該蠕動，讓環吃 t 旋轉與收縮，既有動畫
// 又不會讓冰看起來像果凍。符文環同時是蓄力指示器 —— 環往內收＝正在聚能。
function drawBossFrostvoid(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const spin = p;
  const pulse = 0.5 + 0.5 * Math.sin(p * 1.5);      // 核心明滅（1.5 倍頻：跟環的轉速錯開才不呆板）
  const shrink = charging ? 0.66 : 1;              // 蓄力：符文環往內收（聚能）
  const shiver = Math.sin(p * 3) * r * 0.006;      // 極輕的震動：冰巨像仍然在「活著」

  // 貼地：冰是插在地上的，陰影要窄（寬陰影會讓細高的冰錐看起來在飄），
  // 再加一圈貼地的霜霧交代「這裡的溫度不一樣」。
  shadow(x, r * 0.68, r * 1.14);
  const mist = x.createRadialGradient(0, r * 1.0, 0, 0, r * 1.0, r * 1.15);
  mist.addColorStop(0, charging ? 'rgba(190,170,255,0.44)' : 'rgba(157,140,255,0.26)');
  mist.addColorStop(1, 'rgba(157,140,255,0)');
  x.fillStyle = mist;
  x.beginPath();
  x.ellipse(0, r * 1.0, r * 1.15, r * 0.4, 0, 0, Math.PI * 2);
  x.fill();

  const aura = r + (final ? 30 : 20);
  const ag = x.createRadialGradient(0, -r * 0.2, r * 0.5, 0, -r * 0.2, aura);
  ag.addColorStop(0, charging ? 'rgba(200,180,255,0.58)' : final ? 'rgba(157,140,255,0.32)' : 'rgba(157,140,255,0.2)');
  ag.addColorStop(1, 'rgba(157,140,255,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, -r * 0.2, aura, 0, Math.PI * 2);
  x.fill();

  // 符文：每個字是「三筆」的小刻痕。想在 8~14px 內畫出可辨識的字型是不可能的，
  // 但三筆的節奏縮小之後仍然讀成「有一圈東西在轉」—— 這就夠了。
  const rune = (rx0, ry0, s, a, scale, alpha) => {
    x.save();
    x.translate(rx0, ry0);
    x.rotate(a);
    x.scale(scale, scale);
    const rg = x.createRadialGradient(0, 0, 0, 0, 0, s * 2.8);
    rg.addColorStop(0, `rgba(157,140,255,${0.5 * alpha})`);
    rg.addColorStop(1, 'rgba(157,140,255,0)');
    x.fillStyle = rg;
    x.beginPath();
    x.arc(0, 0, s * 2.8, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = `rgba(236,230,255,${alpha})`;
    x.lineWidth = r * 0.042;
    x.beginPath();
    x.moveTo(-s, -s * 0.9);
    x.lineTo(s * 0.9, s * 0.2);
    x.moveTo(-s * 0.7, s);
    x.lineTo(s * 0.8, -s * 0.6);
    x.moveTo(0, -s * 1.2);
    x.lineTo(0, s * 1.2);
    x.stroke();
    x.restore();
  };
  // 環的後半（橢圓上半）先畫、前半後畫 —— 環才會「穿過」身體而不是貼在前面。
  // 前後的尺寸差（1 ± 0.22 sin a）是唯一能在 2D 做出一圈東西在繞的方法。
  const ring = (cy0, rx, ry, n, phase, front) => {
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      const sn = Math.sin(a);
      if ((sn < 0) === front) continue;
      const scale = (1 + 0.24 * sn) * (charging ? 0.84 : 1);
      rune(Math.cos(a) * rx, cy0 + sn * ry, r * 0.1, a + Math.PI / 2, scale, sn < 0 ? 0.45 : 0.92);
    }
  };
  const rx1 = r * 1.08 * shrink;
  const ry1 = r * 0.3 * shrink;
  const ringY = -r * 0.06 + Math.sin(p) * r * 0.05;   // 環會上下浮：蓄力時收縮、平時上下漂
  ring(ringY, rx1, ry1, final ? 9 : 7, spin, true);

  // 折斷的側刺：三根往外斜插，其中一根刻意「斷平」（尖端是一個平截面）。
  // 完整的尖刺只是裝飾，平整的斷口才是「這裡受過傷」唯一的視覺證據。
  const shard = (bx, by, tx, ty, broken) => {
    x.fillStyle = '#8fa0d8';
    x.strokeStyle = '#2b3160';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(bx, by - r * 0.09);
    if (broken) {
      x.lineTo(tx, ty - r * 0.14);
      x.lineTo(tx, ty + r * 0.14);
    } else {
      x.lineTo(tx, ty);
    }
    x.lineTo(bx, by + r * 0.09);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = 'rgba(240,248,255,0.4)';
    x.beginPath();
    x.moveTo(bx, by - r * 0.07);
    if (broken) { x.lineTo(tx, ty - r * 0.1); x.lineTo(tx, ty - r * 0.02); }
    else { x.lineTo(tx, ty); }
    x.closePath();
    x.fill();
  };
  shard(-r * 0.48, -r * 0.6, -r * 0.92, -r * 0.86, false);
  shard(r * 0.5, -r * 0.24, r * 0.96, -r * 0.4, false);
  shard(r * 0.42, r * 0.44, r * 0.74, r * 0.6, true);      // 斷平的那根

  x.save();
  x.translate(0, shiver);

  // 軀幹：六角冰柱，上下都收尖。輪廓刻意不是平滑的橢圓而是**一段段有稜的折線** ——
  // 平滑的長橢圓在這個比例下會被讀成火箭或子彈，加了三段折角才讀成「晶體」。
  // 左半（受光面）與正面分開上色：單一漸層會讓冰柱變成一塊塑膠。
  const B = [
    [0, -1.55], [-0.22, -1.3], [-0.34, -1.12], [-0.42, -0.86], [-0.56, -0.48], [-0.6, -0.02],
    [-0.52, 0.34], [-0.44, 0.6], [-0.34, 0.86], [-0.3, 1.02],
    [0, 1.08], [0.3, 1.02], [0.34, 0.86], [0.44, 0.6], [0.52, 0.34], [0.6, -0.02],
    [0.56, -0.48], [0.42, -0.86], [0.34, -1.12], [0.22, -1.3],
  ].map(([bx, by]) => [bx * r, by * r]);
  const path = () => {
    x.beginPath();
    x.moveTo(B[0][0], B[0][1]);
    for (let i = 1; i < B.length; i++) x.lineTo(B[i][0], B[i][1]);
    x.closePath();
  };
  path();
  const iceG = x.createLinearGradient(-r * 0.5, -r * 1.2, r * 0.5, r * 0.9);
  iceG.addColorStop(0, '#cdd8ff');
  iceG.addColorStop(0.4, '#7c8ac8');
  iceG.addColorStop(1, '#2b3160');
  x.fillStyle = iceG;
  x.fill();
  // 正面的一個小平面（中央那一格）：比兩側亮，做出稜線
  x.fillStyle = 'rgba(226,236,255,0.3)';
  x.beginPath();
  x.moveTo(-r * 0.12, -r * 1.34);
  x.lineTo(r * 0.12, -r * 1.34);
  x.lineTo(r * 0.2, r * 0.9);
  x.lineTo(-r * 0.2, r * 0.9);
  x.closePath();
  x.fill();
  // 內部的裂痕：兩條折線。冰的「透明感」來自內部的不連續面，不是來自更亮的表面。
  x.strokeStyle = 'rgba(255,255,255,0.5)';
  x.lineWidth = 1.8;
  x.beginPath();
  x.moveTo(-r * 0.3, -r * 0.9);
  x.lineTo(-r * 0.05, -r * 0.5);
  x.lineTo(-r * 0.22, -r * 0.1);
  x.lineTo(r * 0.06, r * 0.34);
  x.stroke();
  x.strokeStyle = 'rgba(190,200,255,0.42)';
  x.beginPath();
  x.moveTo(r * 0.34, -r * 0.72);
  x.lineTo(r * 0.12, -r * 0.36);
  x.lineTo(r * 0.3, r * 0.1);
  x.stroke();

  // 虛空核心：隔著冰看進去的一顆紫色內核。做法是核心畫在冰之上、但只給 0.85 的不透明度，
  // 再補一層薄霜蓋回去 —— 這樣它讀成「被包在裡面」，而不是貼在胸口的一顆球。
  const coreY = -r * 0.26;
  const coreR = r * (charging ? 0.52 : 0.4) * (1 + pulse * 0.26);
  const cg = x.createRadialGradient(0, coreY, 0, 0, coreY, coreR * 1.9);
  cg.addColorStop(0, charging ? 'rgba(246,238,255,0.98)' : 'rgba(214,196,255,0.95)');
  cg.addColorStop(0.35, 'rgba(157,140,255,0.78)');
  cg.addColorStop(1, 'rgba(157,140,255,0)');
  x.globalAlpha = 0.88;
  x.fillStyle = cg;
  x.beginPath();
  x.arc(0, coreY, coreR * 1.9, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;
  x.fillStyle = charging ? '#ffffff' : '#efe8ff';
  x.beginPath();
  x.arc(0, coreY, coreR * 0.4, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(226,236,255,0.22)';
  x.beginPath();
  x.arc(-r * 0.1, coreY - r * 0.06, coreR * 1.15, 0, Math.PI * 2);
  x.fill();

  // 冰面的外框：最後畫，讓所有內部細節都收在同一條邊界裡（沒有它，冰會糊在背景上）。
  path();
  x.strokeStyle = '#1d2246';
  x.lineWidth = 3;
  x.stroke();
  // 左上的晶面高光：一條長斜線，光源固定在左上。
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = 2.4;
  x.beginPath();
  x.moveTo(-r * 0.36, -r * 0.96);
  x.lineTo(-r * 0.5, r * 0.1);
  x.stroke();

  // final：冠狀冰柱。從軀幹上段的晶面往上長，尖端最高 -1.78r（=89px，半寬 104 → 留 15px）。
  // 冠一定要比軀幹的尖端更高，否則 final 的剪影反而比一般版矮。
  if (final) {
    const crown = [[-r * 0.26, -r * 1.16, -r * 0.34, -r * 1.62], [-r * 0.1, -r * 1.3, -r * 0.14, -r * 1.78],
      [r * 0.06, -r * 1.34, r * 0.1, -r * 1.74], [r * 0.22, -r * 1.2, r * 0.32, -r * 1.6]];
    for (const [bx0, by0, tx0, ty0] of crown) {
      x.fillStyle = '#b9c6f5';
      x.strokeStyle = '#242a55';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(bx0 - r * 0.09, by0);
      x.lineTo(tx0, ty0);
      x.lineTo(bx0 + r * 0.09, by0);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.45)';
      x.beginPath();
      x.moveTo(bx0 - r * 0.06, by0);
      x.lineTo(tx0, ty0);
      x.lineTo(bx0 - r * 0.01, by0);
      x.closePath();
      x.fill();
    }
  }

  // 發光的符文環（前半）：畫在軀幹與核心之上，環才是「浮在冰外面的」。
  ring(ringY, rx1, ry1, final ? 9 : 7, spin, false);
  // final：第二層符文環，位置更高、半徑更小、反向旋轉。兩層反向轉的環讓「巨像的靜」
  // 與「符文的動」對比更強，也把剪影的上半部撐寬一點。
  if (final) {
    const rx2 = r * 0.66 * shrink;
    const ry2 = r * 0.19 * shrink;
    for (let i = 0; i < 5; i++) {
      const a = -spin * 1.3 + (i / 5) * Math.PI * 2;
      const sn = Math.sin(a);
      const scale = (1 + 0.24 * sn) * (charging ? 0.84 : 1);
      rune(Math.cos(a) * rx2, -r * 0.92 + sn * ry2, r * 0.085, a + Math.PI / 2, scale, sn < 0 ? 0.4 : 0.85);
    }
  }

  x.restore();

  // 底部的碎冰座：把細高的冰錐「插」在地上，而不是讓尖端懸空。畫在軀幹之後（在它前面），
  // 順便給底部一個比陰影更硬的落地點。
  for (const [bx0, bw, bh] of [[-r * 0.44, r * 0.16, r * 0.34], [r * 0.46, r * 0.19, r * 0.42], [-r * 0.12, r * 0.13, r * 0.24]]) {
    x.fillStyle = '#93a4dd';
    x.strokeStyle = '#242a55';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(bx0 - bw, r * 1.06);
    x.lineTo(bx0, r * 1.06 - bh);
    x.lineTo(bx0 + bw, r * 1.06);
    x.closePath();
    x.fill();
    x.stroke();
  }

  // 漂浮的霜雪：五顆小點繞著軀幹緩緩上升。位置用 (i/5 + t) % 1 → 循環無縫。
  for (let i = 0; i < 5; i++) {
    const k = (i / 5 + t) % 1;
    const mx = Math.sin(p + i * 2.1) * r * 0.7;
    const my = r * 1.0 - k * r * 2.3;
    x.fillStyle = `rgba(226,236,255,${0.5 * (1 - Math.abs(k - 0.5) * 1.6)})`;
    x.beginPath();
    x.arc(mx, my, r * 0.035, 0, Math.PI * 2);
    x.fill();
  }

  // charging：符文環收縮時，能量從環上往核心收束（聚能的方向性），外加核心外一圈衝擊環。
  // 「向內」是蓄力最不會被誤讀的方向，所以這裡刻意不畫任何往外的特效。
  if (charging) {
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2;
      const sn = Math.sin(a);
      const f = (0.35 + 0.6 * ((t * 2 + i / 6) % 1));
      const x0 = Math.cos(a) * rx1;
      const y0 = -r * 0.06 + sn * ry1;
      const x1 = x0 * (1 - f) + 0 * f;
      const y1 = y0 + (coreY - y0) * f;
      x.strokeStyle = `rgba(226,214,255,${0.6 * (1 - f)})`;
      x.lineWidth = 1.8;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x1, y1);
      x.stroke();
    }
    x.strokeStyle = `rgba(214,196,255,${0.35 + 0.3 * pulse})`;
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(0, coreY, coreR * 1.5, coreR * 1.2, 0, 0, Math.PI * 2);
    x.stroke();
  }
}

// ── 虛空裂道：裂道行者（虛空幽影騎士） ─────────────────────────────────────
// 為什麼是「披風」而不是人形或球：這關的材質是「虛空星盤」——背景本身就是滿版光點，
// 任何實心大色塊都會被背景吃平。因此本體刻意做成**下襬被撕裂的斗篷**：上半是布的剪影
// （好讀），下半化成不規則鋸齒與漂浮破片（跟滿版星點混在一起，看起來像正在溶解）。
// 前六隻的下緣全是完整的（球底、車底、囊底、甲殼底），「碎掉的下襬」是牠獨有的特徵；
// 而已有的沼澤是上寬下窄、牠是上窄下寬，兩者的重心方向相反。
// 動畫分三處：破片繞著身體轉、斗篷下襬與刀刃的裂縫吃 t 呼吸、單眼光點的脈動。
function drawBossVoidroad(x, t, r, charging, final) {
  const p = t * Math.PI * 2;
  const drift = Math.sin(p) * r * 0.035;           // 整體漂浮：幽影不該貼在地上
  const spin = p * 0.75;
  const rift = 0.5 + 0.5 * Math.sin(p * 2);        // 裂縫的呼吸（雙倍頻，比漂浮急）
  const reach = charging ? 1.06 : 1;               // 蓄力：裂縫刃伸長（幅度受畫布留邊限制）
  const flare = final ? 1.06 : 1;                  // final：斗篷下襬更外張

  // 貼地陰影要壓得比本體窄：斗篷的下襬是「散開」的，影子太寬會讓牠看起來只是站在地上，
  // 而不是浮著。
  shadow(x, r * 1.05, r * 1.24);
  const aura = r + (final ? 30 : 20);
  const ag = x.createRadialGradient(0, -r * 0.1, r * 0.5, 0, -r * 0.1, aura);
  ag.addColorStop(0, charging ? 'rgba(125,255,232,0.55)' : final ? 'rgba(125,255,232,0.3)' : 'rgba(125,255,232,0.18)');
  ag.addColorStop(1, 'rgba(125,255,232,0)');
  x.fillStyle = ag;
  x.beginPath();
  x.arc(0, -r * 0.1, aura, 0, Math.PI * 2);
  x.fill();

  // 漂浮破片環：破片沿橢圓軌道環繞，後半先畫、前半後畫 → 破片會「穿過」身體而不是全貼在
  // 前面。大小隨軌道角變化（近大遠小），這是 2D 裡做出「繞著轉」最省也最有效的方法。
  const orbitR = r * 1.32;
  const orbit = (front) => {
    const n = final ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * Math.PI * 2;
      const sn = Math.sin(a);
      if ((sn < 0) === front) continue;
      const ox = Math.cos(a) * orbitR;
      const oy = -r * 0.08 + sn * r * 0.52 + drift;
      const sz = r * (0.09 + 0.045 * (1 + sn));
      x.save();
      x.translate(ox, oy);
      x.rotate(a * 1.6);
      x.fillStyle = '#08171b';
      x.strokeStyle = charging ? 'rgba(180,255,240,0.9)' : 'rgba(125,255,232,0.55)';
      x.lineWidth = 1.8;
      x.beginPath();
      x.moveTo(-sz, -sz * 0.5);
      x.lineTo(sz * 0.9, -sz);
      x.lineTo(sz * 0.5, sz * 0.8);
      x.lineTo(-sz * 0.7, sz * 0.4);
      x.closePath();
      x.fill();
      x.stroke();
      x.restore();
    }
  };
  orbit(true);

  x.save();
  x.translate(0, drift);

  // 裂縫刃（手臂）：把手臂畫成一條裂開的縫而不是實心劍 —— 內側是純黑（虛空的入口）、
  // 外側是一道青色亮邊。charging 時刃尖往外伸長，黑縫也一起拉長，看起來像把空間撕開。
  // 刃尖：final_charging 是這隻最寬的狀態（1.60r × 1.06 = 84.8px），加上外框與左上的
  // 輪廓光約 5px 之後離畫布邊還有 13px。先前用 1.72r 會讓 final_charging 的 bbox 量到
  // 左邊只剩 7 device px（=3.5px），輪廓光已經被切掉一角。
  for (const s of [-1, 1]) {
    const rootX = s * r * 0.8;
    const rootY = -r * 0.52;
    const midX = s * r * 1.16;
    const midY = r * 0.02;
    const tipX = s * r * (final ? 1.6 : 1.5) * reach;
    const tipY = r * (0.62 + 0.16 * reach) + Math.sin(p + (s > 0 ? 1.2 : 0)) * r * 0.05;
    x.beginPath();
    x.moveTo(rootX, rootY);
    x.lineTo(midX * 0.96, midY - r * 0.2);
    x.lineTo(tipX, tipY);
    x.lineTo(midX * 0.66, midY + r * 0.26);
    x.lineTo(rootX * 0.74, rootY + r * 0.54);
    x.closePath();
    x.fillStyle = '#040b0d';
    x.fill();
    x.strokeStyle = charging ? 'rgba(190,255,242,0.95)' : 'rgba(125,255,232,0.6)';
    x.lineWidth = 2.4;
    x.stroke();
    // 刃上的光核：一條比外緣更亮的細線，位置吃 rift → 刃會呼吸。
    x.strokeStyle = charging ? 'rgba(255,255,255,0.95)' : `rgba(125,255,232,${0.5 + rift * 0.35})`;
    x.lineWidth = 1.8;
    x.beginPath();
    x.moveTo(rootX * 0.9, rootY + r * 0.12);
    x.lineTo(midX * 0.9, midY - r * 0.02);
    x.lineTo(tipX * 0.97, tipY - r * 0.03);
    x.stroke();
    // 肩甲碎片：兩塊斜的硬邊板。整隻都是柔軟的布與裂縫時，需要一點「騎士」的硬東西
    // 讓眼睛有地方停（也讓剪影的肩線像肩膀而不是布篷）。
    x.fillStyle = '#0d2024';
    x.strokeStyle = 'rgba(125,255,232,0.7)';
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(s * r * 0.7, -r * 0.66);
    x.lineTo(s * r * 1.12, -r * 0.44);
    x.lineTo(s * r * 1.0, -r * 0.06);
    x.lineTo(s * r * 0.62, -r * 0.24);
    x.closePath();
    x.fill();
    x.stroke();
  }

  // 斗篷本體：上窄（兜帽）下寬（下襬），下緣是一排交錯深淺的鋸齒。
  // 鋸齒的深度刻意做成 0.66r / 1.22r 兩階而不是隨機 —— 隨機在只有 8 幀的循環裡
  // 會變成抖動，兩階的節奏才讀成「被撕開的布」。
  const N = 7;
  const hemY = r * 0.86;
  const hemPts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const hx0 = -r * 1.4 * flare + u * r * 2.8 * flare;
    const deep = (i % 2) ? r * 1.22 : r * 0.66;
    hemPts.push([hx0, deep + Math.sin(p * 2 + i * 1.3) * r * 0.07]);
  }
  x.beginPath();
  x.moveTo(0, -r * 1.58);
  x.quadraticCurveTo(-r * 0.5, -r * 1.24, -r * 0.6, -r * 0.9);
  x.quadraticCurveTo(-r * 1.02, -r * 0.7, -r * 1.06 * flare, -r * 0.34);
  x.quadraticCurveTo(-r * 0.94, r * 0.22, -r * 1.4 * flare, hemY);
  for (const [hx0, hy0] of hemPts) x.lineTo(hx0, hy0);
  x.quadraticCurveTo(r * 0.94, r * 0.22, r * 1.06 * flare, -r * 0.34);
  x.quadraticCurveTo(r * 1.02, -r * 0.7, r * 0.6, -r * 0.9);
  x.quadraticCurveTo(r * 0.5, -r * 1.24, 0, -r * 1.58);
  x.closePath();
  const cloakG = x.createLinearGradient(-r * 0.6, -r * 1.4, r * 0.4, r * 1.1);
  cloakG.addColorStop(0, '#1d3b42');
  cloakG.addColorStop(0.42, '#0e2229');
  cloakG.addColorStop(0.78, '#081a20');
  // 下襬不能壓到全黑：這關的背景是深色星盤，純黑的下襬會讓「被撕開的鋸齒」整個消失，
  // 那正是這隻唯一的剪影特徵。留一點亮度，並在下面補一條青色描邊把齒型勾出來。
  cloakG.addColorStop(1, 'rgba(10,32,38,0.96)');
  x.fillStyle = cloakG;
  x.fill();
  x.strokeStyle = '#04100f';
  x.lineWidth = 3;
  x.stroke();
  // 撕開的下襬：沿著齒型描一條青色亮線，齒尖再點一顆小光點。
  // 只有填色沒有這條線的話，8 幀裡的齒深變化根本看不出來（實測：整排齒會糊成一條邊）。
  x.strokeStyle = `rgba(125,255,232,${0.34 + rift * 0.24})`;
  x.lineWidth = 2.2;
  x.beginPath();
  x.moveTo(-r * 1.4 * flare, hemY);
  for (const [hx0, hy0] of hemPts) x.lineTo(hx0, hy0);
  x.stroke();
  for (let i = 0; i < hemPts.length; i++) {
    if (i % 2 === 0) continue;                      // 只點齒尖（奇數索引＝最深的那些點）
    x.fillStyle = `rgba(190,255,244,${0.4 + rift * 0.3})`;
    x.beginPath();
    x.arc(hemPts[i][0], hemPts[i][1], r * 0.035, 0, Math.PI * 2);
    x.fill();
  }

  // 布面的摺痕：三條從肩往下的弧線。斗篷如果沒有摺痕，縮小後會變成一塊黑色的鐘形。
  x.strokeStyle = 'rgba(125,255,232,0.22)';
  x.lineWidth = 2.2;
  for (const s of [-1, 0, 1]) {
    x.beginPath();
    x.moveTo(s * r * 0.42, -r * 0.8);
    x.quadraticCurveTo(s * r * 0.86, r * 0.1, s * r * 1.1, r * 0.86);
    x.stroke();
  }
  // 布上的星點：這關的背景是星盤，斗篷上留幾顆亮點，牠才像「用虛空做的」而不是黑布。
  for (let i = 0; i < 7; i++) {
    const sx0 = Math.sin(i * 2.7) * r * 0.86;
    const sy0 = -r * 0.7 + ((i * 37) % 100) / 100 * r * 1.7;
    x.fillStyle = `rgba(190,255,244,${0.2 + 0.25 * rift})`;
    x.beginPath();
    x.arc(sx0, sy0, r * 0.026, 0, Math.PI * 2);
    x.fill();
  }

  // 兜帽：兩條曲線收成一個尖。尖點 -1.58r（=79px，半寬 104 → 留 25px）。
  x.beginPath();
  x.moveTo(0, -r * 1.58);
  x.quadraticCurveTo(-r * 0.44, -r * 1.3, -r * 0.52, -r * 0.86);
  x.quadraticCurveTo(-r * 0.3, -r * 0.96, 0, -r * 0.92);
  x.quadraticCurveTo(r * 0.3, -r * 0.96, r * 0.52, -r * 0.86);
  x.quadraticCurveTo(r * 0.44, -r * 1.3, 0, -r * 1.58);
  x.closePath();
  const hoodG = x.createLinearGradient(-r * 0.4, -r * 1.5, r * 0.3, -r * 0.9);
  hoodG.addColorStop(0, '#2b525c');
  hoodG.addColorStop(1, '#0a1a1f');
  x.fillStyle = hoodG;
  x.fill();
  x.strokeStyle = '#04100f';
  x.lineWidth = 2.8;
  x.stroke();

  // 空無的面孔：不畫五官，只留一個純黑洞 + 一顆青色光點。
  // 「空的」比任何扭曲的臉都可怕，而且在遊戲內尺寸下，扭曲的臉只會變成一團髒點。
  x.fillStyle = '#02090b';
  x.beginPath();
  x.ellipse(0, -r * 1.14, r * 0.26, r * 0.28, 0, 0, Math.PI * 2);
  x.fill();
  const eyeG = x.createRadialGradient(0, -r * 1.12, 0, 0, -r * 1.12, r * (charging ? 0.42 : 0.28));
  eyeG.addColorStop(0, charging ? 'rgba(255,255,255,0.98)' : 'rgba(190,255,244,0.92)');
  eyeG.addColorStop(0.4, 'rgba(125,255,232,0.5)');
  eyeG.addColorStop(1, 'rgba(125,255,232,0)');
  x.fillStyle = eyeG;
  x.beginPath();
  x.arc(0, -r * 1.12, r * (charging ? 0.42 : 0.28), 0, Math.PI * 2);
  x.fill();
  x.fillStyle = charging ? '#ffffff' : '#d8fff8';
  x.beginPath();
  x.arc(0, -r * 1.12, r * 0.075 * (1 + rift * 0.25), 0, Math.PI * 2);
  x.fill();

  // 中央裂縫：從兜帽一路撕到下襬的一條鋸齒光縫。它是「這件斗篷不是布、是裂縫」的關鍵，
  // 也是畫面唯一貫穿全身的線，縮到最小尺寸時仍然看得見。
  const seg = 7;
  x.beginPath();
  x.moveTo(0, -r * 0.86);
  for (let i = 1; i <= seg; i++) {
    const u = i / seg;
    x.lineTo((i % 2 ? 1 : -1) * r * 0.05 * (0.6 + rift * 0.7), -r * 0.86 + u * r * 1.9);
  }
  x.strokeStyle = charging ? 'rgba(255,255,255,0.95)' : `rgba(125,255,232,${0.55 + rift * 0.35})`;
  x.lineWidth = charging ? 3.4 : 2.4;
  x.stroke();
  x.strokeStyle = 'rgba(125,255,232,0.22)';
  x.lineWidth = 7;
  x.stroke();

  // final：浮游護盾碎塊。它同時做兩件事 —— 把剪影往左撐寬（final 的體型差異），
  // 以及提供一塊「實心硬邊」的對比：整隻都是半透明的裂體時，眼睛需要一個停下來的地方。
  if (final) {
    x.save();
    x.translate(-r * 1.22, r * 0.02);
    x.rotate(-0.22 + Math.sin(p) * 0.05);
    x.fillStyle = '#0b2229';
    x.strokeStyle = 'rgba(125,255,232,0.8)';
    x.lineWidth = 2.6;
    x.beginPath();
    x.moveTo(-r * 0.3, -r * 0.38);
    x.lineTo(r * 0.24, -r * 0.44);
    x.lineTo(r * 0.32, r * 0.12);
    x.lineTo(-r * 0.06, r * 0.44);
    x.lineTo(-r * 0.32, r * 0.14);
    x.closePath();
    x.fill();
    x.stroke();
    x.strokeStyle = charging ? 'rgba(255,255,255,0.9)' : 'rgba(125,255,232,0.55)';
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(-r * 0.16, -r * 0.24);
    x.lineTo(r * 0.16, r * 0.02);
    x.moveTo(r * 0.14, -r * 0.26);
    x.lineTo(-r * 0.12, r * 0.12);
    x.stroke();
    x.restore();
  }

  x.restore();

  // 破片環的前半：畫在最上層，破片才會從斗篷前面經過。
  orbit(false);

  // charging：能量往中央裂縫收束 + 下襬被往上吸起。往內、往上是「蓄力」最不會被誤讀的
  // 方向；向外炸開的特效留給命中，蓄力階段不該看起來已經打出去了。
  if (charging) {
    for (let i = 0; i < 6; i++) {
      const a = spin * 1.6 + (i / 6) * Math.PI * 2;
      const f = (t * 2 + i / 6) % 1;
      const x0 = Math.cos(a) * orbitR * 0.9;
      const y0 = -r * 0.08 + Math.sin(a) * r * 0.5 + drift;
      x.strokeStyle = `rgba(190,255,242,${0.55 * (1 - f)})`;
      x.lineWidth = 1.8;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x0 * (1 - f * 0.9), y0 + (r * 0.1 - y0) * f * 0.9);
      x.stroke();
    }
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


// 深淵無盡戰專屬裝飾：虛空晶簇與破碎方尖碑。
// 原本無盡關的 decor 沿用 ['lava_crack','gear','radar'] —— 把雪地雷達碟擺在
// 虛空星盤上，整關讀起來像「別關剩下的素材」。
function drawVoidCrystal(x) {
  shadow(x, 14, 12);
  const shard = (dx, hgt, wdt, alpha) => {
    const g = x.createLinearGradient(0, -hgt, 0, 12);
    g.addColorStop(0, `rgba(215,180,255,${alpha})`);
    g.addColorStop(1, 'rgba(70,30,120,0.9)');
    x.fillStyle = g;
    x.strokeStyle = 'rgba(200,160,255,0.55)';
    x.lineWidth = 1.3;
    x.beginPath();
    x.moveTo(dx, -hgt);
    x.lineTo(dx + wdt, 10);
    x.lineTo(dx - wdt, 10);
    x.closePath();
    x.fill();
    x.stroke();
  };
  shard(-9, 26, 7, 0.75);
  shard(2, 36, 9, 0.9);
  shard(12, 20, 6, 0.6);
  x.fillStyle = 'rgba(180,120,255,0.25)';
  x.beginPath();
  x.ellipse(0, 11, 20, 6, 0, 0, Math.PI * 2);
  x.fill();
}

function drawVoidObelisk(x) {
  shadow(x, 14, 14);
  x.fillStyle = '#241a3a';
  x.strokeStyle = '#0f0a1c';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(0, -30);
  x.lineTo(9, -18);
  x.lineTo(6, 14);
  x.lineTo(-6, 14);
  x.lineTo(-9, -18);
  x.closePath();
  x.fill();
  x.stroke();
  x.strokeStyle = 'rgba(190,140,255,0.85)';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(0, -22);
  x.lineTo(0, 6);
  x.stroke();
  x.beginPath();
  x.arc(0, -8, 4, 0, Math.PI * 2);
  x.stroke();
  // 折斷滾落的一角
  x.fillStyle = '#1a1230';
  x.beginPath();
  x.moveTo(-14, 14);
  x.lineTo(-4, 10);
  x.lineTo(-6, 16);
  x.closePath();
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

function drawHound(x, t, r) {
  const p = t * Math.PI * 2;
  const stride = Math.sin(p) * 3;
  shadow(x, r * 1.0, r * 0.85);

  // 四腿交替奔跑
  x.strokeStyle = '#4a2410';
  x.lineWidth = 3;
  x.lineCap = 'round';
  for (const s of [-1, 1]) {
    x.beginPath(); x.moveTo(s * r * 0.25, r * 0.5); x.lineTo(s * r * 0.2 + stride, r * 0.95); x.stroke();
    x.beginPath(); x.moveTo(s * r * 0.6, r * 0.45); x.lineTo(s * r * 0.55 - stride, r * 0.95); x.stroke();
  }

  x.save();
  x.rotate(Math.sin(p) * 0.05);

  // 尾巴 (斜翹)
  x.strokeStyle = '#5f3a1c';
  x.lineWidth = 2.4;
  x.beginPath(); x.moveTo(-r * 0.8, 0); x.quadraticCurveTo(-r * 1.2, -r * 0.5, -r * 0.9, -r * 0.85); x.stroke();
  x.fillStyle = '#c0804a';
  x.beginPath(); x.arc(-r * 0.9, -r * 0.85, 2.6, 0, Math.PI * 2); x.fill();

  // 身體 (俯衝姿態)
  x.fillStyle = sphere(x, '#b0753b', r * 1.0, -r * 0.1, r * 0.05);
  x.beginPath(); x.ellipse(-r * 0.1, r * 0.05, r * 0.95, r * 0.6, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(35,18,4,0.8)';
  x.lineWidth = 2;
  x.stroke();

  // 頭部 (朝右) + 吻部
  x.fillStyle = sphere(x, '#c0804a', r * 0.62, r * 0.55, -r * 0.35);
  x.beginPath(); x.arc(r * 0.55, -r * 0.35, r * 0.58, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(35,18,4,0.7)';
  x.lineWidth = 1.8;
  x.stroke();
  x.fillStyle = '#3a1e0a';
  x.beginPath();
  x.moveTo(r * 0.45, -r * 0.55);
  x.lineTo(r * 1.05, -r * 0.15);
  x.lineTo(r * 0.45, -r * 0.05);
  x.closePath();
  x.fill();

  // 豎耳
  x.fillStyle = '#4a2410';
  x.beginPath(); x.moveTo(r * 0.4, -r * 0.75); x.lineTo(r * 0.2, -r * 1.25); x.lineTo(r * 0.1, -r * 0.55); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(r * 0.68, -r * 0.7); x.lineTo(r * 0.85, -r * 1.15); x.lineTo(r * 0.88, -r * 0.5); x.closePath(); x.fill();

  // 兇紅眼 + 滴涎
  const eg = x.createRadialGradient(r * 0.62, -r * 0.4, 0, r * 0.62, -r * 0.4, r * 0.55);
  eg.addColorStop(0, 'rgba(255,46,46,0.5)');
  eg.addColorStop(1, 'rgba(255,46,46,0)');
  x.fillStyle = eg;
  x.beginPath(); x.arc(r * 0.62, -r * 0.4, r * 0.55, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ff2e2e';
  x.beginPath(); x.arc(r * 0.62, -r * 0.4, 2.4, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#ff5a5a';
  x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(r * 0.8, -r * 0.12); x.lineTo(r * 0.97, -r * 0.3); x.stroke();
  x.restore();
}

function drawHatcher(x, t, r) {
  const p = t * Math.PI * 2;
  const pulse = 1 + Math.sin(p) * 0.06;
  shadow(x, r * 0.85, r * 0.95);

  x.save();
  x.scale(pulse, pulse);

  // 主囊體 (潮濕肉膜)
  x.fillStyle = sphere(x, '#d5547f', r);
  x.beginPath();
  x.arc(0, 0, r, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(60,10,30,0.8)';
  x.lineWidth = 2.5;
  x.stroke();

  // 分葉縫隙
  x.strokeStyle = 'rgba(90,25,45,0.5)';
  x.lineWidth = 1.4;
  x.beginPath(); x.arc(r * 0.45, -r * 0.3, r * 0.78, 0.4, Math.PI * 1.2); x.stroke();
  x.beginPath(); x.arc(-r * 0.4, r * 0.35, r * 0.72, -0.3, Math.PI * 0.8); x.stroke();

  // 內部孵化光暈 (隨孵化節奏明滅)
  const blink = 0.55 + Math.sin(p * 2) * 0.25;
  const eg = x.createRadialGradient(0, 0, 0, 0, 0, r * 0.75);
  eg.addColorStop(0, `rgba(255,200,225,${blink})`);
  eg.addColorStop(1, 'rgba(255,200,225,0)');
  x.fillStyle = eg;
  x.beginPath(); x.arc(0, 0, r * 0.8, 0, Math.PI * 2); x.fill();

  // 半成型幼體輪廓
  x.fillStyle = '#6db8d8';
  x.beginPath(); x.arc(-r * 0.18, r * 0.14, r * 0.2, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(r * 0.22, -r * 0.22, r * 0.16, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#3b7d99';
  x.beginPath(); x.arc(-r * 0.18, r * 0.14, r * 0.08, 0, Math.PI * 2); x.fill();

  // 底部繃帶臍帶
  x.strokeStyle = 'rgba(80,20,40,0.85)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-r * 0.6, r * 0.6);
  x.quadraticCurveTo(0, r * 1.05, r * 0.55, r * 0.72);
  x.stroke();
  x.restore();
}

function drawChimera(x, t, r) {
  const p = t * Math.PI * 2;
  const step = Math.sin(p) * 2.5;
  shadow(x, r * 1.05, r * 1.0);

  // 鋼柱雙腿 (踏步)
  x.strokeStyle = '#2e2e33';
  x.lineWidth = 5;
  x.lineCap = 'round';
  for (const s of [-1, 1]) {
    x.beginPath(); x.moveTo(s * r * 0.55, r * 0.45); x.lineTo(s * r * 0.5 + step, r * 0.98); x.stroke();
    x.beginPath(); x.moveTo(s * r * 0.15, r * 0.5); x.lineTo(s * r * 0.12 - step, r * 0.98); x.stroke();
  }

  // 裝甲身軀 (金屬漸層)
  const g = x.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#9a9aa0');
  g.addColorStop(0.5, '#717179');
  g.addColorStop(1, '#47474d');
  x.fillStyle = g;
  x.beginPath();
  x.roundRect(-r, -r * 0.72, r * 2, r * 1.64, 10);
  x.fill();
  x.strokeStyle = '#232327';
  x.lineWidth = 3;
  x.stroke();

  // 胸口裝甲板縫 + 鉚釘
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.lineWidth = 2;
  x.beginPath(); x.moveTo(-r * 0.85, r * 0.28); x.lineTo(r * 0.85, r * 0.28); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.3)';
  for (const s of [-1, 1]) {
    for (const yy of [-0.55, 0.5]) {
      x.beginPath(); x.arc(s * r * 0.78, yy * r, 1.7, 0, Math.PI * 2); x.fill();
    }
  }

  // 小型頭部 + 暴怒紅瞳
  x.fillStyle = sphere(x, '#5f5f66', r * 0.45, r * 0.7, -r * 0.55);
  x.beginPath(); x.arc(r * 0.7, -r * 0.55, r * 0.45, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#1c1c20';
  x.lineWidth = 2;
  x.stroke();
  const eg = x.createRadialGradient(r * 0.78, -r * 0.55, 0, r * 0.78, -r * 0.55, r * 0.4);
  eg.addColorStop(0, 'rgba(255,60,20,0.55)');
  eg.addColorStop(1, 'rgba(255,60,20,0)');
  x.fillStyle = eg;
  x.beginPath(); x.arc(r * 0.78, -r * 0.55, r * 0.4, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ff4a1f';
  x.beginPath(); x.arc(r * 0.78, -r * 0.55, 3, 0, Math.PI * 2); x.fill();

  // 背部肩砲 (黑管)
  x.fillStyle = '#2b2b30';
  x.beginPath(); x.roundRect(-r * 0.75, -r * 1.15, r * 0.9, r * 0.5, 4); x.fill();
  x.strokeStyle = '#101014';
  x.lineWidth = 2;
  x.stroke();
  x.fillStyle = 'rgba(255,120,0,0.9)';
  x.beginPath(); x.arc(-r * 0.3, -r * 0.9, 2.6, 0, Math.PI * 2); x.fill();
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
  mechanic: { w: 68, h: 64, fn: (x, t) => drawMechanicDuck(x, t) },
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
  hound:      { w: 68, h: 52, fn: (x, t) => drawHound(x, t, 13) },
  hatcher:    { w: 72, h: 66, fn: (x, t) => drawHatcher(x, t, 24) },
  chimera:    { w: 98, h: 88, fn: (x, t) => drawChimera(x, t, 30) },
  // 新怪沿用既有畫法換色 (canvas filter 只在烘焙時跑一次)
  sniper:  { w: 68, h: 58, fn: (x, t) => { x.filter = 'hue-rotate(150deg)'; drawSpitter(x, t, 15); } },
  medic:   { w: 56, h: 52, fn: (x, t) => { x.filter = 'hue-rotate(200deg) saturate(1.4)'; drawWalker(x, t, 14); } },
  blinker: { w: 60, h: 48, fn: (x, t) => { x.filter = 'hue-rotate(110deg) brightness(1.2)'; drawBat(x, t, 11); } },
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
  void_crystal: { w: 44, h: 52, static: true, fn: drawVoidCrystal },
  void_obelisk: { w: 40, h: 52, static: true, fn: drawVoidObelisk },
};

// 關卡主題 Boss：10 主題 × (一般/最終) × (待機/衝鋒)，尺寸與半徑照最終形放大
for (const [theme, fn] of Object.entries({
  street: drawBossStreet, lab: drawBossLab, frost: drawBossFrost, core: drawBossCore,
  subway: drawBossSubway, swamp: drawBossSwamp, storm: drawBossStorm,
  foundry: drawBossFoundry, frostvoid: drawBossFrostvoid, voidroad: drawBossVoidroad,
})) {
  for (const [suffix, size, r, final] of [['', 172, 40, false], ['_final', 208, 50, true]]) {
    for (const charging of [false, true]) {
      BUILDERS[`boss_${theme}${suffix}${charging ? '_charging' : ''}`] =
        { w: size, h: size, fn: (x, t) => fn(x, t, r, charging, final) };
    }
  }
}

// 查詢 sprite key 是否真的存在。getSprite 對未知 key 會靜默退回 walker，
// 裝飾物 key 打錯就會在場景裡畫出一隻殭屍而完全沒有錯誤訊息 —— 這個查詢讓
// Decor 能在啟動時濾掉打錯的 key 並警告。
export function hasSprite(key) {
  if (BUILDERS[key]) return true;
  const m = String(key).match(/^(.+):v[0-2]$/);
  return !!(m && BUILDERS[m[1]]);
}

// 取得某角色的 sprite 組 (首次呼叫才烘焙，之後直接命中快取)
// 支援 `${type}:v0/1/2` 尺寸變體：群體雜兵會依 spawn 時抽到的變體烘焙出
// 0.95× / 1.07× 的大小版本，成群時看起來更有變化，且完全不增加每幀成本。
export function getSprite(key) {
  let s = cache.get(key);
  if (s) return s;

  const m = key.match(/^(.+):v([0-2])$/);
  const b = BUILDERS[key] || (m && BUILDERS[m[1]]) || BUILDERS.walker;
  const scale = m ? ({ 0: 1, 1: 0.95, 2: 1.07 })[m[2]] : 1;
  const count = b.static ? 1 : FRAMES;
  const w = b.w * scale;
  const h = b.h * scale;
  const frames = [];
  // 材質層的 accent 與暫存畫布：同一顆 sprite 的所有 frame 共用（只配置一次）
  const accent = accentFor(key, b);
  const cw = Math.round(w * SS);
  const ch = Math.round(h * SS);
  const sil = accent ? scratchCanvas(cw, ch) : null;
  const rim = accent ? scratchCanvas(cw, ch) : null;
  for (let i = 0; i < count; i++) {
    // 畫布跟著一起放大，否則放大變體的四肢會被裁掉
    const frame = make(w, h, (x) => {
      if (scale !== 1) x.scale(scale, scale);
      b.fn(x, i / FRAMES);
    });
    if (accent) materialize(frame, accent, sil, rim);
    frames.push(frame);
  }
  s = { frames, flash: b.static ? frames : frames.map(whiten), w, h };
  cache.set(key, s);
  return s;
}

// 把 sprite 畫到畫布中心點 (sx, sy)
export function blit(ctx, sprite, frameIndex, sx, sy, useFlash = false) {
  const list = useFlash ? sprite.flash : sprite.frames;
  const img = list[frameIndex % list.length];
  ctx.drawImage(img, sx - sprite.w / 2, sy - sprite.h / 2, sprite.w, sprite.h);
}
