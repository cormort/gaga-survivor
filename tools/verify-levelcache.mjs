// 關卡快取的容量驗證（三條）：
//
//   1. LevelCache 的淘汰順序是 LRU（get 會更新順序，淘汰的是最久沒用的那關）
//   2. 實機連玩 8 關後，三個依關卡累積的快取都停在 LEVEL_CACHE_KEEP 關
//      —— 地表磚（Ground）、宏觀地形層與劣化磚（Terrain）
//   3. 保留下來的關卡仍然命中快取（容量機制沒有變成「每次重烘」）
//
// 為什麼要這支：這三個快取各佔 1~4 MB/關，而且「烘一次很貴所以快取」是刻意的
// 設計。只看程式碼很容易寫出「有淘汰但順序錯了」或「淘汰後重烘導致每次換關都
// 掉幀」的版本 —— 兩者都不會拋例外，只會讓手機變慢或變肥。
//
// 用法：
//   npx http-server -p 8899 -s
//   PW_MODULE=/path/to/playwright node tools/verify-levelcache.mjs
//
// 離開碼 1 表示有項目失敗。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

// ── 1) LevelCache 的 LRU 行為（純邏輯，直接 import 模組） ──
{
  const m = await import(new URL('../js/systems/LevelCache.js', import.meta.url).href);
  const { LevelCache, LEVEL_CACHE_KEEP } = m;

  ok('LEVEL_CACHE_KEEP 為 3', LEVEL_CACHE_KEEP === 3, `實測 ${LEVEL_CACHE_KEEP}`);

  const c = new LevelCache(3);
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  ok('容量內不淘汰', c.size === 3 && c.has('a'), `keys=${c.keys}`);

  c.set('d', 4);
  ok('超過容量淘汰最久未使用的關卡', !c.has('a') && c.size === 3, `keys=${c.keys}`);

  c.get('b');
  c.set('e', 5);
  ok('get 過的關卡不會被淘汰', c.has('b') && !c.has('c'), `keys=${c.keys}`);

  const evicted = [];
  c.onEvict = (id) => evicted.push(id);
  c.set('f', 6);
  ok('淘汰時會通知 onEvict（供釋放資源）', evicted.length === 1, `evicted=${evicted}`);

  const c2 = new LevelCache(1);
  c2.onEvict = () => { throw new Error('boom'); };
  c2.set('a', 1);
  let threw = false;
  try { c2.set('b', 2); } catch (e) { threw = true; }
  ok('onEvict 拋例外不會弄壞快取', !threw && c2.has('b') && c2.size === 1);

  // delete(id)：Ground.js 的 PNG onload 靠它把先前程序化烘出來的磚作廢。
  // 少了這個方法呼叫端會拋 TypeError，而且是在 img.onload 裡 —— 每次載入噴 12 次
  // 未捕捉例外（每張地表 PNG 一次），地表也不會換成高解析度版本。
  const c3 = new LevelCache(3);
  const delEvicted = [];
  c3.onEvict = (id) => delEvicted.push(id);
  c3.set('x', 'proc-tile');
  // 呼叫端要能安全地只問「有沒有這個方法」，所以先擋掉不存在的形況再實際呼叫，
  // 免得驗證腳本本身直接 TypeError 中斷（那就只剩 exit code，看不出是哪條壞了）
  const hasDelete = typeof c3.delete === 'function';
  ok('LevelCache 有 delete(id) 且會通知 onEvict',
    hasDelete && c3.delete('x') === true
    && !c3.has('x') && c3.size === 0 && delEvicted.includes('x'),
    hasDelete ? `has=${c3.has('x')} onEvict=${delEvicted}` : 'delete 不是函式（Ground.js 的 PNG onload 會拋例外）');
  ok('delete 不存在的鍵回 false 且不拋例外',
    hasDelete && c3.delete('never') === false);

  // 契約同步：Ground.js 對 _groundTextures 呼叫的每個方法都必須真的存在。
  // 這條是針對「Map 換成 LevelCache 時漏掉 delete」那類重構而加的 —— 漏掉不會有任何
  // 測試變紅（快取照樣運作），只會在使用者機器上噴未捕捉例外。
  const { readFile: readF } = await import('node:fs/promises');
  const groundSrc = await readF(new URL('../js/systems/Ground.js', import.meta.url), 'utf8');
  const called = [...new Set([...groundSrc.matchAll(/_groundTextures\.(\w+)\s*\(/g)].map((m) => m[1]))];
  const probe = new LevelCache();
  const absent = called.filter((m) => typeof probe[m] !== 'function');
  ok('Ground.js 呼叫的 _groundTextures 方法 LevelCache 都有',
    called.length > 0 && absent.length === 0,
    `呼叫 ${called.join('/')}｜缺少 ${absent.join(',') || '無'}`);
}

// ── 2、3) 實機連玩多關 ──
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0].slice(0, 140)));
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game, null, { timeout: 60000 });

const out = await page.evaluate(async () => {
  // 匯入路徑一律相對 document.baseURI：本機是 "/"、GitHub Pages 是 "/gaga-survivor/"，
  // 寫死開頭斜線在線上會 404（這個 repo 的工具踩過不只一次，verify-art 也有同樣註記）。
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { LEVEL_CACHE_KEEP } = await imp('js/systems/LevelCache.js');
  const { LEVEL_ORDER } = await imp('js/levels.js');
  const { TD_ORDER } = await imp('js/tdlevels.js');
  const { terrainCacheInfo } = await imp('js/systems/Terrain.js');
  const g = window.game;

  // 守塔關卡優先（td_* 可在 defense 模式下玩），再補生存者關卡湊到 8 關
  const ids = [...TD_ORDER, ...LEVEL_ORDER].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
  const rows = [];
  for (const id of ids) {
    g.ui.startScreen.classList.add('hidden');
    g.modeId = 'defense';
    g.levelId = id;
    g.start(false);
    g.render();
    g.render();
    const first = g.ground.getGroundTexture(g.level);
    const second = g.ground.getGroundTexture(g.level);
    const t = terrainCacheInfo();
    rows.push({
      id,
      ground: g.ground._groundTextures.size,
      macro: t.macro.size,
      escalate: t.escalate.size,
      keep: t.macro.keep,
      hit: first === second,
    });
  }
  return { ids, rows, LEVEL_CACHE_KEEP };
});

const maxOf = (k) => Math.max(...out.rows.map((r) => r[k]));
ok('實機連玩 8 關後，地表磚快取不超過 3 關',
  maxOf('ground') <= out.LEVEL_CACHE_KEEP,
  `玩過 ${out.ids.length} 關、最大 ${maxOf('ground')} 關（keep=${out.LEVEL_CACHE_KEEP}）`);
ok('實機連玩 8 關後，宏觀地形層快取不超過 3 關',
  maxOf('macro') <= out.LEVEL_CACHE_KEEP,
  `最大 ${maxOf('macro')} 關`);
ok('實機連玩 8 關後，劣化磚快取不超過 3 關',
  maxOf('escalate') <= out.LEVEL_CACHE_KEEP,
  `最大 ${maxOf('escalate')} 關`);
ok('Terrain 兩個快取的容量與 LEVEL_CACHE_KEEP 同源',
  out.rows.every((r) => r.keep === out.LEVEL_CACHE_KEEP),
  `keep=${out.rows[0] && out.rows[0].keep}`);
ok('保留下來的關卡仍然命中快取（沒有變成每次重烘）',
  out.rows.every((r) => r.hit),
  `${out.rows.filter((r) => r.hit).length}/${out.rows.length} 關命中`);

await browser.close();

ok('驗證期間沒有未捕捉例外', pageErrors.length === 0, pageErrors.length ? pageErrors.join('｜') : '0 筆');

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
