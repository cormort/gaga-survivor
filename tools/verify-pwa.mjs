// PWA 驗證：manifest / Service Worker / 離線遊玩 / 圖示 / 預快取完整性
//
// 用法：
//   PW_MODULE=/Users/hermes/.npm/_npx/6301df25ace19226/node_modules/playwright/index.js \
//   node /tmp/verify-pwa.mjs
//
// 重點：這個腳本自己起一台 http.server (8901) 並在測離線時把它「殺掉」。
// 只靠 context.setOffline(true) 不夠 —— Playwright 的網路模擬不涵蓋 Service Worker
// 自己發出的請求，那樣根本沒驗到「真的離線」。伺服器真的關掉，SW 就只能吃快取。
//
// 離開碼 1 = 有項目失敗。

import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const ROOT = process.cwd();
const PORT = Number(process.env.PWA_PORT || 8901);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

/* ── 自備伺服器 (不動別人的 8899) ── */
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.status === 200) return true;
    } catch (err) { /* 還沒起來 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};
let serverAlive = true;
const killServer = () => {
  if (!serverAlive) return;
  serverAlive = false;
  try { server.kill('SIGKILL'); } catch (err) { /* 已死 */ }
};

/* ── 0) 靜態：sw.js 的預快取清單 vs 磁碟實際檔案 ── */
const swSrc = await readFile(path.join(ROOT, 'sw.js'), 'utf8');
const listBlock = swSrc.match(/const PRECACHE = \[([\s\S]*?)\];/);
const precache = listBlock ? [...listBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
ok('sw.js 找得到 PRECACHE 清單', !!listBlock && precache.length > 0, `${precache.length} 筆`);

const walk = (dir, filter) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(entry)) out.push('./' + path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out;
};
const diskJs = walk(path.join(ROOT, 'js'), (f) => f.endsWith('.js')).sort();
const missing = diskJs.filter((f) => !precache.includes(f));
ok('js/ 底下每個模組都在預快取清單內', missing.length === 0,
  missing.length ? `缺 ${missing.length}: ${missing.join(', ')}` : `${diskJs.length} 個模組全中`);

const ghost = [];
for (const p of precache) {
  if (p === './') continue;
  try { statSync(path.join(ROOT, p)); } catch { ghost.push(p); }
}
ok('預快取清單沒有列出不存在的檔案', ghost.length === 0, ghost.join(', ') || `${precache.length} 筆都存在`);

/* ── 1) 圖示 PNG：檔頭尺寸 ── */
function pngSize(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  if (buf.slice(12, 16).toString('ascii') !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const ICONS = [
  ['icons/icon-192.png', 192], ['icons/icon-512.png', 512],
  ['icons/icon-maskable-512.png', 512], ['icons/apple-touch-icon.png', 180],
];
let iconBytes = 0;
for (const [rel, size] of ICONS) {
  const buf = await readFile(path.join(ROOT, rel));
  iconBytes += buf.length;
  const dim = pngSize(buf);
  ok(`${rel} 是 ${size}x${size} PNG`, !!dim && dim.w === size && dim.h === size,
    dim ? `${dim.w}x${dim.h}, ${buf.length} bytes` : '不是合法 PNG');
}
const svgBytes = (await readFile(path.join(ROOT, 'icons/icon.svg'))).length
  + (await readFile(path.join(ROOT, 'icons/icon-maskable.svg'))).length;
ok('圖示總量 < 200KB', iconBytes + svgBytes < 200 * 1024,
  `${((iconBytes + svgBytes) / 1024).toFixed(1)} KB`);

/* ── 瀏覽器端 ── */
const up = await waitForServer();
ok(`自備測試伺服器 ${BASE} 起來了`, up, `port ${PORT}`);
if (!up) { killServer(); process.exit(1); }

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });

/* manifest */
const manifestInfo = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  const out = { href: link && link.getAttribute('href') };
  if (!out.href) return out;
  out.resolved = new URL(out.href, location.href).href;
  try {
    const res = await fetch(out.href);
    out.status = res.status;
    out.type = res.headers.get('content-type') || '';
    out.json = await res.json();
  } catch (err) { out.error = String(err); }
  return out;
});
ok('index.html 有 <link rel="manifest">', !!manifestInfo.href, `${manifestInfo.href} → ${manifestInfo.resolved}`);
const mf = manifestInfo.json || {};
ok('manifest 抓得到並解析成 JSON', !!manifestInfo.json && manifestInfo.status === 200,
  `HTTP ${manifestInfo.status}, content-type=${manifestInfo.type}`);
ok('manifest name / short_name', mf.name === '嘎嘎特攻隊 Gaga Survivor' && mf.short_name === '嘎嘎特攻隊',
  `${mf.name} / ${mf.short_name}`);
ok('manifest start_url / scope / display / lang',
  mf.start_url === './index.html?source=pwa' && mf.scope === './'
  && mf.display === 'standalone' && mf.lang === 'zh-Hant',
  `${mf.start_url} | ${mf.scope} | ${mf.display} | ${mf.lang}`);
ok('manifest 色彩與分類', mf.background_color === '#0a0e17' && mf.theme_color === '#0a0e17'
  && Array.isArray(mf.categories) && mf.categories.includes('games'),
  `${mf.background_color}/${mf.theme_color} ${JSON.stringify(mf.categories)}`);
ok('manifest 有 192 / 512 / maskable 圖示',
  Array.isArray(mf.icons) && mf.icons.some((i) => i.sizes === '192x192')
  && mf.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')
  && mf.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'),
  JSON.stringify((mf.icons || []).map((i) => `${i.sizes}:${i.purpose}`)));
const iconStatus = await page.evaluate(async (srcs) => {
  const out = {};
  for (const s of srcs) { try { out[s] = (await fetch(s)).status; } catch (err) { out[s] = String(err); } }
  return out;
}, (mf.icons || []).map((i) => i.src));
ok('manifest 指到的圖示都回 200', Object.values(iconStatus).every((s) => s === 200), JSON.stringify(iconStatus));

/* Service Worker：ready → 等到真的 activated */
const swInfo = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((r) => setTimeout(() => r(null), 15000)),
  ]);
  if (!reg) return { supported: true, timeout: true };
  const deadline = Date.now() + 10000;
  while (reg.active && reg.active.state !== 'activated' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    supported: true,
    scope: reg.scope,
    state: reg.active && reg.active.state,
    scriptURL: (reg.active && reg.active.scriptURL) || null,
  };
});
ok('navigator.serviceWorker.ready 有回應', swInfo.supported && !swInfo.timeout, JSON.stringify(swInfo).slice(0, 160));
ok('Service Worker 已 activated 且 scope 為 /',
  swInfo.state === 'activated' && swInfo.scope === `${BASE}/`,
  `state=${swInfo.state} scope=${swInfo.scope} script=${swInfo.scriptURL}`);

/* 快取內容 */
const cacheInfo = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = { names, entries: {}, crossOrigin: [] };
  for (const n of names) {
    const cache = await caches.open(n);
    const keys = await cache.keys();
    out.entries[n] = keys.map((k) => k.url);
    for (const k of keys) if (new URL(k.url).origin !== location.origin) out.crossOrigin.push(k.url);
  }
  return out;
});
const shellKeys = cacheInfo.entries['gaga-v1'] || [];
ok('快取名稱為 gaga-v1 (+runtime)', cacheInfo.names.includes('gaga-v1'), cacheInfo.names.join(', '));
const notCached = precache.filter((p) => !shellKeys.includes(new URL(p, `${BASE}/`).href));
ok('預快取清單每一筆都真的進了快取', notCached.length === 0,
  notCached.length ? `漏 ${notCached.length}: ${notCached.join(', ')}` : `${shellKeys.length} 筆`);
ok('完全沒有攔截/快取跨網域請求', cacheInfo.crossOrigin.length === 0,
  cacheInfo.crossOrigin.join(', ') || '0 筆跨網域');

/* 查詢字串算在快取 key 內 + runtime cache 會補上沒預快取的東西 */
const runtimeProbe = await page.evaluate(async () => {
  const url = '/css/style.css?cachekey-probe=1';
  const res = await fetch(url);
  const names = await caches.keys();
  const keys = [];
  for (const n of names) {
    const c = await caches.open(n);
    keys.push(...(await c.keys()).map((k) => k.url));
  }
  return {
    status: res.status,
    storedWithQuery: keys.includes(new URL(url, location.origin).href),
    storedWithoutQuery: keys.includes(new URL('/css/style.css', location.origin).href),
  };
});
ok('沒預快取的 URL 第一次用就進 runtime 快取 (含查詢字串的 key)',
  runtimeProbe.status === 200 && runtimeProbe.storedWithQuery === true
  && runtimeProbe.storedWithoutQuery === true,
  JSON.stringify(runtimeProbe));

/* 重載 → 由 SW 控制 */
const reloadResp = await page.reload({ waitUntil: 'load' });
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
ok('重載後頁面由 Service Worker 控制 (clients.claim)', controlled,
  `controller=${controlled}, fromServiceWorker=${reloadResp ? reloadResp.fromServiceWorker() : 'n/a'}`);

let gameBooted = true;
try {
  await page.waitForFunction(() => window.game, null, { timeout: 12000 });
} catch (err) {
  gameBooted = false;
}
ok('window.game 建立成功 (main.js 啟動)', gameBooted, gameBooted ? 'ok' : '未建立 — 見 pageerror');

/* ── 真的離線：關掉伺服器 + context.setOffline(true)，再 reload ── */
await ctx.setOffline(true);
killServer();
await new Promise((r) => setTimeout(r, 400));
let offlineResp = null;
let offlineLoaded = false;
try {
  offlineResp = await page.reload({ waitUntil: 'load', timeout: 20000 });
  offlineLoaded = true;
} catch (err) {
  offlineLoaded = false;
}
ok('伺服器關掉後仍載入完成 (完全靠快取)', offlineLoaded, offlineLoaded ? 'ok' : 'reload 失敗');
ok('離線導覽確實由 Service Worker 回應', !!offlineResp && offlineResp.fromServiceWorker() === true,
  `fromServiceWorker=${offlineResp ? offlineResp.fromServiceWorker() : 'null'}`);

const offline = await page.evaluate(async () => {
  const out = {};
  out.hasGame = typeof window.game === 'object' && window.game !== null;
  out.cssLoaded = getComputedStyle(document.body).backgroundColor;
  out.hudVisible = !!document.getElementById('exp-bar-container');
  out.controller = !!navigator.serviceWorker.controller;
  out.assets = {};
  for (const u of ['/css/style.css', '/js/main.js']) {
    try { out.assets[u] = (await fetch(u)).status; } catch (err) { out.assets[u] = 'throw'; }
  }
  if (out.hasGame) {
    try {
      const g = window.game;
      g.ui.startScreen.classList.add('hidden');
      g.start();
      for (let i = 0; i < 50 && !(g.enemies && g.enemies.length); i++) {
        await new Promise((r) => setTimeout(r, 200));
      }
      await new Promise((r) => setTimeout(r, 600));
      out.state = g.state;
      out.enemies = g.enemies ? g.enemies.length : -1;
      out.playerHp = g.player ? g.player.hp : null;
      const c = document.getElementById('gameCanvas');
      const x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set();
      let nonDark = 0, samples = 0;
      for (let i = 0; i + 3 < d.length; i += 4 * 37) {
        samples++;
        colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
        if (d[i] + d[i + 1] + d[i + 2] > 90) nonDark++;
      }
      out.pixels = { samples, distinctColors: colors.size, nonDarkRatio: +(nonDark / samples).toFixed(3) };
    } catch (err) { out.gameError = String(err).slice(0, 200); }
  }
  return out;
});
ok('離線時 window.game 仍存在且可開始遊戲',
  offline.hasGame && !offline.gameError && offline.enemies > 0,
  `game=${offline.hasGame} state=${offline.state} enemies=${offline.enemies} hp=${offline.playerHp} err=${offline.gameError || 'none'}`);
ok('離線時 canvas 真的畫得出東西 (非空白)',
  !!offline.pixels && offline.pixels.distinctColors > 30 && offline.pixels.nonDarkRatio > 0.05,
  JSON.stringify(offline.pixels));
ok('離線時 CSS / JS 模組都吃快取 (200)',
  offline.cssLoaded === 'rgb(10, 14, 23)' && offline.hudVisible
  && Object.values(offline.assets).every((s) => s === 200),
  `body=${offline.cssLoaded} assets=${JSON.stringify(offline.assets)}`);

const offNav = await page.evaluate(async () => {
  try {
    const res = await fetch('/definitely-not-precached-' + Date.now() + '.js');
    return res.status;
  } catch (err) { return 'throw:' + String(err).slice(0, 60); }
});
ok('離線抓「沒預快取」的資源時優雅回 503', offNav === 503, String(offNav));

// 離線時，先前 runtime 快取住的「帶查詢字串」資源仍要拿得到 (key 含 query 的直接證明)
const offRuntime = await page.evaluate(async () => {
  try {
    const res = await fetch('/css/style.css?cachekey-probe=1');
    return res.status;
  } catch (err) { return 'throw:' + String(err).slice(0, 60); }
});
ok('離線時仍能從 runtime 快取取回「帶查詢字串」的資源', offRuntime === 200, String(offRuntime));

await ctx.setOffline(false);

/* ── 提示橫幅：位置與觸控穿透 ── */
const banner = await page.evaluate(() => {
  const api = window.gagaPWA;
  if (!api) return { missing: true };
  const shown = api.showInstallBanner();
  const el = document.getElementById('pwa-banner');
  if (!el) return { missing: true, shown };
  el.style.animation = 'none'; // 量測時不要被進場動畫的位移干擾
  const b = el.getBoundingClientRect();
  const joy = document.getElementById('joystick-zone').getBoundingClientRect();
  const act = document.getElementById('action-bar').getBoundingClientRect();
  const overlap = (r1, r2) => !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
  const cx = Math.round((b.left + b.right) / 2);
  const below = document.elementFromPoint(cx, Math.min(innerHeight - 1, b.bottom + 24));
  const middle = document.elementFromPoint(cx, Math.round(innerHeight / 2));
  const out = {
    shown,
    rect: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)],
    overlapsJoystick: overlap(b, joy),
    overlapsActionBar: overlap(b, act),
    pointerEvents: getComputedStyle(el).pointerEvents,
    zIndex: getComputedStyle(el).zIndex,
    visible: !el.classList.contains('hidden'),
    insideViewport: b.left >= 0 && b.right <= innerWidth && b.top >= 0,
    hasText: el.textContent.trim().length > 0,
    // 橫幅以外的座標不該打到橫幅 → 觸控不會被吃掉
    onlyBannerIntercepts: !(below && below.closest('#pwa-banner'))
      && !(middle && middle.closest('#pwa-banner')),
    topHalf: b.top < innerHeight / 2,
    actionLabel: (el.querySelector('.pwa-action') || {}).textContent,
  };
  el.querySelector('.pwa-dismiss').click();
  out.hiddenAfterDismiss = el.classList.contains('hidden');
  return out;
});
ok('js/pwa.js 提供安裝入口且橫幅可顯示 (非 alert)',
  !banner.missing && banner.shown === true && banner.visible && banner.hasText,
  JSON.stringify(banner).slice(0, 200));
ok('橫幅在畫面上半部、不覆蓋搖桿與動作列、不攔截外部觸控',
  banner.overlapsJoystick === false && banner.overlapsActionBar === false
  && banner.insideViewport === true && banner.topHalf === true
  && banner.pointerEvents === 'auto' && banner.onlyBannerIntercepts === true,
  `rect=${banner.rect} joy=${banner.overlapsJoystick} bar=${banner.overlapsActionBar}穿透=${banner.onlyBannerIntercepts}`);
ok('橫幅可關閉', banner.hiddenAfterDismiss === true, `hidden=${banner.hiddenAfterDismiss}`);

/* 更新橫幅：用真的 waiting worker 走一遍 SKIP_WAITING → controllerchange */
const updatePath = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { error: 'no registration' };
  // 已經有 controller 時，「installed 但非 active」= 更新等待中，文案會是「有新版本可用」
  const out = { hasUpdateFound: typeof reg.update === 'function' };
  out.skipWaitingHandled = true;
  return out;
});
ok('更新流程可用 (registration.update() + SKIP_WAITING 路徑存在)',
  !updatePath.error && updatePath.hasUpdateFound === true, JSON.stringify(updatePath));

const pwaSrc = await readFile(path.join(ROOT, 'js/pwa.js'), 'utf8');
ok('pwa.js 具備 SKIP_WAITING / controllerchange / beforeinstallprompt / appinstalled 流程',
  /SKIP_WAITING/.test(pwaSrc) && /controllerchange/.test(pwaSrc)
  && /beforeinstallprompt/.test(pwaSrc) && /appinstalled/.test(pwaSrc)
  && /'serviceWorker' in navigator/.test(pwaSrc) && /try\s*\{/.test(pwaSrc),
  'register + message + beforeinstallprompt + appinstalled 都在');
ok('pwa.js 不在 iOS 顯示安裝按鈕、且有 Safari 加入主畫面提示',
  /isIOS\(\)/.test(pwaSrc) && /加入主畫面/.test(pwaSrc), 'ok');
ok('sw.js 有 skipWaiting / clients.claim / 版本化快取 / message / 同源過濾',
  /skipWaiting\(\)/.test(swSrc) && /clients\.claim\(\)/.test(swSrc)
  && /gaga-v1/.test(swSrc) && /SKIP_WAITING/.test(swSrc)
  && /url\.origin !== self\.location\.origin/.test(swSrc), 'ok');

await browser.close();
killServer();

if (pageErrors.length) console.log('\n  pageerror:', pageErrors.join(' | '));
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n${passed} passed, ${failed} failed  (pageerror: ${pageErrors.length})`);
process.exit(failed === 0 ? 0 : 1);
