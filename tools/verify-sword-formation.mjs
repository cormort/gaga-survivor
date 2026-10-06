// 劍陣（青霜劍尊 R 技「萬劍歸宗」）的回歸檢查。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-sword-formation.mjs
//
// 為什麼要有這支：這個技能從「一次 300 範圍瞬傷」改成「劍陣持續掃斬」，
// 傷害是拆成 7 次結算的（落地 1.2× ＋ 掃斬 6×0.3×）。改動期間最怕的就是
// 手感變好但數字偷偷跑掉 —— 這裡把「總量維持 3.0×」與「每次結算的倍率」
// 都鎖成契約，順便確認收招後真的清乾淨（不會留著劍陣繼續掃）。
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const out = await page.evaluate(async () => {
  const r = [];
  const ok = (name, pass, detail = '') => r.push({ name, pass: !!pass, detail: String(detail) });
  const { FORMATION, formationTotalMul } = await import('/js/systems/SwordFormation.js');
  const { castSkill, SKILLS, skillsFor } = await import('/js/systems/Skills.js');
  const { enemyScale } = await import('/js/levels.js');

  // ── 契約 ──────────────────────────────────────────────
  ok('傷害總量契約 = 3.0×（舊版 aoe(...,3) 的總量）', Math.abs(formationTotalMul() - 3) < 1e-9, formationTotalMul());
  ok('技能說明寫的是劍陣掃斬', /陣/.test(SKILLS.xian_sword[1].desc) && /掃斬/.test(SKILLS.xian_sword[1].desc), SKILLS.xian_sword[1].desc);
  ok('只有修仙角色有技能（劍陣掛在青霜劍尊身上）', skillsFor('xian_sword')?.length === 2 && skillsFor('duck') === null);

  // ── 開局：選青霜劍尊，站著不動也不會被打死 ─────────────
  const g = window.game;
  g.characterId = 'xian_sword';
  g.ui.startScreen.classList.add('hidden');
  g.start();
  g.triggerLevelUp = () => {};        // 升級彈窗會停掉 update
  g.player.invulnerableTimer = 1e9;
  // 等第一批怪真的生出來（要拿牠們的原型當假敵人的模板，不能自己捏一個空物件）。
  // 實測第一隻在遊戲時間 ~2.2 秒出現，所以這裡給到 5 秒。
  for (let i = 0; i < 300 && !g.enemies.length; i++) g.update(1 / 60);
  ok('場上有敵人可以當模板', g.enemies.length > 0, `敵人 ${g.enemies.length}`);

  // 假敵人：站在玩家正中央、血量極高（範圍傷害一定會命中）
  const proto = g.enemies[0];
  const mkFoe = () => {
    const e = Object.create(Object.getPrototypeOf(proto));
    Object.assign(e, proto);
    e.x = g.player.x;
    e.y = g.player.y;
    e.isDead = false;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.radius = 10;
    return e;
  };
  const foe = mkFoe();
  g.enemies.push(foe);
  const hits = [];
  const origTake = foe.takeDamage.bind(foe);
  foe.takeDamage = (dmg, knock, sx, sy) => { hits.push({ dmg, t: g.gameTime, scale: enemyScale(g.gameTime, g.level, g.rules).hp }); return origTake(dmg, knock, sx, sy); };

  // ── 真的走技能路徑（靈力/冷卻檢查都在裡面）────────────
  g.player.mp = 999;
  g.player.skillCd = [0, 0];
  const mp0 = g.player.mp;
  const casted = castSkill(g, 1);
  ok('castSkill 施放成功、扣 80 靈力、進入 20 秒冷卻',
    casted === true && mp0 - g.player.mp === 80 && g.player.skillCd[1] === SKILLS.xian_sword[1].cd,
    `cast=${casted} mp ${mp0}→${g.player.mp} cd=${g.player.skillCd[1]}`);
  ok('劍陣已建立（落劍階段）', !!g.swordFormation && g.swordFormation.phase === 'drop',
    `phase=${g.swordFormation?.phase} swords=${g.swordFormation?.swords.length}`);
  ok('飛劍數 = FORMATION.swords', g.swordFormation.swords.length === FORMATION.swords, g.swordFormation.swords.length);
  ok('落地一擊已結算（1.2×）',
    hits.length === 1 && Math.abs(hits[0].dmg - Math.round(1.2 * 100 * hits[0].scale)) <= 1,
    `hits=${hits.length} ${hits[0] ? `${hits[0].dmg} vs ${Math.round(1.2 * 100 * hits[0].scale)}` : ''}`);

  // ── 推進模擬：記錄階段順序、每次結算的倍率、劍氣上限 ──
  const phases = [];
  let maxSlashes = 0;
  let swept = hits.length;   // 落地那一擊在 castSkill 裡就結算了，先算進來
  for (let i = 0; i < 200; i++) {          // 200 × 1/60 ≈ 3.3 秒 > 技能總長 2.4 秒
    const f = g.swordFormation;
    if (f) {
      if (phases[phases.length - 1] !== f.phase) phases.push(f.phase);
      maxSlashes = Math.max(maxSlashes, f.slashes.length);
    }
    const before = hits.length;
    g.update(1 / 60);
    if (hits.length > before) swept += hits.length - before;
    if (!g.swordFormation) break;
  }
  ok('階段順序 落劍 → 旋轉 → 歸宗 → 結束', phases.join('→') === 'drop→spin→gather',
    phases.join('→'));
  ok('結算次數 = 落地 1 + 掃斬 6（共 7 次）', swept === FORMATION.ticks + 1, `結算 ${swept} 次`);
  const sweepHits = hits.slice(1);
  const sweepOk = sweepHits.every((h) => Math.abs(h.dmg - Math.round(0.3 * 100 * h.scale)) <= 1);
  ok('每一次掃斬都是 0.3×（不是每幀結算）', sweepOk,
    sweepHits.map((h) => h.dmg).join('/'));
  ok('劍氣同時存在的數量有上限（不會無界累積）', maxSlashes > 0 && maxSlashes <= FORMATION.MAX_SLASHES,
    `峰值 ${maxSlashes} / 上限 ${FORMATION.MAX_SLASHES}`);
  ok('收招後劍陣清乾淨（物件與劍氣都歸零）', g.swordFormation === null,
    `formation=${g.swordFormation}`);

  // ── 跨局重置：開著劍陣直接重開，不能帶進下一局 ─────────
  g.player.mp = 999;
  g.player.skillCd = [0, 0];
  castSkill(g, 1);
  const active = !!g.swordFormation;
  g.start();
  ok('開著劍陣重開新局 → 不會殘留', active && g.swordFormation === null, `施放=${active} 新局=${g.swordFormation}`);

  // ── 視覺：劍氣真的畫在玩家周圍（螢幕中央）──────────────
  // 用「同一塊區域的前後差分」而不是直接數青藍色像素：街道地版本來就是冷色調，
  // 直接數顏色會把整片地板算進去（實測「前」比「中」還多）。
  g.characterId = 'xian_sword';
  g.start();
  g.triggerLevelUp = () => {};
  g.player.invulnerableTimer = 1e9;
  g.player.mp = 999;
  g.player.skillCd = [0, 0];
  const grab = () => {
    g.render();
    const cv = g.ctx.canvas;
    const side = 600;
    return g.ctx.getImageData(Math.round(cv.width / 2 - side / 2), Math.round(cv.height / 2 - side / 2), side, side).data;
  };
  const beforePx = grab();
  castSkill(g, 1);
  for (let i = 0; i < 60; i++) g.update(1 / 60);   // 推到旋轉中段
  const duringPx = grab();
  let tealDelta = 0;
  for (let i = 0; i < duringPx.length; i += 4) {
    const db = duringPx[i + 2] - beforePx[i + 2];
    // 只有「變得更藍、而且藍勝過紅與綠」的像素才算劍氣（敵人移動、地面不變都不算）
    if (db > 25 && duringPx[i + 2] > duringPx[i] + 16 && duringPx[i + 2] >= duringPx[i + 1]) tealDelta++;
  }
  ok('劍陣與劍氣真的畫在畫面上（中央區域新增的青藍像素）', tealDelta > 400, `新增 ${tealDelta} px`);

  return r;
});

let fail = 0;
for (const t of out) { if (!t.pass) fail++; console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`); }
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${out.length - (fail - (pageErrors.length ? 1 : 0))} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
