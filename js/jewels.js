// 珠寶：局內掉落的貴重品，撿到當下就寫進存檔 —— 陣亡、放棄任務、關掉網頁都不會丟。
// 回到主選單在「特工黑市 → 💎 珠寶收購」換成金幣＋DNA，是升級特工等級的穩定財源。
// 純資料檔，不 import 任何模組。
//
// 為什麼要有：局外養成（特工等級要金幣＋DNA、指數成長）後期很吃資源，
// 而局內金幣與 DNA 的主要來源都跟「撐多久、殺多少」綁在一起，打不過的關卡幾乎賺不到。
// 珠寶的掉落集中在精英與 Boss，就算陣亡也能帶回，讓「挑戰打不過的關卡」本身也有收穫。

export const JEWELS = {
  quartz:   { id: 'quartz',   name: '碎晶石',   icon: '💠', color: '#90e0ef', gold: 30,  dna: 1,  weight: 55 },
  pearl:    { id: 'pearl',    name: '深海珍珠', icon: '🦪', color: '#f1faee', gold: 70,  dna: 1,  weight: 27 },
  sapphire: { id: 'sapphire', name: '藍寶石',   icon: '💎', color: '#4895ef', gold: 160, dna: 3,  weight: 12 },
  ring:     { id: 'ring',     name: '特工金戒', icon: '💍', color: '#ffd166', gold: 350, dna: 7,  weight: 5 },
  crown:    { id: 'crown',    name: '古代王冠', icon: '👑', color: '#ffb703', gold: 900, dna: 18, weight: 1 },
};

export const JEWEL_ORDER = ['quartz', 'pearl', 'sapphire', 'ring', 'crown'];

// 掉落機率（每次擊殺／破壞）。Boss 必掉、數量與稀有度都更高。
// 量測（第一關打到終極首領、約 2,000~2,500 擊殺、250 隻精英、5 局）：一局約 20 顆，
// 換得的金幣是該局金幣收入的 26~69%（中位數 44%）、DNA 是該局 DNA 的 20~57%（中位數 29%）。
// 波動主要來自王冠（900 🪙）—— 是補充與驚喜，不取代打怪。
export const JEWEL_DROP = {
  normal: 0.003,     // 雜兵
  elite: 0.08,       // 精英（精英很多：一局兩三百隻）
  crate: 0.06,       // 街頭木箱／油桶
  boss: 2,           // Boss 必掉幾顆
  finalBoss: 3,      // 終極首領必掉幾顆
};

// 抽一顆珠寶。boost > 0 時把權重往高階推（第 i 階權重 × (1 + boost)^i），Boss 用
export function rollJewel(boost = 0, rand = Math.random) {
  const weights = JEWEL_ORDER.map((id, i) => JEWELS[id].weight * Math.pow(1 + boost, i));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < JEWEL_ORDER.length; i++) {
    if (r < weights[i]) return JEWEL_ORDER[i];
    r -= weights[i];
  }
  return JEWEL_ORDER[0];
}

// 一批珠寶的收購價 { gold, dna }（bag = { id: 數量 }）
export function jewelValue(bag = {}) {
  let gold = 0;
  let dna = 0;
  for (const [id, n] of Object.entries(bag)) {
    const j = JEWELS[id];
    if (!j || !(n > 0)) continue;
    gold += j.gold * n;
    dna += j.dna * n;
  }
  return { gold, dna };
}
