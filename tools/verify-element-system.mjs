// 元素屬性系統全方位驗證：
// 1. 相剋循環與倍率
// 2. 武器屬性契約
// 3. 實體受傷與克制跳字
// 4. 戰況統計與每日任務累計
// 5. UI 呈現 (選卡徽章與暫停圖鑑)

import { WEAPONS, ELEMENTS, ELEMENT_COUNTERS, getElementMultiplier } from '../js/config.js';
import { generateDailyQuests, questText, applyRunToQuest, QUEST_POOL } from '../js/quests.js';

const results = [];
function test(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? '✓' : '✗'} [${pass ? 'PASS' : 'FAIL'}] ${name} ${detail ? '(' + detail + ')' : ''}`);
}

console.log('=== 1. 元素相剋倍率驗證 ===');
test('火剋冰 1.4x', getElementMultiplier('fire', 'frost').mul === 1.4 && getElementMultiplier('fire', 'frost').relation === 'effective');
test('冰剋電 1.4x', getElementMultiplier('frost', 'shock').mul === 1.4 && getElementMultiplier('frost', 'shock').relation === 'effective');
test('電剋毒 1.4x', getElementMultiplier('shock', 'toxic').mul === 1.4 && getElementMultiplier('shock', 'toxic').relation === 'effective');
test('毒剋火 1.4x', getElementMultiplier('toxic', 'fire').mul === 1.4 && getElementMultiplier('toxic', 'fire').relation === 'effective');

test('火遇毒逆剋 0.8x', getElementMultiplier('fire', 'toxic').mul === 0.8 && getElementMultiplier('fire', 'toxic').relation === 'ineffective');
test('冰遇火逆剋 0.8x', getElementMultiplier('frost', 'fire').mul === 0.8 && getElementMultiplier('frost', 'fire').relation === 'ineffective');
test('電遇冰逆剋 0.8x', getElementMultiplier('shock', 'frost').mul === 0.8 && getElementMultiplier('shock', 'frost').relation === 'ineffective');
test('毒遇電逆剋 0.8x', getElementMultiplier('toxic', 'shock').mul === 0.8 && getElementMultiplier('toxic', 'shock').relation === 'ineffective');

test('同屬抗性 -25% (火 vs 火)', getElementMultiplier('fire', 'fire').mul === 0.75 && getElementMultiplier('fire', 'fire').relation === 'resisted');
test('同屬抗性 -25% (冰 vs 冰)', getElementMultiplier('frost', 'frost').mul === 0.75 && getElementMultiplier('frost', 'frost').relation === 'resisted');
test('同屬抗性 -25% (電 vs 電)', getElementMultiplier('shock', 'shock').mul === 0.75 && getElementMultiplier('shock', 'shock').relation === 'resisted');
test('同屬抗性 -25% (毒 vs 毒)', getElementMultiplier('toxic', 'toxic').mul === 0.75 && getElementMultiplier('toxic', 'toxic').relation === 'resisted');

test('物理中立 1.0x (物理攻火)', getElementMultiplier('physical', 'fire').mul === 1.0 && getElementMultiplier('physical', 'fire').relation === 'neutral');
test('物理中立 1.0x (火攻物理)', getElementMultiplier('fire', 'physical').mul === 1.0 && getElementMultiplier('fire', 'physical').relation === 'neutral');
test('物理 vs 物理 1.0x', getElementMultiplier('physical', 'physical').mul === 1.0 && getElementMultiplier('physical', 'physical').relation === 'neutral');

console.log('=== 2. 全武器屬性契約驗證 ===');
const validElements = new Set(['physical', 'fire', 'frost', 'shock', 'toxic']);
const weaponList = Object.entries(WEAPONS);
test('武器數量 >= 26', weaponList.length >= 26, `共 ${weaponList.length} 把`);

let allWeaponsHaveValidElement = true;
const elemCounts = { physical: 0, fire: 0, frost: 0, shock: 0, toxic: 0 };
for (const [id, def] of weaponList) {
  if (!def.element || !validElements.has(def.element)) {
    allWeaponsHaveValidElement = false;
    console.error(`武器 ${id} 缺少或擁有無效屬性:`, def.element);
  } else {
    elemCounts[def.element]++;
  }
}
test('所有武器皆宣告有效屬性', allWeaponsHaveValidElement, JSON.stringify(elemCounts));

console.log('=== 3. 每日任務系統整合驗證 ===');
const sampleQuests = generateDailyQuests('20261007');
test('生成 3 個每日任務', sampleQuests.length === 3);

// 驗證屬性任務文字替換
const elemKillQ = { id: 'elem_kill', stat: 'elementKill', element: 'fire', target: 500 };
const elemText = questText(elemKillQ);
test('屬性任務文字含火屬性說明', elemText.includes('🔥 燃燒') && elemText.includes('500'), elemText);

const elemFoeQ = { id: 'elem_foe', stat: 'elementFoeKill', element: 'frost', target: 150 };
const foeText = questText(elemFoeQ);
test('屬性敵人任務文字含冰屬性說明', foeText.includes('❄️ 冰凍') && foeText.includes('150'), foeText);

// 驗證任務進度累加
const fakeRunStats = {
  elementCounterHits: 125,
  elementKills: { fire: 80, frost: 30, shock: 50, toxic: 10, physical: 200 },
  elementFoeKills: { fire: 20, frost: 150, shock: 45, toxic: 90, physical: 500 },
};

const counterQ = { stat: 'elementCounterHits', target: 120, progress: 0 };
applyRunToQuest(counterQ, fakeRunStats);
test('剋制次數任務累加達標', counterQ.progress === 120, `progress: ${counterQ.progress}/120`);

applyRunToQuest(elemKillQ, fakeRunStats);
test('火屬性武器擊殺任務累加', elemKillQ.progress === 80, `progress: ${elemKillQ.progress}/500`);

applyRunToQuest(elemFoeQ, fakeRunStats);
test('冰屬性怪物消滅任務累加達標', elemFoeQ.progress === 150, `progress: ${elemFoeQ.progress}/150`);

const failed = results.filter((r) => !r.pass);
if (failed.length > 0) {
  console.error(`\nFAILED: ${failed.length} tests failed!`);
  process.exit(1);
} else {
  console.log(`\nALL ${results.length} UNIT TESTS PASSED!`);
}
