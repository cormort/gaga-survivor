// 場景裝飾散佈：用世界座標的雜湊決定每個格子放什麼，不存任何狀態、不做配置，
// 相機移動時裝飾永遠貼在同一個世界位置。

import { getSprite } from '../sprites.js';

const CELL = 240;      // 每格最多一個裝飾物
const DENSITY = 0.45;  // 有裝飾物的格子比例

// 兩個整數 → [0,1) 的穩定亂數。
// 必須用 Math.imul 並在每步 >>> 0：直接用 * 會超出 32 位元、低位被浮點截掉，
// 分佈會嚴重偏斜 (實測密度 0.45 變成 0.90，三種裝飾物有一種永遠抽不到)。
function hash(x, y, salt = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 15), 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function drawDecor(ctx, camera, level, vw, vh) {
  const set = level.decor;
  if (!set || set.length === 0) return;

  const x0 = Math.floor(camera.x / CELL) - 1;
  const x1 = Math.floor((camera.x + vw) / CELL) + 1;
  const y0 = Math.floor(camera.y / CELL) - 1;
  const y1 = Math.floor((camera.y + vh) / CELL) + 1;

  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      if (hash(cx, cy) > DENSITY) continue;

      const kind = set[Math.floor(hash(cx, cy, 1) * set.length) % set.length];
      const sp = getSprite(kind);

      const wx = cx * CELL + hash(cx, cy, 2) * (CELL - 60) + 30;
      const wy = cy * CELL + hash(cx, cy, 3) * (CELL - 60) + 30;
      const sx = wx - camera.x;
      const sy = wy - camera.y;
      if (sx < -80 || sx > vw + 80 || sy < -80 || sy > vh + 80) continue;

      // 稍微變化大小與左右翻轉，避免看起來是複製貼上
      const scale = 0.75 + hash(cx, cy, 4) * 0.5;
      const flip = hash(cx, cy, 5) > 0.5 ? -1 : 1;

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(sx, sy);
      ctx.scale(flip * scale, scale);
      ctx.drawImage(sp.frames[0], -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      ctx.restore();
    }
  }
}
