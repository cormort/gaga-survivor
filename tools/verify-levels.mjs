// 關卡（js/levels.js）門檻驗證 —— 把「一關」從一段資料變成可量測、可回歸的東西。
//
// 為什麼要這支：關卡是本專案最大一塊「資料即程式」。地形材質、紋理 motif、宏觀結構、
// 大型地標、關卡機制、Boss 皮膚、波次表、解鎖鏈，全部是 levels.js 裡的字串與數字，
// 而每一條字串都必須有對應的實作分支才畫得出來、跑得起來。**打錯一個字串是完全靜默的**：
//   - `theme.ground.motif: 'nope'` → Ground.js 的 motif switch 沒有這個 case，
//     那一層紋理不是沒畫就是走 default 畫成別關的花樣，沒有任何錯誤訊息。
//   - `decor: ['neons']` → Decor 啟動時靜默濾掉打錯的 key，那一關的裝飾直接消失。
//   - `bosses[].skin: 'boss_swamp'` 打錯 → getSprite 靜默退回 walker，Boss 變成一隻殭屍。
//   - 波次表漏掉尾段 → 8 分鐘的關卡在 6 分鐘後不再生怪，玩家站著發呆到通關。
//   - `next` 鏈斷掉或難度沒跟著順序走 → 新關卡永遠解不開、或難度曲線反轉。
// 這支把上面每一條都變成一次 ok()，共五組：
//   A 關卡資料完整性（順序/next 鏈/難度/欄位/波次/Boss 排程）
//   B 主題 enum 白名單 —— **從實作原始碼掃出來**，不寫死清單，所以「實作多了一個材質」
//     與「資料引用了不存在的實作」兩個方向都會被抓到
//   C 美術（decor key、Boss 皮膚四態、三隻新 Boss 兩兩不同且顏色層次足夠）
//   D 主題可辨識（實際開局後把畫布地面區域做簽章，任兩關不得相同、且不得空白）
//   E 玩得起來 + 解鎖鏈（每關跑 600 幀不拋例外、第一隻 Boss 真的會出現、cleared 只解鎖下一關）
//
// 用法：
//   node tools/verify-levels.mjs
//     → 自己起一台 no-store 靜態伺服器（預設 8899，被占用就自動往後找），跑完自己收掉。
//   PW_MODULE=/Users/hermes/.npm/_npx/6301df25ace19226/node_modules/playwright/index.js \
//     PROBE_URL=http://127.0.0.1:8899/index.html node tools/verify-levels.mjs
//     → 指定 playwright 模組與（別人已經起好的）目標 URL；給了 PROBE_URL 就不再自己起伺服器。
//
// 實作備註：
//   - 舊版（只有 5 關）跑這支不會爆：所有迭代一律走 LEVEL_ORDER，缺資料就明確 FAIL，
//     不會讓整支工具丟 TypeError 中斷（要一次看到壞了幾組才有意義）。
//   - D 組在正式 render 之後才取樣，取樣前會清掉場上的怪/掉落物/投射物/殘跡並把玩家
//     移出畫面、相機釘在定點 —— 簽章要量的應該是「這關的地表」，不是「剛好誰站在上面」。
//   - 離開碼 1 表示有項目失敗。
//
// 需要一個靜態伺服器（專案根目錄、所有回應 Cache-Control: no-store）。
// 自己起的伺服器會用 lsof -tiTCP:<port> -sTCP:LISTEN | xargs kill 收掉（不用 pkill -f，
// 免得掃到別人正在跑的 8899）。為了不誤殺別人的伺服器，流程是「先確認 port 沒人在聽 →
// 起自己的 → 用 X-Verify-Server 回應標頭確認那台真的是自己起的」，兩道都過才把該 port
// 記成自己的；換 port 也只在候選清單（8899、8902~8909）裡找。

import { createServer as createNetServer } from 'node:net';
import { spawn, execSync } from 'node:child_process';

const ROOT = process.cwd();
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;

/* ── 0) 靜態伺服器：沒有 PROBE_URL 就自己起一台（no-store），跑完自己收掉 ───── */

// 子行程（node -e）版本的靜態伺服器：專案根目錄、每個回應都 no-store。
// 用子行程而不是 in-process，才能在收尾時用 lsof 精準關掉「自己起的這一台」。
const SERVER_SRC = [
  "const http = require('http');",
  "const fs = require('fs');",
  "const path = require('path');",
  "const ROOT = process.argv[1];",
  "const PORT = Number(process.argv[2]);",
  "const MIME = {",
  "  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',",
  "  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',",
  "  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',",
  "  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',",
  "  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',",
  "  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',",
  "};",
  "http.createServer((req, res) => {",
  "  let rel = decodeURIComponent((req.url || '/').split('?')[0]);",
  "  if (rel.endsWith('/')) rel += 'index.html';",
  "  const file = path.join(ROOT, path.normalize(rel));",
  "  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');",
  "  res.setHeader('Pragma', 'no-cache');",
  "  res.setHeader('Expires', '0');",
  // 身分標頭：收尾時只准殺「自己起的這一台」。沒有它就可能在某個 port 的競態裡
  // 誤判（別人先搶到同一個 port，我們卻以為那是自己的），然後把別人的伺服器關掉。
  "  res.setHeader('X-Verify-Server', 'verify-levels');",
  "  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }",
  "  fs.readFile(file, (err, buf) => {",
  "    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }",
  "    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });",
  "    res.end(buf);",
  "  });",
  "}).listen(PORT, '127.0.0.1');",
].join('\n');

const portFree = (port) => new Promise((resolve) => {
  const s = createNetServer();
  s.once('error', () => resolve(false));
  s.once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});

// 只認「自己人」：回應必須帶 X-Verify-Server 標頭。否則可能是別人的伺服器先搶到了
// 同一個 port —— 那種情況要換 port，而不是把別人的行程當成自己的關掉。
const waitForServer = async (url, own = false) => {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok && (!own || res.headers.get('x-verify-server') === 'verify-levels')) return true;
    } catch (err) { /* 還沒起來 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

let PORT = null;
let serverChild = null;
let TARGET = process.env.PROBE_URL || null;

if (!TARGET) {
  // 8899 被別人占走就往下找；找 port 前先確認沒有人在聽，起來後再用身分標頭複驗一次。
  const candidates = [...new Set([Number(process.env.LEVELS_PORT) || 8899,
    8899, 8902, 8903, 8904, 8905, 8906, 8907, 8908, 8909])];
  {
    for (const p of candidates) {
      if (!(await portFree(p))) continue;
      const child = spawn(process.execPath, ['-e', SERVER_SRC, ROOT, String(p)], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      if (await waitForServer(`http://127.0.0.1:${p}/index.html`, true)) {
        PORT = p;
        serverChild = child;
        break;
      }
      try { process.kill(-child.pid, 'SIGKILL'); } catch (err) { /* 已死 */ }
    }
  }
  if (!PORT) {
    console.error('找不到可用的 port（8899、8902~8909 都被占用），請自己起一台並用 PROBE_URL 指定。');
    process.exit(1);
  }
  // ?dpr=1：畫布不放大，D 組的取樣便宜又穩定（細節不影響「兩關長得像不像」）
  TARGET = `http://127.0.0.1:${PORT}/index.html?dpr=1`;
  console.log(`# 自備靜態伺服器 http://127.0.0.1:${PORT}/ （專案根目錄、no-store）`);
}

let serverStopped = false;
const stopServer = () => {
  if (serverStopped || !PORT) return;
  serverStopped = true;
  try { if (serverChild && serverChild.pid) process.kill(-serverChild.pid, 'SIGKILL'); } catch (err) { /* 已死 */ }
  try { if (serverChild) serverChild.kill('SIGKILL'); } catch (err) { /* 已死 */ }
  try {
    execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: 'ignore' });
  } catch (err) { /* 已經沒有在聽的行程了 */ }
};
process.on('exit', stopServer);

/* ── 1) 開頁面 ─────────────────────────────────────────────── */
console.log(`# 目標 ${TARGET}`);

const browser = await pw.chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
page.setDefaultTimeout(180000);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game, null, { timeout: 60000 });

/* ── 2) 頁內驗證 ───────────────────────────────────────────── */
const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail == null ? '' : detail) });
  const list = (a) => (a.length ? a.join('、') : '無');

  try {
    // 匯入路徑一律用 new URL(…, document.baseURI)：本機是 "/"、GitHub Pages 是
    // "/gaga-survivor/"，寫死絕對路徑在線上會 404（實測踩過）。
    const imp = (p) => import(new URL(p, document.baseURI).href);
    const lv = await imp('js/levels.js');
    const spr = await imp('js/sprites.js');
    const cfg = await imp('js/config.js');
    const { save } = await imp('js/save.js');
    const g = window.game;

    const LEVELS = lv.LEVELS || {};
    const ORDER = Array.isArray(lv.LEVEL_ORDER) ? lv.LEVEL_ORDER.slice() : Object.keys(LEVELS);
    const DUR = Number(lv.LEVEL_DURATION) || 480;
    const ENEMY_TYPES = cfg.ENEMY_TYPES || {};
    const each = (fn) => { for (const id of ORDER) if (LEVELS[id]) fn(id, LEVELS[id]); };
    const idList = (fn) => { const a = []; each((id, L) => { const r = fn(id, L); if (r) a.push(r); }); return a; };

    // ── 原始碼掃描：白名單一律從實作掃出來 ────────────────────────────────
    // 只做兩件事：跳過字串/註解，然後做括號配對。這樣可以精準切出某個 switch 的區塊。
    const braceBlock = (src, start) => {
      let depth = 0;
      for (let i = start; i < src.length; i++) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); if (e < 0) break; i = e; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) break; i = e + 1; continue; }
        if (c === '"' || c === "'" || c === '`') {
          for (i++; i < src.length; i++) {
            if (src[i] === '\\') { i++; continue; }
            if (src[i] === c) break;
          }
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
      }
      return '';
    };
    const pick = (src, re) => [...src.matchAll(re)].map((m) => m[1]).filter(Boolean);
    // switchCases(src, 'switch (g.motif)') → 那個 switch 裡所有 case 標籤
    const switchCases = (src, marker) => {
      const i = src.indexOf(marker);
      if (i < 0) return null;
      const b = src.indexOf('{', i);
      if (b < 0) return null;
      return pick(braceBlock(src, b), /\bcase\s*'([^']+)'/g);
    };

    const srcOf = async (p) => {
      const res = await fetch(new URL(p, document.baseURI).href, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${p} 讀不到（HTTP ${res.status}）`);
      return res.text();
    };
    let groundSrc = '';
    let terrainSrc = '';
    let hazardSrc = '';
    const srcErrs = [];
    for (const [name, set] of [['js/systems/Ground.js', (v) => { groundSrc = v; }],
      ['js/systems/Terrain.js', (v) => { terrainSrc = v; }],
      ['js/systems/Hazards.js', (v) => { hazardSrc = v; }]]) {
      try { set(await srcOf(name)); } catch (e) { srcErrs.push(String((e && e.message) || e)); }
    }

    const MATERIALS = new Set(pick(groundSrc, /\bmat\s*===\s*'([^']+)'/g));
    const MOTIFS = new Set(switchCases(groundSrc, 'switch (g.motif)') || []);
    const MACRO_KINDS = new Set([
      ...pick(terrainSrc, /\bkind\s*===\s*'([^']+)'/g),
      ...pick(terrainSrc, /\|\|\s*'(none)'/g),
    ]);
    const LANDMARKS = new Set(switchCases(terrainSrc, 'switch (kind)') || []);
    const MECH_TYPES = new Set([
      ...pick(hazardSrc, /\bmech\.type\s*===\s*'([^']+)'/g),
      ...pick(hazardSrc, /\bm\.type\s*===\s*'([^']+)'/g),
      ...pick(hazardSrc, /\bh\.kind\s*===\s*'([^']+)'/g),
    ]);

    const setStr = (s) => [...s].sort().join('/') || '（掃不到，原始碼讀取失敗？）';
    if (srcErrs.length) console.warn('source scan failed:', srcErrs.join(' | '));

    // ══ A. 關卡資料完整性 ═══════════════════════════════════════════════════

    // A1 LEVEL_ORDER ↔ LEVELS 完全對應
    {
      const missing = ORDER.filter((id) => !LEVELS[id]);
      const orphans = Object.keys(LEVELS).filter((id) => !ORDER.includes(id));
      ok('A1 LEVEL_ORDER 每個 id 都在 LEVELS，且沒有孤兒關卡',
        missing.length === 0 && orphans.length === 0,
        `LEVEL_ORDER ${ORDER.length} 關（${ORDER.join('→')}）；LEVELS ${Object.keys(LEVELS).length} 筆；`
        + `缺資料 ${list(missing)}；孤兒 ${list(orphans)}`);
    }

    // A2 next 鏈
    {
      const chain = [];
      const bad = [];
      let cur = ORDER[0];
      let guard = 0;
      while (cur != null && guard++ <= ORDER.length + 2) {
        chain.push(cur);
        const def = LEVELS[cur];
        if (!def) { bad.push(`next 指向不存在的關卡 ${cur}`); break; }
        cur = def.next;
      }
      const tail = ORDER.length ? LEVELS[ORDER[ORDER.length - 1]] : null;
      if (!tail) bad.push('LEVEL_ORDER 是空的');
      else if (tail.next !== null) bad.push(`最後一關（${ORDER[ORDER.length - 1]}）的 next=${JSON.stringify(tail.next)}，應為 null`);
      if (chain.length !== ORDER.length) bad.push(`沿 next 只走到 ${chain.length} 關，LEVEL_ORDER 有 ${ORDER.length} 關`);
      for (let i = 0; i < Math.min(chain.length, ORDER.length); i++) {
        if (chain[i] !== ORDER[i]) { bad.push(`next 鏈第 ${i + 1} 關是 ${chain[i]}，LEVEL_ORDER 是 ${ORDER[i]}`); break; }
      }
      if (new Set(chain).size !== chain.length) bad.push('next 鏈有循環');
      ok('A2 next 鏈完整（順序與 LEVEL_ORDER 一致、尾端 null、無斷鏈與循環）',
        bad.length === 0, bad.length ? bad.join('；') : `鏈：${chain.join('→')}→null`);
    }

    // A3 難度嚴格遞增
    {
      const bad = [];
      for (let i = 1; i < ORDER.length; i++) {
        const a = LEVELS[ORDER[i - 1]];
        const b = LEVELS[ORDER[i]];
        if (!a || !b) continue;
        if (!(b.difficulty > a.difficulty)) bad.push(`${ORDER[i - 1]}(難度 ${a.difficulty}) → ${ORDER[i]}(難度 ${b.difficulty}) 沒有遞增`);
      }
      ok('A3 difficulty 沿 LEVEL_ORDER 嚴格遞增',
        bad.length === 0,
        bad.length ? bad.join('；') : ORDER.map((id) => `${id} ${LEVELS[id] ? LEVELS[id].difficulty : '?'}`).join('、'));
    }

    // A4 必要欄位
    {
      const REQ = ['name', 'sub', 'icon', 'desc', 'next', 'difficulty', 'dnaMult', 'theme', 'decor',
        'decorDensity', 'hpScale', 'rules', 'waves', 'bosses'];
      const THEME_REQ = ['top', 'mid', 'bottom', 'grid', 'major', 'gridStyle', 'bounds', 'grade', 'vignette', 'ground'];
      const GROUND_REQ = ['patches', 'material', 'motif', 'motifColor', 'accent', 'density', 'macro'];
      const bad = idList((id, L) => {
        const miss = [];
        // `next` 是唯一允許（也必須）為 null 的欄位：鏈尾就是 null。其餘欄位 null = 缺。
        const m1 = REQ.filter((k) => L[k] === undefined || (L[k] === null && k !== 'next'));
        if (m1.length) miss.push(`關卡缺 ${m1.join('/')}`);
        const t = L.theme || {};
        const m2 = THEME_REQ.filter((k) => t[k] === undefined || t[k] === null);
        if (m2.length) miss.push(`theme 缺 ${m2.join('/')}`);
        const gr = t.ground || {};
        const m3 = GROUND_REQ.filter((k) => gr[k] === undefined || gr[k] === null);
        if (m3.length) miss.push(`theme.ground 缺 ${m3.join('/')}`);
        return miss.length ? `${id}: ${miss.join('，')}` : null;
      });
      ok('A4 每關必要欄位齊全（含 theme 與 theme.ground 子欄位）',
        bad.length === 0, bad.length ? bad.join('；') : `${ORDER.length} 關 × ${REQ.length} 欄位全中`);
    }

    // A5 波次覆蓋整局
    {
      const bad = idList((id, L) => {
        const ws = Array.isArray(L.waves) ? L.waves : [];
        const p = [];
        if (!ws.length) return `${id}: 沒有 waves`;
        if (!(ws[0].until > 0)) p.push(`第一段 until=${ws[0].until}（必須 > 0，才從 0 秒開始覆蓋）`);
        for (let i = 1; i < ws.length; i++) {
          if (!(ws[i].until > ws[i - 1].until)) p.push(`第 ${i + 1} 段 until=${ws[i].until} 未大於前一段 ${ws[i - 1].until}（縫隙/重疊）`);
        }
        const last = ws[ws.length - 1];
        if (!(last.until > DUR)) p.push(`最後一段 until=${last.until} ≤ LEVEL_DURATION ${DUR}（沒覆蓋整局）`);
        ws.forEach((w, i) => {
          const pool = Array.isArray(w.pool) ? w.pool : [];
          const sum = pool.reduce((s, e) => s + (Number(e && e[1]) || 0), 0);
          if (!(sum > 0)) p.push(`第 ${i + 1} 段 pool 權重和 ${sum}`);
          for (const e of pool) if (!ENEMY_TYPES[e && e[0]]) p.push(`第 ${i + 1} 段引用未知敵人 ${e && e[0]}`);
        });
        return p.length ? `${id}: ${p.join('，')}` : null;
      });
      ok('A5 波次涵蓋 0 → > LEVEL_DURATION 無縫，pool 權重 > 0 且敵人型別都存在',
        bad.length === 0,
        bad.length ? bad.join('；') : `${ORDER.length} 關波次表全中（最後一段都 > ${DUR}s，敵人型別 ${Object.keys(ENEMY_TYPES).length} 種）`);
    }

    // A6 Boss 排程
    {
      const bad = idList((id, L) => {
        const bs = Array.isArray(L.bosses) ? L.bosses : [];
        const p = [];
        if (id === 'endless') {
          if (bs.length !== 0) p.push(`endless 的 bosses 應為空（走 ENDLESS_BOSS_CYCLE 輪播），實際 ${bs.length} 隻`);
          return p.length ? `${id}: ${p.join('，')}` : null;
        }
        if (bs.length < 2) p.push(`只有 ${bs.length} 隻 Boss（至少 2）`);
        for (let i = 1; i < bs.length; i++) {
          if (!(bs[i].at > bs[i - 1].at)) p.push(`第 ${i + 1} 隻 at=${bs[i].at} 未嚴格遞增（前 ${bs[i - 1].at}）`);
        }
        const last = bs[bs.length - 1];
        if (last && last.final !== true) p.push('最後一隻沒有 final: true');
        if (last && last.at !== DUR) p.push(`最後一隻 at=${last.at} ≠ LEVEL_DURATION ${DUR}`);
        return p.length ? `${id}: ${p.join('，')}` : null;
      });
      ok('A6 Boss 排程合理（≥2 隻、at 嚴格遞增、最後一隻 final 且 at = LEVEL_DURATION；endless 例外為空）',
        bad.length === 0,
        bad.length ? bad.join('；') : idList((id, L) => `${id} ${(L.bosses || []).length} 隻`).join('、'));
    }

    // ══ B. 主題 enum 必須有實作 ═════════════════════════════════════════════

    {
      const bad = idList((id, L) => {
        const v = ((L.theme || {}).ground || {}).material;
        return MATERIALS.has(v) ? null : `${id}: ${JSON.stringify(v)}`;
      });
      ok('B7 ground.material 都在 Ground.js 實作的材質白名單內',
        bad.length === 0, `白名單（掃自 Ground.js 的 mat === '…'）：${setStr(MATERIALS)}｜`
        + (bad.length ? `不在名單：${bad.join('、')}` : '全部命中'));
    }

    {
      const bad = idList((id, L) => {
        const v = ((L.theme || {}).ground || {}).motif;
        return MOTIFS.has(v) ? null : `${id}: ${JSON.stringify(v)}`;
      });
      ok("B8 ground.motif 都是 Ground.js motif switch 真的有的 case",
        bad.length === 0, `白名單（掃自 switch (g.motif) 的 case）：${setStr(MOTIFS)}｜`
        + (bad.length ? `不在名單：${bad.join('、')}` : '全部命中'));
    }

    {
      const bad = idList((id, L) => {
        const v = ((L.theme || {}).ground || {}).macro ? L.theme.ground.macro.kind : undefined;
        return MACRO_KINDS.has(v) ? null : `${id}: ${JSON.stringify(v)}`;
      });
      ok('B9 theme.ground.macro.kind 都是 Terrain.js 有實作的宏觀結構',
        bad.length === 0, `白名單（掃自 Terrain.js 的 kind === '…'）：${setStr(MACRO_KINDS)}｜`
        + (bad.length ? `不在名單：${bad.join('、')}` : '全部命中'));
    }

    {
      const bad = idList((id, L) => {
        const macro = ((L.theme || {}).ground || {}).macro || {};
        const miss = (macro.landmark || []).filter((k) => !LANDMARKS.has(k));
        return miss.length ? `${id}: ${miss.join('/')}` : null;
      });
      ok('B10 macro.landmark 的每個名字都是 Terrain.js 地標 switch 有的 case',
        bad.length === 0, `白名單（掃自 drawLandmarkArt 的 switch (kind)）：${setStr(LANDMARKS)}｜`
        + (bad.length ? `不在名單：${bad.join('、')}` : '全部命中'));
    }

    {
      const bad = idList((id, L) => {
        const miss = (L.mechs || []).map((m) => m && m.type).filter((t) => !MECH_TYPES.has(t));
        return miss.length ? `${id}: ${miss.join('/')}` : null;
      });
      ok('B11 mechs[].type 都是 Hazards.js 有處理的機制型別',
        bad.length === 0, `白名單（掃自 Hazards.js 的 mech.type / h.kind === '…'）：${setStr(MECH_TYPES)}｜`
        + (bad.length ? `不在名單：${bad.join('、')}` : '全部命中'));
    }

    // ══ C. 美術 ════════════════════════════════════════════════════════════

    {
      const bad = idList((id, L) => {
        const miss = (L.decor || []).filter((k) => !spr.hasSprite(k));
        return miss.length ? `${id}: ${miss.join('/')}` : null;
      });
      ok('C12 每關 decor 的每個 key 都 hasSprite()',
        bad.length === 0,
        bad.length ? `打錯的 key 會被 Decor 靜默濾掉：${bad.join('、')}`
          : `${ORDER.reduce((n, id) => n + ((LEVELS[id] || {}).decor || []).length, 0)} 個 decor key 全中`);
    }

    // C13 Boss 皮膚四態：skin / skin_final / skin_final_charging / skin_charging
    // （getSprite 對未知 key 會靜默退回 walker ⇒ 打錯字只會看到 Boss 變成殭屍）
    {
      const SUF = ['', '_final', '_final_charging', '_charging'];
      const bad = idList((id, L) => {
        const miss = new Set();
        for (const b of (L.bosses || [])) {
          for (const s of SUF) {
            const key = String((b && b.skin) || '') + s;
            if (!spr.hasSprite(key)) miss.add(key);
          }
        }
        return miss.size ? `${id}: ${[...miss].join('/')}` : null;
      });
      const total = ORDER.reduce((n, id) => n + ((LEVELS[id] || {}).bosses || []).length, 0);
      ok('C13 每隻 Boss 的 skin 與 _final / _final_charging / _charging 都存在',
        bad.length === 0, bad.length ? `缺 sprite：${bad.join('、')}` : `${total} 隻 Boss × 4 態全中`);
    }

    // C14 三隻新 Boss：兩兩不同 + 顏色層次
    {
      const NEW_BOSSES = ['boss_subway', 'boss_swamp', 'boss_storm'];
      const missing = NEW_BOSSES.filter((k) => !spr.hasSprite(k));
      if (missing.length) {
        const why = `缺 sprite：${list(missing)}（key 打錯，或三隻新 Boss 的美術還沒落地）`;
        ok('C14a 三隻新 Boss 兩兩像素不同（不透明像素差 > 8%）', false, why);
        ok('C14b 三隻新 Boss 各有足夠顏色層次（4bit 量化 ≥ 40 色）', false, why);
      } else {
        // 烘成一張統一尺寸的正規化畫布再逐像素比：皮膚尺寸（172 vs 208）不同也要能比。
        const S = 128;
        const bake = (key) => {
          const s = spr.getSprite(key);
          const c = document.createElement('canvas');
          c.width = S; c.height = S;
          c.getContext('2d').drawImage(s.frames[0], 0, 0, S, S);
          return c.getContext('2d').getImageData(0, 0, S, S).data;
        };
        const px = {};
        for (const k of NEW_BOSSES) px[k] = bake(k);

        const pairs = [];
        const pairBad = [];
        for (let i = 0; i < NEW_BOSSES.length; i++) {
          for (let j = i + 1; j < NEW_BOSSES.length; j++) {
            const a = px[NEW_BOSSES[i]];
            const b = px[NEW_BOSSES[j]];
            let seen = 0;
            let diff = 0;
            for (let p = 0; p < a.length; p += 4) {
              const aa = a[p + 3];
              const ba = b[p + 3];
              if (aa <= 40 && ba <= 40) continue;   // 兩邊都透明 → 不算
              seen++;
              const d = Math.max(
                Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]),
                Math.abs(a[p + 2] - b[p + 2]), Math.abs(aa - ba),
              );
              if (d > 24) diff++;
            }
            const ratio = seen ? diff / seen : 0;
            pairs.push(`${NEW_BOSSES[i]}↔${NEW_BOSSES[j]} ${(ratio * 100).toFixed(1)}%`);
            if (!(ratio > 0.08)) pairBad.push(`${NEW_BOSSES[i]}↔${NEW_BOSSES[j]} 只有 ${(ratio * 100).toFixed(1)}% 的像素不同（門檻 > 8%）`);
          }
        }
        ok('C14a 三隻新 Boss 兩兩像素不同（不透明像素差 > 8%）',
          pairBad.length === 0, pairBad.length ? pairBad.join('；') : pairs.join('、'));

        const depths = [];
        const depthBad = [];
        for (const k of NEW_BOSSES) {
          const d = px[k];
          const set = new Set();
          for (let p = 0; p < d.length; p += 4) {
            if (d[p + 3] > 40) set.add(((d[p] >> 4) << 8) | ((d[p + 1] >> 4) << 4) | (d[p + 2] >> 4));
          }
          depths.push(`${k} ${set.size} 色`);
          if (set.size < 40) depthBad.push(`${k} 4bit 量化後只有 ${set.size} 色（門檻 ≥ 40）`);
        }
        ok('C14b 三隻新 Boss 各有足夠顏色層次（4bit 量化 ≥ 40 色）',
          depthBad.length === 0, depthBad.length ? depthBad.join('；') : depths.join('、'));
      }
    }

    // ══ D/E 前置：開局與升級選卡的處理 ══════════════════════════════════════

    // 手動步進時沒有 UI 會幫我們選卡，LEVEL_UP 會卡住整局；這裡照遊戲自己的流程
    // 選第一張（applyUpgradeOption），真的沒卡片才退回直接把狀態扳回 PLAYING。
    const resolveModals = () => {
      for (let k = 0; k < 12 && g.state !== 'PLAYING'; k++) {
        const before = g.state;
        try {
          if (g.state === 'LEVEL_UP') {
            const opts = g.ui && g.ui.generateUpgradeOptions
              ? g.ui.generateUpgradeOptions(g.weaponManager, null) : null;
            if (opts && opts.length) g.applyUpgradeOption(opts[0]);
            else { g.pendingLevelUps = 0; g.state = 'PLAYING'; }
          } else if (g.state === 'CHEST_MODAL' || g.state === 'PAUSED') {
            g.state = 'PLAYING';
          } else {
            break;
          }
        } catch (e) {
          g.pendingLevelUps = 0;
          g.state = 'PLAYING';
        }
        if (g.state === before && g.state !== 'PLAYING') break;
      }
    };
    // 測試期間不讓玩家死：死了就看不到後面的 Boss 排程與 600 幀，量到的會是「第 3 秒就結束」。
    const keepAlive = () => {
      const p = g.player;
      if (!p) return;
      if (p.hp < p.maxHp) p.hp = p.maxHp;
      if (p.isDead) { p.isDead = false; p.hp = p.maxHp; }
      if (g.state === 'GAME_OVER') g.state = 'PLAYING';
    };

    // ══ D. 主題可辨識 ══════════════════════════════════════════════════════

    // 取樣區域：畫面中央 10%~72% × 25%~75%，縮成 32×32 後量化成 5bit 當簽章。
    // 為什麼是中央而不是下緣：暗角（drawVignette）把畫面四周壓黑，下緣取樣會把
    // 各關的色相差一起壓平 —— 實測「毒霧沼澤↔深淵」在下緣只差 5.1%（貼著門檻），
    // 移到中央後同一對差 12.7%。玩家/小地圖不在這塊（玩家取樣前已移出畫面、
    // 小地圖在右下角 x > 0.88）。
    const SIG = 32;
    const CAP = { x0: 0.10, x1: 0.72, y0: 0.25, y1: 0.75 };
    const captureGround = (id) => {
      g.levelId = id;
      g.start(false);
      for (let i = 0; i < 120; i++) { resolveModals(); keepAlive(); g.update(1 / 60); }

      // 簽章要量的是「這關的地表」，不是「剛好誰站在上面」：
      // 清掉所有過場物件、相機釘在定點、玩家移出畫面，再正式 render 一次。
      const clear = (a) => { if (Array.isArray(a)) a.length = 0; };
      clear(g.enemies);
      clear(g.dropItems);
      clear(g.enemyProjectiles);
      clear(g.hazards);
      clear(g.turrets);
      clear(g.mercenaries);
      clear(g.destructibles);
      clear(g.decals);
      if (g.weaponManager) { clear(g.weaponManager.projectiles); clear(g.weaponManager.delayed); }
      if (g.particles && g.particles.clear) g.particles.clear();
      g.merchant = null;
      g.redFlash = 0;
      if (g.camera) g.camera.shake = 0;

      const px = g.player.x;
      const py = g.player.y;
      g.camera.x = -g.vw / 2;      // 世界原點置中：每關的相機與玩家起點一致
      g.camera.y = -g.vh / 2;
      g.player.x = g.camera.x - 4000;
      g.player.y = g.camera.y - 4000;
      g.render();
      g.player.x = px;
      g.player.y = py;

      const cv = g.canvas;
      const small = document.createElement('canvas');
      small.width = SIG;
      small.height = SIG;
      const sctx = small.getContext('2d');
      sctx.drawImage(
        cv,
        Math.round(cv.width * CAP.x0), Math.round(cv.height * CAP.y0),
        Math.round(cv.width * (CAP.x1 - CAP.x0)), Math.round(cv.height * (CAP.y1 - CAP.y0)),
        0, 0, SIG, SIG,
      );
      const d = sctx.getImageData(0, 0, SIG, SIG).data;
      const q = new Uint8Array(SIG * SIG * 3);
      let opaque = 0;
      for (let p = 0, k = 0; p < d.length; p += 4, k += 3) {
        if (d[p + 3] > 200) opaque++;
        q[k] = (d[p] >> 3) << 3;
        q[k + 1] = (d[p + 1] >> 3) << 3;
        q[k + 2] = (d[p + 2] >> 3) << 3;
      }
      return { q, opaqueRatio: opaque / (SIG * SIG) };
    };
    // 兩張簽章的相異像素佔比（任一通道差 > 24 才算相異）
    const sigDiff = (a, b) => {
      let diff = 0;
      for (let i = 0; i < a.length; i += 3) {
        if (Math.abs(a[i] - b[i]) > 24 || Math.abs(a[i + 1] - b[i + 1]) > 24 || Math.abs(a[i + 2] - b[i + 2]) > 24) diff++;
      }
      return diff / (SIG * SIG);
    };

    {
      const sigs = {};
      const fail = [];
      for (const id of ORDER) {
        if (!LEVELS[id]) { fail.push(`${id}（LEVELS 沒有這關）`); continue; }
        try { sigs[id] = captureGround(id); } catch (e) { fail.push(`${id} 擷取失敗 ${(e && e.message) || e}`); }
      }
      const ids = Object.keys(sigs);
      const blanks = ids.filter((id) => !(sigs[id].opaqueRatio > 0.5))
        .map((id) => `${id} ${(sigs[id].opaqueRatio * 100).toFixed(0)}%`);
      ok('D15a 每關開局後的畫布地面區域不是空白（不透明像素 > 50%）',
        fail.length === 0 && blanks.length === 0 && ids.length === ORDER.length,
        fail.length ? `擷取失敗：${fail.join('、')}`
          : (blanks.length ? `太透明：${blanks.join('、')}` : `${ids.length} 關地面都有內容（不透明 ≥ ${Math.min(...ids.map((i) => sigs[i].opaqueRatio * 100)).toFixed(0)}%）`));

      // 任兩關不得長得一樣
      const pairBad = [];
      let worst = { pair: '-', ratio: 1 };
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const r = sigDiff(sigs[ids[i]].q, sigs[ids[j]].q);
          if (r < worst.ratio) worst = { pair: `${ids[i]}↔${ids[j]}`, ratio: r };
          if (!(r > 0.05)) pairBad.push(`${ids[i]}↔${ids[j]} 只有 ${(r * 100).toFixed(1)}%`);
        }
      }
      ok('D15b 任兩關的地面外觀都不同（簽章像素差 > 5%）',
        pairBad.length === 0 && ids.length >= 2,
        `最相近的一對：${worst.pair} ${(worst.ratio * 100).toFixed(1)}%（門檻 > 5%）`
        + (pairBad.length ? `｜不合格：${pairBad.join('、')}` : `｜共比對 ${(ids.length * (ids.length - 1)) / 2} 對`));

      // 同一關連兩次取樣必須幾乎一樣，否則上面兩條的數字沒有意義（會隨機紅綠）。
      // 自噪（實測 0~0.6%）必須遠低於跨關最小差（實測 12.7%），否則「> 5%」這條門檻
      // 就只是雜訊。門檻訂 3%：仍是跨關最小差的 1/4 以下，且對自噪有 5 倍餘裕。
      let selfDiff = null;
      if (sigs[ORDER[0]]) {
        try {
          const again = captureGround(ORDER[0]);
          selfDiff = sigDiff(sigs[ORDER[0]].q, again.q);
        } catch (e) { selfDiff = null; }
      }
      ok('D15c 地面簽章可重現（同一關連兩次取樣差 ≤ 3%）',
        selfDiff !== null && selfDiff <= 0.03,
        selfDiff === null ? '第二次取樣失敗' : `${ORDER[0]} 兩次差 ${(selfDiff * 100).toFixed(1)}%`);
    }

    // ══ E. 玩得起來 + 解鎖鏈 ═══════════════════════════════════════════════

    {
      const runBad = [];
      const bossBad = [];
      for (const id of ORDER) {
        if (!LEVELS[id]) { runBad.push(`${id}（LEVELS 沒有這關）`); continue; }
        let err = null;
        let frames = 0;
        let revived = 0;
        try {
          g.levelId = id;
          g.start(false);
          for (let i = 0; i < 600; i++) {
            resolveModals();
            keepAlive();
            if (g.state === 'GAME_OVER') { revived++; g.state = 'PLAYING'; }
            g.update(1 / 60);
            frames++;
          }
        } catch (e) {
          err = `${(e && e.name) || 'Error'}: ${(e && e.message) || e}`;
        }
        if (err || frames < 600) {
          runBad.push(`${id}: 第 ${frames + 1} 幀 ${err || '中斷'}`);
          continue;
        }

        // Boss 排程真的會被觸發：把時鐘推到第一隻 Boss 的 at，確認場上出現 isBoss
        const bosses = Array.isArray(g.level.bosses) ? g.level.bosses : [];
        const target = bosses.length
          ? bosses[0].at
          : ((g.spawner && g.spawner.nextEndlessBossAt) || lv.ENDLESS_BOSS_INTERVAL || 90);
        g.gameTime = Math.max(g.gameTime, target - 0.001);
        let seen = false;
        for (let i = 0; i < 8 && !seen; i++) {
          resolveModals();
          keepAlive();
          g.update(1 / 60);
          seen = g.enemies.some((e) => e && e.isBoss);
        }
        if (!seen) bossBad.push(`${id}: 時鐘推到 ${target}s 後場上仍沒有 isBoss 敵人`);
      }
      ok('E16 每一關都能 game.start(false) 後手動跑 600 幀不拋例外',
        runBad.length === 0,
        runBad.length ? runBad.join('；') : `${ORDER.length} 關 × 600 幀全部通過（升級選卡自動選第一張）`);
      ok('E16b 每一關的第一隻 Boss 排程真的會被觸發',
        bossBad.length === 0 && ORDER.length > 0,
        bossBad.length ? bossBad.join('；') : `${ORDER.length} 關都會生出 isBoss 敵人`);
    }

    // E17 解鎖鏈：乾淨存檔，通關第 N 關只該解鎖第 N+1 關
    {
      const mode = 'survivor';
      save.data.mode = mode;
      save.data.best = { survivor: {}, defense: {} };
      save.data.unlocked = { survivor: ['street'], defense: ['street'] };

      const log = [];
      const bad = [];
      // 先確認「沒通關就不解鎖」
      save.recordRun(ORDER[0], {
        time: 60, kills: 0, level: 1, cleared: false, nextLevel: LEVELS[ORDER[0]] && LEVELS[ORDER[0]].next, modeId: mode,
      });
      const afterNoClear = save.data.unlocked[mode].slice();
      if (afterNoClear.length !== 1) bad.push(`未通關（cleared:false）就解鎖了 ${afterNoClear.filter((x) => x !== 'street').join('、')}`);

      for (const id of ORDER) {
        if (!LEVELS[id]) { bad.push(`LEVELS 沒有 ${id}`); continue; }
        const nextId = LEVELS[id].next;
        if (nextId && save.isUnlocked(nextId, mode)) bad.push(`${nextId} 在 ${id} 通關前就解鎖了`);
        const before = save.data.unlocked[mode].slice();
        save.recordRun(id, { time: DUR, kills: 1000, level: 20, cleared: true, nextLevel: nextId, modeId: mode });
        const added = save.data.unlocked[mode].filter((x) => !before.includes(x));
        if (nextId) {
          if (!(added.length === 1 && added[0] === nextId)) {
            bad.push(`${id} 通關後解鎖了 [${list(added)}]，應該只有 ${nextId}`);
          }
        } else if (added.length !== 0) {
          bad.push(`最後一關（${id}）通關後不該再解鎖任何關卡，卻解鎖了 [${list(added)}]`);
        }
        log.push(`${id}→${added.join('+') || '（鏈尾）'}`);
      }
      ok('E17 通關只解鎖下一關（未通關不解鎖、最後一關不再解鎖）',
        bad.length === 0, bad.length ? bad.join('；') : log.join(' '));

      // 沒有孤島關卡：從第一關沿著 next 走必須能抵達每一關（順序 = LEVEL_ORDER），
      // 而且只有鏈尾可以 next === null。
      // 這條原本寫死「subway 需 core、endless 需 storm」—— 但關卡會一直加，
      // 寫死鏈上的某一節等於每次加關卡都要回來改（這次加了第二批就直接過期）。
      const reachable = [];
      let cursor = ORDER[0];
      const guard = new Set();
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor);
        reachable.push(cursor);
        cursor = LEVELS[cursor] ? LEVELS[cursor].next : null;
      }
      const unreachable = ORDER.filter((id) => !reachable.includes(id));
      const orderBad = reachable.join('>') !== ORDER.join('>');
      const nulls = ORDER.filter((id) => LEVELS[id].next === null);
      ok('E17b 沒有孤島關卡：從第一關沿 next 能走到每一關（順序 = LEVEL_ORDER，只有鏈尾為 null）',
        unreachable.length === 0 && !orderBad && nulls.length === 1 && nulls[0] === ORDER[ORDER.length - 1],
        unreachable.length || orderBad
          ? `走到的順序 ${reachable.join('>')}｜無法抵達：${unreachable.join('、') || '無'}`
          : `${ORDER.length} 關全部可達，鏈尾 ${nulls[0]}`);
    }

    // 額外：選單真的畫得出這些關卡（解鎖鏈要接得上 UI）
    {
      let detail = '';
      let pass = false;
      try {
        save.data.mode = 'survivor';
        save.data.unlocked = { survivor: ['street'], defense: ['street'] };
        g.ui.buildLevelSelect(LEVELS, ORDER, save, () => {}, 'street');
        const box = g.ui.levelSelect;
        const cards = box ? [...box.querySelectorAll('.level-card')] : [];
        const locked = cards.filter((c) => c.classList.contains('locked')).length;
        pass = cards.length === ORDER.length && locked === ORDER.length - 1;
        detail = box
          ? `${cards.length} 張卡（應 ${ORDER.length}）、鎖住 ${locked} 張（應 ${ORDER.length - 1}）`
            + (/🔒/.test(box.textContent) ? '、鎖頭有畫出來' : '、沒有鎖頭圖示')
          : '找不到 g.ui.levelSelect 容器';
      } catch (e) {
        detail = `渲染關卡選擇時拋例外：${(e && e.message) || e}`;
      }
      ok('F 關卡選擇 UI 畫得出全部關卡，且未解鎖的顯示為鎖住', pass, detail);
    }
  } catch (e) {
    out.push({
      name: '工具本身未預期的例外（上面的結果可能不完整）',
      pass: false,
      detail: String((e && e.stack) || e),
    });
  }
  return out;
});

/* ── 3) 輸出 ───────────────────────────────────────────────── */
let passed = 0;
let failed = 0;
for (const r of results) {
  if (r.pass) passed++;
  else failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  [${r.detail}]`);
}
console.log(`\n${passed} passed, ${failed} failed  (pageerror: ${errs.length})`);
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 5).join('\n'));
if (failed || errs.length) process.exitCode = 1;

await browser.close();
stopServer();
