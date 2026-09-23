// 操作便利性三件事：升級卡封印／跳過、暫停面板（目前構築）、顯示設定（傷害數字／震動／閃光）。
// 全部走真的 DOM 點擊，斷言可觀察的效果（卡池、金幣、狀態、跳字數量、存檔），不是只看有沒有拋例外。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-qol.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const r = [];
const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });

// ── 1) 升級卡：封印 ────────────────────────────────────────────────
const ban = await page.evaluate(async () => {
  const { upgradeKeyOf, isBanishable } = await import(new URL('js/meta.js', document.baseURI).href);
  const { GAME_CONFIG } = await import(new URL('js/config.js', document.baseURI).href);
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  g.start();
  g.pendingLevelUps = 0;
  g.triggerLevelUp();
  const out = { cfg: GAME_CONFIG.BANISH_PER_RUN, left0: g.banishesLeft, state0: g.state };
  const cards = [...document.querySelectorAll('#upgrade-cards .upgrade-card')];
  const withBtn = cards.filter((c) => c.querySelector('.card-banish'));
  out.cards0 = cards.length;
  out.btns0 = withBtn.length;
  const target = g._shownUpgradeOpts.find(isBanishable);
  const idx = g._shownUpgradeOpts.indexOf(target);
  const others = g._shownUpgradeOpts.filter((o) => o !== target).map(upgradeKeyOf);
  cards[idx].querySelector('.card-banish').click();
  out.targetId = target.id;
  out.state1 = g.state;
  out.left1 = g.banishesLeft;
  out.banished = [...g.banished];
  out.after = g._shownUpgradeOpts.map((o) => o.id || o.type);
  out.keptOthers = others.every((k) => g._shownUpgradeOpts.some((o) => upgradeKeyOf(o) === k));
  out.cards1 = document.querySelectorAll('#upgrade-cards .upgrade-card').length;
  out.modalOpen = !document.getElementById('level-up-modal').classList.contains('hidden');
  // 卡池：抽 200 次都不能再出現
  let leaks = 0;
  for (let i = 0; i < 200; i++) {
    if (g.ui.generateUpgradeOptions(g.weaponManager, null, g.banished).some((o) => o.id === target.id && o.type !== 'evo')) leaks++;
  }
  out.leaks = leaks;
  // 用完次數 → 按鈕停用、再呼叫也不動
  g.banishesLeft = 0;
  g.renderUpgradeChoices(g._shownUpgradeOpts, true);
  out.allDisabled = [...document.querySelectorAll('.card-banish')].every((b) => b.disabled);
  const before = g._shownUpgradeOpts.map(upgradeKeyOf).join();
  g.banishUpgrade(g._shownUpgradeOpts.find(isBanishable) || g._shownUpgradeOpts[0]);
  out.noopWhenEmpty = g._shownUpgradeOpts.map(upgradeKeyOf).join() === before && g.banished.size === 1;
  out.info = document.getElementById('banish-info').textContent;
  return out;
});
ok('升級卡上有封印按鈕（每局 3 次）', ban.cfg === 3 && ban.left0 === 3 && ban.btns0 > 0, `卡 ${ban.cards0} 張、封印鈕 ${ban.btns0} 個`);
ok('點封印不會選到那張卡：仍在選卡畫面、次數 -1、進封印名單', ban.state1 === 'LEVEL_UP' && ban.modalOpen && ban.left1 === 2
  && ban.banished.includes(ban.targetId), `${ban.state1} 剩 ${ban.left1}｜封印 ${ban.banished}`);
ok('只換掉被封印的那張，其他兩張保留（不是免費重抽）', ban.keptOthers && !ban.after.includes(ban.targetId),
  `封印 ${ban.targetId} → 現在 ${ban.after.join(',')}（${ban.cards1} 張）`);
ok('被封印的武器／配件本局不再出現在卡池（抽 200 次）', ban.leaks === 0, `出現 ${ban.leaks} 次`);
ok('次數用完：封印鈕全部停用、呼叫也不生效', ban.allDisabled && ban.noopWhenEmpty, ban.info);

// ── 2) 升級卡：跳過 ────────────────────────────────────────────────
const skip = await page.evaluate(async () => {
  const { GAME_CONFIG } = await import(new URL('js/config.js', document.baseURI).href);
  const g = window.game;
  g.start();
  const out = { cfg: GAME_CONFIG.SKIP_PER_RUN };
  const weaponsBefore = JSON.stringify([...g.weaponManager.weapons].map(([id, it]) => [id, it.level]));
  g.gold = 100;
  g.pendingLevelUps = 2;       // triggerLevelUp 會先扣 1：跳過這一輪之後還剩一級 → 要接著開下一輪
  g.triggerLevelUp();
  const btn = document.getElementById('btn-skip-upgrade');
  out.btnText = btn.textContent;
  btn.click();
  out.gold1 = g.gold;
  out.state1 = g.state;
  out.left1 = g.skipsLeft;
  out.chained = !document.getElementById('level-up-modal').classList.contains('hidden');
  btn.click();
  out.state2 = g.state;
  out.left2 = g.skipsLeft;
  out.weaponsSame = JSON.stringify([...g.weaponManager.weapons].map(([id, it]) => [id, it.level])) === weaponsBefore;
  g.skipsLeft = 0;
  g.pendingLevelUps = 0;
  g.triggerLevelUp();
  out.disabled = btn.disabled;
  btn.click();
  out.stateAfterDisabled = g.state;
  // 新的一局：次數與封印名單重置
  g.banished.add('kunai');
  g.start();
  out.reset = g.skipsLeft === GAME_CONFIG.SKIP_PER_RUN && g.banishesLeft === GAME_CONFIG.BANISH_PER_RUN && g.banished.size === 0;
  return out;
});
ok('跳過：+25 本局金幣、不拿任何升級、次數 -1', skip.gold1 === 125 && skip.left1 === 2 && skip.weaponsSame, `${skip.btnText}｜金幣 ${skip.gold1}`);
ok('跳過後還有待處理的升級 → 接著開下一輪；最後一輪跳過回到戰鬥', skip.state1 === 'LEVEL_UP' && skip.chained
  && skip.state2 === 'PLAYING' && skip.left2 === 1, `${skip.state1} → ${skip.state2}`);
ok('跳過次數用完：按鈕停用、點了也不會離開選卡', skip.disabled && skip.stateAfterDisabled === 'LEVEL_UP', skip.stateAfterDisabled);
ok('新的一局重置封印／跳過次數與封印名單', skip.reset, skip.reset);

// ── 3) 暫停面板 ───────────────────────────────────────────────────
const pause = await page.evaluate(() => {
  const g = window.game;
  g.start();
  g.state = 'PLAYING';
  const wm = g.weaponManager;
  wm.weapons.get('kunai').level = 5;
  wm.addOrUpgradePassive('atk_scroll');
  document.getElementById('btn-pause').click();
  const modal = document.getElementById('pause-modal');
  const text = document.getElementById('pause-build').textContent;
  const out = { state: g.state, open: !modal.classList.contains('hidden'), text };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  out.escState = g.state; out.escClosed = modal.classList.contains('hidden');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
  out.pState = g.state;
  document.getElementById('btn-resume').click();
  out.resumeState = g.state; out.resumeClosed = modal.classList.contains('hidden');
  g.triggerLevelUp();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  out.levelUpState = g.state;           // 選卡中按 Esc 不能被暫停搶走
  return out;
});
ok('暫停開啟面板', pause.state === 'PAUSED' && pause.open, pause.state);
ok('面板列出武器等級、超武配方進度（可合成／缺件）', /特工苦無/.test(pause.text) && /LV 5\/5/.test(pause.text)
  && /幽靈手裏劍/.test(pause.text) && /強力卷軸 1\/5/.test(pause.text), pause.text.slice(0, 160));
ok('面板列出總數值與封印／跳過剩餘次數', /傷害/.test(pause.text) && /暴擊率/.test(pause.text) && /冷卻/.test(pause.text)
  && /封印剩 3 次/.test(pause.text), '');
ok('Esc 繼續、P 暫停、「繼續」按鈕關閉面板', pause.escState === 'PLAYING' && pause.escClosed && pause.pState === 'PAUSED'
  && pause.resumeState === 'PLAYING' && pause.resumeClosed, `${pause.escState}/${pause.pState}/${pause.resumeState}`);
ok('選升級卡時按 Esc 不會切到暫停', pause.levelUpState === 'LEVEL_UP', pause.levelUpState);

// ── 4) 顯示設定 ───────────────────────────────────────────────────
const disp = await page.evaluate(async () => {
  const { save } = await import(new URL('js/save.js', document.baseURI).href);
  const g = window.game;
  const out = { defaults: { ...save.data.settings } };
  const menuSel = () => document.querySelector('#display-settings-menu [data-ds="damageNumbers"]');
  const pauseSel = () => document.querySelector('#display-settings-pause [data-ds="damageNumbers"]');
  const count = () => g.particles.damageTexts.length;
  const emit = () => {
    g.particles.damageTexts.length = 0; g.particles._dtCount = 0; g.particles._dtHead = 0;
    g.particles.createDamageText(0, 0, 123, false, false);      // 一般傷害
    g.particles.createDamageText(0, 0, 456, true, true);        // 真暴擊
    g.particles.createDamageText(0, 0, '+50 HP', false);        // 文字提示
    return count();
  };
  out.all = emit();
  pauseSel().value = 'crit'; pauseSel().dispatchEvent(new Event('change'));
  out.crit = emit();
  out.synced = menuSel().value === 'crit';
  menuSel().value = 'off'; menuSel().dispatchEvent(new Event('change'));
  out.off = emit();
  out.saved = save.data.settings.damageNumbers;

  // 震動：關閉後 render 用的鏡頭不偏移
  let camSeen = null;
  const orig = g.ground.drawFloorGrid.bind(g.ground);
  g.ground.drawFloorGrid = (ctx, lv, cam, ...rest) => { camSeen = { ...cam }; return orig(ctx, lv, cam, ...rest); };
  const shakeBox = document.querySelector('#display-settings-pause [data-ds="screenShake"]');
  g.camera.shake = 40; g.render();
  out.shakeOnMoved = camSeen.x !== g.camera.x || camSeen.y !== g.camera.y;
  shakeBox.checked = false; shakeBox.dispatchEvent(new Event('change'));
  g.camera.shake = 40; g.render();
  out.shakeOffStill = camSeen.x === g.camera.x && camSeen.y === g.camera.y;
  g.ground.drawFloorGrid = orig;

  const flashBox = document.querySelector('#display-settings-menu [data-ds="reduceFlash"]');
  flashBox.checked = true; flashBox.dispatchEvent(new Event('change'));
  out.flash = { ps: g.particles.reduceFlash, mul: g._flashMul };
  out.final = { ...save.data.settings };
  return out;
});
ok('預設：傷害數字全部顯示、震動開、不減閃光', disp.defaults.damageNumbers === 'all' && disp.defaults.screenShake === true
  && disp.defaults.reduceFlash === false, JSON.stringify(disp.defaults));
ok('傷害數字：全部 3 則 → 只顯示暴擊 2 則（暴擊＋文字）→ 關閉 1 則（只剩文字提示）', disp.all === 3 && disp.crit === 2 && disp.off === 1,
  `${disp.all} / ${disp.crit} / ${disp.off}`);
ok('暫停面板與主選單的設定同步、寫進存檔', disp.synced && disp.saved === 'off', `${disp.synced} ${disp.saved}`);
ok('畫面震動：開啟時鏡頭會抖、關閉後完全不抖', disp.shakeOnMoved && disp.shakeOffStill, `${disp.shakeOnMoved} ${disp.shakeOffStill}`);
ok('減少閃光：落雷與 Boss 紅閃降低', disp.flash.ps === true && disp.flash.mul < 1, JSON.stringify(disp.flash));

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);
const reloaded = await page.evaluate(() => ({
  mode: window.game.particles.damageTextMode, shake: window.game._shakeOn, flash: window.game.particles.reduceFlash,
  sel: document.querySelector('#display-settings-menu [data-ds="damageNumbers"]').value,
}));
ok('重新整理後設定保留並套用', reloaded.mode === 'off' && reloaded.shake === false && reloaded.flash === true && reloaded.sel === 'off',
  JSON.stringify(reloaded));

let fail = r.filter((t) => !t.pass).length;
for (const t of r) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${r.length - r.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
