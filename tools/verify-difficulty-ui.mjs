// 難度選擇的可見性與作用驗證。
//
// 為什麼要這支：全域難度選擇上線後，選單夾在關卡清單後面 —— 11 張關卡卡＋特工卡
// 讓開始面板內容高達約 2000px（可見區僅 ~770px），難度選單實際落在 y≈1534，
// 也就是「捲動才看得到」，而且還是白底黑字的原生 select。實測 1280×720、1280×800、
// 390×844 三種視窗都看不到，玩家回報「我看不到難度選擇」。
//
// 這支把「看得見、選得動、真的會影響難度」三件事一起釘住：
//   1. 難度選單與出擊鈕必須在首屏可見範圍內（不需捲動）
//   2. 選項齊全且標示 DNA 倍率；切換後存檔與說明文字同步更新
//   3. 選擇的難度真的進入 game.rules（困難 = 敵人血量 ×1.4）
//
// 用法：
//   npx http-server -p 8899 -s        # 另一個終端機，專案根目錄
//   node tools/verify-difficulty-ui.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright（PW_MODULE 可指向絕對路徑）。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}${detail ? `  [${detail}]` : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ''}`); }
};

const browser = await pw.chromium.launch();
const pageErrors = [];

async function probe(width, height, mobile, label) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  page.on('pageerror', (e) => pageErrors.push(`${label}: ${e.message.split('\n')[0].slice(0, 100)}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.game, undefined, { timeout: 30000 });
  await page.waitForTimeout(600);

  const view = await page.evaluate(() => {
    const sel = document.getElementById('difficulty-select');
    const btn = document.getElementById('btn-start-game');
    const desc = document.getElementById('difficulty-desc');
    const inView = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    return {
      options: sel ? [...sel.options].map((o) => o.textContent.trim()) : [],
      value: sel ? sel.value : null,
      descText: desc ? desc.textContent.trim() : '',
      selectInView: inView(sel),
      startBtnInView: inView(btn),
      selectHeight: sel ? Math.round(sel.getBoundingClientRect().height) : 0,
      dark: sel ? getComputedStyle(sel).backgroundColor : '',
    };
  });

  ok(`${label}：難度選單在首屏可見（不需捲動面板）`, view.selectInView,
    `height=${view.selectHeight}px, bg=${view.dark}`);
  ok(`${label}：出擊鈕也在首屏可見`, view.startBtnInView);
  ok(`${label}：四個難度選項齊全且標示 DNA 倍率`,
    view.options.length === 4 && view.options.every((t) => /DNA ×/.test(t)),
    view.options.join(' / '));
  ok(`${label}：行動版點擊目標 ≥ 44px`, mobile ? view.selectHeight >= 44 : true, `${view.selectHeight}px`);

  // 切成困難：存檔、說明文字、以及實際進入遊戲的規則都要跟著變
  await page.selectOption('#difficulty-select', 'hard');
  await page.waitForTimeout(300);
  const afterSwitch = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('gaga_save'));
    return {
      saved: key ? JSON.parse(localStorage.getItem(key)).difficulty : null,
      value: document.getElementById('difficulty-select').value,
      desc: document.getElementById('difficulty-desc').textContent.trim(),
    };
  });
  ok(`${label}：切換難度會寫入存檔`, afterSwitch.saved === 'hard' && afterSwitch.value === 'hard',
    `saved=${afterSwitch.saved}`);
  const descHp = Number((afterSwitch.desc.match(/敵人血量 ×([\d.]+)/) || [])[1]);
  const descDna = Number((afterSwitch.desc.match(/DNA ×([\d.]+)/) || [])[1]);
  ok(`${label}：說明文字列出實際倍率（且與 DIFFICULTIES 同源）`,
    descHp > 1 && descDna > 1, afterSwitch.desc);

  // 真的開始遊戲，確認難度進入 game.rules
  await page.click('#btn-start-game');
  await page.waitForFunction(() => window.game && window.game.rules && window.game.state !== 'menu', undefined, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  const rules = await page.evaluate(() => ({
    difficultyId: window.game.difficultyId || window.game.difficulty?.name || null,
    enemyHpMul: window.game.rules?.enemyHpMul,
    spawnMul: window.game.rules?.spawnMul,
    damageTakenMul: window.game.rules?.damageTakenMul,
    dnaMult: window.game.difficulty?.dnaMult,
    // 期望值直接取自遊戲資料，不在測試裡寫死數字（平衡調整不該讓測試紅）
    fromConfig: {
      enemyHpMul: window.game.difficulty?.enemyHpMul,
      spawnMul: window.game.difficulty?.spawnMul,
      damageTakenMul: window.game.difficulty?.damageTakenMul,
    },
  }));
  ok(`${label}：選擇的難度真的進入 game.rules（與 DIFFICULTIES 一致）`,
    Math.abs((rules.enemyHpMul || 0) - (rules.fromConfig.enemyHpMul || 0)) < 1e-6
    && Math.abs((rules.spawnMul || 0) - (rules.fromConfig.spawnMul || 0)) < 1e-6,
    JSON.stringify(rules));
  // 「難度提升不夠」的回報：困難必須是真的加壓，不是只調一點點
  ok(`${label}：困難是實質加壓（血量 ≥1.6、受傷 ≥1.4、生成 ≥1.6）`,
    rules.enemyHpMul >= 1.6 && rules.damageTakenMul >= 1.4 && rules.spawnMul >= 1.6,
    `hp=${rules.enemyHpMul} 受傷=${rules.damageTakenMul} 生成=${rules.spawnMul} DNA=${rules.dnaMult}`);
  ok(`${label}：選單說明文字的倍率與實際進入遊戲的規則一致`,
    Math.abs(descHp - rules.enemyHpMul) < 1e-6 && Math.abs(descDna - rules.dnaMult) < 1e-6,
    `說明 hp=${descHp}/DNA=${descDna} vs 實戰 hp=${rules.enemyHpMul}/DNA=${rules.dnaMult}`);

  await page.close();
}

await probe(1280, 720, false, '桌機 1280×720');
await probe(1280, 800, false, '筆電 1280×800');
await probe(390, 844, true, '行動版 390×844');

ok('過程中没有未捕捉的例外', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || '0 筆');

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
