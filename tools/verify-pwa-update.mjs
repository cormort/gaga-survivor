// 端到端驗證「已安裝的 PWA 改版後會拿到新版」。
//
// 起因（真實回報）：難度選擇上線後 **網頁版看得到、PWA 版看不到**。
// 原因是 sw.js 對導覽請求採「快取優先」，改版後已安裝的 App 第一次開啟仍是舊版
// HTML/CSS（背景才偷偷換快取），而 sw.js 位元組沒變 → 沒有 updatefound → 也沒有提示。
//
// 這支在 /tmp 的複本上模擬一次發版（version.json 4 → 5，並在 HTML 塞一個 marker），
// 依序驗證：
//   1. 改版後「下一次開啟」就拿到新 HTML（導覽網路優先，不必等第二次）
//   2. 註冊網址帶版本 → SW 換版、舊快取被清掉、新版接手
//   3. 換版過程會提示「有新版本可用」，按下去會重載
//
//   PW_MODULE=... node tools/verify-pwa-update.mjs
import { spawn } from 'node:child_process';
import { cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const SRC = process.cwd();
const COPY = '/tmp/gaga-pwa-copy';
const PORT = Number(process.env.PWA_PORT_2 || 8902);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

await rm(COPY, { recursive: true, force: true });
await mkdir(COPY, { recursive: true });
for (const item of ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js', 'version.json']) {
  await cp(`${SRC}/${item}`, `${COPY}/${item}`, { recursive: true });
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: COPY, stdio: 'ignore' });
const up = async () => {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/index.html`)).status === 200) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};
if (!await up()) { console.log('伺服器沒起來'); server.kill('SIGKILL'); process.exit(1); }

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'load' });
ok('第一版 SW 已接手', await page.evaluate(() => !!navigator.serviceWorker.controller));

const before = await page.evaluate(async () => ({
  cacheNames: (await caches.keys()),
  version: (await fetch('version.json', { cache: 'no-store' })).json ? await (await fetch('version.json', { cache: 'no-store' })).json().then((j) => j.version) : null,
  marker: !!document.querySelector('meta[name="shell-marker"]'),
  difficultyVisible: (() => {
    const sel = document.getElementById('difficulty-select');
    if (!sel) return false;
    const r = sel.getBoundingClientRect();
    return r.width > 0 && r.bottom <= window.innerHeight;
  })(),
}));
ok('改版前：版本與快取名一致、且難度選擇可見（現行介面）',
  before.cacheNames.includes(`gaga-v${before.version}`) && before.difficultyVisible,
  `cache=${before.cacheNames.join(',')} version=${before.version} 難度可見=${before.difficultyVisible}`);

// ── 模擬發版：version.json 4 → 5，並在 HTML 塞 marker（代表「新介面」）──
const newVersion = String(Number(before.version) + 1);
await writeFile(`${COPY}/version.json`, JSON.stringify({
  version: newVersion,
  releasedAt: new Date().toISOString().slice(0, 10),
  note: 'verify-pwa-update 的模擬發版',
}, null, 2) + '\n');
const html = await readFile(`${COPY}/index.html`, 'utf8');
await writeFile(`${COPY}/index.html`,
  html.replace('</head>', `  <meta name="shell-marker" content="v${newVersion}">\n</head>`));

// ── 1) 已安裝的 App 下一次開啟就該拿到新版 HTML ──
await page.reload({ waitUntil: 'load' });
const afterReload = await page.evaluate(() => ({
  marker: document.querySelector('meta[name="shell-marker"]')?.content || null,
  controlled: !!navigator.serviceWorker.controller,
}));
ok(`改版後「下一次開啟」就拿到新版 HTML（不等第二次）`,
  afterReload.marker === `v${newVersion}` && afterReload.controlled,
  `marker=${afterReload.marker} ctrl=${afterReload.controlled}`);

// ── 2) 註冊網址帶版本 → SW 換版、舊快取清掉 ──
let updated = null;
for (let i = 0; i < 60; i++) {
  updated = await page.evaluate(async () => {
    const names = await caches.keys();
    const reg = await navigator.serviceWorker.getRegistration();
    return { names, active: reg?.active?.scriptURL || null, state: reg?.active?.state || null };
  });
  if (updated.names.includes(`gaga-v${newVersion}`) && !updated.names.includes(`gaga-v${before.version}`)) break;
  await page.waitForTimeout(500);
}
ok(`新版 SW 接手且舊快取被清掉（gaga-v${before.version} 消失、gaga-v${newVersion} 出現）`,
  updated.names.includes(`gaga-v${newVersion}`) && !updated.names.includes(`gaga-v${before.version}`),
  updated.names.join(', '));

// ── 3) 更新提示與重新載入 ──
const bannerText = await page.evaluate(async () => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const el = document.getElementById('pwa-banner');
    if (el && !el.classList.contains('hidden') && /新版本/.test(el.textContent)) {
      return { text: el.textContent.replace(/\s+/g, ' ').trim(), action: el.querySelector('.pwa-action')?.textContent || '' };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
});
ok('換版過程有提示「有新版本可用」（updatefound 或 SW_UPDATED 廣播）',
  !!bannerText && /有新版本可用/.test(bannerText.text) && bannerText.action === '重新載入',
  bannerText ? `"${bannerText.text}" / 按鈕=${bannerText.action}` : '橫幅沒出現');

if (bannerText) {
  let reloaded = false;
  const nav = page.waitForNavigation({ timeout: 15000 }).then(() => { reloaded = true; }).catch(() => {});
  await page.evaluate(() => { document.querySelector('#pwa-banner .pwa-action')?.click(); });
  await nav;
  ok('按下「重新載入」後頁面真的重載', reloaded);
}

await page.waitForFunction(() => window.game, null, { timeout: 15000 }).catch(() => {});
const final = await page.evaluate(() => ({
  hasGame: typeof window.game === 'object',
  marker: document.querySelector('meta[name="shell-marker"]')?.content || null,
  difficultyVisible: (() => {
    const sel = document.getElementById('difficulty-select');
    if (!sel) return false;
    const r = sel.getBoundingClientRect();
    return r.width > 0 && r.bottom <= window.innerHeight;
  })(),
}));
ok('更新後遊戲照常啟動、新版介面（含難度選擇）在畫面上',
  final.hasGame && final.marker === `v${newVersion}` && final.difficultyVisible,
  JSON.stringify(final));

await browser.close();
server.kill('SIGKILL');
if (errs.length) console.log('  pageerror:', errs.join(' | '));
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed} passed, ${results.length - passed} failed`);
process.exit(passed === results.length ? 0 : 1);
