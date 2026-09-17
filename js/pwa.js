// 嘎嘎特攻隊 / Gaga Survivor — PWA 註冊層
//
// 負責三件事，全部只碰 DOM 與瀏覽器 API，不 import 任何遊戲模組：
//   1. 註冊 Service Worker (sw.js，相對於本頁 → GitHub Pages 子路徑也正確)
//   2. 偵測到 waiting worker 時提示「有新版本可用，點此重新載入」
//   3. 安裝提示：beforeinstallprompt (Android/桌機 Chrome) 或 iOS Safari 的加入主畫面提示
//
// 任何一步失敗都不能影響遊戲啟動 —— 所以全程 try/catch；在區域網路的純 HTTP (非
// localhost/127.0.0.1) 下瀏覽器本來就會拒絕註冊，這裡必須安靜地不做事、不拋例外。
//
// 提示一律走遊戲自己的視覺語言 (霓虹玻璃橫幅，見 css/style.css 的 .pwa-banner)，
// 不用 alert()/confirm()；橫幅固定在頂部 HUD 下方、不覆蓋左下搖桿與右下動作列。

const BANNER_ID = 'pwa-banner';
const IOS_HINT_KEY = 'gaga.pwa.iosHintDismissed';

let banner = null;            // 橫幅 DOM 參照 (延後建立，避免影響首次繪製)
let currentAction = null;     // 目前橫幅主按鈕的處理函式
let deferredInstall = null;   // beforeinstallprompt 事件
let refreshing = false;       // 使用者按下「重新載入」後只重載一次
let installDismissed = false; // 這一輪工作階段不再提示安裝
let waitingForReload = false;

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

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch (err) {
    return false; // 無痕模式等情況 localStorage 會直接丟例外
  }
}

function writeFlag(key) {
  try {
    window.localStorage.setItem(key, '1');
  } catch (err) {
    /* 寫不進去就算了，下次再提示一次而已 */
  }
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

function offerUpdate(worker) {
  if (!worker) return;
  showBanner({
    icon: '🚀',
    title: '有新版本可用',
    desc: '點此重新載入，套用最新版本',
    actionLabel: '重新載入',
    tone: 'update',
    onAction: () => {
      waitingForReload = true;
      try {
        worker.postMessage({ type: 'SKIP_WAITING' });
      } catch (err) {
        console.warn('[pwa] 無法通知 Service Worker：', err);
        window.location.reload();
        return;
      }
      // worker 沒回應時別讓玩家卡在舊版：兩秒後自己重載
      window.setTimeout(() => {
        if (waitingForReload) window.location.reload();
      }, 2000);
    },
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
    desc: `已更新到 ${version || '最新版本'}，點此重新載入`,
    actionLabel: '重新載入',
    tone: 'update',
    onAction: () => {
      refreshing = true;
      window.location.reload();
    },
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

function showInstallBanner() {
  if (installDismissed || isStandalone() || isIOS()) return false;
  showBanner({
    icon: '📲',
    title: '安裝嘎嘎特攻隊',
    desc: '加入主畫面，離線也能出擊',
    actionLabel: '安裝',
    tone: 'install',
    onAction: () => { promptInstall(); },
  });
  return true;
}

/**
 * 安裝入口：有 beforeinstallprompt 就走原生安裝流程，沒有則退回 iOS 說明。
 * 也可以在 console 用 gagaPWA.promptInstall() 手動叫出來。
 */
export async function promptInstall() {
  const evt = deferredInstall;
  if (!evt) {
    if (isIOS()) showIosHint();
    return false;
  }
  deferredInstall = null;
  try {
    evt.prompt();
    const choice = await evt.userChoice;
    const accepted = !!choice && choice.outcome === 'accepted';
    if (accepted) hideBanner();
    return accepted;
  } catch (err) {
    console.warn('[pwa] 安裝提示失敗：', err);
    return false;
  }
}

// iOS Safari 沒得攔安裝事件，只能在分享選單裡自己按 —— 提示一次就好，而且不打擾。
function showIosHint() {
  if (readFlag(IOS_HINT_KEY) || isStandalone()) return;
  showBanner({
    icon: '🧭',
    title: '想裝到主畫面？',
    desc: '在 Safari 分享選單選「加入主畫面」',
    tone: 'ios',
  });
}

/* ── Service Worker 註冊 ── */

// 讀 version.json 決定 SW 的註冊網址。帶版本查詢字串有兩個作用：
//   1. 發版後 URL 改變 → 瀏覽器一定會做更新檢查（不必等別人改 sw.js 的位元組）
//   2. 讓「網頁版已更新、安裝版還停在舊快取」這種事不再發生
async function readVersionTag() {
  try {
    // 帶時間戳查詢字串：連 SW 的快取 key 都不會命中，保證拿到伺服器上的版本
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res && res.ok) {
      const data = await res.json();
      if (data && data.version) return String(data.version);
    }
  } catch (err) {
    /* 離線或檔案不存在：退回不帶查詢字串的註冊，SW 本身仍可用 */
  }
  return '';
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// 開的頁面沒有 SW 可言；純 HTTP 的區域網路 IP 會註冊失敗 (非安全來源)，
  // 那也是預期行為 —— 下方 catch 會安靜吞掉。
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  try {
    const tag = await readVersionTag();
    const url = tag ? `sw.js?v=${encodeURIComponent(tag)}` : 'sw.js';
    navigator.serviceWorker.register(url).then((reg) => {
      watchRegistration(reg);
    }).catch((err) => {
      console.info('[pwa] Service Worker 未註冊 (遊戲不受影響)：', err && err.message);
    });

    // 新版 SW 接管後會主動廣播；已安裝的 PWA 不一定會經歷 updatefound，
    // 收到這個訊息就提示玩家重新載入（否則他們會一直看到舊介面）。
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') offerReloadFromMessage(event.data.version);
    });

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

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 不用瀏覽器自己的迷你資訊列，改用遊戲風格的橫幅
    deferredInstall = e;
    if (!bannerVisible()) showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    installDismissed = true;
    hideBanner();
  });
}

function init() {
  initInstallPrompt();

  registerServiceWorker();

  // iOS 的一次性提示：等畫面穩定後再出現，避免和首次繪製搶注意力
  if (isIOS() && !isStandalone()) {
    window.setTimeout(() => {
      if (!bannerVisible()) showIosHint();
    }, 4000);
  }

  // 從瀏覽器分頁切回已安裝的 App、或反之，重新校正安裝提示
  try {
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', () => { if (isStandalone()) hideBanner(); });
    }
  } catch (err) {
    /* 舊瀏覽器沒有 matchMedia 事件，忽略 */
  }
}

// console 除錯入口 (與 window.game 同一個慣例)
window.gagaPWA = { promptInstall, showInstallBanner, hideBanner, isStandalone, isIOS };

if (document.readyState === 'complete') init();
else window.addEventListener('load', init, { once: true });
