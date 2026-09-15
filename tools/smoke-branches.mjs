// 罕見分支煙霧測試。
//
// 這個專案已經連續出現三個同型 bug，全都是「平常跑不到的分支裡有筆誤的方法名」：
//   曼納稜晶  weaponManager.cooldowns.clear()  → cooldowns 不存在
//   結算成就  save.save()                      → 方法叫 flush()
//   精英獵殺  enemy.applyAffix()               → 方法叫 makeElite()
//
// 這類錯誤語法檢查抓不到、正常遊玩也很久才踩到一次，但踩到就是整局凍結。
// 本測試把每個 switch 的每個 case 都實際觸發一次，任何拋例外都會列出來。
//
// 用法：
//   npx http-server -p 8899 -s
//   node tools/smoke-branches.mjs
//
// 離開碼 1 表示有分支拋例外，可直接接 CI。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;

const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
await page.goto(URL);
await page.waitForFunction(() => window.game);

const results = await page.evaluate(async () => {
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  g.start();
  for (let i = 0; i < 40 && !g.enemies.length; i++) await new Promise((r) => setTimeout(r, 200));

  // 匯入路徑一律用 new URL(…, document.baseURI)：本機是 "/"、GitHub Pages 是
  // "/gaga-survivor/"（寫死絕對路徑在線上會 404）
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const cfg = await imp('js/config.js');
  const out = [];
  const run = (群組, 名稱, fn) => {
    try {
      fn();
      out.push({ 群組, 名稱, 結果: 'ok' });
    } catch (e) {
      out.push({ 群組, 名稱, 結果: 'FAIL', 訊息: e.message,
                 位置: String(e.stack || '').split('\n')[1]?.trim() || '' });
    }
  };

  // 每個分支都在乾淨狀態下跑，避免前一個把狀態機推到彈窗而影響後面
  const reset = () => { if (g.state !== 'PLAYING') g.state = 'PLAYING'; g.player.isDead = false; };

  // 1. 消耗品
  for (const id of Object.keys(cfg.CONSUMABLE_ITEMS)) {
    run('消耗品', id, () => { reset(); g.activateConsumable(id); });
  }

  // 2. 里程碑獎勵（grantMilestone 已搬到 systems/Progression.js，直接呼叫實作）
  const { grantMilestone, triggerMiniEvent, endMiniEvent } = await imp('js/systems/Progression.js');
  const merchantFx = await imp('js/systems/Merchant.js');   // 商人已搬到 systems/Merchant.js
  const { buyMerchantItem } = merchantFx;
  for (const tag of ['magnet', 'gold', 'heal', 'bomb', 'resupply']) {
    run('里程碑', tag, () => { reset(); grantMilestone(g, tag, '煙霧測試'); });
  }

  // 3. 局內事件：直接指定 evt，走完整觸發邏輯
  const origRandom = Math.random;
  for (let i = 0; i < cfg.MINI_EVENTS.length; i++) {
    const evt = cfg.MINI_EVENTS[i];
    run('局內事件', evt.id, () => {
      reset();
      Math.random = () => i / cfg.MINI_EVENTS.length + 1e-6;   // 釘住抽選結果
      try { triggerMiniEvent(g); } finally { Math.random = origRandom; }
      endMiniEvent(g);
    });
  }

  // 4. 商人商品
  for (const item of cfg.MERCHANT_ITEMS) {
    run('商人', item.id, () => { reset(); g.gold = 99999; buyMerchantItem(g, item); });
  }

  // 4b. 商人的「出現 → 靠近開面板 → 離場」整條路徑。
  // 為什麼補這組：線上事故（2026-09-15）—— `spawnMerchant` 用了 MERCHANT_ITEMS 卻沒 import，
  // 玩家在第 2.5 分鐘（_merchantTimer = 150）畫面直接停止更新。上面的「商人商品」只測了
  // **買**，所以 51 個分支全綠卻攔不到：這是唯一會用到 MERCHANT_ITEMS 的地方。
  const { spawnMerchant, updateMerchant, dismissMerchant, openMerchantPanel, closeMerchantPanel, checkMerchantSchedule } = merchantFx;
  run('流浪商人', '出現（spawnMerchant 洗出 3 件商品）', () => {
    reset();
    spawnMerchant(g);
    if (!g.merchant) throw new Error('商人沒有生成');
    if (!Array.isArray(g.merchant.items) || g.merchant.items.length !== 3) {
      throw new Error(`商品數不對：${g.merchant.items && g.merchant.items.length}`);
    }
  });
  run('流浪商人', '排程到點就出現（checkMerchantSchedule 越過 150 秒）', () => {
    reset();
    g.merchant = null;
    g._merchantTimer = 0.01;
    checkMerchantSchedule(g, 0.05);
    if (!g.merchant) throw new Error('排程沒有觸發商人');
  });
  run('流浪商人', '靠近自動開面板 / 走遠自動關', () => {
    reset();
    g.merchant = null;
    spawnMerchant(g);
    g.player.x = g.merchant.x;
    g.player.y = g.merchant.y;
    updateMerchant(g, 0.016);
    if (!g.merchant.panelOpen) throw new Error('靠近沒有開面板');
    g.player.x = g.merchant.x + 9999;
    updateMerchant(g, 0.016);
    if (g.merchant.panelOpen) throw new Error('走遠沒有關面板');
  });
  run('流浪商人', '停留倒數結束就離場（updateMerchant）', () => {
    reset();
    g.merchant = null;
    spawnMerchant(g);
    g.merchant.timer = 0.01;
    updateMerchant(g, 0.05);
    if (g.merchant) throw new Error('時間到沒有離場');
  });
  run('流浪商人', '主動離場（dismissMerchant）', () => {
    reset();
    g.merchant = null;
    spawnMerchant(g);
    openMerchantPanel(g);
    dismissMerchant(g);
    if (g.merchant) throw new Error('沒有清掉商人');
    reset();
  });

  // 5. 特殊升級卡
  // 注意：applySpecialCard 依 card.specialId 分派，而 SPECIAL_CARDS 的欄位叫 id。
  // 直接把原始表丟進去，每個 case 都不匹配 —— 這組會「全部通過」但什麼都沒觸發
  // (曼納稜晶那類筆誤就是這樣躲過測試的)。這裡照真實升級流程的形狀組裝。
  for (const card of cfg.SPECIAL_CARDS) {
    run('特殊卡', card.id, () => {
      reset();
      g.applySpecialCard({ type: 'special', specialId: card.id, name: card.name, icon: card.icon });
    });
  }

  // 6. Boss 技能
  const boss = g.enemies[0];
  for (const act of ['nova', 'summon', 'charge', 'vortex']) {
    run('Boss技能', act, () => { reset(); g.handleBossSkill(boss, act); });
  }

  // 7. 祝福
  for (const b of (cfg.BLESSINGS || [])) {
    run('祝福', b.id, () => { reset(); g.applyBlessing?.(b); });
  }

  // 9. 結算 (兩條路徑都要，成就解鎖分支只在其中一條)
  for (const victory of [false, true]) {
    run('結算', victory ? '通關' : '戰死', () => {
      reset();
      g.kills = 5000; g.gold = 99999; g.gameTime = 600;
      g.handleGameOver(victory);
    });
  }

  return out;
});

await browser.close();

const fails = results.filter((r) => r.結果 === 'FAIL');
console.table(results);
if (fails.length) {
  console.error(`\n✖ ${fails.length} 個分支拋例外：`);
  for (const f of fails) console.error(`  [${f.群組}] ${f.名稱}: ${f.訊息}\n      ${f.位置}`);
  process.exit(1);
}
console.log(`\n✅ ${results.length} 個分支全部通過`);
