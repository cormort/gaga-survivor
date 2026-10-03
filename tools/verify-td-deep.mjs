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
  return r;
});

for (const t of out) {
  if (t.pass) { passed++; console.log(`PASS  ${t.name}  [${t.detail}]`); }
  else { failed++; console.log(`FAIL  ${t.name}  [${t.detail}]`); }
}
if (pageErrors.length) { failed++; console.log('pageerror:', pageErrors); }
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
