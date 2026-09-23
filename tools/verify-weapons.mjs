// 武器／超武／型態（js/config.js 的 WEAPONS / PASSIVES / WEAPON_ASPECTS 與
// js/weapons/WeaponManager.js 的實際行為）門檻驗證 —— 把「一把武器」從一段資料
// 變成可量測、可回歸的東西。
//
// 為什麼要這支：這三張表是「資料即程式」。打錯一個欄位名、少一個 key、指到不存在的
// id，遊戲都照樣跑得動 —— 不會拋例外，只是那個效果安靜地不存在。這支要防的就是這種
// 靜默死亡，實測抓到／這一輪要守住的四類：
//   1. **死欄位**：WEAPON_ASPECTS.molotov[athena].stats.dmgResist 宣告了「受傷 -25%」，
//      但全 repo 沒有任何讀取端（實測 grep 0 次）—— 玩家選了雅典娜，減傷從來沒發生。
//      B 組第 6 條把「型態 stats 裡每個 key 都要在 js/ 有讀者」變成一條紅線。
//   2. **孤兒超武／斷掉的進化鏈**：evoTarget 指到不存在的 id、或超武沒有任何基礎武器
//      指得到時，選卡邏輯只是永遠不產生那張卡，玩家一輩子拿不到超武（A 組第 2/3 條）。
//   3. **超武覺醒**：超武要能再升到 maxLevel、每級 +15%（evoGrowth）。少一個 maxLevel
//      或 evoGrowth，超武的 level 就永遠停在 1，升級卡也不會出現（A1 / C12 / E18）。
//   4. **行為**：新投射物（boomerang 去回各一刀、rail_beam 是純視覺）與進化端到端都
//      必須真的進遊戲跑一次 —— 資料表長得對，不代表開火路徑接上了（C 組）。
//
// 五組：
//   A 表完整性（欄位、進化鏈、配方件、型態家族）
//   B 死欄位（型態 stats 的每個 key 都要有讀取端）＋ 型態不得複製貼上改名
//   C 行為（開火造成傷害、boomerang 去回、rail_beam 純視覺、進化端到端、覺醒、dmgResist）
//   D 平衡門檻（超武粗算 DPS > 基礎；新武器不被既有武器支配也不超模）
//   E 收尾（icon、pageerror、超武必有 evoGrowth）
//
// 用法：
//   node tools/verify-weapons.mjs
//     → 自己起一台 no-store 靜態伺服器（預設 8899，被占用就自動往 8910~8919 找），跑完自己收掉。
//   PW_MODULE=/Users/hermes/.npm/_npx/6301df25ace19226/node_modules/playwright/index.js \
//     PROBE_URL=http://127.0.0.1:8899/index.html node tools/verify-weapons.mjs
//     → 指定 playwright 模組與（別人已經起好的）目標 URL；給了 PROBE_URL 就完全不碰伺服器、
//       也不會 kill 任何行程。
//
// 量測備註（會影響紅燈判讀，先講清楚）：
//   - 傷害一律由 main.js 的碰撞迴圈結算，只呼叫 weaponManager.update() 永遠量到 0 →
//     行為組走完整的 game.update(1/60)，並把玩家釘在 (0,0)、關掉暴擊、假人血量拉滿。
//   - 「覺醒」量的是**第一次命中的傷害**（單一假人，第一次掉血的那個量），不是一段時間的
//     總傷害：超武的 count 隨等級變多、彈道散開，加上擊退會把假人推離彈道，總傷害與等級
//     不是單調關係（實測 twin_storm Lv1=297、Lv3=291）。首次命中則只跟 baseDamage 有關。
//   - 假人一律 kbResist=1 並逐幀釘回原座標，幾何固定，量到的值才可重現。
//
// 離開碼 1 表示有項目失敗。
//
// 需要一個靜態伺服器（專案根目錄、所有回應 Cache-Control: no-store）。
// 自己起的伺服器會用 lsof -tiTCP:<port> -sTCP:LISTEN | xargs kill 收掉（不用 pkill -f，
// 免得掃到別人正在跑的 8899）。為了不誤殺別人的伺服器，流程是「先確認 port 沒人在聽 →
// 起自己的 → 用 X-Verify-Server 回應標頭確認那台真的是自己起的」，兩道都過才把該 port
// 記成自己的；換 port 也只在候選清單（8899、8910~8919）裡找。

import { createServer as createNetServer } from 'node:net';
import { spawn, execSync } from 'node:child_process';

const ROOT = process.cwd();
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;

/* ── 0) 靜態伺服器：沒有 PROBE_URL 就自己起一台（no-store），跑完自己收掉 ───── */

// 子行程（node -e）版本的靜態伺服器：專案根目錄、每個回應都 no-store。
// 用子行程而不是 in-process，才能在收尾時用 lsof 精準關掉「自己起的這一台」。
const SERVER_SRC = `
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[1];
const PORT = Number(process.argv[2]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
};
http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Verify-Server', 'verify-weapons');
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1');
`;

const portFree = (port) => new Promise((resolve) => {
  const s = createNetServer();
  s.once('error', () => resolve(false));
  s.once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});

// 只認「自己人」：回應必須帶 X-Verify-Server 標頭。否則可能是別人的伺服器先搶到了
// 同一個 port —— 那種情況要換 port，而不是把別人的行程當成自己的關掉。
const waitForServer = async (url, own = false) => {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok && (!own || res.headers.get('x-verify-server') === 'verify-weapons')) return true;
    } catch (err) { /* 還沒起來 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

let PORT = null;
let serverChild = null;
let TARGET = process.env.PROBE_URL || null;

if (!TARGET) {
  const candidates = [...new Set([Number(process.env.WEAPONS_PORT) || 8899,
    8899, 8910, 8911, 8912, 8913, 8914, 8915, 8916, 8917, 8918, 8919])];
  for (const p of candidates) {
    if (!(await portFree(p))) continue;
    const child = spawn(process.execPath, ['-e', SERVER_SRC, ROOT, String(p)], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    if (await waitForServer(`http://127.0.0.1:${p}/index.html`, true)) {
      PORT = p;
      serverChild = child;
      break;
    }
    try { process.kill(-child.pid, 'SIGKILL'); } catch (err) { /* 已死 */ }
  }
  if (!PORT) {
    console.error('找不到可用的 port（8899、8910~8919 都被占用），請自己起一台並用 PROBE_URL 指定。');
    process.exit(1);
  }
  TARGET = `http://127.0.0.1:${PORT}/index.html`;
  console.log(`# 自備靜態伺服器 http://127.0.0.1:${PORT}/ （專案根目錄、no-store）`);
}

let serverStopped = false;
const stopServer = () => {
  if (serverStopped || !PORT) return;   // PROBE_URL 模式：完全沒碰伺服器，也不 kill 任何東西
  serverStopped = true;
  try { if (serverChild && serverChild.pid) process.kill(-serverChild.pid, 'SIGKILL'); } catch (err) { /* 已死 */ }
  try { if (serverChild) serverChild.kill('SIGKILL'); } catch (err) { /* 已死 */ }
  try {
    execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: 'ignore' });
  } catch (err) { /* 已經沒有在聽的行程了 */ }
};
process.on('exit', stopServer);

/* ── 1) 開頁面 ─────────────────────────────────────────────── */
console.log(`# 目標 ${TARGET}`);

const browser = await pw.chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
page.setDefaultTimeout(180000);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game, null, { timeout: 60000 });

/* ── 2) 頁內驗證 ───────────────────────────────────────────── */
const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail == null ? '' : detail) });
  const list = (a) => (a.length ? a.join('、') : '無');
  // 匯入路徑一律用 new URL(…, document.baseURI)：本機是 "/"、GitHub Pages 是
  // "/gaga-survivor/"，寫死絕對路徑在線上會 404（實測踩過）。
  const imp = (p) => import(new URL(p, document.baseURI).href);

  try {
    const { WEAPONS, PASSIVES, WEAPON_ASPECTS, GAME_CONFIG } = await imp('js/config.js');
    const { Enemy } = await imp('js/entities/Enemy.js');
    const { Projectile } = await imp('js/entities/Projectile.js');
    const g = window.game;

    const ids = Object.keys(WEAPONS);
    const bases = ids.filter((id) => !WEAPONS[id].isEvo);
    const evos = ids.filter((id) => WEAPONS[id].isEvo);
    // 粗算 DPS：覺醒（evoGrowth）不計，只比「基礎值」——這一組要量的是進化本身的定位，
    // 不是滿級強度。baseCooldown 0 是「常駐」（永恆守護力場／奇點環），視為無限大 DPS。
    const dps = (def) => (def.baseCooldown > 0
      ? def.baseDamage / def.baseCooldown
      : (def.baseDamage > 0 ? Infinity : 0));
    const dpsTxt = (def) => (Number.isFinite(dps(def)) ? dps(def).toFixed(1) : '∞');

    try { g.ui.startScreen.classList.add('hidden'); } catch (e) { /* 沒有這塊也沒關係 */ }

    // ══ A. 表完整性 ══════════════════════════════════════════════════════

    {
      const FIELDS = ['id', 'name', 'icon', 'description', 'maxLevel', 'baseDamage', 'baseCooldown'];
      const bad = [];
      for (const [id, def] of Object.entries(WEAPONS)) {
        const miss = FIELDS.filter((f) => def[f] === undefined || def[f] === null || def[f] === '');
        if (def.id !== id) miss.push(`id="${def.id}"（鍵名 ${id}）`);
        if (miss.length) bad.push(`${id}: 缺 ${miss.join('/')}`);
      }
      ok('A1 每個 WEAPONS 條目都有 id/name/icon/description/maxLevel/baseDamage/baseCooldown，且 id 與鍵名一致',
        bad.length === 0, bad.length ? list(bad) : `${ids.length} 把全部具備`);
    }

    {
      // 孤兒超武 = 沒有任何基礎武器的 evoTarget 指到它 → 選卡邏輯永遠不會產生那張卡。
      // 反向（evoTarget 指到不存在的 id）同樣是靜默的：條件成立時 WEAPONS[target] 是 undefined。
      const referenced = new Set();
      for (const def of Object.values(WEAPONS)) if (def.evoTarget) referenced.add(def.evoTarget);
      const orphan = evos.filter((id) => !referenced.has(id));
      const dangling = [...referenced].filter((t) => !WEAPONS[t]);
      ok('A2 沒有孤兒超武（每個 isEvo 都被某個 evoTarget 指到），也沒有指向不存在 id 的 evoTarget',
        orphan.length === 0 && dangling.length === 0,
        `${orphan.length ? `孤兒超武：${list(orphan)}；` : ''}`
        + `${dangling.length ? `斷鏈 evoTarget：${list(dangling)}` : `${evos.length} 把超武都有基礎武器指向、${referenced.size} 個 evoTarget 都指得到`}`);
    }

    {
      const noTarget = bases.filter((id) => !WEAPONS[id].evoTarget);
      const twice = evos.filter((id) => WEAPONS[id].evoTarget);
      ok('A3 每把基礎武器都有 evoTarget；超武的 evoTarget 必須是 falsy（不能二次進化）',
        noTarget.length === 0 && twice.length === 0,
        `${noTarget.length ? `沒有進化目標的基礎武器：${list(noTarget)}；` : ''}`
        + `${twice.length ? `還能再進化的超武：${list(twice)}` : `${bases.length} 把基礎武器都有下一個型態`}`);
    }

    {
      const bad = [];
      let n = 0;
      for (const [id, def] of Object.entries(WEAPONS)) {
        const pid = def.pairPassive;
        if (!pid) continue;
        n++;
        if (!PASSIVES[pid] && !WEAPONS[pid]) bad.push(`${id}→${pid}（PASSIVES / WEAPONS 都沒有）`);
        else if (pid === id) bad.push(`${id}→自己`);
        else if (WEAPONS[pid] && WEAPONS[pid].isEvo) bad.push(`${id}→${pid}（超武不能當配方件）`);
      }
      ok('A4 每個 pairPassive 都存在於 PASSIVES 或 WEAPONS，不是自己、也不能是超武',
        bad.length === 0, bad.length ? list(bad) : `${n} 組配方件都合法`);
    }

    {
      // 有 evoTarget 卻沒有 pairPassive → UI 的 pairInfo 永遠 owned:false，那條進化鏈等於死路。
      const bad = bases.filter((id) => WEAPONS[id].evoTarget && !WEAPONS[id].pairPassive);
      ok('A4b 有 evoTarget 的基礎武器就必須有 pairPassive（否則配方永遠湊不齊）',
        bad.length === 0, bad.length ? list(bad) : `${bases.filter((id) => WEAPONS[id].evoTarget).length} 把都有配方件`);
    }

    // ASPECT_FAMILY 沒有 export，只能間接驗：aspectOf(id) 回傳的 fam 就是引擎實際用的家族。
    const ownFam = [];
    {
      const bad = [];
      const meta = [];
      for (const id of ids) {
        const probe = g.weaponManager.aspectOf(id);
        const fam = probe.fam;
        const aspects = WEAPON_ASPECTS[fam];
        if (!Array.isArray(aspects) || aspects.length !== 3) {
          bad.push(`${id}→${fam}（${Array.isArray(aspects) ? `${aspects.length} 個型態` : 'WEAPON_ASPECTS 沒有這個家族'}）`);
          continue;
        }
        const fieldBad = aspects.filter((a) => !a || !a.id || !a.name || !a.desc || !a.stats || !Object.keys(a.stats).length);
        if (fieldBad.length) bad.push(`${id}→${fam}（型態缺 id/name/desc/stats）`);
        meta.push(`${id}→${fam}`);
        ownFam.push([id, fam, aspects]);
      }
      ok('A5 每把武器都有型態家族歸屬，且該家族在 WEAPON_ASPECTS 裡剛好 3 個型態、每個都有 id/name/desc/stats',
        bad.length === 0 && ids.length > 0,
        bad.length ? list(bad) : `${ids.length} 把武器 → ${new Set(meta.map((m) => m.split('→')[1])).size} 個家族（各 3 型態）：${meta.join('、')}`);
    }

    {
      // 「有家族」不等於「家族歸屬真的生效」：aspectOf 對沒登記的 id 會退回 kunai。
      // 兩種抓法：(1) 把家族指定到第 3 個型態，aspectOf 必須跟著換；
      //           (2) 武器自帶同名家族（boomerang / railgun 這類新武器有 WEAPON_ASPECTS[id]）
      //               時 fam 必須就是它自己，退回 kunai 就是 ASPECT_FAMILY 漏了條目。
      const bad = [];
      for (const [id, fam, aspects] of ownFam) {
        const want = aspects[2];
        const backup = g.player.weaponAspects;
        g.player.weaponAspects = { [fam]: want.id };
        const probe = g.weaponManager.aspectOf(id);
        g.player.weaponAspects = backup;
        if (probe.fam !== fam || probe.id !== want.id || JSON.stringify(probe.stats) !== JSON.stringify(want.stats)) {
          bad.push(`${id}: 指定 ${fam}/${want.id} 卻拿到 ${probe.fam}/${probe.id}`);
        } else if (WEAPON_ASPECTS[id] && fam !== id) {
          bad.push(`${id}: ASPECT_FAMILY 漏了條目 → 退回 ${fam}`);
        }
      }
      ok('A5b 家族歸屬不是 aspectOf 的 kunai 退路（指定型態真的會換、自帶同名家族的武器不得退回）',
        bad.length === 0, bad.length ? list(bad) : `${ownFam.length} 把武器的家族指定都生效`);
    }

    // ══ B. 死欄位 ════════════════════════════════════════════════════════

    // 掃描來源：sw.js 的預快取清單就是「js/ 底下每一個模組」的權威名單
    // （少一個模組 = 離線白畫面，所以它必須跟 find js -name '*.js' 一致）。
    const stripComments = (src) => {
      let out = '';
      let i = 0;
      const n = src.length;
      while (i < n) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') {
          i += 2;
          while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
          i += 2;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') {
          const q = c;
          out += c; i++;
          while (i < n) {
            if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
            out += src[i];
            if (src[i] === q) { i++; break; }
            i++;
          }
          continue;
        }
        out += c; i++;
      }
      return out;
    };
    const srcOf = async (p) => {
      const res = await fetch(new URL(p, document.baseURI).href, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${p} 讀不到（HTTP ${res.status}）`);
      return res.text();
    };

    {
      let scanErr = '';
      let jsFiles = [];
      try {
        const sw = await srcOf('sw.js');
        jsFiles = [...new Set([...sw.matchAll(/'(\.\/js\/[^']+\.js)'/g)].map((m) => m[1].replace(/^\.\//, '')))];
      } catch (e) { scanErr = String((e && e.message) || e); }
      const readers = [];
      for (const f of jsFiles) {
        if (f === 'js/config.js') continue;   // 定義處不算讀取端
        try { readers.push([f, stripComments(await srcOf(f))]); } catch (e) { scanErr += ` ${f}:${(e && e.message) || e}`; }
      }
      if (jsFiles.length < 5) scanErr += `（sw.js 只列出 ${jsFiles.length} 個 js 模組，名單可能壞了）`;

      // 收集所有型態 stats 的 key（含它出現在哪個家族的哪個型態，紅燈時要指得出來）
      const keyAt = new Map();
      for (const [fam, arr] of Object.entries(WEAPON_ASPECTS || {})) {
        for (const a of arr || []) {
          for (const k of Object.keys((a && a.stats) || {})) {
            if (!keyAt.has(k)) keyAt.set(k, []);
            keyAt.get(k).push(`${fam}/${(a && a.id) || '?'}`);
          }
        }
      }
      const escape = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dead = [];
      for (const [k, where] of keyAt) {
        const re = new RegExp(`\\b${escape(k)}\\b`);
        // 搜尋 X、stats.X、.X、[X] 全部等價於「這個識別字出現在任何非註解位置」
        if (!readers.some(([, src]) => re.test(src))) dead.push(`${k}（${[...new Set(where)].join('、')}）`);
      }
      ok('B6 每個型態 stats 欄位在 js/（不含 config.js 與註解）都至少有一個讀取端',
        scanErr === '' && dead.length === 0 && keyAt.size > 0,
        scanErr ? `原始碼掃描失敗：${scanErr}`
          : (dead.length
            ? `宣告了卻沒有任何讀取端：${list(dead)}`
            : `${keyAt.size} 個欄位 / ${readers.length} 個檔全部有讀者`));
    }

    {
      const bad = [];
      for (const [fam, arr] of Object.entries(WEAPON_ASPECTS || {})) {
        const a = arr || [];
        if (new Set(a.map((x) => x && x.id)).size !== a.length) bad.push(`${fam}: 型態 id 有重複`);
        const sigs = a.map((x) => JSON.stringify(Object.entries((x && x.stats) || {}).sort()));
        if (sigs.some((s) => s === '[]')) bad.push(`${fam}: 有型態 stats 是空的`);
        if (new Set(sigs).size !== a.length) bad.push(`${fam}: 有型態 stats 完全相同（複製貼上改名）`);
      }
      ok('B7 同一家族內型態 id 不重複、stats 非空、三個型態彼此至少有一個欄位不同',
        bad.length === 0 && Object.keys(WEAPON_ASPECTS || {}).length > 0,
        bad.length ? list(bad) : `${Object.keys(WEAPON_ASPECTS || {}).length} 個家族的型態都互不相同`);
    }

    // ══ C. 行為（真的進遊戲跑）════════════════════════════════════════════

    // 乾淨開局：不生怪、玩家釘在 (0,0) 且不死、關掉暴擊與藥劑（傷害才可重現）。
    const beginRun = () => {
      g.start(false);
      g.spawner.update = () => {};       // 不讓波次生成干擾量測
      g.enemies.length = 0;
      g.enemyProjectiles.length = 0;
      g.dropItems.length = 0;
      g.pendingLevelUps = 0;
      g.state = 'PLAYING';
      const W = g.weaponManager;
      W.weapons.clear();
      W.passives.clear();
      W.projectiles.length = 0;
      W.delayed.length = 0;
      const p = g.player;
      p.x = 0; p.y = 0; p.isDead = false;
      p.critChance = 0; p.metaCrit = 0; p.metaCritDmg = 0;
      p.atkPotionTimer = 0; p.luckPotionTimer = 0;
      p.damageMultiplier = 1; p.traitDmgMul = 1;
      p.damageTakenMul = 1; p.metaArmor = 0; p.shield = 0;
      p.baseMaxHp = 1e9; p.maxHp = 1e9; p.hp = 1e9;
      p.invulnerableTimer = 0;
      p.weaponAspects = {};              // 用家族的第一個型態（預設值）
      return p;
    };

    // 假人：血拉滿、不動、不被擊退、逐幀釘回原位 —— 幾何固定，量到的傷害才可重現。
    const placeEnemy = (x, y) => {
      const e = new Enemy('walker', x, y, {});
      e.maxHp = e.hp = 1e9;
      e.speed = 0;
      e.kbResist = 1;
      e._homeX = x; e._homeY = y;
      g.enemies.push(e);
      return e;
    };

    // 升級選卡若跳出來（本輪不該發生：假人不會死）只清狀態、不套卡 ——
    // 套卡會偷偷往 weaponManager 塞武器/被動，量到的傷害就不是這把武器的了。
    const resolveModals = () => {
      if (g.state === 'LEVEL_UP') { g.pendingLevelUps = 0; g.state = 'PLAYING'; }
      else if (g.state === 'CHEST_MODAL' || g.state === 'PAUSED') g.state = 'PLAYING';
    };

    const step = (n) => {
      for (let i = 0; i < n; i++) {
        resolveModals();
        const p = g.player;
        p.x = 0; p.y = 0; p.isDead = false; p.hp = p.maxHp;
        for (const e of g.enemies) { e.x = e._homeX; e.y = e._homeY; }
        g.update(1 / 60);
      }
    };

    // C8：每把基礎武器都能開火並造成傷害。圓環擺怪，環繞型（近）與投射型（遠）都有東西打。
    {
      const ringDamage = (id) => {
        beginRun();
        const W = g.weaponManager;
        W.addWeapon(id);
        const item = W.weapons.get(id);
        if (!item) return { dmg: 0, total: 0, api: null };
        item.level = 1;
        item.cooldownTimer = 0;          // 第 1 幀就開火
        item.totalDamage = 0;
        for (const r of [40, 80, 140, 220]) {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            placeEnemy(Math.cos(a) * r, Math.sin(a) * r);
          }
        }
        step(150);
        const api = typeof W.getWeaponDamage === 'function' ? W.getWeaponDamage(id) : null;
        return { dmg: api == null ? item.totalDamage : api, total: item.totalDamage, api };
      };
      const bad = [];
      const detail = [];
      for (const id of bases) {
        const r = ringDamage(id);
        detail.push(`${id} ${r.dmg}`);
        if (!(r.dmg > 0)) {
          bad.push(`${id}（totalDamage=${r.total}${r.api == null ? '' : `, getWeaponDamage=${r.api}`}）`);
        }
      }
      ok(`C8 ${bases.length} 把基礎武器都能開火並造成傷害（跑滿 150 幀）`,
        bad.length === 0 && bases.length > 0,
        bad.length ? `沒造成傷害：${list(bad)}` : detail.join('、'));
    }

    // C9a：boomerang 的幾何 —— 距離序列必須先變大再變小，最後被玩家接住。
    {
      const def = WEAPONS.boomerang;
      let pass = false;
      let detail = 'WEAPONS.boomerang 不存在（尚未落地）';
      if (def) {
        const outTime = Array.isArray(def.outTime) ? def.outTime[0] : def.outTime;
        const p = new Projectile({
          type: 'boomerang', weaponId: 'boomerang', x: 0, y: 0,
          vx: def.speed, vy: 0, radius: 12, damage: def.baseDamage, pierce: 3,
          life: 6, rehit: def.rehit, outTime, speed0: def.speed,
        });
        const player = { x: 0, y: 0 };
        const dists = [];
        for (let i = 0; i < 240 && !p.isDead; i++) {
          p.update(1 / 60, player, null);
          dists.push(Math.hypot(p.x, p.y));
        }
        const maxD = Math.max(...dists);
        const maxAt = dists.indexOf(maxD);
        const last = dists[dists.length - 1];
        const wentOut = maxD > 60 && maxAt < dists.length - 10;
        const cameBack = last < 30;
        detail = `最遠 ${maxD.toFixed(0)}px（第 ${maxAt}/${dists.length} 幀）、最後 ${last.toFixed(0)}px、${p.isDead ? '已被接住' : '還在飛'}`;
        pass = wentOut && cameBack && p.isDead;
      }
      ok('C9a boomerang 真的飛出去再折返（距離序列先變大再變小、最後被玩家接住）',
        pass, pass ? detail : `不合格：${detail}`);
    }

    // C9b：去程與回程各命中一次 —— 同一隻敵人被同一枚迴力鏢打兩次（靠 rehit）。
    {
      beginRun();
      const W = g.weaponManager;
      W.addWeapon('boomerang');
      const item = W.weapons.get('boomerang');
      let pass = false;
      let detail = 'boomerang 沒有被 addWeapon 收下';
      if (item) {
        item.level = 1;
        item.cooldownTimer = 1e9;        // 只丟這一輪
        item.totalDamage = 0;
        const e = placeEnemy(120, 0);    // 站在去回都會經過的路徑上
        // 直接數「同一隻假人被打了幾次」：比只看累計傷害更能指出是「只中一次」還是「沒中」
        let hits = 0;
        const origTake = e.takeDamage.bind(e);
        e.takeDamage = (...args) => {
          const before = e.hp;
          const res = origTake(...args);
          if (e.hp < before) hits++;
          return res;
        };
        W.projectiles.length = 0;
        W.delayed.length = 0;
        W.fireWeapon('boomerang', item, WEAPONS.boomerang, g.enemies, g.particles);
        item.cooldownTimer = 1e9;
        const shots = W.projectiles.filter((p) => p.type === 'boomerang');
        const single = shots.length ? shots[0].damage : 0;
        step(180);
        detail = `命中 ${hits} 次、單次 ${single}、累計 ${item.totalDamage}、擲出 ${shots.length} 枚`;
        pass = single > 0 && hits >= 2 && item.totalDamage >= 2 * single;
      }
      ok('C9b 同一隻敵人被去程與回程各打一次（累計傷害 ≥ 2× 單次）',
        pass, pass ? detail : `不合格：${detail}`);
    }

    // C10：rail_beam 是「視覺實體」——傷害在開火當下就結算完，實體本身不再傷人、且很快消失。
    {
      beginRun();
      const W = g.weaponManager;
      W.addWeapon('railgun');
      const item = W.weapons.get('railgun');
      if (!item || !WEAPONS.railgun) {
        ok('C10a rail_beam 是短命的視覺實體', false, 'WEAPONS.railgun 不存在（尚未落地）');
        ok('C10b 開火當下就對直線上多隻敵人結算傷害', false, 'WEAPONS.railgun 不存在（尚未落地）');
        ok('C10c rail_beam 實體本身不會再造成傷害', false, 'WEAPONS.railgun 不存在（尚未落地）');
      } else {
        item.level = 1;
        item.totalDamage = 0;
        const e1 = placeEnemy(100, 0);
        const e2 = placeEnemy(200, 0);
        const e3 = placeEnemy(300, 0);
        const off = placeEnemy(150, 320);     // 線外：不該被掃到
        const line = [e1, e2, e3];
        const before = [...line, off].map((e) => e.hp);
        W.projectiles.length = 0;
        W.delayed.length = 0;
        W.fireWeapon('railgun', item, WEAPONS.railgun, g.enemies, g.particles);
        item.cooldownTimer = 1e9;

        const hitLine = line.filter((e, i) => before[i] - e.hp > 0).length;
        const offHit = before[3] - off.hp > 0;
        const beams = W.projectiles.filter((p) => p.type === 'rail_beam');
        const life = beams.length ? beams[0].life : null;
        const shortLife = beams.length > 0 && beams.every((b) => b.life <= 1);
        // 記下開火後的基準，再看光束實體「自己」又扣了多少
        const mid = [...line, off].map((e) => e.hp);
        let goneAt = -1;
        for (let i = 0; i < 180 && goneAt < 0; i++) {
          step(1);
          if (!W.projectiles.some((p) => p.type === 'rail_beam')) goneAt = i + 1;
        }
        if (goneAt >= 0) step(6);            // 再多跑幾幀，確認真的不會回頭傷人
        const extra = Math.max(...[...line, off].map((e, i) => mid[i] - e.hp));
        const geo = `光束 ${beams.length} 道（life ${life}）、第 ${goneAt} 幀消失、直線命中 ${hitLine}/3、線外 ${offHit ? '誤傷' : '未傷'}、實體額外傷害 ${extra}`;

        ok('C10a rail_beam 是短命的視覺實體（開火會生成、1 秒內到期、3 秒內從場上消失）',
          beams.length > 0 && shortLife && goneAt >= 0,
          beams.length > 0 && shortLife && goneAt >= 0
            ? geo
            : `不合格：光束 ${beams.length} 道（life ${life}）、消失於第 ${goneAt} 幀`);
        ok('C10b 開火當下就對「直線上多隻敵人」結算傷害（≥ 2 隻被扣血、線外不受影響）',
          hitLine >= 2 && !offHit,
          hitLine >= 2 && !offHit ? geo : `不合格：直線 ${hitLine}/3 隻被扣血、線外 ${offHit ? '也掃到了' : '沒被掃到'}`);
        ok('C10c rail_beam 實體本身不會再造成任何傷害（傷害只在開火當下結算）',
          extra === 0,
          extra === 0
            ? `實體零傷害（${geo}）`
            : `光束實體又扣了敵人 ${extra} 點血 —— Enemy.takeDamage 有「至少 1 點」的下限，`
              + `damage:0 的光束撞上去照樣扣 1（main.js 的碰撞迴圈要像 rocket 一樣跳過 rail_beam）`);
      }
    }

    // C11：進化端到端（每一條鏈都走一次：滿級 + 配方滿級 → 選卡候選 → evolveWeapon）。
    {
      const bad = [];
      const recipeBad = [];
      const detail = [];
      for (const id of bases) {
        const def = WEAPONS[id];
        if (!def.evoTarget || !WEAPONS[def.evoTarget]) { bad.push(`${id}（沒有可用的 evoTarget）`); continue; }
        beginRun();
        const W = g.weaponManager;
        W.addWeapon(id);
        const item = W.weapons.get(id);
        item.level = def.maxLevel || 1;
        const pid = def.pairPassive;
        const pDef = PASSIVES[pid] || WEAPONS[pid];
        if (pDef) {
          if (PASSIVES[pid]) {
            W.addOrUpgradePassive(pid);
            const pi = W.passives.get(pid);
            if (pi) pi.level = pDef.maxLevel;
          } else {
            W.addWeapon(pid);
            const pi = W.weapons.get(pid);
            if (pi) pi.level = pDef.maxLevel;
          }
        }
        const pItem = W.passives.get(pid) || W.weapons.get(pid);
        const ready = !!pDef && !!pItem && item.level >= (def.maxLevel || 0) && pItem.level >= pDef.maxLevel;

        // UI 端的候選（配方的真正守門員）：滿級 + 配方滿級才該出現 evo 卡
        try {
          const opts = g.ui.generateUpgradeOptions(W, null) || [];
          const card = opts.find((o) => o.type === 'evo' && o.baseId === id && o.targetId === def.evoTarget);
          if (!card) recipeBad.push(`${id}→${def.evoTarget}（沒有 evo 候選卡）`);
        } catch (e) {
          recipeBad.push(`${id}: 產生升級卡時拋例外 ${(e && e.message) || e}`);
        }

        W.evolveWeapon(id, def.evoTarget);
        const hasEvo = W.weapons.has(def.evoTarget);
        const baseGone = !W.weapons.has(id);
        const pairEaten = (PASSIVES[pid] || !WEAPONS[pid]) ? true : !W.weapons.has(pid);
        const good = ready && hasEvo && baseGone && pairEaten;
        detail.push(`${id}→${def.evoTarget}${good ? '' : '✗'}`);
        if (!good) {
          bad.push(`${id}→${def.evoTarget}（候選條件 ${ready ? 'ok' : 'ng'}、超武 ${hasEvo ? '有' : '沒有'}、`
            + `基礎武器${baseGone ? '已移除' : '還在'}、武器配方件 ${pairEaten ? '已消耗' : '沒消耗'}）`);
        }
      }
      ok(`C11 ${bases.length} 條進化鏈端到端：滿級 + 配方滿級 → evolveWeapon → 超武在、基礎武器消失、武器配方件被吃掉`,
        bad.length === 0 && bases.length > 0,
        bad.length ? list(bad) : detail.join('、'));
      ok(`C11b ${bases.length} 條進化鏈在選卡端都會產生超武候選（type:'evo'，配方真的湊齊）`,
        recipeBad.length === 0 && bases.length > 0,
        recipeBad.length ? list(recipeBad) : `${bases.length} 條鏈都出現超武卡`);
    }

    // C12：「覺醒」量「這一發的傷害」，不是一段時間的總傷害，也不是第一次掉血的量。
    // 為什麼不能用總傷害或首次增量：超武的 count 隨等級變多、彈道又會散開（twin_storm
    // Lv1 兩枚可能同幀命中同一隻 → 首次增量 144，Lv3 三枚只有中間那枚命中 → 94），
    // 加上擊退會把假人推離彈道，兩者與等級都不是單調關係（實測總傷害 Lv1 297 / Lv3 291）。
    // 開火當下 fireWeapon 算出的單發傷害才是覺醒真正作用的地方：
    //   - 有帶傷害的投射物 → 直接讀它的 damage（已含 evoGrowth，也與幾枚命中無關）
    //   - 傷害在開火當下結算（軌道炮）或沒有投射物（天頂落雷）→ 讀假人那一次 takeDamage
    {
      const shotDamage = (id, level) => {
        const def = WEAPONS[id];
        beginRun();
        const W = g.weaponManager;
        W.addWeapon(id);
        const item = W.weapons.get(id);
        if (!item) return { dmg: 0, how: 'addWeapon 沒有收下' };
        item.level = level;
        item.cooldownTimer = 1e9;        // 只觀察這一發
        item.totalDamage = 0;
        // 環繞型武器的射程就是它的軌道半徑（守護輪盤 65、永恆守護力場 110），
        // 假人站太遠會永遠等不到那一刀；其餘武器固定 120px。
        const isOrbit = def.spinSpeed !== undefined;
        const idx = Math.max(0, Math.min(level, def.maxLevel || level) - 1);
        const r = isOrbit ? (def.isEvo ? def.radius : def.radius[idx]) : 120;
        const e = placeEnemy(r, 0);
        const hp0 = e.hp;
        W.projectiles.length = 0;
        W.delayed.length = 0;
        W.fireWeapon(id, item, def, g.enemies, g.particles);
        // 量子足球是隨機方向：把剛射出的球重新瞄準唯一的假人（只影響下面的退路量法）
        for (const p of W.projectiles) {
          if (p.type !== 'soccer') continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          const sp = Math.hypot(p.vx, p.vy) || def.speed || 1;
          p.vx = ((e.x - p.x) / d) * sp;
          p.vy = ((e.y - p.y) / d) * sp;
        }
        // 開火當下就結算的（railgun / annihilation_beam）：假人那一次吃的傷害就是答案
        if (e.hp < hp0) return { dmg: e.lastDamageTaken, how: '開火當下結算' };
        const shots = W.projectiles.filter((p) => p.weaponId === id && p.damage > 0);
        if (shots.length) {
          return { dmg: Math.max(...shots.map((p) => p.damage)), how: `投射物 damage（${shots.length} 枚）` };
        }
        for (let i = 0; i < 240; i++) {             // 沒有投射物的（天頂落雷）→ 等第一次命中
          step(1);
          if (e.hp < hp0) return { dmg: e.lastDamageTaken, how: '第一次命中' };
        }
        return { dmg: 0, how: '整輪都沒有造成傷害' };
      };

      const bad = [];
      const bad5 = [];
      const detail = [];
      for (const id of evos) {
        const a = shotDamage(id, 1);
        const b = shotDamage(id, 3);
        const c = shotDamage(id, 5);
        const r3 = a.dmg > 0 ? b.dmg / a.dmg : 0;
        const r5 = a.dmg > 0 ? c.dmg / a.dmg : 0;
        detail.push(`${id} ${a.dmg}→${b.dmg}→${c.dmg}（Lv3 ${r3 ? r3.toFixed(2) : '0'}×、Lv5 ${r5 ? r5.toFixed(2) : '0'}×）`);
        if (!(a.dmg > 0 && b.dmg >= a.dmg * 1.2)) {
          bad.push(`${id}（Lv1 ${a.dmg} → Lv3 ${b.dmg}，${a.dmg > 0 ? r3.toFixed(2) : '0'}×，量法：${a.how} / ${b.how}）`);
        }
        // 滿級（Lv5 = 1 + 4×0.15 = 1.6 倍）：1.3 倍是「覺醒真的有疊上去」的下限，
        // 留一點餘裕給未來 evoGrowth 微調，又不至於讓「只 +5%/級」偷偷過關。
        if (!(a.dmg > 0 && c.dmg >= a.dmg * 1.3 && c.dmg >= b.dmg)) {
          bad5.push(`${id}（Lv1 ${a.dmg} → Lv5 ${c.dmg}，${a.dmg > 0 ? r5.toFixed(2) : '0'}×，量法：${a.how} / ${c.how}）`);
        }
      }
      ok('C12 超武覺醒：單發傷害 Lv3 ≥ Lv1 的 1.2 倍（每級 +15%）',
        bad.length === 0 && evos.length > 0,
        bad.length ? `不合格：${list(bad)}` : detail.join('、'));
      ok('C12b 覺醒滿級：單發傷害 Lv5 ≥ Lv1 的 1.3 倍，且 Lv5 ≥ Lv3（等級越高只會越痛）',
        bad5.length === 0 && evos.length > 0,
        bad5.length ? `不合格：${list(bad5)}` : detail.join('、'));
    }

    // C12c：超武的 level 真的升得到 maxLevel（5），而且不會超過。
    {
      const bad = [];
      const detail = [];
      for (const id of evos) {
        const def = WEAPONS[id];
        beginRun();
        const W = g.weaponManager;
        W.addWeapon(id);
        const item = W.weapons.get(id);
        if (!item) { bad.push(`${id}: addWeapon 沒有收下`); continue; }
        for (let i = 0; i < 12; i++) W.upgradeWeapon(id);
        detail.push(`${id} maxLevel=${def.maxLevel} 升到 ${item.level}`);
        if (def.maxLevel !== 5 || item.level !== 5) bad.push(`${id}（maxLevel=${def.maxLevel}、升到 ${item.level}）`);
      }
      ok('C12c 超武的等級上限是 5，且 upgradeWeapon 真的升得到、不會超過',
        bad.length === 0 && evos.length > 0,
        bad.length ? list(bad) : detail.join('、'));
    }

    // C12d：覺醒要出現在升級卡裡（型別 weapon_upgrade，id 是超武本身）。
    // generateUpgradeOptions 最後「只回傳 3 張」（非 EVO 卡是隨機抽的），所以單次呼叫
    // 抽不到不代表沒有這張卡 —— 必須先把候選池隔離掉：武器/被動槽全填滿且全部滿級，
    // 「新武器/新被動/武器升級/被動升級」就都不再是候選，覺醒卡必定落在回傳的三張裡。
    {
      const bad = [];
      const detail = [];
      for (const id of evos) {
        const def = WEAPONS[id];
        if (!def.evoGrowth) continue;
        beginRun();
        const W = g.weaponManager;
        for (const b of bases) {
          if (W.weapons.size >= GAME_CONFIG.MAX_WEAPON_SLOTS - 1) break;
          if (b === id) continue;
          W.addWeapon(b);
          const bi = W.weapons.get(b);
          if (bi) bi.level = WEAPONS[b].maxLevel;
        }
        W.addWeapon(id);
        const item = W.weapons.get(id);
        item.level = 2;
        for (const p of Object.keys(PASSIVES)) {
          if (W.passives.size >= GAME_CONFIG.MAX_PASSIVE_SLOTS) break;
          W.addOrUpgradePassive(p);
          const pi = W.passives.get(p);
          if (pi) pi.level = PASSIVES[p].maxLevel;
        }
        let card = null;
        let types = '';
        try {
          for (let i = 0; i < 50 && !card; i++) {   // 隔離後理當一次就中；多抽幾次當保險
            const opts = g.ui.generateUpgradeOptions(W, null) || [];
            if (!types) types = opts.map((o) => `${o.type}:${o.id || o.baseId || ''}`).join('、');
            card = opts.find((o) => o.type === 'weapon_upgrade' && o.id === id) || null;
          }
        } catch (e) { bad.push(`${id}: 拋例外 ${(e && e.message) || e}`); continue; }
        detail.push(`${id}${card ? '' : '✗'}`);
        if (!card) {
          bad.push(`${id} 沒有 weapon_upgrade 卡（evoGrowth=${def.evoGrowth}、等級 ${item.level}/${def.maxLevel}、`
            + `isEvo=${item.isEvo}、槽位 ${W.weapons.size}/${GAME_CONFIG.MAX_WEAPON_SLOTS}+${W.passives.size}/${GAME_CONFIG.MAX_PASSIVE_SLOTS}；`
            + `單次候選：${types || '（空）'}）`);
        }
      }
      ok('C12d 有 evoGrowth 的超武會出現在升級卡裡（type:"weapon_upgrade"、id 是超武自己）',
        bad.length === 0 && detail.length > 0,
        detail.length === 0 ? '沒有任何超武有 evoGrowth（覺醒系統等於不存在）'
          : (bad.length ? list(bad) : detail.join('、')));
    }

    // C13：dmgResist 真的接到玩家減傷上（雅典娜聖光領域：站在火海裡受傷 -25%）。
    {
      const stats = (WEAPON_ASPECTS.molotov || []).find((a) => a.id === 'athena');
      const want = stats && stats.stats ? stats.stats.dmgResist : undefined;
      const hurt = (aspectId) => {
        beginRun();
        const W = g.weaponManager;
        W.addWeapon('molotov');
        const item = W.weapons.get('molotov');
        g.player.weaponAspects = { molotov: aspectId };
        g.player.sanctuaryTimer = 0;
        g.player.sanctuaryResist = 0;
        // 一隻不動的假人站在玩家腳下：火海必定落在玩家身上（領域型態才吃得到減傷）
        const e = placeEnemy(0, 0);
        W.projectiles.length = 0;
        W.delayed.length = 0;
        W.fireWeapon('molotov', item, WEAPONS.molotov, g.enemies, g.particles);
        item.cooldownTimer = 1e9;
        // 只跑 weaponManager.update：瓶子飛完（≤ 0.55 秒）落地成火海後，
        // 火海會把 sanctuaryTimer / 減傷值寫到玩家身上
        for (let i = 0; i < 40; i++) W.update(1 / 60, g.enemies, g.particles);
        const pool = W.projectiles.find((p) => p.type === 'fire_pool');
        const hp0 = g.player.hp;
        g.player.invulnerableTimer = 0;
        g.player.takeDamage(100);
        return {
          dmg: hp0 - g.player.hp,
          standing: g.player.sanctuaryTimer > 0,
          playerResist: g.player.sanctuaryResist != null ? g.player.sanctuaryResist : g.player.dmgResist,
          poolResist: pool ? pool.sanctuaryResist : undefined,
          isSanctuary: !!(pool && pool.isSanctuary),
          enemyHit: e.hp < 1e9,
        };
      };
      if (typeof want !== 'number') {
        ok('C13 dmgResist 真的生效：雅典娜型態下受到的傷害比札格型態低 ≈25%', false,
          'WEAPON_ASPECTS.molotov[athena].stats.dmgResist 不存在');
        ok('C13b dmgResist 的值真的有從型態資料流到減傷路徑', false, '同上');
      } else {
        const a = hurt('athena');       // 有 sanctuary 的聖光領域
        const z = hurt('zagreus');      // 對照組：同家族但沒有領域
        const ratio = z.dmg > 0 ? a.dmg / z.dmg : 0;
        const pass = z.dmg > 0 && Math.abs(ratio - (1 - want)) <= 0.05;
        ok(`C13 dmgResist 真的生效：雅典娜型態下受到的傷害比札格型態低 ≈${(want * 100).toFixed(0)}%（容差 5%）`,
          pass,
          `雅典娜 ${a.dmg} vs 札格 ${z.dmg}（比值 ${ratio.toFixed(3)}，期望 ${(1 - want).toFixed(2)}）`
          + `｜站在領域內：${a.standing ? '是' : '否'}/${z.standing ? '是' : '否'}`
          + `、火海 isSanctuary ${a.isSanctuary ? '是' : '否'}/${z.isSanctuary ? '是' : '否'}`);
        // 型態欄位必須真的流到減傷路徑：Player 有 0.25 的退路值，
        // 只比「有沒有變低」會被那個退路矇混過去。
        const flowed = a.poolResist === want || a.playerResist === want;
        ok('C13b dmgResist 的值真的有從型態資料流到投射物／玩家的減傷欄位（不是吃到 Player 的退路值）',
          flowed,
          `型態 ${want}｜火海帶出 ${a.poolResist}｜玩家欄位 ${a.playerResist}`);
      }
    }

    // ══ D. 平衡門檻 ══════════════════════════════════════════════════════

    {
      // 「進化不能比不進化弱」：粗算 DPS 比值 > 1.05。1.05 只是「不明顯變弱」的下限，
      // 不是平衡目標 —— 抓的是「超武 DPS 反而低於基礎武器」這種反向設計。
      const bad = [];
      const detail = [];
      for (const id of bases) {
        const def = WEAPONS[id];
        if (!def.evoTarget || !WEAPONS[def.evoTarget]) continue;
        const evo = WEAPONS[def.evoTarget];
        const b = dps(def);
        const e = dps(evo);
        const ratio = b > 0 ? e / b : Infinity;
        detail.push(`${id}(${dpsTxt(def)})→${def.evoTarget}(${dpsTxt(evo)}) ${Number.isFinite(ratio) ? ratio.toFixed(2) : '∞'}×`);
        if (!(ratio > 1.05)) bad.push(`${id}→${def.evoTarget} 只有 ${ratio.toFixed(3)}×（${dpsTxt(def)} → ${dpsTxt(evo)}）`);
      }
      ok(`D14 ${detail.length} 條進化鏈的粗算 DPS（baseDamage/baseCooldown，覺醒不計）比值都 > 1.05`,
        bad.length === 0 && detail.length > 0,
        bad.length ? list(bad) : detail.join('、'));
    }

    {
      // 新武器不被既有武器支配（≥ 既有中位數）、也不做壞平衡（≤ 既有最大值的 1.6 倍）。
      // 1.6 倍的由來：既有八把的 DPS 已經橫跨 2.9~31.4（11 倍），新武器只要落在那個區間
      // 的合理上緣即可；1.6 倍留給「新武器定位偏慢但單發重」的設計空間，又擋得住明顯超模。
      const NEW_IDS = ['boomerang', 'railgun', 'frost_nova', 'shotgun'];
      const refIds = bases.filter((id) => !NEW_IDS.includes(id));
      const refDps = refIds.map((id) => dps(WEAPONS[id])).sort((a, b) => a - b);
      const median = refDps.length === 0 ? 0
        : (refDps.length % 2
          ? refDps[(refDps.length - 1) / 2]
          : (refDps[refDps.length / 2 - 1] + refDps[refDps.length / 2]) / 2);
      const maxRef = refDps.length ? refDps[refDps.length - 1] : 0;
      const bad = [];
      const detail = [];
      if (refIds.length < 4) bad.push(`既有基礎武器只有 ${refIds.length} 把，基準不足`);
      for (const id of NEW_IDS) {
        const def = WEAPONS[id];
        if (!def) { bad.push(`${id} 不在 WEAPONS（尚未落地）`); continue; }
        const d = dps(def);
        detail.push(`${id} ${d.toFixed(1)}`);
        if (!(d >= median)) bad.push(`${id} ${d.toFixed(1)} < 既有中位數 ${median.toFixed(1)}（被支配）`);
        if (!(d <= maxRef * 1.6)) bad.push(`${id} ${d.toFixed(1)} > 既有最大值 ${maxRef.toFixed(1)} 的 1.6 倍（超模）`);
      }
      ok(`D15 ${NEW_IDS.length} 把新武器的粗算 DPS ≥ 既有 ${refIds.length} 把的中位數（不被支配）、且 ≤ 既有最大值的 1.6 倍`,
        bad.length === 0,
        bad.length ? list(bad) : `${detail.join('、')}｜既有中位數 ${median.toFixed(1)}、最大值 ${maxRef.toFixed(1)}、上限 ${(maxRef * 1.6).toFixed(1)}`);
    }

    // ══ E. 收尾 ══════════════════════════════════════════════════════════

    {
      const bad = [];
      for (const [id, def] of Object.entries(WEAPONS)) {
        const len = [...String(def.icon || '')].length;
        if (typeof def.icon !== 'string' || !def.icon || len > 4) bad.push(`${id}（${JSON.stringify(def.icon)}，${len} 字）`);
      }
      ok('E16 每個武器的 icon 都是非空字串且長度 ≤ 4（emoji）',
        bad.length === 0, bad.length ? list(bad) : `${ids.length} 把武器的 icon 都合格`);
    }

    {
      const bad = evos.filter((id) => !(typeof WEAPONS[id].evoGrowth === 'number' && WEAPONS[id].evoGrowth > 0));
      ok('E18 每把超武都有 evoGrowth > 0（覺醒系統需要這個欄位；基礎武器不需要）',
        bad.length === 0 && evos.length > 0,
        bad.length
          ? `${list(bad)} 缺少 evoGrowth（level 永遠停在 1、升級卡也不會出現）`
          : `${evos.length} 把超武都有 evoGrowth = ${[...new Set(evos.map((id) => WEAPONS[id].evoGrowth))].join('/')}`);
    }
  } catch (e) {
    out.push({
      name: '工具本身未預期的例外（上面的結果可能不完整）',
      pass: false,
      detail: String((e && e.stack) || e),
    });
  }
  return out;
});

/* ── 3) 輸出 ───────────────────────────────────────────────── */
let passed = 0;
let failed = 0;
for (const r of results) {
  if (r.pass) passed++;
  else failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  [${r.detail}]`);
}
console.log(`\n${passed} passed, ${failed} failed  (pageerror: ${errs.length})`);
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 5).join('\n'));
if (failed || errs.length) process.exitCode = 1;

await browser.close();
stopServer();
