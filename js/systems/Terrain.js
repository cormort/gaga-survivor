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
// 效能策略：宏觀結構整張世界烘成一張 1/4 縮尺的離屏畫布 (4000 世界單位 → 1000px)，
// 每幀只要一次 drawImage；地標數量少 (每個 ~1200 單位格最多一個) 且各自烘成 sprite。
// 整層每幀固定 1~3 次繪圖呼叫，不隨場上敵人數成長。

const SCALE = 4;               // 世界 → 宏觀畫布的縮尺
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

const macroCache = new Map();

// 把整張世界的宏觀結構烘成一張縮尺畫布。每關只做一次。
function getMacroLayer(level) {
  const id = (level && level.id) || 'street';
  const cached = macroCache.get(id);
  if (cached) return cached;

  const macro = level.theme && level.theme.ground && level.theme.ground.macro;
  const b = { minX: -2000, maxX: 2000, minY: -2000, maxY: 2000 };
  const w = Math.ceil((b.maxX - b.minX) / SCALE);
  const h = Math.ceil((b.maxY - b.minY) / SCALE);

  const entry = { canvas: null, w, h, b };
  if (!macro) {
    macroCache.set(id, entry);
    return entry;
  }

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const seed = levelSeed(id);
  // 世界座標 → 畫布座標
  const X = (wx) => (wx - b.minX) / SCALE;
  const Y = (wy) => (wy - b.minY) / SCALE;
  const S = (len) => len / SCALE;

  drawMacroKind(ctx, macro, level, seed, X, Y, S, w, h);

  entry.canvas = cv;
  macroCache.set(id, entry);
  return entry;
}

// 五種宏觀結構。每一種都只用到少量填色與描邊，且全部在縮尺畫布上做一次。
function drawMacroKind(ctx, macro, level, seed, X, Y, S, w, h) {
  const kind = macro.kind || 'none';
  const base = macro.base || 'rgba(255,255,255,0.035)';
  const line = macro.line || 'rgba(0,0,0,0.22)';
  const accent = macro.accent || 'rgba(255,255,255,0.10)';

  if (kind === 'road') {
    // 淪陷商業街：棋盤式街廓。路面比底色亮一階、帶路緣與中央虛線，
    // 十字路口畫斑馬線 —— 這是玩家唯一能拿來定位的結構。
    const cell = macro.cell || 900;
    const roadW = cell * 0.3;
    ctx.fillStyle = base;
    for (let gx = -2000; gx <= 2000; gx += cell) {
      ctx.fillRect(X(gx) - S(roadW) / 2, 0, S(roadW), h);
    }
    for (let gy = -2000; gy <= 2000; gy += cell) {
      ctx.fillRect(0, Y(gy) - S(roadW) / 2, w, S(roadW));
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let gx = -2000; gx <= 2000; gx += cell) {
      const x = X(gx);
      ctx.beginPath();
      ctx.moveTo(x - S(roadW) / 2, 0);
      ctx.lineTo(x - S(roadW) / 2, h);
      ctx.moveTo(x + S(roadW) / 2, 0);
      ctx.lineTo(x + S(roadW) / 2, h);
      ctx.stroke();
    }
    for (let gy = -2000; gy <= 2000; gy += cell) {
      const y = Y(gy);
      ctx.beginPath();
      ctx.moveTo(0, y - S(roadW) / 2);
      ctx.lineTo(w, y - S(roadW) / 2);
      ctx.moveTo(0, y + S(roadW) / 2);
      ctx.lineTo(w, y + S(roadW) / 2);
      ctx.stroke();
    }
    // 中央虛線 + 斑馬線
    ctx.setLineDash([S(30), S(26)]);
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, S(6));
    for (let gx = -2000; gx <= 2000; gx += cell) {
      const x = X(gx);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let gy = -2000; gy <= 2000; gy += cell) {
      const y = Y(gy);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    for (let gx = -2000; gx <= 2000; gx += cell) {
      for (let gy = -2000; gy <= 2000; gy += cell) {
        const cx = X(gx);
        const cy = Y(gy);
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(cx + S(roadW) * 0.18, cy + S(i * 22) - S(4), S(roadW * 0.64), S(7));
        }
      }
    }
  } else if (kind === 'plates') {
    // 廢棄生化實驗室：大型金屬地板，板與板之間有明顯接縫與警示條。
    const cell = macro.cell || 760;
    let gi = 0;
    for (let gx = -2000; gx < 2000; gx += cell, gi++) {
      let gj = 0;
      for (let gy = -2000; gy < 2000; gy += cell, gj++) {
        const r = hash(gi, gj, seed + 7);
        // 板材本身：明暗交替，讓大區塊看得出來
        ctx.fillStyle = r > 0.5 ? base : 'rgba(255,255,255,0.015)';
        ctx.fillRect(X(gx) + 1, Y(gy) + 1, S(cell) - 2, S(cell) - 2);
        // 接縫
        ctx.strokeStyle = line;
        ctx.lineWidth = Math.max(1, S(5));
        ctx.strokeRect(X(gx) + 1, Y(gy) + 1, S(cell) - 2, S(cell) - 2);
        // 一部分板塊帶警示斜紋邊
        if (r > 0.8) {
          ctx.fillStyle = 'rgba(255,190,60,0.10)';
          ctx.fillRect(X(gx) + S(10), Y(gy) + S(10), S(cell) - S(20), S(9));
        }
        // 大型模板噴字 (圓形艙位標記)
        if (r < 0.18) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1, S(6));
          ctx.beginPath();
          ctx.arc(X(gx + cell / 2), Y(gy + cell / 2), S(cell * 0.3), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  } else if (kind === 'icefield') {
    // 極寒暴風雪基地：大面積冰原與凍湖，長裂縫貫穿整個區塊。
    const cell = macro.cell || 1000;
    for (let gx = -2000; gx < 2000; gx += cell) {
      for (let gy = -2000; gy < 2000; gy += cell) {
        const i = Math.round(gx / cell);
        const j = Math.round(gy / cell);
        const r = hash(i, j, seed + 13);
        if (r > 0.45) {
          // 凍湖：大塊偏藍的冰面
          ctx.fillStyle = base;
          ctx.beginPath();
          const cx = X(gx + cell * (0.3 + hash(i, j, seed + 1) * 0.4));
          const cy = Y(gy + cell * (0.3 + hash(i, j, seed + 2) * 0.4));
          const rad = S(cell * (0.3 + r * 0.25));
          ctx.ellipse(cx, cy, rad, rad * 0.74, r * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          // 冰面上的長裂縫 (從中心往外岔)
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1, S(4));
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
        }
      }
    }
  } else if (kind === 'channels') {
    // 熔岩核心熔爐：貫穿的岩漿渠道切開玄武岩平台，渠道邊緣透出橙紅。
    const cell = macro.cell || 1100;
    ctx.fillStyle = base;
    for (let gy = -2000; gy <= 2000; gy += cell) {
      const y = Y(gy);
      ctx.fillRect(0, y - S(46), w, S(92));
    }
    for (let gx = -2000; gx <= 2000; gx += cell) {
      const x = X(gx);
      ctx.fillRect(x - S(38), 0, S(76), h);
    }
    // 渠道內的白熱核心 (細、亮)
    ctx.fillStyle = accent;
    for (let gy = -2000; gy <= 2000; gy += cell) {
      const y = Y(gy);
      ctx.fillRect(0, y - S(9), w, S(18));
    }
    for (let gx = -2000; gx <= 2000; gx += cell) {
      const x = X(gx);
      ctx.fillRect(x - S(7), 0, S(14), h);
    }
  } else if (kind === 'rifts') {
    // 深淵無盡戰：虛空裂縫與符文圓陣，裂縫邊緣帶紫光。
    const cell = macro.cell || 1150;
    for (let gx = -2000; gx < 2000; gx += cell) {
      for (let gy = -2000; gy < 2000; gy += cell) {
        const i = Math.round(gx / cell);
        const j = Math.round(gy / cell);
        const r = hash(i, j, seed + 31);
        if (r < 0.55) {
          const cx = X(gx + cell * 0.5);
          const cy = Y(gy + cell * 0.5);
          const a = r * Math.PI * 2;
          const len = S(cell * (0.34 + r * 0.3));
          ctx.strokeStyle = base;
          ctx.lineWidth = Math.max(2, S(46));
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1, S(6));
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
        }
        if (r > 0.86) {
          const cx = X(gx + cell * 0.5);
          const cy = Y(gy + cell * 0.5);
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1, S(5));
          ctx.beginPath();
          ctx.arc(cx, cy, S(cell * 0.3), 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, S(cell * 0.22), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
  // kind === 'none' → 不畫 (保持原樣)
}

// 每幀貼上宏觀結構層。整層只有一次 drawImage。
export function drawMacro(ctx, camera, level, vw, vh) {
  const layer = getMacroLayer(level);
  if (!layer.canvas) return;
  const b = layer.b;
  // 相機（世界座標）→ 來源矩形（縮尺畫布座標）
  const sx = (camera.x - b.minX) / SCALE;
  const sy = (camera.y - b.minY) / SCALE;
  const sw = vw / SCALE;
  const sh = vh / SCALE;
  // 全部在世界外就跳過
  if (sx > layer.w || sy > layer.h || sx + sw < 0 || sy + sh < 0) return;
  ctx.drawImage(layer.canvas, sx, sy, sw, sh, 0, 0, vw, vh);
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
      if (wx < -2000 || wx > 2000 || wy < -2000 || wy > 2000) continue;

      const sx = wx - camera.x;
      const sy = wy - camera.y;
      const sp = landmarkSprite(kind);
      if (sx < -sp.r || sx > vw + sp.r || sy < -sp.r || sy > vh + sp.r) continue;

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
const escalateCache = new Map();

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
