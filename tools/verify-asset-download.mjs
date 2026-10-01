// 素材下載與進場載入的驗證（五組）。起因：玩家回報「重新繪製過全部的角色，
// 遊戲更版之後全部變成舊的」。
//
// 根因不是部署把圖換回去（v52 與現在的角色 PNG 逐位元相同），而是兩個載入行為：
//   1. 換版時 Service Worker 會清掉舊快取並**默默**重新下載整套素材（40 幾 MB），
//      那幾十秒裡 getSprite() 會靜默退回 BUILDERS 裡的程式繪圖＝美術重繪前的舊圖
//   2. 貼圖是一張一張下載的，玩家自己的角色卻排在 137 張的中後段
//
// 這支把「要下載多大、玩家同意才下載」「進場前先等本場角色」「地表一關一抓」
// 變成可量測的門檻：
//   1. 玩家同意之前，一筆素材都不准默默下載；橫幅必須寫出大小
//   2. 同意之後素材全部進快取，而且離線重載時 25 個角色都還是真圖
//   3. 開場只抓「目前這一關」的地表貼圖（原本 12 張全抓 = 22.6MB）
//   4. 角色貼圖的請求順序要排在敵人／裝飾／首領之前
//   5. 玩家自己的角色貼圖還沒到時，按鈕要顯示「載入角色中…」並等待（不進場）
//
// 用法：PW_MODULE=/path/to/playwright/index.js node tools/verify-asset-download.mjs
// 離開碼 1 表示有項目失敗。

import http from 'node:http';
import path from 'node:path';
import { createReadStream, statSync, readFileSync } from 'node:fs';

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.ASSETS_PORT || 8904);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

// 自己寫伺服器：第 5 組要把「玩家角色貼圖」的請求吊住（模擬手機還沒下載完），
// 那需要真的把 socket 留著不回應。
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
let stallPath = null;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (stallPath && url.pathname === stallPath && url.search) return;   // 永不回應
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  let st;
  try { st = statSync(file); } catch (err) { res.writeHead(404).end('not found'); return; }
  const target = st.isDirectory() ? path.join(file, 'index.html') : file;
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
    'Cache-Control': 'no-store, must-revalidate',
  });
  createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const version = JSON.parse(readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
const swSrc = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const precache = [...swSrc.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const assetCount = precache.filter((p) => p.replace(/^\.\//, '').startsWith('assets/')).length;

const browser = await pw.chromium.launch();
const pageErrors = [];

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await context.newPage();
  p.on('pageerror', (e) => pageErrors.push(String(e.message).split('\n')[0].slice(0, 140)));
  return { context, page: p };
}
const bannerState = (p) => p.evaluate(() => {
  const el = document.getElementById('pwa-banner');
  if (!el || el.classList.contains('hidden')) return null;
  return {
    title: el.querySelector('.pwa-title')?.textContent || '',
    desc: el.querySelector('.pwa-desc')?.textContent || '',
    action: el.querySelector('.pwa-action')?.textContent || '',
  };
});
const cacheState = (p) => p.evaluate(async () => {
  const names = await caches.keys();
  const shell = names.find((n) => /^gaga-v\d+$/.test(n));
  const keys = shell ? await (await caches.open(shell)).keys() : [];
  return {
    names,
    total: keys.length,
    assets: keys.filter((k) => /\/assets\//.test(k.url)).length,
    consent: localStorage.getItem('gaga.assetsOk'),
  };
});

/* ── 1+2) 同意前不准偷抓、橫幅要寫大小；同意後全抓，且離線仍是真圖 ── */
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.gagaPWA && window.game, null, { timeout: 30000 });
  await page.waitForTimeout(4500);

  const before = await cacheState(page);
  const banner = await bannerState(page);
  ok('玩家同意之前，遊戲素材一筆都沒有下載', before.assets === 0,
    `快取 ${before.total} 筆（其中素材 ${before.assets} 筆）`);
  ok('橫幅有寫出要下載多大、並提供「立即下載」', !!banner && /MB|KB/.test(banner.desc) && banner.action === '立即下載',
    banner ? `「${banner.title}」/「${banner.desc}」/ [${banner.action}]` : '橫幅沒出現');
  ok('version.json 的素材大小與 sw.js 的素材清單一致',
    Math.abs(version.assetsKB - (await page.evaluate(() => window.gagaPWA.state().assetsKB))) === 0,
    `version.json ${version.assetsKB}KB、清單 ${assetCount} 檔`);

  await page.evaluate(() => document.querySelector('#pwa-banner .pwa-action')?.click());
  let after = await cacheState(page);
  for (let i = 0; i < 60 && !after.consent; i++) {
    await page.waitForTimeout(1000);
    after = await cacheState(page);
  }
  ok('按下「立即下載」後素材全部進快取、並記住這一版已同意',
    after.assets >= assetCount && after.consent === String(version.version),
    `素材 ${after.assets}/${assetCount} 筆、同意版本=${after.consent}`);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(8000);
  const offline = await page.evaluate(async () => {
    const mod = await import(new URL('js/sprites.js', document.baseURI).href);
    const { CHARACTERS, CHARACTER_ORDER } = await import(new URL('js/characters.js', document.baseURI).href);
    return {
      hasGame: !!window.game,
      real: CHARACTER_ORDER.filter((id) => mod.isImageSprite(CHARACTERS[id].sprite)).length,
      total: CHARACTER_ORDER.length,
    };
  });
  ok('下載後離線重載，25 個角色全部是真圖（不是程式繪圖的舊圖）',
    offline.hasGame && offline.real === offline.total,
    `真圖 ${offline.real}/${offline.total}｜game=${offline.hasGame}`);
  await context.close();
}

/* ── 3+4) 地表一關一抓、角色貼圖優先 ── */
{
  const { context, page } = await newPage();
  const requested = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/\/assets\//.test(u)) requested.push(u.split('/assets/')[1].split('?')[0]);
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.game, null, { timeout: 30000 });
  await page.waitForTimeout(4000);

  const ground = requested.filter((f) => f.startsWith('ground/'));
  ok('開場只抓目前這一關的地表貼圖（原本 12 張全抓 = 22.6MB）', ground.length === 1, `ground 請求 ${ground.length} 張：${ground.join(', ')}`);

  const charIdx = requested.findIndex((f) => f === 'xian/duck.png' || f === 'zodiac/rat_hero.png');
  const enemyIdx = requested.findIndex((f) => /^(xian\/(walker|runner|brute|bat|hound|spitter)\.png)$/.test(f));
  const decorIdx = requested.findIndex((f) => f.startsWith('decor/'));
  ok('玩家角色的貼圖排在敵人與場景裝飾之前',
    charIdx >= 0 && (enemyIdx === -1 || charIdx < enemyIdx) && (decorIdx === -1 || charIdx < decorIdx),
    `角色 #${charIdx + 1}、敵人 #${enemyIdx + 1}、裝飾 #${decorIdx + 1}（共 ${requested.length} 個請求）`);
  await context.close();
}

/* ── 5) 角色貼圖還沒到時，按鈕要等（不能拿著舊圖進場） ── */
{
  stallPath = '/assets/xian/duck.png';
  const { context, page } = await newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.game, null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  await page.evaluate(() => { window.__t0 = performance.now(); document.getElementById('btn-start-game').click(); });
  await page.waitForTimeout(1200);
  const waiting = await page.evaluate(() => ({
    text: document.getElementById('btn-start-game').textContent,
    disabled: document.getElementById('btn-start-game').disabled,
    state: window.game.state,
  }));
  ok('角色貼圖還沒到時，按鈕顯示「載入角色中…」並停用（不會先開場）',
    /載入角色中/.test(waiting.text) && waiting.disabled === true && waiting.state !== 'PLAYING',
    `按鈕「${waiting.text}」disabled=${waiting.disabled} state=${waiting.state}`);

  let entered = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ st: window.game.state, ms: Math.round(performance.now() - window.__t0) }));
    if (s.st === 'PLAYING') { entered = s.ms; break; }
  }
  // 這裡量的是「等待有上限、而且逾時後真的會放行」。進場的總時間會再加上
  // game.start() 本身（這台機器約 20 秒，改動前後一樣），所以不看總時數。
  const timedOut = logs.some((t) => /貼圖等待逾時/.test(t));
  ok('等不到也不會卡死：貼圖等待有逾時上限，逾時後仍然進場',
    timedOut && entered !== null,
    `${timedOut ? '有逾時放行紀錄' : '沒有逾時紀錄'}｜第 ${entered}ms 進場（含 game.start() 本身約 20 秒）`);
  await context.close();
  stallPath = null;
}

await browser.close();
server.close();
if (pageErrors.length) console.log('\n  pageerror:', pageErrors.join(' | '));
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n${passed} passed, ${failed} failed  (pageerror: ${pageErrors.length})`);
process.exit(failed === 0 ? 0 : 1);
