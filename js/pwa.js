// 呱呱特工 / Gaga Survivor — PWA 註冊層
//
// 負責三件事，全部只碰 DOM 與瀏覽器 API，不 import 任何遊戲模組：
//   1. 註冊 Service Worker (sw.js，相對於本頁 → GitHub Pages 子路徑也正確)
//   2. 偵測到 waiting worker 時提示「有新版本可用，立即更新」
//   3. 安裝提示：beforeinstallprompt (Android/桌機 Chrome) 或 iOS Safari 的加入主畫面提示
//
// 任何一步失敗都不能影響遊戲啟動 —— 所以全程 try/catch；在區域網路的純 HTTP (非
// localhost/127.0.0.1) 下瀏覽器本來就會拒絕註冊，這裡必須安靜地不做事、不拋例外。
//
// 提示一律走遊戲自己的視覺語言 (霓虹玻璃橫幅，見 css/style.css 的 .pwa-banner)，
// 不用 alert()/confirm()；橫幅固定在頂部 HUD 下方、不覆蓋左下搖桿與右下動作列。

const BANNER_ID = 'pwa-banner';
const UPDATE_BTN_ID = 'btn-app-update';
// 「這一版的遊戲素材已經下載好了」記在這裡（值＝版本號）。沒記錄＝還沒下載。
const ASSETS_OK_KEY = 'gaga.assetsOk';

let banner = null;            // 橫幅 DOM 參照 (延後建立，避免影響首次繪製)
let currentAction = null;     // 目前橫幅主按鈕的處理函式
let deferredInstall = null;   // beforeinstallprompt 事件
let refreshing = false;       // 使用者按下「立即更新」後只重載一次
let installDismissed = false; // 這一輪工作階段不再提示安裝
let waitingForReload = false;
let updating = false;         // 「立即更新」進行中，避免連點重複觸發
let registration = null;      // ServiceWorkerRegistration
let currentVersion = '';      // version.json 的版本
let assetsKB = 0;             // 同意才下載的素材大小（version.json 的 assetsKB）
let pendingAssets = null;     // 正在下載的素材：{ version, then }
let pendingThen = null;       // 「下載完之後要做什麼」（例如換版重載）
let assetsPromptShown = false;// 這一輪工作階段已經問過要不要下載素材

/* ── 環境判斷 ── */

function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || navigator.standalone === true;
  } catch (err) {
    return false;
  }
}

// 只有 iOS/iPadOS 沒有 beforeinstallprompt，要改走「分享選單 → 加入主畫面」的說明。
function isIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ 的 Safari 會把自己裝成 MacIntel，靠觸控點數辨識
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

// iOS/iPadOS 上**只有 Safari** 能加入主畫面 —— Chrome / Edge / Firefox 在 iOS 都是
// 包 WebKit 的自製殼，分享選單裡沒有「加入主畫面」，所以那些環境等於無法安裝。
function isIOSSafari() {
  if (!isIOS()) return false;
  const ua = navigator.userAgent || '';
  if (!/Safari/.test(ua)) return false;
  return !/(CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo|Brave|Arc)/i.test(ua);
}

// App 內建瀏覽器（LINE / Messenger / Instagram / WeChat / TikTok / Android WebView …）。
// 這些環境沒有任何安裝途徑，唯一的補救是「請改用 Safari / Chrome 開啟」——
// 不明講的話使用者只會覺得「這頁就是不能安裝」，找不到按鈕。
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|LIFF|MicroMessenger|Twitter|TikTok|SnapChat|Pinterest|GSA\/|; wv\)|WebView/i.test(ua);
}

// 這台裝置／這個瀏覽器到底能不能安裝，以及要用哪條路：
//   installed   已經在主畫面執行了，不用再提示
//   native      有 beforeinstallprompt（Android Chrome/Edge、桌機 Chrome/Edge）
//   ios         iOS Safari，只能「分享 → 加入主畫面」
//   unsupported App 內建瀏覽器，或 iOS 上的非 Safari 瀏覽器 —— 這裡真的裝不了
function installMode() {
  if (isStandalone()) return 'installed';
  if (isInAppBrowser()) return 'unsupported';
  if (isIOS()) return isIOSSafari() ? 'ios' : 'unsupported';
  return 'native';
}

// unsupported 時要講清楚「改成哪個瀏覽器」。iOS 要指名 Safari，其餘指名 Chrome。
function browserAdvice() {
  return isIOS()
    ? 'iPhone / iPad 只有 Safari 能加入主畫面 —— 請複製網址改用 Safari 開啟'
    : '請點右上角「⋯」→ 用瀏覽器開啟，再於 Chrome 安裝';
}

/* ── 橫幅 (與 .event-banner 同一套視覺語言) ── */

function ensureBanner() {
  if (banner || !document.body) return banner;
  const root = document.createElement('div');
  root.id = BANNER_ID;
  root.className = 'pwa-banner hidden';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = [
    '<span class="pwa-icon" aria-hidden="true">✨</span>',
    '<div class="pwa-body">',
    '  <strong class="pwa-title"></strong>',
    '  <span class="pwa-desc"></span>',
    '</div>',
    '<button type="button" class="pwa-action hidden"></button>',
    '<button type="button" class="pwa-dismiss" aria-label="關閉提示">✕</button>',
  ].join('');

  const refs = {
    root,
    icon: root.querySelector('.pwa-icon'),
    title: root.querySelector('.pwa-title'),
    desc: root.querySelector('.pwa-desc'),
    action: root.querySelector('.pwa-action'),
    dismiss: root.querySelector('.pwa-dismiss'),
  };

  refs.action.addEventListener('click', () => {
    const fn = currentAction;
    hideBanner();
    if (fn) {
      try {
        fn();
      } catch (err) {
        console.warn('[pwa] 橫幅動作失敗：', err);
      }
    }
  });
  refs.dismiss.addEventListener('click', () => {
    installDismissed = true;
    hideBanner();
  });
  // 橫幅本身以外的區域完全不攔截觸控 (CSS 也只給這個盒子 pointer-events: auto)
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  (document.getElementById('game-container') || document.body).appendChild(root);
  banner = refs;
  return banner;
}

function showBanner({ icon, title, desc, actionLabel, onAction, tone }) {
  const refs = ensureBanner();
  if (!refs) return;
  refs.icon.textContent = icon || '✨';
  refs.title.textContent = title || '';
  refs.desc.textContent = desc || '';
  refs.root.classList.toggle('pwa-update', tone === 'update');
  if (actionLabel) {
    refs.action.textContent = actionLabel;
    refs.action.classList.remove('hidden');
  } else {
    refs.action.classList.add('hidden');
  }
  currentAction = onAction || null;
  refs.root.classList.remove('hidden');
}

function hideBanner() {
  currentAction = null;
  if (banner) banner.root.classList.add('hidden');
}

function bannerVisible() {
  return !!banner && !banner.root.classList.contains('hidden');
}

/* ── 更新提示 ── */

// 換版前先確定「新版的遊戲素材」有沒有下載好。
// 沒有的話先問玩家（要下載約 XX MB 嗎），下載完才換版 —— 這樣換版後不會出現
// 「程式是新的、貼圖還是舊的」那段空窗（那正是玩家看到「角色變回舊的」的時候）。
async function ensureAssetsThen(then) {
  let info = { version: currentVersion, assetsKB };
  try { info = await readVersionInfo(); } catch (err) { /* 離線就用已知的 */ }
  if (info.version) currentVersion = info.version;
  if (info.assetsKB) assetsKB = info.assetsKB;
  if (currentVersion && assetsKB && !assetsOk(currentVersion)) {
    offerAssetDownload(currentVersion, then, 'update');
    return;
  }
  then();
}

// 讓 waiting 的新版接手，接手後整頁重載
function activateWaiting(worker) {
  waitingForReload = true;
  try {
    worker.postMessage({ type: 'SKIP_WAITING' });
  } catch (err) {
    console.warn('[pwa] 無法通知 Service Worker：', err);
    reloadNow();
    return;
  }
  // worker 沒回應時別讓玩家卡在舊版：兩秒後自己重載
  window.setTimeout(() => {
    if (waitingForReload) reloadNow();
  }, 2000);
}

function offerUpdate(worker) {
  if (!worker) return;
  const size = assetsKB ? `（遊戲素材約 ${humanMB(assetsKB)}）` : '';
  showBanner({
    icon: '🚀',
    title: '有新版本可用',
    desc: `套用最新版本並重新載入遊戲${size}`,
    actionLabel: '立即更新',
    tone: 'update',
    onAction: () => { ensureAssetsThen(() => activateWaiting(worker)); },
  });
}

// SW 廣播換版：只有在「這個分頁是被舊版 SW 控制」時才提示，
// 首次安裝（還沒有 controller）不該跳「有新版本」。
function offerReloadFromMessage(version) {
  if (!navigator.serviceWorker.controller) return;
  if (bannerVisible() || refreshing) return;
  showBanner({
    icon: '🚀',
    title: '有新版本可用',
    desc: `已更新到 ${version || '最新版本'}，立即更新遊戲${assetsKB ? `（素材約 ${humanMB(assetsKB)}）` : ''}`,
    actionLabel: '立即更新',
    tone: 'update',
    onAction: () => { ensureAssetsThen(reloadNow); },
  });
}

function watchRegistration(reg) {
  // 已經有新版在等待 (例如上一個分頁按過重新載入)
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // controller 存在才代表這是「更新」而不是第一次安裝
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        offerUpdate(installing);
      }
    });
  });
}

/* ── 安裝提示 ── */

// 依「這台裝置實際能做什麼」給對應文案。重點是**無論如何都要給可行動的指示**：
// 舊版對 iOS 直接 return false、而且那個提示用 localStorage 記住「提示過」就永久不再出現，
// 於是使用者完全看不到任何安裝入口 —— 這就是「手機無法安裝 PWA」的來源。
const INSTALL_COPY = {
  native: { icon: '📲', title: '安裝呱呱特工', desc: '加入主畫面，離線也能出擊' },
  'native-manual': { icon: '📲', title: '安裝呱呱特工', desc: '點瀏覽器右上角「⋮」→ 安裝應用程式' },
  ios: { icon: '🧭', title: '裝到 iPhone 主畫面', desc: '點下方「分享」鈕 → 加入主畫面' },
  // Android 的安裝是兩段式：Chrome 先向 Google 要一個 WebAPK，再由系統裝起來。第二段
  // 失敗時（授權、Play 服務、空間、Google 端的鑄造服務）Chrome 只會丟「無法建立捷徑／
  // 無法開啟應用程式」，使用者就卡死了。這裡退一步給**不經過 WebAPK** 的備案：一般捷徑，
  // 一定放得上主畫面，代價是不進 standalone 模式。
  // 用疑問句而非「你失敗了」—— 等不到 appinstalled 不等於一定失敗（可能只是慢或事件沒回來）。
  'native-failed': { icon: '📲', title: '沒看到 App 出現？', desc: '改用「⋮」→ 加到主畫面 → 建立捷徑' },
  unsupported: { icon: '🧭', title: '這個瀏覽器無法安裝' },
};

function installCopy() {
  const mode = installMode();
  if (mode === 'unsupported') return { ...INSTALL_COPY.unsupported, desc: browserAdvice() };
  if (mode === 'native') return deferredInstall ? INSTALL_COPY.native : INSTALL_COPY['native-manual'];
  return INSTALL_COPY[mode];
}

// 任何平台都能叫出安裝說明（不再對 iOS 直接回 false）。
// 自動提示 (js/pwa.js 的 showMobileInstallHint) 與 console 的 gagaPWA.showInstallBanner()
// 都走這裡；只有在「真的有 beforeinstallprompt 可攔」時才給按鈕，其餘情況給步驟
// —— 按了沒反應比不給按鈕更糟。
function showInstallBanner(copyKey) {
  const mode = installMode();
  if (mode === 'installed') return false;
  const copy = (copyKey && INSTALL_COPY[copyKey]) || installCopy();
  const canPrompt = mode === 'native' && !!deferredInstall;
  showBanner({
    icon: copy.icon,
    title: copy.title,
    desc: copy.desc,
    actionLabel: canPrompt ? '安裝' : '',
    tone: mode === 'native' ? 'install' : 'ios',
    onAction: () => { promptInstall(); },
  });
  return true;
}

// 安裝失敗的退路：Android 的安裝是兩段式 —— (1) Chrome 向 Google 要一個 WebAPK，
// (2) 系統把它裝起來。第 (2) 段失敗時 Chrome 只會說「無法建立捷徑／無法開啟應用程式」，
// 而我們原本在使用者按下「安裝」後就把橫幅收掉，使用者從此沒有任何下一步。
// 成功的可靠訊號是 appinstalled；等不到就給不經過 WebAPK 的備案（建立捷徑）。
//
// 注意：不能用 isStandalone() 當成功訊號 —— Android 上安裝完成時，目前這個分頁仍然
// 停在 Chrome（要從桌面開啟才是 standalone），所以那會誤判成功為失敗。
const INSTALL_WATCHDOG_MS = 12000;
let installWatchdog = null;

function clearInstallWatchdog() {
  if (installWatchdog !== null) {
    window.clearTimeout(installWatchdog);
    installWatchdog = null;
  }
}

function armInstallWatchdog() {
  clearInstallWatchdog();
  installWatchdog = window.setTimeout(() => {
    installWatchdog = null;
    console.info('[pwa] 按下安裝後沒收到 appinstalled，顯示「建立捷徑」備援指示');
    showInstallBanner('native-failed');
  }, INSTALL_WATCHDOG_MS);
}

/**
 * 安裝入口：有 beforeinstallprompt 就走原生安裝流程；沒有的話（iOS Safari、
 * App 內建瀏覽器、還沒收到事件的 Chrome）一律把「該怎麼安裝」留在畫面上，
 * 而不是安靜地什麼都不做。
 * 也可以在 console 用 gagaPWA.promptInstall() 手動叫出來。
 */
export async function promptInstall() {
  const evt = deferredInstall;
  if (!evt) {
    showInstallBanner();
    return false;
  }
  deferredInstall = null;
  try {
    evt.prompt();
    const choice = await evt.userChoice;
    const accepted = !!choice && choice.outcome === 'accepted';
    // 不論接受或取消，都把原生事件消耗掉；取消後改顯示手動步驟，避免按鈕從此失效。
    if (!accepted) showInstallBanner();
    else {
      hideBanner();
      armInstallWatchdog();
    }
    return accepted;
  } catch (err) {
    console.warn('[pwa] 安裝提示失敗：', err);
    showInstallBanner();
    return false;
  }
}

// 自動提示：只有「這個環境沒有安裝事件可攔」時才主動講一次（native 由
// beforeinstallprompt 驅動，不需要吵）。每個工作階段最多一次，關掉就算了；
// 安裝入口收在自動橫幅與 gagaPWA.showInstallBanner()，所以這裡不再用 localStorage 永久封鎖提示。
let installHintShown = false;
function showMobileInstallHint() {
  if (installHintShown || installDismissed || isStandalone()) return;
  const mode = installMode();
  if (mode !== 'ios' && mode !== 'unsupported') return;
  installHintShown = true;
  showInstallBanner();
}

/* ── Service Worker 註冊 ── */

// 讀 version.json 決定 SW 的註冊網址，順便拿到「同意才下載的素材有多大」。
// 帶版本查詢字串有兩個作用：
//   1. 發版後 URL 改變 → 瀏覽器一定會做更新檢查（不必等別人改 sw.js 的位元組）
//   2. 讓「網頁版已更新、安裝版還停在舊快取」這種事不再發生
async function readVersionInfo() {
  try {
    // 帶時間戳查詢字串：連 SW 的快取 key 都不會命中，保證拿到伺服器上的版本
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res && res.ok) {
      const data = await res.json();
      if (data) return { version: String(data.version || ''), assetsKB: Number(data.assetsKB) || 0 };
    }
  } catch (err) {
    /* 離線或檔案不存在：退回不帶查詢字串的註冊，SW 本身仍可用 */
  }
  return { version: '', assetsKB: 0 };
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// 開的頁面沒有 SW 可言；純 HTTP 的區域網路 IP 會註冊失敗 (非安全來源)，
  // 那也是預期行為 —— 下方 catch 會安靜吞掉。
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  try {
    const info = await readVersionInfo();
    currentVersion = info.version;
    assetsKB = info.assetsKB;
    const url = currentVersion ? `sw.js?v=${encodeURIComponent(currentVersion)}` : 'sw.js';
    navigator.serviceWorker.register(url).then((reg) => {
      registration = reg;
      watchRegistration(reg);
      // 素材（貼圖…）比程式本體大得多，而且行動網路是有限資源 ——
      // 第一版安裝時先問過玩家再抓，不要默默吃掉他的流量。
      maybeOfferAssets();
    }).catch((err) => {
      console.info('[pwa] Service Worker 未註冊 (遊戲不受影響)：', err && err.message);
    });

    // 新版 SW 接管後會主動廣播；已安裝的 PWA 不一定會經歷 updatefound，
    // 收到這個訊息就提示玩家重新載入（否則他們會一直看到舊介面）。
    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);

    // 新 SW 接手後重載一次，讓整頁都吃到新版資源
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!waitingForReload || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } catch (err) {
    console.info('[pwa] Service Worker 註冊流程例外 (遊戲不受影響)：', err);
  }
}

/* ── 遊戲素材下載：先講清楚多大，玩家同意才抓 ── */

// 素材下載完成與否記在 localStorage（每個版本一次）。沒同意就還沒下載 ——
// 遊戲照樣能玩，只是貼圖每次都得從網路抓（換版後那段時間角色會是舊圖）。
function assetsOk(version) {
  if (!version) return true;   // 不知道版本就別吵
  try { return localStorage.getItem(ASSETS_OK_KEY) === version; } catch (err) { return true; }
}
function markAssetsOk(version) {
  try { localStorage.setItem(ASSETS_OK_KEY, version); } catch (err) { /* 私密模式等，忽略 */ }
}

function humanMB(kb) {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(kb))}KB`;
}

// 進度橫幅：SW 每抓幾張就回報一次
function onServiceWorkerMessage(event) {
  const data = event.data || {};
  if (data.type === 'SW_UPDATED') { offerReloadFromMessage(data.version); return; }
  if (data.type === 'ASSET_PROGRESS') {
    if (!pendingAssets) return;
    const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
    showBanner({
      icon: '📦',
      title: `下載遊戲素材中… ${pct}%`,
      desc: `${data.done} / ${data.total} 個檔案（約 ${humanMB(assetsKB)}）· 可以關掉這個視窗，下載會在背景繼續`,
      actionLabel: '',
      tone: 'install',
    });
    return;
  }
  if (data.type === 'ASSETS_DONE') {
    const pending = pendingAssets;
    pendingAssets = null;
    markAssetsOk(pending?.version || currentVersion);
    hideBanner();
    console.info(`[pwa] 素材下載完成：${data.done}/${data.total}`);
    if (pending && typeof pending.then === 'function') {
      try { pending.then(); } catch (err) { console.warn('[pwa] 下載完成後的動作失敗：', err); }
    }
  }
}

function startAssetDownload(version, then) {
  const sw = navigator.serviceWorker.controller || (registration && registration.active);
  if (!sw) { if (then) then(); return; }
  if (pendingAssets) return;                 // 已經在下載了
  pendingAssets = { version: version || currentVersion, then };
  showBanner({
    icon: '📦',
    title: `下載遊戲素材中… 0%`,
    desc: `共約 ${humanMB(assetsKB)}· 可以關掉這個視窗，下載會在背景繼續`,
    actionLabel: '',
    tone: 'install',
  });
  sw.postMessage({ type: 'CACHE_ASSETS', bytes: assetsKB * 1024 });
}

// 「要不要下載素材？」——玩家按了才抓。不下載也能玩，只是沒有離線貼圖。
function offerAssetDownload(version, then, reason) {
  pendingThen = then || null;
  showBanner({
    icon: '📦',
    title: reason === 'first' ? '首次載入需要下載遊戲素材' : '有新版本可用',
    desc: `約 ${humanMB(assetsKB)}，下載後可離線遊玩（不下載也能玩，只是每次開都要重新抓貼圖）`,
    actionLabel: '立即下載',
    tone: 'install',
    onAction: () => { startAssetDownload(version, pendingThen); },
  });
}

function maybeOfferAssets() {
  if (assetsPromptShown) return;
  if (!currentVersion || assetsOk(currentVersion)) return;
  if (!navigator.serviceWorker.controller) return;   // 還沒有 SW 在管這個分頁
  assetsPromptShown = true;
  offerAssetDownload(currentVersion, null, 'first');
}

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 不用瀏覽器自己的迷你資訊列，改用遊戲風格的橫幅
    deferredInstall = e;
    if (!bannerVisible()) showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    clearInstallWatchdog();
    deferredInstall = null;
    installDismissed = true;
    hideBanner();
  });
}

/* ── 首頁常駐更新入口 ── */

// 發版後最常見的災難是「網頁版已經更新、這個分頁（或已安裝的 App）還停在舊快取」——
// 使用者看到的是舊介面或新舊混搭的畫面，卻沒有任何辦法自救。
// 首頁固定一顆「🔄 立即更新」，按下去：
//   1. 請瀏覽器真的去對一次 sw.js（註冊網址帶版本查詢字串，不會被快取擋住）
//   2. 真的有新版 → 讓它接手 (SKIP_WAITING) → controllerchange 重載整頁
//   3. 沒有新版 / 沒有 SW → 直接重載（導覽請求在 sw.js 是網路優先，重載即抓最新 HTML）
function setUpdateButtonBusy(busy) {
  const btn = document.getElementById(UPDATE_BTN_ID);
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? '⏳ 更新中…' : '🔄 立即更新';
}

// reg.update() 之後新 SW 可能還在 installing，等到它進 waiting 為止。
// 等不到就回 null，呼叫端直接重載 —— 不能讓玩家卡在「更新中」。
function waitForWaiting(reg, ms) {
  return new Promise((resolve) => {
    const limit = Date.now() + ms;
    const tick = () => {
      if (reg.waiting) return resolve(reg.waiting);
      if (Date.now() >= limit) return resolve(null);
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

function reloadNow() {
  refreshing = true;
  window.location.reload();
}

async function updateApp() {
  if (updating) return;
  updating = true;
  setUpdateButtonBusy(true);
  try {
    const reg = ('serviceWorker' in navigator)
      ? await navigator.serviceWorker.getRegistration().catch(() => null)
      : null;

    if (reg) {
      try {
        await reg.update();
      } catch (err) {
        // 離線或伺服器掛掉：update() 失敗不代表不能重載，往下走
        console.info('[pwa] Service Worker 更新檢查失敗，直接重載：', err);
      }
      const waiting = await waitForWaiting(reg, 2500);
      if (waiting) {
        // 先把新版的素材準備好（沒下載過就問玩家），再讓它接手
        await ensureAssetsThen(() => activateWaiting(waiting));
        return; // 按鈕維持「更新中…」直到頁面換掉
      }
    }

    reloadNow();
  } finally {
    // 已經排定重載就不要還原按鈕（頁面馬上就換掉了）
    if (!waitingForReload) {
      updating = false;
      setUpdateButtonBusy(false);
    }
  }
}

function initAppUpdateButton() {
  const btn = document.getElementById(UPDATE_BTN_ID);
  if (!btn) return;
  btn.addEventListener('click', () => { updateApp(); });
}

function init() {
  initInstallPrompt();
  initAppUpdateButton();

  registerServiceWorker();

  // 已經被 SW 控制的分頁（回訪）：若這一版的素材還沒下載過，開場問一次。
  // 延後幾秒，不要跟首次繪製與安裝提示搶注意力。
  window.setTimeout(maybeOfferAssets, 3500);

  // 手機上的安裝說明：等畫面穩定後再出現，避免和首次繪製搶注意力。
  // 只有「攔不到安裝事件」的環境會自動跳（iOS、App 內建瀏覽器）。
  window.setTimeout(() => {
    if (!bannerVisible()) showMobileInstallHint();
  }, 4000);

  // 從瀏覽器分頁切回已安裝的 App、或反之，重新校正安裝提示
  try {
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', () => {
        if (isStandalone()) hideBanner();
      });
    }
  } catch (err) {
    /* 舊瀏覽器沒有 matchMedia 事件，忽略 */
  }
}

// console 除錯入口 (與 window.game 同一個慣例)
window.gagaPWA = {
  promptInstall, showInstallBanner, hideBanner, updateApp,
  isStandalone, isIOS, installMode, showMobileInstallHint,
  // 素材下載（給 console 除錯與驗證腳本用）
  startAssetDownload, offerAssetDownload, readVersionInfo,
  assetsOk, markAssetsOk,
  state: () => ({ version: currentVersion, assetsKB, downloading: !!pendingAssets }),
};

if (document.readyState === 'complete') init();
else window.addEventListener('load', init, { once: true });
