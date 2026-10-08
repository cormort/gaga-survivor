// 升級卡數值差／超武距離、死亡結算、壞存檔備份的回歸檢查。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-feedback.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));

// 壞存檔：先寫入一段不能 parse 的字串，重載後應該備份到 _corrupt_backup
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('gaga_save', '{broken'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const out = await page.evaluate(() => {
  const r = [];
  const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });
  ok('壞存檔原文備份', localStorage.getItem('gaga_save_corrupt_backup') === '{broken', localStorage.getItem('gaga_save_corrupt_backup'));

  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  g.start();
  const wm = g.weaponManager;
  const [wid] = [...wm.weapons.keys()];
  // 三選一是隨機抽樣：抽到持有武器的升級卡為止
  let up;
  for (let i = 0; i < 200 && !up; i++) up = g.ui.generateUpgradeOptions(wm).find((o) => o.type === 'weapon_upgrade' && o.id === wid);

  // 卡面必須說得出「具體變化」或「這是滿級」——不能是「效果提升」這種等於沒說的罐頭文字。
  // 不能只認「傷害 +N」：12 把武器沒有 damageGrowth（苦無、火箭、閃電、獵槍…），
  // 它們的升級靠發射數／冷卻／範圍／換彈秒數呈現。
  const hasNumbers = !!up && (
    /傷害 \+\d+/.test(up.description)
    || /(冷卻|換彈秒數) -?[\d.]+s/.test(up.description)
    || /(發射數|數量|穿透|範圍|爆炸半徑|落雷數|彈跳|飛行時間|光束寬) [\d.]+→[\d.]+/.test(up.description)
    || /滿級 LV \d+（此為最後一級）/.test(up.description)
  );
  ok('武器升級卡有實際數值', hasNumbers, up?.description);
  ok('武器升級卡有超武距離', up && /超武【.+】：武器差 4 級/.test(up.description), up?.description);

  // 死亡結算：同一來源打兩次、最後一擊換來源
  g.player.invulnerableTimer = 0; g.player.takeDamage(5, '甲');
  g.player.invulnerableTimer = 0; g.player.takeDamage(5, '甲');
  g.player.invulnerableTimer = 0; g.player.takeDamage(3, '乙');
  const recap = g.deathRecap();
  ok('死亡結算：最後一擊與承受最多', /最後傷害：乙 \d+/.test(recap) && /承受最多：甲 \d+/.test(recap), recap);
  g.handleGameOver(false);
  const el = document.getElementById('death-recap');
  ok('結算畫面顯示死亡原因', !el.classList.contains('hidden') && el.textContent === recap, el.textContent);
  return r;
});

let fail = 0;
for (const t of out) { if (!t.pass) fail++; console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`); }
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${out.length - (fail - (pageErrors.length ? 1 : 0))} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
