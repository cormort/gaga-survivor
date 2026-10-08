// 關卡解鎖武器 + 小地圖逐項顯示地形／事件。
//
// 用法（單一指令，自己起一台 no-store 靜態伺服器，跑完自己收掉）：
//   CHROMIUM=/path/to/chrome node tools/verify-weapon-unlock.mjs
// 也可以指向別人已經起好的伺服器：
//   PROBE_URL=http://127.0.0.1:8899/index.html node tools/verify-weapon-unlock.mjs
//
// CHROMIUM 未設時走 playwright 預設執行檔（行為與其他 verify 工具一致）。
import { spawn } from 'node:child_process';

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const OWN_SERVER = !process.env.PROBE_URL;
const PORT = Number(process.env.WEAPON_UNLOCK_PORT || 8899);
const URL = process.env.PROBE_URL || `http://127.0.0.1:${PORT}/index.html`;

let server = null;
if (OWN_SERVER) {
  server = spawn('python3', ['tools/dev-server.py', String(PORT)], { stdio: 'ignore' });
  server.unref();
  const deadline = Date.now() + 8000;
  for (;;) {
    try { const r = await fetch(URL); if (r.ok) break; } catch { /* 還沒起來 */ }
    if (Date.now() > deadline) { console.error(`靜態伺服器沒起來（port ${PORT}）`); process.exit(1); }
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`# 自備靜態伺服器 http://127.0.0.1:${PORT}/`);
}

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const r = [];
const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });

const res = await page.evaluate(async () => {
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { LEVELS, LEVEL_ORDER, STARTER_WEAPONS, MECH_INFO } = await imp('js/levels.js');
  const { WEAPONS } = await imp('js/config.js');
  const { save } = await imp('js/save.js');
  const g = window.game;
  const out = {};

  // 資料：每把基礎武器恰好由「起始」或「一張關卡」取得一次
  const base = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].isEvo);
  const rewards = LEVEL_ORDER.map((id) => LEVELS[id].rewardWeapon).filter(Boolean);
  const sources = [...STARTER_WEAPONS, ...rewards];
  out.base = base;
  out.coverage = base.every((id) => sources.filter((s) => s === id).length === 1) && sources.length === base.length;
  out.mechsKnown = LEVEL_ORDER.every((id) => (LEVELS[id].mechs || []).every((m) => MECH_INFO[m.type]));

  // 新玩家：升級卡的新武器只會是起始武器
  g.ui.startScreen.classList.add('hidden');
  g.modeId = 'survivor';
  g.levelId = 'street';
  g.start();
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    for (const o of g.ui.generateUpgradeOptions(g.weaponManager, null, null)) if (o.type === 'weapon_new') seen.add(o.id);
  }
  out.freshNew = [...seen];

  // 通關第一關 → 解鎖火箭，結算回報新武器
  const rec = save.recordRun('street', { time: 480, kills: 100, level: 10, cleared: true, nextLevel: 'lab', modeId: 'survivor' });
  out.unlockedWeapon = rec.unlockedWeapon;
  const rec2 = save.recordRun('street', { time: 480, kills: 100, level: 10, cleared: true, nextLevel: 'lab', modeId: 'defense' });
  out.secondClear = rec2.unlockedWeapon;   // 另一個模式再通關一次不重複發
  g.start();
  seen.clear();
  for (let i = 0; i < 300; i++) {
    for (const o of g.ui.generateUpgradeOptions(g.weaponManager, null, null)) if (o.type === 'weapon_new') seen.add(o.id);
  }
  out.afterNew = [...seen];

  // 每日挑戰：全武器開放
  g.start(true);
  out.dailyPool = g.weaponManager.weaponPool;

  // 選關卡片：獎勵與地形標籤
  g.ui.buildLevelSelect(LEVELS, LEVEL_ORDER, save, () => {}, 'street');
  const card = document.querySelector('.level-card');
  out.cardReward = card.querySelector('.level-reward')?.textContent;
  out.cardMechs = [...card.querySelectorAll('.level-mech')].map((e) => e.textContent);

  // 小地圖：放各種地形與事件，確認每種都進圖例
  g.start();
  g.state = 'PLAYING';
  g.hazards.length = 0;
  for (const type of ['pool', 'tar', 'gale', 'spring', 'mine']) {
    const m = { type, radius: 100, dur: 30, fuse: 30, color: '#7dff8f' };
    (await imp('js/systems/Hazards.js')).placeHazard(g, m, g.player.x + 200 + Math.random() * 300, g.player.y - 300 + Math.random() * 600);
  }
  g.extractionWell = { x: g.player.x + 5000, y: g.player.y, radius: 75, holdTime: 0, requiredTime: 4, life: 25, active: true };
  g.merchant = { x: g.player.x - 400, y: g.player.y + 200, timer: 25, items: [], interactDist: 80 };
  let legend = null;
  const orig = g._drawMinimapLegend.bind(g);
  g._drawMinimapLegend = (lg, ...a) => { legend = [...lg.values()]; return orig(lg, ...a); };
  g.render();
  out.legend = legend;
  return out;
});

ok('每把基礎武器 = 起始 + 關卡獎勵，不重複（動態：2 起始 + 各關 rewardWeapon）',
  res.coverage, `${res.base.length} 把基礎武器`);
ok('所有關卡機制都有圖示名稱', res.mechsKnown, '');
ok('新玩家新武器卡只有起始武器', res.freshNew.every((id) => ['kunai', 'guardian'].includes(id)), res.freshNew.join(','));
ok('通關第一關解鎖高爆火箭', res.unlockedWeapon === 'rocket', res.unlockedWeapon);
ok('重複通關不重複回報', res.secondClear === null, res.secondClear);
ok('解鎖後火箭進入卡池', res.afterNew.includes('rocket') && !res.afterNew.includes('molotov'), res.afterNew.join(','));
ok('每日挑戰全武器開放', res.dailyPool === null, res.dailyPool);
ok('選關卡片顯示過關獎勵', /火箭/.test(res.cardReward || ''), res.cardReward);
ok('選關卡片逐項列出地形', res.cardMechs.length === 2, res.cardMechs.join(' / '));
const want = ['腐蝕毒池', '焦油泥沼', '疾風帶', '回復泉', '地雷', '撤離井', '流浪商人'];
ok('小地圖圖例逐項列出地形與事件', res.legend && want.every((n) => res.legend.includes(n)), (res.legend || []).join(','));
ok('沒有頁面錯誤', pageErrors.length === 0, pageErrors.join(' | '));

if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
if (server) server.kill();
let fail = 0;
for (const t of r) { console.log(`${t.pass ? '✅' : '❌'} ${t.name}${t.detail ? ` — ${t.detail}` : ''}`); if (!t.pass) fail++; }
console.log(`${r.length - fail}/${r.length} passed`);
process.exit(fail ? 1 : 0);
