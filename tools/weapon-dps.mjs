// 武器 DPS 對照表：每把武器在同一個固定場景下打 10 秒，印出每秒傷害，調平衡時比「誰太強／誰沒人用」。
//
// 場景：12 隻不會動的生化巨漢（血量放大到打不死），兩種排法 ——
//   pack 群聚（4×3 擠在右前方，吃範圍與穿透）／ring 散開（三圈繞著玩家，吃追蹤與索敵）
//   close 貼身（一圈 60~100，環繞型與近戰武器只打得到這種）
// 基礎武器量 Lv1 與 Lv5；超武量 Lv1。特工專屬武器（exclusiveTo）用該特工開局，其餘用鴨鴨。
// 生成器關掉、玩家無敵、站在原地 —— 量的是武器本身，不含走位與被動。
//
// 用法：
//   node tools/weapon-dps.mjs                 （自己起伺服器在 8899；已有人在跑就直接用）
//   PROBE_URL=http://127.0.0.1:8899/index.html node tools/weapon-dps.mjs
//   node tools/weapon-dps.mjs kunai lance     （只量指定武器）
// 數字是相對值：拿來比武器之間，不是實戰 DPS（實戰還有暴擊、型態、配件、協同）。
import { spawn } from 'node:child_process';

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const PORT = 8899;
const URL = process.env.PROBE_URL || `http://127.0.0.1:${PORT}/index.html`;

let server = null;
if (!process.env.PROBE_URL) {
  const up = await fetch(URL).then(() => true).catch(() => false);
  if (!up) {
    server = spawn('python3', ['tools/dev-server.py', String(PORT)], { stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await fetch(URL).then(() => true).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
  }
}

const only = process.argv.slice(2);
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game, null, { timeout: 120000 });

const rows = await page.evaluate(async (only) => {
  const { Enemy } = await import('/js/entities/Enemy.js');
  const { WEAPONS } = await import('/js/config.js');
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  const run = (char, w, lv, layout) => {
    g.characterId = char; g.modeId = 'survivor'; g.levelId = 'street'; g.start(); g.state = 'PLAYING';
    g.spawner.update = () => {};
    for (let i = 0; i < 3; i++) g.update(1 / 60);
    const p = g.player; const wm = g.weaponManager;
    g.enemies = []; wm.projectiles = []; wm.weapons.clear(); wm.addWeapon(w); wm.weapons.get(w).level = lv;
    for (let i = 0; i < 12; i++) {
      const ringR = layout === 'close' ? 60 + (i % 3) * 20 : 140 + (i % 3) * 60;
      const [dx, dy] = layout === 'pack'
        ? [160 + (i % 4) * 28, -40 + Math.floor(i / 4) * 40]
        : [Math.cos((i / 12) * 6.28) * ringR, Math.sin((i / 12) * 6.28) * ringR];
      const e = new Enemy('brute', p.x + dx, p.y + dy, { hp: 1e6 }); e.speed = 0; g.enemies.push(e);
    }
    const tracked = g.enemies.slice();
    const hp0 = tracked.reduce((s, e) => s + e.hp, 0);
    for (let i = 0; i < 600; i++) {
      p.invulnerableTimer = 1e9; p.hp = p.maxHp; p.x = 0; p.y = 0;
      if (g.state !== 'PLAYING') g.state = 'PLAYING';
      g.update(1 / 60);
    }
    return Math.round((hp0 - tracked.reduce((s, e) => s + Math.max(0, e.hp), 0)) / 10);
  };
  const out = [];
  for (const [id, def] of Object.entries(WEAPONS)) {
    if (only.length && !only.includes(id)) continue;
    const owner = def.exclusiveTo
      || (def.baseWeapon && WEAPONS[def.baseWeapon]?.exclusiveTo) || 'duck';
    if (def.isEvo) {
      out.push({ id, name: def.name, evo: true, lv1Pack: run(owner, id, 1, 'pack'), lv1Ring: run(owner, id, 1, 'ring'), lv1Close: run(owner, id, 1, 'close') });
    } else {
      out.push({ id, name: def.name, evo: false, lv1Pack: run(owner, id, 1, 'pack'), lv5Pack: run(owner, id, 5, 'pack'), lv5Ring: run(owner, id, 5, 'ring'), lv5Close: run(owner, id, 5, 'close') });
    }
  }
  return out;
}, only);

const pad = (v, n) => String(v ?? '').padStart(n);
console.log('基礎武器（10 秒 DPS）           Lv1群聚  Lv5群聚  Lv5散開  Lv5貼身');
for (const r of rows.filter((r) => !r.evo)) console.log(`  ${r.name.padEnd(12, '　')} ${pad(r.lv1Pack, 7)}  ${pad(r.lv5Pack, 7)}  ${pad(r.lv5Ring, 7)}  ${pad(r.lv5Close, 7)}`);
console.log('超武（Lv1）                     群聚     散開     貼身');
for (const r of rows.filter((r) => r.evo)) console.log(`  ${r.name.padEnd(12, '　')} ${pad(r.lv1Pack, 7)}  ${pad(r.lv1Ring, 7)}  ${pad(r.lv1Close, 7)}`);

await browser.close();
if (server) server.kill();
