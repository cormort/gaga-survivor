// 場景裝飾散佈：用世界座標的雜湊決定每個格子放什麼，不存任何狀態、不做配置，
// 相機移動時裝飾永遠貼在同一個世界位置。
//
// 密度與聚落由關卡資料決定 (level.decorDensity)，引擎不再寫死 —— 原本五關共用
// 同一組 CELL/DENSITY，裝飾只是「每格撒一個、換 sprite」，逛起來每關都一樣。

import { getSprite, hasSprite } from '../sprites.js';

const CELL = 240;          // 每格最多一個裝飾物 (聚落時會多放 2 個)
const DENSITY = 0.45;      // 有裝飾物的格子比例 (預設值，可被關卡覆寫)
const CLUSTER = 0.78;      // 高於此雜湊值的格子改成放一整排同款裝飾

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

// 過濾掉不存在的 sprite key。getSprite 對未知 key 會靜默退回 walker，
// 打錯字的裝飾物會在場景裡畫出一隻殭屍卻不報錯；這裡在第一次使用時就攔下來。
const setCache = new Map();
const warned = new Set();

function decorSet(level) {
  const id = (level && level.id) || 'street';
  const cached = setCache.get(id);
  if (cached) return cached;
  const out = [];
  for (const k of level.decor || []) {
    if (hasSprite(k)) out.push(k);
    else if (!warned.has(k)) {
      warned.add(k);
      console.warn(`[Decor] 關卡 ${id} 的裝飾 sprite key 不存在，已略過：${k}`);
    }
  }
  setCache.set(id, out);
  return out;
}

export function drawDecor(ctx, camera, level, vw, vh) {
  const set = decorSet(level);
  if (!set || set.length === 0) return;

  const density = level.decorDensity != null ? level.decorDensity : DENSITY;
  const x0 = Math.floor(camera.x / CELL) - 1;
  const x1 = Math.floor((camera.x + vw) / CELL) + 1;
  const y0 = Math.floor(camera.y / CELL) - 1;
  const y1 = Math.floor((camera.y + vh) / CELL) + 1;

  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      if (hash(cx, cy) > density) continue;

      const kind = set[Math.floor(hash(cx, cy, 1) * set.length) % set.length];
      const sp = getSprite(kind);

      const wx = cx * CELL + hash(cx, cy, 2) * (CELL - 60) + 30;
      const wy = cy * CELL + hash(cx, cy, 3) * (CELL - 60) + 30;
      const sx = wx - camera.x;
      const sy = wy - camera.y;
      if (sx < -80 || sx > vw + 80 || sy < -80 || sy > vh + 80) continue;

      // 稍微變化大小、左右翻轉與些微角度，避免看起來是複製貼上
      const scale = 0.75 + hash(cx, cy, 4) * 0.5;
      const flip = hash(cx, cy, 5) > 0.5 ? -1 : 1;
      const tilt = (hash(cx, cy, 7) - 0.5) * 0.3;

      // 聚落：一部分格子放一整排同款 (停車列、垃圾桶排、補給堆)，
      // 讓裝飾在空間上有「成組」的讀法，而不是均勻撒點。
      const clustered = hash(cx, cy, 6) > CLUSTER;
      const rowN = clustered ? 3 : 1;
      const rowA = hash(cx, cy, 8) * Math.PI * 2;
      const rowGap = 44 + hash(cx, cy, 9) * 16;

      for (let i = 0; i < rowN; i++) {
        const ox = Math.cos(rowA) * rowGap * (i - (rowN - 1) / 2);
        const oy = Math.sin(rowA) * rowGap * (i - (rowN - 1) / 2);
        const px = sx + ox;
        const py = sy + oy;
        if (px < -80 || px > vw + 80 || py < -80 || py > vh + 80) continue;

        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.translate(px, py);
        ctx.rotate(tilt);
        ctx.scale(flip * scale, scale);
        ctx.drawImage(sp.frames[0], -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        ctx.restore();
      }
    }
  }
}
