// 模組化重構的守門員：找出「透過 game 物件呼叫已搬走方法」的殘留引用。
//
// 為什麼需要：模組化時方法從 Game 搬到 systems/*.js，但 **同一個方法名可能仍以
// `game.foo(...)` 的形式被其他檔案呼叫**。這種引用在搬移的當下不會有任何錯誤 ——
// 直到執行到那一行才變成 `TypeError: game.foo is not a function`，而且往往在罕見
// 分支上（實際發生過：Progression 的擊殺里程碑呼叫 game.checkMerchantSchedule，
// 商人搬走後整條 update 迴圈每幀拋例外，畫面卡住但沒有明顯訊息）。
//
// 檢查四件事：
//   1. js/**/*.js（不含 main.js）裡的 `game.X(` ：X 必須是 Game 的成員，或該檔案
//      自己 import／定義的函式（後者代表忘記改寫成 `X(game, ...)`）。
//   2. main.js 裡的裸 `game.X(`（模組層的 game 變數，不是 this.）：X 必須是 Game 成員。
//   3. 各模組是否 import 了不存在的名字（拼字錯誤）。
//   4. **用了某個跨模組匯出的名字，但自己沒有 import 它**（線上事故：
//      `js/systems/Merchant.js` 用了 `MERCHANT_ITEMS` 卻沒 import —— 模組化抽出時漏掉，
//      語法檢查、單元層級的煙霧測試都攔不到，因為它只在「流浪商人出現」那一行才會爆，
//      而煙霧測試當時只測了買東西、沒測商人出現。玩家在 02:34 撞到，畫面直接停止更新）。
//
// 用法：node tools/check-refactor-refs.mjs   （離開碼 1 表示有殘留引用）

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MAIN = 'js/main.js';

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};

// 把註解與字串遮蔽成空白（長度不變，所以行號仍然對得上）。
// 為什麼要：第 4 項檢查是「找自由識別字」，而註解裡很常提到型別名
// （例如「手法與 js/systems/Hazards.js 相同」），不遮掉會整片誤判。
// `//` 前面要求不是 `:`，以免把 `https://…` 這種字串裡的斜線當成註解。
const mask = (m) => ' '.repeat(m.length);
const stripNoise = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, mask)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
  .replace(/'(?:\\.|[^'\\\n])*'/g, mask)
  .replace(/"(?:\\.|[^"\\\n])*"/g, mask)
  // 展開運算子 `...NAME` 的點會被「前面不是 . 」的判斷當成屬性存取而漏掉
  // （MERCHANT_ITEMS 就是這樣漏掉的：用法是 [...MERCHANT_ITEMS]）→ 先把 ... 遮掉
  .replace(/\.\.\./g, '   ');

const main = readFileSync(join(ROOT, MAIN), 'utf8');

// Game 類別的成員（方法與 getter/setter）
const members = new Set();
let inside = false;
for (const line of main.split('\n')) {
  if (line.startsWith('class Game')) { inside = true; continue; }
  if (!inside) continue;
  const m = line.match(/^ {2}(?:get |set )?([A-Za-z_$][\w$]*)\s*[({]/);
  if (m) members.add(m[1]);
}

// main.js 由各處 import 的名稱（用來判斷模組是否 import 了不存在的東西）
const mainImports = new Map();
for (const m of main.matchAll(/import\s+(?:(\w+)|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/g)) {
  if (m[1]) mainImports.set(m[1], m[3]);
  if (m[2]) for (const n of m[2].split(',')) {
    const name = n.trim().split(' as ').pop().trim();
    if (name) mainImports.set(name, m[3]);
  }
}

const problems = [];

// 1) 各模組內的 game.X(
for (const file of walk(join(ROOT, 'js'))) {
  if (file.endsWith(MAIN)) continue;
  const src = readFileSync(file, 'utf8');
  const own = new Set([
    ...[...src.matchAll(/^(?:export )?function ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
    ...[...src.matchAll(/import\s+\{([^}]*)\}\s+from/g)].flatMap((m) =>
      m[1].split(',').map((n) => n.trim().split(' as ').pop().trim()).filter(Boolean)),
  ]);
  for (const m of src.matchAll(/(?<![\w$.])game\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (members.has(name)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    problems.push(own.has(name)
      ? `${relative(ROOT, file)}:${line} game.${name}(…) —— 這是本模組自己的函式，應改寫成 ${name}(game, …)`
      : `${relative(ROOT, file)}:${line} game.${name}(…) —— Game 上沒有這個成員（方法被搬走了？）`);
  }
}

// 2) main.js 內的裸 game.X(
for (const m of main.matchAll(/(?<![\w$.])game\.([A-Za-z_$][\w$]*)\s*\(/g)) {
  const name = m[1];
  if (members.has(name)) continue;
  const line = main.slice(0, m.index).split('\n').length;
  problems.push(`${MAIN}:${line} game.${name}(…) —— Game 上沒有這個成員`);
}

// 3) 各模組 import 的名字是否存在於目標模組的 export（僅檢查相對路徑）
for (const file of walk(join(ROOT, 'js'))) {
  if (file.endsWith(MAIN)) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const target = join(file, '..', m[2]);
    let targetSrc;
    try { targetSrc = readFileSync(target, 'utf8'); } catch { continue; }
    const exported = new Set([
      ...[...targetSrc.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((x) => x[1]),
      ...[...targetSrc.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((x) =>
        x[1].split(',').map((n) => n.trim().split(' as ').pop().trim()).filter(Boolean)),
    ]);
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(' as ')[0].trim();
      if (!name || exported.has(name)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      problems.push(`${relative(ROOT, file)}:${line} import { ${name} } from '${m[2]}' —— 目標沒有匯出這個名字`);
    }
  }
}

// 4) 用了跨模組匯出的名字卻沒有 import（＝執行到那一行才會 ReferenceError）
// 先把全專案的 export 名字收集起來（含 main.js），再逐檔檢查「有沒有自己引進或宣告」。
const exportOwners = new Map();   // 名字 → 匯出它的檔案（用來排除同名自宣告）
for (const file of walk(join(ROOT, 'js'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!exportOwners.has(m[1])) exportOwners.set(m[1], relative(ROOT, file));
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name && !exportOwners.has(name)) exportOwners.set(name, relative(ROOT, file));
    }
  }
}

// 只檢查「模組層級的常數／函式／類別」型名字（全大寫常數或 PascalCase 類別），
// 避免把區域變數誤判成漏 import。駝峰小寫的匯出函式名稱太容易與區域變數同名，不查。
const checkable = new Set([...exportOwners.keys()].filter((n) => /^[A-Z][A-Z0-9_]*$/.test(n) || /^[A-Z][A-Za-z0-9]*$/.test(n)));

for (const file of walk(join(ROOT, 'js'))) {
  const raw = readFileSync(file, 'utf8');       // 可用性看原文（import 的路徑字串不能被遮）
  const src = stripNoise(raw);                  // 使用偵測看遮蔽版（避免註解裡的名字誤判）
  // 這張檔案「自己拿得到」的名字：import 進來的、自己宣告的、自己的 export
  const avail = new Set();
  for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    for (const n of m[1].matchAll(/[A-Za-z_$][\w$]*/g)) avail.add(n[0]);
  }
  for (const m of raw.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) avail.add(m[1]);
  for (const name of checkable) {
    if (avail.has(name)) continue;
    // 只找「自由識別字」用法：前面不是 . 或 $，後面不是 :（物件鍵）或做為屬性名
    const re = new RegExp(`(?<![\\w$.])${name}(?![\\w$])(?!\\s*:)`, 'g');
    const hit = re.exec(src);
    if (!hit) continue;
    // 自己也有同名定義的檔案（例如 main.js 匯入後再轉出）不算
    const line = src.slice(0, hit.index).split('\n').length;
    const owner = exportOwners.get(name);
    if (owner === relative(ROOT, file)) continue;
    problems.push(`${relative(ROOT, file)}:${line} 使用了 ${name}（由 ${owner} 匯出）但沒有 import —— 執行到這行會 ReferenceError`);
  }
}

if (problems.length) {
  console.log('❌ 發現', problems.length, '處重構殘留引用：');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log(`✅ 沒有殘留引用（Game 成員 ${members.size} 個、已檢查 ${walk(join(ROOT, 'js')).length} 個檔案）`);
