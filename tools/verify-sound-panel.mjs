// 局內音量面板回歸驗證（v115）。
//
// 為什麼需要：玩家要求「局內音樂調大、音效調小，而且點喇叭要能分別拉兩條滑桿」。
// 這種東西壞掉不會有錯誤訊息 —— 面板不開、拉了沒存、兩邊數字不同步，畫面看起來都正常。
// 這裡用真的瀏覽器點真的按鈕，把「開了沒、有沒有存、兩邊有沒有同步、混音基準對不對」量出來。
//
// 用法：
//   python3 -m http.server 8899 -s        # 專案根目錄
//   node tools/verify-sound-panel.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright (PW_MODULE 可指向絕對路徑)。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: String(detail) });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

// 1) 全新存檔的預設混音：音樂 100 / 音效 70
const fresh = await page.evaluate(async () => {
  localStorage.clear();
  const { save } = await import('/js/save.js');
  save.load();
  return save.data.settings;
});
ok('新存檔預設是音樂 100 / 音效 70', fresh.bgm === 1 && fresh.sfx === 0.7, `bgm=${fresh.bgm} sfx=${fresh.sfx}`);

// 2) 舊存檔（從沒動過滑桿）會被搬到新預設，自己調過的不動
const migrated = await page.evaluate(async () => {
  const out = {};
  const put = (settings) => {
    localStorage.setItem('gaga_save', JSON.stringify({ settings }));
    return settings;
  };
  const { save } = await import('/js/save.js');
  put({ sfx: 1, bgm: 0.8 });
  save.load();
  out.untouched = { sfx: save.data.settings.sfx, bgm: save.data.settings.bgm };
  put({ sfx: 0.4, bgm: 0.55 });
  save.load();
  out.tuned = { sfx: save.data.settings.sfx, bgm: save.data.settings.bgm };
  // 遷移只做一次：把新存檔再寫回 100/80，重載後不該再被搬走
  localStorage.setItem('gaga_save', JSON.stringify({ settings: { sfx: 1, bgm: 0.8, mixV2: true } }));
  save.load();
  out.afterFlag = { sfx: save.data.settings.sfx, bgm: save.data.settings.bgm };
  localStorage.clear();
  return out;
});
ok('舊預設 (100/80) 自動搬到新預設 (70/100)',
  migrated.untouched.sfx === 0.7 && migrated.untouched.bgm === 1, JSON.stringify(migrated.untouched));
ok('玩家自己調過的值不被覆蓋',
  migrated.tuned.sfx === 0.4 && migrated.tuned.bgm === 0.55, JSON.stringify(migrated.tuned));
ok('遷移只做一次（調回 100/80 不會再被搬）',
  migrated.afterFlag.sfx === 1 && migrated.afterFlag.bgm === 0.8, JSON.stringify(migrated.afterFlag));

// 3) 混音基準：BGM 匯流排要比 SFX 匯流排大（音樂調大、音效調小的實際落點）
const gains = await page.evaluate(async () => {
  const { sound } = await import('/js/audio.js');
  sound.ctx = null; sound.master = null; sound.sfxGain = null; sound.bgmGain = null;
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  sound.init(ctx);
  sound.setVolumes(1, 1);
  return { sfx: sound.sfxGain.gain.value, bgm: sound.bgmGain.gain.value };
});
ok('BGM 匯流排基準比 SFX 大 (0.45 > 0.12)',
  Math.abs(gains.bgm - 0.45) < 1e-6 && Math.abs(gains.sfx - 0.12) < 1e-6, JSON.stringify(gains));

// 4) 進遊戲、點喇叭：面板要開、兩條滑桿要在、值要跟存檔一致
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);
await page.evaluate(async () => {
  localStorage.clear();
  const { save } = await import('/js/save.js');
  save.load();
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  g.start();
});
await page.waitForTimeout(400);

const closed = await page.evaluate(() => document.getElementById('sound-menu').classList.contains('hidden'));
ok('面板一開始是收起的', closed, `hidden=${closed}`);

await page.click('#btn-sound');
await page.waitForTimeout(200);
const opened = await page.evaluate(() => {
  const menu = document.getElementById('sound-menu');
  const r = menu.getBoundingClientRect();
  const btn = document.getElementById('btn-sound').getBoundingClientRect();
  const bars = ['ingame-bgm-vol', 'ingame-sfx-vol'].map((id) => {
    const el = document.getElementById(id);
    const b = el.getBoundingClientRect();
    return { id, type: el.type, value: el.value, w: Math.round(b.width), visible: b.width > 20 && b.height > 0 };
  });
  const style = getComputedStyle(menu);
  const inView = r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  return { hidden: menu.classList.contains('hidden'), bars, style: style.display, inView, r: { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }, btn: { r: Math.round(btn.right), b: Math.round(btn.bottom) } };
});
ok('點喇叭後面板展開', !opened.hidden && opened.style !== 'none', `hidden=${opened.hidden} display=${opened.style}`);
ok('面板裡有音樂／音效兩條 range 滑桿，且都畫得出來',
  opened.bars.length === 2 && opened.bars.every((b) => b.type === 'range' && b.visible),
  JSON.stringify(opened.bars));
ok('滑桿初值 = 存檔值 (音樂 100 / 音效 70)',
  opened.bars[0].value === '100' && opened.bars[1].value === '70', opened.bars.map((b) => b.value).join('/'));
ok('面板完整落在畫面內、貼在喇叭按鈕下方',
  opened.inView && opened.r.t >= opened.btn.b, JSON.stringify({ r: opened.r, btn: opened.btn }));

await page.screenshot({ path: '/tmp/gaga-sound-panel-desktop.png' });

// 5) 拉滑桿：存檔、音訊匯流排、主選單滑桿三邊要同步
const dragged = await page.evaluate(() => {
  const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('ingame-bgm-vol', 40);
  set('ingame-sfx-vol', 25);
  return null;
});
void dragged;
const synced = await page.evaluate(async () => {
  const { save } = await import('/js/save.js');
  const { sound } = await import('/js/audio.js');
  return {
    saved: { sfx: save.data.settings.sfx, bgm: save.data.settings.bgm },
    bus: { sfx: +sound.sfxGain.gain.value.toFixed(4), bgm: +sound.bgmGain.gain.value.toFixed(4) },
    menuSliders: {
      sfx: document.getElementById('sfx-vol').value,
      bgm: document.getElementById('bgm-vol').value,
    },
    readouts: {
      sfx: document.getElementById('ingame-sfx-val').textContent,
      bgm: document.getElementById('ingame-bgm-val').textContent,
    },
    autoPocket: save.data.settings.autoPocket,
  };
});
ok('拉局內滑桿會寫進存檔', synced.saved.sfx === 0.25 && synced.saved.bgm === 0.4, JSON.stringify(synced.saved));
ok('音訊匯流排跟著變 (0.25×0.12 / 0.4×0.45)',
  Math.abs(synced.bus.sfx - 0.03) < 0.002 && Math.abs(synced.bus.bgm - 0.18) < 0.002, JSON.stringify(synced.bus));
ok('主選單兩條滑桿同步顯示同一組數字',
  synced.menuSliders.sfx === '25' && synced.menuSliders.bgm === '40', JSON.stringify(synced.menuSliders));
ok('數字讀數跟著更新', synced.readouts.sfx === '25' && synced.readouts.bgm === '40', JSON.stringify(synced.readouts));
ok('調音量不會洗掉 settings 其他欄位 (autoPocket)', synced.autoPocket === true, String(synced.autoPocket));

// 6) 靜音鈕：圖示與面板文字要反映狀態，而且面板不能自己關掉
await page.click('#btn-sound-mute');
await page.waitForTimeout(120);
const muted = await page.evaluate(async () => {
  const { sound } = await import('/js/audio.js');
  return {
    enabled: sound.enabled,
    icon: document.getElementById('btn-sound').textContent,
    label: document.getElementById('btn-sound-mute').textContent,
    menuStillOpen: !document.getElementById('sound-menu').classList.contains('hidden'),
    bgmBus: +sound.bgmGain.gain.value.toFixed(4),
    sfxBus: +sound.sfxGain.gain.value.toFixed(4),
  };
});
ok('靜音鈕把音訊關掉且圖示變 🔇',
  muted.enabled === false && muted.icon === '🔇' && muted.bgmBus === 0 && muted.sfxBus === 0,
  JSON.stringify(muted));
ok('靜音後面板還開著（可以馬上再開回來）', muted.menuStillOpen && muted.label.includes('取消靜音'),
  `${muted.menuStillOpen} / ${muted.label}`);
await page.click('#btn-sound-mute');
await page.waitForTimeout(120);

// 7) 點畫面其他地方 / Esc 要收起來
await page.mouse.click(450, 640);
await page.waitForTimeout(150);
const closedByOutside = await page.evaluate(() => document.getElementById('sound-menu').classList.contains('hidden'));
ok('點面板外會收起面板', closedByOutside, `hidden=${closedByOutside}`);
await page.click('#btn-sound');
await page.waitForTimeout(120);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const closedByEsc = await page.evaluate(() => document.getElementById('sound-menu').classList.contains('hidden'));
ok('Esc 會收起面板', closedByEsc, `hidden=${closedByEsc}`);

// 8) 手機尺寸：面板同樣要在畫面內、按鈕仍可點
const mobile = await (await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage();
const mobileErrs = [];
mobile.on('pageerror', (e) => mobileErrs.push(e.message));
await mobile.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await mobile.waitForFunction(() => window.game);
await mobile.evaluate(async () => {
  localStorage.clear();
  const { save } = await import('/js/save.js');
  save.load();
  window.game.ui.startScreen.classList.add('hidden');
  window.game.start();
});
await mobile.waitForTimeout(400);
await mobile.click('#btn-sound');
await mobile.waitForTimeout(200);
const m = await mobile.evaluate(() => {
  const menu = document.getElementById('sound-menu');
  const r = menu.getBoundingClientRect();
  return {
    hidden: menu.classList.contains('hidden'),
    inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight,
    r: { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width) },
    barW: Math.round(document.getElementById('ingame-bgm-vol').getBoundingClientRect().width),
  };
});
ok('手機尺寸：面板展開且在畫面內', !m.hidden && m.inView, JSON.stringify(m));
await mobile.screenshot({ path: '/tmp/gaga-sound-panel-mobile.png' });

ok('沒有 JS 例外', errs.length === 0 && mobileErrs.length === 0, [...errs, ...mobileErrs].join(' | ') || 'none');

await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  [${r.detail}]`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
