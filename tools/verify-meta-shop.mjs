// 基因強化（局外天賦）與特工黑市（箱子 / 戰術興奮劑）的門檻驗證。
//
// 為什麼要這支：這兩塊是「局外養成」，壞掉的時候遊戲照樣跑得動 —— 不會拋例外，
// 只是玩家感覺不到。實測抓到的三個問題就是這樣活了下來的：
//   1. 天賦樹 5 級 × 5 條 = 750 🧬 全滿，而一場 6~10 分鐘的局就有 150~250 🧬
//      → 大約 4 場畢業，長期目標不存在。
//   2. 黑市箱子 `rollItem({ rarity })` 沒帶 ilvl → **永遠 ilvl 1**，而局內掉落後期到 2.75。
//      實測傳奇詞條總和 ilvl 1 = 7.13、ilvl 2.75 = 15.22：1600 🪙 + 320 🧬 的傳奇箱
//      開出來的東西比路上免費掉的還弱一半。
//   3. 興奮劑每點 DNA 買到的效果只有永久天賦的 1/3（迅捷 +15%/15🧬 vs 疾走引擎
//      +5%/10🧬 且永久）→ 同一筆 DNA 買永久天賦兩場後就完全超車，消耗品是陷阱選項。
//
// 用法：
//   npx http-server -p 8899 -s        # 另一個終端機，專案根目錄
//   node tools/verify-meta-shop.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright（PW_MODULE 可指向絕對路徑）。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

const results = await page.evaluate(async () => {
  // 匯入路徑一律用 new URL(…, document.baseURI)：本機是 "/"、GitHub Pages 是
  // "/gaga-survivor/"，寫死絕對路徑在線上會 404（實測踩過）。
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });

  const meta = await imp('js/meta.js');
  const shop = await imp('js/shop.js');
  const items = await imp('js/items.js');
  const { save } = await imp('js/save.js');
  const { LEVELS } = await imp('js/levels.js');
  const g = window.game;

  // 這幾支是本次新增的 API。舊版沒有它們 —— 缺了要明確 FAIL，而不是讓整支工具
  // 丟 TypeError 中斷（六組要能一次跑完，才知道壞了幾組）。
  const HAS = {
    tree: typeof meta.talentTreeCost === 'function' && typeof meta.talentInvested === 'function'
      && typeof meta.talentValueAt === 'function',
    shopLvl: typeof shop.shopItemLevel === 'function',
    stack: typeof save.boosterCount === 'function' && typeof shop.MAX_BOOSTER_STACK === 'number',
    effect: Object.values(shop.SHOP_BOOSTERS).every((b) => !!b.effect),
  };
  const MISSING = '舊版沒有這支 API（本次新增）';

  // ── 1) 天賦樹：深度、成本曲線 ──────────────────────────────────────────
  const tree = meta.TALENT_ORDER.map((id) => meta.TALENTS[id]);
  const shapeBad = tree.filter((d) => d.costs.length !== d.maxLevel ||
    d.costs.some((c, i) => i > 0 && c <= d.costs[i - 1]));
  ok('[天賦] 每條的成本表長度 = 等級上限，且成本嚴格遞增（最後一級最貴）',
    shapeBad.length === 0,
    shapeBad.length ? shapeBad.map((d) => `${d.id}:${d.costs.length}/${d.maxLevel}`).join('｜')
      : tree.map((d) => `${d.id} ${d.costs[0]}→${d.costs[d.costs.length - 1]}`).join('、'));

  // 「一場的 DNA」用 save.recordRun 的公式與一個標準局側寫推算（實測錨點：87 秒 / 100 擊殺 /
  // 等級 5 → 24 🧬，見 PR 說明；這裡外推到 8 分鐘 / 1200 擊殺 / 等級 25 / 通關）。
  const stdRun = Math.round((480 / 10 + 1200 / 20 + 25 * 2) * 1.5);
  if (HAS.tree) {
    const total = meta.talentTreeCost();
    const runsToMax = total / stdRun;
    ok('[天賦] 全樹全滿 ≥ 2000 🧬（不再是 4 場畢業），且不超過 4000',
      total >= 2000 && total <= 4000, `全滿 ${total} 🧬`);
    ok('[天賦] 以標準局（8 分鐘 / 1200 擊殺 / Lv25 / 通關 ≈ 237 🧬）推算，畢業需要 8~20 場',
      runsToMax >= 8 && runsToMax <= 20, `${total} ÷ ${stdRun} = ${runsToMax.toFixed(1)} 場`);
  } else {
    ok('[天賦] 全樹全滿 ≥ 2000 🧬（不再是 4 場畢業），且不超過 4000', false, MISSING);
    ok('[天賦] 以標準局推算畢業需要 8~20 場', false, MISSING);
  }

  const marginal = tree.map((d) => d.costs[d.costs.length - 1] / d.costs[0]);
  ok('[天賦] 邊際成本有在漲（最後一級 ≥ 第一級的 5 倍）',
    marginal.every((m) => m >= 5), tree.map((d, i) => `${d.id} ${marginal[i].toFixed(0)}×`).join('、'));

  // 進度換算：投入額必須等於「買到目前等級所花的成本總和」
  const spent = { power: 3, vitality: 1, swift: 8, magnet: 0, fortune: 2 };
  const expectInvested = meta.TALENT_ORDER.reduce((sum, id) => {
    const d = meta.TALENTS[id];
    for (let l = 0; l < spent[id]; l++) sum += meta.talentCost(d, l);
    return sum;
  }, 0);
  ok('[天賦] talentInvested 與逐級成本總和一致（UI 進度條的根據）',
    HAS.tree && meta.talentInvested(spent) === expectInvested,
    HAS.tree ? `${meta.talentInvested(spent)} vs ${expectInvested}` : MISSING);

  // ── 2) 天賦真的套到玩家身上 ────────────────────────────────────────────
  const maxed = {};
  for (const d of tree) maxed[d.id] = d.maxLevel;
  const bonus = meta.metaBonuses(maxed);
  const beforeDna = save.data.dna;
  save.data.talents = maxed;
  g.start(false);
  const p = g.player;
  const applied = {
    dmg: +(p.damageMultiplier - 1).toFixed(3),
    hp: Math.round(p.maxHp - 100 - (p.metaHpBonus || 0)),
    speed: +(p.baseSpeedMul - 1).toFixed(3),
    magnet: +(p.baseMagnet - 1).toFixed(3),
  };
  ok('[天賦] 全滿後 game.start() 真的套用（傷害/生命/速度/磁力）',
    Math.abs(applied.dmg - bonus.dmg) < 0.02 && applied.speed >= bonus.speed - 0.02 &&
    applied.magnet >= bonus.magnet - 0.02 && applied.hp >= bonus.hp - 5,
    `傷害 +${applied.dmg}（表 ${bonus.dmg}）、生命 +${applied.hp}（表 ${bonus.hp}）、速度 +${applied.speed}、磁力 +${applied.magnet}`);
  save.data.talents = {};
  save.data.dna = beforeDna;

  // 購買：一般情況扣得剛好是該級成本；滿級後拒絕、且不會再扣 DNA
  // （先給足 DNA，否則只會量到「DNA 不足」而測不到扣款）
  const dnaBefore = save.data.dna;
  save.data.dna = 5000;
  save.data.talents = {};
  const r1 = save.investTalent('power');
  const afterFirst = save.data.dna;
  save.data.talents = { power: meta.TALENTS.power.maxLevel };
  const rMax = save.investTalent('power');
  ok('[天賦] 一般購買會扣 DNA、滿級後拒絕且不再扣款',
    r1.ok && r1.cost === meta.talentCost(meta.TALENTS.power, 0) &&
    afterFirst === 5000 - r1.cost && rMax.ok === false && save.data.dna === afterFirst,
    `買 1 級扣 ${r1.cost} 🧬（5000 → ${afterFirst}）；滿級再買 → ${rMax.ok ? '竟然成功' : rMax.reason}（DNA 仍為 ${save.data.dna}）`);
  save.data.talents = {};
  save.data.dna = dnaBefore;

  // ── 3) 黑市箱子：裝備等級跟著進度 ──────────────────────────────────────
  if (HAS.shopLvl) {
    const noProgress = shop.shopItemLevel({ data: { best: {} } });
    ok('[黑市] 沒有紀錄的新玩家 → 箱子是 ilvl 1（不會一開始就送後期裝）',
      noProgress === 1, `ilvl ${noProgress}`);
    const vet = { data: { best: { survivor: { core: { time: 420, kills: 900, cleared: false } }, defense: {} } } };
    const vetLvl = shop.shopItemLevel(vet);
    const deepLvl = shop.shopItemLevel({ data: { best: { survivor: { endless: { time: 480, kills: 2000, cleared: true } } } } });
    ok('[黑市] 打過難度 4 並撐 420 秒 → 箱子 ilvl > 2（跟著最佳紀錄走）',
      vetLvl > 2 && Math.abs(vetLvl - items.itemLevelFor(4, 420)) < 0.01,
      `ilvl ${vetLvl.toFixed(2)}（公式 ${items.itemLevelFor(4, 420).toFixed(2)}）`);
    ok('[黑市] 打到最難關卡並撐滿 → 箱子 ilvl 到上限 2.75（與局內掉落同一條公式）',
      Math.abs(deepLvl - 2.75) < 0.01, `ilvl ${deepLvl.toFixed(2)}`);
  } else {
    ok('[黑市] 沒有紀錄的新玩家 → 箱子是 ilvl 1（不會一開始就送後期裝）', false, MISSING);
    ok('[黑市] 打過難度 4 並撐 420 秒 → 箱子 ilvl > 2（跟著最佳紀錄走）', false, MISSING);
    ok('[黑市] 打到最難關卡並撐滿 → 箱子 ilvl 到上限 2.75', false, MISSING);
  }

  const rollBad = [];
  for (const [k, c] of Object.entries(shop.SHOP_CRATES)) {
    if (Math.abs(c.roll(2.5).ilvl - 2.5) > 0.001) rollBad.push(k);
  }
  ok('[黑市] 三個箱子的 roll 都吃 ilvl（不再是永遠 ilvl 1）',
    rollBad.length === 0, rollBad.length ? `沒吃 ilvl：${rollBad.join('、')}` : '精良/史詩/傳奇 都正確');

  // 詞條期望值要用平均（單次擲骰的變異很大：詞條有 0.06 的小數型也有 10~30 的固定型）
  const avgAffix = (ilvl, n = 300) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const it = shop.SHOP_CRATES.legendary_crate.roll(ilvl);
      s += it.affixes.reduce((a, x) => a + x.value, 0);
    }
    return s / n;
  };
  const a1 = avgAffix(1);
  const aDeep = avgAffix(2.75);
  ok('[黑市] 傳奇箱的詞條期望值隨 ilvl 成長（2.75 時 ≥ ilvl 1 的 1.8 倍）',
    aDeep / a1 >= 1.8, `ilvl 1 = ${a1.toFixed(2)} → ilvl 2.75 = ${aDeep.toFixed(2)}（×${(aDeep / a1).toFixed(2)}）`);
  ok('[黑市] 傳奇箱（1600🪙 + 320🧬）在最高進度下不弱於同期掉落',
    aDeep >= avgAffix(items.itemLevelFor(4, 400)) * 0.95,
    `箱子 ${aDeep.toFixed(2)} vs 同期掉落 ${avgAffix(items.itemLevelFor(4, 400)).toFixed(2)}`);

  // ── 4) 興奮劑：疊加、效果、不被永久天賦支配 ────────────────────────────
  save.data.boosters = [];
  if (HAS.stack) {
    const cap = shop.MAX_BOOSTER_STACK;
    const stackTries = [];
    for (let i = 0; i < cap + 2; i++) stackTries.push(save.addBooster('speed_stim'));
    ok(`[興奮劑] 同一種可疊到 ${cap} 劑，超過會被拒絕`,
      stackTries.filter((r) => r.ok).length === cap && stackTries[cap].ok === false &&
      save.boosterCount('speed_stim') === cap,
      stackTries.map((r) => (r.ok ? `ok×${r.count}` : `拒絕(${r.reason})`)).join(' '));
  } else {
    ok('[興奮劑] 同一種可疊到上限，超過會被拒絕', false, MISSING);
  }

  // 疊加要真的進遊戲：2 劑速度 → +2×18%；2 劑護盾 → 240（先前是覆寫成 100，疊不起來）
  save.data.boosters = ['speed_stim', 'speed_stim', 'vitality_shield', 'vitality_shield'];
  g.start(false);
  const spd = +(g.player.baseSpeedMul - 1).toFixed(3);
  const shield = Math.round(g.player.shield);
  const wantSpd = HAS.effect ? +(shop.SHOP_BOOSTERS.speed_stim.effect.speed * 2).toFixed(3) : 0;
  const wantShield = HAS.effect ? shop.SHOP_BOOSTERS.vitality_shield.effect.shield * 2 : 240;
  ok('[興奮劑] 同種多劑在局內是疊加（速度 ×2、護盾累加而不是覆寫）',
    HAS.effect && Math.abs(spd - wantSpd) < 0.02 && shield === wantShield,
    `速度 +${spd}（期望 +${wantSpd}）、護盾 ${shield}（期望 ${wantShield}）`);
  save.data.boosters = [];

  // 說明文字與 effect 必須一致（先前「說明 +15% / 程式 +10%」這種漂移踩過）
  const descBad = [];
  for (const b of (HAS.effect ? Object.values(shop.SHOP_BOOSTERS) : [])) {
    const nums = (b.desc.match(/\d+(\.\d+)?/g) || []).map(Number);
    const effNums = Object.entries(b.effect).map(([k, v]) =>
      (k === 'gold' ? Math.round((v - 1) * 100) : (v < 1 ? Math.round(v * 100) : Math.round(v))));
    for (const n of effNums) if (!nums.includes(n)) descBad.push(`${b.id} 缺 ${n}`);
  }
  ok('[興奮劑] 說明文字裡的數字與 effect 完全一致', HAS.effect && descBad.length === 0,
    !HAS.effect ? MISSING : (descBad.length ? descBad.join('、') : `${Object.keys(shop.SHOP_BOOSTERS).length} 項都對得上`));

  // 消耗品必須單局明顯強過永久天賦：單局效果/DNA ≥ 永久天賦同項目/DNA 的 3 倍
  const perDna = (eff, dna) => eff / dna;
  const talentPerDna = {
    speed: meta.TALENTS.swift.valuePerLevel / meta.TALENTS.swift.costs[0],
    gold: meta.TALENTS.fortune.valuePerLevel / meta.TALENTS.fortune.costs[0],
    dmg: meta.TALENTS.power.valuePerLevel / meta.TALENTS.power.costs[0],
    hp: meta.TALENTS.vitality.valuePerLevel / meta.TALENTS.vitality.costs[0],
  };
  const ratios = [];
  const B = HAS.effect ? shop.SHOP_BOOSTERS : {};
  if (HAS.effect) {
    ratios.push(['迅捷 vs 疾走引擎', perDna(B.speed_stim.effect.speed, B.speed_stim.costDna) / talentPerDna.speed]);
    ratios.push(['財運磁石 vs 幸運加成', perDna(B.fortune_magnet.effect.gold - 1, B.fortune_magnet.costDna) / talentPerDna.gold]);
    ratios.push(['狂暴核心 vs 火力核心', perDna(B.frenzy_core.effect.crit * (2 + B.frenzy_core.effect.critDmg), B.frenzy_core.costDna) / talentPerDna.dmg]);
    ratios.push(['納米護盾 vs 奈米修復', perDna(B.vitality_shield.effect.shield, B.vitality_shield.costDna) / talentPerDna.hp]);
  }
  ok('[興奮劑] 每一項的「單局效果 / DNA」都 ≥ 同項目永久天賦的 3 倍（消耗品不是陷阱）',
    HAS.effect && ratios.length === 4 && ratios.every(([, r]) => r >= 3),
    !HAS.effect ? MISSING : ratios.map(([n, r]) => `${n} ${r.toFixed(1)}×`).join('、'));

  ok('[興奮劑] DNA 成本 ≤ 12（一場的 DNA 收入足以帶好幾劑）',
    Object.values(shop.SHOP_BOOSTERS).every((b) => b.costDna <= 12),
    Object.values(shop.SHOP_BOOSTERS).map((b) => `${b.name} ${b.costDna}🧬`).join('、'));

  // ── 5) UI 要看得見這些東西 ─────────────────────────────────────────────
  save.data.best = { survivor: { core: { time: 420, kills: 900, cleared: false } }, defense: {} };
  save.data.dna = 9999;
  save.data.gold = 99999;
  g.ui.openShopModal(save, { onBuyCrate: () => {}, onBuyBooster: () => {}, onExpandStash: () => {} });
  const crateTxt = g.ui.shopBody ? g.ui.shopBody.textContent : '';
  ok('[UI] 軍備箱卡片顯示裝備等級（玩家看得到黑市貨會跟著進度變好）',
    /裝備等級/.test(crateTxt) && /Lv\.\d/.test(crateTxt),
    (crateTxt.match(/裝備等級\s*Lv\.[\d.]+/) || ['（沒有）'])[0] + (HAS.shopLvl ? '' : `｜${MISSING}`));

  // 先帶兩劑，卡片才會出現劑數徽章（空的時候只會顯示購買按鈕）
  save.data.boosters = [];
  save.addBooster('speed_stim');
  save.addBooster('speed_stim');
  const boostTxt = (() => {
    const tab = [...document.querySelectorAll('.shop-tab, [data-shop-tab]')].find((e) => /興奮劑|戰術/.test(e.textContent));
    if (tab) tab.click();
    return g.ui.shopBody ? g.ui.shopBody.textContent : '';
  })();
  ok('[UI] 興奮劑卡片顯示劑數與上限（不再是買一劑就把按鈕變「已就緒」）',
    /×\d+\s*\/\s*\d+/.test(boostTxt), (boostTxt.match(/×\d+\s*\/\s*\d+/) || ['（沒有）'])[0]);

  save.data.talents = { power: 3, swift: 2 };
  g.ui.openTalentModal(save, () => {});
  const progTxt = (document.querySelector('.talent-progress-text') || {}).textContent || '';
  const nextTxt = (document.querySelector('.talent-next') || {}).textContent || '';
  ok('[UI] 基因強化顯示總進度與「下一級」數值',
    /\/\s*\d+/.test(progTxt) && /下一級/.test(nextTxt),
    `${progTxt.trim()}｜${nextTxt.trim()}`.trim() || MISSING);
  save.data.talents = {};

  return out;
});

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  [${r.detail}]`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed  (pageerror: ${errs.length})`);
if (errs.length) console.log(errs.slice(0, 5).join('\n'));
if (failed || errs.length) process.exitCode = 1;
await browser.close();
