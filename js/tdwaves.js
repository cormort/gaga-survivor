// 守塔波次詞綴 (Wave Modifiers)
//
// 為什麼要這個：守塔關的波次原本只有「血量倍率 + 怪種組合」，第 3 波跟第 7 波打起來
// 是同一個節奏 —— 差別只有數字變大。詞綴讓同一套怪種產生不同的應對：
// 疾行逼你補控制／補射程，重甲縱隊逼你換攻城或魔法，蟲潮逼你補範圍清場，
// 空襲逼你在路邊留對空位，精英與要塞則是「同一波但更硬」的節奏變化。
//
// 純資料：數值怎麼乘在 js/systems/TowerDefense.js 的 startWave()/spawn() 實作，
// 顯示則在 js/systems/UI.js 的 updateWavePreview()。這裡不 import 任何東西。

export const WAVE_MODS = {
  swift: {
    icon: '🏃', name: '疾行', color: '#7fd1ff',
    desc: '移速 +35%、血量 -15%：來不及打完就衝過去了',
  },
  armored: {
    icon: '🛡️', name: '重甲縱隊', color: '#c9d3df',
    desc: '全體視為重甲：穿刺只剩一半，換攻城或魔法',
  },
  swarm: {
    icon: '🐜', name: '蟲潮', color: '#9be37a',
    desc: '數量 ×1.5、單體血量 -20%：考驗清場速度',
  },
  aerial: {
    icon: '🦇', name: '空襲', color: '#7fd1ff',
    desc: '額外一批飛行單位：加農砲與兵營打不到',
  },
  elite: {
    icon: '⭐', name: '精英', color: '#ffd166',
    desc: '血量 +45%、賞金 +80%：硬，但打完很有錢',
  },
  fortified: {
    icon: '🧱', name: '要塞', color: '#ffa94d',
    desc: '血量 +30%、移速 -15%：走得慢，但非常耐打',
  },
};

// 詞綴的數值（倍率相乘，可同時掛多個）
const WAVE_MOD_MUL = {
  swift: { hp: 0.85, speed: 1.35 },
  swarm: { hp: 0.80, count: 1.5 },
  elite: { hp: 1.45, bounty: 1.8 },
  fortified: { hp: 1.30, speed: 0.85 },
  armored: {},   // 只改護甲分類
  aerial: {},    // 只追加一群飛行怪
};

// 空襲詞綴追加的怪種。挑 bat 是因為每個守塔關的 ARMOR_CLASS 都有它（air），
// 不用每關另外指定；主題關卡要換成自己的飛行怪時再從關卡欄位擴充。
export const AIR_FILLER = 'bat';

// 一批詞綴 → 一組倍率。未知的詞綴直接忽略（打錯字不會讓整波壞掉）。
export function waveModMul(mods) {
  const out = { hp: 1, speed: 1, count: 1, bounty: 1 };
  for (const m of mods || []) {
    const k = WAVE_MOD_MUL[m];
    if (!k) continue;
    if (k.hp) out.hp *= k.hp;
    if (k.speed) out.speed *= k.speed;
    if (k.count) out.count *= k.count;
    if (k.bounty) out.bounty *= k.bounty;
  }
  return out;
}

// 詞綴清單 → 顯示用小標籤（UI 直接塞進 DOM）
export function waveModChips(mods) {
  return (mods || []).map((m) => {
    const d = WAVE_MODS[m];
    return d ? { key: m, icon: d.icon, name: d.name, color: d.color, desc: d.desc } : null;
  }).filter(Boolean);
}
