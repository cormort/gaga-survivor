// 模組化重構的守門員：找出「透過 game 物件呼叫已搬走方法」的殘留引用。
//
// 為什麼需要：模組化時方法從 Game 搬到 systems/*.js，但 **同一個方法名可能仍以
// `game.foo(...)` 的形式被其他檔案呼叫**。這種引用在搬移的當下不會有任何錯誤 ——
// 直到執行到那一行才變成 `TypeError: game.foo is not a function`，而且往往在罕見
// 分支上（實際發生過：Progression 的擊殺里程碑呼叫 game.checkMerchantSchedule，
// 商人搬走後整條 update 迴圈每幀拋例外，畫面卡住但沒有明顯訊息）。
//
// 檢查三件事：
//   1. js/**/*.js（不含 main.js）裡的 `game.X(` ：X 必須是 Game 的成員，或該檔案
//      自己 import／定義的函式（後者代表忘記改寫成 `X(game, ...)`）。
//   2. main.js 裡的裸 `game.X(`（模組層的 game 變數，不是 this.）：X 必須是 Game 成員。
//   3. 各模組是否 import 了不存在的名字（拼字錯誤）。
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

if (problems.length) {
  console.log('❌ 發現', problems.length, '處重構殘留引用：');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log(`✅ 沒有殘留引用（Game 成員 ${members.size} 個、已檢查 ${walk(join(ROOT, 'js')).length} 個檔案）`);
