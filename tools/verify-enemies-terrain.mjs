// 第三批敵人（迫擊砲蟲／焦油蛞蝓／腐屍氣囊）與新地形（焦油泥沼／回復泉／疾風帶）的行為回歸。
// 需要已起好的靜態伺服器：python3 -m http.server 8899 --bind 127.0.0.1
//   PW_MODULE=<playwright/index.js> node tools/verify-enemies-terrain.mjs
const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game);

const out = await page.evaluate(async () => {
  const r = [];
  const ok = (name, pass, detail) => r.push({ name, pass: !!pass, detail: String(detail) });
  const imp = (p) => import(new URL(p, document.baseURI).href);
  const H = await imp('js/systems/Hazards.js');
  const { Enemy } = await imp('js/entities/Enemy.js');
  const g = window.game;
  g.ui.startScreen.classList.add('hidden');
  g.start();
  const p = g.player;
  const reset = () => { g.hazards = []; g.enemies = []; p.x = 0; p.y = 0; p.invulnerableTimer = 999; };
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(1 / 60); };

  // 地形：泥沼減速、疾風加速 (玩家與敵人都吃)
  reset();
  const base = p.speed;
  H.placeHazard(g, { type: 'tar', radius: 100, dur: 30, color: '#3d2b1f' }, 0, 0);
  const slug = new Enemy('walker', 20, 0, {}); g.enemies.push(slug);
  step();
  ok('焦油泥沼：玩家減速', Math.abs(p.speed / base - 0.55) < 0.01, `${(p.speed / base).toFixed(2)}`);
  ok('焦油泥沼：敵人減速', Math.abs(slug.speedFactor() - 0.55) < 0.01, slug.speedFactor());
  reset();
  H.placeHazard(g, { type: 'gale', radius: 100, dur: 30, color: '#fff' }, 0, 0);
  step();
  ok('疾風帶：玩家加速', Math.abs(p.speed / base - 1.45) < 0.01, `${(p.speed / base).toFixed(2)}`);
  reset(); step();
  ok('離開地形後速度恢復', Math.abs(p.speed / base - 1) < 0.01, `${(p.speed / base).toFixed(2)}`);

  // 回復泉
  reset();
  p.hp = p.maxHp - 30;
  const hp0 = p.hp;
  H.placeHazard(g, { type: 'spring', radius: 100, dur: 30, heal: 3, color: '#4cc9f0' }, 0, 0);
  step(70);
  ok('回復泉：站在裡面會回血', p.hp > hp0, `${hp0} → ${p.hp}`);

  // 迫擊砲蟲：射程內朝特工位置放預警圈；射程外不開砲
  reset();
  const m = new Enemy('mortar', 300, 0, {}); m.mortarTimer = 0; g.enemies.push(m);
  step();
  const shell = g.hazards.find((h) => h.kind === 'mine');
  ok('迫擊砲蟲：落點在特工位置、帶預警', shell && Math.hypot(shell.x - p.x, shell.y - p.y) < 5 && shell.fuse > 0.5, shell && `${Math.round(shell.x)},${Math.round(shell.y)} fuse ${shell.fuse}`);
  ok('迫擊砲蟲：死亡結算來源', shell && /迫擊砲蟲/.test(shell.source), shell?.source);
  reset();
  const far = new Enemy('mortar', 2000, 0, {}); far.mortarTimer = 0; g.enemies.push(far);
  step();
  ok('迫擊砲蟲：射程外不開砲', !g.hazards.some((h) => h.kind === 'mine'), g.hazards.length);

  // 焦油蛞蝓：留下泥沼拖痕
  reset();
  const s = new Enemy('tar_slug', 300, 300, {}); s.trailTimer = 0; g.enemies.push(s);
  step();
  ok('焦油蛞蝓：留下泥沼', g.hazards.some((h) => h.kind === 'tar'), g.hazards.map((h) => h.kind));

  // 腐屍氣囊：死亡留下毒池
  reset();
  const b = new Enemy('bloater', 200, 0, {}); g.enemies.push(b);
  g.damageEnemy(b, 1e6, 0, 0, 0);
  step(2);
  const pool = g.hazards.find((h) => h.kind === 'pool');
  ok('腐屍氣囊：死亡留下毒池', pool && Math.hypot(pool.x - 200, pool.y) < 40, pool && `${Math.round(pool.x)},${Math.round(pool.y)}`);

  // 熔岩裂隙：減速 + 灼燒
  reset();
  H.placeHazard(g, { type: 'lava', radius: 100, dur: 30, dmg: 6, dmgEnemy: 100, color: '#ff3c00' }, 0, 0);
  const mobLava = new Enemy('walker', 20, 0, {}); g.enemies.push(mobLava);
  const mobLavaHp0 = mobLava.hp;
  H.updateHazards(g, 1 / 60);
  ok('熔岩裂隙：玩家移速減緩 (0.85)', Math.abs(p.speed / base - 0.85) < 0.02, `${(p.speed / base).toFixed(2)}`);
  ok('熔岩裂隙：敵人移速減緩 (0.85)', Math.abs(mobLava.speedFactor() - 0.85) < 0.02, `${mobLava.speedFactor().toFixed(2)}`);
  for (let i = 0; i < 35; i++) H.updateHazards(g, 1 / 60);
  ok('熔岩裂隙：對踏入的敵人造成灼燒傷害', mobLava.hp < mobLavaHp0, `${mobLavaHp0} → ${mobLava.hp}`);

  // 流沙陷阱：強烈減速 + 向心牽引
  reset();
  H.placeHazard(g, { type: 'quicksand', radius: 120, dur: 30, pullSpeed: 60, color: '#d4a373' }, 0, 0);
  p.x = 60; p.y = 0;
  const sandMob = new Enemy('walker', 70, 0, {}); g.enemies.push(sandMob);
  H.updateHazards(g, 1 / 60);
  ok('流沙陷阱：玩家受到強烈減速 (0.38)', Math.abs(p.speed / base - 0.38) < 0.02, `${(p.speed / base).toFixed(2)}`);
  ok('流沙陷阱：敵人受到強烈減速 (0.38)', Math.abs(sandMob.speedFactor() - 0.38) < 0.02, `${sandMob.speedFactor().toFixed(2)}`);
  const px0 = p.x;
  for (let i = 0; i < 20; i++) H.updateHazards(g, 1 / 60);
  ok('流沙陷阱：將玩家向中心牽引', p.x < px0, `x: ${px0} → ${p.x.toFixed(1)}`);

  // 雷暴過載電場：震撼放電與眩暈
  reset();
  H.placeHazard(g, { type: 'electro', radius: 110, dur: 30, dischargeInterval: 0.25, dmg: 4, dmgEnemy: 150, color: '#00e5ff' }, 0, 0);
  const electroMob = new Enemy('walker', 30, 0, {}); g.enemies.push(electroMob);
  const electroHp0 = electroMob.hp;
  for (let i = 0; i < 16; i++) H.updateHazards(g, 1 / 60);
  ok('雷暴電場：放電震撼造成電擊傷害', electroMob.hp < electroHp0, `${electroHp0} → ${electroMob.hp}`);
  ok('雷暴電場：電擊附帶感電眩暈', electroMob.stunTimer > 0, `stunTimer: ${electroMob.stunTimer.toFixed(2)}`);

  // 聖域靈氣陣：陣內加持減傷、回血與敵方神聖制裁
  reset();
  p.hp = p.maxHp - 30;
  const pSancHp0 = p.hp;
  H.placeHazard(g, { type: 'sanctuary', radius: 120, dur: 30, heal: 4, dmgEnemy: 60, color: '#ffd700' }, 0, 0);
  const evilMob = new Enemy('walker', 40, 0, {}); g.enemies.push(evilMob);
  const evilHp0 = evilMob.hp;
  H.updateHazards(g, 1 / 60);
  ok('聖域靈氣陣：玩家獲得聖域減傷加持 (40%)', p.sanctuaryTimer > 0 && Math.abs(p.sanctuaryResist - 0.40) < 0.01, `timer: ${p.sanctuaryTimer.toFixed(2)}, resist: ${p.sanctuaryResist}`);
  ok('聖域靈氣陣：玩家不受減速限制', Math.abs(p.speed / base - 1.0) < 0.02, `${(p.speed / base).toFixed(2)}`);
  ok('聖域靈氣陣：邪惡敵人受到神聖斥力減速 (0.65)', Math.abs(evilMob.speedFactor() - 0.65) < 0.02, `${evilMob.speedFactor().toFixed(2)}`);
  for (let i = 0; i < 35; i++) H.updateHazards(g, 1 / 60);
  ok('聖域靈氣陣：陣內玩家獲得生命回復', p.hp > pSancHp0, `${pSancHp0} → ${p.hp}`);
  ok('聖域靈氣陣：陣內敵人受到神聖制裁傷害', evilMob.hp < evilHp0, `${evilHp0} → ${evilMob.hp}`);

  // 負座標也畫得出來 (曾經：Math.abs 前 h.x % 7 為負 → arc 半徑為負拋例外)
  reset();
  let drawErr = null;
  for (const type of ['tar', 'spring', 'gale', 'lava', 'quicksand', 'electro', 'sanctuary']) H.placeHazard(g, { type, radius: 80, dur: 30, heal: 1, color: '#888888' }, -123.4, -57.8);
  try { g.render(); } catch (e) { drawErr = e.message; }
  ok('新地形在負座標繪製不拋例外', !drawErr, drawErr || 'ok');
  return r;
});

let fail = out.filter((t) => !t.pass).length;
for (const t of out) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}  [${t.detail}]`);
if (pageErrors.length) { fail++; console.log('pageerror:', pageErrors); }
console.log(`\n${out.length - out.filter((t) => !t.pass).length} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
