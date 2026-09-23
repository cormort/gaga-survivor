// 特工等級：成本、上限、資源不足、未解鎖、「全部升」，以及局內基礎數值真的吃到 (且只對該特工)。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-char-level.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const out = await page.evaluate(async () => {
  const r = [];
  const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { save } = await imp('js/save.js');
  const { CHAR_LEVEL, charLevelCost } = await imp('js/meta.js');
  const g = window.game;

  ok('新存檔特工 Lv1', save.charLevel('duck') === 1, save.charLevel('duck'));
  save.data.gold = 100; save.data.dna = 100;
  let res = save.levelUpChar('duck');
  ok('金幣不足時拒絕且不扣錢', !res.ok && save.data.gold === 100 && save.data.dna === 100, res.reason);
  save.data.gold = 1000; save.data.dna = 5;
  res = save.levelUpChar('duck');
  ok('DNA 不足時拒絕 (兩種都要夠)', !res.ok && save.data.gold === 1000, res.reason);
  res = save.levelUpChar('penguin');
  ok('未解鎖特工不能升級', !res.ok, res.reason);

  const c1 = charLevelCost(1);
  save.data.gold = c1.gold; save.data.dna = c1.dna;
  res = save.levelUpChar('duck');
  ok(`Lv1→2 花 ${c1.gold}🪙 + ${c1.dna}🧬（剛好花光）`, res.ok && save.charLevel('duck') === 2 && save.data.gold === 0 && save.data.dna === 0, JSON.stringify(res));

  // 成本指數成長：每一級的金幣與 DNA 對前一級的比值都落在同一個倍率附近（取整誤差內），
  // 而不是線性的「每級 +固定值」（線性時比值會一路往 1 收斂）
  const ratios = [];
  for (let l = 2; l < CHAR_LEVEL.max; l++) ratios.push(charLevelCost(l).gold / charLevelCost(l - 1).gold);
  const late = charLevelCost(CHAR_LEVEL.max - 1).gold / charLevelCost(CHAR_LEVEL.max - 2).gold;
  ok('升級成本指數成長（逐級比值穩定 > 1.1，後段不收斂）',
    ratios.every((x) => x > 1.1) && late > 1.1,
    `Lv1 ${c1.gold}🪙/${c1.dna}🧬 → Lv${CHAR_LEVEL.max - 1} ${charLevelCost(CHAR_LEVEL.max - 1).gold}🪙/${charLevelCost(CHAR_LEVEL.max - 1).dna}🧬，末段比值 ${late.toFixed(3)}`);

  save.data.gold = 1e7; save.data.dna = 1e6;
  res = save.levelUpChar('duck', Infinity);
  const spentGold = 1e7 - save.data.gold;
  let expect = 0; for (let l = 2; l < CHAR_LEVEL.max; l++) expect += charLevelCost(l).gold;
  ok('全部升：到上限 30 停、花費等於逐級加總', res.ok && save.charLevel('duck') === 30 && spentGold === expect, `Lv ${save.charLevel('duck')} 花 ${spentGold} / 期望 ${expect}`);
  res = save.levelUpChar('duck');
  ok('滿級後拒絕', !res.ok, res.reason);

  save.data.gold = charLevelCost(1).gold + charLevelCost(2).gold + 50; save.data.dna = 1e6;
  save.data.unlockedChars.push('rabbit');
  res = save.levelUpChar('rabbit', Infinity);
  ok('全部升：錢不夠就停在能負擔的等級', res.ok && save.charLevel('rabbit') === 3 && save.data.gold === 50, `Lv ${save.charLevel('rabbit')} 剩 ${save.data.gold}`);

  // 局內：鴨鴨 Lv30 → 生命 +290、傷害 +116%、減傷 +17.4%；兔子 Lv3 只吃 +20 / +8%
  const runWith = (id) => {
    g.characterId = id;
    g.ui.startScreen.classList.add('hidden');
    g.start();
    return { hp: g.player.maxHp, cur: g.player.hp, dmg: g.player.damageMultiplier, armor: g.player.metaArmor };
  };
  save.data.charLevels = {};
  const base = runWith('duck');
  save.data.charLevels = { duck: 30, rabbit: 3 };
  const duck = runWith('duck');
  ok('Lv30 生命上限 +290 且開局滿血', duck.hp - base.hp === 290 && duck.cur === duck.hp, `${base.hp} → ${duck.hp}，目前 ${duck.cur}`);
  ok('Lv30 傷害倍率 +1.16', Math.abs(duck.dmg - base.dmg - 1.16) < 1e-9, `${base.dmg} → ${duck.dmg}`);
  ok('Lv30 減傷 +17.4%', Math.abs(duck.armor - base.armor - 0.174) < 1e-9, `${base.armor} → ${duck.armor}`);
  save.data.charLevels = {};
  const rBase = runWith('rabbit');
  save.data.charLevels = { duck: 30, rabbit: 3 };
  const rabbit = runWith('rabbit');
  ok('等級只對該特工生效 (兔子 Lv3 只 +20 生命)', rabbit.hp - rBase.hp === 20, `${rBase.hp} → ${rabbit.hp}`);

  // 存檔往返
  save.flush(); save.load();
  ok('等級寫進存檔、重載後保留', save.charLevel('duck') === 30 && save.charLevel('rabbit') === 3, JSON.stringify(save.data.charLevels));
  return r;
});

let fail = out.filter((t) => !t.pass).length;
for (const t of out) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${out.length - out.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
