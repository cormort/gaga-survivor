// 守塔「戰術地基槽」加成表 (Tactical Socket Bonuses)
//
// 為什麼要獨立一支模組：加成要同時被四個地方讀 ——
//   1. js/entities/Turret.js  ── 蓋塔時把數值寫進塔（射程／威力／冷卻／耐久／經濟／光環）
//   2. js/systems/Facilities.js ── 結算護甲相剋（穿甲塢）與指揮所光環
//   3. js/systems/UI.js / js/systems/TowerDefense.js ── 名稱、圖示、說明的顯示
//   4. js/tdlevels.js ── 每一關的建塔點填 bonus 與 label
// Turret.js 被 tdtowers.js import（tdtowers.js 又 import Turret.js 的 FACILITY_TYPES），
// 所以這支只能當「葉子模組」：**不 import 任何東西**，否則會繞出循環依賴。
//
// 舊版只有 range/haste/damage/armor 四種，而且沒有任何一關真的用過（tdlevels.js 的
// sockets 只寫了 id/x/y）—— 等於整套地基系統是死的。這裡補齊到八種並補上經濟與光環類，
// 讓「蓋在哪個格子」變成真正的取捨，而不只是「找個好位置放塔」。

// apply(t)：t 是剛 new 出來的 Turret。只能寫「自己的欄位」，
// 不能直接覆寫 dmgMul/rangeMul —— 那兩個欄位會被 applyTDStats() 重算（見 js/tdtowers.js）。
export const SOCKET_BONUSES = {
  range: {
    label: '高台', icon: '🎯', color: '#00f5ff',
    desc: '蓋在這裡的塔射程 +15%',
    apply: (t) => { t.socketRangeMul = 1.15; },
  },
  haste: {
    label: '加速齒輪', icon: '⚡', color: '#b5179e',
    desc: '蓋在這裡的塔冷卻 -15%（射速 +18%）',
    apply: (t) => { t.socketCdrMul = 0.85; },
  },
  damage: {
    label: '彈藥庫', icon: '⚔️', color: '#f39c12',
    desc: '蓋在這裡的塔威力 +20%',
    apply: (t) => { t.socketDmgMul = 1.20; },
  },
  armor: {
    label: '裝甲基座', icon: '🛡️', color: '#2ecc71',
    desc: '蓋在這裡的設施耐久 +30%',
    apply: (t) => { t.socketHpMul = 1.30; },
  },
  // ── 經濟類：鼓勵「先投資、後回本」，而不是把金幣全砸在輸出上 ──
  bank: {
    label: '金庫', icon: '💰', color: '#ffd166',
    desc: '每波結束結算利息：現有金幣的 5%（單座上限 80 🪙）',
    apply: (t) => { t.bankRate = 0.05; t.bankCap = 80; },
  },
  // ── 相剋類：把「護甲倍率」往 1 拉近，專治打不動的怪 ──
  pierce: {
    label: '穿甲塢', icon: '🔩', color: '#ff6b6b',
    desc: '蓋在這裡的塔無視 25% 護甲減免（打重甲不再只有一半）',
    apply: (t) => { t.armorPierce = 0.25; },
  },
  // ── 成長類：越早蓋越值，跟「先蓋輸出」形成取捨 ──
  veteran: {
    label: '訓練場', icon: '🎖️', color: '#ffa94d',
    desc: '每清完一波，這座塔永久 +4% 威力（可累積）',
    apply: (t) => { t.vetRate = 0.04; t.vetStacks = 0; },
  },
  // ── 支援類：本身不強，但周圍的塔一起變強（考驗擺位） ──
  command: {
    label: '指揮所', icon: '📡', color: '#c77dff',
    desc: '半徑 220 內的其他塔威力 +15%（多座不疊加）',
    apply: (t) => { t.auraRadius = 220; t.auraMul = 0.15; },
  },
};

// 給 UI 用：某一格地基的加成定義（沒有 bonus 的一般建塔點回 null）
export function socketBonusOf(socket) {
  return socket && socket.bonus ? SOCKET_BONUSES[socket.bonus] || null : null;
}

// 給工具列／提示用的簡短一行，例如「🎯 高台：射程 +15%」
export function socketBonusLine(socket) {
  const b = socketBonusOf(socket);
  return b ? `${b.icon} ${b.label}：${b.desc}` : '';
}
