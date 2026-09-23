// 每日任務（參考噠噠特攻的每日任務）：每天依「本地日期」固定抽 3 個，跨局累積進度，
// 完成後在主選單「📋 每日任務」領金幣＋DNA。每日挑戰是固定一關；任務的目的則是
// 帶動玩家換武器、換打法（例如「用火箭打出 N 傷害」）。
//
// 進度在每局結算時由 main.js 收集本局數據（runStats），交給 save.progressQuests() 累加：
//   kills / elites / bosses / evos / jewels / chests / gold / clears —— 跨局相加
//   survive —— 取單局最長（「單局存活 N 秒」不能靠多局湊）
//   weapon:<id> —— 該武器家族（基礎＋超武）本局造成的傷害，跨局相加

import { WEAPONS } from './config.js';

// targets 依難度三檔，reward 跟檔位走（REWARD_TIERS）
export const QUEST_POOL = [
  { id: 'kills',  stat: 'kills',  desc: '累計擊殺 {n} 隻怪物',       targets: [600, 1200, 2000] },
  { id: 'elites', stat: 'elites', desc: '累計擊殺 {n} 隻精英怪',     targets: [30, 70, 120] },
  { id: 'bosses', stat: 'bosses', desc: '累計擊敗 {n} 隻首領',       targets: [1, 2, 4] },
  { id: 'survive', stat: 'survive', desc: '單局存活 {n}',            targets: [240, 360, 480], time: true },
  { id: 'evos',   stat: 'evos',   desc: '累計合成 {n} 把超武',       targets: [1, 2, 3] },
  { id: 'jewels', stat: 'jewels', desc: '累計撿到 {n} 顆珠寶',       targets: [5, 12, 20] },
  { id: 'chests', stat: 'chests', desc: '累計開啟 {n} 次幸運補給箱', targets: [3, 6, 10] },
  { id: 'gold',   stat: 'gold',   desc: '累計在局內賺到 {n} 金幣',   targets: [1500, 4000, 8000] },
  { id: 'clears', stat: 'clears', desc: '通關任一關卡 {n} 次',       targets: [1, 2, 3] },
  { id: 'weapon', stat: 'weapon', desc: '用{w}累計造成 {n} 傷害',    targets: [20000, 60000, 150000] },
];

export const REWARD_TIERS = [
  { gold: 200, dna: 20 },
  { gold: 400, dna: 40 },
  { gold: 700, dna: 70 },
];

// 本地日期 YYYYMMDD（每日任務在玩家的午夜換日）
export function localDateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// 依日期產生當天的 3 個任務（同一天永遠同一組）
export function generateDailyQuests(dateKey) {
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) seed = (seed * 31 + dateKey.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const pool = [...QUEST_POOL];
  const baseWeapons = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].isEvo);
  const list = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const def = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    const tier = Math.floor(rand() * def.targets.length);
    const q = { id: def.id, stat: def.stat, target: def.targets[tier], tier, progress: 0, claimed: false, ...REWARD_TIERS[tier] };
    if (def.stat === 'weapon') q.weapon = baseWeapons[Math.floor(rand() * baseWeapons.length)];
    list.push(q);
  }
  return list;
}

// 任務的顯示文字
export function questText(q) {
  const def = QUEST_POOL.find((d) => d.id === q.id);
  if (!def) return q.id;
  const n = def.time ? `${Math.floor(q.target / 60)} 分 ${String(q.target % 60).padStart(2, '0')} 秒` : q.target.toLocaleString();
  const w = q.weapon && WEAPONS[q.weapon] ? `${WEAPONS[q.weapon].icon}${WEAPONS[q.weapon].name}` : '';
  return def.desc.replace('{n}', n).replace('{w}', w);
}

// 本局數據 → 對一個任務的進度增量（survive 取最大值，其餘相加）
export function applyRunToQuest(q, run) {
  if (q.stat === 'survive') q.progress = Math.max(q.progress, Math.floor(run.survive || 0));
  else if (q.stat === 'weapon') q.progress += Math.floor((run.weaponDamage && run.weaponDamage[q.weapon]) || 0);
  else q.progress += Math.floor(run[q.stat] || 0);
  q.progress = Math.min(q.progress, q.target);
}
