// 怪物生成器：完全照關卡資料 (js/levels.js) 的波次與 Boss 排程操課。
// 無盡模式 (endless) 是唯一例外：波次間隔/數量隨時間成長，Boss 固定 90 秒輪播。

import { Enemy } from '../entities/Enemy.js';
import { LEVELS, currentWave, pickEnemy, enemyScale, RULE_DEFAULTS, ENDLESS_BOSS_CYCLE, ENDLESS_BOSS_INTERVAL, endlessBossInterval } from '../levels.js';
import { GAME_CONFIG } from '../config.js';
import { ELITE_AFFIXES } from '../config.js';

export const MAX_ENEMIES = 250;   // 場上敵人硬上限 (main.js 的孵化/裂解上限由此推導)

// 精英詞綴清單只算一次 (原本每生成一隻怪就 Object.keys 一次)
const ELITE_KEYS = Object.keys(ELITE_AFFIXES);

export class Spawner {
  constructor() {
    this.setLevel('street');
  }

  setLevel(levelId, rules = RULE_DEFAULTS) {
    this.level = LEVELS[levelId] || LEVELS.street;
    this.rules = rules;
    this.reset();
  }

  reset() {
    this.spawnTimer = 0;
    this.bossIndex = 0;         // 下一隻要生的 Boss 在 level.bosses 的位置 (一般關卡)
    this.bossRef = null;
    this.endlessBossIdx = 0;    // 無盡模式的 Boss 輪播指標
    this.nextEndlessBossAt = ENDLESS_BOSS_INTERVAL; // 開場 90 秒後第一隻
  }

  update(dt, gameTime, player, enemies, onBossSpawnCallback = null) {
    const level = this.level;

    // Boss 排程：無盡模式 = 固定週期輪播深淵 Boss；一般關卡 = 時間表
    if (level.id === 'endless') {
      if (gameTime >= this.nextEndlessBossAt) {
        this.nextEndlessBossAt = gameTime + endlessBossInterval(gameTime);
        const def = ENDLESS_BOSS_CYCLE[this.endlessBossIdx % ENDLESS_BOSS_CYCLE.length];
        this.endlessBossIdx++;
        // 血量與時俱進，名稱加「深淵·」前綴區隔；剝掉 final 旗標避免被誤判為通關
        this.spawnBoss(
          { ...def, final: false, hp: Math.round(def.hp * (1 + gameTime / 350)), name: '深淵·' + def.name },
          player, enemies, onBossSpawnCallback
        );
      }
    } else {
      const nextBoss = level.bosses[this.bossIndex];
      if (nextBoss && gameTime >= nextBoss.at) {
        this.bossIndex++;
        this.spawnBoss(nextBoss, player, enemies, onBossSpawnCallback);
      }
    }

    // 一般波次
    this.spawnTimer += dt;
    const wave = currentWave(level, gameTime);

    // 無盡模式：間隔隨時間縮短、單次數量增加 (有上限避免一口氣灌爆)
    const rules = this.rules || RULE_DEFAULTS;
    let interval = wave.interval;
    let batch = wave.batch;
    if (level.id === 'endless') {
      interval = Math.max(0.15, 0.55 - gameTime * 0.00055);
      batch = 1 + Math.min(5, Math.floor(gameTime / 150));
    }

    // 生成密度：直接縮短間隔 (關卡規則 / 每日詞綴共用)
    interval /= rules.spawnMul;

    if (this.spawnTimer < interval) return;
    this.spawnTimer = 0;

    if (enemies.length >= MAX_ENEMIES) return;

    // 雜兵血量與傷害隨時間、關卡難度成長 (公式集中在 levels.js)
    const scale = enemyScale(gameTime, level, rules);
    for (let i = 0; i < batch; i++) {
      // 生成距離隨時間縮短 (520 → 440)：後期玩家的清場半徑遠大於此，
      // 生得太遠等於「還沒靠近就被打掉」，威脅永遠傳不到玩家身上。
      // 但下限不能太低 —— 原本 340 在世界座標下已經落在 1280×720 視野內
      // (半對角線約 735)，後期怪物會直接在玩家眼前冒出來。
      const spawnDist = Math.max(440, 520 - gameTime * 0.12) + Math.random() * 120;
      const pos = this.getSpawnPosition(player, spawnDist);
      const e = new Enemy(pickEnemy(wave.pool), pos.x, pos.y, scale);
      this.rollElite(e, gameTime);
      enemies.push(e);
      // 每一隻都要檢查上限：原本只在迴圈外檢查一次，batch 5 時實際上限是 254，
      // 而 HATCH_ENEMY_CAP 是從名目的 250 推導的
      if (enemies.length >= MAX_ENEMIES) break;
    }
  }

  // 精英詞綴：機率隨時間從 3.5% 緩升到 10% (Boss 與召喚小怪不套用)
  rollElite(enemy, gameTime) {
    if (enemy.isBoss) return;
    // 原本 gameTime/9000 要 150 分鐘才到上限，8 分鐘只有 4% —— 一局打完幾乎看不到
    // 精英，ELITE_AFFIXES 的四種詞綴等於閒置。改成 90 秒到 8%、約 5 分半到頂。
    const chance = Math.min(0.12, 0.035 + gameTime / 2000) * (this.rules || RULE_DEFAULTS).eliteChanceMul;
    if (Math.random() >= chance) return;
    const keys = ELITE_KEYS;
    enemy.makeElite(keys[Math.floor(Math.random() * keys.length)]);
  }

  spawnBoss(def, player, enemies, onBossSpawnCallback) {
    const pos = this.getSpawnPosition(player, 550);
    const boss = new Enemy('boss', pos.x, pos.y);
    boss.maxHp = boss.hp = def.hp;
    boss.name = def.name;
    // 關卡主題外觀：一般 Boss 用該關皮膚，最終 Boss 換更大號的「最終」變體
    boss.skin = def.skin ? (def.final ? def.skin + '_final' : def.skin) : undefined;
    // 關卡專屬技能：charge 內建衝鋒，額外技能由 def.behaviors 帶入
    boss.behaviors = Array.isArray(def.behaviors) && def.behaviors.length > 0 ? def.behaviors.slice() : [];
    boss.skillTimer = 4 + Math.random() * 2;
    // 每隻 Boss 的移動與傷害由關卡資料決定。原本 12 隻 Boss 全部共用
    // ENEMY_TYPES.boss 的同一組 speed 75 / damage 28 / radius 40，彼此只差
    // 血量與技能子集 —— 「冰霜機甲」和「極地穿山甲王」打起來一模一樣。
    if (def.speed) boss.speed = def.speed;
    if (def.damage) boss.damage = def.damage;

    if (def.final) {
      boss.isFinal = true;
      boss.radius *= 1.25;
      boss.damage = Math.round(boss.damage * 1.4);
    }

    enemies.push(boss);
    this.bossRef = boss;
    if (onBossSpawnCallback) onBossSpawnCallback(boss);
  }

  getSpawnPosition(player, distance) {
    const b = GAME_CONFIG.WORLD_BOUNDS;
    const margin = 60;
    // 生成點要夾回世界邊界內 (不然怪會生在紅牆外走不進來)，但直接夾會讓貼著角落的
    // 玩家旁邊瞬間冒出怪 —— 改成換角度重抽，抽不到就取這幾次裡離玩家最遠的那個點。
    const minDist = distance * 0.6;
    let best = null;
    let bestDist = -1;

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const x = Math.max(b.minX + margin, Math.min(b.maxX - margin, player.x + Math.cos(angle) * distance));
      const y = Math.max(b.minY + margin, Math.min(b.maxY - margin, player.y + Math.sin(angle) * distance));
      const d = Math.hypot(x - player.x, y - player.y);
      if (d >= minDist) return { x, y };
      if (d > bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
    return best;
  }
}
