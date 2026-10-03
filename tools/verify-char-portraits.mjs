// 選角頭像的載入行為驗證（四組）。起因：玩家回報「更版後角色圖形全部跑掉了」，
// 截圖是手機上的開始畫面 —— 特工卡的角色圖整塊空白，文字與徽章卻都正常。
//
// 根因：js/systems/UI.js 的頭像繪製 await 了 imageSpritesReady，而那是「全部貼圖」的
// Promise.all。它蓋住的圖從 v34 的 30 張 / 1.0MB 長到 v63 的 137 張 / 17.8MB，
// 於是手機 4G（尤其剛換版、所有圖都要重抓時）會整片空白十幾秒；
// 只要有一個請求卡住不 fire load/error，更是永遠不畫。
//
// 這支把「感覺」變成可量測的門檻：
//   1. 正常網速：25 張卡的頭像都要畫出來，而且逐像素等於對應的精靈圖
//      （防「畫出來了但畫成 getSprite 退回的 walker 殭屍」）
//   2. 漸進式：冷快取 + Fast 3G，頭像必須**陸續冒出來**，不能等到全部到齊才有
//      （舊版這裡是 0 張）
//   3. 單張卡住不拖垮全部：攔住其中一張圖永不回應，其餘 24 張仍然要畫出來
//   4. 逾時保底：同一情境下 imageSpritesReady 仍必須在上限內 settle
//
// 用法：
//   PW_MODULE=/path/to/playwright/index.js node tools/verify-char-portraits.mjs
// 離開碼 1 表示有項目失敗。需要 playwright（PW_MODULE 可指向絕對路徑）。

import http from 'node:http';
import path from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
// Windows 上 `new URL(import.meta.url).pathname` 會給出 `/D:/...`（磁碟相對路徑），
// 底下 SRC 就變成「D 槽根目錄下的 \D:\DevProject\...」→ 每個請求都 404、頁面永遠載不完。
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SRC = path.join(ROOT, '..');
const PORT = Number(process.env.PORTRAITS_PORT || 8903);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

// 為什麼自己寫伺服器而不是 python3 -m http.server：
// 第 3、4 組要模擬「某張圖的請求永遠不回應」（手機切到背景、訊號掉掉時的真實長相），
// 那需要在伺服器端把 socket 吊住 —— 攔截／假計時器都做不出真正掛住的連線。
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

let stallPath = null;   // 只在帶查詢字串時吊住（SW 預快取用的是不帶查詢字串的同一個路徑）
let stallHits = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (stallPath && url.pathname === stallPath && url.search) { stallHits++; return; }   // 永不回應
  const file = path.join(SRC, decodeURIComponent(url.pathname));
  if (!file.startsWith(SRC)) { res.writeHead(403).end(); return; }
  let st;
  try { st = statSync(file); } catch (err) {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end('not found');
    return;
  }
  const target = st.isDirectory() ? path.join(file, 'index.html') : file;
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
    'Cache-Control': 'no-store, must-revalidate',
  });
  createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const killServer = () => { try { server.close(); } catch (err) { /* 已關 */ } };

const browser = await pw.chromium.launch();
const pageErrors = [];

// 在頁面裡數「畫出來的頭像」：canvas 有不透明像素就算畫出來了
const COUNT_DRAWN = () => {
  const cvs = [...document.querySelectorAll('.char-portrait')];
  let drawn = 0;
  for (const cv of cvs) {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let k = 3; k < d.length; k += 4) if (d[k] > 40) { drawn++; break; }
  }
  return { cards: cvs.length, drawn };
};

async function newPage({ throttle = null, stall = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (stall) { stallPath = stall; stallHits = 0; }
  const p = await context.newPage();
  p.on('pageerror', (e) => pageErrors.push(String(e.message).split('\n')[0].slice(0, 140)));
  if (throttle) {
    const cdp = await context.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: throttle.latency, downloadThroughput: throttle.download, uploadThroughput: 100000,
    });
  }
  return { context, page: p, stallHits: () => stallHits };
}

/* ── 1) 正常網速：25 張頭像都要畫出來，而且要等於正確的精靈圖 ── */
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.game, null, { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const cvs = [...document.querySelectorAll('.char-portrait')];
      if (!cvs.length) return false;
      return cvs.every((cv) => {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let k = 3; k < d.length; k += 4) if (d[k] > 40) return true;
        return false;
      });
    }, null, { timeout: 60000 }).catch(() => {});

  const counts = await page.evaluate(COUNT_DRAWN);
  ok('正常網速下 25 張特工頭像全部畫出來', counts.cards === 25 && counts.drawn === 25,
    `畫出 ${counts.drawn}/${counts.cards}`);

  // 逐像素比對：卡片畫的必須是「這隻角色」自己的貼圖，不是退回的 walker
  const mismatch = await page.evaluate(async () => {
    const imp = (p) => import(new URL(p, document.baseURI).href);
    const mod = await imp('js/sprites.js');
    const { getSprite } = mod;
    // 舊版沒有這支 API → 明確判 FAIL，而不是丟 TypeError 中斷整支工具
    const hasImageApi = typeof mod.isImageSprite === 'function';
    const { CHARACTERS, CHARACTER_ORDER } = await imp('js/characters.js');
    const cards = [...document.querySelectorAll('.char-portrait')];
    const bad = [];
    // BUILDERS 字面值裡本來就有生肖／基礎角色的「程式繪圖佔位」，所以還要確認
    // 用到的是真圖：貼圖 builder 才有 image:true。
    const placeholders = [];
    cards.forEach((cv, i) => {
      const key = CHARACTERS[CHARACTER_ORDER[i]]?.sprite;
      if (!key) return;
      const sp = getSprite(key);
      if (!hasImageApi) { placeholders.push('(舊版沒有 isImageSprite API)'); return; }
      if (!mod.isImageSprite(key)) placeholders.push(key);
      const ref = document.createElement('canvas');
      ref.width = 128; ref.height = 120;
      const rctx = ref.getContext('2d');
      rctx.translate(64, 68);
      const zoom = Math.min(1.5, 112 / sp.h);
      rctx.scale(zoom, zoom);
      rctx.drawImage(sp.frames[0], -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      const a = cv.getContext('2d').getImageData(0, 0, 128, 120).data;
      const b = rctx.getImageData(0, 0, 128, 120).data;
      let diff = 0;
      for (let k = 3; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) > 24) diff++;
      if (diff > 60) bad.push(`${key}(diff=${diff})`);
    });
    return { bad, placeholders };
  });
  ok('每一張頭像都等於該角色自己的貼圖（沒有畫成 walker 殭屍）', mismatch.bad.length === 0,
    mismatch.bad.length ? mismatch.bad.join(' ') : '25/25 吻合');
  ok('25 張用的都是真圖貼圖，不是 BUILDERS 裡的程式繪圖佔位', mismatch.placeholders.length === 0,
    mismatch.placeholders.length ? `仍為佔位：${mismatch.placeholders.join(' ')}` : '25/25 都是 image:true');
  await context.close();
}

/* ── 2) 冷快取 + Fast 3G：頭像要隨自己的圖到齊陸續出現，不能等全部 ── */
const PROGRESS = [];
{
  const { context, page } = await newPage({ throttle: { latency: 150, download: 200000 } });
  const t0 = Date.now();
  page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    let c;
    try { c = await page.evaluate(COUNT_DRAWN); } catch (err) { continue; }
    PROGRESS.push({ s: Math.round((Date.now() - t0) / 1000), drawn: c.drawn, cards: c.cards });
  }
  const line = PROGRESS.map((p) => `${p.s}s:${p.drawn}/${p.cards}`).join(' ');
  const ready = PROGRESS.filter((p) => p.cards === 25);
  const best = ready.reduce((m, p) => Math.max(m, p.drawn), 0);
  // 「部分畫出來、其他還沒」是舊版**不可能**出現的狀態：舊版一次畫或一張都不畫。
  const partial = ready.find((p) => p.drawn > 0 && p.drawn < p.cards);
  ok('Fast 3G 冷快取下，頭像只等自己那張圖（會出現「部分已畫、部分還沒」的中間狀態）',
    !!partial, partial ? `第 ${partial.s}s：${partial.drawn}/${partial.cards}` : line);
  ok('Fast 3G 冷快取下 60 秒內至少畫出 5 張（舊版：58 秒仍是 0 張）',
    best >= 5, `最多畫出 ${best}/25｜${line}`);
  await context.close();
}

/* ── 3+4) 攔住其中一張圖永不回應：其餘 24 張仍要畫出來，且整批 Promise 仍會 settle ── */
{
  // 只攔「頁面自己發的」帶查詢字串那個請求；SW 預快取用的是不帶查詢字串的 URL。
  const { context, page, stallHits } = await newPage({ stall: "/assets/zodiac/dragon_hero.png" });
  // 用 domcontentloaded：被攔住的圖會讓 window 的 load 事件永遠不觸發（那正是舊版卡死的原因）
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.game, null, { timeout: 30000 });

  await page.waitForTimeout(9000);   // 逾時 8s，讓 timeout 這條路自己走完

  const counts = await page.evaluate(COUNT_DRAWN);
  ok('有一張圖永遠不回應時，其餘特工頭像仍然畫得出來（舊版：0 張）',
    counts.drawn === counts.cards - 1,
    `畫出 ${counts.drawn}/${counts.cards}（被攔的是蒼龍天尊，應為 24/25；攔截命中 ${stallHits()} 次）`);

  const stalledCard = await page.evaluate(async () => {
    const imp = (p) => import(new URL(p, document.baseURI).href);
    const { CHARACTERS, CHARACTER_ORDER } = await imp('js/characters.js');
    const idx = CHARACTER_ORDER.findIndex((id) => CHARACTERS[id].sprite === 'dragon_hero');
    const cvs = [...document.querySelectorAll('.char-portrait')];
    const cv = cvs[idx];
    if (!cv) return { found: false };
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let px = 0;
    for (let k = 3; k < d.length; k += 4) if (d[k] > 40) px++;
    return { found: true, idx, px };
  });
  ok('被攔的那張維持空白，不會被畫成程式繪圖佔位（生肖的佔位是 walker＝殭屍畫法）',
    stalledCard.found && stalledCard.px === 0,
    stalledCard.found ? `第 ${stalledCard.idx} 張（dragon_hero）像素數 ${stalledCard.px}` : '找不到該卡');

  await context.close();
}

/* ── 5) 逾時保底：同一情境下 imageSpritesReady 仍必須 settle ── */
{
  const { context, page } = await newPage({ stall: "/assets/zodiac/dragon_hero.png" });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const settled = await page.evaluate(async () => {
    const mod = await import(new URL('js/sprites.js', document.baseURI).href);
    const t0 = performance.now();
    const done = await Promise.race([
      mod.imageSpritesReady.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 25000)),
    ]);
    return { done, ms: Math.round(performance.now() - t0) };
  });
  ok('imageSpritesReady 一定 settle（單張卡住不會讓它永遠吊著；逾時上限 8s）',
    settled.done === true && settled.ms <= 15000, `settle 於 ${settled.ms}ms`);
  await context.close();
}

await browser.close();
killServer();

if (pageErrors.length) console.log('\n  pageerror:', pageErrors.join(' | '));
console.log('\n載入進度:', PROGRESS.map((p) => `${p.s}s:${p.drawn}/${p.cards}`).join(' '));
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n${passed} passed, ${failed} failed  (pageerror: ${pageErrors.length})`);
process.exit(failed === 0 ? 0 : 1);
