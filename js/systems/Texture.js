// 程序化材質工具箱。
//
// 為什麼需要這一層：原本的地表質感是「雜湊決定位置 → 畫一顆徑向漸層汙漬」加上
// 「白雜訊小圓點」，看起來是色紙而不是材質 —— 沒有低頻的團塊、沒有方向光造成的
// 立體感、顆粒也沒有明暗兩面。這裡提供三件事：
//
//   1. 可平鋪的數值雜訊 (periodic value noise) 與 fBm：格點取模，因此紋理磚的
//      右緣與下一張的左緣完全接得上。原本若直接用世界座標雜訊，高頻細節會在
//      磚界被切斷 —— 軟性漸層看不出來，但雜訊會變成一條明顯的直線。
//   2. 方向光浮雕：亮面固定來自左上、暗面在右下，讓顆粒、鉚釘、板塊、裂縫
//      讀起來有厚度。這是「材質感」與「塗色」的分界線。
//   3. 材質專用的筆觸：骨材高光、刷紋、雪堆起伏、玄武岩板塊、星雲。

// ── 可平鋪數值雜訊 ────────────────────────────────────────────
// period：格點週期（整數）。取樣時 x/y 直接以「格」為單位，內部對 period 取模。
export function makePeriodicNoise(seed = 0, period = 8) {
  const hash = (x, y) => {
    const xi = ((x % period) + period) % period;
    const yi = ((y % period) + period) % period;
    let h = Math.imul(xi | 0, 374761393) ^ Math.imul(yi | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 15), 1274126177);
    h ^= h >>> 13;
    h = Math.imul(h, 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);   // smoothstep：避免格線狀的稜角
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

// fBm：多層雜訊疊加。每一層的週期都要跟著頻率倍增，否則只有第一層可平鋪。
export function makeFbm(seed = 0, period = 8, octaves = 4, lacunarity = 2, gain = 0.5) {
  const layers = [];
  let p = period;
  for (let i = 0; i < octaves; i++) {
    layers.push({ noise: makePeriodicNoise(seed + i * 977, p), amp: Math.pow(gain, i) });
    p *= lacunarity;
  }
  const norm = layers.reduce((s, l) => s + l.amp, 0);
  return (x, y) => {
    let sum = 0;
    for (const l of layers) sum += l.noise(x, y) * l.amp;
    return sum / norm;   // 0..1
  };
}

// ── 方向光浮雕 ────────────────────────────────────────────────
// 光固定來自左上方 (與地圖格線、暗角的方向一致)，讓所有材質的受光方向統一。
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// 帶方向光的顆粒：亮側 + 暗側，看起來是凸起而不是貼紙。
// rgb：基色 (r,g,b 字串)；radius：半徑；lift：凸起高度 (0~1，越高明暗越強)
export function reliefDot(ctx, x, y, radius, rgb, alpha = 1, lift = 1) {
  const lx = x + LIGHT_X * radius * 0.42 * lift;
  const ly = y + LIGHT_Y * radius * 0.42 * lift;
  const g = ctx.createRadialGradient(lx, ly, radius * 0.05, x, y, radius);
  g.addColorStop(0, `rgba(255,255,255,${(0.5 * alpha * lift).toFixed(3)})`);
  g.addColorStop(0.45, `rgba(${rgb},${alpha.toFixed(3)})`);
  g.addColorStop(1, `rgba(0,0,0,${(0.34 * alpha * lift).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// 斜面：把一個矩形畫成有厚度的一塊 (左上打亮、右下壓暗)。
export function bevelRect(ctx, x, y, w, h, lightAlpha = 0.10, darkAlpha = 0.28, lineWidth = 1.6) {
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = `rgba(255,255,255,${lightAlpha})`;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(0,0,0,${darkAlpha})`;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

// 裂縫：沿著折線畫「暗色溝槽 + 受光下緣」，比單一深色線更像地面的裂。
export function reliefCrack(ctx, pts, width = 1.6, depth = 0.5) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  // 暗色溝槽
  ctx.strokeStyle = `rgba(0,0,0,${(0.45 * depth + 0.12).toFixed(3)})`;
  ctx.lineWidth = width * 1.9;
  ctx.stroke();
  // 上緣受光 (往光源方向偏 1px)
  ctx.strokeStyle = `rgba(255,255,255,${(0.10 * depth).toFixed(3)})`;
  ctx.lineWidth = width * 0.7;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + LIGHT_X, pts[0][1] + LIGHT_Y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + LIGHT_X, pts[i][1] + LIGHT_Y);
  ctx.stroke();
}

// 星點：中心亮點 + 十字星芒 (深淵關的星空用)
export function starPoint(ctx, x, y, size, alpha = 0.9, spikes = true) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.45, 0, Math.PI * 2);
  ctx.fill();
  if (!spikes || size < 1.6) return;
  ctx.strokeStyle = `rgba(220,215,255,${(alpha * 0.5).toFixed(3)})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - size * 1.8, y);
  ctx.lineTo(x + size * 1.8, y);
  ctx.moveTo(x, y - size * 1.8);
  ctx.lineTo(x, y + size * 1.8);
  ctx.stroke();
}
