// 守塔王國升級 (Kingdom Upgrades)
//
// 為什麼要這個：守塔原本只有「打怪 → 賺錢 → 蓋塔／升級塔」一條線，金幣的唯一用途是變強，
// 而且強的方式只有「再多一座塔」。王國升級是第二條消費曲線 —— 錢可以拿去買全局的、
// 不佔建塔點、不怕被拆的長期投資。這讓「這一波要蓋塔還是先升稅收」變成真的選擇，
// 也讓前期的每 1 塊錢在後期都還在滾。
//
// 純資料：買了之後的實際效果在 js/systems/TowerDefense.js 的 kingdomStat() / buyKingdom()，
// 面板在 js/systems/UI.js 的 showKingdomPanel()。這裡不 import 任何東西。

// val 的語意照 track 而定：economy/engineering/ballistics/optics/hero 是「比例」，
// logistics 是「每剩 1 秒的額外金幣」（原值見 TowerDefense.js 的 EARLY_GOLD_PER_SEC = 4）。
export const KINGDOM_UPGRADES = [
  {
    key: 'economy', icon: '💰', name: '稅收', val: 'pct',
    desc: '提高每波清空的獎金。拖長戰線、靠清波賺錢的路線。',
    levels: [
      { cost: 150, val: 0.20, text: '每波獎金 +20%' },
      { cost: 320, val: 0.45, text: '每波獎金 +45%' },
      { cost: 640, val: 0.80, text: '每波獎金 +80%' },
    ],
  },
  {
    key: 'engineering', icon: '🔧', name: '工程學', val: 'pct',
    desc: '降低所有塔的造價與升級、專精費用。越早買越賺。',
    levels: [
      { cost: 180, val: 0.08, text: '造塔／升級費用 -8%' },
      { cost: 380, val: 0.16, text: '造塔／升級費用 -16%' },
      { cost: 760, val: 0.25, text: '造塔／升級費用 -25%' },
    ],
  },
  {
    key: 'ballistics', icon: '🎯', name: '彈道學', val: 'pct',
    desc: '提高所有塔的威力。已經蓋好的塔也立刻受益。',
    levels: [
      { cost: 200, val: 0.10, text: '全塔威力 +10%' },
      { cost: 440, val: 0.22, text: '全塔威力 +22%' },
      { cost: 880, val: 0.35, text: '全塔威力 +35%' },
    ],
  },
  {
    key: 'optics', icon: '🔭', name: '光學', val: 'pct',
    desc: '提高所有塔的射程。對射程短的加農砲特別有感。',
    levels: [
      { cost: 200, val: 0.06, text: '全塔射程 +6%' },
      { cost: 440, val: 0.13, text: '全塔射程 +13%' },
      { cost: 880, val: 0.20, text: '全塔射程 +20%' },
    ],
  },
  {
    key: 'logistics', icon: '🚚', name: '後勤', val: 'flat',
    desc: '提高提前開戰的金幣。敢提前打就滾得快，是激進路線的核心。',
    levels: [
      { cost: 160, val: 2, text: '提前開戰每剩 1 秒 +6 🪙（原 4）' },
      { cost: 360, val: 4, text: '提前開戰每剩 1 秒 +8 🪙' },
      { cost: 720, val: 7, text: '提前開戰每剩 1 秒 +11 🪙' },
    ],
  },
  {
    key: 'hero', icon: '⚔️', name: '英雄訓練', val: 'pct',
    desc: '提高英雄的攻擊與技能（援軍、隕石）威力。英雄是你唯一能移動的戰力。',
    levels: [
      { cost: 220, val: 0.15, text: '英雄攻擊／技能威力 +15%' },
      { cost: 480, val: 0.32, text: '英雄攻擊／技能威力 +32%' },
      { cost: 960, val: 0.50, text: '英雄攻擊／技能威力 +50%' },
    ],
  },
];

export const KINGDOM_MAX = 3;

export function kingdomTrack(key) {
  return KINGDOM_UPGRADES.find((t) => t.key === key) || null;
}

// 目前等級（0 = 還沒買）帶來的數值；買滿之後再問就是最後一階的值
export function kingdomValue(key, level) {
  const track = kingdomTrack(key);
  if (!track || !level) return 0;
  const i = Math.min(level, track.levels.length) - 1;
  return track.levels[i].val;
}

// 下一階的價格；已滿級回 null
export function kingdomNextCost(key, level) {
  const track = kingdomTrack(key);
  if (!track || level >= track.levels.length) return null;
  return track.levels[level].cost;
}
