// 地面繪製管線：地表材質磚（程序化烘焙）、地板底色與格線、世界邊界、
// 全域色調 overlay、暗角、地面殘跡（血漬／焦痕）。
//
// 為什麼獨立成一個模組：這條管線佔 main.js 約 860 行，而且它跟遊戲邏輯幾乎無關 ——
// 只依賴「當下的相機、視窗大小、關卡主題、地面殘跡陣列」。搬出來之後 main.js 只留
// 主迴圈、狀態機與系統接線，材質要調也只要開這一個檔案。
//
// 快取全部留在實例上（地表磚、暗角畫布、底色漸層），換局沿用、不重烘。

import { GAME_CONFIG, FX } from '../config.js';
import { LEVELS } from '../levels.js';
import { drawTerrain } from './Terrain.js';
import { makeFbm, reliefDot, bevelRect, reliefCrack, starPoint } from './Texture.js';

export class GroundRenderer {
  constructor() {
    this.textures = null;      // 各關地表磚 (key = level id)
  }

  drawColorGrade(ctx, vw, vh, level) {
    this.ctx = ctx; this.vw = vw; this.vh = vh; this.level = level;
    const theme = (this.level || LEVELS.street).theme;
    const gr = theme && theme.grade;
    if (!gr) return;
    const g = ctx.createLinearGradient(0, 0, 0, this.vh);
    g.addColorStop(0, `rgba(${gr.c1},${gr.a1})`);
    g.addColorStop(0.55, `rgba(${gr.c1},${(gr.a1 * 0.4).toFixed(4)})`);
    g.addColorStop(1, `rgba(${gr.c2},${gr.a2})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  drawVignette(ctx, vw, vh, level) {
    this.ctx = ctx; this.vw = vw; this.vh = vh; this.level = level;
    // ponytail: 暗角烘焙進離屏 canvas，每幀只做一次 drawImage
    const vigLevel = this.level || LEVELS.street;
    const vigMult = (vigLevel.theme && vigLevel.theme.vignette) || 1;
    if (!this._vigCanvas || this._vigCanvas.width !== Math.round(this.vw) ||
        this._vigCanvas.height !== Math.round(this.vh) || this._vigKey !== vigLevel.id) {
      const oc = document.createElement('canvas');
      oc.width = Math.max(1, Math.round(this.vw));
      oc.height = Math.max(1, Math.round(this.vh));
      const octx = oc.getContext('2d');
      const g = octx.createRadialGradient(
        this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.22,
        this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.72
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, `rgba(0,0,0,${(0.28 * vigMult).toFixed(3)})`);
      g.addColorStop(1, `rgba(0,0,0,${(0.72 * vigMult).toFixed(3)})`);
      octx.fillStyle = g;
      octx.fillRect(0, 0, oc.width, oc.height);
      this._vigCanvas = oc;
      this._vigKey = vigLevel.id;
    }
    this.ctx.drawImage(this._vigCanvas, 0, 0, this.vw, this.vh);
  }

  // ── 對外入口 ────────────────────────────────────────────────
  // 地面繪製需要「當下的相機與視窗」，但這些屬於 Game。為了讓搬過來的實作逐字
  // 不變（this.ctx / this.level / this.vw / this.vh / this.gameTime 照舊），
  // 入口先把這些狀態綁到實例上再執行。GroundRenderer 沒有自己的遊戲狀態，
  // 快取（紋理磚、暗角畫布、底色漸層）留在這裡，換局時沿用。
  drawFloorGrid(ctx, level, camera, vw, vh, gameTime) {
    this.ctx = ctx; this.level = level; this.camera = camera;
    this.vw = vw; this.vh = vh; this.gameTime = gameTime;
    const W = this.vw;
    const H = this.vh;

    ctx.save();

    // 地板底色漸層 (顏色由關卡主題決定)
    const theme = (this.level || LEVELS.street).theme;
    if (!this._floorGrad || this._floorGradH !== H || this._floorTheme !== theme) {
      const fg = ctx.createLinearGradient(0, 0, 0, H);
      fg.addColorStop(0, theme.top);
      fg.addColorStop(0.55, theme.mid);
      fg.addColorStop(1, theme.bottom);
      this._floorGrad = fg;
      this._floorGradH = H;
      this._floorTheme = theme;
    }
    ctx.fillStyle = this._floorGrad;
    ctx.fillRect(0, 0, W, H);

    // Soulstone 風格地面質感層：汙漬色塊 + 每關專屬地表材質 (畫在網格之下)
    // 材質細節每關烘焙成一片世界錨定的無接縫紋理磚，逐幀只做 drawImage 拼貼
    const groundTex = this.getGroundTexture(this.level || LEVELS.street);
    const gTile = groundTex.width;
    const gOx = -(((camera.x % gTile) + gTile) % gTile);
    const gOy = -(((camera.y % gTile) + gTile) % gTile);
    // 磚 1024 已大於手機螢幕、在 1280×720 桌面上也只重複 1.25×0.7 次，肉眼幾乎
    // 找不到週期，因此不做逐磚鏡射 —— 鏡射雖然同樣可平鋪，但會在磚界製造
    // 「同一塊汙漬左右對稱」的假影，對有明顯特徵的材質反而更假。
    for (let gy = gOy; gy < H; gy += gTile) {
      for (let gx = gOx; gx < W; gx += gTile) {
        ctx.drawImage(groundTex, gx, gy);
      }
    }

    // 宏觀地形層 (道路/板塊/冰原/岩漿渠道/裂縫 + 大型地標 + 隨時間劣化)
    // 畫在地表材質之上、格線之下：讀起來像「地板上的結構」，格線保持為戰術疊層
    drawTerrain(ctx, camera, this.level || LEVELS.street, W, H, this.gameTime);

    // 細格線 + 每 N 格一條主格線，強化移動感。
    // 格距/主線週期/虛線由關卡 theme.gridStyle 決定 —— 原本五關都是 grid 64、
    // 每 4 格一條主線的同一套格線，是「關卡只差色相」的最後一個來源。
    const gs = theme.gridStyle || {};
    const grid = gs.size || 64;
    const majorEvery = gs.major || 4;
    const dash = gs.dash || 0;
    const ox = -(((camera.x % grid) + grid) % grid);
    const oy = -(((camera.y % grid) + grid) % grid);
    const majorX = Math.floor(camera.x / grid);
    const majorY = Math.floor(camera.y / grid);
    if (dash > 0) ctx.setLineDash([dash, dash]);

    for (let i = 0, x = ox; x < W + grid; i++, x += grid) {
      const major = (majorX + i) % majorEvery === 0;
      ctx.strokeStyle = major ? theme.major : theme.grid;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
      ctx.stroke();
    }
    for (let i = 0, y = oy; y < H + grid; i++, y += grid) {
      const major = (majorY + i) % majorEvery === 0;
      ctx.strokeStyle = major ? theme.major : theme.grid;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
      ctx.stroke();
    }
    if (dash > 0) ctx.setLineDash([]);

    // 地圖邊界警示線 (發光紅牆)
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    const bMinX = bounds.minX - camera.x;
    const bMaxX = bounds.maxX - camera.x;
    const bMinY = bounds.minY - camera.y;
    const bMaxY = bounds.maxY - camera.y;

    ctx.shadowColor = theme.bounds;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = theme.bounds;
    ctx.lineWidth = 3;
    ctx.strokeRect(bMinX, bMinY, bMaxX - bMinX, bMaxY - bMinY);

    ctx.restore();
  }

  // 程序化地面材質烘焙 (Soulstone 風格參考)：世界座標雜湊決定汙漬與材質細節，
  // 結果烘進一片無接縫紋理磚，之後每幀只做 drawImage。紋理/材質種類由
  // levels.js theme.ground.motif / material 資料決定。
  getGroundTexture(level) {
    const id = (level && level.id) || 'street';
    if (this._groundTextures && this._groundTextures[id]) return this._groundTextures[id];

    // 世界錨定的接縫消除：先把細節畫在一片比成品大 2×PAD 的畫布上，
    // 再裁出中央區塊當磚。跨磚界的柔光汙漬光暈照常接合，不會出現週期接縫。
    // 磚放大到 1024：768 在 1280 寬的視野裡只重複 1.7 次，週期很容易被眼睛抓到；
    // 放大後同樣一屏只看得到 1.25 次，加上逐磚翻轉（見 drawFloorGrid）就不明顯了。
    // P 必須是 LATTICE 的整數倍，雜訊的格點才對得上磚界。
    const T = 1024;           // 成品磚大小
    const P = 256;            // 出血區 (涵蓋最大光暈半徑與裂縫漂移)
    const B = T + P * 2;
    const LATTICE = 128;      // 雜訊格點大小 (世界單位)
    const PERIOD = T / LATTICE;   // 雜訊週期 = 磚寬，這是「平鋪不接縫」的關鍵

    const big = document.createElement('canvas');
    big.width = big.height = B;
    const bx = big.getContext('2d');

    const g = level.theme && level.theme.ground;
    const seed = this._groundSeed(id);
    const h = (cx, cy, k) => {
      const s = Math.sin(cx * 127.1 + cy * 311.7 + (seed + k * 74.7)) * 43758.5453;
      return s - Math.floor(s);
    };
    // 可平鋪雜訊：dirt 管大面積汙漬/團塊，fine 管顆粒聚集與細節強度。
    // 兩者都以磚寬為週期，所以磚的右緣與下一張的左緣完全接得上。
    const densityBase = (g && g.density && g.density.base != null) ? g.density.base : 1;
    const dirt = makeFbm(seed + 31, PERIOD, 4);
    const nl = (px, py, f = dirt, s2 = LATTICE) => f(px / s2, py / s2);

    const cell = 240;
    const c0 = Math.floor(-P / cell) - 1;
    const c1 = Math.ceil((T + P) / cell) + 1;

    // 密度旋鈕：由 levels.js 的 theme.ground.density 提供，缺欄位一律沿用引擎預設。
    // 這是「五關地表長得一樣」的根因修正 —— 原本機率/半徑/數量全部寫死在這裡，
    // 資料層完全沒有可調的餘地，所以五關只能靠色相區分。
    const dens = (g && g.density) || {};
    const stainChance = dens.stain != null ? dens.stain : 0.6;
    const stainRadiusMul = dens.stainRadius != null ? dens.stainRadius : 1;
    const motifMul = dens.motif != null ? dens.motif : 1;
    const grainMul = dens.grain != null ? dens.grain : 1;
    const accentMul = dens.accents != null ? dens.accents : 1;

    // 0) 材質底層：整張磚鋪一層低頻明暗起伏與微顆粒。
    // 為什麼需要：磚原本大部分是「透明」的，畫面上的地表其實是螢幕鎖定的底色
    // 漸層，材質只出現在細節處 → 看起來平、而且底色漸層不隨世界移動。
    // 這一層只調亮度（白/黑、極低透明度），不動色相，所以各關的色調氣氛不變。
    if (g) this._groundBase(bx, g, dirt, T, P, densityBase);

    for (let cy = c0; cy <= c1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const x = cx * cell + P;   // 磚面座標 = 世界座標 + 出血位移
        const y = cy * cell + P;
        if (!g) continue;
        const r = h(cx, cy, 1);

        // 1) 大面積汙漬：輪廓由 fBm 決定（有機色塊），再以徑向漸層填入柔邊。
        // 原本是標準圓形 + 徑向漸層 —— 五關都是同一種「圓形汙點」，
        // 這是地表看起來像色紙而不是材質的主因之一。
        if (r < stainChance) {
          const p = g.patches[r < stainChance * 0.42 ? 0 : 1];
          const px = x + r * cell * 2.6 - cell * 0.8;
          const py = y + h(cx, cy, 2) * cell * 2.6 - cell * 0.8;
          const rad = (90 + r * 170) * stainRadiusMul;
          this._noiseBlob(bx, px, py, rad, nl, 0.0042, p.c, p.a, 15);
        }

        // 2) 專屬地表紋理 (每格 1-2 筆，密度可調；r3 提供形狀/角度/鏡射變化)
        const n = 1 + Math.floor(h(cx, cy, 3) * 2 * motifMul);
        for (let k = 0; k < n; k++) {
          this._groundMotif(bx, g, x, y, cell, h(cx, cy, 4 + k), h(cx, cy, 9 + k), h(cx, cy, 14 + k));
        }

        // 3) 每格的材質微粒 (粗礫 / 刷紋 / 霜雪 / 星塵)
        if (g.material) this._groundGrain(bx, g, x, y, cell, h(cx, cy, 40), h(cx, cy, 41), h(cx, cy, 42), grainMul);
      }
    }

    // 4) 材質大範圍特徵 (油漬裂縫、鉚釘、熔岩餘燼、星點…)
    if (g && g.material) this._groundMaterialAccents(bx, g, h, T, P, accentMul, nl, seed);

    const tile = document.createElement('canvas');
    tile.width = tile.height = T;
    tile.getContext('2d').drawImage(big, P, P, T, T, 0, 0, T, T);
    if (!this._groundTextures) this._groundTextures = {};
    this._groundTextures[id] = tile;
    return tile;
  }

  _groundSeed(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
    return s;
  }

  // 材質微粒：依材質在每個格子內撒低對比顆粒，做出「材質感」而非純色地板
  // 材質底層：低頻明暗起伏（像地面的高低差）＋ 細顆粒（像砂紙的微紋理）。
  // 全部只改亮度，因此不會動到關卡色調；強度可被 theme.ground.density.base 調整。
  _groundBase(ctx, g, rnd, T, P, mul = 1) {
    const mat = g.material;
    // 低頻起伏：白/黑大色塊交錯。柏油與玄武岩起伏大，雪與金屬較平。
    const relief = mat === 'snow' ? 0.55 : mat === 'metal' ? 0.7 : 1;
    const bigN = Math.round(11 * mul * relief);
    for (let n = 0; n < bigN; n++) {
      const px = P + ((rnd(n * 3.1, 11) * 1.0 + 0.5) % 1) * T;
      const py = P + ((rnd(17, n * 2.7) * 1.0 + 0.5) % 1) * T;
      const r = 150 + rnd(n * 1.7, n * 2.3) * 260;
      const light = rnd(n * 5.3, 29) > 0.5;
      const tone = light ? '255,255,255' : '0,0,0';
      const a = (light ? 0.030 : 0.055) * mul * relief;
      this._wrapDraw(ctx, px, py, r, T, P, (x, y) => this._noiseBlob(ctx, x, y, r, rnd, 0.0026, tone, a, 16));
    }
    // 細顆粒：讓整張磚到處都有微紋理，而不是只有被雜湊選中的格子才有
    const grainN = Math.round(320 * mul);
    const gLight = mat === 'snow' ? '255,255,255' : mat === 'void' ? '225,215,255' : '210,215,225';
    const gDark = mat === 'snow' ? '120,160,200' : '0,0,0';
    for (let n = 0; n < grainN; n++) {
      const px = P + rnd(n * 1.31, 41) * T;
      const py = P + rnd(43, n * 1.17) * T;
      const light = rnd(n * 0.7, 47) > (mat === 'snow' ? 0.34 : 0.62);
      const r = 0.6 + rnd(n * 2.1, 53) * 1.9;
      const a = (light ? 0.030 : 0.045) * mul;
      ctx.fillStyle = `rgba(${light ? gLight : gDark},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 斜向受光帶：一道極淡的高光斜掃（雨後路面的濕潤感，只有柏油與金屬）
    if (mat === 'asphalt' || mat === 'metal') {
      const sg = ctx.createLinearGradient(P, P + T, P + T, P);
      const tint = mat === 'metal' ? '190,255,225' : '150,190,235';
      sg.addColorStop(0, `rgba(${tint},0)`);
      sg.addColorStop(0.48, `rgba(${tint},${(0.022 * mul).toFixed(3)})`);
      sg.addColorStop(0.62, `rgba(${tint},${(0.014 * mul).toFixed(3)})`);
      sg.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = sg;
      ctx.fillRect(P, P, T, T);
    }
  }

  // 材質微粒：每一顆都帶方向光（左上亮、右下暗），因此讀起來是「凸起」而不是貼紙。
  // 顏色與粒徑逐材質不同：柏油是黑色骨材 + 少量反光石英、金屬是細微刷痕亮點、
  // 雪是霜晶高光、熔岩是玄武岩碎屑、深淵是星塵。
  _groundGrain(ctx, g, x, y, cell, r1, r2, r3, mul = 1) {
    const mat = g.material;
    const base = mat === 'snow' ? 7 : mat === 'metal' ? 2 : 2 + Math.floor(r1 * 4);
    const count = Math.max(1, Math.round(base * mul));
    for (let i = 0; i < count; i++) {
      const gx = x + ((r2 + i * 0.31) % 1) * cell;
      const gy = y + ((r3 + i * 0.17) % 1) * cell;
      const rad = 0.7 + ((r2 * 7 + i) % 1) * 1.7;
      if (mat === 'snow') {
        reliefDot(ctx, gx, gy, rad, '226,240,255', 0.12 + r1 * 0.14, 0.9);
      } else if (mat === 'metal') {
        reliefDot(ctx, gx, gy, rad * 0.75, '190,215,205', 0.05 + r1 * 0.05, 0.7);
      } else if (mat === 'lava') {
        reliefDot(ctx, gx, gy, rad, '26,16,12', 0.55, 0.8);
      } else if (mat === 'void') {
        reliefDot(ctx, gx, gy, rad * 0.7, '210,195,255', 0.07 + r1 * 0.15, 0.6);
      } else {
        // asphalt：深色骨材為主，混入少量反光的石英粒
        if (r1 > 0.82) reliefDot(ctx, gx, gy, rad * 0.8, '150,158,170', 0.16, 1.0);
        else reliefDot(ctx, gx, gy, rad, '24,24,28', 0.14 + r1 * 0.12, 0.85);
      }
    }
  }

  // 有機色塊：輪廓由 fBm 調變（不是圓），填入柔邊的徑向漸層。
  // points 越多輪廓越圓滑；freq 是雜訊頻率（越小團塊越大）。
  _noiseBlob(ctx, cx, cy, baseR, nl, freq, rgb, alpha, points = 14) {
    const pts = [];
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const n = nl(cx + Math.cos(a) * baseR * 1.3, cy + Math.sin(a) * baseR * 1.3);
      const r = baseR * (1.05 + (n - 0.5) * 0.9);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.clip();
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.5);
    grad.addColorStop(0, `rgba(${rgb},${alpha})`);
    grad.addColorStop(0.6, `rgba(${rgb},${alpha * 0.75})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - baseR * 1.8, cy - baseR * 1.8, baseR * 3.6, baseR * 3.6);
    ctx.restore();
  }

  // 沿雜訊蜿蜒的折線（裂縫、刷痕、管線都用它）
  _noiseLine(x0, y0, len, angle, nl, segs = 5, wander = 26, freq = 0.0035) {
    const pts = [[x0, y0]];
    let px = x0;
    let py = y0;
    for (let i = 1; i <= segs; i++) {
      const a = angle + (nl(px + i * 37, py + i * 53) - 0.5) * 0.7;
      const l = len / segs;
      px += Math.cos(a) * l;
      py += Math.sin(a) * l;
      pts.push([px, py]);
      px += (nl(px, py, undefined, 1 / 1) - 0.5) * wander * freq * 220;
      py += (nl(py + 11, px + 7) - 0.5) * wander * freq * 220;
    }
    return pts;
  }

  // 材質大範圍特徵。中心點都收進「安全帶」([P+m, T-(P+m)])，讓放射狀光暈
  // 完整落在成品磚內，磚界才不會切到半顆光暈。
  // 材質大範圍特徵。每種材質分成 3~5 層（骨材/接縫/汙染/植被或冰霜/發光），
  // 而不是單一種筆觸刷滿整張。所有大面積特徵都經過 _wrapDraw 做磚界環繞，
  // 因此可以任意擺放而不會出現接縫 —— 原本只能靠「安全帶」把特徵擠在磚中央。
  _groundMaterialAccents(ctx, g, h, T, P, mul = 1, nl = null, seed = 0) {
    const mat = g.material;
    const N = (n) => Math.max(1, Math.round(n * mul));
    const bandX = (n, a, maxR = 10) => P + (maxR + h(n, a, 0) * (T - maxR * 2));
    const bandY = (n, a, maxR = 10) => P + (maxR + h(n, a, 1) * (T - maxR * 2));
    const noise = nl || (() => 0.5);
    const wrap = (px, py, r, fn) => this._wrapDraw(ctx, px, py, r, T, P, fn);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (mat === 'asphalt') {
      // 1) 骨材：三種粒徑，依 fBm 聚集（低窪處積得多、平坦處稀疏）
      for (let n = 0; n < N(240); n++) {
        const px = bandX(n, 3, 6);
        const py = bandY(n, 4, 6);
        const dens = noise(px, py);
        if (dens < 0.36) continue;
        const big = h(n, 5, 0) > 0.88;
        const size = 0.7 + h(n, 6, 0) * (big ? 3.6 : 1.5);
        // 骨材必須有明有暗才看得出質感：純深色顆粒疊在深色柏油上等於沒有。
        // 石英反光粒 ~12%、淺灰骨材 ~35%、其餘深色。
        const roll = h(n, 7, 0);
        const tone = roll > 0.88 ? '186,192,204' : (roll > 0.53 ? '78,84,98' : '12,12,15');
        const al = roll > 0.88 ? 0.6 : (roll > 0.53 ? 0.42 : 0.5);
        wrap(px, py, size + 2, (x, y) => reliefDot(ctx, x, y, size, tone, al, roll > 0.53 ? 1 : 0.85));
      }
      // 2) 柏油補丁：顏色略深、邊緣受光
      for (let n = 0; n < N(3); n++) {
        const px = P + h(n, 20, 0) * T;
        const py = P + h(n, 21, 0) * T;
        const r = 70 + h(n, 22, 0) * 110;
        wrap(px, py, r + 10, (x, y) => {
          this._noiseBlob(ctx, x, y, r, noise, 0.004, '10,10,13', 0.5, 13);
          ctx.strokeStyle = 'rgba(255,255,255,0.035)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        });
      }
      // 3) 瀝青填縫：蜿蜒的暗溝 + 受光下緣
      for (let n = 0; n < N(6); n++) {
        const x0 = bandX(n, 30, 150);
        const y0 = bandY(n, 31, 150);
        const ang = h(n, 32, 0) * Math.PI * 2;
        const pts = this._noiseLine(x0, y0, 130 + h(n, 33, 0) * 170, ang, noise, 5, 34);
        reliefCrack(ctx, pts, 1.5, 0.8);
      }
      // 4) 人孔蓋：斜面鐵蓋 + 內圈刻紋
      for (let n = 0; n < N(2); n++) {
        const px = bandX(n, 40, 60);
        const py = bandY(n, 41, 60);
        const r = 32 + h(n, 42, 0) * 10;
        wrap(px, py, r + 12, (x, y) => {
          const gg = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
          gg.addColorStop(0, 'rgba(96,100,112,0.55)');
          gg.addColorStop(0.7, 'rgba(46,48,56,0.6)');
          gg.addColorStop(1, 'rgba(14,14,18,0.65)');
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(150,155,168,0.28)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1.4;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42);
            ctx.lineTo(x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74);
            ctx.stroke();
          }
        });
      }
      // 5) 油漬與霓虹反光：雨後路面的鏡面感（商業街的招牌倒影）
      for (let n = 0; n < N(2); n++) {
        const px = P + h(n, 50, 0) * T;
        const py = P + h(n, 51, 0) * T;
        const r = 90 + h(n, 52, 0) * 90;
        wrap(px, py, r + 12, (x, y) => {
          this._noiseBlob(ctx, x, y, r, noise, 0.005, '8,10,16', 0.55, 12);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const sg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
          sg.addColorStop(0, 'rgba(0,229,255,0)');
          sg.addColorStop(0.5, 'rgba(0,229,255,0.055)');
          sg.addColorStop(1, 'rgba(255,45,149,0.045)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 0.85, r * 0.34, -0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }
    } else if (mat === 'metal') {
      // 1) 水平刷紋：間距整除磚寬，且逐條明暗不同（原本固定間距 84，接磚會斷一截）
      const step = T / Math.round(T / 84);
      for (let y = 0; y < T; y += step) {
        const a = 0.035 + noise(P + 40, P + y) * 0.075;
        ctx.fillStyle = `rgba(210,240,230,${a.toFixed(3)})`;
        ctx.fillRect(P, P + y, T, 1.3);
        if ((y / step) % 3 === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          ctx.fillRect(P, P + y + 1.6, T, 1);
        }
      }
      // 2) 大型金屬板塊：斜面接縫 + 沿縫的鉚釘
      const panels = 2;
      const ps = T / panels;
      for (let i = 0; i < panels; i++) {
        for (let j = 0; j < panels; j++) {
          bevelRect(ctx, P + i * ps + 3, P + j * ps + 3, ps - 6, ps - 6, 0.15, 0.40, 2.6);
        }
      }
      for (let n = 0; n < N(22); n++) {
        const along = noise(P + n * 13, P + n * 29) * T;
        const px = n % 2 === 0 ? P + Math.round(n / 2) * ps : P + along;
        const py = n % 2 === 0 ? P + along : P + Math.round(n / 2) * ps;
        wrap(px, py, 8, (x, y) => reliefDot(ctx, x, y, 2.6, '176,198,188', 0.6, 1.25));
      }
      // 3) 鏽蝕擴散：暖褐色色塊，集中在接縫附近
      for (let n = 0; n < N(7); n++) {
        const edge = n % 2 === 0;
        const px = edge ? P + Math.round(h(n, 60, 0) * panels) * ps : P + h(n, 61, 0) * T;
        const py = edge ? P + h(n, 62, 0) * T : P + Math.round(h(n, 63, 0) * panels) * ps;
        const r = 22 + h(n, 64, 0) * 42;
        wrap(px, py, r + 8, (x, y) => this._noiseBlob(ctx, x, y, r, noise, 0.0085, '104,58,30', 0.22, 12));
      }
      // 4) 警示斜紋 + 模板圓章
      const hzX = bandX(70, 71, 130);
      const hzY = bandY(70, 72, 130);
      ctx.save();
      ctx.beginPath();
      ctx.rect(hzX, hzY, 168, 26);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,190,60,0.16)';
      ctx.fillRect(hzX, hzY, 168, 26);
      ctx.fillStyle = 'rgba(20,22,26,0.5)';
      for (let k = -3; k < 12; k++) {
        ctx.save();
        ctx.translate(hzX + k * 22, hzY);
        ctx.rotate(-0.5);
        ctx.fillRect(0, -6, 9, 40);
        ctx.restore();
      }
      ctx.restore();
      const stX = bandX(74, 75, 60);
      const stY = bandY(74, 76, 60);
      ctx.strokeStyle = 'rgba(0,245,155,0.13)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(stX, stY, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(stX, stY, 30, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mat === 'snow') {
      // 1) 雪堆起伏：大面積 fBm 色塊，受光側偏亮
      for (let n = 0; n < N(5); n++) {
        const px = P + h(n, 80, 0) * T;
        const py = P + h(n, 81, 0) * T;
        const r = 120 + h(n, 82, 0) * 130;
        wrap(px, py, r + 14, (x, y) => {
          this._noiseBlob(ctx, x, y, r, noise, 0.003, '255,255,255', 0.075, 16);
          this._noiseBlob(ctx, x - r * 0.25, y - r * 0.25, r * 0.65, noise, 0.005, '235,248,255', 0.07, 14);
        });
      }
      // 2) 風紋：平行的低振幅波紋（亮/暗成對）
      const windA = -0.28;
      for (let n = 0; n < N(9); n++) {
        const y0 = P + (n + 0.5) * (T / 9);
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          pts.push([P + t * T, y0 + Math.sin(t * 5 + n) * 14 + (noise(P + t * T, y0) - 0.5) * 26]);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.055)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(120,180,220,0.05)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1] + 5);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1] + 5);
        ctx.stroke();
      }
      // 3) 霜晶閃光：只在 fine 雜訊高的地方冒（稀疏但亮）
      for (let n = 0; n < N(70); n++) {
        const px = bandX(n, 90, 6);
        const py = bandY(n, 91, 6);
        if (noise(px * 1.7, py * 1.7) < 0.62) continue;
        const s = 0.9 + h(n, 92, 0) * 1.9;
        wrap(px, py, 5, (x, y) => starPoint(ctx, x, y, s, 0.5 + h(n, 93, 0) * 0.4, s > 2));
      }
      // 4) 露出冰面：偏藍的冰塊 + 亮邊
      for (let n = 0; n < N(2); n++) {
        const px = P + h(n, 96, 0) * T;
        const py = P + h(n, 97, 0) * T;
        const r = 90 + h(n, 98, 0) * 90;
        wrap(px, py, r + 12, (x, y) => {
          this._noiseBlob(ctx, x, y, r, noise, 0.0035, '150,205,240', 0.16, 15);
          ctx.strokeStyle = 'rgba(235,250,255,0.22)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        });
      }
    } else if (mat === 'lava') {
      // 1) 玄武岩板塊：多邊形塊體 + 斜面
      for (let n = 0; n < N(9); n++) {
        const px = P + h(n, 100, 0) * T;
        const py = P + h(n, 101, 0) * T;
        const r = 60 + h(n, 102, 0) * 90;
        wrap(px, py, r + 10, (x, y) => {
          this._noiseBlob(ctx, x, y, r, noise, 0.0045, '18,10,8', 0.55, 9);
          ctx.strokeStyle = 'rgba(255,150,60,0.14)';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
      // 2) 岩漿裂縫網：暗溝 + 白熱核心 + 沿縫餘燼（烘焙時用 shadowBlur 做光暈，
      //    這是開場一次性成本，不影響每幀）
      for (let n = 0; n < N(7); n++) {
        const x0 = bandX(n, 110, 170);
        const y0 = bandY(n, 111, 170);
        const ang = h(n, 112, 0) * Math.PI * 2;
        const pts = this._noiseLine(x0, y0, 150 + h(n, 113, 0) * 200, ang, noise, 6, 40);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
        ctx.save();
        ctx.shadowColor = '#ff7700';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = 'rgba(255,132,20,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,232,170,0.9)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();
        for (let k = 1; k < pts.length; k++) {
          const ex = pts[k][0];
          const ey = pts[k][1];
          wrap(ex, ey, 10, (x, y) => {
            ctx.save();
            ctx.shadowColor = '#ff9500';
            ctx.shadowBlur = 10;
            reliefDot(ctx, x, y, 1.6 + h(n * 7 + k, 120, 0) * 2.2, '255,160,40', 0.85, 0.6);
            ctx.restore();
          });
        }
      }
      // 3) 冷卻地殼：暗色塊 + 微弱暖邊
      for (let n = 0; n < N(5); n++) {
        const px = P + h(n, 130, 0) * T;
        const py = P + h(n, 131, 0) * T;
        const r = 50 + h(n, 132, 0) * 70;
        wrap(px, py, r + 8, (x, y) => {
          this._noiseBlob(ctx, x, y, r, noise, 0.006, '12,8,7', 0.5, 11);
          this._noiseBlob(ctx, x + 6, y + 6, r * 0.6, noise, 0.008, '70,26,10', 0.18, 10);
        });
      }
    } else if (mat === 'void') {
      // 1) 星雲：低透明度的紫紅雲團，多層疊加
      for (let n = 0; n < N(4); n++) {
        const px = P + h(n, 140, 0) * T;
        const py = P + h(n, 141, 0) * T;
        const r = 130 + h(n, 142, 0) * 150;
        const tone = n % 2 === 0 ? '120,70,220' : '190,70,190';
        wrap(px, py, r + 16, (x, y) => this._noiseBlob(ctx, x, y, r, noise, 0.0028, tone, 0.085, 17));
      }
      // 2) 星點：大小與亮度由雜訊決定，亮星帶十字星芒
      for (let n = 0; n < N(120); n++) {
        const px = bandX(n, 150, 5);
        const py = bandY(n, 151, 5);
        const dens = noise(px * 1.4, py * 1.4);
        if (dens < 0.42) continue;
        const s = 0.6 + h(n, 152, 0) * (dens > 0.78 ? 2.6 : 1.1);
        wrap(px, py, 6, (x, y) => starPoint(ctx, x, y, s, 0.35 + dens * 0.55, s > 1.7));
      }
      // 3) 符文溝槽：帶紫光的刻線與圓弧
      ctx.save();
      ctx.shadowColor = '#b388ff';
      ctx.shadowBlur = 10;
      for (let n = 0; n < N(3); n++) {
        const px = bandX(n, 160, 120);
        const py = bandY(n, 161, 120);
        const r = 40 + h(n, 162, 0) * 60;
        ctx.strokeStyle = 'rgba(190,140,255,0.28)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(px, py, r, h(n, 163, 0) * 6.28, h(n, 163, 0) * 6.28 + 2.4);
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(230,210,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(px - r, py);
        ctx.lineTo(px + r, py);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // 磚界環繞：把繪製動作在需要的方向上多畫一次（位移整個磚寬）。
  // 這樣任何尺寸的特徵都能無接縫平鋪，不必把特徵擠在磚中央。
  _wrapDraw(ctx, px, py, r, T, P, fn) {
    const lx = px - P;
    const ly = py - P;
    const xs = [0];
    const ys = [0];
    if (lx < r) xs.push(T);
    if (lx > T - r) xs.push(-T);
    if (ly < r) ys.push(T);
    if (ly > T - r) ys.push(-T);
    for (const dx of xs) {
      for (const dy of ys) {
        if (dx === 0 && dy === 0) {
          fn(px, py);
        } else {
          ctx.save();
          ctx.translate(dx, dy);
          fn(px, py);
          ctx.restore();
        }
      }
    }
  }

  // r1/r2 決定位置，r3 決定「形狀」：旋轉、鏡射、尺寸分級與模板選擇。
  // 原本每個 motif 只有一種固定幾何 (lava 永遠是那兩條折線、void 永遠是同半徑圓弧)，
  // 位置只被平移 → 整張地圖的圖樣重複到會被眼睛抓出來。加上 r3 之後同一種 motif
  // 至少有多種角度/鏡射/大小組合，磚內就不再是複製貼上。
  _groundMotif(ctx, g, x, y, cell, r1, r2, r3 = 0.5) {
    const mx = x + r1 * cell;
    const my = y + r2 * cell;
    const rot = (r3 - 0.5) * 1.5;          // ±43°
    const sz = 0.75 + r3 * 0.6;            // 0.75 ~ 1.35 尺寸分級
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(rot);
    if (r3 > 0.5) ctx.scale(-1, 1);        // 一半鏡射
    switch (g.motif) {
      case 'panel': {
        // 實驗室金屬板接縫 (與主網格錯位的淡框) + 少數鉚釘
        const h2 = cell * 0.22 * sz;
        ctx.strokeStyle = g.motifColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-h2, -h2, h2 * 2, h2 * 2);
        if (r2 > 0.72) {
          ctx.fillStyle = g.accent;
          ctx.beginPath();
          ctx.arc(0, 0, 1.6 * sz, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'crystal': {
        // 雪地冰晶簇: 3-5 支半透明藍白三角 (支數與長度都吃 r3)
        ctx.fillStyle = g.motifColor;
        const base = 3 + Math.floor(r3 * 3);
        for (let i = 0; i < base; i++) {
          const a = -Math.PI / 2 + (i - (base - 1) / 2) * 0.55 + (r2 - 0.5) * 0.4;
          const len = (5 + r1 * 12 + i * 2) * sz;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a + Math.PI / 2) * 3.4, Math.sin(a + Math.PI / 2) * 3.4);
          ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
          ctx.lineTo(-Math.cos(a + Math.PI / 2) * 3.4, -Math.sin(a + Math.PI / 2) * 3.4);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'lava': {
        // 熔爐龜裂地殼: 暗色裂縫 + 透出橙紅餘燼光點 (裂縫數 2~3 且走向可變)
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.6;
        const lines = r3 > 0.6 ? 3 : 2;
        for (let i = 0; i < lines; i++) {
          const off = (i - (lines - 1) / 2) * 9;
          ctx.beginPath();
          ctx.moveTo(-13 * sz, off + (i ? 11 : -7) * sz);
          ctx.lineTo(-3 * sz, off + (i ? 4 : 2) * sz);
          ctx.lineTo(9 * sz, off + (i ? -7 : 10) * sz);
          ctx.stroke();
        }
        ctx.shadowColor = g.accent;
        ctx.shadowBlur = 8;
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        ctx.arc((r2 - 0.5) * 15, (r1 - 0.5) * 15, 1.4 + r2 * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'void': {
        // 深淵虛空: 淡紫同心弧符文 + 星塵點 (弧半徑/張角/條數都吃 r3)
        ctx.strokeStyle = g.motifColor;
        ctx.lineWidth = 1;
        const r0 = (4 + r2 * 8) * sz;
        const span = 1.6 + r3 * 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, r0, r1 * 6.283, r1 * 6.283 + span);
        ctx.stroke();
        if (r3 > 0.72) {
          ctx.beginPath();
          ctx.arc(0, 0, r0 * 0.55, r1 * 6.283 + 2, r1 * 6.283 + 2 + span);
          ctx.stroke();
        }
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        ctx.arc(11, -7, 1.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: {
        // 商業街柏油裂紋 + 偶發霓虹微光裂縫
        // 三種模板：單折線 / 分岔 / 雙折線，避免每格都是同一條裂縫
        const tmpl = Math.floor(r3 * 3) % 3;
        ctx.strokeStyle = g.motifColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (tmpl === 0) {
          ctx.moveTo(-15 * sz, (r2 - 0.5) * 17);
          ctx.lineTo(-4 * sz, (r1 - 0.5) * 10);
          ctx.lineTo(11 * sz, (r2 - 0.5) * 19);
        } else if (tmpl === 1) {
          ctx.moveTo(-16 * sz, (r2 - 0.5) * 12);
          ctx.lineTo(0, (r1 - 0.5) * 8);
          ctx.lineTo(8 * sz, (r2 - 0.5) * 16);
          ctx.moveTo(0, (r1 - 0.5) * 8);
          ctx.lineTo(-2 * sz, 13 * sz);
        } else {
          ctx.moveTo(-14 * sz, -9 * sz);
          ctx.lineTo(2 * sz, -1 * sz);
          ctx.lineTo(14 * sz, -11 * sz);
          ctx.moveTo(2 * sz, -1 * sz);
          ctx.lineTo(6 * sz, 10 * sz);
        }
        ctx.stroke();
        if (r1 > 0.62) {
          ctx.strokeStyle = g.accent;
          ctx.lineWidth = 1;
          ctx.shadowColor = g.accent;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(-6, 4);
          ctx.lineTo(6, -3);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        break;
      }
    }
    ctx.restore();
  }
  // ── 地面殘跡 (血漬/焦痕，Soulstone 風格) ──
  addDecal(decals, x, y, r, fill, alpha = 0.5, accent = null, life = FX.decalLife) {
    if (decals.length >= FX.decalCap) decals.shift();
    decals.push({
      x: x + (Math.random() - 0.5) * r * 0.4,
      y: y + (Math.random() - 0.5) * r * 0.4,
      r: r * (0.8 + Math.random() * 0.4),
      life,
      maxLife: life,
      fill,
      a: alpha,
      accent,
    });
  }

  drawDecals(ctx, cam, decals, vw, vh) {
    this.ctx = ctx; this.vw = vw; this.vh = vh; this.decals = decals;
    for (const d of this.decals) {
      const sx = d.x - cam.x;
      const sy = d.y - cam.y;
      const m = d.r + 30;
      if (sx < -m || sx > this.vw + m || sy < -m || sy > this.vh + m) continue;
      const p = d.life / d.maxLife; // 1 → 0，隨時間淡出
      ctx.save();
      ctx.globalAlpha = d.a * Math.min(1, p * 1.8);
      ctx.fillStyle = `rgba(${d.fill},0.85)`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, d.r * 0.95, d.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (d.accent) {
        ctx.globalAlpha = d.a * p;
        ctx.strokeStyle = d.accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy, d.r * 0.95, d.r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
