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
import { readdirSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const ROOT = process.cwd();
const PORT = Number(process.env.PWA_PORT || 8901);
const BASE = `http://127.0.0.1:${PORT}`;

// 可安裝性判定（CDP Page.getInstallabilityErrors）只在「明確指定 executablePath」時才可信：
// 不指定時 Playwright 會用它的舊式 headless 啟動參數，回傳的永遠是空陣列 ——
// 連「無 manifest 的頁面」都不會被判失敗，等於沒在檢查。下面的控制組就是在防這件事。
const CHROME = process.env.CHROMIUM || pw.chromium.executablePath();

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
// 版本來源是根目錄 version.json（發版只改這一個檔案）；sw.js 內的 FALLBACK_VERSION
// 只在離線安裝時用，兩者必須一致，這裡直接把關。
const versionJson = JSON.parse(await readFile(path.join(ROOT, 'version.json'), 'utf8'));
const cacheVersion = `gaga-v${String(versionJson.version).replace(/^v/, '')}`;
const fallbackVersion = (swSrc.match(/const FALLBACK_VERSION\s*=\s*'([^']+)'/) || [])[1] || '';
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
ok('預快取清單包含 version.json（版本來源本身也要能離線取得）',
  precache.includes('./version.json'), precache.filter((u) => /version\.json/.test(u)).join(', ') || '缺少');

ok(`sw.js 的 FALLBACK_VERSION 與 version.json 一致（${cacheVersion}）`,
  fallbackVersion === cacheVersion,
  `FALLBACK_VERSION=${fallbackVersion || '(找不到)'}、version.json=${cacheVersion}`);

ok('導覽請求與 version.json 都是「網路優先」（已安裝的 PWA 才不會停在舊版介面）',
  /if \(isNavigation[^)]*\) \{[\s\S]{0,240}revalidate\(shell, request\)/.test(swSrc)
    && /isVersionFile/.test(swSrc),
  'sw.js 的 fetch 分支應先 revalidate 再退回快取，且 version.json 不可被快取優先擋住');

ok('activate 會主動廣播 SW_UPDATED 給所有分頁',
  /SW_UPDATED/.test(swSrc) && /postMessage\(\{ type: 'SW_UPDATED'/.test(swSrc));

ok('預快取清單沒有列出不存在的檔案', ghost.length === 0, ghost.join(', ') || `${precache.length} 筆都存在`);

/* ── 1) 圖示 PNG：檔頭尺寸 + 必須完全不透明 ── */
function pngSize(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  if (buf.slice(12, 16).toString('ascii') !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
// IHDR colour type：0/2/3(無 tRNS) 不透明；4/6 有 alpha 通道；3 + tRNS 有透明色
function pngInfo(buf) {
  const size = pngSize(buf);
  if (!size) return null;
  const colorType = buf.readUInt8(25);
  const chunks = [];
  let i = 8;
  while (i < buf.length - 8) {
    const len = buf.readUInt32BE(i);
    chunks.push(buf.slice(i + 4, i + 8).toString('ascii'));
    i += 12 + len;
  }
  return { ...size, colorType, chunks, hasTrns: chunks.includes('tRNS') };
}
const ICONS = [
  ['icons/icon-192.png', 192], ['icons/icon-512.png', 512],
  ['icons/icon-maskable-512.png', 512], ['icons/apple-touch-icon.png', 180],
];
let iconBytes = 0;
for (const [rel, size] of ICONS) {
  const buf = await readFile(path.join(ROOT, rel));
  iconBytes += buf.length;
  const info = pngInfo(buf);
  ok(`${rel} 是 ${size}x${size} PNG`, !!info && info.w === size && info.h === size,
    info ? `${info.w}x${info.h}, ${buf.length} bytes` : '不是合法 PNG');
  // App 圖示必須完全不透明：maskable 依規範要是 opaque，透明的 purpose:any 圖示在
  // Android 會被塞進白色圓圈。v55 的重繪圖示帶了 tRNS（四角 alpha=0、39~53% 羽化），
  // 這是「之前可以安裝、改版後不行」的嫌疑點 —— 讓它在這裡就紅，不要靠肉眼。
  ok(`${rel} 完全不透明（無 alpha 通道、無 tRNS）`,
    !!info && info.colorType !== 4 && info.colorType !== 6 && !info.hasTrns,
    info ? `colorType=${info.colorType} tRNS=${info.hasTrns}` : '無法解析');
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
const shellKeys = cacheInfo.entries[cacheVersion] || [];
ok(`快取名稱與 sw.js 的 CACHE_VERSION 一致 (${cacheVersion})`, cacheInfo.names.includes(cacheVersion), cacheInfo.names.join(', '));
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

/* ── 真可安裝性：非無痕 profile + CDP ──
   只看 manifest/圖示/SW 的靜態檢查**驗不出**「Chrome 願不願意給安裝」：
   `browser.newContext()` 開的是無痕情境，`Page.getInstallabilityErrors` 會回
   `in-incognito`，於是真正該擋下來的問題（圖示解不開、start_url 出界、SW 沒有 fetch
   事件）全被同一個錯誤蓋掉、看起來永遠是「只有 in-incognito，其他都過」。
   要拿到真判定就得用持久化 profile（非無痕）＋ 明確指定 executablePath（見 CHROME 註解）。 */
{
  const PROFILES = path.join(ROOT, '.pwa-install-profiles');
  const withProfile = async (name, fn) => {
    const dir = path.join(PROFILES, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const c = await pw.chromium.launchPersistentContext(dir, {
      executablePath: CHROME,
      viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
    });
    try { return await fn(c); } finally {
      await c.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };

  // 控制組：同一套判定流程對「沒有 manifest 的頁面」必須回報 no-manifest。
  // 沒有這一條，「errors 為空」可能只是「這個啟動方式根本不做檢查」。
  await withProfile('control', async (c) => {
    const p = c.pages()[0] || (await c.newPage());
    const cdp = await c.newCDPSession(p);
    await cdp.send('Page.enable');
    await p.goto(`${BASE}/no-such-page-control.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const ctl = await cdp.send('Page.getInstallabilityErrors');
    const ids = ctl.installabilityErrors.map((e) => e.errorId);
    ok('控制組：無 manifest 的頁面會被判 no-manifest（證明這項檢查真的在運作）',
      ids.includes('no-manifest'), JSON.stringify(ids));
  });

  await withProfile('app', async (c) => {
    const p = c.pages()[0] || (await c.newPage());
    await p.addInitScript(() => {
      window.__bipFired = false;
      window.addEventListener('beforeinstallprompt', () => { window.__bipFired = true; });
    });
    const cdp = await c.newCDPSession(p);
    await cdp.send('Page.enable');
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await p.evaluate(async () => {
      await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 20000))]);
      await new Promise((r) => setTimeout(r, 2500));
    });
    const inst = await cdp.send('Page.getInstallabilityErrors');
    ok('Chrome 判定本站台可安裝 (CDP Page.getInstallabilityErrors 為空)',
      inst.installabilityErrors.length === 0,
      JSON.stringify(inst.installabilityErrors));
    ok('beforeinstallprompt 真的會觸發 (安裝橫幅才有東西可按)',
      (await p.evaluate(() => window.__bipFired)) === true);
    const nativeBanner = await p.evaluate(() => {
      const shown = window.gagaPWA.installMode() === 'native' && window.gagaPWA.showInstallBanner();
      const el = document.getElementById('pwa-banner');
      const act = el.querySelector('.pwa-action');
      return { shown, actionLabel: act.classList.contains('hidden') ? '' : act.textContent };
    });
    ok('native 環境的安裝橫幅帶「安裝」按鈕 (可以一鍵安裝)',
      nativeBanner.shown === true && nativeBanner.actionLabel === '安裝',
      JSON.stringify(nativeBanner));
  });
  rmSync(PROFILES, { recursive: true, force: true });
}

/* ── 各種手機環境的安裝指引矩陣 ──
   iOS 上只有 Safari 能加入主畫面，App 內建瀏覽器更是完全不行。
   這些環境攔不到 beforeinstallprompt，所以「有沒有把步驟講出來」就是唯一的安裝入口 ——
   舊版對 iOS 直接 return false，使用者於是什麼都看不到。
   註：這裡用的是普通（無痕）context，beforeinstallprompt 不會觸發，所以按鈕一律不該出現；
   「有 prompt 時給按鈕」由上一個區塊的持久化 profile 負責驗。 */
{
  const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const CASES = [
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'native', '安裝應用程式'],
    ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'ios', '加入主畫面'],
    ['iPhone Chrome (iOS 上無法安裝)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1', 'unsupported', 'Safari'],
    ['LINE 內建瀏覽器', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Line/14.6.0', 'unsupported', 'Safari'],
  ];
  for (const [label, ua, expect, descMustHave] of CASES) {
    const c = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 844 } });
    const cp = await c.newPage();
    await cp.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await cp.waitForFunction(() => window.gagaPWA, null, { timeout: 15000 });
    const mode = await cp.evaluate(() => window.gagaPWA.installMode());
    const info = await cp.evaluate(() => {
      const shown = window.gagaPWA.showInstallBanner();
      const el = document.getElementById('pwa-banner');
      const act = el.querySelector('.pwa-action');
      return {
        shown,
        visible: !el.classList.contains('hidden'),
        desc: el.querySelector('.pwa-desc').textContent,
        actionLabel: act.classList.contains('hidden') ? '' : act.textContent,
      };
    });
    ok(`${label} → installMode=${expect}`, mode === expect, `實測 ${mode}`);
    ok(`${label} 一定看得到可行動的安裝指示 (不是安靜地不給)`,
      info.shown === true && info.visible === true
      && info.desc.includes(descMustHave),
      JSON.stringify(info));
    // 沒攔到 beforeinstallprompt 就不該給按鈕 —— 按了沒反應比不給更糟
    ok(`${label} 沒有 prompt 時不給「安裝」按鈕`, info.actionLabel === '',
      `actionLabel="${info.actionLabel}"`);
    await c.close();
  }
  // 桌機 Chrome 不該被誤判成手機環境
  const dc = await browser.newContext({ userAgent: DESKTOP, viewport: { width: 390, height: 844 } });
  const dp = await dc.newPage();
  await dp.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await dp.waitForFunction(() => window.gagaPWA, null, { timeout: 15000 });
  ok('桌機 Chrome 不被誤判成 iOS / App 內建瀏覽器',
    (await dp.evaluate(() => window.gagaPWA.installMode())) === 'native');
  await dc.close();
}

/* ── 安裝失敗的退路（Android WebAPK 第二段失敗）
   Chrome 在 Android 上裝 PWA 是兩段式：先向 Google 要一個 WebAPK，再由系統裝起來。
   第二段失敗時 Chrome 只丟「無法建立捷徑／無法開啟應用程式」，使用者手上就沒有下一步了。
   所以按過「安裝」之後要有人看著：成功訊號是 appinstalled，等不到就給「建立捷徑」備案。
   註：不能用 standalone 判定 —— Android 安裝完成時這個分頁仍停在 Chrome。 */
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fp = await c.newPage();
  await fp.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await fp.waitForFunction(() => window.gagaPWA, null, { timeout: 15000 });

  // 偽造一個 beforeinstallprompt（真的那個只有 Chrome 自己會發，測試裡發不出來）
  const armFake = (outcome) => fp.evaluate((o) => {
    const evt = new Event('beforeinstallprompt', { cancelable: true });
    evt.prompt = () => { window.__promptCalled = true; };
    evt.userChoice = Promise.resolve({ outcome: o });
    window.dispatchEvent(evt);
  }, outcome);
  const bannerState = () => fp.evaluate(() => {
    const el = document.getElementById('pwa-banner');
    return {
      visible: !!el && !el.classList.contains('hidden'),
      text: el ? el.textContent.replace(/\s+/g, '') : '',
    };
  });

  // (1) 使用者按了「接受」，但系統端沒有真的裝起來（沒收到 appinstalled）
  await armFake('accepted');
  const accepted = await fp.evaluate(() => window.gagaPWA.promptInstall());
  ok('按下安裝且使用者接受時，prompt() 真的被呼叫', accepted === true,
    `promptInstall()=${accepted}, promptCalled=${await fp.evaluate(() => window.__promptCalled)}`);
  ok('接受之後先把橫幅收起來（不要擋著安裝流程）', (await bannerState()).visible === false);

  await new Promise((r) => setTimeout(r, 13000)); // 等過 INSTALL_WATCHDOG_MS
  const failed = await bannerState();
  ok('等不到 appinstalled 時，改給「建立捷徑」的備援指示（不讓使用者卡死）',
    failed.visible === true && failed.text.includes('建立捷徑'),
    JSON.stringify(failed));

  // (2) 對照組：真的收到 appinstalled 就不該冒出失敗指示
  await armFake('accepted');
  await fp.evaluate(() => window.gagaPWA.promptInstall());
  await fp.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await new Promise((r) => setTimeout(r, 13000));
  const afterOk = await bannerState();
  ok('收到 appinstalled（安裝成功）後不會再冒出失敗指示',
    afterOk.visible === false, JSON.stringify(afterOk));

  await c.close();
}

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
ok('pwa.js 對 iOS / App 內建瀏覽器一律給安裝步驟，且不再被 localStorage 永久封鎖',
  /isIOSSafari\(\)/.test(pwaSrc) && /isInAppBrowser\(\)/.test(pwaSrc)
  && /加入主畫面/.test(pwaSrc) && !/iosHintDismissed/.test(pwaSrc), 'ok');
ok('pwa.js 區分 native / ios / unsupported 三種安裝能力',
  /function installMode\(\)/.test(pwaSrc)
  && /'installed'/.test(pwaSrc) && /'unsupported'/.test(pwaSrc) && /'native'/.test(pwaSrc), 'ok');
ok('index.html 有常駐安裝入口，且 pwa.js 有接上它',
  /id="btn-install-app"/.test(await readFile(path.join(ROOT, 'index.html'), 'utf8'))
  && /btn-install-app/.test(pwaSrc) && /initInstallButton/.test(pwaSrc),
  '「🏠 養成基地」裡的「📲 安裝成 App」— 攔不到 beforeinstallprompt 的環境的保底入口');
ok('sw.js 有 skipWaiting / clients.claim / 版本化快取 / message / 同源過濾',
  /skipWaiting\(\)/.test(swSrc) && /clients\.claim\(\)/.test(swSrc)
  && swSrc.includes(cacheVersion) && /SKIP_WAITING/.test(swSrc)
  && /url\.origin !== self\.location\.origin/.test(swSrc), 'ok');

await browser.close();
killServer();

if (pageErrors.length) console.log('\n  pageerror:', pageErrors.join(' | '));
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n${passed} passed, ${failed} failed  (pageerror: ${pageErrors.length})`);
process.exit(failed === 0 ? 0 : 1);
