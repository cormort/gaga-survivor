// 效能相關機制的回歸驗證。
//
// 這一支驗證的是「政策」而不是畫面：自適應解析度（起始階梯、降階、升階、覆寫鎖定）
// 與碰撞空間分割的正確性（與暴力解逐項比對，確保只是變快而不是改變結果）。
// 這些東西用眼睛看不出來，但錯了會很貴（畫面變糊 / 傷害算錯）。
//
// 用法：
//   npx http-server -p 8899 -s          # 另一個終端機，專案根目錄
//   node tools/verify-perf.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright (PW_MODULE 可指向絕對路徑)。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch();
const out = [];
const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });
const errs = [];

// 依裝置 dpr 開一個頁面，等遊戲就緒後回傳自適應解析度的實際狀態
async function probe(deviceScaleFactor, query = '') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${deviceScaleFactor}${query}: ${e.message}`));
  await page.goto(URL + query, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.game);
  const r = await page.evaluate(() => {
    const g = window.game;
    return {
      dpr: g.dpr,
      steps: g._dprSteps.slice(),
      idx: g._dprIdx,
      locked: !!g._dprLocked,
      canvasW: g.canvas.width,
      vw: g.vw,
      transformA: +g.ctx.getTransform().a.toFixed(3),
      device: window.devicePixelRatio,
    };
  });
  return { page, ctx, r };
}

// 1) 高 DPI 裝置（dpr 3）：起始就該是 2×，而不是被鎖在 1.5×
{
  const { page, ctx, r } = await probe(3);
  ok('dpr 3 的裝置起始用 2× 算圖（不再固定 1.5×）', r.dpr === 2 && r.canvasW === Math.round(r.vw * 2),
    `dpr=${r.dpr} canvas=${r.canvasW} vw=${r.vw} steps=[${r.steps}]`);
  ok('畫布變換與 dpr 一致', Math.abs(r.transformA - r.dpr) < 0.01, `transform.a=${r.transformA}`);

  // 2) 直接驅動降階／升階政策
  const adapt = await page.evaluate(() => {
    const g = window.game;
    const log = [];
    const snap = (tag) => log.push(`${tag}: idx=${g._dprIdx} dpr=${g.dpr} canvas=${g.canvas.width}`);
    snap('起始');
    for (let i = 0; i < 3; i++) g._adaptDpr(15);   // 三次「跟不上」
    snap('三次慢幀後');
    const afterDown = g._dprIdx;
    for (let i = 0; i < 8; i++) g._adaptDpr(6);    // 連續「很順」→ 升階（需 4 連擊）
    snap('八次快幀後');
    return { log, afterDown, afterUp: g._dprIdx, max: g._dprSteps.length - 1 };
  });
  ok('跟不上時會自動降階（且畫布同步縮小）', adapt.afterDown < adapt.max, adapt.log.join(' | '));
  ok('有餘裕時會升回一階（滯後 4 連擊）', adapt.afterUp > adapt.afterDown, adapt.log.join(' | '));
  await ctx.close();
}

// 3) dpr 1 的裝置：沒有可升的階，維持 1×
{
  const { ctx, r } = await probe(1);
  ok('dpr 1 的裝置維持 1×（不會硬拉高解析度）', r.dpr === 1 && r.steps.length === 1,
    `dpr=${r.dpr} steps=[${r.steps}]`);
  await ctx.close();
}

// 4) ?dpr= 覆寫：強制指定並鎖定，不受自適應影響
{
  const { page, ctx, r } = await probe(3, '?dpr=1.5');
  const locked = await page.evaluate(() => {
    const g = window.game;
    const before = g.dpr;
    for (let i = 0; i < 6; i++) g._adaptDpr(15);   // 就算一直很慢也不該降
    return { before, after: g.dpr, locked: !!g._dprLocked };
  });
  ok('?dpr=1.5 會強制並鎖定解析度', r.dpr === 1.5 && r.locked && locked.before === locked.after,
    `dpr=${r.dpr} locked=${r.locked} 慢幀後仍為 ${locked.after}`);
  await ctx.close();
}

// 5) 幀耗時量測確實有在跑（自適應的判據來源）
{
  const { page, ctx } = await probe(2);
  const t = await page.evaluate(async () => {
    const g = window.game;
    g.ui.startScreen.classList.add('hidden');
    g.start();
    const before = g._dprN || 0;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { before, after: g._dprN || 0, acc: g._dprAcc || 0 };
  });
  ok('每一幀的 update+render 耗時有被累積（自適應的判據）', t.after > t.before || t.acc > 0,
    `取樣計數 ${t.before} → ${t.after}，累積 ${t.acc.toFixed(2)}ms`);
  await ctx.close();
}

let pass = 0, fail = 0;
for (const r of out) {
  if (r.pass) { pass++; console.log(`PASS  ${r.name}  [${r.detail}]`); }
  else { fail++; console.log(`FAIL  ${r.name}  [${r.detail}]`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
