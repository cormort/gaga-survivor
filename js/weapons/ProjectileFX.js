// 投射物的光暈與拖尾貼圖快取。
//
// 為什麼要快取：Projectile.draw 是「每幀 × 每發」都會跑的路徑。先前在裡面用
// createRadialGradient / createLinearGradient 現建漸層（等於一發一幀一張漸層物件）
// 是一次被修掉的效能坑，所以這裡改成：光暈與拖尾各依顏色烘焙一張小貼圖，
// 之後只做 drawImage + 旋轉縮放 —— 有漸層的畫質，沒有每幀的漸層成本。
//
// 顏色來源全部是 config/characters 裡的 hex 字串，因此可以直接用字串當快取鍵。

const glowCache = new Map();
const streakCache = new Map();

// '#rrggbb' + alpha → 'rgba(r,g,b,a)'
function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 光暈：中間白熱、外圈是武器主色、最外透明
export function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  const S = 64;
  c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, rgba('#ffffff', 0.9));
  g.addColorStop(0.22, rgba(color, 0.72));
  g.addColorStop(0.55, rgba(color, 0.26));
  g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  glowCache.set(color, c);
  return c;
}

// 拖尾：頭端 (x=右) 亮、尾端 (x=左) 透明，並用垂直遮罩修成兩端收窄的緞帶
export function streakSprite(color) {
  let c = streakCache.get(color);
  if (c) return c;
  const W = 64;
  const H = 16;
  c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.55, rgba(color, 0.30));
  g.addColorStop(0.86, rgba(color, 0.85));
  g.addColorStop(1, rgba('#ffffff', 0.95));
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  // 垂直遮罩：讓緞帶中間厚、上下邊緣淡出，看起來才像速度殘影而不是色塊
  const m = x.createLinearGradient(0, 0, 0, H);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(0.5, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = m;
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';

  streakCache.set(color, c);
  return c;
}

// 把光暈畫在目前原點上（呼叫端已經 translate 到投射物位置）
export function drawGlow(ctx, color, radius, alpha) {
  if (alpha <= 0.01 || radius <= 0.5) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

// 拖尾：angle 為速度方向，貼圖的亮端對齊原點，往後漸淡
export function drawStreak(ctx, color, length, width, angle, alpha) {
  if (alpha <= 0.01 || length <= 2 || width <= 0.5) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.rotate(angle);
  ctx.drawImage(streakSprite(color), -length, -width / 2, length, width);
  ctx.restore();
}

// 供工具與測試查快取狀態（不影響遊戲路徑）
export function fxCacheSize() {
  return glowCache.size + streakCache.size;
}
