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
const INSTALL_BTN_ID = 'btn-install-app';

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

// 依「這台裝置實際能做什麼」給對應文案。重點是**無論如何都要給可行動的指示**：
// 舊版對 iOS 直接 return false、而且那個提示用 localStorage 記住「提示過」就永久不再出現，
// 於是使用者完全看不到任何安裝入口 —— 這就是「手機無法安裝 PWA」的來源。
const INSTALL_COPY = {
  native: { icon: '📲', title: '安裝嘎嘎特攻隊', desc: '加入主畫面，離線也能出擊' },
  'native-manual': { icon: '📲', title: '安裝嘎嘎特攻隊', desc: '點瀏覽器右上角「⋮」→ 安裝應用程式' },
  ios: { icon: '🧭', title: '裝到 iPhone 主畫面', desc: '點下方「分享」鈕 → 加入主畫面' },
  unsupported: { icon: '🧭', title: '這個瀏覽器無法安裝' },
};

function installCopy() {
  const mode = installMode();
  if (mode === 'unsupported') return { ...INSTALL_COPY.unsupported, desc: browserAdvice() };
  if (mode === 'native') return deferredInstall ? INSTALL_COPY.native : INSTALL_COPY['native-manual'];
  return INSTALL_COPY[mode];
}

// 任何平台都能叫出安裝說明（不再對 iOS 直接回 false）。
// 首頁的「📲 安裝成 App」按鈕與 console 的 gagaPWA.showInstallBanner() 都走這裡；
// 只有在「真的有 beforeinstallprompt 可攔」時才給按鈕，其餘情況給步驟 —— 按了沒反應比不給按鈕更糟。
function showInstallBanner() {
  const mode = installMode();
  if (mode === 'installed') return false;
  const copy = installCopy();
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
    else hideBanner();
    return accepted;
  } catch (err) {
    console.warn('[pwa] 安裝提示失敗：', err);
    showInstallBanner();
    return false;
  }
}

// 自動提示：只有「這個環境沒有安裝事件可攔」時才主動講一次（native 由
// beforeinstallprompt 驅動，不需要吵）。每個工作階段最多一次，關掉就算了；
// 首頁常駐的安裝按鈕是保底入口，所以這裡不再用 localStorage 永久封鎖提示。
let installHintShown = false;
function showMobileInstallHint() {
  if (installHintShown || installDismissed || isStandalone()) return;
  const mode = installMode();
  if (mode !== 'ios' && mode !== 'unsupported') return;
  installHintShown = true;
  showInstallBanner();
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

/* ── 首頁常駐安裝入口 ── */

// 使用者「想安裝卻找不到入口」時的保底路徑：首頁固定一顆「📲 安裝成 App」。
// 已經在主畫面執行（standalone）就隱藏 —— 那時安裝已經完成，按鈕只會誤導。
function updateInstallButton() {
  const btn = document.getElementById(INSTALL_BTN_ID);
  if (!btn) return;
  btn.classList.toggle('hidden', installMode() === 'installed');
}

function initInstallButton() {
  const btn = document.getElementById(INSTALL_BTN_ID);
  if (!btn) return;
  btn.addEventListener('click', () => { showInstallBanner(); });
  updateInstallButton();
}

function init() {
  initInstallPrompt();
  initInstallButton();

  registerServiceWorker();

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
        updateInstallButton();
      });
    }
  } catch (err) {
    /* 舊瀏覽器沒有 matchMedia 事件，忽略 */
  }
}

// console 除錯入口 (與 window.game 同一個慣例)
window.gagaPWA = {
  promptInstall, showInstallBanner, hideBanner,
  isStandalone, isIOS, installMode, showMobileInstallHint,
};

if (document.readyState === 'complete') init();
else window.addEventListener('load', init, { once: true });
