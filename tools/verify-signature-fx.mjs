// 五脈技能演出（SignatureFX）的回歸檢查：符火陣、九天雷劫、九轉金丹、獅子吼、血魔化身，
// 加上金剛罩的鐘形金罩。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-signature-fx.mjs
//
// 這支要擋的是「為了好看而偷偷改到傷害」：每一招的每一次結算都要對得上舊版的
// 倍率與半徑（九天雷劫是總量不變、改成依序落下），以及演出時間到就清乾淨、
// 重開新局不會把上一局的演出帶進來。
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const out = await page.evaluate(async () => {
  const r = [];
  const ok = (name, pass, detail = '') => r.push({ name, pass: !!pass, detail: String(detail) });
  const { SIG, spawnSignatureFX, drawSignatureFX } = await import('/js/systems/SignatureFX.js');
  const { castSkill, SKILLS } = await import('/js/systems/Skills.js');
  const { enemyScale } = await import('/js/levels.js');

  const g = window.game;
  const DT = 1 / 60;
  // 關掉遊戲自己的 rAF 迴圈：它會在我們兩張截圖之間偷偷 update／render
  // （實測「同狀態連拍兩張」會差到 3500 px，畫面量測會變成隨機）。之後全部手動推進。
  g.loop = () => {};
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));


  // 用真實流程開局（青霜劍尊以外的角色才進得了這裡的判定）
  const boot = (charId) => {
    g.characterId = charId;
    g.ui.startScreen.classList.add('hidden');
    g.start();
    g.triggerLevelUp = () => {};
    g.player.invulnerableTimer = 1e9;
    for (let i = 0; i < 300 && !g.enemies.length; i++) g.update(DT);
  };
  boot('xian_sword');
  ok('場上有敵人可以當模板', g.enemies.length > 0, `敵人 ${g.enemies.length}`);
  const proto = g.enemies[0];

  // 把敵人排成一圈的假目標，並記錄每一次結算（倍率用當下的血量倍率換算回 mul）
  const placeFoes = (n, r0 = 70, r1 = 260) => {
    g.enemies.length = 0;
    const hits = [];
    for (let i = 0; i < n; i++) {
      const e = Object.create(Object.getPrototypeOf(proto));
      Object.assign(e, proto);
      const a = (i / n) * Math.PI * 2;
      const d = r0 + (r1 - r0) * ((i % 3) / 2);
      e.x = g.player.x + Math.cos(a) * d;
      e.y = g.player.y + Math.sin(a) * d;
      e.isDead = false; e.hp = 1e9; e.maxHp = 1e9; e.radius = 10;
      e.stunTimer = 0;
      const orig = e.takeDamage.bind(e);
      e.takeDamage = (dmg, knock, sx, sy) => {
        const sc = enemyScale(g.gameTime, g.level, g.rules).hp || 1;
        const mul = dmg / (100 * sc);
        // 技能結算都 ≥ 1.2×；自動武器的小傷害（0.0x×）不算，否則每一次都會被記進來。
        // 位置要記「被打之前」的：takeDamage 會擊退，打完再看位置已經被推走了（實測會差幾 px 到十幾 px）
        if (mul >= 0.2) hits.push({ dmg, mul, e, x: e.x, y: e.y });
        return orig(dmg, knock, sx, sy);
      };
      g.enemies.push(e);
    }
    return hits;
  };

  const grab = () => {
    g.render();
    const cv = g.ctx.canvas;
    const side = 600;
    return g.ctx.getImageData(Math.round(cv.width / 2 - side / 2), Math.round(cv.height / 2 - side / 2), side, side).data;
  };
  // 前後差分：只有「變亮／變色」到指定色相的像素才算演出（地板與敵人移動都不算）。
  // 色相要看「兩張的其中一張」都算 —— 演出消失時，帶色相的那張是 before，
  // 只看 after 的話「新增」抓得到、「消失」永遠是 0（實測踩過：消失只回報 7 px）。
  const hueMatch = (d, i, hue) => {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    if (hue === 'fire') return R > B + 40;
    if (hue === 'thunder') return B > R + 10;
    if (hue === 'green') return G > R + 20;
    if (hue === 'gold') return R > B + 40 && G > B + 30;
    if (hue === 'blood') return B > G + 20 || R > G + 60;
    return false;
  };
  const changed = (before, after, hue) => {
    let n = 0;
    for (let i = 0; i < after.length; i += 4) {
      const dr = after[i] - before[i], dg = after[i + 1] - before[i + 1], db = after[i + 2] - before[i + 2];
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 34) continue;
      if (hueMatch(after, i, hue) || hueMatch(before, i, hue)) n++;
    }
    return n;
  };

  const runSkill = (charId, idx, kind, hue, steps = 0.0, opts = {}) => {
    boot(charId);
    const hits = placeFoes(13);
    g.player.mp = 999;
    g.player.skillCd = [0, 0];
    if (opts.invulnTo != null) g.player.invulnerableTimer = opts.invulnTo;   // 測試要在意的是技能給的無敵秒數
    const before = grab();
    const casted = castSkill(g, idx);
    const fx = (g.signatureFX || []).find((f) => f.kind === kind);
    // 推進到演出中段（steps 秒）再取樣
    for (let i = 0; i < Math.round(steps / DT); i++) g.update(DT);
    const during = grab();
    const px = () => changed(before, during, hue);
    return { hits, casted, fx, px, step: (sec) => { for (let i = 0; i < Math.round(sec / DT); i++) g.update(DT); } };
  };

  // ── 1) 赤符天師・天火燎原 ─────────────────────────────
  {
    const s = runSkill('xian_talisman', 1, 'fire', 'fire', 0.6);
    ok('[天火燎原] 施放成功且建立符火陣演出', s.casted === true && !!s.fx && s.fx.sites.length === 5,
      `cast=${s.casted} sites=${s.fx?.sites.length} life=${s.fx?.life}`);
    ok('[天火燎原] 傷害與舊版相同（每次 150 半徑 × 1.6×）',
      s.hits.length > 0 && s.hits.every((h) => Math.abs(h.mul - 1.6) < 0.02),
      `${s.hits.length} 次結算，mul=${[...new Set(s.hits.map((h) => h.mul.toFixed(2)))].join('/')}`);
    const sites = s.fx.sites;
    const inRange = s.hits.every((h) => sites.some((p) => Math.hypot(h.x - p.x, h.y - p.y) <= 150 + h.e.radius + 0.5));
    ok('[天火燎原] 每個被燒到的敵人都在某個符火陣的 150 半徑內', inRange);
    ok('[天火燎原] 畫面出現符火（橘紅像素）', s.px() > 300, `新增 ${s.px()} px`);
    s.step(SIG.fire.life + 0.4);
    ok('[天火燎原] 演出時間到就消失', (g.signatureFX || []).every((f) => f.kind !== 'fire'), `剩 ${g.signatureFX?.length}`);
  }

  // ── 2) 紫霄雷君・九天雷劫 ─────────────────────────────
  {
    const s = runSkill('xian_mage', 1, 'thunder', 'thunder', 1.2);
    ok('[九天雷劫] 施放成功且建立雷雲演出', s.casted === true && !!s.fx && s.fx.targets.length === 12,
      `cast=${s.casted} targets=${s.fx?.targets.length}`);
    ok('[九天雷劫] 12 道雷都打出去了（總量不變、依序落下）', s.fx.done === 12, `已打 ${s.fx.done} 道（畫面上的雷柱會過期，只看次數）`);
    ok('[九天雷劫] 每道都是 2.2×', s.hits.length > 0 && s.hits.every((h) => Math.abs(h.mul - 2.2) < 0.03),
      `${s.hits.length} 次，mul=${[...new Set(s.hits.map((h) => h.mul.toFixed(2)))].join('/')}`);
    ok('[九天雷劫] 被打到的敵人都被麻痺 1.5 秒',
      s.fx.targets.every((e) => (e.stunTimer || 0) > 0), `目標 ${s.fx.targets.length} 名`);
    ok('[九天雷劫] 畫面出現雷柱（冷色像素）', s.px() > 300, `新增 ${s.px()} px`);
  }

  // ── 3) 九轉丹君・九轉金丹 ─────────────────────────────
  {
    boot('xian_alchemy');
    const hits = placeFoes(6);
    g.player.mp = 999;
    g.player.skillCd = [0, 0];
    g.player.hp = 20;
    const before = grab();
    const casted = castSkill(g, 1);
    for (let i = 0; i < Math.round(0.7 / DT); i++) g.update(DT);
    const px = changed(before, grab(), 'green') + changed(before, grab(), 'gold');
    ok('[九轉金丹] 施放成功且丹爐現形', casted === true && (g.signatureFX || []).some((f) => f.kind === 'pill'),
      `cast=${casted} fx=${(g.signatureFX || []).map((f) => f.kind).join(',')}`);
    ok('[九轉金丹] 生命全滿、攻擊加成 10 秒（取樣時已過 0.7 秒）',
      g.player.hp === g.player.maxHp && g.player.atkPotionTimer >= 9.2, `hp=${g.player.hp}/${g.player.maxHp} atk=${g.player.atkPotionTimer.toFixed(1)}`);
    ok('[九轉金丹] 這招不造成傷害（輔助技）', hits.length === 0, `結算 ${hits.length} 次`);
    ok('[九轉金丹] 畫面出現金丹與爐火（綠金像素）', px > 200, `新增 ${px} px`);
    for (let i = 0; i < Math.round(SIG.pill.life / DT) + 30; i++) g.update(DT);
    ok('[九轉金丹] 演出時間到就消失', !(g.signatureFX || []).some((f) => f.kind === 'pill'));
  }

  // ── 4) 金剛尊者・獅子吼 ───────────────────────────────
  {
    const s = runSkill('xian_zen', 1, 'lion', 'gold', 0.35);
    ok('[獅子吼] 施放成功且現出佛光輪', s.casted === true && !!s.fx, `cast=${s.casted} fx=${s.fx?.kind}`);
    ok('[獅子吼] 傷害與舊版相同（280 半徑 × 1.2×、暈眩 2 秒）',
      s.hits.length > 0 && s.hits.every((h) => Math.abs(h.mul - 1.2) < 0.02),
      `${s.hits.length} 次，mul=${[...new Set(s.hits.map((h) => h.mul.toFixed(2)))].join('/')}`);
    ok('[獅子吼] 280 範圍內的敵人都被暈眩 2 秒（取樣時已過 0.35 秒）',
      g.enemies.filter((e) => Math.hypot(e.x - g.player.x, e.y - g.player.y) <= 280).every((e) => (e.stunTimer || 0) >= 1.5),
      `最長暈眩剩 ${Math.max(0, ...g.enemies.map((e) => e.stunTimer || 0)).toFixed(2)}s`);
    ok('[獅子吼] 畫面出現金光與音波（金色像素）', s.px() > 200, `新增 ${s.px()} px`);
    s.step(SIG.lion.life + 0.3);
    ok('[獅子吼] 演出時間到就消失', !(g.signatureFX || []).some((f) => f.kind === 'lion'));
  }

  // ── 5) 血蓮魔姬・血魔化身 ─────────────────────────────
  {
    const s = runSkill('xian_demon', 1, 'blood', 'blood', 0.6, { invulnTo: 0 });
    ok('[血魔化身] 施放成功且血蓮綻放', s.casted === true && !!s.fx && s.fx.life === SIG.blood.life,
      `cast=${s.casted} life=${s.fx?.life}`);
    ok('[血魔化身] 傷害與舊版相同（240 半徑 × 2×）',
      s.hits.length > 0 && s.hits.every((h) => Math.abs(h.mul - 2) < 0.03),
      `${s.hits.length} 次，mul=${[...new Set(s.hits.map((h) => h.mul.toFixed(2)))].join('/')}`);
    // 取樣時已過 0.6 秒：無敵應剩 ~0.9 秒、攻擊加成剩 ~7.4 秒
    ok('[血魔化身] 無敵 1.5 秒、攻擊加成 8 秒（取樣時已過 0.6 秒）',
      g.player.invulnerableTimer >= 0.85 && g.player.atkPotionTimer >= 7.3,
      `inv=${g.player.invulnerableTimer.toFixed(2)}s atk=${g.player.atkPotionTimer.toFixed(1)}s`);
    ok('[血魔化身] 畫面出現血蓮與血霧（紫紅像素）', s.px() > 200, `新增 ${s.px()} px`);
    ok('[血魔化身] 演出活 8 秒＝化身期間（血氣纏身的視覺依據）', s.fx.life === 8, s.fx.life);
    s.step(SIG.blood.life + 0.5);
    ok('[血魔化身] 化身結束後演出也收掉', !(g.signatureFX || []).some((f) => f.kind === 'blood'));
  }

  // ── 6) 金剛罩：護盾期間的鐘形金罩（狀態驅動）──────────
  // 不跟遊戲自己的護盾視覺混在一起比對整張畫面（那是另一套視覺，實測會互相污染）：
  // 直接把繪製函式畫在一張乾淨的小畫布上，只看它自己畫了什麼。
  {
    boot('xian_zen');
    const domeProbe = (timer) => {
      const cv = document.createElement('canvas');
      cv.width = 240;
      cv.height = 240;
      const c2 = cv.getContext('2d');
      g.player.shieldPotionTimer = timer;
      g.player.shield = timer > 0 ? 40 : 0;
      drawSignatureFX(c2, { x: g.player.x - 120, y: g.player.y - 120 }, g, 'upper');
      const d = c2.getImageData(0, 0, 240, 240).data;
      let gold = 0, any = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 10) continue;
        any++;
        if (d[i] > d[i + 2] + 40 && d[i + 1] > d[i + 2] + 30) gold++;
      }
      return { gold, any };
    };
    const off = domeProbe(0);
    const on = domeProbe(5);
    const back = domeProbe(0);
    ok('[金剛罩] 護盾期間畫出鐘形金罩', on.gold > 150 && off.gold === 0, `開 ${on.gold} px（金）／關 ${off.gold} px`);
    ok('[金剛罩] 護盾結束就不再畫（沒有演出時整個函式是 no-op）',
      back.gold === 0 && back.any === 0, `關 ${back.gold} px、任何像素 ${back.any}`);
  }

  // ── 7) 跨局與空清單的邊界 ─────────────────────────────
  {
    boot('xian_demon');
    g.player.mp = 999; g.player.skillCd = [0, 0];
    castSkill(g, 1);
    const active = (g.signatureFX || []).length;
    g.start();
    ok('開著演出重開新局 → 不會殘留', active > 0 && (g.signatureFX || []).length === 0,
      `施放=${active} 新局=${(g.signatureFX || []).length}`);
    // 沒有演出的時候繪製函式必須是 no-op
    let safe = true;
    try { spawnSignatureFX(g, 'nope'); } catch { safe = false; }
    ok('未知的演出類型不會炸掉', safe && (g.signatureFX || []).every((f) => f.life > 0 || f.kind === 'nope'));
  }

  return r;
});

let fail = 0;
for (const t of out) { if (!t.pass) fail++; console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`); }
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${out.length - (fail - (pageErrors.length ? 1 : 0))} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
