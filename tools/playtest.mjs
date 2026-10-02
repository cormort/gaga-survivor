// 自動試玩機器人 —— 讓一個「中等程度的玩家」真的把一場打完，然後回答三個問題：
//
//   ① 難度曲線平不平滑？（有沒有一個時間點之後突然變難／突然變簡單）
//   ② 會不會進入「不死平台期」？（場上明明有幾十隻怪，承受傷害卻趨近 0）
//   ③ 傷害通道有沒有在真實對局裡生效？（屬性持續傷害／地形傷害是不是只在程式裡存在）
//
// 為什麼需要這支：這一整輪的平衡問題都不是「某個數字不對」，而是**曲線的形狀**與
// **通道的數量**——單看公式看不出來，而我自己在瀏覽器裡手動玩一次要十分鐘、
// 而且不可重現、也沒辦法比較不同策略。
//
// 它跟其他工具的差別：
//   tools/probe-enemy-pressure.mjs  量「單一機制」（接觸率、遠程密度），不看整場
//   tools/verify-balance.mjs        純 Node，量公式與契約，不進遊戲
//   tools/playtest.mjs（本檔）       真的打完整場，量的是**整場下來的體感曲線**
//
// 用法：
//   node tools/playtest.mjs                                  # 標準難度、商業街、風箏走位、3 場
//   node tools/playtest.mjs --level=endless --minutes=20 --trials=2
//   node tools/playtest.mjs --policy=brawl --build=defensive  # 貼臉打法＋生存取向選卡
//   node tools/playtest.mjs --difficulty=hell --assert        # 當成契約跑（失敗回傳 exit 1）
//   node tools/playtest.mjs --realtime --shots=/tmp/shots     # 真實時間＋每分鐘截圖（看畫面用）
//
// 參數：
//   --level=<id>          關卡 id（street/lab/…/endless，預設 street）
//   --difficulty=<key>    easy|normal|hard|nightmare|hell（預設 normal）
//   --policy=<p>          kite（風箏）| brawl（貼臉）| still（站著不動）（預設 kite）
//   --build=<b>           smart（優先進化／新武器／生存配件）| defensive | random | first（預設 smart）
//   --trials=<n>          重複場次（預設 3）
//   --minutes=<n>         單場模擬上限分鐘（預設 12）
//   --seed=<n>            亂數種子（預設 12345）：頁面載入前就固定整條亂數序列。
//                         它能讓「同一場」的規模與形狀穩定，但**不是逐位元可重現** ——
//                         遊戲內部仍有讀真實時間的路徑（音效引擎、自適應效能），
//                         跨執行會小幅漂移。請看跨場次的中位數，不要依賴單場數字。
//   --realtime            真實時間跑（會渲染、可截圖；慢，預設是加速模式）。
//                         曲線與傷害通道照樣量，但「與敵人接觸時間／屬性在身上的時間」
//                         只有加速模式有（真實模式是靠 Node 每秒輪詢，解析度不足以算 uptime）。
//   --shots=<dir>         --realtime 時每個整數分鐘存一張截圖
//   --max-jump=<n>        --assert 時允許的「相鄰分鐘最大相對跳動」（預設 3.0）
//   --immortal            不死模式：玩家不會陣亡，用來量「完整的壓力曲線」。
//                         為什麼需要它：正常模式下大家 2~4 分鐘就死了，晚期只剩一場還活著，
//                         曲線會被「存活者偏差」截斷 —— 而「後期會不會不死」正好要看晚期。
//                         不死模式只把 HP 每幀補滿，傷害量測完全不受影響（走 _damageTaken）。
//   --json=<path>         把原始量測寫成 JSON（給其他工具吃）
//   --assert              把報告變成通過／失敗，失敗時 exit 1
//
// 加速模式的取捨（要知道）：它直接以固定 dt 呼叫 game.update()，跳過渲染與 rAF。
// 所以它量得到平衡與數值，但**量不到畫面相關的 bug**（那個要走 --realtime）。
//
// 安全：Playwright 每次都用全新的瀏覽器 context（自己的 localStorage），
// 所以工具裡清空 stash／改難度鍵都不會碰到你自己的存檔。

import { spawn, execSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;

/* ── 參數 ───────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const CFG = {
  level: String(arg('level', 'street')),
  difficulty: String(arg('difficulty', 'normal')),
  policy: String(arg('policy', 'kite')),
  build: String(arg('build', 'smart')),
  trials: Math.max(1, Number(arg('trials', 3)) || 3),
  minutes: Math.max(1, Number(arg('minutes', 12)) || 12),
  seed: Number(arg('seed', 12345)) || 12345,
  immortal: !!arg('immortal', false),
  maxJump: Number(arg('max-jump', 3)) || 3,
  realtime: !!arg('realtime', false),
  shots: arg('shots', null),
  json: arg('json', null),
  assert: !!arg('assert', false),
};
const POLICIES = ['kite', 'brawl', 'still'];
const BUILDS = ['smart', 'defensive', 'random', 'first'];
const DIFFS = ['easy', 'normal', 'hard', 'nightmare', 'hell'];
if (!POLICIES.includes(CFG.policy)) { console.error(`--policy 只能是 ${POLICIES.join('|')}`); process.exit(2); }
if (!BUILDS.includes(CFG.build)) { console.error(`--build 只能是 ${BUILDS.join('|')}`); process.exit(2); }
if (!DIFFS.includes(CFG.difficulty)) { console.error(`--difficulty 只能是 ${DIFFS.join('|')}`); process.exit(2); }

/* ── 自備 no-store 靜態伺服器（沿用 verify-weapons 的做法，標頭用來確認是自己人）── */
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
  res.setHeader('X-Playtest-Server', 'playtest');
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

const waitForServer = async (url, own = false) => {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok && (!own || res.headers.get('x-playtest-server') === 'playtest')) return true;
    } catch (err) { /* 還沒起來 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

let PORT = null;
let serverChild = null;
let TARGET = process.env.PLAYTEST_URL || null;
if (!TARGET) {
  const candidates = [...new Set([Number(process.env.PLAYTEST_PORT) || 8899, 8899, 8900, 8901, 8902, 8903, 8904, 8905, 8906, 8907, 8908, 8909])];
  for (const p of candidates) {
    if (!(await portFree(p))) continue;
    const child = spawn(process.execPath, ['-e', SERVER_SRC, ROOT, String(p)], { detached: true, stdio: 'ignore' });
    child.unref();
    if (await waitForServer(`http://127.0.0.1:${p}/index.html`, true)) { PORT = p; serverChild = child; break; }
    try { process.kill(-child.pid, 'SIGKILL'); } catch (err) { /* 已死 */ }
  }
  if (!PORT) { console.error('找不到可用的 port（8899~8909 都被占用），請自己起一台並用 PLAYTEST_URL 指定。'); process.exit(1); }
  TARGET = `http://127.0.0.1:${PORT}/index.html`;
}

let serverStopped = false;
const stopServer = () => {
  if (serverStopped || !PORT) return;
  serverStopped = true;
  try { if (serverChild && serverChild.pid) process.kill(-serverChild.pid, 'SIGKILL'); } catch (err) { /* 已死 */ }
  try { if (serverChild) serverChild.kill('SIGKILL'); } catch (err) { /* 已死 */ }
  try { execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: 'ignore' }); } catch (err) { /* 沒有在聽的行程 */ }
};
process.on('exit', stopServer);

/* ══ 頁內：打一場 ══════════════════════════════════════════════════════
   這個函式被序列化後在遊戲頁面裡執行 —— 不能閉包外面的變數，一切從 cfg 進來。 */
async function playOneTrial(cfg) {
  const g = window.game;
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const { save } = await imp('js/save.js');

  /* 每場再從種子重算一次：讓 3 場彼此獨立、但整組可重現。
     還原時回到「頁面的固定序列」而不是原生 Math.random，序列才接得回去。 */
  const origRandom = Math.random;
  let s = (cfg.seed + cfg.trial * 7919) >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* 加速模式：切掉真實 rAF 迴圈，由我們自己步進（已排程的那一個 callback 之後就斷鏈）*/
  const origRaf = window.requestAnimationFrame;
  if (!cfg.realtime) window.requestAnimationFrame = () => 0;

  /* 乾淨的局外狀態 + 指定難度。Playwright 的 context 是拋棄式的，碰不到玩家存檔 */
  save.data.difficulty = cfg.difficulty;
  save.data.stash = [];
  save.data.equipped = [];
  save.data.boosters = [];
  const origUnlocked = save.difficultyUnlocked.bind(save);
  save.difficultyUnlocked = () => true;   // 工具要能指定任何難度，不受解鎖進度限制

  const log = [];
  const unwrap = [];

  // 加速模式把音效引擎整組換成空函式：一來快很多，二來音訊引擎讀的是
  // AudioContext.currentTime（真實時間），是場內少數與遊戲時間無關的輸入。
  if (!cfg.realtime) {
    const { sound } = await imp('js/audio.js');
    for (const k of Object.keys(sound)) {
      if (typeof sound[k] === 'function') sound[k] = () => {};
    }
  }

  try {
    g.modeId = 'survivor';
    g.levelId = cfg.level;
    g.start();
    g.ui.startScreen && g.ui.startScreen.classList.add('hidden');
    g.state = 'PLAYING';

    /* ── 選卡策略 ─────────────────────────────────────────────── */
    const pickUpgrade = (opts, build) => {
      const has = (t) => opts.filter((o) => o.type === t);
      const byId = (ids) => opts.find((o) => ids.includes(o.id));
      if (build === 'first') return opts[0];
      if (build === 'random') return opts[Math.floor(Math.random() * opts.length)];
      if (build === 'defensive') {
        return has('evo')[0] || byId(['max_hp_vest', 'cdr_battery', 'atk_scroll'])
          || has('passive_new')[0] || has('passive_upgrade')[0]
          || has('weapon_upgrade')[0] || opts[0];
      }
      // smart：進化 > 補到 4 把武器 > 升級現有武器 > 生存配件 > 其餘
      const evo = has('evo')[0];
      if (evo) return evo;
      const weapons = g.weaponManager.weapons.size;
      if (weapons < 4) { const nw = has('weapon_new')[0]; if (nw) return nw; }
      return has('weapon_upgrade')[0] || byId(['max_hp_vest', 'atk_scroll', 'cdr_battery'])
        || has('passive_upgrade')[0] || has('passive_new')[0] || has('weapon_new')[0] || opts[0];
    };

    /* ── 讓所有會暫停世界的彈窗都由策略直接解決（加速模式沒有 DOM 可點）── */
    g.presentUpgradeChoices = () => {
      const o = g.ui.generateUpgradeOptions(g.weaponManager, null, g.banished);
      if (!o || !o.length) { g.state = 'PLAYING'; return; }
      const pick = pickUpgrade(o, cfg.build);
      log.push(`L${g.player.level}:${pick.name || pick.id || pick.type}`);
      g.applyUpgradeOption(pick);
    };
    g.ui.showBlessingChoice = (title, choices, cb) => {
      const pick = cfg.build === 'random' ? choices[Math.floor(Math.random() * choices.length)] : choices[0];
      log.push(`祝福:${pick.name || pick.id}`);
      g.state = 'PLAYING';
      cb(pick);
    };
    g.openBossChest = (n) => {
      const count = n || g.rollBossChestCount();
      for (let i = 0; i < count; i++) { const o = g.rollChestUpgrade(); if (o) { log.push(`寶箱:${o.name || o.id}`); g.applyUpgradeEffect(o); } }
    };
    if (g.bossCutscene) g.bossCutscene.start = () => {};
    const resolveState = () => {
      if (g.state === 'PLAYING' || g.state === 'GAME_OVER') return;
      if (g.state === 'LEVEL_UP') g.presentUpgradeChoices();
      else g.state = 'PLAYING';   // CHEST / BLESSING / MERCHANT / PAUSED 一律直接放行
    };

    /* ── 走位策略 ─────────────────────────────────────────────── */
    let dashCount = 0;
    const steer = (policy) => {
      const p = g.player;
      if (policy === 'still') { g.input.vector.x = 0; g.input.vector.y = 0; return; }
      let fx = 0, fy = 0, crowd = 0;
      for (const e of g.enemies) {
        if (e.isDead) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1) continue;
        const d = Math.sqrt(d2);
        if (policy === 'brawl') {
          // 貼臉：朝最近的敵人走（用來測近戰／短射程武器到底打不打得到）
          if (d < 420) { fx -= dx / d; fy -= dy / d; }
        } else if (d < 240) {
          fx += dx / d / d * 10000; fy += dy / d / d * 10000;
          if (d < 90) crowd++;
        }
      }
      const m = Math.hypot(fx, fy);
      if (m > 1e-3) { g.input.vector.x = fx / m; g.input.vector.y = fy / m; }
      else { g.input.vector.x = Math.cos(g.gameTime * 0.8); g.input.vector.y = Math.sin(g.gameTime * 0.8); }
      // 風箏才用翻滾；貼臉打法刻意不用（要真的吃到接觸傷害）
      if (policy === 'kite' && crowd >= 3 && p.dashTimer <= 0 && g.input.onDash) { g.input.onDash(); dashCount++; }
    };

    /* ── 量測：把「衝擊傷害」與「逐幀持續傷害」分開 ──────────────
       game._damageTaken 是總和；takeDamage 這一條是吃無敵影格的衝擊傷害。
       兩者相減 = 屬性 DoT 與地面區域那種逐幀結算的傷害（就是這一輪新增的通道）。 */
    const p = g.player;
    const stats = { impact: 0, impactElem: 0, hits: 0, elemCalls: {}, dotSeen: 0 };
    const origTake = p.takeDamage.bind(p);
    p.takeDamage = function (amount, source, element, potency) {
      // 用 game._damageTaken 的差值而不是 hp 的差值：護盾吸收、不死模式、
      // 以及「這一幀同時被打好幾下」都不會讓這個數字失真。
      const before = g._damageTaken || 0;
      const r = origTake(amount, source, element, potency);
      const applied = Math.max(0, (g._damageTaken || 0) - before);
      if (applied > 0) {
        stats.impact += applied;
        stats.hits++;
        if (element && element !== 'physical') stats.impactElem += applied;
      }
      return r;
    };
    const origApply = p.applyElement.bind(p);
    p.applyElement = function (id, potency, source) {
      stats.elemCalls[id] = (stats.elemCalls[id] || 0) + 1;
      return origApply(id, potency, source);
    };
    // 不死模式：直接把「致命傷的出口」換掉。只靠每幀補血是不夠的 ——
    // 屬性 DoT 在 update 裡面就可能把血扣到 0，那時玩家已經 isDead 了（實測 1/3 場提早結束）。
    if (cfg.immortal) {
      const origLethal = p.onLethal.bind(p);
      p.onLethal = function () { this.hp = this.maxHp; this.isDead = false; this.clearElements(); return true; };
      unwrap.push(() => { p.onLethal = origLethal; });
    }
    unwrap.push(() => { p.takeDamage = origTake; p.applyElement = origApply; });

    /* ── 主迴圈 ───────────────────────────────────────────────── */
    const capSec = cfg.minutes * 60;
    const dt = 1 / 60;
    const samples = [];
    let frames = 0;
    let elemPeak = 0;
    let elemUptimeFrames = 0;
    let contactFrames = 0;
    const maxFrames = Math.ceil(capSec * 62);

    // 接觸與屬性層數用 10Hz 取樣：1Hz 會漏掉「撞一下就走」的短暫接觸
    //（實測第一版：明明吃了喪屍步兵與獵犬的接觸傷害，接觸時間卻印 0.0s）。
    let tickFrames = 0;
    const tickNow = () => {
      tickFrames++;
      const stacks = Object.values(g.player.elementStatus || {}).reduce((a, b) => a + (b.stacks || 0), 0);
      elemPeak = Math.max(elemPeak, stacks);
      if (stacks > 0) elemUptimeFrames++;
      for (const e of g.enemies) {
        if (e.isDead) continue;
        const dx = e.x - g.player.x, dy = e.y - g.player.y;
        if (dx * dx + dy * dy < (e.radius + g.player.radius + 6) ** 2) { contactFrames++; break; }
      }
    };
    const sampleNow = () => {
      const stacks = Object.values(g.player.elementStatus || {}).reduce((a, b) => a + (b.stacks || 0), 0);
      samples.push({
        t: Number(g.gameTime.toFixed(2)),
        hp: Math.round(g.player.hp),
        maxHp: Math.round(g.player.maxHp),
        enemies: g.enemies.length,
        taken: Math.round(g._damageTaken || 0),
        kills: g.kills,
        lvl: g.player.level,
        stacks,
      });
    };

    while (g.gameTime < capSec && !g.player.isDead && frames < maxFrames) {
      steer(cfg.policy);
      resolveState();
      g.update(dt);
      // 不死模式：每幀把血補滿，讓整段時間窗都有樣本（傷害量測不受影響）
      if (cfg.immortal && !g.player.isDead) g.player.hp = g.player.maxHp;
      frames++;
      if (frames % 6 === 0) tickNow();
      if (frames % 60 === 0) sampleNow();
      if (g.state === 'GAME_OVER') break;
    }
    sampleNow();

    const total = Math.round(g._damageTaken || 0);
    const bySource = Object.entries(g._dmgBySource || {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v]) => ({ source: k, dmg: Math.round(v) }));
    const weaponDamage = [...g.weaponManager.weapons.entries()]
      .map(([id, it]) => ({ id, level: it.level, dmg: Math.round(it.totalDamage || 0) }))
      .sort((a, b) => b.dmg - a.dmg);

    return {
      trial: cfg.trial,
      died: g.player.isDead,
      endT: Number(g.gameTime.toFixed(1)),
      capReached: !g.player.isDead && g.gameTime >= capSec,
      level: g.player.level,
      kills: g.kills,
      taken: total,
      impact: Math.round(stats.impact),
      dot: Math.max(0, total - Math.round(stats.impact)),
      impactElem: Math.round(stats.impactElem),
      hits: stats.hits,
      elemCalls: stats.elemCalls,
      elemPeak,
      elemUptime: Number((elemUptimeFrames / Math.max(1, tickFrames / 10)).toFixed(2)),
      contactUptime: Number((contactFrames / Math.max(1, tickFrames / 10)).toFixed(2)),
      dashes: dashCount,
      maxHp: Math.round(g.player.maxHp),
      bySource,
      weaponDamage,
      log: log.slice(-30),
      samples,
    };
  } finally {
    for (const fn of unwrap) { try { fn(); } catch (err) { /* 還原失敗不影響結果 */ } }
    save.difficultyUnlocked = origUnlocked;
    Math.random = origRandom;
    window.requestAnimationFrame = origRaf;
  }
}

/* ── 開頁面 ─────────────────────────────────────────────────────────── */
console.log(`# 自動試玩：${CFG.level} / ${CFG.difficulty} / 走位 ${CFG.policy} / 選卡 ${CFG.build} / ${CFG.trials} 場 / seed ${CFG.seed}`);
console.log(`# 目標 ${TARGET}${CFG.realtime ? '（真實時間模式）' : '（加速模式：不渲染，量平衡用）'}`);

const browser = await pw.chromium.launch({
  args: ['--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-rasterization', '--mute-audio'],
});
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 720 } });
// 在「遊戲的任何一行程式碼跑之前」就把 Math.random 換成固定序列。
// 只靠每場開始前 reseed 是不夠的：開場的非同步工作（貼圖解碼、地表烘焙、
// 裝飾生成）會在 reseed 之後才消耗亂數，兩次執行就會走出不同的世界
//（實測：同一組參數兩次跑出 229% vs 315% 的第 6 分鐘壓力）。
await context.addInitScript(({ seed, freezeLoop }) => {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 加速模式連「載入後到我接手之前」那一小段真實 rAF 也要關掉：
  // 那幾幀的數量取決於機器速度，會讓兩次執行從不同的世界狀態開始（實測不可重現）。
  if (freezeLoop) window.requestAnimationFrame = () => 0;
}, { seed: CFG.seed, freezeLoop: !CFG.realtime });
const page = await context.newPage();
page.setDefaultTimeout(180000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game, null, { timeout: 60000 });

const trials = [];
const t0 = Date.now();
if (CFG.shots) { try { mkdirSync(CFG.shots, { recursive: true }); } catch (err) { /* 已存在 */ } }

if (CFG.realtime) {
  /* 真實時間模式：保留 rAF 與渲染，由 Node 端輪詢；適合看畫面與截圖 */
  await page.evaluate(async (cfg) => {
    const g = window.game;
    const { save } = await import(new URL('js/save.js', document.baseURI).href);
    save.data.difficulty = cfg.difficulty;
    save.difficultyUnlocked = () => true;
    save.data.stash = []; save.data.equipped = []; save.data.boosters = [];
    g.modeId = 'survivor'; g.levelId = cfg.level; g.start();
    g.ui.startScreen && g.ui.startScreen.classList.add('hidden');
    window.__pt = { log: [], impact: 0, impactElem: 0, hits: 0, elemCalls: {} };
    // 真實時間模式也把「衝擊傷害」與「逐幀持續傷害」分開（走 _damageTaken 差分，
    // 與加速模式同一套定義），否則報告裡的通道佔比會是 0/0。
    const pl = g.player;
    const origTake = pl.takeDamage.bind(pl);
    pl.takeDamage = function (amount, source, element, potency) {
      const before = g._damageTaken || 0;
      const r = origTake(amount, source, element, potency);
      const applied = Math.max(0, (g._damageTaken || 0) - before);
      if (applied > 0) {
        window.__pt.impact += applied;
        window.__pt.hits++;
        if (element && element !== 'physical') window.__pt.impactElem += applied;
      }
      return r;
    };
    const origApply = pl.applyElement.bind(pl);
    pl.applyElement = function (id, potency, source) {
      window.__pt.elemCalls[id] = (window.__pt.elemCalls[id] || 0) + 1;
      return origApply(id, potency, source);
    };
    const pickUpgrade = (opts) => {
      const evo = opts.find((o) => o.type === 'evo'); if (evo) return evo;
      const nw = opts.find((o) => o.type === 'weapon_new');
      if (nw && g.weaponManager.weapons.size < 4) return nw;
      return opts.find((o) => o.type === 'weapon_upgrade') || opts.find((o) => o.id === 'max_hp_vest') || opts[0];
    };
    window.__pt.pickUpgrade = pickUpgrade;
    window.__pt.claim = () => {
      const vis = (el) => el && el.offsetParent !== null;
      if (g.state === 'CHEST_MODAL') { const b = document.getElementById('btn-chest-claim'); if (vis(b)) b.click(); }
      else if (g.state === 'BLESSING_MODAL') { const c = [...document.querySelectorAll('.upgrade-card.card-blessing')].filter(vis)[0]; if (c) c.click(); }
      else if (g.state === 'MERCHANT_MODAL') { const b = document.getElementById('btn-close-merchant'); if (vis(b)) b.click(); }
      else if (g.state === 'LEVEL_UP') {
        const o = g.ui.generateUpgradeOptions(g.weaponManager, null, g.banished);
        if (o && o.length) g.applyUpgradeOption(window.__pt.pickUpgrade(o)); else g.state = 'PLAYING';
      }
    };
    window.__pt.timer = setInterval(() => {
      window.__pt.claim();
      if (g.state !== 'PLAYING' || !g.player || g.player.isDead) return;
      const p = g.player;
      if (cfg.policy === 'still') { g.input.vector.x = 0; g.input.vector.y = 0; return; }
      let fx = 0, fy = 0, crowd = 0;
      for (const e of g.enemies) {
        if (e.isDead) continue;
        const dx = p.x - e.x, dy = p.y - e.y; const d2 = dx * dx + dy * dy;
        if (d2 <= 1) continue;
        const d = Math.sqrt(d2);
        if (cfg.policy === 'brawl') { if (d < 420) { fx -= dx / d; fy -= dy / d; } }
        else if (d < 240) { fx += dx / d / d * 10000; fy += dy / d / d * 10000; if (d < 90) crowd++; }
      }
      const m = Math.hypot(fx, fy);
      if (m > 1e-3) { g.input.vector.x = fx / m; g.input.vector.y = fy / m; }
      if (cfg.policy === 'kite' && crowd >= 3 && p.dashTimer <= 0 && g.input.onDash) g.input.onDash();
    }, 16);
  }, CFG);

  let lastShot = -1;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await page.evaluate(() => {
      const g = window.game;
      if (!g || !g.player) return null;
      return {
        t: g.gameTime, state: g.state, dead: g.player.isDead, hp: Math.round(g.player.hp),
        maxHp: Math.round(g.player.maxHp), enemies: g.enemies.length, taken: Math.round(g._damageTaken || 0),
        kills: g.kills, lvl: g.player.level,
        stacks: Object.values(g.player.elementStatus || {}).reduce((a, b) => a + (b.stacks || 0), 0),
      };
    });
    if (!st) continue;
    const minute = Math.floor(st.t / 60);
    if (CFG.shots && minute !== lastShot && minute >= 1) {
      lastShot = minute;
      await page.screenshot({ path: path.join(CFG.shots, `min-${String(minute).padStart(2, '0')}.png`) }).catch(() => {});
    }
    console.log(`  [${fmt(st.t)}] HP ${st.hp}/${st.maxHp}　LV ${st.lvl}　敵 ${st.enemies}　累計承受 ${st.taken}　屬性層數 ${st.stacks}`);
    if (st.dead || st.state === 'GAME_OVER' || st.t >= CFG.minutes * 60) break;
  }
  const fin = await page.evaluate(() => {
    const g = window.game;
    clearInterval(window.__pt.timer);
    const total = Math.round(g._damageTaken || 0);
    const impact = Math.round(window.__pt.impact || 0);
    const stacks = Object.values(g.player.elementStatus || {}).reduce((a, b) => a + (b.stacks || 0), 0);
    return {
      died: g.player.isDead, endT: Number(g.gameTime.toFixed(1)), level: g.player.level, kills: g.kills,
      taken: total, impact, dot: Math.max(0, total - impact), impactElem: Math.round(window.__pt.impactElem || 0),
      hits: window.__pt.hits || 0, elemCalls: window.__pt.elemCalls || {},
      maxHp: Math.round(g.player.maxHp), dashes: 0, contactUptime: 0,
      elemPeak: stacks, elemUptime: 0,
      bySource: Object.entries(g._dmgBySource || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ source: k, dmg: Math.round(v) })),
      weaponDamage: [...g.weaponManager.weapons.entries()].map(([id, it]) => ({ id, level: it.level, dmg: Math.round(it.totalDamage || 0) })),
      samples: [], log: [],
    };
  });
  trials.push({ ...fin, trial: 1, capReached: !fin.died });
} else {
  for (let i = 1; i <= CFG.trials; i++) {
    const r = await page.evaluate(playOneTrial, { ...CFG, trial: i });
    trials.push(r);
    console.log(`  第 ${i} 場：${r.died ? `陣亡於 ${fmt(r.endT)}` : `存活至 ${fmt(r.endT)}${r.capReached ? '（達模擬上限）' : ''}`}　LV ${r.level}　${r.kills} 殺　承受 ${r.taken}（衝擊 ${r.impact} / 持續 ${r.dot}）`);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
await browser.close();

/* ══ 聚合與報告 ═══════════════════════════════════════════════════════ */
function fmt(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const median = (arr) => {
  const a = [...arr].filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// 每分鐘的承受 DPS：只採計「那一分鐘還活著」的場次
const maxMinute = Math.max(...trials.map((t) => Math.floor(t.endT / 60)), 1);
const dpsByMinute = [];
const enemiesByMinute = [];
const hpByMinute = [];
const trialsByMinute = [];
for (let m = 0; m < maxMinute; m++) {
  const dps = [];
  const ens = [];
  const hps = [];
  for (const tr of trials) {
    const a = tr.samples.find((s) => s.t >= m * 60) || tr.samples[0];
    const b = tr.samples.find((s) => s.t >= (m + 1) * 60);
    if (!a || !b) continue;                                   // 這一分鐘之前就死了
    if (b.t - a.t < 30) continue;                             // 樣本不足（剛好死在邊界）
    dps.push((b.taken - a.taken) / (b.t - a.t));
    ens.push((a.enemies + b.enemies) / 2);
    hps.push((a.maxHp + b.maxHp) / 2);
  }
  dpsByMinute.push(median(dps));
  enemiesByMinute.push(median(ens));
  hpByMinute.push(median(hps));
  trialsByMinute.push(dps.length);
  if (dpsByMinute[m] == null) break;   // 這分鐘已經沒人活著 → 後面的也不用算了
}

// 收尾：最後一段不足一分鐘的區間（就是陣亡的那一段）也要算進來，
// 否則「第一次有感」與平台期判定都會看不到最關鍵的那一分鐘。
{
  const tailDps = [];
  const tailEns = [];
  const tailHps = [];
  for (const tr of trials) {
    if (tr.capReached) continue;
    const idx = tr.samples.findIndex((s) => s.t >= maxMinute * 60);
    const last = tr.samples[tr.samples.length - 1];
    const prev = idx >= 0 ? tr.samples[idx] : null;
    if (!prev || !last || last.t - prev.t < 20) continue;
    tailDps.push((last.taken - prev.taken) / (last.t - prev.t));
    tailEns.push((prev.enemies + last.enemies) / 2);
    tailHps.push(last.maxHp);
  }
  if (tailDps.length && dpsByMinute.length) {
    dpsByMinute.push(median(tailDps));
    enemiesByMinute.push(median(tailEns));
    hpByMinute.push(median(tailHps));
    trialsByMinute.push(tailDps.length);
  }
}

// 壓力 = 每分鐘吃掉多少「最大生命的百分比」。
// 為什麼不用絕對 DPS：250 HP 的 build 吃 3 DPS 跟 100 HP 的 build 吃 3 DPS
// 是完全不同的處境，而同一場裡 maxHp 一路在長 —— 絕對值會把曲線拉平，
// 百分比才看得出「壓力有沒有跟著玩家的成長一起長」。
const hpPctByMinute = dpsByMinute.map((d, m) => {
  const hp = hpByMinute[m];
  if (d == null || !hp) return null;
  return (d * 60 / hp) * 100;
});

// 平滑度：相鄰分鐘的相對跳動（跳動大 = 曲線有階梯）
let worstJump = 0;
let worstJumpAt = null;
let worstJumpDetail = null;
for (let m = 1; m < dpsByMinute.length; m++) {
  const a = dpsByMinute[m - 1];
  const b = dpsByMinute[m];
  if (a == null || b == null) continue;
  if ((trialsByMinute[m] || 0) < 2 || (trialsByMinute[m - 1] || 0) < 2) continue;   // 單場樣本＝雜訊
  // 低基期的相對跳動不算階梯：0.2 → 1.5 DPS 是 ×7，但那個絕對值對玩家完全無感。
  // 只在「壓力已經不可忽略」（兩邊較大者 ≥ 3 DPS）時才把它算成曲線形狀的問題。
  if (Math.max(a, b) < 3) continue;
  const rel = Math.abs(b - a) / Math.max(0.5, a);
  if (rel > worstJump) {
    worstJump = rel;
    worstJumpAt = `第 ${m}→${m + 1} 分`;
    worstJumpDetail = {
      from: { dps: a, pct: hpPctByMinute[m - 1], enemies: enemiesByMinute[m - 1] },
      to: { dps: b, pct: hpPctByMinute[m], enemies: enemiesByMinute[m] },
    };
  }
}

// 不死平台期：連續 3 分鐘「壓力 < 5% 最大生命／分鐘」而且場上還有 >20 隻怪。
// 5%/分 的意思是：完全不動、不吃補血，也要 20 分鐘才會死 —— 那就是玩家回報的
// 「過了一個強度就基本不死了」。場上還要有怪才算，沒怪的空窗不算平台期。
const PLATEAU_PCT = 5;
let plateau = null;
for (let m = 0; m + 3 <= hpPctByMinute.length; m++) {
  const win = hpPctByMinute.slice(m, m + 3);
  const ens = enemiesByMinute.slice(m, m + 3);
  if (win.every((d) => d != null && d < PLATEAU_PCT) && ens.every((e) => e != null && e > 20)) {
    plateau = { from: m + 1, to: m + 3, enemies: Math.round(Math.max(...ens)), pct: Math.max(...win) };
    break;
  }
}

// 傷害通道佔比（跨場次加總）
const sum = (f) => trials.reduce((a, t) => a + (Number(f(t)) || 0), 0);
const totalTaken = sum((t) => t.taken);
const totalImpact = sum((t) => t.impact);
const totalDot = sum((t) => t.dot);
const elemPeak = Math.max(...trials.map((t) => t.elemPeak || 0));
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
// 用平均而不是中位數：三場裡兩場是 0、一場有接觸時，中位數會印 0.0s，
// 把「其實有接觸」這件事蓋掉（實測踩過）。
const elemUptime = mean(trials.map((t) => t.elemUptime || 0));
const contactUptime = mean(trials.map((t) => t.contactUptime || 0));
const elemCalls = {};
for (const t of trials) for (const [k, v] of Object.entries(t.elemCalls || {})) elemCalls[k] = (elemCalls[k] || 0) + v;

// 武器傷害（跨場次加總，抓「整場 0 傷害」的武器）
const weaponAgg = {};
for (const t of trials) for (const w of t.weaponDamage || []) {
  const cur = weaponAgg[w.id] || { dmg: 0, level: w.level };
  cur.dmg += w.dmg;
  cur.level = Math.max(cur.level, w.level);
  weaponAgg[w.id] = cur;
}
const weaponTotal = Object.values(weaponAgg).reduce((a, w) => a + w.dmg, 0);
const deadWeapons = Object.entries(weaponAgg).filter(([, w]) => w.dmg === 0).map(([id]) => id);

/* ── 報告 ───────────────────────────────────────────────────────────── */
const line = (s = '') => console.log(s);
line('');
line('══ 試玩報告 ══════════════════════════════════════════════════════');
line(`關卡 ${CFG.level}　難度 ${CFG.difficulty}　走位 ${CFG.policy}　選卡 ${CFG.build}　${trials.length} 場　seed ${CFG.seed}　耗時 ${elapsed}s`);
line('');
line('── 各場結果 ' + '─'.repeat(48));
line('  場次   存活     等級  擊殺   承受傷害（衝擊/持續）  死因');
for (const t of trials) {
  const cause = t.bySource && t.bySource[0] ? `${t.bySource[0].source} ${t.bySource[0].dmg}` : (t.died ? '未知' : '—');
  line(`  #${String(t.trial).padEnd(5)} ${(t.died ? fmt(t.endT) : fmt(t.endT) + '+').padEnd(8)} ${String(t.level).padEnd(5)} ${String(t.kills).padEnd(6)} ${String(t.taken).padEnd(6)}（${t.impact} / ${t.dot}）`.padEnd(60) + cause);
}
line('');
line(`── 難度曲線（每分鐘，跨場次中位數）${CFG.immortal ? '【不死模式：樣本完整】' : ''}` + '─'.repeat(12));
const barMax = Math.max(1, ...dpsByMinute.filter((d) => d != null));
for (let m = 0; m < dpsByMinute.length; m++) {
  const d = dpsByMinute[m];
  if (d == null) { line(`  ${String(m + 1).padStart(2)} 分  （無人在世）`); continue; }
  const tail = m === dpsByMinute.length - 1 && trials.some((t) => !t.capReached);
  const pct = hpPctByMinute[m];
  const bar = '█'.repeat(Math.max(1, Math.round((d / barMax) * 28)));
  const pctTxt = pct == null ? '    ?' : `${pct.toFixed(1)}%`.padStart(6);
  const n = trialsByMinute[m] || 0;
  line(`  ${String(m + 1).padStart(2)} 分  ${d.toFixed(1).padStart(6)} DPS ${pctTxt}/分  ${bar}  敵 ${String(enemiesByMinute[m] == null ? '?' : Math.round(enemiesByMinute[m])).padStart(3)}  樣本 ${n}/${trials.length}${tail && !CFG.immortal ? '   ← 陣亡區間' : ''}`);
}
line('');
line(`  曲線平滑度：相鄰分鐘最大跳動 ×${worstJump.toFixed(2)}${worstJumpAt ? `（${worstJumpAt}）` : ''}${worstJump <= CFG.maxJump ? '　✅' : '　⚠️ 偏大'}`);
if (worstJumpDetail) {
  const d = worstJumpDetail;
  const jumpEnemies = d.to.enemies != null && d.from.enemies != null
    ? `；同期敵人數 ${Math.round(d.from.enemies)} → ${Math.round(d.to.enemies)}` : '';
  line(`    ${worstJumpAt}：${d.from.pct == null ? '?' : d.from.pct.toFixed(0)}% → ${d.to.pct == null ? '?' : d.to.pct.toFixed(0)}%/分${jumpEnemies}`);
  if (d.to.enemies != null && d.to.enemies > 200 && d.from.enemies != null && d.from.enemies < d.to.enemies * 0.4) {
    line('    ↑ 這個跳動來自「怪潮撞上同屏上限」而不是傷害公式：生成速率在這一分鐘追上清場速率，');
    line('      敵人數一次衝到數百隻。要拉平曲線的話，該調的是波次表與生成間隔，不是傷害倍率。');
  }
}
line(`  壓力單位＝每分鐘吃掉最大生命的百分比（5%/分 ≈ 不吃補血也要 20 分鐘才會死）`);
line(plateau
  ? `  不死平台期：⚠️ 第 ${plateau.from}~${plateau.to} 分壓力都 < ${PLATEAU_PCT}%/分（最高 ${plateau.pct.toFixed(1)}%），但場上還有 ~${plateau.enemies} 隻怪`
  : '  不死平台期：無 ✅');
line(`  首次有感（壓力 ≥ 25%/分 ≈ 4 分鐘內會死）：${(() => { const i = hpPctByMinute.findIndex((d) => d != null && d >= 25); return i === -1 ? '整場都沒有（壓力始終偏低）' : `第 ${i + 1} 分`; })()}`);
line('');
line('── 傷害通道 ' + '─'.repeat(50));
const pctOf = (v) => (totalTaken > 0 ? `${((v / totalTaken) * 100).toFixed(0)}%` : '—');
line(`  衝擊傷害（吃無敵影格）  ${String(totalImpact).padStart(7)}  ${pctOf(totalImpact)}`);
line(`  持續傷害（逐幀結算）    ${String(totalDot).padStart(7)}  ${pctOf(totalDot)}　← 屬性 DoT ＋ 地面區域`);
line(`  屬性層數峰值 ${elemPeak}　有屬性在身上的時間 ${elemUptime == null ? '?' : elemUptime.toFixed(1)}s　附著次數 ${JSON.stringify(elemCalls)}`);
line(`  與敵人接觸的時間 ${contactUptime == null ? '?' : contactUptime.toFixed(1)}s　翻滾 ${(mean(trials.map((t) => t.dashes || 0)) || 0).toFixed(1)} 次`);
line('');
line('── 承受傷害來源（跨場次加總，前 6）' + '─'.repeat(26));
const srcAgg = {};
for (const t of trials) for (const s of t.bySource || []) srcAgg[s.source] = (srcAgg[s.source] || 0) + s.dmg;
Object.entries(srcAgg).sort((a, b) => b[1] - a[1]).slice(0, 6)
  .forEach(([k, v]) => line(`  ${String(v).padStart(7)}  ${k}`));
line('');
line('── 武器傷害佔比（跨場次加總）' + '─'.repeat(32));
for (const [id, w] of Object.entries(weaponAgg).sort((a, b) => b[1].dmg - a[1].dmg)) {
  const pct = weaponTotal > 0 ? `${((w.dmg / weaponTotal) * 100).toFixed(0)}%` : '—';
  line(`  ${String(w.dmg).padStart(9)}  ${pct.padStart(4)}  ${id}${w.level ? ` Lv${w.level}` : ''}${w.dmg === 0 ? '   ← 整場 0 傷害' : ''}`);
}
if (trials[0].log && trials[0].log.length) line(`\n  選卡紀錄（第一場）: ${trials[0].log.join(' → ')}`);

/* ── 判定 ───────────────────────────────────────────────────────────── */
if (CFG.assert) {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: String(detail == null ? '' : detail) });
  ok('過程沒有未捕捉的例外', pageErrors.length === 0, pageErrors.slice(0, 2).join(' / ') || '0 筆');
  ok(`難度曲線沒有階梯（相鄰分鐘相對跳動 ≤ ${CFG.maxJump}）`, worstJump <= CFG.maxJump,
    `×${worstJump.toFixed(2)}${worstJumpAt ? ` @ ${worstJumpAt}` : ''}`);
  ok('（不死模式）壓力會隨時間上升，不是平的', CFG.immortal
    ? (() => { const v = hpPctByMinute.filter((x) => x != null); return v.length >= 4 && Math.max(...v) > Math.max(...v.slice(0, 2)) * 2; })()
    : true, CFG.immortal ? `前兩分鐘最高 ${Math.max(...hpPctByMinute.filter((x) => x != null).slice(0, 2)).toFixed(0)}%/分 → 最高 ${Math.max(...hpPctByMinute.filter((x) => x != null)).toFixed(0)}%/分` : '（非不死模式，跳過）');
  ok(`沒有「不死平台期」（連續 3 分鐘壓力 < ${PLATEAU_PCT}%/分 且場上 > 20 隻）`, !plateau,
    plateau ? `第 ${plateau.from}~${plateau.to} 分` : '無');
  ok('持續傷害通道有生效（屬性層數峰值 ≥ 1）', elemPeak >= 1, `峰值 ${elemPeak} 層`);
  ok('沒有武器整場 0 傷害' + (CFG.policy === 'brawl' ? '（貼臉打法下這一定是 bug）' : ''),
    CFG.policy === 'brawl' ? deadWeapons.length === 0 : true,
    deadWeapons.length ? `${deadWeapons.join('、')}${CFG.policy === 'brawl' ? '' : '（風箏打法下可能打不到，僅供參考）'}` : '無');
  line('');
  line('── 判定 ' + '─'.repeat(52));
  let failed = 0;
  for (const c of checks) {
    line(`  ${c.pass ? '✅' : '❌'} ${c.name}${c.detail ? `　[${c.detail}]` : ''}`);
    if (!c.pass) failed++;
  }
  line('');
  line(failed ? `${failed} 項失敗` : '全部通過');
  if (failed) process.exitCode = 1;
}

if (CFG.json) {
  writeFileSync(CFG.json, JSON.stringify({ cfg: CFG, trials, dpsByMinute, enemiesByMinute, worstJump, plateau, pageErrors }, null, 1));
  line(`\n原始量測已寫入 ${CFG.json}`);
}
if (pageErrors.length) line(`\n⚠️ page error ${pageErrors.length} 筆：${pageErrors.slice(0, 3).join(' / ')}`);
