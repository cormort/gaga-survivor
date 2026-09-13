// 端到端驗證「更新提示」：在 /tmp 的複本上把 sw.js 改版 (gaga-v1 → gaga-v2)，
// 看頁面是否跳出「有新版本可用」、按下按鈕是否 SKIP_WAITING → controllerchange → 重載，
// 新版是否真的接手、舊版快取是否被 activate 清掉。
//
//   PW_MODULE=... node /tmp/verify-pwa-update.mjs
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
for (const item of ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js']) {
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

// 改版：換 cache 名稱 (順便驗 activate 會清掉舊快取)。
// 版本號由 sw.js 現場推導（gaga-vN → gaga-vN+1），不寫死 —— 否則 sw.js 自己升版後
// 這裡的 replace 會失效、測試前提消失。
const sw = await readFile(`${COPY}/sw.js`, 'utf8');
const oldVersion = (sw.match(/const CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1];
const newVersion = oldVersion.replace(/(\d+)$/, (d) => String(Number(d) + 1));
if (!oldVersion || newVersion === oldVersion) throw new Error(`無法從 sw.js 推導版本號：${oldVersion}`);
await writeFile(`${COPY}/sw.js`, sw.replace(`'${oldVersion}'`, `'${newVersion}'`));

// 觸發更新檢查，等橫幅出現
const bannerText = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  await reg.update();
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const el = document.getElementById('pwa-banner');
    if (el && !el.classList.contains('hidden') && /新版本/.test(el.textContent)) {
      return { text: el.textContent.replace(/\s+/g, ' ').trim(), action: el.querySelector('.pwa-action').textContent };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
});
ok('偵測到 waiting worker 並顯示「有新版本可用，點此重新載入」',
  !!bannerText && /有新版本可用/.test(bannerText.text) && bannerText.action === '重新載入',
  bannerText ? `"${bannerText.text}" / 按鈕=${bannerText.action}` : '橫幅沒出現');

// 按下按鈕 → SKIP_WAITING → controllerchange → reload
let reloaded = false;
const navPromise = page.waitForNavigation({ timeout: 15000 }).then(() => { reloaded = true; }).catch(() => {});
const bannerClicked = await page.evaluate(() => {
  const btn = document.querySelector('#pwa-banner .pwa-action');
  if (!btn) return false;
  btn.click();
  return true;
});
if (!bannerClicked) console.log('  （橫幅不存在，跳過點擊；上方 FAIL 已記錄原因）');
await navPromise;
ok('按下「重新載入」後頁面真的重載 (controllerchange)', reloaded);

await page.waitForFunction(() => window.game, null, { timeout: 12000 }).catch(() => {});
const after = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const names = await caches.keys();
  return {
    cacheNames: names,
    hasGame: typeof window.game === 'object',
    controller: !!navigator.serviceWorker.controller,
    activeState: reg.active && reg.active.state,
    bannerHidden: (document.getElementById('pwa-banner') || { classList: { contains: () => true } })
      .classList.contains('hidden'),
  };
});
ok(`新版 SW 已接手且舊快取被清掉 (${oldVersion} 消失、${newVersion} 出現)`,
  after.cacheNames.includes(newVersion) && !after.cacheNames.includes(oldVersion),
  after.cacheNames.join(', '));
ok('更新後遊戲照常啟動、橫幅已收起',
  after.hasGame && after.controller && after.activeState === 'activated' && after.bannerHidden,
  `game=${after.hasGame} ctrl=${after.controller} state=${after.activeState} hidden=${after.bannerHidden}`);

await browser.close();
server.kill('SIGKILL');
if (errs.length) console.log('  pageerror:', errs.join(' | '));
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed} passed, ${results.length - passed} failed`);
process.exit(passed === results.length ? 0 : 1);
