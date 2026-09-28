// 整場效能統計的驗證（六條）：
//
//   1. 載入的版本含這套統計（防止被瀏覽器快取餵到舊模組而驗錯東西）
//   2. 真實遊戲迴圈有在累積（幀數、最差幀、峰值敵人數）
//   3. 峰值敵人數取自迴圈本身，與外部觀察一致
//   4. 結算後存檔有一筆完整紀錄（模式／關卡／時間／最差幀／峰值）
//   5. 只保留 PERF_HISTORY 筆，不會無限膨脹
//   6. 舊存檔（沒有 perfHistory）載入後遊戲仍正常啟動、欄位被補上
//
// 為什麼要這支：「卡頓回報」是目前唯一無法從畫面看出來的品質問題，這套統計是
// 它唯一的客觀線索。它壞掉不會有任何症狀，只會在真的要查的時候才發現存檔是空的。
//
// 用法（一定要用送 no-store 的伺服器，否則瀏覽器會餵舊模組）：
//   python3 tools/dev-server.py 8899
//   PW_MODULE=/path/to/playwright node tools/verify-perfstats.mjs
//
// 離開碼 1 表示有項目失敗。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0].slice(0, 140)));
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game, null, { timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game, null, { timeout: 60000 });

const version = await page.evaluate(async () => {
  const { save, PERF_HISTORY } = await import(new URL('js/save.js', document.baseURI).href);
  return {
    recordPerfRun: typeof save.recordPerfRun,
    hasPerfRun: '_perfRun' in window.game,
    historyIsArray: Array.isArray(save.data.perfHistory),
    cap: PERF_HISTORY,
  };
});
ok('載入的版本含效能統計（避免被瀏覽器快取餵到舊模組）',
  version.recordPerfRun === 'function' && version.hasPerfRun && version.historyIsArray,
  `cap=${version.cap} ${JSON.stringify(version)}`);

// ── 2~4) 真實迴圈累積 + 峰值 + 存檔落地 ──
const live = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  const g = window.game;
  save.data.perfHistory = [];
  save.flush();
  g.ui.startScreen.classList.add('hidden');
  g.modeId = 'defense';
  g.levelId = 'td_fortress';
  g.start(false);
  g.player.invulnerableTimer = 1e9;
  if (g.core) g.core.hp = 1e9;
  // 守塔開場是休息期，先手動開一波，迴圈才看得到敵人
  if (g.td) { g.td.phase = 'break'; g.td.timer = 0; g.td.startWave(true); }

  const t0 = Date.now();
  let observedPeak = 0;
  while (Date.now() - t0 < 9000) {
    await new Promise((r) => setTimeout(r, 120));
    if (g.enemies.length > observedPeak) observedPeak = g.enemies.length;
  }
  const during = {
    frames: g._perfRun.frames,
    peak: g._perfRun.peakEnemies,
    worstMs: g._perfRun.worstMs,
    dpr: g._perfRun.dpr,
  };
  g.handleGameOver(false);
  const hist = save.data.perfHistory;
  return { during, observedPeak, hist, last: hist[hist.length - 1] };
});

ok('真實遊戲迴圈有在累積效能統計（幀數 > 0、最差幀 > 0）',
  live.during.frames > 0 && live.during.worstMs > 0,
  `跑 ${live.during.frames} 幀、最差 ${live.during.worstMs.toFixed(1)}ms、dpr ${live.during.dpr}`);
ok('峰值敵人數取自真實迴圈（與外部觀察一致且 > 0）',
  live.during.peak > 0 && live.during.peak === live.observedPeak,
  `迴圈記錄 ${live.during.peak}、外部觀察 ${live.observedPeak}`);
ok('結算後存檔有一筆完整紀錄（模式／關卡／最差幀／峰值）',
  live.hist.length === 1 && live.last && live.last.mode === 'defense' && live.last.level === 'td_fortress'
  && typeof live.last.worstMs === 'number' && live.last.worstMs > 0 && live.last.peak > 0,
  JSON.stringify(live.last));

// ── 5) 長度上限 ──
const cap = await page.evaluate(async () => {
  const { save, PERF_HISTORY } = await import(new URL('js/save.js', document.baseURI).href);
  const entry = { mode: 'defense', level: 'td_canyon', time: 60, worstMs: 12, worstUpdateMs: 2, worstRenderMs: 10,
    worstAt: 30, worstEnemies: 20, peakEnemies: 25, dpr: 1, cleared: false };
  for (let i = 0; i < 12; i++) save.recordPerfRun(entry);
  return { len: save.data.perfHistory.length, cap: PERF_HISTORY };
});
ok('效能紀錄只保留最近 PERF_HISTORY 筆（不會無限膨脹）',
  cap.len === cap.cap && cap.cap > 0,
  `寫 12 筆後存檔有 ${cap.len} 筆（上限 ${cap.cap}）`);

// ── 6) 舊存檔遷移：獨立 context，模擬真的舊存檔 ──
{
  const legacyCtx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const legacyPage = await legacyCtx.newPage();
  const legacyErrors = [];
  legacyPage.on('pageerror', (e) => legacyErrors.push(e.message.split('\n')[0].slice(0, 120)));
  await legacyPage.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await legacyPage.waitForFunction(() => window.game, null, { timeout: 60000 });
  // 寫一份「沒有 perfHistory、也沒有 codex」的舊存檔，再重新載入
  const wrote = await legacyPage.evaluate(async () => {
    const { save } = await import(new URL('js/save.js', document.baseURI).href);
    const raw = JSON.parse(JSON.stringify(save.data));
    delete raw.perfHistory;
    const key = Object.keys(localStorage).find((k) => k.startsWith('gaga_save')) || 'gaga_save';
    localStorage.setItem(key, JSON.stringify(raw));
    return { key, hasField: 'perfHistory' in raw };
  });
  await legacyPage.reload({ waitUntil: 'domcontentloaded' });
  await legacyPage.waitForFunction(() => window.game, null, { timeout: 60000 });
  const after = await legacyPage.evaluate(async () => {
    const { save } = await import(new URL('js/save.js', document.baseURI).href);
    return { isArray: Array.isArray(save.data.perfHistory), len: save.data.perfHistory.length, state: window.game.state };
  });
  ok('舊存檔（沒有 perfHistory）載入後遊戲照常啟動且欄位被補上',
    wrote.hasField === false && after.isArray && after.len === 0 && legacyErrors.length === 0,
    `key=${wrote.key} → isArray=${after.isArray} len=${after.len} 例外 ${legacyErrors.length}`);
  await legacyCtx.close();
}

await ctx.close();
await browser.close();
ok('驗證期間沒有未捕捉例外', pageErrors.length === 0, pageErrors.length ? pageErrors.join('｜') : '0 筆');

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
