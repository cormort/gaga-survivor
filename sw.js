// 嘎嘎特攻隊 / Gaga Survivor — Service Worker
//
// 目標：離線可玩 (整個 app shell + 全部 ES module 都預快取)，上線時自動換版。
// 部署在 GitHub Pages 的子路徑 (/gaga-survivor/)，所以這裡全部用相對路徑 —— 一律相對於
// 這支 sw.js 所在的目錄 (也就是站台子路徑根)，寫死開頭斜線會直接 404。
//
// 策略：
//   安裝  → 預快取 app shell (含 js/ 底下每一個模組) 後 skipWaiting()
//   啟用  → 清掉舊版快取 + clients.claim()
//   取用  → 同源 GET 一律「快取優先 + 背景更新」(stale-while-revalidate)，
//           沒命中才走網路並順手寫進 runtime 快取；查詢字串算在快取 key 裡。
//   跨網域 / 非 GET → 完全不攔，原封不動交給瀏覽器。

const CACHE_VERSION = 'gaga-v1';
const SHELL_CACHE = CACHE_VERSION;                  // 預快取的 app shell
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;   // 執行期順手補快取的東西
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

// 離線啟動的入口：manifest 的 start_url 是 ./index.html?source=pwa，
// 導覽請求若查詢字串沒命中，就退回這一頁。
const SHELL_ENTRY = './index.html';

// ── 預快取清單 ──
// js/ 底下每一個 .js 都必須在這裡，少一個模組 = 離線時 import 失敗 = 白畫面。
// 這份清單要和 `find js -name '*.js' | sort` 的結果一致 (tools 有驗證腳本會比對)。
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  // 圖示 (manifest 與 apple-touch-icon 會用到；SVG 是維護用的原始檔)
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  // ES modules：進遊戲前 index.html → js/main.js 會展開整棵 import 樹
  './js/main.js',
  './js/pwa.js',
  './js/audio.js',
  './js/characters.js',
  './js/config.js',
  './js/input.js',
  './js/items.js',
  './js/levels.js',
  './js/meta.js',
  './js/modes.js',
  './js/save.js',
  './js/shop.js',
  './js/sprites.js',
  './js/entities/Core.js',
  './js/entities/DropItem.js',
  './js/entities/Enemy.js',
  './js/entities/EnemyProjectile.js',
  './js/entities/Mercenary.js',
  './js/entities/Player.js',
  './js/entities/Projectile.js',
  './js/entities/Turret.js',
  './js/systems/Decor.js',
  './js/systems/Ground.js',
  './js/systems/ParticleSystem.js',
  './js/systems/Spawner.js',
  './js/systems/Terrain.js',
  './js/systems/Texture.js',
  './js/systems/UI.js',
  './js/weapons/WeaponManager.js',
];

// ── install：預快取後立刻接手 ──
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      await cache.addAll(PRECACHE);
    } catch (err) {
      // 只要有一個檔案 404，addAll 會整批放棄 —— 那樣離線就全毀。
      // 改成逐檔補，讓其餘資源仍然進得了快取，缺的那個在 console 留下痕跡。
      console.warn('[sw] 預快取未竟全功，改為逐檔快取：', err);
      await Promise.all(PRECACHE.map((url) =>
        cache.add(url).catch((e) => console.warn('[sw] 預快取略過', url, e))));
    }
    await self.skipWaiting();
  })());
});

// ── activate：清舊版快取 + 立刻接管所有分頁 ──
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => !CURRENT_CACHES.includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// ── 頁面要求跳版 (js/pwa.js 按下「重新載入」時送進來) ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// 背景更新：不擋回應，抓到新版就換掉快取裡那份。
// cache: 'no-cache' → 一定跟伺服器對一次 (檔案沒變會走 304，不會白抓)。
async function revalidate(cacheName, request) {
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    // 只接受完整、同源的基本回應；206/opaque/錯誤一律不寫回快取
    if (res && res.ok && res.type === 'basic') {
      const cache = await caches.open(cacheName);
      await cache.put(request, res.clone());
    }
  } catch (err) {
    // 離線或伺服器掛掉：保留舊快取，不打斷任何事
  }
}

async function fromNetwork(request, cacheName) {
  const res = await fetch(request);
  if (res && res.ok && res.type === 'basic') {
    const cache = await caches.open(cacheName);
    await cache.put(request, res.clone());
  }
  return res;
}

function offlineResponse() {
  return new Response('離線中，且此資源不在快取內。', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 只處理同源的 GET；POST/PUT 與跨網域 (Google Fonts 等) 完全不插手
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const isNavigation = request.mode === 'navigate'
    || (request.headers.get('accept') || '').includes('text/html');

  event.respondWith((async () => {
    // 1) 快取優先 (key 含查詢字串)
    let hit = await caches.match(request);
    let hitCache = SHELL_CACHE;

    // 2) 導覽請求：?source=pwa 這種查詢字串不該讓離線開不了遊戲
    if (!hit && isNavigation) {
      hit = await caches.match(SHELL_ENTRY);
      if (!hit) hit = await caches.match('./');
    }
    if (!hit) {
      const runtime = await caches.open(RUNTIME_CACHE);
      hit = await runtime.match(request);
      hitCache = RUNTIME_CACHE;
    }

    if (hit) {
      // 有快取就先給，順便背景對一次新版 (stale-while-revalidate)
      const update = revalidate(hitCache, request);
      try {
        event.waitUntil(update);
      } catch (err) {
        // 少數瀏覽器在 await 之後才呼叫 waitUntil 會丟 InvalidStateError；
        // 背景更新沒被登記就算了，快取本身仍然可用。
      }
      return hit;
    }

    // 3) 沒快取 → 走網路，成功就順手放進 runtime 快取
    try {
      return await fromNetwork(request, RUNTIME_CACHE);
    } catch (err) {
      // 4) 連網路都沒有：導覽請求至少回 app shell，其餘回 503
      if (isNavigation) {
        const shell = await caches.match(SHELL_ENTRY) || await caches.match('./');
        if (shell) return shell;
      }
      return offlineResponse();
    }
  })());
});
