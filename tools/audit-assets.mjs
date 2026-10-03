// assets/ 資產盤點：找出「沒有任何程式碼引用的死檔」與「預快取清單的缺口」。
//
// 為什麼要這支：整個 assets/ 有 46MB / 209 個檔，其中地面貼圖一種就 23MB。
// 這些檔案會**全部**進 sw.js 的 PRECACHE —— 每次發版（版本號一動）所有玩家都要
// 重抓一次，而 PWA 是在背景抓，過程中遊戲畫面是拿舊快取在跑。資產越多，
// 「換版後第一眼的延遲／殘缺」就越明顯（實際事故：選角頭像整片空白）。
// 所以要知道兩件事：
//   1. 哪些檔案根本沒有人引用 → 可以從 PRECACHE 拿掉、甚至刪掉
//   2. 哪些「有被引用但沒進 PRECACHE」→ 離線時會缺（比死檔更該修）
//
// 引用來源全部是表驅動（檔名由 key 組出來），所以不能只 grep 檔名字串：
//   js/sprites.js            IMAGE_SPRITES / DECOR_PNG_SPRITES / ZODIAC_SPRITES / BOSS_PNG_SPRITES
//                            / MAKAIMURA_SPRITES（魔界村角色與魔物，路徑為 assets/makaimura/）
//   js/weapons/WeaponArt.js  WEAPON_ART 的 key
//   js/systems/Ground.js     地表貼圖 id 陣列
//   js/entities/EnemyProjectile.js  ENEMY_BULLET_KEYS
//   js/entities/Turret.js           FACILITY_IMAGE_KEYS、TD_IMAGE_KEYS（守塔塔種：塔線 × 1/2/3 級＋專精）
//   js/entities/AlliedUnit.js       UNIT_IMAGE_KEYS（守塔小兵逐格動畫）
//   js/systems/TowerDefense.js      TD_STRUCTURE_KEYS（守塔入口巢穴與主堡）
//   js/entities/DropItem.js         DROP_ITEM_KEYS（其中兩個放在 decor/）
//   ＋ js/ 與 index.html / css / manifest 裡任何寫死的 `assets/...` 字串
//
// 用法：node tools/audit-assets.mjs [--strict]
//   --strict：有死檔或預快取缺口時離開碼 1（給 CI／發版前把關用）

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows 上 `new URL(import.meta.url).pathname` 會給出 `/D:/...`，
// 再 path.join 一次就變成 `D:\D:\...`（全部讀不到）。用 fileURLToPath 才是可攜的寫法。
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STRICT = process.argv.includes('--strict');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/* ── 1) 磁碟上實際有哪些資產 ── */
const walk = (dir, out = []) => {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};
const onDisk = [...walk('assets'), ...walk('icons')];

/* ── 2) 從程式碼收集「被引用」的檔案 ── */
const used = new Map();      // 相對路徑 -> 引用來源說明

function add(file, why) {
  const clean = file.replace(/^\.\//, '');
  if (!used.has(clean)) used.set(clean, why);
}
// 表驅動：const NAME = { key: ... } / const NAME = [ 'key', ... ]
// ⚠️ 這些表常常「一行塞好幾個 key」（`rat_hero: 62, ox_hero: 66, ...`），
// 所以不能只抓行首的 `key:` —— 那會漏掉大部分，把在用的檔案誤判成死檔。
// 這裡改成抓「值是個數字」的 key（sprites.js 的四張表都是 key -> 高度）。
function objKeys(src, name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  return m ? [...m[1].matchAll(/([A-Za-z_][\w$]*)\s*:\s*-?\d/g)].map((x) => x[1]) : [];
}
// 值是大括號物件的表（WEAPON_ART），key 一定在行首
function objKeysBraced(src, name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  return m ? [...m[1].matchAll(/^\s*([A-Za-z_][\w$]*)\s*:\s*\{/gm)].map((x) => x[1]) : [];
}
function arrStrings(src, name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}

const spritesSrc = read('js/sprites.js');
for (const k of objKeys(spritesSrc, 'IMAGE_SPRITES')) add(`assets/xian/${k}.png`, 'sprites.js IMAGE_SPRITES');
for (const k of objKeys(spritesSrc, 'DECOR_PNG_SPRITES')) add(`assets/decor/${k}.png`, 'sprites.js DECOR_PNG_SPRITES');
for (const k of objKeys(spritesSrc, 'ZODIAC_SPRITES')) add(`assets/zodiac/${k}.png`, 'sprites.js ZODIAC_SPRITES');
for (const k of objKeys(spritesSrc, 'BOSS_PNG_SPRITES')) add(`assets/bosses/${k}.png`, 'sprites.js BOSS_PNG_SPRITES');
for (const k of objKeys(spritesSrc, 'MAKAIMURA_SPRITES')) add(`assets/makaimura/${k}.png`, 'sprites.js MAKAIMURA_SPRITES');
for (const k of objKeys(spritesSrc, 'TD_ENEMY_SPRITES')) add(`assets/td/enemies/${k}.png`, 'sprites.js TD_ENEMY_SPRITES（守塔主題敵人）');

const weaponSrc = read('js/weapons/WeaponArt.js');
for (const id of objKeysBraced(weaponSrc, 'WEAPON_ART')) add(`assets/weapons/${id}.png`, 'WeaponArt.js WEAPON_ART');

const groundSrc = read('js/systems/Ground.js');
const groundIds = (groundSrc.match(/_initGroundPngs\(\)\s*\{[\s\S]*?const ids = \[([\s\S]*?)\];/) || [])[1] || '';
for (const id of [...groundIds.matchAll(/'([^']+)'/g)].map((x) => x[1])) {
  add(`assets/ground/ground_${id}.png`, 'Ground.js 地表貼圖');
}

// 地表貼圖：檔名由關卡 id 組出來（Ground.js 的 _ensureGroundPng(`assets/ground/ground_${id}.png`)），
// 而關卡 id 就是 levels.js 裡的 id。少這一段，12 張地表會被誤判成死檔。
const levelSrc = read('js/levels.js');
for (const m of levelSrc.matchAll(/^\s*id:\s*'([a-z_0-9]+)'/gm)) add(`assets/ground/ground_${m[1]}.png`, 'Ground.js 地表貼圖（進關才抓）');
// 守塔關卡（js/tdlevels.js）也一樣是一關一張地表貼圖
for (const m of read('js/tdlevels.js').matchAll(/^\s*id:\s*'([a-z_0-9]+)'/gm)) add(`assets/ground/ground_${m[1]}.png`, 'Ground.js 地表貼圖（守塔關，進關才抓）');

const bulletSrc = read('js/entities/EnemyProjectile.js');
for (const k of arrStrings(bulletSrc, 'ENEMY_BULLET_KEYS')) add(`assets/bullets/${k}.png`, 'EnemyProjectile.js');

const turretSrc = read('js/entities/Turret.js');
for (const k of arrStrings(turretSrc, 'FACILITY_IMAGE_KEYS')) add(`assets/facilities/${k}.png`, 'Turret.js FACILITY_IMAGE_KEYS');
// 守塔塔種：{ 塔線: [專精, 專精] } → assets/td/<塔線>_<1|2|3|專精>.png
const tdBody = (turretSrc.match(/const TD_IMAGE_KEYS\s*=\s*\{([\s\S]*?)\};/) || [])[1] || '';
for (const [, line, list] of tdBody.matchAll(/([a-z_]+):\s*\[([^\]]*)\]/g)) {
  for (const stage of ['1', '2', '3', ...[...list.matchAll(/'([^']+)'/g)].map((x) => x[1])]) {
    add(`assets/td/${line}_${stage}.png`, 'Turret.js TD_IMAGE_KEYS');
  }
}
for (const k of arrStrings(read('js/entities/AlliedUnit.js'), 'UNIT_IMAGE_KEYS')) add(`assets/td/${k}.png`, 'AlliedUnit.js UNIT_IMAGE_KEYS');
for (const k of arrStrings(read('js/systems/TowerDefense.js'), 'TD_STRUCTURE_KEYS')) add(`assets/td/${k}.png`, 'TowerDefense.js TD_STRUCTURE_KEYS');

const dropSrc = read('js/entities/DropItem.js');
for (const k of arrStrings(dropSrc, 'DROP_ITEM_KEYS')) {
  const dir = (k === 'barrel_red' || k === 'crate_wood') ? 'assets/decor' : 'assets/items';
  add(`${dir}/${k}.png`, 'DropItem.js DROP_ITEM_KEYS');
}

// 寫死的字串（含 index.html / css / manifest 的圖示）
const codeFiles = [
  ...walk('js').filter((f) => f.endsWith('.js')),
  'index.html', 'css/style.css', 'manifest.webmanifest',
];
for (const f of codeFiles) {
  for (const m of read(f).matchAll(/['"`(](\.?\/?(?:assets|icons)\/[\w./-]+\.(?:png|jpg|jpeg|webp|svg))(?:\?[^'"`)]*)?['"`)]/g)) {
    add(m[1].replace(/^\.\//, ''), `${f} 寫死的路徑`);
  }
}

/* ── 3) sw.js 的預快取清單 ── */
// 刻意「不進預快取、改成用到才抓」的檔案。目前只有地表貼圖：一關一張各 1.4~2.3MB，
// 開場全抓是 22.6MB 而一場只用到一張（見 Ground.js 的 _ensureGroundPng）。
const ON_DEMAND = [/^assets\/ground\//];

// 維護用原始檔：不會被程式載入，但要留在 repo 裡（要改圖示時從它產出 PNG）。
const MAINTENANCE = ['icons/icon-maskable.svg'];

const swSrc = read('sw.js');
const precache = new Set(
  [...(swSrc.match(/const PRECACHE = \[([\s\S]*?)\];/)[1]).matchAll(/'([^']+)'/g)]
    .map((x) => x[1].replace(/^\.\//, ''))
    .filter((p) => p !== '' && p !== '.')
);

/* ── 4) 報告 ── */
const size = (rel) => { try { return statSync(path.join(ROOT, rel)).size; } catch (err) { return 0; } };
const mb = (n) => (n / 1048576).toFixed(1);

const unused = onDisk.filter((f) => !used.has(f) && !MAINTENANCE.includes(f)).sort();
const missing = [...used.keys()].filter((f) => !onDisk.includes(f)).sort();
const notPrecached = onDisk
  .filter((f) => used.has(f) && !precache.has(f) && !ON_DEMAND.some((re) => re.test(f)))
  .sort();
const precachedMissing = [...precache].filter((p) => p.startsWith('assets/') && !onDisk.includes(p)).sort();

const totalBytes = onDisk.reduce((s, f) => s + size(f), 0);
const unusedBytes = unused.reduce((s, f) => s + size(f), 0);
const precacheAssetBytes = onDisk.filter((f) => precache.has(f)).reduce((s, f) => s + size(f), 0);

const byDir = {};
for (const f of onDisk) {
  const parts = f.split('/');
  const d = parts[0] === 'assets' ? parts[1] : parts[0];
  byDir[d] = byDir[d] || { files: 0, bytes: 0, unused: 0 };
  byDir[d].files++;
  byDir[d].bytes += size(f);
  if (!used.has(f)) byDir[d].unused++;
}

console.log('── assets/ 盤點（含 icons/）──');
console.log(`總計 ${onDisk.length} 檔 / ${mb(totalBytes)}MB｜其中 ${precacheAssetBytes ? mb(precacheAssetBytes) : 0}MB 進了 PWA 預快取`);
console.log('');
console.log('資料夾'.padEnd(14) + '檔案'.padStart(6) + '大小'.padStart(10) + '沒人用'.padStart(8));
for (const [d, v] of Object.entries(byDir).sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`${d}/`.padEnd(14) + String(v.files).padStart(6) + `${mb(v.bytes)}MB`.padStart(10) + String(v.unused).padStart(8));
}
console.log('');

if (unused.length) {
  console.log(`⚠️  沒有任何程式碼引用（${unused.length} 檔 / ${mb(unusedBytes)}MB）：`);
  for (const f of unused) {
    console.log(`    ${f}  ${(size(f) / 1024).toFixed(1)}KB${precache.has(f) ? '  ← 還在預快取清單裡，玩家每次換版都會重抓' : ''}`);
  }
} else {
  console.log('✅ 沒有死檔');
}
console.log('');

if (notPrecached.length) {
  console.log(`⚠️  有引用但不在預快取清單（離線時會缺，${notPrecached.length} 檔）：`);
  for (const f of notPrecached) console.log(`    ${f}`);
  console.log('');
}
if (precachedMissing.length) {
  console.log(`⚠️  預快取清單裡有、磁碟上卻沒有（SW 安裝時會 404，${precachedMissing.length} 檔）：`);
  for (const f of precachedMissing) console.log(`    ${f}`);
  console.log('');
}
if (missing.length) {
  console.log(`ℹ️  程式碼引用但檔案不存在（會退回程序化繪圖，${missing.length} 檔）：`);
  for (const f of missing) console.log(`    ${f}  ← ${used.get(f)}`);
  console.log('');
}


/* ── 5) 「在載入表裡、但遊戲邏輯從未指名」的貼圖 ──
   這些會被載進記憶體、也進了預快取，卻沒有任何關卡／實體會用到（例如 wuxia_* 系列
   只有貼圖表提到，沒有任何 level 或敵人定義用它）。反過來說，名字如果是動態組出來的
   （例如 `${key}_charging`）就會被誤判 —— 所以這一段只當「人工確認清單」，不進離開碼。 */
const allJs = [...walk('js').filter((f) => f.endsWith('.js') && f !== 'js/sprites.js')]
  .map((f) => read(f)).join('\n') + read('index.html') + read('css/style.css');
const loadedKeys = [
  ...objKeys(spritesSrc, 'IMAGE_SPRITES').map((k) => [`assets/xian/${k}.png`, k]),
  ...objKeys(spritesSrc, 'DECOR_PNG_SPRITES').map((k) => [`assets/decor/${k}.png`, k]),
  ...objKeys(spritesSrc, 'ZODIAC_SPRITES').map((k) => [`assets/zodiac/${k}.png`, k]),
  ...objKeys(spritesSrc, 'BOSS_PNG_SPRITES').map((k) => [`assets/bosses/${k}.png`, k]),
  ...objKeys(spritesSrc, 'MAKAIMURA_SPRITES').map((k) => [`assets/makaimura/${k}.png`, k]),
];
const neverNamed = loadedKeys.filter(([, k]) => {
  if (/_charging$|_final$/.test(k)) return false;          // 這些是動態組出來的
  return !new RegExp(`\\b${k}\\b`).test(allJs);
});
if (neverNamed.length) {
  console.log(`ℹ️  在貼圖表裡、但 js/ 其餘地方從未指名（${neverNamed.length} 個，人工確認用）：`);
  const bytes = neverNamed.reduce((s, [f]) => s + size(f), 0);
  console.log(`    ${neverNamed.map(([f, k]) => k).join(' ')}`);
  console.log(`    合計約 ${(bytes / 1024).toFixed(1)}KB —— 確認沒用到就可以從貼圖表與預快取拿掉`);
  console.log('');
}

/* ── 6) 「同意才下載的素材」大小寫進 version.json ──
   玩家按下下載前要先看到「約 XX MB」，那個數字就是這裡算出來的。
   --write-version 會把它寫進 version.json；--strict 會比對有沒有過期。 */
const assetsForDownload = [...precache].filter((p) => p.startsWith('assets/') && !ON_DEMAND.some((re) => re.test(p)));
const assetBytes = assetsForDownload.reduce((sum, f) => sum + size(f), 0);
const assetKB = Math.round(assetBytes / 1024);
const versionPath = 'version.json';
const versionJson = JSON.parse(read(versionPath));
const stale = versionJson.assetsKB !== assetKB;
console.log(`同意才下載的素材：${assetsForDownload.length} 檔 / ${mb(assetBytes)}MB（version.json 記的是 ${versionJson.assetsKB ?? '(未設定)'}KB）`);
if (process.argv.includes('--write-version')) {
  versionJson.assetsKB = assetKB;
  writeFileSync(path.join(ROOT, versionPath), `${JSON.stringify(versionJson, null, 2)}\n`);
  console.log(`✅ 已寫入 version.json 的 assetsKB = ${assetKB}`);
} else if (stale) {
  console.log('⚠️  version.json 的 assetsKB 過期了 —— 跑 `node tools/audit-assets.mjs --write-version` 更新');
}
console.log('');

const bad = unused.length + notPrecached.length + precachedMissing.length + (stale && !process.argv.includes('--write-version') ? 1 : 0);
console.log(bad === 0
  ? '✅ 資產沒有死檔、預快取沒有缺口、下載大小也和 version.json 一致'
  : `總結：${bad} 個問題（死檔 ${unused.length}、未預快取 ${notPrecached.length}、預快取缺檔 ${precachedMissing.length}、assetsKB 過期 ${stale ? 1 : 0}）`);
if (STRICT && bad > 0) process.exit(1);
