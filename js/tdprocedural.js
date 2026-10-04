// js/tdprocedural.js
// 守塔模式程序化地圖生成器：配合玩家選擇（橫屏 / 竪屏）動態生成隨機道路與砲塔地基
// 滿足規則：
// 1. 配合玩家的視野選擇生成（Landscape 16:9 廣域 vs Portrait 9:16 縱深）：
//    - 橫屏：生成寬幅東/西/北展開之戰略隘口與交叉火網
//    - 竪屏：動態拉伸地圖縱深（~920×1500），生成長程縱向蛇形深谷與梯次防線，完美適配手機直屏與街機視野
// 2. 道路生成隨機：每局開場或重試時動態計算折線路線，保持長度與挑戰性，不自交、不貼死核心
// 3. 砲塔位置隨機但「固定數量」：嚴格保持每張地圖原有建塔點總數，增加隨機難度與策略重玩性
// 4. 嚴格安全間隙：避開巢穴洞口（>=160px）、避開主堡核心（>=120px）、遠離路心（嚴格座落於路肩岩台）、塔位間距採泊松盤取樣（>=90px）
// 5. 地基戰術加成（高台/彈藥庫/金庫/指揮所等）依各關加成池隨機洗牌配置

import { SOCKET_BONUSES } from './tdsockets.js';

// 點到線段的最短投影與距離
export function projectToSegment(a, b, x, y) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / len2));
  const px = a[0] + vx * t;
  const py = a[1] + vy * t;
  return { d: Math.hypot(x - px, y - py), px, py };
}

// 隨機數輔助
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 點到所有折線路徑的最短距離
export function distToAllPaths(paths, x, y) {
  let minD = Infinity;
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const p = projectToSegment(path[i - 1], path[i], x, y);
      if (p.d < minD) minD = p.d;
    }
  }
  return minD;
}

// 兩線段間的最近距離（用於檢驗平行路段是否靠太近）
function segmentDistance(p1, p2, p3, p4) {
  const d1 = projectToSegment(p1, p2, p3[0], p3[1]).d;
  const d2 = projectToSegment(p1, p2, p4[0], p4[1]).d;
  const d3 = projectToSegment(p3, p4, p1[0], p1[1]).d;
  const d4 = projectToSegment(p3, p4, p2[0], p2[1]).d;
  return Math.min(d1, d2, d3, d4);
}

// 核心主堡永遠在座標原點，所有路線的最後一段都是「通往核心的共用引道」。
// 這些引道兩兩必然在核心交會（距離 0），若不排除，任何多線關卡都不可能通過
// 下面的貼死檢查 —— 連關卡手寫的原始路線都會被判不合格。
const CORE_EPS = 1;

function isCoreApproach(p1, p2) {
  return (
    Math.hypot(p1[0], p1[1]) <= CORE_EPS || Math.hypot(p2[0], p2[1]) <= CORE_EPS
  );
}

// 檢查「不同路線」之間是否有過近重疊（防止兩條不同進軍道路貼死穿模）
//
// 兩條刻意的例外，否則連關卡手寫的原始路線都會被判不合格：
//  1. 兩段都是通往核心的共用引道 → 交會是設計。
//  2. 同一條路線自己的非相鄰路段 → 那是同一條路的髮夾彎，車流不會互相穿模。
export function validatePathClearance(paths, minClearance) {
  for (let a = 0; a < paths.length; a++) {
    const pa = paths[a];
    for (let b = a + 1; b < paths.length; b++) {
      const pb = paths[b];
      for (let i = 1; i < pa.length; i++) {
        const segA1 = pa[i - 1];
        const segA2 = pa[i];
        for (let j = 1; j < pb.length; j++) {
          const segB1 = pb[j - 1];
          const segB2 = pb[j];
          // 兩段都是通往核心的共用引道 → 交會是設計，不算貼死
          if (isCoreApproach(segA1, segA2) && isCoreApproach(segB1, segB2)) {
            continue;
          }
          if (segmentDistance(segA1, segA2, segB1, segB2) < minClearance) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

// 兩條不同路線中心線之間的最小允許距離。門檻必須是「關卡手寫路線也過得了」的值，
// 否則生成器永遠失敗、只能默默回退成手寫路線（tools/verify-td-deep.mjs 會把關）。
export function minPathClearance(pathWidth) {
  return (pathWidth || 90) + 18;
}

// 記錄關卡原始基準資料（路線備份、邊界備份、固定建塔數量、加成池）
export function initTDLevelBaselines(level) {
  if (!level || !level.td) return;
  if (!level._defaultPaths) {
    level._defaultPaths = JSON.parse(JSON.stringify(level.paths || []));
  }
  if (!level._defaultBounds) {
    level._defaultBounds = JSON.parse(JSON.stringify(level.bounds));
  }
  if (!level._initialSocketCount) {
    level._initialSocketCount = (level.sockets && level.sockets.length) || 10;
  }
  if (!level._bonusPool) {
    level._bonusPool = (level.sockets || [])
      .map((s) => s.bonus)
      .filter((b) => b && SOCKET_BONUSES[b]);
    if (level._bonusPool.length === 0) {
      level._bonusPool = Object.keys(SOCKET_BONUSES);
    }
  }
}

// ── 配合玩家視野選擇（橫屏 / 竪屏）動態適配地圖邊界 ──
export function getOrientationBounds(level, isPortrait) {
  const orig = level._defaultBounds || level.bounds;
  if (!isPortrait) {
    // 橫屏模式 (Landscape)：16:9 寬螢幕視野
    return { ...orig };
  }
  // 竪屏模式 (Portrait)：9:16 縱向視野，寬度收窄為 ~920px，長度延展至 ~1450~1600px
  const origW = orig.maxX - orig.minX;
  const origH = orig.maxY - orig.minY;
  const totalArea = origW * origH;

  const portW = 920;
  const portH = Math.max(1400, Math.min(1680, Math.round(totalArea / portW)));
  const minX = -Math.round(portW / 2);
  const maxX = Math.round(portW / 2);
  const maxY = Math.min(160, orig.maxY);
  const minY = maxY - portH;
  return { minX, maxX, minY, maxY };
}

// 路線的所有點是否都落在 bounds 內（可留 margin 邊距）
export function pathsWithinBounds(paths, bounds, margin = 0) {
  if (!paths || !bounds) return false;
  for (const path of paths) {
    for (const [x, y] of path) {
      if (
        x < bounds.minX + margin || x > bounds.maxX - margin ||
        y < bounds.minY + margin || y > bounds.maxY - margin
      ) {
        return false;
      }
    }
  }
  return true;
}

// 把路線整體縮放平移進 bounds（保留拓撲、填滿視野）。
// 核心主堡必須留在 (0,0)，所以最後一點單獨釘回原點 —— 整條路線一起平移會讓
// 怪物走不到主堡。這是「路線超出當前視野」時的保險，例如直屏沿用了橫幅的原始路線。
export function fitPathsToBounds(paths, bounds, pathWidth = 90) {
  if (!paths || !paths.length || !bounds) return paths;
  const margin = pathWidth / 2 + 56;
  const tMinX = bounds.minX + margin;
  const tMaxX = bounds.maxX - margin;
  const tMinY = bounds.minY + margin;
  const tMaxY = bounds.maxY - margin;
  if (tMaxX <= tMinX || tMaxY <= tMinY) return paths;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const path of paths) {
    for (const [x, y] of path) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const sx = (tMaxX - tMinX) / Math.max(1, maxX - minX);
  const sy = (tMaxY - tMinY) / Math.max(1, maxY - minY);

  return paths.map((p) =>
    p.map(([x, y], idx) => {
      if (idx === p.length - 1) return [0, 0]; // 終點永遠是核心主堡
      return [
        Math.round(tMinX + (x - minX) * sx),
        Math.round(tMinY + (y - minY) * sy),
      ];
    })
  );
}

// 直屏地圖（9:16）比橫屏高得多：把「核心上方的固定絕對 y」按縱深比例放大，
// 折返點才會散布在整張長條地圖上，而不是全擠在核心附近、上半張圖空著。
// 橫屏時 bounds 與參考 bounds 同高 → 原值回傳，橫屏外觀不受影響。
function spreadY(y, bounds, refBounds) {
  if (!refBounds || y >= 0) return y;
  const refDepth = -refBounds.minY;
  const depth = -bounds.minY;
  if (!(refDepth > 0) || !(depth > 0) || depth <= refDepth) return y;
  return Math.round(y * (depth / refDepth));
}

// ── 關卡專屬程序化道路生成器 ──
// 1. 峽谷隘口（td_canyon）：單線蛇形峽谷
function generateCanyonPaths(bounds, pathWidth, isPortrait) {
  const minX = bounds.minX + (isPortrait ? 55 : 90);
  const maxX = bounds.maxX - (isPortrait ? 55 : 90);
  const minY = bounds.minY;
  const startX = 0;
  const startY = minY;

  const goLeftFirst = Math.random() > 0.5;
  // 直屏因為長度增加，生成 4~5 折階梯式縱向蛇谷；橫屏為 3~4 折
  const numBends = isPortrait ? pick([4, 5]) : pick([3, 4]);

  const availableY = -120 - (minY + 160);
  const stepY = availableY / numBends;

  const waypoints = [[startX, startY]];
  let currentY = minY + rand(145, 175);
  waypoints.push([startX, currentY]);

  let dir = goLeftFirst ? -1 : 1;
  for (let i = 0; i < numBends; i++) {
    const xSpan = maxX - minX;
    const targetX = dir < 0 ? rand(minX, minX + xSpan * 0.28) : rand(maxX - xSpan * 0.28, maxX);
    waypoints.push([Math.round(targetX), Math.round(currentY)]);

    const nextY = currentY + stepY * rand(0.9, 1.1);
    if (i < numBends - 1) {
      currentY = Math.min(-140, nextY);
      waypoints.push([Math.round(targetX), Math.round(currentY)]);
      dir = -dir;
    } else {
      currentY = rand(-135, -95);
      waypoints.push([Math.round(targetX), Math.round(currentY)]);
      waypoints.push([0, Math.round(currentY)]);
      waypoints.push([0, 0]);
      break;
    }
  }
  return [waypoints];
}

// 2. 雙叉河道（td_fork）：東西兩路交匯
function generateForkPaths(bounds, pathWidth, isPortrait) {
  const minX = bounds.minX;
  const maxX = bounds.maxX;
  const minY = bounds.minY;

  if (isPortrait) {
    // 直屏：兩條河流從西北與東北向南匯流至核心
    const wX0 = rand(minX + 90, -120);
    const wY1 = rand(minY + 320, minY + 440);
    const wX1 = rand(minX + 50, minX + 180);
    const wY2 = rand(-380, -260);
    const path0 = [[wX0, minY], [wX0, wY1], [wX1, wY1], [wX1, wY2], [-200, wY2], [-200, 0], [0, 0]];

    const eX0 = rand(120, maxX - 90);
    const eY1 = rand(minY + 320, minY + 440);
    const eX1 = rand(maxX - 180, maxX - 50);
    const eY2 = rand(-380, -260);
    const path1 = [[eX0, minY], [eX0, eY1], [eX1, eY1], [eX1, eY2], [200, eY2], [200, 0], [0, 0]];
    return [path0, path1];
  }

  // 橫屏：經典東西兩側推進
  const variant = pick(['stagger', 'horseshoe', 'zigzag']);
  let path0, path1;
  if (variant === 'horseshoe') {
    const wY1 = rand(-380, -280);
    const wX1 = rand(-550, -420);
    const wY2 = rand(-180, -100);
    path0 = [[minX, wY1], [wX1, wY1], [wX1, wY2], [-220, wY2], [-220, 0], [0, 0]];

    const eY1 = rand(-460, -380);
    const eX1 = rand(420, 560);
    const eY2 = rand(220, 310);
    path1 = [[maxX, eY1], [eX1, eY1], [eX1, eY2], [190, eY2], [190, 0], [0, 0]];
  } else if (variant === 'zigzag') {
    const wY1 = rand(-220, -150);
    const wX1 = rand(-560, -450);
    const wY2 = rand(180, 260);
    path0 = [[minX, wY1], [wX1, wY1], [wX1, wY2], [-230, wY2], [-230, 0], [0, 0]];

    const eY1 = rand(-460, -380);
    const eX1 = rand(460, 580);
    const eY2 = rand(120, 200);
    path1 = [[maxX, eY1], [eX1, eY1], [eX1, eY2], [220, eY2], [220, 0], [0, 0]];
  } else {
    const wY1 = rand(-220, -150);
    const wX1 = rand(-520, -440);
    const wY2 = rand(280, 350);
    path0 = [[minX, wY1], [wX1, wY1], [wX1, wY2], [-220, wY2], [-220, 0], [0, 0]];

    const eY1 = rand(-450, -370);
    const eX1 = rand(420, 500);
    const eY2 = rand(180, 250);
    path1 = [[maxX, eY1], [eX1, eY1], [eX1, eY2], [180, eY2], [180, 0], [0, 0]];
  }
  return [path0, path1];
}

// 3. 三門要塞（td_fortress）：北、西南、東南三線
function generateFortressPaths(bounds, pathWidth, isPortrait, refBounds) {
  if (isPortrait) {
    // 直屏（920 寬、1400+ 深）：北線階梯獨佔北半部，兩翼改由左右地圖緣的「中段」切入，
    // 一路往內跑、下降之後才斜向核心。關鍵是兩翼的橫向跑道必須落在北線下折返點之下 170px 以上，
    // 且翼的內側轉角（230~300）要與北線垂直段（|nX| ≤ 210）拉開——舊版 wingY 與 nY1 範圍重疊、
    // innerX 又和 nX 只差 20~70px，導致 10/10 候選全被 validatePathClearance 否決而永遠回退原始路線。
    const dir = Math.random() > 0.5 ? -1 : 1;
    const nX = dir * rand(150, 210);
    const nY1 = bounds.minY + rand(200, 300);
    const nY2 = bounds.minY + rand(820, 950);
    const pathNorth = [[0, bounds.minY], [0, nY1], [nX, nY1], [nX, nY2], [0, nY2], [0, 0]];

    // 兩翼橫向跑道：北線下折返點之下 170~240px（再往上會被北線擋住，往下則離核心太近）
    const wingY = Math.min(nY2 + rand(170, 240), -240);
    const wingX = rand(230, 300);
    const wingDownY = rand(-170, -120);
    const pathSW = [[bounds.minX, wingY], [-wingX, wingY], [-wingX, wingDownY], [0, 0]];
    const pathSE = [[bounds.maxX, wingY], [wingX, wingY], [wingX, wingDownY], [0, 0]];

    return [pathNorth, pathSW, pathSE];
  }

  // 橫屏：北線階梯 + 西南／東南兩翼由地圖下緣往上推進
  const northBendDir = Math.random() > 0.5 ? -1 : 1;
  const nX = northBendDir < 0 ? rand(-260, -160) : rand(160, 260);
  const nY1 = bounds.minY + rand(220, 320);
  const nY2 = spreadY(rand(-220, -150), bounds, refBounds);
  const pathNorth = [[0, bounds.minY], [0, nY1], [nX, nY1], [nX, nY2], [0, nY2], [0, 0]];

  const wingY = rand(420, 490);
  const wingX1 = rand(-460, -360);
  const wingX2 = rand(360, 460);
  const midY = rand(160, 240);
  const nearY = 75;
  const innerX = -200;
  const innerX2 = 200;

  const pathSW = [[bounds.minX, wingY], [wingX1, wingY], [wingX1, midY], [innerX, midY], [innerX, nearY], [0, 0]];
  const pathSE = [[bounds.maxX, wingY], [wingX2, wingY], [wingX2, midY], [innerX2, midY], [innerX2, nearY], [0, 0]];

  return [pathNorth, pathSW, pathSE];
}

// 4. 鑄造世界（td_forgeworld）：西北與東北雙路工廠戰壕
function generateForgeworldPaths(bounds, pathWidth, isPortrait, refBounds) {
  const minY = bounds.minY;
  const nwY1 = minY + rand(160, 240);
  const nwX1 = rand(-420, -320);
  const nwY2 = spreadY(rand(-450, -320), bounds, refBounds);
  const nwX2 = rand(-200, -130);
  const pathNW = [[bounds.minX, nwY1], [nwX1, nwY1], [nwX1, nwY2], [nwX2, nwY2], [nwX2, -85], [0, 0]];

  const neY1 = minY + rand(160, 240);
  const neX1 = rand(320, 420);
  const neY2 = spreadY(rand(-450, -320), bounds, refBounds);
  const neX2 = rand(130, 200);
  const pathNE = [[bounds.maxX, neY1], [neX1, neY1], [neX1, neY2], [neX2, neY2], [neX2, -85], [0, 0]];

  return [pathNW, pathNE];
}

// 5. 紅色警戒（td_redalert）：西線長蛇與東北推進
function generateRedAlertPaths(bounds, pathWidth, isPortrait, refBounds) {
  const wY1 = bounds.minY + rand(180, 260);
  const wX1 = rand(-420, -340);
  const wY2 = spreadY(rand(-380, -260), bounds, refBounds);
  const wX2 = rand(-240, -170);
  const wY3 = spreadY(rand(-160, -90), bounds, refBounds);
  const wX3 = rand(-140, -80);
  const pathW = [[bounds.minX, wY1], [wX1, wY1], [wX1, wY2], [wX2, wY2], [wX2, wY3], [wX3, wY3], [wX3, -30], [0, 0]];

  const eX0 = rand(180, 320);
  const eY1 = bounds.minY + rand(220, 300);
  const eX1 = rand(360, 440);
  const eY2 = spreadY(rand(-220, -140), bounds, refBounds);
  const eX2 = rand(160, 230);
  const pathE = [[eX0, bounds.minY], [eX0, eY1], [eX1, eY1], [eX1, eY2], [eX2, eY2], [eX2, -20], [0, 0]];

  return [pathW, pathE];
}

// 6. 星海爭霸（td_starcraft）：長 S 路線與右側突襲
function generateStarcraftPaths(bounds, pathWidth, isPortrait, refBounds) {
  const nX0 = rand(120, 240);
  const nY1 = bounds.minY + rand(220, 300);
  const nX1 = rand(-380, -280);
  const nY2 = spreadY(rand(-480, -360), bounds, refBounds);
  const nX2 = rand(240, 340);
  const pathMain = [[nX0, bounds.minY], [nX0, nY1], [nX1, nY1], [nX1, nY2], [nX2, nY2], [nX2, -120], [0, -120], [0, 0]];

  // 右側突襲：入口 y 必須離主線最後那段 y = -120 的橫向路至少 minClearance，
  // 否則兩段會共線重疊（實測約 34% 的候選因此被 clearance 否決，1/60 的局數整場回退原始路線）。
  const eY0 = rand(0, 70);
  const eX1 = rand(180, 250);
  const pathFlank = [[bounds.maxX, eY0], [eX1, eY0], [eX1, 0], [0, 0]];

  return [pathMain, pathFlank];
}

// 7. 魔獸爭霸（td_warcraft）：西、北、東三路天譴進攻
function generateWarcraftPaths(bounds, pathWidth, isPortrait, refBounds) {
  const wY1 = bounds.minY * 0.45;
  const wX1 = rand(-380, -280);
  const wY2 = rand(-120, -40);
  const wX2 = rand(-220, -150);
  const pathW = [[bounds.minX, wY1], [wX1, wY1], [wX1, wY2], [wX2, wY2], [wX2, 0], [0, 0]];

  const nX0 = rand(-120, 40);
  const nY1 = bounds.minY + rand(220, 320);
  const nX1 = rand(140, 220);
  const nY2 = spreadY(rand(-280, -200), bounds, refBounds);
  const pathN = [[nX0, bounds.minY], [nX0, nY1], [nX1, nY1], [nX1, nY2], [0, nY2], [0, 0]];

  const eY1 = bounds.minY * 0.45;
  const eX1 = rand(280, 380);
  const eY2 = rand(-120, -40);
  const eX2 = rand(150, 220);
  const pathE = [[bounds.maxX, eY1], [eX1, eY1], [eX1, eY2], [eX2, eY2], [eX2, 0], [0, 0]];

  return [pathW, pathN, pathE];
}

// 產生程序化路線（附帶多次驗證重試，確保段間距足夠）
export function generateProceduralPaths(level, isPortrait = false) {
  const id = level.id;
  const bounds = level.bounds;
  const pathWidth = level.pathWidth || 90;
  const minClearance = minPathClearance(pathWidth);

  for (let attempt = 0; attempt < 10; attempt++) {
    let candidate;
    const ref = level._defaultBounds;
    switch (id) {
      case 'td_canyon':
        candidate = generateCanyonPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_fork':
        candidate = generateForkPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_fortress':
        candidate = generateFortressPaths(bounds, pathWidth, isPortrait, ref);
        break;
      case 'td_forgeworld':
        candidate = generateForgeworldPaths(bounds, pathWidth, isPortrait, ref);
        break;
      case 'td_redalert':
        candidate = generateRedAlertPaths(bounds, pathWidth, isPortrait, ref);
        break;
      case 'td_starcraft':
        candidate = generateStarcraftPaths(bounds, pathWidth, isPortrait, ref);
        break;
      case 'td_warcraft':
        candidate = generateWarcraftPaths(bounds, pathWidth, isPortrait, ref);
        break;
      default:
        candidate = (level._defaultPaths || level.paths).map((p) => {
          return p.map((pt, idx) => {
            if (idx === 0 || idx === p.length - 1) return [...pt];
            return [pt[0] + rand(-25, 25), pt[1] + rand(-25, 25)];
          });
        });
        break;
    }

    if (validatePathClearance(candidate, minClearance)) {
      return candidate;
    }
  }

  // 若隨機生成未過驗證，回傳預設路線副本保證穩定
  return JSON.parse(JSON.stringify(level._defaultPaths || level.paths));
}

// ── 沿道路隨機生成固定數量的砲塔地基 ──
export function generateProceduralSockets(level, targetCount) {
  const paths = level.paths;
  const bounds = level.bounds;
  const pathWidth = level.pathWidth || 90;
  const halfW = pathWidth / 2;
  const candidates = [];

  // 1. 沿著每一條路徑的所有路段，在左右兩側路肩取樣候選建塔點
  for (const path of paths) {
    const entrancePt = path[0];
    for (let i = 1; i < path.length; i++) {
      const [x1, y1] = path[i - 1];
      const [x2, y2] = path[i];
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      if (segLen < 42) continue;

      const nx = -(y2 - y1) / segLen;
      const ny = (x2 - x1) / segLen;

      // 沿線段每 48px 切一個取樣點
      const steps = Math.max(1, Math.floor(segLen / 48));
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;

        // 左右兩側路肩各取一個點
        for (const side of [-1, 1]) {
          const offset = halfW + rand(34, 56);
          const sx = Math.round(px + nx * side * offset);
          const sy = Math.round(py + ny * side * offset);

          // 邊界安全過濾
          if (sx < bounds.minX + 34 || sx > bounds.maxX - 34 || sy < bounds.minY + 34 || sy > bounds.maxY - 34) {
            continue;
          }
          // 不得靠近核心主堡
          if (Math.hypot(sx, sy) < 115) continue;
          // 不得靠近任何怪物的入口巢穴
          let closeToEntrance = false;
          for (const p of paths) {
            if (Math.hypot(sx - p[0][0], sy - p[0][1]) < 155) {
              closeToEntrance = true;
              break;
            }
          }
          if (closeToEntrance) continue;
          // 確保落在路外（距離所有路線中心線 >= halfW + 25px）
          const dPath = distToAllPaths(paths, sx, sy);
          if (dPath < halfW + 25) continue;

          candidates.push({ x: sx, y: sy });
        }
      }
    }
  }

  // 2. 將候選點完全隨機洗牌
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // 3. 泊松盤（Poisson-disc）距離篩選：從寬到窄逐級放寬，直到填滿目標數量。
  //    「每張地圖建塔點總數不變」是這套系統的硬性承諾，所以最後一定要達標，
  //    最後幾級只剩「不要把兩座地基疊在同一格」的作用。
  function filterWithMinDist(dist) {
    const selected = [];
    for (const cand of candidates) {
      if (selected.length >= targetCount) break;
      const tooClose = selected.some((s) => Math.hypot(s.x - cand.x, s.y - cand.y) < dist);
      if (!tooClose) {
        selected.push({ ...cand });
      }
    }
    return selected;
  }

  const POISSON_TIERS = [92, 78, 65, 56, 48, 40, 32, 24];
  let selected = filterWithMinDist(POISSON_TIERS[0]);
  for (let ti = 1; ti < POISSON_TIERS.length && selected.length < targetCount; ti++) {
    selected = filterWithMinDist(POISSON_TIERS[ti]);
  }

  // 4. 洗牌分配戰術地基加成
  const bonusPool = [...(level._bonusPool || Object.keys(SOCKET_BONUSES))];
  for (let i = bonusPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bonusPool[i], bonusPool[j]] = [bonusPool[j], bonusPool[i]];
  }

  const bonusKeys = Object.keys(SOCKET_BONUSES);
  const result = selected.slice(0, targetCount).map((s, idx) => {
    const bonus = bonusPool[idx] || pick(bonusKeys);
    const def = SOCKET_BONUSES[bonus];
    return {
      id: `${level.id}_s${idx + 1}`,
      x: s.x,
      y: s.y,
      bonus,
      label: def ? def.label : '',
      occupied: false,
      turret: null,
    };
  });

  return result;
}

// ── 全局關卡動態隨機化接口 ──
// 在開局（TowerDefense 建構）或重新開始時呼叫，配合玩家的視野選擇（橫屏 / 竪屏）同時隨機化道路與砲塔點
export function randomizeTDLevel(level, orientation = 'auto') {
  if (!level || !level.td) return level;
  initTDLevelBaselines(level);

  // 判斷是否為直屏 (Portrait)
  let isPortrait = false;
  if (orientation === 'portrait') {
    isPortrait = true;
  } else if (orientation === 'landscape') {
    isPortrait = false;
  } else {
    const container = typeof document !== 'undefined' ? document.getElementById('game-container') : null;
    const w = container ? container.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1600);
    const h = container ? container.clientHeight : (typeof window !== 'undefined' ? window.innerHeight : 900);
    isPortrait = w < h;
  }

  // 1. 動態設置地圖邊界（配合橫屏 16:9 廣域 vs 竪屏 9:16 縱深）
  level.bounds = getOrientationBounds(level, isPortrait);
  level.isPortrait = isPortrait;

  // 2. 配合邊界生成適配該視野比例的程序化道路
  level.paths = generateProceduralPaths(level, isPortrait);

  // 2b. 保險：回退的原始路線（橫幅）或極端生成結果可能超出當前視野，
  //     此時把整組路線縮放平移進 bounds，否則路線與巢穴會跑到地圖外、地基也補不滿。
  //     注意：生成器是「貼著地圖邊緣」設計的（例如入口點就落在 bounds.minY），
  //     所以這裡只能用 margin 0 判定，否則每一局都會被重新拉伸，把剛好過關的路線間距壓爛。
  if (!pathsWithinBounds(level.paths, level.bounds, 0)) {
    level.paths = fitPathsToBounds(level.paths, level.bounds, level.pathWidth || 90);
  }

  // 3. 沿新道路的路肩隨機採樣生成固定數量的戰術地基
  level.sockets = generateProceduralSockets(level, level._initialSocketCount);

  return level;
}
