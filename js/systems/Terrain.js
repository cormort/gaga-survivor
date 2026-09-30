// 宏觀地形層 (macro terrain)。
//
// 為什麼需要這一層：原本每一關只有「一片 768×768 的無接縫紋理磚無限平鋪」，
// 磚裡的汙漬/裂紋/微粒對五關是統計上同一張圖 (同一個雜湊、同一組密度常數)，
// 而且地圖上沒有任何宏觀結構 —— 玩家沒有任何參照點可以說出「我在哪一側」，
// 於是 8 分鐘走下來整張圖看起來一模一樣。這不是美術量不足，是缺少「大尺度」。
//
// 這一層補上三件事，全部世界錨定、全部資料驅動 (levels.js 的 theme.ground.macro)：
//   1. 宏觀結構：道路 / 金屬板塊 / 冰原 / 岩漿渠道 / 虛空裂縫，尺度 700~1200 世界單位
//   2. 大型地標：每關 2 種，每 ~1200 單位出現一次，讓地圖有「地方」可言
//   3. 隨時間劣化：開局乾淨、越接近終局地面越裂越亮 (escalate)，8 分鐘有推進感
//
// 效能策略：宏觀結構烘成一塊可無縫拼接的 1/3 縮尺地形磚 (約 4000 世界單位 → ~1334px)，
// 無限地圖靠重複貼磚，每幀最多 4 次 drawImage；地標數量少 (每個 ~1200 單位格最多一個) 且各自烘成 sprite。
// 整層每幀固定 1~3 次繪圖呼叫，不隨場上敵人數成長。

// 世界 → 宏觀畫布的縮尺。從 4 提高到 3：整張世界烘一次的成本只多 1.8 倍記憶體
// (4000/3 ≈ 1334²)，但道路/板塊/渠道的邊緣銳利度明顯提升 (放大倍率從 4× 降到 3×)。
import { worldBounds } from '../config.js';
import { onPath } from '../tdlevels.js';
import { LevelCache } from './LevelCache.js';

const SCALE = 3;
const LANDMARK_SPRITE = new Map();   // key: `${kind}:${seed}` → canvas

// 穩定整數雜湊 (與 Decor.js 同一套手法：一定要 Math.imul + >>> 0，
// 直接用乘法會超出 32 位元、低位被浮點截掉，分佈會嚴重偏斜)
function hash(x, y, salt = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 15), 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function levelSeed(id) {
  let s = 0;
  for (let i = 0; i < (id || 'x').length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  return s;
}

const macroCache = new LevelCache();   // 宏觀地形層：每關約 2.2~2.8 MB，只留最近 3 關

// 地形磚邊長的目標值（世界單位）。實際邊長取「關卡格距的整數倍」最接近這個值的數字，
// 道路／渠道的格線才會在磚與磚的接縫處對齊。
const TILE_TARGET = 4000;

// 把宏觀結構烘成一張「可無縫重複拼接」的縮尺地形磚。每關只做一次。
//
// 為什麼要能拼接：生存者模式是無限地圖。原本整張世界（±2000）烘成一張圖，走出去就是一片空白。
// 做法：磚的邊長 P = 格距 × N；格線畫在 0..P（兩端各一條，拼起來剛好接上）；
// 每格一個的特徵（冰湖、裂縫、板塊）多畫一圈外框格，座標用 i mod N 取雜湊 ——
// 越過磚邊的特徵會在另一側以同一個雜湊續畫，接縫處看不出斷口。
function getMacroLayer(level) {
  const id = (level && level.id) || 'street';
  const cached = macroCache.get(id);
  if (cached) return cached;

  const macro = level.theme && level.theme.ground && level.theme.ground.macro;
  const cell = (macro && macro.cell) || 1000;
  const n = Math.max(2, Math.round(TILE_TARGET / cell));
  const P = n * cell;
  const w = Math.ceil(P / SCALE);
  const h = w;

  const entry = { canvas: null, w, h, P };
  if (!macro) {
    macroCache.set(id, entry);
    return entry;
  }

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const seed = levelSeed(id);
  // 磚內世界座標（0..P）→ 畫布座標
  const X = (wx) => wx / SCALE;
  const Y = (wy) => wy / SCALE;
  const S = (len) => len / SCALE;

  drawMacroKind(ctx, macro, level, seed, X, Y, S, w, h, n);

  entry.canvas = cv;
  macroCache.set(id, entry);
  return entry;
}

// 五種宏觀結構。每一種都只用到少量填色與描邊，且全部在縮尺畫布上做一次。
// n = 磚內格數；wrap(i) 讓外框格取到對面那一格的雜湊（無縫拼接的關鍵）
function drawMacroKind(ctx, macro, level, seed, X, Y, S, w, h, n) {
  const kind = macro.kind || 'none';
  const base = macro.base || 'rgba(255,255,255,0.035)';
  const line = macro.line || 'rgba(0,0,0,0.22)';
  const accent = macro.accent || 'rgba(255,255,255,0.10)';
  const wrap = (i) => ((i % n) + n) % n;
  const cell = macro.cell || 1000;
  const lines = [];
  for (let k = 0; k <= n; k++) lines.push(k * cell);
  const eachCell = (fn) => {
    for (let i = -1; i <= n; i++) {
      for (let j = -1; j <= n; j++) fn(i * cell, j * cell, wrap(i), wrap(j));
    }
  };

  if (kind === 'road') {
    // 淪陷商業街 / 虛空裂道：高質感賽博夜景街廓
    // 人行道磚、3D立體路緣石、深色瀝青路面、分道虛線、十字路口斑馬線、暖色街燈光暈與路口人孔蓋
    const roadW = cell * 0.36;
    const swW = cell * 0.10;
    const halfR = S(roadW) / 2;
    const halfTotal = halfR + S(swW);

    // 1) 人行道基底 (冷色調混凝土步道)
    ctx.fillStyle = 'rgba(28, 38, 54, 0.65)';
    for (const gx of lines) ctx.fillRect(X(gx) - halfTotal, 0, halfTotal * 2, h);
    for (const gy of lines) ctx.fillRect(0, Y(gy) - halfTotal, w, halfTotal * 2);

    // 2) 人行道地磚格紋 (每隔 48 單位一道細縫)
    ctx.strokeStyle = 'rgba(12, 16, 24, 0.45)';
    ctx.lineWidth = 1;
    const paverStep = S(48);
    for (const gx of lines) {
      const x = X(gx);
      for (let py = 0; py <= h; py += paverStep) {
        ctx.beginPath();
        ctx.moveTo(x - halfTotal, py); ctx.lineTo(x - halfR, py);
        ctx.moveTo(x + halfR, py); ctx.lineTo(x + halfTotal, py);
        ctx.stroke();
      }
    }
    for (const gy of lines) {
      const y = Y(gy);
      for (let px = 0; px <= w; px += paverStep) {
        ctx.beginPath();
        ctx.moveTo(px, y - halfTotal); ctx.lineTo(px, y - halfR);
        ctx.moveTo(px, y + halfR); ctx.lineTo(px, y + halfTotal);
        ctx.stroke();
      }
    }

    // 3) 瀝青柏油路面 (深色微粒柏油)
    ctx.fillStyle = 'rgba(14, 20, 30, 0.88)';
    for (const gx of lines) ctx.fillRect(X(gx) - halfR, 0, S(roadW), h);
    for (const gy of lines) ctx.fillRect(0, Y(gy) - halfR, w, S(roadW));

    // 4) 3D 立體路緣石 (內側暗陰影 + 外側微亮高光)
    for (const gx of lines) {
      const x = X(gx);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = Math.max(1, S(3.5));
      ctx.beginPath();
      ctx.moveTo(x - halfR + S(1.5), 0); ctx.lineTo(x - halfR + S(1.5), h);
      ctx.moveTo(x + halfR - S(1.5), 0); ctx.lineTo(x + halfR - S(1.5), h);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(190, 215, 245, 0.35)';
      ctx.lineWidth = Math.max(1, S(2));
      ctx.beginPath();
      ctx.moveTo(x - halfR - S(1), 0); ctx.lineTo(x - halfR - S(1), h);
      ctx.moveTo(x + halfR + S(1), 0); ctx.lineTo(x + halfR + S(1), h);
      ctx.stroke();
    }
    for (const gy of lines) {
      const y = Y(gy);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = Math.max(1, S(3.5));
      ctx.beginPath();
      ctx.moveTo(0, y - halfR + S(1.5)); ctx.lineTo(w, y - halfR + S(1.5));
      ctx.moveTo(0, y + halfR - S(1.5)); ctx.lineTo(w, y + halfR - S(1.5));
      ctx.stroke();

      ctx.strokeStyle = 'rgba(190, 215, 245, 0.35)';
      ctx.lineWidth = Math.max(1, S(2));
      ctx.beginPath();
      ctx.moveTo(0, y - halfR - S(1)); ctx.lineTo(w, y - halfR - S(1));
      ctx.moveTo(0, y + halfR + S(1)); ctx.lineTo(w, y + halfR + S(1));
      ctx.stroke();
    }

    // 5) 路肩白實線
    const shoulderOff = S(12);
    ctx.strokeStyle = 'rgba(220, 235, 255, 0.35)';
    ctx.lineWidth = Math.max(1, S(3));
    for (const gx of lines) {
      const x = X(gx);
      ctx.beginPath();
      ctx.moveTo(x - halfR + shoulderOff, 0); ctx.lineTo(x - halfR + shoulderOff, h);
      ctx.moveTo(x + halfR - shoulderOff, 0); ctx.lineTo(x + halfR - shoulderOff, h);
      ctx.stroke();
    }
    for (const gy of lines) {
      const y = Y(gy);
      ctx.beginPath();
      ctx.moveTo(0, y - halfR + shoulderOff); ctx.lineTo(w, y - halfR + shoulderOff);
      ctx.moveTo(0, y + halfR - shoulderOff); ctx.lineTo(w, y + halfR - shoulderOff);
      ctx.stroke();
    }

    // 6) 中央車道分道標線 (發光微粒質感)
    ctx.save();
    ctx.setLineDash([S(32), S(24)]);
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.5, S(5.5));
    ctx.shadowColor = accent;
    ctx.shadowBlur = S(8);
    for (const gx of lines) {
      const x = X(gx);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (const gy of lines) {
      const y = Y(gy);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();

    // 7) 十字路口：斑馬線 + 停止線 + 街角路燈暖光 + 中央人孔蓋
    for (const gx of lines) {
      for (const gy of lines) {
        const cx = X(gx);
        const cy = Y(gy);

        // A. 街角環境光暈 (4 個街角的路燈照射出溫暖柔光)
        const cornerOff = halfR + S(swW * 0.5);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const lx = cx + dx * cornerOff;
          const ly = cy + dy * cornerOff;
          const rg = ctx.createRadialGradient(lx, ly, 0, lx, ly, S(140));
          rg.addColorStop(0, 'rgba(255, 195, 100, 0.16)');
          rg.addColorStop(0.5, 'rgba(255, 180, 80, 0.06)');
          rg.addColorStop(1, 'rgba(255, 180, 80, 0)');
          ctx.fillStyle = rg;
          ctx.fillRect(lx - S(140), ly - S(140), S(280), S(280));
        }

        // B. 斑馬線 (四方向條紋)
        const stripeW = S(8);
        const stripeGap = S(7);
        const crosswalkDist = halfR + S(16);
        const crosswalkLen = S(32);
        ctx.fillStyle = 'rgba(240, 246, 255, 0.72)';

        for (let s = -3; s <= 3; s++) {
          const sx = cx + s * (stripeW + stripeGap) - stripeW / 2;
          ctx.fillRect(sx, cy - crosswalkDist - crosswalkLen, stripeW, crosswalkLen);
          ctx.fillRect(sx, cy + crosswalkDist, stripeW, crosswalkLen);
        }
        for (let s = -3; s <= 3; s++) {
          const sy = cy + s * (stripeW + stripeGap) - stripeW / 2;
          ctx.fillRect(cx - crosswalkDist - crosswalkLen, sy, crosswalkLen, stripeW);
          ctx.fillRect(cx + crosswalkDist, sy, crosswalkLen, stripeW);
        }

        // C. 停止線 (Stop line)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = Math.max(1.5, S(5));
        const stopSpan = halfR - shoulderOff;
        ctx.beginPath();
        ctx.moveTo(cx - stopSpan, cy - crosswalkDist - crosswalkLen - S(10));
        ctx.lineTo(cx + stopSpan, cy - crosswalkDist - crosswalkLen - S(10));
        ctx.moveTo(cx - stopSpan, cy + crosswalkDist + crosswalkLen + S(10));
        ctx.lineTo(cx + stopSpan, cy + crosswalkDist + crosswalkLen + S(10));
        ctx.moveTo(cx - crosswalkDist - crosswalkLen - S(10), cy - stopSpan);
        ctx.lineTo(cx - crosswalkDist - crosswalkLen - S(10), cy + stopSpan);
        ctx.moveTo(cx + crosswalkDist + crosswalkLen + S(10), cy - stopSpan);
        ctx.lineTo(cx + crosswalkDist + crosswalkLen + S(10), cy + stopSpan);
        ctx.stroke();

        // D. 路口中央人孔蓋
        ctx.fillStyle = 'rgba(26, 32, 42, 0.85)';
        ctx.beginPath(); ctx.arc(cx, cy, S(20), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(180, 195, 215, 0.4)';
        ctx.lineWidth = Math.max(1, S(2.5));
        ctx.beginPath(); ctx.arc(cx, cy, S(16), 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = Math.max(1, S(2));
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * S(6), cy + Math.sin(ang) * S(6));
          ctx.lineTo(cx + Math.cos(ang) * S(15), cy + Math.sin(ang) * S(15));
          ctx.stroke();
        }
      }
    }
  } else if (kind === 'plates') {
    // 廢棄生化實驗室/沙暴要塞/熔毀鑄造廠：工業高科技裝甲金屬地板
    eachCell((gx, gy, gi, gj) => {
      const r = hash(gi, gj, seed + 7);
      const px = X(gx) + 1;
      const py = Y(gy) + 1;
      const pw = S(cell) - 2;
      const ph = S(cell) - 2;

      // 1) 裝甲主鋼板：細微金屬漸層
      const pg = ctx.createLinearGradient(px, py, px + pw, py + ph);
      pg.addColorStop(0, r > 0.5 ? 'rgba(38, 52, 45, 0.45)' : 'rgba(24, 34, 30, 0.5)');
      pg.addColorStop(0.5, r > 0.5 ? 'rgba(48, 66, 56, 0.55)' : 'rgba(30, 42, 36, 0.6)');
      pg.addColorStop(1, r > 0.5 ? 'rgba(28, 40, 34, 0.45)' : 'rgba(18, 26, 22, 0.5)');
      ctx.fillStyle = pg;
      ctx.fillRect(px, py, pw, ph);

      // 2) 接縫與內嵌邊框
      ctx.strokeStyle = line;
      ctx.lineWidth = Math.max(1, S(5));
      ctx.strokeRect(px, py, pw, ph);

      const inset = S(26);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = Math.max(1, S(2));
      ctx.strokeRect(px + inset, py + inset, pw - inset * 2, ph - inset * 2);
      ctx.strokeStyle = 'rgba(180, 255, 220, 0.12)';
      ctx.strokeRect(px + inset + 1, py + inset + 1, pw - inset * 2, ph - inset * 2);

      // 3) 四角工業鉚釘
      const boltOff = S(14);
      const boltR = Math.max(1.8, S(4));
      for (const [bx, by] of [
        [px + boltOff, py + boltOff],
        [px + pw - boltOff, py + boltOff],
        [px + boltOff, py + ph - boltOff],
        [px + pw - boltOff, py + ph - boltOff]
      ]) {
        ctx.fillStyle = 'rgba(180, 230, 210, 0.55)';
        ctx.beginPath(); ctx.arc(bx - 0.5, by - 0.5, boltR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(10, 16, 12, 0.8)';
        ctx.beginPath(); ctx.arc(bx + 0.7, by + 0.7, boltR * 0.75, 0, Math.PI * 2); ctx.fill();
      }

      // 4) 黃黑危險警戒斜線 (Hazard Stripes)
      if (r > 0.65) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(px + S(8), py + S(8), pw - S(16), S(14));
        ctx.clip();
        ctx.fillStyle = '#1c1b18';
        ctx.fillRect(px + S(8), py + S(8), pw - S(16), S(14));
        ctx.fillStyle = '#ffbe1a';
        for (let st = -S(20); st < pw; st += S(22)) {
          ctx.beginPath();
          ctx.moveTo(px + S(8) + st, py + S(8) + S(14));
          ctx.lineTo(px + S(8) + st + S(12), py + S(8));
          ctx.lineTo(px + S(8) + st + S(22), py + S(8));
          ctx.lineTo(px + S(8) + st + S(10), py + S(8) + S(14));
          ctx.fill();
        }
        ctx.restore();
      }

      // 5) 工業散熱通風格柵 (Cooling Grate)
      if (r < 0.28) {
        const gw = S(cell * 0.36);
        const gh = S(cell * 0.26);
        const gx0 = px + (pw - gw) / 2;
        const gy0 = py + (ph - gh) / 2;
        ctx.fillStyle = 'rgba(8, 14, 11, 0.9)';
        ctx.fillRect(gx0, gy0, gw, gh);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = Math.max(1, S(3));
        const slats = 7;
        for (let k = 0; k < slats; k++) {
          const sy = gy0 + (k + 0.5) * (gh / slats);
          ctx.beginPath(); ctx.moveTo(gx0 + S(4), sy); ctx.lineTo(gx0 + gw - S(4), sy); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(160, 240, 200, 0.25)';
        ctx.lineWidth = Math.max(1, S(1.5));
        ctx.strokeRect(gx0, gy0, gw, gh);
      }

      // 6) 圓形艙位標記與發光管線
      if (r >= 0.28 && r < 0.5) {
        const cx = px + pw / 2;
        const cy = py + ph / 2;
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.5, S(5));
        ctx.beginPath(); ctx.arc(cx, cy, S(cell * 0.25), 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = Math.max(1, S(2));
        ctx.beginPath(); ctx.arc(cx, cy, S(cell * 0.18), 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1, S(2.5));
        for (let a = 0; a < 4; a++) {
          const ang = (a / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * S(cell * 0.14), cy + Math.sin(ang) * S(cell * 0.14));
          ctx.lineTo(cx + Math.cos(ang) * S(cell * 0.28), cy + Math.sin(ang) * S(cell * 0.28));
          ctx.stroke();
        }
      }
    });
  } else if (kind === 'icefield') {
    // 極寒暴風雪基地 / 霜封虛空：晶瑩凍土與深邃冰河
    eachCell((gx, gy, i, j) => {
      const r = hash(i, j, seed + 13);
      if (r <= 0.40) return;
      const cx = X(gx + cell * (0.3 + hash(i, j, seed + 1) * 0.4));
      const cy = Y(gy + cell * (0.3 + hash(i, j, seed + 2) * 0.4));
      const rad = S(cell * (0.32 + r * 0.28));

      // 1) 冰湖外圍白霜暈染
      const fg = ctx.createRadialGradient(cx, cy, rad * 0.6, cx, cy, rad * 1.25);
      fg.addColorStop(0, 'rgba(190, 235, 255, 0.28)');
      fg.addColorStop(0.7, 'rgba(160, 220, 255, 0.12)');
      fg.addColorStop(1, 'rgba(160, 220, 255, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(cx, cy, rad * 1.25, 0, Math.PI * 2); ctx.fill();

      // 2) 晶瑩冰原基底 (深藍冷凝色)
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad, rad * 0.74, r * Math.PI, 0, Math.PI * 2);
      ctx.fill();

      // 3) 冰裂紋 (放射狀深邃裂隙，帶有發光冰藍邊緣)
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.5, S(4.5));
      ctx.shadowColor = accent;
      ctx.shadowBlur = S(8);
      for (let k = 0; k < 5; k++) {
        const a = hash(i, j, seed + 20 + k) * Math.PI * 2;
        let px = cx;
        let py = cy;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let s2 = 0; s2 < 3; s2++) {
          const seg = rad * (0.3 + hash(i, j, seed + 40 + k * 3 + s2) * 0.4);
          const aa = a + (hash(i, j, seed + 70 + k * 3 + s2) - 0.5) * 0.9;
          px += Math.cos(aa) * seg;
          py += Math.sin(aa) * seg;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    });
  } else if (kind === 'channels') {
    // 熔岩核心熔爐 / 鏽蝕地下鐵：玄武岩裂口與洶湧熾熱岩漿河
    const channelW = S(88);

    // 1) 熔岩渠道周邊熱輻射外暈 (Thermal Radiance)
    ctx.save();
    for (const gy of lines) {
      const y = Y(gy);
      const rg = ctx.createLinearGradient(0, y - channelW * 1.4, 0, y + channelW * 1.4);
      rg.addColorStop(0, 'rgba(255, 60, 0, 0)');
      rg.addColorStop(0.35, 'rgba(255, 80, 10, 0.22)');
      rg.addColorStop(0.5, 'rgba(255, 120, 20, 0.45)');
      rg.addColorStop(0.65, 'rgba(255, 80, 10, 0.22)');
      rg.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, y - channelW * 1.4, w, channelW * 2.8);
    }
    for (const gx of lines) {
      const x = X(gx);
      const rg = ctx.createLinearGradient(x - channelW * 1.4, 0, x + channelW * 1.4, 0);
      rg.addColorStop(0, 'rgba(255, 60, 0, 0)');
      rg.addColorStop(0.35, 'rgba(255, 80, 10, 0.22)');
      rg.addColorStop(0.5, 'rgba(255, 120, 20, 0.45)');
      rg.addColorStop(0.65, 'rgba(255, 80, 10, 0.22)');
      rg.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - channelW * 1.4, 0, channelW * 2.8, h);
    }

    // 2) 渠道深層熾熱熔岩基底
    ctx.fillStyle = 'rgba(235, 75, 10, 0.9)';
    for (const gy of lines) ctx.fillRect(0, Y(gy) - channelW / 2, w, channelW);
    for (const gx of lines) ctx.fillRect(X(gx) - channelW / 2, 0, channelW, h);

    // 3) 渠道鋸齒岩岸 (玄武岩碎裂邊緣)
    ctx.fillStyle = '#140806';
    for (const gy of lines) {
      const y = Y(gy);
      for (let px = 0; px < w; px += S(40)) {
        const h1 = (Math.sin(px * 0.1 + gy) + 1) * S(10);
        ctx.fillRect(px, y - channelW / 2, S(40), h1);
        const h2 = (Math.cos(px * 0.12 + gy) + 1) * S(10);
        ctx.fillRect(px, y + channelW / 2 - h2, S(40), h2);
      }
    }
    for (const gx of lines) {
      const x = X(gx);
      for (let py = 0; py < h; py += S(40)) {
        const w1 = (Math.sin(py * 0.1 + gx) + 1) * S(10);
        ctx.fillRect(x - channelW / 2, py, w1, S(40));
        const w2 = (Math.cos(py * 0.12 + gx) + 1) * S(10);
        ctx.fillRect(x + channelW / 2 - w2, py, w2, S(40));
      }
    }

    // 4) 渠道中央流動亮橘岩漿流
    ctx.fillStyle = 'rgba(255, 165, 25, 0.95)';
    for (const gy of lines) ctx.fillRect(0, Y(gy) - S(16), w, S(32));
    for (const gx of lines) ctx.fillRect(X(gx) - S(16), 0, S(32), h);

    // 5) 白熱高溫裂隙核心 (帶有強烈灼熱發光)
    ctx.fillStyle = 'rgba(255, 245, 190, 0.98)';
    ctx.shadowColor = '#ffb703';
    ctx.shadowBlur = S(12);
    for (const gy of lines) ctx.fillRect(0, Y(gy) - S(6), w, S(12));
    for (const gx of lines) ctx.fillRect(X(gx) - S(6), 0, S(12), h);
    ctx.restore();
  } else if (kind === 'rifts') {
    // 毒霧沼澤 / 水墨仙山 / 深淵無盡戰
    if (level && level.id === 'inkmount') {
      // 水墨仙山：宣紙墨韻山水，起伏等高山勢、墨跡暈染與飄落楓葉
      eachCell((gx, gy, i, j) => {
        const r = hash(i, j, seed + 31);
        const cx = X(gx + cell * 0.5);
        const cy = Y(gy + cell * 0.5);

        // 遠山水墨渲染層
        const rad = S(cell * (0.35 + r * 0.25));
        const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        ig.addColorStop(0, 'rgba(40, 52, 48, 0.12)');
        ig.addColorStop(0.6, 'rgba(50, 65, 60, 0.06)');
        ig.addColorStop(1, 'rgba(60, 75, 70, 0)');
        ctx.fillStyle = ig;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();

        // 皴法墨線
        ctx.strokeStyle = 'rgba(30, 42, 38, 0.22)';
        ctx.lineWidth = Math.max(1, S(3));
        const a = r * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * rad * 0.8, cy - Math.sin(a) * rad * 0.8);
        ctx.quadraticCurveTo(cx + Math.sin(a) * S(30), cy - Math.cos(a) * S(30),
          cx + Math.cos(a) * rad * 0.8, cy + Math.sin(a) * rad * 0.8);
        ctx.stroke();

        // 朱砂紅楓葉點綴
        if (r > 0.4) {
          ctx.fillStyle = 'rgba(215, 68, 42, 0.55)';
          for (let m = 0; m < 4; m++) {
            const mx = cx + (hash(i, j, seed + 10 + m) - 0.5) * rad * 1.1;
            const my = cy + (hash(i, j, seed + 20 + m) - 0.5) * rad * 1.1;
            ctx.beginPath(); ctx.arc(mx, my, S(3.5), 0, Math.PI * 2); ctx.fill();
          }
        }
      });
    } else {
      // 虛空深淵 / 毒沼巨穴：次元破裂與符文法陣
      eachCell((gx, gy, i, j) => {
        const r = hash(i, j, seed + 31);
        if (r < 0.60) {
          const cx = X(gx + cell * 0.5);
          const cy = Y(gy + cell * 0.5);
          const a = r * Math.PI * 2;
          const len = S(cell * (0.36 + r * 0.3));

          // 裂縫暗影底槽
          ctx.strokeStyle = base;
          ctx.lineWidth = Math.max(2, S(48));
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();

          // 核心發光脈衝線
          ctx.save();
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1.5, S(6.5));
          ctx.shadowColor = accent;
          ctx.shadowBlur = S(10);
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
          ctx.restore();
        }
        if (r > 0.80) {
          // 地表符文環
          const cx = X(gx + cell * 0.5);
          const cy = Y(gy + cell * 0.5);
          ctx.save();
          ctx.strokeStyle = accent;
          ctx.shadowColor = accent;
          ctx.shadowBlur = S(8);
          ctx.lineWidth = Math.max(1, S(5));
          ctx.beginPath(); ctx.arc(cx, cy, S(cell * 0.3), 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = Math.max(1, S(2.5));
          ctx.beginPath(); ctx.arc(cx, cy, S(cell * 0.22), 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      });
    }
  }
  // kind === 'none' → 不畫 (保持原樣)
}

// 每幀把地形磚貼滿畫面：視野跨過幾塊磚就貼幾次（視野比磚小，最多 4 次 drawImage）
export function drawMacro(ctx, camera, level, vw, vh) {
  const layer = getMacroLayer(level);
  if (!layer.canvas) return;
  const P = layer.P;
  const k = layer.w / P;                     // 世界 → 磚畫布的縮尺（= 1/SCALE，取整後的精確值）
  const tx0 = Math.floor(camera.x / P);
  const ty0 = Math.floor(camera.y / P);
  const tx1 = Math.floor((camera.x + vw) / P);
  const ty1 = Math.floor((camera.y + vh) / P);
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      // 這塊磚與視野的交集（世界座標）
      const wx0 = Math.max(camera.x, tx * P);
      const wy0 = Math.max(camera.y, ty * P);
      const wx1 = Math.min(camera.x + vw, (tx + 1) * P);
      const wy1 = Math.min(camera.y + vh, (ty + 1) * P);
      if (wx1 <= wx0 || wy1 <= wy0) continue;
      ctx.drawImage(layer.canvas,
        (wx0 - tx * P) * k, (wy0 - ty * P) * k, (wx1 - wx0) * k, (wy1 - wy0) * k,
        wx0 - camera.x, wy0 - camera.y, wx1 - wx0, wy1 - wy0);
    }
  }
}

// ── 大型地標 ────────────────────────────────────────────────
// 每個地標烘成一張 sprite (開局第一次遇到才烘)，每幀只 drawImage。
// 地標是「玩家能記得的地方」：走過同一個霓虹招牌兩次，地圖就不再是均質的。
function landmarkSprite(kind) {
  const cached = LANDMARK_SPRITE.get(kind);
  if (cached) return cached;

  const R = 96;          // 半徑 (世界單位)
  const cv = document.createElement('canvas');
  cv.width = cv.height = R * 2;
  const x = cv.getContext('2d');
  x.translate(R, R);
  drawLandmarkArt(x, kind);
  const out = { cv, r: R };
  LANDMARK_SPRITE.set(kind, out);
  return out;
}

function drawLandmarkArt(x, kind) {
  const glow = (color) => {
    x.shadowColor = color;
    x.shadowBlur = 22;
  };
  switch (kind) {
    case 'billboard': {
      // 折半的霓虹招牌：鐵架 + 兩片發光面板，其中一片熄掉
      x.fillStyle = '#2b2f3a';
      x.fillRect(-46, 20, 10, 72);
      x.fillRect(36, 20, 10, 72);
      x.fillRect(-52, 12, 104, 14);
      x.fillStyle = '#ff2d95';
      glow('#ff2d95');
      x.fillRect(-48, -46, 44, 56);
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(120,140,170,0.35)';
      x.fillRect(6, -46, 44, 56);
      x.strokeStyle = 'rgba(0,229,255,0.5)';
      x.lineWidth = 2;
      x.strokeRect(6, -46, 44, 56);
      break;
    }
    case 'bus': {
      // 翻覆的報廢公車：長方形車體 + 破窗
      x.fillStyle = '#3a4a5a';
      x.beginPath();
      x.roundRect(-70, -34, 140, 68, 10);
      x.fill();
      x.fillStyle = '#22303c';
      x.fillRect(-56, -22, 46, 30);
      x.fillRect(-4, -22, 46, 30);
      x.strokeStyle = 'rgba(255,255,255,0.25)';
      x.lineWidth = 2;
      x.strokeRect(-56, -22, 46, 30);
      x.strokeRect(-4, -22, 46, 30);
      x.fillStyle = '#141b22';
      x.beginPath();
      x.arc(52, 0, 20, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'containment': {
      // 破裂的培養槽：巨型圓環 + 外洩的綠色液光
      x.fillStyle = 'rgba(0,245,155,0.10)';
      x.beginPath();
      x.arc(0, 0, 74, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = '#5f7f74';
      x.lineWidth = 8;
      x.beginPath();
      x.arc(0, 0, 70, 0.5, Math.PI * 2 - 0.2);
      x.stroke();
      x.strokeStyle = '#00f59b';
      glow('#00f59b');
      x.lineWidth = 4;
      x.beginPath();
      x.arc(0, 0, 52, 0, Math.PI * 2);
      x.stroke();
      x.shadowBlur = 0;
      x.strokeStyle = 'rgba(180,255,220,0.35)';
      x.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        x.beginPath();
        x.moveTo(Math.cos(a) * 52, Math.sin(a) * 52);
        x.lineTo(Math.cos(a) * 70, Math.sin(a) * 70);
        x.stroke();
      }
      break;
    }
    case 'tank': {
      // 大型反應槽：直立圓柱與管線
      x.fillStyle = '#2f3a44';
      x.beginPath();
      x.roundRect(-32, -70, 64, 140, 14);
      x.fill();
      x.fillStyle = 'rgba(0,245,155,0.16)';
      x.fillRect(-24, -58, 48, 40);
      x.strokeStyle = 'rgba(0,245,155,0.6)';
      glow('#00f59b');
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(0, 10);
      x.lineTo(0, 66);
      x.stroke();
      x.shadowBlur = 0;
      x.strokeStyle = '#4d5b66';
      x.lineWidth = 6;
      x.beginPath();
      x.moveTo(-32, 40);
      x.lineTo(-72, 40);
      x.moveTo(32, 20);
      x.lineTo(72, 20);
      x.stroke();
      break;
    }
    case 'radar': {
      // 墜毀的雷達碟：斜插的支撐臂 + 大碟面
      x.fillStyle = '#3a4e63';
      x.save();
      x.rotate(-0.5);
      x.beginPath();
      x.ellipse(0, 0, 78, 40, 0, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(190,230,255,0.65)';
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(0, 0, 78, 40, 0, 0, Math.PI * 2);
      x.stroke();
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(0, -40);
      x.stroke();
      x.restore();
      x.strokeStyle = '#26333f';
      x.lineWidth = 9;
      x.beginPath();
      x.moveTo(30, 34);
      x.lineTo(58, 82);
      x.stroke();
      break;
    }
    case 'icespire': {
      // 冰晶尖塔群：三支高矮不一的冰柱
      const spike = (dx, hgt, wdt, alpha) => {
        x.fillStyle = `rgba(190,235,255,${alpha})`;
        x.beginPath();
        x.moveTo(dx - wdt, 62);
        x.lineTo(dx, 62 - hgt);
        x.lineTo(dx + wdt, 62);
        x.closePath();
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.55)';
        x.lineWidth = 2;
        x.stroke();
      };
      spike(-30, 96, 20, 0.5);
      spike(6, 136, 26, 0.62);
      spike(42, 78, 16, 0.42);
      break;
    }
    case 'gear': {
      // 巨型齒輪壓印：嵌在地面的工業遺跡
      x.strokeStyle = 'rgba(255,150,60,0.55)';
      x.lineWidth = 7;
      x.beginPath();
      x.arc(0, 0, 62, 0, Math.PI * 2);
      x.stroke();
      x.lineWidth = 12;
      x.strokeStyle = 'rgba(255,120,20,0.35)';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        x.beginPath();
        x.moveTo(Math.cos(a) * 62, Math.sin(a) * 62);
        x.lineTo(Math.cos(a) * 82, Math.sin(a) * 82);
        x.stroke();
      }
      x.strokeStyle = 'rgba(255,190,90,0.4)';
      x.lineWidth = 5;
      x.beginPath();
      x.arc(0, 0, 28, 0, Math.PI * 2);
      x.stroke();
      break;
    }
    case 'lavafall': {
      // 熔岩瀑布：岩壁裂口往下淌的熔流
      x.fillStyle = '#241412';
      x.beginPath();
      x.roundRect(-84, -40, 168, 34, 8);
      x.fill();
      x.fillStyle = 'rgba(255,140,20,0.85)';
      glow('#ff7700');
      x.beginPath();
      x.moveTo(-40, -10);
      x.lineTo(40, -10);
      x.lineTo(26, 66);
      x.lineTo(-24, 66);
      x.closePath();
      x.fill();
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,225,150,0.9)';
      x.fillRect(-16, -10, 30, 60);
      break;
    }
    case 'obelisk': {
      // 虛空方尖碑：細長碑體 + 符文環
      x.fillStyle = '#2a2140';
      x.beginPath();
      x.moveTo(0, -84);
      x.lineTo(22, -30);
      x.lineTo(16, 70);
      x.lineTo(-16, 70);
      x.lineTo(-22, -30);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(190,140,255,0.75)';
      glow('#b388ff');
      x.lineWidth = 3;
      x.beginPath();
      x.arc(0, -6, 40, 0, Math.PI * 2);
      x.stroke();
      x.beginPath();
      x.arc(0, -6, 52, 1.2, 4.2);
      x.stroke();
      x.shadowBlur = 0;
      break;
    }
    case 'runecircle': {
      // 地面符文圓陣
      x.strokeStyle = 'rgba(200,160,255,0.5)';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(0, 0, 74, 0, Math.PI * 2);
      x.stroke();
      x.lineWidth = 2;
      x.beginPath();
      x.arc(0, 0, 58, 0, Math.PI * 2);
      x.stroke();
      glow('#b388ff');
      x.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const px = Math.cos(a) * 66;
        const py = Math.sin(a) * 66;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      x.stroke();
      x.shadowBlur = 0;
      break;
    }
    default:
      break;
  }
}

// 每幀畫出視野內的地標。地標固定在「大地標格」的中心附近，位置由雜湊決定，
// 且刻意避開世界原點 (玩家出生點與守塔核心)，不會擋住開局。
export function drawLandmarks(ctx, camera, level, vw, vh) {
  const macro = level.theme && level.theme.ground && level.theme.ground.macro;
  if (!macro || !macro.landmark || macro.landmark.length === 0) return;

  const cell = macro.landmarkCell || 1200;
  const chance = macro.landmarkChance != null ? macro.landmarkChance : 0.55;
  const seed = levelSeed(level.id);
  const x0 = Math.floor(camera.x / cell) - 1;
  const x1 = Math.floor((camera.x + vw) / cell) + 1;
  const y0 = Math.floor(camera.y / cell) - 1;
  const y1 = Math.floor((camera.y + vh) / cell) + 1;

  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      if (hash(cx, cy, seed + 101) > chance) continue;
      const kind = macro.landmark[Math.floor(hash(cx, cy, seed + 102) * macro.landmark.length) % macro.landmark.length];
      const wx = cx * cell + hash(cx, cy, seed + 103) * (cell - 400) + 200;
      const wy = cy * cell + hash(cx, cy, seed + 104) * (cell - 400) + 200;
      // 避開世界原點附近 (出生點 / 核心)
      if (Math.abs(wx) < 520 && Math.abs(wy) < 520) continue;
      const wb = worldBounds();   // 無限地圖：±Infinity，不限範圍
      if (wx < wb.minX || wx > wb.maxX || wy < wb.minY || wy > wb.maxY) continue;

      const sx = wx - camera.x;
      const sy = wy - camera.y;
      const sp = landmarkSprite(kind);
      if (sx < -sp.r || sx > vw + sp.r || sy < -sp.r || sy > vh + sp.r) continue;
      if (onPath(level, wx, wy, sp.r * 0.8)) continue;   // 守塔：地標不壓在路上

      const scale = 0.8 + hash(cx, cy, seed + 105) * 0.45;
      const flip = hash(cx, cy, seed + 106) > 0.5 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.translate(sx, sy);
      ctx.scale(flip * scale, scale);
      ctx.drawImage(sp.cv, -sp.r, -sp.r);
      ctx.restore();
    }
  }
}

// ── 隨時間劣化 ──────────────────────────────────────────────
// 「同一張圖 8 分鐘不變」也是單調的來源之一。這裡烘一片稀疏的餘燼/裂痕磚，
// 疊在宏觀層之上，透明度隨遊戲時間上升 —— 開局乾淨、越接近終局越殘破。
const ESCALATE_TILE = 512;
const escalateCache = new LevelCache();   // 劣化磚：每關 512² ≈ 1 MB，只留最近 3 關

function getEscalateTile(level) {
  const id = (level && level.id) || 'street';
  const macro = level.theme && level.theme.ground && level.theme.ground.macro;
  if (!macro || !macro.escalate) return null;
  const cached = escalateCache.get(id);
  if (cached !== undefined) return cached;

  const cv = document.createElement('canvas');
  cv.width = cv.height = ESCALATE_TILE;
  const ctx = cv.getContext('2d');
  const rgb = macro.escalate.rgb || '255,120,40';
  const count = macro.escalate.count || 22;
  const seed = levelSeed(id);
  for (let i = 0; i < count; i++) {
    // 用 i 當雜湊輸入即可：這片磚開局烘一次，之後固定不變
    const px = hash(i, 1, seed + 201) * ESCALATE_TILE;
    const py = hash(i, 2, seed + 202) * ESCALATE_TILE;
    const rad = 8 + hash(i, 3, seed + 203) * 26;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(${rgb},0.55)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // 磚界接合：把左上角的光暈補到右下角，平鋪時才不會出現方格感
  for (let i = 0; i < count; i++) {
    const px = hash(i, 1, seed + 201) * ESCALATE_TILE;
    const py = hash(i, 2, seed + 202) * ESCALATE_TILE;
    const rad = 8 + hash(i, 3, seed + 203) * 26;
    if (px > ESCALATE_TILE - rad || py > ESCALATE_TILE - rad) {
      const g = ctx.createRadialGradient(px - ESCALATE_TILE, py - ESCALATE_TILE, 0, px - ESCALATE_TILE, py - ESCALATE_TILE, rad);
      g.addColorStop(0, `rgba(${rgb},0.55)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px - ESCALATE_TILE, py - ESCALATE_TILE, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  escalateCache.set(id, cv);
  return cv;
}

export function drawEscalation(ctx, camera, level, vw, vh, gameTime) {
  const tile = getEscalateTile(level);
  if (!tile) return;
  // 前 90 秒完全乾淨，之後線性上升，8 分鐘時到 alpha 上限
  const alpha = Math.max(0, Math.min(0.55, (gameTime - 90) / 390 * 0.55));
  if (alpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // 緩慢呼吸，讓地面看起來是「活的」而不是貼圖
  const pulse = 0.85 + Math.sin(gameTime * 0.35) * 0.15;
  ctx.globalAlpha = alpha * pulse;
  const gOx = -(((camera.x % ESCALATE_TILE) + ESCALATE_TILE) % ESCALATE_TILE);
  const gOy = -(((camera.y % ESCALATE_TILE) + ESCALATE_TILE) % ESCALATE_TILE);
  for (let gy = gOy; gy < vh; gy += ESCALATE_TILE) {
    for (let gx = gOx; gx < vw; gx += ESCALATE_TILE) {
      ctx.drawImage(tile, gx, gy);
    }
  }
  ctx.restore();
}

// 對外單一入口：宏觀結構 → 地標 → 時間劣化
export function drawTerrain(ctx, camera, level, vw, vh, gameTime = 0) {
  if (!level || !level.theme || !level.theme.ground || !level.theme.ground.macro) return;
  drawMacro(ctx, camera, level, vw, vh);
  drawLandmarks(ctx, camera, level, vw, vh);
  drawEscalation(ctx, camera, level, vw, vh, gameTime);
}

// 觀測用：這一層的兩個關卡快取目前佔了幾關、是哪幾關。
// 為什麼要開這個出口：它們是模組層變數，測試腳本從 game 物件上完全看不到，
// 只能靠「畫布張數有沒有收斂」間接猜 —— 那沒辦法區分「快取正常運作」與
// 「根本沒在烘」。回傳的是即時參照，呼叫端只讀不寫。
export function terrainCacheInfo() {
  return {
    macro: { size: macroCache.size, keys: macroCache.keys, keep: macroCache.keep },
    escalate: { size: escalateCache.size, keys: escalateCache.keys, keep: escalateCache.keep },
  };
}

// 清掉這一層的快取。給「換關卡時釋放前一關資源」與量測冷啟動成本用。
// 快取本身已經有容量上限，所以這不是必要的清理路徑 —— 但換關時主動放掉
// 上一關的畫布（每關 3 MB 上下）能讓峰值記憶體更低。
export function clearTerrainCache() {
  macroCache.clear();
  escalateCache.clear();
}
