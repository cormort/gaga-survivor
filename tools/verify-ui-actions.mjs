// HUD 動作按鈕的點擊驗證。
//
// 為什麼要這支：模組化把方法搬到 systems/*.js 之後，模組內的 `this` 不再是 Game。
// 我漏改了 12 處 `foo(this, …)`（設施按鈕/快捷鍵/僱傭/祝福 apply/Turret.update），
// 結果是「按了沒反應」—— 而 smoke-branches 與 verify-review-fixes 都是直接呼叫函式，
// **不會去點 UI**，所以全綠也擋不住。這支把每個 HUD 動作按鈕真的點一次，並斷言
// 有可觀察的效果（設施數量、金幣、傭兵數量…），而不是只看「有沒有拋例外」。
//
// 用法：
//   npx http-server -p 8899 -s        # 另一個終端機，專案根目錄
//   node tools/verify-ui-actions.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright（PW_MODULE 可指向絕對路徑）。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0].slice(0, 120)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

const results = await page.evaluate(async () => {
  // 匯入路徑一律用 new URL(…, document.baseURI)：本機是 "/"、GitHub Pages 是
  // "/gaga-survivor/"，寫死絕對路徑在線上會 404（實測踩過）。
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });
  const g = window.game;

  // 用「同時開放砲塔與傭兵」的模式（守塔）。注意：生存者模式也開放砲塔，
  // 所以不能只用 turrets 找 —— 要連 mercs 一起看，否則僱傭測試會拿到正確的拒絕
  // 而被誤判成失敗（實測踩過）。
  const { MODES } = await import(new URL('js/modes.js', document.baseURI).href);
  const defenseId = Object.keys(MODES).find((k) => MODES[k].turrets && MODES[k].mercs)
    || Object.keys(MODES).find((k) => MODES[k].turrets) || 'defense';
  g.modeId = defenseId;
  g.ui.startScreen.classList.add('hidden');
  g.start();
  g.gameTime = 30;

  // 每次子測試前把場上設施清空、玩家放到固定點：守塔模式開局有預置砲台，
  // 而各設施的 minSpacing（40~85）會讓「隨機放玩家」偶爾撞到間距限制 ——
  // 那是正確行為，但會讓測試誤判成失敗（實測踩過）。
  const { updateFacilityHUD } = await import(new URL('js/systems/Facilities.js', document.baseURI).href);
  const reset = (gold = 99999) => {
    g.turrets = [];
    g.mercenaries = [];
    g.gold = gold;
    g.player.x = 0;
    g.player.y = 0;
    // 真實遊玩時 HUD 每幀都會刷新（按鈕的 disabled/affordable 隨金幣變動），
    // 但測試是「設完金幣就立刻點」—— 少了這行，按鈕還停留在上一刻的 disabled，
    // el.click() 對 disabled 按鈕完全無效，症狀是「點了沒反應又沒有任何訊息」（實測踩過）。
    updateFacilityHUD(g);
    // 僱傭鈕的啟用狀態由主迴圈的 HUD 更新負責（updateFacilityHUD 只顧建造鈕），
    // 這裡呼叫遊戲自己的那一行，讓按鈕狀態跟上金幣。
    g.ui.updateHireBtn?.(g.mercCost, g.gold >= g.mercCost);
  };
  // 攔下 ui.say，失敗時把遊戲給的拒絕理由一起印出來（讓失敗自己解釋自己）
  let said = [];
  const origSay = g.ui.say.bind(g.ui);
  g.ui.say = (text, color, dur) => { said.push(String(text).slice(0, 50)); return origSay(text, color, dur); };

  const click = (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.click();
    return true;
  };
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  // 金幣給足，並把玩家移開以免撞到 minSpacing
  const armPlayer = (x, y, gold = 99999) => { g.gold = gold; g.player.x = x; g.player.y = y; };

  // 1) 四顆設施按鈕：按下去進入放置預覽（32540cc 起的兩段式建造），再點地圖確認，
  //    必須真的蓋出東西並扣錢。舊版這裡斷言「按一下就蓋好」，放置預覽上線後就一直是紅燈。
  // 在地圖上點一下：跟玩家一樣，對畫布送 pointerdown（Menu.js 的放置確認走這條）
  const tapCanvas = (sx, sy) => g.canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: sx, clientY: sy, bubbles: true }));
  const facilities = [
    ['btn-build', 'turret', '機槍砲台'],
    ['btn-build-grid', 'electric_grid', '高壓電網'],
    ['btn-build-purifier', 'purifier', '淨化裝置'],
    ['btn-build-barricade', 'barricade', '反傷拒馬'],
  ];
  for (const [domId, type, label] of facilities) {
    reset();
    said = [];
    const before = g.turrets.length;
    const goldBefore = g.gold;
    const clicked = click(domId);
    const previewing = g.placement && g.placement.type === type;
    if (previewing) tapCanvas(g.placement.screenX, g.placement.screenY);
    const added = g.turrets.length - before;
    ok(`設施按鈕【${label}】進入放置預覽，點地圖確認後蓋出設施並扣金幣`,
      clicked && previewing && added === 1 && g.gold < goldBefore && !g.placement,
      `clicked=${clicked} 預覽=${previewing} 新增=${added} 金幣 ${goldBefore}→${g.gold}${said.length ? ' 遊戲說：' + said.join(' / ') : ''}`);
  }

  // 2) 鍵盤 1/2/3/4 進入放置預覽，B 確認（另一條確認路徑）
  for (const [k, type, label] of [['1', 'turret', '機槍砲台'], ['2', 'electric_grid', '高壓電網'], ['3', 'purifier', '淨化裝置'], ['4', 'barricade', '反傷拒馬']]) {
    reset();
    said = [];
    const before = g.turrets.length;
    key(k);
    const previewing = g.placement && g.placement.type === type;
    key('b');
    ok(`快捷鍵【${k}】${label} 進入預覽，B 確認後蓋出`, previewing && g.turrets.length > before,
      `預覽=${previewing} 新增 ${g.turrets.length - before} 座${said.length ? ' 遊戲說：' + said.join(' / ') : ''}`);
  }

  // 3) 僱傭按鈕
  {
    reset();
    said = [];
    const before = g.mercenaries.length;
    const gold0 = g.gold;
    click('btn-hire');
    // 僱傭會先跳出三選一選單（遊戲暫停、還沒扣錢），選了才出場
    const picks = document.querySelectorAll('#merc-list button');
    ok('僱傭按鈕開出三名候選弟子', !document.getElementById('merc-modal').classList.contains('hidden')
      && picks.length === 3 && g.state === 'MERC_MODAL' && g.gold === gold0,
      `候選=${picks.length} state=${g.state} gold ${gold0}→${g.gold}`);
    const pickedName = picks[1]?.closest('.slot-row').querySelector('b').textContent;
    picks[1]?.click();
    ok('選中的弟子出場（名字一致、選單關閉、回到遊戲）',
      g.mercenaries[0]?.name === pickedName && g.state === 'PLAYING'
      && document.getElementById('merc-modal').classList.contains('hidden'),
      `選=${pickedName} 出場=${g.mercenaries[0]?.name} state=${g.state}`);
    ok('僱傭按鈕會增加傭兵', g.mercenaries.length > before,
      `${before} → ${g.mercenaries.length}｜state=${g.state} mercs=${g.mode.mercs} gold=${g.gold} `
      + `cost=${g.mercCost} 按鈕disabled=${document.getElementById('btn-hire')?.disabled}` 
      + (said.length ? ' 遊戲說：' + said.join(' / ') : '（沒有任何訊息）'));
  }

  // 4) 翻滾按鈕
  {
    g.player.dashTimer = 0;
    g.player.dashTimeLeft = 0;
    click('btn-dash');
    ok('翻滾按鈕會啟動翻滾', g.player.dashTimeLeft > 0, `dashTimeLeft=${g.player.dashTimeLeft.toFixed(2)}`);
  }

  // 5) 整段操作都不該有未捕捉例外（舊版的 this=undefined 就是在這裡爆掉的）
  g.ui.say = origSay;   // 還原

  return out;
});

let pass = 0;
let fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log(`PASS  ${r.name}  [${r.detail}]`); }
  else { fail++; console.log(`FAIL  ${r.name}  [${r.detail}]`); }
}
// 未捕捉例外一律視為失敗：這個 bug 的症狀就是 TypeError + 畫面毫無反應
if (pageErrors.length) {
  fail++;
  console.log(`FAIL  HUD 操作期間沒有未捕捉例外  [${pageErrors.slice(0, 3).join(' | ')}]`);
} else {
  pass++;
  console.log('PASS  HUD 操作期間沒有未捕捉例外  [0 筆]');
}
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
