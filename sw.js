// 呱呱特工 / Gaga Survivor — Service Worker
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
const FALLBACK_VERSION = 'gaga-v82';
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
  // 英雄、敵人、Boss與地形貼圖 (sprites.js IMAGE_SPRITES)
  './assets/xian/astartes_duck.png',
  './assets/xian/bat.png',
  './assets/xian/blinker.png',
  './assets/xian/bloater.png',
  './assets/xian/boomer.png',
  './assets/xian/boomer_armed.png',
  './assets/xian/boss.png',
  './assets/xian/boss_broodlord.png',
  './assets/xian/boss_carnifex.png',
  './assets/xian/boss_charging.png',
  './assets/xian/boss_nob.png',
  './assets/xian/brute.png',
  './assets/xian/cat.png',
  './assets/xian/chimera.png',
  './assets/xian/duck.png',
  './assets/xian/flower_patch_1.png',
  './assets/xian/flower_patch_2.png',
  './assets/xian/genestealer.png',
  './assets/xian/grass_tuft.png',
  './assets/xian/hatcher.png',
  './assets/xian/hormagaunt.png',
  './assets/xian/hound.png',
  './assets/xian/ink_ape.png',
  './assets/xian/ink_ape_mother.png',
  './assets/xian/ink_boar.png',
  './assets/xian/ink_boar_king.png',
  './assets/xian/ink_crow.png',
  './assets/xian/ink_fox.png',
  './assets/xian/ink_fox_guard.png',
  './assets/xian/ink_fox_spirit.png',
  './assets/xian/ink_gale_wolf.png',
  './assets/xian/ink_gas_boar.png',
  './assets/xian/ink_pine.png',
  './assets/xian/ink_rock.png',
  './assets/xian/ink_shadow_crow.png',
  './assets/xian/ink_wolf.png',
  './assets/xian/mechanic.png',
  './assets/xian/medic.png',
  './assets/xian/mortar.png',
  './assets/xian/moss_stone.png',
  './assets/xian/mountain_rock_1.png',
  './assets/xian/mountain_rock_2.png',
  './assets/xian/ork_boy.png',
  './assets/xian/penguin.png',
  './assets/xian/pine_tree_1.png',
  './assets/xian/pine_tree_2.png',
  './assets/xian/pine_tree_3.png',
  './assets/xian/poxwalker.png',
  './assets/xian/rabbit.png',
  './assets/xian/runner.png',
  './assets/xian/sniper.png',
  './assets/xian/spitter.png',
  './assets/xian/spore_host.png',
  './assets/xian/spore_mine.png',
  './assets/xian/squig_bomb.png',
  './assets/xian/tar_slug.png',
  './assets/xian/techpriest_goose.png',
  './assets/xian/termagant.png',
  './assets/xian/walker.png',
  './assets/xian/warden.png',
  './assets/xian/xian_alchemy.png',
  './assets/xian/xian_demon.png',
  './assets/xian/xian_mage.png',
  './assets/xian/xian_sword.png',
  './assets/xian/xian_talisman.png',
  './assets/xian/xian_zen.png',
  // 魔界村角色與魔物貼圖 (sprites.js MAKAIMURA_SPRITES)
  './assets/makaimura/arthur.png',
  './assets/makaimura/makai_zombie.png',
  './assets/makaimura/makai_red_arremer.png',
  './assets/makaimura/makai_woody.png',
  // 各關卡高畫質首領貼圖 (assets/bosses/)
  './assets/bosses/boss_street.png',
  './assets/bosses/boss_lab.png',
  './assets/bosses/boss_frost.png',
  './assets/bosses/boss_core.png',
  './assets/bosses/boss_subway.png',
  './assets/bosses/boss_swamp.png',
  './assets/bosses/boss_storm.png',
  './assets/bosses/boss_foundry.png',
  './assets/bosses/boss_frostvoid.png',
  './assets/bosses/boss_voidroad.png',
  './assets/bosses/boss_thunder.png',
  './assets/bosses/boss_inkape.png',
  './assets/bosses/boss_inkfox.png',
  './assets/bosses/boss_unicorn.png',
  './assets/bosses/boss_arremer_king.png',
  './assets/bosses/boss_astaroth.png',
  // 武器手持精靈貼圖 (WeaponArt.js)
  './assets/weapons/absolute_zero.png',
  './assets/weapons/annihilation_beam.png',
  './assets/weapons/bolter.png',
  './assets/weapons/boomerang.png',
  './assets/weapons/chainsword.png',
  './assets/weapons/dragon_breath.png',
  './assets/weapons/drill.png',
  './assets/weapons/eternal_domain.png',
  './assets/weapons/frost_nova.png',
  './assets/weapons/ghost_shuriken.png',
  './assets/weapons/guardian.png',
  './assets/weapons/kunai.png',
  './assets/weapons/lightning.png',
  './assets/weapons/molotov.png',
  './assets/weapons/napalm_sea.png',
  './assets/weapons/orbit_saw.png',
  './assets/weapons/phase_blade.png',
  './assets/weapons/phase_storm.png',
  './assets/weapons/plasma_storm.png',
  './assets/weapons/power_sword.png',
  './assets/weapons/quantum_sphere.png',
  './assets/weapons/railgun.png',
  './assets/weapons/rocket.png',
  './assets/weapons/shark_torpedo.png',
  './assets/weapons/shotgun.png',
  './assets/weapons/singularity_ring.png',
  './assets/weapons/soccer.png',
  './assets/weapons/storm_bolter.png',
  './assets/weapons/twin_storm.png',
  // 地圖無接縫高畫質地表貼圖 (Ground.js)：一關一張，改為進關才抓（見 isOnDemandEntry），
  // 因此不列在預快取清單裡。
  // 戰場防禦設施 (Turret.js)
  './assets/facilities/barracks.png',
  './assets/facilities/barricade.png',
  './assets/facilities/electric_grid.png',
  './assets/facilities/heavy_bolter.png',
  './assets/facilities/manufactorum.png',
  './assets/facilities/purifier.png',
  './assets/facilities/turret.png',
  './assets/facilities/turret_cryo.png',
  './assets/facilities/turret_flame.png',
  './assets/td/guard_1.png',
  './assets/td/guard_2.png',
  './assets/td/guard_3.png',
  './assets/td/guard_missile.png',
  './assets/td/guard_multishot.png',
  './assets/td/arcane_1.png',
  './assets/td/arcane_2.png',
  './assets/td/arcane_3.png',
  './assets/td/arcane_storm.png',
  './assets/td/arcane_frost.png',
  './assets/td/cannon_1.png',
  './assets/td/cannon_2.png',
  './assets/td/cannon_3.png',
  './assets/td/cannon_siege.png',
  './assets/td/cannon_flamestrike.png',
  './assets/td/barracks_1.png',
  './assets/td/barracks_2.png',
  './assets/td/barracks_3.png',
  './assets/td/barracks_knight.png',
  './assets/td/barracks_bunker.png',
  './assets/td/barracks_redalert_1.png',
  './assets/td/barracks_redalert_2.png',
  './assets/td/barracks_redalert_3.png',
  './assets/td/barracks_redalert_knight.png',
  './assets/td/barracks_redalert_bunker.png',
  './assets/td/barracks_starcraft_1.png',
  './assets/td/barracks_starcraft_2.png',
  './assets/td/barracks_starcraft_3.png',
  './assets/td/barracks_starcraft_knight.png',
  './assets/td/barracks_starcraft_bunker.png',
  './assets/td/unit_footman_1.png',
  './assets/td/unit_footman_2.png',
  './assets/td/unit_footman_3.png',
  './assets/td/unit_knight.png',
  './assets/td/unit_gi.png',
  './assets/td/unit_marine.png',
  './assets/td/enemies/ra_conscript.png',
  './assets/td/enemies/ra_dog.png',
  './assets/td/enemies/ra_rhino.png',
  './assets/td/enemies/ra_apocalypse.png',
  './assets/td/enemies/ra_helicopter.png',
  './assets/td/enemies/sc_zergling.png',
  './assets/td/enemies/sc_hydralisk.png',
  './assets/td/enemies/sc_mutalisk.png',
  './assets/td/enemies/sc_overlord.png',
  './assets/td/enemies/sc_ultralisk.png',
  './assets/td/lair_canyon.png',
  './assets/td/lair_swamp.png',
  './assets/td/lair_void.png',
  './assets/td/lair_hive.png',
  './assets/td/base_keep.png',
  './assets/td/base_reactor.png',
  './assets/td/base_redalert.png',
  './assets/td/lair_redalert.png',
  './assets/td/lair_starcraft.png',
  './assets/td/lair_warcraft.png',
  './assets/td/base_starcraft.png',
  // 道具／補給箱／金幣／磁鐵／炸彈 (DropItem.js)
  './assets/items/battery.png',
  './assets/items/chest_boss.png',
  './assets/items/chest_gold.png',
  './assets/items/crate_supply.png',
  './assets/items/fuel_can.png',
  './assets/items/pickup_bomb.png',
  './assets/items/pickup_chicken.png',
  './assets/items/pickup_gold.png',
  './assets/items/pickup_magnet.png',
  // 地圖場景裝飾物 (sprites.js)
  './assets/decor/anvil.png',
  './assets/decor/barrel_bio.png',
  './assets/decor/barrel_red.png',
  './assets/decor/barrier.png',
  './assets/decor/bench.png',
  './assets/decor/cactus.png',
  './assets/decor/car.png',
  './assets/decor/cone.png',
  './assets/decor/console.png',
  './assets/decor/crate_wood.png',
  './assets/decor/ice_spike.png',
  './assets/decor/ink_lantern.png',
  './assets/decor/ink_maple.png',
  './assets/decor/ink_rock.png',
  './assets/decor/ink_stele_a.png',
  './assets/decor/lamp.png',
  './assets/decor/lava_rock.png',
  './assets/decor/mushroom.png',
  './assets/decor/neon.png',
  './assets/decor/pillar.png',
  './assets/decor/rack.png',
  './assets/decor/sandbags.png',
  './assets/decor/snow_pine.png',
  './assets/decor/steel.png',
  './assets/decor/swamp_log.png',
  './assets/decor/vent.png',
  './assets/decor/void_crystal.png',
  './assets/decor/void_obelisk.png',
  './assets/decor/makai_tombstone.png',
  './assets/decor/makai_dead_tree.png',
  './assets/decor/makai_gargoyle.png',
  './assets/decor/makai_skull_urn.png',
  // 敵方投射物重繪貼圖 (EnemyProjectile.js)
  './assets/bullets/bullet_acid.png',
  './assets/bullets/bullet_blood_eye.png',
  './assets/bullets/bullet_blood_spike.png',
  './assets/bullets/bullet_foxfire.png',
  './assets/bullets/bullet_plasma.png',
  './assets/bullets/bullet_skull.png',
  './assets/bullets/bullet_spore.png',
  './assets/bullets/bullet_void.png',
  // 12 生肖正邪 24 款角色貼圖 (sprites.js)
  './assets/zodiac/rat_hero.png',
  './assets/zodiac/rat_evil.png',
  './assets/zodiac/ox_hero.png',
  './assets/zodiac/ox_evil.png',
  './assets/zodiac/tiger_hero.png',
  './assets/zodiac/tiger_evil.png',
  './assets/zodiac/rabbit_hero.png',
  './assets/zodiac/rabbit_evil.png',
  './assets/zodiac/dragon_hero.png',
  './assets/zodiac/dragon_evil.png',
  './assets/zodiac/snake_hero.png',
  './assets/zodiac/snake_evil.png',
  './assets/zodiac/horse_hero.png',
  './assets/zodiac/horse_evil.png',
  './assets/zodiac/goat_hero.png',
  './assets/zodiac/goat_evil.png',
  './assets/zodiac/monkey_hero.png',
  './assets/zodiac/monkey_evil.png',
  './assets/zodiac/rooster_hero.png',
  './assets/zodiac/rooster_evil.png',
  './assets/zodiac/dog_hero.png',
  './assets/zodiac/dog_evil.png',
  './assets/zodiac/pig_hero.png',
  './assets/zodiac/pig_evil.png',
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
  './js/jewels.js',
  './js/runcards.js',
  './js/quests.js',
  './js/codex.js',
  './js/levels.js',
  './js/tdlevels.js',
  './js/tdtowers.js',
  './js/meta.js',
  './js/modes.js',
  './js/save.js',
  './js/shop.js',
  './js/sprites.js',
  './js/decorsprites.js',
  './js/entities/Core.js',
  './js/entities/AlliedUnit.js',
  './js/entities/DropItem.js',
  './js/entities/Enemy.js',
  './js/entities/EnemyProjectile.js',
  './js/entities/Mercenary.js',
  './js/entities/Player.js',
  './js/entities/Projectile.js',
  './js/entities/Turret.js',
  './js/systems/BossCutscene.js',
  './js/systems/Decor.js',
  './js/systems/Facilities.js',
  './js/systems/Ground.js',
  './js/systems/Hazards.js',
  './js/systems/LevelCache.js',
  './js/systems/Menu.js',
  './js/systems/Merchant.js',
  './js/systems/Progression.js',
  './js/systems/Skills.js',
  './js/systems/ParticleSystem.js',
  './js/systems/Spawner.js',
  './js/systems/TowerDefense.js',
  './js/systems/TDHero.js',
  './js/systems/Terrain.js',
  './js/systems/Texture.js',
  './js/systems/UI.js',
  './js/weapons/WeaponManager.js',
  './js/weapons/WeaponArt.js',
  './js/weapons/WeaponSprites.js',
  './js/weapons/ProjectileFX.js',
];

// ── 預快取分成「程式本體」與「遊戲素材」──
//
// 為什麼要分：整套素材 40 幾 MB，而行動網路是有限資源。以前換版時 SW 會在背景
// 直接把它們全部抓下來 —— 玩家不會知道自己的流量被用掉多少，而且抓的期間他是用
// 舊快取在玩（畫面殘缺、角色是舊圖）。現在：
//   程式本體 (HTML / CSS / JS / 圖示 / version.json) 仍然安裝時就抓 —— 沒有它遊戲跑不起來
//   遊戲素材 (assets/) 改成**先告訴玩家要抓多少、他同意才抓**（CACHE_ASSETS 訊息）
// 地表貼圖另外再降一級：它們是一關一張（各 1.4~2.3MB），只在真的進那一關時才抓
// （見 js/systems/Ground.js 的 _ensureGroundPng），所以不列入這份清單。
const isShellEntry = (url) => !url.startsWith('./assets/');
const isOnDemandEntry = (url) => url.startsWith('./assets/ground/');
const assetEntries = () => PRECACHE.filter((url) => !isShellEntry(url) && !isOnDemandEntry(url));

// 抓完直接寫進快取。用 cache:'reload' 繞過 HTTP 快取 —— 換版時最怕的就是
// 「新的版本號、舊的檔案」被 HTTP 的 max-age 留在快取裡。
async function putFresh(cache, url) {
  try {
    const res = await fetch(new Request(url, { cache: 'reload' }));
    if (res && res.ok && res.type === 'basic') {
      await cache.put(url, res);
      return true;
    }
  } catch (err) {
    console.warn('[sw] 預快取略過', url, err);
  }
  return false;
}

// ── install：只預快取程式本體，然後接手 ──
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const { shell } = await currentCaches();
    const cache = await caches.open(shell);
    const shellList = PRECACHE.filter(isShellEntry);
    // 逐檔抓：addAll 只要有一個檔案 404 就整批放棄，那樣離線就全毀。
    await Promise.all(shellList.map((url) => putFresh(cache, url)));
    await self.skipWaiting();
  })());
});

// ── 下載遊戲素材（頁面在玩家同意後送 CACHE_ASSETS 進來）──
// ASSET_BYTES 只是拿來回報進度用的總量（真正的清單在上面），由頁面在同意時一起送來。
let cachingAssets = null;
let ASSET_BYTES = 0;
async function cacheAssets() {
  if (cachingAssets) return cachingAssets;
  cachingAssets = (async () => {
    const { shell } = await currentCaches();
    const cache = await caches.open(shell);
    const list = assetEntries();
    const total = list.length;
    let done = 0;
    const tell = async (msg) => {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.postMessage(msg));
    };
    await tell({ type: 'ASSET_PROGRESS', done, total, bytes: ASSET_BYTES });
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const url = list[cursor++];
        await putFresh(cache, url);
        done++;
        if (done % 5 === 0 || done === total) await tell({ type: 'ASSET_PROGRESS', done, total, bytes: ASSET_BYTES });
      }
    };
    // 同時 6 條：跟瀏覽器對同一個來源的連線數差不多，再高只是排隊。
    await Promise.all(Array.from({ length: 6 }, worker));
    await tell({ type: 'ASSETS_DONE', done, total, bytes: ASSET_BYTES });
    cachingAssets = null;
    return { done, total };
  })().catch((err) => {
    cachingAssets = null;
    console.warn('[sw] 素材下載失敗：', err);
    return null;
  });
  return cachingAssets;
}

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

// ── 頁面送進來的訊息 ──
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  // 玩家同意下載素材（大小由頁面顯示，實際清單在這裡）
  if (data.type === 'CACHE_ASSETS') {
    if (typeof data.bytes === 'number') ASSET_BYTES = data.bytes;
    event.waitUntil(cacheAssets());
  }
  // 這一版已經下載完成（另一個分頁下載的）：SW 自己記起來，換版時用得到
  if (data.type === 'ASSETS_DONE_ACK') cachingAssets = null;
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
