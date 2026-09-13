// 局內進程系統（擊殺里程碑／隨機祝福／隨機局內事件／武器協同／成就／任務目標）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 340 行，與渲染、實體更新無關 ——
// 只透過 game 物件讀寫「里程碑進度、祝福清單、事件排程、協同清單、成就統計」。
// 手法與 js/systems/Hazards.js 相同：把 game 明確當成第一個參數，
// 模組本身不持有任何遊戲狀態，依賴關係直接寫在簽章上。
//
// 呼叫端：main.js 以 checkMilestones(this, dt) 這種形式呼叫。
// shuffleInPlace 另外被主檔（升級／結算）與 Merchant 模組共用，因此一併 export。

import { WEAPONS, BLESSINGS, MINI_EVENTS, SYNERGIES, ACHIEVEMENTS, ELITE_AFFIXES } from '../config.js';
import { Enemy } from '../entities/Enemy.js';
import { DropItem } from '../entities/DropItem.js';
import { enemyScale } from '../levels.js';
import { CHARACTER_ORDER } from '../characters.js';
import { sound } from '../audio.js';
import { save } from '../save.js';

// 擊殺里程碑的間隔。固定每 100 殺的話，8 分鐘約 1430 殺 = 14 次彈窗打斷世界，
// 加上升級卡與寶箱，後期幾乎在看選單而不是在玩。改成愈後面愈稀疏。
const KILL_MILESTONES = [100, 250, 500, 900, 1400, 2000, 2700];
const KILL_MILESTONE_STEP = 900;   // 超出表格後的固定間隔

// 均勻洗牌 (Fisher-Yates)。原本三處用 sort(() => Math.random() - 0.5) ——
// 那是實作相依且有偏的，第一張牌的權重與其他張不同，於是「隨機」祝福三選一
// 與陣亡保裝都不是真的隨機。同檔 1989 行早就有正確版本，這裡統一抽出來。
export function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function nextKillMilestone(current) {
  for (const m of KILL_MILESTONES) if (m > current) return m;
  return current + KILL_MILESTONE_STEP;
}

// 事件排程：原本固定 [90,210,330,420] 只有 4 次，每局一模一樣。
// 改成隨機間隔並持續到後期，長局才不會後半段完全沒事件。
export function buildEventSchedule() {
  const out = [];
  let t = 60 + Math.random() * 30;
  while (t < 1200) {
    out.push(Math.round(t));
    t += 75 + Math.random() * 75;
  }
  return out;
}

export function checkMilestones(game, dt) {
  if (game.state !== 'PLAYING') return;
  if (game._pendingBlessings.length > 0) {
    offerBlessingChoice(game, game._pendingBlessings.shift());
    return;
  }
  while (game.kills >= game.killMilestoneAt) {
    const n = game.killMilestoneAt;
    game.killMilestoneAt = nextKillMilestone(game.killMilestoneAt);
    game._milestoneIdx++;
    if (game._milestoneIdx % 2 === 1) {
      // 奇數次 → 祝福二選一
      offerBlessingChoice(game, `擊殺 ${n}`);
    } else {
      // 偶數次 → 舊獎勵輪播
      const kinds = ['magnet', 'gold', 'heal', 'bomb'];
      grantMilestone(game, kinds[((game._milestoneIdx / 2) - 1) % 4], `擊殺 ${n}`);
    }
    if (game.state !== 'PLAYING') break;
  }
  while (game.gameTime >= game.timeMilestoneAt) {
    game.timeMilestoneAt += 120;
    grantMilestone(game, 'resupply', `存活 ${Math.round(game.gameTime / 60)} 分鐘`);
    if (game.state !== 'PLAYING') break;
  }
  // 局內事件排程
  checkEventSchedule(game, dt);
  // 商人排程 (僅生存者模式)
  game.checkMerchantSchedule(dt);
}

export function grantMilestone(game, tag, title) {
  const mul = game.goldMul();
  switch (tag) {
    case 'magnet':
      for (const d of game.dropItems) d.isAttracted = true;
      game.particles.createShockwave(game.player.x, game.player.y, 200, '#00e5ff');
      sound.playGem();
      game.ui.say(`${title}！磁力空投：全場戰利品吸收`, '#00e5ff', 2.4);
      break;
    case 'gold':
      game.gold += Math.round(80 * mul);
      sound.playGem();
      game.ui.say(`${title}！獎勵金幣 +${Math.round(80 * mul)} 🪙`, '#ffb703', 2.4);
      break;
    case 'heal':
      game.player.heal(40);
      sound.playGem();
      game.ui.say(`${title}！戰地醫療 +40 HP`, '#00f59b', 2.4);
      break;
    case 'bomb':
      game.camera.shake = Math.max(game.camera.shake, 14);
      sound.playExplosion();
      for (const e of game.enemies) {
        if (e.isBoss) e.takeDamage(300, 5, game.player.x, game.player.y);
        else e.takeDamage(9999, 10, game.player.x, game.player.y);
      }
      game.particles.createExplosion(game.player.x, game.player.y, 170);
      game.ui.say(`${title}！震撼彈支援：全場敵人重創`, '#ff0055', 2.4);
      break;
    case 'resupply':
      game.player.heal(20);
      game.gold += Math.round(40 * mul);
      sound.playGem();
      game.ui.say(`${title} — 總部後勤補給 (+20 HP / +40 🪙)`, '#9fb3c8', 2.4);
      break;
  }
}

export function offerBlessingChoice(game, title) {
  // 其他彈窗開著時先排隊，回到 PLAYING 再補發 (兩層 overlay 疊加會鎖死操作)
  if (game.state !== 'PLAYING') {
    game._pendingBlessings.push(title);
    return;
  }
  const owned = new Set(game.blessings.map((b) => b.id));
  const pool = BLESSINGS.filter((b) => !owned.has(b.id));
  if (pool.length === 0) {
    // 祝福池用完，給舊獎勵
    grantMilestone(game, 'gold', title);
    return;
  }
  // 隨機抽兩個不重複的祝福
  const shuffled = shuffleInPlace(pool.slice());
  const choices = shuffled.slice(0, Math.min(2, shuffled.length));
  game.state = 'BLESSING_MODAL';
  sound.pauseBGM();
  game.ui.showBlessingChoice(title, choices, (picked) => {
    game.state = 'PLAYING';
    sound.resumeBGM();
    applyBlessing(game, picked);
  });
}

export function applyBlessing(game, blessing) {
  game.blessings.push({ id: blessing.id, name: blessing.name, icon: blessing.icon });
  blessing.apply(game.player, this);
  game.weaponManager.applyPassives(); // 重算被動 (部分祝福改了乘數)
  game.particles.createShockwave(game.player.x, game.player.y, 200, '#b388ff');
  sound.playEvoFanfare();
  game.ui.say(`🔮 獲得祝福：${blessing.icon} ${blessing.name}`, '#b388ff', 3);
  game.ui.updateBlessings(game.blessings);
}

export function tickBlessingEffects(game, dt) {
  const p = game.player;
  // 相位護盾：每 25 秒自動 2.5 秒無敵
  if (p.blessingShieldCD > 0) {
    p.blessingShieldTimer = (p.blessingShieldTimer || 0) + dt;
    if (p.blessingShieldTimer >= p.blessingShieldCD) {
      p.blessingShieldTimer = 0;
      p.invulnerableTimer = Math.max(p.invulnerableTimer, p.blessingShieldDur);
      game.particles.createShockwave(p.x, p.y, 180, '#b388ff');
      game.ui.say('🛡️ 相位護盾啟動！', '#b388ff', 1.5);
    }
  }
  // 狂戰士：血量越低傷害越高 (30% HP 時 +60%)
  if (p.blessingBerserker) {
    const hpRatio = p.hp / p.maxHp;
    p.blessingBerserkerMul = 1 + Math.max(0, (1 - hpRatio / 0.3)) * 0.6;
  }
  // 淘金狂潮計時 (特殊卡)
  if (game._goldRushTimer > 0) {
    game._goldRushTimer -= dt;
    if (game._goldRushTimer <= 0) {
      game.ui.say('淘金狂潮結束', '#ffb703', 1.5);
    }
  }
  // 商人臨時增益計時
  for (let i = game._tempBuffs.length - 1; i >= 0; i--) {
    const b = game._tempBuffs[i];
    b.timer -= dt;
    if (b.timer <= 0) {
      b.revert(p, this);
      game._tempBuffs.splice(i, 1);
      game.weaponManager.applyPassives();
    }
  }
}

export function checkEventSchedule(game, dt) {
  if (game.activeEvent) {
    // 原本寫死 -= 1/60：30fps 時事件持續兩倍、144fps 時只剩 0.42 倍
    game.activeEvent.remaining -= dt;
    game.ui.updateEventTimer(game.activeEvent.remaining);
    if (game.activeEvent.remaining <= 0) {
      endMiniEvent(game, );
    }
    return;
  }
  if (game._eventIdx >= game._eventSchedule.length) return;
  if (game.gameTime >= game._eventSchedule[game._eventIdx]) {
    game._eventIdx++;
    triggerMiniEvent(game, );
  }
}

export function triggerMiniEvent(game) {
  // 洗牌袋：抽完一輪才重置，避免像純隨機那樣同一個事件短時間內連中兩次
  if (game._eventBag.length === 0) {
    game._eventBag = [...MINI_EVENTS];
    for (let i = game._eventBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [game._eventBag[i], game._eventBag[j]] = [game._eventBag[j], game._eventBag[i]];
    }
  }
  const evt = game._eventBag.pop();
  game.activeEvent = { ...evt, remaining: evt.duration };
  sound.playEvoFanfare();
  game.ui.say(`⚡ ${evt.icon} ${evt.name}：${evt.desc}`, evt.color, 3.5);
  game.ui.updateEventBanner(game.activeEvent);

  // 依事件類型執行觸發邏輯
  const scale = enemyScale(game.gameTime, game.level, game.rules);
  switch (evt.id) {
    case 'swarm_rush':
      // 密度翻倍靠暫時縮短 spawner 間隔 (恢復在 endMiniEvent)
      game._eventSpawnMul = game.rules.spawnMul;
      game.rules.spawnMul *= 2;
      break;
    case 'elite_hunt':
      // 場上立即生成 3 隻隨機詞綴精英
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 500 + Math.random() * 200;
        const e = new Enemy('brute',
          game.player.x + Math.cos(ang) * dist,
          game.player.y + Math.sin(ang) * dist, scale);
        const affixKeys = Object.keys(ELITE_AFFIXES);
        e.makeElite(affixKeys[Math.floor(Math.random() * affixKeys.length)]);
        e._eventElite = true; // 標記為事件精英
        game.enemies.push(e);
      }
      break;
    case 'treasure_goblin': {
      // 高速低血金色怪（用 bat 原型但改造）
      const ang = Math.random() * Math.PI * 2;
      const dist = 400;
      const goblin = new Enemy('bat',
        game.player.x + Math.cos(ang) * dist,
        game.player.y + Math.sin(ang) * dist, scale);
      goblin.hp = 30 * scale.hp;
      goblin.maxHp = goblin.hp;
      goblin.speed = 250;
      goblin._isGoblin = true;
      goblin.color = '#ffd700';
      game.enemies.push(goblin);
      break;
    }
    case 'death_march':
      // 從北方生成一排攻城巨像
      for (let i = 0; i < 4; i++) {
        const e = new Enemy('chimera',
          game.player.x - 300 + i * 200,
          game.player.y - 700, scale);
        game.enemies.push(e);
      }
      break;
    case 'crystal_rain':
      // 天降大量經驗水晶
      for (let i = 0; i < 40; i++) {
        const rx = game.player.x + (Math.random() - 0.5) * 800;
        const ry = game.player.y + (Math.random() - 0.5) * 800;
        const kind = Math.random() < 0.3 ? 'EXP_PURPLE' : 'EXP_BLUE';
        game.dropItems.push(new DropItem(rx, ry, kind));
      }
      break;
  }
}

export function endMiniEvent(game) {
  if (!game.activeEvent) return;
  const evtId = game.activeEvent.id;
  // 恢復事件修改
  if (evtId === 'swarm_rush' && game._eventSpawnMul) {
    game.rules.spawnMul = game._eventSpawnMul;
    game._eventSpawnMul = 0;
  }
  // 怪潮撐過後獎勵
  if (evtId === 'swarm_rush') {
    for (let i = 0; i < 8; i++) {
      const rx = game.player.x + (Math.random() - 0.5) * 400;
      const ry = game.player.y + (Math.random() - 0.5) * 400;
      game.dropItems.push(new DropItem(rx, ry, 'EXP_PURPLE'));
    }
    game.ui.say('🌊 怪潮結束！經驗獎勵已散落', '#ff0055', 2);
  }
  // 精英獵殺結束檢查 (不管有沒有全滅都結束)
  if (evtId === 'elite_hunt') {
    const allDead = !game.enemies.some((e) => e._eventElite && !e.isDead);
    if (allDead) {
      game.dropItems.push(new DropItem(game.player.x, game.player.y, 'CHEST'));
      game.ui.say('👑 精英全滅！幸運箱已掉落', '#ffb703', 2);
    }
  }
  // 寶藏哥布林被殺的獎勵在 spawnDropItem 裡處理（看 _isGoblin 旗標）
  game.activeEvent = null;
  game.ui.updateEventBanner(null);
}

export function checkSynergies(game) {
  const ownedWeapons = new Set(game.weaponManager.weapons.keys());
  // 超武也算它的基底武器
  for (const [id] of game.weaponManager.weapons.entries()) {
    const def = WEAPONS[id];
    if (def && def.baseWeapon) ownedWeapons.add(def.baseWeapon);
  }
  const newSynergies = [];
  for (const syn of SYNERGIES) {
    if (syn.weapons.every((w) => ownedWeapons.has(w))) {
      newSynergies.push(syn);
    }
  }
  // 檢查新觸發的協同
  const oldIds = new Set(game.activeSynergies.map((s) => s.id));
  for (const syn of newSynergies) {
    if (!oldIds.has(syn.id)) {
      game.particles.createShockwave(game.player.x, game.player.y, 200, syn.color);
      sound.playEvoFanfare();
      game.ui.say(`🌀 協同觸發：${syn.icon} ${syn.name} — ${syn.desc}`, syn.color, 3.5);
    }
  }
  game.activeSynergies = newSynergies;
  // 把協同效果注入 player
  game.player.synergies = {};
  for (const syn of newSynergies) {
    Object.assign(game.player.synergies, syn.effect);
  }
  game.ui.updateSynergies(game.activeSynergies);
}

export function checkAchievements(game, isVictory) {
  const stats = {
    levelId: game.level?.id,
    cleared: isVictory,
    time: game.gameTime,
    kills: game.kills,
    maxCombo: game._maxCombo,
    damageTaken: game._damageTaken,
    evosThisRun: game._evosThisRun,
    chestsOpened: game._chestsOpened,
    blessingsCount: game.blessings.length,
    synergiesActive: game.activeSynergies.length,
    merchantBuys: game._merchantBuys,
    isDaily: game.isDaily,
    hasGlassCannon: game.isDaily && game.dailyConfig?.modifiers.some((m) => m.id === 'glass_cannon'),
    clearedWithAllChars: false, // 需要檢查存檔
  };
  // 檢查已用全部特工通關
  if (isVictory) {
    const d = save.data;
    const charClears = new Set(d.charClears || []);
    charClears.add(game.characterId);
    d.charClears = [...charClears];
    save.flush();
    stats.clearedWithAllChars = charClears.size >= CHARACTER_ORDER.length;
  }
  const newlyUnlocked = [];
  const unlocked = new Set(save.data.achievements || []);
  for (const ach of ACHIEVEMENTS) {
    if (unlocked.has(ach.id)) continue;
    if (ach.check(stats)) {
      unlocked.add(ach.id);
      newlyUnlocked.push(ach);
      save.data.dna += ach.reward;
    }
  }
  if (newlyUnlocked.length > 0) {
    save.data.achievements = [...unlocked];
    save.flush();
  }
  return newlyUnlocked;
}

export function objectiveText(game) {
  const lv = game.level;
  if (!lv) return '';
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  if (lv.id === 'endless') {
    const wait = Math.ceil(game.spawner.nextEndlessBossAt - game.gameTime);
    return wait > 0 ? `生存挑戰：下一隻深淵首領 ${fmt(wait)}` : '深淵首領降臨 — 撐下去！';
  }
  const next = lv.bosses.find((b) => b.at > game.gameTime);
  if (next) {
    return next.final
      ? `撐到 ${fmt(next.at)}，擊敗終極首領即可通關`
      : `下一波首領：${fmt(next.at)} (${next.name})`;
  }
  const finalAlive = game.enemies.some((e) => e.isFinal && !e.isDead);
  return finalAlive ? '終極首領降臨 — 擊敗它即可通關！' : '';
}
