// 守塔模式深度改動的回歸契約（v84 的六個方向：地基／星等／王國／詞綴／建造選單／打擊感）。
//
// 為什麼要單獨一支：這批功能的失效方式全都很安靜，而且大多不會拋例外 ——
//   * 地基加成寫進了 socketDmgMul，卻沒有被 applyTDStats() 帶進 dmgMul
//     （v83 的真實 bug：八種地基一條都沒生效，而且畫面上完全看不出來）
//   * 星等門檻到了但沒有重算，塔「升星了」卻沒有變強
//   * 建造選單的數字鍵被設施快捷鍵（1–7）先吃掉，按 1 蓋出的是機槍砲台
//   * 王國升級買了卻只有「之後蓋的塔」受益，已經在場上的塔沒動
//   * 詞綴只出現在預告文字裡，佇列裡其實沒帶（開打才發現怪沒變強）
//   * 選中塔時的射程圈／星等只在「這一局的 g.turrets 裡」才畫得出來
//   * 程序化道路的間距驗證永遠回 false，於是六張圖「每局隨機」其實是每局都退回原始路線（v86）
//   * 路面貼圖有下載、有預快取、有解碼，但從來沒有人讀取，畫面上永遠看不到（v86）
// 所以每一條都驗「資料層 → 塔身上的實際數值 → 畫面／DOM」三段，而不是只驗資料存在。
//
// 需要已起好的靜態伺服器（no-store 才不會被 PWA cache 干擾）：
//   $env:PLAYWRIGHT_BROWSERS_PATH='D:\DevProject\pw-runtime\browsers'
//   $env:PW_MODULE='file:///D:/DevProject/pw-runtime/node_modules/playwright/index.js'
//   $env:PROBE_URL='http://127.0.0.1:8899/index.html'
//   node tools/verify-td-deep.mjs
import { readFileSync } from 'node:fs';
import { TD_LEVELS, TD_ORDER } from '../js/tdlevels.js';
import { SOCKET_BONUSES } from '../js/tdsockets.js';
import { WAVE_MODS, waveModMul } from '../js/tdwaves.js';
import { KINGDOM_UPGRADES, KINGDOM_MAX, kingdomNextCost } from '../js/tdkingdom.js';
import {
  randomizeTDLevel, validatePathClearance, minPathClearance, pathsWithinBounds,
} from '../js/tdprocedural.js';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}${detail ? `  [${detail}]` : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ''}`); }
};

console.log('=== A. 資料層：地基／詞綴／王國三張表與關卡資料對得上 ===');
{
  ok('守塔關卡 7 關，TD_ORDER 與 TD_LEVELS 一致',
    TD_ORDER.length === 7 && TD_ORDER.every((id) => TD_LEVELS[id]),
    `${TD_ORDER.length} 關：${TD_ORDER.join('、')}`);

  let sockets = 0, planLeft = 0, badBonus = [], labelMismatch = 0;
  const used = new Set();
  for (const id of TD_ORDER) {
    const lv = TD_LEVELS[id];
    if (lv.socketPlan) planLeft++;
    for (const s of lv.sockets || []) {
      sockets++;
      if (!s.bonus) continue;
      if (!SOCKET_BONUSES[s.bonus]) { badBonus.push(`${id}/${s.id}=${s.bonus}`); continue; }
      used.add(s.bonus);
      if (s.label !== SOCKET_BONUSES[s.bonus].label) labelMismatch++;
    }
  }
  ok('八種地基加成在關卡資料裡全部被用過', used.size === Object.keys(SOCKET_BONUSES).length,
    `${used.size}/${Object.keys(SOCKET_BONUSES).length}：${[...used].join('、')}`);
  ok('每一格地基的 bonus 都是 SOCKET_BONUSES 現有的鍵（沒有寫錯的孤兒加成）',
    badBonus.length === 0, badBonus.slice(0, 4).join('、') || `${sockets} 格全部合法`);
  ok('載入後 socketPlan 已經展平刪除（不會有兩份真相）', planLeft === 0, `剩 ${planLeft} 關還留著 socketPlan`);
  ok('每一格的 label 都等於加成表的 label（UI 徽章直接印這份）',
    labelMismatch === 0, `不符 ${labelMismatch} 格`);

  let modded = 0, allWaves = 0, badMod = [];
  const usedMods = new Set();
  for (const id of TD_ORDER) {
    for (const w of TD_LEVELS[id].waves || []) {
      allWaves++;
      for (const m of w.mods || []) {
        if (!WAVE_MODS[m]) badMod.push(`${id}:${m}`);
        usedMods.add(m);
        modded++;
      }
    }
  }
  ok('每一道波的詞綴都是 WAVE_MODS 現有的鍵', badMod.length === 0, badMod.slice(0, 4).join('、') || '全部合法');
  ok('六種詞綴全部被用過', usedMods.size === Object.keys(WAVE_MODS).length,
    `${usedMods.size}/${Object.keys(WAVE_MODS).length}：${[...usedMods].join('、')}`);
  ok('掛了詞綴的波有 30 道以上（不是只有點綴）', modded >= 30, `${modded} 道 / 共 ${allWaves} 波`);

  // 詞綴不能只是標籤，要分兩條路真的生效：
  //  (1) 數值型（swift/swarm/elite/fortified）走 waveModMul() 的倍率表 → 直接驗倍率數字
  //  (2) 行為型（armored/aerial）沒有倍率，改由 TowerDefense.js 判斷護甲與追加空襲 → 驗原始碼真有分支
  const swift = waveModMul(['swift']), swarm = waveModMul(['swarm']);
  const elite = waveModMul(['elite']), fort = waveModMul(['fortified']);
  const combined = waveModMul(['swift', 'fortified', 'elite']);
  ok('疾行：移速 ×1.35、血量 ×0.85（不是只有描述文字）',
    swift.speed === 1.35 && swift.hp === 0.85, `speed=${swift.speed} hp=${swift.hp}`);
  ok('蟲潮：數量 ×1.5、血量 ×0.80', swarm.count === 1.5 && swarm.hp === 0.80,
    `count=${swarm.count} hp=${swarm.hp}`);
  ok('精英：血量 ×1.45、賞金 ×1.8（賞金要真的進佇列才領得到錢）',
    elite.hp === 1.45 && elite.bounty === 1.8, `hp=${elite.hp} bounty=${elite.bounty}`);
  ok('要塞：血量 ×1.30、移速 ×0.85', fort.hp === 1.30 && fort.speed === 0.85,
    `hp=${fort.hp} speed=${fort.speed}`);
  ok('同時掛多個詞綴時倍率相乘（不是取最後一個）',
    Math.abs(combined.hp - 0.85 * 1.30 * 1.45) < 1e-9
      && Math.abs(combined.speed - 1.35 * 0.85) < 1e-9   // 疾行 ×1.35 與要塞 ×0.85 互相抵銷
      && Math.abs(combined.bounty - 1.8) < 1e-9,
    `hp=${combined.hp.toFixed(4)} speed=${combined.speed.toFixed(4)} bounty=${combined.bounty}`);
  ok('重甲縱隊與空襲不靠倍率表（倍率全為 1，改由護甲分類與追加空襲實作）',
    JSON.stringify(waveModMul(['armored'])) === JSON.stringify(waveModMul([]))
      && JSON.stringify(waveModMul(['aerial'])) === JSON.stringify(waveModMul([])),
    `armored=${JSON.stringify(waveModMul(['armored']))} aerial=${JSON.stringify(waveModMul(['aerial']))}`);
  ok('未知詞綴被忽略而不是讓整波壞掉（打錯字不會當機）',
    JSON.stringify(waveModMul(['nonsense'])) === JSON.stringify(waveModMul([])), '未知詞綴 → 全 1');
  const tdsrc = readFileSync(new URL('../js/systems/TowerDefense.js', import.meta.url), 'utf8');
  const missing = ['armored', 'aerial'].filter((m) => !tdsrc.includes(`'${m}'`));
  ok('重甲與空襲確實在 TowerDefense.js 裡被特別處理（不是只寫在表裡的孤兒詞綴）',
    missing.length === 0, missing.join('、') || "mods.includes('armored') 與 mods.includes('aerial') 都在");

  // 王國：成本必須逐級遞增，滿級之後 kingdomNextCost 要回 null（UI 靠它判斷「滿級」）。
  const badCurve = [], badMax = [];
  for (const t of KINGDOM_UPGRADES) {
    for (let i = 1; i < t.levels.length; i++) if (!(t.levels[i].cost > t.levels[i - 1].cost)) badCurve.push(t.key);
    if (t.levels.length !== KINGDOM_MAX) badMax.push(`${t.key}:${t.levels.length}`);
    if (kingdomNextCost(t.key, KINGDOM_MAX) !== null) badCurve.push(`${t.key}:滿級未回 null`);
  }
  ok('王國六條線各三級、成本逐級遞增、滿級回 null',
    badCurve.length === 0 && badMax.length === 0, badCurve.concat(badMax).join('、') || '六條線全部合格');
}

console.log('\n=== A2. 程序化隨機地圖（v86）：原始資料要過驗證，隨機結果要真的換路且不出界 ===');
{
  // 教訓：v86 的 validatePathClearance 會把所有共用核心終點 [0,0] 的路線判成「穿模」，
  // 於是 6/7 張圖的隨機道路從來沒生效、每局都退回手寫路線，而且完全沒有錯誤訊息。
  // 所以「原始關卡資料本身必須驗得過」是第一條契約，第二條才是「真的會換」。
  const failDefault = [];
  for (const id of TD_ORDER) {
    const lv = TD_LEVELS[id];
    const mc = minPathClearance(lv.pathWidth);
    if (!validatePathClearance(lv._defaultPaths, mc)) failDefault.push(`${id}(${mc})`);
  }
  ok('七張地圖的手寫原始路線全部通過 validatePathClearance（驗證器不能用連原始資料都過不了的門檻）',
    failDefault.length === 0, failDefault.join('、') || `${TD_ORDER.length} 張全部通過`);

  for (const orientation of ['landscape', 'portrait']) {
    const unchanged = [], outOfBounds = [], badCount = [], innerFail = [];
    const ROUNDS = 25;
    for (const id of TD_ORDER) {
      const lv = TD_LEVELS[id];
      if (!lv.td) lv.td = true;                     // randomizeTDLevel 只處理 td 關卡
      const target = lv._initialSocketCount;
      let changed = 0;
      for (let i = 0; i < ROUNDS; i++) {
        randomizeTDLevel(lv, orientation);
        if (JSON.stringify(lv.paths) !== JSON.stringify(lv._defaultPaths)) changed++;
        if (!pathsWithinBounds(lv.paths, lv.bounds, 0)) outOfBounds.push(id);
        if (lv.sockets.length !== target) badCount.push(`${id}:${lv.sockets.length}/${target}`);
        const mc = minPathClearance(lv.pathWidth);
        if (!validatePathClearance(lv.paths, mc)) innerFail.push(id);   // 生成的候選自己也必須過
      }
      if (changed !== ROUNDS) unchanged.push(`${id}:${changed}/${ROUNDS}`);
    }
    ok(`[${orientation}] 七張地圖每局都換得出新的進軍路線（不是靜靜退回手寫路線）`,
      unchanged.length === 0, unchanged.join('、') || `7 關 × ${ROUNDS} 局全部與原始路線不同`);
    ok(`[${orientation}] 七張地圖每一局的路線都在地圖邊界內（竪屏不再跑出畫面）`,
      outOfBounds.length === 0, outOfBounds.join('、') || `${7 * ROUNDS} 局全部在 bounds 內`);
    ok(`[${orientation}] 七張地圖每一局的建塔點數量都等於原始數量（不多不少）`,
      badCount.length === 0, badCount.slice(0, 6).join('、') || `全部等於目標數`);
    ok(`[${orientation}] 生成出來的路線自己也過得了 validatePathClearance`,
      innerFail.length === 0, innerFail.slice(0, 6).join('、') || '全部通過');
  }

  // 驗證器本身的有效性：三線關卡的原始路線該通過，同一條路複製一份（真正重疊）該被否決。
  const ff = TD_LEVELS.td_fortress;
  const ffOk = validatePathClearance(ff._defaultPaths, minPathClearance(ff.pathWidth));
  const dup = [ff._defaultPaths[0], ff._defaultPaths[0].map((p) => [p[0], p[1]])];
  const dupOk = validatePathClearance(dup, 400);
  ok('驗證器對「共用核心引道」放行、但對真正重疊的區段仍然否決',
    ffOk && !dupOk, `三線關卡原始路線通過=${ffOk}；同一條路複製一份被否決=${!dupOk}`);
}

console.log('\n=== B. 瀏覽器：改動真的進到塔的數值與畫面 ===');
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const PAGE_URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const out = await page.evaluate(async () => {
  const r = [];
  const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });
  const imp = (p) => import(new URL(p, document.baseURI).href);

  const g = window.game;
  const { SOCKET_BONUSES } = await imp('js/tdsockets.js');
  const { TD_ELITE } = await imp('js/entities/Turret.js');
  const { applyTDStats, TD_TOWERS, tdTowerPreview } = await imp('js/tdtowers.js');
  const { KINGDOM_UPGRADES, kingdomNextCost } = await imp('js/tdkingdom.js');
  const { TD_ORDER } = await imp('js/tdlevels.js');
  const { save } = await imp('js/save.js');
  const fac = await imp('js/systems/Facilities.js');

  // 七關要全部玩得到，否則後面的煙霧測試會卡在解鎖而不是卡在程式碼。
  for (const id of TD_ORDER) save.unlock(id, 'defense');

  const boot = async (level) => {
    g.ui.startScreen.classList.add('hidden');
    g.triggerLevelUp = () => {};
    g.modeId = 'defense';
    g.levelId = level;
    g.start(false);
    const t0 = Date.now();
    while (!g.td && Date.now() - t0 < 8000) await new Promise((res) => setTimeout(res, 40));
    return g.td;
  };

  // ── B1. 八種地基各蓋一座，檢查寫進塔的欄位 ──
  let td = await boot('td_fork');
  ok('守塔關載入後拿得到 td 實例', !!td, `level=${g.levelId} td=${!!td}`);
  g.gold = 999999;
  const byBonus = {};
  for (const s of g.level.sockets) {
    if (!s.bonus) continue;
    const t = fac.buildTDTower(g, s, 'guard');
    if (t && !byBonus[s.bonus]) byBonus[s.bonus] = t;
  }
  const need = Object.keys(SOCKET_BONUSES);
  ok('八種地基都真的蓋得出一座塔', need.every((b) => byBonus[b]),
    need.map((b) => `${b}=${byBonus[b] ? 'ok' : '缺'}`).join(' '));
  ok('高台（range）→ socketRangeMul 1.15', byBonus.range?.socketRangeMul === 1.15, String(byBonus.range?.socketRangeMul));
  ok('彈藥庫（damage）→ socketDmgMul 1.20', byBonus.damage?.socketDmgMul === 1.20, String(byBonus.damage?.socketDmgMul));
  ok('加速齒輪（haste）→ socketCdrMul 0.85', byBonus.haste?.socketCdrMul === 0.85, String(byBonus.haste?.socketCdrMul));
  ok('裝甲基座（armor）→ 耐久 ×1.3', byBonus.armor?.socketHpMul === 1.3, String(byBonus.armor?.socketHpMul));
  ok('裝甲基座真的讓 maxHp 變大（欄位有被建構子用掉）',
    byBonus.armor && byBonus.range && byBonus.armor.maxHp / byBonus.range.maxHp > 1.29
      && byBonus.armor.maxHp / byBonus.range.maxHp < 1.31,
    `${byBonus.armor?.maxHp} vs ${byBonus.range?.maxHp}`);
  ok('金庫／訓練場／穿甲塢／指揮所的專屬欄位都寫進塔了',
    byBonus.bank?.bankRate === 0.05 && byBonus.bank?.bankCap === 80
      && byBonus.veteran?.vetRate === 0.04 && byBonus.veteran?.vetStacks === 0
      && byBonus.pierce?.armorPierce === 0.25
      && byBonus.command?.auraRadius === 220 && byBonus.command?.auraMul === 0.15,
    `bank=${byBonus.bank?.bankRate}/${byBonus.bank?.bankCap} vet=${byBonus.veteran?.vetRate} pierce=${byBonus.pierce?.armorPierce} cmd=${byBonus.command?.auraRadius}`);

  // 真正的回歸點：加成必須活過 applyTDStats()（v83 就是死在這裡）
  const dm = byBonus.damage?.dmgMul, dg = byBonus.range?.dmgMul;
  ok('彈藥庫的塔 dmgMul 是同型塔的 1.20 倍（v83 這裡是 1.00：加成被 applyTDStats 洗掉）',
    dm && dg && Math.abs(dm / dg - 1.20) < 0.02,
    `damage=${dm?.toFixed?.(4)} range=${dg?.toFixed?.(4)} 比值=${(dm / dg).toFixed(3)}`);
  const rr = byBonus.range?.rangeMul, rd = byBonus.damage?.rangeMul;
  ok('高台的塔 rangeMul 是同型塔的 1.15 倍', rr && rd && Math.abs(rr / rd - 1.15) < 0.02,
    `range=${rr?.toFixed?.(4)} damage=${rd?.toFixed?.(4)} 比值=${(rr / rd).toFixed(3)}`);
  const beforeRe = byBonus.damage?.dmgMul;
  applyTDStats(byBonus.damage);
  ok('再呼叫一次 applyTDStats 不會把地基加成洗掉或疊加（可重複計算）',
    Math.abs(byBonus.damage.dmgMul / beforeRe - 1) < 1e-9, `${beforeRe?.toFixed(4)} → ${byBonus.damage.dmgMul.toFixed(4)}`);

  // ── B2. 建造選單顯示 DPS／射程／護甲相剋（「簡陋」的來源往往只是看不到數字）──
  const keys = Object.keys(TD_TOWERS);
  const previews = keys.map((k) => [k, tdTowerPreview(k)]);
  const zeroDps = previews.filter(([k, p]) => p && !p.units && !(p.dps > 0)).map(([k]) => k);
  ok('每一座有 DPS 的塔，建造選單都算得出 DPS（不會全部顯示 0）', zeroDps.length === 0,
    previews.map(([k, p]) => `${k}:${p?.units ? '小兵' : p?.dps}`).join(' '));
  const cannon = previews.find(([k]) => k === 'cannon')?.[1];
  ok('加農砲讀的是自己的火力數字，不是基礎雷射塔的（跨表取值 bug 回歸）',
    cannon && cannon.range >= 300 && cannon.canAir === false, `range=${cannon?.range} canAir=${cannon?.canAir} dmg=${cannon?.dmg}`);
  ok('打不到空中不會被標成「弱空中」（那是選不到目標，不是相剋）',
    previews.every(([, p]) => !p || !(p.canAir === false && (p.weak || []).includes('air'))),
    previews.map(([k, p]) => `${k}:${p?.canAir ? 'air-ok' : 'no-air'}`).join(' '));

  // ── B3. 實戰歷練：星等門檻、成長倍率、滿星 ──
  const t1 = byBonus.damage;
  ok('剛蓋好的塔是 ★0、0 擊殺', t1.eliteTier === 0 && t1.kills === 0, `tier=${t1.eliteTier} kills=${t1.kills}`);
  const baseDmg = t1.dmgMul;
  let crossed = 0;
  for (let i = 0; i < TD_ELITE.kills[0]; i++) if (t1.addKill()) crossed++;
  applyTDStats(t1);
  ok('累計 20 隻擊殺升上 ★1「老練」，而且只回報一次升星',
    t1.eliteTier === 1 && crossed === 1, `tier=${t1.eliteTier} 升星次數=${crossed} 稱號=${TD_ELITE.name[1]}`);
  ok('升星後 dmgMul 立刻變成 1.07 倍（呼叫端有重算，不是只有欄位改）',
    Math.abs(t1.dmgMul / baseDmg - TD_ELITE.dmg[1]) < 1e-6, `${baseDmg.toFixed(4)} → ${t1.dmgMul.toFixed(4)}`);
  ok('eliteNext() 說得出距離下一星還差幾隻', t1.eliteNext() === TD_ELITE.kills[1] - TD_ELITE.kills[0],
    `再 ${t1.eliteNext()} 隻升 ★2`);
  while (t1.kills < TD_ELITE.kills[2]) t1.addKill();
  ok('滿星（150 隻）後 addKill 回 false、eliteNext 回 null、星等停在 ★3',
    t1.addKill() === false && t1.eliteNext() === null && t1.eliteTier === 3,
    `tier=${t1.eliteTier} next=${t1.eliteNext()} kills=${t1.kills}`);
  applyTDStats(t1);
  ok('★3 王牌同時加射程（不只是加威力）',
    t1.eliteRangeMul === TD_ELITE.range[3]
      && Math.abs(t1.rangeMul / byBonus.range.rangeMul - TD_ELITE.range[3] / 1.15) < 0.02,
    `eliteRangeMul=${t1.eliteRangeMul} rangeMul=${t1.rangeMul.toFixed(3)}`);

  // ── B4. 建造選單：數字鍵 1–4 端到端（走 Menu.js 的 keydown，不是直接呼叫函式）──
  td = await boot('td_fork');
  g.gold = 999999;
  const socket = g.level.sockets.find((s) => !s.occupied);
  const beforeCount = g.turrets.length;
  fac.openBuildMenu(g, socket);
  ok('點建塔點後選單開得起來（game.buildMenuSocket 有值）', !!g.buildMenuSocket, `socket=${socket?.id}`);
  const rows = document.querySelectorAll('#td-build-menu .td-build-opt');
  ok('選單每一列都標了對應的數字鍵（1–4）',
    rows.length === keys.length && rows.length >= 4
      && document.querySelectorAll('#td-build-menu .td-opt-key').length === rows.length,
    `${rows.length} 列、TD_TOWERS=${keys.length}、buildMenuKeys=${g.buildMenuKeys.length}`);
  ok('選單關著時 pickBuildMenuByIndex 回 false（不會亂蓋）',
    (() => { const s = g.buildMenuSocket; g.buildMenuSocket = null; const v = fac.pickBuildMenuByIndex(g, 1); g.buildMenuSocket = s; return v === false; })(),
    '沒有選單時回 false');
  fac.openBuildMenu(g, socket);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
  ok('按數字鍵 1 直接蓋出塔（走 Menu.js 的 keydown 而不是設施快捷鍵）',
    g.turrets.length === beforeCount + 1 && socket.occupied === true,
    `${beforeCount} → ${g.turrets.length} occupied=${socket.occupied}`);
  ok('蓋完選單自動關閉', !g.buildMenuSocket && !g.buildMenuKeys,
    `socket=${g.buildMenuSocket} keys=${g.buildMenuKeys}`);

  // ── B5. 王國升級：買了要立刻推到「已經在場上」的塔 ──
  td = await boot('td_fork');
  g.gold = 999999;
  const rowsUi = td.kingdomRows();
  ok('王國面板六條線、初始都是 Lv.0、成本與資料表一致',
    rowsUi.length === KINGDOM_UPGRADES.length && rowsUi.every((x) => x.level === 0)
      && rowsUi.every((x) => x.cost === kingdomNextCost(x.key, 0)),
    rowsUi.map((x) => `${x.name}:${x.cost}`).join(' '));
  const t2 = fac.buildTDTower(g, g.level.sockets[0], 'guard');
  const d0 = t2.dmgMul, r0 = t2.rangeMul;
  const gold0 = g.gold;
  ok('買彈道學 Lv.1：扣 200 🪙 並回 true',
    td.buyKingdom('ballistics') === true && g.gold === gold0 - 200, `${gold0} → ${g.gold}`);
  ok('已經蓋好的塔立刻吃到 +10% 威力（applyKingdom 真的有推）',
    Math.abs(t2.dmgMul / d0 - 1.10) < 0.005, `${d0.toFixed(4)} → ${t2.dmgMul.toFixed(4)}`);
  ok('買光學 Lv.1 後，同一座塔的射程也立刻變大',
    td.buyKingdom('optics') === true && t2.rangeMul / r0 > 1.05, `${r0.toFixed(4)} → ${t2.rangeMul.toFixed(4)}`);
  td.buyKingdom('ballistics'); td.buyKingdom('ballistics');
  const bl = td.kingdomRows().find((x) => x.key === 'ballistics');
  ok('彈道學三階後標記滿級（cost 為 null、maxed true）',
    bl.level === 3 && bl.maxed === true && bl.cost === null, `Lv.${bl.level} maxed=${bl.maxed} cost=${bl.cost}`);
  const gm = g.gold;
  ok('滿級後再買回 false 且不扣款', td.buyKingdom('ballistics') === false && g.gold === gm, `gold ${gm} → ${g.gold}`);
  g.gold = 10;
  ok('錢不夠時回 false 且不扣款', td.buyKingdom('economy') === false && g.gold === 10, `gold=${g.gold}`);
  g.gold = 999999;

  // ── B6. 波次詞綴：不只要顯示，佇列裡也要真的帶到 ──
  td = await boot('td_canyon');
  g.gold = 5000;
  const modIdx = td.waves.findIndex((w) => (w.mods || []).length > 0);
  ok('td_canyon 有掛詞綴的波', modIdx >= 0, `第 ${modIdx + 1} 波 mods=${(td.waves[modIdx]?.mods || []).join('、')}`);
  td.waveIdx = modIdx;
  td.phase = 'break';
  td.timer = 30;
  const info = td.nextWaveInfo();
  const wantMods = (td.waves[modIdx].mods || []).join('、');
  ok('下一波預告帶得出詞綴（不是只有波數）',
    info && Array.isArray(info.mods) && info.mods.join('、') === wantMods,
    `預告 mods=${(info?.mods || []).join('、')}｜資料 mods=${wantMods}`);
  const goldE = g.gold;
  td.startWave(true);
  ok('提前開戰會給金幣，且會計入後勤加成', g.gold > goldE, `${goldE} → ${g.gold}`);
  ok('開打後 phase=wave、waveIdx 前進、佇列有內容',
    td.phase === 'wave' && td.waveIdx === modIdx + 1 && td.queue.length > 0,
    `phase=${td.phase} wave=${td.waveIdx}/${td.total} queue=${td.queue.length}`);
  ok('佇列每一項都帶著這一波的詞綴（血量／移速／賞金才套得到）',
    td.queue.every((q) => (q.mods || []).join('、') === wantMods),
    `mods=${(td.queue[0]?.mods || []).join('、')}`);
  ok('有 aerial 詞綴的波會追加飛行單位（空襲不是空的）',
    !wantMods.includes('aerial') || td.queue.some((q) => q.type === 'bat'),
    `含 bat=${td.queue.some((q) => q.type === 'bat')}`);
  ok('hpMul 隨波次成長（詞綴的血量倍率再乘在它上面）', td.hpMul() > 0, `hpMul=${td.hpMul().toFixed(3)}`);

  // ── B7. 選中塔的射程圈與星等：必須是「這一局 g.turrets 裡」的塔才測得到繪製路徑 ──
  const t7 = fac.buildTDTower(g, g.level.sockets.find((s) => !s.occupied), 'guard');
  while (t7.kills < TD_ELITE.kills[2]) t7.addKill();
  applyTDStats(t7);
  let renderErr = null;
  try {
    fac.inspectFacility(g, t7);
    g.render(); g.render();
  } catch (e) { renderErr = e.message; }
  ok('選中一座滿星塔後連畫兩帧不拋例外（射程圈＋星等繪製路徑）', !renderErr, renderErr || 'ok');
  ok('被選中的塔確實是當前這一局的塔（否則上面的繪製等於沒跑到）',
    g.turrets.includes(t7) && g.inspectedTurret === t7, `inTurret=${g.turrets.includes(t7)} inspected=${g.inspectedTurret === t7}`);
  const it = document.getElementById('inspect-type');
  ok('檢查面板印出星等與累計擊殺（玩家看得出這座塔在成長）',
    it && it.textContent.includes('⭐') && it.textContent.includes('擊殺'), it ? it.textContent : '(找不到 #inspect-type)');

  // ── B8. 七關煙霧：每關開局跑 600 帧 ──
  const smoke = [];
  for (const id of TD_ORDER) {
    try {
      await boot(id);
      if (!g.td) throw new Error('td 未建立（關卡沒開起來）');
      g.player.invulnerableTimer = 1e9;
      for (let i = 0; i < 600; i++) g.update(1 / 60);
      g.render();
      smoke.push(`${id}:ok`);
    } catch (e) { smoke.push(`${id}:FAIL ${e.message.split('\n')[0]}`); }
  }
  ok('七張守塔地圖都能開局並跑 600 帧不拋例外', smoke.every((s) => s.endsWith('ok')), smoke.join(' '));

  // ── B9. 主題路面貼圖與靜態圖層（v86 的貼圖＋v87 的烘焙）──
  // 教訓：v86 把 7 張 path_*.png 下載、預快取、解碼，卻一個讀取端都沒有
  // （TD_PATH_IMAGES 只有寫入端、TD_PATH_STYLES[*].texture 從來沒被讀），
  // 而且稽核腳本把 TD_PATH_KEYS 整份登記成「已使用」，所以死檔檢查也看不到。
  const { TD_PATH_IMAGES, TD_PATH_KEYS, TD_PATH_STYLES } = await imp('js/systems/TowerDefense.js');
  const notLoaded = TD_PATH_KEYS.filter((k) => !(TD_PATH_IMAGES[k] && TD_PATH_IMAGES[k].naturalWidth));
  ok('七張主題路面貼圖都真的載入完成', notLoaded.length === 0,
    notLoaded.join('、') || `${TD_PATH_KEYS.length} 張 ${TD_PATH_IMAGES[TD_PATH_KEYS[0]].naturalWidth}px`);
  const noStyle = TD_ORDER.filter((id) => !TD_PATH_KEYS.includes((TD_PATH_STYLES[id] || {}).texture));
  ok('每張守塔地圖都指到一張存在的貼圖（沒有地圖漏掉 texture）', noStyle.length === 0,
    noStyle.join('、') || TD_ORDER.map((id) => `${id.replace('td_', '')}:${TD_PATH_STYLES[id].texture.replace('path_', '')}`).join(' '));

  await boot('td_canyon');
  const tkey = (TD_PATH_STYLES[g.levelId] || {}).texture;
  const trn = g.ctx.getTransform();
  const midPt = g.td.paths[0][Math.floor(g.td.paths[0].length / 2)];
  const roadPx = [Math.round((midPt[0] - g.camera.x) * trn.a), Math.round((midPt[1] - g.camera.y) * trn.d)];
  const sampleRoad = () => {
    const d = g.ctx.getImageData(roadPx[0], roadPx[1], 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const dist3 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  g.render();
  const withTex = sampleRoad();
  const keepImg = TD_PATH_IMAGES[tkey];
  TD_PATH_IMAGES[tkey] = null;          // 拔掉貼圖 → 圖層換 key（#notex）會重烘
  g.render();
  const noTex = sampleRoad();
  TD_PATH_IMAGES[tkey] = keepImg;
  ok('路面貼圖真的畫在路面上（拔掉貼圖，同一點的顏色會變）', dist3(withTex, noTex) >= 6,
    `有貼圖=${withTex.join(',')} 沒貼圖=${noTex.join(',')} 差異=${dist3(withTex, noTex)}`);

  g.render();
  const c1 = g.td._roadLayerCanvas, k1 = g.td._roadLayerKey;
  g.render();
  ok('靜態路面圖層會快取（同一個縮放連畫兩帧不重烘）',
    !!c1 && c1 === g.td._roadLayerCanvas && k1 === g.td._roadLayerKey, `${k1 ? k1.slice(0, 70) : '(無)'}`);
  ok('圖層快取鍵帶關卡 id 與縮放（換關／改視野不會沿用上一張路面）',
    !!k1 && k1.includes('td_canyon') && k1.includes('tex'), k1 ? k1.slice(0, 70) : '(無)');
  ok('圖層尺寸受像素上限保護（不會把整張地圖烘成幾百 MB）',
    !!c1 && c1.width * c1.height <= 6.0e6, c1 ? `${c1.width}x${c1.height} = ${((c1.width * c1.height) / 1e6).toFixed(2)}MP` : '(無)');

  const origLayer = g.td.staticRoadLayer.bind(g.td);
  g.td.staticRoadLayer = () => null;
  let fallbackErr = null;
  try { g.render(); } catch (e) { fallbackErr = e.message.split('\n')[0]; }
  const fallback = sampleRoad();
  g.td.staticRoadLayer = origLayer;
  ok('沒有離屏圖層時退回逐幀繪製不拋例外', !fallbackErr, fallbackErr || 'ok');
  ok('退路畫法與烘焙圖層落在同一個位置（相機位移有正確扣除）', dist3(withTex, fallback) <= 40,
    `圖層=${withTex.join(',')} 逐幀=${fallback.join(',')} 差異=${dist3(withTex, fallback)}`);

  // 竪屏出擊：設定改成 portrait 之後開一局新的，地圖該變成長條、路線全在裡面、地基補滿。
  const orientSel = document.getElementById('orientation-select');
  if (orientSel) {
    orientSel.value = 'portrait';
    orientSel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await boot('td_fortress');
  const pb = g.level.bounds;
  ok('選了竪屏再出擊，地圖邊界真的變成長條（高 > 寬）',
    pb.maxY - pb.minY > pb.maxX - pb.minX,
    `${Math.round(pb.maxX - pb.minX)}x${Math.round(pb.maxY - pb.minY)} orientation=${g.orientation}`);
  let porErr = null;
  try { for (let i = 0; i < 60; i++) g.update(1 / 60); g.render(); } catch (e) { porErr = e.message.split('\n')[0]; }
  const pOut = g.level.paths.some((p) => p.some((q) => q[0] < pb.minX - 1 || q[0] > pb.maxX + 1
    || q[1] < pb.minY - 1 || q[1] > pb.maxY + 1));
  ok('竪屏關卡的路線全在地圖內、建塔點補滿、跑 60 帧不拋例外',
    !porErr && !pOut && g.level.sockets.length === g.level._initialSocketCount,
    porErr || `路線出界=${pOut} 地基=${g.level.sockets.length}/${g.level._initialSocketCount}`);
  if (orientSel) {
    orientSel.value = 'landscape';
    orientSel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── B10. 切換視野方向不會讓畫面拉伸（v88）──
  // 教訓：#game-container 有 `transition: width .25s, height .25s`，而且切 orient-* 時
  // **不會**觸發 window.resize；只讀一次 clientWidth/Height 拿到的是「轉場剛開始」的舊尺寸，
  // 之後 CSS 把畫面拉成新比例、畫布卻還停在舊比例 → 整個畫面被拉伸變形（實測縱向被壓 11%，
  // 竪屏↔橫屏互切時可到 2 倍以上）。修法：ResizeObserver 跟著容器走 + 畫布尺寸以自身 CSS 方框為準。
  const stretchOf = () => {
    const rect = g.canvas.getBoundingClientRect();
    const dpr = g.dpr || 1;
    return {
      sx: g.canvas.width / (rect.width * dpr),
      sy: g.canvas.height / (rect.height * dpr),
      css: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      backing: `${g.canvas.width}x${g.canvas.height}`,
      swsh: `${g.sw}x${g.sh}`,
    };
  };
  let worstStretch = 0;
  const stretchLog = [], sizeMismatch = [];
  for (const v of ['landscape', 'portrait', 'auto']) {
    const sel2 = document.getElementById('orientation-select');
    if (sel2) { sel2.value = v; sel2.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise((res) => setTimeout(res, 600));       // 等 0.25s 的容器轉場跑完
    const s = stretchOf();
    worstStretch = Math.max(worstStretch, Math.abs(s.sx - 1), Math.abs(s.sy - 1));
    stretchLog.push(`${v}: css ${s.css} → 畫布 ${s.backing} sx=${s.sx.toFixed(3)} sy=${s.sy.toFixed(3)}`);
    if (s.swsh !== s.css) sizeMismatch.push(`${v}: sw/sh ${s.swsh} ≠ css ${s.css}`);
  }
  ok('切換視野方向後畫布比例與 CSS 方框一致（畫面不會被拉伸變形）',
    worstStretch <= 0.02, `最大偏差 ${(worstStretch * 100).toFixed(2)}%｜${stretchLog.join('  ')}`);
  ok('切換視野方向後遊戲記下的視窗大小等於實際大小（守塔的縮放與相機才不會算錯）',
    sizeMismatch.length === 0, sizeMismatch.join('、') || stretchLog.map((l) => l.split(' →')[0]).join('  '));
  return r;
});

// ── B11. 裝置轉向（viewport 真的改變）也不會拉伸 ──
// B10 驗的是 CSS 類別切換（不觸發 window.resize），這裡驗真的轉向：容器 100vw/100dvh 跟著 viewport 變，
// 但 0.25s 的 width/height 轉場會讓「resize 事件當下量到的尺寸」不等於最終尺寸。
{
  const measure = () => page.evaluate(() => {
    const g = window.game;
    const rect = g.canvas.getBoundingClientRect();
    const dpr = g.dpr || 1;
    return {
      sx: g.canvas.width / (rect.width * dpr),
      sy: g.canvas.height / (rect.height * dpr),
      css: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      swsh: `${g.sw}x${g.sh}`,
    };
  });
  let worst = 0;
  const log = [];
  for (const [w, h] of [[844, 390], [390, 844], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(700);
    const s = await measure();
    worst = Math.max(worst, Math.abs(s.sx - 1), Math.abs(s.sy - 1));
    log.push(`${w}x${h}: css ${s.css} sw/sh ${s.swsh} sx=${s.sx.toFixed(3)} sy=${s.sy.toFixed(3)}`);
  }
  ok('裝置轉向（橫→直→橫）後畫布與遊戲視窗都跟著更新，畫面不失真',
    worst <= 0.02, `最大偏差 ${(worst * 100).toFixed(2)}%｜${log.join('  ')}`);
}

// ── B12. 設定方向與裝置方向不符、窄框又擠不下時，改用自動版面並提示（v88）──
// 9:16 窄框在橫向裝置上只有兩百多像素寬，HUD 與右側按鈕會全部疊在一起。
// 但桌面上把視窗拉成直向預覽 9:16（寬度仍有 450px）是**合理用法**，不能被一起改掉 ——
// 所以條件是「方向不符 **且** 窄框寬度 < 320px」，這裡兩種情況都要驗。
{
  const snap = () => page.evaluate(() => {
    const el = document.getElementById('game-container');
    const hint = document.getElementById('orient-hint');
    const g = window.game;
    return {
      cls: el.className,
      w: Math.round(el.getBoundingClientRect().width),
      hint: !!hint && hint.classList.contains('show'),
      hintText: hint ? hint.textContent : '',
      swsh: `${g.sw}x${g.sh}`,
    };
  });
  const setOrient = (v) => page.evaluate((val) => {
    const sel = document.getElementById('orientation-select');
    sel.value = val;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);

  await page.setViewportSize({ width: 1280, height: 800 });   // 橫向裝置
  await page.waitForTimeout(400);
  await setOrient('portrait');
  await page.waitForTimeout(700);
  const desk = await snap();
  ok('桌面橫視窗選竪屏（窄框仍有 450px）照設定顯示，不提示',
    desk.cls.includes('orient-portrait') && !desk.hint, `class=${desk.cls} 寬=${desk.w} 提示=${desk.hint}`);

  await page.setViewportSize({ width: 844, height: 390 });    // 手機橫放
  await page.waitForTimeout(900);
  const phone = await snap();
  ok('手機橫放卻設定竪屏（窄框只剩 219px）改用自動版面並顯示提示',
    phone.cls.includes('orient-auto') && phone.hint && phone.hintText.includes('不符'),
    `class=${phone.cls} 寬=${phone.w} 提示=${phone.hint ? `「${phone.hintText.trim()}」` : '無'}`);

  await page.setViewportSize({ width: 390, height: 844 });    // 裝置轉回直向
  await page.waitForTimeout(900);
  const back = await snap();
  ok('裝置轉回直向後恢復竪屏版面、提示消失',
    back.cls.includes('orient-portrait') && !back.hint, `class=${back.cls} 寬=${back.w} 提示=${back.hint}`);

  await setOrient('auto');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
}

for (const t of out) {
  if (t.pass) { passed++; console.log(`PASS  ${t.name}  [${t.detail}]`); }
  else { failed++; console.log(`FAIL  ${t.name}  [${t.detail}]`); }
}
if (pageErrors.length) { failed++; console.log('pageerror:', pageErrors); }
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
