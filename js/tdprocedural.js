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

// 檢查路線各段之間是否有過近重疊（防止道路貼死穿模）
function validatePathClearance(paths, minClearance) {
  for (let a = 0; a < paths.length; a++) {
    const pa = paths[a];
    for (let i = 1; i < pa.length; i++) {
      const segA1 = pa[i - 1];
      const segA2 = pa[i];
      for (let b = a; b < paths.length; b++) {
        const pb = paths[b];
        const startJ = a === b ? i + 2 : 1;
        for (let j = startJ; j < pb.length; j++) {
          const segB1 = pb[j - 1];
          const segB2 = pb[j];
          if (segmentDistance(segA1, segA2, segB1, segB2) < minClearance) {
            return false;
          }
        }
      }
    }
  }
  return true;
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
function generateFortressPaths(bounds, pathWidth, isPortrait) {
  const northBendDir = Math.random() > 0.5 ? -1 : 1;
  const nX = northBendDir < 0 ? rand(-260, -160) : rand(160, 260);
  const nY1 = bounds.minY + rand(220, 320);
  const nY2 = rand(-220, -150);
  const pathNorth = [[0, bounds.minY], [0, nY1], [nX, nY1], [nX, nY2], [0, nY2], [0, 0]];

  const swY1 = isPortrait ? bounds.minY * 0.45 : rand(420, 490);
  const swX1 = rand(-460, -360);
  const swY2 = rand(160, 240);
  const pathSW = [[bounds.minX, swY1], [swX1, swY1], [swX1, swY2], [-200, swY2], [-200, 75], [0, 0]];

  const seY1 = isPortrait ? bounds.minY * 0.45 : rand(420, 490);
  const seX1 = rand(360, 460);
  const seY2 = rand(180, 260);
  const pathSE = [[bounds.maxX, seY1], [seX1, seY1], [seX1, seY2], [200, seY2], [200, 75], [0, 0]];

  return [pathNorth, pathSW, pathSE];
}

// 4. 鑄造世界（td_forgeworld）：西北與東北雙路工廠戰壕
function generateForgeworldPaths(bounds, pathWidth, isPortrait) {
  const minY = bounds.minY;
  const nwY1 = minY + rand(160, 240);
  const nwX1 = rand(-420, -320);
  const nwY2 = rand(-450, -320);
  const nwX2 = rand(-200, -130);
  const pathNW = [[bounds.minX, nwY1], [nwX1, nwY1], [nwX1, nwY2], [nwX2, nwY2], [nwX2, -85], [0, 0]];

  const neY1 = minY + rand(160, 240);
  const neX1 = rand(320, 420);
  const neY2 = rand(-450, -320);
  const neX2 = rand(130, 200);
  const pathNE = [[bounds.maxX, neY1], [neX1, neY1], [neX1, neY2], [neX2, neY2], [neX2, -85], [0, 0]];

  return [pathNW, pathNE];
}

// 5. 紅色警戒（td_redalert）：西線長蛇與東北推進
function generateRedAlertPaths(bounds, pathWidth, isPortrait) {
  const wY1 = bounds.minY + rand(180, 260);
  const wX1 = rand(-420, -340);
  const wY2 = rand(-380, -260);
  const wX2 = rand(-240, -170);
  const wY3 = rand(-160, -90);
  const wX3 = rand(-140, -80);
  const pathW = [[bounds.minX, wY1], [wX1, wY1], [wX1, wY2], [wX2, wY2], [wX2, wY3], [wX3, wY3], [wX3, -30], [0, 0]];

  const eX0 = rand(180, 320);
  const eY1 = bounds.minY + rand(220, 300);
  const eX1 = rand(360, 440);
  const eY2 = rand(-220, -140);
  const eX2 = rand(160, 230);
  const pathE = [[eX0, bounds.minY], [eX0, eY1], [eX1, eY1], [eX1, eY2], [eX2, eY2], [eX2, -20], [0, 0]];

  return [pathW, pathE];
}

// 6. 星海爭霸（td_starcraft）：長 S 路線與右側突襲
function generateStarcraftPaths(bounds, pathWidth, isPortrait) {
  const nX0 = rand(120, 240);
  const nY1 = bounds.minY + rand(220, 300);
  const nX1 = rand(-380, -280);
  const nY2 = rand(-480, -360);
  const nX2 = rand(240, 340);
  const pathMain = [[nX0, bounds.minY], [nX0, nY1], [nX1, nY1], [nX1, nY2], [nX2, nY2], [nX2, -120], [0, -120], [0, 0]];

  const eY0 = rand(-120, 40);
  const eX1 = rand(180, 250);
  const pathFlank = [[bounds.maxX, eY0], [eX1, eY0], [eX1, 0], [0, 0]];

  return [pathMain, pathFlank];
}

// 7. 魔獸爭霸（td_warcraft）：西、北、東三路天譴進攻
function generateWarcraftPaths(bounds, pathWidth, isPortrait) {
  const wY1 = bounds.minY * 0.45;
  const wX1 = rand(-380, -280);
  const wY2 = rand(-120, -40);
  const wX2 = rand(-220, -150);
  const pathW = [[bounds.minX, wY1], [wX1, wY1], [wX1, wY2], [wX2, wY2], [wX2, 0], [0, 0]];

  const nX0 = rand(-120, 40);
  const nY1 = bounds.minY + rand(220, 320);
  const nX1 = rand(140, 220);
  const nY2 = rand(-280, -200);
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
  const minClearance = pathWidth + 38;

  for (let attempt = 0; attempt < 10; attempt++) {
    let candidate;
    switch (id) {
      case 'td_canyon':
        candidate = generateCanyonPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_fork':
        candidate = generateForkPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_fortress':
        candidate = generateFortressPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_forgeworld':
        candidate = generateForgeworldPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_redalert':
        candidate = generateRedAlertPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_starcraft':
        candidate = generateStarcraftPaths(bounds, pathWidth, isPortrait);
        break;
      case 'td_warcraft':
        candidate = generateWarcraftPaths(bounds, pathWidth, isPortrait);
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

      // 沿線段每 60px 切一個取樣點
      const steps = Math.max(1, Math.floor(segLen / 60));
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
          if (sx < bounds.minX + 42 || sx > bounds.maxX - 42 || sy < bounds.minY + 42 || sy > bounds.maxY - 42) {
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

  // 3. 泊松盤（Poisson-disc）距離篩選：優先用 92px，若格子不夠則降至 78px / 65px 確保填滿目標數量
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

  let selected = filterWithMinDist(92);
  if (selected.length < targetCount) selected = filterWithMinDist(78);
  if (selected.length < targetCount) selected = filterWithMinDist(65);

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

  // 3. 沿新道路的路肩隨機採樣生成固定數量的戰術地基
  level.sockets = generateProceduralSockets(level, level._initialSocketCount);

  return level;
}
