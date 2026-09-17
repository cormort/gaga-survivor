// 嘎嘎特攻隊 / Gaga Survivor — Service Worker
//
// 目標：離線可玩 (整個 app shell + 全部 ES module 都預快取)，上線時自動換版。
// 部署在 GitHub Pages 的子路徑 (/gaga-survivor/)，所以這裡全部用相對路徑 —— 一律相對於
// 這支 sw.js 所在的目錄 (也就是站台子路徑根)，寫死開頭斜線會直接 404。
//
// 策略：
//   安裝  → 讀 version.json 決定版本 → 預快取 app shell (含 js/ 底下每一個模組)
//           → skipWaiting()
//   啟用  → 清掉舊版快取 + clients.claim() + 通知所有分頁「新版已接手」
//   取用  → 導覽請求 (HTML)「網路優先，離線才退回快取」；
//           其餘同源 GET「快取優先 + 背景更新」(stale-while-revalidate)；
//           沒命中才走網路並順手寫進 runtime 快取；查詢字串算在快取 key 裡。
//   跨網域 / 非 GET → 完全不攔，原封不動交給瀏覽器。
//
// 為什麼導覽請求要「網路優先」：原本全部是快取優先，於是**已安裝的 PWA** 在改版後
// 第一次開啟仍然是舊版 HTML（背景才偷偷把新檔換進快取），玩家看到的是舊介面 ——
// 「難度選擇在 PWA 裡不見了、網頁版卻正常」就是這個原因。HTML 只有幾十 KB，
// 網路優先的代價可忽略，離線時仍由快取接手。
//
// 發版流程：改版時只更新根目錄 `version.json` 的 version（必要時同步這裡的
// FALLBACK_VERSION，tools/verify-pwa.mjs 會比對兩者），PWA 下次開啟就會換版。

// 版本來源：根目錄 version.json。FALLBACK 只在離線安裝、抓不到 version.json 時使用。
const FALLBACK_VERSION = 'gaga-v4';
const VERSION_URL = './version.json';

async function resolveCacheVersion() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (res && res.ok) {
      const data = await res.json();
      if (data && data.version) return `gaga-v${String(data.version).replace(/^v/, '')}`;
    }
  } catch (err) {
    // 離線或檔案不存在：退回常數，離線安裝仍然可用
  }
  return FALLBACK_VERSION;
}

// 同一次 SW 生命週期內只解析一次；install 與 activate 會拿到同一組名稱。
let cacheNamePromise = null;
function currentCaches() {
  if (!cacheNamePromise) {
    cacheNamePromise = resolveCacheVersion().then((version) => ({
      version,
      shell: version,
      runtime: `${version}-runtime`,
    }));
  }
  return cacheNamePromise;
}

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
  './version.json',
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
  './js/systems/Facilities.js',
  './js/systems/Ground.js',
  './js/systems/Hazards.js',
  './js/systems/Menu.js',
  './js/systems/Merchant.js',
  './js/systems/Progression.js',
  './js/systems/ParticleSystem.js',
  './js/systems/Spawner.js',
  './js/systems/Terrain.js',
  './js/systems/Texture.js',
  './js/systems/UI.js',
  './js/weapons/WeaponManager.js',
  './js/weapons/WeaponArt.js',
  './js/weapons/ProjectileFX.js',
];

// ── install：預快取後立刻接手 ──
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const { shell } = await currentCaches();
    const cache = await caches.open(shell);
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

// ── activate：清舊版快取 + 立刻接管所有分頁 + 通知分頁換版 ──
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const { version, shell, runtime } = await currentCaches();
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => ![shell, runtime].includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();

    // 已安裝的 PWA 不一定會經歷 updatefound（可能上次開著時就換好了），
    // 主動通知所有分頁可以重新載入；js/pwa.js 收到後會顯示更新橫幅。
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version }));
  })());
});

// ── 頁面要求跳版 (js/pwa.js 按下「重新載入」時送進來) ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// 背景更新：抓到新版就換掉快取裡那份 (呼叫端可 await，導覽請求靠它做到網路優先)。
// cache: 'no-cache' → 一定跟伺服器對一次 (檔案沒變會走 304，不會白抓)。
async function revalidate(cacheName, request) {
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    // 只接受完整、同源的基本回應；206/opaque/錯誤一律不寫回快取
    if (res && res.ok && res.type === 'basic') {
      const cache = await caches.open(cacheName);
      await cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    // 離線或伺服器掛掉：保留舊快取，不打斷任何事
    return null;
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

async function matchShell(request) {
  return (await caches.match(request)) || (await caches.match(SHELL_ENTRY)) || (await caches.match('./'));
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
  // version.json 也必須網路優先：js/pwa.js 靠它決定註冊網址，
  // 若被「快取優先」擋下，永遠只讀到舊版號 → 換版流程一輩子不會啟動。
  const isVersionFile = url.pathname.endsWith('/version.json');

  event.respondWith((async () => {
    const { shell, runtime } = await currentCaches();

    // 1) 導覽請求 (HTML) 與 version.json：網路優先，離線才退回快取
    if (isNavigation || isVersionFile) {
      const fresh = await revalidate(shell, request);
      if (fresh) return fresh;
      const cached = await matchShell(request);
      return cached || offlineResponse();
    }

    // 2) 其餘資源：快取優先 + 背景更新
    let hit = await caches.match(request);
    let hitCache = shell;
    if (!hit) {
      const rt = await caches.open(runtime);
      hit = await rt.match(request);
      hitCache = runtime;
    }

    if (hit) {
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
      return await fromNetwork(request, runtime);
    } catch (err) {
      // 4) 連網路都沒有：導覽請求至少回 app shell，其餘回 503
      if (isNavigation) {
        const shellHit = await matchShell(request);
        if (shellHit) return shellHit;
      }
      return offlineResponse();
    }
  })());
});
