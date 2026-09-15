// 角色與武器外觀的門檻驗證（六組）：
//   1. 輪廓光：烘焙後的角色 frame 在「左上外緣」要有一圈比輪廓中位數亮的邊光。
//   2. 角色差異：五個角色兩兩的像素簽章必須差 > 8%（不能有人把兩隻畫成一樣）。
//   3. 材質豐富度：量化到 4bit/通道後的顏色數 ≥ 40（防「順手把漸層/紋理拔掉」）。
//   4. 手持武器：WeaponManager.drawHeldWeapons 要在玩家手部畫出外觀，每把基礎武器
//      都要有足夠像素，而且彼此簽章不同。
//   5. 彈道光暈與拖尾：苦無要畫出核心外的光暈；拖尾必須在「速度反向側」延伸，
//      而且投射物的物理（x/y/vx/vy/radius/life）不能被外觀改動。
//   6. sprite 完整性：BUILDERS 全部 key 都烘焙得出來、尺寸 > 0、不是空的。
//
// 為什麼要這支：外觀是最容易「改壞了卻沒人發現」的東西 —— smoke test 只會看有沒有
// 拋例外，但「輪廓光整圈跑到右下角」「拖尾畫在速度正方向」「兩隻角色撞衫」「手上一片
// 空白」全都是合法程式碼。這支把每一項變成可量測的數字，並輸出人眼可看的對照圖。
//
// 用法：
//   npx http-server -p 8899 -s               # 另一個終端機，專案根目錄（一定要 no-store）
//   PW_MODULE=/path/to/playwright/index.js \
//     PROBE_URL=http://127.0.0.1:8899/index.html node tools/verify-art.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright（PW_MODULE 可指向絕對路徑）。
// 對照圖寫到 /tmp/art/（可用 ART_OUT 覆蓋）：chars.png / weapons.png / held.png。
//
// 這支工具刻意「缺 API 就明確 FAIL」：第 4 組在沒有 drawHeldWeapons 的舊版會直接紅，
// 而不是丟 TypeError 中斷整支工具（六組要能一次跑完，才知道壞了幾組）。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const fs = await import('node:fs');
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const OUT_DIR = process.env.ART_OUT || '/tmp/art';

const browser = await pw.chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0].slice(0, 140)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

let payload = null;
try {
  payload = await page.evaluate(async () => {
    // 匯入路徑一律用 new URL(…, document.baseURI)：本機是 "/"、GitHub Pages 是
    // "/gaga-survivor/"，寫死絕對路徑在線上會 404（實測踩過）。
    const imp = (p) => import(new URL(p, document.baseURI).href);

    const out = [];
    const notes = [];
    const shots = {};
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });

    const { getSprite, blit, FRAMES } = await imp('js/sprites.js');
    const { CHARACTERS, CHARACTER_ORDER } = await imp('js/characters.js');
    const { Projectile } = await imp('js/entities/Projectile.js');

    // ── 共用小工具 ──────────────────────────────────────────────────────
    const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const data = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[s.length >> 1]; };
    const CHARS = CHARACTER_ORDER.map((id) => CHARACTERS[id].sprite);

    // ── 1) 輪廓光（左上外緣）────────────────────────────────────────────
    // 量法：sprite 是不透明底（alpha 門檻 40）的剪影，「輪廓像素」= 剪影中 8 鄰域有
    // 透明像素者；「左上外緣像素」= 左、上、左上三個鄰居都在剪影外者（外法線指向左上，
    // 也就是側光該打到的那一圈）。亮度取 RGB（非預乘，所以半透明的邊光也讀得到顏色）。
    // 通過條件：左上外緣像素裡「亮於全輪廓亮度中位數 + delta」的數量 ≥ minBright
    //   而且占比 ≥ minFrac —— 邊光是一整「圈」，只亮一小塊不算。
    //
    // 門檻是實測校正出來的（改動前 → 目前的材質層，亮點數／占比）：
    //   duck 0/36（0%）→ 30/31（97%）｜rabbit 0/38（0%）→ 30/31（97%）
    //   penguin 0/27（0%）→ 23/30（77%）｜cat 21/41（51%）→ 27/28（96%）
    //   mechanic 18/39（46%）→ 32/32（100%）
    // 舊版的喵喵（懸浮無人機的青色光暈）與阿鴨（安全帽黃色亮面）在左上外緣本來就有
    // 一坨亮點（21 與 18 個），所以「數量門檻」必須 > 21 才會紅；但只看數量在
    // sprite 大小/相位變動時很不穩，改成看「占比 0.7」：舊版那兩隻只有 0.51/0.46
    // （亮點集中在無人機那一小段，不是一圈），新版最低是 0.77。
    // 註：這條量的是「左上比整圈亮」＝邊光的方向性。只加一圈均勻亮光暈會讓整圈
    // 一樣亮，數值反而更差（實測 Δ23~60），所以材質層是「深色外框 + 左上亮邊」。
    const RIM = { mask: 40, delta: 26, minBright: 12, minFrac: 0.7 };
    const rimStats = (canvas) => {
      const w = canvas.width; const h = canvas.height;
      const d = data(canvas);
      const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
      const L = (x, y) => { const i = (y * w + x) * 4; return lum(d[i], d[i + 1], d[i + 2]); };
      const edge = []; const corner = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (A(x, y) < RIM.mask) continue;
          const out8 = A(x - 1, y) < RIM.mask || A(x + 1, y) < RIM.mask || A(x, y - 1) < RIM.mask || A(x, y + 1) < RIM.mask
            || A(x - 1, y - 1) < RIM.mask || A(x + 1, y - 1) < RIM.mask
            || A(x - 1, y + 1) < RIM.mask || A(x + 1, y + 1) < RIM.mask;
          if (!out8) continue;
          edge.push(L(x, y));
          if (A(x - 1, y) < RIM.mask && A(x, y - 1) < RIM.mask && A(x - 1, y - 1) < RIM.mask) corner.push(L(x, y));
        }
      }
      const med = median(edge);
      const bright = corner.filter((v) => v > med + RIM.delta).length;
      const rimMed = median(corner);
      const frac = corner.length ? bright / corner.length : 0;
      return { med, rimMed, corner: corner.length, bright, frac };
    };
    try {
      for (const key of CHARS) {
        const st = rimStats(getSprite(key).frames[0]);
        ok(`[輪廓光] ${key}：左上外緣 ≥ ${RIM.minBright} 個（且 ≥ ${(RIM.minFrac * 100).toFixed(0)}%）像素亮於輪廓中位數 + ${RIM.delta}`,
          st.bright >= RIM.minBright && st.frac >= RIM.minFrac && st.rimMed > st.med,
          `亮點 ${st.bright}/${st.corner}（${(st.frac * 100).toFixed(0)}%）｜左上外緣中位數 ${st.rimMed.toFixed(0)} vs 全輪廓中位數 ${st.med.toFixed(0)}（Δ${(st.rimMed - st.med).toFixed(0)}）`);
      }
    } catch (e) {
      ok('[輪廓光] 五個角色左上外緣都有邊光', false, `量測時丟例外：${e.message}`);
    }

    // ── 2) 角色之間的差異 ──────────────────────────────────────────────
    // 兩張 frame 以中心對齊放到同一尺寸的畫布上，逐像素比 RGBA；分母取兩張的聯集
    // （任一 alpha > 40 的像素），這樣「其中一張是空的」也會被抓到。
    const DIFF = { minPct: 8, channel: 24 };
    try {
      const list = CHARS.map((k) => ({ k, f: getSprite(k).frames[0] }));
      const W = Math.max(...list.map((o) => o.f.width));
      const H = Math.max(...list.map((o) => o.f.height));
      const placed = list.map((o) => {
        const c = mkCanvas(W, H);
        c.getContext('2d').drawImage(o.f, Math.round((W - o.f.width) / 2), Math.round((H - o.f.height) / 2));
        return { k: o.k, d: data(c) };
      });
      let minPct = 101; let minPair = ''; const pcts = [];
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i].d; const b = placed[j].d;
          let diff = 0; let union = 0;
          for (let p = 0; p < a.length; p += 4) {
            const aa = a[p + 3]; const ba = b[p + 3];
            if (aa <= 40 && ba <= 40) continue;
            union++;
            const dd = Math.max(Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]),
              Math.abs(a[p + 2] - b[p + 2]), Math.abs(aa - ba));
            if (dd > DIFF.channel) diff++;
          }
          const pct = union ? (diff / union) * 100 : 0;
          pcts.push(`${placed[i].k}/${placed[j].k} ${pct.toFixed(0)}%`);
          if (pct < minPct) { minPct = pct; minPair = `${placed[i].k}/${placed[j].k}`; }
        }
      }
      ok(`[角色差異] 任兩角色 frame 0 有 > ${DIFF.minPct}% 像素不同`, minPct > DIFF.minPct,
        `最小 ${minPct.toFixed(1)}%（${minPair}）｜${pcts.join('、')}`);
    } catch (e) {
      ok(`[角色差異] 任兩角色 frame 0 有 > ${DIFF.minPct}% 像素不同`, false, `量測時丟例外：${e.message}`);
    }

    // ── 3) 材質豐富度（防退化）────────────────────────────────────────
    const MAT = { minColors: 40 };
    try {
      const rows = CHARS.map((k) => {
        const d = data(getSprite(k).frames[0]);
        const set = new Set();
        for (let p = 0; p < d.length; p += 4) {
          if (d[p + 3] <= 40) continue;
          set.add(((d[p] >> 4) << 8) | ((d[p + 1] >> 4) << 4) | (d[p + 2] >> 4));
        }
        return { k, n: set.size };
      });
      const minN = Math.min(...rows.map((r) => r.n));
      ok(`[材質] 每個角色 frame 0 的 4bit 顏色數 ≥ ${MAT.minColors}`, minN >= MAT.minColors,
        rows.map((r) => `${r.k} ${r.n}`).join('、'));
    } catch (e) {
      ok(`[材質] 每個角色 frame 0 的 4bit 顏色數 ≥ ${MAT.minColors}`, false, `量測時丟例外：${e.message}`);
    }

    // ── 4) 手上武器 ────────────────────────────────────────────────────
    // 注入方式照 WeaponManager.addWeapon() 的欄位自己塞一筆（id/level/cooldownTimer/
    // isEvo/totalDamage）—— 這是它自己的最小武器物件，不必真的開一局遊戲。
    // 量測區：玩家中心右側的手部 x∈[6,34]、y∈[-14,12]（facing=1 時手在 +x 側）。
    const HELD = {
      // 從 WEAPONS 推導（只取基礎武器），新增武器時不必回來改這裡
      bases: [],
      x0: 6, x1: 34, y0: -14, y1: 12,
      minPixels: 20, alpha: 40,
    };
    // 基礎武器清單由 config 推導（含之後新增的迴力鏢/軌道炮），避免清單與資料脫節
    {
      const { WEAPONS: W } = await imp('js/config.js');
      HELD.bases = Object.values(W).filter((w) => !w.isEvo).map((w) => w.id);
    }
    const wm = window.game && window.game.weaponManager;
    const player = window.game && window.game.player;
    const heldFail = (detail) => {
      ok(`[手持武器] 每種基礎武器在手部區域 ≥ ${HELD.minPixels} 個不透明像素`, false, detail);
      ok('[手持武器] 不同武器之間的外觀簽章不同', false, detail);
    };
    if (!wm || !player) {
      heldFail('拿不到 window.game.weaponManager / window.game.player');
    } else if (typeof wm.drawHeldWeapons !== 'function') {
      heldFail('尚未實作 drawHeldWeapons');
    } else {
      let rows = null; let err = null;
      const backup = [...wm.weapons.entries()];
      const savedFacing = player.facing;
      try {
        const { WEAPONS } = await imp('js/config.js');
        const SIZE = 200;
        player.facing = 1;
        rows = HELD.bases.map((id) => {
          wm.weapons.clear();
          wm.weapons.set(id, {
            id, level: 1, cooldownTimer: 0,
            isEvo: !!(WEAPONS[id] && WEAPONS[id].isEvo), totalDamage: 0,
          });
          const c = mkCanvas(SIZE, SIZE);
          const x = c.getContext('2d');
          x.imageSmoothingEnabled = false;
          wm.drawHeldWeapons(x, { x: player.x - SIZE / 2, y: player.y - SIZE / 2 });
          const d = data(c);
          let n = 0; const sig = [];
          for (let py = 0; py < SIZE; py++) {
            for (let px = 0; px < SIZE; px++) {
              const p = (py * SIZE + px) * 4;
              if (d[p + 3] <= HELD.alpha) continue;
              const gx = px - SIZE / 2; const gy = py - SIZE / 2;
              if (gx < HELD.x0 || gx > HELD.x1 || gy < HELD.y0 || gy > HELD.y1) continue;
              n++;
              sig.push(((d[p] >> 4) << 8) | ((d[p + 1] >> 4) << 4) | (d[p + 2] >> 4));
            }
          }
          return { id, n, sig: sig.sort((a, b) => a - b).join('.') };
        });
      } catch (e) {
        err = e;
      } finally {
        // 還原遊戲狀態：武器欄與 facing 都不能被驗證工具汙染
        wm.weapons.clear();
        for (const [k, v] of backup) wm.weapons.set(k, v);
        player.facing = savedFacing;
      }
      if (err || !rows) {
        heldFail(`呼叫 drawHeldWeapons 時丟例外：${err ? err.message : '沒有結果'}`);
      } else {
        const bad = rows.filter((r) => r.n < HELD.minPixels);
        ok(`[手持武器] 每種基礎武器在手部區域 ≥ ${HELD.minPixels} 個不透明像素`, bad.length === 0,
          bad.length ? `不足：${bad.map((r) => `${r.id} ${r.n}`).join('、')}`
            : rows.map((r) => `${r.id} ${r.n}`).join('、'));
        const dup = [];
        for (let i = 0; i < rows.length; i++) {
          for (let j = i + 1; j < rows.length; j++) {
            if (rows[i].sig && rows[i].sig === rows[j].sig) dup.push(`${rows[i].id}=${rows[j].id}`);
          }
        }
        ok('[手持武器] 不同武器之間的外觀簽章不同', dup.length === 0,
          dup.length ? `外觀完全相同：${dup.join('、')}` : `${rows.length} 把武器的 4bit 顏色簽章皆不同`);
      }
    }

    // ── 5) 彈道光暈與拖尾 ──────────────────────────────────────────────
    // 光暈：核心外 ≥ gap 的像素中，alpha∈[lo,hi] 的數量（半透明 = 不是本體）。
    // 拖尾：貼著速度軸 ±band 的量測帶裡，往「速度反向」的最遠可見距離減去核心半徑。
    //   拖尾是漸層淡出的緞帶，最高 alpha 只有 ~0.5（約 127），不會有「不透明像素」，
    //   所以門檻取 alpha ≥ 16（肉眼可見）；要求 alpha ≥ 200 會什麼都量不到。
    //   這條同時能抓「拖尾畫在速度正方向」：那樣 vx=650 與 vx=0 的反向延伸會一樣長。
    const FX = {
      radius: 6, speed: 650, size: 160, big: 300,
      glowGap: 8, glowLo: 8, glowHi: 200, glowMin: 60,
      // 靜止苦無的光暈（沒有拖尾干擾）：舊版量到 13 個，新版 147~349 個 → 門檻取中間
      stillGap: 2, stillLo: 4, stillMin: 80,
      trailBand: 12, trailAlpha: 16, trailMin: 18, trailDiff: 10,
    };
    const renderP = (opts, size) => {
      const c = mkCanvas(size, size);
      const p = new Projectile(opts);
      p.seed = 1.2345;                     // 火海/光暈的動畫相位固定，量測才可重現
      p.draw(c.getContext('2d'), { x: p.x - size / 2, y: p.y - size / 2 });
      return { p, d: data(c) };
    };
    const ringCount = (d, size, radiusPx, lo, hi) => {
      const c0 = size / 2;
      let n = 0;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const a = d[(py * size + px) * 4 + 3];
          if (a < lo || a > hi) continue;
          if (Math.hypot(px - c0, py - c0) <= radiusPx) continue;
          n++;
        }
      }
      return n;
    };
    try {
      // 5a. 光暈（飛行的苦無；這張也會被拖尾貢獻，所以另有一條靜止苦無的檢查）
      const fly = renderP({ type: 'kunai', x: 0, y: 0, vx: FX.speed, vy: 0, radius: FX.radius }, FX.size);
      const glowN = ringCount(fly.d, FX.size, FX.radius + FX.glowGap, FX.glowLo, FX.glowHi);
      ok(`[光暈] 苦無核心外 ≥ ${FX.glowGap}px 還有 ≥ ${FX.glowMin} 個半透明像素（alpha∈[${FX.glowLo},${FX.glowHi}]）`,
        glowN >= FX.glowMin, `量到 ${glowN} 個（門檻 ${FX.glowMin}）`);

      // 5b. 靜止的苦無（速度 < 門檻 → 沒有拖尾）也必須有光暈，才證明光暈本身存在
      const still = renderP({ type: 'kunai', x: 0, y: 0, vx: 0, vy: 0, radius: FX.radius }, FX.size);
      const stillN = ringCount(still.d, FX.size, FX.radius + FX.stillGap, FX.stillLo, FX.glowHi);
      ok(`[光暈] 靜止的苦無（無拖尾）核心外仍有 ≥ ${FX.stillMin} 個光暈像素`,
        stillN >= FX.stillMin, `量到 ${stillN} 個（門檻 ${FX.stillMin}）`);
    } catch (e) {
      ok('[光暈] 苦無畫得出核心外的半透明光暈', false, `量測時丟例外：${e.message}`);
    }
    try {
      const back = (vx) => {
        const { d } = renderP({ type: 'kunai', x: 0, y: 0, vx, vy: 0, radius: FX.radius }, FX.big);
        const c0 = FX.big / 2;
        let minX = c0;
        for (let py = 0; py < FX.big; py++) {
          if (Math.abs(py - c0) > FX.trailBand) continue;
          for (let px = 0; px < minX; px++) {
            if (d[(py * FX.big + px) * 4 + 3] >= FX.trailAlpha) { minX = px; break; }
          }
        }
        return c0 - minX;
      };
      const b650 = back(FX.speed); const b0 = back(0);
      const e650 = b650 - FX.radius; const e0 = b0 - FX.radius;
      ok(`[拖尾] vx=${FX.speed} 的速度反向側延伸 ≥ ${FX.trailMin}px，且 vx=0 沒有（差 ≥ ${FX.trailDiff}px）`,
        e650 >= FX.trailMin && (e650 - e0) >= FX.trailDiff,
        `vx=${FX.speed} 核心外反向 ${e650.toFixed(1)}px（距中心 ${b650.toFixed(1)}）、vx=0 ${e0.toFixed(1)}px、差 ${(e650 - e0).toFixed(1)}px`);
    } catch (e) {
      ok('[拖尾] 拖尾畫在速度反向側', false, `量測時丟例外：${e.message}`);
    }
    // 5c. 外觀不得影響物理：一樣的初始條件，畫過一次的與沒畫過的跑 30 幀要完全一致，
    //     而且解析值必須正確（x = 650 × 0.5 = 325）。
    try {
      const mk = () => new Projectile({ type: 'kunai', x: 0, y: 0, vx: FX.speed, vy: 0, radius: FX.radius });
      const a = mk(); const b = mk();
      a.seed = b.seed = 0.5;
      const c = mkCanvas(64, 64);
      a.draw(c.getContext('2d'), { x: -32, y: -32 });   // 只有 a 被畫過
      const DT = 1 / 60;
      for (let i = 0; i < 30; i++) { a.update(DT, player); b.update(DT, player); }
      const same = ['x', 'y', 'vx', 'vy', 'radius', 'life', 'isDead'].every((k) => a[k] === b[k]);
      const analytic = Math.abs(a.x - FX.speed * 0.5) < 1e-6 && Math.abs(a.life - 3.0 + 0.5) < 1e-6 && a.radius === FX.radius;
      ok('[彈道物理] 光暈/拖尾不影響 update()：30 幀後位置與壽命都是解析值',
        same && analytic,
        `x=${a.x}（期望 ${FX.speed * 0.5}）、life=${a.life.toFixed(3)}、radius=${a.radius}｜畫過的與沒畫過的一致=${same}`);
    } catch (e) {
      ok('[彈道物理] 光暈/拖尾不影響 update()', false, `量測時丟例外：${e.message}`);
    }

    // ── 6) 既有 sprite 不能壞 ─────────────────────────────────────────
    // BUILDERS 沒有匯出，所以用「明列已知 key + 掃 sprites.js 原始碼補新 key」聯集；
    // 明列的部分包含角色、敵人、裝飾、砲塔、寶石與 4 主題 × 一般/最終 × 待機/衝鋒的 boss。
    const KNOWN = [
      'duck', 'rabbit', 'penguin', 'cat', 'mechanic',
      'walker', 'bat', 'brute', 'boomer', 'boomer_armed', 'runner', 'warden',
      'spore_host', 'sporeling', 'spitter', 'hound', 'hatcher', 'chimera',
      'boss', 'boss_charging', 'turret',
      'gem_green', 'gem_blue', 'gem_purple', 'gem_gold',
      'car', 'bin', 'neon', 'tank', 'pipes', 'hazard',
      'ice_spike', 'snow', 'radar', 'lava_crack', 'steel', 'gear',
      'void_crystal', 'void_obelisk',
    ];
    const keys = new Set([...KNOWN, ...CHARS]);
    try {
      // 從原始碼補：BUILDERS 物件字面值的 `key: {`，以及動態組出來的 boss key
      const src = await (await fetch(new URL('js/sprites.js', document.baseURI).href)).text();
      for (const m of src.matchAll(/^\s{2}([a-z][a-z0-9_]*):\s*\{\s*w:/gm)) keys.add(m[1]);
      const themes = [...src.matchAll(/(\w+):\s*drawBoss[A-Z]/g)].map((m) => m[1]);
      for (const t of themes) {
        for (const suffix of ['', '_final']) {
          for (const charging of ['', '_charging']) keys.add(`boss_${t}${suffix}${charging}`);
        }
      }
    } catch (e) {
      notes.push(`掃 sprites.js 原始碼失敗（只用明列清單）：${e.message}`);
    }
    {
      const bad = [];
      for (const key of keys) {
        try {
          const s = getSprite(key);
          if (!s || !s.frames || !s.frames.length) { bad.push(`${key}: 沒有 frame`); continue; }
          const thin = s.frames.filter((f) => {
            if (!f.width || !f.height) return true;
            const d = data(f);
            let n = 0;
            for (let p = 3; p < d.length; p += 4) if (d[p] > 40) n++;
            return n <= 40;
          });
          if (thin.length) bad.push(`${key}: ${thin.length}/${s.frames.length} 個 frame 尺寸 0 或全透明`);
        } catch (e) {
          bad.push(`${key}: 烘焙時丟例外 ${e.message.split('\n')[0]}`);
        }
      }
      ok(`[Sprite 完整性] ${keys.size} 個 BUILDERS key 都烘焙得出來、尺寸 > 0、不透明像素 > 40`,
        bad.length === 0, bad.length ? bad.slice(0, 6).join('｜') : `${keys.size} 個 key（含 ${CHARS.length} 個角色）全部通過`);
    }

    // ── 烘焙成本上限（與硬體無關的量法）────────────────────────────────
    // 材質層（外框 + 兩層邊光 + 兩次漸層）是加在「烘焙」上的成本，不是每幀成本，
    // 但**仍然要有天花板**：它是最容易被後手無意間放大的一塊（例如把模糊半徑調大、
    // 或每個 frame 重建暫存畫布）。這裡刻意數「繪圖指令次數」而不是毫秒 ——
    // 毫秒綁機器（見 perf-probe 的檔頭），指令數在任何機器上都一樣。
    // 用帶 query 的 URL 再匯入一次 sprites.js，拿到一個空快取的新模組實例，
    // 這樣量到的一定是真的烘焙，不會被前面已經烘過的 key 汙染。
    {
      const proto = CanvasRenderingContext2D.prototype;
      const METHODS = ['drawImage', 'fillRect', 'fill', 'stroke', 'createLinearGradient',
        'createRadialGradient', 'createPattern', 'save', 'restore', 'clearRect'];
      const orig = {};
      let calls = 0;
      try {
        for (const m of METHODS) {
          orig[m] = proto[m];
          proto[m] = function (...a) { calls++; return orig[m].apply(this, a); };
        }
        const fresh = await imp('js/sprites.js?art-probe=1');
        for (const k of CHARS) fresh.getSprite(k);
      } finally {
        for (const m of METHODS) if (orig[m]) proto[m] = orig[m];
      }
      const per = calls / CHARS.length;
      // 天花板抓在實測值（499）的 1.6 倍：正常重構不會撞到，明顯退化一定撞到
      ok('[烘焙成本] 每個角色 sprite 的繪圖指令 ≤ 800（材質層沒有被無意放大）',
        per <= 800, `實測 ${calls} 次 ÷ ${CHARS.length} 個角色 = 每個 ${per.toFixed(0)} 次`);
    }

    // ── 對照圖（即使上面失敗也要盡量產出）──────────────────────────────
    const sheetBase = (w, h) => {
      const c = mkCanvas(w, h);
      const x = c.getContext('2d');
      x.fillStyle = '#0b0f16';
      x.fillRect(0, 0, w, h);
      return { c, x };
    };
    const label = (x, text, px, py) => {
      x.font = '12px ui-monospace, Menlo, monospace';
      x.textAlign = 'left';
      x.textBaseline = 'top';
      x.fillStyle = 'rgba(0,0,0,0.55)';
      x.fillRect(px, py, text.length * 7.2 + 6, 15);
      x.fillStyle = '#7fd8ff';
      x.fillText(text, px + 3, py + 2);
    };

    // chars.png：5 角色 × 8 幀，3× 放大、深色底、格線、左上角標 key
    try {
      const Z = 3; const PAD = 12; const HEAD = 16;
      const maxW = Math.max(...CHARS.map((k) => getSprite(k).w));
      const maxH = Math.max(...CHARS.map((k) => getSprite(k).h));
      const cw = Math.round(maxW * Z) + PAD * 2;
      const chh = Math.round(maxH * Z) + PAD * 2 + HEAD;
      const { c, x } = sheetBase(cw * FRAMES, chh * CHARS.length);
      CHARS.forEach((key, row) => {
        const s = getSprite(key);
        for (let col = 0; col < FRAMES; col++) {
          const ox = col * cw; const oy = row * chh;
          x.fillStyle = (row + col) % 2 ? '#0e141d' : '#121a25';
          x.fillRect(ox + 1, oy + 1, cw - 2, chh - 2);
          x.strokeStyle = 'rgba(120,160,200,0.22)';
          x.lineWidth = 1;
          x.strokeRect(ox + 0.5, oy + 0.5, cw - 1, chh - 1);
          const f = s.frames[col % s.frames.length];
          x.drawImage(f, ox + (cw - s.w * Z) / 2, oy + HEAD + (chh - HEAD - s.h * Z) / 2, s.w * Z, s.h * Z);
          label(x, `${key} #${col}`, ox + 4, oy + 3);
        }
      });
      shots.chars = c.toDataURL('image/png');
    } catch (e) {
      notes.push(`chars.png 產生失敗：${e.message}`);
    }

    // weapons.png：每個投射物 type × 一般/超武，深色底接觸印樣 + 標籤
    try {
      const TYPES = [
        ['kunai', 6], ['merc', 6], ['guardian', 12], ['saw', 10],
        ['drill', 6], ['rocket', 6], ['fire_pool', 60], ['soccer', 8],
      ];
      const CELL = 220; const COLS = 4;
      const cells = [];
      for (const [type, radius] of TYPES) for (const evo of [false, true]) cells.push({ type, radius, evo });
      const rows = Math.ceil(cells.length / COLS);
      const { c, x } = sheetBase(CELL * COLS, CELL * rows);
      const realNow = Date.now;
      Date.now = () => 1700000000000;   // fire_pool 用 Date.now() 當相位，固定住才可重現
      try {
        cells.forEach((cell, i) => {
          const ox = (i % COLS) * CELL; const oy = Math.floor(i / COLS) * CELL;
          x.save();
          x.beginPath(); x.rect(ox, oy, CELL, CELL); x.clip();
          x.fillStyle = '#0d1219';
          x.fillRect(ox, oy, CELL, CELL);
          x.strokeStyle = 'rgba(120,160,200,0.22)';
          x.strokeRect(ox + 0.5, oy + 0.5, CELL - 1, CELL - 1);
          x.translate(ox, oy);
          const p = new Projectile({ type: cell.type, x: 0, y: 0, vx: 650, vy: 0, radius: cell.radius, isEvo: cell.evo });
          p.seed = 1.2345;
          p.draw(x, { x: -CELL / 2, y: -CELL / 2 });
          x.restore();
          label(x, `${cell.type}${cell.evo ? ' ★evo' : ''}`, ox + 4, oy + 3);
        });
      } finally { Date.now = realNow; }
      shots.weapons = c.toDataURL('image/png');
    } catch (e) {
      notes.push(`weapons.png 產生失敗：${e.message}`);
    }

    // held.png：玩家 + 手持武器（每把基礎武器一格，2× 放大）
    try {
      if (wm && player && typeof wm.drawHeldWeapons === 'function') {
        const Z = 2; const CELL = 120; const HEAD = 16;   // 遊戲座標 120px 視野 ×2 = 240px 格
        const backup = [...wm.weapons.entries()];
        const savedFacing = player.facing;
        try {
          const { WEAPONS } = await imp('js/config.js');
          const { c, x } = sheetBase(CELL * Z * HELD.bases.length, CELL * Z + HEAD);
          player.facing = 1;
          const pkey = (player.character && player.character.sprite) || CHARS[0];
          HELD.bases.forEach((id, i) => {
            const ox = i * CELL * Z;
            wm.weapons.clear();
            wm.weapons.set(id, { id, level: 1, cooldownTimer: 0, isEvo: !!(WEAPONS[id] && WEAPONS[id].isEvo), totalDamage: 0 });
            x.save();
            x.beginPath(); x.rect(ox, HEAD, CELL * Z, CELL * Z); x.clip();
            x.fillStyle = '#0d1219';
            x.fillRect(ox, HEAD, CELL * Z, CELL * Z);
            x.strokeStyle = 'rgba(120,160,200,0.22)';
            x.strokeRect(ox + 0.5, HEAD + 0.5, CELL * Z - 1, CELL * Z - 1);
            x.translate(ox, HEAD);          // 後續座標都是遊戲座標（0..CELL），縮放後才對得上格子
            x.scale(Z, Z);
            const cam = { x: player.x - CELL / 2, y: player.y - CELL / 2 };
            blit(x, getSprite(pkey), 0, CELL / 2, CELL / 2);
            wm.drawHeldWeapons(x, cam);
            x.restore();
            label(x, id, ox + 4, 2);
          });
          shots.held = c.toDataURL('image/png');
        } finally {
          wm.weapons.clear();
          for (const [k, v] of backup) wm.weapons.set(k, v);
          player.facing = savedFacing;
        }
      } else {
        notes.push('held.png 略過：沒有 drawHeldWeapons');
      }
    } catch (e) {
      notes.push(`held.png 產生失敗：${e.message}`);
    }

    return { out, notes, shots };
  });
} catch (e) {
  payload = { out: [], notes: [`頁內量測整段爆掉：${String(e.message).split('\n')[0]}`], shots: {} };
}

const { out: results, notes, shots } = payload;

let pass = 0;
let fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log(`PASS  ${r.name}  [${r.detail}]`); }
  else { fail++; console.log(`FAIL  ${r.name}  [${r.detail}]`); }
}
// 未捕捉例外一律視為失敗：外觀程式碼最常見的壞法是「畫的時候 TypeError，整個 canvas 停住」
if (pageErrors.length) {
  fail++;
  console.log(`FAIL  驗證期間沒有未捕捉例外  [${pageErrors.slice(0, 3).join(' | ')}]`);
} else {
  pass++;
  console.log('PASS  驗證期間沒有未捕捉例外  [0 筆]');
}
for (const n of notes) console.log(`NOTE  ${n}`);

// 對照圖：人眼複驗用，即使驗證失敗也寫出來
const written = [];
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, url] of Object.entries(shots || {})) {
    if (!url) continue;
    const file = `${OUT_DIR}/${name}.png`;
    fs.writeFileSync(file, Buffer.from(String(url).split(',')[1] || '', 'base64'));
    written.push(`${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  }
} catch (e) {
  console.log(`NOTE  對照圖寫入失敗：${e.message}`);
}
console.log(written.length ? `對照圖：${written.join('、')}` : `對照圖：沒有產出（${OUT_DIR}）`);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
